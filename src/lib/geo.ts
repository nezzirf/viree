/**
 * Petits outils géographiques, sans dépendance.
 * Convention : un point = [longitude, latitude, altitude?] (ordre GeoJSON).
 */

export type LngLat = [number, number];
export type TrackPoint = [number, number, number?];

const R = 6371008.8; // rayon terrestre moyen (m)
const toRad = (d: number) => (d * Math.PI) / 180;
const toDeg = (r: number) => (r * 180) / Math.PI;

/** Distance à vol d'oiseau en mètres (formule de haversine). */
export function haversine(a: readonly (number | undefined)[], b: readonly (number | undefined)[]): number {
  const [ax, ay, bx, by] = [a[0]!, a[1]!, b[0]!, b[1]!];
  const dLat = toRad(by - ay);
  const dLon = toRad(bx - ax);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(ay)) * Math.cos(toRad(by)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Point situé à `distM` mètres de `origin` dans la direction `bearingDeg` (0 = nord). */
export function destination(origin: LngLat, bearingDeg: number, distM: number): LngLat {
  const δ = distM / R;
  const θ = toRad(bearingDeg);
  const φ1 = toRad(origin[1]);
  const λ1 = toRad(origin[0]);
  const φ2 = Math.asin(Math.sin(φ1) * Math.cos(δ) + Math.cos(φ1) * Math.sin(δ) * Math.cos(θ));
  const λ2 =
    λ1 + Math.atan2(Math.sin(θ) * Math.sin(δ) * Math.cos(φ1), Math.cos(δ) - Math.sin(φ1) * Math.sin(φ2));
  return [toDeg(λ2), toDeg(φ2)];
}

/** Cap initial de a vers b, en degrés. */
export function bearing(a: LngLat, b: LngLat): number {
  const φ1 = toRad(a[1]);
  const φ2 = toRad(b[1]);
  const Δλ = toRad(b[0] - a[0]);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

/** Distances cumulées (m) le long de la trace : out[i] = distance du départ au point i. */
export function cumulativeDistances(points: readonly TrackPoint[]): number[] {
  const out = new Array<number>(points.length);
  let acc = 0;
  for (let i = 0; i < points.length; i++) {
    if (i > 0) acc += haversine(points[i - 1], points[i]);
    out[i] = acc;
  }
  return out;
}

export function trackLength(points: readonly TrackPoint[]): number {
  const c = cumulativeDistances(points);
  return c.length ? c[c.length - 1] : 0;
}

/**
 * Dénivelés positif et négatif avec hystérésis.
 * Les altitudes GPS/baromètre « tremblent » : additionner chaque micro-variation
 * gonfle le D+ de 20 à 50 %. On ne compte une variation que lorsqu'elle dépasse
 * `thresholdM` mètres par rapport au dernier point de référence.
 */
export function elevationGain(points: readonly TrackPoint[], thresholdM = 4): { ascent: number; descent: number } {
  let ascent = 0;
  let descent = 0;
  let ref: number | undefined;
  for (const p of points) {
    const e = p[2];
    if (e === undefined || Number.isNaN(e)) continue;
    if (ref === undefined) {
      ref = e;
      continue;
    }
    const d = e - ref;
    if (d >= thresholdM) {
      ascent += d;
      ref = e;
    } else if (d <= -thresholdM) {
      descent -= d;
      ref = e;
    }
  }
  return { ascent: Math.round(ascent), descent: Math.round(descent) };
}

export function hasElevation(points: readonly TrackPoint[]): boolean {
  let n = 0;
  for (const p of points) if (typeof p[2] === "number" && !Number.isNaN(p[2])) n++;
  return points.length > 0 && n / points.length > 0.8;
}

/**
 * Rééchantillonne la trace tous les `stepM` mètres (interpolation linéaire, altitude comprise).
 * Utile pour les pentes, le profil altimétrique et pour alléger le stockage.
 */
export function resample(points: readonly TrackPoint[], stepM: number): TrackPoint[] {
  if (points.length < 2) return points.slice();
  const cum = cumulativeDistances(points);
  const total = cum[cum.length - 1];
  const out: TrackPoint[] = [];
  let j = 0;
  for (let d = 0; d <= total; d += stepM) {
    while (j < cum.length - 2 && cum[j + 1] < d) j++;
    const segLen = cum[j + 1] - cum[j] || 1;
    const t = Math.min(1, Math.max(0, (d - cum[j]) / segLen));
    const a = points[j];
    const b = points[j + 1];
    const ele = a[2] !== undefined && b[2] !== undefined ? a[2] + (b[2] - a[2]) * t : undefined;
    out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, ele]);
  }
  const last = points[points.length - 1];
  if (haversine(out[out.length - 1], last) > 1) out.push([last[0], last[1], last[2]]);
  return out;
}

/** Garde au plus `max` points répartis régulièrement (pour le stockage / l'affichage). */
export function downsample<T>(points: readonly T[], max: number): T[] {
  if (points.length <= max) return points.slice();
  const out: T[] = [];
  const step = (points.length - 1) / (max - 1);
  for (let i = 0; i < max; i++) out.push(points[Math.round(i * step)]);
  return out;
}

/**
 * Point de la trace le plus proche de `p` (projection approximative sur chaque segment,
 * suffisante à l'échelle d'un segment de quelques centaines de mètres).
 * Retourne l'index du segment, la distance à la trace et la distance parcourue le long de la trace.
 * `searchFrom`/`searchTo` limitent la recherche autour de la dernière position connue :
 * indispensable pour un aller-retour, où l'aller et le retour se superposent.
 */
export function closestOnTrack(
  p: LngLat,
  points: readonly TrackPoint[],
  cum: readonly number[] = cumulativeDistances(points),
  searchFrom = 0,
  searchTo = points.length - 1,
): { index: number; offTrackM: number; alongM: number } {
  // Projection équirectangulaire locale (mètres) autour de p.
  const kx = Math.cos(toRad(p[1])) * 111320;
  const ky = 110540;
  let best = { index: 0, offTrackM: Infinity, alongM: 0 };
  for (let i = Math.max(0, searchFrom); i < Math.min(points.length - 1, searchTo); i++) {
    const ax = (points[i][0] - p[0]) * kx;
    const ay = (points[i][1] - p[1]) * ky;
    const bx = (points[i + 1][0] - p[0]) * kx;
    const by = (points[i + 1][1] - p[1]) * ky;
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy;
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2));
    const cx = ax + t * dx;
    const cy = ay + t * dy;
    const dist = Math.hypot(cx, cy);
    if (dist < best.offTrackM) {
      best = { index: i, offTrackM: dist, alongM: cum[i] + t * (cum[i + 1] - cum[i]) };
    }
  }
  return best;
}

export function bbox(points: readonly TrackPoint[]): [number, number, number, number] {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of points) {
    if (p[0] < minX) minX = p[0];
    if (p[1] < minY) minY = p[1];
    if (p[0] > maxX) maxX = p[0];
    if (p[1] > maxY) maxY = p[1];
  }
  return [minX, minY, maxX, maxY];
}

/** Arrondit une coordonnée (≈ 11 m à 4 décimales) : sert aux clés de cache. */
export const roundCoord = (v: number, decimals = 4) => Number(v.toFixed(decimals));

/**
 * Cols issus d'OpenStreetMap (via Overpass).
 *   - mountain_pass=yes : col routier ou muletier, généralement posé sur une route/un chemin
 *   - natural=saddle    : selle topographique, souvent sur un sentier → moins sûr à vélo de route
 * Seuls les éléments avec un nom et une altitude (tag ele) sont gardés.
 */
import { haversine } from "./geo";

export interface Pass {
  id: number;
  name: string;
  ele: number;
  lngLat: [number, number];
  kind: "col" | "selle";
  /** Distance à vol d'oiseau depuis le point de recherche (km) */
  distanceKm: number;
}

export function buildOverpassQuery(lat: number, lon: number, radiusM: number): string {
  const around = `(around:${Math.round(radiusM)},${lat.toFixed(4)},${lon.toFixed(4)})`;
  return `[out:json][timeout:25];
(
  node["mountain_pass"="yes"]["ele"]["name"]${around};
  node["natural"="saddle"]["ele"]["name"]${around};
);
out body 300;`;
}

/** "1 234 m", "1234;1236", "1234.5" → 1234 */
export function parseEle(raw: string | undefined): number | null {
  if (!raw) return null;
  const m = raw.replace(",", ".").replace(/\s/g, "").match(/-?\d+(\.\d+)?/);
  if (!m) return null;
  let v = Number(m[0]);
  if (/ft|'/.test(raw)) v *= 0.3048;
  return Number.isFinite(v) && v > -500 && v < 9000 ? Math.round(v) : null;
}

interface OverpassNode {
  type: string;
  id: number;
  lat: number;
  lon: number;
  tags?: Record<string, string>;
}

export function parseOverpass(json: { elements?: OverpassNode[] }, center: [number, number]): Pass[] {
  const seen = new Set<string>();
  const out: Pass[] = [];
  for (const el of json.elements ?? []) {
    if (el.type !== "node" || !el.tags) continue;
    const ele = parseEle(el.tags.ele);
    const name = el.tags["name:fr"] ?? el.tags.name;
    if (ele === null || !name) continue;
    // Doublons fréquents : le même col tagué deux fois.
    const dedupe = `${name.toLowerCase()}|${Math.round(ele / 10)}`;
    if (seen.has(dedupe)) continue;
    seen.add(dedupe);
    out.push({
      id: el.id,
      name,
      ele,
      lngLat: [el.lon, el.lat],
      kind: el.tags.mountain_pass === "yes" ? "col" : "selle",
      distanceKm: Math.round(haversine(center, [el.lon, el.lat]) / 100) / 10,
    });
  }
  return out.sort((a, b) => a.distanceKm - b.distanceKm);
}

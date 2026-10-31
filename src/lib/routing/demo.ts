/**
 * Moteur « démo » : génère des tracés géométriques avec une altitude synthétique.
 * Il ne suit PAS les routes. Il sert à développer et tester l'interface sans clé ORS
 * ni réseau (ROUTING_PROVIDER=demo).
 */
import type { Hilliness, RouteResult } from "../types";
import { ASCENT_PER_KM } from "../estimate";
import { destination, elevationGain, haversine, type LngLat, type TrackPoint } from "../geo";
import type { PointsRequest, RoundTripRequest, RoutingProvider } from "./types";

/** Générateur pseudo-aléatoire déterministe (mulberry32). */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function synthElevation(points: LngLat[], amplitude: number): TrackPoint[] {
  return points.map((p, i) => {
    const t = i / points.length;
    const ele = 200 + amplitude * (Math.sin(t * Math.PI * 2) * 0.6 + Math.sin(t * Math.PI * 7) * 0.4 + 1);
    return [p[0], p[1], Math.round(ele * 10) / 10];
  });
}

function finish(points: TrackPoint[], notice: string): RouteResult {
  let d = 0;
  for (let i = 1; i < points.length; i++) d += haversine(points[i - 1], points[i]);
  const g = elevationGain(points, 1);
  return { coordinates: points, distanceM: Math.round(d), ascentM: g.ascent, descentM: g.descent, provider: "demo", notice };
}

/** Amplitude du relief synthétique pour viser ≈ le D+/km du niveau demandé (≈ 2,9 m de D+ par unité). */
const amplitude = (h: Hilliness, lengthM: number) => (ASCENT_PER_KM[h] * lengthM) / 1000 / 2.9;

export class DemoProvider implements RoutingProvider {
  readonly name = "demo";

  async roundTrip(req: RoundTripRequest): Promise<RouteResult> {
    const rand = rng(req.seed + 1);
    // Boucle « étoilée » : un cercle de périmètre ≈ lengthM, rayon modulé par du bruit.
    const radius = req.lengthM / (2 * Math.PI) / 1.08;
    const offsetBearing = rand() * 360;
    const center = destination(req.start, offsetBearing, radius);
    const back = (offsetBearing + 180) % 360;
    const n = 240;
    const wobble = [rand(), rand(), rand()].map((v) => v * 0.25);
    const pts: LngLat[] = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const r = radius * (1 + wobble[0] * Math.sin(t * 6.28 * 2) + wobble[1] * Math.sin(t * 6.28 * 3 + 1) + wobble[2] * Math.sin(t * 6.28 * 5));
      // À t=0 et t=1, sin(...)·… = 0 sauf phase : on force le retour exact au départ.
      pts.push(i === 0 || i === n ? req.start : destination(center, back + t * 360, r));
    }
    return finish(synthElevation(pts, amplitude(req.hilliness, req.lengthM)), "Mode démo : tracé géométrique qui ne suit pas les routes.");
  }

  async route(req: PointsRequest): Promise<RouteResult> {
    const pts: LngLat[] = [];
    for (let i = 0; i < req.waypoints.length - 1; i++) {
      const a = req.waypoints[i];
      const b = req.waypoints[i + 1];
      const steps = Math.max(2, Math.round(haversine(a, b) / 200));
      for (let s = 0; s < steps; s++) {
        const t = s / steps;
        pts.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
      }
    }
    pts.push(req.waypoints[req.waypoints.length - 1]);
    let len = 0;
    for (let i = 1; i < pts.length; i++) len += haversine(pts[i - 1], pts[i]);
    return finish(synthElevation(pts, amplitude(req.hilliness, len)), "Mode démo : lignes droites entre les points.");
  }
}

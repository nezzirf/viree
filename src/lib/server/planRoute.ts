/**
 * Transforme une demande de l'app (boucle, ou col en aller-retour/boucle)
 * en appels au RoutingProvider. Fonction pure côté serveur → facile à tester.
 */
import { bearing, destination, elevationGain, hasElevation, haversine, smoothElevation } from "../geo";
import type { RouteRequest, RouteResult } from "../types";
import { RoutingError, type RoutingProvider } from "../routing/types";

export const LIMITS = { minM: 3000, maxM: 250000 };

/**
 * Point d'entrée : calcule le tracé puis recalcule le dénivelé nous-mêmes, à partir du profil
 * lissé. On n'utilise PAS le D+ renvoyé par le moteur (ORS additionne le bruit du modèle de
 * terrain et surestime nettement : ~1 300 m annoncés pour ~800 m réels sur une boucle de 92 km).
 */
export async function planRoute(req: RouteRequest, provider: RoutingProvider): Promise<RouteResult> {
  const raw = await planRawRoute(req, provider);
  const coordinates = smoothElevation(raw.coordinates);
  if (!hasElevation(coordinates)) return raw;
  const gain = elevationGain(coordinates, 3);
  return { ...raw, coordinates, ascentM: gain.ascent, descentM: gain.descent };
}

async function planRawRoute(req: RouteRequest, provider: RoutingProvider): Promise<RouteResult> {
  if (req.kind === "loop") {
    if (req.distanceM < LIMITS.minM || req.distanceM > LIMITS.maxM) {
      throw new RoutingError("BAD_REQUEST", "La distance doit être comprise entre 3 et 250 km.");
    }
    if (provider.maxRoundTripM && req.distanceM > provider.maxRoundTripM) {
      return provider.route({ waypoints: loopWaypoints(req.start, req.distanceM, req.seed), bike: req.bike, hilliness: req.hilliness });
    }
    return provider.roundTrip({
      start: req.start,
      lengthM: req.distanceM,
      bike: req.bike,
      hilliness: req.hilliness,
      seed: req.seed,
    });
  }

  const direct = haversine(req.start, req.target);
  if (direct > 120000) {
    throw new RoutingError("BAD_REQUEST", "Ce col est à plus de 120 km à vol d'oiseau : choisis-en un plus proche.");
  }

  if (req.mode === "aller-retour") {
    // Une seule requête : on calcule l'aller puis on le retourne pour le retour.
    const go = await provider.route({ waypoints: [req.start, req.target], bike: req.bike, hilliness: req.hilliness });
    const back = go.coordinates.slice(0, -1).reverse();
    return {
      ...go,
      coordinates: [...go.coordinates, ...back],
      distanceM: go.distanceM * 2,
      ascentM: go.ascentM + go.descentM,
      descentM: go.ascentM + go.descentM,
    };
  }

  // Boucle : on ajoute un point de passage de chaque côté de la ligne départ → col,
  // pour que la montée et la descente empruntent (si possible) des routes différentes.
  const b = bearing(req.start, req.target);
  const side = 0.22 + (req.seed % 5) * 0.04; // décalage latéral : 22 à 38 % de la distance
  const midGo = destination(req.start, b, direct * 0.5);
  const viaA = destination(midGo, b + 90, direct * side);
  const viaB = destination(midGo, b - 90, direct * side);
  return provider.route({
    waypoints: [req.start, viaA, req.target, viaB, req.start],
    bike: req.bike,
    hilliness: req.hilliness,
  });
}

/**
 * Boucle « manuelle » pour les longues distances : 4 points sur un cercle passant par le départ.
 * Facteur 1,25 : une route est en moyenne ~25 % plus longue que la ligne droite.
 * La graine fait tourner le cercle autour du départ (« Autre circuit »).
 */
export function loopWaypoints(start: [number, number], lengthM: number, seed: number): [number, number][] {
  const r = lengthM / (2 * Math.PI * 0.9 * 1.25);
  const heading = (seed * 47) % 360;
  const center = destination(start, heading, r);
  const back = (heading + 180) % 360;
  const pts: [number, number][] = [start];
  for (const a of [72, 144, 216, 288]) pts.push(destination(center, back + a, r) as [number, number]);
  pts.push(start);
  return pts;
}

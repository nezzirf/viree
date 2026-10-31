/**
 * Couche d'abstraction du moteur de routage.
 *
 * Pour changer de moteur (GraphHopper, BRouter, Valhalla auto-hébergé…) :
 *   1. créer un fichier qui implémente `RoutingProvider` ;
 *   2. l'enregistrer dans `./index.ts` ;
 *   3. mettre ROUTING_PROVIDER=<nom> dans l'environnement.
 * Le reste de l'app ne connaît que cette interface.
 */
import type { BikeType, Hilliness, RouteResult } from "../types";

export interface RoundTripRequest {
  start: [number, number];
  /** Longueur visée (m). Les moteurs ne garantissent qu'une approximation. */
  lengthM: number;
  bike: BikeType;
  hilliness: Hilliness;
  /** Graine : même graine = même boucle ; « Autre circuit » change la graine. */
  seed: number;
}

export interface PointsRequest {
  /** Points de passage dans l'ordre, départ et arrivée compris. */
  waypoints: [number, number][];
  bike: BikeType;
  hilliness: Hilliness;
}

export interface RoutingProvider {
  readonly name: string;
  /** Longueur max acceptée par roundTrip() ; au-delà, planRoute construit la boucle avec des points de passage. */
  readonly maxRoundTripM?: number;
  roundTrip(req: RoundTripRequest): Promise<RouteResult>;
  route(req: PointsRequest): Promise<RouteResult>;
}

export type RoutingErrorCode = "QUOTA" | "NO_ROUTE" | "CONFIG" | "UPSTREAM" | "BAD_REQUEST";

export class RoutingError extends Error {
  constructor(
    public code: RoutingErrorCode,
    message: string,
    public retryAfterS?: number,
  ) {
    super(message);
    this.name = "RoutingError";
  }
}

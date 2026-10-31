/** Types partagés entre le client et le serveur. */
import type { TrackPoint } from "./geo";

export type BikeType = "route" | "gravel" | "vtt" | "electrique";
export type Hilliness = "plat" | "vallonne" | "montagneux";

export const BIKE_LABELS: Record<BikeType, string> = {
  route: "Route",
  gravel: "Gravel",
  vtt: "VTT",
  electrique: "Électrique",
};

export const HILL_LABELS: Record<Hilliness, string> = {
  plat: "Plat",
  vallonne: "Vallonné",
  montagneux: "Montagneux",
};

/** Corps de POST /api/route */
export type RouteRequest =
  | {
      kind: "loop";
      start: [number, number];
      distanceM: number;
      bike: BikeType;
      hilliness: Hilliness;
      seed: number;
    }
  | {
      kind: "pass";
      start: [number, number];
      target: [number, number];
      mode: "aller-retour" | "boucle";
      bike: BikeType;
      hilliness: Hilliness;
      seed: number;
    };

/** Résultat d'itinéraire, indépendant du moteur utilisé. */
export interface RouteResult {
  /** [lon, lat, altitude] */
  coordinates: TrackPoint[];
  distanceM: number;
  ascentM: number;
  descentM: number;
  /** Nom du moteur : "ors", "demo"… */
  provider: string;
  /** Avertissement éventuel à afficher (ex. mode démo). */
  notice?: string;
}

/** Erreur d'API normalisée renvoyée au client. */
export interface ApiError {
  error: string;
  code: "QUOTA" | "RATE_LIMIT" | "NO_ROUTE" | "CONFIG" | "UPSTREAM" | "BAD_REQUEST";
  retryAfterS?: number;
}

/** Résultat de géocodage. */
export interface Place {
  name: string;
  label: string;
  lngLat: [number, number];
}

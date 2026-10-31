/** Modèle d'une sortie stockée localement. */
import type { TrackPoint } from "./geo";
import type { ScoreBreakdown } from "./score";

export type RideSource = "gpx" | "tcx" | "fit" | "app";

export interface Ride {
  id: string;
  name: string;
  /** Date ISO du départ */
  date: string;
  source: RideSource;
  distanceM: number;
  ascentM: number;
  /** Temps total de la sortie si connu (s) */
  durationS?: number;
  /** Trace allégée (≤ 1500 points) pour l'affichage */
  points: TrackPoint[];
  score: ScoreBreakdown;
  /** Col franchi si la sortie vient de « Vers un col » */
  colName?: string;
  /** Renseigné quand le résumé a été envoyé au classement */
  syncedAt?: string;
}

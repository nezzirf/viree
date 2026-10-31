/** Construction d'une sortie à partir d'une trace (import ou enregistrement dans l'app). */
import { downsample, hasElevation, realisticGain, trackLength, type TrackPoint } from "./geo";
import type { Ride, RideSource } from "./ride";
import { computeScore } from "./score";

/** Identifiant stable : la même sortie importée deux fois ne compte qu'une fois. */
export function rideId(date: string, distanceM: number): string {
  const s = `${date.slice(0, 16)}|${Math.round(distanceM / 100)}`;
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return `r_${(h >>> 0).toString(36)}`;
}

export function buildRide(input: {
  name: string;
  date: string;
  source: RideSource;
  points: TrackPoint[];
  durationS?: number;
  colName?: string;
}): Ride {
  const distanceM = Math.round(trackLength(input.points));
  const ascentM = hasElevation(input.points) ? realisticGain(input.points).ascent : 0;
  return {
    id: rideId(input.date, distanceM),
    name: input.name,
    date: input.date,
    source: input.source,
    distanceM,
    ascentM,
    durationS: input.durationS,
    points: downsample(input.points, 1500),
    score: computeScore(input.points, distanceM, ascentM),
    colName: input.colName,
  };
}

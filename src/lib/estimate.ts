/**
 * Estimation durée ⇄ distance.
 *
 * Modèle volontairement simple (à ajuster ici) :
 *   durée (h) = distance (km) / vitesse_plat + D+ (m) / vitesse_ascensionnelle
 *
 * Le D+ attendu dépend du niveau de dénivelé choisi (m de D+ par km).
 * Pour retrouver la distance à partir d'une durée :
 *   distance = durée / (1 / vitesse_plat + D+/km / vitesse_ascensionnelle)
 */
import type { BikeType, Hilliness } from "./types";

/** Vitesse moyenne sur le plat, km/h (cycliste loisir régulier). */
export const FLAT_SPEED_KMH: Record<BikeType, number> = {
  route: 25,
  gravel: 20,
  vtt: 14,
  electrique: 23,
};

/** Vitesse ascensionnelle, m de D+ par heure (« VAM » loisir). */
export const CLIMB_RATE_MH: Record<BikeType, number> = {
  route: 700,
  gravel: 600,
  vtt: 500,
  electrique: 1100,
};

/** D+ attendu par km selon le niveau demandé. */
export const ASCENT_PER_KM: Record<Hilliness, number> = {
  plat: 4,
  vallonne: 12,
  montagneux: 22,
};

export function estimateDurationS(distanceM: number, ascentM: number, bike: BikeType): number {
  const h = distanceM / 1000 / FLAT_SPEED_KMH[bike] + ascentM / CLIMB_RATE_MH[bike];
  return Math.round(h * 3600);
}

export function distanceForDuration(durationS: number, bike: BikeType, hill: Hilliness): number {
  const hours = durationS / 3600;
  const hPerKm = 1 / FLAT_SPEED_KMH[bike] + ASCENT_PER_KM[hill] / CLIMB_RATE_MH[bike];
  return Math.round((hours / hPerKm) * 1000);
}

export function formatDuration(s: number): string {
  const total = Math.round(s / 60); // arrondi à la minute AVANT découpage (évite « 1 h 60 »)
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m} min`;
  return `${h} h ${String(m).padStart(2, "0")}`;
}

export const formatKm = (m: number) => `${(m / 1000).toFixed(m < 10000 ? 1 : 0)} km`;

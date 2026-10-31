/**
 * Badges : chaque badge est une règle évaluée sur l'ensemble des sorties locales.
 * Ajouter un badge = ajouter une entrée dans BADGES. Les seuils sont volontairement lisibles.
 */
import type { Ride } from "./ride";

export interface Badge {
  id: string;
  title: string;
  description: string;
  emoji: string;
  earned: (rides: Ride[]) => boolean;
}

const monthKey = (iso: string) => iso.slice(0, 7);

function bestMonthKm(rides: Ride[]): number {
  const byMonth = new Map<string, number>();
  for (const r of rides) byMonth.set(monthKey(r.date), (byMonth.get(monthKey(r.date)) ?? 0) + r.distanceM / 1000);
  return Math.max(0, ...byMonth.values());
}

function ridesInAWeek(rides: Ride[]): number {
  const t = rides.map((r) => new Date(r.date).getTime()).sort((a, b) => a - b);
  let best = 0;
  for (let i = 0, j = 0; j < t.length; j++) {
    while (t[j] - t[i] > 7 * 86400000) i++;
    best = Math.max(best, j - i + 1);
  }
  return best;
}

const sum = (rides: Ride[], f: (r: Ride) => number) => rides.reduce((a, r) => a + f(r), 0);

export const BADGES: Badge[] = [
  { id: "premiere", emoji: "🚲", title: "Premier coup de pédale", description: "Enregistrer ou importer une première sortie.", earned: (r) => r.length > 0 },
  {
    id: "premier-col",
    emoji: "⛰️",
    title: "Premier col",
    description: "Franchir un col : sortie « Vers un col » ou montée d'au moins 3 km à 4 % de moyenne.",
    earned: (r) => r.some((x) => !!x.colName || !!x.score.bestClimb),
  },
  { id: "mur", emoji: "🧱", title: "Le mur", description: "Avaler au moins 500 m à plus de 10 % dans une sortie.", earned: (r) => r.some((x) => (x.score.kmByGrade["10"] ?? 0) >= 0.5) },
  { id: "d1000", emoji: "📈", title: "1 000 m de D+", description: "Grimper 1 000 m de dénivelé positif en une sortie.", earned: (r) => r.some((x) => x.ascentM >= 1000) },
  { id: "d2000", emoji: "🏔️", title: "2 000 m de D+", description: "Grimper 2 000 m de dénivelé positif en une sortie.", earned: (r) => r.some((x) => x.ascentM >= 2000) },
  { id: "century", emoji: "💯", title: "Centurion", description: "Rouler 100 km en une sortie.", earned: (r) => r.some((x) => x.distanceM >= 100000) },
  { id: "mois100", emoji: "📅", title: "100 km dans le mois", description: "Cumuler 100 km sur un même mois.", earned: (r) => bestMonthKm(r) >= 100 },
  { id: "mois500", emoji: "🔥", title: "500 km dans le mois", description: "Cumuler 500 km sur un même mois.", earned: (r) => bestMonthKm(r) >= 500 },
  { id: "regulier", emoji: "⏱️", title: "Régulier", description: "Faire 3 sorties en 7 jours.", earned: (r) => ridesInAWeek(r) >= 3 },
  { id: "total1000", emoji: "🌍", title: "1 000 km au compteur", description: "Cumuler 1 000 km depuis le début.", earned: (r) => sum(r, (x) => x.distanceM) >= 1_000_000 },
  { id: "everest", emoji: "🗻", title: "Everest", description: "Cumuler 8 849 m de D+ (la hauteur de l'Everest).", earned: (r) => sum(r, (x) => x.ascentM) >= 8849 },
  { id: "explorateur", emoji: "🧭", title: "Explorateur", description: "Enregistrer 10 sorties.", earned: (r) => r.length >= 10 },
];

export function earnedBadgeIds(rides: Ride[]): string[] {
  return BADGES.filter((b) => b.earned(rides)).map((b) => b.id);
}

/**
 * ═══════════════════════════════════════════════════════════════════════
 *  RIDE SCORE — formule (tous les réglages sont dans SCORE_RULES)
 * ═══════════════════════════════════════════════════════════════════════
 *
 *   score = distance_km × PTS_PER_KM
 *         + D+_m / M_PER_PT
 *         + Σ (km passés dans chaque tranche de pente × bonus de la tranche)
 *
 * Tranches de pente (calculées tous les 100 m, pente lissée sur 200 m) :
 *     < 4 %  : 0 pt/km      4–6 % : 2 pts/km     6–8 % : 4 pts/km
 *     8–10 % : 6 pts/km     ≥ 10 % : 10 pts/km
 *
 * Exemples :
 *   - 50 km plats, 150 m D+          ≈ 50 + 15            =  65 pts
 *   - 60 km avec un col de 10 km à 7 % (700 m D+ au total)
 *                                   ≈ 60 + 70 + 10×4     = 170 pts
 * Pourquoi ? Le D+ seul ne distingue pas 700 m « en faux plat » de 700 m raides ;
 * le bonus de pente récompense l'effort réel sans écraser la distance.
 *
 * Niveaux : le niveau N est atteint à LEVEL_BASE × (N−1)^LEVEL_EXP points cumulés.
 *   N2 = 150, N3 ≈ 424, N5 = 1 200, N10 = 4 050, N20 ≈ 12 400.
 */
import { resample, type TrackPoint } from "./geo";

export const SCORE_RULES = {
  PTS_PER_KM: 1,
  M_PER_PT: 10,
  /** [pente minimale en %, points par km] — du plus raide au moins raide */
  GRADE_BONUS: [
    [10, 10],
    [8, 6],
    [6, 4],
    [4, 2],
  ] as [number, number][],
  STEP_M: 100,
  LEVEL_BASE: 150,
  LEVEL_EXP: 1.5,
};

export interface ScoreBreakdown {
  total: number;
  distancePts: number;
  climbPts: number;
  steepPts: number;
  /** km passés au-dessus de chaque seuil : { "4": 3.2, "6": 1.1, ... } */
  kmByGrade: Record<string, number>;
  maxGrade: number;
  /** Plus longue montée « type col » (≥ 3 km à ≥ 4 % de moyenne), si trouvée */
  bestClimb?: { lengthM: number; avgGrade: number; gainM: number };
}

/** Pentes (%) tous les STEP_M mètres, lissées sur une fenêtre de 2 pas. */
export function grades(points: TrackPoint[]): { grades: number[]; samples: TrackPoint[] } {
  const step = SCORE_RULES.STEP_M;
  const s = resample(points, step).filter((p) => typeof p[2] === "number");
  const out: number[] = [];
  for (let i = 0; i < s.length - 1; i++) {
    const a = s[Math.max(0, i - 1)];
    const b = s[Math.min(s.length - 1, i + 1)];
    const span = (Math.min(s.length - 1, i + 1) - Math.max(0, i - 1)) * step;
    const g = ((b[2]! - a[2]!) / span) * 100;
    out.push(Math.max(-25, Math.min(25, g))); // plafond : au-delà c'est du bruit GPS
  }
  return { grades: out, samples: s };
}

/** Cherche la plus longue montée continue ≥ minLengthM avec une pente moyenne ≥ minGrade. */
export function bestClimb(samples: TrackPoint[], minLengthM = 3000, minGrade = 4) {
  const step = SCORE_RULES.STEP_M;
  const win = Math.round(minLengthM / step);
  let best: ScoreBreakdown["bestClimb"];
  for (let i = 0; i + win < samples.length; i++) {
    // Étend la fenêtre tant que la moyenne reste au-dessus du seuil.
    let j = i + win;
    if (((samples[j][2]! - samples[i][2]!) / (win * step)) * 100 < minGrade) continue;
    while (j + 1 < samples.length && ((samples[j + 1][2]! - samples[i][2]!) / ((j + 1 - i) * step)) * 100 >= minGrade) j++;
    const lengthM = (j - i) * step;
    const gainM = samples[j][2]! - samples[i][2]!;
    if (!best || lengthM > best.lengthM) {
      best = { lengthM, gainM: Math.round(gainM), avgGrade: Math.round((gainM / lengthM) * 1000) / 10 };
    }
    i = j; // pas de chevauchement
  }
  return best;
}

export function computeScore(points: TrackPoint[], distanceM: number, ascentM: number): ScoreBreakdown {
  const R = SCORE_RULES;
  const distancePts = (distanceM / 1000) * R.PTS_PER_KM;
  const climbPts = ascentM / R.M_PER_PT;

  const kmByGrade: Record<string, number> = Object.fromEntries(R.GRADE_BONUS.map(([g]) => [String(g), 0]));
  let steepPts = 0;
  let maxGrade = 0;
  let climb: ScoreBreakdown["bestClimb"];

  if (points.some((p) => typeof p[2] === "number")) {
    const { grades: gs, samples } = grades(points);
    for (const g of gs) {
      if (g > maxGrade) maxGrade = g;
      const tier = R.GRADE_BONUS.find(([min]) => g >= min);
      if (tier) {
        kmByGrade[String(tier[0])] += R.STEP_M / 1000;
        steepPts += (R.STEP_M / 1000) * tier[1];
      }
    }
    climb = bestClimb(samples);
  }

  for (const k of Object.keys(kmByGrade)) kmByGrade[k] = Math.round(kmByGrade[k] * 10) / 10;
  return {
    total: Math.round(distancePts + climbPts + steepPts),
    distancePts: Math.round(distancePts),
    climbPts: Math.round(climbPts),
    steepPts: Math.round(steepPts),
    kmByGrade,
    maxGrade: Math.round(maxGrade * 10) / 10,
    bestClimb: climb,
  };
}

const LEVEL_TITLES = [
  "Roue libre",
  "Promeneur",
  "Baroudeur",
  "Rouleur",
  "Grimpeur en herbe",
  "Avaleur de bosses",
  "Chasseur de cols",
  "Mollets d'acier",
  "Seigneur des lacets",
  "Légende du bitume",
];

export function levelThreshold(level: number): number {
  return Math.round(SCORE_RULES.LEVEL_BASE * Math.pow(level - 1, SCORE_RULES.LEVEL_EXP));
}

export function levelFor(totalPoints: number) {
  let level = 1;
  while (levelThreshold(level + 1) <= totalPoints) level++;
  const from = levelThreshold(level);
  const to = levelThreshold(level + 1);
  return {
    level,
    title: LEVEL_TITLES[Math.min(level - 1, LEVEL_TITLES.length - 1)],
    progress: (totalPoints - from) / (to - from),
    toNext: to - totalPoints,
  };
}

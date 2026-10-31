import { describe, expect, it } from "vitest";
import { computeScore, levelFor, levelThreshold } from "@/lib/score";
import { BADGES, earnedBadgeIds } from "@/lib/badges";
import { buildRide } from "@/lib/rides";
import { destination, type TrackPoint } from "@/lib/geo";
import type { Ride } from "@/lib/ride";

/** Ligne droite vers le nord, avec un profil d'altitude défini par une fonction de la distance (m). */
function line(lengthM: number, ele: (d: number) => number): TrackPoint[] {
  const pts: TrackPoint[] = [];
  for (let d = 0; d <= lengthM; d += 50) {
    const [lon, lat] = destination([5, 45], 0, d);
    pts.push([lon, lat, ele(d)]);
  }
  return pts;
}

describe("Ride Score", () => {
  it("plat : uniquement les points de distance", () => {
    const s = computeScore(line(50000, () => 200), 50000, 0);
    expect(s.total).toBe(50);
    expect(s.steepPts).toBe(0);
    expect(s.bestClimb).toBeUndefined();
  });

  it("col de 10 km à 7 % : D+ et bonus de pente 6–8 %", () => {
    const pts = line(10000, (d) => 500 + d * 0.07);
    const s = computeScore(pts, 10000, 700);
    expect(s.distancePts).toBe(10);
    expect(s.climbPts).toBe(70);
    expect(s.kmByGrade["6"]).toBeGreaterThan(9.5);
    expect(s.steepPts).toBeGreaterThanOrEqual(38);
    expect(s.total).toBeGreaterThanOrEqual(118);
    expect(s.bestClimb?.lengthM).toBeGreaterThanOrEqual(9800);
    expect(s.bestClimb?.avgGrade).toBeCloseTo(7, 0);
  });

  it("une rampe à 12 % rapporte plus que le même D+ à 5 %", () => {
    const steep = computeScore(line(2000, (d) => d * 0.12), 2000, 240);
    const gentle = computeScore(line(4800, (d) => d * 0.05), 4800, 240);
    expect(steep.steepPts / 2).toBeGreaterThan(gentle.steepPts / 4.8);
  });
});

describe("Niveaux", () => {
  it("seuils croissants et progression cohérente", () => {
    expect(levelThreshold(1)).toBe(0);
    expect(levelThreshold(2)).toBe(150);
    expect(levelFor(0).level).toBe(1);
    expect(levelFor(150).level).toBe(2);
    const l = levelFor(300);
    expect(l.level).toBe(2);
    expect(l.progress).toBeGreaterThan(0);
    expect(l.progress).toBeLessThan(1);
    expect(l.toNext).toBe(levelThreshold(3) - 300);
  });
});

describe("Badges", () => {
  const ride = (over: Partial<Ride>): Ride => ({
    ...buildRide({ name: "x", date: "2026-05-01T08:00:00Z", source: "gpx", points: line(1000, () => 100) }),
    ...over,
  });

  it("aucun badge sans sortie, premier badge ensuite", () => {
    expect(earnedBadgeIds([])).toEqual([]);
    expect(earnedBadgeIds([ride({})])).toContain("premiere");
  });

  it("1 000 m D+, 100 km dans le mois, régulier", () => {
    const rides = [
      ride({ id: "a", ascentM: 1200, distanceM: 40000, date: "2026-05-02T08:00:00Z" }),
      ride({ id: "b", distanceM: 35000, date: "2026-05-04T08:00:00Z" }),
      ride({ id: "c", distanceM: 30000, date: "2026-05-06T08:00:00Z" }),
    ];
    const ids = earnedBadgeIds(rides);
    expect(ids).toEqual(expect.arrayContaining(["d1000", "mois100", "regulier"]));
    expect(ids).not.toContain("century");
  });

  it("premier col via un col nommé", () => {
    expect(earnedBadgeIds([ride({ colName: "Col de Porte" })])).toContain("premier-col");
  });

  it("identifiants uniques", () => {
    expect(new Set(BADGES.map((b) => b.id)).size).toBe(BADGES.length);
  });

  it("buildRide : même sortie importée deux fois → même id", () => {
    const pts = line(5000, (d) => 100 + d * 0.02);
    const a = buildRide({ name: "a", date: "2026-05-01T08:00:00Z", source: "gpx", points: pts });
    const b = buildRide({ name: "b", date: "2026-05-01T08:00:30Z", source: "fit", points: pts });
    expect(a.id).toBe(b.id);
    expect(a.ascentM).toBeGreaterThan(90);
  });
});

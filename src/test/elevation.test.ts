import { describe, expect, it } from "vitest";
import { destination, elevationGain, realisticGain, smoothElevation, type TrackPoint } from "@/lib/geo";
import { planRoute } from "@/lib/server/planRoute";
import type { RoutingProvider } from "@/lib/routing/types";

/** Bruit pseudo-aléatoire déterministe dans [-1, 1]. */
function noise(seed: number) {
  let a = seed;
  return () => {
    a = (a * 1664525 + 1013904223) % 4294967296;
    return (a / 4294967296) * 2 - 1;
  };
}

/**
 * Boucle de 92 km, un point tous les 25 m (densité typique d'ORS).
 * Vrai relief : 4 bosses de 200 m → D+ réel = 800 m.
 * + bruit de modèle de terrain de ±6 m sur chaque point.
 */
function noisyLoop(): { pts: TrackPoint[]; trueAscent: number } {
  const rnd = noise(42);
  const pts: TrackPoint[] = [];
  const L = 92000;
  const radius = L / (2 * Math.PI);
  for (let d = 0; d <= L; d += 25) {
    const [lon, lat] = destination([5, 45], (d / L) * 360, radius);
    const truth = 300 + 100 * (1 - Math.cos((d / L) * 2 * Math.PI * 4));
    pts.push([lon, lat, truth + rnd() * 6]);
  }
  return { pts, trueAscent: 800 };
}

describe("dénivelé réaliste", () => {
  const { pts, trueAscent } = noisyLoop();

  it("la somme brute (méthode ORS) surestime fortement", () => {
    const raw = elevationGain(pts, 0).ascent;
    expect(raw).toBeGreaterThan(trueAscent * 1.5);
  });

  it("profil lissé + hystérésis : D+ à ±10 % du réel", () => {
    const { ascent } = realisticGain(pts);
    expect(ascent).toBeGreaterThan(trueAscent * 0.9);
    expect(ascent).toBeLessThan(trueAscent * 1.1);
  });

  it("ne rabote pas une vraie montée raide (col de 10 km à 8 %)", () => {
    const climb: TrackPoint[] = [];
    for (let d = 0; d <= 10000; d += 25) {
      const [lon, lat] = destination([6, 45], 0, d);
      climb.push([lon, lat, 500 + d * 0.08]);
    }
    expect(realisticGain(climb).ascent).toBeGreaterThan(780);
    expect(smoothElevation(climb).length).toBe(climb.length);
  });

  it("planRoute remplace le D+ brut du moteur par le D+ lissé", async () => {
    const fake: RoutingProvider = {
      name: "fake",
      roundTrip: async () => ({ coordinates: pts, distanceM: 92000, ascentM: 1337, descentM: 1337, provider: "fake" }),
      route: async () => { throw new Error("non utilisé"); },
    };
    const r = await planRoute({ kind: "loop", start: [5, 45], distanceM: 92000, bike: "route", hilliness: "vallonne", seed: 0 }, fake);
    expect(r.ascentM).toBeLessThan(trueAscent * 1.1);
    expect(r.ascentM).toBeGreaterThan(trueAscent * 0.9);
  });
});

import { describe, expect, it } from "vitest";
import { standing, type LeaderRow } from "@/lib/leaderboard";

const rows: LeaderRow[] = [
  { rank: 1, user_id: "a", username: "Alix", total_km: 412.3, rides: 9 },
  { rank: 2, user_id: "b", username: "Bao", total_km: 380, rides: 7 },
  { rank: 3, user_id: "c", username: "Cyd", total_km: 120.5, rides: 3 },
];

describe("standing", () => {
  it("vide", () => expect(standing([], "a", 0)).toEqual({ kind: "empty" }));
  it("en tête : avance sur le deuxième", () => expect(standing(rows, "a", 412.3)).toEqual({ kind: "leader", leadKm: 32.3 }));
  it("poursuivant classé : km manquants pour dépasser", () => expect(standing(rows, "c", 120.5)).toEqual({ kind: "chasing", missingKm: 291.9, myRank: 3 }));
  it("le total serveur prime sur les km locaux quand je suis classé", () =>
    expect(standing(rows, "b", 0)).toEqual({ kind: "chasing", missingKm: 32.4, myRank: 2 }));
  it("hors classement : utilise mes km locaux", () => expect(standing(rows, "z", 12)).toEqual({ kind: "chasing", missingKm: 400.4, myRank: null }));
});

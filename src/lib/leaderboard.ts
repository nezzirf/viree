/** Logique pure du classement (testée dans src/test). */
export interface LeaderRow {
  rank: number;
  user_id: string;
  username: string;
  total_km: number;
  rides: number;
}

export type Standing =
  | { kind: "empty" }
  | { kind: "leader"; leadKm: number | null }
  | { kind: "chasing"; missingKm: number; myRank: number | null };

/**
 * « Il te manque X km pour passer premier » :
 * il faut dépasser strictement le premier → écart + 0,1 km (précision des données).
 */
export function standing(rows: LeaderRow[], myId: string | null, myKm: number): Standing {
  if (!rows.length) return { kind: "empty" };
  const first = rows[0];
  if (myId && first.user_id === myId) {
    const second = rows[1];
    return { kind: "leader", leadKm: second ? round1(first.total_km - second.total_km) : null };
  }
  const me = rows.find((r) => r.user_id === myId);
  // Total serveur si je suis classé (fait foi, tous appareils confondus), sinon mes km locaux.
  const mine = me ? me.total_km : myKm;
  return { kind: "chasing", missingKm: round1(Math.max(0, first.total_km - mine) + 0.1), myRank: me?.rank ?? null };
}

const round1 = (n: number) => Math.round(n * 10) / 10;

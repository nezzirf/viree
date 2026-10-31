/**
 * Après l'enregistrement d'une sortie : mise à jour des badges (local) et,
 * si l'utilisateur est connecté, envoi du résumé au classement (Supabase).
 */
"use client";
import { earnedBadgeIds } from "./badges";
import { kvGet, kvSet, listRides } from "./db";
import { syncRides } from "./supabase";

/** Badges obtenus : id → date d'obtention (ISO). */
export type BadgeLedger = Record<string, string>;

export async function refreshBadges(): Promise<{ ledger: BadgeLedger; newly: string[] }> {
  const rides = await listRides();
  const ledger = (await kvGet<BadgeLedger>("badges")) ?? {};
  const newly: string[] = [];
  for (const id of earnedBadgeIds(rides)) {
    if (!ledger[id]) {
      ledger[id] = new Date().toISOString();
      newly.push(id);
    }
  }
  if (newly.length) {
    await kvSet("badges", ledger);
    // Mémorisés pour être célébrés à l'ouverture de la page Sorties.
    const pending = (await kvGet<string[]>("badgesToCelebrate")) ?? [];
    await kvSet("badgesToCelebrate", [...pending, ...newly]);
  }
  return { ledger, newly };
}

export async function afterRideSaved() {
  await refreshBadges();
  await syncRides().catch(() => {}); // sans compte : no-op
}

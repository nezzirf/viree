/**
 * Client Supabase (navigateur).
 *
 * La clé « anon » (ou publishable) est PUBLIQUE par conception : elle identifie le projet,
 * elle ne donne aucun droit en soi. Ce sont les règles RLS de supabase/schema.sql qui
 * protègent les données. Ne JAMAIS mettre la clé service_role côté client.
 *
 * Sans variables d'environnement Supabase, l'app fonctionne en mode 100 % local
 * (circuits, sorties, score, badges) ; seuls classement et sorties à plusieurs sont masqués.
 */
"use client";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { kvGet, listRides, saveRide } from "./db";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

let client: SupabaseClient | null | undefined;

export function supabase(): SupabaseClient | null {
  if (client === undefined) client = URL && KEY ? createClient(URL, KEY, { auth: { persistSession: true, detectSessionInUrl: true } }) : null;
  return client;
}

export const cloudEnabled = () => !!(URL && KEY);

export interface Profile {
  id: string;
  username: string;
  region: string;
}

export async function currentUserId(): Promise<string | null> {
  const sb = supabase();
  if (!sb) return null;
  const { data } = await sb.auth.getSession();
  return data.session?.user.id ?? null;
}

export async function getProfile(): Promise<Profile | null> {
  const sb = supabase();
  const uid = await currentUserId();
  if (!sb || !uid) return null;
  const { data } = await sb.from("profiles").select("id, username, region").eq("id", uid).maybeSingle();
  return data;
}

/**
 * Envoie au classement le RÉSUMÉ des sorties non encore synchronisées
 * (date, km, D+, score) — jamais la trace GPS, qui reste sur l'appareil.
 * Seules les sorties des 40 derniers jours comptent pour le classement mensuel.
 */
export async function syncRides(): Promise<number> {
  const sb = supabase();
  const uid = await currentUserId();
  if (!sb || !uid) return 0;
  const profile = await getProfile();
  if (!profile?.region) return 0;
  const since = Date.now() - 40 * 86400000;
  const pending = (await listRides()).filter((r) => !r.syncedAt && new Date(r.date).getTime() > since);
  if (!pending.length) return 0;
  const rows = pending.map((r) => ({
    user_id: uid,
    client_id: r.id,
    ride_date: r.date,
    distance_km: Math.round(r.distanceM / 100) / 10,
    ascent_m: r.ascentM,
    score: r.score.total,
    region: profile.region,
  }));
  const { error } = await sb.from("rides").upsert(rows, { onConflict: "user_id,client_id", ignoreDuplicates: true });
  if (error) throw error;
  const now = new Date().toISOString();
  await Promise.all(pending.map((r) => saveRide({ ...r, syncedAt: now })));
  return pending.length;
}

export async function hasPendingCelebration() {
  return ((await kvGet<string[]>("badgesToCelebrate")) ?? []).length > 0;
}

/** Retire du classement une sortie supprimée localement (si elle avait été envoyée). */
export async function unsyncRide(clientId: string) {
  const sb = supabase();
  const uid = await currentUserId();
  if (!sb || !uid) return;
  await sb.from("rides").delete().match({ user_id: uid, client_id: clientId });
}

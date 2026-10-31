/**
 * Stockage local-first (IndexedDB) : tout fonctionne sans compte.
 *   - rides      : sorties importées ou enregistrées dans l'app
 *   - kv         : réglages, départ favori, circuit en cours, badges obtenus
 *   - routeCache : circuits déjà calculés (évite de redemander au serveur → économise le quota ORS)
 */
"use client";
import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { Ride } from "./ride";
import type { RouteResult } from "./types";

interface VireeDB extends DBSchema {
  rides: { key: string; value: Ride; indexes: { byDate: string } };
  kv: { key: string; value: unknown };
  routeCache: { key: string; value: { result: RouteResult; savedAt: number } };
}

let dbPromise: Promise<IDBPDatabase<VireeDB>> | undefined;

export function db() {
  if (!dbPromise) {
    dbPromise = openDB<VireeDB>("viree", 1, {
      upgrade(d) {
        const rides = d.createObjectStore("rides", { keyPath: "id" });
        rides.createIndex("byDate", "date");
        d.createObjectStore("kv");
        d.createObjectStore("routeCache");
      },
    });
  }
  return dbPromise;
}

export async function kvGet<T>(key: string): Promise<T | undefined> {
  return (await (await db()).get("kv", key)) as T | undefined;
}
export async function kvSet(key: string, value: unknown) {
  await (await db()).put("kv", value, key);
}

export async function listRides(): Promise<Ride[]> {
  const all = await (await db()).getAllFromIndex("rides", "byDate");
  return all.reverse(); // plus récentes d'abord
}
export async function saveRide(r: Ride) {
  await (await db()).put("rides", r);
}
export async function deleteRide(id: string) {
  await (await db()).delete("rides", id);
}

const ROUTE_CACHE_TTL = 7 * 24 * 3600 * 1000;

export async function cachedRoute(key: string): Promise<RouteResult | undefined> {
  const hit = await (await db()).get("routeCache", key);
  if (!hit || Date.now() - hit.savedAt > ROUTE_CACHE_TTL) return undefined;
  return hit.result;
}
export async function storeRoute(key: string, result: RouteResult) {
  const d = await db();
  await d.put("routeCache", { result, savedAt: Date.now() }, key);
  // Garde le cache borné (~50 circuits).
  const keys = await d.getAllKeys("routeCache");
  if (keys.length > 50) await Promise.all(keys.slice(0, keys.length - 50).map((k) => d.delete("routeCache", k)));
}

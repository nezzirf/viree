/** Appels du client vers nos propres routes API (jamais directement vers ORS : la clé reste serveur). */
"use client";
import { cachedRoute, storeRoute } from "./db";
import type { ApiError, Place, RouteRequest, RouteResult } from "./types";
import type { Pass } from "./passes";

export class ApiFailure extends Error {
  constructor(public info: ApiError) {
    super(info.error);
  }
}

async function parse<T>(res: Response): Promise<T> {
  if (res.ok) return res.json() as Promise<T>;
  const info = (await res.json().catch(() => null)) as ApiError | null;
  throw new ApiFailure(info ?? { code: "UPSTREAM", error: `Erreur serveur (${res.status}).` });
}

function networkGuard<T>(p: Promise<T>): Promise<T> {
  return p.catch((e) => {
    if (e instanceof ApiFailure) throw e;
    throw new ApiFailure({ code: "UPSTREAM", error: "Pas de connexion réseau. Vérifie ta couverture et réessaie." });
  });
}

export async function fetchRoute(req: RouteRequest): Promise<RouteResult> {
  const key = JSON.stringify(req);
  const hit = await cachedRoute(key).catch(() => undefined);
  // Les tracés du moteur démo ne sont jamais réutilisés : sinon, après être passé à ORS,
  // on continuerait à voir les anciennes lignes droites pour le même départ.
  if (hit && hit.provider !== "demo") return hit;
  const result = await networkGuard(
    fetch("/api/route", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(req) }).then(
      (r) => parse<RouteResult>(r),
    ),
  );
  if (result.provider !== "demo") storeRoute(key, result).catch(() => {});
  return result;
}

export function geocode(q: string, near?: [number, number], signal?: AbortSignal): Promise<Place[]> {
  const p = new URLSearchParams({ q });
  if (near) {
    p.set("lon", String(near[0]));
    p.set("lat", String(near[1]));
  }
  return networkGuard(fetch(`/api/geocode?${p}`, { signal }).then((r) => parse<Place[]>(r)));
}

export function fetchPasses(center: [number, number], radiusKm: number): Promise<Pass[]> {
  const p = new URLSearchParams({ lon: String(center[0]), lat: String(center[1]), r: String(radiusKm) });
  return networkGuard(fetch(`/api/passes?${p}`).then((r) => parse<Pass[]>(r)));
}

export function fetchElevations(points: [number, number][]): Promise<number[]> {
  return networkGuard(
    fetch("/api/elevation", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ points }) }).then(
      (r) => parse<number[]>(r),
    ),
  );
}

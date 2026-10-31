/**
 * POST /api/route — calcule un circuit.
 * Ordre : validation → cache → rate limit → moteur.
 * Une réponse en cache ne consomme ni quota ORS ni jeton de rate limit.
 */
import { getRoutingProvider, RoutingError } from "@/lib/routing";
import { cacheKey, TtlCache } from "@/lib/server/cache";
import { apiError, isFiniteLngLat, rateLimited } from "@/lib/server/http";
import { planRoute } from "@/lib/server/planRoute";
import { clientId, RateLimiter } from "@/lib/server/rateLimit";
import { roundCoord } from "@/lib/geo";
import type { RouteRequest, RouteResult } from "@/lib/types";

const cache = new TtlCache<RouteResult>(24 * 3600 * 1000, 300);
// 6 circuits d'affilée, puis 1 toutes les 10 s par IP (≈ 6/min) : largement assez pour un humain.
const limiter = new RateLimiter(6, 6);

const BIKES = ["route", "gravel", "vtt", "electrique"];
const HILLS = ["plat", "vallonne", "montagneux"];

function normalize(body: unknown): RouteRequest | null {
  const b = body as Partial<RouteRequest> & Record<string, unknown>;
  if (!b || !isFiniteLngLat(b.start) || !BIKES.includes(b.bike as string) || !HILLS.includes(b.hilliness as string)) {
    return null;
  }
  const start: [number, number] = [roundCoord(b.start[0]), roundCoord(b.start[1])];
  const seed = Math.abs(Math.trunc(Number(b.seed) || 0)) % 1000;
  if (b.kind === "loop" && Number.isFinite(b.distanceM)) {
    // Arrondi au km : deux demandes à 41,2 et 41,4 km partagent le cache.
    const distanceM = Math.round(Number(b.distanceM) / 1000) * 1000;
    return { kind: "loop", start, distanceM, bike: b.bike!, hilliness: b.hilliness!, seed };
  }
  if (b.kind === "pass" && isFiniteLngLat(b.target) && (b.mode === "aller-retour" || b.mode === "boucle")) {
    const target: [number, number] = [roundCoord(b.target[0]), roundCoord(b.target[1])];
    return { kind: "pass", start, target, mode: b.mode, bike: b.bike!, hilliness: b.hilliness!, seed };
  }
  return null;
}

export async function POST(request: Request) {
  const req = normalize(await request.json().catch(() => null));
  if (!req) return apiError(400, { code: "BAD_REQUEST", error: "Paramètres de circuit invalides." });

  const key = cacheKey(req);
  const hit = cache.get(key);
  if (hit) return Response.json(hit, { headers: { "X-Cache": "HIT" } });

  const wait = limiter.take(clientId(request));
  if (wait) return rateLimited(wait);

  try {
    const result = await planRoute(req, getRoutingProvider());
    cache.set(key, result);
    return Response.json(result, { headers: { "X-Cache": "MISS" } });
  } catch (e) {
    if (e instanceof RoutingError) {
      const status = { QUOTA: 429, NO_ROUTE: 422, CONFIG: 503, UPSTREAM: 502, BAD_REQUEST: 400 }[e.code];
      return apiError(status, { code: e.code, error: e.message, retryAfterS: e.retryAfterS });
    }
    console.error(e);
    const timeout = e instanceof Error && e.name === "TimeoutError";
    return apiError(502, {
      code: "UPSTREAM",
      error: timeout ? "Le moteur d'itinéraires met trop de temps à répondre. Réessaie." : "Erreur inattendue du moteur d'itinéraires.",
    });
  }
}

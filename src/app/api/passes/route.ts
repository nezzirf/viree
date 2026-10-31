/**
 * GET /api/passes?lat=&lon=&r=km — cols autour d'un point via Overpass API.
 *
 * Politique d'usage d'overpass-api.de : < 10 000 requêtes/jour et < 1 Go/jour par client,
 * requêtes raisonnables. Les cols bougent rarement → cache 24 h par zone de ~5 km
 * (coordonnées arrondies à 0,05°). Une seule requête Overpass sert tous les utilisateurs du coin.
 */
import { haversine } from "@/lib/geo";
import { buildOverpassQuery, parseOverpass, type Pass } from "@/lib/passes";
import { cacheKey, TtlCache } from "@/lib/server/cache";
import { apiError, rateLimited, userAgent } from "@/lib/server/http";
import { clientId, RateLimiter } from "@/lib/server/rateLimit";

const OVERPASS_URL = process.env.OVERPASS_URL ?? "https://overpass-api.de/api/interpreter";
const cache = new TtlCache<Pass[]>(24 * 3600 * 1000, 200);
const limiter = new RateLimiter(5, 5);

const snap = (v: number) => Math.round(v * 20) / 20;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const lat = Number(url.searchParams.get("lat"));
  const lon = Number(url.searchParams.get("lon"));
  const r = Math.min(80, Math.max(10, Number(url.searchParams.get("r")) || 40));
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
    return apiError(400, { code: "BAD_REQUEST", error: "Position invalide." });
  }
  const center: [number, number] = [snap(lon), snap(lat)];
  const radius = Math.round(r / 10) * 10;
  const key = cacheKey({ center, radius });

  let passes = cache.get(key);
  if (!passes) {
    const wait = limiter.take(clientId(request));
    if (wait) return rateLimited(wait);
    try {
      const res = await fetch(OVERPASS_URL, {
        method: "POST",
        headers: { "User-Agent": userAgent(), "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ data: buildOverpassQuery(center[1], center[0], (radius + 5) * 1000) }),
        signal: AbortSignal.timeout(30000),
      });
      if (res.status === 429 || res.status === 504) {
        return apiError(503, {
          code: "QUOTA",
          error: "Le serveur public OpenStreetMap (Overpass) est saturé. Réessaie dans une minute.",
          retryAfterS: 60,
        });
      }
      if (!res.ok) throw new Error(`overpass ${res.status}`);
      passes = parseOverpass(await res.json(), center);
      cache.set(key, passes);
    } catch (e) {
      console.error(e);
      return apiError(502, { code: "UPSTREAM", error: "Impossible de charger les cols pour le moment." });
    }
  }
  // Distances recalculées depuis la vraie position (le cache est partagé par zone).
  const precise: [number, number] = [lon, lat];
  const out = passes
    .map((p) => ({ ...p, distanceKm: Math.round(haversine(precise, p.lngLat) / 100) / 10 }))
    .filter((p) => p.distanceKm <= r)
    .sort((a, b) => a.distanceKm - b.distanceKm);
  return Response.json(out);
}

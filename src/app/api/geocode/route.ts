/**
 * GET /api/geocode?q=...&lat=..&lon=.. — recherche d'adresse via Photon (komoot).
 *
 * Politique d'usage Photon / OSM : usage raisonnable, User-Agent identifiable,
 * pas d'auto-complétion agressive. D'où :
 *   - debounce de 600 ms côté client (PlaceSearch.tsx) et 3 caractères minimum ;
 *   - au plus 1 requête/seconde sortante depuis chaque instance serveur ;
 *   - cache 7 jours des recherches identiques.
 * Pour un gros trafic : héberger sa propre instance Photon, ou passer à Nominatim
 * (même limite d'1 req/s, changer PHOTON_URL n'est pas suffisant : format différent).
 */
import { cacheKey, TtlCache } from "@/lib/server/cache";
import { photonToPlace, type PhotonFeature } from "@/lib/server/photon";
import type { Place } from "@/lib/types";
import { apiError, rateLimited, userAgent } from "@/lib/server/http";
import { clientId, createThrottle, RateLimiter } from "@/lib/server/rateLimit";

const PHOTON_URL = process.env.PHOTON_URL ?? "https://photon.komoot.io";
const cache = new TtlCache<Place[]>(7 * 24 * 3600 * 1000, 1000);
const limiter = new RateLimiter(20, 20);
const throttle = createThrottle(1000);

export async function GET(request: Request) {
  const url = new URL(request.url);
  const q = (url.searchParams.get("q") ?? "").trim().slice(0, 120);
  if (q.length < 3) return Response.json([]);
  const lat = Number(url.searchParams.get("lat"));
  const lon = Number(url.searchParams.get("lon"));
  const bias = Number.isFinite(lat) && Number.isFinite(lon) && (lat || lon) ? { lat: lat.toFixed(1), lon: lon.toFixed(1) } : null;

  const key = cacheKey({ q: q.toLowerCase(), bias });
  const hit = cache.get(key);
  if (hit) return Response.json(hit);

  const wait = limiter.take(clientId(request));
  if (wait) return rateLimited(wait);

  const params = new URLSearchParams({ q, limit: "6", lang: "fr" });
  if (bias) {
    params.set("lat", bias.lat);
    params.set("lon", bias.lon);
  }
  await throttle();
  try {
    const res = await fetch(`${PHOTON_URL}/api/?${params}`, {
      headers: { "User-Agent": userAgent(), Accept: "application/json" },
      signal: AbortSignal.timeout(8000),
    });
    if (res.status === 429) return rateLimited(5);
    if (!res.ok) throw new Error(`photon ${res.status}`);
    const json = (await res.json()) as { features: PhotonFeature[] };
    const places = json.features.map(photonToPlace);
    cache.set(key, places);
    return Response.json(places);
  } catch (e) {
    console.error(e);
    return apiError(502, { code: "UPSTREAM", error: "La recherche d'adresse est indisponible pour le moment." });
  }
}

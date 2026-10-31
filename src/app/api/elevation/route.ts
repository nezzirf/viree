/**
 * POST /api/elevation { points: [lon, lat][] } → altitudes (m)
 * Utilisé pour les traces importées sans altitude.
 *
 * Open-Meteo Elevation API : gratuite pour un usage non commercial,
 * ~10 000 appels/jour, 100 coordonnées max par appel. Modèle Copernicus 90 m :
 * précis à quelques mètres près, suffisant pour un D+ approximatif.
 */
import { apiError, rateLimited } from "@/lib/server/http";
import { clientId, RateLimiter } from "@/lib/server/rateLimit";

const limiter = new RateLimiter(5, 5);

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { points?: unknown } | null;
  const pts = Array.isArray(body?.points) ? (body.points as [number, number][]) : [];
  if (!pts.length || pts.length > 100 || !pts.every((p) => Array.isArray(p) && p.every(Number.isFinite))) {
    return apiError(400, { code: "BAD_REQUEST", error: "Entre 1 et 100 points requis." });
  }
  const wait = limiter.take(clientId(request));
  if (wait) return rateLimited(wait);

  const params = new URLSearchParams({
    latitude: pts.map((p) => p[1].toFixed(5)).join(","),
    longitude: pts.map((p) => p[0].toFixed(5)).join(","),
  });
  try {
    const res = await fetch(`https://api.open-meteo.com/v1/elevation?${params}`, { signal: AbortSignal.timeout(10000) });
    if (res.status === 429) {
      return apiError(429, { code: "QUOTA", error: "Quota gratuit d'altitudes atteint pour aujourd'hui.", retryAfterS: 3600 });
    }
    if (!res.ok) throw new Error(`open-meteo ${res.status}`);
    const json = (await res.json()) as { elevation: number[] };
    return Response.json(json.elevation);
  } catch (e) {
    console.error(e);
    return apiError(502, { code: "UPSTREAM", error: "Service d'altitude indisponible." });
  }
}

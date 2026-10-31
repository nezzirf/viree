/**
 * Moteur OpenRouteService (https://openrouteservice.org).
 *
 * Offre gratuite (à vérifier sur ton tableau de bord ORS, elle évolue) :
 *   - Directions : 2 000 requêtes/jour et 40/minute (offre standard gratuite).
 *   - round_trip : 100 km maximum, et fonctionnalité qualifiée d'« expérimentale » par ORS.
 *   Chaque « Autre circuit » consomme une requête : d'où le cache côté serveur et client.
 *
 * ⚠ Code serveur uniquement : lit ORS_API_KEY.
 */
import "server-only";
import type { BikeType, Hilliness, RouteResult } from "../types";
import { elevationGain } from "../geo";
import { RoutingError, type PointsRequest, type RoundTripRequest, type RoutingProvider } from "./types";

const ORS_URL = process.env.ORS_BASE_URL ?? "https://api.openrouteservice.org";

const PROFILE: Record<BikeType, string> = {
  route: "cycling-road",
  gravel: "cycling-regular",
  vtt: "cycling-mountain",
  electrique: "cycling-electric",
};

/**
 * `steepness_difficulty` (0 à 3) : plus la valeur est haute, plus ORS accepte/recherche
 * les pentes. Ce n'est qu'une préférence : la forme d'une boucle reste aléatoire.
 */
const STEEPNESS: Record<Hilliness, number> = { plat: 0, vallonne: 1, montagneux: 3 };

interface OrsGeoJson {
  features?: {
    geometry: { coordinates: [number, number, number?][] };
    properties: { summary?: { distance?: number }; ascent?: number; descent?: number };
  }[];
  error?: { code?: number; message?: string } | string;
}

export class OrsProvider implements RoutingProvider {
  readonly name = "ors";
  /** Limite ORS documentée pour round_trip : 100 km (page « API Restrictions »). */
  readonly maxRoundTripM = 100000;

  constructor(private apiKey = process.env.ORS_API_KEY) {}

  roundTrip(req: RoundTripRequest): Promise<RouteResult> {
    // Plus il y a de points, plus la boucle est « ronde ». 3 à 5 donne des formes variées.
    const points = 3 + (req.seed % 3);
    return this.call(req.bike, req.hilliness, {
      coordinates: [req.start],
      options: { round_trip: { length: Math.round(req.lengthM), points, seed: req.seed % 90 } },
    });
  }

  route(req: PointsRequest): Promise<RouteResult> {
    return this.call(req.bike, req.hilliness, { coordinates: req.waypoints });
  }

  private async call(bike: BikeType, hill: Hilliness, body: Record<string, unknown>): Promise<RouteResult> {
    if (!this.apiKey) {
      throw new RoutingError("CONFIG", "ORS_API_KEY manquante côté serveur (voir .env.example).");
    }
    const base = { ...body, elevation: true, instructions: false, preference: "recommended" };
    const options = (body.options as Record<string, unknown> | undefined) ?? {};
    const withSteepness = {
      ...base,
      options: { ...options, profile_params: { weightings: { steepness_difficulty: STEEPNESS[hill] } } },
    };

    let res = await this.post(PROFILE[bike], withSteepness);
    // Certaines versions d'ORS refusent profile_params : on réessaie sans (1 requête de plus).
    if (res.status === 400) {
      const err = await res.clone().json().catch(() => ({}));
      const code = typeof err?.error === "object" ? err.error.code : undefined;
      if (code !== 2009 && code !== 2010) {
        res = await this.post(PROFILE[bike], { ...base, ...(Object.keys(options).length ? { options } : {}) });
      }
    }
    return this.parse(res);
  }

  private post(profile: string, body: unknown) {
    return fetch(`${ORS_URL}/v2/directions/${profile}/geojson`, {
      method: "POST",
      headers: {
        Authorization: this.apiKey!,
        "Content-Type": "application/json",
        Accept: "application/geo+json, application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20000),
    });
  }

  private async parse(res: Response): Promise<RouteResult> {
    const json = (await res.json().catch(() => ({}))) as OrsGeoJson;
    const message = typeof json.error === "object" ? json.error?.message : json.error;
    const code = typeof json.error === "object" ? json.error?.code : undefined;

    if (res.status === 429) {
      const reset = Number(res.headers.get("x-ratelimit-reset"));
      const retry = reset ? Math.max(1, Math.round(reset - Date.now() / 1000)) : 60;
      throw new RoutingError(
        "QUOTA",
        "Le quota gratuit du moteur d'itinéraires est atteint. Réessaie dans quelques minutes (ou demain si le quota du jour est épuisé).",
        retry,
      );
    }
    if (res.status === 401 || res.status === 403) {
      throw new RoutingError("CONFIG", "Clé OpenRouteService refusée ou quota journalier épuisé.");
    }
    if (code === 2009 || code === 2010 || res.status === 404) {
      throw new RoutingError(
        "NO_ROUTE",
        "Aucun itinéraire cyclable trouvé depuis ce point. Déplace un peu le départ ou change de type de vélo.",
      );
    }
    if (!res.ok || !json.features?.length) {
      throw new RoutingError("UPSTREAM", `OpenRouteService a renvoyé une erreur (${res.status}) ${message ?? ""}`.trim());
    }

    const f = json.features[0];
    const coords = f.geometry.coordinates;
    const gain = elevationGain(coords, 2);
    return {
      coordinates: coords,
      distanceM: Math.round(f.properties.summary?.distance ?? 0),
      ascentM: Math.round(f.properties.ascent ?? gain.ascent),
      descentM: Math.round(f.properties.descent ?? gain.descent),
      provider: this.name,
    };
  }
}

import type { ApiError } from "../types";

export function apiError(status: number, body: ApiError): Response {
  const headers: Record<string, string> = {};
  if (body.retryAfterS) headers["Retry-After"] = String(body.retryAfterS);
  return Response.json(body, { status, headers });
}

export function rateLimited(retryAfterS: number): Response {
  return apiError(429, {
    code: "RATE_LIMIT",
    error: `Doucement ! Trop de demandes en peu de temps. Réessaie dans ${retryAfterS} s.`,
    retryAfterS,
  });
}

/** User-Agent identifiable : exigé par les politiques d'usage d'OSM, Photon et Overpass. */
export function userAgent(): string {
  const contact = process.env.CONTACT_EMAIL ? ` (${process.env.CONTACT_EMAIL})` : "";
  return `Viree/0.1 bike-loop-planner${contact}`;
}

export const isFiniteLngLat = (v: unknown): v is [number, number] =>
  Array.isArray(v) &&
  v.length === 2 &&
  Number.isFinite(v[0]) &&
  Number.isFinite(v[1]) &&
  Math.abs(v[0]) <= 180 &&
  Math.abs(v[1]) <= 90;

/** Conversion des résultats Photon (GeoJSON) en lieux simples. */
import type { Place } from "../types";

export interface PhotonFeature {
  geometry: { coordinates: [number, number] };
  properties: Record<string, string | undefined>;
}

export function photonToPlace(f: PhotonFeature): Place {
  const p = f.properties;
  const street = [p.housenumber, p.street].filter(Boolean).join(" ");
  const label = [p.postcode, p.city ?? p.town ?? p.village, p.state, p.country].filter(Boolean).join(", ");
  return { name: p.name ?? (street || label || "Lieu"), label, lngLat: f.geometry.coordinates };
}

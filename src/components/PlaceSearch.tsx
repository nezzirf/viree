"use client";
/**
 * Choix du point de départ : position GPS ou recherche d'adresse.
 * Debounce de 600 ms + annulation de la requête précédente : on n'envoie qu'une
 * requête quand l'utilisateur fait une pause, ce qui respecte la limite d'1 req/s de Photon.
 */
import { useEffect, useRef, useState } from "react";
import { ApiFailure, geocode } from "@/lib/api";
import type { Place } from "@/lib/types";

interface Props {
  label?: string;
  value: { lngLat: [number, number]; label: string } | null;
  onChange: (v: { lngLat: [number, number]; label: string }) => void;
}

export function PlaceSearch({ label = "Départ", value, onChange }: Props) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Place[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(!value);
  const ctrl = useRef<AbortController | null>(null);
  const visible = q.trim().length >= 3 ? results : [];

  useEffect(() => {
    if (q.trim().length < 3) return;
    const t = setTimeout(async () => {
      ctrl.current?.abort();
      ctrl.current = new AbortController();
      try {
        setResults(await geocode(q, value?.lngLat, ctrl.current.signal));
        setError(null);
      } catch (e) {
        if ((e as Error).name !== "AbortError") setError(e instanceof ApiFailure ? e.message : "Recherche impossible.");
      }
    }, 600);
    return () => clearTimeout(t);
  }, [q, value?.lngLat]);

  function locate() {
    if (!("geolocation" in navigator)) {
      setError("La géolocalisation n'est pas disponible sur cet appareil.");
      return;
    }
    setBusy(true);
    setError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setBusy(false);
        onChange({ lngLat: [pos.coords.longitude, pos.coords.latitude], label: "Ma position" });
        setEditing(false);
      },
      (err) => {
        setBusy(false);
        setError(err.code === 1 ? "Accès à la position refusé. Autorise-le dans ton navigateur ou cherche une adresse." : "Position introuvable pour l'instant.");
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 },
    );
  }

  if (!editing && value) {
    return (
      <div>
        <span className="label">{label}</span>
        <button type="button" onClick={() => setEditing(true)} className="field flex items-center justify-between text-left">
          <span className="truncate">{value.label}</span>
          <span className="ml-2 shrink-0 text-base text-lime">Modifier</span>
        </button>
      </div>
    );
  }

  return (
    <div className="relative">
      <label className="label" htmlFor="place-q">{label}</label>
      <div className="flex gap-2">
        <input
          id="place-q"
          className="field"
          placeholder="Adresse, ville…"
          autoComplete="off"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <button type="button" className="btn-ghost shrink-0 px-4" onClick={locate} disabled={busy} aria-label="Utiliser ma position">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v3m0 14v3M2 12h3m14 0h3" />
          </svg>
          {busy ? "…" : "GPS"}
        </button>
      </div>
      {error && <p role="alert" className="mt-2 text-base text-coral">{error}</p>}
      {visible.length > 0 && (
        <ul className="absolute inset-x-0 z-20 mt-2 overflow-hidden rounded-2xl border border-line bg-raised shadow-xl">
          {visible.map((r, i) => (
            <li key={i}>
              <button
                type="button"
                className="block min-h-14 w-full px-4 py-2 text-left hover:bg-line"
                onClick={() => {
                  onChange({ lngLat: r.lngLat, label: r.name });
                  setQ("");
                  setResults([]);
                  setEditing(false);
                }}
              >
                <span className="block font-semibold">{r.name}</span>
                <span className="block text-sm text-mute">{r.label}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-2 text-sm text-mute">Astuce : tu peux aussi toucher la carte pour placer le départ.</p>
    </div>
  );
}

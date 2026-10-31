"use client";
/** « Vers un col » : cols OSM autour du départ, puis aller-retour ou boucle. */
import { useEffect, useState } from "react";
import { useApp } from "@/components/AppState";
import { Chips } from "@/components/Chips";
import { Map } from "@/components/Map";
import { PlaceSearch } from "@/components/PlaceSearch";
import { RouteCard } from "@/components/RouteCard";
import { ApiFailure, fetchPasses, fetchRoute } from "@/lib/api";
import type { Pass } from "@/lib/passes";
import { BIKE_LABELS, type BikeType } from "@/lib/types";

type Mode = "aller-retour" | "boucle";

export default function Cols() {
  const { start, setStart, route, setRoute } = useApp();
  const [radius, setRadius] = useState<"20" | "40" | "60">("40");
  const [roadOnly, setRoadOnly] = useState(true);
  const [passes, setPasses] = useState<Pass[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Pass | null>(null);
  const [mode, setMode] = useState<Mode>("boucle");
  const [bike, setBike] = useState<BikeType>("route");
  const [seed, setSeed] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hl, setHl] = useState<[number, number] | null>(null);

  useEffect(() => {
    if (!start) return;
    let stale = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- indicateur de chargement lié à la requête
    setLoading(true);
    setError(null);
    fetchPasses(start.lngLat, Number(radius))
      .then((p) => !stale && setPasses(p))
      .catch((e) => !stale && setError(e instanceof ApiFailure ? e.message : "Impossible de charger les cols."))
      .finally(() => !stale && setLoading(false));
    return () => {
      stale = true;
    };
  }, [start, radius]);

  const shown = (passes ?? []).filter((p) => !roadOnly || p.kind === "col");
  const showRoute = route?.colName && route.colName === selected?.name;

  async function trace(nextSeed = 0) {
    if (!start || !selected) return;
    setBusy(true);
    setError(null);
    try {
      const result = await fetchRoute({ kind: "pass", start: start.lngLat, target: selected.lngLat, mode, bike, hilliness: "montagneux", seed: nextSeed });
      setRoute({ result, title: `${selected.name} (${selected.ele} m) — ${mode}`, bike, hilliness: "montagneux", colName: selected.name });
    } catch (e) {
      setError(e instanceof ApiFailure ? e.message : "Impossible de tracer ce col.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-xl">
      <div className="sticky top-[var(--header-h)] z-0 mt-[var(--header-h)] h-[40vh] min-h-64 w-full">
        <Map
          route={showRoute ? route.result.coordinates : null}
          start={start?.lngLat}
          highlight={hl}
          passes={shown.map((p) => ({ ...p, selected: p.id === selected?.id }))}
          onPassClick={(id) => setSelected(shown.find((p) => p.id === id) ?? null)}
          onMapClick={(ll) => setStart({ lngLat: ll, label: `Point choisi (${ll[1].toFixed(4)}, ${ll[0].toFixed(4)})` })}
          fitKey={`${showRoute ? route.result.distanceM : "p"}-${shown.length}-${start?.lngLat.join()}`}
        />
      </div>

      <div className="relative z-10 -mt-6 space-y-4 rounded-t-3xl bg-night px-4 pt-5">
        <section className="card space-y-4">
          <h1 className="text-2xl font-extrabold">Vers un col</h1>
          <PlaceSearch value={start} onChange={setStart} />
          <Chips label="Rayon de recherche" options={{ "20": "20 km", "40": "40 km", "60": "60 km" }} value={radius} onChange={setRadius} />
          <label className="flex min-h-12 items-center gap-3 text-base">
            <input type="checkbox" checked={roadOnly} onChange={(e) => setRoadOnly(e.target.checked)} className="h-6 w-6 accent-[#D4FF3A]" />
            Seulement les cols (exclure les selles de sentier)
          </label>
        </section>

        {error && <p role="alert" className="rounded-xl border border-coral/50 bg-coral/10 p-3 text-coral">{error}</p>}

        {selected && (
          <section className="card animate-rise space-y-4">
            <h2 className="text-xl font-bold">
              {selected.name} <span className="text-coral">{selected.ele} m</span>
            </h2>
            <p className="text-mute">À {selected.distanceKm} km à vol d&apos;oiseau.</p>
            <Chips label="Parcours" options={{ boucle: "Boucle", "aller-retour": "Aller-retour" }} value={mode} onChange={setMode} />
            <Chips label="Vélo" options={BIKE_LABELS} value={bike} onChange={setBike} />
            <button type="button" className="btn-primary w-full" onClick={() => { setSeed(0); trace(0); }} disabled={busy}>
              {busy ? "Calcul…" : "Tracer vers ce col"}
            </button>
          </section>
        )}

        {showRoute && (
          <RouteCard
            route={route}
            onHover={setHl}
            regenerating={busy}
            onRegenerate={mode === "boucle" ? () => { const s = seed + 1; setSeed(s); trace(s); } : undefined}
          />
        )}

        <section aria-label="Liste des cols" className="space-y-2">
          {!start && <p className="text-mute">Choisis un départ pour voir les cols autour.</p>}
          {loading && <p className="text-mute">Recherche des cols dans OpenStreetMap…</p>}
          {passes && !loading && shown.length === 0 && <p className="text-mute">Aucun col référencé dans ce rayon. Essaie un rayon plus grand.</p>}
          <ul className="space-y-2">
            {shown.slice(0, 60).map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => setSelected(p)}
                  aria-pressed={p.id === selected?.id}
                  className={`flex min-h-16 w-full items-center justify-between rounded-2xl px-4 py-3 text-left ${p.id === selected?.id ? "bg-lime text-night" : "bg-surface"}`}
                >
                  <span>
                    <span className="block font-semibold">{p.name}</span>
                    <span className={`text-sm ${p.id === selected?.id ? "text-night/80" : "text-mute"}`}>
                      {p.distanceKm} km · {p.kind === "col" ? "col" : "selle (souvent sentier)"}
                    </span>
                  </span>
                  <span className="text-xl font-extrabold tabular-nums">{p.ele} m</span>
                </button>
              </li>
            ))}
          </ul>
          <p className="pt-2 text-xs text-mute">Données © contributeurs OpenStreetMap (ODbL), via Overpass API.</p>
        </section>
        <div className="h-4" />
      </div>
    </div>
  );
}

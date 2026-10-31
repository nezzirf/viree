"use client";
/** Page d'accueil : générateur de boucle. */
import { useState } from "react";
import { useApp } from "@/components/AppState";
import { Chips } from "@/components/Chips";
import { Map } from "@/components/Map";
import { PlaceSearch } from "@/components/PlaceSearch";
import { RouteCard } from "@/components/RouteCard";
import { ApiFailure, fetchRoute } from "@/lib/api";
import { ASCENT_PER_KM, distanceForDuration, formatDuration } from "@/lib/estimate";
import { BIKE_LABELS, HILL_LABELS, type BikeType, type Hilliness } from "@/lib/types";

type Mode = "duree" | "distance";

export default function Home() {
  const { start, setStart, route, setRoute } = useApp();
  const [mode, setMode] = useState<Mode>("duree");
  const [minutes, setMinutes] = useState(120);
  const [km, setKm] = useState(50);
  const [bike, setBike] = useState<BikeType>("route");
  const [hill, setHill] = useState<Hilliness>("vallonne");
  // Graine 0 au premier calcul : même départ + mêmes réglages = même boucle (servie depuis le cache).
  // « Autre circuit » change la graine.
  const [seed, setSeed] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hl, setHl] = useState<[number, number] | null>(null);

  const distanceM = mode === "duree" ? distanceForDuration(minutes * 60, bike, hill) : km * 1000;

  async function generate(nextSeed = seed) {
    if (!start) {
      setError("Choisis d'abord un point de départ.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await fetchRoute({ kind: "loop", start: start.lngLat, distanceM, bike, hilliness: hill, seed: nextSeed });
      setRoute({ result, title: `Boucle de ${Math.round(result.distanceM / 1000)} km`, bike, hilliness: hill });
    } catch (e) {
      setError(e instanceof ApiFailure ? e.message : "Impossible de calculer le circuit.");
    } finally {
      setBusy(false);
    }
  }

  function other() {
    const s = (seed + 1 + Math.floor(Math.random() * 20)) % 1000;
    setSeed(s);
    generate(s);
  }

  return (
    <div className="mx-auto max-w-xl">
      <div className="sticky top-[var(--header-h)] z-0 mt-[var(--header-h)] h-[40vh] min-h-64 w-full">
        <Map
          route={route?.result.coordinates}
          start={start?.lngLat}
          highlight={hl}
          fitKey={`${route?.result.distanceM}-${route?.result.coordinates.length}-${start?.lngLat.join()}`}
          onMapClick={(ll) => setStart({ lngLat: ll, label: `Point choisi (${ll[1].toFixed(4)}, ${ll[0].toFixed(4)})` })}
        />
      </div>

      <div className="relative z-10 -mt-6 space-y-4 rounded-t-3xl bg-night px-4 pt-5">
        {route && <RouteCard route={route} onRegenerate={other} regenerating={busy} onHover={setHl} targetAscentM={Math.round((route.result.distanceM / 1000) * ASCENT_PER_KM[route.hilliness])} />}

        <form
          className="card space-y-5"
          onSubmit={(e) => {
            e.preventDefault();
            setSeed(0);
            generate(0);
          }}
        >
          <h1 className="text-2xl font-extrabold">Où roule-t-on aujourd&apos;hui ?</h1>
          <PlaceSearch value={start} onChange={setStart} />

          <Chips label="Je choisis" options={{ duree: "Une durée", distance: "Une distance" }} value={mode} onChange={setMode} />

          {mode === "duree" ? (
            <div>
              <label htmlFor="dur" className="label">
                Temps dispo : <span className="text-ink">{formatDuration(minutes * 60)}</span>
              </label>
              <input id="dur" type="range" min={30} max={360} step={15} value={minutes} onChange={(e) => setMinutes(Number(e.target.value))} className="h-10 w-full accent-[#D4FF3A]" />
              <p className="text-sm text-mute">≈ {Math.round(distanceM / 1000)} km avec ce vélo et ce relief</p>
            </div>
          ) : (
            <div>
              <label htmlFor="km" className="label">
                Distance : <span className="text-ink">{km} km</span>
              </label>
              <input id="km" type="range" min={10} max={200} step={5} value={km} onChange={(e) => setKm(Number(e.target.value))} className="h-10 w-full accent-[#D4FF3A]" />
            </div>
          )}

          <Chips label="Vélo" options={BIKE_LABELS} value={bike} onChange={setBike} />
          <Chips label="Dénivelé" options={HILL_LABELS} value={hill} onChange={setHill} />

          {error && (
            <p role="alert" className="rounded-xl border border-coral/50 bg-coral/10 p-3 text-base text-coral">
              {error}
            </p>
          )}
          <button type="submit" className="btn-primary w-full text-xl" disabled={busy}>
            {busy ? "Calcul du circuit…" : "Tracer ma boucle"}
          </button>
        </form>
        <div className="h-4" />
      </div>
    </div>
  );
}

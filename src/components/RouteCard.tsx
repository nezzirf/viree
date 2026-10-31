"use client";
import Link from "next/link";
import { useMemo } from "react";
import { estimateDurationS, formatDuration, formatKm } from "@/lib/estimate";
import { downloadGpx } from "@/lib/gpx";
import { computeScore } from "@/lib/score";
import type { CurrentRoute } from "./AppState";
import { ElevationProfile } from "./ElevationProfile";

interface Props {
  route: CurrentRoute;
  onRegenerate?: () => void;
  regenerating?: boolean;
  onHover?: (lngLat: [number, number] | null) => void;
  /** D+ visé, pour prévenir si le circuit s'en écarte beaucoup */
  targetAscentM?: number;
}

export function Stat({ value, label, accent }: { value: string; label: string; accent?: string }) {
  return (
    <div className="rounded-2xl bg-raised p-3 text-center">
      <div className={`text-2xl font-extrabold tabular-nums ${accent ?? "text-ink"}`}>{value}</div>
      <div className="text-sm text-mute">{label}</div>
    </div>
  );
}

export function RouteCard({ route, onRegenerate, regenerating, onHover, targetAscentM }: Props) {
  const r = route.result;
  const duration = estimateDurationS(r.distanceM, r.ascentM, route.bike);
  const score = useMemo(() => computeScore(r.coordinates, r.distanceM, r.ascentM), [r]);
  const far = targetAscentM !== undefined && targetAscentM > 0 && Math.abs(r.ascentM - targetAscentM) / targetAscentM > 0.5;

  return (
    <section className="card animate-rise space-y-4" aria-live="polite">
      <header className="flex items-baseline justify-between gap-2">
        <h2 className="text-xl font-bold">{route.title}</h2>
        <span className="shrink-0 rounded-full bg-raised px-3 py-1 text-sm font-semibold text-lime">≈ {score.total} pts</span>
      </header>
      <div className="grid grid-cols-3 gap-2">
        <Stat value={formatKm(r.distanceM)} label="distance" />
        <Stat value={`${r.ascentM} m`} label="D+" accent="text-coral" />
        <Stat value={formatDuration(duration)} label="estimé" />
      </div>
      {r.notice && <p className="rounded-xl bg-raised p-3 text-sm text-mute">{r.notice}</p>}
      {far && (
        <p className="text-sm text-mute">
          Le dénivelé s&apos;écarte de ce que tu voulais (≈ {targetAscentM} m) : essaie « Autre circuit ».
        </p>
      )}
      <ElevationProfile points={r.coordinates} onHover={onHover} />
      <div className="grid grid-cols-2 gap-2">
        {onRegenerate && (
          <button type="button" className="btn-ghost col-span-2" onClick={onRegenerate} disabled={regenerating}>
            {regenerating ? "Calcul…" : "↻ Autre circuit"}
          </button>
        )}
        <button type="button" className="btn-ghost" onClick={() => downloadGpx(route.title, r.coordinates)}>
          ⤓ GPX
        </button>
        <Link href="/suivre" className="btn-primary">
          ▶ Suivre
        </Link>
      </div>
    </section>
  );
}

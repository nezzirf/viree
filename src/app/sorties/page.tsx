"use client";
/** Sorties : import GPX/TCX/FIT, historique, Ride Score, niveau et badges. Tout est local. */
import { useCallback, useEffect, useRef, useState } from "react";
import { useNow } from "@/components/useNow";
import { fetchElevations } from "@/lib/api";
import { BADGES } from "@/lib/badges";
import { deleteRide, kvGet, kvSet, listRides, saveRide } from "@/lib/db";
import { formatDuration, formatKm } from "@/lib/estimate";
import { downsample, hasElevation, resample, trackLength, type TrackPoint } from "@/lib/geo";
import { downloadGpx } from "@/lib/gpx";
import { parseActivityFile } from "@/lib/parsers";
import { afterRideSaved, refreshBadges, type BadgeLedger } from "@/lib/progress";
import type { Ride } from "@/lib/ride";
import { buildRide } from "@/lib/rides";
import { levelFor, SCORE_RULES } from "@/lib/score";
import { unsyncRide } from "@/lib/supabase";

/**
 * Trace sans altitude (fréquent avec certains exports) : on demande l'altitude de ≤ 100 points
 * répartis régulièrement (1 seul appel à Open-Meteo). Le D+ obtenu est approximatif.
 */
async function ensureElevation(points: TrackPoint[]): Promise<TrackPoint[]> {
  if (hasElevation(points)) return points;
  const step = Math.max(50, trackLength(points) / 99);
  const sampled = downsample(resample(points, step), 100);
  const eles = await fetchElevations(sampled.map((p) => [p[0], p[1]]));
  return sampled.map((p, i) => [p[0], p[1], eles[i]]);
}

export default function Sorties() {
  const [rides, setRides] = useState<Ride[]>([]);
  const [ledger, setLedger] = useState<BadgeLedger>({});
  const [celebrate, setCelebrate] = useState<string[]>([]);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const now = useNow();

  const reload = useCallback(async () => {
    setRides(await listRides());
    const { ledger: l } = await refreshBadges();
    setLedger(l);
    const pending = (await kvGet<string[]>("badgesToCelebrate")) ?? [];
    if (pending.length) {
      setCelebrate(pending);
      await kvSet("badgesToCelebrate", []);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- chargement initial depuis IndexedDB
    reload();
  }, [reload]);

  async function onFiles(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    setMsg(null);
    const existing = new Set(rides.map((r) => r.id));
    let added = 0;
    const errors: string[] = [];
    for (const file of Array.from(files)) {
      try {
        const a = await parseActivityFile(file);
        const points = await ensureElevation(a.points);
        const ride = buildRide({ name: a.name, date: a.date, source: file.name.split(".").pop()!.toLowerCase() as Ride["source"], points, durationS: a.durationS });
        if (existing.has(ride.id)) {
          errors.push(`${file.name} : déjà importée.`);
          continue;
        }
        await saveRide(ride);
        existing.add(ride.id);
        added++;
      } catch (e) {
        errors.push(`${file.name} : ${(e as Error).message}`);
      }
    }
    if (added) await afterRideSaved().catch(() => {});
    await reload();
    setBusy(false);
    setMsg({ ok: errors.length === 0, text: [added ? `${added} sortie(s) importée(s).` : "", ...errors].filter(Boolean).join(" ") });
    if (input.current) input.current.value = "";
  }

  const total = rides.reduce((a, r) => a + r.score.total, 0);
  const lvl = levelFor(total);
  const month = now ? now.toISOString().slice(0, 7) : "-";
  const monthKm = rides.filter((r) => r.date.startsWith(month)).reduce((a, r) => a + r.distanceM, 0);

  return (
    <div className="mx-auto max-w-xl space-y-4 px-4 pt-20">
      {celebrate.length > 0 && (
        <div role="status" className="card animate-rise border border-lime">
          <p className="text-lg font-bold text-lime">Nouveau badge !</p>
          <ul className="mt-1">
            {celebrate.map((id) => {
              const b = BADGES.find((x) => x.id === id);
              return b ? <li key={id} className="text-lg">{b.emoji} {b.title}</li> : null;
            })}
          </ul>
          <button type="button" className="btn-ghost mt-3 w-full" onClick={() => setCelebrate([])}>Super !</button>
        </div>
      )}

      <section className="card space-y-3" aria-label="Niveau">
        <div className="flex items-baseline justify-between">
          <h1 className="text-2xl font-extrabold">Niveau {lvl.level}</h1>
          <span className="text-lg font-bold text-lime tabular-nums">{total} pts</span>
        </div>
        <p className="text-lg">{lvl.title}</p>
        <div className="h-4 overflow-hidden rounded-full bg-raised" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(lvl.progress * 100)} aria-label="Progression vers le niveau suivant">
          <div className="h-full rounded-full bg-lime transition-[width]" style={{ width: `${Math.round(lvl.progress * 100)}%` }} />
        </div>
        <p className="text-sm text-mute">Encore {lvl.toNext} pts pour le niveau {lvl.level + 1} · {formatKm(monthKm)} ce mois-ci</p>
      </section>

      <section className="card space-y-3">
        <h2 className="text-xl font-bold">Importer une sortie</h2>
        <p className="text-mute">Fichiers .gpx, .tcx ou .fit de ton compteur ou de ton appli. Ils restent sur ton téléphone.</p>
        <input ref={input} type="file" accept=".gpx,.tcx,.fit" multiple className="sr-only" id="file" onChange={(e) => onFiles(e.target.files)} />
        <label htmlFor="file" className={`btn-primary w-full cursor-pointer ${busy ? "pointer-events-none opacity-50" : ""}`}>
          {busy ? "Import en cours…" : "Choisir des fichiers"}
        </label>
        {msg && <p role="status" className={msg.ok ? "text-lime" : "text-coral"}>{msg.text}</p>}
      </section>

      <section className="card" aria-label="Badges">
        <h2 className="mb-3 text-xl font-bold">Badges · {Object.keys(ledger).length}/{BADGES.length}</h2>
        <ul className="grid grid-cols-3 gap-2">
          {BADGES.map((b) => {
            const got = !!ledger[b.id];
            return (
              <li key={b.id} className={`rounded-2xl p-3 text-center ${got ? "bg-raised" : "bg-raised/40"}`} title={b.description}>
                <div className={`text-3xl ${got ? "" : "opacity-30 grayscale"}`} aria-hidden="true">{b.emoji}</div>
                <div className={`mt-1 text-xs font-semibold ${got ? "text-ink" : "text-mute"}`}>{b.title}</div>
                <span className="sr-only">{got ? "obtenu" : "à débloquer"} : {b.description}</span>
              </li>
            );
          })}
        </ul>
      </section>

      <section aria-label="Historique" className="space-y-2">
        <h2 className="text-xl font-bold">Historique</h2>
        {rides.length === 0 && <p className="text-mute">Aucune sortie pour l&apos;instant. Importe un fichier ou utilise « Suivre » pendant une boucle.</p>}
        {rides.map((r) => (
          <article key={r.id} className="card">
            <button type="button" className="flex w-full items-center justify-between text-left" onClick={() => setOpen(open === r.id ? null : r.id)} aria-expanded={open === r.id}>
              <span>
                <span className="block font-semibold">{r.name}</span>
                <span className="text-sm text-mute">
                  {new Date(r.date).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" })} · {formatKm(r.distanceM)} · {r.ascentM} m D+
                  {r.durationS ? ` · ${formatDuration(r.durationS)}` : ""}
                </span>
              </span>
              <span className="text-xl font-extrabold text-lime tabular-nums">{r.score.total}</span>
            </button>
            {open === r.id && (
              <div className="mt-3 space-y-3 border-t border-line pt-3 text-base">
                <dl className="grid grid-cols-2 gap-1">
                  <dt className="text-mute">Distance</dt><dd className="text-right">{r.score.distancePts} pts</dd>
                  <dt className="text-mute">Dénivelé (1 pt / {SCORE_RULES.M_PER_PT} m)</dt><dd className="text-right">{r.score.climbPts} pts</dd>
                  <dt className="text-mute">Bonus pentes</dt><dd className="text-right">{r.score.steepPts} pts</dd>
                  <dt className="text-mute">Pente max</dt><dd className="text-right">{r.score.maxGrade} %</dd>
                  {r.score.bestClimb && (<><dt className="text-mute">Plus belle montée</dt><dd className="text-right">{(r.score.bestClimb.lengthM / 1000).toFixed(1)} km à {r.score.bestClimb.avgGrade} %</dd></>)}
                  {r.colName && (<><dt className="text-mute">Col</dt><dd className="text-right">{r.colName}</dd></>)}
                  <dt className="text-mute">Classement</dt><dd className="text-right">{r.syncedAt ? "envoyée" : "locale"}</dd>
                </dl>
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" className="btn-ghost" onClick={() => downloadGpx(r.name, r.points)}>⤓ GPX</button>
                  <button
                    type="button"
                    className="btn-ghost text-coral"
                    onClick={async () => {
                      if (confirm(`Supprimer « ${r.name} » ?`)) {
                        await deleteRide(r.id);
                        if (r.syncedAt) await unsyncRide(r.id).catch(() => {});
                        reload();
                      }
                    }}
                  >
                    Supprimer
                  </button>
                </div>
              </div>
            )}
          </article>
        ))}
      </section>
    </div>
  );
}

"use client";
/**
 * Mode « suivre le tracé » : carte plein écran, position en direct, distance restante,
 * alerte hors parcours, écran maintenu allumé et enregistrement de la sortie.
 *
 * ⚠ Limite des PWA : quand l'écran s'éteint ou que l'app passe en arrière-plan, le navigateur
 * (surtout iOS Safari) suspend la géolocalisation. On garde donc l'écran allumé (Wake Lock)
 * et on recommande un compteur GPS (via l'export GPX) pour les longues sorties.
 */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "@/components/AppState";
import { Map } from "@/components/Map";
import { saveRide } from "@/lib/db";
import { formatDuration } from "@/lib/estimate";
import { closestOnTrack, cumulativeDistances, haversine, type TrackPoint } from "@/lib/geo";
import { buildRide } from "@/lib/rides";
import { afterRideSaved } from "@/lib/progress";

const OFF_ROUTE_M = 60;

export default function Follow() {
  const { route, ready } = useApp();
  const router = useRouter();
  const [pos, setPos] = useState<{ lngLat: [number, number]; speed: number | null; accuracy: number } | null>(null);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [follow, setFollow] = useState(true);
  const [recording, setRecording] = useState(false);
  const [trail, setTrail] = useState<TrackPoint[]>([]);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [now, setNow] = useState(0);
  const [wakeOk, setWakeOk] = useState<boolean | null>(null);
  const [progress, setProgress] = useState<{ index: number; offTrackM: number; alongM: number } | null>(null);

  const pts = route?.result.coordinates;
  const cum = useMemo(() => (pts ? cumulativeDistances(pts) : []), [pts]);
  const total = cum.at(-1) ?? 0;

  // Valeurs lues par le callback GPS (créé une seule fois) : on passe par des refs.
  const live = useRef({ pts, cum, recording, lastIdx: 0 });
  useEffect(() => {
    live.current.pts = pts;
    live.current.cum = cum;
    live.current.recording = recording;
  }, [pts, cum, recording]);

  // Position GPS en continu : progression sur le tracé + enregistrement de la trace.
  useEffect(() => {
    if (!("geolocation" in navigator)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- détection unique d'une capacité du navigateur
      setGeoError("Géolocalisation indisponible sur cet appareil.");
      return;
    }
    const id = navigator.geolocation.watchPosition(
      (p) => {
        const lngLat: [number, number] = [p.coords.longitude, p.coords.latitude];
        const L = live.current;
        setGeoError(null);
        setPos({ lngLat, speed: p.coords.speed, accuracy: p.coords.accuracy });

        if (L.pts) {
          // Recherche autour de la dernière position (aller-retour !), puis globale si on est perdu.
          let c = closestOnTrack(lngLat, L.pts, L.cum, Math.max(0, L.lastIdx - 30), L.lastIdx + 400);
          if (c.offTrackM > OFF_ROUTE_M * 2) c = closestOnTrack(lngLat, L.pts, L.cum);
          if (c.offTrackM < OFF_ROUTE_M) L.lastIdx = c.index;
          setProgress(c);
        }
        // Enregistrement : on ignore les points imprécis et les micro-mouvements.
        if (L.recording && p.coords.accuracy <= 50) {
          setTrail((t) => {
            const last = t.at(-1);
            return last && haversine(last, lngLat) < 8 ? t : [...t, [lngLat[0], lngLat[1]]];
          });
        }
      },
      (e) => setGeoError(e.code === 1 ? "Autorise l'accès à ta position pour être guidé." : "Signal GPS faible…"),
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 20000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, []);

  // Écran allumé pendant le guidage (Screen Wake Lock API).
  useEffect(() => {
    let lock: WakeLockSentinel | null = null;
    async function acquire() {
      try {
        lock = await navigator.wakeLock.request("screen");
        setWakeOk(true);
      } catch {
        setWakeOk(false);
      }
    }
    acquire(); // échoue proprement (setWakeOk(false)) si l'API n'existe pas
    const onVis = () => document.visibilityState === "visible" && acquire();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      lock?.release().catch(() => {});
    };
  }, []);

  // Horloge pour le chrono.
  useEffect(() => {
    if (!recording) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [recording]);

  const off = progress ? progress.offTrackM > OFF_ROUTE_M : false;
  useEffect(() => {
    if (off) navigator.vibrate?.([200, 100, 200]);
  }, [off]);

  async function finish() {
    setRecording(false);
    if (trail.length < 2) {
      setTrail([]);
      return;
    }
    // L'altitude GPS du téléphone est peu fiable : on reprend celle du tracé prévu au point le plus proche.
    const withEle: TrackPoint[] = trail.map((p) => {
      const c = pts ? closestOnTrack([p[0], p[1]], pts, cum) : null;
      return c && c.offTrackM < 100 ? [p[0], p[1], pts![c.index][2]] : [p[0], p[1]];
    });
    const ride = buildRide({
      name: route?.title ?? "Sortie",
      date: new Date(startedAt ?? Date.now()).toISOString(),
      source: "app",
      points: withEle,
      durationS: startedAt ? Math.round((Date.now() - startedAt) / 1000) : undefined,
      colName: route?.colName,
    });
    await saveRide(ride);
    await afterRideSaved().catch(() => {});
    router.push("/sorties");
  }

  if (ready && !route) {
    return (
      <div className="mx-auto max-w-xl space-y-4 px-4 pt-24">
        <h1 className="text-2xl font-bold">Aucun circuit à suivre</h1>
        <p className="text-mute">Trace d&apos;abord une boucle ou choisis un col.</p>
        <Link href="/" className="btn-primary w-full">Tracer une boucle</Link>
      </div>
    );
  }

  const done = progress ? progress.alongM : 0;
  const speedKmh = pos?.speed != null ? Math.round(pos.speed * 3.6) : null;

  return (
    <div className="fixed inset-0 z-40 bg-night">
      <Map controls={false} route={pts} trail={trail} user={pos?.lngLat} followUser={follow} fitKey={pts?.length} className="absolute inset-0" />

      {/* Bandeau d'infos : très gros chiffres, lisibles sur le guidon. */}
      <div className="absolute inset-x-0 top-0 p-3 pt-[calc(0.75rem+env(safe-area-inset-top))]">
        <div className={`rounded-3xl p-4 shadow-xl ${off ? "bg-coral text-night" : "bg-night/90 text-ink"}`} role="status" aria-live="polite">
          {off ? (
            <p className="text-2xl font-extrabold">Hors parcours · {Math.round(progress!.offTrackM)} m</p>
          ) : (
            <div className="grid grid-cols-3 text-center">
              <div>
                <div className="text-4xl font-extrabold tabular-nums">{((total - done) / 1000).toFixed(1)}</div>
                <div className="text-sm opacity-80">km restants</div>
              </div>
              <div>
                <div className="text-4xl font-extrabold tabular-nums">{speedKmh ?? "–"}</div>
                <div className="text-sm opacity-80">km/h</div>
              </div>
              <div>
                <div className="text-4xl font-extrabold tabular-nums">{startedAt ? formatDuration((now - startedAt) / 1000) : "0 min"}</div>
                <div className="text-sm opacity-80">chrono</div>
              </div>
            </div>
          )}
        </div>
        {geoError && <p className="mt-2 rounded-2xl bg-night/90 p-3 text-coral" role="alert">{geoError}</p>}
        {wakeOk === false && (
          <p className="mt-2 rounded-2xl bg-night/90 p-3 text-sm text-mute">
            Ton navigateur ne peut pas garder l&apos;écran allumé : désactive la mise en veille automatique pendant la sortie.
          </p>
        )}
      </div>

      {/* Commandes */}
      <div className="absolute inset-x-0 bottom-0 grid grid-cols-3 gap-2 p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
        <Link href="/" className="btn-ghost">Quitter</Link>
        <button type="button" className="btn-ghost" onClick={() => setFollow((f) => !f)} aria-pressed={follow}>
          {follow ? "Carte libre" : "Recentrer"}
        </button>
        {recording ? (
          <button type="button" className="btn-primary bg-coral" onClick={finish}>■ Terminer</button>
        ) : (
          <button
            type="button"
            className="btn-primary"
            onClick={() => {
              setTrail([]);
              setStartedAt(Date.now());
              setNow(Date.now());
              setRecording(true);
            }}
          >
            ● Démarrer
          </button>
        )}
      </div>
    </div>
  );
}

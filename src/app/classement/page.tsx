"use client";
/** Classement : km du mois par région, podium, écart avec le premier. */
import { useEffect, useState } from "react";
import { CloudNotice } from "@/components/CloudNotice";
import { useAccount } from "@/components/useAccount";
import { useNow } from "@/components/useNow";
import { kvGet, kvSet, listRides } from "@/lib/db";
import { standing, type LeaderRow } from "@/lib/leaderboard";
import { REGIONS } from "@/lib/regions";
import { supabase } from "@/lib/supabase";

const MEDALS = ["🥇", "🥈", "🥉"];

export default function Classement() {
  const { enabled, userId, profile } = useAccount();
  const [region, setRegion] = useState<string | null>(null);
  const [rows, setRows] = useState<LeaderRow[] | null>(null);
  const [myKm, setMyKm] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const now = useNow();

  // Région : celle du profil, sinon la dernière consultée.
  useEffect(() => {
    if (profile?.region) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- synchronisation avec le profil chargé
      setRegion(profile.region);
    } else if (region === null) {
      kvGet<string>("lastRegion").then((r) => setRegion(r ?? REGIONS[0]));
    }
  }, [profile, region]);

  useEffect(() => {
    const sb = supabase();
    if (!sb || !region) return;
    kvSet("lastRegion", region).catch(() => {});
    let stale = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- réinitialisation pendant le chargement
    setRows(null);
    sb.rpc("leaderboard_month", { p_region: region }).then(({ data, error: e }) => {
      if (stale) return;
      if (e) setError("Classement indisponible pour le moment.");
      else setRows((data as LeaderRow[]).map((r) => ({ ...r, total_km: Number(r.total_km) })));
    });
    return () => {
      stale = true;
    };
  }, [region]);

  // Mes km du mois (sorties locales synchronisées, pour l'écart même si je suis hors top 100).
  useEffect(() => {
    const month = new Date().toISOString().slice(0, 7);
    listRides().then((rs) => setMyKm(rs.filter((r) => r.syncedAt && r.date.startsWith(month)).reduce((a, r) => a + r.distanceM / 1000, 0)));
  }, [rows]);

  if (!enabled) {
    return (
      <div className="mx-auto max-w-xl space-y-4 px-4 pt-20">
        <h1 className="text-2xl font-extrabold">Classement</h1>
        <CloudNotice configured={false} what="" />
      </div>
    );
  }

  const st = rows ? standing(rows, userId, myKm) : null;
  const monthName = now?.toLocaleDateString("fr-FR", { month: "long", year: "numeric" }) ?? "";

  return (
    <div className="mx-auto max-w-xl space-y-4 px-4 pt-20">
      <h1 className="text-2xl font-extrabold">Classement · {monthName}</h1>
      <div>
        <label className="label" htmlFor="reg">Région</label>
        <select id="reg" className="field" value={region ?? ""} onChange={(e) => setRegion(e.target.value)}>
          {REGIONS.map((r) => <option key={r}>{r}</option>)}
        </select>
      </div>

      {error && <p role="alert" className="text-coral">{error}</p>}
      {!rows && !error && <p className="text-mute">Chargement…</p>}

      {st && userId && (
        <p className="card text-lg font-semibold" role="status">
          {st.kind === "empty" && "Personne n'a encore roulé ce mois-ci : la première place est à prendre !"}
          {st.kind === "leader" && (st.leadKm !== null ? `Tu es en tête avec ${st.leadKm} km d'avance 🔥` : "Tu es en tête !")}
          {st.kind === "chasing" && (
            <>
              Il te manque <span className="text-lime">{st.missingKm} km</span> pour passer premier
              {st.myRank ? ` (tu es ${st.myRank}e)` : ""}.
            </>
          )}
        </p>
      )}

      {rows && rows.length > 0 && (
        <>
          <ol className="grid grid-cols-3 items-end gap-2" aria-label="Podium">
            {[1, 0, 2].map((i) => {
              const r = rows[i];
              if (!r) return <li key={i} />;
              const h = ["h-36", "h-28", "h-24"][i];
              return (
                <li key={r.user_id} className={`flex ${h} flex-col items-center justify-end rounded-t-3xl p-2 text-center ${i === 0 ? "bg-lime text-night" : "bg-surface"} ${r.user_id === userId ? "ring-2 ring-sky" : ""}`}>
                  <span className="text-2xl" aria-hidden="true">{MEDALS[i]}</span>
                  <span className="w-full truncate font-bold">{r.username}</span>
                  <span className="tabular-nums">{r.total_km.toFixed(1)} km</span>
                </li>
              );
            })}
          </ol>
          <ol className="space-y-2">
            {rows.slice(3).map((r) => (
              <li key={r.user_id} className={`flex min-h-14 items-center justify-between rounded-2xl px-4 ${r.user_id === userId ? "bg-raised ring-2 ring-sky" : "bg-surface"}`}>
                <span><span className="mr-3 text-mute tabular-nums">{r.rank}</span>{r.username}</span>
                <span className="font-semibold tabular-nums">{r.total_km.toFixed(1)} km</span>
              </li>
            ))}
          </ol>
        </>
      )}

      {!userId && <CloudNotice configured what="apparaître dans le classement" />}
      {userId && !profile && <p className="text-mute">Complète ton profil (pseudo + région) dans Compte pour apparaître.</p>}
      <p className="text-xs text-mute">Seules les sorties envoyées depuis Virée comptent. Le classement repose sur la bonne foi : pas de vérification de la trace.</p>
    </div>
  );
}

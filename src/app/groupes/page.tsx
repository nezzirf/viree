"use client";
/** Sorties à plusieurs : proposer un rendez-vous (lieu, date, allure) et rejoindre ceux du coin. */
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useApp } from "@/components/AppState";
import { Chips } from "@/components/Chips";
import { CloudNotice } from "@/components/CloudNotice";
import { PlaceSearch } from "@/components/PlaceSearch";
import { useAccount } from "@/components/useAccount";
import { supabase } from "@/lib/supabase";

type Pace = "cool" | "moyen" | "rapide";
const PACES: Record<Pace, string> = { cool: "Cool", moyen: "Moyen", rapide: "Rapide" };

interface GroupRide {
  id: number;
  creator: string;
  title: string;
  description: string | null;
  place_name: string;
  lat: number;
  lon: number;
  start_at: string;
  pace: Pace;
  speed_kmh: number | null;
  distance_km: number | null;
  region: string;
  profiles: { username: string } | null;
  group_ride_members: { user_id: string }[];
}

/** Valeur par défaut du champ date : demain 9 h, au format attendu par <input type="datetime-local">. */
function tomorrowAt9() {
  const d = new Date(Date.now() + 86400000);
  d.setHours(9, 0, 0, 0);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T09:00`;
}

export default function Groupes() {
  const { enabled, userId, profile, loading } = useAccount();
  const { setStart } = useApp();
  const router = useRouter();
  const [list, setList] = useState<GroupRide[] | null>(null);
  const [allRegions, setAllRegions] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Formulaire
  const [title, setTitle] = useState("");
  const [place, setPlace] = useState<{ lngLat: [number, number]; label: string } | null>(null);
  const [when, setWhen] = useState("");
  const [pace, setPace] = useState<Pace>("moyen");
  const [speed, setSpeed] = useState(25);
  const [distance, setDistance] = useState(60);
  const [desc, setDesc] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const sb = supabase();
    if (!sb || !profile) return;
    let q = sb
      .from("group_rides")
      .select("*, profiles(username), group_ride_members(user_id)")
      .gte("start_at", new Date(Date.now() - 3 * 3600000).toISOString())
      .order("start_at")
      .limit(50);
    if (!allRegions) q = q.eq("region", profile.region);
    const { data, error: e } = await q;
    if (e) setError("Impossible de charger les sorties.");
    else setList(data as GroupRide[]);
  }, [profile, allRegions]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- chargement depuis Supabase
    load();
  }, [load]);

  if (enabled && loading) {
    return <p className="mx-auto max-w-xl px-4 pt-20 text-mute">Chargement…</p>;
  }
  if (!enabled || !userId || !profile) {
    return (
      <div className="mx-auto max-w-xl space-y-4 px-4 pt-20">
        <h1 className="text-2xl font-extrabold">Rouler à plusieurs</h1>
        {enabled && userId && !profile ? (
          <p className="card">Complète ton profil (pseudo + région) dans Compte pour voir les sorties de ta région.</p>
        ) : (
          <CloudNotice configured={enabled} what="proposer ou rejoindre une sortie" />
        )}
      </div>
    );
  }

  const sb = supabase()!;

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!place || !profile) return setError("Choisis un lieu de rendez-vous.");
    setBusy(true);
    setError(null);
    const { error: err } = await sb.from("group_rides").insert({
      title: title.trim(),
      description: desc.trim() || null,
      place_name: place.label,
      lon: place.lngLat[0],
      lat: place.lngLat[1],
      start_at: new Date(when || tomorrowAt9()).toISOString(),
      pace,
      speed_kmh: speed,
      distance_km: distance,
      region: profile.region,
    });
    setBusy(false);
    if (err) return setError(err.message.includes("5 sorties") ? "Tu as déjà 5 sorties à venir." : "Sortie refusée : vérifie la date (dans le futur, < 90 jours) et le titre (3 à 80 caractères).");
    setShowForm(false);
    setTitle("");
    setDesc("");
    load();
  }

  async function toggle(r: GroupRide, joined: boolean) {
    const { error: err } = joined
      ? await sb.from("group_ride_members").delete().match({ ride_id: r.id, user_id: userId })
      : await sb.from("group_ride_members").insert({ ride_id: r.id });
    if (err) setError("Action impossible pour le moment.");
    load();
  }

  return (
    <div className="mx-auto max-w-xl space-y-4 px-4 pt-20">
      <h1 className="text-2xl font-extrabold">Rouler à plusieurs</h1>
      <Chips label="Afficher" options={{ region: profile!.region, tout: "Toutes les régions" }} value={allRegions ? "tout" : "region"} onChange={(v) => setAllRegions(v === "tout")} />

      {!showForm ? (
        <button type="button" className="btn-primary w-full" onClick={() => setShowForm(true)}>+ Proposer une sortie</button>
      ) : (
        <form className="card animate-rise space-y-4" onSubmit={create}>
          <h2 className="text-xl font-bold">Nouvelle sortie</h2>
          <div>
            <label className="label" htmlFor="t">Titre</label>
            <input id="t" className="field" required minLength={3} maxLength={80} placeholder="Ex. : Boucle des 3 cols du dimanche" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <PlaceSearch label="Lieu de rendez-vous" value={place} onChange={setPlace} />
          <div>
            <label className="label" htmlFor="w">Date et heure</label>
            <input id="w" className="field" type="datetime-local" required value={when || tomorrowAt9()} onChange={(e) => setWhen(e.target.value)} />
          </div>
          <Chips label="Allure" options={PACES} value={pace} onChange={setPace} />
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="label" htmlFor="s">Moyenne (km/h)</label>
              <input id="s" className="field" type="number" min={10} max={45} value={speed} onChange={(e) => setSpeed(Number(e.target.value))} />
            </div>
            <div>
              <label className="label" htmlFor="d">Distance (km)</label>
              <input id="d" className="field" type="number" min={5} max={300} value={distance} onChange={(e) => setDistance(Number(e.target.value))} />
            </div>
          </div>
          <div>
            <label className="label" htmlFor="desc">Détails (facultatif)</label>
            <textarea id="desc" className="field min-h-24 py-3" maxLength={500} value={desc} onChange={(e) => setDesc(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" className="btn-ghost" onClick={() => setShowForm(false)}>Annuler</button>
            <button className="btn-primary" disabled={busy}>Publier</button>
          </div>
        </form>
      )}

      {error && <p role="alert" className="text-coral">{error}</p>}
      {list?.length === 0 && <p className="text-mute">Aucune sortie prévue ici pour l&apos;instant. Lance la première !</p>}

      <ul className="space-y-3">
        {list?.map((r) => {
          const joined = r.group_ride_members.some((m) => m.user_id === userId);
          const mine = r.creator === userId;
          return (
            <li key={r.id} className="card space-y-2">
              <div className="flex items-start justify-between gap-2">
                <h2 className="text-lg font-bold">{r.title}</h2>
                <span className="shrink-0 rounded-full bg-raised px-3 py-1 text-sm font-semibold">{PACES[r.pace]}{r.speed_kmh ? ` · ${r.speed_kmh} km/h` : ""}</span>
              </div>
              <p className="text-lg text-lime">
                {new Date(r.start_at).toLocaleString("fr-FR", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })}
              </p>
              <p className="text-mute">
                📍 {r.place_name}{r.distance_km ? ` · ${r.distance_km} km` : ""} · par {r.profiles?.username ?? "?"} · {r.group_ride_members.length} inscrit(s)
              </p>
              {r.description && <p className="whitespace-pre-line">{r.description}</p>}
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={() => {
                    setStart({ lngLat: [r.lon, r.lat], label: r.place_name });
                    router.push("/");
                  }}
                >
                  Tracer depuis ici
                </button>
                {mine ? (
                  <button
                    type="button"
                    className="btn-ghost text-coral"
                    onClick={async () => {
                      if (!confirm("Annuler cette sortie ?")) return;
                      await sb.from("group_rides").delete().eq("id", r.id);
                      load();
                    }}
                  >
                    Annuler
                  </button>
                ) : (
                  <button type="button" className={joined ? "btn-ghost" : "btn-primary"} onClick={() => toggle(r, joined)}>
                    {joined ? "Je ne viens plus" : "Je viens !"}
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

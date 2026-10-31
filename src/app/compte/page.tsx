"use client";
/** Compte : connexion par lien magique (email), pseudo + région, synchronisation, effacement. */
import { useEffect, useState } from "react";
import { CloudNotice } from "@/components/CloudNotice";
import { useAccount } from "@/components/useAccount";
import { listRides, saveRide } from "@/lib/db";
import { REGIONS } from "@/lib/regions";
import { supabase, syncRides } from "@/lib/supabase";

export default function Compte() {
  const { enabled, loading, userId, email, profile, refresh } = useAccount();
  const [mail, setMail] = useState("");
  const [sent, setSent] = useState(false);
  const [username, setUsername] = useState("");
  const [region, setRegion] = useState<string>(REGIONS[0]);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (profile) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- pré-remplissage du formulaire
      setUsername(profile.username);
      setRegion(profile.region);
    }
  }, [profile]);

  async function run(fn: () => Promise<string>) {
    setBusy(true);
    setMsg(null);
    try {
      setMsg({ ok: true, text: await fn() });
    } catch (e) {
      setMsg({ ok: false, text: (e as { message?: string }).message ?? "Erreur inattendue." });
    } finally {
      setBusy(false);
    }
  }

  if (!enabled) {
    return (
      <div className="mx-auto max-w-xl space-y-4 px-4 pt-20">
        <h1 className="text-2xl font-extrabold">Compte</h1>
        <CloudNotice configured={false} what="" />
      </div>
    );
  }

  const sb = supabase()!;

  return (
    <div className="mx-auto max-w-xl space-y-4 px-4 pt-20">
      <h1 className="text-2xl font-extrabold">Compte</h1>
      {loading && <p className="text-mute">Chargement…</p>}

      {!loading && !userId && (
        <form
          className="card space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            run(async () => {
              const { error } = await sb.auth.signInWithOtp({ email: mail.trim(), options: { emailRedirectTo: `${location.origin}/compte` } });
              if (error) {
                if (error.status === 429) throw new Error("Trop d'emails envoyés : le quota gratuit d'envoi est atteint, réessaie dans une heure.");
                throw error;
              }
              setSent(true);
              return "Lien envoyé ! Ouvre l'email sur ce téléphone pour te connecter.";
            });
          }}
        >
          <p className="text-mute">Le compte sert uniquement au classement et aux sorties à plusieurs. Pas de mot de passe : on t&apos;envoie un lien.</p>
          <label className="label" htmlFor="mail">Email</label>
          <input id="mail" className="field" type="email" required autoComplete="email" value={mail} onChange={(e) => setMail(e.target.value)} />
          <button className="btn-primary w-full" disabled={busy || sent}>{sent ? "Lien envoyé" : "Recevoir un lien de connexion"}</button>
        </form>
      )}

      {userId && (
        <>
          <form
            className="card space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              run(async () => {
                const { error } = await sb.from("profiles").upsert({ id: userId, username: username.trim(), region });
                if (error) throw new Error(error.code === "23505" ? "Ce pseudo est déjà pris." : error.code === "23514" ? "Pseudo : 3 à 24 caractères (lettres, chiffres, espace, . _ -)." : error.message);
                await refresh();
                const n = await syncRides();
                return `Profil enregistré.${n ? ` ${n} sortie(s) envoyée(s) au classement.` : ""}`;
              });
            }}
          >
            <p className="text-mute">Connecté : {email}</p>
            <div>
              <label className="label" htmlFor="pseudo">Pseudo public</label>
              <input id="pseudo" className="field" required minLength={3} maxLength={24} value={username} onChange={(e) => setUsername(e.target.value)} />
            </div>
            <div>
              <label className="label" htmlFor="region">Région du classement</label>
              <select id="region" className="field" value={region} onChange={(e) => setRegion(e.target.value)}>
                {REGIONS.map((r) => <option key={r}>{r}</option>)}
              </select>
            </div>
            <button className="btn-primary w-full" disabled={busy}>Enregistrer</button>
          </form>

          {profile && (
            <section className="card space-y-3">
              <h2 className="text-xl font-bold">Classement</h2>
              <p className="text-mute">Seul le résumé (date, km, D+, score) des sorties des 40 derniers jours est envoyé. Les traces GPS restent sur ton téléphone.</p>
              <button type="button" className="btn-ghost w-full" disabled={busy} onClick={() => run(async () => `${await syncRides()} sortie(s) envoyée(s).`)}>
                Envoyer mes nouvelles sorties
              </button>
            </section>
          )}

          <section className="card space-y-3">
            <button type="button" className="btn-ghost w-full" onClick={() => sb.auth.signOut()}>Se déconnecter</button>
            <button
              type="button"
              className="btn-ghost w-full text-coral"
              disabled={busy}
              onClick={() => {
                if (!confirm("Effacer ton profil, tes sorties du classement et tes participations ? Tes sorties locales sont conservées.")) return;
                run(async () => {
                  // La suppression du profil efface en cascade rides, group_rides et participations.
                  const { error } = await sb.from("profiles").delete().eq("id", userId);
                  if (error) throw error;
                  await Promise.all((await listRides()).map((r) => saveRide({ ...r, syncedAt: undefined })));
                  await sb.auth.signOut();
                  return "Données en ligne effacées.";
                });
              }}
            >
              Effacer mes données en ligne
            </button>
          </section>
        </>
      )}

      {msg && <p role="status" className={msg.ok ? "text-lime" : "text-coral"}>{msg.text}</p>}
    </div>
  );
}

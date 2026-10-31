import Link from "next/link";

/** Affiché quand Supabase n'est pas configuré ou que l'utilisateur n'est pas connecté. */
export function CloudNotice({ configured, what }: { configured: boolean; what: string }) {
  return (
    <div className="card space-y-3">
      {configured ? (
        <>
          <p className="text-lg">Connecte-toi pour {what}.</p>
          <p className="text-mute">Un simple email suffit, sans mot de passe. Les circuits restent utilisables sans compte.</p>
          <Link href="/compte" className="btn-primary w-full">Se connecter</Link>
        </>
      ) : (
        <>
          <p className="text-lg">Fonction en ligne non configurée.</p>
          <p className="text-mute">
            Cette instance de Virée n&apos;a pas de projet Supabase (voir README). Les circuits, l&apos;import, le score et les badges
            fonctionnent quand même, en local.
          </p>
        </>
      )}
    </div>
  );
}

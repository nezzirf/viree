"use client";
/** Session Supabase + profil, mis à jour à la connexion / déconnexion. */
import { useCallback, useEffect, useState } from "react";
import { cloudEnabled, getProfile, supabase, type Profile } from "@/lib/supabase";

export function useAccount() {
  const enabled = cloudEnabled();
  const [loading, setLoading] = useState(enabled);
  const [userId, setUserId] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);

  const refresh = useCallback(async () => {
    setProfile(await getProfile());
  }, []);

  useEffect(() => {
    const sb = supabase();
    if (!sb) return;
    sb.auth.getSession().then(async ({ data }) => {
      setUserId(data.session?.user.id ?? null);
      setEmail(data.session?.user.email ?? null);
      if (data.session) setProfile(await getProfile());
      setLoading(false);
    });
    const { data } = sb.auth.onAuthStateChange((_e, session) => {
      setUserId(session?.user.id ?? null);
      setEmail(session?.user.email ?? null);
      if (session) getProfile().then(setProfile);
      else setProfile(null);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  return { enabled, loading, userId, email, profile, refresh };
}

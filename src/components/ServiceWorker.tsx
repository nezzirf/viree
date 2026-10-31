"use client";
import { useEffect } from "react";

/** Enregistre le service worker en production uniquement (en dev il gênerait le rechargement à chaud). */
export function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  }, []);
  return null;
}

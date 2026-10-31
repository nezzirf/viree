"use client";
/** Chargement de la carte côté client uniquement (MapLibre a besoin de WebGL / window). */
import dynamic from "next/dynamic";

export const Map = dynamic(() => import("./MapView"), {
  ssr: false,
  loading: () => <div className="h-full w-full animate-pulse bg-surface" aria-label="Chargement de la carte" />,
});

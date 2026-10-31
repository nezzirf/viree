"use client";
/**
 * État partagé entre les pages : point de départ et circuit courant.
 * Persisté dans IndexedDB pour survivre à un rechargement (utile en roulant : le
 * téléphone peut tuer l'onglet, le circuit reste disponible hors connexion).
 */
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { kvGet, kvSet } from "@/lib/db";
import type { BikeType, Hilliness, RouteResult } from "@/lib/types";

export interface StartPoint {
  lngLat: [number, number];
  label: string;
}

export interface CurrentRoute {
  result: RouteResult;
  title: string;
  bike: BikeType;
  hilliness: Hilliness;
  colName?: string;
}

interface Ctx {
  ready: boolean;
  start: StartPoint | null;
  setStart: (s: StartPoint | null) => void;
  route: CurrentRoute | null;
  setRoute: (r: CurrentRoute | null) => void;
}

const AppCtx = createContext<Ctx | null>(null);

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [start, setStartState] = useState<StartPoint | null>(null);
  const [route, setRouteState] = useState<CurrentRoute | null>(null);

  useEffect(() => {
    Promise.all([kvGet<StartPoint>("start"), kvGet<CurrentRoute>("currentRoute")])
      .then(([s, r]) => {
        if (s) setStartState(s);
        if (r) setRouteState(r);
      })
      .catch(() => {})
      .finally(() => setReady(true));
  }, []);

  const setStart = useCallback((s: StartPoint | null) => {
    setStartState(s);
    kvSet("start", s).catch(() => {});
  }, []);
  const setRoute = useCallback((r: CurrentRoute | null) => {
    setRouteState(r);
    kvSet("currentRoute", r).catch(() => {});
  }, []);

  return <AppCtx.Provider value={{ ready, start, setStart, route, setRoute }}>{children}</AppCtx.Provider>;
}

export function useApp(): Ctx {
  const c = useContext(AppCtx);
  if (!c) throw new Error("useApp hors AppStateProvider");
  return c;
}

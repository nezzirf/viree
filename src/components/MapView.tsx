"use client";
/**
 * Carte MapLibre GL + tuiles vectorielles OpenFreeMap.
 *
 * OpenFreeMap : gratuit, sans clé, sans limite de vues annoncée, financé par dons.
 * Conditions : garder l'attribution (OpenFreeMap © OpenMapTiles, données © OpenStreetMap),
 * affichée automatiquement par le style. Le style est configurable via NEXT_PUBLIC_MAP_STYLE.
 *
 * Toutes les couches (trace, départ, position, cols) sont des couches GeoJSON :
 * pas de marqueurs DOM → fluide sur mobile.
 */
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef } from "react";
import type { GeoJSONSource, Map as MlMap } from "maplibre-gl";
import { bbox, type TrackPoint } from "@/lib/geo";

const STYLE = process.env.NEXT_PUBLIC_MAP_STYLE ?? "https://tiles.openfreemap.org/styles/dark";

export interface MapPass {
  id: number;
  name: string;
  ele: number;
  lngLat: [number, number];
  selected?: boolean;
}

interface Props {
  route?: TrackPoint[] | null;
  /** Trace secondaire (ex. trace GPS enregistrée) */
  trail?: TrackPoint[] | null;
  start?: [number, number] | null;
  user?: [number, number] | null;
  highlight?: [number, number] | null;
  passes?: MapPass[];
  onPassClick?: (id: number) => void;
  onMapClick?: (lngLat: [number, number]) => void;
  /** Recentre en continu sur la position (mode guidage) */
  followUser?: boolean;
  className?: string;
  /** Boutons de zoom (masqués en mode guidage, où le bandeau occupe le haut) */
  controls?: boolean;
  /** Change cette valeur pour recadrer la carte sur le circuit */
  fitKey?: string | number;
}

const empty = { type: "FeatureCollection" as const, features: [] };
const point = (c: [number, number] | null | undefined, props: Record<string, unknown> = {}) =>
  c ? { type: "FeatureCollection" as const, features: [{ type: "Feature" as const, properties: props, geometry: { type: "Point" as const, coordinates: c } }] } : empty;
const line = (pts: TrackPoint[] | null | undefined) =>
  pts && pts.length > 1
    ? { type: "Feature" as const, properties: {}, geometry: { type: "LineString" as const, coordinates: pts.map((p) => [p[0], p[1]]) } }
    : empty;

export default function MapView(props: Props) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<MlMap | null>(null);
  const loaded = useRef(false);
  const latest = useRef(props);
  latest.current = props;

  // Création de la carte (une seule fois).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const ml = await import("maplibre-gl");
      if (cancelled || !el.current) return;
      ml.setWorkerUrl("/maplibre/maplibre-gl-worker.mjs"); // voir scripts/copy-maplibre-worker.mjs
      const p = latest.current;
      const m = new ml.Map({
        container: el.current,
        style: STYLE,
        center: p.start ?? [2.35, 46.6],
        zoom: p.start ? 11 : 5,
        attributionControl: { compact: true },
        // Économise la batterie et les données : pas de rendu 3D ni de préchargement agressif.
        maxPitch: 0,
        pixelRatio: Math.min(2, window.devicePixelRatio || 1),
      });
      if (p.controls !== false) m.addControl(new ml.NavigationControl({ showCompass: false }), "top-right");
      map.current = m;

      m.on("load", () => {
        m.addSource("route", { type: "geojson", data: empty });
        m.addSource("trail", { type: "geojson", data: empty });
        m.addSource("start", { type: "geojson", data: empty });
        m.addSource("user", { type: "geojson", data: empty });
        m.addSource("hl", { type: "geojson", data: empty });
        m.addSource("passes", { type: "geojson", data: empty });

        m.addLayer({ id: "route-casing", type: "line", source: "route", layout: { "line-join": "round", "line-cap": "round" }, paint: { "line-color": "#0B0F14", "line-width": 9 } });
        m.addLayer({ id: "route-line", type: "line", source: "route", layout: { "line-join": "round", "line-cap": "round" }, paint: { "line-color": "#D4FF3A", "line-width": 5 } });
        m.addLayer({ id: "trail-line", type: "line", source: "trail", layout: { "line-join": "round", "line-cap": "round" }, paint: { "line-color": "#59C3FF", "line-width": 4 } });
        m.addLayer({
          id: "passes-dot", type: "circle", source: "passes",
          paint: {
            "circle-radius": ["case", ["get", "selected"], 10, 7],
            "circle-color": ["case", ["get", "selected"], "#D4FF3A", "#FF6B4A"],
            "circle-stroke-color": "#0B0F14", "circle-stroke-width": 2,
          },
        });
        // Les étiquettes exigent des polices (glyphs) dans le style : si le style n'en fournit pas,
        // on s'en passe plutôt que de casser toute la carte.
        try {
          m.addLayer({
            id: "passes-label", type: "symbol", source: "passes", minzoom: 9,
            layout: { "text-field": ["concat", ["get", "name"], "\n", ["to-string", ["get", "ele"]], " m"], "text-size": 13, "text-offset": [0, 1.3], "text-anchor": "top", "text-font": ["Noto Sans Regular"] },
            paint: { "text-color": "#F2F5F8", "text-halo-color": "#0B0F14", "text-halo-width": 1.5 },
          });
        } catch (err) {
          console.warn("Étiquettes des cols désactivées :", err);
        }
        m.addLayer({ id: "start-dot", type: "circle", source: "start", paint: { "circle-radius": 9, "circle-color": "#FF6B4A", "circle-stroke-color": "#F2F5F8", "circle-stroke-width": 3 } });
        m.addLayer({ id: "hl-dot", type: "circle", source: "hl", paint: { "circle-radius": 8, "circle-color": "#F2F5F8", "circle-stroke-color": "#0B0F14", "circle-stroke-width": 3 } });
        m.addLayer({ id: "user-halo", type: "circle", source: "user", paint: { "circle-radius": 18, "circle-color": "#59C3FF", "circle-opacity": 0.25 } });
        m.addLayer({ id: "user-dot", type: "circle", source: "user", paint: { "circle-radius": 8, "circle-color": "#59C3FF", "circle-stroke-color": "#F2F5F8", "circle-stroke-width": 3 } });

        m.on("click", "passes-dot", (e) => {
          const id = e.features?.[0]?.properties?.id;
          if (id !== undefined) latest.current.onPassClick?.(Number(id));
        });
        m.on("click", (e) => {
          const hit = m.queryRenderedFeatures(e.point, { layers: ["passes-dot"] });
          if (!hit.length) latest.current.onMapClick?.([e.lngLat.lng, e.lngLat.lat]);
        });
        loaded.current = true;
        sync();
        fit();
      });
    })();
    return () => {
      cancelled = true;
      map.current?.remove();
      map.current = null;
      loaded.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function src(id: string) {
    return map.current?.getSource(id) as GeoJSONSource | undefined;
  }

  function sync() {
    if (!loaded.current) return;
    const p = latest.current;
    src("route")?.setData(line(p.route));
    src("trail")?.setData(line(p.trail));
    src("start")?.setData(point(p.start));
    src("user")?.setData(point(p.user));
    src("hl")?.setData(point(p.highlight));
    src("passes")?.setData({
      type: "FeatureCollection",
      features: (p.passes ?? []).map((x) => ({
        type: "Feature",
        properties: { id: x.id, name: x.name, ele: x.ele, selected: !!x.selected },
        geometry: { type: "Point", coordinates: x.lngLat },
      })),
    });
  }

  function fit() {
    const m = map.current;
    const p = latest.current;
    if (!m || !loaded.current) return;
    const pts: TrackPoint[] = p.route?.length ? p.route : (p.passes ?? []).map((x) => [...x.lngLat] as TrackPoint);
    if (p.start) pts.push([p.start[0], p.start[1]]);
    if (pts.length > 1) {
      const [a, b, c, d] = bbox(pts);
      m.fitBounds([a, b, c, d], { padding: { top: 60, bottom: 60, left: 40, right: 40 }, duration: 600, maxZoom: 14 });
    } else if (p.start) {
      m.easeTo({ center: p.start, zoom: 12, duration: 600 });
    }
  }

  useEffect(sync);
  useEffect(fit, [props.fitKey]);

  useEffect(() => {
    if (props.followUser && props.user && map.current) {
      map.current.easeTo({ center: props.user, zoom: Math.max(map.current.getZoom(), 15), duration: 500 });
    }
  }, [props.followUser, props.user]);

  // La classe va sur un conteneur : MapLibre impose `position: relative` à son propre élément,
  // ce qui casserait un `absolute inset-0` passé directement.
  return (
    <div className={props.className ?? "h-full w-full"}>
      <div ref={el} className="h-full w-full" role="region" aria-label="Carte" />
    </div>
  );
}

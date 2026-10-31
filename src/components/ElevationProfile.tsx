"use client";
/**
 * Profil altimétrique en SVG pur (aucune lib de graphique).
 * Couleur par pente : gris < 4 %, citron 4–6 %, ambre 6–8 %, corail 8–10 %, rouge ≥ 10 %.
 * Le doigt (ou la souris) sur le profil met en évidence le point sur la carte.
 */
import { useMemo, useState } from "react";
import { cumulativeDistances, resample, type TrackPoint } from "@/lib/geo";

const W = 600;
const H = 150;

export function gradeColor(g: number) {
  if (g >= 10) return "#FF3B3B";
  if (g >= 8) return "#FF6B4A";
  if (g >= 6) return "#FFB547";
  if (g >= 4) return "#D4FF3A";
  return "#5B6878";
}

interface Props {
  points: TrackPoint[];
  onHover?: (lngLat: [number, number] | null) => void;
}

export function ElevationProfile({ points, onHover }: Props) {
  const [hover, setHover] = useState<number | null>(null);

  const data = useMemo(() => {
    const raw = points.filter((p) => typeof p[2] === "number");
    if (raw.length < 2) return null;
    const total = cumulativeDistances(raw).at(-1)!;
    // ~150 colonnes quelle que soit la longueur : léger à dessiner.
    const s = resample(raw, Math.max(50, total / 150));
    const dist = cumulativeDistances(s);
    const eles = s.map((p) => p[2] as number);
    const min = Math.min(...eles);
    const max = Math.max(...eles);
    const pad = Math.max(20, (max - min) * 0.1);
    const lo = min - pad;
    const hi = max + pad;
    const x = (d: number) => (d / dist.at(-1)!) * W;
    const y = (e: number) => H - ((e - lo) / (hi - lo)) * H;
    const segs = s.slice(1).map((p, i) => {
      const run = dist[i + 1] - dist[i] || 1;
      const g = ((eles[i + 1] - eles[i]) / run) * 100;
      return {
        d: `M${x(dist[i])},${H} L${x(dist[i])},${y(eles[i])} L${x(dist[i + 1])},${y(eles[i + 1])} L${x(dist[i + 1])},${H} Z`,
        color: gradeColor(g),
        g,
      };
    });
    const outline = s.map((_, i) => `${i ? "L" : "M"}${x(dist[i])},${y(eles[i])}`).join(" ");
    return { s, dist, eles, segs, outline, min, max, x, y };
  }, [points]);

  if (!data) return <p className="text-mute">Pas de données d&apos;altitude pour ce tracé.</p>;

  function move(clientX: number, rect: DOMRect) {
    if (!data) return;
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    const target = ratio * data.dist.at(-1)!;
    let i = data.dist.findIndex((d) => d >= target);
    if (i < 0) i = data.dist.length - 1;
    setHover(i);
    onHover?.([data.s[i][0], data.s[i][1]]);
  }
  function leave() {
    setHover(null);
    onHover?.(null);
  }

  const h = hover !== null ? { km: data.dist[hover] / 1000, ele: data.eles[hover], g: data.segs[Math.min(hover, data.segs.length - 1)].g } : null;

  return (
    <figure className="select-none">
      <div className="mb-1 flex justify-between text-sm text-mute" aria-hidden="true">
        <span>{Math.round(data.max)} m</span>
        {h ? (
          <span className="font-semibold text-ink">
            km {h.km.toFixed(1)} · {Math.round(h.ele)} m · {h.g >= 0 ? "+" : ""}
            {h.g.toFixed(1)} %
          </span>
        ) : (
          <span>Glisse le doigt sur le profil</span>
        )}
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="h-36 w-full touch-none rounded-xl bg-raised"
        role="img"
        aria-label={`Profil altimétrique : de ${Math.round(data.min)} à ${Math.round(data.max)} mètres`}
        onPointerMove={(e) => move(e.clientX, e.currentTarget.getBoundingClientRect())}
        onPointerDown={(e) => move(e.clientX, e.currentTarget.getBoundingClientRect())}
        onPointerLeave={leave}
        onPointerUp={(e) => e.pointerType !== "mouse" && leave()}
      >
        {data.segs.map((sg, i) => (
          <path key={i} d={sg.d} fill={sg.color} opacity={0.85} />
        ))}
        <path d={data.outline} fill="none" stroke="#F2F5F8" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
        {hover !== null && (
          <line x1={data.x(data.dist[hover])} x2={data.x(data.dist[hover])} y1={0} y2={H} stroke="#F2F5F8" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
        )}
      </svg>
      <figcaption className="mt-1 flex justify-between text-sm text-mute">
        <span>{Math.round(data.min)} m</span>
        <span>{(data.dist.at(-1)! / 1000).toFixed(1)} km</span>
      </figcaption>
      <div className="mt-2 flex flex-wrap gap-3 text-xs text-mute" aria-label="Légende des pentes">
        {[["< 4 %", 0], ["4–6 %", 4], ["6–8 %", 6], ["8–10 %", 8], ["≥ 10 %", 10]].map(([l, g]) => (
          <span key={l} className="inline-flex items-center gap-1">
            <span className="inline-block h-3 w-3 rounded-sm" style={{ background: gradeColor(g as number) }} />
            {l}
          </span>
        ))}
      </div>
    </figure>
  );
}

/**
 * Export GPX 1.1 généré entièrement côté client.
 * On exporte un <trk> (compatible avec tous les compteurs : Garmin, Wahoo, Hammerhead,
 * Bryton, applis GPS) — pas de <rte>, souvent mal géré.
 */
import type { TrackPoint } from "./geo";

const esc = (s: string) => s.replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[c]!);

export function toGpx(name: string, points: TrackPoint[], opts: { time?: Date } = {}): string {
  const time = (opts.time ?? new Date()).toISOString();
  const pts = points
    .map((p) => {
      const ele = typeof p[2] === "number" ? `<ele>${p[2].toFixed(1)}</ele>` : "";
      return `<trkpt lat="${p[1].toFixed(6)}" lon="${p[0].toFixed(6)}">${ele}</trkpt>`;
    })
    .join("\n      ");
  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Virée" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata><name>${esc(name)}</name><time>${time}</time></metadata>
  <trk>
    <name>${esc(name)}</name>
    <type>cycling</type>
    <trkseg>
      ${pts}
    </trkseg>
  </trk>
</gpx>
`;
}

export function slugify(s: string) {
  return (
    s
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "circuit"
  );
}

/** Déclenche le téléchargement (ou la feuille de partage sur mobile si dispo). */
export async function downloadGpx(name: string, points: TrackPoint[]) {
  const gpx = toGpx(name, points);
  const filename = `${slugify(name)}.gpx`;
  const file = new File([gpx], filename, { type: "application/gpx+xml" });
  // Sur mobile, le partage natif permet d'envoyer directement vers l'appli du compteur.
  if (typeof navigator !== "undefined" && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: name });
      return;
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
    }
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

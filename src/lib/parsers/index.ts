/**
 * Import de sorties : GPX, TCX (XML, lus avec DOMParser) et FIT (binaire, via fit-file-parser).
 * Tout se passe dans le navigateur : le fichier n'est jamais envoyé au serveur.
 */
import type { TrackPoint } from "../geo";

export interface ParsedActivity {
  name: string;
  /** ISO, départ */
  date: string;
  points: TrackPoint[];
  durationS?: number;
}

export class ImportError extends Error {}

const num = (s: string | null | undefined) => (s == null || s.trim() === "" ? undefined : Number(s));

/** Éléments par nom local, quel que soit l'espace de noms (GPX 1.0/1.1, TCX v2, préfixes…). */
function els(root: Document | Element, tag: string): Element[] {
  const ns = Array.from(root.getElementsByTagNameNS("*", tag));
  if (ns.length) return ns;
  // Repli pour les implémentations DOM incomplètes.
  return Array.from(root.getElementsByTagName("*")).filter((e) => e.localName === tag);
}
function text(root: Element | Document, tag: string): string | undefined {
  return els(root, tag)[0]?.textContent?.trim() || undefined;
}

function xml(content: string): Document {
  const doc = new DOMParser().parseFromString(content, "application/xml");
  if (doc.getElementsByTagName("parsererror").length) throw new ImportError("Fichier XML illisible ou corrompu.");
  return doc;
}

function finish(name: string | undefined, fallbackName: string, points: TrackPoint[], times: (number | undefined)[]): ParsedActivity {
  if (points.length < 2) throw new ImportError("Aucun point GPS trouvé dans ce fichier.");
  const t = times.filter((x): x is number => x !== undefined && !Number.isNaN(x));
  const start = t.length ? Math.min(...t) : Date.now();
  const end = t.length ? Math.max(...t) : undefined;
  return {
    name: name || fallbackName,
    date: new Date(start).toISOString(),
    points,
    durationS: end !== undefined && end > start ? Math.round((end - start) / 1000) : undefined,
  };
}

export function parseGpx(content: string, fallbackName = "Sortie GPX"): ParsedActivity {
  const doc = xml(content);
  let nodes = els(doc, "trkpt");
  if (!nodes.length) nodes = els(doc, "rtept");
  const points: TrackPoint[] = [];
  const times: (number | undefined)[] = [];
  for (const n of nodes) {
    const lat = num(n.getAttribute("lat"));
    const lon = num(n.getAttribute("lon"));
    if (lat === undefined || lon === undefined || Number.isNaN(lat) || Number.isNaN(lon)) continue;
    const ele = num(text(n, "ele"));
    points.push(ele === undefined || Number.isNaN(ele) ? [lon, lat] : [lon, lat, ele]);
    const t = text(n, "time");
    times.push(t ? Date.parse(t) : undefined);
  }
  const trk = els(doc, "trk")[0];
  const name = (trk && text(trk, "name")) ?? text(doc, "name");
  return finish(name, fallbackName, points, times);
}

export function parseTcx(content: string, fallbackName = "Sortie TCX"): ParsedActivity {
  const doc = xml(content);
  const points: TrackPoint[] = [];
  const times: (number | undefined)[] = [];
  for (const tp of els(doc, "Trackpoint")) {
    const lat = num(text(tp, "LatitudeDegrees"));
    const lon = num(text(tp, "LongitudeDegrees"));
    if (lat === undefined || lon === undefined) continue; // points sans GPS (pause, capteur seul)
    const ele = num(text(tp, "AltitudeMeters"));
    points.push(ele === undefined ? [lon, lat] : [lon, lat, ele]);
    const t = text(tp, "Time");
    times.push(t ? Date.parse(t) : undefined);
  }
  return finish(text(doc, "Notes") ?? undefined, fallbackName, points, times);
}

export async function parseFit(buffer: ArrayBuffer, fallbackName = "Sortie FIT"): Promise<ParsedActivity> {
  const { default: FitParser } = await import("fit-file-parser");
  // force: true = tolère les fichiers légèrement corrompus (coupure de batterie du compteur…).
  const parser = new FitParser({ force: true, speedUnit: "km/h", lengthUnit: "m", mode: "list" });
  let data;
  try {
    data = await parser.parseAsync(buffer);
  } catch (e) {
    throw new ImportError(`Fichier FIT illisible : ${String(e)}`);
  }
  const points: TrackPoint[] = [];
  const times: (number | undefined)[] = [];
  for (const r of data.records ?? []) {
    const rec = r as typeof r & { enhanced_altitude?: number; timestamp?: string | Date };
    if (typeof r.position_lat !== "number" || typeof r.position_long !== "number") continue;
    const ele = rec.enhanced_altitude ?? r.altitude;
    points.push(typeof ele === "number" ? [r.position_long, r.position_lat, ele] : [r.position_long, r.position_lat]);
    times.push(rec.timestamp ? new Date(rec.timestamp).getTime() : undefined);
  }
  return finish(undefined, fallbackName, points, times);
}

export async function parseActivityFile(file: File): Promise<ParsedActivity> {
  const ext = file.name.split(".").pop()?.toLowerCase();
  const base = file.name.replace(/\.[^.]+$/, "");
  if (file.size > 30 * 1024 * 1024) throw new ImportError("Fichier trop volumineux (30 Mo maximum).");
  if (ext === "gpx") return parseGpx(await file.text(), base);
  if (ext === "tcx") return parseTcx(await file.text(), base);
  if (ext === "fit") return parseFit(await file.arrayBuffer(), base);
  throw new ImportError("Format non pris en charge : utilise un fichier .gpx, .tcx ou .fit (non compressé).");
}

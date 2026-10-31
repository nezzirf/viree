// MapLibre 6 charge son web worker via une URL dynamique que le bundler ne suit pas.
// On copie le worker dans public/ (version toujours synchronisée avec node_modules)
// et MapView appelle setWorkerUrl("/maplibre/maplibre-gl-worker.mjs").
import { copyFileSync, mkdirSync } from "node:fs";
const src = new URL("../node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs", import.meta.url);
const dir = new URL("../public/maplibre/", import.meta.url);
mkdirSync(dir, { recursive: true });
copyFileSync(src, new URL("maplibre-gl-worker.mjs", dir));

// Test de fumée dans un vrai navigateur (Chromium/Playwright).
// Prérequis : `ROUTING_PROVIDER=demo npm run build && ROUTING_PROVIDER=demo npm start` dans un autre terminal.
// Usage : node scripts/smoke.mjs [url] [dossier-captures]
// Les tuiles OpenFreeMap sont remplacées par un style vide pour ne pas solliciter le service.
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const BASE = process.argv[2] ?? "http://localhost:3000";
const OUT = process.argv[3] ?? "screenshots";
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader"] });
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  geolocation: { latitude: 45.1885, longitude: 5.7245 },
  permissions: ["geolocation"],
  locale: "fr-FR",
});
await ctx.route("https://tiles.openfreemap.org/**", (r) =>
  r.fulfill({ json: { version: 8, sources: {}, layers: [{ id: "bg", type: "background", paint: { "background-color": "#121a23" } }] } }),
);
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));

const step = async (name, fn) => {
  await fn();
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: false });
  console.log("✓", name);
};

await step("01-accueil", async () => {
  await page.goto(BASE);
  await page.getByRole("button", { name: "Utiliser ma position" }).click();
  await page.getByText("Ma position").waitFor();
});
await step("02-boucle", async () => {
  await page.getByRole("button", { name: "Tracer ma boucle" }).click();
  await page.getByText("↻ Autre circuit").waitFor();
  await page.waitForTimeout(800);
});
await step("03-boucle-carte", async () => {
  await page.getByRole("button", { name: "↻ Autre circuit" }).click();
  await page.waitForTimeout(800);
  await page.evaluate(() => window.scrollTo(0, 0));
});
await step("04-suivre", async () => {
  await page.getByRole("link", { name: "▶ Suivre" }).click();
  await page.getByText("km restants").waitFor();
  await page.getByRole("button", { name: "● Démarrer" }).click();
  // Simule un déplacement le long du tracé.
  for (const [lat, lon] of [[45.1885, 5.7245], [45.19, 5.726], [45.192, 5.728]]) {
    await ctx.setGeolocation({ latitude: lat, longitude: lon, accuracy: 5 });
    await page.waitForTimeout(400);
  }
});
await step("05-sortie-enregistree", async () => {
  await page.getByRole("button", { name: "■ Terminer" }).click();
  await page.waitForURL("**/sorties");
  await page.getByText("Historique").waitFor();
  await page.waitForTimeout(500);
});
await step("06-import-gpx", async () => {
  // Petit GPX avec une montée de 3,5 km à ~6 % → badge « Premier col ».
  const pts = Array.from({ length: 80 }, (_, i) => `<trkpt lat="${(45.0 + i * 0.0004).toFixed(6)}" lon="5.900000"><ele>${(400 + i * 2.7).toFixed(1)}</ele><time>2026-10-0${1}T08:${String(Math.floor(i / 2)).padStart(2, "0")}:00Z</time></trkpt>`).join("");
  const gpx = `<?xml version="1.0"?><gpx version="1.1" xmlns="http://www.topografix.com/GPX/1/1"><trk><name>Montée test</name><trkseg>${pts}</trkseg></trk></gpx>`;
  await page.locator("#file").setInputFiles({ name: "montee.gpx", mimeType: "application/gpx+xml", buffer: Buffer.from(gpx) });
  await page.getByText("1 sortie(s) importée(s).").waitFor();
  await page.evaluate(() => window.scrollTo(0, 0));
});
await step("07-cols", async () => {
  await page.route("**/api/passes**", (r) =>
    r.fulfill({
      json: [
        { id: 1, name: "Col de Porte", ele: 1326, lngLat: [5.7719, 45.2903], kind: "col", distanceKm: 11.9 },
        { id: 2, name: "Col du Coq", ele: 1434, lngLat: [5.8563, 45.2972], kind: "col", distanceKm: 15.6 },
        { id: 3, name: "Col de la Croix de Chamrousse", ele: 2253, lngLat: [5.8925, 45.1252], kind: "col", distanceKm: 14.8 },
      ],
    }),
  );
  await page.getByRole("link", { name: "Cols" }).click();
  await page.getByText("Col de Porte").first().waitFor();
  await page.getByRole("button", { name: /Col du Coq/ }).click();
  await page.getByRole("button", { name: "Tracer vers ce col" }).click();
  await page.getByText(/Col du Coq \(1434 m\)/).waitFor();
  await page.waitForTimeout(800);
});
for (const [name, path] of [["08-classement", "/classement"], ["09-groupes", "/groupes"], ["10-compte", "/compte"]]) {
  await step(name, async () => {
    await page.goto(BASE + path);
    await page.waitForTimeout(800);
  });
}
await browser.close();
if (errors.length) {
  console.error("Erreurs JS :", errors);
  process.exit(1);
}

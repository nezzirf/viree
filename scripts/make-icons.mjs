// Génère les icônes PNG de la PWA à partir de public/icons/icon.svg (Playwright requis).
// Usage : node scripts/make-icons.mjs
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
import { readFileSync } from "node:fs";
const svg = readFileSync(new URL("../public/icons/icon.svg", import.meta.url), "utf8");
const browser = await chromium.launch();
for (const size of [192, 512]) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  // Fond plein (icône « maskable ») : le dessin est réduit à 80 % pour la zone de sécurité.
  await page.setContent(`<body style="margin:0;background:#D4FF3A;display:grid;place-items:center;height:100vh">
    <div style="width:${size * 0.8}px;height:${size * 0.8}px">${svg.replace("<svg", '<svg width="100%" height="100%"')}</div></body>`);
  await page.screenshot({ path: new URL(`../public/icons/icon-${size}.png`, import.meta.url).pathname });
}
await browser.close();

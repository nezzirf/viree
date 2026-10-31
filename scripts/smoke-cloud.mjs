// Test de fumée des pages « en ligne » (compte, classement, à plusieurs) avec un faux Supabase.
// Prérequis : build avec NEXT_PUBLIC_SUPABASE_URL=https://demo.supabase.co et une clé quelconque, puis `npm start`.
// Usage : node scripts/smoke-cloud.mjs [url] [dossier-captures]
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const BASE = process.argv[2] ?? "http://localhost:3000";
const OUT = process.argv[3] ?? "screenshots";
mkdirSync(OUT, { recursive: true });
const ME = "00000000-0000-0000-0000-000000000001";

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, locale: "fr-FR" });
const calls = [];
await ctx.route("https://demo.supabase.co/**", async (r) => {
  const url = new URL(r.request().url());
  const accept = r.request().headers()["accept"] ?? "";
  calls.push(`${r.request().method()} ${url.pathname}`);
  if (url.pathname === "/rest/v1/profiles") {
    const p = { id: ME, username: "Camille", region: "Auvergne-Rhône-Alpes" };
    return r.fulfill({ json: accept.includes("object") ? p : [p] });
  }
  if (url.pathname === "/rest/v1/rpc/leaderboard_month") {
    return r.fulfill({
      json: [
        { rank: 1, user_id: "a", username: "Lou_42", total_km: 612.4, rides: 14 },
        { rank: 2, user_id: ME, username: "Camille", total_km: 540.1, rides: 11 },
        { rank: 3, user_id: "c", username: "Pédale douce", total_km: 498.0, rides: 12 },
        { rank: 4, user_id: "d", username: "Max", total_km: 310.7, rides: 6 },
        { rank: 5, user_id: "e", username: "Inès", total_km: 205.2, rides: 5 },
      ],
    });
  }
  if (url.pathname === "/rest/v1/group_rides") {
    const soon = new Date(Date.now() + 2 * 86400000).toISOString();
    return r.fulfill({
      json: [
        { id: 1, creator: "a", title: "Tour du Vercors tranquille", description: "Pause café à mi-parcours.", place_name: "Place Victor Hugo, Grenoble", lat: 45.19, lon: 5.72, start_at: soon, pace: "cool", speed_kmh: 22, distance_km: 70, region: "Auvergne-Rhône-Alpes", profiles: { username: "Lou_42" }, group_ride_members: [{ user_id: "a" }, { user_id: "c" }] },
        { id: 2, creator: ME, title: "Chartreuse : Porte + Cucheron", description: null, place_name: "Saint-Égrève", lat: 45.23, lon: 5.68, start_at: soon, pace: "rapide", speed_kmh: 28, distance_km: 85, region: "Auvergne-Rhône-Alpes", profiles: { username: "Camille" }, group_ride_members: [{ user_id: ME }] },
      ],
    });
  }
  if (url.pathname.startsWith("/rest/v1/")) return r.fulfill({ status: 201, json: [] });
  return r.fulfill({ status: 200, json: {} });
});
// Fausse session déjà ouverte (supabase-js la lit dans localStorage sans appel réseau si elle n'est pas expirée).
await ctx.addInitScript((me) => {
  const exp = Math.floor(Date.now() / 1000) + 3600;
  localStorage.setItem(
    "sb-demo-auth-token",
    JSON.stringify({ access_token: "x", refresh_token: "y", token_type: "bearer", expires_in: 3600, expires_at: exp, user: { id: me, email: "camille@example.org", aud: "authenticated", role: "authenticated", app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() } }),
  );
}, ME);

const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
for (const [name, path, text] of [
  ["c1-classement", "/classement", "Il te manque"],
  ["c2-groupes", "/groupes", "Tour du Vercors tranquille"],
  ["c3-compte", "/compte", "Connecté : camille@example.org"],
]) {
  await page.goto(BASE + path);
  await page.getByText(text).first().waitFor({ timeout: 10000 });
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/${name}.png` });
  console.log("✓", name);
}
await browser.close();
if (errors.length) {
  console.error("Erreurs JS :", errors);
  process.exit(1);
}

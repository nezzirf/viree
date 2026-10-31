/*
 * Service worker Virée — volontairement minimal.
 *  - Pages et assets de l'app : « réseau d'abord, cache en secours » → l'app s'ouvre hors connexion.
 *  - /api/* : jamais mis en cache ici (le cache des circuits est géré dans IndexedDB).
 *  - Tuiles de carte : NON mises en cache massivement, pour respecter la politique
 *    d'OpenFreeMap/OSM (pas de pré-téléchargement de zones). Le cache HTTP du navigateur suffit.
 */
const CACHE = "viree-v1";
const SHELL = ["/", "/cols", "/sorties", "/suivre", "/icons/icon.svg"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        if (res.ok && (e.request.mode === "navigate" || url.pathname.startsWith("/_next/static/"))) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy));
        }
        return res;
      })
      .catch(() => caches.match(e.request).then((r) => r || caches.match("/"))),
  );
});

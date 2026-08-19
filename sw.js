/* Service worker — coquille hors ligne.
   Les données ne passent jamais par ici : elles vivent en IndexedDB, sur
   l'appareil. Seuls les fichiers statiques sont mis en cache.

   ⚠️ BUMPER `VERSION` À CHAQUE PUBLICATION. Le nom du cache est ce qui déclenche
   la purge de l'ancien : tant qu'il ne change pas, `activate` n'a rien à
   supprimer et l'ancienne version survit indéfiniment. */

const VERSION = "mes-comptes-v10";

const SHELL = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./assets/app.css",
  "./assets/data.js",
  "./assets/charts.js",
  "./assets/views.js",
  "./assets/app.js",
  "./vendor/xlsx.mini.min.js",
  "./icons/icon.svg",
  "./icons/icon-180.png",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
];

/** Les fichiers qui changent à chaque version. Le reste — bibliothèque, icônes —
    est immuable et peut rester servi depuis le cache sans risque. */
function isAppFile(url) {
  return (
    url.pathname.endsWith("/") ||
    url.pathname.endsWith("/index.html") ||
    url.pathname.includes("/assets/") ||
    url.pathname.endsWith(".webmanifest")
  );
}

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches
      .open(VERSION)
      // `reload` court-circuite le cache HTTP du navigateur : sans lui, on
      // remplirait le cache neuf avec les anciens fichiers.
      .then((c) => c.addAll(SHELL.map((u) => new Request(u, { cache: "reload" }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;

  // Navigation et fichiers de l'application : RÉSEAU D'ABORD, cache en secours.
  // En cache d'abord, on servait toujours la version précédente et la nouvelle
  // n'apparaissait qu'au chargement suivant — un train de retard permanent.
  if (req.mode === "navigate" || isAppFile(url)) {
    e.respondWith(
      fetch(req)
        .then((res) => {
          if (res && res.status === 200) {
            // Une navigation n'est rangée sous « index.html » que si la réponse est
            // bien du HTML : ouvrir /sw.js dans la barre d'adresse est une
            // navigation, et l'y ranger écraserait la coquille hors ligne.
            const isShell = req.mode === "navigate" && (res.headers.get("content-type") || "").includes("text/html");
            const copy = res.clone();
            caches.open(VERSION).then((c) => c.put(isShell ? "./index.html" : req, copy));
          }
          return res;
        })
        .catch(() => caches.match(req).then((hit) => hit || caches.match("./index.html")))
    );
    return;
  }

  // Bibliothèque et icônes : cache d'abord, revalidation en arrière-plan.
  e.respondWith(
    caches.match(req).then((hit) => {
      const net = fetch(req)
        .then((res) => {
          if (res && res.status === 200) {
            const copy = res.clone();
            caches.open(VERSION).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => hit);
      return hit || net;
    })
  );
});

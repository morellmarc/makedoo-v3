// ── Service Worker Makedoo — garantit l'ouverture de l'app même sans connexion ──
// Stratégie : réseau en priorité (pour toujours avoir la dernière version en ligne),
// bascule automatique sur la copie locale uniquement si le réseau échoue (hors-ligne réel).

const CACHE_VERSION = 'makedoo-cache-v1';
const APP_SHELL_URL = self.registration.scope; // l'URL de la page elle-même (index.html)
const URLS_TO_CACHE = [
  APP_SHELL_URL,
  'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js'
];

self.addEventListener('install', (event) => {
  self.skipWaiting(); // active la nouvelle version immédiatement, sans attendre la fermeture des anciens onglets
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => {
      return Promise.all(
        URLS_TO_CACHE.map((url) =>
          fetch(url, { cache: 'no-store' })
            .then((res) => { if (res.ok) return cache.put(url, res); })
            .catch(() => {}) // pas grave si un élément échoue à la mise en cache initiale
        )
      );
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(
        names
          .filter((name) => name !== CACHE_VERSION)
          .map((name) => caches.delete(name)) // nettoie les anciennes versions du cache
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return; // ne jamais intercepter les requêtes API (POST vers le serveur)

  // Ne mettre en cache / servir hors-ligne QUE la page elle-même et les ressources statiques (CDN) —
  // jamais les appels au serveur Makedoo (traduction, STT, TTS, manifestes, etc.), qui doivent toujours
  // être frais et échouer normalement si hors-ligne.
  const isAppShell = req.url === APP_SHELL_URL || req.mode === 'navigate';
  const isCachedAsset = URLS_TO_CACHE.includes(req.url);
  if (!isAppShell && !isCachedAsset) return;

  event.respondWith(
    fetch(req).then((res) => {
      if (res && res.ok) {
        const resClone = res.clone();
        caches.open(CACHE_VERSION).then((cache) => cache.put(isAppShell ? APP_SHELL_URL : req, resClone));
      }
      return res;
    }).catch(() => {
      return caches.match(isAppShell ? APP_SHELL_URL : req).then((cached) => {
        return cached || new Response('Hors ligne — cette page n\'a pas encore été mise en cache.', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
      });
    })
  );
});

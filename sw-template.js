// Service Worker für ECHO RACER (wird beim Build mit Dateiliste und Version befüllt).
const CACHE = '__VERSION__';
const ASSETS = __ASSETS__;

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE && k.startsWith('echo-racer-')).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // Fremde Server (z.B. PeerJS-Vermittlung) nicht anfassen
  if (url.origin !== self.location.origin) return;
  if (req.mode === 'navigate') {
    // Seite: erst Netz (für Updates), sonst Cache
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put('./', copy));
          return res;
        })
        .catch(() => caches.match('./', { ignoreVary: true }).then((r) => r || caches.match('./index.html', { ignoreVary: true })))
    );
    return;
  }
  e.respondWith(
    // ignoreVary: Modul-Skripte werden mit Origin-Header angefragt, Server antworten oft mit "Vary: Origin"
    caches.match(req, { ignoreSearch: true, ignoreVary: true }).then(
      (hit) =>
        hit ||
        fetch(req).then((res) => {
          if (res.ok && res.type === 'basic') {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        })
    )
  );
});

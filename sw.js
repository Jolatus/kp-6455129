/* Polarlicht-Radar: hält die App offline bereit und zeigt Benachrichtigungen des Weckers.
   Mit Netz kommt die Seite immer frisch vom Server, ohne Netz aus dem Speicher.
   Kartenkacheln kommen aus dem Kartenpaket, das die App auf Knopfdruck speichert (pr-tiles-v1).
   Wetterdaten werden nicht hier zwischengespeichert, das macht die App selbst. */
const CACHE = 'polarlicht-radar-v7';
const TILES = 'pr-tiles-v1';
const SHELL = ['./', './index.html', './radar-core.js?v=6', './manifest.webmanifest', './icon-512.png'];
/* Kartenbibliothek von cdnjs, damit die Karte auch ohne Netz startet */
const LIBS = ['https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js', 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css'];

self.addEventListener('install', e => {
  /* cache: 'reload' umgeht den Browser-Cache, damit wirklich die neue Version gespeichert wird */
  e.waitUntil(caches.open(CACHE).then(c => Promise.all([
    c.addAll(SHELL.map(u => new Request(u, { cache: 'reload' }))),
    Promise.all(LIBS.map(u => c.add(new Request(u, { mode: 'cors' })).catch(() => { /* Bibliothek später nachladen */ })))
  ])).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  /* alte App-Versionen löschen, das Kartenpaket behalten */
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE && k !== TILES).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET') return;
  /* Kartenkacheln: erst aus dem gespeicherten Paket, sonst aus dem Netz */
  if (url.hostname === 'tile.openstreetmap.org') {
    e.respondWith(caches.open(TILES).then(async c => (await c.match('https://tile.openstreetmap.org' + url.pathname)) || fetch(req).catch(() => new Response('', { status: 504 }))));
    return;
  }
  if (LIBS.includes(url.href)) {
    e.respondWith(caches.open(CACHE).then(async c => (await c.match(url.href)) || fetch(req)));
    return;
  }
  if (url.origin !== self.location.origin) return;
  /* Kartenpaket selbst nicht doppelt speichern, die App legt es in TILES ab */
  if (/karte-offline\.(bin|json)$/.test(url.pathname)) return;
  /* Seite selbst: zuerst Netz (höchstens 5 Sekunden warten), sonst Speicher */
  if (req.mode === 'navigate') {
    e.respondWith((async () => {
      const c = await caches.open(CACHE);
      try {
        const net = await Promise.race([fetch(req, { cache: 'no-cache' }), new Promise((_, rej) => setTimeout(() => rej(new Error('langsam')), 5000))]);
        if (net.ok) c.put('./', net.clone());
        return net;
      } catch (err) {
        return (await c.match('./')) || (await c.match('./index.html')) || Response.error();
      }
    })());
    return;
  }
  /* Übrige eigene Dateien (versioniert): aus dem Speicher, im Hintergrund aktualisieren */
  e.respondWith(caches.open(CACHE).then(async c => {
    const hit = await c.match(req);
    const net = fetch(req).then(r => { if (r.ok) c.put(req, r.clone()); return r; }).catch(() => hit);
    return hit || net;
  }));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(cs => cs.length ? cs[0].focus() : self.clients.openWindow('./')));
});

const CACHE = 'fitness-tracker-v3';
const SHELL = ['./', './index.html', './manifest.json', './icon-192.png', './icon-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  // Nikdy necachujeme volania na Google Apps Script — dáta majú byť vždy čerstvé.
  if (e.request.url.includes('script.google.com')) return;

  // Network-first: skús vždy najprv sieť (najnovšiu verziu), cache použi len ako
  // zálohu pri offline. Vďaka tomu sa akékoľvek úpravy prejavia hneď po nahratí.
  e.respondWith(
    fetch(e.request)
      .then(response => {
        const copy = response.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy));
        return response;
      })
      .catch(() => caches.match(e.request))
  );
});

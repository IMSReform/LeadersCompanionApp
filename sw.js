// ── ZDA President App service worker (PWA offline support) ──
//
// Duplicated from the worker app's sw.js (Urenregistratie app/sw.js) — the
// logic is fully generic (it derives its cache scope from
// `self.registration.scope` rather than hardcoding any file names), so it
// works unchanged for this app. Only the cache name below was changed so
// the two apps never share a cache-storage key if they ever end up served
// from the same origin.
//
// This file must be uploaded to the same folder/deploy as
// ZDA_President_App.html (e.g. next to it on Netlify) so it's reachable at
// ".../sw.js".
//
// Caching strategy: the HTML document itself (navigation requests) is
// network-FIRST - always fetch the latest version when there's a
// connection, only falling back to the cached copy when genuinely
// offline. That's what makes an update pushed to Netlify actually reach
// already-installed devices instead of them being stuck on old cached
// code forever. Other same-origin assets stay cache-first (they rarely
// change and cache-first keeps things fast).
const CACHE = 'zda-president-v1';
const SHELL_URL = self.registration.scope;
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.add(SHELL_URL)).catch(() => {})
  );
  // No self.skipWaiting() here anymore: a freshly-installed worker now
  // parks itself in the "waiting" state instead of taking over
  // immediately. The main page listens for that and shows an "update
  // available" bar so the user can apply it on their own terms -
  // skipWaiting only runs now in response to that button, via the
  // message listener below. Without this, a deploy could silently
  // reload someone's tab out from under them mid-edit.
});
self.addEventListener('message', e => {
  if (e.data === 'SKIP_WAITING') self.skipWaiting();
});
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(ks => Promise.all(
      ks.filter(k => k !== CACHE).map(k => caches.delete(k))
    ))
  );
  self.clients.claim();
});
self.addEventListener('fetch', e => {
  var req = e.request;
  var isNav = req.mode === 'navigate' ||
    (req.method === 'GET' && (req.headers.get('accept') || '').indexOf('text/html') !== -1);
  if (req.url.startsWith(self.location.origin)) {
    if (isNav) {
      // App shell itself: always try the network first so updates show up
      // the moment there's connectivity. Cache the fresh copy as we go, and
      // fall back to whatever was last cached (or the precached shell) when
      // there's no network at all - this is what makes "closed the app
      // while offline" still open instead of failing to load.
      e.respondWith(
        fetch(req).then(res => {
          if (res && res.status === 200) {
            var rc = res.clone();
            caches.open(CACHE).then(c => c.put(req, rc));
          }
          return res;
        }).catch(() =>
          caches.match(req).then(cached => cached || caches.match(SHELL_URL))
        )
      );
    } else {
      e.respondWith(
        caches.match(req).then(cached => {
          if (cached) return cached;
          return fetch(req).then(res => {
            if (res && res.status === 200 && res.type !== 'opaque') {
              var rc = res.clone();
              caches.open(CACHE).then(c => c.put(req, rc));
            }
            return res;
          });
        })
      );
    }
  } else {
    // External: try network, fall back to cache
    e.respondWith(
      fetch(req).catch(() => caches.match(req))
    );
  }
});

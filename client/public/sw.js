// xenios research service worker — conservative app-shell cache only.
//
// THE PRIVACY RULE THIS FILE ENFORCES: nothing personal, priced, or private is
// ever cached. Every /api request, every non-GET, every cross-origin request,
// and every response that varies by session passes straight through to the
// network. What we cache is the static, identical-for-everyone shell: the
// built JS/CSS/font/image assets and an offline fallback page. A member's
// catalog, prices, orders, or account data never touch Cache Storage, so a
// shared or stolen device cannot read another session's world out of the cache.
//
// Versioning: bump XENIOS_PWA_VERSION to invalidate every prior cache; activate
// deletes anything that is not the current version. The page can post
// {type: "SKIP_WAITING"} to promote an updated worker immediately (update UX).

const XENIOS_PWA_VERSION = "v1";
const STATIC_CACHE = `xenios-static-${XENIOS_PWA_VERSION}`;
const OFFLINE_URL = "/offline.html";

// Paths that must NEVER be cached, matched by prefix.
const NEVER_CACHE_PREFIXES = ["/api/"];

// Only same-origin GETs for clearly-static assets are cacheable.
const STATIC_DESTINATIONS = new Set(["style", "script", "font", "image"]);

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll([OFFLINE_URL])),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== STATIC_CACHE)
          .map((key) => caches.delete(key)),
      ),
    ).then(() => self.clients.claim()),
  );
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

function isNeverCache(url) {
  return NEVER_CACHE_PREFIXES.some((prefix) => url.pathname.startsWith(prefix));
}

self.addEventListener("fetch", (event) => {
  const request = event.request;

  // Non-GET: never intercepted, never cached.
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Cross-origin: never intercepted, never cached.
  if (url.origin !== self.location.origin) return;

  // /api and any other never-cache path: straight to the network, no fallback
  // to cache (an API response must never be served stale from a cache we do
  // not populate anyway).
  if (isNeverCache(url)) return;

  // Navigations: network first, offline shell only when the network is gone.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() => caches.match(OFFLINE_URL)),
    );
    return;
  }

  // Static assets: cache-first with network fill. Only known static
  // destinations are eligible, so a JSON fetch can never slip into the cache.
  if (STATIC_DESTINATIONS.has(request.destination)) {
    event.respondWith(
      caches.match(request).then((hit) => {
        if (hit) return hit;
        return fetch(request).then((response) => {
          if (response.ok && (response.type === "basic")) {
            const copy = response.clone();
            caches.open(STATIC_CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        });
      }),
    );
  }
  // Everything else (JSON, EventSource, etc.): untouched network behavior.
});

/// <reference lib="webworker" />
// shipwright service worker (hand-rolled, Turbopack-agnostic). Bump CACHE_VERSION
// on each deploy to invalidate old caches. Strategy:
//  - navigations: network-first → cached shell → /offline
//  - /_next/static (immutable, hashed): cache-first
//  - other same-origin GET: stale-while-revalidate
//  - non-GET / cross-origin: passthrough (network)
//  - push: show a notification; click: focus/open the target URL

const CACHE_VERSION = "v1";
const CACHE_NAME = `shipwright-${CACHE_VERSION}`;
const OFFLINE_URL = "/offline";
const PRECACHE = ["/", OFFLINE_URL, "/manifest.webmanifest"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      await cache.addAll(PRECACHE);
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Dynamic by nature — never cache. API routes and RSC navigation payloads
  // (Next App Router client-side navigations carry `?_rsc=` / an `RSC` header).
  // Caching these serves stale data right after a Server Action mutation, so
  // pass them straight to the network.
  if (
    url.pathname.startsWith("/api/") ||
    url.searchParams.has("_rsc") ||
    request.headers.get("RSC") === "1"
  ) {
    return;
  }

  // Navigations: network-first, fall back to cached shell, then offline page.
  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(request);
          return fresh;
        } catch {
          const cache = await caches.open(CACHE_NAME);
          return (
            (await cache.match(request)) ??
            (await cache.match("/")) ??
            (await cache.match(OFFLINE_URL)) ??
            Response.error()
          );
        }
      })(),
    );
    return;
  }

  // Immutable build assets: cache-first.
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_NAME);
        const cached = await cache.match(request);
        if (cached) return cached;
        const fresh = await fetch(request);
        cache.put(request, fresh.clone());
        return fresh;
      })(),
    );
    return;
  }

  // Other same-origin GET: stale-while-revalidate.
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(request);
      const network = fetch(request)
        .then((response) => {
          if (response && response.status === 200) {
            cache.put(request, response.clone());
          }
          return response;
        })
        .catch(() => cached);
      return cached ?? network;
    })(),
  );
});

// Web push: render the payload as a notification.
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "Notification", body: event.data ? event.data.text() : "" };
  }
  const title = data.title || "Shipwright";
  const options = {
    body: data.body || "",
    tag: data.tag,
    data: { url: data.url || "/" },
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

// Notification click: focus an existing tab for the URL or open a new one.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl =
    (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      for (const client of all) {
        if (client.url.includes(targetUrl) && "focus" in client) {
          return client.focus();
        }
      }
      return self.clients.openWindow(targetUrl);
    })(),
  );
});

// Service Worker for Mobile and Desktop OS-Level System Notifications & Web Push
const CACHE_NAME = "faceprep-pwa-v3";
const STATIC_ASSETS = [
  "/",
  "/faceprep-fav.png",
  "/manifest.json",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/maskable-512.png",
  "/icons/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS)).catch(() => {})
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) return caches.delete(key);
        })
      )
    ).then(() => self.clients.claim())
  );
});

// Cache strategy: network-first for navigation, cache-fallback for images/shell
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request).catch(async () => {
        const cached = await caches.match("/");
        return cached || new Response("Offline", { status: 503, statusText: "Offline" });
      })
    );
    return;
  }

  if (event.request.destination === "image" || event.request.url.includes("faceprep-fav")) {
    event.respondWith(
      caches.match(event.request).then((cached) => cached || fetch(event.request))
    );
  }
});

// Handle incoming background Web Push from Google FCM / Apple APNs (even when tab is closed)
self.addEventListener("push", (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch (_) {
    payload = { title: "New Notification", message: event.data.text() };
  }

  const title = payload.title || "FACE Prep E-Campus Alert";
  const options = {
    body: payload.message || payload.body || "",
    icon: payload.icon || "/faceprep-fav.png",
    badge: payload.badge || "/faceprep-fav.png",
    tag: payload.tag || `push_${Date.now()}`,
    vibrate: [200, 100, 200],
    data: {
      url: payload.link || payload.url || "/",
      ...(payload.data || {})
    },
    actions: [
      { action: "open", title: "View" },
      { action: "dismiss", title: "Dismiss" }
    ]
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// Handle notification click: focus existing tab or open URL
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  if (event.action === "dismiss") return;

  const targetUrl = event.notification.data?.url || "/";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ("focus" in client) {
          client.focus();
          if ("navigate" in client && targetUrl && targetUrl !== "#") {
            client.navigate(targetUrl);
          }
          return;
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});

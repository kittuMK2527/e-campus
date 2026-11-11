// Service Worker for Mobile and Desktop OS-Level System Notifications & Web Push
self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
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
      // If a window is already open, focus it and navigate
      for (const client of clientList) {
        if ("focus" in client) {
          client.focus();
          if ("navigate" in client && targetUrl && targetUrl !== "#") {
            client.navigate(targetUrl);
          }
          return;
        }
      }
      // Otherwise open a new window
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});


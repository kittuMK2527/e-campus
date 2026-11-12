export type DeviceNotificationPermission = "default" | "granted" | "denied" | "unsupported";

export interface DeviceNotificationOptions {
  title: string;
  message: string;
  link?: string;
  tag?: string;
}

/**
 * Checks whether the application is running in installed PWA standalone mode
 * (iOS Web Clip, Android PWA, Windows/macOS installed web app)
 */
export function isAppInstalled(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as any).standalone === true ||
    document.referrer.includes("android-app://")
  );
}

/**
 * Detects iOS device (iPhone / iPad / iPod)
 */
export function isIOSDevice(): boolean {
  if (typeof window === "undefined" || !navigator) return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
}

/**
 * Converts standard Base64 URL string to Uint8Array for PushManager subscription
 */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

/**
 * Registers the background Service Worker for Push & Offline Shell
 */
export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
    return null;
  }
  try {
    const reg = await navigator.serviceWorker.register("/sw.js", {
      scope: "/",
      updateViaCache: "none",
    });
    return reg;
  } catch (err) {
    console.warn("[PWA] ServiceWorker registration failed:", err);
    return null;
  }
}

/**
 * Delivers an OS-level system notification on mobile or desktop.
 * On mobile devices (Android Chrome, iOS PWA), uses ServiceWorkerRegistration.showNotification().
 * On desktop, falls back to window.Notification if SW is not ready.
 */
export async function sendDeviceSystemNotification(opts: DeviceNotificationOptions): Promise<boolean> {
  if (typeof window === "undefined") return false;

  const currentStatus = getDeviceNotificationStatus();
  if (currentStatus.permission !== "granted") return false;

  const title = opts.title || "FACE Prep E-Campus";
  const notifOptions: NotificationOptions = {
    body: opts.message,
    icon: "/faceprep-fav.png",
    badge: "/faceprep-fav.png",
    tag: opts.tag || `fp_notif_${Date.now()}`,
    data: {
      url: opts.link || "/",
    },
  };

  // 1. Mobile-First: Service Worker showNotification (Mandatory on Android & iOS PWA)
  if ("serviceWorker" in navigator) {
    try {
      let reg = await navigator.serviceWorker.getRegistration("/sw.js");
      if (!reg) {
        reg = (await registerServiceWorker()) || undefined;
      }
      if (reg && reg.showNotification) {
        await reg.showNotification(title, notifOptions);
        if ("vibrate" in navigator) {
          try { navigator.vibrate([150, 80, 150]); } catch (_) {}
        }
        return true;
      }
    } catch (swErr) {
      console.warn("[PWA] ServiceWorker showNotification failed, trying fallback:", swErr);
    }
  }

  // 2. Desktop Fallback: Window Notification
  if ("Notification" in window) {
    try {
      new Notification(title, notifOptions);
      return true;
    } catch (_) {
      return false;
    }
  }

  return false;
}

/**
 * Requests device notification permission from the browser / operating system.
 * Handles iOS Safari standalone requirements with clear user instructions.
 */
export async function requestDeviceNotificationPermission(): Promise<{
  permission: DeviceNotificationPermission;
  instructions?: string;
}> {
  if (typeof window === "undefined") {
    return { permission: "unsupported", instructions: "Notifications are not supported in this environment." };
  }

  // Check iOS limitation: web push requires app to be added to Home Screen (iOS 16.4+)
  if (isIOSDevice() && !isAppInstalled()) {
    return {
      permission: "unsupported",
      instructions: "On iPhone/iPad, tap the Share button (⎋) and select 'Add to Home Screen' to enable app notifications.",
    };
  }

  if (!("Notification" in window)) {
    return { permission: "unsupported", instructions: "Your browser does not support web notifications." };
  }

  try {
    const perm = await Notification.requestPermission();
    if (perm === "granted") {
      try {
        localStorage.setItem("fp_device_notif_granted", "true");
        localStorage.removeItem("fp_notif_prompt_dismissed_until");
      } catch (_) {}
    }
    return { permission: perm as DeviceNotificationPermission };
  } catch (_) {
    return { permission: "denied" };
  }
}

/**
 * Returns current notification permission state
 */
export function getDeviceNotificationStatus(): {
  permission: DeviceNotificationPermission;
  isSupported: boolean;
  isInstalled: boolean;
} {
  if (typeof window === "undefined") {
    return { permission: "unsupported", isSupported: false, isInstalled: false };
  }

  const isInstalled = isAppInstalled();

  // On iOS browser tab (not installed), Notification API is typically unavailable or restricted
  if (isIOSDevice() && !isInstalled && !("Notification" in window)) {
    return { permission: "unsupported", isSupported: false, isInstalled: false };
  }

  if (!("Notification" in window)) {
    return { permission: "unsupported", isSupported: false, isInstalled };
  }

  const rawPerm = Notification.permission as DeviceNotificationPermission;
  return { permission: rawPerm, isSupported: true, isInstalled };
}

/**
 * Registers real Web Push subscription with the browser's PushManager and syncs to backend
 */
export async function registerPushSubscription(data: {
  userId?: string;
  role?: string;
  collegeId?: string;
}): Promise<boolean> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator) || !("PushManager" in window)) {
    return false;
  }

  const status = getDeviceNotificationStatus();
  if (status.permission !== "granted") return false;

  try {
    const reg = await registerServiceWorker();
    if (!reg) return false;

    // Retrieve VAPID public key from env or endpoint
    let vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!vapidKey) {
      const res = await fetch("/api/push/vapid-key");
      const json = await res.json().catch(() => ({}));
      if (json.success && json.publicKey) {
        vapidKey = json.publicKey;
      }
    }

    if (!vapidKey) {
      console.warn("[PWA] Missing VAPID public key, push subscription deferred.");
      return false;
    }

    // Subscribe via PushManager
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey),
      });
    }

    if (sub) {
      const subJson = sub.toJSON();
      await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subscription: subJson,
          userId: data.userId,
          role: data.role,
          collegeId: data.collegeId,
          userAgent: navigator.userAgent,
        }),
      });

      try {
        localStorage.setItem("fp_push_subscribed", "true");
        localStorage.setItem("fp_device_notif_granted", "true");
      } catch (_) {}
      return true;
    }
  } catch (err) {
    console.warn("[PWA] Push subscription registration notice:", err);
  }

  return false;
}

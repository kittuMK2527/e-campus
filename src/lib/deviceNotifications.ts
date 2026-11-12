export type DeviceNotificationPermission = "default" | "granted" | "denied" | "unsupported";

export interface DeviceNotificationOptions {
  title: string;
  message: string;
  link?: string;
  tag?: string;
  badge?: string;
  icon?: string;
}

/**
 * Detects whether the web application is running in installed standalone mode (PWA).
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
 * Detects iOS devices (iPhone, iPad, iPod).
 */
export function isIOSDevice(): boolean {
  if (typeof window === "undefined") return false;
  const ua = window.navigator.userAgent.toLowerCase();
  return /iphone|ipad|ipod/.test(ua) || (window.navigator.platform === "MacIntel" && window.navigator.maxTouchPoints > 1);
}

/**
 * Comprehensive diagnostic check of the current notification & security environment.
 */
export function checkNotificationEnvironment(): {
  isSecure: boolean;
  hasServiceWorker: boolean;
  hasNotification: boolean;
  permission: DeviceNotificationPermission;
  isMobile: boolean;
  errorMessage?: string;
} {
  if (typeof window === "undefined") {
    return {
      isSecure: false,
      hasServiceWorker: false,
      hasNotification: false,
      permission: "unsupported",
      isMobile: false,
      errorMessage: "Server environment",
    };
  }

  const isSecure =
    window.isSecureContext ||
    window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1";

  const hasServiceWorker = "serviceWorker" in navigator;
  const hasNotification = typeof Notification !== "undefined";
  const isMobile =
    isIOSDevice() ||
    /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(navigator.userAgent.toLowerCase());

  const permission = (hasNotification
    ? Notification.permission
    : "unsupported") as DeviceNotificationPermission;

  let errorMessage: string | undefined;

  if (!isSecure && isMobile) {
    errorMessage = "Mobile system notifications strictly require HTTPS. Run 'npm run dev:https' or access via an HTTPS URL.";
  } else if (isIOSDevice() && !isAppInstalled()) {
    errorMessage = "On iPhone/iPad, Apple requires adding this site to your Home Screen ('Add to Home Screen') before notifications can be triggered.";
  } else if (permission === "denied") {
    errorMessage = "Notification permission is blocked in your browser site settings. Tap the lock/tune icon to allow.";
  } else if (!hasServiceWorker && !hasNotification) {
    errorMessage = "Notifications are not supported in this browser.";
  }

  return {
    isSecure,
    hasServiceWorker,
    hasNotification,
    permission,
    isMobile,
    errorMessage,
  };
}

/**
 * Safely registers the Service Worker for offline shell and Web Push.
 */
export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
    return null;
  }
  try {
    const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
    return reg;
  } catch (err) {
    console.warn("[PWA] ServiceWorker registration failed:", err);
    return null;
  }
}

/**
 * Sends a system tray notification to mobile or desktop device.
 * On mobile browsers (Android Chrome, iOS PWA), calling `new Notification()` throws an Illegal Constructor error.
 * Using `ServiceWorkerRegistration.showNotification()` is mandatory and works universally.
 */
export async function sendDeviceSystemNotification(opts: DeviceNotificationOptions): Promise<boolean> {
  if (typeof window === "undefined") return false;

  const options: NotificationOptions = {
    body: opts.message,
    tag: opts.tag || "fp_general_notif",
    icon: opts.icon || "/faceprep-fav.png",
    badge: opts.badge || "/faceprep-fav.png",
    data: {
      url: opts.link || "/",
    },
    // Vibrate phone: [200ms pulse, 100ms pause, 200ms pulse]
    vibrate: [200, 100, 200],
  } as any;

  // On mobile phone, trigger hardware vibration immediately if supported
  try {
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      navigator.vibrate([200, 100, 200]);
    }
  } catch (_) {}

  // Ensure permission is granted, or request it if default (during user click gesture)
  let currentPerm: string = "default";
  if (typeof Notification !== "undefined") {
    currentPerm = Notification.permission;
    if (currentPerm === "default") {
      try {
        currentPerm = await Notification.requestPermission();
      } catch (_) {}
    }
  }

  // 1. Preferred method: Service Worker showNotification (Mandatory for mobile Android/iOS)
  if ("serviceWorker" in navigator) {
    try {
      let reg = await navigator.serviceWorker.getRegistration();
      if (!reg || !reg.active) {
        reg = (await registerServiceWorker()) || reg;
      }

      // Race navigator.serviceWorker.ready with a 1.5s timeout so it NEVER hangs
      const activeReg = await Promise.race([
        navigator.serviceWorker.ready,
        new Promise<ServiceWorkerRegistration | null>((resolve) =>
          setTimeout(() => resolve(reg || null), 1500)
        ),
      ]);

      const targetReg = activeReg || reg;
      if (targetReg && typeof targetReg.showNotification === "function") {
        await targetReg.showNotification(opts.title, options);
        return true;
      }
    } catch (err) {
      console.warn("[Notifications] Service Worker showNotification failed:", err);
    }
  }

  // 2. Desktop Browser fallback (where new Notification constructor is permitted)
  if (typeof Notification !== "undefined" && currentPerm === "granted") {
    try {
      new Notification(opts.title, options);
      return true;
    } catch (err) {
      console.warn("[Notifications] Window Notification fallback failed:", err);
    }
  }

  return false;
}

/**
 * Requests device notification permission with mobile iOS/Android awareness.
 */
export async function requestDeviceNotificationPermission(): Promise<{
  permission: DeviceNotificationPermission;
  instructions?: string;
}> {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return {
      permission: "unsupported",
      instructions: "Notifications are not supported in this browser. Please use Chrome, Edge, or install this app to your Home Screen.",
    };
  }

  // iOS 16.4+ Web Push requires the site to be added to the Home Screen first
  if (isIOSDevice() && !isAppInstalled()) {
    return {
      permission: "default",
      instructions: "On iPhone/iPad, tap the Share button in Safari and select 'Add to Home Screen' to enable notifications.",
    };
  }

  try {
    const perm = await Notification.requestPermission();
    if (perm === "granted") {
      if (typeof window !== "undefined") {
        localStorage.setItem("fp_device_notif_granted", "true");
        localStorage.removeItem("fp_notif_prompt_dismissed_until");
      }
      await registerServiceWorker();
    }
    return { permission: perm as DeviceNotificationPermission };
  } catch (err) {
    console.warn("[Push] Permission request error:", err);
    return { permission: "denied" };
  }
}

/**
 * Gets current notification permission status.
 */
export function getDeviceNotificationStatus(): {
  permission: DeviceNotificationPermission;
  isSupported: boolean;
} {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return { permission: "unsupported", isSupported: false };
  }
  return {
    permission: Notification.permission as DeviceNotificationPermission,
    isSupported: true,
  };
}

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
 * Registers Web Push subscription with VAPID and persists to server.
 */
export async function registerPushSubscription(data: {
  userId?: string;
  role?: string;
  collegeId?: string;
}): Promise<{ success: boolean; error?: string }> {
  if (typeof window === "undefined") {
    return { success: false, error: "Window undefined" };
  }

  if (!("serviceWorker" in navigator)) {
    return { success: false, error: "Service Worker not supported in this browser" };
  }

  if (!("PushManager" in window)) {
    return { success: false, error: "PushManager not supported on this device/browser" };
  }

  try {
    let reg = await navigator.serviceWorker.getRegistration();
    if (!reg) {
      reg = (await registerServiceWorker()) || reg;
    }

    if (!reg) {
      return { success: false, error: "Service Worker registration failed" };
    }

    // Race with a 2-second timeout so it never hangs indefinitely
    const activeReg = await Promise.race([
      navigator.serviceWorker.ready,
      new Promise<ServiceWorkerRegistration | null>((resolve) =>
        setTimeout(() => resolve(reg || null), 2000)
      ),
    ]);

    const targetReg = activeReg || reg;
    if (!targetReg.pushManager) {
      return { success: false, error: "PushManager not available on Service Worker" };
    }

    const rawVapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "";
    const vapidPublicKey = rawVapidKey.replace(/['"]/g, "").trim();

    if (!vapidPublicKey) {
      console.warn("[Push] NEXT_PUBLIC_VAPID_PUBLIC_KEY not configured.");
      return { success: false, error: "VAPID key not configured" };
    }

    let sub = await targetReg.pushManager.getSubscription();
    if (!sub) {
      const convertedVapidKey = urlBase64ToUint8Array(vapidPublicKey);
      sub = await targetReg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: convertedVapidKey as unknown as BufferSource,
      });
    }

    if (sub) {
      const resp = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subscription: sub,
          userId: data.userId,
          role: data.role,
          collegeId: data.collegeId,
        }),
      });

      if (!resp.ok) {
        const errJson = await resp.json().catch(() => ({}));
        console.warn("[Push] API subscription registration failed:", errJson);
        return { success: false, error: errJson.message || "Failed to persist subscription on server" };
      }

      localStorage.setItem("fp_push_subscribed", "true");
      return { success: true };
    }

    return { success: false, error: "Could not create push subscription" };
  } catch (err: any) {
    console.warn("[Push] Subscription error:", err);
    return { success: false, error: err?.message || String(err) };
  }
}

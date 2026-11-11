/**
 * Device-Level System Notifications (Desktop & Mobile)
 *
 * Fully supports:
 * - Desktop: Windows Action Center, macOS Notification Center, Linux
 * - Mobile: Android Chrome, Samsung Internet, Edge Mobile, iOS PWA
 * - Insecure / Local HTTP fallback: Device vibration & mobile in-app banners
 */

const recentNotificationTags = new Set<string>();

export type DeviceNotificationPermission = "granted" | "denied" | "default" | "unsupported";

export interface DeviceEnvironmentInfo {
  isSupported: boolean;
  isSecureContext: boolean;
  isMobile: boolean;
  isIos: boolean;
  isStandalone: boolean;
  permission: DeviceNotificationPermission;
}

export function getDeviceEnvironment(): DeviceEnvironmentInfo {
  if (typeof window === "undefined") {
    return {
      isSupported: false,
      isSecureContext: false,
      isMobile: false,
      isIos: false,
      isStandalone: false,
      permission: "unsupported",
    };
  }

  const ua = navigator.userAgent || "";
  const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(ua);
  const isIos = /iPhone|iPad|iPod/i.test(ua);
  const isStandalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as any).standalone === true;
  const isSecure = window.isSecureContext || window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
  const hasNotificationApi = "Notification" in window;

  let permission: DeviceNotificationPermission = "unsupported";
  if (hasNotificationApi) {
    permission = Notification.permission;
  }

  return {
    isSupported: hasNotificationApi && (isSecure || window.location.hostname === "localhost"),
    isSecureContext: isSecure,
    isMobile,
    isIos,
    isStandalone,
    permission,
  };
}

/**
 * Gets the current device notification permission state.
 */
export function getDeviceNotificationStatus(): DeviceNotificationPermission {
  const env = getDeviceEnvironment();
  return env.permission;
}

/**
 * Registers the Service Worker in the background without blocking user gestures.
 */
export async function initDeviceNotifications(): Promise<void> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

  try {
    await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  } catch (_) {
    // Non-fatal if plain HTTP on non-localhost IP
  }
}

export interface RequestPermissionResult {
  permission: DeviceNotificationPermission;
  instructions?: string;
  error?: string;
}

/**
 * Prompts the user to allow notifications on this device.
 * CRITICAL: Calls Notification.requestPermission() synchronously within the user gesture,
 * ensuring Mobile Chrome and iOS Safari do not block the request.
 */
export async function requestDeviceNotificationPermission(): Promise<RequestPermissionResult> {
  if (typeof window === "undefined") {
    return { permission: "unsupported" };
  }

  const env = getDeviceEnvironment();

  // 1. Handle iOS Safari specifics (Must be added to Home Screen as PWA)
  if (env.isIos && !env.isStandalone) {
    return {
      permission: "unsupported",
      instructions:
        "On iPhone/iPad, tap the Share button (⬆️) and select 'Add to Home Screen'. Then open the app from your home screen to enable notifications.",
    };
  }

  // 2. Check if Notification API exists
  if (!("Notification" in window)) {
    if (!env.isSecureContext) {
      return {
        permission: "unsupported",
        instructions:
          "Mobile browsers (Android/iOS) require HTTPS for system notifications. Access the app via HTTPS or run 'npm run dev:https'.",
      };
    }
    return {
      permission: "unsupported",
      instructions: "Notifications are not supported by this browser.",
    };
  }

  try {
    // CRITICAL FIX: Request permission IMMEDIATELY within the click handler stack.
    // Do NOT await initDeviceNotifications() beforehand, otherwise mobile Chrome loses user activation!
    let permissionResult: NotificationPermission;

    // Support both Promise and Callback styles for universal mobile browser compatibility
    try {
      const promise = Notification.requestPermission();
      if (promise && typeof promise.then === "function") {
        permissionResult = await promise;
      } else {
        permissionResult = await new Promise<NotificationPermission>((resolve) => {
          Notification.requestPermission((p) => resolve(p));
        });
      }
    } catch (_) {
      permissionResult = await new Promise<NotificationPermission>((resolve) => {
        Notification.requestPermission((p) => resolve(p));
      });
    }

    if (permissionResult === "granted") {
      // Register service worker now that permission is granted
      initDeviceNotifications().catch(() => {});

      // Send a test confirmation notification
      await sendDeviceSystemNotification({
        title: "Notifications Enabled!",
        message: "You will now receive instant alerts on this device.",
        tag: "device_notif_welcome",
      });

      return { permission: "granted" };
    }

    if (permissionResult === "denied") {
      return {
        permission: "denied",
        instructions:
          "Notifications were blocked. Please tap the lock/tune icon in your browser address bar to allow notifications.",
      };
    }

    return { permission: permissionResult as DeviceNotificationPermission };
  } catch (err: any) {
    if (!env.isSecureContext) {
      return {
        permission: "unsupported",
        instructions:
          "Mobile browsers require HTTPS for system notifications. Please connect via HTTPS or run 'npm run dev:https'.",
      };
    }
    return {
      permission: Notification.permission || "default",
      error: err?.message || String(err),
    };
  }
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
 * Registers Web Push subscription with the browser PushManager and binds it
 * to the user in PostgreSQL, enabling lockscreen/background push.
 */
export async function registerPushSubscription(userScope?: {
  userId?: string;
  role?: string;
  collegeId?: string;
}): Promise<boolean> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return false;

  try {
    let reg: ServiceWorkerRegistration | null | undefined = await navigator.serviceWorker.getRegistration();
    if (!reg) {
      reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
    }
    if (!reg.active) {
      const timeoutPromise = new Promise<null>((resolve) => setTimeout(() => resolve(null), 3000));
      reg = (await Promise.race([navigator.serviceWorker.ready, timeoutPromise])) || reg;
    }
    if (!reg || !("pushManager" in reg)) return false;

    // 1. Get VAPID public key from backend
    const keyRes = await fetch("/api/push/vapid-key").then((r) => r.json()).catch(() => null);
    if (!keyRes?.success || !keyRes.publicKey) return false;

    const applicationServerKey = urlBase64ToUint8Array(keyRes.publicKey);

    // 2. Subscribe with the push manager
    let subscription = await reg.pushManager.getSubscription();
    if (!subscription) {
      subscription = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: applicationServerKey as any,
      });
    }

    // 3. Post to backend
    if (subscription) {
      await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subscription,
          userId: userScope?.userId,
          role: userScope?.role,
          collegeId: userScope?.collegeId,
          userAgent: navigator.userAgent,
        }),
      });
      return true;
    }
  } catch (err) {
    console.warn("registerPushSubscription warning:", err);
  }
  return false;
}

export interface SendDeviceNotificationOptions {
  title: string;
  message?: string;
  body?: string;
  link?: string | null;
  url?: string | null;
  tag?: string;
  badge?: string;
  icon?: string;
}

/**
 * Sends a native OS/System notification to Desktop or Mobile,
 * with automatic haptic vibration on mobile devices.
 */
export async function sendDeviceSystemNotification(
  options: SendDeviceNotificationOptions
): Promise<boolean> {
  if (typeof window === "undefined") return false;

  // 1. Mobile Haptic Vibration (Works even over HTTP / insecure contexts!)
  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
    try {
      navigator.vibrate([200, 100, 200]);
    } catch (_) {}
  }

  if (!("Notification" in window)) {
    return false;
  }

  if (Notification.permission !== "granted") {
    return false;
  }

  const tag = options.tag || `tag_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
  if (recentNotificationTags.has(tag)) {
    return false;
  }
  recentNotificationTags.add(tag);
  if (recentNotificationTags.size > 200) {
    const first = recentNotificationTags.values().next().value;
    if (first) recentNotificationTags.delete(first);
  }

  const title = options.title || "New Notification";
  const body = options.message || options.body || "";
  const icon = options.icon || "/faceprep-fav.png";
  const badge = options.badge || "/faceprep-fav.png";
  const targetUrl = options.link || options.url || "/";

  // 2. ServiceWorker showNotification (REQUIRED for Android & Mobile Chrome - new Notification() throws Illegal Constructor)
  if ("serviceWorker" in navigator) {
    try {
      let reg: ServiceWorkerRegistration | null | undefined = await navigator.serviceWorker.getRegistration();
      if (!reg) {
        reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      }
      if (!reg.active) {
        const timeoutPromise = new Promise<null>((resolve) => setTimeout(() => resolve(null), 2500));
        reg = (await Promise.race([navigator.serviceWorker.ready, timeoutPromise])) || reg;
      }

      if (reg && typeof reg.showNotification === "function") {
        await reg.showNotification(title, {
          body,
          icon,
          badge,
          tag,
          data: { url: targetUrl },
          requireInteraction: false,
          vibrate: [200, 100, 200],
        } as any);
        return true;
      }
    } catch (swErr) {
      console.warn("ServiceWorker showNotification failed:", swErr);
    }
  }

  // 3. Desktop Notification constructor fallback (Desktop Chrome, Safari, Edge, Firefox)
  // CRITICAL: Must be skipped on mobile because Android Chrome throws TypeError: Illegal constructor!
  const ua = (typeof navigator !== "undefined" && navigator.userAgent) || "";
  const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(ua);
  if (!isMobile) {
    try {
      const notif = new Notification(title, {
        body,
        icon,
        badge,
        tag,
      });

      notif.onclick = () => {
        window.focus();
        if (targetUrl && targetUrl !== "#") {
          window.location.href = targetUrl;
        }
        notif.close();
      };

      return true;
    } catch (_) {
      return false;
    }
  }

  return false;
}

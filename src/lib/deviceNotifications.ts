export type DeviceNotificationPermission = "default" | "granted" | "denied" | "unsupported";

export interface DeviceNotificationOptions {
  title: string;
  message: string;
  link?: string;
  tag?: string;
}

export async function sendDeviceSystemNotification(opts: DeviceNotificationOptions): Promise<boolean> {
  if (typeof window === "undefined" || !("Notification" in window)) return false;
  if (Notification.permission === "granted") {
    try {
      new Notification(opts.title, { body: opts.message, tag: opts.tag });
      return true;
    } catch (_) {
      return false;
    }
  }
  return false;
}

export async function requestDeviceNotificationPermission(): Promise<{
  permission: DeviceNotificationPermission;
  instructions?: string;
}> {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return { permission: "unsupported", instructions: "Notifications are not supported in this browser." };
  }
  try {
    const perm = await Notification.requestPermission();
    return { permission: perm as DeviceNotificationPermission };
  } catch (_) {
    return { permission: "denied" };
  }
}

export function getDeviceNotificationStatus(): {
  permission: DeviceNotificationPermission;
  isSupported: boolean;
} {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return { permission: "unsupported", isSupported: false };
  }
  return { permission: Notification.permission as DeviceNotificationPermission, isSupported: true };
}

export async function registerPushSubscription(_data: {
  userId?: string;
  role?: string;
  collegeId?: string;
}): Promise<boolean> {
  return true;
}

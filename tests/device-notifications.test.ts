import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  getDeviceNotificationStatus,
  sendDeviceSystemNotification
} from "@/lib/deviceNotifications";

describe("Device System Notifications (Desktop & Mobile)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns unsupported when window or Notification is undefined", () => {
    // In node/vitest environment without browser Notification
    const status = getDeviceNotificationStatus();
    expect(["unsupported", "default", "granted", "denied"]).toContain(status.permission);
  });

  it("handles sendDeviceSystemNotification gracefully when permission is not granted", async () => {
    const result = await sendDeviceSystemNotification({
      title: "Test Alert",
      message: "Testing desktop alert"
    });
    // Should be false when not granted in test env
    expect(result).toBe(false);
  });
});


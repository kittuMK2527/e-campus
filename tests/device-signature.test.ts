import fs from "node:fs";
import path from "node:path";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { parseDeviceEnvironment } from "../src/lib/deviceFingerprint";
import {
  checkAndEnforceDeviceAuthorization,
  getUserAuthorizedDevices,
  resetUserAuthorizedDevices
} from "../src/lib/deviceSecurity";

// Load .env.local
beforeAll(() => {
  try {
    const envPath = path.resolve(process.cwd(), ".env.local");
    if (fs.existsSync(envPath)) {
      const lines = fs.readFileSync(envPath, "utf-8").split("\n");
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const idx = trimmed.indexOf("=");
        if (idx !== -1) {
          const key = trimmed.slice(0, idx).trim();
          let val = trimmed.slice(idx + 1).trim();
          if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
            val = val.slice(1, -1);
          }
          if (!process.env[key]) {
            process.env[key] = val;
          }
        }
      }
    }
  } catch (_) {}
});

describe("Device Signature & Security Suite", () => {
  let db: any;
  const testUserId = "test_user_dev_sec_99";
  const testAdminId = "test_admin_dev_sec_99";

  beforeAll(async () => {
    const { getDb } = await import("@/lib/db");
    db = await getDb();

    // Clean up test records
    await db.run("DELETE FROM user_authorized_devices WHERE user_id IN (?, ?)", [testUserId, testAdminId]);
    await db.run("DELETE FROM device_security_logs WHERE user_id IN (?, ?)", [testUserId, testAdminId]);
    await db.run("DELETE FROM device_reset_requests WHERE user_id IN (?, ?)", [testUserId, testAdminId]);
  });

  afterAll(async () => {
    if (db) {
      await db.run("DELETE FROM user_authorized_devices WHERE user_id IN (?, ?)", [testUserId, testAdminId]);
      await db.run("DELETE FROM device_security_logs WHERE user_id IN (?, ?)", [testUserId, testAdminId]);
      await db.run("DELETE FROM device_reset_requests WHERE user_id IN (?, ?)", [testUserId, testAdminId]);
    }
  });

  describe("Device Environment Parsing", () => {
    it("returns safe server defaults when window/navigator is undefined", () => {
      const env = parseDeviceEnvironment();
      expect(env.deviceType).toBe("desktop");
      expect(env.os).toBe("Unknown OS");
      expect(env.browser).toBe("Unknown Browser");
    });
  });

  describe("Admin Exemption Policy", () => {
    it("exempts admin and super_admin from device slot restrictions", async () => {
      const adminUser = { id: testAdminId, role: "admin", email: "admin_test@faceprep.ed" };
      const profile = { name: "Admin Test" };

      // Attempt login from desktop 1
      const res1 = await checkAndEnforceDeviceAuthorization(
        db,
        adminUser,
        profile,
        { deviceType: "desktop", deviceSignature: "admin_desktop_1", deviceName: "Admin Laptop 1" },
        "127.0.0.1"
      );
      expect(res1.allowed).toBe(true);

      // Attempt login from desktop 2 (different machine)
      const res2 = await checkAndEnforceDeviceAuthorization(
        db,
        adminUser,
        profile,
        { deviceType: "desktop", deviceSignature: "admin_desktop_2", deviceName: "Admin Desktop 2" },
        "127.0.0.2"
      );
      expect(res2.allowed).toBe(true);
    });
  });

  describe("End-User 1 Desktop + 1 Mobile Concurrent Enforcement", () => {
    const regularUser = { id: testUserId, role: "mentor", email: "mentor_test@faceprep.ed" };
    const profile = { name: "Mentor Test" };

    it("registers initial desktop and allows login", async () => {
      const res = await checkAndEnforceDeviceAuthorization(
        db,
        regularUser,
        profile,
        {
          deviceType: "desktop",
          deviceSignature: "sig_desktop_first_001",
          deviceName: "Lenovo ThinkPad X1"
        },
        "192.168.1.10"
      );

      expect(res.allowed).toBe(true);

      // Verify DB record
      const devices = await getUserAuthorizedDevices(db, testUserId);
      const activeDesktop = devices.find((d: any) => d.device_type === "desktop" && d.is_active);
      expect(activeDesktop).toBeDefined();
      expect(activeDesktop.device_signature).toBe("sig_desktop_first_001");
      expect(activeDesktop.device_name).toBe("Lenovo ThinkPad X1");
    });

    it("allows repeat login from the same desktop signature", async () => {
      const res = await checkAndEnforceDeviceAuthorization(
        db,
        regularUser,
        profile,
        {
          deviceType: "desktop",
          deviceSignature: "sig_desktop_first_001",
          deviceName: "Lenovo ThinkPad X1 (Updated)"
        },
        "192.168.1.11"
      );

      expect(res.allowed).toBe(true);
    });

    it("registers initial mobile slot independently and allows login", async () => {
      const res = await checkAndEnforceDeviceAuthorization(
        db,
        regularUser,
        profile,
        {
          deviceType: "mobile",
          deviceSignature: "sig_mobile_first_001",
          deviceName: "Samsung Galaxy S24"
        },
        "192.168.1.50"
      );

      expect(res.allowed).toBe(true);

      // Both desktop and mobile should now be active
      const devices = await getUserAuthorizedDevices(db, testUserId);
      const activeSlots = devices.filter((d: any) => d.is_active);
      expect(activeSlots.length).toBe(2);
    });

    it("blocks a second desktop from logging in and logs a security incident", async () => {
      const res = await checkAndEnforceDeviceAuthorization(
        db,
        regularUser,
        profile,
        {
          deviceType: "desktop",
          deviceSignature: "sig_desktop_second_unauthorized",
          deviceName: "MacBook Pro M3"
        },
        "203.0.113.4"
      );

      expect(res.allowed).toBe(false);
      expect(res.code).toBe("DEVICE_LIMIT_EXCEEDED");
      expect(res.conflictData).toBeDefined();
      expect(res.conflictData?.deviceType).toBe("desktop");
      expect(res.conflictData?.conflictDevice).toBe("Lenovo ThinkPad X1 (Updated)");
      expect(res.conflictData?.attemptedDevice).toBe("MacBook Pro M3");

      // Verify incident is recorded in device_security_logs
      const secLogs = await db.all(
        "SELECT * FROM device_security_logs WHERE user_id = ? AND status = 'blocked'",
        [testUserId]
      );
      expect(secLogs.length).toBeGreaterThan(0);
      expect(secLogs[0].attempted_type).toBe("desktop");
      expect(secLogs[0].device_name).toBe("MacBook Pro M3");
    });

    it("blocks a second mobile device from logging in", async () => {
      const res = await checkAndEnforceDeviceAuthorization(
        db,
        regularUser,
        profile,
        {
          deviceType: "mobile",
          deviceSignature: "sig_mobile_second_unauthorized",
          deviceName: "iPhone 15 Pro"
        },
        "203.0.113.5"
      );

      expect(res.allowed).toBe(false);
      expect(res.code).toBe("DEVICE_LIMIT_EXCEEDED");
      expect(res.conflictData?.conflictDevice).toBe("Samsung Galaxy S24");
    });

    it("resets desktop slot and allows the new desktop to authorize", async () => {
      // Admin resets desktop
      const resetRes = await resetUserAuthorizedDevices(db, testUserId, "desktop", "test_admin");
      expect(resetRes.success).toBe(true);

      // Now the previously blocked MacBook Pro attempts login again
      const newLoginRes = await checkAndEnforceDeviceAuthorization(
        db,
        regularUser,
        profile,
        {
          deviceType: "desktop",
          deviceSignature: "sig_desktop_second_unauthorized",
          deviceName: "MacBook Pro M3"
        },
        "203.0.113.4"
      );

      expect(newLoginRes.allowed).toBe(true);

      // The new desktop is now active
      const devices = await getUserAuthorizedDevices(db, testUserId);
      const activeDesktop = devices.find((d: any) => d.device_type === "desktop" && d.is_active);
      expect(activeDesktop.device_signature).toBe("sig_desktop_second_unauthorized");
    });
  });
});

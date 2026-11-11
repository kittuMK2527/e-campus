import fs from "node:fs";
import path from "node:path";
import { describe, it, expect, beforeAll } from "vitest";

let getDb: any;
let getVapidPublicKey: any;
let sendWebPushNotification: any;
let dispatchSystemNotification: any;

beforeAll(async () => {
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

  const dbMod = await import("@/lib/db");
  const wpMod = await import("@/lib/webPush");
  const notifMod = await import("@/lib/notifications");

  getDb = dbMod.getDb;
  getVapidPublicKey = wpMod.getVapidPublicKey;
  sendWebPushNotification = wpMod.sendWebPushNotification;
  dispatchSystemNotification = notifMod.dispatchSystemNotification;
});

describe("Web Push & Package Notification Engine", () => {
  let db: any;

  beforeAll(async () => {
    db = await getDb();
  });

  it("exposes valid VAPID public key", () => {
    const pubKey = getVapidPublicKey();
    expect(pubKey).toBeDefined();
    expect(pubKey.length).toBeGreaterThan(30);
  });

  it("stores and queries push subscriptions in PostgreSQL", async () => {
    const testSubId = "test_psub_001";
    const testEndpoint = "https://fcm.googleapis.com/fcm/send/test_dummy_token_123";

    await db.run(
      `INSERT INTO push_subscriptions (id, user_id, endpoint, p256dh, auth, user_agent, college_id, role, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
       ON CONFLICT (endpoint) DO NOTHING`,
      [testSubId, "test_student_wp", testEndpoint, "BNcR...", "auth...", "TestAgent", "clg_test", "student"]
    );

    const saved = await db.get("SELECT * FROM push_subscriptions WHERE endpoint = ?", testEndpoint);
    expect(saved).toBeDefined();
    expect(saved.user_id).toBe("test_student_wp");

    // Clean up
    await db.run("DELETE FROM push_subscriptions WHERE endpoint = ?", testEndpoint);
  });

  it("dispatches system notification with automatic Web Push fan-out", async () => {
    const res = await dispatchSystemNotification(db, {
      roles: ["admin"],
      title: "Day Order Updated: Tomorrow is Day 2",
      message: "Tomorrow will follow Day Order 2 timetable.",
      link: "/schedule",
      type: "info",
    });

    expect(res.success).toBe(true);
    expect(res.count).toBeGreaterThanOrEqual(1);

    // Clean up test notification
    if (res.notificationIds[0]) {
      await db.run("DELETE FROM notifications WHERE id = ?", res.notificationIds[0]);
    }
  });
});


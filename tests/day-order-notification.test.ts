import fs from "node:fs";
import path from "node:path";
import { describe, it, expect, beforeAll } from "vitest";

let getDb: any;
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
  const notifMod = await import("@/lib/notifications");

  getDb = dbMod.getDb;
  dispatchSystemNotification = notifMod.dispatchSystemNotification;
});

describe("Day Order Notification Dispatch", () => {
  let db: any;

  beforeAll(async () => {
    db = await getDb();
  });

  it("dispatches Day Order change to campus roles and creates notification row", async () => {
    const testDate = "2026-11-12";
    const testDayOrder = "Day 3";
    const title = `Day Order Update: ${testDate} (${testDayOrder})`;
    const message = `Campus Day Order for ${testDate} is set as ${testDayOrder} (Working Day) in Offline mode.`;

    const result = await dispatchSystemNotification(db, {
      userIds: ["admin_test_day_order"],
      roles: ["cm", "mentor", "student", "admin"],
      title,
      message,
      link: `/schedule?date=${testDate}`,
      type: "info",
      action: "daily_config_updated"
    });

    expect(result.success).toBe(true);
    expect(result.notificationIds.length).toBeGreaterThan(0);

    // Verify row was inserted into notifications table
    const firstNotifId = result.notificationIds[0];
    const inserted = await db.get("SELECT * FROM notifications WHERE id = ?", [firstNotifId]);
    expect(inserted).toBeDefined();
    expect(inserted.title).toBe(title);
    expect(inserted.message).toBe(message);

    // Clean up test rows
    await db.run("DELETE FROM notifications WHERE id = ?", [firstNotifId]);
  });
});


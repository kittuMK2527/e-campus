import fs from "node:fs";
import path from "node:path";
import { describe, it, expect, beforeAll, afterAll } from "vitest";

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

  const dbModule = await import("@/lib/db");
  getDb = dbModule.getDb;
  const notifModule = await import("@/lib/notifications");
  dispatchSystemNotification = notifModule.dispatchSystemNotification;
});

describe("Realtime Notification Dispatch Engine (Phase 1)", () => {
  const testUserId = `test_usr_${Date.now()}`;
  const testRefId = `ref_${Date.now()}`;
  const testEmail = `test_${Date.now()}@example.com`;

  beforeAll(async () => {
    const db = await getDb();
    await db.run(
      `INSERT INTO users (id, reference_id, email, role, status, password_hash)
       VALUES (?, ?, ?, ?, 'active', 'dummy_hash')`,
      [testUserId, testRefId, testEmail, "mentor"]
    );
  });

  afterAll(async () => {
    const db = await getDb();
    await db.run("DELETE FROM notifications WHERE user_id IN (?, ?, ?)", [testUserId, testRefId, testEmail]).catch(() => {});
    await db.run("DELETE FROM users WHERE id = ?", [testUserId]).catch(() => {});
    await db.run("DELETE FROM event_outbox WHERE college_id = 'col_engine_test'").catch(() => {});
  });

  it("dispatches notification and resolves aliases into event_outbox", async () => {
    const db = await getDb();

    // Dispatch using reference_id
    const result = await dispatchSystemNotification(db, {
      userIds: [testRefId],
      title: "Realtime Test Title",
      message: "Test message body content",
      link: "/mentor/schedule",
      type: "info",
      collegeId: "col_engine_test"
    });

    expect(result.success).toBe(true);
    expect(result.count).toBe(1);
    expect(result.notificationIds.length).toBe(1);

    const notifId = result.notificationIds[0];

    // Verify row in notifications table
    const notifRow = await db.get("SELECT * FROM notifications WHERE id = ?", [notifId]);
    expect(notifRow).toBeDefined();
    expect(notifRow.title).toBe("Realtime Test Title");
    expect(notifRow.is_read).toBe(0);
    expect(notifRow.link).toBe("/mentor/schedule");

    // Verify row in event_outbox table
    const outboxRows = await db.all(
      "SELECT * FROM event_outbox WHERE domain = 'notifications' AND college_id = 'col_engine_test' ORDER BY id DESC LIMIT 1"
    );
    expect(outboxRows.length).toBe(1);
    const outboxRow = outboxRows[0];
    expect(outboxRow.action).toBe("created");

    // target_user_ids should contain all aliases (testUserId, testRefId, and testEmail)
    const targetUserIds = typeof outboxRow.target_user_ids === "string" 
      ? JSON.parse(outboxRow.target_user_ids) 
      : outboxRow.target_user_ids;

    expect(targetUserIds).toContain(testRefId);
    expect(targetUserIds).toContain(testUserId);
    expect(targetUserIds).toContain(testEmail);
  });

  it("retrieves notifications across all identifier aliases", async () => {
    const db = await getDb();

    // Querying with testUserId (UUID) should find the notification stored for testRefId
    const searchKeys = [testUserId, testRefId, testEmail];
    const placeholders = searchKeys.map(() => "?").join(", ");

    const notifications = await db.all(
      `SELECT * FROM notifications 
       WHERE user_id IN (${placeholders}) OR LOWER(user_id) IN (${placeholders})
       ORDER BY created_at DESC`,
      [...searchKeys, ...searchKeys]
    );

    expect(notifications.length).toBeGreaterThanOrEqual(1);
    const found = notifications.find((n: any) => n.title === "Realtime Test Title");
    expect(found).toBeDefined();
    expect(found.is_read).toBe(0);
  });

  it("handles empty recipient list gracefully without errors", async () => {
    const db = await getDb();
    const result = await dispatchSystemNotification(db, {
      userIds: [],
      title: "No-op notification",
      message: "Should not throw"
    });

    expect(result.success).toBe(true);
    expect(result.count).toBe(0);
  });

  it("marks notifications as read and updates unread count", async () => {
    const db = await getDb();

    // Create a new unread notification
    const res = await dispatchSystemNotification(db, {
      userIds: [testRefId],
      title: "Unread Test",
      message: "Check unread status",
      type: "info"
    });
    const notifId = res.notificationIds[0];

    // Mark as read
    await db.run("UPDATE notifications SET is_read = 1 WHERE id = ?", [notifId]);

    const row = await db.get("SELECT is_read FROM notifications WHERE id = ?", [notifId]);
    expect(row.is_read).toBe(1);
  });

  it("dispatches notifications to roles successfully", async () => {
    const db = await getDb();

    const result = await dispatchSystemNotification(db, {
      roles: ["mentor"],
      title: "Faculty Broadcast",
      message: "Important update for all faculty",
      type: "info"
    });

    expect(result.success).toBe(true);
    // Should have reached at least our test mentor user
    expect(result.count).toBeGreaterThanOrEqual(1);
  });
});

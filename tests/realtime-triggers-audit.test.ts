import fs from "node:fs";
import path from "node:path";
import { describe, it, expect, beforeAll } from "vitest";

let getDb: any;
let dispatchSystemNotification: any;
let addRealtimeClient: any;
let removeRealtimeClient: any;
let notifyRealtimeEvent: any;

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
  const rtMod = await import("@/lib/realtimeServer");

  getDb = dbMod.getDb;
  dispatchSystemNotification = notifMod.dispatchSystemNotification;
  addRealtimeClient = rtMod.addRealtimeClient;
  removeRealtimeClient = rtMod.removeRealtimeClient;
  notifyRealtimeEvent = rtMod.notifyRealtimeEvent;
});

describe("Comprehensive Notification Triggers & Delivery", () => {
  let db: any;

  beforeAll(async () => {
    db = await getDb();
  });

  it("SSE client receives event when targeted by alias or role (case-insensitive)", async () => {
    const receivedEvents: any[] = [];
    const dummyController: any = {
      enqueue: (chunk: Uint8Array) => {
        const text = new TextDecoder().decode(chunk);
        if (text.includes("fp_event")) {
          const jsonStr = text.replace("event: fp_event\ndata: ", "").trim();
          receivedEvents.push(JSON.parse(jsonStr));
        }
      }
    };

    const clientId = "test_client_audit_1";
    addRealtimeClient({
      id: clientId,
      userId: "test_mentor_01",
      aliases: ["test_mentor_01", "m_audit_01", "mentor_audit@faceprep.in"],
      role: "mentor",
      collegeId: "clg_test_1",
      controller: dummyController
    });

    // 1. Dispatch event targeted to an alias with DIFFERENT casing
    notifyRealtimeEvent({
      domain: "notifications",
      action: "created",
      targetUserIds: ["MENTOR_AUDIT@FACEPREP.IN"],
      payload: { title: "Class Swap Offered", message: "A peer offered to swap" }
    });

    expect(receivedEvents.length).toBe(1);
    expect(receivedEvents[0].payload.title).toBe("Class Swap Offered");

    // 2. Dispatch event targeted to role "mentor"
    notifyRealtimeEvent({
      domain: "notifications",
      action: "created",
      targetRoles: ["mentor"],
      payload: { title: "Campus Announcement", message: "Holiday declared" }
    });

    expect(receivedEvents.length).toBe(2);
    expect(receivedEvents[1].payload.title).toBe("Campus Announcement");

    removeRealtimeClient(clientId);
  });

  it("Admin client receives announcements and governance events regardless of target restrictions", async () => {
    const adminEvents: any[] = [];
    const dummyController: any = {
      enqueue: (chunk: Uint8Array) => {
        const text = new TextDecoder().decode(chunk);
        if (text.includes("fp_event")) {
          const jsonStr = text.replace("event: fp_event\ndata: ", "").trim();
          adminEvents.push(JSON.parse(jsonStr));
        }
      }
    };

    const adminClientId = "test_admin_client_audit";
    addRealtimeClient({
      id: adminClientId,
      userId: "admin_thanush",
      aliases: ["admin_thanush", "thanush@faceprep.in", "user_admin_thanush"],
      role: "admin",
      controller: dummyController
    });

    // Event targeted to a student, but domain is "notifications"
    notifyRealtimeEvent({
      domain: "notifications",
      action: "created",
      targetUserIds: ["21CS041"],
      payload: { title: "Exam Marks Published", message: "Your Python marks are out" }
    });

    expect(adminEvents.length).toBe(1);
    expect(adminEvents[0].payload.title).toBe("Exam Marks Published");

    removeRealtimeClient(adminClientId);
  });

  it("dispatches announcement notification to database with correct payload and target roles", async () => {
    const res = await dispatchSystemNotification(db, {
      roles: ["admin"],
      title: "Global Announcement: Campus Placement Drive",
      message: "Placement drive schedule has been released for all final year students.",
      link: "/announcements",
      type: "info",
      payload: { announcementId: "ann_test_audit_1" }
    });

    expect(res.success).toBe(true);
    expect(res.count).toBeGreaterThanOrEqual(1);

    const saved = await db.get(
      "SELECT * FROM notifications WHERE id = ?",
      res.notificationIds[0]
    );
    expect(saved).toBeDefined();
    expect(saved.title).toBe("Global Announcement: Campus Placement Drive");

    // Cleanup
    await db.run("DELETE FROM notifications WHERE id = ?", res.notificationIds[0]);
  });
});

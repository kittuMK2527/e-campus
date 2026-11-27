import fs from "node:fs";
import path from "node:path";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { resolveNotificationDestination } from "../src/lib/notificationTarget";
import {
  parseClockMinutes,
  parseSlotWindow,
  getInstitutionClockMinutes,
  processUpcomingDemoReminders
} from "../src/lib/demoReminderCheck";
import { getLocalDateStr } from "../src/lib/localDate";

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

describe("Notification Target Routing & Semantic Action Labels", () => {
  it("routes Security Alert for 'Mentor Test' to Manage Devices, NOT View Exams", () => {
    const notif = {
      id: "notif_sec_1",
      title: "Security Alert: Device Limit Reached (Mentor Test)",
      message: "User Mentor Test (mentor) was blocked attempting to log in from a new desktop (MacBook Pro M3, IP: 203.0.113.4). An active authorized desktop is already registered.",
      link: "/admin/users?deviceUserId=test_user_mentor_99",
      domain: "security",
      type: "warning",
      payload: { userId: "test_user_mentor_99" }
    };

    const target = resolveNotificationDestination(notif, "admin");
    expect(target).toBeDefined();
    expect(target?.actionLabel).toBe("Manage Devices");
    expect(target?.url).toContain("/admin/users?deviceUserId=test_user_mentor_99");
    expect(target?.actionLabel).not.toBe("View Exams");
  });

  it("routes Device Reset Request to Manage Devices with deviceUserId", () => {
    const notif = {
      id: "notif_drr_1",
      title: "Device Reset Request: John Doe",
      message: "John Doe (mentor) has requested a reset for their authorized desktop device.",
      link: "/admin/users?deviceUserId=user_johndoe_1",
      domain: "security",
      type: "warning",
      payload: { userId: "user_johndoe_1" }
    };

    const target = resolveNotificationDestination(notif, "admin");
    expect(target).toBeDefined();
    expect(target?.actionLabel).toBe("Manage Devices");
    expect(target?.url).toBe("/admin/users?deviceUserId=user_johndoe_1");
  });

  it("routes Pre-Demo 5-minute Reminder to Join Demo for Mentor", () => {
    const notif = {
      id: "notif_demo_rem_1",
      title: "Demo Starting in 5 Minutes!",
      message: "Your demo session for Computer Science with SME Dr. Sharma starts in 5 minutes (10:00 AM - 10:45 AM).",
      link: "https://meet.google.com/abc-defg-hij",
      domain: "demo_reminder",
      type: "reminder",
      payload: { meetLink: "https://meet.google.com/abc-defg-hij" }
    };

    const target = resolveNotificationDestination(notif, "mentor");
    expect(target).toBeDefined();
    expect(target?.actionLabel).toBe("Join Demo");
    expect(target?.url).toBe("https://meet.google.com/abc-defg-hij");
    expect(target?.isExternal).toBe(true);
  });

  it("routes Pre-Demo 5-minute Reminder to Evaluate Demo for SME", () => {
    const notif = {
      id: "notif_demo_rem_2",
      title: "Demo Starting in 5 Minutes!",
      message: "Upcoming demo session with Mentor Alice for Data Structures starts in 5 minutes (11:00 AM - 11:45 AM).",
      link: "https://meet.google.com/xyz-uvw-rst",
      domain: "demo_reminder",
      type: "reminder",
      payload: { meetLink: "https://meet.google.com/xyz-uvw-rst" }
    };

    const target = resolveNotificationDestination(notif, "sme");
    expect(target).toBeDefined();
    expect(target?.actionLabel).toBe("Join Demo"); // or Evaluate Demo if meet link
    expect(target?.url).toBe("https://meet.google.com/xyz-uvw-rst");
  });

  it("routes L&D Reschedule Awaiting Approval to Review Reschedule for SME", () => {
    const notif = {
      id: "notif_resched_1",
      title: "L&D Reschedule Awaiting Approval",
      message: "Dr. Arun Kumar requested moving the CS L&D session from 2026-11-19 to 2026-11-30.",
      type: "warning"
    };

    const target = resolveNotificationDestination(notif, "sme");
    expect(target).toBeDefined();
    expect(target?.actionLabel).toBe("Review Reschedule");
    expect(target?.url).toBe("/sme/reallocation");
  });

  it("routes L&D SLA Breach to View Missed Demo", () => {
    const notif = {
      id: "notif_sla_1",
      title: "L&D SLA Breach: Missed Demo",
      message: "Scheduled demo with Mentor Dr. Roy was not conducted on time.",
      type: "warning"
    };

    const target = resolveNotificationDestination(notif, "mentor");
    expect(target).toBeDefined();
    expect(target?.actionLabel).toBe("View Missed Demo");
    expect(target?.url).toBe("/mentor/demo_evaluations");
  });

  it("correctly routes real exam notifications to View Exams", () => {
    const notif = {
      id: "notif_exam_1",
      title: "Semester CIA Exam Schedule Published",
      message: "The assessment schedule for Semester 5 has been finalized.",
      type: "info"
    };

    const target = resolveNotificationDestination(notif, "student");
    expect(target).toBeDefined();
    expect(target?.actionLabel).toBe("View Exams");
    expect(target?.url).toBe("/student/exams");
  });
});

describe("Pre-Demo Reminder Time & Slot Engine", () => {
  it("parses slot window hours and minutes accurately", () => {
    const slot1 = parseSlotWindow("10:00 AM - 10:45 AM");
    expect(slot1.startMin).toBe(600); // 10 * 60
    expect(slot1.endMin).toBe(645); // 10 * 60 + 45

    const slot2 = parseSlotWindow("02:30 PM - 03:15 PM");
    expect(slot2.startMin).toBe(870); // 14 * 60 + 30
    expect(slot2.endMin).toBe(915); // 15 * 60 + 15

    expect(parseClockMinutes("12:00 PM")).toBe(720);
    expect(parseClockMinutes("12:00 AM")).toBe(0);
  });
});

describe("5-Minute Pre-Demo Reminder Integration", () => {
  let db: any;
  const testSessionId = "demo_test_rem_999";
  const testMentorId = "mentor_test_rem_99";
  const testSmeId = "sme_test_rem_99";

  beforeAll(async () => {
    const { getDb } = await import("@/lib/db");
    db = await getDb();

    // Clean up test demo session
    await db.run("DELETE FROM demo_sessions WHERE id = ?", [testSessionId]);
  });

  afterAll(async () => {
    if (db) {
      await db.run("DELETE FROM demo_sessions WHERE id = ?", [testSessionId]);
    }
  });

  it("detects and fires 5-minute pre-demo reminder, stamping reminder_5m_sent_at", async () => {
    const todayStr = getLocalDateStr();
    const currentMin = getInstitutionClockMinutes();

    // Create a slot starting in 3 minutes
    const startMin = currentMin + 3;
    const endMin = startMin + 45;

    const formatTime = (min: number) => {
      const hr24 = Math.floor(min / 60) % 24;
      const m = min % 60;
      const ampm = hr24 >= 12 ? "PM" : "AM";
      const hr12 = hr24 % 12 === 0 ? 12 : hr24 % 12;
      return `${String(hr12).padStart(2, "0")}:${String(m).padStart(2, "0")} ${ampm}`;
    };

    const simulatedSlot = `${formatTime(startMin)} - ${formatTime(endMin)}`;

    await db.run(
      `INSERT INTO demo_sessions (
        id, mentorId, mentorName, smeId, smeName, dateStr, timeSlot, subject, stream, week, status, meet_link, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 'scheduled', 'https://meet.google.com/test-room', ?)`,
      [
        testSessionId,
        testMentorId,
        "Test Faculty",
        testSmeId,
        "Test Evaluator",
        todayStr,
        simulatedSlot,
        "Fullstack Node",
        "Technical",
        new Date().toISOString()
      ]
    );

    // Run upcoming reminder processor
    const result = await processUpcomingDemoReminders(db);
    expect(result.count).toBeGreaterThanOrEqual(1);
    expect(result.remindedSessions).toContain(testSessionId);

    // Verify session was stamped with reminder_5m_sent_at
    const sessionRow = await db.get("SELECT reminder_5m_sent_at FROM demo_sessions WHERE id = ?", [testSessionId]);
    expect(sessionRow.reminder_5m_sent_at).toBeTruthy();

    // Run second time: should not re-trigger because reminder_5m_sent_at is already stamped
    const secondResult = await processUpcomingDemoReminders(db);
    expect(secondResult.remindedSessions).not.toContain(testSessionId);
  });
});

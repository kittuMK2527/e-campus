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

describe("Comprehensive Notification Triggers Suite", () => {
  let db: any;

  beforeAll(async () => {
    db = await getDb();
  });

  it("dispatches Academic Task notification to students", async () => {
    const result = await dispatchSystemNotification(db, {
      userIds: ["test_student_1"],
      title: "New Academic Task: DSA Linked List",
      message: "Week 4 task for Data Structures has been assigned. Due date: 2026-11-20.",
      link: "/student/academic-tracker",
      type: "info",
      domain: "tracker",
      action: "task_assigned",
      payload: { classGroup: "CSE-A", subject: "DSA", weekNumber: 4 }
    });
    expect(result.success).toBe(true);
    expect(result.notificationIds.length).toBeGreaterThan(0);
  });

  it("dispatches Academic Marks Updated notification to students", async () => {
    const result = await dispatchSystemNotification(db, {
      userIds: ["test_student_1"],
      title: "Academic Marks Updated: Data Structures",
      message: "Your Week 4 marks for Data Structures (CSE-A) have been published.",
      link: "/student/academic-tracker",
      type: "success",
      domain: "tracker",
      action: "marks_updated"
    });
    expect(result.success).toBe(true);
    expect(result.notificationIds.length).toBeGreaterThan(0);
  });

  it("dispatches Faculty Leave Request notification to CM, Admin, and KAM", async () => {
    const result = await dispatchSystemNotification(db, {
      roles: ["cm", "admin", "kam"],
      title: "New Faculty Casual Leave Request: Dr. Robert",
      message: "Dr. Robert applied for Casual Leave from 2026-11-15 to 2026-11-16. Reason: Family emergency",
      link: "/cm/leaves",
      type: "warning",
      domain: "faculty_leave",
      action: "submitted"
    });
    expect(result.success).toBe(true);
    expect(result.notificationIds.length).toBeGreaterThan(0);
  });

  it("dispatches Student Leave Request notification to CM, Mentor, and Admin", async () => {
    const result = await dispatchSystemNotification(db, {
      roles: ["cm", "mentor", "admin"],
      title: "New OD Request: Alice Walker",
      message: 'Alice Walker (CSE-A) submitted OD request for 2026-11-14: "Attending Hackathon"',
      link: "/cm/approvals",
      type: "warning",
      domain: "notifications",
      action: "created"
    });
    expect(result.success).toBe(true);
    expect(result.notificationIds.length).toBeGreaterThan(0);
  });

  it("dispatches Mock Interview Evaluation notification to student", async () => {
    const result = await dispatchSystemNotification(db, {
      userIds: ["test_student_1"],
      title: "Mock Interview Evaluated: Cleared",
      message: "Your mock interview evaluation is complete. Status: Cleared. Overall Score: 8.5/10.",
      link: "/student/interviews",
      type: "success",
      domain: "interviews",
      action: "evaluated",
      payload: { interview_id: "int_1", status: "Cleared", totalScore: 8.5 }
    });
    expect(result.success).toBe(true);
    expect(result.notificationIds.length).toBeGreaterThan(0);
  });

  it("dispatches Mock Interview Scheduled notification to student and mentor", async () => {
    const studentResult = await dispatchSystemNotification(db, {
      userIds: ["test_student_1"],
      title: "Mock Interview Scheduled: System Design",
      message: "You have been scheduled for a mock interview on 2026-11-18. Meet link: https://meet.google.com/abc-def-ghi.",
      link: "/student/interviews",
      type: "info",
      domain: "interviews",
      action: "assigned"
    });
    expect(studentResult.success).toBe(true);

    const mentorResult = await dispatchSystemNotification(db, {
      userIds: ["test_mentor_1"],
      title: "Interview Assignment: System Design",
      message: "You are assigned to evaluate 5 student(s) on 2026-11-18.",
      link: "/mentor/interviews",
      type: "info",
      domain: "interviews",
      action: "assigned"
    });
    expect(mentorResult.success).toBe(true);
  });

  it("dispatches KAM Task Assignment notification to Campus Manager", async () => {
    const result = await dispatchSystemNotification(db, {
      roles: ["cm"],
      title: "New Task Assigned: Complete Lab Audit",
      message: 'Task "Complete Lab Audit" (Priority: high) has been assigned. Due date: 2026-11-20.',
      link: "/cm/tasks",
      type: "warning",
      domain: "tasks",
      action: "assigned"
    });
    expect(result.success).toBe(true);
    expect(result.notificationIds.length).toBeGreaterThan(0);
  });

  it("dispatches Ticket Resolution notification to creator", async () => {
    const result = await dispatchSystemNotification(db, {
      userIds: ["test_student_1"],
      title: "Ticket Resolved: Projector not working",
      message: "Your ticket has been marked as resolved: Replaced HDMI cable in Room 302.",
      link: "/cm/tickets",
      type: "success",
      domain: "tickets",
      action: "status_changed"
    });
    expect(result.success).toBe(true);
    expect(result.notificationIds.length).toBeGreaterThan(0);
  });

  it("dispatches Welcome notification on Signup Approval", async () => {
    const result = await dispatchSystemNotification(db, {
      userIds: ["test_student_1"],
      title: "Account Approved & Activated!",
      message: "Welcome to the Platform, Jane Doe! Your account has been approved as Student.",
      link: "/",
      type: "success",
      domain: "auth",
      action: "approved"
    });
    expect(result.success).toBe(true);
    expect(result.notificationIds.length).toBeGreaterThan(0);
  });
});


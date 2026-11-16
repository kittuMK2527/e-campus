import { describe, it, expect } from "vitest";
import { resolveNotificationDestination } from "@/lib/notificationTarget";

describe("Notification Role-Based Routing", () => {
  it("routes approval and handover notifications correctly per role", () => {
    const notifFromCm = {
      title: "Handover Request Approved",
      message: "Your handover request for Artificial Intelligence Lab has been approved",
      link: "/cm/approvals",
    };

    // Mentor should be routed to /mentor/handovers, never /cm/approvals or /mentor/approvals
    const mentorTarget = resolveNotificationDestination(notifFromCm, "mentor");
    expect(mentorTarget?.url).toBe("/mentor/handovers");
    expect(mentorTarget?.action).toBe("approvals");

    // Student should be routed to /student/dashboard
    const studentTarget = resolveNotificationDestination(notifFromCm, "student");
    expect(studentTarget?.url).toBe("/student/dashboard");

    // CM should be routed to /cm/approvals
    const cmTarget = resolveNotificationDestination(notifFromCm, "cm");
    expect(cmTarget?.url).toBe("/cm/approvals");

    // Admin should be routed to /admin/oversight
    const adminTarget = resolveNotificationDestination(notifFromCm, "admin");
    expect(adminTarget?.url).toBe("/admin/oversight");
  });

  it("routes day order / daily config reminders with dates properly", () => {
    const dayOrderNotif = {
      title: "Day Order Not Configured — 2026-11-16",
      message: "A Mentor needs the Day Order configured for 2026-11-16",
      link: "/cm/daily-configs?date=2026-11-16",
    };

    // CM should go to /cm/config with preserved date
    const cmTarget = resolveNotificationDestination(dayOrderNotif, "cm");
    expect(cmTarget?.url).toBe("/cm/config?date=2026-11-16");
    expect(cmTarget?.targetDate).toBe("2026-11-16");

    // Mentor should go to /mentor/attendance with preserved date
    const mentorTarget = resolveNotificationDestination(dayOrderNotif, "mentor");
    expect(mentorTarget?.url).toBe("/mentor/attendance?date=2026-11-16");
  });

  it("normalizes hyphenated tab links like weekly-plan", () => {
    const weeklyPlanNotif = {
      title: "Weekly Plan Submitted",
      message: "Weekly plan has been submitted for review",
      link: "/mentor/weekly-plan",
    };

    const mentorTarget = resolveNotificationDestination(weeklyPlanNotif, "mentor");
    expect(mentorTarget?.url).toBe("/mentor/weekly_plan");

    const cmTarget = resolveNotificationDestination(weeklyPlanNotif, "cm");
    expect(cmTarget?.url).toBe("/cm/faculty_weekly_plan");
  });

  it("routes attendance warning notifications to mentor attendance", () => {
    const attendanceNotif = {
      title: "Action Required: Attendance Not Marked (2026-11-16)",
      message: "Student attendance logs are missing for Artificial Intelligence Lab on 2026-11-16",
      link: "/mentor/attendance?date=2026-11-16",
    };

    const mentorTarget = resolveNotificationDestination(attendanceNotif, "mentor");
    expect(mentorTarget?.url).toBe("/mentor/attendance?date=2026-11-16");

    const cmTarget = resolveNotificationDestination(attendanceNotif, "cm");
    expect(cmTarget?.url).toBe("/cm/monitoring?date=2026-11-16");
  });

  it("routes schedule and calendar notifications properly without links", () => {
    const scheduleNotif = {
      title: "Timetable Updated for 2026-11-20",
      message: "The class timetable has changed.",
    };

    const studentTarget = resolveNotificationDestination(scheduleNotif, "student");
    expect(studentTarget?.url).toBe("/student/schedule?date=2026-11-20");

    const mentorTarget = resolveNotificationDestination(scheduleNotif, "mentor");
    expect(mentorTarget?.url).toBe("/mentor/timetable?date=2026-11-20");

    const cmTarget = resolveNotificationDestination(scheduleNotif, "cm");
    expect(cmTarget?.url).toBe("/cm/timetable?date=2026-11-20");

    const adminTarget = resolveNotificationDestination(scheduleNotif, "admin");
    expect(adminTarget?.url).toBe("/admin/schedules?date=2026-11-20");
  });
});

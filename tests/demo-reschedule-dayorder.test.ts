import { describe, it, expect, vi } from "vitest";
import { checkMentorAvailability, checkSmeAvailability } from "@/lib/availability";

describe("Demo Reschedule Day Order & Availability Engine", () => {
  it("adapts mentor availability when campus is running a Day Order shift", async () => {
    const mockDb: any = {
      multiQuery: vi.fn().mockImplementation(async (queries) => {
        return [
          [], // leaves
          [
            // Regular slot on Monday (Day 1)
            { id: "s1", mentorId: "m1", day: "Monday", time: "09:00 AM - 10:00 AM", course: "Data Structures", classGroup: "CS-A", shift: "general" },
            // Regular slot on Wednesday (Day 3)
            { id: "s2", mentorId: "m1", day: "Wednesday", time: "11:00 AM - 12:00 PM", course: "Algorithms", classGroup: "CS-B", shift: "general" },
          ],
          [], // handedOver
          [], // coverHandovers
          [], // interviewSlots
          [], // directInterviews
          [], // demoSwaps
        ];
      }),
      all: vi.fn().mockResolvedValue([]),
      get: vi.fn().mockResolvedValue(null),
    };

    // On Wednesday 2026-11-18, the campus is running Day 1 (Monday timetable)
    // 1. At 09:00 AM - 10:00 AM (Monday slot): should be BUSY because Day 1 runs Monday classes
    const busyCheck = await checkMentorAvailability(mockDb, {
      mentorId: "m1",
      dateStr: "2026-11-18",
      dayOfWeek: "Monday", // effective Day 1
      timeSlot: "09:00 AM - 10:00 AM"
    });
    expect(busyCheck.available).toBe(false);
    expect(busyCheck.busyType).toBe("slot");
    expect(busyCheck.reason).toContain("Data Structures");

    // 2. At 11:00 AM - 12:00 PM (Wednesday slot): should be FREE because Wednesday classes are NOT running
    const freeCheck = await checkMentorAvailability(mockDb, {
      mentorId: "m1",
      dateStr: "2026-11-18",
      dayOfWeek: "Monday", // effective Day 1
      timeSlot: "11:00 AM - 12:00 PM"
    });
    expect(freeCheck.available).toBe(true);
  });

  it("checks SME availability against existing demo sessions", async () => {
    const mockDb: any = {
      all: vi.fn().mockImplementation(async (sql, params) => {
        if (sql.includes("demo_swap_requests")) return [];
        if (sql.includes("demo_sessions")) {
          return [
            { id: "ds1", subject: "Web Development", timeSlot: "10:00 AM - 11:00 AM", dateStr: "2026-11-18" }
          ];
        }
        return [];
      }),
    };

    // SME has an existing demo at 10:00 AM - 11:00 AM
    const clash = await checkSmeAvailability(mockDb, {
      smeId: "sme1",
      dateStr: "2026-11-18",
      timeSlot: "10:00 AM - 11:00 AM"
    });
    expect(clash.available).toBe(false);
    expect(clash.busyType).toBe("demo");
    expect(clash.reason).toContain("Web Development");

    // SME should be free at 02:00 PM - 03:00 PM
    const free = await checkSmeAvailability(mockDb, {
      smeId: "sme1",
      dateStr: "2026-11-18",
      timeSlot: "02:00 PM - 03:00 PM"
    });
    expect(free.available).toBe(true);
  });
});

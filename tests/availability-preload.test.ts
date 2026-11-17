import { readFileSync } from "fs";
import { join } from "path";
import { describe, expect, it, vi } from "vitest";
import {
  checkMentorAvailability,
  checkSmeAvailability,
  loadAvailabilityContext,
  type AvailabilityContext
} from "@/lib/availability";

const PERIODS = [
  "Period 1 (08:30 - 09:25)",
  "Period 2 (09:25 - 10:20)",
  "Period 3 (10:40 - 11:35)",
  "Period 4 (11:35 - 12:30)",
  "Period 5 (01:25 - 02:20)",
  "Period 6 (02:20 - 03:15)"
];

/**
 * Stands in for TursoDbAdapter. multiQuery answers from `slices` by matching the
 * table named in the SQL; every single-statement entry point blows up so a test
 * that expects a preloaded read cannot quietly fall back to the database.
 */
function fakeDb(slices: Record<string, any[]> = {}) {
  const live = vi.fn(() => {
    throw new Error("unexpected per-period round trip");
  });
  const batched = vi.fn(async (queries: { sql: string }[]) =>
    queries.map(q => {
      const key = Object.keys(slices).find(k => q.sql.includes(k));
      return key ? slices[key] : [];
    })
  );
  return {
    db: {
      get: live,
      all: live,
      run: live,
      multiQuery: batched,
      transaction: live
    } as any,
    live,
    batched
  };
}

function emptyContext(dates: string[]): AvailabilityContext {
  return {
    mentorId: "m1",
    mentorIds: ["m1"],
    smeId: "s1",
    dateSet: new Set(dates),
    leaves: [],
    mentorSlots: [],
    handedOver: new Set(),
    coverHandoversByDate: new Map(),
    interviewSlotsByDate: new Map(),
    directInterviewsByDate: new Map(),
    mentorDemoSwaps: [],
    smeDemoSwaps: [],
    smeDemoSessions: [],
    dailyConfigsByDate: new Map()
  };
}

describe("availability context preload", () => {
  it("reads every busy source for a date window in one batched round trip", async () => {
    const { db, batched, live } = fakeDb();
    const dates = ["2026-11-02", "2026-11-03", "2026-11-04"];

    const ctx = await loadAvailabilityContext(db, { mentorId: "m1", smeId: "s1", dates });

    expect(batched).toHaveBeenCalledTimes(1);
    expect(live).not.toHaveBeenCalled();
    expect([...ctx.dateSet]).toEqual(dates);
  });

  it("answers a whole date × period matrix without touching the database again", async () => {
    const { db, live } = fakeDb();
    const dates = ["2026-11-02", "2026-11-03", "2026-11-04"];
    const ctx = await loadAvailabilityContext(db, { mentorId: "m1", smeId: "s1", dates });

    for (const dateStr of dates) {
      const weekday = new Date(dateStr + "T00:00:00").toLocaleDateString("en-US", { weekday: "long" });
      for (const period of PERIODS) {
        await expect(
          checkMentorAvailability(db, { mentorId: "m1", dateStr, dayOfWeek: weekday, timeSlot: period, ctx })
        ).resolves.toEqual({ available: true });
        await expect(
          checkSmeAvailability(db, { smeId: "s1", dateStr, timeSlot: period, ctx })
        ).resolves.toEqual({ available: true });
      }
    }
    expect(live).not.toHaveBeenCalled();
  });

  it("refuses a partial load rather than reporting busy periods as free", async () => {
    const { db } = fakeDb();
    db.multiQuery = async (_queries: any[], failures?: any[]) => {
      failures?.push({ sql: "student_interview_slots", error: "boom" });
      return _queries.map(() => []);
    };

    await expect(
      loadAvailabilityContext(db, { mentorId: "m1", dates: ["2026-11-02"] })
    ).rejects.toThrow(/Availability context incomplete/);
  });

  it("matches leaves, teaching slots and demo swaps out of the preloaded rows", async () => {
    const { db, live } = fakeDb({
      faculty_leave_requests: [
        { id: "l1", mentor_id: "m1", request_type: "Leave", leave_category: "Casual", start_date: "2026-11-05", end_date: "2026-11-05", reason: "personal" }
      ],
      "FROM slots WHERE mentorId": [
        { id: "s10", mentorId: "m1", course: "DSA", classGroup: "CSE-3A", day: "Tuesday", time: "Period 3 (10:40 - 11:35)", shift: "general" }
      ],
      demo_swap_requests: [
        { id: "d1", subject: "React", mentorId: "m1", smeId: "s1", dateStr: "2026-11-03", timeSlot: PERIODS[4], status: "approved" }
      ]
    });
    const dates = ["2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05"];
    const ctx = await loadAvailabilityContext(db, { mentorId: "m1", smeId: "s1", dates });

    const leave = await checkMentorAvailability(db, {
      mentorId: "m1", dateStr: "2026-11-05", dayOfWeek: "Thursday", timeSlot: PERIODS[0], ctx
    });
    expect(leave.available).toBe(false);
    expect(leave.busyType).toBe("leave");

    const classDay = await checkMentorAvailability(db, {
      mentorId: "m1", dateStr: "2026-11-03", dayOfWeek: "Tuesday", timeSlot: PERIODS[2], ctx
    });
    expect(classDay.busyType).toBe("slot");

    // Regression: the period number used to be parsed as a clock time, so the class
    // at Period 3 blocked every other period of that day as well.
    for (const other of [PERIODS[0], PERIODS[1], PERIODS[3], PERIODS[5]]) {
      const free = await checkMentorAvailability(db, {
        mentorId: "m1", dateStr: "2026-11-03", dayOfWeek: "Tuesday", timeSlot: other, ctx
      });
      expect({ period: other, ...free }).toEqual({ period: other, available: true });
    }

    const backToBack = await checkMentorAvailability(db, {
      mentorId: "m1", dateStr: "2026-11-03", dayOfWeek: "Tuesday", timeSlot: "11:00 AM - 11:45 AM", ctx
    });
    expect(backToBack.busyType).toBe("slot");

    const demoDay = await checkMentorAvailability(db, {
      mentorId: "m1", dateStr: "2026-11-03", dayOfWeek: "Tuesday", timeSlot: PERIODS[4], ctx
    });
    expect(demoDay.busyType).toBe("demo");

    const smeDemoDay = await checkSmeAvailability(db, { smeId: "s1", dateStr: "2026-11-03", timeSlot: PERIODS[4], ctx });
    expect(smeDemoDay.busyType).toBe("demo");

    const smeOtherPeriod = await checkSmeAvailability(db, { smeId: "s1", dateStr: "2026-11-03", timeSlot: PERIODS[0], ctx });
    expect(smeOtherPeriod.available).toBe(true);

    expect(live).not.toHaveBeenCalled();
  });

  it("loads one shared context for several mentors and keeps each mentor's busy rows apart", async () => {
    const { db, batched, live } = fakeDb({
      faculty_leave_requests: [
        { id: "l1", mentor_id: "m1", request_type: "Leave", leave_category: "Casual", start_date: "2026-11-05", end_date: "2026-11-05" }
      ],
      "FROM slots WHERE mentorId": [
        { id: "s20", mentorId: "m2", course: "OS", classGroup: "CSE-4B", day: "Wednesday", time: PERIODS[1], shift: "general" }
      ],
      student_interview_slots: [
        { mentor_id: "m3", id: "is1", interview_id: "i9", slot_start_time: "10:40", slot_end_time: "11:35", subject: "DSA", target_date: "2026-11-04" }
      ]
    });
    const dates = ["2026-11-04", "2026-11-05"];
    const ctx = await loadAvailabilityContext(db, { mentorIds: ["m1", "m2", "m3"], dates });
    expect(batched).toHaveBeenCalledTimes(1);

    const at = (mentorId: string, dateStr: string, timeSlot: string) =>
      checkMentorAvailability(db, { mentorId, dateStr, dayOfWeek: "Wednesday", timeSlot, ctx });

    // m1's leave only blocks m1.
    expect((await at("m1", "2026-11-05", PERIODS[2])).busyType).toBe("leave");
    expect(await at("m2", "2026-11-05", PERIODS[2])).toEqual({ available: true });
    expect(await at("m1", "2026-11-04", PERIODS[2])).toEqual({ available: true });

    // m2's class and m3's interview panel stay scoped to their own mentor.
    expect((await at("m2", "2026-11-04", PERIODS[1])).busyType).toBe("slot");
    expect((await at("m3", "2026-11-04", PERIODS[2])).busyType).toBe("interview");
    expect(live).not.toHaveBeenCalled();
  });

  it("still reads live, as one batch, for a date the context never covered", async () => {
    const batches: { sql: string; params?: any[] }[][] = [];
    const db = {
      get: async () => null,
      all: async () => [],
      multiQuery: async (queries: any[]) => {
        batches.push(queries);
        return queries.map(() => []);
      }
    } as any;

    const ctx = emptyContext(["2026-11-02"]);
    await expect(
      checkMentorAvailability(db, { mentorId: "m1", dateStr: "2026-12-25", dayOfWeek: "Friday", timeSlot: PERIODS[0], ctx })
    ).resolves.toEqual({ available: true });

    expect(batches).toHaveLength(1);
    expect(batches[0].some(q => q.sql.includes("faculty_leave_requests") && (q.params || []).includes("2026-12-25"))).toBe(true);
  });

  it("refuses to call a mentor free when a fallback slice fails", async () => {
    const db = {
      get: async () => null,
      all: async () => [],
      multiQuery: async (queries: any[], failures?: any[]) => {
        failures?.push({ sql: queries[0].sql, error: "connection timeout" });
        return queries.map(() => []);
      }
    } as any;

    await expect(
      checkMentorAvailability(db, { mentorId: "m1", dateStr: "2026-12-25", dayOfWeek: "Friday", timeSlot: PERIODS[0] })
    ).rejects.toThrow(/Availability inputs unreadable/);
  });
});

describe("reallocation matrix route", () => {
  const routeSource = readFileSync(
    join(process.cwd(), "src/app/api/demo-reallocations/route.ts"),
    "utf8"
  );

  it("preloads the availability window once instead of per date × period", () => {
    expect(routeSource).toContain("loadAvailabilityContext(db, { mentorId: demo.mentorId, smeId: demo.smeId");
    expect(routeSource).toMatch(/checkMentorAvailability\(db, \{[\s\S]*?ctx: ctx \?\? undefined/);
    expect(routeSource).toMatch(/checkSmeAvailability\(db, \{[\s\S]*?ctx: ctx \?\? undefined/);
  });

  it("keeps the fallback live clash query only while the preload is unavailable", () => {
    expect(routeSource).toContain("mentorSelfDemos\n            ? hasSelfDemoAt(mentorSelfDemos");
    expect(routeSource).toContain("smeOtherDemos\n            ? hasSelfDemoAt(smeOtherDemos");
  });
});

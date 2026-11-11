import { beforeEach, describe, expect, it, vi } from "vitest";
import { flushAfter } from "./afterQueue";

const h = vi.hoisted(() => {
  const reads: string[] = [];
  const writes: { sql: string; params: any[] }[] = [];
  const loaded: any[] = [];
  const checked: any[] = [];

  const interview = {
    id: "i1",
    type: "internal",
    subject: "DSA",
    class_group: "CSE-3A",
    target_date: "2026-11-04",
    preferred_start_time: "09:00 AM",
    student_count: 6,
    college_id: "c1",
    origin_college_id: "c1",
    status: "pending",
    assigned_mentor_ids: null,
    gmeet_link: null
  };

  const mentors = [
    { id: "m1", name: "Asha", email: "asha@example.com", college_id: "c1" },
    { id: "m2", name: "Bala", email: "bala@example.com", college_id: "c1" },
    { id: "m3", name: "Chitra", email: null, college_id: "c1" }
  ];

  const record = (sql: string, params: any[]) => ({ sql, params });

  function makeDb() {
    return {
      get: async (sql: string) => {
        reads.push(sql);
        if (sql.includes("FROM student_interviews")) return interview;
        return null;
      },
      all: async (sql: string, params: any[] = []) => {
        reads.push(sql);
        if (sql.includes("FROM mentors")) return mentors;
        if (sql.includes("FROM students")) {
          return (params as string[]).map((id, i) => ({
            id, name: `Student ${i}`, email: `s${i}@example.com`, register_number: `R${i}`, classGroup: "CSE-3A", department: "CSE"
          }));
        }
        return [];
      },
      run: async (sql: string, ...args: any[]) => {
        writes.push(record(sql, args.length === 1 && Array.isArray(args[0]) ? args[0] : args));
        return { changes: 1 };
      },
      multiQuery: async (queries: { sql: string; params?: any[] }[]) => {
        reads.push(...queries.map(q => q.sql));
        return queries.map(q => {
          if (q.sql.includes("FROM student_interviews")) return [interview];
          if (q.sql.includes("FROM mentors")) return mentors;
          return [];
        });
      },
      transaction: async (cb: any) => cb({
        run: async (sql: string, ...args: any[]) => {
          writes.push(record(sql, args.length === 1 && Array.isArray(args[0]) ? args[0] : args));
          return { changes: 1 };
        }
      })
    };
  }

  return { reads, writes, loaded, checked, makeDb };
});

vi.mock("@/lib/db", () => ({
  getDb: async () => h.makeDb(),
  syncMentorSubjectsAndClasses: async () => undefined
}));

vi.mock("@/lib/migrations", () => ({ ensureMigration: async () => undefined }));
vi.mock("@/lib/authGuard", () => ({ requireAuth: async () => ({}) }));

vi.mock("@/lib/interview-notifications", () => ({
  dispatchExternalInterviewNotifications: async () => undefined,
  notifyExternalInterviewsAfterResponse: () => undefined
}));

vi.mock("@/lib/google-calendar", () => ({
  generateStudentGCalUrl: () => "https://calendar.example/event"
}));

let availabilityResult: { available: boolean; reason?: string } = { available: true };

vi.mock("@/lib/availability", () => ({
  loadAvailabilityContext: async (_db: any, opts: any) => {
    h.loaded.push(opts);
    return { mentorIds: opts.mentorIds ?? [], dateSet: new Set(opts.dates), smeId: null };
  },
  checkMentorAvailability: async (_db: any, params: any) => {
    h.checked.push(params);
    return availabilityResult;
  }
}));

const { POST } = await import("@/app/api/interviews/assign/route");

const payload = {
  interview_id: "i1",
  mapped_mentor_ids: ["m1", "m2"],
  student_count: 6,
  cm_name: "Campus Manager",
  selected_student_ids: ["st1", "st2", "st3", "st4", "st5", "st6"],
  mentor_schedule: [
    { mentor_id: "m1", student_count: 2, time_slot: "09:00 AM" },
    { mentor_id: "m2", student_count: 2, time_slot: "10:00 AM" },
    { mentor_id: "m3", student_count: 2 }
  ]
};

async function run(body: any) {
  const request = new Request("http://localhost/api/interviews/assign", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  const response = await POST(request as any);
  return response.json();
}

describe("interview assignment writes", () => {
  beforeEach(() => {
    h.reads.length = 0;
    h.writes.length = 0;
    h.loaded.length = 0;
    h.checked.length = 0;
    availabilityResult = { available: true };
  });

  it("loads one availability context for every mentor instead of one engine run each", async () => {
    const json = await run(payload);

    expect(json.success).toBe(true);
    expect(h.loaded).toHaveLength(1);
    expect(h.loaded[0].mentorIds.sort()).toEqual(["m1", "m2", "m3"]);
    expect(h.loaded[0].dates).toEqual(["2026-11-04"]);
    expect(h.checked).toHaveLength(3);
    expect(h.checked.every(c => c.ctx && c.ctx.dateSet.has("2026-11-04"))).toBe(true);
    expect(h.checked.map(c => c.timeSlot)).toEqual(["09:00 AM", "10:00 AM", "09:00 AM"]);
  });

  it("names every mentor from a single lookup and never re-queries on a conflict", async () => {
    availabilityResult = { available: false, reason: "Mentor is on Approved Leave." };
    const json = await run(payload);

    expect(json.success).toBe(false);
    expect(json.message).toBe("Cannot assign mentor Asha at 09:00 AM: Mentor is on Approved Leave.");
    // interview + mentor roster only; no per-mentor name lookup on the refusal path.
    expect(h.reads).toHaveLength(2);
    expect(h.reads.filter(r => r.includes("SELECT name FROM mentors WHERE id = ?"))).toHaveLength(0);
    expect(h.writes).toHaveLength(0);
  });

  it("writes all student slots as one chunked insert atomically with the clear", async () => {
    await run(payload);

    expect(h.writes.map(w => w.sql)).toEqual([
      expect.stringContaining("UPDATE student_interviews"),
      expect.stringContaining("DELETE FROM student_interview_slots"),
      expect.stringContaining("INSERT INTO student_interview_slots")
    ]);

    const insert = h.writes[2];
    const rows = (insert.sql.match(/\(\?(?:, \?){15}\)/g) || []);
    expect(rows).toHaveLength(6);
    expect(insert.params).toHaveLength(6 * 16);
    // 15-minute cadence per mentor rather than one clock for the whole panel.
    expect(insert.params.slice(8, 10)).toEqual(["09:00", "09:15"].map(t => `${t} AM`));
  });

  it("reuses the roster lookup for the assignment", async () => {
    await run(payload);
    await flushAfter();

    expect(h.reads.filter(r => r.includes("FROM mentors"))).toHaveLength(1);
  });
});

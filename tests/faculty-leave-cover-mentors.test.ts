import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => {
  const batchSizes: number[] = [];
  const batchSlices: { sql: string; params: any[] }[][] = [];
  const allReads: string[] = [];
  const getReads: string[] = [];

  const DATE = "2026-11-04"; // Wednesday

  const state = {
    slot: null as any,
    mentors: [] as any[],
    leaveRows: [] as any[],
    slotRows: [] as any[],
    sameSubject: [] as any[]
  };

  const contextRowsFor = (sql: string): any[] => {
    if (sql.includes("FROM faculty_leave_requests")) return state.leaveRows;
    if (sql.includes("FROM slots WHERE mentorId IN")) return state.slotRows;
    return [];
  };

  const makeDb = () => ({
    multiQuery: async (queries: { sql: string; params?: any[] }[]) => {
      batchSizes.push(queries.length);
      const norm = queries.map(q => ({ sql: q.sql, params: [...(q.params || [])] }));
      batchSlices.push(norm);
      return norm.map(q => {
        if (q.sql.includes("FROM slots WHERE id = ?")) return state.slot ? [state.slot] : [];
        if (q.sql.includes("FROM mentors WHERE college_id")) {
          const excluded = String(q.params[1] || "");
          return state.mentors.filter(m => m.id !== excluded);
        }
        return contextRowsFor(q.sql);
      });
    },
    all: async (sql: string) => {
      allReads.push(sql);
      if (sql.includes("LOWER(course)")) return state.sameSubject;
      if (sql.includes("FROM mentors")) return state.mentors;
      return [];
    },
    get: async (sql: string) => {
      getReads.push(sql);
      if (sql.includes("FROM slots WHERE id")) return state.slot;
      if (sql.includes("mentorId = ? AND LOWER(course)")) return state.sameSubject[0] || null;
      return null;
    },
    run: async () => ({ changes: 1 }),
    exec: async () => {}
  });

  return { batchSizes, batchSlices, allReads, getReads, state, DATE, makeDb };
});

vi.mock("@/lib/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db")>();
  return { ...actual, getDb: async () => h.makeDb() };
});
vi.mock("@/lib/authGuard", () => ({
  requireAuth: async () => ({ auth: { id: "cm1", role: "cm", email: "cm@example.com" }, errorResponse: null })
}));
const { GET } = await import("@/app/api/requests/faculty-leave/route");

beforeEach(() => {
  h.batchSizes.length = 0;
  h.batchSlices.length = 0;
  h.allReads.length = 0;
  h.getReads.length = 0;
  Object.assign(h.state, {
    slot: { id: "s1", mentorId: "m4", course: "DSA", classGroup: "CSE-3A", day: "Wednesday", time: "09:00 AM - 10:00 AM", shift: "general" },
    mentors: [
      { id: "m1", name: "Asha", department: "CSE", email: "asha@example.com" },
      { id: "m2", name: "Bala", department: "CSE", email: "bala@example.com" },
      { id: "m3", name: "Chitra", department: "CSE", email: "chitra@example.com" },
      { id: "m4", name: "Deepa", department: "CSE", email: "deepa@example.com" }
    ],
    leaveRows: [{ mentor_id: "m2", id: "lv1", request_type: "Leave", leave_category: "Casual", start_date: "2026-11-03", end_date: "2026-11-05" }],
    slotRows: [{ mentorId: "m3", id: "s9", course: "DBMS", classGroup: "CSE-3B", day: "Wednesday", time: "09:00 AM - 10:00 AM", shift: "general" }],
    sameSubject: [{ mentorId: "m1" }]
  });
});

const candidates = () =>
  GET(new Request(
    `http://localhost/api/requests/faculty-leave?availableForSlotId=s1&availableForDate=${h.DATE}&availableForCollegeId=c1&excludeMentorId=m4`
  ) as any);

describe("GET /api/requests/faculty-leave?availableForSlotId", () => {
  it("answers the whole campus from one shared availability context", async () => {
    const res = await candidates();
    const body = await res.json();

    expect(res.status).toBe(200);
    // one batch for slot + roster, one batch for the shared context, nothing else
    expect(h.batchSizes).toHaveLength(2);
    expect(h.batchSizes[0]).toBe(2);
    expect(h.getReads).toHaveLength(0);
    expect(h.allReads).toHaveLength(1);
    expect(h.allReads[0]).toContain("SELECT DISTINCT mentorId FROM slots WHERE mentorId IN");

    const contextBatch = h.batchSlices[1];
    expect(contextBatch.some(q => q.sql.includes("FROM faculty_leave_requests"))).toBe(true);
    expect(contextBatch.find(q => q.sql.includes("FROM slots WHERE mentorId IN"))!.params).toEqual(["m1", "m2", "m3"]);
  });

  it("keeps each mentor's own busy windows attached to that mentor", async () => {
    const res = await candidates();
    const body = await res.json();

    expect(body.mentors.map((m: any) => m.id)).toEqual(["m1"]);
    expect(body.mentors[0].sameSubject).toBe(true);
  });

  it("reports no same-subject match when that read fails", async () => {
    h.state.sameSubject = [];

    const res = await candidates();
    const body = await res.json();

    expect(body.mentors.map((m: any) => m.id)).toEqual(["m1"]);
    expect(body.mentors[0].sameSubject).toBe(false);
  });

  it("404s before loading any context when the slot is unknown", async () => {
    h.state.slot = null;

    const res = await candidates();

    expect(res.status).toBe(404);
    expect(h.batchSizes).toEqual([2]);
    expect(h.allReads).toHaveLength(0);
  });
});

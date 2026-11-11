import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => {
  const batches: { sql: string; params: any[] }[][] = [];
  const singleReads: string[] = [];
  const writes: { sql: string; params: any[] }[] = [];

  const state = {
    plans: [] as any[],
    clearances: [] as any[],
    demos: [] as any[],
    tracker: [] as any[],
    subjects: [] as any[],
    mentors: [] as any[],
    failOn: null as string | null,
    existingId: null as string | null,
    failUpsertLookup: false,
    failReadBack: false
  };

  const rowsFor = (sql: string): any[] => {
    if (sql.includes("FROM mentor_skill_clearances")) return state.clearances;
    if (sql.includes("FROM mentor_weekly_plans")) return state.plans;
    if (sql.includes("FROM demo_sessions")) return state.demos;
    if (sql.includes("FROM academic_tracker")) return state.tracker;
    if (sql.includes("FROM subjects")) return state.subjects;
    if (sql.includes("FROM mentors")) return state.mentors;
    return [];
  };

  const makeDb = () => ({
    multiQuery: async (queries: { sql: string; params?: any[] }[], failures?: any[]) => {
      batches.push(queries.map(q => ({ sql: q.sql, params: [...(q.params || [])] })));
      return queries.map(q => {
        if (failures && state.failOn && q.sql.includes(state.failOn)) {
          failures.push({ sql: q.sql, error: `connection timeout reading ${state.failOn}` });
          return [];
        }
        return rowsFor(q.sql);
      });
    },
    get: async (sql: string, ...args: any[]) => {
      singleReads.push(sql);
      if (sql.includes("SELECT id FROM mentor_skill_clearances")) {
        if (state.failUpsertLookup) throw new Error("connection reset by server");
        return state.existingId ? { id: state.existingId } : null;
      }
      if (sql.includes("SELECT * FROM mentor_skill_clearances WHERE id")) {
        if (state.failReadBack) throw new Error("connection reset by server");
        return { id: String(args[0]), status: "cleared" };
      }
      return null;
    },
    all: async (sql: string) => {
      singleReads.push(sql);
      return rowsFor(sql);
    },
    run: async (sql: string, ...args: any[]) => {
      writes.push({ sql, params: args.length === 1 && Array.isArray(args[0]) ? args[0] : args });
      return { changes: 1 };
    },
    exec: async () => {}
  });

  return { batches, singleReads, writes, state, makeDb };
});

vi.mock("@/lib/db", () => ({ getDb: async () => h.makeDb() }));
vi.mock("@/lib/migrations", () => ({ ensureMigration: async () => {} }));
vi.mock("@/lib/authGuard", () => ({ requireAuth: async () => ({}) }));

const { GET, POST } = await import("@/app/api/skill-tracker/route");

const SUBJECT = "Communication Skills";

const get = (query = "") => GET(new Request(`http://localhost/api/skill-tracker${query ? `?${query}` : ""}`) as any);

const post = (body: any) =>
  POST(new Request("http://localhost/api/skill-tracker", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }) as any);

const verdict = {
  mentorId: "m1",
  mentorName: "Asha",
  collegeId: "c1",
  subject: SUBJECT,
  subjectType: "Skill",
  weekNumber: 1,
  scope: "week",
  status: "cleared",
  remarks: "Cleared on demo",
  verifiedBy: "SME"
};

beforeEach(() => {
  h.batches.length = 0;
  h.singleReads.length = 0;
  h.writes.length = 0;
  Object.assign(h.state, {
    plans: [],
    clearances: [],
    demos: [],
    tracker: [],
    subjects: [{ name: SUBJECT, type: "Skill" }],
    mentors: [{ id: "m1", name: "Asha", college_id: "c1" }],
    failOn: null,
    existingId: null,
    failUpsertLookup: false,
    failReadBack: false
  });
});

describe("GET /api/skill-tracker", () => {
  it("reads every slice in one batched round trip instead of six sequential awaits", async () => {
    h.state.plans = [{
      id: "wp1", mentor_id: "m1", subject: SUBJECT, week_number: 1, status: "Submitted",
      updated_at: "2026-11-01T00:00:00.000Z", session_plan: JSON.stringify([{ topic: "Active listening" }])
    }];
    h.state.clearances = [{
      id: "sc1", mentor_id: "m1", subject: SUBJECT, week_number: 1, scope: "week",
      status: "cleared", score: 8, remarks: "Good", verified_by: "SME"
    }];

    const res = await get(`mentorId=m1&collegeId=c1&subject=${encodeURIComponent(SUBJECT)}&weekNumber=1`);
    const body = await res.json();

    expect(h.batches).toHaveLength(1);
    expect(h.batches[0]).toHaveLength(6);
    expect(h.singleReads).toHaveLength(0);
    expect(h.batches[0][0].params).toEqual(["m1", "c1", SUBJECT]);
    expect(h.batches[0][5].sql).toContain("FROM mentors WHERE id = ?");
    expect(body.success).toBe(true);
    expect(body.mentors).toHaveLength(1);
    expect(body.mentors[0].weeks[0].verdict).toBe("cleared");
    expect(body.summary.cleared).toBe(1);
  });

  it("skips the mentor-roster slice when no scope is requested", async () => {
    const res = await get();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(h.batches).toHaveLength(1);
    expect(h.batches[0]).toHaveLength(5);
    expect(h.batches[0].some(q => q.sql.includes("FROM mentors"))).toBe(false);
    expect(body.mentors).toEqual([]);
  });

  it("reports a failed slice instead of rendering it as an empty tracker", async () => {
    h.state.plans = [{
      id: "wp1", mentor_id: "m1", subject: SUBJECT, week_number: 1, status: "Submitted",
      updated_at: "2026-11-01T00:00:00.000Z", session_plan: "[]"
    }];
    h.state.failOn = "FROM subjects";

    const res = await get("mentorId=m1");
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.success).toBe(false);
    expect(body.message).toContain("subjects");
  });
});

describe("POST /api/skill-tracker", () => {
  it("updates the existing verdict and reads it back by primary key", async () => {
    h.state.existingId = "sc-existing";

    const res = await post(verdict);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(h.writes).toHaveLength(1);
    expect(h.writes[0].sql).toContain("UPDATE mentor_skill_clearances");
    expect(h.writes[0].sql).not.toContain("INSERT INTO");
    expect(h.singleReads.filter(s => s.includes("SELECT * FROM mentor_skill_clearances")).map(s => s)).toHaveLength(1);
    expect(body.clearance.id).toBe("sc-existing");
  });

  it("fails before writing when the upsert-key lookup errors, so no duplicate verdict row is inserted", async () => {
    h.state.failUpsertLookup = true;

    const res = await post(verdict);
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.success).toBe(false);
    expect(h.writes).toHaveLength(0);
  });

  it("still reports success when the verdict is written but the read-back fails", async () => {
    h.state.failReadBack = true;

    const res = await post(verdict);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.clearance).toBeNull();
    expect(h.writes).toHaveLength(1);
    expect(h.writes[0].sql).toContain("INSERT INTO mentor_skill_clearances");
  });

  it("refuses academic subjects before touching the database", async () => {
    const res = await post({ ...verdict, subject: "Data Structures", subjectType: "Academic" });

    expect(res.status).toBe(400);
    expect(h.writes).toHaveLength(0);
    expect(h.singleReads).toHaveLength(0);
  });
});

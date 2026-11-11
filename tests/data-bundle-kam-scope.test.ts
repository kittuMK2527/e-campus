import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * KAM portfolio scoping on GET /api/data. A KAM must only ever read their assigned
 * campuses: zero campuses matches nothing (fail-closed, never the global LIMIT
 * fallbacks), a requested campus outside the portfolio is a 403 before any batch
 * runs, and every campus-bearing slice carries the portfolio ids. Drives the real
 * handler with a recording db stub; also asserts placeholder/param parity for every
 * query definition so a missed id spread cannot ship silently.
 */
const h = vi.hoisted(() => {
  const state = {
    role: "kam",
    userId: "k1",
    collegeId: null as string | null,
    kamRow: { id: "kam_1" } as any,
    assigned: [{ id: "Clg_a" }, { id: "Clg_b" }] as { id: string }[],
    defs: [] as { sql: string; params: any[] }[],
    allCalls: [] as { sql: string; params: any[] }[],
    batched: false
  };
  return {
    state,
    makeDb: () => ({
      get: async (sql: string) => (/kam_users/.test(sql) ? state.kamRow : null),
      all: async (sql: string, ...params: any[]) => {
        state.allCalls.push({ sql, params });
        return /FROM colleges WHERE kam_id/.test(sql) ? state.assigned : [];
      },
      run: async () => ({ changes: 0 }),
      multiQuery: async (defs: { sql: string; params?: any[] }[]) => {
        state.batched = true;
        state.defs = defs.map((d) => ({ sql: d.sql, params: d.params || [] }));
        return defs.map(() => []);
      }
    })
  };
});

vi.mock("@/lib/db", async () => {
  const actual = await vi.importActual<typeof import("@/lib/db")>("@/lib/db");
  return { ...actual, getDb: async () => h.makeDb() };
});
vi.mock("@/lib/migrations", () => ({ ensureMigration: async () => {} }));
vi.mock("@/lib/authGuard", async () => {
  const actual = await vi.importActual<typeof import("@/lib/authGuard")>("@/lib/authGuard");
  return {
    ...actual,
    requireAuth: async () => ({
      auth: { user: { id: h.state.userId, reference_id: h.state.userId, role: h.state.role, college_id: h.state.collegeId } }
    })
  };
});

const { GET } = await import("@/app/api/data/route");

async function load(query = "") {
  h.state.defs = [];
  h.state.allCalls = [];
  h.state.batched = false;
  return GET(new Request(`http://localhost/api/data${query}`, { method: "GET" }) as any);
}

const def = (table: string) => h.state.defs.find((d) => new RegExp(`FROM ${table}\\b`).test(d.sql));

beforeEach(() => {
  h.state.role = "kam";
  h.state.userId = "k1";
  h.state.collegeId = null;
  h.state.kamRow = { id: "kam_1" };
  h.state.assigned = [{ id: "Clg_a" }, { id: "Clg_b" }];
});

describe("KAM data-bundle scoping", () => {
  it("rejects a campus outside the portfolio before any batched read", async () => {
    const res = await load("?college_id=Clg_other");
    expect(res.status).toBe(403);
    expect((await res.json()).success).toBe(false);
    expect(h.state.batched).toBe(false);
  });

  it("narrows every campus-bearing slice to the selected assigned campus", async () => {
    const res = await load("?college_id=Clg_b");
    expect(res.status).toBe(200);
    expect(def("mentors")?.params).toEqual(["Clg_b"]);
    expect(def("students")?.params).toEqual(["Clg_b"]);
    expect(def("colleges")?.sql).toContain("WHERE id IN (?)");
    expect(def("colleges")?.params).toEqual(["Clg_b"]);
    expect(def("kam_tasks")?.params).toEqual(["Clg_b"]);
  });

  it("fails closed with zero assigned campuses instead of falling back to global reads", async () => {
    h.state.assigned = [];
    const res = await load();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.colleges).toEqual([]);
    expect(body.mentors).toEqual([]);
    for (const table of ["mentors", "slots", "students", "colleges", "kam_tasks", "campus_issues", "approvals"]) {
      expect(def(table)?.sql, `${table} leaked a global read`).toContain("IN (NULL)");
      expect(def(table)?.params).toEqual([]);
    }
    expect(h.state.defs.some((d) => /SELECT \* FROM mentors LIMIT/.test(d.sql))).toBe(false);
    expect(h.state.defs.some((d) => /SELECT \* FROM students LIMIT/.test(d.sql))).toBe(false);
  });

  it("scopes the whole portfolio across every campus-bearing slice with matching params", async () => {
    const res = await load();
    expect(res.status).toBe(200);
    const ids = ["Clg_a", "Clg_b"];
    expect(def("mentors")?.params).toEqual(ids);
    expect(def("student_interviews")?.params).toEqual([...ids, ...ids, ...ids]);
    expect(def("interview_evaluations")?.sql).toContain("interview_id IN (SELECT id FROM student_interviews");
    expect(def("interview_evaluations")?.params).toEqual([...ids, ...ids, ...ids]);
    expect(def("leave_balances")?.params).toEqual([...ids, ...ids, ...ids, ...ids]);
    expect(def("handover_requests")?.params).toEqual([...ids, ...ids]);
    expect(def("approved_handovers")?.params).toEqual([...ids, ...ids]);
    expect(def("weekly_tasks")?.params).toEqual([...ids, ...ids]);
    expect(def("student_tracker")?.params).toEqual(ids);
    expect(def("academic_events")?.sql).toContain("college_id IS NULL");
    expect(def("kam_tasks")?.sql).toContain("collegeId IN");
    expect(def("campus_issues")?.sql).toContain("collegeId IN");
    // Every definition must bind exactly as many placeholders as it passes params.
    for (const d of h.state.defs) {
      expect((d.sql.match(/\?/g) || []).length, `placeholder/param mismatch: ${d.sql}`).toBe(d.params.length);
    }
  });

  it("keeps the surgical attendance re-fetch inside the portfolio", async () => {
    let res = await load("?fields=attendance");
    expect(res.status).toBe(200);
    expect(h.state.batched).toBe(false);
    const att = h.state.allCalls.find((c) => /FROM student_attendance/.test(c.sql));
    expect(att?.sql).toContain("st.college_id IN (?,?)");
    expect(att?.params.slice(0, 2)).toEqual(["Clg_a", "Clg_b"]);
    h.state.assigned = [];
    res = await load("?fields=attendance");
    expect(res.status).toBe(200);
    const zeroAtt = h.state.allCalls.find((c) => /FROM student_attendance/.test(c.sql));
    expect(zeroAtt?.sql).toContain("st.college_id IN (NULL)");
    const body = await res.json();
    expect(body.studentAttendance).toEqual([]);
  });

  it("stops shipping the six slices no consumer reads, for every role", async () => {
    for (const role of ["admin", "kam", "cm", "fee_manager"]) {
      h.state.role = role;
      h.state.userId = `${role}_1`;
      const res = await load();
      expect(res.status).toBe(200);
      const body = await res.json();
      for (const key of ["notifications", "announcements", "loginHistory", "users", "campusManagers", "kamUsers"]) {
        expect(body[key], `${role} still receives ${key}`).toEqual([]);
      }
    }
  });

  it("serves the fee manager only the colleges/courses reference slices from the bundle", async () => {
    h.state.role = "fee_manager";
    h.state.userId = "fm_1";
    const res = await load();
    expect(res.status).toBe(200);
    const reads = (table: string) => h.state.defs.some((d) => d.sql !== "SELECT 1 WHERE 1=0" && new RegExp(`FROM ${table}\\b`).test(d.sql));
    for (const table of ["mentors", "slots", "students", "subjects", "faculty_leave_requests"]) {
      expect(reads(table), `${table} still read for fee_manager`).toBe(false);
    }
    expect(reads("colleges")).toBe(true);
    expect(reads("courses")).toBe(true);
  });
});
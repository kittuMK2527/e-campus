import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The attendance slice is the bundle's heaviest read — on the local snapshot 23 000 rows is
 * 3.4 MB of a ~4.2 MB payload, more than every other section combined. Only admin, CM, mentor
 * and student dashboards read it, so the other roles must not pay for it. This drives the real
 * handler with a recording db stub, so the assertion is on the SQL that would actually run.
 */
const h = vi.hoisted(() => {
  const state = { role: "kam", userId: "k1", collegeId: "Clg_a", defs: [] as { sql: string; params: any[] }[] };
  return {
    state,
    makeDb: () => ({
      get: async (sql: string) => (/kam_users/.test(sql) ? { id: "kam_1" } : null),
      all: async (sql: string, ...params: any[]) => {
        if (/FROM colleges WHERE kam_id/.test(sql)) return [{ id: state.collegeId }];
        return [];
      },
      run: async () => ({ changes: 0 }),
      multiQuery: async (defs: { sql: string; params?: any[] }[]) => {
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

const attendanceRead = () => h.state.defs.find((d) => /FROM student_attendance/.test(d.sql));

async function loadAs(role: string, query = "") {
  h.state.role = role;
  h.state.defs = [];
  const res = await GET(new Request(`http://localhost/api/data${query}`, { method: "GET" }) as any);
  expect(res.status).toBe(200);
  return res.json();
}

describe("GET /api/data attendance slice by role", () => {
  beforeEach(() => {
    h.state.userId = "k1";
    h.state.collegeId = "Clg_a";
    h.state.defs = [];
  });

  it("sends no attendance rows to the roles that have no attendance surface", async () => {
    for (const role of ["kam", "sme", "L and D", "fee_manager"]) {
      h.state.userId = `${role}_1`;
      const body = await loadAs(role);
      expect(attendanceRead(), `${role} still queried student_attendance`).toBeUndefined();
      expect(body.studentAttendance).toEqual([]);
      expect(body.success).toBe(true);
    }
  });

  it("keeps the semester window for the four dashboards that render attendance", async () => {
    h.state.userId = "m1";
    await loadAs("mentor");
    expect(attendanceRead()?.sql).toContain("slotId IN (SELECT id FROM slots WHERE mentorId = ?)");

    h.state.userId = "c1";
    await loadAs("cm");
    expect(attendanceRead()?.sql).toContain("st.college_id = ?");

    h.state.userId = "s1";
    await loadAs("student");
    expect(attendanceRead()?.sql).toContain("WHERE studentId = ?");

    h.state.userId = "admin_1";
    h.state.collegeId = null as any;
    await loadAs("admin");
    expect(attendanceRead()?.sql).toContain("dateStr >= ?");
  });

  it("leaves the surgical attendance re-fetch open for every role", async () => {
    h.state.userId = "k1";
    const body = await loadAs("kam", "?fields=attendance");
    expect(body.studentAttendanceFormat).toBe("compact");
    expect(body.success).toBe(true);
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => {
  const ddl: string[] = [];
  const reads: { sql: string; params: any[] }[] = [];
  const writes: { sql: string; params: any[] }[] = [];

  const state = {
    criteria: [] as any[],
    count: 0,
    maxOrder: -1,
    failOn: null as string | null
  };

  const maybeFail = (sql: string) => {
    if (state.failOn && sql.includes(state.failOn)) throw new Error("connection timeout");
  };

  const makeDb = () => ({
    get: async (sql: string, ...args: any[]) => {
      const params = args.length === 1 && Array.isArray(args[0]) ? args[0] : args;
      reads.push({ sql, params });
      maybeFail(sql);
      if (sql.includes("COUNT(*) AS n")) return { n: state.count };
      if (sql.includes("MAX(sort_order)")) return { maxOrder: state.maxOrder };
      if (sql.includes("WHERE id = ?")) return state.criteria.find(c => c.id === params[0]) || null;
      return null;
    },
    all: async (sql: string, ...args: any[]) => {
      reads.push({ sql, params: args.length === 1 && Array.isArray(args[0]) ? args[0] : args });
      maybeFail(sql);
      return state.criteria;
    },
    run: async (sql: string, ...args: any[]) => {
      writes.push({ sql, params: args.length === 1 && Array.isArray(args[0]) ? args[0] : args });
      maybeFail(sql);
      return { changes: 1 };
    },
    exec: async (sql: string) => { ddl.push(sql); },
    multiQuery: async (queries: any[]) => queries.map(() => []),
    transaction: async (cb: (tx: any) => Promise<any>) =>
      cb({ run: async (sql: string, ...a: any[]) => { writes.push({ sql, params: a }); return { changes: 1 }; },
           get: async () => null, all: async () => [] })
  });

  return { ddl, reads, writes, state, makeDb };
});

vi.mock("@/lib/db", () => ({ getDb: async () => h.makeDb() }));
vi.mock("@/lib/migrations", () => ({ ensureMigration: async () => {} }));
vi.mock("@/lib/authGuard", () => ({
  requireAuth: async () => ({
    auth: { user: { role: "sme", name: "Sara SME", email: "sara@x.y", reference_id: "sme1" } }
  })
}));

const { GET, POST } = await import("@/app/api/demo-eval-criteria/route");

const get = (query = "") => GET(new Request(`http://localhost/api/demo-eval-criteria${query ? `?${query}` : ""}`) as any);
const post = (body: any) =>
  POST(new Request("http://localhost/api/demo-eval-criteria", { method: "POST", body: JSON.stringify(body) }) as any);

beforeEach(() => {
  h.ddl.length = 0;
  h.reads.length = 0;
  h.writes.length = 0;
  Object.assign(h.state, { criteria: [], count: 0, maxOrder: -1, failOn: null });
});

describe("GET /api/demo-eval-criteria", () => {
  it("serves criteria without a single DDL statement", async () => {
    h.state.criteria = [{ id: "dec1", department: "CSE", label: "Tracker sheet updated", is_system: 1 }];

    const res = await get("department=CSE");
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(h.ddl).toHaveLength(0);
    expect(h.reads).toHaveLength(1);
    expect(h.reads[0].sql).toContain("department = ?");
    expect(h.reads[0].params).toEqual(["CSE"]);
    expect(body.criteria).toHaveLength(1);
  });

  it("reads every department in the same single statement shape", async () => {
    await get();

    expect(h.ddl).toHaveLength(0);
    expect(h.reads).toHaveLength(1);
    expect(h.reads[0].sql).not.toContain("department = ?");
  });

  it("fails loudly instead of returning an empty checklist", async () => {
    h.state.failOn = "FROM demo_evaluation_criteria";

    const res = await get();
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.success).toBe(false);
  });
});

describe("POST /api/demo-eval-criteria action=seed", () => {
  it("seeds the five fixed checks in one statement and issues no DDL", async () => {
    const res = await post({ action: "seed", department: "CSE" });

    expect(res.status).toBe(200);
    expect(h.ddl).toHaveLength(0);
    const inserts = h.writes.filter(w => w.sql.includes("INSERT INTO demo_evaluation_criteria"));
    expect(inserts).toHaveLength(1);
    expect(inserts[0].sql.split("), (")).toHaveLength(5);
    expect(inserts[0].params).toHaveLength(50);
    expect(inserts[0].params).toContain("Mentor certification program");
  });

  it("does not re-insert when the department already has criteria", async () => {
    h.state.count = 5;

    await post({ action: "seed", department: "CSE" });

    expect(h.writes.filter(w => w.sql.includes("INSERT INTO demo_evaluation_criteria"))).toHaveLength(0);
  });

  it("refuses to seed without naming a department before touching the db", async () => {
    const res = await post({ action: "seed" });

    expect(res.status).toBe(400);
    expect(h.writes).toHaveLength(0);
  });
});

describe("POST /api/demo-eval-criteria CRUD", () => {
  it("appends after the highest sort order using the case-preserved alias", async () => {
    h.state.maxOrder = 3;

    const res = await post({ action: "create", department: "CSE", label: "Lab readiness", type: "checkbox", createdBy: "Someone Else" });

    expect(res.status).toBe(200);
    const insert = h.writes.find(w => w.sql.includes("INSERT INTO demo_evaluation_criteria"))!;
    expect(insert.params).toEqual([expect.any(String), "CSE", "Lab readiness", "checkbox", null, null, 4, "Sara SME", expect.any(String)]);
    expect(h.reads[0].sql).toContain('AS "maxOrder"');
    // The audit trail credits the verified session, never the name in the body.
    const audit = h.writes.find(w => w.sql.includes("INSERT INTO audit_logs"))!;
    expect(audit.params).toContain("Sara SME");
    expect(audit.params).toContain("sme");
    expect(audit.params).not.toContain("Someone Else");
  });

  it("creates without a max-row read failure being swallowed into sort order 0", async () => {
    h.state.failOn = "MAX(sort_order)";

    const res = await post({ action: "create", department: "CSE", label: "Lab readiness", type: "checkbox" });

    expect(res.status).toBe(500);
    expect(h.writes).toHaveLength(0);
  });

  it("keeps fixed system criteria read-only", async () => {
    h.state.criteria = [{ id: "dec1", department: "CSE", label: "Weekly plan submitted", is_system: 1 }];

    const res = await post({ action: "delete", id: "dec1" });
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body.message).toContain("fixed system criterion");
    expect(h.writes).toHaveLength(0);
  });
});

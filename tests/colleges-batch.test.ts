import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => {
  const batches: { sql: string; params: any[] }[][] = [];
  const singleReads: string[] = [];
  const writes: { sql: string; params: any[] }[] = [];

  const state = {
    colleges: [] as any[],
    campusManagers: [] as any[],
    kamUsers: [] as any[],
    idMatches: [] as any[],
    nameMatches: [] as any[],
    throwOnMultiQuery: null as string | null
  };

  const rowsFor = (sql: string, params: any[]): any[] => {
    if (sql.includes("FROM colleges WHERE id = ?")) return state.idMatches;
    if (sql.includes("FROM colleges WHERE LOWER(name)")) return state.nameMatches;
    if (sql.includes("FROM campus_managers cm") || sql.includes("FROM campus_managers WHERE")) return state.campusManagers;
    if (sql.includes("FROM kam_users")) return state.kamUsers;
    if (sql.includes("FROM colleges")) return state.colleges;
    return [];
  };

  const makeDb = () => ({
    multiQuery: async (queries: { sql: string; params?: any[] }[]) => {
      if (state.throwOnMultiQuery) throw new Error(state.throwOnMultiQuery);
      const norm = queries.map(q => ({ sql: q.sql, params: [...(q.params || [])] }));
      batches.push(norm);
      return norm.map(q => rowsFor(q.sql, q.params));
    },
    get: async (sql: string) => {
      singleReads.push(sql);
      return null;
    },
    all: async (sql: string) => {
      singleReads.push(sql);
      return rowsFor(sql, []);
    },
    run: async (sql: string, ...args: any[]) => {
      writes.push({ sql, params: args.length === 1 && Array.isArray(args[0]) ? args[0] : args });
      return { changes: 1 };
    },
    exec: async () => {},
    transaction: async (cb: any) => cb({ get: async () => null, all: async () => [], run: async () => ({ changes: 0 }), exec: async () => {} })
  });

  return { batches, singleReads, writes, state, makeDb };
});

vi.mock("@/lib/db", () => ({ getDb: async () => h.makeDb() }));
vi.mock("@/lib/authGuard", () => ({ requireAuth: async () => ({}) }));

const { GET, POST } = await import("@/app/api/colleges/route");

beforeEach(() => {
  h.batches.length = 0;
  h.singleReads.length = 0;
  h.writes.length = 0;
  Object.assign(h.state, {
    colleges: [{ id: "c1", name: "Sri Amaraavathi" }],
    campusManagers: [{ id: "cm1", name: "Kala" }],
    kamUsers: [{ id: "k1", name: "Ravi" }],
    idMatches: [],
    nameMatches: [],
    throwOnMultiQuery: null
  });
});

describe("GET /api/colleges", () => {
  it("loads all three lists in one batched call", async () => {
    const res = await GET(new Request("http://localhost/api/colleges") as any);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(h.batches).toHaveLength(1);
    expect(h.batches[0]).toHaveLength(3);
    expect(h.batches[0].every(q => q.params.length === 0)).toBe(true);
    expect(h.singleReads).toHaveLength(0);
    expect(body.colleges).toHaveLength(1);
    expect(body.campusManagers).toHaveLength(1);
    expect(body.kamUsers).toHaveLength(1);
  });

  it("surfaces a database error instead of an empty campus list", async () => {
    h.state.throwOnMultiQuery = "pool timeout";

    const res = await GET(new Request("http://localhost/api/colleges") as any);
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.error).toContain("pool timeout");
  });
});

describe("POST /api/colleges", () => {
  const post = (body: any) =>
    POST(new Request("http://localhost/api/colleges", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }) as any);

  it("checks id and name uniqueness in one round trip", async () => {
    const res = await post({ name: "Solamalai", kam_id: "k1" });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(h.batches).toHaveLength(1);
    expect(h.batches[0]).toHaveLength(2);
    expect(h.batches[0][0].params[0]).toContain("solamalai");
    expect(h.batches[0][1].params).toEqual(["Solamalai"]);
    expect(h.singleReads).toHaveLength(0);
    expect(h.writes).toHaveLength(1);
    expect(h.writes[0].sql).toContain("INSERT INTO colleges");
    expect(body.id).toBeDefined();
  });

  it("rejects a duplicate name without inserting", async () => {
    h.state.nameMatches = [{ id: "c1" }];

    const res = await post({ name: "Sri Amaraavathi", kam_id: "k1" });
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.message).toContain("already exists");
    expect(h.writes).toHaveLength(0);
  });

  it("rejects a duplicate id without inserting", async () => {
    h.state.idMatches = [{ id: "college_x" }];

    const res = await post({ id: "college_x", name: "New", kam_id: "k1" });

    expect(res.status).toBe(400);
    expect(h.writes).toHaveLength(0);
  });
});

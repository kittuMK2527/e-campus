import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { isTransientError } from "../src/lib/db";

const poolQuery = vi.fn();
const poolEnd = vi.fn();
const poolOn = vi.fn();
const poolConfigs: any[] = [];
let poolInstances = 0;

vi.mock("pg", () => ({
  default: {
    Pool: class MockPool {
      constructor(config: any) {
        poolConfigs.push(config);
        poolInstances++;
      }
      query = poolQuery;
      end = poolEnd;
      on = poolOn;
      connect = vi.fn(async () => ({
        query: vi.fn(),
        release: vi.fn(),
      }));
    },
  },
}));

async function freshDbModule(): Promise<typeof import("../src/lib/db")> {
  vi.resetModules();
  return import("../src/lib/db");
}

beforeEach(() => {
  poolQuery.mockReset();
  poolEnd.mockReset();
  poolEnd.mockResolvedValue(undefined);
  poolOn.mockReset();
  poolConfigs.length = 0;
  poolInstances = 0;
  process.env.DATABASE_URL = "postgresql://postgres:pw@db.abcdefghij.supabase.co:5432/postgres";
});

afterEach(() => {
  delete process.env.DATABASE_URL;
  delete process.env.PG_POOL_MAX;
  delete process.env.DB_STATEMENT_TIMEOUT_MS;
  delete process.env.DB_CONNECT_TIMEOUT_MS;
});

vi.spyOn(console, "log").mockImplementation(() => {});
vi.spyOn(console, "warn").mockImplementation(() => {});
vi.spyOn(console, "error").mockImplementation(() => {});

describe("isTransientError", () => {
  it("treats pooler/connection restarts as retryable", () => {
    for (const code of ["08006", "08001", "08P01", "57P01", "57P03", "53300", "40001", "40P01"]) {
      expect(isTransientError({ code, message: `SQLSTATE ${code}` })).toBe(true);
    }
  });

  it("treats socket failures and pool-acquire timeouts as retryable", () => {
    expect(isTransientError({ code: "ECONNRESET" })).toBe(true);
    expect(isTransientError({ code: "UND_ERR_CONNECT_TIMEOUT" })).toBe(true);
    expect(isTransientError(new Error("Timeout expired"))).toBe(true);
    expect(isTransientError({ message: "Connection terminated unexpectedly" })).toBe(true);
    expect(
      isTransientError({ message: "remaining connection slots are reserved for non-replica superuser connections" })
    ).toBe(true);
  });

  it("never retries ambiguous or deterministic failures", () => {
    // 40003: the server may already have applied the statement.
    expect(isTransientError({ code: "40003", message: "statement_completion_unknown" })).toBe(false);
    expect(isTransientError({ code: "23505", message: "duplicate key value violates unique constraint" })).toBe(false);
    expect(isTransientError({ code: "42P01", message: "relation users does not exist" })).toBe(false);
    expect(isTransientError({ code: "22P02", message: "invalid input syntax for type integer" })).toBe(false);
    expect(isTransientError(null)).toBe(false);
    expect(isTransientError(new Error("boom"))).toBe(false);
  });
});

describe("getDb bootstrapping", () => {
  it("registers an error listener so an idle-client failure cannot kill the instance", async () => {
    poolQuery.mockResolvedValue({ rows: [], rowCount: 0 });
    await freshDbModule().then((m) => m.getDb());

    const errorHandler = poolOn.mock.calls.find(([event]) => event === "error")?.[1];
    expect(typeof errorHandler).toBe("function");
    // Must not throw when node-pg emits a connection error belonging to no query.
    expect(() => (errorHandler as any)(new Error("connection terminated"))).not.toThrow();
  });

  it("does not cache a failed boot, so the next request can reconnect", async () => {
    const mod = await freshDbModule();
    poolQuery.mockRejectedValueOnce(new Error("Connection refused"));

    await expect(mod.getDb()).rejects.toThrow(/Failed to connect to PostgreSQL/);
    expect(poolInstances).toBe(1);
    // A failed bootstrap must release the pool it just built.
    expect(poolEnd).toHaveBeenCalled();

    poolQuery.mockResolvedValue({ rows: [], rowCount: 0 });
    await expect(mod.getDb()).resolves.toBeDefined();
    expect(poolInstances).toBe(2);
  });

  it("reads the pool ceiling and timeouts from the environment, clamped", async () => {
    process.env.PG_POOL_MAX = "8";
    process.env.DB_STATEMENT_TIMEOUT_MS = "15000";
    process.env.DB_CONNECT_TIMEOUT_MS = "5000";
    poolQuery.mockResolvedValue({ rows: [], rowCount: 0 });
    await (await freshDbModule()).getDb();
    expect(poolConfigs[0]).toMatchObject({ max: 8, statement_timeout: 15000, connectionTimeoutMillis: 5000 });

    process.env.PG_POOL_MAX = "not-a-number";
    poolQuery.mockResolvedValue({ rows: [], rowCount: 0 });
    await (await freshDbModule()).getDb();
    expect(poolConfigs[1].max).toBe(20);

    process.env.PG_POOL_MAX = "5000";
    await (await freshDbModule()).getDb();
    expect(poolConfigs[2].max).toBe(100);
  });
});

describe("retry policy on the adapter", () => {
  it("retries a read that failed on a pooler restart", async () => {
    poolQuery.mockResolvedValue({ rows: [], rowCount: 0 });
    const db = await (await freshDbModule()).getDb();
    poolQuery.mockReset();
    poolQuery
      .mockRejectedValueOnce({ code: "57P03", message: "cannot_connect_now" })
      .mockResolvedValueOnce({ rows: [{ id: "mentor_1" }], rowCount: 1 });

    await expect(db.get("SELECT * FROM mentors WHERE id = ?", "mentor_1")).resolves.toMatchObject({ id: "mentor_1" });
    expect(poolQuery).toHaveBeenCalledTimes(2);
  });

  it("still refuses to retry a plain write after an ambiguous failure", async () => {
    poolQuery.mockResolvedValue({ rows: [], rowCount: 0 });
    const db = await (await freshDbModule()).getDb();
    poolQuery.mockReset();
    poolQuery.mockRejectedValue({ code: "08006", message: "connection_closed" });

    await expect(db.run("UPDATE mentors SET name = ? WHERE id = ?", "X", "mentor_1")).rejects.toThrow(/connection_closed/);
    expect(poolQuery).toHaveBeenCalledTimes(1);
  });

  it("retries an idempotent upsert", async () => {
    poolQuery.mockResolvedValue({ rows: [], rowCount: 0 });
    const db = await (await freshDbModule()).getDb();
    poolQuery.mockReset();
    poolQuery
      .mockRejectedValueOnce({ code: "40001", message: "serialization_failure" })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });

    await expect(
      db.run("INSERT INTO x (id) VALUES (?) ON CONFLICT (id) DO NOTHING", "a")
    ).resolves.toMatchObject({ changes: 1 });
    expect(poolQuery).toHaveBeenCalledTimes(2);
  });
});

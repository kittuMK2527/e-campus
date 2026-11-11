import crypto from "crypto";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  getDb: vi.fn(),
  all: vi.fn<(sql: string, ...args: string[]) => Promise<unknown[]>>(),
}));

// Never import the real database or logger (including their transitive dependencies).
vi.mock("@/lib/db", () => ({ getDb: h.getDb }));
vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

const cacheControl = "private, max-age=60, stale-while-revalidate=300";
const colleges = [{ id: "a", name: "College A" }];
const academicYears = ["2025", { year: "2026" }, { year_name: "2027" }, { name: "2028" }];
const settings = [
  { key: "mailing_enabled", value: "false" },
  { key: "attendance_lock_enabled", value: "true" },
  { key: "unrelated_setting", value: "ignored" },
];

function payloadFor(collegeId?: string) {
  const scope = collegeId || "all";
  const courses = [{ id: `course-${scope}` }];
  return {
    success: true,
    colleges,
    subjects: [{ id: `subject-${scope}` }],
    courses,
    departments: courses,
    academicYears: ["2025", "2026", "2027", "2028"],
    systemSettings: { mailing_enabled: false, attendance_lock_enabled: true },
  };
}

function queriesFor(collegeId?: string) {
  const scope = collegeId ? "college_id = ? OR college_id IS NULL" : "1=1";
  const args = collegeId ? [collegeId] : [];
  return [
    ["SELECT * FROM colleges ORDER BY name ASC"],
    [`SELECT * FROM subjects WHERE ${scope} ORDER BY department, name LIMIT 5000`, ...args],
    [`SELECT * FROM courses WHERE ${scope} ORDER BY name LIMIT 2000`, ...args],
    [`SELECT * FROM departments WHERE ${scope} ORDER BY name LIMIT 2000`, ...args],
    ["SELECT * FROM academic_years"],
    ["SELECT key, value FROM system_settings"],
  ];
}

function rowsFor(sql: string, collegeId?: string): unknown[] {
  const payload = payloadFor(collegeId);
  if (sql === "SELECT * FROM colleges ORDER BY name ASC") return colleges;
  if (sql.startsWith("SELECT * FROM subjects WHERE ")) return payload.subjects;
  if (sql.startsWith("SELECT * FROM courses WHERE ")) return payload.courses;
  if (sql.startsWith("SELECT * FROM departments WHERE ")) return [];
  if (sql === "SELECT * FROM academic_years") return academicYears;
  if (sql === "SELECT key, value FROM system_settings") return settings;
  throw new Error(`Unexpected query: ${sql}`);
}

function request(query = "", etag?: string) {
  return new NextRequest(`http://localhost/api/data/reference${query}`, {
    headers: etag ? { "If-None-Match": etag } : {},
  });
}

let GET: typeof import("@/app/api/data/reference/route").GET;

beforeEach(async () => {
  vi.resetModules();
  h.getDb.mockReset().mockResolvedValue({ all: h.all });
  h.all.mockReset().mockImplementation(async (sql, collegeId) => rowsFor(sql, collegeId));
  // The route currently logs failures directly to console, not the logger module.
  vi.spyOn(console, "error").mockImplementation(() => {});
  ({ GET } = await import("@/app/api/data/reference/route"));
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("GET /api/data/reference coalescing", () => {
  it("shares one six-read batch and payload build across nine simultaneous same-key callers", async () => {
    const gate = deferred();
    const hash = vi.spyOn(crypto, "createHash");
    h.all.mockImplementation(async (sql, collegeId) => {
      await gate.promise;
      return rowsFor(sql, collegeId);
    });
    const pending = Array.from({ length: 9 }, (_, i) =>
      GET(request(i % 2 ? "?collegeId=a" : "?college_id=a")));

    // Let the resolved getDb promise resume; all six reads remain blocked.
    await Promise.resolve();
    expect(h.getDb).toHaveBeenCalledTimes(1);
    expect(h.all.mock.calls).toEqual(queriesFor("a"));
    expect(hash).not.toHaveBeenCalled();

    gate.resolve();
    const responses = await Promise.all(pending);
    expect(responses.every(response => response.status === 200)).toBe(true);
    expect(new Set(responses).size).toBe(9);
    expect(await Promise.all(responses.map(response => response.json())))
      .toEqual(Array.from({ length: 9 }, () => payloadFor("a")));
    expect(hash).toHaveBeenCalledTimes(1);
    expect(h.all).toHaveBeenCalledTimes(6);
  });

  it("keeps all-college and different college scopes independent while coalescing each scope", async () => {
    const gates = [deferred(), deferred(), deferred()];
    const scopes = [undefined, "a", "b"];
    const batches = scopes.map((collegeId, i) => ({
      all: vi.fn(async (sql: string, ...args: string[]) => {
        await gates[i].promise;
        return rowsFor(sql, args[0]);
      }),
    }));
    for (const db of batches) h.getDb.mockResolvedValueOnce(db);
    const done = [false, false, false];
    const pending = scopes.map((collegeId, i) => Promise.all([
      GET(request(collegeId ? `?college_id=${collegeId}` : "")),
      GET(request(collegeId ? `?collegeId=${collegeId}` : "?college_id=")),
    ]).then(responses => { done[i] = true; return responses; }));

    await Promise.resolve();
    expect(h.getDb).toHaveBeenCalledTimes(3);
    batches.forEach((db, i) => expect(db.all.mock.calls).toEqual(queriesFor(scopes[i])));
    gates[1].resolve();
    const collegeA = await pending[1];
    expect(done).toEqual([false, true, false]);
    expect(await collegeA[0].json()).toEqual(payloadFor("a"));

    gates[0].resolve();
    gates[2].resolve();
    const [all, , collegeB] = await Promise.all(pending);
    expect(await all[0].json()).toEqual(payloadFor());
    expect(await collegeB[0].json()).toEqual(payloadFor("b"));
    expect(h.getDb).toHaveBeenCalledTimes(3);
  });

  it("reuses a warm entry without extending its five-minute TTL and coalesces the next refresh", async () => {
    const now = vi.spyOn(Date, "now").mockReturnValue(1_000);
    const first = await GET(request("?college_id=a"));
    const etag = first.headers.get("etag")!;
    now.mockReturnValue(1_000 + 5 * 60_000 - 1);
    const warm = await GET(request("?collegeId=a"));
    const unchanged = await GET(request("?college_id=a", etag));
    expect(await warm.json()).toEqual(payloadFor("a"));
    expect(warm.headers.get("etag")).toBe(etag);
    expect(warm.headers.get("cache-control")).toBe(cacheControl);
    expect(unchanged.status).toBe(304);
    expect(await unchanged.text()).toBe("");
    expect(unchanged.headers.get("etag")).toBe(etag);
    expect(unchanged.headers.get("cache-control")).toBe(cacheControl);
    expect(h.getDb).toHaveBeenCalledTimes(1);
    expect(h.all).toHaveBeenCalledTimes(6);

    now.mockReturnValue(1_000 + 5 * 60_000);
    const gate = deferred();
    h.all.mockImplementation(async (sql, collegeId) => {
      await gate.promise;
      return rowsFor(sql, collegeId);
    });
    const refresh = Array.from({ length: 9 }, () => GET(request("?college_id=a")));
    await Promise.resolve();
    expect(h.getDb).toHaveBeenCalledTimes(2);
    expect(h.all).toHaveBeenCalledTimes(12);
    gate.resolve();
    expect((await Promise.all(refresh)).every(response => response.status === 200)).toBe(true);
  });

  it.each(["getDb", "required read"])("removes a rejected %s promise so the same key can retry", async (failure) => {
    const gate = deferred();
    if (failure === "getDb") {
      h.getDb.mockImplementationOnce(async () => {
        await gate.promise;
        return { all: h.all };
      });
    } else {
      h.all.mockImplementation(async (sql, collegeId) => {
        if (sql.startsWith("SELECT * FROM subjects WHERE ")) await gate.promise;
        return rowsFor(sql, collegeId);
      });
    }
    const pending = Array.from({ length: 9 }, () => GET(request("?college_id=a")));
    await Promise.resolve();
    expect(h.getDb).toHaveBeenCalledTimes(1);
    expect(h.all).toHaveBeenCalledTimes(failure === "getDb" ? 0 : 6);
    gate.reject(new Error("stubbed reference failure"));
    const responses = await Promise.all(pending);
    expect(responses.every(response => response.status === 500)).toBe(true);
    expect(await Promise.all(responses.map(response => response.json())))
      .toEqual(Array.from({ length: 9 }, () => ({ success: false, error: "stubbed reference failure" })));
    expect(console.error).toHaveBeenCalledTimes(9);

    h.all.mockImplementation(async (sql, collegeId) => rowsFor(sql, collegeId));
    const retried = await Promise.all(Array.from({ length: 9 }, () => GET(request("?college_id=a"))));
    expect(h.getDb).toHaveBeenCalledTimes(2);
    expect(h.all).toHaveBeenCalledTimes(failure === "getDb" ? 6 : 12);
    expect(retried.every(response => response.status === 200)).toBe(true);
    expect(await retried[0].json()).toEqual(payloadFor("a"));
    await GET(request("?college_id=a"));
    expect(h.getDb).toHaveBeenCalledTimes(2);
  });

  it("applies SHA1 ETag and 304 handling separately to callers sharing a cold load", async () => {
    const expected = payloadFor("a");
    const etag = `"${crypto.createHash("sha1").update(JSON.stringify(expected)).digest("hex")}"`;
    const gate = deferred();
    h.all.mockImplementation(async (sql, collegeId) => {
      await gate.promise;
      return rowsFor(sql, collegeId);
    });
    const pending = [
      GET(request("?college_id=a", etag)),
      GET(request("?college_id=a")),
      GET(request("?college_id=a", '"different"')),
    ];
    gate.resolve();
    const responses = await Promise.all(pending);
    expect(responses.map(response => response.status)).toEqual([304, 200, 200]);
    expect(await responses[0].text()).toBe("");
    expect(await responses[1].json()).toEqual(expected);
    expect(await responses[2].json()).toEqual(expected);
    for (const response of responses) {
      expect(response.headers.get("etag")).toBe(etag);
      expect(response.headers.get("cache-control")).toBe(cacheControl);
    }
    expect(h.getDb).toHaveBeenCalledTimes(1);
    expect(h.all).toHaveBeenCalledTimes(6);
  });

  it("preserves optional-read fallbacks and caches the successful payload", async () => {
    h.all.mockImplementation(async (sql, collegeId) => {
      if (sql === "SELECT * FROM academic_years" || sql === "SELECT key, value FROM system_settings") {
        throw new Error("stubbed optional read failure");
      }
      return rowsFor(sql, collegeId);
    });
    const responses = await Promise.all(Array.from({ length: 9 }, () => GET(request())));
    expect(responses.every(response => response.status === 200)).toBe(true);
    expect(await responses[0].json()).toEqual({
      ...payloadFor(),
      academicYears: [],
      systemSettings: { mailing_enabled: true, attendance_lock_enabled: true },
    });
    expect((await GET(request())).status).toBe(200);
    expect(h.getDb).toHaveBeenCalledTimes(1);
    expect(h.all).toHaveBeenCalledTimes(6);
    expect(console.error).not.toHaveBeenCalled();
  });
});

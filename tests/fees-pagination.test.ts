import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// No real DB, authentication, or migration module is evaluated by this suite.
// Run through startVitest with envDir:false; these are SQL-shape/response tests,
// not database-executed SQL integration tests.
const h = vi.hoisted(() => ({
  getDb: vi.fn(),
  requireAuth: vi.fn(),
  ensureMigration: vi.fn(),
  db: { get: vi.fn(), all: vi.fn(), multiQuery: vi.fn(), run: vi.fn(), transaction: vi.fn() }
}));
vi.mock("@/lib/db", () => ({ getDb: h.getDb }));
vi.mock("@/lib/authGuard", () => ({ requireAuth: h.requireAuth }));
vi.mock("@/lib/migrations", () => ({ ensureMigration: h.ensureMigration }));

const { GET } = await import("@/app/api/fees/route");
const compact = (sql: string) => sql.replace(/\s+/g, " ").trim();
const request = (query: Record<string, string> = {}) =>
  GET(new Request(`http://localhost/api/fees?${new URLSearchParams(query)}`));
const asRole = (role: string, referenceId = "session-reference") => h.requireAuth.mockResolvedValue({
  auth: { user: { role, reference_id: referenceId } }, errorResponse: null
});
const pageResult = (rows: unknown[] = [], total: number | string = "1207", fees: unknown[] = []) => {
  h.db.get.mockResolvedValue({ total });
  h.db.all.mockResolvedValueOnce(rows);
  if (rows.length) h.db.all.mockResolvedValueOnce(fees);
};
function expectSameFilter(mode: "students" | "payments", params: unknown[], size = 25, offset = 0) {
  const [countSql, ...countParams] = h.db.get.mock.calls[0];
  const [rowSql, ...rowParams] = h.db.all.mock.calls[0];
  const from = mode === "students" ? "FROM students s" : "FROM fee_payments p";
  const order = mode === "students" ? "s.name ASC, s.id ASC" : "p.payment_date DESC, p.id DESC";
  const countFilter = compact(countSql).replace("SELECT COUNT(*) AS total ", "");
  const rows = compact(rowSql);
  expect(rows.slice(rows.indexOf(from))).toBe(`${countFilter} ORDER BY ${order} LIMIT ? OFFSET ?`);
  expect(countSql).not.toMatch(/LIMIT|OFFSET/);
  expect(countParams).toEqual(params);
  expect(rowParams).toEqual([...params, size, offset]);
  expect((rowSql.match(/\?/g) || []).length).toBe(rowParams.length);
  return rows;
}

beforeEach(() => {
  vi.resetAllMocks();
  asRole("admin");
  h.getDb.mockResolvedValue(h.db);
  h.db.get.mockRejectedValue(new Error("Unexpected get"));
  h.db.all.mockRejectedValue(new Error("Unexpected all"));
  h.db.multiQuery.mockRejectedValue(new Error("Unexpected multiQuery"));
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  expect(h.ensureMigration).not.toHaveBeenCalled();
  expect(h.db.run).not.toHaveBeenCalled();
  expect(h.db.transaction).not.toHaveBeenCalled();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("opt-in permissions", () => {
  it.each(["summary", "students", "payments", "unknown", ""])("rejects mode=%s for non-portfolio sessions", async mode => {
    for (const role of ["student", "cm", "mentor", "kam", "sme", "unknown"]) {
      asRole(role);
      const res = await request({ mode, role: "admin", studentId: "other", camId: "other" });
      expect(res.status).toBe(403);
      expect((await res.json()).success).toBe(false);
    }
    expect(h.getDb).not.toHaveBeenCalled();
  });
  it.each(["admin", "fee_manager"])("uses the %s session, not caller role", async role => {
    asRole(role);
    pageResult();
    const res = await request({ mode: "students", role: "student" });
    expect(res.status).toBe(200);
    expect((await res.json()).total).toBe(1207);
  });
  it.each(["", "unknown", "Summary"])("rejects unknown mode %s", async mode => {
    expect((await request({ mode })).status).toBe(400);
    expect(h.getDb).not.toHaveBeenCalled();
  });
  it("returns the authentication failure unchanged before reading data", async () => {
    const failure = Response.json({ success: false, message: "Authentication required" }, { status: 401 });
    h.requireAuth.mockResolvedValue({ auth: null, errorResponse: failure });
    expect(await request({ mode: "summary", role: "admin" })).toBe(failure);
    expect(h.getDb).not.toHaveBeenCalled();
  });
});

const summaryStats = { totalFees: "1000", totalPaid: "1200", totalOutstanding: "-200", paidCount: "3", partialCount: "2", unpaidCount: "1", totalStudents: "1207" };
const collegeTotals = [
  { college_id: "c1", totalStudents: "1207", totalFees: "1000", totalPaid: "1200", paymentTotal: "1400", paidCount: "3", partialCount: "2", unpaidCount: "1", pendingCount: "4" },
  { college_id: "empty", totalStudents: "0", totalFees: "0", totalPaid: "0", paymentTotal: "0", paidCount: "0", partialCount: "0", unpaidCount: "0", pendingCount: "0" }
];
const colleges = [{ id: "c1", name: "A College" }, { id: "empty", name: "Empty College" }];
const facets = [{ college_id: "c1", department: "CSE", semester: "3", year: "2026", classGroup: "II CSE" }];
function summaryResult() {
  h.db.get.mockResolvedValueOnce(summaryStats).mockResolvedValueOnce({ todayRevenue: "230" });
  h.db.all.mockResolvedValueOnce(colleges).mockResolvedValueOnce(collegeTotals).mockResolvedValueOnce(facets);
}

describe("summary aggregates", () => {
  it("returns uncapped numeric aggregates, all colleges and facets, but no raw roster or ledgers", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    // The institution date is already December 1; this contract explicitly uses UTC.
    vi.setSystemTime(new Date("2026-11-30T23:45:00.000Z"));
    summaryResult();
    const res = await request({ mode: "summary", from: "1900-01-01", collegeId: "not-a-filter" });
    const body = await res.json();
    expect(body).toEqual({
      success: true, colleges, facets, todayRevenue: 230,
      stats: { totalFees: 1000, totalPaid: 1200, totalOutstanding: -200, paidCount: 3, partialCount: 2, unpaidCount: 1, totalStudents: 1207 },
      collegeTotals: [
        { college_id: "c1", totalStudents: 1207, totalFees: 1000, totalPaid: 1200, paymentTotal: 1400, paidCount: 3, partialCount: 2, unpaidCount: 1, pendingCount: 4 },
        { college_id: "empty", totalStudents: 0, totalFees: 0, totalPaid: 0, paymentTotal: 0, paidCount: 0, partialCount: 0, unpaidCount: 0, pendingCount: 0 }
      ]
    });
    expect(res.headers.get("Cache-Control")).toContain("no-store");
    expect(h.db.all).toHaveBeenCalledTimes(3);
    expect(h.db.get).toHaveBeenCalledTimes(2);
    expect(h.db.multiQuery).not.toHaveBeenCalled();
    expect(h.db.all.mock.calls[0]).toEqual(["SELECT * FROM colleges ORDER BY name"]);
    expect(h.db.all.mock.calls[2]).toEqual(['SELECT DISTINCT college_id, department, semester, batch_start_year AS year, classGroup AS "classGroup" FROM students']);
    expect(h.db.get.mock.calls[1]).toEqual([
      'SELECT COALESCE(SUM(amount), 0) AS "todayRevenue" FROM fee_payments WHERE payment_date LIKE ?', "2026-12-01%"
    ]);
    const sql = compact(h.db.get.mock.calls[0][0]);
    expect(sql).toContain('CROSS JOIN (SELECT COUNT(*) AS "totalStudents" FROM students) s');
    expect(sql).toContain('COALESCE(SUM(amount), 0) AS "totalFees"');
    expect(sql).toContain('COALESCE(SUM(paid_amount), 0) AS "totalPaid"');
    for (const status of ["paid", "partial", "unpaid"]) {
      expect(sql).toContain(`COUNT(CASE WHEN status = '${status}' THEN 1 END) AS "${status}Count"`);
    }
    const grouped = compact(h.db.all.mock.calls[1][0]);
    expect(grouped).toContain('SELECT college_id, COUNT(*) AS "totalStudents" FROM students GROUP BY college_id');
    expect(grouped).toContain('FROM student_fees GROUP BY college_id');
    expect(grouped).toContain('SELECT college_id, COALESCE(SUM(amount), 0) AS "paymentTotal" FROM fee_payments GROUP BY college_id');
    expect(grouped).toContain('COUNT(CASE WHEN status <> \'paid\' OR status IS NULL THEN 1 END) AS "pendingCount"');
    for (const table of ["student_totals", "fee_totals", "payment_totals"]) expect(grouped).toContain(`LEFT JOIN ${table}`);
    for (const [query] of [...h.db.get.mock.calls, ...h.db.all.mock.calls]) {
      expect(query).not.toMatch(/LIMIT|SELECT\s+\*\s+FROM\s+(students|student_fees|fee_payments)\b/i);
      expect(query).not.toMatch(/JOIN\s+(students|student_fees|fee_payments)\b/i);
    }
  });
});

describe.each(["students", "payments"] as const)("%s pagination bounds", mode => {
  it("defaults to page 1, size 25 and counts beyond 500 even for an empty page", async () => {
    pageResult();
    const res = await request({ mode });
    expect(await res.json()).toEqual({ success: true, [mode]: [], ...(mode === "students" ? { fees: [] } : {}), total: 1207, page: 1, pageSize: 25 });
    expectSameFilter(mode, []);
    expect(h.db.all).toHaveBeenCalledTimes(1);
    expect(res.headers.get("Cache-Control")).toContain("no-store");
  });
  it("accepts the frontend size 100 and binds the page offset", async () => {
    pageResult();
    const res = await request({ mode, page: "7", pageSize: "100" });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ page: 7, pageSize: 100, total: 1207 });
    expectSameFilter(mode, [], 100, 600);
  });
  it.each(["", "0", "-1", "1.5", "NaN", "Infinity", "1e2", "0x10", " 2", "2oops", "9007199254740992"])("rejects invalid integer %s", async value => {
    for (const key of ["page", "pageSize"]) {
      const res = await request({ mode, [key]: value });
      expect(res.status).toBe(400);
      expect((await res.json()).success).toBe(false);
    }
    expect(h.getDb).not.toHaveBeenCalled();
  });
  it.each([{ page: "1", pageSize: "101" }, { page: "9007199254740991", pageSize: "100" }])("rejects oversize or unsafe pagination %j", async values => {
    expect((await request({ mode, ...values })).status).toBe(400);
    expect(h.getDb).not.toHaveBeenCalled();
  });
});

describe("student pages and filters", () => {
  it("projects only the existing admin columns and reads all fees for just the page in one query", async () => {
    const students = [{ id: "s1", name: "Same name", year: "2026" }, { id: "s2", name: "Same name", year: "2026" }];
    const fees = [{ id: "f3", student_id: "s1" }, { id: "f2", student_id: "s1" }, { id: "f1", student_id: "s2" }];
    pageResult(students, "1207", fees);
    const res = await request({ mode: "students", page: "2", pageSize: "2", from: "2099-01-01", to: "2099-02-01" });
    expect(await res.json()).toEqual({ success: true, students, fees, total: 1207, page: 2, pageSize: 2 });
    const sql = expectSameFilter("students", [], 2, 2);
    expect(sql.split(" FROM students s")[0]).toBe("SELECT s.id, s.name, s.email, s.classGroup, s.department, s.college_id, s.register_number, s.phone, s.batch_start_year, s.batch_end_year, s.semester, s.batch_start_year AS year");
    expect(h.db.all.mock.calls[1]).toEqual([
      "SELECT * FROM student_fees WHERE student_id IN (?,?) ORDER BY created_at DESC, id DESC", "s1", "s2"
    ]);
    expect(h.db.all).toHaveBeenCalledTimes(2);
  });
  it("shares literal search, exact department, college, year and status predicates with COUNT", async () => {
    pageResult();
    const q = "  A%_/\\' OR 1=1 --  ";
    const res = await request({ mode: "students", q, collegeId: "c'1", department: "CSE%", year: "II%_/", status: "partial", page: "3", pageSize: "10" });
    expect(res.status).toBe(200);
    const literal = "%a/%/_//\\' or 1=1 --%";
    const sql = expectSameFilter("students", [...Array(5).fill(literal), "c'1", "CSE%", "ii%_/", "%ii/%/_//%", "partial"], 10, 20);
    for (const column of ["name", "email", "id", "register_number", "phone"]) expect(sql).toContain(`LOWER(s.${column}) LIKE ? ESCAPE '/'`);
    expect(sql).toContain("s.college_id = ? AND s.department = ?");
    expect(sql).toContain("(LOWER(CAST(s.batch_start_year AS TEXT)) = ? OR LOWER(s.classGroup) LIKE ? ESCAPE '/')");
    expect(sql).not.toContain("CSE%");
    expect(sql).not.toContain("OR 1=1 --");
  });
  it("leaves all-valued facets and whitespace-only search unfiltered", async () => {
    pageResult();
    await request({ mode: "students", q: "   ", collegeId: "all", department: "all", year: "all", status: "all" });
    const sql = expectSameFilter("students", []);
    expect(sql).toContain("FROM students s WHERE 1=1 ORDER BY");
    expect(sql).not.toContain("JOIN");
  });
  it.each(["paid", "partial", "unpaid"])("derives %s from per-student sums with a no-fee-safe LEFT JOIN", async status => {
    // Returned fixtures are mocked; assertions below pin the SQL's no-fee semantics.
    const students = status === "unpaid" ? [{ id: "no-fees", name: "No fees" }] : [];
    pageResult(students);
    const res = await request({ mode: "students", status });
    expect(await res.json()).toMatchObject({ students, total: 1207 });
    const sql = expectSameFilter("students", [status]);
    expect(sql).toContain("LEFT JOIN ( SELECT student_id, SUM(amount) AS amount, SUM(paid_amount) AS paid FROM student_fees GROUP BY student_id ) fee_totals ON fee_totals.student_id = s.id");
    expect(sql).toContain("(CASE WHEN COALESCE(fee_totals.paid, 0) >= COALESCE(fee_totals.amount, 0) AND COALESCE(fee_totals.amount, 0) > 0 THEN 'paid' WHEN COALESCE(fee_totals.paid, 0) > 0 THEN 'partial' ELSE 'unpaid' END) = ?");
    expect(sql).not.toContain("status =");
  });
  it.each(["", "pending", "PAID", "paid' OR 1=1"])("rejects invalid status %s", async status => {
    expect((await request({ mode: "students", status })).status).toBe(400);
    expect(h.getDb).not.toHaveBeenCalled();
  });
});

describe("payment pages and filters", () => {
  it("joins names without dropping orphan payments and uses deterministic date/id ordering", async () => {
    const payments = [{ id: "p2", student_id: "s1", student_name: "Student name", payment_date: "2026-11-01" }, { id: "p1", student_id: "gone", student_name: null, payment_date: "2026-11-01" }];
    pageResult(payments, "701");
    const res = await request({ mode: "payments" });
    expect(await res.json()).toEqual({ success: true, payments, total: 701, page: 1, pageSize: 25 });
    const sql = expectSameFilter("payments", []);
    expect(sql).toContain("SELECT p.*, s.name AS student_name FROM fee_payments p LEFT JOIN students s ON s.id = p.student_id WHERE 1=1");
    expect(h.db.all).toHaveBeenCalledTimes(1);
  });
  it("keeps untrimmed literal search and binds college and inclusive date filters identically", async () => {
    pageResult();
    await request({ mode: "payments", q: " RCP%_/\\ ", collegeId: "c1", from: "2026-11-01", to: "2026-11-30" });
    const literal = "% rcp/%/_//\\ %";
    const sql = expectSameFilter("payments", [literal, literal, literal, "c1", "2026-11-01", "2026-11-30T23:59:59.999Z"]);
    for (const column of ["receipt_no", "student_id", "reference_no"]) expect(sql).toContain(`LOWER(p.${column}) LIKE ? ESCAPE '/'`);
    expect(sql).toContain("p.college_id = ? AND p.payment_date >= ? AND p.payment_date <= ?");
    expect(sql).not.toContain("LOWER(s.name)");
  });
  it("preserves an explicit end timestamp and ignores the all college facet", async () => {
    pageResult();
    await request({ mode: "payments", q: "  ", collegeId: "all", to: "2026-11-30T12:34:00Z" });
    expectSameFilter("payments", ["%  %", "%  %", "%  %", "2026-11-30T12:34:00Z"]);
  });
});

describe("new modes fail closed on read failures", () => {
  it.each(["colleges", "stats", "collegeTotals", "todayRevenue", "facets"])("returns 500 when summary %s fails", async slice => {
    const allRows = [colleges, collegeTotals, facets];
    const getRows = [summaryStats, { todayRevenue: "230" }];
    for (const [i, name] of ["colleges", "collegeTotals", "facets"].entries()) {
      if (slice === name) h.db.all.mockRejectedValueOnce(new Error("summary unavailable"));
      else h.db.all.mockResolvedValueOnce(allRows[i]);
    }
    for (const [i, name] of ["stats", "todayRevenue"].entries()) {
      if (slice === name) h.db.get.mockRejectedValueOnce(new Error("summary unavailable"));
      else h.db.get.mockResolvedValueOnce(getRows[i]);
    }
    const res = await request({ mode: "summary" });
    expect(res.status).toBe(500);
    expect(await res.json()).toMatchObject({ success: false, error: "summary unavailable" });
  });
  it.each([
    ["students", "count"], ["students", "rows"], ["students", "fees"],
    ["payments", "count"], ["payments", "rows"]
  ])("returns 500 for %s %s errors instead of empty success", async (mode, slice) => {
    if (slice === "count") h.db.get.mockRejectedValueOnce(new Error("count unavailable"));
    else h.db.get.mockResolvedValueOnce({ total: "600" });
    if (slice === "rows") h.db.all.mockRejectedValueOnce(new Error("rows unavailable"));
    else h.db.all.mockResolvedValueOnce([{ id: "s1" }]);
    h.db.all.mockRejectedValueOnce(new Error("fees unavailable"));
    const res = await request({ mode });
    expect(res.status).toBe(500);
    expect((await res.json()).success).toBe(false);
  });
  it("returns 500 when database acquisition fails", async () => {
    h.getDb.mockRejectedValue(new Error("database unavailable"));
    const res = await request({ mode: "payments" });
    expect(res.status).toBe(500);
    expect((await res.json()).success).toBe(false);
  });
});

const legacyFees = [{ id: "f1", student_id: "s1", amount: 100, paid_amount: 150, status: "paid" }];
const legacyPayments = [{ id: "p1", student_id: "s1", amount: 150 }];
const legacyStudents = [{ id: "s1", name: "Student", email: "s@example.test", classGroup: "II CSE", department: "CSE", batch_start_year: "2026", batch_end_year: "2030", semester: "1", year: "2026" }];
const dateQuery = { from: "2026-11-01", to: "2026-11-30" };
const dateParams = ["2026-11-01", "2026-11-30T23:59:59.999Z"];

describe("legacy GET compatibility without mode", () => {
  it.each(["admin", "fee_manager"])("preserves %s default payload, date filters, LIMIT 500 and clamped stats", async role => {
    asRole(role);
    const cams = [{ id: "cm1" }];
    for (const rows of [colleges, legacyStudents, legacyFees, legacyPayments, cams]) h.db.all.mockResolvedValueOnce(rows);
    const res = await request({ ...dateQuery, role: "student", pageSize: "invalid", status: "invalid" });
    expect(await res.json()).toEqual({
      success: true, colleges, students: legacyStudents, fees: legacyFees, payments: legacyPayments, cams,
      stats: { totalFees: 100, totalPaid: 150, totalOutstanding: 0, paidCount: 1, partialCount: 0, unpaidCount: 0, totalStudents: 1 }
    });
    expect(h.db.all.mock.calls[1][0]).toContain("batch_start_year as year FROM students ORDER BY name LIMIT 500");
    expect(h.db.all.mock.calls[2].slice(1)).toEqual(dateParams);
    expect(h.db.all.mock.calls[3].slice(1)).toEqual(dateParams);
    expect(h.db.all).toHaveBeenCalledTimes(5);
    expect(h.db.get).not.toHaveBeenCalled();
  });
  it("keeps CM campus scope from the session, the batch, and the original response", async () => {
    asRole("cm", "cm1");
    h.db.get.mockResolvedValue({ id: "cm1", college_id: "c1" });
    h.db.multiQuery.mockResolvedValue([legacyStudents, legacyFees, legacyPayments]);
    const res = await request({ ...dateQuery, role: "admin", camId: "other", collegeId: "other" });
    expect(await res.json()).toEqual({
      success: true, collegeId: "c1", students: legacyStudents, fees: legacyFees, payments: legacyPayments,
      stats: { totalFees: 100, totalPaid: 150, totalOutstanding: 0, paidCount: 1, partialCount: 0, unpaidCount: 0, totalStudents: 1, collectionRate: 100 }
    });
    expect(h.db.get.mock.calls[0]).toEqual(["SELECT * FROM campus_managers WHERE id = ?", "cm1"]);
    const queries = h.db.multiQuery.mock.calls[0][0];
    expect(queries[0].params).toEqual(["c1"]);
    expect(queries[0].sql).toContain("batch_start_year as year");
    for (const query of queries.slice(1)) {
      expect(query.sql).toContain("student_id IN (SELECT id FROM students WHERE college_id = ?)");
      expect(query.params).toEqual(["c1", ...dateParams]);
    }
    expect(h.db.all).not.toHaveBeenCalled();
  });
  it("keeps student self-scope and response despite caller role and identity", async () => {
    asRole("student", "s1");
    h.db.multiQuery.mockResolvedValue([legacyStudents, legacyFees, legacyPayments]);
    const res = await request({ ...dateQuery, role: "admin", studentId: "other" });
    expect(await res.json()).toEqual({
      success: true, student: legacyStudents[0], fees: legacyFees, payments: legacyPayments,
      stats: { totalFees: 100, totalPaid: 150, totalOutstanding: 0, paidCount: 1, partialCount: 0, unpaidCount: 0 }
    });
    const queries = h.db.multiQuery.mock.calls[0][0];
    expect(queries[0].params).toEqual(["s1"]);
    for (const query of queries.slice(1)) expect(query.params).toEqual(["s1", ...dateParams]);
    expect(h.db.all).not.toHaveBeenCalled();
    expect(h.db.get).not.toHaveBeenCalled();
  });
  it.each(["cm", "student"])("keeps %s missing-profile 404 and failed batch 500 distinct", async role => {
    asRole(role);
    h.db.get.mockResolvedValue(null);
    h.db.multiQuery.mockResolvedValue([[], [], []]);
    expect((await request()).status).toBe(404);
    h.db.get.mockResolvedValue({ college_id: "c1" });
    h.db.multiQuery.mockImplementation(async (_queries, failures) => {
      failures.push({ sql: "SELECT test", error: "unavailable" });
      return [[], [], []];
    });
    const res = await request();
    expect(res.status).toBe(500);
    expect((await res.json()).success).toBe(false);
  });
  it("does not grant a default portfolio read to a caller-supplied admin role", async () => {
    asRole("mentor");
    expect((await request({ role: "admin" })).status).toBe(403);
    expect(h.db.all).not.toHaveBeenCalled();
    expect(h.db.get).not.toHaveBeenCalled();
  });
});

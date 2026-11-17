import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => {
  const batches: { sql: string; params: any[] }[][] = [];
  const singleReads: string[] = [];
  const writes: string[] = [];
  const writeParams: any[][] = [];
  const txWrites: string[] = [];
  const ddl: string[] = [];

  const state = {
    leave: [] as any[],
    demoClash: [] as any[],
    smeClash: [] as any[],
    smeWindows: [] as any[],
    reservations: [] as any[],
    session: null as any,
    campusManagers: [] as any[],
    failOn: null as string | null
  };

  const rowsFor = (sql: string): any[] => {
    if (sql.includes("FROM faculty_leave_requests")) return state.leave;
    if (sql.includes("FROM sme_availability")) return state.smeWindows;
    if (sql.includes("FROM demo_reallocation_requests")) return state.reservations;
    if (sql.includes("FROM demo_sessions WHERE smeId = ?")) return state.smeClash;
    if (sql.includes("FROM demo_sessions WHERE id = ?")) return state.session ? [state.session] : [];
    if (sql.includes("FROM demo_sessions")) return state.demoClash;
    if (sql.includes("FROM campus_managers")) return state.campusManagers;
    return [];
  };

  const makeDb = () => ({
    multiQuery: async (queries: { sql: string; params?: any[] }[], failures?: any[]) => {
      const norm = queries.map(q => ({ sql: q.sql, params: [...(q.params || [])] }));
      batches.push(norm);
      return norm.map(q => {
        if (failures && state.failOn && q.sql.includes(state.failOn)) {
          failures.push({ sql: q.sql, error: "connection timeout" });
          return [];
        }
        return rowsFor(q.sql);
      });
    },
    get: async (sql: string) => {
      singleReads.push(sql);
      if (sql.includes("FROM demo_sessions WHERE id = ?")) return state.session;
      return rowsFor(sql)[0] || null;
    },
    all: async (sql: string) => {
      singleReads.push(sql);
      return rowsFor(sql);
    },
    run: async (sql: string, ...args: any[]) => {
      writes.push(sql);
      writeParams.push(args.length === 1 && Array.isArray(args[0]) ? args[0] : args);
      if (state.failOn && sql.includes(state.failOn)) throw new Error("write failed");
      // Mirror Postgres: one multi-row INSERT reports one change per row group.
      const groups = sql.includes("VALUES") ? (sql.match(/\)\s*,\s*\(/g) || []).length + 1 : 1;
      return { changes: groups };
    },
    exec: async (sql: string) => { ddl.push(sql); },
    transaction: async (cb: (tx: any) => Promise<any>) =>
      cb({ run: async (sql: string) => { txWrites.push(sql); return { changes: 1 }; } })
  });

  return { batches, singleReads, writes, writeParams, txWrites, ddl, state, makeDb };
});

vi.mock("@/lib/db", async () => {
  const actual = await vi.importActual<typeof import("@/lib/db")>("@/lib/db");
  return { ...actual, getDb: async () => h.makeDb() };
});
vi.mock("@/lib/migrations", () => ({ ensureMigration: async () => {} }));
vi.mock("@/lib/api-auth", () => ({
  requireRole: async () => ({ user: { role: "L and D" } }),
  requireSession: async () => ({ user: { role: "mentor" } }),
  apiAuthErrorResponse: () => null
}));

const { POST } = await import("@/app/api/demo-sessions/route");

const post = (body: any) =>
  POST(new Request("http://localhost/api/demo-sessions", { method: "POST", body: JSON.stringify(body) }) as any);

const book = (over: any = {}) =>
  post({
    action: "book",
    mentorId: "m1",
    mentorName: "Ravi",
    smeId: "sme1",
    smeName: "Sara",
    dateStr: "2026-10-28",
    timeSlot: "9:00-10:00",
    subject: "React",
    stream: "CSE",
    week: 5,
    ...over
  });

const reschedule = (over: any = {}) =>
  post({
    action: "reschedule",
    sessionId: "ds1",
    mentorId: "m1",
    newDateStr: "2026-11-03",
    newTimeSlot: "11:00-12:00",
    comments: "College event",
    ...over
  });

beforeEach(() => {
  h.batches.length = 0;
  h.singleReads.length = 0;
  h.writes.length = 0;
  h.writeParams.length = 0;
  h.txWrites.length = 0;
  h.ddl.length = 0;
  Object.assign(h.state, {
    leave: [],
    demoClash: [],
    smeClash: [],
    // 2026-10-28 is a Wednesday, 2026-11-03 a Tuesday
    smeWindows: [{ start_time: "9:00 AM", end_time: "4:00 PM" }],
    reservations: [],
    session: {
      id: "ds1", mentorId: "m1", mentorName: "Ravi", smeId: "sme1", smeName: "Sara",
      subject: "React", stream: "CSE", week: 5, dateStr: "2026-10-28", timeSlot: "9:00-10:00"
    },
    campusManagers: [{ id: "cam1" }, { id: "cam2" }, { id: "cam3" }],
    failOn: null
  });
});

describe("POST /api/demo-sessions action=book", () => {
  it("runs every gate from one batched read group", async () => {
    const res = await book();

    expect(res.status).toBe(200);
    expect(h.batches).toHaveLength(1);
    expect(h.batches[0]).toHaveLength(4);
    expect(h.batches[0].map(s => s.sql.includes("faculty_leave_requests") ? "leave"
      : s.sql.includes("demo_sessions") ? "clash"
      : s.sql.includes("sme_availability") ? "windows" : "reservation")).toEqual([
      "leave", "clash", "windows", "reservation"
    ]);
    expect(h.batches[0][0].params).toEqual(["m1", "2026-10-28", "2026-10-28"]);
    expect(h.batches[0][1].params).toEqual(["m1", "2026-10-28", "9:00-10:00"]);
    expect(h.batches[0][2].params).toEqual(["sme1", "Wednesday", "Day 3"]);
    expect(h.singleReads).toHaveLength(0);
    expect(h.writes).toHaveLength(2);
    expect(h.writes[0]).toContain("INSERT INTO demo_sessions");
    expect(h.writes[1]).toContain("INSERT INTO audit_logs");
  });

  it("refuses a leave day without touching the write path", async () => {
    h.state.leave = [{ id: "lv1", request_type: "casual" }];

    const res = await book();
    const body = await res.json();

    expect(body.message).toContain("approved casual on 2026-10-28");
    expect(h.writes).toHaveLength(0);
  });

  it("refuses a slot the mentor already holds", async () => {
    h.state.demoClash = [{ id: "ds9" }];

    const body = await (await book()).json();
    expect(body.message).toContain("already booked for this mentor");
    expect(h.writes).toHaveLength(0);
  });

  it("judges the SME window on the batched rows, with no second availability read", async () => {
    h.state.smeWindows = [{ start_time: "2:00 PM", end_time: "4:00 PM" }];

    const body = await (await book()).json();
    expect(body.message).toContain("do not cover 9:00-10:00");
    expect(h.singleReads).toHaveLength(0);
    expect(h.writes).toHaveLength(0);
  });

  it("refuses when no demo hours are declared for that weekday", async () => {
    h.state.smeWindows = [];

    const body = await (await book()).json();
    expect(body.message).toContain("no demo availability configured on Wednesday");
  });

  it("refuses a period held by a pending reallocation reservation", async () => {
    h.state.reservations = [{ id: "drr1" }];

    const body = await (await book()).json();
    expect(body.message).toContain("reserved for a pending demo reallocation");
    expect(h.writes).toHaveLength(0);
  });

  it("fails loudly instead of booking over an unchecked clash", async () => {
    h.state.failOn = "FROM demo_sessions";

    const res = await book();
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.success).toBe(false);
    expect(body.message).toContain("booking checks could not be completed");
    expect(h.writes).toHaveLength(0);
  });

  it("validates the payload before spending a round trip", async () => {
    const res = await book({ week: undefined });

    expect(res.status).toBe(400);
    expect(h.batches).toHaveLength(0);
    expect(h.singleReads).toHaveLength(0);
  });
});

describe("POST /api/demo-sessions action=reschedule", () => {
  it("reads the session once, then batches all four clash checks", async () => {
    const res = await reschedule();

    expect(res.status).toBe(200);
    expect(h.singleReads.filter(s => s.includes("FROM demo_sessions WHERE id = ?"))).toHaveLength(1);
    expect(h.batches.length).toBeGreaterThanOrEqual(1);
    expect(h.batches[0]).toHaveLength(6);
    expect(h.batches[0][0].params).toEqual(["m1", "2026-11-03", "2026-11-03"]);
    expect(h.batches[0][1].params).toEqual(["m1", "2026-11-03", "ds1", "11:00-12:00", "11:00-12:00", "11:00-12:00"]);
    expect(h.batches[0][3].params).toEqual(["sme1", "2026-11-03", "ds1", "11:00-12:00", "11:00-12:00", "11:00-12:00"]);
    expect(h.batches[0][5].params).toEqual(["ds1", "sme1", "2026-11-03", "11:00-12:00", "11:00-12:00", "11:00-12:00"]);
  });

  it("writes the reservation and the stale-request clear in one transaction", async () => {
    const res = await reschedule();

    expect(res.status).toBe(200);
    expect(h.txWrites).toHaveLength(3);
    expect(h.txWrites[0]).toContain("DELETE FROM demo_reallocation_requests");
    expect(h.txWrites[1]).toContain("INSERT INTO demo_reallocation_requests");
    expect(h.txWrites[2]).toContain("UPDATE demo_sessions SET status = 'reallocation_required'");
    expect(h.ddl).toHaveLength(0);
  });

  it("notifies every L&D viewer with a single multi-row insert", async () => {
    await reschedule();

    const notifWrites = h.writes.filter(w => w.includes("INSERT INTO notifications"));
    expect(notifWrites).toHaveLength(1);
    expect(notifWrites[0].split("), (")).toHaveLength(3);
    expect(h.writes.some(w => w.includes("INSERT INTO audit_logs"))).toBe(true);
  });

  it("checks ownership before spending any clash read", async () => {
    h.state.session = { ...h.state.session, mentorId: "m2" };

    const res = await reschedule();
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body.message).toContain("only reschedule your own");
    expect(h.batches).toHaveLength(0);
    expect(h.writes).toHaveLength(0);
  });

  it("refuses when the mentor already holds a demo in the target period", async () => {
    h.state.demoClash = [{ id: "ds6" }];

    const res = await reschedule();
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.message).toContain("You already have another demo session");
    expect(h.txWrites).toHaveLength(0);
  });

  it("refuses when the SME is already booked into the target period", async () => {
    h.state.smeClash = [{ id: "ds7" }];

    const res = await reschedule();
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.message).toContain("SME Sara already has another demo session");
    expect(h.txWrites).toHaveLength(0);
  });

  it("fails loudly when a clash slice errors instead of reserving an occupied period", async () => {
    h.state.failOn = "FROM demo_reallocation_requests";

    const res = await reschedule();
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.message).toContain("booking checks could not be completed");
    expect(h.txWrites).toHaveLength(0);
    expect(h.writes).toHaveLength(0);
  });
});

const wedWindows = () => [
  { sme_id: "sme1", day_of_week: "Wednesday", start_time: "9:00 AM", end_time: "11:00 PM" }
];

function sheetRows(count: number, over: any = {}) {
  return Array.from({ length: count }, (_, i) => ({
    mentorId: "m1",
    mentorName: "Ravi",
    smeId: "sme1",
    smeName: "Sara",
    dateStr: "2026-10-28",
    timeSlot: `${9 + i}:00-${10 + i}:00`,
    subject: "React",
    stream: "CSE",
    week: 5,
    ...over
  }));
}

describe("POST /api/demo-sessions action=bulk-book", () => {
  const bulk = (sessions: any[]) => post({ action: "bulk-book", sessions });

  it("gates a whole upload with three set-based reads and one insert", async () => {
    h.state.smeWindows = wedWindows();

    const res = await bulk(sheetRows(12));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.allocated).toBe(12);
    expect(body.skipped).toBe(0);
    expect(h.singleReads).toHaveLength(0);
    expect(h.batches).toHaveLength(1);
    expect(h.batches[0]).toHaveLength(3);
    expect(h.batches[0][0].sql).toContain("FROM faculty_leave_requests");
    expect(h.batches[0][0].params).toEqual(["m1", "2026-10-28", "2026-10-28"]);
    expect(h.batches[0][1].sql).toContain("FROM demo_sessions");
    expect(h.batches[0][1].params).toEqual(["m1", "2026-10-28"]);
    expect(h.batches[0][2].sql).toContain("FROM sme_availability");
    expect(h.batches[0][2].params).toEqual(["sme1", "WEDNESDAY"]);
    expect(h.writes.filter(w => w.includes("INSERT INTO demo_sessions"))).toHaveLength(1);
    expect(h.writeParams[0]).toHaveLength(12 * 12);
  });

  it("does not spend a round trip per row as the sheet grows", async () => {
    h.state.smeWindows = wedWindows();
    const many = sheetRows(120).map((r, i) => ({ ...r, mentorId: `m${i}`, timeSlot: "9:00-10:00" }));

    const small = await bulk(sheetRows(5));
    const big = await bulk(many);

    expect(h.singleReads).toHaveLength(0);
    expect((await small.json()).allocated).toBe(5);
    expect((await big.json()).allocated).toBe(120);
    // One read batch per upload, and inserts chunked at 100 rows.
    expect(h.batches).toHaveLength(2);
    expect(h.writes.filter(w => w.includes("INSERT INTO demo_sessions"))).toHaveLength(3);
  });

  it("skips rows already on the roster without a per-row clash read", async () => {
    h.state.smeWindows = wedWindows();
    h.state.demoClash = [{ mentorId: "m1", dateStr: "2026-10-28", timeSlot: "9:00-10:00" }];

    const body = await (await bulk(sheetRows(3))).json();

    expect(body.allocated).toBe(2);
    expect(body.skipped).toBe(1);
    expect(h.singleReads).toHaveLength(0);
  });

  it("dedupes the same mentor/date/slot listed twice in one upload", async () => {
    h.state.smeWindows = wedWindows();

    const body = await (await bulk(sheetRows(2, { timeSlot: "9:00-10:00" }))).json();

    expect(body.allocated).toBe(1);
    expect(body.skipped).toBe(1);
    expect(h.writeParams[0]).toHaveLength(12);
  });

  it("skips a mentor who is on approved leave that day", async () => {
    h.state.smeWindows = wedWindows();
    h.state.leave = [{ mentor_id: "m1", start_date: "2026-10-27", end_date: "2026-10-29" }];

    const body = await (await bulk(sheetRows(3))).json();

    expect(body.allocated).toBe(0);
    expect(body.skipped).toBe(3);
    expect(h.writes).toHaveLength(0);
  });

  it("keeps the SME demo-window gate on the bulk path", async () => {
    h.state.smeWindows = [{ sme_id: "sme1", day_of_week: "Wednesday", start_time: "2:00 PM", end_time: "4:00 PM" }];

    const body = await (await bulk(sheetRows(3))).json();

    expect(body.allocated).toBe(0);
    expect(body.skipped).toBe(3);
    expect(h.writes).toHaveLength(0);
  });

  it("skips a different SME whose windows were never declared", async () => {
    h.state.smeWindows = wedWindows();
    const rows = sheetRows(2);
    rows[1] = { ...rows[1], smeId: "sme2", timeSlot: "11:00-12:00" };

    const body = await (await bulk(rows)).json();

    expect(body.allocated).toBe(1);
    expect(body.skipped).toBe(1);
  });

  it("refuses to insert anything when a gate read fails", async () => {
    h.state.smeWindows = wedWindows();
    h.state.failOn = "FROM sme_availability";

    const res = await bulk(sheetRows(4));
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.message).toContain("booking checks could not be completed");
    expect(h.writes).toHaveLength(0);
  });

  it("counts malformed rows as skipped without a round trip", async () => {
    const body = await (await bulk([{ mentorId: "m1" }, { smeId: "sme1" }])).json();

    expect(body.allocated).toBe(0);
    expect(body.skipped).toBe(2);
    expect(h.batches).toHaveLength(0);
  });

  it("accepts an empty upload without touching the database", async () => {
    const body = await (await bulk([])).json();

    expect(body.allocated).toBe(0);
    expect(h.batches).toHaveLength(0);
    expect(h.writes).toHaveLength(0);
  });
});

describe("POST /api/demo-sessions action=swap", () => {
  const swap = () => post({ action: "swap", session1Id: "ds1", session2Id: "ds2" });

  it("reads both sessions in one batch and commits the pair atomically", async () => {
    const res = await swap();

    expect(res.status).toBe(200);
    expect(h.batches).toHaveLength(1);
    expect(h.batches[0]).toHaveLength(2);
    expect(h.singleReads).toHaveLength(0);
    expect(h.txWrites).toHaveLength(2);
    expect(h.txWrites[0]).toContain("UPDATE demo_sessions SET dateStr");
    expect(h.writes).toHaveLength(0);
  });

  it("fails loudly instead of reporting a swap when a read errors", async () => {
    h.state.failOn = "FROM demo_sessions WHERE id = ?";

    const res = await swap();
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.message).toContain("booking checks could not be completed");
    expect(h.txWrites).toHaveLength(0);
  });

  it("404s when one of the two sessions is missing", async () => {
    h.state.session = null;

    const res = await swap();

    expect(res.status).toBe(404);
    expect(h.txWrites).toHaveLength(0);
  });
});

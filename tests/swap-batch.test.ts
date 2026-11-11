import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => {
  const batches: { sql: string; params: any[] }[][] = [];
  const singleReads: string[] = [];
  const writes: string[] = [];

  const state = {
    mentors: [] as any[],
    slots: [] as any[],
    duplicates: [] as any[],
    available: true,
    failOn: null as string | null
  };

  const rowsFor = (sql: string, params: any[]): any[] => {
    if (sql.includes("FROM handover_requests")) return state.duplicates;
    if (sql.includes("FROM slots")) return state.slots;
    if (sql.includes("FROM mentors")) return state.mentors.filter(m => m.id === params[0]);
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
        return rowsFor(q.sql, q.params);
      });
    },
    get: async (sql: string) => {
      singleReads.push(sql);
      return null;
    },
    all: async (sql: string) => {
      singleReads.push(sql);
      return [];
    },
    run: async (sql: string) => {
      writes.push(sql);
      return { changes: 1 };
    },
    exec: async () => {}
  });

  return { batches, singleReads, writes, state, makeDb };
});

vi.mock("@/lib/db", async () => {
  const actual = await vi.importActual<typeof import("@/lib/db")>("@/lib/db");
  return { ...actual, getDb: async () => h.makeDb() };
});
vi.mock("@/lib/authGuard", () => ({
  requireAuth: async () => ({
    auth: { user: { role: "mentor", reference_id: "m1", email: "ravi@example.com" } },
    errorResponse: null
  })
}));
vi.mock("@/lib/availability", () => ({
  checkMentorAvailability: async () => ({ available: h.state.available, reason: "On approved leave" })
}));
vi.mock("@/lib/localDate", () => ({ getInstitutionDateStr: () => "2026-10-20" }));

const { POST } = await import("@/app/api/requests/swap/route");

const post = (over: any = {}) =>
  POST(new Request("http://localhost/api/requests/swap", {
    method: "POST",
    body: JSON.stringify({
      requestorId: "m1",
      offerSlotId: "s1",
      offerDateStr: "2026-10-25",
      offerDateFormatted: "Sun, 25 Oct 2026",
      targetStaffId: "m2",
      reason: "Compensating Friday",
      ...over
    })
  }) as any);

beforeEach(() => {
  h.batches.length = 0;
  h.singleReads.length = 0;
  h.writes.length = 0;
  Object.assign(h.state, {
    mentors: [
      { id: "m1", name: "Ravi", email: "ravi@example.com" },
      { id: "m2", name: "Sara", email: "sara@example.com" }
    ],
    slots: [{
      id: "s1", mentorId: "m2", course: "Math", day: "Monday",
      time: "9:00-10:00", shift: "morning", classGroup: "A"
    }],
    duplicates: [],
    available: true,
    failOn: null
  });
});

describe("POST /api/requests/swap", () => {
  it("verifies requestor, slot, target staff and the pending duplicate in one batched read", async () => {
    const res = await post();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(h.batches).toHaveLength(1);
    expect(h.batches[0]).toHaveLength(4);
    expect(h.batches[0][0].params).toEqual(["m1"]);
    expect(h.batches[0][1].params).toEqual(["s1"]);
    expect(h.batches[0][2].params).toEqual(["m2"]);
    expect(h.batches[0][3].params).toEqual(["m1", "s1", "2026-10-25", "m2"]);
    expect(h.singleReads).toHaveLength(0);
    expect(h.writes).toHaveLength(2);
    expect(h.writes[0]).toContain("INSERT INTO handover_requests");
    expect(h.writes[1]).toContain("INSERT INTO audit_logs");
  });

  it("refuses a duplicate offer without writing", async () => {
    h.state.duplicates = [{ id: "swap9" }];

    const res = await post();
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.message).toContain("already pending");
    expect(h.writes).toHaveLength(0);
  });

  it("refuses a slot that belongs to someone other than the named target", async () => {
    h.state.slots = [{ ...h.state.slots[0], mentorId: "m3" }];

    const res = await post();
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.message).toContain("belongs to the target faculty");
    expect(h.writes).toHaveLength(0);
  });

  it("refuses when the requestor is unavailable, before any write", async () => {
    h.state.available = false;

    const res = await post();
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.message).toContain("On approved leave");
    expect(h.writes).toHaveLength(0);
  });

  it("fails loudly instead of 404ing when the slot read errors", async () => {
    h.state.failOn = "FROM slots";

    const res = await post();
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.success).toBe(false);
    expect(body.message).toContain("Could not verify this swap offer");
    expect(h.writes).toHaveLength(0);
  });

  it("fails loudly instead of inserting a second offer when the duplicate probe errors", async () => {
    h.state.failOn = "FROM handover_requests";

    const res = await post();

    expect(res.status).toBe(500);
    expect((await res.json()).message).toContain("Could not verify this swap offer");
    expect(h.writes).toHaveLength(0);
  });

  it("validates the payload before spending a round trip", async () => {
    const res = await post({ targetStaffId: undefined });

    expect(res.status).toBe(400);
    expect(h.batches).toHaveLength(0);
  });
});

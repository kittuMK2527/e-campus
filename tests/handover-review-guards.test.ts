import { describe, it, expect, vi } from "vitest";

const mockState = {
  requests: [
    {
      id: "req_1",
      requestorId: "m_1",
      targetStaffId: "m_2",
      slotId: "slot_1",
      day: "Monday",
      time: "09:00 AM - 10:00 AM",
      dateStr: "2026-11-16",
      dateFormatted: "16 Nov 2026",
      course: "Data Structures",
      status: "pending_cm",
      college_id: "col_1"
    }
  ],
  mentors: [
    { id: "m_2", name: "Mentor Two", email: "m2@example.com" },
    { id: "m_busy", name: "Busy Mentor", email: "mbusy@example.com" }
  ],
  slots: [
    {
      id: "slot_busy",
      mentorId: "m_busy",
      day: "Monday",
      time: "09:00 AM - 10:00 AM",
      course: "Operating Systems"
    }
  ]
};

vi.mock("@/lib/db", () => ({
  getDb: async () => ({
    get: async (sql: string, params: any) => {
      const p = Array.isArray(params) ? params : [params];
      if (sql.includes("FROM handover_requests WHERE id = ?")) {
        return mockState.requests.find(r => r.id === p[0]) || null;
      }
      if (sql.includes("FROM slots WHERE id = ?")) {
        return mockState.slots.find(s => s.id === p[0]) || null;
      }
      if (sql.includes("FROM slots WHERE mentorId = ? AND day = ? AND time = ?")) {
        return mockState.slots.find(s => s.mentorId === p[0] && s.day === p[1] && s.time === p[2]) || null;
      }
      if (sql.includes("FROM approved_handovers WHERE id = ?")) {
        return { id: p[0], status: "approved" };
      }
      return null;
    },
    all: async (sql: string, params: any) => {
      const p = Array.isArray(params) ? params : [params];
      if (sql.includes("FROM slots WHERE mentorId = ? AND day = ?")) {
        return mockState.slots.filter(s => s.mentorId === p[0] && s.day === p[1]);
      }
      return [];
    },
    multiQuery: async (queries: any[]) => {
      return queries.map(q => {
        if (q.sql.includes("FROM handover_requests WHERE id = ?")) {
          const req = mockState.requests.find(r => r.id === q.params[0]);
          return req ? [req] : [];
        }
        if (q.sql.includes("FROM mentors WHERE id = ?")) {
          const m = mockState.mentors.find(men => men.id === q.params[0]);
          return m ? [m] : [];
        }
        return [];
      });
    },
    transaction: async (cb: any) => cb({
      run: async () => ({ changes: 1 }),
      get: async () => null
    }),
    run: async () => ({ changes: 1 })
  })
}));

let mockUser: any = {
  id: "user_mentor_1",
  reference_id: "m_1",
  role: "mentor",
  college_id: "col_1"
};

vi.mock("@/lib/authGuard", () => ({
  requireAuth: async () => ({
    auth: { user: mockUser },
    errorResponse: null
  })
}));

vi.mock("@/lib/realtimeServer", () => ({
  notifyRealtimeEvent: vi.fn()
}));

import { POST } from "../src/app/api/requests/review/route";

describe("BUG-07 & BUG-08: Handover review authorization and clash detection", () => {
  it("blocks mentors from performing cm_reassign (BUG-08)", async () => {
    mockUser = { id: "user_m1", reference_id: "m_1", role: "mentor" };
    const req = new Request("http://localhost/api/requests/review", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        requestId: "req_1",
        action: "cm_reassign",
        targetStaffId: "m_2"
      })
    });
    const res = await POST(req);
    const data = await res.json();
    expect(res.status).toBe(403);
    expect(data.message).toContain("Mentors cannot perform Campus Manager reassignments");
  });

  it("blocks CM from reassigning class to a mentor who is already teaching at that time (BUG-07)", async () => {
    mockUser = { id: "user_cm", reference_id: "cm_1", role: "cm", college_id: "col_1" };
    const req = new Request("http://localhost/api/requests/review", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        requestId: "req_1",
        action: "cm_reassign",
        targetStaffId: "m_busy"
      })
    });
    const res = await POST(req);
    const data = await res.json();
    expect(res.status).toBe(409);
    expect(data.message).toContain("already scheduled to teach");
  });

  it("blocks unrelated mentor from approving peer review", async () => {
    mockUser = { id: "user_m_stranger", reference_id: "m_stranger", role: "mentor" };
    const req = new Request("http://localhost/api/requests/review", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        requestId: "req_1",
        status: "approved"
      })
    });
    const res = await POST(req);
    const data = await res.json();
    expect(res.status).toBe(403);
    expect(data.message).toContain("Mentors can only review handovers addressed to them");
  });

  it("allows CM to reassign to an available mentor", async () => {
    mockUser = { id: "user_cm", reference_id: "cm_1", role: "cm", college_id: "col_1" };
    const req = new Request("http://localhost/api/requests/review", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        requestId: "req_1",
        action: "cm_reassign",
        targetStaffId: "m_2"
      })
    });
    const res = await POST(req);
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
  });
});


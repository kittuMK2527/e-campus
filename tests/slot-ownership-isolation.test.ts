import { describe, it, expect, vi } from "vitest";

const mockState = {
  slots: [
    {
      id: "slot_1",
      mentorId: "mentor_A",
      college_id: "college_alpha",
      day: "Monday",
      time: "09:00 AM - 10:00 AM",
      course: "CS101",
      classGroup: "Class A",
      location: "Room 1",
      shift: "general"
    },
    {
      id: "slot_2",
      mentorId: "mentor_B",
      college_id: "college_beta",
      day: "Monday",
      time: "10:00 AM - 11:00 AM",
      course: "CS102",
      classGroup: "Class B",
      location: "Room 2",
      shift: "general"
    }
  ]
};

vi.mock("@/lib/db", () => ({
  getDb: async () => ({
    get: async (sql: string, params: any) => {
      if (sql.includes("FROM slots WHERE id = ?")) {
        const id = Array.isArray(params) ? params[0] : params;
        return mockState.slots.find(s => s.id === id) || null;
      }
      return null;
    },
    all: async () => mockState.slots,
    multiQuery: async (queries: any[]) => {
      return queries.map(q => {
        if (q.sql.includes("FROM slots s LEFT JOIN mentors m ON s.mentorId = m.id WHERE s.id = ?")) {
          const id = q.params[0];
          const found = mockState.slots.find(s => s.id === id);
          return found ? [found] : [];
        }
        return [];
      });
    },
    transaction: async (cb: any) => cb({ run: async () => ({ changes: 1 }) }),
    run: async () => ({ changes: 1 })
  })
}));

let mockUser: any = {
  id: "user_mentor_A",
  reference_id: "mentor_A",
  role: "mentor",
  college_id: "college_alpha"
};

vi.mock("@/lib/authGuard", () => ({
  requireAuth: async () => ({
    auth: { user: mockUser },
    errorResponse: null
  })
}));

import { DELETE, PUT } from "../src/app/api/slots/route";

describe("BUG-04: slot cross-college and mentor ownership isolation", () => {
  it("blocks mentors from batch-deleting a classGroup timetable", async () => {
    mockUser = { id: "user_mentor_A", reference_id: "mentor_A", role: "mentor", college_id: "college_alpha" };
    const req = new Request("http://localhost/api/slots?classGroup=Class%20B&college_id=college_beta", { method: "DELETE" });
    const res = await DELETE(req);
    const data = await res.json();
    expect(res.status).toBe(403);
    expect(data.message).toContain("Mentors cannot clear entire class timetables");
  });

  it("blocks mentors from deleting another mentor's slot", async () => {
    mockUser = { id: "user_mentor_A", reference_id: "mentor_A", role: "mentor", college_id: "college_alpha" };
    const req = new Request("http://localhost/api/slots?id=slot_2", { method: "DELETE" });
    const res = await DELETE(req);
    const data = await res.json();
    expect(res.status).toBe(403);
    expect(data.message).toContain("You can only delete your own slots");
  });

  it("blocks mentors from editing another mentor's slot", async () => {
    mockUser = { id: "user_mentor_A", reference_id: "mentor_A", role: "mentor", college_id: "college_alpha" };
    const req = new Request("http://localhost/api/slots", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: "slot_2",
        mentorId: "mentor_B",
        day: "Tuesday",
        time: "10:00 AM - 11:00 AM",
        course: "CS102",
        location: "Room 2"
      })
    });
    const res = await PUT(req);
    const data = await res.json();
    expect(res.status).toBe(403);
    expect(data.message).toContain("You can only edit your own slots");
  });

  it("blocks CM from deleting slots belonging to another campus", async () => {
    mockUser = { id: "user_cm", reference_id: "cm_1", role: "cm", college_id: "college_alpha" };
    const req = new Request("http://localhost/api/slots?id=slot_2", { method: "DELETE" });
    const res = await DELETE(req);
    const data = await res.json();
    expect(res.status).toBe(403);
    expect(data.message).toContain("You can only delete slots for your assigned campus");
  });
});


import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockDb } = vi.hoisted(() => {
  const db = {
    exec: vi.fn().mockResolvedValue(undefined),
    get: vi.fn(),
    all: vi.fn(),
    run: vi.fn().mockResolvedValue({ changes: 1 }),
    transaction: vi.fn().mockImplementation(async (callback: any) => {
      return callback(db);
    }),
  };
  return { mockDb: db };
});

// Mock auth modules
vi.mock("@/lib/api-auth", () => ({
  requireSession: vi.fn().mockResolvedValue({ id: "u1", role: "admin", name: "Admin" }),
  requireRole: vi.fn().mockResolvedValue({ id: "u1", role: "admin", name: "Admin" }),
  apiAuthErrorResponse: vi.fn().mockReturnValue(null),
}));

vi.mock("@/lib/migrations", () => ({
  ensureMigration: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/notifications", () => ({
  dispatchSystemNotification: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/db", () => ({
  getDb: vi.fn().mockResolvedValue(mockDb),
}));

vi.mock("@/lib/availability", () => ({
  checkMentorAvailability: vi.fn().mockResolvedValue({ available: true }),
  checkSmeAvailability: vi.fn().mockImplementation(async (_db, params) => {
    if (params.smeId === "busy_sme") {
      return { available: false, reason: "Already booked for Demo at this time" };
    }
    return { available: true };
  }),
  loadAvailabilityContext: vi.fn().mockResolvedValue(null),
}));

import { GET, POST } from "@/app/api/demo-reallocations/route";

describe("L&D SME Reallocation and Swap API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("GET /api/demo-reallocations", () => {
    it("returns candidate SMEs with real-time availability and domain matching", async () => {
      mockDb.get.mockImplementation(async (sql: string, params: any[]) => {
        if (sql.includes("FROM demo_sessions WHERE id = ?")) {
          return {
            id: "demo1",
            mentorId: "m1",
            mentorName: "Prof. John",
            smeId: "sme1",
            smeName: "SME Alpha",
            subject: "Python Programming",
            dateStr: "2026-11-25",
            timeSlot: "Period 2 (09:25 - 10:20)",
            status: "reallocation_required"
          };
        }
        return null;
      });

      mockDb.all.mockImplementation(async (sql: string) => {
        if (sql.includes("FROM sme_users")) {
          return [
            { id: "sme1", name: "SME Alpha", email: "alpha@example.com", subject: "Python Programming" },
            { id: "sme2", name: "SME Beta", email: "beta@example.com", subject: "Python & Data Science" },
            { id: "busy_sme", name: "SME Gamma", email: "gamma@example.com", subject: "Java" },
          ];
        }
        if (sql.includes("FROM sme_availability")) {
          return [
            { sme_id: "sme1", day_of_week: "Wednesday", start_time: "08:00 AM", end_time: "05:00 PM", slot_type: "demo" },
            { sme_id: "sme2", day_of_week: "Wednesday", start_time: "08:00 AM", end_time: "05:00 PM", slot_type: "demo" },
            { sme_id: "busy_sme", day_of_week: "Wednesday", start_time: "08:00 AM", end_time: "05:00 PM", slot_type: "demo" },
          ];
        }
        if (sql.includes("GROUP BY smeId")) {
          return [{ smeId: "sme2", count: 2 }];
        }
        return [];
      });

      const request = new Request("http://localhost:3000/api/demo-reallocations?candidateSmesForDemoId=demo1");
      const res = await GET(request);
      const data = await res.json();

      expect(data.success).toBe(true);
      expect(data.demo.id).toBe("demo1");
      expect(data.candidates).toHaveLength(3);

      const beta = data.candidates.find((c: any) => c.id === "sme2");
      expect(beta).toBeDefined();
      expect(beta.available).toBe(true);
      expect(beta.subjectMatch).toBe(true);
      expect(beta.demoCount).toBe(2);

      const gamma = data.candidates.find((c: any) => c.id === "busy_sme");
      expect(gamma).toBeDefined();
      expect(gamma.available).toBe(false);
      expect(gamma.reason).toContain("Already booked");
    });

    it("evaluates live candidate sessions for SME demo swap", async () => {
      mockDb.get.mockImplementation(async (sql: string) => {
        if (sql.includes("FROM demo_sessions") && sql.includes("WHERE id = ?")) {
          return {
            id: "demo1",
            mentorId: "m1",
            mentorName: "Prof. John",
            smeId: "sme1",
            smeName: "SME Alpha",
            subject: "Python Programming",
            dateStr: "2026-11-25",
            timeSlot: "Period 2 (09:25 - 10:20)",
          };
        }
        return null;
      });

      mockDb.all.mockImplementation(async (sql: string) => {
        if (sql.includes("FROM demo_sessions") && sql.includes("id !=")) {
          return [
            {
              id: "demo2",
              mentorId: "m2",
              mentorName: "Prof. Smith",
              smeId: "sme2",
              smeName: "SME Beta",
              subject: "Web Development",
              dateStr: "2026-11-26",
              timeSlot: "Period 3 (10:40 - 11:35)"
            }
          ];
        }
        return [];
      });

      const request = new Request("http://localhost:3000/api/demo-reallocations?candidateSwapSessionsForDemoId=demo1");
      const res = await GET(request);
      const data = await res.json();

      expect(data.success).toBe(true);
      expect(data.swapCandidates).toHaveLength(1);
      expect(data.swapCandidates[0].id).toBe("demo2");
      expect(data.swapCandidates[0].compatible).toBe(true);
    });

    it("checks real-time period availability for a single SME", async () => {
      mockDb.all.mockResolvedValue([
        { sme_id: "sme1", day_of_week: "Wednesday", start_time: "08:00 AM", end_time: "05:00 PM", slot_type: "demo" }
      ]);

      const req = new Request("http://localhost:3000/api/demo-reallocations?checkSmePeriod=true&smeId=sme1&dateStr=2026-11-25&timeSlot=Period%202%20(09:25%20-%2010:20)");
      const res = await GET(req);
      const data = await res.json();

      expect(data.success).toBe(true);
      expect(data.available).toBe(true);
    });
  });

  describe("POST /api/demo-reallocations", () => {
    it("reallocates SME to session, updating demo_sessions and logging reason", async () => {
      mockDb.get.mockImplementation(async (sql: string, params: any[]) => {
        if (sql.includes("FROM demo_sessions WHERE id = ?")) {
          return {
            id: "demo1",
            mentorId: "m1",
            mentorName: "Prof. John",
            smeId: "sme1",
            smeName: "SME Alpha",
            subject: "Python Programming",
            dateStr: "2026-11-25",
            timeSlot: "Period 2 (09:25 - 10:20)",
            status: "reallocation_required"
          };
        }
        if (sql.includes("FROM sme_users WHERE id = ?")) {
          return { id: "sme2", name: "SME Beta", email: "beta@example.com" };
        }
        return null;
      });

      mockDb.all.mockResolvedValue([
        { sme_id: "sme2", day_of_week: "Wednesday", start_time: "08:00 AM", end_time: "05:00 PM", slot_type: "demo" }
      ]);

      const req = new Request("http://localhost:3000/api/demo-reallocations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "reallocate_sme",
          demoSessionId: "demo1",
          targetSmeId: "sme2",
          reason: "Faculty Leave / Reschedule",
          notes: "Reallocated to SME Beta for Python session",
          decidedBy: "L&D Admin"
        })
      });

      const res = await POST(req);
      const data = await res.json();

      expect(data.success).toBe(true);
      expect(data.message).toContain("SME Beta");

      // Verify update demo_sessions was called
      expect(mockDb.run).toHaveBeenCalledWith(
        expect.stringContaining("UPDATE demo_sessions"),
        expect.arrayContaining(["sme2", "SME Beta", "demo1"])
      );

      // Verify reallocation request was recorded with reason
      expect(mockDb.run).toHaveBeenCalledWith(
        expect.stringContaining("INSERT INTO demo_reallocation_requests"),
        expect.arrayContaining(["Faculty Leave / Reschedule", "L&D Admin"])
      );

      // Verify audit log
      expect(mockDb.run).toHaveBeenCalledWith(
        expect.stringContaining("demo_sme_reallocated"),
        expect.arrayContaining(["L&D Admin"])
      );
    });

    it("swaps SMEs between two demo sessions", async () => {
      mockDb.get.mockImplementation(async (sql: string, params: any[]) => {
        if (sql.includes("FROM demo_sessions WHERE id = ?")) {
          if (params[0] === "demoA") {
            return {
              id: "demoA",
              mentorId: "m1",
              mentorName: "Prof. John",
              smeId: "smeA",
              smeName: "SME Alpha",
              subject: "Python Programming",
              dateStr: "2026-11-25",
              timeSlot: "Period 2"
            };
          }
          if (params[0] === "demoB") {
            return {
              id: "demoB",
              mentorId: "m2",
              mentorName: "Prof. Smith",
              smeId: "smeB",
              smeName: "SME Beta",
              subject: "Web Development",
              dateStr: "2026-11-26",
              timeSlot: "Period 3"
            };
          }
        }
        if (sql.includes("FROM sme_users WHERE id = ?")) {
          if (params[0] === "smeA") return { id: "smeA", name: "SME Alpha", email: "alpha@example.com" };
          if (params[0] === "smeB") return { id: "smeB", name: "SME Beta", email: "beta@example.com" };
        }
        return null;
      });

      const req = new Request("http://localhost:3000/api/demo-reallocations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "swap_sme_sessions",
          sessionAId: "demoA",
          sessionBId: "demoB",
          reason: "Timetable Conflict",
          notes: "Swapped evaluators between sessions",
          decidedBy: "L&D Coordinator"
        })
      });

      const res = await POST(req);
      const data = await res.json();

      expect(data.success).toBe(true);
      expect(data.message).toContain("SME Alpha ↔ SME Beta");

      // Verify demoA gets smeB
      expect(mockDb.run).toHaveBeenCalledWith(
        expect.stringContaining("UPDATE demo_sessions SET smeId = ?, smeName = ?"),
        expect.arrayContaining(["smeB", "SME Beta", "demoA"])
      );

      // Verify demoB gets smeA
      expect(mockDb.run).toHaveBeenCalledWith(
        expect.stringContaining("UPDATE demo_sessions SET smeId = ?, smeName = ?"),
        expect.arrayContaining(["smeA", "SME Alpha", "demoB"])
      );
    });
  });
});

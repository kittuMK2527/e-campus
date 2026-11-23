import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => {
  const reads: string[] = [];
  const writes: { sql: string; params: any[] }[] = [];

  const colleges = [
    { id: "c1", name: "Alpha College", kam_id: "kam_north" },
    { id: "c2", name: "Beta College", kam_id: "kam_north" },
    { id: "c3", name: "Gamma College", kam_id: "kam_south" }
  ];

  const interviews = [
    {
      id: "int_ext_1",
      type: "external",
      subject: "Data Structures",
      class_group: "CSE-A",
      target_date: "2026-11-30",
      preferred_start_time: "09:00 AM",
      student_count: 10,
      origin_college_id: "c1",
      college_id: "c1",
      status: "pending_cm_acceptance",
      mentor_id: "m1",
      mentor_name: "Mentor A",
      created_at: "2026-11-20T10:00:00Z"
    },
    {
      id: "int_ext_broadcast_ready",
      type: "external",
      subject: "Algorithms",
      class_group: "CSE-A",
      target_date: "2026-11-30",
      preferred_start_time: "09:00 AM",
      student_count: 10,
      origin_college_id: "c1",
      college_id: "c1",
      status: "pending_origin_cm",
      mentor_id: "m1",
      mentor_name: "Mentor A",
      created_at: "2026-11-20T10:00:00Z"
    },
    {
      id: "int_ext_south",
      type: "external",
      subject: "Cloud Architecture",
      class_group: "IT-B",
      target_date: "2026-11-30",
      preferred_start_time: "10:00 AM",
      student_count: 10,
      origin_college_id: "c3",
      college_id: "c3",
      status: "pending_cm_acceptance",
      mentor_id: "m3",
      mentor_name: "Mentor C",
      created_at: "2026-11-20T10:00:00Z"
    }
  ];

  const camUsers = [
    { id: "cam_1", name: "Manager Alpha", email: "cm1@example.com", college_id: "c1" },
    { id: "cam_2", name: "Manager Beta", email: "cm2@example.com", college_id: "c2" },
    { id: "cam_3", name: "Manager Gamma", email: "cm3@example.com", college_id: "c3" }
  ];

  const kamUsers = [
    { id: "kam_north", name: "North KAM", email: "kam_north@faceprep.in" },
    { id: "kam_south", name: "South KAM", email: "kam_south@faceprep.in" }
  ];

  function makeDb() {
    return {
      get: async (sql: string, params: any[] = []) => {
        reads.push(sql);
        if (sql.includes("FROM colleges WHERE id =")) {
          return colleges.find(c => c.id === params[0]) || null;
        }
        if (sql.includes("FROM kam_users WHERE id =")) {
          return kamUsers.find(k => k.id === params[0] || k.email === params[1]) || null;
        }
        if (sql.includes("FROM student_interviews WHERE id =")) {
          return interviews.find(i => i.id === params[0]) || null;
        }
        return null;
      },
      all: async (sql: string, params: any[] = []) => {
        reads.push(sql);
        if (sql.includes("FROM student_interviews")) {
          let result = [...interviews];
          if (params.includes("c2")) {
            // c2 is in kam_north; sees c1's external interview, but NOT c3's (kam_south)
            result = result.filter(i => {
              if (i.college_id === "c2" || i.origin_college_id === "c2") return true;
              const orig = colleges.find(c => c.id === (i.origin_college_id || i.college_id));
              return orig?.kam_id === "kam_north";
            });
          } else if (params.includes("c3")) {
            // c3 is in kam_south; only sees c3's interview, NOT c1's (kam_north)
            result = result.filter(i => {
              if (i.college_id === "c3" || i.origin_college_id === "c3") return true;
              const orig = colleges.find(c => c.id === (i.origin_college_id || i.college_id));
              return orig?.kam_id === "kam_south";
            });
          } else if (params.includes("kam_north")) {
            result = result.filter(i => {
              const orig = colleges.find(c => c.id === (i.origin_college_id || i.college_id));
              return orig?.kam_id === "kam_north";
            });
          }
          return result;
        }
        if (sql.includes("FROM colleges WHERE kam_id = ? AND id !=")) {
          return colleges.filter(c => c.kam_id === params[0] && c.id !== params[1]);
        }
        if (sql.includes("FROM colleges WHERE kam_id =")) {
          return colleges.filter(c => c.kam_id === params[0]);
        }
        if (sql.includes("FROM cam_capacity_responses")) return [];
        if (sql.includes("FROM interview_allocations")) return [];
        if (sql.includes("FROM student_interview_slots")) return [];
        if (sql.includes("FROM interview_evaluations")) return [];
        return [];
      },
      run: async (sql: string, ...args: any[]) => {
        writes.push({ sql, params: args });
        return { changes: 1 };
      },
      multiQuery: async (queries: { sql: string; params?: any[] }[]) => {
        reads.push(...queries.map(q => q.sql));
        return queries.map(q => {
          if (q.sql.includes("FROM student_interviews")) {
            const intId = q.params?.[0];
            const found = interviews.find(i => i.id === intId) || interviews[0];
            return [found];
          }
          if (q.sql.includes("FROM colleges")) {
            const colId = q.params?.[0];
            const found = colleges.find(c => c.id === colId);
            return found ? [found] : [];
          }
          if (q.sql.includes("FROM cam_capacity_responses")) return [];
          if (q.sql.includes("FROM campus_managers")) return camUsers.filter(u => q.params?.includes(u.college_id));
          return [];
        });
      },
      transaction: async (fn: any) => fn(makeDb())
    };
  }

  return { reads, writes, colleges, interviews, camUsers, kamUsers, makeDb };
});

vi.mock("@/lib/db", () => ({
  getDb: async () => h.makeDb(),
  readInChunks: async () => [],
  chunkList: (arr: any[], size: number) => [arr]
}));

let authedUser: any = null;
vi.mock("@/lib/authGuard", () => ({
  requireAuth: async () => {
    if (!authedUser) {
      return { errorResponse: new Response(JSON.stringify({ success: false }), { status: 401 }) };
    }
    return { auth: { user: authedUser }, errorResponse: null };
  }
}));

vi.mock("@/lib/interview-notifications", () => ({
  notifyExternalInterviewsAfterResponse: vi.fn()
}));

import { GET as getInterviews } from "@/app/api/interviews/route";
import { POST as broadcastCapacity } from "@/app/api/interviews/capacity-request/route";
import { POST as respondCapacity } from "@/app/api/interviews/cm-capacity-response/route";

describe("External interview KAM scoping", () => {
  beforeEach(() => {
    h.reads.length = 0;
    h.writes.length = 0;
  });

  it("CM under same KAM zone can see external interview once broadcast", async () => {
    authedUser = { role: "cm", college_id: "c2", reference_id: "cam_2" };
    const req = new Request("http://localhost:3000/api/interviews?role=cm&collegeId=c2");
    const res = await getInterviews(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    // Should see c1's external interview because c1 and c2 share kam_north
    const ids = data.interviews.map((i: any) => i.id);
    expect(ids).toContain("int_ext_1");
    // Should NOT see c3's external interview because c3 is in kam_south
    expect(ids).not.toContain("int_ext_south");
  });

  it("CM in a different KAM zone CANNOT see external interview from another KAM", async () => {
    authedUser = { role: "cm", college_id: "c3", reference_id: "cam_3" };
    const req = new Request("http://localhost:3000/api/interviews?role=cm&collegeId=c3");
    const res = await getInterviews(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    const ids = data.interviews.map((i: any) => i.id);
    // c3 is in kam_south; should NOT see int_ext_1 (kam_north)
    expect(ids).not.toContain("int_ext_1");
    // Should see its own campus interview
    expect(ids).toContain("int_ext_south");
  });

  it("KAM only sees external interviews belonging to colleges in their portfolio", async () => {
    authedUser = { role: "kam", reference_id: "kam_north", email: "kam_north@faceprep.in" };
    const req = new Request("http://localhost:3000/api/interviews?role=kam");
    const res = await getInterviews(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    const ids = data.interviews.map((i: any) => i.id);
    expect(ids).toContain("int_ext_1");
    expect(ids).not.toContain("int_ext_south");
  });

  it("capacity-request only broadcasts to colleges strictly under the same KAM zone", async () => {
    authedUser = { role: "cm", college_id: "c1", reference_id: "cam_1" };
    // Origin college c1 has kam_north with partner c2.
    // Broadcast must target c2 only, never c3 (kam_south).
    const req = new Request("http://localhost:3000/api/interviews/capacity-request", {
      method: "POST",
      body: JSON.stringify({ interview_id: "int_ext_ready" })
    });
    // Add interview_ready to mock data if needed
    h.interviews.push({
      id: "int_ext_ready",
      type: "external",
      subject: "System Design",
      class_group: "CSE-A",
      target_date: "2026-11-30",
      preferred_start_time: "09:00 AM",
      student_count: 10,
      origin_college_id: "c1",
      college_id: "c1",
      status: "pending_origin_cm",
      mentor_id: "m1",
      mentor_name: "Mentor A",
      created_at: "2026-11-20T10:00:00Z"
    });

    const res = await broadcastCapacity(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.message).toContain("1 regional college CMs");
    // Verify writes targeted c2, never c3
    const capInserts = h.writes.filter(w => w.sql.includes("INTO cam_capacity_responses"));
    expect(capInserts.length).toBeGreaterThan(0);
    const insertedCollegeIds = capInserts.map(w => w.params[0]?.[2] || w.params[2]);
    expect(insertedCollegeIds).toContain("c2");
    expect(insertedCollegeIds).not.toContain("c3");
  });

  it("cm-capacity-response refuses acceptance from a campus belonging to a different KAM zone", async () => {
    authedUser = { role: "cm", college_id: "c3", reference_id: "cam_3" };
    // c3 is kam_south, interview int_ext_1 is kam_north
    const req = new Request("http://localhost:3000/api/interviews/cm-capacity-response", {
      method: "POST",
      body: JSON.stringify({
        interview_id: "int_ext_1",
        college_id: "c3",
        accepted_student_capacity: 5
      })
    });
    const res = await respondCapacity(req);
    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.success).toBe(false);
    expect(data.message).toContain("KAM zone");
  });
});

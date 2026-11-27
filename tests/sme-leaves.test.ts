import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  validateLeaveDateRange,
  collectSmeScopeTags,
  resolveMentorsUnderSme,
  buildSmeLeaveNotification,
  smeOnLeaveOnDate
} from "../src/lib/smeLeaves";

describe("smeLeaves scoping and validation helpers", () => {
  it("validates YYYY-MM-DD calendar date ranges strictly", () => {
    expect(validateLeaveDateRange("2026-11-26", "2026-11-26")).toEqual({
      valid: true,
      startDate: "2026-11-26",
      endDate: "2026-11-26"
    });
    expect(validateLeaveDateRange("2026-11-26").valid).toBe(true);
    expect(validateLeaveDateRange("2026-11-28", "2026-11-26").valid).toBe(false);
    expect(validateLeaveDateRange("2026-02-30").valid).toBe(false);
    expect(validateLeaveDateRange("bad-date").valid).toBe(false);
  });

  it("ignores generic placeholders like General when collecting SME scope tags", () => {
    const tags = collectSmeScopeTags(
      { id: "sme_1", subject: "Python, SQL", department: "General", mentor_group: "N/A", head_subject_group: "" },
      [{ id: "sg_1", name: "Core Python", lead_sme_id: "sme_1" }, { id: "sg_2", name: "Java", lead_sme_id: "sme_2" }]
    );
    expect(tags).toEqual(["core python", "python", "sql"]);
  });

  it("notifies ONLY active mentors under the specific SME (group/subject/scheduled demos) without leaking to other SMEs", () => {
    const smePython = { id: "sme_py", name: "Anita", subject: "Python", head_subject_group: "Python Track" };
    const smeJava = { id: "sme_java", name: "Raj", subject: "Java", head_subject_group: "Java Track" };

    const subjectGroups = [
      { id: "sg1", name: "Python Track", lead_sme_id: "sme_py" },
      { id: "sg2", name: "Java Track", lead_sme_id: "sme_java" }
    ];

    const mentors = [
      { id: "m_py1", name: "Aarav", subject_group: "Python Track", status: "Active" },
      { id: "m_py2", name: "Bala", subjects: "C, Python", status: "Active" },
      { id: "m_inactive", name: "Old Mentor", subject_group: "Python Track", status: "Inactive" },
      { id: "m_java1", name: "Deepa", subject_group: "Java Track", subjects: "Java, JavaScript", status: "Active" },
      { id: "m_js", name: "Kiran", subjects: "JavaScript", status: "Active" },
      { id: "m_demo_only", name: "Priya", subject_group: "Aptitude", status: "Active" }
    ];

    const demoSessions = [
      { id: "ds1", mentorId: "m_demo_only", mentorName: "Priya", smeId: "sme_py", dateStr: "2026-11-26", status: "confirmed" },
      { id: "ds2", mentorId: "m_java1", mentorName: "Deepa", smeId: "sme_java", dateStr: "2026-11-26", status: "confirmed" },
      // Completed session should not count as an upcoming demo trigger
      { id: "ds3", mentorId: "m_js", mentorName: "Kiran", smeId: "sme_py", dateStr: "2026-11-26", status: "completed" }
    ];

    const pyResult = resolveMentorsUnderSme({
      sme: smePython,
      mentors,
      subjectGroups,
      demoSessions,
      startDate: "2026-11-26",
      endDate: "2026-11-26"
    });
    expect(pyResult.mentors.map(m => m.id)).toEqual(["m_py1", "m_py2", "m_demo_only"]);

    // Verify Java SME never leaks to JavaScript-only mentor m_js or Python mentors
    const javaResult = resolveMentorsUnderSme({
      sme: smeJava,
      mentors,
      subjectGroups,
      demoSessions,
      startDate: "2026-11-26",
      endDate: "2026-11-26"
    });
    expect(javaResult.mentors.map(m => m.id)).toEqual(["m_java1"]);
  });

  it("checks smeOnLeaveOnDate across inclusive date ranges", () => {
    const leaves = [
      { id: "lv1", sme_id: "sme_py", start_date: "2026-11-26", end_date: "2026-11-28", status: "approved" },
      { id: "lv2", sme_id: "sme_py", start_date: "2026-11-20", end_date: "2026-11-20", status: "cancelled" }
    ];
    expect(smeOnLeaveOnDate(leaves, "sme_py", "2026-11-27")?.id).toBe("lv1");
    expect(smeOnLeaveOnDate(leaves, "sme_py", "2026-11-20")).toBeNull();
    expect(smeOnLeaveOnDate(leaves, "sme_java", "2026-11-27")).toBeNull();
  });

  it("builds mentor-targeted alert message and deep-link to /mentor/lnd", () => {
    const notif = buildSmeLeaveNotification({
      smeName: "Anita",
      smeSubject: "Python",
      startDate: "2026-11-26",
      endDate: "2026-11-26",
      leaveType: "Sick Leave",
      reason: "Fever"
    });
    expect(notif.link).toBe("/mentor/lnd");
    expect(notif.title).toContain("Anita");
    expect(notif.message).toContain("Python");
    expect(notif.message).toContain("Sick Leave");
    expect(notif.message).toContain("Fever");
  });
});

const routeStubs = vi.hoisted(() => {
  const insertedLeaves: any[] = [];
  const dispatchedCalls: any[] = [];
  const state = {
    role: "sme",
    user: { id: "u_sme1", reference_id: "sme_py", email: "anita@fp.edu", name: "Anita", role: "sme" },
    overlap: null as any,
    smeRow: { id: "sme_py", name: "Anita", email: "anita@fp.edu", subject: "Python", head_subject_group: "Python Track" },
    mentors: [
      { id: "m_py1", name: "Aarav", subject_group: "Python Track", status: "Active" },
      { id: "m_other", name: "Rajesh", subject_group: "Java Track", status: "Active" }
    ],
    subjectGroups: [{ id: "sg1", name: "Python Track", lead_sme_id: "sme_py" }],
    demoSessions: [],
    leaveById: null as any
  };

  return {
    insertedLeaves,
    dispatchedCalls,
    state,
    makeDb: () => ({
      get: async (sql: string) => {
        if (sql.includes("FROM sme_users")) return state.smeRow;
        if (sql.includes("AND status = 'approved' AND start_date <= ?")) return state.overlap;
        if (sql.includes("FROM sme_leaves WHERE id = ?")) return state.leaveById || insertedLeaves[0] || null;
        return null;
      },
      all: async (sql: string) => {
        if (sql.includes("FROM sme_leaves")) return insertedLeaves;
        return [];
      },
      multiQuery: async (queries: { sql: string }[]) =>
        queries.map((q) => {
          if (q.sql.includes("FROM subject_groups")) return state.subjectGroups;
          if (q.sql.includes("FROM mentors")) return state.mentors;
          if (q.sql.includes("FROM demo_sessions")) return state.demoSessions;
          return [];
        }),
      run: async (sql: string, params: any[]) => {
        if (sql.includes("INSERT INTO sme_leaves")) {
          insertedLeaves.push({
            id: params[0],
            sme_id: params[1],
            sme_name: params[2],
            leave_type: params[3],
            start_date: params[4],
            end_date: params[5],
            reason: params[6],
            status: "approved",
            notified_mentor_count: params[7]
          });
        }
        return { changes: 1 };
      }
    })
  };
});

vi.mock("@/lib/db", async () => {
  const actual = await vi.importActual<typeof import("@/lib/db")>("@/lib/db");
  return { ...actual, getDb: async () => routeStubs.makeDb() };
});
vi.mock("@/lib/migrations", () => ({ ensureMigration: async () => {} }));
vi.mock("@/lib/authGuard", async () => {
  const actual = await vi.importActual<typeof import("@/lib/authGuard")>("@/lib/authGuard");
  return {
    ...actual,
    requireAuth: async () => ({ auth: { user: routeStubs.state.user }, errorResponse: null })
  };
});
vi.mock("@/lib/notifications", () => ({
  dispatchSystemNotification: async (_db: any, opts: any) => {
    routeStubs.dispatchedCalls.push(opts);
    return {
      success: true,
      count: opts.userIds?.length || 0,
      notificationIds: (opts.userIds || []).map((id: string) => `n_${id}`),
      recipientUserIds: opts.userIds || []
    };
  }
}));

const { POST, GET, DELETE } = await import("../src/app/api/sme-leaves/route");

describe("/api/sme-leaves API route", () => {
  beforeEach(() => {
    routeStubs.insertedLeaves.length = 0;
    routeStubs.dispatchedCalls.length = 0;
    routeStubs.state.overlap = null;
    routeStubs.state.leaveById = null;
    routeStubs.state.user = { id: "u_sme1", reference_id: "sme_py", email: "anita@fp.edu", name: "Anita", role: "sme" };
  });

  it("marks today as leave and notifies ONLY mentors under that particular SME", async () => {
    const res = await POST(
      new Request("http://localhost/api/sme-leaves", {
        method: "POST",
        body: JSON.stringify({
          startDate: "2026-11-26",
          endDate: "2026-11-26",
          leaveType: "Personal Leave",
          reason: "Family event"
        })
      })
    );
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.notifiedCount).toBe(1);
    expect(data.matchedMentors.map((m: any) => m.id)).toEqual(["m_py1"]);
    expect(routeStubs.dispatchedCalls).toHaveLength(1);
    expect(routeStubs.dispatchedCalls[0].userIds).toEqual(["m_py1"]);
    expect(routeStubs.dispatchedCalls[0].link).toBe("/mentor/lnd");
  });

  it("rejects duplicate overlapping active leave with 409 without double-notifying", async () => {
    routeStubs.state.overlap = { id: "lv_prev", start_date: "2026-11-26", end_date: "2026-11-26" };
    const res = await POST(
      new Request("http://localhost/api/sme-leaves", {
        method: "POST",
        body: JSON.stringify({ startDate: "2026-11-26" })
      })
    );
    const data = await res.json();
    expect(res.status).toBe(409);
    expect(data.success).toBe(false);
    expect(routeStubs.dispatchedCalls).toHaveLength(0);
  });

  it("forbids one SME from cancelling another SME's leave", async () => {
    routeStubs.state.leaveById = {
      id: "lv_other",
      sme_id: "sme_other",
      sme_name: "Other SME",
      start_date: "2026-11-26",
      end_date: "2026-11-26",
      status: "approved"
    };
    const res = await DELETE(new Request("http://localhost/api/sme-leaves?id=lv_other", { method: "DELETE" }));
    expect(res.status).toBe(403);
  });

  it("returns caller SME leaves on GET", async () => {
    routeStubs.insertedLeaves.push({ id: "lv1", sme_id: "sme_py", start_date: "2026-11-26", status: "approved" });
    const res = await GET(new Request("http://localhost/api/sme-leaves"));
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.leaves).toHaveLength(1);
  });
});

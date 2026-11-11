import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => {
  const queries: { sql: string; params: any[] }[] = [];
  const sent: { to: string; subject: string }[] = [];
  const known: string[] = ["asha@example.com", "bala@example.com", "chitra@example.com"];

  return {
    queries,
    sent,
    known,
    makeDb() {
      return {
        all: async (sql: string, ...args: any[]) => {
          const params = args.length === 1 && Array.isArray(args[0]) ? args[0] : args;
          queries.push({ sql, params });
          return params.filter((p: any) => known.includes(p)).map((email: string) => ({ email }));
        },
        get: async () => null,
        run: async () => ({ changes: 0 })
      };
    }
  };
});

vi.mock("@/lib/db", () => ({ getDb: async () => h.makeDb() }));

vi.mock("@/lib/api-auth", () => ({
  requireRole: async () => ({ user: { role: "cm" } }),
  apiAuthErrorResponse: () => null
}));

vi.mock("@/lib/mail", () => {
  const render = (arg: any) => (typeof arg === "string" ? arg : "<div>rendered</div>");
  return {
    sendMail: async (opts: any) => { h.sent.push({ to: opts.to, subject: opts.subject }); return { success: true }; },
    renderEmailShell: render,
    renderMissedAttendanceEmail: render,
    renderHandoverRequestEmail: render,
    renderHandoverApprovalEmail: render,
    renderHandoverRejectionEmail: render,
    renderSwapOfferEmail: render,
    renderSmeEvaluationEmail: render,
    renderTimetableUpdateEmail: render,
    renderAnnouncementEmail: render,
    renderSmeDailyReportEmail: render,
    renderSmeWeeklyDigestEmail: render,
    monthly_skill_report: render,
    renderMonthlySkillReportEmail: render
  };
});

const { POST } = await import("@/app/api/send-mail/route");

async function send(body: any) {
  const request = new Request("http://localhost/api/send-mail", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  return (await POST(request as any)).json();
}

const payload = (to: string) => ({ to, subject: "Timetable change", template: "announcement", data: { title: "Hi" } });

describe("send-mail recipient allowlist", () => {
  beforeEach(() => {
    h.queries.length = 0;
    h.sent.length = 0;
  });

  it("binds one parameter per UNION arm so the lookup can actually execute", async () => {
    const json = await send(payload("asha@example.com, bala@example.com, chitra@example.com"));

    expect(json.success).toBe(true);
    expect(h.queries).toHaveLength(1);
    const { sql, params } = h.queries[0];
    const placeholders = (sql.match(/\?/g) || []).length;
    // 3 addresses × 6 tables. The previous n*n shape only matched when n === 6.
    expect(placeholders).toBe(18);
    expect(params).toHaveLength(18);
    expect(h.sent).toEqual([{ to: "asha@example.com, bala@example.com, chitra@example.com", subject: "Timetable change" }]);
  });

  it("refuses to relay to an address that is not a known portal user", async () => {
    const json = await send(payload("asha@example.com, stranger@example.com"));

    expect(json.success).toBe(false);
    expect(json.message).toContain("stranger@example.com");
    expect(h.sent).toHaveLength(0);
  });

  it("keeps the template-only and recipient-count guards", async () => {
    const raw = await send({ to: "asha@example.com", subject: "s", htmlBody: "<script></script>" });
    expect(raw.success).toBe(false);

    const tooMany = await send(payload(new Array(11).fill("asha@example.com").join(", ")));
    expect(tooMany.message).toBe("Provide 1–10 recipient addresses.");

    const unknownTemplate = await send({ to: "asha@example.com", subject: "s", template: "phish" });
    expect(unknownTemplate.success).toBe(false);
    expect(h.sent).toHaveLength(0);
  });
});

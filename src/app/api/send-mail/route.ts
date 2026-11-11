export const maxDuration = 60;

import { NextResponse } from "next/server";
import {
  sendMail,
  renderEmailShell,
  renderMissedAttendanceEmail,
  renderHandoverRequestEmail,
  renderHandoverApprovalEmail,
  renderHandoverRejectionEmail,
  renderSwapOfferEmail,
  renderSmeEvaluationEmail,
  renderTimetableUpdateEmail,
  renderAnnouncementEmail,
  renderSmeDailyReportEmail,
  renderSmeWeeklyDigestEmail,
  renderMonthlySkillReportEmail,
} from "@/lib/mail";
import { requireRole, apiAuthErrorResponse } from "@/lib/api-auth";

/**
 * Server-side allowlist (API_OPTIMIZATION_PLAN item 8): templates are the ONLY
 * way to compose mail — no raw htmlBody, and recipients must already exist in
 * the users/students/mentors tables. Prevents the endpoint being used as an
 * open spam/phishing relay.
 */

const ALLOWED_TEMPLATES: Record<string, (data: any) => string> = {
  missed_attendance: renderMissedAttendanceEmail,
  handover_request: renderHandoverRequestEmail,
  handover_approval: renderHandoverApprovalEmail,
  handover_rejection: renderHandoverRejectionEmail,
  demo_swap: (data) => renderSwapOfferEmail(data),
  class_swap: (data) => renderSwapOfferEmail({ ...data, kind: "class" }),
  sme_evaluation: renderSmeEvaluationEmail,
  timetable_update: renderTimetableUpdateEmail,
  announcement: renderAnnouncementEmail,
  sme_daily_report: renderSmeDailyReportEmail,
  sme_weekly_digest: renderSmeWeeklyDigestEmail,
  monthly_skill_report: renderMonthlySkillReportEmail,
  custom: (data) =>
    renderEmailShell({
      title: data.title || "Operational Notice",
      badgeText: data.badgeText || "Operational Notice",
      badgeColor: data.badgeColor || "indigo",
      description: data.description || "",
      details: data.details || [],
      ctaText: data.ctaText,
      ctaUrl: data.ctaUrl,
    }),
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const KNOWN_USER_TABLES = [
  "users",
  "mentors",
  "students",
  "sme_users",
  "kam_users",
  "campus_managers",
];

/**
 * One UNION query for the whole recipient list. The old shape opened a connection
 * and ran six lookups per address, so a 10-recipient send cost 60 round-trips.
 */
async function unknownRecipients(db: any, emails: string[]): Promise<string[]> {
  const clean = emails.map((e) => e.toLowerCase().trim());
  const placeholders = clean.map(() => "?").join(",");
  const arms = KNOWN_USER_TABLES.map((table) =>
    table === "users"
      ? `SELECT LOWER(email) AS email FROM users WHERE status = 'Active' AND LOWER(email) IN (${placeholders})`
      : `SELECT LOWER(email) AS email FROM ${table} WHERE LOWER(email) IN (${placeholders})`
  );
  // One IN-list per UNION arm: the params have to repeat once per table, not once per
  // address. The old shape supplied n*n values against 6*n placeholders, so Postgres
  // rejected the bind and every send failed unless exactly six recipients were given.
  const params = KNOWN_USER_TABLES.flatMap(() => clean);
  const rows = await db.all(arms.join(" UNION "), params);
  const known = new Set(rows.map((r: any) => r.email));
  return clean.filter((email) => !known.has(email));
}

export async function POST(request: Request) {
  try {
    // Authenticated roles allowed to send mail via this endpoint:
    await requireRole(request, "admin", "cm", "sme", "kam");

    const body = await request.json();
    const { to, subject, template, data } = body;

    if (!to || !subject) {
      return NextResponse.json({ success: false, message: "Missing to or subject" }, { status: 400 });
    }

    // Reject raw HTML payloads outright — templates only.
    if (body.htmlBody) {
      return NextResponse.json(
        { success: false, message: "Raw htmlBody is not accepted. Use an allowlisted template." },
        { status: 400 }
      );
    }

    const renderer = template ? ALLOWED_TEMPLATES[template] : null;
    if (!renderer) {
      return NextResponse.json(
        { success: false, message: `Unknown or missing template. Allowed: ${Object.keys(ALLOWED_TEMPLATES).join(", ")}` },
        { status: 400 }
      );
    }

    const finalHtml = renderer(data || {});

    // Recipient allowlist: every address must belong to a known user.
    const requested = String(to).split(",").map((e: string) => e.trim()).filter(Boolean);
    if (requested.length === 0 || requested.length > 10) {
      return NextResponse.json({ success: false, message: "Provide 1–10 recipient addresses." }, { status: 400 });
    }
    for (const email of requested) {
      if (!EMAIL_RE.test(email)) {
        return NextResponse.json({ success: false, message: `Invalid recipient address: ${email}` }, { status: 400 });
      }
    }

    const db = await getDbSafe();
    const unknown = await unknownRecipients(db, requested);
    if (unknown.length > 0) {
      return NextResponse.json(
        { success: false, message: `Recipient is not a known portal user: ${unknown.join(", ")}` },
        { status: 403 }
      );
    }

    const res = await sendMail({ to, subject, htmlBody: finalHtml });
    return NextResponse.json(res);
  } catch (error: any) {
    const authRes = apiAuthErrorResponse(error);
    if (authRes) return authRes;
    console.error("API POST send-mail error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

async function getDbSafe() {
  const { getDb } = await import("@/lib/db");
  return getDb();
}

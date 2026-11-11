import nodemailer from "nodemailer";
import { getDb } from "./db";
import { fetchWithTimeout, MAIL_FETCH_TIMEOUT_MS } from "./net";
import { generateId } from "@/lib/id";

/**
 * Brand UI Constants matching FACE Prep E-Campus website design system
 */
export const BRAND = {
  name: "FACE Prep",
  subtext: "E-CAMPUS",
  tagline: "University Operations Platform",
  portalUrl: process.env.NEXT_PUBLIC_APP_URL || "https://e-campus.faceprepcampus.com",
  // Logo served from the production domain — never from an external third-party deploy (MAIL-C01)
  logoUrl: `${process.env.NEXT_PUBLIC_APP_URL || "https://e-campus.faceprepcampus.com"}/E-Campus.png`,
  emailPrefix: "[FACE Prep E-Campus]", // MAIL-M10 — single source of truth
  primaryPink: "#D528A2",
  peachCoral: "#F4A863",
  darkHeaderBg: "linear-gradient(135deg, #0F172A 0%, #1E1B4B 100%)",
  btnGradient: "linear-gradient(135deg, #D528A2 0%, #F4A863 100%)",
};

export type BadgeColor = "indigo" | "emerald" | "amber" | "rose" | "purple";

const BADGE_STYLES: Record<BadgeColor, { bg: string; text: string; border: string; label: string }> = {
  indigo: { bg: "#fdf2f8", text: "#db2777", border: "#fbcfe8", label: "Information" },
  emerald: { bg: "#ecfdf5", text: "#047857", border: "#d1fae5", label: "Approved" },
  amber: { bg: "#fef3c7", text: "#b45309", border: "#fde68a", label: "Action Required" },
  rose: { bg: "#fff1f2", text: "#be123c", border: "#ffe4e6", label: "Compliance Notice" },
  purple: { bg: "#faf5ff", text: "#6b21a8", border: "#e9d5ff", label: "SME Rating" },
};

export interface EmailDetailItem {
  label: string;
  value: string;
  highlight?: boolean;
}

/**
 * Master Responsive Email Shell Builder
 * Recreates FACE Prep E-Campus website cards, gradients, typography, and logo badge
 */
export function renderEmailShell({
  title,
  badgeText,
  badgeColor = "indigo",
  description,
  details = [],
  ctaText = "Log in to FACE Prep E-Campus Portal →",
  ctaUrl = BRAND.portalUrl,
  footerText = "This is an automated operational notification from FACE Prep E-Campus.",
}: {
  title: string;
  badgeText: string;
  badgeColor?: BadgeColor;
  description: string;
  details?: EmailDetailItem[];
  ctaText?: string;
  ctaUrl?: string;
  footerText?: string;
}) {
  const badgeStyle = BADGE_STYLES[badgeColor] || BADGE_STYLES.indigo;

  const rowsHtml = details
    .map(
      (item, idx) => `
      <tr style="border-bottom: 1px solid #f1f5f9; ${idx === details.length - 1 ? "border-bottom: none;" : ""}">
        <td style="padding: 12px 18px; font-weight: 700; color: #64748b; width: 140px; font-size: 12.5px; text-align: left; text-transform: uppercase; letter-spacing: 0.03em;">${item.label}</td>
        <td style="padding: 12px 18px; color: ${item.highlight ? badgeStyle.text : "#0f172a"}; font-weight: ${item.highlight ? "800" : "600"}; font-size: 13.5px; text-align: left;">${item.value}</td>
      </tr>
    `
    )
    .join("");

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${title}</title>
    </head>
    <body style="margin: 0; padding: 0; background-color: #f8fafc; font-family: 'Outfit', 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #0f172a; line-height: 1.5;">
      <div style="background-color: #f8fafc; padding: 36px 16px; min-height: 100%;">
        <div style="max-width: 580px; margin: 0 auto; background-color: #ffffff; border-radius: 24px; overflow: hidden; box-shadow: 0 10px 30px rgba(15, 23, 42, 0.06); border: 1px solid #e2e8f0;">
          
          <!-- Official FACE Prep E-Campus Image Logo Header -->
          <div style="background-color: #ffffff; padding: 28px 24px 20px 24px; text-align: center; border-bottom: 1px solid #f1f5f9;">
            <a href="${BRAND.portalUrl}" target="_blank" style="display: inline-block; text-decoration: none;">
              <img src="${BRAND.logoUrl}" alt="FACE Prep E-Campus" style="height: 52px; width: auto; max-width: 240px; border: 0; outline: none; text-decoration: none; display: block; margin: 0 auto;" />
            </a>
            <div style="color: #64748b; font-size: 10.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.12em; margin-top: 10px;">University Operations Platform</div>
          </div>
   
          <!-- Main Content Body -->
          <div style="padding: 32px 28px;">
            
            <!-- Category Badge & Heading -->
            <div style="margin-bottom: 24px; text-align: left;">
              <span style="display: inline-block; background-color: ${badgeStyle.bg}; color: ${badgeStyle.text}; font-weight: 800; font-size: 10px; padding: 5px 12px; border-radius: 9999px; text-transform: uppercase; letter-spacing: 0.06em; border: 1px solid ${badgeStyle.border};">
                ${badgeText}
              </span>
              <h1 style="color: #0f172a; font-size: 21px; font-weight: 800; margin: 12px 0 6px 0; letter-spacing: -0.02em; line-height: 1.3;">${title}</h1>
              <p style="color: #64748b; font-size: 14px; font-weight: 500; margin: 0; line-height: 1.5;">${description}</p>
            </div>
   
            <!-- Details Card Table -->
            ${details.length > 0
      ? `
            <div style="border: 1px solid #e2e8f0; border-radius: 18px; overflow: hidden; background-color: #ffffff; margin-bottom: 28px; box-shadow: 0 2px 8px rgba(0,0,0,0.02);">
              <table style="width: 100%; border-collapse: collapse; text-align: left;">
                <tbody>
                  ${rowsHtml}
                </tbody>
              </table>
            </div>
            `
      : ""
    }
   
            <!-- Reusable Brand CTA Button -->
            <div style="text-align: center; margin-top: 28px; margin-bottom: 8px;">
              <a href="${ctaUrl}" target="_blank" style="display: inline-block; background: ${BRAND.btnGradient}; color: #ffffff; font-weight: 800; font-size: 13.5px; padding: 14px 28px; border-radius: 14px; text-decoration: none; box-shadow: 0 6px 18px rgba(213, 40, 162, 0.3); letter-spacing: 0.01em;">
                ${ctaText}
              </a>
            </div>

          </div>
   
          <!-- Footer Branding -->
          <div style="background-color: #f8fafc; padding: 22px 28px; text-align: center; border-top: 1px solid #f1f5f9;">
            <p style="color: #94a3b8; font-size: 11.5px; margin: 0; font-weight: 600;">${footerText}</p>
            <p style="color: #cbd5e1; font-size: 10.5px; margin-top: 6px; font-weight: 500;">&copy; ${new Date().getFullYear()} FACE Prep E-Campus Operations. All rights reserved.</p>
          </div>
        </div>
      </div>
    </body>
    </html>
  `;
}

/* ==========================================================================
   SPECIALIZED NOTIFICATION TEMPLATES MATCHING WEBSITE UI
   ========================================================================== */

/**
 * 1. Faculty Handover Request Email
 */
export function renderHandoverRequestEmail(data: {
  requestorName: string;
  coverStaffName: string;
  dateStr: string;
  time: string;
  course: string;
  classGroup: string;
  reason?: string;
  /** Defaults to the portal homepage; pass the recipient's handover tab so the CTA lands on the request. */
  ctaUrl?: string;
}) {
  return renderEmailShell({
    title: "Class Coverage Requested",
    badgeText: "Faculty Handover Request",
    badgeColor: "indigo",
    description: `Dear <strong>${data.coverStaffName}</strong>, <strong>${data.requestorName}</strong> has requested you to cover their scheduled class session.`,
    details: [
      { label: "Requesting Faculty", value: data.requestorName, highlight: true },
      { label: "Date & Time", value: `${data.dateStr} • ${data.time}` },
      { label: "Course / Subject", value: data.course },
      { label: "Class Cohort", value: data.classGroup },
      { label: "Reason", value: data.reason || "Operational Handover" },
    ],
    ctaText: "Review & Accept Handover Request →",
    ctaUrl: data.ctaUrl,
  });
}

/**
 * 2. Handover Approval Confirmation Email
 */
export function renderHandoverApprovalEmail(data: {
  requestorName: string;
  coverStaffName: string;
  dateStr: string;
  time: string;
  course: string;
  classGroup: string;
  reviewerName?: string;
}) {
  return renderEmailShell({
    title: "Handover Approved",
    badgeText: "Handover Confirmed",
    badgeColor: "emerald",
    description: `Dear <strong>${data.requestorName}</strong>, your class handover request has been approved by <strong>${data.reviewerName || "Management"}</strong>.`,
    details: [
      { label: "Covering Faculty", value: data.coverStaffName, highlight: true },
      { label: "Date & Time", value: `${data.dateStr} • ${data.time}` },
      { label: "Subject", value: data.course },
      { label: "Cohort", value: data.classGroup },
      { label: "Status", value: "Approved & Assigned" },
    ],
    ctaText: "View Handover Status on Portal →",
  });
}

/**
 * 3. Handover Rejection Notice Email
 */
export function renderHandoverRejectionEmail(data: {
  requestorName: string;
  coverStaffName: string;
  dateStr: string;
  time: string;
  course: string;
  classGroup: string;
  reviewerName?: string;
  rejectionReason?: string;
}) {
  return renderEmailShell({
    title: "Handover Request Declined",
    badgeText: "Handover Notice",
    badgeColor: "rose",
    description: `Dear <strong>${data.requestorName}</strong>, your class handover request could not be approved at this time.`,
    details: [
      { label: "Proposed Cover", value: data.coverStaffName },
      { label: "Date & Time", value: `${data.dateStr} • ${data.time}` },
      { label: "Subject", value: data.course },
      { label: "Reviewed By", value: data.reviewerName || "Management" },
      { label: "Reason", value: data.rejectionReason || "Scheduling conflict", highlight: true },
    ],
    ctaText: "Open Handover Dashboard →",
  });
}

/**
 * 4. Demo Swap Proposal Email
 */
export function renderSwapOfferEmail(data: {
  requestorName: string;
  targetMentorName: string;
  dateStr: string;
  time: string;
  course: string;
  classGroup: string;
  /** "demo" for demo-session swaps, "class" for a regular lecture swap compensation. */
  kind?: "demo" | "class";
  ctaUrl?: string;
}) {
  const isDemo = (data.kind || "demo") === "demo";
  const label = isDemo ? "Demo" : "Class";
  return renderEmailShell({
    title: `${label} Swap Request Received`,
    badgeText: `${label} Swap Proposal`,
    badgeColor: "amber",
    description: `Dear <strong>${data.targetMentorName}</strong>, <strong>${data.requestorName}</strong> has proposed a ${isDemo ? "demo session" : "class"} swap with you.`,
    details: [
      { label: "Proposer", value: data.requestorName, highlight: true },
      { label: isDemo ? "Proposed Session" : "Proposed Class", value: `${data.dateStr} • ${data.time}` },
      { label: "Subject", value: data.course },
      { label: "Cohort", value: data.classGroup },
    ],
    ctaText: `Respond to ${label} Swap Proposal →`,
    ctaUrl: data.ctaUrl,
  });
}

/**
 * 5. SME Evaluation Rating Notification Email
 */
export function renderSmeEvaluationEmail(data: {
  mentorName: string;
  smeName: string;
  rating: string;
  feedback: string;
  mentorGroup: string;
}) {
  return renderEmailShell({
    title: "SME Evaluation Published",
    badgeText: "SME Feedback",
    badgeColor: "purple",
    description: `Dear <strong>${data.mentorName}</strong>, Subject Matter Expert <strong>${data.smeName}</strong> has evaluated your demo teaching performance.`,
    details: [
      { label: "Mentor Group", value: data.mentorGroup },
      { label: "Overall Score", value: data.rating, highlight: true },
      { label: "Evaluator", value: data.smeName },
      { label: "Key Feedback", value: data.feedback },
    ],
    ctaText: "View Detailed Scorecard →",
  });
}

/**
 * 6. Missed Attendance Compliance Warning Email
 */
export function renderMissedAttendanceEmail(data: {
  mentorName: string;
  dateStr: string;
  dayName: string;
  time: string;
  course: string;
  classGroup: string;
}) {
  return renderEmailShell({
    title: "Action Required: Missed Attendance Marking",
    badgeText: "Compliance Warning",
    badgeColor: "rose",
    description: `Dear <strong>${data.mentorName}</strong>, this is an official compliance alert that student attendance logs have not been submitted for your class.`,
    details: [
      { label: "Session Date", value: `${data.dateStr} (${data.dayName})` },
      { label: "Period / Time", value: data.time },
      { label: "Course / Subject", value: data.course },
      { label: "Class Cohort", value: data.classGroup, highlight: true },
    ],
    ctaText: "Submit Attendance Logs Now →",
    footerText: "Immediate submission is required for academic record compliance.",
  });
}

/**
 * 7. Timetable / Schedule Update Email
 */
export function renderTimetableUpdateEmail(data: {
  recipientName: string;
  title: string;
  message: string;
  details?: EmailDetailItem[];
}) {
  return renderEmailShell({
    title: data.title || "Timetable Schedule Update",
    badgeText: "Schedule Notice",
    badgeColor: "indigo",
    description: `Dear <strong>${data.recipientName}</strong>, ${data.message}`,
    details: data.details || [],
    ctaText: "View Updated Timetable →",
  });
}

/**
 * 8. Announcement & Broadcast Notice Email
 */
export function renderAnnouncementEmail(data: {
  recipientName: string;
  title: string;
  message: string;
  category?: string;
  dateStr?: string;
}) {
  return renderEmailShell({
    title: data.title,
    badgeText: data.category || "University Notice",
    badgeColor: "indigo",
    description: `Dear <strong>${data.recipientName}</strong>, ${data.message}`,
    details: data.dateStr ? [{ label: "Published Date", value: data.dateStr }] : [],
    ctaText: "Open E-Campus Portal →",
  });
}

/**
 * Demo Compliance Gap Email (Demo Workflow Redesign Phase C).
 * Fired from /api/demo-sessions action=evaluate when any department evaluation
 * criterion is unmet (checkbox unticked or final mark below threshold).
 * Recipients: KAM + CM (To) with the evaluating SME (CC) — resolved server-side.
 */
export function renderDemoComplianceEmail(data: {
  recipientName: string;
  mentorName: string;
  department: string;
  subject: string;
  dateStr: string;
  timeSlot: string;
  smeName: string;
  finalMark: string;
  unmetItems: string[];
}) {
  const itemsHtml = data.unmetItems
    .map(
      (item) =>
        `<li style="margin:6px 0;padding:8px 12px;background:#fff1f2;border:1px solid #ffe4e6;border-radius:8px;color:#be123c;font-weight:600;font-size:13px;">\u2717 ${item}</li>`
    )
    .join("");

  return renderEmailShell({
    title: "Demo Compliance Gap — Action Required",
    badgeText: "Compliance Escalation",
    badgeColor: "rose",
    description: `Dear <strong>${data.recipientName}</strong>, during the demo evaluation of <strong>${data.mentorName}</strong>, the following compliance criteria were <strong>not met</strong>:
      <ul style="list-style:none;padding:0;margin:12px 0;">${itemsHtml}</ul>`,
    details: [
      { label: "Mentor / Department", value: `${data.mentorName} (${data.department || "General"})` },
      { label: "Demo Subject", value: data.subject },
      { label: "Original Slot", value: `${data.dateStr} • ${data.timeSlot}` },
      { label: "Final Evaluation Mark", value: data.finalMark, highlight: true },
      { label: "Evaluating SME", value: data.smeName },
    ],
    ctaText: "Review Demo Evaluation →",
    footerText: "This escalation was triggered automatically because one or more department evaluation criteria were unmet.",
  });
}

/**
 * 7. Account Welcome / Activation Email
 * The initial password is deliberately NOT included: DEFAULT_PASSWORD is one shared
 * secret for every account, so mailing it would broadcast it to every inbox.
 */
export function renderAccountWelcomeEmail(data: {
  recipientName: string;
  loginEmail: string;
  roleLabel: string;
}) {
  return renderEmailShell({
    title: "Welcome to FACE Prep E-Campus",
    badgeText: "Account Created",
    badgeColor: "emerald",
    description: `Dear <strong>${data.recipientName}</strong>, your E-Campus account has been created by your campus administrator.`,
    details: [
      { label: "Login Email", value: data.loginEmail, highlight: true },
      { label: "Role", value: data.roleLabel },
      { label: "Initial Password", value: "Issued to your administrator. Please change it right after your first sign-in.", highlight: true },
      { label: "Action Required", value: "Sign in once, then set a private password from your profile." },
    ],
    ctaText: "Log In to E-Campus Portal →",
    footerText: "This is your official account activation notice. Never share your credentials with anyone, including staff.",
  });
}

export function renderSmeDailyReportEmail(data: any): string {
  return renderEmailShell({
    title: data?.title || "SME Daily Evaluation Report",
    badgeText: "SME Report",
    badgeColor: "indigo",
    description: data?.message || data?.summary || "Daily SME evaluation report summary.",
  });
}

export function renderSmeWeeklyDigestEmail(data: any): string {
  return renderEmailShell({
    title: data?.title || "SME Weekly Digest",
    badgeText: "Weekly Digest",
    badgeColor: "purple",
    description: data?.message || data?.summary || "Weekly SME evaluation digest summary.",
  });
}

export function renderMonthlySkillReportEmail(data: any): string {
  return renderEmailShell({
    title: data?.title || "Monthly Skill Development Report",
    badgeText: "Skill Report",
    badgeColor: "emerald",
    description: data?.message || data?.summary || "Monthly student skill development report.",
  });
}

/** Non-fatal welcome dispatch — account creation must not fail because mail is down. */
export async function sendAccountWelcomeEmail(data: {
  to: string;
  recipientName: string;
  roleLabel: string;
}) {
  if (!data.to?.includes("@")) return;
  try {
    await sendMail({
      to: data.to,
      subject: `${BRAND.emailPrefix} Your Account Is Ready`,
      htmlBody: renderAccountWelcomeEmail({
        recipientName: data.recipientName,
        loginEmail: data.to,
        roleLabel: data.roleLabel,
      }),
    });
  } catch (err) {
    console.warn(`Failed to send welcome email to ${data.to}:`, err);
  }
}

/* ==========================================================================
   CENTRALIZED BREVO DISPATCH UTILITY
   ========================================================================== */

/** Strip HTML tags to produce a plain-text fallback (MAIL-M05) */
function htmlToPlainText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&copy;/g, "©")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/**
 * The admin "mailing_enabled" toggle was read from the database in front of every single
 * send, so each message paid an extra round trip (and, in a bulk notify, one per recipient
 * batch). A short process-local cache costs up to that TTL in staleness for an admin
 * switch that is flipped rarely; a failed read is never cached, so mail still gets its
 * check when the setting read hiccups.
 */
const MAILING_TOGGLE_TTL_MS = Math.max(0, Number(process.env.MAILING_TOGGLE_TTL_MS || 60000));
let mailingToggleCache: { at: number; value: string | null } | null = null;

async function readMailingToggle(db: any): Promise<string | null> {
  if (mailingToggleCache && Date.now() - mailingToggleCache.at < MAILING_TOGGLE_TTL_MS) {
    return mailingToggleCache.value;
  }
  const setting = await db.get("SELECT value FROM system_settings WHERE key = 'mailing_enabled'");
  const value = setting?.value ?? null;
  mailingToggleCache = { at: Date.now(), value };
  return value;
}

/**
 * Centralized sendMail — Brevo REST v3 → Brevo SMTP → GAS webhook.
 * Fixes: MAIL-M01 (proper BCC), MAIL-M05 (plain text), MAIL-M12 (CC support),
 *        MAIL-H03 (failure audit log), MAIL-L03 (https check), MAIL-L04 (List-Unsubscribe).
 */
export async function sendMail({
  to,
  subject,
  htmlBody,
  cc,
  bcc,
}: {
  to?: string | string[];
  subject: string;
  htmlBody: string;
  cc?: string | string[];
  bcc?: string | string[];
}) {
  try {
    // 0. GLOBAL ADMIN TOGGLE CHECK
    try {
      const db = await getDb();
      const mailingEnabled = await readMailingToggle(db);
      if (mailingEnabled === "false" || mailingEnabled === "0") {
        console.log("🛑 [Mail] Skipped — mailing disabled by Admin.");
        return { success: true, disabled: true, message: "Email delivery disabled by Admin toggle" };
      }
    } catch (checkErr) {
      console.warn("Mailing setting check failed, proceeding...", checkErr);
    }

    // Callers pass a CSV list or an array. An array used to fail the "@" check
    // below, so the mail was dropped silently while the caller saw success:true.
    const splitEmails = (value?: string | string[]) => {
      const csv = Array.isArray(value) ? value.join(",") : value;
      return csv
        ? Array.from(new Set(csv.split(",").map((e) => e.trim()).filter((e) => e && e.includes("@"))))
        : [];
    };

    const senderName = process.env.BREVO_SENDER_NAME || "FACE Prep E-Campus";
    const senderEmail = process.env.BREVO_SENDER_EMAIL || process.env.SUPER_ADMIN_EMAIL || "no-reply@faceprep.in";

    const bccList = splitEmails(bcc);
    // A campus-wide notice addressed to every mentor shows each faculty member
    // the whole roster, so a bcc-only send keeps the audience hidden and puts
    // our own mailbox in the visible To field.
    const toList = splitEmails(to);
    const recipients = toList.length > 0 ? toList : bccList.length > 0 ? [senderEmail] : [];
    if (recipients.length === 0) {
      return { success: false, error: "No valid recipient email addresses provided" };
    }

    const auditBcc = (process.env.ADMIN_AUDIT_EMAIL || "").trim(); // MAIL-M01 — proper BCC below
    const hiddenBcc = Array.from(new Set([
      ...bccList,
      ...(auditBcc && auditBcc.includes("@") ? [auditBcc] : [])
    ]));
    const ccList = splitEmails(cc);
    const plainText = htmlToPlainText(htmlBody);

    // Helper: log failure to audit_logs (MAIL-H03)
    const logFailure = async (provider: string, err: string) => {
      try {
        const db = await getDb();
        await db.run(
          "INSERT INTO audit_logs (id, type, description, actorName, actorRole, timestamp) VALUES (?, 'mail_failure', ?, 'System', 'System', ?)",
          [generateId("mail_fail"), `[${provider}] → ${recipients.join(",")} : ${err}`, new Date().toISOString()]
        );
      } catch (_) { /* never block on logging */ }
    };

    // 1. PRIMARY: Brevo REST API v3
    const brevoApiKey = process.env.BREVO_API_KEY || "";
    if (brevoApiKey) {
      try {
        const brevoBody: Record<string, any> = {
          sender: { name: senderName, email: senderEmail },
          to: recipients.map((email) => ({ email })),
          subject,
          htmlContent: htmlBody,
          textContent: plainText,
          headers: { "List-Unsubscribe": `<${BRAND.portalUrl}/notifications/settings>` }, // MAIL-L04
        };
        if (hiddenBcc.length > 0) brevoBody.bcc = hiddenBcc.map((email) => ({ email }));
        if (ccList.length > 0) brevoBody.cc = ccList.map((email) => ({ email }));

        const res = await fetchWithTimeout("https://api.brevo.com/v3/smtp/email", {
          method: "POST",
          headers: { accept: "application/json", "api-key": brevoApiKey, "content-type": "application/json" },
          body: JSON.stringify(brevoBody),
        }, MAIL_FETCH_TIMEOUT_MS);
        const data = await res.json();
        if (res.ok && data.messageId) {
          console.log("✅ [Brevo REST] sent:", data.messageId);
          return { success: true, messageId: data.messageId };
        }
        await logFailure("Brevo REST", data?.message || JSON.stringify(data));
      } catch (e: any) {
        await logFailure("Brevo REST (exception)", e.message);
      }
    }

    // 2. SECONDARY: Brevo SMTP via nodemailer
    // A REST timeout still falls through here. Worst case is a duplicate send (the REST
    // call landed after all); the alternative — holding the request open indefinitely —
    // is what made mail look like a hung button.
    const smtpUser = process.env.SMTP_USER || "";
    const smtpPass = process.env.SMTP_PASS || "";
    if (smtpUser && smtpPass) {
      try {
        const port = parseInt(process.env.SMTP_PORT || "587", 10);
        const transporter = nodemailer.createTransport({
          host: process.env.SMTP_HOST || "smtp-relay.brevo.com",
          port,
          secure: port === 465,
          auth: { user: smtpUser, pass: smtpPass },
          // Without these a dead SMTP relay hangs the send until the function is killed.
          connectionTimeout: MAIL_FETCH_TIMEOUT_MS,
          greetingTimeout: MAIL_FETCH_TIMEOUT_MS,
          socketTimeout: MAIL_FETCH_TIMEOUT_MS * 2,
        });
        const mailOpts: any = {
          from: `"${senderName}" <${senderEmail}>`,
          to: recipients.join(", "),
          subject,
          html: htmlBody,
          text: plainText,
          headers: { "List-Unsubscribe": `<${BRAND.portalUrl}/notifications/settings>` }, // MAIL-L04
        };
        if (hiddenBcc.length > 0) mailOpts.bcc = hiddenBcc.join(", ");
        if (ccList.length > 0) mailOpts.cc = ccList.join(", ");
        const info = await transporter.sendMail(mailOpts);
        console.log("✅ [Brevo SMTP] sent:", info.messageId);
        return { success: true, messageId: info.messageId };
      } catch (e: any) {
        await logFailure("Brevo SMTP", e.message);
      }
    }

    // 3. FALLBACK: Google Apps Script Webhook
    const gasUrl = process.env.NEXT_PUBLIC_GAS_MAIL_URL || "";
    if (gasUrl) {
      if (!gasUrl.startsWith("https://")) {
        await logFailure("GAS Webhook", "URL does not use HTTPS — skipped");
      } else {
        try {
          const res = await fetchWithTimeout(gasUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              to: recipients.join(","),
              bcc: hiddenBcc.join(","),
              subject,
              htmlBody
            }),
          }, MAIL_FETCH_TIMEOUT_MS);
          if (res.ok) {
            const data = await res.json();
            console.log("✅ [GAS Webhook] sent:", data);
            return { success: true, ...data };
          }
        } catch (e: any) {
          await logFailure("GAS Webhook", e.message);
        }
      }
    }

    // 4. All providers failed — mock log
    await logFailure("All providers", "No working mail provider configured");
    console.log("⚠️  [Mail] MOCK — To:", recipients.join(","), "| Subject:", subject);
    return { success: true, mocked: true };
  } catch (err: any) {
    console.error("Mail utility error:", err);
    return { success: false, error: err.message };
  }
}

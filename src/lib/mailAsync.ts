/**
 * Async / fire-and-forget email helpers.
 * Wraps sendMail() so callers never need to await email dispatch,
 * and failures are always logged to audit_logs instead of silently dropped.
 */
import { after } from "next/server";
import { sendMail } from "./mail";

interface MailJob {
  to?: string | string[];
  subject: string;
  htmlBody: string;
  cc?: string | string[];
  bcc?: string | string[];
  context?: string; // label for audit log entries
}

/**
 * Schedule email dispatch for after the response has been sent.
 * Does NOT block the caller. A detached promise used to be swallowed whole —
 * Vercel freezes the function as soon as the response is returned, so the mail
 * simply never left — which is why this is handed to `after()` instead.
 * Logs failures to audit_logs for admin visibility.
 */
export function sendMailAsync(job: MailJob): void {
  after(() => dispatchMail(job));
}

/**
 * Send one job and record a failure, without ever rejecting.
 * Use this when the recipient or body still needs a database read: do the reads
 * inside your own `after()` block and finish with this, instead of nesting
 * `sendMailAsync` (and therefore a second `after()`) inside it.
 */
export async function dispatchMail(job: MailJob): Promise<void> {
  try {
    const result = await sendMail({
      to: job.to,
      subject: job.subject,
      htmlBody: job.htmlBody,
      cc: job.cc,
      bcc: job.bcc
    });

    if (!result.success && !result.disabled && !result.mocked) {
      try {
        const { getDb } = await import("./db");
        const { generateId } = await import("./id");
        const db = await getDb();
        await db.run(
          "INSERT INTO audit_logs (id, type, description, actorName, actorRole, timestamp) VALUES (?, 'mail_failure', ?, 'System', 'System', ?)",
          [
            generateId("mail_fail"),
            `Email to ${Array.isArray(job.to) ? job.to.join(",") : (job.to || "bcc-only")} failed (${job.context || "no context"}): ${result.error}`,
            new Date().toISOString(),
          ]
        );
      } catch (logErr) {
        console.error("sendMailAsync: could not log failure to audit_logs:", logErr);
      }
    }
  } catch (err) {
    console.error(`sendMailAsync unhandled error (${job.context}):`, err);
  }
}

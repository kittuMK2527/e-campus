# Mailing System — Full Audit & Fix Plan
> Files covered: `src/lib/mail.ts`, `src/app/api/send-mail/route.ts`,
> `src/app/api/requests/route.ts`, `src/app/api/requests/review/route.ts`,
> `src/app/api/requests/faculty-leave/route.ts`, `src/app/api/daily-configs/route.ts`,
> `src/app/api/requests/swap/route.ts`, `src/app/api/requests/leave/route.ts`,
> `src/app/api/student-tracker/route.ts`, `src/lib/interview-notifications.ts`

---

## Architecture Overview

```
sendMail()  ←  Brevo REST API (primary)
            ←  Brevo SMTP nodemailer (secondary)
            ←  Google Apps Script webhook (fallback)
            ←  Console mock log (last resort)

Templates:
  renderEmailShell()       ← base builder
  formatZentraEmail()      ← legacy alias for renderEmailShell
  renderHandoverRequestEmail()
  renderHandoverApprovalEmail()
  renderHandoverRejectionEmail()
  renderDemoSwapEmail()
  renderSmeEvaluationEmail()
  renderMissedAttendanceEmail()
  renderTimetableUpdateEmail()
  renderAnnouncementEmail()
  renderDemoComplianceEmail()

Dispatch points (10 routes):
  POST /api/send-mail          ← Admin/CAM explicit trigger
  POST /api/requests           ← Handover request created → email cover mentor
  POST /api/requests/review    ← Handover approved/rejected → email requestor
  POST /api/requests/faculty-leave  ← Leave submitted → email CM; approved → email mentor
  POST /api/requests/leave     ← Student leave → email teacher(s); decision → email student
  POST /api/requests/swap      ← Swap proposal → email target mentor
  POST /api/daily-configs      ← Schedule update → bulk email all mentors
  POST /api/student-tracker    ← Task assigned → email student
  lib/interview-notifications  ← Interview events → email KAMs/regional mentors
```

---

## 🔴 CRITICAL Bugs

---

### MAIL-C01 · Logo Image Served From External Vercel Deployment — Will Break
**File:** `src/lib/mail.ts` line ~85  
**Status:** ❌ Open  

**Problem:**
```ts
<img src="https://zentra-ruddy-chi.vercel.app/E-Campus.png" .../>
```
The FACE Prep E-Campus logo in every email is loaded from a **third-party Vercel deployment** (`zentra-ruddy-chi.vercel.app`). If that deployment is ever deleted, redeployed, or Vercel's free tier expires:
- Every outgoing email shows a broken image icon
- No fallback text-only logo
- Affects 100% of emails system-wide

**Fix:** Host the logo from the production domain itself or embed it as a base64 inline image:
```ts
// Option A: Use the actual production domain
const LOGO_URL = process.env.NEXT_PUBLIC_APP_URL
  ? `${process.env.NEXT_PUBLIC_APP_URL}/E-Campus.png`
  : "https://e-campus.faceprepcampus.com/E-Campus.png";

// Option B: Inline base64 (immune to hosting issues, but adds ~20KB per email)
// Store the base64 string in an env var or a static constant
```
Also add alt text and a text fallback:
```html
<img src="${LOGO_URL}" alt="FACE Prep E-Campus" .../>
<!-- If image fails, the alt text shows cleanly -->
```

---

### MAIL-C02 · `GET /api/requests/faculty-leave` — SQL Uses `ANY(?::text[])` PostgreSQL Syntax
**File:** `src/app/api/requests/faculty-leave/route.ts` ~line 88  
**Status:** ❌ Open  

**Problem:**
```ts
const allCovers = await db.all(
  `SELECT ... FROM handover_requests WHERE compensates_handover_id = ANY(?::text[])`,
  leaveIds
).catch(() => []);
```
`ANY(?::text[])` is PostgreSQL array syntax — completely invalid in libSQL/SQLite (Turso). This silently returns `[]` (due to the `.catch(() => [])`) for every faculty leave GET request. As a result:
- Cover requests are never enriched onto leave records
- The `allApproved` auto-sync logic never triggers
- Leave requests appear to have no covers even when they do

**Fix:**
```ts
// SQLite/libSQL compatible: use IN with dynamic placeholders
if (leaveIds.length === 0) {
  // skip query entirely
} else {
  const placeholders = leaveIds.map(() => "?").join(",");
  const allCovers = await db.all(
    `SELECT ... FROM handover_requests WHERE compensates_handover_id IN (${placeholders})`,
    leaveIds
  ).catch(() => []);
}
```

---

### MAIL-C03 · `POST /api/requests/review` — Email Sent to Wrong Recipient When Mentor Email Missing
**File:** `src/app/api/requests/review/route.ts` ~line 343  
**Status:** ❌ Open  

**Problem:**
```ts
const requestor = await db.get("SELECT email FROM mentors WHERE id = ?", handoverRequest.requestorId);
const requestorEmail = requestor?.email
  || process.env.SUPER_ADMIN_EMAIL
  || process.env.BREVO_SENDER_EMAIL
  || "";
```
When the mentor's email is missing from the DB, the approval/rejection notification is sent to the **super admin's email or the Brevo sender email**. A mentor gets notified at an address that isn't theirs, or the admin receives a notification meant for a mentor.

**Fix:**
```ts
const requestorEmail = requestor?.email;
if (!requestorEmail) {
  console.warn(`No email for mentor ${handoverRequest.requestorId} — skipping review notification`);
  // Still proceed with the rest of the handler, just skip the email
} else {
  await sendMail({ to: requestorEmail, subject, htmlBody });
}
```

---

### MAIL-C04 · `POST /api/requests/faculty-leave` — Email Sent to `"cam@zentra.edu"` When CM Not Found
**File:** `src/app/api/requests/faculty-leave/route.ts` ~line 652  
**Status:** ❌ Open  

**Problem:**
```ts
const cmEmail = camUser?.email || "cam@zentra.edu";
if (cmEmail) {
  await sendMail({ to: cmEmail, ... });
}
```
When no CM is found for the college, the leave notification is sent to `cam@zentra.edu` — a non-existent address that always bounces silently. The CM never receives the notification and the leave sits unreviewed indefinitely.

**Fix:**
```ts
if (!camUser?.email) {
  console.warn(`No CM email found for college ${effectiveCollegeId} — leave notification skipped`);
  // Optionally: notify via admin email as a fallback
  const adminEmail = process.env.SUPER_ADMIN_EMAIL;
  if (adminEmail) {
    await sendMail({ to: adminEmail, subject: `[Escalation] No CM configured for ${effectiveCollegeId}`, htmlBody: ... });
  }
} else {
  await sendMail({ to: camUser.email, subject, htmlBody });
}
```

---

### MAIL-C05 · `POST /api/daily-configs` — Bulk Email All Mentors Without Rate Limiting
**File:** `src/app/api/daily-configs/route.ts` ~line 153 and ~line 327  
**Status:** ❌ Open  

**Problem:**
```ts
const collegeMentors = await db.all("SELECT id, name, email FROM mentors WHERE college_id = ?", college_id);
for (const m of collegeMentors) {
  if (m.email) {
    await sendMail({ to: m.email, ... }); // ← sequential, blocking
  }
}
```
This fires one `sendMail()` call per mentor, sequentially in a `for` loop:
1. **No rate limiting** — Brevo API has a rate limit (300 emails/min on free tier, 10/sec burst). 100 mentors = 100 API calls in ~2 seconds, likely hitting limits and getting 429 errors silently ignored
2. **Sequential blocking** — Each email awaits completion before the next starts. 100 mentors × ~500ms per email = 50 seconds response time, hitting the `maxDuration = 60` limit
3. **No deduplication** — If the same mentor has multiple records, they get duplicate emails

**Fix:**
```ts
// Batch into Brevo's "Send to List" API or use a single multi-recipient email
const validMentorEmails = collegeMentors
  .filter(m => m.email && m.email.includes("@"))
  .map(m => m.email);

// Option A: Send one email to all (BCC for privacy, or To list via Brevo batch API)
if (validMentorEmails.length > 0) {
  await sendMail({
    to: validMentorEmails.join(","), // sendMail already splits by comma
    subject,
    htmlBody: genericEmailHtml // one template for all
  });
}
```
Or use Brevo's Contact Lists / Transactional batching API to send a single request that Brevo fans out:
```ts
// POST https://api.brevo.com/v3/smtp/email with multiple `to` entries
const toList = validMentorEmails.map(email => ({ email }));
// Pass toList directly to Brevo — single HTTP call for N recipients
```

---

## 🔴 HIGH Bugs

---

### MAIL-H01 · `GET /api/requests` Has No Authentication
**File:** `src/app/api/requests/route.ts`  
**Status:** ❌ Open  

**Problem:**
The `GET` handler has no `requireAuth` call. Anyone can read all handover requests in the system without credentials — exposing mentor names, class details, leave reasons, and internal request statuses.

**Fix:**
```ts
export async function GET(request: Request) {
  const { auth, errorResponse } = await requireAuth(request, { checkCsrf: false });
  if (errorResponse) return errorResponse;
  // ...rest unchanged
}
```

---

### MAIL-H02 · `POST /api/daily-configs` Has No Authentication
**File:** `src/app/api/daily-configs/route.ts`  
**Status:** ❌ Open  

**Problem:**
No `requireAuth` at the start of the POST handler. Anyone can configure any campus's daily schedule (set any day as a holiday, change day orders) and trigger bulk email notifications to all mentors.

**Fix:**
```ts
export async function POST(request: Request) {
  const { auth, errorResponse } = await requireAuth(request, {
    allowedRoles: ["admin", "cm", "kam"],
    checkCsrf: true
  });
  if (errorResponse) return errorResponse;
```

---

### MAIL-H03 · Email Failures Are Silently Swallowed — No Admin Alert
**Files:** All 10 mail-dispatch routes  
**Status:** ❌ Open  

**Problem:**
Every `sendMail()` call is wrapped in a `try/catch` that only does `console.error(...)`:
```ts
try {
  await sendMail({ ... });
} catch (mailErr) {
  console.error("Failed to send email:", mailErr); // ← only console, no action
}
```
If Brevo API key is wrong, expired, or rate-limited — and the GAS fallback also fails — the email is silently dropped. No admin is alerted. No retry is attempted. Critical notifications (handover decisions, leave approvals) are lost with no indication to the user.

**Fix:** Add a structured failure response and surface it in the API response:
```ts
const mailResult = await sendMail({ to, subject, htmlBody });
if (!mailResult.success && !mailResult.disabled && !mailResult.mocked) {
  // Log to audit_logs for admin visibility
  await db.run(
    "INSERT INTO audit_logs (id, type, description, actorName, actorRole, timestamp) VALUES (?, 'mail_failure', ?, 'System', 'System', ?)",
    [`mail_fail_${Date.now()}`, `Email delivery failed to ${to}: ${mailResult.error}`, new Date().toISOString()]
  );
}
// Include in response so client can show a warning:
return NextResponse.json({
  success: true,
  emailSent: mailResult.success,
  emailDisabled: mailResult.disabled,
  ...
});
```

---

### MAIL-H04 · `POST /api/daily-configs` Email Loop Runs Inside `for (dates)` Loop — N×M Emails
**File:** `src/app/api/daily-configs/route.ts` ~line 283  
**Status:** ❌ Open  

**Problem:**
When a date range is configured (e.g., `startDate` to `endDate` = 5 days), the mentor email loop runs **inside the per-date processing** in a confusing structure. Reading the code, the email dispatch is actually outside the `datesToProcess` loop (it's in a separate `try` block after), BUT the notification INSERT loop is inside the per-date loop. However the email dispatch sends the **same email N times** for each date in the range — once per mentor per call to the POST handler (not per date):

Actually tracking the code flow: the email block fires once per POST call (not per date), but it sends the same "generic" email with `startDate` hardcoded rather than per-date info. This is fine for a single date but for a range of 5 days, mentors get **1 email covering all dates** with only `startDate` shown, missing the day-type detail for each individual date.

**Fix:** Send a single summary email for the full range:
```ts
// Build a details table covering all dates
const dateDetails = datesToProcess.map(d => ({
  label: d,
  value: `${configByDate[d]?.day_type} — ${configByDate[d]?.day_order}`
}));
// Send one consolidated email
```

---

### MAIL-H05 · Logo `copyright` Footer Hardcodes `2026`
**File:** `src/lib/mail.ts` line ~135  
**Status:** ❌ Open  

**Problem:**
```html
<p>&copy; 2026 FACE Prep E-Campus Operations. All rights reserved.</p>
```
The footer copyright year is hardcoded as `2026`. In 2027+ every email will show a stale year.

**Fix:**
```ts
footerText2: `© ${new Date().getFullYear()} FACE Prep E-Campus Operations. All rights reserved.`
```
Or render it dynamically inside `renderEmailShell`:
```ts
`<p>&copy; ${new Date().getFullYear()} FACE Prep E-Campus Operations...</p>`
```

---

### MAIL-H06 · Interview Notification Emails Fire Per-User Sequentially — Can Hit Brevo Limits
**File:** `src/lib/interview-notifications.ts` ~line 149  
**Status:** ❌ Open  

**Problem:**
```ts
for (const userId of Array.from(notificationUserIds)) {
  const notifId = `notif_ext_${Date.now()}_${Math.random()...}`;
  try {
    await db.run(`INSERT INTO notifications ...`); // DB insert per user
  }
}
// Then one sendMail to a combined list
await sendMail({ to: toEmailList, ... });
```
The DB `INSERT` loop is sequential with no error handling per-row. A constraint violation on one notification silently stops the loop (the outer `try/catch` would catch it). Also `toEmailList` construction isn't shown — if it combines dozens of regional mentors into one comma-separated string, `sendMail` will attempt to send to all of them in one Brevo call which is fine, but the `to` string could exceed limits.

**Fix:**
- Use a batch INSERT for notifications instead of a loop
- Validate `toEmailList` length before sending (Brevo has a `to` array size limit of 50)

---

## 🟡 MEDIUM Issues

---

### MAIL-M01 · `sendMail` Adds Audit BCC to Every Single Email
**File:** `src/lib/mail.ts` ~line 412  
**Status:** ❌ Open  

**Problem:**
```ts
const auditBcc = process.env.ADMIN_AUDIT_EMAIL || "";
const rawEmails = to.split(",").map(e => e.trim()).filter(e => e && e.includes("@"));
if (auditBcc && !rawEmails.includes(auditBcc.trim())) {
  rawEmails.push(auditBcc.trim()); // ← adds to every email as a full recipient
}
```
The audit email is added as a **full To recipient** — not as a BCC. This means:
1. Every mentor receiving an email can see the audit address in the `To:` field
2. If the audit address replies, it will reach all original recipients
3. Email clients may mark the email as suspicious (multiple To addresses with audit-sounding addresses)

**Fix:** Use the proper BCC field:
```ts
// In the Brevo API call:
body: JSON.stringify({
  sender: { name: senderName, email: senderEmail },
  to: toList, // original recipients only
  bcc: auditBcc ? [{ email: auditBcc }] : undefined, // proper BCC
  subject,
  htmlContent: htmlBody,
})

// In the nodemailer SMTP call:
await transporter.sendMail({
  from: `"${senderName}" <${senderEmail}>`,
  to: recipients.join(", "),
  bcc: auditBcc || undefined, // proper BCC
  subject,
  html: htmlBody,
});
```

---

### MAIL-M02 · `POST /api/send-mail` Checks DB for Recipient Validation — One Query Per Email Per Recipient
**File:** `src/app/api/send-mail/route.ts` ~line 47  
**Status:** ❌ Open  

**Problem:**
```ts
for (const email of requested) {
  const db = await getDbSafe(); // ← getDb() inside loop!
  if (!(await recipientIsKnownUser(db, email))) { ... }
}
```
Two issues:
1. `getDbSafe()` is called inside the loop — it opens a new DB connection per recipient (or re-uses a pool, but the intent is wrong)
2. `recipientIsKnownUser` runs 6 parallel queries per recipient. For 10 recipients = 60 DB queries

**Fix:**
```ts
const db = await getDbSafe(); // single connection outside the loop
for (const email of requested) {
  if (!(await recipientIsKnownUser(db, email))) { ... }
}
```

---

### MAIL-M03 · Handover Request Email Does Not Include Portal Deep-Link for the Specific Request
**File:** `src/lib/mail.ts` — `renderHandoverRequestEmail`  
**Status:** ❌ Open  

**Problem:**
```ts
ctaText: "Review & Accept Handover Request →",
// ctaUrl defaults to BRAND.portalUrl — the homepage, not the request page
```
The CTA button in handover request emails takes the recipient to the portal **homepage** (`https://e-campus.faceprepcampus.com`), not to the specific request. The mentor then has to navigate to find the handover request manually.

**Fix:** Pass the request ID as a deep link:
```ts
// In requests/route.ts when sending the email:
htmlBody: renderHandoverRequestEmail({
  ...,
  ctaUrl: `${process.env.NEXT_PUBLIC_APP_URL}/mentor/requests?highlight=${newId}`
})
```
Add an optional `ctaUrl` parameter to `renderHandoverRequestEmail`:
```ts
export function renderHandoverRequestEmail(data: {
  ...,
  ctaUrl?: string; // ← add this
}) {
  return renderEmailShell({
    ...,
    ctaText: "Review & Accept Handover Request →",
    ctaUrl: data.ctaUrl || BRAND.portalUrl
  });
}
```

---

### MAIL-M04 · `POST /api/requests/faculty-leave` Fires Emails for Every Cover Mentor Synchronously
**File:** `src/app/api/requests/faculty-leave/route.ts` ~line 596  
**Status:** ❌ Open  

**Problem:**
```ts
if (Array.isArray(coverSelections) && coverSelections.length > 0) {
  for (const sel of coverSelections) {
    // ...create handover record...
    if (coverMentor.email) {
      await sendMail({ ... }); // ← blocking, per mentor, inside loop
    }
  }
}
```
For a 5-day leave with 10 daily periods, this fires 10 sequential `sendMail()` calls before returning the response — potentially adding 5+ seconds to the leave submission response time (or timing out).

**Fix:** Fire emails asynchronously after the response:
```ts
// Return the response first, then fire emails
const emailPromises = createdHandovers.map(h =>
  sendMail({ to: h.coverEmail, subject: ..., htmlBody: ... }).catch(console.error)
);
// Don't await — let them run in background
// (or use Promise.allSettled for monitoring)
Promise.allSettled(emailPromises).catch(console.error);

return NextResponse.json({ success: true, ... });
```

---

### MAIL-M05 · `renderEmailShell` Has No Plain Text Alternative
**File:** `src/lib/mail.ts`  
**Status:** ❌ Open  

**Problem:**
`sendMail` only sends `htmlContent`/`html` — there is no `text` (plain text) alternative part. RFC 2822-compliant email clients expect a `multipart/alternative` with both HTML and plain text:
- **Email clients with images blocked** show a blank email — no fallback text
- **Spam filters** often flag HTML-only emails more aggressively
- **Screen readers and accessibility** rely on plain text parts

**Fix:** Add a text extractor and pass both:
```ts
function htmlToPlainText(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

// In SMTP path:
await transporter.sendMail({
  from: ...,
  to: ...,
  subject,
  html: htmlBody,
  text: htmlToPlainText(htmlBody), // ← add this
});

// In Brevo API path:
body: JSON.stringify({
  ...,
  htmlContent: htmlBody,
  textContent: htmlToPlainText(htmlBody), // ← add this (Brevo supports this field)
})
```

---

### MAIL-M06 · `POST /api/requests/review` — `classGroup` Hardcoded as `"General"` in Both Email Templates
**File:** `src/app/api/requests/review/route.ts` ~line 352–360  
**Status:** ❌ Open  

**Problem:**
```ts
const htmlBody = status === "approved"
  ? renderHandoverApprovalEmail({
      ...,
      classGroup: "General", // ← hardcoded
    })
  : renderHandoverRejectionEmail({
      ...,
      classGroup: "General", // ← hardcoded
    });
```
The approval/rejection emails always show "General" as the class group, regardless of the actual class. The real value is available in `handoverRequest.classGroup`.

**Fix:**
```ts
classGroup: handoverRequest.classGroup || "General",
```

---

### MAIL-M07 · `POST /api/daily-configs` — Auto-Adapt Email Sends Individual Emails to Mentors Without Checking Mailing Toggle First
**File:** `src/app/api/daily-configs/route.ts` ~handleAutoAdaptNextWeek  
**Status:** ❌ Open  

**Problem:**
The `handleAutoAdaptNextWeek` function calls `sendMail()` for each mentor. `sendMail()` itself checks the global mailing toggle — that part is fine. BUT the function also inserts `notifications` into the DB for every user unconditionally. If the admin has mailing disabled, the in-app notifications still fire. This is actually desirable, BUT the notifications reference email-style content (`"Please review your timetable"`) rather than portal-native content. This is minor.

The bigger issue is that `handleAutoAdaptNextWeek` uses `new Date().toISOString().split("T")[0]` for date calculations which has the UTC/IST offset bug (see BE-H01).

**Fix:** Replace `toISOString().split("T")[0]` with `toLocaleDateString("en-CA")` in the date generation loops.

---

### MAIL-M08 · `formatZentraEmail` Legacy Alias Still Exposes `"zentra"` in Codebase
**File:** `src/lib/mail.ts` ~line 140  
**Status:** ⚠️ Minor  

**Problem:**
```ts
export function formatZentraEmail(opts: { ... }) {
  return renderEmailShell(opts);
}
```
`formatZentraEmail` is used in `daily-configs/route.ts` and `student-tracker/route.ts`. The name embeds the internal codename "Zentra" and may confuse new developers who don't realize it's just a wrapper. The function is identical to `renderEmailShell`.

**Fix:** Migrate all callers to use `renderEmailShell` directly and deprecate `formatZentraEmail`:
```ts
// src/app/api/daily-configs/route.ts
import { sendMail, renderEmailShell } from "@/lib/mail"; // replace formatZentraEmail

// src/app/api/student-tracker/route.ts
import { sendMail, renderEmailShell } from "@/lib/mail";
```
Then remove `formatZentraEmail` from `mail.ts`.

---

### MAIL-M09 · `POST /api/requests/review` — `NOW()` Used in SQLite Context
**File:** `src/app/api/requests/review/route.ts` ~line 216  
**Status:** ❌ Open  

**Problem:**
```sql
UPDATE faculty_leave_requests 
SET status = 'approved', approved_by = ?, updated_at = NOW() 
WHERE id = ?
```
`NOW()` is a PostgreSQL/MySQL function. SQLite/libSQL uses `CURRENT_TIMESTAMP` or `datetime('now')`. This will throw a silent runtime error in Turso.

**Fix:**
```sql
UPDATE faculty_leave_requests 
SET status = 'approved', approved_by = ?, updated_at = CURRENT_TIMESTAMP
WHERE id = ?
```
This same `NOW()` usage appears in `faculty-leave/route.ts` in at least 8 places — all need to be replaced.

---

### MAIL-M10 · Email Subject Prefix `[FACE Prep E-Campus]` Is Not Configurable
**Files:** All route files using `sendMail`  
**Status:** ⚠️ Minor  

**Problem:**
Every email subject is prefixed with `[FACE Prep E-Campus]` as a raw string literal scattered across routes:
```ts
subject: `[FACE Prep E-Campus] New Class Handover Request - ${course}`
subject: `[FACE Prep E-Campus] Next Week Schedule Auto-Configured`
subject: `[FACE Prep E-Campus] Campus Schedule Update - ${dateStr}`
```
If the product ever gets white-labeled or rebranded, this requires finding and replacing 10+ subject strings.

**Fix:** Add to `BRAND` constant in `mail.ts`:
```ts
const BRAND = {
  ...,
  emailPrefix: "[FACE Prep E-Campus]",
};

export { BRAND }; // export so routes can use it
```
Then in routes:
```ts
import { BRAND } from "@/lib/mail";
subject: `${BRAND.emailPrefix} New Class Handover Request - ${course}`
```

---

## 🟢 LOW Issues

---

### MAIL-L01 · `student-tracker/route.ts` Uses `formatZentraEmail` — Email Sent to `recipientList` Without Null Check
**File:** `src/app/api/student-tracker/route.ts` ~line 69  
**Status:** ❌ Open  

**Problem:**
```ts
const recipientList = [studentEmail, mentorEmail].filter(Boolean).join(", ");
await sendMail({ to: recipientList, subject: mailSubject, htmlBody });
```
If both `studentEmail` and `mentorEmail` are null/undefined, `recipientList = ""`. `sendMail` then hits the `!to || !to.includes("@")` guard and returns `{ success: false }` — which is silently ignored since there's no error check on the return value.

**Fix:**
```ts
if (!recipientList) {
  console.warn("No valid recipients for task assignment email — skipping");
} else {
  await sendMail({ to: recipientList, subject: mailSubject, htmlBody });
}
```

---

### MAIL-L02 · `renderDemoComplianceEmail` Is Defined but Never Called From Any Route
**File:** `src/lib/mail.ts` ~line 363  
**Status:** ⚠️ Unused  

**Problem:**
`renderDemoComplianceEmail` is exported and documented with a specific comment saying it's "fired from `/api/demo-sessions` action=evaluate" — but no current route file imports or calls it.

**Fix:** Either:
1. Wire it up in `/api/demo-sessions` as intended, OR
2. Add it to the `ALLOWED_TEMPLATES` in `send-mail/route.ts` so it can be triggered manually, OR
3. Delete it if the feature was abandoned

---

### MAIL-L03 · GAS Webhook Fallback Sends Raw `htmlBody` Over HTTP — No Encryption Check
**File:** `src/lib/mail.ts` ~line 469  
**Status:** ⚠️ Security  

**Problem:**
```ts
const res = await fetch(gasUrl, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ to: recipients.join(","), subject, htmlBody }),
});
```
`gasUrl` comes from `process.env.NEXT_PUBLIC_GAS_MAIL_URL`. If this env var accidentally contains an `http://` URL (not `https://`), all email content (recipient addresses, notification content) is sent over plaintext HTTP.

**Fix:**
```ts
if (!gasUrl.startsWith("https://")) {
  console.error("GAS_MAIL_URL must use HTTPS — fallback skipped");
  // skip the GAS fallback
} else {
  const res = await fetch(gasUrl, { ... });
}
```

---

### MAIL-L04 · No Email Unsubscribe Header — CAN-SPAM / GDPR Risk
**File:** `src/lib/mail.ts` — `sendMail`  
**Status:** ⚠️ Compliance  

**Problem:**
Transactional emails (handover requests, schedule updates) don't include `List-Unsubscribe` headers. While operational notifications (unlike marketing) are partially exempt, best practice and increasing spam filter strictness mean these should include an unsubscribe mechanism.

**Fix:** Add headers to Brevo and SMTP calls:
```ts
// Brevo API:
body: JSON.stringify({
  ...,
  headers: {
    "List-Unsubscribe": `<${BRAND.portalUrl}/notifications/settings>`,
    "X-Mailer": "FACE Prep E-Campus Notifications"
  }
})

// SMTP nodemailer:
await transporter.sendMail({
  ...,
  headers: {
    "List-Unsubscribe": `<${BRAND.portalUrl}/notifications/settings>`
  }
});
```

---

### MAIL-L05 · `renderEmailShell` `badgeColor` Parameter Has a Type Bug
**File:** `src/lib/mail.ts` — `renderHandoverRejectionEmail`  
**Status:** ❌ Open  

**Problem:**
```ts
export function renderHandoverRejectionEmail(data: {
  ...
  rejectionReason?: string;
}) {
  return renderEmailShell({
    ...,
    badgeColor: "rose",   // ← correct
```
In `formatZentraEmail` (the legacy wrapper), the type is:
```ts
badgeColor: "indigo" | "emerald" | "amber" | "rose"  // ← missing "purple"
```
But `renderEmailShell` accepts `BadgeColor = "indigo" | "emerald" | "amber" | "rose" | "purple"`. So `formatZentraEmail` callers who try to pass `"purple"` get a TypeScript error.

**Fix:**
```ts
export function formatZentraEmail(opts: {
  ...,
  badgeColor: BadgeColor; // ← use the exported type, not inline union
}) {
  return renderEmailShell(opts);
}
```

---

## Summary

| ID | Severity | Issue |
|----|----------|-------|
| MAIL-C01 | 🔴 CRITICAL | Logo image from external Vercel — will break when deployment goes away |
| MAIL-C02 | 🔴 CRITICAL | `ANY(?::text[])` PostgreSQL syntax in SQLite — cover enrichment silently returns empty |
| MAIL-C03 | 🔴 CRITICAL | Review email sent to SUPER_ADMIN when mentor email missing |
| MAIL-C04 | 🔴 CRITICAL | Leave notification sent to `cam@zentra.edu` hardcoded fallback |
| MAIL-C05 | 🔴 CRITICAL | Bulk mentor emails have no rate limiting — hits Brevo limits silently |
| MAIL-H01 | 🔴 HIGH | `GET /api/requests` has no auth — all handover data is public |
| MAIL-H02 | 🔴 HIGH | `POST /api/daily-configs` has no auth — schedule manipulation + spam trigger |
| MAIL-H03 | 🔴 HIGH | Email failures silently swallowed — no audit log, no admin alert |
| MAIL-H04 | 🔴 HIGH | Date range config fires one email per mentor per call — duplicate emails |
| MAIL-H05 | 🔴 HIGH | Footer copyright year hardcoded `2026` — stale from 2027 onwards |
| MAIL-H06 | 🔴 HIGH | Interview notification email loop has no error handling per-row |
| MAIL-M01 | 🟡 MEDIUM | Audit BCC added as full `To:` recipient — visible to all, replies go to all |
| MAIL-M02 | 🟡 MEDIUM | `getDbSafe()` called inside recipient validation loop |
| MAIL-M03 | 🟡 MEDIUM | Handover request CTA links to homepage, not the specific request |
| MAIL-M04 | 🟡 MEDIUM | Leave cover emails fire synchronously in loop — response delayed 5+ sec |
| MAIL-M05 | 🟡 MEDIUM | No plain text alternative — spam risk + accessibility |
| MAIL-M06 | 🟡 MEDIUM | `classGroup: "General"` hardcoded in review email templates |
| MAIL-M07 | 🟡 MEDIUM | Auto-adapt uses UTC date (IST bug) in date loop |
| MAIL-M08 | 🟡 MEDIUM | `formatZentraEmail` legacy name still in use — should migrate to `renderEmailShell` |
| MAIL-M09 | 🟡 MEDIUM | `NOW()` SQL function used in SQLite/Turso — should be `CURRENT_TIMESTAMP` |
| MAIL-M10 | 🟡 MEDIUM | Email subject prefix `[FACE Prep E-Campus]` scattered across 10 files |
| MAIL-L01 | 🟢 LOW | student-tracker email sent even when `recipientList` is empty |
| MAIL-L02 | 🟢 LOW | `renderDemoComplianceEmail` defined but never called |
| MAIL-L03 | 🟢 LOW | GAS webhook fallback doesn't validate `https://` before sending content |
| MAIL-L04 | 🟢 LOW | No `List-Unsubscribe` header — CAN-SPAM / GDPR compliance gap |
| MAIL-L05 | 🟢 LOW | `formatZentraEmail` type excludes `"purple"` badge color |

**Total: 25 issues** (6 Critical · 6 High · 10 Medium · 5 Low)

---

## Fix Priority Queue

```
Immediate (production blockers):
  MAIL-C01  Fix logo URL to use production domain or inline base64
  MAIL-C02  Fix ANY(?::text[]) → IN (?,?,?) for cover enrichment
  MAIL-C03  Skip email instead of sending to super admin when mentor email missing
  MAIL-C04  Skip email instead of sending to cam@zentra.edu
  MAIL-H01  Add requireAuth to GET /api/requests
  MAIL-H02  Add requireAuth to POST /api/daily-configs
  MAIL-H03  Log email failures to audit_logs + surface in API response

Short-term:
  MAIL-C05  Batch bulk mentor emails — single Brevo call with multiple `to` entries
  MAIL-M01  Change audit BCC from To: to proper BCC: field
  MAIL-M09  Replace all NOW() with CURRENT_TIMESTAMP (SQLite compatible)
  MAIL-M04  Fire cover notification emails async (don't block response)
  MAIL-H05  Dynamic copyright year in email footer

Polish:
  MAIL-M05  Add plain text alternative to all emails
  MAIL-M03  Pass deep-link request URL to handover email CTA
  MAIL-M06  Use handoverRequest.classGroup instead of "General"
  MAIL-M08  Migrate formatZentraEmail → renderEmailShell everywhere
  MAIL-M10  Centralise email subject prefix in BRAND constant
  MAIL-M02  Move getDbSafe() outside validation loop
  MAIL-M07  Fix UTC date bug in auto-adapt date loop
  MAIL-H06  Add per-row error handling in interview notification loop

Compliance:
  MAIL-L04  Add List-Unsubscribe headers

Cleanup:
  MAIL-L01  Guard empty recipientList in student-tracker
  MAIL-L02  Wire up renderDemoComplianceEmail or remove it
  MAIL-L03  Validate https:// in GAS webhook URL
  MAIL-L05  Fix formatZentraEmail badgeColor type
```

---

## Shared Fix: Async Email Helper

Create `src/lib/mailAsync.ts` to wrap fire-and-forget emails:

```ts
import { sendMail } from "./mail";
import { getDb } from "./db";

interface MailJob {
  to: string;
  subject: string;
  htmlBody: string;
  context?: string; // for audit logging
}

/**
 * Fire-and-forget email dispatch.
 * - Does NOT block the caller
 * - Logs failures to audit_logs
 * - Respects the global mailing toggle (handled by sendMail internally)
 */
export function sendMailAsync(job: MailJob): void {
  sendMail(job)
    .then(async result => {
      if (!result.success && !result.disabled && !result.mocked) {
        const db = await getDb();
        await db.run(
          "INSERT INTO audit_logs (id, type, description, actorName, actorRole, timestamp) VALUES (?, 'mail_failure', ?, 'System', 'System', ?)",
          [`mail_fail_${Date.now()}`, `Email to ${job.to} failed (${job.context || ""}): ${result.error}`, new Date().toISOString()]
        ).catch(() => {});
      }
    })
    .catch(err => {
      console.error(`sendMailAsync unhandled error (${job.context}):`, err);
    });
}

/**
 * Batch email dispatch — fans out to multiple recipients efficiently.
 * Respects Brevo's 50-recipient per-call limit.
 */
export async function sendMailBatch(jobs: MailJob[]): Promise<void> {
  // Group by identical subject+body → combine recipients
  const BREVO_MAX_RECIPIENTS = 50;
  for (let i = 0; i < jobs.length; i += BREVO_MAX_RECIPIENTS) {
    const chunk = jobs.slice(i, i + BREVO_MAX_RECIPIENTS);
    const combinedTo = chunk.map(j => j.to).filter(Boolean).join(",");
    if (combinedTo) {
      sendMailAsync({
        to: combinedTo,
        subject: chunk[0].subject,
        htmlBody: chunk[0].htmlBody,
        context: `batch_${i}`
      });
    }
  }
}
```


---

## ✅ Second Pass — Additional Findings From All Remaining Routes

---

## 🔴 CRITICAL — Second Pass

---

### MAIL-C06 · `POST /api/requests/swap` — Uses UTC Date for "Future Date" Guard
**File:** `src/app/api/requests/swap/route.ts` ~line ~60  
**Status:** ❌ Open  

**Problem:**
```ts
const todayStr = new Date().toISOString().slice(0, 10); // UTC — wrong after 18:30 IST
if (offerDateStr < todayStr) {
  return NextResponse.json({ success: false, message: "You can only offer to cover future slots..." }, { status: 400 });
}
```
Same UTC/IST offset bug as BE-H01. After 6:30 PM IST, offering a same-day slot as compensation gets blocked as "past date" even though the date is correct.

**Fix:**
```ts
const todayStr = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit"
}).format(new Date());
```

---

### MAIL-C07 · `POST /api/announcements` — No Email Notification Sent on Announcement Creation
**File:** `src/app/api/announcements/route.ts`  
**Status:** ❌ Open  

**Problem:**
The announcements POST handler creates the announcement in the DB but **never sends email notifications to any user**. Announcements targeted to `"All"`, `"Mentor"`, or `"Student"` roles silently exist in the DB with no outbound notification. Users only see them if they actively open the portal. The `renderAnnouncementEmail` template exists in `mail.ts` precisely for this purpose but is never called from this route.

**Fix:** After creating the announcement, dispatch emails to target recipients:
```ts
// After INSERT:
const targetEmails: string[] = [];
if (target_role === "All" || target_role === "Mentor") {
  const mentors = await db.all(
    college_id
      ? "SELECT email FROM mentors WHERE college_id = ? AND email IS NOT NULL"
      : "SELECT email FROM mentors WHERE email IS NOT NULL",
    college_id ? [college_id] : []
  );
  mentors.forEach((m: any) => { if (m.email) targetEmails.push(m.email); });
}
// Use sendMailBatch() to fan out without blocking response
```
Use the existing `renderAnnouncementEmail` template.

---

### MAIL-C08 · `POST /api/demo-sessions` action=`"reschedule"` — No Email to SME or L&D Team
**File:** `src/app/api/demo-sessions/route.ts` ~line 334  
**Status:** ❌ Open  

**Problem:**
When a mentor requests a demo reschedule, the handler:
1. Creates a `demo_reallocation_requests` DB record
2. Inserts in-app notifications for `campus_managers` table rows

But **does not send any email** to the L&D team or the assigned SME about the reschedule request. The SME's slot gets freed but they have no email notification. The L&D team only sees an in-app bell notification.

**Fix:**
```ts
// After creating the reallocation request:
// 1. Email the assigned SME
const smeRow = await db.get("SELECT email, name FROM sme_users WHERE id = ?", [session.smeId]);
if (smeRow?.email) {
  await sendMail({
    to: smeRow.email,
    subject: `[Demo Rescheduled] ${session.mentorName} — ${session.subject}`,
    htmlBody: renderEmailShell({
      title: "L&D Session Reschedule Request",
      badgeText: "RESCHEDULE PENDING",
      badgeColor: "amber",
      description: `Mentor ${session.mentorName} has requested to reschedule their L&D session.`,
      details: [
        { label: "Original Date", value: `${session.dateStr} • ${session.timeSlot}` },
        { label: "Proposed Date", value: `${newDateStr} • ${newTimeSlot}` },
        { label: "Subject", value: session.subject },
        { label: "Reason", value: rescheduleComments || "Not specified" }
      ],
      ctaText: "View in L&D Dashboard →"
    })
  });
}
```

---

### MAIL-C09 · `POST /api/demo-sessions` action=`"book"` — No Email to Mentor About Booking
**File:** `src/app/api/demo-sessions/route.ts` ~line 130  
**Status:** ❌ Open  

**Problem:**
When L&D books a demo session for a mentor with an SME, **neither the mentor nor the SME receives any email notification**. They only find out through in-app notifications if they check the portal. Mentors may miss their allocated L&D date if they don't check the bell icon.

**Fix:**
```ts
// After INSERT:
const mentorRow = await db.get("SELECT email, name FROM mentors WHERE id = ?", [mentorId]);
const smeRow = await db.get("SELECT email, name FROM sme_users WHERE id = ?", [smeId]);

const bookingDetails = [
  { label: "Mentor", value: mentorName, highlight: true },
  { label: "SME Evaluator", value: smeName },
  { label: "Subject", value: subject },
  { label: "Date & Time", value: `${dateStr} • ${timeSlot}` }
];

if (mentorRow?.email) {
  await sendMail({
    to: mentorRow.email,
    subject: `[L&D Session Scheduled] ${subject} — ${dateStr}`,
    htmlBody: renderEmailShell({
      title: "Your L&D Evaluation Has Been Scheduled",
      badgeText: "L&D SESSION BOOKED",
      badgeColor: "indigo",
      description: `Dear ${mentorName}, your Learning & Development demo evaluation session has been scheduled.`,
      details: bookingDetails,
      ctaText: "View Schedule in Dashboard →"
    })
  });
}
```

---

## 🔴 HIGH — Second Pass

---

### MAIL-H07 · `POST /api/requests/swap` — No Auth
**File:** `src/app/api/requests/swap/route.ts`  
**Status:** ❌ Open  

**Problem:**
No `requireAuth` at the start of the POST handler. Any unauthenticated caller can create swap compensation offers between any two mentors.

**Fix:**
```ts
const { auth, errorResponse } = await requireAuth(request, {
  allowedRoles: ["mentor", "cm", "admin"],
  checkCsrf: true
});
if (errorResponse) return errorResponse;
```

---

### MAIL-H08 · `POST /api/demo-sessions/action=demo-swap/resolve` — No Email to Mentor on Approval/Rejection
**File:** `src/app/api/requests/demo-swap/route.ts` ~line 150  
**Status:** ❌ Open  

**Problem:**
When a demo swap is approved or rejected, the handler updates the DB and creates audit logs but **sends no email to the original requestor mentor**. The mentor has no way to know their swap was approved/rejected without checking the portal.

**Fix:**
```ts
// After resolving the swap:
const requestorMentor = await db.get("SELECT email, name FROM mentors WHERE id = ?", [req.mentorId]);
if (requestorMentor?.email) {
  await sendMail({
    to: requestorMentor.email,
    subject: `[Demo Swap ${status === "approved" ? "Approved" : "Rejected"}] ${req.subject}`,
    htmlBody: renderHandoverApprovalEmail({  // reuse appropriate template
      requestorName: req.mentorName,
      coverStaffName: req.proposedMentorName || req.mentorName,
      dateStr: req.proposedDateStr || req.dateStr,
      time: req.proposedTimeSlot || req.timeSlot,
      course: req.subject,
      classGroup: "L&D Session",
      reviewerName: "Learning & Development"
    })
  });
}
```

---

### MAIL-H09 · `GET /api/requests/demo-swap` — No Auth
**File:** `src/app/api/requests/demo-swap/route.ts`  
**Status:** ❌ Open  

**Problem:**
```ts
export async function GET() {
  const db = await getDb();
  const requests = await db.all("SELECT * FROM demo_swap_requests ORDER BY created_at DESC");
```
No auth at all — returns all demo swap requests system-wide to any unauthenticated caller.

**Fix:**
```ts
export async function GET(request: Request) {
  const { auth, errorResponse } = await requireAuth(request, { checkCsrf: false });
  if (errorResponse) return errorResponse;
  // ...
```

---

### MAIL-H10 · `POST /api/requests/leave` POST/PUT — No Auth
**File:** `src/app/api/requests/leave/route.ts`  
**Status:** ❌ Open  

**Problem:**
Neither the `POST` (student submits leave) nor the `PUT` (CM approves leave) handler has `requireAuth`. Any unauthenticated caller can:
- Submit fake leave requests for any student
- Approve/reject any leave request

**Fix:** Add `requireAuth` to both handlers:
```ts
// POST: students can submit for themselves
const { auth, errorResponse } = await requireAuth(request, {
  allowedRoles: ["student"], checkCsrf: true
});

// PUT: only CM/mentor/admin can approve
const { auth, errorResponse } = await requireAuth(request, {
  allowedRoles: ["cm", "mentor", "admin"], checkCsrf: true
});
```

---

### MAIL-H11 · `GET /api/requests/leave` — No Auth
**File:** `src/app/api/requests/leave/route.ts`  
**Status:** ❌ Open  

**Problem:**
The GET handler has no `requireAuth`. All student leave requests with student names, class groups, and reasons are accessible to unauthenticated callers.

---

### MAIL-H12 · `POST /api/announcements` GET/POST/DELETE — No Auth
**File:** `src/app/api/announcements/route.ts`  
**Status:** ❌ Open  

**Problem:**
All three announcement handlers (GET, POST, DELETE) have no auth. Anyone can create, read, or delete campus announcements. Given the new MAIL-C07 fix that would send emails on creation, this becomes a **critical spam vector** — unauthenticated attackers could create announcements and trigger bulk emails to all mentors and students.

**Fix:**
```ts
// GET: authenticated users only
const { auth, errorResponse } = await requireAuth(request, { checkCsrf: false });

// POST/DELETE: admin/cam/kam only
const { auth, errorResponse } = await requireAuth(request, {
  allowedRoles: ["admin", "cm", "kam"], checkCsrf: true
});
```

---

### MAIL-H13 · `student-tracker` Task Assignment Email Has Wrong Fallback Recipient
**File:** `src/app/api/student-tracker/route.ts` ~line 55  
**Status:** ❌ Open  

**Problem:**
```ts
const opsFallback = process.env.SUPER_ADMIN_EMAIL || process.env.BREVO_SENDER_EMAIL || "";
const recipientList = studentEmails.length > 0 ? studentEmails.join(",") : opsFallback;
```
When a class has no students with emails, the task assignment notification is sent to the `SUPER_ADMIN_EMAIL` (or even worse, `BREVO_SENDER_EMAIL` — the sender address itself). The admin's inbox receives hundreds of task assignment emails meant for students.

**Fix:**
```ts
if (studentEmails.length === 0) {
  console.warn(`No student emails found for classGroup "${classGroup}" — task notification skipped`);
  return; // skip email entirely
}
const recipientList = studentEmails.join(",");
```

---

### MAIL-H14 · `interview-notifications.ts` — No Error Recovery If `generateId` Import Fails
**File:** `src/lib/interview-notifications.ts` ~line 5  
**Status:** ❌ Open  

**Problem:**
```ts
import { generateId } from "@/lib/id";
```
This import assumes `src/lib/id.ts` exists. If `id.ts` hasn't been created yet (it's defined in the fix plan for MD-M11 but doesn't exist yet), this import causes a runtime error and **all external interview notifications fail silently** — the entire `dispatchExternalInterviewNotifications` function returns nothing.

**Fix (temporary):** Add a fallback if the import fails:
```ts
// If @/lib/id doesn't exist yet, inline the ID generation:
const generateId = (prefix: string) =>
  `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
```
This is already the same pattern used everywhere else, so it's a safe inline fallback until `id.ts` is created.

---

### MAIL-H15 · `POST /api/student-tracker` — No Auth
**File:** `src/app/api/student-tracker/route.ts`  
**Status:** ❌ Open  

**Problem:**
No `requireAuth`. Any unauthenticated caller can:
- Assign tasks to any class (action=`assign_task`) → triggers bulk student emails
- Grade any student's weekly tracker entry (action=`grade_entry`)

**Fix:**
```ts
// assign_task: mentor/cm/admin only
const { auth, errorResponse } = await requireAuth(request, {
  allowedRoles: ["mentor", "cm", "admin"], checkCsrf: true
});
```

---

## 🟡 MEDIUM — Second Pass

---

### MAIL-M11 · `POST /api/requests/leave` — Email Sent to ALL Campus Mentors as Fallback
**File:** `src/app/api/requests/leave/route.ts` ~line 155  
**Status:** ❌ Open  

**Problem:**
```ts
// Fallback to all mentors of college
const mentors = await db.all("SELECT email FROM mentors WHERE college_id = ?", [collegeId]);
targetEmails.push(...mentors.map((m: any) => m.email).filter(Boolean));
```
When no class teacher is assigned, the student leave notification goes to **every single mentor in the campus**. A campus with 80 mentors all receive a leave email for a student they've never taught.

**Fix:** Only email the direct class teacher. If none assigned, notify the CM only — not all mentors:
```ts
if (assignedClassTeacher?.email) {
  targetEmails.push(assignedClassTeacher.email);
} else {
  // Notify CM only, not all mentors
  const cm = await db.get("SELECT email FROM campus_managers WHERE college_id = ? LIMIT 1", [collegeId]);
  if (cm?.email) targetEmails.push(cm.email);
}
```

---

### MAIL-M12 · `POST /api/demo-sessions` action=`"evaluate"` — Sends Two Separate Emails for CC
**File:** `src/app/api/demo-sessions/route.ts` ~line 255  
**Status:** ❌ Open  

**Problem:**
```ts
// Note: sendMail does not support CC; include SME in the To list instead.
if (dedupCc.length > 0) {
  await sendMail({
    to: dedupCc.join(","),
    subject: `[Demo Compliance Gap] ...`,
    htmlBody: renderDemoComplianceEmail({ recipientName: session.smeName, ... })
  });
}
```
Two separate `sendMail` calls with slightly different `recipientName` values ("Key Account Manager / Campus Manager" vs SME name). The result is two Brevo API calls for what could be one. This doubles billing and creates delivery latency.

**Fix:** Add CC support to `sendMail`:
```ts
export async function sendMail({ to, subject, htmlBody, cc }: {
  to: string; subject: string; htmlBody: string; cc?: string;
}) {
  // In Brevo API call:
  body: JSON.stringify({
    sender: { name: senderName, email: senderEmail },
    to: toList,
    cc: cc ? cc.split(",").map(e => ({ email: e.trim() })).filter(e => e.email) : undefined,
    subject,
    htmlContent: htmlBody
  })
}
```
Then use:
```ts
await sendMail({
  to: dedupTo.join(","),
  cc: dedupCc.join(","),
  subject: `[Demo Compliance Gap] ...`,
  htmlBody: html
});
```

---

### MAIL-M13 · `interview-notifications.ts` — `actorName` Default is `"Campus Manager"` (Generic)
**File:** `src/lib/interview-notifications.ts` ~line 47  
**Status:** ❌ Open  

**Problem:**
```ts
actorName = "Campus Manager"
```
Same issue as MD-M17 — generic default already documented. Adding here because the fix must also update `interview-notifications.ts`.

---

### MAIL-M14 · `student-tracker` Uses `formatZentraEmail` Instead of `renderEmailShell` Directly
**File:** `src/app/api/student-tracker/route.ts` ~line 54  
**Status:** ⚠️ Minor  

**Problem:**
```ts
import { sendMail, formatZentraEmail } from "@/lib/mail";
// ...
const htmlBody = formatZentraEmail({ ... });
```
Uses the deprecated `formatZentraEmail` alias. Should migrate to `renderEmailShell`.

---

### MAIL-M15 · `POST /api/mentors` / `POST /api/cam` — No Welcome Email on Account Creation
**Files:**  
- `src/app/api/mentors/route.ts`  
- `src/app/api/cam/route.ts`  
**Status:** ❌ Open  

**Problem:**
When a new mentor or CAM is created, no welcome email is sent with their login credentials. The admin has to manually communicate the email/password to the new user out-of-band.

**Fix:**
```ts
// After creating the user record in mentors/cam:
if (cleanEmail && cleanEmail.includes("@")) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://e-campus.faceprepcampus.com";
  await sendMail({
    to: cleanEmail,
    subject: `[Welcome] Your FACE Prep E-Campus Account`,
    htmlBody: renderEmailShell({
      title: "Welcome to FACE Prep E-Campus",
      badgeText: "ACCOUNT CREATED",
      badgeColor: "emerald",
      description: `Dear ${name}, your E-Campus account has been created. You can log in using the credentials below.`,
      details: [
        { label: "Login Email", value: cleanEmail, highlight: true },
        { label: "Temporary Password", value: DEFAULT_PASSWORD, highlight: true },
        { label: "Role", value: role === "cam" ? "Campus Manager" : "Faculty Mentor" },
        { label: "Action Required", value: "Please log in and change your password immediately." }
      ],
      ctaText: "Log In to E-Campus Portal →",
      ctaUrl: appUrl,
      footerText: "This is your official account activation notice. Keep your credentials secure."
    })
  }).catch(console.error);
}
```

---

### MAIL-M16 · `POST /api/requests/leave` PUT — `approvedBy` Field Not Validated (Can Be Injected)
**File:** `src/app/api/requests/leave/route.ts` ~line 240  
**Status:** ⚠️ Security  

**Problem:**
```ts
const resolverName = approvedBy || "Class Teacher / CAM";
```
`approvedBy` comes directly from the request body — any caller can pass `"approvedBy": "Principal"` or `"approvedBy": "Director"` to fake authority. Combined with MAIL-H10 (no auth), this allows impersonation.

**Fix:** After adding auth, derive `resolverName` from the authenticated user:
```ts
const resolverName = auth?.user?.name || approvedBy || "Class Teacher / CAM";
```

---

### MAIL-M17 · `GET /api/requests/leave` — Fallback Returns ALL Leave Requests When College Filter Returns 0
**File:** `src/app/api/requests/leave/route.ts` ~line 68  
**Status:** ❌ Open  

**Problem:**
```ts
// Fallback: If collegeId filter returned 0 rows but leave requests exist, return all
if ((!requests || requests.length === 0) && collegeId) {
  const allReqs = await db.all(`SELECT ... FROM leave_requests ... ORDER BY ... LIMIT 100`);
  requests = allReqs;
}
```
This "helpful" fallback means: if a CM's college has no leave requests, they see ALL leave requests from ALL colleges. A CM for one campus can read students' leave data from another campus.

**Fix:** Remove the fallback entirely. Return an empty array if the college has no requests:
```ts
// Remove the fallback block entirely
return NextResponse.json({ success: true, requests: normalizedRequests });
```

---

## 🟢 LOW — Second Pass

---

### MAIL-L06 · `GET /api/requests/demo-swap` — Returns ALL Swap Requests Without College Scoping
**File:** `src/app/api/requests/demo-swap/route.ts`  
**Status:** ⚠️ Data Leak  

**Problem:**
```ts
const requests = await db.all("SELECT * FROM demo_swap_requests ORDER BY created_at DESC");
```
No filtering by college — all mentors from all campuses can see all demo swap requests system-wide after auth is added.

**Fix:** Filter by the authenticated user's college scope:
```ts
const { auth } = await requireAuth(request, { checkCsrf: false });
// Filter by auth.collegeId
```

---

### MAIL-L07 · `student-tracker` Grade Entry — No Email to Student on Grading
**File:** `src/app/api/student-tracker/route.ts` PUT handler  
**Status:** ❌ Open  

**Problem:**
When a mentor grades a student's weekly task entry, the student receives no email notification. They only know their grade if they check the portal. This is a missing feedback loop.

**Fix:**
```ts
// After grading:
const student = await db.get("SELECT email, name FROM students WHERE id = ?", [studentId]);
if (student?.email && marks !== undefined && marks !== null) {
  await sendMail({
    to: student.email,
    subject: `[Weekly Task Graded] Week ${weekNumber} — ${subject}`,
    htmlBody: renderEmailShell({
      title: "Your Weekly Task Has Been Graded",
      badgeText: "MARKS PUBLISHED",
      badgeColor: marks >= 7 ? "emerald" : marks >= 5 ? "amber" : "rose",
      description: `Dear ${student.name}, your Week ${weekNumber} task for ${subject} has been evaluated.`,
      details: [
        { label: "Subject", value: subject },
        { label: "Week Number", value: `Week ${weekNumber}` },
        { label: "Marks Obtained", value: `${marks} / 10`, highlight: true },
        ...(gradedBy ? [{ label: "Graded By", value: gradedBy }] : [])
      ],
      ctaText: "View Full Scorecard →"
    })
  }).catch(console.error);
}
```

---

### MAIL-L08 · `interview-notifications.ts` — In-App Notification Loop Queries DB Per User
**File:** `src/lib/interview-notifications.ts` ~line 148  
**Status:** ⚠️ Performance  

**Problem:**
```ts
for (const userId of Array.from(notificationUserIds)) {
  const u = await db.get("SELECT role FROM users WHERE id = ?", userId); // per-user query
  await db.run("INSERT INTO notifications ..."); // per-user insert
}
```
If there are 50 affected users, this is 100 sequential DB queries (50 SELECT + 50 INSERT). For a multi-campus notification this can be several hundred queries.

**Fix:** Use a batch INSERT:
```ts
// Fetch all roles in one query
const userRoles = await db.all(
  `SELECT id, role FROM users WHERE id IN (${Array.from(notificationUserIds).map(() => "?").join(",")})`,
  Array.from(notificationUserIds)
);
const roleMap = new Map(userRoles.map(u => [u.id, u.role]));

// Batch insert
const notifRows = Array.from(notificationUserIds).map(userId => {
  const role = roleMap.get(userId) || "cm";
  const link = role === "mentor" ? "/mentor/interviews" : "/cm/interviews";
  return [`notif_ext_${Date.now()}_${userId.slice(-4)}`, userId, notifTitle, notifMsg, 0, link, now];
});
// Single INSERT with multiple value rows
```

---

### MAIL-L09 · `POST /api/requests/swap` Uses `renderDemoSwapEmail` for Class Swap (Misleading Template)
**File:** `src/app/api/requests/swap/route.ts` ~line 99  
**Status:** ⚠️ Minor  

**Problem:**
```ts
const htmlBody = renderDemoSwapEmail({
  requestorName: requestor.name,
  targetMentorName: targetStaff.name,
  dateStr: offerDateFormatted,
  time: `${offerSlot.time} (${offerSlot.day})`,
  course: offerSlot.course,
  classGroup: offerSlot.classGroup || "General"
});
```
`renderDemoSwapEmail` is designed for demo/L&D swap proposals, but this route handles **regular class slot swap compensation** (not L&D demos). The email says "Demo Swap Request Received" in the badge and title, which is wrong for a regular class cover compensation.

**Fix:** Create a `renderClassSwapEmail` template or use `renderHandoverRequestEmail` instead, or use `renderEmailShell` directly with correct copy:
```ts
const htmlBody = renderEmailShell({
  title: "Class Cover Compensation Offered",
  badgeText: "Swap Compensation",
  badgeColor: "indigo",
  description: `Dear ${targetStaff.name}, ${requestor.name} is offering to cover one of your classes as compensation for a previous handover.`,
  details: [...],
  ctaText: "Review & Accept Swap Offer →"
});
```

---

## Updated Complete Summary (42 issues total)

| ID | File | Sev | Issue |
|----|------|-----|-------|
| MAIL-C01 | mail.ts | 🔴 CRITICAL | Logo from external Vercel deploy |
| MAIL-C02 | faculty-leave/route.ts | 🔴 CRITICAL | `ANY(?::text[])` syntax breaks cover enrichment |
| MAIL-C03 | requests/review/route.ts | 🔴 CRITICAL | Review email sent to SUPER_ADMIN when mentor email missing |
| MAIL-C04 | faculty-leave/route.ts | 🔴 CRITICAL | Leave email sent to `cam@zentra.edu` fallback |
| MAIL-C05 | daily-configs/route.ts | 🔴 CRITICAL | Bulk mentor emails in for-loop — rate limit hit |
| **MAIL-C06** | requests/swap/route.ts | 🔴 CRITICAL | UTC date guard blocks same-day swaps after 18:30 IST |
| **MAIL-C07** | announcements/route.ts | 🔴 CRITICAL | No email on announcement creation — template exists but unused |
| **MAIL-C08** | demo-sessions/route.ts | 🔴 CRITICAL | No email on demo reschedule request — SME not notified |
| **MAIL-C09** | demo-sessions/route.ts | 🔴 CRITICAL | No email on demo session booking — mentor/SME not notified |
| MAIL-H01 | requests/route.ts | 🔴 HIGH | GET /api/requests — no auth |
| MAIL-H02 | daily-configs/route.ts | 🔴 HIGH | POST /api/daily-configs — no auth |
| MAIL-H03 | All routes | 🔴 HIGH | Email failures silently swallowed |
| MAIL-H04 | daily-configs/route.ts | 🔴 HIGH | Date range: one email per mentor per call |
| MAIL-H05 | mail.ts | 🔴 HIGH | Copyright year `2026` hardcoded |
| MAIL-H06 | interview-notifications.ts | 🔴 HIGH | DB insert loop no per-row error handling |
| **MAIL-H07** | requests/swap/route.ts | 🔴 HIGH | POST /api/requests/swap — no auth |
| **MAIL-H08** | requests/demo-swap/route.ts | 🔴 HIGH | No email to mentor on swap resolve |
| **MAIL-H09** | requests/demo-swap/route.ts | 🔴 HIGH | GET /api/requests/demo-swap — no auth |
| **MAIL-H10** | requests/leave/route.ts | 🔴 HIGH | POST + PUT — no auth |
| **MAIL-H11** | requests/leave/route.ts | 🔴 HIGH | GET — no auth |
| **MAIL-H12** | announcements/route.ts | 🔴 HIGH | GET + POST + DELETE — no auth (spam vector if C07 fixed) |
| **MAIL-H13** | student-tracker/route.ts | 🔴 HIGH | Wrong fallback recipient on no-email class |
| **MAIL-H14** | interview-notifications.ts | 🔴 HIGH | `generateId` import — crashes if id.ts missing |
| **MAIL-H15** | student-tracker/route.ts | 🔴 HIGH | POST + PUT — no auth |
| MAIL-M01 | mail.ts | 🟡 MEDIUM | Audit BCC added as full To: recipient |
| MAIL-M02 | send-mail/route.ts | 🟡 MEDIUM | `getDbSafe()` called inside loop |
| MAIL-M03 | All handover emails | 🟡 MEDIUM | CTA links to homepage, not specific request |
| MAIL-M04 | faculty-leave/route.ts | 🟡 MEDIUM | Cover emails fire synchronously, block response |
| MAIL-M05 | mail.ts | 🟡 MEDIUM | No plain text alternative in any email |
| MAIL-M06 | requests/review/route.ts | 🟡 MEDIUM | `classGroup: "General"` hardcoded |
| MAIL-M07 | daily-configs/route.ts | 🟡 MEDIUM | Auto-adapt uses UTC date in loops |
| MAIL-M08 | daily-configs + student-tracker | 🟡 MEDIUM | `formatZentraEmail` still used — should migrate |
| MAIL-M09 | requests/review/route.ts | 🟡 MEDIUM | `NOW()` not valid in SQLite |
| MAIL-M10 | All routes | 🟡 MEDIUM | Email subject prefix scattered in 10 files |
| **MAIL-M11** | requests/leave/route.ts | 🟡 MEDIUM | Fallback sends to ALL campus mentors (80+ emails) |
| **MAIL-M12** | demo-sessions/route.ts | 🟡 MEDIUM | Two separate sendMail calls instead of CC support |
| **MAIL-M13** | interview-notifications.ts | 🟡 MEDIUM | Generic `"Campus Manager"` default actorName |
| **MAIL-M14** | student-tracker/route.ts | 🟡 MEDIUM | `formatZentraEmail` instead of `renderEmailShell` |
| **MAIL-M15** | mentors/route.ts + cam/route.ts | 🟡 MEDIUM | No welcome email on account creation |
| **MAIL-M16** | requests/leave/route.ts | 🟡 MEDIUM | `approvedBy` injectable from request body |
| **MAIL-M17** | requests/leave/route.ts | 🟡 MEDIUM | Fallback returns ALL leave requests — data leak |
| MAIL-L01 | student-tracker/route.ts | 🟢 LOW | No guard for empty recipientList |
| MAIL-L02 | mail.ts | 🟢 LOW | `renderDemoComplianceEmail` never called from a route |
| MAIL-L03 | mail.ts | 🟢 LOW | GAS webhook no https:// validation |
| MAIL-L04 | mail.ts | 🟢 LOW | No List-Unsubscribe header |
| MAIL-L05 | mail.ts | 🟢 LOW | `formatZentraEmail` type missing `"purple"` |
| **MAIL-L06** | requests/demo-swap/route.ts | 🟢 LOW | Returns all swap requests, no college scope |
| **MAIL-L07** | student-tracker/route.ts | 🟢 LOW | No student email on task grading |
| **MAIL-L08** | interview-notifications.ts | 🟢 LOW | Per-user DB queries — needs batch INSERT |
| **MAIL-L09** | requests/swap/route.ts | 🟢 LOW | Wrong template used (demo template for class swap) |

**Grand total: 49 issues** (9 Critical · 15 High · 17 Medium · 8 Low)

---

## Updated Fix Priority Queue

```
IMMEDIATE — Critical security + broken core flows:
  MAIL-H10  Add auth to GET+POST+PUT /api/requests/leave
  MAIL-H11  (covered above)
  MAIL-H12  Add auth to GET+POST+DELETE /api/announcements
  MAIL-H07  Add auth to POST /api/requests/swap
  MAIL-H09  Add auth to GET /api/requests/demo-swap
  MAIL-H15  Add auth to POST+PUT /api/student-tracker
  MAIL-C01  Fix logo URL to production domain
  MAIL-C02  Fix ANY(?::text[]) → IN (?,?) in faculty-leave GET
  MAIL-C04  Skip email if CM not found (no cam@zentra.edu)
  MAIL-C03  Skip email if mentor email missing (no fallback to admin)
  MAIL-H13  Remove SUPER_ADMIN fallback from student-tracker

NEXT — Missing email triggers (users never notified):
  MAIL-C07  Add announcement email dispatch on creation
  MAIL-C08  Add email on demo reschedule to SME + L&D
  MAIL-C09  Add email on demo booking to mentor + SME
  MAIL-H08  Add email on demo swap resolve to requestor
  MAIL-L07  Add email to student on task grading
  MAIL-M15  Add welcome email on mentor/CAM account creation

SHORT-TERM — Fix bugs affecting delivery:
  MAIL-C05  Batch bulk mentor emails — single multi-recipient Brevo call
  MAIL-C06  Fix UTC date guard in swap route
  MAIL-M01  Change audit BCC from To: to proper BCC: field
  MAIL-M09  Replace NOW() with CURRENT_TIMESTAMP everywhere
  MAIL-M11  Fallback to CM-only email, not all mentors
  MAIL-M17  Remove leave requests cross-campus fallback
  MAIL-H03  Log email failures to audit_logs + surface in API response
  MAIL-M04  Fire cover emails async after returning response
  MAIL-M12  Add CC param to sendMail to avoid double send

POLISH:
  MAIL-M05  Add plain text alternative to emails
  MAIL-M03  Add deep-link CTAs to specific request pages
  MAIL-M06  Pass handoverRequest.classGroup instead of "General"
  MAIL-M08  Migrate formatZentraEmail → renderEmailShell
  MAIL-M10  Centralise email subject prefix in BRAND constant
  MAIL-M02  Move getDbSafe() outside loop in send-mail/route.ts
  MAIL-M07  Fix UTC date in daily-configs auto-adapt loop
  MAIL-H05  Dynamic copyright year in footer
  MAIL-L09  Use correct template in swap/route.ts

CLEANUP:
  MAIL-L04  Add List-Unsubscribe headers
  MAIL-L03  Validate https:// in GAS webhook
  MAIL-L05  Fix formatZentraEmail badge type
  MAIL-L06  Add college scope to demo-swap GET
  MAIL-L08  Batch DB INSERTs in interview-notifications
  MAIL-L02  Wire up renderDemoComplianceEmail or delete it
  MAIL-H14  Fix generateId import fallback in interview-notifications
  MAIL-H06  Add per-row error handling in interview notification loop
  MAIL-L01  Guard empty recipientList in student-tracker
```

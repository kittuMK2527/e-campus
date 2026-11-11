# Mock Data & Hardcoded Inline Data — Fix Plan
> Audited: October 2026 | Covers all src/components, src/context, src/app

---

## Categories

- **MOCK** — Fake/demo data shown to real users
- **STATIC_FALLBACK** — Hardcoded string used when real data is missing (masks bugs)
- **HARDCODED_CONFIG** — Values that should be dynamic or config-driven
- **TEMPLATE_DATA** — Sample rows in exported Excel/PDF (acceptable, but should use real dept names)

---

## 🔴 HIGH — Fake Data Visible to Real Users

---

### MD-H01 · Fake Google Meet Link Generated from Interview ID
**File:** `src/components/InterviewModule.tsx` ~line 418–423  
**Category:** MOCK  

**Problem:**  
When no `gmeet_link` exists on the interview record, a fake Meet URL is fabricated from the interview's ID string:
```ts
const code1 = rawId.slice(0, 3) || "abc";
const code2 = rawId.slice(3, 7) || "meet";
const code3 = rawId.slice(7, 10) || "eval";
return `https://meet.google.com/${code1}-${code2}-${code3}`;
// e.g. "int-ervi-ew_" → meet.google.com/int-ervi-ew_
```
Students and mentors click this "Join Live Google Meet" button and get a Google error page. The link looks real but leads nowhere.

**Fix:**
```ts
// Remove the fabrication entirely. Return null if no real link exists.
if (interview.status === "assigned" || ...) {
  return null; // ← was generating fake link
}
return null;
```
In the UI, show a "Meet link not yet assigned" state instead of a broken button:
```tsx
{sessionMeetLink ? (
  <a href={sessionMeetLink} target="_blank">Join Google Meet</a>
) : (
  <span className="text-gray-400 text-xs">Meet link not yet configured</span>
)}
```

---

### MD-H02 · Timetable Version Pre-Seeded with Hardcoded Mock History
**File:** `src/components/CAMDashboard.tsx` ~line 11179–11182  
**Category:** MOCK  

**Problem:**  
```ts
const [timetableVersions, setTimetableVersions] = useState<Array<{...}>>([
  { sem: "Semester I", ver: "v1.2", date: "2026-06-20" },   // ← fake
  { sem: "Semester III", ver: "v1.0", date: "2026-06-15" }  // ← fake
]);
```
Every CAM sees these two hardcoded version history entries from day one — even a brand-new campus with no published timetable. This looks like real data.

**Additional problem:** The `handlePublishTimetable` function generates a random version string:
```ts
const version = "v" + (1 + Math.random() * 2).toFixed(1); // ← "v1.7", "v2.3" etc.
```
This means publish #1 could be "v2.3" and publish #2 could be "v1.4" — non-sequential and meaningless.

**Fix:**
```ts
// Initialize empty — load from DB or derive from real publish history
const [timetableVersions, setTimetableVersions] = useState<Array<{...}>>([]);

// Use sequential versioning instead of random:
const nextVersion = `v${timetableVersions.filter(v => v.sem === sem).length + 1}.0`;
```
Ideally, save publish events to a `timetable_versions` DB table and load them on mount.

---

### MD-H03 · Fake Fee Form Pre-Fills with ₹25,000 "Semester 1 Tuition Fee"
**File:** `src/components/FeeManagerDashboard.tsx` ~line 191–193  
**Category:** MOCK  

**Problem:**  
```ts
const [newTermName, setNewTermName] = useState<string>("Semester 1 Tuition Fee");
const [newAmount, setNewAmount] = useState<string>("25000");
```
Every time a fee manager adds a new fee entry, the form pre-fills with "Semester 1 Tuition Fee" / ₹25,000. If the manager doesn't change these fields, real students receive fee entries with fake default data. After submit, the form resets to these same fake values:
```ts
setNewTermName("Semester 1 Tuition Fee"); // resets to fake
setNewAmount("25000");                     // resets to fake
```

**Fix:** Default to empty strings — force the manager to explicitly type values:
```ts
const [newTermName, setNewTermName] = useState<string>("");
const [newAmount, setNewAmount] = useState<string>("");
// On reset after submit:
setNewTermName("");
setNewAmount("");
```

---

### MD-H04 · Fee Manager Email Hardcoded as `fee.manager@zentra.edu` in Nav
**File:** `src/components/DashboardLayout.tsx` ~line 456  
**Category:** MOCK  

**Problem:**  
```ts
(currentRole === "fee_manager" && "fee.manager@zentra.edu") ||
```
The navigation header displays `fee.manager@zentra.edu` as the user's email for every fee manager — regardless of who is actually logged in.

**Fix:** Fee managers should have their email in a `currentFeeManager` context object (similar to how `currentCAM`, `currentMentor` etc. work):
```ts
// In AppContext, resolve the fee manager's actual email
(currentRole === "fee_manager" && currentUser?.email) ||
// Or use the general currentUser fallback already in context
```

---

### MD-H05 · Fake SVG Line Chart for "Scheduled Hours Trend" in Admin Overview
**File:** `src/components/AdminDashboard.tsx` ~line 3968–3975  
**Category:** MOCK  

**Problem:**  
The "Scheduled Hours Trend" chart in the Admin Overview KAM tab is a completely static SVG path:
```tsx
<path d="M0,80 C30,75 60,60 90,50 C120,40 150,30 180,22 C210,15 240,18 270,12 L300,8"
  fill="none" stroke="#6366f1" strokeWidth="2.5" />
<div>
  <span>Week 1</span><span>Week 2</span><span>Week 3</span><span>Week 4</span><span>Week 5</span>
</div>
```
This is decoration — it always shows an upward trend regardless of actual scheduling data.

**Fix options (pick one):**
1. **Remove** the fake chart and replace with a real metric (e.g., "Total Scheduled Slots This Month: 142")
2. **Compute real data** from `slots` array grouped by week and render actual SVG points
3. **Label it as "Illustrative"** until real data is wired

**Recommended:** Option 1 — replace with a simple stat card showing real numbers:
```tsx
<div className="text-2xl font-black text-indigo-600">
  {slots.filter(s => /* this month */).length}
</div>
<div className="text-xs text-gray-500">Total slots scheduled this month</div>
```

---

### MD-H06 · Synthetic `slot_std_N` IDs Used for Students With No DB Match
**File:** `src/components/InterviewModule.tsx` ~line 367 and 2404  
**Category:** MOCK  

**Problem:**  
```ts
id: found?.id || sl.student_id || sl.studentId || `slot_std_${sIdx + 1}`,
```
When a student allocated to an interview slot cannot be found in the `cohortStudents` array, a fabricated ID `slot_std_1`, `slot_std_2` etc. is used. These synthetic IDs then propagate into:
- Mark save calls (`POST /api/exams/marks` with `studentId: "slot_std_3"`)
- Evaluation submissions
- Excel export register numbers

**Fix:** Handle the not-found case explicitly instead of using fake IDs:
```ts
if (!found && !sl.student_id) {
  console.warn("Student not found for slot", sl);
  return null; // filter nulls out
}
id: found?.id ?? sl.student_id ?? sl.studentId, // no synthetic fallback
```

---

## 🟡 MEDIUM — Hardcoded Fallbacks That Mask Missing Data

---

### MD-M01 · `"FP City Campus"` Shown for Slots With Unresolved College
**File:** `src/components/AdminDashboard.tsx` ~line 5052  
**Category:** STATIC_FALLBACK  

**Problem:**  
```tsx
<TableCell className="font-bold">
  {colObj?.name || "FP City Campus"}
</TableCell>
```
When a scheduled slot has a `mentorId` that doesn't resolve to a mentor with a `college_id`, the admin table shows "FP City Campus" as a brand name instead of surfacing the data gap.

**Fix:** Show a clear unknown state:
```tsx
{colObj?.name ?? <span className="text-gray-400 italic text-xs">Campus Unknown</span>}
```

---

### MD-M02 · `"college_1"` Used as Fallback ID Across 9+ Locations
**Files:**  
- `src/components/CAMDashboard.tsx` (5 locations)  
- `src/components/AdminDashboard.tsx` (4 locations)  
- `src/components/StudentDashboard.tsx` (3 locations)  
- `src/context/AppContext.tsx` (1 location)  
- `src/components/CourseInfoModal.tsx` (1 location)  
**Category:** STATIC_FALLBACK  

**Problem:**  
`"college_1"` is a seed-data ID. Using it as a fallback in production means data for users with null `college_id` silently gets associated with the first seeded campus. Example:
```ts
// AppContext.tsx
college_id: currentCAM?.college_id || colleges[0]?.id || "college_1"

// StudentDashboard.tsx
const [editCollegeId, setEditCollegeId] = useState(currentStudent?.college_id || "college_1");
```
If a student or CAM has no campus assigned, operations run against "college_1" — which may not even exist in production.

**Fix:** Replace the hardcoded string with a defensive check:
```ts
// Instead of || "college_1"
const fallbackCollegeId = colleges[0]?.id ?? null;
college_id: currentCAM?.college_id || fallbackCollegeId
// If null, surface an error UI: "Your account is not assigned to a campus"
```
For the `expandedColleges` initial state in AdminDashboard:
```ts
// ❌
const [expandedColleges, setExpandedColleges] = useState<Record<string,boolean>>({ college_1: true, college_2: true });

// ✅ Derive from actual colleges on mount
const [expandedColleges, setExpandedColleges] = useState<Record<string,boolean>>({});
useEffect(() => {
  if (colleges.length > 0) {
    setExpandedColleges(Object.fromEntries(colleges.map(c => [c.id, true])));
  }
}, [colleges]);
```

---

### MD-M03 · Hardcoded Year Ranges for Batch Detection
**File:** `src/components/MentorDashboard.tsx` ~line 3347  
**Category:** HARDCODED_CONFIG  

**Problem:**  
```ts
if (cg.includes("2026-2029")) return "1st Year";
if (cg.includes("2025-2028")) return "2nd Year";
if (cg.includes("2024-2027")) return "3rd Year";
```
Will silently return `undefined` for any batch starting 2027 onwards. Labels disappear with no error.

**Fix (shared utility):** Create `src/lib/batchYear.ts`:
```ts
export function getBatchYear(classGroup: string): string | undefined {
  // Try explicit "Year N" string first
  const yearMatch = classGroup.match(/\b(1st|2nd|3rd|4th|Year\s+[1-4]|I{1,4})\b/i);
  if (yearMatch) return yearMatch[0];

  // Try "YYYY-YYYY" range
  const rangeMatch = classGroup.match(/(\d{4})-(\d{4})/);
  if (rangeMatch) {
    const startYear = parseInt(rangeMatch[1]);
    const currentYear = new Date().getFullYear();
    const yearOfStudy = currentYear - startYear + 1;
    const ordinals = ["1st Year", "2nd Year", "3rd Year", "4th Year"];
    return ordinals[yearOfStudy - 1] ?? `Year ${yearOfStudy}`;
  }
  return undefined;
}
```
Replace the hardcoded checks in both `MentorDashboard.tsx` and `MentorProfileModal.tsx` with `getBatchYear(cg)`.

---

### MD-M04 · Excel Template Uses Fake Faculty Names
**Files:**  
- `src/components/AdminDashboard.tsx` ~line 539–555 (uses `zentra.edu`)  
- `src/components/CAMDashboard.tsx` ~line 10581–10597 (uses `faceprep.in`)  
**Category:** TEMPLATE_DATA  

**Problem:**  
Both admin and CAM faculty import template downloads include the same two fake faculty rows:
```ts
{ "Faculty Name": "Dr. Anitha Ramesh", "Email Address": "anitha.ramesh@zentra.edu", ... }
{ "Faculty Name": "Prof. Rajesh Kumar", "Email Address": "rajesh.kumar@zentra.edu", ... }
```
These are example rows to guide the user — which is fine and intentional. However:
1. AdminDashboard uses `@zentra.edu` domain; CAMDashboard uses `@faceprep.in` — inconsistent
2. The fake emails could be mistakenly submitted if the user doesn't clear the sample rows
3. No prominent "DELETE THESE SAMPLE ROWS BEFORE IMPORTING" warning

**Fix:**
1. Standardize both to use the same domain placeholder: `example@yourdomain.com`
2. Add a prefix to the sample names to make it obvious:
   ```ts
   "Faculty Name": "[SAMPLE] Dr. Anitha Ramesh"
   "Email Address": "sample.faculty1@example.com"
   ```
3. Add a visual warning row at the top of the Excel sheet

---

### MD-M05 · Fake Audit Document ID with `Math.random()`
**File:** `src/components/CAMDashboard.tsx` ~line 1215  
**Category:** MOCK  

**Problem:**  
```ts
const docId = `AUD-${(activeCollegeName||"CM").replace(/[^a-zA-Z0-9]/g,'').slice(0,4).toUpperCase()}-${new Date().getFullYear()}-${Math.floor(100000 + Math.random() * 900000)}`;
```
The audit document ID (shown on exported PDFs) has a random 6-digit suffix. Each export generates a different ID — so two exports of the same audit show different document numbers. Audit trails become unreproducible.

**Fix:** Derive the document ID deterministically from a stable hash of the audit parameters:
```ts
// Use college code + date + sort-stable hash of content
const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
const docId = `AUD-${colCode}-${dateStr}`;
// If multiple audits per day are needed, add a sequential counter stored in state
```

---

### MD-M06 · `"8:20 AM - 8:35 AM"` Hardcoded as Default Interview Time
**File:** `src/components/StudentDashboard.tsx` ~line 2009, 2247  
**Category:** STATIC_FALLBACK  

**Problem:**  
```ts
const timing = mySlot?.slot_start_time || todayInterview.preferred_start_time || "8:20 AM - 8:35 AM";
```
If neither `slot_start_time` nor `preferred_start_time` is set, students see "8:20 AM - 8:35 AM" as their interview time — a hardcoded placeholder that may not match their actual scheduled slot.

**Fix:** Show "Time TBA" instead:
```ts
const timing = mySlot?.slot_start_time || todayInterview.preferred_start_time || "Time to be announced";
```

---

### MD-M07 · L&D Scoring Uses `Math.random()` to Break Ties
**File:** `src/components/LndAllocationDashboard.tsx` ~line 1148  
**Category:** MOCK  

**Problem:**  
```ts
score += Math.random() * 0.01; // tie-break
```
The L&D allocation algorithm adds a tiny random value to break ties between equally-scored SMEs. This means two identical runs of allocation produce different assignments. The system appears deterministic but isn't.

**Fix:** Use a stable deterministic tie-breaker (e.g., alphabetical by SME name, or SME ID hash):
```ts
// Stable tie-break by SME ID (deterministic)
score += (sme.id.charCodeAt(0) / 10000000);
```

---

### MD-M08 · `"Campus Institution"` Shown When College Not Resolved
**File:** `src/components/CourseInfoModal.tsx` ~line 102  
**Category:** STATIC_FALLBACK  

**Problem:**  
```ts
const collegeName = courseCollege?.name || "Campus Institution";
```
When a course has no matching college in state, the modal shows "Campus Institution" — a generic placeholder that looks intentional but is actually a data gap.

**Fix:**
```tsx
const collegeName = courseCollege?.name ?? null;
// In JSX:
{collegeName ?? <span className="text-gray-400 italic">Campus unassigned</span>}
```

---

## 🟢 LOW — Cosmetic / Minor Issues

---

### MD-L01 · `"cam@zentra.edu"` Email Fallback in Leave Request API
**File:** `src/app/api/requests/faculty-leave/route.ts` ~line 652  
**Category:** STATIC_FALLBACK  

**Problem:**  
```ts
const cmEmail = camUser?.email || "cam@zentra.edu";
```
If the CAM user can't be resolved, leave notification emails are sent to `cam@zentra.edu` — a non-existent address. The email silently bounces.

**Fix:**
```ts
const cmEmail = camUser?.email;
if (!cmEmail) {
  console.warn(`No CAM email found for college ${collegeId} — skipping notification`);
  // skip the email send instead of sending to a fake address
} else {
  await sendMail({ to: cmEmail, ... });
}
```

---

### MD-L02 · `"Unassigned Faculty"` Row Added to Excel When No Mentors
**File:** `src/components/CAMDashboard.tsx` ~line 13687  
**Category:** STATIC_FALLBACK  

**Problem:**  
```ts
if (collegeMentors.length === 0) {
  wsMentors.addRow({ mentor: "Unassigned Faculty" });
}
```
An exported Excel roster sheet includes a row with "Unassigned Faculty" as a placeholder when the campus has no mentors. This dummy row can confuse HR or admin teams processing the spreadsheet.

**Fix:**
```ts
if (collegeMentors.length === 0) {
  // Add a clearly marked empty state row, or skip the sheet entirely
  wsMentors.addRow({ mentor: "(No faculty assigned to this campus)" });
}
```

---

### MD-L03 · Admin KAM Tab Pie Chart Uses Slots Count as "Hours"
**File:** `src/components/AdminDashboard.tsx` ~line 3868  
**Category:** HARDCODED_CONFIG  

**Problem:**  
In the KAMs table and overview chart:
```tsx
<TableCell className="text-center font-black text-indigo-650">
  {kamSlots.length} hr(s)
</TableCell>
```
`kamSlots.length` is the number of **slot records** (each representing one period per week), displayed as hours. A slot for "Monday 9AM" is not the same as 1 hour — it depends on the period duration (30min, 50min, 60min etc.). The label "hr(s)" is misleading.

**Fix:** Either:
- Label it "slots" instead of "hr(s)"  
- OR compute real hours from `slot.duration` / shift config

```tsx
{kamSlots.length} slot(s)
```

---

### MD-L04 · ExamScheduleManager Generates IDs With `Math.random()` (Acceptable)
**File:** `src/components/ExamScheduleManager.tsx` ~line 588  
**Category:** MOCK  

**Problem:**  
```ts
id: `exam_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`
```
Client-generated IDs before server save. This is acceptable as a temporary client key (React `key` prop usage), but if these IDs reach the DB without replacement, they become part of the permanent record.

**Fix:** Confirm the server generates the final `id` on `INSERT` and returns it. The client `id` should only be used as a form key and discarded:
```ts
// After server save:
setExams(prev => prev.map(e => e.id === tempId ? { ...e, id: serverResponse.id } : e));
```

---

### MD-L05 · `InterviewModule` Question IDs Use `Math.random()` (Client-Only OK)
**File:** `src/components/InterviewModule.tsx` ~line 3554  
**Category:** MOCK (low risk)  

Same pattern as MD-L04 — client-side temp IDs for structured questions in the rubric editor. Acceptable for UI keying but confirm they're replaced by server IDs when saved.

---

## Summary Table

| ID | File | Severity | Category | Issue |
|----|------|----------|----------|-------|
| MD-H01 | InterviewModule.tsx | 🔴 HIGH | MOCK | Fake Google Meet URL fabricated from interview ID |
| MD-H02 | CAMDashboard.tsx | 🔴 HIGH | MOCK | Timetable versions pre-seeded with fake history + random versions |
| MD-H03 | FeeManagerDashboard.tsx | 🔴 HIGH | MOCK | Fee form defaults to ₹25,000 / "Semester 1 Tuition Fee" |
| MD-H04 | DashboardLayout.tsx | 🔴 HIGH | MOCK | Fee manager nav shows `fee.manager@zentra.edu` for everyone |
| MD-H05 | AdminDashboard.tsx | 🔴 HIGH | MOCK | Fake static SVG "Scheduled Hours Trend" chart |
| MD-H06 | InterviewModule.tsx | 🔴 HIGH | MOCK | `slot_std_N` synthetic student IDs used in mark saves |
| MD-M01 | AdminDashboard.tsx | 🟡 MED | STATIC_FALLBACK | `"FP City Campus"` shown for slots with no college |
| MD-M02 | Multiple (9 files) | 🟡 MED | STATIC_FALLBACK | `"college_1"` hardcoded as fallback ID |
| MD-M03 | MentorDashboard.tsx | 🟡 MED | HARDCODED_CONFIG | Batch year ranges 2024–2027 etc. hardcoded |
| MD-M04 | Admin+CAMDashboard.tsx | 🟡 MED | TEMPLATE_DATA | Fake faculty names in import template (inconsistent domains) |
| MD-M05 | CAMDashboard.tsx | 🟡 MED | MOCK | `Math.random()` in audit document ID — non-deterministic |
| MD-M06 | StudentDashboard.tsx | 🟡 MED | STATIC_FALLBACK | `"8:20 AM - 8:35 AM"` default interview time |
| MD-M07 | LndAllocationDashboard.tsx | 🟡 MED | MOCK | `Math.random()` tie-break in L&D scoring — non-deterministic |
| MD-M08 | CourseInfoModal.tsx | 🟡 MED | STATIC_FALLBACK | `"Campus Institution"` when college not found |
| MD-L01 | faculty-leave/route.ts | 🟢 LOW | STATIC_FALLBACK | `"cam@zentra.edu"` fallback email in leave notification |
| MD-L02 | CAMDashboard.tsx | 🟢 LOW | STATIC_FALLBACK | "Unassigned Faculty" placeholder row in Excel export |
| MD-L03 | AdminDashboard.tsx | 🟢 LOW | HARDCODED_CONFIG | Slots displayed as "hr(s)" — wrong unit label |
| MD-L04 | ExamScheduleManager.tsx | 🟢 LOW | MOCK | `Math.random()` exam IDs — confirm server replaces on save |
| MD-L05 | InterviewModule.tsx | 🟢 LOW | MOCK | `Math.random()` rubric question IDs — client-only, low risk |

---

## Fix Priority Queue

```
Priority 1 — Stop data corruption / misleading users:
  MD-H01  Remove fake Google Meet URL generation
  MD-H03  Clear fee form defaults (prevent accidental ₹25,000 submissions)
  MD-H06  Remove slot_std_N synthetic student IDs from mark saves

Priority 2 — Remove mock data visible in UI:
  MD-H02  Clear timetable version mock history, use sequential versioning
  MD-H04  Fix fee manager email in DashboardLayout nav
  MD-H05  Replace fake SVG chart with real slot count

Priority 3 — Fix silent fallbacks that mask data gaps:
  MD-M02  Replace all "college_1" hardcoded fallbacks with colleges[0]?.id
  MD-M01  Replace "FP City Campus" with clear "Campus Unknown" state
  MD-M08  Replace "Campus Institution" with null/empty state
  MD-M06  Replace "8:20 AM" hardcoded time with "Time TBA"

Priority 4 — Config-driven fixes:
  MD-M03  Create shared getBatchYear() utility (dynamic year calculation)
  MD-M04  Standardize template sample data (consistent domain, [SAMPLE] prefix)
  MD-M05  Make audit doc ID deterministic (date-based, not random)
  MD-M07  Replace Math.random() tie-break with stable SME ID sort

Priority 5 — Low-risk cleanup:
  MD-L01  Skip email instead of sending to cam@zentra.edu
  MD-L02  Better empty-state row in Excel export
  MD-L03  Fix "hr(s)" label → "slot(s)" in KAM table
  MD-L04  Confirm server replaces client exam IDs on save
  MD-L05  Confirm server replaces client question IDs on save
```

---

## Shared Utility Needed: `src/lib/batchYear.ts`

Create once, use everywhere (MentorDashboard, MentorProfileModal, StudentDashboard, CAMDashboard):

```ts
/**
 * Derives the academic year of study from a class group string.
 * Handles: "2026-2029", "III BCA", "Year 2 Section A", "1st Year", etc.
 * Dynamic — works for any future batch year without code changes.
 */
export function getBatchYear(classGroup: string): string | undefined {
  if (!classGroup) return undefined;

  // 1. Explicit "1st Year", "2nd Year", "Year 1" patterns
  const explicit = classGroup.match(/\b(1st|2nd|3rd|4th)\s*[Yy]ear\b|\b[Yy]ear\s*([1-4])\b/);
  if (explicit) return explicit[0];

  // 2. Roman numeral prefix: "III BCA", "II BCA"
  const roman: Record<string, string> = { I: "1st Year", II: "2nd Year", III: "3rd Year", IV: "4th Year" };
  for (const [numeral, label] of Object.entries(roman)) {
    if (classGroup.startsWith(numeral + " ") || classGroup.startsWith(numeral + "-")) return label;
  }

  // 3. "YYYY-YYYY" batch range (fully dynamic)
  const rangeMatch = classGroup.match(/(\d{4})-(\d{4})/);
  if (rangeMatch) {
    const startYear = parseInt(rangeMatch[1]);
    const currentYear = new Date().getFullYear();
    const yearOfStudy = currentYear - startYear + 1;
    if (yearOfStudy >= 1 && yearOfStudy <= 4) {
      return ["1st Year", "2nd Year", "3rd Year", "4th Year"][yearOfStudy - 1];
    }
  }

  return undefined;
}
```


---

## ✅ Additional Issues Found in Second Pass

---

## 🔴 HIGH — Newly Found, Affects Real Users

---

### MD-H07 · `"password123"` Hardcoded as Default Password Across 7 API Routes
**Files:**  
- `src/app/api/users/route.ts` line ~103 & 203  
- `src/app/api/students/route.ts` line ~247  
- `src/app/api/mentors/route.ts` line ~64  
- `src/app/api/mentors/bulk/route.ts` line ~95  
- `src/app/api/cm/route.ts` line ~92  
- `src/app/api/cam/route.ts` line ~92  
- `src/app/api/smes/route.ts` line ~75  
**Category:** HARDCODED_CONFIG  

**Problem:**  
Every new user (mentor, student, CM, CAM, SME) is created with the hardcoded password `"password123"`:
```ts
const rawPassword = password ? password.trim() : "password123";
// Also used in bulk:
const defaultPasswordHash = hashPassword("password123");
```
This is a well-known default that attackers try first. If any admin forgets to reset passwords, every account is compromised. The string appears in 7 separate files meaning if it ever needs to change, it needs changing in 7 places.

**Fix:** Centralise into a single config constant and add forced-reset logic:
```ts
// src/lib/auth.ts — single source of truth
export const DEFAULT_PASSWORD = process.env.DEFAULT_USER_PASSWORD || "FP@Change2024!";

// In all route files:
import { DEFAULT_PASSWORD } from "@/lib/auth";
const rawPassword = password?.trim() || DEFAULT_PASSWORD;
```
Better still: generate a random temporary password and email it to the new user:
```ts
const tempPassword = crypto.randomBytes(6).toString("hex"); // e.g. "a3f9b2"
await sendWelcomeEmail(email, tempPassword);
```

---

### MD-H08 · Fake `@university.edu` Email Auto-Provisioned at Login
**File:** `src/app/api/login/route.ts` ~line 151  
**Category:** STATIC_FALLBACK  

**Problem:**  
When a user logs in with a bare username (no `@` domain) and is found in a role table but not in the `users` table, they are auto-provisioned with a fabricated email:
```ts
let resolvedEmail = lowerEmail.includes("@")
  ? lowerEmail
  : `${lowerEmail}@university.edu`;  // ← fabricated
```
The email `john@university.edu` is stored permanently in the DB for the user, even though `university.edu` doesn't exist. This affects:
- All outgoing email notifications — sent to a bounce address
- Audit log email references — permanently wrong
- The nav header email display

**Fix:** Do not fabricate an email. Use the raw login input as the identifier and only store a real email if one is provided:
```ts
let resolvedEmail = lowerEmail.includes("@") ? lowerEmail : lowerEmail;
// Do not append any domain — store the bare identifier as-is
// Email notifications should only fire if a proper @domain.tld exists
```

---

### MD-H09 · Academic Year Hardcoded as `"2026-2027"` in Campus Wizard  
**Files:**  
- `src/components/AdminDashboard.tsx` ~line 703, 1607, 1722, 1785, 7065 (5 locations)  
- `src/components/CAMDashboard.tsx` ~line 10915, 11123, 11133  
**Category:** HARDCODED_CONFIG  

**Problem:**  
Every new campus form, course form, and subject form defaults to `"2026-2027"` as the academic year:
```ts
academic_year: "2026-2027",  // ← hardcoded
```
Additionally the year dropdown is a static array:
```tsx
{["2024-2025", "2025-2026", "2026-2027", "2027-2028", "2028-2029"].map(yr => (
  <option key={yr} value={yr}>{yr}</option>
))}
```
After 2028–2029, the dropdown will be empty/stale — someone must remember to update this array in code every year.

**Fix:** Compute dynamically from the current date and auto-select the current academic year:
```ts
// src/lib/academicYear.ts — shared utility
export function getCurrentAcademicYear(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1; // 1-12
  // Academic year starts in June/July
  const startYear = month >= 6 ? year : year - 1;
  return `${startYear}-${startYear + 1}`;
}

export function getAcademicYearOptions(rangeYears = 3): string[] {
  const current = new Date().getFullYear();
  const start = current - 1;
  return Array.from({ length: rangeYears + 2 }, (_, i) => {
    const y = start + i;
    return `${y}-${y + 1}`;
  });
}
```
Replace all hardcoded defaults:
```ts
import { getCurrentAcademicYear } from "@/lib/academicYear";
academic_year: getCurrentAcademicYear(), // e.g. "2026-2027" auto-computed
```
Replace static dropdown:
```tsx
import { getAcademicYearOptions } from "@/lib/academicYear";
{getAcademicYearOptions().map(yr => <option key={yr} value={yr}>{yr}</option>)}
```

---

## 🟡 MEDIUM — Newly Found

---

### MD-M09 · DiceBear Avatar CDN Used for All Mentor Avatars
**Files:**  
- `src/context/AppContext.tsx` ~line 1154 & 2369  
- `src/components/AdminDashboard.tsx` ~line 634  
- `src/components/CAMDashboard.tsx` ~line 10656  
**Category:** STATIC_FALLBACK  

**Problem:**  
Every mentor without a real avatar photo gets a URL from the DiceBear CDN:
```ts
avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(email)}`
```
Issues:
1. **External CDN dependency** — if DiceBear is down or changes their API version (`/7.x/`), all mentor avatars break across every page that renders a mentor list
2. **API version hardcoded** — DiceBear v7 is not the latest; avatars may deprecate or change style
3. **Privacy** — mentor emails are sent to a third-party service as a seed parameter, even if hashed  
4. **Performance** — every mentor row fires a separate CDN request; 50 mentors = 50 avatar fetches

**Fix option A (best):** Generate avatars from initials locally — no external CDN:
```tsx
// InlineMentorAvatar component
const getInitials = (name: string) =>
  name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();

<div className="h-8 w-8 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center font-black text-xs">
  {getInitials(mentor.name)}
</div>
```

**Fix option B (if avatars are needed):** Store the avatar URL in the DB as a nullable column; only call DiceBear when explicitly generating a new avatar (admin action), not on every read.

---

### MD-M10 · Template Sample Subjects Hardcoded ("Programming in C", "Digital Fundamentals")
**Files:**  
- `src/components/CAMDashboard.tsx` ~line 10586–10596  
**Category:** TEMPLATE_DATA  

**Problem:**  
The Excel faculty import template in CAMDashboard has hardcoded subject names in the sample rows:
```ts
"Subjects": "Programming in C, Digital Fundamentals",
"Subjects": "Computer Fundamentals, Mathematics for Computer Science",
```
These are CS/BCA subjects. A campus with BBA or B.Com courses will have a template showing completely irrelevant subject names, potentially confusing the person filling the template.

**Fix:** Populate sample subjects from the campus's actual configured subjects:
```ts
const campusSubjects = subjectsList
  .filter(s => s.college_id === activeCollegeId)
  .slice(0, 4)
  .map(s => s.name);

const sampleSubjects1 = campusSubjects.slice(0, 2).join(", ") || "Subject 1, Subject 2";
const sampleSubjects2 = campusSubjects.slice(2, 4).join(", ") || "Subject 3, Subject 4";
```

---

### MD-M11 · `Math.random()` in Server-Side IDs Across 15+ API Routes
**Files:** All API routes — `slots`, `requests`, `notifications`, `audit_logs`, `weekly-plan`, `users`, `students`, `settings`, `sme-availability`, `skill-tracker`, `student-feedback`, `signup`, `materials`, `demo-swap`, `faculty-leave`  
**Category:** HARDCODED_CONFIG  

**Problem:**  
Every API route generates IDs using the pattern:
```ts
const id = `prefix_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
```
This appears in 15+ places. Issues:
1. **Collision risk** at high concurrency — two requests arriving in the same millisecond with the same random suffix (7 chars = 78 billion combos) are astronomically unlikely but not impossible
2. **No central ID strategy** — every route invents its own prefix and length
3. **Not sortable by creation time** in all cases (some are, some aren't)
4. **No deduplication guard** — if an insert fails due to collision, it bubbles as a DB error rather than a graceful retry

**Fix:** Create a shared ID utility in `src/lib/id.ts`:
```ts
import { randomBytes } from "crypto";

export function generateId(prefix: string): string {
  // timestamp (ms) + 8 random hex chars = ~4 billion combos per ms
  const random = randomBytes(4).toString("hex");
  return `${prefix}_${Date.now()}_${random}`;
}

// Usage:
import { generateId } from "@/lib/id";
const slotId = generateId("s");         // s_1700000000000_a3f9b2c1
const requestId = generateId("req");    // req_1700000000000_d4e8f3a2
```
Or simply use `crypto.randomUUID()` which is collision-proof:
```ts
import { randomUUID } from "crypto";
const id = `s_${randomUUID()}`; // s_550e8400-e29b-41d4-a716-446655440000
```

---

### MD-M12 · `CAMDashboard` Line 24529 — Hardcoded "Aided / Self-Financed" Labels for `college_1` / `college_2`
**File:** `src/components/CAMDashboard.tsx` ~line 24529  
**Category:** HARDCODED_CONFIG  

**Problem:**  
```tsx
{activeCollegeId === "college_1"
  ? "college_1 (Aided)"
  : "college_2 (Self-Financed)"}
```
This hardcodes the assumption that `college_1` = "Aided" and `college_2` = "Self-Financed". Any deployment that doesn't use these exact seed IDs (or has more than 2 campuses) will display wrong labels. The "Aided"/"Self-Financed" classification should come from a DB field.

**Fix:** Add a `college_type` or `college_notes` field to the `colleges` table, and render that:
```tsx
{college?.notes || college?.id}
```

---

### MD-M13 · `"Year 1 Section A"` Hardcoded as Sample Class in Both Templates
**Files:**  
- `src/components/CAMDashboard.tsx` ~line 10588, 10597  
- `src/components/AdminDashboard.tsx` ~line 558 (inferred, same template code)  
**Category:** TEMPLATE_DATA  

**Problem:**  
```ts
"Classes": "Year 1 Section A"
```
The sample classes field in faculty import templates always uses "Year 1 Section A". If the campus uses different class group naming conventions (e.g., "III BCA - A", "2026-2029 Section B"), the template provides confusing guidance.

**Fix:** Populate sample classes from the campus's actual `classGroup` values from students or slots:
```ts
const sampleClasses = students
  .filter(s => s.college_id === activeCollegeId)
  .slice(0, 2)
  .map(s => s.classGroup)
  .filter(Boolean)
  .join(", ") || "Year 1 Section A";
```

---

### MD-M14 · `src/app/api/students/route.ts` Auto-Generates `@university.edu` Email for Students
**File:** `src/app/api/students/route.ts` ~line 197  
**Category:** STATIC_FALLBACK  

**Problem:**  
```ts
const stEmail = (email || `${stId.toLowerCase()}@university.edu`).toString().trim();
```
When a student is imported without an email address (common in bulk CSV imports where email isn't available), they receive a fabricated `@university.edu` address. This fake email:
- Gets stored permanently in the DB
- Is used for all outgoing notifications
- Appears in the attendance marking confirmation emails
- Shows in the student profile and export sheets

**Fix:** Allow `email` to be genuinely null/empty:
```ts
const stEmail = email ? String(email).toLowerCase().trim() : null;
// Store NULL in DB, skip email notifications when email is null
```
Add a `no-email` indicator in UI where applicable:
```tsx
{student.email ?? <span className="text-gray-400 italic">No email on record</span>}
```

---

## 🟢 LOW — Newly Found

---

### MD-L06 · `WeeklyPlanStudio.tsx` Excel Creator Hardcoded as `"Zentra"`
**File:** `src/components/WeeklyPlanStudio.tsx` ~line 870  
**Category:** STATIC_FALLBACK  

**Problem:**  
```ts
wb.creator = mentorName || "Zentra";
```
When `mentorName` is unavailable, the Excel workbook metadata shows "Zentra" as the creator — an internal codename that shouldn't appear in exported documents given to students/staff.

**Fix:**
```ts
wb.creator = mentorName || currentMentor?.name || "FACE Prep E-Campus";
```

---

### MD-L07 · `LndAllocationDashboard.tsx` Excel Creator Also "Zentra"
**File:** `src/components/LndAllocationDashboard.tsx` ~line 1363  
**Category:** STATIC_FALLBACK  

```ts
workbook.creator = "Zentra Timetable Engine - L & D";
```
Same branding inconsistency — should use the product name.

**Fix:**
```ts
workbook.creator = "FACE Prep E-Campus — L&D Allocation Engine";
```

---

### MD-L08 · `"Subject Matter Expert"` Hardcoded as Verifier Name in Weekly Plan Notification
**File:** `src/app/api/weekly-plan/route.ts` ~line 372  
**Category:** STATIC_FALLBACK  

**Problem:**  
```ts
const message = `Your Weekly Plan has been approved by ${verifiedBy || "Subject Matter Expert"}.`;
```
If `verifiedBy` is not populated in the request body, the mentor receives a notification saying "approved by Subject Matter Expert" — a generic label rather than the actual SME's name.

**Fix:**
```ts
// Fetch the SME name from DB if not passed
const verifierName = verifiedBy || (await db.get("SELECT name FROM sme_users WHERE id = ?", smeId))?.name || "Your SME";
const message = `Your Weekly Plan has been approved by ${verifierName}.`;
```

---

## Updated Summary Table

| ID | File(s) | Sev | Category | Issue |
|----|---------|-----|----------|-------|
| MD-H01 | InterviewModule.tsx | 🔴 | MOCK | Fake Google Meet URL from interview ID |
| MD-H02 | CAMDashboard.tsx | 🔴 | MOCK | Timetable version mock history + random versioning |
| MD-H03 | FeeManagerDashboard.tsx | 🔴 | MOCK | Fee form defaults ₹25,000 / "Semester 1 Tuition Fee" |
| MD-H04 | DashboardLayout.tsx | 🔴 | MOCK | Fee manager nav = `fee.manager@zentra.edu` |
| MD-H05 | AdminDashboard.tsx | 🔴 | MOCK | Fake static SVG trend chart |
| MD-H06 | InterviewModule.tsx | 🔴 | MOCK | `slot_std_N` synthetic IDs in mark saves |
| **MD-H07** | 7 API routes | 🔴 | HARDCODED_CONFIG | `"password123"` default password in 7 files |
| **MD-H08** | login/route.ts | 🔴 | STATIC_FALLBACK | `@university.edu` auto-generated at login |
| **MD-H09** | Admin+CAMDashboard | 🔴 | HARDCODED_CONFIG | Academic year `"2026-2027"` hardcoded in 8 places |
| MD-M01 | AdminDashboard.tsx | 🟡 | STATIC_FALLBACK | `"FP City Campus"` for unresolved college |
| MD-M02 | 9 files | 🟡 | STATIC_FALLBACK | `"college_1"` hardcoded fallback |
| MD-M03 | MentorDashboard.tsx | 🟡 | HARDCODED_CONFIG | Batch year ranges hardcoded |
| MD-M04 | Admin+CAMDashboard | 🟡 | TEMPLATE_DATA | Fake faculty names in import template |
| MD-M05 | CAMDashboard.tsx | 🟡 | MOCK | `Math.random()` audit document ID |
| MD-M06 | StudentDashboard.tsx | 🟡 | STATIC_FALLBACK | `"8:20 AM - 8:35 AM"` default interview time |
| MD-M07 | LndAllocationDashboard | 🟡 | MOCK | `Math.random()` L&D tie-break |
| MD-M08 | CourseInfoModal.tsx | 🟡 | STATIC_FALLBACK | `"Campus Institution"` fallback |
| **MD-M09** | AppContext + 2 files | 🟡 | STATIC_FALLBACK | DiceBear CDN avatar dependency |
| **MD-M10** | CAMDashboard.tsx | 🟡 | TEMPLATE_DATA | Sample subjects hardcoded ("Programming in C") |
| **MD-M11** | 15+ API routes | 🟡 | HARDCODED_CONFIG | `Math.random()` ID generation — no central utility |
| **MD-M12** | CAMDashboard.tsx | 🟡 | HARDCODED_CONFIG | "Aided/Self-Financed" labels for college_1/college_2 |
| **MD-M13** | CAM+AdminDashboard | 🟡 | TEMPLATE_DATA | `"Year 1 Section A"` hardcoded in all templates |
| **MD-M14** | students/route.ts | 🟡 | STATIC_FALLBACK | `@university.edu` email generated for students |
| MD-L01 | faculty-leave/route.ts | 🟢 | STATIC_FALLBACK | `"cam@zentra.edu"` fallback email |
| MD-L02 | CAMDashboard.tsx | 🟢 | STATIC_FALLBACK | "Unassigned Faculty" Excel row |
| MD-L03 | AdminDashboard.tsx | 🟢 | HARDCODED_CONFIG | Slots shown as "hr(s)" — wrong unit |
| MD-L04 | ExamScheduleManager | 🟢 | MOCK | `Math.random()` exam IDs |
| MD-L05 | InterviewModule.tsx | 🟢 | MOCK | `Math.random()` question IDs |
| **MD-L06** | WeeklyPlanStudio.tsx | 🟢 | STATIC_FALLBACK | Excel creator `"Zentra"` codename |
| **MD-L07** | LndAllocationDashboard | 🟢 | STATIC_FALLBACK | Excel creator `"Zentra Timetable Engine"` |
| **MD-L08** | weekly-plan/route.ts | 🟢 | STATIC_FALLBACK | "Subject Matter Expert" generic verifier name |

**Total: 31 issues** (19 from first pass + 12 newly found)

---

## Shared Utilities Needed (Create Once, Use Everywhere)

### 1. `src/lib/academicYear.ts` — Dynamic Academic Year
```ts
export function getCurrentAcademicYear(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const startYear = month >= 6 ? year : year - 1;
  return `${startYear}-${startYear + 1}`;
}

export function getAcademicYearOptions(rangeYears = 3): string[] {
  const current = new Date().getFullYear();
  return Array.from({ length: rangeYears + 2 }, (_, i) => {
    const y = current - 1 + i;
    return `${y}-${y + 1}`;
  });
}
```

### 2. `src/lib/batchYear.ts` — Dynamic Batch Year Detection
```ts
export function getBatchYear(classGroup: string): string | undefined {
  if (!classGroup) return undefined;
  const explicit = classGroup.match(/\b(1st|2nd|3rd|4th)\s*[Yy]ear|\b[Yy]ear\s*([1-4])\b/);
  if (explicit) return explicit[0];
  const roman: Record<string, string> = { I: "1st Year", II: "2nd Year", III: "3rd Year", IV: "4th Year" };
  for (const [n, l] of Object.entries(roman)) {
    if (classGroup.startsWith(n + " ") || classGroup.startsWith(n + "-")) return l;
  }
  const rangeMatch = classGroup.match(/(\d{4})-(\d{4})/);
  if (rangeMatch) {
    const diff = new Date().getFullYear() - parseInt(rangeMatch[1]) + 1;
    return ["1st Year", "2nd Year", "3rd Year", "4th Year"][diff - 1];
  }
  return undefined;
}
```

### 3. `src/lib/id.ts` — Centralised ID Generation
```ts
import { randomBytes } from "crypto";

export function generateId(prefix: string): string {
  const random = randomBytes(4).toString("hex");
  return `${prefix}_${Date.now()}_${random}`;
}
// Or use crypto.randomUUID() for truly collision-proof IDs
```

### 4. `src/lib/auth.ts` — Default Password Config
```ts
// Single source of truth for default password
// Set via env var in production
export const DEFAULT_PASSWORD = process.env.DEFAULT_USER_PASSWORD ?? "FP@ChangeMe!";
```

---

## Complete Fix Priority Queue (31 issues)

```
CRITICAL — data corruption / security:
  MD-H07  Centralise "password123" → env-driven DEFAULT_PASSWORD
  MD-H08  Remove @university.edu auto-generated email at login
  MD-H06  Remove slot_std_N synthetic student IDs from mark saves
  MD-H01  Remove fake Google Meet URL generation

HIGH — fake data visible to users:
  MD-H03  Clear fee form defaults (₹25,000)
  MD-H04  Fix fee manager email in DashboardLayout
  MD-H02  Clear timetable version mock history, sequential versioning
  MD-H05  Replace fake SVG chart with real slot count
  MD-H09  Dynamic academic year (create academicYear.ts utility)

MEDIUM — silent fallbacks / misleading:
  MD-M11  Create src/lib/id.ts central ID generator (15+ files)
  MD-M09  Replace DiceBear CDN with initials-based local avatar
  MD-M14  Allow null student email instead of @university.edu
  MD-M02  Replace "college_1" hardcoded fallback in 9 files
  MD-M01  Replace "FP City Campus" fallback
  MD-M08  Replace "Campus Institution" fallback
  MD-M06  Replace "8:20 AM" hardcoded time → "Time TBA"
  MD-M03  Create src/lib/batchYear.ts (dynamic year detection)
  MD-M12  Replace "Aided/Self-Financed" college_1/college_2 labels
  MD-M04  Standardise template sample names + [SAMPLE] prefix
  MD-M10  Populate template subjects from real campus subjects
  MD-M13  Populate template classes from real campus batches
  MD-M05  Deterministic audit doc ID
  MD-M07  Stable tie-break in L&D allocation

LOW — polish:
  MD-L01  Skip email instead of cam@zentra.edu
  MD-L02  Better Excel empty-state row
  MD-L03  "slot(s)" not "hr(s)" in KAM table
  MD-L06  Fix Excel creator "Zentra" → product name
  MD-L07  Fix Excel creator "Zentra Timetable Engine" → product name
  MD-L08  Fetch SME name for weekly plan approval notification
  MD-L04  Confirm server replaces exam IDs on save
  MD-L05  Confirm server replaces question IDs on save
```


---

## ✅ Third Pass — Final Findings (Nothing More After This)

---

## 🔴 HIGH — Third Pass

---

### MD-H10 · Seed Data Hardcodes Real Chennai Addresses and Fake Names as Production Records
**File:** `src/lib/seed.ts` ~line 1078, 1082  
**Category:** MOCK  

**Problem:**  
The seed file creates colleges with real-looking (but fake) addresses that persist into production if the seed runs on a live DB without prior records:
```ts
"college_1", "FP City Campus", "123, Anna Salai, Chennai - 600002"
"college_2", "FP North Campus", "45, Poonamallee High Road, Chennai - 600056"
```
Additionally: `"Rajesh Kumar", "rajesh.kam@university.edu"`, `"Priya Venkatesh", "priya.cm@university.edu"`, `"Arjun Sharma", "arjun.cm@university.edu"` as real-looking people records.

These seed entries:
- **Persist if the DB was initialized with seed** and the admin forgot to clean them
- Appear in dropdown menus (college selectors, KAM/CAM assignments)
- Get emailed if any notification is triggered for these records
- Leak internal codename "FP City Campus" / "FP North Campus" in any export

The SMEs are worse — they use `@zentra.edu`:
```ts
"sme_1", "Dr. Ramesh Kumar", "ramesh.sme@zentra.edu"
"sme_2", "Prof. Sneha Iyer", "sneha.sme@zentra.edu"
"sme_3", "Mr. Tharun Balaji", "tharun.sme@zentra.edu"
"lnd_1", "lnd@zentra.edu"
```

**Fix:**
1. Clearly mark all seed data as `DEMO_ONLY` and add a guard:
```ts
if (process.env.NODE_ENV === "production" && !process.env.ALLOW_SEED_IN_PROD) {
  console.warn("Seed skipped in production. Set ALLOW_SEED_IN_PROD=true to override.");
  return;
}
```
2. Use obviously-fake placeholder data: `"Demo Campus A"`, `"demo.kam@example.com"`, `"Demo KAM"` so they're never mistaken for real records.

---

### MD-H11 · `"Campus Manager"` / `"Key Account Manager"` Hardcoded as Fallback Names in Audit Logs
**File:** `src/context/AppContext.tsx` ~line 1160, 1172, 1275, 1287  
**Category:** STATIC_FALLBACK  

**Problem:**  
When creating placeholder CAM/KAM objects before the real data loads from the API, generic role titles are used as the person's name:
```ts
const placeholderCam = {
  id: targetCamId,
  name: userName || "Campus Manager", // ← role title, not a real name
  ...
};
const placeholderKam = {
  name: userName || "Key Account Manager", // ← role title, not a real name
  ...
};
```
These placeholder names flow into audit logs (`actorName`), slot assignment records, and handover requests:
```ts
const actorRole = currentRole === "cm" ? "Campus Manager" : "Key Account Manager";
// actorName = currentCAM?.name → "Campus Manager" if not yet loaded
```
Audit logs then show entries like `"Campus Manager created slot X"` — losing the actual person's identity. This is irreversible once written to the DB.

**Fix:** Block mutations until the real user data loads:
```ts
// Do not allow slot creation until currentCAM has resolved from the API
if (!currentCAM?.name || currentCAM.name === "Campus Manager") {
  toast("Waiting for your profile to load, please try again", "warning");
  return;
}
```

---

### MD-H12 · Shift Config Defaults (08:30 AM, 50min, 5 periods) Hardcoded in 6 Places
**File:** `src/components/AdminDashboard.tsx` ~line 750–752, 1641–1643, 1686–1688, 1766–1768, 1772–1774  
**Category:** HARDCODED_CONFIG  

**Problem:**  
The default shift configuration is duplicated in 6 separate `useState` initializations and fallback assignments:
```ts
shift_1: { label: "Shift 1", startTime: "08:30 AM", periodDuration: 50, periodsCount: 5, mode: "duration", breaks: [] },
shift_2: { label: "Shift 2", startTime: "01:00 PM", periodDuration: 50, periodsCount: 5, mode: "duration", breaks: [] },
general: { label: "General Shift", startTime: "09:00 AM", periodDuration: 50, periodsCount: 6, mode: "duration", breaks: [] }
```
This exact block appears 4+ times in AdminDashboard alone. If any default needs to change (e.g. periods from 50min to 45min), it must be updated in 6 places and is easy to miss.

**Fix:** Extract to a constant:
```ts
// src/lib/shiftDefaults.ts
export const DEFAULT_SHIFT_CONFIGS = {
  shift_1: { label: "Shift 1", startTime: "08:30 AM", periodDuration: 50, periodsCount: 5, mode: "duration" as const, breaks: [] },
  shift_2: { label: "Shift 2", startTime: "01:00 PM", periodDuration: 50, periodsCount: 5, mode: "duration" as const, breaks: [] },
  general: { label: "General Shift", startTime: "09:00 AM", periodDuration: 50, periodsCount: 6, mode: "duration" as const, breaks: [] }
} as const;
```
Then import and use `DEFAULT_SHIFT_CONFIGS` everywhere instead of repeating the object literal.

---

## 🟡 MEDIUM — Third Pass

---

### MD-M15 · `"approver_name": "Campus Manager"` Hardcoded in Student Leave Approval
**File:** `src/context/AppContext.tsx` ~line 3747  
**Category:** STATIC_FALLBACK  

**Problem:**  
```ts
approver_id: "cm_curr",
approver_name: "Campus Manager",
```
When a leave request is approved by a CAM, the approval record stores `"Campus Manager"` as the name instead of the actual CAM's name. The student sees "Leave approved by: Campus Manager" rather than their CM's real name.

**Fix:**
```ts
approver_id: currentCAM?.id || "cm_curr",
approver_name: currentCAM?.name || "Your Campus Manager",
```

---

### MD-M16 · `"Subject Matter Expert"` as Default Verifier in WeeklyPlanStudio
**File:** `src/components/WeeklyPlanStudio.tsx` ~line 2196  
**Category:** STATIC_FALLBACK  

**Problem:**  
```ts
verifiedBy: reviewerName || "Subject Matter Expert"
```
When `reviewerName` is missing, the weekly plan is marked as verified by the generic string "Subject Matter Expert" — the same issue as MD-L08 in the API route but here it originates from the component.

**Fix:**
```ts
verifiedBy: reviewerName || currentSME?.name || "Your SME"
```

---

### MD-M17 · `"Campus Manager"` Hardcoded as Default Actor Name in Interview Notifications
**File:** `src/lib/interview-notifications.ts` ~line 47  
**Category:** STATIC_FALLBACK  

**Problem:**  
```ts
actorName = "Campus Manager"  // default parameter value
```
If no `actorName` is passed when triggering an interview notification, the student sees "Campus Manager scheduled your interview" instead of the actual person's name.

**Fix:** Make `actorName` required, or use a more descriptive fallback:
```ts
actorName = "Your Campus Team"
```

---

### MD-M18 · `"Zentra Interview System"` Branding in iCal PRODID
**File:** `src/lib/google-calendar.ts` ~line 151  
**Category:** STATIC_FALLBACK  

**Problem:**  
```ts
"PRODID:-//FACE Prep//Zentra Interview System//EN",
```
Calendar invites generated by the system embed `"Zentra Interview System"` as the product ID — an internal codename visible in the raw `.ics` file metadata. Students and mentors downloading the calendar invite will see this label in calendar apps.

**Fix:**
```ts
"PRODID:-//FACE Prep//E-Campus Interview Scheduler//EN",
```

---

### MD-M19 · `report-export.ts` and `CAMDashboard.tsx` Both Generate `Math.random()` Report IDs
**Files:**  
- `src/lib/report-export.ts` ~line 94  
- `src/components/CAMDashboard.tsx` ~line 1215  
**Category:** MOCK  

**Problem:**  
Two separate files generate document IDs with `Math.random()`:
```ts
// report-export.ts
const docId = `RPT-...-${Math.floor(100000 + Math.random() * 900000)}`;

// CAMDashboard.tsx
const docId = `AUD-...-${Math.floor(100000 + Math.random() * 900000)}`;
```
Both use the exact same random range `100000–999999`. Every report/audit export gets a different ID each time — two exports of the same report on the same day have unrelated document numbers. This makes audit trail reconciliation impossible.

**Fix:** Use a deterministic ID from content hash or timestamp:
```ts
// Deterministic: date + campus code + hour (unique within business day)
const dateCode = new Date().toISOString().slice(0, 13).replace(/[-T:]/g, ""); // "202611011430"
const docId = `RPT-${campusCode}-${dateCode}`;
```

---

### MD-M20 · Semester Dropdown Hardcoded as Static 6/8 Semesters Across 8 Files
**Files:**  
- `src/components/MentorDashboard.tsx` (3 instances)  
- `src/components/CAMDashboard.tsx` (2 instances)  
- `src/components/ExamScheduleManager.tsx` (2 instances)  
- `src/components/StudentDashboard.tsx` (inferred)  
**Category:** HARDCODED_CONFIG  

**Problem:**  
Semester dropdowns are hardcoded throughout:
```ts
const defaultSems = ["Semester 1", "Semester 2", "Semester 3", "Semester 4", "Semester 5", "Semester 6", "Semester 7", "Semester 8"];
// Also appears as:
{["Semester 1", "Semester 2", "Semester 3", "Semester 4", "Semester 5", "Semester 6"].map(s => ...)}
```
Some use 6 semesters (for 3-year programs), some use 8 (for 4-year). The inconsistency means exam schedules, subject mapping, and weekly plans may show mismatched options per-course. A 3-year BCA program shows "Semester 7" and "Semester 8" options that don't exist for it.

**Fix:** Derive semester count from the course's `years` field:
```ts
// Compute per-course semester list
const semCount = (course?.years ?? 3) * 2;
const semesters = Array.from({ length: semCount }, (_, i) => `Semester ${i + 1}`);
```
Create a shared utility:
```ts
// src/lib/semesters.ts
export function getSemestersForCourse(years: number): string[] {
  return Array.from({ length: years * 2 }, (_, i) => `Semester ${i + 1}`);
}
export const DEFAULT_SEMESTERS = getSemestersForCourse(3); // fallback
```

---

### MD-M21 · Input Placeholder Emails Mix Three Different Domains
**Files:**  
- `src/components/AdminDashboard.tsx` (3 instances — `@university.edu`, `@zentra.edu`, `@faceprep.in`)  
- `src/components/CAMDashboard.tsx` (1 instance — `@university.edu`)  
**Category:** STATIC_FALLBACK  

**Problem:**  
Form field placeholders use three different domains:
```tsx
placeholder="e.g. ramesh.kam@university.edu"   // KAM form
placeholder="e.g. priya.cam@university.edu"    // CAM form
placeholder="e.g. ramesh.sme@zentra.edu"       // SME form  ← different domain
placeholder="e.g. alice.smith@university.edu"  // Mentor form
placeholder="e.g. user@faceprep.in"            // User credentials
```
Users see three different example domains, implying these are valid addresses. Someone could type the example domain by mistake.

**Fix:** Standardize all email placeholders to use `example.com` (RFC 2606 reserved):
```tsx
placeholder="e.g. firstname.lastname@example.com"
```

---

## 🟢 LOW — Third Pass

---

### MD-L09 · `google-calendar.ts` Uses `Math.random()` for iCal Unique IDs
**File:** `src/lib/google-calendar.ts` ~line 37–40  
**Category:** MOCK  

**Problem:**  
```ts
function generateRandomString(len: number): string {
  let res = "";
  for (let i = 0; i < len; i++) {
    res += letters[Math.floor(Math.random() * letters.length)];
  }
  return res;
}
```
Used to generate the `UID` field in `.ics` calendar files. The `UID` in iCal is meant to be a stable, globally unique identifier for the event — the same event should always produce the same `UID`. If a user downloads the invite twice, their calendar app creates a duplicate event instead of updating the existing one.

**Fix:**
```ts
// Deterministic UID from interview ID + date
const uid = `${interview.id}-${interview.target_date}@faceprep-ecampus.in`;
```

---

### MD-L10 · `"General"` as Hardcoded Default Class Group in `AppContext.assignSlot`
**File:** `src/context/AppContext.tsx` ~line 1466  
**Category:** STATIC_FALLBACK  

**Problem:**  
```ts
const cleanClassGroup = classGroup ? classGroup.trim() : "General";
```
When no `classGroup` is provided for a slot assignment, it defaults to `"General"` — a string that doesn't match any real class group in most databases. Attendance for these slots will never match any student's `classGroup`, making the slot invisible in student views.

**Fix:**
```ts
const cleanClassGroup = classGroup?.trim() || null;
// Require classGroup for slot creation — return error if missing
if (!cleanClassGroup) {
  throw new Error("Class group is required for slot assignment");
}
```

---

### MD-L11 · Semester 6 Hard Limit in `WeeklyPlanStudio` Period Count Display
**File:** `src/components/WeeklyPlanStudio.tsx` ~line 2614  
**Category:** HARDCODED_CONFIG  

**Problem:**  
```tsx
{filledPeriodsCount} / {tasks.length || 6} Periods
```
When `tasks.length` is 0 (no tasks yet configured), it falls back to `6` — implying 6 periods per day. But some campuses run 5 periods (Shift 1/2) or 7+ periods. The fallback makes the progress display wrong on first load.

**Fix:**
```tsx
const expectedPeriods = activeShiftConfig?.periodsCount ?? tasks.length ?? 6;
{filledPeriodsCount} / {expectedPeriods} Periods
```

---

## Final Complete Summary Table (40 issues)

| ID | File(s) | Sev | Category | Issue |
|----|---------|-----|----------|-------|
| MD-H01 | InterviewModule.tsx | 🔴 | MOCK | Fake Google Meet URL from interview ID |
| MD-H02 | CAMDashboard.tsx | 🔴 | MOCK | Timetable version mock history + random versioning |
| MD-H03 | FeeManagerDashboard.tsx | 🔴 | MOCK | Fee form defaults ₹25,000 / "Semester 1 Tuition Fee" |
| MD-H04 | DashboardLayout.tsx | 🔴 | MOCK | Fee manager nav = `fee.manager@zentra.edu` |
| MD-H05 | AdminDashboard.tsx | 🔴 | MOCK | Fake static SVG trend chart |
| MD-H06 | InterviewModule.tsx | 🔴 | MOCK | `slot_std_N` synthetic IDs in mark saves |
| MD-H07 | 7 API routes | 🔴 | HARDCODED_CONFIG | `"password123"` in 7 files — centralise |
| MD-H08 | login/route.ts | 🔴 | STATIC_FALLBACK | `@university.edu` auto-generated at login |
| MD-H09 | Admin+CAMDashboard | 🔴 | HARDCODED_CONFIG | Academic year `"2026-2027"` in 8 places |
| **MD-H10** | seed.ts | 🔴 | MOCK | Seed data with real-looking Chennai addresses, @zentra.edu SMEs in production |
| **MD-H11** | AppContext.tsx | 🔴 | STATIC_FALLBACK | `"Campus Manager"` used as person name in audit logs before data loads |
| **MD-H12** | AdminDashboard.tsx | 🔴 | HARDCODED_CONFIG | Shift defaults (08:30, 50min, 5 periods) duplicated 6 times |
| MD-M01 | AdminDashboard.tsx | 🟡 | STATIC_FALLBACK | `"FP City Campus"` for unresolved college |
| MD-M02 | 9 files | 🟡 | STATIC_FALLBACK | `"college_1"` hardcoded fallback |
| MD-M03 | MentorDashboard.tsx | 🟡 | HARDCODED_CONFIG | Batch year ranges hardcoded |
| MD-M04 | Admin+CAMDashboard | 🟡 | TEMPLATE_DATA | Fake faculty names in import template |
| MD-M05 | CAMDashboard.tsx | 🟡 | MOCK | `Math.random()` audit document ID |
| MD-M06 | StudentDashboard.tsx | 🟡 | STATIC_FALLBACK | `"8:20 AM - 8:35 AM"` default interview time |
| MD-M07 | LndAllocationDashboard | 🟡 | MOCK | `Math.random()` L&D tie-break |
| MD-M08 | CourseInfoModal.tsx | 🟡 | STATIC_FALLBACK | `"Campus Institution"` fallback |
| MD-M09 | AppContext + 2 files | 🟡 | STATIC_FALLBACK | DiceBear CDN avatar dependency |
| MD-M10 | CAMDashboard.tsx | 🟡 | TEMPLATE_DATA | Sample subjects hardcoded |
| MD-M11 | 15+ API routes | 🟡 | HARDCODED_CONFIG | `Math.random()` ID generation — no central utility |
| MD-M12 | CAMDashboard.tsx | 🟡 | HARDCODED_CONFIG | "Aided/Self-Financed" for college_1/college_2 |
| MD-M13 | CAM+AdminDashboard | 🟡 | TEMPLATE_DATA | `"Year 1 Section A"` in all templates |
| MD-M14 | students/route.ts | 🟡 | STATIC_FALLBACK | `@university.edu` for students without email |
| **MD-M15** | AppContext.tsx | 🟡 | STATIC_FALLBACK | `"Campus Manager"` as leave approver name |
| **MD-M16** | WeeklyPlanStudio.tsx | 🟡 | STATIC_FALLBACK | `"Subject Matter Expert"` as default verifier |
| **MD-M17** | interview-notifications.ts | 🟡 | STATIC_FALLBACK | `"Campus Manager"` default actor name |
| **MD-M18** | google-calendar.ts | 🟡 | STATIC_FALLBACK | `"Zentra Interview System"` in iCal PRODID |
| **MD-M19** | report-export.ts + CAMDash | 🟡 | MOCK | `Math.random()` in two separate report ID generators |
| **MD-M20** | 8 files | 🟡 | HARDCODED_CONFIG | Semester list hardcoded 6 or 8 — should derive from course years |
| **MD-M21** | Admin+CAMDashboard | 🟡 | STATIC_FALLBACK | 3 different placeholder email domains in forms |
| MD-L01 | faculty-leave/route.ts | 🟢 | STATIC_FALLBACK | `"cam@zentra.edu"` fallback email |
| MD-L02 | CAMDashboard.tsx | 🟢 | STATIC_FALLBACK | "Unassigned Faculty" Excel row |
| MD-L03 | AdminDashboard.tsx | 🟢 | HARDCODED_CONFIG | Slots as "hr(s)" — wrong unit |
| MD-L04 | ExamScheduleManager | 🟢 | MOCK | `Math.random()` exam IDs |
| MD-L05 | InterviewModule.tsx | 🟢 | MOCK | `Math.random()` question IDs |
| MD-L06 | WeeklyPlanStudio.tsx | 🟢 | STATIC_FALLBACK | Excel creator `"Zentra"` |
| MD-L07 | LndAllocationDashboard | 🟢 | STATIC_FALLBACK | Excel creator `"Zentra Timetable Engine"` |
| MD-L08 | weekly-plan/route.ts | 🟢 | STATIC_FALLBACK | Generic verifier name in notification |
| **MD-L09** | google-calendar.ts | 🟢 | MOCK | `Math.random()` iCal UID — causes calendar duplicates |
| **MD-L10** | AppContext.tsx | 🟢 | STATIC_FALLBACK | `"General"` default class group creates orphan slots |
| **MD-L11** | WeeklyPlanStudio.tsx | 🟢 | HARDCODED_CONFIG | `6` hardcoded fallback period count |

---

## All Shared Utilities Needed (5 files, fixes 20+ issues)

```ts
// 1. src/lib/academicYear.ts     → fixes MD-H09 (8 locations)
// 2. src/lib/batchYear.ts        → fixes MD-M03 (2 locations)  
// 3. src/lib/id.ts               → fixes MD-M11 (15+ locations)
// 4. src/lib/auth.ts             → fixes MD-H07 (7 locations)
// 5. src/lib/shiftDefaults.ts    → fixes MD-H12 (6 locations)
// 6. src/lib/semesters.ts        → fixes MD-M20 (8 locations)
```

**Final count: 44 issues** (12 HIGH · 21 MEDIUM · 11 LOW)

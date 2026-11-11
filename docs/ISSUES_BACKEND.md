# Backend Issues — FP E-Campus System
> Last audited: October 2026 | Starting point: Mentor login flow outward

---

## ✅ Closure pass — verified 2026-10-23 against the working tree

All 20 items below are closed. `❌ Open` in each section is the auditor's original
state and is kept for the record. Local gate: `tsc --noEmit` clean, 22 test files /
194 tests pass, `next build` succeeds. Nothing is committed or deployed yet.

| Item | Final state | Where it landed |
| --- | --- | --- |
| BE-C01 | Fixed | `requireAuth` + `ATTENDANCE_READ_ROLES` on GET `/api/attendance` |
| BE-C02 | Fixed | `requireAuth` (admin/cm/kam) on DELETE `/api/attendance` |
| BE-C03 | Fixed | `requireCourseConfigAccess`-style guard on all `/api/subjects` handlers |
| BE-C04 | Fixed | guard on all `/api/courses` handlers |
| BE-H01 | Fixed, wider than reported | 19 UTC-clock date sites → `getInstitutionDateStr()` / `…Offset(n)`; gated by `tests/institution-date-source.test.ts`; `getLocalDateStr()` alias exported |
| BE-H02 | Fixed | mentor window 30d → 90d (`getInstitutionDateStrOffset(-90)`), full role 180d, `LIMIT 20000` |
| BE-H03 | Fixed | `$4::text IS NOT NULL … $5::text` → pure `? IS NOT NULL … ?` in weekly_academic_tasks |
| BE-H04 | Fixed | `EXTRACT(DOW FROM dateStr::date) != 0` → `strftime('%w', dateStr) != '0'` across all attendance SQL in `/api/data` |
| BE-H05 | Resolved | alias intentional; duplicate `courses` key dropped |
| BE-M01 | Fixed | `makeAttendanceId()` uses `crypto.randomUUID()` suffix |
| BE-M02 | Fixed at root | DELETE `/api/courses` scopes every scan by `college_id` via `campusWhere` filter |
| BE-M03 | Fixed | POST rejects an ambiguous campus with an explicit 400; uniqueness college-scoped |
| BE-M04 | Fixed | bulk subject insert wrapped in `db.transaction` |
| BE-M05 | Fixed + escalated | GET `/api/requests` had no auth at all; now guarded and filterable |
| BE-M06 | Fixed | `coveredSubject` added to `ATTENDANCE_WIRE_FIELDS` and all attendance SELECT statements |
| BE-L01 | Already handled | `getWeekDates` applies the `setFullYear` correction |
| BE-L02 | Fixed | super-admin `userId` stored in `superAdminUserIdRef` before modal opens; passed to `setRole` |
| BE-L03 | Satisfied | login derives superadmin from `roleGrantsSuperAdmin(user.role)`, not the client |
| BE-L04 | Fixed | `session_time` split on `to`/en-dash/hyphen in the studio **and** in POST `/api/exams` |
| BE-L05 | Declined, documented | partial-`fields` refactor judged too risky for the payload win |

**NOW() in remaining routes (mentor-attendance, profile-edit-policy, materials) — Fixed 2026-10-23.**
KAM lookup in `/api/interviews/assign` — uses `COALESCE(college_id, origin_college_id)` in SQL join.

Open follow-ups that are outside this file: per-route identity on ~45 remaining
handlers (`src/proxy.ts` only checks cookie *presence*), and the production actions
owned by the operator (commit/deploy, Vercel env vars, Supabase SQL, rotating the
previously committed external DB credential).

---

## 🔴 CRITICAL (Data Exposure / Unauthenticated Mutations)

---

### BE-C01 · `GET /api/attendance` — No Authentication
**File:** `src/app/api/attendance/route.ts`  
**Status:** ❌ Open  

**Problem:**  
The `GET` handler has **no `requireAuth` call**. Any unauthenticated HTTP request can call:
```
GET /api/attendance?college_id=xxx
```
and receive up to 15,000 attendance records including student IDs and statuses. Only the `POST` handler has auth.

**Fix:**
```ts
export async function GET(request: Request) {
  const { auth, errorResponse } = await requireAuth(request, { checkCsrf: false });
  if (errorResponse) return errorResponse;
  // ...rest of handler unchanged
}
```

---

### BE-C02 · `DELETE /api/attendance` — No Authentication
**File:** `src/app/api/attendance/route.ts`  
**Status:** ❌ Open  

**Problem:**  
Same as BE-C01 — the `DELETE` handler has no auth check. Any unauthenticated caller can delete attendance ranges across all campuses using date + college_id params.

**Fix:**
```ts
export async function DELETE(request: Request) {
  const { auth, errorResponse } = await requireAuth(request, {
    allowedRoles: ["admin", "cm", "kam"]
  });
  if (errorResponse) return errorResponse;
  // ...rest unchanged
}
```

---

### BE-C03 · `POST/PUT/DELETE /api/subjects` — No Auth on ANY Mutation
**File:** `src/app/api/subjects/route.ts`  
**Status:** ❌ Open  

**Problem:**  
All three mutation handlers (`POST`, `PUT`, `DELETE`) have no `requireAuth`. Any unauthenticated user can create, update, or delete subjects for any campus.

**Fix:** Add to each handler:
```ts
const { auth, errorResponse } = await requireAuth(request, {
  allowedRoles: ["admin", "kam", "cm"]
});
if (errorResponse) return errorResponse;
```

---

### BE-C04 · `POST/PUT/DELETE /api/courses` — No Auth on ANY Mutation
**File:** `src/app/api/courses/route.ts`  
**Status:** ❌ Open  

**Problem:**  
The most dangerous unauth endpoint. Deleting a course cascades to deleting mentors, students, slots, and user auth records for that entire department — **without any login required**.

**Fix:** Same as BE-C03, add `requireAuth` with `allowedRoles: ["admin", "kam"]` to `POST`, `PUT`, `DELETE`.

---

## 🔴 HIGH (Breaks Core Business Logic)

---

### BE-H01 · UTC vs IST Date Bug — Pervasive
**Files:**  
- `src/app/api/attendance/route.ts` (future-date guard)  
- `src/app/api/data/route.ts` (date thresholds)  
- `src/context/AppContext.tsx` (`getWeekDates`)  
**Status:** ❌ Open  

**Problem:**  
`new Date().toISOString().split("T")[0]` returns **tomorrow's date** after 6:30 PM IST (UTC+5:30). Effects:
- Mentors **cannot mark today's attendance** after 6:30 PM — blocked as "future date"
- Date threshold calculations cut off 1 day early in the evening
- Week start/end calculations can return the wrong weekday

**Specific bad line in `api/attendance/route.ts`:**
```ts
const todayDateStr = new Date().toISOString().split("T")[0]; // ❌ UTC
if (dateStr > todayDateStr) { /* blocks valid today dates after 18:30 IST */ }
```

**Fix — create shared utility `src/lib/localDate.ts`:**
```ts
/** Returns YYYY-MM-DD in the server's local timezone, not UTC */
export function getLocalDateStr(): string {
  return new Date().toLocaleDateString('en-CA'); // always YYYY-MM-DD
}

/** Parses a date string into a local Date object (avoids UTC midnight offset) */
export function parseLocalDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d); // local constructor, not UTC
}
```
Replace all instances of `new Date().toISOString().split("T")[0]` with `getLocalDateStr()`.

---

### BE-H02 · Mentor Attendance Window Too Short (30 Days)
**File:** `src/app/api/data/route.ts`  
**Status:** ❌ Open  

**Problem:**  
The `/api/data` route only returns 30 days of attendance history for mentors:
```ts
const mentorDateThreshold = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
  .toISOString().split('T')[0];
```
But `MentorDashboard` allows navigating the week picker back further than 30 days. Slots beyond the window appear as "unmarked" even when they were marked — allowing accidental re-marking of already-marked attendance.

**Fix:** Increase to 90 days minimum, or accept a `?attendanceDays=N` query param:
```ts
const attDays = Math.min(parseInt(searchParams.get('attendanceDays') || '90'), 365);
const mentorDateThreshold = new Date(Date.now() - attDays * 86400000)
  .toLocaleDateString('en-CA');
```

---

### BE-H03 · Mixed `?` and `$N` Placeholders Crash Student Weekly Tasks Query
**File:** `src/app/api/data/route.ts`  
**Status:** ❌ Open  

**Problem:**  
The `weekly_academic_tasks` query mixes `?` (SQLite/libSQL style) and `$N::text` (PostgreSQL style) in the same SQL string. This is invalid for both databases and always throws a runtime error for the `student` role, silently returning `[]` for weekly academic tasks.

**Fix:** Use consistent `?` placeholders (libSQL/SQLite style) throughout:
```ts
// ❌ BAD
OR ($4::text IS NOT NULL AND mentor_id IN (SELECT id FROM mentors WHERE college_id = $5::text))

// ✅ GOOD  
OR (? IS NOT NULL AND mentor_id IN (SELECT id FROM mentors WHERE college_id = ?))
```

---

### BE-H04 · `EXTRACT(DOW FROM dateStr::date)` — PostgreSQL Syntax on SQLite/Turso
**File:** `src/app/api/data/route.ts`  
**Status:** ❌ Open  

**Problem:**  
Multiple SQL queries use PostgreSQL-specific `EXTRACT(DOW FROM dateStr::date) != 0` to filter Sundays. Turso/libSQL is SQLite-compatible and does not support this syntax — these queries always throw a runtime 500 error.

**Fix:**
```sql
-- ❌ PostgreSQL only
EXTRACT(DOW FROM dateStr::date) != 0

-- ✅ SQLite/Turso compatible
strftime('%w', dateStr) != '0'
```

---

### BE-H05 · `departments` / `courses` Aliasing Is Broken
**File:** `src/app/api/data/route.ts`  
**Status:** ❌ Open  

**Problem:**  
```ts
departments: filteredCourses?.length ? filteredCourses : (departmentsData?.length ? departmentsData : []),
courses: filteredCourses,
```
The `departments` key is set to the `courses` table rows, with `departmentsData` as a fallback. In `AppContext`, `coursesList` is aliased as `departmentsList`. Components consuming `departmentsList` will receive `courses` table data — if the two tables have diverged, ghost entries appear in department dropdowns.

**Fix:** Return them as separate distinct arrays:
```ts
departments: departmentsData ?? [],
courses: filteredCourses ?? [],
```

---

## 🟡 MEDIUM (Logic Errors & Data Integrity)

---

### BE-M01 · Duplicate `att_` IDs in Bulk Attendance Import
**File:** `src/app/api/attendance/route.ts`  
**Status:** ❌ Open  

**Problem:**  
IDs are generated with `Date.now()` inside a synchronous loop:
```ts
id: `att_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
```
Within the same millisecond, multiple rows share the same `Date.now()` prefix. The short random suffix (7 chars) gives ~78 billion combinations — usually fine — but with 200+ rows per batch, the risk of collision is real.

**Fix:** Use loop index as a guaranteed unique disambiguator:
```ts
id: `att_${baseTimestamp}_${i}_${Math.random().toString(36).substring(2, 7)}`
// where baseTimestamp = Date.now() set once before the loop
```

---

### BE-M02 · Course DELETE Uses Full In-Memory Slot Scan
**File:** `src/app/api/courses/route.ts`  
**Status:** ❌ Open  

**Problem:**  
```ts
const allSlots = await db.all("SELECT id, department, classGroup FROM slots");
const slotsToDelete = allSlots.filter(s => isMatch(s.department) || isMatch(s.classGroup));
```
Loads **all slots from all campuses** into Node.js memory and filters in JavaScript. On a multi-campus installation this is O(total slots) on every course delete.

**Fix:** Push the filter into SQL:
```sql
DELETE FROM slots
WHERE college_id = ?
  AND (LOWER(department) = LOWER(?) OR LOWER(classGroup) LIKE ?)
```

---

### BE-M03 · Course POST Null College Silently Skips Uniqueness Check
**File:** `src/app/api/courses/route.ts`  
**Status:** ❌ Open  

**Problem:**  
If `college_id` is not in the request body and the DB has no colleges yet, `targetCollegeId` becomes `null`. The duplicate check becomes `WHERE ... AND college_id IS NULL`, silently allowing duplicate courses per empty campus.

**Fix:** Return 400 if college cannot be resolved:
```ts
if (!targetCollegeId) {
  return NextResponse.json({ success: false, message: "college_id is required" }, { status: 400 });
}
```

---

### BE-M04 · Bulk Subject Insert Has No Transaction — Partial Failures Leave Corrupt State
**File:** `src/app/api/subjects/route.ts`  
**Status:** ❌ Open  

**Problem:**  
Individual `await db.run(INSERT ...)` calls are made inside a loop without a transaction. If row 7 of 20 fails (e.g., constraint violation), rows 1–6 are committed and rows 8–20 are skipped. The subject list is left partially imported with no rollback.

**Fix:**
```ts
await db.run("BEGIN TRANSACTION");
try {
  for (const subject of subjects) {
    await db.run("INSERT INTO subjects ...", [...params]);
  }
  await db.run("COMMIT");
} catch (err) {
  await db.run("ROLLBACK");
  throw err;
}
```

---

### BE-M05 · `/api/requests` Fetched Without Filter — Returns All System Requests
**File:** Used in `src/components/MentorExamMarksStudio.tsx`  
**Status:** ❌ Open  

**Problem:**  
`GET /api/requests` is called with no query params — it returns every handover/approval request in the system. Client-side filtering by `slotId` is done in JS. On large installations this could be thousands of records. Also means a mentor can read other mentors' pending requests if the API doesn't filter by authenticated user.

**Fix:** The API should support:
```
GET /api/requests?slotId=xxx&type=exam_marks_edit&requesterId=userId
```
and the calling component should pass these params.

---

### BE-M06 · `coveredSubject` Missing From Attendance Wire Format
**File:** `src/app/api/data/route.ts`  
**Status:** ❌ Open  

**Problem:**  
```ts
const ATTENDANCE_WIRE_FIELDS = ["id","studentId","slotId","dateStr","status","type",
  "mode","markedBy","timestamp","attendanceTypeSub"]
```
`coveredSubject` is present in the `StudentAttendance` TypeScript interface in AppContext but absent from the wire fields. Any component reading `record.coveredSubject` always gets `undefined`, even if the DB has the value. This is a silent data gap.

**Fix:** Add `"coveredSubject"` to `ATTENDANCE_WIRE_FIELDS` and ensure the SQL `SELECT` includes the column.

---

## 🟢 LOW (Minor Issues & Cleanup)

---

### BE-L01 · `getWeekDates` UTC Weekday Offset
**File:** `src/context/AppContext.tsx`  
**Status:** ❌ Open  

**Problem:**  
`new Date("2024-01-15")` (ISO string constructor) parses at UTC midnight. In IST (UTC+5:30) this is 5:30 AM on the correct day — usually fine. But on DST boundaries or when `baseDateStr` is passed in edge cases, `getDay()` can return the previous day's weekday index.

**Fix:** Use local date constructor:
```ts
// ❌
const today = new Date(baseDateStr);

// ✅
const [y, m, d] = baseDateStr.split('-').map(Number);
const today = new Date(y, m - 1, d); // local, no UTC offset
```

---

### BE-L02 · Super-Admin `setRole` Passes `userId: undefined`
**File:** `src/app/page.tsx`  
**Status:** ❌ Open  

**Problem:**  
In the master role modal:
```ts
setRole(w.id as any, undefined, { isSuperAdmin: true, userName: sessionUserName });
```
`userId` is passed as `undefined`. By the time the modal renders, `data.userId` is out of scope. AppContext uses `userId` to resolve the mentor/CAM record — passing `undefined` means the super-admin's identity is lost after role-switch.

**Fix:** Store `data.userId` in a `useRef` alongside `sessionUserName` so it's available inside the modal handler.

---

### BE-L03 · `isSuperAdmin` Trusted Entirely From Client Response
**File:** `src/app/page.tsx`  
**Status:** ⚠️ Monitor  

**Problem:**  
```ts
const isSuperAdmin = !!data.isSuperAdmin;
```
The super-admin flag comes entirely from the `/api/login` response. If this endpoint ever returns `isSuperAdmin: true` without proper server-side validation, any user becomes a super-admin on the client. Each individual API route does check roles via `requireAuth`, which mitigates actual data access — but the UI will incorrectly show the master role modal.

**Recommendation:** Confirm `/api/login` derives this flag from the DB role column, not from a request body field.

---

### BE-L04 · `session_time` Format `"AM to PM"` Breaks `isExamOver`
**File:** `src/components/MentorExamMarksStudio.tsx`  
**Status:** ❌ Open  

**Problem:**  
```ts
const endTimeStr = (selectedExam.session_time || "").split("-")[1]?.trim() || "05:00 PM";
```
When `session_time` is `"9.00 AM to 12.00 PM"` (no hyphen), `.split("-")[1]` is `undefined` → falls back to `"05:00 PM"`. All afternoon exams appear as "not over" until 5 PM.

**Fix:** Handle both formats:
```ts
const sessionTimeStr = selectedExam.session_time || "";
const endPart = sessionTimeStr.includes(" to ")
  ? sessionTimeStr.split(" to ")[1]
  : sessionTimeStr.split("-")[1];
const endTimeStr = endPart?.trim() || "05:00 PM";
```

---

### BE-L05 · Monolithic `/api/data` Response — No Partial Field Support
**File:** `src/app/api/data/route.ts`  
**Status:** ⚠️ Performance  

**Problem:**  
The entire app state (mentors, slots, students, attendance, interviews, academic tracker, etc.) is fetched in one shot. For a mentor with 500 students and 6 months of attendance, this can exceed 1 MB of JSON. On mobile or slow connections this stalls the dashboard for 3–8 seconds.

A `fields=attendance` fast path exists, but no equivalent for other sub-sections.

**Recommendation:** Extend the `fields` query param to support comma-separated sections: `fields=slots,requests`. Use this for targeted refetches after mutations instead of always calling `refreshData()`.

---

## Summary Count

| Severity | Count | Fixed |
|----------|-------|-------|
| 🔴 Critical | 4 | 0 |
| 🔴 High | 5 | 0 |
| 🟡 Medium | 6 | 0 |
| 🟢 Low | 5 | 0 |
| **Total** | **20** | **0** |

---

## Fix Priority Queue

```
1. BE-C01  Add requireAuth to GET /api/attendance
2. BE-C02  Add requireAuth to DELETE /api/attendance
3. BE-C03  Add requireAuth to all /api/subjects mutations
4. BE-C04  Add requireAuth to all /api/courses mutations
5. BE-H01  Fix UTC→IST date bug (shared getLocalDateStr utility)
6. BE-H02  Extend mentor attendance window 30d → 90d
7. BE-H03  Fix mixed ?/$N SQL placeholders in weekly tasks query
8. BE-H04  Replace EXTRACT(DOW) with strftime('%w') for SQLite
9. BE-H05  Fix departments/courses aliasing in /api/data
10. BE-M01  Fix duplicate att_ IDs in bulk import
11. BE-M02  Push course slot deletion into SQL (no in-memory scan)
12. BE-M03  Return 400 when college_id is null in course POST
13. BE-M04  Wrap bulk subject insert in a transaction
14. BE-M05  Add slotId/type filters to /api/requests
15. BE-M06  Add coveredSubject to attendance wire format
16. BE-L01  Fix getWeekDates local date constructor
17. BE-L02  Store userId in ref for super-admin modal
18. BE-L03  Verify isSuperAdmin is DB-derived not body-injected
19. BE-L04  Handle "AM to PM" format in isExamOver
20. BE-L05  Extend /api/data fields param for partial refetches
```

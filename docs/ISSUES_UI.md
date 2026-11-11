# UI / Frontend Issues — FP E-Campus System
> Last audited: October 2026 | Starting point: Mentor login flow outward

---

## 🔴 HIGH (Breaks Core User Flows)

---

### UI-H01 · Login Double-Redirect Race Condition
**File:** `src/app/page.tsx`  
**Status:** ❌ Open  

**Problem:**  
`handleLoginSubmit` calls `router.push(getRoleHomePath(data.role))` directly after setting role state. But a `useEffect` also fires when `isAuthenticated` becomes `true` and calls `router.replace(getRoleHomePath(activeRole))`. Both fire near-simultaneously. If the role stored in the JWT session differs slightly from `data.role` (e.g., normalisation differences like `"cm"` vs `"Campus Manager"`), the user can land on the wrong dashboard.

**Current flow (broken):**
```
handleLoginSubmit → setRole() → router.push(path)   ← fires immediately
useEffect [isAuthenticated] → router.replace(path)   ← fires 1 tick later
```

**Fix:** Remove `router.push` from `handleLoginSubmit`. The `useEffect` should be the single redirect authority:
```ts
// In handleLoginSubmit — remove this:
router.push(getRoleHomePath(data.role)); // ❌

// Keep only the useEffect redirect:
useEffect(() => {
  if (isAuthenticated && activeRole) {
    router.replace(getRoleHomePath(activeRole));
  }
}, [isAuthenticated, activeRole]);
```

---

### UI-H02 · Route Protection Fires Too Early — Valid Users Kicked to Login
**File:** `src/components/DashboardLayout.tsx`  
**Status:** ❌ Open  

**Problem:**  
`hasCompletedInitialLoad` is set to `true` as soon as both `isLoading` and `isDataLoading` are `false`. These can both be `false` during the brief startup window *before* AppContext's first fetch has begun (they start as `false`). The route guard fires, sees `isAuthenticated = false`, and redirects the user back to `/` — even though a valid session exists.

**Symptom:** On page refresh, the user is sometimes briefly kicked to the login page then immediately redirected back.

**Fix:** Initialise `hasCompletedInitialLoad` differently — only set it after the first successful data response, not just when loading flags become false:
```ts
// Add an explicit "data arrived" flag
const [dataArrived, setDataArrived] = useState(false);
useEffect(() => {
  if (!isLoading && !isDataLoading && (mentors.length > 0 || isAuthenticated)) {
    setDataArrived(true);
  }
}, [isLoading, isDataLoading, mentors.length, isAuthenticated]);

// Only run protection after data has arrived
if (!dataArrived) return <ProfessionalLoader />;
```

---

### UI-H03 · `WeeklyPlanStudio` Shows Completely Blank on First Open
**File:** `src/components/WeeklyPlanStudio.tsx`  
**Status:** ❌ Open  

**Problem:**  
`generateDefaultTasksForWeek` has an early return:
```ts
if (dayOrderSource !== "cam") return; // Skip if Day Order not set by CAM
```
When `WeeklyPlanStudio` first mounts, `dailyConfigsLoaded` is still `false` → `dailyConfigsMap` is empty → every day evaluates as `dayOrderSource !== "cam"` → every day is skipped → the mentor sees a completely blank planning grid with no message explaining why.

**Fix:** Add a guard in the `useEffect` that calls `loadPlanForWeek`:
```ts
useEffect(() => {
  if (!dailyConfigsLoaded) return; // ← add this
  if (!plansLoaded) return;
  loadPlanForWeek(currentWeekStart);
}, [dailyConfigsLoaded, plansLoaded, currentWeekStart, loadPlanForWeek]);
```
Also show a loading state instead of blank:
```tsx
if (!dailyConfigsLoaded) {
  return <div className="p-8 text-center text-gray-400">Loading day order configuration…</div>;
}
```

---

### UI-H04 · All Exams Shown to All Mentors Regardless of Their Subjects
**File:** `src/components/MentorExamMarksStudio.tsx`  
**Status:** ❌ Open  

**Problem:**  
The mentor-subject filter in `filteredExams` was commented out. Every mentor sees every exam scheduled for their entire campus, including exams for subjects they don't teach. A mentor can open any exam and enter marks.

**Current (broken):**
```ts
const filteredExams = useMemo(() => {
  return exams.filter(ex => {
    // Mentor filter was here but removed
    ...
  });
}, [exams, examSearch, examTabFilter, todayStr]);
```

**Fix:** Restore the mentor subject filter:
```ts
const mentorSubjects = useMemo(() =>
  currentMentor?.subjects
    ? currentMentor.subjects.split(/\n|,/).map(s => s.trim().toLowerCase()).filter(Boolean)
    : []
, [currentMentor]);

const filteredExams = useMemo(() => {
  return exams.filter(ex => {
    // Only show exams for this mentor's subjects
    if (mentorSubjects.length > 0 && !mentorSubjects.includes(ex.subject_name?.toLowerCase())) {
      return false;
    }
    // ...rest of filters
  });
}, [exams, mentorSubjects, examSearch, examTabFilter, todayStr]);
```

---

### UI-H05 · Exam Marks Save Silently Fails in Production (Missing CSRF)
**File:** `src/components/MentorExamMarksStudio.tsx`  
**Status:** ❌ Open  

**Problem:**  
`handleSaveMarks` and `handleSubmitMarkEditRequest` use raw `fetch()` instead of `apiFetch()`. The `apiFetch` utility injects the CSRF token header automatically. Without it, any API route that has `checkCsrf: true` returns a `403 Forbidden` — the save silently fails and the mentor gets a generic error toast.

**Current (broken):**
```ts
const res = await fetch("/api/exams/marks", { // ❌ no CSRF header
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(payload),
});
```

**Fix:**
```ts
import { apiFetch } from "@/lib/apiFetch";

const data = await apiFetch("/api/exams/marks", { // ✅ CSRF injected
  method: "POST",
  body: JSON.stringify(payload),
});
```

---

## 🟡 MEDIUM (Logic Errors That Affect UX)

---

### UI-M01 · Attendance Lock Shows as Locked During Entire Data Load
**File:** `src/components/MentorDashboard.tsx`  
**Status:** ❌ Open  

**Problem:**  
`attendanceLockEnabled` defaults to `true` in AppContext state and is only updated when `/api/data` returns the `systemSettings`. During the full data-load window (can be 2–5 seconds), the punch widget shows as locked even if the admin has disabled the lock policy. Mentors see a false "locked" state every time they refresh.

**Fix:** Change the default to `false` and only enable it after data loads, or show a skeleton state on the punch widget while `isDataLoading` is `true`:
```tsx
{isDataLoading ? (
  <Skeleton className="h-20 w-full rounded-xl" />
) : (
  <PunchWidget locked={isPunchLocked} />
)}
```

---

### UI-M02 · `endDate` Whitespace String Causes Infinite Loop Risk in Leave Panel
**File:** `src/components/MentorDashboard.tsx` — `MentorFacultyLeavePanel`  
**Status:** ❌ Open  

**Problem:**  
```ts
const [eY, eM, eD] = (endDate || startDate).split("-").map(Number);
```
If `endDate` is a whitespace string `" "` (e.g., pasted from clipboard), the `||` short-circuit does NOT fire (empty string falsifies, whitespace doesn't). `" ".split("-")` returns `[" "]` → `eY = NaN` → `new Date(NaN, NaN, NaN)` → the `while(cur <= end)` loop condition is never false (NaN comparison) → **browser hangs**.

**Fix:**
```ts
const safeEnd = (endDate || "").trim() || startDate;
const [eY, eM, eD] = safeEnd.split("-").map(Number);
```

---

### UI-M03 · Cover Options Fire N Fetches Per Keystroke (No Deduplication)
**File:** `src/components/MentorDashboard.tsx` — `MentorFacultyLeavePanel`  
**Status:** ❌ Open  

**Problem:**  
A `useEffect` fires one `fetch()` per affected slot whenever `affectedSlots` changes. `affectedSlots` is recalculated on every date field change (every keypress). A 5-day leave with 10 daily slots fires **10 concurrent fetches per keystroke** with no cancellation, deduplication, or loading guard.

**Fix:** Check before fetching, and add debounce:
```ts
const key = `${item.slot.id}_${item.dateStr}`;
// Skip if already loaded or loading
if (coverOptions[key]?.mentors?.length > 0 || coverOptions[key]?.loading) return;
setCoverOptions(prev => ({ ...prev, [key]: { ...prev[key], loading: true } }));
```
Also wrap the `useEffect` trigger in a 400ms debounce.

---

### UI-M04 · `WeeklyPlanStudio` Date Change Doesn't Restore Missing Days
**File:** `src/components/WeeklyPlanStudio.tsx`  
**Status:** ❌ Open  

**Problem:**  
`handleStartDateChange` maps over existing `dailyTasks` to update dates — but only updates already-present days. Days that were absent (because CAM day orders weren't configured when the plan was first loaded) remain absent even if day orders are now configured.

**Symptom:** Mentor picks a new week start date — Monday appears, but Wednesday (which had no prior task) is still missing.

**Fix:** After updating dates, regenerate any missing days:
```ts
const existingDays = new Set(updated.map(t => t.day));
const allDays = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
const missingDays = allDays.filter(d => !existingDays.has(d));
if (missingDays.length > 0) {
  const newTasks = generateDefaultTasksForWeek(newStartDate, missingDays);
  setDailyTasks([...updated, ...newTasks]);
}
```

---

### UI-M05 · Hardcoded Batch Year Ranges Break Every New Academic Year
**File:** `src/components/MentorProfileModal.tsx`  
**Status:** ❌ Open  

**Problem:**  
```ts
if (cg.includes("2026-2029")) return "1st Year";
if (cg.includes("2025-2028")) return "2nd Year";
if (cg.includes("2024-2027")) return "3rd Year";
```
These strings are hardcoded. Starting from the 2027–2030 batch, no student will see a year label — the function returns `undefined` and displays nothing.

**Fix:** Compute dynamically:
```ts
function getYearForClass(cg: string): string | undefined {
  const match = cg.match(/(\d{4})-\d{4}/);
  if (!match) return undefined;
  const batchStart = parseInt(match[1]);
  const currentYear = new Date().getFullYear();
  const yearOfStudy = currentYear - batchStart + 1;
  const labels = ["1st Year", "2nd Year", "3rd Year", "4th Year"];
  return labels[yearOfStudy - 1] ?? `Year ${yearOfStudy}`;
}
```

---

### UI-M06 · DashboardLayout `visibilitychange` Listener Leaks on Every Mount
**File:** `src/components/DashboardLayout.tsx`  
**Status:** ❌ Open  

**Problem:**  
```ts
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") handleWindowFocus();
});
```
The anonymous function is never stored in a variable, so it cannot be removed in the `useEffect` cleanup. Every mount/unmount cycle adds another copy of this listener. After the user navigates between pages a few times, switching browser tabs triggers `refreshData()` multiple times simultaneously.

**Fix:**
```ts
useEffect(() => {
  const handleVisibility = () => {
    if (document.visibilityState === "visible") handleWindowFocus();
  };
  document.addEventListener("visibilitychange", handleVisibility);
  return () => document.removeEventListener("visibilitychange", handleVisibility); // ← missing
}, [handleWindowFocus]);
```

---

### UI-M07 · `mentor.classes` Split Breaks for CSV-Imported Classes
**File:** `src/components/MentorProfileModal.tsx`  
**Status:** ❌ Open  

**Problem:**  
```ts
const classesArray = mentor.classes
  ? mentor.classes.split("\n").map(c => c.trim()).filter(Boolean)
  : [];
```
Only splits on newlines. Mentors imported via the bulk-import Excel template have classes stored as comma-separated strings (e.g., `"III BCA, II BCA"`). These display as one combined label `"III BCA, II BCA"` instead of two separate chips.

The `subjects` field already uses the correct multi-delimiter regex — `classes` should match.

**Fix:**
```ts
const classesArray = mentor.classes
  ? mentor.classes.split(/\n|,|;/).map(c => c.trim()).filter(Boolean)
  : [];
```

---

## 🟢 LOW (Polish & Minor Inconsistencies)

---

### UI-L01 · `sessionLoading` State Declared But Never Used
**File:** `src/app/page.tsx`  
**Status:** ❌ Open  

**Problem:**  
```ts
const [sessionLoading, setSessionLoading] = useState(true);
```
`setSessionLoading` is never called anywhere in the file. The state is dead code. If the original intent was to show a spinner while checking the session, it's broken.

**Fix:** Remove the state entirely, or implement it:
```ts
// Remove if not needed:
// const [sessionLoading, setSessionLoading] = useState(true);
```

---

### UI-L02 · "Extra Cover" Badge Shows All-Time Count, Metric Shows Current Week
**File:** `src/components/MentorProfileModal.tsx`  
**Status:** ❌ Open  

**Problem:**  
The left panel shows:
- `"0 extra hrs"` — calculated from `weeklyCoveredSlots` (current week only)
- Tab badge `(50)` — from `coveredHandovers.length` (all-time)

A mentor with 50 lifetime handovers but 0 this week sees `"0 extra hrs"` + `"(50)"` in the tab header — contradictory and confusing.

**Fix:** Make both use the same time window, and label it clearly:
```tsx
<span className="text-[10px] text-gray-400">All-time: {coveredHandovers.length} covers</span>
<span className="text-[10px] text-gray-400">This week: {weeklyCoveredSlots.length} hrs extra</span>
```

---

### UI-L03 · Super-Admin Role Modal `isAuthorized` Race Condition
**File:** `src/components/DashboardLayout.tsx`  
**Status:** ❌ Open  

**Problem:**  
When a super-admin uses the master role modal to switch to `/mentor`, they navigate before `currentRole` updates to `"mentor"`. `DashboardLayout` computes:
```ts
const isAuthorized = isAuthenticated && (isSuperAdmin || currentRole === requiredRole);
```
During the 1–2 render cycles between navigation and role update, `currentRole` is still `"admin"` and `requiredRole` is `"mentor"` → `isAuthorized = false` → the user sees `ProfessionalLoader` indefinitely.

**Fix:** The `isSuperAdmin` flag should always shortcut the authorization check:
```ts
const isAuthorized = isAuthenticated && (isSuperAdmin || normalizeRoleValue(currentRole) === normalizeRoleValue(requiredRole));
// isSuperAdmin should be checked FIRST — and it is, but verify the flag
// is synchronously stored in localStorage before the navigate call
```
Ensure `setRole(...)` writes `isSuperAdmin: true` to localStorage **before** `router.push`.

---

### UI-L04 · `WeeklyPlanStudio` Unnecessary Re-Evaluation on Every Data Refresh
**File:** `src/components/WeeklyPlanStudio.tsx`  
**Status:** ⚠️ Performance  

**Problem:**  
`loadPlanForWeek` is a `useCallback` that depends on `plans`. `plans` changes on every `refreshData()`. The main `useEffect` has `loadPlanForWeek` in its dep array, so it fires on every data refresh — even when the user has unsaved edits. The `isDirtyRef.current` guard prevents actual data loss, but the effect still evaluates every time.

**Fix:** Split the effect into two:
```ts
// Effect 1: Initial load only (runs once)
useEffect(() => {
  if (!dailyConfigsLoaded || !plansLoaded || hasInitiallyLoaded.current) return;
  hasInitiallyLoaded.current = true;
  loadPlanForWeek(currentWeekStart);
}, [dailyConfigsLoaded, plansLoaded]);

// Effect 2: Week navigation (user-driven only)
useEffect(() => {
  if (!hasInitiallyLoaded.current) return;
  loadPlanForWeek(currentWeekStart);
}, [currentWeekStart]);
```

---

### UI-L05 · Announcement Cards Use Raw `<button>` + Custom Disabled Pattern
**File:** `src/components/AdminDashboard.tsx` — Announcements tab  
**Status:** ❌ Open  

**Problem:**  
The delete button on announcement cards still uses a raw `<button>` with manual `disabled` + `Loader2` spinner pattern — not the `Button` shadcn component with `isLoading` prop:
```tsx
<button
  onClick={() => handleDeleteAnnouncement(ann.id)}
  disabled={loadingActions[`announcement_${ann.id}`]}
  className="p-1 hover:bg-rose-50 text-gray-400 ..."
>
  {loadingActions[`announcement_${ann.id}`] ? <Loader2 .../> : <Trash2 .../>}
</button>
```

**Fix:**
```tsx
<Button
  variant="ghost"
  size="icon"
  onClick={() => handleDeleteAnnouncement(ann.id)}
  isLoading={loadingActions[`announcement_${ann.id}`]}
>
  <Trash2 className="h-3.5 w-3.5" />
</Button>
```

---

### UI-L06 · `StatusBadge` Was Not Using shadcn `Badge` Component
**File:** `src/components/dashboard/StatusBadge.tsx`  
**Status:** ✅ Fixed  

Was wrapping its own `<span>` with manual Tailwind classes instead of delegating to `<Badge variant="...">`. Fixed in the shadcn audit session.

---

### UI-L07 · `Select.tsx` Is a Raw Native `<select>` — No shadcn Equivalent Used
**File:** `src/components/Select.tsx`  
**Status:** ⚠️ Open  

The project has a fully featured `Combobox` component in `ui/combobox.tsx` with search, icons, and keyboard navigation. The standalone `Select.tsx` is a plain native `<select>` styled with Tailwind. Components that need a searchable dropdown are importing `Select` when they should use `Combobox`.

**Fix:** Keep `Select` for simple non-searchable dropdowns (it's fine). For searchable/complex dropdowns, prefer `Combobox` from `ui/combobox.tsx`.

---

### UI-L08 · CAMDashboard, KAMDashboard, WeeklyPlanStudio Not Migrated to shadcn
**Files:**  
- `src/components/CAMDashboard.tsx` — 0 shadcn imports, ~8 raw `<table>` elements  
- `src/components/KAMDashboard.tsx` — 0 shadcn imports, ~3 raw `<table>` elements  
- `src/components/WeeklyPlanStudio.tsx` — 0 shadcn imports, ~4 raw `<table>` elements  
**Status:** ❌ Open  

These are the three largest components that still use raw HTML tables, manual `<button className="px-3...">`, and inline status `<span>` badges — inconsistent with AdminDashboard which was fully migrated.

---

## Summary Count

| Severity | Count | Fixed |
|----------|-------|-------|
| 🔴 High | 5 | 0 |
| 🟡 Medium | 7 | 0 |
| 🟢 Low | 8 | 1 ✅ |
| **Total** | **20** | **1** |

---

## Fix Priority Queue

```
1. UI-H01  Fix login double-redirect race (page.tsx)
2. UI-H02  Fix route protection early fire (DashboardLayout)
3. UI-H03  Fix WeeklyPlanStudio blank first load
4. UI-H04  Restore mentor subject filter in ExamStudio
5. UI-H05  Replace raw fetch() with apiFetch() in ExamStudio
6. UI-M01  Show skeleton on punch widget while data loads
7. UI-M02  Fix whitespace endDate infinite loop risk
8. UI-M03  Debounce + deduplicate cover options fetches
9. UI-M04  Regenerate missing days on week date change
10. UI-M05  Dynamic batch year calculation in ProfileModal
11. UI-M06  Fix visibilitychange listener leak
12. UI-M07  Fix mentor.classes comma split
13. UI-L01  Remove dead sessionLoading state
14. UI-L02  Align time window on Extra Cover display
15. UI-L03  Ensure isSuperAdmin persists before navigate
16. UI-L04  Split WeeklyPlanStudio useEffect into initial/navigation
17. UI-L05  Migrate announcement delete to Button isLoading
18. UI-L07  Audit Select vs Combobox usage across components
19. UI-L08  Migrate CAMDashboard to shadcn components
20. UI-L08  Migrate KAMDashboard to shadcn components
```

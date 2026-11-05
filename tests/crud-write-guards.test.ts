import { existsSync, readdirSync, readFileSync, statSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";

/**
 * Structural guards distilled from scratch/crud_popup_audit_v3.cjs. The audit is a
 * heuristic sweep (it reports false positives on every run); this file pins only the
 * invariants the CRUD remediation waves actually established, so removing one of the
 * protections fails a gate instead of shipping again silently.
 */
const root = process.cwd();
const read = (rel: string) => readFileSync(join(root, rel), "utf8");

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) sourceFiles(full, out);
    else if (/\.(ts|tsx)$/.test(full)) out.push(full);
  }
  return out;
}

/** Body of `const NAME = (…) => {` or `function NAME(…) {` declared in the same file. */
function handlerBody(src: string, name: string): string | null {
  const patterns = [
    new RegExp(`const\\s+${name}\\s*=\\s*(?:async\\s*)?\\(([^)]*)\\)\\s*(?::[^=\\n]+)?=>\\s*\\{`),
    new RegExp(`function\\s+${name}\\s*\\(([^)]*)\\)\\s*(?::[^{\\n]+)?\\{`)
  ];
  for (const re of patterns) {
    const m = re.exec(src);
    if (!m) continue;
    const openIdx = m.index + m[0].length - 1;
    let depth = 0;
    for (let i = openIdx; i < src.length; i++) {
      if (src[i] === "{") depth++;
      else if (src[i] === "}" && --depth === 0) return src.slice(openIdx, i + 1);
    }
  }
  return null;
}

describe("CRUD write guards", () => {
  it("never calls the browser's native confirm() or alert() from UI code", () => {
    // A print-popup-blocked notice is the one place a blocking alert is the right tool.
    const allowed = new Map<string, string>([
      ["/src/lib/report-export.ts", "print pop-up blocker notice"]
    ]);
    const violations: string[] = [];
    let scanned = 0;

    for (const file of sourceFiles(join(root, "src"))) {
      const rel = file.replace(root, "").replace(/\\/g, "/");
      const src = readFileSync(file, "utf8");
      scanned++;
      src.split("\n").forEach((line, i) => {
        if (/^\s*(\/\/|\*|\/\*)/.test(line)) return;
        if (allowed.has(rel)) return;
        const re = /(^|[^.\w])(confirm|alert)\s*\(/g;
        let m: RegExpExecArray | null;
        while ((m = re.exec(line))) {
          violations.push(`${rel}:${i + 1} native ${m[2]}() — ${line.trim().slice(0, 90)}`);
        }
      });
    }

    expect(violations).toEqual([]);
    expect(scanned, "guard must keep reading source, not pass vacuously").toBeGreaterThan(150);
  });

  it("confirms every destructive handler before it writes", () => {
    const destructive: Array<[string, string]> = [
      ["/src/components/admin/people/CamsTab.tsx", "handleDeleteCam"],
      ["/src/components/admin/people/KamsTab.tsx", "handleDeleteKam"],
      ["/src/components/admin/people/SmesTab.tsx", "handleDeleteSme"],
      ["/src/components/admin/operations/AnnouncementsTab.tsx", "handleDeleteAnnouncement"],
      ["/src/components/admin/operations/HolidaysTab.tsx", "handleDeleteHoliday"],
      ["/src/components/FeeManagerDashboard.tsx", "handleDeleteFee"],
      ["/src/components/InterviewModule.tsx", "handleDeleteInterview"],
      ["/src/components/CAMDashboard.tsx", "handleSaveYear"],
      ["/src/components/CAMDashboard.tsx", "handleAutoAdaptNextWeek"],
      ["/src/components/LndAllocationDashboard.tsx", "handleQuickAllocateMentor"]
    ];

    const violations: string[] = [];
    for (const [rel, name] of destructive) {
      const body = handlerBody(read(rel), name);
      if (!body) {
        violations.push(`${rel}: ${name}() not found`);
        continue;
      }
      const confirms = body.includes("showConfirm(") || body.includes("confirm(");
      const reports = /toast[A-Za-z]*\(/.test(body) || /set[A-Za-z]*Error\(/.test(body);
      if (!confirms) violations.push(`${rel}: ${name}() writes without a confirm prompt`);
      if (!reports) violations.push(`${rel}: ${name}() writes without visible feedback`);
    }
    expect(violations).toEqual([]);
  });

  it("keeps per-row pending state wired on approve/reject/delete actions", () => {
    const pending: Array<[string, string]> = [
      ["/src/components/lnd/LndQueueTab.tsx", "resolvingSwapId"],
      ["/src/components/lnd/modals/LndSwapRequestsModal.tsx", "resolvingSwapId"],
      ["/src/components/SMEDashboard.tsx", "resolvingSwapId"],
      ["/src/components/MentorDashboard.tsx", "resolvingDemoSwapId"],
      ["/src/components/MentorDashboard.tsx", "resolvingHandoverReqId"],
      ["/src/components/MentorDashboard.tsx", "deletingWeeklyTask"],
      ["/src/components/MentorDashboard.tsx", "deletingAcadWeeklyTask"],
      ["/src/components/FeeManagerDashboard.tsx", "deletingFeeId"],
      ["/src/components/InterviewModule.tsx", "deletingInterviewId"]
    ];

    for (const [rel, name] of pending) {
      const src = read(rel);
      // Declaration + setter + at least one read in a disabled/loading prop.
      expect(src.split(name).length - 1, `${rel} lost ${name}`).toBeGreaterThanOrEqual(3);
      expect(src, `${rel} no longer disables its button via ${name}`).toMatch(
        new RegExp(`disabled=\\{[^}]*${name}`)
      );
    }
  });

  it("keeps attendance bulk import idempotent so a retry cannot duplicate rows", () => {
    const route = read("/src/app/api/attendance/route.ts");
    expect(route).toMatch(/ON CONFLICT\(studentId, slotId, dateStr\)\s+DO UPDATE/);

    // The importer must say how far it got and that a re-run is safe.
    const cam = read("/src/components/CAMDashboard.tsx");
    expect(cam).toContain("already-saved entries are updated, not duplicated");
    expect(cam).toMatch(/Only \$\{totalCount\} of \$\{recordsToPost\.length\}/);
  });

  it("broadcasts CAM, KAM, holiday and announcement writes to the other portals", () => {
    const app = read("/src/context/AppContext.tsx");
    for (const domain of ["cams", "kams"]) {
      expect(app.split(`broadcastDataChanged("${domain}")`).length - 1, `${domain} broadcast count`).toBeGreaterThanOrEqual(3);
    }

    expect(read("/src/components/admin/operations/HolidaysTab.tsx")).toContain('notifyDataChanged("holidays")');
    expect(read("/src/components/admin/operations/AnnouncementsTab.tsx")).toContain('notifyDataChanged("announcements")');
    expect(read("/src/components/ExamScheduleManager.tsx")).toContain('announceDataChanged("exams")');
    expect(read("/src/components/MentorDashboard.tsx")).toContain('announceDataChanged("demos")');
  });

  it("keeps the dead CRUD surfaces deleted or unimported", () => {
    // oldadmin.tsx lives under archive/components/ for historical reference. It is outside
    // tsconfig's include, so the only way it back into the app is an explicit import.
    const admin = read("/src/components/AdminDashboard.tsx");
    expect(admin).not.toContain("oldadmin");

    const cam = read("/src/components/CAMDashboard.tsx");
    expect(cam).not.toContain("class-teachers");
    expect(cam).not.toContain("handleMarkAllPresentForDay");
  });
});

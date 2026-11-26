import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

/**
 * docs/ISSUES_BACKEND.md BE-C01..C04 and BE-M05: several routes served reads and
 * cascading deletes with no session check at all, and there is no middleware in
 * this app to fall back on — authentication is per-route via requireAuth. These
 * handlers are the regression gate; adding a handler to one of these files
 * without a guard fails here.
 */
const ROUTES: Record<string, string[]> = {
  "src/app/api/attendance/route.ts": ["GET", "POST", "DELETE"],
  "src/app/api/subjects/route.ts": ["GET", "POST", "PUT", "DELETE"],
  "src/app/api/courses/route.ts": ["GET", "POST", "PUT", "DELETE"],
  "src/app/api/requests/route.ts": ["GET", "POST"],
  "src/app/api/data/route.ts": ["GET"],
  // Second tranche: these all mutated rows and/or fired mail with no session at
  // all, and none of them imported authGuard before the fix.
  "src/app/api/requests/review/route.ts": ["POST"],
  "src/app/api/requests/faculty-leave/route.ts": ["GET", "POST"],
  "src/app/api/requests/swap/route.ts": ["POST"],
  "src/app/api/requests/leave/route.ts": ["GET", "POST", "PUT"],
  "src/app/api/requests/demo-swap/route.ts": ["GET", "POST"],
  "src/app/api/announcements/route.ts": ["GET", "POST", "DELETE"],
  "src/app/api/student-tracker/route.ts": ["POST", "PUT", "DELETE"],
  // Campus calendar: reads feed the mentor/student/CM dashboards, so GET only needs a
  // session, but the anonymous DELETE was wiping day-order rows for any caller.
  "src/app/api/daily-configs/route.ts": ["GET", "POST", "DELETE"],
  "src/app/api/demo-sessions/route.ts": ["GET", "POST", "DELETE"],
  // The placement roster is a full copy of another Supabase project's student
  // data (names, emails, CGPA, arrears, offers, CTC) and served it anonymously.
  "src/app/api/audit/placement/route.ts": ["GET"],
  // Department criteria drive the compliance checklist and the escalation mail,
  // so an anonymous caller could rewrite what every SME is graded against.
  "src/app/api/demo-eval-criteria/route.ts": ["GET", "POST"],
  // The survey writes against the signed-in student's own profile and the report
  // exposes another campus's sentiment, so neither leg may run anonymously.
  "src/app/api/audit/student-nps/route.ts": ["GET", "POST"],
  "src/app/api/sme-leaves/route.ts": ["GET", "POST", "DELETE"]
};

/** Returns the source of each `export async function <NAME>` block. */
function handlerBlocks(source: string): Map<string, string> {
  const blocks = new Map<string, string>();
  const re = /export\s+async\s+function\s+(\w+)\s*\(/g;
  const hits: { name: string; start: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(source))) hits.push({ name: m[1], start: m.index });
  hits.forEach((hit, i) => {
    const end = i + 1 < hits.length ? hits[i + 1].start : source.length;
    blocks.set(hit.name, source.slice(hit.start, end));
  });
  return blocks;
}

/**
 * Local wrappers that end up calling requireAuth, so a route may factor the
 * role list out of every handler without slipping past this gate.
 */
function guardNames(source: string): string[] {
  const names: string[] = [];
  const re = /(?:async\s+)?function\s+(\w+)\s*\([^)]*\)[^{]*\{([\s\S]*?)\n\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source))) {
    if (/requireAuth\(/.test(m[2])) names.push(m[1]);
  }
  return names;
}

function isGuarded(block: string, guards: string[]): boolean {
  if (/require(Auth|Role|Session)\(/.test(block)) return true;
  return guards.some((name) => new RegExp(`\\b${name}\\(`).test(block));
}

describe("API routes require a verified session", () => {
  for (const [file, methods] of Object.entries(ROUTES)) {
    const source = readFileSync(resolve(process.cwd(), file), "utf8");
    const blocks = handlerBlocks(source);
    const guards = guardNames(source);

    for (const method of methods) {
      it(`${file} defines ${method} and guards it with requireAuth/requireRole/requireSession`, () => {
        const block = blocks.get(method);
        expect(block, `${method} handler missing in ${file}`).toBeDefined();
        expect(isGuarded(block as string, guards)).toBe(true);
      });
    }
  }

  it("does not let a student session read the campus-wide attendance feed", () => {
    const source = readFileSync(resolve(process.cwd(), "src/app/api/attendance/route.ts"), "utf8");
    const roles = source.match(/const ATTENDANCE_READ_ROLES[^=]+=\s*\[([\s\S]*?)\]/);
    expect(roles, "ATTENDANCE_READ_ROLES not found").toBeTruthy();
    expect(roles![1]).not.toMatch(/"student"/);
    expect(roles![1]).toMatch(/"admin"/);
  });

  it("keeps course deletion scoped to one campus", () => {
    const source = readFileSync(resolve(process.cwd(), "src/app/api/courses/route.ts"), "utf8");
    const deleteBlock = handlerBlocks(source).get("DELETE") as string;
    expect(deleteBlock).toMatch(/courseCollegeId/);
    expect(deleteBlock).toMatch(/college_id = \? OR college_id IS NULL/);
  });

  it("splits the tracker handler so students submit but cannot grade", () => {
    const source = readFileSync(resolve(process.cwd(), "src/app/api/student-tracker/route.ts"), "utf8");
    const putBlock = handlerBlocks(source).get("PUT") as string;
    expect(putBlock).toMatch(/normalizeRole\(auth\.user\.role\) === "student"/);
    expect(putBlock).toMatch(/studentId !== selfId/);
    expect(putBlock).toMatch(/marks !== undefined \|\| vivaAssessment !== undefined \|\| gradedBy !== undefined/);
  });

  it("lets the three approver roles through the handover review route", () => {
    const source = readFileSync(resolve(process.cwd(), "src/app/api/requests/review/route.ts"), "utf8");
    const roles = (handlerBlocks(source).get("POST") as string).match(/allowedRoles:\s*\[([\s\S]*?)\]/);
    expect(roles, "review POST has no inline allowedRoles").toBeTruthy();
    for (const role of ["cm", "kam", "mentor", "admin"]) expect(roles![1]).toContain(`"${role}"`);
  });

  it("keeps announcement writes admin-only while every role can read them", () => {
    const source = readFileSync(resolve(process.cwd(), "src/app/api/announcements/route.ts"), "utf8");
    const blocks = handlerBlocks(source);
    expect(blocks.get("POST")).toMatch(/allowedRoles:\s*\[\s*"admin"\s*\]/);
    expect(blocks.get("DELETE")).toMatch(/allowedRoles:\s*\[\s*"admin"\s*\]/);
    expect((blocks.get("GET") as string)).toMatch(/ANNOUNCE_READ_ROLES/);
    expect(source.match(/const ANNOUNCE_READ_ROLES[^=]+=\s*\[([\s\S]*?)\]/)![1]).toContain('"student"');
  });

  it("gives demo-swap GET a Request so its guard can read the cookie", () => {
    const source = readFileSync(resolve(process.cwd(), "src/app/api/requests/demo-swap/route.ts"), "utf8");
    expect(source).not.toMatch(/export async function GET\(\s*\)/);
  });

  it("restricts campus calendar deletion to the three configuring roles", () => {
    const source = readFileSync(resolve(process.cwd(), "src/app/api/daily-configs/route.ts"), "utf8");
    const blocks = handlerBlocks(source);
    const roles = (blocks.get("DELETE") as string).match(/allowedRoles:\s*\[([\s\S]*?)\]/);
    expect(roles, "daily-configs DELETE has no allowedRoles").toBeTruthy();
    expect(roles![1].replace(/\s/g, "")).toBe('"admin","cm","kam"');
    // Mentors and students read the calendar, so GET must not carry a role list.
    expect(blocks.get("GET")).toMatch(/requireAuth\(request\)/);
    expect(blocks.get("GET")).not.toMatch(/allowedRoles/);
  });

  it("gives demo-sessions GET a Request so its guard can read the cookie", () => {
    const source = readFileSync(resolve(process.cwd(), "src/app/api/demo-sessions/route.ts"), "utf8");
    expect(source).not.toMatch(/export async function GET\(\s*\)/);
    expect(source).toMatch(/action === "reschedule"[\s\S]{0,200}requireSession\(request\)/);
  });

  it("rejects an unguarded handler so this gate cannot pass vacuously", () => {
    const unguarded = "export async function GET(request: Request) {\n  const db = await getDb();\n  return NextResponse.json({ ok: true });\n}\n";
    expect(isGuarded(unguarded, guardNames(unguarded))).toBe(false);
    // The wrapper path must actually be exercised by the routes above.
    expect(guardNames(readFileSync(resolve(process.cwd(), "src/app/api/subjects/route.ts"), "utf8")))
      .toContain("requireAcademicConfigAccess");
    expect(guardNames(readFileSync(resolve(process.cwd(), "src/app/api/courses/route.ts"), "utf8")))
      .toContain("requireCourseConfigAccess");
  });

  it("never falls back to another campus in the placement roster", () => {
    const source = readFileSync(resolve(process.cwd(), "src/app/api/audit/placement/route.ts"), "utf8");
    const getBlock = handlerBlocks(source).get("GET") as string;
    expect(getBlock).toMatch(/allowedRoles:\s*\[([\s\S]*?)\]/);
    expect(getBlock).toMatch(/const inScope = /);
    expect(getBlock).toMatch(/outside your assigned portfolio/);
    // campuses[0] was the anonymous default: a CM asking for their own college by
    // an unresolvable name got the first row of the whole institution.
    expect(getBlock).toMatch(/allowedCollegeNames \? campuses\.find\(c => inScope\(c\.name\)\)/);
    expect(getBlock).not.toMatch(/matchedCampus \|\| campuses\[0\]/);
    expect(getBlock).toMatch(/availableCampuses: campuses\s*\n?\s*\.filter\(c => inScope\(c\.name\)\)/);
  });

  it("grades demo criteria writes against the verified session, not the posted name", () => {
    const source = readFileSync(resolve(process.cwd(), "src/app/api/demo-eval-criteria/route.ts"), "utf8");
    const blocks = handlerBlocks(source);
    const roles = (blocks.get("POST") as string).match(/allowedRoles:\s*\[([\s\S]*?)\]/);
    expect(roles, "demo-eval-criteria POST has no allowedRoles").toBeTruthy();
    for (const role of ["sme", "L and D", "admin"]) expect(roles![1]).toContain(`"${role}"`);
    // Every role except admin could previously be claimed by the request body.
    expect(source).not.toMatch(/'SME', \?/);
    expect(source).not.toMatch(/createdBy \|\| "SME"/);
    expect((blocks.get("GET") as string)).toMatch(/requireAuth\(request\)/);
  });

  it("has no route-level middleware to rely on, so guards must stay in-route", () => {
    let exists = true;
    try {
      readFileSync(resolve(process.cwd(), "src/middleware.ts"), "utf8");
    } catch {
      exists = false;
    }
    expect(exists).toBe(false);
  });
});

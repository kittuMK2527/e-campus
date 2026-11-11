import { readdirSync, readFileSync, statSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";

/**
 * An admin session is the admin console, never somebody else's portal.
 *
 * The shell used to grant every page to a super admin (`isSuperAdmin ||` in the
 * authorization check, plus a matching bypass in the redirect effect) and the
 * profile dropdown carried a "Switch Workspace" grid that rewrote the live role,
 * so /cm, /mentor, /kam and the rest rendered for admin with all-college data
 * scope. That made admin a second, undocumented way into every role's UI.
 *
 * Cross-campus *data* stays where it belongs: the 19 tabs under /admin read every
 * college, and the server keeps its own requireAuth/allowedRoles checks. These
 * assertions only pin the UI isolation, because tsc cannot see a widened ||.
 */

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

function tsxFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) tsxFiles(full, out);
    else if (/\.(tsx|ts)$/.test(full)) out.push(full);
  }
  return out;
}

const ROLE_DASHBOARDS = [
  "CAMDashboard",
  "MentorDashboard",
  "KAMDashboard",
  "StudentDashboard",
  "SMEDashboard",
  "FeeManagerDashboard",
  "LndAllocationDashboard",
  "LndPortalShell",
];

describe("admin session stays inside the admin console", () => {
  it("shell authorizes strictly on the session role, with no super-admin bypass", () => {
    const shell = read("src/components/DashboardLayout.tsx");

    expect(shell).not.toContain("isSuperAdmin");
    expect(shell).toMatch(
      /const isAuthorized = isAuthenticated && normalizeRoleValue\(currentRole\) === normalizeRoleValue\(requiredRole\);/
    );
  });

  it("shell redirects a mismatched role to that role's own home instead of admitting it", () => {
    const shell = read("src/components/DashboardLayout.tsx");

    expect(shell).toMatch(
      /if \(activeRole && normalizeRoleValue\(activeRole\) !== normalizeRoleValue\(requiredRole\)/
    );
  });

  it("profile dropdown offers no workspace switcher and cannot rewrite the role", () => {
    const profile = read("src/components/UserProfileBar.tsx");

    expect(profile).not.toContain("Switch Workspace");
    expect(profile).not.toMatch(/\bsetRole\s*\(/);
  });

  it("boot resolves the role from the server user only, never a stored workspace", () => {
    const context = read("src/context/AppContext.tsx");

    expect(context).not.toContain("SUPER_ADMIN_WORKSPACES");
    expect(context).toMatch(
      /const parsedRole: Role = normalizeRoleValue\(authUser\.role\);/
    );
    expect(context).not.toMatch(/localStorage\.getItem\("fp_current_role"\)/);
  });

  it("admin surface imports no other role's dashboard component", () => {
    const adminFiles = [
      ...tsxFiles(join(process.cwd(), "src/app/admin")),
      ...tsxFiles(join(process.cwd(), "src/components/admin")),
      join(process.cwd(), "src/components/AdminDashboard.tsx"),
    ];
    const offenders: string[] = [];

    for (const file of adminFiles) {
      const rel = file.replace(process.cwd(), "").replace(/\\/g, "/");
      const source = readFileSync(file, "utf8");
      for (const dashboard of ROLE_DASHBOARDS) {
        if (new RegExp(`from ["'][^"']*${dashboard}["']`).test(source)) {
          offenders.push(`${rel} imports ${dashboard}`);
        }
      }
    }

    expect(offenders).toEqual([]);
    expect(adminFiles.length, "guard must keep reading the admin surface").toBeGreaterThan(10);
  });
});

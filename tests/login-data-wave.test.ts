import { readFileSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";

/**
 * Guards for the login / bootstrap data wave (Phase D1). The provider used to hand out a
 * brand-new `refreshData` on every render, which re-bound DashboardLayout's seven data-change
 * listeners each render, cancelled the 500ms debounced refresh mid-burst, and rebuilt the
 * context value so every `useApp()` consumer re-rendered. `loadRoleWorkspace` additionally
 * re-fetched rows the bundle already returns and read a `colleges` array frozen at the initial
 * empty state by its own stable identity. These invariants pin all of that down.
 */
const root = process.cwd();
const read = (rel: string) => readFileSync(join(root, rel), "utf8");

function region(src: string, start: string, end: string, where: string): string {
  const a = src.indexOf(start);
  expect(a, `${where}: missing start marker ${start}`).toBeGreaterThan(-1);
  const b = src.indexOf(end, a);
  expect(b, `${where}: missing end marker ${end}`).toBeGreaterThan(a);
  return src.slice(a, b + end.length);
}

describe("login data wave", () => {
  const ctx = read("/src/context/AppContext.tsx");
  const layout = read("/src/components/DashboardLayout.tsx");

  it("gives refreshData a stable identity so listeners and the context value stop churning", () => {
    // The implementation is deliberately unmemoized; only the handle callers see is stable.
    expect(ctx).toContain("const refreshDataImpl = async (");
    expect(ctx).toContain("const refreshData = useStableCallback(refreshDataImpl);");
    // The fix only matters while the consumer keeps that handle in its dependency array.
    expect(layout).toContain("}, [refreshData]);");
    expect(layout.split("scheduleRefresh").length - 1).toBeGreaterThanOrEqual(10);
    // weekDates is the other context dep that was re-created every render.
    expect(ctx).toContain("const weekDates = useMemo(");
  });

  it("reads the college fallback through a ref, not a frozen closure", () => {
    const workspace = region(ctx, "const loadRoleWorkspace = useCallback", "}, []);", "loadRoleWorkspace");
    expect(workspace).toContain("collegesRef.current[0]?.id");
    expect(workspace).not.toContain("colleges.length > 0 ? colleges[0].id");
    expect(ctx).toContain("const collegesRef = useRef(colleges);");
  });

  it("drops the workspace reads whose rows the bundle or the reference pre-warm already set", () => {
    const adminBranch = region(ctx, '} else if (role === "admin") {', '} else if (role === "sme") {', "admin workspace branch");
    expect(adminBranch).toContain("/api/admin/signup-requests");
    expect(adminBranch).not.toContain('apiFetch("/api/colleges")');

    const kamBranch = region(ctx, '} else if (role === "kam") {', '} else if (role === "admin") {', "kam workspace branch");
    expect(kamBranch).not.toContain("/api/kam?id=");
    expect(kamBranch).toContain('apiFetch("/api/colleges")');
  });

  it("issues one full-bundle GET, and fires it once per login", () => {
    // refreshAttendance also hits /api/data, but always with fields= — the unscoped call is the bundle.
    const bundleGets = ctx
      .split("\n")
      .filter((line) => line.includes("apiFetch(`/api/data?role=") && !line.includes("fields="));
    expect(bundleGets.length, "second full-bundle /api/data fetch in the provider").toBe(1);

    const setRoleBody = region(ctx, "const setRole = (role: Role", "\n  };\n", "setRole");
    expect(setRoleBody.split("refreshData(").length - 1).toBe(1);
    expect(setRoleBody.split("loadRoleWorkspace(").length - 1).toBe(1);

    const initAppBody = region(ctx, "const initApp = async () => {", "\n    initApp();", "initApp");
    expect(initAppBody.split("refreshData(").length - 1).toBe(1);

    // AppProvider sits in the root layout, so router.replace() after login cannot remount it
    // and replay initApp's wave.
    expect(read("/src/app/layout.tsx")).toContain("<AppProvider>");
  });
});

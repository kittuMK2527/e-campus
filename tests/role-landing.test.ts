import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { getRoleHomePath, resolveFeeManagerTab, resolveSmeTab } from "../src/lib/utils";

const homes = [
  ["admin", "/admin/overview"], ["cm", "/cm/overview"], ["mentor", "/mentor/home"],
  ["student", "/student/dashboard"], ["kam", "/kam/overview"], ["sme", "/sme/overview"],
  ["fee_manager", "/fee-manager/overview"], ["hr", "/hr"], ["L and D", "/l-and-d"],
] as const;

describe("role landing routes", () => {
  it.each(homes)("%s opens an implemented route", (role, home) => {
    expect(getRoleHomePath(role)).toBe(home);
    const parts = home.slice(1).split("/");
    const route = parts.length === 1 ? join(...parts, "page.tsx") : join(parts[0], "[tab]", "page.tsx");
    expect(existsSync(join(process.cwd(), "src/app", route))).toBe(true);
  });

  it.each(["allocator", "l-d", "ld", "lnd", "learning & development"])("preserves %s", (alias) => {
    expect(getRoleHomePath(alias)).toBe("/l-and-d");
  });

  it("preserves CM aliases and direct L&D entry pages", () => {
    expect(getRoleHomePath("cam")).toBe("/cm/overview");
    for (const route of ["cam", "cm", "l-and-d", "l-d", "ld", "allocator"]) {
      expect(existsSync(join(process.cwd(), "src/app", route, "page.tsx"))).toBe(true);
    }
  });

  it.each([undefined, null, [], "", "timetable", "dashboard", "bogus"])("falls back safely for %j", (tab) => {
    expect(resolveSmeTab(tab)).toBe("overview");
    expect(resolveFeeManagerTab(tab)).toBe("overview");
  });

  it.each(["overview", "demo_list", "weekly_plans", "skill_approvals", "availability", "reallocation", "history", "eval_criteria"])("retains SME tab %s", (tab) => {
    expect(resolveSmeTab(tab)).toBe(tab);
  });

  it.each(["overview", "colleges", "students", "transactions"])("retains fee tab %s", (tab) => {
    expect(resolveFeeManagerTab(tab)).toBe(tab);
  });

  it("retains SME tab aliases", () => {
    expect(resolveSmeTab("calendar")).toBe("availability");
    expect(resolveSmeTab("reallocation_hub")).toBe("reallocation");
  });

  it("normalizes URL tabs before rendering", () => {
    const read = (file: string) => readFileSync(join(process.cwd(), file), "utf8");
    expect(read("src/app/sme/[tab]/page.tsx")).toContain("resolveSmeTab(params.tab)");
    const fee = read("src/app/fee-manager/[tab]/page.tsx");
    expect(fee).toContain("resolveFeeManagerTab(params?.tab)");
    expect(fee).toContain("resolveFeeManagerTab(parts[1])");
  });
});

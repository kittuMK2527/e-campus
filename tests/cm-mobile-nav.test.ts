import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { cmMobileTabs, cmMoreTabIds, cmMoreTabs, cmNavGroups } from "../src/lib/cmNav";

const panelSource = readFileSync("src/components/CAMDashboard.tsx", "utf8");
const layoutSource = readFileSync("src/app/layout.tsx", "utf8");
const cssSource = readFileSync("src/app/globals.css", "utf8");

const leafIds = (isKam: boolean) => cmNavGroups(isKam).flatMap((g) => g.items.map((i) => i.id));

describe("CM nav model", () => {
  it("every sidebar tab is reachable from the phone bottom bar", () => {
    const reachable = new Set([...cmMobileTabs(false).map((t) => t.id), ...cmMoreTabIds(false), "more_menu"]);
    const stranded = leafIds(false).filter((id) => !reachable.has(id));
    expect(stranded).toEqual([]);
  });

  it("the More grid carries the seven tabs it used to omit", () => {
    const ids = cmMoreTabIds(false);
    for (const id of [
      "exams_and_marks",
      "faculty_weekly_plan",
      "mentor_skill_tracker",
      "demo_schedule",
      "interviews",
      "students_list",
      "profile_edits",
    ]) {
      expect(ids, `${id} reachable on phones`).toContain(id);
    }
  });

  it("More never repeats a bottom-bar tab", () => {
    const primary = new Set(cmMobileTabs(false).map((t) => t.id));
    expect(cmMoreTabs(false).filter((t) => primary.has(t.id))).toEqual([]);
  });

  it("every More entry carries the hint text the grid renders", () => {
    expect(cmMoreTabs(false).filter((t) => !t.hint.trim())).toEqual([]);
  });

  it("the KAM view renames only the insights label", () => {
    expect(leafIds(true).sort()).toEqual(leafIds(false).sort());
    const reports = cmNavGroups(true).find((g) => g.id === "reports");
    expect(reports?.title).toBe("Campus Insights");
    expect(cmNavGroups(false).find((g) => g.id === "reports")?.title).toBe("Campus Insight");
  });

  it("all model ids exist in the CAMTabId union", () => {
    const union = panelSource.match(/export type CAMTabId =([\s\S]*?);/);
    expect(union, "CAMTabId union found").toBeTruthy();
    const declared = new Set([...union![1].matchAll(/"([a-z_]+)"/g)].map((m) => m[1]));
    const unknown = [...new Set(leafIds(false))].filter((id) => !declared.has(id));
    expect(unknown, "nav ids not in CAMTabId").toEqual([]);
  });
});

describe("CM phone shell", () => {
  it("renders the bottom bar and the More grid from the shared model", () => {
    expect(panelSource).toContain("{cmMobileNavTabs.map((t) => {");
    expect(panelSource).toContain("{cmMoreList.map((t) => {");
    expect(panelSource).toContain("cmMoreIds.includes(activeTab)");
    // The hand-typed lists that drifted are gone.
    expect(panelSource).not.toMatch(/\{ id: "more_menu", label: "More", icon: Menu \},/);
    expect(panelSource).not.toMatch(/"config", "curriculum", "monitoring", "tracker", "fees", "reports", "profile", "audit"/);
  });

  it("keeps bottom-bar targets at least 44px tall with readable labels", () => {
    const nav = panelSource.slice(panelSource.indexOf("{/* Mobile Bottom Navigation"), panelSource.indexOf("</nav>", panelSource.indexOf("{/* Mobile Bottom Navigation")));
    expect(nav).toContain("min-h-[3.5rem]");
    expect(nav).toContain("text-[10px]");
    expect(nav).toContain('aria-current={isActive ? "page" : undefined}');
    expect(nav).not.toMatch(/text-\[8px\]/);
  });

  it("wears the same soft veil as the sidebar", () => {
    const rule = cssSource.slice(cssSource.indexOf(".mobile-bottom-nav {"), cssSource.indexOf("}", cssSource.indexOf(".mobile-bottom-nav {")));
    expect(rule).toContain("var(--surface-veil)");
    expect(rule).toContain("var(--line-soft)");
    expect(rule).not.toContain("rgba(255, 255, 255, 0.88)");
  });

  it("ships viewport-fit=cover so the safe-area insets resolve", () => {
    expect(layoutSource).toContain("export const viewport: Viewport = {");
    expect(layoutSource).toContain('viewportFit: "cover"');
  });
});

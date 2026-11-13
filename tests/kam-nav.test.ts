import { describe, it, expect } from "vitest";
import {
  KAM_PILLARS,
  KAM_NAV_ITEMS,
  findKamPillarForTab,
  getActiveSubTabForPillar,
} from "../src/lib/kamNav";

describe("KAM 7-Pillar Navigation Model", () => {
  it("should define exactly 7 minimal executive pillars", () => {
    expect(KAM_PILLARS).toHaveLength(7);
    const pillarIds = KAM_PILLARS.map(p => p.id);
    expect(pillarIds).toEqual([
      "overview",
      "academics",
      "faculty",
      "schedules",
      "students",
      "fees",
      "audit"
    ]);
  });

  it("should map child sub-tabs to their parent pillars correctly", () => {
    expect(findKamPillarForTab("academic_tracker").id).toBe("academics");
    expect(findKamPillarForTab("exams_and_marks").id).toBe("academics");
    expect(findKamPillarForTab("config").id).toBe("academics");
    expect(findKamPillarForTab("curriculum").id).toBe("academics");

    expect(findKamPillarForTab("faculty").id).toBe("faculty");
    expect(findKamPillarForTab("faculty_weekly_plan").id).toBe("faculty");
    expect(findKamPillarForTab("handovers").id).toBe("faculty");
    expect(findKamPillarForTab("mentor_attendance").id).toBe("faculty");
    expect(findKamPillarForTab("demo_schedule").id).toBe("faculty");

    expect(findKamPillarForTab("timetable").id).toBe("schedules");
    expect(findKamPillarForTab("monitoring").id).toBe("schedules");
    expect(findKamPillarForTab("interviews").id).toBe("schedules");

    expect(findKamPillarForTab("students").id).toBe("students");
    expect(findKamPillarForTab("students_list").id).toBe("students");
    expect(findKamPillarForTab("tracker").id).toBe("students");
    expect(findKamPillarForTab("profile_edits").id).toBe("students");

    expect(findKamPillarForTab("fees").id).toBe("fees");

    expect(findKamPillarForTab("audit").id).toBe("audit");
    expect(findKamPillarForTab("reports").id).toBe("audit");
    expect(findKamPillarForTab("events").id).toBe("audit");
  });

  it("should resolve the active sub-tab for a pillar properly", () => {
    const academics = KAM_PILLARS.find(p => p.id === "academics")!;
    expect(getActiveSubTabForPillar(academics, "exams_and_marks")).toBe("exams_and_marks");
    expect(getActiveSubTabForPillar(academics, "unrelated_tab")).toBe("academic_tracker");

    const students = KAM_PILLARS.find(p => p.id === "students")!;
    expect(getActiveSubTabForPillar(students, "students_list")).toBe("students");
  });
});


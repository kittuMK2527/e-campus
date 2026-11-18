import { describe, expect, it } from "vitest";
import { ALL_SEMESTERS } from "@/lib/semesters";
import { isSameSemester } from "@/lib/utils";

describe("dropdown synchronization & consistency", () => {
  it("provides all 8 semesters for multi-year institutions", () => {
    expect(ALL_SEMESTERS).toHaveLength(8);
    expect(ALL_SEMESTERS).toEqual([
      "Semester 1",
      "Semester 2",
      "Semester 3",
      "Semester 4",
      "Semester 5",
      "Semester 6",
      "Semester 7",
      "Semester 8"
    ]);
  });

  it("synchronizes student semester filtering across diverse semester string representations", () => {
    const students = [
      { id: "s1", name: "Alice", semester: "Semester 3" },
      { id: "s2", name: "Bob", semester: "Sem 3" },
      { id: "s3", name: "Charlie", semester: "3" },
      { id: "s4", name: "Diana", semester: "Semester 4" },
      { id: "s5", name: "Evan", semester: "4" }
    ];

    // Testing filter for Semester 3
    const sem3Filtered = students.filter(s => isSameSemester(s.semester, "Semester 3"));
    expect(sem3Filtered.map(s => s.id)).toEqual(["s1", "s2", "s3"]);

    // Testing filter for Semester 4
    const sem4Filtered = students.filter(s => isSameSemester(s.semester, "Semester 4"));
    expect(sem4Filtered.map(s => s.id)).toEqual(["s4", "s5"]);

    // Testing filter for Semester 7 (does not match 3 or 4)
    const sem7Filtered = students.filter(s => isSameSemester(s.semester, "Semester 7"));
    expect(sem7Filtered).toHaveLength(0);
  });
});

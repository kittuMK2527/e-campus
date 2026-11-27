import { describe, it, expect } from "vitest";
import {
  BULK_TASK_TEMPLATE_HEADERS,
  normalizeDeadlineDate,
  normalizeSemesterValue,
  parseTaskNumberAndTopic,
  validateAndParseBulkTaskRows,
  type BulkMentorRef,
  type BulkCollegeRef,
  type BulkSubjectRef
} from "../src/lib/skillTaskBulkImport";

const sampleColleges: BulkCollegeRef[] = [
  { id: "col-main", name: "Main Campus", code: "MAIN" },
  { id: "col-city", name: "City Campus", code: "CITY" }
];

const sampleMentors: BulkMentorRef[] = [
  {
    id: "EMP001",
    name: "Dr. Ramesh Kumar",
    email: "ramesh@faceprep.in",
    college_id: "col-main",
    department: "CSE"
  },
  {
    id: "EMP002",
    name: "Priya Sharma",
    email: "priya@faceprep.in",
    college_id: "col-city",
    department: "IT"
  },
  {
    id: "EMP003",
    name: "Priya Sharma",
    email: "priya.main@faceprep.in",
    college_id: "col-main",
    department: "ECE"
  }
];

const sampleSubjects: BulkSubjectRef[] = [
  {
    id: "subj-fsd",
    name: "Full Stack Development",
    type: "Skill",
    semester: "Semester 5",
    college_id: "col-main"
  },
  {
    id: "subj-dsa",
    name: "Data Structures & Algorithms",
    type: "Skill",
    semester: "Semester 3",
    college_id: "col-city"
  }
];

describe("BULK_TASK_TEMPLATE_HEADERS", () => {
  it("contains clean template schema columns without typo headers", () => {
    expect(BULK_TASK_TEMPLATE_HEADERS).toEqual([
      "Sl No",
      "Employee ID *",
      "Mentor Name",
      "Email ID",
      "Campus",
      "Skill Course Name *",
      "Semester *",
      "Task No *",
      "Topic *",
      "Deadline (YYYY-MM-DD) *",
      "Instructions",
      "Reference Material Link"
    ]);
    expect(BULK_TASK_TEMPLATE_HEADERS).not.toContain("inastructions");
  });
});

describe("normalizeDeadlineDate", () => {
  it("parses ISO YYYY-MM-DD, DD/MM/YYYY, Excel serials, and Date objects", () => {
    expect(normalizeDeadlineDate("2026-12-05")).toEqual({ value: "2026-12-05" });
    expect(normalizeDeadlineDate("05/12/2026")).toEqual({ value: "2026-12-05" });
    expect(normalizeDeadlineDate("5-12-2026")).toEqual({ value: "2026-12-05" });
    // Excel serial 46000 -> 2025-12-09
    expect(normalizeDeadlineDate(46000)).toEqual({ value: "2025-12-09" });
    expect(normalizeDeadlineDate(new Date(2026, 10, 25))).toEqual({ value: "2026-11-25" });
  });

  it("rejects empty or invalid calendar dates", () => {
    expect(normalizeDeadlineDate("").error).toBeTruthy();
    expect(normalizeDeadlineDate("TBD").error).toBeTruthy();
    expect(normalizeDeadlineDate("2026-02-30").error).toBeTruthy();
    expect(normalizeDeadlineDate("31/04/2026").error).toBeTruthy();
  });
});

describe("normalizeSemesterValue", () => {
  it("normalizes shorthand semester numbers and falls back to subject semester", () => {
    expect(normalizeSemesterValue("5")).toEqual({ value: "Semester 5" });
    expect(normalizeSemesterValue("Sem 3")).toEqual({ value: "Semester 3" });
    expect(normalizeSemesterValue("", "Semester 4")).toEqual({ value: "Semester 4" });
  });

  it("rejects missing or out-of-range semesters", () => {
    expect(normalizeSemesterValue("", null).error).toBeTruthy();
    expect(normalizeSemesterValue("Semester 12").error).toBeTruthy();
  });
});

describe("parseTaskNumberAndTopic", () => {
  it("parses separate Task No + Topic and legacy combined formats", () => {
    expect(parseTaskNumberAndTopic("1", "REST APIs", "")).toEqual({
      taskNumber: 1,
      topic: "REST APIs",
      errors: []
    });
    expect(parseTaskNumberAndTopic("Task 4", "Binary Trees", "")).toEqual({
      taskNumber: 4,
      topic: "Binary Trees",
      errors: []
    });
    expect(parseTaskNumberAndTopic("", "", "Task 2: Graph Traversal")).toEqual({
      taskNumber: 2,
      topic: "Graph Traversal",
      errors: []
    });
  });

  it("rejects out-of-range task numbers or missing topics", () => {
    expect(parseTaskNumberAndTopic("45", "Topic", "").errors.length).toBeGreaterThan(0);
    expect(parseTaskNumberAndTopic("1", "", "").errors.length).toBeGreaterThan(0);
    expect(parseTaskNumberAndTopic("", "Only Topic", "").errors.length).toBeGreaterThan(0);
  });
});

describe("validateAndParseBulkTaskRows", () => {
  it("parses valid rows cleanly and ignores trailing empty rows", () => {
    const rows = [
      {
        "Sl No": 1,
        "Employee ID *": "EMP001",
        "Mentor Name": "Dr. Ramesh Kumar",
        Campus: "Main Campus",
        "Skill Course Name *": "Full Stack Development",
        "Semester *": "5",
        "Task No *": "1",
        "Topic *": "REST APIs with Express",
        "Deadline (YYYY-MM-DD) *": "2026-12-01",
        Instructions: "Build 5 CRUD endpoints",
        "Reference Material Link": "https://example.com/guide.pdf"
      },
      {
        "Sl No": "",
        "Employee ID *": "",
        "Mentor Name": "",
        Campus: "",
        "Skill Course Name *": "",
        "Semester *": "",
        "Task No *": "",
        "Topic *": "",
        "Deadline (YYYY-MM-DD) *": ""
      }
    ];

    const res = validateAndParseBulkTaskRows(rows, {
      mentors: sampleMentors,
      colleges: sampleColleges,
      skillSubjects: sampleSubjects
    });

    expect(res.totalDataRows).toBe(1);
    expect(res.rowErrors).toHaveLength(0);
    expect(res.validTasks).toHaveLength(1);
    expect(res.validTasks[0]).toMatchObject({
      rowNumber: 2,
      mentorId: "EMP001",
      collegeId: "col-main",
      subject: "Full Stack Development",
      semester: "Semester 5",
      taskNumber: 1,
      topic: "REST APIs with Express",
      deadline: "2026-12-01",
      instructions: "Build 5 CRUD endpoints"
    });
  });

  it("supports legacy column aliases (inastructions, Task Title/No) cleanly", () => {
    const rows = [
      {
        "email id": "priya@faceprep.in",
        "skill course name": "Data Structures & Algorithms",
        "task title/no": "Task 3: AVL Trees",
        deadline: "15/12/2026",
        inastructions: "Implement rotations"
      }
    ];

    const res = validateAndParseBulkTaskRows(rows, {
      mentors: sampleMentors,
      colleges: sampleColleges,
      skillSubjects: sampleSubjects
    });

    expect(res.rowErrors).toHaveLength(0);
    expect(res.validTasks).toHaveLength(1);
    expect(res.validTasks[0]).toMatchObject({
      mentorId: "EMP002",
      semester: "Semester 3",
      taskNumber: 3,
      topic: "AVL Trees",
      deadline: "2026-12-15",
      instructions: "Implement rotations"
    });
  });

  it("reports exact row errors for unknown mentors, unknown courses, campus mismatch, bad URLs, and duplicates", () => {
    const rows = [
      {
        "Employee ID *": "UNKNOWN99",
        "Skill Course Name *": "Nonexistent Course",
        "Semester *": "Semester 1",
        "Task No *": "1",
        "Topic *": "Intro",
        "Deadline (YYYY-MM-DD) *": "invalid-date",
        "Reference Material Link": "not-a-url"
      },
      {
        "Employee ID *": "EMP001",
        Campus: "City Campus",
        "Skill Course Name *": "Full Stack Development",
        "Semester *": "Semester 5",
        "Task No *": "2",
        "Topic *": "JWT Auth",
        "Deadline (YYYY-MM-DD) *": "2026-12-10"
      },
      {
        "Employee ID *": "EMP001",
        "Skill Course Name *": "Full Stack Development",
        "Semester *": "Semester 5",
        "Task No *": "1",
        "Topic *": "First Occurrence",
        "Deadline (YYYY-MM-DD) *": "2026-12-10"
      },
      {
        "Employee ID *": "EMP001",
        "Skill Course Name *": "Full Stack Development",
        "Semester *": "Semester 5",
        "Task No *": "1",
        "Topic *": "Duplicate Task 1",
        "Deadline (YYYY-MM-DD) *": "2026-12-12"
      }
    ];

    const res = validateAndParseBulkTaskRows(rows, {
      mentors: sampleMentors,
      colleges: sampleColleges,
      skillSubjects: sampleSubjects
    });

    expect(res.validTasks).toHaveLength(1);
    expect(res.rowErrors).toHaveLength(3);
    expect(res.rowErrors[0].rowNumber).toBe(2);
    expect(res.rowErrors[0].errors.length).toBeGreaterThanOrEqual(4);
    expect(res.rowErrors[1].rowNumber).toBe(3);
    expect(res.rowErrors[1].errors[0]).toContain("Main Campus");
    expect(res.rowErrors[2].rowNumber).toBe(5);
    expect(res.rowErrors[2].errors[0]).toContain("Duplicate task");
  });

  it("disambiguates duplicate mentor names using Campus", () => {
    const rows = [
      {
        "Mentor Name": "Priya Sharma",
        Campus: "Main Campus",
        "Skill Course Name *": "Full Stack Development",
        "Semester *": "Semester 5",
        "Task No *": "1",
        "Topic *": "Hooks",
        "Deadline (YYYY-MM-DD) *": "2026-12-20"
      }
    ];

    const res = validateAndParseBulkTaskRows(rows, {
      mentors: sampleMentors,
      colleges: sampleColleges,
      skillSubjects: sampleSubjects
    });

    expect(res.rowErrors).toHaveLength(0);
    expect(res.validTasks[0].mentorId).toBe("EMP003");
  });
});

import { ALL_SEMESTERS } from "./semesters";

export interface BulkMentorRef {
  id: string;
  name: string;
  email?: string | null;
  college_id?: string | null;
  department?: string | null;
  subjects?: string | null;
}

export interface BulkCollegeRef {
  id: string;
  name: string;
  code?: string | null;
}

export interface BulkSubjectRef {
  id?: string;
  name: string;
  type?: string | null;
  semester?: string | null;
  department?: string | null;
  college_id?: string | null;
}

export interface BulkTemplateColumn {
  key: string;
  header: string;
  width: number;
  required: boolean;
  description: string;
}

export const BULK_TASK_TEMPLATE_COLUMNS: BulkTemplateColumn[] = [
  {
    key: "slNo",
    header: "Sl No",
    width: 8,
    required: false,
    description: "Optional row serial number (1, 2, 3...)."
  },
  {
    key: "employeeId",
    header: "Employee ID *",
    width: 18,
    required: true,
    description: "Mentor's exact Employee ID (required unless Email ID or unique Mentor Name matches). Copy from Mentors_And_Courses_Ref."
  },
  {
    key: "mentorName",
    header: "Mentor Name",
    width: 24,
    required: false,
    description: "Faculty mentor full name (used as visual check or fallback if Employee ID is omitted)."
  },
  {
    key: "emailId",
    header: "Email ID",
    width: 28,
    required: false,
    description: "Mentor email address (optional fallback lookup when Employee ID is omitted)."
  },
  {
    key: "campus",
    header: "Campus",
    width: 22,
    required: false,
    description: "Campus / college name or code (optional; verified against mentor's assigned campus when supplied)."
  },
  {
    key: "skillCourseName",
    header: "Skill Course Name *",
    width: 30,
    required: true,
    description: "Exact active Skill Course name from Mentors_And_Courses_Ref."
  },
  {
    key: "semester",
    header: "Semester *",
    width: 14,
    required: true,
    description: "Semester 1 to Semester 8 (also accepts 1-8 or Sem 1-Sem 8)."
  },
  {
    key: "taskNo",
    header: "Task No *",
    width: 11,
    required: true,
    description: "Task number from 1 to 40 (e.g. 1, 2, or Task 1)."
  },
  {
    key: "topic",
    header: "Topic *",
    width: 36,
    required: true,
    description: "Task title or topic name to assign."
  },
  {
    key: "deadline",
    header: "Deadline (YYYY-MM-DD) *",
    width: 22,
    required: true,
    description: "Target due date in YYYY-MM-DD format (DD/MM/YYYY and Excel date cells are also supported)."
  },
  {
    key: "instructions",
    header: "Instructions",
    width: 40,
    required: false,
    description: "Optional task instructions, coding prompt, or deliverables."
  },
  {
    key: "referenceLink",
    header: "Reference Material Link",
    width: 36,
    required: false,
    description: "Optional https:// or http:// study material / rubric URL."
  }
];

export const BULK_TASK_TEMPLATE_HEADERS = BULK_TASK_TEMPLATE_COLUMNS.map(c => c.header);
export const BULK_TASK_TEMPLATE_COL_WIDTHS = BULK_TASK_TEMPLATE_COLUMNS.map(c => ({ wch: c.width }));

export interface ParsedBulkTask {
  rowNumber: number;
  slNo: string;
  mentorId: string;
  employeeId: string;
  mentorName: string;
  emailId: string;
  collegeId?: string;
  campus: string;
  subject: string;
  semester: string;
  department?: string;
  weekNumber: number;
  taskNumber: number;
  topic: string;
  taskGivenDate: string;
  deadline: string;
  description: string;
  instructions: string;
  referenceUrl: string;
}

export interface BulkTaskRowError {
  rowNumber: number;
  employeeId?: string;
  mentorName?: string;
  subject?: string;
  errors: string[];
}

export interface BulkTaskParseResult {
  totalDataRows: number;
  validTasks: ParsedBulkTask[];
  rowErrors: BulkTaskRowError[];
}

function normalizeHeaderKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function collapseSpaces(val: string): string {
  return val.trim().replace(/\s+/g, " ");
}

export function getRowVal(row: Record<string, unknown>, ...aliases: string[]): string {
  const normAliases = aliases.map(normalizeHeaderKey);
  for (const key of Object.keys(row)) {
    const cleanKey = normalizeHeaderKey(key);
    if (normAliases.includes(cleanKey)) {
      const val = row[key];
      return val !== undefined && val !== null ? String(val).trim() : "";
    }
  }
  return "";
}

export function getRawRowVal(row: Record<string, unknown>, ...aliases: string[]): unknown {
  const normAliases = aliases.map(normalizeHeaderKey);
  for (const key of Object.keys(row)) {
    const cleanKey = normalizeHeaderKey(key);
    if (normAliases.includes(cleanKey)) {
      return row[key];
    }
  }
  return undefined;
}

export function isRowBlank(row: Record<string, unknown>): boolean {
  return Object.values(row).every(v => v === undefined || v === null || String(v).trim() === "");
}

function isValidCalendarDate(year: number, month: number, day: number): boolean {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return false;
  if (year < 2000 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) return false;
  const d = new Date(Date.UTC(year, month - 1, day));
  return d.getUTCFullYear() === year && d.getUTCMonth() === month - 1 && d.getUTCDate() === day;
}

function formatIsoDate(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function normalizeDeadlineDate(raw: unknown): { value: string | null; error?: string } {
  if (raw === undefined || raw === null || String(raw).trim() === "") {
    return { value: null, error: "Deadline is required (use YYYY-MM-DD)." };
  }

  if (raw instanceof Date) {
    if (isNaN(raw.getTime())) {
      return { value: null, error: "Invalid Excel date value for Deadline." };
    }
    const year = raw.getFullYear();
    const month = raw.getMonth() + 1;
    const day = raw.getDate();
    if (!isValidCalendarDate(year, month, day)) {
      return { value: null, error: "Deadline date is out of supported range (2000-2100)." };
    }
    return { value: formatIsoDate(year, month, day) };
  }

  // Handle Excel numeric date serial (days since 1899-12-30; modern dates ~ 36526..73050)
  if (typeof raw === "number" || (/^\d+(\.\d+)?$/.test(String(raw).trim()) && Number(raw) > 30000)) {
    const serial = Number(raw);
    if (!Number.isFinite(serial) || serial < 36526 || serial > 73050) {
      return { value: null, error: `Invalid numeric Deadline "${raw}" — use YYYY-MM-DD.` };
    }
    const excelEpochMs = Math.round((serial - 25569) * 86400 * 1000);
    const utcDate = new Date(excelEpochMs);
    if (isNaN(utcDate.getTime())) {
      return { value: null, error: `Invalid Excel serial Deadline "${raw}".` };
    }
    return { value: utcDate.toISOString().slice(0, 10) };
  }

  const str = String(raw).trim();

  // ISO format: YYYY-MM-DD or YYYY/MM/DD
  const isoMatch = str.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (isoMatch) {
    const year = parseInt(isoMatch[1], 10);
    const month = parseInt(isoMatch[2], 10);
    const day = parseInt(isoMatch[3], 10);
    if (!isValidCalendarDate(year, month, day)) {
      return { value: null, error: `Invalid calendar date "${str}" for Deadline.` };
    }
    return { value: formatIsoDate(year, month, day) };
  }

  // DD/MM/YYYY or DD-MM-YYYY (common regional Excel format)
  const dmyMatch = str.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (dmyMatch) {
    const day = parseInt(dmyMatch[1], 10);
    const month = parseInt(dmyMatch[2], 10);
    const year = parseInt(dmyMatch[3], 10);
    if (!isValidCalendarDate(year, month, day)) {
      return { value: null, error: `Invalid calendar date "${str}" for Deadline (expected YYYY-MM-DD or DD/MM/YYYY).` };
    }
    return { value: formatIsoDate(year, month, day) };
  }

  return { value: null, error: `Invalid Deadline "${str}" — use YYYY-MM-DD (or DD/MM/YYYY).` };
}

export function normalizeSemesterValue(
  rawSemester: string,
  subjectSemester?: string | null
): { value: string | null; error?: string } {
  const raw = collapseSpaces(rawSemester || "");
  const source = raw || collapseSpaces(subjectSemester || "");

  if (!source) {
    return { value: null, error: "Semester is required (e.g. Semester 1 to Semester 8)." };
  }

  const match = source.match(/^(?:semester|sem|s)?\s*(\d+)$/i);
  if (!match) {
    if (!raw && subjectSemester) {
      // Non-standard semester configured on subject table; preserve cleanly
      return { value: source };
    }
    return { value: null, error: `Invalid Semester "${rawSemester}" — use Semester 1 to Semester 8.` };
  }

  const num = parseInt(match[1], 10);
  const candidate = `Semester ${num}`;
  if (!ALL_SEMESTERS.includes(candidate)) {
    return { value: null, error: `Semester "${source}" out of range (allowed: Semester 1 to Semester ${ALL_SEMESTERS.length}).` };
  }

  return { value: candidate };
}

export function parseTaskNumberAndTopic(
  rawTaskNo: string,
  rawTopic: string,
  rawCombined: string
): { taskNumber: number | null; topic: string | null; errors: string[] } {
  const errors: string[] = [];
  const cleanTaskNo = collapseSpaces(rawTaskNo);
  const cleanTopic = collapseSpaces(rawTopic);
  const cleanCombined = collapseSpaces(rawCombined);

  let resolvedNum: number | null = null;
  let resolvedTopic: string | null = cleanTopic || null;

  if (cleanTaskNo) {
    const numMatch = cleanTaskNo.match(/^(?:task|week)?\s*#?\s*(-?\d+)$/i);
    if (!numMatch) {
      errors.push(`Invalid Task No "${cleanTaskNo}" — must be an integer from 1 to 40.`);
    } else {
      const parsed = parseInt(numMatch[1], 10);
      if (parsed < 1 || parsed > 40) {
        errors.push(`Task No ${parsed} is out of range (allowed: 1 to 40).`);
      } else {
        resolvedNum = parsed;
      }
    }
  } else if (cleanCombined) {
    // Legacy combined format: "Task 1: REST APIs" or "2 - Graph BFS"
    const combinedMatch = cleanCombined.match(/^(?:task|week)?\s*#?\s*(\d+)(?:\s*[:\-–]\s*(.*))?$/i);
    if (combinedMatch) {
      const parsed = parseInt(combinedMatch[1], 10);
      if (parsed < 1 || parsed > 40) {
        errors.push(`Task No ${parsed} is out of range (allowed: 1 to 40).`);
      } else {
        resolvedNum = parsed;
      }
      if (!resolvedTopic && combinedMatch[2]?.trim()) {
        resolvedTopic = collapseSpaces(combinedMatch[2]);
      }
    } else if (!resolvedTopic) {
      resolvedTopic = cleanCombined;
    }
  }

  if (resolvedNum === null && errors.length === 0) {
    errors.push("Task No is required (1 to 40).");
  }

  if (!resolvedTopic) {
    errors.push("Topic is required.");
  }

  return { taskNumber: resolvedNum, topic: resolvedTopic, errors };
}

function validateHttpUrl(rawUrl: string): string | null {
  const trimmed = rawUrl.trim();
  if (!trimmed) return null;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return `Reference Material Link "${trimmed}" must start with http:// or https://.`;
    }
    return null;
  } catch {
    return `Reference Material Link "${trimmed}" is not a valid URL (must start with https:// or http://).`;
  }
}

export function validateAndParseBulkTaskRows(
  rawRows: Record<string, unknown>[],
  context: {
    mentors: BulkMentorRef[];
    colleges: BulkCollegeRef[];
    skillSubjects: BulkSubjectRef[];
  }
): BulkTaskParseResult {
  const { mentors, colleges, skillSubjects } = context;
  const validTasks: ParsedBulkTask[] = [];
  const rowErrors: BulkTaskRowError[] = [];
  const seenKeys = new Map<string, number>();
  let totalDataRows = 0;

  const collegeById = new Map(colleges.map(c => [c.id, c]));

  const findCollegeMatch = (campusText: string): BulkCollegeRef | null => {
    const q = collapseSpaces(campusText).toLowerCase();
    if (!q) return null;
    return (
      colleges.find(c => c.id.toLowerCase() === q) ||
      colleges.find(c => c.code && c.code.toLowerCase() === q) ||
      colleges.find(c => collapseSpaces(c.name).toLowerCase() === q) ||
      colleges.find(c => collapseSpaces(c.name).toLowerCase().includes(q)) ||
      null
    );
  };

  for (let idx = 0; idx < rawRows.length; idx++) {
    const r = rawRows[idx];
    if (!r || isRowBlank(r)) continue;

    totalDataRows++;
    const rowNumber = idx + 2; // Row 1 is spreadsheet header row
    const errors: string[] = [];

    const slNo = getRowVal(r, "slno", "sl.no", "sno", "srno", "serialno") || String(totalDataRows);
    const empId = getRowVal(r, "employeeid", "empid", "mentorid");
    const mentorName = getRowVal(r, "mentorname", "mentor", "facultyname", "faculty", "name");
    const emailId = getRowVal(r, "emailid", "email", "mentoremail", "emailaddress");
    const campus = getRowVal(r, "campus", "campusname", "college", "collegename", "institution", "center");
    const courseName = getRowVal(r, "skillcoursename", "skillcourse", "coursename", "course", "subject", "skillsubject");
    const rawSemester = getRowVal(r, "semester", "sem");
    const rawTaskNo = getRowVal(r, "taskno", "tasknumber", "weekno", "weeknumber", "week");
    const rawTopic = getRowVal(r, "topic", "tasktitle", "tasktopic", "title");
    const rawCombined = getRowVal(r, "tasktitleno", "tasktopicno");
    const rawDeadline = getRawRowVal(r, "deadlineyyyymmdd", "deadline", "taskdeadline", "duedate", "targetdate", "taskgivendate", "date");
    const instructions = getRowVal(r, "instructions", "instruction", "inastructions", "description", "details");
    const refMaterial = getRowVal(r, "referencemateriallink", "referencematerial", "referencelink", "materiallink", "referenceurl", "studylink", "link");

    // 1. Resolve Campus if provided
    const matchedCampus = campus ? findCollegeMatch(campus) : null;
    if (campus && !matchedCampus) {
      errors.push(`Campus "${campus}" did not match any registered campus.`);
    }

    // 2. Resolve Mentor strictly
    let matchedMentor: BulkMentorRef | null = null;
    if (empId) {
      matchedMentor = mentors.find(m => m.id.toLowerCase() === empId.toLowerCase()) || null;
      if (!matchedMentor) {
        errors.push(`Employee ID "${empId}" not found in mentor directory.`);
      }
    } else if (emailId) {
      matchedMentor = mentors.find(m => m.email && m.email.toLowerCase() === emailId.toLowerCase()) || null;
      if (!matchedMentor) {
        errors.push(`Email ID "${emailId}" not found in mentor directory.`);
      }
    } else if (mentorName) {
      const targetName = collapseSpaces(mentorName).toLowerCase();
      const nameMatches = mentors.filter(m => collapseSpaces(m.name).toLowerCase() === targetName);
      if (nameMatches.length === 0) {
        errors.push(`Mentor Name "${mentorName}" not found (enter an exact Employee ID or Mentor Name).`);
      } else if (nameMatches.length === 1) {
        matchedMentor = nameMatches[0];
      } else if (matchedCampus) {
        const campusScoped = nameMatches.filter(m => m.college_id === matchedCampus.id);
        if (campusScoped.length === 1) {
          matchedMentor = campusScoped[0];
        } else {
          errors.push(`Multiple mentors named "${mentorName}" match "${campus}" — enter exact Employee ID.`);
        }
      } else {
        errors.push(`Multiple mentors named "${mentorName}" exist — enter exact Employee ID or Campus.`);
      }
    } else {
      errors.push("Employee ID (or Mentor Email / Mentor Name) is required.");
    }

    // Verify campus consistency when both matchedMentor and matchedCampus are resolved
    if (matchedMentor && matchedCampus && matchedMentor.college_id && matchedMentor.college_id !== matchedCampus.id) {
      const actualCampus = collegeById.get(matchedMentor.college_id)?.name || matchedMentor.college_id;
      errors.push(
        `Mentor "${matchedMentor.name}" (${matchedMentor.id}) is assigned to "${actualCampus}", not "${campus}".`
      );
    }

    const resolvedCollegeId = matchedMentor?.college_id || matchedCampus?.id;

    // 3. Resolve Skill Course strictly
    let matchedSubject: BulkSubjectRef | null = null;
    if (!courseName) {
      errors.push("Skill Course Name is required.");
    } else {
      const targetCourse = collapseSpaces(courseName).toLowerCase();
      const courseMatches = skillSubjects.filter(s => collapseSpaces(s.name).toLowerCase() === targetCourse);
      if (courseMatches.length === 0) {
        errors.push(`Skill Course "${courseName}" not found in active Skill Courses.`);
      } else {
        matchedSubject =
          (resolvedCollegeId && courseMatches.find(s => s.college_id === resolvedCollegeId)) ||
          courseMatches[0];
      }
    }

    // 4. Validate Semester
    const semResult = normalizeSemesterValue(rawSemester, matchedSubject?.semester);
    if (semResult.error) errors.push(semResult.error);

    // 5. Validate Task No & Topic
    const taskParsed = parseTaskNumberAndTopic(rawTaskNo, rawTopic, rawCombined);
    errors.push(...taskParsed.errors);

    // 6. Validate Deadline
    const deadlineResult = normalizeDeadlineDate(rawDeadline);
    if (deadlineResult.error) errors.push(deadlineResult.error);

    // 7. Validate Reference Material URL if provided
    if (refMaterial) {
      const urlErr = validateHttpUrl(refMaterial);
      if (urlErr) errors.push(urlErr);
    }

    // 8. Check duplicates within this spreadsheet
    if (matchedMentor && matchedSubject && taskParsed.taskNumber !== null) {
      const dupKey = `${matchedMentor.id.toLowerCase()}|${matchedSubject.name.toLowerCase()}|${taskParsed.taskNumber}`;
      const existingRowNum = seenKeys.get(dupKey);
      if (existingRowNum !== undefined) {
        errors.push(
          `Duplicate task for ${matchedMentor.name} / ${matchedSubject.name} / Task ${taskParsed.taskNumber} (already in Row ${existingRowNum}).`
        );
      } else {
        seenKeys.set(dupKey, rowNumber);
      }
    }

    if (errors.length > 0) {
      rowErrors.push({
        rowNumber,
        employeeId: empId || matchedMentor?.id,
        mentorName: mentorName || matchedMentor?.name,
        subject: courseName || matchedSubject?.name,
        errors
      });
      continue;
    }

    const mentorCollegeName = (resolvedCollegeId && collegeById.get(resolvedCollegeId)?.name) || campus || "";

    validTasks.push({
      rowNumber,
      slNo,
      mentorId: matchedMentor!.id,
      employeeId: matchedMentor!.id,
      mentorName: matchedMentor!.name,
      emailId: matchedMentor!.email || emailId || "",
      collegeId: resolvedCollegeId || undefined,
      campus: mentorCollegeName,
      subject: matchedSubject!.name,
      semester: semResult.value!,
      department: matchedMentor!.department || matchedSubject!.department || undefined,
      weekNumber: taskParsed.taskNumber!,
      taskNumber: taskParsed.taskNumber!,
      topic: taskParsed.topic!,
      taskGivenDate: deadlineResult.value!,
      deadline: deadlineResult.value!,
      description: instructions,
      instructions,
      referenceUrl: refMaterial
    });
  }

  return { totalDataRows, validTasks, rowErrors };
}

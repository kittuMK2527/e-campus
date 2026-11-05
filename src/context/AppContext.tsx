"use client";

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { resolveClassGroupDetailsFromState, isCohortMatch, normalizeRoleValue } from "@/lib/utils";
import { useToast } from "@/context/ToastContext";
import { apiFetch, setClientCsrfToken } from "@/lib/apiFetch";
import { roleGrantsSuperAdmin } from "@/lib/superadmin";
import { queryRootsForDomain } from "@/lib/queryKeys";
import { announceDataChanged } from "@/lib/dataSync";
import { describeFailedSections, describeLoadFailure } from "@/lib/dataLoadStatus";
import { generateId } from "@/lib/id";

export interface AuthenticatedUser {
  id: string;
  reference_id: string;
  role: Role;
  email: string;
  name: string;
  college_id?: string | null;
  isSuperAdmin: boolean;
  mustChangePassword?: boolean;
}

export interface MentorGroup {
  id: string;
  name: string;
  description?: string;
  color?: string;
  is_active?: number;
}

export interface Mentor {
  id: string;
  name: string;
  email: string;
  role: "mentor";
  avatar: string;
  headerId?: string | null;
  headerName?: string;
  subjects?: string;
  classes?: string;
  college_id?: string;
  department?: string;
  subject_group?: string;
  mentor_group?: string;
}

export interface HeaderUser {
  id: string;
  name: string;
  role: "header";
  title: string;
  department: string;
  email: string;
  college_id?: string;
}

export interface HRUser {
  id: string;
  name: string;
  role: "hr";
  email: string;
}

export interface CampusManager {
  id: string;
  name: string;
  email: string;
  role: "cm";
  college_id: string;
  college_name: string;
  college_address?: string;
  kam_id: string;
  kam_name?: string;
}

export interface KAMUser {
  id: string;
  name: string;
  email: string;
  role: "kam";
  title: string;
}

export interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: "admin";
}

export interface College {
  id: string;
  name: string;
  code?: string;
  address?: string;
  city?: string;
  location?: string;
  kam_id: string;
  cam_id?: string;
  cam_name?: string;
  cam_email?: string;
  academic_year?: string;
  manager?: string;
  has_shifts?: number;
  dept_count?: number;
  mentor_count?: number;
  slot_count?: number;
  shift_configs?: string;
  rooms?: string;
  working_days?: number;
  start_time?: string;
}

export interface Student {
  id: string;
  name: string;
  email: string;
  role: "student";
  classGroup: string;
  department?: string;
  college_id?: string;
  register_number?: string;
  roll_number?: string;
  hire_score?: string;
  efset_score?: string;
  mother_name?: string;
  father_name?: string;
  pan_number?: string;
  tenth_mark?: string;
  eleventh_mark?: string;
  twelfth_mark?: string;
  academic_group?: string;
  medium?: string;
  blood_group?: string;
  dob?: string;
  phone?: string;
  parent_phone?: string;
  aadhar_number?: string;
  linkedin_link?: string;
  github_id?: string;
  project_drive_link?: string;
  hackerrank_link?: string;
  leetcode_link?: string;
  figma_link?: string;
  semester?: string;
  shift?: string;
  section?: string;
}

export interface StudentAttendance {
  id: string;
  studentId: string;
  slotId: string;
  dateStr: string;
  status: "present" | "absent" | "od" | "late" | "not_marked" | string;
  markedBy?: string;
  timestamp: string;
  type?: "Regular" | "Non-Regular";
  mode?: "Online" | "Offline";
  attendanceTypeSub?: string;
  coveredSubject?: string;
}

const ATTENDANCE_WIRE_FIELDS = [
  "id",
  "studentId",
  "slotId",
  "dateStr",
  "status",
  "type",
  "mode",
  "markedBy",
  "timestamp",
  "attendanceTypeSub"
] as const;

/** /api/data ships attendance as positional rows to cut payload size. */
function parseAttendancePayload(data: any): StudentAttendance[] {
  const rows = data?.studentAttendance;
  if (!Array.isArray(rows)) return [];
  if (data?.studentAttendanceFormat !== "compact") return rows;
  return rows.map((row: any) => {
    const record: any = {};
    ATTENDANCE_WIRE_FIELDS.forEach((field, index) => {
      record[field] = Array.isArray(row) ? row[index] : null;
    });
    return record as StudentAttendance;
  });
}

/**
 * Stable identity for a handler whose body must still read the latest state.
 * Used for refreshData, which is a dependency of DashboardLayout's data-change listener
 * effect and — through retryDataLoad — of the context value's dep array. A fresh function
 * object every render re-bound seven window listeners per render, cancelled the 500ms
 * debounced refresh mid-burst, and rebuilt the context value so every useApp consumer
 * re-rendered even when nothing it exposed had changed.
 */
function useStableCallback<T extends (...args: never[]) => unknown>(fn: T): T {
  const latest = useRef<T>(fn);
  useEffect(() => {
    latest.current = fn;
  });
  return useMemo(() => (((...args: Parameters<T>) => latest.current(...args)) as unknown) as T, []);
}

export interface Holiday {
  id: string;
  title: string;
  date: string;
  type: string;
  college_id: string;
}

export type Role = "mentor" | "hr" | "cm" | "kam" | "admin" | "student" | "fee_manager" | "sme" | "L and D";
export type ShiftType = "shift_1" | "shift_2" | "general";

export interface WeeklyTask {
  id: string;
  class_group: string;
  subject: string;
  week_number: number;
  mentor_id: string;
  task_name: string;
  task_pdf_url?: string;
  created_at?: string;
  updated_at?: string;
}

export interface StudentTrackerEntry {
  id: string;
  student_id: string;
  class_group: string;
  subject: string;
  week_number: number;
  submission_url?: string;
  viva_assessment?: string;
  marks?: number;
  graded_by?: string;
  updated_at?: string;
}

export interface StudentInterview {
  id: string;
  student_id: string;
  student_name?: string;
  class_group: string;
  subject: string;
  type: "internal" | "external";
  marks: number;
  total_marks?: number;
  technical_marks?: number;
  communication_marks?: number;
  status: "Cleared" | "Pending" | "Needs Improvement" | "Failed" | string;
  evaluator_name: string;
  evaluator_role: string;
  notes?: string;
  created_at: string;
  updated_at?: string;
}

export interface Slot {
  id: string;
  mentorId: string;
  day: string;
  time: string;
  course: string;
  location: string;
  shift: ShiftType;
  classGroup?: string;
  semester?: string;
  year?: string;
  department?: string;
  college_id?: string;
}

export interface HandoverRequest {
  id: string;
  requestorId: string;
  requestorName: string;
  slotId: string;
  course: string;
  day: string;
  time: string;
  dateStr: string;
  dateFormatted: string;
  targetStaffId: string;
  targetStaffName: string;
  reason: string;
  status: "pending" | "pending_cm" | "pending_cam" | "approved" | "rejected" | "needs_cm_allocation" | "needs_cam_allocation";
  headerReason?: string;
  approvedBy?: string;
  timestamp: string;
  classGroup?: string;
  request_type?: "handover" | "swap_compensate" | "exam_marks_edit" | string;
  reasonCategory?: string;
  compensates_handover_id?: string;
}

export interface ApprovedHandover {
  requestId: string;
  slotId: string;
  dateStr: string;
  originalMentorId: string;
  coverStaffId: string;
  coverStaffName: string;
  course?: string;
  ledger_month?: string;
}

export interface AuditLog {
  id: string;
  type: "assignment" | "booking" | "handover_request" | "handover_approval" | "handover_rejection" | "csv_upload" | "release";
  description: string;
  actorName: string;
  actorRole: string;
  timestamp: string;
}

export interface Subject {
  id: string;
  department: string;
  semester: string;
  name: string;
  type: string;
  college_id?: string;
  year?: string;
  weekly_hours?: number;
  subject_group?: string;
  mentor_group?: string;
  shift?: string;
}

export interface Department {
  id: string;
  name: string;
  college_id?: string;
  code?: string;
  description?: string;
  hod_name?: string;
  established_year?: string;
  status?: string;
  years?: number;
  start_date?: string;
  end_date?: string;
  start_year?: string;
  end_year?: string;
  default_room?: string;
  default_shift?: string;
  shift_based?: number;
  sections?: string;
  working_days?: number;
}

export type Course = Department;

export interface AcademicTrackerEntry {
  id: string;
  date: string;
  period_slot: string;
  class_group: string;
  subject: string;
  unit: string;
  topic: string;
  comments?: string;
  status?: string;
  mentor_id: string;
  mentor_name?: string;
  college_id?: string;
  weekly_plan_id?: string | null;
  weekly_plan_week?: number | null;
  created_at?: string;
  updated_at?: string;
}

export interface WeeklyAcademicTask {
  id: string;
  class_group: string;
  subject: string;
  week_number: number;
  task_name: string;
  task_pdf_url?: string;
  task_date?: string;
  quiz_topic?: string;
  assessment_topic?: string;
  assignment_topic?: string;
  mentor_id: string;
  created_at?: string;
  updated_at?: string;
}

export interface StudentAcademicTrackerEntry {
  id: string;
  student_email: string;
  student_id?: string;
  class_group: string;
  subject: string;
  week_number: number;
  attendance_status?: string;
  submission_url?: string;
  quiz_marks?: number | null;
  assessment_marks?: number | null;
  assignment_marks?: number | null;
  total_marks?: number | null;
  feedback?: string;
  graded_by?: string;
  updated_at?: string;
}

interface WeekDate {
  day: string;
  dateStr: string;
  formatted: string;
}

interface AppContextProps {
  mentors: Mentor[];
  slots: Slot[];
  requests: HandoverRequest[];
  setRequests: React.Dispatch<React.SetStateAction<HandoverRequest[]>>;
  approvedHandovers: ApprovedHandover[];
  auditLogs: AuditLog[];
  subjectsList: Subject[];
  colleges: College[];
  smes: any[];
  smeAvailability: any[];
  demoSessions: any[];
  setDemoSessions: React.Dispatch<React.SetStateAction<any[]>>;
  demoRules: any[];
  demoSwapRequests: any[];
  currentRole: Role;
  currentMentor: Mentor | null;
  currentHR: HRUser | null;
  currentCAM: CampusManager | null;
  currentKAM: KAMUser | null;
  currentAdmin: AdminUser | null;
  currentSME: any | null;
  timeSlots: string[];
  daysOfWeek: string[];
  weekDates: WeekDate[];
  weekOffset: number;
  setWeekOffset: (offset: number) => void;
  isLoading: boolean;
  isDataLoading: boolean;
  /** Set when the last full /api/data refresh failed — UI shows a retry banner. */
  dataLoadError: boolean;
  /** Why the load failed, in one sentence. Null when the failure has no better name. */
  dataLoadMessage: string | null;
  /** Lists the server sent back capped (newest rows only) — not an error, so not a red banner. */
  cappedSections: string[];
  retryDataLoad: () => Promise<void>;
  /** Set when the logged-in identity cannot be resolved — dashboards must render an error, not another user's data. */
  currentIdentityError: string | null;
  currentShift: ShiftType;
  setCurrentShift: (shift: ShiftType) => void;
  shiftTimeSlots: Record<ShiftType, string[]>;
  getTimeSlots: (shift: string, semesterOrClassGroup?: string, targetCollegeId?: string) => string[];
  setRole: (role: Role, userId?: string, extra?: { collegeId?: string; userEmail?: string; userName?: string; isSuperAdmin?: boolean }) => void;
  assignSlot: (mentorId: string, day: string, time: string, course: string, location: string, classGroup?: string) => Promise<void>;
  deleteSlot: (slotId: string) => Promise<void>;
  updateSlot: (
    slotId: string,
    mentorId: string,
    day: string,
    time: string,
    course: string,
    location: string,
    classGroup?: string
  ) => Promise<{ success: boolean; message?: string }>;
  requestHandover: (
    mentorId: string,
    slotId: string,
    dateStr: string,
    dateFormatted: string,
    targetStaffId: string,
    reason: string,
    subjectName?: string,
    classGroup?: string,
    targetStaffName?: string,
    requestType?: string
  ) => Promise<void>;
  requestSwapCompensate: (
    requestorId: string,
    offerSlotId: string,
    offerDateStr: string,
    offerDateFormatted: string,
    targetStaffId: string,
    compensatesHandoverId?: string,
    reason?: string,
    originalSubject?: string,
    originalMonth?: string
  ) => Promise<{ success: boolean; message: string }>;
  requestBooking: (mentorId: string, day: string, time: string, course: string, location: string, classGroup?: string) => Promise<{ success: boolean; message?: string }>;
  handleRequest: (
    requestId: string,
    status: "approved" | "rejected",
    headerReason?: string,
    actorRole?: string,
    course?: string,
    options?: { action?: string; targetStaffId?: string }
  ) => Promise<void>;
  cancelRequest: (requestId: string) => Promise<{ success: boolean; message: string }>;
  importCSV: (csvContent: string) => Promise<{ success: boolean; message: string; count: number }>;
  clearAllData: () => Promise<{ success: boolean; message: string }>;
  createMentor: (mentor: Omit<Mentor, "role">) => Promise<{ success: boolean; message: string }>;
  bulkImportMentors: (mentors: any[], defaultCollegeId?: string) => Promise<{ success: boolean; count?: number; message: string }>;
  updateMentor: (mentor: Omit<Mentor, "role">) => Promise<{ success: boolean; message: string }>;
  deleteMentor: (id: string) => Promise<{ success: boolean; message: string }>;
  bookDemoSession: (mentorId: string, mentorName: string, smeId: string, smeName: string, dateStr: string, timeSlot: string, subject: string, stream: string, week: number) => Promise<{ success: boolean; message: string }>;
  evaluateDemoSession: (sessionId: string, marks: number, comments: string, checklist?: any[]) => Promise<{ success: boolean; message: string }>;
  correctStudentAttendance: (studentId: string, slotId: string, dateStr: string, newStatus: "present" | "absent" | "od", reason: string, isAdminOverride?: boolean) => Promise<{ success: boolean; message: string }>;
  bulkBookDemoSessions: (sessions: Array<{ mentorId: string; mentorName: string; smeId: string; smeName: string; dateStr: string; timeSlot: string; subject: string; stream: string; week: number }>) => Promise<{ success: boolean; message: string }>;
  updateDemoSession: (sessionId: string, dateStr: string, timeSlot: string, smeId: string, smeName: string) => Promise<{ success: boolean; message: string }>;
  swapDemoSessions: (session1Id: string, session2Id: string) => Promise<{ success: boolean; message: string }>;
  deleteDemoSession: (sessionId: string) => Promise<{ success: boolean; message: string }>;
  rescheduleDemoSession: (sessionId: string, newDateStr: string, newTimeSlot: string) => Promise<{ success: boolean; message: string }>;
  requestDemoSwap: (payload: any) => Promise<{ success: boolean; message: string }>;
  resolveDemoSwap: (requestId: string, status: "approved" | "rejected" | "pending_sme") => Promise<{ success: boolean; message: string }>;
  saveSmeAvailability: (smeId: string, windows: any[], day?: string) => Promise<{ success: boolean; error?: string }>;
  deleteSmeAvailabilityWindow: (id: string) => Promise<{ success: boolean; error?: string }>;
  createDemoRule: (subject: string, week: number, target: number) => Promise<{ success: boolean; message: string }>;
  deleteDemoRule: (id: string) => Promise<{ success: boolean; message: string }>;
  // L&D Aliases (Phase 2 bridge)
  lndSessions?: any[];
  lndRules?: any[];
  lndSwapRequests?: any[];
  bookLndSession?: (mentorId: string, mentorName: string, smeId: string, smeName: string, dateStr: string, timeSlot: string, subject: string, stream: string, week: number) => Promise<{ success: boolean; message: string }>;
  bulkBookLndSessions?: (sessions: Array<{ mentorId: string; mentorName: string; smeId: string; smeName: string; dateStr: string; timeSlot: string; subject: string; stream: string; week: number }>) => Promise<{ success: boolean; message: string }>;
  evaluateLndSession?: (sessionId: string, marks: number, comments: string, checklist?: any[]) => Promise<{ success: boolean; message: string }>;
  deleteLndSession?: (sessionId: string) => Promise<{ success: boolean; message: string }>;
  createLndRule?: (subject: string, week: number, target: number) => Promise<{ success: boolean; message: string }>;
  deleteLndRule?: (id: string) => Promise<{ success: boolean; message: string }>;
  generateTimetable: (
    classGroup: string, 
    shift: ShiftType, 
    defaultRoom: string,
    allocations?: Array<{
      subjectId: string;
      subjectName: string;
      mentorId: string;
      weeklyHours: number;
      room?: string;
    }>,
    previewOnly?: boolean
  ) => Promise<{ 
    success: boolean; 
    message: string; 
    count?: number; 
    previewSlots?: any[]; 
    unscheduled?: Array<{ subject: string; hours: number }> 
  }>;
  clearTimetable: (classGroup: string) => Promise<{ success: boolean; message: string; count?: number }>;
  createSubject: (subject: Omit<Subject, "id">) => Promise<{ success: boolean; message: string }>;
  updateSubject: (subject: Subject) => Promise<{ success: boolean; message: string }>;
  deleteSubject: (id: string) => Promise<{ success: boolean; message: string }>;
  createCollege: (college: Omit<College, "dept_count" | "mentor_count" | "slot_count">) => Promise<{ success: boolean; message: string }>;
  updateCollege: (college: Omit<College, "dept_count" | "mentor_count" | "slot_count">) => Promise<{ success: boolean; message: string }>;
  deleteCollege: (id: string) => Promise<{ success: boolean; message: string; deletedCounts?: { mentors: number; students: number; cams: number } }>;
  createKAM: (kam: { id: string; name: string; email: string; title: string }) => Promise<{ success: boolean; message: string }>;
  updateKAM: (kam: { id: string; name: string; email: string; title: string }) => Promise<{ success: boolean; message: string }>;
  deleteKAM: (id: string) => Promise<{ success: boolean; message: string }>;
  createCAM: (cam: { id: string; name: string; email: string; college_id: string; kam_id: string; password?: string }) => Promise<{ success: boolean; message: string }>;
  updateCAM: (cam: { id: string; name: string; email: string; college_id: string; kam_id: string }) => Promise<{ success: boolean; message: string }>;
  deleteCAM: (id: string) => Promise<{ success: boolean; message: string }>;
  departmentsList: Department[];
  coursesList: Course[];
  createDepartment: (dept: Omit<Department, "id">) => Promise<{ success: boolean; message: string }>;
  createCourse: (course: Omit<Course, "id">) => Promise<{ success: boolean; message: string }>;
  updateDepartment: (dept: Department) => Promise<{ success: boolean; message: string }>;
  updateCourse: (course: Course) => Promise<{ success: boolean; message: string }>;
  deleteDepartment: (id: string) => Promise<{ success: boolean; message: string; deletedCounts?: { slots: number; students: number; mentors: number; subjects: number } }>;
  deleteCourse: (id: string) => Promise<{ success: boolean; message: string; deletedCounts?: { slots: number; students: number; mentors: number; subjects: number } }>;
  refreshData: (silent?: boolean, scope?: { role: Role; userId: string }) => Promise<any>;
  /** Invalidate a change domain and notify every open tab/role to re-read. */
  notifyDataChanged: (domain: string) => void;
  refreshAttendance: (collegeId?: string) => Promise<void>;
  students: Student[];
  studentAttendance: StudentAttendance[];
  setStudentAttendance: React.Dispatch<React.SetStateAction<StudentAttendance[]>>;
  currentStudent: Student | null;
  markAttendance: (
    slotId: string, 
    dateStr: string, 
    attendanceData: Array<{ studentId: string; status: "present" | "absent" | "od" | "late" | "not_marked" | string }>, 
    coveredSubject?: string,
    type?: "Regular" | "Non-Regular",
    mode?: "Online" | "Offline",
    attendanceTypeSub?: string
  ) => Promise<{ success: boolean; message: string }>;
  leaveRequests: any[];
  facultyLeaves: any[];
  holidays: Holiday[];
  updateStudent: (student: Student) => Promise<{ success: boolean; message: string }>;
  deleteStudent: (id: string) => Promise<{ success: boolean; message: string }>;
  bulkDeleteStudents: (ids: string[]) => Promise<{ success: boolean; message: string; count?: number }>;
  weeklyTasks: WeeklyTask[];
  studentTracker: StudentTrackerEntry[];
  academicTracker: AcademicTrackerEntry[];
  saveAcademicTrackerEntry: (entryData: {
    id?: string;
    date: string;
    periodSlot: string;
    classGroup: string;
    subject: string;
    unit: string;
    topic: string;
    comments?: string;
    status?: string;
    mentorId: string;
    mentorName?: string;
    collegeId?: string;
  }) => Promise<{ success: boolean; entry?: AcademicTrackerEntry; message?: string }>;
  deleteAcademicTrackerEntry: (id: string) => Promise<{ success: boolean; message?: string }>;
  interviews: StudentInterview[];
  interviewEvaluations: any[];
  approvals: any[];
  leaveBalances: any[];
  resolveApproval: (approvalId: string, status: "approved" | "rejected", remarks?: string) => Promise<{ success: boolean; message: string }>;
  addInterview: (interviewData: Partial<StudentInterview>) => Promise<{ success: boolean; interview?: StudentInterview; message?: string }>;
  deleteInterview: (id: string) => Promise<{ success: boolean; message?: string }>;
  assignWeeklyTask: (taskData: { classGroup: string; subject: string; weekNumber: number; taskName: string; taskPdfUrl?: string; mentorId: string }) => Promise<{ success: boolean; task?: WeeklyTask; message?: string }>;
  gradeStudentTask: (entryData: { studentId: string; classGroup: string; subject: string; weekNumber: number; submissionUrl?: string; vivaAssessment?: string; marks?: number; gradedBy?: string }) => Promise<{ success: boolean; entry?: StudentTrackerEntry; message?: string }>;
  deleteWeeklyTask: (classGroup: string, subject: string, weekNumber: number) => Promise<{ success: boolean; message?: string }>;
  weeklyAcademicTasks: WeeklyAcademicTask[];
  studentAcademicTracker: StudentAcademicTrackerEntry[];
  assignWeeklyAcademicTask: (taskData: { classGroup: string; subject: string; weekNumber: number; taskName: string; taskPdfUrl?: string; taskDate?: string; quizTopic?: string; assessmentTopic?: string; assignmentTopic?: string; mentorId: string }) => Promise<{ success: boolean; task?: WeeklyAcademicTask; message?: string }>;
  gradeStudentAcademicTask: (entryData: { studentEmail: string; studentId?: string; classGroup: string; subject: string; weekNumber: number; quizMarks?: number | null; assessmentMarks?: number | null; assignmentMarks?: number | null; attendanceStatus?: string; submissionUrl?: string; feedback?: string; gradedBy?: string }) => Promise<{ success: boolean; entry?: StudentAcademicTrackerEntry; message?: string }>;
  bulkUploadAcademicMarks: (bulkData: { records: any[]; classGroup: string; subject: string; weekNumber: number; gradedBy?: string }) => Promise<{ success: boolean; updatedCount?: number; message?: string }>;
  deleteWeeklyAcademicTask: (classGroup: string, subject: string, weekNumber: number) => Promise<{ success: boolean; message?: string }>;
  subjectGroups: Array<{ id: string; name: string; description: string; lead_sme_id?: string; lead_sme_name?: string }>;
  createSubjectGroup: (name: string, description: string, subjectIds?: string[], mentorIds?: string[], lead_sme_id?: string, lead_sme_name?: string) => Promise<{ success: boolean; message: string }>;
  updateSubjectGroup: (id: string, name: string, description: string, subjectIds?: string[], mentorIds?: string[], lead_sme_id?: string, lead_sme_name?: string) => Promise<{ success: boolean; message: string }>;
  deleteSubjectGroup: (id: string) => Promise<{ success: boolean; message: string }>;
  updateSmeSubjectGroup: (id: string, subject: string | null) => Promise<{ success: boolean; message: string }>;
  createSmeUser: (id: string, name: string, email: string, subject?: string) => Promise<{ success: boolean; message: string }>;
  updateSmeUser: (id: string, name: string, email: string, subject?: string) => Promise<{ success: boolean; message: string }>;
  deleteSmeUser: (id: string) => Promise<{ success: boolean; message: string }>;
  kamTasks: any[];
  campusIssues: any[];
  academicYears: string[];
  academicEvents: any[];
  facultyWorkloadLimits: { [key: string]: number };
  facultyShifts: { [key: string]: string };
  saveKamTask: (task: any) => Promise<{ success: boolean; task?: any; message?: string }>;
  deleteKamTask: (id: string) => Promise<{ success: boolean; message?: string }>;
  saveCampusIssue: (issue: any) => Promise<{ success: boolean; issue?: any; message?: string }>;
  updateCampusIssueStatus: (id: string, status?: string, resolvedAt?: string, escalated?: boolean, escalatedAt?: string) => Promise<{ success: boolean; message?: string }>;
  deleteCampusIssue: (id: string) => Promise<{ success: boolean; message?: string }>;
  saveAcademicYear: (yearName: string) => Promise<{ success: boolean; message?: string }>;
  deleteAcademicYear: (yearName: string) => Promise<{ success: boolean; message?: string }>;
  saveAcademicEvent: (event: any) => Promise<{
    success: boolean;
    event?: any;
    message?: string;
    dayOrderSync?: {
      synced: { dateStr: string; day_order: string }[];
      protectedDates?: string[];
      skipped?: string;
    };
  }>;
  deleteAcademicEvent: (id: string) => Promise<{ success: boolean; message?: string }>;
  saveFacultyConfig: (mentorId: string, maxHours: number, shift?: string) => Promise<{ success: boolean; message?: string }>;
  signupRequests: any[];
  submitSignupRequest: (reqData: any) => Promise<{ success: boolean; message: string }>;
  approveSignupRequest: (id: string, mappingData: any) => Promise<{ success: boolean; message: string }>;
  rejectSignupRequest: (id: string) => Promise<{ success: boolean; message: string }>;
  deleteSignupRequest: (id: string) => Promise<{ success: boolean; message: string }>;
  systemSettings: { mailing_enabled: boolean; attendance_lock_enabled: boolean; [key: string]: any };
  attendanceLockEnabled: boolean;
  setSystemSettings: React.Dispatch<React.SetStateAction<{ mailing_enabled: boolean; attendance_lock_enabled: boolean; [key: string]: any }>>;
  loadRoleWorkspace: (role: Role, userId: string, collegeId?: string) => Promise<void>;
  currentUser: AuthenticatedUser | null;
  isAuthenticated: boolean;
  isSuperAdmin: boolean;
  currentCampusScope: string;
  setCampusScope: (scope: string) => void;
  lastSyncTime: string;
  logout: () => void;
}

const AppContext = createContext<AppContextProps | undefined>(undefined);

// Helper to get dates of the current week (Monday – Friday or Saturday)
export function getWeekDates(offsetWeeks: number = 0, baseDateStr?: string, workingDaysCount: number = 5): WeekDate[] {
  const dates: WeekDate[] = [];
  const today = baseDateStr ? new Date(baseDateStr) : new Date();
  
  if (baseDateStr) {
    const parts = baseDateStr.split('-');
    if (parts.length === 3) {
      const [y, m, d] = parts.map(Number);
      today.setFullYear(y, m - 1, d);
    }
  }

  today.setDate(today.getDate() + offsetWeeks * 7);
  const currentDay = today.getDay();
  const distanceToMonday = currentDay === 0 ? -6 : 1 - currentDay;
  const monday = new Date(today);
  monday.setDate(today.getDate() + distanceToMonday);

  const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const count = Number(workingDaysCount) === 6 ? 6 : 5;
  for (let i = 0; i < count; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    dates.push({
      day: days[i],
      dateStr: d.toISOString().split("T")[0],
      formatted: d.toLocaleDateString("en-US", { month: "short", day: "numeric" })
    });
  }
  return dates;
}

export const SHIFT_TIME_SLOTS: Record<ShiftType, string[]> = {
  shift_1: [
    "8.20 AM - 9.10 AM",
    "9.10 AM - 10.00 AM",
    "10.20 AM - 11.10 AM",
    "11.10 AM - 12.00 PM",
    "12.00 PM - 12.50 PM"
  ],
  shift_2: [
    "1.00 PM - 1.50 PM",
    "1.50 PM - 2.40 PM",
    "3.00 PM - 3.50 PM",
    "3.50 PM - 4.40 PM",
    "4.40 PM - 5.30 PM"
  ],
  general: [
    "9.00 AM - 10.00 AM",
    "10.00 AM - 11.00 AM",
    "11.15 AM - 12.15 PM",
    "12.50 PM - 1.45 PM",
    "1.45 PM - 2.45 PM",
    "3.00 PM - 4.00 PM"
  ]
};

const DAYS_OF_WEEK = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const queryClient = useQueryClient();
  const toastCtx = useToast();
  const startLoading = toastCtx?.startLoading || ((_msg?: string) => {});
  const stopLoading = toastCtx?.stopLoading || (() => {});
  const toastFn = toastCtx?.toast || ((_msg: string, _type?: any) => {});
  // All data starts empty — populated exclusively from database via API
  const [mentors, setMentors] = useState<Mentor[]>([]);
  const [hrList, setHrList] = useState<HRUser[]>([]);
  const [colleges, setColleges] = useState<College[]>([]);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [requests, setRequests] = useState<HandoverRequest[]>([]);
  const [approvedHandovers, setApprovedHandovers] = useState<ApprovedHandover[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [subjectsList, setSubjectsList] = useState<Subject[]>([]);
  const [departmentsList, setDepartmentsList] = useState<Department[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [studentAttendance, setStudentAttendance] = useState<StudentAttendance[]>([]);
  const [leaveRequests, setLeaveRequests] = useState<any[]>([]);
  const [facultyLeaves, setFacultyLeaves] = useState<any[]>([]);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [weeklyTasks, setWeeklyTasks] = useState<WeeklyTask[]>([]);
  const [studentTracker, setStudentTracker] = useState<StudentTrackerEntry[]>([]);
  const [academicTracker, setAcademicTracker] = useState<AcademicTrackerEntry[]>([]);
  const [weeklyAcademicTasks, setWeeklyAcademicTasks] = useState<WeeklyAcademicTask[]>([]);
  const [studentAcademicTracker, setStudentAcademicTracker] = useState<StudentAcademicTrackerEntry[]>([]);
  const [interviews, setInterviews] = useState<StudentInterview[]>([]);
  const [interviewEvaluations, setInterviewEvaluations] = useState<any[]>([]);
  const [approvals, setApprovals] = useState<any[]>([]);
  const [leaveBalances, setLeaveBalances] = useState<any[]>([]);
  const [smes, setSmes] = useState<any[]>([]);
  const [smeAvailability, setSmeAvailability] = useState<any[]>([]);
  const [demoSessions, setDemoSessions] = useState<any[]>([]);
  const [demoRules, setDemoRules] = useState<any[]>([]);
  const [demoSwapRequests, setDemoSwapRequests] = useState<any[]>([]);
  const [currentSME, setCurrentSME] = useState<any | null>(null);
  // ROLE_UI_AUDIT S3/E1: surfaced to dashboards when the logged-in identity cannot
  // be resolved — replaces the old "silently show the first user's data" fallback.
  const [currentIdentityError, setCurrentIdentityError] = useState<string | null>(null);
  const [subjectGroups, setSubjectGroups] = useState<Array<{ id: string; name: string; description: string }>>([]);
  const coursesList = departmentsList;

  const [kamTasks, setKamTasks] = useState<any[]>([]);
  const [campusIssues, setCampusIssues] = useState<any[]>([]);
  const [academicYears, setAcademicYears] = useState<string[]>([]);
  const [academicEvents, setAcademicEvents] = useState<any[]>([]);
  const [facultyWorkloadLimits, setFacultyWorkloadLimits] = useState<{ [key: string]: number }>({});
  const [facultyShifts, setFacultyShifts] = useState<{ [key: string]: string }>({});
  const [signupRequests, setSignupRequests] = useState<any[]>([]);
  const [systemSettings, setSystemSettings] = useState<{ mailing_enabled: boolean; attendance_lock_enabled: boolean; [key: string]: any }>({
    mailing_enabled: true,
    attendance_lock_enabled: true
  });
  const attendanceLockEnabled = systemSettings.attendance_lock_enabled !== false;

  const [currentUser, setCurrentUser] = useState<AuthenticatedUser | null>(null);
  const [currentCampusScope, setCurrentCampusScope] = useState<string>("all");
  const [lastSyncTime, setLastSyncTime] = useState<string>(() => new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true }));

  const isAuthenticated = !!currentUser;
  const isSuperAdmin = !!(currentUser?.isSuperAdmin || (currentUser?.role && roleGrantsSuperAdmin(currentUser.role)));

  const setCampusScope = useCallback((scope: string) => {
    setCurrentCampusScope(scope);
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("fp_scope_changed", { detail: scope }));
    }
  }, []);

  const [currentRole, setCurrentRoleState] = useState<Role>("mentor");
  const [currentMentor, setCurrentMentor] = useState<Mentor | null>(null);
  const [currentHR, setCurrentHR] = useState<HRUser | null>(null);
  const [currentCAM, setCurrentCAM] = useState<CampusManager | null>(null);
  const [currentKAM, setCurrentKAM] = useState<KAMUser | null>(null);
  const [currentAdmin, setCurrentAdmin] = useState<AdminUser | null>(null);
  const [currentStudent, setCurrentStudent] = useState<Student | null>(null);
  const [currentShift, setCurrentShiftState] = useState<ShiftType>("general");

  const [isLoading, setIsLoading] = useState(true);
  const [isDataLoading, setIsDataLoading] = useState(false);
  const [dataLoadError, setDataLoadError] = useState(false);
  const [dataLoadMessage, setDataLoadMessage] = useState<string | null>(null);
  const [cappedSections, setCappedSections] = useState<string[]>([]);
  const [weekOffset, setWeekOffset] = useState<number>(0);
  const [baseDate, setBaseDate] = useState<string>(() => {
    const today = new Date();
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, '0');
    const d = String(today.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  });
  const activeCollegeId = 
    currentCAM?.college_id || 
    currentMentor?.college_id || 
    currentStudent?.college_id || 
    colleges[0]?.id;
  const activeCollegeObj = colleges.find(c => c.id === activeCollegeId);
  const collegeWorkingDays = activeCollegeObj ? Number(activeCollegeObj.working_days) : 5;
  const hasSaturdaySlots = slots.some(s => s.day === "Saturday");
  const workingDays = (collegeWorkingDays === 6 || hasSaturdaySlots) ? 6 : 5;

  // Memoised because it is a context value dependency: a fresh array every render rebuilt the
  // context object, so every useApp() consumer re-rendered on every provider render.
  const weekDates = useMemo(
    () => getWeekDates(weekOffset, baseDate, workingDays),
    [weekOffset, baseDate, workingDays]
  );

  const [customShiftTimeSlots, setCustomShiftTimeSlots] = useState<any>(SHIFT_TIME_SLOTS);

  useEffect(() => {
    // Determine active college ID
    const activeCollegeId = 
      currentCAM?.college_id || 
      currentMentor?.college_id || 
      currentStudent?.college_id || 
      colleges.find(c => c.kam_id === currentKAM?.id)?.id ||
      colleges[0]?.id;

    if (!activeCollegeId) {
      setCustomShiftTimeSlots(SHIFT_TIME_SLOTS);
      return;
    }

    const collegeObj = colleges.find(c => c.id === activeCollegeId);
    if (collegeObj && collegeObj.shift_configs) {
      try {
        const parsed = JSON.parse(collegeObj.shift_configs);
        setCustomShiftTimeSlots({
          shift_1: parsed.shift_1 || SHIFT_TIME_SLOTS.shift_1,
          shift_2: parsed.shift_2 || SHIFT_TIME_SLOTS.shift_2,
          general: parsed.general || SHIFT_TIME_SLOTS.general,
          semesters: parsed.semester_configs || {}
        });
      } catch (e) {
        console.error("Failed to parse custom shift timings:", e);
        setCustomShiftTimeSlots(SHIFT_TIME_SLOTS);
      }
    } else {
      setCustomShiftTimeSlots(SHIFT_TIME_SLOTS);
    }
  }, [colleges, currentCAM, currentMentor, currentStudent, currentKAM, currentSME]);

  // ── Fetch all data from the database ────────────────────────────────────────
  // ── DATA_FLOW_AUDIT D4: cross-tab / cross-role change broadcast ────────────
  // After a successful mutation, notify other tabs (and in-page listeners) that
  // a domain changed. DashboardLayout listens and triggers a scoped refresh.
  const broadcastDataChanged = useCallback((domain: string) => {
    const roots = new Set(queryRootsForDomain(domain));
    queryClient.invalidateQueries({
      predicate: (query) => roots.has(String(query.queryKey[0] ?? "")),
    });
    announceDataChanged(domain);
  }, [queryClient]);

  // DATA_FLOW_AUDIT D5: coalesce concurrent refreshes and drop stale responses.
  // The old version had no guard — two overlapping /api/data calls (login +
  // initApp, or import + refresh) could resolve out of order and the OLDER
  // snapshot would land last, resurrecting deleted records on screen.
  const refreshDataSeq = useRef(0);
  const refreshDataInFlight = useRef<{ key: string; promise: Promise<any> } | null>(null);
  const refreshDataImpl = async (silent: boolean = true, scope?: { role: Role; userId: string }) => {
    const scopeKey = scope ? `${scope.role}:${scope.userId}` : "auto";
    // Piggyback only on an identical scope — a scoped caller must not receive
    // an unscoped in-flight response.
    if (refreshDataInFlight.current?.key === scopeKey) {
      return refreshDataInFlight.current.promise;
    }
    const seq = ++refreshDataSeq.current;

    const run = async () => {
      setIsDataLoading(true);
      if (!silent) {
        startLoading("Fetching live database data…");
      }
    try {
      let role: Role;
      let userId: string;
      if (scope) {
        role = normalizeRoleValue(scope.role);
        userId = scope.userId;
      } else {
        role = normalizeRoleValue(currentRole || currentUser?.role || "admin");
        if (typeof window !== "undefined" && window.location.pathname.startsWith("/admin")) {
          role = "admin";
        }
        userId = currentUser?.reference_id || currentUser?.id || "";
        if (!userId) {
          if (role === "admin") userId = currentAdmin?.id || "admin_1";
          else if (role === "kam") userId = currentKAM?.id || "";
          else if (role === "cm") userId = currentCAM?.id || "";
          else if (role === "mentor") userId = currentMentor?.id || "";
          else if (role === "student") userId = currentStudent?.id || "";
          else if (role === "sme") userId = currentSME?.id || "";
          else if (role === "L and D") userId = "";
        }
      }

      const data = await apiFetch(`/api/data?role=${role}&userId=${encodeURIComponent(userId)}`);
      if (data.success) {
        // Some slices can fail while the rest load — name them, because "couldn't reach
        // the database" sent people to check a healthy prod database. A slice that only
        // hit its row cap is `truncatedSections`, shown as its own amber notice.
        setDataLoadError(Boolean(data.partial));
        setDataLoadMessage(data.partial ? describeFailedSections(data.failedSections || []) : null);
        setCappedSections(Array.isArray(data.truncatedSections) ? data.truncatedSections : []);
        setLastSyncTime(new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true }));
        // D5: a newer refresh started while this one was in flight — discard this
        // response instead of overwriting fresher state with stale data.
        if (seq !== refreshDataSeq.current) {
          return { mentors: [] as Mentor[], hr: [] as HRUser[], students: [] as Student[], smes: [] as any[] };
        }
        setSlots(data.slots || []);
        setRequests(data.requests || []);
        setApprovedHandovers(data.approvedHandovers || []);
        setAuditLogs(data.auditLogs || []);
        setMentors(data.mentors || []);
        setColleges(data.colleges || []);
        setHrList(data.hr || []);
        setSubjectsList(data.subjects || []);
        setDepartmentsList(data.departments || []);
        setStudents(data.students || []);
        setStudentAttendance(parseAttendancePayload(data));
        setLeaveRequests(data.leaveRequests || []);
        setHolidays(data.holidays || []);
        setWeeklyTasks(data.weeklyTasks || []);
        setStudentTracker(data.studentTracker || []);
        setWeeklyAcademicTasks(data.weeklyAcademicTasks || []);
        setStudentAcademicTracker(data.studentAcademicTracker || []);
        setAcademicTracker(data.academicTracker || []);
        setInterviews(data.interviews || []);
        setInterviewEvaluations(data.interviewEvaluations || []);
        setApprovals(data.approvals || []);
        setLeaveBalances(data.leaveBalances || []);
        setSmes(data.smes || []);
        setDemoSessions(data.demoSessions || []);
        setSubjectGroups(data.subjectGroups || []);
        setDemoRules(data.demoRules || []);
        setSignupRequests(data.signupRequests || []);
        if (data.smeAvailability) setSmeAvailability(data.smeAvailability);
        if (data.facultyLeaves) setFacultyLeaves(data.facultyLeaves);

        if (data.demoSwapRequests) setDemoSwapRequests(data.demoSwapRequests);
        if (data.kamTasks) setKamTasks(data.kamTasks);
        if (data.campusIssues) setCampusIssues(data.campusIssues);
        if (data.academicYears) setAcademicYears(data.academicYears.map((ay: any) => typeof ay === "string" ? ay : ay.year || ay.year_name || ay.name || String(ay)));
        if (data.academicEvents) setAcademicEvents(data.academicEvents);
        if (data.systemSettings) setSystemSettings(prev => ({ ...prev, ...data.systemSettings }));

        return {
          mentors: data.mentors || [] as Mentor[],
          hr: data.hr || [] as HRUser[],
          students: data.students || [] as Student[],
          smes: data.smes || [] as any[]
        };
      }
    } catch (e) {
      console.error("Error fetching data from API:", e);
      if (seq === refreshDataSeq.current) {
        const report = describeLoadFailure(e);
        setDataLoadError(true);
        setDataLoadMessage(report.message);
        setCappedSections([]);
      }
    } finally {
      setIsDataLoading(false);
      if (!silent) {
        stopLoading();
      }
    }
    return { mentors: [] as Mentor[], hr: [] as HRUser[], students: [] as Student[], smes: [] as any[] };
    };

    const promise = run().finally(() => {
      if (refreshDataInFlight.current?.promise === promise) {
        refreshDataInFlight.current = null;
      }
    });
    refreshDataInFlight.current = { key: scopeKey, promise };
    return promise;
  };
  const refreshData = useStableCallback(refreshDataImpl);

  /** Manual retry after a failed full data refresh (powers the DashboardLayout retry banner). */
  const retryDataLoad = useCallback(async () => {
    setDataLoadError(false);
    setDataLoadMessage(null);
    await refreshData(false);
  }, [refreshData]);

  // ── Surgical attendance-only refresh — re-fetches only studentAttendance from DB ──
  // Use this after bulk import or when mentor-marked data needs to reflect in CAM view
  const refreshAttendance = async (targetCollegeId?: string) => {
    try {
      setIsDataLoading(true); // show the top sync progress line during the swap
      const role = currentRole || currentUser?.role || "";
      const userId = currentUser?.reference_id || currentUser?.id || "";
      const colParam = targetCollegeId ? `&college_id=${encodeURIComponent(targetCollegeId)}` : "";
      const data = await apiFetch(`/api/data?role=${role}&userId=${encodeURIComponent(userId)}${colParam}&fields=attendance`);
      if (data.success && data.studentAttendance) {
        setStudentAttendance(parseAttendancePayload(data));
      }
    } catch (e) {
      console.error("Error refreshing attendance:", e);
    } finally {
      setIsDataLoading(false);
    }
  };

  /** Targeted domain workspace loader for active role */
  // Identity-stable because initApp's effect keys off it — re-creating it would re-run the
  // whole bootstrap. So it reads the college list through a ref: closing over `colleges`
  // meant it always saw the initial empty array, and a CM without a college_id fell through
  // to institution-wide ?college_id-less reads.
  const collegesRef = useRef(colleges);
  useEffect(() => {
    collegesRef.current = colleges;
  }, [colleges]);

  const loadRoleWorkspace = useCallback(async (role: Role, userId: string, collegeId?: string) => {
    setIsDataLoading(true);
    try {
      if (role === "mentor") {
        const [slotsData, requestsData] = await Promise.all([
          apiFetch(`/api/slots?mentorId=${encodeURIComponent(userId)}`).catch(() => ({})),
          apiFetch(`/api/requests?targetStaffId=${encodeURIComponent(userId)}`).catch(() => ({}))
        ]);
        if (slotsData?.success && Array.isArray(slotsData.slots)) setSlots(slotsData.slots);
        if (requestsData?.success && Array.isArray(requestsData.requests)) setRequests(requestsData.requests);
      } else if (role === "cm") {
        const targetCol = collegeId || (collegesRef.current[0]?.id || "");
        const colQuery = targetCol ? `college_id=${encodeURIComponent(targetCol)}` : "";
        const [slotsData, reqsData, mentorsData] = await Promise.all([
          apiFetch(colQuery ? `/api/slots?${colQuery}` : `/api/slots`).catch(() => ({})),
          apiFetch(colQuery ? `/api/requests?status=pending_cm&${colQuery}` : `/api/requests?status=pending_cm`).catch(() => ({})),
          apiFetch(colQuery ? `/api/mentors?${colQuery}` : `/api/mentors`).catch(() => ({}))
        ]);
        if (slotsData?.success && Array.isArray(slotsData.slots)) setSlots(slotsData.slots);
        if (reqsData?.success && Array.isArray(reqsData.requests)) setRequests(reqsData.requests);
        if (mentorsData?.success && Array.isArray(mentorsData.mentors)) setMentors(mentorsData.mentors);
      } else if (role === "student") {
        const slotsData = await apiFetch(`/api/slots?college_id=${encodeURIComponent(collegeId || "")}`).catch(() => ({}));
        if (slotsData?.success && Array.isArray(slotsData.slots)) setSlots(slotsData.slots);
      } else if (role === "kam") {
        // Only the dead `/api/kam` beside this call was removed — its response was never read
        // here. The colleges fetch stays: the bundle narrows a KAM to their own campuses and
        // returns an empty slice for a KAM with none assigned, so this is the last thing that
        // can still populate the campus list. Widening vs. narrowing that is an access-control
        // call, not a latency one.
        const collegesData = await apiFetch("/api/colleges").catch(() => ({}));
        if (collegesData?.success && Array.isArray(collegesData.colleges)) setColleges(collegesData.colleges);
      } else if (role === "admin") {
        // Only the full pending-signup list is unique to this call. `/api/data/reference`
        // pre-warms `SELECT * FROM colleges ORDER BY name` and the bundle re-sets it, so the
        // parallel /api/colleges fetch here was a third copy of the same rows.
        const signupData = await apiFetch("/api/admin/signup-requests").catch(() => ({}));
        if (signupData?.success && Array.isArray(signupData.requests)) setSignupRequests(signupData.requests);
      } else if (role === "sme") {
        const availData = await apiFetch(`/api/sme-availability?sme_id=${encodeURIComponent(userId)}`).catch(() => ({}));
        if (availData?.success && Array.isArray(availData.availability)) setSmeAvailability(availData.availability);
      }
      // L&D has no workspace read of its own. Its old demo-sessions calls were unscoped
      // ?college_id-less requests the endpoint rejects with 400, and /api/data already
      // returns the role-scoped demoSessions slice for both sme and L&D.
    } catch (err) {
      console.warn("loadRoleWorkspace error:", err);
    } finally {
      setIsDataLoading(false);
    }
  }, []);

  useEffect(() => {
    const initApp = async () => {
      document.documentElement.classList.remove("dark");

      // 1. Authenticate with server using HttpOnly cookie & load live profile.
      //    The reference slice is public and does not depend on who is signed in, so
      //    it goes out in the same wave instead of after the identity round trip.
      let authUser: AuthenticatedUser | null = null;
      const [authData, refData] = await Promise.all([
        apiFetch("/api/auth/me").catch(() => ({ success: false })),
        apiFetch("/api/data/reference").catch((refErr: unknown) => {
          console.warn("Reference data bootstrap error:", refErr);
          return { success: false };
        })
      ]);
      if (authData.success && authData.user) {
        authUser = authData.user;
        if (authData.csrfToken) {
          setClientCsrfToken(authData.csrfToken);
        }
      }

      // 2. Fast-path reference bootstrap (<30KB). Applied whether or not the session
      //    is live: the endpoint is public and a signed-out visitor on the login page
      //    becomes this user seconds later, so the lists are a pre-warm, not a leak.
      if (refData.success) {
        if (refData.colleges) setColleges(refData.colleges);
        if (refData.subjects) setSubjectsList(refData.subjects);
        if (refData.departments) setDepartmentsList(refData.departments);
        if (refData.academicYears) setAcademicYears(refData.academicYears);
        if (refData.systemSettings) setSystemSettings(prev => ({ ...prev, ...refData.systemSettings }));
      }

      if (!authUser) {
        setCurrentUser(null);
        setCurrentRoleState("mentor");
        setCurrentMentor(null);
        setCurrentHR(null);
        setCurrentCAM(null);
        setCurrentKAM(null);
        setCurrentAdmin(null);
        setCurrentStudent(null);
        setCurrentSME(null);
        setIsLoading(false);
        return;
      }

      setCurrentUser(authUser);

      // 3. Restore session using authoritative server user immediately (< 50ms total boot)
      // A super admin is restored as the admin console only: the role never
      // morphs into another person's portal, and the stored workspace is ignored.
      const parsedRole: Role = normalizeRoleValue(authUser.role);
      setCurrentRoleState(parsedRole);
      if (authUser.college_id) {
        setCurrentCampusScope(authUser.college_id);
      }

      const storedUserEmail = (authUser.email || "").toLowerCase().trim();
      const storedUserId = authUser.reference_id || authUser.id || "";
      const storedUserName = authUser.name || "";
      const storedCollegeId = authUser.college_id || "";

      if (parsedRole === "mentor") {
        setCurrentMentor({
          id: storedUserId,
          name: storedUserName || "Mentor",
          email: storedUserEmail,
          college_id: storedCollegeId,
          role: "mentor",
          avatar: ""
        } as any);
        setCurrentHR(null); setCurrentCAM(null); setCurrentKAM(null); setCurrentAdmin(null); setCurrentStudent(null); setCurrentSME(null);
      } else if (parsedRole === "cm" || (parsedRole as string) === "cam") {
        setCurrentCAM({
          id: storedUserId,
          name: storedUserName || "Campus Manager",
          email: storedUserEmail,
          college_id: storedCollegeId,
          college_name: storedCollegeId,
          kam_id: "",
          role: "cm"
        });
        setCurrentMentor(null); setCurrentHR(null); setCurrentKAM(null); setCurrentAdmin(null); setCurrentStudent(null); setCurrentSME(null);
      } else if (parsedRole === "kam") {
        setCurrentKAM({
          id: storedUserId,
          name: storedUserName || "Key Account Manager",
          email: storedUserEmail,
          role: "kam",
          title: "Key Account Manager"
        });
        setCurrentMentor(null); setCurrentHR(null); setCurrentCAM(null); setCurrentAdmin(null); setCurrentStudent(null); setCurrentSME(null);
      } else if (parsedRole === "admin") {
        setCurrentAdmin({
          id: storedUserId,
          name: storedUserName || "Administrator",
          email: storedUserEmail,
          role: "admin"
        });
        setCurrentMentor(null); setCurrentHR(null); setCurrentCAM(null); setCurrentKAM(null); setCurrentStudent(null); setCurrentSME(null);
      } else if (parsedRole === "student") {
        setCurrentStudent({
          id: storedUserId,
          name: storedUserName || "Student",
          email: storedUserEmail,
          college_id: storedCollegeId,
          classGroup: "General",
          role: "student"
        } as any);
        setCurrentMentor(null); setCurrentHR(null); setCurrentCAM(null); setCurrentKAM(null); setCurrentAdmin(null); setCurrentSME(null);
      } else if (parsedRole === "sme") {
        setCurrentSME({
          id: storedUserId,
          name: storedUserName || "SME",
          email: storedUserEmail,
          role: "sme"
        });
        setCurrentMentor(null); setCurrentHR(null); setCurrentCAM(null); setCurrentKAM(null); setCurrentAdmin(null); setCurrentStudent(null);
      } else if (parsedRole === "hr") {
        setCurrentHR(hrList[0] || null);
        setCurrentMentor(null); setCurrentCAM(null); setCurrentKAM(null); setCurrentAdmin(null); setCurrentStudent(null); setCurrentSME(null);
      } else if (parsedRole === "fee_manager") {
        setCurrentMentor(null); setCurrentHR(null); setCurrentCAM(null); setCurrentKAM(null); setCurrentAdmin(null); setCurrentStudent(null); setCurrentSME(null);
      } else if (parsedRole === "L and D") {
        setCurrentHR(hrList[0] || null);
        setCurrentMentor(null); setCurrentCAM(null); setCurrentKAM(null); setCurrentAdmin(null); setCurrentStudent(null); setCurrentSME(null);
      }

      // Shell renders immediately
      setIsLoading(false);

      // 4. Targeted role workspace loading in background
      loadRoleWorkspace(parsedRole, storedUserId, storedCollegeId);

      // 5. Silent background refresh of global database state
      refreshData(true, { role: parsedRole, userId: storedUserId }).catch(() => {});
    };

    initApp();
  }, [loadRoleWorkspace]);

  useEffect(() => {
    const today = new Date();
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, '0');
    const d = String(today.getDate()).padStart(2, '0');
    const todayStr = `${y}-${m}-${d}`;
    setBaseDate(todayStr);
  }, [currentStudent, currentMentor, studentAttendance, slots]);

  // ── Set current role and user from DB data ─────────────────────────────────
  const setRole = (role: Role, userId?: string, extra?: { collegeId?: string; userEmail?: string; userName?: string; isSuperAdmin?: boolean }) => {
    role = normalizeRoleValue(role);
    setCurrentRoleState(role);
    const userEmail = (extra?.userEmail || currentUser?.email || (typeof window !== "undefined" ? localStorage.getItem("fp_user_email") : "") || "").toLowerCase().trim();
    const sessionUserId = userId || currentUser?.reference_id || currentUser?.id || (typeof window !== "undefined" ? localStorage.getItem("fp_user_id") : "") || "";
    const userName = extra?.userName || currentUser?.name || (typeof window !== "undefined" ? localStorage.getItem("fp_user_name") : "") || "";
    const collegeId = extra?.collegeId || currentUser?.college_id || (typeof window !== "undefined" ? localStorage.getItem("fp_user_college_id") : "") || "";
    const isSuper = extra?.isSuperAdmin ?? currentUser?.isSuperAdmin ?? roleGrantsSuperAdmin(role);

    setCurrentUser({
      id: sessionUserId || `user_${role}`,
      reference_id: sessionUserId,
      role: role,
      email: userEmail,
      name: userName || userEmail || "User",
      college_id: collegeId,
      isSuperAdmin: isSuper
    });

    if (collegeId) {
      setCurrentCampusScope(collegeId);
    }

    if (role === "mentor") {
      const selectedId = userId || sessionUserId;
      const m = (selectedId ? mentors.find((item) => item.id === selectedId) : null)
        || (!!userEmail ? mentors.find((item) => String(item.email || "").toLowerCase() === userEmail) : null)
        || (selectedId ? {
            id: selectedId,
            name: userName || "Mentor",
            email: userEmail,
            college_id: collegeId,
            status: "active" as any,
            department: "",
            expertise: [],
            max_load: 20
          } : null);
      if (m) {
        setCurrentIdentityError(null);
        setCurrentMentor(m as any);
      }
      setCurrentHR(null); setCurrentCAM(null); setCurrentKAM(null); setCurrentAdmin(null); setCurrentStudent(null); setCurrentSME(null);
    } else if (role === "cm" || (role as string) === "cam") {
      const targetCamId = userId || sessionUserId;
      if (targetCamId) {
        const placeholderCam = { id: targetCamId, name: userName || (userEmail ? userEmail.split("@")[0] : ""), email: userEmail, college_id: collegeId, role: "cm" as const };
        setCurrentCAM(placeholderCam as any);
        fetch(`/api/cm?id=${encodeURIComponent(targetCamId)}`).then(r => r.json()).then(d => {
          if (d.success && d.cam) {
            setCurrentCAM({ ...d.cam, role: "cm" as const });
          }
        }).catch(() => {});
      }
      setCurrentMentor(null); setCurrentHR(null); setCurrentKAM(null); setCurrentAdmin(null); setCurrentStudent(null); setCurrentSME(null);
    } else if (role === "kam") {
      const targetKamId = userId || sessionUserId;
      if (targetKamId) {
        const placeholderKam = { id: targetKamId, name: userName || (userEmail ? userEmail.split("@")[0] : ""), email: userEmail, college_id: collegeId, role: "kam" as const };
        setCurrentKAM(placeholderKam as any);
        fetch(`/api/kam?id=${encodeURIComponent(targetKamId)}`).then(r => r.json()).then(d => {
          const kamData = d.kam || d.cam;
          if (d.success && kamData) {
            setCurrentKAM({ ...kamData, role: "kam" as const });
          }
        }).catch(() => {});
      }
      setCurrentMentor(null); setCurrentHR(null); setCurrentCAM(null); setCurrentAdmin(null); setCurrentStudent(null); setCurrentSME(null);
    } else if (role === "admin") {
      const targetAdminId = userId || sessionUserId || "admin_1";
      if (targetAdminId) {
        const placeholderAdmin = { id: targetAdminId, name: userName || "Administrator", email: userEmail, role: "admin" as const };
        setCurrentAdmin(placeholderAdmin);
        fetch(`/api/admin?id=${encodeURIComponent(targetAdminId)}`).then(r => r.json()).then(d => {
          if (d.success && d.admin) {
            setCurrentAdmin({ ...d.admin, role: "admin" as const });
          }
        }).catch(() => {});
      }
      setCurrentMentor(null); setCurrentHR(null); setCurrentCAM(null); setCurrentKAM(null); setCurrentStudent(null); setCurrentSME(null);
    } else if (role === "student") {
      const targetStudentId = userId || sessionUserId;
      if (targetStudentId) {
        const s = (targetStudentId ? students.find((item) => item.id === targetStudentId) : null)
          || (!!userEmail ? students.find((item) => String(item.email || "").toLowerCase() === userEmail) : null)
          || (targetStudentId ? {
              id: targetStudentId,
              student_name: userName || "Student",
              email: userEmail,
              college_id: collegeId,
              role: "student" as const
            } : null);
        if (s) {
          setCurrentIdentityError(null);
          setCurrentStudent(s as any);
        }
      }
      setCurrentMentor(null); setCurrentHR(null); setCurrentCAM(null); setCurrentKAM(null); setCurrentAdmin(null); setCurrentSME(null);
    } else if (role === "sme") {
      const targetSmeId = userId || sessionUserId;
      if (targetSmeId) {
        const s = (targetSmeId ? smes.find((item) => item.id === targetSmeId) : null)
          || (!!userEmail ? smes.find((item) => String(item.email || "").toLowerCase() === userEmail) : null)
          || (targetSmeId ? {
              id: targetSmeId,
              name: userName || "SME",
              email: userEmail,
              role: "sme" as const
            } : null);
        if (s) {
          setCurrentIdentityError(null);
          setCurrentSME(s as any);
        }
      }
      setCurrentMentor(null); setCurrentHR(null); setCurrentCAM(null); setCurrentKAM(null); setCurrentAdmin(null); setCurrentStudent(null);
    } else if (role === "fee_manager") {
      setCurrentMentor(null); setCurrentHR(null); setCurrentCAM(null); setCurrentKAM(null); setCurrentAdmin(null); setCurrentStudent(null); setCurrentSME(null);
    } else if (role === "L and D") {
      setCurrentMentor(null);
      setCurrentHR(hrList[0] || null);
      setCurrentCAM(null); setCurrentKAM(null); setCurrentAdmin(null); setCurrentStudent(null); setCurrentSME(null);
    } else {
      setCurrentMentor(null);
      setCurrentHR(hrList[0] || null);
      setCurrentCAM(null); setCurrentKAM(null); setCurrentAdmin(null); setCurrentStudent(null); setCurrentSME(null);
    }

    loadRoleWorkspace(role, sessionUserId, collegeId).catch(() => {});
    refreshData(true, { role, userId: sessionUserId }).catch(() => {});
  };

  // ── High-speed instantaneous logout — wipes in-memory state without full reload ──
  const logout = useCallback(() => {
    const currentUid = currentUser?.reference_id || currentUser?.id;
    if (currentUid) {
      fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "logout", userId: currentUid }),
        keepalive: true
      }).catch(() => {});
    }

    if (typeof window !== "undefined") {
      localStorage.removeItem("fp_logged_in");
      localStorage.removeItem("fp_is_super_admin");
      localStorage.removeItem("fp_must_change_pass");
      localStorage.removeItem("fp_current_role");
      localStorage.removeItem("fp_user_id");
      localStorage.removeItem("fp_user_email");
      localStorage.removeItem("fp_user_name");
      localStorage.removeItem("fp_user_snapshot");
      localStorage.removeItem("fp_mentor_id");
      localStorage.removeItem("fp_header_id");
      localStorage.removeItem("fp_cam_id");
      localStorage.removeItem("fp_kam_id");
      localStorage.removeItem("fp_admin_id");
      localStorage.removeItem("fp_student_id");
      localStorage.removeItem("fp_sme_id");
      localStorage.removeItem("fp_current_shift");
      localStorage.removeItem("fp_user_college_id");
      sessionStorage.clear();
    }

    setCurrentUser(null);
    setCurrentMentor(null);
    setCurrentHR(null);
    setCurrentCAM(null);
    setCurrentKAM(null);
    setCurrentAdmin(null);
    setCurrentStudent(null);
    setCurrentSME(null);
    setCurrentIdentityError(null);
    setCurrentRoleState("mentor");
    setIsLoading(false);
    setIsDataLoading(false);
    queryClient.clear();
  }, [currentUser, queryClient]);

  // Listen for global 401 session expiry events intercepted from API requests
  useEffect(() => {
    const handleSessionExpired = (event: any) => {
      const detail = event?.detail;
      const msg = detail?.code === "SESSION_IDLE"
        ? "Session expired due to 60 minutes of inactivity. Please log in again."
        : "Your session has expired. Please log in again.";
      try {
        toastFn(msg, "warning");
      } catch (_) {}
      logout();
    };

    window.addEventListener("ecampus_session_expired", handleSessionExpired);
    return () => {
      window.removeEventListener("ecampus_session_expired", handleSessionExpired);
    };
  }, [logout, toastFn]);

  const setCurrentShift = (shift: ShiftType) => {
    localStorage.setItem("fp_current_shift", shift);
    setCurrentShiftState(shift);
  };

  // Keep active user profile states in sync with refreshed database data
  useEffect(() => {
    if (currentRole === "sme" && currentSME) {
      const updatedSme = smes.find(s => s.id === currentSME.id);
      if (updatedSme && JSON.stringify(updatedSme) !== JSON.stringify(currentSME)) {
        setCurrentSME(updatedSme);
      }
    }
  }, [smes, currentRole, currentSME]);

  useEffect(() => {
    if (currentRole === "mentor" && currentMentor) {
      const updatedMentor = mentors.find(m => m.id === currentMentor.id);
      if (updatedMentor && JSON.stringify(updatedMentor) !== JSON.stringify(currentMentor)) {
        setCurrentMentor(updatedMentor);
      }
    }
  }, [mentors, currentRole, currentMentor]);

  useEffect(() => {
    if (currentRole === "student" && currentStudent) {
      const updatedStudent = students.find(s => s.id === currentStudent.id);
      if (updatedStudent && JSON.stringify(updatedStudent) !== JSON.stringify(currentStudent)) {
        setCurrentStudent(updatedStudent);
      }
    }
  }, [students, currentRole, currentStudent]);

  // ── Slot actions ───────────────────────────────────────────────────────────
  const assignSlot = async (mentorId: string, day: string, time: string, course: string, location: string, classGroup?: string) => {
    const actorName = currentCAM?.name || currentKAM?.name || "System";
    const actorRole = currentRole === "cm" ? "Campus Manager" : "Key Account Manager";
    const cleanLocation = location.trim();
    const cleanClassGroup = classGroup ? classGroup.trim() : "";
    const res = await fetch("/api/slots", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mentorId, day, time, course, location: cleanLocation, actorName, actorRole, shift: currentShift, classGroup: cleanClassGroup })
    });
    const data = await res.json();
    if (data.success) {
      const newSlot: Slot = {
        id: data.slot?.id || generateId("s"),
        mentorId,
        day,
        time,
        course,
        location: cleanLocation,
        shift: currentShift,
        classGroup: cleanClassGroup,
        college_id: currentCAM?.college_id || colleges[0]?.id || ""
      };
      setSlots(prev => [...prev, newSlot]);
    } else {
      throw new Error(data.message || "Failed to assign slot");
    }
  };

  const deleteSlot = async (slotId: string) => {
    const actorName = currentCAM?.name || currentKAM?.name || "System";
    const actorRole = currentRole === "cm" ? "Campus Manager" : "Key Account Manager";
    const res = await fetch(`/api/slots?id=${slotId}&actorName=${encodeURIComponent(actorName)}&actorRole=${encodeURIComponent(actorRole)}`, {
      method: "DELETE"
    });
    const data = await res.json();
    if (data.success) {
      setSlots(prev => prev.filter(s => s.id !== slotId));
    } else {
      throw new Error(data.message || "Failed to delete slot");
    }
  };

  const updateSlot = async (
    slotId: string,
    mentorId: string,
    day: string,
    time: string,
    course: string,
    location: string,
    classGroup?: string
  ): Promise<{ success: boolean; message?: string }> => {
    const actorName = currentCAM?.name || currentKAM?.name || currentMentor?.name || "System";
    const actorRole = currentRole === "cm" ? "Campus Manager" : currentRole === "kam" ? "Key Account Manager" : "Mentor";
    const cleanLocation = location.trim();
    const res = await fetch("/api/slots", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: slotId, mentorId, day, time, course, location: cleanLocation, actorName, actorRole, shift: currentShift, classGroup: classGroup ? classGroup.trim() : undefined })
    });
    const data = await res.json();
    if (data.success) {
      // DATA_FLOW_AUDIT D2: patch with the server's authoritative row (normalized
      // shift/classGroup/college) — falling back to form values only if the API
      // didn't return the row.
      if (data.slot) {
        setSlots(prev => prev.map(s => s.id === slotId ? { ...s, ...data.slot } : s));
      } else {
        setSlots(prev => prev.map(s => s.id === slotId ? { ...s, mentorId, day, time, course, location: cleanLocation, classGroup: classGroup ? classGroup.trim() : s.classGroup } : s));
      }
      broadcastDataChanged("slots");
      return { success: true };
    } else {
      return { success: false, message: data.message || "Failed to update slot" };
    }
  };

  const requestHandover = async (
    mentorId: string,
    slotId: string,
    dateStr: string,
    dateFormatted: string,
    targetStaffId: string,
    reason: string,
    subjectName?: string,
    classGroup?: string,
    targetStaffName?: string,
    requestType?: string
  ) => {
    const res = await fetch("/api/requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mentorId, slotId, dateStr, dateFormatted, targetStaffId, reason, subjectName, classGroup, targetStaffName, requestType })
    });
    const data = await res.json();
    if (data.success) {
      // Surgical update: add the new request to state without full reload
      const targetMentor = mentors.find(m => m.id === targetStaffId);
      const requestorMentor = mentors.find(m => m.id === mentorId);
      const reqSlot = slots.find(s => s.id === slotId);
      const isCamTarget = targetStaffId.toLowerCase().includes("cam") || targetStaffId.toLowerCase().includes("cm_") || reason.includes("Late Attendance");
      const newRequest: HandoverRequest = {
        id: data.requestId || data.request?.id || `req_${Date.now()}`,
        requestorId: mentorId,
        requestorName: requestorMentor?.name || currentMentor?.name || "",
        slotId,
        dateStr,
        dateFormatted,
        targetStaffId,
        targetStaffName: data.request?.targetStaffName || targetMentor?.name || (isCamTarget ? "CM Approval" : ""),
        reason,
        course: subjectName || data.request?.course || reqSlot?.course || "",
        classGroup: classGroup || data.request?.classGroup || reqSlot?.classGroup || "",
        day: data.request?.day || reqSlot?.day || "",
        time: data.request?.time || reqSlot?.time || "",
        status: data.request?.status || (isCamTarget ? "pending_cm" : "pending"),
        timestamp: data.request?.timestamp || new Date().toISOString(),
        request_type: requestType || data.request?.request_type || (isCamTarget ? "late_attendance" : undefined)
      };
      setRequests(prev => [newRequest, ...prev]);
    } else {
      throw new Error(data.message || "Failed to request handover");
    }
  };

  const requestSwapCompensate = async (
    requestorId: string,
    offerSlotId: string,
    offerDateStr: string,
    offerDateFormatted: string,
    targetStaffId: string,
    compensatesHandoverId?: string,
    reason?: string,
    originalSubject?: string,
    originalMonth?: string
  ): Promise<{ success: boolean; message: string }> => {
    const res = await fetch("/api/requests/swap", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        requestorId, offerSlotId, offerDateStr, offerDateFormatted,
        targetStaffId, compensatesHandoverId, reason,
        originalSubject, originalMonth
      })
    });
    const data = await res.json();
    if (data.success) {
      // Surgical update: add the new swap request to state
      const targetMentor = mentors.find(m => m.id === targetStaffId);
      const requestorMentor = mentors.find(m => m.id === requestorId);
      const offerSlot = slots.find(s => s.id === offerSlotId);
      const newRequest: HandoverRequest = {
        id: data.requestId || `req_swap_${Date.now()}`,
        requestorId,
        requestorName: requestorMentor?.name || "",
        slotId: offerSlotId,
        dateStr: offerDateStr,
        dateFormatted: offerDateFormatted,
        targetStaffId,
        targetStaffName: targetMentor?.name || "",
        reason: reason || "",
        course: originalSubject || offerSlot?.course || "",
        classGroup: offerSlot?.classGroup || "",
        day: offerSlot?.day || "",
        time: offerSlot?.time || "",
        status: "pending",
        timestamp: new Date().toISOString(),
        request_type: "swap_compensate"
      };
      setRequests(prev => [newRequest, ...prev]);
      return { success: true, message: data.message || "Swap offer sent!" };
    } else {
      return { success: false, message: data.message || "Failed to send swap offer." };
    }
  };

  const bookDemoSession = async (
    mentorId: string,
    mentorName: string,
    smeId: string,
    smeName: string,
    dateStr: string,
    timeSlot: string,
    subject: string,
    stream: string,
    week: number
  ): Promise<{ success: boolean; message: string }> => {
    const res = await fetch("/api/demo-sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "book",
        mentorId, mentorName, smeId, smeName, dateStr, timeSlot, subject, stream, week
      })
    });
    const data = await res.json();
    if (data.success) {
      const newSession = {
        id: data.sessionId || data.session?.id || `demo_${Date.now()}`,
        mentorId,
        mentorName,
        mentor_id: mentorId,
        mentor_name: mentorName,
        smeId,
        smeName,
        sme_id: smeId,
        sme_name: smeName,
        dateStr,
        date_str: dateStr,
        timeSlot,
        time_slot: timeSlot,
        subject,
        stream,
        week,
        week_number: week,
        status: "scheduled",
        created_at: new Date().toISOString(),
        ...(data.session || {})
      };
      if (!newSession.mentorId) newSession.mentorId = mentorId;
      if (!newSession.mentorName) newSession.mentorName = mentorName;
      if (!newSession.smeId) newSession.smeId = smeId;
      if (!newSession.smeName) newSession.smeName = smeName;
      if (!newSession.dateStr) newSession.dateStr = dateStr;
      if (!newSession.timeSlot) newSession.timeSlot = timeSlot;
      if (!newSession.week) newSession.week = week;
      setDemoSessions(prev => [newSession, ...prev]);
      return { success: true, message: data.message || "L&D session allocated successfully!" };
    } else {
      return { success: false, message: data.message || "Failed to allocate L&D session." };
    }
  };

  const evaluateDemoSession = async (
    sessionId: string,
    marks: number,
    comments: string,
    checklist?: any[]
  ): Promise<{ success: boolean; message: string }> => {
    const res = await fetch("/api/demo-sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "evaluate",
        sessionId, marks, comments, checklist
      })
    });
    const data = await res.json();        if (data.success) {
      // DB sets status 'completed' (see /api/demo-sessions evaluate) — keep local
      // state consistent so badges/KPIs don't show a phantom "evaluated" state.
      setDemoSessions(prev => prev.map(s => s.id === sessionId ? { ...s, marks, comments, status: "completed" } : s));
      return { success: true, message: data.message || "Evaluation saved successfully!" };
    } else {
      return { success: false, message: data.message || "Failed to save evaluation." };
    }
  };

  const bulkBookDemoSessions = async (sessions: any[]): Promise<{ success: boolean; message: string }> => {
    try {
      const res = await fetch("/api/demo-sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "bulk-book", sessions })
      });
      const data = await res.json();
      if (data.success) {
        if (data.sessions && Array.isArray(data.sessions)) {
          setDemoSessions(prev => [...data.sessions, ...prev]);
        }
        return { success: true, message: data.message || "L&D sessions allocated successfully!" };
      }
      return { success: false, message: data.message || "Failed to allocate L&D sessions." };
    } catch (e: any) {
      return { success: false, message: e.message || "An unexpected error occurred." };
    }
  };

  const updateDemoSession = async (sessionId: string, dateStr: string, timeSlot: string, smeId: string, smeName: string): Promise<{ success: boolean; message: string }> => {
    try {
      const res = await fetch("/api/demo-sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "update", sessionId, dateStr, timeSlot, smeId, smeName })
      });
      const data = await res.json();
      if (data.success) {
        setDemoSessions(prev => prev.map(s => s.id === sessionId ? { ...s, date_str: dateStr, time_slot: timeSlot, sme_id: smeId, sme_name: smeName } : s));
        return { success: true, message: data.message || "L&D session updated successfully." };
      }
      return { success: false, message: data.message || "Failed to update L&D session." };
    } catch (e: any) {
      return { success: false, message: e.message || "An unexpected error occurred." };
    }
  };

  const swapDemoSessions = async (session1Id: string, session2Id: string): Promise<{ success: boolean; message: string }> => {
    try {
      const res = await fetch("/api/demo-sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "swap", session1Id, session2Id })
      });
      const data = await res.json();
      if (data.success) {
        setDemoSessions(prev => {
          const s1 = prev.find(s => s.id === session1Id);
          const s2 = prev.find(s => s.id === session2Id);
          if (!s1 || !s2) return prev;
          return prev.map(s => {
            if (s.id === session1Id) return { ...s, date_str: s2.date_str, time_slot: s2.time_slot, sme_id: s2.sme_id, sme_name: s2.sme_name };
            if (s.id === session2Id) return { ...s, date_str: s1.date_str, time_slot: s1.time_slot, sme_id: s1.sme_id, sme_name: s1.sme_name };
            return s;
          });
        });
        return { success: true, message: data.message || "L&D sessions swapped successfully." };
      }
      return { success: false, message: data.message || "Failed to swap L&D sessions." };
    } catch (e: any) {
      return { success: false, message: e.message || "An unexpected error occurred." };
    }
  };

  const requestDemoSwap = async (payload: any): Promise<{ success: boolean; message: string }> => {
    try {
      const res = await fetch("/api/requests/demo-swap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "request", ...payload })
      });
      const data = await res.json();
      if (data.success) {
        if (data.request) {
          setDemoSwapRequests(prev => [data.request, ...prev]);
        }
        return { success: true, message: data.message || "L&D swap requested successfully." };
      }
      return { success: false, message: data.message || "Failed to request L&D swap." };
    } catch (e: any) {
      return { success: false, message: e.message || "An unexpected error occurred." };
    }
  };

  const resolveDemoSwap = async (requestId: string, status: "approved" | "rejected" | "pending_sme"): Promise<{ success: boolean; message: string }> => {
    try {
      const res = await fetch("/api/requests/demo-swap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "resolve", requestId, status })
      });
      const data = await res.json();
      if (data.success) {
        setDemoSwapRequests(prev => prev.map(r => r.id === requestId ? { ...r, status } : r));
        // Approving a swap rewrites demo_sessions server-side, so the request badge
        // alone is not the whole change: every dashboard that renders the session
        // must re-read or it keeps showing the old mentor/slot.
        if (status === "approved") {
          await refreshData();
          broadcastDataChanged("demos");
        }
        return { success: true, message: data.message || `L&D swap request ${status} successfully.` };
      }
      return { success: false, message: data.message || "Failed to resolve swap request." };
    } catch (e: any) {
      return { success: false, message: e.message || "An unexpected error occurred." };
    }
  };

  const deleteDemoSession = async (sessionId: string): Promise<{ success: boolean; message: string }> => {
    try {
      const res = await fetch(`/api/demo-sessions?id=${sessionId}`, {
        method: "DELETE"
      });
      const data = await res.json();
      if (data.success) {
        setDemoSessions(prev => prev.filter(s => s.id !== sessionId));
        return { success: true, message: data.message || "L&D session deleted successfully." };
      }
      return { success: false, message: data.message || "Failed to delete L&D session." };
    } catch (e: any) {
      return { success: false, message: e.message || "An unexpected error occurred." };
    }
  };

  const rescheduleDemoSession = async (
    sessionId: string,
    newDateStr: string,
    newTimeSlot: string
  ): Promise<{ success: boolean; message: string }> => {
    try {
      const res = await fetch("/api/demo-sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "reschedule",
          sessionId,
          mentorId: currentMentor?.id,
          newDateStr,
          newTimeSlot
        })
      });
      const data = await res.json();
      if (data.success) {
        // Phase B: the API no longer moves the slot — it creates a pending request
        // for Learning and Development. Refresh so the "reallocation required" state and
        // any L and D decision flow back into every dashboard.
        await refreshData();
        return { success: true, message: data.message || "Reschedule request sent to Learning and Development for approval." };
      }
      return { success: false, message: data.message || "Failed to reschedule L&D session." };
    } catch (e: any) {
      return { success: false, message: e.message || "An unexpected error occurred." };
    }
  };

  const createDemoRule = async (subject: string, week: number, target: number): Promise<{ success: boolean; message: string }> => {
    try {
      const res = await fetch("/api/demo-rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "create", subject, week, target })
      });
      const data = await res.json();
      if (data.success) {
        if (data.rule) {
          setDemoRules(prev => [data.rule, ...prev]);
        } else {
          setDemoRules(prev => [{ id: `dr_${Date.now()}`, subject, week_number: week, target_demos: target }, ...prev]);
        }
        return { success: true, message: data.message || "Rule created successfully!" };
      }
      return { success: false, message: data.message || "Failed to create rule." };
    } catch (e: any) {
      return { success: false, message: e.message || "An unexpected error occurred." };
    }
  };

  const deleteDemoRule = async (id: string): Promise<{ success: boolean; message: string }> => {
    try {
      const res = await fetch("/api/demo-rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", id })
      });
      const data = await res.json();
      if (data.success) {
        setDemoRules(prev => prev.filter(r => r.id !== id));
        return { success: true, message: data.message || "Rule deleted successfully." };
      }
      return { success: false, message: data.message || "Failed to delete rule." };
    } catch (e: any) {
      return { success: false, message: e.message || "An unexpected error occurred." };
    }
  };

  const createSubjectGroup = async (name: string, description: string, subjectIds?: string[], mentorIds?: string[], lead_sme_id?: string, lead_sme_name?: string): Promise<{ success: boolean; message: string }> => {
    try {
      const res = await fetch("/api/subject-groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description, subjectIds, mentorIds, lead_sme_id, lead_sme_name })
      });
      const data = await res.json();
      if (data.success) {
        if (data.group) {
          setSubjectGroups(prev => [...prev, data.group]);
        } else {
          setSubjectGroups(prev => [...prev, { id: `sg_${Date.now()}`, name, description, lead_sme_id, lead_sme_name }]);
        }
        return { success: true, message: data.message };
      }
      return { success: false, message: data.message || "Failed to create subject group." };
    } catch (e: any) {
      return { success: false, message: e.message || "An unexpected error occurred." };
    }
  };

  const updateSubjectGroup = async (id: string, name: string, description: string, subjectIds?: string[], mentorIds?: string[], lead_sme_id?: string, lead_sme_name?: string): Promise<{ success: boolean; message: string }> => {
    try {
      const res = await fetch("/api/subject-groups", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, name, description, subjectIds, mentorIds, lead_sme_id, lead_sme_name })
      });
      const data = await res.json();
      if (data.success) {
        setSubjectGroups(prev => prev.map(g => g.id === id ? { ...g, name, description, lead_sme_id, lead_sme_name } : g));
        return { success: true, message: data.message };
      }
      return { success: false, message: data.message || "Failed to update subject group." };
    } catch (e: any) {
      return { success: false, message: e.message || "An unexpected error occurred." };
    }
  };

  const deleteSubjectGroup = async (id: string): Promise<{ success: boolean; message: string }> => {
    try {
      const res = await fetch(`/api/subject-groups?id=${id}`, {
        method: "DELETE"
      });
      const data = await res.json();
      if (data.success) {
        setSubjectGroups(prev => prev.filter(g => g.id !== id));
        return { success: true, message: data.message };
      }
      return { success: false, message: data.message || "Failed to delete subject group." };
    } catch (e: any) {
      return { success: false, message: e.message || "An unexpected error occurred." };
    }
  };

  const updateSmeSubjectGroup = async (id: string, subject: string | null): Promise<{ success: boolean; message: string }> => {
    try {
      const res = await fetch("/api/smes", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, subject })
      });
      const data = await res.json();
      if (data.success) {
        setSmes(prev => prev.map(s => s.id === id ? { ...s, subject } : s));
        return { success: true, message: data.message };
      }
      return { success: false, message: data.message || "Failed to update SME subject group." };
    } catch (e: any) {
      return { success: false, message: e.message || "An unexpected error occurred." };
    }
  };

  const createSmeUser = async (id: string, name: string, email: string, subject?: string): Promise<{ success: boolean; message: string }> => {
    try {
      const res = await fetch("/api/smes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, name, email, subject })
      });
      const data = await res.json();
      if (data.success) {
        setSmes(prev => [...prev, { id, name, email, subject: subject || null }]);
        return { success: true, message: data.message };
      }
      return { success: false, message: data.message || "Failed to create SME." };
    } catch (e: any) {
      return { success: false, message: e.message || "An unexpected error occurred." };
    }
  };

  const updateSmeUser = async (id: string, name: string, email: string, subject?: string): Promise<{ success: boolean; message: string }> => {
    try {
      const res = await fetch("/api/smes", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, name, email, subject })
      });
      const data = await res.json();
      if (data.success) {
        setSmes(prev => prev.map(s => s.id === id ? { ...s, name, email, subject: subject || s.subject } : s));
        return { success: true, message: data.message };
      }
      return { success: false, message: data.message || "Failed to update SME." };
    } catch (e: any) {
      return { success: false, message: e.message || "An unexpected error occurred." };
    }
  };

  const deleteSmeUser = async (id: string): Promise<{ success: boolean; message: string }> => {
    try {
      const res = await fetch(`/api/smes?id=${id}`, {
        method: "DELETE"
      });
      const data = await res.json();
      if (data.success) {
        setSmes(prev => prev.filter(s => s.id !== id));
        return { success: true, message: data.message };
      }
      return { success: false, message: data.message || "Failed to delete SME." };
    } catch (e: any) {
      return { success: false, message: e.message || "An unexpected error occurred." };
    }
  };

  const requestBooking = async (mentorId: string, day: string, time: string, course: string, location: string, classGroup?: string): Promise<{ success: boolean; message?: string }> => {
    const actorName = currentMentor?.name || "System";
    const res = await fetch("/api/slots", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mentorId, day, time, course, location, actorName, actorRole: "Mentor", shift: currentShift, classGroup })
    });
    const data = await res.json();
    if (data.success) {
      // Surgical update: add new slot to state
      if (data.slot) {
        setSlots(prev => [...prev, data.slot]);
      } else {
        await refreshData();
      }
      return { success: true };
    } else {
      return { success: false, message: data.message || "Failed to book slot." };
    }
  };
  const cancelRequest = async (requestId: string): Promise<{ success: boolean; message: string }> => {
    try {
      const res = await fetch(`/api/requests/${requestId}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!data.success) {
        return { success: false, message: data.message || "Failed to cancel request" };
      }
      // Surgical update: remove the cancelled request from state
      setRequests(prev => prev.filter(r => r.id !== requestId));
      return { success: true, message: "Request cancelled successfully!" };
    } catch (error) {
      console.error(error);
      return { success: false, message: "An error occurred while cancelling the request." };
    }
  };


  const handleRequest = async (
    requestId: string,
    status: "approved" | "rejected",
    headerReason?: string,
    actorRole?: string,
    course?: string,
    options?: { action?: string; targetStaffId?: string }
  ) => {
    const approverName = currentCAM?.name || currentKAM?.name || currentMentor?.name || "System User";
    const cleanActorRole = actorRole || (currentRole === "cm" ? "Campus Manager" : currentRole === "kam" ? "Key Account Manager" : "Mentor");
    const res = await fetch("/api/requests/review", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        requestId,
        status,
        headerReason,
        approverName,
        actorRole: cleanActorRole,
        course,
        action: options?.action,
        targetStaffId: options?.targetStaffId
      })
    });
    const data = await res.json();
    if (data.success) {
      // Surgical update: update request status in-place
      setRequests(prev => prev.map(r => r.id === requestId ? { ...r, status } : r));

      // DATA_FLOW_AUDIT D3: prefer the server's authoritative handover row over a
      // locally-constructed one (the server handles swap reversal and FK fallbacks
      // the client can't know about).
      if (status === "approved" && data.handover) {
        const newHandover: ApprovedHandover = {
          requestId: data.handover.requestId || requestId,
          slotId: data.handover.slotId,
          dateStr: data.handover.dateStr,
          originalMentorId: data.handover.originalMentorId,
          coverStaffId: data.handover.coverStaffId,
          coverStaffName: data.handover.coverStaffName || "",
          course: data.handover.course || "",
          ledger_month: data.handover.ledger_month || data.handover.dateStr?.slice(0, 7) || ""
        };
        setApprovedHandovers(prev => prev.some(h => h.requestId === requestId) ? prev : [...prev, newHandover]);
      }
      broadcastDataChanged("requests");
    } else {
      throw new Error(data.message || "Failed to process request");
    }
  };

  const importCSV = async (csvContent: string): Promise<{ success: boolean; message: string; count: number }> => {
    try {
      const lines = csvContent.split("\n").map((l) => l.trim()).filter((l) => l.length > 0);
      if (lines.length <= 1) {
        return { success: false, message: "CSV has no data rows", count: 0 };
      }

      const hasHeader = lines[0].toLowerCase().includes("mentor") || lines[0].toLowerCase().includes("day");
      const dataLines = hasHeader ? lines.slice(1) : lines;

      const slotsToImport: { mentorId: string; day: string; time: string; course: string; location: string; shift: string; classGroup?: string }[] = [];

      const detectShiftFromTime = (time: string, classGroup?: string): ShiftType => {
        const normalized = time.toLowerCase().replace(/\s+/g, "");
        for (const shift of ["shift_1", "shift_2", "general"] as ShiftType[]) {
          const times = getTimeSlots(shift, classGroup);
          if (times.some(t => t.toLowerCase().replace(/\s+/g, "") === normalized)) {
            return shift;
          }
        }
        return "general";
      };

      for (const line of dataLines) {
        const parts = line.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/).map((p) => p.replace(/^"|"$/g, "").trim());
        if (parts.length >= 5) {
          const mentorIdOrEmailOrName = parts[0];
          const day = parts[1];
          const time = parts[2];
          const course = parts[3];
          const location = parts[4];
          const classGroup = parts[5] || "General Class";

          const mentor = mentors.find(
            (m) =>
              m.id.toLowerCase() === mentorIdOrEmailOrName.toLowerCase() ||
              m.name.toLowerCase() === mentorIdOrEmailOrName.toLowerCase() ||
              m.email.toLowerCase() === mentorIdOrEmailOrName.toLowerCase()
          );

          const normalizedDay = DAYS_OF_WEEK.find((d) => d.toLowerCase() === day.toLowerCase());
          
          const detectedShift = detectShiftFromTime(time, classGroup);
          const targetTimes = getTimeSlots(detectedShift, classGroup);
          const normalizedTime = targetTimes.find(
            (t) => t.toLowerCase().replace(/\s+/g, "") === time.toLowerCase().replace(/\s+/g, "")
          );

          if (mentor && normalizedDay && normalizedTime) {
            slotsToImport.push({
              mentorId: mentor.id,
              day: normalizedDay,
              time: normalizedTime,
              course,
              location,
              shift: detectedShift,
              classGroup
            });
          }
        }
      }

      if (slotsToImport.length > 0) {
        const actorName = currentCAM?.name || currentKAM?.name || "Manager";
        const res = await fetch("/api/slots/bulk", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ slots: slotsToImport, actorName })
        });
        const data = await res.json();
        if (data.success) {
          await refreshData();
          return { success: true, message: data.message, count: data.count };
        } else {
          return { success: false, message: data.message || "Import failed.", count: 0 };
        }
      }

      return { success: false, message: "No valid rows matched. CSV Format: mentor_name,day,time_slot,course,location", count: 0 };
    } catch {
      return { success: false, message: "Error parsing CSV file.", count: 0 };
    }
  };

  const markAttendance = async (
    slotId: string,
    dateStr: string,
    attendanceData: Array<{ studentId: string; status: "present" | "absent" | "od" | "late" | "not_marked" | string }>,
    coveredSubject?: string,
    type: "Regular" | "Non-Regular" = "Regular",
    mode: "Online" | "Offline" = "Offline",
    attendanceTypeSub?: string
  ): Promise<{ success: boolean; message: string }> => {
    try {
      const actorName = currentMentor?.name || "System";
      const actorRole = currentRole === "mentor" ? "Mentor" : "System";
      const res = await fetch("/api/attendance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slotId,
          dateStr,
          attendance: attendanceData,
          markedBy: currentMentor?.id || "System",
          actorName,
          actorRole,
          coveredSubject,
          type,
          mode,
          attendanceTypeSub
        })
      });
      const data = await res.json();
      if (data.success) {
        // DATA_FLOW_AUDIT D6: patch with the server's authoritative rows (real DB ids,
        // markedBy, timestamp) when available — never synthesize fake ids.
        if (Array.isArray(data.records) && data.records.length > 0) {
          const serverRows = data.records;
          setStudentAttendance(prev => {
            const rowKey = (r: any) => `${r.studentId}|${r.slotId}|${r.dateStr}`;
            const serverKeys = new Set(serverRows.map(rowKey));
            // Remove stale rows for the same slot+date not present in the server set
            // (they were "not_marked" deletions) and replace matching ones.
            const kept = prev.filter(a => !((a.slotId === slotId && a.dateStr === dateStr) && !serverKeys.has(rowKey(a))));
            const byKey = new Map(kept.map(a => [rowKey(a), a]));
            serverRows.forEach((r: any) => {
              const mapped = {
                ...r,
                type: r.type || type,
                mode: r.mode || mode,
                attendanceTypeSub: r.attendanceTypeSub ?? attendanceTypeSub
              };
              byKey.set(rowKey(mapped), mapped as any);
            });
            return Array.from(byKey.values());
          });
        } else {
          setStudentAttendance(prev => {
            const updated = [...prev];
            const keyToIndex = new Map<string, number>();
            for (let i = 0; i < updated.length; i++) {
              const a = updated[i];
              if (a.slotId === slotId && a.dateStr === dateStr) {
                keyToIndex.set(a.studentId, i);
              }
            }
            attendanceData.forEach(item => {
              const idx = keyToIndex.get(item.studentId);
              if (idx !== undefined) {
                updated[idx] = { ...updated[idx], status: item.status as any, type, mode, attendanceTypeSub };
              }
            });
            return updated;
          });
        }
        broadcastDataChanged("attendance");
        return { success: true, message: "Attendance marked successfully." };
      } else {
        return { success: false, message: data.message || "Failed to mark attendance." };
      }
    } catch (e: any) {
      return { success: false, message: e.message };
    }
  };

  const correctStudentAttendance = async (
    studentId: string,
    slotId: string,
    dateStr: string,
    newStatus: "present" | "absent" | "od",
    reason: string,
    isAdminOverride: boolean = false
  ): Promise<{ success: boolean; message: string }> => {
    try {
      const actorName = currentCAM?.name || currentAdmin?.name || "System";
      const actorRole = currentRole === "admin" ? "Super Admin" : "Campus Manager";
      const res = await fetch("/api/attendance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "correct",
          studentId,
          slotId,
          dateStr,
          newStatus,
          reason,
          changedBy: actorName,
          changedByRole: actorRole,
          isAdminOverride
        })
      });
      const data = await res.json();
      if (data.success) {
        // DATA_FLOW_AUDIT D9: merge the server's full corrected row (real id,
        // markedBy, timestamp) instead of only patching status.
        const serverRow = data.record;
        setStudentAttendance(prev => {
          const idx = prev.findIndex(a => a.studentId === studentId && a.slotId === slotId && a.dateStr === dateStr);
          if (serverRow) {
            if (idx >= 0) {
              const updated = [...prev];
              updated[idx] = { ...updated[idx], ...serverRow };
              return updated;
            }
            return [...prev, serverRow];
          }
          if (idx >= 0) {
            const updated = [...prev];
            updated[idx] = { ...updated[idx], status: newStatus as any };
            return updated;
          }
          return [...prev, {
            id: `att_${Date.now()}_${studentId}`,
            studentId,
            slotId,
            dateStr,
            status: newStatus as any,
            timestamp: new Date().toISOString()
          }];
        });
        broadcastDataChanged("attendance");
        return { success: true, message: data.message };
      } else {
        return { success: false, message: data.message || "Failed to correct attendance." };
      }
    } catch (e: any) {
      return { success: false, message: e.message || "An unexpected error occurred." };
    }
  };


  const clearAllData = async (): Promise<{ success: boolean; message: string }> => {
    const res = await fetch("/api/data", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "clear", confirm: "DELETE" })
    });
    const data = await res.json();
    if (data.success) {
      await refreshData();
      setRole("mentor");
      return { success: true, message: "All database records cleared." };
    } else {
      return { success: false, message: data.message || "Failed to clear database" };
    }
  };

  const createMentor = async (mentorData: Omit<Mentor, "role">) => {
    try {
      const res = await fetch("/api/mentors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(mentorData)
      });
      const data = await res.json();
      if (data.success) {
        const newM: Mentor = {
          ...mentorData,
          id: data.mentor?.id || mentorData.id || generateId("m"),
          role: "mentor",
          avatar: mentorData.avatar || ""
        };
        setMentors(prev => [...prev, newM]);
      }
      return data;
    } catch (e: any) {
      return { success: false, message: e.message };
    }
  };

  const bulkImportMentors = async (mentorsData: any[], defaultCollegeId?: string) => {
    try {
      const res = await fetch("/api/mentors/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mentors: mentorsData, defaultCollegeId })
      });
      const data = await res.json();
      if (data.success) {
        if (data.mentors && Array.isArray(data.mentors)) {
          setMentors(prev => [...prev, ...data.mentors]);
        }
      }
      return data;
    } catch (e: any) {
      return { success: false, message: e.message || "Bulk import failed." };
    }
  };

  const updateMentor = async (mentorData: Omit<Mentor, "role">) => {
    try {
      const res = await fetch("/api/mentors", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(mentorData)
      });
      const data = await res.json();
      if (data.success) {
        setMentors(prev => prev.map(m => m.id === mentorData.id ? { ...m, ...mentorData } : m));
      }
      return data;
    } catch (e: any) {
      return { success: false, message: e.message };
    }
  };

  const deleteMentor = async (id: string) => {
    try {
      const res = await fetch(`/api/mentors?id=${id}`, {
        method: "DELETE"
      });
      const data = await res.json();
      if (data.success) {
        setMentors(prev => prev.filter(m => m.id !== id));
      }
      return data;
    } catch (e: any) {
      return { success: false, message: e.message };
    }
  };

  const parseSemesterFromClassGroup = (cg?: string): string => {
    if (!cg) return "";
    const lower = cg.toLowerCase();
    if (lower.includes("sem 1") || lower.includes("sem i") || lower.includes("semester 1") || lower.includes("semester i")) return "Semester 1";
    if (lower.includes("sem 2") || lower.includes("sem ii") || lower.includes("semester 2") || lower.includes("semester ii")) return "Semester 2";
    if (lower.includes("sem 3") || lower.includes("sem iii") || lower.includes("semester 3") || lower.includes("semester iii")) return "Semester 3";
    if (lower.includes("sem 4") || lower.includes("sem iv") || lower.includes("semester 4") || lower.includes("semester iv")) return "Semester 4";
    if (lower.includes("sem 5") || lower.includes("sem v") || lower.includes("semester 5") || lower.includes("semester v")) return "Semester 5";
    if (lower.includes("sem 6") || lower.includes("sem vi") || lower.includes("semester 6") || lower.includes("semester vi")) return "Semester 6";
    if (lower.includes("sem 7") || lower.includes("sem vii") || lower.includes("semester 7") || lower.includes("semester vii")) return "Semester 7";
    if (lower.includes("sem 8") || lower.includes("sem viii") || lower.includes("semester 8") || lower.includes("semester viii")) return "Semester 8";
    return "";
  };

  const getTimeSlots = (shift: string, semesterOrClassGroup?: string, targetCollegeId?: string): string[] => {
    let rawShift = (shift || "").trim();

    // Auto-detect course-specific default_shift from DB if shift wasn't explicitly passed
    if ((!rawShift || rawShift.toLowerCase() === "all" || rawShift.toLowerCase() === "auto") && semesterOrClassGroup) {
      const foundCourse = coursesList.find(c => 
        semesterOrClassGroup.toLowerCase().includes(c.name.toLowerCase().trim()) ||
        c.name.toLowerCase().trim() === semesterOrClassGroup.toLowerCase().trim()
      );
      if (foundCourse && foundCourse.default_shift) {
        rawShift = foundCourse.default_shift;
      }
    }

    if (!rawShift) rawShift = "general";

    let sKey = rawShift.toLowerCase().replace(/\s+/g, "_");
    if (sKey === "shift1" || sKey === "shift_1") sKey = "shift_1";
    if (sKey === "shift2" || sKey === "shift_2") sKey = "shift_2";
    if (sKey === "gen" || sKey === "general") sKey = "general";

    let semester = semesterOrClassGroup || "";
    if (semester && !semester.startsWith("Semester")) {
      semester = parseSemesterFromClassGroup(semester);
    }

    // Resolve specific college shift configs if targetCollegeId provided
    let activeConfigs = customShiftTimeSlots;
    if (targetCollegeId) {
      const targetCol = colleges.find(c => c.id === targetCollegeId);
      if (targetCol && targetCol.shift_configs) {
        try {
          const parsed = JSON.parse(targetCol.shift_configs);
          activeConfigs = {
            shift_1: parsed.shift_1 || SHIFT_TIME_SLOTS.shift_1,
            shift_2: parsed.shift_2 || SHIFT_TIME_SLOTS.shift_2,
            general: parsed.general || SHIFT_TIME_SLOTS.general,
            semesters: parsed.semester_configs || {}
          };
        } catch (_) {}
      }
    }
    
    // Check Admin semester-level shift configs in DB
    if (semester && activeConfigs.semesters?.[semester]) {
      const semConfig = activeConfigs.semesters[semester];
      if (semConfig[sKey] && semConfig[sKey].length > 0) {
        return semConfig[sKey];
      }
      if (semConfig[rawShift] && semConfig[rawShift].length > 0) {
        return semConfig[rawShift];
      }
    }
    
    // Check Admin college-level shift configs in DB
    if (activeConfigs[sKey] && activeConfigs[sKey].length > 0) {
      return activeConfigs[sKey];
    }
    if (activeConfigs[rawShift] && activeConfigs[rawShift].length > 0) {
      return activeConfigs[rawShift];
    }
    
    // Fallback to static shift defaults
    return (SHIFT_TIME_SLOTS as any)[sKey] || (SHIFT_TIME_SLOTS as any)["general"] || [];
  };

  const generateTimetable = async (
    classGroup: string, 
    shift: ShiftType, 
    defaultRoom: string,
    allocations?: Array<{
      subjectId: string;
      subjectName: string;
      mentorId: string;
      weeklyHours: number;
      room?: string;
    }>,
    previewOnly: boolean = false
  ) => {
    try {
      // ─── Helpers ────────────────────────────────────────────────────────────────
      function shuffleArray<T>(arr: T[]): T[] {
        const a = [...arr];
        for (let i = a.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [a[i], a[j]] = [a[j], a[i]];
        }
        return a;
      }

      const { semester, year } = resolveClassGroupDetailsFromState(classGroup, subjectsList, coursesList);

      // ─── Build subjectsToAllocate ────────────────────────────────────────────
      const subjectsToAllocate: { mentorId: string; subject: string; hoursLeft: number; room: string }[] = [];

      if (allocations && allocations.length > 0) {
        allocations.forEach(a => {
          subjectsToAllocate.push({
            mentorId: a.mentorId,
            subject: a.subjectName,
            hoursLeft: a.weeklyHours,
            room: a.room || defaultRoom
          });
        });
      } else {
        // Fallback: use mentors that match the class group's department & shift
        const normGroupName = classGroup.toLowerCase().replace(/[-–—\s]*(sem|semester|shift|year|yr)\s*\w+/gi, "").trim();
        const targetShiftKey = (shift || "general").toLowerCase().replace(/\s+/g, "_");
        const deptMentors = mentors.filter((m) => {
          if (!m.subjects || !m.subjects.trim()) return false;
          if (m.department) {
            const normDept = m.department.toLowerCase().replace(/[^a-z0-9]/g, "");
            const normGroup = normGroupName.replace(/[^a-z0-9]/g, "");
            if (normDept.includes(normGroup.slice(0, 6)) || normGroup.includes(normDept.slice(0, 6))) {
              return true;
            }
          }
          return false;
        });

        // If department filtering yields no results, fall back to all mentors with subjects (with a warning)
        const candidateMentors = deptMentors.length > 0
          ? deptMentors
          : mentors.filter((m) => m.subjects && m.subjects.trim().length > 0);

        if (candidateMentors.length === 0) {
          return { success: false, message: "No mentors with subjects found to allocate." };
        }

        candidateMentors.forEach((m) => {
          const subs = m.subjects ? m.subjects.split(/\n|\/|,|;/).map(s => s.trim()).filter(Boolean) : [];
          subs.forEach((sub) => {
            subjectsToAllocate.push({
              mentorId: m.id,
              subject: sub,
              hoursLeft: 4,
              room: defaultRoom
            });
          });
        });
      }

      if (subjectsToAllocate.length === 0) {
        return { success: false, message: "No subjects configured for allocation." };
      }

      // ─── Shuffle subjects for varied output each run ─────────────────────────
      const shuffledSubjects = shuffleArray(subjectsToAllocate);

      const targetTimeSlots = getTimeSlots(shift, classGroup);
      const generatedSlots: any[] = [];

      // ─── Build & shuffle day×time pairs for spread distribution ─────────────
      const allSlotPairs = shuffleArray(
        DAYS_OF_WEEK.flatMap(day => targetTimeSlots.map(time => ({ day, time })))
      );

      // ─── Daily cap: each subject max ceil(hours/5) slots per day ─────────────
      // key: `${subjectKey}::${day}` → count placed that day
      const dailyPlacedCount = new Map<string, number>();

      // ─── Main scheduling loop ─────────────────────────────────────────────────
      let lastAllocatedIndex = 0;

      for (const { day, time } of allSlotPairs) {
        // Skip if cohort already has any class at this (day, time) — regardless of shift label
        const isCohortBusy =
          slots.some(s => s.classGroup && s.classGroup.toLowerCase() === classGroup.toLowerCase() && s.day === day && s.time === time) ||
          generatedSlots.some(s => s.classGroup.toLowerCase() === classGroup.toLowerCase() && s.day === day && s.time === time);
        if (isCohortBusy) continue;

        let allocated = false;
        for (let attempt = 0; attempt < shuffledSubjects.length; attempt++) {
          const index = (lastAllocatedIndex + attempt) % shuffledSubjects.length;
          const candidate = shuffledSubjects[index];
          if (candidate.hoursLeft <= 0) continue;

          // Daily cap: max ceil(hoursLeft / 5) slots per day per subject
          const dailyKey = `${candidate.subject}::${candidate.mentorId}::${day}`;
          const dailyCount = dailyPlacedCount.get(dailyKey) || 0;
          const dailyAllowed = Math.max(1, Math.ceil(candidate.hoursLeft / 5));
          if (dailyCount >= dailyAllowed) continue;

          // Mentor clash check — across ALL cohorts/departments/shifts (physical person can only be in one place)
          const isMentorClash =
            slots.some(s => s.mentorId === candidate.mentorId && s.day === day && s.time === time) ||
            generatedSlots.some(s => s.mentorId === candidate.mentorId && s.day === day && s.time === time);
          if (isMentorClash) continue;

          // Room clash check — across ALL cohorts/departments/shifts (a room can only hold one class at a time)
          const isRoomClash = candidate.room.trim() !== "" && (
            slots.some(s => s.location.toLowerCase() === candidate.room.toLowerCase() && s.day === day && s.time === time) ||
            generatedSlots.some(s => s.location.toLowerCase() === candidate.room.toLowerCase() && s.day === day && s.time === time)
          );
          if (isRoomClash) continue;

          //  Place slot
          generatedSlots.push({
            mentorId: candidate.mentorId,
            day,
            time,
            course: candidate.subject,
            location: candidate.room,
            shift,
            classGroup,
            semester,
            year
          });

          candidate.hoursLeft--;
          dailyPlacedCount.set(dailyKey, dailyCount + 1);
          lastAllocatedIndex = (index + 1) % shuffledSubjects.length;
          allocated = true;
          break;
        }
      }

      // ─── Unscheduled workload report ─────────────────────────────────────────
      const unscheduled: { subject: string; hours: number }[] = [];
      shuffledSubjects.forEach(s => {
        if (s.hoursLeft > 0) {
          unscheduled.push({ subject: s.subject, hours: s.hoursLeft });
        }
      });

      if (previewOnly) {
        return {
          success: true,
          message: `Preview generated successfully. Placed ${generatedSlots.length} slots.`,
          previewSlots: generatedSlots,
          unscheduled
        };
      }

      if (generatedSlots.length === 0) {
        return { success: false, message: "Failed to generate any slots. All candidate mentors had scheduling clashes." };
      }

      const actorName = currentCAM?.name || currentKAM?.name || "System";
      const actorRole = currentRole === "cm" ? "Campus Manager" : "Key Account Manager";
      const targetCollegeId = currentCAM?.college_id || activeCollegeId || "";

      // Delete existing slots for this classGroup first (strictly scoped to this college)
      await fetch(`/api/slots?classGroup=${encodeURIComponent(classGroup)}&college_id=${encodeURIComponent(targetCollegeId)}&actorName=${encodeURIComponent(actorName)}&actorRole=${encodeURIComponent(actorRole)}`, {
        method: "DELETE"
      });

      const res = await fetch("/api/slots/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slots: generatedSlots, actorName })
      });
      const data = await res.json();
      if (data.success) {
        setSlots(prev => {
          const filtered = prev.filter(s => !(s.classGroup && s.classGroup.toLowerCase() === classGroup.toLowerCase() && (!targetCollegeId || s.college_id === targetCollegeId)));
          const newSlots = generatedSlots.map((s, idx) => ({
            ...s,
            id: s.id || `gen_s_${Date.now()}_${idx}`,
            college_id: targetCollegeId
          }));
          return [...filtered, ...newSlots];
        });
        return { success: true, message: data.message || "Timetable generated successfully.", count: generatedSlots.length, unscheduled };
      } else {
        return { success: false, message: data.message || "Bulk import failed." };
      }
    } catch (e: any) {
      return { success: false, message: e.message };
    }
  };

  const clearTimetable = async (classGroup: string): Promise<{ success: boolean; message: string; count?: number }> => {
    try {
      const actorName = currentCAM?.name || currentKAM?.name || "System";
      const actorRole = currentRole === "cm" ? "Campus Manager" : "Key Account Manager";
      const targetCollegeId = currentCAM?.college_id || activeCollegeId || "";

      const res = await fetch(`/api/slots?classGroup=${encodeURIComponent(classGroup)}&college_id=${encodeURIComponent(targetCollegeId)}&actorName=${encodeURIComponent(actorName)}&actorRole=${encodeURIComponent(actorRole)}`, {
        method: "DELETE"
      });
      const data = await res.json();
      if (data.success) {
        if (data.count === undefined || data.count > 0) {
          setSlots(prev => prev.filter(s => !(s.classGroup && (s.classGroup.toLowerCase() === classGroup.toLowerCase() || isCohortMatch(s.classGroup, classGroup)) && (!targetCollegeId || s.college_id === targetCollegeId))));
        }
        return { success: true, count: data.count ?? 0, message: data.message || `Timetable for ${classGroup} cleared successfully.` };
      } else {
        return { success: false, count: 0, message: data.message || "Failed to clear timetable." };
      }
    } catch (e: any) {
      return { success: false, count: 0, message: e.message };
    }
  };

  const createSubject = async (subjectData: Omit<Subject, "id"> | Omit<Subject, "id">[]) => {
    try {
      const payload = Array.isArray(subjectData) ? { subjects: subjectData } : subjectData;
      const res = await fetch("/api/subjects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (data.success) {
        if (data.subjects && Array.isArray(data.subjects)) {
          setSubjectsList(prev => [...prev, ...data.subjects]);
        } else if (data.subject) {
          setSubjectsList(prev => [...prev, data.subject]);
        }
      }
      return data;
    } catch (e: any) {
      return { success: false, message: e.message };
    }
  };

  const updateSubject = async (subjectData: Subject) => {
    try {
      const res = await fetch("/api/subjects", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(subjectData)
      });
      const data = await res.json();
      if (data.success) {
        setSubjectsList(prev => prev.map(s => s.id === subjectData.id ? { ...s, ...subjectData } : s));
      }
      return data;
    } catch (e: any) {
      return { success: false, message: e.message };
    }
  };

  const deleteSubject = async (id: string) => {
    try {
      const res = await fetch(`/api/subjects?id=${id}`, {
        method: "DELETE"
      });
      const data = await res.json();
      if (data.success) {
        setSubjectsList(prev => prev.filter(s => s.id !== id));
      }
      return data;
    } catch (e: any) {
      return { success: false, message: e.message };
    }
  };

  const createCollege = async (collegeData: Omit<College, "dept_count" | "mentor_count" | "slot_count">) => {
    try {
      const res = await fetch("/api/colleges", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(collegeData)
      });
      const data = await res.json();
      if (data.success) {
        if (data.college) {
          setColleges(prev => [...prev, data.college]);
        }
      }
      return data;
    } catch (e: any) {
      return { success: false, message: e.message };
    }
  };

  const updateCollege = async (collegeData: Omit<College, "dept_count" | "mentor_count" | "slot_count">) => {
    try {
      const res = await fetch("/api/colleges", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(collegeData)
      });
      const data = await res.json();
      if (data.success) {
        setColleges(prev => prev.map(c => c.id === collegeData.id ? { ...c, ...collegeData } : c));
      }
      return data;
    } catch (e: any) {
      return { success: false, message: e.message };
    }
  };

  const deleteCollege = async (id: string) => {
    try {
      const res = await fetch(`/api/colleges?id=${id}`, {
        method: "DELETE"
      });
      const data = await res.json();
      if (data.success) {
        setColleges(prev => prev.filter(c => c.id !== id));
      }
      return data;
    } catch (e: any) {
      return { success: false, message: e.message };
    }
  };

  const createKAM = async (kamData: { id: string; name: string; email: string; title: string }) => {
    try {
      const res = await fetch("/api/kam", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(kamData)
      });
      const data = await res.json();
      // DATA_FLOW_AUDIT D1: reflect the new KAM on every college assigned to them.
      if (data.success) {
        setColleges(prev => prev.map(c => c.kam_id === kamData.id ? { ...c, kam_name: kamData.name } : c));
        broadcastDataChanged("kams");
      }
      return data;
    } catch (e: any) {
      return { success: false, message: e.message };
    }
  };

  const updateKAM = async (kamData: { id: string; name: string; email: string; title: string }) => {
    try {
      const res = await fetch("/api/kam", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(kamData)
      });
      const data = await res.json();
      // D1: surgical patch — colleges referencing this KAM pick up the new name.
      if (data.success) {
        setColleges(prev => prev.map(c => c.kam_id === kamData.id ? { ...c, kam_name: kamData.name } : c));
        broadcastDataChanged("kams");
      }
      return data;
    } catch (e: any) {
      return { success: false, message: e.message };
    }
  };

  const deleteKAM = async (id: string) => {
    try {
      const res = await fetch(`/api/kam?id=${id}`, {
        method: "DELETE"
      });
      const data = await res.json();
      // D1/D7: clear the stale KAM reference from college rows so campus cards
      // stop showing the deleted user.
      if (data.success) {
        setColleges(prev => prev.map(c => c.kam_id === id ? { ...c, kam_id: null as any, kam_name: undefined } : c));
        broadcastDataChanged("kams");
      }
      return data;
    } catch (e: any) {
      return { success: false, message: e.message };
    }
  };

  const createCAM = async (camData: { id: string; name: string; email: string; college_id: string; kam_id: string; password?: string }) => {
    try {
      const res = await fetch("/api/cm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(camData)
      });
      const data = await res.json();
      if (data.success && camData.college_id) {
        setColleges(prev => prev.map(c => c.id === camData.college_id ? { ...c, cam_id: camData.id, cam_name: camData.name, cam_email: camData.email } : c));
        broadcastDataChanged("cams");
      }
      return data;
    } catch (e: any) {
      return { success: false, message: e.message };
    }
  };

  const updateCAM = async (camData: { id: string; name: string; email: string; college_id: string; kam_id: string }) => {
    try {
      const res = await fetch("/api/cm", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(camData)
      });
      const data = await res.json();
      if (data.success && camData.college_id) {
        setColleges(prev => prev.map(c => c.id === camData.college_id ? { ...c, cam_id: camData.id, cam_name: camData.name, cam_email: camData.email } : c));
        broadcastDataChanged("cams");
      }
      return data;
    } catch (e: any) {
      return { success: false, message: e.message };
    }
  };

  const deleteCAM = async (id: string) => {
    try {
      const res = await fetch(`/api/cm?id=${id}`, {
        method: "DELETE"
      });
      const data = await res.json();
      // D7: null out the stale CAM reference on the affected college rows.
      if (data.success) {
        setColleges(prev => prev.map(c => (c as any).cam_id === id ? { ...c, cam_id: null as any, cam_name: undefined, cam_email: undefined } : c));
        broadcastDataChanged("cams");
      }
      return data;
    } catch (e: any) {
      return { success: false, message: e.message };
    }
  };

  const createCourse = async (course: Omit<Course, "id">) => {
    startLoading("Registering new department...");
    try {
      const res = await fetch("/api/courses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(course)
      });
      const data = await res.json();
      if (data.success) {
        if (data.course) {
          setDepartmentsList(prev => {
            const exists = prev.some(d => d.id === data.course.id || d.name.toLowerCase() === data.course.name.toLowerCase());
            if (exists) {
              return prev.map(d => (d.id === data.course.id || d.name.toLowerCase() === data.course.name.toLowerCase()) ? { ...d, ...data.course } : d);
            }
            return [...prev, data.course];
          });
        }
      }
      return data;
    } catch (e: any) {
      return { success: false, message: e.message };
    } finally {
      stopLoading();
    }
  };

  const updateCourse = async (course: Course) => {
    startLoading("Saving department changes...");
    try {
      const res = await fetch("/api/courses", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(course)
      });
      const data = await res.json();
      if (data.success) {
        const updatedCourse = data.course || course;
        setDepartmentsList(prev => prev.map(d => (d.id === course.id || d.name.toLowerCase() === course.name.toLowerCase()) ? { ...d, ...updatedCourse } : d));
      }
      return data;
    } catch (e: any) {
      return { success: false, message: e.message };
    } finally {
      stopLoading();
    }
  };

  const updateStudent = async (student: Student) => {
    startLoading("Updating student record...");
    try {
      const res = await fetch("/api/students", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(student)
      });
      const data = await res.json();
      if (data.success) {
        setStudents(prev => prev.map(s => s.id === student.id ? { ...s, ...student } : s));
      }
      return data;
    } catch (e: any) {
      return { success: false, message: e.message };
    } finally {
      stopLoading();
    }
  };

  const deleteStudent = async (id: string) => {
    startLoading("Deleting student record...");
    try {
      const res = await fetch(`/api/students?id=${encodeURIComponent(id)}`, {
        method: "DELETE"
      });
      const data = await res.json();
      if (data.success) {
        setStudents(prev => prev.filter(s => s.id !== id));
      }
      return data;
    } catch (e: any) {
      return { success: false, message: e.message };
    } finally {
      stopLoading();
    }
  };

  const bulkDeleteStudents = async (ids: string[]) => {
    if (!ids || ids.length === 0) return { success: false, message: "No student IDs provided." };
    startLoading(`Deleting ${ids.length} student records...`);
    try {
      const res = await fetch("/api/students", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids })
      });
      const data = await res.json();
      if (data.success) {
        const idSet = new Set(ids);
        setStudents(prev => prev.filter(s => !idSet.has(s.id)));
      }
      return data;
    } catch (e: any) {
      return { success: false, message: e.message };
    } finally {
      stopLoading();
    }
  };

  const deleteCourse = async (id: string) => {
    startLoading("Deleting department and linked records...");
    try {
      const res = await fetch(`/api/courses?id=${id}`, {
        method: "DELETE"
      });
      const data = await res.json();
      if (data.success) {
        setDepartmentsList(prev => prev.filter(d => d.id !== id && d.name !== id));
      }
      return data;
    } catch (e: any) {
      return { success: false, message: e.message };
    } finally {
      stopLoading();
    }
  };

  const createDepartment = createCourse;
  const updateDepartment = updateCourse;
  const deleteDepartment = deleteCourse;

  const assignWeeklyTask = async (taskData: {
    classGroup: string;
    subject: string;
    weekNumber: number;
    taskName: string;
    taskPdfUrl?: string;
    mentorId: string;
  }) => {
    try {
      const res = await fetch("/api/student-tracker", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "assign_task", ...taskData })
      });
      const data = await res.json();
      if (data.success && data.task) {
        setWeeklyTasks(prev => {
          // DATA_FLOW_AUDIT D8: dedupe by the returned row's id (authoritative);
          // business-field matching missed rows whose class_group was stored
          // normalized differently, producing visible duplicates.
          const filtered = prev.filter(t =>
            t.id !== data.task.id && !(
              t.class_group?.toLowerCase().trim() === taskData.classGroup.toLowerCase().trim() &&
              t.subject?.toLowerCase().trim() === taskData.subject.toLowerCase().trim() &&
              t.week_number === taskData.weekNumber
            )
          );
          return [...filtered, data.task];
        });
        broadcastDataChanged("weeklyTasks");
        return { success: true, task: data.task };
      }
      return { success: false, message: data.message || "Failed to assign task." };
    } catch (e: any) {
      console.error("assignWeeklyTask error:", e);
      return { success: false, message: e.message };
    }
  };

  const gradeStudentTask = async (entryData: {
    studentId: string;
    classGroup: string;
    subject: string;
    weekNumber: number;
    submissionUrl?: string;
    vivaAssessment?: string;
    marks?: number;
    gradedBy?: string;
  }) => {
    try {
      const res = await fetch("/api/student-tracker", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "grade_entry", ...entryData })
      });
      const data = await res.json();
      if (data.success && data.entry) {
        setStudentTracker(prev => {
          // D8: dedupe by authoritative id first, business fields second.
          const filtered = prev.filter(e =>
            e.id !== data.entry.id && !(
              e.student_id === entryData.studentId &&
              e.class_group?.toLowerCase().trim() === entryData.classGroup.toLowerCase().trim() &&
              e.subject?.toLowerCase().trim() === entryData.subject.toLowerCase().trim() &&
              e.week_number === entryData.weekNumber
            )
          );
          return [...filtered, data.entry];
        });
        broadcastDataChanged("studentTracker");
        return { success: true, entry: data.entry };
      }
      return { success: false, message: data.message || "Failed to update grade." };
    } catch (e: any) {
      console.error("gradeStudentTask error:", e);
      return { success: false, message: e.message };
    }
  };

  const deleteWeeklyTask = async (classGroup: string, subject: string, weekNumber: number) => {
    try {
      const res = await fetch(
        `/api/student-tracker?classGroup=${encodeURIComponent(classGroup)}&subject=${encodeURIComponent(subject)}&weekNumber=${weekNumber}`,
        { method: "DELETE" }
      );
      const data = await res.json();
      if (data.success) {
        setWeeklyTasks(prev =>
          prev.filter(
            t => !(
              t.class_group.toLowerCase().trim() === classGroup.toLowerCase().trim() &&
              t.subject.toLowerCase().trim() === subject.toLowerCase().trim() &&
              t.week_number === weekNumber
            )
          )
        );
        setStudentTracker(prev =>
          prev.filter(
            e => !(
              e.class_group.toLowerCase().trim() === classGroup.toLowerCase().trim() &&
              e.subject.toLowerCase().trim() === subject.toLowerCase().trim() &&
              e.week_number === weekNumber
            )
          )
        );
        return { success: true, message: data.message };
      }
      return { success: false, message: data.message || "Failed to delete task." };
    } catch (e: any) {
      console.error("deleteWeeklyTask error:", e);
      return { success: false, message: e.message };
    }
  };

  const saveAcademicTrackerEntry = async (entryData: {
    id?: string;
    date: string;
    periodSlot: string;
    classGroup: string;
    subject: string;
    unit: string;
    topic: string;
    comments?: string;
    status?: string;
    mentorId: string;
    mentorName?: string;
    collegeId?: string;
    weeklyPlanId?: string;
    weeklyPlanWeek?: number;
  }) => {
    try {
      const res = await fetch("/api/academic-tracker", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(entryData)
      });
      const data = await res.json();
      if (data.success && data.entry) {
        setAcademicTracker(prev => {
          const filtered = prev.filter(e => e.id !== data.entry.id && !(
            e.mentor_id === data.entry.mentor_id &&
            e.date === data.entry.date &&
            e.period_slot === data.entry.period_slot &&
            e.subject.toLowerCase().trim() === data.entry.subject.toLowerCase().trim() &&
            e.class_group.toLowerCase().trim() === data.entry.class_group.toLowerCase().trim()
          ));
          return [data.entry, ...filtered];
        });
        return { success: true, entry: data.entry, message: data.message };
      }
      return { success: false, message: data.message || "Failed to record academic log." };
    } catch (e: any) {
      console.error("saveAcademicTrackerEntry error:", e);
      return { success: false, message: e.message };
    }
  };

  const deleteAcademicTrackerEntry = async (id: string) => {
    try {
      const res = await fetch(`/api/academic-tracker?id=${encodeURIComponent(id)}`, {
        method: "DELETE"
      });
      const data = await res.json();
      if (data.success) {
        setAcademicTracker(prev => prev.filter(e => e.id !== id));
        return { success: true, message: data.message };
      }
      return { success: false, message: data.message || "Failed to delete log." };
    } catch (e: any) {
      console.error("deleteAcademicTrackerEntry error:", e);
      return { success: false, message: e.message };
    }
  };

  const assignWeeklyAcademicTask = async (taskData: {
    classGroup: string;
    subject: string;
    weekNumber: number;
    taskName: string;
    taskPdfUrl?: string;
    taskDate?: string;
    quizTopic?: string;
    assessmentTopic?: string;
    assignmentTopic?: string;
    mentorId: string;
  }) => {
    try {
      const res = await fetch("/api/academic-tracker", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "assign_weekly_task", ...taskData })
      });
      const data = await res.json();
      if (data.success && data.task) {
        setWeeklyAcademicTasks(prev => {
          const filtered = prev.filter(
            t => !(
              t.class_group.toLowerCase().trim() === taskData.classGroup.toLowerCase().trim() &&
              t.subject.toLowerCase().trim() === taskData.subject.toLowerCase().trim() &&
              t.week_number === taskData.weekNumber
            )
          );
          return [...filtered, data.task];
        });
        return { success: true, task: data.task };
      }
      return { success: false, message: data.message || "Failed to assign academic task." };
    } catch (e: any) {
      console.error("assignWeeklyAcademicTask error:", e);
      return { success: false, message: e.message };
    }
  };

  const gradeStudentAcademicTask = async (entryData: {
    studentEmail: string;
    studentId?: string;
    classGroup: string;
    subject: string;
    weekNumber: number;
    quizMarks?: number | null;
    assessmentMarks?: number | null;
    assignmentMarks?: number | null;
    attendanceStatus?: string;
    submissionUrl?: string;
    feedback?: string;
    gradedBy?: string;
  }) => {
    try {
      const res = await fetch("/api/academic-tracker", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "grade_student", ...entryData })
      });
      const data = await res.json();
      if (data.success && data.entry) {
        setStudentAcademicTracker(prev => {
          const filtered = prev.filter(
            e => !(
              e.student_email.toLowerCase().trim() === entryData.studentEmail.toLowerCase().trim() &&
              e.class_group.toLowerCase().trim() === entryData.classGroup.toLowerCase().trim() &&
              e.subject.toLowerCase().trim() === entryData.subject.toLowerCase().trim() &&
              e.week_number === entryData.weekNumber
            )
          );
          return [...filtered, data.entry];
        });
        return { success: true, entry: data.entry };
      }
      return { success: false, message: data.message || "Failed to update grade." };
    } catch (e: any) {
      console.error("gradeStudentAcademicTask error:", e);
      return { success: false, message: e.message };
    }
  };

  const bulkUploadAcademicMarks = async (bulkData: {
    records: any[];
    classGroup: string;
    subject: string;
    weekNumber: number;
    gradedBy?: string;
  }) => {
    try {
      const res = await fetch("/api/academic-tracker", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "bulk_upload_marks", ...bulkData })
      });
      const data = await res.json();
      if (data.success) {
        if (data.studentTracker) {
          setStudentAcademicTracker(prev => {
            const keysToReplace = new Set(
              data.studentTracker.map((e: any) =>
                `${e.student_email.toLowerCase().trim()}_${e.class_group.toLowerCase().trim()}_${e.subject.toLowerCase().trim()}_${e.week_number}`
              )
            );
            const filtered = prev.filter(
              e => !keysToReplace.has(`${e.student_email.toLowerCase().trim()}_${e.class_group.toLowerCase().trim()}_${e.subject.toLowerCase().trim()}_${e.week_number}`)
            );
            return [...filtered, ...data.studentTracker];
          });
        }
        return { success: true, updatedCount: data.updatedCount, message: data.message };
      }
      return { success: false, message: data.message || "Failed to bulk upload academic marks." };
    } catch (e: any) {
      console.error("bulkUploadAcademicMarks error:", e);
      return { success: false, message: e.message };
    }
  };

  const deleteWeeklyAcademicTask = async (classGroup: string, subject: string, weekNumber: number) => {
    try {
      const res = await fetch(
        `/api/academic-tracker?action=delete_weekly_task&classGroup=${encodeURIComponent(classGroup)}&subject=${encodeURIComponent(subject)}&weekNumber=${weekNumber}`,
        { method: "DELETE" }
      );
      const data = await res.json();
      if (data.success) {
        setWeeklyAcademicTasks(prev =>
          prev.filter(
            t => !(
              t.class_group.toLowerCase().trim() === classGroup.toLowerCase().trim() &&
              t.subject.toLowerCase().trim() === subject.toLowerCase().trim() &&
              t.week_number === weekNumber
            )
          )
        );
        setStudentAcademicTracker(prev =>
          prev.filter(
            e => !(
              e.class_group.toLowerCase().trim() === classGroup.toLowerCase().trim() &&
              e.subject.toLowerCase().trim() === subject.toLowerCase().trim() &&
              e.week_number === weekNumber
            )
          )
        );
        return { success: true, message: data.message };
      }
      return { success: false, message: data.message || "Failed to delete task." };
    } catch (e: any) {
      console.error("deleteWeeklyAcademicTask error:", e);
      return { success: false, message: e.message };
    }
  };

  const addInterview = async (interviewData: Partial<StudentInterview>) => {
    try {
      const res = await fetch("/api/interviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(interviewData),
      });
      const data = await res.json();
      if (data.success && data.interview) {
        setInterviews(prev => [data.interview, ...prev.filter(i => i.id !== data.interview.id)]);
        return { success: true, interview: data.interview };
      }
      return { success: false, message: data.message || "Failed to save interview record." };
    } catch (e: any) {
      console.error("addInterview error:", e);
      return { success: false, message: e.message };
    }
  };

  const deleteInterview = async (id: string) => {
    try {
      const res = await fetch(`/api/interviews?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      const data = await res.json();
      if (data.success) {
        setInterviews(prev => prev.filter(i => i.id !== id));
        return { success: true, message: data.message };
      }
      return { success: false, message: data.message || "Failed to delete interview." };
    } catch (e: any) {
      console.error("deleteInterview error:", e);
      return { success: false, message: e.message };
    }
  };

  const saveKamTask = async (task: any) => {
    try {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(task),
      });
      const data = await res.json();
      if (data.success) {
        if (data.task) {
          setKamTasks(prev => {
            const exists = prev.some(t => t.id === data.task.id);
            if (exists) {
              return prev.map(t => t.id === data.task.id ? data.task : t);
            }
            return [data.task, ...prev];
          });
        }
        return { success: true, task: data.task };
      }
      return { success: false, message: data.message || "Failed to save task" };
    } catch (e: any) {
      return { success: false, message: e.message };
    }
  };

  const deleteKamTask = async (id: string) => {
    try {
      const res = await fetch(`/api/tasks?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      const data = await res.json();
      if (data.success) {
        setKamTasks(prev => prev.filter(t => t.id !== id));
        return { success: true };
      }
      return { success: false, message: data.message || "Failed to delete task" };
    } catch (e: any) {
      return { success: false, message: e.message };
    }
  };

  const saveCampusIssue = async (issue: any) => {
    try {
      const res = await fetch("/api/issues", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(issue),
      });
      const data = await res.json();
      if (data.success) {
        if (data.issue) {
          setCampusIssues(prev => {
            const exists = prev.some(i => i.id === data.issue.id);
            if (exists) {
              return prev.map(i => i.id === data.issue.id ? data.issue : i);
            }
            return [data.issue, ...prev];
          });
        }
        return { success: true, issue: data.issue };
      }
      return { success: false, message: data.message || "Failed to save issue" };
    } catch (e: any) {
      return { success: false, message: e.message };
    }
  };

  const updateCampusIssueStatus = async (id: string, status?: string, resolvedAt?: string, escalated?: boolean, escalatedAt?: string) => {
    try {
      const res = await fetch("/api/issues", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status, resolvedAt, escalated, escalatedAt }),
      });
      const data = await res.json();
      if (data.success) {
        setCampusIssues(prev => prev.map(i => i.id === id ? { ...i, ...(status ? { status } : {}), ...(resolvedAt !== undefined ? { resolved_at: resolvedAt } : {}), ...(escalated !== undefined ? { escalated: escalated ? 1 : 0 } : {}), ...(escalatedAt !== undefined ? { escalated_at: escalatedAt } : {}) } : i));
        return { success: true };
      }
      return { success: false, message: data.message || "Failed to update issue status" };
    } catch (e: any) {
      return { success: false, message: e.message };
    }
  };

  const deleteCampusIssue = async (id: string) => {
    try {
      const res = await fetch(`/api/issues?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      const data = await res.json();
      if (data.success) {
        setCampusIssues(prev => prev.filter(i => i.id !== id));
        return { success: true };
      }
      return { success: false, message: data.message || "Failed to delete issue" };
    } catch (e: any) {
      return { success: false, message: e.message };
    }
  };

  const saveAcademicYear = async (yearName: string) => {
    try {
      const res = await fetch("/api/academic-calendar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "year", data: { year_name: yearName } }),
      });
      const data = await res.json();
      if (data.success) {
        setAcademicYears(prev => prev.includes(yearName) ? prev : [...prev, yearName]);
        broadcastDataChanged("events");
        return { success: true };
      }
      return { success: false, message: data.message || "Failed to save year" };
    } catch (e: any) {
      return { success: false, message: e.message };
    }
  };

  const deleteAcademicYear = async (yearName: string) => {
    try {
      const res = await fetch(`/api/academic-calendar?type=year&value=${encodeURIComponent(yearName)}`, { method: "DELETE" });
      const data = await res.json();
      if (data.success) {
        setAcademicYears(prev => prev.filter(y => y !== yearName));
        broadcastDataChanged("events");
        return { success: true };
      }
      return { success: false, message: data.message || "Failed to delete year" };
    } catch (e: any) {
      return { success: false, message: e.message };
    }
  };

  const saveAcademicEvent = async (event: any) => {
    try {
      const res = await fetch("/api/academic-calendar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "event", data: event }),
      });
      const data = await res.json();
      if (data.success) {
        const savedEvent = data.event || event;
        setAcademicEvents(prev => {
          const exists = prev.some(e => e.id === savedEvent.id);
          if (exists) {
            return prev.map(e => e.id === savedEvent.id ? savedEvent : e);
          }
          return [...prev, savedEvent];
        });
        broadcastDataChanged("events");
        return { success: true, event: savedEvent, dayOrderSync: data.dayOrderSync };
      }
      return { success: false, message: data.message || "Failed to save event" };
    } catch (e: any) {
      return { success: false, message: e.message };
    }
  };

  const deleteAcademicEvent = async (id: string) => {
    try {
      const res = await fetch(`/api/academic-calendar?type=event&value=${encodeURIComponent(id)}`, { method: "DELETE" });
      const data = await res.json();
      if (data.success) {
        setAcademicEvents(prev => prev.filter(e => e.id !== id));
        broadcastDataChanged("events");
        return { success: true };
      }
      return { success: false, message: data.message || "Failed to delete event" };
    } catch (e: any) {
      return { success: false, message: e.message };
    }
  };

  const saveFacultyConfig = async (mentorId: string, maxHours: number, shift?: string) => {
    try {
      const res = await fetch("/api/faculty-constraints", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mentorId, maxHours, ...(shift ? { shift } : {}) }),
      });
      const data = await res.json();
      if (data.success) {
        setFacultyWorkloadLimits(prev => ({ ...prev, [mentorId]: maxHours }));
        if (shift) {
          setFacultyShifts(prev => ({ ...prev, [mentorId]: shift }));
        }
        return { success: true };
      }
      return { success: false, message: data.message || "Failed to save config" };
    } catch (e: any) {
      return { success: false, message: e.message };
    }
  };

  const submitSignupRequest = async (reqData: any) => {
    try {
      const res = await fetch("/api/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(reqData)
      });
      const data = await res.json();
      if (data.success) {
        return { success: true, message: data.message };
      }
      return { success: false, message: data.message || "Failed to submit signup request" };
    } catch (e: any) {
      return { success: false, message: e.message };
    }
  };

  const approveSignupRequest = async (id: string, mappingData: any) => {
    try {
      const res = await fetch("/api/admin/signup-requests", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action: "approve", ...mappingData })
      });
      const data = await res.json();
      if (data.success) {
        setSignupRequests(prev => prev.map(r => r.id === id ? { ...r, status: "approved" } : r));
        return { success: true, message: data.message };
      }
      return { success: false, message: data.message || "Failed to approve request" };
    } catch (e: any) {
      return { success: false, message: e.message };
    }
  };

  const rejectSignupRequest = async (id: string) => {
    try {
      const res = await fetch("/api/admin/signup-requests", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action: "reject" })
      });
      const data = await res.json();
      if (data.success) {
        setSignupRequests(prev => prev.map(r => r.id === id ? { ...r, status: "rejected" } : r));
        return { success: true, message: data.message };
      }
      return { success: false, message: data.message || "Failed to reject request" };
    } catch (e: any) {
      return { success: false, message: e.message };
    }
  };

  const deleteSignupRequest = async (id: string) => {
    try {
      const res = await fetch(`/api/admin/signup-requests?id=${encodeURIComponent(id)}`, {
        method: "DELETE"
      });
      const data = await res.json();
      if (data.success) {
        setSignupRequests(prev => prev.filter(r => r.id !== id));
        return { success: true, message: data.message };
      }
      return { success: false, message: data.message || "Failed to delete request" };
    } catch (e: any) {
      return { success: false, message: e.message };
    }
  };

  const saveSmeAvailabilityHandler = async (smeId: string, windows: any[], day?: string) => {
    try {
      const res = await fetch("/api/sme-availability", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ smeId, windows, day })
      });
      const data = await res.json();
      if (data.success) {
        if (data.availability) {
          setSmeAvailability(data.availability);
        }
        return { success: true };
      }
      return { success: false, error: data.error };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  };

  const deleteSmeAvailabilityWindowHandler = async (id: string) => {
    try {
      const res = await fetch(`/api/sme-availability?id=${encodeURIComponent(id)}`, {
        method: "DELETE"
      });
      const data = await res.json();
      if (data.success) {
        setSmeAvailability(prev => prev.filter(a => a.id !== id));
        return { success: true };
      }
      return { success: false, error: data.error };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  };

  const resolveApprovalHandler = async (approvalId: string, status: "approved" | "rejected", remarks = "") => {
    try {
      const res = await fetch("/api/approvals", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          approval_id: approvalId,
          status,
          approver_id: currentCAM?.id || currentAdmin?.id || currentUser?.id || "cm_curr",
          approver_name: currentCAM?.name || currentAdmin?.name || currentUser?.name || "Campus Manager",
          remarks,
          rejection_reason: remarks
        })
      });
      const data = await res.json();
      if (data.success) {
        setApprovals(prev => prev.map(a => a.id === approvalId ? { ...a, current_status: status, remarks } : a));
        return { success: true, message: data.message };
      }
      return { success: false, message: data.message || "Failed to resolve approval" };
    } catch (err: any) {
      return { success: false, message: err.message || "Network error" };
    }
  };

  const contextValue = useMemo(() => ({
    mentors,
    slots,
    requests,
    approvedHandovers,
    auditLogs,
    subjectsList,
    colleges,
    smes,
    demoSessions,
    demoRules,
    demoSwapRequests,
    currentRole,
    currentMentor,
    currentHR,
    currentCAM,
    currentKAM,
    currentAdmin,
    currentSME,
    timeSlots: customShiftTimeSlots[currentShift] || [],
    daysOfWeek: DAYS_OF_WEEK,
    weekDates,
    weekOffset,
    setWeekOffset,
    isLoading,
    currentIdentityError,
    isDataLoading,
    dataLoadError,
    dataLoadMessage,
    cappedSections,
    retryDataLoad,
    currentShift,
    setCurrentShift,
    shiftTimeSlots: customShiftTimeSlots,
    getTimeSlots,
    setRole,
    logout,
    assignSlot,
    deleteSlot,
    updateSlot,
    requestHandover,
    requestSwapCompensate,
    requestBooking,
    handleRequest,
    cancelRequest,
    setRequests,
    importCSV,
    clearAllData,
    createMentor,
    bulkImportMentors,
    updateMentor,
    deleteMentor,
    bookDemoSession,
    evaluateDemoSession,
    correctStudentAttendance,
    bulkBookDemoSessions,
    updateDemoSession,
    swapDemoSessions,
    deleteDemoSession,
    rescheduleDemoSession,
    setDemoSessions,
    requestDemoSwap,
    resolveDemoSwap,
    // L&D Aliases (Phase 2 bridge)
    lndSessions: demoSessions,
    lndRules: demoRules,
    lndSwapRequests: demoSwapRequests,
    bookLndSession: bookDemoSession,
    bulkBookLndSessions: bulkBookDemoSessions,
    evaluateLndSession: evaluateDemoSession,
    deleteLndSession: deleteDemoSession,
    createLndRule: createDemoRule,
    deleteLndRule: deleteDemoRule,
    generateTimetable,
    clearTimetable,
    createSubject,
    updateSubject,
    deleteSubject,
    createCollege,
    updateCollege,
    deleteCollege,
    createKAM,
    updateKAM,
    deleteKAM,
    createCAM,
    updateCAM,
    deleteCAM,
    departmentsList,
    coursesList,
    createDepartment,
    createCourse,
    updateDepartment,
    updateCourse,
    deleteDepartment,
    deleteCourse,
    refreshData,
    notifyDataChanged: broadcastDataChanged,
    refreshAttendance,
    students,
    updateStudent,
    deleteStudent,
    bulkDeleteStudents,
    studentAttendance,
    setStudentAttendance,
    currentStudent,
    markAttendance,
    leaveRequests,
    facultyLeaves,
    holidays,
    weeklyTasks,
    studentTracker,
    academicTracker,
    saveAcademicTrackerEntry,
    deleteAcademicTrackerEntry,
    interviews,
    interviewEvaluations,
    approvals,
    leaveBalances,
    resolveApproval: resolveApprovalHandler,
    addInterview,
    deleteInterview,
    assignWeeklyTask,
    gradeStudentTask,
    deleteWeeklyTask,
    weeklyAcademicTasks,
    studentAcademicTracker,
    assignWeeklyAcademicTask,
    gradeStudentAcademicTask,
    bulkUploadAcademicMarks,
    deleteWeeklyAcademicTask,
    subjectGroups,
    createSubjectGroup,
    updateSubjectGroup,
    deleteSubjectGroup,
    updateSmeSubjectGroup,
    createSmeUser,
    updateSmeUser,
    deleteSmeUser,
    createDemoRule,
    deleteDemoRule,
    smeAvailability,
    saveSmeAvailability: saveSmeAvailabilityHandler,
    deleteSmeAvailabilityWindow: deleteSmeAvailabilityWindowHandler,
    kamTasks,
    campusIssues,
    academicYears,
    academicEvents,
    facultyWorkloadLimits,
    facultyShifts,
    saveKamTask,
    deleteKamTask,
    saveCampusIssue,
    updateCampusIssueStatus,
    deleteCampusIssue,
    saveAcademicYear,
    deleteAcademicYear,
    saveAcademicEvent,
    deleteAcademicEvent,
    saveFacultyConfig,
    signupRequests,
    submitSignupRequest,
    approveSignupRequest,
    rejectSignupRequest,
    deleteSignupRequest,
    systemSettings,
    attendanceLockEnabled,
    setSystemSettings,
    loadRoleWorkspace,
    currentUser,
    isAuthenticated,
    isSuperAdmin,
    currentCampusScope,
    setCampusScope,
    lastSyncTime
  }), [
    mentors,
    slots,
    requests,
    approvedHandovers,
    auditLogs,
    subjectsList,
    colleges,
    smes,
    demoSessions,
    demoRules,
    demoSwapRequests,
    currentRole,
    currentMentor,
    currentHR,
    currentCAM,
    currentKAM,
    currentAdmin,
    currentSME,
    customShiftTimeSlots,
    currentShift,
    weekDates,
    weekOffset,
    isLoading,
    currentIdentityError,
    isDataLoading,
    dataLoadError,
    dataLoadMessage,
    cappedSections,
    retryDataLoad,
    departmentsList,
    coursesList,
    students,
    studentAttendance,
    currentStudent,
    leaveRequests,
    facultyLeaves,
    holidays,
    weeklyTasks,
    studentTracker,
    academicTracker,
    interviews,
    interviewEvaluations,
    approvals,
    leaveBalances,
    weeklyAcademicTasks,
    studentAcademicTracker,
    subjectGroups,
    smeAvailability,
    kamTasks,
    campusIssues,
    academicYears,
    academicEvents,
    facultyWorkloadLimits,
    facultyShifts,
    signupRequests,
    systemSettings,
    attendanceLockEnabled,
    loadRoleWorkspace,
    currentUser,
    isAuthenticated,
    isSuperAdmin,
    currentCampusScope,
    setCampusScope,
    lastSyncTime,
    logout
  ]);

  return (
    <AppContext.Provider value={contextValue}>
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error("useApp must be used within an AppProvider");
  }
  return context;
};

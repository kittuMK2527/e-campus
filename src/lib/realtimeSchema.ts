/**
 * Production-Grade Strict Real-Time Schema & Event Registry
 *
 * Defines strictly typed domains, actions, payload contracts,
 * TanStack Query key invalidation mapping, and delivery-time authorization filters.
 */

import { Role } from "./authGuard";

export type RealtimeDomain =
  | "interviews"
  | "attendance"
  | "daily_configs"
  | "slots"
  | "requests"
  | "demos"
  | "fees"
  | "exams"
  | "weekly_plan"
  | "materials"
  | "students"
  | "mentors"
  | "institutions"
  | "users"
  | "feedback"
  | "audit"
  | "announcements"
  | "notifications"
  | "system"
  | "tracker";

export type InterviewAction =
  | "assigned"
  | "capacity_requested"
  | "capacity_accepted"
  | "evaluated"
  | "confirmed"
  | "cohort_split"
  | "deleted";

export type AttendanceAction =
  | "period_marked"
  | "bulk_imported"
  | "locked"
  | "unlocked"
  | "mentor_punch"
  | "cm_punch";

export type DailyConfigAction =
  | "updated"
  | "holiday_marked"
  | "holiday_deleted";

export type SlotAction =
  | "updated"
  | "bulk_imported"
  | "deleted";

export type RequestAction =
  | "leave_submitted"
  | "swap_submitted"
  | "resolved"
  | "marks_edit_resolved"
  | "demo_swap_resolved"
  | "faculty_leave_submitted"
  | "cm_leave_submitted";

export type DemoAction =
  | "allocated"
  | "reallocated"
  | "rules_updated"
  | "criteria_updated"
  | "availability_updated";

export type FeeAction =
  | "payment_recorded"
  | "bulk_updated";

export type ExamAction =
  | "scheduled"
  | "marks_submitted"
  | "marks_verified";

export type WeeklyPlanAction =
  | "submitted"
  | "verified";

export type MaterialAction =
  | "uploaded"
  | "deleted";

export type StudentAction =
  | "record_changed"
  | "profile_updated"
  | "achievement_added"
  | "coding_stats_sync"
  | "hirescore_synced";

export type MentorAction =
  | "record_changed"
  | "bulk_imported";

export type InstitutionAction =
  | "college_updated"
  | "course_updated"
  | "subject_updated"
  | "subj_grp_updated"
  | "class_teacher_updated"
  | "draft_saved";

export type UserAction =
  | "credential_updated"
  | "signup_resolved";

export type FeedbackAction =
  | "student_nps_saved"
  | "app_feedback_saved";

export type AuditAction =
  | "observation_saved"
  | "audit_submitted"
  | "nps_recorded";

export type AnnouncementAction =
  | "posted"
  | "deleted";

export type NotificationAction =
  | "created"
  | "marked_read"
  | "all_marked_read";

export type SystemAction =
  | "settings_changed"
  | "issue_reported"
  | "ticket_created"
  | "task_updated"
  | "deauth";

export type TrackerAction =
  | "academic_updated"
  | "student_updated"
  | "skills_updated";

export type RealtimeAction =
  | InterviewAction
  | AttendanceAction
  | DailyConfigAction
  | SlotAction
  | RequestAction
  | DemoAction
  | FeeAction
  | ExamAction
  | WeeklyPlanAction
  | MaterialAction
  | StudentAction
  | MentorAction
  | InstitutionAction
  | UserAction
  | FeedbackAction
  | AuditAction
  | AnnouncementAction
  | NotificationAction
  | SystemAction
  | TrackerAction;

export interface RealtimeEnvelope<T = any> {
  id: string | number;
  eventId: string;
  domain: RealtimeDomain;
  action: RealtimeAction;
  collegeId?: string | null;
  targetUserIds?: string[] | null;
  targetRoles?: Role[] | null;
  originTabId?: string | null;
  payload: T;
  timestamp: number;
}

/**
 * Maps a domain and action to the specific TanStack query key roots that must be invalidated.
 */
export function getQueryRootsForEvent(domain: RealtimeDomain, action?: string): string[] {
  switch (domain) {
    case "interviews":
      return ["interviews", "student-interviews"];
    case "attendance":
      return ["attendance", "daily-configs", "mentor-attendance", "cm-attendance"];
    case "daily_configs":
      return ["daily-configs"];
    case "slots":
      return ["slots", "daily-configs", "weekly-plan"];
    case "requests":
      return ["requests", "faculty-leave", "cm-leave", "incoming-covers", "weekly-plan"];
    case "demos":
      return ["demo-reallocations", "demo-sessions", "demo-eval-criteria", "sme-availability"];
    case "fees":
      return ["fees"];
    case "exams":
      return ["exams", "student-exams"];
    case "weekly_plan":
      return ["weekly-plan"];
    case "materials":
      return ["materials", "student-materials"];
    case "students":
      return ["students", "kam", "profile", "achievements", "coding-stats"];
    case "mentors":
      return ["mentors", "kam", "admin-users"];
    case "institutions":
      return ["colleges", "courses", "subjects", "subject-groups", "class-teachers"];
    case "users":
      return ["admin-users", "admin-kams"];
    case "feedback":
      return ["feedback", "student-nps", "admin-feedback"];
    case "audit":
      return ["observations", "campus-audits", "student-nps"];
    case "announcements":
      return ["announcements"];
    case "notifications":
      return ["notifications"];
    case "system":
      return ["system-settings", "issues", "tickets", "tasks"];
    case "tracker":
      return ["skill-tracker", "academic-tracker", "student-tracker"];
    default:
      return [domain];
  }
}

/**
 * Checks whether an incoming SSE event is authorized for delivery to a specific client session.
 */
export function isEventAuthorizedForClient(
  event: RealtimeEnvelope,
  client: { userId?: string; role?: Role; collegeId?: string; kamCollegeIds?: string[] }
): boolean {
  // 1. Strict Target User IDs filter (takes precedence for PII / sensitive feeds)
  if (event.targetUserIds && event.targetUserIds.length > 0) {
    if (!client.userId || !event.targetUserIds.includes(client.userId)) {
      return false;
    }
  }

  // 2. Target Roles filter
  if (event.targetRoles && event.targetRoles.length > 0) {
    if (!client.role || !event.targetRoles.includes(client.role)) {
      return false;
    }
  }

  // 3. College / Tenant Isolation
  if (event.collegeId && event.collegeId !== "all") {
    // Admin receives all campus events
    if (client.role === "admin") {
      return true;
    }
    // KAM receives events for their assigned portfolio
    if (client.role === "kam") {
      if (client.kamCollegeIds && client.kamCollegeIds.includes(event.collegeId)) {
        return true;
      }
      return false;
    }
    // Campus-specific users must match exactly
    if (!client.collegeId || client.collegeId.toLowerCase() !== event.collegeId.toLowerCase()) {
      return false;
    }
  }

  return true;
}


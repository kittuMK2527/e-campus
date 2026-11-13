export type AdminTab =
  | "overview"
  | "campuses"
  | "kams"
  | "cams"
  | "mentors"
  | "subjects"
  | "schedules"
  | "monitoring"
  | "oversight"
  | "hierarchy"
  | "logs"
  | "feedback"
  | "courses"
  | "announcements"
  | "holidays"
  | "sessions"
  | "users"
  | "smes"
  | "settings"
  | "interviews"
  | "students"
  | "fees"
  | "examinations"
  | "mentor_tasks"
  | "report_insight"
  | "report_skills"
  | "report_mentor_nps"
  | "report_student_nps"
  | "report_client_nps"
  | "more_menu";

export interface AdminDashboardProps {
  activeTab?: AdminTab;
  onTabChange?: (tab: AdminTab) => void;
}

export interface CAMUserFromDB {
  id: string;
  name: string;
  email: string;
  college_id: string;
  college_name: string;
  kam_id: string;
}

export interface KAMUserFromDB {
  id: string;
  name: string;
  email: string;
  title: string;
}

export interface CampusFormState {
  id: string;
  name: string;
  address: string;
  kam_id: string;
  has_shifts: number;
  shift_configs?: string;
  rooms: string;
  code: string;
  academic_year: string;
  manager: string;
  working_days?: number;
}

export interface WizardCourseFormState {
  name: string;
  years: number;
  sections: Record<number, number>;
  sectionRooms: Record<string, string>;
  default_shift: string;
  start_date: string;
  end_date: string;
  start_year: string;
  end_year: string;
  description: string;
}

export interface AnnouncementFormState {
  title: string;
  description: string;
  target_role: string;
  college_id: string;
}

export interface HolidayFormState {
  title: string;
  date: string;
  type: string;
  college_id: string;
}

export interface SystemSettingsState {
  mailing_enabled: boolean;
  attendance_lock_enabled: boolean;
  [key: string]: any;
}

export type InsightSubTab =
  | "attendance"
  | "placement"
  | "observations"
  | "mentor_nps"
  | "client_nps"
  | "tickets"
  | "demos"
  | "workload"
  | "syllabus"
  | "achievements"
  | "skill_report";

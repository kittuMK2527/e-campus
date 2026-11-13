import {
  Award,
  BookOpen,
  Building2,
  Calendar,
  CalendarCheck2,
  CalendarRange,
  Clock,
  FileText,
  GraduationCap,
  IndianRupee,
  Layers,
  Settings,
  ShieldCheck,
  UserCheck,
  Users,
  type LucideIcon,
} from "lucide-react";

export interface KamSubTab {
  id: string;
  label: string;
  hint?: string;
  icon?: LucideIcon;
}

export interface KamPillar {
  id: string;
  label: string;
  icon: LucideIcon;
  hint: string;
  defaultTab: string;
  subTabs?: KamSubTab[];
}

/**
 * Minimal, executive 7-pillar navigation model dedicated to Key Account Managers (KAM).
 * Completely decoupled from Campus Manager (CM) operational workflows.
 */
export const KAM_PILLARS: KamPillar[] = [
  {
    id: "overview",
    label: "Executive Dashboard",
    icon: Building2,
    hint: "Multi-campus health, SLA targets & live telemetry",
    defaultTab: "overview",
  },
  {
    id: "academics",
    label: "Academic Delivery & Marks",
    icon: BookOpen,
    hint: "Curriculum pacing, CIA assessments & exam results",
    defaultTab: "academic_tracker",
    subTabs: [
      { id: "academic_tracker", label: "Syllabus Delivery Pace", hint: "Curriculum logs & delivery pace", icon: BookOpen },
      { id: "exams_and_marks", label: "CIA & Exam Marks Studio", hint: "Exam schedules, pass % and marks ledger", icon: Award },
      { id: "config", label: "Academic Configuration", hint: "Active day orders, periods & shifts", icon: Settings },
      { id: "curriculum", label: "Batch & Section Structure", hint: "Cohort distribution & curriculum syllabus", icon: Layers },
    ],
  },
  {
    id: "faculty",
    label: "Faculty Staffing",
    icon: Users,
    hint: "Mentor allocations, workload & weekly lesson plans",
    defaultTab: "faculty",
    subTabs: [
      { id: "faculty", label: "Mentor Subject Allocation", hint: "Workload distribution & mentor matrix", icon: Users },
      { id: "faculty_weekly_plan", label: "Weekly Lesson Plans", hint: "Faculty syllabus delivery plans", icon: CalendarRange },
      { id: "handovers", label: "Swap & Leave Approvals", hint: "Approvals queue for swaps and leaves", icon: CalendarCheck2 },
      { id: "mentor_attendance", label: "Faculty Attendance Logs", hint: "Punch-in/out logs & punctuality telemetry", icon: Clock },
      { id: "demo_schedule", label: "L&D Demo Evaluations", hint: "Demo evaluations & rubric scores", icon: Award },
    ],
  },
  {
    id: "schedules",
    label: "Timetables & Attendance",
    icon: Calendar,
    hint: "Live campus schedules, slot matrix & attendance logs",
    defaultTab: "timetable",
    subTabs: [
      { id: "timetable", label: "Master Timetable Matrix", hint: "Room & slot allocations across cohorts", icon: Calendar },
      { id: "monitoring", label: "Attendance Monitoring", hint: "Real-time student attendance tracking", icon: Clock },
      { id: "interviews", label: "Placement Mock Interviews", hint: "Mock interview schedule & evaluator feedback", icon: Award },
    ],
  },
  {
    id: "students",
    label: "Students Registry",
    icon: GraduationCap,
    hint: "Comprehensive student roster, attendance, exam marks & fee ledger",
    defaultTab: "students",
    subTabs: [
      { id: "students", label: "Students Registry Table", hint: "Pure table alone with inline row inspection", icon: GraduationCap },
      { id: "tracker", label: "Skill Development Tracker", hint: "Weekly coding problems telemetry", icon: GraduationCap },
      { id: "profile_edits", label: "Profile Verification Queue", hint: "Student profile update requests", icon: UserCheck },
    ],
  },
  {
    id: "fees",
    label: "Fee Realization",
    icon: IndianRupee,
    hint: "Contract milestone realization & outstanding dues",
    defaultTab: "fees",
  },
  {
    id: "audit",
    label: "Campus E-Audit & Insights",
    icon: ShieldCheck,
    hint: "Institutional compliance, NPS, tickets & comparative analytics",
    defaultTab: "audit",
    subTabs: [
      { id: "audit", label: "Campus E-Audit & NPS", hint: "Compliance grading, tickets & client feedback", icon: ShieldCheck },
      { id: "reports", label: "Comparative Analytics", hint: "Cross-campus performance analytics & exports", icon: FileText },
      { id: "events", label: "Campus Events & Milestones", hint: "Hackathons, placement drives & academic calendar", icon: Calendar },
    ],
  },
];

export interface KamNavItem {
  id: string;
  label: string;
  icon: LucideIcon;
  hint: string;
}

export const KAM_NAV_ITEMS: KamNavItem[] = KAM_PILLARS.map(p => ({
  id: p.id,
  label: p.label,
  icon: p.icon,
  hint: p.hint,
}));

/**
 * Resolves any tab ID (including child sub-tabs like 'exams_and_marks') to its parent pillar.
 */
export function findKamPillarForTab(tabId: string): KamPillar {
  const normalized = tabId === "students_list" ? "students" : tabId;
  for (const pillar of KAM_PILLARS) {
    if (pillar.id === normalized || pillar.defaultTab === normalized) return pillar;
    if (pillar.subTabs?.some(s => s.id === normalized)) return pillar;
  }
  return KAM_PILLARS[0];
}

/**
 * Resolves the active sub-tab for a pillar.
 */
export function getActiveSubTabForPillar(pillar: KamPillar, currentTab: string): string {
  const normalized = currentTab === "students_list" ? "students" : currentTab;
  if (pillar.subTabs?.some(s => s.id === normalized)) {
    return normalized;
  }
  return pillar.defaultTab;
}

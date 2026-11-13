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
  User,
  UserCheck,
  Users,
  type LucideIcon,
} from "lucide-react";

export interface CmNavItem {
  id: string;
  label: string;
  icon: LucideIcon;
  /** One-line description shown on the mobile "More" grid. */
  hint: string;
}

export interface CmNavGroup {
  id: string;
  title: string;
  icon: LucideIcon;
  items: CmNavItem[];
}

/**
 * One source for the CM/KAM navigation. The desktop sidebar, the phone bottom
 * bar and the "More" grid all read this, which is what stopped them agreeing:
 * the More grid was a hand-typed list and fell seven tabs behind the sidebar.
 */
export function cmNavGroups(isKAMView: boolean): CmNavGroup[] {
  return [
    {
      id: "dashboard",
      title: "Dashboard",
      icon: Building2,
      items: [{ id: "overview", label: "Dashboard", icon: Building2, hint: "Campus health at a glance" }],
    },
    {
      id: "academics",
      title: "Academics",
      icon: BookOpen,
      items: [
        { id: "academic_tracker", label: "Academic Tracker", icon: BookOpen, hint: "Curriculum logs & weekly marks ledger" },
        { id: "exams_and_marks", label: "Exams & Marks", icon: Award, hint: "Exam schedule and result entry" },
        { id: "config", label: "Academic Configuration", icon: Settings, hint: "Departments, subjects & day orders" },
        { id: "curriculum", label: "Batch Creation", icon: Layers, hint: "Syllabus breakdown & metrics" },
      ],
    },
    {
      id: "faculty",
      title: "Faculty",
      icon: Users,
      items: [
        { id: "faculty", label: "Mentor Subject Allocation", icon: Users, hint: "Assign mentors to subjects" },
        { id: "handovers", label: "Class Swap Requests", icon: CalendarCheck2, hint: "Approvals for swaps, leaves & late punches" },
        { id: "faculty_weekly_plan", label: "Weekly Plan", icon: CalendarRange, hint: "Mentor weekly teaching plan" },
        { id: "mentor_skill_tracker", label: "Mentor Skill Dev Tracker", icon: GraduationCap, hint: "Mentor skill submissions" },
        { id: "demo_schedule", label: "Demo Schedule", icon: Award, hint: "Demo sessions and L&D allocation" },
      ],
    },
    {
      id: "schedules",
      title: "Schedules",
      icon: Calendar,
      items: [
        { id: "timetable", label: "Timetable", icon: Calendar, hint: "Slot booking across the campus" },
        { id: "monitoring", label: "Attendance Monitoring", icon: Clock, hint: "Class attendance tracking" },
        { id: "interviews", label: "Interview Allocation", icon: Award, hint: "Placement interview scheduling" },
      ],
    },
    {
      id: "students",
      title: "Students",
      icon: GraduationCap,
      items: [
        { id: "students_list", label: isKAMView ? "Students Registry" : "Students Data", icon: isKAMView ? GraduationCap : Users, hint: isKAMView ? "Comprehensive student roster, attendance, exam marks & fee ledger" : "Enrolled student directory" },
        { id: "tracker", label: "Skill Development Tracker", icon: GraduationCap, hint: "Weekly submissions ledger" },
        { id: "profile_edits", label: "Student Profile Edit Requests", icon: UserCheck, hint: "Review student edit requests" },
      ],
    },
    {
      id: "fees",
      title: "Fee Collection",
      icon: IndianRupee,
      items: [{ id: "fees", label: "Fee Collection", icon: IndianRupee, hint: "Track student fee dues" }],
    },
    {
      id: "reports",
      title: isKAMView ? "Campus Insights" : "Campus Insight",
      icon: FileText,
      items: [
        {
          id: "reports",
          label: isKAMView ? "Campus Insights" : "Campus Insight",
          icon: FileText,
          hint: "Generate export metrics",
        },
      ],
    },
    {
      id: "audit",
      title: "Campus E-Audit",
      icon: ShieldCheck,
      items: [{ id: "audit", label: "Campus E-Audit", icon: ShieldCheck, hint: "Domain audits, peer reviews, ticketing & NPS" }],
    },
    {
      id: "events",
      title: "Events",
      icon: Calendar,
      items: [{ id: "events", label: "Events", icon: Calendar, hint: "Campus events, exams & milestone creation" }],
    },
    {
      id: "profile",
      title: "My Profile",
      icon: User,
      items: [{ id: "profile", label: "My Profile", icon: User, hint: "Faculty lead details" }],
    },
  ];
}

/** The four destinations that stay on the phone bottom bar; "More" is the fifth slot. */
export const CM_PRIMARY_TAB_IDS = ["overview", "timetable", "faculty", "handovers"] as const;

export interface CmMobileTab {
  id: string;
  label: string;
  icon: LucideIcon;
}

const PRIMARY_ICONS: Record<string, LucideIcon> = {
  overview: Building2,
  timetable: Calendar,
  faculty: Users,
  handovers: CalendarCheck2,
};

export function cmMobileTabs(isKAMView: boolean): CmMobileTab[] {
  return CM_PRIMARY_TAB_IDS.map((id) => {
    const leaf = cmLeafById(cmNavGroups(isKAMView), id);
    return { id, label: id === "handovers" ? "Approvals" : (leaf?.label ?? id), icon: PRIMARY_ICONS[id] ?? Settings };
  });
}

/**
 * Everything a phone cannot reach from the bottom bar. Derived rather than
 * typed so a new sidebar leaf is automatically one tap away in the grid.
 */
export function cmMoreTabs(isKAMView: boolean): CmNavItem[] {
  const primaries = new Set<string>(CM_PRIMARY_TAB_IDS);
  return cmNavGroups(isKAMView)
    .flatMap((group) => group.items)
    .filter((item) => !primaries.has(item.id));
}

export function cmMoreTabIds(isKAMView: boolean): string[] {
  return cmMoreTabs(isKAMView).map((item) => item.id);
}

export function cmLeafById(groups: CmNavGroup[], id: string): CmNavItem | undefined {
  return groups.flatMap((group) => group.items).find((item) => item.id === id);
}

import { getRoleHomePath, normalizeRoleValue } from "@/lib/utils";

export type NotificationAction =
  | "external"
  | "details"
  | "schedule"
  | "interviews"
  | "approvals"
  | "exams"
  | "marks"
  | "tasks"
  | "fees"
  | "library"
  | "profile"
  | "fallback";

export interface NotificationTarget {
  url: string;
  isExternal: boolean;
  targetDate: string | null;
  action: NotificationAction;
  actionLabel: string;
}

interface RoleCategoryRoutes {
  approvals: string;
  schedule: string;
  config: string;
  attendance: string;
  weeklyPlan: string;
  interviews: string;
  exams: string;
  marks: string;
  tasks: string;
  fees: string;
  library?: string;
  profile: string;
  dashboard: string;
}

const ROLE_ROUTES: Record<string, RoleCategoryRoutes> = {
  student: {
    approvals: "/student/dashboard",
    schedule: "/student/schedule",
    config: "/student/schedule",
    attendance: "/student/dashboard",
    weeklyPlan: "/student/dashboard",
    interviews: "/student/interviews",
    exams: "/student/exams",
    marks: "/student/exams",
    tasks: "/student/tracker",
    fees: "/student/fees",
    library: "/student/library",
    profile: "/student/profile",
    dashboard: "/student/dashboard"
  },
  mentor: {
    approvals: "/mentor/handovers",
    schedule: "/mentor/timetable",
    config: "/mentor/attendance",
    attendance: "/mentor/attendance",
    weeklyPlan: "/mentor/weekly_plan",
    interviews: "/mentor/interviews",
    exams: "/mentor/exams",
    marks: "/mentor/exams",
    tasks: "/mentor/my_skill_tracker",
    fees: "/mentor/home",
    profile: "/mentor/profile",
    dashboard: "/mentor/home"
  },
  cm: {
    approvals: "/cm/approvals",
    schedule: "/cm/timetable",
    config: "/cm/config",
    attendance: "/cm/monitoring",
    weeklyPlan: "/cm/faculty_weekly_plan",
    interviews: "/cm/interviews",
    exams: "/cm/exams_and_marks",
    marks: "/cm/exams_and_marks",
    tasks: "/cm/tasks",
    fees: "/cm/fees",
    profile: "/cm/profile",
    dashboard: "/cm/overview"
  },
  kam: {
    approvals: "/kam/handovers",
    schedule: "/kam/timetable",
    config: "/kam/config",
    attendance: "/kam/attendance",
    weeklyPlan: "/kam/faculty_weekly_plan",
    interviews: "/kam/interviews",
    exams: "/kam/exams_and_marks",
    marks: "/kam/exams_and_marks",
    tasks: "/kam/tracker",
    fees: "/kam/fees",
    profile: "/kam/profile",
    dashboard: "/kam/overview"
  },
  admin: {
    approvals: "/admin/oversight",
    schedule: "/admin/schedules",
    config: "/admin/schedules",
    attendance: "/admin/schedules",
    weeklyPlan: "/admin/overview",
    interviews: "/admin/interviews",
    exams: "/admin/examinations",
    marks: "/admin/examinations",
    tasks: "/admin/mentor_tasks",
    fees: "/admin/fees",
    profile: "/admin/users",
    dashboard: "/admin/overview"
  },
  sme: {
    approvals: "/sme/weekly_plans",
    schedule: "/sme/availability",
    config: "/sme/overview",
    attendance: "/sme/overview",
    weeklyPlan: "/sme/weekly_plans",
    interviews: "/sme/overview",
    exams: "/sme/eval_criteria",
    marks: "/sme/eval_criteria",
    tasks: "/sme/skill_approvals",
    fees: "/sme/overview",
    profile: "/sme/overview",
    dashboard: "/sme/overview"
  },
  fee_manager: {
    approvals: "/fee-manager/overview",
    schedule: "/fee-manager/overview",
    config: "/fee-manager/overview",
    attendance: "/fee-manager/overview",
    weeklyPlan: "/fee-manager/overview",
    interviews: "/fee-manager/overview",
    exams: "/fee-manager/overview",
    marks: "/fee-manager/overview",
    tasks: "/fee-manager/overview",
    fees: "/fee-manager/transactions",
    profile: "/fee-manager/overview",
    dashboard: "/fee-manager/overview"
  },
  hr: {
    approvals: "/hr",
    schedule: "/hr",
    config: "/hr",
    attendance: "/hr",
    weeklyPlan: "/hr",
    interviews: "/hr",
    exams: "/hr",
    marks: "/hr",
    tasks: "/hr",
    fees: "/hr",
    profile: "/hr",
    dashboard: "/hr"
  },
  "L and D": {
    approvals: "/l-and-d",
    schedule: "/l-and-d",
    config: "/l-and-d",
    attendance: "/l-and-d",
    weeklyPlan: "/l-and-d",
    interviews: "/l-and-d",
    exams: "/l-and-d",
    marks: "/l-and-d",
    tasks: "/l-and-d",
    fees: "/l-and-d",
    profile: "/l-and-d",
    dashboard: "/l-and-d"
  }
};

/**
 * Single source of truth for where a notification should navigate based on user role.
 */
export function resolveNotificationDestination(
  notification: any,
  roleInput?: string | null
): NotificationTarget | null {
  if (!notification) return null;

  const rawLink = notification.link?.trim();
  if (rawLink && (rawLink.startsWith("http://") || rawLink.startsWith("https://"))) {
    return {
      url: rawLink,
      isExternal: true,
      targetDate: null,
      action: "external",
      actionLabel: "Open Link",
    };
  }

  const title = (notification.title || "").toLowerCase();
  const message = (notification.message || "").toLowerCase();
  const fullText = `${title} ${message}`;

  // Extract date if present in notification text or link
  const textWithLink = `${notification.title || ""} ${notification.message || ""} ${rawLink || ""}`;
  const dateMatch = textWithLink.match(/\b(20\d{2}-\d{2}-\d{2})\b/);
  const targetDate = dateMatch ? dateMatch[1] : null;

  const role = normalizeRoleValue(roleInput || "student");
  const roleBase = getRoleHomePath(role);
  const roleRoutes = ROLE_ROUTES[role] || ROLE_ROUTES.student;

  const withDate = (baseUrl: string) => {
    if (!targetDate || baseUrl.includes("date=")) return baseUrl;
    const sep = baseUrl.includes("?") ? "&" : "?";
    return `${baseUrl}${sep}date=${targetDate}`;
  };

  // 1. If a semantic link is stored on the notification, map it to the active user's role-appropriate route
  if (rawLink) {
    const [pathPart, queryPart] = rawLink.split("?");
    const cleanPath = pathPart.toLowerCase();

    // Query suffix to preserve (if any)
    const extraQuery = queryPart ? `?${queryPart}` : "";
    const preserveQuery = (dest: string) => {
      if (!queryPart) return withDate(dest);
      const sep = dest.includes("?") ? "&" : "?";
      return `${dest}${sep}${queryPart}`;
    };

    // Approvals / Handovers / Leaves
    if (
      cleanPath.includes("approval") ||
      cleanPath.includes("handover") ||
      cleanPath.includes("leave") ||
      cleanPath.includes("substitution")
    ) {
      return {
        url: preserveQuery(roleRoutes.approvals),
        isExternal: false,
        targetDate,
        action: "approvals",
        actionLabel: role === "cm" ? "Review Approvals" : role === "mentor" ? "View Handovers" : "View Approvals",
      };
    }

    // Daily configs / Day Order
    if (
      cleanPath.includes("daily-config") ||
      cleanPath.includes("daily_config") ||
      cleanPath.includes("day-order") ||
      cleanPath.includes("day_order")
    ) {
      return {
        url: preserveQuery(roleRoutes.config),
        isExternal: false,
        targetDate,
        action: "schedule",
        actionLabel: role === "cm" ? "Configure Day Order" : "View Timetable",
      };
    }

    // Attendance / Monitoring
    if (cleanPath.includes("attendance") || cleanPath.includes("monitoring")) {
      return {
        url: preserveQuery(roleRoutes.attendance),
        isExternal: false,
        targetDate,
        action: "schedule",
        actionLabel: role === "mentor" ? "Mark Attendance" : "View Attendance",
      };
    }

    // Weekly Plan
    if (cleanPath.includes("weekly_plan") || cleanPath.includes("weekly-plan") || cleanPath.includes("faculty_weekly_plan")) {
      return {
        url: preserveQuery(roleRoutes.weeklyPlan),
        isExternal: false,
        targetDate,
        action: "details",
        actionLabel: "View Weekly Plan",
      };
    }

    // Timetable / Schedule
    if (cleanPath.includes("timetable") || cleanPath.includes("schedule")) {
      return {
        url: preserveQuery(roleRoutes.schedule),
        isExternal: false,
        targetDate,
        action: "schedule",
        actionLabel: role === "student" ? "Open Class Schedule" : "Open Timetable",
      };
    }

    // Interviews
    if (cleanPath.includes("interview")) {
      return {
        url: preserveQuery(roleRoutes.interviews),
        isExternal: false,
        targetDate,
        action: "interviews",
        actionLabel: "View Interviews",
      };
    }

    // Exams
    if (cleanPath.includes("exam") || cleanPath.includes("mark")) {
      return {
        url: preserveQuery(roleRoutes.exams),
        isExternal: false,
        targetDate,
        action: "exams",
        actionLabel: "View Exams",
      };
    }

    // Tasks / Skill tracker
    if (cleanPath.includes("task") || cleanPath.includes("tracker") || cleanPath.includes("skill")) {
      return {
        url: preserveQuery(roleRoutes.tasks),
        isExternal: false,
        targetDate,
        action: "tasks",
        actionLabel: "Open Tasks",
      };
    }

    // Fees
    if (cleanPath.includes("fee")) {
      return {
        url: preserveQuery(roleRoutes.fees),
        isExternal: false,
        targetDate,
        action: "fees",
        actionLabel: "View Fees",
      };
    }

    // If link belongs already to current user's role prefix, sanitize and preserve
    if (cleanPath.startsWith(`/${role}/`)) {
      let sanitized = rawLink
        .replace(/\/mentor\/schedule(\b|\?)/, "/mentor/timetable$1")
        .replace(/\/mentor\/approvals(\b|\?)/, "/mentor/handovers$1")
        .replace(/\/mentor\/weekly-plan(\b|\?)/, "/mentor/weekly_plan$1")
        .replace(/\/mentor\/academic-tracker(\b|\?)/, "/mentor/academic_tracker$1")
        .replace(/\/mentor\/my-skill-tracker(\b|\?)/, "/mentor/my_skill_tracker$1")
        .replace(/\/cm\/schedule(\b|\?)/, "/cm/timetable$1")
        .replace(/\/cm\/daily-configs(\b|\?)/, "/cm/config$1")
        .replace(/\/admin\/schedule(\b|\?)/, "/admin/schedules$1")
        .replace(/\/admin\/exams(\b|\?)/, "/admin/examinations$1")
        .replace(/\/admin\/approvals(\b|\?)/, "/admin/oversight$1");

      return {
        url: sanitized,
        isExternal: false,
        targetDate,
        action: "details",
        actionLabel: "View Details",
      };
    }
  }

  // 2. Keyword matching fallback
  if (
    fullText.includes("leave") ||
    fullText.includes("on-duty") ||
    fullText.includes("on duty") ||
    fullText.includes(" od ") ||
    fullText.includes("handover") ||
    fullText.includes("permission") ||
    fullText.includes("approval") ||
    fullText.includes("substitution") ||
    fullText.includes("late attendance") ||
    fullText.includes("late punch")
  ) {
    return {
      url: withDate(roleRoutes.approvals),
      isExternal: false,
      targetDate,
      action: "approvals",
      actionLabel: role === "cm" ? "Review Approvals" : role === "mentor" ? "View Handovers" : "View Approvals",
    };
  }

  if (
    fullText.includes("day order") ||
    fullText.includes("day type") ||
    fullText.includes("daily config") ||
    fullText.includes("daily-config")
  ) {
    return {
      url: withDate(roleRoutes.config),
      isExternal: false,
      targetDate,
      action: "schedule",
      actionLabel: role === "cm" ? "Configure Day Order" : "View Schedule",
    };
  }

  if (
    fullText.includes("attendance not marked") ||
    fullText.includes("missing attendance") ||
    fullText.includes("mark attendance") ||
    fullText.includes("attendance logs")
  ) {
    return {
      url: withDate(roleRoutes.attendance),
      isExternal: false,
      targetDate,
      action: "schedule",
      actionLabel: role === "mentor" ? "Mark Attendance" : "View Attendance",
    };
  }

  if (
    fullText.includes("weekly plan") ||
    fullText.includes("weekly_plan") ||
    fullText.includes("lesson plan")
  ) {
    return {
      url: withDate(roleRoutes.weeklyPlan),
      isExternal: false,
      targetDate,
      action: "details",
      actionLabel: "View Weekly Plan",
    };
  }

  if (
    fullText.includes("schedule") ||
    fullText.includes("calendar") ||
    fullText.includes("timetable") ||
    fullText.includes("holiday") ||
    fullText.includes("class session") ||
    fullText.includes("campus schedule")
  ) {
    return {
      url: withDate(roleRoutes.schedule),
      isExternal: false,
      targetDate,
      action: "schedule",
      actionLabel: role === "student" ? "Open Class Schedule" : "Open Timetable",
    };
  }

  if (
    fullText.includes("interview") ||
    fullText.includes("mock") ||
    fullText.includes("gmeet") ||
    fullText.includes("evaluat") ||
    fullText.includes("split")
  ) {
    return {
      url: withDate(roleRoutes.interviews),
      isExternal: false,
      targetDate,
      action: "interviews",
      actionLabel: "View Interviews",
    };
  }

  if (
    fullText.includes("exam") ||
    fullText.includes("test") ||
    fullText.includes("assessment") ||
    fullText.includes("cia")
  ) {
    return {
      url: withDate(roleRoutes.exams),
      isExternal: false,
      targetDate,
      action: "exams",
      actionLabel: "View Exams",
    };
  }

  if (
    fullText.includes("mark") ||
    fullText.includes("grade") ||
    fullText.includes("score")
  ) {
    return {
      url: withDate(roleRoutes.marks),
      isExternal: false,
      targetDate,
      action: "marks",
      actionLabel: "View Marks",
    };
  }

  if (
    fullText.includes("task") ||
    fullText.includes("tracker") ||
    fullText.includes("practical") ||
    fullText.includes("submission") ||
    fullText.includes("assignment") ||
    fullText.includes("skill")
  ) {
    return {
      url: withDate(roleRoutes.tasks),
      isExternal: false,
      targetDate,
      action: "tasks",
      actionLabel: role === "mentor" ? "Open My Skill Tracker" : "Open Tracker",
    };
  }

  if (
    fullText.includes("fee") ||
    fullText.includes("due") ||
    fullText.includes("payment") ||
    fullText.includes("tuition") ||
    fullText.includes("invoice")
  ) {
    return {
      url: withDate(roleRoutes.fees),
      isExternal: false,
      targetDate,
      action: "fees",
      actionLabel: "View Fees",
    };
  }

  if (fullText.includes("library") || fullText.includes("book") || fullText.includes("opac")) {
    if (role === "student") {
      return {
        url: withDate("/student/library"),
        isExternal: false,
        targetDate,
        action: "library",
        actionLabel: "Open Library",
      };
    }
  }

  if (
    fullText.includes("profile") ||
    fullText.includes("password") ||
    fullText.includes("account")
  ) {
    return {
      url: withDate(roleRoutes.profile),
      isExternal: false,
      targetDate,
      action: "profile",
      actionLabel: "View Profile",
    };
  }

  // Fallback to role's dashboard/home
  return {
    url: withDate(roleRoutes.dashboard || roleBase),
    isExternal: false,
    targetDate,
    action: "fallback",
    actionLabel: "Open Workspace",
  };
}

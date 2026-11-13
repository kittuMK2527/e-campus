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

/**
 * Single source of truth for where a notification should navigate.
 * The dashboard dropdown and the notifications feed previously carried
 * near-identical copies of this logic, which drifted in copy and matching.
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

  const dateMatch = `${notification.title || ""} ${notification.message || ""}`.match(
    /\b(20\d{2}-\d{2}-\d{2})\b/
  );
  const targetDate = dateMatch ? dateMatch[1] : null;

  const role = roleInput || "student";
  const roleBase = getRoleHomePath(role);

  if (rawLink) {
    let cleanLink = rawLink.startsWith("/") ? rawLink : `${roleBase}/${rawLink}`;
    if (cleanLink.startsWith("/cm") && role === "student") {
      cleanLink = cleanLink.replace(/^\/cm/, "/student");
    } else if (cleanLink.startsWith("/cm") && role === "mentor") {
      cleanLink = cleanLink.replace(/^\/cm/, "/mentor");
    }
    return {
      url: cleanLink,
      isExternal: false,
      targetDate,
      action: "details",
      actionLabel: "View Details",
    };
  }

  const withDate = (url: string) => `${url}${targetDate ? `?date=${targetDate}` : ""}`;

  if (
    fullText.includes("schedule") ||
    fullText.includes("calendar") ||
    fullText.includes("timetable") ||
    fullText.includes("day order") ||
    fullText.includes("holiday") ||
    fullText.includes("class session") ||
    fullText.includes("campus schedule")
  ) {
    if (role === "student") {
      return {
        url: withDate("/student/schedule"),
        isExternal: false,
        targetDate,
        action: "schedule",
        actionLabel: "Open Class Schedule",
      };
    }
    if (role === "mentor") {
      return {
        url: withDate("/mentor/schedule"),
        isExternal: false,
        targetDate,
        action: "schedule",
        actionLabel: "Open Timetable",
      };
    }
    if (role === "cm") {
      return {
        url: withDate("/cm/schedule"),
        isExternal: false,
        targetDate,
        action: "schedule",
        actionLabel: "Open Schedule",
      };
    }
    if (role === "kam") {
      return {
        url: withDate("/kam/attendance"),
        isExternal: false,
        targetDate,
        action: "schedule",
        actionLabel: "Open Attendance",
      };
    }
    if (role === "admin") {
      return {
        url: withDate("/admin/schedule"),
        isExternal: false,
        targetDate,
        action: "schedule",
        actionLabel: "Open Schedule",
      };
    }
  }

  if (
    fullText.includes("interview") ||
    fullText.includes("mock") ||
    fullText.includes("gmeet") ||
    fullText.includes("evaluat") ||
    fullText.includes("split")
  ) {
    if (role === "student") {
      return {
        url: "/student/interviews",
        isExternal: false,
        targetDate,
        action: "interviews",
        actionLabel: "View Interviews",
      };
    }
    if (role === "mentor") {
      return {
        url: "/mentor/interviews",
        isExternal: false,
        targetDate,
        action: "interviews",
        actionLabel: "View Interviews",
      };
    }
    if (role === "cm") {
      return {
        url: "/cm/interviews",
        isExternal: false,
        targetDate,
        action: "interviews",
        actionLabel: "Open Interviews",
      };
    }
    if (role === "kam") {
      return {
        url: "/kam/analytics",
        isExternal: false,
        targetDate,
        action: "interviews",
        actionLabel: "View Analytics",
      };
    }
    if (role === "admin") {
      return {
        url: "/admin/oversight",
        isExternal: false,
        targetDate,
        action: "interviews",
        actionLabel: "View Interviews",
      };
    }
  }

  if (
    fullText.includes("leave") ||
    fullText.includes("on-duty") ||
    fullText.includes("on duty") ||
    fullText.includes(" od ") ||
    fullText.includes("handover") ||
    fullText.includes("permission") ||
    fullText.includes("approval")
  ) {
    if (role === "student") {
      return {
        url: "/student/dashboard",
        isExternal: false,
        targetDate,
        action: "approvals",
        actionLabel: "View Dashboard",
      };
    }
    if (role === "mentor") {
      return {
        url: "/mentor?tab=handovers",
        isExternal: false,
        targetDate,
        action: "approvals",
        actionLabel: "View Handovers",
      };
    }
    if (role === "cm") {
      return {
        url: "/cm/approvals",
        isExternal: false,
        targetDate,
        action: "approvals",
        actionLabel: "Review Approvals",
      };
    }
    if (role === "admin") {
      return {
        url: "/admin/oversight",
        isExternal: false,
        targetDate,
        action: "approvals",
        actionLabel: "View Approvals",
      };
    }
    if (role === "hr") {
      return {
        url: "/hr",
        isExternal: false,
        targetDate,
        action: "approvals",
        actionLabel: "View HR Portal",
      };
    }
  }

  if (
    fullText.includes("exam") ||
    fullText.includes("test") ||
    fullText.includes("assessment") ||
    fullText.includes("cia")
  ) {
    if (role === "student") {
      return {
        url: "/student/exams",
        isExternal: false,
        targetDate,
        action: "exams",
        actionLabel: "View Exams",
      };
    }
    if (role === "mentor") {
      return {
        url: "/mentor/exams",
        isExternal: false,
        targetDate,
        action: "exams",
        actionLabel: "View Exams",
      };
    }
    if (role === "cm") {
      return {
        url: "/cm/exams",
        isExternal: false,
        targetDate,
        action: "exams",
        actionLabel: "View Exams",
      };
    }
    if (role === "admin") {
      return {
        url: "/admin/campuses",
        isExternal: false,
        targetDate,
        action: "exams",
        actionLabel: "View Exams",
      };
    }
  }

  if (
    fullText.includes("mark") ||
    fullText.includes("grade") ||
    fullText.includes("score")
  ) {
    if (role === "student") {
      return {
        url: "/student/exams",
        isExternal: false,
        targetDate,
        action: "marks",
        actionLabel: "View Marks",
      };
    }
    if (role === "mentor") {
      return {
        url: "/mentor/marks",
        isExternal: false,
        targetDate,
        action: "marks",
        actionLabel: "View Marks",
      };
    }
  }

  if (
    fullText.includes("task") ||
    fullText.includes("tracker") ||
    fullText.includes("practical") ||
    fullText.includes("submission") ||
    fullText.includes("assignment")
  ) {
    // Skill task assigned to mentor — route directly to My Skill Tracker tab
    const isSkillTask =
      notification.type === "skill_task" ||
      fullText.includes("skill task") ||
      fullText.includes("skill tracker") ||
      fullText.includes("my skill tracker");

    if (role === "mentor" && isSkillTask) {
      return {
        url: "/mentor?tab=my_skill_tracker",
        isExternal: false,
        targetDate: null,
        action: "tasks",
        actionLabel: "Open My Skill Tracker",
      };
    }
    if (role === "student") {
      return {
        url: "/student/tracker",
        isExternal: false,
        targetDate,
        action: "tasks",
        actionLabel: "Open Tracker",
      };
    }
    if (role === "mentor") {
      return {
        url: "/mentor/submissions",
        isExternal: false,
        targetDate,
        action: "tasks",
        actionLabel: "View Submissions",
      };
    }
  }

  if (
    fullText.includes("fee") ||
    fullText.includes("due") ||
    fullText.includes("payment") ||
    fullText.includes("tuition") ||
    fullText.includes("invoice")
  ) {
    if (role === "student") {
      return {
        url: "/student/fees",
        isExternal: false,
        targetDate,
        action: "fees",
        actionLabel: "View Fees",
      };
    }
    if (role === "fee_manager" || role === "admin") {
      return {
        url: "/fee-manager",
        isExternal: false,
        targetDate,
        action: "fees",
        actionLabel: "Open Fee Manager",
      };
    }
  }

  if (fullText.includes("library") || fullText.includes("book") || fullText.includes("opac")) {
    if (role === "student") {
      return {
        url: "/student/library",
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
    if (role === "student") {
      return {
        url: "/student/profile",
        isExternal: false,
        targetDate,
        action: "profile",
        actionLabel: "View Profile",
      };
    }
    if (role === "mentor") {
      return {
        url: "/mentor/profile",
        isExternal: false,
        targetDate,
        action: "profile",
        actionLabel: "View Profile",
      };
    }
  }

  // Roles without a workspace dashboard route fall back to their portal root.
  const normalizedRole = normalizeRoleValue(role);
  const fallbackUrl =
    normalizedRole === "L and D" || normalizedRole === "fee_manager" ? roleBase : `${roleBase}/dashboard`;

  return {
    url: fallbackUrl,
    isExternal: false,
    targetDate,
    action: "fallback",
    actionLabel: "Open Workspace",
  };
}

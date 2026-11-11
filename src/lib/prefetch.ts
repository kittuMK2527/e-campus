import type { QueryClient } from "@tanstack/react-query";
import { apiFetch } from "./apiFetch";
import { qk } from "./queryKeys";

export interface PrefetchScope {
  collegeId?: string;
  mentorId?: string;
  collegeIds?: string;
}

const PREFETCH_STALE_MS = 60_000;

function warm(queryClient: QueryClient, queryKey: readonly unknown[], queryFn: () => Promise<any>) {
  // prefetchQuery never rejects into React; failures simply leave the cache cold.
  void queryClient.prefetchQuery({ queryKey, queryFn, staleTime: PREFETCH_STALE_MS });
}

const fetchMentorExams = (collegeId: string) => async () => {
  const data = await apiFetch<any>(`/api/exams?college_id=${encodeURIComponent(collegeId)}`);
  return data?.success && Array.isArray(data.exams) ? data.exams : [];
};

const fetchMentorDailyConfigs = (collegeId: string) => async () => {
  const data = await apiFetch<any>(`/api/daily-configs?college_id=${encodeURIComponent(collegeId)}`);
  return data?.success && Array.isArray(data.configs) ? data.configs : [];
};

const fetchMentorCodingStats = (collegeId: string) => async () => {
  const data = await apiFetch<any>(`/api/coding-stats?collegeId=${encodeURIComponent(collegeId)}&batch=true`);
  return data?.success ? data : null;
};

const fetchMentorWeeklyPlans = (collegeId: string, mentorId: string) => async () => {
  // Must match WeeklyPlanStudio's key, which reads the audit-enabled payload.
  const q = `mentorId=${encodeURIComponent(mentorId)}&collegeId=${encodeURIComponent(collegeId)}&includeAudit=true`;
  const data = await apiFetch<any>(`/api/weekly-plan?${q}`);
  return data?.success && Array.isArray(data.plans) ? data.plans : [];
};

const fetchAllWeeklyPlans = async () => {
  const data = await apiFetch<any>(`/api/weekly-plan?includeAudit=true`);
  return data?.success && Array.isArray(data.plans) ? data.plans : [];
};

const fetchFeeDashboard = async () => {
  const data = await apiFetch<any>("/api/fees?role=fee_manager");
  return data?.success ? data : null;
};

const fetchDemoReallocations = async () => {
  const data = await apiFetch<any>("/api/demo-reallocations?status=all");
  return data?.success ? (data.requests || []) : [];
};

const fetchLndDailyConfigs = (collegeIds: string) => async () => {
  const map = new Map<string, any>();
  const ids = collegeIds.split(",").filter(Boolean);
  await Promise.all(
    ids.map(async (cId) => {
      try {
        const data = await apiFetch<any>(`/api/daily-configs?college_id=${encodeURIComponent(cId)}&limit=500`);
        if (data?.success && Array.isArray(data.configs)) {
          data.configs.forEach((c: any) => {
            const dStr = c.dateStr || c.datestr;
            if (!dStr) return;
            const item = {
              ...c,
              college_id: cId,
              dateStr: dStr,
              day_order: c.day_order || c.dayorder || "None",
              day_type: c.day_type || c.daytype || "working"
            };
            map.set(`${cId}_${dStr}`, item);
            if (!map.has(dStr) || item.day_order !== "None") {
              map.set(dStr, item);
            }
          });
        }
      } catch (_) {
        // One unreachable campus must not sink the whole prefetch.
      }
    })
  );
  return map;
};

/** Warm the datasets that a role opens most often, keyed exactly like the tabs read them. */
export function prefetchRoleData(
  queryClient: QueryClient,
  role: string,
  scope: PrefetchScope
) {
  if (role === "mentor" && scope.collegeId) {
    warm(queryClient, qk.exams(scope.collegeId), fetchMentorExams(scope.collegeId));
    warm(queryClient, qk.dailyConfigs(scope.collegeId), fetchMentorDailyConfigs(scope.collegeId));
    warm(queryClient, qk.codingStats(scope.collegeId), fetchMentorCodingStats(scope.collegeId));
    if (scope.mentorId) {
      warm(
        queryClient,
        qk.weeklyPlan(scope.collegeId, scope.mentorId),
        fetchMentorWeeklyPlans(scope.collegeId, scope.mentorId)
      );
    }
    return;
  }

  if (role === "sme") {
    warm(queryClient, qk.weeklyPlan("all", "all"), fetchAllWeeklyPlans);
    return;
  }

  if (role === "L and D") {
    warm(queryClient, qk.demoReallocations("all"), fetchDemoReallocations);
    if (scope.collegeIds) {
      warm(
        queryClient,
        qk.lndDailyConfigs(scope.collegeIds, "all"),
        fetchLndDailyConfigs(scope.collegeIds)
      );
    }
    return;
  }

  if (role === "fee_manager") {
    warm(queryClient, qk.fees("dashboard", "all", "all", ""), fetchFeeDashboard);
    return;
  }

  if (role === "admin") {
    warm(queryClient, qk.adminUsers("all"), async () => {
      const data = await apiFetch<any>("/api/users?limit=5000");
      return (data?.users || []) as any[];
    });
    warm(queryClient, qk.adminKams(), async () => {
      const data = await apiFetch<any>("/api/kam?all=1");
      return (data?.kamUsers || []) as any[];
    });
  }
}

/** Hover warm-up for a sidebar item, before the tab is actually opened. */
export function prefetchRoleTab(
  queryClient: QueryClient,
  role: string,
  tab: string,
  scope: PrefetchScope
) {
  if (role === "mentor" && scope.collegeId) {
    if (tab === "timetable") {
      warm(queryClient, qk.dailyConfigs(scope.collegeId), fetchMentorDailyConfigs(scope.collegeId));
    } else if (tab === "exams") {
      warm(queryClient, qk.exams(scope.collegeId), fetchMentorExams(scope.collegeId));
    } else if (tab === "tracker") {
      warm(queryClient, qk.codingStats(scope.collegeId), fetchMentorCodingStats(scope.collegeId));
    } else if (tab === "weekly_plan" && scope.mentorId) {
      warm(
        queryClient,
        qk.weeklyPlan(scope.collegeId, scope.mentorId),
        fetchMentorWeeklyPlans(scope.collegeId, scope.mentorId)
      );
    }
    return;
  }

  if (role === "sme" && tab === "weekly_plans") {
    warm(queryClient, qk.weeklyPlan("all", "all"), fetchAllWeeklyPlans);
    return;
  }

  if (role === "admin") {
    if (tab === "kams" || tab === "campuses" || tab === "cams" || tab === "hierarchy") {
      warm(queryClient, qk.adminKams(), async () => {
        const data = await apiFetch<any>("/api/kam?all=1");
        return (data?.kamUsers || []) as any[];
      });
      warm(queryClient, qk.adminUsers("all"), async () => {
        const data = await apiFetch<any>("/api/users?limit=5000");
        return (data?.users || []) as any[];
      });
    } else if (tab === "users") {
      warm(queryClient, qk.adminUsers("all"), async () => {
        const data = await apiFetch<any>("/api/users?limit=5000");
        return (data?.users || []) as any[];
      });
    } else if (tab === "sessions") {
      warm(queryClient, qk.loginHistory("all"), async () => {
        const data = await apiFetch<any>("/api/admin/login-history");
        return (data?.loginHistory || []) as any[];
      });
      warm(queryClient, qk.adminUsers("all"), async () => {
        const data = await apiFetch<any>("/api/users?limit=5000");
        return (data?.users || []) as any[];
      });
    } else if (tab === "announcements") {
      warm(queryClient, qk.announcements("all"), async () => {
        const data = await apiFetch<any>("/api/announcements");
        return (data?.announcements || []) as any[];
      });
    } else if (tab === "feedback") {
      warm(queryClient, qk.adminFeedback("all"), async () => {
        const data = await apiFetch<any>("/api/feedback");
        return (data?.feedback || []) as any[];
      });
    } else if (tab === "settings") {
      warm(queryClient, qk.systemSettings(), async () => {
        const data = await apiFetch<any>("/api/settings");
        return data?.settings || null;
      });
    }
  }
}

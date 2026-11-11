"use client";

import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getRoleHomePath, normalizeRoleValue } from "@/lib/utils";
import { resolveNotificationDestination } from "@/lib/notificationTarget";
import { useApp, Role } from "@/context/AppContext";
import { useToast } from "@/context/ToastContext";
import { apiFetch, setClientCsrfToken } from "@/lib/apiFetch";
import { describeCappedSections } from "@/lib/dataLoadStatus";
import { qk } from "@/lib/queryKeys";
import { subscribeToRealtimeSync } from "@/lib/dataSync";
import {
  sendDeviceSystemNotification,
  requestDeviceNotificationPermission,
  getDeviceNotificationStatus,
  registerPushSubscription,
  type DeviceNotificationPermission,
} from "@/lib/deviceNotifications";
import { toast as sonnerToast } from "sonner";
import { UserProfileBar } from "./UserProfileBar";
import { Dialog } from "./ui/dialog";
import { QueryPrefetcher } from "./QueryPrefetcher";
import {
  LogOut,
  ChevronDown,
  ChevronRight,
  ArrowLeft,
  KeyRound,
  Eye,
  EyeOff,
  Lock,
  ShieldCheck,
  X,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  GraduationCap,
  Layers,
  User,
  ClipboardList,
  IndianRupee,
  Award,
  Calendar,
  Check,
  RefreshCw,
  AlertTriangle,
  CalendarCheck2,
  Bell,
  ExternalLink,
  Inbox,
  MessageSquare,
  ArrowUpRight,
  Clock,
  Send,
  Tag
} from "lucide-react";

function playNotificationChime() {
  if (typeof window === "undefined") return;
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    const now = ctx.currentTime;

    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = "sine";
    osc1.frequency.setValueAtTime(659.25, now);
    gain1.gain.setValueAtTime(0.08, now);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.18);

    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = "sine";
    osc2.frequency.setValueAtTime(880, now + 0.12);
    gain2.gain.setValueAtTime(0.1, now + 0.12);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(now + 0.12);
    osc2.stop(now + 0.35);
  } catch (_) {}
}

interface DashboardLayoutProps {
  children: React.ReactNode;
  requiredRole: Role;
}

export function DashboardLayout({ children, requiredRole }: DashboardLayoutProps) {
  const router = useRouter();
  const {
    currentUser,
    isAuthenticated,
    currentRole,
    setRole,
    currentMentor,
    currentHR,
    currentCAM,
    currentKAM,
    currentAdmin,
    currentStudent,
    currentSME,
    colleges,
    isLoading,
    isDataLoading,
    dataLoadError,
    dataLoadMessage,
    cappedSections: rawCappedSections,
    retryDataLoad,
    refreshData,
    refreshRequests,
    refreshAttendance,
    lastSyncTime,
    logout
  } = useApp();
  // ROLE_UI_AUDIT C3: toasts replace the old blocking alert() calls.
  const { toast: showToast } = useToast();

  const [isManualRefreshing, setIsManualRefreshing] = useState(false);

  // Routine operational logs and background telemetry (audit logs, handover requests)
  // are bounded by design to the latest entries; they should not trigger the top alert banner.
  const cappedSections = useMemo(() => {
    const ignored = new Set(["auditlogs", "auditlog", "handoverrequests", "handoverrequest", "approvedhandovers", "approvedhandover"]);
    return (rawCappedSections || []).filter((s) => {
      const normalized = s.toLowerCase().replace(/[^a-z]/g, "");
      return !ignored.has(normalized);
    });
  }, [rawCappedSections]);

  // Dismissing the capped-lists notice lasts until the next load changes the list, so
  // a new shortfall is never hidden behind an old dismissal.
  const [isCappedNoticeDismissed, setIsCappedNoticeDismissed] = useState(false);
  const cappedNoticeKey = cappedSections.join(",");
  useEffect(() => {
    setIsCappedNoticeDismissed(false);
  }, [cappedNoticeKey]);

  const displayCappedSections = cappedSections;

  const handleManualRefresh = async () => {
    if (isManualRefreshing || isDataLoading) return;
    setIsManualRefreshing(true);
    try {
      await refreshData(false);
    } catch (_) {
    } finally {
      setIsManualRefreshing(false);
    }
  };

  const isAuthorized = isAuthenticated && normalizeRoleValue(currentRole) === normalizeRoleValue(requiredRole);
  const isFirstLoginRequired = Boolean(currentUser?.mustChangePassword);
  const canLoadWorkspace = isAuthorized && !isLoading && !isFirstLoginRequired;

  /* ─── Notifications Bell ─── */
  const queryClient = useQueryClient();
  const [showNotifications, setShowNotifications] = useState(false);
  const [activeNotificationId, setActiveNotificationId] = useState<string | null>(null);
  const notificationsDropRef = useRef<HTMLDivElement | null>(null);
  const [bellShake, setBellShake] = useState(false);

  const resolveCurrentUserId = () => {
    return currentUser?.reference_id || currentUser?.id || currentMentor?.id || currentCAM?.id || currentKAM?.id || currentAdmin?.id || currentStudent?.id || currentSME?.id || null;
  };

  const notificationsUserId = resolveCurrentUserId();

  const effectiveCollegeId =
    currentCAM?.college_id ||
    currentMentor?.college_id ||
    currentStudent?.college_id ||
    currentUser?.college_id ||
    undefined;

  const [devicePermission, setDevicePermission] = useState<DeviceNotificationPermission>("unsupported");
  const [showPromptBanner, setShowPromptBanner] = useState(false);
  const [isActivatingPush, setIsActivatingPush] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const status = getDeviceNotificationStatus();
    setDevicePermission(status);

    if (status === "granted") {
      registerPushSubscription({
        userId: notificationsUserId || undefined,
        role: currentRole || undefined,
        collegeId: effectiveCollegeId,
      }).catch(() => {});
    } else {
      const dismissedUntil = localStorage.getItem("fp_notif_prompt_dismissed_until");
      const isDismissed = dismissedUntil && Number(dismissedUntil) > Date.now();
      if (status === "default" && !isDismissed && canLoadWorkspace) {
        const timer = setTimeout(() => setShowPromptBanner(true), 1200);
        return () => clearTimeout(timer);
      }
    }
  }, [canLoadWorkspace, notificationsUserId, currentRole, effectiveCollegeId]);

  const handleEnableNotifications = async () => {
    setIsActivatingPush(true);
    try {
      const res = await requestDeviceNotificationPermission();
      setDevicePermission(res.permission);
      if (res.permission === "granted") {
        setShowPromptBanner(false);
        await registerPushSubscription({
          userId: notificationsUserId || undefined,
          role: currentRole || undefined,
          collegeId: effectiveCollegeId,
        });

        await sendDeviceSystemNotification({
          title: "🎉 Notifications Active!",
          message: "You will now receive instant alerts from FACE Prep E-Campus on this device.",
          link: "/schedule",
          tag: "fp_welcome_device_push",
        });

        showToast("Desktop & mobile notifications enabled!", "success");
      } else if (res.instructions) {
        showToast(res.instructions, res.permission === "denied" ? "error" : "info");
      } else if (res.permission === "denied") {
        showToast("Notification permission was denied in your browser settings.", "error");
      }
    } finally {
      setIsActivatingPush(false);
    }
  };

  const handleDismissPrompt = () => {
    setShowPromptBanner(false);
    if (typeof window !== "undefined") {
      localStorage.setItem("fp_notif_prompt_dismissed_until", String(Date.now() + 24 * 60 * 60 * 1000));
    }
  };

  const handleSendTestNotification = async () => {
    const success = await sendDeviceSystemNotification({
      title: "🔔 FACE Prep Website Alert Test",
      message: `Website notifications are active on this device at ${new Date().toLocaleTimeString()}!`,
      link: "/notifications",
      tag: `test_push_${Date.now()}`,
    });
    if (success) {
      showToast("Test notification sent to your device tray!", "success");
    } else {
      showToast("Could not trigger system notification. Check browser permissions or access via HTTPS on mobile.", "error");
    }
  };

  const notificationsQueryKey = qk.notifications(notificationsUserId || "anonymous");
  const notificationsQuery = useQuery({
    queryKey: notificationsQueryKey,
    enabled: canLoadWorkspace && !!notificationsUserId,
    queryFn: async () => {
      const data = await apiFetch(`/api/notifications?user_id=${encodeURIComponent(notificationsUserId!)}&limit=25`);
      return data?.success && Array.isArray(data.notifications) ? (data.notifications as any[]) : [];
    },
    // Poll faster while something is unread; TanStack pauses this when the tab is hidden.
    refetchInterval: (query) => {
      const rows = query.state.data as any[] | undefined;
      return rows?.some((n) => !n.is_read) ? 15_000 : 30_000;
    },
  });
  const notifications = notificationsQuery.data || [];
  const notificationsLoading = notificationsQuery.isFetching;

  /* ─── Global Feedback Modal State & Reporter Resolution ─── */
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [feedbackModalTab, setFeedbackModalTab] = useState<"submit" | "history">("submit");
  const [isSubmittingFeedback, setIsSubmittingFeedback] = useState(false);

  useEffect(() => {
    const handleOpenFeedback = () => {
      setShowFeedbackModal(true);
      setFeedbackModalTab("submit");
    };
    window.addEventListener("open-feedback-modal", handleOpenFeedback);
    return () => window.removeEventListener("open-feedback-modal", handleOpenFeedback);
  }, []);

  const getReporterDetails = () => {
    let name = currentUser?.name || "";
    let email = currentUser?.email || "";
    let collegeId = currentUser?.college_id || "";
    let collegeName = "";
    let department = "";
    let registerNumber = "";
    let contactInfo = "";

    if (currentRole === "student" && currentStudent) {
      name = currentStudent.name || name;
      email = currentStudent.email || email;
      collegeId = currentStudent.college_id || collegeId;
      department = currentStudent.department || "";
      registerNumber = currentStudent.register_number || (currentStudent as any).roll_number || "";
      contactInfo = (currentStudent as any).contact_number || (currentStudent as any).phone || "";
    } else if (currentRole === "mentor" && currentMentor) {
      name = currentMentor.name || name;
      email = currentMentor.email || email;
      collegeId = currentMentor.college_id || collegeId;
      department = currentMentor.department || "";
      registerNumber = (currentMentor as any).employee_id || currentMentor.id || "";
      contactInfo = (currentMentor as any).phone || "";
    } else if (currentRole === "cm" && currentCAM) {
      name = currentCAM.name || name;
      email = currentCAM.email || email;
      collegeId = currentCAM.college_id || collegeId;
    } else if (currentRole === "admin" && currentAdmin) {
      name = currentAdmin.name || name;
      email = currentAdmin.email || email;
    } else if (currentRole === "hr" && currentHR) {
      name = currentHR.name || name;
      email = currentHR.email || email;
    } else if (currentRole === "kam" && currentKAM) {
      name = currentKAM.name || name;
      email = currentKAM.email || email;
      collegeId = (currentKAM as any).college_id || collegeId;
    } else if (currentRole === "sme" && currentSME) {
      name = currentSME.name || name;
      email = currentSME.email || email;
    }

    if (collegeId && colleges?.length) {
      const c = colleges.find((col: any) => col.id === collegeId);
      if (c) collegeName = c.name;
    }

    return {
      userId: email || resolveCurrentUserId() || "anonymous",
      userName: name,
      userRole: currentRole || "user",
      collegeId,
      collegeName,
      department,
      registerNumber,
      contactInfo
    };
  };

  const feedbackReporterId = getReporterDetails().userId;
  const myFeedbackQuery = useQuery({
    queryKey: qk.myFeedback(feedbackReporterId),
    enabled: canLoadWorkspace && showFeedbackModal && feedbackModalTab === "history",
    queryFn: async () => {
      const data = await apiFetch(`/api/feedback?userId=${encodeURIComponent(feedbackReporterId)}`);
      return data?.success && Array.isArray(data.reports) ? (data.reports as any[]) : [];
    },
  });
  const myFeedbackList = myFeedbackQuery.data || [];
  const myFeedbackLoading = myFeedbackQuery.isFetching;

  const unreadCount = notifications.filter((n) => !n.is_read).length;
  const hasUnread = unreadCount > 0;

  // Shake the bell only when unread state flips from read to unread.
  const prevHasUnreadRef = useRef<boolean | null>(null);
  useEffect(() => {
    if (notificationsQuery.data === undefined) return;
    if (prevHasUnreadRef.current === false && hasUnread) {
      setBellShake(true);
      const timer = setTimeout(() => setBellShake(false), 600);
      prevHasUnreadRef.current = hasUnread;
      return () => clearTimeout(timer);
    }
    prevHasUnreadRef.current = hasUnread;
  }, [hasUnread, notificationsQuery.data]);

  const resolveNotificationTarget = (n: any) =>
    resolveNotificationDestination(n, currentRole);

  const handleNotificationClick = (n: any) => {
    if (!n) return;
    const target = resolveNotificationTarget(n);

    // Mark as read immediately
    if (!n.is_read) {
      markNotifRead(n.id);
    }
    setShowNotifications(false);

    if (!target) return;

    if (target.isExternal) {
      if (typeof window !== "undefined") {
        window.open(target.url, "_blank", "noopener,noreferrer");
      }
      return;
    }

    if (typeof window !== "undefined") {
      // Store intent so client tabbed components can immediately consume on navigation
      try {
        sessionStorage.setItem("fp_notif_target", JSON.stringify({
          url: target.url,
          date: target.targetDate,
          title: n.title,
          message: n.message,
          timestamp: Date.now()
        }));
      } catch (_) {}

      // Dispatch global window event for instant responsive tab changes
      window.dispatchEvent(new CustomEvent("fp_navigate_target", {
        detail: {
          url: target.url,
          date: target.targetDate,
          title: n.title,
          message: n.message
        }
      }));

      router.push(target.url);
    }
  };

  const markNotifRead = async (id: string, navigateTo?: string | null) => {
    setActiveNotificationId(id);
    apiFetch(`/api/notifications`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: { notification_id: id, action: "mark_read" },
    })
      .then((d) => {
        if (d?.success) {
          queryClient.setQueryData(notificationsQueryKey, (prev: any[] | undefined) =>
            (prev || []).map((n) => (n.id === id ? { ...n, is_read: 1 } : n))
          );
        }
        if (navigateTo && typeof window !== "undefined") {
          if (navigateTo.startsWith("http")) {
            window.open(navigateTo, "_blank", "noopener");
          } else {
            router.push(navigateTo);
          }
        }
      })
      .catch(() => {})
      .finally(() => setActiveNotificationId(null));
  };

  const clearAllNotifs = () => {
    const uid = resolveCurrentUserId();
    if (!uid) return;
    apiFetch(`/api/notifications`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: { user_id: uid, action: "mark_all_read" },
    })
      .then((d) => {
        if (d?.success) {
          queryClient.setQueryData(notificationsQueryKey, (prev: any[] | undefined) =>
            (prev || []).map((n) => ({ ...n, is_read: 1 }))
          );
        }
      })
      .catch(() => {});
  };

  /* Notifications poll through React Query (refetchInterval above); opening the
     dropdown just asks for a fresh snapshot. */
  useEffect(() => {
    if (canLoadWorkspace && showNotifications) notificationsQuery.refetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canLoadWorkspace, showNotifications]);

  /* Close dropdowns when clicking outside */
  useEffect(() => {
    const onClickOut = (e: MouseEvent) => {
      const el = e.target as HTMLElement;
      if (notificationsDropRef.current && !notificationsDropRef.current.contains(el)) {
        setShowNotifications(false);
      }
    };
    document.addEventListener("mousedown", onClickOut);
    return () => document.removeEventListener("mousedown", onClickOut);
  }, []);

  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const passwordSuccessTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const passwordOperation = useRef(0);
  useEffect(() => () => {
    passwordOperation.current += 1;
    if (passwordSuccessTimer.current) clearTimeout(passwordSuccessTimer.current);
  }, [currentUser]);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrentPass, setShowCurrentPass] = useState(false);
  const [showNewPass, setShowNewPass] = useState(false);
  const [showConfirmPass, setShowConfirmPass] = useState(false);
  const [isSavingPass, setIsSavingPass] = useState(false);
  const [passError, setPassError] = useState("");
  const [passSuccess, setPassSuccess] = useState("");
  const [refreshedAtTime, setRefreshedAtTime] = useState<string>("");

  useEffect(() => {
    setRefreshedAtTime(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
  }, []);

  const currentUserEmail =
    currentUser?.email ||
    (typeof window !== "undefined" ? (localStorage.getItem("fp_user_email") || localStorage.getItem("user_email") || "") : "") ||
    (currentRole === "mentor" && currentMentor?.email) ||
    (currentRole === "hr" && currentHR?.email) ||
    (currentRole === "cm" && currentCAM?.email) ||
    (currentRole === "kam" && currentKAM?.email) ||
    (currentRole === "admin" && currentAdmin?.email) ||
    (currentRole === "student" && currentStudent?.email) ||
    (currentRole === "fee_manager" && currentUser?.email) ||
    (currentRole === "sme" && currentSME?.email) ||
    "";

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSavingPass || passSuccess) return;
    setPassError("");
    setPassSuccess("");

    if (!currentPassword) {
      setPassError("Please enter your current password.");
      return;
    }
    if (!newPassword || newPassword.trim().length < 6) {
      setPassError("New password must be at least 6 characters long.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPassError("New password and confirm password do not match.");
      return;
    }
    if (currentPassword === newPassword) {
      setPassError("New password must be different from current password.");
      return;
    }

    const operation = ++passwordOperation.current;
    try {
      setIsSavingPass(true);
      const data = await apiFetch("/api/change-password", {
        method: "POST",
        body: {
          currentPassword,
          newPassword,
        },
      });
      if (passwordOperation.current !== operation) return;

      // The server rotates the session (and CSRF secret) on password change;
      // keep the in-memory token in sync or every later mutation will 403.
      if (data?.csrfToken) {
        setClientCsrfToken(data.csrfToken);
      }

      setPassSuccess("Password updated successfully!");
      passwordSuccessTimer.current = setTimeout(() => {
        setRole(data.user.role, data.user.reference_id || data.user.id, {
          collegeId: data.user.college_id || "",
          userEmail: data.user.email,
          userName: data.user.name,
          mustChangePassword: data.user.mustChangePassword
        });
        setShowPasswordModal(false);
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
        setPassSuccess("");
      }, 1500);
    } catch (err: any) {
      if (passwordOperation.current === operation) {
        setPassError(err?.message || "An unexpected error occurred.");
      }
    } finally {
      if (passwordOperation.current === operation) setIsSavingPass(false);
    }
  };

  // Ensure dark mode class is removed on mount
  useEffect(() => {
    localStorage.removeItem("fp_dark_mode");
    if (typeof document !== "undefined") {
      document.documentElement.classList.remove("dark");
    }
  }, []);

  // DATA_FLOW_AUDIT D4: listen for data-change broadcasts (in-page CustomEvents,
  // cross-tab BroadcastChannel / storage events, and Server-Sent Events SSE) and
  // refresh the affected data in real-time so all open tabs and roles stay in sync.
  useEffect(() => {
    if (!canLoadWorkspace) return;
    let debounce: ReturnType<typeof setTimeout> | null = null;
    let lastFocusRefresh = Date.now();

    const scheduleRefresh = () => {
      if (debounce) clearTimeout(debounce);
      // Debounce bursts of mutations (imports, bulk ops) into a single refresh.
      debounce = setTimeout(() => { refreshData(true); }, 300);
    };

    const handleWindowFocus = () => {
      // Throttle window focus revalidation to once every 10s to stay snappy when switching tabs
      const now = Date.now();
      if (now - lastFocusRefresh > 10000) {
        lastFocusRefresh = now;
        scheduleRefresh();
        refreshRequests().catch(() => {});
      }
    };

    const effectiveCollegeId =
      currentCAM?.college_id ||
      currentMentor?.college_id ||
      currentStudent?.college_id ||
      currentUser?.college_id ||
      undefined;

    // Real-time synchronization bus: SSE push from server + 0ms local cross-tab BroadcastChannel
    const unsubscribeRealtime = subscribeToRealtimeSync(
      (event) => {
        if (event.domain === "requests") {
          refreshRequests().catch(() => {});
        } else if (event.domain === "attendance") {
          // Surgical attendance refresh — updates student & CAM attendance instantly without full-app reload
          refreshAttendance(event.collegeId || effectiveCollegeId).catch(() => {});
        } else if (event.domain === "feedback") {
          // Invalidate student NPS & feedback queries so CAM/Student feedback views update live
          queryClient.invalidateQueries({
            predicate: (query) => {
              const root = String(query.queryKey[0] || "");
              return root === "feedback" || root === "student-nps" || root === "mentor-nps" || root === "admin-feedback";
            }
          });
        } else if (event.domain === "notifications") {
          // Invalidate notifications query so bell badge updates immediately
          queryClient.invalidateQueries({ queryKey: notificationsQueryKey });
          setBellShake(true);
          setTimeout(() => setBellShake(false), 1200);

          // Audio chime
          playNotificationChime();

          const payload = event.payload || {};
          const title = payload.title || "FACE Prep Alert";
          const message = payload.message || payload.body || "You have a new update.";
          const link = payload.link || payload.url || undefined;

          // Sonner toast
          try {
            sonnerToast(title, {
              description: message,
              action: link ? { label: "View", onClick: () => router.push(link) } : undefined,
            });
          } catch (_) {}

          // Native OS / Mobile system notification
          sendDeviceSystemNotification({
            title,
            message,
            link,
            tag: payload.id || `notif_${Date.now()}`,
          }).catch(() => {});
        } else if (event.domain === "tracker" || event.domain === "exams") {
          queryClient.invalidateQueries({
            predicate: (query) => {
              const root = String(query.queryKey[0] || "");
              return root === "skill-tracker" || root === "student-exams" || root === "exams" || root === "weekly-plan";
            }
          });
          scheduleRefresh();
        } else {
          scheduleRefresh();
        }
      },
      {
        userId: notificationsUserId || undefined,
        role: currentRole || undefined,
        collegeId: effectiveCollegeId
      }
    );

    const handleDataChanged = (e: Event) => {
      if ((e as CustomEvent)?.detail?.domain === "requests") {
        refreshRequests().catch(() => {});
      } else {
        scheduleRefresh();
      }
    };
    window.addEventListener("fp_data_changed", handleDataChanged);
    window.addEventListener("fp_attendance_updated", scheduleRefresh);
    window.addEventListener("fp_interviews_updated", scheduleRefresh);
    window.addEventListener("fp_audits_updated", scheduleRefresh);
    window.addEventListener("fp_weekly_plan_updated", scheduleRefresh);
    window.addEventListener("focus", handleWindowFocus);
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        handleWindowFocus();
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      if (debounce) clearTimeout(debounce);
      unsubscribeRealtime();
      window.removeEventListener("fp_data_changed", handleDataChanged);
      window.removeEventListener("fp_attendance_updated", scheduleRefresh);
      window.removeEventListener("fp_interviews_updated", scheduleRefresh);
      window.removeEventListener("fp_audits_updated", scheduleRefresh);
      window.removeEventListener("fp_weekly_plan_updated", scheduleRefresh);
      window.removeEventListener("focus", handleWindowFocus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [canLoadWorkspace, refreshData, refreshRequests, refreshAttendance, notificationsUserId, currentRole, currentCAM?.college_id, currentMentor?.college_id, currentStudent?.college_id, currentUser?.college_id]);

  // Handle route protection cleanly without premature logouts
  const hasCompletedInitialLoad = useRef(false);
  const routeProtectionTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!isLoading && !isDataLoading) {
      hasCompletedInitialLoad.current = true;
    }
  }, [isLoading, isDataLoading]);

  useEffect(() => {
    // Clear any existing timeout
    if (routeProtectionTimeoutRef.current) {
      clearTimeout(routeProtectionTimeoutRef.current);
    }

    // Debounce route protection to avoid race conditions during data load
    routeProtectionTimeoutRef.current = setTimeout(() => {
      // Only run protection after initial load is complete
      if (!hasCompletedInitialLoad.current) return;
      if (isLoading || isDataLoading) return;

      if (!isAuthenticated) {
        router.replace("/");
        return;
      }

      const activeRole = currentRole || currentUser?.role;

      if (activeRole && normalizeRoleValue(activeRole) !== normalizeRoleValue(requiredRole) && !isLoading && !isDataLoading) {
        const targetPath = getRoleHomePath(activeRole);
        router.replace(targetPath);
      }
    }, 300); // Wait 300ms before running protection to avoid race conditions

    return () => {
      if (routeProtectionTimeoutRef.current) {
        clearTimeout(routeProtectionTimeoutRef.current);
      }
    };
  }, [isLoading, isDataLoading, isAuthenticated, currentRole, currentUser, requiredRole, router]);

  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const handleLogout = () => {
    if (isLoggingOut) return; // prevent double-fire
    setIsLoggingOut(true);
    passwordOperation.current += 1;
    if (passwordSuccessTimer.current) clearTimeout(passwordSuccessTimer.current);
    logout();
    router.replace("/");
  };

  // Render global loading screen if app is initializing or not authorized yet
  if (isLoading || !isAuthorized) {
    return <ProfessionalLoader />;
  }

  return (
    <div className="h-dvh flex flex-col font-sans bg-warm-canvas text-gray-800 transition-colors duration-200 overflow-hidden relative">
      {!isFirstLoginRequired && <>
      <QueryPrefetcher />
      {/* Data-load failure retry banner — names the actual cause. The blanket
          "couldn't reach the database" wording used to cover capped lists and an
          expired session too, so it pointed at a healthy production database. */}
      {dataLoadError && (
        <div className="sticky top-0 z-[60] w-full bg-rose-50 border-b border-rose-200 px-4 py-2 flex items-center justify-center gap-3">
          <AlertTriangle className="h-4 w-4 text-rose-600 shrink-0" />
          <span className="text-xs font-bold text-rose-700" role="alert">
            {dataLoadMessage || "Working offline — showing cached data. Couldn't reach the database."}
          </span>
          <button
            type="button"
            onClick={() => retryDataLoad()}
            disabled={isDataLoading}
            className="px-3 py-1 rounded-lg bg-rose-600 hover:bg-rose-700 disabled:opacity-60 text-white text-[11px] font-black transition-all cursor-pointer flex items-center gap-1.5"
          >
            {isDataLoading ? <RefreshCw className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
            {isDataLoading ? "Retrying…" : "Retry"}
          </button>
        </div>
      )}

      {/* Floating Application-Style Notification Permission Banner */}
      {showPromptBanner && devicePermission === "default" && (
        <div className="sticky top-0 z-[65] w-full bg-gradient-to-r from-indigo-900 via-slate-900 to-indigo-950 text-white px-4 py-2.5 shadow-md flex items-center justify-between gap-3 border-b border-indigo-500/20 animate-fadeIn">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="h-7 w-7 rounded-lg bg-indigo-500/30 border border-indigo-400/40 flex items-center justify-center shrink-0">
              <Bell className="h-4 w-4 text-indigo-200 animate-bounce" />
            </div>
            <p className="text-xs font-semibold text-indigo-100 truncate">
              Enable website notifications for real-time day order changes, approvals, and emergency alerts.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleEnableNotifications}
              disabled={isActivatingPush}
              className="px-3 py-1 bg-indigo-500 hover:bg-indigo-400 text-white text-xs font-bold rounded-lg shadow-xs transition-colors cursor-pointer disabled:opacity-50"
            >
              {isActivatingPush ? "Activating..." : "Turn On Notifications"}
            </button>
            <button
              type="button"
              onClick={handleDismissPrompt}
              className="px-2.5 py-1 text-indigo-300 hover:text-white text-xs font-medium rounded-lg hover:bg-white/10 transition-colors cursor-pointer"
            >
              Later
            </button>
          </div>
        </div>
      )}

      {/* Capped lists are a payload guard, not an outage: amber, dismissible, no retry. */}
      {!dataLoadError && displayCappedSections.length > 0 && !isCappedNoticeDismissed && (
        <div className="sticky top-0 z-[60] w-full bg-amber-50/90 backdrop-blur-md border-b border-amber-200/60 px-4 py-2 flex items-center justify-center gap-3 transition-all shadow-xs">
          <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
          <span className="text-xs font-semibold text-amber-900 tracking-tight" role="status">
            {describeCappedSections(cappedSections)}
          </span>
          <button
            type="button"
            onClick={() => setIsCappedNoticeDismissed(true)}
            aria-label="Dismiss the capped-lists notice"
            className="p-1 rounded-xl text-amber-700 hover:bg-amber-100/80 transition-colors cursor-pointer"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Top indeterminate sync progress line */}
      {isDataLoading && (
        <div className="absolute top-0 left-0 right-0 h-0.5 z-50 overflow-hidden bg-slate-200 dark:bg-slate-800">
          <div className="h-full bg-slate-900 dark:bg-slate-100 animate-pulse w-full" />
        </div>
      )}

      {/* Global Header — one width and one surface for every role */}
      <div className="relative w-[96%] sm:w-[94%] md:w-[92%] lg:w-[88%] xl:w-[85%] max-w-7xl mx-auto self-center mt-2.5 sm:mt-3 md:mt-3.5 z-30 shrink-0">
        <header className="floating-header w-full px-3.5 sm:px-6 py-2.5 sm:py-3 flex items-center justify-between transition-all rounded-2xl border border-slate-200/80 shadow-xs bg-white/95 backdrop-blur-md">
        {/* Left: Brand + Role Badge */}
        <div className="flex items-center gap-2.5 sm:gap-3.5 shrink-0">
          <img src="/E-Campus.png" alt="FACE Prep E-Campus Logo" className="h-7 sm:h-9 md:h-10 w-auto object-contain shrink-0 max-h-10" />
          {normalizeRoleValue(currentRole) !== "admin" && (
            <div className="hidden sm:flex items-center gap-2 border-l border-slate-200 pl-3">
              <span className="px-2.5 py-0.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-[10px] text-slate-700 dark:text-slate-300 font-bold uppercase tracking-wider block truncate border border-slate-200/60 dark:border-slate-700">
                {normalizeRoleValue(currentRole) === "mentor" && "Faculty Workspace"}
                {normalizeRoleValue(currentRole) === "hr" && "HR Audit Portal"}
                {normalizeRoleValue(currentRole) === "cm" && "CM Dashboard"}
                {normalizeRoleValue(currentRole) === "kam" && "Key Account Manager"}
                {normalizeRoleValue(currentRole) === "student" && "Student Portal"}
                {normalizeRoleValue(currentRole) === "fee_manager" && "Fee Collections"}
                {normalizeRoleValue(currentRole) === "sme" && "SME Evaluation Hub"}
                {normalizeRoleValue(currentRole) === "L and D" && "Learning & Development (L&D)"}
              </span>
            </div>
          )}

          {/* Admin Return Link (WF-P03) */}
          {(currentUser?.role === "admin" || Boolean(currentAdmin)) && normalizeRoleValue(currentRole) !== "admin" && (
            <button
              type="button"
              onClick={() => {
                setRole("admin");
                router.push("/admin/overview");
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 text-xs font-bold transition-all shadow-2xs cursor-pointer ml-1 animate-fadeIn shrink-0"
              title="Return to Super Admin Central Console"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Back to Admin Console</span>
              <span className="sm:hidden">Admin</span>
            </button>
          )}
        </div>

        {/* Right: Profile trigger + Logout */}
        <div className="flex items-center gap-2 sm:gap-3">

          {/* Interactive Refresh Loader Button */}
          <button
            type="button"
            onClick={handleManualRefresh}
            disabled={isManualRefreshing || isDataLoading}
            aria-label={isManualRefreshing || isDataLoading ? "Syncing data" : `Reload latest data — last synced ${lastSyncTime || "just now"}`}
            className="relative flex items-center justify-center h-8.5 w-8.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700 hover:bg-white dark:hover:bg-slate-700 transition-all cursor-pointer shadow-2xs disabled:opacity-70"
            title={`Last synced ${lastSyncTime || "just now"} — click to reload latest data from server`}
          >
            <RefreshCw className={`h-4 w-4 ${isManualRefreshing || isDataLoading ? "text-slate-900 dark:text-slate-100 animate-spin" : "text-slate-600 dark:text-slate-300"}`} />
            {!isManualRefreshing && !isDataLoading && (
              <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-emerald-500 border border-white dark:border-slate-900" aria-hidden="true" />
            )}
          </button>

          {/* Notifications Bell */}
          <div className="relative" ref={notificationsDropRef}>
            <button
              type="button"
              onClick={() => {
                setShowNotifications((p) => !p);
              }}
              className={`relative flex items-center justify-center h-8.5 w-8.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700 hover:bg-white dark:hover:bg-slate-700 transition-all cursor-pointer shadow-2xs ${
                hasUnread ? "ring-1 ring-amber-400/60 ring-offset-1 dark:ring-offset-slate-900 bg-amber-50 dark:bg-amber-950/30" : ""
              } ${bellShake ? "animate-[wiggle_0.5s_ease-in-out]" : ""}`}
              title="Notifications"
            >
              <Bell className={`h-4 w-4 ${hasUnread ? "text-amber-600 dark:text-amber-400" : "text-slate-600 dark:text-slate-300"} ${hasUnread ? "animate-pulse" : ""}`} />
              {hasUnread && (
                <span className="absolute -top-1 -right-1 min-w-[16px] h-[16px] px-1 rounded-full bg-rose-500 text-white text-[8.5px] font-black flex items-center justify-center border border-white dark:border-slate-900 shadow-xs">
                  {unreadCount > 99 ? "99+" : unreadCount}
                </span>
              )}
            </button>

            {/* Dropdown Panel */}
            {showNotifications && (
              <div className="absolute right-0 mt-2.5 w-[380px] sm:w-[420px] max-w-[92vw] max-h-[70vh] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-card-lg z-[60] overflow-hidden flex flex-col animate-fadeIn">
              {/* Header */}
              <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="h-8 w-8 rounded-xl bg-slate-900 dark:bg-slate-800 flex items-center justify-center shadow-xs">
                    <MessageSquare className="h-4 w-4 text-white" />
                  </div>
                  <div>
                    <p className="text-[11px] font-black text-slate-800 dark:text-white tracking-tight">
                      Notifications
                    </p>
                    <p className="text-[9px] text-slate-400 font-medium">
                      {hasUnread
                        ? `${unreadCount} unread · ${notifications.length} total`
                        : `${notifications.length} notifications`}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      notificationsQuery.refetch();
                    }}
                    className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                    title="Refresh"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 text-slate-500 dark:text-slate-400 ${notificationsLoading ? "animate-spin" : ""}`} />
                  </button>
                  {hasUnread && (
                    <button
                      type="button"
                      onClick={clearAllNotifs}
                      className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 text-[9px] font-bold hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                    >
                      Mark all read
                    </button>
                  )}
                </div>
              </div>

              {/* Device Notification Status & Test Alert Bar */}
              <div className="px-3.5 py-2 bg-slate-50 dark:bg-slate-800/60 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2 text-[11px]">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span
                    className={`h-2 w-2 rounded-full shrink-0 ${
                      devicePermission === "granted" ? "bg-emerald-500" : "bg-amber-400"
                    }`}
                  />
                  <span className="font-semibold text-slate-700 dark:text-slate-200 truncate">
                    {devicePermission === "granted"
                      ? "Device Alerts Active"
                      : devicePermission === "denied"
                      ? "Alerts Blocked in Browser"
                      : "Device Alerts Not Enabled"}
                  </span>
                </div>
                {devicePermission === "granted" ? (
                  <button
                    type="button"
                    onClick={handleSendTestNotification}
                    className="px-2 py-0.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300 font-bold text-[10px] transition-colors shrink-0 cursor-pointer"
                    title="Send a sample notification to your OS lock screen / notification center"
                  >
                    Test Alert
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleEnableNotifications}
                    disabled={isActivatingPush}
                    className="px-2 py-0.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-[10px] transition-colors disabled:opacity-50 shrink-0 cursor-pointer"
                  >
                    {isActivatingPush ? "Enabling..." : "Enable"}
                  </button>
                )}
              </div>

              {/* List */}
              <div className="overflow-y-auto flex-1 max-h-[58vh]">
                {notificationsLoading && notifications.length === 0 ? (
                  <div className="px-4 py-10 flex flex-col items-center justify-center text-slate-400">
                    <Loader2 className="h-6 w-6 animate-spin mb-2 text-slate-700 dark:text-slate-300" />
                    <p className="text-[11px] font-semibold">Loading notifications…</p>
                  </div>
                ) : notifications.length === 0 ? (
                  <div className="px-4 py-12 flex flex-col items-center justify-center">
                    <div className="h-14 w-14 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center mb-3">
                      <Inbox className="h-6 w-6 text-slate-400" />
                    </div>
                    <p className="text-xs font-bold text-slate-600 dark:text-slate-300">
                      All caught up
                    </p>
                    <p className="text-[10px] text-slate-400 mt-0.5 text-center max-w-[240px]">
                      You don't have any notifications yet. Reminders and activity will show here.
                    </p>
                  </div>
                ) : (
                    <div className="divide-y divide-slate-100 dark:divide-slate-800">
                      {notifications.map((n) => {
                        const isRead = !!n.is_read;
                        const isActive = activeNotificationId === n.id;
                        const t = n.type || "info";
                        const accent =
                          t === "reminder"
                            ? "bg-amber-50 dark:bg-amber-950/30 text-amber-600 dark:text-amber-400 border-amber-100 dark:border-amber-900/60"
                            : t === "success"
                            ? "bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400 border-emerald-100 dark:border-emerald-900/60"
                            : t === "warning" || t === "alert"
                            ? "bg-rose-50 dark:bg-rose-950/30 text-rose-600 dark:text-rose-400 border-rose-100 dark:border-rose-900/60"
                            : "bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 border-slate-200 dark:border-slate-700";
                        const target = resolveNotificationTarget(n);
                        const Icon =
                          t === "reminder" ? Bell : t === "success" ? CheckCircle2 : t === "warning" ? AlertCircle : MessageSquare;

                        return (
                          <div
                            key={n.id}
                            onClick={() => handleNotificationClick(n)}
                            className={`group relative px-3.5 py-3 transition-all cursor-pointer ${
                              isRead
                                ? "bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800/60"
                                : "bg-slate-50/80 dark:bg-slate-800/40 hover:bg-slate-100/70 dark:hover:bg-slate-800/70"
                            } ${isActive ? "opacity-60" : ""}`}
                          >
                            {!isRead && (
                              <span className="absolute left-0 top-3.5 h-2 w-2 rounded-full bg-rose-500 shadow-[0_0_0_3px_rgba(244,63,94,0.12)]" />
                            )}
                            <div className="pl-5 flex items-start gap-3">
                              <div className={`shrink-0 mt-0.5 h-8 w-8 rounded-xl border flex items-center justify-center ${accent}`}>
                                <Icon className="h-3.5 w-3.5" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-start justify-between gap-2">
                                  <p className={`text-[11px] font-black text-slate-800 dark:text-slate-100 leading-snug group-hover:text-slate-900 dark:group-hover:text-slate-100 transition-colors ${!isRead ? "text-slate-900 dark:text-white" : ""}`}>
                                    {n.title || "Notification"}
                                  </p>
                                  <span className="shrink-0 text-[9px] font-mono font-semibold text-slate-400">
                                    {(() => {
                                      try {
                                        const d = new Date(n.created_at);
                                        const now = new Date();
                                        const diffMs = now.getTime() - d.getTime();
                                        const mins = Math.floor(diffMs / 60000);
                                        if (mins < 1) return "now";
                                        if (mins < 60) return `${mins}m`;
                                        const hrs = Math.floor(mins / 60);
                                        if (hrs < 24) return `${hrs}h`;
                                        const days = Math.floor(hrs / 24);
                                        if (days < 7) return `${days}d`;
                                        return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
                                      } catch {
                                        return "";
                                      }
                                    })()}
                                  </span>
                                </div>
                                <p className="mt-0.5 text-[10.5px] leading-snug text-slate-600 dark:text-slate-400 font-medium line-clamp-3">
                                  {n.message}
                                </p>
                                <div className="mt-2.5 flex items-center justify-between gap-2 flex-wrap">
                                  {target && (
                                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-900 group-hover:bg-slate-800 active:bg-slate-950 text-white text-[9.5px] font-bold shadow-xs transition-all">
                                      {target.isExternal ? <ExternalLink className="h-3 w-3" /> : <ArrowUpRight className="h-3 w-3" />}
                                      <span>{target.actionLabel}</span>
                                    </span>
                                  )}
                                  {!isRead && (
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        markNotifRead(n.id);
                                      }}
                                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 text-[9px] font-bold transition-colors ml-auto"
                                      title="Mark as read without opening"
                                    >
                                      <Check className="h-3 w-3 text-emerald-600" />
                                      <span>Mark read</span>
                                    </button>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
              </div>

              {/* Footer */}
              <div className="px-4 py-2.5 border-t border-slate-100 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/50 flex items-center justify-between">
                <p className="text-[9px] text-slate-400 font-medium">
                  Auto-refreshes every {hasUnread ? "15s" : "30s"}
                </p>
                <button
                  type="button"
                  onClick={() => setShowNotifications(false)}
                  className="text-[9.5px] font-bold text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 px-2 py-1 rounded-md hover:bg-white dark:hover:bg-slate-800 transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          )}
          </div>

          {currentRole === "cm" && (
            <button
              type="button"
              onClick={() => {
                if (typeof window !== "undefined") {
                  window.dispatchEvent(new CustomEvent("fp_navigate_tab", { detail: "mentor_attendance" }));
                }
              }}
              className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs shadow-xs hover:scale-102 active:scale-98 transition-all cursor-pointer whitespace-nowrap shrink-0"
              title="Team Attendance Management"
            >
              <CalendarCheck2 className="h-3.5 w-3.5 text-white shrink-0" />
              <span>Team Attendance</span>
            </button>
          )}

          <UserProfileBar
            onOpenChangePassword={() => {
              setShowPasswordModal(true);
              setPassError("");
              setPassSuccess("");
              setCurrentPassword("");
              setNewPassword("");
              setConfirmPassword("");
            }}
          />

        </div>
      </header>

    </div>

      {/* Global Interactive Breadcrumb Bar (WF-P02) */}
      <div className="w-[96%] sm:w-[94%] md:w-[92%] lg:w-[88%] xl:w-[85%] max-w-7xl mx-auto self-center px-3.5 sm:px-6 py-1.5 flex items-center justify-between text-[11px] font-semibold text-slate-500 z-20 shrink-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            type="button"
            onClick={() => router.push(getRoleHomePath(currentRole))}
            className="hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer font-bold text-slate-600 dark:text-slate-400 flex items-center gap-1"
          >
            <span>Home</span>
          </button>
          <ChevronRight className="w-3 h-3 text-slate-300 dark:text-slate-600 shrink-0" />
          <span className="text-slate-800 dark:text-slate-200 font-extrabold uppercase tracking-wider text-[10px] px-2 py-0.5 rounded-md bg-white/80 dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700 shadow-2xs">
            {normalizeRoleValue(currentRole) === "admin" && "Super Admin Central"}
            {normalizeRoleValue(currentRole) === "cm" && "Campus Operations"}
            {normalizeRoleValue(currentRole) === "kam" && "Institutional Portfolio"}
            {normalizeRoleValue(currentRole) === "mentor" && (currentMentor?.name ? `Faculty · ${currentMentor.name}` : "Faculty Workspace")}
            {normalizeRoleValue(currentRole) === "student" && (currentStudent?.name ? `Student · ${currentStudent.name}` : "Student Portal")}
            {normalizeRoleValue(currentRole) === "fee_manager" && "Fee Collections"}
            {normalizeRoleValue(currentRole) === "sme" && "SME Evaluation Hub"}
            {normalizeRoleValue(currentRole) === "L and D" && "Learning & Development"}
          </span>
          {Boolean(currentCAM?.college_name || (currentUser?.college_id && colleges?.find(c => c.id === currentUser?.college_id)?.name)) && (
            <>
              <ChevronRight className="w-3 h-3 text-slate-300 dark:text-slate-600 shrink-0" />
              <span className="text-slate-700 dark:text-slate-300 font-bold truncate max-w-[200px]">
                {currentCAM?.college_name || colleges?.find(c => c.id === currentUser?.college_id)?.name}
              </span>
            </>
          )}
        </div>
      </div>

      {/* Main Workspace Dashboard Content */}
      <main className="flex-grow flex flex-col relative overflow-hidden min-h-0">
        {/* Modern Dot Grid Background Pattern Overlay */}
        <div className="absolute inset-0 bg-dotted-grid pointer-events-none opacity-25 dark:opacity-15 z-0" />
        {children}

        {/* Global Floating Feedback Button — clears the mobile bottom navigation */}
        <div className="fixed bottom-20 md:bottom-4 right-4 z-40">
          <button
            type="button"
            onClick={() => {
              setShowFeedbackModal(true);
              setFeedbackModalTab("submit");
            }}
            className="flex items-center gap-2 px-3.5 py-2.5 rounded-lg bg-slate-900 dark:bg-slate-800 text-white font-bold text-xs shadow-md hover:bg-slate-800 dark:hover:bg-slate-700 transition-all cursor-pointer border border-slate-700/50"
            title="Report an Issue or Feedback"
          >
            <AlertCircle className="h-4 w-4 text-slate-300 dark:text-slate-300" />
            <span className="hidden sm:inline">Report Issue / Feedback</span>
          </button>
        </div>
      </main>
      </>}

      {/* Change Password Glassmorphic Modal */}
      {(isFirstLoginRequired || showPasswordModal) && (
        <Dialog
          open={isFirstLoginRequired || showPasswordModal}
          onOpenChange={(next) => {
            if (!next && !isFirstLoginRequired && !isSavingPass && !passSuccess) setShowPasswordModal(false);
          }}
          ariaLabel={isFirstLoginRequired ? "Password change required" : "Change password"}
          overlayClassName="bg-slate-950/60 backdrop-blur-sm"
          panelClassName="max-w-md bg-white dark:bg-slate-900 p-6 space-y-0 max-h-[90vh] overflow-y-auto"
        >
            {/* Ambient Top Glow */}
            <div className="absolute top-0 left-0 right-0 h-1 bg-slate-900 dark:bg-slate-100" />

            {/* Modal Header */}
            <div className="flex items-center justify-between pb-4 mb-5 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-800 dark:text-slate-200 shadow-sm">
                  <ShieldCheck className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white tracking-tight">
                    {isFirstLoginRequired ? "Password Change Required" : "Change Password"}
                  </h3>
                  <p className="text-[11px] text-slate-400 font-medium">
                    {isFirstLoginRequired ? "First login security requirement" : "Update your account login security credentials"}
                  </p>
                </div>
              </div>
              {!isFirstLoginRequired && (
                <button
                  type="button"
                  onClick={() => setShowPasswordModal(false)}
                  disabled={isSavingPass || Boolean(passSuccess)}
                  aria-label="Close password dialog"
                  className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all cursor-pointer"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            {/* Mandatory First Login Notice */}
            {isFirstLoginRequired && (
              <div className="mb-4 p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/50 flex items-start gap-3 text-xs text-amber-800 dark:text-amber-300">
                <Lock className="h-4 w-4 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
                <div>
                  <p className="font-bold">First Login Security Requirement</p>
                  <p className="text-[11px] opacity-90 mt-0.5 leading-relaxed">
                    Because this is your initial sign-in (or your password was reset), security policy requires you to set a new password before continuing.
                  </p>
                </div>
              </div>
            )}

            {/* Notifications */}
            {passError && (
              <div className="mb-4 p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/50 flex items-start gap-2.5 text-xs text-rose-600 dark:text-rose-400" role="alert">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>{passError}</span>
              </div>
            )}

            {passSuccess && (
              <div role="status" className="mb-4 p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/50 flex items-start gap-2.5 text-xs text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
                <span>{passSuccess}</span>
              </div>
            )}

            {/* Form */}
            <form onSubmit={handlePasswordSubmit} className="space-y-4">
              {/* Account Email (Read-only badge) */}
              <div>
                <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">
                  Account Email
                </label>
                <input
                  type="text"
                  readOnly
                  value={currentUserEmail}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-100/70 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/60 text-xs font-mono font-semibold text-slate-600 dark:text-slate-300 cursor-not-allowed"
                  aria-label="Account Email"
                />
              </div>

              {/* Current Password */}
              <div>
                <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                  Current Password
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                    <Lock className="h-3.5 w-3.5" />
                  </div>
                  <input
                    type={showCurrentPass ? "text" : "password"}
                    required
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    placeholder="Enter current password"
                    className="w-full pl-9 pr-10 py-2.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-400 focus:border-slate-700 transition-all"
                    aria-label="Current Password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowCurrentPass((p) => !p)}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
                    aria-label="Show or hide current password"
                  >
                    {showCurrentPass ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  </button>
                </div>
              </div>

              {/* New Password */}
              <div>
                <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                  New Password
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                    <KeyRound className="h-3.5 w-3.5" />
                  </div>
                  <input
                    type={showNewPass ? "text" : "password"}
                    required
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Enter new password (min. 6 chars)"
                    className="w-full pl-9 pr-10 py-2.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-400 focus:border-slate-700 transition-all"
                    aria-label="New Password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPass((p) => !p)}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
                    aria-label="Show or hide new password"
                  >
                    {showNewPass ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  </button>
                </div>
              </div>

              {/* Confirm New Password */}
              <div>
                <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                  Confirm New Password
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                    <KeyRound className="h-3.5 w-3.5" />
                  </div>
                  <input
                    type={showConfirmPass ? "text" : "password"}
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Confirm new password"
                    className="w-full pl-9 pr-10 py-2.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-400 focus:border-slate-700 transition-all"
                    aria-label="Confirm New Password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPass((p) => !p)}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
                    aria-label="Show or hide confirm password"
                  >
                    {showConfirmPass ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  </button>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="pt-3 flex items-center gap-3">
                {isFirstLoginRequired ? (
                  <button
                    type="button"
                    onClick={handleLogout}
                    disabled={isLoggingOut}
                    className="flex-1 py-2.5 rounded-xl border border-rose-200 dark:border-rose-900/50 text-xs font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-all cursor-pointer flex items-center justify-center gap-1.5 disabled:opacity-60 disabled:cursor-wait"
                  >
                    {isLoggingOut
                      ? <span className="h-3.5 w-3.5 rounded-full border-2 border-rose-500 border-t-transparent animate-spin" />
                      : <LogOut className="h-3.5 w-3.5" />}
                    {isLoggingOut ? "Logging out…" : "Log out"}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowPasswordModal(false)}
                    disabled={isSavingPass || Boolean(passSuccess)}
                    className="flex-1 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all cursor-pointer"
                  >
                    Cancel
                  </button>
                )}
                <button
                  type="submit"
                  disabled={isSavingPass || Boolean(passSuccess)}
                  className="flex-1 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-xs font-bold text-white shadow-xs flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-50"
                >
                  {isSavingPass ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Updating...
                    </>
                  ) : (
                    "Update Password"
                  )}
                </button>
              </div>
            </form>
        </Dialog>
      )}

      {/* Global Feedback & Issue Modal */}
      <Dialog
        open={canLoadWorkspace && showFeedbackModal}
        onOpenChange={(next) => {
          if (!next) setShowFeedbackModal(false);
        }}
        ariaLabel="Support and feedback center"
        overlayClassName="bg-slate-950/60 backdrop-blur-sm"
        panelClassName="max-w-xl bg-white dark:bg-slate-900 rounded-2xl p-0 space-y-0 overflow-hidden flex flex-col max-h-[90vh]"
      >
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-900">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-slate-900 dark:bg-slate-800 flex items-center justify-center text-white shadow-xs font-bold">
                  <AlertCircle className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900 dark:text-white">Support & Feedback Center</h3>
                  <p className="text-[11px] text-slate-400 font-medium">Report issues or track live status of your submitted tickets</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowFeedbackModal(false)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Navigation Tabs */}
            <div className="flex border-b border-slate-100 dark:border-slate-800 px-6 pt-2 bg-slate-50/50 dark:bg-slate-900/50">
              <button
                type="button"
                onClick={() => setFeedbackModalTab("submit")}
                className={`flex items-center gap-2 py-2.5 px-4 text-xs font-bold border-b-2 transition-all cursor-pointer ${
                  feedbackModalTab === "submit"
                    ? "border-slate-900 text-slate-900 dark:border-white dark:text-white font-extrabold"
                    : "border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
                }`}
              >
                <Send className="h-3.5 w-3.5" />
                <span>Submit New Issue</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setFeedbackModalTab("history");
                }}
                className={`flex items-center gap-2 py-2.5 px-4 text-xs font-bold border-b-2 transition-all cursor-pointer ${
                  feedbackModalTab === "history"
                    ? "border-slate-900 text-slate-900 dark:border-white dark:text-white font-extrabold"
                    : "border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
                }`}
              >
                <ClipboardList className="h-3.5 w-3.5" />
                <span>My Submitted Issues</span>
                {myFeedbackList.length > 0 && (
                  <span className="px-1.5 py-0.2 rounded-full text-[10px] font-black bg-slate-200 dark:bg-slate-800 text-slate-800 dark:text-slate-200">
                    {myFeedbackList.length}
                  </span>
                )}
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto max-h-[calc(90vh-140px)] space-y-4">
              {feedbackModalTab === "submit" ? (
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    const form = e.target as HTMLFormElement;
                    const type = (form.elements.namedItem("type") as HTMLSelectElement).value;
                    const title = (form.elements.namedItem("title") as HTMLInputElement).value;
                    const description = (form.elements.namedItem("description") as HTMLTextAreaElement).value;
                    const contactPhone = (form.elements.namedItem("contactPhone") as HTMLInputElement)?.value || "";

                    const reporter = getReporterDetails();
                    setIsSubmittingFeedback(true);

                    try {
                      const res = await fetch("/api/feedback", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          userId: reporter.userId,
                          userName: reporter.userName,
                          userRole: reporter.userRole,
                          collegeId: reporter.collegeId,
                          collegeName: reporter.collegeName,
                          department: reporter.department,
                          registerNumber: reporter.registerNumber,
                          contactInfo: contactPhone.trim() || reporter.contactInfo,
                          type,
                          title,
                          description
                        })
                      });
                      const data = await res.json();
                      if (data.success) {
                        showToast("Feedback submitted successfully! Our administration team will review it.", "success");
                        form.reset();
                        queryClient.invalidateQueries({ queryKey: qk.myFeedback(feedbackReporterId) });
                        setFeedbackModalTab("history");
                      } else {
                        showToast(data.message || "Failed to submit feedback.", "error");
                      }
                    } catch (err: any) {
                      showToast("Failed to submit feedback: " + err.message, "error");
                    } finally {
                      setIsSubmittingFeedback(false);
                    }
                  }}
                  className="space-y-4 text-xs font-semibold text-slate-700 dark:text-slate-200"
                >
                  {/* Reporter context banner */}
                  {(() => {
                    const rep = getReporterDetails();
                    return (
                      <div className="rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700 p-3 text-[11px] flex items-center justify-between gap-2 flex-wrap">
                        <div className="flex items-center gap-2">
                          <User className="h-4 w-4 text-slate-500" />
                          <span className="font-bold text-slate-800 dark:text-slate-200">
                            Submitting as: <span className="text-slate-900 dark:text-white font-bold">{rep.userName || rep.userId}</span>
                          </span>
                          <span className="px-2 py-0.5 rounded-md bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-[10px] font-black uppercase text-slate-600 dark:text-slate-300">
                            {rep.userRole}
                          </span>
                        </div>
                        {(rep.collegeName || rep.department) && (
                          <div className="text-[10px] text-slate-400 font-medium truncate">
                            {rep.collegeName} {rep.department ? `(${rep.department})` : ""}
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">Issue Category</label>
                      <select
                        name="type"
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 inset-shadow-well focus:bg-white dark:focus:bg-[#131317] dark:border-slate-700 bg-sunken dark:bg-slate-800 text-xs font-bold focus:outline-none focus:border-slate-700"
                        aria-label="Issue Category"
                      >
                        <option value="bug">🐞 Bug / Error Report</option>
                        <option value="feature">✨ Feature Request</option>
                        <option value="suggestion">💡 General Suggestion</option>
                        <option value="other">📝 Other / Help</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">Contact Phone (Optional)</label>
                      <input
                        name="contactPhone"
                        type="text"
                        defaultValue={getReporterDetails().contactInfo}
                        placeholder="e.g. +91 9876543210"
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 inset-shadow-well focus:bg-white dark:focus:bg-[#131317] dark:border-slate-700 bg-sunken dark:bg-slate-800 text-xs outline-none focus:border-slate-700 font-medium"
                        aria-label="Contact Phone (Optional)"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">Title / Summary</label>
                    <input
                      required
                      name="title"
                      type="text"
                      placeholder="e.g. Date of birth is incorrect in my profile"
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 inset-shadow-well focus:bg-white dark:focus:bg-[#131317] dark:border-slate-700 bg-sunken dark:bg-slate-800 text-xs outline-none focus:border-slate-700 font-bold"
                      aria-label="Title / Summary"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">Detailed Description</label>
                    <textarea
                      required
                      name="description"
                      rows={4}
                      placeholder="Describe what happened, what needs correction, and any error message you encountered..."
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 inset-shadow-well focus:bg-white dark:focus:bg-[#131317] dark:border-slate-700 bg-sunken dark:bg-slate-800 text-xs outline-none focus:border-slate-700 font-medium resize-none"
                      aria-label="Detailed Description"
                    />
                  </div>

                  <div className="flex gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setShowFeedbackModal(false)}
                      className="flex-1 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isSubmittingFeedback}
                      className="flex-1 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs shadow-xs transition-all cursor-pointer flex items-center justify-center gap-1.5 disabled:opacity-50"
                    >
                      {isSubmittingFeedback ? (
                        <>
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          <span>Submitting...</span>
                        </>
                      ) : (
                        <>
                          <Send className="h-3.5 w-3.5" />
                          <span>Submit Ticket</span>
                        </>
                      )}
                    </button>
                  </div>
                </form>
              ) : (
                /* History Tab: Track status of submitted issues */
                <div className="space-y-3">
                  <div className="flex items-center justify-between pb-1">
                    <p className="text-xs font-bold text-slate-600 dark:text-slate-300">
                      Your Reported Issues ({myFeedbackList.length})
                    </p>
                    <button
                      type="button"
                      onClick={() => myFeedbackQuery.refetch()}
                      className="flex items-center gap-1 text-[11px] font-semibold text-slate-700 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white transition-colors cursor-pointer underline"
                    >
                      <RefreshCw className={`h-3 w-3 ${myFeedbackLoading ? "animate-spin" : ""}`} />
                      <span>Refresh</span>
                    </button>
                  </div>

                  {myFeedbackLoading ? (
                    <div className="py-12 flex flex-col items-center justify-center text-slate-400">
                      <Loader2 className="h-6 w-6 animate-spin text-slate-700 dark:text-slate-300 mb-2" />
                      <p className="text-xs font-semibold">Loading your issues...</p>
                    </div>
                  ) : myFeedbackList.length === 0 ? (
                    <div className="py-12 text-center bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-slate-700 p-6">
                      <MessageSquare className="h-10 w-10 text-slate-300 mx-auto mb-2" />
                      <p className="text-xs font-bold text-slate-700 dark:text-slate-200">No issues submitted yet</p>
                      <p className="text-[11px] text-slate-400 mt-1 max-w-xs mx-auto">
                        If you encounter bugs, broken features, or data discrepancies, report them using the form.
                      </p>
                      <button
                        type="button"
                        onClick={() => setFeedbackModalTab("submit")}
                        className="mt-3 px-3.5 py-1.5 rounded-xl bg-slate-900 text-white text-xs font-bold hover:bg-slate-800 transition-all cursor-pointer"
                      >
                        Create New Report
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {myFeedbackList.map((item: any) => {
                        const isPending = (item.status || "pending") === "pending";
                        const isResolved = item.status === "resolved";

                        return (
                          <div
                            key={item.id}
                            className="bg-white dark:bg-slate-800/80 border border-slate-100 dark:border-slate-700 rounded-2xl p-4 space-y-2.5 shadow-card"
                          >
                            <div className="flex items-center justify-between gap-2 flex-wrap">
                              <div className="flex items-center gap-2">
                                <span
                                  className={`px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider border ${
                                    item.type === "bug"
                                      ? "bg-rose-50 text-rose-700 border-rose-200"
                                      : item.type === "feature"
                                      ? "bg-purple-50 text-purple-700 border-purple-200"
                                      : "bg-slate-100 text-slate-800 border-slate-200"
                                  }`}
                                >
                                  {item.type || "issue"}
                                </span>
                                <span
                                  className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider border ${
                                    isPending
                                      ? "bg-amber-50 text-amber-700 border-amber-300"
                                      : isResolved
                                      ? "bg-emerald-50 text-emerald-700 border-emerald-300"
                                      : "bg-slate-100 text-slate-600 border-slate-300"
                                  }`}
                                >
                                  <span
                                    className={`h-1.5 w-1.5 rounded-full ${
                                      isPending ? "bg-amber-500 animate-pulse" : isResolved ? "bg-emerald-500" : "bg-slate-400"
                                    }`}
                                  />
                                  {isPending ? "Pending Review" : item.status}
                                </span>
                              </div>
                              <span className="text-[10px] text-slate-400 font-medium">
                                {item.created_at ? new Date(item.created_at).toLocaleString("en-IN", {
                                  day: "2-digit",
                                  month: "short",
                                  year: "numeric",
                                  hour: "2-digit",
                                  minute: "2-digit",
                                  hour12: true
                                }) : ""}
                              </span>
                            </div>

                            <div>
                              <h4 className="text-xs font-black text-slate-900 dark:text-white">{item.title}</h4>
                              <p className="text-[11px] text-slate-600 dark:text-slate-300 mt-1 whitespace-pre-wrap font-medium">
                                {item.description}
                              </p>
                            </div>

                            {/* Admin Resolution Remarks */}
                            {(item.admin_notes || item.resolved_by) && (
                              <div className="rounded-lg bg-emerald-50/90 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 p-2.5 space-y-1">
                                <div className="flex items-center justify-between text-[11px] font-bold text-emerald-800 dark:text-emerald-300">
                                  <span className="inline-flex items-center gap-1.5">
                                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                                    Admin Response
                                  </span>
                                  {item.resolved_at && (
                                    <span className="text-[9px] font-mono text-emerald-600 dark:text-emerald-400">
                                      {new Date(item.resolved_at).toLocaleDateString("en-IN", {
                                        day: "2-digit",
                                        month: "short",
                                        year: "numeric"
                                      })}
                                    </span>
                                  )}
                                </div>
                                <p className="text-[11px] text-emerald-950 dark:text-emerald-100 font-medium whitespace-pre-wrap pl-5">
                                  {item.admin_notes || "Resolved by administration."}
                                </p>
                                {item.resolved_by && (
                                  <p className="text-[9px] text-emerald-700 dark:text-emerald-400 pl-5">
                                    Handled by: <span className="font-semibold">{item.resolved_by}</span>
                                  </p>
                                )}
                              </div>
                            )}

                            {isPending && (
                              <p className="text-[10px] text-slate-400 italic">
                                ⏳ Queued for administrator review. You will receive an in-app notification once addressed.
                              </p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
      </Dialog>
    </div>
  );
}

const CAMPUS_LOADER_PHRASES = [
  "Preparing your academic workspace...",
  "Synchronizing timetables and schedules...",
  "Organizing faculty and student rosters...",
  "Gathering today's academic insights...",
  "Compiling attendance records and metrics...",
  "Calibrating department allocations...",
  "Optimizing timetable grid and rooms...",
  "Retrieving course and slot distributions...",
  "Updating semester learning milestones...",
  "Refreshing campus operations hub...",
  "Aligning batches and session plans...",
  "Loading curriculum trackers and logs...",
];

export function ProfessionalLoader({ message }: { message?: string }) {
  // The first paint must be identical on the server and the client, so the
  // starting phrase is deterministic; it rotates from there after hydration.
  const [phrase, setPhrase] = useState<string>(() => message || CAMPUS_LOADER_PHRASES[0]);
  const [fade, setFade] = useState(false);

  useEffect(() => {
    if (message) {
      setPhrase(message);
      return;
    }
    const interval = setInterval(() => {
      setFade(true);
      setTimeout(() => {
        setPhrase((prev) => {
          const others = CAMPUS_LOADER_PHRASES.filter((p) => p !== prev);
          const nextIdx = Math.floor(Math.random() * others.length);
          return others[nextIdx];
        });
        setFade(false);
      }, 200);
    }, 2400);

    return () => clearInterval(interval);
  }, [message]);

  return (
    <div className="min-h-dvh flex items-center justify-center bg-warm-canvas">
      <div className="flex flex-col items-center gap-3">
        <img src="/E-Campus.png" alt="FACE Prep E-Campus" className="h-9 w-auto object-contain" />
        <div className="flex items-center gap-2">
          <Loader2 className="h-4 w-4 text-slate-700 dark:text-slate-300 animate-spin shrink-0" />
          <span
            className={`text-xs font-bold text-slate-500 transition-opacity duration-300 ${
              fade ? "opacity-0" : "opacity-100"
            }`}
          >
            {phrase}
          </span>
        </div>
      </div>
    </div>
  );
}

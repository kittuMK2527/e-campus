"use client";

import React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useToast } from "@/context/ToastContext";
import { apiFetch } from "@/lib/apiFetch";
import { qk } from "@/lib/queryKeys";
import {
  resolveNotificationDestination,
  type NotificationAction,
} from "@/lib/notificationTarget";
import {
  requestDeviceNotificationPermission,
  getDeviceNotificationStatus,
  sendDeviceSystemNotification,
  registerPushSubscription,
  type DeviceNotificationPermission,
} from "@/lib/deviceNotifications";
import {
  Bell,
  CheckCircle2,
  Circle,
  ExternalLink,
  ArrowRight,
  Calendar,
  ClipboardList,
  Video,
  Award,
  BookOpen,
  IndianRupee,
  User,
  Clock,
  Check,
  CheckCheck
} from "lucide-react";

const ACTION_ICONS: Record<NotificationAction, React.ComponentType<{ className?: string }>> = {
  external: ExternalLink,
  details: ArrowRight,
  schedule: Calendar,
  interviews: Video,
  approvals: ClipboardList,
  exams: Award,
  marks: Award,
  tasks: BookOpen,
  fees: IndianRupee,
  library: BookOpen,
  profile: User,
  fallback: ArrowRight,
};

export function NotificationsView({ userId, portalType }: { userId?: string; portalType: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const notificationsQuery = useQuery<any[]>({
    queryKey: qk.notificationsFull(userId || "anonymous"),
    enabled: !!userId,
    queryFn: async () => {
      const data = await apiFetch<any>(`/api/notifications?userId=${encodeURIComponent(userId!)}&limit=50`);
      return data?.success ? (data.notifications || []) : [];
    },
  });
  const notifications = notificationsQuery.data || [];
  const loading = notificationsQuery.isPending;

  const [deviceNotifStatus, setDeviceNotifStatus] = React.useState<DeviceNotificationPermission>("default");
  const [hidePermissionBanner, setHidePermissionBanner] = React.useState(false);

  React.useEffect(() => {
    if (typeof window !== "undefined") {
      setDeviceNotifStatus(getDeviceNotificationStatus().permission);
      const hidden = localStorage.getItem("fp_hide_notif_banner") === "true";
      setHidePermissionBanner(hidden);
    }
  }, []);

  const handleEnableDeviceNotifs = async () => {
    const res = await requestDeviceNotificationPermission();
    setDeviceNotifStatus(res.permission);
    if (res.permission === "granted") {
      registerPushSubscription({ userId, role: portalType }).catch(() => {});
      toast("Desktop & mobile notifications enabled! Background push is active.", "success");
    } else if (res.instructions) {
      toast(res.instructions, res.permission === "denied" ? "error" : "info");
    } else if (res.permission === "denied") {
      toast("Notification permission was denied in your browser settings.", "error");
    }
  };

  const handleHidePermissionBanner = () => {
    if (typeof window !== "undefined") {
      localStorage.setItem("fp_hide_notif_banner", "true");
      setHidePermissionBanner(true);
    }
  };

  const patchCachedNotifications = (patch: (rows: any[]) => any[]) => {
    const uid = userId || "anonymous";
    queryClient.setQueryData<any[]>(qk.notificationsFull(uid), prev => patch(prev || []));
    queryClient.setQueryData<any[]>(qk.notifications(uid), prev => patch(prev || []));
  };

  const markAsRead = async (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    try {
      const res = await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id })
      });
      const data = await res.json();
      if (data.success) {
        patchCachedNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: 1 } : n));
        try {
          if (typeof window !== "undefined" && "BroadcastChannel" in window) {
            const bc = new BroadcastChannel("fp_realtime_channel");
            bc.postMessage({ domain: "notifications", action: "marked_read", payload: { id } });
            bc.close();
          }
        } catch (_) {}
      }
    } catch (e) {
      toast("Failed to update status", "error");
    }
  };

  const markAllAsRead = async () => {
    try {
      const res = await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, markAllRead: true })
      });
      const data = await res.json();
      if (data.success) {
        patchCachedNotifications(prev => prev.map(n => ({ ...n, is_read: 1 })));
        try {
          if (typeof window !== "undefined" && "BroadcastChannel" in window) {
            const bc = new BroadcastChannel("fp_realtime_channel");
            bc.postMessage({ domain: "notifications", action: "all_marked_read", payload: { userId } });
            bc.close();
          }
        } catch (_) {}
        toast("All marked as read", "success");
      }
    } catch (e) {
      toast("Failed to update status", "error");
    }
  };

  React.useEffect(() => {
    if (!userId) return;
    let bc: BroadcastChannel | null = null;
    try {
      if (typeof window !== "undefined" && "BroadcastChannel" in window) {
        bc = new BroadcastChannel("fp_realtime_channel");
        bc.onmessage = (event) => {
          if (event.data?.domain === "notifications") {
            if (event.data?.action === "created") {
              queryClient.invalidateQueries({ queryKey: qk.notificationsFull(userId) });
              if (event.data?.payload?.title) {
                sendDeviceSystemNotification({
                  title: event.data.payload.title,
                  message: event.data.payload.message,
                  link: event.data.payload.link,
                  tag: event.data.payload.id || (Array.isArray(event.data.payload.notificationIds) ? event.data.payload.notificationIds[0] : undefined),
                });
              }
            } else if (event.data?.action === "all_marked_read") {
              patchCachedNotifications((prev) => prev.map((n) => ({ ...n, is_read: 1 })));
            } else if (event.data?.action === "marked_read" && event.data?.payload?.id) {
              patchCachedNotifications((prev) =>
                prev.map((n) => (n.id === event.data.payload.id ? { ...n, is_read: 1 } : n))
              );
            }
          }
        };
      }
    } catch (_) {}

    return () => {
      if (bc) bc.close();
    };
  }, [userId, queryClient]);

  const resolveTarget = (n: any) => {
    const target = resolveNotificationDestination(n, portalType);
    if (!target) return null;
    return { ...target, icon: ACTION_ICONS[target.action] };
  };

  const handleNotificationAction = (n: any) => {
    const target = resolveTarget(n);
    if (!n.is_read) {
      markAsRead(n.id);
    }

    if (!target) return;

    if (target.isExternal) {
      if (typeof window !== "undefined") {
        window.open(target.url, "_blank", "noopener,noreferrer");
      }
      return;
    }

    if (typeof window !== "undefined") {
      try {
        sessionStorage.setItem("fp_notif_target", JSON.stringify({
          url: target.url,
          date: target.targetDate,
          title: n.title,
          message: n.message,
          timestamp: Date.now()
        }));
      } catch (_) {}

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

  if (!userId) return null;
  if (loading) return <div className="p-12 text-center text-xs text-slate-400 font-bold">Loading notification activity…</div>;

  const unreadCount = notifications.filter(n => !n.is_read).length;

  return (
    <div className="max-w-4xl mx-auto p-4 md:p-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl shadow-card border border-slate-100">
        <div className="flex items-center gap-3.5">
          <div className="p-2.5 bg-indigo-50 border border-indigo-100 rounded-xl text-indigo-600 shadow-2xs">
            <Bell className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-lg font-black text-slate-900 tracking-tight flex items-center gap-2">
              Notification Activity Feed
              {unreadCount > 0 && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-rose-50 text-rose-700 border border-rose-200">
                  {unreadCount} Unread
                </span>
              )}
            </h1>
            <p className="text-xs text-slate-500 font-medium mt-0.5">
              Real-time alerts, class schedule changes, approvals, and system notifications.
            </p>
          </div>
        </div>

        {unreadCount > 0 && (
          <button
            type="button"
            className="px-3.5 py-1.5 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 rounded-xl transition-all text-xs font-bold shadow-2xs flex items-center gap-1.5 cursor-pointer self-start sm:self-auto"
            onClick={markAllAsRead}
          >
            <CheckCheck className="w-3.5 h-3.5 text-indigo-600" />
            Mark All as Read
          </button>
        )}
      </div>

      {/* Device Notification Alert Banner */}
      {deviceNotifStatus !== "granted" && !hidePermissionBanner && (
        <div className="bg-gradient-to-r from-indigo-50 to-blue-50 border border-indigo-100 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs relative">
          <button
            type="button"
            onClick={handleHidePermissionBanner}
            className="absolute top-2 right-2 text-indigo-400 hover:text-indigo-600 p-1 rounded-lg hover:bg-white/50 transition-colors"
            title="Don't show again"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-indigo-600 text-white flex items-center justify-center shrink-0 shadow-xs">
              <Bell className="h-4.5 w-4.5 animate-bounce" />
            </div>
            <div>
              <p className="text-xs font-bold text-indigo-950">Enable Desktop & Mobile Notifications</p>
              <p className="text-[11px] text-indigo-700/80">
                Receive instant alerts on your screen even when the app is in the background or minimized.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleEnableDeviceNotifs}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow-xs transition-all cursor-pointer self-start sm:self-auto shrink-0"
          >
            Enable Device Alerts
          </button>
        </div>
      )}

      {notifications.length === 0 ? (
        <div className="bg-white rounded-2xl shadow-card border border-slate-100 p-16 text-center space-y-3">
          <div className="h-12 w-12 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-center mx-auto text-slate-300">
            <Bell className="w-6 h-6" />
          </div>
          <h3 className="text-sm font-bold text-slate-700">No Notifications</h3>
          <p className="text-xs text-slate-400 max-w-sm mx-auto">
            You&apos;re completely up to date. Activity alerts and schedule updates will show up here.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {notifications.map(n => {
            const target = resolveTarget(n);
            const ActionIcon = target?.icon || ArrowRight;

            return (
              <div
                key={n.id}
                onClick={() => handleNotificationAction(n)}
                className={`p-4 md:p-5 rounded-2xl border transition-all flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 cursor-pointer group ${
                  n.is_read
                    ? "bg-white border-slate-200/80 hover:border-indigo-300"
                    : "bg-indigo-50/40 border-indigo-200/80 hover:border-indigo-400"
                }`}
              >
                <div className="flex-1 space-y-1">
                  <div className="flex items-center gap-2">
                    {!n.is_read && (
                      <span className="h-2 w-2 rounded-full bg-indigo-600 shrink-0" />
                    )}
                    <h3 className={`text-sm font-black tracking-tight ${n.is_read ? "text-slate-800" : "text-indigo-950"}`}>
                      {n.title}
                    </h3>
                  </div>
                  <p className="text-xs text-slate-600 font-medium leading-relaxed">
                    {n.message}
                  </p>
                  <div className="flex items-center gap-2 text-[10px] text-slate-400 font-semibold pt-1">
                    <Clock className="w-3 h-3" />
                    <span>{new Date(n.created_at).toLocaleString()}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2.5 shrink-0 self-end sm:self-center">
                  {target && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleNotificationAction(n);
                      }}
                      className="px-3 py-1.5 rounded-xl text-xs font-bold bg-white group-hover:bg-indigo-600 group-hover:text-white border border-slate-200 group-hover:border-indigo-600 text-slate-700 transition-all flex items-center gap-1.5 shadow-2xs cursor-pointer"
                    >
                      <span>{target.actionLabel}</span>
                      <ActionIcon className="w-3.5 h-3.5" />
                    </button>
                  )}

                  {!n.is_read ? (
                    <button
                      type="button"
                      onClick={(e) => markAsRead(n.id, e)}
                      className="text-slate-400 hover:text-indigo-600 p-1.5 rounded-lg hover:bg-white/80 transition-colors"
                      title="Mark as read"
                    >
                      <Circle className="w-4 h-4" />
                    </button>
                  ) : (
                    <div className="text-emerald-500 p-1.5" title="Read">
                      <CheckCircle2 className="w-4 h-4" />
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

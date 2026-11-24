"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useApp } from "@/context/AppContext";
import { apiFetch } from "@/lib/apiFetch";
import { resolveNotificationDestination } from "@/lib/notificationTarget";

export default function OpenNotificationPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { isLoading, currentUser, currentRole, currentMentor, currentCAM, currentKAM, currentAdmin, currentStudent, currentSME, currentHR } = useApp();
  const [message, setMessage] = useState("Opening notification…");
  const notificationId = decodeURIComponent(String(params?.id || ""));
  const userId = useMemo(() => String(
    currentUser?.reference_id || currentUser?.id || currentMentor?.id || currentCAM?.id ||
    currentKAM?.id || currentAdmin?.id || currentStudent?.id || currentSME?.id || currentHR?.id || ""
  ), [currentUser, currentMentor, currentCAM, currentKAM, currentAdmin, currentStudent, currentSME, currentHR]);

  useEffect(() => {
    if (isLoading || !userId || !notificationId) return;
    let cancelled = false;
    const open = async () => {
      try {
        const data = await apiFetch<any>(`/api/notifications?user_id=${encodeURIComponent(userId)}&notification_id=${encodeURIComponent(notificationId)}`);
        const notification = data?.notifications?.[0];
        if (!notification) {
          if (!cancelled) setMessage("This notification is no longer available.");
          return;
        }

        if (!notification.is_read) {
          await apiFetch("/api/notifications", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: { notification_id: notification.id, action: "mark_read" },
          }).catch(() => null);
        }

        const destination = resolveNotificationDestination(notification, currentRole);
        if (!destination || cancelled) return;
        if (destination.isExternal) window.location.assign(destination.url);
        else router.replace(destination.url);
      } catch {
        if (!cancelled) setMessage("Could not open this notification. Return to your workspace and try again.");
      }
    };
    void open();
    return () => { cancelled = true; };
  }, [isLoading, userId, notificationId, currentRole, router]);

  return <main className="min-h-screen grid place-items-center bg-slate-50 p-6 text-sm font-semibold text-slate-600">{message}</main>;
}

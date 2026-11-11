"use client";

import { useApp } from "@/context/AppContext";
import { DashboardLayout } from "@/components/DashboardLayout";
import { NotificationsView } from "@/components/NotificationsView";

export default function CmNotificationsPage() {
  const { currentCAM, currentUser } = useApp();
  const effectiveUserId = currentCAM?.id || currentUser?.reference_id || currentUser?.id || "cm_user";

  return (
    <DashboardLayout requiredRole="cm">
      <div className="p-4 md:p-8 min-h-dvh bg-gray-50/50">
        <NotificationsView userId={effectiveUserId} portalType="cm" />
      </div>
    </DashboardLayout>
  );
}

"use client";

import { useApp } from "@/context/AppContext";
import { DashboardLayout } from "@/components/DashboardLayout";
import { NotificationsView } from "@/components/NotificationsView";
import { RedirectingLoader } from "@/components/RedirectingLoader";

export default function MentorNotificationsPage() {
  const { currentMentor } = useApp();
  
  if (!currentMentor) return <RedirectingLoader label="Authenticating..." />;

  return (
    <DashboardLayout requiredRole="mentor">
      <div className="p-4 md:p-8 min-h-dvh bg-gray-50/50">
        <NotificationsView userId={currentMentor.id} portalType="mentor" />
      </div>
    </DashboardLayout>
  );
}

"use client";

import { useApp } from "@/context/AppContext";
import { DashboardLayout } from "@/components/DashboardLayout";
import { NotificationsView } from "@/components/NotificationsView";
import { RedirectingLoader } from "@/components/RedirectingLoader";

export default function StudentNotificationsPage() {
  const { currentStudent } = useApp();
  
  if (!currentStudent) return <RedirectingLoader label="Authenticating..." />;

  return (
    <DashboardLayout requiredRole="student">
      <div className="p-4 md:p-8 min-h-dvh bg-gray-50/50">
        <NotificationsView userId={currentStudent.id} portalType="student" />
      </div>
    </DashboardLayout>
  );
}

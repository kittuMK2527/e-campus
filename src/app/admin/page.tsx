"use client";

import { useState, useCallback } from "react";
import dynamic from "next/dynamic";
import { DashboardLayout } from "@/components/DashboardLayout";
import { TabPageLoader } from "@/components/TabPageLoader";

const AdminDashboard = dynamic(() => import("@/components/AdminDashboard").then(m => m.AdminDashboard), {
  ssr: false,
  loading: () => <TabPageLoader message="Loading Admin Central…" />
});

export default function AdminIndexPage() {
  const [activeTab, setActiveTab] = useState<string>("overview");

  const handleTabChange = useCallback((newTab: string) => {
    setActiveTab(newTab);
    if (typeof window !== "undefined") {
      const cleanTab = newTab.split("?")[0];
      const targetUrl = `/admin/${cleanTab}`;
      if (window.location.pathname !== targetUrl) {
        window.history.pushState(null, "", targetUrl);
      }
    }
  }, []);

  return (
    <DashboardLayout requiredRole="admin">
      <AdminDashboard
        activeTab={activeTab as any}
        onTabChange={handleTabChange}
      />
    </DashboardLayout>
  );
}

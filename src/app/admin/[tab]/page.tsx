"use client";

import { useState, useEffect, useCallback } from "react";
import dynamic from "next/dynamic";
import { useParams } from "next/navigation";
import { DashboardLayout } from "@/components/DashboardLayout";
import { TabPageLoader } from "@/components/TabPageLoader";

const AdminDashboard = dynamic(() => import("@/components/AdminDashboard").then(m => m.AdminDashboard), {
  ssr: false,
  loading: () => <TabPageLoader message="Loading Admin Central…" />
});

const normalizeAdminTab = (t: string): string => {
  if (t === "schedule") return "schedules";
  if (t === "exams") return "examinations";
  if (t === "tasks") return "mentor_tasks";
  if (t === "approvals") return "oversight";
  return t;
};

export default function AdminTabPage() {
  const params = useParams();
  const rawTab = (params?.tab as string) || "overview";
  const routeTab = normalizeAdminTab(rawTab);
  const [activeTab, setActiveTab] = useState<string>(routeTab);

  useEffect(() => {
    if (routeTab) setActiveTab(routeTab);
  }, [routeTab]);

  useEffect(() => {
    const onPopState = () => {
      const parts = window.location.pathname.split("/").filter(Boolean);
      const tabFromUrl = normalizeAdminTab(parts[1] || "overview");
      setActiveTab(tabFromUrl);
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

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

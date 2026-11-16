"use client";

import { useState, useEffect, useCallback } from "react";
import dynamic from "next/dynamic";
import { useParams } from "next/navigation";
import { DashboardLayout } from "@/components/DashboardLayout";
import { TabPageLoader } from "@/components/TabPageLoader";

const CAMDashboard = dynamic(() => import("@/components/CAMDashboard").then(m => m.CAMDashboard), {
  ssr: false,
  loading: () => <TabPageLoader message="Loading CM Dashboard…" />
});

const normalizeCmTab = (t: string): string => {
  if (t === "schedule") return "timetable";
  if (t === "daily_config" || t === "daily-configs") return "config";
  if (t === "leave-approvals" || t === "leaves" || t === "requests") return "handovers";
  if (t === "weekly-plan") return "faculty_weekly_plan";
  if (t === "academic-tracker") return "academic_tracker";
  if (t === "exams" || t === "marks") return "exams_and_marks";
  return t;
};

export default function CAMTabPage() {
  const params = useParams();
  const rawTab = (params?.tab as string) || "overview";
  const routeTab = normalizeCmTab(rawTab);
  const [activeTab, setActiveTab] = useState<string>(routeTab);

  useEffect(() => {
    if (routeTab) setActiveTab(routeTab);
  }, [routeTab]);

  useEffect(() => {
    const onPopState = () => {
      const parts = window.location.pathname.split("/").filter(Boolean);
      const tabFromUrl = normalizeCmTab(parts[1] || "overview");
      setActiveTab(tabFromUrl);
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const handleTabChange = useCallback((newTab: string) => {
    setActiveTab(newTab);
    if (typeof window !== "undefined") {
      const cleanTab = newTab.split("?")[0];
      const targetUrl = `/cm/${cleanTab}`;
      if (window.location.pathname !== targetUrl) {
        window.history.pushState(null, "", targetUrl);
      }
    }
  }, []);

  return (
    <DashboardLayout requiredRole="cm">
      <CAMDashboard
        activeTab={activeTab as any}
        onTabChange={handleTabChange}
      />
    </DashboardLayout>
  );
}

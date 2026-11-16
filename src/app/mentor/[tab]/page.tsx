"use client";

import { useState, useEffect, useCallback } from "react";
import dynamic from "next/dynamic";
import { useParams } from "next/navigation";
import { DashboardLayout } from "@/components/DashboardLayout";
import { TabPageLoader } from "@/components/TabPageLoader";

const MentorDashboard = dynamic(() => import("@/components/MentorDashboard").then(m => m.MentorDashboard), {
  ssr: false,
  loading: () => <TabPageLoader message="Loading Mentor Workspace…" />
});

const normalizeMentorTab = (t: string): string => {
  if (t === "schedule") return "timetable";
  if (t === "approvals" || t === "leaves" || t === "handover") return "handovers";
  if (t === "weekly-plan") return "weekly_plan";
  if (t === "academic-tracker") return "academic_tracker";
  if (t === "my-skill-tracker" || t === "skill-tracker") return "my_skill_tracker";
  if (t === "marks") return "exams";
  return t;
};

export default function MentorTabPage() {
  const params = useParams();
  const rawTab = (params?.tab as string) || "home";
  const routeTab = normalizeMentorTab(rawTab);
  const [activeTab, setActiveTab] = useState<string>(routeTab);

  useEffect(() => {
    if (routeTab) setActiveTab(routeTab);
  }, [routeTab]);

  useEffect(() => {
    const onPopState = () => {
      const parts = window.location.pathname.split("/").filter(Boolean);
      const tabFromUrl = normalizeMentorTab(parts[1] || "home");
      setActiveTab(tabFromUrl);
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const handleTabChange = useCallback((newTab: string) => {
    setActiveTab(newTab);
    if (typeof window !== "undefined") {
      const cleanTab = newTab.split("?")[0];
      const targetUrl = `/mentor/${cleanTab}`;
      if (window.location.pathname !== targetUrl) {
        window.history.pushState(null, "", targetUrl);
      }
    }
  }, []);

  return (
    <DashboardLayout requiredRole="mentor">
      <MentorDashboard
        activeTab={activeTab as any}
        onTabChange={handleTabChange}
      />
    </DashboardLayout>
  );
}

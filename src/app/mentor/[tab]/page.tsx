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
  if (t === "approvals" || t === "leaves" || t === "leave" || t === "leave-approvals" || t === "leave_requests" || t === "handover") return "handovers";
  if (t === "weekly-plan" || t === "weeklyplan") return "weekly_plan";
  if (t === "academic-tracker" || t === "syllabus-tracker" || t === "syllabus") return "academic_tracker";
  if (t === "my-skill-tracker" || t === "skill-tracker" || t === "clearance" || t === "my-clearance") return "my_skill_tracker";
  if (t === "marks" || t === "exam-marks") return "exams";
  if (t === "student-log" || t === "studentlog" || t === "logs") return "student_log";
  if (t === "demo-evaluations" || t === "my-lnd" || t === "lnd" || t === "demos") return "demo_evaluations";
  if (t === "skill-matrix" || t === "matrix" || t === "student-tracker") return "tracker";
  if (t === "study-materials" || t === "materials-hub") return "materials";
  if (t === "more" || t === "more-menu") return "more_menu";
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

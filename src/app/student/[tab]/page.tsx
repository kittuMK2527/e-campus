"use client";

import { useState, useEffect, useCallback } from "react";
import dynamic from "next/dynamic";
import { useParams } from "next/navigation";
import { DashboardLayout } from "@/components/DashboardLayout";
import { TabPageLoader } from "@/components/TabPageLoader";

const StudentDashboard = dynamic(() => import("@/components/StudentDashboard").then(m => m.StudentDashboard), {
  ssr: false,
  loading: () => <TabPageLoader message="Loading Student Portal…" />
});

const VALID_STUDENT_TABS = [
  "dashboard",
  "schedule",
  "interviews",
  "tracker",
  "exams",
  "materials",
  "library",
  "fees",
  "on_duty",
  "profile",
  "more_menu"
] as const;

type StudentTab = (typeof VALID_STUDENT_TABS)[number];

export default function StudentTabPage() {
  const params = useParams();
  const rawTab = params?.tab as string;
  const initialTab: StudentTab = rawTab === "marks"
    ? "exams"
    : VALID_STUDENT_TABS.includes(rawTab as StudentTab)
    ? (rawTab as StudentTab)
    : "dashboard";

  const [activeTab, setActiveTab] = useState<StudentTab>(initialTab);

  useEffect(() => {
    if (rawTab) {
      const resolved = rawTab === "marks" ? "exams" : (VALID_STUDENT_TABS.includes(rawTab as StudentTab) ? (rawTab as StudentTab) : "dashboard");
      setActiveTab(resolved);
    }
  }, [rawTab]);

  useEffect(() => {
    const onPopState = () => {
      const parts = window.location.pathname.split("/").filter(Boolean);
      const rawFromUrl = parts[1] || "dashboard";
      const resolved = rawFromUrl === "marks" ? "exams" : (VALID_STUDENT_TABS.includes(rawFromUrl as StudentTab) ? (rawFromUrl as StudentTab) : "dashboard");
      setActiveTab(resolved);
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const handleTabChange = useCallback((newTab: string) => {
    if (newTab.includes("?")) {
      window.location.href = `/student/${newTab}`;
      return;
    }
    const resolved = newTab === "marks" ? "exams" : (VALID_STUDENT_TABS.includes(newTab as StudentTab) ? (newTab as StudentTab) : (newTab as StudentTab));
    setActiveTab(resolved);
    if (typeof window !== "undefined") {
      const cleanTab = newTab.split("?")[0];
      const targetUrl = `/student/${cleanTab}`;
      if (window.location.pathname !== targetUrl) {
        window.history.pushState(null, "", targetUrl);
      }
    }
  }, []);

  return (
    <DashboardLayout requiredRole="student">
      <StudentDashboard
        activeTab={activeTab}
        onTabChange={handleTabChange}
      />
    </DashboardLayout>
  );
}

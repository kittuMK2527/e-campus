"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import { DashboardLayout } from "@/components/DashboardLayout";
import { FeeManagerDashboard } from "@/components/FeeManagerDashboard";
import { resolveFeeManagerTab } from "@/lib/utils";

export default function FeeManagerTabPage() {
  const params = useParams();
  const routeTab = resolveFeeManagerTab(params?.tab);
  const [activeTab, setActiveTab] = useState(routeTab);

  useEffect(() => {
    if (routeTab) setActiveTab(routeTab);
  }, [routeTab]);

  useEffect(() => {
    const onPopState = () => {
      const parts = window.location.pathname.split("/").filter(Boolean);
      const tabFromUrl = resolveFeeManagerTab(parts[1]);
      setActiveTab(tabFromUrl);
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const handleTabChange = useCallback((newTab: string) => {
    const cleanTab = resolveFeeManagerTab(newTab.split("?")[0]);
    setActiveTab(cleanTab);
    if (typeof window !== "undefined") {
      const targetUrl = `/fee-manager/${cleanTab}`;
      if (window.location.pathname !== targetUrl) {
        window.history.pushState(null, "", targetUrl);
      }
    }
  }, []);

  return (
    <DashboardLayout requiredRole="fee_manager">
      <FeeManagerDashboard
        activeTab={activeTab}
        onTabChange={handleTabChange}
      />
    </DashboardLayout>
  );
}

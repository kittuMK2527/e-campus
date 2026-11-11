"use client";

import React, { useMemo } from "react";
import dynamic from "next/dynamic";
import { useApp } from "@/context/AppContext";
import { isSuperAdminSession } from "@/lib/superadmin";

// Lazy-loaded: the full CAM dashboard is the KAM view's entire body, but keeping
// it dynamic lets the route-level loader paint first and splits the chunk.
const CAMDashboard = dynamic(() => import("./CAMDashboard").then(m => m.CAMDashboard), {
  ssr: false,
  loading: () => (
    <div className="flex-1 flex items-center justify-center p-16 text-slate-400 font-bold text-sm">
      <div className="flex items-center gap-2">
        <span className="h-4 w-4 rounded-full border-2 border-zinc-900 dark:border-amber-500 border-t-transparent animate-spin" />
        <span>Loading KAM Portfolio…</span>
      </div>
    </div>
  )
});

export interface KAMDashboardProps {
  activeTab?: string;
  onTabChange?: (tab: string) => void;
}

export function KAMDashboard({ activeTab = "overview", onTabChange }: KAMDashboardProps = {}) {
  const { colleges: rawColleges, currentKAM } = useApp();

  // Server-issued super-admin session flag (users.role === "admin") — no hardcoded identity
  const isSuperAdmin = isSuperAdminSession();

  // Filter colleges strictly to those assigned to this KAM
  const assignedCollegeIds = useMemo(() => {
    if (isSuperAdmin || !currentKAM?.id) {
      return rawColleges.map(c => c.id);
    }
    return rawColleges
      .filter(c => c.kam_id === currentKAM.id || (c as any).kamId === currentKAM.id)
      .map(c => c.id);
  }, [rawColleges, currentKAM?.id, isSuperAdmin]);

  return (
    <CAMDashboard
      activeTab={activeTab as any}
      onTabChange={onTabChange as any}
      isKAMView={true}
      allowedCollegeIds={assignedCollegeIds}
      readOnly={true}
    />
  );
}

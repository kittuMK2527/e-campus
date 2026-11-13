"use client";

import React, { Suspense } from "react";
import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import { DashboardLayout } from "@/components/DashboardLayout";

const SMEDashboard = dynamic(() => import("@/components/SMEDashboard").then(m => m.SMEDashboard), {
  ssr: false,
  loading: () => (
    <div className="flex-1 flex items-center justify-center p-12 text-slate-400 font-bold text-sm">
      <div className="flex items-center gap-2">
        <span className="h-4 w-4 rounded-full border-2 border-indigo-600 border-t-transparent animate-spin" />
        <span>Loading SME Evaluation Hub…</span>
      </div>
    </div>
  )
});

function SMEPortalContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryTab = searchParams?.get("tab");

  return (
    <SMEDashboard
      activeTab={(queryTab as any) || undefined}
      onTabChange={(newTab) => {
        router.push(`/sme/${newTab}`);
      }}
    />
  );
}

export default function SMEPortalPage() {
  return (
    <DashboardLayout requiredRole="sme">
      <Suspense fallback={
        <div className="flex-1 flex items-center justify-center p-12 text-slate-400 font-bold text-sm">
          <div className="flex items-center gap-2">
            <span className="h-4 w-4 rounded-full border-2 border-indigo-600 border-t-transparent animate-spin" />
            <span>Loading SME Evaluation Hub…</span>
          </div>
        </div>
      }>
        <SMEPortalContent />
      </Suspense>
    </DashboardLayout>
  );
}

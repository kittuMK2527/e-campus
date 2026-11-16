"use client";

import dynamic from "next/dynamic";
import { DashboardLayout } from "@/components/DashboardLayout";

const LndAllocationDashboard = dynamic(
  () => import("@/components/LndAllocationDashboard").then(m => m.LndAllocationDashboard),
  {
    ssr: false,
    loading: () => (
      <div className="flex-1 flex items-center justify-center p-12 text-slate-400 font-bold text-sm">
        <div className="flex items-center gap-2">
          <span className="h-4 w-4 rounded-full border-2 border-amber-500 border-t-transparent animate-spin" />
          <span>Loading Learning and Development Portal…</span>
        </div>
      </div>
    )
  }
);

/**
 * Single L&D workspace shell shared by every supported URL: /l-and-d (canonical),
 * /ld and /allocator (legacy spellings kept as first-class routes). Rendering rather
 * than redirecting matters here — a redirect to a route the deployed build lacks
 * leaves the user on a not-found page with no way back into their workspace.
 */
export function LndPortalShell() {
  return (
    <DashboardLayout requiredRole="L and D">
      <LndAllocationDashboard />
    </DashboardLayout>
  );
}

export default LndPortalShell;

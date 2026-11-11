"use client";

import { useParams, useRouter } from "next/navigation";
import { DashboardLayout } from "@/components/DashboardLayout";
import { SMEDashboard } from "@/components/SMEDashboard";
import { resolveSmeTab } from "@/lib/utils";

export default function SMETabPage() {
  const params = useParams();
  const router = useRouter();
  const tab = resolveSmeTab(params.tab);

  return (
    <DashboardLayout requiredRole="sme">
      <SMEDashboard
        activeTab={tab}
        onTabChange={(newTab) => router.push(`/sme/${newTab}`)}
      />
    </DashboardLayout>
  );
}

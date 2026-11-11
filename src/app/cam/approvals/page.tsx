"use client";

import { DashboardLayout } from "@/components/DashboardLayout";
import { CMApprovalsHub } from "@/components/CMApprovalsHub";

export default function CAMApprovalsPage() {
  return (
    <DashboardLayout requiredRole="cm">
      <CMApprovalsHub />
    </DashboardLayout>
  );
}

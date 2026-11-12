"use client";

import React from "react";
import { Users, Code2, AlertTriangle, FileCheck } from "lucide-react";
import { KAMKpiCard } from "../shared/KAMKpiCard";

export interface StudentsInfographicsProps {
  totalStudentsCount: number;
  skillSubmissionRate?: number;
  atRiskCount?: number;
  pendingEditsCount?: number;
}

export const KAMStudentsInfographics: React.FC<StudentsInfographicsProps> = ({
  totalStudentsCount,
  skillSubmissionRate = 88.6,
  atRiskCount = 14,
  pendingEditsCount = 0
}) => {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <KAMKpiCard
        label="Enrolled Students"
        value={totalStudentsCount.toLocaleString()}
        badge={{ text: "Active", type: "neutral" }}
        icon={Users}
        accentColor="indigo"
      />
      <KAMKpiCard
        label="Skill Submissions"
        value={`${skillSubmissionRate}%`}
        badge={{ text: "Weekly", type: "positive" }}
        icon={Code2}
        accentColor="emerald"
      />
      <KAMKpiCard
        label="Attendance Risk"
        value={atRiskCount}
        badge={{
          text: atRiskCount > 0 ? "Review" : "Clean",
          type: atRiskCount > 0 ? "warning" : "positive"
        }}
        icon={AlertTriangle}
        accentColor="rose"
      />
      <KAMKpiCard
        label="Profile Verifications"
        value={pendingEditsCount}
        badge={{
          text: pendingEditsCount > 0 ? "Queue" : "Zero",
          type: pendingEditsCount > 0 ? "warning" : "neutral"
        }}
        icon={FileCheck}
        accentColor="zinc"
      />
    </div>
  );
};


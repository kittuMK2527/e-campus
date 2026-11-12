"use client";

import React from "react";
import { GraduationCap, ArrowLeftRight, CalendarCheck2, Users2 } from "lucide-react";
import { KAMKpiCard } from "../shared/KAMKpiCard";

export interface FacultyInfographicsProps {
  activeFacultyCount: number;
  openSwapsCount: number;
  weeklyPlanSubmissionRate?: number;
  deployedDepartmentsCount?: number;
}

export const KAMFacultyInfographics: React.FC<FacultyInfographicsProps> = ({
  activeFacultyCount,
  openSwapsCount,
  weeklyPlanSubmissionRate = 96.4,
  deployedDepartmentsCount = 8
}) => {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <KAMKpiCard
        label="Deployed Faculty"
        value={activeFacultyCount}
        badge={{ text: "100%", type: "positive" }}
        icon={GraduationCap}
        accentColor="indigo"
      />
      <KAMKpiCard
        label="Cover & Swaps"
        value={openSwapsCount}
        badge={{
          text: openSwapsCount > 0 ? "Pending" : "Resolved",
          type: openSwapsCount > 0 ? "warning" : "positive"
        }}
        icon={ArrowLeftRight}
        accentColor="amber"
      />
      <KAMKpiCard
        label="Weekly Plan Rate"
        value={`${weeklyPlanSubmissionRate}%`}
        badge={{ text: "Verified", type: "positive" }}
        icon={CalendarCheck2}
        accentColor="emerald"
      />
      <KAMKpiCard
        label="Department Spread"
        value={deployedDepartmentsCount}
        badge={{ text: "Active", type: "neutral" }}
        icon={Users2}
        accentColor="zinc"
      />
    </div>
  );
};


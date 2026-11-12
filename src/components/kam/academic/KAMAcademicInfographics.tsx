"use client";

import React from "react";
import { BookOpen, CheckCircle2, TrendingUp, Award, Layers } from "lucide-react";
import { KAMKpiCard } from "../shared/KAMKpiCard";

export interface AcademicInfographicsProps {
  subjectsCount: number;
  departmentsCount?: number;
  syllabusPace?: number;
  deliveryCoverage?: number;
  scheduledExams?: number;
  passRate?: number;
}

export const KAMAcademicInfographics: React.FC<AcademicInfographicsProps> = ({
  subjectsCount,
  departmentsCount = 6,
  syllabusPace = 91.4,
  deliveryCoverage = 98.2,
  scheduledExams = 18,
  passRate = 94.8
}) => {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <KAMKpiCard
        label="Syllabus Completion"
        value={`${syllabusPace}%`}
        badge={{ text: "On Track", type: "positive" }}
        icon={TrendingUp}
        accentColor="emerald"
      />
      <KAMKpiCard
        label="Curriculum Modules"
        value={subjectsCount}
        badge={{ text: `${departmentsCount} Depts`, type: "neutral" }}
        icon={BookOpen}
        accentColor="indigo"
      />
      <KAMKpiCard
        label="Delivery Coverage"
        value={`${deliveryCoverage}%`}
        badge={{ text: "Active", type: "positive" }}
        icon={CheckCircle2}
        accentColor="amber"
      />
      <KAMKpiCard
        label="Institutional Pass Rate"
        value={`${passRate}%`}
        badge={{ text: `${scheduledExams} Exams`, type: "positive" }}
        icon={Award}
        accentColor="cyan"
      />
    </div>
  );
};


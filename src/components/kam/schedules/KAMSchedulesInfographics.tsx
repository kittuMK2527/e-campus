"use client";

import React from "react";
import { Clock, CalendarCheck, UserCheck, Video } from "lucide-react";
import { KAMKpiCard } from "../shared/KAMKpiCard";

export interface SchedulesInfographicsProps {
  conductedSlotsCount: number;
  totalScheduledSlotsCount?: number;
  liveLoggingRate?: number;
  interviewsCompleted?: number;
}

export const KAMSchedulesInfographics: React.FC<SchedulesInfographicsProps> = ({
  conductedSlotsCount,
  totalScheduledSlotsCount = 180,
  liveLoggingRate = 97.4,
  interviewsCompleted = 42
}) => {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <KAMKpiCard
        label="Conducted Periods"
        value={conductedSlotsCount}
        badge={{ text: "Logged", type: "positive" }}
        icon={CalendarCheck}
        accentColor="indigo"
      />
      <KAMKpiCard
        label="Attendance Logging"
        value={`${liveLoggingRate}%`}
        badge={{ text: "Real-time", type: "positive" }}
        icon={UserCheck}
        accentColor="emerald"
      />
      <KAMKpiCard
        label="Scheduled Periods"
        value={totalScheduledSlotsCount}
        badge={{ text: "Today", type: "neutral" }}
        icon={Clock}
        accentColor="zinc"
      />
      <KAMKpiCard
        label="Mock Interviews"
        value={interviewsCompleted}
        badge={{ text: "Active", type: "positive" }}
        icon={Video}
        accentColor="amber"
      />
    </div>
  );
};


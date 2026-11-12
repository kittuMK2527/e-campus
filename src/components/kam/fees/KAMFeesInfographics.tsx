"use client";

import React from "react";
import { IndianRupee, Percent, ShieldCheck, AlertCircle } from "lucide-react";
import { KAMKpiCard } from "../shared/KAMKpiCard";

export interface FeesInfographicsProps {
  totalTarget?: string;
  collectedAmount?: string;
  recoveryPercentage?: number;
  outstandingDues?: string;
}

export const KAMFeesInfographics: React.FC<FeesInfographicsProps> = ({
  totalTarget = "₹1.84 Cr",
  collectedAmount = "₹1.58 Cr",
  recoveryPercentage = 85.9,
  outstandingDues = "₹26 L"
}) => {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <KAMKpiCard
        label="Fee Target"
        value={totalTarget}
        badge={{ text: "Institutional", type: "neutral" }}
        icon={IndianRupee}
        accentColor="indigo"
      />
      <KAMKpiCard
        label="Collected"
        value={collectedAmount}
        badge={{ text: "Realized", type: "positive" }}
        icon={ShieldCheck}
        accentColor="emerald"
      />
      <KAMKpiCard
        label="Recovery Rate"
        value={`${recoveryPercentage}%`}
        badge={{ text: "On Target", type: "positive" }}
        icon={Percent}
        accentColor="amber"
      />
      <KAMKpiCard
        label="Outstanding Dues"
        value={outstandingDues}
        badge={{ text: "Follow-up", type: "warning" }}
        icon={AlertCircle}
        accentColor="rose"
      />
    </div>
  );
};


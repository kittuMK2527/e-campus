"use client";

import React from "react";
import { ShieldCheck, Ticket, CheckSquare2, AlertTriangle } from "lucide-react";
import { KAMKpiCard } from "../shared/KAMKpiCard";

export interface AuditInfographicsProps {
  complianceScore?: number;
  openTicketsCount?: number;
  resolvedObservationsCount?: number;
  criticalIssuesCount?: number;
}

export const KAMAuditInfographics: React.FC<AuditInfographicsProps> = ({
  complianceScore = 94.2,
  openTicketsCount = 3,
  resolvedObservationsCount = 18,
  criticalIssuesCount = 0
}) => {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <KAMKpiCard
        label="Compliance Score"
        value={`${complianceScore}%`}
        badge={{ text: "Grade A", type: "positive" }}
        icon={ShieldCheck}
        accentColor="emerald"
      />
      <KAMKpiCard
        label="Open Audit Tickets"
        value={openTicketsCount}
        badge={{
          text: openTicketsCount > 0 ? "Review" : "Clean",
          type: openTicketsCount > 0 ? "warning" : "positive"
        }}
        icon={Ticket}
        accentColor="amber"
      />
      <KAMKpiCard
        label="Observations Closed"
        value={resolvedObservationsCount}
        badge={{ text: "Resolved", type: "positive" }}
        icon={CheckSquare2}
        accentColor="indigo"
      />
      <KAMKpiCard
        label="Critical Flags"
        value={criticalIssuesCount}
        badge={{
          text: criticalIssuesCount === 0 ? "Zero" : "Immediate",
          type: criticalIssuesCount === 0 ? "positive" : "negative"
        }}
        icon={AlertTriangle}
        accentColor="rose"
      />
    </div>
  );
};


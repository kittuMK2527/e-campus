"use client";

import React from "react";
import { useApp } from "@/context/AppContext";
import LndLiveDemoTable from "./LndLiveDemoTable";

interface LndQueueTabProps {
  demoSessions?: any[];
  demoSwapRequests?: any[];
  demoReallocations?: any[];
  fetchDemoReallocations?: () => void;
  loadingReallocations?: boolean;
  reallocNotesMap?: Record<string, string>;
  setReallocNotesMap?: (updater: (prev: Record<string, string>) => Record<string, string>) => void;
  decidingReallocId?: string | null;
  decideDemoReallocation?: (requestId: string, decision: "approved" | "rejected") => Promise<void>;
  swapRequestsTab?: "pending" | "resolved";
  setSwapRequestsTab?: (tab: "pending" | "resolved") => void;
  resolveDemoSwap?: (id: string, decision: "approved" | "rejected") => Promise<{ success: boolean; message?: string }>;
  toast?: (m: string, k?: any) => void;
  refreshSessions?: () => Promise<any>;
}

export default function LndQueueTab({
  demoSessions: propDemoSessions,
  toast,
  refreshSessions
}: LndQueueTabProps) {
  const {
    demoSessions: contextDemoSessions,
    mentors,
    smes,
    colleges,
    subjectsList,
    deleteDemoSession,
    refreshData
  } = useApp();

  const sessionsToDisplay = propDemoSessions || contextDemoSessions || [];

  return (
    <div className="space-y-6">
      <LndLiveDemoTable
        demoSessions={sessionsToDisplay}
        mentors={mentors}
        smes={smes}
        colleges={colleges}
        subjectsList={subjectsList}
        deleteDemoSession={deleteDemoSession}
        refreshData={refreshSessions || refreshData}
      />
    </div>
  );
}

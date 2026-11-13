"use client";

import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { Panel } from "../Panel";

interface LndQueueTabProps {
  demoSessions: any[];
  demoSwapRequests: any[];
  demoReallocations: any[];
  fetchDemoReallocations: () => void;
  loadingReallocations: boolean;
  reallocNotesMap: Record<string, string>;
  setReallocNotesMap: (updater: (prev: Record<string, string>) => Record<string, string>) => void;
  decidingReallocId: string | null;
  decideDemoReallocation: (requestId: string, decision: "approved" | "rejected") => Promise<void>;
  swapRequestsTab: "pending" | "resolved";
  setSwapRequestsTab: (tab: "pending" | "resolved") => void;
  resolveDemoSwap: (id: string, decision: "approved" | "rejected") => Promise<{ success: boolean; message?: string }>;
  toast: (m: string, k?: any) => void;
}

export default function LndQueueTab({
  demoSessions,
  demoSwapRequests,
  demoReallocations,
  fetchDemoReallocations,
  loadingReallocations,
  reallocNotesMap,
  setReallocNotesMap,
  decidingReallocId,
  decideDemoReallocation,
  swapRequestsTab,
  setSwapRequestsTab,
  resolveDemoSwap,
  toast
}: LndQueueTabProps) {
  const [resolvingSwapId, setResolvingSwapId] = useState<string | null>(null);
  return (
    <Panel
      title="Reallocation Queue & Diagnostics"
    >
      <div className="space-y-6">
        {/* ── Session outcomes that need a decision, kept next to the lists they point at ── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="rounded-xl border border-rose-200/70 dark:border-rose-800/40 bg-rose-50/60 dark:bg-rose-950/20 p-3">
            <span className="text-[9.5px] font-black uppercase tracking-wider text-rose-700 dark:text-rose-300 block">
              Not Conducted Sessions
            </span>
            <span className="text-lg font-black leading-tight text-rose-900 dark:text-rose-200">
              {demoSessions.filter(d => d.status === "not_conducted").length}
            </span>
            <p className="text-[10px] font-semibold text-rose-700/80 dark:text-rose-300/80">
              Sessions requiring re-booking.
            </p>
          </div>
          <div className="rounded-xl border border-[#4F46E5]/25 bg-[#4F46E5]/5 dark:bg-[#4F46E5]/10 p-3">
            <span className="text-[9.5px] font-black uppercase tracking-wider text-[#4F46E5] dark:text-[#818CF8] block">
              Pending Head / SME Approval
            </span>
            <span className="text-lg font-black leading-tight text-slate-900 dark:text-white">
              {demoSwapRequests.filter((r: any) => r.status === "pending" || r.status === "pending_sme").length}
            </span>
            <p className="text-[10px] font-semibold text-slate-500 dark:text-slate-400">
              Swap proposals awaiting review.
            </p>
          </div>
        </div>

        {/* ── Leave-Driven L&D Reallocation Requests (L & D Approval) ── */}
        <div className="space-y-3">
          <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-2">
            <div className="flex items-center gap-2">
              <h3 className="text-xs font-black uppercase tracking-wider text-slate-700 dark:text-slate-300">Leave-driven L&D Reallocations</h3>
              <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 text-[9.5px] font-black uppercase border border-amber-200 dark:border-amber-800">
                {demoReallocations.filter(r => r.status === "pending").length} Pending Approval
              </span>
            </div>
            <button
              onClick={fetchDemoReallocations}
              className="p-1.5 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-500 hover:text-[#4F46E5] hover:border-[#4F46E5]/40 transition-all cursor-pointer"
              title="Refresh"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loadingReallocations ? "animate-spin" : ""}`} />
            </button>
          </div>

          {demoReallocations.filter(r => r.status === "pending").length === 0 ? (
            <div className="text-center py-6 text-slate-400 font-bold text-xs border border-dashed border-slate-200 dark:border-slate-800 rounded-xl">
              No pending L&D reallocation requests. All clear!
            </div>
          ) : (
            demoReallocations.filter(r => r.status === "pending").map(req => (
              <div key={req.id} className="p-4 rounded-2xl bg-white/80 dark:bg-slate-900 border border-slate-100 dark:border-slate-800 space-y-3 shadow-card">
                <div className="flex flex-col md:flex-row md:items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-black text-slate-900 dark:text-white">{req.subject}</span>
                      <span className="px-1.5 py-0.5 rounded bg-[#4F46E5]/10 border border-[#4F46E5]/20 text-[#4F46E5] dark:text-[#818CF8] text-[9px] font-black uppercase">
                        Week {req.week ?? "—"}
                      </span>
                      <span className={`px-1.5 py-0.5 rounded border text-[9px] font-black uppercase ${req.request_kind === "reschedule"
                        ? "bg-indigo-50 dark:bg-indigo-950/40 border-indigo-200 text-indigo-700 dark:text-indigo-300"
                        : "bg-amber-100 dark:bg-amber-950/40 border border-amber-200 text-amber-800 dark:text-amber-300"
                        }`}>
                        {req.request_kind === "reschedule" ? "Mentor Reschedule Request" : req.request_kind === "sme_swap" ? "SME Reallocation" : "Mentor Leave Reallocation"}
                      </span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-[11px] font-medium text-slate-600 dark:text-slate-300">
                      <div>Applying Mentor: <span className="font-bold text-slate-800 dark:text-white">{req.mentor_name}</span></div>
                      <div>SME Evaluator: <span className="font-bold text-slate-800 dark:text-white">{req.sme_name}</span></div>
                      <div className="text-rose-600 dark:text-rose-400">
                        Original slot: <span className="font-bold">{req.original_date_str} • {req.original_time_slot}</span>
                      </div>
                      <div className="text-emerald-600 dark:text-emerald-400">
                        Proposed slot: <span className="font-bold">{req.proposed_date_str} • {req.proposed_time_slot}</span>
                      </div>
                    </div>
                    {req.reason && (
                      <p className="text-[10.5px] text-slate-500 italic">Reason: {req.reason}</p>
                    )}
                    <p className="text-[10px] text-slate-400">
                      Proposed by {req.proposed_by || req.mentor_name} • Target period is reserved (blocked for other bookings) until you decide.
                    </p>
                  </div>

                  <div className="shrink-0 flex flex-col gap-2 w-full md:w-64">
                    <input
                      type="text"
                      placeholder="Decision notes (optional)"
                      value={reallocNotesMap[req.id] || ""}
                      onChange={e => setReallocNotesMap(prev => ({ ...prev, [req.id]: e.target.value }))}
                      className="w-full px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-[11px] font-medium text-slate-800 dark:text-white focus:outline-none focus:border-[#4F46E5]"
                    />
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={decidingReallocId === req.id}
                        onClick={() => decideDemoReallocation(req.id, "rejected")}
                        className="flex-1 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-bold transition-all cursor-pointer disabled:opacity-50"
                      >
                        Reject
                      </button>
                      <button
                        type="button"
                        disabled={decidingReallocId === req.id}
                        onClick={() => decideDemoReallocation(req.id, "approved")}
                        className="btn-gradient flex-1 px-3.5 py-1.5 text-white rounded-xl text-xs font-extrabold shadow-xs transition-all cursor-pointer disabled:opacity-50"
                      >
                        {decidingReallocId === req.id ? "Working…" : "Approve Move"}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}

          {/* Resolved log */}
          {demoReallocations.filter(r => r.status !== "pending").length > 0 && (
            <details className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 py-3">
              <summary className="text-[11px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 cursor-pointer">
                Resolution Log ({demoReallocations.filter(r => r.status !== "pending").length})
              </summary>
              <div className="mt-2 divide-y divide-slate-100 dark:divide-slate-800">
                {demoReallocations.filter(r => r.status !== "pending").slice(0, 20).map(req => (
                  <div key={req.id} className="py-2 flex items-center justify-between gap-3 text-[11px]">
                    <span className="font-bold text-slate-700 dark:text-slate-200">{req.subject} — {req.mentor_name}</span>
                    <span className="text-slate-500 dark:text-slate-400">{req.original_date_str} → {req.proposed_date_str} • {req.proposed_time_slot}</span>
                    <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase ${req.status === "approved" ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300" : "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300"}`}>
                      {req.status}
                    </span>
                  </div>
                ))}
              </div>
            </details>
          )}
        </div>

        {/* Swap Requests Table */}
        <div className="space-y-3">
          <div className="flex border-b border-slate-200 dark:border-slate-800">
            <button
              type="button"
              onClick={() => setSwapRequestsTab("pending")}
              className={`pb-2 px-4 text-xs font-black uppercase tracking-wider border-b-2 transition-all cursor-pointer ${swapRequestsTab === "pending" ? "border-[#4F46E5] text-[#4F46E5]" : "border-transparent text-slate-400"
                }`}
            >
              Pending Review ({demoSwapRequests.filter((r: any) => r.status === "pending").length})
            </button>
            <button
              type="button"
              onClick={() => setSwapRequestsTab("resolved")}
              className={`pb-2 px-4 text-xs font-black uppercase tracking-wider border-b-2 transition-all cursor-pointer ${swapRequestsTab === "resolved" ? "border-[#4F46E5] text-[#4F46E5]" : "border-transparent text-slate-400"
                }`}
            >
              Resolution Logs ({demoSwapRequests.filter((r: any) => r.status !== "pending").length})
            </button>
          </div>

          <div className="space-y-3">
            {swapRequestsTab === "pending" ? (
              demoSwapRequests.filter((r: any) => r.status === "pending").length > 0 ? (
                demoSwapRequests.filter((r: any) => r.status === "pending").map((req: any) => (
                  <div key={req.id} className="p-4 rounded-xl bg-slate-50/80 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-black text-slate-900 dark:text-white">{req.smeName}</span>
                        <span className="px-2 py-0.5 bg-[#4F46E5]/10 text-[#4F46E5] rounded-md text-[9px] font-extrabold uppercase">
                          {(req.swapType === "mentor" || req.swapType === "internal") ? "Mentor Swap" : "Time Slot Swap"}
                        </span>
                      </div>
                      <p className="text-xs text-slate-600 dark:text-slate-300 font-semibold mt-1">
                        Original: {req.mentorName} ({req.dateStr} • {req.timeSlot})
                      </p>
                      <p className="text-xs font-bold text-[#4F46E5] mt-0.5">
                        Proposed: {(req.swapType === "mentor" || req.swapType === "internal") ? (req.proposedMentorName || req.targetMentorName) : `${req.proposedDateStr} • ${req.proposedTimeSlot}`}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        disabled={resolvingSwapId === req.id}
                        onClick={async () => {
                          if (resolvingSwapId) return;
                          setResolvingSwapId(req.id);
                          try {
                            const res = await resolveDemoSwap(req.id, "rejected");
                            if (res.success) toast("Swap request rejected.", "info");
                            else toast(res.message || "Failed to reject the swap request.", "error");
                          } finally {
                            setResolvingSwapId(null);
                          }
                        }}
                        className="px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-bold transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Reject
                      </button>
                      <button
                        disabled={resolvingSwapId === req.id}
                        onClick={async () => {
                          if (resolvingSwapId) return;
                          setResolvingSwapId(req.id);
                          try {
                            const res = await resolveDemoSwap(req.id, "approved");
                            if (res.success) toast("Swap approved and schedule updated!", "success");
                            else toast(res.message || "Failed to approve the swap request.", "error");
                          } finally {
                            setResolvingSwapId(null);
                          }
                        }}
                        className="btn-gradient px-4 py-1.5 text-white rounded-xl text-xs font-extrabold shadow-xs transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Approve Swap
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-10 text-slate-400 font-bold text-xs">
                  No pending swap requests found. All requests are up to date!
                </div>
              )
            ) : (
              <div className="text-center py-10 text-slate-400 font-bold text-xs">
                {demoSwapRequests.filter((r: any) => r.status !== "pending").length} resolved swap log records.
              </div>
            )}
          </div>
        </div>
      </div>
    </Panel>
  );
}

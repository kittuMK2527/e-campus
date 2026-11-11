"use client";

import React, { useState } from "react";
import { Check, CheckCircle, RefreshCw, X } from "lucide-react";
import { Dialog } from "../../ui/dialog";

/** Swap request resolution queue for mentor and evaluator proposals. */
export interface LndSwapRequestsModalProps {
  demoSwapRequests: any[];
  resolveDemoSwap: (...args: any[]) => any;
  setShowSwapRequestsModal: (v: any) => void;
  setSwapRequestsTab: (v: any) => void;
  showSwapRequestsModal: boolean;
  swapRequestsTab: string;
  toast: (m: string, k?: any) => void;
  validateProposedSwap: (...args: any[]) => any;
}

export default function LndSwapRequestsModal({
  demoSwapRequests,
  resolveDemoSwap,
  setShowSwapRequestsModal,
  setSwapRequestsTab,
  showSwapRequestsModal,
  swapRequestsTab,
  toast,
  validateProposedSwap
}: LndSwapRequestsModalProps) {
  const [resolvingSwapId, setResolvingSwapId] = useState<string | null>(null);
  return (
      <Dialog
        open={showSwapRequestsModal}
        onOpenChange={(next) => {
          if (!next) setShowSwapRequestsModal(false);
        }}
        ariaLabel="SME swap requests"
        overlayClassName="bg-slate-950/60 backdrop-blur-sm"
        panelClassName="max-w-2xl rounded-2xl p-6 space-y-5 overflow-hidden flex flex-col max-h-[85vh] bg-white dark:bg-slate-900"
      >
  
          <button
            onClick={() => setShowSwapRequestsModal(false)}
            aria-label="Close swap requests"
            className="absolute right-4 top-4 p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl text-slate-400 hover:text-slate-800 dark:hover:text-white transition-colors cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
  
          <div className="flex items-center gap-2 border-b border-slate-100 dark:border-slate-800 pb-3 shrink-0">
            <div className="p-1.5 rounded-lg bg-[#4F46E5]/10 text-[#4F46E5]">
              <RefreshCw className="h-4.5 w-4.5 animate-spin-slow" />
            </div>
            <div>
              <h3 className="text-sm font-black uppercase text-slate-900 dark:text-white tracking-wider">
                SME Swap Requests Queue
              </h3>
              <p className="text-[10px] text-slate-400 font-bold uppercase mt-0.5">
                Review, pre-validate, and approve alternative L&D matches
              </p>
            </div>
          </div>
  
          {/* TAB SELECTOR */}
          <div className="flex border-b border-slate-100 dark:border-slate-800 shrink-0">
            <button
              type="button"
              onClick={() => setSwapRequestsTab("pending")}
              className={`flex-1 pb-2.5 text-xs font-black uppercase tracking-wider text-center border-b-2 transition-all cursor-pointer ${swapRequestsTab === "pending" ? "border-[#4F46E5] text-[#4F46E5]" : "border-transparent text-slate-400"}`}
            >
              Pending Review ({demoSwapRequests.filter((r: any) => r.status === "pending").length})
            </button>
            <button
              type="button"
              onClick={() => setSwapRequestsTab("resolved")}
              className={`flex-1 pb-2.5 text-xs font-black uppercase tracking-wider text-center border-b-2 transition-all cursor-pointer ${swapRequestsTab === "resolved" ? "border-[#4F46E5] text-[#4F46E5]" : "border-transparent text-slate-400"}`}
            >
              Resolution Logs ({demoSwapRequests.filter((r: any) => r.status !== "pending").length})
            </button>
          </div>
  
          {/* CONTENT BODY */}
          <div className="flex-grow overflow-y-auto pr-1 space-y-4 py-1">
            {swapRequestsTab === "pending" ? (
              demoSwapRequests.filter((r: any) => r.status === "pending").length > 0 ? (
                demoSwapRequests.filter((r: any) => r.status === "pending").map((req: any) => {
                  const validation = validateProposedSwap(req);
                  return (
                    <div
                      key={req.id}
                      className="p-4 rounded-xl bg-slate-50/80 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 space-y-3.5"
                    >
                      <div className="flex items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-2">
                        <div>
                          <span className="text-[9px] font-black uppercase text-slate-400 block">Requester SME</span>
                          <span className="text-xs font-bold text-slate-800 dark:text-white">{req.smeName}</span>
                        </div>
                        <div className="text-right">
                          <span className="text-[9px] font-black uppercase text-slate-400 block">Proposed Action</span>
                          <span className="px-2 py-0.5 bg-[#4F46E5]/10 text-[#4F46E5] dark:text-[#818CF8] rounded-lg text-[9px] font-black uppercase">
                            {(req.swapType === "mentor" || req.swapType === "internal") ? "Change Mentor" : "Change Slot"}
                          </span>
                        </div>
                      </div>
  
                      {/* Details Grid */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                        <div className="p-3 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl space-y-1 shadow-card">
                          <span className="text-[8.5px] font-black uppercase text-slate-400 block mb-1">Original Session</span>
                          <p className="font-bold text-slate-700 dark:text-slate-200">{req.mentorName}</p>
                          <p className="text-[10px] text-slate-500">{req.dateStr} • {req.timeSlot}</p>
                          <p className="text-[9px] text-slate-400">{req.subject} • {req.stream}</p>
                        </div>
  
                        <div className="p-3 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl space-y-1 shadow-card">
                          <span className="text-[8.5px] font-black uppercase text-[#4F46E5] block mb-1">Proposed Match</span>
                          {(req.swapType === "mentor" || req.swapType === "internal") ? (
                            <>
                              <p className="font-bold text-[#4F46E5] dark:text-[#818CF8]">{req.proposedMentorName || req.targetMentorName}</p>
                              <p className="text-[10px] text-slate-500">{req.dateStr} • {req.timeSlot}</p>
                              <p className="text-[9px] text-slate-400">Replacing candidate faculty</p>
                            </>
                          ) : (
                            <>
                              <p className="font-bold text-[#4F46E5] dark:text-[#818CF8]">{req.mentorName}</p>
                              <p className="text-[10px] text-[#4F46E5] dark:text-[#818CF8] font-bold">{req.proposedDateStr} • {req.proposedTimeSlot}</p>
                              <p className="text-[9px] text-slate-400">Rescheduling date/time</p>
                            </>
                          )}
                        </div>
                      </div>
  
                      {/* Reason / Remarks */}
                      <div className="bg-white dark:bg-slate-900/60 p-3 rounded-2xl border border-slate-100 dark:border-slate-800 text-xs shadow-card">
                        <p className="text-[9.5px] text-slate-500 dark:text-slate-400"><strong>Reason:</strong> {req.reason}</p>
                        {req.remarks && (
                          <p className="text-[9.5px] text-slate-400 italic mt-1 font-medium">&quot;{req.remarks}&quot;</p>
                        )}
                      </div>
  
                      {/* Pre-validation & Resolve Actions */}
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
                        <div className="flex items-center gap-1.5">
                          {validation.valid ? (
                            <span className="px-2.5 py-1 bg-emerald-50 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-900 rounded-lg text-[10px] font-black uppercase flex items-center gap-1">
                              <Check className="h-3 w-3" />
                              Validated (No Conflicts)
                            </span>
                          ) : (
                            <span className="px-2.5 py-1 bg-rose-50 dark:bg-rose-950/20 text-rose-700 dark:text-rose-400 border border-rose-100 dark:border-rose-900 rounded-lg text-[10px] font-black uppercase flex items-center gap-1">
                              Clash: {validation.message}
                            </span>
                          )}
                        </div>
  
                        <div className="flex items-center gap-2">
                          <button
                            disabled={resolvingSwapId === req.id}
                            onClick={async () => {
                              if (resolvingSwapId) return;
                              setResolvingSwapId(req.id);
                              try {
                                const res = await resolveDemoSwap(req.id, "rejected");
                                if (res.success) {
                                  toast("Swap request rejected.", "success");
                                } else {
                                  toast(res.message || "Failed to reject the swap request.", "error");
                                }
                              } finally {
                                setResolvingSwapId(null);
                              }
                            }}
                            className="px-3.5 py-2 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-black transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            Reject Swap
                          </button>
                          <button
                            disabled={resolvingSwapId === req.id}
                            onClick={async () => {
                              if (resolvingSwapId) return;
                              setResolvingSwapId(req.id);
                              try {
                                const res = await resolveDemoSwap(req.id, "approved");
                                if (res.success) {
                                  toast("Swap approved and schedule updated!", "success");
                                } else {
                                  toast(res.message || "Failed to approve the swap request.", "error");
                                }
                              } finally {
                                setResolvingSwapId(null);
                              }
                            }}
                            className="btn-gradient px-4 py-2 text-white rounded-xl text-xs font-black transition-all shadow-xs cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            Approve Swap
                          </button>
                        </div>
                      </div>
  
                    </div>
                  );
                })
              ) : (
                <div className="text-center py-16 text-slate-400 space-y-2">
                  <CheckCircle className="h-10 w-10 text-emerald-500 mx-auto animate-bounce" />
                  <p className="text-xs font-black uppercase tracking-wider">No pending swap requests found</p>
                  <p className="text-[10px] text-slate-400">All submitted SME requests have been processed.</p>
                </div>
              )
            ) : (
              demoSwapRequests.filter((r: any) => r.status !== "pending").length > 0 ? (
                <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
                  <table className="w-full text-left border-collapse text-[11px]">
                    <thead>
                      <tr className="bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-400 font-black uppercase tracking-wider border-b border-slate-100 dark:border-slate-800">
                        <th className="p-3">SME</th>
                        <th className="p-3">Original Session</th>
                        <th className="p-3">Proposed Action</th>
                        <th className="p-3">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
                      {demoSwapRequests.filter((r: any) => r.status !== "pending").map((req: any) => (
                        <tr key={req.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/20">
                          <td className="p-3 font-bold">{req.smeName}</td>
                          <td className="p-3">
                            <div>{req.mentorName}</div>
                            <div className="text-[9.5px] text-slate-400">{req.dateStr} • {req.timeSlot}</div>
                          </td>
                          <td className="p-3">
                            {req.swapType === "mentor" ? (
                              <span className="font-medium text-slate-800 dark:text-slate-200">
                                Mentor Swap: {req.proposedMentorName}
                              </span>
                            ) : (
                              <span className="font-medium text-[#4F46E5] dark:text-[#818CF8]">
                                Time Swap: {req.proposedDateStr} • {req.proposedTimeSlot}
                              </span>
                            )}
                          </td>
                          <td className="p-3">
                            <span className={`px-2 py-0.5 rounded-lg text-[9px] font-black uppercase ${req.status === "approved"
                              ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                              : "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300"
                              }`}>
                              {req.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-xs text-slate-400 text-center py-16 font-bold">No resolved requests logged yet.</p>
              )
            )}
          </div>
  
          <div className="pt-2 border-t border-slate-100 dark:border-slate-800 shrink-0">
            <button
              onClick={() => setShowSwapRequestsModal(false)}
              className="w-full py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold rounded-xl text-xs transition-colors cursor-pointer"
            >
              Close Requests
            </button>
          </div>
  
      </Dialog>
  );
}

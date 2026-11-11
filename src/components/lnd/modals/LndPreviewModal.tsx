"use client";

import React from "react";
import { AlertTriangle, CheckCircle, Loader2, Sparkles, X } from "lucide-react";
import { Dialog } from "../../ui/dialog";

/** Automated generation preview: the proposed week's sessions, exceptions and free-slot maths before anything is written. */
export interface LndPreviewModalProps {
  collegeTimeSlots: any[];
  collegesById: Map<string, any>;
  currentCollege: any;
  currentWeekDates: any[];
  exceptions: any[];
  filteredMentors: any[];
  generationStep: string;
  handleSavePreview: (...args: any[]) => any;
  handleTriggerGenerate: (...args: any[]) => any;
  isGenerating: boolean;
  mentorsById: Map<string, any>;
  previewSessions: any[];
  selectedCollegeId: string;
  selectedGroupId: string;
  setEditSession: (v: any) => void;
  setShowPreviewModal: (v: any) => void;
  showPreviewModal: boolean;
  totalFreeSlotsCount: number;
  unassignedMentors: any[];
}

export default function LndPreviewModal({
  collegeTimeSlots,
  collegesById,
  currentCollege,
  currentWeekDates,
  exceptions,
  filteredMentors,
  generationStep,
  handleSavePreview,
  handleTriggerGenerate,
  isGenerating,
  mentorsById,
  previewSessions,
  selectedCollegeId,
  selectedGroupId,
  setEditSession,
  setShowPreviewModal,
  showPreviewModal,
  totalFreeSlotsCount,
  unassignedMentors
}: LndPreviewModalProps) {
  return (
      <Dialog
        open={showPreviewModal}
        onOpenChange={(next) => {
          if (!next && !isGenerating) setShowPreviewModal(false);
        }}
        ariaLabel="AI schedule generation preview"
        overlayClassName="bg-slate-950/60 backdrop-blur-sm"
        panelClassName="max-w-2xl rounded-2xl p-6 space-y-0 overflow-hidden flex flex-col max-h-[90vh] bg-white dark:bg-slate-900"
      >
  
          <button
            onClick={() => { if (!isGenerating) setShowPreviewModal(false); }}
            disabled={isGenerating}
            aria-label="Close generation preview"
            className="absolute right-4 top-4 p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl text-slate-400 hover:text-slate-800 dark:hover:text-white transition-colors cursor-pointer disabled:opacity-40"
          >
            <X className="h-5 w-5" />
          </button>
  
          {/* Modal Title */}
          <div className="flex items-center gap-2 border-b border-slate-100 dark:border-slate-800 pb-3 shrink-0">
            <div className="p-2 rounded-xl bg-[#4F46E5]/10 text-[#4F46E5]">
              <Sparkles className="h-5 w-5 animate-pulse" />
            </div>
            <div>
              <h3 className="text-sm font-black uppercase text-slate-900 dark:text-white tracking-wider">
                AI Schedule Generation Deck
              </h3>
              <p className="text-[10px] text-slate-400 font-bold uppercase mt-0.5">
                Target: {selectedCollegeId === "all" ? "All Applicable Colleges" : currentCollege?.name} • {selectedGroupId === "All" ? "All Subject Groups" : selectedGroupId}
              </p>
            </div>
          </div>
  
          {/* Modal Body */}
          <div className="flex-1 overflow-y-auto py-4 space-y-4 my-1">
  
            {generationStep === "generating" ? (
              /* LOADING GENERATION STATE */
              <div className="py-12 flex flex-col items-center justify-center text-center space-y-4">
                <div className="relative h-14 w-14">
                  <Loader2 className="h-14 w-14 text-[#4F46E5] animate-spin" />
                </div>
                <div className="space-y-1">
                  <h4 className="text-xs font-black text-slate-900 dark:text-white">Computing Allocation Metrics...</h4>
                  <p className="text-[10px] text-slate-400 font-bold uppercase">Analyzing slots, specialized SMEs, and leaves</p>
                </div>
  
                {/* Visual checklist indicators */}
                <div className="w-full max-w-xs bg-slate-50 dark:bg-slate-800/60 p-3.5 rounded-xl border border-slate-100 dark:border-slate-800 text-[10px] font-bold text-slate-500 dark:text-slate-400 space-y-2 text-left">
                  <div className="flex items-center gap-2 text-emerald-600">
                    <CheckCircle className="h-3.5 w-3.5" /> Checked college shift timings
                  </div>
                  <div className="flex items-center gap-2 text-[#4F46E5] animate-pulse">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Matching mentors with subject expert SMEs
                  </div>
                  <div className="flex items-center gap-2 text-slate-400">
                    <div className="h-3.5 w-3.5 rounded-full border-2 border-slate-200 dark:border-slate-700" /> Allocating clash-free dates
                  </div>
                </div>
              </div>
            ) : (
              /* RESULTS COMPLETED STATE */
              <div className="space-y-4">
                {/* Scanned Metrics Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-slate-50 dark:bg-slate-800/50 p-3 rounded-xl border border-slate-100 dark:border-slate-800 text-center">
                  <div className="p-1">
                    <span className="text-[8.5px] font-black uppercase text-slate-400 tracking-wider block">Available Mentors</span>
                    <span className="text-base font-black text-slate-800 dark:text-white block">{filteredMentors.length}</span>
                  </div>
                  <div className="p-1 border-x border-slate-200 dark:border-slate-700">
                    <span className="text-[8.5px] font-black uppercase text-slate-400 tracking-wider block">Total Free Slots</span>
                    <span className="text-base font-black text-emerald-600 block">{totalFreeSlotsCount}</span>
                  </div>
                  <div className="p-1">
                    <span className="text-[8.5px] font-black uppercase text-slate-400 tracking-wider block">Generated L&D Sessions</span>
                    <span className="text-base font-black text-[#4F46E5] block">{previewSessions.length}</span>
                  </div>
                </div>
  
                {/* Allocation summary alert cards */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2.5 p-3 bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900 rounded-xl text-[10.5px] font-bold text-emerald-800 dark:text-emerald-300">
                    <CheckCircle className="h-4.5 w-4.5 text-emerald-600 shrink-0" />
                    <span>Successfully planned {previewSessions.length} L&D sessions with zero cohort-clashes.</span>
                  </div>
  
                  {unassignedMentors.length > 0 && (
                    <div className="flex items-start gap-2.5 p-3 bg-amber-50/50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900 rounded-xl text-[10.5px] font-bold text-amber-800 dark:text-amber-300">
                      <AlertTriangle className="h-4.5 w-4.5 text-amber-600 shrink-0 mt-0.5" />
                      <div>
                        <span>Unassigned Mentors ({unassignedMentors.length}):</span>
                        <div className="flex flex-wrap gap-1 mt-1.5">
                          {unassignedMentors.map(m => (
                            <span key={m.id} className="px-1.5 py-0.5 rounded bg-white dark:bg-slate-800 border border-amber-200 dark:border-amber-800 text-[8.5px] font-black text-amber-700 dark:text-amber-300">
                              {m.name}
                            </span>
                          ))}
                        </div>
                        <span className="text-[8.5px] text-slate-400 font-bold block mt-1.5">These mentors either have no eligible matching SMEs or are fully occupied during free periods.</span>
                      </div>
                    </div>
                  )}
                </div>
  
                {/* Unresolved Exceptions Panel */}
                {exceptions.length > 0 && (
                  <div className="space-y-2.5">
                    <h4 className="text-[10px] font-black uppercase text-rose-500 tracking-wider flex items-center gap-1">
                      <AlertTriangle className="h-3 w-3" /> Scheduling Exceptions ({exceptions.length})
                    </h4>
                    <div className="space-y-2 max-h-[160px] overflow-y-auto pr-1">
                      {exceptions.map(exc => (
                        <div key={exc.id} className="p-3 bg-rose-50/20 dark:bg-rose-950/10 border border-rose-100 dark:border-rose-900 rounded-xl flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                          <div className="text-[10.5px]">
                            <p className="font-bold text-slate-800 dark:text-slate-200">
                              {exc.mentorName} • <span className="text-slate-400 font-semibold">{exc.subject}</span>
                            </p>
                            <p className="text-[9.5px] text-rose-600 dark:text-rose-400 font-bold mt-0.5">
                              Clash: {exc.reason}
                            </p>
                            <p className="text-[9px] text-[#4F46E5] dark:text-[#818CF8] mt-1 italic">
                              Suggestion: {exc.recommendation}
                            </p>
                          </div>
                          <button
                            onClick={() => {
                              setEditSession({
                                mentorId: exc.mentorId,
                                mentorName: exc.mentorName,
                                smeId: "",
                                smeName: "",
                                dateStr: currentWeekDates[0]?.dateStr || "",
                                timeSlot: collegeTimeSlots[0] || "",
                                subject: exc.subject,
                                stream: exc.stream,
                                week: 1
                              });
                              setShowPreviewModal(false);
                            }}
                            className="px-2.5 py-1 bg-white hover:bg-slate-50 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-[9px] font-bold rounded-lg border border-slate-200 dark:border-slate-700 transition-colors shadow-xs shrink-0 cursor-pointer"
                          >
                            Resolve Manual
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
  
                {/* Generated sessions preview ledger list */}
                <div className="space-y-2">
                  <h4 className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Generated Sessions Ledger Preview</h4>
                  <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden max-h-[200px] overflow-y-auto">
                    <table className="w-full text-left border-collapse text-[10.5px]">
                      <thead>
                        <tr className="bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 font-bold uppercase text-[9px]">
                          <th className="p-2.5">Faculty Mentor</th>
                          <th className="p-2.5">Subject</th>
                          <th className="p-2.5">Date / Time</th>
                          <th className="p-2.5">Assigned SME</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
                        {previewSessions.map((s, idx) => (
                          <tr key={idx} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                            <td className="p-2.5 font-bold text-slate-800 dark:text-white">
                              <div>{s.mentorName}</div>
                              <div className="text-[8.5px] text-[#4F46E5] font-black uppercase tracking-wider mt-0.5">
                                {s.collegeName || collegesById.get(mentorsById.get(s.mentorId)?.college_id || "")?.name || ""}
                              </div>
                            </td>
                            <td className="p-2.5 text-slate-500 dark:text-slate-400">{s.subject}</td>
                            <td className="p-2.5 text-slate-500 dark:text-slate-400">
                              <div>{s.dateStr}</div>
                              <div className="text-[8.5px] text-slate-400 mt-0.5">{s.timeSlot}</div>
                            </td>
                            <td className="p-2.5 font-bold text-slate-700 dark:text-slate-200">{s.smeName}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
  
          </div>
  
          {/* Modal Actions */}
          {generationStep === "done" && (
            <div className="flex gap-3 border-t border-slate-100 dark:border-slate-800 pt-3 shrink-0">
              <button
                onClick={handleSavePreview}
                className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs shadow-sm cursor-pointer transition-colors"
              >
                Confirm &amp; Save
              </button>
              <button
                onClick={handleTriggerGenerate}
                className="flex-1 py-2.5 bg-[#4F46E5]/10 hover:bg-[#4F46E5]/15 text-[#4F46E5] font-bold rounded-xl text-xs transition-colors cursor-pointer border border-[#4F46E5]/25"
              >
                Regenerate
              </button>
              <button
                onClick={() => setShowPreviewModal(false)}
                className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-bold transition-colors cursor-pointer"
              >
                Cancel
              </button>
            </div>
          )}
      </Dialog>
  );
}

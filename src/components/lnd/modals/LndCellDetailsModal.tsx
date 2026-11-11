"use client";

import React from "react";
import { Calendar, X } from "lucide-react";
import { Dialog } from "../../ui/dialog";

/** Cell drill-down: who is free, booked or off-duty for one evaluator window. */
export interface LndCellDetailsModalProps {
  cellPopover: any;
  filteredMentors: any[];
  getMentorGroup: (...args: any[]) => any;
  getMentorStatusAtSlot: (...args: any[]) => any;
  getSmesForSubjectGroup: (...args: any[]) => any;
  selectedWeek: any;
  setCellPopover: (v: any) => void;
  setEditSession: (v: any) => void;
  slots: any[];
  smes: any[];
  toast: (m: string, k?: any) => void;
}

export default function LndCellDetailsModal({
  cellPopover,
  filteredMentors,
  getMentorGroup,
  getMentorStatusAtSlot,
  getSmesForSubjectGroup,
  selectedWeek,
  setCellPopover,
  setEditSession,
  slots,
  smes,
  toast
}: LndCellDetailsModalProps) {
  return (
      <Dialog
        open={cellPopover !== null}
        onOpenChange={(next) => {
          if (!next) setCellPopover(null);
        }}
        ariaLabel={cellPopover ? `${cellPopover.day} ${cellPopover.timeSlot} mentors` : "Mentor availability"}
        overlayClassName="bg-slate-950/60 backdrop-blur-sm"
        panelClassName="max-w-md rounded-2xl p-6 space-y-4 bg-white dark:bg-slate-900 max-h-[90vh]"
      >
  
          <button
            onClick={setCellPopover.bind(null, null)}
            aria-label="Close mentor availability"
            className="absolute right-4 top-4 p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl text-slate-400 hover:text-slate-800 dark:hover:text-white transition-colors cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
  
          <div className="flex items-center gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
            <div className="p-1.5 rounded-lg bg-[#4F46E5]/10 text-[#4F46E5]">
              <Calendar className="h-4.5 w-4.5" />
            </div>
            <div>
              <h3 className="text-sm font-black uppercase text-slate-900 dark:text-white tracking-wider">
                {cellPopover.day} ({cellPopover.dateFormatted})
              </h3>
              <p className="text-[10px] text-slate-400 font-bold">{cellPopover.timeSlot}</p>
            </div>
          </div>
  
          <div className="space-y-2.5 max-h-[350px] overflow-y-auto pr-1">
            {(() => {
              // Filter out mentors who are not available (free, demo, preview)
              const popoverMentors = filteredMentors.filter(mentor => {
                const statusObj = getMentorStatusAtSlot(mentor.id, cellPopover.dateStr, cellPopover.timeSlot);
                return statusObj.status === "free" || statusObj.status === "demo" || statusObj.status === "preview";
              });
  
              if (popoverMentors.length === 0) {
                return (
                  <div className="text-center py-6 text-slate-400 font-bold text-xs">
                    No available or scheduled mentors in this period.
                  </div>
                );
              }
  
              return popoverMentors.map((mentor) => {
                const statusObj = getMentorStatusAtSlot(mentor.id, cellPopover.dateStr, cellPopover.timeSlot);
                const isFree = statusObj.status === "free";
                const isDemo = statusObj.status === "demo";
                const isPreview = statusObj.status === "preview";
                const isBlocked = statusObj.status === "blocked";
  
                return (
                  <div
                    key={mentor.id}
                    onClick={() => {
                      setCellPopover(null); // close popover
                      if (isFree) {
                        const mentorGroup = getMentorGroup(mentor);
                        const matchingSme = getSmesForSubjectGroup(mentorGroup)[0] || smes[0];
                        setEditSession({
                          id: "",
                          mentorId: mentor.id,
                          mentorName: mentor.name,
                          smeId: matchingSme?.id || "",
                          smeName: matchingSme?.name || "",
                          dateStr: cellPopover.dateStr,
                          timeSlot: cellPopover.timeSlot,
                          subject: mentorGroup,
                          stream: (slots.filter(s => s.mentorId === mentor.id && s.classGroup)[0]?.classGroup) || "General Stream",
                          week: selectedWeek
                        });
                      } else if (isDemo) {
                        setEditSession(statusObj.session);
                      } else if (isPreview) {
                        toast("This is a preview draft session. Save changes to modify.", "info");
                      } else if (isBlocked) {
                        toast(`${mentor.name} is unavailable: ${statusObj.label} (${statusObj.details})`, "info");
                      } else {
                        toast(`${mentor.name} is busy teaching: ${statusObj.label} (${statusObj.group})`, "warning");
                      }
                    }}
                    className={`flex items-center justify-between p-3 rounded-xl border text-xs font-bold cursor-pointer transition-all hover:bg-slate-50 dark:hover:bg-slate-800 ${isFree
                      ? "bg-emerald-50/40 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300"
                      : isDemo
                        ? "bg-[#4F46E5]/10 dark:bg-[#4F46E5]/20 border-[#4F46E5]/30 text-[#4F46E5] dark:text-[#818CF8]"
                        : isPreview
                          ? "bg-amber-50/30 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300"
                          : isBlocked
                            ? "bg-amber-50/10 border-amber-100/50 text-amber-600/80 cursor-not-allowed"
                            : "bg-slate-50/50 dark:bg-slate-800/40 border-slate-100 dark:border-slate-800 text-slate-400"
                      }`}
                  >
                    <div className="space-y-0.5 text-left">
                      <span className="text-slate-800 dark:text-slate-100 block">{mentor.name}</span>
                      {!isFree && (
                        <span className="text-[9px] text-slate-400 font-semibold block">
                          {statusObj.label}
                        </span>
                      )}
                    </div>
                    <span className={`px-2 py-0.5 rounded-lg text-[9px] font-black uppercase shrink-0 ${isFree
                      ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                      : isDemo
                        ? "bg-[#4F46E5]/20 text-[#4F46E5] dark:text-[#818CF8]"
                        : isPreview
                          ? "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300"
                          : isBlocked
                            ? "bg-amber-100 text-amber-600"
                            : "bg-slate-100 dark:bg-slate-800 text-slate-400"
                      }`}>
                      {isFree ? "Free" : isDemo ? "L&D Session" : isPreview ? "Draft" : isBlocked ? "Blocked" : "Busy"}
                    </span>
                  </div>
                );
              });
            })()}
          </div>
  
      </Dialog>
  );
}

"use client";

import { Fragment } from "react";
import { Coffee, Moon } from "lucide-react";

interface LndPeriodTableProps {
  currentWeekDates: any[];
  getEffectiveDayOrderInfo: (dateStr: string, weekdayName: string, dayIndex: number, collegeId?: string) => any;
  selectedCollegeId: string;
  collegeTimeSlots: string[];
  standardShiftSlots: string[];
  filteredMentors: any[];
  getMentorStatusAtSlot: (mentorId: string, dateStr: string, time: string) => any;
  getMentorGroup: (mentor: any) => string;
  getSmesForSubjectGroup: (groupName: string) => any[];
  smes: any[];
  slots: any[];
  selectedWeek: number;
  setEditSession: (session: any) => void;
  setCellPopover: (cell: any) => void;
  toast: (m: string, k?: any) => void;
}

export default function LndPeriodTable({
  currentWeekDates,
  getEffectiveDayOrderInfo,
  selectedCollegeId,
  collegeTimeSlots,
  standardShiftSlots,
  filteredMentors,
  getMentorStatusAtSlot,
  getMentorGroup,
  getSmesForSubjectGroup,
  smes,
  slots,
  selectedWeek,
  setEditSession,
  setCellPopover,
  toast
}: LndPeriodTableProps) {
  return (
    <div className="bg-white/90 dark:bg-[#131317]/90 border border-slate-200/80 dark:border-slate-800/80 rounded-xl shadow-xs overflow-auto max-h-[70vh] w-full no-scrollbar relative backdrop-blur-md">
      <table className="w-full table-fixed border-collapse text-left min-w-[950px]">
        <thead>
          <tr className="bg-slate-50/80 dark:bg-slate-900/80 text-xs font-bold uppercase">
            <th className="sticky top-0 left-0 z-30 p-4 text-[10px] font-black text-slate-400 uppercase tracking-wider bg-slate-100/95 dark:bg-slate-950/95 backdrop-blur-xs border-r border-b border-slate-200/80 dark:border-slate-800 w-[15%]">Time Period</th>
            {currentWeekDates.map((date, idx) => {
              const dayInfo = getEffectiveDayOrderInfo(date.dateStr, date.day, idx, selectedCollegeId !== "all" ? selectedCollegeId : undefined);
              return (
                <th key={date.dateStr} className="sticky top-0 z-20 p-4 text-[10.5px] font-black text-slate-700 dark:text-slate-300 bg-slate-50/95 dark:bg-slate-900/95 backdrop-blur-xs border-b border-slate-200/80 dark:border-slate-800 uppercase w-[17%] border-l border-slate-100 dark:border-slate-800 text-center">
                  <div className={`font-black text-[11px] tracking-tight ${dayInfo.isHoliday ? "text-rose-600 dark:text-rose-400" : "text-[#4F46E5] dark:text-[#818CF8]"}`}>
                    {dayInfo.isHoliday ? "Holiday" : dayInfo.dayOrder}
                  </div>
                  <div className="text-[9px] text-slate-400 font-bold tracking-tight mt-0.5">{date.day.slice(0, 3)} ({date.formatted})</div>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
          {collegeTimeSlots.length > 0 ? (
            collegeTimeSlots.map((time, tIdx) => {
              const isLunch = time.toLowerCase().includes("lunch") || time.toLowerCase().includes("break");
              const firstBeyondSlot = collegeTimeSlots.find(t => {
                const isL = t.toLowerCase().includes("lunch") || t.toLowerCase().includes("break");
                return !standardShiftSlots.includes(t.trim().toLowerCase()) && !isL;
              });
              const isFirstBeyond = time === firstBeyondSlot;

              return (
                <Fragment key={time}>
                  {/* BEYOND HOURS HEADER DIVIDER */}
                  {isFirstBeyond && (
                    <tr className="bg-slate-100/70 dark:bg-slate-900/70 border-t border-b border-slate-200 dark:border-slate-800">
                      <td colSpan={6} className="p-3.5 text-left">
                        <div className="flex items-center gap-2 text-[#4F46E5] dark:text-[#818CF8] font-black text-xs uppercase tracking-widest">
                          <Moon className="h-4.5 w-4.5 text-[#4F46E5] animate-pulse" />
                          Beyond College Hours
                        </div>
                      </td>
                    </tr>
                  )}

                  {isLunch ? (
                    <tr className="bg-amber-50/20 dark:bg-amber-950/10">
                      <td className="sticky left-0 z-10 p-3 border-r border-slate-100 dark:border-slate-800 bg-amber-50/95 dark:bg-slate-900/95 backdrop-blur-xs align-middle">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                          <Coffee className="h-3.5 w-3.5 text-[#7C3AED]" />
                          Lunch
                        </span>
                      </td>
                      <td colSpan={5} className="p-3 align-middle text-center">
                        <div className="flex items-center justify-center gap-2 text-amber-700 dark:text-amber-400 font-extrabold text-[10.5px] tracking-wide uppercase">
                          <Coffee className="h-4 w-4" />
                          {time} • LUNCH BREAK (Excluded from Scheduling)
                        </div>
                      </td>
                    </tr>
                  ) : (
                    <tr className="hover:bg-slate-50/30 dark:hover:bg-slate-800/20 transition-colors">

                      {/* Time Column */}
                      <td className="sticky left-0 z-10 p-4 border-r border-slate-100 dark:border-slate-800 bg-slate-50/95 dark:bg-slate-900/95 backdrop-blur-xs align-middle">
                        <div className="leading-tight">
                          <span className="text-[10.5px] font-black text-slate-700 dark:text-white">Period {tIdx + 1}</span>
                          <div className="text-[9px] text-slate-400 font-semibold mt-0.5">{time}</div>
                        </div>
                      </td>

                      {/* Day Columns */}
                      {currentWeekDates.map((date) => {
                        return (
                          <td
                            key={date.dateStr}
                            className="p-2 border-r border-slate-100 dark:border-slate-800 last:border-r-0 align-top text-center"
                          >
                            <div className="space-y-1.5 max-h-[220px] overflow-y-auto pr-0.5">
                              {(() => {
                                // Filter out mentors who are not available (free, demo, preview)
                                const cellMentors = filteredMentors.filter(mentor => {
                                  const statusObj = getMentorStatusAtSlot(mentor.id, date.dateStr, time);
                                  return statusObj.status === "free" || statusObj.status === "demo" || statusObj.status === "preview";
                                });
                                const visibleMentors = cellMentors.slice(0, 2);
                                const hiddenCount = cellMentors.length - 2;

                                return (
                                  <>
                                    {visibleMentors.map((mentor) => {
                                      const statusObj = getMentorStatusAtSlot(mentor.id, date.dateStr, time);
                                      const isFree = statusObj.status === "free";
                                      const isDemo = statusObj.status === "demo";
                                      const isPreview = statusObj.status === "preview";
                                      const isBlocked = statusObj.status === "blocked";

                                      return (
                                        <div
                                          key={mentor.id}
                                          onClick={() => {
                                            if (isFree) {
                                              const mentorGroup = getMentorGroup(mentor);
                                              const matchingSme = getSmesForSubjectGroup(mentorGroup)[0] || smes[0];
                                              setEditSession({
                                                id: "",
                                                mentorId: mentor.id,
                                                mentorName: mentor.name,
                                                smeId: matchingSme?.id || "",
                                                smeName: matchingSme?.name || "",
                                                dateStr: date.dateStr,
                                                timeSlot: time,
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
                                          className={`flex flex-col p-1.5 rounded-lg border text-[9.5px] font-bold cursor-pointer transition-all hover:translate-x-0.5 text-left ${isFree
                                            ? "bg-mint-50/40 dark:bg-mint-950/20 border-mint-200 dark:border-mint-800 text-mint-800 dark:text-mint-300 hover:bg-mint-50 dark:hover:bg-mint-900/30"
                                            : isDemo
                                              ? "bg-[#4F46E5]/10 dark:bg-[#4F46E5]/20 border-[#4F46E5]/30 text-[#4F46E5] dark:text-[#818CF8] hover:bg-[#4F46E5]/15"
                                              : isPreview
                                                ? "bg-amber-50/30 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300 hover:bg-amber-50"
                                                : isBlocked
                                                  ? "bg-amber-50/10 border-amber-100/50 text-amber-600/80 cursor-not-allowed"
                                                  : "bg-slate-50/50 dark:bg-slate-800/40 border-slate-100 dark:border-slate-800 text-slate-400 hover:bg-slate-100"
                                            }`}
                                          title={`${mentor.name}: ${statusObj.label}`}
                                        >
                                          <div className="flex items-center justify-between gap-1">
                                            <span className="truncate text-slate-800 dark:text-slate-100">{mentor.name}</span>
                                            <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${isFree
                                              ? "bg-mint-500"
                                              : isDemo
                                                ? "bg-[#4F46E5]"
                                                : isPreview
                                                  ? "bg-amber-500"
                                                  : isBlocked
                                                    ? "bg-amber-600"
                                                    : "bg-slate-300 dark:bg-slate-600"
                                              }`} />
                                          </div>
                                          {!isFree && (
                                            <div className="text-[7.5px] text-slate-500 dark:text-slate-400 font-semibold truncate mt-0.5 text-left">
                                              {statusObj.label}
                                            </div>
                                          )}
                                        </div>
                                      );
                                    })}

                                    {hiddenCount > 0 && (
                                      <button
                                        onClick={() => {
                                          setCellPopover({
                                            dateStr: date.dateStr,
                                            dateFormatted: date.formatted,
                                            day: date.day,
                                            timeSlot: time
                                          });
                                        }}
                                        className="w-full py-1 text-[8.5px] font-black text-[#4F46E5] hover:text-[#4338CA] bg-[#4F46E5]/5 hover:bg-[#4F46E5]/10 border border-dashed border-[#4F46E5]/30 rounded-lg transition-colors cursor-pointer"
                                      >
                                        + {hiddenCount} More
                                      </button>
                                    )}
                                  </>
                                );
                              })()}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  )}
                </Fragment>
              );
            })
          ) : (
            <tr>
              <td colSpan={6} className="py-12 text-center text-slate-400 text-xs font-bold">
                No time slots configured for the selected College.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

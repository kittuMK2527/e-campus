"use client";

import { Sparkles, X } from "lucide-react";

interface LndSmeTimetableProps {
  sme: any;
  currentWeekDates: any[];
  gridPeriodRows: string[];
  selectedCollegeId: string;
  getEffectiveDayOrderInfo: (dateStr: string, weekdayName: string, dayIndex: number, collegeId?: string) => any;
  getSmeSlotStatus: (smeId: string, dayName: string, dateStr: string, slot: string) => any;
  getFreeMentorsForSlotCached: (smeId: string, dayName: string, dateStr: string, slot: string, dayIdx: number) => any[];
  mentorOptionLabel: (mentor: any) => string;
  mentorsById: Map<string, any>;
  collegesById: Map<string, any>;
  handleQuickAllocateMentor: (smeId: string, mentorId: string, dateStr: string, slot: string, sessionId?: string) => void;
  setEditSession: (session: any) => void;
}

export default function LndSmeTimetable({
  sme,
  currentWeekDates,
  gridPeriodRows,
  selectedCollegeId,
  getEffectiveDayOrderInfo,
  getSmeSlotStatus,
  getFreeMentorsForSlotCached,
  mentorOptionLabel,
  mentorsById,
  collegesById,
  handleQuickAllocateMentor,
  setEditSession
}: LndSmeTimetableProps) {
  return (
    <div className="bg-white/90 dark:bg-[#131317]/90 border border-slate-100 dark:border-slate-800/80 rounded-2xl shadow-card overflow-hidden backdrop-blur-md">
      {/* Evaluator Header */}
      <div className="px-5 py-3 bg-gradient-to-r from-slate-50 to-white dark:from-slate-900/90 dark:to-[#131317] border-b border-slate-200/80 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-lg bg-indigo-500/10 text-[#4F46E5] dark:text-[#818CF8] flex items-center justify-center font-black text-xs border border-pink-200/50 dark:border-pink-800/50">
            {sme.name?.charAt(0) || "S"}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-black text-slate-800 dark:text-white uppercase tracking-wider">{sme.name}</span>
              <span className="px-2 py-0.5 rounded-full text-[9px] font-black bg-pink-100 dark:bg-pink-950/40 text-[#4F46E5] dark:text-[#818CF8]">
                {sme.subject || "Evaluator"}
              </span>
            </div>
            <span className="text-[10px] text-slate-400 font-semibold">{sme.email || "Evaluator"}</span>
          </div>
        </div>
        <div className="text-[10px] font-bold text-slate-400 flex items-center gap-1.5">
          <span>{sme.subject ? `${sme.subject} Schedule` : "Evaluation Schedule"}</span>
        </div>
      </div>

      {/* Time Slot Availability Matrix Table */}
      <div className="overflow-x-auto max-h-[70vh] no-scrollbar">
        <table className="w-full table-fixed border-collapse text-center min-w-[950px]">
          <thead>
            <tr className="bg-slate-50/95 dark:bg-slate-900/95 text-xs font-bold uppercase sticky top-0 z-20 border-b border-slate-200 dark:border-slate-800">
              <th className="p-3.5 text-left text-[10px] font-black text-slate-400 uppercase tracking-wider w-[16%] sticky left-0 z-30 bg-slate-100/95 dark:bg-slate-950/95 border-r border-slate-200 dark:border-slate-800">
                Time Slot
              </th>
              {currentWeekDates.map((date, idx) => {
                const dayInfo = getEffectiveDayOrderInfo(date.dateStr, date.day, idx, selectedCollegeId !== "all" ? selectedCollegeId : undefined);
                return (
                  <th key={date.dateStr} className="p-3 text-[10.5px] font-black text-slate-700 dark:text-slate-300 border-l border-slate-100 dark:border-slate-800 w-[14%] text-center">
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
            {gridPeriodRows.map((slot) => (
              <tr key={slot} className="hover:bg-slate-50/40 dark:hover:bg-slate-800/20 transition-colors">
                <td className="sticky left-0 z-10 p-3.5 text-left font-mono text-[10.5px] font-black text-slate-700 dark:text-slate-300 bg-slate-50/95 dark:bg-slate-900/95 backdrop-blur-xs border-r border-slate-200 dark:border-slate-800 whitespace-nowrap">
                  {slot}
                </td>
                {currentWeekDates.map((date, dayIdx) => {
                  const dayInfo = getEffectiveDayOrderInfo(date.dateStr, date.day, dayIdx, selectedCollegeId !== "all" ? selectedCollegeId : undefined);
                  const statusObj = getSmeSlotStatus(sme.id, date.day, date.dateStr, slot);

                  // 1. Holiday check
                  if (dayInfo.isHoliday) {
                    return (
                      <td key={date.dateStr} className="p-2 border-r border-slate-100 dark:border-slate-800 align-middle">
                        <div className="p-2 rounded-lg bg-rose-50/40 dark:bg-rose-950/20 border border-rose-200/40 dark:border-rose-900/30 text-center">
                          <span className="text-[9.5px] font-bold text-rose-700 dark:text-rose-300 uppercase tracking-tight block">
                            Campus Holiday
                          </span>
                        </div>
                      </td>
                    );
                  }

                  // 2. Leave check
                  if (statusObj.status === "leave") {
                    return (
                      <td key={date.dateStr} className="p-2 border-r border-slate-100 dark:border-slate-800 align-middle">
                        <div className="p-2 rounded-lg bg-amber-50/60 dark:bg-amber-950/20 border border-amber-200/60 dark:border-amber-800/40 text-center">
                          <span className="text-[10px] font-bold text-amber-900 dark:text-amber-200 block">
                            SME on Leave
                          </span>
                        </div>
                      </td>
                    );
                  }

                  // 3. Confirmed L&D Session (Booked - Excel Dropdown Flow with Lite Pastel Pink)
                  if (statusObj.status === "booked" && statusObj.session) {
                    const sess = statusObj.session;
                    const assignedMid = sess.mentorId || sess.mentor_id;
                    const assignedMName = sess.mentorName || sess.mentor_name;
                    const assignedMentorObj = mentorsById.get(assignedMid);
                    const assignedCollege = sess.collegeName || collegesById.get(assignedMentorObj?.college_id || "")?.name || "Campus";
                    const freeMentors = getFreeMentorsForSlotCached(sme.id, date.day, date.dateStr, slot, dayIdx);

                    return (
                      <td key={date.dateStr} className="p-2 border-r border-slate-100 dark:border-slate-800 align-middle">
                        <div className="space-y-1 p-1.5 rounded-lg bg-pink-50/80 dark:bg-pink-950/25 border border-pink-200/80 dark:border-pink-800/40 transition-all text-left shadow-2xs">
                          <div className="flex items-center gap-1">
                            <select
                              value={assignedMid}
                              onChange={(e) => {
                                const val = e.target.value;
                                if (val === "__CLEAR__") {
                                  handleQuickAllocateMentor(sme.id, "__CLEAR__", date.dateStr, slot, sess.id);
                                } else if (val && val !== assignedMid) {
                                  handleQuickAllocateMentor(sme.id, val, date.dateStr, slot, sess.id);
                                }
                              }}
                              aria-label={`Allocated faculty: ${assignedMName}`}
                              className="w-full text-[10.5px] font-bold bg-white dark:bg-slate-900 border border-pink-200/80 dark:border-pink-800/60 text-pink-950 dark:text-pink-100 rounded-md px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-pink-400 cursor-pointer transition-colors truncate"
                            >
                              <option value={assignedMid}>
                                {assignedMName} ({assignedCollege}) [Booked]
                              </option>
                              <option value="__CLEAR__">
                                -- Clear Slot (Free Slot) --
                              </option>
                              {freeMentors.length > 0 && <option disabled>──────────────</option>}
                              {freeMentors.map(m => (
                                <option key={m.id} value={m.id} className="text-slate-800 bg-white">
                                  {mentorOptionLabel(m)}
                                </option>
                              ))}
                            </select>
                            <button
                              type="button"
                              onClick={() => handleQuickAllocateMentor(sme.id, "__CLEAR__", date.dateStr, slot, sess.id)}
                              title="Clear slot"
                              className="p-1 rounded-md text-pink-400 hover:text-rose-600 hover:bg-pink-100/70 dark:hover:bg-pink-900/40 transition-colors shrink-0 cursor-pointer"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                          <div className="flex items-center justify-between px-1 text-[8px] font-bold text-pink-700/90 dark:text-pink-300">
                            <span
                              onClick={() => setEditSession(sess)}
                              title="Click to view full session details"
                              className="bg-pink-100/90 dark:bg-pink-900/60 text-pink-800 dark:text-pink-200 px-1.5 py-0.5 rounded font-black tracking-tight uppercase cursor-pointer hover:bg-pink-200/80 transition-colors"
                            >
                              Booked
                            </span>
                            <span className="text-[7.5px] text-pink-600/80 dark:text-pink-400 truncate max-w-[90px]">
                              {assignedCollege}
                            </span>
                          </div>
                        </div>
                      </td>
                    );
                  }

                  // 4. Training / Workshop Time (Lite Pastel Lavender)
                  if (statusObj.status === "training") {
                    return (
                      <td key={date.dateStr} className="p-2 border-r border-slate-100 dark:border-slate-800 align-middle">
                        <div className="p-2 rounded-lg bg-purple-50/60 dark:bg-purple-950/20 border border-purple-200/60 dark:border-purple-800/40 text-center">
                          <span className="text-[10px] font-bold text-purple-900 dark:text-purple-200 block">
                            Training Window
                          </span>
                          <span className="text-[7.5px] font-medium text-purple-600/80 dark:text-purple-300/70 block mt-0.5 uppercase tracking-wide">
                            Workshop Time
                          </span>
                        </div>
                      </td>
                    );
                  }

                  // 5. Off-Duty Window (Lite Pastel Neutral Gray)
                  if (statusObj.status === "off_duty") {
                    return (
                      <td key={date.dateStr} className="p-2 border-r border-slate-100 dark:border-slate-800 align-middle">
                        <div className="p-2 rounded-lg bg-slate-50/50 dark:bg-slate-900/30 border border-slate-200/40 dark:border-slate-800/40 text-center">
                          <span className="text-[9.5px] font-medium text-slate-400 dark:text-slate-500 block">
                            Off-Duty
                          </span>
                        </div>
                      </td>
                    );
                  }

                  // 6. Free Demo Slot -> Interactive Real-Time Dropdown (Lite Pastel Mint)
                  const freeMentors = getFreeMentorsForSlotCached(sme.id, date.day, date.dateStr, slot, dayIdx);

                  return (
                    <td key={date.dateStr} className="p-2 border-r border-slate-100 dark:border-slate-800 align-middle">
                      {freeMentors.length > 0 ? (
                        <div className="space-y-1 p-1.5 rounded-lg bg-mint-50/50 dark:bg-mint-950/20 border border-mint-200/70 dark:border-mint-800/50 transition-all text-left shadow-2xs">
                          <select
                            value=""
                            onChange={(e) => {
                              if (e.target.value) {
                                handleQuickAllocateMentor(sme.id, e.target.value, date.dateStr, slot);
                              }
                            }}
                            aria-label="Allocate faculty to free slot"
                            className="w-full text-[10.5px] font-semibold bg-white dark:bg-slate-900 border border-mint-200/70 dark:border-mint-800/50 text-mint-900 dark:text-mint-200 rounded-md px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-mint-400 cursor-pointer transition-colors truncate"
                          >
                            <option value="" disabled>
                              -- Select Faculty ({freeMentors.length}) --
                            </option>
                            {freeMentors.map(m => (
                              <option key={m.id} value={m.id} className="text-slate-800 bg-white">
                                {mentorOptionLabel(m)}
                              </option>
                            ))}
                          </select>
                          <div className="flex items-center justify-between px-1 text-[8px] font-bold text-mint-600/90 dark:text-mint-400">
                            <span className="uppercase tracking-tight">Free Slot</span>
                            <span className="bg-mint-100/70 dark:bg-mint-900/40 text-mint-800 dark:text-mint-300 px-1 py-0.5 rounded text-[7.5px] font-black">
                              {freeMentors.length} eligible
                            </span>
                          </div>
                        </div>
                      ) : (
                        <div className="p-2 rounded-lg bg-slate-50/40 dark:bg-slate-900/20 border border-dashed border-slate-200/60 dark:border-slate-800/50 text-center">
                          <span className="text-[9px] font-medium text-slate-400 block">
                            No eligible faculty
                          </span>
                          <span className="text-[7.5px] text-slate-400/80 block mt-0.5">
                            Quota met or busy
                          </span>
                        </div>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

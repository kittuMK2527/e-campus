"use client";

import React, { useState } from "react";
import { X } from "lucide-react";

/** Campus day order for one date, exactly as the dashboard resolves it from the CM's daily configs. */
export interface LndDayOrderInfo {
  dayOrder: string;
  effectiveTimetableDay: string;
  periods: number;
  weekdayName: string;
  dateStr: string;
  isHoliday: boolean;
  dayType: string;
}

export interface LndSlotStatusInfo {
  status: "leave" | "booked" | "off_duty" | "training" | "free_demo";
  label: string;
  isDemoSlot: boolean;
  session?: any;
}

export interface LndMasterMatrixProps {
  /** Evaluators in scope after the campus / group / evaluator filters. */
  smes: any[];
  /** Demo evaluation windows shown as columns. */
  slots: string[];
  weekDates: { dateStr: string; day: string; formatted?: string }[];
  /** Selected campus, or undefined for the all-campus view. Drives which day order is read. */
  collegeId?: string;
  dayOrderFor: (dateStr: string, weekdayName: string, dayIndex: number, collegeId?: string) => LndDayOrderInfo;
  slotStatusAt: (smeId: string, dayName: string, dateStr: string, slot: string) => LndSlotStatusInfo;
  freeMentorsFor: (smeId: string, dayName: string, dateStr: string, slot: string, dayIndex: number) => any[];
  /** Dropdown label: "Faculty Name (College Name) [scheduled/target h]". */
  mentorOptionLabel: (mentor: any) => string;
  onAllocate: (smeId: string, mentorId: string, dateStr: string, slot: string, sessionId?: string) => void;
  onOpenSession: (session: any) => void;
}

const BAND_COLS = "sticky left-0 z-10 bg-slate-50/95 dark:bg-slate-900/95 border-r border-slate-200 dark:border-slate-800 text-left";

/**
 * The on-screen twin of the workbook's Master_Grid: one row per evaluator inside a Day Order band,
 * demo evaluation windows across the top. The per-evaluator card view keeps its own orientation;
 * both read the same status and free-mentor resolvers, so a cell here and that card can never
 * disagree about the same window.
 */
export default function LndMasterMatrix({
  smes,
  slots,
  weekDates,
  collegeId,
  dayOrderFor,
  slotStatusAt,
  freeMentorsFor,
  mentorOptionLabel,
  onAllocate,
  onOpenSession
}: LndMasterMatrixProps) {
  const [mobileSelectedDate, setMobileSelectedDate] = useState<string>("all");
  const columnCount = slots.length + 1;

  const visibleWeekDates = mobileSelectedDate === "all"
    ? weekDates
    : weekDates.filter(d => d.dateStr === mobileSelectedDate);

  return (
    <div className="bg-white/90 dark:bg-[#131317]/90 border border-slate-100 dark:border-slate-800/80 rounded-2xl shadow-card overflow-hidden backdrop-blur-md">
      <div className="px-5 py-3 bg-gradient-to-r from-slate-50 to-white dark:from-slate-900/90 dark:to-[#131317] border-b border-slate-200/80 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-xs font-black text-slate-800 dark:text-white uppercase tracking-wider">
            Unified Evaluator Matrix
          </div>
          <p className="text-[10px] text-slate-500 dark:text-slate-400 font-semibold">
            Day Order × evaluator matrix with demo evaluation slots.
          </p>
        </div>
        <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400">
          {smes.length} evaluator row{smes.length === 1 ? "" : "s"} per day · {slots.length} window
          {slots.length === 1 ? "" : "s"}
        </span>
      </div>

      {/* Mobile Day Selector Pill Strip */}
      <div className="flex md:hidden items-center gap-1.5 overflow-x-auto p-3 bg-slate-50/70 dark:bg-slate-900/50 border-b border-slate-200/80 dark:border-slate-800 no-scrollbar">
        <button
          type="button"
          onClick={() => setMobileSelectedDate("all")}
          className={`px-3 py-1 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
            mobileSelectedDate === "all"
              ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-xs"
              : "bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300"
          }`}
        >
          All Days
        </button>
        {weekDates.map(d => {
          const info = dayOrderFor(d.dateStr, d.day, 0, collegeId);
          const isSelected = mobileSelectedDate === d.dateStr;
          return (
            <button
              key={d.dateStr}
              type="button"
              onClick={() => setMobileSelectedDate(d.dateStr)}
              className={`px-3 py-1 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer flex items-center gap-1 ${
                isSelected
                  ? "bg-indigo-600 text-white shadow-xs"
                  : "bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300"
              }`}
            >
              <span>{d.day.slice(0, 3)}</span>
              {info.dayOrder && (
                <span className={`text-[9.5px] px-1 py-0.2 rounded font-black ${
                  isSelected ? "bg-indigo-700 text-white" : "bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-300"
                }`}>
                  {info.dayOrder}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="overflow-x-auto max-h-[70vh] no-scrollbar">
        <table className="w-full border-collapse text-center min-w-[1080px]">
          <caption className="sr-only">
            L&amp;D demo allocation matrix: rows are evaluators grouped by campus day order, columns are
            demo evaluation time windows.
          </caption>
          <thead>
            <tr className="bg-slate-50/95 dark:bg-slate-900/95 text-xs font-bold uppercase border-b border-slate-200 dark:border-slate-800 sticky top-0 z-20">
              <th
                scope="col"
                className="p-3 text-left text-[10px] font-black text-slate-400 uppercase tracking-wider w-[210px] sticky left-0 z-30 bg-slate-100/95 dark:bg-slate-950/95 border-r border-slate-200 dark:border-slate-800"
              >
                Evaluator
              </th>
              {slots.map(slot => (
                <th key={slot} scope="col" className="p-2 text-[9.5px] font-black text-slate-600 dark:text-slate-300 border-l border-slate-100 dark:border-slate-800 whitespace-nowrap">
                  {slot}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleWeekDates.map((date, dayIdx) => {
              const info = dayOrderFor(date.dateStr, date.day, dayIdx, collegeId);
              // Period counts only exist once a campus is picked; the all-campus view runs on SME windows.
              const closed = info.isHoliday || (collegeId !== undefined && info.periods === 0);
              return (
                <React.Fragment key={date.dateStr}>
                  <tr>
                    <th
                      scope="colgroup"
                      colSpan={columnCount}
                      className={`px-4 py-1.5 text-left text-[10px] font-black uppercase tracking-wider border-y border-slate-200/80 dark:border-slate-800 ${
                        info.isHoliday
                          ? "bg-rose-50/70 text-rose-700 dark:bg-rose-950/30 dark:text-rose-300"
                          : "bg-slate-100/80 text-slate-600 dark:bg-slate-800/70 dark:text-slate-300"
                      }`}
                    >
                      <span className={info.isHoliday ? "" : "text-[#4F46E5] dark:text-[#818CF8]"}>{info.dayOrder}</span>
                      <span className="text-slate-400 dark:text-slate-500"> · {date.day.slice(0, 3)} ({date.formatted})</span>
                      <span className="text-slate-400 dark:text-slate-500">
                        {info.isHoliday ? " · campus closed" : ` · ${info.periods} timetable period${info.periods === 1 ? "" : "s"}`}
                      </span>
                    </th>
                  </tr>
                  {smes.map(sme => (
                    <tr key={`${sme.id}_${date.dateStr}`} className="border-b border-slate-100 dark:border-slate-800/70 align-top">
                      <th scope="row" className={`p-2 ${BAND_COLS}`}>
                        <div className="text-[10.5px] font-black text-slate-800 dark:text-slate-100 truncate">{sme.name}</div>
                        <div className="text-[9px] font-bold text-slate-400 truncate">{sme.subject || "Evaluator"}</div>
                      </th>
                      {slots.map(slot => {
                        const status = slotStatusAt(sme.id, date.day, date.dateStr, slot);
                        const cell = "p-1 border-l border-slate-100 dark:border-slate-800 text-center";

                        if (info.isHoliday) {
                          return (
                            <td key={slot} className={cell}>
                              <span className="block py-1 rounded-md bg-rose-50/40 dark:bg-rose-950/20 text-[9px] font-bold uppercase text-rose-600 dark:text-rose-300">
                                Holiday
                              </span>
                            </td>
                          );
                        }
                        if (status.status === "leave") {
                          return (
                            <td key={slot} className={cell}>
                              <span className="block py-1 rounded-md bg-amber-50/60 dark:bg-amber-950/20 text-[9px] font-bold text-amber-900 dark:text-amber-200">
                                SME on leave
                              </span>
                            </td>
                          );
                        }
                        if (status.status === "training") {
                          return (
                            <td key={slot} className={cell}>
                              <span className="block py-1 rounded-md bg-purple-50/60 dark:bg-purple-950/20 text-[9px] font-bold text-purple-900 dark:text-purple-200">
                                Training
                              </span>
                            </td>
                          );
                        }
                        if (status.status === "off_duty") {
                          return (
                            <td key={slot} className={cell}>
                              <span className="block py-1 rounded-md bg-slate-50/60 dark:bg-slate-900/30 text-[9px] font-medium text-slate-400 dark:text-slate-500">
                                Off-duty
                              </span>
                            </td>
                          );
                        }
                        if (status.status === "booked" && status.session) {
                          const sess = status.session;
                          const mentorName = sess.mentorName || sess.mentor_name || "Unassigned";
                          return (
                            <td key={slot} className={cell}>
                              <div className="space-y-0.5 rounded-lg bg-pink-50/80 dark:bg-pink-950/25 border border-pink-200/80 dark:border-pink-800/40 p-1.5 text-left shadow-2xs">
                                <div className="flex items-center gap-1">
                                  <button
                                    type="button"
                                    onClick={() => onOpenSession(sess)}
                                    title="View session details"
                                    className="flex-1 min-w-0 text-[10px] font-bold text-pink-950 dark:text-pink-100 truncate text-left cursor-pointer hover:underline"
                                  >
                                    {mentorName}
                                  </button>
                                  <button
                                    type="button"
                                    aria-label={`Clear ${mentorName} from ${slot} on ${date.dateStr}`}
                                    onClick={() => onAllocate(sme.id, "__CLEAR__", date.dateStr, slot, sess.id)}
                                    className="p-0.5 rounded text-pink-400 hover:text-rose-600 hover:bg-pink-100/70 dark:hover:bg-pink-900/40 shrink-0 cursor-pointer"
                                  >
                                    <X className="h-3 w-3" aria-hidden="true" />
                                  </button>
                                </div>
                                <span className="block px-1 text-[8px] font-bold uppercase text-pink-700/90 dark:text-pink-300 truncate">
                                  Booked · {sess.collegeName || "Campus"}
                                </span>
                              </div>
                            </td>
                          );
                        }

                        const free = closed ? [] : freeMentorsFor(sme.id, date.day, date.dateStr, slot, dayIdx);
                        if (free.length === 0) {
                          return (
                            <td key={slot} className={cell}>
                              <span className="block py-1 rounded-md border border-dashed border-slate-200/70 dark:border-slate-800/60 text-[9px] font-medium text-slate-400">
                                {closed ? "No timetable" : "Nobody free"}
                              </span>
                            </td>
                          );
                        }
                        return (
                          <td key={slot} className={cell}>
                            <select
                              value=""
                              aria-label={`Allocate faculty to ${sme.name} at ${slot} on ${date.day} ${date.dateStr}`}
                              onChange={e => {
                                if (e.target.value) onAllocate(sme.id, e.target.value, date.dateStr, slot);
                              }}
                              className="w-full text-[10px] font-semibold bg-white dark:bg-slate-900 border border-mint-200/70 dark:border-mint-800/50 text-mint-900 dark:text-mint-200 rounded-md px-1 py-1 focus:outline-none focus:ring-1 focus:ring-mint-400 cursor-pointer truncate"
                            >
                              <option value="" disabled>
                                -- {free.length} free --
                              </option>
                              {free.map(m => (
                                <option key={m.id} value={m.id} className="text-slate-800 bg-white">
                                  {mentorOptionLabel(m)}
                                </option>
                              ))}
                            </select>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

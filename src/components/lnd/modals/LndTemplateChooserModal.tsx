"use client";

import React from "react";
import { AlertTriangle, CheckCircle, CheckCircle2, Download, FileSpreadsheet, RefreshCw, X } from "lucide-react";
import { Dialog } from "../../ui/dialog";

/** Template chooser: pick a mentor group, see campus day-order readiness, then download. */
export interface LndTemplateChooserModalProps {
  allCollegesTimetableStatus: {
    canDownload: boolean;
    collegesWithTimetable: any[];
    collegesSkipped: any[];
    collegesMissingTimetable: any[];
    applicableColleges: any[];
  };
  colleges: any[];
  currentWeekDates: any[];
  getCollegeTimetableDayStatus: (...args: any[]) => any;
  getEffectiveDayOrderInfo: (...args: any[]) => any;
  getMentorGroup: (...args: any[]) => any;
  getSmesForSubjectGroup: (...args: any[]) => any;
  handleDownloadDemoTemplate: (...args: any[]) => any;
  isTimetableRefreshing: boolean;
  mentorGroups: any[];
  mentors: any[];
  refreshTimetableView: (...args: any[]) => any;
  setShowTemplateModal: (v: any) => void;
  setTemplateMentorGroup: (v: any) => void;
  showTemplateModal: boolean;
  smes: any[];
  templateMentorGroup: string;
}

export default function LndTemplateChooserModal({
  allCollegesTimetableStatus,
  colleges,
  currentWeekDates,
  getCollegeTimetableDayStatus,
  getEffectiveDayOrderInfo,
  getMentorGroup,
  getSmesForSubjectGroup,
  handleDownloadDemoTemplate,
  isTimetableRefreshing,
  mentorGroups,
  mentors,
  refreshTimetableView,
  setShowTemplateModal,
  setTemplateMentorGroup,
  showTemplateModal,
  smes,
  templateMentorGroup
}: LndTemplateChooserModalProps) {
  return (
      <Dialog
        open={showTemplateModal}
        onOpenChange={(next) => {
          if (!next) setShowTemplateModal(false);
        }}
        ariaLabel="Download multi-campus timetable template"
        overlayClassName="bg-slate-950/60 backdrop-blur-sm"
        panelClassName="max-w-xl rounded-2xl p-6 space-y-4 max-h-[90vh] bg-white dark:bg-[#131317]"
      >
  
          {/* Close Button */}
          <button
            onClick={() => setShowTemplateModal(false)}
            aria-label="Close template chooser"
            className="absolute right-4 top-4 p-1.5 text-slate-400 hover:text-slate-800 dark:hover:text-white rounded-xl transition-colors cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
  
          {/* Header */}
          <div className="flex items-center gap-3 border-b border-slate-100 dark:border-slate-800 pb-3.5">
            <div className="p-2.5 bg-[#4F46E5]/10 text-[#4F46E5] rounded-xl shrink-0 border border-[#4F46E5]/20">
              <FileSpreadsheet className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-black text-slate-900 dark:text-white">
                Download Multi-Campus Timetable Template
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                Includes every college whose timetable is generated ({allCollegesTimetableStatus.collegesWithTimetable.length} of {colleges.length}), with live mentor availability.
              </p>
            </div>
          </div>
  
          {/* ⚠️ TIMETABLE COVERAGE ALERT */}
          {allCollegesTimetableStatus.collegesSkipped.length > 0 || allCollegesTimetableStatus.collegesMissingTimetable.length > 0 ? (
            <div className="p-4 bg-amber-50/80 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/60 rounded-xl space-y-2">
              <div className="flex items-center gap-2 text-amber-800 dark:text-amber-300 font-extrabold text-xs">
                <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
                <span>Campuses Without a Generated Timetable</span>
              </div>
              <p className="text-[11px] text-amber-700 dark:text-amber-400 font-medium leading-relaxed">
                Campuses without a generated timetable are skipped. Missing timetables can be generated in the CM Timetable console. Active week: {currentWeekDates[0]?.formatted} – {currentWeekDates[currentWeekDates.length - 1]?.formatted}.
              </p>
              {allCollegesTimetableStatus.collegesSkipped.length > 0 && (
                <div className="space-y-1">
                  <span className="text-[10px] font-black uppercase text-amber-900 dark:text-amber-300 block">
                    Excluded from this template ({allCollegesTimetableStatus.collegesSkipped.length}):
                  </span>
                  <div className="max-h-24 overflow-y-auto space-y-1 text-[10.5px] font-semibold text-amber-800 dark:text-amber-300">
                    {allCollegesTimetableStatus.collegesSkipped.map((c, i) => (
                      <div key={i} className="flex items-start gap-1.5">
                        <span className="text-amber-600 font-bold">•</span>
                        <span><strong>{c.name}</strong>: No timetable periods generated at all</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {allCollegesTimetableStatus.collegesMissingTimetable.length > 0 && (
                <div className="pt-1.5 border-t border-amber-200/60 dark:border-amber-900/60 space-y-1">
                  <span className="text-[10px] font-black uppercase text-amber-900 dark:text-amber-300 block">
                    Included, but missing days ({allCollegesTimetableStatus.collegesMissingTimetable.length}):
                  </span>
                  <div className="max-h-24 overflow-y-auto space-y-1 text-[10.5px] font-semibold text-amber-800 dark:text-amber-300">
                    {allCollegesTimetableStatus.collegesMissingTimetable.map((u, i) => (
                      <div key={i} className="flex items-start gap-1.5">
                        <span className="text-amber-600 font-bold">•</span>
                        <span><strong>{u.college.name}:</strong> No timetable on [{u.missingDates.join(", ")}]</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="p-3 bg-emerald-50/80 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/60 rounded-xl flex items-center gap-2.5">
              <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
              <span className="text-xs font-bold text-emerald-800 dark:text-emerald-300">
                Timetable available for all {allCollegesTimetableStatus.applicableColleges.length} colleges. Ready for template generation.
              </span>
            </div>
          )}
  
          {/* Department / Scope Selector */}
          {(() => {
            const activeGroup = templateMentorGroup || "All";
            const isAllGroups = activeGroup === "All";
            const groupMentors = isAllGroups
              ? mentors
              : mentors.filter(m => m && getMentorGroup(m).toLowerCase().trim() === activeGroup.toLowerCase().trim());
            const groupSmes = isAllGroups
              ? smes
              : getSmesForSubjectGroup(activeGroup);
  
            return (
              <div className="space-y-3">
                <div>
                  <label className="text-[11px] font-black uppercase tracking-wider text-slate-700 dark:text-slate-300 block mb-1.5">
                    Department / Mentor Group Scope
                  </label>
                  <select
                    value={activeGroup}
                    aria-label="Department / Mentor Group Scope"
                    onChange={(e) => setTemplateMentorGroup(e.target.value)}
                    className="w-full px-3.5 py-2.5 text-xs font-bold rounded-xl border border-slate-200 inset-shadow-well focus:bg-white dark:focus:bg-[#131317] dark:border-slate-800 bg-sunken/50 dark:bg-slate-800/50 text-slate-800 dark:text-white focus:ring-2 focus:ring-[#4F46E5] cursor-pointer"
                  >
                    <option value="All">All Departments (Comprehensive Multi-College Roster)</option>
                    {mentorGroups.map(group => (
                      <option key={group} value={group}>{group}</option>
                    ))}
                  </select>
                </div>
  
                {/* Scope Micro-Pills */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <div className="p-2 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-100 dark:border-slate-800/80 text-center">
                    <span className="text-[9px] font-black uppercase text-slate-400 block">Colleges Included</span>
                    <span className="text-xs font-black text-[#4F46E5] dark:text-[#818CF8]">{allCollegesTimetableStatus.applicableColleges.length} Campuses</span>
                  </div>
                  <div className="p-2 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-100 dark:border-slate-800/80 text-center">
                    <span className="text-[9px] font-black uppercase text-slate-400 block">Faculty Mentors</span>
                    <span className="text-xs font-black text-slate-800 dark:text-white">{groupMentors.length}</span>
                  </div>
                  <div className="p-2 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-100 dark:border-slate-800/80 text-center">
                    <span className="text-[9px] font-black uppercase text-slate-400 block">Assigned SMEs</span>
                    <span className="text-xs font-black text-[#4F46E5] dark:text-[#818CF8]">{groupSmes.length}</span>
                  </div>
                </div>
              </div>
            );
          })()}
  
          {/* Campus Timetable Status Overview — every college listed with its own covered/uncovered days */}
          <div className="p-3.5 bg-slate-50 dark:bg-slate-800/30 rounded-xl border border-slate-100 dark:border-slate-800">
            {(() => {
              const rows = allCollegesTimetableStatus.applicableColleges.map((c) => ({
                college: c,
                status: getCollegeTimetableDayStatus(c.id),
                days: currentWeekDates.map((w, idx) => ({
                  ...w,
                  ...getEffectiveDayOrderInfo(w.dateStr, w.day, idx, c.id),
                })),
              }));
              const readyCount = rows.filter((r) => r.status.isReady).length;
              const allReady = rows.length > 0 && readyCount === rows.length;
  
              return (
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="text-[10.5px] font-black uppercase tracking-wider text-slate-700 dark:text-slate-300">
                        Campus Timetable Check
                      </span>
                      <span className={`shrink-0 px-2 py-0.5 rounded-full text-[9.5px] font-black ${allReady
                        ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300"
                        : "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300"
                        }`}>
                        {readyCount} / {rows.length} ready
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={refreshTimetableView}
                      disabled={isTimetableRefreshing}
                      className="p-1 text-slate-400 hover:text-[#4F46E5] dark:hover:text-[#818CF8] rounded-lg transition-colors cursor-pointer flex items-center gap-1 text-[10px] disabled:opacity-60 disabled:cursor-wait"
                      title="Reload the generated timetables and day orders"
                    >
                      <RefreshCw className={`h-3 w-3 ${isTimetableRefreshing ? "animate-spin" : ""}`} />
                      <span className="text-[9.5px] font-bold">Refresh</span>
                    </button>
                  </div>
  
                  <div className="max-h-60 space-y-1.5 overflow-y-auto pr-0.5">
                    {rows.map(({ college, status, days }) => (
                      <div
                        key={college.id}
                        className="flex items-center gap-3 rounded-2xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900/60 p-2 shadow-card"
                      >
                        <div className="flex w-32 shrink-0 flex-col gap-1 sm:w-40">
                          <span className="truncate text-[11px] font-black text-slate-800 dark:text-white" title={college.name}>
                            {college.name}
                          </span>
                          {status.isReady ? (
                            <span className="flex items-center gap-1 text-[9.5px] font-black uppercase tracking-tight text-emerald-700 dark:text-emerald-300">
                              <CheckCircle2 className="h-3 w-3 shrink-0" /> Timetable ready
                            </span>
                          ) : (
                            <span className="flex items-center gap-1 text-[9.5px] font-black uppercase tracking-tight text-amber-700 dark:text-amber-300">
                              <AlertTriangle className="h-3 w-3 shrink-0" /> {status.readyCount}/{status.totalDates} days set
                            </span>
                          )}
                        </div>
                        <div className="grid flex-1 grid-cols-5 gap-1">
                          {days.map((d) => (
                            <div
                              key={d.dateStr}
                              title={`${d.dateStr} · runs ${d.effectiveTimetableDay} timetable · ${d.isHoliday ? "closed" : `${d.periods} period(s)`}`}
                              className={`rounded-lg border p-1 text-center transition-all ${d.isHoliday
                                ? "bg-rose-50/80 border-rose-200 text-rose-700 dark:bg-rose-950/30 dark:border-rose-900 dark:text-rose-300"
                                : d.periods > 0
                                  ? "bg-emerald-50/80 border-emerald-200 text-emerald-800 dark:bg-emerald-950/30 dark:border-emerald-900 dark:text-emerald-300"
                                  : "bg-amber-50/80 border-amber-200 text-amber-800 dark:bg-amber-950/30 dark:border-amber-900 dark:text-amber-300"
                                }`}
                            >
                              <span className="block text-[8.5px] font-bold text-slate-400 uppercase tracking-tight">
                                {d.day.slice(0, 3)}
                                {!d.isHoliday && d.effectiveTimetableDay.slice(0, 3) !== d.day.slice(0, 3)
                                  ? ` → ${d.effectiveTimetableDay.slice(0, 3)}`
                                  : ""}
                              </span>
                              <span className={`block text-[10px] font-black mt-0.5 tracking-tight ${d.isHoliday
                                ? "text-rose-600 dark:text-rose-400"
                                : d.periods > 0
                                  ? "text-emerald-700 dark:text-emerald-400"
                                  : "text-amber-700 dark:text-amber-400"
                                }`}>
                                {d.isHoliday ? "Closed" : `${d.periods} periods`}
                              </span>
                              <span className={`block text-[7.5px] font-bold uppercase tracking-tight ${d.isHoliday
                                ? "text-rose-600"
                                : d.periods > 0
                                  ? "text-emerald-600 dark:text-emerald-400"
                                  : "text-amber-600"
                                }`}>
                                {d.isHoliday ? "Holiday" : d.periods > 0 ? "Timetable set" : "No timetable"}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                    {rows.length === 0 && (
                      <p className="py-2 text-center text-[10.5px] font-semibold text-slate-500 dark:text-slate-400">
                        No colleges in scope for this week.
                      </p>
                    )}
                  </div>
                </div>
              );
            })()}
          </div>
  
          {/* Template Package Overview Card */}
          <div className="px-3.5 py-2.5 bg-[#4F46E5]/5 dark:bg-[#4F46E5]/10 rounded-xl border border-[#4F46E5]/20 dark:border-[#4F46E5]/30 text-[10.5px] text-slate-600 dark:text-slate-300 flex items-center gap-2">
            <CheckCircle className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
            <span className="text-[10.5px] text-slate-600 dark:text-slate-300">
              Includes <strong>Master_LnD_Schedule</strong>, <strong>Master_Grid</strong> matrix with live faculty availability dropdowns, and <strong>Mentor_Summary</strong>.
            </span>
          </div>
  
          {/* Modal Footer Actions */}
          <div className="flex justify-end gap-2.5 pt-2 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              onClick={() => setShowTemplateModal(false)}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-bold transition-all cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => handleDownloadDemoTemplate(templateMentorGroup || "All")}
              disabled={!allCollegesTimetableStatus.canDownload}
              className={`px-5 py-2.5 rounded-xl text-xs font-extrabold flex items-center gap-2 transition-all shadow-md ${allCollegesTimetableStatus.canDownload
                  ? "bg-gradient-to-r from-[#4F46E5] to-[#7C3AED] hover:opacity-95 text-white shadow-[#4F46E5]/25 cursor-pointer"
                  : "bg-slate-200 dark:bg-slate-800 text-slate-400 cursor-not-allowed border border-slate-300 dark:border-slate-700 shadow-none"
                }`}
              title={allCollegesTimetableStatus.canDownload
                ? `Download Excel template for ${allCollegesTimetableStatus.collegesWithTimetable.length} campus(es) with a generated timetable`
                : "No campus has a generated timetable yet — generate one in the CM Timetable console"}
            >
              <Download className="h-4 w-4" />
              {allCollegesTimetableStatus.canDownload ? "Download Multi-Campus Template (.xlsx)" : "No Campus Timetable Generated"}
            </button>
          </div>
  
      </Dialog>
  );
}

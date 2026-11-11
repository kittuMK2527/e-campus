"use client";

import React, { useState } from "react";
import { useApp, Slot, Mentor } from "@/context/AppContext";
import {
  X,
  Mail,
  Clock,
  BookOpen,
  MapPin,
  Building2,
  Calendar,
  History,
  CheckCircle,
  Briefcase,
  Layers,
  Award,
  Sparkles
} from "lucide-react";
import { formatTimeLabel, isSubjectNameMatch } from "@/lib/utils";
import { Dialog } from "@/components/ui/dialog";
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from "@/components/ui/table";

interface MentorProfileModalProps {
  mentor: Mentor | null;
  isOpen: boolean;
  onClose: () => void;
}

export const MentorProfileModal: React.FC<MentorProfileModalProps> = ({
  mentor,
  isOpen,
  onClose
}) => {
  const { slots, requests, approvedHandovers, colleges, shiftTimeSlots, getTimeSlots, daysOfWeek, mentors, weekDates, subjectsList } = useApp();
  // Use the slot-based shift context (general by default) for showing timetable periods
  const mentorTimeSlots = getTimeSlots("general", mentor?.classes);
  const [activeSubTab, setActiveSubTab] = useState<"workload" | "schedule" | "handovers">("workload");

  if (!isOpen || !mentor) return null;

  // Helper to parse class group name and semester
  const parseClassGroup = (classGroup?: string) => {
    if (!classGroup) return { name: "General Class", sem: "" };
    const semMatch = classGroup.match(/(SEM\s+[IVXLCDM]+|SEM\s+[0-9]+|Semester\s+[IVXLCDM]+|Semester\s+[0-9]+)/i);
    const sem = semMatch ? semMatch[0].toUpperCase() : "";
    let cleanName = classGroup;
    if (semMatch) {
      const index = classGroup.indexOf(semMatch[0]);
      cleanName = classGroup.slice(0, index).replace(/-\s*$/, "").trim();
    }
    cleanName = cleanName.replace(/\(\s*\)\s*$/, "").replace(/-\s*$/, "").trim();
    return { name: cleanName, sem };
  };

  const getShortClassGroup = (classGroup?: string) => {
    if (!classGroup) return { name: "General Class", sem: "" };
    const { name, sem } = parseClassGroup(classGroup);
    let dept = name;
    const c = name.toLowerCase();
    if (c.includes("ai") || c.includes("artificial")) dept = "CS AI";
    else if (c.includes("cloud") || c.includes("cc")) dept = "CS CC";
    else if (c.includes("data") || c.includes("ds")) dept = "CS DS";
    else if (c.includes("computer science") || c.includes("cs")) dept = "CS";
    else if (c.includes("aviation") || c.includes("airport") || c.includes("aa")) dept = "BBA Aviation";
    else if (c.includes("fashion") || c.includes("fm")) dept = "Fashion Tech";
    else if (c.includes("fintech") || c.includes("com")) dept = "B.Com FinTech";
    else if (c.includes("bba")) dept = "BBA";
    else if (c.includes("bcom") || c.includes("b.com")) dept = "B.Com";
    
    if (c.includes("shift 1") || c.includes("shift-1") || c.includes("s1")) {
      dept += " (S1)";
    } else if (c.includes("shift 2") || c.includes("shift-2") || c.includes("s2")) {
      dept += " (S2)";
    }
    return { name: dept, sem };
  };

  const getSemForClass = (cls: string) => {
    const c = cls.toLowerCase();
    if (c.includes("sem i") || c.includes("semester i") || c.includes("sem 1") || c.includes("semester 1")) return "Sem I";
    if (c.includes("sem ii") || c.includes("semester ii") || c.includes("sem 2") || c.includes("semester 2")) return "Sem II";
    if (c.includes("sem iii") || c.includes("semester iii") || c.includes("sem 3") || c.includes("semester 3")) return "Sem III";
    if (c.includes("sem iv") || c.includes("semester iv") || c.includes("sem 4") || c.includes("semester 4")) return "Sem IV";
    if (c.includes("sem v") || c.includes("semester v") || c.includes("sem 5") || c.includes("semester 5")) return "Sem V";
    if (c.includes("sem vi") || c.includes("semester vi") || c.includes("sem 6") || c.includes("semester 6")) return "Sem VI";
    
    // Fallbacks
    if (c.includes("1st sem") || c.includes("first sem")) return "Sem I";
    if (c.includes("2nd sem") || c.includes("second sem")) return "Sem II";
    if (c.includes("3rd sem") || c.includes("third sem")) return "Sem III";
    if (c.includes("4th sem") || c.includes("fourth sem")) return "Sem IV";
    if (c.includes("5th sem") || c.includes("fifth sem")) return "Sem V";
    if (c.includes("6th sem") || c.includes("sixth sem")) return "Sem VI";
    return "";
  };

  const getYearForClass = (classGroup?: string) => {
    if (!classGroup) return "";
    const cg = classGroup.toLowerCase();
    
    // 1. Check explicit semester numbers
    if (cg.includes("sem vi") || cg.includes("sem 6") || cg.includes("semester vi") || cg.includes("semester 6")) return "3rd Year";
    if (cg.includes("sem v") || cg.includes("sem 5") || cg.includes("semester v") || cg.includes("semester 5")) return "3rd Year";
    if (cg.includes("sem iv") || cg.includes("sem 4") || cg.includes("semester iv") || cg.includes("semester 4")) return "2nd Year";
    if (cg.includes("sem iii") || cg.includes("sem 3") || cg.includes("semester iii") || cg.includes("semester 3")) return "2nd Year";
    if (cg.includes("sem ii") || cg.includes("sem 2") || cg.includes("semester ii") || cg.includes("semester 2")) return "1st Year";
    if (cg.includes("sem i") || cg.includes("sem 1") || cg.includes("semester i") || cg.includes("semester 1")) return "1st Year";
    
    // 2. Check by cohort year in parentheses (fallback)
    const batchMatch = cg.match(/(20\d{2})\s*[-–]\s*(20\d{2})/);
    if (batchMatch) {
      const batchStart = parseInt(batchMatch[1], 10);
      const batchEnd = parseInt(batchMatch[2], 10);
      const now = new Date();
      // Academic year starts in June; Jan–May still belongs to the previous academic year.
      const academicYear = now.getMonth() >= 5 ? now.getFullYear() : now.getFullYear() - 1;
      const yearLabels = ["1st Year", "2nd Year", "3rd Year", "4th Year"];
      const maxYear = Math.max(1, batchEnd - batchStart);
      const yearOfStudy = academicYear - batchStart + 1;
      return yearLabels[Math.min(Math.max(yearOfStudy, 1), maxYear) - 1] ?? "";
    }
    
    // 3. Fallback to explicit year strings
    if (cg.includes("3rd year") || cg.includes("3rdyr") || cg.includes("3rd yr") || cg.includes("3nd year") || cg.includes("3ndyr")) return "3rd Year";
    if (cg.includes("2nd year") || cg.includes("2ndyr") || cg.includes("2nd yr")) return "2nd Year";
    if (cg.includes("1st year") || cg.includes("1styr") || cg.includes("1st yr") || cg.includes("1nd year") || cg.includes("1ndyr")) return "1st Year";
    
    return "";
  };

  const getClassGroupLabel = (classGroup?: string) => {
    if (!classGroup) return "";
    const { name: shortDept, sem: shortSem } = getShortClassGroup(classGroup);
    const yearStr = getYearForClass(classGroup);
    const calculatedSem = shortSem || getSemForClass(classGroup);
    return `${shortDept}${yearStr ? ` ${yearStr}` : ""}${calculatedSem ? ` (${calculatedSem})` : ""}`;
  };

  // Get college info
  const college = colleges.find(c => c.id === mentor.college_id);

  // Filter slots for this mentor
  const mentorSlots = slots.filter(s => s.mentorId === mentor.id);

  // Handover Stats (All time for logs, but we compute weekly stats below for current week view)
  const sentHandovers = requests.filter(r => r.requestorId === mentor.id);
  const coveredHandovers = approvedHandovers.filter(h => h.coverStaffId === mentor.id);

  // Find covered classes/slots (All time for logs)
  const coveredSlots = coveredHandovers
    .map(h => slots.find(s => s.id === h.slotId))
    .filter(Boolean) as Slot[];

  // ── Actual duration calculator ──────────────────────────────────────────
  // Parses "8.20 AM - 9.10 AM", "9.00 A.M to 10.00 A.M", "11:15 AM to 12.15P.M", etc.
  const parseSlotMinutes = (timeStr: string): number => {
    const parts = timeStr.replace(/to/i, "-").split("-").map(p => p.trim()).filter(Boolean);
    if (parts.length < 2) return 60;
    const parseTime = (t: string): number | null => {
      const m = t.match(/(\d{1,2})[.:]\s*(\d{2})\s*(A\.?M\.?|P\.?M\.?)/i);
      if (!m) return null;
      let h = parseInt(m[1], 10);
      const min = parseInt(m[2], 10);
      const period = m[3].replace(/\./g, "").toUpperCase();
      if (period === "PM" && h !== 12) h += 12;
      if (period === "AM" && h === 12) h = 0;
      return h * 60 + min;
    };
    const start = parseTime(parts[0]);
    const end = parseTime(parts[parts.length - 1]);
    if (start === null || end === null || end <= start) return 60;
    return end - start;
  };
  const toHrs = (mins: number) => (mins / 60).toFixed(1).replace(".0", "");

  // Extra coverage hours for the current week (from approved handovers scheduled in this week's dates)
  const currentWeekDateStrings = weekDates.map(d => d.dateStr);
  const weeklyCoveredHandovers = approvedHandovers.filter(
    h => h.coverStaffId === mentor.id && currentWeekDateStrings.includes(h.dateStr)
  );
  const weeklyCoveredSlots = weeklyCoveredHandovers
    .map(h => slots.find(s => s.id === h.slotId))
    .filter(Boolean) as Slot[];

  // Regular timetable hours (own slots) vs Extra coverage hours (handover coverage in active week)
  const timetableMinutes = mentorSlots.reduce((acc, s) => acc + parseSlotMinutes(s.time), 0);
  const extraMinutes = weeklyCoveredSlots.reduce((acc, s) => acc + parseSlotMinutes(s.time), 0);
  const totalMinutes = timetableMinutes + extraMinutes;

  const cleanSubjectName = (name: string): string => {
    return name.trim().replace(/[,;/]+$/, "").trim();
  };

  const getCanonicalSubjectName = (name: string): string => {
    const cleaned = cleanSubjectName(name);
    const match = (subjectsList || []).find(sub => isSubjectNameMatch(sub.name, cleaned));
    return match ? match.name : cleaned;
  };

  const subjectsArray = mentor.subjects
    ? mentor.subjects.split(/\n|\/|,|;/).map(s => getCanonicalSubjectName(s)).filter(Boolean)
    : [];

  const classesArray = mentor.classes
    ? mentor.classes.split(/\n|,|;/).map(c => c.trim()).filter(Boolean)
    : [];

  // Calculate target and covered minutes per subject dynamically
  const subjectTargetMinutesMap: Record<string, number> = {};
  mentorSlots.forEach((slot) => {
    const course = getCanonicalSubjectName(slot.course || "General");
    subjectTargetMinutesMap[course] = (subjectTargetMinutesMap[course] || 0) + parseSlotMinutes(slot.time);
  });

  const subjectCoveredMinutesMap: Record<string, number> = {};
  weeklyCoveredHandovers.forEach((h) => {
    const slot = slots.find(s => s.id === h.slotId);
    if (!slot) return;
    const course = getCanonicalSubjectName(h.course || slot.course || "General");
    subjectCoveredMinutesMap[course] = (subjectCoveredMinutesMap[course] || 0) + parseSlotMinutes(slot.time);
  });

  const activeSubjectsList = Object.keys(subjectTargetMinutesMap);
  const weeklyCoveredSubjectsList = Array.from(
    new Set(weeklyCoveredHandovers.map(h => {
      const slot = slots.find(s => s.id === h.slotId);
      return getCanonicalSubjectName(h.course || slot?.course || "General");
    }))
  );
  const allSubjects = Array.from(new Set([...subjectsArray, ...activeSubjectsList, ...weeklyCoveredSubjectsList]));

  // Calculate active classes in slots
  const activeClassLabels = Array.from(
    new Set(
      mentorSlots
        .map((s) => s.classGroup)
        .filter(Boolean)
        .map((cg) => getClassGroupLabel(cg))
    )
  );
  
  const coveredClassLabels = Array.from(
    new Set(
      weeklyCoveredSlots
        .map((s) => s.classGroup)
        .filter(Boolean)
        .map((cg) => getClassGroupLabel(cg))
    )
  );

  const formattedClassesArray = classesArray.map(c => getClassGroupLabel(c)).filter(Boolean);
  const allClassLabels = Array.from(new Set([...formattedClassesArray, ...activeClassLabels, ...coveredClassLabels]));


  return (
    <Dialog
      open={isOpen}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      ariaLabel={`Mentor profile — ${mentor.name}`}
      overlayClassName="bg-slate-950/60 backdrop-blur-sm p-2 sm:p-4"
      panelClassName="max-w-4xl h-[90vh] max-h-[90vh] md:h-auto md:max-h-[90vh] p-0 space-y-0 overflow-y-auto md:overflow-hidden flex flex-col md:flex-row border-gray-100 shadow-card-lg scroll-touch"
    >
      {/* Close Button */}
      <button
        onClick={onClose}
        aria-label="Close profile"
        className="absolute right-4 top-4 p-2 bg-white/80 hover:bg-red-50 hover:text-red-500 border border-gray-200/60 rounded-full transition-all text-gray-500 cursor-pointer z-10"
        title="Close profile"
      >
        <X className="h-4 w-4" />
      </button>

        {/* Left Panel: Profile Detail Overview */}
        <div className="w-full md:w-[32%] bg-slate-50 border-r border-slate-100 p-6 flex flex-col gap-5 select-none shrink-0">
          <div className="text-center space-y-3 pt-4">
            <div className="h-16 w-16 mx-auto rounded-xl btn-gradient flex items-center justify-center font-extrabold text-white text-xl shadow-md">
              {mentor.avatar}
            </div>
            <div>
              <h3 className="text-base font-black text-slate-800 leading-tight">{mentor.name}</h3>
              <p className="text-[10px] font-mono text-slate-400 mt-1 font-semibold">ID: {mentor.id}</p>
            </div>
          </div>

          <div className="space-y-2 text-xs">
            <div className="flex items-center gap-2 text-slate-600 bg-white border border-slate-100 p-2.5 rounded-xl">
              <Mail className="h-4 w-4 text-slate-400 shrink-0" />
              <span className="truncate font-semibold">{mentor.email}</span>
            </div>

            <div className="flex items-center gap-2 text-indigo-700 bg-indigo-50 border border-indigo-100 p-2.5 rounded-xl">
              <Sparkles className="h-4 w-4 text-indigo-500 shrink-0" />
              <span className="truncate font-extrabold">
                Mentor Group: {mentor.mentor_group || mentor.subject_group || mentor.department || "General"}
              </span>
            </div>

            <div className="flex items-center gap-2 text-slate-600 bg-white border border-slate-100 p-2.5 rounded-xl">
              <Clock className="h-4 w-4 text-slate-400 shrink-0" />
              <span className="font-bold text-slate-700 capitalize">
                Faculty Mentor
              </span>
            </div>

            {college && (
              <div className="flex items-center gap-2 text-slate-600 bg-white border border-slate-100 p-2.5 rounded-xl">
                <Award className="h-4 w-4 text-slate-400 shrink-0" />
                <span className="truncate font-bold text-indigo-700">{college.name}</span>
              </div>
            )}
          </div>

          <hr className="border-slate-200" />

          {/* Key Workload Metrics */}
          <div className="grid grid-cols-1 gap-2.5 mt-auto">
            {/* Hours Split Card */}
            <div className="bg-white border border-slate-100 rounded-2xl overflow-hidden shadow-card">
              {/* Total */}
              <div className="px-3 pt-3 pb-1 text-center">
                <span className="block text-2xl font-black text-gradient">{toHrs(totalMinutes)} hrs</span>
                <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">Total Weekly Hours</span>
              </div>
              {/* Progress bar split */}
              {totalMinutes > 0 && (
                <div className="flex h-1.5 mx-3 rounded-full overflow-hidden gap-px my-2">
                  <div className="bg-indigo-500 rounded-l-full" style={{ width: `${(timetableMinutes / totalMinutes) * 100}%` }} />
                  {extraMinutes > 0 && (
                    <div className="bg-teal-400 rounded-r-full" style={{ width: `${(extraMinutes / totalMinutes) * 100}%` }} />
                  )}
                </div>
              )}
              {/* Split labels */}
              <div className="flex divide-x divide-slate-100 border-t border-slate-100">
                <div className="flex-1 px-2 py-2 text-center">
                  <span className="flex items-center justify-center gap-1 mb-0.5">
                    <span className="inline-block w-2 h-2 rounded-full bg-indigo-500"></span>
                    <span className="text-[9px] font-extrabold text-slate-500 uppercase">Timetable</span>
                  </span>
                  <span className="text-sm font-black text-indigo-700">{toHrs(timetableMinutes)} hrs</span>
                  <span className="block text-[8px] text-slate-400">{mentorSlots.length} periods</span>
                </div>
                <div className="flex-1 px-2 py-2 text-center">
                  <span className="flex items-center justify-center gap-1 mb-0.5">
                    <span className="inline-block w-2 h-2 rounded-full bg-teal-400"></span>
                    <span className="text-[9px] font-extrabold text-slate-500 uppercase">Extra Cover (this week)</span>
                  </span>
                  <span className="text-sm font-black text-teal-600">{extraMinutes > 0 ? `+${toHrs(extraMinutes)} hrs` : "—"}</span>
                  <span className="block text-[8px] text-slate-400">{coveredSlots.length} covered</span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="bg-white border border-slate-100 p-2.5 rounded-2xl text-center shadow-card">
                <span className="block text-sm font-black text-slate-800">{allClassLabels.length}</span>
                <span className="text-[8px] text-slate-400 font-bold uppercase tracking-wider block truncate">Target Classes</span>
              </div>

              <div className="bg-white border border-slate-100 p-2.5 rounded-2xl text-center shadow-card">
                <span className="block text-sm font-black text-slate-800">{allSubjects.length}</span>
                <span className="text-[8px] text-slate-400 font-bold uppercase tracking-wider block truncate">Subjects</span>
              </div>
            </div>
          </div>
        </div>

        {/* Right Panel: Content Tabs */}
        <div className="flex-grow flex flex-col min-w-0">
          {/* Tabs Navigation */}
          <div className="flex border-b border-gray-100 bg-slate-50/50 p-2 gap-1.5 select-none shrink-0">
            <button
              onClick={() => setActiveSubTab("workload")}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                activeSubTab === "workload"
                  ? "bg-white text-indigo-700 shadow-sm border border-gray-200/60"
                  : "text-slate-500 hover:text-slate-800"
              }`}
            >
              <Briefcase className="h-4 w-4" />
              Workload Profile
            </button>
            <button
              onClick={() => setActiveSubTab("schedule")}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                activeSubTab === "schedule"
                  ? "bg-white text-indigo-700 shadow-sm border border-gray-200/60"
                  : "text-slate-500 hover:text-slate-800"
              }`}
            >
              <Calendar className="h-4 w-4" />
              Timetable Grid
            </button>
            <button
              onClick={() => setActiveSubTab("handovers")}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                activeSubTab === "handovers"
                  ? "bg-white text-indigo-700 shadow-sm border border-gray-200/60"
                  : "text-slate-500 hover:text-slate-800"
              }`}
            >
              <History className="h-4 w-4" />
              Handover Logs (All-time: {sentHandovers.length + coveredHandovers.length})
            </button>
          </div>

          {/* Subtab Contents */}
          <div className="flex-1 p-4 md:p-6 overflow-y-visible md:overflow-y-auto min-h-0 bg-white">
            {/* Workload Profile Subtab */}
            {activeSubTab === "workload" && (
              <div className="space-y-6">
                <div>
                  <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-3">Subjects Breakdown</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {allSubjects.map((sub, idx) => {
                      const targetMins = subjectTargetMinutesMap[sub] || 0;
                      const coveredMins = subjectCoveredMinutesMap[sub] || 0;
                      const isMapped = subjectsArray.includes(sub);
                      const isTeaching = activeSubjectsList.includes(sub);
                      const isCovered = weeklyCoveredSubjectsList.includes(sub);
                      return (
                        <div key={idx} className="flex items-center justify-between p-3 border border-slate-100 rounded-xl bg-slate-50/20 shadow-xs hover:border-slate-300 transition-colors">
                          <div className="space-y-1 max-w-[65%]">
                            <span className="font-bold text-slate-800 block truncate text-xs" title={sub}>{sub}</span>
                            <div className="flex gap-1.5 items-center">
                              {isMapped && (
                                <span className="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-100 text-[8px] font-black uppercase">Mapped</span>
                              )}
                              {isTeaching && (
                                <span className="px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-100 text-[8px] font-black uppercase">Teaching</span>
                              )}
                              {isCovered && (
                                <span className="px-1.5 py-0.5 rounded bg-teal-50 text-teal-700 border border-teal-100 text-[8px] font-black uppercase">Covering</span>
                              )}
                            </div>
                          </div>
                          <div className="flex flex-col gap-1 items-end shrink-0">
                            {targetMins > 0 && (
                              <span className="px-2 py-1 rounded-lg bg-indigo-50/80 border border-indigo-100 text-[10px] font-extrabold text-indigo-700 whitespace-nowrap shadow-xs">
                                {toHrs(targetMins)} hr{toHrs(targetMins) !== '1' ? 's' : ''}/wk
                              </span>
                            )}
                            {coveredMins > 0 && (
                              <span className="px-2 py-1 rounded-lg bg-teal-50 border border-teal-100 text-[10px] font-extrabold text-teal-600 whitespace-nowrap shadow-xs">
                                +{toHrs(coveredMins)} hr{toHrs(coveredMins) !== '1' ? 's' : ''} cover
                              </span>
                            )}
                            {targetMins === 0 && coveredMins === 0 && (
                              <span className="px-2 py-1 rounded-lg bg-slate-50 border border-slate-200 text-[10px] font-medium text-slate-400 whitespace-nowrap">
                                0 hrs
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                    {allSubjects.length === 0 && (
                      <p className="text-xs text-slate-400 italic">No subject allocations found.</p>
                    )}
                  </div>
                </div>

                <hr className="border-slate-100" />

                <div>
                  <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-3">Target Classes / Cohorts</h4>
                  <div className="flex flex-wrap gap-2">
                    {allClassLabels.map((lbl, idx) => {
                      const isMapped = formattedClassesArray.includes(lbl);
                      const isTeaching = activeClassLabels.includes(lbl);
                      const isCovered = coveredClassLabels.includes(lbl);
                      return (
                        <span 
                          key={idx} 
                          className={`px-3 py-2 rounded-xl text-xs font-bold border flex items-center gap-1.5 shadow-xs ${
                            isTeaching 
                              ? "bg-teal-50 border-teal-200 text-teal-800" 
                              : isCovered
                              ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                              : "bg-slate-50 border-slate-200 text-slate-700"
                          }`}
                        >
                          <Layers className="h-3 w-3 shrink-0" />
                          {lbl}
                          {isMapped && !isTeaching && !isCovered && (
                            <span className="px-1.5 py-0.2 rounded bg-slate-200 text-slate-700 text-[7.5px] font-black uppercase">Profile</span>
                          )}
                          {isTeaching && (
                            <span className="px-1.5 py-0.2 rounded bg-teal-200 text-teal-800 text-[7.5px] font-black uppercase">Active</span>
                          )}
                          {isCovered && (
                            <span className="px-1.5 py-0.2 rounded bg-emerald-200 text-emerald-800 text-[7.5px] font-black uppercase">Cover</span>
                          )}
                        </span>
                      );
                    })}
                    {allClassLabels.length === 0 && (
                      <p className="text-xs text-slate-400 italic">No target class allocations found.</p>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Timetable Grid Subtab */}
            {activeSubTab === "schedule" && (
              <div className="space-y-4">
                <div className="flex justify-between items-center pb-2">
                  <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest">Active Weekly Class Slots</h4>
                </div>

                <div className="overflow-x-auto border border-slate-200 rounded-xl shadow-xs">
                  <Table className="w-full border-collapse text-left text-xs min-w-[650px] table-fixed">
                    <TableHeader>
                      <TableRow className="bg-sunken border-b border-slate-200">
                        <TableHead className="p-3 font-bold text-slate-500 uppercase text-[10px] w-[18%]">Hour / Time</TableHead>
                        {daysOfWeek.map((day) => (
                          <TableHead key={day} className="p-3 font-bold text-slate-700 w-[16.4%]">{day}</TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody className="divide-y divide-slate-100 bg-white">
                      {mentorTimeSlots.map((time) => (
                        <TableRow key={time} className="hover:bg-slate-50/30 transition-colors">
                          <TableCell className="p-3 font-bold text-slate-700 border-r border-slate-100 bg-slate-50/5">
                            {formatTimeLabel(time)}
                          </TableCell>
                          {daysOfWeek.map((day) => {
                            // 1. Check if the mentor owns this slot
                            const ownSlot = mentorSlots.find(
                              (s) => s.day === day && s.time === time
                            );

                            // 2. Check if this mentor is covering another mentor's slot via approved handovers
                            const coverHandoversForCell = coveredHandovers.filter((h) => {
                              const s = slots.find((slot) => slot.id === h.slotId);
                              return (
                                s &&
                                s.day === day &&
                                s.time === time
                              );
                            });

                            const coverSlots = coverHandoversForCell
                              .map((h) => {
                                const s = slots.find((slot) => slot.id === h.slotId);
                                const originalMentor = mentors.find((m) => m.id === h.originalMentorId);
                                return {
                                  slot: s,
                                  dateStr: h.dateStr,
                                  originalMentorName: originalMentor?.name || "Staff",
                                };
                              })
                              .filter((x) => x.slot) as {
                              slot: Slot;
                              dateStr: string;
                              originalMentorName: string;
                            }[];

                            const ownSlotHandovers = ownSlot
                              ? approvedHandovers.filter((h) => h.slotId === ownSlot.id)
                              : [];

                            return (
                              <TableCell key={day} className="p-1.5 h-20 border-r border-slate-100 last:border-r-0">
                                {ownSlot ? (
                                  ownSlotHandovers.length > 0 ? (
                                    <div 
                                      className="h-full bg-amber-50/40 border border-dashed border-amber-300 rounded-lg p-1.5 flex flex-col justify-between text-[10px] leading-tight hover:border-amber-400 transition-colors"
                                      title={`${ownSlot.course} - Handed over`}
                                    >
                                      <div className="font-extrabold text-amber-900 truncate">
                                        {ownSlot.course}
                                      </div>
                                      <div className="text-slate-500 font-bold truncate">
                                        {getClassGroupLabel(ownSlot.classGroup)}
                                      </div>
                                      <div className="text-[7.5px] text-amber-700 font-semibold space-y-0.5 mt-auto">
                                        {ownSlotHandovers.map((h) => (
                                          <div key={h.requestId} className="truncate">
                                            ↳ Handed over to {h.coverStaffName} ({h.dateStr})
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  ) : (
                                    <div className="h-full bg-indigo-50/40 border border-indigo-100 rounded-lg p-1.5 flex flex-col justify-between text-[10px] leading-tight hover:border-indigo-400 transition-colors">
                                      <div className="font-extrabold text-indigo-950 truncate" title={ownSlot.course}>
                                        {ownSlot.course}
                                      </div>
                                      <div className="text-slate-600 font-bold truncate">
                                        {getClassGroupLabel(ownSlot.classGroup)}
                                      </div>
                                      <div className="flex items-center gap-0.5 text-[8.5px] text-slate-400 font-semibold truncate">
                                        <MapPin className="h-2 w-2 shrink-0" />
                                        {ownSlot.location}
                                      </div>
                                    </div>
                                  )
                                ) : coverSlots.length > 0 ? (
                                  <div 
                                    className="h-full bg-emerald-50/40 border border-emerald-200 rounded-lg p-1.5 flex flex-col justify-between text-[10px] leading-tight hover:border-emerald-400 transition-colors"
                                    title={`${coverSlots[0].slot.course} - Covered slot`}
                                  >
                                    <div className="font-extrabold text-emerald-950 truncate">
                                      {coverSlots[0].slot.course}
                                    </div>
                                    <div className="text-emerald-800 font-bold truncate">
                                      {getClassGroupLabel(coverSlots[0].slot.classGroup)}
                                    </div>
                                    <div className="text-[7.5px] text-emerald-700 font-semibold space-y-0.5 mt-auto">
                                      {coverSlots.map((cs, cidx) => (
                                        <div key={cidx} className="truncate">
                                          Covering for {cs.originalMentorName} ({cs.dateStr})
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                ) : (
                                  <div className="h-full flex items-center justify-center border border-dashed border-slate-200 bg-slate-50/5 rounded-lg select-none">
                                    <span className="text-[9px] text-slate-300 font-bold uppercase tracking-wider">Free</span>
                                  </div>
                                )}
                              </TableCell>
                            );
                          })}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}            {/* Handover Logs Subtab */}
            {activeSubTab === "handovers" && (() => {
              // Calculate compensation ledger dynamically grouped by other mentor, subject, and month
              interface LedgerRecord {
                otherName: string;
                subject: string;
                month: string;
                given: number;
                received: number;
              }
              const ledgerMap = new Map<string, LedgerRecord>();
              
              const getLedgerKey = (otherId: string, subject: string, month: string) => 
                `${otherId}_#_${subject}_#_${month}`;

              const currentMonthStr = new Date().toISOString().slice(0, 7); // e.g. "2026-06"

              // 1. Sent handovers (where this mentor is the original mentor and was approved)
              approvedHandovers.forEach(h => {
                if (h.originalMentorId === mentor.id) {
                  const otherId = h.coverStaffId;
                  const otherMentor = mentors.find(m => m.id === otherId);
                  const otherName = otherMentor?.name || h.coverStaffName || "Staff";
                  
                  const slot = slots.find(s => s.id === h.slotId);
                  const rawSubject = h.course || (slot ? slot.course : "Unknown Subject");
                  const subject = cleanSubjectName(rawSubject);
                  const month = h.ledger_month || h.dateStr.slice(0, 7);
                  
                  const key = getLedgerKey(otherId, subject, month);
                  const record = ledgerMap.get(key) || { otherName, subject, month, given: 0, received: 0 };
                  record.given += 1;
                  ledgerMap.set(key, record);
                }
              });

              // 2. Received/covered handovers (where this mentor is the cover staff and was approved)
              approvedHandovers.forEach(h => {
                if (h.coverStaffId === mentor.id) {
                  const otherId = h.originalMentorId;
                  const otherMentor = mentors.find(m => m.id === otherId);
                  const otherName = otherMentor?.name || "Staff";
                  
                  const slot = slots.find(s => s.id === h.slotId);
                  const rawSubject = h.course || (slot ? slot.course : "Unknown Subject");
                  const subject = cleanSubjectName(rawSubject);
                  const month = h.ledger_month || h.dateStr.slice(0, 7);
                  
                  const key = getLedgerKey(otherId, subject, month);
                  const record = ledgerMap.get(key) || { otherName, subject, month, given: 0, received: 0 };
                  record.received += 1;
                  ledgerMap.set(key, record);
                }
              });

              const ledgerList = Array.from(ledgerMap.entries()).map(([key, data]) => {
                const parts = key.split("_#_");
                const otherId = parts[0];
                const balance = data.received - data.given; // Positive = credit (they owe you); Negative = debit (you owe them)
                return {
                  otherId,
                  otherName: data.otherName,
                  subject: data.subject,
                  month: data.month,
                  given: data.given,
                  received: data.received,
                  balance,
                };
              });

              const formatMonthLabel = (monthStr: string) => {
                const [year, month] = monthStr.split("-");
                const date = new Date(parseInt(year), parseInt(month) - 1, 1);
                return date.toLocaleDateString("en-US", { month: "long", year: "numeric" });
              };

              return (
                <div className="space-y-6">
                  {/* Section 1: Handovers Sent */}
                  <div className="space-y-3">
                    <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest">Requested Handovers (Sent)</h4>
                    {sentHandovers.length === 0 ? (
                      <div className="text-center py-6 border border-slate-100 rounded-xl bg-slate-50/30">
                        <p className="text-xs text-slate-500 italic">No handover requests sent by this mentor.</p>
                      </div>
                    ) : (
                      <div className="overflow-x-auto border border-slate-200 rounded-xl shadow-xs">
                        <Table className="w-full border-collapse text-left text-xs">
                          <TableHeader>
                            <TableRow className="bg-sunken border-b border-slate-200 text-slate-500 font-bold uppercase text-[9.5px]">
                              <TableHead className="p-3">Date</TableHead>
                              <TableHead className="p-3">Course / Time</TableHead>
                              <TableHead className="p-3">Covering Staff</TableHead>
                              <TableHead className="p-3">Status</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody className="divide-y divide-slate-100 bg-white">
                            {sentHandovers.map((req) => (
                              <TableRow key={req.id} className="hover:bg-slate-50/40 transition-colors text-slate-700">
                                <TableCell className="p-3 font-semibold">{req.dateFormatted}</TableCell>
                                <TableCell className="p-3">
                                  <span className="font-bold block text-slate-900">{req.course}</span>
                                  <span className="text-[10px] text-slate-400">{req.day}, {formatTimeLabel(req.time)}</span>
                                </TableCell>
                                <TableCell className="p-3 font-bold text-slate-800">{req.targetStaffName}</TableCell>
                                <TableCell className="p-3">
                                  <span className={`inline-flex px-2 py-0.5 rounded text-[9px] font-black uppercase ${
                                    req.status === "approved" ? "bg-teal-100 text-teal-800" :
                                    req.status === "rejected" ? "bg-red-100 text-red-800" :
                                    "bg-amber-100 text-amber-800"
                                  }`}>
                                    {req.status}
                                  </span>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    )}
                  </div>

                  {/* Section 2: Handovers Covered */}
                  <div className="space-y-3">
                    <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest">Covered Handovers (Received)</h4>
                    {coveredHandovers.length === 0 ? (
                      <div className="text-center py-6 border border-slate-100 rounded-xl bg-slate-50/30">
                        <p className="text-xs text-slate-500 italic">No classes covered by this mentor.</p>
                      </div>
                    ) : (
                      <div className="overflow-x-auto border border-slate-200 rounded-xl shadow-xs">
                        <Table className="w-full border-collapse text-left text-xs">
                          <TableHeader>
                            <TableRow className="bg-sunken border-b border-slate-200 text-slate-500 font-bold uppercase text-[9.5px]">
                              <TableHead className="p-3">Date</TableHead>
                              <TableHead className="p-3">Class slot info</TableHead>
                              <TableHead className="p-3">Original Mentor</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody className="divide-y divide-slate-100 bg-white">
                            {coveredHandovers.map((h, idx) => {
                              const originM = mentors.find(m => m.id === h.originalMentorId);
                              const slot = slots.find(s => s.id === h.slotId);
                              return (
                                <TableRow key={idx} className="hover:bg-slate-50/40 transition-colors text-slate-700">
                                  <TableCell className="p-3 font-semibold">{h.dateStr}</TableCell>
                                  <TableCell className="p-3">
                                    {slot ? (
                                      <>
                                        <span className="font-bold block text-slate-900">{slot.course}</span>
                                        <span className="text-[10px] text-slate-400">
                                          {slot.day}, {formatTimeLabel(slot.time)} ({getClassGroupLabel(slot.classGroup)})
                                        </span>
                                      </>
                                    ) : (
                                      <span className="text-slate-400 italic">Unknown class</span>
                                    )}
                                  </TableCell>
                                  <TableCell className="p-3 font-bold text-slate-800">
                                    {originM?.name || "Staff"}
                                  </TableCell>
                                </TableRow>
                              );
                            })}
                          </TableBody>
                        </Table>
                      </div>
                    )}
                  </div>

                  {/* Section 3: Compensation & Workload Balance Ledger */}
                  <div className="space-y-3">
                    <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest">Compensation &amp; Workload Balance Ledger</h4>
                    {ledgerList.length === 0 ? (
                      <div className="text-center py-6 border border-slate-100 rounded-xl bg-slate-50/30">
                        <p className="text-xs text-slate-500 italic">No approved handover history to calculate balance.</p>
                      </div>
                    ) : (
                      <div className="overflow-x-auto border border-slate-200 rounded-xl shadow-xs">
                        <Table className="w-full border-collapse text-left text-xs">
                          <TableHeader>
                            <TableRow className="bg-sunken border-b border-slate-200 text-slate-500 font-bold uppercase text-[9.5px]">
                              <TableHead className="p-3">Month</TableHead>
                              <TableHead className="p-3">Subject</TableHead>
                              <TableHead className="p-3">Faculty Member</TableHead>
                              <TableHead className="p-3 text-center">Classes Handed Over</TableHead>
                              <TableHead className="p-3 text-center">Classes Covered</TableHead>
                              <TableHead className="p-3 text-right">Balance</TableHead>
                              <TableHead className="p-3 text-right">Compensation Status</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody className="divide-y divide-slate-100 bg-white">
                            {ledgerList.map((row, idx) => {
                              const isPastMonth = row.month < currentMonthStr;
                              const isUnbalanced = row.balance !== 0;
                              return (
                                <TableRow key={idx} className="hover:bg-slate-50/40 transition-colors text-slate-700">
                                  <TableCell className="p-3 font-semibold whitespace-nowrap">{formatMonthLabel(row.month)}</TableCell>
                                  <TableCell className="p-3 font-medium text-slate-600">{row.subject}</TableCell>
                                  <TableCell className="p-3 font-bold text-slate-800">{row.otherName}</TableCell>
                                  <TableCell className="p-3 text-center font-semibold text-slate-500">{row.given}</TableCell>
                                  <TableCell className="p-3 text-center font-semibold text-slate-500">{row.received}</TableCell>
                                  <TableCell className={`p-3 text-right font-black text-xs whitespace-nowrap ${row.balance > 0 ? "text-emerald-600" : row.balance < 0 ? "text-rose-600" : "text-slate-600"}`}>
                                    {row.balance > 0 ? `+${row.balance}` : row.balance < 0 ? `-${Math.abs(row.balance)}` : "0"}
                                  </TableCell>
                                  <TableCell className="p-3 text-right whitespace-nowrap">
                                    {row.balance === 0 ? (
                                      <span className="px-2.5 py-1 rounded bg-slate-100 text-slate-600 border border-slate-200 text-[9.5px] font-black uppercase inline-flex items-center">
                                        Balanced (0)
                                      </span>
                                    ) : isPastMonth ? (
                                      <span className="px-2.5 py-1 rounded bg-red-50 text-rose-700 border border-red-200 text-[9.5px] font-black uppercase inline-flex items-center animate-pulse">
                                        {row.balance < 0 ? `You owe ${Math.abs(row.balance)} hr` : `Owed ${row.balance} hr`} — Overdue
                                      </span>
                                    ) : row.balance < 0 ? (
                                      <span className="px-2.5 py-1 rounded bg-amber-50 text-amber-800 border border-amber-200 text-[9.5px] font-black uppercase inline-flex items-center">
                                        You owe them ({Math.abs(row.balance)})
                                      </span>
                                    ) : (
                                      <span className="px-2.5 py-1 rounded bg-emerald-50 text-emerald-800 border border-emerald-200 text-[9.5px] font-black uppercase inline-flex items-center">
                                        They owe you ({row.balance})
                                      </span>
                                    )}
                                  </TableCell>
                                </TableRow>
                              );
                            })}
                          </TableBody>
                        </Table>
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
    </Dialog>
  );
};

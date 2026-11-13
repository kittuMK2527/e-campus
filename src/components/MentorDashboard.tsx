"use client";

import React, { useState, useEffect, useMemo, useDeferredValue, useRef, useTransition, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useApp, Slot, Mentor, ApprovedHandover, Holiday } from "@/context/AppContext";
import { useToast } from "@/context/ToastContext";
import { apiFetch } from "@/lib/apiFetch";
import { announceDataChanged } from "@/lib/dataSync";
import { getLocalDateStr, getInstitutionDateStr, getInstitutionDateStrOffset } from "@/lib/localDate";
import { ALL_SEMESTERS, DEFAULT_SEMESTERS, getSemestersForCourse } from "@/lib/semesters";
import { qk } from "@/lib/queryKeys";
import { prefetchRoleTab } from "@/lib/prefetch";
import { isAwaitingCm, isAnyPendingCmRequest, isLateAttendanceRequest } from "@/lib/requestStatus";
import {
  Calendar,
  Clock,
  MapPin,
  Plus,
  ListTodo,
  Send,
  AlertCircle,
  AlertTriangle,
  X,
  ShieldAlert,
  UserCheck,
  CalendarCheck2,
  CheckCircle,
  XCircle,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  BookOpen,
  Filter,
  User,
  Search,
  Home,
  Sparkles,
  MinusCircle,
  PlusCircle,
  ClipboardList,
  GraduationCap,
  Upload,
  FileText,
  Users,
  RefreshCw,
  Check,
  Menu,
  Download,
  Lock,
  Unlock,
  Trash2,
  Loader2,
  Award,
  Video,
  BellRing,
  FileSpreadsheet,
  Edit2,
  Layers,
  ArrowUpRight,
  Save,
  ArrowRight,
  Building,
  CalendarRange,
  Book,
  ExternalLink,
  Eye,
  EyeOff,
  FolderKanban
} from "lucide-react";
import dynamic from "next/dynamic";

const InterviewModule = dynamic(() => import("./InterviewModule").then(m => m.InterviewModule), { ssr: false });
const MentorProfileModal = dynamic(() => import("./MentorProfileModal").then(m => m.MentorProfileModal), { ssr: false });
const MentorExamMarksStudio = dynamic(() => import("./MentorExamMarksStudio").then(m => m.MentorExamMarksStudio), { ssr: false });
import { MentorWeeklyPlanStudio } from "./WeeklyPlanStudio";
import { SkillTrackerPanel } from "./SkillTrackerPanel";

import { CourseInfoButton } from "./CourseInfoModal";
import { formatDate, formatTimeLabel, isSubjectNameMatch, resolveClassGroupDetailsFromState, parseDbDate, isCohortMatching, isCohortMatch, getDeptFromClassGroup, evaluateDailyStudentAttendance, isExamDate, isSkillSubject, isAcademicSubject, calculateWeekOffsetForDate, isSlotOverlappingExamWindow, parseTimeToMinutes } from "@/lib/utils";
import { Pagination } from "@/components/ui/Pagination";
import { ActionMenu } from "@/components/ui/ActionMenu";
import { Dialog } from "@/components/ui/dialog";

const formatPunchTime = (timeStr?: string | null) => {
  if (!timeStr) return "—";
  if (timeStr.includes("AM") || timeStr.includes("PM")) return timeStr;
  const parts = timeStr.split(":");
  if (parts.length >= 2) {
    let hours = parseInt(parts[0], 10);
    const mins = parts[1].slice(0, 2);
    if (!isNaN(hours)) {
      const ampm = hours >= 12 ? "PM" : "AM";
      const displayHours = hours % 12 || 12;
      return `${String(displayHours).padStart(2, "0")}:${mins} ${ampm}`;
    }
  }
  return timeStr;
};

/* ─── Mentor Daily Attendance Punch Widget ─── */
const MentorPunchWidget: React.FC<{ mentor: Mentor }> = ({ mentor }) => {
  const { toast } = useToast();
  const { requests, setRequests, refreshData, colleges, attendanceLockEnabled } = useApp();
  const queryClient = useQueryClient();
  const [punchStatus, setPunchStatus] = useState<string>("Not Punched");
  const [punchTime, setPunchTime] = useState<string | null>(null);
  const [punchReason, setPunchReason] = useState<string | null>(null);
  const [showReasonInput, setShowReasonInput] = useState(false);
  const [targetStatus, setTargetStatus] = useState<"Present" | "OD" | "Leave">("Present");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Late Punch CM Request state
  const [latePunchExplanation, setLatePunchExplanation] = useState("");
  const [submittingLatePunchReq, setSubmittingLatePunchReq] = useState(false);

  // ROLE_UI_AUDIT T4 (P1): local date, NOT toISOString() — UTC dates shift a day
  // for IST after 5:30 PM, misdating punches near midnight.
  const todayStr = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }, []);

  // College start time & 30-minute deadline calculation
  const collegeObj = colleges.find(c => c.id === mentor.college_id);
  const collegeStartTimeStr = useMemo(() => {
    if ((collegeObj as any)?.start_time) return (collegeObj as any).start_time;
    if (collegeObj?.shift_configs) {
      try {
        const parsed = typeof collegeObj.shift_configs === "string" ? JSON.parse(collegeObj.shift_configs) : collegeObj.shift_configs;
        const customStart = parsed?.custom_shift_params?.general?.startTime || parsed?.general?.[0]?.split("-")[0]?.trim();
        if (customStart) return customStart;
      } catch (_) { }
    }
    return "08:30 AM";
  }, [collegeObj]);

  const { isDeadlinePassed, collegeStartTimeFormatted, deadlineTimeFormatted } = useMemo(() => {
    // ROLE_UI_AUDIT T1 (P1): use the shared parser instead of the fragile regex —
    // it handles 24-hour times ("14:30"), "8.30AM", and AM/PM variants.
    const totalMinutes = parseTimeToMinutes(collegeStartTimeStr);
    const now = new Date();
    let hours = 8;
    let minutes = 30;
    if (totalMinutes > 0) {
      hours = Math.floor(totalMinutes / 60);
      minutes = totalMinutes % 60;
    }

    const startTime = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hours, minutes, 0);
    const deadline = new Date(startTime.getTime() + 30 * 60 * 1000); // 30 minutes after start time

    const cStartFormatted = startTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const cDeadlineFormatted = deadline.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    return {
      isDeadlinePassed: now > deadline,
      collegeStartTimeFormatted: cStartFormatted,
      deadlineTimeFormatted: cDeadlineFormatted
    };
  }, [collegeStartTimeStr]);

  // ROLE_UI_AUDIT T2: match on the structured requestType marker ("late_punch")
  // with a legacy fallback to the old reason-text sniffing for pre-existing rows.
  const isLatePunchRequest = (r: any) =>
    r.requestType === "late_punch" || r.request_type === "late_punch" ||
    r.reason?.includes("Late Mentor Attendance Punch") || r.targetStaffName?.includes("CM Approval") || r.course?.includes("Late Mentor Punch");

  const approvedLateCamReq = useMemo(() => {
    return requests.find(r =>
      r.requestorId === mentor.id &&
      r.dateStr === todayStr &&
      r.status === "approved" &&
      isLatePunchRequest(r)
    );
  }, [requests, mentor.id, todayStr]);

  const pendingLateCamReq = useMemo(() => {
    return requests.find(r =>
      r.requestorId === mentor.id &&
      r.dateStr === todayStr &&
      (isAnyPendingCmRequest(r.status)) &&
      isLatePunchRequest(r)
    );
  }, [requests, mentor.id, todayStr]);

  const isPunchLocked = isDeadlinePassed && punchStatus === "Not Punched" && !approvedLateCamReq && attendanceLockEnabled;
  const isAlreadyPunched = punchStatus !== "Not Punched";

  const attendanceQuery = useQuery({
    queryKey: qk.mentorAttendance(mentor.id),
    queryFn: async () => {
      const json = await apiFetch(`/api/mentor-attendance?mentorId=${encodeURIComponent(mentor.id)}`);
      return json?.success && Array.isArray(json.records) ? (json.records as any[]) : [];
    },
  });
  const loading = attendanceQuery.isFetching;
  const statusLoading = loading && attendanceQuery.data === undefined;

  useEffect(() => {
    const todayRec = attendanceQuery.data?.find((r: any) => r.date_str === todayStr);
    if (todayRec) {
      setPunchStatus(todayRec.status);
      setPunchTime(todayRec.punch_in_time);
      setPunchReason(todayRec.reason);
    }
  }, [attendanceQuery.data, todayStr]);

  const handlePunch = async (status: "Present" | "OD" | "Leave", reasonText?: string) => {
    setSubmitting(true);
    try {
      const res = await fetch("/api/mentor-attendance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mentorId: mentor.id,
          collegeId: mentor.college_id || "general",
          dateStr: todayStr,
          status,
          reason: reasonText || null,
          markedBy: "self",
          markedById: mentor.id
        })
      });
      const json = await res.json();
      if (json.success) {
        toast(`Daily attendance marked as ${status}!`, "success");
        setPunchStatus(status);
        setPunchTime(new Date().toLocaleTimeString("en-US", { hour12: true, hour: "2-digit", minute: "2-digit" }));
        setPunchReason(reasonText || null);
        setShowReasonInput(false);
        queryClient.invalidateQueries({ queryKey: qk.mentorAttendance(mentor.id) });
      } else {
        toast(json.message || "Failed to punch attendance", "error");
      }
    } catch (e: any) {
      toast("Error: " + e.message, "error");
    } finally {
      setSubmitting(false);
    }
  };

  const triggerPunchClick = (status: "Present" | "OD" | "Leave") => {
    if (isAlreadyPunched) {
      toast(`Attendance is already marked as ${punchStatus} for today and cannot be changed.`, "warning");
      return;
    }
    if (isPunchLocked) {
      toast("30-Minute Daily Punch Deadline Expired. Please submit an explanation to CM for approval.", "warning");
      return;
    }
    if (status === "Present") {
      handlePunch("Present");
    } else {
      setTargetStatus(status);
      setShowReasonInput(true);
    }
  };

  return (
    <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-card space-y-3">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-xl bg-zinc-100 flex items-center justify-center text-amber-500 shrink-0">
            <UserCheck className="h-4.5 w-4.5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-xs font-extrabold text-slate-900">Today's Attendance Punch</h3>
              <span className="text-[10px] font-medium text-slate-400 font-mono">({todayStr})</span>
              {approvedLateCamReq && punchStatus === "Not Punched" && (
                <span className="px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200 text-[9.5px] font-extrabold">
                  ✓ CM Unlocked
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-500 font-medium mt-0.5">
              {statusLoading ? (
                <span className="text-slate-500 font-bold flex items-center gap-1">
                  <Loader2 className="h-3 w-3 animate-spin shrink-0" />
                  Checking today's attendance…
                </span>
              ) : punchStatus === "Not Punched" ? (
                isPunchLocked ? (
                  <span className="text-rose-600 font-bold flex items-center gap-1">
                    <Clock className="h-3 w-3 shrink-0" />
                    30m Deadline Passed (College Start: {collegeStartTimeFormatted})
                  </span>
                ) : (
                  "Record presence or OD status within 30m of college start."
                )
              ) : (
                <span className="flex items-center gap-1.5 text-slate-600">
                  <CheckCircle className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                  <span>
                    Punched as <span className="font-bold text-slate-800">{punchStatus}</span> at <span className="font-mono font-bold text-slate-700">{punchTime || "Today"}</span>
                  </span>
                  <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">
                    <Lock className="h-2.5 w-2.5" /> Status Locked
                  </span>
                </span>
              )}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            disabled={submitting || statusLoading || isPunchLocked || isAlreadyPunched}
            onClick={() => triggerPunchClick("Present")}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${punchStatus === "Present"
                ? "bg-emerald-600 text-white shadow-xs cursor-default ring-2 ring-emerald-600/30"
                : isAlreadyPunched || isPunchLocked || statusLoading
                  ? "bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed opacity-50"
                  : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 cursor-pointer"
              }`}
          >
            {punchStatus === "Present" && <Check className="h-3 w-3 inline mr-1 -mt-0.5" />}
            Present
          </button>
          <button
            type="button"
            disabled={submitting || statusLoading || isPunchLocked || isAlreadyPunched}
            onClick={() => triggerPunchClick("OD")}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${punchStatus === "OD"
                ? "bg-zinc-900 text-white shadow-xs cursor-default ring-1 ring-zinc-800"
                : isAlreadyPunched || isPunchLocked || statusLoading
                  ? "bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed opacity-50"
                  : "bg-zinc-100 text-zinc-900 hover:bg-zinc-200 border border-zinc-200 cursor-pointer"
              }`}
          >
            {punchStatus === "OD" && <Check className="h-3 w-3 inline mr-1 -mt-0.5" />}
            OD (On Duty)
          </button>
          <button
            type="button"
            disabled={submitting || statusLoading || isPunchLocked || isAlreadyPunched}
            onClick={() => triggerPunchClick("Leave")}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${punchStatus === "Leave"
                ? "bg-amber-500 text-white shadow-xs cursor-default ring-2 ring-amber-500/30"
                : isAlreadyPunched || isPunchLocked || statusLoading
                  ? "bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed opacity-50"
                  : "bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200 cursor-pointer"
              }`}
          >
            {punchStatus === "Leave" && <Check className="h-3 w-3 inline mr-1 -mt-0.5" />}
            On Leave
          </button>
        </div>
      </div>

      {/* Minimal Inline Request Form when Punch is Locked */}
      {isPunchLocked && (
        pendingLateCamReq ? (
          <div className="pt-2.5 border-t border-slate-100 flex items-center justify-between gap-2 text-xs text-amber-900 bg-amber-50/50 p-2.5 rounded-lg border border-amber-200/60">
            <div className="flex items-center gap-2 min-w-0">
              <Clock className="h-3.5 w-3.5 text-amber-600 shrink-0" />
              <span className="truncate font-medium">
                Late Punch Request sent to CM: <span className="italic">"{pendingLateCamReq.reason?.replace("[Late Mentor Attendance Punch] ", "")}"</span>
              </span>
            </div>
            <span className="text-[10px] font-black uppercase text-amber-700 bg-white px-2 py-0.5 rounded border border-amber-200 shrink-0">
              Pending CM
            </span>
          </div>
        ) : (
          <div className="pt-2.5 border-t border-slate-100 flex flex-col sm:flex-row items-center gap-2">
            <input
              type="text"
              value={latePunchExplanation}
              onChange={e => setLatePunchExplanation(e.target.value)}
              placeholder="Reason for late punch (e.g. Bus delay, field assignment...)"
              className="flex-1 w-full text-xs font-medium px-3 py-1.5 rounded-lg border border-slate-200 inset-shadow-well focus:bg-white dark:focus:bg-[#131317] focus:outline-none focus:border-rose-400 bg-sunken/50 text-slate-800 placeholder:text-slate-400"
            />
            <button
              type="button"
              disabled={!latePunchExplanation.trim() || submittingLatePunchReq}
              onClick={async () => {
                if (!latePunchExplanation.trim()) return;
                setSubmittingLatePunchReq(true);
                try {
                  const res = await fetch("/api/requests", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      mentorId: mentor.id,
                      slotId: "mentor_daily_punch_" + mentor.id,
                      dateStr: todayStr,
                      dateFormatted: todayStr,
                      targetStaffId: "cam_approval",
                      targetStaffName: "CM Approval (Late Mentor Attendance Punch)",
                      reason: "[Late Mentor Attendance Punch] " + latePunchExplanation.trim(),
                      course: "Late Mentor Attendance Punch",
                      classGroup: mentor.mentor_group || mentor.department || "Faculty",
                      requestType: "late_punch"
                    })
                  });
                  const json = await res.json();
                  if (json.success) {
                    toast("Late Punch request sent to CM for approval!", "success");
                    // Surgical update: prepend the new request to state without a full reload
                    if (json.request) {
                      setRequests(prev => [json.request, ...prev]);
                    }
                  } else {
                    toast(json.message || "Failed to submit request", "error");
                  }
                } catch (err: any) {
                  toast("Error submitting request: " + err.message, "error");
                } finally {
                  setSubmittingLatePunchReq(false);
                }
              }}
              className="w-full sm:w-auto px-3.5 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-bold shrink-0 transition-all cursor-pointer disabled:opacity-50 flex items-center justify-center gap-1.5"
            >
              {submittingLatePunchReq ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Request CM Exemption"}
            </button>
          </div>
        )
      )}

      {showReasonInput && !isPunchLocked && !isAlreadyPunched && (
        <div className="pt-2.5 border-t border-slate-100 flex flex-col sm:flex-row items-center gap-2">
          <input
            type="text"
            placeholder={`Remarks for ${targetStatus} (e.g. Workshop at Auditorium)`}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="flex-1 w-full text-xs font-medium px-3 py-1.5 rounded-lg border border-slate-200 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500/20 text-slate-800"
          />
          <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto">
            <button
              type="button"
              onClick={() => setShowReasonInput(false)}
              className="flex-1 sm:flex-none px-3 py-1.5 rounded-lg text-xs font-bold text-slate-500 bg-slate-100 hover:bg-slate-200 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={submitting}
              onClick={() => handlePunch(targetStatus, reason)}
              className="flex-1 sm:flex-none px-3.5 py-1.5 rounded-lg text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 shadow-xs cursor-pointer"
            >
              Submit Punch →
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

/* ─── Faculty Leave & Permission Request Panel ─── */
const MentorFacultyLeavePanel: React.FC<{ mentor: Mentor; slots?: Slot[]; demoSessions?: any[] }> = ({ mentor, slots = [], demoSessions = [] }) => {
  const { toast } = useToast();
  const { refreshData } = useApp();
  const queryClient = useQueryClient();
  const [panelTab, setPanelTab] = useState<"leave_apps" | "incoming_covers" | "punch_history">("leave_apps");

  const [showModal, setShowModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const leaveRequestsQuery = useQuery({
    queryKey: qk.facultyLeave(`mentor:${mentor.id}`),
    queryFn: async () => {
      const json = await apiFetch(`/api/requests/faculty-leave?mentorId=${encodeURIComponent(mentor.id)}`);
      return json?.success && Array.isArray(json.records) ? (json.records as any[]) : [];
    },
  });
  const requests = leaveRequestsQuery.data || [];
  const loading = leaveRequestsQuery.isFetching;

  // Incoming cover requests assigned to this mentor
  const incomingCoversQuery = useQuery({
    queryKey: qk.incomingCovers(mentor.id),
    queryFn: async () => {
      const json = await apiFetch(`/api/requests?targetStaffId=${encodeURIComponent(mentor.id)}`);
      return json?.success && Array.isArray(json.requests) ? (json.requests as any[]) : [];
    },
  });
  const incomingCovers = incomingCoversQuery.data || [];
  const loadingCovers = incomingCoversQuery.isFetching;
  const [actionCoverId, setActionCoverId] = useState<string | null>(null);
  const [coverPage, setCoverPage] = useState(1);
  const [coverPageSize, setCoverPageSize] = useState(25);

  // Past attendance history state
  const attendanceLogsQuery = useQuery({
    queryKey: qk.mentorAttendance(mentor.id),
    enabled: panelTab === "punch_history",
    queryFn: async () => {
      const json = await apiFetch(`/api/mentor-attendance?mentorId=${encodeURIComponent(mentor.id)}`);
      return json?.success && Array.isArray(json.records) ? (json.records as any[]) : [];
    },
  });
  const attLogs = attendanceLogsQuery.data || [];
  const loadingAttLogs = attendanceLogsQuery.isFetching;

  // Pagination states
  const [punchPage, setPunchPage] = useState(1);
  const [punchPageSize, setPunchPageSize] = useState(25);
  const [leavePage, setLeavePage] = useState(1);
  const [leavePageSize, setLeavePageSize] = useState(25);

  const paginatedAttLogs = useMemo(() => {
    const start = (punchPage - 1) * punchPageSize;
    return attLogs.slice(start, start + punchPageSize);
  }, [attLogs, punchPage, punchPageSize]);

  const paginatedRequests = useMemo(() => {
    const start = (leavePage - 1) * leavePageSize;
    return requests.slice(start, start + leavePageSize);
  }, [requests, leavePage, leavePageSize]);

  const paginatedCovers = useMemo(() => {
    const start = (coverPage - 1) * coverPageSize;
    return incomingCovers.slice(start, start + coverPageSize);
  }, [incomingCovers, coverPage, coverPageSize]);

  const pendingCoversCount = useMemo(() => {
    return incomingCovers.filter(c => isAnyPendingCmRequest(c.status)).length;
  }, [incomingCovers]);

  // Helper to format local date as YYYY-MM-DD without UTC timezone skew
  const formatLocalDateYMD = (d: Date): string => {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  // Request form state
  const [requestType, setRequestType] = useState<"Casual Leave" | "Emergency" | "On Duty" | "Permission">("Casual Leave");
  const [startDate, setStartDate] = useState(() => formatLocalDateYMD(new Date()));
  const [endDate, setEndDate] = useState(() => formatLocalDateYMD(new Date()));
  const safeEndDate = (endDate || "").trim() || startDate;
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("11:00");
  const [reason, setReason] = useState("");
  // Map of "slotId_dateStr" -> coverMentorId selected by mentor
  const [coverSelections, setCoverSelections] = useState<Record<string, string>>({});
  // Map of "slotId_dateStr" -> { loading, mentors[] } for suggested cover mentors
  const [coverOptions, setCoverOptions] = useState<Record<string, { loading: boolean; mentors: any[] }>>();
  // Tracks slots already fetched so a date/slot recalculation cannot fire duplicate requests.
  const coverFetchState = useRef<Record<string, "loading" | "loaded">>({});

  // Dynamically calculate scheduled classes in the selected leave/permission window
  const affectedSlots = useMemo(() => {
    if (!slots || !startDate) return [];
    const mentorSlots = slots.filter(s => s.mentorId === mentor.id);
    const affected: { dateStr: string; slot: Slot }[] = [];

    const [sY, sM, sD] = startDate.split("-").map(Number);
    const [eY, eM, eD] = safeEndDate.split("-").map(Number);
    const cur = new Date(sY, sM - 1, sD, 12, 0, 0);
    const end = requestType === "Permission" ? new Date(sY, sM - 1, sD, 12, 0, 0) : new Date(eY, eM - 1, eD, 12, 0, 0);

    while (cur <= end) {
      const dStr = formatLocalDateYMD(cur);
      const weekday = cur.toLocaleDateString("en-US", { weekday: "long" });
      const daySlots = mentorSlots.filter(s => s.day.toLowerCase() === weekday.toLowerCase());
      for (const s of daySlots) {
        affected.push({ dateStr: dStr, slot: s });
      }
      cur.setDate(cur.getDate() + 1);
    }
    return affected;
  }, [slots, mentor.id, startDate, endDate, requestType]);

  const impactedDemos = useMemo(() => {
    if (!startDate) return [];
    const effectiveEnd = requestType === "Permission" ? startDate : safeEndDate;
    return (demoSessions || []).filter((ds: any) => {
      const mId = ds.mentorId || ds.mentor_id;
      return mId === mentor.id &&
        ds.status !== "completed" &&
        ds.status !== "not_conducted" &&
        ds.dateStr >= startDate &&
        ds.dateStr <= effectiveEnd;
    });
  }, [demoSessions, mentor.id, startDate, endDate, requestType]);

  // Automatically prefetch available cover mentors whenever affected slots change
  useEffect(() => {
    if (!mentor.college_id || affectedSlots.length === 0) return;
    const controller = new AbortController();

    affectedSlots.forEach(item => {
      const key = `${item.slot.id}_${item.dateStr}`;
      if (coverFetchState.current[key]) return;
      coverFetchState.current[key] = "loading";
      setCoverOptions(prev => ({
        ...(prev || {}),
        [key]: { loading: true, mentors: [] }
      }));

      fetch(`/api/requests/faculty-leave?availableForSlotId=${encodeURIComponent(item.slot.id)}&availableForDate=${encodeURIComponent(item.dateStr)}&availableForCollegeId=${encodeURIComponent(mentor.college_id!)}&excludeMentorId=${encodeURIComponent(mentor.id)}`, {
        signal: controller.signal
      })
        .then(r => {
          if (!r.ok) throw new Error(`Cover lookup failed (${r.status})`);
          return r.json();
        })
        .then(data => {
          coverFetchState.current[key] = "loaded";
          setCoverOptions(prev => ({
            ...(prev || {}),
            [key]: { loading: false, mentors: data.mentors || [] }
          }));
        })
        .catch((err) => {
          if (err?.name === "AbortError") {
            delete coverFetchState.current[key];
            return;
          }
          delete coverFetchState.current[key];
          setCoverOptions(prev => ({
            ...(prev || {}),
            [key]: { loading: false, mentors: [] }
          }));
        });
    });

    return () => controller.abort();
  }, [affectedSlots, mentor.college_id, mentor.id]);

  const fetchRequests = () =>
    queryClient.invalidateQueries({ queryKey: qk.facultyLeave(`mentor:${mentor.id}`) });

  const fetchAttendanceLogs = () =>
    queryClient.invalidateQueries({ queryKey: qk.mentorAttendance(mentor.id) });

  const fetchIncomingCovers = () =>
    queryClient.invalidateQueries({ queryKey: qk.incomingCovers(mentor.id) });

  const handleResolveCover = async (requestId: string, status: "approved" | "rejected") => {
    setActionCoverId(requestId);
    try {
      const res = await fetch("/api/requests/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestId,
          status,
          approverName: mentor.name,
          actorRole: "Mentor"
        })
      });
      const data = await res.json();
      if (data.success) {
        toast(`Cover request ${status === "approved" ? "accepted" : "declined"}!`, "success");
        await fetchIncomingCovers();
      } else {
        toast(data.message || "Failed to update cover request.", "error");
      }
    } catch (err: any) {
      toast("Error: " + err.message, "error");
    } finally {
      setActionCoverId(null);
    }
  };


  // Step form state: 1 = Details, 2 = Cover Mapping
  const [formStep, setFormStep] = useState<1 | 2>(1);

  // ── Leave-driven Demo Reallocation state ───────────────────────────
  // One proposed alternative per impacted demo: { [demoSessionId]: { dateStr, timeSlot } }
  const [demoReallocationPicks, setDemoReallocationPicks] = useState<Record<string, { dateStr: string; timeSlot: string }>>({});
  const [reallocAlternatives, setReallocAlternatives] = useState<Record<string, { dateStr: string; label: string; weekday: string; periods: any[] }[]>>({});
  const [reallocLoading, setReallocLoading] = useState<Record<string, boolean>>({});
  const [reallocSubmittedIds, setReallocSubmittedIds] = useState<Set<string>>(new Set());

  const unhandledImpactedDemos = impactedDemos.filter((d: any) => !reallocSubmittedIds.has(d.id));
  const allDemosHandled = impactedDemos.length === 0 || unhandledImpactedDemos.length === 0;

  // Fetch alternative periods (mentor-free × SME-free matrix) for an impacted demo
  const fetchReallocAlternatives = async (demoSessionId: string) => {
    setReallocLoading(prev => ({ ...prev, [demoSessionId]: true }));
    try {
      const res = await fetch(`/api/demo-reallocations?demoSessionId=${encodeURIComponent(demoSessionId)}`);
      const json = await res.json();
      if (json.success) {
        setReallocAlternatives(prev => ({ ...prev, [demoSessionId]: json.alternatives || [] }));
      }
    } catch (_) {
      setReallocAlternatives(prev => ({ ...prev, [demoSessionId]: [] }));
    } finally {
      setReallocLoading(prev => ({ ...prev, [demoSessionId]: false }));
    }
  };

  // Propose the picked alternative → creates the pending reservation
  const submitDemoReallocation = async (demo: any) => {
    const pick = demoReallocationPicks[demo.id];
    if (!pick) return;
    setReallocLoading(prev => ({ ...prev, [demo.id]: true }));
    try {
      const res = await fetch("/api/demo-reallocations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "propose",
          demoSessionId: demo.id,
          proposedDateStr: pick.dateStr,
          proposedTimeSlot: pick.timeSlot,
          reason: `Mentor ${requestType} from ${startDate} to ${safeEndDate}`,
          proposedBy: mentor.name
        })
      });
      const json = await res.json();
      if (json.success) {
        toast(`Alternative period reserved for ${demo.subject}. Awaiting L&D approval.`, "success");
        setReallocSubmittedIds(prev => new Set(prev).add(demo.id));
        // The reservation blocks that period for every portal until it is approved
        // or withdrawn, so re-read demos instead of trusting the local snapshot.
        await refreshData();
        announceDataChanged("demos");
      } else {
        toast(json.message || "Failed to propose reallocation", "error");
      }
    } catch (err: any) {
      toast("Error proposing reallocation: " + err.message, "error");
    } finally {
      setReallocLoading(prev => ({ ...prev, [demo.id]: false }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!startDate) {
      toast("Please select a valid date.", "error");
      return;
    }
    if (!reason.trim()) {
      toast("Please enter a mandatory reason for your application.", "error");
      return;
    }

    // Leave cannot create an unhandled demo conflict: every impacted demo must
    // have a proposed alternative period (reserved + queued for L&D).
    if (unhandledImpactedDemos.length > 0) {
      toast(`${unhandledImpactedDemos.length} L&D session(s) during this leave still need an alternative period. Please complete the L&D Reallocation panel first.`, "warning");
      return;
    }

    if (formStep === 1 && affectedSlots.length > 0) {
      setFormStep(2);
      return;
    }

    setSubmitting(true);
    try {
      const payload: any = {
        mentorId: mentor.id,
        collegeId: mentor.college_id || "general",
        requestType,
        startDate,
        reason: reason.trim()
      };

      if (requestType === "Permission") {
        payload.endDate = startDate;
        payload.startTime = startTime;
        payload.endTime = endTime;
      } else {
        payload.endDate = safeEndDate;
      }

      if (formStep === 2 && affectedSlots.length > 0) {
        const unassignedSlots = affectedSlots.filter(item => {
          const val = coverSelections[`${item.slot.id}_${item.dateStr}`];
          return !val || val === "cam_help";
        });
        if (unassignedSlots.length > 0) {
          toast(`Please select a replacement faculty member for all ${unassignedSlots.length} period(s).`, "error");
          return;
        }
      }

      // Build coverSelections array from state
      const coverSelectionsArr = affectedSlots
        .map(item => {
          const val = coverSelections[`${item.slot.id}_${item.dateStr}`];
          return {
            slotId: item.slot.id,
            dateStr: item.dateStr,
            coverMentorId: (val && val !== "cam_help") ? val : null
          };
        })
        .filter(sel => sel.slotId && sel.dateStr);

      if (coverSelectionsArr.length > 0) {
        payload.coverSelections = coverSelectionsArr;
      }

      // Link the reallocation requests to this leave application
      if (reallocSubmittedIds.size > 0) {
        payload.demoReallocationIds = Array.from(reallocSubmittedIds);
      }

      const res = await fetch("/api/requests/faculty-leave", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const json = await res.json();
      if (json.success) {
        const coverMsg = json.createdHandovers?.length > 0
          ? ` Cover requested for ${json.createdHandovers.length} class(es).`
          : "";
        toast(`Application submitted successfully!${coverMsg} Email notification sent to CM.`, "success");
        setShowModal(false);
        setFormStep(1);
        setReason("");
        setCoverSelections({});
        setCoverOptions(undefined);
        setDemoReallocationPicks({});
        setReallocAlternatives({});
        setReallocSubmittedIds(new Set());
        await fetchRequests();
      } else {
        toast(json.message || "Failed to submit request", "error");
      }
    } catch (err: any) {
      toast("Error: " + err.message, "error");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner & Sub-View Switcher matching CM Dashboard soft slate background */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-50/70 border border-slate-100 rounded-xl p-5 shadow-xs">
        <div className="flex items-center gap-3.5">
          <div className="h-10 w-10 rounded-lg bg-zinc-100 flex items-center justify-center text-amber-500 shrink-0 border border-indigo-100">
            <CalendarCheck2 className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-base font-extrabold text-slate-900 leading-tight">Faculty Leave &amp; Attendance Portal</h2>
            <p className="text-xs text-slate-500 font-medium mt-0.5">
              Submit advance leave/permissions and view your historical daily punch logs.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <div className="flex items-center p-1 bg-white/80 rounded-lg border border-slate-200 shadow-2xs">
            <button
              type="button"
              onClick={() => setPanelTab("leave_apps")}
              className={`px-3.5 py-1.5 rounded-md text-xs font-bold transition-all cursor-pointer ${panelTab === "leave_apps"
                ? "bg-slate-900 text-white shadow-xs"
                : "text-slate-500 hover:text-slate-800"
                }`}
            >
              Leave Applications
            </button>
            <button
              type="button"
              onClick={() => setPanelTab("incoming_covers")}
              className={`px-3.5 py-1.5 rounded-md text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${panelTab === "incoming_covers"
                ? "bg-slate-900 text-white shadow-xs"
                : "text-slate-500 hover:text-slate-800"
                }`}
            >
              Cover Requests for Me
              {pendingCoversCount > 0 && (
                <span className="px-1.5 py-0.2 rounded-full bg-amber-500 text-white text-[10px] font-black">
                  {pendingCoversCount}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={() => setPanelTab("punch_history")}
              className={`px-3.5 py-1.5 rounded-md text-xs font-bold transition-all cursor-pointer ${panelTab === "punch_history"
                ? "bg-slate-900 text-white shadow-xs"
                : "text-slate-500 hover:text-slate-800"
                }`}
            >
              Daily Punch History
            </button>
          </div>

          {panelTab === "leave_apps" && (
            <button
              type="button"
              onClick={() => setShowModal(true)}
              className="px-4 py-2 rounded-lg text-xs font-extrabold bg-zinc-900 hover:bg-zinc-800 text-white shadow-xs border border-white/10 flex items-center gap-2 cursor-pointer transition-all shrink-0 active:scale-95"
            >
              <Plus className="h-4 w-4" />
              Apply Leave
            </button>
          )}
        </div>
      </div>

      {panelTab === "incoming_covers" ? (
        /* Incoming Cover Requests Table View */
        <div className="bg-slate-50/70 border border-slate-100 rounded-xl p-5 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-amber-600" />
              <h3 className="text-xs font-extrabold text-slate-900 uppercase tracking-wider">Incoming Class Cover Requests</h3>
            </div>
            <button onClick={fetchIncomingCovers} className="p-1.5 rounded-md border border-slate-200 bg-white text-slate-500 hover:text-amber-600 hover:border-amber-300 transition-all cursor-pointer">
              <RefreshCw className="h-4 w-4" />
            </button>
          </div>

          <div className="overflow-x-auto border border-slate-200/80 rounded-lg bg-white">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="bg-slate-100/80 border-b border-slate-200 text-slate-600 font-extrabold uppercase text-[10px] tracking-wider">
                  <th className="p-3">Requested By</th>
                  <th className="p-3">Subject / Class</th>
                  <th className="p-3">Date &amp; Time Slot</th>
                  <th className="p-3">Reason / Details</th>
                  <th className="p-3">Status</th>
                  <th className="p-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white font-medium text-slate-800">
                {loadingCovers ? (
                  <tr><td colSpan={6} className="p-6 text-center text-slate-400">Loading incoming cover requests...</td></tr>
                ) : incomingCovers.length === 0 ? (
                  <tr><td colSpan={6} className="p-6 text-center text-slate-400 italic">No incoming cover requests assigned to you.</td></tr>
                ) : (
                  paginatedCovers.map((c) => (
                    <tr key={c.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="p-3 font-extrabold text-slate-900">
                        {c.requestorName}
                      </td>
                      <td className="p-3">
                        <div className="font-bold text-slate-800">{c.course}</div>
                        <div className="text-[10px] text-slate-500">{c.classGroup || "General"}</div>
                      </td>
                      <td className="p-3 font-mono text-[11px] text-slate-800 font-bold">
                        <div>{c.dateFormatted || c.dateStr}</div>
                        <div className="text-[10px] text-slate-500">{c.time} ({c.day})</div>
                      </td>
                      <td className="p-3 text-[11px] italic text-slate-600 max-w-[240px] truncate" title={c.reason}>
                        {c.reason}
                      </td>
                      <td className="p-3">
                        {c.status === "pending" && <span className="px-2.5 py-0.5 rounded-full bg-amber-100/80 text-amber-800 text-[10px] font-black uppercase">Pending Your Action</span>}
                        {isAwaitingCm(c.status) && <span className="px-2.5 py-0.5 rounded-full bg-blue-100/80 text-blue-800 text-[10px] font-black uppercase">Pending CM</span>}
                        {c.status === "approved" && <span className="px-2.5 py-0.5 rounded-full bg-emerald-100/80 text-emerald-800 text-[10px] font-black uppercase">Accepted</span>}
                        {c.status === "rejected" && <span className="px-2.5 py-0.5 rounded-full bg-rose-100/80 text-rose-800 text-[10px] font-black uppercase">Declined</span>}
                      </td>
                      <td className="p-3 text-right">
                        {(isAnyPendingCmRequest(c.status)) ? (
                          <div className="flex items-center gap-1.5 justify-end">
                            <button
                              type="button"
                              disabled={actionCoverId === c.id}
                              onClick={() => handleResolveCover(c.id, "approved")}
                              className="px-3 py-1 rounded-md text-[10px] font-black bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs cursor-pointer transition-all disabled:opacity-50"
                            >
                              Accept
                            </button>
                            <button
                              type="button"
                              disabled={actionCoverId === c.id}
                              onClick={() => handleResolveCover(c.id, "rejected")}
                              className="px-3 py-1 rounded-md text-[10px] font-black bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 cursor-pointer transition-all disabled:opacity-50"
                            >
                              Decline
                            </button>
                          </div>
                        ) : (
                          <span className="text-[10px] text-slate-400 font-bold capitalize">{c.status}</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
            <Pagination
              currentPage={coverPage}
              totalItems={incomingCovers.length}
              pageSize={coverPageSize}
              onPageChange={setCoverPage}
              onPageSizeChange={setCoverPageSize}
            />
          </div>
        </div>
      ) : panelTab === "punch_history" ? (
        /* Historical Attendance Logs View */
        <div className="bg-slate-50/70 border border-slate-100 rounded-xl p-5 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-emerald-600" />
              <h3 className="text-xs font-extrabold text-slate-900 uppercase tracking-wider">My Historical Daily Punch Logs</h3>
            </div>
            <button onClick={fetchAttendanceLogs} className="p-1.5 rounded-md border border-slate-200 bg-white text-slate-500 hover:text-amber-600 hover:border-amber-300 transition-all cursor-pointer">
              <RefreshCw className="h-4 w-4" />
            </button>
          </div>

          <div className="overflow-x-auto border border-slate-200/80 rounded-lg bg-white">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="bg-slate-100/80 border-b border-slate-200 text-slate-600 font-extrabold uppercase text-[10px] tracking-wider">
                  <th className="p-3">Date</th>
                  <th className="p-3">Attendance Status</th>
                  <th className="p-3">Punch-In Time</th>
                  <th className="p-3">Marked By</th>
                  <th className="p-3">Remarks / Reason</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white font-medium text-slate-800">
                {loadingAttLogs ? (
                  <tr><td colSpan={5} className="p-6 text-center text-slate-400">Loading attendance history...</td></tr>
                ) : attLogs.length === 0 ? (
                  <tr><td colSpan={5} className="p-6 text-center text-slate-400 italic">No attendance punch history logged yet.</td></tr>
                ) : (
                  paginatedAttLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="p-3 font-mono font-bold text-slate-900">{log.date_str}</td>
                      <td className="p-3">
                        {log.status === "Present" && <span className="px-2.5 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-black uppercase">Present</span>}
                        {log.status === "OD" && <span className="px-2.5 py-0.5 rounded-md bg-amber-50 text-amber-800 border border-amber-200 text-[10px] font-black uppercase">On Duty (OD)</span>}
                        {log.status === "Leave" && <span className="px-2.5 py-0.5 rounded-md bg-amber-50 text-amber-700 border border-amber-200 text-[10px] font-black uppercase">On Leave</span>}
                        {log.status === "Absent" && <span className="px-2.5 py-0.5 rounded-md bg-rose-50 text-rose-700 border border-rose-200 text-[10px] font-black uppercase">Absent</span>}
                      </td>
                      <td className="p-3 font-mono text-[11px] text-slate-700">{formatPunchTime(log.punch_in_time)}</td>
                      <td className="p-3 text-[11px] text-slate-600 font-semibold capitalize">{log.marked_by || "Self"}</td>
                      <td className="p-3 text-[11px] italic text-slate-600 max-w-[280px] truncate" title={log.reason || ""}>
                        {log.reason || "—"}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
            <Pagination
              currentPage={punchPage}
              totalItems={attLogs.length}
              pageSize={punchPageSize}
              onPageChange={setPunchPage}
              onPageSizeChange={setPunchPageSize}
            />
          </div>
        </div>
      ) : (
        /* Leave Applications Table View */
        <div className="bg-slate-50/70 border border-slate-100 rounded-xl p-5 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-amber-500" />
              <h3 className="text-xs font-extrabold text-slate-900 uppercase tracking-wider">My Leave &amp; Permission Applications</h3>
            </div>
            <button onClick={fetchRequests} className="p-1.5 rounded-md border border-slate-200 bg-white text-slate-500 hover:text-amber-600 hover:border-amber-300 transition-all cursor-pointer">
              <RefreshCw className="h-4 w-4" />
            </button>
          </div>

          <div className="overflow-x-auto border border-slate-200/80 rounded-lg bg-white">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="bg-slate-100/80 border-b border-slate-200 text-slate-600 font-extrabold uppercase text-[10px] tracking-wider">
                  <th className="p-3">Request Type</th>
                  <th className="p-3">Schedule / Dates</th>
                  <th className="p-3">Mandatory Reason</th>
                  <th className="p-3">Approval Status</th>
                  <th className="p-3 text-right">Submitted On</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white font-medium text-slate-800">
                {loading ? (
                  <tr><td colSpan={5} className="p-6 text-center text-slate-400">Loading leave requests...</td></tr>
                ) : requests.length === 0 ? (
                  <tr><td colSpan={5} className="p-6 text-center text-slate-400 italic">No leave or permission requests submitted yet.</td></tr>
                ) : (
                  paginatedRequests.map((r) => (
                    <tr key={r.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="p-3 font-extrabold">
                        {(r.request_type === "Leave" || r.request_type === "Casual Leave") && <span className="px-2.5 py-0.5 rounded-md bg-amber-50 text-amber-700 border border-amber-200/80 text-[10px] font-black uppercase">{r.request_type === "Casual Leave" ? "Casual Leave" : "Leave"}</span>}
                        {r.request_type === "Emergency Leave" && <span className="px-2.5 py-0.5 rounded-md bg-rose-50 text-rose-700 border border-rose-200/80 text-[10px] font-black uppercase">Emergency</span>}
                        {r.request_type === "Permission" && <span className="px-2.5 py-0.5 rounded-md bg-blue-50 text-blue-700 border border-blue-200/80 text-[10px] font-black uppercase">Permission</span>}
                        {r.request_type === "OD" && <span className="px-2.5 py-0.5 rounded-md bg-amber-50 text-amber-800 border border-amber-200/80 text-[10px] font-black uppercase">OD (On Duty)</span>}
                      </td>
                      <td className="p-3 font-mono text-[11px] text-slate-800 font-bold">
                        {r.start_date} {r.end_date !== r.start_date ? `to ${r.end_date}` : ""}
                      </td>
                      <td className="p-3 text-[11px] italic text-slate-700 max-w-[260px] truncate" title={r.reason}>
                        {r.reason}
                      </td>
                      <td className="p-3">
                        {(() => {
                          const st = (r.status || "").toLowerCase().trim();
                          const approver = r.approved_by || r.approvedBy;
                          const rejReason = r.rejection_reason || r.rejectionReason;

                          if (st === "approved") {
                            return (
                              <div className="space-y-0.5">
                                <span className="px-2.5 py-0.5 rounded-full bg-emerald-100/80 text-emerald-800 text-[10px] font-black uppercase inline-flex items-center gap-1 shadow-2xs">
                                  <CheckCircle className="h-3 w-3" />
                                  Approved
                                </span>
                                {approver && (
                                  <div className="text-[10px] text-slate-500 font-bold">
                                    {approver}
                                  </div>
                                )}
                              </div>
                            );
                          }

                          if (st === "rejected") {
                            return (
                              <div className="space-y-0.5">
                                <span className="px-2.5 py-0.5 rounded-full bg-rose-100/80 text-rose-800 text-[10px] font-black uppercase inline-flex items-center gap-1 shadow-2xs">
                                  <XCircle className="h-3 w-3" />
                                  Rejected
                                </span>
                                {rejReason && (
                                  <div className="text-[10px] text-rose-600 font-medium max-w-[200px] truncate" title={rejReason}>
                                    {rejReason}
                                  </div>
                                )}
                              </div>
                            );
                          }

                          return (
                            <div className="space-y-0.5">
                              {r.covers && r.covers.length > 0 ? (
                                r.covers.some((c: any) => c.status === "approved") ? (
                                  <div>
                                    <span className="px-2.5 py-0.5 rounded-full bg-blue-100/80 text-blue-800 text-[10px] font-black uppercase inline-flex items-center gap-1 shadow-2xs">
                                      <CheckCircle className="h-3 w-3" />
                                      Cover Accepted
                                    </span>
                                    <div className="text-[10px] text-slate-500 font-bold">
                                      {r.covers.filter((c: any) => c.status === "approved").map((c: any) => c.targetStaffName || c.targetstaffname).join(", ")}
                                    </div>
                                  </div>
                                ) : r.covers.some((c: any) => c.status === "rejected") ? (
                                  <div>
                                    <span className="px-2.5 py-0.5 rounded-full bg-rose-100/80 text-rose-800 text-[10px] font-black uppercase inline-flex items-center gap-1 shadow-2xs">
                                      <XCircle className="h-3 w-3" />
                                      Cover Declined
                                    </span>
                                    <div className="text-[10px] text-rose-600 font-medium">Please re-select cover</div>
                                  </div>
                                ) : (
                                  <div>
                                    <span className="px-2.5 py-0.5 rounded-full bg-amber-100/80 text-amber-800 text-[10px] font-black uppercase inline-flex items-center gap-1 shadow-2xs">
                                      <Clock className="h-3 w-3" />
                                      Pending Cover
                                    </span>
                                    <div className="text-[10px] text-slate-500 font-bold">
                                      {r.covers.map((c: any) => c.targetStaffName || c.targetstaffname).join(", ")}
                                    </div>
                                  </div>
                                )
                              ) : (
                                <span className="px-2.5 py-0.5 rounded-full bg-amber-100/80 text-amber-800 text-[10px] font-black uppercase inline-flex items-center gap-1 shadow-2xs">
                                  <Clock className="h-3 w-3" />
                                  Pending CM
                                </span>
                              )}
                            </div>
                          );
                        })()}
                      </td>
                      <td className="p-3 text-right font-mono text-[10px] text-slate-400">
                        {new Date(r.created_at).toLocaleDateString()}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
            <Pagination
              currentPage={leavePage}
              totalItems={requests.length}
              pageSize={leavePageSize}
              onPageChange={setLeavePage}
              onPageSizeChange={setLeavePageSize}
            />
          </div>
        </div>
      )}

      {/* Styled Popup Modal: 2-Step Wizard matching CM Dashboard Palette */}
      {showModal && (
        <Dialog
          open={showModal}
          onOpenChange={(next) => {
            if (!next) setShowModal(false);
          }}
          ariaLabel="Apply leave, permission or on duty"
          overlayClassName="bg-slate-950/60 backdrop-blur-sm"
          panelClassName="max-w-lg rounded-xl p-0 space-y-0 overflow-y-auto max-h-[90vh] bg-white"
        >
          <form onSubmit={handleSubmit} className="w-full space-y-0">

            {/* Modal Header with 2-Step Wizard Indicator */}
            <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-lg bg-zinc-100 flex items-center justify-center text-amber-500 shrink-0 border border-indigo-100">
                  <CalendarCheck2 className="h-4.5 w-4.5" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-slate-900 leading-tight">Apply Leave / Permission / OD</h3>
                  <div className="flex items-center gap-1.5 mt-1">
                    <span className={`text-[10px] font-black px-2 py-0.5 rounded-full flex items-center gap-1 ${formStep === 1
                        ? "bg-zinc-900 text-white shadow-2xs ring-1 ring-zinc-800"
                        : "bg-emerald-100 text-emerald-800"
                      }`}>
                      {formStep === 2 && "✓ "}Step 1: Leave Details
                    </span>
                    {affectedSlots.length > 0 && (
                      <>
                        <span className="text-[10px] text-slate-300 font-bold">→</span>
                        <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${formStep === 2
                            ? "bg-zinc-900 text-white shadow-2xs ring-1 ring-zinc-800"
                            : "bg-slate-200 text-slate-600"
                          }`}>
                          Step 2: Class Cover ({affectedSlots.length})
                        </span>
                      </>
                    )}
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowModal(false);
                  setFormStep(1);
                }}
                className="text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 p-1.5 rounded-md transition-all cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Modal Body: STEP 1 (Leave Details) */}
            {formStep === 1 && (
              <div className="p-5 space-y-4 bg-slate-50/40">
                {/* Request Type Select Dropdown */}
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">
                    Request Type <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={requestType}
                    onChange={(e) => setRequestType(e.target.value as any)}
                    className="w-full text-xs font-bold p-2.5 rounded-lg border border-slate-200 bg-white text-slate-800 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500/20 transition-all cursor-pointer"
                    aria-label="Request Type"
                  >
                    <option value="Casual Leave">Casual Leave</option>
                    <option value="Emergency">Emergency</option>
                    <option value="On Duty">On Duty</option>
                    <option value="Permission">Permission</option>
                  </select>
                </div>

                {/* Dynamic Dates/Times based on Request Type */}
                {requestType === "Permission" ? (
                  /* Permission View: Date + From Time + To Time */
                  <div className="space-y-3 bg-zinc-50 p-3.5 rounded-lg border border-zinc-200">
                    <div>
                      <label className="text-xs font-bold text-slate-700 block mb-1">
                        Permission Date <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="date"
                        required
                        value={startDate}
                        onChange={(e) => setStartDate(e.target.value)}
                        className="w-full text-xs font-bold p-2 rounded-md border border-slate-200 bg-white text-slate-800 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500/20"
                        aria-label="Permission Date"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs font-bold text-slate-700 block mb-1">From Time <span className="text-rose-500">*</span></label>
                        <input
                          type="time"
                          required
                          value={startTime}
                          onChange={(e) => setStartTime(e.target.value)}
                          className="w-full text-xs font-bold p-2 rounded-md border border-slate-200 bg-white text-slate-800 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500/20"
                          aria-label="From Time"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-bold text-slate-700 block mb-1">To Time <span className="text-rose-500">*</span></label>
                        <input
                          type="time"
                          required
                          value={endTime}
                          onChange={(e) => setEndTime(e.target.value)}
                          className="w-full text-xs font-bold p-2 rounded-md border border-slate-200 bg-white text-slate-800 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500/20"
                          aria-label="To Time"
                        />
                      </div>
                    </div>
                  </div>
                ) : (
                  /* Leave & OD View: From Date + To Date */
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-bold text-slate-700 block mb-1">
                        From Date <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="date"
                        required
                        value={startDate}
                        onChange={(e) => {
                          setStartDate(e.target.value);
                          if (e.target.value > endDate) setEndDate(e.target.value);
                        }}
                        className="w-full text-xs font-bold p-2.5 rounded-lg border border-slate-200 bg-white text-slate-800 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500/20 transition-all"
                        aria-label="From Date"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-bold text-slate-700 block mb-1">
                        To Date <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="date"
                        required
                        min={startDate}
                        value={endDate}
                        onChange={(e) => setEndDate(e.target.value)}
                        className="w-full text-xs font-bold p-2.5 rounded-lg border border-slate-200 bg-white text-slate-800 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500/20 transition-all"
                        aria-label="To Date"
                      />
                    </div>
                  </div>
                )}

                {/* ── Demo Reallocation Panel (leave conflicts with scheduled demos) ── */}
                {impactedDemos.length > 0 && (
                  <div className="rounded-xl border border-amber-300 bg-amber-50/60 overflow-hidden">
                    <div className="px-4 py-3 border-b border-amber-200 bg-amber-100/60 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
                        <div>
                          <div className="text-xs font-black text-amber-900">
                            L&D Reallocation Required ({impactedDemos.length} scheduled session{impactedDemos.length > 1 ? "s" : ""} impacted)
                          </div>
                          <p className="text-[10.5px] text-amber-700 font-medium">
                            Your leave overlaps scheduled L&D session(s). Pick an alternative free period for each — the chosen period is reserved and sent to L&amp;D for approval before your leave proceeds.
                          </p>
                        </div>
                      </div>
                      {allDemosHandled && (
                        <span className="shrink-0 px-2 py-0.5 rounded-full bg-emerald-100 border border-emerald-300 text-emerald-800 text-[9.5px] font-black uppercase">
                          ✓ All Handled
                        </span>
                      )}
                    </div>

                    <div className="divide-y divide-amber-200/70">
                      {impactedDemos.map((demo: any) => {
                        const isHandled = reallocSubmittedIds.has(demo.id);
                        const pick = demoReallocationPicks[demo.id];
                        const alts = reallocAlternatives[demo.id];
                        const loading = reallocLoading[demo.id];

                        return (
                          <div key={demo.id} className="p-4 space-y-3">
                            {/* Demo details */}
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                              <div className="space-y-0.5">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="text-xs font-black text-slate-900">{demo.subject}</span>
                                  <span className="px-1.5 py-0.5 rounded bg-zinc-100 border border-zinc-200 text-zinc-900 text-[9px] font-black uppercase">
                                    Week {demo.week ?? "—"}
                                  </span>
                                  {isHandled && (
                                    <span className="px-1.5 py-0.5 rounded bg-emerald-100 border border-emerald-300 text-emerald-800 text-[9px] font-black uppercase">
                                      ✓ Reserved — Pending L&amp;D
                                    </span>
                                  )}
                                </div>
                                <div className="text-[10.5px] text-slate-600 font-medium">
                                  Current period: <span className="font-bold">{demo.dateStr}</span> • <span className="font-bold">{demo.timeSlot}</span>
                                </div>
                                <div className="text-[10px] text-slate-500">
                                  SME Evaluator: <span className="font-bold text-slate-700">{demo.smeName}</span> • Mentor: <span className="font-bold text-slate-700">{demo.mentorName || mentor.name}</span> • Cohort: {demo.stream || "General"}
                                </div>
                              </div>
                              {!isHandled && !alts && (
                                <button
                                  type="button"
                                  onClick={() => fetchReallocAlternatives(demo.id)}
                                  className="shrink-0 px-3 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-white border border-white/10 text-[10.5px] font-black transition-all cursor-pointer"
                                >
                                  {loading ? "Loading periods…" : "Find Alternative Periods"}
                                </button>
                              )}
                            </div>

                            {/* Alternative period picker */}
                            {!isHandled && alts && (
                              <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                                {alts.length === 0 && (
                                  <p className="text-[11px] text-rose-600 font-medium">No suitable alternative dates found in the next 3 weeks. Contact the L&amp;D Team.</p>
                                )}
                                {alts.map(day => {
                                  const freeCount = day.periods.filter((p: any) => p.mutuallyFree).length;
                                  return (
                                    <div key={day.dateStr} className="rounded-2xl border border-slate-100 bg-white overflow-hidden shadow-card">
                                      <div className="px-3 py-1.5 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
                                        <span className="text-[10.5px] font-black text-slate-700">{day.label}</span>
                                        <span className={`text-[9.5px] font-bold px-1.5 py-0.5 rounded ${freeCount > 0 ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-400"}`}>
                                          {freeCount} free period{freeCount === 1 ? "" : "s"}
                                        </span>
                                      </div>
                                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 p-2">
                                        {day.periods.map((p: any) => {
                                          const selected = pick?.dateStr === day.dateStr && pick?.timeSlot === p.period;
                                          return (
                                            <button
                                              key={day.dateStr + p.period}
                                              type="button"
                                              disabled={!p.mutuallyFree}
                                              onClick={() => setDemoReallocationPicks(prev => ({ ...prev, [demo.id]: { dateStr: day.dateStr, timeSlot: p.period } }))}
                                              className={`p-2 rounded-lg border text-left transition-all cursor-pointer ${selected
                                                  ? "border-amber-500 bg-amber-50/60 ring-1 ring-amber-400"
                                                  : p.mutuallyFree
                                                    ? "border-slate-200 hover:border-amber-300 bg-white"
                                                    : "border-slate-100 bg-slate-50 opacity-50 cursor-not-allowed"
                                                }`}
                                            >
                                              <div className={`text-[10px] font-black truncate ${selected ? "text-amber-700" : p.mutuallyFree ? "text-slate-800" : "text-slate-400"}`}>
                                                {p.period}
                                              </div>
                                              <div className={`text-[9px] font-bold ${p.mutuallyFree ? "text-emerald-600" : "text-rose-400"}`}>
                                                {p.mutuallyFree ? "✓ Free (you & SME)" : !p.mentorFree ? (p.mentorReason || "You are busy") : (p.smeReason || "SME busy")}
                                              </div>
                                            </button>
                                          );
                                        })}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            )}

                            {/* Reserve action */}
                            {!isHandled && pick && (
                              <div className="flex items-center justify-between gap-2 pt-1">
                                <span className="text-[10.5px] text-slate-600 font-medium">
                                  Selected: <span className="font-black text-amber-700">{pick.dateStr} • {pick.timeSlot}</span>
                                </span>
                                <button
                                  type="button"
                                  disabled={loading}
                                  onClick={() => submitDemoReallocation(demo)}
                                  className="shrink-0 px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[10.5px] font-black transition-all cursor-pointer disabled:opacity-50"
                                >
                                  {loading ? "Reserving…" : "Reserve & Send to L&D"}
                                </button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Mandatory Reason Field */}
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">
                    Mandatory Reason / Remarks <span className="text-rose-500">*</span>
                  </label>
                  <textarea
                    required
                    rows={3}
                    placeholder={
                      requestType === "Permission"
                        ? "Specify reason for short permission (e.g., Doctor appointment / Urgent personal errand)..."
                        : requestType === "On Duty" || (requestType as string) === "OD"
                          ? "Specify OD details (e.g., Placement drive invigilation at Main Auditorium)..."
                          : "Specify reason for leave application..."
                    }
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    className="w-full text-xs font-medium p-3 rounded-lg border border-slate-200 bg-white text-slate-800 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500/20 transition-all"
                    aria-label="Mandatory Reason / Remarks"
                  />
                </div>

                {/* Schedule Impact Quick Badge */}
                {affectedSlots.length > 0 ? (
                  <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-[11px] font-medium flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                      <span><strong>{affectedSlots.length} class{affectedSlots.length > 1 ? "es" : ""}</strong> scheduled during this leave period.</span>
                    </div>
                    <span className="text-[10px] font-extrabold text-amber-800 bg-amber-100/80 px-2 py-0.5 rounded">
                      Cover mapping in Step 2 →
                    </span>
                  </div>
                ) : (
                  <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-[11px] font-medium flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>No regular timetable classes scheduled during this selected time window.</span>
                  </div>
                )}
              </div>
            )}

            {/* Modal Body: STEP 2 (Class Cover Mapping) */}
            {formStep === 2 && (
              <div className="p-5 space-y-3.5 bg-slate-50/40 max-h-[60vh] overflow-y-auto">
                <div className="p-3 rounded-xl bg-zinc-50 border border-zinc-200 text-zinc-950 text-xs flex items-center justify-between gap-2.5 flex-wrap">
                  <div className="flex items-center gap-2.5">
                    <div className="h-6 w-6 rounded-full bg-zinc-900 text-white flex items-center justify-center font-black text-xs shrink-0">
                      2
                    </div>
                    <div>
                      <div className="font-extrabold">Faculty Class Cover Arrangement ({affectedSlots.length} Total)</div>
                      <div className="text-[10.5px] text-amber-700">Map an available colleague for each period to ensure class continuity.</div>
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  {affectedSlots.map((item, idx) => {
                    const key = `${item.slot.id}_${item.dateStr}`;
                    const opts = coverOptions?.[key];
                    const selectedCover = coverSelections[key] || "";

                    return (
                      <div key={idx} className="bg-white rounded-2xl border border-slate-100 p-3.5 shadow-card space-y-2.5">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="font-black text-slate-900 text-xs">{item.slot.course}</div>
                            <div className="text-[10px] text-slate-500 font-semibold">{item.slot.classGroup || "General"} · {item.slot.day}</div>
                          </div>
                          <span className="font-mono text-[10px] px-2 py-0.5 rounded bg-slate-100 font-bold text-slate-700">
                            {item.dateStr} · {item.slot.time}
                          </span>
                        </div>

                        {/* Direct Colleague Faculty Selector */}
                        <div className="space-y-1.5 pt-2 border-t border-slate-100">
                          <label className="text-[10px] font-black text-slate-600 uppercase tracking-wider block">
                            Select Replacement Faculty Member:
                          </label>
                          <select
                            value={selectedCover === "cam_help" ? "" : selectedCover}
                            onChange={(e) => {
                              setCoverSelections(prev => ({
                                ...prev,
                                [key]: e.target.value
                              }));
                            }}
                            className={`w-full text-[11px] font-bold p-2.5 rounded-lg border transition-all cursor-pointer ${selectedCover && selectedCover !== "cam_help"
                                ? "border-emerald-500 bg-emerald-50/50 text-emerald-950 ring-1 ring-emerald-400/50"
                                : "border-slate-300 bg-white text-slate-700 hover:border-slate-400"
                              }`}
                            aria-label="Select Replacement Faculty Member"
                          >
                            <option value="">👤 Select Available Faculty Member...</option>
                            {opts?.loading && <option disabled>⏳ Checking faculty availability...</option>}
                            {opts && !opts.loading && opts.mentors.length === 0 && (
                              <option disabled>No faculty free in this time slot</option>
                            )}
                            {opts?.mentors?.map((m: any) => (
                              <option key={m.id} value={m.id}>
                                {m.sameSubject ? "★ " : ""}{m.name}{m.department ? ` (${m.department})` : ""}
                              </option>
                            ))}
                          </select>

                          {/* Status Explanatory Note */}
                          {selectedCover && selectedCover !== "cam_help" ? (
                            <p className="text-[10px] text-emerald-700 font-semibold flex items-center gap-1">
                              ✓ Direct cover request will be dispatched to faculty upon submission.
                            </p>
                          ) : (
                            <p className="text-[10px] text-amber-700 font-medium">
                              ⚠️ Please select an available faculty colleague for this class period.
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Modal Action Buttons Footer */}
            <div className="bg-slate-50 p-4 px-5 border-t border-slate-100 flex items-center justify-between gap-2.5">
              {formStep === 2 ? (
                <button
                  type="button"
                  onClick={() => setFormStep(1)}
                  className="px-4 py-1.5 rounded-md text-xs font-bold text-slate-700 bg-white border border-slate-200 hover:bg-slate-100 transition-all cursor-pointer flex items-center gap-1.5"
                >
                  ← Back to Details
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setShowModal(false);
                    setFormStep(1);
                  }}
                  className="px-4 py-1.5 rounded-md text-xs font-bold text-slate-600 bg-white border border-slate-200 hover:bg-slate-100 transition-all cursor-pointer"
                >
                  Cancel
                </button>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="px-5 py-1.5 rounded-md text-xs font-extrabold text-white bg-indigo-600 hover:bg-indigo-700 shadow-xs transition-all cursor-pointer flex items-center gap-2 disabled:opacity-50"
              >
                {submitting
                  ? "Submitting..."
                  : formStep === 1 && affectedSlots.length > 0
                    ? `Next: Map Class Covers (${affectedSlots.length}) →`
                    : "Submit Application →"
                }
              </button>
            </div>
          </form>
        </Dialog>
      )}
    </div>
  );
};

/* ─── Mentor Study Materials Studio & Courseware Hub ─── */
interface MentorStudyMaterialsStudioProps {
  mentor: Mentor;
  mentorSubjects: string[];
  mentorClasses: string[];
  subjectsList: any[];
}

const MentorStudyMaterialsStudio: React.FC<MentorStudyMaterialsStudioProps> = ({
  mentor,
  mentorSubjects = [],
  mentorClasses = [],
  subjectsList = []
}) => {
  const { toast, confirm: showConfirm } = useToast();
  const queryClient = useQueryClient();
  const [selectedSubject, setSelectedSubject] = useState<string>(mentorSubjects[0] || "");
  const [selectedUnit, setSelectedUnit] = useState<number | "all">("all");
  const [selectedType, setSelectedType] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [materialsPage, setMaterialsPage] = useState<number>(1);
  const [materialsPageSize, setMaterialsPageSize] = useState<number>(10);

  useEffect(() => {
    setMaterialsPage(1);
  }, [selectedSubject, selectedUnit, selectedType, searchQuery]);

  // Upload / Edit Modal
  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState<any | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Form Fields
  const [formSubject, setFormSubject] = useState(selectedSubject || mentorSubjects[0] || "");
  const [formClassGroup, setFormClassGroup] = useState<string>("");
  const [formUnit, setFormUnit] = useState<number>(1);
  const [formType, setFormType] = useState<string>("notes");
  const [formTitle, setFormTitle] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formFileUrl, setFormFileUrl] = useState("");
  const [formFileSize, setFormFileSize] = useState("");

  // Preview Modal
  const [previewItem, setPreviewItem] = useState<any | null>(null);
  // Deleting item tracking
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const materialsQuery = useQuery({
    queryKey: qk.materials(`mentor:${mentor.id}:${selectedSubject || "all"}`),
    queryFn: async () => {
      const url = selectedSubject ? `/api/materials?subject=${encodeURIComponent(selectedSubject)}` : `/api/materials`;
      const data = await apiFetch(url);
      return data?.success && Array.isArray(data.materials) ? (data.materials as any[]) : [];
    },
  });
  const materials = materialsQuery.data || [];
  const loading = materialsQuery.isFetching;

  const fetchMaterials = (subj?: string) => {
    if (subj !== undefined && subj !== selectedSubject) {
      setSelectedSubject(subj);
      return Promise.resolve();
    }
    return materialsQuery.refetch();
  };

  useEffect(() => {
    if (mentorSubjects.length > 0 && !selectedSubject) {
      setSelectedSubject(mentorSubjects[0]);
    }
  }, [mentorSubjects, selectedSubject]);

  const handleOpenUpload = (itemToEdit?: any) => {
    if (itemToEdit) {
      setEditingItem(itemToEdit);
      setFormSubject(itemToEdit.subject || selectedSubject || mentorSubjects[0] || "");
      setFormClassGroup(itemToEdit.class_group || "");
      setFormUnit(itemToEdit.unit_number || 1);
      setFormType(itemToEdit.material_type || "notes");
      setFormTitle(itemToEdit.title || "");
      setFormDescription(itemToEdit.description || "");
      setFormFileUrl(itemToEdit.file_url || itemToEdit.external_url || "");
      setFormFileSize(itemToEdit.file_size || "");
    } else {
      setEditingItem(null);
      setFormSubject(selectedSubject || mentorSubjects[0] || "");
      setFormClassGroup("");
      setFormUnit(1);
      setFormType("notes");
      setFormTitle("");
      setFormDescription("");
      setFormFileUrl("");
      setFormFileSize("");
    }
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formSubject.trim() || !formTitle.trim()) {
      toast("Subject and Title are required", "error");
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        id: editingItem?.id || undefined,
        subject: formSubject.trim(),
        unit_number: formUnit,
        title: formTitle.trim(),
        description: formDescription.trim() || null,
        material_type: formType,
        file_url: formFileUrl.trim() || null,
        external_url: formFileUrl.trim() || null,
        file_size: formFileSize.trim() || null,
        uploaded_by: mentor.name,
        mentor_id: mentor.id,
        class_group: formClassGroup.trim() || null,
        college_id: mentor.college_id || null
      };

      const res = await fetch("/api/materials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await res.json();

      if (data.success) {
        toast(editingItem ? "Study material updated successfully!" : "Study material published to student portal!", "success");
        setShowModal(false);
        setEditingItem(null);
        await queryClient.invalidateQueries({ queryKey: ["materials"] });
        announceDataChanged("materials");
      } else {
        toast(data.message || "Failed to save study material", "error");
      }
    } catch (err: any) {
      toast("Error: " + err.message, "error");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    const ok = await showConfirm({
      message: "Delete this study material? Students will no longer see it.",
      danger: true,
      confirmLabel: "Delete"
    });
    if (!ok) return;
    setDeletingId(id);
    try {
      const res = await fetch(`/api/materials?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      const data = await res.json();
      if (data.success) {
        toast("Material deleted successfully", "success");
        queryClient.setQueryData(qk.materials(`mentor:${mentor.id}:${selectedSubject || "all"}`), (prev: any[] | undefined) =>
          (prev || []).filter((m) => m.id !== id)
        );
        announceDataChanged("materials");
      } else {
        toast(data.message || "Failed to delete material", "error");
      }
    } catch (err: any) {
      toast("Error: " + err.message, "error");
    } finally {
      setDeletingId(null);
    }
  };

  // Filtered materials
  const filteredMaterials = (materials || []).filter(item => {
    const matchesSubject = !selectedSubject || isSubjectNameMatch(item.subject, selectedSubject) || item.subject.toLowerCase().trim() === selectedSubject.toLowerCase().trim();
    const matchesUnit = selectedUnit === "all" || item.unit_number === selectedUnit;
    const matchesType = selectedType === "all" ||
      item.material_type === selectedType ||
      (selectedType === "ppt" && item.material_type === "slides") ||
      (selectedType === "slides" && item.material_type === "ppt") ||
      (selectedType === "notes" && item.material_type === "notes") ||
      (selectedType === "assignment" && item.material_type === "question_bank") ||
      (selectedType === "question_bank" && item.material_type === "assignment");
    const matchesSearch = !searchQuery ||
      item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (item.description && item.description.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (item.class_group && item.class_group.toLowerCase().includes(searchQuery.toLowerCase()));
    return matchesSubject && matchesUnit && matchesType && matchesSearch;
  });

  // Calculate unique units with uploads
  const unitsWithUploads = Array.from(new Set(materials.map(m => m.unit_number))).filter(Boolean);

  // Available subjects for selector: combine assigned subjects and all subjects
  const displaySubjects = mentorSubjects.length > 0
    ? mentorSubjects
    : subjectsList.map((s: any) => s.name || s);

  return (
    <div className="space-y-6 animate-fadeIn pb-12">
      {/* ── Top Header Banner & Stats Bar ── */}
      <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-card space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-5">
          <div className="flex items-center gap-3.5">
            <div className="h-10 w-10 rounded-xl bg-zinc-100 border border-zinc-200 flex items-center justify-center text-amber-500 shrink-0">
              <Book className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-black text-slate-900 leading-tight">
                  Study Materials &amp; Courseware Hub
                </h2>
                <span className="px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200/60 text-[9px] font-black uppercase">
                  Faculty Publishing Studio
                </span>
              </div>
              <p className="text-xs text-slate-500 font-medium mt-0.5">
                Upload verified unit-wise notes, PPTs, question banks, and video reference links for your enrolled students.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => fetchMaterials(selectedSubject)}
              className="p-2.5 rounded-xl bg-sunken hover:bg-white border border-slate-200 inset-shadow-well text-slate-600 transition-colors cursor-pointer shadow-2xs"
              title="Refresh Materials"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin text-amber-600" : ""}`} />
            </button>
            <button
              type="button"
              onClick={() => handleOpenUpload()}
              className="px-4 py-2.5 bg-zinc-900 hover:bg-zinc-800 text-white border border-white/10 rounded-xl text-xs font-black transition-all flex items-center gap-2 shadow-xs cursor-pointer"
            >
              <Plus className="h-4 w-4" />
              Upload Study Material
            </button>
          </div>
        </div>

        {/* Quick Stats Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1">
          <div className="p-3 bg-slate-50/70 rounded-xl border border-slate-100">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Total Materials</span>
            <span className="text-lg font-black text-slate-800 mt-0.5 block">{materials.length}</span>
          </div>
          <div className="p-3 bg-zinc-50 rounded-xl border border-zinc-200">
            <span className="text-[10px] font-bold text-amber-600 uppercase tracking-wider block">Units Covered</span>
            <span className="text-lg font-black text-zinc-950 mt-0.5 block">{unitsWithUploads.length} / 5 Units</span>
          </div>
          <div className="p-3 bg-emerald-50/50 rounded-xl border border-emerald-100">
            <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider block">Active Subject</span>
            <span className="text-xs font-black text-emerald-900 mt-1 block truncate" title={selectedSubject}>
              {selectedSubject || "All Subjects"}
            </span>
          </div>
          <div className="p-3 bg-purple-50/50 rounded-xl border border-purple-100">
            <span className="text-[10px] font-bold text-purple-600 uppercase tracking-wider block">Student Sync Status</span>
            <span className="text-xs font-black text-purple-900 mt-1 block flex items-center gap-1">
              <CheckCircle className="h-3.5 w-3.5 text-purple-600 shrink-0" /> Real-time Live
            </span>
          </div>
        </div>

        {/* Subject Pills Filter */}
        <div className="space-y-2 pt-2 border-t border-slate-100">
          <div className="flex items-center justify-between">
            <label className="text-[10px] text-slate-400 font-black uppercase tracking-wider block">
              Filter by Assigned Subject ({displaySubjects.length})
            </label>
            {selectedSubject && (
              <button
                type="button"
                onClick={() => setSelectedSubject("")}
                className="text-[10px] font-bold text-amber-600 hover:text-amber-800 cursor-pointer"
              >
                Show All Subjects
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {displaySubjects.map((subjName: string) => {
              const isSelected = selectedSubject.toLowerCase().trim() === subjName.toLowerCase().trim();
              return (
                <button
                  key={subjName}
                  type="button"
                  onClick={() => setSelectedSubject(subjName)}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center gap-2 border shadow-2xs ${isSelected
                      ? "bg-slate-900 border-slate-900 text-white ring-2 ring-amber-500/40 scale-105"
                      : "bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100"
                    }`}
                >
                  <GraduationCap className={`h-3.5 w-3.5 shrink-0 ${isSelected ? "text-amber-400" : "text-slate-400"}`} />
                  <span>{subjName}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Filter Toolbar: Units & Types ── */}
      <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-card space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Unit Filter Pills */}
          <div className="flex flex-wrap items-center gap-1.5 bg-slate-100/80 p-1 rounded-xl border border-slate-200/60">
            <button
              type="button"
              onClick={() => setSelectedUnit("all")}
              className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all cursor-pointer ${selectedUnit === "all"
                  ? "bg-zinc-900 text-white shadow-2xs border border-zinc-800 font-extrabold"
                  : "text-slate-500 hover:text-slate-800"
                }`}
            >
              All Units
            </button>
            {[1, 2, 3, 4, 5].map((u) => (
              <button
                key={u}
                type="button"
                onClick={() => setSelectedUnit(u)}
                className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all cursor-pointer ${selectedUnit === u
                    ? "bg-zinc-900 text-white shadow-2xs border border-zinc-800 font-extrabold"
                    : "text-slate-500 hover:text-slate-800"
                  }`}
              >
                Unit {u}
              </button>
            ))}
          </div>

          {/* Search Box */}
          <div className="relative flex-1 min-w-[220px] max-w-sm">
            <Search className="h-4 w-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search title, description, cohort..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-8 py-2 bg-sunken border border-slate-200 inset-shadow-well rounded-2xl text-xs font-bold text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all shadow-2xs"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 rounded-full hover:bg-slate-100 cursor-pointer"
                title="Clear search"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Material Type Pills */}
        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-100">
          <span className="text-[10px] text-slate-400 font-black uppercase tracking-wider mr-1">Type:</span>
          {[
            { id: "all", label: "All Types" },
            { id: "notes", label: "PDF Notes" },
            { id: "ppt", label: "Slides (PPT)" },
            { id: "assignment", label: "Question Banks / Tasks" },
            { id: "video", label: "Video Reference" },
            { id: "syllabus", label: "Syllabus" }
          ].map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setSelectedType(t.id)}
              className={`px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer border ${selectedType === t.id
                  ? "bg-indigo-50 border-indigo-200 text-amber-700"
                  : "bg-slate-50 border-slate-200 text-slate-500 hover:bg-slate-100"
                }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Materials Grid List ── */}
      {loading ? (
        <div className="py-20 text-center text-sm font-bold text-slate-400 flex flex-col items-center justify-center gap-3 bg-white border border-slate-100 rounded-2xl">
          <Loader2 className="h-7 w-7 text-amber-600 animate-spin" />
          <span>Loading study materials...</span>
        </div>
      ) : filteredMaterials.length === 0 ? (
        <div className="bg-white border border-dashed border-slate-200 rounded-2xl p-12 text-center space-y-4 shadow-xs">
          <div className="h-12 w-12 rounded-2xl bg-indigo-50 text-amber-600 flex items-center justify-center mx-auto border border-indigo-100">
            <BookOpen className="h-6 w-6" />
          </div>
          <div>
            <h3 className="text-sm font-black text-slate-800">No Study Materials Found</h3>
            <p className="text-xs text-slate-400 max-w-md mx-auto mt-1">
              {selectedUnit !== "all"
                ? `No materials found for Unit ${selectedUnit} in ${selectedSubject || "this filter"}. Click the button below to upload notes or PPTs.`
                : `You have not yet published any notes, PPTs, or question banks for ${selectedSubject || "this course"}.`}
            </p>
          </div>
          <button
            type="button"
            onClick={() => handleOpenUpload()}
            className="px-4 py-2 bg-zinc-900 hover:bg-zinc-800 text-white border border-white/10 rounded-xl text-xs font-black transition-all inline-flex items-center gap-2 shadow-xs cursor-pointer"
          >
            <Plus className="h-4 w-4" />
            Publish First Study Material
          </button>
        </div>
      ) : (() => {
        const totalMaterialsPages = Math.max(1, Math.ceil(filteredMaterials.length / materialsPageSize));
        const safeMaterialsPage = Math.min(Math.max(1, materialsPage), totalMaterialsPages);
        const paginatedMaterials = filteredMaterials.slice(
          (safeMaterialsPage - 1) * materialsPageSize,
          safeMaterialsPage * materialsPageSize
        );

        return (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {paginatedMaterials.map((mat) => {
                const isPPT = mat.material_type === "ppt" || mat.material_type === "slides";
                const isQuestionBank = mat.material_type === "question_bank" || mat.material_type === "assignment";
                const isVideo = mat.material_type === "video";
                const isSyllabus = mat.material_type === "syllabus";
                const formattedDate = mat.created_at ? parseDbDate(mat.created_at).toLocaleDateString() : "Active Semester";
                const targetUrl = mat.file_url || mat.external_url;

                return (
                  <div
                    key={mat.id}
                    className="bg-white border border-slate-100 rounded-2xl p-5 shadow-card hover:shadow-card-lg hover:border-amber-300 transition-all flex flex-col justify-between space-y-4 group"
                  >
                    <div className="space-y-3">
                      {/* Card Header Badges */}
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="px-2.5 py-1 rounded-xl bg-slate-900 text-white font-black text-[10px] uppercase tracking-wider shadow-2xs">
                            Unit {mat.unit_number}
                          </span>
                          <span
                            className={`px-2.5 py-1 rounded-xl text-[9.5px] font-black uppercase tracking-wider border ${isPPT
                                ? "bg-amber-50 text-amber-800 border-amber-200"
                                : isQuestionBank
                                  ? "bg-purple-50 text-purple-800 border-purple-200"
                                  : isVideo
                                    ? "bg-rose-50 text-rose-800 border-rose-200"
                                    : isSyllabus
                                      ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                                      : "bg-indigo-50 text-indigo-800 border-indigo-200"
                              }`}
                          >
                            {isPPT
                              ? "Slides (PPT)"
                              : isQuestionBank
                                ? "Question Bank / Task"
                                : isVideo
                                  ? "Video Lecture"
                                  : isSyllabus
                                    ? "Syllabus"
                                    : "Lecture Notes"}
                          </span>
                          {mat.class_group && (
                            <span className="px-2 py-0.5 rounded-lg bg-teal-50 text-teal-700 border border-teal-200 text-[9px] font-bold">
                              {mat.class_group}
                            </span>
                          )}
                        </div>

                        <ActionMenu
                          triggerVariant="icon"
                          items={[
                            {
                              label: "Edit Material",
                              icon: <Edit2 className="h-4 w-4" />,
                              onClick: () => handleOpenUpload(mat),
                            },
                            {
                              label: "Delete Material",
                              icon: <Trash2 className="h-4 w-4" />,
                              variant: "destructive",
                              onClick: () => handleDelete(mat.id),
                              disabled: deletingId === mat.id,
                            },
                          ]}
                        />
                      </div>

                      {/* Card Title & Subject */}
                      <div>
                        <h4 className="text-sm font-black text-slate-900 group-hover:text-amber-600 transition-colors leading-snug">
                          {mat.title}
                        </h4>
                        <span className="text-[10px] font-bold text-slate-400 block mt-0.5">
                          Subject: {mat.subject}
                        </span>
                      </div>

                      {/* Description */}
                      {mat.description && (
                        <p className="text-xs text-slate-500 font-medium line-clamp-2 leading-relaxed">
                          {mat.description}
                        </p>
                      )}
                    </div>

                    {/* Card Footer: Metadata & Actions */}
                    <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-3 text-[10.5px]">
                      <div className="text-slate-400 font-semibold truncate">
                        <span>Published: {formattedDate}</span>
                        {mat.file_size && <span className="ml-1 text-slate-500">• {mat.file_size}</span>}
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {targetUrl && (
                          <button
                            type="button"
                            onClick={() => setPreviewItem(mat)}
                            className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-bold flex items-center gap-1 transition-all cursor-pointer"
                            title="Preview details"
                          >
                            <Eye className="h-3 w-3" />
                            <span>Preview</span>
                          </button>
                        )}
                        {targetUrl ? (
                          <a
                            href={targetUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-amber-700 border border-indigo-200/80 rounded-lg font-black flex items-center gap-1.5 transition-all cursor-pointer shadow-2xs"
                          >
                            <span>Open Resource</span>
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        ) : (
                          <span className="text-[10px] text-slate-400 italic">No link attached</span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {filteredMaterials.length > 0 && (
              <div className="pt-2 border-t border-slate-100">
                <Pagination
                  currentPage={safeMaterialsPage}
                  totalItems={filteredMaterials.length}
                  pageSize={materialsPageSize}
                  onPageChange={setMaterialsPage}
                  onPageSizeChange={(newSize) => {
                    setMaterialsPageSize(newSize);
                    setMaterialsPage(1);
                  }}
                />
              </div>
            )}
          </div>
        );
      })()}

      {/* ── Publish / Edit Study Material Modal ── */}
      {showModal && (
        <Dialog
          open={showModal}
          onOpenChange={(next) => {
            if (!next) setShowModal(false);
          }}
          ariaLabel={editingItem ? "Edit study material" : "Publish study material"}
          overlayClassName="bg-slate-950/60 backdrop-blur-sm"
          panelClassName="max-w-lg rounded-2xl p-0 space-y-0 overflow-hidden flex flex-col max-h-[90vh] bg-white dark:bg-slate-900"
        >
          <form
            onSubmit={handleSubmit}
            className="w-full flex flex-col min-h-0 space-y-0"
          >
            {/* Modal Header */}
            <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-800/50 shrink-0">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 text-amber-600 flex items-center justify-center border border-indigo-100 dark:border-indigo-800">
                  <Book className="h-4.5 w-4.5" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-slate-900 dark:text-white leading-tight">
                    {editingItem ? "Edit Study Material" : "Publish New Study Material"}
                  </h3>
                  <p className="text-[10px] text-slate-400 font-semibold mt-0.5">
                    Materials published here will immediately appear in your students&apos; study portal.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowModal(false);
                  setEditingItem(null);
                }}
                className="text-slate-400 hover:text-slate-700 p-1.5 rounded-lg transition-colors cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Modal Form Body */}
            <div className="p-5 space-y-4 overflow-y-auto flex-1 text-xs">
              {/* Subject Field */}
              <div>
                <label className="font-bold text-slate-700 block mb-1">
                  Course Subject <span className="text-rose-500">*</span>
                </label>
                <select
                  value={formSubject}
                  onChange={(e) => setFormSubject(e.target.value)}
                  required
                  className="w-full p-2.5 rounded-xl border border-slate-200 bg-white font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                  aria-label="Course Subject"
                >
                  <option value="" disabled>Select Subject</option>
                  {displaySubjects.map((s: string) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>

              {/* Class Group / Target Cohort */}
              <div>
                <label className="font-bold text-slate-700 block mb-1">
                  Target Class / Cohort <span className="text-slate-400 font-normal">(Optional)</span>
                </label>
                <select
                  value={formClassGroup}
                  onChange={(e) => setFormClassGroup(e.target.value)}
                  className="w-full p-2.5 rounded-xl border border-slate-200 bg-white font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                  aria-label="Target Class / Cohort (Optional)"
                >
                  <option value="">All Students (General / Enrolled)</option>
                  {mentorClasses.map((cg: string) => (
                    <option key={cg} value={cg}>{cg}</option>
                  ))}
                </select>
              </div>

              {/* Unit Number & Material Type Row */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">
                    Curriculum Unit <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={formUnit}
                    onChange={(e) => setFormUnit(parseInt(e.target.value, 10) || 1)}
                    required
                    className="w-full p-2.5 rounded-xl border border-slate-200 bg-white font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                    aria-label="Curriculum Unit"
                  >
                    {[1, 2, 3, 4, 5].map(u => (
                      <option key={u} value={u}>Unit {u}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="font-bold text-slate-700 block mb-1">
                    Material Type <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={formType}
                    onChange={(e) => setFormType(e.target.value)}
                    required
                    className="w-full p-2.5 rounded-xl border border-slate-200 bg-white font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                    aria-label="Material Type"
                  >
                    <option value="notes">Lecture Notes (PDF / Doc)</option>
                    <option value="ppt">Presentation Slides (PPT / Canva)</option>
                    <option value="assignment">Question Bank / Assignment</option>
                    <option value="video">Recorded Video Lecture</option>
                    <option value="syllabus">Syllabus &amp; Blueprint</option>
                  </select>
                </div>
              </div>

              {/* Title Field */}
              <div>
                <label className="font-bold text-slate-700 block mb-1">
                  Material Title / Chapter Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Unit 2: Stack Applications & Expression Evaluation"
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  className="w-full p-2.5 rounded-xl border border-slate-200 bg-white font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 placeholder-slate-400"
                  aria-label="Material Title / Chapter Name"
                />
              </div>

              {/* Description / Summary Field */}
              <div>
                <label className="font-bold text-slate-700 block mb-1">
                  Description / Topic Highlights <span className="text-slate-400 font-normal">(Optional)</span>
                </label>
                <textarea
                  rows={2}
                  placeholder="Brief overview of the topics covered, recommended reading, or exam tips..."
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  className="w-full p-2.5 rounded-xl border border-slate-200 bg-white font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 placeholder-slate-400"
                  aria-label="Description / Topic Highlights (Optional)"
                />
              </div>

              {/* Resource URL / Cloud File Link */}
              <div>
                <label className="font-bold text-slate-700 block mb-1">
                  Resource Link / Document URL <span className="text-slate-400 font-normal">(Google Drive, OneDrive, GitHub, YouTube)</span>
                </label>
                <input
                  type="url"
                  placeholder="https://drive.google.com/file/d/..."
                  value={formFileUrl}
                  onChange={(e) => setFormFileUrl(e.target.value)}
                  className="w-full p-2.5 rounded-xl border border-slate-200 bg-white font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 placeholder-slate-400"
                  aria-label="Resource Link / Document URL (Google Drive, OneDrive, GitHub, YouTube)"
                />
              </div>

              {/* Format / File Size Label */}
              <div>
                <label className="font-bold text-slate-700 block mb-1">
                  Format / Size Badge <span className="text-slate-400 font-normal">(e.g. &quot;PDF • 2.4 MB&quot;, &quot;PPTX • 25 Slides&quot;)</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. PDF • 2.4 MB or 30-min Video"
                  value={formFileSize}
                  onChange={(e) => setFormFileSize(e.target.value)}
                  className="w-full p-2.5 rounded-xl border border-slate-200 bg-white font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 placeholder-slate-400"
                  aria-label="Format / Size Badge"
                />
              </div>
            </div>

            {/* Modal Footer Actions */}
            <div className="p-4 border-t border-slate-100 flex items-center justify-end gap-2.5 bg-slate-50 shrink-0">
              <button
                type="button"
                onClick={() => {
                  setShowModal(false);
                  setEditingItem(null);
                }}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-5 py-2 text-xs font-black text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl transition-all shadow-xs flex items-center gap-2 disabled:opacity-50 cursor-pointer"
              >
                {submitting ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    <span>Publishing...</span>
                  </>
                ) : (
                  <>
                    <Check className="h-3.5 w-3.5" />
                    <span>{editingItem ? "Save Changes" : "Publish Material"}</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </Dialog>
      )}

      {/* ── Document Preview Modal ── */}
      {previewItem && (
        <Dialog
          open={Boolean(previewItem)}
          onOpenChange={(next) => {
            if (!next) setPreviewItem(null);
          }}
          ariaLabel={previewItem ? `Preview ${previewItem.material_type || "study material"}` : "Document preview"}
          overlayClassName="bg-slate-950/60 backdrop-blur-sm"
          panelClassName="max-w-md rounded-2xl p-6 space-y-4 bg-white max-h-[90vh]"
        >
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-lg bg-slate-900 text-white font-black text-[10px] uppercase">
                Unit {previewItem.unit_number}
              </span>
              <span className="px-2 py-0.5 rounded-lg bg-amber-50 text-amber-800 font-black text-[10px] uppercase border border-indigo-200">
                {previewItem.material_type}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setPreviewItem(null)}
              className="p-1 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-800 transition-colors cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div>
            <h3 className="text-base font-black text-slate-900">{previewItem.title}</h3>
            <p className="text-xs text-slate-400 font-bold mt-0.5">Subject: {previewItem.subject}</p>
          </div>

          {previewItem.description && (
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 text-xs text-slate-600 font-medium">
              {previewItem.description}
            </div>
          )}

          <div className="text-[11px] text-slate-500 space-y-1">
            {previewItem.class_group && <div>Cohort: <strong>{previewItem.class_group}</strong></div>}
            {previewItem.file_size && <div>Format / Size: <strong>{previewItem.file_size}</strong></div>}
            <div>Uploaded By: <strong>{previewItem.uploaded_by || mentor.name}</strong></div>
          </div>

          <div className="flex gap-2.5 pt-2">
            <button
              type="button"
              onClick={() => setPreviewItem(null)}
              className="flex-1 py-2 text-xs font-bold text-slate-600 border border-slate-200 hover:bg-slate-50 rounded-xl transition-colors cursor-pointer"
            >
              Close
            </button>
            {(previewItem.file_url || previewItem.external_url) && (
              <a
                href={previewItem.file_url || previewItem.external_url}
                target="_blank"
                rel="noreferrer"
                className="flex-1 py-2 text-xs font-black text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl transition-all flex items-center justify-center gap-1.5 shadow-xs cursor-pointer"
              >
                <span>Open Resource</span>
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            )}
          </div>
        </Dialog>
      )}
    </div>
  );
};

export interface MentorDashboardProps {
  activeTab?: "home" | "timetable" | "handovers" | "attendance" | "exams" | "profile" | "tracker" | "academic_tracker" | "materials" | "demo_evaluations" | "more_menu" | "leave_requests" | "interviews" | "weekly_plan" | "my_skill_tracker";
  onTabChange?: (tab: "home" | "timetable" | "handovers" | "attendance" | "exams" | "profile" | "tracker" | "academic_tracker" | "materials" | "demo_evaluations" | "more_menu" | "leave_requests" | "interviews" | "weekly_plan" | "my_skill_tracker") => void;
}

export const MentorDashboard: React.FC<MentorDashboardProps> = ({
  activeTab: propActiveTab,
  onTabChange
}) => {
  const {
    slots,
    requests,
    approvedHandovers,
    mentors,
    currentMentor,
    timeSlots,
    weekDates,
    weekOffset,
    setWeekOffset,
    requestHandover,
    requestSwapCompensate,
    requestBooking,
    handleRequest,
    cancelRequest,
    currentShift,
    setCurrentShift,
    subjectsList,
    coursesList,
    students,
    studentAttendance,
    markAttendance,
    refreshData,
    holidays,
    leaveRequests,
    weeklyTasks,
    studentTracker,
    academicTracker,
    saveAcademicTrackerEntry,
    deleteAcademicTrackerEntry,
    assignWeeklyTask,
    gradeStudentTask,
    deleteWeeklyTask,
    weeklyAcademicTasks,
    studentAcademicTracker,
    assignWeeklyAcademicTask,
    gradeStudentAcademicTask,
    bulkUploadAcademicMarks,
    deleteWeeklyAcademicTask,
    demoSessions,
    demoSwapRequests,
    resolveDemoSwap,
    requestDemoSwap,
    rescheduleDemoSession,
    facultyLeaves,
    smeAvailability,
    colleges,
    isDataLoading,
    attendanceLockEnabled,
    systemSettings
  } = useApp();
  const { toast, confirm: showConfirm } = useToast();
  const queryClient = useQueryClient();

  const mentorCollegeId = currentMentor?.college_id || "";
  const dailyConfigsQuery = useQuery({
    queryKey: qk.dailyConfigs(mentorCollegeId || "all"),
    enabled: !!mentorCollegeId,
    queryFn: async () => {
      const data = await apiFetch(`/api/daily-configs?college_id=${encodeURIComponent(mentorCollegeId)}`);
      return data?.success && Array.isArray(data.configs) ? (data.configs as any[]) : [];
    },
  });
  const dailyConfigsList = dailyConfigsQuery.data || [];

  const mentorExamsQuery = useQuery({
    queryKey: qk.exams(mentorCollegeId || "all"),
    enabled: !!mentorCollegeId,
    queryFn: async () => {
      const data = await apiFetch(`/api/exams?college_id=${encodeURIComponent(mentorCollegeId)}`);
      return data?.success && Array.isArray(data.exams) ? (data.exams as any[]) : [];
    },
  });
  const mentorExamsList = mentorExamsQuery.data || [];

  useEffect(() => {
    const handleSync = () => {
      queryClient.invalidateQueries({ queryKey: ["exams"] });
      queryClient.invalidateQueries({ queryKey: ["daily-configs"] });
    };
    window.addEventListener("fp_exams_updated", handleSync);
    window.addEventListener("fp_schedule_updated", handleSync);
    return () => {
      window.removeEventListener("fp_exams_updated", handleSync);
      window.removeEventListener("fp_schedule_updated", handleSync);
    };
  }, [queryClient]);


  const handleRemindCm = async (dateStr: string, dateFormatted: string) => {
    if (!currentMentor?.college_id) {
      toast("College information missing.", "error");
      return;
    }
    const now = Date.now();
    const lastAt = lastRemindedCmAt[dateStr] || 0;
    if (now - lastAt < 60 * 1000) {
      const waitSec = Math.ceil((60 * 1000 - (now - lastAt)) / 1000);
      toast(`Already reminded recently. Wait ${waitSec}s before re-sending.`, "warning");
      return;
    }
    setIsRemindingCm(true);
    try {
      const res = await fetch("/api/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          college_id: currentMentor.college_id,
          remind_cm_for_date: dateStr,
          remind_by_name: currentMentor.name,
          remind_by_email: currentMentor.email,
          title: `Day Order Not Configured — ${dateFormatted}`,
          message: `${currentMentor.name || "A Mentor"} needs the Day Order / Day Type configured for ${dateFormatted} so they can mark attendance.`,
          link: `/cm/daily-configs?date=${dateStr}`,
          type: "reminder",
        }),
      });
      const data = await res.json();
      if (data.success) {
        toast(data.message || "Reminder sent to Campus Manager!", "success");
        setLastRemindedCmAt((prev) => ({ ...prev, [dateStr]: Date.now() }));
      } else {
        toast(data.message || "Failed to send reminder.", "error");
      }
    } catch (err: any) {
      toast("Network error while sending reminder.", "error");
    } finally {
      setIsRemindingCm(false);
    }
  };

  // Reset week offset on mount
  useEffect(() => {
    setWeekOffset(0);
  }, []);

  // Live Batch Coding Statistics (LeetCode & HackerRank) for Mentor's Students
  const mentorCodingStatsQuery = useQuery({
    queryKey: qk.codingStats(mentorCollegeId || "all"),
    enabled: !!mentorCollegeId,
    queryFn: async () => {
      const data = await apiFetch(`/api/coding-stats?collegeId=${encodeURIComponent(mentorCollegeId)}&batch=true`);
      return data?.success ? (data as any) : null;
    },
  });
  const mentorBatchCodingStats = mentorCodingStatsQuery.data ?? null;

  const getStudentCodingStats = useCallback((st: any) => {
    if (!mentorBatchCodingStats || !st) return { lc: null, hr: null };
    const reg = (st.register_number || st.roll_number || st.id || "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
    const em = (st.email || "").trim().toLowerCase();
    const lc = (reg && mentorBatchCodingStats.leetcodeByReg?.[reg]) || (em && mentorBatchCodingStats.leetcodeByEmail?.[em]) || null;
    const hr = (reg && mentorBatchCodingStats.hackerrankByReg?.[reg]) || (em && mentorBatchCodingStats.hackerrankByEmail?.[em]) || null;
    return { lc, hr };
  }, [mentorBatchCodingStats]);



  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isAttendanceStudioOpen, setIsAttendanceStudioOpen] = useState(false);
  const [attendanceFilterStatus, setAttendanceFilterStatus] = useState<"all" | "present" | "absent" | "od">("all");

  // ── Weekly Plan ↔ Attendance Verification ────────────────────────────
  // Approved weekly plans are fetched once per session for this mentor; when the
  // attendance studio opens for a period, the matching planned task (same date,
  // period, class & subject) is offered for soft confirmation. Writes one
  // academic_tracker provenance entry after attendance saves — never gates marking.
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [selectedCell, setSelectedCell] = useState<{
    day: string;
    dateStr: string;
    dateFormatted: string;
    time: string;
    slot?: Slot;
    type?: "own" | "covering" | "demo";
    originalMentorId?: string;
    handover?: ApprovedHandover;
  } | null>(null);

  const verificationPlansQuery = useQuery({
    queryKey: qk.weeklyPlanBasic(mentorCollegeId || "all", currentMentor?.id || "none"),
    enabled: isAttendanceStudioOpen && !!currentMentor?.id,
    queryFn: async () => {
      const q = `mentorId=${encodeURIComponent(currentMentor?.id || "")}${mentorCollegeId ? `&collegeId=${encodeURIComponent(mentorCollegeId)}` : ""}&includeAudit=false`;
      const data = await apiFetch(`/api/weekly-plan?${q}`);
      return data?.success && Array.isArray(data.plans) ? (data.plans as any[]) : [];
    },
  });
  const weeklyPlansForVerification = verificationPlansQuery.data || [];
  const weeklyPlansLoaded = verificationPlansQuery.isSuccess;
  const [planVerificationChoice, setPlanVerificationChoice] = useState<"as_planned" | "with_changes" | "not_conducted" | null>(null);
  const [planActualTopic, setPlanActualTopic] = useState("");
  const matchedPlannedTask = useMemo(() => {
    if (!selectedCell?.slot || !selectedCell?.dateStr) return null;
    if (!weeklyPlansLoaded || weeklyPlansForVerification.length === 0) return null;
    const slotCourse = selectedCell.slot.course || "";
    const slotClass = selectedCell.slot.classGroup || "";
    const slotTime = selectedCell.time;
    const normTime = (t: string) => (t || "").toLowerCase().replace(/\s+/g, "");
    for (const plan of weeklyPlansForVerification) {
      if (plan.status !== "Verified") continue;
      if (plan.subject && slotCourse &&
        plan.subject.toLowerCase().trim() !== slotCourse.toLowerCase().trim() &&
        !isSubjectNameMatch(slotCourse, plan.subject)) continue;
      if (plan.class_group && slotClass &&
        !isCohortMatching(plan.class_group, slotClass) && !isCohortMatching(slotClass, plan.class_group)) continue;
      let tasks: any[] = [];
      try {
        tasks = typeof plan.session_plan === "string" ? JSON.parse(plan.session_plan) : (plan.session_plan || []);
      } catch { tasks = []; }
      for (const t of tasks) {
        if (!t.topic || !String(t.topic).trim()) continue;
        const taskDate = t.date ? String(t.date).slice(0, 10) : "";
        const inRange = taskDate
          ? taskDate === selectedCell.dateStr
          : plan.start_date && plan.end_date
            ? (selectedCell.dateStr >= plan.start_date && selectedCell.dateStr <= plan.end_date)
            : false;
        if (!inRange) continue;
        const taskPeriod = String(t.periodSlot || "");
        const periodMatches = taskPeriod && (normTime(taskPeriod) === normTime(slotTime) || taskPeriod === selectedCell.slot?.time);
        if (!periodMatches) continue;
        return { plan, task: t };
      }
    }
    return null;
  }, [selectedCell, weeklyPlansForVerification, weeklyPlansLoaded]);


  // Handover & Attendance form state
  const [modalTab, setModalTab] = useState<"attendance" | "handover">("attendance");
  const [localAttendance, setLocalAttendance] = useState<Record<string, "present" | "absent" | "od" | "not_marked">>({});
  const [originalAttendance, setOriginalAttendance] = useState<Record<string, "present" | "absent" | "od" | "not_marked">>({});
  const [isSubmittingAttendance, setIsSubmittingAttendance] = useState(false);
  const [targetStaffId, setTargetStaffId] = useState<string>("");
  const [reasonText, setReasonText] = useState("");
  const [lateAttendanceReason, setLateAttendanceReason] = useState("");
  const [isSubmittingLateReq, setIsSubmittingLateReq] = useState(false);
  const [formError, setFormError] = useState("");
  const [isCamEditRequestModalOpen, setIsCamEditRequestModalOpen] = useState(false);
  const [camRequestReason, setCamRequestReason] = useState("");
  const [modalSemester, setModalSemester] = useState<string>("Semester 1");
  const [handoverSubject, setHandoverSubject] = useState<string>("original"); // "original" | "substitute_own" | "custom"
  const [selectedSubjName, setSelectedSubjName] = useState<string>("");
  const [customSubjName, setCustomSubjName] = useState<string>("");
  const [reviewingRequestId, setReviewingRequestId] = useState<string | null>(null);
  const [reviewReason, setReviewReason] = useState("");
  const [attendanceType, setAttendanceType] = useState<"Regular" | "Non-Regular">("Regular");
  const [attendanceMode, setAttendanceMode] = useState<"Online" | "Offline">("Offline");
  const [attendanceTypeSub, setAttendanceTypeSub] = useState<string>("Event");
  const [attendanceStep, setAttendanceStep] = useState<1 | 2 | 3>(1);
  const [isDayConfigSet, setIsDayConfigSet] = useState<boolean>(true);
  const [dayConfigDetails, setDayConfigDetails] = useState<any>(null);
  const [isRemindingCm, setIsRemindingCm] = useState<boolean>(false);
  const [lastRemindedCmAt, setLastRemindedCmAt] = useState<Record<string, number>>({});
  // Target Classes Filter State
  const [selectedClassFilter, setSelectedClassFilter] = useState<string | null>(null);

  // Agenda Widget Day State (defaults to current day during week, fallback to Monday on weekends)
  const [agendaDay, setAgendaDay] = useState<string>(() => {
    const dayIndex = new Date().getDay();
    if (dayIndex === 0 || dayIndex === 6) return "Monday";
    return ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][dayIndex];
  });

  // ── Swap-to-Compensate Modal State ─────────────────────────────────────────
  interface SwapTarget {
    otherMentorId: string;
    otherMentorName: string;
    subject: string;
    month: string;
    balance: number;
    compensatesHandoverId?: string;
  }
  const [swapModalOpen, setSwapModalOpen] = useState(false);
  const [swapTarget, setSwapTarget] = useState<SwapTarget | null>(null);
  const [swapOfferSlotId, setSwapOfferSlotId] = useState<string>("");
  const [swapOfferWeekDate, setSwapOfferWeekDate] = useState<string>(""); // YYYY-MM-DD
  const [swapReason, setSwapReason] = useState("");
  const [swapSubmitting, setSwapSubmitting] = useState(false);
  const [swapError, setSwapError] = useState("");
  const [swapGridWeekOffset, setSwapGridWeekOffset] = useState(0);
  const [swapSuccess, setSwapSuccess] = useState("");

  // Mentor Demo Swap state hooks
  const [demoSwapModalSession, setDemoSwapModalSession] = useState<any | null>(null);
  const [demoSwapReason, setDemoSwapReason] = useState<string>("I am unavailable");
  const [demoSwapRemarks, setDemoSwapRemarks] = useState<string>("");
  const [demoSwapStep, setDemoSwapStep] = useState<number>(1);
  const [selectedProposedPeer, setSelectedProposedPeer] = useState<any | null>(null);
  const [demoSwapSubmitting, setDemoSwapSubmitting] = useState<boolean>(false);
  const [resolvingDemoSwapId, setResolvingDemoSwapId] = useState<string | null>(null);
  const [resolvingHandoverReqId, setResolvingHandoverReqId] = useState<string | null>(null);
  const [deletingWeeklyTask, setDeletingWeeklyTask] = useState(false);
  const [deletingAcadWeeklyTask, setDeletingAcadWeeklyTask] = useState(false);

  // Mentor Trigger-Based Demo Reschedule State (No SME replacement, mentor sets date & slot)
  const [rescheduleModalSession, setRescheduleModalSession] = useState<any | null>(null);
  const [rescheduleTargetDate, setRescheduleTargetDate] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    if (d.getDay() === 0) d.setDate(d.getDate() + 1);
    return d.toISOString().split("T")[0];
  });
  const [rescheduleSelectedSlot, setRescheduleSelectedSlot] = useState<string>("");
  const [rescheduleSubmitting, setRescheduleSubmitting] = useState<boolean>(false);

  const handleOpenRescheduleModal = (session: any) => {
    setRescheduleModalSession(session);
    const d = new Date();
    d.setDate(d.getDate() + 1);
    if (d.getDay() === 0) d.setDate(d.getDate() + 1);
    setRescheduleTargetDate(d.toISOString().split("T")[0]);
    setRescheduleSelectedSlot("");
  };

  // ── Academic Tracker state hooks (Date-wise period topic/unit logging) ──────
  const [acadTrackerSubject, setAcadTrackerSubject] = useState<string>("");
  const [acadTrackerUnitFilter, setAcadTrackerUnitFilter] = useState<string>("all");
  const [acadTrackerSearch, setAcadTrackerSearch] = useState<string>("");
  const [acadTrackerStartDate, setAcadTrackerStartDate] = useState<string>(() => getInstitutionDateStrOffset(-7));
  const [acadTrackerEndDate, setAcadTrackerEndDate] = useState<string>(() => getLocalDateStr());
  const [showAcadLogModal, setShowAcadLogModal] = useState<boolean>(false);
  const [editingAcadEntry, setEditingAcadEntry] = useState<any | null>(null);
  const [acadFormDate, setAcadFormDate] = useState<string>(() => new Date().toISOString().split("T")[0]);
  const [acadFormPeriodSlot, setAcadFormPeriodSlot] = useState<string>("Period 1 (09:00 - 10:00 AM)");
  const [acadFormClassGroup, setAcadFormClassGroup] = useState<string>("");
  const [acadFormSubject, setAcadFormSubject] = useState<string>("");
  const [acadFormUnit, setAcadFormUnit] = useState<string>("Unit 1");
  const [acadFormTopic, setAcadFormTopic] = useState<string>("");
  const [acadFormComments, setAcadFormComments] = useState<string>("");
  const [acadFormStatus, setAcadFormStatus] = useState<string>("Conducted");
  const [isSavingAcadEntry, setIsSavingAcadEntry] = useState<boolean>(false);
  const [showAcadEditRequestModal, setShowAcadEditRequestModal] = useState<boolean>(false);
  const [targetAcadEditLog, setTargetAcadEditLog] = useState<any | null>(null);
  const [acadEditReason, setAcadEditReason] = useState<string>("");
  const [acadEditProposedTopic, setAcadEditProposedTopic] = useState<string>("");
  const [acadEditProposedComments, setAcadEditProposedComments] = useState<string>("");
  const [isSubmittingAcadEditReq, setIsSubmittingAcadEditReq] = useState<boolean>(false);

  // ── Weekly Academic Tracker Sub-view states ──────────────────────────────
  const [acadActiveSubTab, setAcadActiveSubTab] = useState<"ledger" | "weekly">("ledger");
  const [acadWeeklyDept, setAcadWeeklyDept] = useState<string>("");
  const [acadWeeklySem, setAcadWeeklySem] = useState<string>("");
  const [acadWeeklySubject, setAcadWeeklySubject] = useState<string>("");
  const [acadWeeklyWeek, setAcadWeeklyWeek] = useState<number>(1);
  const [acadWeeklySearch, setAcadWeeklySearch] = useState<string>("");
  const deferredAcadWeeklySearch = useDeferredValue(acadWeeklySearch);
  const [acadWeeklyStatusFilter, setAcadWeeklyStatusFilter] = useState<string>("all");
  const [acadWeeklyPage, setAcadWeeklyPage] = useState<number>(1);
  const [acadWeeklyPageSize, setAcadWeeklyPageSize] = useState<number>(25);
  const [acadTaskName, setAcadTaskName] = useState<string>("");
  const [acadTaskDate, setAcadTaskDate] = useState<string>(() => getLocalDateStr());
  const [acadTaskPdf, setAcadTaskPdf] = useState<string>("");
  const [acadIncludeQuiz, setAcadIncludeQuiz] = useState<boolean>(true);
  const [acadQuizUrl, setAcadQuizUrl] = useState<string>("");
  const [acadIncludeAssessment, setAcadIncludeAssessment] = useState<boolean>(true);
  const [acadAssessmentUrl, setAcadAssessmentUrl] = useState<string>("");
  const [acadIncludeAssignment, setAcadIncludeAssignment] = useState<boolean>(true);
  const [acadAssignmentUrl, setAcadAssignmentUrl] = useState<string>("");
  const [isEditingAcadTask, setIsEditingAcadTask] = useState<boolean>(false);
  const [isUploadingAcadExcel, setIsUploadingAcadExcel] = useState<boolean>(false);
  const [acadSaveStatusMap, setAcadSaveStatusMap] = useState<{ [key: string]: "idle" | "saving" | "saved" | "error" }>({});

  // Find peer mentors within same college/subject free at this slot
  const getInternalSwapRecommendations = (demo: any) => {
    if (!demo || !currentMentor) return [];

    const subjectGroup = demo.subject;

    const uniqueSlots = new Set<string>();
    slots.forEach(s => {
      if (s.time) uniqueSlots.add(s.time.trim());
    });
    const parseTimeToMinutes = (t: string) => {
      const match = t.match(/^(\d+)(?:\.(\d+))?\s*(AM|PM)/i);
      if (!match) return 9999;
      let hr = parseInt(match[1]);
      const min = match[2] ? parseInt(match[2]) : 0;
      const isPm = match[3].toUpperCase() === "PM";
      if (isPm && hr < 12) hr += 12;
      if (!isPm && hr === 12) hr = 0;
      return hr * 60 + min;
    };
    const derivedTimeSlots = Array.from(uniqueSlots).sort((a, b) => parseTimeToMinutes(a) - parseTimeToMinutes(b));

    const peerMentors = mentors.filter(m =>
      m.college_id === currentMentor.college_id &&
      m.id !== currentMentor.id &&
      m.mentor_group?.toLowerCase().trim() === subjectGroup.toLowerCase().trim()
    );

    const candidates: any[] = [];
    peerMentors.forEach(m => {
      const isOnLeave = leaveRequests?.some((l: any) => l.mentorId === m.id && l.dateStr === demo.dateStr && l.status === "approved");
      if (isOnLeave) return;

      const dayName = weekDates.find(w => w.dateStr === demo.dateStr)?.day || "";
      const hasClass = slots.some(s => s.mentorId === m.id && s.day === dayName && s.time === demo.timeSlot);
      if (hasClass) return;

      const hasDemo = demoSessions.some(ds => ds.mentorId === m.id && ds.dateStr === demo.dateStr && ds.timeSlot === demo.timeSlot);
      if (hasDemo) return;

      const dailyLoad = demoSessions.filter(ds => ds.mentorId === m.id && ds.dateStr === demo.dateStr).length;
      if (dailyLoad >= 2) return;

      const idx = derivedTimeSlots.indexOf(demo.timeSlot);
      let consecutiveClash = false;
      if (idx !== -1) {
        const prevSlot = idx > 0 ? derivedTimeSlots[idx - 1] : "";
        const nextSlot = idx < derivedTimeSlots.length - 1 ? derivedTimeSlots[idx + 1] : "";
        const hasPrev = prevSlot && demoSessions.some(ds => ds.mentorId === m.id && ds.dateStr === demo.dateStr && ds.timeSlot === prevSlot);
        const hasNext = nextSlot && demoSessions.some(ds => ds.mentorId === m.id && ds.dateStr === demo.dateStr && ds.timeSlot === nextSlot);
        if (hasPrev || hasNext) consecutiveClash = true;
      }
      if (consecutiveClash) return;

      const weeklyLoad = demoSessions.filter(ds => ds.mentorId === m.id).length;

      candidates.push({
        mentorId: m.id,
        mentorName: m.name,
        subjectGroup: m.mentor_group || "General",
        weeklyCount: weeklyLoad,
        score: 100 - (weeklyLoad * 5)
      });
    });

    return candidates.sort((a, b) => b.score - a.score);
  };

  const handleSubmitInternalSwap = async () => {
    if (!demoSwapModalSession || !selectedProposedPeer) return;

    setDemoSwapSubmitting(true);

    const payload = {
      sessionId: demoSwapModalSession.id,
      mentorId: demoSwapModalSession.mentorId,
      mentorName: demoSwapModalSession.mentorName,
      smeId: demoSwapModalSession.smeId,
      smeName: demoSwapModalSession.smeName,
      dateStr: demoSwapModalSession.dateStr,
      timeSlot: demoSwapModalSession.timeSlot,
      subject: demoSwapModalSession.subject,
      stream: demoSwapModalSession.stream,
      reason: demoSwapReason,
      remarks: demoSwapRemarks,
      swapType: "internal",
      proposedMentorId: selectedProposedPeer.mentorId,
      proposedMentorName: selectedProposedPeer.mentorName,
      proposedSmeId: demoSwapModalSession.smeId,
      proposedSmeName: demoSwapModalSession.smeName,
      proposedDateStr: demoSwapModalSession.dateStr,
      proposedTimeSlot: demoSwapModalSession.timeSlot
    };

    try {
      const res = await requestDemoSwap(payload);
      if (res.success) {
        toast("Internal swap request submitted to peer mentor successfully!", "success");
        setDemoSwapModalSession(null);
      } else {
        toast(res.message, "error");
      }
    } catch (e: any) {
      toast("An unexpected error occurred while requesting swap.", "error");
    } finally {
      setDemoSwapSubmitting(false);
    }
  };

  // Timetable Status Filter State
  const [selectedStatusFilter, setSelectedStatusFilter] = useState<"active" | "pending" | "handover" | null>(null);

  // Timetable Location Filter State
  const [selectedLocationFilter, setSelectedLocationFilter] = useState<string | null>(null);

  // Active Dashboard Tab State
  const [localActiveTab, setLocalActiveTab] = useState<"home" | "timetable" | "handovers" | "attendance" | "exams" | "profile" | "tracker" | "academic_tracker" | "materials" | "demo_evaluations" | "more_menu" | "leave_requests" | "interviews" | "weekly_plan" | "my_skill_tracker">("home");

  const mentorTabAliases: Record<string, typeof localActiveTab> = {
    "dashboard": "home",
    "schedule": "timetable",
    "timetable": "timetable",
    "leaves": "handovers",
    "leave-approvals": "handovers",
    "requests": "handovers",
    "handovers": "handovers",
    "marks": "exams",
    "exams": "exams",
    "attendance": "attendance",
    "tracker": "tracker",
    "tasks": "tracker",
    "submissions": "tracker",
    "interviews": "interviews",
    "interview": "interviews",
    "weekly-plan": "weekly_plan",
    "weekly_plan": "weekly_plan",
    "skill-tracker": "my_skill_tracker",
    "my_skill_tracker": "my_skill_tracker",
    "profile": "profile",
    "academic-tracker": "academic_tracker",
    "academic_tracker": "academic_tracker",
    "leave_requests": "handovers",
    "leave": "handovers"
  };
  const MENTOR_TAB_IDS = ["home", "timetable", "handovers", "attendance", "exams", "profile", "tracker", "academic_tracker", "materials", "demo_evaluations", "more_menu", "leave_requests", "interviews", "weekly_plan", "my_skill_tracker"];
  // Unknown slugs (e.g. a stale notification link stored in the DB) fall back to the
  // default tab instead of rendering an empty workspace.
  const resolvedPropTab = (() => {
    if (!propActiveTab) return undefined;
    const mapped: string = mentorTabAliases[propActiveTab] || propActiveTab;
    return MENTOR_TAB_IDS.includes(mapped) ? mapped : undefined;
  })();
  const activeTab = (resolvedPropTab || localActiveTab) as typeof localActiveTab;

  // useTransition: marks tab switches as non-urgent so the current UI stays
  // responsive while React prepares the new tab content in the background.
  const [isTabPending, startTabTransition] = useTransition();

  const handleTabChange = useCallback((tab: typeof localActiveTab) => {
    startTabTransition(() => {
      if (onTabChange) onTabChange(tab);
      else setLocalActiveTab(tab);
    });
  }, [onTabChange]);

  const setActiveTab = handleTabChange;

  const [highlightedDate, setHighlightedDate] = useState<string | null>(null);

  // Handle notification jumps, search queries, and dynamic class/tab switching
  useEffect(() => {
    const handleNavigation = (targetUrl?: string, targetDate?: string, tabHint?: string) => {
      let urlStr = targetUrl || (typeof window !== "undefined" ? window.location.search : "");
      let dateParam = targetDate;
      let tabParam = tabHint;

      if (!dateParam && typeof window !== "undefined") {
        const params = new URLSearchParams(window.location.search);
        dateParam = params.get("date") || undefined;
        if (!tabParam) tabParam = params.get("tab") || undefined;
      }

      if (dateParam) {
        const offset = calculateWeekOffsetForDate(dateParam);
        setWeekOffset(offset);
        setHighlightedDate(dateParam);
        setActiveTab("timetable");

        setTimeout(() => {
          setHighlightedDate(null);
        }, 6000);
      } else if (tabParam) {
        const normalized = tabParam === "schedule" ? "timetable" : tabParam === "leaves" ? "handovers" : tabParam === "marks" ? "exams" : tabParam;
        if (["home", "timetable", "handovers", "attendance", "exams", "profile", "tracker", "academic_tracker", "demo_evaluations", "more_menu", "leave_requests", "interviews", "weekly_plan", "my_skill_tracker"].includes(normalized)) {
          setActiveTab(normalized as any);
        }
      }
    };

    // 1. Check intent stored from notification click
    if (typeof window !== "undefined") {
      try {
        const stored = sessionStorage.getItem("fp_notif_target");
        if (stored) {
          const parsed = JSON.parse(stored);
          if (Date.now() - (parsed.timestamp || 0) < 30000) {
            handleNavigation(parsed.url, parsed.date);
          }
          sessionStorage.removeItem("fp_notif_target");
        } else {
          handleNavigation();
        }
      } catch (_) {
        handleNavigation();
      }
    }

    // 2. Global event listener for instant reactive navigation while on this page
    const onNavEvent = (e: any) => {
      if (e?.detail) {
        handleNavigation(e.detail.url, e.detail.date);
      }
    };
    window.addEventListener("fp_navigate_target", onNavEvent);
    return () => window.removeEventListener("fp_navigate_target", onNavEvent);
  }, [setActiveTab, setWeekOffset]);

  const [isCollapsed, setIsCollapsed] = useState(false);
  useEffect(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("fp_sidebar_collapsed") === "true";
      setIsCollapsed(stored);
    }
  }, []);

  // Interviews assigned to this mentor (cached; loaded only for tracker/demo tabs)
  const mentorInterviewsQuery = useQuery({
    queryKey: qk.interviewList(`mentor-dashboard|${currentMentor?.id || "none"}`),
    enabled: !!currentMentor?.id && (activeTab === "tracker" || activeTab === "demo_evaluations"),
    queryFn: async () => {
      const data = await apiFetch(`/api/interviews?role=mentor&mentorId=${encodeURIComponent(currentMentor?.id || "")}`);
      return data?.success && Array.isArray(data.interviews) ? (data.interviews as any[]) : [];
    },
  });
  const mentorInterviews = mentorInterviewsQuery.data || [];

  // Student Tracker filter and management states
  const [trackerSubView, setTrackerSubView] = useState<"tracker" | "interviews">("tracker");
  const mentorClasses = useMemo(() => {
    let rawItems: string[] = [];
    if (currentMentor?.classes) {
      rawItems = currentMentor.classes.split(/,|\n/).map((c: string) => c.trim()).filter(Boolean);
    }

    // Fallback 1: Check slots assigned to this mentor
    if (rawItems.length === 0 && currentMentor?.id) {
      const slotClasses = slots
        .filter(s => s.mentorId === currentMentor.id)
        .map(s => s.classGroup)
        .filter((cg): cg is string => Boolean(cg));
      rawItems = Array.from(new Set(slotClasses));
    }

    // Fallback 2: Check active student class groups in students table
    if (rawItems.length === 0 && students.length > 0) {
      const deptLower = currentMentor?.mentor_group ? currentMentor.mentor_group.toLowerCase().trim() : "";
      const studentClasses = students
        .filter(s => {
          if (!s.classGroup) return false;
          if (s.college_id && currentMentor?.college_id && s.college_id !== currentMentor.college_id) return false;
          if (!deptLower) return true;
          const sDept = (s.department || "").toLowerCase().trim();
          const sCg = s.classGroup.toLowerCase();
          return sDept.includes(deptLower) || deptLower.includes(sDept) || sCg.includes(deptLower) || deptLower.includes(sCg);
        })
        .map(s => s.classGroup)
        .filter((cg): cg is string => Boolean(cg));

      if (studentClasses.length > 0) {
        rawItems = Array.from(new Set(studentClasses));
      }
    }

    // Fallback 3: Check courses/departments in campus matching mentor's department
    if (rawItems.length === 0 && currentMentor?.mentor_group) {
      const deptLower = currentMentor.mentor_group.toLowerCase().trim();
      const matchingCourses = coursesList
        .filter(c => c.college_id === currentMentor.college_id || !c.college_id)
        .filter(c => c.name.toLowerCase().includes(deptLower) || deptLower.includes(c.name.toLowerCase()));

      const deptNames = matchingCourses.length > 0 ? matchingCourses.map(c => c.name) : [currentMentor.mentor_group];
      const sems = DEFAULT_SEMESTERS;
      const shifts = ["Shift 1", "Shift 2"];

      deptNames.forEach(d => {
        shifts.forEach(sh => {
          sems.forEach(sem => {
            rawItems.push(`${d} - ${sh} - ${sem}`);
          });
        });
      });
    }

    const seenSignatures = new Set<string>();
    const cleaned: string[] = [];

    // Sort by length descending to prioritize most specific, full canonical names
    const sortedItems = [...rawItems].sort((a, b) => b.length - a.length);

    for (const item of sortedItems) {
      const lower = item.toLowerCase();
      const semMatch = lower.match(/sem(?:ester)?\s*([0-9ivx]+)/i);
      const semKey = semMatch ? semMatch[1] : "";
      const shiftKey = lower.includes("shift 1") || lower.includes("shift_1") ? "s1" : lower.includes("shift 2") || lower.includes("shift_2") ? "s2" : "";
      const deptKey = lower.includes("cs") || lower.includes("computer") ? "cs" : lower.includes("ds") || lower.includes("data") ? "ds" : lower.includes("it") ? "it" : lower.includes("com") ? "com" : lower.slice(0, 10);

      const sig = `${deptKey}_${shiftKey}_${semKey}`;
      if (!seenSignatures.has(sig)) {
        seenSignatures.add(sig);
        cleaned.push(item);
      }
    }
    return cleaned;
  }, [currentMentor, slots, coursesList]);

  const mentorSubjects = useMemo(() => {
    let rawSubjects: string[] = [];
    if (currentMentor?.subjects) {
      rawSubjects = currentMentor.subjects.split(/,|\n/).map((s: string) => s.trim()).filter(Boolean);
    }

    // Fallback 1: Check slots assigned to this mentor
    if (rawSubjects.length === 0 && currentMentor?.id) {
      const slotSubjs = slots
        .filter(s => s.mentorId === currentMentor.id)
        .map(s => s.course)
        .filter(Boolean);
      rawSubjects = Array.from(new Set(slotSubjs));
    }

    // Fallback 2: Check subjects matching mentor's department in subjectsList
    if (rawSubjects.length === 0 && currentMentor?.mentor_group) {
      const deptLower = currentMentor.mentor_group.toLowerCase().trim();
      const deptSubjs = subjectsList
        .filter(s => (s.college_id === currentMentor.college_id || !s.college_id) &&
          s.mentor_group && (s.mentor_group.toLowerCase().includes(deptLower) || deptLower.includes(s.mentor_group.toLowerCase())))
        .map(s => s.name);
      rawSubjects = Array.from(new Set(deptSubjs));
    }

    return Array.from(new Set(rawSubjects));
  }, [currentMentor, slots, subjectsList]);

  const [trackerDept, setTrackerDept] = useState<string>("");
  const [trackerSem, setTrackerSem] = useState<string>("");
  const [trackerClassGroup, setTrackerClassGroup] = useState<string>("");
  const [trackerSubject, setTrackerSubject] = useState<string>("");
  const [trackerWeek, setTrackerWeek] = useState<number>(1);
  const [trackerTaskName, setTrackerTaskName] = useState("");
  const [trackerUploadType, setTrackerUploadType] = useState<"url" | "file">("url");
  const [trackerTaskPdf, setTrackerTaskPdf] = useState("");
  const [editingTask, setEditingTask] = useState(false);
  const [trackerSearchTerm, setTrackerSearchTerm] = useState("");
  const deferredTrackerSearch = useDeferredValue(trackerSearchTerm);
  const [trackerStatusFilter, setTrackerStatusFilter] = useState("all");
  const [trackerPage, setTrackerPage] = useState<number>(1);
  const [trackerPageSize, setTrackerPageSize] = useState<number>(10);
  const [saveStatusMap, setSaveStatusMap] = useState<Record<string, "idle" | "saving" | "saved" | "error">>({});
  const [skillMarksDraft, setSkillMarksDraft] = useState<Record<string, string>>({});
  const [isSavingAllSkillMarks, setIsSavingAllSkillMarks] = useState(false);
  const [acadMarksDraft, setAcadMarksDraft] = useState<Record<string, { quiz?: string; assessment?: string; assignment?: string; feedback?: string }>>({});
  const [isSavingAllAcadMarks, setIsSavingAllAcadMarks] = useState(false);

  useEffect(() => {
    setTrackerPage(1);
  }, [trackerSearchTerm, trackerStatusFilter, trackerClassGroup, trackerSubject, trackerWeek]);

  const filteredMentorSubjects = useMemo(() => {
    if (!trackerClassGroup) return mentorSubjects;

    // 1. Check slots for this mentor in this exact classGroup
    if (currentMentor?.id) {
      const slotSubjs = slots
        .filter(s => s.mentorId === currentMentor.id && s.classGroup === trackerClassGroup)
        .map(s => s.course)
        .filter(Boolean);
      const uniqueSlotSubjs = Array.from(new Set(slotSubjs));
      if (uniqueSlotSubjs.length > 0) return uniqueSlotSubjs;
    }

    // 2. Filter mentorSubjects by semester of trackerClassGroup
    const semMatch = trackerClassGroup.toLowerCase().match(/sem(?:ester)?\s*([0-9ivx]+)/i);
    const semNum = semMatch ? semMatch[1] : "";

    if (semNum) {
      const matchedBySem = mentorSubjects.filter(subName => {
        const subObj = subjectsList.find(s => s.name.toLowerCase() === subName.toLowerCase());
        if (!subObj || !subObj.semester) return true;
        const subSemMatch = subObj.semester.toLowerCase().match(/sem(?:ester)?\s*([0-9ivx]+)/i);
        const subSemNum = subSemMatch ? subSemMatch[1] : "";
        return !subSemNum || subSemNum === semNum;
      });
      if (matchedBySem.length > 0) return matchedBySem;
    }

    return mentorSubjects;
  }, [trackerClassGroup, currentMentor, slots, mentorSubjects, subjectsList]);

  // Keep trackerSubject in sync whenever trackerClassGroup changes
  useEffect(() => {
    if (filteredMentorSubjects.length > 0 && !filteredMentorSubjects.includes(trackerSubject)) {
      setTrackerSubject(filteredMentorSubjects[0]);
    }
  }, [trackerClassGroup, filteredMentorSubjects, trackerSubject]);

  useEffect(() => {
    if (mentorClasses.length > 0 && !trackerClassGroup) {
      setTrackerClassGroup(mentorClasses[0]);
    }
    if (filteredMentorSubjects.length > 0 && !trackerSubject) {
      setTrackerSubject(filteredMentorSubjects[0]);
    }
  }, [currentMentor, mentorClasses, filteredMentorSubjects, trackerClassGroup, trackerSubject]);

  // Attendance Search and Range Select States
  const [attendanceSearchTerm, setAttendanceSearchTerm] = useState("");
  const deferredAttendanceSearch = useDeferredValue(attendanceSearchTerm);
  const [attendanceHistorySearch, setAttendanceHistorySearch] = useState("");
  const deferredAttendanceHistorySearch = useDeferredValue(attendanceHistorySearch);

  // Attendance calendar view state
  const [attCalendarMonth, setAttCalendarMonth] = useState<string>(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
  const [attCalendarClassFilter, setAttCalendarClassFilter] = useState<string>("all");

  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
  const [lastCheckedId, setLastCheckedId] = useState<string | null>(null);
  const [isRangeOpen, setIsRangeOpen] = useState(false);
  const [rangeStartId, setRangeStartId] = useState("");
  const [rangeEndId, setRangeEndId] = useState("");



  // High-performance O(1) caches for class group & course resolution
  const classGroupParsedCache = useRef(new Map<string, { name: string; sem: string }>());
  const courseMatchCache = useRef(new Map<string, any>());
  const classGroupMatchCache = useRef(new Map<string, boolean>());

  // Helper to parse class group name and semester (O(1) memoized)
  const parseClassGroup = (classGroup?: string) => {
    if (!classGroup) return { name: "General Class", sem: "" };
    const cached = classGroupParsedCache.current.get(classGroup);
    if (cached) return cached;
    const { department, semester } = resolveClassGroupDetailsFromState(classGroup, subjectsList, coursesList);
    const num = parseInt(semester.replace(/[^0-9]/g, ""), 10);
    const roman = ["", "I", "II", "III", "IV", "V", "VI", "VII", "VIII"][num] || "";
    const semDisplay = roman ? `SEM ${roman}` : semester;
    const res = { name: department, sem: semDisplay };
    classGroupParsedCache.current.set(classGroup, res);
    return res;
  };

  // Helper to dynamically match class group to DB course (O(1) memoized)
  const findCourseForClassGroup = (classGroup?: string) => {
    if (!classGroup) return null;
    if (courseMatchCache.current.has(classGroup)) {
      return courseMatchCache.current.get(classGroup);
    }
    const cgLower = classGroup.toLowerCase().trim();
    for (const course of coursesList) {
      const courseNameLower = course.name.toLowerCase().trim();
      const courseCodeLower = (course.code || "").toLowerCase().trim();
      if (cgLower.includes(courseNameLower) || (courseCodeLower && cgLower.includes(courseCodeLower))) {
        courseMatchCache.current.set(classGroup, course);
        return course;
      }
    }
    courseMatchCache.current.set(classGroup, null);
    return null;
  };

  // Helper to get short class group name and semester
  const getShortClassGroup = (classGroup?: string) => {
    if (!classGroup) return { name: "General Class", sem: "" };

    const { name, sem } = parseClassGroup(classGroup);
    const course = findCourseForClassGroup(classGroup);
    let dept = course ? course.name : name;

    const c = classGroup.toLowerCase();
    if (c.includes("shift 1") || c.includes("shift-1") || c.includes("s1")) {
      dept += " (S1)";
    } else if (c.includes("shift 2") || c.includes("shift-2") || c.includes("s2")) {
      dept += " (S2)";
    }

    return { name: dept, sem };
  };

  // Helper to get semester name from a class string (for the buttons)
  const getSemForClass = (cls?: string) => {
    if (!cls) return "";
    const { semester } = resolveClassGroupDetailsFromState(cls, subjectsList, coursesList);
    const num = parseInt(semester.replace(/[^0-9]/g, ""), 10);
    const roman = ["", "I", "II", "III", "IV", "V", "VI", "VII", "VIII"][num] || "";
    return roman ? `Sem ${roman}` : semester;
  };

  // Helper to match class group names with normalized comparison (O(1) memoized)
  const isClassGroupMatch = (cg1?: string, cg2?: string) => {
    if (!cg1 || !cg2) return false;

    const clean1 = cg1.toLowerCase().trim();
    const clean2 = cg2.toLowerCase().trim();

    if (clean1 === clean2) return true;

    const cacheKey = `${clean1}___${clean2}`;
    if (classGroupMatchCache.current.has(cacheKey)) {
      return classGroupMatchCache.current.get(cacheKey)!;
    }

    const norm1 = clean1.replace(/[^a-z0-9]/g, "");
    const norm2 = clean2.replace(/[^a-z0-9]/g, "");

    if (norm1 === norm2 || (norm1.length > 5 && norm2.length > 5 && (norm1.includes(norm2) || norm2.includes(norm1)))) {
      classGroupMatchCache.current.set(cacheKey, true);
      return true;
    }

    const course1 = findCourseForClassGroup(cg1);
    const course2 = findCourseForClassGroup(cg2);

    const s1 = getSemForClass(cg1);
    const s2 = getSemForClass(cg2);

    if (course1 && course2 && course1.id === course2.id) {
      if (!s1 || !s2 || s1.toLowerCase() === s2.toLowerCase()) {
        classGroupMatchCache.current.set(cacheKey, true);
        return true;
      }
    }

    const { name: name1 } = getShortClassGroup(cg1);
    const { name: name2 } = getShortClassGroup(cg2);
    if (name1 && name2 && (name1.toLowerCase() === name2.toLowerCase() || isCohortMatching(cg1, cg2))) {
      if (!s1 || !s2 || s1.toLowerCase() === s2.toLowerCase()) {
        classGroupMatchCache.current.set(cacheKey, true);
        return true;
      }
    }

    const res = isCohortMatching(cg1, cg2);
    classGroupMatchCache.current.set(cacheKey, res);
    return res;
  };

  const getShortSemLabel = (semStr: string): string => {
    if (!semStr) return "";
    const s = semStr.toLowerCase();
    if (s.includes("vi") || s.includes("6")) return "Sem VI";
    if (s.includes("iv") || s.includes("4")) return "Sem IV";
    if (s.includes("v") || s.includes("5")) return "Sem V";
    if (s.includes("iii") || s.includes("3")) return "Sem III";
    if (s.includes("ii") || s.includes("2")) return "Sem II";
    if (s.includes("i") || s.includes("1")) return "Sem I";
    return semStr;
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

    // 2. Check by cohort year in parentheses (dynamic calculation)
    const batchMatch = cg.match(/(20\d{2})\s*[-–]\s*(20\d{2})/);
    if (batchMatch) {
      const batchStart = parseInt(batchMatch[1], 10);
      const batchEnd = parseInt(batchMatch[2], 10);
      const now = new Date();
      const academicYear = now.getMonth() >= 5 ? now.getFullYear() : now.getFullYear() - 1;
      const yearLabels = ["1st Year", "2nd Year", "3rd Year", "4th Year"];
      const maxYear = Math.max(1, batchEnd - batchStart);
      const yearOfStudy = academicYear - batchStart + 1;
      return yearLabels[Math.min(Math.max(yearOfStudy, 1), maxYear) - 1] ?? "";
    }

    // 3. Fallback to explicit year strings and Roman numeral prefixes (e.g. III BCA, II BCA)
    if (cg.includes("3rd year") || cg.includes("3rdyr") || cg.includes("3rd yr") || cg.includes("3nd year") || cg.includes("3ndyr") || cg.startsWith("iii ") || cg.startsWith("iii-") || cg.includes(" iii ") || cg.endsWith(" iii")) return "3rd Year";
    if (cg.includes("2nd year") || cg.includes("2ndyr") || cg.includes("2nd yr") || cg.startsWith("ii ") || cg.startsWith("ii-") || cg.includes(" ii ") || cg.endsWith(" ii")) return "2nd Year";
    if (cg.includes("1st year") || cg.includes("1styr") || cg.includes("1st yr") || cg.includes("1nd year") || cg.includes("1ndyr") || cg.startsWith("i ") || cg.startsWith("i-") || cg.includes(" i ") || cg.endsWith(" i")) return "1st Year";
    if (cg.includes("4th year") || cg.includes("4thyr") || cg.includes("4th yr") || cg.startsWith("iv ") || cg.startsWith("iv-") || cg.includes(" iv ") || cg.endsWith(" iv")) return "4th Year";

    return "";
  };

  const getClassGroupLabel = (classGroup?: string) => {
    if (!classGroup) return "";
    const { name: shortDept, sem: shortSem } = getShortClassGroup(classGroup);
    const yearStr = getYearForClass(classGroup);
    const calculatedSem = shortSem || getSemForClass(classGroup);
    return `${shortDept}${yearStr ? ` ${yearStr}` : ""}${calculatedSem ? ` (${calculatedSem})` : ""}`;
  };

  // Parse the START time from a slot time string (e.g. "8.20 AM - 9.10 AM", "9.00 A.M to 10.00 A.M")
  const parseSlotStartTime = (timeStr: string): Date | null => {
    const match = timeStr.match(/(\d{1,2})[.:]\s*(\d{2})\s*(A\.?M\.?|P\.?M\.?)/i);
    if (!match) return null;
    let hours = parseInt(match[1], 10);
    const minutes = parseInt(match[2], 10);
    const period = match[3].replace(/\./g, "").toUpperCase();
    if (period === "PM" && hours !== 12) hours += 12;
    if (period === "AM" && hours === 12) hours = 0;
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate(), hours, minutes, 0);
  };

  const parseSlotStartTimeForDate = (timeStr: string, dateStr: string): Date | null => {
    const match = timeStr.match(/(\d{1,2})[.:]\s*(\d{2})\s*(A\.?M\.?|P\.?M\.?)/i);
    if (!match) return null;
    let hours = parseInt(match[1], 10);
    const minutes = parseInt(match[2], 10);
    const period = match[3].replace(/\./g, "").toUpperCase();
    if (period === "PM" && hours !== 12) hours += 12;
    if (period === "AM" && hours === 12) hours = 0;

    let year = new Date().getFullYear();
    let month = new Date().getMonth();
    let day = new Date().getDate();

    if (dateStr.includes("-")) {
      const parts = dateStr.split("-");
      if (parts.length === 3) {
        year = parseInt(parts[0], 10);
        month = parseInt(parts[1], 10) - 1;
        day = parseInt(parts[2], 10);
      }
    } else {
      const parts = dateStr.split(" ");
      if (parts.length >= 2) {
        day = parseInt(parts[0], 10);
        const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        const mName = parts[1].substring(0, 3);
        const mIdx = monthNames.findIndex(m => m.toLowerCase() === mName.toLowerCase());
        if (mIdx !== -1) month = mIdx;
        if (parts.length >= 3) year = parseInt(parts[2], 10);
      }
    }

    return new Date(year, month, day, hours, minutes, 0);
  };

  const parseSlotEndTimeForDate = (timeStr: string, dateStr: string): Date | null => {
    const regex = /(\d{1,2})[.:]\s*(\d{2})\s*(A\.?M\.?|P\.?M\.?)?/gi;
    const matches = Array.from(timeStr.matchAll(regex));
    if (!matches || matches.length === 0) return null;

    const targetMatch = matches.length >= 2 ? matches[1] : matches[0];
    let hours = parseInt(targetMatch[1], 10);
    const minutes = parseInt(targetMatch[2], 10);
    const periodStr = targetMatch[3] || (matches.length >= 2 && matches[0][3] ? matches[0][3] : "");
    const period = periodStr ? periodStr.replace(/\./g, "").toUpperCase() : "";
    if (period === "PM" && hours !== 12) hours += 12;
    if (period === "AM" && hours === 12) hours = 0;

    let year = new Date().getFullYear();
    let month = new Date().getMonth();
    let day = new Date().getDate();

    if (dateStr.includes("-")) {
      const parts = dateStr.split("-");
      if (parts.length === 3) {
        year = parseInt(parts[0], 10);
        month = parseInt(parts[1], 10) - 1;
        day = parseInt(parts[2], 10);
      }
    } else {
      const parts = dateStr.split(" ");
      if (parts.length >= 2) {
        day = parseInt(parts[0], 10);
        const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        const mName = parts[1].substring(0, 3);
        const mIdx = monthNames.findIndex(m => m.toLowerCase() === mName.toLowerCase());
        if (mIdx !== -1) month = mIdx;
        if (parts.length >= 3) year = parseInt(parts[2], 10);
      }
    }

    const parsedDate = new Date(year, month, day, hours, minutes, 0);
    if (matches.length === 1) {
      return new Date(parsedDate.getTime() + 55 * 60 * 1000);
    }
    return parsedDate;
  };

  const checkAttendanceWindow = (dateStr: string, timeStr: string) => {
    // If Admin has disabled attendance mark lock, past periods remain open for marking
    if (!attendanceLockEnabled) {
      const startTime = parseSlotStartTimeForDate(timeStr, dateStr);
      const now = new Date();
      if (startTime && now < startTime) {
        return { open: false, reason: "future", message: "Class has not started yet." };
      }
      return { open: true };
    }

    const startTime = parseSlotStartTimeForDate(timeStr, dateStr);
    const endTime = parseSlotEndTimeForDate(timeStr, dateStr);
    if (!startTime || !endTime) return { open: true };

    const now = new Date();
    if (now < startTime) {
      return { open: false, reason: "future", message: "Class has not started yet." };
    }

    if (now > endTime) {
      return {
        open: false,
        reason: "expired",
        message: `This period ended at ${endTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}. Direct marking is closed; please request CM approval with a reason to mark attendance.`
      };
    }

    return { open: true };
  };

  // Helper to filter slots matching active class button
  const doesClassMatchFilter = (classGroup?: string, filter?: string | null) => {
    if (!filter) return true;
    if (!classGroup) return false;
    return getClassGroupLabel(classGroup) === filter;
  };

  const getSemesterFromSlot = (slot: Slot): string => {
    if (slot.classGroup) {
      const parsed = parseClassGroup(slot.classGroup);
      if (parsed.sem) {
        const s = parsed.sem.toLowerCase();
        if (s.includes("sem vi") || s.includes("semester vi") || s.includes("semester 6") || s.includes("sem 6")) return "Semester 6";
        if (s.includes("sem v") || s.includes("semester v") || s.includes("semester 5") || s.includes("sem 5")) return "Semester 5";
        if (s.includes("sem iv") || s.includes("semester iv") || s.includes("semester 4") || s.includes("sem 4")) return "Semester 4";
        if (s.includes("sem iii") || s.includes("semester iii") || s.includes("semester 3") || s.includes("sem 3")) return "Semester 3";
        if (s.includes("sem ii") || s.includes("semester ii") || s.includes("semester 2") || s.includes("sem 2")) return "Semester 2";
        if (s.includes("sem i") || s.includes("semester i") || s.includes("semester 1") || s.includes("sem 1")) return "Semester 1";
      }

      const year = getYearForClass(slot.classGroup);
      if (slot.course) {
        const subjectObj = subjectsList.find(sub => isSubjectNameMatch(sub.name, slot.course));
        if (subjectObj && subjectObj.semester) {
          const semNum = subjectObj.semester.match(/\d+/);
          if (semNum) return `Semester ${semNum[0]}`;
        }
      }

      if (year === "1st Year") return "Semester 1";
      if (year === "2nd Year") return "Semester 3";
      if (year === "3rd Year") return "Semester 5";
    }

    if (slot.course) {
      const subjectObj = subjectsList.find(sub => isSubjectNameMatch(sub.name, slot.course));
      if (subjectObj && subjectObj.semester) {
        const semNum = subjectObj.semester.match(/\d+/);
        if (semNum) return `Semester ${semNum[0]}`;
      }
    }

    return "Semester 1";
  };

  const mentorMatchesSemester = (mentor: Mentor, semester: string): boolean => {
    const targetNormSem = semester.toLowerCase().replace(/\s+/g, ""); // e.g. "semester1", "semester3", "semester5"
    if (!targetNormSem) return true;

    const normalizeSemName = (semName: string): string => {
      const s = semName.toLowerCase();
      if (s.includes("sem vi") || s.includes("semester vi") || s.includes("semester 6") || s.includes("sem 6")) return "semester6";
      if (s.includes("sem v") || s.includes("semester v") || s.includes("semester 5") || s.includes("sem 5")) return "semester5";
      if (s.includes("sem iv") || s.includes("semester iv") || s.includes("semester 4") || s.includes("sem 4")) return "semester4";
      if (s.includes("sem iii") || s.includes("semester iii") || s.includes("semester 3") || s.includes("sem 3")) return "semester3";
      if (s.includes("sem ii") || s.includes("semester ii") || s.includes("semester 2") || s.includes("sem 2")) return "semester2";
      if (s.includes("sem i") || s.includes("semester i") || s.includes("semester 1") || s.includes("sem 1")) return "semester1";
      return "";
    };

    // 1. Check current slots assigned to this mentor
    const mentorSlots = slots.filter(s => s.mentorId === mentor.id);
    const hasMatchingSlot = mentorSlots.some(slot => {
      if (slot.classGroup) {
        const parsed = parseClassGroup(slot.classGroup);
        if (parsed.sem && normalizeSemName(parsed.sem) === targetNormSem) {
          return true;
        }
        const year = getYearForClass(slot.classGroup);
        if (year === "1st Year" && (targetNormSem === "semester1" || targetNormSem === "semester2")) return true;
        if (year === "2nd Year" && (targetNormSem === "semester3" || targetNormSem === "semester4")) return true;
        if (year === "3rd Year" && (targetNormSem === "semester5" || targetNormSem === "semester6")) return true;
      }
      if (slot.course) {
        const subjectObj = subjectsList.find(sub => isSubjectNameMatch(sub.name, slot.course));
        if (subjectObj && subjectObj.semester && normalizeSemName(subjectObj.semester) === targetNormSem) {
          return true;
        }
      }
      return false;
    });

    if (hasMatchingSlot) return true;

    // 2. Check mentor's profile classes field
    if (mentor.classes) {
      const classesLines = mentor.classes.split("\n").map(c => c.trim().toLowerCase()).filter(Boolean);
      const hasMatchingClass = classesLines.some(line => {
        if ((targetNormSem === "semester1" || targetNormSem === "semester2") && (line.includes("1st year") || line.includes("1styr") || line.includes("1st yr") || line.includes("1nd year") || line.includes("1ndyr"))) {
          return true;
        }
        if ((targetNormSem === "semester3" || targetNormSem === "semester4") && (line.includes("2nd year") || line.includes("2ndyr") || line.includes("2nd yr"))) {
          return true;
        }
        if ((targetNormSem === "semester5" || targetNormSem === "semester6") && (line.includes("3rd year") || line.includes("3rdyr") || line.includes("3rd yr") || line.includes("3nd year") || line.includes("3ndyr"))) {
          return true;
        }
        const lineSem = normalizeSemName(line);
        if (lineSem === targetNormSem) return true;
        return false;
      });
      if (hasMatchingClass) return true;
    }

    // 3. Check mentor's profile subjects field
    if (mentor.subjects) {
      const subjectLines = mentor.subjects.split(/\n|\/|,|;/).map(s => s.trim()).filter(Boolean);
      const hasMatchingSubject = subjectLines.some(line => {
        const match = subjectsList.find(sub => isSubjectNameMatch(sub.name, line));
        if (match && match.semester && normalizeSemName(match.semester) === targetNormSem) {
          return true;
        }
        return false;
      });
      if (hasMatchingSubject) return true;
    }

    return false;
  };

  const getCoveringStaffOptions = (slot: Slot) => {
    if (!currentMentor) return { sorted: [], classGroupMentorIds: new Set<string>(), classGroupMentorSubjects: new Map<string, string[]>() };
    const myId = currentMentor.id;
    const myDept = currentMentor.mentor_group;

    // 1. Get all mentors in the same department (excluding current mentor)
    const sameDeptMentors = mentors.filter(m => m.id !== myId && m.mentor_group === myDept);

    // 2. Get all mentors who teach the same class group (excluding current mentor) and their subjects
    const classGroupMentorIds = new Set<string>();
    const classGroupMentorSubjects = new Map<string, string[]>();
    if (slot.classGroup) {
      slots.forEach(s => {
        if (s.classGroup === slot.classGroup && s.mentorId !== myId) {
          classGroupMentorIds.add(s.mentorId);
          if (s.course) {
            const subs = classGroupMentorSubjects.get(s.mentorId) || [];
            if (!subs.includes(s.course)) {
              subs.push(s.course);
            }
            classGroupMentorSubjects.set(s.mentorId, subs);
          }
        }
      });
    }
    const classGroupMentors = mentors.filter(m => classGroupMentorIds.has(m.id));

    // Combine them
    const combined = new Map<string, Mentor>();

    // Add class group mentors first
    classGroupMentors.forEach(m => combined.set(m.id, m));
    // Add department mentors
    sameDeptMentors.forEach(m => combined.set(m.id, m));

    const list = Array.from(combined.values());

    // Sort
    const sorted = [...list].sort((a, b) => {
      const aIsClassGroup = classGroupMentorIds.has(a.id) ? 1 : 0;
      const bIsClassGroup = classGroupMentorIds.has(b.id) ? 1 : 0;

      if (aIsClassGroup !== bIsClassGroup) {
        return bIsClassGroup - aIsClassGroup; // class group mentors first
      }

      const aMatch = mentorMatchesSemester(a, modalSemester) ? 1 : 0;
      const bMatch = mentorMatchesSemester(b, modalSemester) ? 1 : 0;
      return bMatch - aMatch;
    });

    return { sorted, classGroupMentorIds, classGroupMentorSubjects };
  };

  const isMentorOccupied = (mentorId: string, day: string, time: string, shift: string, dateStr: string) => {
    // 1. Has a regular slot at this time
    const hasRegularSlot = slots.some(s =>
      s.mentorId === mentorId &&
      s.day === day &&
      s.time === time &&
      s.shift === shift
    );

    // 2. Is already covering another class at this time on this date
    const isCovering = approvedHandovers.some(h =>
      h.coverStaffId === mentorId &&
      h.dateStr === dateStr &&
      (() => {
        const os = slots.find(s => s.id === h.slotId);
        return os && os.day === day && os.time === time && os.shift === shift;
      })()
    );

    // 3. Has handed over their own slot at this time on this date (absent)
    const isAbsent = approvedHandovers.some(h =>
      h.originalMentorId === mentorId &&
      h.dateStr === dateStr &&
      (() => {
        const os = slots.find(s => s.id === h.slotId);
        return os && os.day === day && os.time === time && os.shift === shift;
      })()
    );

    return hasRegularSlot || isCovering || isAbsent;
  };

  const handleClassFilterClick = (cls: string) => {
    if (selectedClassFilter === cls) {
      setSelectedClassFilter(null);
    } else {
      setSelectedClassFilter(cls);
    }
  };

  // Mentor timetable shift is derived from their slots, not a fixed profile field
  React.useEffect(() => {
    if (currentMentor) {
      // Determine dominant shift from actual slots
      const mentorSlots = slots.filter(s => s.mentorId === currentMentor.id);
      const hasShift1 = mentorSlots.some(s => s.shift === "shift_1");
      const hasShift2 = mentorSlots.some(s => s.shift === "shift_2");
      const hasGeneral = mentorSlots.some(s => s.shift === "general");
      if (hasShift1 && !hasShift2 && currentShift !== "shift_1") {
        setCurrentShift("shift_1");
      } else if (hasShift2 && !hasShift1 && currentShift !== "shift_2") {
        setCurrentShift("shift_2");
      } else if (hasGeneral && !hasShift1 && !hasShift2 && currentShift !== "general") {
        setCurrentShift("general");
      }
    }
  }, [currentMentor, slots]);

  if (!currentMentor) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center min-h-[60vh] p-6 text-center">
        <div className="h-12 w-12 rounded-2xl bg-zinc-100 border border-zinc-200 flex items-center justify-center text-amber-500 mb-4 animate-pulse">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
        <h3 className="text-base font-bold text-slate-900 mb-1">Loading Faculty Workspace…</h3>
        <p className="text-xs text-slate-500 max-w-sm">
          Preparing your timetable, classes, and teaching agenda.
        </p>
      </div>
    );
  }

  // ── Actual duration calculator ──────────────────────────────────────────
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

  const cleanSubjectName = (name: string): string => {
    return name.trim().replace(/[,;/]+$/, "").trim();
  };

  const getCanonicalSubjectName = (name: string): string => {
    const cleaned = cleanSubjectName(name);
    const match = subjectsList.find(sub => isSubjectNameMatch(sub.name, cleaned));
    return match ? match.name : cleaned;
  };

  // Split subjects and classes strings — used locally inside allMentorSubjects useMemo
  // Filter slots for the current mentor — show ALL their slots regardless of shift
  // (timetable may have been generated under any shift label; we display them all)
  const mySlots = useMemo(() => slots.filter((s) => s.mentorId === currentMentor.id), [slots, currentMentor.id]);

  // O(1) slot lookup map — must be defined before derived useMemos that use it
  const slotsByIdMap = useMemo(() => new Map(slots.map(s => [s.id, s])), [slots]);

  // Filter slots for the current mentor (already declared above)
  const myRequests = useMemo(() => requests.filter((r) => r.requestorId === currentMentor.id), [requests, currentMentor.id]);
  const myCoverageRequests = useMemo(() => requests.filter((r) => r.targetStaffId === currentMentor.id && !isAwaitingCm(r.status)), [requests, currentMentor.id]);

  // Timetable hours (own slots)
  const targetMinutes = useMemo(() => mySlots.reduce((acc, s) => acc + parseSlotMinutes(s.time), 0), [mySlots]);

  // O(1) Lookup Map for Daily Configs (Eliminates repeated array scans)
  const dailyConfigsMap = useMemo(() => {
    const m = new Map<string, any>();
    (dailyConfigsList || []).forEach((c: any) => {
      if (c && c.dateStr) m.set(c.dateStr, c);
    });
    return m;
  }, [dailyConfigsList]);

  // Ensure Saturday is dynamically included in weekDates whenever 6-day working, Saturday slots exist, or Saturday has daily config
  const effectiveWeekDates = useMemo(() => {
    if (weekDates.length >= 6) return weekDates;
    if (weekDates.length === 0) return weekDates;

    const mon = new Date(weekDates[0].dateStr);
    const sat = new Date(mon);
    sat.setDate(mon.getDate() + 5);
    const satDateStr = sat.toISOString().split("T")[0];

    const hasSatConfig = (() => {
      const c = dailyConfigsMap.get(satDateStr);
      if (!c) return false;
      return (c.day_order && c.day_order !== "None") || c.day_type === "working" || c.day_type === "regular" || c.day_type === "event" || c.day_type === "exam_day";
    })();

    const hasSatSlots = mySlots.some(s => s.day === "Saturday");
    const activeCollege = colleges.find(c => c.id === currentMentor?.college_id);
    const is6DaysCollege = Number(activeCollege?.working_days) === 6;

    if (is6DaysCollege || hasSatSlots || hasSatConfig) {
      return [
        ...weekDates,
        {
          day: "Saturday",
          dateStr: satDateStr,
          formatted: sat.toLocaleDateString("en-US", { month: "short", day: "numeric" })
        }
      ];
    }

    return weekDates;
  }, [weekDates, dailyConfigsMap, mySlots, colleges, currentMentor]);

  // Extra coverage hours for the current week (from approved handovers scheduled in this week's dates)
  const currentWeekDateStrings = useMemo(() => effectiveWeekDates.map(d => d.dateStr), [effectiveWeekDates]);
  const currentWeekCoveredHandovers = useMemo(() => approvedHandovers.filter(
    h => h.coverStaffId === currentMentor.id && currentWeekDateStrings.includes(h.dateStr)
  ), [approvedHandovers, currentMentor.id, currentWeekDateStrings]);
  const currentWeekCoveredSlots = useMemo(() => currentWeekCoveredHandovers
    .map(h => slotsByIdMap.get(h.slotId))
    .filter(Boolean) as Slot[], [currentWeekCoveredHandovers, slotsByIdMap]);
  const coveredMinutes = useMemo(() => currentWeekCoveredSlots.reduce((acc, s) => acc + parseSlotMinutes(s.time), 0), [currentWeekCoveredSlots]);

  // Handed-over hours for the current week (original mentor is current mentor and handover is approved)
  const currentWeekHandedOverHandovers = useMemo(() => approvedHandovers.filter(
    h => h.originalMentorId === currentMentor.id && currentWeekDateStrings.includes(h.dateStr)
  ), [approvedHandovers, currentMentor.id, currentWeekDateStrings]);
  const currentWeekHandedOverSlots = useMemo(() => currentWeekHandedOverHandovers
    .map(h => slotsByIdMap.get(h.slotId))
    .filter(Boolean) as Slot[], [currentWeekHandedOverHandovers, slotsByIdMap]);
  const handedOverMinutes = useMemo(() => currentWeekHandedOverSlots.reduce((acc, s) => acc + parseSlotMinutes(s.time), 0), [currentWeekHandedOverSlots]);

  const totalMinutes = useMemo(() => targetMinutes - handedOverMinutes + coveredMinutes, [targetMinutes, handedOverMinutes, coveredMinutes]);

  // Calculate unique active semesters in this teacher's timetable
  const activeSemesters = useMemo(() => Array.from(
    new Set(
      [
        ...mySlots.map(s => getSemesterFromSlot(s)),
        ...slots.filter((slot) =>
          approvedHandovers.some((h) => h.coverStaffId === currentMentor.id && h.slotId === slot.id) &&
          slot.shift === currentShift
        ).map(s => getSemesterFromSlot(s))
      ].filter(Boolean)
    )
  ).sort((a, b) => {
    const numA = parseInt(a.replace(/^\D+/g, ''), 10) || 0;
    const numB = parseInt(b.replace(/^\D+/g, ''), 10) || 0;
    return numA - numB;
  }), [mySlots, slots, approvedHandovers, currentMentor.id, currentShift]);

  // Calculate unique active semesters in this teacher's department & college
  const deptSemestersWithTimetable = useMemo(() => {
    const deptMentors = mentors.filter(
      (m) => m.college_id === currentMentor.college_id && m.mentor_group === currentMentor.mentor_group
    );
    const deptMentorIds = new Set(deptMentors.map((m) => m.id));
    const deptSlots = slots.filter((s) => deptMentorIds.has(s.mentorId));
    return Array.from(
      new Set(deptSlots.map((s) => getSemesterFromSlot(s)).filter(Boolean))
    ).sort((a, b) => {
      const numA = parseInt(a.replace(/^\D+/g, ""), 10) || 0;
      const numB = parseInt(b.replace(/^\D+/g, ""), 10) || 0;
      return numA - numB;
    });
  }, [mentors, slots, currentMentor.college_id, currentMentor.mentor_group]);

  const getCohortLabelForSemester = (semLabel: string) => {
    const mentorDept = currentMentor?.mentor_group;
    if (!mentorDept) return "";
    const course = (coursesList || []).find(c => c.name === mentorDept);
    if (!course) return "";

    const semNumMatch = semLabel.match(/\d+/);
    if (!semNumMatch) return "";
    const semNum = parseInt(semNumMatch[0], 10);
    const yearIndex = Math.ceil(semNum / 2); // e.g. Year 1, 2, 3, or 4

    const baseStartYear = Number(course.start_year || "2026");
    const duration = Number(course.years || 4);

    const cohortStart = baseStartYear - (yearIndex - 1);
    const cohortEnd = cohortStart + duration;

    return ` (${cohortStart}-${cohortEnd})`;
  };

  // Calculate target and covered minutes per subject dynamically
  const subjectTargetMinutesMap = useMemo(() => {
    const map: Record<string, number> = {};
    mySlots.forEach((slot) => {
      const course = getCanonicalSubjectName(slot.course || "General");
      map[course] = (map[course] || 0) + parseSlotMinutes(slot.time);
    });
    return map;
  }, [mySlots, subjectsList]);

  const subjectCoveredMinutesMap = useMemo(() => {
    const map: Record<string, number> = {};
    currentWeekCoveredSlots.forEach((slot) => {
      const course = getCanonicalSubjectName(slot.course || "General");
      map[course] = (map[course] || 0) + parseSlotMinutes(slot.time);
    });
    return map;
  }, [currentWeekCoveredSlots, subjectsList]);

  const allMentorSubjects = useMemo(() => {
    const subjectsArray = currentMentor.subjects
      ? currentMentor.subjects.split(/\n|\/|,|;/).map(s => getCanonicalSubjectName(s)).filter(Boolean)
      : [];
    const weeklyCoveredSubjects = currentWeekCoveredSlots.map(s => getCanonicalSubjectName(s.course || "General"));
    return Array.from(new Set([
      ...subjectsArray,
      ...mySlots.map(s => getCanonicalSubjectName(s.course || "General")),
      ...weeklyCoveredSubjects
    ]));
  }, [currentMentor.subjects, mySlots, currentWeekCoveredSlots, subjectsList]);



  // Helper to resolve the active day for a calendar date, accounting for CM Day Order overrides (O(1))
  const getMappedDayForDate = (dateStr: string, defaultDay: string) => {
    const dailyConfig = dailyConfigsMap.get(dateStr);

    // If it's a holiday, return a special holiday flag
    if (dailyConfig && dailyConfig.day_type === "holiday") {
      return "holiday";
    }

    if (dailyConfig && dailyConfig.day_order && dailyConfig.day_order !== "None") {
      const match = dailyConfig.day_order.match(/^Day (\d+)$/i);
      if (match) {
        const orderNum = parseInt(match[1], 10);
        const dayNames = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
        if (orderNum >= 1 && orderNum <= dayNames.length) {
          return dayNames[orderNum - 1];
        }
      }
    }

    return defaultDay;
  };

  // ── O(1) High-Performance Fast-Lookup Structures (Eliminates 540,000,000 inner render scans) ──
  const markedAttendanceKeySet = useMemo(() => {
    const set = new Set<string>();
    (studentAttendance || []).forEach(a => {
      if (a.slotId && a.dateStr) {
        set.add(`${a.slotId}|${a.dateStr}`);
      }
    });
    return set;
  }, [studentAttendance]);

  const approvedHandoverSet = useMemo(() => {
    const set = new Set<string>();
    (approvedHandovers || []).forEach(h => {
      if (h.slotId && h.dateStr) {
        set.add(`${h.slotId}|${h.dateStr}`);
      }
    });
    return set;
  }, [approvedHandovers]);

  const pendingHandoverMap = useMemo(() => {
    const map = new Map<string, any>();
    (requests || []).forEach(r => {
      if (r.status === "pending" && r.slotId && r.dateStr) {
        map.set(`${r.slotId}|${r.dateStr}`, r);
      }
    });
    return map;
  }, [requests]);

  const slotByIdMap = useMemo(() => {
    const map = new Map<string, Slot>();
    (slots || []).forEach(s => {
      if (s.id) map.set(s.id, s);
    });
    return map;
  }, [slots]);

  const getAgendaClassesForDay = (dayName: string) => {
    const dateObj = effectiveWeekDates.find(d => d.day === dayName);
    const dateStr = dateObj ? dateObj.dateStr : "";

    const queryDay = getMappedDayForDate(dateStr, dayName);
    if (queryDay === "holiday") {
      return []; // Return no classes on holidays
    }

    // 1. Own slots for this day (all shifts — show everything assigned to this mentor)
    const ownSlots = mySlots.filter(s => s.day === queryDay);

    const isExam = isExamDate(dateStr, dailyConfigsList, studentAttendance);

    // Filter out slots that have been handed over to someone else on this date
    const activeOwnClasses = ownSlots.map(slot => {
      const isHandedOver = approvedHandoverSet.has(`${slot.id}|${dateStr}`);
      const pendingHandover = pendingHandoverMap.get(`${slot.id}|${dateStr}`) || null;
      const hasAttendance = markedAttendanceKeySet.has(`${slot.id}|${dateStr}`);

      return {
        slot,
        type: "own" as const,
        isHandedOver,
        pendingHandover,
        hasAttendance,
        roleLabel: isExam ? "Exam Session" : "Regular Class"
      };
    });

    // 2. Covered slots (handed over to us on this date)
    const coveredHandovers = approvedHandovers.filter(h => h.coverStaffId === currentMentor.id && h.dateStr === dateStr);
    const activeCoverClasses = coveredHandovers.map(h => {
      const slot = slotByIdMap.get(h.slotId);
      const hasAttendance = slot ? markedAttendanceKeySet.has(`${slot.id}|${dateStr}`) : false;
      return {
        slot,
        type: "covering" as const,
        isHandedOver: false,
        pendingHandover: null,
        hasAttendance,
        roleLabel: isExam ? `Exam Invigilation for ${h.coverStaffName || 'Faculty'}` : `Substitution for ${h.coverStaffName || 'Faculty'}`
      };
    })
      .filter((x) => x.slot !== undefined)
      .map(x => ({
        ...x,
        slot: x.slot as Slot
      }));

    // 3. Demo sessions assigned to this mentor on this date
    const mentorDemos = (demoSessions || []).filter(
      ds => ds.mentorId === currentMentor.id && ds.dateStr === dateStr && ds.status !== "not_conducted"
    );
    const activeDemoClasses = mentorDemos.map(demo => {
      const demoSlot: Slot = {
        id: `demo_${demo.id}`,
        mentorId: demo.mentorId,
        college_id: currentMentor.college_id || "",
        day: queryDay,
        time: demo.timeSlot,
        course: demo.subject,
        classGroup: demo.stream || "L&D Presentation Cohort",
        location: "SME Presentation Hall",
        shift: "general"
      };
      return {
        slot: demoSlot,
        type: "demo" as const,
        isHandedOver: false,
        pendingHandover: null,
        hasAttendance: false,
        roleLabel: `L&D Presentation (SME: ${demo.smeName})`,
        demoSession: demo
      };
    });

    // Merge and sort by time
    const allAgendaClasses = [...activeOwnClasses, ...activeCoverClasses, ...activeDemoClasses].sort((a, b) => {
      return (a.slot?.time || "").localeCompare(b.slot?.time || "");
    });

    return allAgendaClasses;
  };

  // Get unique locations from mySlots and covering slots for filtering
  const uniqueLocations = useMemo(() => Array.from(
    new Set([
      ...mySlots.map((s) => s.location),
      ...currentWeekCoveredSlots.map((s) => s.location)
    ].filter(Boolean))
  ), [mySlots, currentWeekCoveredSlots]);

  // Get unique class display labels from mySlots and covering slots for filtering dynamically from scheduled slots
  const uniqueClassLabels = useMemo(() => Array.from(
    new Set(
      [
        ...mySlots.map((s) => s.classGroup),
        ...currentWeekCoveredSlots.map((s) => s.classGroup)
      ]
        .filter(Boolean)
        .map((cg) => getClassGroupLabel(cg))
    )
  ), [mySlots, currentWeekCoveredSlots]);

  const isTimeMatch = (t1?: string, t2?: string) => {
    if (!t1 || !t2) return false;
    if (t1 === t2) return true;
    const n1 = t1.toLowerCase().replace(/\./g, ":").replace(/\s+/g, " ").replace(/\b0(\d:\d\d)/g, "$1").trim();
    const n2 = t2.toLowerCase().replace(/\./g, ":").replace(/\s+/g, " ").replace(/\b0(\d:\d\d)/g, "$1").trim();
    return n1 === n2;
  };

  // Helper to find slot for a day & time slot, and check if it's owned or covered on a specific date (O(1) lookups)
  const getSlotAt = (day: string, dateStr: string, time: string) => {
    const queryDay = getMappedDayForDate(dateStr, day);
    if (queryDay === "holiday") {
      return null;
    }

    // 1. Check if the logged-in mentor has their own slot assigned at this (queryDay, time)
    const ownSlot = mySlots.find((s) => s.day === queryDay && isTimeMatch(s.time, time));

    // Check Handover state for this slot on this date
    const pendingReq = ownSlot ? requests.find(r => r.slotId === ownSlot.id && r.dateStr === dateStr && r.status === "pending") : null;
    const approvedReq = ownSlot ? approvedHandovers.find(h => h.slotId === ownSlot.id && h.dateStr === dateStr) : null;

    // 2. Check if another mentor handed over their slot to this logged-in mentor on this date (approved)
    const coverHandover = approvedHandovers.find(
      (h) => h.dateStr === dateStr && h.coverStaffId === currentMentor.id && (() => {
        const slotOfHandover = slotsByIdMap.get(h.slotId);
        return slotOfHandover && slotOfHandover.day === queryDay && isTimeMatch(slotOfHandover.time, time);
      })()
    );
    const coverSlot = coverHandover ? slotsByIdMap.get(coverHandover.slotId) : null;

    // 3. Check if mentor has a Demo Session booked on this date & time slot
    const demoForSlot = (demoSessions || []).find(
      ds => ds.mentorId === currentMentor.id && ds.dateStr === dateStr && isTimeMatch(ds.timeSlot, time) && ds.status !== "not_conducted"
    );

    // Determine status of the cell
    let cellStatus: "active" | "pending" | "handover" | null = null;
    let slotObj: any = null;
    let typeObj: "own" | "covering" | "demo" | null = null;

    if (ownSlot) {
      slotObj = ownSlot;
      typeObj = "own";
      if (approvedReq) {
        cellStatus = "handover";
      } else if (pendingReq) {
        cellStatus = "pending";
      } else {
        cellStatus = "active";
      }
    } else if (coverSlot) {
      slotObj = coverSlot;
      typeObj = "covering";
      cellStatus = "handover";
    } else if (demoForSlot) {
      slotObj = {
        id: `demo_${demoForSlot.id}`,
        mentorId: demoForSlot.mentorId,
        college_id: currentMentor.college_id || "",
        day: queryDay,
        time: demoForSlot.timeSlot,
        course: demoForSlot.subject,
        classGroup: demoForSlot.stream || "L&D Cohort",
        location: "SME Presentation Room",
        shift: "general"
      };
      typeObj = "demo";
      cellStatus = "active";
    }

    if (!slotObj) return null;

    // Apply target class filter
    if (selectedClassFilter && !doesClassMatchFilter(slotObj.classGroup, selectedClassFilter)) {
      return null;
    }

    // Apply status filter
    if (selectedStatusFilter && cellStatus !== selectedStatusFilter) {
      return null;
    }

    // Apply location filter
    if (selectedLocationFilter && slotObj.location !== selectedLocationFilter) {
      return null;
    }

    if (typeObj === "own") {
      return { slot: ownSlot!, type: "own" as const, handover: approvedReq || undefined };
    } else if (typeObj === "covering") {
      return { slot: coverSlot!, type: "covering" as const, originalMentorId: coverHandover!.originalMentorId, handover: coverHandover };
    } else {
      return { slot: slotObj, type: "demo" as const, demoSession: demoForSlot };
    }
  };

  // Calculate filtered slots list
  const getFilteredSlotsList = () => {
    const list: { slot: Slot; day: string; dateStr: string; dateFormatted: string; type: "own" | "covering" | "demo"; status: "active" | "pending" | "handover"; originalMentorId?: string }[] = [];

    // Check all dates and times
    effectiveWeekDates.forEach((date) => {
      timeSlots.forEach((time) => {
        const slotResult = getSlotAt(date.day, date.dateStr, time);
        if (slotResult) {
          const ownSlot = slotResult.slot;
          const pendingReq = ownSlot ? requests.find(r => r.slotId === ownSlot.id && r.dateStr === date.dateStr && r.status === "pending") : null;
          const approvedReq = ownSlot ? approvedHandovers.find(h => h.slotId === ownSlot.id && h.dateStr === date.dateStr) : null;

          let status: "active" | "pending" | "handover" = "active";
          if (slotResult.type === "own") {
            if (approvedReq) {
              status = "handover";
            } else if (pendingReq) {
              status = "pending";
            }
          } else {
            status = "handover";
          }

          list.push({
            slot: slotResult.slot,
            day: date.day,
            dateStr: date.dateStr,
            dateFormatted: date.formatted,
            type: slotResult.type,
            status,
            originalMentorId: slotResult.type === "covering" ? slotResult.originalMentorId : undefined
          });
        }
      });
    });

    return list;
  };

  // Memoize agenda classes for the selected day
  const agendaClasses = useMemo(() => getAgendaClassesForDay(agendaDay), [
    agendaDay, mySlots, approvedHandovers, requests, studentAttendance, demoSessions,
    effectiveWeekDates, currentMentor.id, dailyConfigsMap
  ]);

  // Pre-computed late attendance CM request lookup sets — avoid per-cell array scans in timetable JSX
  const lateAttendanceCamApprovedSet = useMemo(() => {
    const s = new Set<string>(); // key: "slotId|dateStr"
    requests.forEach(r => {
      if (r.status === "approved" && isLateAttendanceRequest(r)) {
        s.add(`${r.slotId}|${r.dateStr}`);
      }
    });
    approvedHandovers.forEach(h => {
      if (isLateAttendanceRequest(h)) {
        s.add(`${h.slotId}|${h.dateStr}`);
      }
    });
    return s;
  }, [requests, approvedHandovers]);

  const lateAttendanceCamPendingSet = useMemo(() => {
    const s = new Set<string>(); // key: "slotId|dateStr"
    requests.forEach(r => {
      if (isAnyPendingCmRequest(r.status) && isLateAttendanceRequest(r)) {
        s.add(`${r.slotId}|${r.dateStr}`);
      }
    });
    return s;
  }, [requests]);
  // Key: "dateStr|time"  → cell data object
  const timetableCellMap = useMemo(() => {
    const map = new Map<string, {
      slot: any;
      type: "own" | "covering" | "demo" | "exam" | null;
      cellStatus: "active" | "pending" | "handover" | null;
      hasAttendance: boolean;
      pendingReq: any | null;
      approvedReq: any | null;
      demoSession: any | null;
      originalMentorId?: string;
      exam?: any | null;
    }>();

    // Build fast lookup maps
    const attendanceKeySet = new Set<string>();
    studentAttendance.forEach(a => attendanceKeySet.add(`${a.slotId}|${a.dateStr}`));

    const pendingReqBySlotDate = new Map<string, any>();
    const approvedReqBySlotDate = new Map<string, any>();
    requests.forEach(r => {
      if (r.status === "pending") pendingReqBySlotDate.set(`${r.slotId}|${r.dateStr}`, r);
    });
    approvedHandovers.forEach(h => {
      approvedReqBySlotDate.set(`${h.slotId}|${h.dateStr}`, h);
    });

    const coverHandoverByDateForMentor = new Map<string, any>();
    approvedHandovers.forEach(h => {
      if (h.coverStaffId === currentMentor.id) {
        coverHandoverByDateForMentor.set(`${h.dateStr}|${h.slotId}`, h);
      }
    });

    const demoByDateSlot = new Map<string, any>();
    (demoSessions || []).forEach(ds => {
      if (ds.mentorId === currentMentor.id && ds.status !== "not_conducted") {
        demoByDateSlot.set(`${ds.dateStr}|${ds.timeSlot}`, ds);
      }
    });

    effectiveWeekDates.forEach(date => {
      timeSlots.forEach(time => {
        const queryDay = getMappedDayForDate(date.dateStr, date.day);
        if (queryDay === "holiday") {
          map.set(`${date.dateStr}|${time}`, { slot: null, type: null, cellStatus: null, hasAttendance: false, pendingReq: null, approvedReq: null, demoSession: null });
          return;
        }

        // Check if there is an active exam scheduled on this date overlapping this specific slot's time
        const examsOnDate = (mentorExamsList || []).filter((ex: any) => ex.exam_date === date.dateStr);
        const slotExam = examsOnDate.find((ex: any) =>
          isSlotOverlappingExamWindow(time, ex.start_time, ex.end_time)
        );

        // 1. Own slot
        const ownSlot = mySlots.find(s => s.day === queryDay && isTimeMatch(s.time, time));
        if (ownSlot) {
          const pendingReq = pendingReqBySlotDate.get(`${ownSlot.id}|${date.dateStr}`) || null;
          const approvedReq = approvedReqBySlotDate.get(`${ownSlot.id}|${date.dateStr}`) || null;
          const hasAttendance = attendanceKeySet.has(`${ownSlot.id}|${date.dateStr}`);

          // Apply filters
          if (selectedClassFilter && !doesClassMatchFilter(ownSlot.classGroup, selectedClassFilter)) {
            map.set(`${date.dateStr}|${time}`, { slot: null, type: null, cellStatus: null, hasAttendance: false, pendingReq: null, approvedReq: null, demoSession: null });
            return;
          }

          let cellStatus: "active" | "pending" | "handover" = approvedReq ? "handover" : pendingReq ? "pending" : "active";
          if (selectedStatusFilter && cellStatus !== selectedStatusFilter) {
            map.set(`${date.dateStr}|${time}`, { slot: null, type: null, cellStatus: null, hasAttendance: false, pendingReq: null, approvedReq: null, demoSession: null });
            return;
          }
          if (selectedLocationFilter && ownSlot.location !== selectedLocationFilter) {
            map.set(`${date.dateStr}|${time}`, { slot: null, type: null, cellStatus: null, hasAttendance: false, pendingReq: null, approvedReq: null, demoSession: null });
            return;
          }

          // ONLY mark as exam if this slot's time range overlaps the exam start and end time!
          if (slotExam) {
            map.set(`${date.dateStr}|${time}`, { slot: ownSlot, type: "exam", cellStatus: "active", hasAttendance, pendingReq, approvedReq, demoSession: null, exam: slotExam });
            return;
          }

          map.set(`${date.dateStr}|${time}`, { slot: ownSlot, type: "own", cellStatus, hasAttendance, pendingReq, approvedReq, demoSession: null });
          return;
        }

        // If there is an active exam overlapping this time for mentor's department/subjects
        if (slotExam) {
          const examSlot = {
            id: `exam_${slotExam.id || date.dateStr}_${time}`,
            mentorId: currentMentor.id,
            college_id: currentMentor.college_id || "",
            day: queryDay,
            time: slotExam.session_time || time,
            course: slotExam.subject_name,
            classGroup: slotExam.department,
            location: slotExam.hall_room || "Examination Hall",
            shift: currentShift
          };
          const hasAttendance = attendanceKeySet.has(`${examSlot.id}|${date.dateStr}`);
          map.set(`${date.dateStr}|${time}`, { slot: examSlot, type: "exam", cellStatus: "active", hasAttendance, pendingReq: null, approvedReq: null, demoSession: null, exam: slotExam });
          return;
        }

        // 2. Cover slot
        const coverHandover = approvedHandovers.find(h =>
          h.coverStaffId === currentMentor.id &&
          h.dateStr === date.dateStr &&
          (() => { const s = slotsByIdMap.get(h.slotId); return s && s.day === queryDay && isTimeMatch(s.time, time); })()
        );
        if (coverHandover) {
          const coverSlot = slotsByIdMap.get(coverHandover.slotId);
          if (coverSlot) {
            if (selectedClassFilter && !doesClassMatchFilter(coverSlot.classGroup, selectedClassFilter)) {
              map.set(`${date.dateStr}|${time}`, { slot: null, type: null, cellStatus: null, hasAttendance: false, pendingReq: null, approvedReq: null, demoSession: null });
              return;
            }
            if (selectedStatusFilter && selectedStatusFilter !== "handover") {
              map.set(`${date.dateStr}|${time}`, { slot: null, type: null, cellStatus: null, hasAttendance: false, pendingReq: null, approvedReq: null, demoSession: null });
              return;
            }
            if (selectedLocationFilter && coverSlot.location !== selectedLocationFilter) {
              map.set(`${date.dateStr}|${time}`, { slot: null, type: null, cellStatus: null, hasAttendance: false, pendingReq: null, approvedReq: null, demoSession: null });
              return;
            }
            const hasAttendance = attendanceKeySet.has(`${coverSlot.id}|${date.dateStr}`);
            map.set(`${date.dateStr}|${time}`, { slot: coverSlot, type: "covering", cellStatus: "handover", hasAttendance, pendingReq: null, approvedReq: coverHandover, demoSession: null, originalMentorId: coverHandover.originalMentorId });
            return;
          }
        }

        // 3. Demo slot
        const demo = demoByDateSlot.get(`${date.dateStr}|${time}`);
        if (demo) {
          const demoSlot = { id: `demo_${demo.id}`, mentorId: demo.mentorId, college_id: currentMentor.college_id || "", day: queryDay, time: demo.timeSlot, course: demo.subject, classGroup: demo.stream || "L&D Cohort", location: "L&D Presentation Room", shift: "general" };
          map.set(`${date.dateStr}|${time}`, { slot: demoSlot, type: "demo", cellStatus: "active", hasAttendance: false, pendingReq: null, approvedReq: null, demoSession: demo });
          return;
        }

        map.set(`${date.dateStr}|${time}`, { slot: null, type: null, cellStatus: null, hasAttendance: false, pendingReq: null, approvedReq: null, demoSession: null });
      });
    });
    return map;
  }, [effectiveWeekDates, timeSlots, mySlots, approvedHandovers, requests, studentAttendance, demoSessions, mentorExamsList,
    currentMentor.id, currentMentor.college_id, slotsByIdMap, dailyConfigsMap,
    selectedClassFilter, selectedStatusFilter, selectedLocationFilter]);

  // Pre-computed today string (avoid re-creating every render)
  const todayStr = useMemo(() => getLocalDateStr(), []);

  const isFilterActive = selectedClassFilter !== null || selectedStatusFilter !== null || selectedLocationFilter !== null;
  const filteredSlotsList = useMemo(() => isFilterActive ? getFilteredSlotsList() : [], [
    isFilterActive, effectiveWeekDates, timeSlots, mySlots, requests, approvedHandovers, demoSessions,
    selectedClassFilter, selectedStatusFilter, selectedLocationFilter, slotsByIdMap,
    currentMentor.id, dailyConfigsMap
  ]);

  const hasMatchingSlotInRow = (time: string) => {
    return effectiveWeekDates.some((date) => {
      const slotResult = getSlotAt(date.day, date.dateStr, time);
      return slotResult !== null;
    });
  };

  const parseTimeMinutes = (tStr: string) => {
    if (!tStr) return { mins: 0, formatted: "" };
    const cleaned = tStr.trim();
    const match = cleaned.match(/(\d+)(?::|\.)(\d+)\s*(AM|PM)?/i);
    if (!match) return { mins: 0, formatted: cleaned };
    let h = parseInt(match[1], 10);
    const m = parseInt(match[2], 10);
    const isPM = (match[3] || "").toUpperCase() === "PM" || (cleaned.toLowerCase().includes("pm") && !cleaned.toLowerCase().includes("am"));
    const period = isPM ? "PM" : "AM";
    let h24 = h;
    if (isPM && h24 !== 12) h24 += 12;
    if (!isPM && h24 === 12) h24 = 0;
    const mins = h24 * 60 + m;
    const formatted = `${h}:${m.toString().padStart(2, "0")} ${period}`;
    return { mins, formatted };
  };

  const rows: (
    | { type: "slot"; time: string }
    | { type: "break" | "lunch"; label: string; timeRange: string }
  )[] = [];

  timeSlots.forEach((time, index) => {
    rows.push({ type: "slot", time });

    if (index < timeSlots.length - 1) {
      const partsCur = time.split(/\s*-\s*/);
      const partsNext = timeSlots[index + 1].split(/\s*-\s*/);

      if (partsCur.length >= 2 && partsNext.length >= 1) {
        const endCur = parseTimeMinutes(partsCur[1]);
        const startNext = parseTimeMinutes(partsNext[0]);
        const diffMins = startNext.mins - endCur.mins;

        if (diffMins > 5) {
          const isLunch = diffMins >= 35 || (endCur.mins >= 700 && endCur.mins <= 800);
          rows.push({
            type: isLunch ? "lunch" : "break",
            label: isLunch ? "Lunch Break" : "Break",
            timeRange: `${endCur.formatted} - ${startNext.formatted}`
          });
        }
      }
    }
  });

  const handleCellClick = (day: string, dateStr: string, dateFormatted: string, time: string) => {
    const slotResult = getSlotAt(day, dateStr, time);
    if (!slotResult) return;

    const slot = slotResult.slot;
    setSelectedCell({
      day,
      dateStr,
      dateFormatted,
      time,
      slot,
      type: slotResult.type,
      originalMentorId: slotResult.type === "covering" ? slotResult.originalMentorId : undefined,
      handover: slotResult.handover
    });
    setReasonText("");
    setFormError("");
    setTargetStaffId("");
    setHandoverSubject("original");
    setSelectedSubjName("");
    setCustomSubjName("");

    // Reset attendance search/select states
    setAttendanceSearchTerm("");
    setSelectedStudentIds([]);
    setLastCheckedId(null);
    setIsRangeOpen(false);
    setRangeStartId("");
    setRangeEndId("");

    // Reset weekly-plan verification state for the newly selected period
    setPlanVerificationChoice(null);
    setPlanActualTopic("");

    // Initialize local attendance
    const classStudents = students.filter(
      (s) => isClassGroupMatch(s.classGroup, slot.classGroup)
    );

    const initialAttendance: Record<string, "present" | "absent" | "od" | "not_marked"> = {};
    classStudents.forEach((student) => {
      const existing = studentAttendance.find(
        (a) => a.studentId === student.id && a.slotId === slot.id && a.dateStr === dateStr
      );
      initialAttendance[student.id] = existing ? (existing.status as any) : "present";
    });
    setLocalAttendance(initialAttendance);
    setOriginalAttendance(initialAttendance);

    const firstExisting = studentAttendance.find(
      (a) => a.slotId === slot.id && a.dateStr === dateStr
    );
    if (firstExisting) {
      setAttendanceType((firstExisting.type as any) || "Regular");
      setAttendanceMode((firstExisting.mode as any) || "Offline");
      setAttendanceTypeSub(firstExisting.attendanceTypeSub || "Event");
    } else {
      setAttendanceType("Regular");
      setAttendanceMode("Offline");
      setAttendanceTypeSub("Event");
    }

    // Determine default tab based on whether class has already started or is in the future
    const todayStr = getLocalDateStr();
    const isFuture = dateStr > todayStr || (dateStr === todayStr && (() => {
      const periodStart = parseSlotStartTime(time);
      return periodStart ? new Date() < periodStart : false;
    })());

    // Always start by asking user: Mark Attendance or Request Handover
    setModalTab("attendance");
    setIsAttendanceStudioOpen(false);

    const targetSem = getSemesterFromSlot(slot);
    setModalSemester(targetSem);

    setIsDayConfigSet(true);
    setDayConfigDetails(null);

    // Use already-cached daily config map instead of a duplicate fetch on every cell click
    const configForDate = dailyConfigsMap.get(dateStr);
    const overlappingExam = (mentorExamsList || []).find(
      (ex: any) => ex.exam_date === dateStr && isSlotOverlappingExamWindow(slot.time, ex.start_time, ex.end_time)
    );

    if (overlappingExam) {
      setIsDayConfigSet(true);
      setDayConfigDetails({
        college_id: currentMentor.college_id,
        dateStr,
        day_type: "exam_day",
        day_order: "None",
        notes: `${overlappingExam.exam_type} Examination`,
        session_mode: "Offline"
      });
      setAttendanceType("Non-Regular");
      setAttendanceTypeSub("Exam");
      setAttendanceMode("Offline");
    } else if (configForDate && configForDate.day_type && configForDate.day_order !== "None") {
      setIsDayConfigSet(true);
      setDayConfigDetails(configForDate);
      if (configForDate.day_type === "event") {
        setAttendanceType("Non-Regular");
        setAttendanceTypeSub("Event");
      } else if (configForDate.day_type === "exam_day") {
        // Daily config is exam_day, but this slot falls outside the exam hours window -> Regular class
        setAttendanceType("Regular");
        setAttendanceTypeSub("");
      } else {
        setAttendanceType("Regular");
      }
      setAttendanceMode(configForDate.session_mode === "Online" ? "Online" : "Offline");
    } else {
      if (!firstExisting) {
        setIsDayConfigSet(false);
        setDayConfigDetails(null);
      }
    }

    // Go straight to Roster Grid (Step 2) as configured by CM daily
    setAttendanceStep(2);
    setIsModalOpen(true);
  };

  const submitAction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCell || !selectedCell.slot) return;

    if (!reasonText.trim()) {
      setFormError("Please provide a reason for this class handover.");
      return;
    }
    if (!targetStaffId) {
      setFormError("You must select a staff member of your department to cover the class.");
      return;
    }

    const isOccupied = isMentorOccupied(
      targetStaffId,
      selectedCell.slot.day,
      selectedCell.slot.time,
      selectedCell.slot.shift,
      selectedCell.dateStr
    );
    if (isOccupied) {
      setFormError("The selected staff member is occupied during this period.");
      return;
    }

    let finalSubject = selectedCell.slot.course;
    if (handoverSubject === "substitute_own") {
      if (!selectedSubjName) {
        setFormError("Please select the subject to be taught from the covering mentor's list.");
        return;
      }
      finalSubject = selectedSubjName;
    } else if (handoverSubject === "custom") {
      if (!customSubjName.trim()) {
        setFormError("Please enter the custom subject to be taught.");
        return;
      }
      finalSubject = customSubjName.trim();
    }

    setSwapSubmitting(true);
    try {
      await requestHandover(
        currentMentor.id,
        selectedCell.slot.id,
        selectedCell.dateStr,
        selectedCell.dateFormatted,
        targetStaffId,
        reasonText,
        finalSubject
      );

      setIsModalOpen(false);
    } finally {
      setSwapSubmitting(false);
    }
  };

  // --- PERFORMANCE OPTIMIZATIONS ---
  // Memoize heavy filtering used across the dashboard
  const memoizedSelectedCellStudents = useMemo(() => {
    if (!selectedCell?.slot) return [];
    return students.filter((student) => {
      // Must match college scope first
      if (student.college_id && selectedCell.slot!.college_id && student.college_id !== selectedCell.slot!.college_id) return false;
      // Primary: match by classGroup (most specific)
      if (isClassGroupMatch(student.classGroup, selectedCell.slot!.classGroup)) return true;
      // Secondary: match by department when slot has no classGroup set
      if (!selectedCell.slot!.classGroup && isClassGroupMatch(student.department, selectedCell.slot!.department || "")) return true;
      return false;
    });
  }, [students, selectedCell?.slot]);

  const memoizedSelectedCellAttendance = useMemo(() => {
    if (!selectedCell?.slot) return [];
    return studentAttendance.filter(
      (a) => a.slotId === selectedCell.slot!.id && a.dateStr === selectedCell.dateStr
    );
  }, [studentAttendance, selectedCell?.slot, selectedCell?.dateStr]);

  const memoizedCoveringStaff = useMemo(() => {
    if (!selectedCell?.slot) return [];
    const { sorted, classGroupMentorIds, classGroupMentorSubjects } = getCoveringStaffOptions(selectedCell.slot);
    return sorted.map(m => {
      const isClassGroup = classGroupMentorIds.has(m.id);
      const isOccupied = isMentorOccupied(
        m.id,
        selectedCell.slot!.day,
        selectedCell.slot!.time,
        selectedCell.slot!.shift,
        selectedCell.dateStr
      );
      let badge = "";
      if (isClassGroup) {
        const subs = classGroupMentorSubjects.get(m.id) || [];
        badge = subs.length > 0 ? ` (${subs.join(", ")})` : "";
      }
      return { ...m, isOccupied, badge };
    });
  }, [selectedCell?.slot, selectedCell?.dateStr, currentMentor, mentors, slots, modalSemester, approvedHandovers]);

  const memoizedProfileMyAttendance = useMemo(() => {
    return studentAttendance.filter(a => a.markedBy === currentMentor?.id);
  }, [studentAttendance, currentMentor?.id]);

  const memoizedMyRequestsCount = useMemo(() => {
    return requests.filter(r => r.requestorId === currentMentor?.id).length;
  }, [requests, currentMentor?.id]);

  const memoizedMyCoveringApprovedCount = useMemo(() => {
    return requests.filter(r => r.targetStaffId === currentMentor?.id && r.status === "approved").length;
  }, [requests, currentMentor?.id]);

  const memoizedTrackerClassStudents = useMemo(() => {
    if (activeTab !== "tracker") return [];
    // Derive active class group using exact course names from Batch Creation
    const campusCourses = Array.from(
      new Set(
        (coursesList || [])
          .filter(c => !c.college_id || c.college_id === currentMentor?.college_id)
          .map(c => c.name.trim())
          .filter(Boolean)
      )
    ).sort();

    const mentorAssignedCourses = campusCourses.filter(courseName => {
      const cLower = courseName.toLowerCase();
      return (
        mentorClasses.some(cl => cl.toLowerCase().includes(cLower)) ||
        mySlots.some(s => (s.course || "").toLowerCase().includes(cLower) || (s.classGroup || "").toLowerCase().includes(cLower)) ||
        (currentMentor?.mentor_group || "").toLowerCase().includes(cLower) ||
        (currentMentor?.department || "").toLowerCase().includes(cLower)
      );
    });

    const deptOptions = mentorAssignedCourses.length > 0 ? mentorAssignedCourses : (campusCourses.length > 0 ? campusCourses : [currentMentor?.department || "General"]);
    const activeDept = trackerDept && deptOptions.includes(trackerDept) ? trackerDept : deptOptions[0] || "";

    const selectedCourseObj = coursesList.find(c => c.name.trim().toLowerCase() === activeDept.trim().toLowerCase());
    const courseYears = selectedCourseObj?.years || 3;
    const standardSemesters = getSemestersForCourse(courseYears);

    const semesterOptions = Array.from(new Set([
      ...standardSemesters,
      ...subjectsList
        .filter(s => {
          if (s.college_id && currentMentor?.college_id && s.college_id !== currentMentor.college_id) return false;
          const sDept = (s.department || "").toLowerCase().trim();
          const sMg = (s.mentor_group || "").toLowerCase().trim();
          const act = activeDept.toLowerCase().trim();
          const code = (selectedCourseObj?.code || "").toLowerCase().trim();
          return sDept === act || sMg === act || (code && sDept === code) || sDept.startsWith(act) || act.startsWith(sDept);
        })
        .map(s => s.semester)
        .filter(Boolean)
    ])).sort((a, b) => parseInt((a || "").replace(/\D/g, "") || "0") - parseInt((b || "").replace(/\D/g, "") || "0"));

    const defaultSems = ALL_SEMESTERS;
    const finalSemOptions = semesterOptions.length > 0 ? semesterOptions : defaultSems;
    const activeSem = trackerSem && finalSemOptions.includes(trackerSem) ? trackerSem : finalSemOptions[0] || "Semester 1";

    return students.filter(s => {
      if (s.college_id && currentMentor?.college_id && s.college_id !== currentMentor.college_id) return false;
      const sDept = (s.department || "").trim();
      const sClass = (s.classGroup || "").trim();
      const cLower = activeDept.trim().toLowerCase();
      const cCodeLower = (selectedCourseObj?.code || "").trim().toLowerCase();

      const inCourse = sDept.toLowerCase() === cLower ||
        sDept.replace(/^[ivx]+\s+/i, "").toLowerCase() === cLower ||
        sClass.toLowerCase().startsWith(cLower) ||
        sClass.toLowerCase().includes(cLower) ||
        (cCodeLower && (sDept.toLowerCase() === cCodeLower || sClass.toLowerCase().includes(cCodeLower)));
      if (!inCourse) return false;

      if (!activeSem || activeSem === "ALL") return true;

      const sSem = (s.semester || (s.classGroup ? s.classGroup.match(/Semester\s*\d+/i)?.[0] : "") || "").trim().toLowerCase();
      const semLower = activeSem.trim().toLowerCase();
      const semNum = semLower.match(/\d+/)?.[0];

      if (sSem === semLower) return true;
      if (semNum && (sSem.includes(`semester ${semNum}`) || sSem.includes(`sem ${semNum}`))) return true;
      if (semNum && sClass.toLowerCase().includes(`semester ${semNum}`)) return true;
      if (semNum) {
        const yrNum = Math.ceil(parseInt(semNum, 10) / 2);
        const romanYears = ["", "i", "ii", "iii", "iv"];
        const roman = romanYears[yrNum];
        if (roman && (sClass.toLowerCase().startsWith(`${roman} `) || sClass.toLowerCase().includes(` ${roman} `) || sDept.toLowerCase().startsWith(`${roman} `))) {
          return true;
        }
      }
      return false;
    });
  }, [activeTab, students, currentMentor, trackerDept, trackerSem, coursesList, mentorClasses, subjectsList, mySlots]);

  // --- Attendance Tab Memoizations — lifts IIFE work out of JSX ---
  // Match by slot ownership — markedBy is optional so we match slotId to mentor's slots
  const mySlotIds = useMemo(() => new Set(mySlots.map(s => s.id)), [mySlots]);

  const memoizedMentorAtt = useMemo(() => {
    return studentAttendance.filter(a =>
      mySlotIds.has(a.slotId) ||
      a.markedBy === currentMentor?.id
    );
  }, [studentAttendance, mySlotIds, currentMentor?.id]);

  const memoizedMarkedSessions = useMemo(() => {
    const groups: Record<string, {
      slotId: string; dateStr: string; timestamp: string; records: typeof studentAttendance;
    }> = {};
    memoizedMentorAtt.forEach(att => {
      if (!att) return;
      const key = `${att.slotId || ""}_${att.dateStr || ""}`;
      if (!groups[key]) {
        groups[key] = { slotId: att.slotId || "", dateStr: att.dateStr || "", timestamp: att.timestamp || "", records: [] };
      }
      groups[key].records.push(att);
    });
    return Object.values(groups).map(g => {
      const slot = slotsByIdMap.get(g.slotId);
      const presentCount = g.records.filter(r => r.status === "present").length;
      const absentCount = g.records.filter(r => r.status === "absent").length;
      const totalMarked = g.records.length;
      const percent = totalMarked > 0 ? Math.round((presentCount / totalMarked) * 100) : 100;
      return { ...g, slot, presentCount, absentCount, totalMarked, percent };
    }).sort((a, b) => (b.dateStr || "").localeCompare(a.dateStr || "") || (b.timestamp || "").localeCompare(a.timestamp || ""));
  }, [memoizedMentorAtt, slotsByIdMap]);

  // Notification count for sidebar — memoized to avoid re-scanning on every render
  const sidebarNotificationCount = useMemo(() => {
    return requests.filter(r => r.targetStaffId === currentMentor.id && r.status === "pending").length;
  }, [requests, currentMentor.id]);

  // Tracker tab — class stats (submissions, marks, current week) — expensive nested loop
  const memoizedTrackerStats = useMemo(() => {
    const classStudents = memoizedTrackerClassStudents;
    if (classStudents.length === 0 || activeTab !== "tracker") return null;

    // We need activeSubj from tracker state — derive it the same way the tracker tab does
    const campusDepts = Array.from(new Set(coursesList.filter(c => !c.college_id || c.college_id === currentMentor?.college_id).map(c => c.name.trim()).filter(Boolean))).sort();
    const deptOptions = campusDepts.length > 0 ? campusDepts : Array.from(new Set(mentorClasses.map(c => getDeptFromClassGroup(c) || c))).filter(Boolean);
    const activeDept = trackerDept || deptOptions[0] || currentMentor?.mentor_group || "";
    const semOpts = Array.from(new Set(subjectsList.filter(s => {
      if (s.college_id && currentMentor?.college_id && s.college_id !== currentMentor.college_id) return false;
      const d = (s.department || "").toLowerCase().trim();
      const mg = (s.mentor_group || "").toLowerCase().trim();
      const act = activeDept.toLowerCase().trim();
      return d === act || mg === act || (d.length > 2 && act.includes(d)) || (act.length > 2 && d.includes(act));
    }).map(s => s.semester).filter(Boolean))).sort((a, b) => parseInt((a || "").replace(/\D/g, "") || "0") - parseInt((b || "").replace(/\D/g, "") || "0"));
    const activeSem = trackerSem || (semOpts.length > 0 ? semOpts[0] : "Semester 1");
    const activeClassGroup = `${activeDept} - ${activeSem}`;

    const subjectObjs = subjectsList.filter(s => {
      if (s.college_id && currentMentor?.college_id && s.college_id !== currentMentor.college_id) return false;
      const d = (s.department || "").toLowerCase().trim();
      const mg = (s.mentor_group || "").toLowerCase().trim();
      const act = activeDept.toLowerCase().trim();
      const matchDept = d === act || mg === act || (d.length > 2 && act.includes(d)) || (act.length > 2 && d.includes(act));
      const semNum = (s.semester || "").replace(/\D/g, "");
      const actSemNum = activeSem.replace(/\D/g, "");
      const matchSem = s.semester?.toLowerCase().trim() === activeSem.toLowerCase().trim() || (semNum && actSemNum && semNum === actSemNum);
      return matchDept && matchSem;
    });
    const mentorSubjectNames = new Set(mentorSubjects.map(s => s.toLowerCase().trim()));
    const mentorFilteredSubjectObjs = subjectObjs.filter(s => mentorSubjectNames.has(s.name.toLowerCase().trim()));
    const subjectOptions = Array.from(new Set(
      mentorFilteredSubjectObjs.length > 0
        ? mentorFilteredSubjectObjs.map(s => s.name?.trim()).filter(Boolean)
        : subjectObjs.length > 0
          ? subjectObjs.map(s => s.name?.trim()).filter(Boolean)
          : mentorSubjects.length > 0
            ? mentorSubjects.map(s => s?.trim()).filter(Boolean)
            : ["General Subject"]
    ));
    const activeSubj = trackerSubject || subjectOptions[0] || "";

    const assignedWeeksCount = Array.from({ length: 15 }, (_, i) => i + 1).filter(wk =>
      weeklyTasks.some(t => isCohortMatching(t.class_group, activeClassGroup, coursesList, subjectsList) && t.subject.toLowerCase().trim() === activeSubj.toLowerCase().trim() && t.week_number === wk)
    ).length;

    let totalSubmissionsCount = 0;
    let totalMarksSum = 0;
    let totalGradedEntriesCount = 0;

    // Build a fast lookup map for studentTracker
    const trackerByStudentSubject = new Map<string, any[]>();
    studentTracker.forEach(e => {
      const key = `${e.student_id}|${e.subject.toLowerCase().trim()}`;
      if (!trackerByStudentSubject.has(key)) trackerByStudentSubject.set(key, []);
      trackerByStudentSubject.get(key)!.push(e);
    });

    classStudents.forEach(st => {
      const entries = trackerByStudentSubject.get(`${st.id}|${activeSubj.toLowerCase().trim()}`) || [];
      entries.forEach(entry => {
        if (entry.submission_url) totalSubmissionsCount++;
        if (entry.marks !== undefined && entry.marks !== null && !isNaN(entry.marks)) {
          totalMarksSum += entry.marks;
          totalGradedEntriesCount++;
        }
      });
    });

    const currentWeekSubmittedCount = classStudents.filter(s => {
      const entries = trackerByStudentSubject.get(`${s.id}|${activeSubj.toLowerCase().trim()}`) || [];
      return entries.some(e => e.week_number === trackerWeek && !!e.submission_url);
    }).length;

    const totalPossible = classStudents.length * (assignedWeeksCount || 1);
    const overallPct = totalPossible > 0 ? Math.round((totalSubmissionsCount / totalPossible) * 100) : 0;
    const avgScore = totalGradedEntriesCount > 0 ? (totalMarksSum / totalGradedEntriesCount).toFixed(1) : "—";

    return { overallPct, avgScore, assignedWeeksCount, currentWeekSubmittedCount, totalStudents: classStudents.length };
  }, [activeTab, memoizedTrackerClassStudents, studentTracker, weeklyTasks, trackerWeek, trackerSubject, trackerDept, trackerSem, coursesList, subjectsList, mentorSubjects, mentorClasses, currentMentor]);

  // Swap modal — the target mentor's slots (only computed when modal is open)
  const memoizedSwapTargetSlots = useMemo(() => {
    if (!swapModalOpen || !swapTarget) return [];
    return slots.filter(s => s.mentorId === swapTarget.otherMentorId);
  }, [swapModalOpen, swapTarget, slots]);

  // Attendance studio — filtered student list (depends on search + filter + localAttendance)
  const memoizedFilteredStudents = useMemo(() => {
    if (!isAttendanceStudioOpen || !memoizedSelectedCellStudents.length) return memoizedSelectedCellStudents;
    const q = (deferredAttendanceSearch || "").toLowerCase().trim();
    return memoizedSelectedCellStudents.filter(s => {
      const matchesSearch = !q || s.name.toLowerCase().includes(q) || s.id.toLowerCase().includes(q);
      if (!matchesSearch) return false;
      const stStatus = localAttendance[s.id] || "present";
      if (attendanceFilterStatus !== "all" && stStatus !== attendanceFilterStatus) return false;
      return true;
    });
  }, [memoizedSelectedCellStudents, deferredAttendanceSearch, localAttendance, attendanceFilterStatus, isAttendanceStudioOpen]);

  return (
    <div className="flex-1 flex flex-col md:flex-row bg-warm-canvas text-slate-800 font-sans h-full overflow-hidden">
      {(() => {
        const getNotificationCount = (tabId: string) => {
          if (tabId === "handovers" && currentMentor) {
            return sidebarNotificationCount;
          }
          return 0;
        };

        return (
          <aside className={`hidden md:flex shrink-0 flex-col justify-between sticky top-6 z-30 floating-sidebar transition-all duration-300 ${isCollapsed ? "w-20 p-3" : "w-64 p-5"}`}>
            <div className="flex flex-col flex-1 overflow-y-auto">
              <nav className={`py-2 space-y-1 ${isCollapsed ? "px-1" : "px-4"}`}>
                {[
                  { id: "home", label: "Home", icon: Home },
                  { id: "timetable", label: "My Schedule", icon: Calendar },
                  { id: "interviews", label: "Interview Module", icon: Award },
                  { id: "demo_evaluations", label: "My L&D", icon: Sparkles },
                  { id: "attendance", label: "Student Attendance", icon: ClipboardList },
                  { id: "exams", label: "Exam Marks Entry", icon: FileText },
                  { id: "academic_tracker", label: "Academic Tracker", icon: BookOpen },
                  { id: "materials", label: "Study Materials Hub", icon: Book },
                  { id: "tracker", label: "Skill Development Tracker", icon: GraduationCap },
                  { id: "my_skill_tracker", label: "My Skill Tracker", icon: Award },
                  { id: "weekly_plan", label: "Weekly Teaching Plan", icon: CalendarRange },
                  { id: "handovers", label: "Handovers", icon: Clock },
                  { id: "profile", label: "Profile", icon: User }
                ].map(t => {
                  const Icon = t.icon;
                  const isActive = activeTab === t.id;
                  const count = getNotificationCount(t.id);
                  return (
                    <button
                      key={t.id}
                      onMouseEnter={() => prefetchRoleTab(queryClient, "mentor", t.id, { collegeId: mentorCollegeId, mentorId: currentMentor?.id || "" })}
                      onClick={() => setActiveTab(t.id as any)}
                      className={`w-full flex items-center rounded-xl text-xs font-bold tracking-tight transition-all duration-200 cursor-pointer group ${isCollapsed ? "justify-center px-0 py-3" : "justify-start gap-3 px-3.5 py-2.5 text-left"
                        } ${isActive
                          ? "bg-zinc-900 text-white ring-1 ring-inset ring-zinc-800 font-extrabold shadow-sm dark:bg-zinc-900 dark:text-white"
                          : "text-slate-600 hover:text-slate-900 hover:bg-slate-100/80 dark:text-slate-300 dark:hover:text-white dark:hover:bg-white/10"
                        }`}
                    >
                      <div className="relative flex items-center justify-center">
                        <Icon className={`h-4.5 w-4.5 shrink-0 transition-colors ${isActive ? "text-amber-400" : "text-slate-400 group-hover:text-amber-500"}`} />
                        {isCollapsed && count > 0 && (
                          <span className="absolute -top-1.5 -right-1.5 block h-2.5 w-2.5 rounded-full bg-rose-500 ring-2 ring-white" />
                        )}
                      </div>
                      {!isCollapsed && <span>{t.label}</span>}
                      {!isCollapsed && count > 0 && (
                        <span className={`ml-auto text-[10px] font-bold px-2 py-0.5 rounded-full ${isActive ? "bg-amber-500 text-zinc-950 font-black" : "bg-rose-500 text-white"}`}>
                          {count}
                        </span>
                      )}
                    </button>
                  );
                })}
              </nav>
            </div>

            {/* User profile card & collapse button at bottom */}
            <div className="border-t border-slate-100/85 pt-4 space-y-3 shrink-0">
              <div className="flex justify-center pt-1">
                <button
                  type="button"
                  onClick={() => setIsCollapsed((prev) => {
                    const next = !prev;
                    localStorage.setItem("fp_sidebar_collapsed", String(next));
                    return next;
                  })}
                  className="h-8.5 w-8.5 rounded-full bg-white border border-slate-200 flex items-center justify-center text-slate-500 hover:text-slate-800 hover:bg-slate-50 shadow-xs transition-all cursor-pointer"
                  title={isCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
                >
                  {isCollapsed ? <ChevronsRight className="h-4 w-4" /> : <ChevronsLeft className="h-4 w-4" />}
                </button>
              </div>
            </div>
          </aside>
        );
      })()}

      {/* Mobile Bottom Navigation — visible only on small screens */}
      {(() => {
        const tabs = [
          { id: "home", label: "Home", icon: Home },
          { id: "timetable", label: "My Schedule", icon: Calendar },
          { id: "attendance", label: "Attendance", icon: ClipboardList },
          { id: "tracker", label: "Skill Tracker", icon: GraduationCap },
          { id: "more_menu", label: "More", icon: Menu },
        ];
        return (
          <nav className="flex md:hidden fixed bottom-0 inset-x-0 z-50 mobile-bottom-nav safe-area-bottom">
            <div className="flex w-full justify-around items-center py-2 px-1">
              {tabs.map(t => {
                const Icon = t.icon;
                const isActive = activeTab === t.id || (t.id === "more_menu" && ["handovers", "profile", "demo_evaluations"].includes(activeTab));
                const count = t.id === "more_menu" && currentMentor
                  ? sidebarNotificationCount
                  : 0;
                return (
                  <button
                    key={t.id}
                    onClick={() => setActiveTab(t.id as any)}
                    className={`relative flex flex-col items-center justify-center gap-0.5 min-h-[3.5rem] flex-1 rounded-xl transition-all cursor-pointer ${isActive ? "text-zinc-950 dark:text-white" : "text-slate-400"
                      }`}
                  >
                    <div className="relative">
                      <Icon className={`h-5 w-5 transition-transform ${isActive ? "scale-110 text-amber-500" : ""}`} />
                      {count > 0 && (
                        <span className="absolute -top-1.5 -right-1.5 h-3.5 w-3.5 bg-rose-500 text-white text-[8px] font-bold rounded-full flex items-center justify-center">
                          {count}
                        </span>
                      )}
                    </div>
                    <span className={`text-[9px] font-semibold tracking-wide leading-none ${isActive ? "text-zinc-950 dark:text-white" : "text-slate-400"}`}>
                      {t.label}
                    </span>
                    {isActive && (
                      <span className="absolute top-0 inset-x-2 h-0.5 bg-amber-500 rounded-full" />
                    )}
                  </button>
                );
              })}
            </div>
          </nav>
        );
      })()}

      <main className="flex-grow overflow-x-hidden overflow-y-auto h-full floating-main-panel p-4 md:p-6 space-y-6 pb-20 md:pb-6 scroll-touch relative">
        {/* Tab-switch pending indicator */}
        {isTabPending && (
          <div className="absolute inset-x-0 top-0 h-0.5 z-40 overflow-hidden">
            <div className="h-full bg-amber-500 w-full" />
          </div>
        )}
        {/* Tab More Menu: Grid of remaining tabs */}
        {activeTab === "more_menu" && (
          <div className="space-y-6 animate-fadeIn pb-10">
            <h2 className="text-sm font-extrabold text-slate-800 uppercase tracking-wider">More Tools & Portals</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <button
                type="button"
                onClick={() => setActiveTab("interviews")}
                className="p-5 bg-white border border-slate-100 rounded-2xl text-left hover:border-indigo-500 hover:ring-2 hover:ring-indigo-100 transition-all flex items-center gap-4 shadow-card cursor-pointer group"
              >
                <div className="h-10 w-10 rounded-xl bg-purple-50 flex items-center justify-center text-purple-600 shrink-0 group-hover:scale-105 transition-transform">
                  <Award className="h-5 w-5" />
                </div>
                <div>
                  <span className="block text-xs font-bold text-slate-800">Interview Module</span>
                  <span className="text-[10px] text-slate-400 font-medium">Evaluate student interviews & Google Meet</span>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab("handovers")}
                className="p-5 bg-white border border-slate-100 rounded-2xl text-left hover:border-indigo-500 hover:ring-2 hover:ring-indigo-100 transition-all flex items-center gap-4 shadow-card cursor-pointer group"
              >
                <div className="h-10 w-10 rounded-xl bg-zinc-100 flex items-center justify-center text-amber-500 shrink-0 group-hover:scale-105 transition-transform">
                  <Clock className="h-5 w-5" />
                </div>
                <div>
                  <span className="block text-xs font-bold text-slate-800">Handovers</span>
                  <span className="text-[10px] text-slate-400 font-medium">Manage swaps and handovers</span>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab("demo_evaluations")}
                className="p-5 bg-white border border-slate-100 rounded-2xl text-left hover:border-indigo-500 hover:ring-2 hover:ring-indigo-100 transition-all flex items-center gap-4 shadow-card cursor-pointer group"
              >
                <div className="h-10 w-10 rounded-xl bg-pink-50 flex items-center justify-center text-pink-500 shrink-0 group-hover:scale-105 transition-transform">
                  <Sparkles className="h-5 w-5" />
                </div>
                <div>
                  <span className="block text-xs font-bold text-slate-800">My L&D</span>
                  <span className="text-[10px] text-slate-400 font-medium">L&D sessions and review scorecards</span>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab("materials")}
                className="p-5 bg-white border border-slate-100 rounded-2xl text-left hover:border-indigo-500 hover:ring-2 hover:ring-indigo-100 transition-all flex items-center gap-4 shadow-card cursor-pointer group"
              >
                <div className="h-10 w-10 rounded-xl bg-zinc-100 flex items-center justify-center text-amber-500 shrink-0 group-hover:scale-105 transition-transform">
                  <Book className="h-5 w-5" />
                </div>
                <div>
                  <span className="block text-xs font-bold text-slate-800">Study Materials Hub</span>
                  <span className="text-[10px] text-slate-400 font-medium">Publish notes, PPTs & question banks</span>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab("profile")}
                className="p-5 bg-white border border-slate-100 rounded-2xl text-left hover:border-indigo-500 hover:ring-2 hover:ring-indigo-100 transition-all flex items-center gap-4 shadow-card cursor-pointer group sm:col-span-2"
              >
                <div className="h-10 w-10 rounded-xl bg-slate-100 flex items-center justify-center text-slate-600 shrink-0 group-hover:scale-105 transition-transform">
                  <User className="h-5 w-5" />
                </div>
                <div>
                  <span className="block text-xs font-bold text-slate-800">Profile</span>
                  <span className="text-[10px] text-slate-400 font-medium">View profile stats & info</span>
                </div>
              </button>
            </div>
          </div>
        )}



        {activeTab === "home" && (
          <>
            {currentMentor && <MentorPunchWidget mentor={currentMentor} />}

            {/*  Dedicated Metrics Grid */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Card 1: Timetable Target */}
              <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-card flex items-center gap-3.5 hover:shadow-card-lg transition-all">
                <div className="h-10 w-10 rounded-xl bg-zinc-100 flex items-center justify-center text-amber-500 shrink-0">
                  <Calendar className="h-5 w-5" />
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wider block">Scheduled Hours</span>
                  <span className="text-lg font-black text-slate-800">{toHrs(targetMinutes)} hrs</span>
                </div>
              </div>

              {/* Card 2: Coverages Received */}
              <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-card flex items-center gap-3.5 hover:shadow-card-lg transition-all">
                <div className="h-10 w-10 rounded-xl bg-teal-50 flex items-center justify-center text-teal-600 shrink-0">
                  <PlusCircle className="h-5 w-5" />
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wider block">Handover Requests Received (+)</span>
                  <span className="text-lg font-black text-teal-600">
                    {coveredMinutes > 0 ? `+${toHrs(coveredMinutes)} hrs` : "0 hrs"}
                  </span>
                </div>
              </div>

              {/* Card 3: Handovers Given */}
              <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-card flex items-center gap-3.5 hover:shadow-card-lg transition-all">
                <div className="h-10 w-10 rounded-xl bg-rose-50 flex items-center justify-center text-rose-600 shrink-0">
                  <MinusCircle className="h-5 w-5" />
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wider block">Handovers Given (-)</span>
                  <span className="text-lg font-black text-rose-600">
                    {handedOverMinutes > 0 ? `-${toHrs(handedOverMinutes)} hrs` : "0 hrs"}
                  </span>
                </div>
              </div>

              {/* Card 4: Net Actual Workload */}
              <div className="bg-white p-4 rounded-2xl border border-indigo-200 shadow-card flex items-center gap-3.5 relative overflow-hidden hover:shadow-card-lg transition-all">
                <div className="absolute top-0 inset-x-0 h-[2px] bg-gradient-to-r from-indigo-500 to-teal-400"></div>
                <div className="h-10 w-10 rounded-xl bg-indigo-100/50 flex items-center justify-center text-amber-700 shrink-0">
                  <Clock className="h-5 w-5" />
                </div>
                <div>
                  <span className="text-[10px] text-slate-600 font-extrabold uppercase tracking-wider block">Net Workload</span>
                  <span className="text-lg font-black text-gradient">{toHrs(totalMinutes)} hrs</span>
                </div>
              </div>
            </div>

            {/*  Mentor Dashboard Widgets Area */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Left: Today's Agenda (Col-span 2) */}
              <div className="lg:col-span-2 space-y-6">
                <div className="bg-white border border-slate-100 rounded-xl p-6 shadow-card flex flex-col space-y-5 h-auto lg:h-full">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-100 pb-4 gap-4">
                    <div className="flex items-center gap-2">
                      <CalendarCheck2 className="h-5 w-5 text-amber-500 shrink-0" />
                      <div>
                        <h3 className="text-sm font-bold text-slate-900">Today's Class Agenda</h3>
                      </div>
                    </div>

                    {/* Day Quick selector */}
                    <div className="flex items-center justify-between sm:justify-start gap-1 bg-slate-50 p-1 rounded-xl border border-slate-200/80 overflow-x-auto no-scrollbar w-full sm:w-auto shrink-0">
                      {["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"].map((dName) => {
                        const isSel = agendaDay === dName;
                        return (
                          <button
                            key={dName}
                            type="button"
                            onClick={() => setAgendaDay(dName)}
                            className={`flex-1 sm:flex-none text-center px-2 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all cursor-pointer whitespace-nowrap ${isSel ? "bg-zinc-900 text-white shadow-sm" : "text-slate-500 hover:text-slate-800"
                              }`}
                          >
                            {dName.slice(0, 3)}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Agenda List */}
                  {(() => {
                    const dateObj = weekDates.find(d => d.day === agendaDay);
                    const dateFormatted = dateObj ? dateObj.formatted : "";
                    const dateStr = dateObj ? dateObj.dateStr : "";

                    const dayInterviews = mentorInterviews.filter(inv => inv.target_date === dateStr);

                    if (agendaClasses.length === 0 && dayInterviews.length === 0) {
                      return (
                        <div className="flex-grow flex flex-col items-center justify-center py-12 text-center space-y-2">
                          <div className="h-12 w-12 rounded-full bg-slate-50 border border-slate-100 flex items-center justify-center text-slate-400">
                            <Calendar className="h-5 w-5" />
                          </div>
                          <div>
                            <p className="text-xs font-bold text-slate-700">No classes or interviews scheduled</p>
                            <p className="text-[10px] text-slate-400 font-semibold mt-0.5">{agendaDay}, {dateFormatted || "This week"}</p>
                          </div>
                        </div>
                      );
                    }

                    return (
                      <div className="divide-y divide-slate-100 flex-grow overflow-y-auto max-h-[420px] pr-1 space-y-3">
                        {/* Render Interview Sessions for this day */}
                        {dayInterviews.map((inv: any) => (
                          <div
                            key={inv.id}
                            onClick={() => setActiveTab("interviews" as any)}
                            className="p-3.5 rounded-xl border border-purple-200 bg-purple-50/70 hover:bg-purple-100/70 transition-all cursor-pointer flex items-center justify-between shadow-2xs group mb-2"
                          >
                            <div className="flex items-center gap-3">
                              <div className="h-9 w-9 rounded-xl bg-purple-600 text-white flex items-center justify-center font-bold text-sm shrink-0">
                                <Award className="h-4.5 w-4.5" />
                              </div>
                              <div>
                                <div className="flex items-center gap-2">
                                  <h4 className="font-extrabold text-xs text-purple-900">{inv.subject}</h4>
                                  <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 border border-purple-200">
                                    {(inv.type || "internal").toUpperCase()} INTERVIEW
                                  </span>
                                </div>
                                <p className="text-[10px] text-purple-700 font-medium mt-0.5">
                                  Cohort: <strong>{inv.class_group || "All Cohorts"}</strong> • {inv.student_count || 10} Students
                                </p>
                                {inv.type === "internal" ? (
                                  <div className="text-[10px] text-teal-700 font-bold mt-0.5 flex items-center gap-1">
                                    <User className="h-3 w-3 text-teal-600" /> In-Person Evaluation (Faculty Cabin)
                                  </div>
                                ) : inv.gmeet_link ? (
                                  <div className="text-[10px] text-emerald-700 font-bold mt-0.5 flex items-center gap-1">
                                    <Video className="h-3 w-3" /> GMeet Link Available
                                  </div>
                                ) : null}
                              </div>
                            </div>
                            <span className="text-xs font-black text-purple-700 group-hover:underline shrink-0">
                              Evaluate Students →
                            </span>
                          </div>
                        ))}

                        {agendaClasses.map((item, idx) => {
                          const isCovering = item.type === "covering";
                          const isDemo = item.type === "demo";
                          const isHandedOver = item.isHandedOver;
                          const demoSession = (item as any).demoSession;

                          if (isDemo && demoSession) {
                            return (
                              <div
                                key={idx}
                                className="p-3.5 rounded-xl border border-pink-200 bg-pink-50/70 transition-all flex items-center justify-between shadow-2xs group mb-2"
                              >
                                <div className="flex items-center gap-3">
                                  <div className="h-9 w-9 rounded-xl bg-zinc-900 text-white flex items-center justify-center font-bold text-sm shrink-0">
                                    <Sparkles className="h-4.5 w-4.5" />
                                  </div>
                                  <div>
                                    <div className="flex items-center gap-2">
                                      <h4 className="font-extrabold text-xs text-pink-900">L&D Presentation: {demoSession.subject}</h4>
                                      <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full ${demoSession.status === "completed" ? "bg-emerald-100 text-emerald-800" :
                                        demoSession.status === "reallocation_required" ? "bg-amber-100 text-amber-800" :
                                          "bg-pink-100 text-pink-700"
                                        }`}>
                                        {demoSession.status}
                                      </span>
                                    </div>
                                    <p className="text-[10px] text-pink-700 font-medium mt-0.5">
                                      SME Evaluator: <strong>{demoSession.smeName}</strong> • Time: <strong>{demoSession.timeSlot}</strong>
                                    </p>
                                  </div>
                                </div>
                                <span className="text-[10px] font-bold text-pink-600 bg-white px-2 py-1 rounded border border-pink-200">
                                  Cohort: {demoSession.stream || "Group"}
                                </span>
                              </div>
                            );
                          }

                          return (
                            <div
                              key={idx}
                              onClick={() => {
                                if (item.slot) {
                                  handleCellClick(agendaDay, dateStr, dateFormatted || "", item.slot.time);
                                }
                              }}
                              className={`pt-3.5 pb-3.5 first:pt-0 last:pb-0 flex flex-col sm:flex-row sm:items-center justify-between gap-3 cursor-pointer hover:bg-slate-50/50 rounded-xl px-2.5 -mx-2.5 transition-all border border-transparent hover:border-slate-100 ${isHandedOver ? "opacity-60" : ""
                                }`}
                            >
                              <div className="flex gap-3 items-start w-full">
                                <div className="h-9 w-9 rounded-xl bg-indigo-50 border border-indigo-100/50 flex items-center justify-center text-amber-600 shrink-0 mt-0.5">
                                  <Clock className="h-4.5 w-4.5" />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <h4 className="text-xs font-bold text-slate-800 line-clamp-1">{getCanonicalSubjectName(item.slot.course)}</h4>
                                    <span className={`px-1.5 py-0.5 rounded text-[8px] font-black uppercase shrink-0 ${isCovering
                                      ? "bg-blue-50 border border-blue-200 text-blue-700"
                                      : isHandedOver
                                        ? "bg-slate-100 border border-slate-200 text-slate-500"
                                        : "bg-zinc-100 border border-zinc-200 text-zinc-900"
                                      }`}>
                                      {item.roleLabel}
                                    </span>
                                  </div>
                                  <p className="text-[10px] text-slate-400 font-semibold mt-0.5">
                                    {formatTimeLabel(item.slot.time)} • Room: <span className="font-bold text-slate-700">{item.slot.location}</span>
                                  </p>
                                  <div className="flex items-center gap-1.5 mt-1.5">
                                    <span className="text-[9px] font-extrabold text-slate-500 bg-slate-50 border border-slate-200 px-1.5 py-0.5 rounded">
                                      {getShortClassGroup(item.slot.classGroup).name}
                                    </span>
                                    {getShortClassGroup(item.slot.classGroup).sem && (
                                      <span className="text-[9px] font-extrabold text-slate-500 bg-slate-50 border border-slate-200 px-1.5 py-0.5 rounded">
                                        {getShortClassGroup(item.slot.classGroup).sem}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>

                              <div className="shrink-0 flex items-center w-full sm:w-auto mt-1 sm:mt-0">
                                {isHandedOver ? (
                                  <span className="text-[9.5px] font-black text-slate-500 bg-slate-100 px-2.5 py-1 rounded-lg border border-slate-200/80 w-full sm:w-auto text-center">
                                    Covered by Colleague
                                  </span>
                                ) : item.hasAttendance ? (
                                  <span className="text-[9.5px] font-black text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200/80 flex items-center justify-center gap-1 w-full sm:w-auto text-center">
                                    <CheckCircle className="h-3 w-3 shrink-0" /> Marked
                                  </span>
                                ) : (() => {
                                  const windowCheck = checkAttendanceWindow(dateStr, item.slot.time);
                                  const approvedLateCamReq = requests.some(r =>
                                    r.slotId === item.slot.id &&
                                    r.dateStr === dateStr &&
                                    r.status === "approved" &&
                                    isLateAttendanceRequest(r)
                                  ) || approvedHandovers.some(h =>
                                    h.slotId === item.slot.id &&
                                    h.dateStr === dateStr &&
                                    isLateAttendanceRequest(h)
                                  );
                                  const pendingLateCamReq = requests.find(r =>
                                    r.slotId === item.slot.id &&
                                    r.dateStr === dateStr &&
                                    isAnyPendingCmRequest(r.status) &&
                                    isLateAttendanceRequest(r)
                                  );
                                  const isDeadlineExpired = !windowCheck.open && windowCheck.reason === "expired" && !approvedLateCamReq;

                                  if (pendingLateCamReq) {
                                    return (
                                      <span className="text-[9.5px] font-black text-amber-700 bg-amber-50 px-2.5 py-1 rounded-lg border border-amber-200 flex items-center justify-center gap-1 w-full sm:w-auto text-center">
                                        <Clock className="h-3 w-3 shrink-0" /> Pending CM
                                      </span>
                                    );
                                  }

                                  if (isDeadlineExpired) {
                                    return (
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          if (item.slot) {
                                            setSelectedCell({
                                              day: agendaDay,
                                              dateStr,
                                              dateFormatted: dateFormatted || "",
                                              time: item.slot.time,
                                              slot: item.slot,
                                              type: "own"
                                            });
                                            setIsCamEditRequestModalOpen(true);
                                            setCamRequestReason("");
                                            setFormError("");
                                          }
                                        }}
                                        className="w-full sm:w-auto text-center px-2.5 py-1.5 bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-700 font-black text-[9.5px] uppercase tracking-wider rounded-lg shadow-xs transition-all cursor-pointer flex items-center justify-center gap-1"
                                      >
                                        <Clock className="h-3 w-3 shrink-0" /> Request CM
                                      </button>
                                    );
                                  }

                                  return (
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        if (item.slot) {
                                          handleCellClick(agendaDay, dateStr, dateFormatted || "", item.slot.time);
                                        }
                                      }}
                                      className="w-full sm:w-auto text-center px-3 py-1.5 bg-zinc-900 text-white hover:bg-indigo-700 font-black text-[9.5px] uppercase tracking-wider rounded-lg shadow-xs transition-all cursor-pointer"
                                    >
                                      Mark Attendance
                                    </button>
                                  );
                                })()}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()}
                </div>

                {/*  Compensation & Workload Balance Ledger */}
                <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-card space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                    <div className="flex items-center gap-2">
                      <BookOpen className="h-5 w-5 text-amber-500" />
                      <div>
                        <h3 className="text-sm font-bold text-slate-900">Compensation &amp; Workload Balance Ledger</h3>
                        <p className="text-xs text-slate-400 font-semibold mt-0.5">
                          Track classes handed over or covered, and pending hour compensations.
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                      <span className="px-2 py-0.5 rounded bg-rose-50 border border-rose-200 text-rose-600">Given (-)</span>
                      <span className="px-2 py-0.5 rounded bg-teal-50 border border-teal-200 text-teal-600">Covered (+)</span>
                    </div>
                  </div>

                  {(() => {
                    interface LedgerRecord {
                      otherName: string;
                      otherId: string;
                      subject: string;
                      month: string;
                      given: number;
                      received: number;
                    }
                    const ledgerMap = new Map<string, LedgerRecord>();
                    const getLedgerKey = (otherId: string, subject: string, month: string) =>
                      `${otherId}_#_${subject}_#_${month}`;
                    const currentMonthStr = new Date().toISOString().slice(0, 7);

                    const cleanSubjectName = (name: string) =>
                      name.replace(/\s*-\s*(Semester|Sem)\s+\d+/i, "")
                        .replace(/\s*-\s*Year\s+\d+/i, "")
                        .replace(/\s*-\s*[IVXLCDM]+$/g, "")
                        .trim();

                    // Handed-over classes (giver = this mentor)
                    approvedHandovers.forEach(h => {
                      if (h.originalMentorId === currentMentor.id) {
                        const otherId = h.coverStaffId;
                        const otherMentor = mentors.find(m => m.id === otherId);
                        const otherName = otherMentor?.name || h.coverStaffName || "Staff";
                        const slot = slots.find(s => s.id === h.slotId);
                        const subject = cleanSubjectName(h.course || (slot ? slot.course : "Unknown Subject"));
                        const month = h.ledger_month || (h.dateStr || "").slice(0, 7);
                        const key = getLedgerKey(otherId, subject, month);
                        const record = ledgerMap.get(key) || { otherName, otherId, subject, month, given: 0, received: 0 };
                        record.given += 1;
                        ledgerMap.set(key, record);
                      }
                    });

                    // Covered classes (receiver = this mentor)
                    approvedHandovers.forEach(h => {
                      if (h.coverStaffId === currentMentor.id) {
                        const otherId = h.originalMentorId;
                        const otherMentor = mentors.find(m => m.id === otherId);
                        const otherName = otherMentor?.name || "Staff";
                        const slot = slots.find(s => s.id === h.slotId);
                        const subject = cleanSubjectName(h.course || (slot ? slot.course : "Unknown Subject"));
                        const month = h.ledger_month || (h.dateStr || "").slice(0, 7);
                        const key = getLedgerKey(otherId, subject, month);
                        const record = ledgerMap.get(key) || { otherName, otherId, subject, month, given: 0, received: 0 };
                        record.received += 1;
                        ledgerMap.set(key, record);
                      }
                    });

                    const ledgerList = Array.from(ledgerMap.values()).map(data => ({
                      ...data,
                      balance: data.received - data.given // + means you covered more (they owe you / credit); - means you gave more (you owe them / debit)
                    }));

                    const formatMonthLabel = (mStr: string) => {
                      if (!mStr) return "";
                      const [yr, mn] = mStr.split("-");
                      return new Date(parseInt(yr), parseInt(mn) - 1, 1)
                        .toLocaleString("default", { month: "short", year: "numeric" });
                    };

                    if (ledgerList.length === 0) {
                      return (
                        <div className="text-center py-6 border border-slate-100 rounded-xl bg-slate-50/30">
                          <p className="text-xs text-slate-500 italic">No approved handover history to calculate balance.</p>
                        </div>
                      );
                    }

                    return (
                      <div className="overflow-x-auto border border-slate-200 rounded-xl shadow-xs scroll-touch">
                        <table className="w-full border-collapse text-left text-xs min-w-[700px]">
                          <thead>
                            <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase text-[9.5px] whitespace-nowrap">
                              <th className="p-3">Month</th>
                              <th className="p-3">Subject</th>
                              <th className="p-3">Faculty Member</th>
                              <th className="p-3 text-center">Given (−)</th>
                              <th className="p-3 text-center">Covered (+)</th>
                              <th className="p-3 text-right">Balance</th>
                              <th className="p-3 text-right">Compensation Status</th>
                              <th className="p-3 text-center">Action</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 bg-white">
                            {ledgerList.map((row, idx) => {
                              const isPastMonth = row.month < currentMonthStr;
                              return (
                                <tr key={idx} className="hover:bg-slate-50/50 transition-colors text-slate-700">
                                  <td className="p-3 font-semibold whitespace-nowrap">{formatMonthLabel(row.month)}</td>
                                  <td className="p-3 font-medium text-slate-600">{row.subject}</td>
                                  <td className="p-3 font-bold text-slate-800">{row.otherName}</td>
                                  <td className="p-3 text-center">
                                    {row.given > 0
                                      ? <span className="px-2 py-0.5 rounded bg-rose-50 border border-rose-200 text-rose-700 font-black whitespace-nowrap">−{row.given} hr{row.given > 1 ? "s" : ""}</span>
                                      : <span className="text-slate-300 font-semibold">—</span>}
                                  </td>
                                  <td className="p-3 text-center">
                                    {row.received > 0
                                      ? <span className="px-2 py-0.5 rounded bg-teal-50 border border-teal-200 text-teal-700 font-black whitespace-nowrap">+{row.received} hr{row.received > 1 ? "s" : ""}</span>
                                      : <span className="text-slate-300 font-semibold">—</span>}
                                  </td>
                                  <td className={`p-3 text-right font-black text-sm whitespace-nowrap ${row.balance > 0 ? "text-emerald-600" : row.balance < 0 ? "text-rose-600" : "text-slate-500"}`}>
                                    {row.balance > 0 ? `+${row.balance}` : row.balance < 0 ? `-${Math.abs(row.balance)}` : "0"}
                                  </td>
                                  <td className="p-3 text-right whitespace-nowrap">
                                    {row.balance === 0 ? (
                                      <span className="px-2.5 py-1 rounded-md bg-slate-100 text-slate-600 border border-slate-200 text-[9.5px] font-black uppercase inline-flex items-center">Balanced</span>
                                    ) : isPastMonth ? (
                                      <span className="px-2.5 py-1 rounded-md bg-red-50 text-rose-700 border border-red-200 text-[9.5px] font-black uppercase inline-flex items-center">
                                        {row.balance < 0 ? `You owe ${Math.abs(row.balance)} hr` : `Owed ${row.balance} hr`} — Overdue
                                      </span>
                                    ) : row.balance < 0 ? (
                                      <span className="px-2.5 py-1 rounded-md bg-amber-50 text-amber-700 border border-amber-200 text-[9.5px] font-black uppercase inline-flex items-center">
                                        Compensate {Math.abs(row.balance)} hr to {row.otherName.split(" ")[0]}
                                      </span>
                                    ) : (
                                      <span className="px-2.5 py-1 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200 text-[9.5px] font-black uppercase inline-flex items-center">
                                        {row.otherName.split(" ")[0]} owes you {row.balance} hr
                                      </span>
                                    )}
                                  </td>
                                  <td className="p-3 text-center whitespace-nowrap">
                                    {row.balance < 0 ? (
                                      (() => {
                                        // Check if there's already a pending swap offer for this pair
                                        const pendingSwap = requests.find(
                                          r => r.requestorId === currentMentor.id &&
                                            r.targetStaffId === row.otherId &&
                                            r.request_type === "swap_compensate" &&
                                            (isAnyPendingCmRequest(r.status))
                                        );
                                        return pendingSwap ? (
                                          <span className="px-2 py-0.5 rounded bg-indigo-50 border border-indigo-200 text-amber-600 text-[9px] font-black uppercase">Offer Sent</span>
                                        ) : (
                                          <button
                                            type="button"
                                            onClick={() => {
                                              setSwapTarget({
                                                otherMentorId: row.otherId,
                                                otherMentorName: row.otherName,
                                                subject: row.subject,
                                                month: row.month,
                                                balance: row.balance
                                              });
                                              setSwapOfferSlotId("");
                                              setSwapOfferWeekDate("");
                                              setSwapReason("");
                                              setSwapError("");
                                              setSwapSuccess("");
                                              setSwapModalOpen(true);
                                            }}
                                            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-white border border-white/10 text-[9.5px] font-black uppercase tracking-wide transition-colors shadow-sm"
                                          >
                                            ↔ Ask Swap
                                          </button>
                                        );
                                      })()
                                    ) : (
                                      <span className="text-slate-300 text-[9px]">—</span>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    );
                  })()}
                </div>
              </div>

              {/* Right Column: Quick Actions + Subjects Breakdown + Recent Activity */}
              <div className="space-y-6">
                {/* Upcoming Demo Reviews Widget */}
                {(() => {
                  const upcomingDemos = demoSessions.filter(ds => ds.mentorId === currentMentor.id && (ds.status === "scheduled" || ds.status === "confirmed"));
                  if (upcomingDemos.length === 0) return null;
                  return (
                    <div className="bg-gradient-to-br from-pink-50/50 via-white to-white border border-pink-100 rounded-xl p-5 shadow-xs space-y-4">
                      <div className="flex items-center justify-between border-b border-pink-100/50 pb-2">
                        <div className="flex items-center gap-2">
                          <Sparkles className="h-4.5 w-4.5 text-pink-500" />
                          <h3 className="text-xs font-black text-slate-800 uppercase tracking-widest">Upcoming L&D Reviews</h3>
                        </div>
                        <span className="px-2 py-0.5 bg-pink-50 border border-pink-100 text-pink-600 text-[8px] font-black uppercase rounded-lg">
                          {upcomingDemos.length} Scheduled
                        </span>
                      </div>

                      <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
                        {upcomingDemos.slice(0, 2).map((demo) => (
                          <div key={demo.id} className="p-3 rounded-xl bg-slate-50/30 border border-slate-100 flex flex-col gap-1">
                            <div className="flex justify-between items-center">
                              <span className="text-[9px] font-black text-slate-400">{demo.dateStr}</span>
                              <span className="text-[9px] font-bold text-slate-500">{demo.timeSlot}</span>
                            </div>
                            <div className="text-xs font-black text-slate-800">{demo.subject}</div>
                            <div className="text-[9.5px] text-slate-500 font-semibold">SME Evaluator: {demo.smeName}</div>
                          </div>
                        ))}
                      </div>

                      <button
                        onClick={() => setActiveTab("demo_evaluations")}
                        className="w-full py-2 bg-pink-50 hover:bg-pink-100/80 text-pink-700 font-bold border border-pink-100 rounded-xl text-[10.5px] transition-colors cursor-pointer text-center"
                      >
                        Open Evaluations Hub
                      </button>
                    </div>
                  );
                })()}
                {/* Quick Action Center */}
                <div className="hidden md:block bg-white border border-slate-100 rounded-2xl p-5 shadow-card space-y-4">
                  <h3 className="text-xs font-black text-slate-800 uppercase tracking-widest border-b border-slate-100 pb-2">Quick Actions</h3>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        const element = document.getElementById("timetable-grid");
                        if (element) {
                          element.scrollIntoView({ behavior: "smooth" });
                        } else {
                          setActiveTab("timetable");
                        }
                      }}
                      className="flex flex-col items-center justify-center p-3.5 rounded-2xl border border-slate-100 hover:border-amber-300 hover:bg-indigo-50/10 text-center gap-2 transition-all cursor-pointer bg-white shadow-card"
                    >
                      <div className="h-9 w-9 rounded-xl bg-zinc-100 flex items-center justify-center text-amber-500 shrink-0">
                        <Calendar className="h-4.5 w-4.5" />
                      </div>
                      <div>
                        <span className="block text-[11px] font-black text-slate-800 leading-tight">Request Swap</span>
                        <span className="text-[8px] text-slate-400 font-extrabold uppercase tracking-wider mt-0.5 block">Grid</span>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => setActiveTab("handovers")}
                      className="flex flex-col items-center justify-center p-3.5 rounded-2xl border border-slate-100 hover:border-amber-300 hover:bg-indigo-50/10 text-center gap-2 transition-all cursor-pointer bg-white shadow-card"
                    >
                      <div className="h-9 w-9 rounded-xl bg-indigo-50 flex items-center justify-center text-amber-700 shrink-0">
                        <Clock className="h-4.5 w-4.5" />
                      </div>
                      <div>
                        <span className="block text-[11px] font-black text-slate-800 leading-tight">Handover Logs</span>
                        <span className="text-[8px] text-slate-400 font-extrabold uppercase tracking-wider mt-0.5 block">History</span>
                      </div>
                    </button>
                  </div>
                </div>

                {/* Assigned Subjects breakdown */}
                {allMentorSubjects.length > 0 && (
                  <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-card space-y-3">
                    <h3 className="text-xs font-black text-slate-800 uppercase tracking-widest border-b border-slate-100 pb-2">My Subjects</h3>
                    <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
                      {allMentorSubjects.map((sub, idx) => {
                        const targetMins = subjectTargetMinutesMap[sub] || 0;
                        const coveredMins = subjectCoveredMinutesMap[sub] || 0;

                        return (
                          <div key={idx} className="p-3 rounded-xl bg-slate-50/50 border border-slate-100 flex flex-col gap-1.5">
                            <div className="flex justify-between items-start gap-2">
                              <span className="text-xs font-bold text-slate-800 line-clamp-1">{sub}</span>
                            </div>
                            <div className="flex gap-1.5">
                              {targetMins > 0 && (
                                <span className="px-2 py-0.5 rounded bg-zinc-100 border border-zinc-200 text-zinc-900 text-[8.5px] font-black uppercase">
                                  {toHrs(targetMins)} hr{toHrs(targetMins) !== '1' ? 's' : ''}/wk
                                </span>
                              )}
                              {coveredMins > 0 && (
                                <span className="px-2 py-0.5 rounded bg-teal-50 border border-teal-200 text-teal-700 text-[8.5px] font-black uppercase">
                                  +{toHrs(coveredMins)} hr{toHrs(coveredMins) !== '1' ? 's' : ''} substitution
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Recent Handover Activity */}
                <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-card space-y-3">
                  <h3 className="text-xs font-black text-slate-800 uppercase tracking-widest border-b border-slate-100 pb-2">Recent Handovers</h3>
                  {myRequests.length === 0 && myCoverageRequests.length === 0 ? (
                    <p className="text-[11px] text-slate-400 italic text-center py-4">No recent handover activity</p>
                  ) : (
                    <div className="space-y-2.5 max-h-[220px] overflow-y-auto pr-1">
                      {[...myRequests, ...myCoverageRequests]
                        .sort((a, b) => (b.timestamp || "").localeCompare(a.timestamp || ""))
                        .slice(0, 3)
                        .map((req, idx) => {
                          const isSent = req.requestorId === currentMentor.id;
                          const isPending = req.status === "pending";
                          const isAppr = req.status === "approved";

                          return (
                            <div key={idx} className="p-3 rounded-xl bg-slate-50/50 border border-slate-100 space-y-1.5 text-[11px]">
                              <div className="flex justify-between items-center gap-2">
                                <span className={`text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded ${isSent ? "bg-purple-50 text-purple-700 border border-purple-100" : "bg-blue-50 text-blue-700 border border-blue-100"
                                  }`}>
                                  {isSent ? "Sent Request" : "Incoming Cover"}
                                </span>
                                <span className={`text-[8.5px] font-black uppercase ${isAppr ? "text-emerald-600" : isPending ? "text-amber-600" : "text-rose-500"
                                  }`}>
                                  {req.status}
                                </span>
                              </div>
                              <p className="text-slate-700 font-medium">
                                {isSent ? `For: ${req.targetStaffName}` : `From: ${req.requestorName}`}
                              </p>
                              <p className="text-slate-500 text-[10px]">
                                {req.course} • {req.dateFormatted}
                              </p>
                            </div>
                          );
                        })}
                    </div>
                  )}
                </div>
              </div>
            </div>



          </>
        )}

        {/* Main Timetable Interface */}
        {activeTab === "timetable" && (
          <div id="timetable-grid" className="bg-white border border-slate-100 rounded-2xl p-6 space-y-6 backdrop-blur-md shadow-card">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex flex-wrap items-center gap-4">
                <div className="flex items-center gap-2">
                  <Calendar className="h-5 w-5 text-amber-600" />
                  <h2 className="text-lg font-bold text-gray-900">My Schedule</h2>
                </div>

                {/* Week Navigation */}
                <div className="flex items-center gap-1 bg-gray-100/80 p-1 rounded-xl border border-gray-200/60 shadow-inner">
                  <button
                    type="button"
                    onClick={() => setWeekOffset(weekOffset - 1)}
                    className="p-1.5 hover:bg-white rounded-lg text-gray-600 hover:text-amber-600 transition-all cursor-pointer"
                    title="Previous Week"
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                  </button>
                  <span className="text-[10px] font-bold text-gray-800 px-2 min-w-[130px] text-center select-none">
                    {effectiveWeekDates.some(d => d.dateStr === todayStr) ? "Current Week" : `${effectiveWeekDates[0]?.formatted} – ${effectiveWeekDates[effectiveWeekDates.length - 1]?.formatted}`}
                  </span>
                  <button
                    type="button"
                    onClick={() => setWeekOffset(weekOffset + 1)}
                    className="p-1.5 hover:bg-white rounded-lg text-gray-600 hover:text-amber-600 transition-all cursor-pointer"
                    title="Next Week"
                  >
                    <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                {/* Shift Selector - always shown, shift derived from slots */}
                <div className="flex bg-gray-50 p-1 rounded-xl border border-gray-200 shadow-inner">
                  <button
                    type="button"
                    onClick={() => setCurrentShift("shift_1")}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${currentShift === "shift_1"
                      ? "btn-gradient shadow-sm text-white"
                      : "text-gray-500 hover:text-gray-900"
                      }`}
                  >
                    Shift 1
                  </button>
                  <button
                    type="button"
                    onClick={() => setCurrentShift("shift_2")}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${currentShift === "shift_2"
                      ? "btn-gradient shadow-sm text-white"
                      : "text-gray-500 hover:text-gray-900"
                      }`}
                  >
                    Shift 2
                  </button>
                  <button
                    type="button"
                    onClick={() => setCurrentShift("general")}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${currentShift === "general"
                      ? "btn-gradient shadow-sm text-white"
                      : "text-gray-500 hover:text-gray-900"
                      }`}
                  >
                    General
                  </button>
                </div>
              </div>
            </div>

            {/* Timetable Control Center (Filters & Legends) - Always visible in Timetable Tab */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 bg-gray-50/50 p-5 rounded-xl border border-gray-100 shadow-inner text-xs">
              {/* 1. Status Filters */}
              <div className="space-y-2">
                <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest block">Status Filters</span>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedStatusFilter(selectedStatusFilter === "active" ? null : "active")}
                    className={`px-3 py-1.5 rounded-xl text-[10px] font-bold shadow-sm transition-all cursor-pointer flex items-center gap-2 border ${selectedStatusFilter === "active"
                      ? "bg-indigo-600 border-indigo-600 text-white hover:bg-indigo-700"
                      : "bg-white border-gray-200 text-gray-700 hover:bg-gray-50"
                      }`}
                  >
                    <span className={`h-2 w-2 rounded-full ${selectedStatusFilter === "active" ? "bg-white" : "bg-indigo-600"}`}></span>
                    My Active Class
                  </button>

                  <button
                    type="button"
                    onClick={() => setSelectedStatusFilter(selectedStatusFilter === "pending" ? null : "pending")}
                    className={`px-3 py-1.5 rounded-xl text-[10px] font-bold shadow-sm transition-all cursor-pointer flex items-center gap-2 border ${selectedStatusFilter === "pending"
                      ? "bg-amber-600 border-amber-600 text-white hover:bg-amber-700"
                      : "bg-amber-50/60 border-amber-300 text-amber-900 hover:bg-amber-100/40"
                      }`}
                  >
                    <span className={`h-2 w-2 rounded-full ${selectedStatusFilter === "pending" ? "bg-white" : "bg-amber-500"}`}></span>
                    Cover Pending
                  </button>

                  <button
                    type="button"
                    onClick={() => setSelectedStatusFilter(selectedStatusFilter === "handover" ? null : "handover")}
                    className={`px-3 py-1.5 rounded-xl text-[10px] font-bold shadow-sm transition-all cursor-pointer flex items-center gap-2 border ${selectedStatusFilter === "handover"
                      ? "bg-blue-600 border-blue-600 text-white hover:bg-blue-700"
                      : "bg-blue-50/50 border-blue-200 text-blue-900 hover:bg-blue-100/40"
                      }`}
                  >
                    <span className={`h-2 w-2 rounded-full ${selectedStatusFilter === "handover" ? "bg-white" : "bg-blue-500"}`}></span>
                    Handed Over / Covering
                  </button>
                </div>
              </div>

              {/* 2. Location Legends */}
              {uniqueLocations.length > 0 && (
                <div className="space-y-2">
                  <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest block">Location Legends</span>
                  <div className="flex flex-wrap gap-2">
                    {uniqueLocations.map((loc, idx) => {
                      const isSelected = selectedLocationFilter === loc;
                      return (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => setSelectedLocationFilter(selectedLocationFilter === loc ? null : loc)}
                          className={`px-3 py-1.5 rounded-xl text-[10px] font-bold shadow-sm transition-all cursor-pointer flex items-center gap-2 border ${isSelected
                            ? "bg-purple-600 border-purple-600 text-white hover:bg-purple-700"
                            : "bg-purple-50/50 border-purple-200 text-purple-900 hover:bg-purple-100/40"
                            }`}
                        >
                          <span className={`h-2 w-2 rounded-full ${isSelected ? "bg-white" : "bg-purple-500"}`}></span>
                          {loc}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* 3. Target Classes Buttons */}
              {uniqueClassLabels.length > 0 && (
                <div className="space-y-2">
                  <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest block">Target Classes (Semesters)</span>
                  <div className="flex flex-wrap gap-2">
                    {uniqueClassLabels.map((displayLabel, idx) => {
                      const isSelected = selectedClassFilter === displayLabel;
                      return (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => handleClassFilterClick(displayLabel)}
                          className={`px-3 py-1.5 rounded-xl text-[10px] font-bold shadow-sm transition-all cursor-pointer border ${isSelected
                            ? "bg-teal-600 border-teal-600 text-white hover:bg-teal-700 shadow-inner"
                            : "bg-teal-50 border-teal-100 text-teal-700 hover:bg-teal-100/60"
                            }`}
                        >
                          {displayLabel}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            <div className="overflow-auto max-h-[70vh] rounded-xl border border-gray-200 shadow-sm relative no-scrollbar">
              {/* Weekly Grid Table View */}
              <table className="w-full table-fixed border-collapse text-left min-w-[950px]">
                <thead>
                  <tr className="text-xs font-bold uppercase border-b border-gray-200">
                    <th className="sticky top-0 left-0 z-30 p-4 text-gray-500 bg-gray-100/95 backdrop-blur-xs border-r border-b border-gray-200 w-[12%]">Day / Date</th>
                    {(() => {
                      let slotCounter = 0;
                      return rows.map((col, idx) => {
                        if (col.type === "break" || col.type === "lunch") {
                          return (
                            <th key={idx} className="sticky top-0 z-20 p-4 text-xs font-bold text-gray-400 uppercase tracking-wider text-center select-none bg-gray-50/95 backdrop-blur-xs border-b border-gray-200 w-[8%]">
                              <div>{col.label}</div>
                              <div className="text-[9px] text-gray-400 font-normal mt-0.5">{formatTimeLabel(col.timeRange)}</div>
                            </th>
                          );
                        }
                        if (col.type === "slot") {
                          slotCounter++;
                          return (
                            <th key={col.time} className="sticky top-0 z-20 p-4 text-xs font-bold text-gray-700 bg-gray-50/95 backdrop-blur-xs border-b border-gray-200 w-[12%]">
                              <div>Period {slotCounter}</div>
                              <div className="text-[10px] text-gray-400 font-normal mt-0.5">{formatTimeLabel(col.time)}</div>
                            </th>
                          );
                        }
                        return null;
                      });
                    })()}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 bg-white">
                  {effectiveWeekDates.map((date) => {
                    return (
                      <tr key={date.day} className="h-24 hover:bg-gray-50/10 transition-colors">
                        {/* First Cell: Day / Date */}
                        <td className="sticky left-0 z-10 p-3 text-xs font-bold text-gray-700 border-r border-gray-200 bg-gray-50/95 backdrop-blur-xs align-middle">
                          <div className="flex flex-col justify-center items-center">
                            <span className="text-sm font-black text-gray-900 leading-none">{date.day}</span>
                            <span className="text-[9px] text-gray-400 font-extrabold uppercase mt-1 leading-none">{date.formatted}</span>
                            {mentorInterviews.some((inv: any) => inv.target_date === date.dateStr) && (
                              <span className="mt-1.5 px-1.5 py-0.5 rounded-full text-[8px] font-black uppercase bg-purple-100 text-purple-700 border border-purple-200 shrink-0">
                                Interview
                              </span>
                            )}
                            {(() => {
                              const cfg = dailyConfigsMap.get(date.dateStr);
                              if (!cfg || !cfg.day_type) {
                                return (
                                  <span className="mt-1.5 px-1.5 py-0.5 rounded-full text-[8px] font-black uppercase bg-amber-100 text-amber-700 border border-amber-200 shrink-0 text-center leading-tight" title="Day order not configured by CM">
                                    No Order
                                  </span>
                                );
                              }
                              if (cfg.day_type === "holiday") {
                                return (
                                  <span className="mt-1.5 px-1.5 py-0.5 rounded-full text-[8px] font-black uppercase bg-rose-100 text-rose-700 border border-rose-200 shrink-0" title={cfg.notes || "Holiday"}>
                                    Holiday
                                  </span>
                                );
                              }
                              if (cfg.day_type === "event") {
                                return (
                                  <span className="mt-1.5 px-1.5 py-0.5 rounded-full text-[8px] font-black uppercase bg-amber-50 text-amber-700 border border-amber-200 shrink-0" title={cfg.notes || "Campus Event"}>
                                    Event
                                  </span>
                                );
                              }
                              if (cfg.day_type === "exam_day") {
                                return (
                                  <span className="mt-1.5 px-1.5 py-0.5 rounded-full text-[8px] font-black uppercase bg-purple-50 text-purple-700 border border-purple-200 shrink-0" title={cfg.notes || "Exam Day"}>
                                    Exam
                                  </span>
                                );
                              }
                              if (cfg.day_order && cfg.day_order !== "None") {
                                return (
                                  <span className="mt-1.5 px-1.5 py-0.5 rounded-full text-[8px] font-black uppercase bg-amber-50 text-amber-800 border border-indigo-200 shrink-0">
                                    {cfg.day_order}
                                  </span>
                                );
                              }
                              return (
                                <span className="mt-1.5 px-1.5 py-0.5 rounded-full text-[8px] font-black uppercase bg-amber-100 text-amber-700 border border-amber-200 shrink-0 text-center leading-tight" title="Day order not configured by CM">
                                  No Order
                                </span>
                              );
                            })()}
                          </div>
                        </td>

                        {/* Columns */}
                        {rows.map((col, cIdx) => {
                          if (col.type === "break" || col.type === "lunch") {
                            return (
                              <td
                                key={`break-${cIdx}`}
                                className="p-2 text-center text-xs font-extrabold text-gray-500 bg-gray-50/5 uppercase tracking-widest italic select-none border-r border-gray-100 last:border-r-0 align-middle"
                              >
                                {col.label}
                              </td>
                            );
                          }

                          if (col.type !== "slot") return null;
                          const time = col.time;
                          const cellData = timetableCellMap.get(`${date.dateStr}|${time}`);
                          const slotResult = cellData?.slot ? { slot: cellData.slot, type: cellData.type, demoSession: cellData.demoSession, originalMentorId: cellData.originalMentorId, handover: cellData.approvedReq } : null;
                          const slot = cellData?.slot;
                          const isOwn = cellData?.type === "own";
                          const isCovering = cellData?.type === "covering";
                          const isDemo = cellData?.type === "demo";
                          const demoSession = cellData?.demoSession;

                          if (isDemo && demoSession) {
                            return (
                              <td key={time} className="p-1.5 h-24 border-r border-gray-100 last:border-r-0 transition-all bg-pink-50/20">
                                <div className="h-full flex flex-col justify-between p-2 rounded-xl border border-pink-200 bg-pink-50/70 text-xs shadow-2xs">
                                  <div>
                                    <div className="flex items-center justify-between gap-1 mb-1">
                                      <span className="px-1.5 py-0.5 rounded bg-indigo-600 text-[8px] font-black text-white uppercase tracking-wide">
                                        DEMO PRESENTATION
                                      </span>
                                      <span className={`text-[7.5px] font-black uppercase px-1 py-0.5 rounded ${demoSession.status === "completed" ? "bg-emerald-100 text-emerald-800" :
                                        demoSession.status === "reallocation_required" ? "bg-amber-100 text-amber-800" :
                                          "bg-pink-100 text-pink-700"
                                        }`}>
                                        {demoSession.status}
                                      </span>
                                    </div>
                                    <div className="font-extrabold text-[10.5px] text-pink-950 line-clamp-1 leading-tight mb-0.5">
                                      {demoSession.subject}
                                    </div>
                                    <div className="text-[9px] text-pink-700 font-bold truncate">
                                      SME: {demoSession.smeName}
                                    </div>
                                  </div>
                                  <div className="text-[8.5px] text-pink-600 font-semibold truncate pt-1 border-t border-pink-100">
                                    Cohort: {demoSession.stream || "Group"}
                                  </div>
                                </div>
                              </td>
                            );
                          }

                          if (cellData?.type === "exam") {
                            const examInfo = cellData.exam;
                            const hasAtt = cellData.hasAttendance;
                            return (
                              <td key={time} className="p-1.5 h-24 border-r border-gray-100 last:border-r-0 transition-all bg-purple-50/20">
                                <div
                                  onClick={() => {
                                    if (slot) {
                                      handleCellClick(date.day, date.dateStr, date.formatted, time);
                                    }
                                  }}
                                  className="h-full flex flex-col justify-between p-2 rounded-xl border border-purple-300 bg-purple-50/70 text-xs shadow-2xs cursor-pointer hover:border-purple-400 transition-all"
                                >
                                  <div>
                                    <div className="flex items-center justify-between gap-1 mb-1">
                                      <span className="px-1.5 py-0.5 rounded bg-purple-600 text-[8px] font-black text-white uppercase tracking-wide">
                                        📝 {examInfo?.exam_type || "EXAMINATION"}
                                      </span>
                                      {examInfo?.hall_room && (
                                        <span className="text-[7.5px] font-bold text-purple-700 truncate max-w-[80px]">
                                          📍 {examInfo.hall_room}
                                        </span>
                                      )}
                                    </div>
                                    <div className="font-extrabold text-[10px] text-purple-950 line-clamp-1 leading-tight mb-0.5">
                                      {examInfo?.subject_name || slot?.course || "Assessment Session"}
                                    </div>
                                  </div>
                                  <div className="flex items-center justify-between text-[8px] mt-1 pt-1 border-t border-purple-200/60 font-black uppercase">
                                    <span className="text-purple-700 font-mono">
                                      {examInfo?.session_time || formatTimeLabel(time)}
                                    </span>
                                    {hasAtt ? (
                                      <span className="px-1.5 py-0.5 rounded text-[7.5px] bg-emerald-100 text-emerald-800 border border-emerald-300">
                                        Marked
                                      </span>
                                    ) : (
                                      <span className="px-1.5 py-0.5 rounded text-[7.5px] bg-purple-100 text-purple-800 border border-purple-300">
                                        Mark Exam Att
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </td>
                            );
                          }

                          // Check Handover state for this slot on this date — use pre-computed values
                          const pendingReq = cellData?.pendingReq ?? null;
                          const approvedReq = cellData?.approvedReq ?? null;
                          const hasAttendance = cellData?.hasAttendance ?? false;

                          let cellStatus: "active" | "pending" | "handover" | null = cellData?.cellStatus ?? null;

                          // Filters already applied in timetableCellMap — no need to re-check
                          const isFilteredOut = !slot;

                          const isFuture = date.dateStr > todayStr || (date.dateStr === todayStr && (() => {
                            const periodStart = parseSlotStartTime(time);
                            return periodStart ? new Date() < periodStart : false;
                          })());

                          let cardClass = "";
                          if (hasAttendance) {
                            cardClass = "bg-emerald-50/30 border-emerald-200 text-emerald-950 hover:border-emerald-400";
                          } else if (!isFuture) {
                            cardClass = "bg-amber-50/20 border-amber-300 text-amber-950 hover:border-amber-400";
                          } else if (isCovering || approvedReq) {
                            cardClass = "bg-blue-50/40 border-blue-200 text-blue-900 hover:border-blue-300";
                          } else if (pendingReq) {
                            cardClass = "bg-amber-50/50 border-amber-300 text-amber-900 hover:border-amber-400";
                          } else {
                            cardClass = "bg-white border-slate-200 text-slate-700 hover:border-indigo-400";
                          }

                          return (
                            <td
                              key={time}
                              onClick={slot && !isFilteredOut ? () => handleCellClick(date.day, date.dateStr, date.formatted, time) : undefined}
                              className={`p-1.5 h-24 border-r border-gray-100 last:border-r-0 transition-all ${slot && !isFilteredOut ? "cursor-pointer hover:bg-gray-50/50" : isFilterActive ? "bg-white" : "bg-gray-50/10"
                                }`}
                            >
                              {slot && !isFilteredOut ? (
                                <div className={`h-full flex flex-col justify-between p-2 rounded-xl border text-xs transition-all shadow-sm ${cardClass}`}>
                                  <div>
                                    {(() => {
                                      const { name, sem } = getShortClassGroup(slot.classGroup);
                                      const yearStr = getYearForClass(slot.classGroup);
                                      const calculatedSem = sem || getSemForClass(slot.classGroup) || (slot.course ? getShortSemLabel(getSemesterFromSlot(slot)) : "");
                                      return (
                                        <div className="flex flex-wrap items-center gap-1 mb-1.5 max-w-full">
                                          {/* Department Badge */}
                                          <span className="px-1.2 py-0.5 rounded bg-indigo-50 border border-indigo-100 text-[8px] font-black text-amber-700 uppercase tracking-wide truncate max-w-[50px]" title={name}>
                                            {name}
                                          </span>
                                          {/* Year Badge */}
                                          {yearStr && (
                                            <span className="px-1 py-0.5 rounded bg-amber-50 border border-amber-300 text-[7.5px] font-black text-amber-700 uppercase shrink-0">
                                              {yearStr.replace(" Year", " Yr")}
                                            </span>
                                          )}
                                          {/* Semester Badge */}
                                          {calculatedSem && (
                                            <span className="px-1 py-0.5 rounded bg-teal-50 border border-teal-200 text-[7.5px] font-black text-teal-700 uppercase shrink-0">
                                              {calculatedSem}
                                            </span>
                                          )}
                                        </div>
                                      );
                                    })()}

                                    <div className="font-extrabold text-[10.5px] text-gray-800 line-clamp-2 leading-tight mb-1" title={approvedReq?.course || slot.course}>
                                      {getCanonicalSubjectName(approvedReq?.course || slot.course)}
                                    </div>
                                    <div className="flex items-center gap-1 text-[10px] text-gray-600">
                                      <MapPin className="h-2.5 w-2.5 shrink-0 text-gray-400" />
                                      <span className="truncate font-semibold">{slot.location}</span>
                                    </div>
                                  </div>

                                  <div className="flex items-center justify-between text-[9px] mt-1 pt-1.5 border-t border-slate-100 font-semibold">
                                    {hasAttendance ? (
                                      <span className="text-[8.5px] font-bold text-emerald-600 flex items-center gap-0.5">
                                        <CheckCircle className="h-3.5 w-3.5 shrink-0" /> Marked
                                      </span>
                                    ) : (() => {
                                      const windowCheck = checkAttendanceWindow(date.dateStr, time);
                                      const camKey = `${slot.id}|${date.dateStr}`;
                                      const approvedLateCamReq = lateAttendanceCamApprovedSet.has(camKey);
                                      const pendingLateCamReq = lateAttendanceCamPendingSet.has(camKey);
                                      const isDeadlineExpired = !windowCheck.open && windowCheck.reason === "expired" && !approvedLateCamReq;

                                      if (pendingLateCamReq) {
                                        return (
                                          <span className="text-[8.5px] font-black text-amber-700 flex items-center gap-0.5 uppercase tracking-wider">
                                            ⏰ CM Pending
                                          </span>
                                        );
                                      }
                                      if (approvedLateCamReq) {
                                        return (
                                          <span className="text-[8.5px] font-black text-emerald-700 flex items-center gap-0.5 uppercase tracking-wider">
                                            🔓 Unlocked
                                          </span>
                                        );
                                      }
                                      if (isDeadlineExpired) {
                                        return (
                                          <span className="text-[8.5px] font-black text-rose-700 flex items-center gap-0.5 uppercase tracking-wider">
                                            ⏰ Request CM
                                          </span>
                                        );
                                      }
                                      if (!isFuture) {
                                        return (
                                          <span className="text-[8.5px] font-black text-amber-700 flex items-center gap-0.5 uppercase tracking-wider">
                                            Pending
                                          </span>
                                        );
                                      }
                                      if (isCovering) {
                                        return (
                                          <span className="text-blue-600 flex items-center gap-0.5 truncate">
                                            Cover: {mentors.find(m => m.id === cellData?.originalMentorId)?.name?.split(" ")[0] || "Staff"}
                                          </span>
                                        );
                                      }
                                      if (approvedReq) {
                                        return (
                                          <span className="text-blue-600 flex items-center gap-0.5 truncate">
                                            Covered: {approvedReq.coverStaffName?.split(" ")[0] || "Staff"}
                                          </span>
                                        );
                                      }
                                      if (pendingReq) {
                                        return (
                                          <span className="text-amber-600 truncate">
                                            Cover Pending
                                          </span>
                                        );
                                      }
                                      return <span className="text-gray-500">My Class</span>;
                                    })()}

                                    <span className={`px-1.5 py-0.5 rounded-sm text-[7.5px] font-extrabold uppercase ${isCovering || approvedReq
                                      ? 'bg-blue-100 text-blue-700 border border-blue-200/50'
                                      : pendingReq
                                        ? 'bg-amber-100 text-amber-700 border border-amber-200/50'
                                        : 'bg-amber-50 text-amber-800 border border-indigo-100'
                                      }`}>
                                      {isCovering ? 'Covering' : approvedReq ? 'Handed Over' : pendingReq ? 'Pending' : 'Active'}
                                    </span>
                                  </div>
                                </div>
                              ) : (() => {
                                // Check for scheduled interview session on this date & period
                                const interviewSession = mentorInterviews?.find((inv: any) => {
                                  if (inv.target_date !== date.dateStr) return false;
                                  const prefTime = inv.preferred_start_time || "08:20 AM - 09:10 AM";
                                  const slotTimeNorm = time.replace(/\s+/g, "").toLowerCase();
                                  const prefTimeNorm = prefTime.replace(/\s+/g, "").toLowerCase();
                                  if (slotTimeNorm.includes(prefTimeNorm) || prefTimeNorm.includes(slotTimeNorm)) return true;

                                  // Check student slots for this mentor on this time
                                  if (inv.student_slots && inv.student_slots.some((s: any) => s.mentor_id === currentMentor.id && (s.slot_start_time?.includes(time) || time.includes(s.slot_start_time)))) return true;

                                  // Match by start hour (e.g. 8.20 / 08:20 or 9.00 / 09:00)
                                  const startHourMin = prefTime.split("-")[0].trim().toLowerCase().replace(".", ":");
                                  const cellStartHourMin = time.split("-")[0].trim().toLowerCase().replace(".", ":");
                                  if (startHourMin && cellStartHourMin && (startHourMin.includes(cellStartHourMin) || cellStartHourMin.includes(startHourMin))) return true;

                                  // If session is assigned to mentor and this is Period 1 (8.20 AM / 9.00 AM):
                                  if ((time.startsWith("8.20") || time.startsWith("08:20") || time.startsWith("9.00") || time.startsWith("09:00")) && (inv.status === "assigned" || inv.status === "completed" || inv.status === "pending_verification")) return true;

                                  return false;
                                });

                                if (interviewSession) {
                                  const isCompleted = interviewSession.status === "completed";
                                  const isEvaluator = interviewSession.student_slots?.some((s: any) => s.mentor_id === currentMentor.id) ||
                                    interviewSession.assigned_mentor_ids?.includes(currentMentor.id);
                                  const mySlots = (interviewSession.student_slots || []).filter((s: any) => s.mentor_id === currentMentor.id);
                                  const myCandidateCount = mySlots.length > 0 ? mySlots.length : (interviewSession.allocated_students || interviewSession.student_count || 3);
                                  const isInternal = interviewSession.type === "internal" || mySlots[0]?.mode === "in_person";
                                  const meetLink = !isInternal ? (mySlots[0]?.gmeet_link || interviewSession.gmeet_link) : null;

                                  return (
                                    <div
                                      onClick={() => setActiveTab("interviews")}
                                      className={`h-full flex flex-col justify-between p-2 rounded-xl border text-xs shadow-xs transition-all cursor-pointer ${isCompleted
                                        ? "bg-emerald-50/80 border-emerald-300 text-emerald-950 hover:border-emerald-400"
                                        : "bg-purple-50/80 border-purple-300 text-purple-950 hover:border-purple-400 hover:shadow-sm"
                                        }`}
                                    >
                                      <div>
                                        <div className="flex flex-wrap items-center gap-1 mb-1 max-w-full">
                                          <span className="px-1.5 py-0.5 rounded bg-purple-200/80 border border-purple-300 text-[7.5px] font-black text-purple-800 uppercase tracking-wide">
                                            INTERVIEW ({interviewSession.type?.toUpperCase() || "EXTERNAL"})
                                          </span>
                                          <span className="text-[7.5px] font-bold text-purple-600">
                                            {isEvaluator ? `Evaluator` : `Host Raiser`}
                                          </span>
                                        </div>
                                        <div className="font-extrabold text-[10.5px] leading-tight mb-1 text-purple-950 line-clamp-2" title={interviewSession.subject}>
                                          {interviewSession.subject}
                                        </div>
                                        <div className="text-[8.5px] text-purple-700 font-semibold truncate leading-none">
                                          {interviewSession.class_group || "Cohort"} • {myCandidateCount} Candidates
                                        </div>
                                      </div>

                                      <div className="flex items-center justify-between text-[8px] mt-1 pt-1.5 border-t border-purple-200/60 font-black uppercase">
                                        {!isInternal && meetLink ? (
                                          <a
                                            href={meetLink}
                                            target="_blank"
                                            rel="noreferrer"
                                            onClick={(e) => e.stopPropagation()}
                                            className="text-amber-600 hover:underline inline-flex items-center gap-0.5 font-bold"
                                          >
                                            <Video className="w-2.5 h-2.5" /> GMeet
                                          </a>
                                        ) : (
                                          <span className="text-purple-600 font-mono">{isInternal ? "In-Person" : "15m Slots"}</span>
                                        )}
                                        <span className={`px-1.5 py-0.5 rounded text-[7.5px] ${isCompleted
                                          ? "bg-emerald-100 text-emerald-800 border border-emerald-300"
                                          : "bg-purple-100 text-purple-800 border border-purple-300"
                                          }`}>
                                          {isCompleted ? "Completed" : "Scheduled"}
                                        </span>
                                      </div>
                                    </div>
                                  );
                                }

                                const demoSession = demoSessions?.find(
                                  (ds) =>
                                    ds.mentorId === currentMentor.id &&
                                    ds.dateStr === date.dateStr &&
                                    ds.timeSlot === time
                                );
                                if (demoSession) {
                                  const isCompleted = demoSession.status === "completed";
                                  return (
                                    <div className={`h-full flex flex-col justify-between p-2 rounded-xl border text-xs shadow-sm ${isCompleted
                                      ? "bg-emerald-50/70 border-emerald-200 text-emerald-900"
                                      : "bg-pink-50/50 border-pink-200 text-pink-900"
                                      }`}>
                                      <div>
                                        <div className="flex flex-wrap items-center gap-1 mb-1 max-w-full">
                                          <span className="px-1.5 py-0.5 rounded bg-pink-100 dark:bg-pink-950 border border-pink-200 text-[7px] font-black text-pink-700 dark:text-pink-400 uppercase tracking-wide">
                                            Demo Review
                                          </span>
                                          <span className="text-[7.5px] font-black text-pink-400">Week {demoSession.week}</span>
                                        </div>
                                        <div className="font-extrabold text-[10px] leading-tight mb-1 text-gray-800 dark:text-white line-clamp-1">
                                          {demoSession.subject}
                                        </div>
                                        <div className="text-[8px] text-gray-500 font-semibold truncate leading-none">
                                          SME: {demoSession.smeName}
                                        </div>
                                      </div>
                                      <div className="flex items-center justify-between text-[7.5px] mt-1 pt-1.5 border-t border-slate-100 dark:border-slate-800 font-black uppercase">
                                        {isCompleted ? (
                                          <span className="text-emerald-600">Score: {demoSession.marks}</span>
                                        ) : (
                                          <span className="text-pink-600">Scheduled</span>
                                        )}
                                      </div>
                                    </div>
                                  );
                                }
                                return isFilterActive ? null : (
                                  <div className="h-full flex items-center justify-center border border-dashed border-gray-200 rounded-xl bg-gray-50/10">
                                    <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">No class</span>
                                  </div>
                                );
                              })()}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Handover Requests Tracker */}
        {activeTab === "handovers" && (
          <div className="bg-white border border-slate-100 rounded-2xl p-6 backdrop-blur-md shadow-card space-y-8">
            <div className="flex items-center gap-2 mb-2">
              <ListTodo className="h-5 w-5 text-amber-700" />
              <h2 className="text-lg font-bold text-gray-900">Handovers</h2>
            </div>

            {/* Section 1: Requests Sent */}
            <div className="space-y-3">
              <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest">Handovers Requested By You (Sent)</h3>
              {myRequests.length === 0 ? (
                <div className="text-center py-6 border border-gray-100 rounded-xl bg-gray-50/50">
                  <p className="text-xs text-gray-500">No sent handover requests submitted yet.</p>
                </div>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-gray-200 shadow-sm">
                  <table className="w-full border-collapse text-left text-xs">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-200 text-gray-500 font-bold uppercase text-[10px]">
                        <th className="p-3">Handover Date</th>
                        <th className="p-3">Course / Time</th>
                        <th className="p-3">Covering Staff</th>
                        <th className="p-3">Reason</th>
                        <th className="p-3">Approval Status</th>
                        <th className="p-3">Timestamp</th>
                        <th className="p-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 bg-white">
                      {myRequests.map((req) => (
                        <tr key={req.id} className="hover:bg-gray-50/50 transition-colors">
                          <td className="p-3 font-bold text-gray-800">
                            <span className="flex items-center gap-1">
                              <CalendarCheck2 className="h-3.5 w-3.5 text-amber-700" />
                              {req.dateFormatted} ({req.dateStr})
                            </span>
                          </td>
                          <td className="p-3">
                            {(() => {
                              const { name, sem } = getShortClassGroup(req.classGroup);
                              const yearStr = getYearForClass(req.classGroup);
                              return (
                                <div className="flex items-center gap-1.5 flex-wrap mb-1">
                                  <span className="px-1.5 py-0.5 rounded bg-indigo-50 border border-indigo-100 text-[8.5px] font-black text-amber-700 uppercase tracking-wide truncate max-w-[120px]" title={name}>
                                    {name}
                                  </span>
                                  {yearStr && (
                                    <span className="px-1.5 py-0.5 rounded bg-amber-50 border border-amber-200 text-[8px] font-black text-amber-700 uppercase shrink-0">
                                      {yearStr}
                                    </span>
                                  )}
                                  {sem && (
                                    <span className="px-1.5 py-0.5 rounded bg-teal-50 border border-teal-200 text-[8px] font-black text-teal-700 uppercase shrink-0">
                                      {sem}
                                    </span>
                                  )}
                                </div>
                              );
                            })()}
                            <div className="font-bold text-gray-900">{req.course}</div>
                            <div className="text-[10px] text-gray-500">{req.day}, {formatTimeLabel(req.time)}</div>
                          </td>
                          <td className="p-3 font-bold text-gray-800">
                            <span className="flex items-center gap-1">
                              <UserCheck className="h-3.5 w-3.5 text-amber-700" />
                              {req.targetStaffName}
                            </span>
                          </td>
                          <td className="p-3 max-w-xs truncate text-gray-600 italic" title={req.reason}>
                            &ldquo;{req.reason}&rdquo;
                          </td>
                          <td className="p-3">
                            <div className="space-y-1">
                              <span className={`inline-flex items-center px-2.5 py-0.5 rounded text-[9px] font-extrabold uppercase ${req.status === "approved"
                                ? "bg-teal-100 text-teal-800 border border-teal-200/50"
                                : req.status === "rejected"
                                  ? "bg-red-100 text-red-800 border border-red-200/50"
                                  : isAwaitingCm(req.status)
                                    ? "bg-indigo-100 text-indigo-800 border border-indigo-200/50"
                                    : "bg-amber-100 text-amber-800 border border-amber-200/50"
                                }`}>
                                {isAwaitingCm(req.status) ? "Awaiting CM Approval" : req.status}
                              </span>
                              {req.headerReason && (
                                <div className="text-[9px] text-gray-500 border-l-2 border-gray-200 pl-1.5 mt-1">
                                  <strong>Note:</strong> {req.headerReason}
                                </div>
                              )}
                            </div>
                          </td>
                          <td className="p-3 text-gray-500 font-medium">
                            {formatDate(req.timestamp)}
                          </td>
                          <td className="p-3 text-right">
                            {(isAnyPendingCmRequest(req.status)) && (
                              <button
                                type="button"
                                onClick={async () => { const r = await cancelRequest(req.id); toast(r.message, r.success ? "success" : "error"); }}
                                className="px-2.5 py-1.5 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 hover:text-red-700 border border-red-200 transition-colors inline-flex items-center gap-1 text-[10px] font-bold shadow-sm"
                                title="Cancel Request"
                              >
                                <XCircle className="h-3.5 w-3.5" />
                                Cancel
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>



            {/* Section 2: Requests Received */}
            <div className="space-y-3 pt-2">
              <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest">Coverage Tasks Assigned To You (Received)</h3>
              {myCoverageRequests.length === 0 ? (
                <div className="text-center py-6 border border-gray-100 rounded-xl bg-gray-50/50">
                  <p className="text-xs text-gray-500">No coverage tasks assigned to you yet.</p>
                </div>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-gray-200 shadow-sm">
                  <table className="w-full border-collapse text-left text-xs">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-200 text-gray-500 font-bold uppercase text-[10px]">
                        <th className="p-3">Handover Date</th>
                        <th className="p-3">Course / Time</th>
                        <th className="p-3">Requestor (Staff)</th>
                        <th className="p-3">Reason</th>
                        <th className="p-3">Approval Status</th>
                        <th className="p-3">Actions</th>
                        <th className="p-3">Timestamp</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 bg-white">
                      {myCoverageRequests.map((req) => (
                        <tr key={req.id} className="hover:bg-gray-50/50 transition-colors">
                          <td className="p-3 font-bold text-gray-800">
                            <span className="flex items-center gap-1">
                              <CalendarCheck2 className="h-3.5 w-3.5 text-amber-700" />
                              {req.dateFormatted} ({req.dateStr})
                            </span>
                          </td>
                          <td className="p-3">
                            {(() => {
                              const { name, sem } = getShortClassGroup(req.classGroup);
                              const yearStr = getYearForClass(req.classGroup);
                              return (
                                <div className="flex items-center gap-1.5 flex-wrap mb-1">
                                  <span className="px-1.5 py-0.5 rounded bg-indigo-50 border border-indigo-100 text-[8.5px] font-black text-amber-700 uppercase tracking-wide truncate max-w-[120px]" title={name}>
                                    {name}
                                  </span>
                                  {yearStr && (
                                    <span className="px-1.5 py-0.5 rounded bg-amber-50 border border-amber-200 text-[8px] font-black text-amber-700 uppercase shrink-0">
                                      {yearStr}
                                    </span>
                                  )}
                                  {sem && (
                                    <span className="px-1.5 py-0.5 rounded bg-teal-50 border border-teal-200 text-[8px] font-black text-teal-700 uppercase shrink-0">
                                      {sem}
                                    </span>
                                  )}
                                </div>
                              );
                            })()}
                            <div className="font-bold text-gray-900">{req.course}</div>
                            <div className="text-[10px] text-gray-500">{req.day}, {formatTimeLabel(req.time)}</div>
                          </td>
                          <td className="p-3 font-bold text-gray-800">
                            <div className="flex flex-col gap-1">
                              <span className="flex items-center gap-1">
                                <UserCheck className="h-3.5 w-3.5 text-amber-700" />
                                {req.requestorName}
                              </span>
                              {req.request_type === "swap_compensate" && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-indigo-100 border border-indigo-200 text-amber-700 text-[8.5px] font-black uppercase tracking-wide w-fit">
                                  ↔ Swap Offer — Compensation
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="p-3 max-w-xs truncate text-gray-600 italic" title={req.reason}>
                            {req.request_type === "swap_compensate" ? (
                              <span className="text-amber-700 not-italic font-semibold">
                                {req.requestorName.split(" ")[0]} is offering this class as compensation for a past handover.
                              </span>
                            ) : (
                              <>&ldquo;{req.reason}&rdquo;</>
                            )}
                          </td>
                          <td className="p-3">
                            <div className="space-y-1">
                              <span className={`inline-flex items-center px-2.5 py-0.5 rounded text-[9px] font-extrabold uppercase ${req.status === "approved"
                                ? "bg-teal-100 text-teal-800 border border-teal-200/50"
                                : req.status === "rejected"
                                  ? "bg-red-100 text-red-800 border border-red-200/50"
                                  : "bg-amber-100 text-amber-800 border border-amber-200/50"
                                }`}>
                                {req.status}
                              </span>
                              {req.headerReason && (
                                <div className="text-[9px] text-gray-500 border-l-2 border-gray-200 pl-1.5 mt-1">
                                  <strong>Note:</strong> {req.headerReason}
                                </div>
                              )}
                            </div>
                          </td>
                          <td className="p-3">
                            {req.status === "pending" ? (
                              <div className="flex gap-2">
                                <button
                                  type="button"
                                  disabled={resolvingHandoverReqId === req.id}
                                  onClick={async () => {
                                    if (resolvingHandoverReqId) return;
                                    if (await showConfirm({ message: "Are you sure you want to accept this handover request?", confirmLabel: "Accept" })) {
                                      setResolvingHandoverReqId(req.id);
                                      try {
                                        await handleRequest(req.id, "approved", "", "Mentor", req.course);
                                        toast("Handover request accepted.", "success");
                                      } catch (err: any) {
                                        toast(err?.message || "Failed to accept the handover request.", "error");
                                      } finally {
                                        setResolvingHandoverReqId(null);
                                      }
                                    }
                                  }}
                                  className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[9.5px] font-bold shadow-sm transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                  Accept
                                </button>
                                <button
                                  type="button"
                                  disabled={resolvingHandoverReqId === req.id}
                                  onClick={async () => {
                                    if (resolvingHandoverReqId) return;
                                    if (await showConfirm({ message: "Are you sure you want to reject this handover request?", danger: true, confirmLabel: "Reject" })) {
                                      setResolvingHandoverReqId(req.id);
                                      try {
                                        await handleRequest(req.id, "rejected", "", "Mentor");
                                        toast("Handover request rejected.", "info");
                                      } catch (err: any) {
                                        toast(err?.message || "Failed to reject the handover request.", "error");
                                      } finally {
                                        setResolvingHandoverReqId(null);
                                      }
                                    }
                                  }}
                                  className="px-2.5 py-1.5 bg-red-50 hover:bg-red-100 border border-red-200 text-red-700 rounded-lg text-[9.5px] font-bold shadow-sm transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                  Reject
                                </button>
                              </div>
                            ) : (
                              <span className="text-[10px] text-gray-400 font-semibold italic uppercase">
                                {req.status}
                              </span>
                            )}
                          </td>
                          <td className="p-3 text-gray-500 font-medium whitespace-nowrap">
                            {formatDate(req.timestamp)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>


          </div>
        )}



        {/* Tab 4: My Profile */}
        {activeTab === "profile" && (
          <div className="space-y-6 font-sans">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Profile Summary Card */}
              <div className="bg-pastel-cream p-6 rounded-2xl border-transparent shadow-card flex flex-col items-center justify-between text-center min-h-[300px] group hover:shadow-card-lg transition-all duration-300">
                <div className="flex flex-col items-center space-y-4 w-full">
                  <div className="h-20 w-20 rounded-full bg-indigo-600 border-4 border-white text-white flex items-center justify-center text-3xl font-black shadow-md uppercase">
                    {currentMentor.name.substring(0, 2)}
                  </div>
                  <div>
                    <h2 className="text-lg font-extrabold text-slate-900 leading-tight">{currentMentor.name}</h2>
                    <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mt-1">Faculty Mentor Profile</p>
                  </div>
                  <div className="flex flex-wrap justify-center gap-1.5 pt-1">
                    <span className="px-2 py-0.5 rounded bg-white/80 border border-slate-100 text-[9px] font-black text-slate-700 uppercase">
                      Faculty Mentor
                    </span>
                    <span className="px-2 py-0.5 rounded bg-white/80 border border-slate-100 text-[9px] font-black text-slate-700 uppercase inline-flex items-center gap-1">
                      <span>{currentMentor.mentor_group}</span>
                      <CourseInfoButton course={currentMentor.mentor_group} collegeId={currentMentor.college_id} size="xs" />
                    </span>
                  </div>
                </div>

                <div className="w-full border-t border-slate-200/60 pt-4 mt-4 text-left space-y-2">
                  <div className="flex justify-between text-[11px] font-bold">
                    <span className="text-slate-500">Faculty ID</span>
                    <span className="text-slate-800 font-mono">{currentMentor.id}</span>
                  </div>
                  <div className="flex justify-between text-[11px] font-bold">
                    <span className="text-slate-500">Primary Email</span>
                    <span className="text-slate-800 truncate max-w-[170px]" title={currentMentor.email}>{currentMentor.email}</span>
                  </div>
                </div>
              </div>

              {/* Teaching Details Card */}
              <div className="md:col-span-2 bg-white p-6 rounded-2xl border border-slate-100 shadow-card space-y-6 flex flex-col justify-between">
                <div>
                  <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4">Academic & Curricular Assignments</h3>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Assigned Teaching Subjects</span>
                      <div className="flex flex-wrap gap-2">
                        {currentMentor.subjects && currentMentor.subjects.split(/,|\n/).length > 0 ? (
                          currentMentor.subjects.split(/,|\n/).map((subj, idx) => (
                            <span key={idx} className="px-2.5 py-1 rounded-xl bg-indigo-50 border border-indigo-100 text-xs font-bold text-amber-700">
                              {subj.trim()}
                            </span>
                          ))
                        ) : (
                          <span className="text-xs text-slate-400 italic">No assigned subjects registered.</span>
                        )}
                      </div>
                    </div>

                    <div className="space-y-2">
                      <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Target Student Class Groups</span>
                      <div className="flex flex-wrap gap-2">
                        {currentMentor.classes && currentMentor.classes.split(/,|\n/).length > 0 ? (
                          currentMentor.classes.split(/,|\n/).map((cls, idx) => (
                            <span key={idx} className="px-2.5 py-1 rounded-xl bg-teal-50 border border-teal-100 text-xs font-bold text-teal-700">
                              {cls.trim()}
                            </span>
                          ))
                        ) : (
                          <span className="text-xs text-slate-400 italic">No assigned class groups registered.</span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="bg-indigo-50 border border-indigo-100 p-4 rounded-xl flex items-center gap-3">
                  <Sparkles className="h-5 w-5 text-amber-600 shrink-0" />
                  <div className="text-[11px] text-indigo-800 font-semibold leading-normal">
                    Your academic profile and subjects list are managed by your Campus Manager (CM). Shift changes or subject reallocations will be updated automatically upon approval.
                  </div>
                </div>
              </div>
            </div>

            {/* Timetable Statistics */}
            <div className="bg-pastel-blue p-6 rounded-2xl border-transparent shadow-sm space-y-6">
              <h3 className="text-xs font-black text-slate-600 uppercase tracking-widest font-sans">Workload & Coverage Metrics</h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-6 text-center">
                <div className="p-4 bg-white/80 rounded-xl border border-slate-100/40">
                  <span className="text-3xl font-extrabold text-slate-900">
                    {mySlots.length}
                  </span>
                  <span className="text-[9px] text-slate-500 font-extrabold uppercase tracking-wider block mt-1">Weekly Teaching Slots</span>
                </div>
                <div className="p-4 bg-white/80 rounded-xl border border-slate-100/40">
                  <span className="text-3xl font-extrabold text-slate-900">
                    {memoizedMyRequestsCount}
                  </span>
                  <span className="text-[9px] text-slate-500 font-extrabold uppercase tracking-wider block mt-1">Handovers Requested</span>
                </div>
                <div className="p-4 bg-white/80 rounded-xl border border-slate-100/40">
                  <span className="text-3xl font-extrabold text-slate-900">
                    {memoizedMyCoveringApprovedCount}
                  </span>
                  <span className="text-[9px] text-slate-500 font-extrabold uppercase tracking-wider block mt-1">Substitution Duties Covered</span>
                </div>
                <div className="p-4 bg-white/80 rounded-xl border border-slate-100/40">
                  <span className="text-3xl font-extrabold text-slate-900">
                    {memoizedProfileMyAttendance.length}
                  </span>
                  <span className="text-[9px] text-slate-500 font-extrabold uppercase tracking-wider block mt-1">Attendance Records Marked</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tab: Student Attendance — Daily Feed View */}
        {activeTab === "attendance" && (() => {
          const markedSessions = memoizedMarkedSessions;

          // Unique months from all sessions
          const allMonths = Array.from(new Set(
            markedSessions.map(s => (s.dateStr ? s.dateStr.slice(0, 7) : "")).filter(Boolean)
          )).sort((a, b) => (b || "").localeCompare(a || ""));

          // Unique class groups
          const allClassGroups = Array.from(new Set(
            markedSessions.map(s => s.slot?.classGroup).filter(Boolean)
          )) as string[];

          // Apply filters
          const filtered = markedSessions.filter(s => {
            if (attCalendarClassFilter !== "all" && s.slot?.classGroup !== attCalendarClassFilter) return false;
            if (attCalendarMonth && !s.dateStr.startsWith(attCalendarMonth)) return false;
            return true;
          });

          // Group by date for timeline view
          const groupedByDate = new Map<string, typeof markedSessions>();
          filtered.forEach(s => {
            const arr = groupedByDate.get(s.dateStr) || [];
            arr.push(s);
            groupedByDate.set(s.dateStr, arr);
          });
          const sortedDates = Array.from(groupedByDate.keys()).sort((a, b) => (b || "").localeCompare(a || ""));

          // Month summary
          const monthPresent = filtered.reduce((a, s) => a + s.presentCount, 0);
          const monthAbsent = filtered.reduce((a, s) => a + s.absentCount, 0);
          const monthTotal = monthPresent + monthAbsent;
          const monthAvg = monthTotal > 0 ? Math.round((monthPresent / monthTotal) * 100) : 0;

          const selectedMonthLabel = attCalendarMonth
            ? new Date(attCalendarMonth + "-01").toLocaleString("default", { month: "long", year: "numeric" })
            : "All Time";

          return (
            <div className="space-y-4 font-sans">

              {/* Top control bar */}
              <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
                <div>
                  <h2 className="text-base font-black text-slate-900">Student Attendance</h2>
                  <p className="text-[11px] text-slate-400 font-medium mt-0.5">
                    {filtered.length} session{filtered.length !== 1 ? "s" : ""} · {monthAvg}% avg · {monthPresent}P / {monthAbsent}A
                    {attCalendarClassFilter !== "all" && <span className="ml-1 text-amber-600">· {attCalendarClassFilter}</span>}
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  {/* Class filter */}
                  <select aria-label="Class filter"
                    value={attCalendarClassFilter}
                    onChange={e => setAttCalendarClassFilter(e.target.value)}
                    className="text-[11px] font-bold px-3 py-2 rounded-xl border border-slate-200 bg-white text-slate-700 focus:outline-none focus:border-indigo-400 cursor-pointer shadow-xs"
                  >
                    <option value="all">All Classes</option>
                    {allClassGroups.map(cg => (
                      <option key={cg} value={cg}>{cg}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Month filter chips — horizontal scroll */}
              <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
                <button
                  type="button"
                  onClick={() => setAttCalendarMonth("")}
                  className={`px-3 py-1.5 rounded-full text-[11px] font-bold whitespace-nowrap transition-all cursor-pointer border ${!attCalendarMonth ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-500 border-slate-200 hover:border-slate-400"}`}
                >
                  All Time
                </button>
                {allMonths.map(m => {
                  const label = new Date(m + "-01").toLocaleString("default", { month: "short", year: "2-digit" });
                  const isActive = attCalendarMonth === m;
                  return (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setAttCalendarMonth(isActive ? "" : m)}
                      className={`px-3 py-1.5 rounded-full text-[11px] font-bold whitespace-nowrap transition-all cursor-pointer border ${isActive ? "bg-zinc-900 text-white border-indigo-600" : "bg-white text-slate-500 border-slate-200 hover:border-amber-300 hover:text-amber-600"}`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>

              {/* Empty state */}
              {sortedDates.length === 0 && (
                <div className="bg-white border border-slate-100 rounded-2xl p-12 flex flex-col items-center gap-3 text-center shadow-card">
                  <div className="h-14 w-14 rounded-2xl bg-slate-50 border border-slate-200 flex items-center justify-center">
                    <ClipboardList className="h-6 w-6 text-slate-300" />
                  </div>
                  <p className="text-sm font-bold text-slate-500">No attendance sessions found</p>
                  <p className="text-xs text-slate-400">Mark attendance from the timetable to see data here.</p>
                </div>
              )}

              {/* Daily timeline feed */}
              <div className="space-y-5">
                {sortedDates.map(dateStr => {
                  const sessions = groupedByDate.get(dateStr)!;
                  const dateObj = new Date(dateStr + "T00:00:00");
                  const isToday = dateStr === todayStr;
                  const dayLabel = dateObj.toLocaleDateString("en-US", { weekday: "long" });
                  const dateLabel = dateObj.toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" });
                  const dayPresent = sessions.reduce((a, s) => a + s.presentCount, 0);
                  const dayAbsent = sessions.reduce((a, s) => a + s.absentCount, 0);
                  const dayPct = (dayPresent + dayAbsent) > 0 ? Math.round((dayPresent / (dayPresent + dayAbsent)) * 100) : 0;

                  return (
                    <div key={dateStr}>
                      {/* Date section header */}
                      <div className="flex items-center gap-3 mb-2.5">
                        <div className={`shrink-0 flex flex-col items-center justify-center w-10 h-10 rounded-xl border font-black text-sm leading-none
                          ${isToday ? "bg-zinc-900 text-white border-indigo-600" : "bg-white text-slate-800 border-slate-200 shadow-xs"}`}>
                          <span className="text-base">{dateObj.getDate()}</span>
                          <span className={`text-[8px] uppercase font-black tracking-wider ${isToday ? "text-indigo-200" : "text-slate-400"}`}>
                            {dateObj.toLocaleString("default", { month: "short" })}
                          </span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs font-black text-slate-800">{dayLabel}</span>
                            {isToday && <span className="px-1.5 py-0.5 rounded-full bg-indigo-100 text-amber-700 text-[9px] font-black">Today</span>}
                            <span className="text-[10px] text-slate-400 font-semibold">{dateLabel}</span>
                          </div>
                          <div className="flex items-center gap-3 mt-0.5 text-[10px] font-bold">
                            <span className="text-emerald-600">{dayPresent} present</span>
                            <span className="text-rose-500">{dayAbsent} absent</span>
                            <span className={`font-black ${dayPct >= 75 ? "text-emerald-700" : "text-rose-600"}`}>{dayPct}% avg</span>
                          </div>
                        </div>
                        <span className="shrink-0 text-[10px] text-slate-400 font-bold">
                          {sessions.length} period{sessions.length !== 1 ? "s" : ""}
                        </span>
                      </div>

                      {/* Period cards for this date */}
                      <div className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-4">{sessions.map((session, idx) => {
                        if (!session.slot) return null;
                        const pct = session.percent;
                        const isGood = pct >= 75;
                        const { name: deptName, sem } = getShortClassGroup(session.slot.classGroup);
                        const circumference = 2 * Math.PI * 16; // r=16
                        const dashOffset = circumference - (pct / 100) * circumference;

                        return (
                          <div
                            key={idx}
                            onClick={() => {
                              const weekday = new Date(dateStr + "T00:00:00").toLocaleDateString("en-US", { weekday: "long" });
                              const dateFormatted = new Date(dateStr + "T00:00:00").toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" });

                              // Set selected cell data
                              setSelectedCell({
                                day: weekday,
                                dateStr,
                                dateFormatted,
                                time: session.slot!.time,
                                slot: session.slot,
                                type: "own"
                              });

                              // Initialize local attendance from existing session records
                              const initialAtt: Record<string, "present" | "absent" | "od" | "not_marked"> = {};
                              (session.records || []).forEach((r: any) => {
                                initialAtt[r.studentId] = (r.status as any) || "present";
                              });
                              setLocalAttendance(initialAtt);
                              setOriginalAttendance(initialAtt);
                              setAttendanceFilterStatus("all");
                              setAttendanceSearchTerm("");

                              // Directly open attendance studio in read-only view mode
                              setIsAttendanceStudioOpen(true);
                              setModalTab("attendance");
                            }}
                            className={`group relative bg-white border rounded-2xl p-4 cursor-pointer transition-all hover:shadow-card-lg hover:-translate-y-0.5 shadow-card
                                ${isGood ? "border-emerald-200 hover:border-emerald-400" : "border-rose-200 hover:border-rose-400"}`}
                          >
                            {/* Top row: subject + status dot */}
                            <div className="flex items-start justify-between gap-2 mb-3">
                              <div className="min-w-0 flex-1">
                                <p className="text-xs font-black text-slate-900 truncate leading-tight" title={session.slot.course}>
                                  {session.slot.course}
                                </p>
                                <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                                  <span className="px-1.5 py-0.5 rounded-md bg-amber-50 text-amber-800 text-[9px] font-black border border-indigo-100 truncate max-w-[80px]" title={deptName}>
                                    {deptName}
                                  </span>
                                  {sem && (
                                    <span className="px-1.5 py-0.5 rounded-md bg-teal-50 text-teal-700 text-[9px] font-black border border-teal-100">
                                      {sem}
                                    </span>
                                  )}
                                </div>
                              </div>

                              {/* SVG circular progress ring */}
                              <div className="shrink-0 relative w-11 h-11">
                                <svg className="w-11 h-11 -rotate-90" viewBox="0 0 40 40">
                                  <circle cx="20" cy="20" r="16" fill="none" stroke={isGood ? "#d1fae5" : "#fee2e2"} strokeWidth="4" />
                                  <circle
                                    cx="20" cy="20" r="16" fill="none"
                                    stroke={isGood ? "#10b981" : "#f43f5e"}
                                    strokeWidth="4"
                                    strokeDasharray={circumference}
                                    strokeDashoffset={dashOffset}
                                    strokeLinecap="round"
                                  />
                                </svg>
                                <span className={`absolute inset-0 flex items-center justify-center text-[10px] font-black ${isGood ? "text-emerald-700" : "text-rose-600"}`}>
                                  {pct}%
                                </span>
                              </div>
                            </div>

                            {/* Present/Absent split bar */}
                            <div className="mb-2.5">
                              <div className="flex h-1.5 rounded-full overflow-hidden bg-slate-100">
                                <div className="bg-emerald-400 transition-all" style={{ width: `${pct}%` }} />
                                <div className="bg-rose-400 transition-all" style={{ width: `${100 - pct}%` }} />
                              </div>
                              <div className="flex justify-between mt-1 text-[9.5px] font-bold">
                                <span className="text-emerald-600">{session.presentCount} present</span>
                                <span className="text-rose-500">{session.absentCount} absent</span>
                              </div>
                            </div>

                            {/* Bottom row: time + room + edit button */}
                            <div className="flex items-center justify-between pt-2.5 border-t border-slate-100">
                              <div className="flex items-center gap-2 text-[10px] text-slate-500 font-semibold">
                                <Clock className="h-3 w-3 shrink-0" />
                                <span className="truncate">{session.slot.time}</span>
                                {session.slot.location && (
                                  <>
                                    <span className="text-slate-300">·</span>
                                    <MapPin className="h-3 w-3 shrink-0" />
                                    <span className="truncate">{session.slot.location}</span>
                                  </>
                                )}
                              </div>
                              {/* View + Edit button: Click to view, Edit for CM request if expired */}
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const weekday = new Date(dateStr + "T00:00:00").toLocaleDateString("en-US", { weekday: "long" });
                                  const dateFormatted = new Date(dateStr + "T00:00:00").toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" });

                                  // Check if attendance window is expired
                                  const windowCheck = checkAttendanceWindow(dateStr, session.slot!.time);
                                  const isExpired = !windowCheck.open && windowCheck.reason === "expired";

                                  // Check if already has CM approval
                                  const camKey = `${session.slot!.id}|${dateStr}`;
                                  const hasApproval = lateAttendanceCamApprovedSet.has(camKey);

                                  if (isExpired && !hasApproval) {
                                    // Show CM request modal
                                    setSelectedCell({
                                      day: weekday,
                                      dateStr,
                                      dateFormatted,
                                      time: session.slot!.time,
                                      slot: session.slot,
                                      type: "own"
                                    });
                                    setIsCamEditRequestModalOpen(true);
                                    setCamRequestReason("");
                                    setFormError("");
                                  } else {
                                    // Open attendance studio for editing (window open or has CM approval)
                                    handleCellClick(weekday, dateStr, dateFormatted, session.slot!.time);
                                  }
                                }}
                                className="px-2.5 py-1 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-amber-700 font-bold text-[10px] transition-all opacity-0 group-hover:opacity-100 flex items-center gap-1"
                              >
                                <span>Edit</span>
                                <ChevronRight className="h-3 w-3" />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })()}



        {/* ══════════════════════════════════════════════════════════════════════ */}
        {/* POPUP 1: COMPACT PERIOD ACTIONS (MARK ATTENDANCE VS HANDOVER)          */}
        {/* ══════════════════════════════════════════════════════════════════════ */}
        {isModalOpen && !isAttendanceStudioOpen && selectedCell && selectedCell.slot && (() => {
          const { name: deptShort, sem } = getShortClassGroup(selectedCell.slot.classGroup);
          const yearStr = getYearForClass(selectedCell.slot.classGroup);
          const shiftLabel = selectedCell.slot.shift === "shift_1" ? "Shift 1" : selectedCell.slot.shift === "shift_2" ? "Shift 2" : "General";

          const classStudents = memoizedSelectedCellStudents;
          const existingAttendance = memoizedSelectedCellAttendance;
          const alreadyMarked = existingAttendance.length > 0;
          const prevPresent = existingAttendance.filter(a => a.status === "present").length;
          const prevAbsent = existingAttendance.filter(a => a.status === "absent").length;

          const windowCheck = checkAttendanceWindow(selectedCell.dateStr, selectedCell.time);
          const camKey = `${selectedCell.slot.id}|${selectedCell.dateStr}`;
          const hasCMApproval = lateAttendanceCamApprovedSet.has(camKey);
          const pendingLateCamReq = lateAttendanceCamPendingSet.has(camKey);
          const isFuture = !windowCheck.open && windowCheck.reason === "future";
          const isDeadlineExpired = !windowCheck.open && windowCheck.reason === "expired";
          const isLocked = attendanceLockEnabled && isDeadlineExpired && !hasCMApproval;
          const approvedReq = approvedHandovers.find(h => h.slotId === selectedCell.slot!.id && h.dateStr === selectedCell.dateStr);

          // Find cell-specific late attendance request (if any)
          const cellLateRequests = requests.filter(r =>
            r.slotId === selectedCell.slot!.id &&
            r.dateStr === selectedCell.dateStr &&
            isLateAttendanceRequest(r)
          ).sort((a, b) => new Date(b.timestamp || 0).getTime() - new Date(a.timestamp || 0).getTime());

          const cellLateReq = cellLateRequests.find(r => r.status === "approved") ||
            cellLateRequests.find(r => isAnyPendingCmRequest(r.status)) ||
            cellLateRequests[0] || null;

          const isCellPendingCM = pendingLateCamReq || (cellLateReq && isAnyPendingCmRequest(cellLateReq.status));
          const isCellApprovedCM = hasCMApproval || cellLateReq?.status === "approved";
          const isCellRejectedCM = !isCellApprovedCM && !isCellPendingCM && cellLateReq?.status === "rejected";

          return (
            <Dialog
              open={true}
              onOpenChange={(next) => { if (!next) setIsModalOpen(false); }}
              ariaLabel="Period action"
              overlayClassName="bg-slate-950/60 backdrop-blur-sm p-4"
              panelClassName="max-w-md bg-white rounded-2xl border-slate-200 p-5 space-y-0 flex flex-col overflow-hidden max-h-[90vh]"
            >
              {/* Header */}
              <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-3.5">
                <div>
                  <h3 className="text-base font-bold text-slate-900 leading-tight">Period Action</h3>
                  <p className="text-xs text-slate-500 font-medium">Select action for this period</p>
                </div>
                <button
                  onClick={() => setIsModalOpen(false)}
                  aria-label="Close period action"
                  className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Class Info Box - Minimal & Clean */}
              <div className="p-3.5 bg-slate-50 border border-slate-100 rounded-xl mb-4 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-bold text-slate-900 truncate">{selectedCell.slot.course}</span>
                  <span className="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-slate-200/80 text-slate-700 shrink-0">
                    {deptShort || "Class"}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500 font-medium">
                  {yearStr && <span className="px-1.5 py-0.5 rounded bg-white border border-slate-200 text-slate-700 text-[10px] font-semibold">{yearStr}</span>}
                  {sem && <span className="px-1.5 py-0.5 rounded bg-white border border-slate-200 text-slate-700 text-[10px] font-semibold">{sem}</span>}
                  <span className="px-1.5 py-0.5 rounded bg-white border border-slate-200 text-slate-700 text-[10px] font-semibold">{shiftLabel}</span>
                  <span>•</span>
                  <span>{selectedCell.dateFormatted}</span>
                  <span>•</span>
                  <span>{formatTimeLabel(selectedCell.time)}</span>
                  {selectedCell.slot.location && (
                    <>
                      <span>•</span>
                      <span className="truncate max-w-[120px]">{selectedCell.slot.location}</span>
                    </>
                  )}
                </div>
              </div>

              {/* Future Class / Locked Window / Handed Over Notifications */}
              {isCellApprovedCM && isDeadlineExpired && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-900 space-y-2 mb-3">
                  <div className="flex items-center justify-between gap-2 border-b border-emerald-200/80 pb-1.5">
                    <div className="flex items-center gap-1.5 font-bold text-slate-900 text-xs">
                      <CheckCircle className="h-4 w-4 text-emerald-600 shrink-0" />
                      <span>Attendance Unlocked by CM</span>
                    </div>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-100 text-emerald-800 border border-emerald-300">
                      Approved
                    </span>
                  </div>
                  <p className="text-slate-600 text-[11.5px]">
                    Campus Manager has approved your late attendance request. Direct marking is now enabled for this period.
                  </p>
                  {cellLateReq?.reason && (
                    <div className="p-2 bg-white/90 rounded-lg border border-emerald-200 text-left text-xs text-slate-700">
                      <span className="font-bold text-slate-500 text-[10px] block uppercase tracking-wider mb-0.5">Approved Reason</span>
                      "{cellLateReq.reason.replace(/^Late Attendance Edit Request:\s*/i, "")}"
                    </div>
                  )}
                </div>
              )}

              {isFuture ? (
                <div className="p-4 bg-sky-50 border border-sky-200 rounded-xl text-center text-xs text-sky-900 space-y-2 mb-2">
                  <Clock className="h-6 w-6 mx-auto text-sky-600" />
                  <div>
                    <p className="font-bold text-sm text-slate-900">Class Has Not Started Yet</p>
                    <p className="text-slate-500 mt-1">
                      Attendance cannot be marked in advance for future classes. Marking unlocks when this period begins ({formatTimeLabel(selectedCell.time)} on {selectedCell.dateFormatted}).
                    </p>
                  </div>
                </div>
              ) : isCellPendingCM ? (
                <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 space-y-3 mb-2">
                  <div className="flex items-center justify-between gap-2 border-b border-amber-200/80 pb-2">
                    <div className="flex items-center gap-2">
                      <Clock className="h-5 w-5 text-amber-600 animate-pulse shrink-0" />
                      <span className="font-bold text-slate-900 text-sm">Period Ended — Attendance Locked</span>
                    </div>
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black tracking-wider uppercase bg-amber-100 text-amber-800 border border-amber-300">
                      Pending CM
                    </span>
                  </div>

                  <p className="text-slate-600 text-xs">
                    {windowCheck.message || "This period ended. Direct marking is closed."}
                  </p>

                  <div className="p-3 bg-white/90 rounded-xl border border-amber-200 space-y-2 text-left">
                    <div className="flex items-center justify-between text-[11px] text-slate-500 border-b border-slate-100 pb-1.5">
                      <span className="font-bold text-slate-700">Live Request Status:</span>
                      <span className="inline-flex items-center gap-1 font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                        <Clock className="w-3 h-3 animate-pulse" /> Awaiting CM Approval
                      </span>
                    </div>

                    {cellLateReq?.timestamp && (
                      <div className="text-[11px] text-slate-500">
                        <span className="font-medium text-slate-700">Submitted at:</span>{" "}
                        {new Date(cellLateReq.timestamp).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })} at {new Date(cellLateReq.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </div>
                    )}

                    {cellLateReq?.reason && (
                      <div className="text-xs text-slate-700">
                        <span className="font-bold text-slate-500 text-[10px] block uppercase tracking-wider mb-0.5">Submitted Reason</span>
                        "{cellLateReq.reason.replace(/^Late Attendance Edit Request:\s*/i, "")}"
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-between gap-2 pt-1">
                    <span className="text-[10.5px] text-amber-800 font-medium italic">
                      Marking unlocks immediately once approved. Duplicate requests are blocked.
                    </span>
                    <button
                      type="button"
                      onClick={async () => {
                        await refreshData(true);
                      }}
                      className="px-2.5 py-1.5 bg-white hover:bg-slate-50 text-slate-700 rounded-lg text-xs font-bold border border-amber-200 shadow-2xs cursor-pointer flex items-center gap-1.5 shrink-0"
                      title="Check latest CM approval status"
                    >
                      <RefreshCw className="w-3.5 h-3.5" /> Refresh Status
                    </button>
                  </div>
                </div>
              ) : isCellRejectedCM ? (
                <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-900 space-y-3 mb-2">
                  <div className="flex items-center justify-between gap-2 border-b border-rose-200/80 pb-2">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="h-5 w-5 text-rose-600 shrink-0" />
                      <span className="font-bold text-slate-900 text-sm">Request Rejected by CM</span>
                    </div>
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black tracking-wider uppercase bg-rose-100 text-rose-800 border border-rose-300">
                      Declined
                    </span>
                  </div>

                  <p className="text-slate-600 text-xs">
                    The Campus Manager declined the previous late attendance request for this period.
                  </p>

                  {cellLateReq?.headerReason && (
                    <div className="p-2.5 bg-white/90 rounded-lg border border-rose-200 text-left text-xs text-slate-700">
                      <span className="font-bold text-slate-500 text-[10px] block uppercase tracking-wider mb-0.5">CM Feedback / Note</span>
                      "{cellLateReq.headerReason}"
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={() => {
                      setIsModalOpen(false);
                      setIsCamEditRequestModalOpen(true);
                      setCamRequestReason("");
                      setFormError("");
                    }}
                    className="w-full py-2.5 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs transition-all shadow-sm cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    <Send className="w-3.5 h-3.5" /> Re-request CM Approval with Updated Reason
                  </button>
                </div>
              ) : isLocked ? (
                <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-center text-xs text-amber-900 space-y-3 mb-2">
                  <Lock className="h-6 w-6 mx-auto text-amber-600" />
                  <div>
                    <p className="font-bold text-sm text-slate-900">Period Ended — Attendance Locked</p>
                    <p className="text-slate-500 mt-1">{windowCheck.message}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setIsModalOpen(false);
                      setIsCamEditRequestModalOpen(true);
                      setCamRequestReason("");
                      setFormError("");
                    }}
                    className="w-full py-2.5 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs transition-all shadow-sm cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    <Send className="w-3.5 h-3.5" /> Request CM Approval to Mark Attendance
                  </button>
                </div>
              ) : selectedCell.type === "own" && approvedReq ? (
                <div className="p-4 bg-slate-50 border border-slate-100 rounded-xl text-center text-xs text-slate-800 space-y-2 mb-2">
                  <CheckCircle className="h-6 w-6 mx-auto text-slate-600" />
                  <p className="font-bold">Class Handed Over</p>
                  <p className="text-slate-500">This class has been handed over to <strong>{approvedReq.coverStaffName}</strong>.</p>
                </div>
              ) : modalTab === "attendance" ? (
                /* Two Distinct Action Choices */
                <div className="space-y-3">
                  {/* Choice 1: Mark Attendance */}
                  <button
                    type="button"
                    disabled={isFuture}
                    onClick={() => {
                      if (isFuture) return;
                      setIsModalOpen(false);
                      setAttendanceFilterStatus("all");
                      setAttendanceSearchTerm("");
                      setIsAttendanceStudioOpen(true);
                    }}
                    className={`w-full text-left p-3.5 rounded-xl border transition-all shadow-2xs group flex items-start gap-3 ${isFuture
                        ? "bg-slate-50 border-slate-200 opacity-60 cursor-not-allowed"
                        : "border-slate-200 bg-white hover:border-slate-400 hover:bg-slate-50 cursor-pointer"
                      }`}
                    title={isFuture ? "Cannot mark attendance for a future class" : undefined}
                  >
                    <div className="p-2 rounded-lg bg-slate-100 text-slate-700 group-hover:bg-slate-900 group-hover:text-white transition-colors shrink-0 mt-0.5">
                      <CheckCircle className="w-5 h-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-0.5">
                        <span className="font-bold text-sm text-slate-900">
                          Mark Attendance
                        </span>
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
                          {classStudents.length} Students
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 font-normal leading-relaxed">
                        Open student roster to mark, edit, or verify attendance.
                      </p>
                      {alreadyMarked ? (
                        <div className="text-[11px] font-medium text-emerald-700 mt-2 flex items-center gap-1">
                          <Check className="w-3.5 h-3.5" /> Marked: {prevPresent} Present, {prevAbsent} Absent
                        </div>
                      ) : (
                        <div className="text-[11px] font-medium text-slate-400 mt-2">
                          Not marked yet
                        </div>
                      )}
                    </div>
                  </button>

                  {/* Choice 2: Request Handover */}
                  <button
                    type="button"
                    onClick={() => setModalTab("handover")}
                    className="w-full text-left p-3.5 rounded-xl border border-slate-100 bg-white hover:border-slate-400 hover:bg-slate-50 transition-all shadow-2xs cursor-pointer group flex items-start gap-3"
                  >
                    <div className="p-2 rounded-lg bg-slate-100 text-slate-700 group-hover:bg-slate-900 group-hover:text-white transition-colors shrink-0 mt-0.5">
                      <Send className="w-5 h-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-0.5">
                        <span className="font-bold text-sm text-slate-900">
                          Request Handover
                        </span>
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
                          Substitution
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 font-normal leading-relaxed">
                        Delegate this period to a peer faculty mentor in your department.
                      </p>
                    </div>
                  </button>
                </div>
              ) : (
                /* Handover Submission Form */
                <form onSubmit={submitAction} className="flex-1 flex flex-col min-h-0 space-y-3">
                  <div className="flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() => setModalTab("attendance")}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-slate-900 cursor-pointer"
                    >
                      <ChevronLeft className="w-4 h-4" /> Back to Actions
                    </button>
                    <span className="text-xs font-bold text-slate-800">Handover Request</span>
                  </div>

                  {formError && (
                    <div className="p-2.5 bg-red-50 border border-red-200 rounded-lg text-xs text-red-600 flex items-start gap-1.5" role="alert">
                      <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                      <span>{formError}</span>
                    </div>
                  )}

                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-700">Select Covering Staff</label>
                    <select
                      value={targetStaffId}
                      onChange={(e) => setTargetStaffId(e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 font-medium focus:outline-none focus:border-slate-900"
                      aria-label="Select Covering Staff"
                    >
                      <option value="">-- Choose Covering Staff --</option>
                      {memoizedCoveringStaff.map(m => (
                        <option key={m.id} value={m.id} disabled={m.isOccupied}>
                          {m.isOccupied ? `[Occupied] ` : ""}{m.name}{m.badge}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-700">Reason for Handover</label>
                    <textarea
                      rows={3}
                      placeholder="e.g. Attending conference / Medical leave..."
                      value={reasonText}
                      onChange={(e) => setReasonText(e.target.value)}
                      className="w-full bg-sunken border border-slate-200 inset-shadow-well focus:bg-white dark:focus:bg-[#131317] rounded-xl p-2.5 text-xs text-slate-800 focus:outline-none focus:border-slate-900"
                      aria-label="Reason for Handover"
                    />
                  </div>

                  <div className="flex gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setModalTab("attendance")}
                      className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold py-2 rounded-xl text-xs transition-colors cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={swapSubmitting}
                      className="flex-1 bg-slate-900 hover:bg-slate-800 text-white font-bold py-2 rounded-xl text-xs shadow-sm transition-all cursor-pointer flex items-center justify-center gap-1.5"
                    >
                      {swapSubmitting ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          <span>Submitting...</span>
                        </>
                      ) : (
                        <>
                          <Send className="w-3.5 h-3.5" />
                          <span>Submit Request</span>
                        </>
                      )}
                    </button>
                  </div>
                </form>
              )}

              {/* Close Button Footer */}
              <div className="pt-3 border-t border-slate-100 mt-4 flex justify-end">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs rounded-xl transition-colors cursor-pointer"
                >
                  Close
                </button>
              </div>
            </Dialog>
          );
        })()}

        {/* ══════════════════════════════════════════════════════════════════════ */}
        {/* POPUP 2: DEDICATED FULL-SCREEN ATTENDANCE STUDIO                      */}
        {/* ══════════════════════════════════════════════════════════════════════ */}
        {isAttendanceStudioOpen && selectedCell && selectedCell.slot && (() => {
          const { name: deptShort, sem } = getShortClassGroup(selectedCell.slot.classGroup);
          const yearStr = getYearForClass(selectedCell.slot.classGroup);

          const classStudents = memoizedSelectedCellStudents;

          const today = new Date();
          const y = today.getFullYear();
          const m = String(today.getMonth() + 1).padStart(2, '0');
          const d = String(today.getDate()).padStart(2, '0');
          const todayStr = `${y}-${m}-${d}`;

          const windowCheck = checkAttendanceWindow(selectedCell.dateStr, selectedCell.time);
          const isFuture = !windowCheck.open && windowCheck.reason === "future";
          const isLocked = attendanceLockEnabled && !windowCheck.open && windowCheck.reason === "expired";

          // Check if CM has approved late attendance edit for this session
          const camKey = `${selectedCell.slot.id}|${selectedCell.dateStr}`;
          const hasCMApproval = lateAttendanceCamApprovedSet.has(camKey);

          // Allow editing if: lock is disabled OR window is open OR has CM approval for late edit. Block future periods unconditionally.
          const isPastDay = isFuture || (attendanceLockEnabled && ((selectedCell.dateStr < todayStr || isLocked) && !hasCMApproval));

          const presentCount = classStudents.filter(s => (localAttendance[s.id] || "present") === "present").length;
          const absentCount = classStudents.filter(s => localAttendance[s.id] === "absent").length;
          const odCount = classStudents.filter(s => localAttendance[s.id] === "od").length;

          const filteredStudents = memoizedFilteredStudents;

          const setStudentStatus = (studentId: string, status: "present" | "absent" | "od") => {
            if (isPastDay) return;
            setLocalAttendance(prev => ({
              ...prev,
              [studentId]: status
            }));
          };

          const handleToggleStudent = (studentId: string) => {
            if (isPastDay) return;
            setLocalAttendance(prev => {
              const cur = prev[studentId] || "present";
              let next: "present" | "absent" | "od" = "absent";
              if (cur === "present") next = "absent";
              else if (cur === "absent") next = "od";
              else next = "present";
              return { ...prev, [studentId]: next };
            });
          };

          const handleMarkAll = (status: "present" | "absent" | "od") => {
            if (isPastDay) return;
            const updated: Record<string, "present" | "absent" | "od" | "not_marked"> = {};
            classStudents.forEach(s => {
              updated[s.id] = status;
            });
            setLocalAttendance(updated);
          };

          const handleSaveAttendance = async () => {
            // ── Day config pre-flight guard ──────────────────────────────
            if (!isDayConfigSet) {
              setFormError("Day order/type has not been configured for this date. The CM must set the day schedule before you can mark attendance.");
              return;
            }
            // ── End day config guard ──────────────────────────────────────

            const windowCheck = checkAttendanceWindow(selectedCell.dateStr, selectedCell.time);
            if (windowCheck.reason === "future" || selectedCell.dateStr > todayStr) {
              setFormError("Class has not started yet. You cannot mark attendance for a future period or date.");
              return;
            }
            if (attendanceLockEnabled && !windowCheck.open && windowCheck.reason === "expired" && !hasCMApproval) {
              setFormError(windowCheck.message || "Attendance window is closed.");
              return;
            }

            if (matchedPlannedTask && selectedCell.type !== "covering" && attendanceType === "Regular" && selectedCell.dateStr === todayStr) {
              if (!planVerificationChoice) {
                setFormError("Please verify the weekly plan status (Conducted as Planned, with Changes, or Not Conducted) before saving attendance.");
                return;
              }
            }

            setIsSubmittingAttendance(true);
            setFormError("");
            try {
              const attendancePayload = classStudents.map(s => ({
                studentId: s.id,
                status: localAttendance[s.id] || "present"
              }));

              let finalSubject = selectedCell.slot!.course;
              if (selectedCell.type === "covering") {
                if (handoverSubject === "substitute_own" && selectedSubjName) {
                  finalSubject = selectedSubjName;
                } else if (handoverSubject === "custom" && customSubjName.trim()) {
                  finalSubject = customSubjName.trim();
                }
              }

              const res = await markAttendance(
                selectedCell.slot!.id,
                selectedCell.dateStr,
                attendancePayload,
                selectedCell.type === "covering" ? finalSubject : undefined,
                attendanceType,
                attendanceMode,
                attendanceType === "Non-Regular" ? attendanceTypeSub : undefined
              );
              if (res.success) {
                setIsAttendanceStudioOpen(false);
                toast("Attendance saved and verified successfully!", "success");

                // ── Weekly Plan verification → Academic Tracker provenance entry ──
                // Best-effort and strictly post-save: a tracker failure can never
                // affect the already-committed attendance. Only for the mentor's own
                // Regular sessions on today's date (tracker accepts today only).
                if (matchedPlannedTask && selectedCell.type !== "covering" && attendanceType === "Regular" && selectedCell.dateStr === todayStr) {
                  const effectiveTopic = planVerificationChoice === "with_changes"
                    ? (planActualTopic.trim() || String(matchedPlannedTask.task.topic))
                    : String(matchedPlannedTask.task.topic);
                  const conductedStatus = planVerificationChoice === "not_conducted" ? "Not Conducted" : "Conducted";
                  // Human-readable delivery remarks — plan linkage lives in the
                  // dedicated weekly_plan_id / weekly_plan_week columns, so the
                  // remarks stay clean prose without machine identifiers.
                  const plannedTopic = String(matchedPlannedTask.task.topic);
                  const planUnit = String(matchedPlannedTask.plan.unit || "").trim();
                  const planRemark = planVerificationChoice === "as_planned"
                    ? `Conducted exactly as planned in the Week ${matchedPlannedTask.plan.week_number} weekly plan${planUnit ? ` (${planUnit})` : ""}. Class delivered on the approved topic "${plannedTopic}".`
                    : planVerificationChoice === "with_changes"
                      ? `Delivered as per the Week ${matchedPlannedTask.plan.week_number} weekly plan, with a topic adjustment${planUnit ? ` in ${planUnit}` : ""} — planned: "${plannedTopic}", actually conducted: "${effectiveTopic}".`
                      : `Scheduled in the Week ${matchedPlannedTask.plan.week_number} weekly plan${planUnit ? ` (${planUnit})` : ""} for topic "${plannedTopic}", but the class was not conducted during this period.`;
                  try {
                    await saveAcademicTrackerEntry({
                      date: selectedCell.dateStr,
                      periodSlot: selectedCell.slot?.time || selectedCell.time || "",
                      classGroup: selectedCell.slot?.classGroup || "",
                      subject: selectedCell.slot?.course || matchedPlannedTask.plan.subject || "",
                      unit: matchedPlannedTask.plan.unit || "Unit 1",
                      topic: effectiveTopic,
                      comments: planRemark,
                      status: conductedStatus,
                      mentorId: currentMentor.id,
                      mentorName: currentMentor.name,
                      collegeId: currentMentor.college_id || "",
                      ...({
                        weeklyPlanId: matchedPlannedTask.plan.id,
                        weeklyPlanWeek: matchedPlannedTask.plan.week_number
                      } as any)
                    });
                    if (planVerificationChoice === "not_conducted") {
                      toast("Period flagged as Not Conducted in Academic Tracker.", "info");
                    }
                  } catch { /* never block the attendance flow on tracker errors */ }
                } else if (matchedPlannedTask && planVerificationChoice === "not_conducted" && (selectedCell.type === "covering" || attendanceType !== "Regular" || selectedCell.dateStr !== todayStr)) {
                  toast("Weekly plan verification is only recorded for your own Regular periods marked today.", "info");
                }
              } else {
                setFormError(res.message || "Failed to mark attendance.");
              }
            } catch (err: any) {
              setFormError(err.message || "Something went wrong.");
            } finally {
              setIsSubmittingAttendance(false);
            }
          };

          return (
            <Dialog
              open={true}
              onOpenChange={(next) => { if (!next) setIsAttendanceStudioOpen(false); }}
              ariaLabel={`Attendance — ${selectedCell.slot.course}`}
              overlayClassName="bg-slate-950/60 backdrop-blur-sm p-2 sm:p-4 overflow-y-auto"
              panelClassName="max-w-5xl h-[90vh] max-h-[90vh] bg-white rounded-2xl border-slate-200 p-0 space-y-0 flex flex-col overflow-hidden"
            >

              {/* Full-modal saving overlay — blocks UI during re-render after attendance submit */}
              {isSubmittingAttendance && (
                <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-white/80 backdrop-blur-xs rounded-2xl gap-3">
                  <Loader2 className="w-8 h-8 animate-spin text-amber-600" />
                  <p className="text-sm font-bold text-slate-700">Saving attendance records…</p>
                  <p className="text-xs text-slate-400">Please wait, updating {classStudents.length} students</p>
                </div>
              )}
              <div className="px-5 py-3.5 bg-white border-b border-slate-200 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-3">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-base font-bold text-slate-900 leading-tight">
                        Attendance — {selectedCell.slot.course}
                      </h3>
                      {isPastDay && (
                        <span className="text-[10px] font-black px-2 py-0.5 rounded-md bg-amber-100 text-amber-700 border border-amber-200 uppercase tracking-wider">
                          View Only
                        </span>
                      )}
                      {!isPastDay && hasCMApproval && (
                        <span className="text-[10px] font-black px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-700 border border-emerald-200 uppercase tracking-wider">
                          CM Approved
                        </span>
                      )}
                      {!attendanceLockEnabled && (
                        <span className="text-[10px] font-black px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 border border-emerald-300 uppercase tracking-wider flex items-center gap-1">
                          <Unlock className="w-3 h-3" /> Lock Disabled by Admin
                        </span>
                      )}
                      <span className="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 border border-slate-200">
                        {deptShort || "Class"}
                      </span>
                      {yearStr && <span className="text-[11px] font-medium px-2 py-0.5 rounded-md bg-slate-50 text-slate-600 border border-slate-200">{yearStr}</span>}
                      {sem && <span className="text-[11px] font-medium px-2 py-0.5 rounded-md bg-slate-50 text-slate-600 border border-slate-200">{sem}</span>}
                    </div>
                    <p className="text-xs text-slate-500 font-medium mt-0.5 flex items-center gap-2">
                      <span>{selectedCell.dateFormatted}</span>
                      <span>•</span>
                      <span>{formatTimeLabel(selectedCell.time)}</span>
                      {selectedCell.slot.location && (
                        <>
                          <span>•</span>
                          <span>{selectedCell.slot.location}</span>
                        </>
                      )}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setIsAttendanceStudioOpen(false)}
                  aria-label="Close attendance studio"
                  className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Lock Disabled by Admin Banner */}
              {!attendanceLockEnabled && (
                <div className="px-5 py-2 bg-emerald-50 border-b border-emerald-200 flex items-center gap-2 shrink-0 text-emerald-800 text-xs font-semibold">
                  <Unlock className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <span>Attendance Marking Lock is currently disabled by Administrator. Retroactive and past period marking is open.</span>
                </div>
              )}

              {/* Day Config Status Banner */}
              {!isDayConfigSet && (
                <div className="px-5 py-2.5 bg-amber-50 border-b border-amber-200 flex items-start gap-2.5 shrink-0">
                  <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0 flex items-start gap-3 flex-wrap">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-amber-800">Day Order Not Configured</p>
                      <p className="text-[11px] text-amber-700 font-medium mt-0.5">
                        The CM has not set a day order or day type for <span className="font-bold">{selectedCell.dateFormatted}</span>. Attendance cannot be saved until the CM configures this date in the Daily Schedule.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemindCm(selectedCell.dateStr, selectedCell.dateFormatted)}
                      disabled={isRemindingCm}
                      className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 active:bg-amber-800 text-white text-[11px] font-extrabold shadow-xs border border-amber-700/40 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                      {isRemindingCm ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          Reminding…
                        </>
                      ) : (
                        <>
                          <BellRing className="w-3.5 h-3.5" />
                          Remind CM
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}
              {isDayConfigSet && dayConfigDetails && dayConfigDetails.day_type === "holiday" && (
                <div className="px-5 py-2.5 bg-rose-50 border-b border-rose-200 flex items-start gap-2.5 shrink-0">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-rose-800">Holiday — Attendance Blocked</p>
                    <p className="text-[11px] text-rose-700 font-medium mt-0.5">
                      This date is marked as a <span className="font-bold">Holiday</span> by the CM. Attendance cannot be recorded.
                      {dayConfigDetails.notes ? <span> Note: {dayConfigDetails.notes}</span> : null}
                    </p>
                  </div>
                </div>
              )}
              {isDayConfigSet && dayConfigDetails && dayConfigDetails.day_type !== "holiday" && (
                <div className="px-5 py-2 bg-indigo-50 border-b border-indigo-100 flex items-center gap-2 shrink-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-indigo-100 text-amber-700 border border-indigo-200 uppercase tracking-wider">
                      {dayConfigDetails.day_order && dayConfigDetails.day_order !== "None" ? dayConfigDetails.day_order : "No Order"}
                    </span>
                    <span className={`text-[10px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider border ${dayConfigDetails.day_type === "event" ? "bg-amber-50 text-amber-700 border-amber-200" :
                        dayConfigDetails.day_type === "exam_day" ? "bg-purple-50 text-purple-700 border-purple-200" :
                          "bg-emerald-50 text-emerald-700 border-emerald-200"
                      }`}>
                      {dayConfigDetails.day_type === "exam_day" ? "Exam Day" : dayConfigDetails.day_type === "event" ? "Campus Event" : "Working Day"}
                    </span>
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200 uppercase tracking-wider">
                      {dayConfigDetails.session_mode || "Offline"}
                    </span>
                    {dayConfigDetails.notes ? (
                      <span className="text-[11px] text-slate-500 font-medium truncate max-w-[220px]" title={dayConfigDetails.notes}>
                        {dayConfigDetails.notes}
                      </span>
                    ) : null}
                  </div>
                </div>
              )}

              {/* ── Weekly Plan Verification Panel (soft confirm — never blocks marking) ── */}
              {matchedPlannedTask && selectedCell.type !== "covering" && (
                <div className="px-5 py-2.5 bg-emerald-50/60 border-b border-emerald-100 flex items-start gap-2.5 shrink-0">
                  <CalendarRange className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-xs font-bold text-emerald-900">Weekly Plan Verification — Week {matchedPlannedTask.plan.week_number}</p>
                      <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 border border-emerald-200 uppercase tracking-wider">
                        Verified Plan
                      </span>
                      {matchedPlannedTask.plan.unit ? (
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-50 text-amber-800 border border-indigo-100 uppercase tracking-wider">
                          {matchedPlannedTask.plan.unit}
                        </span>
                      ) : null}
                    </div>
                    <p className="text-[11px] text-emerald-800 font-semibold mt-0.5 leading-relaxed">
                      Planned: {String(matchedPlannedTask.task.topic)}
                      {matchedPlannedTask.task.objectives ? <span className="text-emerald-700/80 font-medium"> — {String(matchedPlannedTask.task.objectives)}</span> : null}
                    </p>
                    <div className="flex items-center gap-1.5 flex-wrap mt-1.5">
                      {([
                        ["as_planned", "Conducted as Planned"],
                        ["with_changes", "Conducted with Changes"],
                        ["not_conducted", "Not Conducted"]
                      ] as const).map(([val, label]) => (
                        <button
                          key={val}
                          type="button"
                          disabled={isPastDay}
                          onClick={() => setPlanVerificationChoice(val)}
                          className={`px-2.5 py-1 rounded-lg text-[10.5px] font-bold transition-all cursor-pointer border disabled:opacity-50 disabled:cursor-not-allowed ${planVerificationChoice === val
                              ? val === "not_conducted"
                                ? "bg-rose-600 border-rose-600 text-white shadow-xs"
                                : "bg-emerald-600 border-emerald-600 text-white shadow-xs"
                              : "bg-white border-emerald-200 text-emerald-800 hover:bg-emerald-100"
                            }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                    {planVerificationChoice === "with_changes" && (
                      <input
                        type="text"
                        value={planActualTopic}
                        onChange={(e) => setPlanActualTopic(e.target.value)}
                        placeholder="Actual topic conducted…"
                        className="mt-1.5 w-full max-w-md px-2.5 py-1.5 rounded-lg border border-emerald-200 bg-white text-[11px] font-semibold text-slate-800 focus:outline-none focus:border-emerald-500"
                      />
                    )}
                    {planVerificationChoice !== "not_conducted" && matchedPlannedTask.task.materialUrl ? (
                      <a
                        href={String(matchedPlannedTask.task.materialUrl)}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 mt-1 text-[10.5px] font-bold text-emerald-700 underline hover:text-emerald-900"
                      >
                        Planned Material <ExternalLink className="w-3 h-3" />
                      </a>
                    ) : null}
                  </div>
                </div>
              )}
              {!matchedPlannedTask && weeklyPlansLoaded && selectedCell.type !== "covering" && !isPastDay && (
                <div className="px-5 py-1.5 bg-slate-50/60 border-b border-slate-100 flex items-center gap-2 shrink-0">
                  <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">No approved Weekly Plan match for this period</span>
                </div>
              )}

              {/* Minimal Top Toolbar: Clean Segmented Filter & Search */}
              <div className="px-5 py-2.5 bg-slate-50/70 border-b border-slate-200 flex flex-col md:flex-row items-center justify-between gap-3 shrink-0">
                {/* Segmented Filter Pills */}
                <div className="flex items-center bg-slate-200/60 p-1 rounded-xl border border-slate-200">
                  <button
                    type="button"
                    onClick={() => setAttendanceFilterStatus("all")}
                    className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${attendanceFilterStatus === "all" ? "bg-white text-slate-900 shadow-xs font-bold" : "text-slate-600 hover:text-slate-900"
                      }`}
                  >
                    All ({classStudents.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setAttendanceFilterStatus("present")}
                    className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${attendanceFilterStatus === "present" ? "bg-white text-slate-900 shadow-xs font-bold" : "text-slate-600 hover:text-slate-900"
                      }`}
                  >
                    Present ({presentCount})
                  </button>
                  <button
                    type="button"
                    onClick={() => setAttendanceFilterStatus("absent")}
                    className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${attendanceFilterStatus === "absent" ? "bg-white text-slate-900 shadow-xs font-bold" : "text-slate-600 hover:text-slate-900"
                      }`}
                  >
                    Absent ({absentCount})
                  </button>
                  <button
                    type="button"
                    onClick={() => setAttendanceFilterStatus("od")}
                    className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${attendanceFilterStatus === "od" ? "bg-white text-slate-900 shadow-xs font-bold" : "text-slate-600 hover:text-slate-900"
                      }`}
                  >
                    OD ({odCount})
                  </button>
                </div>

                {/* Search & Actions */}
                <div className="flex items-center gap-2 w-full md:w-auto">
                  <div className="relative flex-1 md:w-56">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                    <input
                      type="text"
                      placeholder="Search student or roll..."
                      value={attendanceSearchTerm}
                      onChange={(e) => setAttendanceSearchTerm(e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded-lg pl-8 pr-7 py-1 text-xs text-slate-800 focus:outline-none focus:border-slate-400 font-semibold"
                    />
                    {attendanceSearchTerm && (
                      <button
                        type="button"
                        onClick={() => setAttendanceSearchTerm("")}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 rounded cursor-pointer"
                        title="Clear search"
                        aria-label="Clear search"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                  {!isPastDay && (
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleMarkAll("present")}
                        className="px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs transition-colors cursor-pointer whitespace-nowrap shadow-2xs"
                      >
                        All Present
                      </button>
                      <button
                        type="button"
                        onClick={() => handleMarkAll("absent")}
                        className="px-2.5 py-1 rounded-lg bg-white hover:bg-rose-50 text-rose-700 border border-rose-200 font-semibold text-xs transition-colors cursor-pointer whitespace-nowrap"
                      >
                        All Absent
                      </button>
                      <button
                        type="button"
                        onClick={() => setLocalAttendance(originalAttendance)}
                        className="px-2 py-1 text-slate-500 hover:text-slate-800 font-semibold text-xs cursor-pointer"
                      >
                        Reset
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {formError && (
                <div className="p-3 mx-4 mt-3 bg-red-50 border border-red-200 rounded-xl flex items-start gap-2 text-xs text-red-600 shrink-0" role="alert">
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>{formError}</span>
                </div>
              )}

              {/* Roster Cards Grid - Clean Neutral Cards */}
              <div className="flex-1 overflow-y-auto p-4 bg-slate-50/40">
                {filteredStudents.length === 0 ? (
                  <div className="py-16 text-center text-slate-400 text-xs font-medium">
                    No students match your search or filter.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {filteredStudents.map((st, idx) => {
                      const status = localAttendance[st.id] || "present";
                      return (
                        <div
                          key={st.id}
                          onClick={() => handleToggleStudent(st.id)}
                          className="px-3.5 py-2.5 rounded-xl border border-slate-200 hover:border-slate-300 bg-white transition-all flex items-center justify-between gap-3 cursor-pointer select-none shadow-2xs"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <span className="w-6 h-6 rounded-md bg-slate-100 text-slate-600 font-mono text-[10px] font-bold flex items-center justify-center shrink-0">
                              {idx + 1}
                            </span>
                            <div className="min-w-0">
                              <p className="font-semibold text-xs text-slate-900 truncate">{st.name}</p>
                              <p className="font-mono tabular-nums text-xs font-bold text-slate-600 mt-0.5">{st.id}</p>
                            </div>
                          </div>

                          {/* 3 Status Switcher Pill */}
                          <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200/70 shrink-0" onClick={(e) => e.stopPropagation()}>
                            <button
                              type="button"
                              onClick={() => setStudentStatus(st.id, "present")}
                              className={`px-3.5 py-2 sm:px-2.5 sm:py-1 min-h-[44px] sm:min-h-[32px] rounded-md text-xs transition-all cursor-pointer ${status === "present"
                                ? "bg-emerald-600 text-white font-bold shadow-xs"
                                : "text-slate-500 hover:text-slate-900 font-medium"
                                }`}
                            >
                              Present
                            </button>
                            <button
                              type="button"
                              onClick={() => setStudentStatus(st.id, "absent")}
                              className={`px-3.5 py-2 sm:px-2.5 sm:py-1 min-h-[44px] sm:min-h-[32px] rounded-md text-xs transition-all cursor-pointer ${status === "absent"
                                ? "bg-rose-600 text-white font-bold shadow-xs"
                                : "text-slate-500 hover:text-rose-700 font-medium"
                                }`}
                            >
                              Absent
                            </button>
                            <button
                              type="button"
                              onClick={() => setStudentStatus(st.id, "od")}
                              className={`px-3.5 py-2 sm:px-2.5 sm:py-1 min-h-[44px] sm:min-h-[32px] rounded-md text-xs transition-all cursor-pointer ${status === "od"
                                ? "bg-blue-600 text-white font-bold shadow-xs"
                                : "text-slate-500 hover:text-blue-700 font-medium"
                                }`}
                            >
                              OD
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Studio Bottom Footer */}
              <div className="px-3.5 sm:px-5 py-3.5 bg-white border-t border-slate-200 flex flex-wrap sm:flex-nowrap items-center justify-between gap-3 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    setIsAttendanceStudioOpen(false);
                    setIsModalOpen(true);
                  }}
                  className="px-3.5 py-2 min-h-[40px] rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs transition-colors cursor-pointer flex items-center gap-1"
                >
                  <ChevronLeft className="w-4 h-4" /> Back to Options
                </button>

                <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                  <button
                    type="button"
                    onClick={() => setIsAttendanceStudioOpen(false)}
                    className="px-4 py-2 min-h-[40px] rounded-xl bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-semibold text-xs transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveAttendance}
                    disabled={isSubmittingAttendance || isPastDay || !isDayConfigSet || (isDayConfigSet && dayConfigDetails?.day_type === "holiday")}
                    className="px-5 py-2 min-h-[44px] rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs shadow-sm transition-all cursor-pointer flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed flex-1 sm:flex-initial"
                    title={!isDayConfigSet ? "CM must configure day order for this date first" : (dayConfigDetails?.day_type === "holiday" ? "Attendance cannot be marked on a holiday" : undefined)}
                  >
                    {isSubmittingAttendance ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin text-white" />
                        <span>Saving Attendance...</span>
                      </>
                    ) : (
                      <>
                        <Check className="w-4 h-4" />
                        <span>Save &amp; Submit Attendance ({classStudents.length} Students)</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </Dialog>
          );
        })()}

        {/* ══════════════════════════════════════════════════════════════════════ */}
        {/* POPUP 3: REQUEST CM EDIT PERMISSION FOR LATE ATTENDANCE              */}
        {/* ══════════════════════════════════════════════════════════════════════ */}
        {isCamEditRequestModalOpen && selectedCell && selectedCell.slot && (() => {
          const { name: deptShort, sem } = getShortClassGroup(selectedCell.slot.classGroup);

          const isCellAlreadyPending = requests.some(r =>
            r.slotId === selectedCell.slot!.id &&
            r.dateStr === selectedCell.dateStr &&
            isAnyPendingCmRequest(r.status) &&
            isLateAttendanceRequest(r)
          );

          const handleSubmitCamRequest = async (e: React.FormEvent) => {
            e.preventDefault();
            if (isCellAlreadyPending) {
              setFormError("A request for this session is already pending CM approval.");
              return;
            }
            if (swapSubmitting) return;
            if (!camRequestReason.trim()) {
              setFormError("Please provide a reason for requesting edit permission.");
              return;
            }

            setSwapSubmitting(true);
            setFormError("");

            try {
              // Submit as a handover request with special markers for CM late attendance approval
              await requestHandover(
                currentMentor.id,
                selectedCell.slot!.id,
                selectedCell.dateStr,
                selectedCell.dateFormatted,
                "cam_approval", // Normalized targetStaffId marker
                `Late Attendance Edit Request: ${camRequestReason.trim()}`,
                selectedCell.slot?.course,
                selectedCell.slot?.classGroup,
                "CM Approval (Late Attendance Edit)",
                "late_attendance"
              );

              setIsCamEditRequestModalOpen(false);
              setCamRequestReason("");
              toast("CM edit permission request submitted successfully!", "success");
            } catch (err: any) {
              setFormError(err.message || "Something went wrong.");
            } finally {
              setSwapSubmitting(false);
            }
          };

          return (
            <Dialog
              open={true}
              onOpenChange={(next) => {
                if (!next) {
                  setIsCamEditRequestModalOpen(false);
                  setCamRequestReason("");
                  setFormError("");
                }
              }}
              ariaLabel="Request edit permission for locked attendance"
              overlayClassName="bg-slate-950/60 backdrop-blur-sm p-4"
              panelClassName="max-w-lg bg-white rounded-2xl border-slate-200 p-6 space-y-0 flex flex-col overflow-hidden max-h-[90vh]"
            >
              {/* Header */}
              <div className="flex items-center justify-between pb-4 border-b border-slate-100 mb-4">
                <div>
                  <h3 className="text-lg font-bold text-slate-900 leading-tight flex items-center gap-2">
                    <AlertCircle className="w-5 h-5 text-amber-600" />
                    Request Edit Permission
                  </h3>
                  <p className="text-xs text-slate-500 font-medium mt-1">
                    This attendance record is locked. Request CM approval to edit.
                  </p>
                </div>
                <button
                  onClick={() => {
                    setIsCamEditRequestModalOpen(false);
                    setCamRequestReason("");
                    setFormError("");
                  }}
                  aria-label="Close edit permission request"
                  className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Session Details Card */}
              <div className="p-4 bg-slate-50 border border-slate-100 rounded-xl mb-4 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-bold text-slate-900 truncate">{selectedCell.slot.course}</span>
                  <span className="text-[11px] font-semibold px-2 py-1 rounded-md bg-indigo-100 text-amber-700 shrink-0">
                    {deptShort || "Class"}
                  </span>
                </div>
                <div className="flex items-center gap-3 text-xs text-slate-600 font-medium flex-wrap">
                  <span className="flex items-center gap-1">
                    <Calendar className="h-3.5 w-3.5" />
                    {selectedCell.dateFormatted}
                  </span>
                  <span>•</span>
                  <span className="flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5" />
                    {formatTimeLabel(selectedCell.time)}
                  </span>
                  {selectedCell.slot.location && (
                    <>
                      <span>•</span>
                      <span className="flex items-center gap-1">
                        <MapPin className="h-3.5 w-3.5" />
                        {selectedCell.slot.location}
                      </span>
                    </>
                  )}
                </div>
              </div>

              {/* Info Banner */}
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl mb-4 flex items-start gap-2">
                <AlertCircle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                <div className="text-xs text-amber-900">
                  <p className="font-bold mb-1">Attendance window has expired</p>
                  <p className="text-amber-700">
                    This session is past the standard edit window. Your request will be sent to the Campus Manager (CM) for approval.
                  </p>
                </div>
              </div>

              {isCellAlreadyPending && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-2 text-xs text-amber-900 mb-4">
                  <Clock className="h-4 w-4 text-amber-600 shrink-0 mt-0.5 animate-pulse" />
                  <div>
                    <p className="font-bold">Request Already Submitted</p>
                    <p className="text-amber-800 text-[11px] mt-0.5">
                      A request for this period is already awaiting Campus Manager review. Repeated or duplicate requests are not permitted.
                    </p>
                  </div>
                </div>
              )}

              {formError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-xl flex items-start gap-2 text-xs text-red-600 mb-4" role="alert">
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>{formError}</span>
                </div>
              )}

              {/* Form */}
              <form onSubmit={handleSubmitCamRequest} className="space-y-4">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-700 block">
                    Reason for Edit Request <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    rows={4}
                    placeholder="e.g., Student reported technical issues during online class, need to update attendance..."
                    value={camRequestReason}
                    onChange={(e) => setCamRequestReason(e.target.value)}
                    disabled={isCellAlreadyPending}
                    className="w-full bg-white border border-slate-200 rounded-xl p-3 text-xs text-slate-800 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500/20 focus:ring-2 focus:ring-indigo-100 disabled:opacity-60 disabled:bg-slate-50"
                    required
                    aria-label="Reason for Edit Request"
                  />
                  <p className="text-[11px] text-slate-400 font-medium">
                    Provide a clear justification for why this attendance record needs to be modified after the deadline.
                  </p>
                </div>

                {/* Action Buttons */}
                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setIsCamEditRequestModalOpen(false);
                      setCamRequestReason("");
                      setFormError("");
                    }}
                    className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold py-2.5 rounded-xl text-xs transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={swapSubmitting || isCellAlreadyPending || !camRequestReason.trim()}
                    className="flex-1 bg-zinc-900 hover:bg-zinc-800 text-white border border-white/10 font-bold py-2.5 rounded-xl text-xs shadow-sm transition-all cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {swapSubmitting ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Submitting...</span>
                      </>
                    ) : (
                      <>
                        <Send className="w-4 h-4" />
                        <span>Submit Request to CM</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            </Dialog>
          );
        })()}

        {(activeTab === "tracker") && (() => {
          // Direct Batch Creation courses for this mentor's campus
          const campusCourses = Array.from(
            new Set(
              (coursesList || [])
                .filter(c => !c.college_id || c.college_id === currentMentor?.college_id)
                .map(c => c.name.trim())
                .filter(Boolean)
            )
          ).sort();

          const mentorAssignedCourses = campusCourses.filter(courseName => {
            const cLower = courseName.toLowerCase();
            return (
              mentorClasses.some(cl => cl.toLowerCase().includes(cLower)) ||
              mySlots.some(s => (s.course || "").toLowerCase().includes(cLower) || (s.classGroup || "").toLowerCase().includes(cLower)) ||
              (currentMentor?.mentor_group || "").toLowerCase().includes(cLower) ||
              (currentMentor?.department || "").toLowerCase().includes(cLower)
            );
          });

          const deptOptions = mentorAssignedCourses.length > 0 ? mentorAssignedCourses : (campusCourses.length > 0 ? campusCourses : [currentMentor?.department || "General"]);
          const activeDept = trackerDept && deptOptions.includes(trackerDept)
            ? trackerDept
            : deptOptions[0] || currentMentor?.mentor_group || "";

          const selectedCourseObj = coursesList.find(c => c.name.trim().toLowerCase() === activeDept.trim().toLowerCase());
          const courseYears = selectedCourseObj?.years || 3;
          const standardSemesters = getSemestersForCourse(courseYears);

          const semesterOptions = Array.from(new Set([
            ...standardSemesters,
            ...subjectsList
              .filter(s => {
                if (s.college_id && currentMentor?.college_id && s.college_id !== currentMentor.college_id) return false;
                const d = (s.department || "").toLowerCase().trim();
                const mg = (s.mentor_group || "").toLowerCase().trim();
                const act = activeDept.toLowerCase().trim();
                const code = (selectedCourseObj?.code || "").toLowerCase().trim();
                return d === act || mg === act || (code && d === code) || d.startsWith(act) || act.startsWith(d);
              })
              .map(s => s.semester)
              .filter(Boolean)
          ])).sort((a, b) => {
            const na = parseInt((a || "").replace(/\D/g, "") || "0");
            const nb = parseInt((b || "").replace(/\D/g, "") || "0");
            return na - nb;
          });

          const defaultSems = ALL_SEMESTERS;
          const finalSemOptions = semesterOptions.length > 0 ? semesterOptions : defaultSems;
          const activeSem = trackerSem && finalSemOptions.includes(trackerSem)
            ? trackerSem
            : finalSemOptions[0] || "Semester 1";

          const subjectObjs = subjectsList.filter(s => {
            if (s.college_id && currentMentor?.college_id && s.college_id !== currentMentor.college_id) return false;
            const d = (s.department || "").toLowerCase().trim();
            const mg = (s.mentor_group || "").toLowerCase().trim();
            const act = activeDept.toLowerCase().trim();
            const matchDept = d === act || mg === act || (d.length > 2 && act.includes(d)) || (act.length > 2 && d.includes(act));
            const semNum = (s.semester || "").replace(/\D/g, "");
            const actSemNum = activeSem.replace(/\D/g, "");
            const matchSem = s.semester?.toLowerCase().trim() === activeSem.toLowerCase().trim() || (semNum && actSemNum && semNum === actSemNum);
            return matchDept && matchSem && isSkillSubject(s);
          });

          // Mentor's own subjects (from profile + timetable slots + mentor group)
          const explicitMentorSubjects: string[] = Array.from(new Set([
            ...mentorSubjects,
            ...(Array.isArray(currentMentor?.subjects) ? currentMentor.subjects : (currentMentor?.subjects ? (currentMentor.subjects as string).split(/,|\n/).map((s: string) => s.trim()) : [])),
            ...mySlots.map(s => s.course?.trim())
          ])).filter((s): s is string => Boolean(s));

          const mentorSubjectNames = new Set(explicitMentorSubjects.map(s => s.toLowerCase().trim()));

          // STRICT: ONLY show the mentor's own assigned SKILL subjects from Batch Creation
          const mentorSkillSubjects: string[] = explicitMentorSubjects.filter((s: string) => {
            const subObj = subjectsList.find(sub => sub.name.toLowerCase().trim() === s.toLowerCase().trim());
            return isSkillSubject(subObj || s);
          });
          const mentorFilteredSubjectObjs = subjectObjs.filter(s => mentorSubjectNames.has(s.name.toLowerCase().trim()) && isSkillSubject(s));

          const subjectOptions: string[] = Array.from(new Set(
            mentorFilteredSubjectObjs.length > 0
              ? mentorFilteredSubjectObjs.map(s => s.name?.trim()).filter(Boolean)
              : mentorSkillSubjects.length > 0
                ? mentorSkillSubjects.map(s => s?.trim()).filter(Boolean)
                : []
          ));

          const activeSubj = trackerSubject && subjectOptions.includes(trackerSubject)
            ? trackerSubject
            : subjectOptions[0] || "";
          const activeClassGroup = `${activeDept} - ${activeSem}`;

          const currentTask = weeklyTasks.find(
            t => (isSubjectNameMatch(t.subject, activeSubj) || t.subject.toLowerCase().trim() === activeSubj.toLowerCase().trim()) &&
              t.week_number === trackerWeek &&
              (isCohortMatching(t.class_group, activeClassGroup, coursesList, subjectsList) ||
                t.class_group.toLowerCase().includes(activeDept.toLowerCase().trim()) ||
                activeClassGroup.toLowerCase().includes(t.class_group.toLowerCase().trim()))
          );

          const classStudents = memoizedTrackerClassStudents;

          const exportTrackerData = async () => {
            try {
              const XLSX = await import("xlsx");
              const dataRows = classStudents.map((student, idx) => {
                const rowObj: Record<string, any> = {
                  "S.No": idx + 1,
                  "Student ID": student.id,
                  "Student Name": student.name,
                  "Register No": student.register_number || "—",
                  "Email": student.email,
                  "Department": activeDept,
                  "Semester": activeSem,
                  "Subject": activeSubj,
                  "Class Group": student.classGroup || activeClassGroup
                };

                for (let wk = 1; wk <= 15; wk++) {
                  const entry = studentTracker.find(
                    e => e.student_id === student.id &&
                      e.subject.toLowerCase().trim() === activeSubj.toLowerCase().trim() &&
                      e.week_number === wk
                  );
                  rowObj[`W${wk} Status`] = entry?.submission_url ? "Submitted" : "Not Submitted";
                  rowObj[`W${wk} Link`] = entry?.submission_url || "—";
                  rowObj[`W${wk} Marks`] = entry?.marks !== undefined && entry?.marks !== null ? entry.marks : "—";
                }

                return rowObj;
              });

              const worksheet = XLSX.utils.json_to_sheet(dataRows);
              const workbook = XLSX.utils.book_new();
              XLSX.utils.book_append_sheet(workbook, worksheet, "Weekly Marks");

              const filename = `${activeClassGroup.replace(/[^a-zA-Z0-9]/g, "_")}_${activeSubj.replace(/[^a-zA-Z0-9]/g, "_")}_Tracker.xlsx`;
              XLSX.writeFile(workbook, filename);
              toast("Tracker data exported successfully!", "success");
            } catch (err: any) {
              console.error("Export error:", err);
              toast("Failed to export tracker data.", "error");
            }
          };

          return (
            <div className="space-y-6 font-sans">
              {/* Interactive 4-Dropdown Selector Bar: Department -> Semester -> Subject -> Week */}
              <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-card font-sans">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 flex-1">
                    {/* 1. Department */}
                    <div className="space-y-1">
                      <label className="text-[10px] text-slate-500 font-extrabold uppercase tracking-wider block">Department</label>
                      <select
                        value={activeDept}
                        onChange={(e) => {
                          const newDept = e.target.value;
                          setTrackerDept(newDept);
                          setTrackerSem("");
                          setTrackerSubject("");
                          // Sync trackerClassGroup to best matching mentor class group
                          const bestMatch = mentorClasses.find(c => c.toLowerCase().includes(newDept.toLowerCase()));
                          if (bestMatch) setTrackerClassGroup(bestMatch);
                        }}
                        className="w-full text-xs font-semibold px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500/20 bg-white text-slate-800 cursor-pointer"
                        aria-label="Department"
                      >
                        {deptOptions.map(d => <option key={d} value={d}>{d}</option>)}
                      </select>
                    </div>

                    {/* 2. Semester */}
                    <div className="space-y-1">
                      <label className="text-[10px] text-slate-500 font-extrabold uppercase tracking-wider block">Semester</label>
                      <select
                        value={activeSem}
                        onChange={(e) => {
                          const newSem = e.target.value;
                          setTrackerSem(newSem);
                          setTrackerSubject("");
                          // Sync trackerClassGroup to best matching mentor class group
                          const semNum = newSem.replace(/\D/g, "");
                          const bestMatch = mentorClasses.find(c =>
                            c.toLowerCase().includes(activeDept.toLowerCase()) &&
                            (c.toLowerCase().includes(`semester ${semNum}`) || c.toLowerCase().includes(`sem ${semNum}`))
                          ) || mentorClasses.find(c => c.toLowerCase().includes(activeDept.toLowerCase()));
                          if (bestMatch) setTrackerClassGroup(bestMatch);
                        }}
                        className="w-full text-xs font-semibold px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500/20 bg-white text-slate-800 cursor-pointer"
                        aria-label="Semester"
                      >
                        {finalSemOptions.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>

                    {/* 3. Subject */}
                    <div className="space-y-1">
                      <label className="text-[10px] text-slate-500 font-extrabold uppercase tracking-wider block">Subject</label>
                      <select
                        value={activeSubj}
                        onChange={(e) => setTrackerSubject(e.target.value)}
                        className="w-full text-xs font-semibold px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500/20 bg-white text-slate-800 cursor-pointer"
                        aria-label="Subject"
                      >
                        {subjectOptions.map((s: string) => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>

                    {/* 4. Week */}
                    <div className="space-y-1">
                      <label className="text-[10px] text-slate-500 font-extrabold uppercase tracking-wider block">Week</label>
                      <select
                        value={trackerWeek}
                        onChange={(e) => setTrackerWeek(parseInt(e.target.value, 10))}
                        className="w-full text-xs font-semibold px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500/20 bg-white text-slate-800 cursor-pointer"
                        aria-label="Week"
                      >
                        {Array.from({ length: 15 }, (_, i) => i + 1).map(wk => (
                          <option key={wk} value={wk}>Week {wk} {wk % 2 === 0 ? "(Assessment)" : ""}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Export Button */}
                  <div className="flex items-center gap-2 shrink-0 pt-2 lg:pt-0">
                    <button
                      type="button"
                      onClick={exportTrackerData}
                      disabled={classStudents.length === 0}
                      className="px-4 py-2.5 rounded-xl text-xs font-bold border border-slate-200 hover:bg-slate-50 text-slate-700 flex items-center justify-center gap-2 cursor-pointer transition-all disabled:opacity-50 disabled:cursor-not-allowed bg-white shadow-xs"
                    >
                      <Download className="h-4 w-4 text-slate-500" />
                      <span>Export Report</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Task Assignment Feature Card */}
              {(() => {
                const currentTask = weeklyTasks.find(
                  t => t.subject.toLowerCase().trim() === activeSubj.toLowerCase().trim() &&
                    t.week_number === trackerWeek &&
                    (isCohortMatching(t.class_group, activeClassGroup, coursesList, subjectsList) ||
                      t.class_group === trackerClassGroup)
                );

                return (
                  <div className="bg-gradient-to-r from-indigo-500/5 via-teal-500/5 to-transparent border border-indigo-100 rounded-xl p-5 shadow-xs space-y-3 font-sans">
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-indigo-100/50 pb-3">
                      <div className="flex items-center gap-2.5">
                        <div className="p-2 rounded-xl bg-indigo-50 border border-indigo-100 text-amber-600">
                          <BookOpen className="h-4 w-4" />
                        </div>
                        <div>
                          <h3 className="text-xs font-black text-slate-800 uppercase tracking-widest flex items-center gap-2">
                            Week {trackerWeek} Task Assignment
                            {trackerWeek % 2 === 0 ? (
                              <span className="px-2 py-0.5 bg-rose-100 text-rose-700 rounded-md text-[9px] font-extrabold tracking-wide border border-rose-200">
                                BI-WEEKLY VIVA &amp; ASSESSMENT
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded-md text-[9px] font-extrabold tracking-wide border border-emerald-200">
                                REGULAR TASK
                              </span>
                            )}
                          </h3>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        {currentTask ? (
                          <>
                            <button
                              onClick={() => {
                                setTrackerTaskName(currentTask.task_name || "");
                                setTrackerTaskPdf(currentTask.task_pdf_url || "");
                                setEditingTask(true);
                              }}
                              className="px-3.5 py-1.5 rounded-xl text-xs font-bold border border-slate-200 hover:bg-slate-50 text-slate-700 bg-white shadow-xs flex items-center gap-1.5 cursor-pointer transition-all shrink-0"
                            >
                              <BookOpen className="h-3.5 w-3.5 text-amber-600" />
                              <span>Edit Task</span>
                            </button>

                            <button
                              disabled={deletingWeeklyTask}
                              onClick={async () => {
                                if (deletingWeeklyTask) return;
                                const confirmed = await showConfirm({
                                  title: `Delete Week ${trackerWeek} Task?`,
                                  message: `Are you sure you want to delete the task "${currentTask.task_name}" for ${activeSubj} (Week ${trackerWeek})? This will remove the task assignment and student tracker data for this week.`,
                                  confirmLabel: "Delete Task",
                                  cancelLabel: "Cancel",
                                  danger: true
                                });
                                if (!confirmed) return;

                                setDeletingWeeklyTask(true);
                                try {
                                  const res = await deleteWeeklyTask(currentTask.class_group, activeSubj, trackerWeek);
                                  if (res.success) {
                                    toast(`Week ${trackerWeek} task deleted successfully.`, "success");
                                  } else {
                                    toast(res.message || "Failed to delete task.", "error");
                                  }
                                } finally {
                                  setDeletingWeeklyTask(false);
                                }
                              }}
                              className="px-3.5 py-1.5 rounded-xl text-xs font-bold border border-rose-200 hover:bg-rose-50 text-rose-600 bg-white shadow-xs flex items-center gap-1.5 cursor-pointer transition-all shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              <Trash2 className="h-3.5 w-3.5 text-rose-600" />
                              <span>Delete Task</span>
                            </button>
                          </>
                        ) : (
                          <button
                            onClick={() => {
                              setTrackerTaskName("");
                              setTrackerTaskPdf("");
                              setEditingTask(true);
                            }}
                            className="btn-gradient px-4 py-2 rounded-xl text-xs font-bold text-white shadow-sm flex items-center gap-1.5 cursor-pointer transition-all shrink-0"
                          >
                            <Plus className="h-3.5 w-3.5" />
                            <span>Assign Task</span>
                          </button>
                        )}
                      </div>
                    </div>

                    {currentTask ? (
                      <div className="bg-white border border-slate-100 p-4 rounded-xl flex flex-col md:flex-row justify-between md:items-center gap-4 shadow-card">
                        <div className="space-y-2">
                          <div className="flex items-center gap-2">
                            <span className="px-2 py-0.5 bg-amber-50 text-amber-800 text-[10px] font-extrabold font-mono rounded border border-indigo-100">
                              Week {trackerWeek}
                            </span>
                            <div className="text-sm font-extrabold text-slate-900 leading-snug">
                              {currentTask.task_name}
                            </div>
                          </div>
                          {currentTask.task_pdf_url ? (
                            <a
                              href={currentTask.task_pdf_url}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1.5 text-[10.5px] font-bold text-amber-600 bg-indigo-50 border border-indigo-100 px-3 py-1 rounded-lg hover:bg-indigo-100 transition-colors"
                            >
                              <FileText className="h-3.5 w-3.5 text-amber-600" />
                              <span>View Reference Document</span>
                            </a>
                          ) : (
                            <span className="text-[10px] text-slate-400 italic block">No reference document attached</span>
                          )}
                        </div>

                        <div className="flex flex-col md:items-end text-[10px] text-slate-500 font-medium gap-1 shrink-0 border-t md:border-t-0 pt-2 md:pt-0 border-slate-100">
                          {(() => {
                            const assigned = parseDbDate(currentTask.created_at || currentTask.updated_at);
                            const deadline = new Date(assigned.getTime() + 7 * 24 * 60 * 60 * 1000);
                            const isExpired = new Date() > deadline;
                            return (
                              <>
                                <div className="flex items-center gap-1">
                                  <span className="text-slate-400 font-semibold">Assigned Date:</span>
                                  <span className="font-bold text-slate-700">{assigned.toLocaleDateString()} {assigned.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                </div>
                                <div className="flex items-center gap-1">
                                  <span className="text-slate-400 font-semibold">Submission Deadline:</span>
                                  <span className={`font-extrabold ${isExpired ? "text-rose-600" : "text-emerald-600"}`}>
                                    {deadline.toLocaleDateString()}{isExpired ? " (Expired)" : ""}
                                  </span>
                                </div>
                              </>
                            );
                          })()}
                        </div>
                      </div>
                    ) : (
                      <div className="text-center py-6 bg-white/60 border border-dashed border-indigo-200 rounded-xl flex flex-col items-center justify-center gap-2">
                        <p className="text-xs text-slate-500 font-medium">No task assigned for Week {trackerWeek} in {activeSubj} yet.</p>
                        <button
                          onClick={() => {
                            setTrackerTaskName("");
                            setTrackerTaskPdf("");
                            setEditingTask(true);
                          }}
                          className="px-4 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white border border-white/10 text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-sm transition-all"
                        >
                          <Plus className="h-3.5 w-3.5" />
                          <span>Assign Week {trackerWeek} Task</span>
                        </button>
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Student Submissions & Evaluation */}
              <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-card space-y-5">
                {/* Student Submissions Header */}
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 rounded-xl bg-slate-700">
                      <ClipboardList className="h-4 w-4 text-white" />
                    </div>
                    <h3 className="text-xs font-black text-slate-800 uppercase tracking-widest">
                      Student Submissions &amp; Evaluation
                    </h3>
                  </div>
                  {(() => {
                    // Use pre-computed memoized tracker stats — no inline nested loops
                    const stats = memoizedTrackerStats;
                    if (!stats || stats.totalStudents === 0) return null;
                    const { overallPct, avgScore, assignedWeeksCount, currentWeekSubmittedCount, totalStudents } = stats;

                    return (
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-[10px] font-bold">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="bg-amber-50 text-amber-800 px-3 py-1.5 rounded-full border border-indigo-100 flex items-center gap-1.5">
                            <Sparkles className="h-3 w-3 text-amber-500" />
                            <span>15-Wk Completion: <strong className="text-indigo-900">{overallPct}%</strong></span>
                          </span>
                          <span className="bg-emerald-50 text-emerald-700 px-3 py-1.5 rounded-full border border-emerald-200">
                            Avg Marks: <strong className="text-emerald-900">{avgScore} / 10</strong>
                          </span>
                          <span className="bg-amber-50 text-amber-700 px-3 py-1.5 rounded-full border border-amber-200">
                            Tasks Assigned: <strong className="text-amber-900">{assignedWeeksCount} / 15 Weeks</strong>
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="bg-emerald-100 text-emerald-700 px-3 py-1.5 rounded-full border border-emerald-200">
                            W{trackerWeek} Submitted: {currentWeekSubmittedCount} / {totalStudents}
                          </span>
                          <span className="bg-rose-100 text-rose-700 px-3 py-1.5 rounded-full border border-rose-200">
                            Not Submitted: {totalStudents - currentWeekSubmittedCount}
                          </span>
                        </div>
                      </div>
                    );
                  })()}
                </div>
                {(() => {
                  const classStudents = memoizedTrackerClassStudents;
                  const assignedWeeksCount = Array.from({ length: 15 }, (_, i) => i + 1).filter(wk =>
                    weeklyTasks.some(t => isCohortMatching(t.class_group, activeClassGroup, coursesList, subjectsList) && t.subject.toLowerCase().trim() === activeSubj.toLowerCase().trim() && t.week_number === wk)
                  ).length;

                  if (classStudents.length === 0) {
                    return (
                      <div className="text-center py-8">
                        <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-slate-50 mb-2">
                          <Users className="h-6 w-6 text-slate-300" />
                        </div>
                        <p className="text-xs text-slate-500 italic">No students registered in class &ldquo;{activeClassGroup}&rdquo;.</p>
                      </div>
                    );
                  }

                  // 1. Filter the classStudents based on deferredTrackerSearch and trackerStatusFilter
                  const qTracker = (deferredTrackerSearch || "").toLowerCase().trim();
                  const filteredClassStudents = classStudents.filter(student => {
                    const matchesSearch = !qTracker || student.name.toLowerCase().includes(qTracker) ||
                      student.id.toLowerCase().includes(qTracker);

                    const entry = studentTracker.find(
                      e => e.student_id === student.id &&
                        e.subject.toLowerCase().trim() === activeSubj.toLowerCase().trim() &&
                        e.week_number === trackerWeek
                    );

                    const isSubmitted = !!entry?.submission_url;

                    if (trackerStatusFilter === "submitted") return matchesSearch && isSubmitted;
                    if (trackerStatusFilter === "not_submitted") return matchesSearch && !isSubmitted;
                    return matchesSearch;
                  });

                  // Paginate filtered students
                  const totalItems = filteredClassStudents.length;
                  const totalPages = trackerPageSize === -1 ? 1 : Math.ceil(totalItems / trackerPageSize);
                  const validPage = Math.min(Math.max(1, trackerPage), totalPages || 1);

                  const paginatedStudents = trackerPageSize === -1
                    ? filteredClassStudents
                    : filteredClassStudents.slice((validPage - 1) * trackerPageSize, validPage * trackerPageSize);

                  // Helper: Save all Skill Dev marks
                  const handleSaveAllSkillMarks = async () => {
                    const studentKeys = Object.keys(skillMarksDraft);
                    if (studentKeys.length === 0) {
                      toast("All marks are already up to date.", "info");
                      return;
                    }
                    setIsSavingAllSkillMarks(true);
                    let successCount = 0;
                    try {
                      for (const sId of studentKeys) {
                        const val = skillMarksDraft[sId];
                        const sObj = classStudents.find(s => s.id === sId);
                        if (!sObj) continue;
                        setSaveStatusMap(prev => ({ ...prev, [sId]: "saving" }));
                        const res = await gradeStudentTask({
                          studentId: sId,
                          classGroup: sObj.classGroup || activeClassGroup,
                          subject: activeSubj,
                          weekNumber: trackerWeek,
                          marks: val !== "" && val !== undefined ? parseFloat(val) : null as any,
                          gradedBy: currentMentor?.id || ""
                        });
                        if (res.success) {
                          successCount++;
                          setSaveStatusMap(prev => ({ ...prev, [sId]: "saved" }));
                        } else {
                          setSaveStatusMap(prev => ({ ...prev, [sId]: "error" }));
                        }
                      }
                      setSkillMarksDraft({});
                      toast(`Saved marks for ${successCount} student(s) successfully!`, "success");
                    } catch (err: any) {
                      toast("Failed to save marks: " + err.message, "error");
                    } finally {
                      setIsSavingAllSkillMarks(false);
                      setTimeout(() => {
                        setSaveStatusMap({});
                      }, 2500);
                    }
                  };

                  return (
                    <div className="space-y-4">
                      {/* Filters Header Bar */}
                      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-slate-50 p-4 rounded-xl border border-slate-100">
                        <div className="flex flex-wrap items-center gap-3">
                          <div className="relative">
                            <input
                              type="text"
                              value={trackerSearchTerm}
                              onChange={(e) => setTrackerSearchTerm(e.target.value)}
                              placeholder=" Search by student name or roll..."
                              className="pl-4 pr-4 py-2.5 text-xs border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 w-64 bg-white font-medium text-slate-800"
                            />
                          </div>
                          <select aria-label="Status filter"
                            value={trackerStatusFilter}
                            onChange={(e) => setTrackerStatusFilter(e.target.value)}
                            className="px-3.5 py-2.5 text-xs border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 bg-white font-bold text-slate-700 cursor-pointer"
                          >
                            <option value="all">All Statuses</option>
                            <option value="submitted">Submitted</option>
                            <option value="not_submitted">Not Submitted</option>
                          </select>
                        </div>

                        <div className="flex items-center gap-3">
                          <button
                            type="button"
                            onClick={handleSaveAllSkillMarks}
                            disabled={isSavingAllSkillMarks}
                            className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs flex items-center gap-2 shadow-xs transition-all cursor-pointer disabled:opacity-50"
                          >
                            {isSavingAllSkillMarks ? (
                              <>
                                <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                                <span>Saving All Marks...</span>
                              </>
                            ) : (
                              <>
                                <Save className="w-4 h-4" />
                                <span>Save All Marks (Week {trackerWeek})</span>
                              </>
                            )}
                          </button>

                          <div className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wider">
                            Showing {paginatedStudents.length} of {filteredClassStudents.length} Filtered ({classStudents.length} Total)
                          </div>
                        </div>
                      </div>

                      <div className="overflow-x-auto rounded-xl border border-slate-200 shadow-xs bg-white scroll-touch">
                        <table className="w-full border-collapse text-left text-xs font-semibold min-w-[980px]">
                          <thead>
                            <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase text-[9.5px] whitespace-nowrap">
                              <th className="p-4 w-[50px] text-center border-r border-slate-100/60">S.No</th>
                              <th className="p-4 border-r border-slate-100/60 min-w-[180px]">Student Name / Roll</th>
                              <th className="p-4 border-r border-slate-100/60 min-w-[260px]">15-Week Progress Matrix</th>
                              <th className="p-4 border-r border-slate-100/60 w-[130px]">W{trackerWeek} Status</th>
                              <th className="p-4 text-center border-r border-slate-100/60 w-[130px]">Submission Link</th>
                              <th className="p-4 text-center w-[110px]">Marks (0-10)</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 bg-white text-slate-700">
                            {paginatedStudents.map((student, idx) => {
                              const absoluteIdx = trackerPageSize === -1 ? idx : (validPage - 1) * trackerPageSize + idx;
                              const entry = studentTracker.find(
                                e => e.student_id === student.id &&
                                  e.subject.toLowerCase().trim() === activeSubj.toLowerCase().trim() &&
                                  e.week_number === trackerWeek
                              );

                              const currentMarks = entry?.marks !== undefined && entry?.marks !== null ? entry.marks : "";
                              const currentFeedback = entry?.viva_assessment || "";
                              const currentUrl = entry?.submission_url || "";
                              const status = saveStatusMap[student.id] || "idle";

                              return (
                                <tr key={`${student.id}_wk${trackerWeek}`} className="hover:bg-slate-50/50 transition-colors">
                                  <td className="p-4 text-center font-bold text-slate-400 border-r border-slate-100/60">
                                    {absoluteIdx + 1}
                                  </td>
                                  <td className="p-4 border-r border-slate-100/60">
                                    <div className="font-bold text-slate-800">{student.name}</div>
                                    <div className="text-[10px] text-slate-400 font-mono mt-0.5">{student.id}</div>
                                    {(() => {
                                      const { lc, hr } = getStudentCodingStats(student);
                                      if (!lc && !hr) return null;
                                      return (
                                        <div className="flex items-center gap-1 mt-1 flex-wrap">
                                          {lc && (
                                            <span className="px-1.5 py-0.2 rounded bg-amber-50 text-amber-900 border border-amber-200 text-[8.5px] font-black" title={`LeetCode Solved: ${lc.solvedTotal} (Easy:${lc.solvedEasy}, Med:${lc.solvedMedium}, Hard:${lc.solvedHard})`}>
                                              LC: {lc.solvedTotal}
                                            </span>
                                          )}
                                          {hr && (
                                            <span className="px-1.5 py-0.2 rounded bg-emerald-50 text-emerald-900 border border-emerald-200 text-[8.5px] font-black" title={`HackerRank: ${hr.rank ? `Rank #${hr.rank}` : `${hr.solved} Solved`}`}>
                                              HR: {hr.rank ? `#${hr.rank}` : `${hr.solved}`}
                                            </span>
                                          )}
                                        </div>
                                      );
                                    })()}
                                  </td>
                                  <td className="p-3 border-r border-slate-100/60">
                                    {(() => {
                                      let studentSubmittedWeeks = 0;
                                      let studentGradedWeeks = 0;

                                      const dots = Array.from({ length: 15 }, (_, i) => i + 1).map(wk => {
                                        const isAssigned = weeklyTasks.some(
                                          t => isCohortMatching(t.class_group, activeClassGroup, coursesList, subjectsList) && t.subject.toLowerCase().trim() === activeSubj.toLowerCase().trim() && t.week_number === wk
                                        );
                                        const stEntry = studentTracker.find(
                                          e => e.student_id === student.id &&
                                            e.subject.toLowerCase().trim() === activeSubj.toLowerCase().trim() &&
                                            e.week_number === wk
                                        );
                                        const isSubmitted = !!stEntry?.submission_url;
                                        const isGraded = stEntry?.marks !== undefined && stEntry?.marks !== null;

                                        if (isSubmitted) studentSubmittedWeeks++;
                                        if (isGraded) studentGradedWeeks++;

                                        let colorClass = "bg-slate-100 text-slate-400 hover:bg-slate-200";
                                        if (isGraded) colorClass = "bg-zinc-900 text-white font-bold shadow-xs";
                                        else if (isSubmitted) colorClass = "bg-emerald-500 text-white font-bold shadow-xs";
                                        else if (isAssigned) colorClass = "bg-rose-100 text-rose-700 font-bold border border-rose-200";

                                        const isCurrent = trackerWeek === wk;

                                        return (
                                          <button
                                            key={wk}
                                            type="button"
                                            onClick={() => setTrackerWeek(wk)}
                                            title={`Week ${wk}: ${isSubmitted ? (isGraded ? `Graded (${stEntry?.marks}/10)` : "Submitted") : isAssigned ? "Pending Submission" : "Unassigned"} - Click to view`}
                                            className={`h-5 w-5 rounded-md text-[8.5px] font-black transition-all flex items-center justify-center cursor-pointer ${colorClass} ${isCurrent ? "ring-2 ring-amber-500 scale-110 z-10 shadow-sm" : ""
                                              }`}
                                          >
                                            {wk}
                                          </button>
                                        );
                                      });

                                      const completionPct = assignedWeeksCount > 0 ? Math.round((studentSubmittedWeeks / assignedWeeksCount) * 100) : 0;

                                      return (
                                        <div className="space-y-1.5 min-w-[220px]">
                                          <div className="flex items-center justify-between text-[10px]">
                                            <span className="font-extrabold text-slate-700">{studentSubmittedWeeks} / {assignedWeeksCount || 15} Wks ({completionPct}%)</span>
                                            {studentGradedWeeks > 0 && (
                                              <span className="text-[9px] font-black text-amber-600 bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-100">
                                                {studentGradedWeeks} Graded
                                              </span>
                                            )}
                                          </div>
                                          <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                                            <div
                                              className="bg-gradient-to-r from-emerald-500 to-indigo-600 h-1.5 rounded-full transition-all duration-300"
                                              style={{ width: `${Math.min(100, completionPct)}%` }}
                                            />
                                          </div>
                                          <div className="flex flex-wrap items-center gap-1 pt-0.5">
                                            {dots}
                                          </div>
                                        </div>
                                      );
                                    })()}
                                  </td>
                                  <td className="p-4 border-r border-slate-100/60">
                                    <div className="flex items-center gap-2">
                                      {currentUrl ? (
                                        <span className="text-[9px] font-black uppercase text-emerald-700 bg-emerald-50 border border-emerald-200/80 px-2 py-1 rounded-md">
                                          Submitted
                                        </span>
                                      ) : (
                                        <span className="text-[9px] font-black uppercase text-rose-700 bg-rose-50 border border-rose-200/80 px-2 py-1 rounded-md">
                                          Not Submitted
                                        </span>
                                      )}

                                      {/* Sync Status Icon */}
                                      {status === "saving" && (
                                        <span className="w-3.5 h-3.5 border-2 border-amber-500 border-t-transparent rounded-full animate-spin"></span>
                                      )}
                                      {status === "saved" && (
                                        <CheckCircle className="h-4 w-4 text-emerald-600" />
                                      )}
                                      {status === "error" && (
                                        <AlertCircle className="h-4 w-4 text-rose-500" />
                                      )}
                                    </div>
                                  </td>
                                  <td className="p-4 text-center border-r border-slate-100/60 font-semibold">
                                    {currentUrl ? (
                                      <a
                                        href={currentUrl}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="inline-flex items-center justify-center gap-1 text-xs font-bold text-amber-700 hover:text-amber-800 hover:underline"
                                      >
                                        <BookOpen className="h-3.5 w-3.5" />
                                        <span>View Work</span>
                                      </a>
                                    ) : (
                                      <span className="text-slate-300 text-xs">—</span>
                                    )}
                                  </td>
                                  <td className="p-4">
                                    <input
                                      type="number"
                                      min="0"
                                      max="10"
                                      step="0.5"
                                      value={skillMarksDraft[student.id] !== undefined ? skillMarksDraft[student.id] : (currentMarks !== "" ? String(currentMarks) : "")}
                                      onChange={(e) => {
                                        const val = e.target.value;
                                        setSkillMarksDraft(prev => ({ ...prev, [student.id]: val }));
                                      }}
                                      onBlur={async (e) => {
                                        const val = e.target.value;
                                        if (val === String(currentMarks)) return;
                                        if (val !== "" && (parseFloat(val) < 0 || parseFloat(val) > 10)) {
                                          toast("Marks must be between 0 and 10.", "warning");
                                          return;
                                        }
                                        setSaveStatusMap(prev => ({ ...prev, [student.id]: "saving" }));
                                        const res = await gradeStudentTask({
                                          studentId: student.id,
                                          classGroup: student.classGroup || activeClassGroup,
                                          subject: activeSubj,
                                          weekNumber: trackerWeek,
                                          marks: val !== "" ? parseFloat(val) : null as any,
                                          gradedBy: currentMentor?.id || ""
                                        });
                                        setSaveStatusMap(prev => ({ ...prev, [student.id]: res.success ? "saved" : "error" }));
                                        setTimeout(() => {
                                          setSaveStatusMap(prev => ({ ...prev, [student.id]: "idle" }));
                                        }, 2000);
                                      }}
                                      placeholder="—"
                                      className="w-full text-center text-xs font-black px-2 py-1.5 rounded-lg border border-slate-200 inset-shadow-well focus:bg-white dark:focus:bg-[#131317] focus:outline-none focus:ring-1 focus:ring-emerald-400 bg-sunken text-slate-800"
                                      aria-label="Marks (0-10)"
                                    />
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>

                      {/* Pagination Bar */}
                      <div className="pt-3 border-t border-slate-100">
                        <Pagination
                          currentPage={validPage}
                          totalItems={totalItems}
                          pageSize={trackerPageSize <= 0 ? 50 : trackerPageSize}
                          pageSizeOptions={[10, 25, 50, 100]}
                          onPageChange={setTrackerPage}
                          onPageSizeChange={(newSize) => {
                            setTrackerPageSize(newSize);
                            setTrackerPage(1);
                          }}
                        />
                      </div>

                      {/* Assign / Edit Task Modal */}
                      {editingTask && (
                        <Dialog
                          open={editingTask}
                          onOpenChange={(next) => { if (!next) setEditingTask(false); }}
                          ariaLabel={currentTask ? "Edit assignment details" : "Assign new task"}
                          overlayClassName="bg-slate-950/60 backdrop-blur-sm p-4"
                          panelClassName="bg-white rounded-xl border-gray-100 shadow-card-lg max-w-2xl overflow-hidden flex flex-col max-h-[90vh] p-0 space-y-0"
                        >
                          <div className="flex justify-between items-center px-6 py-4 border-b border-gray-100 bg-gray-50">
                            <h3 className="font-extrabold text-gray-900 text-sm flex items-center gap-1.5">
                              <BookOpen className="h-5 w-5 text-amber-600" />
                              <span>{currentTask ? "Edit Assignment Details" : "Assign New Task"}</span>
                            </h3>
                            <button
                              onClick={() => setEditingTask(false)}
                              aria-label="Close task form"
                              className="p-1 hover:bg-gray-200 rounded-lg transition-colors cursor-pointer text-gray-500 hover:text-gray-800"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </div>

                          <form
                            onSubmit={async (e) => {
                              e.preventDefault();
                              if (!trackerTaskName.trim()) {
                                toast("Task name is required.", "warning");
                                return;
                              }
                              const res = await assignWeeklyTask({
                                classGroup: activeClassGroup,
                                subject: activeSubj,
                                weekNumber: trackerWeek,
                                taskName: trackerTaskName,
                                taskPdfUrl: trackerTaskPdf || undefined,
                                mentorId: currentMentor?.id || ""
                              });
                              if (res.success) {
                                setEditingTask(false);
                                toast("Task assigned successfully!", "success");
                              } else {
                                toast(res.message || "Failed to save task.", "error");
                              }
                            }}
                            className="p-6 space-y-5"
                          >
                            <div className="space-y-4">
                              {/* Interactive Selectors in Modal - Synced directly with main filters */}
                              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                <div className="space-y-1">
                                  <label className="text-[10px] text-slate-500 font-extrabold uppercase tracking-wide block">Department &amp; Semester</label>
                                  <select
                                    value={activeDept}
                                    onChange={(e) => {
                                      setTrackerDept(e.target.value);
                                      setTrackerSem("");
                                      setTrackerSubject("");
                                    }}
                                    className="w-full text-xs font-bold px-3 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 bg-white text-slate-800 cursor-pointer truncate"
                                    aria-label="Department &amp; Semester"
                                  >
                                    {deptOptions.map(d => <option key={d} value={d}>{d} — {activeSem}</option>)}
                                  </select>
                                </div>
                                <div className="space-y-1">
                                  <label className="text-[10px] text-slate-500 font-extrabold uppercase tracking-wide block">Subject *</label>
                                  <select
                                    value={activeSubj}
                                    onChange={(e) => setTrackerSubject(e.target.value)}
                                    className="w-full text-xs font-bold px-3 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 bg-white text-slate-800 cursor-pointer truncate"
                                    aria-label="Subject"
                                  >
                                    {subjectOptions.map((s: string) => <option key={s} value={s}>{s}</option>)}
                                  </select>
                                </div>
                                <div className="space-y-1">
                                  <label className="text-[10px] text-slate-500 font-extrabold uppercase tracking-wide block">Week *</label>
                                  <select
                                    value={trackerWeek}
                                    onChange={(e) => setTrackerWeek(parseInt(e.target.value, 10))}
                                    className="w-full text-xs font-bold px-3 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 bg-white text-slate-800 cursor-pointer"
                                    aria-label="Week"
                                  >
                                    {Array.from({ length: 15 }, (_, i) => i + 1).map(wk => (
                                      <option key={wk} value={wk}>Week {wk} {wk % 2 === 0 ? "(Assessment)" : ""}</option>
                                    ))}
                                  </select>
                                </div>
                              </div>

                              <div className="space-y-1.5">
                                <label className="text-[10px] text-slate-500 font-extrabold uppercase tracking-wide block">
                                  Task Name / Description *
                                </label>
                                <input
                                  type="text"
                                  required
                                  value={trackerTaskName}
                                  onChange={(e) => setTrackerTaskName(e.target.value)}
                                  placeholder="e.g. Experiment 1: SQL Join Operations"
                                  className="w-full text-xs font-semibold px-4 py-3 rounded-xl border border-slate-200 inset-shadow-well focus:bg-white dark:focus:bg-[#131317] focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 bg-sunken text-slate-800"
                                  aria-label="Task Name / Description"
                                />
                              </div>

                              <div className="space-y-2">
                                <div className="flex gap-2">
                                  <button
                                    type="button"
                                    onClick={() => setTrackerUploadType("url")}
                                    className={`flex-1 py-2.5 text-xs font-bold rounded-xl border transition-all cursor-pointer ${trackerUploadType === "url" ? "bg-slate-900 text-white border-slate-900 shadow-xs" : "bg-white border-slate-200 text-slate-500 hover:bg-slate-50"}`}
                                  >
                                    URL Link
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setTrackerUploadType("file")}
                                    className={`flex-1 py-2.5 text-xs font-bold rounded-xl border transition-all cursor-pointer ${trackerUploadType === "file" ? "bg-slate-900 text-white border-slate-900 shadow-xs" : "bg-white border-slate-200 text-slate-500 hover:bg-slate-50"}`}
                                  >
                                    Upload File
                                  </button>
                                </div>

                                {trackerUploadType === "url" ? (
                                  <div className="space-y-1.5 mt-2">
                                    <label className="text-[10px] text-slate-500 font-extrabold uppercase tracking-wide block">
                                      Reference PDF URL / Drive Link
                                    </label>
                                    <input
                                      type="url"
                                      value={trackerTaskPdf}
                                      onChange={(e) => setTrackerTaskPdf(e.target.value)}
                                      placeholder="e.g. https://drive.google.com/..."
                                      className="w-full text-xs font-semibold px-4 py-3 rounded-xl border border-slate-200 inset-shadow-well focus:bg-white dark:focus:bg-[#131317] focus:outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 bg-sunken text-slate-800"
                                      aria-label="Reference PDF URL / Drive Link"
                                    />
                                  </div>
                                ) : (
                                  <div className="space-y-1.5 mt-2">
                                    <label className="text-[10px] text-slate-500 font-extrabold uppercase tracking-wide block">
                                      Choose Reference File
                                    </label>
                                    <label className="flex flex-col items-center justify-center w-full h-24 border-2 border-slate-300 border-dashed rounded-xl cursor-pointer bg-slate-50 hover:bg-slate-100 hover:border-amber-500/40 transition-all">
                                      <div className="flex flex-col items-center justify-center pt-5 pb-6">
                                        <Upload className="w-5 h-5 mb-1 text-slate-400" />
                                        <p className="text-[10px] text-slate-500 font-medium">Click to upload or drag and drop</p>
                                        <p className="text-[9px] text-slate-400 font-semibold mt-0.5">PDF, DOCX (MAX. 10MB)</p>
                                      </div>
                                      <input type="file" className="hidden" accept=".pdf,.docx,.doc,.pptx" onChange={(e) => {
                                        if (e.target.files && e.target.files[0]) {
                                          toast("File selected: " + e.target.files[0].name, "success");
                                          setTrackerTaskPdf(e.target.files[0].name);
                                        }
                                      }} />
                                    </label>
                                  </div>
                                )}
                              </div>
                            </div>

                            <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl flex items-center justify-between text-[11px] text-slate-700 font-medium">
                              <span>Deadline: <strong className="font-extrabold text-slate-900">1 Week from Assignment</strong></span>
                              <span className="px-2 py-0.5 bg-slate-200/80 text-slate-700 font-bold rounded-lg uppercase tracking-wider text-[9px]">
                                {trackerWeek % 2 === 0 ? "ASSESSMENT WEEK" : "REGULAR WEEK"}
                              </span>
                            </div>

                            <div className="flex justify-end gap-2.5 pt-2 border-t border-gray-100">
                              <button
                                type="button"
                                onClick={() => setEditingTask(false)}
                                className="px-4 py-2 hover:bg-gray-100 text-gray-700 rounded-xl transition-all font-bold cursor-pointer text-xs"
                              >
                                Cancel
                              </button>
                              <button
                                type="submit"
                                className="btn-gradient px-5 py-2 text-white rounded-xl shadow-sm transition-all font-bold cursor-pointer text-xs flex items-center gap-1.5"
                              >
                                <BookOpen className="h-3.5 w-3.5" />
                                <span>Save Task</span>
                              </button>
                            </div>
                          </form>
                        </Dialog>
                      )}
                    </div>
                  );
                })()}
              </div>
            </div>
          );
        })()}

        {/* Standalone Dedicated Interview Module Tab */}
        {activeTab === "interviews" && (
          <div className="space-y-6 font-sans">
            <InterviewModule currentUserRole="mentor" currentUserName={currentMentor?.name || "Mentor"} />
          </div>
        )}

        {/* ── Tab: My Skill Tracker (Mentor Skill Development — SME verdicts) ── */}
        {activeTab === "my_skill_tracker" && currentMentor && (
          <div className="space-y-6">
            <SkillTrackerPanel
              role="mentor"
              mentorId={currentMentor.id}
              mentorName={currentMentor.name}
              collegeId={currentMentor.college_id}
              collegeName={colleges.find(c => c.id === currentMentor.college_id)?.name}
            />
          </div>
        )}

        {/* ── Tab: Weekly Teaching Plan Studio ── */}
        {activeTab === "weekly_plan" && currentMentor && (
          <div className="space-y-6">
            <MentorWeeklyPlanStudio
              mentorId={currentMentor.id}
              mentorName={currentMentor.name}
              collegeId={currentMentor.college_id}
              collegeName={colleges.find(c => c.id === currentMentor.college_id)?.name}
              department={currentMentor.department}
              assignedClasses={mentorClasses}
              assignedSubjects={mentorSubjects}
            />
          </div>
        )}

        {/* ── Tab: Academic Tracker (Date-Wise Period Topic, Unit, and Remarks Log) ── */}
        {activeTab === "academic_tracker" && (() => {
          // Mentor's assigned academic subjects from Batch Creation (type "ACADEMIC" / non-skill)
          const mentorAcademicSubjects = mentorSubjects.filter(s => {
            const subObj = subjectsList.find(sub => sub.name.toLowerCase().trim() === s.toLowerCase().trim());
            return isAcademicSubject(subObj || s);
          });
          const availableAcadSubjects = mentorAcademicSubjects.length > 0 ? mentorAcademicSubjects : mentorSubjects.filter(s => {
            const subObj = subjectsList.find(sub => sub.name.toLowerCase().trim() === s.toLowerCase().trim());
            return isAcademicSubject(subObj || s);
          });
          const currentSelectedSubject = acadTrackerSubject && acadTrackerSubject !== "all"
            ? acadTrackerSubject
            : "";

          // Mentor's class groups
          const mentorClassesList = Array.from(new Set([
            ...mentorClasses,
            ...mySlots.map(s => s.classGroup).filter(Boolean)
          ]));

          // Mentor's academic tracker records
          const myLogs = (academicTracker || []).filter(log =>
            log.mentor_id === currentMentor.id ||
            (currentMentor.email && log.mentor_id?.toLowerCase().trim() === currentMentor.email.toLowerCase().trim()) ||
            (log.mentor_name && log.mentor_name?.toLowerCase().trim() === currentMentor.name?.toLowerCase().trim())
          );

          // Filtered logs
          const filteredLogs = myLogs.filter(log => {
            if (currentSelectedSubject && currentSelectedSubject !== "all") {
              if (!isSubjectNameMatch(log.subject, currentSelectedSubject) && log.subject.toLowerCase().trim() !== currentSelectedSubject.toLowerCase().trim()) return false;
            }
            if (acadTrackerUnitFilter && acadTrackerUnitFilter !== "all") {
              if (!log.unit.toLowerCase().includes(acadTrackerUnitFilter.toLowerCase().trim())) return false;
            }
            if (acadTrackerStartDate && log.date < acadTrackerStartDate) return false;
            if (acadTrackerEndDate && log.date > acadTrackerEndDate) return false;
            if (acadTrackerSearch.trim()) {
              const q = acadTrackerSearch.toLowerCase().trim();
              const matchTopic = (log.topic || "").toLowerCase().includes(q);
              const matchComments = (log.comments || "").toLowerCase().includes(q);
              const matchUnit = (log.unit || "").toLowerCase().includes(q);
              const matchClass = (log.class_group || "").toLowerCase().includes(q);
              if (!matchTopic && !matchComments && !matchUnit && !matchClass) return false;
            }
            return true;
          }).sort((a, b) => b.date.localeCompare(a.date));

          // Metrics
            const totalPeriodsCount = myLogs.length;
            const subjectPeriodsCount = filteredLogs.length;
            const uniqueUnitsCovered = Array.from(new Set(myLogs.map(l => l.unit).filter(Boolean))).length;
            const uniqueSubjectsCovered = Array.from(new Set(myLogs.map(l => l.subject).filter(Boolean))).length;
            const latestLogDate = myLogs.length > 0 ? myLogs.map(l => l.date).sort().reverse()[0] : "—";

            // Period Slot Options (derived from mentor schedule or standard defaults)
            const standardPeriods = [
              "Period 1 (09:00 - 10:00 AM)",
              "Period 2 (10:00 - 11:00 AM)",
              "Period 3 (11:15 - 12:15 PM)",
              "Period 4 (01:00 - 02:00 PM)",
              "Period 5 (02:00 - 03:00 PM)",
              "Period 6 (03:00 - 04:00 PM)",
              "Period 7 (04:00 - 05:00 PM)"
            ];

            // Helper: Resolve mentor's actual timetable slots for a selected date
            const getMentorSlotsForDate = (dateStr: string) => {
              if (!dateStr) return { dateSlots: [], dayOrder: null, dayType: "working", mappedDay: "", dayName: "", isConfigured: false, isHoliday: false };
              const defaultDay = new Date(dateStr + "T00:00:00").toLocaleDateString("en-US", { weekday: "long" });
              const dailyConfig = dailyConfigsMap.get(dateStr);
              const mappedDay = getMappedDayForDate(dateStr, defaultDay);
              const dayType = dailyConfig?.day_type || (mappedDay === "holiday" ? "holiday" : "working");
              const dayOrder = dailyConfig?.day_order || null;
              const dayName = defaultDay;

              const isHoliday = dayType === "holiday" || mappedDay === "holiday";
              const isConfigured = Boolean(dailyConfig && dailyConfig.day_type && dailyConfig.day_type !== "None" && dailyConfig.day_order && dailyConfig.day_order !== "None");

              if (isHoliday) {
                return { dateSlots: [], dayOrder, dayType: "holiday", mappedDay: "holiday", dayName, isConfigured, isHoliday: true };
              }

              if (!isConfigured) {
                return { dateSlots: [], dayOrder, dayType, mappedDay, dayName, isConfigured: false, isHoliday: false };
              }

              // 1. Regular assigned slots for this CM day order / weekday
              const ownSlots = mySlots.filter(s => s.day === mappedDay && (!s.college_id || !currentMentor.college_id || s.college_id === currentMentor.college_id));
              const activeOwnSlots = ownSlots.filter(s => !approvedHandovers.some(h => h.slotId === s.id && h.dateStr === dateStr));

              // 2. Covered slots assigned to this mentor on this date
              const coveredHandovers = approvedHandovers.filter(h => h.coverStaffId === currentMentor.id && h.dateStr === dateStr);
              const activeCoveredSlots = coveredHandovers.map(h => slots.find(s => s.id === h.slotId)).filter(Boolean) as Slot[];

              const dateSlots = [...activeOwnSlots, ...activeCoveredSlots];
              return { dateSlots, dayOrder, dayType, mappedDay, dayName, isConfigured: true, isHoliday: false };
            };

            const openNewLogModal = () => {
              const todayStr = new Date().toISOString().split("T")[0];
              setEditingAcadEntry(null);
              setAcadFormDate(todayStr);

              const { dateSlots, dayOrder, dayType, mappedDay, isConfigured, isHoliday } = getMentorSlotsForDate(todayStr);

              if (isHoliday) {
                toast("Today is declared a Holiday by Campus Manager. Period logging is disabled.", "warning");
              } else if (!isConfigured) {
                toast("The Campus Manager has not set the Day Order for today yet. Period logging requires CM Day Order setting.", "warning");
              }

              // Prefer slots that have already started
              const activeStartedSlots = dateSlots.filter(slot => {
                const periodStart = parseSlotStartTime(slot.time);
                return !periodStart || new Date() >= periodStart;
              });
              const defaultSlot = activeStartedSlots[0] || dateSlots[0];

              if (defaultSlot) {
                setAcadFormPeriodSlot(defaultSlot.time);
                setAcadFormClassGroup(defaultSlot.classGroup || "");
                setAcadFormSubject(defaultSlot.course || availableAcadSubjects[0] || "Academic Course");
              } else {
                setAcadFormPeriodSlot("");
                setAcadFormClassGroup("");
                setAcadFormSubject("");
              }

              setAcadFormUnit("Unit 1");
              setAcadFormTopic("");
              setAcadFormComments("");
              setAcadFormStatus("Delivered");
              setShowAcadLogModal(true);
            };

            const openEditLogModal = (entry: any) => {
              // Direct editing of created logs is locked for audit integrity — request edit from CM
              setTargetAcadEditLog(entry);
              setAcadEditProposedTopic(entry.topic || "");
              setAcadEditProposedComments(entry.comments || "");
              setAcadEditReason("");
              setShowAcadEditRequestModal(true);
            };

            const handleSubmitAcadEditRequest = async (e: React.FormEvent) => {
              e.preventDefault();
              if (!targetAcadEditLog) return;
              if (!acadEditReason.trim()) {
                toast("Please provide a reason / justification for requesting this change.", "warning");
                return;
              }

              setIsSubmittingAcadEditReq(true);
              try {
                const res = await fetch("/api/requests", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    mentorId: currentMentor.id,
                    slotId: `acad_log_edit_${targetAcadEditLog.id}`,
                    dateStr: targetAcadEditLog.date,
                    dateFormatted: targetAcadEditLog.date,
                    targetStaffId: "cam_approval",
                    targetStaffName: "CM Approval (Academic Period Log Edit Request)",
                    reason: `[Academic Log Edit Request] Log ID: ${targetAcadEditLog.id} | Date: ${targetAcadEditLog.date} (${targetAcadEditLog.period_slot}) | Subject: ${targetAcadEditLog.subject} | Class: ${targetAcadEditLog.class_group} | Proposed Topic: ${acadEditProposedTopic.trim()} | Proposed Remarks: ${acadEditProposedComments.trim()} | Reason: ${acadEditReason.trim()}`,
                    course: targetAcadEditLog.subject,
                    classGroup: targetAcadEditLog.class_group
                  })
                });
                const json = await res.json();
                if (json.success) {
                  toast("Academic log correction request submitted to Campus Manager for review!", "success");
                  setShowAcadEditRequestModal(false);
                  setTargetAcadEditLog(null);
                } else {
                  toast(json.message || "Failed to submit request to CM.", "error");
                }
              } catch (err: any) {
                toast("Error: " + err.message, "error");
              } finally {
                setIsSubmittingAcadEditReq(false);
              }
            };

            const handleDateChangeInModal = (newDate: string) => {
              const todayStr = new Date().toISOString().split("T")[0];
              if (newDate !== todayStr) {
                toast("Period logging is strictly restricted to today's active schedule. Previous and future dates cannot be marked.", "warning");
                setAcadFormDate(todayStr);
                return;
              }
              setAcadFormDate(todayStr);
            };

            const handlePeriodSelectInModal = (val: string, dateSlots: Slot[]) => {
              const matchedSlot = dateSlots.find(s => s.id === val || s.time === val);
              if (matchedSlot) {
                setAcadFormPeriodSlot(matchedSlot.time);
                setAcadFormClassGroup(matchedSlot.classGroup || "");
                setAcadFormSubject(matchedSlot.course || availableAcadSubjects[0] || "Academic Course");
              } else {
                setAcadFormPeriodSlot(val);
              }
            };

            const handleSaveLog = async (e: React.FormEvent) => {
              e.preventDefault();
              const todayStr = new Date().toISOString().split("T")[0];
              if (acadFormDate !== todayStr) {
                toast("Period logging is only permitted for today's active schedule. Past and future dates cannot be logged.", "warning");
                return;
              }

              const { dateSlots, dayOrder, isConfigured, isHoliday, mappedDay } = getMentorSlotsForDate(todayStr);
              if (isHoliday) {
                toast("Today is declared a Holiday by Campus Manager. Period logging is disabled.", "warning");
                return;
              }
              if (!isConfigured || !dayOrder || dayOrder === "None") {
                toast("Campus Manager has not configured the Day Order for today. Period logging requires CM Day Order setting.", "warning");
                return;
              }
              if (!acadFormPeriodSlot) {
                toast("Please select a valid scheduled period slot for today's CM " + dayOrder + " schedule.", "warning");
                return;
              }

              const periodStart = parseSlotStartTime(acadFormPeriodSlot);
              if (periodStart && new Date() < periodStart) {
                toast("This period has not started yet. You cannot log a future period in advance.", "warning");
                return;
              }

              if (!acadFormDate || !acadFormPeriodSlot || !acadFormClassGroup || !acadFormSubject || !acadFormUnit || !acadFormTopic.trim()) {
                toast("Please fill in all required fields (Period, Class Group, Subject, Unit, and Topic).", "warning");
                return;
              }

              setIsSavingAcadEntry(true);
              try {
                const res = await saveAcademicTrackerEntry({
                  id: editingAcadEntry?.id,
                  date: todayStr,
                  periodSlot: acadFormPeriodSlot,
                  classGroup: acadFormClassGroup,
                  subject: acadFormSubject,
                  unit: acadFormUnit,
                  topic: acadFormTopic.trim(),
                  comments: acadFormComments.trim(),
                  status: acadFormStatus,
                  mentorId: currentMentor.id,
                  mentorName: currentMentor.name,
                  collegeId: currentMentor.college_id
                });

                if (res.success) {
                  toast(editingAcadEntry ? "Academic period log updated!" : "Academic period logged successfully!", "success");
                  setShowAcadLogModal(false);
                  setEditingAcadEntry(null);
                } else {
                  toast(res.message || "Failed to save academic log.", "error");
                }
              } catch (err: any) {
                toast("Error saving academic log: " + err.message, "error");
              } finally {
                setIsSavingAcadEntry(false);
              }
            };

            const handleDeleteLog = async (id: string) => {
              if (!(await showConfirm({
                title: "Delete Academic Log?",
                message: "Are you sure you want to delete this period log? This action cannot be undone.",
                danger: true,
                confirmLabel: "Delete Log"
              }))) return;

              const res = await deleteAcademicTrackerEntry(id);
              if (res.success) {
                toast("Academic period log deleted.", "success");
              } else {
                toast(res.message || "Failed to delete log.", "error");
              }
            };

            const exportMentorAcademicLogs = async () => {
              try {
                const XLSX = await import("xlsx");
                const headers = ["S.No", "Date", "Period / Time Slot", "Class Group", "Subject", "Unit", "Topic Covered", "Status", "Delivery Remarks / Comments", "Logged At"];
                const rows = filteredLogs.map((l, idx) => [
                  idx + 1,
                  l.date,
                  l.period_slot,
                  l.class_group,
                  l.subject,
                  l.unit,
                  l.topic,
                  l.status || "Delivered",
                  l.comments || "—",
                  l.updated_at ? new Date(l.updated_at).toLocaleString() : "—"
                ]);

                const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
                ws["!cols"] = [
                  { wch: 6 }, { wch: 14 }, { wch: 26 }, { wch: 22 }, { wch: 24 },
                  { wch: 14 }, { wch: 35 }, { wch: 16 }, { wch: 35 }, { wch: 22 }
                ];
                const wb = XLSX.utils.book_new();
                XLSX.utils.book_append_sheet(wb, ws, "Academic_Lesson_Log");
                XLSX.writeFile(wb, `Mentor_Academic_Tracker_${currentMentor.name.replace(/[^a-zA-Z0-9]/g, "_")}_${new Date().toISOString().slice(0, 10)}.xlsx`);
                toast("Academic log exported to Excel!", "success");
              } catch (err: any) {
                toast("Export failed: " + err.message, "error");
              }
            };

            return (
              <div className="space-y-6 font-sans">
                {/* ── Sub-Tabs Switcher ── */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white border border-slate-100 rounded-2xl p-4 shadow-card">
                  <div className="flex items-center gap-2 p-1.5 bg-slate-100 rounded-xl border border-slate-200/80 w-fit">
                    <button
                      type="button"
                      onClick={() => setAcadActiveSubTab("ledger")}
                      className={`px-4 py-2 rounded-lg text-xs font-black transition-all cursor-pointer flex items-center gap-2 ${acadActiveSubTab === "ledger"
                          ? "bg-white text-slate-900 shadow-xs"
                          : "text-slate-500 hover:text-slate-800"
                        }`}
                    >
                      <BookOpen className="h-4 w-4 text-amber-600" />
                      <span>Lesson Conduction Ledger</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setAcadActiveSubTab("weekly")}
                      className={`px-4 py-2 rounded-lg text-xs font-black transition-all cursor-pointer flex items-center gap-2 ${acadActiveSubTab === "weekly"
                          ? "bg-white text-amber-600 shadow-xs"
                          : "text-slate-500 hover:text-slate-800"
                        }`}
                    >
                      <Layers className="h-4 w-4 text-amber-600" />
                      <span>Weekly Academic Tasks & Marks (Quiz / Assessment / Assignment)</span>
                    </button>
                  </div>

                  <div className="text-[11px] font-bold text-slate-400">
                    {acadActiveSubTab === "ledger" ? "Authoritative Syllabus Conduction Feed" : "Weekly Evaluations & Marks Ledger"}
                  </div>
                </div>

                {/* ────────────────────────────────────────────────────────────────────────── */}
                {/* SUB-VIEW 1: LESSON CONDUCTION LEDGER                                      */}
                {/* ────────────────────────────────────────────────────────────────────────── */}
                {acadActiveSubTab === "ledger" && (
                  <div className="space-y-6 animate-fadeIn">
                    {/* Header Banner */}
                    <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-card flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div>
                        <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-amber-600 mb-1">
                          <BookOpen className="w-3.5 h-3.5" />
                          <span>Academic Curriculum &amp; Syllabus Coverage</span>
                        </div>
                        <h2 className="text-base font-black text-slate-900">Academic Period &amp; Lesson Conduction Tracker</h2>
                        <p className="text-xs text-slate-500 font-medium mt-0.5">
                          Record date-wise teaching logs, syllabus unit progression, topics covered, and lecture delivery notes for your theory and practical subjects.
                        </p>
                      </div>

                      <div className="flex items-center gap-2.5 flex-wrap shrink-0">
                        <button
                          type="button"
                          onClick={exportMentorAcademicLogs}
                          disabled={filteredLogs.length === 0}
                          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 text-xs font-extrabold transition-all cursor-pointer shadow-2xs disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
                          <span>Export (.xlsx)</span>
                        </button>

                        <button
                          type="button"
                          onClick={openNewLogModal}
                          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-900 hover:bg-zinc-900 text-white text-xs font-extrabold transition-all cursor-pointer shadow-xs"
                        >
                          <Plus className="w-4 h-4" />
                          <span>Log Teaching Period</span>
                        </button>
                      </div>
                    </div>

                    {/* 4 Summary KPI Boxes */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
                      <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-card space-y-1">
                        <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Total Periods Logged</span>
                        <div className="text-xl font-black text-slate-900">{totalPeriodsCount}</div>
                        <span className="text-[9px] text-slate-400 font-semibold block">{subjectPeriodsCount} in active view</span>
                      </div>

                      <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-card space-y-1">
                        <span className="text-[10px] text-amber-600 font-bold uppercase tracking-wider block">Units in Progress</span>
                        <div className="text-xl font-black text-indigo-900">{uniqueUnitsCovered} Units</div>
                        <span className="text-[9px] text-amber-500/80 font-semibold block">Syllabus progression</span>
                      </div>

                      <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-card space-y-1">
                        <span className="text-[10px] text-emerald-600 font-bold uppercase tracking-wider block">Academic Courses</span>
                        <div className="text-xl font-black text-emerald-900">{availableAcadSubjects.length} Subjects</div>
                        <span className="text-[9px] text-emerald-600/80 font-semibold block">{uniqueSubjectsCovered} with logged classes</span>
                      </div>

                      <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-card space-y-1">
                        <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block">Latest Conduction Date</span>
                        <div className="text-sm font-black text-slate-900 truncate mt-1">{latestLogDate}</div>
                        <span className="text-[9px] text-slate-400 font-semibold block">Authoritative date log</span>
                      </div>
                    </div>

                    {/* Subject Selector Bar */}
                    <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-card space-y-3">
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <span className="text-[10px] text-slate-400 font-black uppercase tracking-wider">Select Academic Subject to Filter</span>
                        <span className="text-xs font-bold text-slate-500 inline-flex items-center gap-1.5">
                          <span>{currentMentor.name} • {currentMentor.mentor_group || "Faculty"}</span>
                          {currentMentor.mentor_group && (
                            <CourseInfoButton course={currentMentor.mentor_group} collegeId={currentMentor.college_id} size="xs" />
                          )}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => setAcadTrackerSubject("")}
                          className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer border ${!acadTrackerSubject
                              ? "bg-slate-900 border-slate-900 text-white shadow-xs"
                              : "bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100"
                            }`}
                        >
                          All My Subjects ({availableAcadSubjects.length})
                        </button>
                        {availableAcadSubjects.map(subName => {
                          const isSelected = acadTrackerSubject.toLowerCase().trim() === subName.toLowerCase().trim();
                          const count = myLogs.filter(l => l.subject.toLowerCase().trim() === subName.toLowerCase().trim()).length;
                          return (
                            <button
                              key={subName}
                              type="button"
                              onClick={() => setAcadTrackerSubject(subName)}
                              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-2 border ${isSelected
                                  ? "bg-indigo-600 border-indigo-600 text-white shadow-xs"
                                  : "bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100"
                                }`}
                            >
                              <BookOpen className={`w-3.5 h-3.5 ${isSelected ? "text-white" : "text-slate-400"}`} />
                              <span>{subName}</span>
                              {count > 0 && (
                                <span className={`px-1.5 py-0.2 rounded text-[9px] font-bold ${isSelected ? "bg-white/20 text-white" : "bg-slate-200 text-slate-700"
                                  }`}>
                                  {count}
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Filter Controls Bar */}
                    <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-card flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-2 flex-wrap flex-1 min-w-[280px]">
                        {/* Search Input */}
                        <div className="relative flex-1 min-w-[200px]">
                          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                          <input
                            type="text"
                            placeholder="Search topics, unit or notes..."
                            value={acadTrackerSearch}
                            onChange={e => setAcadTrackerSearch(e.target.value)}
                            className="w-full pl-8 pr-8 py-1.5 border border-slate-200 rounded-2xl text-xs font-medium focus:ring-1 focus:ring-indigo-500 outline-none"
                          />
                          {acadTrackerSearch && (
                            <button
                              type="button"
                              onClick={() => setAcadTrackerSearch("")}
                              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 rounded-full hover:bg-slate-100 cursor-pointer"
                              title="Clear search"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>

                        {/* Unit Filter */}
                        <select aria-label="Unit filter"
                          value={acadTrackerUnitFilter}
                          onChange={e => setAcadTrackerUnitFilter(e.target.value)}
                          className="px-3 py-1.5 bg-sunken border border-slate-200 inset-shadow-well focus:bg-white dark:focus:bg-[#131317] rounded-2xl text-xs font-bold text-slate-700 outline-none cursor-pointer"
                        >
                          <option value="all">All Units</option>
                          <option value="Unit 1">Unit 1</option>
                          <option value="Unit 2">Unit 2</option>
                          <option value="Unit 3">Unit 3</option>
                          <option value="Unit 4">Unit 4</option>
                          <option value="Unit 5">Unit 5</option>
                          <option value="Revision">Revision / Test</option>
                        </select>

                        {/* Date Filters */}
                        <div className="flex items-center gap-1.5 text-xs text-slate-600 font-bold">
                          <span>From:</span>
                          <input
                            type="date"
                            value={acadTrackerStartDate}
                            onChange={e => setAcadTrackerStartDate(e.target.value)}
                            className="px-2.5 py-1.5 border border-slate-200/90 rounded-2xl text-xs font-bold bg-white text-slate-800 outline-none shadow-2xs hover:border-slate-300 cursor-pointer"
                            aria-label="From Date"
                          />
                          <span>To:</span>
                          <input
                            type="date"
                            value={acadTrackerEndDate}
                            onChange={e => setAcadTrackerEndDate(e.target.value)}
                            className="px-2.5 py-1.5 border border-slate-200/90 rounded-2xl text-xs font-bold bg-white text-slate-800 outline-none shadow-2xs hover:border-slate-300 cursor-pointer"
                            aria-label="To Date"
                          />
                        </div>
                      </div>

                      {(acadTrackerSearch || acadTrackerUnitFilter !== "all" || acadTrackerStartDate || acadTrackerEndDate) && (
                        <button
                          type="button"
                          onClick={() => {
                            setAcadTrackerSearch("");
                            setAcadTrackerUnitFilter("all");
                            setAcadTrackerStartDate("");
                            setAcadTrackerEndDate("");
                          }}
                          className="px-2.5 py-1 text-xs text-rose-600 font-bold hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                        >
                          Clear Filters
                        </button>
                      )}
                    </div>

                    {/* Date-wise Period Conduction Feed */}
                    <div className="space-y-4">
                      {filteredLogs.length === 0 ? (
                        <div className="bg-white border border-slate-100 rounded-2xl p-12 text-center space-y-3 shadow-card">
                          <div className="h-12 w-12 rounded-2xl bg-zinc-100 border border-zinc-200 flex items-center justify-center text-amber-500 mx-auto">
                            <BookOpen className="w-6 h-6" />
                          </div>
                          <h3 className="text-sm font-bold text-slate-800">No academic periods logged yet</h3>
                          <p className="text-xs text-slate-400 max-w-md mx-auto">
                            {acadTrackerSearch || acadTrackerUnitFilter !== "all"
                              ? "No period records match your filter criteria."
                              : "Click 'Log Teaching Period' to record the date, period, unit, topic, and delivery notes for your classes."}
                          </p>
                          <button
                            type="button"
                            onClick={openNewLogModal}
                            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white border border-white/10 text-xs font-bold transition-all shadow-xs cursor-pointer"
                          >
                            <Plus className="w-4 h-4" />
                            <span>Log Your First Period</span>
                          </button>
                        </div>
                      ) : (
                        filteredLogs.map(log => {
                          const dateObj = new Date(log.date + "T00:00:00");
                          const dayName = dateObj.toLocaleDateString("en-US", { weekday: "long" });
                          const formattedDate = dateObj.toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" });
                          const isNotDelivered = (log.status || "").toLowerCase().includes("not") || (log.status || "").toLowerCase().includes("missed");

                          return (
                            <div
                              key={log.id}
                              className={`bg-white border rounded-xl p-5 shadow-2xs hover:shadow-card transition-all space-y-3 ${isNotDelivered ? "border-rose-200/80 bg-rose-50/10" : "border-slate-200"
                                }`}
                            >
                              {/* Card Header */}
                              <div className="flex flex-wrap items-start justify-between gap-3 pb-3 border-b border-slate-100">
                                <div className="space-y-1">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase bg-amber-50 text-amber-800 border border-indigo-200">
                                      {log.unit || "Unit 1"}
                                    </span>
                                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                                      {log.period_slot}
                                    </span>
                                    {(log as any).weekly_plan_id ? (
                                      <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase border tracking-wider ${(log.status || "").toLowerCase().includes("not")
                                          ? "bg-rose-50 text-rose-700 border-rose-200"
                                          : "bg-emerald-50 text-emerald-700 border-emerald-200"
                                        }`} title={`Conducted as verified against your approved Weekly Plan — Week ${(log as any).weekly_plan_week || "?"}`}>
                                        Per Weekly Plan · W{(log as any).weekly_plan_week || "?"} {(log.status || "").toLowerCase().includes("not") ? "✗" : "✓"}
                                      </span>
                                    ) : null}
                                    <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase border ${isNotDelivered
                                        ? "bg-rose-100 text-rose-800 border-rose-200"
                                        : "bg-emerald-50 text-emerald-700 border-emerald-200"
                                      }`}>
                                      {isNotDelivered ? "Not Delivered" : "Delivered"}
                                    </span>
                                  </div>
                                  <h3 className="text-sm font-black text-slate-900 tracking-tight flex items-center gap-2 mt-1">
                                    <span>{log.subject}</span>
                                    <span className="text-slate-300">•</span>
                                    <span className="text-xs font-bold text-slate-500">{log.class_group}</span>
                                  </h3>
                                </div>

                                <div className="flex items-center gap-2">
                                  <div className="text-right pr-2">
                                    <div className="text-xs font-black text-slate-800">{formattedDate}</div>
                                    <div className="text-[10px] text-slate-400 font-semibold">{dayName}</div>
                                  </div>

                                  <button
                                    type="button"
                                    onClick={() => openEditLogModal(log)}
                                    className="px-2 py-1 rounded-lg text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200 transition-colors cursor-pointer flex items-center gap-1 text-[10.5px] font-bold"
                                    title="Request Period Log Correction from Campus Manager"
                                  >
                                    <Edit2 className="w-3 h-3" />
                                    <span>Request Edit</span>
                                  </button>
                                </div>
                              </div>

                              {/* Topic Covered Body */}
                              <div className="space-y-1.5">
                                <span className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wider block">Topic Covered</span>
                                <p className="text-xs font-bold text-slate-800 leading-relaxed bg-slate-50/80 border border-slate-100 p-3 rounded-xl">
                                  {log.topic}
                                </p>
                              </div>

                              {/* Delivery Comments / Remarks */}
                              {log.comments && (
                                <div className="space-y-1">
                                  <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider block">Delivery Remarks &amp; Practice Assigned</span>
                                  <p className="text-xs font-medium text-slate-600 italic bg-amber-50/30 border border-amber-100 p-2.5 rounded-lg">
                                    &ldquo;{log.comments}&rdquo;
                                  </p>
                                </div>
                              )}
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                )}

                {/* ────────────────────────────────────────────────────────────────────────── */}
                {/* SUB-VIEW 2: WEEKLY ACADEMIC TASKS & 3-COMPONENT MARKS EVALUATION           */}
                {/* ────────────────────────────────────────────────────────────────────────── */}
                {acadActiveSubTab === "weekly" && (() => {
                  const mentorClassDepts = Array.from(new Set(mentorClasses.map(c => getDeptFromClassGroup(c) || c))).filter(Boolean);
                  const campusDepts = Array.from(new Set(
                    coursesList
                      .filter(c => !c.college_id || c.college_id === currentMentor?.college_id)
                      .map(c => c.name.trim())
                      .filter(Boolean)
                  )).sort();

                  const deptOptions = mentorClassDepts.length > 0
                    ? mentorClassDepts
                    : (campusDepts.length > 0 ? campusDepts : (currentMentor?.mentor_group ? [currentMentor.mentor_group] : ["General Department"]));

                  const activeWeeklyDept = acadWeeklyDept || deptOptions[0] || currentMentor?.mentor_group || "";

                  const weeklyCourse = coursesList.find(c => c.name.trim().toLowerCase() === activeWeeklyDept.trim().toLowerCase());
                  const standardSemesters = weeklyCourse ? getSemestersForCourse(weeklyCourse.years) : ALL_SEMESTERS;
                  const semesterOptions = Array.from(new Set([
                    ...standardSemesters,
                    ...subjectsList
                      .filter(s => {
                        if (s.college_id && currentMentor?.college_id && s.college_id !== currentMentor.college_id) return false;
                        const d = (s.department || "").toLowerCase().trim();
                        const mg = (s.mentor_group || "").toLowerCase().trim();
                        const act = activeWeeklyDept.toLowerCase().trim();
                        return d === act || mg === act || (d.length > 2 && act.includes(d)) || (act.length > 2 && d.includes(act));
                      })
                      .map(s => s.semester)
                      .filter(Boolean)
                  ])).sort((a, b) => {
                    const na = parseInt((a || "").replace(/\D/g, "") || "0");
                    const nb = parseInt((b || "").replace(/\D/g, "") || "0");
                    return na - nb;
                  });

                  const finalSemOptions = semesterOptions.length > 0 ? semesterOptions : standardSemesters;
                  const activeWeeklySem = (acadWeeklySem && finalSemOptions.includes(acadWeeklySem))
                    ? acadWeeklySem
                    : finalSemOptions[0] || "Semester 1";

                  // Filter academic subjects (theory/practical)
                  const subjectObjs = subjectsList.filter(s => {
                    if (s.college_id && currentMentor?.college_id && s.college_id !== currentMentor.college_id) return false;
                    const d = (s.department || "").toLowerCase().trim();
                    const mg = (s.mentor_group || "").toLowerCase().trim();
                    const act = activeWeeklyDept.toLowerCase().trim();
                    const matchDept = d === act || mg === act || (d.length > 2 && act.includes(d)) || (act.length > 2 && d.includes(act));
                    const semNum = (s.semester || "").replace(/\D/g, "");
                    const actSemNum = activeWeeklySem.replace(/\D/g, "");
                    const matchSem = s.semester?.toLowerCase().trim() === activeWeeklySem.toLowerCase().trim() || (semNum && actSemNum && semNum === actSemNum);
                    return matchDept && matchSem && !isSkillSubject(s);
                  });

                  // Mentor's own subjects (from mentor profile + scheduled timetable slots)
                  const explicitMentorSubjects = Array.from(new Set([
                    ...mentorSubjects,
                    ...(Array.isArray(currentMentor?.subjects) ? currentMentor.subjects : (currentMentor?.subjects ? currentMentor.subjects.split(/,|\n/).map((s: string) => s.trim()) : [])),
                    ...mySlots.map(s => s.course?.trim())
                  ])).filter(Boolean);

                  const mentorSubjectNames = new Set(explicitMentorSubjects.map(s => s.toLowerCase().trim()));

                  // Filter academic subjects (theory/practical) matching the dept/sem AND assigned to this mentor
                  const mentorFilteredSubjectObjs = subjectObjs.filter(s => mentorSubjectNames.has(s.name.toLowerCase().trim()));
                  const mentorAcadSubjects = explicitMentorSubjects.filter(s => !isSkillSubject(s));

                  // STRICT: ONLY show the mentor's own assigned subjects
                  const subjectOptions = Array.from(new Set(
                    mentorFilteredSubjectObjs.length > 0
                      ? mentorFilteredSubjectObjs.map(s => s.name?.trim()).filter(Boolean)
                      : mentorAcadSubjects.length > 0
                        ? mentorAcadSubjects.map(s => s?.trim()).filter(Boolean)
                        : (explicitMentorSubjects.length > 0 ? explicitMentorSubjects.filter(s => !isSkillSubject(s)).map(s => s?.trim()).filter(Boolean) : ["Assigned Academic Subject"])
                  ));

                  const activeWeeklySubj = acadWeeklySubject && subjectOptions.includes(acadWeeklySubject)
                    ? acadWeeklySubject
                    : subjectOptions[0] || "";
                  const activeWeeklyClassGroup = `${activeWeeklyDept} - ${activeWeeklySem}`;

                  // Current task
                  const currentWeeklyTask = (weeklyAcademicTasks || []).find(
                    t => (isSubjectNameMatch(t.subject, activeWeeklySubj) || t.subject.toLowerCase().trim() === activeWeeklySubj.toLowerCase().trim()) &&
                      t.week_number === acadWeeklyWeek &&
                      (isCohortMatching(t.class_group, activeWeeklyClassGroup, coursesList, subjectsList) ||
                        t.class_group.toLowerCase().includes(activeWeeklyDept.toLowerCase().trim()) ||
                        activeWeeklyClassGroup.toLowerCase().includes(t.class_group.toLowerCase().trim()))
                  );

                  // Students belonging to this cohort
                  const cohortStudents = students.filter(s =>
                    isCohortMatching(s.classGroup, activeWeeklyClassGroup, coursesList, subjectsList) ||
                    (s.department && s.department.toLowerCase().trim() === activeWeeklyDept.toLowerCase().trim() && (!s.semester || s.semester.toLowerCase().includes(activeWeeklySem.toLowerCase().trim())))
                  );

                  // Filter students by search
                  const qSearch = (deferredAcadWeeklySearch || "").toLowerCase().trim();
                  const filteredWeeklyStudents = cohortStudents.filter(student => {
                    const matchesSearch = !qSearch || student.name.toLowerCase().includes(qSearch) ||
                      student.id.toLowerCase().includes(qSearch) ||
                      student.email.toLowerCase().includes(qSearch) ||
                      (student.register_number || "").toLowerCase().includes(qSearch);

                    const entry = (studentAcademicTracker || []).find(
                      e => ((e.student_id && (e.student_id === student.id || e.student_id === student.register_number)) || (student.email && e.student_email && e.student_email.toLowerCase().trim() === student.email.toLowerCase().trim())) &&
                        (isSubjectNameMatch(e.subject, activeWeeklySubj) || e.subject.toLowerCase().trim() === activeWeeklySubj.toLowerCase().trim()) &&
                        e.week_number === acadWeeklyWeek
                    );

                    const hasMarks = entry && (entry.quiz_marks !== null || entry.assessment_marks !== null || entry.assignment_marks !== null || entry.total_marks !== null);

                    if (acadWeeklyStatusFilter === "submitted") return matchesSearch && hasMarks;
                    if (acadWeeklyStatusFilter === "not_submitted") return matchesSearch && !hasMarks;
                    return matchesSearch;
                  });

                  // Pagination
                  const totalItems = filteredWeeklyStudents.length;
                  const totalPages = acadWeeklyPageSize === -1 ? 1 : Math.ceil(totalItems / acadWeeklyPageSize);
                  const validPage = Math.min(Math.max(1, acadWeeklyPage), totalPages || 1);
                  const paginatedWeeklyStudents = acadWeeklyPageSize === -1
                    ? filteredWeeklyStudents
                    : filteredWeeklyStudents.slice((validPage - 1) * acadWeeklyPageSize, validPage * acadWeeklyPageSize);

                  // Helper: Download Smart Attendance-Aware Excel Template
                  const handleDownloadAcademicTemplate = async () => {
                    try {
                      const XLSX = await import("xlsx");
                      const headers = [
                        "S.No",
                        "Student Email (Primary Key)",
                        "Student ID",
                        "Student Name",
                        "Register Number",
                        "Class Group",
                        "Subject",
                        "Week Number",
                        "Attendance Status (Present/Absent)",
                        "Quiz Marks (0-10)",
                        "Assessment Marks (0-10)",
                        "Assignment Marks (0-10)",
                        "Feedback / Remarks"
                      ];

                      const targetTaskDate = currentWeeklyTask?.task_date || currentWeeklyTask?.created_at?.slice(0, 10);
                      const rows = cohortStudents.map((s, idx) => {
                        // Retrieve direct attendance marking from mentor's session on the task date
                        const attLogs = studentAttendance.filter(a => {
                          if (a.studentId !== s.id) return false;
                          if (!activeWeeklySubj) return true;
                          const slot = slots.find(sl => sl.id === a.slotId);
                          const subj = a.coveredSubject || slot?.course || "";
                          return isSubjectNameMatch(subj, activeWeeklySubj);
                        });
                        const existingEntry = (studentAcademicTracker || []).find(
                          e => ((e.student_id && (e.student_id === s.id || e.student_id === s.register_number)) || (s.email && e.student_email && e.student_email.toLowerCase().trim() === s.email.toLowerCase().trim())) &&
                            (isSubjectNameMatch(e.subject, activeWeeklySubj) || e.subject.toLowerCase().trim() === activeWeeklySubj.toLowerCase().trim()) &&
                            e.week_number === acadWeeklyWeek
                        );

                        const exactDateLog = targetTaskDate ? attLogs.find(a => a.dateStr === targetTaskDate) : null;
                        const sortedLogs = [...attLogs].sort((a, b) => (b.dateStr || "").localeCompare(a.dateStr || ""));
                        const effectiveLog = exactDateLog || sortedLogs[0];
                        let attStatus = "Present";
                        if (effectiveLog) {
                          const st = (effectiveLog.status || "").toLowerCase();
                          attStatus = st === "absent" ? "Absent" : st === "od" ? "OD" : "Present";
                        } else if (existingEntry?.attendance_status) {
                          attStatus = existingEntry.attendance_status;
                        }

                        return [
                          idx + 1,
                          s.email,
                          s.id,
                          s.name,
                          s.register_number || "—",
                          activeWeeklyClassGroup,
                          activeWeeklySubj,
                          acadWeeklyWeek,
                          existingEntry?.attendance_status || attStatus,
                          existingEntry?.quiz_marks ?? "",
                          existingEntry?.assessment_marks ?? "",
                          existingEntry?.assignment_marks ?? "",
                          existingEntry?.feedback || ""
                        ];
                      });

                      const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
                      ws["!cols"] = [
                        { wch: 5 }, { wch: 28 }, { wch: 14 }, { wch: 22 }, { wch: 16 },
                        { wch: 20 }, { wch: 24 }, { wch: 12 }, { wch: 32 },
                        { wch: 18 }, { wch: 22 }, { wch: 22 }, { wch: 30 }
                      ];

                      const wb = XLSX.utils.book_new();
                      XLSX.utils.book_append_sheet(wb, ws, "Academic_Marks_Template");
                      const filename = `Academic_Marks_Template_${activeWeeklyClassGroup.replace(/[^a-zA-Z0-9]/g, "_")}_${activeWeeklySubj.replace(/[^a-zA-Z0-9]/g, "_")}_W${acadWeeklyWeek}.xlsx`;
                      XLSX.writeFile(wb, filename);
                      toast("Excel template downloaded with attendance pre-filled!", "success");
                    } catch (err: any) {
                      toast("Failed to generate Excel template: " + err.message, "error");
                    }
                  };

                  // Helper: Bulk Excel Upload
                  const handleUploadAcademicExcel = async (e: React.ChangeEvent<HTMLInputElement>) => {
                    const files = e.target.files;
                    if (!files || files.length === 0) return;
                    const file = files[0];
                    setIsUploadingAcadExcel(true);

                    try {
                      const XLSX = await import("xlsx");
                      const data = await file.arrayBuffer();
                      const wb = XLSX.read(data);
                      const ws = wb.Sheets[wb.SheetNames[0]];
                      const jsonData: any[] = XLSX.utils.sheet_to_json(ws, { defval: "" });

                      if (!jsonData || jsonData.length === 0) {
                        toast("The uploaded Excel file contains no data rows.", "warning");
                        return;
                      }

                      const parsedRecords = jsonData.map(row => {
                        const studentEmail = String(
                          row["Student Email (Primary Key)"] ||
                          row["Student Email"] ||
                          row["Email"] ||
                          row["Mail ID"] ||
                          row["Email ID"] ||
                          row["student_email"] ||
                          ""
                        ).trim().toLowerCase();

                        const studentId = String(row["Student ID"] || row["student_id"] || row["ID"] || "").trim();
                        const quizMarks = row["Quiz Marks (0-10)"] ?? row["Quiz Marks"] ?? row["Quiz"] ?? "";
                        const assessmentMarks = row["Assessment Marks (0-10)"] ?? row["Assessment Marks"] ?? row["Assessment"] ?? "";
                        const assignmentMarks = row["Assignment Marks (0-10)"] ?? row["Assignment Marks"] ?? row["Assignment"] ?? "";
                        const attendanceStatus = String(row["Attendance Status (Present/Absent)"] || row["Attendance Status"] || row["Attendance"] || "Present").trim();
                        const feedback = String(row["Feedback / Remarks"] || row["Feedback"] || row["Remarks"] || "").trim();

                        const targetTaskDate = currentWeeklyTask?.task_date || currentWeeklyTask?.created_at?.slice(0, 10);
                        const st = cohortStudents.find(s => s.email.toLowerCase().trim() === studentEmail || s.id === studentId);
                        let realAttendance = attendanceStatus || "Present";
                        if (st) {
                          const attLogs = studentAttendance.filter(a => {
                            if (a.studentId !== st.id) return false;
                            if (!activeWeeklySubj) return true;
                            const slot = slots.find(sl => sl.id === a.slotId);
                            const subj = a.coveredSubject || slot?.course || "";
                            return isSubjectNameMatch(subj, activeWeeklySubj);
                          });
                          const exactDateLog = targetTaskDate ? attLogs.find(a => a.dateStr === targetTaskDate) : null;
                          const sortedLogs = [...attLogs].sort((a, b) => (b.dateStr || "").localeCompare(a.dateStr || ""));
                          const effectiveLog = exactDateLog || sortedLogs[0];
                          if (effectiveLog) {
                            const st = (effectiveLog.status || "").toLowerCase();
                            realAttendance = st === "absent" ? "Absent" : st === "od" ? "OD" : "Present";
                          }
                        }

                        return {
                          studentEmail,
                          studentId,
                          classGroup: activeWeeklyClassGroup,
                          subject: activeWeeklySubj,
                          weekNumber: acadWeeklyWeek,
                          quizMarks,
                          assessmentMarks,
                          assignmentMarks,
                          attendanceStatus: realAttendance,
                          feedback,
                          gradedBy: currentMentor.id
                        };
                      }).filter(r => Boolean(r.studentEmail));

                      if (parsedRecords.length === 0) {
                        toast("Could not match any rows with valid 'Student Email'. Please check column headers.", "error");
                        return;
                      }

                      const res = await bulkUploadAcademicMarks({
                        records: parsedRecords,
                        classGroup: activeWeeklyClassGroup,
                        subject: activeWeeklySubj,
                        weekNumber: acadWeeklyWeek,
                        gradedBy: currentMentor.id
                      });

                      if (res.success) {
                        toast(res.message || `Successfully mapped and updated marks for ${res.updatedCount} students!`, "success");
                      } else {
                        toast(res.message || "Failed to bulk upload academic marks.", "error");
                      }
                    } catch (err: any) {
                      toast("Error parsing Excel: " + err.message, "error");
                    } finally {
                      setIsUploadingAcadExcel(false);
                      e.target.value = "";
                    }
                  };

                  // Helper: Export Full Academic 15-Week Marks Ledger
                  const exportFullAcademicLedger = async () => {
                    try {
                      const XLSX = await import("xlsx");
                      const dataRows = cohortStudents.map((student, idx) => {
                        const rowObj: Record<string, any> = {
                          "S.No": idx + 1,
                          "Student Email": student.email,
                          "Student ID": student.id,
                          "Student Name": student.name,
                          "Register No": student.register_number || "—",
                          "Department": activeWeeklyDept,
                          "Semester": activeWeeklySem,
                          "Subject": activeWeeklySubj,
                          "Class Group": student.classGroup || activeWeeklyClassGroup
                        };

                        let totalScoreSum = 0;
                        let evaluatedWeeksCount = 0;

                        for (let wk = 1; wk <= 15; wk++) {
                          const entry = (studentAcademicTracker || []).find(
                            e => ((e.student_id && (e.student_id === student.id || e.student_id === student.register_number)) || (student.email && e.student_email && e.student_email.toLowerCase().trim() === student.email.toLowerCase().trim())) &&
                              (isSubjectNameMatch(e.subject, activeWeeklySubj) || e.subject.toLowerCase().trim() === activeWeeklySubj.toLowerCase().trim()) &&
                              e.week_number === wk
                          );

                          const qm = entry?.quiz_marks !== undefined && entry?.quiz_marks !== null ? entry.quiz_marks : "—";
                          const asm = entry?.assessment_marks !== undefined && entry?.assessment_marks !== null ? entry.assessment_marks : "—";
                          const agm = entry?.assignment_marks !== undefined && entry?.assignment_marks !== null ? entry.assignment_marks : "—";
                          const tot = entry?.total_marks !== undefined && entry?.total_marks !== null ? entry.total_marks : (typeof qm === "number" || typeof asm === "number" || typeof agm === "number" ? ((Number(qm) || 0) + (Number(asm) || 0) + (Number(agm) || 0)) : "—");

                          rowObj[`W${wk} Attendance`] = entry?.attendance_status || "Present";
                          rowObj[`W${wk} Quiz (10)`] = qm;
                          rowObj[`W${wk} Assess (10)`] = asm;
                          rowObj[`W${wk} Assign (10)`] = agm;
                          rowObj[`W${wk} Total (30)`] = tot;

                          if (typeof tot === "number") {
                            totalScoreSum += tot;
                            evaluatedWeeksCount++;
                          }
                        }

                        rowObj["Cumulative Academic Score"] = evaluatedWeeksCount > 0 ? `${totalScoreSum} / ${evaluatedWeeksCount * 30}` : "—";
                        rowObj["Cumulative %"] = evaluatedWeeksCount > 0 ? `${Math.round((totalScoreSum / (evaluatedWeeksCount * 30)) * 100)}%` : "—";

                        return rowObj;
                      });

                      const ws = XLSX.utils.json_to_sheet(dataRows);
                      const wb = XLSX.utils.book_new();
                      XLSX.utils.book_append_sheet(wb, ws, "Academic_Marks_Ledger");
                      const filename = `Academic_Marks_Ledger_${activeWeeklyClassGroup.replace(/[^a-zA-Z0-9]/g, "_")}_${activeWeeklySubj.replace(/[^a-zA-Z0-9]/g, "_")}.xlsx`;
                      XLSX.writeFile(wb, filename);
                      toast("Academic weekly marks ledger exported successfully!", "success");
                    } catch (err: any) {
                      toast("Export failed: " + err.message, "error");
                    }
                  };

                  return (
                    <div className="space-y-6 font-sans animate-fadeIn">
                      {/* Interactive 4-Dropdown Filter Bar */}
                      <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-card">
                        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 flex-1">
                            {/* 1. Department */}
                            <div className="space-y-1">
                              <label className="text-[10px] text-slate-500 font-extrabold uppercase tracking-wider block">Department</label>
                              <select
                                value={activeWeeklyDept}
                                onChange={(e) => {
                                  setAcadWeeklyDept(e.target.value);
                                  setAcadWeeklySem("");
                                  setAcadWeeklySubject("");
                                }}
                                className="w-full text-xs font-semibold px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500/20 bg-white text-slate-800 cursor-pointer"
                                aria-label="Department"
                              >
                                {deptOptions.map(d => <option key={d} value={d}>{d}</option>)}
                              </select>
                            </div>

                            {/* 2. Semester */}
                            <div className="space-y-1">
                              <label className="text-[10px] text-slate-500 font-extrabold uppercase tracking-wider block">Semester</label>
                              <select
                                value={activeWeeklySem}
                                onChange={(e) => {
                                  setAcadWeeklySem(e.target.value);
                                  setAcadWeeklySubject("");
                                }}
                                className="w-full text-xs font-semibold px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500/20 bg-white text-slate-800 cursor-pointer"
                                aria-label="Semester"
                              >
                                {finalSemOptions.map(s => <option key={s} value={s}>{s}</option>)}
                              </select>
                            </div>

                            {/* 3. Subject */}
                            <div className="space-y-1">
                              <label className="text-[10px] text-slate-500 font-extrabold uppercase tracking-wider block">Academic Course</label>
                              <select
                                value={activeWeeklySubj}
                                onChange={(e) => setAcadWeeklySubject(e.target.value)}
                                className="w-full text-xs font-semibold px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500/20 bg-white text-slate-800 cursor-pointer"
                                aria-label="Academic Course"
                              >
                                {subjectOptions.map(s => <option key={s} value={s}>{s}</option>)}
                              </select>
                            </div>

                            {/* 4. Week */}
                            <div className="space-y-1">
                              <label className="text-[10px] text-slate-500 font-extrabold uppercase tracking-wider block">Target Week</label>
                              <select
                                value={acadWeeklyWeek}
                                onChange={(e) => setAcadWeeklyWeek(parseInt(e.target.value, 10))}
                                className="w-full text-xs font-semibold px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500/20 bg-white text-slate-800 cursor-pointer font-bold text-amber-700"
                                aria-label="Target Week"
                              >
                                {Array.from({ length: 15 }, (_, i) => i + 1).map(wk => (
                                  <option key={wk} value={wk}>Week {wk} (Quiz, Assessment, Assignment)</option>
                                ))}
                              </select>
                            </div>
                          </div>

                          {/* Excel Export Action Button */}
                          <div className="flex items-center gap-2 shrink-0 pt-2 lg:pt-0">
                            <button
                              type="button"
                              onClick={exportFullAcademicLedger}
                              disabled={cohortStudents.length === 0}
                              className="px-4 py-2.5 rounded-xl text-xs font-bold border border-slate-200 hover:bg-slate-50 text-slate-700 flex items-center justify-center gap-2 cursor-pointer transition-all disabled:opacity-50 disabled:cursor-not-allowed bg-white shadow-xs"
                            >
                              <Download className="h-4 w-4 text-slate-500" />
                              <span>Export Full Ledger (.xlsx)</span>
                            </button>
                          </div>
                        </div>
                      </div>

                      {/* Task Assignment Box */}
                      <div className="bg-gradient-to-r from-indigo-500/5 via-teal-500/5 to-transparent border border-indigo-100 rounded-xl p-5 shadow-xs space-y-3 font-sans">
                        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-indigo-100/50 pb-3">
                          <div className="flex items-center gap-2.5">
                            <div className="p-2 rounded-xl bg-indigo-50 border border-indigo-100 text-amber-600">
                              <Layers className="h-4 w-4" />
                            </div>
                            <div>
                              <h3 className="text-xs font-black text-slate-800 uppercase tracking-widest flex items-center gap-2">
                                Week {acadWeeklyWeek} Academic Task &amp; Evaluation Setup
                                <span className="px-2 py-0.5 bg-indigo-100 text-indigo-800 rounded-md text-[9px] font-extrabold tracking-wide border border-indigo-200">
                                  3-COMPONENT EVALUATION (QUIZ + ASSESSMENT + ASSIGNMENT)
                                </span>
                              </h3>
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            {currentWeeklyTask ? (
                              <>
                                <button
                                  onClick={() => {
                                    setAcadTaskName(currentWeeklyTask.task_name || "");
                                    setAcadTaskDate(currentWeeklyTask.task_date || currentWeeklyTask.created_at?.slice(0, 10) || getLocalDateStr());
                                    setAcadTaskPdf(currentWeeklyTask.task_pdf_url || "");
                                    setAcadIncludeQuiz(Boolean(currentWeeklyTask.quiz_topic));
                                    setAcadQuizUrl(currentWeeklyTask.quiz_topic && currentWeeklyTask.quiz_topic !== "Enabled" ? currentWeeklyTask.quiz_topic : "");
                                    setAcadIncludeAssessment(Boolean(currentWeeklyTask.assessment_topic));
                                    setAcadAssessmentUrl(currentWeeklyTask.assessment_topic && currentWeeklyTask.assessment_topic !== "Enabled" ? currentWeeklyTask.assessment_topic : "");
                                    setAcadIncludeAssignment(Boolean(currentWeeklyTask.assignment_topic));
                                    setAcadAssignmentUrl(currentWeeklyTask.assignment_topic && currentWeeklyTask.assignment_topic !== "Enabled" ? currentWeeklyTask.assignment_topic : "");
                                    setIsEditingAcadTask(true);
                                  }}
                                  className="px-3.5 py-1.5 rounded-xl text-xs font-bold border border-slate-200 hover:bg-slate-50 text-slate-700 bg-white shadow-xs flex items-center gap-1.5 cursor-pointer transition-all shrink-0"
                                >
                                  <Edit2 className="h-3.5 w-3.5 text-amber-600" />
                                  <span>Edit Guidelines</span>
                                </button>

                                <button
                                  disabled={deletingAcadWeeklyTask}
                                  onClick={async () => {
                                    if (deletingAcadWeeklyTask) return;
                                    if (!(await showConfirm({
                                      title: `Delete Week ${acadWeeklyWeek} Academic Task?`,
                                      message: `Are you sure you want to delete the academic task "${currentWeeklyTask.task_name}" for ${activeWeeklySubj} (Week ${acadWeeklyWeek})? This will reset all student marks for this week.`,
                                      danger: true,
                                      confirmLabel: "Delete Task"
                                    }))) return;

                                    setDeletingAcadWeeklyTask(true);
                                    try {
                                      const res = await deleteWeeklyAcademicTask(activeWeeklyClassGroup, activeWeeklySubj, acadWeeklyWeek);
                                      if (res.success) {
                                        toast(`Week ${acadWeeklyWeek} academic task deleted successfully.`, "success");
                                      } else {
                                        toast(res.message || "Failed to delete task.", "error");
                                      }
                                    } finally {
                                      setDeletingAcadWeeklyTask(false);
                                    }
                                  }}
                                  className="px-3.5 py-1.5 rounded-xl text-xs font-bold border border-rose-200 hover:bg-rose-50 text-rose-600 bg-white shadow-xs flex items-center gap-1.5 cursor-pointer transition-all shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                  <Trash2 className="h-3.5 w-3.5 text-rose-600" />
                                  <span>Delete Task</span>
                                </button>
                              </>
                            ) : (
                              <button
                                onClick={() => {
                                  setAcadTaskName("");
                                  setAcadTaskDate(getLocalDateStr());
                                  setAcadTaskPdf("");
                                  setAcadIncludeQuiz(true);
                                  setAcadQuizUrl("");
                                  setAcadIncludeAssessment(true);
                                  setAcadAssessmentUrl("");
                                  setAcadIncludeAssignment(true);
                                  setAcadAssignmentUrl("");
                                  setIsEditingAcadTask(true);
                                }}
                                className="px-4 py-2 rounded-xl text-xs font-bold bg-zinc-900 hover:bg-zinc-800 text-white border border-white/10 shadow-sm flex items-center gap-1.5 cursor-pointer transition-all shrink-0"
                              >
                                <Plus className="h-3.5 w-3.5" />
                                <span>Assign Week {acadWeeklyWeek} Task</span>
                              </button>
                            )}
                          </div>
                        </div>

                        {currentWeeklyTask ? (
                          <div className="bg-white border border-slate-100 p-4 rounded-xl flex flex-col md:flex-row justify-between md:items-center gap-4 shadow-card">
                            <div className="space-y-2">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="px-2 py-0.5 bg-amber-50 text-amber-800 text-[10px] font-extrabold font-mono rounded border border-indigo-100">
                                  Week {acadWeeklyWeek}
                                </span>
                                <span className="px-2 py-0.5 bg-slate-50 text-slate-700 text-[10px] font-bold rounded border border-slate-200 flex items-center gap-1">
                                  <Calendar className="h-3 w-3 text-amber-600" />
                                  <span>Task Date: {currentWeeklyTask.task_date || currentWeeklyTask.created_at?.slice(0, 10) || "Today"}</span>
                                </span>
                                <div className="text-sm font-extrabold text-slate-900 leading-snug">
                                  {currentWeeklyTask.task_name}
                                </div>
                              </div>

                              <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-600">
                                {currentWeeklyTask.quiz_topic && (
                                  <span className="bg-amber-50 text-amber-800 px-2.5 py-1 rounded-lg border border-amber-200 font-bold inline-flex items-center gap-1.5">
                                    <span>Quiz (0–10)</span>
                                    {currentWeeklyTask.quiz_topic.startsWith("http") && (
                                      <a
                                        href={currentWeeklyTask.quiz_topic}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="text-amber-900 hover:underline inline-flex items-center gap-0.5 text-[10px] bg-amber-100/80 px-1.5 py-0.2 rounded"
                                      >
                                        <span>Open Link</span>
                                        <ArrowUpRight className="w-2.5 h-2.5" />
                                      </a>
                                    )}
                                  </span>
                                )}
                                {currentWeeklyTask.assessment_topic && (
                                  <span className="bg-purple-50 text-purple-800 px-2.5 py-1 rounded-lg border border-purple-200 font-bold inline-flex items-center gap-1.5">
                                    <span>Assessment (0–10)</span>
                                    {currentWeeklyTask.assessment_topic.startsWith("http") && (
                                      <a
                                        href={currentWeeklyTask.assessment_topic}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="text-purple-900 hover:underline inline-flex items-center gap-0.5 text-[10px] bg-purple-100/80 px-1.5 py-0.2 rounded"
                                      >
                                        <span>Open Link</span>
                                        <ArrowUpRight className="w-2.5 h-2.5" />
                                      </a>
                                    )}
                                  </span>
                                )}
                                {currentWeeklyTask.assignment_topic && (
                                  <span className="bg-emerald-50 text-emerald-800 px-2.5 py-1 rounded-lg border border-emerald-200 font-bold inline-flex items-center gap-1.5">
                                    <span>Assignment (0–10)</span>
                                    {currentWeeklyTask.assignment_topic.startsWith("http") && (
                                      <a
                                        href={currentWeeklyTask.assignment_topic}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="text-emerald-900 hover:underline inline-flex items-center gap-0.5 text-[10px] bg-emerald-100/80 px-1.5 py-0.2 rounded"
                                      >
                                        <span>Open Link</span>
                                        <ArrowUpRight className="w-2.5 h-2.5" />
                                      </a>
                                    )}
                                  </span>
                                )}
                              </div>

                              {currentWeeklyTask.task_pdf_url && (
                                <a
                                  href={currentWeeklyTask.task_pdf_url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="inline-flex items-center gap-1.5 text-[10.5px] font-bold text-amber-600 bg-indigo-50 border border-indigo-100 px-3 py-1 rounded-lg hover:bg-indigo-100 transition-colors"
                                >
                                  <FileText className="h-3.5 w-3.5 text-amber-600" />
                                  <span>View Reference Material</span>
                                </a>
                              )}
                            </div>

                            <div className="text-right text-[10px] text-slate-400 font-semibold">
                              Updated: {new Date(currentWeeklyTask.updated_at || currentWeeklyTask.created_at || Date.now()).toLocaleDateString()}
                            </div>
                          </div>
                        ) : (
                          <div className="text-center py-6 bg-white/60 border border-dashed border-indigo-200 rounded-xl flex flex-col items-center justify-center gap-2">
                            <p className="text-xs text-slate-500 font-medium">No guidelines assigned for Week {acadWeeklyWeek} in {activeWeeklySubj} yet.</p>
                            <button
                              onClick={() => {
                                setAcadTaskName("");
                                setAcadTaskPdf("");
                                setAcadIncludeQuiz(true);
                                setAcadQuizUrl("");
                                setAcadIncludeAssessment(true);
                                setAcadAssessmentUrl("");
                                setAcadIncludeAssignment(true);
                                setAcadAssignmentUrl("");
                                setIsEditingAcadTask(true);
                              }}
                              className="px-4 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white border border-white/10 text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-sm transition-all"
                            >
                              <Plus className="h-3.5 w-3.5" />
                              <span>Assign Week {acadWeeklyWeek} Task Guidelines</span>
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Student Submissions & 3-Component Evaluation Table */}
                      <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-card space-y-5">
                        {/* Top Action Bar */}
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
                          <div className="flex items-center gap-2.5">
                            <div className="p-2 rounded-xl bg-zinc-900 text-white">
                              <ClipboardList className="h-4 w-4" />
                            </div>
                            <div>
                              <h3 className="text-xs font-black text-slate-800 uppercase tracking-widest">
                                Student Marks &amp; Evaluation Ledger (Week {acadWeeklyWeek})
                              </h3>
                              <span className="text-[10px] text-slate-400 font-semibold">
                                Primary Key: <strong className="text-amber-600">Student Email</strong> • Marks: Quiz (10) + Assessment (10) + Assignment (10)
                              </span>
                            </div>
                          </div>

                          {/* Save All Academic Marks Button */}
                          <div className="flex items-center gap-2.5 flex-wrap">
                            <button
                              type="button"
                              onClick={async () => {
                                const emails = Object.keys(acadMarksDraft);
                                if (emails.length === 0) {
                                  toast("All marks are already up to date.", "info");
                                  return;
                                }
                                setIsSavingAllAcadMarks(true);
                                let savedCount = 0;
                                try {
                                  const targetTaskDate = currentWeeklyTask?.task_date || currentWeeklyTask?.created_at?.slice(0, 10);
                                  for (const email of emails) {
                                    const draft = acadMarksDraft[email] || {};
                                    const student = cohortStudents.find(s => s.email.toLowerCase().trim() === email.toLowerCase().trim());
                                    if (!student) continue;

                                    const existingEntry = (studentAcademicTracker || []).find(
                                      e => ((e.student_id && (e.student_id === student.id || e.student_id === student.register_number)) || (student.email && e.student_email && e.student_email.toLowerCase().trim() === student.email.toLowerCase().trim())) &&
                                        (isSubjectNameMatch(e.subject, activeWeeklySubj) || e.subject.toLowerCase().trim() === activeWeeklySubj.toLowerCase().trim()) &&
                                        e.week_number === acadWeeklyWeek
                                    );

                                    let currentAttStatus = existingEntry?.attendance_status || "Present";
                                    if (currentWeeklyTask) {
                                      const attLogs = studentAttendance.filter(a => a.studentId === student.id && (!activeWeeklySubj || isSubjectNameMatch(a.coveredSubject || "", activeWeeklySubj)));
                                      const exactDateLog = targetTaskDate ? attLogs.find(a => a.dateStr === targetTaskDate) : null;
                                      const effectiveLog = exactDateLog || [...attLogs].sort((a, b) => (b.dateStr || "").localeCompare(a.dateStr || ""))[0];
                                      if (effectiveLog) {
                                        const st = (effectiveLog.status || "").toLowerCase();
                                        currentAttStatus = st === "absent" ? "Absent" : st === "od" ? "OD" : "Present";
                                      }
                                    }

                                    const qmVal = draft.quiz !== undefined ? draft.quiz : (existingEntry?.quiz_marks !== undefined && existingEntry?.quiz_marks !== null ? String(existingEntry.quiz_marks) : "");
                                    const asmVal = draft.assessment !== undefined ? draft.assessment : (existingEntry?.assessment_marks !== undefined && existingEntry?.assessment_marks !== null ? String(existingEntry.assessment_marks) : "");
                                    const agmVal = draft.assignment !== undefined ? draft.assignment : (existingEntry?.assignment_marks !== undefined && existingEntry?.assignment_marks !== null ? String(existingEntry.assignment_marks) : "");
                                    const fbVal = draft.feedback !== undefined ? draft.feedback : (existingEntry?.feedback || "");

                                    setAcadSaveStatusMap(prev => ({ ...prev, [email]: "saving" }));
                                    const res = await gradeStudentAcademicTask({
                                      studentEmail: email,
                                      studentId: student.id,
                                      classGroup: student.classGroup || activeWeeklyClassGroup,
                                      subject: activeWeeklySubj,
                                      weekNumber: acadWeeklyWeek,
                                      quizMarks: qmVal !== "" ? parseFloat(qmVal) : null,
                                      assessmentMarks: asmVal !== "" ? parseFloat(asmVal) : null,
                                      assignmentMarks: agmVal !== "" ? parseFloat(agmVal) : null,
                                      attendanceStatus: currentAttStatus,
                                      feedback: fbVal,
                                      gradedBy: currentMentor.id
                                    });
                                    if (res.success) {
                                      savedCount++;
                                      setAcadSaveStatusMap(prev => ({ ...prev, [email]: "saved" }));
                                    } else {
                                      setAcadSaveStatusMap(prev => ({ ...prev, [email]: "error" }));
                                    }
                                  }
                                  setAcadMarksDraft({});
                                  toast(`Saved academic marks for ${savedCount} student(s) successfully!`, "success");
                                } catch (err: any) {
                                  toast("Error saving marks: " + err.message, "error");
                                } finally {
                                  setIsSavingAllAcadMarks(false);
                                  setTimeout(() => setAcadSaveStatusMap({}), 2500);
                                }
                              }}
                              disabled={isSavingAllAcadMarks}
                              className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black flex items-center gap-2 shadow-xs transition-all cursor-pointer disabled:opacity-50"
                            >
                              {isSavingAllAcadMarks ? (
                                <>
                                  <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                                  <span>Saving All Marks...</span>
                                </>
                              ) : (
                                <>
                                  <Save className="w-4 h-4" />
                                  <span>Save All Marks (Week {acadWeeklyWeek})</span>
                                </>
                              )}
                            </button>
                          </div>
                        </div>

                        {/* Filter Bar */}
                        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-slate-50 p-4 rounded-xl border border-slate-100">
                          <div className="flex flex-wrap items-center gap-3">
                            <div className="relative">
                              <input
                                type="text"
                                value={acadWeeklySearch}
                                onChange={(e) => setAcadWeeklySearch(e.target.value)}
                                placeholder="Search student email, name or roll..."
                                className="pl-4 pr-4 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-indigo-500 w-64 bg-white font-medium text-slate-800"
                              />
                            </div>
                            <select aria-label="Status filter"
                              value={acadWeeklyStatusFilter}
                              onChange={(e) => setAcadWeeklyStatusFilter(e.target.value)}
                              className="px-3.5 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-white font-bold text-slate-700 cursor-pointer"
                            >
                              <option value="all">All Records ({cohortStudents.length})</option>
                              <option value="submitted">Marks Entered</option>
                              <option value="not_submitted">Marks Pending</option>
                            </select>
                          </div>

                          <div className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wider">
                            Showing {paginatedWeeklyStudents.length} of {filteredWeeklyStudents.length} Filtered ({cohortStudents.length} Total Enrolled)
                          </div>
                        </div>

                        {/* Marks Matrix Table */}
                        <div className="overflow-x-auto rounded-xl border border-slate-200 shadow-xs bg-white scroll-touch">
                          <table className="w-full border-collapse text-left text-xs font-semibold min-w-[1050px]">
                            <thead>
                              <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-extrabold uppercase text-[9.5px] whitespace-nowrap">
                                <th className="p-3.5 w-12 text-center border-r border-slate-100">#</th>
                                <th className="p-3.5 border-r border-slate-100 min-w-[200px]">Student (Email ID &amp; Name)</th>
                                <th className="p-3.5 border-r border-slate-100 w-[120px] text-center">Attendance</th>
                                <th className="p-3.5 border-r border-slate-100 w-[110px] text-center bg-amber-50/40 text-amber-900">Quiz (0-10)</th>
                                <th className="p-3.5 border-r border-slate-100 w-[110px] text-center bg-purple-50/40 text-purple-900">Assessment (0-10)</th>
                                <th className="p-3.5 border-r border-slate-100 w-[110px] text-center bg-emerald-50/40 text-emerald-900">Assignment (0-10)</th>
                                <th className="p-3.5 border-r border-slate-100 w-[120px] text-center bg-indigo-50/40 text-indigo-900">Total (30)</th>
                                <th className="p-3.5 min-w-[200px]">Remarks / Feedback</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 bg-white text-slate-700">
                              {paginatedWeeklyStudents.length === 0 ? (
                                <tr>
                                  <td colSpan={8} className="p-8 text-center text-xs text-slate-400 italic">
                                    No student records found matching the current search criteria.
                                  </td>
                                </tr>
                              ) : (
                                paginatedWeeklyStudents.map((student, idx) => {
                                  const rowNum = acadWeeklyPageSize === -1 ? idx + 1 : (validPage - 1) * acadWeeklyPageSize + idx + 1;
                                  const entry = (studentAcademicTracker || []).find(
                                    e => ((e.student_id && (e.student_id === student.id || e.student_id === student.register_number)) || (student.email && e.student_email && e.student_email.toLowerCase().trim() === student.email.toLowerCase().trim())) &&
                                      (isSubjectNameMatch(e.subject, activeWeeklySubj) || e.subject.toLowerCase().trim() === activeWeeklySubj.toLowerCase().trim()) &&
                                      e.week_number === acadWeeklyWeek
                                  );

                                  const qm = entry?.quiz_marks !== undefined && entry?.quiz_marks !== null ? entry.quiz_marks : "";
                                  const asm = entry?.assessment_marks !== undefined && entry?.assessment_marks !== null ? entry.assessment_marks : "";
                                  const agm = entry?.assignment_marks !== undefined && entry?.assignment_marks !== null ? entry.assignment_marks : "";
                                  const totalScore = (qm !== "" || asm !== "" || agm !== "")
                                    ? ((Number(qm) || 0) + (Number(asm) || 0) + (Number(agm) || 0))
                                    : null;

                                  const targetTaskDate = currentWeeklyTask?.task_date || currentWeeklyTask?.created_at?.slice(0, 10);
                                  let currentAttStatus = "—";
                                  if (currentWeeklyTask) {
                                    const attLogs = studentAttendance.filter(a => {
                                      if (a.studentId !== student.id) return false;
                                      if (!activeWeeklySubj) return true;
                                      const slot = slots.find(sl => sl.id === a.slotId);
                                      const subj = a.coveredSubject || slot?.course || "";
                                      return isSubjectNameMatch(subj, activeWeeklySubj);
                                    });
                                    const exactDateLog = targetTaskDate ? attLogs.find(a => a.dateStr === targetTaskDate) : null;
                                    const sortedLogs = [...attLogs].sort((a, b) => (b.dateStr || "").localeCompare(a.dateStr || ""));
                                    const effectiveLog = exactDateLog || sortedLogs[0];
                                    if (effectiveLog) {
                                      const st = (effectiveLog.status || "").toLowerCase();
                                      currentAttStatus = st === "absent" ? "Absent" : st === "od" ? "OD" : "Present";
                                    } else if (entry?.attendance_status) {
                                      currentAttStatus = entry.attendance_status;
                                    } else {
                                      currentAttStatus = "Present";
                                    }
                                  }
                                  const status = acadSaveStatusMap[student.email] || "idle";

                                  return (
                                    <tr key={`${student.email}_wk${acadWeeklyWeek}`} className="hover:bg-slate-50/60 transition-colors">
                                      <td className="p-3 text-center font-bold text-slate-400 border-r border-slate-100">
                                        {rowNum}
                                      </td>
                                      <td className="p-3 border-r border-slate-100">
                                        <div className="font-bold text-slate-900 leading-tight">{student.name}</div>
                                        <div className="text-[10px] text-amber-600 font-mono font-bold mt-0.5 select-all">
                                          {student.email}
                                        </div>
                                        <div className="text-[9.5px] text-slate-400 font-mono">
                                          ID: {student.id} {student.register_number ? `• Reg: ${student.register_number}` : ""}
                                        </div>
                                      </td>
                                      <td className="p-3 text-center border-r border-slate-100">
                                        {currentAttStatus === "—" ? (
                                          <span className="inline-flex items-center justify-center text-xs font-bold text-slate-300 select-none">
                                            —
                                          </span>
                                        ) : (
                                          <span
                                            className={`inline-flex items-center gap-1 text-[10px] font-black uppercase px-2.5 py-1 rounded-lg border shadow-2xs ${currentAttStatus === "Absent"
                                                ? "bg-rose-50 text-rose-700 border-rose-200"
                                                : currentAttStatus === "OD"
                                                  ? "bg-blue-50 text-blue-700 border-blue-200"
                                                  : currentAttStatus === "Present"
                                                    ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                                    : "bg-slate-100 text-slate-500 border-slate-200"
                                              }`}
                                            title={`Marked attendance from class session: ${currentAttStatus}`}
                                          >
                                            <span className={`h-1.5 w-1.5 rounded-full ${currentAttStatus === "Absent" ? "bg-rose-600" : currentAttStatus === "OD" ? "bg-blue-600" : currentAttStatus === "Present" ? "bg-emerald-600" : "bg-slate-400"
                                              }`} />
                                            <span>{currentAttStatus}</span>
                                          </span>
                                        )}
                                      </td>
                                      {/* Quiz Marks */}
                                      <td className="p-3 border-r border-slate-100 bg-amber-50/15">
                                        <input
                                          type="number"
                                          min="0"
                                          max="10"
                                          step="0.5"
                                          value={acadMarksDraft[student.email]?.quiz !== undefined ? acadMarksDraft[student.email].quiz : (qm !== "" ? String(qm) : "")}
                                          onChange={(e) => {
                                            const val = e.target.value;
                                            setAcadMarksDraft(prev => ({
                                              ...prev,
                                              [student.email]: { ...(prev[student.email] || {}), quiz: val }
                                            }));
                                          }}
                                          onBlur={async (e) => {
                                            const val = e.target.value;
                                            if (val === String(qm)) return;
                                            if (val !== "" && (parseFloat(val) < 0 || parseFloat(val) > 10)) {
                                              toast("Quiz marks must be between 0 and 10.", "warning");
                                              return;
                                            }
                                            setAcadSaveStatusMap(prev => ({ ...prev, [student.email]: "saving" }));
                                            const res = await gradeStudentAcademicTask({
                                              studentEmail: student.email,
                                              studentId: student.id,
                                              classGroup: student.classGroup || activeWeeklyClassGroup,
                                              subject: activeWeeklySubj,
                                              weekNumber: acadWeeklyWeek,
                                              quizMarks: val !== "" ? parseFloat(val) : null,
                                              assessmentMarks: asm !== "" ? parseFloat(String(asm)) : null,
                                              assignmentMarks: agm !== "" ? parseFloat(String(agm)) : null,
                                              attendanceStatus: currentAttStatus,
                                              feedback: entry?.feedback,
                                              gradedBy: currentMentor.id
                                            });
                                            setAcadSaveStatusMap(prev => ({ ...prev, [student.email]: res.success ? "saved" : "error" }));
                                            setTimeout(() => {
                                              setAcadSaveStatusMap(prev => ({ ...prev, [student.email]: "idle" }));
                                            }, 2000);
                                          }}
                                          placeholder="—"
                                          className="w-full text-center text-xs font-black px-2 py-1.5 rounded-lg border border-amber-200 focus:outline-none focus:ring-1 focus:ring-amber-500 bg-white text-slate-900"
                                          aria-label="Quiz (0-10)"
                                        />
                                      </td>
                                      {/* Assessment Marks */}
                                      <td className="p-3 border-r border-slate-100 bg-purple-50/15">
                                        <input
                                          type="number"
                                          min="0"
                                          max="10"
                                          step="0.5"
                                          value={acadMarksDraft[student.email]?.assessment !== undefined ? acadMarksDraft[student.email].assessment : (asm !== "" ? String(asm) : "")}
                                          onChange={(e) => {
                                            const val = e.target.value;
                                            setAcadMarksDraft(prev => ({
                                              ...prev,
                                              [student.email]: { ...(prev[student.email] || {}), assessment: val }
                                            }));
                                          }}
                                          onBlur={async (e) => {
                                            const val = e.target.value;
                                            if (val === String(asm)) return;
                                            if (val !== "" && (parseFloat(val) < 0 || parseFloat(val) > 10)) {
                                              toast("Assessment marks must be between 0 and 10.", "warning");
                                              return;
                                            }
                                            setAcadSaveStatusMap(prev => ({ ...prev, [student.email]: "saving" }));
                                            const res = await gradeStudentAcademicTask({
                                              studentEmail: student.email,
                                              studentId: student.id,
                                              classGroup: student.classGroup || activeWeeklyClassGroup,
                                              subject: activeWeeklySubj,
                                              weekNumber: acadWeeklyWeek,
                                              quizMarks: qm !== "" ? parseFloat(String(qm)) : null,
                                              assessmentMarks: val !== "" ? parseFloat(val) : null,
                                              assignmentMarks: agm !== "" ? parseFloat(String(agm)) : null,
                                              attendanceStatus: currentAttStatus,
                                              feedback: entry?.feedback,
                                              gradedBy: currentMentor.id
                                            });
                                            setAcadSaveStatusMap(prev => ({ ...prev, [student.email]: res.success ? "saved" : "error" }));
                                            setTimeout(() => {
                                              setAcadSaveStatusMap(prev => ({ ...prev, [student.email]: "idle" }));
                                            }, 2000);
                                          }}
                                          placeholder="—"
                                          className="w-full text-center text-xs font-black px-2 py-1.5 rounded-lg border border-purple-200 focus:outline-none focus:ring-1 focus:ring-purple-500 bg-white text-slate-900"
                                          aria-label="Assessment (0-10)"
                                        />
                                      </td>
                                      {/* Assignment Marks */}
                                      <td className="p-3 border-r border-slate-100 bg-emerald-50/15">
                                        <input
                                          type="number"
                                          min="0"
                                          max="10"
                                          step="0.5"
                                          value={acadMarksDraft[student.email]?.assignment !== undefined ? acadMarksDraft[student.email].assignment : (agm !== "" ? String(agm) : "")}
                                          onChange={(e) => {
                                            const val = e.target.value;
                                            setAcadMarksDraft(prev => ({
                                              ...prev,
                                              [student.email]: { ...(prev[student.email] || {}), assignment: val }
                                            }));
                                          }}
                                          onBlur={async (e) => {
                                            const val = e.target.value;
                                            if (val === String(agm)) return;
                                            if (val !== "" && (parseFloat(val) < 0 || parseFloat(val) > 10)) {
                                              toast("Assignment marks must be between 0 and 10.", "warning");
                                              return;
                                            }
                                            setAcadSaveStatusMap(prev => ({ ...prev, [student.email]: "saving" }));
                                            const res = await gradeStudentAcademicTask({
                                              studentEmail: student.email,
                                              studentId: student.id,
                                              classGroup: student.classGroup || activeWeeklyClassGroup,
                                              subject: activeWeeklySubj,
                                              weekNumber: acadWeeklyWeek,
                                              quizMarks: qm !== "" ? parseFloat(String(qm)) : null,
                                              assessmentMarks: asm !== "" ? parseFloat(String(asm)) : null,
                                              assignmentMarks: val !== "" ? parseFloat(val) : null,
                                              attendanceStatus: currentAttStatus,
                                              feedback: entry?.feedback,
                                              gradedBy: currentMentor.id
                                            });
                                            setAcadSaveStatusMap(prev => ({ ...prev, [student.email]: res.success ? "saved" : "error" }));
                                            setTimeout(() => {
                                              setAcadSaveStatusMap(prev => ({ ...prev, [student.email]: "idle" }));
                                            }, 2000);
                                          }}
                                          placeholder="—"
                                          className="w-full text-center text-xs font-black px-2 py-1.5 rounded-lg border border-emerald-200 focus:outline-none focus:ring-1 focus:ring-emerald-500 bg-white text-slate-900"
                                          aria-label="Assignment (0-10)"
                                        />
                                      </td>
                                      {/* Total Marks */}
                                      <td className="p-3 text-center border-r border-slate-100 bg-indigo-50/20">
                                        {totalScore !== null ? (
                                          <div>
                                            <span className="text-xs font-black text-indigo-900 block">
                                              {totalScore} / 30
                                            </span>
                                          </div>
                                        ) : (
                                          <span className="text-slate-300 text-xs">—</span>
                                        )}
                                      </td>
                                      {/* Remarks & Save Status */}
                                      <td className="p-3">
                                        <div className="flex items-center gap-2">
                                          <input
                                            type="text"
                                            defaultValue={entry?.feedback || ""}
                                            onBlur={async (e) => {
                                              const val = e.target.value.trim();
                                              if (val === (entry?.feedback || "")) return;
                                              setAcadSaveStatusMap(prev => ({ ...prev, [student.email]: "saving" }));
                                              const res = await gradeStudentAcademicTask({
                                                studentEmail: student.email,
                                                studentId: student.id,
                                                classGroup: student.classGroup || activeWeeklyClassGroup,
                                                subject: activeWeeklySubj,
                                                weekNumber: acadWeeklyWeek,
                                                quizMarks: qm !== "" ? parseFloat(String(qm)) : null,
                                                assessmentMarks: asm !== "" ? parseFloat(String(asm)) : null,
                                                assignmentMarks: agm !== "" ? parseFloat(String(agm)) : null,
                                                attendanceStatus: currentAttStatus,
                                                feedback: val,
                                                gradedBy: currentMentor.id
                                              });
                                              setAcadSaveStatusMap(prev => ({ ...prev, [student.email]: res.success ? "saved" : "error" }));
                                              setTimeout(() => {
                                                setAcadSaveStatusMap(prev => ({ ...prev, [student.email]: "idle" }));
                                              }, 2000);
                                            }}
                                            placeholder="Enter feedback or notes..."
                                            className="flex-1 text-[11px] font-semibold px-2.5 py-1.5 rounded-lg border border-slate-200 inset-shadow-well focus:bg-white dark:focus:bg-[#131317] focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500/20 bg-sunken text-slate-800"
                                            aria-label="Remarks / Feedback"
                                          />
                                          {status === "saving" && (
                                            <span className="w-3.5 h-3.5 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin shrink-0"></span>
                                          )}
                                          {status === "saved" && (
                                            <CheckCircle className="h-4 w-4 text-emerald-600 shrink-0" />
                                          )}
                                          {status === "error" && (
                                            <AlertCircle className="h-4 w-4 text-rose-500 shrink-0" />
                                          )}
                                        </div>
                                      </td>
                                    </tr>
                                  );
                                })
                              )}
                            </tbody>
                          </table>
                        </div>

                        {/* Pagination Controls */}
                        <div className="pt-3 border-t border-slate-100">
                          <Pagination
                            currentPage={validPage}
                            totalItems={totalItems}
                            pageSize={acadWeeklyPageSize <= 0 ? 25 : acadWeeklyPageSize}
                            pageSizeOptions={[10, 25, 50, 100]}
                            onPageChange={setAcadWeeklyPage}
                            onPageSizeChange={(newSize) => {
                              setAcadWeeklyPageSize(newSize);
                              setAcadWeeklyPage(1);
                            }}
                          />
                        </div>
                      </div>

                      {/* Task Assignment Modal */}
                      {isEditingAcadTask && (
                        <Dialog
                          open={isEditingAcadTask}
                          onOpenChange={(next) => { if (!next) setIsEditingAcadTask(false); }}
                          ariaLabel={`Assign week ${acadWeeklyWeek} academic tasks for ${activeWeeklySubj}`}
                          overlayClassName="bg-slate-950/60 backdrop-blur-sm p-4"
                          panelClassName="max-w-lg rounded-2xl p-6 border-slate-200 space-y-4 max-h-[90vh]"
                        >
                          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                            <div className="flex items-center gap-2">
                              <Layers className="h-5 w-5 text-amber-600" />
                              <h3 className="text-sm font-black text-slate-900">
                                Assign Week {acadWeeklyWeek} Academic Tasks ({activeWeeklySubj})
                              </h3>
                            </div>
                            <button
                              type="button"
                              onClick={() => setIsEditingAcadTask(false)}
                              aria-label="Close academic task assignment"
                              className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </div>

                          <form
                            onSubmit={async (e) => {
                              e.preventDefault();
                              if (!acadTaskName.trim()) {
                                toast("Please enter a task title or instructions.", "warning");
                                return;
                              }

                              const res = await assignWeeklyAcademicTask({
                                classGroup: activeWeeklyClassGroup,
                                subject: activeWeeklySubj,
                                weekNumber: acadWeeklyWeek,
                                taskName: acadTaskName.trim(),
                                taskDate: acadTaskDate,
                                taskPdfUrl: acadTaskPdf.trim() || undefined,
                                quizTopic: acadIncludeQuiz ? (acadQuizUrl.trim() || "Enabled") : undefined,
                                assessmentTopic: acadIncludeAssessment ? (acadAssessmentUrl.trim() || "Enabled") : undefined,
                                assignmentTopic: acadIncludeAssignment ? (acadAssignmentUrl.trim() || "Enabled") : undefined,
                                mentorId: currentMentor.id
                              });

                              if (res.success) {
                                toast(`Week ${acadWeeklyWeek} task guidelines saved!`, "success");
                                setIsEditingAcadTask(false);
                              } else {
                                toast(res.message || "Failed to save task.", "error");
                              }
                            }}
                            className="space-y-4"
                          >
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                              <div className="sm:col-span-2 space-y-1">
                                <label className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider block">
                                  Overall Task Title / Topic / Weekly Overview <span className="text-rose-500">*</span>
                                </label>
                                <input
                                  type="text"
                                  required
                                  value={acadTaskName}
                                  onChange={(e) => setAcadTaskName(e.target.value)}
                                  placeholder="e.g. Unit 2: Sorting Algorithms & Hash Maps Evaluation"
                                  className="w-full px-3.5 py-2.5 text-xs font-semibold rounded-xl border border-slate-200 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500/20 bg-white shadow-2xs"
                                  aria-label="Overall Task Title / Topic / Weekly Overview"
                                />
                              </div>

                              <div className="space-y-1">
                                <label className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider block">
                                  Task / Session Date <span className="text-rose-500">*</span>
                                </label>
                                <input
                                  type="date"
                                  required
                                  value={acadTaskDate}
                                  onChange={(e) => setAcadTaskDate(e.target.value)}
                                  className="w-full px-3 py-2.5 text-xs font-semibold rounded-xl border border-slate-200 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500/20 bg-white shadow-2xs"
                                  aria-label="Task / Session Date"
                                />
                              </div>
                            </div>

                            {/* Active Evaluation Components Checkboxes & URLs */}
                            <div className="space-y-3 p-4 bg-slate-50/90 rounded-2xl border border-slate-100 shadow-2xs">
                              <div className="flex items-center justify-between">
                                <label className="text-[10.5px] font-black text-slate-700 uppercase tracking-wider block">
                                  Select Evaluation Components for Week {acadWeeklyWeek}
                                </label>
                                <span className="text-[9.5px] font-bold text-slate-400">
                                  Tick to activate &amp; paste link
                                </span>
                              </div>

                              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                {/* 1. Quiz */}
                                <div className={`p-3 rounded-xl border transition-all ${acadIncludeQuiz ? "bg-indigo-50/80 border-indigo-300 ring-2 ring-indigo-500/25 shadow-xs" : "bg-white border-slate-200 opacity-60"}`}>
                                  <label className="flex items-center gap-2 cursor-pointer font-black text-xs text-indigo-950 select-none">
                                    <input
                                      type="checkbox"
                                      checked={acadIncludeQuiz}
                                      onChange={(e) => setAcadIncludeQuiz(e.target.checked)}
                                      className="h-4 w-4 rounded text-amber-600 focus:ring-indigo-500 cursor-pointer accent-indigo-600"
                                    />
                                    <span>Quiz (0–10)</span>
                                  </label>
                                  {acadIncludeQuiz && (
                                    <div className="mt-2.5">
                                      <input
                                        type="url"
                                        value={acadQuizUrl}
                                        onChange={(e) => setAcadQuizUrl(e.target.value)}
                                        placeholder="Paste Quiz Link"
                                        className="w-full px-2.5 py-1.5 text-[11px] font-semibold rounded-lg border border-indigo-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 bg-white text-slate-900 shadow-2xs"
                                      />
                                    </div>
                                  )}
                                </div>

                                {/* 2. Assessment */}
                                <div className={`p-3 rounded-xl border transition-all ${acadIncludeAssessment ? "bg-purple-50/80 border-purple-300 ring-2 ring-purple-500/25 shadow-xs" : "bg-white border-slate-200 opacity-60"}`}>
                                  <label className="flex items-center gap-2 cursor-pointer font-black text-xs text-purple-950 select-none">
                                    <input
                                      type="checkbox"
                                      checked={acadIncludeAssessment}
                                      onChange={(e) => setAcadIncludeAssessment(e.target.checked)}
                                      className="h-4 w-4 rounded text-purple-600 focus:ring-purple-500 cursor-pointer accent-purple-600"
                                    />
                                    <span>Assessment (0–10)</span>
                                  </label>
                                  {acadIncludeAssessment && (
                                    <div className="mt-2.5">
                                      <input
                                        type="url"
                                        value={acadAssessmentUrl}
                                        onChange={(e) => setAcadAssessmentUrl(e.target.value)}
                                        placeholder="Paste Test Link"
                                        className="w-full px-2.5 py-1.5 text-[11px] font-semibold rounded-lg border border-purple-200 focus:outline-none focus:ring-2 focus:ring-purple-500/30 bg-white text-slate-900 shadow-2xs"
                                      />
                                    </div>
                                  )}
                                </div>

                                {/* 3. Assignment */}
                                <div className={`p-3 rounded-xl border transition-all ${acadIncludeAssignment ? "bg-emerald-50/80 border-emerald-300 ring-2 ring-emerald-500/25 shadow-xs" : "bg-white border-slate-200 opacity-60"}`}>
                                  <label className="flex items-center gap-2 cursor-pointer font-black text-xs text-emerald-950 select-none">
                                    <input
                                      type="checkbox"
                                      checked={acadIncludeAssignment}
                                      onChange={(e) => setAcadIncludeAssignment(e.target.checked)}
                                      className="h-4 w-4 rounded text-emerald-600 focus:ring-emerald-500 cursor-pointer accent-emerald-600"
                                    />
                                    <span>Assignment (0–10)</span>
                                  </label>
                                  {acadIncludeAssignment && (
                                    <div className="mt-2.5">
                                      <input
                                        type="url"
                                        value={acadAssignmentUrl}
                                        onChange={(e) => setAcadAssignmentUrl(e.target.value)}
                                        placeholder="Paste Task Link"
                                        className="w-full px-2.5 py-1.5 text-[11px] font-semibold rounded-lg border border-emerald-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 bg-white text-slate-900 shadow-2xs"
                                      />
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>

                            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                              <button
                                type="button"
                                onClick={() => setIsEditingAcadTask(false)}
                                className="px-4 py-2 rounded-xl text-xs font-bold border border-slate-200 hover:bg-slate-50 text-slate-600 cursor-pointer"
                              >
                                Cancel
                              </button>
                              <button
                                type="submit"
                                className="px-5 py-2 rounded-xl text-xs font-bold bg-zinc-900 hover:bg-zinc-800 text-white border border-white/10 shadow-sm cursor-pointer"
                              >
                                Save Guidelines
                              </button>
                            </div>
                          </form>
                        </Dialog>
                      )}
                    </div>
                  );
                })()}

                {/* ── LOG / EDIT ACADEMIC PERIOD MODAL ── */}
                {showAcadLogModal && (() => {
                  const todayStr = new Date().toISOString().split("T")[0];
                  const { dateSlots, dayOrder, dayType, mappedDay, dayName, isConfigured, isHoliday } = getMentorSlotsForDate(todayStr);

                  // Check if currently selected slot is in the future today
                  const selectedPeriodStart = parseSlotStartTime(acadFormPeriodSlot);
                  const isSelectedPeriodUpcoming = Boolean(selectedPeriodStart && new Date() < selectedPeriodStart);
                  const isFormBlocked = isHoliday || !isConfigured || dateSlots.length === 0 || isSelectedPeriodUpcoming;

                  return (
                    <Dialog
                      open={showAcadLogModal}
                      onOpenChange={(next) => { if (!next) setShowAcadLogModal(false); }}
                      ariaLabel={editingAcadEntry ? "Edit academic period log" : "Log teaching period"}
                      overlayClassName="bg-slate-950/60 backdrop-blur-sm p-4"
                      panelClassName="max-w-lg rounded-2xl border-slate-200 p-6 space-y-4 max-h-[90vh] overflow-y-auto"
                    >
                      <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                        <div className="flex items-center gap-2.5">
                          <div className="p-2 rounded-xl bg-indigo-50 text-amber-600 border border-indigo-100">
                            <BookOpen className="w-5 h-5" />
                          </div>
                          <div>
                            <h3 className="text-sm font-black text-slate-900">
                              {editingAcadEntry ? "Edit Academic Period Log" : "Log Teaching Period"}
                            </h3>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => setShowAcadLogModal(false)}
                          aria-label="Close academic log form"
                          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
                        >
                          <X className="w-5 h-5" />
                        </button>
                      </div>

                      {/* Day Order & Timetable Status Info Badge */}
                      {isHoliday ? (
                        <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 flex items-start gap-2.5 text-xs">
                          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                          <div className="space-y-0.5">
                            <span className="font-extrabold text-rose-800">Holiday Declared</span>
                            <p className="text-[11px] text-rose-700 font-medium">
                              Campus Manager has marked today as a Holiday. Period logging is disabled for today.
                            </p>
                          </div>
                        </div>
                      ) : !isConfigured ? (
                        <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 flex items-start gap-2.5 text-xs">
                          <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                          <div className="space-y-0.5">
                            <span className="font-extrabold text-amber-800">CM Day Order Not Set</span>
                            <p className="text-[11px] text-amber-700 font-medium">
                              The Campus Manager (CM) has not configured the Day Order for today. Period logging works strictly as per CM setting Day Order.
                            </p>
                          </div>
                        </div>
                      ) : (
                        <div className="p-3 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-between gap-2 text-xs">
                          <div className="space-y-0.5">
                            <div className="flex items-center gap-1.5">
                              <span className="font-extrabold text-slate-800">{dayName}</span>
                              <span className="px-2 py-0.5 rounded-md bg-indigo-100 text-amber-700 text-[10px] font-black uppercase">
                                {dayOrder} ({mappedDay} Timetable)
                              </span>
                            </div>
                            <span className="text-[10.5px] text-slate-500 font-medium block">
                              {dateSlots.length > 0
                                ? `${dateSlots.length} scheduled period${dateSlots.length !== 1 ? 's' : ''} assigned to you under CM ${dayOrder}`
                                : `No scheduled periods assigned to you for today's CM ${dayOrder} (${mappedDay}) schedule`}
                            </span>
                          </div>

                          {dateSlots.length > 0 && (
                            <span className="px-2 py-1 bg-emerald-50 text-emerald-700 font-black text-[9.5px] rounded-lg border border-emerald-200 uppercase shrink-0">
                              CM Day Order Active
                            </span>
                          )}
                        </div>
                      )}

                      <form onSubmit={handleSaveLog} className="space-y-4">
                        {/* Date & Period Slot */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div className="space-y-1">
                            <div className="flex items-center justify-between">
                              <label className="text-[10px] text-slate-500 font-extrabold uppercase tracking-wider block">Conduction Date *</label>
                              <span className="text-[9.5px] font-bold text-amber-600 bg-indigo-50 px-2 py-0.5 rounded-full border border-indigo-200">
                                Today Only
                              </span>
                            </div>
                            <input
                              type="date"
                              min={todayStr}
                              max={todayStr}
                              value={todayStr}
                              readOnly
                              disabled
                              className="w-full p-2.5 border border-slate-200 rounded-xl text-xs font-semibold outline-none bg-slate-100 text-slate-600 cursor-not-allowed"
                              required
                              aria-label="Conduction Date"
                            />
                            <p className="text-[10px] text-slate-400 font-medium">
                              Period logging is restricted to today only. Previous and future dates are locked.
                            </p>
                          </div>

                          <div className="space-y-1">
                            <label className="text-[10px] text-slate-500 font-extrabold uppercase tracking-wider block">Scheduled Period Slot *</label>
                            <select
                              value={
                                dateSlots.some(s => s.time === acadFormPeriodSlot)
                                  ? dateSlots.find(s => s.time === acadFormPeriodSlot)?.id || acadFormPeriodSlot
                                  : acadFormPeriodSlot
                              }
                              onChange={e => handlePeriodSelectInModal(e.target.value, dateSlots)}
                              disabled={isHoliday || !isConfigured || dateSlots.length === 0}
                              className="w-full p-2.5 border border-slate-200 rounded-xl text-xs font-semibold focus:ring-1 focus:ring-indigo-500 outline-none bg-white cursor-pointer disabled:bg-slate-100 disabled:cursor-not-allowed"
                              required
                              aria-label="Scheduled Period Slot"
                            >
                              {dateSlots.length > 0 ? (
                                dateSlots.map(slot => {
                                  const pStart = parseSlotStartTime(slot.time);
                                  const isUpcoming = Boolean(pStart && new Date() < pStart);
                                  return (
                                    <option key={slot.id} value={slot.id}>
                                      {slot.time} • {slot.classGroup} ({slot.course}){isUpcoming ? " — [Upcoming: Starts " + formatTimeLabel(slot.time) + "]" : ""}
                                    </option>
                                  );
                                })
                              ) : (
                                <option value="" disabled>
                                  {isHoliday
                                    ? "No periods available (Holiday)"
                                    : !isConfigured
                                      ? "CM Day Order not configured"
                                      : `No scheduled periods under CM ${dayOrder} (${mappedDay})`}
                                </option>
                              )}
                            </select>
                            {isSelectedPeriodUpcoming && (
                              <p className="text-[10.5px] text-amber-600 font-semibold flex items-center gap-1 mt-1">
                                <Clock className="w-3.5 h-3.5 shrink-0" />
                                This period has not started yet. Future periods cannot be logged in advance.
                              </p>
                            )}
                          </div>
                        </div>

                        {/* Class Group & Subject */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div className="space-y-1">
                            <label className="text-[10px] text-slate-500 font-extrabold uppercase tracking-wider block">Class Group / Cohort *</label>
                            <select
                              value={acadFormClassGroup}
                              onChange={e => setAcadFormClassGroup(e.target.value)}
                              disabled={isHoliday || !isConfigured}
                              className="w-full p-2.5 border border-slate-200 rounded-xl text-xs font-semibold focus:ring-1 focus:ring-indigo-500 outline-none bg-white cursor-pointer disabled:bg-slate-100 disabled:cursor-not-allowed"
                              required
                              aria-label="Class Group / Cohort"
                            >
                              {mentorClassesList.map(cg => (
                                <option key={cg} value={cg}>{cg}</option>
                              ))}
                              {mentorClassesList.length === 0 && <option value="General Batch">General Batch</option>}
                            </select>
                          </div>

                          <div className="space-y-1">
                            <label className="text-[10px] text-slate-500 font-extrabold uppercase tracking-wider block">Academic Subject *</label>
                            <select
                              value={acadFormSubject}
                              onChange={e => setAcadFormSubject(e.target.value)}
                              disabled={isHoliday || !isConfigured}
                              className="w-full p-2.5 border border-slate-200 rounded-xl text-xs font-semibold focus:ring-1 focus:ring-indigo-500 outline-none bg-white cursor-pointer disabled:bg-slate-100 disabled:cursor-not-allowed"
                              required
                              aria-label="Academic Subject"
                            >
                              {availableAcadSubjects.map(sub => (
                                <option key={sub} value={sub}>{sub}</option>
                              ))}
                            </select>
                          </div>
                        </div>

                        {/* Unit & Conduction Status */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div className="space-y-1">
                            <label className="text-[10px] text-slate-500 font-extrabold uppercase tracking-wider block">Syllabus Unit *</label>
                            <select
                              value={acadFormUnit}
                              onChange={e => setAcadFormUnit(e.target.value)}
                              disabled={isHoliday || !isConfigured}
                              className="w-full p-2.5 border border-slate-200 rounded-xl text-xs font-semibold focus:ring-1 focus:ring-indigo-500 outline-none bg-white cursor-pointer disabled:bg-slate-100 disabled:cursor-not-allowed"
                              required
                              aria-label="Syllabus Unit"
                            >
                              <option value="Unit 1">Unit 1</option>
                              <option value="Unit 2">Unit 2</option>
                              <option value="Unit 3">Unit 3</option>
                              <option value="Unit 4">Unit 4</option>
                              <option value="Unit 5">Unit 5</option>
                              <option value="Revision & Problem Solving">Revision & Problem Solving</option>
                              <option value="Unit Test / Assessment">Unit Test / Assessment</option>
                            </select>
                          </div>

                          <div className="space-y-1">
                            <label className="text-[10px] text-slate-500 font-extrabold uppercase tracking-wider block">Conduction Status *</label>
                            <select
                              value={acadFormStatus}
                              onChange={e => setAcadFormStatus(e.target.value)}
                              disabled={isHoliday || !isConfigured}
                              className="w-full p-2.5 border border-slate-200 rounded-xl text-xs font-semibold focus:ring-1 focus:ring-indigo-500 outline-none bg-white cursor-pointer disabled:bg-slate-100 disabled:cursor-not-allowed"
                              required
                              aria-label="Conduction Status"
                            >
                              <option value="Delivered">Delivered</option>
                              <option value="Not Delivered">Not Delivered</option>
                            </select>
                          </div>
                        </div>

                        {/* Topic Covered */}
                        <div className="space-y-1">
                          <label className="text-[10px] text-slate-500 font-extrabold uppercase tracking-wider block">Topic Covered During Class *</label>
                          <input
                            type="text"
                            placeholder="e.g. Introduction to Binary Search Trees & Node Insertion"
                            value={acadFormTopic}
                            onChange={e => setAcadFormTopic(e.target.value)}
                            disabled={isHoliday || !isConfigured}
                            className="w-full p-2.5 border border-slate-200 rounded-xl text-xs font-semibold focus:ring-1 focus:ring-indigo-500 outline-none disabled:bg-slate-100 disabled:cursor-not-allowed"
                            required
                            aria-label="Topic Covered During Class"
                          />
                        </div>

                        {/* Comments / Practice Assigned */}
                        <div className="space-y-1">
                          <label className="text-[10px] text-slate-500 font-extrabold uppercase tracking-wider block">Delivery Comments & Homework Remarks</label>
                          <textarea
                            rows={3}
                            placeholder="e.g. Completed textbook derivation, assigned 3 practice problems from chapter 4 for next class."
                            value={acadFormComments}
                            onChange={e => setAcadFormComments(e.target.value)}
                            disabled={isHoliday || !isConfigured}
                            className="w-full p-2.5 border border-slate-200 rounded-xl text-xs font-medium focus:ring-1 focus:ring-indigo-500 outline-none resize-none disabled:bg-slate-100 disabled:cursor-not-allowed"
                            aria-label="Delivery Comments &amp; Homework Remarks"
                          />
                        </div>

                        <div className="flex justify-end gap-2.5 pt-3 border-t border-slate-100">
                          <button
                            type="button"
                            onClick={() => setShowAcadLogModal(false)}
                            className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
                          >
                            Cancel
                          </button>

                          <button
                            type="submit"
                            disabled={isSavingAcadEntry || isFormBlocked}
                            className="px-5 py-2 rounded-xl text-xs font-extrabold text-white bg-slate-900 hover:bg-indigo-600 transition-all cursor-pointer flex items-center gap-2 shadow-xs disabled:opacity-50 disabled:cursor-not-allowed"
                            title={
                              isHoliday
                                ? "Disabled: Today is declared a holiday"
                                : !isConfigured
                                  ? "Disabled: CM Day Order must be configured first"
                                  : dateSlots.length === 0
                                    ? "Disabled: No scheduled periods assigned to you today"
                                    : isSelectedPeriodUpcoming
                                      ? "Disabled: Future periods cannot be logged in advance"
                                      : undefined
                            }
                          >
                            {isSavingAcadEntry && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                            <span>{editingAcadEntry ? "Update Log" : "Save Teaching Period"}</span>
                          </button>
                        </div>
                      </form>
                    </Dialog>
                  );
                })()}

                {/* Modal: Request Log Correction from Campus Manager (CM) */}
                {showAcadEditRequestModal && targetAcadEditLog && (
                  <Dialog
                    open={showAcadEditRequestModal && !!targetAcadEditLog}
                    onOpenChange={(next) => { if (!next) setShowAcadEditRequestModal(false); }}
                    ariaLabel="Request log correction from Campus Manager"
                    overlayClassName="bg-slate-950/60 backdrop-blur-sm p-4"
                    panelClassName="max-w-lg rounded-2xl border-slate-200 p-0 space-y-0 overflow-hidden flex flex-col max-h-[90vh]"
                  >
                    <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-transparent">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center">
                          <ShieldAlert className="w-5 h-5" />
                        </div>
                        <div>
                          <h2 className="text-sm font-extrabold text-slate-900">Request Log Correction</h2>
                          <p className="text-xs text-slate-500">Submit an attendance or log edit request to Campus Manager.</p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowAcadEditRequestModal(false)}
                        aria-label="Close log correction request"
                        className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>

                    <form onSubmit={handleSubmitAcadEditRequest} className="p-5 space-y-4">
                      <div className="bg-slate-50 border border-slate-100 rounded-xl p-3.5 space-y-2 text-xs">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] uppercase font-black tracking-wider text-slate-400">Current Log Record</span>
                          <span className="px-2 py-0.5 rounded-md bg-slate-200 text-slate-700 text-[10px] font-bold">
                            {targetAcadEditLog.date} • {targetAcadEditLog.period_slot}
                          </span>
                        </div>
                        <div className="font-bold text-slate-800">{targetAcadEditLog.subject} <span className="text-slate-400 font-normal">({targetAcadEditLog.class_group})</span></div>
                        <div className="text-slate-600 text-[11px]"><strong className="text-slate-700">Topic:</strong> {targetAcadEditLog.topic}</div>
                        {targetAcadEditLog.comments && (
                          <div className="text-slate-500 text-[11px] italic"><strong className="text-slate-700 not-italic">Remarks:</strong> {targetAcadEditLog.comments}</div>
                        )}
                      </div>

                      <div className="space-y-1">
                        <label className="text-[10px] text-slate-500 font-extrabold uppercase tracking-wider block">Proposed Corrected Topic</label>
                        <input
                          type="text"
                          value={acadEditProposedTopic}
                          onChange={e => setAcadEditProposedTopic(e.target.value)}
                          placeholder="e.g. Corrected topic or detailed syllabus section covered"
                          className="w-full p-2.5 border border-slate-200 rounded-xl text-xs font-semibold focus:ring-1 focus:ring-amber-500 outline-none"
                          aria-label="Proposed Corrected Topic"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="text-[10px] text-slate-500 font-extrabold uppercase tracking-wider block">Proposed Corrected Remarks / Notes</label>
                        <textarea
                          rows={2}
                          value={acadEditProposedComments}
                          onChange={e => setAcadEditProposedComments(e.target.value)}
                          placeholder="e.g. Revised delivery remarks or homework clarification"
                          className="w-full p-2.5 border border-slate-200 rounded-xl text-xs font-medium focus:ring-1 focus:ring-amber-500 outline-none resize-none"
                          aria-label="Proposed Corrected Remarks / Notes"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="text-[10px] text-slate-700 font-extrabold uppercase tracking-wider block">Reason for Correction / Justification for CM *</label>
                        <textarea
                          rows={3}
                          required
                          value={acadEditReason}
                          onChange={e => setAcadEditReason(e.target.value)}
                          placeholder="Explain why this past period log needs correction (e.g. Typo in topic name, swapped unit coverage, etc.)"
                          className="w-full p-2.5 border border-amber-300 rounded-xl text-xs font-medium focus:ring-2 focus:ring-amber-500 outline-none resize-none bg-amber-50/30"
                          aria-label="Reason for Correction / Justification for CM"
                        />
                      </div>

                      <div className="flex justify-end gap-2.5 pt-3 border-t border-slate-100">
                        <button
                          type="button"
                          onClick={() => setShowAcadEditRequestModal(false)}
                          className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          disabled={isSubmittingAcadEditReq || !acadEditReason.trim()}
                          className="px-5 py-2 rounded-xl text-xs font-extrabold text-white bg-amber-600 hover:bg-amber-700 transition-all cursor-pointer flex items-center gap-2 shadow-xs disabled:opacity-50"
                        >
                          {isSubmittingAcadEditReq && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                          <span>Submit Request to CM</span>
                        </button>
                      </div>
                    </form>
                  </Dialog>
                )}
              </div>
            );
          })()}

        {/* Tab: Demo Evaluations */}
        {((activeTab as string) === "demo_evaluations") && (() => {
          const myDemos = demoSessions.filter(ds => ds.mentorId === currentMentor.id);
          const pendingDemos = myDemos.filter(d => d.status !== "completed");
          const completedDemos = myDemos.filter(d => d.status === "completed");

          const totalDemos = myDemos.length;
          const completedCount = completedDemos.length;
          const avgScore = completedCount > 0
            ? Math.round(completedDemos.reduce((sum, d) => sum + (d.marks || 0), 0) / completedCount)
            : 0;

          return (
            <div className="space-y-6 font-sans">


              {/* Statistics Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-card flex items-center gap-4">
                  <div className="p-3 bg-indigo-50 border border-indigo-100 text-amber-600 rounded-xl">
                    <Calendar className="h-5 w-5" />
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wide">Total Scheduled</span>
                    <p className="text-2xl font-black text-slate-800">{totalDemos}</p>
                  </div>
                </div>

                <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-card flex items-center gap-4">
                  <div className="p-3 bg-pink-50 border border-pink-100 text-pink-600 rounded-xl">
                    <Sparkles className="h-5 w-5" />
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wide">Evaluations Done</span>
                    <p className="text-2xl font-black text-slate-800">{completedCount}</p>
                  </div>
                </div>

                <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-card flex items-center gap-4">
                  <div className="p-3 bg-emerald-50 border border-emerald-100 text-emerald-600 rounded-xl">
                    <GraduationCap className="h-5 w-5" />
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wide">Average Score</span>
                    <p className="text-2xl font-black text-slate-800">{completedCount > 0 ? `${avgScore} / 100` : "N/A"}</p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

                {/* Left Column: Upcoming Evaluations (1/3 width) */}
                <div className="lg:col-span-1 space-y-4">
                  <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-card space-y-4">
                    <h3 className="text-xs font-black text-slate-800 uppercase tracking-widest border-b border-slate-100 pb-2">Upcoming Reviews</h3>

                    {pendingDemos.length > 0 ? (
                      <div className="space-y-4">
                        {pendingDemos.map(demo => (
                          <div key={demo.id} className="p-4 bg-slate-50/50 border border-slate-100 rounded-xl space-y-2">
                            <div className="flex justify-between items-center gap-2">
                              <span className="px-2 py-0.5 bg-indigo-50 border border-indigo-100 text-amber-600 text-[8px] font-black uppercase rounded truncate">
                                {demo.subject}
                              </span>
                              {demo.status === "reallocation_required" ? (
                                <span className="px-2 py-0.5 bg-amber-100 text-amber-900 border border-amber-300 text-[8px] font-black uppercase rounded shrink-0 animate-pulse">
                                  Reschedule Required (Leave Impacted)
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 bg-amber-50 text-amber-800 text-[8px] font-black uppercase rounded border border-amber-200 shrink-0">
                                  {demo.status === "confirmed" ? "Confirmed" : "Pending"}
                                </span>
                              )}
                            </div>
                            <div>
                              <p className="text-[11.5px] font-bold text-slate-800">{demo.dateStr}</p>
                              <p className="text-[10px] text-slate-500 font-semibold">{demo.timeSlot}</p>
                            </div>
                            <div className="text-[9.5px] text-slate-500 font-medium">
                              Evaluator: <span className="font-bold text-slate-700">{demo.smeName}</span>
                            </div>

                            {demo.status === "reallocation_required" ? (
                              <button
                                type="button"
                                onClick={() => handleOpenRescheduleModal(demo)}
                                className="w-full mt-2 py-2 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white text-xs font-black rounded-lg shadow-sm flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                              >
                                <Calendar className="h-3.5 w-3.5" />
                                Request Reschedule →
                              </button>
                            ) : (
                              <div className="flex gap-1.5 mt-2">
                                <button
                                  type="button"
                                  onClick={() => handleOpenRescheduleModal(demo)}
                                  className="flex-1 py-1.5 bg-sunken hover:bg-white text-slate-700 text-[10px] font-black rounded-lg border border-slate-200 inset-shadow-well flex items-center justify-center gap-1 transition-all cursor-pointer"
                                >
                                  <Calendar className="h-3 w-3 text-slate-500" />
                                  Reschedule
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setDemoSwapModalSession(demo);
                                    setDemoSwapReason("I am unavailable");
                                    setDemoSwapRemarks("");
                                    setDemoSwapStep(1);
                                    setSelectedProposedPeer(null);
                                  }}
                                  className="flex-1 py-1.5 bg-white hover:bg-slate-50 text-slate-700 text-[10px] font-black rounded-lg border border-slate-200 flex items-center justify-center gap-1 transition-all cursor-pointer"
                                >
                                  <RefreshCw className="h-2.5 w-2.5 text-amber-500" />
                                  Peer Swap
                                </button>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-slate-400 italic text-center py-6">No upcoming L&D reviews scheduled.</p>
                    )}

                    {/* Received Proposals */}
                    {(() => {
                      const received = demoSwapRequests?.filter(
                        (r: any) => r.proposedMentorId === currentMentor.id && r.status === "pending_peer"
                      ) || [];
                      if (received.length === 0) return null;
                      return (
                        <div className="pt-4 border-t border-slate-100 dark:border-slate-800 space-y-3">
                          <h4 className="text-[10px] font-black uppercase text-amber-500 tracking-wider">Swap Proposals Received</h4>
                          {received.map((req: any) => (
                            <div key={req.id} className="p-3 bg-indigo-50/20 border border-indigo-100 rounded-xl space-y-2 text-xs">
                              <p className="font-semibold text-slate-800 dark:text-slate-100">
                                {req.mentorName} wants to swap:
                              </p>
                              <p className="text-[10.5px] text-slate-500">{req.subject} • {req.dateStr} • {req.timeSlot}</p>
                              {req.reason && <p className="text-[10px] text-slate-400 italic">"{req.reason}"</p>}
                              <div className="flex gap-2 pt-1">
                                <button
                                  disabled={resolvingDemoSwapId === req.id}
                                  onClick={async () => {
                                    if (resolvingDemoSwapId) return;
                                    setResolvingDemoSwapId(req.id);
                                    try {
                                      const res = await resolveDemoSwap(req.id, "rejected");
                                      if (res.success) toast("Proposal rejected.", "success");
                                      else toast(res.message || "Failed to reject the proposal.", "error");
                                    } finally {
                                      setResolvingDemoSwapId(null);
                                    }
                                  }}
                                  className="flex-1 py-1 text-[10px] font-bold border border-slate-200 hover:bg-slate-100 rounded-lg text-slate-600 transition-all cursor-pointer text-center disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                  Reject
                                </button>
                                <button
                                  disabled={resolvingDemoSwapId === req.id}
                                  onClick={async () => {
                                    if (resolvingDemoSwapId) return;
                                    setResolvingDemoSwapId(req.id);
                                    try {
                                      const res = await resolveDemoSwap(req.id, "pending_sme");
                                      if (res.success) toast("Proposal accepted! Awaiting SME approval.", "success");
                                      else toast(res.message || "Failed to accept the proposal.", "error");
                                    } finally {
                                      setResolvingDemoSwapId(null);
                                    }
                                  }}
                                  className="flex-1 py-1 text-[10px] font-bold bg-zinc-900 hover:bg-zinc-800 text-white border border-white/10 rounded-lg transition-all cursor-pointer text-center disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                  Accept
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      );
                    })()}

                    {/* Sent Proposals Status */}
                    {(() => {
                      const sent = demoSwapRequests?.filter(
                        (r: any) => r.mentorId === currentMentor.id && r.swapType === "internal"
                      ) || [];
                      if (sent.length === 0) return null;
                      return (
                        <div className="pt-4 border-t border-slate-100 dark:border-slate-800 space-y-3">
                          <h4 className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Sent Swap Requests</h4>
                          <div className="space-y-2">
                            {sent.map((req: any) => (
                              <div key={req.id} className="p-2.5 bg-slate-50 border border-slate-100 rounded-xl flex items-center justify-between text-[11px] gap-2">
                                <div className="min-w-0">
                                  <p className="font-bold text-slate-700 dark:text-slate-300 truncate">Peer: {req.proposedMentorName}</p>
                                  <p className="text-[9.5px] text-slate-400">{req.dateStr} • {req.timeSlot}</p>
                                </div>
                                <span className={`px-1.5 py-0.5 rounded text-[8px] font-black uppercase shrink-0 ${req.status === "approved"
                                  ? "bg-emerald-100 text-emerald-700"
                                  : req.status === "rejected"
                                    ? "bg-rose-100 text-rose-700"
                                    : req.status === "pending_sme"
                                      ? "bg-indigo-100 text-amber-700"
                                      : "bg-amber-100 text-amber-700"
                                  }`}>
                                  {req.status === "pending_peer" ? "Peer Pend" : req.status === "pending_sme" ? "SME Pend" : req.status}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                </div>

                {/* Right Column: Completed Evaluations & Feedback (2/3 width) */}
                <div className="lg:col-span-2 space-y-4">
                  <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-card space-y-4">
                    <h3 className="text-xs font-black text-slate-800 uppercase tracking-widest border-b border-slate-100 pb-2">Completed Evaluations</h3>

                    {completedDemos.length > 0 ? (
                      <div className="space-y-4">
                        {completedDemos.map(demo => (
                          <div key={demo.id} className="p-5 border border-slate-100 hover:border-amber-300 rounded-xl bg-white transition-all shadow-card flex flex-col md:flex-row justify-between gap-4">
                            <div className="space-y-2 flex-grow">
                              <div className="flex items-center gap-2">
                                <span className="px-2 py-0.5 bg-zinc-100 border border-zinc-200 text-zinc-900 text-[8.5px] font-black uppercase rounded-lg">
                                  {demo.subject}
                                </span>
                                <span className="text-[9.5px] font-semibold text-slate-400">{demo.dateStr} • {demo.timeSlot}</span>
                              </div>
                              <div className="text-[10px] text-slate-500 font-medium">
                                Evaluator: <span className="font-bold text-slate-700">{demo.smeName}</span> • Cohort: <span className="font-bold text-slate-700">{demo.stream}</span>
                              </div>
                              {(() => {
                                // Phase C: show which department compliance criteria were flagged
                                let flagged: string[] = [];
                                try {
                                  const list = typeof demo.checklist === "string" ? JSON.parse(demo.checklist) : demo.checklist;
                                  if (Array.isArray(list)) flagged = list.filter((c: any) => c && c.met === false && c.label).map((c: any) => c.label);
                                } catch (_) { }
                                return flagged.length > 0 ? (
                                  <div className="flex flex-wrap gap-1.5 mt-2">
                                    {flagged.map((label, i) => (
                                      <span key={i} className="px-2 py-0.5 bg-rose-50 border border-rose-200 text-rose-700 text-[8.5px] font-black uppercase rounded-lg">
                                        Not Met: {label}
                                      </span>
                                    ))}
                                  </div>
                                ) : null;
                              })()}
                              {demo.comments && (
                                <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl mt-2 text-xs text-slate-700 font-medium leading-relaxed italic">
                                  &ldquo;{demo.comments}&rdquo;
                                </div>
                              )}
                            </div>
                            <div className="shrink-0 flex items-center md:justify-end">
                              <div className="px-4 py-2 bg-emerald-50 border border-emerald-100 text-emerald-700 rounded-xl text-center shadow-xs">
                                <div className="text-[9px] font-black uppercase text-emerald-600 tracking-wider">Score</div>
                                <div className="text-lg font-black">{demo.marks} / 100</div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-slate-400 italic text-center py-10">No completed evaluations found.</p>
                    )}
                  </div>
                </div>

              </div>
            </div>
          );
        })()}




        {/* Tab: Study Materials Hub */}
        {activeTab === "materials" && currentMentor && (
          <div className="space-y-6 font-sans">
            <MentorStudyMaterialsStudio
              mentor={currentMentor}
              mentorSubjects={mentorSubjects}
              mentorClasses={mentorClasses}
              subjectsList={subjectsList}
            />
          </div>
        )}

        {/* Tab: Exam Marks Entry & Grading Studio */}
        {activeTab === "exams" && (
          <div className="space-y-6 font-sans">
            <MentorExamMarksStudio />
          </div>
        )}

      </main>

      <MentorProfileModal
        mentor={currentMentor}
        isOpen={isProfileOpen}
        onClose={() => setIsProfileOpen(false)}
      />
      {/* ↔ Swap-to-Compensate Modal */}
      {swapModalOpen && swapTarget && (() => {
        const target = swapTarget;
        // Build 2-week grid for swap selection
        const dayOrder = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
        const swapGridDates: { day: string; dateStr: string; formatted: string }[] = [];
        const baseDate = new Date();
        baseDate.setDate(baseDate.getDate() + swapGridWeekOffset * 7);
        const dow = baseDate.getDay();
        const monday = new Date(baseDate);
        monday.setDate(baseDate.getDate() - (dow === 0 ? 6 : dow - 1));
        for (let i = 0; i < 5; i++) {
          const d = new Date(monday);
          d.setDate(monday.getDate() + i);
          swapGridDates.push({
            day: dayOrder[i],
            dateStr: getInstitutionDateStr(d),
            formatted: d.toLocaleDateString("en-IN", { day: "numeric", month: "short" }),
          });
        }
        const todayStr = getLocalDateStr();
        // Show the OTHER mentor's timetable — use pre-computed memoized slots
        const theirSlots = memoizedSwapTargetSlots;
        const swapGridRows = rows; // reuse computed time-column structure from main timetable

        return (
          <Dialog
            open={true}
            onOpenChange={(next) => {
              if (!next) {
                setSwapModalOpen(false);
                setSwapSuccess("");
                setSwapError("");
                setSwapGridWeekOffset(0);
              }
            }}
            ariaLabel={swapSuccess ? "Swap offer sent" : `Cover a class for ${target.otherMentorName}`}
            overlayClassName="bg-slate-950/60 backdrop-blur-sm p-4"
            panelClassName={`bg-white rounded-xl w-full overflow-hidden flex flex-col transition-all duration-300 p-0 space-y-0 max-h-[90vh] ${swapSuccess ? "max-w-md" : "max-w-5xl"}`}
          >
            {/* Modal Header */}
            <div className="p-5 text-white flex-shrink-0 bg-slate-900 border-b border-slate-800">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-black tracking-tight">
                    {swapSuccess ? "Offer Sent!" : `Cover a Class for ${target.otherMentorName}`}
                  </h2>
                  <p className="text-white/75 text-xs mt-1 font-medium">
                    {swapSuccess ? "Swap request submitted successfully" : `Pick one of ${target.otherMentorName}'s upcoming slots below — you will cover it as payback`}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => { setSwapModalOpen(false); setSwapSuccess(""); setSwapError(""); setSwapGridWeekOffset(0); }}
                  aria-label="Close class cover request"
                  className="p-2 rounded-xl hover:bg-white/20 transition-colors"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            <div className="p-5 space-y-4 overflow-y-auto flex-1">
              {swapSuccess ? (
                <div className="py-6 px-4 text-center flex flex-col items-center justify-center space-y-4 animate-scaleUp">
                  <div className="w-16 h-16 rounded-full bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-500 shadow-sm transition-transform">
                    <CheckCircle className="h-10 w-10" />
                  </div>
                  <div>
                    <h3 className="text-base font-extrabold text-slate-800">Swap Offer Sent Successfully</h3>
                    <p className="text-xs text-slate-500 mt-1 font-medium leading-relaxed">
                      {target.otherMentorName} will see this offer in their pending requests and receive an email notification.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => { setSwapModalOpen(false); setSwapSuccess(""); setSwapGridWeekOffset(0); }}
                    className="w-full max-w-[200px] py-2.5 text-xs font-black text-white bg-slate-900 hover:bg-slate-800 rounded-xl shadow-md transition-all cursor-pointer"
                  >
                    Done
                  </button>
                </div>
              ) : (
                <>
                  {/* Context Card */}
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex gap-3">
                    <AlertCircle className="h-4 w-4 text-amber-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-xs font-black text-amber-800">Compensation Required</p>
                      <p className="text-xs text-amber-700 mt-0.5">
                        You owe <strong>{target.otherMentorName}</strong> <strong>{target.balance} class hour{target.balance > 1 ? "s" : ""}</strong> for <em>{target.subject}</em> ({target.month}).
                        Select one of <strong>{target.otherMentorName}&apos;s</strong> upcoming classes below that you will take over as compensation.
                      </p>
                    </div>
                  </div>
                  <div className="space-y-4">
                    {/* Timetable Grid Picker */}
                    <div className="space-y-2">
                      {/* Week Navigation */}
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-black text-slate-700 uppercase tracking-wider">Pick One of {target.otherMentorName}&apos;s Classes to Cover</label>
                        <div className="flex items-center gap-2 bg-slate-100 rounded-xl px-3 py-1.5">
                          <button type="button" onClick={() => setSwapGridWeekOffset(swapGridWeekOffset - 1)} className="p-0.5 hover:text-amber-600 transition-colors">
                            <ChevronLeft className="h-3.5 w-3.5" />
                          </button>
                          <span className="text-[10px] font-black text-slate-700 min-w-[110px] text-center">
                            {swapGridWeekOffset === 0 ? "Current Week" : `${swapGridDates[0]?.formatted} – ${swapGridDates[4]?.formatted}`}
                          </span>
                          <button type="button" onClick={() => setSwapGridWeekOffset(swapGridWeekOffset + 1)} className="p-0.5 hover:text-amber-600 transition-colors">
                            <ChevronRight className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Grid */}
                      <div className="overflow-x-auto rounded-xl border border-slate-200">
                        <table className="w-full table-fixed border-collapse text-left min-w-[700px]">
                          <thead>
                            <tr className="bg-slate-50 border-b border-slate-200">
                              <th className="p-2 text-[10px] font-bold uppercase text-slate-500 w-[12%]">Day</th>
                              {(() => {
                                let sc = 0;
                                return swapGridRows.map((col, idx) => {
                                  if (col.type === "break" || col.type === "lunch") {
                                    return (
                                      <th key={idx} className="p-2 text-[9px] font-bold text-slate-400 uppercase text-center bg-slate-50/50 w-[8%]">
                                        {col.label}
                                      </th>
                                    );
                                  }
                                  if (col.type === "slot") {
                                    sc++;
                                    return (
                                      <th key={col.time} className="p-2 text-[10px] font-bold text-slate-700 w-[12%]">
                                        <div>P{sc}</div>
                                        <div className="text-[8px] text-slate-400 font-normal">{col.time}</div>
                                      </th>
                                    );
                                  }
                                  return null;
                                });
                              })()}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 bg-white">
                            {swapGridDates.map((date) => (
                              <tr key={date.day} className="h-20">
                                <td className="p-2 text-[10px] font-bold text-slate-700 border-r border-slate-200 bg-slate-50/20 align-middle">
                                  <div className="flex flex-col items-center justify-center">
                                    <span className="font-black text-slate-900 leading-none text-[11px]">{date.day.slice(0, 3)}</span>
                                    <span className="text-[8px] text-slate-400 font-extrabold uppercase mt-0.5">{date.formatted}</span>
                                  </div>
                                </td>
                                {swapGridRows.map((col, cIdx) => {
                                  if (col.type === "break" || col.type === "lunch") {
                                    return (
                                      <td key={`brk-${cIdx}`} className="p-1 text-center text-[9px] font-extrabold text-slate-400 bg-slate-50/40 border-r border-slate-100 last:border-r-0 align-middle italic">
                                        {col.label}
                                      </td>
                                    );
                                  }
                                  if (col.type !== "slot") return null;
                                  const time = col.time;
                                  const slot = theirSlots.find(s => s.day === date.day && s.time === time);
                                  const isPast = date.dateStr < todayStr;
                                  // Already covered by someone else on this date
                                  const alreadyHandedOver = slot ? approvedHandovers.some(ah => ah.slotId === slot.id && ah.dateStr === date.dateStr) : false;
                                  const isSelectable = slot && !isPast && !alreadyHandedOver;
                                  const isSelected = slot ? (swapOfferSlotId === slot.id && swapOfferWeekDate === date.dateStr) : false;

                                  return (
                                    <td
                                      key={time}
                                      onClick={isSelectable ? () => { setSwapOfferSlotId(slot!.id); setSwapOfferWeekDate(date.dateStr); } : undefined}
                                      className={`p-1.5 h-20 border-r border-slate-100 last:border-r-0 transition-all ${isSelected
                                        ? "cursor-pointer bg-amber-50/40"
                                        : isSelectable
                                          ? "cursor-pointer hover:bg-slate-50"
                                          : "bg-slate-50/30"
                                        }`}
                                    >
                                      {slot ? (
                                        <div className={`h-full flex flex-col justify-between p-1.5 rounded-xl border text-[9px] transition-all ${isSelected
                                          ? "bg-slate-900 border-slate-900 text-white shadow-md"
                                          : alreadyHandedOver || isPast
                                            ? "bg-slate-100 border-slate-200 text-slate-400 opacity-50"
                                            : "bg-white border-slate-200 text-slate-700 hover:shadow-sm"
                                          }`}
                                        >
                                          <div className="font-black leading-tight truncate">{slot.course}</div>
                                          <div className={`text-[8px] font-semibold truncate ${isSelected ? "text-amber-400" : "text-slate-400"}`}>
                                            {slot.classGroup}
                                          </div>
                                          {isSelected && (
                                            <div className="text-[7px] font-black uppercase tracking-wide text-amber-300 mt-0.5">Selected</div>
                                          )}
                                          {alreadyHandedOver && (
                                            <div className="text-[7px] font-black uppercase text-slate-400">Handed Over</div>
                                          )}
                                        </div>
                                      ) : (
                                        <div className="h-full flex items-center justify-center">
                                          <div className="w-full h-full border border-dashed border-slate-100 rounded-xl bg-slate-50/20" />
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

                      {/* Selected slot summary */}
                      {swapOfferSlotId && swapOfferWeekDate && (() => {
                        const sel = slots.find(s => s.id === swapOfferSlotId);
                        if (!sel) return null;
                        const selDate = new Date(swapOfferWeekDate + "T00:00:00").toLocaleDateString("en-IN", { weekday: "long", month: "short", day: "numeric" });
                        return (
                          <div className="rounded-xl px-3 py-2.5 flex items-center justify-between border border-amber-200 bg-amber-50/50">
                            <div>
                              <p className="text-xs font-black text-slate-900">{sel.course}</p>
                              <p className="text-[10px] font-semibold text-slate-600">{selDate} · {sel.time} · {sel.classGroup}</p>
                            </div>
                            <button type="button" onClick={() => { setSwapOfferSlotId(""); setSwapOfferWeekDate(""); }} className="p-1 text-slate-400 hover:text-slate-700 transition-colors">
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        );
                      })()}
                    </div>

                    {/* Optional Reason */}
                    <div className="space-y-1.5">
                      <label className="text-xs font-black text-slate-700 uppercase tracking-wider">
                        Note (optional)
                      </label>
                      <textarea
                        rows={2}
                        value={swapReason}
                        onChange={e => setSwapReason(e.target.value)}
                        placeholder={`e.g. Compensating for ${target.subject} handover in ${target.month}`}
                        className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 resize-none text-slate-700"
                        aria-label="Note (optional)"
                      />
                    </div>

                    {swapError && (
                      <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-2 text-xs text-red-700 font-semibold" role="alert">
                        {swapError}
                      </div>
                    )}

                    {/* Actions */}
                    <div className="flex gap-3 pt-1">
                      <button
                        type="button"
                        onClick={() => { setSwapModalOpen(false); setSwapError(""); setSwapGridWeekOffset(0); }}
                        className="flex-1 px-4 py-2.5 text-xs font-black text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors cursor-pointer"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        disabled={!swapOfferSlotId || !swapOfferWeekDate || swapSubmitting}
                        onClick={async () => {
                          if (!swapOfferSlotId || !swapOfferWeekDate) {
                            setSwapError("Please select a slot from the timetable above.");
                            return;
                          }
                          setSwapSubmitting(true);
                          setSwapError("");
                          const offerSlot = slots.find(s => s.id === swapOfferSlotId);
                          const dateLabel = new Date(swapOfferWeekDate + "T00:00:00")
                            .toLocaleDateString("en-US", { month: "short", day: "numeric" });
                          const result = await requestSwapCompensate(
                            currentMentor?.id || "",
                            swapOfferSlotId,
                            swapOfferWeekDate,
                            dateLabel,
                            target.otherMentorId,
                            target.compensatesHandoverId,
                            swapReason || `Compensating for ${target.subject} (${target.month}).`,
                            target.subject,
                            target.month
                          );
                          setSwapSubmitting(false);
                          if (result.success) {
                            setSwapSuccess(result.message);
                            setSwapGridWeekOffset(0);
                          } else {
                            setSwapError(result.message);
                          }
                        }}
                        className="flex-1 px-4 py-2.5 text-xs font-black text-white bg-slate-900 hover:bg-slate-800 rounded-xl disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2 shadow-xs cursor-pointer"
                      >
                        {swapSubmitting ? (
                          <span className="flex items-center gap-1"><span className="animate-spin inline-block">↻</span> Sending…</span>
                        ) : (
                          <span>Send Swap Offer</span>
                        )}
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </Dialog>
        );
      })()}

      {/* Mentor Internal Swap Modal */}
      {demoSwapModalSession && (
        <Dialog
          open={!!demoSwapModalSession}
          onOpenChange={(next) => { if (!next) setDemoSwapModalSession(null); }}
          ariaLabel="Request internal demo swap"
          overlayClassName="bg-slate-950/60 backdrop-blur-sm p-4"
          panelClassName="max-w-md dark:bg-slate-900 p-6 space-y-4 flex flex-col max-h-[85vh]"
        >

          <button
            onClick={() => setDemoSwapModalSession(null)}
            aria-label="Close internal swap request"
            className="absolute right-4 top-4 p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl text-slate-400 hover:text-slate-800 dark:hover:text-white transition-colors cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>

          <div className="flex items-center gap-2 border-b border-slate-100 dark:border-slate-800 pb-3 shrink-0">
            <RefreshCw className="h-5 w-5 text-amber-500 animate-spin-slow" />
            <div>
              <h3 className="text-sm font-black uppercase text-slate-900 dark:text-white tracking-wider">
                Request Internal Swap
              </h3>
              <p className="text-[10px] text-slate-400 font-bold uppercase mt-0.5">
                Swap this review session with a peer from your college
              </p>
            </div>
          </div>

          {demoSwapStep === 1 ? (
            <div className="space-y-4">
              <div className="p-3 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-100 text-[11px] text-slate-600 dark:text-slate-300 space-y-1">
                <p><strong>Demo Subject:</strong> {demoSwapModalSession.subject} (Cohort: {demoSwapModalSession.stream})</p>
                <p><strong>Date / Period:</strong> {demoSwapModalSession.dateStr} • {demoSwapModalSession.timeSlot}</p>
              </div>

              <div>
                <label className="text-[9px] font-black uppercase text-slate-400 block mb-1.5">Reason for Swap</label>
                <select
                  value={demoSwapReason}
                  onChange={(e) => setDemoSwapReason(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 inset-shadow-well focus:bg-white dark:focus:bg-[#131317] dark:border-slate-700 bg-sunken dark:bg-slate-800 text-xs text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 font-bold"
                  aria-label="Reason for Swap"
                >
                  <option value="I am unavailable">I am unavailable</option>
                  <option value="Leave Approved">Leave Approved</option>
                  <option value="Meeting">Meeting</option>
                  <option value="Emergency">Emergency</option>
                  <option value="Other (Remarks)">Other (Remarks)</option>
                </select>
              </div>

              <div>
                <label className="text-[9px] font-black uppercase text-slate-400 block mb-1.5">Remarks (Optional)</label>
                <textarea
                  rows={3}
                  value={demoSwapRemarks}
                  onChange={(e) => setDemoSwapRemarks(e.target.value)}
                  placeholder="Describe details for peer mentor review..."
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 inset-shadow-well focus:bg-white dark:focus:bg-[#131317] dark:border-slate-700 bg-sunken dark:bg-slate-800 text-xs text-slate-800 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  aria-label="Remarks (Optional)"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setDemoSwapModalSession(null)}
                  className="flex-1 px-4 py-2.5 text-xs font-black text-slate-700 border border-slate-200 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => setDemoSwapStep(2)}
                  className="flex-1 px-4 py-2.5 text-xs font-black text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl transition-colors flex items-center justify-center gap-1.5 cursor-pointer shadow-xs"
                >
                  Find Eligible Peers
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-4 flex-grow flex flex-col min-h-0">
              <span className="text-[9px] font-black uppercase text-slate-400 block tracking-wider">AI Suggested Peer Matches</span>

              <div className="flex-1 overflow-y-auto pr-1 space-y-2 max-h-[220px]">
                {getInternalSwapRecommendations(demoSwapModalSession).length > 0 ? (
                  getInternalSwapRecommendations(demoSwapModalSession).map((peer: any) => (
                    <div
                      key={peer.mentorId}
                      onClick={() => setSelectedProposedPeer(peer)}
                      className={`p-3 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-3 ${selectedProposedPeer?.mentorId === peer.mentorId ? "border-indigo-500 bg-indigo-50/20" : "border-slate-200 dark:border-slate-800 hover:border-amber-300"}`}
                    >
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-slate-800 dark:text-white truncate">{peer.mentorName}</p>
                        <span className="text-[9px] text-slate-400 block mt-0.5">Weekly Demos scheduled: {peer.weeklyCount}</span>
                      </div>
                      <div className="flex items-center gap-2 text-right shrink-0">
                        <div>
                          <span className="text-[8px] font-black uppercase text-amber-500 block">Match</span>
                          <span className="text-xs font-black text-amber-600 dark:text-indigo-400">{peer.score}%</span>
                        </div>
                        {selectedProposedPeer?.mentorId === peer.mentorId && (
                          <Check className="h-4 w-4 text-amber-500" />
                        )}
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-slate-400 italic text-center py-8">No free peer mentors matching {demoSwapModalSession.subject} found at your college for this timeslot.</p>
                )}
              </div>

              <div className="flex gap-3 pt-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setDemoSwapStep(1)}
                  className="flex-1 px-4 py-2.5 text-xs font-black text-slate-700 border border-slate-200 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  Back
                </button>
                <button
                  type="button"
                  disabled={demoSwapSubmitting || !selectedProposedPeer}
                  onClick={handleSubmitInternalSwap}
                  className="flex-grow px-4 py-2.5 text-xs font-black text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-1.5 shadow-xs"
                >
                  {demoSwapSubmitting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin shrink-0 text-current" />
                      <span>Submitting...</span>
                    </>
                  ) : (
                    "Send Proposal"
                  )}
                </button>
              </div>
            </div>
          )}

        </Dialog>
      )}

      {/* ─── Mentor Self-Directed Demo Reschedule Modal ─── */}
      {rescheduleModalSession && (() => {
        const targetDateObj = new Date(rescheduleTargetDate + "T12:00:00");
        const targetDayName = targetDateObj.toLocaleDateString("en-US", { weekday: "long" });
        const targetFormatted = targetDateObj.toLocaleDateString("en-IN", {
          weekday: "long",
          day: "numeric",
          month: "short",
          year: "numeric"
        });

        const isSunday = targetDateObj.getDay() === 0;
        const holidayConflict = (holidays || []).find(h => h.date === rescheduleTargetDate);

        // Standard academic time slots
        const availableCollegeSlots = [
          "09:00 AM - 10:00 AM",
          "10:00 AM - 11:00 AM",
          "11:15 AM - 12:15 PM",
          "12:15 PM - 01:15 PM",
          "02:00 PM - 03:00 PM",
          "03:00 PM - 04:00 PM",
          "04:00 PM - 05:00 PM"
        ];

        // Mentor approved leave on target date
        const mentorLeaveOnDate = (facultyLeaves || []).find(
          (fl: any) => fl.mentor_id === (currentMentor?.id || (rescheduleModalSession as any).mentorId) &&
            fl.status === "approved" &&
            rescheduleTargetDate >= fl.start_date &&
            rescheduleTargetDate <= fl.end_date
        );

        return (
          <Dialog
            open={!!rescheduleModalSession}
            onOpenChange={(next) => { if (!next) setRescheduleModalSession(null); }}
            ariaLabel="Reschedule demo session"
            overlayClassName="bg-slate-950/60 backdrop-blur-sm p-4"
            panelClassName="max-w-xl dark:bg-slate-900 border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-4 flex flex-col max-h-[90vh]"
          >
            {/* Close Button */}
            <button
              type="button"
              onClick={() => setRescheduleModalSession(null)}
              aria-label="Close reschedule request"
              className="absolute right-4 top-4 p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl text-slate-400 hover:text-slate-800 dark:hover:text-white transition-colors cursor-pointer"
            >
              <X className="h-5 w-5" />
            </button>

            {/* Modal Header */}
            <div className="flex items-center gap-3 border-b border-slate-100 dark:border-slate-800 pb-3 shrink-0">
              <div className="p-2.5 bg-amber-50 dark:bg-amber-950/30 text-amber-600 rounded-xl border border-amber-200 dark:border-amber-800/60">
                <Calendar className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-sm font-black uppercase text-slate-800 dark:text-white tracking-wider">
                  Reschedule Demo Session
                </h3>
                <p className="text-[10.5px] text-slate-500 font-semibold mt-0.5">
                  Select a suitable date & available slot based on your schedule and SME availability.
                </p>
              </div>
            </div>

            <div className="space-y-4 overflow-y-auto pr-1 flex-1">
              {/* Current Session Summary Card */}
              <div className="p-3.5 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-100 dark:border-slate-700/80 space-y-2 text-xs">
                <div className="flex justify-between items-center gap-2">
                  <span className="font-extrabold text-slate-800 dark:text-white text-xs">
                    {rescheduleModalSession.subject}
                  </span>
                  <span className="px-2 py-0.5 bg-indigo-50 dark:bg-indigo-950/40 text-amber-700 dark:text-indigo-300 rounded font-black text-[9px] uppercase border border-indigo-200 dark:border-indigo-800">
                    Cohort: {rescheduleModalSession.stream || "General"}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3 pt-1 text-[10.5px]">
                  <div>
                    <span className="text-[9px] font-black uppercase text-slate-400 block">Assigned Evaluator</span>
                    <span className="font-bold text-slate-800 dark:text-slate-200 block mt-0.5">{rescheduleModalSession.smeName}</span>
                    <span className="text-[9px] text-emerald-600 font-bold block">✓ SME Maintained (No Replacement)</span>
                  </div>
                  <div>
                    <span className="text-[9px] font-black uppercase text-slate-400 block">Original Schedule</span>
                    <span className="font-bold text-slate-600 dark:text-slate-300 block mt-0.5">{rescheduleModalSession.dateStr}</span>
                    <span className="text-[9.5px] text-slate-500">{rescheduleModalSession.timeSlot}</span>
                  </div>
                </div>

                {rescheduleModalSession.status === "reallocation_required" && (
                  <div className="p-2 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-lg text-[10px] text-amber-800 dark:text-amber-300 font-medium">
                    ⚠️ <strong>Leave Impacted:</strong> Your leave has been approved. Please select another suitable date & time below.
                  </div>
                )}
              </div>

              {/* Step 1: Target Date Picker (Mentor Sets by Themselves) */}
              <div>
                <label className="text-[10px] font-black uppercase text-slate-600 dark:text-slate-300 block mb-1.5 flex items-center justify-between">
                  <span>1. Target Date (Set by You)</span>
                  <span className="text-amber-600 font-bold normal-case text-xs">{targetFormatted}</span>
                </label>
                <input
                  type="date"
                  value={rescheduleTargetDate}
                  min={new Date().toISOString().split("T")[0]}
                  onChange={(e) => {
                    setRescheduleTargetDate(e.target.value);
                    setRescheduleSelectedSlot("");
                  }}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-bold text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer shadow-2xs"
                  aria-label="Target Date (Set by You)"
                />
              </div>

              {/* Date Conflict Warnings */}
              {isSunday && (
                <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-bold flex items-center gap-2" role="alert">
                  <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
                  <span>Selected date is Sunday (Campus Closed). Please choose another date.</span>
                </div>
              )}

              {holidayConflict && (
                <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-bold flex items-center gap-2" role="alert">
                  <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
                  <span>Selected date is a holiday: {holidayConflict.title || "Holiday"}.</span>
                </div>
              )}

              {mentorLeaveOnDate && (
                <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-bold flex items-center gap-2" role="alert">
                  <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
                  <span>You are on approved {mentorLeaveOnDate.request_type || "leave"} on this date. Please pick a date after your leave ends.</span>
                </div>
              )}

              {/* Step 2: Slot Selection (Filtered by Mentor Free + SME Free) */}
              {!isSunday && !holidayConflict && !mentorLeaveOnDate && (
                <div>
                  <label className="text-[10px] font-black uppercase text-slate-600 dark:text-slate-300 block mb-2 flex items-center justify-between">
                    <span>2. Select an Available Time Slot</span>
                    <span className="text-[9.5px] text-slate-400 font-semibold normal-case">
                      Showing slots free for you & {rescheduleModalSession.smeName}
                    </span>
                  </label>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {availableCollegeSlots.map(slot => {
                      // Check if mentor has a class on targetDayName at this slot
                      const mentorClass = (slots || []).find(
                        (s: any) => s.mentorId === (currentMentor?.id || (rescheduleModalSession as any).mentorId) &&
                          s.day?.toLowerCase() === targetDayName.toLowerCase() &&
                          (s.time === slot || s.time?.replace(/\./g, ":").includes(slot.replace(/\./g, ":")) || slot.replace(/\./g, ":").includes(s.time?.replace(/\./g, ":")))
                      );

                      // Check if mentor has another demo at this date & slot
                      const mentorOtherDemo = (demoSessions || []).find(
                        (ds: any) => ds.mentorId === (currentMentor?.id || (rescheduleModalSession as any).mentorId) &&
                          ds.dateStr === rescheduleTargetDate &&
                          ds.timeSlot === slot &&
                          ds.id !== rescheduleModalSession.id &&
                          ds.status !== "not_conducted"
                      );

                      // Check if SME has another demo at this date & slot
                      const smeDemoClash = (demoSessions || []).find(
                        (ds: any) => ds.smeId === rescheduleModalSession.smeId &&
                          ds.dateStr === rescheduleTargetDate &&
                          ds.timeSlot === slot &&
                          ds.id !== rescheduleModalSession.id &&
                          ds.status !== "not_conducted"
                      );

                      // Is this slot mutually free?
                      const isFree = !mentorClass && !mentorOtherDemo && !smeDemoClash;
                      const isSelected = rescheduleSelectedSlot === slot;

                      let clashReason = "";
                      if (mentorClass) clashReason = `Class: ${mentorClass.course || "Lecture"}`;
                      else if (mentorOtherDemo) clashReason = "You have another demo";
                      else if (smeDemoClash) clashReason = "SME busy with demo";

                      return (
                        <button
                          key={slot}
                          type="button"
                          disabled={!isFree}
                          onClick={() => setRescheduleSelectedSlot(slot)}
                          className={`p-3 rounded-xl border text-left transition-all flex flex-col justify-between gap-1.5 cursor-pointer ${isSelected
                              ? "bg-indigo-50 dark:bg-indigo-950/30 border-indigo-600 ring-2 ring-indigo-500 shadow-xs"
                              : isFree
                                ? "bg-white dark:bg-slate-800/80 border-slate-200 dark:border-slate-700 hover:border-amber-300 hover:bg-slate-50"
                                : "bg-slate-50/60 dark:bg-slate-800/20 border-slate-200/50 dark:border-slate-800 opacity-60 cursor-not-allowed"
                            }`}
                        >
                          <div className="flex items-center justify-between w-full">
                            <span className={`text-xs font-black ${isSelected ? "text-amber-700 dark:text-indigo-300" : isFree ? "text-slate-800 dark:text-white" : "text-slate-400"}`}>
                              {slot}
                            </span>
                            {isSelected ? (
                              <CheckCircle className="h-4 w-4 text-amber-600 shrink-0" />
                            ) : isFree ? (
                              <span className="h-2 w-2 rounded-full bg-emerald-500 shrink-0" />
                            ) : null}
                          </div>

                          <div className="text-[9.5px]">
                            {isFree ? (
                              <span className="text-emerald-600 dark:text-emerald-400 font-bold">
                                ✓ Mutually Free
                              </span>
                            ) : (
                              <span className="text-rose-500 font-medium">
                                {clashReason}
                              </span>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer Actions */}
            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100 dark:border-slate-800 shrink-0">
              <button
                type="button"
                onClick={() => setRescheduleModalSession(null)}
                className="px-4 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!rescheduleSelectedSlot || isSunday || !!holidayConflict || !!mentorLeaveOnDate || rescheduleSubmitting}
                onClick={async () => {
                  setRescheduleSubmitting(true);
                  const res = await rescheduleDemoSession(
                    rescheduleModalSession.id,
                    rescheduleTargetDate,
                    rescheduleSelectedSlot
                  );
                  setRescheduleSubmitting(false);
                  if (res.success) {
                    toast(res.message || "Demo rescheduled successfully!", "success");
                    setRescheduleModalSession(null);
                  } else {
                    toast(res.message || "Failed to reschedule demo", "error");
                  }
                }}
                className="px-5 py-2.5 text-xs font-black text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl transition-all shadow-sm flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                {rescheduleSubmitting ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    <span>Sending Request…</span>
                  </>
                ) : (
                  <>
                    <Check className="h-3.5 w-3.5" />
                    <span>Confirm Reschedule</span>
                  </>
                )}
              </button>
            </div>

          </Dialog>
        );
      })()}

    </div>
  );
};


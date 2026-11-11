"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useApp } from "../context/AppContext";
import { useToast } from "../context/ToastContext";
import { getCollegePeriodTimeSlots, parseTimeToMinutes } from "@/lib/utils";
import { apiFetch } from "@/lib/apiFetch";
import { qk } from "@/lib/queryKeys";
import { generateId } from "@/lib/id";
import { Dialog } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetBody } from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from "@/components/ui/table";
import {
  UserCheck, Award, BookOpen, Users, GraduationCap, CheckCircle2,
  AlertCircle, Clock, XCircle, Search, Plus, Minus, Video, Send, Check,
  Building, Calendar, MessageSquare, BarChart3, Layers, Info,
  ShieldCheck, RefreshCw, ChevronDown, ChevronUp, Star, FileText,
  ExternalLink, AlertTriangle, Loader2, Filter, Trash2, HelpCircle,
  CheckCircle, ArrowRight, User, Sparkles, ChevronLeft, ChevronRight, X,
  Globe, CheckSquare, Activity, Eye, History, ListFilter, Download, FileSpreadsheet
} from "lucide-react";

// ─── Structured Period Slot Helper ──────────────────────────────────────────

export interface StructuredPeriodSlot {
  periodNumber: number;
  periodLabel: string; // "Period 1"
  timeSlot: string;    // "9.00 AM - 9.50 AM"
  fullLabel: string;   // "Period 1 (9.00 AM - 9.50 AM)"
  shortLabel: string;  // "P1: 9.00 - 9.50 AM"
  startMinutes: number;
}

export function getStructuredCollegePeriodSlots(
  collegeId?: string,
  colleges: any[] = [],
  slots: any[] = [],
  shiftFilter?: string
): StructuredPeriodSlot[] {
  const rawSlots = getCollegePeriodTimeSlots(collegeId, colleges, slots, shiftFilter);
  const sorted = Array.from(new Set(rawSlots)).sort((a, b) => {
    const startA = parseTimeToMinutes((a.split("-")[0] || "").trim());
    const startB = parseTimeToMinutes((b.split("-")[0] || "").trim());
    return startA - startB;
  });

  return sorted.map((slotStr, index) => {
    const periodNumber = index + 1;
    return {
      periodNumber,
      periodLabel: `Period ${periodNumber}`,
      timeSlot: slotStr,
      fullLabel: `Period ${periodNumber} (${slotStr})`,
      shortLabel: `P${periodNumber}: ${slotStr}`,
      startMinutes: parseTimeToMinutes((slotStr.split("-")[0] || "").trim()),
    };
  });
}

// ─── Types ──────────────────────────────────────────────────────────────────

interface InterviewModuleProps {
  currentUserRole?: "mentor" | "cm" | "cam" | "kam" | "admin" | string;
  currentUserName?: string;
  defaultCollegeId?: string;
}

export interface StructuredQuestion {
  id: string;
  question: string;
  maxScore: number;
  score: number;
  notes?: string;
}

// ─── Question Initialization (Clean & User-Typed) ──────────────────────────

const getSubjectQuestionsPreset = (subjectName?: string): StructuredQuestion[] => {
  return [
    { id: `q_${Date.now()}_1`, question: "", maxScore: 10, score: 7, notes: "" }
  ];
};

// ─── Status Badge (Shadcn Pill Style) ──────────────────────────────────────

const StatusBadge = ({ status }: { status: string }) => {
  const map: Record<string, string> = {
    pending_cm: "bg-amber-50 text-amber-700 border-amber-200/80",
    pending_origin_cm: "bg-amber-50 text-amber-700 border-amber-200/80",
    pending_cm_acceptance: "bg-purple-50 text-purple-700 border-purple-200/80",
    capacity_partially_accepted: "bg-amber-50 text-amber-700 border-amber-200/80",
    priority_allocation: "bg-indigo-50 text-indigo-700 border-indigo-200/80",
    pending_final_confirmation: "bg-purple-50 text-purple-700 border-purple-200/80",
    assigned: "bg-blue-50 text-blue-700 border-blue-200/80",
    pending_verification: "bg-indigo-50 text-indigo-700 border-indigo-200/80",
    completed: "bg-emerald-50 text-emerald-700 border-emerald-200/80",
    cancelled: "bg-slate-100 text-slate-600 border-slate-200",
    declined: "bg-rose-50 text-rose-700 border-rose-200/80",
    no_capacity: "bg-rose-50 text-rose-700 border-rose-200/80",
  };
  const label: Record<string, string> = {
    pending_cm: "Pending CM",
    pending_origin_cm: "Pending Origin CM",
    pending_cm_acceptance: "Awaiting CM Capacity",
    capacity_partially_accepted: "Partial Capacity",
    priority_allocation: "Priority Allocation Ready",
    pending_final_confirmation: "Pending Final Confirm",
    assigned: "Assigned & Meet Live",
    pending_verification: "Pending Verification",
    completed: "Completed",
    cancelled: "Cancelled",
    declined: "Declined",
    no_capacity: "No Capacity",
  };
  const cls = map[status] || "bg-slate-100 text-slate-600 border-slate-200";
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider border ${cls}`}>
      {label[status] || status}
    </span>
  );
};

const ConductedStatusBadge = ({
  status,
  required,
  allocated,
  evaluated,
  verified
}: {
  status: string;
  required?: number;
  allocated?: number;
  evaluated?: number;
  verified?: number;
}) => {
  const req = required || 10;
  const alloc = allocated || 0;
  const ev = evaluated || 0;
  const isCompleted = status === "completed";

  if (isCompleted) {
    if (alloc >= req && ev >= alloc) {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-100 text-emerald-800 border border-emerald-300">
          <CheckCircle2 className="w-3 h-3 text-emerald-600" /> Fully Conducted ({ev}/{req})
        </span>
      );
    } else if (alloc < req) {
      const unalloc = req - alloc;
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-amber-100 text-amber-800 border border-amber-300">
          <AlertCircle className="w-3 h-3 text-amber-600" /> Partially Conducted ({alloc}/{req} — {unalloc} Unallocated)
        </span>
      );
    } else {
      const pendingEval = alloc - ev;
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-purple-100 text-purple-800 border border-purple-300">
          <Clock className="w-3 h-3 text-purple-600" /> Partially Conducted ({ev}/{alloc} — {pendingEval} Pending)
        </span>
      );
    }
  }

  if (status === "pending_verification") {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-indigo-100 text-indigo-800 border border-indigo-300">
        <CheckSquare className="w-3 h-3 text-indigo-600" /> Evaluations Completed — Pending CM Verification
      </span>
    );
  }

  if (status === "assigned") {
    if (ev > 0) {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-indigo-100 text-indigo-800 border border-indigo-300">
          <Activity className="w-3 h-3 text-indigo-600" /> Conducting Evaluations ({ev}/{alloc})
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-blue-100 text-blue-800 border border-blue-300">
        <Video className="w-3 h-3 text-blue-600" /> Scheduled & Meet Live ({alloc} Allocated)
      </span>
    );
  }

  if (status === "no_capacity" || (status?.includes("pending") && alloc === 0)) {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-rose-50 text-rose-700 border border-rose-200">
        <XCircle className="w-3 h-3 text-rose-600" /> Not Conducted ({alloc}/{req})
      </span>
    );
  }

  return null;
};

const CapacityMetricsBar = ({
  reqCount,
  accCap,
  allocCount,
  evalCount,
  verCount,
  remAlloc,
  remEval,
  type = "internal"
}: {
  reqCount: number;
  accCap?: number;
  allocCount: number;
  evalCount: number;
  verCount: number;
  remAlloc: number;
  remEval: number;
  type?: string;
}) => (
  <div className="bg-slate-50/60 border-t border-slate-200/80 px-4 py-2 flex flex-wrap items-center justify-between gap-3 text-xs">
    <div className="flex items-center gap-2.5 flex-wrap font-medium text-slate-600 text-[11px]">
      <span className="text-slate-900 font-bold">{reqCount} Students</span>
      <span className="text-slate-300">•</span>
      {type === "external" && (
        <>
          <span>Zone Cap: <strong className="text-slate-900 font-semibold">{accCap || 0}/{reqCount}</strong></span>
          <span className="text-slate-300">•</span>
        </>
      )}
      <span>Allocated: <strong className="text-slate-900 font-semibold">{allocCount}/{reqCount}</strong></span>
      <span className="text-slate-300">•</span>
      <span>Evaluated: <strong className="text-slate-900 font-semibold">{evalCount}/{reqCount}</strong></span>
      {verCount > 0 && (
        <>
          <span className="text-slate-300">•</span>
          <span>Verified: <strong className="text-emerald-700 font-semibold">{verCount}</strong></span>
        </>
      )}
    </div>
    {remAlloc > 0 ? (
      <span className="text-[11px] text-amber-700 font-semibold">
        {remAlloc} to allocate
      </span>
    ) : remEval > 0 ? (
      <span className="text-[11px] text-slate-500 font-medium">
        {remEval} pending evaluation
      </span>
    ) : (
      <span className="text-[11px] text-emerald-700 font-semibold">
        All allocated
      </span>
    )}
  </div>
);

// ─── Score Slider ─────────────────────────────────────────────────────────────

const ScoreSlider = ({
  label, value, onChange, color = "#4F46E5"
}: { label: string; value: number; onChange: (v: number) => void; color?: string }) => (
  <div className="bg-slate-50/70 border border-slate-100 rounded-xl p-3.5 space-y-2 shadow-xs">
    <div className="flex justify-between items-center">
      <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">{label}</span>
      <span className="text-xs font-black px-2 py-0.5 rounded-md bg-white border border-slate-200 shadow-2xs" style={{ color }}>
        {value} / 10
      </span>
    </div>
    <input aria-label={label}
      type="range" min={1} max={10} value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className="w-full cursor-pointer h-1.5 rounded-full appearance-none bg-slate-200"
      style={{ accentColor: color }}
    />
    <div className="flex justify-between text-[9px] text-slate-400 font-semibold uppercase tracking-wider">
      <span>Needs Work</span><span>Mastery</span>
    </div>
  </div>
);

const isCandidatePlaceholder = (name?: string) =>
  !name || /^(Candidate|Student)\s*#?\d*$/i.test(name.trim());

// ─── Mentor Free-Time Timeline ─────────────────────────────────────────────

const BRAND_PINK = "#4F46E5";
const BRAND_PEACH = "#7C3AED";

/** Converts "9.00 AM" style to total minutes from midnight */
function slotToMinutes(t: string): number {
  if (!t) return -1;
  const cleaned = t.trim().toLowerCase().replace(/\./g, ":");
  const isPM = cleaned.includes("pm");
  const isAM = cleaned.includes("am");
  const timePart = cleaned.replace(/am|pm/g, "").trim();
  const parts = timePart.split(":");
  let h = parseInt(parts[0], 10) || 0;
  const m = parseInt(parts[1], 10) || 0;
  if (isPM && h < 12) h += 12;
  if (isAM && h === 12) h = 0;
  return h * 60 + m;
}

function minutesToLabel(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
}

const MentorFreeTimeTimeline = ({
  mentor,
  allSlots,          // all timetable slots for this mentor (from /api/slots)
  interviewDate,     // "YYYY-MM-DD"
  dayName,           // "Monday" etc.
  allocatedTime,     // time block already reserved for this interview
}: {
  mentor: any;
  allSlots: any[];
  interviewDate: string;
  dayName: string;
  allocatedTime?: string;
}) => {
  // Filter slots that land on the interview day for this mentor
  const daySlots = useMemo(() => {
    const dn = (dayName || "").toLowerCase();
    return allSlots.filter(
      (s: any) => s.mentorId === mentor.id && (s.day || "").toLowerCase() === dn
    );
  }, [allSlots, mentor.id, dayName]);

  if (daySlots.length === 0 && !allocatedTime) {
    return (
      <p className="text-[11px] text-emerald-600 font-semibold flex items-center gap-1.5 mt-1">
        <CheckCircle2 className="w-3.5 h-3.5" /> Fully free on this day
      </p>
    );
  }

  // Build blocks: busy = existing class, booked = this interview, free = gap
  const DAY_START = 8 * 60;   // 8:00 AM
  const DAY_END   = 18 * 60;  // 6:00 PM
  const TOTAL     = DAY_END - DAY_START;

  type Block = { start: number; end: number; label: string; kind: "busy" | "booked" | "free" };
  const blocks: Block[] = [];

  // Add existing classes
  for (const s of daySlots) {
    const raw = s.time || "";
    const parts = raw.split("-");
    const start = slotToMinutes(parts[0]?.trim());
    const end   = slotToMinutes(parts[1]?.trim());
    if (start >= 0 && end > start) {
      blocks.push({ start, end, label: s.course || "Class", kind: "busy" });
    }
  }

  // Add interview allocation block
  if (allocatedTime) {
    const parts = allocatedTime.split("-");
    const start = slotToMinutes(parts[0]?.trim());
    const end   = slotToMinutes(parts[1]?.trim() || "");
    const endFallback = start + 15; // 15-min interview slots
    if (start >= 0) {
      blocks.push({ start, end: end > start ? end : endFallback, label: "Interview Slot", kind: "booked" });
    }
  }

  // Sort
  blocks.sort((a, b) => a.start - b.start);

  // Fill gaps
  const timeline: Block[] = [];
  let cursor = DAY_START;
  for (const b of blocks) {
    const s = Math.max(b.start, DAY_START);
    const e = Math.min(b.end, DAY_END);
    if (s > cursor) {
      timeline.push({ start: cursor, end: s, label: "Free", kind: "free" });
    }
    if (s < e) timeline.push({ ...b, start: s, end: e });
    cursor = Math.max(cursor, e);
  }
  if (cursor < DAY_END) {
    timeline.push({ start: cursor, end: DAY_END, label: "Free", kind: "free" });
  }

  const kindStyle: Record<string, string> = {
    busy:   "bg-rose-400/80",
    booked: "bg-[#4F46E5]",
    free:   "bg-emerald-400/70",
  };

  return (
    <div className="mt-2 space-y-1.5">
      {/* Timeline bar */}
      <div className="flex h-4 rounded-lg overflow-hidden w-full border border-slate-200 shadow-inner">
        {timeline.map((blk, i) => {
          const width = ((blk.end - blk.start) / TOTAL) * 100;
          return (
            <div
              key={i}
              title={`${blk.label}: ${minutesToLabel(blk.start)} – ${minutesToLabel(blk.end)}`}
              style={{ width: `${width}%` }}
              className={`${kindStyle[blk.kind]} transition-all`}
            />
          );
        })}
      </div>
      {/* Legend inline */}
      <div className="flex items-center gap-3 flex-wrap">
        {timeline.some(b => b.kind === "free") && (
          <span className="text-[9px] font-bold text-emerald-700 flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-sm bg-emerald-400/70 inline-block" /> Free
          </span>
        )}
        {timeline.some(b => b.kind === "busy") && (
          <span className="text-[9px] font-bold text-rose-600 flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-sm bg-rose-400/80 inline-block" /> Teaching
          </span>
        )}
        {timeline.some(b => b.kind === "booked") && (
          <span className="text-[9px] font-bold flex items-center gap-1" style={{ color: BRAND_PINK }}>
            <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: BRAND_PINK }} /> Interview
          </span>
        )}
        {/* Free slot labels */}
        {timeline
          .filter(b => b.kind === "free")
          .map((blk, i) => (
            <span key={i} className="text-[9px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
              {minutesToLabel(blk.start)}–{minutesToLabel(blk.end)}
            </span>
          ))}
      </div>
    </div>
  );
};

// ─── Session Drawer (shadcn Sheet + Tabs + Badge + Table) ─────────────────

const StudentConductedRosterDrawer = ({
  interview,
  cohortStudents,
  evaluations,
  allMentors = [],
  allColleges = [],
  allSlots = [],
  userCollegeId,
  isCM = false,
  initialTab,
  onClose,
}: {
  interview: any;
  cohortStudents: any[];
  evaluations: any[];
  allMentors?: any[];
  allColleges?: any[];
  allSlots?: any[];
  userCollegeId?: string;
  isCM?: boolean;
  initialTab?: "mentors" | "students" | "logs";
  onClose: () => void;
}) => {
  const isExternalSession = interview.type === "external";
  const hostCollegeId = interview.college_id || interview.origin_college_id;
  const isPartnerCM = isCM && isExternalSession && userCollegeId && hostCollegeId !== userCollegeId;

  const sessionEvals = useMemo(() => {
    const rawId = String(interview.id || "").trim();
    return (evaluations || []).filter((e: any) => {
      if (!e) return false;
      const eIntId = String(e.interview_id || "").trim();
      if (eIntId && rawId && (eIntId === rawId || eIntId.toLowerCase() === rawId.toLowerCase())) return true;
      if (e.id && rawId && e.id.toLowerCase().startsWith(`eval_${rawId.toLowerCase()}_`)) return true;
      return false;
    });
  }, [evaluations, interview.id]);

  const evalCount = sessionEvals.length;
  const isCompleted = interview.status === "completed";
  const reqCount = Number(interview.required_students || interview.student_count || 10);
  const slots: any[] = interview.student_slots || [];
  const assignedSlotStudentIds = slots.map((s: any) => s.student_id);
  const allocCount = interview.allocated_students || slots.length;

  const defaultTab = initialTab || (evalCount > 0 ? "students" : "mentors");
  const [activeTab, setActiveTab] = useState<string>(defaultTab);
  const [studentSearch, setStudentSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "evaluated" | "pending" | "cleared">("all");
  const [selectedEval, setSelectedEval] = useState<any | null>(null);

  const myCampusResponse = (interview.cam_responses || []).find((r: any) => r.college_id === userCollegeId);
  const myCollegeMentorIds = useMemo(() =>
    !userCollegeId ? [] : allMentors.filter((m: any) => m.college_id === userCollegeId).map((m: any) => m.id),
    [allMentors, userCollegeId]
  );

  // ── display students ──────────────────────────────────────────────────────
  const maxSessionCount = Math.max(allocCount, reqCount);
  const displayStudents: any[] = useMemo(() => {
    if (slots.length > 0) {
      let relevant = slots;
      if (isPartnerCM) {
        relevant = slots.filter((sl: any) =>
          (sl.mentor_id && myCollegeMentorIds.includes(sl.mentor_id)) ||
          (sl.college_id && sl.college_id === userCollegeId)
        );
        if (relevant.length === 0 && myCampusResponse?.accepted_student_capacity) {
          relevant = slots.slice(0, Number(myCampusResponse.accepted_student_capacity));
        }
      }
      return relevant.map((sl: any, sIdx: number) => {
        const found = cohortStudents.find((cs: any) =>
          (sl.student_id && (cs.id === sl.student_id || cs.register_number === sl.student_id)) ||
          (sl.student_name && !isCandidatePlaceholder(sl.student_name) && cs.name?.toLowerCase().trim() === sl.student_name?.toLowerCase().trim())
        );
        return {
          id: found?.id || sl.student_id || sl.id || "",
          dbId: found?.id,
          student_id: sl.student_id,
          name: (!isCandidatePlaceholder(sl.student_name) ? sl.student_name : null) || found?.name || `Student #${sIdx + 1}`,
          roll_number: found?.register_number || found?.roll_number || sl.student_id || "",
          slot_start_time: sl.slot_start_time,
          slot_end_time: sl.slot_end_time,
          mentor_name: sl.mentor_name,
          mentor_id: sl.mentor_id,
          gmeet_link: sl.gmeet_link,
        };
      });
    }
    const pool = cohortStudents.filter((s: any) =>
      interview.class_group
        ? (s.classGroup || "").toLowerCase().trim() === (interview.class_group || "").toLowerCase().trim()
        : interview.college_id && s.college_id === interview.college_id
    );
    return (pool.length > 0 ? pool : cohortStudents).slice(0, maxSessionCount).map((s: any) => ({
      ...s, dbId: s.id, roll_number: s.register_number || s.roll_number || s.id,
    }));
  }, [slots, cohortStudents, interview, maxSessionCount, isPartnerCM, userCollegeId, myCollegeMentorIds, myCampusResponse]);

  // ── meet link ─────────────────────────────────────────────────────────────
  const sessionMeetLink: string | null = useMemo(() => {
    if (interview.gmeet_link?.trim()) return interview.gmeet_link;
    const fromSlot = slots.find((s: any) => s.gmeet_link)?.gmeet_link;
    if (fromSlot) return fromSlot;
    return (interview.allocations || []).find((a: any) => a.gmeet_link)?.gmeet_link || null;
  }, [interview, slots]);

  // ── assigned mentors ──────────────────────────────────────────────────────
  const assignedMentorIds: string[] = useMemo(() => {
    if (interview.assigned_mentor_ids) {
      try {
        const p = JSON.parse(interview.assigned_mentor_ids);
        if (Array.isArray(p) && p.length > 0) return p;
      } catch (_) {}
    }
    const fromSlots = Array.from(new Set(slots.map((s: any) => s.mentor_id).filter(Boolean)));
    if (fromSlots.length > 0) return fromSlots as string[];
    if (interview.mentor_id) return [interview.mentor_id];
    return [];
  }, [interview, slots]);

  const assignedMentorsList = useMemo(() => {
    const unique = Array.from(new Set(assignedMentorIds));
    let ids = unique;
    if (isPartnerCM && userCollegeId) {
      const mine = unique.filter((id) => myCollegeMentorIds.includes(id));
      if (mine.length > 0) ids = mine;
    }
    return ids.map((mId, idx) => {
      const mObj = allMentors.find((m: any) => m.id === mId) || { id: mId, name: `Evaluator ${idx + 1}`, department: "Faculty", college_id: userCollegeId };
      const mSlots = slots.filter((s: any) => s.mentor_id === mId);
      const mEvals = sessionEvals.filter((e: any) => e.mentor_id === mId || e.evaluator_id === mId);
      const allocCnt = mSlots.length || Math.max(1, Math.round(displayStudents.length / Math.max(1, ids.length)));
      const rawStart = mSlots[0]?.slot_start_time || interview.preferred_start_time || "";
      const rawEnd   = mSlots[mSlots.length - 1]?.slot_end_time || "";
      const timing   = rawEnd && rawEnd !== rawStart ? `${rawStart} – ${rawEnd}` : rawStart;
      const meetLink = mSlots[0]?.gmeet_link || interview.gmeet_link || null;
      const collegeName = allColleges.find((c: any) => c.id === mObj.college_id)?.name || mObj.college_id || "Campus";
      return { ...mObj, mSlots, evalCount: mEvals.length, allocCount: allocCnt, timing, meetLink, collegeName };
    });
  }, [assignedMentorIds, allMentors, slots, sessionEvals, displayStudents, interview, allColleges, isPartnerCM, userCollegeId, myCollegeMentorIds]);

  // ── student eval lookup ───────────────────────────────────────────────────
  const findEval = (st: any): any | undefined => {
    if (!st) return undefined;
    const ids = [st.id, st.dbId, st.student_id, st.roll_number].filter(Boolean).map((x) => String(x).trim().toLowerCase());
    const nameClean = (st.name || "").trim().toLowerCase();
    const intId = String(interview.id || "").trim().toLowerCase();
    return sessionEvals.find((e: any) => {
      const eSt = String(e.student_id || "").trim().toLowerCase();
      if (eSt && ids.includes(eSt)) return true;
      if (e.id) {
        const eId = String(e.id).toLowerCase();
        if (ids.some((cid) => eId === `eval_${intId}_${cid}` || eId.endsWith(`_${cid}`))) return true;
      }
      if (!isCandidatePlaceholder(st.name) && nameClean && e.student_name) {
        const en = String(e.student_name).trim().toLowerCase();
        if (en === nameClean || (nameClean.length > 3 && (nameClean.includes(en) || en.includes(nameClean)))) return true;
      }
      return false;
    });
  };

  // ── filtered students ─────────────────────────────────────────────────────
  const filteredStudents = useMemo(() => {
    return displayStudents.filter((st: any) => {
      const ev = findEval(st);
      if (studentSearch.trim()) {
        const q = studentSearch.toLowerCase();
        if (!(st.name || "").toLowerCase().includes(q) && !(st.roll_number || "").toLowerCase().includes(q)) return false;
      }
      if (statusFilter === "evaluated" && !ev) return false;
      if (statusFilter === "pending" && ev) return false;
      if (statusFilter === "cleared" && (!ev || !(ev.status || "").toLowerCase().includes("clear"))) return false;
      return true;
    });
  }, [displayStudents, sessionEvals, studentSearch, statusFilter]);

  // ── day-of-week from interview date ───────────────────────────────────────
  const interviewDayName = useMemo(() => {
    if (!interview.target_date) return "";
    const [y, mo, d] = interview.target_date.split("-").map(Number);
    return new Date(y, mo - 1, d).toLocaleDateString("en-US", { weekday: "long" });
  }, [interview.target_date]);

  // ── GCal fallback link ────────────────────────────────────────────────────
  const sessionGcalLink = useMemo(() => {
    if (interview.gcal_link?.trim()) return interview.gcal_link;
    const title = `Interview: ${interview.subject} (${interview.class_group || "Cohort"})`;
    const desc = `Faculty assessment for ${interview.subject}.\n${sessionMeetLink ? `Google Meet: ${sessionMeetLink}` : ""}`;
    const cleanDate = (interview.target_date || "").replace(/-/g, "");
    return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(title)}&dates=${cleanDate}T082000/${cleanDate}T091000&details=${encodeURIComponent(desc)}${sessionMeetLink ? `&location=${encodeURIComponent(sessionMeetLink)}` : ""}`;
  }, [interview, sessionMeetLink]);

  // ── per-mentor free time (count busy slots from all known timetable data) ──
  const mentorBusySlots: Record<string, any[]> = useMemo(() => {
    const result: Record<string, any[]> = {};
    for (const m of assignedMentorsList) {
      result[m.id] = (allSlots || []).filter(
        (s: any) => s.mentorId === m.id && (s.day || "").toLowerCase() === interviewDayName.toLowerCase()
      );
    }
    return result;
  }, [assignedMentorsList, allSlots, interviewDayName]);

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <Sheet open={true} onOpenChange={(v) => { if (!v) onClose(); }}>
      <SheetContent side="right" width="w-[95vw] max-w-5xl" className="flex flex-col p-0">

        {/* ── Header ── */}
        <SheetHeader className="px-6 py-4 border-b border-slate-200 bg-white shrink-0">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <SheetTitle className="flex items-center gap-2 flex-wrap">
                Session Detail
                <StatusBadge status={interview.status} />
                <span className={`text-[10px] font-black px-2 py-0.5 rounded-full border ${
                  isExternalSession ? "bg-purple-50 text-purple-700 border-purple-200" : "bg-blue-50 text-blue-700 border-blue-200"
                }`}>
                  {(interview.type || "internal").toUpperCase()}
                </span>
                <ConductedStatusBadge status={interview.status} required={reqCount} allocated={allocCount} evaluated={evalCount} />
              </SheetTitle>
              <SheetDescription className="mt-1 flex items-center gap-2 flex-wrap">
                <span><strong className="text-slate-800">{interview.subject}</strong></span>
                <span>·</span>
                <span>{interview.class_group || "All"}</span>
                <span>·</span>
                <span>{interview.target_date || "TBD"}{interviewDayName ? ` (${interviewDayName})` : ""}</span>
                {sessionMeetLink && (
                  <>
                    <span>·</span>
                    <a href={sessionMeetLink} target="_blank" rel="noreferrer"
                      className="inline-flex items-center gap-1 text-indigo-600 font-bold hover:underline bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200">
                      <Video className="w-3 h-3" /> Join Meet
                    </a>
                    <a href={sessionGcalLink} target="_blank" rel="noreferrer"
                      className="inline-flex items-center gap-1 text-emerald-700 font-bold hover:underline bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                      <Calendar className="w-3 h-3" /> Google Cal
                    </a>
                  </>
                )}
              </SheetDescription>
            </div>
          </div>
        </SheetHeader>

        {/* ── 5-Metric Summary Strip ── */}
        <div className="grid grid-cols-5 border-b border-slate-200 shrink-0">
          {[
            { label: isPartnerCM ? "Campus Cap" : "Required", value: isPartnerCM ? (myCampusResponse?.accepted_student_capacity || displayStudents.length) : reqCount, color: "text-indigo-700" },
            { label: isPartnerCM ? "My Alloc"  : "Allocated",  value: isPartnerCM ? displayStudents.length : allocCount, color: "text-blue-700" },
            { label: "Evaluated", value: evalCount, color: "text-emerald-700" },
            { label: "Verified",  value: isCompleted ? evalCount : 0, color: "text-teal-700" },
            { label: "Unallocated", value: isPartnerCM ? 0 : Math.max(0, reqCount - allocCount), color: "text-amber-600" },
          ].map((m) => (
            <div key={m.label} className="flex flex-col items-center justify-center py-3 border-r border-slate-200 last:border-r-0 bg-slate-50/50">
              <span className={`text-base font-black ${m.color}`}>{m.value}</span>
              <span className="text-[9px] font-bold uppercase text-slate-400 tracking-wider mt-0.5">{m.label}</span>
            </div>
          ))}
        </div>

        {/* ── Tabs ── */}
        <SheetBody className="flex flex-col">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col flex-1 min-h-0">
            <TabsList className="mx-4 mt-3 shrink-0 self-start">
              <TabsTrigger value="mentors" icon={<Users className="w-3.5 h-3.5" />}>
                Faculty ({assignedMentorsList.length})
              </TabsTrigger>
              <TabsTrigger value="students" icon={<GraduationCap className="w-3.5 h-3.5" />}>
                Students ({displayStudents.length})
              </TabsTrigger>
              {isExternalSession && (
                <TabsTrigger value="capacity" icon={<Globe className="w-3.5 h-3.5" />}>
                  Capacity
                </TabsTrigger>
              )}
              <TabsTrigger value="logs" icon={<History className="w-3.5 h-3.5" />}>
                Audit Log
              </TabsTrigger>
            </TabsList>

            {/* ══ TAB: FACULTY ══════════════════════════════════════════════ */}
            <TabsContent value="mentors" className="flex-1 overflow-y-auto px-4 pb-6">
              {assignedMentorsList.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-slate-400 gap-2">
                  <Users className="w-10 h-10 text-slate-200" />
                  <p className="text-sm font-semibold">No faculty assigned yet.</p>
                  <p className="text-xs">Use the Assign panel to map evaluators.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
                  {assignedMentorsList.map((m, idx) => {
                    const pct = m.allocCount > 0 ? Math.round((m.evalCount / m.allocCount) * 100) : 0;
                    const busyDay = mentorBusySlots[m.id] || [];
                    return (
                      <Card key={m.id || idx} className="overflow-hidden">
                        <CardContent className="p-4 space-y-3">
                          {/* Mentor identity */}
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center gap-2.5">
                              <div className="w-9 h-9 rounded-xl flex items-center justify-center font-black text-sm text-white shrink-0"
                                style={{ background: `linear-gradient(135deg, ${BRAND_PINK} 0%, ${BRAND_PEACH} 100%)` }}>
                                {(m.name || "M").charAt(0).toUpperCase()}
                              </div>
                              <div>
                                <p className="text-xs font-black text-slate-900 leading-tight">{m.name}</p>
                                <p className="text-[10px] text-slate-400 font-semibold">{m.department || "Faculty"} · {m.collegeName}</p>
                              </div>
                            </div>
                            {m.meetLink && (
                              <a href={m.meetLink} target="_blank" rel="noreferrer"
                                className="shrink-0 inline-flex items-center gap-1 text-[10px] font-bold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 px-2 py-1 rounded-lg transition-all">
                                <Video className="w-3 h-3" /> Meet
                              </a>
                            )}
                          </div>

                          {/* Interview time slot */}
                          <div className="flex items-center justify-between bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-[11px]">
                            <span className="flex items-center gap-1.5 text-slate-700 font-semibold">
                              <Clock className="w-3 h-3 text-indigo-500" />
                              {m.timing || "Time TBD"}
                            </span>
                            <span className="font-bold text-slate-800">{m.allocCount} candidates</span>
                          </div>

                          {/* Evaluation progress */}
                          <div>
                            <div className="flex justify-between text-[10px] font-bold text-slate-500 mb-1.5">
                              <span>Evaluations</span>
                              <span className="font-black text-indigo-700">{m.evalCount}/{m.allocCount} ({pct}%)</span>
                            </div>
                            <div className="w-full h-1.5 rounded-full bg-slate-100 overflow-hidden">
                              <div className="h-full rounded-full transition-all"
                                style={{ width: `${Math.min(100, pct)}%`, background: `linear-gradient(90deg, ${BRAND_PINK}, ${BRAND_PEACH})` }} />
                            </div>
                          </div>

                          {/* Free-time timeline */}
                          <div>
                            <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">
                              Free Time on {interviewDayName || "Interview Day"}
                            </p>
                            <MentorFreeTimeTimeline
                              mentor={m}
                              allSlots={allSlots}
                              interviewDate={interview.target_date || ""}
                              dayName={interviewDayName}
                              allocatedTime={m.timing}
                            />
                            {busyDay.length > 0 ? (
                              <div className="mt-1.5 flex flex-wrap gap-1">
                                {busyDay.map((s: any, i: number) => (
                                  <span key={i} className="text-[9px] font-bold bg-rose-50 text-rose-600 border border-rose-200 px-1.5 py-0.5 rounded">
                                    {s.time} · {s.course}
                                  </span>
                                ))}
                              </div>
                            ) : (
                              <p className="text-[10px] text-emerald-600 font-semibold mt-1">
                                No other classes on this day
                              </p>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}
            </TabsContent>

            {/* ══ TAB: STUDENTS ═════════════════════════════════════════════ */}
            <TabsContent value="students" className="flex-1 overflow-y-auto px-4 pb-6 flex flex-col gap-3">
              {/* Search + filter row */}
              <div className="flex flex-col sm:flex-row gap-2 pt-1">
                <div className="relative flex-1 max-w-xs">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="Search name or roll number…"
                    value={studentSearch}
                    onChange={(e) => setStudentSearch(e.target.value)}
                    className="w-full pl-8 pr-3 py-1.5 text-xs bg-sunken border border-slate-200 inset-shadow-well rounded-xl focus:bg-white focus:ring-1 focus:ring-indigo-500 outline-none font-semibold"
                  />
                </div>
                <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl text-[10px] font-bold self-start">
                  {(["all", "evaluated", "pending", "cleared"] as const).map((f) => (
                    <button key={f} onClick={() => setStatusFilter(f)}
                      className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer capitalize ${
                        statusFilter === f ? "bg-white text-indigo-700 shadow font-black" : "text-slate-500 hover:text-slate-800"
                      }`}>
                      {f === "all" ? `All (${displayStudents.length})` : f === "evaluated" ? `Evaluated (${evalCount})` : f === "pending" ? `Pending (${Math.max(0, displayStudents.length - evalCount)})` : "Cleared"}
                    </button>
                  ))}
                </div>
              </div>

              {/* Table */}
              <div className="flex-1 border border-slate-200 rounded-xl overflow-hidden">
                <Table containerClassName="h-full">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-8">#</TableHead>
                      <TableHead>Candidate</TableHead>
                      <TableHead>Evaluator</TableHead>
                      <TableHead>Slot</TableHead>
                      <TableHead>Meet</TableHead>
                      <TableHead>Score</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredStudents.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center py-10 text-slate-400 font-semibold">
                          No candidates match the current filter.
                        </TableCell>
                      </TableRow>
                    ) : filteredStudents.map((st: any, idx: number) => {
                      const isAssigned = assignedSlotStudentIds.includes(st.id) || idx < displayStudents.length;
                      const slot = slots.find((s: any) => s.student_id === st.id || s.student_id === st.roll_number);
                      const ev = findEval(st);
                      const isEval = Boolean(ev);
                      const rawS = slot?.slot_start_time || st.slot_start_time || "";
                      const rawE = slot?.slot_end_time   || st.slot_end_time   || "";
                      const slotLabel = rawS && rawE && rawS !== rawE ? `${rawS} – ${rawE}` : rawS || "—";
                      const meetHref = slot?.gmeet_link || st.gmeet_link || sessionMeetLink;

                      return (
                        <TableRow key={st.id || idx} className={isAssigned ? "" : "opacity-50"}>
                          <TableCell className="text-slate-400 font-mono text-[10px] w-8">{idx + 1}</TableCell>
                          <TableCell>
                            <p className="font-bold text-slate-900 text-xs">{st.name}</p>
                            <p className="text-[10px] font-mono text-slate-400">{st.roll_number || st.id}</p>
                          </TableCell>
                          <TableCell className="text-[11px]">
                            {isAssigned ? (slot?.mentor_name || st.mentor_name || interview.mentor_name || "—") : "—"}
                          </TableCell>
                          <TableCell className="text-[11px] font-mono">
                            {isAssigned ? slotLabel : "—"}
                          </TableCell>
                          <TableCell>
                            {interview.type === "internal" ? (
                              <Badge variant="success" className="text-[9px]">
                                <User className="w-2.5 h-2.5" /> In-Person
                              </Badge>
                            ) : isAssigned && meetHref ? (
                              <a href={meetHref} target="_blank" rel="noreferrer"
                                className="inline-flex items-center gap-1 text-[10px] font-bold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 px-2 py-0.5 rounded-lg transition-all">
                                <Video className="w-3 h-3" /> Meet
                              </a>
                            ) : <span className="text-slate-300 text-[10px]">—</span>}
                          </TableCell>
                          <TableCell>
                            {isEval ? (
                              <button type="button" onClick={() => setSelectedEval({ student: st, eval: ev })}
                                className="flex flex-col text-left group cursor-pointer">
                                <span className="font-black text-indigo-700 text-xs group-hover:underline flex items-center gap-1">
                                  {ev.total_score}/10 <Eye className="w-3 h-3 opacity-50 group-hover:opacity-100" />
                                </span>
                                <span className="text-[9px] text-slate-400">{Math.round((Number(ev.total_score) || 0) * 10)}%</span>
                              </button>
                            ) : <span className="text-amber-500 text-[10px] font-semibold">⏳ Pending</span>}
                          </TableCell>
                          <TableCell>
                            {isEval ? (
                              <Badge variant={(ev.status || "").toLowerCase().includes("clear") ? "success" : "warning"} className="text-[9px]">
                                {ev.status || "Evaluated"}
                              </Badge>
                            ) : isAssigned ? (
                              <Badge variant="secondary" className="text-[9px]">Scheduled</Badge>
                            ) : (
                              <Badge variant="destructive" className="text-[9px]">Unallocated</Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>

            {/* ══ TAB: CAPACITY (external only) ════════════════════════════ */}
            {isExternalSession && (
              <TabsContent value="capacity" className="flex-1 overflow-y-auto px-4 pb-6">
                <div className="space-y-3 pt-1">
                  <p className="text-xs font-black uppercase tracking-wider text-slate-400">Partner Campus Capacity Responses</p>
                  {(() => {
                    const hostId = interview.college_id || interview.origin_college_id;
                    const hostCol = allColleges.find((c: any) => c.id === hostId);
                    const hostKamId = hostCol?.kam_id;
                    const valid = (interview.cam_responses || []).filter((cr: any) => {
                      if (cr.college_id === hostId) return false;
                      if (!hostKamId) return true;
                      const crKam = allColleges.find((c: any) => c.id === cr.college_id)?.kam_id;
                      return !crKam || crKam === hostKamId;
                    });
                    if (valid.length === 0) return (
                      <Card><CardContent className="py-8 text-center text-slate-400 text-sm">No capacity responses yet.</CardContent></Card>
                    );
                    return (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {valid.map((cr: any) => (
                          <Card key={cr.id} className="overflow-hidden">
                            <CardContent className="p-4 flex items-center justify-between">
                              <div>
                                <p className="text-xs font-bold text-slate-900">{cr.college_name}</p>
                                <p className="text-[11px] text-slate-400 font-semibold mt-0.5">
                                  {cr.cam_name || "Campus Manager"}
                                </p>
                              </div>
                              <div className="text-right">
                                <p className="text-sm font-black text-purple-700">{cr.accepted_student_capacity || 0} students</p>
                                <Badge variant={cr.status === "accepted" ? "success" : cr.status === "declined" ? "destructive" : "warning"} className="text-[9px] mt-0.5">
                                  {cr.status || "pending"}
                                </Badge>
                              </div>
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    );
                  })()}
                  {/* Totals */}
                  <Card className="border-purple-200 bg-purple-50/30">
                    <CardContent className="p-4 flex items-center justify-between">
                      <span className="text-xs font-black text-purple-900">Total Accepted Capacity</span>
                      <span className="text-sm font-black text-purple-700">
                        {interview.accepted_capacity || 0} / {reqCount} students
                      </span>
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>
            )}

            {/* ══ TAB: AUDIT LOG ════════════════════════════════════════════ */}
            <TabsContent value="logs" className="flex-1 overflow-y-auto px-4 pb-6">
              <div className="relative pl-6 space-y-5 pt-2 before:absolute before:left-2 before:top-3 before:bottom-3 before:w-0.5 before:bg-slate-200">
                {/* Event 1 */}
                <div className="relative">
                  <div className="absolute -left-6 top-1 w-4 h-4 rounded-full border-2 border-white shadow bg-indigo-500" />
                  <Card><CardContent className="p-3.5 space-y-1">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-black text-slate-800">1. Interview Request Raised</p>
                      <p className="text-[10px] text-slate-400">{interview.created_at || "—"}</p>
                    </div>
                    <p className="text-xs text-slate-600">
                      <strong>{interview.mentor_name || "Mentor"}</strong> raised a <strong>{(interview.type || "internal").toUpperCase()}</strong> interview for <strong>{reqCount} students</strong> in <strong>{interview.class_group || "cohort"}</strong>.
                      {interview.topics && <span> Topics: {interview.topics}.</span>}
                    </p>
                  </CardContent></Card>
                </div>

                {/* Event 2 — external broadcast */}
                {isExternalSession && (
                  <div className="relative">
                    <div className="absolute -left-6 top-1 w-4 h-4 rounded-full border-2 border-white shadow bg-purple-500" />
                    <Card className="border-purple-200 bg-purple-50/30"><CardContent className="p-3.5 space-y-1">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-black text-purple-900">2. Zone Broadcast — Capacity Requests</p>
                      </div>
                      <p className="text-xs text-purple-800">
                        Capacity request broadcast to regional partner colleges. Total accepted: <strong>{interview.accepted_capacity || 0}/{reqCount}</strong>.
                      </p>
                    </CardContent></Card>
                  </div>
                )}

                {/* Event 3 — assigned */}
                {["assigned", "pending_verification", "completed"].includes(interview.status) && (
                  <div className="relative">
                    <div className="absolute -left-6 top-1 w-4 h-4 rounded-full border-2 border-white shadow bg-blue-500" />
                    <Card className="border-blue-200 bg-blue-50/30"><CardContent className="p-3.5 space-y-1">
                      <p className="text-xs font-black text-blue-900">3. Faculty Assigned — 15-Min Slots Dispatched</p>
                      <p className="text-xs text-blue-800">
                        <strong>{assignedMentorsList.length} mentor(s)</strong> assigned: {assignedMentorsList.map((m) => m.name).join(", ")}.
                        {sessionMeetLink && <span> Google Meet: <a href={sessionMeetLink} target="_blank" rel="noreferrer" className="underline">{sessionMeetLink}</a></span>}
                      </p>
                    </CardContent></Card>
                  </div>
                )}

                {/* Event 4 — evaluations */}
                {evalCount > 0 && (
                  <div className="relative">
                    <div className="absolute -left-6 top-1 w-4 h-4 rounded-full border-2 border-white shadow bg-emerald-500" />
                    <Card className="border-emerald-200 bg-emerald-50/30"><CardContent className="p-3.5 space-y-1">
                      <p className="text-xs font-black text-emerald-900">4. Evaluations Submitted</p>
                      <p className="text-xs text-emerald-800">
                        <strong>{evalCount} of {allocCount}</strong> students evaluated.
                        {evalCount >= allocCount && allocCount > 0 && " All evaluations complete."}
                      </p>
                    </CardContent></Card>
                  </div>
                )}

                {/* Event 5 — completed */}
                {isCompleted && (
                  <div className="relative">
                    <div className="absolute -left-6 top-1 w-4 h-4 rounded-full border-2 border-white shadow bg-teal-500" />
                    <Card className="border-teal-200 bg-teal-50/30"><CardContent className="p-3.5">
                      <p className="text-xs font-black text-teal-900">5. Session Completed & Verified</p>
                      <p className="text-xs text-teal-800 mt-0.5">Campus Manager marked session complete. Students have been notified.</p>
                    </CardContent></Card>
                  </div>
                )}
              </div>
            </TabsContent>

          </Tabs>
        </SheetBody>

        {/* ── Footer ── */}
        <div className="shrink-0 border-t border-slate-200 bg-slate-50 px-6 py-3 flex items-center justify-between">
          <span className="text-[11px] text-slate-500 font-semibold">
            Required: <strong>{reqCount}</strong> · Allocated: <strong>{allocCount}</strong> · Evaluated: <strong>{evalCount}</strong>
          </span>
          <button onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-700 text-white text-xs font-bold transition-all cursor-pointer shadow">
            Close
          </button>
        </div>

      </SheetContent>

      {/* ── Eval Detail Sub-Dialog ── */}
      {selectedEval && (
        <Dialog open={true} onOpenChange={(v) => { if (!v) setSelectedEval(null); }} ariaLabel="Evaluation Detail">
          <div className="p-5 space-y-4 max-w-md w-full">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-black text-slate-900">{selectedEval.student?.name}</h3>
              <Badge variant={(selectedEval.eval?.status || "").toLowerCase().includes("clear") ? "success" : "warning"}>
                {selectedEval.eval?.status || "Evaluated"}
              </Badge>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-center">
                <p className="text-2xl font-black text-indigo-700">{selectedEval.eval?.total_score}/10</p>
                <p className="text-[10px] text-slate-400 font-semibold">{Math.round((Number(selectedEval.eval?.total_score) || 0) * 10)}%</p>
              </div>
              <div className="flex-1 space-y-1 text-xs">
                {[["Communication", "communication_score"], ["Content", "content_score"], ["Technical", "technical_score"], ["Confidence", "confidence_score"]].map(([label, key]) => {
                  const val = Number(selectedEval.eval?.[key]) || 0;
                  return (
                    <div key={key} className="flex items-center gap-2">
                      <span className="w-24 text-slate-500 font-semibold shrink-0">{label}</span>
                      <div className="flex-1 h-1.5 rounded-full bg-slate-100">
                        <div className="h-full rounded-full" style={{ width: `${val * 10}%`, background: `linear-gradient(90deg, ${BRAND_PINK}, ${BRAND_PEACH})` }} />
                      </div>
                      <span className="font-black text-slate-700 w-6 text-right">{val}</span>
                    </div>
                  );
                })}
              </div>
            </div>
            {selectedEval.eval?.remarks && (
              <p className="text-xs italic text-slate-600 bg-slate-50 p-3 rounded-xl border border-slate-100">
                &ldquo;{selectedEval.eval.remarks}&rdquo;
              </p>
            )}
            <div className="flex justify-end">
              <button onClick={() => setSelectedEval(null)}
                className="px-4 py-1.5 rounded-xl bg-slate-900 text-white text-xs font-bold cursor-pointer">
                Close
              </button>
            </div>
          </div>
        </Dialog>
      )}

    </Sheet>
  );
};

interface PrioritySplitPreviewDialogProps {
  interview: any;
  preview: any;
  isLoading: boolean;
  onSave: () => void;
  onClose: () => void;
}

const PrioritySplitPreviewDialog: React.FC<PrioritySplitPreviewDialogProps> = ({
  interview,
  preview,
  isLoading,
  onSave,
  onClose,
}) => {
  if (!interview || !preview) return null;

  const allocations: any[] = preview.allocations || [];
  const totalRequested = preview.totalRequested || interview.student_count || 10;
  const acceptedCapacity = preview.acceptedCapacity || 0;
  const allocatedStudents = preview.allocatedStudents || 0;
  const unallocatedStudents = preview.unallocatedStudents || 0;
  const formattedDuration = preview.formattedTotalDuration || `${allocatedStudents * 15} mins`;

  return (
    <Dialog
      open={true}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      ariaLabel="Priority Split Allocation Preview"
      overlayClassName="bg-slate-950/60 backdrop-blur-sm p-4 sm:p-6 overflow-y-auto animate-fadeIn"
      panelClassName="max-w-3xl w-full max-h-[85vh] p-0 space-y-0 overflow-hidden flex flex-col rounded-2xl bg-white shadow-card-lg"
    >
      {/* Header */}
      <div className="flex justify-between items-center px-6 py-4 border-b border-slate-100 bg-slate-50/90 shrink-0">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-xl bg-purple-50 border border-purple-200 flex items-center justify-center text-purple-700">
            <Sparkles className="h-5 w-5" />
          </div>
          <div>
            <h3 className="font-extrabold text-slate-900 text-sm flex items-center gap-2">
              Priority Split Allocation Preview
              <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 border border-purple-200">
                Zone Split
              </span>
            </h3>
            <p className="text-[11px] text-slate-500 font-medium">
              {interview.subject} • {interview.class_group || "All Classes"} • Target Date: {interview.target_date}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close dialog"
          className="p-1.5 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer text-slate-500 hover:text-slate-800"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* KPI Metrics Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-4 border-b border-slate-200 bg-white shrink-0 divide-x divide-slate-100">
        <div className="p-3 text-center">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Requested</span>
          <span className="text-lg font-black text-slate-800">{totalRequested}</span>
        </div>
        <div className="p-3 text-center">
          <span className="text-[10px] font-bold uppercase tracking-wider text-purple-700 block">Zone Accepted</span>
          <span className="text-lg font-black text-purple-800">{acceptedCapacity}</span>
        </div>
        <div className="p-3 text-center">
          <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 block">Split Allocated</span>
          <span className="text-lg font-black text-emerald-800">{allocatedStudents}</span>
        </div>
        <div className="p-3 text-center">
          <span className="text-[10px] font-bold uppercase tracking-wider text-amber-600 block">Unallocated</span>
          <span className="text-lg font-black text-amber-700">{unallocatedStudents}</span>
        </div>
      </div>

      {/* Allocations Content */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {allocations.length === 0 ? (
          <div className="p-8 text-center bg-slate-50 border border-dashed border-slate-200 rounded-xl">
            <AlertTriangle className="h-6 w-6 text-amber-500 mx-auto mb-2" />
            <p className="text-xs font-bold text-slate-700">No partner campus capacity available to allocate.</p>
            <p className="text-[11px] text-slate-500 mt-1">
              Ensure partner campus managers in your KAM zone have accepted capacity before running priority split.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                Proposed Partner Campus Sessions ({allocations.length} Evaluator Segment{allocations.length > 1 ? "s" : ""})
              </span>
              <span className="text-[10px] font-black text-indigo-700 bg-indigo-50 border border-indigo-200 px-2.5 py-0.5 rounded-lg">
                Estimated Duration: {formattedDuration}
              </span>
            </div>

            <div className="space-y-2.5">
              {allocations.map((alloc, idx) => (
                <div
                  key={alloc.id || idx}
                  className="p-4 rounded-xl border border-slate-100 bg-slate-50/60 hover:bg-slate-50 transition-all space-y-2.5"
                >
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2">
                      <Building className="w-4 h-4 text-purple-600 shrink-0" />
                      <div>
                        <div className="font-extrabold text-xs text-slate-800">
                          {alloc.target_college_name || "Partner Campus"}
                        </div>
                        <div className="text-[10px] text-slate-500 font-semibold flex items-center gap-1.5">
                          <User className="w-3 h-3 text-indigo-600" />
                          <span>Evaluator: {alloc.mentor_name || "Faculty Mentor"}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-mono font-bold text-slate-600 bg-white px-2 py-1 rounded-lg border border-slate-200 flex items-center gap-1">
                        <Clock className="w-3 h-3 text-slate-400" />
                        {alloc.start_time} – {alloc.end_time} ({alloc.duration_minutes}m)
                      </span>
                      <span className="text-[10px] font-black text-emerald-700 bg-emerald-100/80 px-2.5 py-1 rounded-lg border border-emerald-200">
                        {alloc.allocated_student_count} Candidates
                      </span>
                    </div>
                  </div>

                  {/* 15-min Slot proposals */}
                  {alloc.slots && alloc.slots.length > 0 && (
                    <div className="pt-2 border-t border-slate-200/70">
                      <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 block mb-1.5">
                        Candidate 15-Minute Slot Intervals:
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {alloc.slots.map((sl: any, sIdx: number) => (
                          <span
                            key={sIdx}
                            className="text-[9.5px] font-mono font-semibold bg-white border border-slate-200 px-2 py-0.5 rounded text-slate-700"
                          >
                            Candidate #{sIdx + 1}: {sl.slot_start_time}–{sl.slot_end_time}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between px-6 py-3.5 border-t border-slate-200 bg-slate-50/80 shrink-0">
        <button
          type="button"
          onClick={onClose}
          disabled={isLoading}
          className="text-xs font-bold text-slate-500 hover:text-slate-800 px-4 py-2 rounded-xl border border-slate-200 hover:bg-slate-100 transition-all cursor-pointer disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onSave}
          disabled={isLoading || allocations.length === 0}
          className="btn-gradient flex items-center gap-2 px-6 py-2.5 rounded-xl text-xs font-extrabold disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer shadow-xs"
        >
          {isLoading ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span>Saving Allocation...</span>
            </>
          ) : (
            <>
              <CheckCircle className="w-3.5 h-3.5" />
              <span>Save & Confirm Split Allocation</span>
            </>
          )}
        </button>
      </div>
    </Dialog>
  );
};


export const InterviewModule: React.FC<InterviewModuleProps> = ({
  currentUserRole = "mentor",
  currentUserName = "User",
  defaultCollegeId
}) => {
  const { currentMentor, currentKAM, students, mentors, slots, colleges } = useApp();
  const { toast, confirm: showConfirm } = useToast();
  const queryClient = useQueryClient();

  const [deletingInterviewId, setDeletingInterviewId] = useState<string | null>(null);
  const activeCollegesList = colleges;

  const isMentor = currentUserRole === "mentor";
  const isCM = currentUserRole === "cm" || currentUserRole === "cam";
  const isKAM = currentUserRole === "kam" || currentUserRole === "admin";

  const [activeTab, setActiveTab] = useState(() =>
    isCM ? "pending" : isKAM ? "overview" : "raise"
  );
  const [activeMode, setActiveMode] = useState<"internal" | "external">("internal");

  // Data

  // Helper for Local Date String (YYYY-MM-DD) avoiding UTC shifts
  const getTodayLocalStr = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };

  // Calendar State
  const [calendarMonth, setCalendarMonth] = useState(() => new Date());
  const [selectedCalendarDate, setSelectedCalendarDate] = useState<string | null>(null);
  const [calendarViewFilter, setCalendarViewFilter] = useState<"all" | "today">("all");

  // Raise Request Form
  const [selectedSubject, setSelectedSubject] = useState("");
  const [selectedClassGroup, setSelectedClassGroup] = useState("");
  const [targetDate, setTargetDate] = useState("");
  const [preferredStartTime, setPreferredStartTime] = useState("09:00 AM");
  const [raiseStudentCount, setRaiseStudentCount] = useState<number>(10);
  const [topics, setTopics] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Priority Split Modal & Preview State
  const [activeSplitInterview, setActiveSplitInterview] = useState<any | null>(null);
  const [splitPreviewResult, setSplitPreviewResult] = useState<any | null>(null);
  const [isLoadingSplit, setIsLoadingSplit] = useState(false);

  // Evaluation Form (Shadcn Split Screen)
  const [expandedRequest, setExpandedRequest] = useState<string | null>(null);
  const [studentSearchQuery, setStudentSearchQuery] = useState("");
  const [studentStatusFilter, setStudentStatusFilter] = useState<"all" | "pending" | "evaluated" | "cleared">("all");
  const [selectedStudent, setSelectedStudent] = useState<any | null>(null);

  // Per-Student Evaluation Form State
  const [evalAttendance, setEvalAttendance] = useState<"present" | "absent" | "od">("present");
  const [commScore, setCommScore] = useState(7);
  const [contentScore, setContentScore] = useState(7);
  const [techScore, setTechScore] = useState(7);
  const [confidenceScore, setConfidenceScore] = useState(7);
  const [actualStartTime, setActualStartTime] = useState("");
  const [actualEndTime, setActualEndTime] = useState("");
  const [actualDuration, setActualDuration] = useState<number>(15);

  // Structured Questions State ("question should be")
  const [evalQuestions, setEvalQuestions] = useState<StructuredQuestion[]>([]);
  const [newQuestionText, setNewQuestionText] = useState("");
  const [remarks, setRemarks] = useState("");
  const [isSavingEval, setIsSavingEval] = useState(false);

  // CM Allocation & Mentor Free Period Time Mapping (Multi-Period Selection & Per-Period Student Counts)
  const [expandedAllocation, setExpandedAllocation] = useState<string | null>(null);
  const [mentorSlotConfigs, setMentorSlotConfigs] = useState<Record<string, Record<string, number>>>({});
  const [showAllCampusMentors, setShowAllCampusMentors] = useState(false);
  const [camStudentCount, setCamStudentCount] = useState(10);
  const [camTimeSlot, setCamTimeSlot] = useState("8.20 AM - 9.10 AM");
  const [cmGmeetLink, setCmGmeetLink] = useState("");
  const [isAssigning, setIsAssigning] = useState(false);

  const generateGMeetLink = () => {
    const chars = "abcdefghijklmnopqrstuvwxyz";
    const randStr = (len: number) => Array.from({ length: len }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
    const code = randStr(3) + "-" + randStr(4) + "-" + randStr(3);
    const link = "https://meet.google.com/" + code;
    setCmGmeetLink(link);
    toast("Google Meet link generated!", "success");
    return link;
  };
  const [isMarkingComplete, setIsMarkingComplete] = useState<string | null>(null);
  const [viewingStudentRosterModal, setViewingStudentRosterModal] = useState<any | null>(null);
  const [rosterInitialTab, setRosterInitialTab] = useState<"mentors" | "students" | "logs">("students");

  // Derived Multi-Period Allocation Metrics
  const activeMappedMentorIds = useMemo(() => {
    return Object.keys(mentorSlotConfigs).filter(id => {
      const sMap = mentorSlotConfigs[id];
      return sMap && Object.keys(sMap).length > 0;
    });
  }, [mentorSlotConfigs]);

  const totalAssignedCandidates = useMemo(() => {
    return Object.values(mentorSlotConfigs).reduce((sum, sMap) => {
      return sum + Object.values(sMap || {}).reduce((sub, count) => sub + (Number(count) || 0), 0);
    }, 0);
  }, [mentorSlotConfigs]);

  const toggleMentorPeriod = (mentorId: string, timeSlot: string, defaultCandidates: number = 3) => {
    setMentorSlotConfigs(prev => {
      const mentorSlots = { ...(prev[mentorId] || {}) };
      const norm = timeSlot.trim();
      const existingKey = Object.keys(mentorSlots).find(k => k.toLowerCase().replace(/\s+/g, "") === norm.toLowerCase().replace(/\s+/g, ""));
      if (existingKey) {
        delete mentorSlots[existingKey];
      } else {
        mentorSlots[norm] = defaultCandidates;
      }

      const updated = { ...prev };
      if (Object.keys(mentorSlots).length === 0) {
        delete updated[mentorId];
      } else {
        updated[mentorId] = mentorSlots;
      }

      const newTotal = Object.values(updated).reduce((sum, sMap) => {
        return sum + Object.values(sMap || {}).reduce((sub, count) => sub + (Number(count) || 0), 0);
      }, 0);
      setCamStudentCount(Math.max(1, newTotal));
      return updated;
    });
  };

  const updateMentorPeriodCount = (mentorId: string, timeSlot: string, newCount: number) => {
    const safeCount = Math.max(1, Math.min(100, newCount));
    setMentorSlotConfigs(prev => {
      const mentorSlots = { ...(prev[mentorId] || {}) };
      const norm = timeSlot.trim();
      const existingKey = Object.keys(mentorSlots).find(k => k.toLowerCase().replace(/\s+/g, "") === norm.toLowerCase().replace(/\s+/g, "")) || norm;
      mentorSlots[existingKey] = safeCount;

      const updated = { ...prev, [mentorId]: mentorSlots };
      const newTotal = Object.values(updated).reduce((sum, sMap) => {
        return sum + Object.values(sMap || {}).reduce((sub, count) => sub + (Number(count) || 0), 0);
      }, 0);
      setCamStudentCount(Math.max(1, newTotal));
      return updated;
    });
  };

  const setMentorAllFreePeriods = (mentorId: string, freeSlots: string[], defaultCandidates: number = 3) => {
    if (freeSlots.length === 0) return;
    setMentorSlotConfigs(prev => {
      const mentorSlots = { ...(prev[mentorId] || {}) };
      freeSlots.forEach(fs => {
        const norm = fs.trim();
        const existingKey = Object.keys(mentorSlots).find(k => k.toLowerCase().replace(/\s+/g, "") === norm.toLowerCase().replace(/\s+/g, ""));
        if (!existingKey) {
          mentorSlots[norm] = defaultCandidates;
        }
      });
      const updated = { ...prev, [mentorId]: mentorSlots };
      const newTotal = Object.values(updated).reduce((sum, sMap) => {
        return sum + Object.values(sMap || {}).reduce((sub, count) => sub + (Number(count) || 0), 0);
      }, 0);
      setCamStudentCount(Math.max(1, newTotal));
      return updated;
    });
  };

  const clearMentorPeriods = (mentorId: string) => {
    setMentorSlotConfigs(prev => {
      const updated = { ...prev };
      delete updated[mentorId];
      const newTotal = Object.values(updated).reduce((sum, sMap) => {
        return sum + Object.values(sMap || {}).reduce((sub, count) => sub + (Number(count) || 0), 0);
      }, 0);
      setCamStudentCount(Math.max(1, newTotal));
      return updated;
    });
  };

  const openRosterModal = (req: any, tab: "mentors" | "students" | "logs" = "students") => {
    setViewingStudentRosterModal(req);
    setRosterInitialTab(tab);
  };
  const [expandedMentorTimetable, setExpandedMentorTimetable] = useState<string | null>(null);

  // Min date = today + 2 days
  const minTargetDate = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 2);
    return d.toISOString().split("T")[0];
  }, []);

  // Mentor's assigned subjects (Tamil excluded)
  const mentorSubjects = useMemo(() => {
    if (!currentMentor) return [];
    const raw = (currentMentor.subjects || "").split(/,|\n/).map(s => s.trim()).filter(Boolean);
    return Array.from(new Set(raw.filter(s => s.toLowerCase() !== "tamil")));
  }, [currentMentor]);

  // Mentor's assigned classes
  const mentorClasses = useMemo(() => {
    if (!currentMentor?.classes) {
      return Array.from(new Set(students.map(s => s.classGroup).filter(Boolean))).sort().slice(0, 10);
    }
    const rawStr = currentMentor.classes.trim();
    let classList: string[] = [];
    if (rawStr.startsWith("[") && rawStr.endsWith("]")) {
      try {
        const parsed = JSON.parse(rawStr);
        if (Array.isArray(parsed)) {
          classList = parsed.map(c => String(c).trim()).filter(Boolean);
        }
      } catch (_) {}
    }
    if (classList.length === 0) {
      classList = rawStr.split(/,|\n/).map(c => c.replace(/^[\["'\s]+|[\]"'\s]+$/g, "").trim()).filter(Boolean);
    }
    return Array.from(new Set(classList));
  }, [currentMentor, students]);

  const isOnlyTamil = useMemo(() => {
    if (!currentMentor) return false;
    const raw = (currentMentor.subjects || "").split(/,|\n/).map(s => s.trim()).filter(Boolean);
    return raw.length > 0 && raw.every(s => s.toLowerCase() === "tamil");
  }, [currentMentor]);

  // Campus-scoped mentors for CM
  const campusMentors = useMemo(() => {
    if (!isCM || !defaultCollegeId) return mentors;
    return mentors.filter(m => m.college_id === defaultCollegeId);
  }, [isCM, defaultCollegeId, mentors]);

  // Interviews + evaluations, scoped to the signed-in role/mentor/campus
  const interviewScope = [currentUserRole, currentMentor?.id || "", defaultCollegeId || "", currentKAM?.id || ""].join("|");
  const interviewsQuery = useQuery({
    queryKey: qk.interviewList(interviewScope),
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set("role", currentUserRole);
      if (currentMentor?.id) params.set("mentorId", currentMentor.id);
      if (defaultCollegeId) params.set("collegeId", defaultCollegeId);
      if (currentKAM?.id) params.set("kamId", currentKAM.id);

      const data = await apiFetch(`/api/interviews?${params.toString()}`);
      return {
        interviews: data?.success ? (data.interviews || []) as any[] : [],
        evaluations: data?.success ? (data.evaluations || []) as any[] : []
      };
    },
  });
  const interviewsList = interviewsQuery.data?.interviews || [];
  const evaluationsList = interviewsQuery.data?.evaluations || [];
  const isLoading = interviewsQuery.isFetching;

  // Campus daily configs and exam schedules for detecting Exam Days
  const effectiveCollegeId = defaultCollegeId || currentMentor?.college_id || (colleges.length > 0 ? colleges[0]?.id : "") || "";

  const dailyConfigsQuery = useQuery({
    queryKey: ["daily-configs", effectiveCollegeId],
    queryFn: async () => {
      if (!effectiveCollegeId) return [];
      const res = await apiFetch<any>(`/api/daily-configs?college_id=${encodeURIComponent(effectiveCollegeId)}`);
      return (res?.data || res?.configs || (Array.isArray(res) ? res : [])) as any[];
    },
    staleTime: 60_000,
    enabled: !!effectiveCollegeId
  });
  const dailyConfigsList = Array.isArray(dailyConfigsQuery.data) ? dailyConfigsQuery.data : [];

  const examsQuery = useQuery({
    queryKey: ["exams", effectiveCollegeId],
    queryFn: async () => {
      if (!effectiveCollegeId) return [];
      const res = await apiFetch<any>(`/api/exams?college_id=${encodeURIComponent(effectiveCollegeId)}`);
      return (res?.data || res?.exams || (Array.isArray(res) ? res : [])) as any[];
    },
    staleTime: 60_000,
    enabled: !!effectiveCollegeId
  });
  const examsList = Array.isArray(examsQuery.data) ? examsQuery.data : [];

  const getExamDayInfo = useCallback((dateStr: string) => {
    if (!dateStr) return null;
    const cleanDate = dateStr.split("T")[0].trim();
    const cfg = dailyConfigsList.find(c => (c.dateStr || c.date) === cleanDate);
    if (cfg && (cfg.day_type === "exam_day" || cfg.day_type === "exam" || (cfg.notes && /exam/i.test(cfg.notes)))) {
      return cfg.notes || "Campus Exam Day";
    }
    const ex = examsList.find(e => (e.exam_date || e.date) === cleanDate);
    if (ex) {
      return `${ex.exam_type || "Exam"}${ex.subject_name ? ` (${ex.subject_name})` : ""}`;
    }
    return null;
  }, [dailyConfigsList, examsList]);

  // Real-time synchronization: invalidate when interviews change elsewhere.
  useEffect(() => {
    const handleSync = () => {
      queryClient.invalidateQueries({ queryKey: ["interviews"] });
    };

    window.addEventListener("fp_interviews_updated", handleSync);

    return () => {
      window.removeEventListener("fp_interviews_updated", handleSync);
    };
  }, [queryClient]);

  // Auto-select first subject/class
  useEffect(() => {
    if (mentorSubjects.length > 0 && !selectedSubject) setSelectedSubject(mentorSubjects[0]);
    if (mentorClasses.length > 0 && !selectedClassGroup) setSelectedClassGroup(mentorClasses[0]);
  }, [mentorSubjects, mentorClasses]);

  // When selected student changes or session changes, initialize structured questions
  useEffect(() => {
    if (selectedStudent && expandedRequest) {
      const req = interviewsList.find(i => i.id === expandedRequest);
      const existingEval = evaluationsList.find(
        ev => ev.interview_id === expandedRequest && (
          ev.student_id === selectedStudent.id ||
          (ev.student_name && selectedStudent.name && ev.student_name.toLowerCase().trim() === selectedStudent.name.toLowerCase().trim())
        )
      );

      if (existingEval) {
        setEvalAttendance(existingEval.attendance || "present");
        setCommScore(existingEval.communication_score ?? 7);
        setContentScore(existingEval.content_score ?? 7);
        setTechScore(existingEval.technical_score ?? 7);
        setConfidenceScore(existingEval.confidence_score ?? 7);
        setRemarks(existingEval.remarks || "");
        setActualStartTime(existingEval.actual_start_time || "");
        setActualEndTime(existingEval.actual_end_time || "");
        setActualDuration(existingEval.actual_duration_minutes ?? 15);

        // Parse structured questions if JSON, else wrap string
        if (existingEval.questions_asked) {
          try {
            const parsed = typeof existingEval.questions_asked === "string"
              ? JSON.parse(existingEval.questions_asked)
              : existingEval.questions_asked;
            if (Array.isArray(parsed) && parsed.length > 0) {
              setEvalQuestions(parsed);
              return;
            }
          } catch (_) {}
          // Single text fallback
          setEvalQuestions([
            { id: "q1", question: String(existingEval.questions_asked), maxScore: 10, score: 7, notes: "" }
          ]);
          return;
        } else {
          setEvalQuestions(getSubjectQuestionsPreset(req?.subject || ""));
          return;
        }
      }

      // Default preset questions based on subject
      const mySlot = (req?.student_slots || []).find((s: any) => s.student_id === selectedStudent.id);
      setEvalQuestions(getSubjectQuestionsPreset(req?.subject || ""));
      setEvalAttendance("present");
      setCommScore(7); setContentScore(7); setTechScore(7); setConfidenceScore(7); setRemarks("");
      setActualStartTime(mySlot?.slot_start_time || "");
      setActualEndTime(mySlot?.slot_end_time || "");
      setActualDuration(15);
    }
  }, [selectedStudent, expandedRequest, evaluationsList]);

  // ── Calendar Grid Calculations ──────────────────────────────────────────────

  // ── Calendar Grid Calculations ──────────────────────────────────────────────

  const calendarDays = useMemo(() => {
    const year = calendarMonth.getFullYear();
    const month = calendarMonth.getMonth();
    const firstDay = new Date(year, month, 1).getDay(); // 0 = Sun
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const days: Array<{ dateStr: string; dayNum: number; isCurrentMonth: boolean }> = [];

    // Offset for previous month days
    const prevMonthDays = new Date(year, month, 0).getDate();
    const prevMonth = month === 0 ? 11 : month - 1;
    const prevYear = month === 0 ? year - 1 : year;

    for (let i = firstDay - 1; i >= 0; i--) {
      const dayNum = prevMonthDays - i;
      const dateStr = `${prevYear}-${String(prevMonth + 1).padStart(2, "0")}-${String(dayNum).padStart(2, "0")}`;
      days.push({
        dateStr,
        dayNum,
        isCurrentMonth: false,
      });
    }

    // Current month days
    for (let i = 1; i <= daysInMonth; i++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(i).padStart(2, "0")}`;
      days.push({
        dateStr,
        dayNum: i,
        isCurrentMonth: true,
      });
    }

    // Trailing days for next month to complete grid weeks
    const remaining = (7 - (days.length % 7)) % 7;
    const nextMonth = month === 11 ? 0 : month + 1;
    const nextYear = month === 11 ? year + 1 : year;
    for (let i = 1; i <= remaining; i++) {
      const dateStr = `${nextYear}-${String(nextMonth + 1).padStart(2, "0")}-${String(i).padStart(2, "0")}`;
      days.push({
        dateStr,
        dayNum: i,
        isCurrentMonth: false,
      });
    }

    return days;
  }, [calendarMonth]);

  // Map of interviews by target_date for calendar badges
  const scheduledInterviewsByDate = useMemo(() => {
    const map: Record<string, any[]> = {};
    interviewsList.forEach(item => {
      if (item.target_date) {
        const dateKey = String(item.target_date).split("T")[0].trim();
        if (!map[dateKey]) map[dateKey] = [];
        map[dateKey].push(item);
      }
    });
    return map;
  }, [interviewsList]);

  // ── Handlers ────────────────────────────────────────────────────────────────

  const handleRaiseRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSubject) { toast("Please select a subject.", "warning"); return; }
    if (selectedSubject.toLowerCase() === "tamil") { toast("Interviews are not applicable for Tamil.", "error"); return; }
    if (!selectedClassGroup) { toast("Please select a class group.", "warning"); return; }
    if (!targetDate) { toast("Please select a target date.", "warning"); return; }
    if (targetDate < minTargetDate) { toast(`Date must be on or after ${minTargetDate}.`, "error"); return; }
    const examInfo = getExamDayInfo(targetDate);
    if (examInfo) {
      toast(`Cannot schedule interview on ${targetDate}: this date is configured as an Exam Day (${examInfo}). Please select a regular working day.`, "error");
      return;
    }
    if (!topics.trim()) { toast("Please enter interview topics.", "warning"); return; }

    // Dynamic enrolled student count from classGroup
    const enrolledStudents = students.filter(s => 
      s.classGroup === selectedClassGroup || s.department === selectedClassGroup
    );
    const dynamicStudentCount = enrolledStudents.length > 0 ? enrolledStudents.length : 25;

    setIsSubmitting(true);
    try {
      const data = await apiFetch("/api/interviews", {
        method: "POST",
        body: {
          subject: selectedSubject,
          class_group: selectedClassGroup,
          type: activeMode,
          target_date: targetDate,
          preferred_start_time: "To be mapped by CM",
          student_count: dynamicStudentCount,
          topics: topics.trim(),
          mentor_id: currentMentor?.id || "mentor_1",
          mentor_name: currentMentor?.name || currentUserName,
          mentor_email: currentMentor?.email || "",
          origin_college_id: currentMentor?.college_id || defaultCollegeId || "",
          college_id: currentMentor?.college_id || defaultCollegeId || "",
        },
      });
      if (data.success) {
        toast("Interview request raised & marked on calendar! CM will schedule time slot based on mentor free periods.", "success");
        setTopics(""); setTargetDate("");
        await queryClient.invalidateQueries({ queryKey: ["interviews"] });
        if (typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent("fp_interviews_updated"));
        }
        setActiveTab("myinterviews");
      } else {
        toast(data.message || "Failed to raise request.", "error");
      }
    } catch {
      toast("Error raising interview request.", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAddQuestion = () => {
    if (!newQuestionText.trim()) return;
    const newQ: StructuredQuestion = {
      id: `q_${Date.now()}`,
      question: newQuestionText.trim(),
      maxScore: 10,
      score: 7,
      notes: ""
    };
    setEvalQuestions(prev => [...prev, newQ]);
    setNewQuestionText("");
  };

  const handleRemoveQuestion = (id: string) => {
    setEvalQuestions(prev => prev.filter(q => q.id !== id));
  };

  const handleUpdateQuestion = (id: string, field: "score" | "notes" | "question", val: any) => {
    setEvalQuestions(prev => prev.map(q => q.id === id ? { ...q, [field]: val } : q));
  };

  const handleSaveEval = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!expandedRequest || !selectedStudent) { toast("Select a student to evaluate.", "warning"); return; }

    setIsSavingEval(true);
    try {
      const isAbsent = evalAttendance === "absent";
      // Average score combines questions score + overall skill ratings
      const qScoreSum = isAbsent ? 0 : evalQuestions.reduce((acc, q) => acc + (Number(q.score) || 0), 0);
      const qAvg = isAbsent ? 0 : (evalQuestions.length > 0 ? qScoreSum / evalQuestions.length : 7);
      const metricsAvg = isAbsent ? 0 : ((commScore + contentScore + techScore + confidenceScore) / 4);
      const combinedScore = isAbsent ? 0 : Math.round((qAvg + metricsAvg) / 2);

      const data = await apiFetch("/api/interviews/evaluate", {
        method: "POST",
        body: {
          interview_id: expandedRequest,
          student_id: selectedStudent.id,
          student_name: selectedStudent.name,
          class_group: selectedStudent.classGroup,
          mentor_id: currentMentor?.id || "mentor_1",
          mentor_name: currentMentor?.name || currentUserName,
          attendance: evalAttendance,
          is_absent: isAbsent,
          communication_score: isAbsent ? 0 : commScore,
          content_score: isAbsent ? 0 : contentScore,
          technical_score: isAbsent ? 0 : techScore,
          confidence_score: isAbsent ? 0 : confidenceScore,
          total_score: combinedScore,
          questions_asked: isAbsent ? "[]" : JSON.stringify(evalQuestions), // Structured JSON questions
          remarks: isAbsent ? (remarks || "Candidate absent for interview") : remarks,
          status: isAbsent ? "Absent" : (combinedScore >= 6 ? "Cleared" : "Needs Improvement"),
          actual_start_time: isAbsent ? null : (actualStartTime || null),
          actual_end_time: isAbsent ? null : (actualEndTime || null),
          actual_duration_minutes: isAbsent ? 0 : actualDuration,
        },
      });
      if (data.success) {
        toast(
          isAbsent
            ? `${selectedStudent.name} marked absent. Period attendance synchronized!`
            : `Evaluation marks saved for ${selectedStudent.name}! Period attendance updated.`,
          "success"
        );
        setSelectedStudent(null);
        await queryClient.invalidateQueries({ queryKey: ["interviews"] });
        if (typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent("fp_interviews_updated"));
          window.dispatchEvent(new CustomEvent("fp_attendance_updated"));
        }
      } else {
        toast(data.message || "Failed to save evaluation.", "error");
      }
    } catch {
      toast("Error saving evaluation.", "error");
    } finally {
      setIsSavingEval(false);
    }
  };

  const handleAssign = async (interviewId: string) => {
    const mentorSchedulePayload: Array<{ mentor_id: string; time_slot: string; student_count: number }> = [];
    Object.entries(mentorSlotConfigs).forEach(([mId, slotsObj]) => {
      Object.entries(slotsObj).forEach(([slotStr, count]) => {
        if (Number(count) > 0) {
          mentorSchedulePayload.push({
            mentor_id: mId,
            time_slot: slotStr,
            student_count: Number(count),
          });
        }
      });
    });

    const activeMentorIds = Array.from(new Set(mentorSchedulePayload.map(s => s.mentor_id)));

    if (activeMentorIds.length === 0) {
      toast("Select at least one faculty mentor and period.", "warning");
      return;
    }

    const totalCalculatedStudents = mentorSchedulePayload.reduce((acc, s) => acc + s.student_count, 0);
    const effectiveStudentCount = camStudentCount > 0 ? camStudentCount : totalCalculatedStudents;
    if (effectiveStudentCount < 1) {
      toast("Set a valid student count.", "warning");
      return;
    }

    const targetReq = interviewsList.find(i => i.id === interviewId);
    const hostColId = targetReq?.origin_college_id || targetReq?.college_id || defaultCollegeId;
    const cleanCG = (targetReq?.class_group || "").replace(/^[\["'\s]+|[\]"'\s]+$/g, "").trim();
    const deptPrefix = cleanCG.split(/[-–—(]/)[0].trim().toLowerCase();
    const cleanTokens = cleanCG.toLowerCase().replace(/[^a-z0-9]/g, " ").split(/\s+/).filter((t: string) => t.length > 2);

    const campusPool = students.filter(s => !hostColId || !s.college_id || s.college_id === hostColId);
    const pool = campusPool.length > 0 ? campusPool : students;

    let cohortStudents = pool.filter(s => {
      const sCG = (s.classGroup || "").toLowerCase().trim();
      const sDept = (s.department || "").toLowerCase().trim();
      if (sCG === cleanCG.toLowerCase() || sDept === cleanCG.toLowerCase()) return true;
      if (deptPrefix && (sDept.includes(deptPrefix) || deptPrefix.includes(sDept))) return true;
      if (deptPrefix && (sCG.includes(deptPrefix) || deptPrefix.includes(sCG))) return true;
      const matchCount = cleanTokens.filter((tok: string) => sCG.includes(tok) || sDept.includes(tok)).length;
      return matchCount >= Math.min(2, cleanTokens.length);
    });

    if (cohortStudents.length === 0) {
      cohortStudents = pool;
    }
    const selectedIds = cohortStudents.slice(0, effectiveStudentCount).map(s => s.id);

    setIsAssigning(true);
    let effectiveMeet = targetReq?.type === "internal" ? "" : cmGmeetLink.trim();
    if (targetReq?.type === "external" && !effectiveMeet) {
      if (targetReq.gmeet_link?.trim()) {
        effectiveMeet = targetReq.gmeet_link.trim();
      } else {
        effectiveMeet = generateGMeetLink();
      }
    }

    try {
      const data = await apiFetch("/api/interviews/assign", {
        method: "POST",
        body: {
          interview_id: interviewId,
          mapped_mentor_ids: activeMentorIds,
          student_count: effectiveStudentCount,
          time_slot: camTimeSlot,
          mentor_schedule: mentorSchedulePayload,
          cm_name: currentUserName,
          gmeet_link: targetReq?.type === "internal" ? "" : effectiveMeet,
          selected_student_ids: selectedIds,
        },
      });
      if (data.success) {
        toast("Flexible multi-period mentor schedule saved & marked on calendar! Notification emails dispatched.", "success");
        setExpandedAllocation(null);
        setMentorSlotConfigs({});
        setCmGmeetLink("");
        await queryClient.invalidateQueries({ queryKey: ["interviews"] });
        if (typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent("fp_interviews_updated"));
        }
      } else {
        toast(data.message || "Failed to assign.", "error");
      }
    } catch {
      toast("Error assigning interview.", "error");
    } finally {
      setIsAssigning(false);
    }
  };

  const handlePreviewPrioritySplit = async (req: any) => {
    setActiveSplitInterview(req);
    setIsLoadingSplit(true);
    try {
      const data = await apiFetch("/api/interviews/priority-split", {
        method: "POST",
        body: {
          interview_id: req.id,
          origin_college_id: req.origin_college_id || req.college_id,
          target_date: req.target_date,
          preferred_start_time: req.preferred_start_time || "09:00 AM",
          student_count: req.student_count || 10,
          subject: req.subject,
          action: "preview"
        }
      });
      if (data.success) {
        setSplitPreviewResult(data.preview);
      } else {
        toast(data.message || "Failed to preview priority split", "error");
      }
    } catch {
      toast("Error calculating priority split", "error");
    } finally {
      setIsLoadingSplit(false);
    }
  };

  const handleSavePrioritySplit = async () => {
    if (!activeSplitInterview) return;
    setIsLoadingSplit(true);
    try {
      const data = await apiFetch("/api/interviews/priority-split", {
        method: "POST",
        body: {
          interview_id: activeSplitInterview.id,
          origin_college_id: activeSplitInterview.origin_college_id || activeSplitInterview.college_id,
          target_date: activeSplitInterview.target_date,
          preferred_start_time: activeSplitInterview.preferred_start_time || "09:00 AM",
          student_count: activeSplitInterview.student_count || 10,
          subject: activeSplitInterview.subject,
          action: "save"
        }
      });
      if (data.success) {
        toast(data.message, "success");
        setActiveSplitInterview(null);
        setSplitPreviewResult(null);
        await queryClient.invalidateQueries({ queryKey: ["interviews"] });
        if (typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent("fp_interviews_updated"));
        }
      } else {
        toast(data.message || "Failed to save split allocation", "error");
      }
    } catch {
      toast("Error saving priority split allocation", "error");
    } finally {
      setIsLoadingSplit(false);
    }
  };

  const [camAcceptCapacityCount, setCamAcceptCapacityCount] = useState<number>(6);

  const handleSendCapacityRequest = async (interviewId: string) => {
    try {
      const data = await apiFetch("/api/interviews/capacity-request", {
        method: "POST",
        body: { interview_id: interviewId, cm_name: currentUserName }
      });
      if (data.success) {
        toast(data.message, "success");
        await queryClient.invalidateQueries({ queryKey: ["interviews"] });
        if (typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent("fp_interviews_updated"));
        }
      } else {
        toast(data.message || "Failed to send capacity request", "error");
      }
    } catch (err: any) {
      toast(err?.message || "Error sending capacity request", "error");
    }
  };

  const handleConvertToInternal = async (interviewId: string) => {
    try {
      const data = await apiFetch("/api/interviews", {
        method: "PATCH",
        body: { interview_id: interviewId, status: "pending_cm", type: "internal" }
      });
      if (data.success) {
        toast("Converted to Internal interview. You can now allocate campus mentors.", "success");
        await queryClient.invalidateQueries({ queryKey: ["interviews"] });
        if (typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent("fp_interviews_updated"));
        }
      } else {
        toast(data.message || "Failed to update interview", "error");
      }
    } catch (err: any) {
      toast(err?.message || "Failed to convert interview", "error");
    }
  };

  const handleCamCapacityResponse = async (interviewId: string, action: "accept_capacity" | "decline", capacity: number = 0) => {
    try {
      const data = await apiFetch("/api/interviews/cm-capacity-response", {
        method: "POST",
        body: {
          interview_id: interviewId,
          college_id: defaultCollegeId || "",
          cam_name: currentUserName,
          action,
          accepted_student_capacity: capacity
        }
      });
      if (data.success) {
        toast(data.message, "success");
        await queryClient.invalidateQueries({ queryKey: ["interviews"] });
        if (typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent("fp_interviews_updated"));
        }
      } else {
        toast(data.message || "Failed to submit capacity decision", "error");
      }
    } catch {
      toast("Error submitting capacity decision", "error");
    }
  };

  const handleFinalConfirm = async (interviewId: string, action: "cm_confirm" | "cam_confirm" | "cam_reject") => {
    try {
      const data = await apiFetch("/api/interviews/final-confirm", {
        method: "POST",
        body: {
          interview_id: interviewId,
          actor_role: currentUserRole,
          actor_name: currentUserName,
          action,
          college_id: defaultCollegeId || ""
        }
      });
      if (data.success) {
        toast(data.message, "success");
        await queryClient.invalidateQueries({ queryKey: ["interviews"] });
        if (typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent("fp_interviews_updated"));
        }
      } else {
        toast(data.message || "Failed to submit final confirmation", "error");
      }
    } catch {
      toast("Error submitting final confirmation", "error");
    }
  };

  const handleMarkComplete = async (interviewId: string) => {
    setIsMarkingComplete(interviewId);
    try {
      const data = await apiFetch("/api/interviews", {
        method: "PATCH",
        body: {
          interview_id: interviewId,
          status: "completed",
          cm_name: currentUserName,
        },
      });
      if (data.success) {
        toast("Interview verified & completed. Students notified!", "success");
        await queryClient.invalidateQueries({ queryKey: ["interviews"] });
        if (typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent("fp_interviews_updated"));
        }
      } else {
        toast(data.message || "Failed to mark complete.", "error");
      }
    } catch {
      toast("Error marking interview complete.", "error");
    } finally {
      setIsMarkingComplete(null);
    }
  };

  const handleDeleteInterview = async (interviewId: string) => {
    const ok = await showConfirm({
      message: "Delete this interview record? This cannot be undone.",
      danger: true,
      confirmLabel: "Delete"
    });
    if (!ok) return;
    if (deletingInterviewId) return;
    setDeletingInterviewId(interviewId);
    try {
      const data = await apiFetch(`/api/interviews?id=${encodeURIComponent(interviewId)}`, {
        method: "DELETE",
      });
      if (data.success) {
        toast("Interview record deleted successfully.", "success");
        await queryClient.invalidateQueries({ queryKey: ["interviews"] });
        if (typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent("fp_interviews_updated"));
        }
      } else {
        toast(data.message || "Failed to delete interview.", "error");
      }
    } catch {
      toast("Error deleting interview record.", "error");
    } finally {
      setDeletingInterviewId(null);
    }
  };

  // ── Excel Export for KAM, CM, and Mentor ────────────────────────────────────
  const handleExportInterviews = async () => {
    try {
      const XLSX = await import("xlsx");
      
      // 1. Interviews Sessions Sheet
      const sessionsRows = (interviewsList || []).map((iv, idx) => {
        const originCol = activeCollegesList.find(c => c.id === iv.origin_college_id || c.id === iv.college_id);
        const targetCol = activeCollegesList.find(c => c.id === iv.target_college_id);
        return {
          "S.No": idx + 1,
          "Interview ID": iv.id,
          "Campus": originCol?.name || iv.origin_college_id || iv.college_id || "—",
          "Target Campus": targetCol?.name || iv.target_college_id || "—",
          "Class Group / Cohort": iv.class_group || "—",
          "Subject": iv.subject || "—",
          "Type": iv.type ? (iv.type.charAt(0).toUpperCase() + iv.type.slice(1)) : "Internal",
          "Target Date": iv.target_date || (iv.created_at ? String(iv.created_at).split("T")[0] : "—"),
          "Time Slot": iv.preferred_start_time || "09:00 AM",
          "Requested Students": iv.student_count || iv.requested_students || 0,
          "Allocated Students": iv.allocated_students || (iv.student_slots?.length || 0),
          "Status": iv.status || "Pending",
          "Lead Evaluator": iv.evaluator_name || iv.mentor_name || "—",
          "Evaluator Role": iv.evaluator_role || "SME Evaluator",
          "GMeet / Video Link": iv.gmeet_link || "—",
          "Coverage Topics": iv.topics || "—",
          "Created Date": iv.created_at ? String(iv.created_at).split("T")[0] : "—"
        };
      });

      // 2. Candidate Evaluations Sheet
      const evalRows = (evaluationsList || []).map((ev, idx) => {
        const iv = (interviewsList || []).find(i => i.id === ev.interview_id);
        return {
          "S.No": idx + 1,
          "Student ID": ev.student_id || "—",
          "Student Name": ev.student_name || "—",
          "Register / Roll No": ev.register_number || ev.roll_number || "—",
          "Class Group": ev.class_group || iv?.class_group || "—",
          "Subject": iv?.subject || ev.subject || "—",
          "Interview Date": iv?.target_date || (ev.created_at ? String(ev.created_at).split("T")[0] : "—"),
          "Attendance": ev.attendance ? (ev.attendance.charAt(0).toUpperCase() + ev.attendance.slice(1)) : "Present",
          "Communication Score (1-10)": ev.communication_score ?? "—",
          "Content Score (1-10)": ev.content_score ?? "—",
          "Technical Score (1-10)": ev.technical_score ?? "—",
          "Confidence Score (1-10)": ev.confidence_score ?? "—",
          "Overall Score / Marks": ev.marks ?? ev.score ?? "—",
          "Result Status": ev.status || (Number(ev.marks) >= 6 ? "Cleared" : "Needs Improvement"),
          "Evaluator Name": ev.mentor_name || ev.evaluator_name || iv?.mentor_name || "—",
          "Evaluation Feedback": ev.feedback || ev.notes || "—"
        };
      });

      const workbook = XLSX.utils.book_new();

      const wsSessions = XLSX.utils.json_to_sheet(sessionsRows.length > 0 ? sessionsRows : [{ "Status": "No interview sessions recorded" }]);
      wsSessions["!cols"] = [
        { wch: 6 }, { wch: 22 }, { wch: 25 }, { wch: 25 }, { wch: 22 },
        { wch: 22 }, { wch: 12 }, { wch: 14 }, { wch: 14 }, { wch: 18 },
        { wch: 18 }, { wch: 22 }, { wch: 20 }, { wch: 18 }, { wch: 30 },
        { wch: 30 }, { wch: 14 }
      ];
      XLSX.utils.book_append_sheet(workbook, wsSessions, "Interview Sessions");

      if (evalRows.length > 0) {
        const wsEvals = XLSX.utils.json_to_sheet(evalRows);
        wsEvals["!cols"] = [
          { wch: 6 }, { wch: 16 }, { wch: 25 }, { wch: 20 }, { wch: 22 },
          { wch: 22 }, { wch: 14 }, { wch: 14 }, { wch: 25 }, { wch: 20 },
          { wch: 20 }, { wch: 22 }, { wch: 20 }, { wch: 18 }, { wch: 22 },
          { wch: 35 }
        ];
        XLSX.utils.book_append_sheet(workbook, wsEvals, "Student Evaluations");
      }

      const rolePrefix = isKAM ? "KAM_Region" : isCM ? "CAM_Campus" : "Mentor";
      const fileName = `${rolePrefix}_Interview_Audit_${new Date().toISOString().slice(0, 10)}.xlsx`;
      XLSX.writeFile(workbook, fileName);
      toast(`Exported interview report: ${fileName}`, "success");
    } catch (err: any) {
      console.error("Export error:", err);
      toast("Failed to export interview report: " + err.message, "error");
    }
  };

  // ── Derived Data ─────────────────────────────────────────────────────────────

  const pendingRequests = useMemo(() => {
    const currentCollegeId = defaultCollegeId || currentMentor?.college_id;
    return interviewsList
      .filter(i => {
        const s = (i.status || "").toLowerCase();
        if (s === "completed" || s === "rejected" || s === "no_capacity") {
          return false;
        }

        const isHost = i.college_id === currentCollegeId || i.origin_college_id === currentCollegeId;
        const myResponse = (i.cam_responses || []).find((r: any) => r.college_id === currentCollegeId);

        const totalReq = Number(i.student_count || i.requested_students || 10);
        const totalAlloc = Number(i.allocated_students || (i.student_slots?.length || 0));
        const totalAccepted = Number(i.accepted_capacity || 0);
        const remainingUnallocated = Math.max(0, totalReq - Math.max(totalAlloc, totalAccepted));

        // If all students are fully allocated (e.g. 47/47) AND status is assigned -> Fully done
        if (s === "assigned" && remainingUnallocated <= 0) {
          return false;
        }

        if (i.type === "internal") {
          // Internal requests are strictly inside this campus
          if (!isHost) return false;
          return (
            remainingUnallocated > 0 ||
            s.includes("pending") ||
            s === "capacity_partially_accepted" ||
            s === "priority_allocation" ||
            s === "draft"
          );
        } else {
          // External requests
          if (isHost) {
            return (
              remainingUnallocated > 0 ||
              s.includes("pending") ||
              s === "capacity_partially_accepted" ||
              s === "priority_allocation" ||
              s === "draft"
            );
          } else {
            // Partner CAM under same KAM:
            return remainingUnallocated > 0 && s !== "draft" && s !== "pending_origin_cm";
          }
        }
      })
      .sort((a, b) => {
        // Priority sort: external/urgent first
        const aIsExternal = a.type === "external";
        const bIsExternal = b.type === "external";
        if (aIsExternal && !bIsExternal) return -1;
        if (!aIsExternal && bIsExternal) return 1;
        return new Date(a.target_date || a.created_at || "").getTime() - new Date(b.target_date || b.created_at || "").getTime();
      });
  }, [interviewsList, defaultCollegeId, currentMentor]);

  const sessionStudents = (req: any) => {
    if (!req) return [];

    // Helper: detect auto-generated placeholder names like "Candidate #3" or "Student xyz123"
    const isPlaceholderName = (name?: string) =>
      !name ||
      /^Candidate\s*#?\d*$/i.test(name.trim()) ||
      /^Student\s+[a-f0-9]{6,}$/i.test(name.trim()); // matches "Student abc12345" stubs

    // ── Path 1: slots from DB ────────────────────────────────────────────────
    if (req.student_slots && req.student_slots.length > 0) {
      let slotsToRender = req.student_slots;

      // Mentor: only show their assigned slots
      if (isMentor && currentMentor?.id) {
        const mySlots = req.student_slots.filter((s: any) => s.mentor_id === currentMentor.id);
        if (mySlots.length > 0) {
          slotsToRender = mySlots;
        }
      }

      return slotsToRender.map((slot: any, idx: number) => {
        // Try to find a matching enrolled student by ID or name
        const enrolled = students.find((st: any) => {
          const slotStudentId = slot.student_id || slot.studentId;
          const slotStudentName = slot.student_name || slot.studentName;
          if (slotStudentId && (
            st.id === slotStudentId ||
            st.register_number === slotStudentId ||
            st.roll_number === slotStudentId
          )) return true;
          // Only match by name if slot has a real (non-placeholder) name
          if (slotStudentName && !isPlaceholderName(slotStudentName)) {
            return st.name?.toLowerCase().trim() === slotStudentName.toLowerCase().trim();
          }
          return false;
        });

        const slotStudentId = slot.student_id || slot.studentId;
        const slotStudentName = slot.student_name || slot.studentName;

        // Prefer enrolled record name; if not found use slot name (unless it's a stub)
        const resolvedName =
          enrolled?.name ||
          (!isPlaceholderName(slotStudentName) ? slotStudentName : null) ||
          (slotStudentId ? `ID: ${slotStudentId}` : `Student #${idx + 1}`);

        const resolvedRegNo =
          enrolled?.register_number ||
          enrolled?.roll_number ||
          slot.register_number ||
          slot.roll_number ||
          slotStudentId ||
          "";

        return {
          id: enrolled?.id || slotStudentId || (slot.id ? String(slot.id) : ""),
          name: resolvedName,
          register_number: resolvedRegNo,
          roll_number: resolvedRegNo,
          classGroup: enrolled?.classGroup || req.class_group || "Cohort",
          department: enrolled?.department || req.class_group || "Cohort",
          slotTime: slot.slot_start_time ? `${slot.slot_start_time} - ${slot.slot_end_time}` : undefined,
          gmeetLink: slot.gmeet_link || req.gmeet_link,
          mentorId: slot.mentor_id,
          mentorName: slot.mentor_name,
        };
      });
    }

    // ── Path 2: fallback — no slots yet, derive from students list ───────────
    let assignedCount = Math.max(1, Number(req?.allocated_students || req?.student_count || 10));

    if (isMentor && currentMentor?.id) {
      const assignedIds: string[] = req.assigned_mentor_ids ? JSON.parse(req.assigned_mentor_ids) : [];
      if (assignedIds.includes(currentMentor.id) && req.mentor_id !== currentMentor.id) {
        const myIndex = assignedIds.indexOf(currentMentor.id);
        const batchSize = 3;
        const startIdx = myIndex * batchSize;
        const cohortList = req.class_group
          ? students.filter((s: any) => {
              if (s.college_id && currentMentor?.college_id && s.college_id !== currentMentor.college_id) return false;
              const sCG = (s.classGroup || "").toLowerCase().trim();
              const sDept = (s.department || "").toLowerCase().trim();
              const reqCG = (req.class_group || "").toLowerCase().trim();
              return sCG === reqCG || sDept === reqCG || sCG.includes(reqCG) || reqCG.includes(sCG);
            })
          : students;
        const pool = cohortList.length > 0 ? cohortList : students;
        return pool.slice(startIdx, startIdx + batchSize).map((s: any) => ({
          ...s,
          register_number: s.register_number || s.roll_number || s.id,
          roll_number: s.register_number || s.roll_number || s.id,
        }));
      }
    }

    const filtered = students.filter((s: any) => {
      if (s.college_id && currentMentor?.college_id && s.college_id !== currentMentor.college_id) return false;
      const sCG = (s.classGroup || "").toLowerCase().trim();
      const sDept = (s.department || "").toLowerCase().trim();
      const reqCG = (req.class_group || "").toLowerCase().trim();
      return sCG === reqCG || sDept === reqCG || sCG.includes(reqCG) || reqCG.includes(sCG);
    });
    const listToSlice = filtered.length > 0 ? filtered : students;
    return listToSlice.slice(0, assignedCount).map((s: any) => ({
      ...s,
      register_number: s.register_number || s.roll_number || s.id,
      roll_number: s.register_number || s.roll_number || s.id,
    }));
  };

  const subjectMentorsForReq = (req: any) =>
    campusMentors.filter(m =>
      (m.subjects || "").toLowerCase().includes((req?.subject || "").toLowerCase().trim())
    );

  const getEvalForStudent = (interviewId: string, studentId?: string, studentName?: string) => {
    const rawIntId = String(interviewId || "").trim().toLowerCase();
    const cleanStdId = String(studentId || "").trim().toLowerCase();
    const cleanStdName = String(studentName || "").trim().toLowerCase();
    const isPlaceholder = isCandidatePlaceholder(studentName);

    return evaluationsList.find(ev => {
      const evIntId = String(ev.interview_id || "").trim().toLowerCase();
      const intMatches = evIntId === rawIntId || (ev.id && rawIntId && String(ev.id).toLowerCase().startsWith(`eval_${rawIntId}_`));
      if (!intMatches) return false;

      // 1. Direct student_id match
      if (cleanStdId && ev.student_id && String(ev.student_id).trim().toLowerCase() === cleanStdId) return true;
      // 2. Eval ID pattern: eval_{interview_id}_{student_id} or ends with student_id
      if (cleanStdId && ev.id) {
        const evIdLower = String(ev.id).toLowerCase();
        if (evIdLower === `eval_${rawIntId}_${cleanStdId}` || evIdLower.endsWith(`_${cleanStdId}`)) return true;
      }
      // 3. Name match (case-insensitive, only real names)
      if (!isPlaceholder && cleanStdName && ev.student_name) {
        const evNameLower = String(ev.student_name).trim().toLowerCase();
        if (evNameLower === cleanStdName) return true;
        if (cleanStdName.length > 3 && evNameLower.length > 3) {
          if (cleanStdName.includes(evNameLower) || evNameLower.includes(cleanStdName)) return true;
        }
      }
      return false;
    });
  };

  // Filtered student list for Evaluation drawer
  const activeReq = interviewsList.find(i => i.id === expandedRequest);
  const activeStudentsList = useMemo(() => {
    if (!activeReq) return [];
    let list = sessionStudents(activeReq);

    // Search query filter
    if (studentSearchQuery.trim()) {
      const q = studentSearchQuery.toLowerCase().trim();
      list = list.filter((s: any) => (s.name || "").toLowerCase().includes(q) || (s.roll_number || s.register_number || "").toLowerCase().includes(q));
    }

    // Status filter
    if (studentStatusFilter === "pending") {
      list = list.filter((s: any) => !getEvalForStudent(activeReq.id, s.id, s.name));
    } else if (studentStatusFilter === "evaluated") {
      list = list.filter((s: any) => Boolean(getEvalForStudent(activeReq.id, s.id, s.name)));
    } else if (studentStatusFilter === "cleared") {
      list = list.filter((s: any) => {
        const ev = getEvalForStudent(activeReq.id, s.id, s.name);
        return ev && (ev.status === "Cleared" || (ev.status || "").toLowerCase().includes("clear"));
      });
    }

    return list;
  }, [activeReq, students, studentSearchQuery, studentStatusFilter, evaluationsList]);

  // ── UI RENDER ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-5 font-sans">

      {/* Header Container (Shadcn Card Style) */}
      <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-card">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-[#4F46E5] mb-1">
              <Award className="w-3.5 h-3.5" />
              FACE PREP E-CAMPUS • INTERVIEW MODULE
            </div>
            <h1 className="text-lg font-black text-slate-800 tracking-tight">
              {isMentor ? "Subject Interviews & Student Evaluation"
                : isCM ? "Campus Interview Management & Allocation"
                : "Interview Region Overview"}
            </h1>
            <p className="text-xs text-slate-500 mt-0.5 font-medium">
              {isMentor
                ? "Schedule interview dates, track session calendars, and evaluate students."
                : isCM
                ? "Manage requests, allocate faculty mentors, and verify completed sessions."
                : "Monitor campus interview schedules and regional performance metrics."}
            </p>
          </div>

          {/* Navigation Pill Bar (Shadcn Tabs) */}
          <div className="flex items-center gap-1 p-1 bg-slate-100/90 rounded-xl border border-slate-200/80 shrink-0 backdrop-blur-xs">
            {isMentor && (
              <>
                {[
                  { key: "raise", label: "Raise Request", icon: <Plus className="w-3 h-3" /> },
                  { key: "myinterviews", label: "My Sessions", icon: <FileText className="w-3 h-3" /> },
                  { key: "calendar", label: "Calendar View", icon: <Calendar className="w-3 h-3" /> },
                ].map(tab => (
                  <button
                    key={tab.key}
                    onClick={() => setActiveTab(tab.key)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                      activeTab === tab.key
                        ? "bg-white shadow-2xs border border-slate-200/80 text-[#4F46E5]"
                        : "text-slate-500 hover:text-slate-700"
                    }`}
                  >
                    {tab.icon}{tab.label}
                  </button>
                ))}
              </>
            )}

            {isCM && (
              <>
                {[
                  { key: "pending", label: "Pending Allocations", icon: <Layers className="w-3 h-3" />, count: pendingRequests.length },
                  { key: "calendar", label: "Calendar Schedule", icon: <Calendar className="w-3 h-3" /> },
                  { key: "all", label: "All Campus", icon: <BarChart3 className="w-3 h-3" /> },
                ].map(tab => (
                  <button
                    key={tab.key}
                    onClick={() => setActiveTab(tab.key)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                      activeTab === tab.key
                        ? "bg-white shadow-2xs border border-slate-200/80 text-[#4F46E5]"
                        : "text-slate-500 hover:text-slate-700"
                    }`}
                  >
                    {tab.icon}{tab.label}
                    {tab.count != null && tab.count > 0 && (
                      <span className="bg-[#4F46E5] text-white text-[9px] font-black px-1.5 py-0.5 rounded-full">
                        {tab.count}
                      </span>
                    )}
                  </button>
                ))}
              </>
            )}

            {isKAM && (
              <>
                <button
                  onClick={() => setActiveTab("overview")}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    activeTab === "overview" ? "bg-white shadow-2xs border border-slate-200/80 text-[#4F46E5]" : "text-slate-500"
                  }`}
                >
                  <ShieldCheck className="w-3 h-3" />Overview
                </button>
                <button
                  onClick={() => setActiveTab("calendar")}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    activeTab === "calendar" ? "bg-white shadow-2xs border border-slate-200/80 text-[#4F46E5]" : "text-slate-500"
                  }`}
                >
                  <Calendar className="w-3 h-3" />Calendar
                </button>
              </>
            )}

            <button
              type="button"
              onClick={handleExportInterviews}
              disabled={interviewsList.length === 0}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 text-xs font-extrabold transition-all cursor-pointer shadow-2xs disabled:opacity-40 disabled:cursor-not-allowed"
              title="Export Interview Sessions & Evaluations to Excel"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
              <span>Export (.xlsx)</span>
            </button>

            <button onClick={() => interviewsQuery.refetch()} className="p-1.5 rounded-lg text-slate-400 hover:text-[#4F46E5] hover:bg-white transition-all border border-transparent hover:border-slate-200 cursor-pointer" title="Refresh">
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* ── MENTOR: Raise Request ── */}
      {isMentor && activeTab === "raise" && (
        <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-card">
          <div className="flex items-center gap-2 mb-5">
            <BookOpen className="w-4 h-4 text-[#4F46E5]" />
            <h2 className="text-sm font-black text-slate-800">Raise New Interview Request</h2>
          </div>

          {/* Tamil-only notice */}
          {isOnlyTamil && (
            <div className="bg-amber-50 border border-amber-200/80 rounded-xl p-4 flex gap-3 text-xs text-amber-800 mb-5">
              <Info className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
              <div>
                <strong>Notice:</strong> Interview Module features are omitted for Tamil language subjects. You do not need to raise interview requests for Tamil.
              </div>
            </div>
          )}

          {!isOnlyTamil && (
            <form onSubmit={handleRaiseRequest} className="space-y-5">
              {/* Internal/External toggle */}
              <div className="grid grid-cols-2 gap-3 max-w-sm bg-slate-100 p-1.5 rounded-xl border border-slate-200/80">
                {(["internal", "external"] as const).map(mode => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setActiveMode(mode)}
                    className={`flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-extrabold transition-all ${
                      activeMode === mode
                        ? "bg-white shadow-2xs border border-slate-200/80 text-[#4F46E5]"
                        : "text-slate-500 hover:text-slate-700"
                    }`}
                  >
                    {mode === "internal" ? <Building className="w-3.5 h-3.5" /> : <Video className="w-3.5 h-3.5" />}
                    {mode === "internal" ? "Internal Session" : "External (GMeet)"}
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Subject */}
                <div className="space-y-1">
                  <label className="text-[10px] text-slate-400 uppercase font-bold tracking-wider block">
                    Subject <span className="text-[#4F46E5]">(Assigned Only)</span>
                  </label>
                  <select
                    aria-label="Subject (Assigned Only)"
                    value={selectedSubject}
                    onChange={e => setSelectedSubject(e.target.value)}
                    className="w-full p-2.5 border border-slate-200 rounded-xl bg-white text-xs font-semibold focus:ring-1 focus:ring-indigo-500 outline-none cursor-pointer"
                  >
                    {mentorSubjects.length === 0
                      ? <option value="">No non-Tamil subjects assigned</option>
                      : mentorSubjects.map(s => <option key={s} value={s}>{s}</option>)
                    }
                  </select>
                </div>

                {/* Class Group */}
                <div className="space-y-1">
                  <label className="text-[10px] text-slate-400 uppercase font-bold tracking-wider block">Class / Cohort</label>
                  <select
                    aria-label="Class / Cohort"
                    value={selectedClassGroup}
                    onChange={e => setSelectedClassGroup(e.target.value)}
                    className="w-full p-2.5 border border-slate-200 rounded-xl bg-white text-xs font-semibold focus:ring-1 focus:ring-indigo-500 outline-none cursor-pointer"
                  >
                    {mentorClasses.map(c => {
                      const formatted = c === "III BCA" ? "BCA - Semester 5" : (c.includes("Sem") || c.includes("Year") ? c : `${c} - Semester 5`);
                      return <option key={c} value={c}>{formatted}</option>;
                    })}
                  </select>
                </div>

                {/* Target Date */}
                <div className="space-y-1">
                  <label className="text-[10px] text-slate-400 uppercase font-bold tracking-wider block">
                    Target Date <span className="text-[#4F46E5]">(Min +2 Days)</span>
                  </label>
                  <input
                    type="date" min={minTargetDate} value={targetDate}
                    aria-label="Target Date (Min +2 Days)"
                    onChange={e => setTargetDate(e.target.value)}
                    className={`w-full p-2.5 border rounded-xl bg-white text-xs font-semibold focus:ring-1 outline-none cursor-pointer ${
                      targetDate && getExamDayInfo(targetDate)
                        ? "border-rose-400 focus:ring-rose-500 bg-rose-50/40 text-rose-900"
                        : "border-slate-200 focus:ring-indigo-500 text-slate-800"
                    }`}
                    required
                  />
                  {targetDate && getExamDayInfo(targetDate) && (
                    <div className="p-2 bg-rose-50 border border-rose-200 rounded-lg text-rose-700 text-[11px] font-bold flex items-center gap-1.5 mt-1 animate-fadeIn">
                      <AlertTriangle className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                      <span>Exam Day: {getExamDayInfo(targetDate)}. Interviews cannot be scheduled during exams.</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Informative Roster & Scheduling Banner */}
              <div className="bg-slate-50 border border-slate-100 rounded-xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-slate-700">
                <div className="flex items-center gap-2 font-bold">
                  <div className="p-1.5 rounded-lg bg-indigo-50 text-indigo-600">
                    <Users className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="text-slate-500 text-[10px] uppercase font-bold block">Enrolled Roster</span>
                    <span className="text-slate-900 font-black">
                      {(() => {
                        const count = students.filter(s => {
                          if (s.college_id && currentMentor?.college_id && s.college_id !== currentMentor.college_id) return false;
                          const cleanSel = (selectedClassGroup || "").trim().toLowerCase();
                          const sCG = (s.classGroup || "").trim().toLowerCase();
                          const sDept = (s.department || "").trim().toLowerCase();
                          return sCG === cleanSel || sDept === cleanSel || sCG.includes(cleanSel) || cleanSel.includes(sCG);
                        }).length;
                        return `${count} Students in Cohort`;
                      })()}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-[10px] font-bold text-slate-500 bg-white px-3 py-1.5 rounded-lg border border-slate-200/80">
                  <Clock className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                  <span>Time slots will be scheduled by Campus Manager based on mentor free period schedules</span>
                </div>
              </div>

              {/* Topics */}
              <div className="space-y-1">
                <label className="text-[10px] text-slate-400 uppercase font-bold tracking-wider block">
                  Topics / Coverage Areas
                </label>
                <textarea
                  aria-label="Topics / Coverage Areas"
                  rows={3} value={topics}
                  onChange={e => setTopics(e.target.value)}
                  placeholder="e.g. Data Structures, React State Management, System Architecture, Algorithm Complexity"
                  className="w-full p-2.5 border border-slate-200 rounded-xl bg-white text-xs font-medium focus:ring-1 focus:ring-indigo-500 outline-none placeholder-slate-300 resize-none"
                  required
                />
              </div>

              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={isSubmitting || mentorSubjects.length === 0}
                  className="btn-gradient flex items-center gap-2 px-6 py-2.5 rounded-xl text-xs font-extrabold disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSubmitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                  {isSubmitting ? "Submitting..." : `Submit ${activeMode === "external" ? "External" : "Internal"} Request`}
                </button>
              </div>
            </form>
          )}
        </div>
      )}

      {/* ── INTERACTIVE CALENDAR VIEW ── */}
      {activeTab === "calendar" && (
        <div className="space-y-4">
          <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-card">
            {/* Calendar Controls */}
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <div className="flex items-center gap-3">
                <h2 className="text-sm font-black text-slate-800 flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-[#4F46E5]" />
                  {calendarViewFilter === "today" 
                    ? `Today's Schedule & Marking — ${getTodayLocalStr()}`
                    : `Interview Schedule Calendar & Marking — ${calendarMonth.toLocaleDateString("en-US", { month: "long", year: "numeric" })}`}
                </h2>
              </div>

              <div className="flex items-center gap-2">
                {/* View Filter Pill Switch */}
                <div className="inline-flex p-0.5 rounded-lg bg-slate-100 border border-slate-200 text-xs font-bold">
                  <button
                    onClick={() => setCalendarViewFilter("all")}
                    className={`px-3 py-1 rounded-md transition-all cursor-pointer ${
                      calendarViewFilter === "all" ? "bg-white text-[#4F46E5] shadow-2xs font-extrabold" : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    Full Month Grid
                  </button>
                  <button
                    onClick={() => {
                      setCalendarViewFilter("today");
                      setSelectedCalendarDate(getTodayLocalStr());
                    }}
                    className={`px-3 py-1 rounded-md transition-all cursor-pointer ${
                      calendarViewFilter === "today" ? "bg-[#4F46E5] text-white shadow-2xs font-extrabold" : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    Today Only ({scheduledInterviewsByDate[getTodayLocalStr()]?.length || 0})
                  </button>
                </div>

                {calendarViewFilter === "all" && (
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => {
                        const prev = new Date(calendarMonth);
                        prev.setMonth(prev.getMonth() - 1);
                        setCalendarMonth(prev);
                      }}
                      className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-600 transition-all cursor-pointer"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => {
                        const today = new Date();
                        setCalendarMonth(today);
                        setSelectedCalendarDate(getTodayLocalStr());
                      }}
                      className="px-3 py-1 rounded-lg bg-[#4F46E5] text-white hover:bg-[#4338CA] text-xs font-extrabold transition-all cursor-pointer shadow-2xs"
                    >
                      Today
                    </button>
                    <button
                      onClick={() => {
                        const next = new Date(calendarMonth);
                        next.setMonth(next.getMonth() + 1);
                        setCalendarMonth(next);
                      }}
                      className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-600 transition-all cursor-pointer"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Calendar Grid Header */}
            <div className="grid grid-cols-7 gap-1 text-center font-bold text-[10px] text-slate-400 uppercase tracking-wider mb-2">
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(day => (
                <div key={day} className="py-1">{day}</div>
              ))}
            </div>

            {/* Calendar Grid Body */}
            <div className="grid grid-cols-7 gap-1.5">
              {calendarDays.map((day, idx) => {
                const dayInterviews = scheduledInterviewsByDate[day.dateStr] || [];
                const dayExamInfo = getExamDayInfo(day.dateStr);
                const isSelected = selectedCalendarDate === day.dateStr;
                const nowD = new Date();
                const todayStr = `${nowD.getFullYear()}-${String(nowD.getMonth() + 1).padStart(2, "0")}-${String(nowD.getDate()).padStart(2, "0")}`;
                const isToday = day.dateStr === todayStr;

                return (
                  <div
                    key={idx}
                    onClick={() => setSelectedCalendarDate(day.dateStr)}
                    className={`min-h-[105px] p-2 rounded-xl border transition-all cursor-pointer flex flex-col justify-between ${
                      isSelected
                        ? "border-[#4F46E5] bg-pink-50/40 ring-2 ring-[#4F46E5]/40 shadow-xs"
                        : dayExamInfo
                        ? "bg-purple-50/30 border-purple-200 hover:border-purple-300"
                        : day.isCurrentMonth
                        ? "bg-white border-slate-200/90 hover:border-indigo-300 hover:shadow-xs"
                        : "bg-slate-50/50 border-slate-100 text-slate-300"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className={`text-xs font-extrabold ${
                        isToday
                          ? "bg-[#4F46E5] text-white px-2 py-0.5 rounded-full text-[10px] shadow-xs"
                          : day.isCurrentMonth ? "text-slate-700" : "text-slate-300"
                      }`}>
                        {day.dayNum}
                      </span>
                      <div className="flex items-center gap-1">
                        {dayExamInfo && (
                          <span className="text-[8px] font-black bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded border border-purple-200" title={dayExamInfo}>
                            EXAM
                          </span>
                        )}
                        {dayInterviews.length > 0 && (
                          <span className="text-[9px] font-black bg-[#4F46E5]/10 text-[#4F46E5] px-1.5 py-0.5 rounded-full border border-[#4F46E5]/20">
                            {dayInterviews.length}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Interview Badges & Exam indicator inside Calendar Day Cell */}
                    <div className="space-y-1 mt-1.5">
                      {dayExamInfo && (
                        <div className="text-[8.5px] font-bold text-purple-800 bg-purple-100/70 border border-purple-200 px-1 py-0.5 rounded truncate" title={dayExamInfo}>
                          📝 {dayExamInfo}
                        </div>
                      )}
                      {dayInterviews.slice(0, 2).map((inv: any) => (
                        <div
                          key={inv.id}
                          className={`text-[9px] font-bold p-1 rounded-md truncate flex items-center justify-between gap-1 shadow-2xs ${
                            inv.status === "completed"
                              ? "bg-emerald-100/90 text-emerald-900 border border-emerald-300/80"
                              : inv.status === "declined" || inv.status === "cancelled"
                              ? "bg-rose-100/90 text-rose-900 border border-rose-300/80"
                              : inv.type === "external"
                              ? "bg-purple-100/90 text-purple-900 border border-purple-300/80"
                              : "bg-blue-100/90 text-blue-900 border border-blue-300/80"
                          }`}
                        >
                          <span className="truncate">{inv.subject}</span>
                          {inv.type === "external" && (
                            <span className="text-[8px] font-black text-purple-700 bg-purple-200/80 px-1 rounded">EXT</span>
                          )}
                        </div>
                      ))}
                      {dayInterviews.length > 2 && (
                        <div className="text-[8px] font-bold text-slate-400 pl-1">+{dayInterviews.length - 2} more</div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── MODAL POPUP DIALOG FOR SELECTED CALENDAR DATE ── */}
          {selectedCalendarDate && (
            <Dialog
              open={true}
              onOpenChange={(next) => { if (!next) setSelectedCalendarDate(null); }}
              ariaLabel="Scheduled Interviews & Session Details"
              overlayClassName="bg-slate-950/60 backdrop-blur-sm transition-all duration-200"
              panelClassName="max-w-2xl p-6 space-y-4 max-h-[85vh] flex flex-col justify-between rounded-2xl"
            >
                {/* Modal Header */}
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 rounded-xl bg-pink-50 text-[#4F46E5] border border-pink-200/60">
                      <Calendar className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-sm font-black text-slate-800 flex items-center gap-2">
                        Scheduled Interviews & Session Details
                      </h3>
                      <p className="text-xs text-slate-500 font-medium">
                        Target Date: <span className="text-[#4F46E5] font-bold">{selectedCalendarDate}</span>
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setSelectedCalendarDate(null)}
                    aria-label="Close scheduled interviews"
                    className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-all cursor-pointer"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {/* Modal Scrollable Body */}
                <div className="overflow-y-auto pr-1 space-y-3 flex-1 max-h-[60vh]">
                  {getExamDayInfo(selectedCalendarDate) && (
                    <div className="p-3 bg-purple-50 border border-purple-200 rounded-xl text-purple-900 font-bold text-xs flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 text-purple-600 shrink-0" />
                      <span>Exam Day Notice: This date is configured for exams ({getExamDayInfo(selectedCalendarDate)}). Interviews are not conducted on exam days.</span>
                    </div>
                  )}

                  {(!scheduledInterviewsByDate[selectedCalendarDate] || scheduledInterviewsByDate[selectedCalendarDate].length === 0) ? (
                    <div className="p-8 text-center bg-slate-50 rounded-xl border border-slate-100 space-y-2">
                      <Calendar className="w-8 h-8 text-slate-300 mx-auto" />
                      <p className="text-xs text-slate-500 font-medium">No interview sessions scheduled for this date ({selectedCalendarDate}).</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 gap-3">
                      {scheduledInterviewsByDate[selectedCalendarDate].map((inv: any) => (
                        <div key={inv.id} className="p-4 rounded-xl border border-slate-100 bg-slate-50/60 hover:border-indigo-200 transition-all space-y-2.5 shadow-2xs">
                          <div className="flex items-center justify-between gap-2">
                            <StatusBadge status={inv.status} />
                            <span className={`text-[10px] font-black px-2.5 py-0.5 rounded-full border ${
                              inv.type === "external" ? "bg-purple-50 text-purple-700 border-purple-200" : "bg-blue-50 text-blue-700 border-blue-200"
                            }`}>
                              {(inv.type || "internal").toUpperCase()}
                            </span>
                          </div>
                          <div className="font-extrabold text-slate-800 text-sm sm:text-base">{inv.subject}</div>
                          <div className="text-xs text-slate-600 grid grid-cols-1 sm:grid-cols-2 gap-1.5 bg-white p-3 rounded-2xl border border-slate-100 shadow-card">
                            <div>Cohort: <strong className="text-slate-800">{inv.class_group || "All Classes"}</strong></div>
                            <div>Requested By: <strong className="text-slate-800">{inv.mentor_name}</strong></div>
                            <div>Target Count: <strong className="text-slate-800">{inv.student_count || 10} Students</strong></div>
                            <div>Topics: <strong className="text-slate-800">{inv.topics || "General Review"}</strong></div>
                          </div>
                          {inv.type === "internal" ? (
                            <span className="inline-flex items-center gap-1.5 text-xs text-teal-800 font-bold bg-teal-50 px-3 py-1.5 rounded-lg border border-teal-200">
                              <User className="w-3.5 h-3.5 text-teal-600" /> In-Person Campus Evaluation
                            </span>
                          ) : inv.gmeet_link ? (
                            <a 
                              href={inv.gmeet_link} 
                              target="_blank" 
                              rel="noreferrer" 
                              className="inline-flex items-center gap-1.5 text-xs text-white font-bold bg-emerald-600 hover:bg-emerald-700 px-3.5 py-1.5 rounded-lg transition-all shadow-xs cursor-pointer"
                            >
                              <Video className="w-3.5 h-3.5" /> Join Google Meet Link →
                            </a>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Modal Footer */}
                <div className="border-t border-slate-100 pt-3 flex items-center justify-end">
                  <button
                    onClick={() => setSelectedCalendarDate(null)}
                    className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-all cursor-pointer"
                  >
                    Close Popup
                  </button>
                </div>
            </Dialog>
          )}

          {/* ── PRIORITY SPLIT & REGIONAL OVERFLOW CALCULATOR MODAL ── */}
          {activeSplitInterview && (
            <Dialog
              open={true}
              onOpenChange={(next) => { if (!next) { setActiveSplitInterview(null); setSplitPreviewResult(null); } }}
              ariaLabel="Regional Priority Split & Overflow Calculator"
              overlayClassName="bg-slate-950/60 backdrop-blur-sm transition-all animate-fadeIn"
              panelClassName="max-w-2xl p-6 space-y-4 max-h-[85vh] flex flex-col justify-between rounded-2xl"
            >
                {/* Modal Header */}
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 rounded-xl bg-pink-50 text-[#4F46E5] border border-pink-200/60">
                      <Sparkles className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-sm font-black text-slate-800 flex items-center gap-2">
                        Regional Priority Split & Overflow Calculator
                      </h3>
                      <p className="text-xs text-slate-500 font-medium">
                        15 Min / Student Rule — <span className="text-[#4F46E5] font-bold">{activeSplitInterview.subject}</span> ({activeSplitInterview.student_count || 10} Students)
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => { setActiveSplitInterview(null); setSplitPreviewResult(null); }}
                    aria-label="Close priority split calculator"
                    className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-all cursor-pointer"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {/* Modal Body */}
                <div className="overflow-y-auto pr-1 space-y-3 flex-1 max-h-[60vh]">
                  {isLoadingSplit ? (
                    <div className="p-10 text-center text-xs font-semibold text-slate-500 flex items-center justify-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin text-[#4F46E5]" /> Calculating optimal regional mentor slots & free period availability...
                    </div>
                  ) : splitPreviewResult ? (
                    <div className="space-y-3">
                      {/* Calculation Summary Card */}
                      <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-100 flex items-center justify-between">
                        <div>
                          <div className="text-[10px] uppercase font-bold text-slate-400">Total Duration Calculation</div>
                          <div className="text-sm font-black text-slate-800">
                            {splitPreviewResult.formattedTotalDuration} <span className="text-xs text-slate-500 font-normal">({activeSplitInterview.student_count || 10} × 15 mins)</span>
                          </div>
                        </div>
                        {splitPreviewResult.overflowOccurred && (
                          <span className="text-[10px] font-black bg-amber-100 text-amber-800 px-2.5 py-1 rounded-full border border-amber-300 flex items-center gap-1">
                            <AlertTriangle className="w-3 h-3" /> Overflow Slot Cascaded
                          </span>
                        )}
                      </div>

                      {/* Split Allocation Segment Cards */}
                      <div className="space-y-2">
                        <div className="text-xs font-black text-slate-700">Proposed Priority Split Segments:</div>
                        {splitPreviewResult.allocations.map((alloc: any, idx: number) => (
                          <div key={idx} className="p-3.5 rounded-2xl border border-slate-100 bg-white shadow-card space-y-1.5">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-extrabold text-slate-800">Segment #{idx + 1}: {alloc.mentor_name}</span>
                              <span className="text-[10px] font-black bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-md border border-indigo-200">
                                {alloc.allocated_student_count} Students ({alloc.duration_minutes} Mins)
                              </span>
                            </div>
                            <div className="text-xs text-slate-500 flex flex-wrap items-center gap-x-4 gap-y-1">
                              <span>Campus: <strong className="text-slate-700">{alloc.target_college_name}</strong></span>
                              <span>Time Window: <strong className="text-[#4F46E5]">{alloc.start_time} - {alloc.end_time}</strong></span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>

                {/* Modal Footer */}
                <div className="border-t border-slate-100 pt-3 flex items-center justify-end gap-2">
                  <button
                    onClick={() => { setActiveSplitInterview(null); setSplitPreviewResult(null); }}
                    className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-all cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSavePrioritySplit}
                    disabled={isLoadingSplit || !splitPreviewResult}
                    className="btn-gradient px-5 py-2 rounded-xl text-xs font-extrabold text-white flex items-center gap-1.5 disabled:opacity-50 cursor-pointer shadow-xs"
                  >
                    {isLoadingSplit ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                    Execute & Save Split Allocation
                  </button>
                </div>
            </Dialog>
          )}
        </div>
      )}

      {/* ── MENTOR: My Interviews & Evaluate (Shadcn Split Screen) ── */}
      {isMentor && activeTab === "myinterviews" && (
        <div className="space-y-4">
          {/* Top Stats Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "Total Sessions", value: interviewsList.length, color: "text-slate-800" },
              { label: "Pending CM", value: interviewsList.filter(i => (i.status || "").includes("pending")).length, color: "text-amber-700" },
              { label: "Assigned", value: interviewsList.filter(i => i.status === "assigned" || i.status === "pending_verification" || (Array.isArray(i.student_slots) && i.student_slots.length > 0)).length, color: "text-blue-700" },
              { label: "Completed", value: interviewsList.filter(i => i.status === "completed").length, color: "text-emerald-700" },
            ].map(stat => (
              <div key={stat.label} className="bg-white border border-slate-100 rounded-2xl p-4 shadow-card text-center">
                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{stat.label}</div>
                <div className={`text-2xl font-black mt-1 ${stat.color}`}>{stat.value}</div>
              </div>
            ))}
          </div>

          {isLoading ? (
            <div className="bg-white border border-slate-100 rounded-2xl p-10 text-center text-sm text-slate-400 flex items-center justify-center gap-2 shadow-card">
              <Loader2 className="w-4 h-4 animate-spin text-[#4F46E5]" /> Loading session records...
            </div>
          ) : interviewsList.length === 0 ? (
            <div className="bg-white border border-slate-100 rounded-2xl p-10 text-center shadow-card">
              <BookOpen className="w-8 h-8 text-slate-300 mx-auto mb-2" />
              <p className="text-sm font-semibold text-slate-500">No interview sessions found.</p>
              <p className="text-xs text-slate-400 mt-1">Use the "Raise Request" tab to create your first interview request.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {interviewsList.map(req => {
                const isExpanded = expandedRequest === req.id;
                const reqStudents = sessionStudents(req);
                const isRaiser = req.mentor_id === currentMentor?.id;
                const isExternal = req.type === "external";
                const hasAssignedSlotsAsEvaluator = Boolean(
                  (req.student_slots && req.student_slots.some((s: any) => s.mentor_id === currentMentor?.id)) ||
                  (req.assigned_mentor_ids && (
                    Array.isArray(req.assigned_mentor_ids)
                      ? req.assigned_mentor_ids.includes(currentMentor?.id)
                      : String(req.assigned_mentor_ids).includes(currentMentor?.id || "")
                  ))
                );
                const isAssigned = req.status === "assigned" || req.status === "partial_capacity" || req.status === "pending_verification" || req.status === "completed" || (hasAssignedSlotsAsEvaluator && reqStudents.length > 0);
                const evaluatedCount = reqStudents.filter((st: any) => Boolean(getEvalForStudent(req.id, st.id))).length;
                const progressPct = reqStudents.length > 0 ? Math.round((evaluatedCount / reqStudents.length) * 100) : 0;

                // Only assigned evaluators (or internal session instructors / CM) can grade
                const canEvaluate = hasAssignedSlotsAsEvaluator || (!isExternal && isRaiser) || isCM || isKAM;

                return (
                  <div key={req.id} className="bg-white border border-slate-100 rounded-2xl shadow-card overflow-hidden">
                    <div className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-2 flex-wrap">
                          <StatusBadge status={req.status || "pending_cm"} />
                          <ConductedStatusBadge
                            status={req.status || "pending_cm"}
                            required={req.required_students || req.student_count}
                            allocated={req.allocated_students}
                            evaluated={req.evaluated_students || evaluatedCount}
                            verified={req.verified_students}
                          />
                          <span className={`text-[10px] font-black px-2 py-0.5 rounded-full border ${
                            req.type === "external"
                              ? "bg-purple-50 text-purple-700 border-purple-200"
                              : "bg-blue-50 text-blue-700 border-blue-200"
                          }`}>
                            {(req.type || "internal").toUpperCase()}
                          </span>
                          {isRaiser && isExternal && (
                            <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-300">
                              Host Raiser • External Faculty Evaluating
                            </span>
                          )}
                          {hasAssignedSlotsAsEvaluator && (
                            <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">
                              Evaluator ({reqStudents.length} Candidates)
                            </span>
                          )}
                        </div>
                        <div className="font-black text-slate-800 text-sm">{req.subject}</div>
                        <div className="text-xs text-slate-500 flex flex-wrap gap-x-4 gap-y-0.5 font-medium">
                          <span className="flex items-center gap-1"><GraduationCap className="w-3 h-3 text-[#4F46E5]" />{req.class_group || "All Classes"}</span>
                          <span className="flex items-center gap-1"><Calendar className="w-3 h-3 text-[#4F46E5]" />{req.target_date || "Date TBD"}</span>
                          <span className="flex items-center gap-1"><Users className="w-3 h-3 text-[#4F46E5]" />
                            {reqStudents.length > 0 ? `${evaluatedCount}/${reqStudents.length} Evaluated` : "Count Pending CM"}
                          </span>
                          {req.type === "internal" ? (
                            <span className="flex items-center gap-1 text-teal-700 font-bold">
                              <User className="w-3 h-3 text-teal-600" /> In-Person (Campus)
                            </span>
                          ) : req.gmeet_link ? (
                            <a href={req.gmeet_link} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-indigo-600 font-bold hover:underline">
                              <Video className="w-3 h-3" /> Meet Live
                            </a>
                          ) : null}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0 flex-wrap">
                        <button
                          onClick={() => openRosterModal(req, "students")}
                          className="flex items-center gap-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-extrabold px-3 py-2 rounded-xl transition-all cursor-pointer border border-slate-200 shadow-2xs"
                        >
                          <Users className="w-3.5 h-3.5 text-indigo-600" />
                          {isRaiser && isExternal ? "View Roster & External Scores" : "Student Conducted Roster"}
                        </button>
                        {req.type !== "internal" && (req.gmeet_link || (req.student_slots || []).find((s: any) => s.gmeet_link)?.gmeet_link) && (
                          <a
                            href={req.gmeet_link || (req.student_slots || []).find((s: any) => s.gmeet_link)?.gmeet_link}
                            target="_blank"
                            rel="noreferrer"
                            className="flex items-center gap-1.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-extrabold px-3.5 py-2 rounded-xl transition-all cursor-pointer shadow-2xs"
                          >
                            <Video className="w-3.5 h-3.5 text-emerald-400" />
                            <span>Join Meet</span>
                            <ExternalLink className="w-3 h-3 opacity-60" />
                          </a>
                        )}
                        {isAssigned && canEvaluate && (
                          <button
                            onClick={() => {
                              if (isExpanded) {
                                setExpandedRequest(null); setSelectedStudent(null);
                              } else {
                                setExpandedRequest(req.id); setSelectedStudent(null);
                              }
                            }}
                            className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-extrabold px-4 py-2 rounded-xl transition-all cursor-pointer shrink-0 shadow-2xs"
                          >
                            <Award className="w-3.5 h-3.5" />
                            {isExpanded ? "Close Evaluation" : (hasAssignedSlotsAsEvaluator ? `Evaluate My Candidates (${reqStudents.length})` : "Evaluate Students")}
                            {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                          </button>
                        )}
                        {(req.status?.includes("pending") || isKAM || isCM) && (
                          <button
                            onClick={() => handleDeleteInterview(req.id)}
                            disabled={deletingInterviewId === req.id}
                            title="Delete Request"
                            className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all border border-slate-200 hover:border-rose-200 cursor-pointer shadow-2xs disabled:opacity-40 disabled:cursor-not-allowed"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Dedicated Capacity Metrics Bar */}
                    <CapacityMetricsBar
                      reqCount={req.required_students || req.student_count || 10}
                      accCap={req.accepted_capacity}
                      allocCount={req.allocated_students || (req.student_slots?.length || 0)}
                      evalCount={req.evaluated_students || evaluatedCount}
                      verCount={req.verified_students || (req.status === "completed" ? evaluatedCount : 0)}
                      remAlloc={req.remaining_to_allocate || Math.max(0, (req.student_count || 10) - (req.allocated_students || 0))}
                      remEval={req.remaining_to_evaluate || Math.max(0, (req.allocated_students || 0) - evaluatedCount)}
                      type={req.type}
                    />

                    {/* ── SHADCN-STYLE EVALUATION DRAWER (SIDE-BY-SIDE PANELS) ── */}
                    {isExpanded && isAssigned && (
                      <div className="border-t border-slate-100 bg-slate-50/50 p-5 space-y-4">

                        {/* Session Progress Header */}
                        <div className="bg-white border border-slate-100 rounded-2xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-3 shadow-card">
                          <div>
                            <div className="text-xs font-black text-slate-800">
                              Evaluation Progress: {evaluatedCount} of {reqStudents.length} Students ({progressPct}%)
                            </div>
                            <div className="w-full bg-slate-100 h-2 rounded-full mt-2 overflow-hidden max-w-md">
                              <div className="bg-[#4F46E5] h-full rounded-full transition-all duration-500" style={{ width: `${progressPct}%` }} />
                            </div>
                          </div>
                        </div>

                        {/* Split Screen Layout: Left Student List | Right Evaluation Form */}
                        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">

                          {/* LEFT PANEL: Student Roster List with Search & Filter */}
                          <div className="lg:col-span-5 bg-white border border-slate-100 rounded-2xl p-4 space-y-3 shadow-card">
                            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                              <span className="text-xs font-black text-slate-800 flex items-center gap-1.5">
                                <Users className="w-3.5 h-3.5 text-[#4F46E5]" /> Student Roster ({activeStudentsList.length})
                              </span>
                            </div>

                            {/* Search Input */}
                            <div className="relative">
                              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                              <input
                                type="text"
                                placeholder="Search student name..."
                                value={studentSearchQuery}
                                onChange={e => setStudentSearchQuery(e.target.value)}
                                className="w-full pl-8 pr-3 py-2 border border-slate-200 rounded-xl text-xs font-medium focus:ring-1 focus:ring-indigo-500 outline-none"
                              />
                            </div>

                            {/* Filter Tabs */}
                            <div className="flex gap-1 p-1 bg-slate-100 rounded-lg text-[10px] font-bold">
                              {(["all", "pending", "evaluated", "cleared"] as const).map(f => (
                                <button
                                  key={f}
                                  onClick={() => setStudentStatusFilter(f)}
                                  className={`flex-1 py-1 rounded-md uppercase transition-all ${
                                    studentStatusFilter === f
                                      ? "bg-white shadow-2xs text-[#4F46E5] font-black"
                                      : "text-slate-500 hover:text-slate-700"
                                  }`}
                                >
                                  {f}
                                </button>
                              ))}
                            </div>

                            {/* Scrollable Student List */}
                            <div className="space-y-1.5 max-h-[480px] overflow-y-auto pr-1">
                              {activeStudentsList.length === 0 ? (
                                <p className="text-xs text-slate-400 italic py-4 text-center">No students match filter.</p>
                              ) : (
                                activeStudentsList.map((st: any) => {
                                  const evl = getEvalForStudent(req.id, st.id, st.name);
                                  const isSelected = selectedStudent?.id === st.id;
                                  return (
                                    <div
                                      key={st.id}
                                      onClick={() => setSelectedStudent(st)}
                                      className={`p-3 rounded-xl border transition-all cursor-pointer flex items-center justify-between ${
                                        isSelected
                                          ? "bg-indigo-50/80 border-indigo-400 shadow-2xs ring-1 ring-indigo-400/20"
                                          : evl
                                          ? "bg-emerald-50/40 border-emerald-200/80 hover:bg-emerald-50"
                                          : "bg-white border-slate-200 hover:border-slate-300"
                                      }`}
                                    >
                                      <div className="flex items-center gap-2.5 min-w-0">
                                        <div className="w-7 h-7 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-700 font-extrabold text-[10px] shrink-0">
                                          {st.name.charAt(0).toUpperCase()}
                                        </div>
                                        <div className="truncate">
                                          <div className="font-bold text-slate-800 text-xs truncate">{st.name}</div>
                                          <div className="text-[10px] text-indigo-600 font-bold font-mono">
                                            {st.register_number || st.roll_number || st.id}
                                            <span className="text-slate-400 font-medium font-sans ml-1.5">• {st.classGroup || "BCA - Semester 5"}</span>
                                          </div>
                                        </div>
                                      </div>

                                      <div className="text-right shrink-0">
                                        {evl ? (
                                          <span className="inline-block text-[9px] font-black text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full border border-emerald-200">
                                            {evl.total_score}/10
                                          </span>
                                        ) : (
                                          <span className="inline-block text-[9px] font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
                                            Pending
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                  );
                                })
                              )}
                            </div>
                          </div>

                          {/* RIGHT PANEL: Question-by-Question Evaluation Form ("question should be") */}
                          <div className="lg:col-span-7 bg-white border border-slate-100 rounded-2xl p-5 shadow-card space-y-4">
                            {!selectedStudent ? (
                              <div className="py-20 text-center text-slate-400">
                                <GraduationCap className="w-10 h-10 text-slate-200 mx-auto mb-2" />
                                <p className="text-xs font-bold text-slate-600">Select a student from the list on the left to evaluate</p>
                                <p className="text-[11px] text-slate-400 mt-1">Grade per-question technical ratings & core skills</p>
                              </div>
                            ) : (
                              <form onSubmit={handleSaveEval} className="space-y-4">

                                {/* Selected Student Header */}
                                <div className="flex items-center justify-between border-b border-slate-100 pb-3 flex-wrap gap-2">
                                  <div>
                                    <h4 className="font-black text-slate-800 text-sm flex items-center gap-2 flex-wrap">
                                      Evaluating: {selectedStudent.name}
                                      <span className="text-xs px-2 py-0.5 rounded-lg bg-indigo-50 border border-indigo-100 text-indigo-700 font-mono font-bold">
                                        {selectedStudent.register_number || selectedStudent.roll_number || selectedStudent.id}
                                      </span>
                                    </h4>
                                    <p className="text-[11px] text-slate-500 font-medium mt-0.5">{req.subject} • {selectedStudent.classGroup || "BCA - Semester 5"}</p>
                                  </div>

                                  {/* Attendance Selector */}
                                  <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl border border-slate-200">
                                    {(["present", "absent", "od"] as const).map(att => (
                                      <button
                                        key={att} type="button"
                                        onClick={() => setEvalAttendance(att)}
                                        className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase transition-all cursor-pointer ${
                                          evalAttendance === att
                                            ? att === "present" ? "bg-emerald-600 text-white"
                                              : att === "absent" ? "bg-rose-600 text-white"
                                              : "bg-amber-500 text-white"
                                            : "text-slate-500 hover:text-slate-800"
                                        }`}
                                      >{att}</button>
                                    ))}
                                  </div>
                                  {evalAttendance === "absent" && (
                                    <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200/80 text-[11px] text-rose-800 flex items-start gap-2">
                                      <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                                      <div>
                                        <span className="font-extrabold block">Marking Candidate as Absent</span>
                                        <span className="text-[10px] text-rose-700">This will automatically sync their timetable class period to Absent and log the audit record. Rubric scores will be zeroed.</span>
                                      </div>
                                    </div>
                                  )}
                                </div>

                                {/* Scheduled Slot & Actual Timing Tracker */}
                                <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 space-y-2.5">
                                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                                    <div className="flex items-center gap-1.5 text-slate-700 font-bold">
                                      <Clock className="w-3.5 h-3.5 text-[#4F46E5]" />
                                      <span>Scheduled Window:</span>
                                      <span className="font-mono text-slate-900 bg-white px-2 py-0.5 rounded border border-slate-200">
                                        {(() => {
                                          const mySlot = (req.student_slots || []).find((s: any) => s.student_id === selectedStudent.id);
                                          return mySlot ? `${mySlot.slot_start_time} - ${mySlot.slot_end_time}` : (req.preferred_start_time || "15 min slot");
                                        })()}
                                      </span>
                                    </div>

                                    <div className="flex items-center gap-1.5">
                                      <span className="text-[10px] uppercase font-bold text-slate-400">Actual Duration:</span>
                                      <span className="font-mono font-black text-xs text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200">
                                        {evalAttendance === "absent" ? "0 mins (Absent)" : `${actualDuration} mins`}
                                      </span>
                                    </div>
                                  </div>

                                  {evalAttendance !== "absent" && (
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1 border-t border-slate-200/60">
                                      <div className="flex items-center gap-1.5">
                                        <label className="text-[10px] text-slate-500 font-bold uppercase shrink-0">Actual Start:</label>
                                        <input
                                          type="text"
                                          aria-label="Actual Start"
                                          placeholder="e.g. 09:16 AM"
                                          value={actualStartTime}
                                          onChange={e => setActualStartTime(e.target.value)}
                                          className="p-1 text-xs font-mono font-bold border border-slate-200 rounded-lg bg-white flex-1 outline-none"
                                        />
                                        <button
                                          type="button"
                                          onClick={() => {
                                            const now = new Date();
                                            const formatted = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                                            setActualStartTime(formatted);
                                          }}
                                          className="text-[9px] font-extrabold px-1.5 py-1 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded transition-all cursor-pointer"
                                        >
                                          Now
                                        </button>
                                      </div>

                                      <div className="flex items-center gap-1.5">
                                        <label className="text-[10px] text-slate-500 font-bold uppercase shrink-0">Actual End:</label>
                                        <input
                                          type="text"
                                          aria-label="Actual End"
                                          placeholder="e.g. 09:33 AM"
                                          value={actualEndTime}
                                          onChange={e => setActualEndTime(e.target.value)}
                                          className="p-1 text-xs font-mono font-bold border border-slate-200 rounded-lg bg-white flex-1 outline-none"
                                        />
                                        <button
                                          type="button"
                                          onClick={() => {
                                            const now = new Date();
                                            const formatted = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                                            setActualEndTime(formatted);
                                          }}
                                          className="text-[9px] font-extrabold px-1.5 py-1 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded transition-all cursor-pointer"
                                        >
                                          Now
                                        </button>
                                      </div>
                                    </div>
                                  )}
                                </div>

                                {/* ── QUESTION BY QUESTION EVALUATION SECTION ("question should be") ── */}
                                <div className="space-y-3">
                                  <div className="flex items-center justify-between">
                                    <span className="text-xs font-black text-slate-800 flex items-center gap-1.5">
                                      <HelpCircle className="w-3.5 h-3.5 text-[#4F46E5]" /> Structured Question Ratings
                                    </span>
                                    <span className="text-[10px] text-slate-400 font-bold">{evalQuestions.length} Questions</span>
                                  </div>

                                  {/* List of Dynamic Typed Questions */}
                                  <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1">
                                    {evalQuestions.map((qItem, idx) => (
                                      <div key={qItem.id} className="p-3 rounded-xl border border-slate-100 bg-slate-50/80 space-y-2.5">
                                        <div className="flex items-center gap-2">
                                          <span className="w-6 h-6 rounded-lg bg-indigo-100 text-indigo-700 text-[10px] font-black flex items-center justify-center shrink-0">
                                            Q{idx + 1}
                                          </span>
                                          <input
                                            type="text"
                                            value={qItem.question}
                                            placeholder={`Type question #${idx + 1} asked to student...`}
                                            onChange={e => handleUpdateQuestion(qItem.id, "question", e.target.value)}
                                            className="font-bold text-xs text-slate-800 bg-white border border-slate-200 rounded-lg px-3 py-1.5 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none w-full"
                                          />
                                          {evalQuestions.length > 1 && (
                                            <button
                                              type="button"
                                              onClick={() => handleRemoveQuestion(qItem.id)}
                                              className="text-slate-400 hover:text-rose-500 transition-colors p-1 shrink-0"
                                              title="Remove Question"
                                            >
                                              <Trash2 className="w-4 h-4" />
                                            </button>
                                          )}
                                        </div>

                                        {/* Question Score Slider */}
                                        <div className="flex items-center gap-3 px-1">
                                          <span className="text-[10px] text-slate-400 font-bold uppercase shrink-0">Rating:</span>
                                          <input aria-label="Question rating"
                                            type="range" min={1} max={10} value={qItem.score}
                                            onChange={e => handleUpdateQuestion(qItem.id, "score", Number(e.target.value))}
                                            className="flex-1 cursor-pointer h-1.5 rounded-full appearance-none bg-slate-200 accent-[#4F46E5]"
                                          />
                                          <span className="text-xs font-black text-[#4F46E5] shrink-0">{qItem.score} / 10</span>
                                        </div>
                                      </div>
                                    ))}
                                  </div>

                                  {/* Add Question Button */}
                                  <div className="pt-1">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const newQ: StructuredQuestion = {
                                          id: generateId("q"),
                                          question: "",
                                          maxScore: 10,
                                          score: 7,
                                          notes: ""
                                        };
                                        setEvalQuestions(prev => [...prev, newQ]);
                                      }}
                                      className="w-full py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-black rounded-xl flex items-center justify-center gap-1.5 cursor-pointer border border-indigo-200/80 transition-all"
                                    >
                                      <Plus className="w-3.5 h-3.5" /> Add Another Question Asked
                                    </button>
                                  </div>
                                </div>

                                {/* ── OVERALL CORE SKILLS SCORING SLIDERS ── */}
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
                                  <ScoreSlider label="Communication Skill" value={commScore} onChange={setCommScore} color="#4F46E5" />
                                  <ScoreSlider label="Content Knowledge" value={contentScore} onChange={setContentScore} color="#7C3AED" />
                                  <ScoreSlider label="Technical Problem Solving" value={techScore} onChange={setTechScore} color="#6366f1" />
                                  <ScoreSlider label="Confidence & Presentation" value={confidenceScore} onChange={setConfidenceScore} color="#f59e0b" />
                                </div>

                                {/* Overall Remarks */}
                                <div className="space-y-1">
                                  <label className="text-[10px] text-slate-400 uppercase font-bold tracking-wider block">Mentor Overall Remarks</label>
                                  <textarea
                                    aria-label="Mentor Overall Remarks"
                                    rows={2} value={remarks}
                                    onChange={e => setRemarks(e.target.value)}
                                    placeholder="e.g. Strong conceptual understanding, clear explanation..."
                                    className="w-full p-2.5 border border-slate-200 rounded-xl bg-white text-xs font-medium outline-none focus:ring-1 focus:ring-indigo-500 placeholder-slate-300 resize-none"
                                  />
                                </div>

                                <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                                  <button
                                    type="button"
                                    onClick={() => setSelectedStudent(null)}
                                    className="text-xs font-bold text-slate-500 hover:text-slate-700 px-3 py-2 rounded-lg border border-slate-200 hover:bg-slate-50 transition-all cursor-pointer"
                                  >
                                    Cancel
                                  </button>
                                  <button
                                    type="submit" disabled={isSavingEval}
                                    className="btn-gradient flex items-center gap-2 px-6 py-2.5 rounded-xl text-xs font-extrabold disabled:opacity-50 cursor-pointer shadow-xs"
                                  >
                                    {isSavingEval ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                                    {isSavingEval ? "Saving..." : "Save Evaluation Marks"}
                                  </button>
                                </div>
                              </form>
                            )}
                          </div>

                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── CM: Pending Allocations ── */}
      {isCM && activeTab === "pending" && (
        <div className="space-y-4">
          {isLoading ? (
            <div className="bg-white border border-slate-100 rounded-2xl p-10 text-center text-sm text-slate-400 flex items-center justify-center gap-2 shadow-card">
              <Loader2 className="w-4 h-4 animate-spin text-[#4F46E5]" /> Loading requests...
            </div>
          ) : pendingRequests.length === 0 ? (
            <div className="bg-white border border-slate-100 rounded-2xl p-10 text-center shadow-card">
              <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto mb-2" />
              <p className="text-sm font-semibold text-slate-600">All caught up!</p>
              <p className="text-xs text-slate-400 mt-1">No pending interview allocation requests for your campus.</p>
            </div>
          ) : (
            pendingRequests.map(req => {
              const isOpen = expandedAllocation === req.id;
              const subjectMentors = subjectMentorsForReq(req);

              return (
                <div key={req.id} className="bg-white border border-slate-100 rounded-2xl shadow-card overflow-hidden">
                  <div className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <StatusBadge status={req.status} />
                        <span className={`text-[10px] font-black px-2 py-0.5 rounded-full border ${
                          req.type === "external"
                            ? "bg-purple-50 text-purple-700 border-purple-200"
                            : "bg-blue-50 text-blue-700 border-blue-200"
                        }`}>
                          {(req.type || "internal").toUpperCase()}
                        </span>
                      </div>
                      <div className="font-black text-slate-800">{req.subject}</div>
                      <div className="text-xs text-slate-500 flex flex-wrap gap-x-4 gap-y-0.5">
                        <span className="flex items-center gap-1"><GraduationCap className="w-3 h-3 text-[#4F46E5]" />{req.class_group || "All Classes"}</span>
                        <span className="flex items-center gap-1"><Calendar className="w-3 h-3 text-[#4F46E5]" />{req.target_date}</span>
                        <span className="flex items-center gap-1"><UserCheck className="w-3 h-3 text-[#4F46E5]" />Requested by {req.mentor_name}</span>
                      </div>
                      {req.topics && (
                        <p className="text-[11px] text-slate-400"><strong className="text-slate-600">Topics:</strong> {req.topics}</p>
                      )}
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {req.type === "external" && (() => {
                        const currentCollegeId = defaultCollegeId || currentMentor?.college_id;
                        const isHostCampus = req.origin_college_id === currentCollegeId || req.college_id === currentCollegeId;
                        const totalReq = Number(req.student_count || req.requested_students || 10);
                        const totalAccepted = Number(req.accepted_capacity || 0);
                        const remainingNeeded = Math.max(0, totalReq - totalAccepted);
                        const myResponse = (req.cam_responses || []).find((r: any) => r.college_id === currentCollegeId);
                        const isPendingBroadcast = req.status === "pending_cm_acceptance" || req.status === "capacity_partially_accepted" || req.status === "priority_allocation";

                        return (
                          <>
                            {/* 1. Raiser's Home CM Approval Stage */}
                            {(req.status === "pending_origin_cm" || req.status === "draft") && isHostCampus && (
                              <button
                                type="button"
                                onClick={() => handleSendCapacityRequest(req.id)}
                                className="flex items-center gap-1.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold px-3.5 py-2 rounded-lg transition-all cursor-pointer shadow-xs"
                                title="Approve mentor's external interview request and broadcast to partner colleges"
                              >
                                <Send className="w-3.5 h-3.5" /> Approve &amp; Broadcast
                              </button>
                            )}

                            {/* 2. Zone CAM Capacity Acceptance & Multi-Campus Tally Stage */}
                            {isPendingBroadcast && (
                              <div className="flex items-center gap-2">
                                {isHostCampus ? (
                                  /* Host Campus: Displays overall broadcast tally & Priority Split trigger */
                                  <div className="flex items-center gap-2">
                                    <span className="text-[11px] font-bold text-purple-700 bg-purple-50 px-3 py-1.5 rounded-xl border border-purple-200">
                                      Zone Broadcast: <strong className="text-purple-900 font-black">{totalAccepted}</strong>/{totalReq} Accepted
                                      {remainingNeeded > 0 ? ` (${remainingNeeded} Needed)` : " (Fully Tallied)"}
                                    </span>
                                    {totalAccepted > 0 && (
                                      <button
                                        onClick={() => handlePreviewPrioritySplit(req)}
                                        disabled={isLoadingSplit}
                                        className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-extrabold px-3 py-1.5 rounded-xl transition-all cursor-pointer shadow-2xs disabled:opacity-50"
                                        title="Distribute accepted student capacity across partner campus evaluators"
                                      >
                                        {isLoadingSplit && activeSplitInterview?.id === req.id ? (
                                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                        ) : (
                                          <Sparkles className="w-3.5 h-3.5" />
                                        )}
                                        Run Priority Split
                                      </button>
                                    )}
                                  </div>
                                ) : (
                                  /* Partner Campus: Can accept remaining capacity until fully tallied */
                                  myResponse && myResponse.status === "accepted" ? (
                                    <div className="flex items-center gap-1.5 bg-emerald-50 px-3 py-1.5 rounded-xl border border-emerald-200 text-xs">
                                      <Check className="w-3.5 h-3.5 text-emerald-600 font-bold" />
                                      <span className="font-extrabold text-emerald-800">
                                        Your Campus Accepted: {myResponse.accepted_student_capacity} Students
                                      </span>
                                      {remainingNeeded > 0 && (
                                        <span className="text-[10px] text-amber-700 font-bold ml-1">
                                          ({remainingNeeded} still needed from zone)
                                        </span>
                                      )}
                                    </div>
                                  ) : remainingNeeded > 0 ? (
                                    <div className="flex items-center gap-1.5 bg-purple-50 p-1.5 rounded-xl border border-purple-200">
                                      <span className="text-[10px] font-black text-purple-900 px-1">
                                        Needed: <strong className="text-purple-700 font-black">{remainingNeeded}</strong>/{totalReq}
                                      </span>
                                      <input
                                        type="number"
                                        min={1}
                                        max={remainingNeeded}
                                        defaultValue={Math.min(10, remainingNeeded)}
                                        id={`cap_accept_inp_${req.id}`}
                                        className="w-14 p-1 border border-purple-300 rounded-lg text-xs font-black bg-white outline-none text-purple-900 text-center"
                                        title={`Enter capacity your campus can accept (up to ${remainingNeeded})`}
                                      />
                                      <button
                                        onClick={() => {
                                          const el = document.getElementById(`cap_accept_inp_${req.id}`) as HTMLInputElement;
                                          const val = el ? Number(el.value) : Math.min(10, remainingNeeded);
                                          handleCamCapacityResponse(req.id, "accept_capacity", Math.min(remainingNeeded, Math.max(1, val)));
                                        }}
                                        className="flex items-center gap-1 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold px-3 py-1 rounded-lg transition-all cursor-pointer shadow-2xs"
                                      >
                                        <Check className="w-3.5 h-3.5" /> Accept
                                      </button>
                                      <button
                                        onClick={() => handleCamCapacityResponse(req.id, "decline", 0)}
                                        className="flex items-center gap-1 bg-rose-600 hover:bg-rose-700 text-white text-xs font-extrabold px-2 py-1 rounded-lg transition-all cursor-pointer"
                                      >
                                        <XCircle className="w-3.5 h-3.5" /> Decline
                                      </button>
                                    </div>
                                  ) : (
                                    <span className="text-[11px] font-bold text-slate-500 bg-slate-100 px-3 py-1.5 rounded-xl border border-slate-200">
                                      ✓ Capacity Fulfilled by Zone ({totalAccepted}/{totalReq})
                                    </span>
                                  )
                                )}
                              </div>
                            )}

                            {/* 3. Final Confirmation Stage */}
                            {req.status === "pending_final_confirmation" && (
                              <div className="flex items-center gap-2">
                                <button
                                  onClick={() => handleFinalConfirm(req.id, "cam_confirm")}
                                  className="flex items-center gap-1 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold px-3 py-2 rounded-xl transition-all cursor-pointer"
                                >
                                  <CheckCircle className="w-3.5 h-3.5" /> Confirm &amp; Gen Meet
                                </button>
                                <button
                                  onClick={() => handleFinalConfirm(req.id, "cam_reject")}
                                  className="flex items-center gap-1 bg-rose-600 hover:bg-rose-700 text-white text-xs font-extrabold px-3 py-2 rounded-xl transition-all cursor-pointer"
                                >
                                  <XCircle className="w-3.5 h-3.5" /> Reject Allocation
                                </button>
                              </div>
                            )}
                          </>
                        );
                      })()}
                      <button
                        onClick={() => openRosterModal(req, "students")}
                        className={`flex items-center gap-1.5 text-xs font-extrabold px-3 py-2 rounded-xl transition-all cursor-pointer border shadow-2xs ${
                          (req.evaluated_students || 0) > 0
                            ? "bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border-indigo-200"
                            : "bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200"
                        }`}
                        title="View Student Roster, Marks, Evaluated Questions & Rubrics"
                      >
                        <Eye className="w-3.5 h-3.5 text-indigo-600" />
                        <span>Student Marks &amp; Questions</span>
                        {(req.evaluated_students || 0) > 0 && (
                          <span className="text-[10px] font-black px-1.5 py-0.2 rounded-full bg-indigo-600 text-white">
                            {req.evaluated_students}
                          </span>
                        )}
                      </button>
                      <button
                        onClick={() => {
                          if (isOpen) {
                            setExpandedAllocation(null);
                            setMentorSlotConfigs({});
                          } else {
                            const currentCollegeId = defaultCollegeId || currentMentor?.college_id;
                            const isHost = req.college_id === currentCollegeId || req.origin_college_id === currentCollegeId;
                            const myResp = (req.cam_responses || []).find((r: any) => r.college_id === currentCollegeId);

                            let initialCount = 10;
                            if (!isHost && myResp && myResp.accepted_student_capacity > 0) {
                              // If partner CAM accepted a specific capacity (e.g. 10), use their accepted capacity!
                              initialCount = Number(myResp.accepted_student_capacity);
                            } else if (req.remaining_students && req.remaining_students > 0) {
                              initialCount = Number(req.remaining_students);
                            } else if (req.student_count && req.student_count > 0) {
                              initialCount = Number(req.student_count);
                            }

                            setExpandedAllocation(req.id);
                            setCamStudentCount(initialCount);

                            // Initialize mentor configs
                            const initialConfigs: Record<string, Record<string, number>> = {};
                            if (req.student_slots && Array.isArray(req.student_slots) && req.student_slots.length > 0) {
                              req.student_slots.forEach((stSlot: any) => {
                                if (stSlot.mentor_id) {
                                  const slotTime = (stSlot.slot_start_time && stSlot.slot_end_time) 
                                    ? `${stSlot.slot_start_time} - ${stSlot.slot_end_time}` 
                                    : (req.preferred_start_time || "8.20 AM - 9.10 AM");
                                  if (!initialConfigs[stSlot.mentor_id]) initialConfigs[stSlot.mentor_id] = {};
                                  initialConfigs[stSlot.mentor_id][slotTime] = (initialConfigs[stSlot.mentor_id][slotTime] || 0) + 1;
                                }
                              });
                            } else if (req.assigned_mentor_ids) {
                              try {
                                const ids = JSON.parse(req.assigned_mentor_ids);
                                if (Array.isArray(ids)) {
                                  ids.forEach((mId: string) => {
                                    initialConfigs[mId] = { [req.preferred_start_time || "8.20 AM - 9.10 AM"]: 3 };
                                  });
                                }
                              } catch (_) {}
                            }
                            setMentorSlotConfigs(initialConfigs);
                            setCmGmeetLink(req.gmeet_link || "");
                          }
                        }}
                        className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-900 text-white text-xs font-extrabold px-4 py-2 rounded-xl transition-all cursor-pointer shadow-2xs"
                      >
                        <Users className="w-3.5 h-3.5" />
                        {isOpen ? "Close" : "Details & Schedule"}
                        {isOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                      </button>
                      <button
                        onClick={() => handleDeleteInterview(req.id)}
                        disabled={deletingInterviewId === req.id}
                        title="Delete Request"
                        className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all border border-slate-200 hover:border-rose-200 cursor-pointer shadow-2xs disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Dedicated Capacity Metrics Bar */}
                  <CapacityMetricsBar
                    reqCount={req.required_students || req.student_count || 10}
                    accCap={req.accepted_capacity}
                    allocCount={req.allocated_students || (req.student_slots?.length || 0)}
                    evalCount={req.evaluated_students || 0}
                    verCount={req.verified_students || (req.status === "completed" ? (req.evaluated_students || 0) : 0)}
                    remAlloc={req.remaining_to_allocate || Math.max(0, (req.student_count || 10) - (req.allocated_students || 0))}
                    remEval={req.remaining_to_evaluate || Math.max(0, (req.allocated_students || 0) - (req.evaluated_students || 0))}
                    type={req.type}
                  />

                  {/* Allocation Panel or Home CM Tracking Panel */}
                  {isOpen && (
                    <div className="border-t border-slate-100 bg-slate-50/50 p-5 space-y-4">
                      {/* 1. If Raiser's Home CM on External Request: Show Zone Tracking & Broadcast Console */}
                      {isCM && req.type === "external" && (req.origin_college_id === defaultCollegeId || req.college_id === defaultCollegeId) ? (
                        <div className="space-y-4">
                          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/80 pb-2.5">
                            <div className="flex items-center gap-2">
                              <Globe className="w-4 h-4 text-slate-700" />
                              <h3 className="text-xs font-bold text-slate-900">
                                Partner Campus Capacity
                              </h3>
                            </div>
                            <span className="text-[11px] font-medium text-slate-500">
                              Target Date: <strong className="text-slate-800">{req.target_date}</strong>
                            </span>
                          </div>

                          {/* Home CM Pre-Approval Banner */}
                          {req.status === "pending_origin_cm" && (
                            <div className="p-3.5 bg-slate-50 border border-slate-200/80 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs">
                              <div className="space-y-0.5">
                                <div className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                                  <AlertCircle className="w-4 h-4 text-slate-700 shrink-0" />
                                  External Broadcast Pending Approval
                                </div>
                                <p className="text-xs text-slate-500">
                                  Mentor requested external evaluation for {req.student_count || 10} students across partner campuses.
                                </p>
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                <button
                                  type="button"
                                  onClick={() => handleConvertToInternal(req.id)}
                                  className="px-3.5 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 text-xs font-semibold cursor-pointer transition-all shadow-2xs"
                                  title="Switch to Internal and evaluate using campus mentors"
                                >
                                  Evaluate Internally
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleSendCapacityRequest(req.id)}
                                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold cursor-pointer shadow-xs transition-all"
                                >
                                  <Send className="w-3.5 h-3.5" /> Approve &amp; Broadcast
                                </button>
                              </div>
                            </div>
                          )}

                          {/* Zone Campuses Acceptance Matrix */}
                          <div className="space-y-2">
                            <label className="text-[11px] text-slate-500 font-semibold uppercase tracking-wider block">
                              Partner Campuses &amp; Assigned Mentors
                            </label>
                            
                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                              {(() => {
                                const originId = req.origin_college_id || req.college_id || defaultCollegeId;
                                const originCol = activeCollegesList.find(c => c.id === originId);
                                const originKamId = originCol?.kam_id || (originCol as any)?.kamId || currentKAM?.id;
                                
                                // Partner colleges under the same KAM zone
                                let partnerCols = activeCollegesList.filter(c => 
                                  c.id !== originId && 
                                  (originKamId ? (c.kam_id === originKamId || (c as any).kamId === originKamId) : false)
                                ).map(c => ({ id: c.id, name: c.name }));

                                // Fallback: If no colleges under same KAM ID, include other partner colleges in activeCollegesList
                                if (partnerCols.length === 0) {
                                  partnerCols = activeCollegesList
                                    .filter(c => c.id !== originId)
                                    .map(c => ({ id: c.id, name: c.name }));
                                }
                                
                                (req.cam_responses || []).forEach((resp: any) => {
                                  if (resp.college_id && resp.college_id !== originId && !partnerCols.some(c => c.id === resp.college_id)) {
                                    const colObj = activeCollegesList.find(c => c.id === resp.college_id);
                                    const colKam = colObj?.kam_id || (colObj as any)?.kamId;
                                    // Exclude colleges belonging to other KAM zones
                                    if (originKamId && colKam && colKam !== originKamId) {
                                      return;
                                    }
                                    partnerCols.push({ id: resp.college_id, name: resp.college_name || colObj?.name || resp.college_id });
                                  }
                                });

                                if (partnerCols.length === 0) {
                                  return (
                                    <div className="col-span-full p-4 bg-white border border-dashed border-slate-200 rounded-xl text-center text-xs text-slate-500 font-medium">
                                      No other partner colleges found under this KAM zone.
                                    </div>
                                  );
                                }

                                return partnerCols.map(col => {
                                  const camResp = (req.cam_responses || []).find((r: any) => r.college_id === col.id);
                                  const isAccepted = camResp?.status === "accepted" || (camResp?.accepted_student_capacity || 0) > 0;
                                  const isDeclined = camResp?.status === "declined";

                                  return (
                                    <div
                                      key={col.id}
                                      className={`p-3.5 rounded-xl border transition-all ${
                                        isAccepted
                                          ? "bg-emerald-50/80 border-emerald-300 shadow-2xs"
                                          : isDeclined
                                          ? "bg-rose-50/60 border-rose-200 opacity-70"
                                          : "bg-white border-slate-200"
                                      }`}
                                    >
                                      <div className="flex items-center justify-between gap-1">
                                        <div className="font-extrabold text-xs text-slate-800 truncate" title={col.name}>{col.name}</div>
                                        {isAccepted ? (
                                          <span className="text-[9px] font-black uppercase text-emerald-700 bg-emerald-100/80 px-2 py-0.5 rounded-md border border-emerald-200 flex items-center gap-1">
                                            <Check className="w-3 h-3" /> {camResp?.accepted_student_capacity || 0} Students
                                          </span>
                                        ) : isDeclined ? (
                                          <span className="text-[9px] font-black uppercase text-rose-700 bg-rose-100/80 px-2 py-0.5 rounded-md border border-rose-200">
                                            Declined
                                          </span>
                                        ) : (
                                          <span className="text-[9px] font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-md">
                                            Awaiting Response
                                          </span>
                                        )}
                                      </div>
                                      <p className="text-[10px] text-slate-500 mt-1">
                                        {isAccepted 
                                          ? `Faculty mapped by ${camResp?.cam_name || "CM"}` 
                                          : "Zone Partner Campus"}
                                      </p>
                                    </div>
                                  );
                                });
                              })()}
                            </div>
                          </div>

                          {/* Assigned External Faculty List */}
                          {req.assigned_mentor_ids && JSON.parse(req.assigned_mentor_ids).length > 0 && (
                            <div className="p-3.5 bg-indigo-50/60 border border-indigo-200 rounded-xl space-y-1.5">
                              <div className="text-[10px] font-black text-indigo-900 uppercase">
                                External Faculty Assigned to Conduct Evaluations
                              </div>
                              <div className="flex flex-wrap gap-2">
                                {JSON.parse(req.assigned_mentor_ids).map((id: string) => {
                                  const m = mentors.find(x => x.id === id);
                                  const col = activeCollegesList.find(c => c.id === m?.college_id);
                                  return (
                                    <span key={id} className="text-xs font-bold text-indigo-800 bg-white px-2.5 py-1 rounded-lg border border-indigo-200 flex items-center gap-1.5 shadow-2xs">
                                      <UserCheck className="w-3.5 h-3.5 text-indigo-600" />
                                      {m?.name || id} {col ? `(${col.name})` : ""}
                                    </span>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                        </div>
                      ) : (
                        /* 2. Evaluating CAM Panel: Map Available Mentors from Evaluating Campus */
                        <>
                          {(() => {
                            const targetCollegeId = defaultCollegeId || currentMentor?.college_id || req.college_id;
                            const structuredSlots = getStructuredCollegePeriodSlots(targetCollegeId, activeCollegesList, slots);
                            const targetDayName = req.target_date 
                              ? new Date(req.target_date.includes("T") ? req.target_date : `${req.target_date}T00:00:00`).toLocaleDateString("en-US", { weekday: "long" }) 
                              : "Wednesday";

                            const mentorsToEvaluate = showAllCampusMentors 
                              ? campusMentors 
                              : (subjectMentors.length > 0 ? subjectMentors : campusMentors);

                            const totalPeriodsScheduled = Object.values(mentorSlotConfigs).reduce((acc, sMap) => acc + Object.keys(sMap || {}).length, 0);

                            return (
                              <div className="space-y-4">
                                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/80 pb-3">
                                  <h3 className="text-xs font-black text-slate-800 flex items-center gap-2">
                                    <Users className="w-4 h-4 text-[#4F46E5]" />
                                    Map Available Faculty Mentors During Free Periods — {req.subject}
                                  </h3>
                                  <span className="text-[10px] font-extrabold text-indigo-700 bg-indigo-50 border border-indigo-200 px-2.5 py-1 rounded-lg">
                                    Target Date: {req.target_date} ({targetDayName})
                                  </span>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                  {/* Student Count Input + Auto-Calculate as per Time */}
                                  <div className="space-y-1.5">
                                    <div className="flex items-center justify-between">
                                      <label className="text-[10px] text-slate-500 uppercase font-extrabold tracking-wider block">
                                        Total Candidate Capacity
                                      </label>
                                      {totalAssignedCandidates > 0 && (
                                        <button
                                          type="button"
                                          onClick={() => setCamStudentCount(totalAssignedCandidates)}
                                          className="text-[9px] font-black text-[#4F46E5] hover:underline cursor-pointer flex items-center gap-1"
                                          title="Sync total student count with configured periods across all mentors"
                                        >
                                          <Sparkles className="w-3 h-3" /> Auto-Calc ({totalAssignedCandidates})
                                        </button>
                                      )}
                                    </div>
                                    <input
                                      type="number" min={1} max={500} value={camStudentCount}
                                      aria-label="Total Candidate Capacity"
                                      onChange={e => setCamStudentCount(Number(e.target.value))}
                                      className="w-full p-2.5 border border-slate-200 rounded-xl bg-white text-xs font-bold focus:ring-1 focus:ring-indigo-500 outline-none"
                                      required
                                    />
                                    <p className="text-[9px] text-slate-400 font-medium">
                                      {activeMappedMentorIds.length > 0
                                        ? `${activeMappedMentorIds.length} Mentor(s) scheduled across ${totalPeriodsScheduled} period(s) ➔ Total ${totalAssignedCandidates} candidates`
                                        : "Select faculty mentors and their free periods below to calculate capacity"}
                                    </p>
                                  </div>
                                  
                                  {/* Quick Period Selector (Auto-selects free faculty for that period) */}
                                  <div className="space-y-1.5">
                                    <label className="text-[10px] text-slate-500 uppercase font-extrabold tracking-wider block">
                                      Quick Period Selector <span className="text-[#4F46E5]">(Auto-Selects Free Faculty)</span>
                                    </label>
                                    <select
                                      aria-label="Quick Period Selector (Auto-Selects Free Faculty)"
                                      value={camTimeSlot}
                                      onChange={e => {
                                        const newSlot = e.target.value;
                                        setCamTimeSlot(newSlot);

                                        // Find all faculty mentors who are FREE in this slot
                                        const freeMentors = mentorsToEvaluate.filter(m => {
                                          const mentorBusySlots = (slots || []).filter(s => (s.mentorId === m.id || (s as any).mentorid === m.id) && (s.day || "").toLowerCase().trim() === targetDayName.toLowerCase().trim());
                                          const busyTimes = mentorBusySlots.map(s => (s.time || "").trim());
                                          return !busyTimes.some(b => b.toLowerCase().replace(/\s+/g, "") === newSlot.toLowerCase().replace(/\s+/g, ""));
                                        });

                                        const newConfigs: Record<string, Record<string, number>> = {};
                                        freeMentors.forEach(m => {
                                          newConfigs[m.id] = { [newSlot]: 3 };
                                        });
                                        setMentorSlotConfigs(newConfigs);
                                        setCamStudentCount(Math.max(1, freeMentors.length * 3));
                                      }}
                                      className="w-full p-2.5 border border-slate-200 rounded-xl bg-white text-xs font-bold focus:ring-1 focus:ring-indigo-500 outline-none cursor-pointer"
                                    >
                                      {structuredSlots.map(s => (
                                        <option key={s.timeSlot} value={s.timeSlot}>
                                          {s.fullLabel}
                                        </option>
                                      ))}
                                    </select>
                                    <p className="text-[9px] text-slate-400 font-medium">
                                      Selects all faculty free in this period with 3 students each
                                    </p>
                                  </div>

                                  {/* Google Meet Link (Only for External) vs In-Person Campus Notice */}
                                  {req.type === "external" ? (
                                    <div className="space-y-2 p-3 bg-slate-50/80 rounded-xl border border-slate-200">
                                      <div className="flex items-center justify-between gap-2">
                                        <label className="text-[10px] text-slate-700 uppercase font-black tracking-wider flex items-center gap-1.5">
                                          <Video className="w-3.5 h-3.5 text-indigo-600" />
                                          Google Meet Link <span className="text-slate-400 font-normal">(Virtual Panel)</span>
                                        </label>
                                        <div className="flex items-center gap-1.5">
                                          <button
                                            type="button"
                                            onClick={generateGMeetLink}
                                            className="px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-[10px] font-black transition-all cursor-pointer flex items-center gap-1 shadow-2xs"
                                            title="Generate a fresh Google Meet link instantly"
                                          >
                                            <Sparkles className="w-3 h-3" />
                                            Generate Link
                                          </button>
                                          <a
                                            href="https://meet.google.com/new"
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="px-2 py-1 rounded-lg bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 text-[10px] font-bold transition-all cursor-pointer flex items-center gap-1"
                                            title="Open Google Meet in a new tab to create an official Google Workspace meeting"
                                          >
                                            <ExternalLink className="w-3 h-3 text-slate-500" />
                                            New Room ↗
                                          </a>
                                        </div>
                                      </div>
                                      <div className="flex items-center gap-2">
                                        <input
                                          type="url"
                                          value={cmGmeetLink}
                                          aria-label="Google Meet Link (Virtual Cross-Campus Panel)"
                                          onChange={e => setCmGmeetLink(e.target.value)}
                                          placeholder="https://meet.google.com/xxx-xxxx-xxx"
                                          className="flex-1 p-2.5 border border-slate-200 rounded-xl bg-white text-xs font-semibold focus:ring-1 focus:ring-indigo-500 outline-none placeholder-slate-400"
                                        />
                                        {cmGmeetLink.trim() && (
                                          <a
                                            href={cmGmeetLink.trim()}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="px-3 py-2.5 rounded-xl bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 text-xs font-bold transition-all flex items-center gap-1"
                                            title="Test Google Meet link"
                                          >
                                            <Video className="w-3.5 h-3.5" />
                                            Test
                                          </a>
                                        )}
                                      </div>
                                      <p className="text-[9px] text-slate-500 font-medium">
                                        Auto-dispatched with isolated calendar invite per candidate. If left blank, a link will be generated automatically.
                                      </p>
                                    </div>
                                  ) : (
                                    <div className="p-3 bg-teal-50/70 border border-teal-200/80 rounded-xl flex items-start gap-2 text-teal-900 text-xs">
                                      <User className="w-4 h-4 text-teal-600 shrink-0 mt-0.5" />
                                      <div>
                                        <strong className="block font-bold text-[11px]">In-Person Campus Evaluation</strong>
                                        <span className="text-[10px] text-teal-700">Internal interviews are conducted physically in faculty cabins/labs. No Google Meet link required.</span>
                                      </div>
                                    </div>
                                  )}
                                </div>

                                {/* Available Mentors & Free Period Schedule Matrix */}
                                <div className="space-y-3 pt-2 border-t border-slate-200/80">
                                  <div className="flex flex-wrap items-center justify-between gap-2">
                                    <div>
                                      <label className="text-[10px] text-slate-700 uppercase font-black tracking-wider block">
                                        Faculty Mentors Availability on {targetDayName}
                                      </label>
                                      <span className="text-[9px] font-bold text-slate-500">
                                        Select multiple periods per faculty mentor and configure student candidate counts
                                      </span>
                                    </div>

                                    {/* Flexible Scope Toggle */}
                                    <div className="inline-flex p-0.5 rounded-lg bg-slate-100 border border-slate-200 text-[10px] font-bold">
                                      <button
                                        type="button"
                                        onClick={() => setShowAllCampusMentors(false)}
                                        className={`px-2.5 py-1 rounded-md transition-all cursor-pointer ${
                                          !showAllCampusMentors ? "bg-white text-[#4F46E5] shadow-2xs font-black" : "text-slate-500 hover:text-slate-800"
                                        }`}
                                      >
                                        Subject Faculty ({subjectMentors.length})
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => setShowAllCampusMentors(true)}
                                        className={`px-2.5 py-1 rounded-md transition-all cursor-pointer ${
                                          showAllCampusMentors ? "bg-white text-[#4F46E5] shadow-2xs font-black" : "text-slate-500 hover:text-slate-800"
                                        }`}
                                      >
                                        All Campus Faculty ({campusMentors.length})
                                      </button>
                                    </div>
                                  </div>

                                  <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
                                    {mentorsToEvaluate.length === 0 ? (
                                      <p className="text-xs text-slate-400 italic py-4 bg-white rounded-xl border border-slate-200 text-center">
                                        No faculty mentors found at this campus.
                                      </p>
                                    ) : (
                                      mentorsToEvaluate.map(m => {
                                        const mentorBusySlots = (slots || []).filter(s => 
                                          (s.mentorId === m.id || (s as any).mentorid === m.id) && 
                                          (s.day || "").toLowerCase().trim() === targetDayName.toLowerCase().trim()
                                        );
                                        const busyTimes = mentorBusySlots.map(s => (s.time || "").trim());

                                        const freeStructuredSlots = structuredSlots.filter(st => 
                                          !busyTimes.some(b => b.toLowerCase().replace(/\s+/g, "") === st.timeSlot.toLowerCase().replace(/\s+/g, ""))
                                        );
                                        const busyStructuredSlots = structuredSlots.filter(st => 
                                          busyTimes.some(b => b.toLowerCase().replace(/\s+/g, "") === st.timeSlot.toLowerCase().replace(/\s+/g, ""))
                                        );

                                        const configuredSlots = mentorSlotConfigs[m.id] || {};
                                        const activeSlotKeys = Object.keys(configuredSlots);
                                        const isMentorActive = activeSlotKeys.length > 0;
                                        const mentorCandidateTotal = Object.values(configuredSlots).reduce((s, c) => s + (Number(c) || 0), 0);

                                        return (
                                          <div
                                            key={m.id}
                                            className={`p-3.5 rounded-xl border transition-all ${
                                              isMentorActive
                                                ? "bg-indigo-50/50 border-indigo-300 shadow-xs"
                                                : "bg-white border-slate-200 hover:border-slate-300"
                                            }`}
                                          >
                                            <div className="flex items-start gap-3">
                                              {/* Checkbox to toggle mentor */}
                                              <input
                                                type="checkbox"
                                                checked={isMentorActive}
                                                id={`mentor_chk_${m.id}`}
                                                onChange={e => {
                                                  if (e.target.checked) {
                                                    const initialSlot = freeStructuredSlots[0]?.timeSlot || camTimeSlot;
                                                    setMentorSlotConfigs(prev => {
                                                      const updated = { ...prev, [m.id]: { [initialSlot]: 3 } };
                                                      const newTotal = Object.values(updated).reduce((sum, sMap) => sum + Object.values(sMap || {}).reduce((sub, count) => sub + (Number(count) || 0), 0), 0);
                                                      setCamStudentCount(Math.max(1, newTotal));
                                                      return updated;
                                                    });
                                                  } else {
                                                    clearMentorPeriods(m.id);
                                                  }
                                                }}
                                                className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 mt-1 cursor-pointer shrink-0"
                                              />

                                              <div className="flex-1 min-w-0 space-y-2">
                                                {/* Header Row: Mentor Name & Period Summary Badge */}
                                                <div className="flex flex-wrap items-center justify-between gap-1.5">
                                                  <div className="flex items-center gap-1.5">
                                                    <label htmlFor={`mentor_chk_${m.id}`} className="font-black text-slate-800 text-xs cursor-pointer hover:text-indigo-600">
                                                      {m.name}
                                                    </label>
                                                    <span className="text-[10px] text-slate-400 font-medium">({m.department || "Faculty"})</span>
                                                  </div>

                                                  <div className="flex items-center gap-1.5">
                                                    {isMentorActive ? (
                                                      <span className="text-[9.5px] font-extrabold text-emerald-800 bg-emerald-100/90 px-2.5 py-0.5 rounded-full border border-emerald-300 flex items-center gap-1 shadow-2xs">
                                                        <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                                                        {activeSlotKeys.length} Period(s) Assigned • {mentorCandidateTotal} Candidates (~{mentorCandidateTotal * 15}m)
                                                      </span>
                                                    ) : (
                                                      <span className="text-[9px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md border border-slate-200">
                                                        {freeStructuredSlots.length} Free Periods Available
                                                      </span>
                                                    )}

                                                    {/* Quick Multi-Period Action Helpers */}
                                                    {freeStructuredSlots.length > 0 && (
                                                      <div className="flex items-center gap-1">
                                                        <button
                                                          type="button"
                                                          onClick={() => setMentorAllFreePeriods(m.id, freeStructuredSlots.map(s => s.timeSlot), 3)}
                                                          className="text-[9px] font-black text-indigo-700 hover:text-indigo-900 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 px-2 py-0.5 rounded-md transition-all cursor-pointer"
                                                          title="Select all free periods for this mentor"
                                                        >
                                                          + All Free ({freeStructuredSlots.length})
                                                        </button>
                                                        {isMentorActive && (
                                                          <button
                                                            type="button"
                                                            onClick={() => clearMentorPeriods(m.id)}
                                                            className="text-[9px] font-bold text-rose-600 hover:text-rose-800 bg-rose-50 hover:bg-rose-100 border border-rose-200 px-2 py-0.5 rounded-md transition-all cursor-pointer"
                                                          >
                                                            Clear
                                                          </button>
                                                        )}
                                                      </div>
                                                    )}
                                                  </div>
                                                </div>

                                                {/* Interactive Free Period Chips with Period Numbers */}
                                                <div className="space-y-1">
                                                  <div className="flex items-center gap-1 text-[9px] font-extrabold uppercase text-slate-400">
                                                    <Clock className="w-3 h-3 text-slate-400" />
                                                    <span>Free Periods (Click to toggle on/off):</span>
                                                  </div>
                                                  <div className="flex flex-wrap items-center gap-1.5">
                                                    {freeStructuredSlots.length === 0 ? (
                                                      <span className="text-rose-500 font-semibold text-[9px]">Fully booked with classes today</span>
                                                    ) : (
                                                      freeStructuredSlots.map(fs => {
                                                        const isSelected = activeSlotKeys.some(k => k.toLowerCase().replace(/\s+/g, "") === fs.timeSlot.toLowerCase().replace(/\s+/g, ""));
                                                        const slotCandidateCount = configuredSlots[fs.timeSlot] || 3;

                                                        return (
                                                          <button
                                                            key={fs.timeSlot}
                                                            type="button"
                                                            onClick={() => toggleMentorPeriod(m.id, fs.timeSlot, 3)}
                                                            className={`px-2.5 py-1 rounded-lg text-[9.5px] font-bold transition-all cursor-pointer flex items-center gap-1 border shadow-2xs ${
                                                              isSelected
                                                                ? "bg-emerald-600 text-white border-emerald-700 shadow-emerald-600/20 font-black"
                                                                : "bg-white hover:bg-emerald-50 text-slate-700 hover:text-emerald-800 border-slate-200 hover:border-emerald-300"
                                                            }`}
                                                            title={`Click to ${isSelected ? "remove" : "add"} ${fs.fullLabel}`}
                                                          >
                                                            {isSelected ? (
                                                              <Check className="w-3 h-3 stroke-[3]" />
                                                            ) : (
                                                              <Plus className="w-3 h-3 text-slate-400" />
                                                            )}
                                                            <span>{fs.periodLabel}: {fs.timeSlot}</span>
                                                            {isSelected && (
                                                              <span className="bg-emerald-800 text-emerald-100 text-[8.5px] px-1.5 py-0.2 rounded font-black ml-0.5">
                                                                {slotCandidateCount} st
                                                              </span>
                                                            )}
                                                          </button>
                                                        );
                                                      })
                                                    )}
                                                  </div>
                                                </div>

                                                {/* In Class Busy Periods (If any) */}
                                                {busyStructuredSlots.length > 0 && (
                                                  <div className="text-[9px] text-slate-400 font-medium flex items-center gap-1">
                                                    <span className="font-semibold text-slate-500">In Class:</span>
                                                    <span className="truncate">
                                                      {busyStructuredSlots.map(b => `${b.periodLabel} (${b.timeSlot})`).join(", ")}
                                                    </span>
                                                  </div>
                                                )}

                                                {/* Selected Periods Configuration & Student Count Steppers */}
                                                {isMentorActive && (
                                                  <div className="mt-2 pt-2 border-t border-indigo-100 space-y-2 bg-white/90 p-2.5 rounded-xl border border-indigo-100">
                                                    <div className="text-[9px] font-black uppercase text-indigo-900 flex items-center justify-between">
                                                      <span>Configured Period Batches for {m.name}:</span>
                                                      <span className="text-slate-500 font-bold">{activeSlotKeys.length} Period(s) • ~15m per Candidate</span>
                                                    </div>

                                                    <div className="space-y-1.5">
                                                      {activeSlotKeys.map(slotKey => {
                                                        const slotCandidateCount = configuredSlots[slotKey] || 3;
                                                        const matchingPeriod = structuredSlots.find(s => s.timeSlot.toLowerCase().replace(/\s+/g, "") === slotKey.toLowerCase().replace(/\s+/g, ""));

                                                        return (
                                                          <div
                                                            key={slotKey}
                                                            className="flex flex-wrap items-center justify-between gap-2 p-2 bg-indigo-50/40 rounded-lg border border-indigo-200/80 text-xs"
                                                          >
                                                            <div className="flex items-center gap-2">
                                                              <span className="text-[9.5px] font-black text-indigo-700 bg-indigo-100 px-2 py-0.5 rounded-md font-mono">
                                                                {matchingPeriod?.periodLabel || "Slot"}
                                                              </span>
                                                              <span className="font-bold text-slate-800 text-xs">
                                                                {matchingPeriod ? matchingPeriod.timeSlot : slotKey}
                                                              </span>
                                                            </div>

                                                            {/* Stepper for candidate count */}
                                                            <div className="flex items-center gap-2">
                                                              <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-lg p-0.5 shadow-2xs">
                                                                <button
                                                                  type="button"
                                                                  onClick={() => updateMentorPeriodCount(m.id, slotKey, slotCandidateCount - 1)}
                                                                  disabled={slotCandidateCount <= 1}
                                                                  className="p-1 rounded text-slate-600 hover:text-indigo-600 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                                                                  title="Decrease students"
                                                                >
                                                                  <Minus className="w-3 h-3" />
                                                                </button>
                                                                <input aria-label="Number of candidates"
                                                                  type="number"
                                                                  min={1}
                                                                  max={50}
                                                                  value={slotCandidateCount}
                                                                  onChange={e => updateMentorPeriodCount(m.id, slotKey, parseInt(e.target.value) || 1)}
                                                                  className="w-10 text-center font-black text-xs text-slate-900 outline-none"
                                                                />
                                                                <button
                                                                  type="button"
                                                                  onClick={() => updateMentorPeriodCount(m.id, slotKey, slotCandidateCount + 1)}
                                                                  className="p-1 rounded text-slate-600 hover:text-indigo-600 hover:bg-slate-100 cursor-pointer"
                                                                  title="Increase students"
                                                                >
                                                                  <Plus className="w-3 h-3" />
                                                                </button>
                                                             </div>
                                                              <span className="text-[10px] font-extrabold text-slate-700">Candidates</span>
                                                              <span className="text-[9px] text-indigo-600 font-bold bg-indigo-50 px-1.5 py-0.5 rounded">
                                                                ~{slotCandidateCount * 15}m duration
                                                              </span>
                                                              <button
                                                                type="button"
                                                                onClick={() => toggleMentorPeriod(m.id, slotKey)}
                                                                className="p-1 text-slate-400 hover:text-rose-600 rounded transition-all cursor-pointer"
                                                                title="Remove this period"
                                                              >
                                                                <Trash2 className="w-3.5 h-3.5" />
                                                              </button>
                                                            </div>
                                                          </div>
                                                        );
                                                      })}
                                                    </div>
                                                  </div>
                                                )}
                                              </div>
                                            </div>
                                          </div>
                                        );
                                      })
                                    )}
                                  </div>
                                </div>

                                {/* Dedicated Priority Allocation & Remaining Students Section */}
                                {(() => {
                                  const cleanCG = (req.class_group || "").replace(/^[\["'\s]+|[\]"'\s]+$/g, "").trim();
                                  const cohortStudents = students.filter(s =>
                                    (s.classGroup && (s.classGroup.toLowerCase() === cleanCG.toLowerCase() || s.classGroup.toLowerCase().includes(cleanCG.toLowerCase()))) ||
                                    (s.department && (s.department.toLowerCase() === cleanCG.toLowerCase() || s.department.toLowerCase().includes(cleanCG.toLowerCase())))
                                  );

                                  if (cohortStudents.length === 0) return null;

                                  const capacity = camStudentCount || totalAssignedCandidates || 10;
                                  const selectedList = cohortStudents.slice(0, capacity);
                                  const remainingList = cohortStudents.slice(capacity);

                                  return (
                                    <div className="space-y-3 pt-3 border-t border-slate-200/80">
                                      <div className="flex items-center justify-between">
                                        <span className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                                          <Users className="w-3.5 h-3.5 text-[#4F46E5]" /> Priority Cohort Allocation ({cohortStudents.length} Enrolled)
                                        </span>
                                        <span className="text-[10px] font-bold text-slate-500">
                                          Allocated: <strong className="text-indigo-600 font-extrabold">{selectedList.length}</strong> • Remaining: <strong className="text-amber-600 font-extrabold">{remainingList.length}</strong>
                                        </span>
                                      </div>

                                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                        {/* Selected Students Panel */}
                                        <div className="p-3 rounded-xl border border-emerald-200 bg-emerald-50/40 space-y-2">
                                          <div className="flex items-center justify-between text-[11px] font-black text-emerald-900">
                                            <span>[SELECTED] for this evaluation ({selectedList.length}/{capacity})</span>
                                            <span className="text-[9px] bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full uppercase">Top Priority</span>
                                          </div>
                                          <div className="space-y-1 max-h-40 overflow-y-auto pr-1">
                                            {selectedList.map((st, idx) => (
                                              <div key={st.id || idx} className="p-1.5 rounded-lg bg-white border border-emerald-100 text-xs flex items-center justify-between">
                                                <div className="flex items-center gap-1.5 min-w-0">
                                                  <span className="text-[9.5px] font-black font-mono text-emerald-700 bg-emerald-50 px-1 rounded">#{idx + 1}</span>
                                                  <span className="font-bold text-slate-800 truncate">{st.name}</span>
                                                </div>
                                                <span className="text-[9.5px] font-mono text-slate-400 shrink-0">{st.roll_number || st.register_number || st.id}</span>
                                              </div>
                                            ))}
                                          </div>
                                        </div>

                                        {/* Remaining Students Panel */}
                                        <div className="p-3 rounded-xl border border-amber-200 bg-amber-50/40 space-y-2">
                                          <div className="flex items-center justify-between text-[11px] font-black text-amber-900">
                                            <span>REMAINING STUDENTS (Unallocated) ({remainingList.length})</span>
                                            <span className="text-[9px] bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full uppercase">Next Cycle</span>
                                          </div>
                                          <div className="space-y-1 max-h-40 overflow-y-auto pr-1">
                                            {remainingList.length === 0 ? (
                                              <p className="text-[11px] text-emerald-700 italic py-3 text-center">All cohort students are allocated in this cycle!</p>
                                            ) : (
                                              remainingList.map((st, idx) => (
                                                <div key={st.id || idx} className="p-1.5 rounded-lg bg-white border border-amber-100 text-xs flex items-center justify-between">
                                                  <div className="flex items-center gap-1.5 min-w-0">
                                                    <span className="text-[9.5px] font-black font-mono text-amber-700 bg-amber-50 px-1 rounded">#{selectedList.length + idx + 1}</span>
                                                    <span className="font-semibold text-slate-700 truncate">{st.name}</span>
                                                  </div>
                                                  <span className="text-[9.5px] font-mono text-slate-400 shrink-0">{st.roll_number || st.register_number || st.id}</span>
                                                </div>
                                              ))
                                            )}
                                          </div>
                                        </div>
                                      </div>
                                    </div>
                                  );
                                })()}

                                {/* Bottom Summary Bar & Action */}
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3 border-t border-slate-200">
                                  <div className="text-xs text-slate-600 font-semibold space-y-1">
                                    <div>
                                      <strong className="text-indigo-600 font-black">{activeMappedMentorIds.length}</strong> mentor(s) scheduled across <strong className="text-indigo-600 font-black">{totalPeriodsScheduled}</strong> period slot(s)
                                      • Total Capacity: <strong className="text-slate-900 font-black">{camStudentCount} Students</strong>
                                    </div>
                                    {activeMappedMentorIds.length > 0 && (
                                      <div className="flex flex-wrap gap-1 text-[10px] text-slate-500">
                                        {activeMappedMentorIds.map(id => {
                                          const m = mentors.find(x => x.id === id);
                                          const sObj = mentorSlotConfigs[id] || {};
                                          const slotSummary = Object.entries(sObj).map(([sStr, cnt]) => {
                                            const matchP = structuredSlots.find(p => p.timeSlot.toLowerCase().replace(/\s+/g, "") === sStr.toLowerCase().replace(/\s+/g, ""));
                                            return `${matchP?.periodLabel || sStr} (${cnt} st)`;
                                          }).join(", ");
                                          return (
                                            <span key={id} className="bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-md font-medium text-slate-700">
                                              <strong>{m?.name || id}:</strong> {slotSummary}
                                            </span>
                                          );
                                        })}
                                      </div>
                                    )}
                                  </div>
                                  <button
                                    onClick={() => handleAssign(req.id)}
                                    disabled={isAssigning || activeMappedMentorIds.length === 0 || !camStudentCount || camStudentCount < 1}
                                    className="btn-gradient flex items-center gap-2 px-6 py-2.5 rounded-xl text-xs font-extrabold disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer shrink-0"
                                  >
                                    {isAssigning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                                    {isAssigning ? "Dispatching..." : "Assign & Mark Calendar"}
                                  </button>
                                </div>
                              </div>
                            );
                          })()}
                        </>
                  )}
                </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {/* ── CM: All Campus Interviews ── */}
      {isCM && activeTab === "all" && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "Total Sessions", value: interviewsList.length, color: "text-slate-800" },
              { label: "Pending", value: interviewsList.filter(i => (i.status || "").includes("pending")).length, color: "text-amber-700" },
              { label: "Assigned", value: interviewsList.filter(i => i.status === "assigned" || i.status === "pending_verification" || (Array.isArray(i.student_slots) && i.student_slots.length > 0)).length, color: "text-blue-700" },
              { label: "Completed", value: interviewsList.filter(i => i.status === "completed").length, color: "text-emerald-700" },
            ].map(stat => (
              <div key={stat.label} className="bg-white border border-slate-100 rounded-2xl p-4 shadow-card text-center">
                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{stat.label}</div>
                <div className={`text-2xl font-black mt-1 ${stat.color}`}>{stat.value}</div>
              </div>
            ))}
          </div>

          {isLoading ? (
            <div className="bg-white border border-slate-100 rounded-2xl p-10 text-center text-sm text-slate-400 flex items-center justify-center gap-2 shadow-card">
              <Loader2 className="w-4 h-4 animate-spin text-[#4F46E5]" /> Loading...
            </div>
          ) : interviewsList.length === 0 ? (
            <div className="bg-white border border-slate-100 rounded-2xl p-10 text-center shadow-card">
              <BarChart3 className="w-8 h-8 text-slate-300 mx-auto mb-2" />
              <p className="text-sm font-semibold text-slate-500">No interview sessions recorded.</p>
            </div>
          ) : (
            <div className="bg-white border border-slate-100 rounded-2xl shadow-card overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200">
                      {["Subject", "Class", "Type", "Requested By", "Target Date", "Students", "Status", "Actions"].map(h => (
                        <th key={h} className="px-4 py-3 text-left text-[10px] font-black text-slate-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {interviewsList.map(i => (
                      <tr key={i.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-4 py-3 font-bold text-slate-800 whitespace-nowrap">{i.subject}</td>
                        <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{i.class_group || "All"}</td>
                        <td className="px-4 py-3">
                          <span className={`text-[10px] font-black px-2 py-0.5 rounded-full border ${
                            i.type === "external"
                              ? "bg-purple-50 text-purple-700 border-purple-200"
                              : "bg-blue-50 text-blue-700 border-blue-200"
                          }`}>{(i.type || "internal").toUpperCase()}</span>
                        </td>
                        <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{i.mentor_name || "—"}</td>
                        <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{i.target_date || "—"}</td>
                        <td className="px-4 py-3 text-slate-600 text-center">{i.student_count || "—"}</td>
                        <td className="px-4 py-3"><StatusBadge status={i.status || "pending_cm"} /></td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => openRosterModal(i, "students")}
                              title="View Assigned Faculty, Student Roster, Marks & Questions"
                              className="flex items-center gap-1 text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-200 text-[10px] font-extrabold px-2.5 py-1.5 rounded-lg transition-all shadow-2xs cursor-pointer whitespace-nowrap"
                            >
                              <Eye className="w-3.5 h-3.5 text-indigo-600" />
                              Logs &amp; Details
                            </button>
                            {(i.status === "assigned" || i.status === "pending_verification") && (
                              <button
                                onClick={() => handleMarkComplete(i.id)}
                                disabled={isMarkingComplete === i.id}
                                className="flex items-center gap-1 bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-extrabold px-2.5 py-1.5 rounded-lg transition-all disabled:opacity-50 cursor-pointer whitespace-nowrap shadow-2xs"
                              >
                                {isMarkingComplete === i.id
                                  ? <Loader2 className="w-3 h-3 animate-spin" />
                                  : <CheckCircle2 className="w-3 h-3" />
                                }
                                Mark Complete
                              </button>
                            )}
                            {i.type === "internal" ? (
                              <span className="flex items-center gap-1 text-teal-700 bg-teal-50 border border-teal-200 text-[10px] font-bold px-2 py-1 rounded-lg">
                                <User className="w-3 h-3 text-teal-600" /> In-Person
                              </span>
                            ) : i.gmeet_link ? (
                              <a href={i.gmeet_link} target="_blank" rel="noreferrer"
                                className="flex items-center gap-1 text-indigo-600 bg-indigo-50 border border-indigo-200 text-[10px] font-bold px-2 py-1 rounded-lg hover:bg-indigo-100 transition-all">
                                <Video className="w-3 h-3 text-indigo-600" /> Meet
                              </a>
                            ) : null}
                            <button
                              onClick={() => handleDeleteInterview(i.id)}
                              disabled={deletingInterviewId === i.id}
                              title="Delete Interview"
                              className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all border border-transparent hover:border-rose-200 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── KAM/Admin: Region Overview ── */}
      {isKAM && activeTab === "overview" && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "Total Sessions", value: interviewsList.length, color: "text-slate-800" },
              { label: "Pending", value: interviewsList.filter(i => (i.status || "").includes("pending")).length, color: "text-amber-700" },
              { label: "Assigned", value: interviewsList.filter(i => i.status === "assigned" || i.status === "pending_verification" || (Array.isArray(i.student_slots) && i.student_slots.length > 0)).length, color: "text-blue-700" },
              { label: "Completed", value: interviewsList.filter(i => i.status === "completed").length, color: "text-emerald-700" },
            ].map(stat => (
              <div key={stat.label} className="bg-white border border-slate-100 rounded-2xl p-4 shadow-card text-center">
                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{stat.label}</div>
                <div className={`text-2xl font-black mt-1 ${stat.color}`}>{stat.value}</div>
              </div>
            ))}
          </div>

          {isLoading ? (
            <div className="bg-white border border-slate-100 rounded-2xl p-10 text-center text-sm text-slate-400 flex items-center justify-center gap-2 shadow-card">
              <Loader2 className="w-4 h-4 animate-spin text-[#4F46E5]" /> Loading region data...
            </div>
          ) : interviewsList.length === 0 ? (
            <div className="bg-white border border-slate-100 rounded-2xl p-10 text-center shadow-card">
              <BarChart3 className="w-8 h-8 text-slate-300 mx-auto mb-2" />
              <p className="text-sm font-semibold text-slate-500">No interview sessions recorded.</p>
            </div>
          ) : (
            <div className="bg-white border border-slate-100 rounded-2xl shadow-card overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-200">
                <h3 className="text-sm font-black text-slate-800 flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-[#4F46E5]" />
                  Region Interview Summary
                </h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200">
                      {["Subject", "Class", "Type", "Requested By", "Target Date", "Students", "Status", "Actions"].map(h => (
                        <th key={h} className="px-4 py-3 text-left text-[10px] font-black text-slate-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {interviewsList.map(i => (
                      <tr key={i.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-4 py-3 font-bold text-slate-800">{i.subject}</td>
                        <td className="px-4 py-3 text-slate-600">{i.class_group || "All"}</td>
                        <td className="px-4 py-3">
                          <span className={`text-[10px] font-black px-2 py-0.5 rounded-full border ${
                            i.type === "external"
                              ? "bg-purple-50 text-purple-700 border-purple-200"
                              : "bg-blue-50 text-blue-700 border-blue-200"
                          }`}>{(i.type || "internal").toUpperCase()}</span>
                        </td>
                        <td className="px-4 py-3 text-slate-600">{i.mentor_name || "—"}</td>
                        <td className="px-4 py-3 text-slate-600">{i.target_date || "—"}</td>
                        <td className="px-4 py-3 text-slate-600 text-center">{i.student_count || "—"}</td>
                        <td className="px-4 py-3"><StatusBadge status={i.status || "pending_cm"} /></td>
                        <td className="px-4 py-3">
                          <button
                            onClick={() => openRosterModal(i, "students")}
                            title="View Assigned Faculty, Student Roster, Marks & Questions"
                            className="flex items-center gap-1 text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-200 text-[10px] font-extrabold px-2.5 py-1.5 rounded-lg transition-all shadow-2xs cursor-pointer whitespace-nowrap"
                          >
                            <Eye className="w-3.5 h-3.5 text-indigo-600" />
                            Logs &amp; Details
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Student-Level Conducted Status, Assigned Mentors & Audit Logs Modal */}
      {viewingStudentRosterModal && (
        <StudentConductedRosterDrawer
          interview={viewingStudentRosterModal}
          cohortStudents={students}
          evaluations={evaluationsList}
          allMentors={mentors}
          allColleges={activeCollegesList || colleges}
          allSlots={slots}
          userCollegeId={defaultCollegeId || currentMentor?.college_id}
          isCM={isCM}
          initialTab={rosterInitialTab}
          onClose={() => setViewingStudentRosterModal(null)}
        />
      )}

      {/* Priority Split Preview & Confirmation Modal */}
      {activeSplitInterview && splitPreviewResult && (
        <PrioritySplitPreviewDialog
          interview={activeSplitInterview}
          preview={splitPreviewResult}
          isLoading={isLoadingSplit}
          onSave={handleSavePrioritySplit}
          onClose={() => {
            setActiveSplitInterview(null);
            setSplitPreviewResult(null);
          }}
        />
      )}

    </div>
  );
};

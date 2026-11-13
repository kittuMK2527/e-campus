"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { qk } from "@/lib/queryKeys";
import { useToast } from "@/context/ToastContext";
import { useApp } from "@/context/AppContext";
import { LoadingButton } from "./ui/LoadingButton";
import { Dialog } from "@/components/ui/dialog";
import { apiFetch } from "@/lib/apiFetch";
import { getLocalDateStr } from "@/lib/localDate";
import {
  ShieldCheck,
  Building2,
  BookOpen,
  Calendar,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Search,
  Download,
  Filter,
  Users,
  Award,
  Clock,
  ChevronRight,
  ChevronLeft,
  ExternalLink,
  FileSpreadsheet,
  Check,
  X,
  FileText,
  HelpCircle,
  ArrowRight,
  TrendingUp,
  BarChart3,
  ThumbsUp,
  ThumbsDown,
  MessageSquare,
  AlertCircle,
  Sparkles,
  Inbox,
  Send,
  Lock,
  Layers,
  Percent,
  LifeBuoy,
  Handshake,
  Camera,
  RefreshCw,
  MapPin,
  Star,
  ImageIcon,
  History
} from "lucide-react";

// ============================================================================
// 1. DYNAMIC KAM CLUSTER INTERFACES (Loaded directly from Database)
// ============================================================================
export interface KAMClusterInfo {
  kamId: string;
  kamName: string;
  campuses: { id: string; name: string }[];
}

export interface DynamicActiveKAMInfo {
  kam: string;
  kamId: string;
  campuses: string[];
}

// ============================================================================
// 2. DATA INTERFACES
// ============================================================================
export interface SkillAuditRecord {
  uid: string;
  id: string;
  mentor: string;
  campus: string;
  deptName: string;
  department: string;
  subject: string;
  criteria: {
    genuine: boolean;
    weeklyPlan: boolean;
    tracker: boolean;
    assignment: boolean;
    assessment: boolean;
  };
  proof?: {
    assignment?: { link?: string; fileName?: string };
    assessment?: { link?: string; fileName?: string };
  };
  score: number;
  tasksAssigned: number;
  tasksCompleted: number;
  avgCompletionPct: number;
  remarks: string;
  date: string;
  status: "Completed" | "In Progress" | "Not Completed";
}

export interface AcademicAuditRecord {
  uid: string;
  id: string;
  mentor: string;
  campus: string;
  deptName: string;
  department: string;
  subject: string;
  criteria: {
    assignmentGenuine: boolean;
    assessmentGenuine: boolean;
    beforeDeadline: boolean;
    studyMaterial: boolean;
  };
  score: number;
  remarks: string;
  date: string;
  status: "Completed" | "In Progress" | "Not Completed";
}

export interface AttendanceAuditRecord {
  uid: string;
  id: string;
  mentor: string;
  campus: string;
  deptName: string;
  department: string;
  below75: number;
  criteria: {
    markedDaily: boolean;
    crossVerified: boolean;
    noProxy: boolean;
    matchesTracker: boolean;
  };
  score: number;
  remarks: string;
  date: string;
  status: "Completed" | "In Progress" | "Not Completed";
}

export interface PeerAuditRecord {
  uid: string;
  id: string;
  campus: string;
  mentor: string;
  deptName: string;
  department: string;
  kam: string;
  region: string;
  reviewerCampus: string;
  reviewerCM: string;
  weeklyPlan: "Completed" | "In Progress" | "Not Completed";
  skillDev: "Completed" | "In Progress" | "Not Completed";
  academic: "Completed" | "In Progress" | "Not Completed";
  overall: "Completed" | "In Progress" | "Not Completed";
  auditor: string;
  date: string;
  auditorNotes?: string;
  evidenceSnapshot?: {
    skillScore?: number;
    academicScore?: number;
    attendanceScore?: number;
    proofLink?: string;
    remarks?: string;
  };
}

export interface PeerReviewHistoryRecord {
  pairKey: string;
  submittedCampus: string;
  submittedCM: string;
  reviewerCampus: string;
  reviewerCM: string;
  kam: string;
  region: string;
  monthKey: string;
  createdAt: string;
}

export interface CampusAuditManagerProps {
  collegeId?: string;
  collegeName?: string;
  role?: "cam" | "kam" | "admin" | "hr";
  userName?: string;
}

// ============================================================================
// 2b. DATABASE-BACKED CAMPUS AUDIT RECORD INTERFACE
// ============================================================================
export interface CampusAuditDbRecord {
  id: string;
  uid: string;
  college_id?: string;
  campus: string;
  mentor_id?: string;
  mentor_name: string;
  department?: string;
  dept_name?: string;
  subject: string;
  audit_date: string;
  auditor_name?: string;
  auditor_role?: string;

  skill_criteria?: any;
  skill_score: number;
  tasks_assigned: number;
  tasks_completed: number;
  skill_proof_link?: string;
  skill_remarks?: string;

  coursework_criteria?: any;
  coursework_score: number;
  coursework_remarks?: string;

  attendance_criteria?: any;
  attendance_score: number;
  below_75_count: number;
  attendance_remarks?: string;

  kam_id?: string;
  kam_name?: string;
  reviewer_college_id?: string;
  reviewer_campus: string;
  reviewer_cm_name?: string;
  peer_status: "Pending" | "Completed";
  peer_signoff_notes?: string;
  peer_signed_by?: string;
  peer_signed_at?: string;

  overall_status: "In Progress" | "Completed";
  created_at: string;
  updated_at: string;
}

// ============================================================================
// 2b. CLASSROOM OBSERVATION VIEW (form + gallery, college-scoped)
// ============================================================================

const PhotoSlot: React.FC<{
  stage: "start" | "end";
  file: File | null;
  preview: string;
  onPick: (file: File | null, preview: string) => void;
}> = ({ stage, file, preview, onPick }) => {
  const label = stage === "start" ? "Session start" : "Session end";
  return (
    <div className="space-y-1.5">
      <span className="flex items-center gap-1.5 text-[10px] font-black text-slate-600 uppercase tracking-wider">
        <span className={`h-4 w-4 rounded-full text-[9px] font-black text-white flex items-center justify-center ${
          stage === "start" ? "bg-indigo-600" : "bg-orange-600"
        }`}>
          {stage === "start" ? "1" : "2"}
        </span>
        {label} photo
      </span>
      {preview ? (
        <div className="relative inline-block">
          <img src={preview} alt={`${label} evidence`} className="h-28 rounded-xl border border-slate-200 object-cover" />
          <button type="button"
            onClick={() => onPick(null, "")}
            aria-label={`Remove ${label} photo`}
            className="absolute -top-2 -right-2 h-6 w-6 bg-rose-600 text-white rounded-full text-xs font-black cursor-pointer shadow-md">
            ×
          </button>
          <span className="absolute bottom-1 left-1 rounded-md bg-slate-900/70 px-1.5 py-0.5 text-[9px] font-black text-white uppercase">
            {file?.name.slice(0, 18) || "saved"}
          </span>
        </div>
      ) : (
        <label className="inline-flex items-center gap-2 px-4 py-2.5 bg-slate-50 border-2 border-dashed border-slate-300 rounded-xl text-xs font-bold text-slate-500 hover:border-orange-400 hover:text-orange-600 transition-all cursor-pointer">
          <ImageIcon className="h-4 w-4" />
          Choose {label.toLowerCase()} photo
          <input type="file" accept="image/*" className="hidden"
            aria-label={`${label} photo`}
            onChange={(e) => {
              const f = e.target.files?.[0] || null;
              onPick(f, f ? URL.createObjectURL(f) : "");
            }} />
        </label>
      )}
    </div>
  );
};

const OBS_RATING_DIMS = [
  { key: "rating_professionalism", label: "Professionalism" },
  { key: "rating_class_handling", label: "Class Handling" },
  { key: "rating_skill_development", label: "Skill Development" },
  { key: "rating_student_engagement", label: "Student Engagement" },
  { key: "rating_tasks_followup", label: "Tasks Follow-up" },
  { key: "rating_session_plan_adherence", label: "Session Plan Adherence" },
  { key: "rating_study_material_sharing", label: "Material Sharing" }
] as const;

export const ClassObservationView: React.FC<{
  collegeName: string;
  userName: string;
  observations: any[];
  loading: boolean;
  error: string;
  onRefresh: () => void;
  showForm: boolean;
  setShowForm: (v: boolean) => void;
  saving: boolean;
  setSaving: (v: boolean) => void;
  detail: any | null;
  setDetail: (v: any | null) => void;
  readOnly?: boolean;
}> = ({ collegeName, userName, observations, loading, error, onRefresh, showForm, setShowForm, saving, setSaving, detail, setDetail, readOnly = false }) => {
  const { toast } = useToast();
  const [fTeacher, setFTeacher] = useState("");
  const [fDept, setFDept] = useState("");
  const [fSubject, setFSubject] = useState("");
  const [fDate, setFDate] = useState(() => getLocalDateStr());
  const [fPhoto, setFPhoto] = useState<File | null>(null);
  const [fPhotoPreview, setFPhotoPreview] = useState("");
  const [fEndPhoto, setFEndPhoto] = useState<File | null>(null);
  const [fEndPhotoPreview, setFEndPhotoPreview] = useState("");
  const [fRatings, setFRatings] = useState<Record<string, number>>({});
  const [fOverall, setFOverall] = useState(4);
  const [fSatisfaction, setFSatisfaction] = useState<"satisfied" | "not_satisfied">("satisfied");
  const [fRemarks, setFRemarks] = useState("");

  const resetForm = () => {
    setFTeacher(""); setFDept(""); setFSubject("");
    setFDate(getLocalDateStr()); setFPhoto(null); setFPhotoPreview("");
    setFEndPhoto(null); setFEndPhotoPreview("");
    setFRatings({}); setFOverall(4); setFSatisfaction("satisfied"); setFRemarks("");
  };

  const wordCount = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;

  const handleSubmit = async () => {
    if (readOnly) { toast("Read-only portfolio view — observations cannot be logged.", "warning"); return; }
    if (!fTeacher.trim()) { toast("Enter the mentor / teacher observed.", "warning"); return; }
    if (fSatisfaction === "not_satisfied" && wordCount(fRemarks) < 20) {
      toast("For 'Not Satisfied', remarks must be at least 20 words explaining the concerns.", "warning");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        college: collegeName,
        manager_name: userName || null,
        class_name: fDept || null,
        department: fDept || null,
        subject: fSubject || null,
        course_name: fSubject || null,
        teacher_name: fTeacher.trim() || null,
        mentor_name: fTeacher.trim() || null,
        notes: fRemarks || null,
        comments: fRemarks || null,
        observation_date: fDate || null,
        rating_professionalism: fRatings.rating_professionalism ?? null,
        rating_class_handling: fRatings.rating_class_handling ?? null,
        rating_skill_development: fRatings.rating_skill_development ?? null,
        rating_student_engagement: fRatings.rating_student_engagement ?? null,
        rating_tasks_followup: fRatings.rating_tasks_followup ?? null,
        rating_session_plan_adherence: fRatings.rating_session_plan_adherence ?? null,
        rating_study_material_sharing: fRatings.rating_study_material_sharing ?? null,
        overall_rating: fOverall,
        satisfaction_status: fSatisfaction,
        satisfaction_remarks: fRemarks || null
      };
      let data: any;
      if (fPhoto || fEndPhoto) {
        const fd = new FormData();
        if (fPhoto) fd.append("photo", fPhoto);
        if (fEndPhoto) fd.append("photo_end", fEndPhoto);
        fd.append("payload", JSON.stringify(payload));
        data = await apiFetch("/api/audit/observations", { method: "POST", body: fd });
      } else {
        data = await apiFetch("/api/audit/observations", {
          method: "POST",
          body: payload
        });
      }
      if (data.success) {
        toast(
          fSatisfaction === "not_satisfied"
            ? "Observation logged & escalation email sent to senior management."
            : "Classroom observation logged successfully.",
          "success"
        );
        if (fEndPhoto && data.capture_stage_saved === false) {
          toast("Session photo could not be attached. Please try again.", "warning");
        }
        resetForm();
        setShowForm(false);
        onRefresh();
        if (typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent("fp_audits_updated"));
        }
      } else {
        toast(data.message || "Failed to save observation.", "error");
      }
    } catch (e: any) {
      toast("Network error while saving observation.", "error");
    } finally {
      setSaving(false);
    }
  };

  const avgObs = observations.length > 0
    ? Math.round((observations.reduce((s, o) => s + (Number(o.overall_rating) || 0), 0) / observations.length) * 10) / 10
    : null;
  const notSatisfiedCount = observations.filter(o => o.satisfaction_status === "not_satisfied").length;
  const thisMonthCount = observations.filter(o => (o.observation_date || String(o.created_at || "")).slice(0, 7) === new Date().toISOString().slice(0, 7)).length;


  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-card space-y-2">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <Camera className="h-5 w-5 text-orange-600" />
            <div>
              <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider">
                Classroom Observation Log ({collegeName})
              </h3>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onRefresh}
              className="p-2 bg-slate-100 hover:bg-slate-200 rounded-lg text-slate-600 transition-colors cursor-pointer"
              title="Refresh"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            </button>
            <button
              type="button"
              onClick={() => setShowForm(!showForm)}
              disabled={readOnly}
              className={`px-4 py-2 text-xs font-extrabold rounded-xl transition-all cursor-pointer flex items-center gap-1.5 shadow-xs ${
                showForm ? "bg-slate-200 text-slate-700 hover:bg-slate-300" : "bg-orange-600 hover:bg-orange-700 text-white"
              } ${readOnly ? "opacity-40 cursor-not-allowed" : ""}`}
            >
              <Camera className="h-4 w-4" />
              <span>{showForm ? "Close Form" : "Log Observation"}</span>
            </button>
          </div>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-3.5 bg-white border border-slate-100 rounded-2xl shadow-card">
          <span className="text-[10px] font-black uppercase tracking-wider text-slate-500 block">Total Observations</span>
          <div className="text-2xl font-black text-slate-900 mt-1">{observations.length}</div>
        </div>
        <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl shadow-2xs">
          <span className="text-[10px] font-black uppercase tracking-wider text-slate-700 block">This Month</span>
          <div className="text-2xl font-black text-slate-900 mt-1">{thisMonthCount}</div>
        </div>
        <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl shadow-2xs">
          <span className="text-[10px] font-black uppercase tracking-wider text-emerald-700 block">Avg Overall Rating</span>
          <div className="text-2xl font-black text-emerald-900 mt-1">{avgObs ?? "—"}</div>
          <span className="text-[10px] text-emerald-700 font-medium">out of 5</span>
        </div>
        <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl shadow-2xs">
          <span className="text-[10px] font-black uppercase tracking-wider text-rose-700 block">Not Satisfied Flags</span>
          <div className="text-2xl font-black text-rose-900 mt-1">{notSatisfiedCount}</div>
          <span className="text-[10px] text-rose-700 font-medium">escalated</span>
        </div>
      </div>

      {error && (
        <div role="alert" className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-xs font-bold text-rose-700">{error}</div>
      )}

      {/* Entry form */}
      {showForm && !readOnly && (
        <div className="bg-white border-2 border-orange-200 rounded-2xl p-5 shadow-card space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
            <Sparkles className="h-4 w-4 text-orange-500" />
            <span className="text-xs font-black text-slate-800 uppercase tracking-wider">New Observation Entry</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div>
              <label className="block text-[10px] font-black text-slate-600 uppercase tracking-wider mb-1">Mentor / Teacher *</label>
              <input value={fTeacher} onChange={(e) => setFTeacher(e.target.value)} placeholder="Faculty observed" aria-label="Mentor / Teacher"
                className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-medium focus:outline-hidden focus:ring-1 focus:ring-orange-500" />
            </div>
            <div>
              <label className="block text-[10px] font-black text-slate-600 uppercase tracking-wider mb-1">Class / Department</label>
              <input value={fDept} onChange={(e) => setFDept(e.target.value)} placeholder="e.g. B.Sc CS — Sem 3" aria-label="Class / Department"
                className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-medium focus:outline-hidden focus:ring-1 focus:ring-orange-500" />
            </div>
            <div>
              <label className="block text-[10px] font-black text-slate-600 uppercase tracking-wider mb-1">Subject / Course</label>
              <input value={fSubject} onChange={(e) => setFSubject(e.target.value)} placeholder="Subject taught" aria-label="Subject / Course"
                className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-medium focus:outline-hidden focus:ring-1 focus:ring-orange-500" />
            </div>
            <div>
              <label className="block text-[10px] font-black text-slate-600 uppercase tracking-wider mb-1">Observation Date</label>
              <input type="date" value={fDate} onChange={(e) => setFDate(e.target.value)} aria-label="Observation Date"
                className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-medium focus:outline-hidden focus:ring-1 focus:ring-orange-500" />
            </div>
          </div>

          {/* Dimension ratings */}
          <div>
            <span className="text-[10px] font-black text-slate-600 uppercase tracking-wider block mb-2">Dimension Ratings (1–5)</span>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {OBS_RATING_DIMS.map((d) => (
                <div key={d.key} className="flex items-center justify-between bg-slate-50 border border-slate-100 rounded-xl px-3 py-2">
                  <span className="text-[10.5px] font-bold text-slate-700">{d.label}</span>
                  <select
                    value={fRatings[d.key] ?? ""}
                    onChange={(e) => setFRatings(prev => ({ ...prev, [d.key]: Number(e.target.value) }))}
                    className="bg-white border border-slate-200 rounded-lg text-xs font-black min-h-[38px] px-2.5 py-1 cursor-pointer focus:outline-hidden"
                  >
                    <option value="">—</option>
                    {[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{n}</option>)}
                  </select>
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <span className="text-[10px] font-black text-slate-600 uppercase tracking-wider block mb-2">Overall Rating *</span>
              <div className="flex items-center gap-1 sm:gap-2">
                {[1, 2, 3, 4, 5].map(n => (
                  <button key={n} type="button" onClick={() => setFOverall(n)} aria-label={`Rate ${n} out of 5`}
                    className={`min-h-[44px] min-w-[44px] flex items-center justify-center cursor-pointer transition-transform hover:scale-110 ${n <= fOverall ? "text-amber-400" : "text-slate-300"}`}>
                    <Star className={`h-7 w-7 ${n <= fOverall ? "fill-amber-400" : ""}`} />
                  </button>
                ))}
                <span className="text-xs font-black text-slate-600 ml-1">{fOverall}/5</span>
              </div>
            </div>
            <div>
              <span className="text-[10px] font-black text-slate-600 uppercase tracking-wider block mb-2">Satisfaction Status *</span>
              <div className="flex gap-2">
                <button type="button" onClick={() => setFSatisfaction("satisfied")}
                  className={`flex-1 min-h-[44px] py-2 rounded-xl text-xs font-extrabold border transition-all cursor-pointer ${
                    fSatisfaction === "satisfied" ? "bg-emerald-600 text-white border-emerald-600" : "bg-white text-slate-600 border-slate-200 hover:border-emerald-400"
                  }`}>
                  ✓ Satisfied
                </button>
                <button type="button" onClick={() => setFSatisfaction("not_satisfied")}
                  className={`flex-1 min-h-[44px] py-2 rounded-xl text-xs font-extrabold border transition-all cursor-pointer ${
                    fSatisfaction === "not_satisfied" ? "bg-rose-600 text-white border-rose-600" : "bg-white text-slate-600 border-slate-200 hover:border-rose-400"
                  }`}>
                  ✗ Not Satisfied
                </button>
              </div>
            </div>
          </div>

          <div>
            <label className="block text-[10px] font-black text-slate-600 uppercase tracking-wider mb-1">
              {fSatisfaction === "not_satisfied" ? "Remarks (min 20 words, required) *" : "Remarks / Observations"}
            </label>
            <textarea rows={3} value={fRemarks} onChange={(e) => setFRemarks(e.target.value)}
              placeholder="What did you observe during the classroom visit? Teaching quality, engagement, discipline, infrastructure…"
              className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-medium focus:outline-hidden focus:ring-1 focus:ring-orange-500" />
            {fSatisfaction === "not_satisfied" && (
              <span className={`text-[10px] font-bold ${wordCount(fRemarks) >= 20 ? "text-emerald-600" : "text-rose-500"}`}>
                {wordCount(fRemarks)}/20 words minimum
              </span>
            )}
          </div>

          {/* Photo evidence — both stages of the visit */}
          <div>
            <span className="text-[10px] font-black text-slate-600 uppercase tracking-wider block mb-2">
              Classroom Photo Evidence (optional, max 8MB each)
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <PhotoSlot
                stage="start"
                file={fPhoto}
                preview={fPhotoPreview}
                onPick={(f, preview) => { setFPhoto(f); setFPhotoPreview(preview); }}
              />
              <PhotoSlot
                stage="end"
                file={fEndPhoto}
                preview={fEndPhotoPreview}
                onPick={(f, preview) => { setFEndPhoto(f); setFEndPhotoPreview(preview); }}
              />
            </div>
            <p className="mt-1.5 text-[10px] font-semibold text-slate-400">
              A visit recorded with both photos proves the class ran the full session — the start shot is the one
              older entries and exports already use.
            </p>
          </div>

          <div className="flex justify-end pt-1">
            <button type="button" onClick={handleSubmit} disabled={saving}
              className="px-5 py-2.5 bg-orange-600 hover:bg-orange-700 disabled:opacity-60 text-white text-xs font-extrabold rounded-xl transition-all cursor-pointer flex items-center gap-2 shadow-xs">
              {saving ? (
                <><RefreshCw className="h-4 w-4 animate-spin" /><span>Saving…</span></>
              ) : (
                <><Check className="h-4 w-4" /><span>Submit Observation</span></>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Gallery */}
      <div className="bg-white border border-slate-100 rounded-2xl shadow-card overflow-hidden">
        <div className="p-4 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
          <span className="text-xs font-black text-slate-800 uppercase tracking-wider">Observation Ledger</span>
          <span className="text-[10px] font-bold text-slate-500">{observations.length} entries</span>
        </div>
        {loading && observations.length === 0 ? (
          <div className="p-10 text-center text-xs font-bold text-slate-400 animate-pulse">Loading observations…</div>
        ) : observations.length === 0 ? (
          <div className="p-10 text-center space-y-1">
            <Camera className="h-8 w-8 text-slate-300 mx-auto" />
            <p className="text-xs text-slate-400 font-bold">No observations logged for this campus yet.</p>
            <p className="text-[10px] text-slate-400 font-medium">Use &quot;Log Observation&quot; to record your first classroom visit.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100 max-h-[480px] overflow-y-auto">
            {observations.map((o) => {
              const rating = Number(o.overall_rating) || 0;
              const isNotSat = o.satisfaction_status === "not_satisfied";
              return (
                <button key={o.id || o.created_at} type="button" onClick={() => setDetail(o)}
                  className="w-full p-4 flex items-center justify-between hover:bg-slate-50/60 transition-colors text-left cursor-pointer">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="flex -space-x-2 shrink-0">
                      {o.photo_url ? (
                        <img src={o.photo_url} alt="Session start" className="h-11 w-11 rounded-lg object-cover ring-2 ring-white border border-slate-200" />
                      ) : (
                        <div className="h-11 w-11 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center">
                          <Camera className="h-4 w-4 text-slate-400" />
                        </div>
                      )}
                      {o.photo_end_url ? (
                        <img src={o.photo_end_url} alt="Session end" className="h-11 w-11 rounded-lg object-cover ring-2 ring-white border border-orange-300" />
                      ) : null}
                    </div>
                    <div className="min-w-0">
                      <div className="font-bold text-slate-900 text-xs truncate">{o.mentor_name || o.teacher_name || "Unknown mentor"}</div>
                      <div className="text-[10px] text-slate-400 font-medium truncate">
                        {o.department || o.class_name || "—"} · {o.observation_date ? new Date(o.observation_date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : ""}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase border ${
                      isNotSat ? "bg-rose-50 text-rose-700 border-rose-200" : "bg-emerald-50 text-emerald-700 border-emerald-200"
                    }`}>
                      {isNotSat ? "Not Satisfied" : "Satisfied"}
                    </span>
                    <span className={`text-sm font-black ${rating >= 4 ? "text-emerald-600" : rating >= 3 ? "text-amber-500" : "text-rose-500"}`}>
                      {rating || "—"}/5
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
        {/* Detail modal */}
        {detail && (
          <Dialog
            open={true}
            onOpenChange={(next) => { if (!next) setDetail(null); }}
            ariaLabel="Classroom Observation Details"
            overlayClassName="bg-slate-950/60 backdrop-blur-sm p-4"
            panelClassName="max-w-lg max-h-[85vh] overflow-y-auto p-6 space-y-4 rounded-2xl"
          >
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-base font-black text-slate-900">
                    Classroom Observation · {detail.mentor_name || detail.teacher_name || "Unknown"}
                  </h3>
                  <p className="text-[11px] text-slate-500 font-medium mt-0.5">
                    {detail.department || detail.class_name || "—"} · {detail.observation_date ? new Date(detail.observation_date).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" }) : ""}
                  </p>
                </div>
                <button type="button" onClick={() => setDetail(null)} aria-label="Close" className="text-slate-400 hover:text-slate-700 text-xl font-black cursor-pointer">×</button>
              </div>

              {(detail.photo_url || detail.photo_end_url) && (
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { url: detail.photo_url, label: "Session start" },
                    { url: detail.photo_end_url, label: "Session end" }
                  ].map(shots => shots.url ? (
                    <figure key={shots.label} className="space-y-1">
                      <img src={shots.url} alt={shots.label} className="w-full rounded-xl border border-slate-200 object-cover h-40" />
                      <figcaption className="text-[9px] font-black uppercase tracking-wider text-slate-400">{shots.label}</figcaption>
                    </figure>
                  ) : (
                    <div key={shots.label} className="flex h-40 items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50">
                      <span className="text-[9px] font-black uppercase tracking-wider text-slate-300">No {shots.label.toLowerCase()} photo</span>
                    </div>
                  ))}
                </div>
              )}

              <div className="grid grid-cols-2 gap-2 text-[11px]">
                <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-100">
                  <span className="text-[9px] font-black uppercase text-slate-400 block">Subject</span>
                  <span className="font-bold text-slate-700">{detail.subject || detail.course_name || "—"}</span>
                </div>
                <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-100">
                  <span className="text-[9px] font-black uppercase text-slate-400 block">Overall Rating</span>
                  <span className="font-black text-slate-800">{detail.overall_rating || "—"}/5</span>
                </div>
              </div>

              <div>
                <span className="text-[9px] font-black uppercase tracking-wider text-slate-400 block mb-2">Dimension Ratings</span>
                <div className="grid grid-cols-1 gap-1.5">
                  {OBS_RATING_DIMS.map(d => {
                    const v = detail[d.key];
                    if (v == null) return null;
                    return (
                      <div key={d.key} className="flex items-center gap-2">
                        <span className="text-[10.5px] font-bold text-slate-600 w-44 shrink-0">{d.label}</span>
                        <div className="flex-1 bg-slate-100 h-1.5 rounded-full overflow-hidden">
                          <div className="bg-indigo-500 h-full rounded-full" style={{ width: `${(Number(v) / 5) * 100}%` }} />
                        </div>
                        <span className="text-[10px] font-black text-slate-600">{v}/5</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {detail.satisfaction_remarks && (
                <div className={`p-3 rounded-xl border text-[11px] font-medium ${
                  detail.satisfaction_status === "not_satisfied"
                    ? "bg-rose-50 border-rose-200 text-rose-800"
                    : "bg-emerald-50 border-emerald-200 text-emerald-800"
                }`}>
                  <span className="block text-[9px] font-black uppercase tracking-wider mb-1">
                    Remarks · {detail.satisfaction_status === "not_satisfied" ? "Not Satisfied (Escalated)" : "Satisfied"}
                  </span>
                  {detail.satisfaction_remarks}
                </div>
              )}

              {detail.manager_name && (
                <p className="text-[10px] text-slate-400 font-medium">Logged by {detail.manager_name}</p>
              )}
          </Dialog>
        )}
    </div>
  );
};

// ============================================================================
// 3. MAIN COMPONENT
// ============================================================================
export const CampusAuditManager: React.FC<CampusAuditManagerProps> = ({
  collegeId,
  collegeName = "SDNB Vaishnav College for Women",
  role = "cam",
  userName = "Campus Manager"
}) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { mentors = [], subjectsList = [] } = useApp();

  // Dynamic college-scoped mentors & departments from Database
  const collegeMentors = useMemo(() => {
    return (mentors || []).filter(
      (m: any) =>
        (collegeId && m.college_id === collegeId) ||
        (collegeName && (m.college === collegeName || m.college_name === collegeName))
    );
  }, [mentors, collegeId, collegeName]);

  const collegeDepartments = useMemo(() => {
    const depts = new Set<string>();
    collegeMentors.forEach((m: any) => {
      if (m.department) depts.add(m.department);
      if (m.classes) depts.add(m.classes);
    });
    return Array.from(depts);
  }, [collegeMentors]);

  // Main navigation tabs inside the module
  const [activeSubTab, setActiveSubTab] = useState<"assigned" | "submitted" | "record">("assigned");
  const [assignedStatusFilter, setAssignedStatusFilter] = useState<"pending" | "completed">("pending");
  const [auditSubmittedSuccess, setAuditSubmittedSuccess] = useState(false);

  // Database-driven Audits and KAM Cluster States
  const [isSubmittingAudit, setIsSubmittingAudit] = useState(false);
  const [isSigningOffAudit, setIsSigningOffAudit] = useState(false);

  const auditCollegeScope = `${collegeId || ""}|${collegeName || ""}`;
  const campusAuditsQuery = useQuery({
    queryKey: qk.campusAudits(auditCollegeScope),
    queryFn: async () => {
      const data = await apiFetch(
        `/api/audit/campus-audits?collegeId=${encodeURIComponent(collegeId || "")}&collegeName=${encodeURIComponent(collegeName || "")}`
      );
      return data?.success
        ? {
            assignedAudits: (data.assignedAudits || []) as CampusAuditDbRecord[],
            submittedAudits: (data.submittedAudits || []) as CampusAuditDbRecord[],
            activeKAMInfo: data.activeKAMInfo as DynamicActiveKAMInfo | undefined
          }
        : null;
    },
  });
  const assignedAudits = campusAuditsQuery.data?.assignedAudits || [];
  const submittedAudits = campusAuditsQuery.data?.submittedAudits || [];
  const loadingAudits = campusAuditsQuery.isFetching;
  const dynamicKAMInfo: DynamicActiveKAMInfo = campusAuditsQuery.data?.activeKAMInfo || {
    kam: "General Cluster",
    kamId: "",
    campuses: []
  };

  // Real-time synchronization: invalidate when audits are recorded elsewhere.
  useEffect(() => {
    const handleSync = () => {
      queryClient.invalidateQueries({ queryKey: ["campus-audits"] });
    };

    window.addEventListener("fp_audits_updated", handleSync);

    return () => {
      window.removeEventListener("fp_audits_updated", handleSync);
    };
  }, [queryClient]);

  // --------------------------------------------------------------------------
  // RECORD AUDIT WIZARD FORM STATE (Clean, no hardcoded defaults)
  // --------------------------------------------------------------------------
  const [wizardStage, setWizardStage] = useState<1 | 2 | 3 | 4>(1);

  // Setup / Form fields
  const [wizCampus, setWizCampus] = useState(collegeName);
  const [wizMentorMode, setWizMentorMode] = useState<"select" | "custom">("select");
  const [wizMentorId, setWizMentorId] = useState("");
  const [wizMentor, setWizMentor] = useState("");
  const [wizDeptName, setWizDeptName] = useState("");
  const [wizDepartment, setWizDepartment] = useState("");
  const [wizSubject, setWizSubject] = useState("");
  const [wizDate, setWizDate] = useState(getLocalDateStr());

  // Stage 2: Skill criteria
  const [wizSkillGenuine, setWizSkillGenuine] = useState(true);
  const [wizSkillWeeklyPlan, setWizSkillWeeklyPlan] = useState(true);
  const [wizSkillTracker, setWizSkillTracker] = useState(true);
  const [wizSkillAssignment, setWizSkillAssignment] = useState(true);
  const [wizSkillAssessment, setWizSkillAssessment] = useState(true);
  const [wizSkillProofLink, setWizSkillProofLink] = useState("");
  const [wizSkillAssigned, setWizSkillAssigned] = useState<number>(0);
  const [wizSkillCompleted, setWizSkillCompleted] = useState<number>(0);
  const [wizSkillRemarks, setWizSkillRemarks] = useState("");

  // Stage 3: Coursework criteria
  const [wizAcadAssignment, setWizAcadAssignment] = useState(true);
  const [wizAcadAssessment, setWizAcadAssessment] = useState(true);
  const [wizAcadBeforeDeadline, setWizAcadBeforeDeadline] = useState(true);
  const [wizAcadStudyMaterial, setWizAcadStudyMaterial] = useState(true);
  const [wizAcadRemarks, setWizAcadRemarks] = useState("");

  // Stage 4: Attendance criteria
  const [wizAttMarkedDaily, setWizAttMarkedDaily] = useState(true);
  const [wizAttCrossVerified, setWizAttCrossVerified] = useState(true);
  const [wizAttNoProxy, setWizAttNoProxy] = useState(true);
  const [wizAttMatchesTracker, setWizAttMatchesTracker] = useState(true);
  const [wizAttBelow75, setWizAttBelow75] = useState<number>(0);
  const [wizAttRemarks, setWizAttRemarks] = useState("");

  // Sync wizCampus when collegeName prop updates
  useEffect(() => {
    if (collegeName) setWizCampus(collegeName);
  }, [collegeName]);

  // Calculate scores
  const calculatedSkillScore = useMemo(() => {
    const checks = [wizSkillGenuine, wizSkillWeeklyPlan, wizSkillTracker, wizSkillAssignment, wizSkillAssessment];
    const met = checks.filter(Boolean).length;
    return Math.round((met / checks.length) * 100);
  }, [wizSkillGenuine, wizSkillWeeklyPlan, wizSkillTracker, wizSkillAssignment, wizSkillAssessment]);

  const calculatedAcadScore = useMemo(() => {
    const checks = [wizAcadAssignment, wizAcadAssessment, wizAcadBeforeDeadline, wizAcadStudyMaterial];
    const met = checks.filter(Boolean).length;
    return Math.round((met / checks.length) * 100);
  }, [wizAcadAssignment, wizAcadAssessment, wizAcadBeforeDeadline, wizAcadStudyMaterial]);

  const calculatedAttScore = useMemo(() => {
    const checks = [wizAttMarkedDaily, wizAttCrossVerified, wizAttNoProxy, wizAttMatchesTracker];
    const met = checks.filter(Boolean).length;
    return Math.round((met / checks.length) * 100);
  }, [wizAttMarkedDaily, wizAttCrossVerified, wizAttNoProxy, wizAttMatchesTracker]);

  // Submit complete 4-stage audit to database
  const handleCompleteWizard = async () => {
    if (!wizMentor.trim()) {
      toast("Please select or enter the mentor's name before submitting.", "warning");
      return;
    }
    if (!wizSubject.trim()) {
      toast("Please enter the subject / course title.", "warning");
      return;
    }

    setIsSubmittingAudit(true);
    try {
      const payload = {
        college_id: collegeId,
        campus: wizCampus,
        mentor_id: wizMentorId || null,
        mentor_name: wizMentor.trim(),
        department: wizDepartment || wizDeptName,
        dept_name: wizDeptName || wizDepartment,
        subject: wizSubject.trim(),
        audit_date: wizDate,
        auditor_name: userName,
        auditor_role: role,

        skill_criteria: {
          genuine: wizSkillGenuine,
          weeklyPlan: wizSkillWeeklyPlan,
          tracker: wizSkillTracker,
          assignment: wizSkillAssignment,
          assessment: wizSkillAssessment
        },
        skill_score: calculatedSkillScore,
        tasks_assigned: wizSkillAssigned,
        tasks_completed: wizSkillCompleted,
        skill_proof_link: wizSkillProofLink,
        skill_remarks: wizSkillRemarks,

        coursework_criteria: {
          assignmentGenuine: wizAcadAssignment,
          assessmentGenuine: wizAcadAssessment,
          beforeDeadline: wizAcadBeforeDeadline,
          studyMaterial: wizAcadStudyMaterial
        },
        coursework_score: calculatedAcadScore,
        coursework_remarks: wizAcadRemarks,

        attendance_criteria: {
          markedDaily: wizAttMarkedDaily,
          crossVerified: wizAttCrossVerified,
          noProxy: wizAttNoProxy,
          matchesTracker: wizAttMatchesTracker
        },
        attendance_score: calculatedAttScore,
        below_75_count: wizAttBelow75,
        attendance_remarks: wizAttRemarks
      };

      const data = await apiFetch("/api/audit/campus-audits", {
        method: "POST",
        body: payload
      });
      if (data.success) {
        toast(data.message || "Audit recorded and dispatched to peer reviewer.", "success");
        await queryClient.invalidateQueries({ queryKey: ["campus-audits"] });
        if (typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent("fp_audits_updated"));
        }
        setWizardStage(1);
        setWizMentor("");
        setWizMentorId("");
        setWizDeptName("");
        setWizDepartment("");
        setWizSubject("");
        setWizSkillProofLink("");
        setWizSkillAssigned(0);
        setWizSkillCompleted(0);
        setWizSkillRemarks("");
        setWizAcadRemarks("");
        setWizAttRemarks("");
        setWizAttBelow75(0);
        setAuditSubmittedSuccess(true);
        setActiveSubTab("record");
      } else {
        toast(data.message || "Failed to record audit.", "error");
      }
    } catch (err) {
      toast("Network error while submitting audit.", "error");
    } finally {
      setIsSubmittingAudit(false);
    }
  };

  // --------------------------------------------------------------------------
  // PEER REVIEW SIGN-OFF HANDLER
  // --------------------------------------------------------------------------
  const [selectedPeerAuditForReview, setSelectedPeerAuditForReview] = useState<CampusAuditDbRecord | null>(null);
  const [signOffNotes, setSignOffNotes] = useState("");

  // Incoming peer reviews assigned to this campus (Pending sign-off)
  const incomingPeerReviews = useMemo(() => {
    return assignedAudits.filter((a) => a.peer_status !== "Completed");
  }, [assignedAudits]);

  // Completed peer reviews assigned to this campus (Already signed off)
  const completedPeerReviews = useMemo(() => {
    return assignedAudits.filter((a) => a.peer_status === "Completed");
  }, [assignedAudits]);

  const handleSignOffPeerReview = async () => {
    if (!selectedPeerAuditForReview) return;
    if (role === "kam") {
      toast("Policy Notice: Senior Managers (KAMs) cannot sign off on peer reviews. Peer sign-offs must be conducted by Campus Managers.", "error");
      return;
    }
    if (!signOffNotes.trim()) {
      toast("Please provide reviewer inspection notes before signing off.", "warning");
      return;
    }

    setIsSigningOffAudit(true);
    try {
      const data = await apiFetch("/api/audit/campus-audits", {
        method: "PATCH",
        body: {
          id: selectedPeerAuditForReview.id,
          signoff_notes: signOffNotes.trim(),
          signed_by: userName,
          user_role: role
        }
      });
      if (data.success) {
        toast(`Official Peer Review signed off for ${selectedPeerAuditForReview.campus}!`, "success");
        setSelectedPeerAuditForReview(null);
        setSignOffNotes("");
        await queryClient.invalidateQueries({ queryKey: ["campus-audits"] });
        if (typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent("fp_audits_updated"));
        }
      } else {
        toast(data.message || "Failed to sign off peer review.", "error");
      }
    } catch (err) {
      toast("Network error during peer sign-off.", "error");
    } finally {
      setIsSigningOffAudit(false);
    }
  };


  return (
    <div className="space-y-6 font-sans">
      {/* ==================================================================== */}
      {/* 1. TOP HEADER & STREAMLINED 3-TAB NAVIGATION                        */}
      {/* ==================================================================== */}
      <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-card space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-600 flex items-center justify-center text-white shadow-xs">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-sm font-black text-slate-900 uppercase tracking-wider">
                  Campus E-Audit
                </h2>
                <span className="px-2.5 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 text-[10px] font-black uppercase flex items-center gap-1">
                  <Building2 className="h-3 w-3 text-emerald-600" />
                  <span>{collegeName}</span>
                </span>
                <span className="px-2.5 py-0.5 rounded-full bg-indigo-50 border border-indigo-200 text-indigo-700 text-[10px] font-extrabold flex items-center gap-1">
                  <span>{dynamicKAMInfo.kam || "KAM Cluster"}</span>
                  {dynamicKAMInfo.campuses.length > 0 && (
                    <>
                      <span className="text-indigo-400">•</span>
                      <span>{dynamicKAMInfo.campuses.length} Campuses</span>
                    </>
                  )}
                </span>
              </div>
              <p className="text-[11.5px] text-slate-500 font-medium mt-0.5">
                Record operational mentor audits and review incoming peer audits assigned to your campus.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => campusAuditsQuery.refetch()}
              disabled={loadingAudits}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-50 text-xs font-bold transition-all cursor-pointer shadow-xs"
              title="Refresh audits list"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loadingAudits ? "animate-spin" : ""}`} />
              <span>Refresh</span>
            </button>
          </div>
        </div>

        {/* Dynamic Database-Driven Tab Navigation */}
        <div className="flex items-center gap-2 pt-1 border-t border-slate-100 flex-wrap">
          <button
            type="button"
            onClick={() => setActiveSubTab("assigned")}
            className={`px-4 py-2 text-xs font-black rounded-xl transition-all cursor-pointer flex items-center gap-2 ${
              activeSubTab === "assigned"
                ? "bg-emerald-600 text-white shadow-xs"
                : "bg-slate-100 hover:bg-slate-200 text-slate-600"
            }`}
          >
            <Inbox className="h-4 w-4" />
            <span>Assigned Audits</span>
            {incomingPeerReviews.length > 0 && (
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                activeSubTab === "assigned" ? "bg-white text-emerald-800" : "bg-amber-500 text-white animate-pulse"
              }`}>
                {incomingPeerReviews.length} Pending
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab("submitted")}
            className={`px-4 py-2 text-xs font-black rounded-xl transition-all cursor-pointer flex items-center gap-2 ${
              activeSubTab === "submitted"
                ? "bg-emerald-600 text-white shadow-xs"
                : "bg-slate-100 hover:bg-slate-200 text-slate-600"
            }`}
          >
            <ShieldCheck className="h-4 w-4" />
            <span>Our Campus Audits</span>
            {submittedAudits.length > 0 && (
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                activeSubTab === "submitted" ? "bg-white text-emerald-800" : "bg-slate-200 text-slate-700"
              }`}>
                {submittedAudits.length}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveSubTab("record");
              setAuditSubmittedSuccess(false);
            }}
            className={`px-4 py-2 text-xs font-black rounded-xl transition-all cursor-pointer flex items-center gap-2 ${
              activeSubTab === "record"
                ? "bg-emerald-600 text-white shadow-xs"
                : "bg-slate-100 hover:bg-slate-200 text-slate-600"
            }`}
          >
            <Send className="h-4 w-4" />
            <span>+ Record New Audit</span>
          </button>
        </div>
      </div>

      {/* ==================================================================== */}
      {/* VIEW 1: ASSIGNED AUDITS (INBOX & SIGN-OFF)                           */}
      {/* ==================================================================== */}
      {activeSubTab === "assigned" && (
        <div className="space-y-4">
          {/* Header & Sub-filter pills */}
          <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-card flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Inbox className="h-4 w-4 text-emerald-600" />
              <span className="text-xs font-black text-slate-800 uppercase tracking-wider">
                Audits Assigned to {collegeName}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setAssignedStatusFilter("pending")}
                className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center gap-1.5 ${
                  assignedStatusFilter === "pending"
                    ? "bg-amber-100 text-amber-900 border border-amber-300 shadow-2xs"
                    : "bg-slate-100 hover:bg-slate-200 text-slate-600"
                }`}
              >
                <span>Pending Sign-Off ({incomingPeerReviews.length})</span>
              </button>

              <button
                type="button"
                onClick={() => setAssignedStatusFilter("completed")}
                className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center gap-1.5 ${
                  assignedStatusFilter === "completed"
                    ? "bg-emerald-100 text-emerald-900 border border-emerald-300 shadow-2xs"
                    : "bg-slate-100 hover:bg-slate-200 text-slate-600"
                }`}
              >
                <span>Signed-Off / Completed ({completedPeerReviews.length})</span>
              </button>
            </div>
          </div>

          {/* Pending Sign-Off List */}
          {assignedStatusFilter === "pending" && (
            <div>
              {incomingPeerReviews.length === 0 ? (
                <div className="bg-white border border-slate-100 rounded-2xl p-12 text-center shadow-card space-y-3">
                  <CheckCircle2 className="h-12 w-12 text-emerald-500 mx-auto" />
                  <h4 className="text-sm font-extrabold text-slate-800">Your Assigned Audits Queue is Clear</h4>
                  <p className="text-xs text-slate-400 max-w-md mx-auto leading-relaxed">
                    No incoming audits currently pending your sign-off. When peer colleges in your {dynamicKAMInfo.kam || "KAM"} cluster submit mentor audits for review, they will appear here automatically.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setActiveSubTab("record");
                      setAuditSubmittedSuccess(false);
                    }}
                    className="mt-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black rounded-xl transition-all cursor-pointer inline-flex items-center gap-1.5 shadow-xs"
                  >
                    <Send className="h-3.5 w-3.5" />
                    <span>Record an Audit for Your Campus &rarr;</span>
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {incomingPeerReviews.map((audit) => (
                    <div key={audit.id || audit.uid} className="bg-white border border-slate-100 rounded-2xl p-5 shadow-card space-y-4">
                      <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                        <div>
                          <span className="font-mono text-[10px] text-slate-400 font-bold block">{audit.id}</span>
                          <div className="font-extrabold text-slate-900 text-sm mt-0.5">{audit.mentor_name || (audit as any).mentor}</div>
                          <div className="text-xs text-indigo-700 font-bold flex items-center gap-1 mt-0.5">
                            <Building2 className="h-3 w-3" />
                            <span>{audit.campus}</span>
                            <span>•</span>
                            <span className="text-slate-500">{audit.dept_name || (audit as any).deptName || audit.department}</span>
                          </div>
                          {audit.subject && (
                            <div className="text-[11px] text-slate-500 font-medium mt-0.5">
                              Subject: <span className="font-semibold text-slate-700">{audit.subject}</span>
                            </div>
                          )}
                        </div>
                        <span className="px-2.5 py-1 rounded-full bg-amber-50 border border-amber-200 text-amber-800 text-[10px] font-black uppercase">
                          Pending Sign-Off
                        </span>
                      </div>

                      {/* Evidence Snapshot Card */}
                      <div className="p-3.5 bg-slate-50 border border-slate-100 rounded-xl space-y-2">
                        <span className="text-[10px] font-black uppercase tracking-wider text-slate-500 block">Submitted Evidence Snapshot</span>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-center">
                          <div className="p-2 bg-white rounded-2xl border border-slate-100 shadow-card">
                            <span className="text-[9px] text-slate-400 block font-bold">Skill Score</span>
                            <span className="font-mono font-black text-xs text-indigo-600">{audit.skill_score ?? (audit as any).evidenceSnapshot?.skillScore ?? 0}%</span>
                          </div>
                          <div className="p-2 bg-white rounded-2xl border border-slate-100 shadow-card">
                            <span className="text-[9px] text-slate-400 block font-bold">Coursework</span>
                            <span className="font-mono font-black text-xs text-teal-600">{audit.coursework_score ?? (audit as any).evidenceSnapshot?.academicScore ?? 0}%</span>
                          </div>
                          <div className="p-2 bg-white rounded-2xl border border-slate-100 shadow-card">
                            <span className="text-[9px] text-slate-400 block font-bold">Attendance</span>
                            <span className="font-mono font-black text-xs text-purple-600">{audit.attendance_score ?? (audit as any).evidenceSnapshot?.attendanceScore ?? 0}%</span>
                          </div>
                        </div>

                        {(audit.skill_proof_link || (audit as any).evidenceSnapshot?.proofLink) && (
                          <div className="pt-1">
                            <a
                              href={audit.skill_proof_link || (audit as any).evidenceSnapshot?.proofLink}
                              target="_blank"
                              rel="noreferrer"
                              className="text-xs text-indigo-600 font-bold underline inline-flex items-center gap-1 hover:text-indigo-800 transition-colors"
                            >
                              <span>Inspect Student Code / Task Proof Repository</span>
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          </div>
                        )}

                        {(audit.skill_remarks || (audit as any).evidenceSnapshot?.remarks) && (
                          <p className="text-[11px] text-slate-600 italic bg-white p-2 rounded-lg border border-slate-100">
                            &ldquo;{audit.skill_remarks || (audit as any).evidenceSnapshot?.remarks}&rdquo;
                          </p>
                        )}
                      </div>

                      {/* Reviewer inspection form */}
                      <div className="space-y-3 pt-1">
                        <div>
                          <label className="block text-[11px] font-bold text-slate-700 mb-1">
                            Reviewer Sign-Off Inspection Notes *
                          </label>
                          <textarea
                            rows={2}
                            aria-label="Reviewer Sign-Off Inspection Notes"
                            value={selectedPeerAuditForReview?.id === audit.id ? signOffNotes : ""}
                            onChange={(e) => {
                              setSelectedPeerAuditForReview(audit);
                              setSignOffNotes(e.target.value);
                            }}
                            placeholder="Enter verification findings and sign-off remarks..."
                            className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:outline-hidden focus:ring-1 focus:ring-emerald-500"
                          />
                        </div>

                        <div className="flex items-center justify-end">
                          <LoadingButton
                            type="button"
                            isLoading={isSigningOffAudit && selectedPeerAuditForReview?.id === audit.id}
                            loadingText="Signing Off..."
                            onClick={() => {
                              setSelectedPeerAuditForReview(audit);
                              handleSignOffPeerReview();
                            }}
                            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold rounded-xl transition-all cursor-pointer flex items-center gap-1.5 shadow-xs"
                          >
                            <Check className="h-4 w-4" />
                            <span>Sign Off Peer Review</span>
                          </LoadingButton>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Completed Sign-Offs List */}
          {assignedStatusFilter === "completed" && (
            <div>
              {completedPeerReviews.length === 0 ? (
                <div className="bg-white border border-slate-100 rounded-2xl p-12 text-center shadow-card space-y-2">
                  <p className="text-xs text-slate-400 font-medium">No completed peer reviews signed off yet.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {completedPeerReviews.map((audit) => (
                    <div key={audit.id || audit.uid} className="bg-white border border-slate-100 rounded-2xl p-5 shadow-card space-y-3">
                      <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                        <div>
                          <span className="font-mono text-[10px] text-slate-400 font-bold block">{audit.id}</span>
                          <div className="font-extrabold text-slate-900 text-sm mt-0.5">{audit.mentor_name || (audit as any).mentor}</div>
                          <div className="text-xs text-indigo-700 font-bold flex items-center gap-1 mt-0.5">
                            <Building2 className="h-3 w-3" />
                            <span>{audit.campus}</span>
                            <span>•</span>
                            <span className="text-slate-500">{audit.dept_name || (audit as any).deptName || audit.department}</span>
                          </div>
                          {audit.subject && (
                            <div className="text-[11px] text-slate-500 font-medium mt-0.5">
                              Subject: <span className="font-semibold text-slate-700">{audit.subject}</span>
                            </div>
                          )}
                        </div>
                        <span className="px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 text-[10px] font-black uppercase flex items-center gap-1">
                          <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                          <span>Signed Off</span>
                        </span>
                      </div>

                      <div className="p-3 bg-emerald-50/50 border border-emerald-100 rounded-xl space-y-1">
                        <span className="text-[10px] font-black uppercase text-emerald-800 block">Sign-Off Notes</span>
                        <p className="text-xs text-emerald-950 font-medium">{audit.peer_signoff_notes || (audit as any).auditorNotes || "Peer audit verified and approved."}</p>
                        <div className="flex items-center justify-between text-[10px] text-slate-400 pt-1">
                          <span>Audit Date: {audit.audit_date || (audit as any).date}</span>
                          {audit.peer_signed_by && <span>Signed by: {audit.peer_signed_by}</span>}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ==================================================================== */}
      {/* VIEW 1B: OUR CAMPUS SUBMITTED AUDITS (LEDGER & PEER STATUS)          */}
      {/* ==================================================================== */}
      {activeSubTab === "submitted" && (
        <div className="space-y-4">
          <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-card flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-emerald-600" />
              <span className="text-xs font-black text-slate-800 uppercase tracking-wider">
                Audits Recorded by {collegeName} ({submittedAudits.length})
              </span>
            </div>

            <button
              type="button"
              onClick={() => {
                setWizardStage(1);
                setAuditSubmittedSuccess(false);
                setActiveSubTab("record");
              }}
              className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black cursor-pointer shadow-xs transition-colors flex items-center gap-1"
            >
              <Send className="h-3.5 w-3.5" />
              <span>+ Record New Audit</span>
            </button>
          </div>

          {submittedAudits.length === 0 ? (
            <div className="bg-white border border-slate-100 rounded-2xl p-12 text-center shadow-card space-y-3">
              <FileText className="h-12 w-12 text-slate-300 mx-auto" />
              <h4 className="text-sm font-extrabold text-slate-800">No Campus Audits Recorded Yet</h4>
              <p className="text-xs text-slate-400 max-w-md mx-auto leading-relaxed">
                Use the Record Audit Form wizard to evaluate mentor delivery, verify GitHub lab proofs, and automatically route to intra-KAM peers.
              </p>
              <button
                type="button"
                onClick={() => {
                  setActiveSubTab("record");
                  setWizardStage(1);
                }}
                className="mt-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black rounded-xl transition-all cursor-pointer inline-flex items-center gap-1.5 shadow-xs"
              >
                <Send className="h-3.5 w-3.5" />
                <span>Launch Audit Wizard &rarr;</span>
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {submittedAudits.map((audit) => (
                <div key={audit.id || audit.uid} className="bg-white border border-slate-100 rounded-2xl p-5 shadow-card space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                    <div>
                      <span className="font-mono text-[10px] text-slate-400 font-bold block">{audit.id}</span>
                      <div className="font-extrabold text-slate-900 text-sm mt-0.5">{audit.mentor_name}</div>
                      <div className="text-xs text-slate-500 font-medium mt-0.5">
                        {audit.dept_name} • {audit.subject}
                      </div>
                    </div>
                    {audit.peer_status === "Completed" ? (
                      <span className="px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 text-[10px] font-black uppercase flex items-center gap-1">
                        <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                        <span>Peer Verified</span>
                      </span>
                    ) : (
                      <span className="px-2.5 py-1 rounded-full bg-amber-50 border border-amber-200 text-amber-800 text-[10px] font-black uppercase">
                        Pending Peer Sign-Off
                      </span>
                    )}
                  </div>

                  {/* Routing Details */}
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 text-xs space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold text-slate-500 uppercase">Assigned Peer Reviewer</span>
                      <span className="font-bold text-slate-800">{audit.reviewer_campus || "Intra-KAM Peer Campus"}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold text-slate-500 uppercase">KAM Cluster</span>
                      <span className="font-semibold text-slate-700">{audit.kam_name || dynamicKAMInfo.kam}</span>
                    </div>
                    <div className="flex items-center justify-between text-[10px] text-slate-400">
                      <span>Conducted: {audit.audit_date}</span>
                      <span>By: {audit.auditor_name || "Campus Manager"}</span>
                    </div>
                  </div>

                  {/* Scores */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-center">
                    <div className="p-2 bg-slate-50 rounded-lg border border-slate-200">
                      <span className="text-[9px] text-slate-400 block font-bold">Skill Score</span>
                      <span className="font-mono font-black text-xs text-indigo-600">{audit.skill_score}%</span>
                    </div>
                    <div className="p-2 bg-slate-50 rounded-lg border border-slate-200">
                      <span className="text-[9px] text-slate-400 block font-bold">Coursework</span>
                      <span className="font-mono font-black text-xs text-teal-600">{audit.coursework_score}%</span>
                    </div>
                    <div className="p-2 bg-slate-50 rounded-lg border border-slate-200">
                      <span className="text-[9px] text-slate-400 block font-bold">Attendance</span>
                      <span className="font-mono font-black text-xs text-purple-600">{audit.attendance_score}%</span>
                    </div>
                  </div>

                  {/* Peer Review Notes if Completed */}
                  {audit.peer_status === "Completed" && audit.peer_signoff_notes && (
                    <div className="p-3 bg-emerald-50/50 border border-emerald-100 rounded-xl space-y-1">
                      <span className="text-[10px] font-black uppercase text-emerald-800 block">Peer Sign-Off Inspection Notes</span>
                      <p className="text-xs text-emerald-950 font-medium">&ldquo;{audit.peer_signoff_notes}&rdquo;</p>
                      <div className="flex items-center justify-between text-[10px] text-emerald-700 pt-1">
                        <span>Signed by: {audit.peer_signed_by || audit.reviewer_campus}</span>
                        {audit.peer_signed_at && <span>{audit.peer_signed_at}</span>}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ==================================================================== */}
      {/* VIEW 2: 4-STAGE RECORD AUDIT WIZARD                                 */}
      {/* ==================================================================== */}
      {activeSubTab === "record" && (
        <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-card space-y-6 max-w-3xl mx-auto">
          {/* Audit Submitted Success Banner */}
          {auditSubmittedSuccess && (
            <div className="p-5 bg-emerald-50 border-2 border-emerald-200 rounded-2xl space-y-3 animate-fadeIn">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="h-8 w-8 text-emerald-600 shrink-0" />
                <div>
                  <h4 className="text-sm font-black text-emerald-900">Audit Recorded &amp; Dispatched Successfully!</h4>
                  <p className="text-xs text-emerald-700 font-medium mt-0.5">
                    Your mentor audit has been saved to the ledger and automatically routed to an intra-KAM peer campus for verification.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 pt-2 border-t border-emerald-200">
                <button
                  type="button"
                  onClick={() => {
                    setAuditSubmittedSuccess(false);
                    setWizardStage(1);
                  }}
                  className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black cursor-pointer shadow-xs transition-colors"
                >
                  + Record Another Mentor Audit
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAuditSubmittedSuccess(false);
                    setActiveSubTab("assigned");
                  }}
                  className="px-3.5 py-1.5 rounded-xl bg-white border border-emerald-300 text-emerald-800 hover:bg-emerald-100 text-xs font-bold cursor-pointer transition-colors"
                >
                  Go to Assigned Audits
                </button>
              </div>
            </div>
          )}

          {/* Wizard Step Progress Tracker */}
          <div className="border-b border-slate-100 pb-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider">
                  Campus E-Audit Recording Wizard
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Step {wizardStage} of 4:{" "}
                  {wizardStage === 1
                    ? "Audit Setup & Scope"
                    : wizardStage === 2
                    ? "Skill Development Verification"
                    : wizardStage === 3
                    ? "Coursework Delivery Verification"
                    : "Attendance Integrity & Peer Routing"}
                </p>
              </div>
              <span className="px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-800 text-xs font-black">
                {wizardStage === 1 ? "25%" : wizardStage === 2 ? "50%" : wizardStage === 3 ? "75%" : "100%"} Complete
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 mt-4">
              {[1, 2, 3, 4].map((step) => (
                <div
                  key={step}
                  className={`h-1.5 rounded-full transition-all ${
                    step <= wizardStage ? "bg-emerald-600" : "bg-slate-100"
                  }`}
                />
              ))}
            </div>
          </div>

          {/* STAGE 1: SETUP */}
          {wizardStage === 1 && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Audited Campus</label>
                  <input
                    type="text"
                    disabled
                    aria-label="Audited Campus"
                    value={wizCampus}
                    className="w-full px-3 py-2 bg-slate-100 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 cursor-not-allowed"
                  />
                  <span className="text-[10px] text-slate-400 mt-1 block">Locked to your active campus assignment.</span>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-bold text-slate-700">Mentor Name *</label>
                    {collegeMentors.length > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          setWizMentorMode(wizMentorMode === "select" ? "custom" : "select");
                          setWizMentor("");
                          setWizMentorId("");
                        }}
                        className="text-[10.5px] font-bold text-indigo-600 hover:text-indigo-800 cursor-pointer underline"
                      >
                        {wizMentorMode === "select" ? "Enter Custom Name" : "Choose from Mentors"}
                      </button>
                    )}
                  </div>

                  {wizMentorMode === "select" && collegeMentors.length > 0 ? (
                    <select
                      aria-label="Mentor Name"
                      value={wizMentorId}
                      onChange={(e) => {
                        const selectedId = e.target.value;
                        setWizMentorId(selectedId);
                        const m = collegeMentors.find((item) => String(item.id) === selectedId);
                        if (m) {
                          setWizMentor(m.name || "");
                          if ((m as any).department) {
                            setWizDeptName((m as any).department);
                            setWizDepartment((m as any).department);
                          }
                          if ((m as any).subject) {
                            setWizSubject((m as any).subject);
                          }
                        } else {
                          setWizMentor("");
                        }
                      }}
                      className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-hidden focus:ring-1 focus:ring-emerald-500 bg-white"
                    >
                      <option value="">Select Mentor ({collegeMentors.length} active)...</option>
                      {collegeMentors.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name} {(m as any).department ? `(${ (m as any).department })` : ""}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="text"
                      aria-label="Mentor Name"
                      value={wizMentor}
                      onChange={(e) => setWizMentor(e.target.value)}
                      placeholder="Enter mentor's full name"
                      className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-hidden focus:ring-1 focus:ring-emerald-500"
                    />
                  )}
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Department / Course *</label>
                  {collegeDepartments.length > 0 ? (
                    <select
                      aria-label="Department / Course"
                      value={wizDeptName}
                      onChange={(e) => {
                        setWizDeptName(e.target.value);
                        setWizDepartment(e.target.value);
                      }}
                      className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-hidden focus:ring-1 focus:ring-emerald-500 bg-white"
                    >
                      <option value="">Select Department ({collegeDepartments.length} active)...</option>
                      {collegeDepartments.map((deptName) => (
                        <option key={deptName} value={deptName}>
                          {deptName}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="text"
                      aria-label="Department / Course"
                      value={wizDeptName}
                      onChange={(e) => {
                        setWizDeptName(e.target.value);
                        setWizDepartment(e.target.value);
                      }}
                      placeholder="Enter department or course"
                      className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-hidden focus:ring-1 focus:ring-emerald-500"
                    />
                  )}
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Skill / Academic Subject *</label>
                  <input
                    type="text"
                    aria-label="Skill / Academic Subject"
                    value={wizSubject}
                    onChange={(e) => setWizSubject(e.target.value)}
                    placeholder="Enter subject or course module"
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-hidden focus:ring-1 focus:ring-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Audit Conducted Date</label>
                  <input
                    type="date"
                    aria-label="Audit Conducted Date"
                    value={wizDate}
                    onChange={(e) => setWizDate(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-bold text-slate-800"
                  />
                </div>
              </div>

              <div className="pt-4 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setActiveSubTab("assigned")}
                  className="px-4 py-2 border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-bold rounded-xl transition-all cursor-pointer"
                >
                  &larr; Cancel / Back
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (!wizMentor.trim()) {
                      toast("Please enter the mentor's name.", "warning");
                      return;
                    }
                    setWizardStage(2);
                  }}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold rounded-xl transition-all cursor-pointer flex items-center gap-1.5 shadow-xs"
                >
                  <span>Continue to Skill Verification</span>
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}

          {/* STAGE 2: SKILL QUALITY VERIFICATION */}
          {wizardStage === 2 && (
            <div className="space-y-4">
              <div className="bg-indigo-50/60 border border-indigo-100 rounded-xl p-3 flex items-center justify-between">
                <div>
                  <span className="text-xs font-extrabold text-indigo-900 block">Stage 2: Skill Development Quality Check</span>
                  <span className="text-[10px] text-indigo-700">Calculated Score: {calculatedSkillScore}%</span>
                </div>
                <Award className="h-5 w-5 text-indigo-600" />
              </div>

              <div className="space-y-2 border border-slate-200 rounded-xl p-4">
                {[
                  { label: "Are daily student task tracker marks genuine (no arbitrary marks)?", val: wizSkillGenuine, set: setWizSkillGenuine },
                  { label: "Has the weekly syllabus / skill plan been prepared and adhered to?", val: wizSkillWeeklyPlan, set: setWizSkillWeeklyPlan },
                  { label: "Is the daily student tracker updated up to the current session?", val: wizSkillTracker, set: setWizSkillTracker },
                  { label: "Have coding tasks / practical exercises been assigned to learners?", val: wizSkillAssignment, set: setWizSkillAssignment },
                  { label: "Has hands-on lab assessment been completed with proof recorded?", val: wizSkillAssessment, set: setWizSkillAssessment }
                ].map((item, i) => (
                  <div key={i} className="flex items-center justify-between p-2.5 rounded-lg hover:bg-slate-50 border border-slate-100">
                    <span className="text-xs font-medium text-slate-800 pr-4">{item.label}</span>
                    <button
                      type="button"
                      onClick={() => item.set(!item.val)}
                      className={`min-h-[44px] min-w-[70px] px-3.5 py-2 text-xs font-extrabold rounded-xl transition-all cursor-pointer flex items-center justify-center shrink-0 ${
                        item.val ? "bg-emerald-600 text-white" : "bg-rose-100 text-rose-700"
                      }`}
                    >
                      {item.val ? "✓ Yes" : "✕ No"}
                    </button>
                  </div>
                ))}
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Student Work / GitHub Proof Link</label>
                <input
                  type="url"
                  aria-label="Student Work / GitHub Proof Link"
                  value={wizSkillProofLink}
                  onChange={(e) => setWizSkillProofLink(e.target.value)}
                  placeholder="https://github.com/... or Google Drive folder"
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:outline-hidden focus:ring-1 focus:ring-emerald-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Tasks Assigned</label>
                  <input
                    type="number"
                    aria-label="Tasks Assigned"
                    value={wizSkillAssigned}
                    onChange={(e) => setWizSkillAssigned(parseInt(e.target.value) || 0)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-bold text-slate-800"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Tasks Completed</label>
                  <input
                    type="number"
                    aria-label="Tasks Completed"
                    value={wizSkillCompleted}
                    onChange={(e) => setWizSkillCompleted(parseInt(e.target.value) || 0)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-bold text-slate-800"
                  />
                </div>
              </div>

              <div className="pt-4 flex justify-between">
                <button
                  type="button"
                  onClick={() => setWizardStage(1)}
                  className="px-4 py-2 border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-bold rounded-xl transition-all cursor-pointer"
                >
                  &larr; Back
                </button>
                <button
                  type="button"
                  onClick={() => setWizardStage(3)}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold rounded-xl transition-all cursor-pointer flex items-center gap-1.5 shadow-xs"
                >
                  <span>Continue to Coursework</span>
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}

          {/* STAGE 3: COURSEWORK DELIVERY VERIFICATION */}
          {wizardStage === 3 && (
            <div className="space-y-4">
              <div className="bg-teal-50/60 border border-teal-100 rounded-xl p-3 flex items-center justify-between">
                <div>
                  <span className="text-xs font-extrabold text-teal-900 block">Stage 3: Academic Coursework Verification</span>
                  <span className="text-[10px] text-teal-700">Calculated Score: {calculatedAcadScore}%</span>
                </div>
                <BookOpen className="h-5 w-5 text-teal-600" />
              </div>

              <div className="space-y-2 border border-slate-200 rounded-xl p-4">
                {[
                  { label: "Was the coursework assignment genuinely completed by learners?", val: wizAcadAssignment, set: setWizAcadAssignment },
                  { label: "Were tests/quizzes conducted without proxy or question leaks?", val: wizAcadAssessment, set: setWizAcadAssessment },
                  { label: "Was syllabus coverage submitted on or before the planned deadline?", val: wizAcadBeforeDeadline, set: setWizAcadBeforeDeadline },
                  { label: "Were study materials & slides provided on LMS for this module?", val: wizAcadStudyMaterial, set: setWizAcadStudyMaterial }
                ].map((item, i) => (
                  <div key={i} className="flex items-center justify-between p-2.5 rounded-lg hover:bg-slate-50 border border-slate-100">
                    <span className="text-xs font-medium text-slate-800 pr-4">{item.label}</span>
                    <button
                      type="button"
                      onClick={() => item.set(!item.val)}
                      className={`min-h-[44px] min-w-[70px] px-3.5 py-2 text-xs font-extrabold rounded-xl transition-all cursor-pointer flex items-center justify-center shrink-0 ${
                        item.val ? "bg-emerald-600 text-white" : "bg-rose-100 text-rose-700"
                      }`}
                    >
                      {item.val ? "✓ Yes" : "✕ No"}
                    </button>
                  </div>
                ))}
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Coursework Auditor Notes</label>
                <textarea
                  rows={2}
                  aria-label="Coursework Auditor Notes"
                  value={wizAcadRemarks}
                  onChange={(e) => setWizAcadRemarks(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:outline-hidden focus:ring-1 focus:ring-emerald-500"
                />
              </div>

              <div className="pt-4 flex justify-between">
                <button
                  type="button"
                  onClick={() => setWizardStage(2)}
                  className="px-4 py-2 border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-bold rounded-xl transition-all cursor-pointer"
                >
                  &larr; Back
                </button>
                <button
                  type="button"
                  onClick={() => setWizardStage(4)}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold rounded-xl transition-all cursor-pointer flex items-center gap-1.5 shadow-xs"
                >
                  <span>Continue to Attendance &amp; Peer Routing</span>
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}

          {/* STAGE 4: ATTENDANCE & AUTOMATED INTRA-KAM PEER ROUTING */}
          {wizardStage === 4 && (
            <div className="space-y-4">
              <div className="bg-purple-50/60 border border-purple-100 rounded-xl p-3 flex items-center justify-between">
                <div>
                  <span className="text-xs font-extrabold text-purple-900 block">Stage 4: Attendance &amp; Peer Routing</span>
                  <span className="text-[10px] text-purple-700">Attendance Score: {calculatedAttScore}%</span>
                </div>
                <Clock className="h-5 w-5 text-purple-600" />
              </div>

              <div className="space-y-2 border border-slate-200 rounded-xl p-4">
                {[
                  { label: "Was attendance marked daily by mentor, not bulk-backdated?", val: wizAttMarkedDaily, set: setWizAttMarkedDaily },
                  { label: "Was attendance cross-verified with class biometric machine logs?", val: wizAttCrossVerified, set: setWizAttCrossVerified },
                  { label: "Are there zero detected proxy attendances?", val: wizAttNoProxy, set: setWizAttNoProxy },
                  { label: "Does attendance % match daily tracker reports?", val: wizAttMatchesTracker, set: setWizAttMatchesTracker }
                ].map((item, i) => (
                  <div key={i} className="flex items-center justify-between p-2.5 rounded-lg hover:bg-slate-50 border border-slate-100">
                    <span className="text-xs font-medium text-slate-800 pr-4">{item.label}</span>
                    <button
                      type="button"
                      onClick={() => item.set(!item.val)}
                      className={`min-h-[44px] min-w-[70px] px-3.5 py-2 text-xs font-extrabold rounded-xl transition-all cursor-pointer flex items-center justify-center shrink-0 ${
                        item.val ? "bg-emerald-600 text-white" : "bg-rose-100 text-rose-700"
                      }`}
                    >
                      {item.val ? "✓ Yes" : "✕ No"}
                    </button>
                  </div>
                ))}
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Count of Students Below 75% Attendance Threshold
                </label>
                <input
                  type="number"
                  aria-label="Count of Students Below 75% Attendance Threshold"
                  value={wizAttBelow75}
                  onChange={(e) => setWizAttBelow75(parseInt(e.target.value) || 0)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-bold text-slate-800"
                />
              </div>

              {/* Automated Database Intra-KAM Peer Matching Preview Box */}
              <div className="p-4 rounded-xl bg-emerald-50/70 border border-emerald-200 space-y-2">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-emerald-700" />
                  <span className="text-xs font-black text-emerald-900 uppercase tracking-wider">
                    Automated Intra-KAM Peer Dispatch
                  </span>
                </div>
                <p className="text-xs text-emerald-800">
                  Upon submission, the audit ledger automatically assigns this record to a peer campus managed under your KAM:
                </p>
                <div className="flex items-center gap-2 bg-white/80 p-2.5 rounded-lg border border-emerald-200 text-xs font-bold text-emerald-900">
                  <Building2 className="h-4 w-4 text-emerald-600" />
                  <span>KAM Cluster: {dynamicKAMInfo.kam || "Assigned KAM"}</span>
                  <span className="text-emerald-400">•</span>
                  <span className="text-emerald-700 font-medium">
                    {dynamicKAMInfo.campuses.length > 1
                      ? `Dynamic rotation across ${dynamicKAMInfo.campuses.length - 1} peer campus(es)`
                      : "Dynamic intra-KAM peer campus rotation"}
                  </span>
                </div>
                <span className="text-[10px] text-emerald-700 font-medium block">
                  Enforces pairing cooldown and queue load balancing with strict zero self-audits.
                </span>
              </div>

              <div className="pt-4 flex justify-between">
                <button
                  type="button"
                  onClick={() => setWizardStage(3)}
                  className="px-4 py-2 border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-bold rounded-xl transition-all cursor-pointer"
                >
                  &larr; Back
                </button>
                <LoadingButton
                  type="button"
                  isLoading={isSubmittingAudit}
                  loadingText="Submitting & Dispatching..."
                  onClick={handleCompleteWizard}
                  className="px-6 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold rounded-xl transition-all cursor-pointer flex items-center gap-2 shadow-xs"
                >
                  <Send className="h-4 w-4" />
                  <span>Submit Audit &amp; Dispatch to Peer</span>
                </LoadingButton>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

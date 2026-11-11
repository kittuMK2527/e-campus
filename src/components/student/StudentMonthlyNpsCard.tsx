"use client";

import React, { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2,
  MessageSquareQuote,
  Sparkles,
  ShieldCheck,
  ThumbsUp,
  Smile,
  Meh,
  Frown,
  ThumbsDown,
  UserCheck,
  Edit3,
  Clock,
  Send,
  HelpCircle
} from "lucide-react";
import { apiFetch } from "@/lib/apiFetch";
import { useToast } from "@/context/ToastContext";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { SCORE_OPTIONS, monthLabel } from "@/lib/studentNps";

interface MineAnswer {
  month_key: string;
  score: number | null;
  mentor_score?: number | null;
  mentor_name?: string | null;
  likes: string | null;
  improve: string | null;
  submitted_at: string | null;
}

const SCORE_CONFIG: Record<
  number,
  {
    label: string;
    sublabel: string;
    icon: React.ComponentType<{ className?: string }>;
    accentColor: string;
    checkedClasses: string;
  }
> = {
  5: {
    label: "Excellent",
    sublabel: "Highly engaging",
    icon: ThumbsUp,
    accentColor: "text-indigo-600",
    checkedClasses:
      "peer-checked:border-indigo-600 peer-checked:bg-indigo-50/90 peer-checked:text-indigo-900 peer-checked:ring-1 peer-checked:ring-indigo-600/30 shadow-xs"
  },
  4: {
    label: "Good",
    sublabel: "Solid & on pace",
    icon: Smile,
    accentColor: "text-emerald-600",
    checkedClasses:
      "peer-checked:border-emerald-600 peer-checked:bg-emerald-50/90 peer-checked:text-emerald-900 peer-checked:ring-1 peer-checked:ring-emerald-600/30 shadow-xs"
  },
  3: {
    label: "Neutral",
    sublabel: "Room to improve",
    icon: Meh,
    accentColor: "text-amber-600",
    checkedClasses:
      "peer-checked:border-amber-500 peer-checked:bg-amber-50/90 peer-checked:text-amber-900 peer-checked:ring-1 peer-checked:ring-amber-500/30 shadow-xs"
  },
  2: {
    label: "Poor",
    sublabel: "Pacing issues",
    icon: Frown,
    accentColor: "text-orange-600",
    checkedClasses:
      "peer-checked:border-orange-500 peer-checked:bg-orange-50/90 peer-checked:text-orange-900 peer-checked:ring-1 peer-checked:ring-orange-500/30 shadow-xs"
  },
  1: {
    label: "Very poor",
    sublabel: "Needs urgent fix",
    icon: ThumbsDown,
    accentColor: "text-rose-600",
    checkedClasses:
      "peer-checked:border-rose-500 peer-checked:bg-rose-50/90 peer-checked:text-rose-900 peer-checked:ring-1 peer-checked:ring-rose-500/30 shadow-xs"
  }
};

/**
 * Monthly class-feedback survey for the student portal. One answer per student per
 * month; the server upserts on (month, student), so re-answering edits this month
 * and last month's answer stays untouched.
 */
export function StudentMonthlyNpsCard({
  studentId,
  mentorName
}: {
  studentId: string;
  mentorName?: string;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [score, setScore] = useState<number | null>(null);
  const [mentorScore, setMentorScore] = useState<number | null>(null);
  const [likes, setLikes] = useState("");
  const [improve, setImprove] = useState("");
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const mineQuery = useQuery<{ success: boolean; month_key: string; mine: MineAnswer | null }>({
    queryKey: ["student-nps", "mine", studentId],
    queryFn: () => apiFetch("/api/audit/student-nps"),
    enabled: !!studentId
  });

  const saved = mineQuery.data?.mine || null;
  const monthKey = mineQuery.data?.month_key || "";

  // Prefill from the stored answer so editing starts where the student left off.
  useEffect(() => {
    if (!saved) return;
    setScore(saved.score);
    setMentorScore(saved.mentor_score ?? null);
    setLikes(saved.likes || "");
    setImprove(saved.improve || "");
  }, [saved]);

  const showForm = !saved || editing;

  const submit = async () => {
    if (score === null) {
      setError("Pick an overall class rating first — it is required.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await apiFetch("/api/audit/student-nps", {
        method: "POST",
        body: {
          score,
          mentor_score: mentorScore,
          mentor_name: mentorName || null,
          likes: likes.trim(),
          improve: improve.trim()
        }
      });
      await queryClient.invalidateQueries({ queryKey: ["student-nps", "mine", studentId] });
      setEditing(false);
      toast("Thanks — your feedback for this month is saved.", "success");
    } catch (err: any) {
      setError(err?.message || "Could not save your feedback. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  if (!studentId) return null;

  return (
    <section className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-6 space-y-4">
      {/* Header with Title and Status Badges */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-indigo-50 border border-indigo-100/90 text-indigo-600 flex items-center justify-center shrink-0 shadow-2xs">
            <Sparkles className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-base font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
              This Month&apos;s Class Feedback
            </h2>
            <p className="text-[11px] text-slate-400 font-semibold mt-0.5">
              {monthKey ? `${monthLabel(monthKey)} Review` : "Monthly Review"} · Confidential student pulse
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-50 border border-slate-200 text-[10px] font-bold text-slate-600">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
            100% Anonymous
          </span>
          {saved ? (
            <span className="shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-[10px] font-extrabold uppercase tracking-wide text-emerald-700">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Submitted
            </span>
          ) : (
            <span className="shrink-0 px-2.5 py-1 rounded-full bg-amber-50 border border-amber-200 text-[10px] font-extrabold uppercase tracking-wide text-amber-700">
              Awaiting Input
            </span>
          )}
        </div>
      </div>

      {mineQuery.isLoading ? (
        <div className="h-20 rounded-xl bg-slate-50 animate-pulse" aria-busy="true" aria-label="Loading your feedback" />
      ) : mineQuery.isError ? (
        <p className="text-[11px] font-bold text-rose-600">
          Could not load your feedback for this month.{" "}
          <button
            type="button"
            onClick={() => mineQuery.refetch()}
            className="underline cursor-pointer font-black"
          >
            Retry
          </button>
        </p>
      ) : !showForm && saved ? (
        /* Rich Saved Feedback Overview Tile */
        <div className="rounded-xl bg-slate-50/80 border border-slate-200/80 p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200/60 pb-3.5">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-slate-500">Overall Class:</span>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-xs font-black text-slate-900 shadow-2xs">
                  {saved.score ? (
                    <>
                      {React.createElement(SCORE_CONFIG[saved.score]?.icon || ThumbsUp, {
                        className: `h-3.5 w-3.5 ${SCORE_CONFIG[saved.score]?.accentColor || "text-indigo-600"}`
                      })}
                      <span>
                        {saved.score}/5 · {SCORE_CONFIG[saved.score]?.label}
                      </span>
                    </>
                  ) : (
                    "—"
                  )}
                </span>
              </div>
              {saved.mentor_score && (
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-slate-500">
                    {mentorName ? `${mentorName}:` : "Faculty Mentor:"}
                  </span>
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-indigo-50/80 border border-indigo-200 text-xs font-black text-indigo-950 shadow-2xs">
                    <UserCheck className="h-3.5 w-3.5 text-indigo-600" />
                    <span>
                      {saved.mentor_score}/5 · {SCORE_CONFIG[saved.mentor_score]?.label || "Rated"}
                    </span>
                  </span>
                </div>
              )}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setEditing(true)}
              className="cursor-pointer shrink-0 text-xs font-bold inline-flex items-center gap-1.5"
            >
              <Edit3 className="h-3.5 w-3.5 text-slate-500" />
              Edit my answer
            </Button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="p-3 bg-white rounded-lg border border-slate-200/70 space-y-1">
              <div className="flex items-center gap-1.5 text-[10.5px] font-extrabold uppercase tracking-wider text-emerald-700">
                <ThumbsUp className="h-3 w-3" />
                <span>What Went Well</span>
              </div>
              <p className="text-xs text-slate-700 font-medium italic">
                {saved.likes ? `"${saved.likes}"` : "No specific notes entered."}
              </p>
            </div>
            <div className="p-3 bg-white rounded-lg border border-slate-200/70 space-y-1">
              <div className="flex items-center gap-1.5 text-[10.5px] font-extrabold uppercase tracking-wider text-amber-700">
                <MessageSquareQuote className="h-3 w-3" />
                <span>Suggested Changes</span>
              </div>
              <p className="text-xs text-slate-700 font-medium italic">
                {saved.improve ? `"${saved.improve}"` : "No adjustments suggested."}
              </p>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-[10px] text-slate-400 font-medium pt-1">
            <span className="flex items-center gap-1">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
              Feedback is aggregated anonymously for academic dean review
            </span>
            {saved.submitted_at && (
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                Logged {new Date(saved.submitted_at).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
              </span>
            )}
          </div>
        </div>
      ) : (
        /* Active Feedback Form */
        <div className="space-y-5">
          {/* Question 1: Class Experience Rating */}
          <fieldset>
            <div className="flex items-center justify-between mb-2">
              <legend className="text-[11px] font-extrabold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                <span>1. Overall Class Delivery &amp; Pace</span>
                <span className="text-rose-500 font-bold">*</span>
              </legend>
              <span className="text-[10px] text-slate-400 font-medium">Scale: 1 (Very poor) to 5 (Excellent)</span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
              {SCORE_OPTIONS.map((option) => {
                const config = SCORE_CONFIG[option.value];
                const IconComp = config.icon;
                const isSelected = score === option.value;
                return (
                  <label
                    key={option.value}
                    className="relative cursor-pointer group"
                    title={`${option.value}/5 — ${config.label}: ${config.sublabel}`}
                  >
                    <input
                      type="radio"
                      name="student-nps-score"
                      value={option.value}
                      checked={isSelected}
                      onChange={() => {
                        setScore(option.value);
                        setError("");
                      }}
                      className="peer sr-only"
                    />
                    <div
                      className={`flex flex-col items-center justify-center p-3 rounded-xl border border-slate-200/90 bg-white text-slate-700 font-semibold transition-all peer-focus-visible:ring-2 peer-focus-visible:ring-indigo-500/40 hover:border-slate-300 hover:bg-slate-50/60 shadow-2xs ${config.checkedClasses}`}
                    >
                      <div className="flex items-center gap-1.5 mb-1">
                        <span className="text-base font-black leading-none">{option.value}</span>
                        <IconComp className={`h-4 w-4 shrink-0 transition-transform group-hover:scale-110 ${isSelected ? "text-current" : config.accentColor}`} />
                      </div>
                      <span className="text-[11px] font-bold tracking-tight">{config.label}</span>
                      <span className="text-[9.5px] font-medium text-slate-400 mt-0.5 line-clamp-1">{config.sublabel}</span>
                    </div>
                  </label>
                );
              })}
            </div>
            <p className="text-[10.5px] font-medium text-slate-400 mt-2">
              Evaluates overall course pace, curriculum coverage, and laboratory resources for this month.
            </p>
          </fieldset>

          {/* Question 2: Mentor & Faculty Rating */}
          <fieldset>
            <div className="flex items-center justify-between mb-2">
              <legend className="text-[11px] font-extrabold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                <UserCheck className="h-3.5 w-3.5 text-indigo-600" />
                <span>2. {mentorName ? `${mentorName} (Faculty Mentor NPS)` : "Faculty Mentor Interaction & Clarity"}</span>
              </legend>
              <span className="text-[10px] text-slate-400 font-medium">Optional</span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
              {SCORE_OPTIONS.map((option) => {
                const config = SCORE_CONFIG[option.value];
                const IconComp = config.icon;
                const isSelected = mentorScore === option.value;
                return (
                  <label
                    key={`mentor-${option.value}`}
                    className="relative cursor-pointer group"
                    title={`${option.value}/5 — ${config.label}: ${config.sublabel}`}
                  >
                    <input
                      type="radio"
                      name="student-mentor-nps-score"
                      value={option.value}
                      checked={isSelected}
                      onChange={() => setMentorScore(option.value)}
                      className="peer sr-only"
                    />
                    <div
                      className={`flex flex-col items-center justify-center p-3 rounded-xl border border-slate-200/90 bg-white text-slate-700 font-semibold transition-all peer-focus-visible:ring-2 peer-focus-visible:ring-indigo-500/40 hover:border-slate-300 hover:bg-slate-50/60 shadow-2xs ${config.checkedClasses}`}
                    >
                      <div className="flex items-center gap-1.5 mb-1">
                        <span className="text-base font-black leading-none">{option.value}</span>
                        <IconComp className={`h-4 w-4 shrink-0 transition-transform group-hover:scale-110 ${isSelected ? "text-current" : config.accentColor}`} />
                      </div>
                      <span className="text-[11px] font-bold tracking-tight">{config.label}</span>
                      <span className="text-[9.5px] font-medium text-slate-400 mt-0.5 line-clamp-1">{config.sublabel}</span>
                    </div>
                  </label>
                );
              })}
            </div>
            <p className="text-[10.5px] font-medium text-slate-400 mt-2">
              Rate faculty mentor subject clarity, responsiveness to doubts, and practical guidance.
            </p>
          </fieldset>

          {/* Qualitative Inputs */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label htmlFor="nps-likes" className="text-[11px] font-extrabold uppercase tracking-wide text-slate-600 flex items-center gap-1.5">
                <ThumbsUp className="h-3.5 w-3.5 text-emerald-600" />
                <span>What is going well? <span className="normal-case font-normal text-slate-400">(optional)</span></span>
              </label>
              <Textarea
                id="nps-likes"
                rows={3}
                maxLength={500}
                value={likes}
                onChange={(e) => setLikes(e.target.value)}
                placeholder="Specific sessions, teaching style, practical labs you appreciated..."
                className="text-xs placeholder:text-slate-400"
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="nps-improve" className="text-[11px] font-extrabold uppercase tracking-wide text-slate-600 flex items-center gap-1.5">
                <MessageSquareQuote className="h-3.5 w-3.5 text-amber-600" />
                <span>What should change next month? <span className="normal-case font-normal text-slate-400">(optional)</span></span>
              </label>
              <Textarea
                id="nps-improve"
                rows={3}
                maxLength={500}
                value={improve}
                onChange={(e) => setImprove(e.target.value)}
                placeholder="Pacing, doubt-clearing sessions, materials, assignment deadlines..."
                className="text-xs placeholder:text-slate-400"
              />
            </div>
          </div>

          {error ? (
            <p role="alert" className="text-[11px] font-bold text-rose-600 bg-rose-50 border border-rose-200 p-2.5 rounded-lg">
              {error}
            </p>
          ) : null}

          {/* Footer with Actions and Privacy Notice */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 border-t border-slate-100">
            <span className="text-[10.5px] text-slate-400 font-medium flex items-center gap-1.5">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
              Responses are strictly aggregated and never shared with faculty identifying you.
            </span>

            <div className="flex items-center gap-2.5">
              {editing ? (
                <Button variant="ghost" size="sm" onClick={() => setEditing(false)} className="cursor-pointer text-xs">
                  Cancel
                </Button>
              ) : null}
              <Button
                variant="brand"
                size="sm"
                disabled={score === null || saving}
                isLoading={saving}
                loadingText="Saving…"
                onClick={submit}
                className="cursor-pointer text-xs font-bold inline-flex items-center gap-1.5 shadow-2xs"
              >
                <Send className="h-3.5 w-3.5" />
                <span>{saved ? "Update my answer" : "Submit monthly feedback"}</span>
              </Button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

export default StudentMonthlyNpsCard;

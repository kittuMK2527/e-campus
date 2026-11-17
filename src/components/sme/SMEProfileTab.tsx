"use client";

import React from "react";
import { useApp } from "@/context/AppContext";
import { Award, BookOpen, CheckCircle2, Clock, Mail, Phone, ShieldCheck, Sparkles, UserCheck, GraduationCap } from "lucide-react";

export const SMEProfileTab: React.FC = () => {
  const { currentSME, currentUser, smes } = useApp();

  const smeName = currentSME?.name || currentUser?.name || "Subject Matter Expert";
  const smeEmail = currentSME?.email || currentUser?.email || "sme@faceprep.in";
  const smeId = currentSME?.id || currentUser?.id || "sme_evaluator";
  const smePhone = currentSME?.phone || "—";
  const smeSubject = currentSME?.subject || "Technical & Core Engineering";
  const smeDepartment = currentSME?.department || "Academic & Faculty Quality Assurance";
  const experienceYears = currentSME?.experience_years ? `${currentSME.experience_years} Years` : "Senior Evaluator";
  const status = currentSME?.status === "approved_sme" ? "Certified SME Evaluator" : "Active Evaluator";

  return (
    <div className="space-y-6 font-sans pb-12 animate-fadeIn">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-5 shadow-card">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-amber-500/10 text-amber-500 flex items-center justify-center border border-amber-500/20 shrink-0">
            <Award className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
              <span>SME Evaluator Profile</span>
              <span className="px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60">
                {status}
              </span>
            </h1>
            <p className="text-xs text-slate-500 font-medium mt-0.5">
              Subject matter review, faculty teaching plan validation, and demo session assessments.
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Profile Identity Card */}
        <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-card flex flex-col items-center justify-between text-center min-h-[320px]">
          <div className="flex flex-col items-center space-y-4 w-full">
            <div className="h-20 w-20 rounded-2xl bg-zinc-900 dark:bg-zinc-800 border-4 border-amber-500 text-amber-400 flex items-center justify-center text-2xl font-black shadow-md uppercase">
              {smeName.substring(0, 2)}
            </div>
            <div>
              <h2 className="text-base font-extrabold text-slate-900 dark:text-white leading-tight">
                {smeName}
              </h2>
              <p className="text-[10px] text-amber-600 dark:text-amber-400 font-bold uppercase tracking-wider mt-1">
                Subject Matter Expert (SME)
              </p>
            </div>
            <div className="flex flex-wrap justify-center gap-1.5 pt-1">
              <span className="px-2.5 py-1 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-[9.5px] font-black text-amber-800 dark:text-amber-300 uppercase">
                {smeSubject}
              </span>
            </div>
          </div>

          <div className="w-full border-t border-slate-100 dark:border-slate-800 pt-4 mt-4 text-left space-y-2.5">
            <div className="flex justify-between items-center text-xs font-semibold">
              <span className="text-slate-400">Evaluator ID</span>
              <span className="text-slate-800 dark:text-slate-200 font-mono text-[11px]">{smeId}</span>
            </div>
            <div className="flex justify-between items-center text-xs font-semibold">
              <span className="text-slate-400">Email</span>
              <span className="text-slate-800 dark:text-slate-200 truncate max-w-[170px]" title={smeEmail}>
                {smeEmail}
              </span>
            </div>
            <div className="flex justify-between items-center text-xs font-semibold">
              <span className="text-slate-400">Phone</span>
              <span className="text-slate-800 dark:text-slate-200 font-mono text-[11px]">{smePhone}</span>
            </div>
          </div>
        </div>

        {/* Domain & Accreditation Details */}
        <div className="md:col-span-2 bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-card space-y-6 flex flex-col justify-between">
          <div>
            <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4">
              Domain Expertise &amp; Quality Mandate
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div className="space-y-1 p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-700/60">
                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Specialized Subject Area</span>
                <span className="text-sm font-extrabold text-slate-800 dark:text-slate-100 block">
                  {smeSubject}
                </span>
                <span className="text-[10px] text-slate-500 font-semibold block">Primary syllabus inspection domain</span>
              </div>

              <div className="space-y-1 p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-700/60">
                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Department Affiliation</span>
                <span className="text-sm font-extrabold text-slate-800 dark:text-slate-100 block">
                  {smeDepartment}
                </span>
                <span className="text-[10px] text-slate-500 font-semibold block">Academic and instructional oversight</span>
              </div>

              <div className="space-y-1 p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-700/60">
                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Professional Experience</span>
                <span className="text-sm font-extrabold text-slate-800 dark:text-slate-100 block">
                  {experienceYears}
                </span>
                <span className="text-[10px] text-slate-500 font-semibold block">Instructional experience &amp; industry tenure</span>
              </div>

              <div className="space-y-1 p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-700/60">
                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Assessment Rubric Standard</span>
                <span className="text-sm font-extrabold text-amber-600 block">
                  10 Quality Rubric Criteria
                </span>
                <span className="text-[10px] text-slate-500 font-semibold block">Structured scoring (100-point standard)</span>
              </div>
            </div>
          </div>

          <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/50 p-4 rounded-xl flex items-center gap-3">
            <Sparkles className="h-5 w-5 text-amber-500 shrink-0" />
            <div className="text-xs text-amber-900 dark:text-amber-200 font-medium">
              As an authorized Subject Matter Expert, your verdicts govern faculty lesson plan approval, syllabus progression, and viva/demo clearance across the institution network.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

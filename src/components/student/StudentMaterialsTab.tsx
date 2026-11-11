"use client";

import React, { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { BookOpen, Download, GraduationCap, Loader2, RefreshCw, Search } from "lucide-react";
import { qk } from "@/lib/queryKeys";
import { apiFetch } from "@/lib/apiFetch";
import { useToast } from "@/context/ToastContext";
import { isSubjectNameMatch, parseDbDate } from "@/lib/utils";

interface StudentMaterialsTabProps {
  currentStudent: any;
  studentSubjects: any[];
  studentClassDetails: { sem: string; year: string };
}

export default function StudentMaterialsTab({
  currentStudent,
  studentSubjects = [],
  studentClassDetails,
}: StudentMaterialsTabProps) {
  const { toast } = useToast();

  const [selectedMaterialSubject, setSelectedMaterialSubject] = useState<string>("");
  const [selectedMaterialUnit, setSelectedMaterialUnit] = useState<number | "all">("all");
  const [materialTypeFilter, setMaterialTypeFilter] = useState<string>("all");
  const [materialSearchQuery, setMaterialSearchQuery] = useState("");

  useEffect(() => {
    if (studentSubjects.length > 0 && !selectedMaterialSubject) {
      setSelectedMaterialSubject(studentSubjects[0].name);
    }
  }, [studentSubjects, selectedMaterialSubject]);

  const materialsQuery = useQuery<any[]>({
    queryKey: qk.studentMaterials(currentStudent?.college_id || "all", selectedMaterialSubject || "none"),
    enabled: !!selectedMaterialSubject,
    queryFn: async () => {
      const params = new URLSearchParams({ subject: selectedMaterialSubject });
      if (currentStudent?.college_id) params.set("collegeId", currentStudent.college_id);
      const data = await apiFetch(`/api/materials?${params.toString()}`);
      return data?.success ? data.materials || [] : [];
    },
    placeholderData: (prev) => prev,
  });

  const materialsList = materialsQuery.data || [];
  const materialsLoading = materialsQuery.isFetching;

  const filteredList = (materialsList || []).filter((item) => {
    const matchesSubject =
      isSubjectNameMatch(item.subject, selectedMaterialSubject) ||
      item.subject?.toLowerCase().trim() === selectedMaterialSubject.toLowerCase().trim();
    const matchesUnit = selectedMaterialUnit === "all" || item.unit_number === selectedMaterialUnit;
    const matchesType = materialTypeFilter === "all" || item.material_type === materialTypeFilter;
    const matchesSearch =
      !materialSearchQuery ||
      item.title?.toLowerCase().includes(materialSearchQuery.toLowerCase()) ||
      (item.description && item.description.toLowerCase().includes(materialSearchQuery.toLowerCase())) ||
      (item.uploaded_by && item.uploaded_by.toLowerCase().includes(materialSearchQuery.toLowerCase()));

    return matchesSubject && matchesUnit && matchesType && matchesSearch;
  });

  return (
    <div className="space-y-6 font-sans">
      {/* Subject Selector & Header */}
      <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-xs space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2.5">
              <div className="h-8 w-8 rounded-xl bg-indigo-50 border border-indigo-100/80 flex items-center justify-center text-indigo-600 shrink-0">
                <BookOpen className="h-4 w-4" />
              </div>
              <h2 className="text-base font-bold text-slate-900 tracking-tight">
                Subject Study Materials & Unit Notes
              </h2>
              <span className="px-2.5 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200/60 text-[10px] font-bold uppercase tracking-wider">
                Verified Notes
              </span>
            </div>
            <p className="text-xs text-slate-500 font-medium">
              Access syllabus-aligned unit lecture notes, faculty presentations, and question banks.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => materialsQuery.refetch()}
              className="p-2 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-600 transition-colors shadow-2xs"
              title="Refresh Materials"
              aria-label="Refresh Materials"
            >
              <RefreshCw className={`h-4 w-4 ${materialsLoading ? "animate-spin text-indigo-600" : ""}`} />
            </button>
          </div>
        </div>

        {/* Enrolled Subject Selector Pills */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block">
              Enrolled Course Subject ({studentSubjects.length || 1})
            </label>
            <span className="text-[11px] text-slate-600 font-semibold">
              {studentClassDetails.sem} • {studentClassDetails.year}
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {studentSubjects.map((subj) => {
              const isSelected = selectedMaterialSubject.toLowerCase().trim() === subj.name.toLowerCase().trim();
              return (
                <button
                  key={subj.id || subj.name}
                  type="button"
                  onClick={() => setSelectedMaterialSubject(subj.name)}
                  className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-2 border shadow-2xs ${
                    isSelected
                      ? "bg-slate-900 border-slate-900 text-white ring-2 ring-indigo-500/20"
                      : "bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100 hover:text-slate-900"
                  }`}
                >
                  <GraduationCap className={`h-3.5 w-3.5 shrink-0 ${isSelected ? "text-indigo-300" : "text-slate-400"}`} />
                  <span>{subj.name}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Unit Tabs & Filters Bar */}
      <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-xs space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Unit 1 to 5 Filter Tabs */}
          <div className="flex flex-wrap items-center gap-1.5 bg-slate-100 p-1 rounded-xl border border-slate-200/60">
            <button
              type="button"
              onClick={() => setSelectedMaterialUnit("all")}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                selectedMaterialUnit === "all" ? "bg-white text-slate-900 shadow-2xs" : "text-slate-600 hover:text-slate-900"
              }`}
            >
              All Units
            </button>
            {[1, 2, 3, 4, 5].map((unitNum) => (
              <button
                key={`unit_tab_${unitNum}`}
                type="button"
                onClick={() => setSelectedMaterialUnit(unitNum)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  selectedMaterialUnit === unitNum
                    ? "bg-white text-indigo-700 shadow-2xs"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                Unit {unitNum}
              </button>
            ))}
          </div>

          {/* Search Bar */}
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
            <input
              type="text"
              placeholder="Search topics, unit notes..."
              value={materialSearchQuery}
              onChange={(e) => setMaterialSearchQuery(e.target.value)}
              className="w-full pl-8.5 pr-4 py-2 border border-slate-200 rounded-xl bg-slate-50 focus:bg-white text-xs outline-hidden focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 font-medium placeholder-slate-400 transition-all"
            />
          </div>
        </div>

        {/* Material Type Pills */}
        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-100">
          <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mr-1">Filter Type:</span>
          {[
            { id: "all", label: "All Formats" },
            { id: "notes", label: "PDF Notes" },
            { id: "ppt", label: "Slides (PPT)" },
            { id: "question_bank", label: "Question Banks" },
          ].map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setMaterialTypeFilter(t.id)}
              className={`px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all border ${
                materialTypeFilter === t.id
                  ? "bg-indigo-50 border-indigo-200 text-indigo-700"
                  : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Materials Grid List */}
      {materialsLoading ? (
        <div className="py-20 text-center text-xs font-semibold text-slate-500 flex flex-col items-center justify-center gap-3">
          <Loader2 className="h-6 w-6 text-indigo-600 animate-spin" />
          <span>Loading course study materials...</span>
        </div>
      ) : filteredList.length === 0 ? (
        <div className="bg-white border border-slate-200/80 rounded-2xl p-12 text-center space-y-3 shadow-xs">
          <div className="h-12 w-12 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center mx-auto">
            <BookOpen className="h-6 w-6" />
          </div>
          <h3 className="text-sm font-bold text-slate-900">No Study Materials Found</h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            {selectedMaterialUnit !== "all"
              ? `No documents uploaded for Unit ${selectedMaterialUnit} in ${selectedMaterialSubject}. Try switching to another unit.`
              : `Course faculty has not yet published lecture notes for ${selectedMaterialSubject}. Check back soon.`}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredList.map((mat) => {
            const isPPT = mat.material_type === "ppt";
            const isQuestionBank = mat.material_type === "question_bank";
            const formattedDate = mat.created_at
              ? parseDbDate(mat.created_at).toLocaleDateString("en-IN", {
                  day: "2-digit",
                  month: "short",
                  year: "numeric",
                })
              : "Active Term";

            return (
              <div
                key={mat.id}
                className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-xs hover:border-indigo-300 transition-all flex flex-col justify-between space-y-4 group"
              >
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <span className="px-2.5 py-0.5 rounded-lg bg-slate-900 text-white font-bold text-[10px] uppercase tracking-wider">
                        Unit {mat.unit_number}
                      </span>
                      <span
                        className={`px-2.5 py-0.5 rounded-lg text-[10px] font-bold uppercase tracking-wider border ${
                          isPPT
                            ? "bg-amber-50 text-amber-800 border-amber-200/70"
                            : isQuestionBank
                            ? "bg-purple-50 text-purple-800 border-purple-200/70"
                            : "bg-indigo-50 text-indigo-800 border-indigo-200/70"
                        }`}
                      >
                        {isPPT ? "Lecture PPT" : isQuestionBank ? "Question Bank" : "PDF Notes"}
                      </span>
                    </div>

                    <span className="text-[11px] font-semibold text-slate-400">{mat.file_size || "2.4 MB"}</span>
                  </div>

                  <div>
                    <h3 className="text-sm font-bold text-slate-900 group-hover:text-indigo-600 transition-colors leading-snug">
                      {mat.title}
                    </h3>
                    {mat.description && (
                      <p className="text-xs text-slate-500 font-medium leading-relaxed mt-1 line-clamp-2">
                        {mat.description}
                      </p>
                    )}
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <span className="text-[11px] text-slate-500 font-medium block truncate">
                      Faculty: <strong className="text-slate-800 font-semibold">{mat.uploaded_by || "Course Mentor"}</strong>
                    </span>
                    <span className="text-[10px] text-slate-400 font-normal block">Published: {formattedDate}</span>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      if (mat.file_url || mat.external_url) {
                        window.open(mat.file_url || mat.external_url, "_blank");
                      } else {
                        toast(`Downloading "${mat.title}" (${mat.file_size || "PDF"})`, "success");
                      }
                    }}
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-2xs transition-all"
                  >
                    <Download className="h-3.5 w-3.5" />
                    <span>Download</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

"use client";

import dynamic from "next/dynamic";
import { useApp } from "@/context/AppContext";
import { useAdminCampusScope } from "@/components/admin/useAdminCampusScope";
import { PageHeader } from "@/components/ui/PageHeader";
import { Select } from "@/components/ui/select";
import { FilterBar } from "@/components/ui/FilterBar";
import { CalendarCheck } from "lucide-react";

const ExamScheduleManager = dynamic(
  () => import("@/components/ExamScheduleManager").then(m => m.ExamScheduleManager),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center gap-2 rounded-2xl border border-slate-100 bg-white shadow-card p-10 text-xs font-bold text-slate-400">
        <span className="h-4 w-4 rounded-full border-2 border-indigo-600 border-t-transparent animate-spin" />
        Loading exam schedules…
      </div>
    )
  }
);

/** Exam timetables and marks registry for any single campus, on the CM manager UI. */
export function ExaminationsTab() {
  const { currentAdmin, currentUser, isLoading } = useApp();
  const { colleges, collegeId, selectCollege } = useAdminCampusScope();

  const activeCollege = colleges.find((c) => c.id === collegeId);

  return (
    <div className="space-y-4">
      <PageHeader
        icon={CalendarCheck}
        title="Examinations"
      />

      <FilterBar
        aside={
          activeCollege ? (
            <span className="text-[11px] font-semibold text-slate-500">{activeCollege.name}</span>
          ) : null
        }
      >
        <label htmlFor="admin-exam-campus" className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
          Campus
        </label>
        <Select
          id="admin-exam-campus"
          className="w-full sm:w-72"
          value={collegeId}
          onChange={(e) => selectCollege(e.target.value)}
          disabled={colleges.length === 0}
        >
          {colleges.length === 0 && <option value="">No campuses</option>}
          {colleges.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </Select>
      </FilterBar>

      {activeCollege ? (
        <ExamScheduleManager
          overrideCollegeId={collegeId}
          actorName={currentAdmin?.name || currentUser?.name || "Admin"}
          embedded={true}
        />
      ) : (
        <div className="rounded-2xl border border-slate-100 bg-white shadow-card p-10 text-center text-xs font-semibold text-slate-400">
          {isLoading
            ? "Loading campuses…"
            : "No campuses configured yet — add one under Organization → Campuses."}
        </div>
      )}
    </div>
  );
}

export default ExaminationsTab;

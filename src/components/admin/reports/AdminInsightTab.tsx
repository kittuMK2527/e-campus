"use client";

import React, { useMemo } from "react";
import dynamic from "next/dynamic";
import { useApp } from "@/context/AppContext";
import { useAdminCampusScope } from "@/components/admin/useAdminCampusScope";
import { PageHeader } from "@/components/ui/PageHeader";
import { Select } from "@/components/ui/select";
import { FilterBar } from "@/components/ui/FilterBar";
import type { InsightSubTab } from "@/components/admin/types";
import type { LucideIcon } from "lucide-react";

const CampusInsightPanel = dynamic(
  () => import("@/components/CAMDashboard").then(m => m.CAMCampusInsightPanel),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center gap-2 rounded-2xl border border-slate-100 bg-white shadow-card p-10 text-xs font-bold text-slate-400">
        <span className="h-4 w-4 rounded-full border-2 border-indigo-600 border-t-transparent animate-spin" />
        Loading campus report…
      </div>
    )
  }
);

interface AdminInsightTabProps {
  subTab: InsightSubTab;
  title: string;
  subtitle?: string;
  icon: LucideIcon;
}

/**
 * One report view from the CM console, mounted for admin across any campus.
 * The panel itself is shared with the CM "Campus Insight" tab so both roles
 * read the same numbers; only the campus scope is chosen here.
 */
export function AdminInsightTab({ subTab, title, subtitle, icon }: AdminInsightTabProps) {
  const {
    mentors,
    students,
    slots,
    subjectsList,
    requests,
    approvedHandovers,
    studentAttendance,
    studentAcademicTracker,
    isLoading
  } = useApp();
  const { colleges, collegeId, selectCollege } = useAdminCampusScope();

  const activeCollege = colleges.find(c => c.id === collegeId);
  const activeCollegeName = activeCollege?.name || "";

  const collegeMentors = useMemo(
    () => mentors.filter(m => m.college_id === collegeId),
    [mentors, collegeId]
  );
  const collegeStudents = useMemo(
    () => students.filter(s => s.college_id === collegeId),
    [students, collegeId]
  );
  const campusSlots = useMemo(
    () => slots.filter(s => s.college_id === collegeId),
    [slots, collegeId]
  );
  const collegeSubjects = useMemo(
    () => subjectsList.filter(s => !s.college_id || s.college_id === collegeId),
    [subjectsList, collegeId]
  );

  if (!activeCollege) {
    return (
      <div className="space-y-4">
        <PageHeader icon={icon} title={title} subtitle={subtitle} />
        {isLoading ? (
          <div className="flex items-center justify-center gap-2 rounded-2xl border border-slate-100 bg-white shadow-card p-10 text-xs font-bold text-slate-400">
            <span className="h-4 w-4 rounded-full border-2 border-indigo-600 border-t-transparent animate-spin" />
            Loading campuses…
          </div>
        ) : (
          <div className="rounded-2xl border border-slate-100 bg-white shadow-card p-10 text-center text-xs font-semibold text-slate-400">
            No campuses configured yet — reports need at least one campus.
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader icon={icon} title={title} subtitle={subtitle} />

      <FilterBar
        aside={
          <span className="text-[11px] font-semibold text-slate-500">
            {collegeStudents.length} students · {collegeMentors.length} mentors
          </span>
        }
      >
        <label htmlFor="admin-report-campus" className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
          Campus
        </label>
        <Select
          id="admin-report-campus"
          className="w-full sm:w-72"
          value={collegeId}
          onChange={(e) => selectCollege(e.target.value)}
        >
          {colleges.map(c => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </Select>
      </FilterBar>

      <CampusInsightPanel
        activeCollegeId={collegeId}
        activeCollegeName={activeCollegeName}
        collegeMentors={collegeMentors}
        campusSlots={campusSlots}
        collegeStudents={collegeStudents}
        collegeSubjects={collegeSubjects}
        initialStudentAttendance={studentAttendance}
        handoverRequests={requests}
        approvedHandovers={approvedHandovers}
        studentAcademicTracker={studentAcademicTracker}
        subTabs={[subTab]}
        initialSubTab={subTab}
      />
    </div>
  );
}

export default AdminInsightTab;

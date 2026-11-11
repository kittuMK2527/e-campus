"use client";

import React, { useState } from "react";
import { ShieldAlert, CalendarDays, Trash2, AlertTriangle, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { useToast } from "@/context/ToastContext";
import { College, Student } from "@/context/AppContext";

export interface ClearAttendanceSectionProps {
  colleges: College[];
  students: Student[];
  onAttendanceCleared: (collegeId?: string) => Promise<void>;
}

export const ClearAttendanceSection: React.FC<ClearAttendanceSectionProps> = ({
  colleges,
  students,
  onAttendanceCleared
}) => {
  const { toast, confirm: showConfirm } = useToast();
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return d.toISOString().split("T")[0];
  });
  const [endDate, setEndDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [collegeId, setCollegeId] = useState("all");
  const [dept, setDept] = useState("all");
  const [classGroup, setClassGroup] = useState("all");
  const [previewCount, setPreviewCount] = useState<number | null>(null);
  const [isFetchingPreview, setIsFetchingPreview] = useState(false);
  const [isClearing, setIsClearing] = useState(false);

  const fetchPreview = async () => {
    if (!startDate || !endDate) return;
    setIsFetchingPreview(true);
    setPreviewCount(null);
    try {
      const params = new URLSearchParams({ startDate, endDate });
      if (collegeId && collegeId !== "all") params.set("collegeId", collegeId);
      if (dept && dept !== "all") params.set("department", dept);
      if (classGroup && classGroup !== "all") params.set("classGroup", classGroup);

      const res = await fetch(`/api/attendance?${params.toString()}`);
      const data = await res.json();
      if (data.success) {
        setPreviewCount(data.count ?? (data.records?.length ?? 0));
      }
    } catch {
      /* preview failure is non-fatal */
    } finally {
      setIsFetchingPreview(false);
    }
  };

  const handleClear = async () => {
    if (!startDate || !endDate) {
      toast("Please select both a start and end date.", "warning");
      return;
    }
    if (startDate > endDate) {
      toast("Start date cannot be after end date.", "error");
      return;
    }
    const scopeLabel = collegeId !== "all"
      ? `for campus: ${colleges.find(c => c.id === collegeId)?.name || collegeId}`
      : "across ALL campuses";
    const deptLabel = dept !== "all" ? `, department: ${dept}` : "";
    const batchLabel = classGroup !== "all" ? `, batch: ${classGroup}` : "";

    const confirmed = await showConfirm({
      title: "Clear Attendance Records",
      message: `This will permanently delete all attendance records from ${startDate} to ${endDate} ${scopeLabel}${deptLabel}${batchLabel}.\n\nThis action cannot be undone.`,
      danger: true,
      confirmLabel: "Clear Attendance"
    });
    if (!confirmed) return;

    setIsClearing(true);
    try {
      const params = new URLSearchParams({ startDate, endDate });
      if (collegeId !== "all") params.set("collegeId", collegeId);
      if (dept !== "all") params.set("department", dept);
      if (classGroup !== "all") params.set("classGroup", classGroup);

      const res = await fetch(`/api/attendance?${params.toString()}`, { method: "DELETE" });
      const data = await res.json();
      if (data.success) {
        toast(`Cleared ${data.deletedCount ?? 0} attendance record(s) from ${startDate} to ${endDate}.`, "success");
        setPreviewCount(null);
        await onAttendanceCleared(collegeId !== "all" ? collegeId : undefined);
      } else {
        toast(data.message || "Failed to clear attendance.", "error");
      }
    } catch (err: any) {
      toast(err.message || "An error occurred.", "error");
    } finally {
      setIsClearing(false);
    }
  };

  const campusStudents = collegeId !== "all" ? students.filter((s: any) => s.college_id === collegeId) : [];
  const depts = Array.from(new Set(campusStudents.map((s: any) => s.department).filter(Boolean))) as string[];
  const batches = (dept !== "all"
    ? Array.from(new Set(campusStudents.filter((s: any) => s.department === dept).map((s: any) => s.classGroup).filter(Boolean)))
    : Array.from(new Set(campusStudents.map((s: any) => s.classGroup).filter(Boolean)))) as string[];

  return (
    <div className="bg-white border border-rose-200 rounded-2xl p-6 shadow-card space-y-5">
      <div className="flex items-start gap-3 pb-4 border-b border-rose-100">
        <div className="h-10 w-10 rounded-xl bg-rose-50 border border-rose-200 text-rose-600 flex items-center justify-center shrink-0">
          <ShieldAlert className="h-5 w-5" />
        </div>
        <div>
          <h3 className="text-sm font-extrabold text-gray-900">Clear Attendance by Date Range</h3>
          <p className="text-[11px] text-gray-500 font-medium mt-0.5">
            Permanently delete student attendance records within a chosen date range. Optionally scope to a specific campus, department, or batch.
          </p>
        </div>
      </div>

      {/* Filters Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        <div className="space-y-1">
          <label className="text-[10px] font-extrabold uppercase tracking-wider text-gray-500 block">From Date</label>
          <Input
            aria-label="From Date"
            type="date"
            value={startDate}
            onChange={e => { setStartDate(e.target.value); setPreviewCount(null); }}
            className="w-full px-3 py-2 border border-gray-200 rounded-xl bg-white text-xs font-semibold text-gray-800 focus:outline-none focus:border-rose-400 focus:ring-1 focus:ring-rose-200"
          />
        </div>
        <div className="space-y-1">
          <label className="text-[10px] font-extrabold uppercase tracking-wider text-gray-500 block">To Date</label>
          <Input
            aria-label="To Date"
            type="date"
            value={endDate}
            min={startDate}
            onChange={e => { setEndDate(e.target.value); setPreviewCount(null); }}
            className="w-full px-3 py-2 border border-gray-200 rounded-xl bg-white text-xs font-semibold text-gray-800 focus:outline-none focus:border-rose-400 focus:ring-1 focus:ring-rose-200"
          />
        </div>
        <div className="space-y-1">
          <label className="text-[10px] font-extrabold uppercase tracking-wider text-gray-500 block">Campus</label>
          <Select
            aria-label="Campus"
            value={collegeId}
            onChange={e => { setCollegeId(e.target.value); setDept("all"); setClassGroup("all"); setPreviewCount(null); }}
            className="w-full px-3 py-2 border border-gray-200 rounded-xl bg-white text-xs font-semibold text-gray-800 focus:outline-none focus:border-rose-400 cursor-pointer"
          >
            <option value="all">All Campuses</option>
            {colleges.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </Select>
        </div>

        {collegeId !== "all" && (
          <>
            <div className="space-y-1">
              <label className="text-[10px] font-extrabold uppercase tracking-wider text-gray-500 block">Department</label>
              <Select
                aria-label="Department"
                value={dept}
                onChange={e => { setDept(e.target.value); setClassGroup("all"); setPreviewCount(null); }}
                className="w-full px-3 py-2 border border-gray-200 rounded-xl bg-white text-xs font-semibold text-gray-800 focus:outline-none focus:border-rose-400 cursor-pointer"
              >
                <option value="all">All Departments</option>
                {depts.map(d => <option key={d} value={d}>{d}</option>)}
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-extrabold uppercase tracking-wider text-gray-500 block">Batch / Class Group</label>
              <Select
                aria-label="Batch / Class Group"
                value={classGroup}
                onChange={e => { setClassGroup(e.target.value); setPreviewCount(null); }}
                className="w-full px-3 py-2 border border-gray-200 rounded-xl bg-white text-xs font-semibold text-gray-800 focus:outline-none focus:border-rose-400 cursor-pointer"
              >
                <option value="all">All Batches</option>
                {batches.map(b => <option key={b} value={b}>{b}</option>)}
              </Select>
            </div>
          </>
        )}
      </div>

      {/* Preview + Delete Row */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-rose-100">
        <div className="flex items-center gap-3 flex-wrap">
          <Button
            variant="ghost"
            type="button"
            onClick={fetchPreview}
            disabled={!startDate || !endDate || isFetchingPreview || isClearing}
            className="h-auto px-4 py-2 rounded-xl text-xs font-bold bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 transition-colors flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
          >
            {isFetchingPreview ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CalendarDays className="h-3.5 w-3.5" />}
            Preview Count
          </Button>
          {previewCount !== null && (
            <span className="text-xs font-bold text-rose-700 bg-rose-50 border border-rose-200 px-3 py-1.5 rounded-xl">
              {previewCount} record{previewCount !== 1 ? "s" : ""} will be deleted
            </span>
          )}
        </div>
        <Button
          variant="ghost"
          type="button"
          onClick={handleClear}
          disabled={!startDate || !endDate || isClearing}
          className="h-auto px-5 py-2.5 rounded-xl text-xs font-black bg-rose-600 hover:bg-rose-700 text-white shadow-sm transition-colors flex items-center gap-2 disabled:opacity-50 cursor-pointer"
        >
          {isClearing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
          Clear Attendance
        </Button>
      </div>

      <div className="p-3 bg-amber-50/70 border border-amber-200/80 rounded-xl flex items-start gap-2 text-amber-800 text-[10px] font-medium">
        <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 mt-0.5" />
        <span>
          This permanently removes attendance records and cannot be undone. Use <strong>Preview Count</strong> first to see how many records will be affected before confirming deletion.
        </span>
      </div>
    </div>
  );
};

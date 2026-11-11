"use client";

import React, { useState, useMemo } from "react";
import { useApp, Course } from "@/context/AppContext";
import {
  Info,
  X,
  GraduationCap,
  Building2,
  Calendar,
  Clock,
  BookOpen,
  Users,
  MapPin,
  Layers,
  CheckCircle2,
  Sparkles,
  Copy,
  Check,
  Award,
  Hash
} from "lucide-react";
import { Dialog } from "@/components/ui/dialog";

export interface CourseInfoModalProps {
  course: Course | string | null;
  collegeId?: string;
  isOpen: boolean;
  onClose: () => void;
}

export const CourseInfoModal: React.FC<CourseInfoModalProps> = ({
  course,
  collegeId,
  isOpen,
  onClose
}) => {
  const { coursesList, colleges, students, mentors, subjectsList } = useApp();
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<"overview" | "curriculum" | "classrooms">("overview");

  // Resolve course object
  const resolvedCourse = useMemo(() => {
    if (!course) return null;
    if (typeof course === "object" && course.name) {
      // Find full record from coursesList if available to get all fields
      const fromList = coursesList.find(c => 
        (c.id && c.id === course.id) ||
        (c.name && c.name.toLowerCase().trim() === course.name.toLowerCase().trim() && (!collegeId || c.college_id === collegeId))
      );
      return fromList || course;
    }

    const courseNameStr = typeof course === "string" ? course.trim() : "";
    if (!courseNameStr) return null;

    const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
    const targetNorm = norm(courseNameStr);

    // 1. Exact name & college match
    let found = coursesList.find(c => 
      c.name && norm(c.name) === targetNorm && (!collegeId || c.college_id === collegeId)
    );
    // 2. Exact name match across all colleges
    if (!found) {
      found = coursesList.find(c => c.name && norm(c.name) === targetNorm);
    }
    // 3. Match by ID or Code
    if (!found) {
      found = coursesList.find(c => 
        (c.id && norm(c.id) === targetNorm) ||
        (c.code && norm(c.code) === targetNorm)
      );
    }
    // 4. Substring / startsWith match
    if (!found) {
      found = coursesList.find(c => 
        c.name && (norm(c.name).startsWith(targetNorm) || targetNorm.startsWith(norm(c.name)))
      );
    }

    if (found) return found;

    // Fallback stub object if course was not in DB
    return {
      id: `course_${targetNorm}`,
      name: courseNameStr,
      college_id: collegeId || "",
      code: courseNameStr.slice(0, 8).toUpperCase().replace(/[^A-Z0-9]/g, ""),
      status: "Active",
      years: 3,
      shift_based: 0,
      default_shift: "general",
      working_days: 6
    } as Course;
  }, [course, collegeId, coursesList]);

  if (!isOpen || !resolvedCourse) return null;

  // College details
  const courseCollege = resolvedCourse.college_id ? colleges.find(c => c.id === resolvedCourse.college_id) : (colleges[0] || null);
  const collegeName = courseCollege?.name || "Campus unassigned";

  // Compute live statistics
  const normDept = (s: string) => (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const targetNorm = normDept(resolvedCourse.name);

  // Enrolled students
  const enrolledStudents = students.filter(s => {
    if (resolvedCourse.college_id && s.college_id && s.college_id !== resolvedCourse.college_id) return false;
    const sDept = normDept(s.department || "");
    const sCg = normDept(s.classGroup || "");
    return sDept === targetNorm || sCg.includes(targetNorm);
  });

  // Curriculum subjects
  const courseSubjects = subjectsList.filter(s => {
    if (resolvedCourse.college_id && s.college_id && s.college_id !== resolvedCourse.college_id) return false;
    const subDept = normDept(s.department || "");
    const subCode = s.department ? normDept(s.department) : "";
    return subDept === targetNorm || (resolvedCourse.code && subCode === normDept(resolvedCourse.code));
  });

  // Unique active class groups / cohorts
  const activeCohorts = Array.from(new Set(enrolledStudents.map(s => s.classGroup).filter(Boolean)));

  // Assigned mentors
  const assignedMentors = mentors.filter(m => {
    if (resolvedCourse.college_id && m.college_id && m.college_id !== resolvedCourse.college_id) return false;
    const mGroup = normDept(m.mentor_group || "");
    const rawClasses = Array.isArray(m.classes) ? m.classes : (typeof m.classes === "string" ? (m.classes as string).split(",") : []);
    const mClasses = rawClasses.map((c: any) => normDept(String(c)));
    return mGroup === targetNorm || mClasses.some((c: string) => c.includes(targetNorm));
  });

  // Classroom parsing
  const parsedRooms: Record<string, string> = (() => {
    if (!resolvedCourse.default_room) return {};
    try {
      const parsed = typeof resolvedCourse.default_room === "string"
        ? JSON.parse(resolvedCourse.default_room)
        : resolvedCourse.default_room;
      return typeof parsed === "object" && parsed !== null ? parsed : {};
    } catch {
      return { "Default Room": String(resolvedCourse.default_room) };
    }
  })();

  const handleCopyCode = () => {
    const textToCopy = resolvedCourse.code || resolvedCourse.name;
    navigator.clipboard.writeText(textToCopy);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Group subjects by Semester / Year
  const subjectsBySem = courseSubjects.reduce((acc, sub) => {
    const semKey = sub.semester || (sub.year ? `${sub.year}` : "General Curriculum");
    if (!acc[semKey]) acc[semKey] = [];
    acc[semKey].push(sub);
    return acc;
  }, {} as Record<string, typeof courseSubjects>);

  const semKeys = Object.keys(subjectsBySem).sort();

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      ariaLabel={`Course details — ${resolvedCourse.name}`}
      overlayClassName="z-[100] p-4 bg-slate-950/60 backdrop-blur-sm"
      panelClassName="max-w-xl max-h-[90vh] p-6 space-y-5 flex flex-col overflow-hidden rounded-2xl"
    >
        {/* Close button */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
          className="absolute right-4 top-4 h-8 w-8 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-800 flex items-center justify-center transition-all cursor-pointer z-10"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>

        {/* Modal Header */}
        <div className="flex items-start gap-3.5 pr-8 border-b border-slate-100 pb-4 shrink-0">
          <div className="h-11 w-11 rounded-2xl bg-gradient-to-br from-indigo-500 to-indigo-700 text-white flex items-center justify-center shadow-md shadow-indigo-500/20 shrink-0">
            <GraduationCap className="h-6 w-6" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-base font-black text-slate-900 leading-tight truncate">
                {resolvedCourse.name}
              </h3>
              {resolvedCourse.code && (
                <span className="px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 border border-indigo-100 font-bold text-[10px] tracking-wide uppercase">
                  {resolvedCourse.code}
                </span>
              )}
              <span className={`px-2 py-0.5 rounded-full text-[9px] font-extrabold tracking-wide flex items-center gap-1 ${
                resolvedCourse.status === "Inactive"
                  ? "bg-rose-50 text-rose-700 border border-rose-200"
                  : "bg-emerald-50 text-emerald-700 border border-emerald-200"
              }`}>
                <span className={`h-1.5 w-1.5 rounded-full ${
                  resolvedCourse.status === "Inactive" ? "bg-rose-500" : "bg-emerald-500 animate-pulse"
                }`}></span>
                {resolvedCourse.status || "Active"}
              </span>
            </div>

            <div className="flex items-center gap-2 text-xs text-slate-500 font-medium mt-1 flex-wrap">
              <span className="flex items-center gap-1 text-[11px] text-slate-600 font-semibold">
                <Building2 className="h-3 w-3 text-slate-400" />
                {collegeName}
              </span>
              {resolvedCourse.shift_based === 1 ? (
                <span className="text-[10px] font-bold px-1.5 py-0.5 bg-purple-50 text-purple-700 border border-purple-100 rounded">
                  Shift-Based Course
                </span>
              ) : (
                <span className="text-[10px] font-bold px-1.5 py-0.5 bg-slate-100 text-slate-600 border border-slate-200 rounded">
                  Standard Course
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center gap-1 border-b border-slate-100 pb-2 shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab("overview")}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              activeTab === "overview"
                ? "bg-indigo-50 text-indigo-700 border border-indigo-200 shadow-2xs"
                : "text-slate-500 hover:text-slate-800 hover:bg-slate-50"
            }`}
          >
            Overview &amp; Stats
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("curriculum")}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTab === "curriculum"
                ? "bg-indigo-50 text-indigo-700 border border-indigo-200 shadow-2xs"
                : "text-slate-500 hover:text-slate-800 hover:bg-slate-50"
            }`}
          >
            <span>Curriculum Subjects</span>
            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-slate-200/70 text-slate-700 font-bold">
              {courseSubjects.length}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("classrooms")}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              activeTab === "classrooms"
                ? "bg-indigo-50 text-indigo-700 border border-indigo-200 shadow-2xs"
                : "text-slate-500 hover:text-slate-800 hover:bg-slate-50"
            }`}
          >
            Classrooms &amp; Cohorts
          </button>
        </div>

        {/* Tab Body */}
        <div className="overflow-y-auto flex-1 space-y-4 pr-1 text-xs">
          {activeTab === "overview" && (
            <div className="space-y-4">
              {/* 4 KPI Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl space-y-1">
                  <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                    <Clock className="h-3 w-3 text-indigo-500" />
                    <span>Duration</span>
                  </div>
                  <div className="text-sm font-extrabold text-slate-800">
                    {resolvedCourse.years || 3} Years
                  </div>
                  <div className="text-[10px] text-slate-400 font-medium">
                    {(resolvedCourse.years || 3) * 2} Semesters
                  </div>
                </div>

                <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl space-y-1">
                  <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                    <Layers className="h-3 w-3 text-purple-500" />
                    <span>Shift Model</span>
                  </div>
                  <div className="text-sm font-extrabold text-slate-800 capitalize truncate">
                    {resolvedCourse.default_shift || (resolvedCourse.shift_based === 1 ? "Shift 1 & 2" : "General")}
                  </div>
                  <div className="text-[10px] text-slate-400 font-medium">
                    {resolvedCourse.shift_based === 1 ? "Multi-Shift" : "Full Day"}
                  </div>
                </div>

                <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl space-y-1">
                  <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                    <Calendar className="h-3 w-3 text-emerald-500" />
                    <span>Batch Cycle</span>
                  </div>
                  <div className="text-sm font-extrabold text-slate-800">
                    {resolvedCourse.start_year && resolvedCourse.end_year 
                      ? `${resolvedCourse.start_year}–${resolvedCourse.end_year}` 
                      : (resolvedCourse.start_date ? resolvedCourse.start_date.split("-")[0] : "2026–2029")}
                  </div>
                  <div className="text-[10px] text-slate-400 font-medium truncate">
                    {resolvedCourse.start_date || "Academic Term"}
                  </div>
                </div>

                <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl space-y-1">
                  <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                    <Sparkles className="h-3 w-3 text-amber-500" />
                    <span>Schedule</span>
                  </div>
                  <div className="text-sm font-extrabold text-slate-800">
                    {resolvedCourse.working_days || 6} Days
                  </div>
                  <div className="text-[10px] text-slate-400 font-medium">
                    Mon – Sat Weekly
                  </div>
                </div>
              </div>

              {/* Campus Live Statistics */}
              <div className="p-3.5 rounded-xl bg-indigo-50/60 border border-indigo-100 space-y-2.5">
                <span className="text-[10px] font-extrabold text-indigo-800 uppercase tracking-wider block">
                  Campus Live Snapshot
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-center">
                  <div className="p-2 bg-white rounded-lg border border-indigo-100 shadow-2xs">
                    <div className="text-lg font-black text-slate-900">{enrolledStudents.length}</div>
                    <div className="text-[10px] text-slate-500 font-bold">Enrolled Students</div>
                  </div>
                  <div className="p-2 bg-white rounded-lg border border-indigo-100 shadow-2xs">
                    <div className="text-lg font-black text-slate-900">{courseSubjects.length}</div>
                    <div className="text-[10px] text-slate-500 font-bold">Mapped Subjects</div>
                  </div>
                  <div className="p-2 bg-white rounded-lg border border-indigo-100 shadow-2xs">
                    <div className="text-lg font-black text-slate-900">{activeCohorts.length}</div>
                    <div className="text-[10px] text-slate-500 font-bold">Active Cohorts</div>
                  </div>
                </div>
              </div>

              {/* Course Leadership & Details */}
              <div className="p-3.5 bg-slate-50 border border-slate-100 rounded-xl space-y-2">
                <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block">
                  Course Metadata &amp; Leadership
                </span>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <span className="text-[10px] text-slate-400 font-semibold block">Head of Department (HOD)</span>
                    <span className="text-xs font-bold text-slate-800">
                      {resolvedCourse.hod_name ? `Prof. ${resolvedCourse.hod_name}` : "Not Assigned"}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 font-semibold block">Established Year</span>
                    <span className="text-xs font-bold text-slate-800">
                      {resolvedCourse.established_year || "—"}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 font-semibold block">Course Identifier (ID)</span>
                    <span className="text-[11px] font-mono text-slate-700 font-semibold truncate block">
                      {resolvedCourse.id}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 font-semibold block">Assigned Mentors</span>
                    <span className="text-xs font-bold text-slate-800">
                      {assignedMentors.length} Faculty Mentors
                    </span>
                  </div>
                </div>
                {resolvedCourse.description && (
                  <div className="pt-2 border-t border-slate-200/70">
                    <span className="text-[10px] text-slate-400 font-semibold block">Description</span>
                    <p className="text-xs text-slate-600 mt-0.5">{resolvedCourse.description}</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === "curriculum" && (
            <div className="space-y-3">
              {semKeys.length === 0 ? (
                <div className="text-center py-8 text-slate-400 font-medium">
                  <BookOpen className="h-8 w-8 mx-auto text-slate-300 mb-2" />
                  <p>No curriculum subjects mapped to this course yet.</p>
                </div>
              ) : (
                semKeys.map(sem => (
                  <div key={sem} className="border border-slate-100 rounded-2xl overflow-hidden bg-white shadow-card">
                    <div className="px-3.5 py-2 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                      <span className="font-extrabold text-slate-800 text-xs">{sem}</span>
                      <span className="text-[10px] font-bold text-slate-500 bg-white px-2 py-0.5 rounded border border-slate-200">
                        {subjectsBySem[sem].length} Subjects
                      </span>
                    </div>
                    <div className="p-3 divide-y divide-slate-100">
                      {subjectsBySem[sem].map((sub, idx) => (
                        <div key={sub.id || idx} className="py-2 first:pt-0 last:pb-0 flex items-center justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <span className="font-bold text-slate-800 block truncate">{sub.name}</span>
                            <span className="text-[10px] text-slate-400 font-medium">
                              {sub.weekly_hours ? `${sub.weekly_hours} hrs/week` : "Core Curriculum"}
                              {sub.shift ? ` • Shift: ${sub.shift}` : ""}
                            </span>
                          </div>
                          {sub.type && (
                            <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase shrink-0 ${
                              sub.type === "SKILL"
                                ? "bg-amber-50 text-amber-700 border border-amber-200"
                                : sub.type === "LAB"
                                ? "bg-teal-50 text-teal-700 border border-teal-200"
                                : "bg-indigo-50 text-indigo-700 border border-indigo-100"
                            }`}>
                              {sub.type}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {activeTab === "classrooms" && (
            <div className="space-y-3">
              <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl space-y-2">
                <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block">
                  Classroom &amp; Room Allocations
                </span>
                {Object.keys(parsedRooms).length === 0 ? (
                  <p className="text-xs text-slate-400 italic">No specific default classrooms configured for this course.</p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {Object.entries(parsedRooms).map(([key, val]) => (
                      <div key={key} className="p-2.5 bg-white border border-slate-100 rounded-2xl flex items-center justify-between shadow-card">
                        <span className="text-[11px] font-bold text-slate-600 truncate">{key.replace(/^Year\s*/i, "Yr ")}:</span>
                        <span className="px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-100 font-black text-xs">
                          Room {String(val)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl space-y-2">
                <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block">
                  Active Cohorts / Batches ({activeCohorts.length})
                </span>
                {activeCohorts.length === 0 ? (
                  <p className="text-xs text-slate-400 italic">No cohorts actively populated with registered students.</p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {activeCohorts.map(cohort => (
                      <span key={cohort} className="px-2 py-1 bg-white border border-slate-200 text-slate-700 text-[10px] font-bold rounded-lg shadow-2xs">
                        {cohort}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between border-t border-slate-100 pt-3 shrink-0">
          <button
            type="button"
            onClick={handleCopyCode}
            className="inline-flex items-center gap-1.5 text-slate-500 hover:text-indigo-600 text-xs font-bold transition-all cursor-pointer"
          >
            {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
            <span>{copied ? "Copied!" : "Copy Code"}</span>
          </button>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
            className="px-4 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-all cursor-pointer active:scale-95"
          >
            Close
          </button>
        </div>
    </Dialog>
  );
};

export interface CourseInfoButtonProps {
  course?: Course | string | null;
  collegeId?: string;
  size?: "xs" | "sm" | "md";
  className?: string;
  title?: string;
}

export const CourseInfoButton: React.FC<CourseInfoButtonProps> = ({
  course,
  collegeId,
  size = "xs",
  className = "",
  title = "View course details"
}) => {
  const [isOpen, setIsOpen] = useState(false);

  if (!course) return null;

  const sizeClasses = {
    xs: "h-4 w-4 text-[10px]",
    sm: "h-5 w-5 text-xs",
    md: "h-6 w-6 text-sm"
  }[size];

  const iconSizes = {
    xs: "h-2.5 w-2.5",
    sm: "h-3 w-3",
    md: "h-3.5 w-3.5"
  }[size];

  return (
    <>
      <span
        role="button"
        tabIndex={0}
        title={title}
        aria-label={title}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setIsOpen(true);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            e.stopPropagation();
            setIsOpen(true);
          }
        }}
        onMouseDown={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
        className={`inline-flex items-center justify-center rounded-full bg-indigo-50/90 hover:bg-indigo-600 text-indigo-600 hover:text-white border border-indigo-200/80 hover:border-indigo-600 transition-all shadow-2xs hover:shadow-xs active:scale-90 cursor-pointer shrink-0 select-none ${sizeClasses} ${className}`}
      >
        <Info className={`${iconSizes} stroke-[2.5]`} />
      </span>

      {isOpen && (
        <CourseInfoModal
          course={course}
          collegeId={collegeId}
          isOpen={isOpen}
          onClose={() => setIsOpen(false)}
        />
      )}
    </>
  );
};

export default CourseInfoButton;

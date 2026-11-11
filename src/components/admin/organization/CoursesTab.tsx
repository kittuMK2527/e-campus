"use client";

import React, { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { useApp, Department, Subject } from "@/context/AppContext";
import { useToast } from "@/context/ToastContext";
import { PageHeader } from "@/components/ui/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import {
  Layers,
  Search,
  Building2,
  ChevronDown,
  ChevronRight,
  Plus,
  Edit,
  Trash2,
  Copy,
  X
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  ActionDropdownButton
} from "@/components/ui/dropdown-menu";
import { CourseInfoButton } from "@/components/CourseInfoModal";
import { CourseModal } from "@/components/CourseModal";
import { SubjectDialog, type SubjectFormState, type DynamicSubjectRow } from "@/components/admin/dialogs/SubjectDialog";
import { AdminTabSkeleton } from "@/components/admin/AdminTabSkeleton";
import {
  formatYearWiseRooms,
  isMentorInProgram,
  isDeptSubjectMatch,
  isSameYear,
  isSameSemester,
  getDeptFromClassGroup
} from "@/lib/utils";

export const CoursesTab: React.FC = () => {
  const {
    colleges,
    coursesList,
    mentors,
    slots,
    subjectsList,
    subjectGroups,
    createCourse,
    deleteCourse,
    createSubject,
    updateSubject,
    refreshData,
    isDataLoading
  } = useApp();
  const { toast, confirm: showConfirm } = useToast();

  const searchParams = useSearchParams();
  const campusParam = searchParams?.get("campus") || null;

  const [searchQuery, setSearchQuery] = useState("");
  const [expandedColleges, setExpandedColleges] = useState<Record<string, boolean>>(() => {
    return campusParam ? { [campusParam]: true } : {};
  });
  const [expandedDepts, setExpandedDepts] = useState<Record<string, boolean>>({});
  const [expandedDeptYears, setExpandedDeptYears] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (campusParam) {
      setExpandedColleges(prev => ({ ...prev, [campusParam]: true }));
    }
  }, [campusParam]);

  // CourseModal state
  const [isCourseModalOpen, setIsCourseModalOpen] = useState(false);
  const [editingCourse, setEditingCourse] = useState<Department | null>(null);
  const [targetCollegeId, setTargetCollegeId] = useState<string | undefined>(undefined);

  // SubjectModal state (for "Add Subject" from inside a course year)
  const [showSubjectModal, setShowSubjectModal] = useState(false);
  const [editingSubject, setEditingSubject] = useState<Subject | null>(null);
  const [subjectForm, setSubjectForm] = useState<SubjectFormState>({
    name: "",
    department: "",
    semester: "Semester 1",
    type: "SKILL",
    college_id: colleges[0]?.id || "",
    year: "Year 1",
    weekly_hours: 4,
    mentor_group: "",
    mentorIds: []
  });
  const [dynamicSubjects, setDynamicSubjects] = useState<DynamicSubjectRow[]>([
    { id: "row_1", name: "", type: "SKILL", weekly_hours: 4, mentor_group: "" },
    { id: "row_2", name: "", type: "ACADEMIC", weekly_hours: 4, mentor_group: "" },
    { id: "row_3", name: "", type: "LAB", weekly_hours: 2, mentor_group: "" }
  ]);
  const [lockDeptAndYear, setLockDeptAndYear] = useState(false);
  const [subjectModalError, setSubjectModalError] = useState<string | null>(null);
  const [isSubmittingSubject, setIsSubmittingSubject] = useState(false);
  const [campusFilter, setCampusFilter] = useState("all");

  const toggleExpandAll = () => {
    const allExpanded = colleges.every(c => expandedColleges[c.id] !== false);
    const nextState: Record<string, boolean> = {};
    colleges.forEach(c => {
      nextState[c.id] = !allExpanded;
    });
    setExpandedColleges(nextState);
  };

  const toggleDeptYear = (deptId: string, yr: string) => {
    const key = `${deptId}_${yr}`;
    setExpandedDeptYears(prev => ({
      ...prev,
      [key]: prev[key] === undefined ? false : !prev[key]
    }));
  };

  const handleOpenCourseModal = (dept?: Department, defaultColId?: string) => {
    setEditingCourse(dept || null);
    setTargetCollegeId(defaultColId || (colleges[0]?.id || undefined));
    setIsCourseModalOpen(true);
  };

  const handleDeleteDept = async (id: string, name: string) => {
    if (
      !(await showConfirm({
        title: "Delete Course",
        message: `Are you sure you want to delete the course "${name}"?\n\nThis will permanently delete all associated mentors, students, subjects, slots, and attendance records. This action cannot be undone.`,
        danger: true,
        confirmLabel: "Delete Course"
      }))
    ) {
      return;
    }
    try {
      const res = await deleteCourse(id);
      if (res.success) {
        await refreshData();
        const counts = res.deletedCounts;
        if (counts && (counts.slots > 0 || counts.students > 0 || counts.mentors > 0)) {
          toast(
            `Course "${name}" deleted. Cascade removed: ${counts.slots} slot(s), ${counts.students} student(s), ${counts.mentors} mentor(s), ${counts.subjects} subject(s).`,
            "info"
          );
        } else {
          toast(`Course "${name}" deleted successfully.`, "success");
        }
      } else {
        toast(res.message || "Failed to delete course.", "error");
      }
    } catch (err: any) {
      toast(err.message || "An error occurred while deleting.", "error");
    }
  };

  const handleDuplicateCourse = async (dept: Department, collegeId: string) => {
    try {
      const dupName = `${dept.name} (Copy)`;
      const dupCode = dept.code ? `${dept.code}_COPY` : "";
      const payload: Omit<Department, "id"> = {
        name: dupName,
        code: dupCode,
        college_id: collegeId,
        years: dept.years || 4,
        start_year: dept.start_year || "",
        end_year: dept.end_year || "",
        start_date: dept.start_date || "",
        end_date: dept.end_date || "",
        description: dept.description || "",
        default_room: dept.default_room || "",
        default_shift: dept.default_shift || "general",
        status: "Active"
      };
      const res = await createCourse(payload as any);
      if (res.success) {
        toast(`Course "${dept.name}" duplicated successfully!`, "success");
        await refreshData(true);
      } else {
        toast(res.message || "Failed to duplicate course.", "error");
      }
    } catch (err: any) {
      toast(err.message || "An unexpected error occurred while duplicating.", "error");
    }
  };

  const handleOpenSubjectModal = (sub?: Subject, defaultDept?: string, defaultYear?: string, defaultColId?: string) => {
    setSubjectModalError(null);
    if (sub) {
      setSubjectForm({
        name: sub.name,
        department: sub.department,
        semester: sub.semester,
        type: sub.type || "SKILL",
        college_id: sub.college_id || colleges[0]?.id || "",
        year: sub.year || "Year 1",
        weekly_hours: sub.weekly_hours || 4,
        mentor_group: sub.mentor_group || sub.subject_group || "",
        mentorIds: []
      });
      setEditingSubject(sub);
      setLockDeptAndYear(false);
    } else {
      setDynamicSubjects([
        { id: "row_1", name: "", type: "SKILL", weekly_hours: 4, mentor_group: "" },
        { id: "row_2", name: "", type: "ACADEMIC", weekly_hours: 4, mentor_group: "" },
        { id: "row_3", name: "", type: "LAB", weekly_hours: 2, mentor_group: "" }
      ]);
      setSubjectForm({
        name: "",
        department: defaultDept || (coursesList[0]?.name || ""),
        semester:
          defaultYear === "Year 2"
            ? "Semester 3"
            : defaultYear === "Year 3"
            ? "Semester 5"
            : defaultYear === "Year 4"
            ? "Semester 7"
            : "Semester 1",
        type: "SKILL",
        college_id: defaultColId || colleges[0]?.id || "",
        year: defaultYear || "Year 1",
        weekly_hours: 4,
        mentor_group: "",
        mentorIds: []
      });
      setEditingSubject(null);
      setLockDeptAndYear(!!defaultDept);
    }
    setShowSubjectModal(true);
  };

  const handleSubjectSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubjectModalError(null);

    if (!subjectForm.department.trim()) {
      setSubjectModalError("Course / Department is required.");
      return;
    }
    if (!subjectForm.college_id) {
      setSubjectModalError("Please select a campus for this subject.");
      return;
    }

    setIsSubmittingSubject(true);
    try {
      if (editingSubject) {
        if (!subjectForm.name.trim()) {
          setSubjectModalError("Subject Name is required.");
          return;
        }
        const payload = {
          name: subjectForm.name.trim(),
          department: subjectForm.department.trim(),
          semester: subjectForm.semester,
          type: subjectForm.type,
          college_id: subjectForm.college_id || undefined,
          year: subjectForm.year,
          weekly_hours: subjectForm.weekly_hours,
          subject_group: subjectForm.mentor_group,
          mentor_group: subjectForm.mentor_group
        };
        const res = await updateSubject({ ...payload, id: editingSubject.id });
        if (res.success) {
          setShowSubjectModal(false);
          toast("Subject updated successfully.", "success");
          await refreshData(true);
        } else {
          setSubjectModalError(res.message || "Failed to save subject.");
        }
      } else {
        const validSubjects = dynamicSubjects.filter(s => s.name && s.name.trim() !== "");
        if (validSubjects.length > 0) {
          const payload = validSubjects.map(p => {
            const group = (p.mentor_group && p.mentor_group.trim() !== "")
              ? p.mentor_group.trim()
              : (subjectForm.mentor_group || "General");
            return {
              name: p.name.trim(),
              department: subjectForm.department.trim(),
              semester: subjectForm.semester,
              type: p.type || "SKILL",
              college_id: subjectForm.college_id || undefined,
              year: subjectForm.year,
              weekly_hours: Number(p.weekly_hours) || 4,
              subject_group: group,
              mentor_group: group
            };
          });

          const res = await createSubject(payload as any);
          if (res.success) {
            setShowSubjectModal(false);
            toast(`Successfully created ${validSubjects.length} subject(s)!`, "success");
            await refreshData(true);
          } else {
            setSubjectModalError(res.message || "Failed to create subjects.");
          }
        } else {
          if (!subjectForm.name.trim()) {
            setSubjectModalError("Please enter at least one Subject Name.");
            return;
          }
          const payload = {
            name: subjectForm.name.trim(),
            department: subjectForm.department.trim(),
            semester: subjectForm.semester,
            type: subjectForm.type,
            college_id: subjectForm.college_id || undefined,
            year: subjectForm.year,
            weekly_hours: subjectForm.weekly_hours,
            subject_group: subjectForm.mentor_group,
            mentor_group: subjectForm.mentor_group
          };
          const res = await createSubject(payload);
          if (res.success) {
            setShowSubjectModal(false);
            toast("Subject created successfully.", "success");
            await refreshData(true);
          } else {
            setSubjectModalError(res.message || "Failed to save subject.");
          }
        }
      }
    } catch (err: any) {
      setSubjectModalError(err.message || "An unexpected error occurred.");
    } finally {
      setIsSubmittingSubject(false);
    }
  };

  if (isDataLoading && (!colleges || colleges.length === 0)) {
    return <AdminTabSkeleton message="Loading courses and curriculum…" />;
  }

  return (
    <div className="space-y-4 animate-fadeIn font-sans text-xs">
      <PageHeader
        icon={Layers}
        title="Courses & Curriculum"
        actions={
          <div className="flex items-center gap-2">
            <Select
              aria-label="Campus filter"
              value={campusFilter}
              onChange={e => setCampusFilter(e.target.value)}
              className="w-auto min-w-[150px] h-9 text-xs cursor-pointer font-semibold rounded-2xl"
            >
              <option value="all">🏢 All Campuses</option>
              {colleges.map(c => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>

            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
              <Input
                type="text"
                aria-label="Search courses"
                placeholder="Search courses, subjects..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-48 pl-8 pr-7 h-9 text-xs font-semibold rounded-2xl"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 rounded-full hover:bg-slate-100 cursor-pointer"
                  title="Clear search"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={toggleExpandAll}
              className="h-9 text-xs font-bold whitespace-nowrap rounded-2xl"
            >
              {colleges.every(c => expandedColleges[c.id] !== false) ? "Collapse All" : "Expand All"}
            </Button>
          </div>
        }
      />

      <div className="space-y-6">
        {colleges
          .filter(col => campusFilter === "all" || col.id === campusFilter)
          .map(col => {
          const isColExpanded = expandedColleges[col.id] !== false; // defaults to true
          const collegeDepts = coursesList.filter(
            d => d.college_id === col.id || (col.id === colleges[0]?.id && !d.college_id)
          );
          // Subjects hang off a course by its name, so two campuses that run the same
          // course ("BCA") would render each other's subject list. Keep only this
          // campus's subjects — rows with no campus stay shared, as everywhere else.
          const campusSubjects = (subjectsList || []).filter(
            s => !s.college_id || s.college_id === col.id
          );
          const campusSlots = (slots || []).filter(
            s => !s.college_id || s.college_id === col.id
          );
          const filteredDepts = collegeDepts.filter(dept => {
            const matchesDept =
              dept.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
              dept.id.toLowerCase().includes(searchQuery.toLowerCase());
            const matchesSubjects = campusSubjects.some(
              s => s.department === dept.name && s.name.toLowerCase().includes(searchQuery.toLowerCase())
            );
            return matchesDept || matchesSubjects;
          });

          return (
            <div key={col.id} className="border border-slate-100 rounded-2xl bg-white shadow-card overflow-hidden">
              {/* College section header */}
              <div className="p-4 bg-slate-50/70 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <button
                  onClick={() => setExpandedColleges(prev => ({ ...prev, [col.id]: !prev[col.id] }))}
                  className="flex flex-wrap items-center gap-x-2 gap-y-1 hover:text-indigo-600 transition-all text-left font-extrabold cursor-pointer border-none bg-transparent p-0 max-w-full"
                >
                  {isColExpanded ? (
                    <ChevronDown className="h-5 w-5 text-gray-500 shrink-0" />
                  ) : (
                    <ChevronRight className="h-5 w-5 text-gray-500 shrink-0" />
                  )}
                  <Building2 className="h-5 w-5 text-indigo-600 shrink-0" />
                  <div className="leading-tight flex-1 min-w-0">
                    <span className="text-sm font-black text-gray-900 block truncate sm:whitespace-normal">
                      {col.name}
                    </span>
                    <span className="text-[10px] text-gray-400 block font-normal mt-0.5 truncate sm:whitespace-normal">
                      {col.address || "No Address"}
                    </span>
                  </div>
                  <span className="bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded text-[10px] font-bold ml-2 shrink-0">
                    {filteredDepts.length} course(s)
                  </span>
                </button>

                <Button
                  variant="ghost"
                  type="button"
                  onClick={() => handleOpenCourseModal(undefined, col.id)}
                  className="h-auto btn-gradient shadow-sm text-white px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1 shrink-0 cursor-pointer border-none"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add Course
                </Button>
              </div>

              {isColExpanded && (
                <div className="p-4 space-y-4">
                  {filteredDepts.length === 0 ? (
                    <div className="text-center py-6 text-slate-400 italic">No courses found for this campus.</div>
                  ) : (
                    <div className="space-y-3">
                      {filteredDepts.map(dept => {
                        const facultyCount = mentors.filter(m =>
                          isMentorInProgram(m, dept.name, campusSlots, campusSubjects)
                        ).length;
                        const deptSubjects = campusSubjects.filter(s =>
                          isDeptSubjectMatch(s.department, dept.name, dept.code)
                        );
                        const isDeptExpanded = expandedDepts[dept.id];
                        const deptSlots = campusSlots.filter(
                          s => (s.department || getDeptFromClassGroup(s.classGroup)) === dept.name
                        );

                        return (
                          <div key={dept.id} className="border border-slate-100 rounded-2xl overflow-hidden bg-slate-50/40">
                            {/* Department row */}
                            <div className="p-3.5 bg-white border-b border-slate-100 flex items-center justify-between gap-4 flex-wrap">
                              <div
                                role="button"
                                tabIndex={0}
                                onClick={() => setExpandedDepts(prev => ({ ...prev, [dept.id]: !prev[dept.id] }))}
                                onKeyDown={e => {
                                  if (e.key === "Enter" || e.key === " ") {
                                    e.preventDefault();
                                    setExpandedDepts(prev => ({ ...prev, [dept.id]: !prev[dept.id] }));
                                  }
                                }}
                                className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5 hover:text-indigo-600 transition-all text-left font-bold cursor-pointer border-none bg-transparent p-0 max-w-full select-none"
                              >
                                {isDeptExpanded ? (
                                  <ChevronDown className="h-4 w-4 text-gray-500 shrink-0" />
                                ) : (
                                  <ChevronRight className="h-4 w-4 text-gray-500 shrink-0" />
                                )}
                                <span className="text-xs font-black text-gray-900">{dept.name}</span>
                                <CourseInfoButton course={dept} collegeId={col.id} size="xs" />
                                {dept.code && (
                                  <span className="px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-100 text-[9px] font-bold">
                                    {dept.code}
                                  </span>
                                )}
                                {dept.start_year && dept.end_year && (
                                  <span className="px-2 py-0.5 rounded bg-slate-100 border border-slate-200 text-slate-600 text-[9px] font-extrabold whitespace-nowrap">
                                    {dept.start_year}–{dept.end_year}
                                  </span>
                                )}
                                <span
                                  className={`px-2 py-0.5 rounded-full text-[8.5px] font-bold whitespace-nowrap ${
                                    dept.status === "Inactive"
                                      ? "bg-rose-50 text-rose-700 border border-rose-200"
                                      : "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                  }`}
                                >
                                  {dept.status || "Active"}
                                </span>

                                {/* Timetable badge */}
                                {(() => {
                                  const shift1 = deptSlots.filter(s => s.shift === "shift_1").length;
                                  const shift2 = deptSlots.filter(s => s.shift === "shift_2").length;
                                  const general = deptSlots.filter(s => s.shift === "general").length;
                                  return deptSlots.length > 0 ? (
                                    <span className="px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-[8.5px] font-extrabold text-emerald-700 flex items-center gap-1 shadow-xs whitespace-nowrap">
                                      <span className="h-1 w-1 rounded-full bg-emerald-600 animate-pulse shrink-0"></span>
                                      {deptSlots.length} Slots
                                      {shift1 > 0 && (
                                        <span className="bg-teal-100 text-teal-700 px-1 py-0.5 rounded text-[7.5px] font-black">
                                          S1:{shift1}
                                        </span>
                                      )}
                                      {shift2 > 0 && (
                                        <span className="bg-indigo-100 text-indigo-700 px-1 py-0.5 rounded text-[7.5px] font-black">
                                          S2:{shift2}
                                        </span>
                                      )}
                                      {general > 0 && (
                                        <span className="bg-amber-100 text-amber-700 px-1 py-0.5 rounded text-[7.5px] font-black">
                                          Gen:{general}
                                        </span>
                                      )}
                                    </span>
                                  ) : (
                                    <span className="px-2 py-0.5 rounded-full bg-slate-50 border border-slate-200 text-[8.5px] font-extrabold text-slate-400 whitespace-nowrap">
                                      No Timetable
                                    </span>
                                  );
                                })()}
                              </div>

                              <div className="flex items-center gap-4 text-[11px] font-bold text-gray-600">
                                <span>
                                  Faculty: <span className="text-gray-900">{facultyCount}</span>
                                </span>
                                <span>
                                  Subjects: <span className="text-gray-900">{deptSubjects.length}</span>
                                </span>

                                <div className="flex items-center ml-2 border-l border-gray-200 pl-3">
                                  <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                      <ActionDropdownButton size="sm" />
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end" className="w-44">
                                      <DropdownMenuItem onClick={() => handleOpenCourseModal(dept, col.id)}>
                                        <Edit className="h-3.5 w-3.5 mr-2 text-indigo-600" />
                                        Edit Course
                                      </DropdownMenuItem>
                                      <DropdownMenuItem onClick={() => handleDuplicateCourse(dept, col.id)}>
                                        <Copy className="h-3.5 w-3.5 mr-2 text-emerald-600" />
                                        Duplicate Course
                                      </DropdownMenuItem>
                                      <DropdownMenuSeparator />
                                      <DropdownMenuItem
                                        onClick={() => handleDeleteDept(dept.id, dept.name)}
                                        className="text-rose-600 focus:bg-rose-50"
                                      >
                                        <Trash2 className="h-3.5 w-3.5 mr-2 text-rose-600" />
                                        Delete Course
                                      </DropdownMenuItem>
                                    </DropdownMenuContent>
                                  </DropdownMenu>
                                </div>
                              </div>
                            </div>

                            {/* Department expanded */}
                            {isDeptExpanded && (
                              <div className="p-3 bg-gray-50/50 space-y-4">
                                {/* Course Overview Details Card */}
                                <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-card flex flex-col md:flex-row justify-between gap-4">
                                  <div className="space-y-2 flex-1">
                                    <span className="text-xs font-bold text-gray-400 uppercase tracking-wider block">
                                      Course Details
                                    </span>
                                    <p className="text-[11px] text-gray-500 leading-relaxed font-semibold">
                                      {dept.description || "No description provided for this course."}
                                    </p>
                                  </div>
                                  <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-[11px] font-bold text-gray-600 shrink-0 md:border-l md:border-gray-200 md:pl-6 md:min-w-[280px]">
                                    <div>
                                      <span className="text-[9px] uppercase tracking-wider text-gray-400 block mb-0.5">
                                        Course Duration
                                      </span>
                                      <span className="text-gray-900 font-extrabold">
                                        {dept.years || 4} Year(s) ({Number(dept.years || 4) * 2} Semesters)
                                      </span>
                                    </div>
                                    <div>
                                      <span className="text-[9px] uppercase tracking-wider text-gray-400 block mb-0.5">
                                        Code Prefix
                                      </span>
                                      <span className="text-indigo-600 font-extrabold">{dept.code || "None"}</span>
                                    </div>
                                    <div>
                                      <span className="text-[9px] uppercase tracking-wider text-gray-400 block mb-0.5">
                                        Offerings
                                      </span>
                                      <span className="text-gray-900 font-extrabold">
                                        {dept.default_shift === "all"
                                          ? "Shift 1, 2 & General"
                                          : dept.default_shift === "both"
                                          ? "Shift 1 & 2"
                                          : dept.default_shift === "shift_2"
                                          ? "Shift 2 (Evening)"
                                          : dept.default_shift === "shift_1"
                                          ? "Shift 1 (Day)"
                                          : "General Shift"}
                                      </span>
                                    </div>
                                    <div className="col-span-2">
                                      <span className="text-[9px] uppercase tracking-wider text-gray-400 block mb-0.5">
                                        Assigned Classrooms
                                      </span>
                                      <span className="text-gray-900 font-extrabold block">
                                        {formatYearWiseRooms(dept.default_room)}
                                      </span>
                                    </div>
                                    <div>
                                      <span className="text-[9px] uppercase tracking-wider text-gray-400 block mb-0.5">
                                        Current Status
                                      </span>
                                      <span
                                        className={`inline-flex items-center gap-1 text-[10px] ${
                                          dept.status === "Inactive"
                                            ? "text-rose-600 font-extrabold"
                                            : "text-emerald-600 font-extrabold"
                                        }`}
                                      >
                                        <span
                                          className={`h-1.5 w-1.5 rounded-full ${
                                            dept.status === "Inactive" ? "bg-rose-600" : "bg-emerald-600"
                                          }`}
                                        />
                                        {dept.status || "Active"}
                                      </span>
                                    </div>
                                  </div>
                                </div>

                                <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                                  {Array.from(
                                    { length: dept.years ? Number(dept.years) : 4 },
                                    (_, i) => `Year ${i + 1}`
                                  ).map((yr, i) => {
                                    const yrSubjects = deptSubjects.filter(
                                      s =>
                                        isSameYear(s.year, yr, s.semester) &&
                                        (searchQuery === "" ||
                                          s.name.toLowerCase().includes(searchQuery.toLowerCase()))
                                    );
                                    const yearKey = `${dept.id}_${yr}`;
                                    const isYearExpanded = expandedDeptYears[yearKey] !== false; // default to true

                                    const semOdd = `Semester ${2 * (i + 1) - 1}`;
                                    const semEven = `Semester ${2 * (i + 1)}`;
                                    const semOddSubjects = yrSubjects.filter(s => isSameSemester(s.semester, semOdd));
                                    const semEvenSubjects = yrSubjects.filter(s => isSameSemester(s.semester, semEven));

                                    return (
                                      <div
                                        key={yr}
                                        className="border border-slate-100 rounded-2xl overflow-hidden bg-white shadow-card flex flex-col"
                                      >
                                        {/* Year card header */}
                                        <div className="flex flex-col sm:flex-row sm:items-center justify-between p-3 bg-slate-50 border-b border-slate-100 font-bold text-gray-800 text-xs gap-2">
                                          <button
                                            onClick={() => toggleDeptYear(dept.id, yr)}
                                            className="flex flex-wrap items-center gap-x-2 gap-y-1 hover:text-indigo-600 transition-all text-left font-extrabold cursor-pointer border-none bg-transparent p-0 max-w-full"
                                          >
                                            {isYearExpanded ? (
                                              <ChevronDown className="h-4 w-4 text-gray-500 shrink-0" />
                                            ) : (
                                              <ChevronRight className="h-4 w-4 text-gray-500 shrink-0" />
                                            )}
                                            <div className="flex items-baseline gap-1.5">
                                              <span>{yr}</span>
                                              <span className="text-[10.5px] text-gray-400 font-semibold lowercase">
                                                (sem {2 * (i + 1) - 1}/{2 * (i + 1)})
                                              </span>
                                            </div>
                                            <div className="flex flex-wrap gap-1.5 sm:ml-2">
                                              <span className="bg-indigo-50 border border-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full text-[9px] font-extrabold whitespace-nowrap">
                                                Sem {2 * (i + 1) - 1}: {semOddSubjects.length}
                                              </span>
                                              <span className="bg-purple-50 border border-purple-100 text-purple-700 px-2 py-0.5 rounded-full text-[9px] font-extrabold whitespace-nowrap">
                                                Sem {2 * (i + 1)}: {semEvenSubjects.length}
                                              </span>
                                            </div>
                                          </button>

                                          <Button
                                            variant="ghost"
                                            onClick={() => handleOpenSubjectModal(undefined, dept.name, yr, col.id)}
                                            className="h-auto flex items-center justify-center gap-1 text-[10px] bg-indigo-50 border border-indigo-200 text-indigo-700 hover:bg-indigo-600 hover:text-white hover:border-indigo-600 px-2 py-1 rounded-lg transition-all font-bold cursor-pointer w-full sm:w-auto shrink-0"
                                          >
                                            <Plus className="h-3 w-3" />
                                            Add Subject
                                          </Button>
                                        </div>

                                        {/* Year card body */}
                                        {isYearExpanded && (
                                          <div className="p-3.5 flex-1 grid grid-cols-1 md:grid-cols-2 gap-4 bg-gray-50/30">
                                            {/* Odd semester */}
                                            <div className="space-y-2">
                                              <span className="text-[10px] font-extrabold text-indigo-700 uppercase tracking-wider block">
                                                {semOdd} ({semOddSubjects.length})
                                              </span>
                                              {semOddSubjects.length === 0 ? (
                                                <p className="text-[10px] text-gray-400 italic">No subjects added.</p>
                                              ) : (
                                                <div className="space-y-1">
                                                  {semOddSubjects.map(s => (
                                                    <div
                                                      key={s.id}
                                                      className="p-1.5 rounded-lg bg-white border border-gray-200 flex items-center justify-between gap-2"
                                                    >
                                                      <span className="font-bold text-gray-800 truncate">{s.name}</span>
                                                      <div className="flex items-center gap-1 shrink-0">
                                                        <Badge variant="outline" className="text-[9px]">
                                                          {s.type || "SKILL"}
                                                        </Badge>
                                                        <Button
                                                          variant="ghost"
                                                          size="icon"
                                                          onClick={() => handleOpenSubjectModal(s)}
                                                          className="h-6 w-6"
                                                        >
                                                          <Edit className="h-3 w-3 text-gray-400 hover:text-indigo-600" />
                                                        </Button>
                                                      </div>
                                                    </div>
                                                  ))}
                                                </div>
                                              )}
                                            </div>

                                            {/* Even semester */}
                                            <div className="space-y-2">
                                              <span className="text-[10px] font-extrabold text-purple-700 uppercase tracking-wider block">
                                                {semEven} ({semEvenSubjects.length})
                                              </span>
                                              {semEvenSubjects.length === 0 ? (
                                                <p className="text-[10px] text-gray-400 italic">No subjects added.</p>
                                              ) : (
                                                <div className="space-y-1">
                                                  {semEvenSubjects.map(s => (
                                                    <div
                                                      key={s.id}
                                                      className="p-1.5 rounded-lg bg-white border border-gray-200 flex items-center justify-between gap-2"
                                                    >
                                                      <span className="font-bold text-gray-800 truncate">{s.name}</span>
                                                      <div className="flex items-center gap-1 shrink-0">
                                                        <Badge variant="outline" className="text-[9px]">
                                                          {s.type || "SKILL"}
                                                        </Badge>
                                                        <Button
                                                          variant="ghost"
                                                          size="icon"
                                                          onClick={() => handleOpenSubjectModal(s)}
                                                          className="h-6 w-6"
                                                        >
                                                          <Edit className="h-3 w-3 text-gray-400 hover:text-indigo-600" />
                                                        </Button>
                                                      </div>
                                                    </div>
                                                  ))}
                                                </div>
                                              )}
                                            </div>
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })}
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
            </div>
          );
        })}
      </div>

      {/* Course Modal */}
      <CourseModal
        isOpen={isCourseModalOpen}
        onClose={() => {
          setIsCourseModalOpen(false);
          setEditingCourse(null);
        }}
        editingCourse={editingCourse}
        defaultCollegeId={targetCollegeId}
        onSaved={async () => {
          await refreshData(true);
        }}
        onToast={(msg, type) => {
          toast(msg, type || "info");
        }}
      />

      {/* Subject Modal */}
      <SubjectDialog
        open={showSubjectModal}
        onOpenChange={setShowSubjectModal}
        editingSubject={editingSubject}
        form={subjectForm}
        onFormChange={setSubjectForm}
        onSubmit={handleSubjectSubmit}
        error={subjectModalError}
        isSubmitting={isSubmittingSubject}
        colleges={colleges}
        coursesList={coursesList}
        subjectGroups={subjectGroups}
        mentors={mentors}
        lockDeptAndYear={lockDeptAndYear}
        dynamicSubjects={dynamicSubjects}
        onDynamicSubjectsChange={setDynamicSubjects}
      />
    </div>
  );
};

"use client";

import React, { useState, useMemo, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { useApp, Subject } from "@/context/AppContext";
import { useToast } from "@/context/ToastContext";
import { PageHeader } from "@/components/ui/PageHeader";
import { FilterBar } from "@/components/ui/FilterBar";
import { TableSurface } from "@/components/dashboard/TableSurface";
import { Pagination } from "@/components/ui/Pagination";
import { usePagination } from "@/hooks/usePagination";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { getDeptFromClassGroup } from "@/lib/utils";
import {
  GraduationCap,
  Plus,
  Search,
  BookOpen,
  Edit,
  Trash2,
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
import { SubjectDialog, type SubjectFormState, type DynamicSubjectRow } from "@/components/admin/dialogs/SubjectDialog";
import { MentorGroupDialog, type MentorGroupFormState } from "@/components/admin/dialogs/MentorGroupDialog";

export const SubjectsTab: React.FC = () => {
  const {
    colleges,
    subjectsList,
    slots,
    coursesList,
    subjectGroups,
    mentors,
    smes,
    createSubject,
    updateSubject,
    deleteSubject,
    createSubjectGroup,
    updateSubjectGroup,
    deleteSubjectGroup,
    updateMentor,
    refreshData
  } = useApp();
  const { toast, confirm: showConfirm } = useToast();

  const searchParams = useSearchParams();
  const campusParam = searchParams?.get("campus") || null;

  const [subjectsSubTab, setSubjectsSubTab] = useState<"catalog" | "groups">("catalog");
  const [subjectSearchQuery, setSubjectSearchQuery] = useState("");
  const [subjectCollegeFilter, setSubjectCollegeFilter] = useState(() => campusParam || "all");
  const [subjectSemesterFilter, setSubjectSemesterFilter] = useState("all");

  useEffect(() => {
    if (campusParam) {
      setSubjectCollegeFilter(campusParam);
    }
  }, [campusParam]);

  // Subject modal state
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

  // Group modal state
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [editingGroup, setEditingGroup] = useState<any | null>(null);
  const [groupForm, setGroupForm] = useState<MentorGroupFormState>({
    name: "",
    description: "",
    lead_sme_id: "",
    lead_sme_name: "",
    subjectIds: [],
    mentorIds: []
  });
  const [groupModalError, setGroupModalError] = useState<string | null>(null);
  const [isSubmittingGroup, setIsSubmittingGroup] = useState(false);

  const filteredSubjects = useMemo(() => {
    return (subjectsList || []).filter(sub => {
      const matchCol = subjectCollegeFilter === "all" || sub.college_id === subjectCollegeFilter;
      const matchSem = subjectSemesterFilter === "all" || sub.semester === subjectSemesterFilter;
      const query = subjectSearchQuery.toLowerCase().trim();
      const matchQuery =
        !query ||
        sub.name.toLowerCase().includes(query) ||
        (sub.id || "").toLowerCase().includes(query) ||
        (sub.department || "").toLowerCase().includes(query) ||
        (sub.mentor_group || "").toLowerCase().includes(query);
      return matchCol && matchSem && matchQuery;
    });
  }, [subjectsList, subjectCollegeFilter, subjectSemesterFilter, subjectSearchQuery]);

  const subjectPagination = usePagination(filteredSubjects, {
    pageSize: 15,
    pageSizeOptions: [10, 15, 25, 50],
    resetKeys: [subjectCollegeFilter, subjectSemesterFilter, subjectSearchQuery]
  });

  const handleOpenSubjectModal = (sub?: Subject, defaultDept?: string, defaultYear?: string) => {
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
        semester: defaultYear === "Year 2" ? "Semester 3" : defaultYear === "Year 3" ? "Semester 5" : defaultYear === "Year 4" ? "Semester 7" : "Semester 1",
        type: "SKILL",
        college_id: (subjectCollegeFilter !== "all" ? subjectCollegeFilter : "") || campusParam || colleges[0]?.id || "",
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

  const handleDeleteSubject = async (id: string) => {
    if (
      !(await showConfirm({
        message: "Are you sure you want to delete this subject?",
        danger: true,
        confirmLabel: "Delete"
      }))
    ) {
      return;
    }
    try {
      const res = await deleteSubject(id);
      if (res.success) {
        toast("Subject deleted successfully.", "success");
        await refreshData(true);
      } else {
        toast(res.message || "Failed to delete subject.", "error");
      }
    } catch (err: any) {
      toast(err.message || "An error occurred.", "error");
    }
  };

  const handleOpenGroupModal = (g?: any) => {
    setGroupModalError(null);
    if (g) {
      setGroupForm({
        name: g.name,
        description: g.description || "",
        lead_sme_id: g.lead_sme_id || "",
        lead_sme_name: g.lead_sme_name || "",
        subjectIds: g.subjectIds || [],
        mentorIds: g.mentorIds || []
      });
      setEditingGroup(g);
    } else {
      setGroupForm({
        name: "",
        description: "",
        lead_sme_id: "",
        lead_sme_name: "",
        subjectIds: [],
        mentorIds: []
      });
      setEditingGroup(null);
    }
    setShowGroupModal(true);
  };

  const handleGroupSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setGroupModalError(null);
    if (!groupForm.name.trim()) {
      setGroupModalError("Group Name is required.");
      return;
    }
    setIsSubmittingGroup(true);
    try {
      let res;
      const selectedSme = smes.find(s => s.id === groupForm.lead_sme_id);
      const leadSmeName = selectedSme ? selectedSme.name : groupForm.lead_sme_name;

      if (editingGroup) {
        res = await updateSubjectGroup(
          editingGroup.id,
          groupForm.name.trim(),
          groupForm.description.trim(),
          groupForm.subjectIds,
          groupForm.mentorIds,
          groupForm.lead_sme_id,
          leadSmeName
        );
      } else {
        res = await createSubjectGroup(
          groupForm.name.trim(),
          groupForm.description.trim(),
          groupForm.subjectIds,
          groupForm.mentorIds,
          groupForm.lead_sme_id,
          leadSmeName
        );
      }
      if (res.success) {
        setShowGroupModal(false);
        await refreshData(true);
        toast(editingGroup ? "Mentor group updated." : "Mentor group created.", "success");
      } else {
        setGroupModalError(res.message || "Failed to save mentor group.");
      }
    } catch (err: any) {
      setGroupModalError(err.message || "An unexpected error occurred.");
    } finally {
      setIsSubmittingGroup(false);
    }
  };

  const handleDeleteGroup = async (id: string) => {
    if (
      !(await showConfirm({
        message: "Are you sure you want to delete this mentor group? Mentors and subjects in this group will be reset to 'General'.",
        danger: true,
        confirmLabel: "Delete"
      }))
    ) {
      return;
    }
    try {
      const res = await deleteSubjectGroup(id);
      if (res.success) {
        toast("Mentor group deleted successfully.", "success");
        await refreshData(true);
      } else {
        toast(res.message || "Failed to delete mentor group.", "error");
      }
    } catch (err: any) {
      toast(err.message || "An error occurred.", "error");
    }
  };

  return (
    <div className="space-y-4 animate-fadeIn font-sans text-xs">
      <PageHeader
        icon={GraduationCap}
        title="Subjects Master Directory"
        actions={
          subjectsSubTab === "catalog" && (
            <Button
              variant="ghost"
              onClick={() => handleOpenSubjectModal()}
              className="h-auto btn-gradient shadow-sm text-white px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shrink-0 cursor-pointer border-none"
            >
              <Plus className="h-4 w-4" />
              Add Subject
            </Button>
          )
        }
      />

      {/* Sub Tabs Selector */}
      <div className="flex border-b border-gray-200 gap-6">
        <button
          onClick={() => setSubjectsSubTab("catalog")}
          className={`pb-2 px-1 text-xs font-black transition-all cursor-pointer ${
            subjectsSubTab === "catalog"
              ? "border-b-2 border-indigo-600 text-indigo-600"
              : "text-gray-400 hover:text-gray-600"
          }`}
        >
          Subjects Catalog
        </button>
        <button
          onClick={() => setSubjectsSubTab("groups")}
          className={`pb-2 px-1 text-xs font-black transition-all cursor-pointer ${
            subjectsSubTab === "groups"
              ? "border-b-2 border-indigo-600 text-indigo-600"
              : "text-gray-400 hover:text-gray-600"
          }`}
        >
          Mentor Groups
        </button>
      </div>

      {subjectsSubTab === "catalog" ? (
        <>
          {/* Filters Bar */}
          <FilterBar
            aside={
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Campus:</span>
                <Select
                  aria-label="Campus filter"
                  value={subjectCollegeFilter}
                  onChange={e => setSubjectCollegeFilter(e.target.value)}
                  className="w-auto min-w-[160px] cursor-pointer"
                >
                  <option value="all">All Campuses</option>
                  {colleges.map(col => (
                    <option key={col.id} value={col.id}>
                      {col.name}
                    </option>
                  ))}
                </Select>

                <span className="ml-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">Semester:</span>
                <Select
                  aria-label="Semester filter"
                  value={subjectSemesterFilter}
                  onChange={e => setSubjectSemesterFilter(e.target.value)}
                  className="w-auto min-w-[150px] cursor-pointer"
                >
                  <option value="all">All Semesters</option>
                  {Array.from({ length: 8 }, (_, i) => `Semester ${i + 1}`).map(sem => (
                    <option key={sem} value={sem}>
                      {sem}
                    </option>
                  ))}
                </Select>
              </div>
            }
          >
            <div className="relative w-56">
              <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                type="text"
                aria-label="Search subjects"
                placeholder="Search name, ID, course..."
                value={subjectSearchQuery}
                onChange={e => setSubjectSearchQuery(e.target.value)}
                className="w-full pl-9 pr-8 rounded-2xl"
              />
              {subjectSearchQuery && (
                <button
                  type="button"
                  onClick={() => setSubjectSearchQuery("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 rounded-full hover:bg-slate-100 cursor-pointer"
                  title="Clear search"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </FilterBar>

          {/* Subjects Table */}
          <TableSurface
            footer={
              <Pagination
                currentPage={subjectPagination.page}
                totalItems={filteredSubjects.length}
                pageSize={subjectPagination.pageSize}
                onPageChange={subjectPagination.setPage}
                onPageSizeChange={subjectPagination.setPageSize}
                pageSizeOptions={subjectPagination.pageSizeOptions}
              />
            }
          >
            <TableHeader>
              <TableRow>
                <TableHead>ID</TableHead>
                <TableHead>Subject Name</TableHead>
                <TableHead>Campus</TableHead>
                <TableHead>Department / Course</TableHead>
                <TableHead>Subject Group</TableHead>
                <TableHead>Year & Semester</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Weekly Hours</TableHead>
                <TableHead>Timetable Coverage</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredSubjects.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={10} className="h-32 text-center">
                    <div className="flex flex-col items-center gap-2 text-gray-400">
                      <GraduationCap className="h-8 w-8" />
                      <p className="text-sm font-semibold">No subjects found matching the selected criteria.</p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                subjectPagination.pageItems.map(sub => {
                  const campusName = colleges.find(c => c.id === sub.college_id)?.name || "Unknown Campus";
                  const subSlots = slots.filter(
                    slot =>
                      slot.course.toLowerCase() === sub.name.toLowerCase() &&
                      (slot.department || getDeptFromClassGroup(slot.classGroup)) === sub.department
                  );

                  const targetHours = sub.weekly_hours || 4;
                  const scheduledHours = subSlots.length;
                  let coverageVariant: "success" | "warning" | "destructive" | "secondary" = "secondary";
                  let coverageLabel = `Unscheduled (0/${targetHours} hrs)`;

                  if (scheduledHours === targetHours) {
                    coverageVariant = "success";
                    coverageLabel = `Fully Scheduled (${scheduledHours}/${targetHours} hrs)`;
                  } else if (scheduledHours > 0 && scheduledHours < targetHours) {
                    coverageVariant = "warning";
                    coverageLabel = `Under-scheduled (${scheduledHours}/${targetHours} hrs)`;
                  } else if (scheduledHours > targetHours) {
                    coverageVariant = "destructive";
                    coverageLabel = `Over-scheduled (${scheduledHours}/${targetHours} hrs)`;
                  }

                  const subjectType = (sub.type || "").toUpperCase();
                  const typeVariant: "secondary" | "warning" | "success" | "default" =
                    subjectType === "SKILL" || subjectType === "PRACTICAL"
                      ? "default"
                      : subjectType === "ACADEMIC" || subjectType === "THEORY"
                      ? "secondary"
                      : subjectType === "LAB"
                      ? "success"
                      : "warning";
                  const typeLabel =
                    subjectType === "SKILL" || subjectType === "PRACTICAL"
                      ? "Skill"
                      : subjectType === "ACADEMIC" || subjectType === "THEORY"
                      ? "Theory"
                      : subjectType === "LAB"
                      ? "Lab"
                      : sub.type || "General";

                  return (
                    <TableRow key={sub.id}>
                      <TableCell className="font-mono text-[10px] text-gray-400">{sub.id}</TableCell>
                      <TableCell className="font-bold text-gray-900">{sub.name}</TableCell>
                      <TableCell className="text-gray-600">{campusName}</TableCell>
                      <TableCell className="text-gray-600">{sub.department}</TableCell>
                      <TableCell>
                        <Badge variant="default">{sub.mentor_group || "General"}</Badge>
                      </TableCell>
                      <TableCell>
                        <span className="font-bold text-gray-800 block">{sub.year || "Year 1"}</span>
                        <span className="text-[10px] text-indigo-600 font-extrabold">{sub.semester}</span>
                      </TableCell>
                      <TableCell>
                        <Badge variant={typeVariant}>{typeLabel}</Badge>
                      </TableCell>
                      <TableCell className="font-bold text-gray-800">{targetHours} hr(s)</TableCell>
                      <TableCell>
                        <Badge variant={coverageVariant}>{coverageLabel}</Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <ActionDropdownButton size="sm" />
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-40">
                              <DropdownMenuItem onClick={() => handleOpenSubjectModal(sub)}>
                                <Edit className="h-3.5 w-3.5 mr-2 text-indigo-600" />
                                Edit Subject
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onClick={() => handleDeleteSubject(sub.id)}
                                className="text-rose-600 focus:bg-rose-50"
                              >
                                <Trash2 className="h-3.5 w-3.5 mr-2 text-rose-600" />
                                Delete Subject
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </TableSurface>
        </>
      ) : (
        <div className="space-y-6">
          <div className="flex justify-between items-center bg-white p-5 border border-slate-100 rounded-2xl shadow-card">
            <div>
              <h3 className="text-sm font-bold text-slate-900 tracking-tight">Configured Mentor Groups</h3>
              <p className="text-xs text-slate-500 font-medium mt-0.5">
                Create custom groups to cluster mentors and SMEs (e.g. Technical, Aptitude, Soft Skills) and allocate
                demo sessions.
              </p>
            </div>
            <Button
              variant="ghost"
              onClick={() => handleOpenGroupModal()}
              className="h-auto btn-gradient shadow-sm text-white px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1 cursor-pointer border-none"
            >
              <Plus className="h-4 w-4" />
              Create Mentor Group
            </Button>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-slate-100 shadow-card bg-white">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[12%]">ID</TableHead>
                  <TableHead className="w-[20%]">Group Name</TableHead>
                  <TableHead className="w-[22%]">Lead / Head SME</TableHead>
                  <TableHead className="w-[30%]">Description</TableHead>
                  <TableHead className="w-[10%] text-center">Mentors Count</TableHead>
                  <TableHead className="w-[6%] text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(subjectGroups || []).map(g => {
                  const count = (mentors || []).filter(
                    m =>
                      (m.mentor_group || m.subject_group || m.department || "").trim().toLowerCase() ===
                      (g.name || "").trim().toLowerCase()
                  ).length;
                  const leadSme = smes.find(s => s.id === g.lead_sme_id) || (g.lead_sme_name ? { name: g.lead_sme_name } : null);
                  return (
                    <TableRow key={g.id}>
                      <TableCell className="font-mono text-[10px] text-gray-400">{g.id}</TableCell>
                      <TableCell>
                        <Badge variant="secondary">{g.name}</Badge>
                      </TableCell>
                      <TableCell>
                        {leadSme ? (
                          <Badge variant="default" className="flex items-center gap-1 w-fit">
                            <BookOpen className="h-3 w-3 shrink-0" />
                            {leadSme.name}
                          </Badge>
                        ) : (
                          <span className="text-[10px] text-gray-400 italic">Unassigned</span>
                        )}
                      </TableCell>
                      <TableCell className="text-gray-600">{g.description || "—"}</TableCell>
                      <TableCell className="text-center font-bold">{count}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <ActionDropdownButton size="sm" />
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-40">
                              <DropdownMenuItem onClick={() => handleOpenGroupModal(g)}>
                                <Edit className="h-3.5 w-3.5 mr-2 text-indigo-600" />
                                Edit Group
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onClick={() => handleDeleteGroup(g.id)}
                                className="text-rose-600 focus:bg-rose-50"
                              >
                                <Trash2 className="h-3.5 w-3.5 mr-2 text-rose-600" />
                                Delete Group
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

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

      {/* Mentor Group Modal */}
      <MentorGroupDialog
        open={showGroupModal}
        onOpenChange={setShowGroupModal}
        editing={!!editingGroup}
        form={groupForm}
        onFormChange={setGroupForm}
        onSubmit={handleGroupSubmit}
        error={groupModalError}
        isSubmitting={isSubmittingGroup}
        smes={smes}
      />
    </div>
  );
};

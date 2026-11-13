"use client";
import { BulkOperationDialog, useBulkOperation } from "@/components/ui/bulk-operation";

import React, { useState, useMemo } from "react";
import { useApp, Mentor } from "@/context/AppContext";
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
import {
  UserCheck,
  Building2,
  Download,
  Upload,
  Search,
  Plus,
  Eye,
  Edit,
  Trash2,
  ChevronDown,
  X,
  RotateCcw
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  ActionDropdownButton
} from "@/components/ui/dropdown-menu";
import { MentorDialog, type MentorFormState } from "@/components/admin/dialogs/MentorDialog";
import { FacultyImportDialog } from "@/components/admin/dialogs/FacultyImportDialog";
import { MentorProfileModal } from "@/components/MentorProfileModal";

export const MentorsTab: React.FC = () => {
  const {
    colleges,
    mentors,
    students,
    coursesList,
    subjectsList,
    subjectGroups,
    createMentor,
    updateMentor,
    deleteMentor,
    bulkImportMentors,
    refreshData
  } = useApp();
  const { toast, confirm: showConfirm } = useToast();

  const [mentorCollegeFilter, setMentorCollegeFilter] = useState("all");
  const [templateCollegeId, setTemplateCollegeId] = useState(colleges[0]?.id || "");
  const [mentorSearchQuery, setMentorSearchQuery] = useState("");

  // Modal states
  const [showMentorModal, setShowMentorModal] = useState(false);
  const [editingMentor, setEditingMentor] = useState(false);
  const [mentorForm, setMentorForm] = useState<MentorFormState>({
    id: "",
    name: "",
    email: "",
    mentor_group: "",
    avatar: "",
    subjects: "",
    classes: "",
    college_id: colleges[0]?.id || ""
  });
  const [modalError, setModalError] = useState<string | null>(null);
  const [isSubmittingMentor, setIsSubmittingMentor] = useState(false);

  // Profile modal state
  const [selectedProfileMentor, setSelectedProfileMentor] = useState<Mentor | null>(null);
  const [isProfileOpen, setIsProfileOpen] = useState(false);

  // Bulk import state
  const [showImportPreview, setShowImportPreview] = useState(false);
  const [facultyImportPreview, setFacultyImportPreview] = useState<{ parsed: any[]; warnings: string[] } | null>(null);
  const [importTargetCollegeId, setImportTargetCollegeId] = useState(colleges[0]?.id || "");
  const [isImporting, setIsImporting] = useState(false);

  // Action loading state
  const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({});
  const setAction = (key: string, val: boolean) => {
    setActionLoading(prev => ({ ...prev, [key]: val }));
  };

  const isCampusShiftBased = useMemo(() => {
    const relevantCourses = coursesList.filter(
      c => !templateCollegeId || c.college_id === templateCollegeId
    );
    return relevantCourses.some(
      c => c.shift_based === 1 || (c.default_shift && c.default_shift !== "general")
    );
  }, [coursesList, templateCollegeId]);

  const filteredMentors = useMemo(() => {
    return mentors.filter(m => {
      const campusMatch = mentorCollegeFilter === "all" || m.college_id === mentorCollegeFilter;
      const query = mentorSearchQuery.toLowerCase().trim();
      const textMatch =
        !query ||
        m.name.toLowerCase().includes(query) ||
        m.email.toLowerCase().includes(query) ||
        m.id.toLowerCase().includes(query) ||
        (m.mentor_group || "").toLowerCase().includes(query) ||
        (m.subjects || "").toLowerCase().includes(query);
      return campusMatch && textMatch;
    });
  }, [mentors, mentorCollegeFilter, mentorSearchQuery]);

  const mentorPagination = usePagination(filteredMentors, {
    pageSize: 15,
    pageSizeOptions: [10, 15, 25, 50],
    resetKeys: [mentorCollegeFilter, mentorSearchQuery]
  });

  const handleOpenMentorModal = (m?: Mentor) => {
    setModalError(null);
    if (m) {
      setMentorForm({
        id: m.id,
        name: m.name,
        email: m.email,
        mentor_group: m.mentor_group || m.subject_group || m.department || "General",
        avatar: m.avatar,
        subjects: m.subjects || "",
        classes: m.classes || "",
        college_id: m.college_id || colleges[0]?.id || ""
      });
      setEditingMentor(true);
    } else {
      setMentorForm({
        id: "m" + (mentors.length + 1),
        name: "",
        email: "",
        mentor_group: "",
        avatar: "",
        subjects: "",
        classes: "",
        college_id: colleges[0]?.id || ""
      });
      setEditingMentor(false);
    }
    setShowMentorModal(true);
  };

  const handleMentorSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setModalError(null);
    if (!mentorForm.name.trim() || !mentorForm.email.trim() || !mentorForm.mentor_group.trim()) {
      setModalError("Name, Email, and Mentor Group are required.");
      return;
    }

    let initials = mentorForm.avatar.trim();
    if (!initials) {
      initials = mentorForm.name
        .split(" ")
        .filter(Boolean)
        .map(n => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2);
      if (!initials) initials = "M";
    }

    const payload = {
      id: mentorForm.id,
      name: mentorForm.name.trim(),
      email: mentorForm.email.trim(),
      department: mentorForm.mentor_group.trim(),
      avatar: initials,
      headerId: null,
      subjects: mentorForm.subjects.trim(),
      classes: mentorForm.classes.trim(),
      college_id: mentorForm.college_id,
      subject_group: mentorForm.mentor_group.trim(),
      mentor_group: mentorForm.mentor_group.trim()
    };

    setIsSubmittingMentor(true);
    try {
      let res;
      if (editingMentor) {
        res = await updateMentor(payload);
      } else {
        res = await createMentor(payload);
      }
      if (res.success) {
        setShowMentorModal(false);
        await refreshData(true);
        toast(`Mentor ${editingMentor ? "updated" : "created"} successfully.`, "success");
      } else {
        setModalError(res.message || "Failed to save mentor.");
      }
    } catch (err: any) {
      setModalError(err.message || "An unexpected error occurred.");
    } finally {
      setIsSubmittingMentor(false);
    }
  };

  const handleDeleteMentor = async (id: string) => {
    if (
      !(await showConfirm({
        message: "Are you sure you want to delete this mentor? This will also delete all slots assigned to them.",
        danger: true,
        confirmLabel: "Delete"
      }))
    ) {
      return;
    }
    setAction(`mentor_${id}`, true);
    try {
      const res = await deleteMentor(id);
      if (res.success) {
        toast("Mentor deleted successfully.", "success");
        await refreshData(true);
      } else {
        toast(res.message || "Failed to delete mentor.", "error");
      }
    } catch (err: any) {
      toast(err.message || "An error occurred while deleting.", "error");
    } finally {
      setAction(`mentor_${id}`, false);
    }
  };

  const handleDownloadFacultyTemplate = async () => {
    const targetCol = colleges.find(c => c.id === templateCollegeId) || colleges[0];
    const targetCollegeId = targetCol?.id || colleges[0]?.id || "";
    const targetCollegeName = targetCol?.name || "Selected College";
    const campusCourses = coursesList.filter(c => !targetCollegeId || c.college_id === targetCollegeId);
    const deptOptions = (campusCourses.length > 0 ? campusCourses : coursesList).map(c => c.name);
    const primaryDept = deptOptions[0] || "Computer Science";
    const secondaryDept = deptOptions[1] || primaryDept;

    const campusSubjects = (subjectsList || [])
      .filter(s => !targetCollegeId || s.college_id === targetCollegeId)
      .map(s => s.name);
    const sampleSubjects1 = campusSubjects.slice(0, 2).join(", ") || "Subject 1, Subject 2";
    const sampleSubjects2 = campusSubjects.slice(2, 4).join(", ") || "Subject 3, Subject 4";

    const campusClasses = Array.from(
      new Set(
        (students || [])
          .filter(s => !targetCollegeId || s.college_id === targetCollegeId)
          .map(s => s.classGroup)
          .filter(Boolean)
      )
    );
    const sampleClass1 = campusClasses.slice(0, 2).join(", ") || "Year 2 Section A, Year 3 Section B";
    const sampleClass2 = campusClasses.slice(2, 3).join(", ") || campusClasses[0] || "Year 1 Section A";

    const facultyData = [
      {
        "Faculty Name": "[SAMPLE] Dr. Anitha Ramesh",
        "Email Address": "anitha.ramesh@faceprep.in",
        "Department": primaryDept,
        "Shift": "Shift 1",
        "College ID": targetCollegeId,
        "College Name": targetCollegeName,
        "Assigned Subjects": sampleSubjects1,
        "Assigned Classes": sampleClass1
      },
      {
        "Faculty Name": "[SAMPLE] Prof. Rajesh Kumar",
        "Email Address": "rajesh.kumar@faceprep.in",
        "Department": secondaryDept,
        "Shift": "General Shift",
        "College ID": targetCollegeId,
        "College Name": targetCollegeName,
        "Assigned Subjects": sampleSubjects2,
        "Assigned Classes": sampleClass2
      }
    ];

    const mappingGuide = [
      {
        Guide: "Department Options",
        "Allowed Values": deptOptions.join(", ") || "General"
      },
      {
        Guide: "Shift Options",
        "Allowed Values": "Shift 1, Shift 2, General Shift"
      },
      {
        Guide: "Assigned Subjects",
        "Allowed Values": "Comma-separated subject names matching course curriculum"
      },
      {
        Guide: "Assigned Classes",
        "Allowed Values": "Comma-separated class groups e.g. Year 1 Section A, Year 2 Section B"
      }
    ];

    const XLSX = await import("xlsx");
    const wb = XLSX.utils.book_new();
    const ws1 = XLSX.utils.json_to_sheet(facultyData);
    const ws2 = XLSX.utils.json_to_sheet(mappingGuide);

    XLSX.utils.book_append_sheet(wb, ws1, "Faculty Directory");
    XLSX.utils.book_append_sheet(wb, ws2, "Timetable Mapping Guide");

    const safeName = targetCollegeName.replace(/[^a-zA-Z0-9]/g, "_");
    XLSX.writeFile(wb, `Faculty_Timetable_Template_${safeName}.xlsx`);
    toast(`Faculty & Timetable import template downloaded for ${targetCollegeName}.`, "success");
  };

  const handleFacultyFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async evt => {
      try {
        const XLSX = await import("xlsx");
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: "binary" });
        const sheetName = wb.SheetNames.includes("Faculty Directory") ? "Faculty Directory" : wb.SheetNames[0];
        const ws = wb.Sheets[sheetName];
        const rawRows: any[] = XLSX.utils.sheet_to_json(ws, { defval: "" });

        if (rawRows.length === 0) {
          toast("The uploaded spreadsheet is empty.", "warning");
          return;
        }

        const warnings: string[] = [];
        const parsedFaculty = rawRows.map((row, idx) => {
          const name = row.name || row.FacultyName || row.faculty_name || row["Faculty Name"] || row["Name"] || "";
          const email = row.email || row.EmailAddress || row.email_address || row["Email Address"] || row["Email"] || "";
          const dept = row.department || row.Department || row["Department"] || "Computer Science";
          const shift = row.shift || row.Shift || row["Shift"] || "General Shift";
          const subjects = row.subjects || row.AssignedSubjects || row.assigned_subjects || row["Assigned Subjects"] || "";
          const classes = row.classes || row.AssignedClasses || row.assigned_classes || row["Assigned Classes"] || "";
          const collegeId = row.college_id || row.CollegeID || row["College ID"] || templateCollegeId;

          if (!name) warnings.push(`Row ${idx + 2}: Faculty Name is missing.`);
          if (!email) warnings.push(`Row ${idx + 2}: Email Address is missing.`);

          let avatar = "";
          if (name) {
            avatar = name.split(" ").filter(Boolean).map((n: string) => n[0]).join("").toUpperCase().slice(0, 2);
          }

          return {
            id: `m_import_${Date.now()}_${idx}`,
            name,
            email,
            department: dept,
            mentor_group: dept,
            avatar: avatar || "M",
            shift,
            subjects,
            classes,
            college_id: collegeId
          };
        });

        setFacultyImportPreview({ parsed: parsedFaculty, warnings });
        setImportTargetCollegeId(templateCollegeId);
        setShowImportPreview(true);
      } catch (err) {
        console.error("Error reading Excel file:", err);
        toast("Failed to parse Excel file. Please use the downloaded template.", "error");
      }
    };
    reader.readAsBinaryString(file);
    e.target.value = "";
  };

  const bulk = useBulkOperation();
  const handleBulkImportConfirm = async () => {
    if (!facultyImportPreview?.parsed.length) return;
    const validRows = facultyImportPreview.parsed.filter((f: any) => f.name.trim() && f.email.trim());
    if (!bulk.begin({ title: "Faculty import", campus: colleges.find(c => c.id === importTargetCollegeId)?.name || "Selected campus", detail: `Saving ${validRows.length} valid faculty rows.` })) return;
    setIsImporting(true);
    try {
      const res = await bulkImportMentors(validRows, importTargetCollegeId);
      if (res.success) {
        bulk.finish(res.message);
        setShowImportPreview(false);
        setFacultyImportPreview(null);
      } else {
        bulk.finish(res.message || "Faculty import was not confirmed.", true);
      }
    } catch (err: any) {
      bulk.finish(err.message || "Check the directory before retrying.", true);
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div className="space-y-4 animate-fadeIn font-sans text-xs">
      <PageHeader
        icon={UserCheck}
        title="Faculty Mentors"
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              onClick={() => handleOpenMentorModal()}
              className="h-auto btn-gradient shadow-sm text-white px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1 cursor-pointer shrink-0"
            >
              <Plus className="h-4 w-4" />
              Add Mentor
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <ActionDropdownButton />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuItem
                  onClick={handleDownloadFacultyTemplate}
                  className="gap-2 cursor-pointer text-xs"
                >
                  <Download className="h-3.5 w-3.5 text-emerald-600" />
                  <span>Download Template</span>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => {
                    const input = document.getElementById("admin-mentor-bulk-input");
                    if (input) input.click();
                  }}
                  className="gap-2 cursor-pointer text-xs"
                >
                  <Upload className="h-3.5 w-3.5 text-indigo-600" />
                  <span>Bulk Import (Excel / CSV)</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <input
              id="admin-mentor-bulk-input"
              type="file"
              accept=".xlsx, .xls, .csv"
              onChange={handleFacultyFileSelect}
              className="hidden"
            />
          </div>
        }
      />

      <FilterBar>
        {/* Import target campus selector */}
        <div
          className="flex h-9 items-center gap-1.5 rounded-2xl border border-slate-200/90 bg-slate-50 px-3 shadow-2xs"
          title="Campus used by Template and Bulk Import"
        >
          <Building2 className="h-4 w-4 shrink-0 text-amber-500" />
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Import</span>
          <Select
            aria-label="Import campus"
            value={templateCollegeId}
            onChange={e => setTemplateCollegeId(e.target.value)}
            className="w-auto max-w-[180px] cursor-pointer truncate border-0 bg-transparent px-0 text-xs font-bold text-slate-800 focus:ring-0"
          >
            {colleges.map(c => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </div>

        {/* Campus filter for the directory list */}
        <div className="flex h-9 items-center gap-1.5 rounded-2xl border border-slate-200/90 bg-slate-50 px-3 shadow-2xs">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Campus</span>
          <Select
            aria-label="Filter mentors by campus"
            value={mentorCollegeFilter}
            onChange={e => setMentorCollegeFilter(e.target.value)}
            className="w-auto max-w-[180px] cursor-pointer truncate border-0 bg-transparent px-0 text-xs font-bold text-slate-800 focus:ring-0"
          >
            <option value="all">All Campuses</option>
            {colleges.map(c => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </div>

        {/* Search Bar */}
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            type="text"
            aria-label="Search faculty"
            placeholder="Search faculty..."
            value={mentorSearchQuery}
            onChange={e => setMentorSearchQuery(e.target.value)}
            className="w-full pl-9 pr-8 rounded-2xl"
          />
          {mentorSearchQuery && (
            <button
              type="button"
              onClick={() => setMentorSearchQuery("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 rounded-full hover:bg-slate-100 cursor-pointer"
              title="Clear search"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </FilterBar>

      <TableSurface
        footer={
          <Pagination
            currentPage={mentorPagination.page}
            totalItems={filteredMentors.length}
            pageSize={mentorPagination.pageSize}
            onPageChange={mentorPagination.setPage}
            onPageSizeChange={mentorPagination.setPageSize}
            pageSizeOptions={mentorPagination.pageSizeOptions}
          />
        }
      >
        <TableHeader>
          <TableRow>
            <TableHead>Mentor</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Mentor Group</TableHead>
            <TableHead>Assigned Campus</TableHead>
            {isCampusShiftBased && <TableHead>Shift</TableHead>}
            <TableHead>Mapped Subjects</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filteredMentors.length === 0 ? (
            <TableRow>
              <TableCell colSpan={isCampusShiftBased ? 7 : 6} className="h-36 text-center">
                <div className="flex flex-col items-center justify-center gap-2 text-slate-500 py-4">
                  <UserCheck className="h-8 w-8 text-slate-300" />
                  <p className="text-sm font-bold text-slate-700">No mentors found matching your search</p>
                  <p className="text-xs text-slate-400">Try adjusting your filters or search keywords</p>
                  {(mentorSearchQuery || mentorCollegeFilter !== "all") && (
                    <button
                      type="button"
                      onClick={() => {
                        setMentorSearchQuery("");
                        setMentorCollegeFilter("all");
                      }}
                      className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-amber-700 bg-amber-50 hover:bg-amber-100 rounded-xl transition-colors cursor-pointer"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                      Reset Filters
                    </button>
                  )}
                </div>
              </TableCell>
            </TableRow>
          ) : (
            mentorPagination.pageItems.map(m => {
              const col = colleges.find(c => c.id === m.college_id);
              const mentorSubjectsList =
                m.subjects && typeof m.subjects === "string"
                  ? m.subjects.split("\n").map(s => s.trim()).filter(Boolean)
                  : [];
              const mentorGrp = m.mentor_group || "General";

              return (
                <TableRow key={m.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-full btn-gradient flex items-center justify-center font-extrabold text-white text-[11px] shadow-sm shrink-0">
                        {m.avatar}
                      </div>
                      <div>
                        <span className="font-bold text-gray-900 block">{m.name}</span>
                        <span className="text-[10px] text-gray-400 font-mono">{m.id}</span>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="font-mono text-gray-600">{m.email}</TableCell>
                  <TableCell>
                    <Badge variant="secondary">{mentorGrp}</Badge>
                  </TableCell>
                  <TableCell className="font-bold">
                    {col ? col.name : <span className="text-gray-400 italic">Unassigned</span>}
                  </TableCell>
                  {isCampusShiftBased && (
                    <TableCell>
                      <Badge variant="outline">—</Badge>
                    </TableCell>
                  )}
                  <TableCell className="max-w-xs">
                    <div className="flex flex-wrap gap-1 max-h-16 overflow-y-auto">
                      {mentorSubjectsList.length > 0 ? (
                        mentorSubjectsList.map((sub, idx) => (
                          <Badge key={idx} variant="outline" className="text-[9.5px]">
                            {sub}
                          </Badge>
                        ))
                      ) : (
                        <span className="text-gray-400 italic text-xs">No subjects mapped</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <ActionDropdownButton size="sm" title="Mentor Actions" />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-44">
                          <DropdownMenuItem
                            onClick={() => {
                              setSelectedProfileMentor(m);
                              setIsProfileOpen(true);
                            }}
                          >
                            <Eye className="h-3.5 w-3.5 mr-2 text-indigo-600" />
                            Workload Profile
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleOpenMentorModal(m)}>
                            <Edit className="h-3.5 w-3.5 mr-2 text-slate-600" />
                            Edit Mentor
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() => handleDeleteMentor(m.id)}
                            className="text-rose-600 focus:bg-rose-50"
                          >
                            <Trash2 className="h-3.5 w-3.5 mr-2 text-rose-600" />
                            Delete Mentor
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

      {/* Mentor Add/Edit Dialog */}
      <MentorDialog
        open={showMentorModal}
        onOpenChange={setShowMentorModal}
        editing={editingMentor}
        form={mentorForm}
        onFormChange={setMentorForm}
        onSubmit={handleMentorSubmit}
        error={modalError}
        isSubmitting={isSubmittingMentor}
        colleges={colleges}
        subjectGroups={subjectGroups}
        subjectsList={subjectsList}
        isCampusShiftBased={isCampusShiftBased}
      />

      {/* Bulk Import Preview Dialog */}
      <BulkOperationDialog operation={bulk} />
      <FacultyImportDialog
        open={showImportPreview && !bulk.state}
        onOpenChange={setShowImportPreview}
        preview={facultyImportPreview}
        targetCollegeName={colleges.find(c => c.id === importTargetCollegeId)?.name || "Selected College"}
        isCampusShiftBased={isCampusShiftBased}
        isImporting={isImporting}
        onConfirmImport={handleBulkImportConfirm}
      />

      {/* Mentor Profile / Workload View Modal */}
      {selectedProfileMentor && (
        <MentorProfileModal
          isOpen={isProfileOpen}
          onClose={() => {
            setIsProfileOpen(false);
            setSelectedProfileMentor(null);
          }}
          mentor={selectedProfileMentor}
        />
      )}
    </div>
  );
};

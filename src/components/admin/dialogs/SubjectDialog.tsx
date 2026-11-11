"use client";

import React, { useState } from "react";
import {
  GraduationCap,
  X,
  Grid,
  Edit2,
  ShieldAlert,
  Plus,
  Trash2,
  Clock,
  Sparkles,
  BookOpen,
  CheckCircle2,
  AlertCircle,
  FileSpreadsheet,
  Download
} from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { LoadingButton } from "@/components/ui/LoadingButton";
import { College, Subject, Mentor, useApp } from "@/context/AppContext";
import { parseSubjectInput } from "@/lib/subjectParser";

export interface DynamicSubjectRow {
  id: string;
  name: string;
  type: string;
  weekly_hours: number;
  mentor_group?: string;
}

export interface SubjectFormState {
  name: string;
  department: string;
  semester: string;
  type: string;
  college_id: string;
  year: string;
  weekly_hours: number;
  mentor_group: string;
  mentorIds: string[];
}

export interface SubjectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingSubject: Subject | null;
  form: SubjectFormState;
  onFormChange: (form: SubjectFormState) => void;
  onSubmit: (e: React.FormEvent) => void;
  error?: string | null;
  isSubmitting?: boolean;
  colleges: College[];
  coursesList: any[];
  subjectGroups: Array<{ id: string; name: string }>;
  mentors: Mentor[];
  lockDeptAndYear?: boolean;
  dynamicSubjects: DynamicSubjectRow[];
  onDynamicSubjectsChange: (rows: DynamicSubjectRow[]) => void;
}

export const SubjectDialog: React.FC<SubjectDialogProps> = ({
  open,
  onOpenChange,
  editingSubject,
  form,
  onFormChange,
  onSubmit,
  error,
  isSubmitting = false,
  colleges,
  coursesList,
  subjectGroups,
  mentors,
  lockDeptAndYear = false,
  dynamicSubjects,
  onDynamicSubjectsChange
}) => {
  const [modalTab, setModalTab] = useState<"bulk" | "single">("bulk");
  const [bulkDefaultType, setBulkDefaultType] = useState("SKILL");
  const [bulkDefaultHours, setBulkDefaultHours] = useState(4);
  const [pasteStatus, setPasteStatus] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);

  const { subjectsList = [] } = useApp();

  const availableGroups = React.useMemo(() => subjectGroups.map(sg => sg.name), [subjectGroups]);

  const availableSubjectNames = React.useMemo(() => {
    const scoped = form.department
      ? subjectsList.filter(s => (s.department || "").toLowerCase() === form.department.toLowerCase())
      : subjectsList;
    const names = new Set<string>();
    scoped.forEach(s => {
      if (s.name && s.name.trim()) names.add(s.name.trim());
    });
    return Array.from(names).sort();
  }, [subjectsList, form.department]);

  if (!open) return null;

  // Offer only the selected campus's courses, keeping the row's current value so
  // an edit never silently blanks the department.
  const courseOptions = (() => {
    const scoped = form.college_id
      ? coursesList.filter(c => !c.college_id || c.college_id === form.college_id)
      : coursesList;
    const names = [...new Set(scoped.map(c => c.name as string))];
    if (form.department && !names.includes(form.department)) names.push(form.department);
    return names;
  })();

  const handleDownloadTemplate = async () => {
    try {
      const XLSX = await import("xlsx");
      
      // Use REAL created subject groups from system (no inline fake data)
      const realGroups = (subjectGroups || []).map(sg => sg.name).filter(Boolean);
      const group1 = realGroups[0] || "General";
      const group2 = realGroups[1] || group1;
      const group3 = realGroups[2] || group1;

      const sampleRows = [
        {
          "Subject Name": "Data Structures & Algorithms",
          "Subject Group": group1,
          "Domain / Type": "SKILL",
          "Weekly Hours": 4
        },
        {
          "Subject Name": "Computer Architecture",
          "Subject Group": group2,
          "Domain / Type": "ACADEMIC",
          "Weekly Hours": 4
        },
        {
          "Subject Name": "Database Systems Lab",
          "Subject Group": group3,
          "Domain / Type": "LAB",
          "Weekly Hours": 2
        },
        {
          "Subject Name": "Professional Elective",
          "Subject Group": group1,
          "Domain / Type": "GENERAL",
          "Weekly Hours": 2
        }
      ];
      const ws = XLSX.utils.json_to_sheet(sampleRows);
      ws["!cols"] = [{ wch: 32 }, { wch: 22 }, { wch: 16 }, { wch: 14 }];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Subjects");

      // Valid Groups Reference Sheet directly from real created database groups
      const groupsSheetData = (subjectGroups || []).map(sg => ({
        "Created Subject Group": sg.name,
        "Description": (sg as any).description || ""
      }));
      if (groupsSheetData.length > 0) {
        const wsGroups = XLSX.utils.json_to_sheet(groupsSheetData);
        wsGroups["!cols"] = [{ wch: 28 }, { wch: 35 }];
        XLSX.utils.book_append_sheet(wb, wsGroups, "Valid_Subject_Groups");
      }

      XLSX.writeFile(wb, "Subjects_Import_Template.xlsx");
      setPasteStatus({
        type: "success",
        message: "Template downloaded with your real-time subject groups!"
      });
    } catch (err: any) {
      setPasteStatus({
        type: "error",
        message: `Failed to download template: ${err?.message || ""}`
      });
    }
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const XLSX = await import("xlsx");
      const data = await file.arrayBuffer();
      const wb = XLSX.read(data, { type: "array" });
      const sheetName = wb.SheetNames[0];
      if (!sheetName) {
        setPasteStatus({ type: "error", message: "No sheet found in file." });
        return;
      }
      const ws = wb.Sheets[sheetName];
      const rawRows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
      if (!rawRows || rawRows.length === 0) {
        setPasteStatus({ type: "error", message: "File contains no rows." });
        return;
      }

      let headerRowIndex = -1;
      let colNameIdx = 0;
      let colGroupIdx = 1;
      let colTypeIdx = 2;
      let colHoursIdx = 3;

      for (let i = 0; i < Math.min(rawRows.length, 5); i++) {
        const row = rawRows[i].map(c => String(c).trim().toLowerCase());
        const nIdx = row.findIndex(c => c.includes("name") || c.includes("subject"));
        if (nIdx !== -1) {
          headerRowIndex = i;
          colNameIdx = nIdx;
          const gIdx = row.findIndex(c => c.includes("group"));
          if (gIdx !== -1) colGroupIdx = gIdx;
          const tIdx = row.findIndex(c => c.includes("domain") || c.includes("type"));
          if (tIdx !== -1) colTypeIdx = tIdx;
          const hIdx = row.findIndex(c => c.includes("hour"));
          if (hIdx !== -1) colHoursIdx = hIdx;
          break;
        }
      }

      const dataRows = headerRowIndex !== -1 ? rawRows.slice(headerRowIndex + 1) : rawRows;
      const newItems: DynamicSubjectRow[] = [];

      for (const r of dataRows) {
        const name = String(r[colNameIdx] || "").trim();
        if (!name) continue;

        const rawGroup = colGroupIdx !== -1 && r[colGroupIdx] ? String(r[colGroupIdx]).trim() : "";
        const rawType = colTypeIdx !== -1 && r[colTypeIdx] ? String(r[colTypeIdx]).trim() : "";
        const rawHours = colHoursIdx !== -1 && r[colHoursIdx] ? parseInt(String(r[colHoursIdx]).replace(/\D/g, "")) : 4;

        let normType = "SKILL";
        const u = rawType.toUpperCase();
        if (u.includes("THEORY") || u.includes("ACADEMIC")) normType = "ACADEMIC";
        else if (u.includes("LAB") || u.includes("PRACTICAL")) normType = "LAB";
        else if (u.includes("GENERAL") || u.includes("ELECTIVE")) normType = "GENERAL";
        else if (u.includes("SKILL")) normType = "SKILL";

        newItems.push({
          id: `row_${Date.now()}_${newItems.length}`,
          name,
          type: normType,
          weekly_hours: isNaN(rawHours) || rawHours <= 0 ? 4 : rawHours,
          mentor_group: rawGroup || form.mentor_group || "General"
        });
      }

      if (newItems.length === 0) {
        setPasteStatus({ type: "error", message: "No valid subject rows found in file." });
        return;
      }

      onDynamicSubjectsChange(newItems);
      setPasteStatus({
        type: "success",
        message: `✓ Imported ${newItems.length} subject(s) from ${file.name}!`
      });
    } catch (err: any) {
      setPasteStatus({
        type: "error",
        message: `Failed to read file: ${err?.message || "Invalid format"}`
      });
    } finally {
      e.target.value = "";
    }
  };

  const handleAutoGetFromCurriculum = () => {
    setPasteStatus(null);
    if (!form.department) {
      setPasteStatus({
        type: "error",
        message: "Please select a Course / Department first."
      });
      return;
    }

    // Match by department and semester
    const matching = subjectsList.filter(s =>
      s.department?.trim().toLowerCase() === form.department.trim().toLowerCase() &&
      (!form.semester || s.semester === form.semester)
    );

    // Fallback to department without semester filter if none for exact semester
    const candidates = matching.length > 0
      ? matching
      : subjectsList.filter(s => s.department?.trim().toLowerCase() === form.department.trim().toLowerCase());

    if (candidates.length === 0) {
      setPasteStatus({
        type: "error",
        message: `No existing curriculum subjects found for "${form.department}".`
      });
      return;
    }

    const seen = new Set<string>();
    const imported: DynamicSubjectRow[] = [];
    for (const sub of candidates) {
      const key = sub.name.trim().toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        imported.push({
          id: `row_curr_${Date.now()}_${imported.length}`,
          name: sub.name.trim(),
          type: sub.type || bulkDefaultType || "SKILL",
          weekly_hours: sub.weekly_hours || bulkDefaultHours || 4,
          mentor_group: sub.mentor_group || (sub as any).subject_group || form.mentor_group || ""
        });
      }
    }

    const hasNonEmpty = dynamicSubjects.some(r => r.name && r.name.trim() !== "");
    if (!hasNonEmpty) {
      onDynamicSubjectsChange(imported);
    } else {
      const filtered = dynamicSubjects.filter(r => r.name && r.name.trim() !== "");
      onDynamicSubjectsChange([...filtered, ...imported]);
    }

    setPasteStatus({
      type: "success",
      message: `✓ Loaded ${imported.length} subject(s) from curriculum!`
    });
  };

  const handleAddRow = () => {
    onDynamicSubjectsChange([
      ...dynamicSubjects,
      {
        id: `row_${Date.now()}`,
        name: "",
        type: bulkDefaultType,
        weekly_hours: bulkDefaultHours,
        mentor_group: form.mentor_group || ""
      }
    ]);
  };

  const handleRemoveRow = (id: string) => {
    onDynamicSubjectsChange(dynamicSubjects.filter(r => r.id !== id));
  };

  const handleClearAllRows = () => {
    onDynamicSubjectsChange([]);
    setPasteStatus(null);
  };

  const handleUpdateRow = (id: string, field: keyof DynamicSubjectRow, val: any) => {
    onDynamicSubjectsChange(
      dynamicSubjects.map(r => (r.id === id ? { ...r, [field]: val } : r))
    );
  };

  const validCount = dynamicSubjects.filter(r => r.name && r.name.trim() !== "").length;

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      ariaLabel="Subject"
      overlayClassName="bg-slate-950/60 backdrop-blur-sm p-4"
      panelClassName={`overflow-hidden animate-slideUp transition-all rounded-2xl ${
        editingSubject ? "max-w-md" : "max-w-4xl"
      } p-0 space-y-0 max-h-[90vh]`}
    >
      <div className="flex justify-between items-center px-6 py-4 border-b border-gray-100 bg-gray-50/80">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-indigo-50 text-indigo-600 border border-indigo-100">
            <GraduationCap className="h-5 w-5" />
          </div>
          <div>
            <h3 className="font-extrabold text-gray-900 text-base">
              {editingSubject ? "Edit Subject" : "Add Subjects"}
            </h3>
            <p className="text-xs text-gray-500 font-medium mt-0.5">
              {editingSubject
                ? "Update subject details."
                : "Add course subjects to curriculum."}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {!editingSubject && (
            <div className="bg-gray-200/80 p-0.5 rounded-xl flex items-center gap-0.5 text-xs font-bold">
              <button
                type="button"
                onClick={() => {
                  setModalTab("bulk");
                  if (dynamicSubjects.length === 0) {
                    onDynamicSubjectsChange([
                      { id: "row_1", name: "", type: bulkDefaultType, weekly_hours: bulkDefaultHours, mentor_group: form.mentor_group || "" }
                    ]);
                  }
                }}
                className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer flex items-center gap-1.5 ${
                  modalTab === "bulk"
                    ? "bg-white text-indigo-600 shadow-xs font-black"
                    : "text-gray-600 hover:text-gray-900"
                }`}
              >
                <Grid className="h-3.5 w-3.5" />
                <span>Bulk / List</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setModalTab("single");
                  onDynamicSubjectsChange([]);
                }}
                className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer flex items-center gap-1.5 ${
                  modalTab === "single"
                    ? "bg-white text-indigo-600 shadow-xs font-black"
                    : "text-gray-600 hover:text-gray-900"
                }`}
              >
                <Edit2 className="h-3.5 w-3.5" />
                <span>Single</span>
              </button>
            </div>
          )}
          <Button
            variant="ghost"
            size="icon"
            aria-label="Close dialog"
            onClick={() => onOpenChange(false)}
            className="h-auto w-auto p-2 hover:bg-gray-200 rounded-xl transition-colors cursor-pointer text-gray-400 hover:text-gray-700 ml-1"
          >
            <X className="h-5 w-5" />
          </Button>
        </div>
      </div>

      <form onSubmit={onSubmit} className="p-6 space-y-5 text-xs font-semibold max-h-[82vh] flex flex-col overflow-hidden">
        {error && (
          <div role="alert" className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 font-bold flex items-center gap-2 shrink-0">
            <ShieldAlert className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        {/* STRUCTURED BULK MODE */}
        {!editingSubject && modalTab === "bulk" && (
          <div className="space-y-4 flex-1 overflow-y-auto pr-1">
            <div className="p-4 bg-gray-50/90 border border-gray-200 rounded-xl space-y-3 shrink-0">
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] text-gray-500 uppercase tracking-wider block font-bold">Course / Department *</label>
                  <Select
                    aria-label="Course / Department"
                    required
                    disabled={lockDeptAndYear}
                    value={form.department}
                    onChange={e => onFormChange({ ...form, department: e.target.value })}
                    className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2 font-bold focus:outline-none focus:ring-1 focus:ring-indigo-600 cursor-pointer text-gray-800 disabled:opacity-60"
                  >
                    <option value="">— Select Course —</option>
                    {courseOptions.map(name => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                  </Select>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] text-gray-500 uppercase tracking-wider block font-bold">Target Campus *</label>
                  <Select
                    aria-label="Target Campus"
                    required
                    value={form.college_id}
                    onChange={e => onFormChange({ ...form, college_id: e.target.value })}
                    className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2 font-bold focus:outline-none focus:ring-1 focus:ring-indigo-600 cursor-pointer text-gray-800"
                  >
                    <option value="">— Select Campus —</option>
                    {colleges.map(c => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </Select>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] text-gray-500 uppercase tracking-wider block font-bold">Academic Year *</label>
                  <Select
                    aria-label="Academic Year"
                    required
                    disabled={lockDeptAndYear}
                    value={form.year}
                    onChange={e => {
                      const newYear = e.target.value;
                      let newSem = "Semester 1";
                      if (newYear === "Year 2") newSem = "Semester 3";
                      else if (newYear === "Year 3") newSem = "Semester 5";
                      else if (newYear === "Year 4") newSem = "Semester 7";
                      onFormChange({ ...form, year: newYear, semester: newSem });
                    }}
                    className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2 font-bold focus:outline-none focus:ring-1 focus:ring-indigo-600 cursor-pointer text-gray-800 disabled:opacity-60"
                  >
                    <option value="Year 1">Year 1</option>
                    <option value="Year 2">Year 2</option>
                    <option value="Year 3">Year 3</option>
                    <option value="Year 4">Year 4</option>
                  </Select>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] text-gray-500 uppercase tracking-wider block font-bold">Target Semester *</label>
                  <Select
                    aria-label="Target Semester"
                    required
                    value={form.semester}
                    onChange={e => onFormChange({ ...form, semester: e.target.value })}
                    className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2 font-bold focus:outline-none focus:ring-1 focus:ring-indigo-600 cursor-pointer text-gray-800"
                  >
                    {form.year === "Year 1" && (
                      <>
                        <option value="Semester 1">Semester 1</option>
                        <option value="Semester 2">Semester 2</option>
                      </>
                    )}
                    {form.year === "Year 2" && (
                      <>
                        <option value="Semester 3">Semester 3</option>
                        <option value="Semester 4">Semester 4</option>
                      </>
                    )}
                    {form.year === "Year 3" && (
                      <>
                        <option value="Semester 5">Semester 5</option>
                        <option value="Semester 6">Semester 6</option>
                      </>
                    )}
                    {form.year === "Year 4" && (
                      <>
                        <option value="Semester 7">Semester 7</option>
                        <option value="Semester 8">Semester 8</option>
                      </>
                    )}
                  </Select>
                </div>
              </div>

              <div className="space-y-1 pt-1">
                <label className="text-[10px] text-gray-500 uppercase tracking-wider block font-bold">
                  Default Mentor Group (Inherited by all rows unless specified per row)
                </label>
                <Select
                  aria-label="Default Mentor Group"
                  value={form.mentor_group}
                  onChange={e => onFormChange({ ...form, mentor_group: e.target.value })}
                  className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2 font-bold focus:outline-none focus:ring-1 focus:ring-indigo-600 cursor-pointer text-gray-800"
                >
                  <option value="">— Select Default Mentor Group —</option>
                  {subjectGroups.map(sg => (
                    <option key={sg.id} value={sg.name}>
                      {sg.name}
                    </option>
                  ))}
                </Select>
              </div>
            </div>

            {/* TEMPLATE & IMPORT TOOLBAR */}
            <div className="p-3 bg-slate-50 border border-slate-200/80 rounded-xl space-y-2">
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={handleImportFile}
                className="hidden"
              />
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 flex-wrap">
                  {/* Download Template Button */}
                  <button
                    type="button"
                    onClick={handleDownloadTemplate}
                    className="px-3 py-1.5 bg-white hover:bg-slate-100 text-indigo-700 border border-indigo-200 active:scale-95 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs"
                    title="Download Excel template (.xlsx)"
                  >
                    <Download className="h-3.5 w-3.5" />
                    <span>Download Template</span>
                  </button>

                  {/* File Import Button */}
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white rounded-lg text-xs font-bold shadow-xs transition-all flex items-center gap-1.5 cursor-pointer"
                    title="Import subjects from Excel (.xlsx) or CSV file"
                  >
                    <FileSpreadsheet className="h-3.5 w-3.5" />
                    <span>Import Excel / CSV</span>
                  </button>
                </div>
              </div>

              {/* Status Banner */}
              {pasteStatus && (
                <div
                  className={`p-2.5 px-3 rounded-lg text-xs font-bold flex items-center justify-between gap-2 ${
                    pasteStatus.type === "success"
                      ? "bg-emerald-50 border border-emerald-200 text-emerald-800"
                      : "bg-rose-50 border border-rose-200 text-rose-800"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    {pasteStatus.type === "success" ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                    ) : (
                      <AlertCircle className="h-4 w-4 text-rose-600 shrink-0" />
                    )}
                    <span>{pasteStatus.message}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setPasteStatus(null)}
                    className="text-slate-400 hover:text-slate-600 cursor-pointer p-0.5"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
            </div>

            {/* Dynamic Rows */}
            <div className="space-y-2">
              <div className="flex items-center justify-between px-0.5">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-extrabold text-gray-700 uppercase tracking-wider">
                    Subject Rows
                  </span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-indigo-50 text-indigo-700 border border-indigo-200">
                    {validCount} valid {validCount === 1 ? "subject" : "subjects"}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {dynamicSubjects.length > 0 && (
                    <button
                      type="button"
                      onClick={handleClearAllRows}
                      className="text-[11px] font-bold text-slate-400 hover:text-rose-600 transition-colors cursor-pointer mr-1"
                    >
                      Clear All
                    </button>
                  )}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleAddRow}
                    className="text-xs font-bold flex items-center gap-1 cursor-pointer"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Add Row
                  </Button>
                </div>
              </div>

              {dynamicSubjects.length === 0 ? (
                <div className="p-6 text-center bg-gray-50 border border-dashed border-gray-200 rounded-xl space-y-3">
                  <p className="text-xs font-bold text-gray-500">No subjects added.</p>
                  <div className="flex items-center justify-center gap-2 flex-wrap">
                    <button
                      type="button"
                      onClick={handleDownloadTemplate}
                      className="px-3.5 py-1.5 bg-white border border-indigo-200 text-indigo-700 rounded-lg text-xs font-bold shadow-xs transition-all flex items-center gap-1.5 cursor-pointer hover:bg-slate-50"
                    >
                      <Download className="h-3.5 w-3.5" />
                      Download Template
                    </button>
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold shadow-xs transition-all flex items-center gap-1.5 cursor-pointer"
                    >
                      <FileSpreadsheet className="h-3.5 w-3.5" />
                      Import Excel / CSV
                    </button>
                    <button
                      type="button"
                      onClick={handleAddRow}
                      className="px-3.5 py-1.5 bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 rounded-lg text-xs font-bold transition-all flex items-center gap-1 cursor-pointer"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Add Row
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                  {dynamicSubjects.map((row, idx) => (
                    <div
                      key={row.id}
                      className={`flex items-center gap-2 border p-2 rounded-xl transition-all ${
                        row.name.trim()
                          ? "bg-gray-50 border-gray-200"
                          : "bg-amber-50/40 border-amber-200/80"
                      }`}
                    >
                      <span className="text-[10px] font-mono text-gray-400 w-6 text-center">{idx + 1}</span>
                      <Input
                        list={`subject-list-${row.id}`}
                        type="text"
                        placeholder="Subject Name (e.g. Data Structures)"
                        value={row.name}
                        onChange={e => handleUpdateRow(row.id, "name", e.target.value)}
                        className="flex-1 min-w-[140px] bg-white border border-gray-200 rounded-lg px-3 py-1.5 text-xs font-bold focus:border-indigo-500"
                      />
                      <datalist id={`subject-list-${row.id}`}>
                        {availableSubjectNames.map(name => (
                          <option key={name} value={name} />
                        ))}
                      </datalist>
                      <Select
                        value={row.type}
                        onChange={e => handleUpdateRow(row.id, "type", e.target.value)}
                        className="w-28 bg-white border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs font-bold"
                      >
                        <option value="SKILL">SKILL</option>
                        <option value="ACADEMIC">THEORY</option>
                        <option value="LAB">LAB</option>
                        <option value="ELECTIVE">ELECTIVE</option>
                      </Select>
                      <Select
                        value={row.mentor_group ?? ""}
                        onChange={e => handleUpdateRow(row.id, "mentor_group", e.target.value)}
                        className="w-36 bg-white border border-gray-200 rounded-lg px-2 py-1.5 text-xs font-bold text-gray-700"
                        title="Mentor Group"
                      >
                        <option value="">{form.mentor_group ? `Default (${form.mentor_group})` : "No Group"}</option>
                        {row.mentor_group && !subjectGroups.some(sg => sg.name === row.mentor_group) && (
                          <option value={row.mentor_group}>{row.mentor_group}</option>
                        )}
                        {subjectGroups.map(sg => (
                          <option key={sg.id} value={sg.name}>
                            {sg.name}
                          </option>
                        ))}
                      </Select>
                      <div className="flex items-center gap-1">
                        <Input
                          type="number"
                          min={1}
                          max={40}
                          value={row.weekly_hours}
                          onChange={e => handleUpdateRow(row.id, "weekly_hours", Number(e.target.value) || 4)}
                          className="w-14 bg-white border border-gray-200 rounded-lg px-2 py-1.5 text-xs font-bold text-center"
                        />
                        <span className="text-[10px] text-gray-400 font-bold">hrs</span>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => handleRemoveRow(row.id)}
                        className="text-gray-400 hover:text-rose-600 cursor-pointer"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* SINGLE SUBJECT MODE OR EDIT MODE */}
        {(editingSubject || modalTab === "single") && (
          <div className="space-y-3.5 overflow-y-auto pr-1">
            <div className="space-y-1">
              <label className="text-[10px] text-gray-400 uppercase tracking-wider block">Subject Name *</label>
              <Input
                list="single-subject-list"
                aria-label="Subject Name"
                type="text"
                required
                placeholder="Subject Name (or select)"
                value={form.name}
                onChange={e => onFormChange({ ...form, name: e.target.value })}
                className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3.5 py-2.5 font-bold focus:outline-none focus:ring-1 focus:ring-indigo-600"
              />
              <datalist id="single-subject-list">
                {availableSubjectNames.map(name => (
                  <option key={name} value={name} />
                ))}
              </datalist>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div className="space-y-1">
                <label className="text-[10px] text-gray-400 uppercase tracking-wider block">Course / Department *</label>
                <Select
                  aria-label="Course / Department"
                  required
                  disabled={lockDeptAndYear}
                  value={form.department}
                  onChange={e => onFormChange({ ...form, department: e.target.value })}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 font-bold focus:outline-none focus:ring-1 focus:ring-indigo-600 cursor-pointer disabled:opacity-60"
                >
                  <option value="">— Select Course —</option>
                  {courseOptions.map(name => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </Select>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] text-gray-400 uppercase tracking-wider block">Target Campus *</label>
                <Select
                  aria-label="Target Campus"
                  required
                  value={form.college_id}
                  onChange={e => onFormChange({ ...form, college_id: e.target.value })}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 font-bold focus:outline-none focus:ring-1 focus:ring-indigo-600 cursor-pointer"
                >
                  <option value="">— Select Campus —</option>
                  {colleges.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
              <div className="space-y-1">
                <label className="text-[10px] text-gray-400 uppercase tracking-wider block">Academic Year *</label>
                <Select
                  aria-label="Academic Year"
                  required
                  disabled={lockDeptAndYear}
                  value={form.year}
                  onChange={e => {
                    const newYear = e.target.value;
                    let newSem = "Semester 1";
                    if (newYear === "Year 2") newSem = "Semester 3";
                    else if (newYear === "Year 3") newSem = "Semester 5";
                    else if (newYear === "Year 4") newSem = "Semester 7";
                    onFormChange({ ...form, year: newYear, semester: newSem });
                  }}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 font-bold focus:outline-none focus:ring-1 focus:ring-indigo-600 cursor-pointer disabled:opacity-60"
                >
                  <option value="Year 1">Year 1</option>
                  <option value="Year 2">Year 2</option>
                  <option value="Year 3">Year 3</option>
                  <option value="Year 4">Year 4</option>
                </Select>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] text-gray-400 uppercase tracking-wider block">Semester *</label>
                <Select
                  aria-label="Semester"
                  required
                  value={form.semester}
                  onChange={e => onFormChange({ ...form, semester: e.target.value })}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 font-bold focus:outline-none focus:ring-1 focus:ring-indigo-600 cursor-pointer"
                >
                  {form.year === "Year 1" && (
                    <>
                      <option value="Semester 1">Semester 1</option>
                      <option value="Semester 2">Semester 2</option>
                    </>
                  )}
                  {form.year === "Year 2" && (
                    <>
                      <option value="Semester 3">Semester 3</option>
                      <option value="Semester 4">Semester 4</option>
                    </>
                  )}
                  {form.year === "Year 3" && (
                    <>
                      <option value="Semester 5">Semester 5</option>
                      <option value="Semester 6">Semester 6</option>
                    </>
                  )}
                  {form.year === "Year 4" && (
                    <>
                      <option value="Semester 7">Semester 7</option>
                      <option value="Semester 8">Semester 8</option>
                    </>
                  )}
                </Select>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] text-gray-400 uppercase tracking-wider block">Subject Type *</label>
                <Select
                  aria-label="Subject Type"
                  value={form.type}
                  onChange={e => onFormChange({ ...form, type: e.target.value })}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 font-bold focus:outline-none focus:ring-1 focus:ring-indigo-600 cursor-pointer"
                >
                  <option value="SKILL">SKILL</option>
                  <option value="ACADEMIC">THEORY / ACADEMIC</option>
                  <option value="LAB">LAB</option>
                  <option value="ELECTIVE">ELECTIVE</option>
                </Select>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] text-gray-400 uppercase tracking-wider block">Weekly Hours *</label>
                <div className="relative">
                  <Clock className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
                  <Input
                    aria-label="Weekly Hours"
                    type="number"
                    min={1}
                    max={40}
                    required
                    value={form.weekly_hours}
                    onChange={e => onFormChange({ ...form, weekly_hours: Number(e.target.value) || 4 })}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl pl-8 pr-3 py-2.5 font-bold focus:outline-none focus:ring-1 focus:ring-indigo-600"
                  />
                </div>
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] text-gray-400 uppercase tracking-wider block">Subject Group</label>
              <Select
                aria-label="Subject Group"
                value={form.mentor_group}
                onChange={e => onFormChange({ ...form, mentor_group: e.target.value })}
                className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 font-bold focus:outline-none focus:ring-1 focus:ring-indigo-600 cursor-pointer text-gray-800"
              >
                <option value="">— Select Subject Group —</option>
                {subjectGroups.map(sg => (
                  <option key={sg.id} value={sg.name}>
                    {sg.name}
                  </option>
                ))}
              </Select>
            </div>
          </div>
        )}

        <div className="flex justify-end gap-2 pt-4 border-t border-gray-100 shrink-0">
          <Button
            variant="ghost"
            type="button"
            onClick={() => onOpenChange(false)}
            className="h-auto px-4 py-2 hover:bg-gray-100 text-gray-500 rounded-xl transition-all font-bold cursor-pointer"
          >
            Cancel
          </Button>
          <LoadingButton
            type="submit"
            isLoading={isSubmitting}
            className="btn-gradient shadow-sm text-white px-5 py-2 rounded-xl text-xs font-bold cursor-pointer transition-all"
          >
            {editingSubject ? "Save Subject Changes" : "Create Subject(s)"}
          </LoadingButton>
        </div>
      </form>
    </Dialog>
  );
};

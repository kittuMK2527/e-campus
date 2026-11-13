"use client";

import React, { useState, useEffect, useMemo } from "react";
import { X, Layers, AlertCircle, Loader2, ShieldAlert } from "lucide-react";
import { useApp, Department } from "@/context/AppContext";
import { Dialog } from "@/components/ui/dialog";

export interface CourseModalProps {
  isOpen: boolean;
  onClose: () => void;
  editingCourse?: Department | null;
  defaultCollegeId?: string;
  allowCollegeSelect?: boolean;
  onSaved?: (savedCourse: Department) => void;
  onToast?: (message: string, type?: "success" | "error" | "info" | "warning") => void;
}

const generateCleanCode = (name: string): string => {
  const clean = name.trim();
  if (!clean) return "";
  const words = clean.replace(/with|and|for/gi, "").split(/\s+/).filter(Boolean);
  const code = words.map(w => {
    // Retain letters and numbers
    const cleanWord = w.replace(/[^a-zA-Z0-9]/g, "");
    if (!cleanWord) return "";
    // If word is entirely numeric (e.g. "101", "1", "2"), keep the full number
    if (/^\d+$/.test(cleanWord)) return cleanWord;
    const lower = cleanWord.toLowerCase();
    if (lower === "bsc") return "BSC";
    if (lower === "bba") return "BBA";
    if (lower === "bcom") return "BCOM";
    if (lower === "bca") return "BCA";
    if (lower === "msc") return "MSC";
    if (lower === "mca") return "MCA";
    if (lower === "mba") return "MBA";
    if (lower === "mcom") return "MCOM";
    // If word has letters followed by numbers (e.g. "CS1", "MATH2"), preserve the number
    const match = cleanWord.match(/^([a-zA-Z]+)(\d+)$/);
    if (match) {
      return match[1][0].toUpperCase() + match[2];
    }
    return cleanWord[0].toUpperCase();
  }).filter(Boolean).join("");
  return code || clean.replace(/[^a-zA-Z0-9]/g, "").slice(0, 6).toUpperCase();
};

export const CourseModal: React.FC<CourseModalProps> = ({
  isOpen,
  onClose,
  editingCourse,
  defaultCollegeId,
  allowCollegeSelect = false,
  onSaved,
  onToast
}) => {
  const { colleges, departmentsList, createCourse, updateCourse } = useApp();

  const currentYear = new Date().getFullYear();
  const targetCollegeId = defaultCollegeId || editingCourse?.college_id || colleges[0]?.id || "";

  const [form, setForm] = useState<{
    id: string;
    name: string;
    college_id: string;
    code: string;
    description: string;
    status: "Active" | "Inactive";
    years: number;
    start_date: string;
    end_date: string;
    start_year: string;
    end_year: string;
    default_room: string;
    default_shift: string;
  }>({
    id: "",
    name: "",
    college_id: targetCollegeId,
    code: "",
    description: "",
    status: "Active",
    years: 3,
    start_date: `${currentYear}-06-01`,
    end_date: `${currentYear + 3}-05-31`,
    start_year: currentYear.toString(),
    end_year: (currentYear + 3).toString(),
    default_room: "",
    default_shift: "general"
  });

  const [codeTouched, setCodeTouched] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Initialize or reset form on open / editingCourse change
  useEffect(() => {
    if (!isOpen) return;
    setModalError(null);
    if (editingCourse) {
      const yrs = editingCourse.years ? Number(editingCourse.years) : 3;
      setForm({
        id: editingCourse.id,
        name: editingCourse.name || "",
        college_id: editingCourse.college_id || targetCollegeId,
        code: editingCourse.code || "",
        description: editingCourse.description || "",
        status: editingCourse.status === "Inactive" ? "Inactive" : "Active",
        years: yrs,
        start_date: editingCourse.start_date || `${currentYear}-06-01`,
        end_date: editingCourse.end_date || `${currentYear + yrs}-05-31`,
        start_year: editingCourse.start_year || currentYear.toString(),
        end_year: editingCourse.end_year || (currentYear + yrs).toString(),
        default_room: editingCourse.default_room || "",
        default_shift: editingCourse.default_shift || "general"
      });
      setCodeTouched(true);
    } else {
      setForm({
        id: "",
        name: "",
        college_id: targetCollegeId,
        code: "",
        description: "",
        status: "Active",
        years: 3,
        start_date: `${currentYear}-06-01`,
        end_date: `${currentYear + 3}-05-31`,
        start_year: currentYear.toString(),
        end_year: (currentYear + 3).toString(),
        default_room: "",
        default_shift: "general"
      });
      setCodeTouched(false);
    }
  }, [isOpen, editingCourse, targetCollegeId]);

  // Live duplicate checking against database/state for this campus
  const existingInCampus = useMemo(() => {
    return departmentsList.filter(d => 
      (d.college_id === form.college_id || !form.college_id || !d.college_id) &&
      (!editingCourse || d.id !== editingCourse.id)
    );
  }, [departmentsList, form.college_id, editingCourse]);

  const duplicateNameMatch = useMemo(() => {
    const trimmed = form.name.trim().toLowerCase();
    if (!trimmed) return null;
    return existingInCampus.find(d => d.name.trim().toLowerCase() === trimmed);
  }, [form.name, existingInCampus]);

  const duplicateCodeMatch = useMemo(() => {
    const trimmed = form.code.trim().toUpperCase();
    if (!trimmed) return null;
    return existingInCampus.find(d => (d.code || "").trim().toUpperCase() === trimmed);
  }, [form.code, existingInCampus]);

  // Handle Course Name typing
  const handleNameChange = (val: string) => {
    const newName = val;
    setForm(prev => {
      const updated = { ...prev, name: newName };
      if (!codeTouched || !prev.code) {
        updated.code = generateCleanCode(newName);
      }
      return updated;
    });
  };

  // Handle Years change
  const handleYearsChange = (val: number) => {
    const startYr = parseInt(form.start_year, 10) || currentYear;
    const endYr = startYr + val;
    setForm(prev => ({
      ...prev,
      years: val,
      end_year: endYr.toString(),
      end_date: prev.start_date ? `${endYr}-05-31` : prev.end_date
    }));
  };

  // Handle Start Date change
  const handleStartDateChange = (val: string) => {
    if (!val) {
      setForm(prev => ({ ...prev, start_date: val }));
      return;
    }
    const d = new Date(val);
    if (!isNaN(d.getTime())) {
      const startYr = d.getFullYear();
      const endYr = startYr + form.years;
      setForm(prev => ({
        ...prev,
        start_date: val,
        start_year: startYr.toString(),
        end_year: endYr.toString(),
        end_date: `${endYr}-05-31`
      }));
    } else {
      setForm(prev => ({ ...prev, start_date: val }));
    }
  };

  // Room allocation per year
  const [showYearWiseRooms, setShowYearWiseRooms] = useState(false);

  useEffect(() => {
    if (editingCourse?.default_room && editingCourse.default_room.startsWith("{")) {
      try {
        const parsed = JSON.parse(editingCourse.default_room);
        const values = Object.values(parsed).filter(Boolean);
        const unique = new Set(values);
        setShowYearWiseRooms(unique.size > 1);
      } catch (_) {
        setShowYearWiseRooms(false);
      }
    } else {
      setShowYearWiseRooms(false);
    }
  }, [editingCourse, isOpen]);

  const primaryRoom = useMemo(() => {
    if (!form.default_room) return "";
    if (form.default_room.startsWith("{")) {
      try {
        const parsed = JSON.parse(form.default_room);
        return parsed[1] || Object.values(parsed)[0] || "";
      } catch (_) {
        return form.default_room;
      }
    }
    return form.default_room;
  }, [form.default_room]);

  const handleSingleRoomChange = (roomVal: string) => {
    const numYears = Number(form.years || 3);
    const roomMap: Record<number, string> = {};
    for (let y = 1; y <= numYears; y++) {
      roomMap[y] = roomVal;
    }
    setForm(prev => ({
      ...prev,
      default_room: JSON.stringify(roomMap)
    }));
  };

  const handleYearRoomChange = (yearNum: number, roomVal: string) => {
    let currentRooms: Record<number, string> = {};
    try {
      if (form.default_room && form.default_room.startsWith("{")) {
        currentRooms = JSON.parse(form.default_room);
      } else if (form.default_room && yearNum === 1) {
        currentRooms = { 1: form.default_room };
      }
    } catch (_) {}
    currentRooms[yearNum] = roomVal;
    setForm(prev => ({
      ...prev,
      default_room: JSON.stringify(currentRooms)
    }));
  };

  // Campus Room suggestions
  const campusRoomSuggestions = useMemo(() => {
    const campus = colleges.find(c => c.id === form.college_id);
    const rooms = campus && campus.rooms ? campus.rooms.split(",").map(r => r.trim()).filter(Boolean) : [];
    const set = new Set<string>(rooms);
    departmentsList
      .filter(d => d.college_id === form.college_id && d.id !== form.id)
      .forEach(d => {
        if (d.default_room) {
          if (d.default_room.startsWith("{")) {
            try {
              const parsed = JSON.parse(d.default_room);
              Object.values(parsed).forEach((r: any) => {
                if (r && typeof r === "string" && r.trim()) set.add(r.trim());
              });
            } catch (_) {}
          } else {
            set.add(d.default_room.trim());
          }
        }
      });
    return Array.from(set);
  }, [colleges, form.college_id, departmentsList, form.id]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setModalError(null);

    const cleanName = form.name.trim();
    if (!cleanName) {
      setModalError("Course Name is required.");
      return;
    }

    if (duplicateNameMatch) {
      setModalError(`A course named "${duplicateNameMatch.name}" already exists in this campus. Duplicate courses are not allowed.`);
      return;
    }

    if (duplicateCodeMatch) {
      setModalError(`Course code "${form.code.trim().toUpperCase()}" is already used by "${duplicateCodeMatch.name}" in this campus.`);
      return;
    }

    setIsSubmitting(true);
    try {
      const finalCode = form.code.trim().toUpperCase() || generateCleanCode(cleanName);
      const isShiftSplit = form.default_shift === "both" || form.default_shift === "all";

      const payload = {
        ...form,
        name: cleanName,
        code: finalCode,
        college_id: form.college_id || targetCollegeId,
        years: Number(form.years) || 3,
        description: form.description?.trim() || "",
        default_shift: form.default_shift || "general",
        shift_based: isShiftSplit ? 1 : 0
      };

      let res;
      if (editingCourse && form.id) {
        res = await updateCourse(payload as Department);
      } else {
        res = await createCourse(payload as Omit<Department, "id">);
      }

      if (res.success) {
        if (onToast) {
          onToast(editingCourse ? "Course updated successfully." : "Course created successfully.", "success");
        }
        if (onSaved && (res as any).course) {
          onSaved((res as any).course);
        }
        onClose();
      } else {
        setModalError(res.message || "Failed to save course.");
      }
    } catch (err: any) {
      setModalError(err.message || "An unexpected error occurred while saving the course.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  const isFormInvalid = !form.name.trim() || !!duplicateNameMatch || !!duplicateCodeMatch || isSubmitting;

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      ariaLabel={editingCourse ? "Edit course and batch details" : "Add course or department"}
      overlayClassName="bg-slate-950/60 backdrop-blur-sm p-4 sm:p-6 overflow-y-auto animate-fadeIn"
      panelClassName="max-w-2xl max-h-[85vh] p-0 space-y-0 overflow-hidden flex flex-col rounded-2xl"
    >
        
        {/* Header */}
        <div className="flex justify-between items-center px-6 py-4 border-b border-slate-100 bg-slate-50/80 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600">
              <Layers className="h-4 w-4 text-indigo-600" />
            </div>
            <div>
              <h3 className="font-extrabold text-slate-900 text-sm">
                {editingCourse ? "Edit Course & Batch Details" : "Add Course / Department"}
              </h3>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close course dialog"
            className="p-1.5 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer text-slate-500 hover:text-slate-800"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-4 text-xs font-semibold">
          {modalError && (
            <div role="alert" className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 font-bold flex items-center gap-2 animate-fadeIn">
              <ShieldAlert className="h-4 w-4 shrink-0 text-rose-600" />
              <span>{modalError}</span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            
            {/* Campus Selector (if allowed) */}
            {allowCollegeSelect && (
              <div className="space-y-1 sm:col-span-2">
                <label className="text-[10px] text-slate-500 uppercase tracking-wider block font-bold">
                  Assigned Campus
                </label>
                <select
                  required
                  aria-label="Assigned Campus"
                  value={form.college_id}
                  onChange={(e) => setForm(prev => ({ ...prev, college_id: e.target.value }))}
                  className="w-full bg-sunken border border-slate-200 inset-shadow-well focus:bg-white dark:focus:bg-[#131317] rounded-xl px-3.5 py-2 font-bold focus:outline-none focus:ring-1 focus:ring-indigo-600 text-slate-800 cursor-pointer"
                >
                  <option value="">— Select Campus —</option>
                  {colleges.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Course Name Input (Typed) */}
            <div className="space-y-1 sm:col-span-2">
              <label className="text-[10px] text-slate-500 uppercase tracking-wider block font-bold">
                Course Name <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                aria-label="Course Name"
                aria-invalid={Boolean(duplicateNameMatch)}
                placeholder="e.g. B.Sc Mathematics, B.COM, BCA, BBA"
                value={form.name}
                onChange={(e) => handleNameChange(e.target.value)}
                className={`w-full bg-slate-50 border rounded-xl px-3.5 py-2 font-bold focus:outline-none focus:ring-1 text-slate-800 transition-all ${
                  duplicateNameMatch 
                    ? "border-rose-400 bg-rose-50/40 focus:ring-rose-500 text-rose-900" 
                    : "border-slate-200 focus:ring-indigo-600"
                }`}
              />
              
              {/* Duplicate Name Inline Error */}
              {duplicateNameMatch && (
                <div role="alert" className="flex items-center gap-1.5 p-2.5 bg-rose-50 border border-rose-200 text-rose-700 text-[11px] font-bold rounded-xl mt-1.5 animate-fadeIn">
                  <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
                  <span>
                    A course named <strong>"{duplicateNameMatch.name}"</strong> already exists in this campus. Duplicate courses are not allowed.
                  </span>
                </div>
              )}
            </div>

            {/* Course Code Input */}
            <div className="space-y-1">
              <label className="text-[10px] text-slate-500 uppercase tracking-wider block font-bold">
                Course Code <span className="text-slate-400 font-normal">(Letters &amp; Numbers e.g. BSCM, CS101, BCOM1)</span>
              </label>
              <input
                type="text"
                aria-label="Course Code (Letters & Numbers e.g. BSCM, CS101, BCOM1)"
                aria-invalid={Boolean(duplicateCodeMatch)}
                placeholder="e.g. BSCM, CS101, BCOM1, BCA"
                value={form.code}
                onChange={(e) => {
                  setCodeTouched(true);
                  setForm(prev => ({ ...prev, code: e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, "") }));
                }}
                className={`w-full bg-slate-50 border rounded-xl px-3.5 py-2 font-bold uppercase focus:outline-none focus:ring-1 text-slate-800 transition-all ${
                  duplicateCodeMatch
                    ? "border-rose-400 bg-rose-50/40 focus:ring-rose-500 text-rose-900"
                    : "border-slate-200 focus:ring-indigo-600"
                }`}
              />
              {duplicateCodeMatch && (
                <p role="alert" className="text-[10px] text-rose-600 font-bold mt-1">
                  Code "{form.code}" is already used by "{duplicateCodeMatch.name}".
                </p>
              )}
            </div>

            {/* Course Duration */}
            <div className="space-y-1">
              <label className="text-[10px] text-slate-500 uppercase tracking-wider block font-bold">
                Course Duration
              </label>
              <select
                aria-label="Course Duration"
                value={form.years}
                onChange={(e) => handleYearsChange(Number(e.target.value))}
                className="w-full bg-sunken border border-slate-200 inset-shadow-well focus:bg-white dark:focus:bg-[#131317] rounded-xl px-3 py-2 font-bold focus:outline-none focus:ring-1 focus:ring-indigo-600 cursor-pointer text-slate-800"
              >
                <option value={1}>1 Year (2 Semesters)</option>
                <option value={2}>2 Years (4 Semesters - Masters / PG)</option>
                <option value={3}>3 Years (6 Semesters - Standard Degree)</option>
                <option value={4}>4 Years (8 Semesters - Engineering / Honors)</option>
                <option value={5}>5 Years (10 Semesters - Integrated)</option>
              </select>
            </div>

            {/* Status */}
            <div className="space-y-1">
              <label className="text-[10px] text-slate-500 uppercase tracking-wider block font-bold">
                Status
              </label>
              <select
                aria-label="Status"
                value={form.status}
                onChange={(e) => setForm(prev => ({ ...prev, status: e.target.value as any }))}
                className="w-full bg-sunken border border-slate-200 inset-shadow-well focus:bg-white dark:focus:bg-[#131317] rounded-xl px-3 py-2 font-bold focus:outline-none focus:ring-1 focus:ring-indigo-600 cursor-pointer text-slate-800"
              >
                <option value="Active">Active</option>
                <option value="Inactive">Inactive</option>
              </select>
            </div>

            {/* Shift Offering */}
            <div className="space-y-1">
              <label className="text-[10px] text-slate-500 uppercase tracking-wider block font-bold">
                Shift Offering
              </label>
              <select
                aria-label="Shift Offering"
                value={form.default_shift}
                onChange={(e) => setForm(prev => ({ ...prev, default_shift: e.target.value }))}
                className="w-full bg-sunken border border-slate-200 inset-shadow-well focus:bg-white dark:focus:bg-[#131317] rounded-xl px-3 py-2 font-bold focus:outline-none focus:ring-1 focus:ring-indigo-600 cursor-pointer text-slate-800"
              >
                <option value="general">General Shift</option>
                <option value="shift_1">Shift 1 (Day)</option>
                <option value="shift_2">Shift 2 (Evening)</option>
                <option value="both">Both Shifts (Shift 1 &amp; 2)</option>
                <option value="all">Both Shifts + General</option>
              </select>
            </div>

            {/* Batch Dates */}
            <div className="space-y-1">
              <label className="text-[10px] text-slate-500 uppercase tracking-wider block font-bold">
                Batch Start Date
              </label>
              <input
                type="date"
                aria-label="Batch Start Date"
                value={form.start_date}
                onChange={(e) => handleStartDateChange(e.target.value)}
                className="w-full bg-sunken border border-slate-200 inset-shadow-well focus:bg-white dark:focus:bg-[#131317] rounded-xl px-3.5 py-1.5 font-bold focus:outline-none focus:ring-1 focus:ring-indigo-600 text-slate-800 text-xs"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[10px] text-slate-500 uppercase tracking-wider block font-bold">
                Batch End Date
              </label>
              <input
                type="date"
                aria-label="Batch End Date"
                value={form.end_date}
                onChange={(e) => setForm(prev => ({ ...prev, end_date: e.target.value }))}
                className="w-full bg-sunken border border-slate-200 inset-shadow-well focus:bg-white dark:focus:bg-[#131317] rounded-xl px-3.5 py-1.5 font-bold focus:outline-none focus:ring-1 focus:ring-indigo-600 text-slate-800 text-xs"
              />
            </div>

            {/* Batch Years */}
            <div className="space-y-1">
              <label className="text-[10px] text-slate-500 uppercase tracking-wider block font-bold">
                Batch Start Year
              </label>
              <input
                type="text"
                aria-label="Batch Start Year"
                placeholder="e.g. 2026"
                value={form.start_year}
                onChange={(e) => setForm(prev => ({ ...prev, start_year: e.target.value }))}
                className="w-full bg-sunken border border-slate-200 inset-shadow-well focus:bg-white dark:focus:bg-[#131317] rounded-xl px-3.5 py-1.5 font-bold focus:outline-none focus:ring-1 focus:ring-indigo-600 text-slate-800 text-xs"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[10px] text-slate-500 uppercase tracking-wider block font-bold">
                Batch End Year
              </label>
              <input
                type="text"
                aria-label="Batch End Year"
                placeholder="e.g. 2029"
                value={form.end_year}
                onChange={(e) => setForm(prev => ({ ...prev, end_year: e.target.value }))}
                className="w-full bg-sunken border border-slate-200 inset-shadow-well focus:bg-white dark:focus:bg-[#131317] rounded-xl px-3.5 py-1.5 font-bold focus:outline-none focus:ring-1 focus:ring-indigo-600 text-slate-800 text-xs"
              />
            </div>

            {/* Classroom / Room Allocation */}
            <div className="space-y-2 sm:col-span-2 border-t border-slate-100 pt-3 mt-1">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-[10px] font-black text-indigo-600 uppercase tracking-wider">
                    Classroom Allocation
                  </h4>
                  <p className="text-[10px] text-slate-400 font-medium">
                    {showYearWiseRooms
                      ? "Custom room specified per academic year"
                      : "Designated classroom assigned across academic years for this course"}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowYearWiseRooms(prev => !prev)}
                  className="text-[10px] font-bold text-indigo-600 hover:text-indigo-800 underline cursor-pointer bg-transparent border-0 p-0"
                >
                  {showYearWiseRooms ? "← Use Single Room" : "+ Customize per Year"}
                </button>
              </div>

              {!showYearWiseRooms ? (
                <div>
                  <input
                    type="text"
                    list={`rooms-suggest-modal-${form.college_id || "none"}`}
                    placeholder="e.g. Room 101, Lab 3, Hall A"
                    value={primaryRoom}
                    onChange={(e) => handleSingleRoomChange(e.target.value)}
                    className="w-full bg-sunken border border-slate-200 inset-shadow-well focus:bg-white dark:focus:bg-[#131317] rounded-xl px-3.5 py-1.5 font-bold focus:outline-none focus:ring-1 focus:ring-indigo-600 text-slate-800 text-xs"
                  />
                  {campusRoomSuggestions.length > 0 && (
                    <datalist id={`rooms-suggest-modal-${form.college_id || "none"}`}>
                      {campusRoomSuggestions.map(r => (
                        <option key={r} value={r} />
                      ))}
                    </datalist>
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  {Array.from({ length: Number(form.years || 3) }, (_, idx) => {
                    const yearNum = idx + 1;
                    let currentRoom = "";
                    try {
                      if (form.default_room && form.default_room.startsWith("{")) {
                        const parsed = JSON.parse(form.default_room);
                        currentRoom = parsed[yearNum] || "";
                      } else if (form.default_room && yearNum === 1) {
                        currentRoom = form.default_room;
                      }
                    } catch (_) {}

                    return (
                      <div key={yearNum} className="space-y-1">
                        <label className="text-[9.5px] text-slate-400 font-bold block uppercase tracking-wider">
                          Year {yearNum} Room
                        </label>
                        <input
                          type="text"
                          list={`rooms-suggest-modal-${form.college_id || "none"}`}
                          placeholder={`e.g. Room for Year ${yearNum}`}
                          value={currentRoom}
                          onChange={(e) => handleYearRoomChange(yearNum, e.target.value)}
                          className="w-full bg-sunken border border-slate-200 inset-shadow-well focus:bg-white dark:focus:bg-[#131317] rounded-xl px-3.5 py-1.5 font-bold focus:outline-none focus:ring-1 focus:ring-indigo-600 text-slate-800 text-xs"
                        />
                      </div>
                    );
                  })}

                  {campusRoomSuggestions.length > 0 && (
                    <datalist id={`rooms-suggest-modal-${form.college_id || "none"}`}>
                      {campusRoomSuggestions.map(r => (
                        <option key={r} value={r} />
                      ))}
                    </datalist>
                  )}
                </div>
              )}
            </div>

            {/* Description */}
            <div className="space-y-1 sm:col-span-2">
              <label className="text-[10px] text-slate-500 uppercase tracking-wider block font-bold">
                Description <span className="text-slate-400 font-normal">(Optional notes)</span>
              </label>
              <textarea
                aria-label="Description (Optional notes)"
                placeholder="Enter course summary or notes..."
                value={form.description}
                onChange={(e) => setForm(prev => ({ ...prev, description: e.target.value }))}
                rows={2}
                className="w-full bg-sunken border border-slate-200 inset-shadow-well focus:bg-white dark:focus:bg-[#131317] rounded-xl px-3.5 py-2 font-bold focus:outline-none focus:ring-1 focus:ring-indigo-600 text-slate-800 resize-none"
              />
            </div>

          </div>

          {/* Sticky Footer */}
          <div className="flex justify-end gap-2.5 pt-4 mt-4 border-t border-slate-100 shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 hover:bg-slate-100 text-slate-600 rounded-xl transition-all font-bold cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isFormInvalid}
              className={`px-5 py-2 text-white rounded-xl shadow-xs transition-all font-bold flex items-center justify-center gap-2 ${
                isFormInvalid
                  ? "bg-slate-300 text-slate-500 cursor-not-allowed shadow-none"
                  : "bg-indigo-600 hover:bg-indigo-700 active:scale-95 cursor-pointer"
              }`}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin text-white shrink-0" />
                  <span>{editingCourse ? "Saving Changes..." : "Creating Course..."}</span>
                </>
              ) : (
                <span>{editingCourse ? "Save Changes" : "Create Course"}</span>
              )}
            </button>
          </div>
        </form>
    </Dialog>
  );
};

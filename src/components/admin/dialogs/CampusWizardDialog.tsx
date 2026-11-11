"use client";

import React, { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { getLocalDateStr } from "@/lib/localDate";
import {
  Building2,
  Users,
  Clock,
  ShieldAlert,
  ChevronRight,
  Plus,
  Trash2,
  X,
  GripVertical,
  CalendarDays,
  BookOpen,
  Sparkles,
  RefreshCw,
  Check,
  Copy,
  Edit
} from "lucide-react";
import { useApp, College, SHIFT_TIME_SLOTS } from "@/context/AppContext";
import { useToast } from "@/context/ToastContext";
import { getCurrentAcademicYear, getAcademicYearOptions } from "@/lib/academicYear";
import { DEFAULT_SHIFT_CONFIGS } from "@/lib/shiftDefaults";
import { ALL_SEMESTERS } from "@/lib/semesters";
import { apiFetch } from "@/lib/apiFetch";
import {
  calculateShiftSchedule,
  generateCampusCode,
  generateCodeFromName,
  ShiftParams,
  ShiftBreak
} from "@/lib/utils";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { LoadingButton } from "@/components/ui/LoadingButton";

export interface CampusWizardDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  collegeToEdit: College | null;
  kamList: any[];
  camList: any[];
  onSaved: () => void;
  onOpenCampusConsole?: (collegeId: string) => void;
}

export const CampusWizardDialog: React.FC<CampusWizardDialogProps> = ({
  open,
  onOpenChange,
  collegeToEdit,
  kamList,
  camList,
  onSaved,
  onOpenCampusConsole
}) => {
  const router = useRouter();
  const {
    currentUser,
    currentRole,
    createCollege,
    updateCollege,
    createCourse,
    updateCAM,
    coursesList,
    colleges,
    refreshData
  } = useApp();
  const { toast, confirm: showConfirm } = useToast();

  // Wizard and Form State
  const [campusSuccessCreatedId, setCampusSuccessCreatedId] = useState<string | null>(null);
  const [campusForm, setCampusForm] = useState<{
    id: string;
    name: string;
    address: string;
    kam_id: string;
    has_shifts: number;
    shift_configs?: string;
    rooms: string;
    code: string;
    academic_year: string;
    manager: string;
    working_days?: number;
  }>({
    id: "",
    name: "",
    address: "",
    kam_id: "",
    has_shifts: 1,
    shift_configs: "",
    rooms: "",
    code: "",
    academic_year: getCurrentAcademicYear(),
    manager: "",
    working_days: 5
  });

  const [editingCampus, setEditingCampus] = useState<boolean>(false);
  const [isCampusCodeCustomized, setIsCampusCodeCustomized] = useState<boolean>(false);
  const [campusFieldErrors, setCampusFieldErrors] = useState<Record<string, boolean>>({});
  const [courseFieldErrors, setCourseFieldErrors] = useState<Record<string, boolean>>({});
  const [campusWizardStep, setCampusWizardStep] = useState<number>(1);
  const [modalError, setModalError] = useState<string | null>(null);
  const [modalBusy, setModalBusy] = useState<boolean>(false);

  // Simplified Course Wizard State (Single Room, no complex section breakdown)
  const [wizardCourses, setWizardCourses] = useState<any[]>([]);
  const [wizardCourseForm, setWizardCourseForm] = useState<{
    name: string;
    years: number;
    room: string;
    default_shift: string;
    start_date: string;
    end_date: string;
    start_year: string;
    end_year: string;
    description: string;
  }>({
    name: "",
    years: 3,
    room: "",
    default_shift: "general",
    start_date: "",
    end_date: "",
    start_year: "",
    end_year: "",
    description: ""
  });

  // Shift & Timing State
  const [draggedBreakId, setDraggedBreakId] = useState<string | null>(null);
  const [showClockPresets, setShowClockPresets] = useState<boolean>(false);
  const [editingPeriodNum, setEditingPeriodNum] = useState<number | null>(null);
  const [draftLastSaved, setDraftLastSaved] = useState<string | null>(null);
  const [draftRole, setDraftRole] = useState<string>("admin");
  const [hasRestoredDraft, setHasRestoredDraft] = useState<boolean>(false);
  const draftLoadedRef = useRef<boolean>(false);

  const [activeConfigShift, setActiveConfigShift] = useState<"shift_1" | "shift_2" | "general">("general");
  const [shiftConfigsParams, setShiftConfigsParams] = useState<Record<"shift_1" | "shift_2" | "general", ShiftParams>>({
    shift_1: { ...DEFAULT_SHIFT_CONFIGS.shift_1 },
    shift_2: { ...DEFAULT_SHIFT_CONFIGS.shift_2 },
    general: { ...DEFAULT_SHIFT_CONFIGS.general }
  });
  const [activeConfigSemester, setActiveConfigSemester] = useState<string>("All Semesters");
  const [semesterConfigsMap, setSemesterConfigsMap] = useState<Record<string, Record<"shift_1" | "shift_2" | "general", ShiftParams>>>({});
  const [newBreakName, setNewBreakName] = useState("");
  const [newBreakDuration, setNewBreakDuration] = useState(15);
  const [newBreakAfterPeriod, setNewBreakAfterPeriod] = useState(2);

  // Initialize or reset modal when open or collegeToEdit changes
  useEffect(() => {
    if (!open) {
      setCampusSuccessCreatedId(null);
      setModalError(null);
      draftLoadedRef.current = false;
      return;
    }

    setModalError(null);
    setActiveConfigShift("general");

    const defaultShift1Breaks = [
      { id: "b1", name: "Tea Break", afterPeriod: 2, duration: 15 },
      { id: "b2", name: "Lunch Break", afterPeriod: 4, duration: 35 }
    ];
    const defaultShift2Breaks = [
      { id: "b1", name: "Tea Break", afterPeriod: 2, duration: 15 },
      { id: "b2", name: "Dinner Break", afterPeriod: 4, duration: 35 }
    ];
    const defaultGenBreaks = [
      { id: "b1", name: "Break", afterPeriod: 2, duration: 15 },
      { id: "b2", name: "Lunch", afterPeriod: 3, duration: 35 }
    ];

    let s1Params: ShiftParams = { ...DEFAULT_SHIFT_CONFIGS.shift_1, breaks: defaultShift1Breaks };
    let s2Params: ShiftParams = { ...DEFAULT_SHIFT_CONFIGS.shift_2, breaks: defaultShift2Breaks };
    let genParams: ShiftParams = { ...DEFAULT_SHIFT_CONFIGS.general, breaks: defaultGenBreaks };

    const initialMap: Record<string, Record<"shift_1" | "shift_2" | "general", ShiftParams>> = {};

    if (collegeToEdit) {
      if (collegeToEdit.shift_configs) {
        try {
          const parsed = JSON.parse(collegeToEdit.shift_configs);
          if (parsed.custom_shift_params) {
            if (parsed.custom_shift_params.shift_1) {
              s1Params = {
                ...parsed.custom_shift_params.shift_1,
                label: parsed.custom_shift_params.shift_1.label || "Shift 1",
                breaks: (parsed.custom_shift_params.shift_1.breaks && parsed.custom_shift_params.shift_1.breaks.length > 0)
                  ? parsed.custom_shift_params.shift_1.breaks
                  : defaultShift1Breaks
              };
            }
            if (parsed.custom_shift_params.shift_2) {
              s2Params = {
                ...parsed.custom_shift_params.shift_2,
                label: parsed.custom_shift_params.shift_2.label || "Shift 2",
                breaks: (parsed.custom_shift_params.shift_2.breaks && parsed.custom_shift_params.shift_2.breaks.length > 0)
                  ? parsed.custom_shift_params.shift_2.breaks
                  : defaultShift2Breaks
              };
            }
            if (parsed.custom_shift_params.general) {
              genParams = {
                ...parsed.custom_shift_params.general,
                label: parsed.custom_shift_params.general.label || "General Shift",
                breaks: (parsed.custom_shift_params.general.breaks && parsed.custom_shift_params.general.breaks.length > 0)
                  ? parsed.custom_shift_params.general.breaks
                  : defaultGenBreaks
              };
            }
          } else {
            if (Array.isArray(parsed.shift_1) && parsed.shift_1.length > 0) {
              const times = (parsed.shift_1[0] || "").split("-").map((t: string) => t.trim());
              if (times[0]) s1Params.startTime = times[0];
              s1Params.periodsCount = parsed.shift_1.length;
            }
            if (Array.isArray(parsed.shift_2) && parsed.shift_2.length > 0) {
              const times = (parsed.shift_2[0] || "").split("-").map((t: string) => t.trim());
              if (times[0]) s2Params.startTime = times[0];
              s2Params.periodsCount = parsed.shift_2.length;
            }
            if (Array.isArray(parsed.general) && parsed.general.length > 0) {
              const times = (parsed.general[0] || "").split("-").map((t: string) => t.trim());
              if (times[0]) genParams.startTime = times[0];
              genParams.periodsCount = parsed.general.length;
            }
          }

          if (parsed.semester_configs) {
            Object.keys(parsed.semester_configs).forEach(sem => {
              const semData = parsed.semester_configs[sem];
              initialMap[sem] = {
                shift_1: semData.custom_shift_params?.shift_1 || { ...DEFAULT_SHIFT_CONFIGS.shift_1, breaks: defaultShift1Breaks },
                shift_2: semData.custom_shift_params?.shift_2 || { ...DEFAULT_SHIFT_CONFIGS.shift_2, breaks: defaultShift2Breaks },
                general: semData.custom_shift_params?.general || { ...DEFAULT_SHIFT_CONFIGS.general, breaks: defaultGenBreaks }
              };
            });
          }
        } catch (_) {}
      }

      setShiftConfigsParams({
        shift_1: s1Params,
        shift_2: s2Params,
        general: genParams
      });

      initialMap["All Semesters"] = {
        shift_1: { ...s1Params },
        shift_2: { ...s2Params },
        general: { ...genParams }
      };

      setCampusForm({
        id: collegeToEdit.id,
        name: collegeToEdit.name,
        address: collegeToEdit.address || "",
        kam_id: collegeToEdit.kam_id,
        has_shifts: collegeToEdit.has_shifts === undefined ? 1 : collegeToEdit.has_shifts,
        shift_configs: collegeToEdit.shift_configs || "",
        rooms: collegeToEdit.rooms || "",
        code: (collegeToEdit as any).code || "",
        academic_year: (collegeToEdit as any).academic_year || getCurrentAcademicYear(),
        manager: (collegeToEdit as any).manager || "",
        working_days: (collegeToEdit as any).working_days === undefined ? 5 : Number((collegeToEdit as any).working_days)
      });
      setEditingCampus(true);
      setIsCampusCodeCustomized(true);
      setCampusWizardStep(1);

      const existing = (coursesList || []).filter(
        d => d.college_id === collegeToEdit.id || (colleges && colleges[0]?.id === collegeToEdit.id && !d.college_id)
      );
      setWizardCourses(
        existing.map(c => {
          let resolvedRoom = c.default_room || "";
          if (resolvedRoom.startsWith("{")) {
            try {
              const parsed = JSON.parse(resolvedRoom);
              resolvedRoom = Object.values(parsed)[0] as string || "";
            } catch (_) {}
          }
          return {
            ...c,
            room: resolvedRoom,
            default_room: resolvedRoom,
            isExisting: true
          };
        })
      );
    } else {
      setEditingCampus(false);
      setCampusSuccessCreatedId(null);

      // Attempt to restore saved draft once from database scoped to current user/role
      if (!draftLoadedRef.current) {
        draftLoadedRef.current = true;
        (async () => {
          try {
            const draftJson = await apiFetch("/api/campus-draft");
            if (draftJson.success && draftJson.draft) {
              const d = draftJson.draft;
              if (d.campusForm) setCampusForm(d.campusForm);
              if (d.campusWizardStep) setCampusWizardStep(d.campusWizardStep);
              if (d.wizardCourses) setWizardCourses(d.wizardCourses);
              if (d.shiftConfigsParams) setShiftConfigsParams(d.shiftConfigsParams);
              if (d.semesterConfigsMap) setSemesterConfigsMap(d.semesterConfigsMap);
              setDraftLastSaved(draftJson.savedAt || "Recently");
              setDraftRole(draftJson.role || currentRole || "admin");
              setHasRestoredDraft(true);
              setIsCampusCodeCustomized(Boolean(d.campusForm?.code));
              return;
            }
          } catch (_) {}

          // Fallback if no draft found
          setShiftConfigsParams({
            shift_1: { ...DEFAULT_SHIFT_CONFIGS.shift_1, breaks: defaultShift1Breaks },
            shift_2: { ...DEFAULT_SHIFT_CONFIGS.shift_2, breaks: defaultShift2Breaks },
            general: { ...DEFAULT_SHIFT_CONFIGS.general, breaks: defaultGenBreaks }
          });

          initialMap["All Semesters"] = {
            shift_1: { ...DEFAULT_SHIFT_CONFIGS.shift_1, breaks: defaultShift1Breaks },
            shift_2: { ...DEFAULT_SHIFT_CONFIGS.shift_2, breaks: defaultShift2Breaks },
            general: { ...DEFAULT_SHIFT_CONFIGS.general, breaks: defaultGenBreaks }
          };

          setCampusForm({
            id: "",
            name: "",
            address: "",
            kam_id: kamList[0]?.id || "",
            has_shifts: 1,
            shift_configs: "",
            rooms: "",
            code: "",
            academic_year: getCurrentAcademicYear(),
            manager: "",
            working_days: 5
          });
          setCampusWizardStep(1);
          setIsCampusCodeCustomized(false);
          setWizardCourses([]);
        })();
      }
    }

    setSemesterConfigsMap(initialMap);
    setActiveConfigSemester("All Semesters");
    setNewBreakName("");
    setNewBreakDuration(15);
    setCampusFieldErrors({});
    setCourseFieldErrors({});
  }, [open, collegeToEdit]);

  // Draft auto-saving to DB (debounced)
  const saveCampusDraftToDb = async () => {
    if (!open || editingCampus || campusSuccessCreatedId) return;
    const timeStr = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    const draftData = {
      campusForm,
      campusWizardStep,
      wizardCourses,
      shiftConfigsParams,
      semesterConfigsMap
    };
    try {
      const res = await apiFetch("/api/campus-draft", {
        method: "POST",
        body: JSON.stringify({
          data: draftData,
          savedAt: timeStr,
          userId: currentUser?.id,
          role: currentRole || "admin"
        })
      });
      if (res.success) {
        setDraftLastSaved(res.savedAt || timeStr);
        setDraftRole(res.role || currentRole || "admin");
        setHasRestoredDraft(true);
      }
    } catch (err) {
      console.error("Failed to save campus draft to database:", err);
    }
  };

  const clearCampusDraftFromDb = async () => {
    try {
      await apiFetch("/api/campus-draft", { method: "DELETE" });
    } catch (_) {}
    setDraftLastSaved(null);
    setHasRestoredDraft(false);
    setIsCampusCodeCustomized(false);
    setCampusWizardStep(1);
    setWizardCourses([]);
    setCampusForm({
      id: "",
      name: "",
      address: "",
      kam_id: kamList[0]?.id || "",
      has_shifts: 1,
      shift_configs: "",
      rooms: "",
      code: "",
      academic_year: getCurrentAcademicYear(),
      manager: "",
      working_days: 5
    });
    toast("Draft cleared successfully.", "info");
  };

  // Debounced auto-save effect
  useEffect(() => {
    if (open && !editingCampus && !campusSuccessCreatedId && campusForm.name.trim()) {
      const timeout = setTimeout(() => {
        saveCampusDraftToDb();
      }, 600);
      return () => clearTimeout(timeout);
    }
  }, [open, editingCampus, campusSuccessCreatedId, campusForm, campusWizardStep, wizardCourses, shiftConfigsParams, semesterConfigsMap]);

  // Duplicate course in list
  const handleDuplicateCourse = (idx: number) => {
    const source = wizardCourses[idx];
    if (!source) return;
    const dupName = `${source.name} (Copy)`;
    const newCourse = {
      ...source,
      id: undefined,
      name: dupName,
      code: generateCodeFromName(dupName),
      isExisting: false
    };
    setWizardCourses(prev => [...prev, newCourse]);
    toast(`Duplicated "${source.name}"`, "info");
  };

  const handleSemesterChange = (newSem: string) => {
    const updatedMap = {
      ...semesterConfigsMap,
      [activeConfigSemester]: {
        shift_1: { ...shiftConfigsParams.shift_1 },
        shift_2: { ...shiftConfigsParams.shift_2 },
        general: { ...shiftConfigsParams.general }
      }
    };

    setSemesterConfigsMap(updatedMap);

    const targetParams = updatedMap[newSem] || updatedMap["All Semesters"] || shiftConfigsParams;
    setShiftConfigsParams({
      shift_1: { ...targetParams.shift_1 },
      shift_2: { ...targetParams.shift_2 },
      general: { ...targetParams.general }
    });

    setActiveConfigSemester(newSem);
    setNewBreakName("");
  };

  // Submit Handler
  const handleCampusSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setModalError(null);
    setModalBusy(true);

    try {
      const finalMap = {
        ...semesterConfigsMap,
        [activeConfigSemester]: {
          shift_1: { ...shiftConfigsParams.shift_1 },
          shift_2: { ...shiftConfigsParams.shift_2 },
          general: { ...shiftConfigsParams.general }
        }
      };

      const allSemsMap = finalMap["All Semesters"] || shiftConfigsParams;

      // Validate breaks
      for (const sem of Object.keys(finalMap)) {
        const semParams = finalMap[sem];
        if (campusForm.has_shifts === 1) {
          if (!semParams.shift_1.breaks || semParams.shift_1.breaks.length === 0) {
            setModalError(`${sem} - Shift 1: At least one break must be configured.`);
            setModalBusy(false);
            return;
          }
          if (!semParams.shift_2.breaks || semParams.shift_2.breaks.length === 0) {
            setModalError(`${sem} - Shift 2: At least one break must be configured.`);
            setModalBusy(false);
            return;
          }
        } else {
          if (!semParams.general.breaks || semParams.general.breaks.length === 0) {
            setModalError(`${sem} - General Shift: At least one break must be configured.`);
            setModalBusy(false);
            return;
          }
        }
      }

      const s1Schedule = calculateShiftSchedule(allSemsMap.shift_1);
      const s2Schedule = calculateShiftSchedule(allSemsMap.shift_2);
      const genSchedule = calculateShiftSchedule(allSemsMap.general);

      if (s1Schedule.error && campusForm.has_shifts === 1) {
        setModalError(`All Semesters - Shift 1: ${s1Schedule.error}`);
        setModalBusy(false);
        return;
      }
      if (s2Schedule.error && campusForm.has_shifts === 1) {
        setModalError(`All Semesters - Shift 2: ${s2Schedule.error}`);
        setModalBusy(false);
        return;
      }
      if (genSchedule.error) {
        setModalError(`All Semesters - General Shift: ${genSchedule.error}`);
        setModalBusy(false);
        return;
      }

      const compiledShift1 = s1Schedule.items.filter(item => item.type === "period").map(item => `${item.startTimeStr} - ${item.endTimeStr}`);
      const compiledShift2 = s2Schedule.items.filter(item => item.type === "period").map(item => `${item.startTimeStr} - ${item.endTimeStr}`);
      const compiledGeneral = genSchedule.items.filter(item => item.type === "period").map(item => `${item.startTimeStr} - ${item.endTimeStr}`);

      const semesterConfigsCompiled: Record<string, any> = {};

      for (const sem of Object.keys(finalMap)) {
        if (sem === "All Semesters") continue;
        const semParams = finalMap[sem];
        const semS1 = calculateShiftSchedule(semParams.shift_1);
        const semS2 = calculateShiftSchedule(semParams.shift_2);
        const semGen = calculateShiftSchedule(semParams.general);

        if (semS1.error && campusForm.has_shifts === 1) {
          setModalError(`${sem} - Shift 1: ${semS1.error}`);
          setModalBusy(false);
          return;
        }
        if (semS2.error && campusForm.has_shifts === 1) {
          setModalError(`${sem} - Shift 2: ${semS2.error}`);
          setModalBusy(false);
          return;
        }
        if (semGen.error) {
          setModalError(`${sem} - General Shift: ${semGen.error}`);
          setModalBusy(false);
          return;
        }

        semesterConfigsCompiled[sem] = {
          shift_1: semS1.items.filter(item => item.type === "period").map(item => `${item.startTimeStr} - ${item.endTimeStr}`),
          shift_2: semS2.items.filter(item => item.type === "period").map(item => `${item.startTimeStr} - ${item.endTimeStr}`),
          general: semGen.items.filter(item => item.type === "period").map(item => `${item.startTimeStr} - ${item.endTimeStr}`),
          custom_shift_params: semParams
        };
      }

      const parsedConfigs = {
        shift_1: compiledShift1,
        shift_2: compiledShift2,
        general: compiledGeneral,
        custom_shift_params: allSemsMap,
        semester_configs: semesterConfigsCompiled
      };

      // Auto-compile rooms list from all wizard courses
      const allRooms = new Set<string>();
      wizardCourses.forEach(c => {
        const r = c.default_room || c.room;
        if (r && typeof r === "string" && r.trim()) {
          allRooms.add(r.trim());
        }
      });
      const autoRoomsList = Array.from(allRooms).join(", ");

      let collegeId = campusForm.id;
      if (!editingCampus) {
        const cleanCode = campusForm.code || generateCampusCode(campusForm.name) || Date.now().toString();
        collegeId = "Clg_" + cleanCode.trim().replace(/[^a-zA-Z0-9]/g, "");
      }

      const updatedForm = {
        ...campusForm,
        id: collegeId,
        rooms: autoRoomsList || campusForm.rooms,
        shift_configs: JSON.stringify(parsedConfigs)
      };

      let res;
      if (editingCampus) {
        res = await updateCollege(updatedForm);
      } else {
        res = await createCollege(updatedForm);
      }

      if (res.success) {
        // The campus row is saved; the CAM assignment and new courses are separate
        // writes. Run them together and collect failures so a partial save is never
        // reported as clean.
        const issues: string[] = [];
        const camAssignment = (async () => {
          if (!updatedForm.manager) return;
          const selectedCamObj = camList.find(cm => cm.id === updatedForm.manager);
          if (!selectedCamObj) return;
          const camRes = await updateCAM({
            id: selectedCamObj.id,
            name: selectedCamObj.name,
            email: selectedCamObj.email,
            college_id: updatedForm.id,
            kam_id: selectedCamObj.kam_id
          });
          if (!camRes.success) issues.push(camRes.message || "Campus Manager assignment failed.");
        })();

        const newCourses = wizardCourses.filter(c => !c.isExisting);
        const courseSaves = newCourses.map(async (course) => {
          const courseRes = await createCourse({
            name: course.name,
            college_id: updatedForm.id,
            code: course.code?.trim().toUpperCase() || generateCodeFromName(course.name),
            description: course.description || "",
            years: Number(course.years) || 3,
            start_date: course.start_date || getLocalDateStr(),
            end_date: course.end_date || new Date(Date.now() + 3 * 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
            start_year: course.start_year || new Date().getFullYear().toString(),
            end_year: course.end_year || (new Date().getFullYear() + (Number(course.years) || 3)).toString(),
            default_room: course.default_room || course.room || null,
            default_shift: course.default_shift || null
          });
          if (!courseRes.success) {
            issues.push(`${course.name}: ${courseRes.message || "failed to save course"}`);
          }
        });
        await Promise.all([camAssignment, ...courseSaves]);

        await clearCampusDraftFromDb();
        await refreshData(true);
        onSaved();

        if (issues.length > 0) {
          toast(`Campus saved, but ${issues.length} related item(s) failed: ${issues.join(" ")}`, "error");
        }
        if (issues.length === 0) {
          toast(editingCampus ? "Campus updated successfully." : "Campus created successfully.", "success");
        }
        onOpenChange(false);
        setCampusSuccessCreatedId(null);
      } else {
        setModalError(res.message || "Failed to save campus.");
      }
    } catch (err: any) {
      setModalError(err.message || "An unexpected error occurred.");
    } finally {
      setModalBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      ariaLabel="Campus Setup Wizard"
      overlayClassName="bg-slate-950/60 backdrop-blur-sm p-4 overflow-y-auto"
      panelClassName={`overflow-hidden animate-slideUp flex flex-col my-auto max-h-[90vh] transition-all duration-300 ${
        campusWizardStep === 3 ? "max-w-5xl" : "max-w-2xl"
      } p-0 space-y-0`}
    >
      {/* Modal Header */}
      <div className="flex justify-between items-center px-6 py-4 border-b border-gray-100 bg-gray-50">
        <div className="flex items-center gap-3">
          <h3 className="font-extrabold text-gray-900 text-sm flex items-center gap-1.5">
            <Building2 className="h-5 w-5 text-indigo-600" />
            {editingCampus ? "Edit Campus" : campusSuccessCreatedId ? "Campus Created!" : "Add New Campus"}
          </h3>
          {draftLastSaved && !editingCampus && !campusSuccessCreatedId && (
            <span className="text-[10px] font-black text-pink-700 bg-gradient-to-r from-pink-50 to-amber-50 border border-pink-200/80 px-2.5 py-0.5 rounded-full flex items-center gap-1.5 shadow-2xs animate-fadeIn">
              <span className="h-1.5 w-1.5 rounded-full bg-indigo-500 animate-pulse" />
              Draft Auto-Saved ({draftRole.toUpperCase()} · {draftLastSaved})
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {hasRestoredDraft && !editingCampus && !campusSuccessCreatedId && (
            <Button
              variant="ghost"
              type="button"
              onClick={async () => {
                const ok = await showConfirm({
                  title: "Clear Draft",
                  message: "This discards the saved draft and resets the wizard to step 1. Continue?",
                  danger: true,
                  confirmLabel: "Clear Draft"
                });
                if (ok) await clearCampusDraftFromDb();
              }}
              className="h-auto text-[9.5px] font-extrabold text-slate-500 hover:text-rose-600 bg-slate-100 hover:bg-rose-50 px-2.5 py-1 rounded-xl border border-slate-200 cursor-pointer transition-colors"
            >
              Clear Draft
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            type="button"
            aria-label="Close campus dialog"
            onClick={() => {
              onOpenChange(false);
              setCampusSuccessCreatedId(null);
            }}
            className="h-auto w-auto p-1 hover:bg-gray-200 rounded-lg transition-colors cursor-pointer text-gray-500 hover:text-gray-800"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* ── SUCCESS SCREEN ── */}
      {campusSuccessCreatedId ? (
        <div className="p-8 space-y-6 animate-fadeIn">
          <div className="text-center space-y-2">
            <div className="h-16 w-16 rounded-full bg-emerald-100 flex items-center justify-center mx-auto text-emerald-600">
              <Building2 className="h-8 w-8" />
            </div>
            <h4 className="font-black text-gray-900 text-base">Campus Created Successfully!</h4>
            <p className="text-xs text-gray-500 font-semibold">What would you like to do next?</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => {
                onOpenChange(false);
                setCampusSuccessCreatedId(null);
                if (onOpenCampusConsole && campusSuccessCreatedId) {
                  onOpenCampusConsole(campusSuccessCreatedId);
                } else {
                  router.push("/admin/campuses");
                }
              }}
              className="flex flex-col items-center gap-1.5 p-4 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-xl transition-all cursor-pointer group"
            >
              <Building2 className="h-5 w-5 text-indigo-600 group-hover:scale-110 transition-transform" />
              <span className="text-xs font-extrabold text-indigo-700">Open Campus</span>
            </button>
            <button
              type="button"
              onClick={() => {
                onOpenChange(false);
                setCampusSuccessCreatedId(null);
                router.push(`/admin/cams?campus=${campusSuccessCreatedId}`);
              }}
              className="flex flex-col items-center gap-1.5 p-4 bg-violet-50 hover:bg-violet-100 border border-violet-200 rounded-xl transition-all cursor-pointer group"
            >
              <Users className="h-5 w-5 text-violet-600 group-hover:scale-110 transition-transform" />
              <span className="text-xs font-extrabold text-violet-700">Add Campus Manager</span>
            </button>
            <button
              type="button"
              onClick={() => {
                onOpenChange(false);
                setCampusSuccessCreatedId(null);
                router.push(`/admin/subjects?campus=${campusSuccessCreatedId}`);
              }}
              className="flex flex-col items-center gap-1.5 p-4 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-xl transition-all cursor-pointer group"
            >
              <BookOpen className="h-5 w-5 text-amber-600 group-hover:scale-110 transition-transform" />
              <span className="text-xs font-extrabold text-amber-700">Add Subjects</span>
            </button>
            <button
              type="button"
              onClick={() => {
                onOpenChange(false);
                setCampusSuccessCreatedId(null);
                router.push(`/admin/schedules?campus=${campusSuccessCreatedId}`);
              }}
              className="flex flex-col items-center gap-1.5 p-4 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-xl transition-all cursor-pointer group"
            >
              <CalendarDays className="h-5 w-5 text-emerald-600 group-hover:scale-110 transition-transform" />
              <span className="text-xs font-extrabold text-emerald-700">Generate Timetable</span>
            </button>
          </div>
          <button
            type="button"
            onClick={() => {
              onOpenChange(false);
              setCampusSuccessCreatedId(null);
            }}
            className="w-full py-2.5 text-gray-500 hover:text-gray-800 font-bold text-xs transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      ) : (
        <form onSubmit={handleCampusSubmit} className="flex flex-col flex-1 min-h-0 text-xs font-semibold">
          {/* Stepper */}
          <div className="flex items-center px-6 py-4 bg-gray-50 border-b border-gray-200 shrink-0 gap-0">
            {[
              { step: 1, label: "Campus Info" },
              { step: 2, label: "Courses" },
              { step: 3, label: "Shift Config" },
              { step: 4, label: "Review" }
            ].map((s, idx) => {
              const isActive = campusWizardStep === s.step;
              const isDone = campusWizardStep > s.step;
              return (
                <React.Fragment key={s.step}>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <div
                      className={`h-7 w-7 rounded-full flex items-center justify-center text-[11px] font-black transition-all ${
                        isDone ? "text-white" : isActive ? "text-white" : "text-gray-400"
                      }`}
                      style={{
                        background: isDone
                          ? "#10b981"
                          : isActive
                          ? "linear-gradient(135deg,#6366f1,#4f46e5)"
                          : "#e5e7eb",
                        boxShadow: isActive
                          ? "0 0 0 4px rgba(99,102,241,0.18), 0 2px 8px rgba(99,102,241,0.35)"
                          : "none"
                      }}
                    >
                      {isDone ? <Check className="h-3.5 w-3.5" /> : s.step}
                    </div>
                    <span
                      className={`text-[9.5px] uppercase tracking-wider font-extrabold whitespace-nowrap transition-colors ${
                        isActive ? "" : isDone ? "text-emerald-600" : "text-gray-400"
                      }`}
                      style={isActive ? { color: "#4f46e5" } : {}}
                    >
                      {s.label}
                    </span>
                  </div>
                  {idx < 3 && (
                    <div
                      className="flex-1 h-[3px] mx-2 rounded-full transition-all"
                      style={{
                        background: isDone
                          ? "linear-gradient(to right,#10b981,#34d399)"
                          : isActive
                          ? "linear-gradient(to right,#6366f1 30%,#e5e7eb)"
                          : "#e5e7eb"
                      }}
                    />
                  )}
                </React.Fragment>
              );
            })}
          </div>

          <div className="p-6 overflow-y-auto space-y-4 flex-1">
            {modalError && (
              <div role="alert" className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 font-bold flex items-center gap-1.5">
                <ShieldAlert className="h-4 w-4 shrink-0" />
                {modalError}
              </div>
            )}

            {/* ────────────────── STEP 1: CAMPUS INFO ────────────────── */}
            {campusWizardStep === 1 && (
              <div className="space-y-4 animate-fadeIn">
                <div className="pb-1 border-b border-gray-100">
                  <h4 className="text-xs font-black text-gray-800 uppercase tracking-wider">Campus Details</h4>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1 col-span-2">
                    <label className="text-[10px] text-gray-400 uppercase tracking-wider block font-bold">Campus Name *</label>
                    <Input
                      aria-label="Campus Name"
                      type="text"
                      required
                      placeholder="e.g. FP South Campus"
                      value={campusForm.name}
                      onChange={e => {
                        const name = e.target.value;
                        const autoCode = generateCampusCode(name);
                        setCampusForm(prev => ({
                          ...prev,
                          name,
                          code: isCampusCodeCustomized ? prev.code : autoCode
                        }));
                      }}
                      className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3.5 py-2.5 font-bold focus:outline-none focus:ring-1 focus:ring-indigo-600"
                    />
                  </div>

                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <label className="text-[10px] text-gray-400 uppercase tracking-wider block font-bold">
                        Campus Code
                        <span className="ml-1 text-indigo-500 font-bold normal-case">(Auto-generated)</span>
                      </label>
                      {!editingCampus && campusForm.name && (
                        <Button
                          variant="link"
                          size="sm"
                          type="button"
                          onClick={() => {
                            const code = generateCampusCode(campusForm.name);
                            setIsCampusCodeCustomized(false);
                            setCampusForm(prev => ({ ...prev, code }));
                          }}
                          className="h-auto px-0 text-[10px] text-indigo-600 hover:text-indigo-700 font-bold flex items-center gap-1 cursor-pointer transition-colors"
                          title="Reset to auto-generated code"
                        >
                          <RefreshCw className="h-2.5 w-2.5" />
                          <span>Sync with Name</span>
                        </Button>
                      )}
                    </div>
                    <Input
                      aria-label="Campus Code (Auto-generated)"
                      type="text"
                      required
                      placeholder="Auto-generated e.g. FPSC"
                      disabled={editingCampus}
                      value={campusForm.code}
                      onChange={e => {
                        setIsCampusCodeCustomized(true);
                        setCampusForm(prev => ({ ...prev, code: e.target.value.toUpperCase() }));
                      }}
                      className={`w-full border border-gray-200 rounded-xl px-3.5 py-2.5 font-bold tracking-wider uppercase focus:outline-none focus:ring-1 focus:ring-indigo-600 ${
                        editingCampus ? "bg-gray-100 text-gray-400 cursor-not-allowed" : "bg-gray-50 text-gray-900"
                      }`}
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] text-gray-400 uppercase tracking-wider block font-bold">Academic Year *</label>
                    <Select
                      aria-label="Academic Year"
                      required
                      value={campusForm.academic_year}
                      onChange={e => setCampusForm({ ...campusForm, academic_year: e.target.value })}
                      className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 font-bold focus:outline-none focus:ring-1 focus:ring-indigo-600 cursor-pointer"
                    >
                      {getAcademicYearOptions().map(yr => (
                        <option key={yr} value={yr}>
                          {yr}
                        </option>
                      ))}
                    </Select>
                  </div>

                  <div className="space-y-1 col-span-2">
                    <label className="text-[10px] text-gray-400 uppercase tracking-wider block font-bold">Address / Location *</label>
                    <Input
                      aria-label="Address / Location"
                      type="text"
                      required
                      placeholder="e.g. 78, West Tambaram, Chennai"
                      value={campusForm.address}
                      onChange={e => setCampusForm({ ...campusForm, address: e.target.value })}
                      className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3.5 py-2.5 font-bold focus:outline-none focus:ring-1 focus:ring-indigo-600"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] text-gray-400 uppercase tracking-wider block font-bold">KAM (Key Account Manager) *</label>
                    <Select
                      aria-label="KAM (Key Account Manager)"
                      required
                      value={campusForm.kam_id}
                      onChange={e => setCampusForm({ ...campusForm, kam_id: e.target.value })}
                      className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 font-bold focus:outline-none focus:ring-1 focus:ring-indigo-600 cursor-pointer"
                    >
                      <option value="">Select KAM</option>
                      {kamList.map((kam: any) => (
                        <option key={kam.id} value={kam.id}>
                          {kam.name}
                        </option>
                      ))}
                    </Select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] text-gray-400 uppercase tracking-wider block font-bold">
                      Campus Manager <span className="text-gray-400 font-semibold normal-case">(Optional)</span>
                    </label>
                    <Select
                      aria-label="Campus Manager (Optional)"
                      value={campusForm.manager}
                      onChange={e => setCampusForm({ ...campusForm, manager: e.target.value })}
                      className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 font-bold focus:outline-none focus:ring-1 focus:ring-indigo-600 cursor-pointer"
                    >
                      <option value="">Select CM (Optional)</option>
                      {camList.map((cam: any) => (
                        <option key={cam.id} value={cam.id}>
                          {cam.name}
                        </option>
                      ))}
                    </Select>
                  </div>
                </div>

                {/* Shift Mode Toggle */}
                <div className="space-y-1">
                  <label className="text-[10px] text-gray-400 uppercase tracking-wider block font-bold">Shift Mode *</label>
                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={() => setCampusForm({ ...campusForm, has_shifts: 0 })}
                      className={`flex-1 flex items-center gap-2 p-3 rounded-xl border-2 transition-all cursor-pointer ${
                        campusForm.has_shifts === 0
                          ? "border-indigo-500 bg-indigo-50 text-indigo-800"
                          : "border-gray-200 bg-white text-gray-500 hover:border-gray-300"
                      }`}
                    >
                      <div className={`h-4 w-4 rounded-full border-2 flex items-center justify-center ${campusForm.has_shifts === 0 ? "border-indigo-500" : "border-gray-300"}`}>
                        {campusForm.has_shifts === 0 && <div className="h-2 w-2 rounded-full bg-indigo-500" />}
                      </div>
                      <div className="text-left">
                        <div className="font-extrabold text-[11px]">General Shift</div>
                        <div className="text-[9px] font-semibold opacity-70">Single shift for all students</div>
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => setCampusForm({ ...campusForm, has_shifts: 1 })}
                      className={`flex-1 flex items-center gap-2 p-3 rounded-xl border-2 transition-all cursor-pointer ${
                        campusForm.has_shifts === 1
                          ? "border-indigo-500 bg-indigo-50 text-indigo-800"
                          : "border-gray-200 bg-white text-gray-500 hover:border-gray-300"
                      }`}
                    >
                      <div className={`h-4 w-4 rounded-full border-2 flex items-center justify-center ${campusForm.has_shifts === 1 ? "border-indigo-500" : "border-gray-300"}`}>
                        {campusForm.has_shifts === 1 && <div className="h-2 w-2 rounded-full bg-indigo-500" />}
                      </div>
                      <div className="text-left">
                        <div className="font-extrabold text-[11px]">Multiple Shifts</div>
                        <div className="text-[9px] font-semibold opacity-70">Shift 1 & Shift 2 separately</div>
                      </div>
                    </button>
                  </div>
                </div>

                {/* Working Days Config */}
                <div className="space-y-1">
                  <label className="text-[10px] text-gray-400 uppercase tracking-wider block font-bold">Working Days *</label>
                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={() => setCampusForm({ ...campusForm, working_days: 5 })}
                      className={`flex-1 flex items-center gap-2 p-3 rounded-xl border-2 transition-all cursor-pointer ${
                        (campusForm.working_days ?? 5) === 5
                          ? "border-indigo-500 bg-indigo-50 text-indigo-800"
                          : "border-gray-200 bg-white text-gray-500 hover:border-gray-300"
                      }`}
                    >
                      <div className={`h-4 w-4 rounded-full border-2 flex items-center justify-center ${(campusForm.working_days ?? 5) === 5 ? "border-indigo-500" : "border-gray-300"}`}>
                        {(campusForm.working_days ?? 5) === 5 && <div className="h-2 w-2 rounded-full bg-indigo-500" />}
                      </div>
                      <div className="text-left">
                        <div className="font-extrabold text-[11px]">5 Working Days</div>
                        <div className="text-[9px] font-semibold opacity-70">Monday to Friday schedule</div>
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => setCampusForm({ ...campusForm, working_days: 6 })}
                      className={`flex-1 flex items-center gap-2 p-3 rounded-xl border-2 transition-all cursor-pointer ${
                        (campusForm.working_days ?? 5) === 6
                          ? "border-indigo-500 bg-indigo-50 text-indigo-800"
                          : "border-gray-200 bg-white text-gray-500 hover:border-gray-300"
                      }`}
                    >
                      <div className={`h-4 w-4 rounded-full border-2 flex items-center justify-center ${(campusForm.working_days ?? 5) === 6 ? "border-indigo-500" : "border-gray-300"}`}>
                        {(campusForm.working_days ?? 5) === 6 && <div className="h-2 w-2 rounded-full bg-indigo-500" />}
                      </div>
                      <div className="text-left">
                        <div className="font-extrabold text-[11px]">6 Working Days</div>
                        <div className="text-[9px] font-semibold opacity-70">Monday to Saturday schedule</div>
                      </div>
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* ────────────────── STEP 2: COURSES (SIMPLIFIED & DUPLICATE SUPPORT) ────────────────── */}
            {campusWizardStep === 2 && (
              <div className="space-y-4 animate-fadeIn">
                <div className="pb-1 border-b border-gray-100 flex items-center justify-between">
                  <h4 className="text-xs font-black text-gray-800 uppercase tracking-wider">Courses</h4>
                  <span className="text-[10px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded-full">
                    {wizardCourses.length} Course{wizardCourses.length !== 1 ? "s" : ""}
                  </span>
                </div>

                {/* Existing / Added Courses List */}
                {wizardCourses.length > 0 && (
                  <div className="space-y-2 max-h-[260px] overflow-y-auto pr-1">
                    {wizardCourses.map((c, idx) => (
                      <div key={idx} className="bg-indigo-50/40 border border-indigo-100 p-3 rounded-xl flex items-center justify-between gap-3">
                        <div className="space-y-1 flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-extrabold text-xs text-gray-800">{c.name}</span>
                            <span className="px-1.5 rounded bg-indigo-50 border border-indigo-200 text-indigo-700 text-[8px] font-extrabold uppercase shrink-0">
                              {c.years} Yrs · {c.years * 2} Sem
                            </span>
                            <span className="px-1.5 rounded bg-slate-100 border border-slate-200 text-slate-700 text-[8px] font-extrabold uppercase shrink-0">
                              Room: {c.default_room || c.room || "Unassigned"}
                            </span>
                            <span className="px-1.5 rounded bg-purple-50 border border-purple-200 text-purple-700 text-[8px] font-extrabold uppercase shrink-0">
                              {c.default_shift === "shift_1" ? "Shift 1" : c.default_shift === "shift_2" ? "Shift 2" : "General Shift"}
                            </span>
                            {c.isExisting && (
                              <span className="px-1.5 rounded bg-emerald-50 border border-emerald-200 text-emerald-700 text-[8px] font-extrabold uppercase shrink-0">
                                Saved
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Action buttons: Duplicate & Remove */}
                        <div className="flex items-center gap-1.5 shrink-0">
                          <Button
                            variant="ghost"
                            type="button"
                            onClick={() => handleDuplicateCourse(idx)}
                            title="Duplicate this course"
                            className="h-auto text-[10px] text-indigo-600 font-extrabold hover:text-indigo-800 bg-white border border-indigo-200 hover:bg-indigo-50 px-2 py-1 rounded-xl transition-colors cursor-pointer flex items-center gap-1 shadow-2xs"
                          >
                            <Copy className="h-3 w-3" /> Duplicate
                          </Button>
                          <Button
                            variant="ghost"
                            type="button"
                            onClick={() => setWizardCourses(prev => prev.filter((_, i) => i !== idx))}
                            className="h-auto text-[10px] text-red-500 font-extrabold hover:text-red-700 bg-red-50 hover:bg-red-100 px-2 py-1 rounded-xl transition-colors cursor-pointer"
                          >
                            Remove
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Add Course Sub-Form */}
                <div className="bg-slate-50/60 p-4 rounded-xl border border-slate-100 space-y-3.5">
                  <div className="text-[10px] font-black text-gray-500 uppercase tracking-wider">+ Add Course</div>

                  {/* Course Name */}
                  <div className="space-y-1">
                    <label className={`text-[9.5px] uppercase font-bold block transition-colors ${courseFieldErrors.name ? "text-red-500" : "text-gray-400"}`}>
                      Course Name *
                    </label>
                    <Input
                      aria-label="Course Name"
                      aria-invalid={Boolean(courseFieldErrors.name)}
                      type="text"
                      value={wizardCourseForm.name}
                      onChange={e => {
                        setWizardCourseForm({ ...wizardCourseForm, name: e.target.value });
                        if (e.target.value.trim()) setCourseFieldErrors(prev => ({ ...prev, name: false }));
                      }}
                      placeholder="e.g. B.Sc Computer Science"
                      className={`w-full rounded-xl px-3 py-2 font-bold text-xs focus:outline-none focus:ring-2 transition-all ${
                        courseFieldErrors.name
                          ? "border-2 border-red-400 bg-red-50 focus:ring-red-200"
                          : "bg-white border border-gray-200 focus:ring-indigo-100 focus:border-indigo-400"
                      }`}
                    />
                    {courseFieldErrors.name && <p role="alert" className="text-[9px] text-red-500 font-bold mt-0.5">Course name is required</p>}
                  </div>

                  {/* Duration Buttons */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-[9.5px] text-gray-400 uppercase font-bold block">Duration *</label>
                      <span className="text-[9px] font-bold text-indigo-600 bg-indigo-50 border border-indigo-100 px-2 py-0.5 rounded-full">
                        {wizardCourseForm.years * 2} Semesters (Auto)
                      </span>
                    </div>
                    <div className="flex gap-2">
                      {[2, 3, 4, 5].map(y => (
                        <button
                          key={y}
                          type="button"
                          onClick={() => setWizardCourseForm(prev => ({ ...prev, years: y }))}
                          className={`flex-1 py-2 rounded-xl font-extrabold text-xs transition-all cursor-pointer border-2 ${
                            wizardCourseForm.years === y
                              ? "bg-indigo-600 border-indigo-600 text-white shadow-sm"
                              : "bg-white border-gray-200 text-gray-600 hover:border-indigo-300"
                          }`}
                        >
                          {y} Yrs
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Single Room Input */}
                  <div className="space-y-1">
                    <label className={`text-[9.5px] uppercase font-bold block transition-colors ${courseFieldErrors.room ? "text-red-500" : "text-gray-400"}`}>
                      Room / Classroom *
                    </label>
                    <Input
                      aria-label="Room / Classroom"
                      aria-invalid={Boolean(courseFieldErrors.room)}
                      type="text"
                      required
                      placeholder="e.g. Room 101, Computer Lab 2, Hall A"
                      value={wizardCourseForm.room}
                      onChange={e => {
                        setWizardCourseForm({ ...wizardCourseForm, room: e.target.value });
                        if (e.target.value.trim()) setCourseFieldErrors(prev => ({ ...prev, room: false }));
                      }}
                      className={`w-full rounded-xl px-3 py-2 font-bold text-xs focus:outline-none focus:ring-2 transition-all ${
                        courseFieldErrors.room
                          ? "border-2 border-red-400 bg-red-50 focus:ring-red-200"
                          : "bg-white border border-gray-200 focus:ring-indigo-100 focus:border-indigo-400"
                      }`}
                    />
                    {courseFieldErrors.room && <p role="alert" className="text-[9px] text-red-500 font-bold mt-0.5">Room / Classroom is required</p>}
                  </div>

                  {/* Default Shift */}
                  <div className="space-y-1">
                    <label className="text-[9.5px] text-gray-400 uppercase font-bold block">Default Shift</label>
                    <Select
                      aria-label="Default Shift"
                      value={wizardCourseForm.default_shift}
                      onChange={e => setWizardCourseForm({ ...wizardCourseForm, default_shift: e.target.value })}
                      className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2 font-bold text-xs cursor-pointer focus:ring-1 focus:ring-indigo-500 outline-none text-gray-800"
                    >
                      <option value="general">General Shift</option>
                      {campusForm.has_shifts === 1 && (
                        <>
                          <option value="shift_1">Shift 1</option>
                          <option value="shift_2">Shift 2</option>
                        </>
                      )}
                    </Select>
                  </div>

                  <Button
                    variant="ghost"
                    type="button"
                    onClick={() => {
                      setModalError(null);
                      const errs: Record<string, boolean> = {};
                      if (!wizardCourseForm.name.trim()) errs.name = true;
                      if (!wizardCourseForm.room.trim()) errs.room = true;

                      if (Object.keys(errs).length > 0) {
                        setCourseFieldErrors(errs);
                        setModalError("Please specify Course Name and Room / Classroom.");
                        return;
                      }

                      setCourseFieldErrors({});
                      setModalError(null);
                      const newC = {
                        ...wizardCourseForm,
                        default_room: wizardCourseForm.room.trim(),
                        room: wizardCourseForm.room.trim(),
                        isExisting: false
                      };
                      setWizardCourses(prev => [...prev, newC]);
                      setWizardCourseForm({
                        name: "",
                        years: 3,
                        room: "",
                        default_shift: "general",
                        start_date: "",
                        end_date: "",
                        start_year: "",
                        end_year: "",
                        description: ""
                      });
                    }}
                    className="h-auto w-full bg-indigo-600 hover:bg-indigo-700 text-white text-[10px] font-extrabold py-2.5 rounded-xl shadow-sm hover:scale-[1.01] transition-all cursor-pointer"
                  >
                    + Add Course to Campus List
                  </Button>
                </div>
              </div>
            )}

            {/* ────────────────── STEP 3: SHIFT CONFIG ────────────────── */}
            {campusWizardStep === 3 && (
              <div className="space-y-4 animate-fadeIn">
                <div className="pb-1 border-b border-gray-100 flex items-center justify-between">
                  <h4 className="text-xs font-black text-gray-800 uppercase tracking-wider">Shift Configuration</h4>
                  {campusForm.has_shifts === 1 && (
                    <div className="flex bg-gray-100 p-1 rounded-xl gap-1">
                      {(["shift_1", "shift_2", "general"] as const).map(sh => (
                        <button
                          key={sh}
                          type="button"
                          onClick={() => {
                            setActiveConfigShift(sh);
                            setNewBreakName("");
                          }}
                          className={`px-3 py-1 rounded-lg text-[10px] font-extrabold transition-all cursor-pointer ${
                            activeConfigShift === sh
                              ? "bg-white text-indigo-600 shadow-sm"
                              : "text-gray-500 hover:text-gray-800"
                          }`}
                        >
                          {shiftConfigsParams[sh].label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Side-by-Side 2-Column Grid */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
                  {/* Left Column (Form) */}
                  <div className="lg:col-span-7 space-y-4">
                    <div className="flex items-center gap-2 bg-indigo-50/40 p-2.5 rounded-xl border border-indigo-100/50">
                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Configure Semester:</span>
                      <Select
                        aria-label="Semester"
                        value={activeConfigSemester}
                        onChange={e => handleSemesterChange(e.target.value)}
                        className="flex-1 bg-white border border-gray-200 rounded-lg px-2.5 py-1.5 font-bold text-xs focus:outline-none focus:ring-1 focus:ring-indigo-600 cursor-pointer"
                      >
                        <option value="All Semesters">All Semesters (Default Fallback)</option>
                        {ALL_SEMESTERS.map(sem => (
                          <option key={sem} value={sem}>
                            {sem}
                          </option>
                        ))}
                      </Select>
                    </div>

                    <div className="bg-slate-50/50 p-4 border border-slate-100 rounded-xl space-y-3.5">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <label className="text-[10px] text-gray-400 uppercase tracking-wider block font-bold">Shift Name / Label</label>
                          <Input
                            aria-label="Shift Name / Label"
                            type="text"
                            required
                            value={shiftConfigsParams[activeConfigShift].label}
                            onChange={e => {
                              const val = e.target.value;
                              setShiftConfigsParams(prev => ({
                                ...prev,
                                [activeConfigShift]: { ...prev[activeConfigShift], label: val }
                              }));
                            }}
                            placeholder="e.g. Regular Shift"
                            className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2 font-bold focus:outline-none focus:ring-1 focus:ring-indigo-600 text-xs"
                          />
                        </div>

                        {/* Start Time with Clock Widget */}
                        <div className="space-y-1 relative">
                          <div className="flex items-center justify-between">
                            <label className="text-[10px] text-gray-400 uppercase tracking-wider block font-bold">Start Time (Clock Widget)</label>
                            <Button
                              variant="link"
                              size="sm"
                              type="button"
                              onClick={() => setShowClockPresets(!showClockPresets)}
                              className="h-auto px-0 text-[9px] text-indigo-600 font-extrabold hover:underline flex items-center gap-1 cursor-pointer"
                            >
                              <Clock className="h-3 w-3 text-indigo-600" /> Presets
                            </Button>
                          </div>
                          <div className="relative flex items-center">
                            <Input
                              aria-label="Start Time (Clock Widget)"
                              type="text"
                              required
                              value={shiftConfigsParams[activeConfigShift].startTime}
                              onChange={e => {
                                const val = e.target.value;
                                setShiftConfigsParams(prev => ({
                                  ...prev,
                                  [activeConfigShift]: { ...prev[activeConfigShift], startTime: val }
                                }));
                              }}
                              placeholder="e.g. 08:30 AM"
                              className="w-full bg-white border border-gray-200 rounded-xl pl-3 pr-10 py-2 font-bold focus:outline-none focus:ring-1 focus:ring-indigo-600 text-xs"
                            />
                            <div className="absolute right-2 flex items-center gap-1">
                              <Input
                                aria-label="Select time"
                                type="time"
                                onChange={e => {
                                  const timeVal = e.target.value;
                                  if (timeVal) {
                                    const [hStr, mStr] = (timeVal || "").split(":");
                                    let h = parseInt(hStr || "0", 10);
                                    const m = parseInt(mStr || "0", 10);
                                    const ampm = h >= 12 ? "PM" : "AM";
                                    h = h % 12;
                                    if (h === 0) h = 12;
                                    const formattedH = h < 10 ? `0${h}` : `${h}`;
                                    const formattedM = m < 10 ? `0${m}` : `${m}`;
                                    const formatted = `${formattedH}:${formattedM} ${ampm}`;
                                    setShiftConfigsParams(prev => ({
                                      ...prev,
                                      [activeConfigShift]: { ...prev[activeConfigShift], startTime: formatted }
                                    }));
                                  }
                                }}
                                className="w-6 h-6 opacity-0 absolute right-0 cursor-pointer"
                                title="Open Time Picker Widget"
                              />
                              <div className="p-1.5 rounded-lg bg-indigo-50 text-indigo-600 pointer-events-none">
                                <Clock className="h-3.5 w-3.5" />
                              </div>
                            </div>
                          </div>

                          {/* Clock Presets Dropdown */}
                          {showClockPresets && (
                            <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-indigo-200 rounded-xl p-2.5 shadow-lg z-30 space-y-1.5 animate-fadeIn">
                              <div className="text-[9px] font-black text-gray-400 uppercase tracking-wider px-1">Quick Clock Presets</div>
                              <div className="grid grid-cols-1 sm:grid-cols-4 gap-1">
                                {["08:00 AM", "08:30 AM", "09:00 AM", "09:30 AM", "10:00 AM", "01:00 PM", "01:30 PM", "02:00 PM"].map(timePreset => (
                                  <button
                                    key={timePreset}
                                    type="button"
                                    onClick={() => {
                                      setShiftConfigsParams(prev => ({
                                        ...prev,
                                        [activeConfigShift]: { ...prev[activeConfigShift], startTime: timePreset }
                                      }));
                                      setShowClockPresets(false);
                                    }}
                                    className={`py-1.5 rounded-lg text-[10px] font-extrabold transition-all border cursor-pointer ${
                                      shiftConfigsParams[activeConfigShift].startTime === timePreset
                                        ? "bg-indigo-600 border-indigo-600 text-white shadow-2xs"
                                        : "bg-gray-50 border-gray-200 text-gray-700 hover:bg-indigo-50 hover:border-indigo-200"
                                    }`}
                                  >
                                    {timePreset}
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <label className="text-[10px] text-gray-400 uppercase tracking-wider block font-bold">Period Duration (minutes)</label>
                          <Input
                            aria-label="Period Duration (minutes)"
                            type="number"
                            min="1"
                            required
                            value={shiftConfigsParams[activeConfigShift].periodDuration}
                            onChange={e => {
                              const val = parseInt(e.target.value, 10) || 0;
                              setShiftConfigsParams(prev => ({
                                ...prev,
                                [activeConfigShift]: { ...prev[activeConfigShift], periodDuration: val }
                              }));
                            }}
                            className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2 font-bold focus:outline-none focus:ring-1 focus:ring-indigo-600 text-xs"
                          />
                        </div>

                        <div className="space-y-1">
                          <label className="text-[10px] text-gray-400 uppercase tracking-wider block font-bold">Calculation Mode</label>
                          <Select
                            aria-label="Calculation Mode"
                            value={shiftConfigsParams[activeConfigShift].mode}
                            onChange={e => {
                              const mode = e.target.value as "duration" | "fixed";
                              setShiftConfigsParams(prev => ({
                                ...prev,
                                [activeConfigShift]: {
                                  ...prev[activeConfigShift],
                                  mode,
                                  endTime: mode === "fixed" ? "04:30 PM" : undefined
                                }
                              }));
                            }}
                            className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2 font-bold focus:outline-none focus:ring-1 focus:ring-indigo-600 text-xs cursor-pointer"
                          >
                            <option value="duration">Specify Number of Periods</option>
                            <option value="fixed">Specify Shift End Time</option>
                          </Select>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {shiftConfigsParams[activeConfigShift].mode === "duration" ? (
                          <div className="space-y-1">
                            <label className="text-[10px] text-gray-400 uppercase tracking-wider block font-bold">Number of Periods</label>
                            <Input
                              aria-label="Number of Periods"
                              type="number"
                              min="1"
                              required
                              value={shiftConfigsParams[activeConfigShift].periodsCount}
                              onChange={e => {
                                const val = parseInt(e.target.value, 10) || 0;
                                setShiftConfigsParams(prev => ({
                                  ...prev,
                                  [activeConfigShift]: { ...prev[activeConfigShift], periodsCount: val }
                                }));
                              }}
                              className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2 font-bold focus:outline-none focus:ring-1 focus:ring-indigo-600 text-xs"
                            />
                          </div>
                        ) : (
                          <div className="space-y-1">
                            <label className="text-[10px] text-gray-400 uppercase tracking-wider block font-bold">Shift End Time</label>
                            <Input
                              aria-label="Shift End Time"
                              type="text"
                              required
                              value={shiftConfigsParams[activeConfigShift].endTime || ""}
                              onChange={e => {
                                const val = e.target.value;
                                setShiftConfigsParams(prev => ({
                                  ...prev,
                                  [activeConfigShift]: { ...prev[activeConfigShift], endTime: val }
                                }));
                              }}
                              placeholder="e.g. 04:30 PM"
                              className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2 font-bold focus:outline-none focus:ring-1 focus:ring-indigo-600 text-xs"
                            />
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Configured Breaks List */}
                    <div className="space-y-3 bg-white p-4 border border-slate-100 rounded-2xl shadow-card">
                      <div className="flex items-center justify-between border-b border-gray-100 pb-2">
                        <span className="text-[10px] uppercase font-bold text-gray-500 tracking-wider">Configured Breaks</span>
                        <span className="text-[9px] text-indigo-500 font-bold bg-indigo-50 px-2 py-0.5 rounded-full">
                          {shiftConfigsParams[activeConfigShift].breaks.length} Breaks
                        </span>
                      </div>

                      {shiftConfigsParams[activeConfigShift].breaks.length === 0 ? (
                        <p className="text-[10px] text-gray-400 font-semibold text-center py-2">No breaks configured for this shift.</p>
                      ) : (
                        <div className="space-y-2">
                          {shiftConfigsParams[activeConfigShift].breaks.map(brk => (
                            <div key={brk.id} className="flex items-center justify-between bg-slate-50/50 p-2.5 rounded-xl border border-gray-200">
                              <div>
                                <div className="font-extrabold text-xs text-gray-800">{brk.name}</div>
                                <div className="text-[9.5px] font-bold text-gray-500 mt-0.5">
                                  {brk.duration} min • Occurs after Period {brk.afterPeriod}
                                </div>
                              </div>
                              <div className="flex items-center gap-1.5">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  type="button"
                                  aria-label={`Move ${brk.name} break earlier`}
                                  disabled={brk.afterPeriod <= 1}
                                  onClick={() => {
                                    const updatedBreaks = shiftConfigsParams[activeConfigShift].breaks.map(b =>
                                      b.id === brk.id ? { ...b, afterPeriod: b.afterPeriod - 1 } : b
                                    );
                                    setShiftConfigsParams(prev => ({
                                      ...prev,
                                      [activeConfigShift]: { ...prev[activeConfigShift], breaks: updatedBreaks }
                                    }));
                                  }}
                                  className="h-auto w-auto p-1 text-gray-400 hover:text-indigo-600 hover:bg-slate-100 rounded-lg cursor-pointer transition-colors disabled:opacity-30 disabled:pointer-events-none"
                                >
                                  ▲
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  type="button"
                                  aria-label={`Move ${brk.name} break later`}
                                  onClick={() => {
                                    const updatedBreaks = shiftConfigsParams[activeConfigShift].breaks.map(b =>
                                      b.id === brk.id ? { ...b, afterPeriod: b.afterPeriod + 1 } : b
                                    );
                                    setShiftConfigsParams(prev => ({
                                      ...prev,
                                      [activeConfigShift]: { ...prev[activeConfigShift], breaks: updatedBreaks }
                                    }));
                                  }}
                                  className="h-auto w-auto p-1 text-gray-400 hover:text-indigo-600 hover:bg-slate-100 rounded-lg cursor-pointer transition-colors"
                                >
                                  ▼
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  type="button"
                                  onClick={() => {
                                    const updatedBreaks = shiftConfigsParams[activeConfigShift].breaks.filter(b => b.id !== brk.id);
                                    setShiftConfigsParams(prev => ({
                                      ...prev,
                                      [activeConfigShift]: { ...prev[activeConfigShift], breaks: updatedBreaks }
                                    }));
                                  }}
                                  className="h-auto w-auto text-[10px] text-red-500 font-extrabold hover:text-red-700 bg-red-50 hover:bg-red-100 px-2 py-1 rounded-lg transition-colors cursor-pointer"
                                >
                                  Remove
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      <div className="bg-slate-50/50 p-3 rounded-xl border border-gray-200 border-dashed space-y-3 mt-3">
                        <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Add Custom Break</div>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                          <div className="space-y-1">
                            <label className="text-[9px] text-gray-400 uppercase font-bold block">Break Name</label>
                            <Input
                              aria-label="Break Name"
                              type="text"
                              value={newBreakName}
                              onChange={e => setNewBreakName(e.target.value)}
                              placeholder="e.g. Lunch"
                              className="w-full bg-white border border-gray-200 rounded-lg px-2 py-1.5 font-bold text-xs"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[9px] text-gray-400 uppercase font-bold block">Duration (min)</label>
                            <Input
                              aria-label="Duration (min)"
                              type="number"
                              min="1"
                              value={newBreakDuration}
                              onChange={e => setNewBreakDuration(parseInt(e.target.value, 10) || 0)}
                              className="w-full bg-white border border-gray-200 rounded-lg px-2 py-1.5 font-bold text-xs"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[9px] text-gray-400 uppercase font-bold block">After Period #</label>
                            <Input
                              aria-label="After Period #"
                              type="number"
                              min="1"
                              value={newBreakAfterPeriod}
                              onChange={e => setNewBreakAfterPeriod(parseInt(e.target.value, 10) || 1)}
                              className="w-full bg-white border border-gray-200 rounded-lg px-2 py-1.5 font-bold text-xs"
                            />
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          type="button"
                          onClick={() => {
                            if (!newBreakName.trim()) return;
                            const brk: ShiftBreak = {
                              id: `b_${Date.now()}`,
                              name: newBreakName.trim(),
                              duration: newBreakDuration,
                              afterPeriod: newBreakAfterPeriod
                            };
                            setShiftConfigsParams(prev => ({
                              ...prev,
                              [activeConfigShift]: {
                                ...prev[activeConfigShift],
                                breaks: [...prev[activeConfigShift].breaks, brk]
                              }
                            }));
                            setNewBreakName("");
                          }}
                          className="h-auto w-full bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-[10px] font-extrabold py-2 rounded-xl border border-indigo-200 transition-colors cursor-pointer"
                        >
                          + Add Break to Shift
                        </Button>
                      </div>
                    </div>
                  </div>

                  {/* Right Column (Floating Drag & Drop Live Timetable Preview Panel) */}
                  <div className="lg:col-span-5 sticky top-2">
                    {(() => {
                      const schedule = calculateShiftSchedule(shiftConfigsParams[activeConfigShift]);
                      return (
                        <div className="bg-slate-900 text-white p-4.5 rounded-xl space-y-3.5 shadow-card border border-slate-800 animate-fadeIn">
                          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                            <div>
                              <div className="text-[11px] uppercase font-black tracking-wider text-indigo-300 flex items-center gap-1.5">
                                <Sparkles className="h-3.5 w-3.5 text-indigo-400" /> Live Timetable Preview
                              </div>
                              <p className="text-[9px] text-slate-400 font-semibold mt-0.5">Drag & drop breaks onto periods to reorder</p>
                            </div>
                            {schedule.overallEndTime && (
                              <div className="text-[9.5px] font-bold text-emerald-300 bg-emerald-950/80 border border-emerald-800/60 px-2.5 py-1 rounded-full shrink-0">
                                Ends: {schedule.overallEndTime} ({schedule.totalPeriods} Periods)
                              </div>
                            )}
                          </div>

                          {schedule.error ? (
                            <div className="text-[10.5px] font-bold text-amber-300 bg-amber-950/60 border border-amber-800/60 rounded-xl p-3">
                              {schedule.error}
                            </div>
                          ) : shiftConfigsParams[activeConfigShift].breaks.length === 0 ? (
                            <div className="text-[10px] font-bold text-amber-300 bg-amber-950/60 border border-amber-800/60 rounded-xl p-3 flex items-center gap-2">
                              <span>At least one break must be configured for this shift.</span>
                            </div>
                          ) : schedule.items.length === 0 ? (
                            <p className="text-[10px] text-slate-500 font-semibold py-4 text-center">No periods calculated yet.</p>
                          ) : (
                            <div className="relative border-l-2 border-indigo-500/40 ml-3 pl-4 py-1 space-y-2 text-[11px]">
                              {schedule.items.map((item, index) => {
                                const isBreak = item.type === "break";
                                const matchedBreak = isBreak
                                  ? shiftConfigsParams[activeConfigShift].breaks.find(b => b.name === item.name)
                                  : null;

                                return (
                                  <div
                                    key={index}
                                    draggable={isBreak}
                                    onDragStart={e => {
                                      if (matchedBreak) {
                                        e.dataTransfer.setData("text/plain", matchedBreak.id);
                                        setDraggedBreakId(matchedBreak.id);
                                      }
                                    }}
                                    onDragOver={e => e.preventDefault()}
                                    onDrop={() => {
                                      if (draggedBreakId) {
                                        let targetP = item.type === "period" ? item.index || 1 : 1;
                                        if (item.type === "break" && index > 0) {
                                          const prevItem = schedule.items[index - 1];
                                          if (prevItem && prevItem.type === "period") targetP = prevItem.index || 1;
                                        }
                                        const updatedBreaks = shiftConfigsParams[activeConfigShift].breaks.map(b =>
                                          b.id === draggedBreakId ? { ...b, afterPeriod: targetP } : b
                                        );
                                        setShiftConfigsParams(prev => ({
                                          ...prev,
                                          [activeConfigShift]: { ...prev[activeConfigShift], breaks: updatedBreaks }
                                        }));
                                        setDraggedBreakId(null);
                                      }
                                    }}
                                    className={`relative flex flex-col gap-1.5 p-2.5 rounded-xl transition-all border ${
                                      isBreak
                                        ? "bg-amber-950/40 border-amber-500/30 hover:bg-amber-900/50 cursor-grab active:cursor-grabbing"
                                        : "bg-slate-800/70 border-slate-700/60 hover:bg-slate-800"
                                    } ${draggedBreakId && matchedBreak?.id === draggedBreakId ? "opacity-40 scale-[0.98]" : ""}`}
                                  >
                                    <div
                                      className={`absolute -left-[21px] top-3 w-2.5 h-2.5 rounded-full border-2 ${
                                        isBreak
                                          ? "bg-amber-400 border-amber-300 shadow-amber-500/50 shadow-sm"
                                          : "bg-indigo-400 border-indigo-300 shadow-indigo-500/50 shadow-sm"
                                      }`}
                                    />

                                    <div className="flex items-center justify-between gap-2">
                                      <div className="flex items-center gap-2 min-w-0">
                                        {isBreak && <GripVertical className="h-3.5 w-3.5 text-amber-400/80 shrink-0" />}
                                        <span className={`font-black text-xs truncate ${isBreak ? "text-amber-300" : "text-slate-100"}`}>
                                          {item.name}
                                        </span>
                                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-md bg-slate-900/90 text-indigo-300 border border-slate-700/80 shrink-0">
                                          {item.durationMinutes || 0}m
                                        </span>
                                        <Button
                                          variant="ghost"
                                          size="icon"
                                          type="button"
                                          onClick={() => {
                                            if (item.type === "period" && item.index) {
                                              setEditingPeriodNum(editingPeriodNum === item.index ? null : item.index);
                                            } else if (matchedBreak) {
                                              setEditingPeriodNum(editingPeriodNum === index + 100 ? null : index + 100);
                                            }
                                          }}
                                          title="Edit duration for this specific period/break"
                                          className="h-auto w-auto p-1 rounded-md text-slate-400 hover:text-indigo-300 hover:bg-slate-700 transition-colors cursor-pointer"
                                        >
                                          <Edit className="h-3 w-3" />
                                        </Button>
                                      </div>

                                      <span className="font-mono font-bold text-[10px] text-slate-300 shrink-0 bg-slate-950/80 px-2 py-0.5 rounded-md border border-slate-800">
                                        {item.startTimeStr} - {item.endTimeStr}
                                      </span>
                                    </div>

                                    {/* Inline Duration Adjustment Controls (Pencil Edit) */}
                                    {item.type === "period" && item.index && editingPeriodNum === item.index && (
                                      <div className="mt-1 pt-1.5 border-t border-slate-700/60 flex items-center justify-between gap-2 text-[10px] animate-fadeIn bg-slate-900/90 p-2 rounded-xl">
                                        <div>
                                          <span className="text-slate-200 font-extrabold block">Adjust Period {item.index} Duration:</span>
                                          <span className="text-[8.5px] text-indigo-300/80 font-medium block">
                                            Only updates Period {item.index} & subsequent times
                                          </span>
                                        </div>
                                        <div className="flex items-center gap-1.5 shrink-0">
                                          <Button
                                            variant="ghost"
                                            size="icon"
                                            type="button"
                                            onClick={() => {
                                              const cur = item.durationMinutes || shiftConfigsParams[activeConfigShift].periodDuration;
                                              const updated = Math.max(5, cur - 5);
                                              setShiftConfigsParams(prev => ({
                                                ...prev,
                                                [activeConfigShift]: {
                                                  ...prev[activeConfigShift],
                                                  customPeriodDurations: {
                                                    ...prev[activeConfigShift].customPeriodDurations,
                                                    [item.index!]: updated
                                                  }
                                                }
                                              }));
                                            }}
                                            className="h-auto w-auto h-5 w-5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-black rounded-md flex items-center justify-center cursor-pointer"
                                          >
                                            −
                                          </Button>
                                          <span className="font-mono font-extrabold text-indigo-300 w-8 text-center">
                                            {item.durationMinutes || shiftConfigsParams[activeConfigShift].periodDuration}m
                                          </span>
                                          <Button
                                            variant="ghost"
                                            size="icon"
                                            type="button"
                                            onClick={() => {
                                              const cur = item.durationMinutes || shiftConfigsParams[activeConfigShift].periodDuration;
                                              const updated = cur + 5;
                                              setShiftConfigsParams(prev => ({
                                                ...prev,
                                                [activeConfigShift]: {
                                                  ...prev[activeConfigShift],
                                                  customPeriodDurations: {
                                                    ...prev[activeConfigShift].customPeriodDurations,
                                                    [item.index!]: updated
                                                  }
                                                }
                                              }));
                                            }}
                                            className="h-auto w-auto h-5 w-5 bg-indigo-600 hover:bg-indigo-500 text-white font-black rounded-md flex items-center justify-center cursor-pointer"
                                          >
                                            +
                                          </Button>
                                          {shiftConfigsParams[activeConfigShift].customPeriodDurations?.[item.index] && (
                                            <Button
                                              variant="link"
                                              size="sm"
                                              type="button"
                                              onClick={() => {
                                                const copy = { ...shiftConfigsParams[activeConfigShift].customPeriodDurations };
                                                delete copy[item.index!];
                                                setShiftConfigsParams(prev => ({
                                                  ...prev,
                                                  [activeConfigShift]: {
                                                    ...prev[activeConfigShift],
                                                    customPeriodDurations: copy
                                                  }
                                                }));
                                              }}
                                              className="h-auto px-0 text-[9px] text-amber-400 hover:underline font-bold ml-1 cursor-pointer"
                                            >
                                              Reset
                                            </Button>
                                          )}
                                        </div>
                                      </div>
                                    )}

                                    {/* Inline Break Duration Adjustment */}
                                    {isBreak && matchedBreak && editingPeriodNum === index + 100 && (
                                      <div className="mt-1 pt-1.5 border-t border-amber-900/60 flex items-center justify-between gap-2 text-[10px] animate-fadeIn bg-amber-950/80 p-2 rounded-xl">
                                        <div>
                                          <span className="text-amber-200 font-extrabold block">Adjust {matchedBreak.name} Duration:</span>
                                          <span className="text-[8.5px] text-amber-300/80 font-medium block">
                                            Only updates break & subsequent times
                                          </span>
                                        </div>
                                        <div className="flex items-center gap-1.5 shrink-0">
                                          <Button
                                            variant="ghost"
                                            size="icon"
                                            type="button"
                                            onClick={() => {
                                              const updatedBreaks = shiftConfigsParams[activeConfigShift].breaks.map(b =>
                                                b.id === matchedBreak.id ? { ...b, duration: Math.max(5, b.duration - 5) } : b
                                              );
                                              setShiftConfigsParams(prev => ({
                                                ...prev,
                                                [activeConfigShift]: { ...prev[activeConfigShift], breaks: updatedBreaks }
                                              }));
                                            }}
                                            className="h-auto w-auto h-5 w-5 bg-slate-800 hover:bg-slate-700 text-amber-200 font-black rounded-md flex items-center justify-center cursor-pointer"
                                          >
                                            −
                                          </Button>
                                          <span className="font-mono font-extrabold text-amber-300 w-8 text-center">
                                            {matchedBreak.duration}m
                                          </span>
                                          <Button
                                            variant="ghost"
                                            size="icon"
                                            type="button"
                                            onClick={() => {
                                              const updatedBreaks = shiftConfigsParams[activeConfigShift].breaks.map(b =>
                                                b.id === matchedBreak.id ? { ...b, duration: b.duration + 5 } : b
                                              );
                                              setShiftConfigsParams(prev => ({
                                                ...prev,
                                                [activeConfigShift]: { ...prev[activeConfigShift], breaks: updatedBreaks }
                                              }));
                                            }}
                                            className="h-auto w-auto h-5 w-5 bg-amber-600 hover:bg-amber-500 text-white font-black rounded-md flex items-center justify-center cursor-pointer"
                                          >
                                            +
                                          </Button>
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                </div>
              </div>
            )}

            {/* ────────────────── STEP 4: REVIEW ────────────────── */}
            {campusWizardStep === 4 && (
              <div className="space-y-4 animate-fadeIn">
                <div className="pb-1 border-b border-gray-100">
                  <h4 className="text-xs font-black text-gray-800 uppercase tracking-wider">Review & Create</h4>
                </div>

                {/* Campus Info Summary */}
                <div className="bg-indigo-50/40 border border-indigo-100 rounded-xl p-4 space-y-2">
                  <div className="text-[10px] font-black text-indigo-700 uppercase tracking-wider mb-2">Campus Info</div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                    <div>
                      <div className="text-[9px] text-gray-400 uppercase font-bold">Campus Name</div>
                      <div className="text-xs font-extrabold text-gray-800">{campusForm.name || "—"}</div>
                    </div>
                    <div>
                      <div className="text-[9px] text-gray-400 uppercase font-bold">Code</div>
                      <div className="text-xs font-extrabold text-gray-800">{campusForm.code || "—"}</div>
                    </div>
                    <div>
                      <div className="text-[9px] text-gray-400 uppercase font-bold">Academic Year</div>
                      <div className="text-xs font-extrabold text-gray-800">{campusForm.academic_year || "—"}</div>
                    </div>
                    <div>
                      <div className="text-[9px] text-gray-400 uppercase font-bold">Shift Mode</div>
                      <div className="text-xs font-extrabold text-gray-800">{campusForm.has_shifts === 1 ? "Multiple Shifts" : "General Shift"}</div>
                    </div>
                    <div>
                      <div className="text-[9px] text-gray-400 uppercase font-bold">Working Days</div>
                      <div className="text-xs font-extrabold text-gray-800">{campusForm.working_days ?? 5} Days ({campusForm.working_days === 6 ? "Mon-Sat" : "Mon-Fri"})</div>
                    </div>
                    <div>
                      <div className="text-[9px] text-gray-400 uppercase font-bold">Rooms Aggregated</div>
                      <div className="text-xs font-extrabold text-gray-800">{wizardCourses.length > 0 ? "Auto-computed from courses" : campusForm.rooms || "—"}</div>
                    </div>
                    <div className="col-span-2">
                      <div className="text-[9px] text-gray-400 uppercase font-bold">Address</div>
                      <div className="text-xs font-extrabold text-gray-800">{campusForm.address || "—"}</div>
                    </div>
                    <div>
                      <div className="text-[9px] text-gray-400 uppercase font-bold">KAM</div>
                      <div className="text-xs font-extrabold text-gray-800">
                        {kamList.find((k: any) => k.id === campusForm.kam_id)?.name || "—"}
                      </div>
                    </div>
                    <div>
                      <div className="text-[9px] text-gray-400 uppercase font-bold">Campus Manager</div>
                      <div className="text-xs font-extrabold text-gray-800">
                        {camList.find((c: any) => c.id === campusForm.manager)?.name || "Not assigned"}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Courses Summary */}
                <div className="bg-slate-50 border border-slate-100 rounded-xl p-4 space-y-2">
                  <div className="text-[10px] font-black text-gray-700 uppercase tracking-wider mb-2">
                    Courses ({wizardCourses.length})
                  </div>
                  {wizardCourses.length === 0 ? (
                    <p className="text-[10px] text-gray-400 font-semibold">No courses added.</p>
                  ) : (
                    <div className="space-y-2">
                      {wizardCourses.map((c, idx) => (
                        <div key={idx} className="bg-white border border-slate-100 rounded-2xl p-3 flex items-center justify-between gap-3 shadow-card">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-extrabold text-xs text-gray-800">{c.name}</span>
                            <span className="text-[8px] font-extrabold bg-indigo-50 border border-indigo-100 text-indigo-700 px-1.5 py-0.2 rounded uppercase">
                              {c.years}Y · {c.years * 2} Sem
                            </span>
                            <span className="text-[8.5px] font-bold text-gray-600 bg-gray-50 border border-gray-200 px-1.5 py-0.5 rounded-lg">
                              Room: {c.default_room || c.room || "—"}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Shift Summary */}
                <div className="bg-slate-50 border border-slate-100 rounded-xl p-4 space-y-2">
                  <div className="text-[10px] font-black text-gray-700 uppercase tracking-wider mb-2">Shift Schedule</div>
                  {(campusForm.has_shifts === 1 ? (["shift_1", "shift_2", "general"] as const) : (["general"] as const)).map(sh => {
                    const p = shiftConfigsParams[sh];
                    const schedule = calculateShiftSchedule(p);
                    return (
                      <div key={sh} className="space-y-1">
                        <div className="text-[10px] font-extrabold text-indigo-700">{p.label}</div>
                        <div className="text-[9.5px] text-gray-600 font-bold">
                          Start: {p.startTime} · {p.periodsCount} Periods · {p.periodDuration} min/period
                          {schedule.overallEndTime && ` · Ends: ${schedule.overallEndTime}`}
                        </div>
                        {p.breaks.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {p.breaks.map(b => (
                              <span key={b.id} className="text-[8.5px] font-bold bg-amber-50 border border-amber-100 text-amber-700 px-1.5 py-0.5 rounded-lg">
                                {b.name} ({b.duration}min after P{b.afterPeriod})
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Footer Navigation */}
          <div className="flex justify-between gap-2 px-6 py-4 border-t border-gray-100 bg-gray-50/50 rounded-b-3xl shrink-0">
            <div>
              {campusWizardStep > 1 && (
                <Button
                  variant="ghost"
                  type="button"
                  onClick={() => {
                    setCampusWizardStep(campusWizardStep - 1);
                    setModalError(null);
                  }}
                  className="h-auto px-4 py-2 hover:bg-gray-100 text-gray-500 rounded-xl transition-all font-bold cursor-pointer"
                >
                  ← Back
                </Button>
              )}
            </div>
            <div className="flex gap-2">
              <Button
                variant="ghost"
                type="button"
                onClick={() => {
                  onOpenChange(false);
                  setCampusSuccessCreatedId(null);
                }}
                className="h-auto px-4 py-2 hover:bg-gray-100 text-gray-500 rounded-xl transition-all font-bold cursor-pointer"
              >
                Cancel
              </Button>
              {campusWizardStep < 4 ? (
                <Button
                  variant="ghost"
                  type="button"
                  onClick={() => {
                    setModalError(null);
                    setCampusFieldErrors({});
                    if (campusWizardStep === 1) {
                      const errs: Record<string, boolean> = {};
                      if (!campusForm.name.trim()) errs.name = true;
                      if (!campusForm.address.trim()) errs.address = true;
                      if (!campusForm.kam_id) errs.kam_id = true;
                      if (Object.keys(errs).length > 0) {
                        setCampusFieldErrors(errs);
                        setModalError("Please fill in all required fields highlighted in red.");
                        return;
                      }
                      if (!campusForm.code?.trim()) {
                        setCampusForm(prev => ({ ...prev, code: generateCampusCode(prev.name) }));
                      }
                    }
                    if (campusWizardStep === 2 && wizardCourses.length === 0) {
                      setModalError("Please add at least one course before continuing.");
                      return;
                    }
                    if (campusWizardStep === 3) {
                      if (campusForm.has_shifts === 1) {
                        if (!shiftConfigsParams.shift_1.breaks || shiftConfigsParams.shift_1.breaks.length === 0) {
                          setShiftConfigsParams(prev => ({
                            ...prev,
                            shift_1: { ...prev.shift_1, breaks: [{ id: "b1", name: "Tea Break", afterPeriod: 2, duration: 15 }] }
                          }));
                        }
                        if (!shiftConfigsParams.shift_2.breaks || shiftConfigsParams.shift_2.breaks.length === 0) {
                          setShiftConfigsParams(prev => ({
                            ...prev,
                            shift_2: { ...prev.shift_2, breaks: [{ id: "b1", name: "Tea Break", afterPeriod: 2, duration: 15 }] }
                          }));
                        }
                      } else {
                        if (!shiftConfigsParams.general.breaks || shiftConfigsParams.general.breaks.length === 0) {
                          setShiftConfigsParams(prev => ({
                            ...prev,
                            general: { ...prev.general, breaks: [{ id: "b1", name: "Break", afterPeriod: 2, duration: 15 }] }
                          }));
                        }
                      }
                    }
                    setCampusWizardStep(campusWizardStep + 1);
                  }}
                  className="h-auto btn-gradient px-5 py-2 text-white rounded-xl shadow-sm transition-all font-bold cursor-pointer"
                >
                  Next Step →
                </Button>
              ) : (
                <LoadingButton
                  type="submit"
                  isLoading={modalBusy}
                  loadingText={editingCampus ? "Saving..." : "Creating..."}
                  variant="gradient"
                  className="px-5 py-2 text-white rounded-xl shadow-sm transition-all font-bold cursor-pointer"
                >
                  {editingCampus ? "Save Changes" : "Yes Create Campus"}
                </LoadingButton>
              )}
            </div>
          </div>
        </form>
      )}
    </Dialog>
  );
};

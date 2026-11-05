"use client";

import React, { useState, useEffect, useMemo } from "react";
import dynamic from "next/dynamic";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useApp, SHIFT_TIME_SLOTS, Slot, Mentor, AuditLog, College, Subject, Department } from "@/context/AppContext";
import { useToast } from "@/context/ToastContext";
import { AdminSidebar, type AdminNavGroup } from "@/components/admin/AdminSidebar";
import { PageHeader } from "@/components/ui/PageHeader";
import { apiFetch } from "@/lib/apiFetch";
import { qk } from "@/lib/queryKeys";
import { getCurrentAcademicYear, getAcademicYearOptions } from "@/lib/academicYear";
import { DEFAULT_SHIFT_CONFIGS } from "@/lib/shiftDefaults";
import { ALL_SEMESTERS } from "@/lib/semesters";
import { generateId } from "@/lib/id";
import {
    Building2,
    Users,
    Grid,
    History,
    Search,
    MapPin,
    Clock,
    Network,
    Briefcase,
    ShieldAlert,
    ShieldCheck,
    ChevronRight,
    ChevronDown,
    Layers,
    GraduationCap,
    Plus,
    Edit,
    Edit2,
    Trash2,
    X,
    Eye,
    UserCheck,
    Megaphone,
    GripVertical,
    Calendar,
    CalendarDays,
    LayoutDashboard,
    BookOpen,
    Menu,
    Sparkles,
    Sun,
    Moon,
    Upload,
    Download,
    FileSpreadsheet,
    AlertTriangle,
    Loader2,
    Mail,
    Send,
    Sliders,
    Power,
    CheckCircle2,
    EyeOff,
    Copy,
    Check,
    RefreshCw,
    Lock,
    Unlock,
    MessageSquare,
    Phone,
    Tag,
    Filter,
    CheckCircle,
    User,
    CornerDownRight
} from "lucide-react";
import { formatDate, formatTimeLabel, isMentorInProgram, getDeptFromClassGroup, calculateShiftSchedule, parseTimeToMinutes, formatMinutesToTime, ScheduleItem, ShiftParams, ShiftBreak, isDeptSubjectMatch, isSameYear, isSameSemester, normalizeRoleValue, formatRoleLabel } from "@/lib/utils";
import { MentorProfileModal } from "./MentorProfileModal";
import { CourseInfoButton } from "./CourseInfoModal";
import { CourseModal } from "./CourseModal";
import { LoadingButton } from "./ui/LoadingButton";
import { Pagination } from "@/components/ui/Pagination";
import { TableSurface } from "@/components/dashboard/TableSurface";
import { usePagination } from "@/hooks/usePagination";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetBody } from "@/components/ui/sheet";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
// Lazy-loaded: CAMDashboard is a huge module only needed for the campus drill-down.
// Keeps it out of the admin bundle so the dashboard paints fast.
const OversightHub = dynamic(() => import("./admin/OversightHub").then(m => m.OversightHub), {
    ssr: false,
    loading: () => (
        <div className="flex-1 flex items-center justify-center p-16 text-slate-400 font-bold text-sm">
            <div className="flex items-center gap-2">
                <span className="h-4 w-4 rounded-full border-2 border-indigo-600 border-t-transparent animate-spin" />
                <span>Loading Oversight Hub…</span>
            </div>
        </div>
    )
});

const CAMDashboard = dynamic(() => import("./CAMDashboard").then(m => m.CAMDashboard), {
    ssr: false,
    loading: () => (
        <div className="flex-1 flex items-center justify-center p-16 text-slate-400 font-bold text-sm">
            <div className="flex items-center gap-2">
                <span className="h-4 w-4 rounded-full border-2 border-indigo-600 border-t-transparent animate-spin" />
                <span>Loading Campus Console…</span>
            </div>
        </div>
    )
});

export const generateCampusCode = (name: string): string => {
    if (!name || !name.trim()) return "";
    const stopwords = new Set(["of", "and", "the", "for", "in", "at", "&", "to", "a", "an"]);
    const rawWords = name.trim().replace(/[^a-zA-Z0-9\s-]/g, " ").split(/[\s-]+/).filter(Boolean);
    const words = rawWords.filter(w => !stopwords.has(w.toLowerCase()));
    const list = words.length > 0 ? words : rawWords;

    if (list.length === 1) {
        return list[0].substring(0, 6).toUpperCase();
    }

    // Preserve words that are already uppercase acronyms (e.g. "FP", "IIT", "SRM")
    const parts = list.map(w => {
        if (w.length <= 4 && w === w.toUpperCase() && /^[A-Z0-9]+$/.test(w)) {
            return w;
        }
        return w[0].toUpperCase();
    });

    const combined = parts.join("");
    if (combined.length >= 2 && combined.length <= 8) {
        return combined;
    }

    return combined.substring(0, 8);
};

const generateCodeFromName = (name: string): string => {
    if (!name || typeof name !== 'string') return "";
    const words = name.replace(/with|and|for/gi, "").split(/\s+/).filter(Boolean);
    let code = words.map(w => {
        const cleanWord = w.replace(/[^a-zA-Z0-9]/g, "");
        if (!cleanWord) return "";
        if (/^\d+$/.test(cleanWord)) return cleanWord;
        const lower = cleanWord.toLowerCase();
        if (lower === "bsc") return "BSC";
        if (lower === "bba") return "BBA";
        if (lower === "bcom") return "BCOM";
        if (lower === "bca") return "BCA";
        const match = cleanWord.match(/^([a-zA-Z]+)(\d+)$/);
        if (match) return match[1][0].toUpperCase() + match[2];
        return cleanWord[0].toUpperCase();
    }).filter(Boolean).join("-");
    return code || "";
};

const formatYearWiseRooms = (defaultRoomStr?: string) => {
    if (!defaultRoomStr) return "None";
    if (!defaultRoomStr.startsWith("{")) return defaultRoomStr;
    try {
        const parsed = JSON.parse(defaultRoomStr);
        return Object.keys(parsed)
            .map(year => `Year ${year}: ${parsed[year]}`)
            .join(", ");
    } catch (_) {
        return defaultRoomStr;
    }
};

interface CAMUserFromDB {
    id: string;
    name: string;
    email: string;
    college_id: string;
    college_name: string;
    kam_id: string;
}

interface KAMUserFromDB {
    id: string;
    name: string;
    email: string;
    title: string;
}


export interface AdminDashboardProps {
    activeTab?: "overview" | "campuses" | "kams" | "cams" | "mentors" | "subjects" | "schedules" | "monitoring" | "oversight" | "hierarchy" | "logs" | "feedback" | "courses" | "announcements" | "holidays" | "sessions" | "users" | "smes" | "settings" | "more_menu";
    onTabChange?: (tab: "overview" | "campuses" | "kams" | "cams" | "mentors" | "subjects" | "schedules" | "monitoring" | "oversight" | "hierarchy" | "logs" | "feedback" | "courses" | "announcements" | "holidays" | "sessions" | "users" | "smes" | "settings" | "more_menu") => void;
}


const ADMIN_NAV_GROUPS: AdminNavGroup[] = [
    {
        title: "Dashboard",
        icon: LayoutDashboard,
        items: [
            { id: "overview", label: "Overview", icon: LayoutDashboard }
        ]
    },
    {
        title: "Organization",
        icon: Building2,
        items: [
            { id: "campuses", label: "Campuses", icon: Building2 },
            { id: "courses", label: "Courses", icon: Network },
            { id: "subjects", label: "Subjects", icon: GraduationCap },
            { id: "hierarchy", label: "Hierarchy", icon: Network }
        ]
    },
    {
        title: "People",
        icon: Users,
        items: [
            { id: "kams", label: "Key Account Managers", icon: Briefcase },
            { id: "cams", label: "Campus Managers", icon: Users },
            { id: "mentors", label: "Faculty Mentors", icon: UserCheck },
            { id: "smes", label: "Subject Matter Experts", icon: BookOpen },
            { id: "users", label: "User Credentials", icon: ShieldCheck }
        ]
    },
    {
        title: "Operations",
        icon: Grid,
        items: [
            { id: "schedules", label: "Schedules", icon: Grid },
            { id: "oversight", label: "Oversight Hub", icon: Eye },
            { id: "monitoring", label: "Attendance Monitoring", icon: Clock },
            { id: "holidays", label: "Holidays", icon: Calendar },
            { id: "announcements", label: "Announcements", icon: Megaphone }
        ]
    },
    {
        title: "System",
        icon: History,
        items: [
            { id: "settings", label: "Email Controls & Settings", icon: Sliders },
            { id: "sessions", label: "Login Sessions", icon: History },
            { id: "feedback", label: "User Feedback", icon: MessageSquare },
            { id: "logs", label: "Audit Logs", icon: History }
        ]
    }
];

// The sidebar groups are the only list of admin destinations; the tab guard and
// the mobile "More" list are derived so a new tab cannot drift out of sync.
const ADMIN_TAB_IDS: string[] = [...ADMIN_NAV_GROUPS.flatMap(g => g.items.map(i => i.id)), "more_menu"];
const MOBILE_PRIMARY_TAB_IDS = ["overview", "campuses", "mentors", "schedules"];
const MOBILE_MORE_TAB_IDS = ADMIN_TAB_IDS.filter(
    id => id !== "more_menu" && !MOBILE_PRIMARY_TAB_IDS.includes(id)
);

export const AdminDashboard: React.FC<AdminDashboardProps> = ({
    activeTab: propActiveTab,
    onTabChange
}) => {
    const {
        currentAdmin,
        colleges,
        mentors,
        students,
        slots,
        auditLogs,
        subjectsList,
        studentAttendance,
        setStudentAttendance,
        createCollege,
        updateCollege,
        deleteCollege,
        createKAM,
        updateKAM,
        deleteKAM,
        createCAM,
        updateCAM,
        deleteCAM,
        createMentor,
        bulkImportMentors,
        updateMentor,
        deleteMentor,
        createSubject,
        updateSubject,
        deleteSubject,
        coursesList,
        createCourse,
        updateCourse,
        deleteCourse,
        refreshData,
        subjectGroups,
        createSubjectGroup,
        updateSubjectGroup,
        deleteSubjectGroup,
        smes,
        createSmeUser,
        updateSmeUser,
        deleteSmeUser,
        signupRequests,
        approveSignupRequest,
        rejectSignupRequest,
        deleteSignupRequest,
        refreshAttendance,
        holidays: contextHolidays
    } = useApp();
    const { toast, confirm: showConfirm } = useToast();
    const queryClient = useQueryClient();

    const [localActiveTab, setLocalActiveTab] = useState<"overview" | "campuses" | "kams" | "cams" | "mentors" | "subjects" | "schedules" | "monitoring" | "oversight" | "hierarchy" | "logs" | "feedback" | "courses" | "announcements" | "holidays" | "sessions" | "users" | "smes" | "settings" | "more_menu">("overview");
    // Notification deep links use feature-oriented slugs that differ from the admin tab ids.
    const adminTabAliases: Record<string, string> = {
        schedule: "schedules",
        attendance: "monitoring",
        audit: "logs",
        audit_logs: "logs",
        credentials: "users",
        settings: "settings",
        holidays: "holidays",
        announcements: "announcements",
        approvals: "oversight",
        interviews: "oversight",
        exams: "campuses"
    };
    // Unrecognised slugs fall back to the dashboard instead of rendering an empty workspace.
    const resolvedPropTab = (() => {
        if (!propActiveTab) return undefined;
        const mapped: string = adminTabAliases[propActiveTab] || propActiveTab;
        return ADMIN_TAB_IDS.includes(mapped) ? mapped : undefined;
    })();
    const activeTab = (resolvedPropTab || localActiveTab) as typeof localActiveTab;
    const setActiveTab = onTabChange || setLocalActiveTab;


    const [isCollapsed, setIsCollapsed] = useState(false);
    useEffect(() => {
        if (typeof window !== "undefined") {
            const stored = localStorage.getItem("fp_sidebar_collapsed") === "true";
            setIsCollapsed(stored);
        }
    }, []);
    const [drillDownCollegeId, setDrillDownCollegeId] = useState<string | null>(null);
    const [loadingActions, setLoadingActions] = useState<Record<string, boolean>>({});
    const setActionLoading = (key: string, loading: boolean) => {
        setLoadingActions(prev => ({ ...prev, [key]: loading }));
    };

    // New features relational lists (queries live next to their fetch definitions below)
    // holidays come from AppContext (already loaded by the global data fetch)
    const holidays = contextHolidays;
    const [notifications, setNotifications] = useState<any[]>([]);

    // ── User Feedback viewer (Admin → User Feedback) ─────────────────────────
    const [feedbackSearch, setFeedbackSearch] = useState("");
    const [feedbackStatusFilter, setFeedbackStatusFilter] = useState<"all" | "pending" | "resolved" | "closed">("all");
    const [feedbackTypeFilter, setFeedbackTypeFilter] = useState<string>("all");
    const [feedbackStatusUpdating, setFeedbackStatusUpdating] = useState<string | null>(null);
    const [resolvingReport, setResolvingReport] = useState<any | null>(null);
    const [resolutionNote, setResolutionNote] = useState<string>("");

    // Global System Settings & Mailing Control State
    const settingsQuery = useQuery({
        queryKey: qk.systemSettings(),
        queryFn: async () => {
            const data = await apiFetch("/api/settings");
            return (data?.success && data.settings ? data.settings : {}) as { mailing_enabled: boolean; attendance_lock_enabled: boolean;[key: string]: any };
        },
        placeholderData: { mailing_enabled: true, attendance_lock_enabled: true },
    });
    const systemSettings = settingsQuery.data || { mailing_enabled: true, attendance_lock_enabled: true };
    const [isUpdatingSettings, setIsUpdatingSettings] = useState(false);

    // ── Clear Attendance by Date Range ──────────────────────────────────────
    const [clearAttStartDate, setClearAttStartDate] = useState("");
    const [clearAttEndDate, setClearAttEndDate] = useState("");
    const [clearAttCollegeId, setClearAttCollegeId] = useState("all");
    const [clearAttDept, setClearAttDept] = useState("all");
    const [clearAttClassGroup, setClearAttClassGroup] = useState("all");
    const [isClearingAtt, setIsClearingAtt] = useState(false);
    const [clearAttPreviewCount, setClearAttPreviewCount] = useState<number | null>(null);
    const [isFetchingPreview, setIsFetchingPreview] = useState(false);

    const fetchClearAttPreview = async () => {
        if (!clearAttStartDate || !clearAttEndDate) return;
        setIsFetchingPreview(true);
        setClearAttPreviewCount(null);
        try {
            // ROLE_UI_AUDIT A1 (P1): build ONE canonical param set and use it for both
            // preview and delete — the old preview fetch ignored department/classGroup
            // filters, so the count could disagree with what DELETE would remove.
            const params = new URLSearchParams({ startDate: clearAttStartDate, endDate: clearAttEndDate });
            if (clearAttCollegeId && clearAttCollegeId !== "all") params.set("collegeId", clearAttCollegeId);
            if (clearAttDept && clearAttDept !== "all") params.set("department", clearAttDept);
            if (clearAttClassGroup && clearAttClassGroup !== "all") params.set("classGroup", clearAttClassGroup);
            const res = await fetch(`/api/attendance?${params.toString()}`);
            const data = await res.json();
            if (data.success) {
                setClearAttPreviewCount(data.count ?? (data.records?.length ?? 0));
            }
        } catch { /* preview is non-critical */ } finally {
            setIsFetchingPreview(false);
        }
    };

    const handleClearAttendanceByRange = async () => {
        if (!clearAttStartDate || !clearAttEndDate) {
            toast("Please select both a start and end date.", "warning");
            return;
        }
        if (clearAttStartDate > clearAttEndDate) {
            toast("Start date cannot be after end date.", "error");
            return;
        }
        const scopeLabel = clearAttCollegeId !== "all"
            ? `for campus: ${colleges.find(c => c.id === clearAttCollegeId)?.name || clearAttCollegeId}`
            : "across ALL campuses";
        const deptLabel = clearAttDept !== "all" ? `, department: ${clearAttDept}` : "";
        const batchLabel = clearAttClassGroup !== "all" ? `, batch: ${clearAttClassGroup}` : "";
        const confirmed = await showConfirm({
            title: "Clear Attendance Records",
            message: `This will permanently delete all attendance records from ${clearAttStartDate} to ${clearAttEndDate} ${scopeLabel}${deptLabel}${batchLabel}.\n\nThis action cannot be undone.`,
            danger: true,
            confirmLabel: "Clear Attendance"
        });
        if (!confirmed) return;
        setIsClearingAtt(true);
        try {
            const params = new URLSearchParams({ startDate: clearAttStartDate, endDate: clearAttEndDate });
            if (clearAttCollegeId !== "all") params.set("collegeId", clearAttCollegeId);
            if (clearAttDept !== "all") params.set("department", clearAttDept);
            if (clearAttClassGroup !== "all") params.set("classGroup", clearAttClassGroup);
            const res = await fetch(`/api/attendance?${params.toString()}`, { method: "DELETE" });
            const data = await res.json();
            if (data.success) {
                toast(`Cleared ${data.deletedCount ?? 0} attendance record(s) from ${clearAttStartDate} to ${clearAttEndDate}.`, "success");
                setClearAttPreviewCount(null);
                // DATA_FLOW_AUDIT D10: refetch attendance from the server instead of a
                // client-side surgical filter — the old filter couldn't match students
                // missing from the (LIMITed) students array, leaving ghost records on screen.
                await refreshAttendance(clearAttCollegeId !== "all" ? clearAttCollegeId : undefined);
            } else {
                toast(data.message || "Failed to clear attendance.", "error");
            }
        } catch (err: any) {
            toast(err.message || "An error occurred.", "error");
        } finally {
            setIsClearingAtt(false);
        }
    };

    const handleToggleMailing = async (newValue: boolean) => {
        setIsUpdatingSettings(true);
        try {
            const res = await fetch("/api/settings", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    key: "mailing_enabled",
                    value: newValue,
                    updatedBy: currentAdmin?.name || "Admin"
                })
            });
            const data = await res.json();
            if (data.success) {
                queryClient.setQueryData(qk.systemSettings(), (prev: any) => ({ ...(prev || {}), mailing_enabled: newValue }));
                toast(
                    newValue
                        ? "Global Email Delivery ENABLED (Active). Outbound transactional emails active."
                        : "Global Email Delivery DISABLED (OFF). Outbound emails are paused.",
                    newValue ? "success" : "warning"
                );
            } else {
                toast(data.message || "Failed to update setting.", "error");
            }
        } catch (err: any) {
            toast(err.message || "Error updating setting.", "error");
        } finally {
            setIsUpdatingSettings(false);
        }
    };

    const handleToggleAttendanceLock = async (newValue: boolean) => {
        setIsUpdatingSettings(true);
        try {
            const res = await fetch("/api/settings", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    key: "attendance_lock_enabled",
                    value: newValue,
                    updatedBy: currentAdmin?.name || "Admin"
                })
            });
            const data = await res.json();
            if (data.success) {
                queryClient.setQueryData(qk.systemSettings(), (prev: any) => ({ ...(prev || {}), attendance_lock_enabled: newValue }));
                toast(
                    newValue
                        ? "Attendance Marking Lock ENABLED (Strict Mode). Past/ended periods are locked."
                        : "Attendance Marking Lock DISABLED (Flexible Mode). Mentors can freely mark and update past attendance.",
                    newValue ? "success" : "warning"
                );
            } else {
                toast(data.message || "Failed to update setting.", "error");
            }
        } catch (err: any) {
            toast(err.message || "Error updating setting.", "error");
        } finally {
            setIsUpdatingSettings(false);
        }
    };



    // User tab sub-navigation & Signup approval modal states
    const [userSubTab, setUserSubTab] = useState<"directory" | "signups">("directory");
    const [showApprovalModal, setShowApprovalModal] = useState(false);
    const [approvingSignup, setApprovingSignup] = useState<any | null>(null);
    const [mappingType, setMappingType] = useState<"create_new" | "link_existing">("create_new");
    const [selectedReferenceId, setSelectedReferenceId] = useState("");
    const [mappingCollegeId, setMappingCollegeId] = useState("");
    const [mappingDept, setMappingDept] = useState("");
    const [mappingClassGroup, setMappingClassGroup] = useState("");
    const [approvingRole, setApprovingRole] = useState("student");

    // Faculty Bulk Import State
    const [templateCollegeId, setTemplateCollegeId] = useState<string>("");
    const [showFacultyImportModal, setShowFacultyImportModal] = useState(false);
    const [facultyImportPreview, setFacultyImportPreview] = useState<{ parsed: any[]; warnings: string[] } | null>(null);
    const [isImportingFaculty, setIsImportingFaculty] = useState(false);
    const [subjectStaffSearch, setSubjectStaffSearch] = useState("");

    useEffect(() => {
        if (colleges.length > 0 && !templateCollegeId) {
            setTemplateCollegeId(colleges[0].id);
        }
    }, [colleges]);

    const isCampusShiftBased = useMemo(() => {
        const targetColId = templateCollegeId || (colleges.length > 0 ? colleges[0].id : "");
        const relevantCourses = coursesList.filter(c => !targetColId || c.college_id === targetColId);
        return relevantCourses.some(c => c.shift_based === 1 || (c.default_shift && c.default_shift !== "general"));
    }, [coursesList, templateCollegeId, colleges]);

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

        const campusClasses = Array.from(new Set((students || [])
            .filter(s => !targetCollegeId || s.college_id === targetCollegeId)
            .map(s => s.classGroup)
            .filter(Boolean)));
        const sampleClass1 = campusClasses.slice(0, 2).join(", ") || "Year 2 Section A, Year 3 Section B";
        const sampleClass2 = campusClasses.slice(2, 3).join(", ") || campusClasses[0] || "Year 1 Section A";

        // Sheet 1: Faculty Directory
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

        // Sheet 2: Timetable Mapping Guide
        const mappingGuide = [
            {
                "Guide": "Department Options",
                "Allowed Values": deptOptions.join(", ") || "General"
            },
            {
                "Guide": "Shift Options",
                "Allowed Values": "Shift 1, Shift 2, General Shift"
            },
            {
                "Guide": "Assigned Subjects",
                "Allowed Values": "Comma-separated subject names matching course curriculum"
            },
            {
                "Guide": "Assigned Classes",
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
        reader.onload = async (evt) => {
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
                    const shift = row.shift || row.Shift || row["Shift"] || "shift_1";
                    const collegeId = row.college_id || row.collegeId || row["College ID"] || templateCollegeId || colleges[0]?.id || "";
                    const subjects = row.subjects || row.Subjects || row["Subjects"] || row["Assigned Subjects"] || "";
                    const classes = row.classes || row.Classes || row["Classes"] || row["Assigned Classes"] || "";

                    if (!name) warnings.push(`Row ${idx + 2}: Missing Faculty Name.`);
                    if (!email) warnings.push(`Row ${idx + 2}: Missing Email Address.`);

                    return {
                        name: String(name).trim(),
                        email: String(email).toLowerCase().trim(),
                        department: String(dept).trim(),
                        shift: String(shift).toLowerCase().includes("2") ? "shift_2" : String(shift).toLowerCase().includes("gen") ? "general" : "shift_1",
                        college_id: collegeId,
                        subjects: String(subjects).trim(),
                        classes: String(classes).trim(),
                        avatar: ""
                    };
                }).filter(f => f.name || f.email);

                setFacultyImportPreview({ parsed: parsedFaculty, warnings });
                setShowFacultyImportModal(true);
            } catch (err: any) {
                toast("Failed to parse Excel file: " + err.message, "error");
            }
        };
        reader.readAsBinaryString(file);
        e.target.value = "";
    };

    const handleConfirmFacultyImport = async () => {
        if (!facultyImportPreview || facultyImportPreview.parsed.length === 0) return;
        setIsImportingFaculty(true);
        try {
            const res = await bulkImportMentors(facultyImportPreview.parsed);
            if (res.success) {
                toast(res.message || `Successfully imported ${res.count} faculty members.`, "success");
                setShowFacultyImportModal(false);
                setFacultyImportPreview(null);
                // bulkImportMentors already surgically updates mentors state — no refreshData needed
            } else {
                toast(res.message || "Failed to import faculty.", "error");
            }
        } catch (err: any) {
            toast("Error importing faculty: " + err.message, "error");
        } finally {
            setIsImportingFaculty(false);
        }
    };

    // Announcement compose modal state
    const [showAnnModal, setShowAnnModal] = useState(false);
    const [annForm, setAnnForm] = useState({ title: "", description: "", target_role: "All", college_id: "" });

    // Holiday compose modal state
    const [showHolModal, setShowHolModal] = useState(false);
    const [holForm, setHolForm] = useState({ title: "", date: "", type: "National Holiday", college_id: "" });

    // Stats from custom DB fetch
    const [isDataLoading, setIsDataLoading] = useState(true);

    // Modal states
    const [showCampusModal, setShowCampusModal] = useState(false);
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
    const [wizardCourses, setWizardCourses] = useState<any[]>([]);
    const [wizardCourseForm, setWizardCourseForm] = useState<{
        name: string;
        years: number;
        sections: Record<number, number>;
        sectionRooms: Record<string, string>;
        default_shift: string;
        start_date: string;
        end_date: string;
        start_year: string;
        end_year: string;
        description: string;
    }>({
        name: "",
        years: 3,
        sections: { 1: 1, 2: 1, 3: 1, 4: 1, 5: 1 },
        sectionRooms: {},
        default_shift: "general",
        start_date: "",
        end_date: "",
        start_year: "",
        end_year: "",
        description: ""
    });
    const [editingWizardCourseIndex, setEditingWizardCourseIndex] = useState<number | null>(null);
    const [editingRooms, setEditingRooms] = useState<Record<string, string>>({});
    const [draggedBreakId, setDraggedBreakId] = useState<string | null>(null);
    const [showClockPresets, setShowClockPresets] = useState<boolean>(false);
    const [editingPeriodNum, setEditingPeriodNum] = useState<number | null>(null);
    const [draftLastSaved, setDraftLastSaved] = useState<string | null>(null);
    const [hasRestoredDraft, setHasRestoredDraft] = useState<boolean>(false);
    const [shift1Timings, setShift1Timings] = useState("");
    const [shift2Timings, setShift2Timings] = useState("");
    const [generalTimings, setGeneralTimings] = useState("");
    const [isDeptSubmitting, setIsDeptSubmitting] = useState<boolean>(false);

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

    const [showKamModal, setShowKamModal] = useState(false);
    const [kamForm, setKamForm] = useState<{ id: string; name: string; email: string; title: string }>({ id: "", name: "", email: "", title: "" });
    const [editingKam, setEditingKam] = useState<boolean>(false);

    const [showCamModal, setShowCamModal] = useState(false);
    const [camForm, setCamForm] = useState<{ id: string; name: string; email: string; college_id: string; kam_id: string }>({ id: "", name: "", email: "", college_id: "", kam_id: "" });
    const [editingCam, setEditingCam] = useState<boolean>(false);

    // Department CRUD states
    const [showDeptModal, setShowDeptModal] = useState(false);
    const [deptForm, setDeptForm] = useState<{
        id: string;
        name: string;
        college_id?: string;
        code?: string;
        description?: string;
        status?: string;
        years?: number;
        start_date?: string;
        end_date?: string;
        start_year?: string;
        end_year?: string;
        default_room?: string;
        default_shift?: string;
        sections?: string;
    }>({
        id: "",
        name: "",
        college_id: "",
        code: "",
        description: "",
        status: "Active",
        years: 4,
        start_date: "",
        end_date: "",
        start_year: "",
        end_year: "",
        default_room: "",
        default_shift: "general",
        sections: ""
    });
    const [editingDept, setEditingDept] = useState<boolean>(false);
    const [newDeptNames, setNewDeptNames] = useState<Record<string, string>>({});
    // Readers treat a missing key as expanded, so seeding the two demo campus ids here
    // only made the state look campus-specific.
    const [expandedColleges, setExpandedColleges] = useState<Record<string, boolean>>({});

    // SME CRUD states
    const [showSmeModal, setShowSmeModal] = useState(false);
    const [isEditingSme, setIsEditingSme] = useState(false);
    const [smeForm, setSmeForm] = useState<{
        id: string;
        name: string;
        email: string;
        subject: string;
    }>({
        id: "",
        name: "",
        email: "",
        subject: ""
    });

    // Mentor CRUD states
    const [showMentorModal, setShowMentorModal] = useState(false);
    const [mentorForm, setMentorForm] = useState<{
        id: string;
        name: string;
        email: string;
        mentor_group: string;
        avatar: string;
        subjects: string;
        classes: string;
        college_id: string;
    }>({
        id: "",
        name: "",
        email: "",
        mentor_group: "",
        avatar: "",
        subjects: "",
        classes: "",
        college_id: "",
    });
    const [editingMentor, setEditingMentor] = useState<boolean>(false);
    const [mentorSubjectSearch, setMentorSubjectSearch] = useState("");
    // Mentor Profile states
    const [selectedProfileMentor, setSelectedProfileMentor] = useState<Mentor | null>(null);
    const [isProfileOpen, setIsProfileOpen] = useState(false);

    // Subject CRUD states
    const [showSubjectModal, setShowSubjectModal] = useState(false);
    const [subjectForm, setSubjectForm] = useState<{
        id: string;
        name: string;
        department: string;
        semester: string;
        type: string;
        college_id: string;
        year: string;
        weekly_hours: number;
        mentorIds: string[];
        mentor_group: string;
    }>({
        id: "",
        name: "",
        department: "",
        semester: "Semester 1",
        type: "theory",
        college_id: "",
        year: "Year 1",
        weekly_hours: 4,
        mentorIds: [],
        mentor_group: "General"
    });
    const [editingSubject, setEditingSubject] = useState<any>(null);

    // Department expand & view states
    const [expandedDepts, setExpandedDepts] = useState<Record<string, boolean>>({});
    const [expandedDeptYears, setExpandedDeptYears] = useState<Record<string, boolean>>({});
    const [subjectCollegeFilter, setSubjectCollegeFilter] = useState("all");
    const [subjectSemesterFilter, setSubjectSemesterFilter] = useState("all");
    const [lockDeptAndYear, setLockDeptAndYear] = useState(false);
    const [subjectsSubTab, setSubjectsSubTab] = useState<"catalog" | "groups">("catalog");
    const [showGroupModal, setShowGroupModal] = useState(false);
    const [groupForm, setGroupForm] = useState<{ id: string; name: string; description: string; lead_sme_id: string; lead_sme_name: string; subjectIds: string[]; mentorIds: string[] }>({
        id: "",
        name: "",
        description: "",
        lead_sme_id: "",
        lead_sme_name: "",
        subjectIds: [],
        mentorIds: []
    });
    const [editingGroup, setEditingGroup] = useState<any>(null);
    const [groupSubjectSearch, setGroupSubjectSearch] = useState("");
    const [groupMentorSearch, setGroupMentorSearch] = useState("");

    const toggleDeptYear = (deptId: string, year: string) => {
        const key = `${deptId}_${year}`;
        setExpandedDeptYears(prev => ({
            ...prev,
            [key]: !prev[key]
        }));
    };

    const [modalError, setModalError] = useState<string | null>(null);
    // Shared busy flag for modal submit buttons that had none (campus, mentor,
    // subject, announcement, group) — prevents double submits and shows a spinner.
    const [modalBusy, setModalBusy] = useState(false);

    // Search & Filter States — one per list so filters never leak across tabs.
    const [searchQuery, setSearchQuery] = useState("");
    const [mentorSearchQuery, setMentorSearchQuery] = useState("");
    const [mentorCollegeFilter, setMentorCollegeFilter] = useState("all");
    const [subjectSearchQuery, setSubjectSearchQuery] = useState("");
    const [scheduleSearchQuery, setScheduleSearchQuery] = useState("");
    const [logsSearchQuery, setLogsSearchQuery] = useState("");
    const [collegeFilter, setCollegeFilter] = useState("all");
    const [dayFilter, setDayFilter] = useState("all");
    const [shiftFilter, setShiftFilter] = useState("all");

    // ── Attendance Monitoring (native Admin data table) ────────────────────
    const todayStr = new Date().toISOString().slice(0, 10);
    const [attStartDate, setAttStartDate] = useState(() => {
        const d = new Date(); d.setDate(d.getDate() - 30);
        return d.toISOString().slice(0, 10);
    });
    const [attEndDate, setAttEndDate] = useState(todayStr);
    const [attCollegeFilter, setAttCollegeFilter] = useState("all");
    const [attDeptFilter, setAttDeptFilter] = useState("all");
    const [attBatchFilter, setAttBatchFilter] = useState("all");
    const [attSearch, setAttSearch] = useState("");
    const [attSort, setAttSort] = useState<{ key: "name" | "pct" | "present" | "absent" | "total"; dir: "asc" | "desc" }>({ key: "pct", dir: "asc" });
    const [isExportingAtt, setIsExportingAtt] = useState(false);

    // Per-tab loading state — populated after the fetch functions are declared below.

    // College-scoped department & batch options for the monitoring filters
    const attDeptOptions = useMemo(() => {
        const set = new Set<string>();
        students.filter(s => attCollegeFilter === "all" || s.college_id === attCollegeFilter).forEach(s => { if (s.department) set.add(s.department); });
        return Array.from(set).sort();
    }, [students, attCollegeFilter]);
    const attBatchOptions = useMemo(() => {
        const set = new Set<string>();
        students.filter(s => (attCollegeFilter === "all" || s.college_id === attCollegeFilter) && (attDeptFilter === "all" || s.department === attDeptFilter)).forEach(s => { if (s.classGroup) set.add(s.classGroup); });
        return Array.from(set).sort();
    }, [students, attCollegeFilter, attDeptFilter]);

    // Students matching the current filter selections
    const attFilteredStudents = useMemo(() => {
        const q = attSearch.trim().toLowerCase();
        return students.filter(s =>
            (attCollegeFilter === "all" || s.college_id === attCollegeFilter) &&
            (attDeptFilter === "all" || s.department === attDeptFilter) &&
            (attBatchFilter === "all" || s.classGroup === attBatchFilter) &&
            (!q || s.name.toLowerCase().includes(q) || (s.roll_number || "").toLowerCase().includes(q) || (s.register_number || "").toLowerCase().includes(q))
        );
    }, [students, attCollegeFilter, attDeptFilter, attBatchFilter, attSearch]);

    // Per-student attendance aggregation for the selected date window
    const attRows = useMemo(() => {
        const byStudent = new Map<string, { present: number; absent: number }>();
        for (const rec of studentAttendance) {
            if (!rec.dateStr) continue;
            if (attStartDate && rec.dateStr < attStartDate) continue;
            if (attEndDate && rec.dateStr > attEndDate) continue;
            const agg = byStudent.get(rec.studentId) || { present: 0, absent: 0 };
            if (rec.status === "absent") agg.absent += 1;
            else if (rec.status === "present" || rec.status === "late" || rec.status === "od") agg.present += 1;
            byStudent.set(rec.studentId, agg);
        }
        const studentMap = new Map(students.map(s => [s.id, s]));
        const collegeMap = new Map(colleges.map(c => [c.id, c.name]));
        const rows = attFilteredStudents.filter(s => byStudent.has(s.id)).map(s => {
            const agg = byStudent.get(s.id)!;
            const total = agg.present + agg.absent;
            return {
                student: s,
                campus: collegeMap.get(s.college_id || "") || "—",
                present: agg.present,
                absent: agg.absent,
                total,
                pct: total > 0 ? Math.round((agg.present / total) * 100) : 0,
            };
        });
        const dir = attSort.dir === "asc" ? 1 : -1;
        rows.sort((a, b) => {
            switch (attSort.key) {
                case "name": return a.student.name.localeCompare(b.student.name) * dir;
                case "present": return (a.present - b.present) * dir;
                case "absent": return (a.absent - b.absent) * dir;
                case "total": return (a.total - b.total) * dir;
                case "pct":
                default: return (a.pct - b.pct) * dir;
            }
        });
        return rows;
    }, [studentAttendance, students, colleges, attFilteredStudents, attStartDate, attEndDate, attSort]);

    // Summary stats for the stat cards
    const attStats = useMemo(() => {
        const withData = attRows;
        const onTrack = withData.filter(r => r.pct >= 75).length;
        const atRisk = withData.filter(r => r.pct >= 65 && r.pct < 75).length;
        const critical = withData.filter(r => r.pct < 65).length;
        const avg = withData.length > 0 ? Math.round(withData.reduce((sum, r) => sum + r.pct, 0) / withData.length) : 0;
        return { total: withData.length, onTrack, atRisk, critical, avg };
    }, [attRows]);

    const attSetPreset = (preset: string) => {
        const today = new Date().toISOString().slice(0, 10);
        if (preset === "all") { setAttStartDate("2026-06-15"); setAttEndDate(today); }
        else if (preset === "this_month") { const now = new Date(); setAttStartDate(new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10)); setAttEndDate(today); }
        else if (preset === "past_30") { const d = new Date(); d.setDate(d.getDate() - 30); setAttStartDate(d.toISOString().slice(0, 10)); setAttEndDate(today); }
        else if (preset === "past_7") { const d = new Date(); d.setDate(d.getDate() - 7); setAttStartDate(d.toISOString().slice(0, 10)); setAttEndDate(today); }
    };

    const handleExportAttendance = async () => {
        if (attRows.length === 0) { toast("No attendance data to export for the selected range.", "warning"); return; }
        setIsExportingAtt(true);
        try {
            const XLSX = await import("xlsx");
            const exportData = attRows.map((r, i) => ({
                "Sl. No.": i + 1,
                "Roll No": r.student.roll_number || r.student.register_number || "—",
                "Name": r.student.name,
                "Campus": r.campus,
                "Department": r.student.department || "—",
                "Batch": r.student.classGroup || "—",
                "Present": r.present,
                "Absent": r.absent,
                "Total Marked": r.total,
                "Attendance %": r.pct,
            }));
            const wb = XLSX.utils.book_new();
            const ws = XLSX.utils.json_to_sheet(exportData);
            XLSX.utils.book_append_sheet(wb, ws, "Attendance Summary");
            XLSX.writeFile(wb, `Attendance_Summary_${attStartDate}_to_${attEndDate}.xlsx`);
            toast(`Exported attendance summary for ${attRows.length} students.`, "success");
        } catch {
            toast("Failed to export attendance summary.", "error");
        } finally {
            setIsExportingAtt(false);
        }
    };

    const attToggleSort = (key: "name" | "pct" | "present" | "absent" | "total") => {
        setAttSort(prev => prev.key === key ? { key, dir: prev.dir === "asc" ? "desc" : "asc" } : { key, dir: key === "name" ? "asc" : "desc" });
    };

    // Hierarchy expansion state
    const [expandedNodes, setExpandedNodes] = useState<Record<string, boolean>>({
        admin: true
    });

    // User Credentials Directory states
    const [usersRoleFilter, setUsersRoleFilter] = useState("all");
    const [usersSearchQuery, setUsersSearchQuery] = useState("");
    const [showUserModal, setShowUserModal] = useState(false);
    const [editingUser, setEditingUser] = useState<any | null>(null);
    const [userForm, setUserForm] = useState({
        id: "",
        email: "",
        role: "mentor",
        password: "",
        reference_id: "",
        status: "Active"
    });
    const [userModalError, setUserModalError] = useState<string | null>(null);
    const [isSubmittingUser, setIsSubmittingUser] = useState(false);
    const [revealedPasswords, setRevealedPasswords] = useState<Record<string, boolean>>({});
    const [copiedPassId, setCopiedPassId] = useState<string | null>(null);

    const togglePasswordVisibility = (userId: string) => {
        setRevealedPasswords(prev => ({
            ...prev,
            [userId]: !prev[userId]
        }));
    };

    const handleCopyPassword = (userId: string, pass: string) => {
        navigator.clipboard.writeText(pass);
        setCopiedPassId(userId);
        toast("Password copied to clipboard", "success");
        setTimeout(() => setCopiedPassId(null), 2000);
    };

    const toggleNode = (nodeId: string) => {
        setExpandedNodes(prev => ({
            ...prev,
            [nodeId]: !prev[nodeId]
        }));
    };

    // ── User Feedback: cached fetch + status update ────────────────────────────
    const feedbackQuery = useQuery({
        queryKey: qk.adminFeedback("all"),
        enabled: activeTab === "feedback",
        queryFn: async () => {
            const data = await apiFetch("/api/feedback");
            if (!data?.success) throw new Error(data?.message || "Failed to load feedback reports.");
            return (data.reports || []) as any[];
        },
    });
    const feedbackReports = feedbackQuery.data || [];
    const feedbackLoading = feedbackQuery.isFetching;

    useEffect(() => {
        if (feedbackQuery.isError) {
            toast("Error loading feedback: " + (feedbackQuery.error as Error)?.message, "error");
        }
    }, [feedbackQuery.isError, feedbackQuery.error, toast]);

    const handleFeedbackStatus = async (id: string, status: "pending" | "resolved" | "closed", note?: string) => {
        setFeedbackStatusUpdating(id);
        try {
            const res = await fetch("/api/feedback", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    id,
                    status,
                    resolvedBy: currentAdmin?.name || "Admin",
                    adminNotes: note !== undefined ? note : (status === "resolved" ? "Resolved by Admin" : status === "closed" ? "Closed by Admin" : "")
                })
            });
            const data = await res.json();
            if (data.success) {
                queryClient.setQueryData(qk.adminFeedback("all"), (prev: any[] | undefined) => (prev || []).map(r => r.id === id ? {
                    ...r,
                    status,
                    admin_notes: note !== undefined ? note : (status === "resolved" ? (r.admin_notes || "Resolved by Admin") : r.admin_notes),
                    resolved_by: status !== "pending" ? (currentAdmin?.name || "Admin") : null,
                    resolved_at: status !== "pending" ? new Date().toISOString() : null
                } : r));
                toast(`Feedback marked as ${status}.`, "success");
                if (resolvingReport?.id === id) {
                    setResolvingReport(null);
                    setResolutionNote("");
                }
            } else {
                toast(data.message || "Failed to update feedback status.", "error");
            }
        } catch (err: any) {
            toast("Error updating feedback: " + err.message, "error");
        } finally {
            setFeedbackStatusUpdating(null);
        }
    };

    const filteredFeedbackReports = useMemo(() => {
        const q = feedbackSearch.toLowerCase().trim();
        return feedbackReports.filter(r => {
            if (feedbackStatusFilter !== "all" && (r.status || "pending") !== feedbackStatusFilter) return false;
            if (feedbackTypeFilter !== "all" && (r.type || "other").toLowerCase() !== feedbackTypeFilter.toLowerCase()) return false;
            if (!q) return true;
            return [
                r.title,
                r.description,
                r.user_id,
                r.user_role,
                r.user_name,
                r.college_name,
                r.department,
                r.register_number,
                r.contact_info,
                r.type,
                r.admin_notes,
                r.resolved_by
            ].some((v: any) => String(v || "").toLowerCase().includes(q));
        });
    }, [feedbackReports, feedbackSearch, feedbackStatusFilter, feedbackTypeFilter]);

    const feedbackCounts = useMemo(() => ({
        all: feedbackReports.length,
        pending: feedbackReports.filter(r => (r.status || "pending") === "pending").length,
        resolved: feedbackReports.filter(r => r.status === "resolved").length,
        closed: feedbackReports.filter(r => r.status === "closed").length,
        bug: feedbackReports.filter(r => r.type === "bug").length,
        feature: feedbackReports.filter(r => r.type === "feature").length,
        suggestion: feedbackReports.filter(r => r.type === "suggestion").length,
        other: feedbackReports.filter(r => !["bug", "feature", "suggestion"].includes(r.type)).length
    }), [feedbackReports]);

    // ── Credential directory (shared by cams / users and session lookups) ─────
    // The endpoint defaults to the 50 newest credentials; the directory tabs and
    // the bulk-credential pickers need the whole list or older accounts vanish.
    const usersQuery = useQuery({
        queryKey: qk.adminUsers("all"),
        queryFn: async () => {
            const data = await apiFetch("/api/users?limit=5000");
            if (!data?.success) throw new Error(data?.message || "Failed to load users.");
            return (data.users || []) as any[];
        },
    });
    const usersList = usersQuery.data || [];
    const isUsersLoading = usersQuery.isFetching;
    const isUsersError = usersQuery.isError;

    const camList = useMemo<CAMUserFromDB[]>(() =>
        usersList
            .filter((u: any) => normalizeRoleValue(u.role) === "cm")
            .map((u: any) => {
                const colProfile = (colleges as any[]).find((c: any) => c.cam_id === u.reference_id);
                return {
                    ...u,
                    name: colProfile?.cam_name || u.name || (u.email && typeof u.email === 'string' ? u.email.split("@")[0] : u.reference_id) || "—",
                    college_id: colProfile?.id || u.college_id || "",
                    college_name: colProfile?.name || "",
                    kam_id: colProfile?.kam_id || ""
                };
            }),
        [usersList, colleges]
    );

    // KAMs live in kam_users; the users table only holds their credential and
    // misses profiles that were created without one (or added by seed/import).
    const kamDirectoryQuery = useQuery({
        queryKey: qk.adminKams(),
        queryFn: async () => {
            const data = await apiFetch("/api/kam?all=1");
            if (!data?.success) throw new Error(data?.message || "Failed to load Key Account Managers.");
            return ((data.kamUsers || []) as any[]).map((k: any) => ({
                id: k.id,
                name: k.name || (k.email ? String(k.email).split("@")[0] : "—"),
                email: k.email || "",
                title: k.title || "Key Account Manager"
            })) as KAMUserFromDB[];
        },
    });
    const kamList: KAMUserFromDB[] = kamDirectoryQuery.data || [];
    const isKamsLoading = kamDirectoryQuery.isFetching;
    const isKamsError = kamDirectoryQuery.isError;

    // ── Login history (sessions tab only) ───────────────────────────────────────
    const loginHistoryQuery = useQuery({
        queryKey: qk.loginHistory("all"),
        enabled: activeTab === "sessions",
        queryFn: async () => {
            const data = await apiFetch("/api/admin/login-history");
            if (!data?.success) throw new Error(data?.message || "Failed to load login history.");
            return (data.loginHistory || []) as any[];
        },
    });
    const loginHistory = loginHistoryQuery.data || [];
    const isSessionsLoading = loginHistoryQuery.isFetching;

    // ── Announcements (announcements tab only) ──────────────────────────────────
    const announcementsQuery = useQuery({
        queryKey: qk.announcements("all"),
        enabled: activeTab === "announcements",
        queryFn: async () => {
            const data = await apiFetch("/api/announcements");
            if (!data?.success) throw new Error(data?.message || "Failed to load announcements.");
            return (data.announcements || []) as any[];
        },
    });
    const announcements = announcementsQuery.data || [];
    const isAnnouncementsLoading = announcementsQuery.isFetching;

    const handleUserSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setUserModalError(null);
        if (!userForm.email || !userForm.email.trim()) {
            setUserModalError("Email is required.");
            return;
        }
        setIsSubmittingUser(true);
        try {
            let res;
            if (editingUser) {
                res = await fetch("/api/users", {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        id: editingUser.id,
                        email: userForm.email.trim(),
                        role: userForm.role,
                        reference_id: userForm.reference_id.trim(),
                        status: userForm.status,
                        newPassword: userForm.password.trim() || undefined
                    })
                });
            } else {
                res = await fetch("/api/users", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        action: "create",
                        email: userForm.email.trim(),
                        role: userForm.role,
                        password: userForm.password.trim(),
                        reference_id: userForm.reference_id.trim(),
                        status: userForm.status
                    })
                });
            }
            const data = await res.json();
            if (data.success) {
                toast(data.message || (editingUser ? "User credential updated." : "User credential created."), "success");
                setShowUserModal(false);
                queryClient.invalidateQueries({ queryKey: qk.adminUsers("all") });
                // Creating a role=kam credential also inserts the KAM profile row.
                queryClient.invalidateQueries({ queryKey: qk.adminKams() });
            } else {
                setUserModalError(data.message || "Failed to save user credential.");
            }
        } catch (err: any) {
            setUserModalError(err.message || "An unexpected error occurred.");
        } finally {
            setIsSubmittingUser(false);
        }
    };

    const handleResetUserPassword = async (userId: string, email: string) => {
        if (!await showConfirm({ title: "Reset Password", message: `Reset the password for ${email} to the institution default? The user will be asked to set a new one at their next sign-in.`, confirmLabel: "Reset", danger: true })) return;
        try {
            const res = await fetch("/api/users", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "reset_password", userId })
            });
            const data = await res.json();
            if (data.success) {
                toast(data.message || "Password reset successfully.", "success");
                queryClient.invalidateQueries({ queryKey: qk.adminUsers("all") });
            } else {
                toast(data.message || "Failed to reset password.", "error");
            }
        } catch (err: any) {
            toast(err.message || "Error resetting password.", "error");
        }
    };

    const handleToggleUserStatus = async (userId: string) => {
        try {
            const res = await fetch("/api/users", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "toggle_status", userId })
            });
            const data = await res.json();
            if (data.success) {
                toast(data.message, "success");
                queryClient.invalidateQueries({ queryKey: qk.adminUsers("all") });
            } else {
                toast(data.message || "Failed to toggle status.", "error");
            }
        } catch (err: any) {
            toast(err.message || "Error toggling status.", "error");
        }
    };

    const handleDeleteUser = async (userId: string, email: string) => {
        if (!await showConfirm({ title: "Delete User", message: `Are you sure you want to delete user credential for ${email}?`, confirmLabel: "Delete", danger: true })) return;
        try {
            const res = await fetch(`/api/users?id=${encodeURIComponent(userId)}`, { method: "DELETE" });
            const data = await res.json();
            if (data.success) {
                toast("User credential deleted.", "success");
                queryClient.invalidateQueries({ queryKey: qk.adminUsers("all") });
            } else {
                toast(data.message || "Failed to delete user.", "error");
            }
        } catch (err: any) {
            toast(err.message || "Error deleting user.", "error");
        }
    };

    const handleComposeAnnouncement = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!annForm.title.trim()) return;
        setModalBusy(true);
        try {
            const res = await fetch("/api/announcements", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(annForm)
            });
            const data = await res.json();
            if (data.success) {
                setShowAnnModal(false);
                setAnnForm({ title: "", description: "", target_role: "All", college_id: "" });
                // Only refetch announcements, not the full admin details
                await queryClient.invalidateQueries({ queryKey: qk.announcements("all") });
            } else {
                toast(data.message || "Failed to create announcement.", "error");
            }
        } catch (err) {
            console.error("Compose announcement error:", err);
        } finally {
            setModalBusy(false);
        }
    };

    const handleDeleteAnnouncement = async (id: string) => {
        if (await showConfirm({ message: "Are you sure you want to delete this announcement?", danger: true, confirmLabel: "Delete" })) {
            setActionLoading(`announcement_${id}`, true);
            try {
                const res = await fetch(`/api/announcements?id=${id}`, { method: "DELETE" });
                const data = await res.json();
                if (data.success) {
                    // Optimistic remove + background refetch
                    queryClient.setQueryData(qk.announcements("all"), (prev: any[] | undefined) => (prev || []).filter(a => a.id !== id));
                    queryClient.invalidateQueries({ queryKey: qk.announcements("all") });
                } else {
                    toast(data.message || "Failed to delete announcement.", "error");
                }
            } catch (err) {
                console.error("Delete announcement error:", err);
            } finally {
                setActionLoading(`announcement_${id}`, false);
            }
        }
    };

    const handleAddHoliday = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!holForm.title.trim() || !holForm.date) return;
        setActionLoading('submit_holiday', true);
        try {
            const res = await fetch("/api/holidays", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(holForm)
            });
            const data = await res.json();
            if (data.success) {
                setShowHolModal(false);
                setHolForm({ title: "", date: "", type: "National Holiday", college_id: "" });
                toast("Holiday added successfully.", "success");
                // holidays live in AppContext — a silent refresh picks it up
                refreshData(true);
            } else {
                toast(data.message || "Failed to add holiday.", "error");
            }
        } catch (err) {
            console.error("Add holiday error:", err);
        } finally {
            setActionLoading('submit_holiday', false);
        }
    };

    const handleDeleteHoliday = async (id: string) => {
        if (await showConfirm({ message: "Are you sure you want to delete this holiday?", danger: true, confirmLabel: "Delete" })) {
            setActionLoading(`holiday_${id}`, true);
            try {
                const res = await fetch(`/api/holidays?id=${id}`, { method: "DELETE" });
                const data = await res.json();
                if (data.success) {
                    toast("Holiday deleted.", "success");
                    // holidays live in AppContext — a silent refresh picks it up
                    refreshData(true);
                } else {
                    toast(data.message || "Failed to delete holiday.", "error");
                }
            } catch (err) {
                console.error("Delete holiday error:", err);
            } finally {
                setActionLoading(`holiday_${id}`, false);
            }
        }
    };



    const handleApproveSignupSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!approvingSignup) return;

        setActionLoading('approve_signup', true);
        try {
            const res = await approveSignupRequest(approvingSignup.id, {
                role: approvingRole,
                mappingType,
                selectedReferenceId: mappingType === "link_existing" ? selectedReferenceId : null,
                collegeId: mappingCollegeId || null,
                department: mappingDept || null,   // kept for backwards compat, ignored by new API
                group: mappingDept || null,
                classGroup: mappingClassGroup || null
            });

            if (res.success) {
                toast("Signup request approved and mapped successfully.", "success");
                setShowApprovalModal(false);
                setApprovingSignup(null);
                setSelectedReferenceId("");
                setMappingCollegeId("");
                setMappingDept("");
                setMappingClassGroup("");
                // signupRequests live in AppContext — silent refresh is sufficient
                refreshData(true);
                queryClient.invalidateQueries({ queryKey: qk.adminUsers("all") });
            } else {
                toast(res.message || "Failed to approve signup request.", "error");
            }
        } catch (err: any) {
            toast(err.message || "An error occurred.", "error");
        } finally {
            setActionLoading('approve_signup', false);
        }
    };

    const handleRejectSignup = async (id: string) => {
        if (await showConfirm({ message: "Are you sure you want to reject this signup request?", danger: true, confirmLabel: "Reject" })) {
            setActionLoading(`reject_signup_${id}`, true);
            try {
                const res = await rejectSignupRequest(id);
                if (res.success) {
                    toast("Signup request rejected.", "success");
                    refreshData(true);
                } else {
                    toast(res.message || "Failed to reject signup request.", "error");
                }
            } catch (err: any) {
                toast(err.message || "An error occurred.", "error");
            } finally {
                setActionLoading(`reject_signup_${id}`, false);
            }
        }
    };

    const handleDeleteSignupRequest = async (id: string) => {
        if (await showConfirm({ message: "Are you sure you want to permanently delete this request log?", danger: true, confirmLabel: "Delete" })) {
            setActionLoading(`delete_signup_${id}`, true);
            try {
                const res = await deleteSignupRequest(id);
                if (res.success) {
                    toast("Request log deleted.", "success");
                    refreshData(true);
                } else {
                    toast(res.message || "Failed to delete request log.", "error");
                }
            } catch (err: any) {
                toast(err.message || "An error occurred.", "error");
            } finally {
                setActionLoading(`delete_signup_${id}`, false);
            }
        }
    };

    // ── Mount: only fetch what overview needs immediately ──────────────────────
    // Settings and users load through React Query; tabs read cached data on entry.
    useEffect(() => {
        fetchCampusDraftFromDb();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const fetchCampusDraftFromDb = async () => {
        try {
            const res = await fetch("/api/campus-draft");
            const json = await res.json();
            if (json.success && json.draft) {
                const parsed = json.draft;
                if (parsed.campusForm) setCampusForm(parsed.campusForm);
                if (parsed.campusWizardStep) setCampusWizardStep(parsed.campusWizardStep);
                if (parsed.wizardCourses) setWizardCourses(parsed.wizardCourses);
                if (parsed.shiftConfigsParams) setShiftConfigsParams(parsed.shiftConfigsParams);
                if (parsed.semesterConfigsMap) setSemesterConfigsMap(parsed.semesterConfigsMap);
                if (json.savedAt) setDraftLastSaved(json.savedAt);
                setHasRestoredDraft(true);
            }
        } catch (err) {
            console.error("Failed to fetch campus draft from database:", err);
        }
    };

    const saveCampusDraftToDb = async () => {
        if (!showCampusModal || editingCampus || campusSuccessCreatedId) return;
        const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        const draftData = {
            campusForm,
            campusWizardStep,
            wizardCourses,
            shiftConfigsParams,
            semesterConfigsMap
        };
        try {
            await fetch("/api/campus-draft", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ data: draftData, savedAt: timeStr })
            });
            setDraftLastSaved(timeStr);
            setHasRestoredDraft(true);
        } catch (err) {
            console.error("Failed to save campus draft to database:", err);
        }
    };

    const clearCampusDraftFromDb = async () => {
        try {
            await fetch("/api/campus-draft", { method: "DELETE" });
        } catch (_) { }
        setDraftLastSaved(null);
        setHasRestoredDraft(false);
        setIsCampusCodeCustomized(false);
        setCampusWizardStep(1);
        setWizardCourses([]);
        setCampusForm({
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
    };

    // Auto-Save Draft to Database whenever wizard data changes
    useEffect(() => {
        if (showCampusModal && !editingCampus && !campusSuccessCreatedId) {
            const timeout = setTimeout(() => {
                saveCampusDraftToDb();
            }, 500);
            return () => clearTimeout(timeout);
        }
    }, [showCampusModal, editingCampus, campusSuccessCreatedId, campusForm, campusWizardStep, wizardCourses, shiftConfigsParams, semesterConfigsMap]);

    // Campus handlers
    const handleOpenCampusModal = (col?: College) => {
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

        if (col) {
            let s1 = "";
            let s2 = "";
            let gen = "";
            if (col.shift_configs) {
                try {
                    const parsed = JSON.parse(col.shift_configs);
                    if (Array.isArray(parsed.shift_1)) s1 = parsed.shift_1.join("\n");
                    if (Array.isArray(parsed.shift_2)) s2 = parsed.shift_2.join("\n");
                    if (Array.isArray(parsed.general)) gen = parsed.general.join("\n");

                    if (parsed.custom_shift_params) {
                        if (parsed.custom_shift_params.shift_1) s1Params = { ...parsed.custom_shift_params.shift_1, label: parsed.custom_shift_params.shift_1.label || "Shift 1", breaks: (parsed.custom_shift_params.shift_1.breaks && parsed.custom_shift_params.shift_1.breaks.length > 0) ? parsed.custom_shift_params.shift_1.breaks : defaultShift1Breaks };
                        if (parsed.custom_shift_params.shift_2) s2Params = { ...parsed.custom_shift_params.shift_2, label: parsed.custom_shift_params.shift_2.label || "Shift 2", breaks: (parsed.custom_shift_params.shift_2.breaks && parsed.custom_shift_params.shift_2.breaks.length > 0) ? parsed.custom_shift_params.shift_2.breaks : defaultShift2Breaks };
                        if (parsed.custom_shift_params.general) genParams = { ...parsed.custom_shift_params.general, label: parsed.custom_shift_params.general.label || "General Shift", breaks: (parsed.custom_shift_params.general.breaks && parsed.custom_shift_params.general.breaks.length > 0) ? parsed.custom_shift_params.general.breaks : defaultGenBreaks };
                    } else {
                        // Legacy fallbacks
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

                    // Load semester configs
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
                } catch (_) { }
            }
            if (!s1) s1 = SHIFT_TIME_SLOTS.shift_1.join("\n");
            if (!s2) s2 = SHIFT_TIME_SLOTS.shift_2.join("\n");
            if (!gen) gen = SHIFT_TIME_SLOTS.general.join("\n");
            setShift1Timings(s1);
            setShift2Timings(s2);
            setGeneralTimings(gen);

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
                id: col.id,
                name: col.name,
                address: col.address || "",
                kam_id: col.kam_id,
                has_shifts: col.has_shifts === undefined ? 1 : col.has_shifts,
                shift_configs: col.shift_configs || "",
                rooms: col.rooms || "",
                code: (col as any).code || "",
                academic_year: (col as any).academic_year || getCurrentAcademicYear(),
                manager: (col as any).manager || "",
                working_days: (col as any).working_days === undefined ? 5 : Number((col as any).working_days)
            });
            setEditingCampus(true);
            setIsCampusCodeCustomized(true);
            setCampusWizardStep(1);
            const existing = coursesList.filter(d => d.college_id === col.id || (col.id === colleges[0]?.id && !d.college_id));
            setWizardCourses(existing.map(c => {
                let sections: Record<number, number> = { 1: 1, 2: 1, 3: 1, 4: 1, 5: 1 };
                let sectionRooms: Record<string, string> = {};
                if (c.default_room) {
                    try {
                        const parsed = JSON.parse(c.default_room);
                        if (typeof parsed === "object") {
                            sectionRooms = parsed;
                            // Reconstruct section counts from parsed keys
                            const counts: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
                            Object.keys(parsed).forEach(key => {
                                const match = key.match(/Year\s*(\d+)\s*Section\s*([A-Z])/i);
                                if (match) {
                                    const y = parseInt(match[1], 10);
                                    counts[y] = Math.max(counts[y] || 0, match[2].toUpperCase().charCodeAt(0) - 64);
                                }
                            });
                            for (let y = 1; y <= 5; y++) {
                                if (counts[y] > 0) sections[y] = counts[y];
                            }
                        }
                    } catch (_) { }
                }
                return { ...c, isExisting: true, sections, sectionRooms };
            }));
        } else {
            setShift1Timings(SHIFT_TIME_SLOTS.shift_1.join("\n"));
            setShift2Timings(SHIFT_TIME_SLOTS.shift_2.join("\n"));
            setGeneralTimings(SHIFT_TIME_SLOTS.general.join("\n"));

            setEditingCampus(false);
            setCampusSuccessCreatedId(null);

            // Only populate empty fallback form if no draft was restored
            if (!hasRestoredDraft) {
                setShiftConfigsParams({
                    shift_1: { ...DEFAULT_SHIFT_CONFIGS.shift_1 },
                    shift_2: { ...DEFAULT_SHIFT_CONFIGS.shift_2 },
                    general: { ...DEFAULT_SHIFT_CONFIGS.general }
                });

                initialMap["All Semesters"] = {
                    shift_1: { ...DEFAULT_SHIFT_CONFIGS.shift_1 },
                    shift_2: { ...DEFAULT_SHIFT_CONFIGS.shift_2 },
                    general: { ...DEFAULT_SHIFT_CONFIGS.general }
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
            }
        }

        setSemesterConfigsMap(initialMap);
        setActiveConfigSemester("All Semesters");
        setNewBreakName("");
        setNewBreakDuration(15);
        setCampusFieldErrors({});
        setCourseFieldErrors({});

        setShowCampusModal(true);
    };

    const handleStartEditRooms = (c: any, idx: number) => {
        setEditingWizardCourseIndex(idx);
        let parsedRooms: Record<string, string> = {};
        if (c.sectionRooms && Object.keys(c.sectionRooms).length > 0) {
            parsedRooms = { ...c.sectionRooms };
        } else if (c.default_room) {
            try {
                parsedRooms = typeof c.default_room === "string" && c.default_room.startsWith("{")
                    ? JSON.parse(c.default_room)
                    : { "Year 1 Section A": c.default_room };
            } catch (_) {
                parsedRooms = { "Year 1 Section A": c.default_room };
            }
        } else {
            for (let yr = 1; yr <= (c.years || 3); yr++) {
                parsedRooms[`Year ${yr} Section A`] = `Room ${yr}01`;
            }
        }
        setEditingRooms(parsedRooms);
    };

    const handleSaveEditedRooms = (idx: number) => {
        setWizardCourses(prev => {
            const updated = [...prev];
            const target = { ...updated[idx] };
            target.sectionRooms = { ...editingRooms };
            target.default_room = JSON.stringify(editingRooms);
            updated[idx] = target;
            return updated;
        });
        setEditingWizardCourseIndex(null);
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

            // Ensure at least one break is configured for active shifts
            for (const sem of Object.keys(finalMap)) {
                const semParams = finalMap[sem];
                if (campusForm.has_shifts === 1) {
                    if (!semParams.shift_1.breaks || semParams.shift_1.breaks.length === 0) {
                        setModalError(`${sem} - Shift 1: At least one break must be configured.`);
                        return;
                    }
                    if (!semParams.shift_2.breaks || semParams.shift_2.breaks.length === 0) {
                        setModalError(`${sem} - Shift 2: At least one break must be configured.`);
                        return;
                    }
                } else {
                    if (!semParams.general.breaks || semParams.general.breaks.length === 0) {
                        setModalError(`${sem} - General Shift: At least one break must be configured.`);
                        return;
                    }
                }
            }

            const s1Schedule = calculateShiftSchedule(allSemsMap.shift_1);
            const s2Schedule = calculateShiftSchedule(allSemsMap.shift_2);
            const genSchedule = calculateShiftSchedule(allSemsMap.general);

            if (s1Schedule.error && campusForm.has_shifts === 1) {
                setModalError(`All Semesters - Shift 1: ${s1Schedule.error}`);
                return;
            }
            if (s2Schedule.error && campusForm.has_shifts === 1) {
                setModalError(`All Semesters - Shift 2: ${s2Schedule.error}`);
                return;
            }
            if (genSchedule.error) {
                setModalError(`All Semesters - General Shift: ${genSchedule.error}`);
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
                    return;
                }
                if (semS2.error && campusForm.has_shifts === 1) {
                    setModalError(`${sem} - Shift 2: ${semS2.error}`);
                    return;
                }
                if (semGen.error) {
                    setModalError(`${sem} - General Shift: ${semGen.error}`);
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
                if (c.default_room) {
                    if (c.default_room.startsWith("{")) {
                        try {
                            const parsed = JSON.parse(c.default_room);
                            Object.values(parsed).forEach((r: any) => {
                                if (r && typeof r === 'string' && r.trim()) {
                                    allRooms.add(r.trim());
                                }
                            });
                        } catch (_) { }
                    } else {
                        allRooms.add(c.default_room.trim());
                    }
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
                // Update selected Campus Manager assignment if specified
                if (updatedForm.manager) {
                    const selectedCamObj = camList.find(cm => cm.id === updatedForm.manager);
                    if (selectedCamObj) {
                        await updateCAM({
                            id: selectedCamObj.id,
                            name: selectedCamObj.name,
                            email: selectedCamObj.email,
                            college_id: updatedForm.id,
                            kam_id: selectedCamObj.kam_id
                        });
                    }
                }

                // Save new wizard courses if any
                const newCourses = wizardCourses.filter(c => !c.isExisting);
                for (const course of newCourses) {
                    await createCourse({
                        name: course.name,
                        college_id: updatedForm.id,
                        code: course.code?.trim().toUpperCase() || generateCodeFromName(course.name),
                        description: course.description || "",
                        years: Number(course.years) || 3,
                        start_date: course.start_date || new Date().toISOString().slice(0, 10),
                        end_date: course.end_date || new Date(Date.now() + 3 * 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
                        start_year: course.start_year || new Date().getFullYear().toString(),
                        end_year: course.end_year || (new Date().getFullYear() + (Number(course.years) || 3)).toString(),
                        default_room: course.default_room || null,
                        default_shift: course.default_shift || null
                    });
                }
                await clearCampusDraftFromDb();
                await refreshData();
                if (!editingCampus) {
                    setCampusSuccessCreatedId(updatedForm.id);
                } else {
                    setShowCampusModal(false);
                }
            } else {
                setModalError(res.message || "Failed to save campus.");
            }
        } catch (err: any) {
            setModalError(err.message || "An unexpected error occurred.");
        } finally {
            setActionLoading('submit_campus', false);
            setModalBusy(false);
        }
    };

    const handleDeleteCampus = async (id: string) => {
        if (await showConfirm({ title: "Delete Campus", message: "Are you sure you want to delete this campus?\n\nThis will permanently delete all associated mentors, students, courses, slots, and attendance records. This action cannot be undone.", danger: true, confirmLabel: "Delete Campus" })) {
            setActionLoading(`campus_${id}`, true);
            try {
                const res = await deleteCollege(id);
                if (res.success) {
                    await refreshData();
                    // fetchAdminDetails removed — refreshData covers campus/mentor/student state
                    const counts = res.deletedCounts;
                    if (counts && (counts.mentors > 0 || counts.students > 0)) {
                        toast(`Campus deleted. Cascade removed: ${counts.mentors} mentor(s), ${counts.students} student(s), ${counts.cams} CM(s) and all associated records.`, "info");
                    } else {
                        toast("Campus deleted successfully.", "success");
                    }
                } else {
                    toast(res.message || "Failed to delete campus.", "error");
                }
            } catch (err: any) {
                toast(err.message || "An error occurred while deleting.", "error");
            } finally {
                setActionLoading(`campus_${id}`, false);
            }
        }
    };

    // KAM handlers
    const handleOpenKamModal = (kam?: KAMUserFromDB) => {
        setModalError(null);
        if (kam) {
            setKamForm({
                id: kam.id,
                name: kam.name,
                email: kam.email,
                title: kam.title
            });
            setEditingKam(true);
        } else {
            setKamForm({
                id: "",
                name: "",
                email: "",
                title: "Key Account Manager"
            });
            setEditingKam(false);
        }
        setShowKamModal(true);
    };

    const handleKamSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setModalError(null);
        setActionLoading('submit_kam', true);
        try {
            let res;
            if (editingKam) {
                res = await updateKAM(kamForm);
            } else {
                res = await createKAM(kamForm);
            }
            if (res.success) {
                setShowKamModal(false);
                await Promise.all([
                    queryClient.invalidateQueries({ queryKey: qk.adminKams() }),
                    queryClient.invalidateQueries({ queryKey: qk.adminUsers("all") }),
                ]);
            } else {
                setModalError(res.message || "Failed to save KAM.");
            }
        } catch (err: any) {
            setModalError(err.message || "An unexpected error occurred.");
        } finally {
            setActionLoading('submit_kam', false);
        }
    };

    const handleDeleteKam = async (id: string) => {
        if (await showConfirm({ message: "Are you sure you want to delete this KAM? This action cannot be undone.", danger: true, confirmLabel: "Delete" })) {
            setActionLoading(`kam_${id}`, true);
            try {
                const res = await deleteKAM(id);
                if (res.success) {
                    toast("KAM deleted successfully.", "success");
                    await Promise.all([
                        queryClient.invalidateQueries({ queryKey: qk.adminKams() }),
                        queryClient.invalidateQueries({ queryKey: qk.adminUsers("all") }),
                    ]);
                } else {
                    toast(res.message || "Failed to delete KAM.", "error");
                }
            } catch (err: any) {
                toast(err.message || "An error occurred while deleting.", "error");
            } finally {
                setActionLoading(`kam_${id}`, false);
            }
        }
    };

    // CAM handlers
    const handleOpenCamModal = (cam?: CAMUserFromDB) => {
        setModalError(null);
        if (cam) {
            setCamForm({
                id: cam.id,
                name: cam.name,
                email: cam.email,
                college_id: cam.college_id,
                kam_id: cam.kam_id
            });
            setEditingCam(true);
        } else {
            setCamForm({
                id: "",
                name: "",
                email: "",
                college_id: colleges[0]?.id || "",
                kam_id: kamList[0]?.id || ""
            });
            setEditingCam(false);
        }
        setShowCamModal(true);
    };

    const handleCamSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setModalError(null);
        setActionLoading('submit_cam', true);
        try {
            let res;
            if (editingCam) {
                res = await updateCAM(camForm);
            } else {
                res = await createCAM(camForm);
            }
            if (res.success) {
                setShowCamModal(false);
                await queryClient.invalidateQueries({ queryKey: qk.adminUsers("all") });
            } else {
                setModalError(res.message || "Failed to save Campus Manager.");
            }
        } catch (err: any) {
            setModalError(err.message || "An unexpected error occurred.");
        } finally {
            setActionLoading('submit_cam', false);
        }
    };

    const handleDeleteCam = async (id: string) => {
        if (await showConfirm({ message: "Are you sure you want to delete this Campus Manager? This action cannot be undone.", danger: true, confirmLabel: "Delete" })) {
            setActionLoading(`cam_${id}`, true);
            try {
                const res = await deleteCAM(id);
                if (res.success) {
                    toast("Campus Manager deleted successfully.", "success");
                    await queryClient.invalidateQueries({ queryKey: qk.adminUsers("all") });
                } else {
                    toast(res.message || "Failed to delete Campus Manager.", "error");
                }
            } catch (err: any) {
                toast(err.message || "An error occurred while deleting.", "error");
            } finally {
                setActionLoading(`cam_${id}`, false);
            }
        }
    };

    // SME handlers
    const handleOpenSmeModal = (sme?: any) => {
        if (sme) {
            setIsEditingSme(true);
            setSmeForm({
                id: sme.id,
                name: sme.name,
                email: sme.email,
                subject: sme.subject || ""
            });
        } else {
            setIsEditingSme(false);
            // Auto-generate unique SME ID like sme_4, sme_5
            const maxNum = (smes || []).reduce((acc, curr) => {
                const num = parseInt(curr.id.replace("sme_", ""));
                return isNaN(num) ? acc : Math.max(acc, num);
            }, 0);
            setSmeForm({
                id: `sme_${maxNum + 1}`,
                name: "",
                email: "",
                subject: subjectGroups[0]?.name || ""
            });
        }
        setShowSmeModal(true);
    };

    const handleSaveSme = async () => {
        if (!smeForm.id || !smeForm.name || !smeForm.email) {
            toast("Please fill in all required fields.", "error");
            return;
        }

        setActionLoading('submit_sme', true);
        try {
            if (isEditingSme) {
                const res = await updateSmeUser(smeForm.id, smeForm.name, smeForm.email, smeForm.subject);
                if (res.success) {
                    toast("SME updated successfully.", "success");
                    setShowSmeModal(false);
                } else {
                    toast(res.message, "error");
                }
            } else {
                const res = await createSmeUser(smeForm.id, smeForm.name, smeForm.email, smeForm.subject);
                if (res.success) {
                    toast("SME created successfully.", "success");
                    setShowSmeModal(false);
                } else {
                    toast(res.message, "error");
                }
            }
        } catch (e: any) {
            toast(e.message || "An error occurred.", "error");
        } finally {
            setActionLoading('submit_sme', false);
        }
    };

    const handleDeleteSme = async (id: string) => {
        if (await showConfirm({ message: "Are you sure you want to delete this SME? They will also lose their login credentials." })) {
            setActionLoading(`sme_${id}`, true);
            try {
                const res = await deleteSmeUser(id);
                if (res.success) {
                    toast("SME deleted successfully.", "success");
                } else {
                    toast(res.message, "error");
                }
            } catch (e: any) {
                toast(e.message || "An error occurred.", "error");
            } finally {
                setActionLoading(`sme_${id}`, false);
            }
        }
    };

    // Mentor handlers
    const handleOpenMentorModal = (m?: Mentor) => {
        setModalError(null);
        setMentorSubjectSearch("");
        if (m) {
            setMentorForm({
                id: m.id,
                name: m.name,
                email: m.email,
                mentor_group: m.mentor_group || m.subject_group || m.department || "General",
                avatar: m.avatar,
                subjects: m.subjects || "",
                classes: m.classes || "",
                college_id: m.college_id || colleges[0]?.id || "",
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
                college_id: colleges[0]?.id || "",
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
        setModalBusy(true);
        // Auto generate avatar initials if empty
        let initials = mentorForm.avatar.trim();
        if (!initials) {
            initials = (mentorForm.name && typeof mentorForm.name === 'string')
                ? mentorForm.name.split(" ").filter(Boolean).map(n => n[0]).join("").toUpperCase().slice(0, 2)
                : "M";
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

        setActionLoading('submit_mentor', true);
        try {
            let res;
            if (editingMentor) {
                res = await updateMentor(payload);
            } else {
                res = await createMentor(payload);
            }
            if (res.success) {
                setShowMentorModal(false);
                // mentors live in AppContext — refreshData keeps the list current
                await refreshData(true);
            } else {
                setModalError(res.message || "Failed to save mentor.");
            }
        } catch (err: any) {
            setModalError(err.message || "An unexpected error occurred.");
        } finally {
            setActionLoading('submit_mentor', false);
            setModalBusy(false);
        }
    };

    const handleDeleteMentor = async (id: string) => {
        if (await showConfirm({ message: "Are you sure you want to delete this mentor? This will also delete all slots assigned to them.", danger: true, confirmLabel: "Delete" })) {
            setActionLoading(`mentor_${id}`, true);
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
                setActionLoading(`mentor_${id}`, false);
            }
        }
    };

    // Subject handlers
    const [subjectModalTab, setSubjectModalTab] = useState<"bulk" | "single">("bulk");
    const [bulkSubjectsText, setBulkSubjectsText] = useState("");
    const [bulkDefaultType, setBulkDefaultType] = useState("SKILL");
    const [bulkDefaultHours, setBulkDefaultHours] = useState(4);
    const [showPasteAccordion, setShowPasteAccordion] = useState(true);
    const [dynamicSubjects, setDynamicSubjects] = useState<Array<{ id: string; name: string; type: string; weekly_hours: number; isEditing?: boolean }>>([
        { id: "row_1", name: "", type: "SKILL", weekly_hours: 4 },
        { id: "row_2", name: "", type: "ACADEMIC", weekly_hours: 4 },
        { id: "row_3", name: "", type: "LAB", weekly_hours: 2 }
    ]);

    const normalizeSubjectType = (rawType?: string) => {
        if (!rawType) return "SKILL";
        const u = rawType.trim().toUpperCase();
        if (u === "THEORY" || u === "ACADEMIC") return "ACADEMIC";
        if (u === "SKILL" || u === "PRACTICAL") return "SKILL";
        if (u === "LAB") return "LAB";
        if (u === "GENERAL") return "GENERAL";
        return u;
    };

    const parseBulkSubjectsList = (text: string, defaultType: string, defaultHours: number) => {
        if (!text || typeof text !== 'string' || !text.trim()) return [];
        const lines = text.split(/\r?\n/);
        const results: { name: string; type: string; weekly_hours: number; raw: string }[] = [];
        const seen = new Set<string>();

        for (const rawLine of lines) {
            const trimmed = rawLine.trim();
            if (!trimmed) continue;

            let cleanLine = trimmed.replace(/^(\d+[\.\)]|\-|\*|•)\s*/, "").trim();
            if (!cleanLine) continue;

            let parts: string[] = [];
            if (cleanLine.includes("|")) {
                parts = cleanLine.split("|").map(p => p.trim()).filter(Boolean);
            } else if (cleanLine.includes("\t")) {
                parts = cleanLine.split("\t").map(p => p.trim()).filter(Boolean);
            } else if (cleanLine.includes(",")) {
                parts = cleanLine.split(",").map(p => p.trim()).filter(Boolean);
            } else if (cleanLine.includes(";")) {
                parts = cleanLine.split(";").map(p => p.trim()).filter(Boolean);
            } else {
                parts = [cleanLine];
            }

            const name = parts[0] ? parts[0].trim() : "";
            if (!name) continue;

            let resolvedType = defaultType || "SKILL";
            let resolvedHours = defaultHours || 4;

            if (parts.length >= 2) {
                const p1 = parts[1].trim().toUpperCase();
                if (["SKILL", "PRACTICAL"].includes(p1)) resolvedType = "SKILL";
                else if (["ACADEMIC", "THEORY", "CORE"].includes(p1)) resolvedType = "ACADEMIC";
                else if (["LAB", "LABORATORY"].includes(p1)) resolvedType = "LAB";
                else if (["GENERAL", "ELECTIVE"].includes(p1)) resolvedType = "GENERAL";
                else if (!isNaN(Number(parts[1]))) {
                    resolvedHours = Number(parts[1]);
                }
            }

            if (parts.length >= 3) {
                const p2 = Number(parts[2].trim());
                if (!isNaN(p2) && p2 > 0) {
                    resolvedHours = p2;
                }
            }

            const key = name.toLowerCase();
            if (!seen.has(key)) {
                seen.add(key);
                results.push({
                    name,
                    type: normalizeSubjectType(resolvedType),
                    weekly_hours: resolvedHours || 4,
                    raw: trimmed
                });
            }
        }

        return results;
    };

    const handleAddDynamicSubjectRow = () => {
        setDynamicSubjects(prev => [
            ...prev,
            {
                id: generateId("row"),
                name: "",
                type: bulkDefaultType || "SKILL",
                weekly_hours: bulkDefaultHours || 4,
                isEditing: true
            }
        ]);
    };

    const handleUpdateDynamicSubject = (id: string, field: "name" | "type" | "weekly_hours" | "isEditing", val: any) => {
        setDynamicSubjects(prev => prev.map(item => item.id === id ? { ...item, [field]: val } : item));
    };

    const handleDeleteDynamicSubject = (id: string) => {
        setDynamicSubjects(prev => {
            const next = prev.filter(item => item.id !== id);
            return next.length > 0 ? next : [{ id: "row_" + Date.now(), name: "", type: bulkDefaultType || "SKILL", weekly_hours: bulkDefaultHours || 4 }];
        });
    };

    const handlePasteIntoRow = (e: React.ClipboardEvent<HTMLInputElement>, targetRowId: string) => {
        const pastedText = e.clipboardData.getData("text");
        if (!pastedText) return;

        if (pastedText.includes("\n") || pastedText.includes("\r") || pastedText.includes("\t") || pastedText.includes("|")) {
            const parsed = parseBulkSubjectsList(pastedText, bulkDefaultType, bulkDefaultHours);
            if (parsed.length > 1 || (parsed.length === 1 && (pastedText.includes("|") || pastedText.includes("\t")))) {
                e.preventDefault();

                setDynamicSubjects(prev => {
                    const targetIndex = prev.findIndex(r => r.id === targetRowId);
                    if (targetIndex === -1) return prev;

                    const allCurrentEmpty = prev.every(r => !r.name || !r.name.trim());

                    if (allCurrentEmpty) {
                        return parsed.map((p, i) => ({
                            id: generateId(`row_${i}`),
                            name: p.name,
                            type: p.type,
                            weekly_hours: p.weekly_hours,
                            isEditing: false
                        }));
                    }

                    const before = prev.slice(0, targetIndex);
                    const newRows = parsed.map((p, i) => ({
                        id: generateId(`row_${i}`),
                        name: p.name,
                        type: p.type,
                        weekly_hours: p.weekly_hours,
                        isEditing: false
                    }));
                    const after = prev.slice(targetIndex + 1).filter(r => r.name && r.name.trim());

                    return [...before, ...newRows, ...after];
                });

                toast(`Pasted & auto-populated ${parsed.length} subject(s)!`, "success");
            }
        }
    };

    const handlePopulateFromPaste = (textToParse?: string) => {
        const text = textToParse !== undefined ? textToParse : bulkSubjectsText;
        const parsed = parseBulkSubjectsList(text, bulkDefaultType, bulkDefaultHours);
        if (parsed.length > 0) {
            setDynamicSubjects(parsed.map((p, i) => ({
                id: generateId(`row_${i}`),
                name: p.name,
                type: p.type,
                weekly_hours: p.weekly_hours,
                isEditing: false
            })));
        }
    };

    const handleOpenSubjectModal = (s?: Subject, defaultDept?: string, defaultYear?: string) => {
        setModalError(null);
        setBulkSubjectsText("");
        setShowPasteAccordion(false);
        if (s) {
            setSubjectModalTab("single");
            setSubjectForm({
                id: s.id,
                name: s.name,
                department: s.department,
                semester: s.semester,
                type: normalizeSubjectType(s.type),
                college_id: s.college_id || "",
                year: s.year || "Year 1",
                weekly_hours: s.weekly_hours || 4,
                mentorIds: [],
                mentor_group: s.mentor_group || "General"
            });
            setEditingSubject(s);
            setLockDeptAndYear(false);
        } else {
            let defaultSem = "Semester 1";
            if (defaultYear === "Year 2") defaultSem = "Semester 3";
            else if (defaultYear === "Year 3") defaultSem = "Semester 5";
            else if (defaultYear === "Year 4") defaultSem = "Semester 7";

            setSubjectModalTab("bulk");
            setSubjectForm({
                id: "",
                name: "",
                department: defaultDept || "",
                semester: defaultSem,
                type: "SKILL",
                college_id: colleges[0]?.id || "",
                year: defaultYear || "Year 1",
                weekly_hours: 4,
                mentorIds: [],
                mentor_group: "General"
            });
            setDynamicSubjects([
                { id: "row_" + Date.now() + "_1", name: "", type: "SKILL", weekly_hours: 4 },
                { id: "row_" + Date.now() + "_2", name: "", type: "ACADEMIC", weekly_hours: 4 },
                { id: "row_" + Date.now() + "_3", name: "", type: "LAB", weekly_hours: 2 }
            ]);
            setEditingSubject(null);
            setLockDeptAndYear(!!defaultDept);
        }
        setShowSubjectModal(true);
    };

    const handleSubjectSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setModalError(null);

        if (!subjectForm.department.trim()) {
            setModalError("Course / Department is required.");
            return;
        }
        setModalBusy(true);
        if (!subjectForm.college_id) {
            setModalError("Please select a campus for this subject.");
            return;
        }

        try {
            if (editingSubject) {
                if (!subjectForm.name.trim()) {
                    setModalError("Subject Name is required.");
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
                    setModalError(res.message || "Failed to save subject.");
                }
            } else if (subjectModalTab === "bulk") {
                const validSubjects = dynamicSubjects.filter(s => s.name && s.name.trim() !== "");
                if (validSubjects.length === 0) {
                    setModalError("Please enter at least one valid Subject Name in the rows below.");
                    return;
                }

                const payload = validSubjects.map(p => ({
                    name: p.name.trim(),
                    department: subjectForm.department.trim(),
                    semester: subjectForm.semester,
                    type: p.type || "SKILL",
                    college_id: subjectForm.college_id || undefined,
                    year: subjectForm.year,
                    weekly_hours: Number(p.weekly_hours) || 4,
                    subject_group: subjectForm.mentor_group,
                    mentor_group: subjectForm.mentor_group
                }));

                const res = await createSubject(payload as any);
                if (res.success) {
                    setShowSubjectModal(false);
                    setBulkSubjectsText("");
                    toast(`Successfully created ${validSubjects.length} subject(s) for ${subjectForm.department} (${subjectForm.semester})!`, "success");
                    await refreshData(true);
                } else {
                    setModalError(res.message || "Failed to create subjects.");
                }
            } else {
                if (!subjectForm.name.trim()) {
                    setModalError("Subject Name is required.");
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
                    if (subjectForm.mentorIds.length > 0) {
                        for (const mId of subjectForm.mentorIds) {
                            const mentor = mentors.find(m => m.id === mId);
                            if (!mentor) continue;
                            const existingSubs = (mentor.subjects && typeof mentor.subjects === 'string')
                                ? mentor.subjects.split(/\n|,|;/).map(s => s.trim()).filter(Boolean)
                                : [];
                            if (!existingSubs.includes(subjectForm.name.trim())) {
                                existingSubs.push(subjectForm.name.trim());
                            }
                            await updateMentor({ ...mentor, subjects: existingSubs.join("\n") });
                        }
                    }
                    setShowSubjectModal(false);
                    toast("Subject created successfully.", "success");
                    await refreshData(true);
                } else {
                    setModalError(res.message || "Failed to save subject.");
                }
            }
        } catch (err: any) {
            setModalError(err.message || "An unexpected error occurred.");
        } finally {
            setModalBusy(false);
        }
    };

    const handleDeleteSubject = async (id: string) => {
        if (await showConfirm({ message: "Are you sure you want to delete this subject?", danger: true, confirmLabel: "Delete" })) {
            try {
                const res = await deleteSubject(id);
                if (res.success) {
                    toast("Subject deleted successfully.", "success");
                    await refreshData(true);
                } else {
                    toast(res.message || "Failed to delete subject.", "error");
                }
            } catch (err: any) {
                toast(err.message || "An error occurred while deleting.", "error");
            }
        }
    };

    const handleOpenGroupModal = (g?: any) => {
        setModalError(null);
        setGroupSubjectSearch("");
        setGroupMentorSearch("");
        if (g) {
            const gNameLower = (g.name || "").trim().toLowerCase();
            const associatedSubjectIds = (subjectsList || [])
                .filter(s => (s.mentor_group || s.subject_group || "").trim().toLowerCase() === gNameLower)
                .map(s => s.id);
            const associatedMentorIds = (mentors || [])
                .filter(m => (m.mentor_group || m.subject_group || m.department || "").trim().toLowerCase() === gNameLower)
                .map(m => m.id);
            setGroupForm({
                id: g.id,
                name: g.name,
                description: g.description || "",
                lead_sme_id: g.lead_sme_id || "",
                lead_sme_name: g.lead_sme_name || "",
                subjectIds: associatedSubjectIds,
                mentorIds: associatedMentorIds
            });
            setEditingGroup(g);
        } else {
            setGroupForm({
                id: "",
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
        setModalError(null);
        if (!groupForm.name.trim()) {
            setModalError("Group Name is required.");
            return;
        }
        setModalBusy(true);
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
                setModalError(res.message || "Failed to save mentor group.");
            }
        } catch (err: any) {
            setModalError(err.message || "An unexpected error occurred.");
        } finally {
            setModalBusy(false);
        }
    };

    const handleDeleteGroup = async (id: string) => {
        if (await showConfirm({ message: "Are you sure you want to delete this subject group? Mentors and subjects in this group will be reset to 'General'.", danger: true, confirmLabel: "Delete" })) {
            try {
                const res = await deleteSubjectGroup(id);
                if (res.success) {
                    toast("Subject group deleted successfully.", "success");
                    await refreshData(true);
                } else {
                    toast(res.message || "Failed to delete subject group.", "error");
                }
            } catch (err: any) {
                toast(err.message || "An error occurred while deleting.", "error");
            }
        }
    };

    // Department Handlers
    const handleOpenDeptModal = (dept?: Department, collegeId?: string) => {
        setModalError(null);
        if (dept) {
            setDeptForm({
                id: dept.id,
                name: dept.name,
                college_id: dept.college_id || "",
                code: dept.code || "",
                description: dept.description || "",
                status: dept.status || "Active",
                years: dept.years ? Number(dept.years) : 4,
                start_date: dept.start_date || "",
                end_date: dept.end_date || "",
                start_year: dept.start_year || "",
                end_year: dept.end_year || "",
                default_room: dept.default_room || "",
                default_shift: dept.default_shift || "general",
                sections: dept.sections || ""
            });
            setEditingDept(true);
        } else {
            setDeptForm({
                id: "",
                name: "",
                college_id: collegeId || colleges[0]?.id || "",
                code: "",
                description: "",
                status: "Active",
                years: 4,
                start_date: "",
                end_date: "",
                start_year: "",
                end_year: "",
                default_room: "",
                default_shift: "general",
                sections: ""
            });
            setEditingDept(false);
        }
        setShowDeptModal(true);
    };

    const autoCalculateCourseDates = (startDateStr: string, durationYears: number) => {
        if (!startDateStr) return {};
        const startDate = new Date(startDateStr);
        if (isNaN(startDate.getTime())) return {};

        const endDate = new Date(startDate);
        endDate.setFullYear(startDate.getFullYear() + durationYears);

        const endYearStr = endDate.getFullYear().toString();
        const endMonthStr = String(endDate.getMonth() + 1).padStart(2, '0');
        const endDayStr = String(endDate.getDate()).padStart(2, '0');
        const endDateStr = `${endYearStr}-${endMonthStr}-${endDayStr}`;

        const startYearStr = startDate.getFullYear().toString();

        return {
            end_date: endDateStr,
            start_year: startYearStr,
            end_year: endYearStr
        };
    };

    const handleCourseStartDateChange = (val: string) => {
        const years = deptForm.years || 4;
        const calculated = autoCalculateCourseDates(val, years);
        setDeptForm(prev => ({
            ...prev,
            start_date: val,
            ...calculated
        }));
    };

    const handleCourseYearsChange = (val: number) => {
        const calculated = autoCalculateCourseDates(deptForm.start_date || "", val);
        setDeptForm(prev => ({
            ...prev,
            years: val,
            ...calculated
        }));
    };

    const handleYearRoomChange = (yearNum: number, roomVal: string) => {
        let currentRooms: Record<number, string> = {};
        try {
            if (deptForm.default_room && deptForm.default_room.startsWith("{")) {
                currentRooms = JSON.parse(deptForm.default_room);
            } else if (deptForm.default_room) {
                currentRooms = { 1: deptForm.default_room };
            }
        } catch (_) { }
        currentRooms[yearNum] = roomVal;
        setDeptForm(prev => ({
            ...prev,
            default_room: JSON.stringify(currentRooms)
        }));
    };

    const handleDeptSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setModalError(null);
        if (!deptForm.name.trim()) {
            setModalError("Course Name is required.");
            return;
        }

        setIsDeptSubmitting(true);
        try {
            let res;
            const isShiftSplit = deptForm.default_shift === "both" || deptForm.default_shift === "all";
            const autoCode = deptForm.code?.trim() || generateCodeFromName(deptForm.name.trim());
            if (editingDept) {
                res = await updateCourse({
                    ...deptForm,
                    code: autoCode,
                    shift_based: isShiftSplit ? 1 : 0,
                    sections: deptForm.sections || undefined
                } as Department);
            } else {
                res = await createCourse({
                    name: deptForm.name.trim(),
                    college_id: deptForm.college_id,
                    code: autoCode,
                    description: deptForm.description?.trim(),
                    status: deptForm.status,
                    years: deptForm.years ? Number(deptForm.years) : 4,
                    start_date: deptForm.start_date,
                    end_date: deptForm.end_date,
                    start_year: deptForm.start_year,
                    end_year: deptForm.end_year,
                    default_room: deptForm.default_room,
                    default_shift: deptForm.default_shift,
                    shift_based: isShiftSplit ? 1 : 0,
                    sections: deptForm.sections || undefined
                } as Omit<Department, "id">);
            }
            if (res.success) {
                setShowDeptModal(false);
                toast("Course & Batch saved successfully.", "success");
                // createCourse/updateCourse already surgically update departmentsList — no refreshData needed
            } else {
                setModalError(res.message || "Failed to save course.");
            }
        } catch (err: any) {
            setModalError(err.message || "An unexpected error occurred.");
        } finally {
            setIsDeptSubmitting(false);
        }
    };

    const handleDeleteDept = async (id: string, name: string) => {
        if (await showConfirm({ title: "Delete Course", message: `Are you sure you want to delete the course "${name}"?\n\nThis will permanently delete all associated mentors, students, subjects, slots, and attendance records. This action cannot be undone.`, danger: true, confirmLabel: "Delete Course" })) {
            try {
                const res = await deleteCourse(id);
                if (res.success) {
                    await refreshData();
                    const counts = res.deletedCounts;
                    if (counts && (counts.slots > 0 || counts.students > 0 || counts.mentors > 0)) {
                        toast(`Course "${name}" deleted. Cascade removed: ${counts.slots} slot(s), ${counts.students} student(s), ${counts.mentors} mentor(s), ${counts.subjects} subject(s).`, "info");
                    } else {
                        toast(`Course "${name}" deleted successfully.`, "success");
                    }
                } else {
                    toast(res.message || "Failed to delete course.", "error");
                }
            } catch (err: any) {
                toast(err.message || "An error occurred while deleting.", "error");
            }
        }
    };


    // Filter schedules
    const filteredSlots = slots.filter(slot => {
        const mentorObj = mentors.find(m => m.id === slot.mentorId);
        const collegeId = slot.college_id || mentorObj?.college_id || colleges[0]?.id || "";

        const matchesSearch = slot.course.toLowerCase().includes(scheduleSearchQuery.toLowerCase()) ||
            (mentorObj?.name || "").toLowerCase().includes(scheduleSearchQuery.toLowerCase()) ||
            slot.location.toLowerCase().includes(scheduleSearchQuery.toLowerCase());

        const matchesCollege = collegeFilter === "all" || collegeId === collegeFilter;
        const matchesDay = dayFilter === "all" || slot.day === dayFilter;
        const matchesShift = shiftFilter === "all" || slot.shift === shiftFilter;

        return matchesSearch && matchesCollege && matchesDay && matchesShift;
    });

    // Filter audit logs
    const filteredLogs = auditLogs.filter(log => {
        return log.description.toLowerCase().includes(logsSearchQuery.toLowerCase()) ||
            log.actorName.toLowerCase().includes(logsSearchQuery.toLowerCase()) ||
            formatRoleLabel(log.actorRole).toLowerCase().includes(logsSearchQuery.toLowerCase());
    });

    // Filter mentors
    const filteredMentors = mentors.filter(m => {
        const colName = colleges.find(c => c.id === m.college_id)?.name || "";
        const matchesCollege = mentorCollegeFilter === "all" || m.college_id === mentorCollegeFilter;
        return matchesCollege && (
            m.name.toLowerCase().includes(mentorSearchQuery.toLowerCase()) ||
            m.email.toLowerCase().includes(mentorSearchQuery.toLowerCase()) ||
            (m.mentor_group || m.subject_group || m.department || "").toLowerCase().includes(mentorSearchQuery.toLowerCase()) ||
            colName.toLowerCase().includes(mentorSearchQuery.toLowerCase()) ||
            (m.subjects || "").toLowerCase().includes(mentorSearchQuery.toLowerCase())
        );
    });

    // Filter subjects
    const filteredSubjects = (subjectsList || []).filter(s => {
        const matchesSearch = s.name.toLowerCase().includes(subjectSearchQuery.toLowerCase()) ||
            s.department.toLowerCase().includes(subjectSearchQuery.toLowerCase()) ||
            s.semester.toLowerCase().includes(subjectSearchQuery.toLowerCase()) ||
            (colleges.find(c => c.id === s.college_id)?.name || "").toLowerCase().includes(subjectSearchQuery.toLowerCase());
        const matchesCollege = subjectCollegeFilter === "all" || s.college_id === subjectCollegeFilter;
        const matchesSemester = subjectSemesterFilter === "all" || s.semester === subjectSemesterFilter;
        return matchesSearch && matchesCollege && matchesSemester;
    });

    const filteredUsers = (usersList || []).filter(u => {
        const matchesRole = usersRoleFilter === "all" || normalizeRoleValue(u.role) === usersRoleFilter;
        const matchesSearch =
            !usersSearchQuery ||
            (u.email || "").toLowerCase().includes(usersSearchQuery.toLowerCase()) ||
            (u.reference_id || "").toLowerCase().includes(usersSearchQuery.toLowerCase()) ||
            (u.id || "").toLowerCase().includes(usersSearchQuery.toLowerCase());
        return matchesRole && matchesSearch;
    });

    // Client-side pagination — the hook clamps the page and resets it whenever a
    // filter in resetKeys changes.
    const mentorPagination = usePagination(filteredMentors, {
        pageSize: 25,
        resetKeys: [mentorSearchQuery, mentorCollegeFilter],
    });
    const logsPagination = usePagination(filteredLogs, {
        pageSize: 25,
        resetKeys: [logsSearchQuery],
    });
    const subjectPagination = usePagination(filteredSubjects, {
        pageSize: 25,
        resetKeys: [subjectSearchQuery, subjectCollegeFilter, subjectSemesterFilter],
    });
    const usersPagination = usePagination(filteredUsers, {
        pageSize: 25,
        resetKeys: [usersRoleFilter, usersSearchQuery],
    });
    const kamPagination = usePagination(kamList, { pageSize: 25 });
    const camPagination = usePagination(camList, { pageSize: 25 });
    const schedulePagination = usePagination(filteredSlots, {
        pageSize: 25,
        resetKeys: [scheduleSearchQuery, collegeFilter, dayFilter, shiftFilter],
    });
    const monitoringPagination = usePagination(attRows, {
        pageSize: 25,
        resetKeys: [attSearch, attCollegeFilter, attDeptFilter, attBatchFilter, attStartDate, attEndDate, attSort.key, attSort.dir],
    });
    const feedbackPagination = usePagination(filteredFeedbackReports, {
        pageSize: 10,
        resetKeys: [feedbackSearch, feedbackStatusFilter, feedbackTypeFilter],
    });
    const announcementPagination = usePagination(announcements, { pageSize: 12 });
    const holidayPagination = usePagination(holidays, { pageSize: 25 });
    const signupPagination = usePagination(signupRequests, { pageSize: 25 });
    const smePagination = usePagination(smes || [], { pageSize: 25 });
    const sessionPagination = usePagination(loginHistory, { pageSize: 25 });

    return (
        <div className="flex-1 flex flex-col md:flex-row min-h-0 w-full max-w-[1680px] mx-auto px-4 md:px-10 md:gap-6 bg-warm-canvas text-slate-800 font-sans overflow-hidden">
            <AdminSidebar
                groups={ADMIN_NAV_GROUPS}
                activeTab={activeTab}
                onNavigate={(tab) => setActiveTab(tab as any)}
                collapsed={isCollapsed}
                onToggleCollapsed={() => setIsCollapsed(prev => {
                    const next = !prev;
                    localStorage.setItem("fp_sidebar_collapsed", String(next));
                    return next;
                })}
            />

            {/* Mobile Bottom Navigation — visible only on small screens */}
            <nav className="flex md:hidden fixed bottom-0 inset-x-0 z-50 mobile-bottom-nav">
                <div className="flex w-full justify-around items-center py-2 px-0.5">
                    {[
                        { id: "overview", label: "Home", icon: LayoutDashboard },
                        { id: "campuses", label: "Campuses", icon: Building2 },
                        { id: "mentors", label: "Faculty", icon: UserCheck },
                        { id: "schedules", label: "Schedules", icon: CalendarDays },
                        { id: "more_menu", label: "More", icon: Menu },
                    ].map(t => {
                        const Icon = t.icon;
                        const isActive = activeTab === t.id || (t.id === "more_menu" && MOBILE_MORE_TAB_IDS.includes(activeTab));
                        return (
                            <button
                                key={t.id}
                                onClick={() => setActiveTab(t.id as any)}
                                className={`relative flex flex-col items-center justify-center gap-0.5 flex-1 py-1.5 rounded-xl transition-all cursor-pointer ${isActive ? "text-indigo-600" : "text-slate-400"
                                    }`}
                            >
                                <Icon className={`h-4.5 w-4.5 transition-transform ${isActive ? "scale-110" : ""}`} />
                                <span className={`text-[8px] font-semibold tracking-wide leading-none ${isActive ? "text-indigo-600" : "text-slate-400"}`}>
                                    {t.label}
                                </span>
                                {isActive && <span className="absolute top-0 inset-x-1 h-0.5 bg-indigo-500 rounded-full" />}
                            </button>
                        );
                    })}
                </div>
            </nav>


            {/*  Main Scrollable Content Area — shared gutters and a single scroll container */}
            <main className="flex-1 min-w-0 min-h-0 overflow-x-hidden overflow-y-auto pt-3 md:pt-5 pb-24 md:pb-16 space-y-6 scroll-touch">

                {/* Campus Console — slide-over Sheet so the admin shell stays intact */}
                <Sheet open={!!drillDownCollegeId} onOpenChange={(open) => { if (!open) setDrillDownCollegeId(null); }}>
                    <SheetContent side="right" width="w-[95vw] max-w-6xl">
                        <SheetHeader>
                            <div>
                                <SheetTitle>
                                    Campus Console — {colleges.find(c => c.id === drillDownCollegeId)?.name || drillDownCollegeId}
                                </SheetTitle>
                                <SheetDescription>
                                    Viewing as Admin · read/write access to all campus data
                                </SheetDescription>
                            </div>
                        </SheetHeader>
                        <SheetBody>
                            {drillDownCollegeId && (
                                <CAMDashboard
                                    overrideCollegeId={drillDownCollegeId}
                                />
                            )}
                        </SheetBody>
                    </SheetContent>
                </Sheet>

                {/* Tab More Menu: Grid of remaining tabs */}
                {activeTab === "more_menu" && (
                    <div className="w-full max-w-[1600px] mx-auto space-y-6 animate-fadeIn pb-10">
                        <PageHeader
                            icon={Menu}
                            title="More Admin Portals"
                            subtitle="Additional administration workspaces."
                        />
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <button
                                type="button"
                                onClick={() => setActiveTab("courses")}
                                className="p-5 bg-white border border-slate-100 rounded-2xl text-left hover:border-[#D528A2] hover:ring-2 hover:ring-[#D528A2]/10 transition-all flex items-center gap-4 shadow-card cursor-pointer group"
                            >
                                <div className="h-10 w-10 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600 shrink-0 group-hover:scale-105 transition-transform">
                                    <Network className="h-5 w-5" />
                                </div>
                                <div>
                                    <span className="block text-xs font-bold text-slate-800">Academic Courses</span>
                                    <span className="text-[10px] text-slate-400 font-medium">Degree programs &amp; batches</span>
                                </div>
                            </button>

                            <button
                                type="button"
                                onClick={() => setActiveTab("subjects")}
                                className="p-5 bg-white border border-slate-100 rounded-2xl text-left hover:border-[#D528A2] hover:ring-2 hover:ring-[#D528A2]/10 transition-all flex items-center gap-4 shadow-card cursor-pointer group"
                            >
                                <div className="h-10 w-10 rounded-xl bg-teal-50 flex items-center justify-center text-teal-600 shrink-0 group-hover:scale-105 transition-transform">
                                    <GraduationCap className="h-5 w-5" />
                                </div>
                                <div>
                                    <span className="block text-xs font-bold text-slate-800">Subject Database</span>
                                    <span className="text-[10px] text-slate-400 font-medium">Course subjects &amp; hours</span>
                                </div>
                            </button>

                            <button
                                type="button"
                                onClick={() => setActiveTab("kams")}
                                className="p-5 bg-white border border-slate-100 rounded-2xl text-left hover:border-[#D528A2] hover:ring-2 hover:ring-[#D528A2]/10 transition-all flex items-center gap-4 shadow-card cursor-pointer group"
                            >
                                <div className="h-10 w-10 rounded-xl bg-amber-50 flex items-center justify-center text-amber-500 shrink-0 group-hover:scale-105 transition-transform">
                                    <Briefcase className="h-5 w-5" />
                                </div>
                                <div>
                                    <span className="block text-xs font-bold text-slate-800">Key Account Managers</span>
                                    <span className="text-[10px] text-slate-400 font-medium">KAM assignments &amp; portfolio</span>
                                </div>
                            </button>

                            <button
                                type="button"
                                onClick={() => setActiveTab("cams")}
                                className="p-5 bg-white border border-slate-100 rounded-2xl text-left hover:border-[#D528A2] hover:ring-2 hover:ring-[#D528A2]/10 transition-all flex items-center gap-4 shadow-card cursor-pointer group"
                            >
                                <div className="h-10 w-10 rounded-xl bg-purple-50 flex items-center justify-center text-purple-600 shrink-0 group-hover:scale-105 transition-transform">
                                    <Users className="h-5 w-5" />
                                </div>
                                <div>
                                    <span className="block text-xs font-bold text-slate-800">Campus Managers</span>
                                    <span className="text-[10px] text-slate-400 font-medium">Campus operations team</span>
                                </div>
                            </button>

                            <button
                                type="button"
                                onClick={() => setActiveTab("smes")}
                                className="p-5 bg-white border border-slate-100 rounded-2xl text-left hover:border-[#D528A2] hover:ring-2 hover:ring-[#D528A2]/10 transition-all flex items-center gap-4 shadow-card cursor-pointer group"
                            >
                                <div className="h-10 w-10 rounded-xl bg-rose-50 flex items-center justify-center text-rose-500 shrink-0 group-hover:scale-105 transition-transform">
                                    <BookOpen className="h-5 w-5" />
                                </div>
                                <div>
                                    <span className="block text-xs font-bold text-slate-800">Evaluator SMEs</span>
                                    <span className="text-[10px] text-slate-400 font-medium">SME evaluations &amp; allocation</span>
                                </div>
                            </button>

                            <button
                                type="button"
                                onClick={() => setActiveTab("users")}
                                className="p-5 bg-white border border-slate-100 rounded-2xl text-left hover:border-[#D528A2] hover:ring-2 hover:ring-[#D528A2]/10 transition-all flex items-center gap-4 shadow-card cursor-pointer group"
                            >
                                <div className="h-10 w-10 rounded-xl bg-slate-100 flex items-center justify-center text-slate-600 shrink-0 group-hover:scale-105 transition-transform">
                                    <ShieldCheck className="h-5 w-5" />
                                </div>
                                <div>
                                    <span className="block text-xs font-bold text-slate-800">User Credentials</span>
                                    <span className="text-[10px] text-slate-400 font-medium">User accounts &amp; credentials</span>
                                </div>
                            </button>

                            <button
                                type="button"
                                onClick={() => setActiveTab("holidays")}
                                className="p-5 bg-white border border-slate-100 rounded-2xl text-left hover:border-[#D528A2] hover:ring-2 hover:ring-[#D528A2]/10 transition-all flex items-center gap-4 shadow-card cursor-pointer group"
                            >
                                <div className="h-10 w-10 rounded-xl bg-orange-50 flex items-center justify-center text-orange-600 shrink-0 group-hover:scale-105 transition-transform">
                                    <Calendar className="h-5 w-5" />
                                </div>
                                <div>
                                    <span className="block text-xs font-bold text-slate-800">Holidays Calendar</span>
                                    <span className="text-[10px] text-slate-400 font-medium">Campus holiday calendar</span>
                                </div>
                            </button>

                            <button
                                type="button"
                                onClick={() => setActiveTab("announcements")}
                                className="p-5 bg-white border border-slate-100 rounded-2xl text-left hover:border-[#D528A2] hover:ring-2 hover:ring-[#D528A2]/10 transition-all flex items-center gap-4 shadow-card cursor-pointer group"
                            >
                                <div className="h-10 w-10 rounded-xl bg-pink-50 flex items-center justify-center text-pink-500 shrink-0 group-hover:scale-105 transition-transform">
                                    <Megaphone className="h-5 w-5" />
                                </div>
                                <div>
                                    <span className="block text-xs font-bold text-slate-800">Announcements</span>
                                    <span className="text-[10px] text-slate-400 font-medium">Campus announcements</span>
                                </div>
                            </button>

                            <button
                                type="button"
                                onClick={() => setActiveTab("logs")}
                                className="p-5 bg-white border border-slate-100 rounded-2xl text-left hover:border-[#D528A2] hover:ring-2 hover:ring-[#D528A2]/10 transition-all flex items-center gap-4 shadow-card cursor-pointer group sm:col-span-2"
                            >
                                <div className="h-10 w-10 rounded-xl bg-slate-900 text-white flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                                    <History className="h-5 w-5" />
                                </div>
                                <div>
                                    <span className="block text-xs font-bold text-slate-800">System Audit Logs</span>
                                    <span className="text-[10px] text-slate-400 font-medium">System activity &amp; audit logs</span>
                                </div>
                            </button>
                        </div>
                    </div>
                )}

                {activeTab === "overview" && (
                    <div className="w-full max-w-[1600px] mx-auto space-y-6">
                        <PageHeader
                            icon={LayoutDashboard}
                            title="Admin Control Console"
                            subtitle="Overview of all partner campuses and operations."
                            meta={
                                <div className="text-right">
                                    <span className="text-sm font-bold text-slate-900 block leading-tight">Campuses Directory</span>
                                    <span className="text-xs text-slate-400">{colleges.length} active campuses</span>
                                </div>
                            }
                        />

                        {/* ── KPI Stats Row ── */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">
                            {/* Card 1 */}
                            <div className="bg-white border border-slate-100 rounded-2xl p-4 md:p-6 shadow-card flex flex-col justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="h-8 w-8 rounded-xl bg-indigo-50 flex items-center justify-center shrink-0">
                                        <Building2 className="h-4 w-4 text-indigo-500" />
                                    </div>
                                    <span className="text-[11px] md:text-[13px] font-semibold tracking-[0.8px] text-gray-500 uppercase">Total Campuses</span>
                                </div>
                                <span className="text-[36px] md:text-[48px] font-bold text-gray-900 mt-3 block leading-none admin-kpi-value">{colleges.length}</span>
                                <span className="text-xs md:text-[14px] font-normal text-gray-400 mt-2 block">Active campuses</span>
                            </div>

                            {/* Card 2 */}
                            <div className="bg-white border border-slate-100 rounded-2xl p-4 md:p-6 shadow-card flex flex-col justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="h-8 w-8 rounded-xl bg-teal-50 flex items-center justify-center shrink-0">
                                        <Users className="h-4 w-4 text-teal-600" />
                                    </div>
                                    <span className="text-[11px] md:text-[13px] font-semibold tracking-[0.8px] text-gray-500 uppercase">Total Mentors</span>
                                </div>
                                <span className="text-[36px] md:text-[48px] font-bold text-gray-900 mt-3 block leading-none admin-kpi-value">{mentors.length}</span>
                                <span className="text-xs md:text-[14px] font-normal text-gray-400 mt-2 block">Across all campuses</span>
                            </div>

                            {/* Card 3 */}
                            <div className="bg-white border border-slate-100 rounded-2xl p-4 md:p-6 shadow-card flex flex-col justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="h-8 w-8 rounded-xl bg-amber-50 flex items-center justify-center shrink-0">
                                        <Grid className="h-4 w-4 text-amber-500" />
                                    </div>
                                    <span className="text-[11px] md:text-[13px] font-semibold tracking-[0.8px] text-gray-500 uppercase">Active Slots</span>
                                </div>
                                <div>
                                    <span className="text-[36px] md:text-[48px] font-bold text-gray-900 mt-3 block leading-none admin-kpi-value">{slots.length}</span>
                                    <div className="mt-3 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                        <div
                                            className="h-full rounded-full"
                                            style={{
                                                width: `${Math.min(100, Math.round((slots.length / 500) * 100))}%`,
                                                background: "linear-gradient(to right, #D528A2, #F4A863)"
                                            }}
                                        />
                                    </div>
                                    <span className="text-xs md:text-[14px] font-normal text-gray-400 mt-2 block">Out of 500 ({Math.round((slots.length / 500) * 100)}%)</span>
                                </div>
                            </div>

                            {/* Card 4 */}
                            <div className="bg-white border border-slate-100 rounded-2xl p-4 md:p-6 shadow-card flex flex-col justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="h-8 w-8 rounded-xl bg-rose-50 flex items-center justify-center shrink-0">
                                        <Layers className="h-4 w-4 text-rose-500" />
                                    </div>
                                    <span className="text-[11px] md:text-[13px] font-semibold tracking-[0.8px] text-gray-500 uppercase">Total Courses</span>
                                </div>
                                <span className="text-[36px] md:text-[48px] font-bold text-gray-900 mt-3 block leading-none admin-kpi-value">{coursesList.length}</span>
                                <span className="text-xs md:text-[14px] font-normal text-gray-400 mt-2 block">Courses available</span>
                            </div>
                        </div>
                    </div>
                )}

                {/* Tab content — one shared width and spacing rhythm */}
                <div className="w-full max-w-[1600px] mx-auto min-h-[400px] space-y-6">
                    {/* ── Tab: Overview ── */}
                    {activeTab === "overview" && (
                        <div className="space-y-6 animate-fadeIn text-xs">
                            {/* Split Screen: Campuses Summary & Reporting Hierarchy */}
                            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                                {/* Campuses Overview Card */}
                                <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-card flex flex-col">
                                    <div className="flex items-center gap-2 mb-4 pb-3 border-b border-gray-100">
                                        <Building2 className="h-5 w-5 text-indigo-600" />
                                        <h3 className="text-sm font-bold text-gray-900">Campus Breakdown</h3>
                                    </div>
                                    <div className="space-y-3 flex-grow overflow-y-auto max-h-[300px] pr-1">
                                        {colleges.map((col) => {
                                            const colMentors = mentors.filter(m => m.college_id === col.id);
                                            const colSlots = slots.filter(s => colMentors.some(m => m.id === s.mentorId));
                                            return (
                                                <div key={col.id} className="flex items-center justify-between p-3 bg-gray-50/50 hover:bg-gray-50 transition-all rounded-xl border border-gray-200/60">
                                                    <div>
                                                        <span className="font-extrabold text-gray-900 block">{col.name}</span>
                                                        <span className="text-[10px] text-gray-400 font-semibold">{col.address || "No address"}</span>
                                                    </div>
                                                    <div className="flex gap-2">
                                                        <span className="bg-teal-50 border border-teal-100 text-teal-700 px-2 py-0.5 rounded-full text-[9px] font-bold whitespace-nowrap">
                                                            {colMentors.length} Mentors
                                                        </span>
                                                        <span className="bg-indigo-50 border border-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full text-[9px] font-bold whitespace-nowrap">
                                                            {colSlots.length} Slots
                                                        </span>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                        {colleges.length === 0 && (
                                            <p className="text-gray-500 italic text-center py-8">No colleges registered yet.</p>
                                        )}
                                    </div>
                                </div>

                                {/* Hierarchy Quick Tree */}
                                <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-card flex flex-col">
                                    <div className="flex items-center gap-2 mb-4 pb-3 border-b border-gray-100">
                                        <Network className="h-5 w-5 text-indigo-600" />
                                        <h3 className="text-sm font-bold text-gray-900">System Hierarchy</h3>
                                    </div>
                                    <p className="text-[10px] text-gray-500 font-semibold mb-3 leading-relaxed">
                                        Interactive Reporting Chain of Command (Super Admin → Key Account Managers → Campuses)
                                    </p>
                                    <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 shadow-inner space-y-3 max-h-[300px] overflow-y-auto text-xs">
                                        {/* Super Admin Level */}
                                        <div className="space-y-2">
                                            <div
                                                onClick={() => toggleNode("admin")}
                                                className="flex items-center gap-2 p-2.5 bg-white border border-indigo-200 rounded-xl shadow-xs cursor-pointer hover:border-indigo-300 transition-all"
                                            >
                                                {expandedNodes["admin"] ? <ChevronDown className="h-3.5 w-3.5 text-indigo-600 shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 text-indigo-600 shrink-0" />}
                                                <div className="h-6 w-6 rounded-full bg-indigo-600 text-white flex items-center justify-center font-black text-[9px] shrink-0">SU</div>
                                                <div className="min-w-0">
                                                    <div className="font-bold text-gray-900 text-xs truncate">Super Admin</div>
                                                    <div className="text-[9px] text-gray-500 truncate">{currentAdmin?.name || "System Admin"}</div>
                                                </div>
                                            </div>

                                            {expandedNodes["admin"] && (
                                                <div className="pl-6 border-l border-dashed border-gray-300 ml-4 space-y-2 pt-1">
                                                    {kamList.map(kam => {
                                                        const kamNodeId = `kam-${kam.id}`;
                                                        const kamColleges = colleges.filter(c => c.kam_id === kam.id);
                                                        return (
                                                            <div key={kam.id} className="space-y-1">
                                                                <div
                                                                    onClick={() => toggleNode(kamNodeId)}
                                                                    className="flex items-center gap-2 p-2 bg-white border border-slate-100 rounded-2xl shadow-card cursor-pointer hover:border-indigo-200 transition-all"
                                                                >
                                                                    {expandedNodes[kamNodeId] ? <ChevronDown className="h-3 w-3 text-gray-500 shrink-0" /> : <ChevronRight className="h-3 w-3 text-gray-500 shrink-0" />}
                                                                    <div className="h-5 w-5 rounded-full bg-amber-500 text-white flex items-center justify-center font-black text-[8px] shrink-0">KAM</div>
                                                                    <div className="min-w-0">
                                                                        <div className="font-bold text-gray-900 text-[10.5px] truncate">{kam.name}</div>
                                                                        <div className="text-[8.5px] text-gray-400 truncate">{kamColleges.length} Campus(es)</div>
                                                                    </div>
                                                                </div>
                                                                {expandedNodes[kamNodeId] && (
                                                                    <div className="pl-6 border-l border-dashed border-gray-300 ml-3 space-y-1 pt-1">
                                                                        {kamColleges.map(col => (
                                                                            <div key={col.id} className="flex items-center gap-1.5 p-1.5 bg-white border border-gray-200 rounded-lg text-[9.5px] text-gray-700">
                                                                                <Building2 className="h-3 w-3 text-gray-500 shrink-0" />
                                                                                <span className="font-extrabold truncate">{col.name}</span>
                                                                            </div>
                                                                        ))}
                                                                        {kamColleges.length === 0 && <span className="text-[9px] text-gray-500 italic pl-2 block">No campuses assigned</span>}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        );
                                                    })}
                                                    {kamList.length === 0 && <span className="text-[9.5px] text-gray-500 italic pl-2 block">No Key Account Managers registered</span>}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Recent Audit Logs Summary */}
                            <Card>
                                <CardHeader>
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <History className="h-5 w-5 text-indigo-600" />
                                            <CardTitle>Recent Audit Logs</CardTitle>
                                        </div>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => setActiveTab("logs")}
                                        >
                                            View All Logs →
                                        </Button>
                                    </div>
                                </CardHeader>
                                <CardContent>
                                    <div className="overflow-x-auto rounded-xl border border-gray-200">
                                        <Table>
                                            <TableHeader>
                                                <TableRow>
                                                    <TableHead>Timestamp</TableHead>
                                                    <TableHead>Actor</TableHead>
                                                    <TableHead>Role</TableHead>
                                                    <TableHead>Description</TableHead>
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {filteredLogs.length === 0 ? (
                                                    <TableRow>
                                                        <TableCell colSpan={4} className="h-32 text-center">
                                                            <div className="flex flex-col items-center gap-2 text-gray-400">
                                                                <History className="h-8 w-8" />
                                                                <p className="text-sm font-semibold">No logs recorded yet.</p>
                                                            </div>
                                                        </TableCell>
                                                    </TableRow>
                                                ) : (
                                                    filteredLogs.slice(0, 5).map((log) => (
                                                        <TableRow key={log.id}>
                                                            <TableCell className="text-gray-500 whitespace-nowrap">{formatDate(log.timestamp)}</TableCell>
                                                            <TableCell className="font-bold text-gray-900">{log.actorName}</TableCell>
                                                            <TableCell>
                                                                <Badge variant="default" className="text-[9px]">
                                                                    {formatRoleLabel(log.actorRole)}
                                                                </Badge>
                                                            </TableCell>
                                                            <TableCell className="text-gray-600">{log.description}</TableCell>
                                                        </TableRow>
                                                    ))
                                                )}
                                            </TableBody>
                                        </Table>
                                    </div>
                                </CardContent>
                            </Card>
                        </div>
                    )}

                    {/* ── Tab: Campuses ── */}
                    {activeTab === "campuses" && (
                        <div className="space-y-6">
                            <PageHeader
                                icon={Building2}
                                title="Campuses"
                                subtitle="Manage all active university campuses."
                                actions={
                                    <Button variant="ghost"
                                        onClick={() => handleOpenCampusModal()}
                                        className="h-auto btn-gradient px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-sm text-white"
                                    >
                                        <Plus className="h-4 w-4" />
                                        Add Campus
                                    </Button>
                                }
                            />

                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                {/* ── UNFINISHED DRAFT CARD ── */}
                                {draftLastSaved && (
                                    <div className="lg:col-span-3 bg-white p-6 rounded-xl border-2 border-amber-200/90 shadow-card space-y-4 relative overflow-hidden animate-fadeIn">
                                        <div className="flex items-center justify-between flex-wrap gap-4 border-b border-gray-100 pb-4">
                                            <div className="flex items-center gap-3.5">
                                                <div className="p-3 rounded-xl bg-amber-50 text-amber-600 border border-amber-200">
                                                    <Sparkles className="h-5 w-5 text-amber-600 animate-pulse" />
                                                </div>
                                                <div>
                                                    <div className="flex items-center gap-2.5 flex-wrap">
                                                        <h3 className="font-extrabold text-base text-gray-900 tracking-tight">
                                                            Unfinished Campus Setup: <span className="text-indigo-600">{campusForm.name || "Untitled Campus"}</span>
                                                        </h3>
                                                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-amber-50 text-amber-700 border border-amber-200 flex items-center gap-1.5 shadow-2xs">
                                                            <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
                                                            Draft Auto-Saved ({draftLastSaved})
                                                        </span>
                                                    </div>
                                                    <p className="text-xs text-gray-500 font-semibold mt-1 flex items-center gap-2 flex-wrap">
                                                        <span>Step {campusWizardStep} of 4</span>
                                                        <span>•</span>
                                                        <span>{wizardCourses.length} Course(s) Added</span>
                                                        {campusForm.address && (
                                                            <>
                                                                <span>•</span>
                                                                <span className="flex items-center gap-1 text-gray-600">
                                                                    <MapPin className="h-3 w-3 text-gray-400" />
                                                                    {campusForm.address}
                                                                </span>
                                                            </>
                                                        )}
                                                    </p>
                                                </div>
                                            </div>

                                            <div className="flex items-center gap-3">
                                                <Button variant="ghost"
                                                    type="button"
                                                    onClick={clearCampusDraftFromDb}
                                                    className="h-auto px-4 py-2 rounded-xl text-xs font-bold text-gray-600 hover:text-rose-600 bg-gray-100 hover:bg-rose-50 border border-gray-200 hover:border-rose-200 transition-all cursor-pointer"
                                                >
                                                    Discard Draft
                                                </Button>
                                                <Button variant="ghost"
                                                    type="button"
                                                    onClick={() => handleOpenCampusModal()}
                                                    className="h-auto px-5 py-2 rounded-xl text-xs font-extrabold btn-gradient shadow-sm flex items-center gap-1.5 cursor-pointer"
                                                >
                                                    Resume Setup →
                                                </Button>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {colleges.map((col) => {
                                    const colMentors = mentors.filter(m => m.college_id === col.id);
                                    const colSlots = slots.filter(s => colMentors.some(m => m.id === s.mentorId));
                                    const colDeptsCount = Array.from(new Set(colMentors.map(m => m.mentor_group).filter(Boolean))).length;
                                    const cam = camList.find(cm => cm.college_id === col.id);
                                    const kamOwner = kamList.find(k => k.id === col.kam_id);

                                    // Helper to split long titles elegantly
                                    const renderCampusName = (name: string) => {
                                        if (name.includes(" of ")) {
                                            const parts = name.split(" of ");
                                            return (
                                                <>
                                                    <div className="text-[20px] font-semibold text-gray-900 leading-snug">{parts[0]}</div>
                                                    <div className="text-[13px] font-medium text-gray-400 mt-0.5">of {parts[1]}</div>
                                                </>
                                            );
                                        }
                                        return <div className="text-[20px] font-semibold text-gray-900 leading-snug">{name}</div>;
                                    };

                                    return (
                                        <div key={col.id} className="p-6 rounded-xl border border-gray-200 bg-white hover:shadow-md transition-all flex flex-col justify-between min-h-[320px] relative overflow-hidden group">
                                            {/* Shift badge in top-right corner with 12px padding */}
                                            <div className="absolute top-3 right-3">
                                                <span className={`px-2 py-0.5 rounded text-[8.5px] font-black uppercase tracking-wider ${col.has_shifts === 0
                                                    ? "bg-amber-50 text-amber-700 border border-amber-200"
                                                    : "bg-teal-50 text-teal-700 border border-teal-200"
                                                    }`}>
                                                    {col.has_shifts === 0 ? "General Shift Only" : "Multi-Shift"}
                                                </span>
                                            </div>

                                            <div className="space-y-4">
                                                <div>
                                                    {renderCampusName(col.name)}
                                                    <p className="text-[13px] text-gray-400 mt-1 flex items-center gap-1 font-medium">
                                                        <MapPin className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                                                        {col.address || "No Address Added"}
                                                    </p>
                                                </div>

                                                {/* Fixed width label columns (120px label, remaining value) */}
                                                <div className="bg-gray-50 border border-gray-200 rounded-xl p-3.5 text-[13px] space-y-1.5">
                                                    <div className="flex text-gray-500">
                                                        <span className="w-[120px] shrink-0 font-medium">KAM Owner</span>
                                                        <span className="font-bold text-gray-900">: {kamOwner ? kamOwner.name : "Unassigned"}</span>
                                                    </div>
                                                    <div className="flex text-gray-500">
                                                        <span className="w-[120px] shrink-0 font-medium">Campus Manager</span>
                                                        <span className="font-bold text-gray-900">: {cam ? cam.name : "Unassigned"}</span>
                                                    </div>
                                                </div>

                                                {/* Statistics Row: Symmetrical vertical layout */}
                                                <div className="grid grid-cols-3 gap-2.5 text-center">
                                                    <div className="bg-gray-50 p-2 rounded-xl border border-gray-100 flex flex-col items-center justify-center">
                                                        <div className="font-bold text-gray-900 text-lg leading-none">{colMentors.length}</div>
                                                        <div className="text-[10px] text-gray-400 font-semibold mt-1">Faculty</div>
                                                    </div>
                                                    <div className="bg-gray-50 p-2 rounded-xl border border-gray-100 flex flex-col items-center justify-center">
                                                        <div className="font-bold text-gray-900 text-lg leading-none">{colSlots.length}</div>
                                                        <div className="text-[10px] text-gray-400 font-semibold mt-1">Slots</div>
                                                    </div>
                                                    <div className="bg-gray-50 p-2 rounded-xl border border-gray-100 flex flex-col items-center justify-center">
                                                        <div className="font-bold text-gray-900 text-lg leading-none">{colDeptsCount}</div>
                                                        <div className="text-[10px] text-gray-400 font-semibold mt-1">Depts</div>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Bottom Buttons: Manage Campus button first, edit/delete with 20px gap below */}
                                            <div className="flex flex-col gap-3 mt-auto pt-4 border-t border-gray-100">
                                                <Button variant="ghost"
                                                    onClick={() => setDrillDownCollegeId(col.id)}
                                                    className="h-auto w-full btn-gradient font-bold py-2.5 rounded-xl text-xs text-white transition-all shadow-sm flex items-center justify-center gap-1.5 cursor-pointer"
                                                >
                                                    Manage Campus Console
                                                </Button>
                                                <div className="flex justify-center gap-5">
                                                    <Button variant="ghost" size="icon"
                                                        onClick={() => handleOpenCampusModal(col)}
                                                        title="Edit Campus Details"
                                                        className="h-auto w-auto p-2 bg-gray-50 border border-gray-200 text-gray-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all cursor-pointer"
                                                    >
                                                        <Edit className="h-4 w-4" />
                                                    </Button>
                                                    <Button variant="ghost" size="icon"
                                                        onClick={() => handleDeleteCampus(col.id)}
                                                        disabled={loadingActions[`campus_${col.id}`]}
                                                        title="Delete Campus"
                                                        className="h-auto w-auto p-2 bg-gray-50 border border-gray-200 text-gray-500 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                                                    >
                                                        {loadingActions[`campus_${col.id}`] ? (
                                                            <Loader2 className="h-4 w-4 animate-spin" />
                                                        ) : (
                                                            <Trash2 className="h-4 w-4" />
                                                        )}
                                                    </Button>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* ── Tab: Key Account Managers ── */}
                    {activeTab === "kams" && (
                        <div className="space-y-6 animate-fadeIn">
                            <PageHeader
                                icon={Briefcase}
                                title="Key Account Managers"
                                subtitle="Portfolio owners and the campuses assigned to them."
                                actions={
                                    <Button variant="ghost"
                                        onClick={() => handleOpenKamModal()}
                                        className="h-auto btn-gradient shadow-sm text-white px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
                                    >
                                        <Plus className="h-4 w-4" />
                                        Add KAM
                                    </Button>
                                }
                            />

                            <TableSurface
                                className="border-gray-200"
                                footer={
                                    <Pagination
                                        currentPage={kamPagination.page}
                                        totalItems={kamList.length}
                                        pageSize={kamPagination.pageSize}
                                        onPageChange={kamPagination.setPage}
                                        onPageSizeChange={kamPagination.setPageSize}
                                        pageSizeOptions={kamPagination.pageSizeOptions}
                                    />
                                }
                            >
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Name</TableHead>
                                        <TableHead className="hidden md:table-cell">Email</TableHead>
                                        <TableHead className="hidden lg:table-cell">Role Title</TableHead>
                                        <TableHead className="hidden sm:table-cell">Assigned Campuses</TableHead>
                                        <TableHead className="hidden lg:table-cell text-center">Managed Mentors</TableHead>
                                        <TableHead className="hidden xl:table-cell text-center">Total Scheduled Hours</TableHead>
                                        <TableHead className="text-right">Actions</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {isKamsError ? (
                                        <TableRow>
                                            <TableCell colSpan={7} className="h-32 text-center">
                                                <div className="flex flex-col items-center gap-3 text-rose-500">
                                                    <AlertTriangle className="h-8 w-8" />
                                                    <p className="text-sm font-semibold">Could not load Key Account Managers. The KAM directory may be temporarily unavailable.</p>
                                                    <Button variant="outline" size="sm" onClick={() => kamDirectoryQuery.refetch()} isLoading={isKamsLoading}>
                                                        Retry
                                                    </Button>
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    ) : isKamsLoading && kamList.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={7} className="h-32 text-center">
                                                <div className="flex flex-col items-center gap-2 text-gray-400">
                                                    <Loader2 className="h-7 w-7 animate-spin text-indigo-500" />
                                                    <p className="text-sm font-semibold">Loading Key Account Managers…</p>
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    ) : kamList.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={7} className="h-32 text-center">
                                                <div className="flex flex-col items-center gap-2 text-gray-400">
                                                    <Briefcase className="h-8 w-8" />
                                                    <p className="text-sm font-semibold">No Key Account Managers found. Click "Add KAM" to create one.</p>
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    ) : (
                                        kamPagination.pageItems.map((kam) => {
                                            const kamColleges = colleges.filter(c => c.kam_id === kam.id);
                                            const kamMentors = mentors.filter(m => kamColleges.some(c => c.id === m.college_id));
                                            const kamSlots = slots.filter(s => kamMentors.some(m => m.id === s.mentorId));
                                            return (
                                                <TableRow key={kam.id}>
                                                    <TableCell className="font-bold text-gray-950">
                                                        <div className="flex items-center gap-2">
                                                            <div className="h-7 w-7 rounded-full bg-indigo-50 border border-indigo-200 text-indigo-600 flex items-center justify-center font-extrabold text-[10px]">
                                                                {((kam.name || "").split(" ").filter(Boolean).map((w: string) => w[0]).join("") || "?")}
                                                            </div>
                                                            {kam.name || "—"}
                                                        </div>
                                                    </TableCell>
                                                    <TableCell className="hidden md:table-cell text-gray-500">{kam.email}</TableCell>
                                                    <TableCell className="hidden lg:table-cell text-gray-800">{kam.title}</TableCell>
                                                    <TableCell className="hidden sm:table-cell">
                                                        <div className="flex flex-wrap gap-1">
                                                            {kamColleges.map(c => (
                                                                <Badge key={c.id} variant="secondary">{c.name}</Badge>
                                                            ))}
                                                            {kamColleges.length === 0 && <span className="text-gray-400 italic text-xs">None</span>}
                                                        </div>
                                                    </TableCell>
                                                    <TableCell className="hidden lg:table-cell text-center font-bold">{kamMentors.length}</TableCell>
                                                    <TableCell className="hidden xl:table-cell text-center font-black text-indigo-600">{kamSlots.length} slot(s)</TableCell>
                                                    <TableCell className="text-right">
                                                        <div className="flex justify-end gap-1.5">
                                                            <Button variant="outline" size="icon" onClick={() => handleOpenKamModal(kam)}>
                                                                <Edit className="h-3.5 w-3.5" />
                                                            </Button>
                                                            <Button
                                                                variant="destructive"
                                                                size="icon"
                                                                onClick={() => handleDeleteKam(kam.id)}
                                                                isLoading={loadingActions[`kam_${kam.id}`]}
                                                            >
                                                                <Trash2 className="h-3.5 w-3.5" />
                                                            </Button>
                                                        </div>
                                                    </TableCell>
                                                </TableRow>
                                            );
                                        })
                                    )}
                                </TableBody>
                            </TableSurface>

                            {/* ── Charts Row ── */}
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                {/* Donut: Mentors Overview */}
                                <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-card space-y-3">
                                    <div className="flex items-center justify-between">
                                        <h3 className="text-sm font-bold text-gray-900">Mentors Overview</h3>
                                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 font-semibold">This Month</span>
                                    </div>
                                    <div className="flex items-center gap-5">
                                        {/* SVG donut — computed from real mentor data */}
                                        {(() => {
                                            const activeCount = mentors.filter(m => !m || (m as any).status === "Active" || !(m as any).status).length;
                                            const inactiveCount = mentors.filter(m => m && (m as any).status === "Inactive").length;
                                            const onLeaveCount = mentors.length - activeCount - inactiveCount;
                                            const total = mentors.length || 1;
                                            const activePct = activeCount / total;
                                            const leavePct = Math.max(0, onLeaveCount) / total;
                                            const inactivePct = inactiveCount / total;
                                            const C = 2 * Math.PI * 34;
                                            return (
                                                <>
                                                    <div className="relative flex-shrink-0">
                                                        <svg width="90" height="90" viewBox="0 0 90 90">
                                                            <circle cx="45" cy="45" r="34" fill="none" stroke="#e5e7eb" strokeWidth="12" />
                                                            <circle cx="45" cy="45" r="34" fill="none" stroke="#6366f1" strokeWidth="12"
                                                                strokeDasharray={`${Math.round(C * activePct)} ${Math.round(C)}`}
                                                                strokeDashoffset={Math.round(C * 0.25)} strokeLinecap="round" />
                                                            <circle cx="45" cy="45" r="34" fill="none" stroke="#f59e0b" strokeWidth="12"
                                                                strokeDasharray={`${Math.round(C * leavePct)} ${Math.round(C)}`}
                                                                strokeDashoffset={Math.round(-(C * activePct - C * 0.25))} strokeLinecap="round" />
                                                            <circle cx="45" cy="45" r="34" fill="none" stroke="#f43f5e" strokeWidth="12"
                                                                strokeDasharray={`${Math.round(C * inactivePct)} ${Math.round(C)}`}
                                                                strokeDashoffset={Math.round(-(C * (activePct + leavePct) - C * 0.25))} strokeLinecap="round" />
                                                            <text x="45" y="49" textAnchor="middle" fontSize="14" fontWeight="800" fill="currentColor">{mentors.length}</text>
                                                            <text x="45" y="60" textAnchor="middle" fontSize="8" fill="#9ca3af">Total</text>
                                                        </svg>
                                                    </div>
                                                    <div className="space-y-1.5 text-[11px]">
                                                        <div className="flex items-center gap-2">
                                                            <span className="h-2.5 w-2.5 rounded-full bg-indigo-500 shrink-0" />
                                                            <span className="text-gray-600">Active</span>
                                                            <span className="ml-auto font-bold text-gray-900">{activeCount} ({total > 0 ? (activePct * 100).toFixed(1) : "0.0"}%)</span>
                                                        </div>
                                                        <div className="flex items-center gap-2">
                                                            <span className="h-2.5 w-2.5 rounded-full bg-amber-400 shrink-0" />
                                                            <span className="text-gray-600">On Leave</span>
                                                            <span className="ml-auto font-bold text-gray-900">{Math.max(0, onLeaveCount)} ({total > 0 ? (leavePct * 100).toFixed(1) : "0.0"}%)</span>
                                                        </div>
                                                        <div className="flex items-center gap-2">
                                                            <span className="h-2.5 w-2.5 rounded-full bg-rose-400 shrink-0" />
                                                            <span className="text-gray-600">Inactive</span>
                                                            <span className="ml-auto font-bold text-gray-900">{inactiveCount} ({total > 0 ? (inactivePct * 100).toFixed(1) : "0.0"}%)</span>
                                                        </div>
                                                    </div>
                                                </>
                                            );
                                        })()}
                                    </div>
                                </div>

                                {/* Scheduled Slots by Day */}
                                <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-card space-y-3">
                                    <div className="flex items-center justify-between">
                                        <h3 className="text-sm font-bold text-gray-900">Scheduled Slots by Day</h3>
                                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 font-semibold">{slots.length} Total Slots</span>
                                    </div>
                                    {(() => {
                                        const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
                                        const dayFull = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
                                        const counts = dayFull.map(d => slots.filter(s => s.day === d).length);
                                        const maxCount = Math.max(1, ...counts);
                                        return (
                                            <div className="h-[90px] flex items-end justify-between gap-2 pt-2">
                                                {days.map((day, idx) => {
                                                    const count = counts[idx];
                                                    const heightPct = Math.round((count / maxCount) * 100);
                                                    return (
                                                        <div key={day} className="flex-1 flex flex-col items-center gap-1.5 h-full justify-end">
                                                            <span className="text-[9px] font-bold text-gray-600">{count}</span>
                                                            <div className="w-full bg-gray-100 rounded-t h-[55px] flex items-end overflow-hidden">
                                                                <div
                                                                    className="w-full bg-indigo-500 rounded-t transition-all duration-300"
                                                                    style={{ height: `${Math.max(4, heightPct)}%` }}
                                                                    title={`${dayFull[idx]}: ${count} slots`}
                                                                />
                                                            </div>
                                                            <span className="text-[9px] text-gray-400 font-medium">{day}</span>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        );
                                    })()}
                                </div>

                                {/* System Activity feed */}
                                <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-card space-y-3">
                                    <h3 className="text-sm font-bold text-gray-900">System Activity</h3>
                                    <div className="space-y-3">
                                        {auditLogs.length === 0 ? (
                                            <p className="text-[10px] text-gray-400 italic">No recent activity.</p>
                                        ) : auditLogs.slice(0, 4).map((log, i) => {
                                            const isBooking = log.type === "booking";
                                            const isHandover = log.type?.includes("handover");
                                            const isAssignment = log.type === "assignment";
                                            const IconComp = isBooking ? Grid : isHandover ? History : isAssignment ? UserCheck : ShieldCheck;
                                            const colorClass = isBooking ? "bg-amber-50 text-amber-600" : isHandover ? "bg-indigo-50 text-indigo-600" : isAssignment ? "bg-emerald-50 text-emerald-600" : "bg-slate-100 text-slate-600";
                                            const timeAgo = (() => {
                                                try {
                                                    const diff = Date.now() - new Date(log.timestamp).getTime();
                                                    const mins = Math.floor(diff / 60000);
                                                    if (mins < 60) return `${mins}m ago`;
                                                    const hrs = Math.floor(mins / 60);
                                                    if (hrs < 24) return `${hrs}h ago`;
                                                    return `${Math.floor(hrs / 24)}d ago`;
                                                } catch { return ""; }
                                            })();
                                            return (
                                                <div key={i} className="flex items-start gap-3">
                                                    <div className={`h-7 w-7 rounded-lg ${colorClass} flex items-center justify-center shrink-0`}>
                                                        <IconComp className="h-3.5 w-3.5" />
                                                    </div>
                                                    <div className="min-w-0 flex-1">
                                                        <p className="text-[11px] font-bold text-gray-900 leading-tight capitalize">{(log.type || "activity").replace(/_/g, " ")}</p>
                                                        <p className="text-[10px] text-gray-400 truncate">{log.description?.slice(0, 80) || "—"}</p>
                                                    </div>
                                                    <span className="text-[9px] text-gray-400 whitespace-nowrap shrink-0">{timeAgo}</span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* ── Tab: Campus Managers ── */}
                    {activeTab === "cams" && (
                        <div className="space-y-6 animate-fadeIn">
                            <PageHeader
                                icon={Users}
                                title="Campus Managers"
                                subtitle="Campus operations team and their reporting lines."
                                actions={
                                    <Button variant="ghost"
                                        onClick={() => handleOpenCamModal()}
                                        className="h-auto btn-gradient shadow-sm text-white px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
                                    >
                                        <Plus className="h-4 w-4" />
                                        Add Campus Manager
                                    </Button>
                                }
                            />

                            <TableSurface
                                className="border-gray-200"
                                footer={
                                    <Pagination
                                        currentPage={camPagination.page}
                                        totalItems={camList.length}
                                        pageSize={camPagination.pageSize}
                                        onPageChange={camPagination.setPage}
                                        onPageSizeChange={camPagination.setPageSize}
                                        pageSizeOptions={camPagination.pageSizeOptions}
                                    />
                                }
                            >
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Name</TableHead>
                                        <TableHead className="hidden md:table-cell">Email Address</TableHead>
                                        <TableHead>Reporting Campus</TableHead>
                                        <TableHead className="hidden lg:table-cell">Reporting KAM Manager</TableHead>
                                        <TableHead className="hidden lg:table-cell text-center">Courses</TableHead>
                                        <TableHead className="hidden xl:table-cell text-center">Faculty Count</TableHead>
                                        <TableHead className="hidden xl:table-cell text-center">Slots Booked</TableHead>
                                        <TableHead className="text-right">Actions</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {isUsersError ? (
                                        <TableRow>
                                            <TableCell colSpan={8} className="h-32 text-center">
                                                <div className="flex flex-col items-center gap-3 text-rose-500">
                                                    <AlertTriangle className="h-8 w-8" />
                                                    <p className="text-sm font-semibold">Could not load Campus Managers. The credential directory may be temporarily unavailable.</p>
                                                    <Button variant="outline" size="sm" onClick={() => usersQuery.refetch()} isLoading={isUsersLoading}>
                                                        Retry
                                                    </Button>
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    ) : isUsersLoading && camList.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={8} className="h-32 text-center">
                                                <div className="flex flex-col items-center gap-2 text-gray-400">
                                                    <Loader2 className="h-7 w-7 animate-spin text-indigo-500" />
                                                    <p className="text-sm font-semibold">Loading Campus Managers…</p>
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    ) : camList.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={8} className="h-32 text-center">
                                                <div className="flex flex-col items-center gap-2 text-gray-400">
                                                    <Users className="h-8 w-8" />
                                                    <p className="text-sm font-semibold">No Campus Managers found. Click "Add Campus Manager" to create one.</p>
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    ) : (
                                        camPagination.pageItems.map((cam) => {
                                            const colObj = colleges.find(c => c.id === cam.college_id);
                                            const kamObj = kamList.find(k => k.id === cam.kam_id);

                                            const camMentors = mentors.filter(m => m.college_id === cam.college_id);
                                            const camSlots = slots.filter(s => camMentors.some(m => m.id === s.mentorId));
                                            const camDeptsCount = Array.from(new Set(camMentors.map(m => m.mentor_group).filter(Boolean))).length;

                                            return (
                                                <TableRow key={cam.id}>
                                                    <TableCell className="font-bold text-gray-950">
                                                        <div className="flex items-center gap-2">
                                                            <div className="h-7 w-7 rounded-full bg-indigo-50 border border-indigo-200 text-indigo-600 flex items-center justify-center font-extrabold text-[10px]">
                                                                {((cam.name || "").split(" ").filter(Boolean).map((w: string) => w[0]).join("") || "?")}
                                                            </div>
                                                            {cam.name || "—"}
                                                        </div>
                                                    </TableCell>
                                                    <TableCell className="hidden md:table-cell text-gray-500">{cam.email}</TableCell>
                                                    <TableCell className="font-bold">{cam.college_name || (colObj ? colObj.name : "Unassigned")}</TableCell>
                                                    <TableCell className="hidden lg:table-cell text-gray-600">{kamObj ? kamObj.name : "Unassigned"}</TableCell>
                                                    <TableCell className="hidden lg:table-cell text-center font-bold">{camDeptsCount}</TableCell>
                                                    <TableCell className="hidden xl:table-cell text-center font-bold">{camMentors.length}</TableCell>
                                                    <TableCell className="hidden xl:table-cell text-center font-black text-indigo-600">{camSlots.length}</TableCell>
                                                    <TableCell className="text-right">
                                                        <div className="flex justify-end gap-1.5">
                                                            <Button
                                                                variant="outline"
                                                                size="icon"
                                                                onClick={() => handleOpenCamModal(cam)}
                                                            >
                                                                <Edit className="h-3.5 w-3.5" />
                                                            </Button>
                                                            <Button
                                                                variant="destructive"
                                                                size="icon"
                                                                onClick={() => handleDeleteCam(cam.id)}
                                                                isLoading={loadingActions[`cam_${cam.id}`]}
                                                            >
                                                                <Trash2 className="h-3.5 w-3.5" />
                                                            </Button>
                                                        </div>
                                                    </TableCell>
                                                </TableRow>
                                            );
                                        })
                                    )}
                                </TableBody>
                            </TableSurface>
                        </div>
                    )}

                    {/* ── Tab: Faculty Mentors ── */}
                    {activeTab === "mentors" && (
                        <div className="space-y-6 animate-fadeIn">
                            <PageHeader
                                icon={UserCheck}
                                title="Faculty Mentors"
                                subtitle="Faculty directory, subject mappings and campus assignments."
                                actions={
                                    <div className="flex flex-wrap items-center gap-2">
                                        {/* Import target campus (drives Template + Bulk Import) */}
                                        <div className="flex items-center gap-1.5 bg-gray-50 border border-gray-200 rounded-xl px-2.5 py-1.5 text-xs" title="Campus used by Template and Bulk Import">
                                            <Building2 className="h-4 w-4 text-indigo-600 shrink-0" />
                                            <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Import</span>
                                            <Select aria-label="Import campus"
                                                value={templateCollegeId}
                                                onChange={(e) => setTemplateCollegeId(e.target.value)}
                                                className="bg-transparent font-bold text-gray-800 focus:outline-none cursor-pointer py-0 text-xs max-w-[180px] truncate"
                                            >
                                                {colleges.map((c) => (
                                                    <option key={c.id} value={c.id}>
                                                        {c.name}
                                                    </option>
                                                ))}
                                            </Select>
                                        </div>

                                        {/* Campus filter for the directory list */}
                                        <div className="flex items-center gap-1.5 bg-gray-50 border border-gray-200 rounded-xl px-2.5 py-1.5 text-xs">
                                            <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Campus</span>
                                            <Select aria-label="Filter mentors by campus"
                                                value={mentorCollegeFilter}
                                                onChange={(e) => setMentorCollegeFilter(e.target.value)}
                                                className="bg-transparent font-bold text-gray-800 focus:outline-none cursor-pointer py-0 text-xs max-w-[180px] truncate"
                                            >
                                                <option value="all">All Campuses</option>
                                                {colleges.map((c) => (
                                                    <option key={c.id} value={c.id}>
                                                        {c.name}
                                                    </option>
                                                ))}
                                            </Select>
                                        </div>

                                        {/* Template Download Button */}
                                        <Button variant="ghost"
                                            type="button"
                                            onClick={handleDownloadFacultyTemplate}
                                            className="h-auto px-3 py-1.5 rounded-xl text-xs font-bold bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 transition-all flex items-center gap-1.5 cursor-pointer shrink-0 shadow-2xs"
                                            title="Download Faculty Excel Template for Selected College"
                                        >
                                            <Download className="h-4 w-4" />
                                            Template
                                        </Button>

                                        {/* Bulk Import Button */}
                                        <label className="px-3 py-1.5 rounded-xl text-xs font-bold bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 transition-all flex items-center gap-1.5 cursor-pointer shrink-0 shadow-2xs">
                                            <Upload className="h-4 w-4" />
                                            Bulk Import
                                            <input
                                                type="file"
                                                accept=".xlsx, .xls, .csv"
                                                onChange={handleFacultyFileSelect}
                                                className="hidden"
                                            />
                                        </label>

                                        {/* Search Bar */}
                                        <div className="relative w-full sm:w-56 flex-1 sm:flex-none">
                                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                                            <Input
                                                type="text"
                                                placeholder="Search faculty..."
                                                value={mentorSearchQuery}
                                                onChange={(e) => setMentorSearchQuery(e.target.value)}
                                                className="bg-gray-50 border border-gray-200 rounded-xl pl-9 pr-4 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-600 focus:border-indigo-600 transition-all w-full font-medium text-gray-800"
                                            />
                                        </div>

                                        {/* Add Mentor Button */}
                                        <Button variant="ghost"
                                            onClick={() => handleOpenMentorModal()}
                                            className="h-auto btn-gradient shadow-sm text-white px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1 cursor-pointer shrink-0"
                                        >
                                            <Plus className="h-4 w-4" />
                                            Add Mentor
                                        </Button>
                                    </div>
                                }
                            />

                            <TableSurface
                                className="border-gray-200"
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
                                            <TableCell colSpan={isCampusShiftBased ? 7 : 6} className="h-32 text-center">
                                                <div className="flex flex-col items-center gap-2 text-gray-400">
                                                    <UserCheck className="h-8 w-8" />
                                                    <p className="text-sm font-semibold">No mentors found matching your search.</p>
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    ) : (
                                        mentorPagination.pageItems.map((m) => {
                                            const col = colleges.find(c => c.id === m.college_id);
                                            const mentorSubjectsList = (m.subjects && typeof m.subjects === 'string')
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
                                                                    <Badge key={idx} variant="outline" className="text-[9.5px]">{sub}</Badge>
                                                                ))
                                                            ) : (
                                                                <span className="text-gray-400 italic text-xs">No subjects mapped</span>
                                                            )}
                                                        </div>
                                                    </TableCell>
                                                    <TableCell className="text-right">
                                                        <div className="flex items-center justify-end gap-1.5">
                                                            <Button
                                                                variant="ghost"
                                                                size="icon"
                                                                onClick={() => { setSelectedProfileMentor(m); setIsProfileOpen(true); }}
                                                                title="View Workload Profile"
                                                            >
                                                                <Eye className="h-4 w-4" />
                                                            </Button>
                                                            <Button
                                                                variant="outline"
                                                                size="icon"
                                                                onClick={() => handleOpenMentorModal(m)}
                                                                title="Edit Mentor"
                                                            >
                                                                <Edit className="h-4 w-4" />
                                                            </Button>
                                                            <Button
                                                                variant="destructive"
                                                                size="icon"
                                                                onClick={() => handleDeleteMentor(m.id)}
                                                                isLoading={loadingActions[`mentor_${m.id}`]}
                                                                title="Delete Mentor"
                                                            >
                                                                <Trash2 className="h-4 w-4" />
                                                            </Button>
                                                        </div>
                                                    </TableCell>
                                                </TableRow>
                                            );
                                        })
                                    )}
                                </TableBody>
                            </TableSurface>
                        </div>
                    )}
                    {activeTab === "courses" && (
                        <div className="space-y-6 animate-fadeIn font-sans text-xs">
                            <PageHeader
                                icon={Layers}
                                title="Courses & Curriculum"
                                subtitle="Manage courses and their academic year curricula grouped by campus."
                                actions={
                                    <div className="relative">
                                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                                        <Input
                                            type="text"
                                            placeholder="Search name, subjects..."
                                            value={searchQuery}
                                            onChange={(e) => setSearchQuery(e.target.value)}
                                            className="bg-white border border-gray-200 rounded-xl pl-9 pr-4 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-600 focus:border-indigo-600 transition-all w-56 font-semibold text-gray-800"
                                        />
                                    </div>
                                }
                            />

                            <div className="space-y-6">
                                {colleges.map((col) => {
                                    const isColExpanded = expandedColleges[col.id] !== false; // defaults to true
                                    const collegeDepts = coursesList.filter(d => d.college_id === col.id || (col.id === colleges[0]?.id && !d.college_id));
                                    const filteredDepts = collegeDepts.filter(dept => {
                                        const matchesDept = dept.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                                            dept.id.toLowerCase().includes(searchQuery.toLowerCase());
                                        const matchesSubjects = (subjectsList || []).some(
                                            s => s.department === dept.name && s.name.toLowerCase().includes(searchQuery.toLowerCase())
                                        );
                                        return matchesDept || matchesSubjects;
                                    });

                                    return (
                                        <div key={col.id} className="border border-slate-100 rounded-2xl bg-white shadow-card overflow-hidden">
                                            {/* College section header */}
                                            <div className="p-4 bg-gray-50 border-b border-gray-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
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
                                                        <span className="text-sm font-black text-gray-900 block truncate sm:whitespace-normal">{col.name}</span>
                                                        <span className="text-[10px] text-gray-400 block font-normal mt-0.5 truncate sm:whitespace-normal">{col.address || "No Address"}</span>
                                                    </div>
                                                    <span className="bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded text-[10px] font-bold ml-2 shrink-0">
                                                        {filteredDepts.length} course(s)
                                                    </span>
                                                </button>

                                                {/* Stylized Add Course Button that opens the rich modal */}
                                                <Button variant="ghost"
                                                    type="button"
                                                    onClick={() => handleOpenDeptModal(undefined, col.id)}
                                                    className="h-auto btn-gradient shadow-sm text-white px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1 shrink-0 cursor-pointer border-none"
                                                >
                                                    <Plus className="h-3.5 w-3.5" />
                                                    Add Course
                                                </Button>
                                            </div>

                                            {isColExpanded && (
                                                <div className="p-4 space-y-4">
                                                    {filteredDepts.length === 0 ? (
                                                        <div className="text-center py-6 text-gray-400 italic">
                                                            No courses found for this campus.
                                                        </div>
                                                    ) : (
                                                        <div className="space-y-3">
                                                            {filteredDepts.map((dept) => {
                                                                const facultyCount = mentors.filter(m => isMentorInProgram(m, dept.name, slots, subjectsList)).length;
                                                                const deptSubjects = (subjectsList || []).filter(s => isDeptSubjectMatch(s.department, dept.name, dept.code));
                                                                const isDeptExpanded = expandedDepts[dept.id];
                                                                const deptSlots = slots.filter(s => (s.department || getDeptFromClassGroup(s.classGroup)) === dept.name);

                                                                return (
                                                                    <div key={dept.id} className="border border-gray-200 rounded-xl overflow-hidden bg-gray-50/20">
                                                                        {/* Department row */}
                                                                        <div className="p-3 bg-white border-b border-gray-200 flex items-center justify-between gap-4 flex-wrap">
                                                                            <div
                                                                                role="button"
                                                                                tabIndex={0}
                                                                                onClick={() => setExpandedDepts(prev => ({ ...prev, [dept.id]: !prev[dept.id] }))}
                                                                                onKeyDown={(e) => {
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
                                                                                <span className={`px-2 py-0.5 rounded-full text-[8.5px] font-bold whitespace-nowrap ${dept.status === "Inactive" ? "bg-rose-50 text-rose-700 border border-rose-200" : "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                                                                    }`}>
                                                                                    {dept.status || "Active"}
                                                                                </span>
                                                                                {/* Timetable badge: show per-shift breakdown */}
                                                                                {(() => {
                                                                                    const shift1 = deptSlots.filter(s => s.shift === 'shift_1').length;
                                                                                    const shift2 = deptSlots.filter(s => s.shift === 'shift_2').length;
                                                                                    const general = deptSlots.filter(s => s.shift === 'general').length;
                                                                                    return deptSlots.length > 0 ? (
                                                                                        <span className="px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-[8.5px] font-extrabold text-emerald-700 flex items-center gap-1 shadow-xs whitespace-nowrap">
                                                                                            <span className="h-1 w-1 rounded-full bg-emerald-600 animate-pulse shrink-0"></span>
                                                                                            {deptSlots.length} Slots
                                                                                            {shift1 > 0 && <span className="bg-teal-100 text-teal-700 px-1 py-0.5 rounded text-[7.5px] font-black">S1:{shift1}</span>}
                                                                                            {shift2 > 0 && <span className="bg-indigo-100 text-indigo-700 px-1 py-0.5 rounded text-[7.5px] font-black">S2:{shift2}</span>}
                                                                                            {general > 0 && <span className="bg-amber-100 text-amber-700 px-1 py-0.5 rounded text-[7.5px] font-black">Gen:{general}</span>}
                                                                                        </span>
                                                                                    ) : (
                                                                                        <span className="px-2 py-0.5 rounded-full bg-slate-50 border border-slate-200 text-[8.5px] font-extrabold text-slate-400 whitespace-nowrap">
                                                                                            No Timetable
                                                                                        </span>
                                                                                    );
                                                                                })()}
                                                                            </div>

                                                                            <div className="flex items-center gap-4 text-[11px] font-bold text-gray-600">
                                                                                <span>Faculty: <span className="text-gray-900">{facultyCount}</span></span>
                                                                                <span>Subjects: <span className="text-gray-900">{deptSubjects.length}</span></span>

                                                                                <div className="flex items-center gap-1.5 ml-2 border-l border-gray-200 pl-3">
                                                                                    <Button variant="ghost" size="icon"
                                                                                        onClick={() => handleOpenDeptModal(dept)}
                                                                                        className="h-auto w-auto p-1 hover:bg-indigo-50 border border-transparent hover:border-indigo-200 text-gray-500 hover:text-indigo-600 rounded transition-all cursor-pointer bg-transparent"
                                                                                        title="Edit Course"
                                                                                    >
                                                                                        <Edit className="h-3.5 w-3.5" />
                                                                                    </Button>
                                                                                    <Button variant="ghost" size="icon"
                                                                                        onClick={() => handleDeleteDept(dept.id, dept.name)}
                                                                                        className="h-auto w-auto p-1 hover:bg-rose-50 border border-transparent hover:border-rose-200 text-gray-500 hover:text-rose-600 rounded transition-all cursor-pointer bg-transparent"
                                                                                        title="Delete Course"
                                                                                    >
                                                                                        <Trash2 className="h-3.5 w-3.5" />
                                                                                    </Button>
                                                                                </div>
                                                                            </div>
                                                                        </div>

                                                                        {/* Department expanded: show Overview Card and Year collapsible cards */}
                                                                        {isDeptExpanded && (
                                                                            <div className="p-3 bg-gray-50/50 space-y-4">
                                                                                {/* Course Overview Details Card */}
                                                                                <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-card flex flex-col md:flex-row justify-between gap-4">
                                                                                    <div className="space-y-2 flex-1">
                                                                                        <div className="flex items-center gap-3">
                                                                                            <span className="text-xs font-bold text-gray-400 uppercase tracking-wider block">Course Details</span>
                                                                                        </div>
                                                                                        <p className="text-[11px] text-gray-500 leading-relaxed font-semibold">
                                                                                            {dept.description || "No description provided for this course."}
                                                                                        </p>
                                                                                    </div>
                                                                                    <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-[11px] font-bold text-gray-600 shrink-0 md:border-l md:border-gray-200 md:pl-6 md:min-w-[280px]">
                                                                                        <div>
                                                                                            <span className="text-[9px] uppercase tracking-wider text-gray-400 block mb-0.5">Course Duration</span>
                                                                                            <span className="text-gray-900 font-extrabold">
                                                                                                {dept.years || 4} Year(s) ({Number(dept.years || 4) * 2} Semesters)
                                                                                            </span>
                                                                                        </div>
                                                                                        <div>
                                                                                            <span className="text-[9px] uppercase tracking-wider text-gray-400 block mb-0.5">Code Prefix</span>
                                                                                            <span className="text-indigo-600 font-extrabold">{dept.code || "None"}</span>
                                                                                        </div>
                                                                                        <div>
                                                                                            <span className="text-[9px] uppercase tracking-wider text-gray-400 block mb-0.5">Offerings</span>
                                                                                            <span className="text-gray-900 font-extrabold">{dept.default_shift === "all" ? "Shift 1, 2 & General" : dept.default_shift === "both" ? "Shift 1 & 2" : dept.default_shift === "shift_2" ? "Shift 2 (Evening)" : dept.default_shift === "shift_1" ? "Shift 1 (Day)" : "General Shift"}</span>
                                                                                        </div>
                                                                                        <div className="col-span-2">
                                                                                            <span className="text-[9px] uppercase tracking-wider text-gray-400 block mb-0.5">Assigned Classrooms</span>
                                                                                            <span className="text-gray-900 font-extrabold block">
                                                                                                {formatYearWiseRooms(dept.default_room)}
                                                                                            </span>
                                                                                        </div>
                                                                                        <div>
                                                                                            <span className="text-[9px] uppercase tracking-wider text-gray-400 block mb-0.5">Current Status</span>
                                                                                            <span className={`inline-flex items-center gap-1 text-[10px] ${dept.status === "Inactive" ? "text-rose-600 font-extrabold" : "text-emerald-600 font-extrabold"
                                                                                                }`}>
                                                                                                <span className={`h-1.5 w-1.5 rounded-full ${dept.status === "Inactive" ? "bg-rose-600" : "bg-emerald-600"
                                                                                                    }`} />
                                                                                                {dept.status || "Active"}
                                                                                            </span>
                                                                                        </div>
                                                                                    </div>
                                                                                </div>

                                                                                <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                                                                                    {Array.from({ length: dept.years ? Number(dept.years) : 4 }, (_, i) => `Year ${i + 1}`).map((yr, i) => {
                                                                                        const yrSubjects = deptSubjects.filter(s => isSameYear(s.year, yr, s.semester) && (searchQuery === "" || s.name.toLowerCase().includes(searchQuery.toLowerCase())));
                                                                                        const yearKey = `${dept.id}_${yr}`;
                                                                                        const isYearExpanded = expandedDeptYears[yearKey] !== false; // default to expanded/true

                                                                                        const semOdd = `Semester ${2 * (i + 1) - 1}`;
                                                                                        const semEven = `Semester ${2 * (i + 1)}`;
                                                                                        const semOddSubjects = yrSubjects.filter(s => isSameSemester(s.semester, semOdd));
                                                                                        const semEvenSubjects = yrSubjects.filter(s => isSameSemester(s.semester, semEven));
                                                                                        const oddCount = semOddSubjects.length;
                                                                                        const evenCount = semEvenSubjects.length;

                                                                                        return (
                                                                                            <div key={yr} className="border border-slate-100 rounded-2xl overflow-hidden bg-white shadow-card flex flex-col">
                                                                                                {/* Year card header */}
                                                                                                <div className="flex flex-col sm:flex-row sm:items-center justify-between p-3 bg-gray-50 border-b border-gray-200 font-bold text-gray-800 text-xs gap-2">
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
                                                                                                                Sem {2 * (i + 1) - 1}: {oddCount}
                                                                                                            </span>
                                                                                                            <span className="bg-purple-50 border border-purple-100 text-purple-700 px-2 py-0.5 rounded-full text-[9px] font-extrabold whitespace-nowrap">
                                                                                                                Sem {2 * (i + 1)}: {evenCount}
                                                                                                            </span>
                                                                                                        </div>
                                                                                                    </button>

                                                                                                    <Button variant="ghost"
                                                                                                        onClick={() => handleOpenSubjectModal(undefined, dept.name, yr)}
                                                                                                        className="h-auto flex items-center justify-center gap-1 text-[10px] bg-indigo-50 border border-indigo-200 text-indigo-700 hover:bg-indigo-600 hover:text-white hover:border-indigo-600 px-2 py-1 rounded-lg transition-all font-bold cursor-pointer w-full sm:w-auto shrink-0"
                                                                                                    >
                                                                                                        <Plus className="h-3 w-3" />
                                                                                                        Add Subject
                                                                                                    </Button>
                                                                                                </div>

                                                                                                {/* Year card body: subjects list grouped by semester */}
                                                                                                {isYearExpanded && (
                                                                                                    <div className="p-3.5 flex-1 grid grid-cols-1 md:grid-cols-2 gap-4 bg-gray-50/30">
                                                                                                        {/* Odd Semester Column */}
                                                                                                        <div className="flex flex-col border border-slate-100 rounded-2xl p-3 bg-white shadow-card">
                                                                                                            <div className="flex items-center justify-between pb-2 border-b border-gray-100 mb-2">
                                                                                                                <span className="font-extrabold text-[10px] uppercase tracking-wider text-indigo-700">{semOdd}</span>
                                                                                                                <span className="bg-indigo-50 border border-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full text-[8.5px] font-extrabold">{oddCount} subject(s)</span>
                                                                                                            </div>
                                                                                                            {semOddSubjects.length === 0 ? (
                                                                                                                <div className="text-center py-6 text-gray-400 italic text-[10px] my-auto">No subjects mapped to {semOdd} yet.</div>
                                                                                                            ) : (
                                                                                                                <div className="overflow-x-auto">
                                                                                                                    <Table>
                                                                                                                        <TableHeader>
                                                                                                                            <TableRow>
                                                                                                                                <TableHead>Subject Name</TableHead>
                                                                                                                                <TableHead>Type</TableHead>
                                                                                                                                <TableHead>Timetable</TableHead>
                                                                                                                                <TableHead className="text-right">Actions</TableHead>
                                                                                                                            </TableRow>
                                                                                                                        </TableHeader>
                                                                                                                        <TableBody>
                                                                                                                            {semOddSubjects.map((sub, sIdx) => (
                                                                                                                                <TableRow key={`${sub.id || sub.name}_${sIdx}`}>
                                                                                                                                    <TableCell>
                                                                                                                                        <div className="font-bold text-gray-900 leading-tight">{sub.name}</div>
                                                                                                                                        <div className="font-mono text-[8px] text-gray-400 mt-0.5">{sub.id}</div>
                                                                                                                                    </TableCell>
                                                                                                                                    <TableCell>
                                                                                                                                        {(() => {
                                                                                                                                            const t = (sub.type || "").toUpperCase();
                                                                                                                                            const v = t === "SKILL" || t === "PRACTICAL" ? "default" : t === "ACADEMIC" || t === "THEORY" ? "secondary" : t === "LAB" ? "success" : "warning";
                                                                                                                                            const l = t === "SKILL" || t === "PRACTICAL" ? "Skill" : t === "ACADEMIC" || t === "THEORY" ? "Theory" : t === "LAB" ? "Lab" : (sub.type || "General");
                                                                                                                                            return <Badge variant={v as any}>{l}</Badge>;
                                                                                                                                        })()}
                                                                                                                                    </TableCell>
                                                                                                                                    <TableCell>
                                                                                                                                        {(() => {
                                                                                                                                            const subSlots = slots.filter(s => s.course.toLowerCase() === sub.name.toLowerCase() && (s.department || getDeptFromClassGroup(s.classGroup)) === sub.department);
                                                                                                                                            return subSlots.length > 0
                                                                                                                                                ? <Badge variant="success">Scheduled ({subSlots.length} hrs)</Badge>
                                                                                                                                                : <Badge variant="secondary">Unscheduled</Badge>;
                                                                                                                                        })()}
                                                                                                                                    </TableCell>
                                                                                                                                    <TableCell className="text-right">
                                                                                                                                        <div className="flex items-center justify-end gap-0.5">
                                                                                                                                            <Button variant="ghost" size="icon" onClick={() => handleOpenSubjectModal(sub)} title="Edit Subject">
                                                                                                                                                <Edit className="h-3 w-3" />
                                                                                                                                            </Button>
                                                                                                                                            <Button variant="ghost" size="icon" onClick={() => handleDeleteSubject(sub.id)} title="Delete Subject">
                                                                                                                                                <Trash2 className="h-3 w-3" />
                                                                                                                                            </Button>
                                                                                                                                        </div>
                                                                                                                                    </TableCell>
                                                                                                                                </TableRow>
                                                                                                                            ))}
                                                                                                                        </TableBody>
                                                                                                                    </Table>
                                                                                                                </div>
                                                                                                            )}
                                                                                                        </div>

                                                                                                        {/* Even Semester Column */}
                                                                                                        <div className="flex flex-col border border-slate-100 rounded-2xl p-3 bg-white shadow-card">
                                                                                                            <div className="flex items-center justify-between pb-2 border-b border-gray-100 mb-2">
                                                                                                                <span className="font-extrabold text-[10px] uppercase tracking-wider text-purple-700">{semEven}</span>
                                                                                                                <span className="bg-purple-50 border border-purple-100 text-purple-700 px-2 py-0.5 rounded-full text-[8.5px] font-extrabold">{evenCount} subject(s)</span>
                                                                                                            </div>
                                                                                                            {semEvenSubjects.length === 0 ? (
                                                                                                                <div className="text-center py-6 text-gray-400 italic text-[10px] my-auto">No subjects mapped to {semEven} yet.</div>
                                                                                                            ) : (
                                                                                                                <div className="overflow-x-auto">
                                                                                                                    <Table>
                                                                                                                        <TableHeader>
                                                                                                                            <TableRow>
                                                                                                                                <TableHead>Subject Name</TableHead>
                                                                                                                                <TableHead>Type</TableHead>
                                                                                                                                <TableHead>Timetable</TableHead>
                                                                                                                                <TableHead className="text-right">Actions</TableHead>
                                                                                                                            </TableRow>
                                                                                                                        </TableHeader>
                                                                                                                        <TableBody>
                                                                                                                            {semEvenSubjects.map((sub, sIdx) => (
                                                                                                                                <TableRow key={`${sub.id || sub.name}_${sIdx}`}>
                                                                                                                                    <TableCell>
                                                                                                                                        <div className="font-bold text-gray-900 leading-tight">{sub.name}</div>
                                                                                                                                        <div className="font-mono text-[8px] text-gray-400 mt-0.5">{sub.id}</div>
                                                                                                                                    </TableCell>
                                                                                                                                    <TableCell>
                                                                                                                                        {(() => {
                                                                                                                                            const t = (sub.type || "").toUpperCase();
                                                                                                                                            const v = t === "SKILL" || t === "PRACTICAL" ? "default" : t === "ACADEMIC" || t === "THEORY" ? "secondary" : t === "LAB" ? "success" : "warning";
                                                                                                                                            const l = t === "SKILL" || t === "PRACTICAL" ? "Skill" : t === "ACADEMIC" || t === "THEORY" ? "Theory" : t === "LAB" ? "Lab" : (sub.type || "General");
                                                                                                                                            return <Badge variant={v as any}>{l}</Badge>;
                                                                                                                                        })()}
                                                                                                                                    </TableCell>
                                                                                                                                    <TableCell>
                                                                                                                                        {(() => {
                                                                                                                                            const subSlots = slots.filter(s => s.course.toLowerCase() === sub.name.toLowerCase() && (s.department || getDeptFromClassGroup(s.classGroup)) === sub.department);
                                                                                                                                            return subSlots.length > 0
                                                                                                                                                ? <Badge variant="success">Scheduled ({subSlots.length} hrs)</Badge>
                                                                                                                                                : <Badge variant="secondary">Unscheduled</Badge>;
                                                                                                                                        })()}
                                                                                                                                    </TableCell>
                                                                                                                                    <TableCell className="text-right">
                                                                                                                                        <div className="flex items-center justify-end gap-0.5">
                                                                                                                                            <Button variant="ghost" size="icon" onClick={() => handleOpenSubjectModal(sub)} title="Edit Subject">
                                                                                                                                                <Edit className="h-3 w-3" />
                                                                                                                                            </Button>
                                                                                                                                            <Button variant="ghost" size="icon" onClick={() => handleDeleteSubject(sub.id)} title="Delete Subject">
                                                                                                                                                <Trash2 className="h-3 w-3" />
                                                                                                                                            </Button>
                                                                                                                                        </div>
                                                                                                                                    </TableCell>
                                                                                                                                </TableRow>
                                                                                                                            ))}
                                                                                                                        </TableBody>
                                                                                                                    </Table>
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
                        </div>
                    )}

                    {activeTab === "subjects" && (
                        <div className="space-y-6 animate-fadeIn font-sans text-xs">
                            <PageHeader
                                icon={GraduationCap}
                                title="Subjects Master Directory"
                                subtitle="Manage individual syllabus items, semester mappings, and teaching slots."
                                actions={
                                    subjectsSubTab === "catalog" && (
                                        <Button variant="ghost"
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
                                    className={`pb-2 px-1 text-xs font-black transition-all ${subjectsSubTab === "catalog" ? "border-b-2 border-indigo-600 text-indigo-600" : "text-gray-400 hover:text-gray-600"}`}
                                >
                                    Subjects Catalog
                                </button>
                                <button
                                    onClick={() => setSubjectsSubTab("groups")}
                                    className={`pb-2 px-1 text-xs font-black transition-all ${subjectsSubTab === "groups" ? "border-b-2 border-indigo-600 text-indigo-600" : "text-gray-400 hover:text-gray-600"}`}
                                >
                                    Mentor Groups
                                </button>
                            </div>

                            {subjectsSubTab === "catalog" ? (
                                <>
                                    {/* Filters Bar */}
                                    <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-4 border border-slate-100 rounded-2xl shadow-card">
                                        <div className="relative">
                                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                                            <Input
                                                type="text"
                                                placeholder="Search name, ID, course..."
                                                value={subjectSearchQuery}
                                                onChange={(e) => setSubjectSearchQuery(e.target.value)}
                                                className="bg-gray-50 border border-gray-200 rounded-xl pl-9 pr-4 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-600 focus:border-indigo-600 transition-all w-56 font-semibold text-gray-800"
                                            />
                                        </div>

                                        <div className="flex items-center gap-3">
                                            {/* College filter */}
                                            <div className="flex items-center gap-1.5">
                                                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Campus:</span>
                                                <Select aria-label="Campus filter"
                                                    value={subjectCollegeFilter}
                                                    onChange={(e) => setSubjectCollegeFilter(e.target.value)}
                                                    className="bg-gray-50 border border-gray-200 rounded-xl px-3 py-1.5 font-semibold text-gray-700 focus:outline-none focus:ring-1 focus:ring-indigo-600 focus:border-indigo-600 text-xs cursor-pointer"
                                                >
                                                    <option value="all">All Campuses</option>
                                                    {colleges.map((col) => (
                                                        <option key={col.id} value={col.id}>{col.name}</option>
                                                    ))}
                                                </Select>
                                            </div>

                                            {/* Semester filter */}
                                            <div className="flex items-center gap-1.5">
                                                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Semester:</span>
                                                <Select aria-label="Semester filter"
                                                    value={subjectSemesterFilter}
                                                    onChange={(e) => setSubjectSemesterFilter(e.target.value)}
                                                    className="bg-gray-50 border border-gray-200 rounded-xl px-3 py-1.5 font-semibold text-gray-700 focus:outline-none focus:ring-1 focus:ring-indigo-600 focus:border-indigo-600 text-xs cursor-pointer"
                                                >
                                                    <option value="all">All Semesters</option>
                                                    {Array.from({ length: 8 }, (_, i) => `Semester ${i + 1}`).map((sem) => (
                                                        <option key={sem} value={sem}>{sem}</option>
                                                    ))}
                                                </Select>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Subjects Table */}
                                    <TableSurface
                                        className="border-gray-200 bg-white shadow-sm"
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
                                                <TableHead>Year &amp; Semester</TableHead>
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
                                                subjectPagination.pageItems.map((sub) => {
                                                    const campusName = colleges.find(c => c.id === sub.college_id)?.name || "Unknown Campus";
                                                    const subSlots = slots.filter(
                                                        slot => slot.course.toLowerCase() === sub.name.toLowerCase() &&
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
                                                        subjectType === "SKILL" || subjectType === "PRACTICAL" ? "default" :
                                                            subjectType === "ACADEMIC" || subjectType === "THEORY" ? "secondary" :
                                                                subjectType === "LAB" ? "success" : "warning";
                                                    const typeLabel =
                                                        subjectType === "SKILL" || subjectType === "PRACTICAL" ? "Skill" :
                                                            subjectType === "ACADEMIC" || subjectType === "THEORY" ? "Theory" :
                                                                subjectType === "LAB" ? "Lab" : (sub.type || "General");

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
                                                            <TableCell className="font-bold text-gray-800">
                                                                {targetHours} hr(s)
                                                            </TableCell>
                                                            <TableCell>
                                                                <Badge variant={coverageVariant}>{coverageLabel}</Badge>
                                                            </TableCell>
                                                            <TableCell className="text-right">
                                                                <div className="flex justify-end gap-1.5">
                                                                    <Button variant="outline" size="icon" onClick={() => handleOpenSubjectModal(sub)} title="Edit Subject">
                                                                        <Edit className="h-3.5 w-3.5" />
                                                                    </Button>
                                                                    <Button variant="destructive" size="icon" onClick={() => handleDeleteSubject(sub.id)} title="Delete Subject">
                                                                        <Trash2 className="h-3.5 w-3.5" />
                                                                    </Button>
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
                                    <div className="flex justify-between items-center bg-white p-4 border border-slate-100 rounded-2xl shadow-card">
                                        <div>
                                            <h3 className="text-xs font-black text-gray-800 uppercase tracking-wider">Configured Mentor Groups</h3>
                                            <p className="text-[10px] text-gray-400 font-semibold mt-0.5">Create custom groups to cluster mentors and SMEs (e.g. Technical, Aptitude, Soft Skills) and allocate demo sessions.</p>
                                        </div>
                                        <Button variant="ghost"
                                            onClick={() => handleOpenGroupModal()}
                                            className="h-auto btn-gradient shadow-sm text-white px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1 cursor-pointer border-none"
                                        >
                                            <Plus className="h-4 w-4" />
                                            Create Mentor Group
                                        </Button>
                                    </div>

                                    <div className="overflow-x-auto rounded-xl border border-gray-200 shadow-sm bg-white">
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
                                                {(subjectGroups || []).map((g) => {
                                                    const count = (mentors || []).filter(m => (m.mentor_group || m.subject_group || m.department || "").trim().toLowerCase() === (g.name || "").trim().toLowerCase()).length;
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
                                                                <div className="flex justify-end gap-1.5">
                                                                    <Button variant="outline" size="icon" onClick={() => handleOpenGroupModal(g)} title="Edit Group">
                                                                        <Edit className="h-3.5 w-3.5" />
                                                                    </Button>
                                                                    <Button variant="destructive" size="icon" onClick={() => handleDeleteGroup(g.id)} title="Delete Group">
                                                                        <Trash2 className="h-3.5 w-3.5" />
                                                                    </Button>
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
                        </div>
                    )}

                    {/* ── Tab: Global Schedule Grid ── */}
                    {activeTab === "schedules" && (
                        <div className="space-y-6 animate-fadeIn">
                            <PageHeader
                                icon={Grid}
                                title="Global Scheduled Slots"
                                subtitle="Filter and review timetables across the entire university network."
                                actions={
                                    <div className="flex flex-wrap gap-2">
                                        <Select aria-label="College filter"
                                            value={collegeFilter}
                                            onChange={(e) => setCollegeFilter(e.target.value)}
                                            className="bg-white border border-gray-200 rounded-xl px-2.5 py-2 text-xs text-gray-700 font-bold focus:outline-none cursor-pointer"
                                        >
                                            <option value="all">All Campuses</option>
                                            {colleges.map(c => (
                                                <option key={c.id} value={c.id}>{c.name}</option>
                                            ))}
                                        </Select>

                                        <Select aria-label="Day filter"
                                            value={dayFilter}
                                            onChange={(e) => setDayFilter(e.target.value)}
                                            className="bg-white border border-gray-200 rounded-xl px-2.5 py-2 text-xs text-gray-700 font-bold focus:outline-none cursor-pointer"
                                        >
                                            <option value="all">All Days</option>
                                            {["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"].map(d => (
                                                <option key={d} value={d}>{d}</option>
                                            ))}
                                        </Select>

                                        <Select aria-label="Shift filter"
                                            value={shiftFilter}
                                            onChange={(e) => setShiftFilter(e.target.value)}
                                            className="bg-white border border-gray-200 rounded-xl px-2.5 py-2 text-xs text-gray-700 font-bold focus:outline-none cursor-pointer"
                                        >
                                            <option value="all">All Shifts</option>
                                            <option value="shift_1">Shift 1</option>
                                            <option value="shift_2">Shift 2</option>
                                            <option value="general">General Shift</option>
                                        </Select>
                                    </div>
                                }
                            />

                            {/* Search slot bar */}
                            <div className="relative max-w-md">
                                <Search className="absolute left-3.5 top-2.5 h-4 w-4 text-gray-400" />
                                <Input
                                    type="text"
                                    placeholder="Search slot, mentor, room or course..."
                                    value={scheduleSearchQuery}
                                    onChange={(e) => setScheduleSearchQuery(e.target.value)}
                                    className="w-full bg-gray-50 border border-gray-200 rounded-xl pl-10 pr-4 py-2 text-xs text-gray-800 focus:outline-none focus:ring-1 focus:ring-indigo-600"
                                />
                            </div>

                            {filteredSlots.length === 0 ? (
                                <div className="text-center py-16 border border-gray-200 rounded-xl bg-gray-50/50">
                                    <Grid className="h-10 w-10 text-gray-300 mx-auto mb-2" />
                                    <p className="text-sm text-gray-500 font-semibold">No slot schedules matched your filter query.</p>
                                </div>
                            ) : (
                                <TableSurface
                                    className="border-gray-200"
                                    footer={
                                        <Pagination
                                            currentPage={schedulePagination.page}
                                            totalItems={filteredSlots.length}
                                            pageSize={schedulePagination.pageSize}
                                            onPageChange={schedulePagination.setPage}
                                            onPageSizeChange={schedulePagination.setPageSize}
                                            pageSizeOptions={schedulePagination.pageSizeOptions}
                                        />
                                    }
                                >
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Campus</TableHead>
                                            <TableHead>Mentor</TableHead>
                                            <TableHead>Day</TableHead>
                                            <TableHead>Time Slot</TableHead>
                                            <TableHead>Shift</TableHead>
                                            <TableHead>Course / Class Group</TableHead>
                                            <TableHead>Room</TableHead>
                                            <TableHead className="text-right">Action</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {schedulePagination.pageItems.map((slot) => {
                                            const mentorObj = mentors.find(m => m.id === slot.mentorId);
                                            const colObj = mentorObj?.college_id ? colleges.find(c => c.id === mentorObj.college_id) : null;

                                            return (
                                                <TableRow key={slot.id}>
                                                    <TableCell className="font-bold">{colObj?.name || (mentorObj?.college_id ? "Campus Unknown" : "Unassigned")}</TableCell>
                                                    <TableCell>
                                                        <div className="flex items-center gap-2">
                                                            <div className="h-6 w-6 rounded-full btn-gradient flex items-center justify-center font-extrabold text-white text-[9px]">
                                                                {mentorObj?.avatar || "M"}
                                                            </div>
                                                            <div>
                                                                <div className="font-bold text-gray-900">{mentorObj?.name}</div>
                                                                <div className="text-[9.5px] text-gray-400">{mentorObj?.department}</div>
                                                            </div>
                                                        </div>
                                                    </TableCell>
                                                    <TableCell>{slot.day}</TableCell>
                                                    <TableCell className="whitespace-nowrap">{formatTimeLabel(slot.time)}</TableCell>
                                                    <TableCell>
                                                        <Badge variant={slot.shift === "shift_1" ? "warning" : slot.shift === "shift_2" ? "success" : "secondary"}>
                                                            {slot.shift.replace("_", " ")}
                                                        </Badge>
                                                    </TableCell>
                                                    <TableCell>
                                                        <div className="font-extrabold text-indigo-700">{slot.course}</div>
                                                        <div className="text-[9.5px] text-gray-400 font-semibold uppercase">{slot.classGroup || "General Class"}</div>
                                                    </TableCell>
                                                    <TableCell>{slot.location}</TableCell>
                                                    <TableCell className="text-right">
                                                        <Button
                                                            variant="outline"
                                                            size="sm"
                                                            onClick={() => { if (colObj) setDrillDownCollegeId(colObj.id); }}
                                                        >
                                                            Manage Campus
                                                        </Button>
                                                    </TableCell>
                                                </TableRow>
                                            );
                                        })}
                                    </TableBody>
                                </TableSurface>
                            )}
                        </div>
                    )}

                    {/* ── Tab: Oversight Hub (cross-campus infographics) ── */}
                    {activeTab === "oversight" && <OversightHub />}

                    {/* ── Tab: Attendance Monitoring Central (native Admin data table) ── */}
                    {activeTab === "monitoring" && (
                        <div className="space-y-6 animate-fadeIn">
                            {/* Header */}
                            <PageHeader
                                icon={Clock}
                                title="Attendance Monitoring Central"
                                subtitle="Per-student attendance summary across all campuses for the selected date range."
                                actions={
                                    <Button variant="ghost"
                                        type="button"
                                        onClick={handleExportAttendance}
                                        disabled={isExportingAtt}
                                        className="h-auto inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 text-xs font-extrabold transition-all shadow-2xs cursor-pointer active:scale-95 disabled:opacity-50"
                                    >
                                        {isExportingAtt ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                                        <span>{isExportingAtt ? "Exporting…" : "Export Excel"}</span>
                                    </Button>
                                }
                            />

                            {/* Stat cards */}
                            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                                {[{ label: "Students Tracked", value: attStats.total, cls: "text-indigo-600" }, { label: "Average %", value: `${attStats.avg}%`, cls: "text-violet-600" }, { label: "On Track (≥75%)", value: attStats.onTrack, cls: "text-emerald-600" }, { label: "At Risk (65–74%)", value: attStats.atRisk, cls: "text-amber-600" }, { label: "Critical (<65%)", value: attStats.critical, cls: "text-rose-600" }].map(card => (
                                    <div key={card.label} className="bg-white p-4 rounded-2xl border border-slate-100 shadow-card">
                                        <div className={`text-xl font-black ${card.cls}`}>{card.value}</div>
                                        <div className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mt-0.5">{card.label}</div>
                                    </div>
                                ))}
                            </div>

                            {/* Filter bar */}
                            <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-card flex flex-wrap items-center gap-3">
                                <div className="flex items-center gap-1.5 bg-gray-50 px-3 py-1.5 rounded-xl border border-gray-200">
                                    <span className="text-[10px] font-black uppercase tracking-wider text-gray-500">From:</span>
                                    <Input aria-label="Attendance from date" type="date" value={attStartDate} onChange={e => setAttStartDate(e.target.value)} className="text-xs font-bold text-gray-800 outline-none cursor-pointer bg-transparent" />
                                </div>
                                <div className="flex items-center gap-1.5 bg-gray-50 px-3 py-1.5 rounded-xl border border-gray-200">
                                    <span className="text-[10px] font-black uppercase tracking-wider text-gray-500">To:</span>
                                    <Input aria-label="Attendance to date" type="date" value={attEndDate} onChange={e => setAttEndDate(e.target.value)} className="text-xs font-bold text-gray-800 outline-none cursor-pointer bg-transparent" />
                                </div>
                                <div className="flex items-center gap-1 flex-wrap">
                                    {[{ key: "all", label: "All" }, { key: "this_month", label: "This Month" }, { key: "past_30", label: "30D" }, { key: "past_7", label: "7D" }].map(p => (
                                        <Button variant="ghost" key={p.key} type="button" onClick={() => attSetPreset(p.key)} className="h-auto px-2 py-1 bg-white hover:bg-gray-100 border border-gray-200 rounded-lg text-gray-600 transition-all cursor-pointer active:scale-95 text-[10px] font-bold">{p.label}</Button>
                                    ))}
                                </div>
                                <div className="hidden lg:block w-px h-6 bg-gray-200" />
                                <div className="relative">
                                    <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-gray-400" />
                                    <Input type="text" placeholder="Search name, roll no..." value={attSearch} onChange={e => setAttSearch(e.target.value)} className="pl-8 pr-3 py-1.5 border border-gray-200 bg-gray-50 text-xs rounded-xl focus:outline-none focus:ring-1 focus:ring-indigo-600 font-semibold w-44" />
                                </div>
                                <Select aria-label="College filter" value={attCollegeFilter} onChange={e => { setAttCollegeFilter(e.target.value); setAttDeptFilter("all"); setAttBatchFilter("all"); }} className="py-1.5 px-2.5 border border-gray-200 rounded-xl bg-gray-50 text-xs font-bold cursor-pointer outline-none">
                                    <option value="all">All Campuses</option>
                                    {colleges.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                </Select>
                                <Select aria-label="Department filter" value={attDeptFilter} onChange={e => { setAttDeptFilter(e.target.value); setAttBatchFilter("all"); }} className="py-1.5 px-2.5 border border-gray-200 rounded-xl bg-gray-50 text-xs font-bold cursor-pointer outline-none">
                                    <option value="all">All Departments</option>
                                    {attDeptOptions.map(d => <option key={d} value={d}>{d}</option>)}
                                </Select>
                                <Select aria-label="Batch filter" value={attBatchFilter} onChange={e => setAttBatchFilter(e.target.value)} className="py-1.5 px-2.5 border border-gray-200 rounded-xl bg-gray-50 text-xs font-bold cursor-pointer outline-none">
                                    <option value="all">All Batches</option>
                                    {attBatchOptions.map(b => <option key={b} value={b}>{b}</option>)}
                                </Select>
                            </div>

                            {/* Data table */}
                            {attRows.length === 0 ? (
                                <div className="text-center py-16 border border-gray-200 rounded-xl bg-gray-50/50">
                                    <Clock className="h-10 w-10 text-gray-300 mx-auto mb-2" />
                                    <p className="text-sm text-gray-500 font-semibold">No attendance records found for this filter and date range.</p>
                                </div>
                            ) : (
                                <TableSurface
                                    className="border-gray-200"
                                    containerClassName="max-h-[62vh] overflow-y-auto"
                                    stickyHeader
                                    footer={
                                        <Pagination
                                            currentPage={monitoringPagination.page}
                                            totalItems={attRows.length}
                                            pageSize={monitoringPagination.pageSize}
                                            onPageChange={monitoringPagination.setPage}
                                            onPageSizeChange={monitoringPagination.setPageSize}
                                            pageSizeOptions={monitoringPagination.pageSizeOptions}
                                            ariaLabel="Attendance table pagination"
                                        />
                                    }
                                >
                                    <TableHeader className="sticky top-0 z-10">
                                        <TableRow>
                                            <TableHead className="w-12">#</TableHead>
                                            <TableHead className="cursor-pointer hover:text-indigo-600" onClick={() => attToggleSort("name")}>Roll No</TableHead>
                                            <TableHead>Name</TableHead>
                                            <TableHead>Campus</TableHead>
                                            <TableHead>Department</TableHead>
                                            <TableHead>Batch</TableHead>
                                            <TableHead className="text-center text-emerald-700 cursor-pointer hover:text-emerald-600" onClick={() => attToggleSort("present")}>Present</TableHead>
                                            <TableHead className="text-center text-rose-700 cursor-pointer hover:text-rose-600" onClick={() => attToggleSort("absent")}>Absent</TableHead>
                                            <TableHead className="text-center cursor-pointer hover:text-indigo-600" onClick={() => attToggleSort("total")}>Total</TableHead>
                                            <TableHead className="text-center text-indigo-700 cursor-pointer hover:text-indigo-600" onClick={() => attToggleSort("pct")}>%</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {monitoringPagination.pageItems.map((row, idx) => (
                                            <TableRow key={row.student.id}>
                                                <TableCell className="text-gray-400 font-bold">{monitoringPagination.startIndex + idx + 1}</TableCell>
                                                <TableCell className="font-bold whitespace-nowrap">{row.student.roll_number || row.student.register_number || "—"}</TableCell>
                                                <TableCell>
                                                    <div className="flex items-center gap-2">
                                                        <div className="h-6 w-6 rounded-full btn-gradient flex items-center justify-center font-extrabold text-white text-[9px] shrink-0">{row.student.name.charAt(0).toUpperCase()}</div>
                                                        <span className="font-bold text-gray-900 whitespace-nowrap">{row.student.name}</span>
                                                    </div>
                                                </TableCell>
                                                <TableCell className="whitespace-nowrap">{row.campus}</TableCell>
                                                <TableCell className="whitespace-nowrap">{row.student.department || "—"}</TableCell>
                                                <TableCell className="whitespace-nowrap">{row.student.classGroup || "—"}</TableCell>
                                                <TableCell className="text-center font-black text-emerald-600">{row.present}</TableCell>
                                                <TableCell className="text-center font-black text-rose-600">{row.absent}</TableCell>
                                                <TableCell className="text-center font-bold">{row.total}</TableCell>
                                                <TableCell className="text-center">
                                                    <Badge variant={row.pct >= 75 ? "success" : row.pct >= 65 ? "warning" : "destructive"}>
                                                        {row.pct}%
                                                    </Badge>
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </TableSurface>
                            )}
                        </div>
                    )}

                    {/* ── Tab: Reporting Hierarchy Tree ── */}
                    {activeTab === "hierarchy" && (
                        <div className="space-y-6 animate-fadeIn">
                            <PageHeader
                                icon={Network}
                                title="Interactive Reporting Hierarchy"
                                subtitle="Explore the chain of command, from Super Admin down to Faculty Mentors. Click a caret to expand or collapse a node."
                            />

                            {/* Tree Start */}
                            <div className="bg-gray-50 border border-gray-200 rounded-xl p-6 shadow-inner space-y-4 text-xs select-none">
                                {/* Level 0: Super Admin */}
                                <div className="space-y-2">
                                    <div
                                        onClick={() => toggleNode("admin")}
                                        className="flex items-center gap-2 p-3 bg-white border border-indigo-200 rounded-xl max-w-md shadow-card cursor-pointer hover:border-indigo-400 transition-all"
                                    >
                                        {expandedNodes["admin"] ? <ChevronDown className="h-4 w-4 text-indigo-600" /> : <ChevronRight className="h-4 w-4 text-indigo-600" />}
                                        <div className="h-7 w-7 rounded-full bg-indigo-600 text-white flex items-center justify-center font-black">SU</div>
                                        <div>
                                            <div className="font-extrabold text-gray-900 text-sm">Super Admin</div>
                                            <div className="text-[10px] text-gray-400">{currentAdmin?.name || "System Admin"} ({currentAdmin?.email || "admin@faceprep.in"})</div>
                                        </div>
                                    </div>

                                    {/* Level 1: KAMs */}
                                    {expandedNodes["admin"] && (
                                        <div className="pl-8 border-l border-dashed border-gray-300 ml-5 space-y-3 pt-2">
                                            {kamList.map(kam => {
                                                const kamNodeId = `kam-${kam.id}`;
                                                const kamColleges = colleges.filter(c => c.kam_id === kam.id);

                                                return (
                                                    <div key={kam.id} className="space-y-2">
                                                        <div
                                                            onClick={() => toggleNode(kamNodeId)}
                                                            className="flex items-center gap-2 p-2.5 bg-white border border-slate-100 rounded-2xl max-w-sm shadow-card cursor-pointer hover:border-indigo-300 transition-all"
                                                        >
                                                            {expandedNodes[kamNodeId] ? <ChevronDown className="h-3.5 w-3.5 text-gray-500" /> : <ChevronRight className="h-3.5 w-3.5 text-gray-500" />}
                                                            <div className="h-6 w-6 rounded-full bg-amber-500 text-white flex items-center justify-center font-black">KAM</div>
                                                            <div>
                                                                <div className="font-bold text-gray-900">{kam.name}</div>
                                                                <div className="text-[9px] text-gray-400">{kam.title} • {kamColleges.length} Campus(es)</div>
                                                            </div>
                                                        </div>

                                                        {/* Level 2: Campuses & CAMs */}
                                                        {expandedNodes[kamNodeId] && (
                                                            <div className="pl-6 border-l border-dashed border-gray-300 ml-4 space-y-3 pt-1">
                                                                {kamColleges.map(col => {
                                                                    const colNodeId = `col-${col.id}`;
                                                                    const cam = camList.find(cm => cm.college_id === col.id);
                                                                    const colMentors = mentors.filter(m => m.college_id === col.id);

                                                                    return (
                                                                        <div key={col.id} className="space-y-2">
                                                                            <div
                                                                                onClick={() => toggleNode(colNodeId)}
                                                                                className="flex items-center gap-2 p-2.5 bg-white border border-slate-100 rounded-2xl max-w-xs shadow-card cursor-pointer hover:border-indigo-300 transition-all"
                                                                            >
                                                                                {expandedNodes[colNodeId] ? <ChevronDown className="h-3.5 w-3.5 text-gray-500" /> : <ChevronRight className="h-3.5 w-3.5 text-gray-500" />}
                                                                                <div className="h-6 w-6 rounded-full bg-teal-500 text-white flex items-center justify-center font-black">CM</div>
                                                                                <div>
                                                                                    <div className="font-extrabold text-gray-800 leading-tight">{col.name}</div>
                                                                                    <div className="text-[9px] text-gray-400 font-medium">CM: {cam ? cam.name : "Unassigned"} ({colMentors.length} Faculty)</div>
                                                                                </div>
                                                                            </div>

                                                                            {/* Level 3: Mentors */}
                                                                            {expandedNodes[colNodeId] && (
                                                                                <div className="pl-6 border-l border-dashed border-gray-300 ml-4 space-y-2 pt-1">
                                                                                    {colMentors.map(mentor => (
                                                                                        <div
                                                                                            key={mentor.id}
                                                                                            className="flex items-center gap-1.5 p-1.5 bg-white border border-gray-200 rounded-xl max-w-[240px] shadow-sm animate-fadeIn"
                                                                                        >
                                                                                            <div className="h-6 w-6 rounded-full btn-gradient text-white flex items-center justify-center font-extrabold text-[9px] shrink-0">
                                                                                                {mentor.avatar}
                                                                                            </div>
                                                                                            <div className="min-w-0">
                                                                                                <div className="font-extrabold text-gray-800 truncate text-[10px] leading-tight">{mentor.name}</div>
                                                                                                <div className="text-[8px] text-gray-500 font-bold uppercase tracking-wider mt-0.5 truncate">{mentor.department}</div>
                                                                                            </div>
                                                                                        </div>
                                                                                    ))}
                                                                                    {colMentors.length === 0 && (
                                                                                        <span className="text-[9px] text-gray-400 italic pl-1">No faculty mentors configured</span>
                                                                                    )}
                                                                                </div>
                                                                            )}
                                                                        </div>
                                                                    );
                                                                })}
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* ── Tab: User Feedback ── */}
                    {activeTab === "feedback" && (
                        <div className="space-y-6 animate-fadeIn">
                            <PageHeader
                                icon={MessageSquare}
                                title="User Feedback & Issue Reports"
                                subtitle="Review bug reports, feature requests, and feedback submitted by Students, Mentors, and Staff."
                                meta={
                                    feedbackCounts.pending > 0 && (
                                        <span className="px-2.5 py-1 rounded-full bg-amber-100 text-amber-800 text-[11px] font-black border border-amber-200">
                                            {feedbackCounts.pending} Pending
                                        </span>
                                    )
                                }
                                actions={
                                    <Button variant="ghost"
                                        onClick={() => feedbackQuery.refetch()}
                                        className="h-auto flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white border border-gray-200 text-xs font-semibold text-gray-700 hover:bg-gray-50 hover:border-gray-300 shadow-2xs transition-all cursor-pointer"
                                    >
                                        <RefreshCw className={`h-3.5 w-3.5 ${feedbackLoading ? "animate-spin text-indigo-600" : ""}`} />
                                        Refresh Feed
                                    </Button>
                                }
                            />

                            {/* Status Summary KPI Cards */}
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                                {([
                                    ["all", "All Submissions", feedbackCounts.all, "border-indigo-300 bg-indigo-50/50 text-indigo-700", "Total tickets"],
                                    ["pending", "Pending Review", feedbackCounts.pending, "border-amber-300 bg-amber-50/50 text-amber-700", "Needs admin action"],
                                    ["resolved", "Resolved", feedbackCounts.resolved, "border-emerald-300 bg-emerald-50/50 text-emerald-700", "Action completed"],
                                    ["closed", "Closed", feedbackCounts.closed, "border-slate-300 bg-slate-50 text-slate-700", "Dismissed / Inactive"]
                                ] as const).map(([key, label, count, activeCls, sub]) => {
                                    const isSelected = feedbackStatusFilter === key;
                                    return (
                                        <button
                                            key={key}
                                            onClick={() => setFeedbackStatusFilter(key as any)}
                                            className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${isSelected
                                                ? `${activeCls} ring-2 ring-indigo-400/40 shadow-2xs`
                                                : "bg-white border-gray-200 hover:border-gray-300 hover:shadow-2xs"
                                                }`}
                                        >
                                            <div className="flex items-center justify-between">
                                                <span className="text-xl font-extrabold text-gray-900">{count}</span>
                                                {key === "pending" && count > 0 && (
                                                    <span className="h-2 w-2 rounded-full bg-amber-500 animate-ping" />
                                                )}
                                            </div>
                                            <p className="text-xs font-bold text-gray-800 mt-0.5">{label}</p>
                                            <p className="text-[10px] text-gray-400 font-medium">{sub}</p>
                                        </button>
                                    );
                                })}
                            </div>

                            {/* Filters Bar: Category Pills + Search */}
                            <div className="flex flex-wrap items-center justify-between gap-2.5 bg-white p-2.5 rounded-2xl border border-slate-100 shadow-card">
                                {/* Category Pills */}
                                <div className="flex items-center gap-1 flex-wrap">
                                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mr-1 flex items-center gap-1">
                                        <Filter className="h-3 w-3" /> Category:
                                    </span>
                                    {[
                                        { id: "all", label: "All Types", count: feedbackCounts.all },
                                        { id: "bug", label: "Bugs", count: feedbackCounts.bug },
                                        { id: "feature", label: "Features", count: feedbackCounts.feature },
                                        { id: "suggestion", label: "Suggestions", count: feedbackCounts.suggestion },
                                        { id: "other", label: "Other", count: feedbackCounts.other },
                                    ].map((cat) => {
                                        const isSelected = feedbackTypeFilter === cat.id;
                                        return (
                                            <button
                                                key={cat.id}
                                                onClick={() => setFeedbackTypeFilter(cat.id)}
                                                className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${isSelected
                                                    ? "bg-indigo-600 text-white shadow-2xs"
                                                    : "bg-gray-100 hover:bg-gray-200 text-gray-700"
                                                    }`}
                                            >
                                                <span>{cat.label}</span>
                                                <span className={`text-[9px] px-1.5 py-0.2 rounded-full font-bold ${isSelected ? "bg-white/20 text-white" : "bg-gray-200 text-gray-600"
                                                    }`}>
                                                    {cat.count}
                                                </span>
                                            </button>
                                        );
                                    })}
                                </div>

                                {/* Search Bar */}
                                <div className="relative w-full sm:w-72">
                                    <Search className="absolute left-3 top-2 h-3.5 w-3.5 text-gray-400" />
                                    <Input
                                        type="text"
                                        placeholder="Search student, roll, college, dept..."
                                        value={feedbackSearch}
                                        onChange={(e) => setFeedbackSearch(e.target.value)}
                                        className="w-full bg-gray-50 border border-gray-200 rounded-lg pl-8.5 pr-4 py-1.5 text-xs font-medium text-gray-800 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all"
                                    />
                                    {feedbackSearch && (
                                        <Button variant="ghost" size="icon"
                                            onClick={() => setFeedbackSearch("")}
                                            className="h-auto w-auto absolute right-2.5 top-2 text-gray-400 hover:text-gray-600"
                                        >
                                            <X className="h-3 w-3" />
                                        </Button>
                                    )}
                                </div>
                            </div>

                            {/* Feed List */}
                            {feedbackQuery.isLoading && filteredFeedbackReports.length === 0 ? (
                                <div className="flex flex-col items-center justify-center py-12 text-gray-400 bg-white rounded-xl border border-gray-200">
                                    <Loader2 className="h-6 w-6 animate-spin text-indigo-600 mb-2" />
                                    <p className="text-xs font-bold text-gray-500">Loading user feedback reports...</p>
                                </div>
                            ) : filteredFeedbackReports.length === 0 ? (
                                <div className="text-center py-12 bg-white rounded-2xl border border-slate-100 p-6 shadow-card">
                                    <div className="h-10 w-10 rounded-xl bg-indigo-50 text-indigo-400 flex items-center justify-center mx-auto mb-2.5">
                                        <MessageSquare className="h-5 w-5" />
                                    </div>
                                    <p className="text-xs font-extrabold text-gray-700">No Feedback Reports Found</p>
                                    <p className="text-[11px] text-gray-400 mt-0.5 max-w-sm mx-auto">
                                        {feedbackSearch || feedbackStatusFilter !== "all" || feedbackTypeFilter !== "all"
                                            ? "No records match your active search or filters. Try clearing the filter."
                                            : "User submissions from the floating \"Report Issue / Feedback\" modal will appear here."}
                                    </p>
                                    {(feedbackSearch || feedbackStatusFilter !== "all" || feedbackTypeFilter !== "all") && (
                                        <Button variant="ghost"
                                            onClick={() => {
                                                setFeedbackSearch("");
                                                setFeedbackStatusFilter("all");
                                                setFeedbackTypeFilter("all");
                                            }}
                                            className="h-auto mt-2.5 px-3 py-1 rounded-lg bg-indigo-50 text-indigo-600 hover:bg-indigo-100 text-xs font-bold transition-all"
                                        >
                                            Reset All Filters
                                        </Button>
                                    )}
                                </div>
                            ) : (
                                <div className="space-y-2.5">
                                    {feedbackPagination.pageItems.map((r: any) => {
                                        const isPending = (r.status || "pending") === "pending";
                                        const isResolved = r.status === "resolved";
                                        const isClosed = r.status === "closed";

                                        return (
                                            <div
                                                key={r.id}
                                                className="bg-white border border-slate-100 hover:border-indigo-300 rounded-2xl p-3 shadow-card hover:shadow-md transition-all space-y-2"
                                            >
                                                {/* Top Row: Meta Badges + Actions */}
                                                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 pb-2">
                                                    <div className="flex items-center gap-1.5 flex-wrap">
                                                        {/* Category Badge */}
                                                        <span
                                                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider border ${r.type === "bug"
                                                                ? "bg-rose-50 text-rose-700 border-rose-200"
                                                                : r.type === "feature"
                                                                    ? "bg-purple-50 text-purple-700 border-purple-200"
                                                                    : r.type === "suggestion"
                                                                        ? "bg-sky-50 text-sky-700 border-sky-200"
                                                                        : "bg-slate-100 text-slate-700 border-slate-200"
                                                                }`}
                                                        >
                                                            <Tag className="h-2.5 w-2.5" />
                                                            {r.type || "other"}
                                                        </span>

                                                        {/* Status Badge */}
                                                        <span
                                                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider border ${isPending
                                                                ? "bg-amber-50 text-amber-700 border-amber-300"
                                                                : isResolved
                                                                    ? "bg-emerald-50 text-emerald-700 border-emerald-300"
                                                                    : "bg-slate-100 text-slate-600 border-slate-300"
                                                                }`}
                                                        >
                                                            <span
                                                                className={`h-1.5 w-1.5 rounded-full ${isPending ? "bg-amber-500 animate-pulse" : isResolved ? "bg-emerald-500" : "bg-slate-400"
                                                                    }`}
                                                            />
                                                            {r.status || "pending"}
                                                        </span>

                                                        {/* Timestamp */}
                                                        <span className="flex items-center gap-1 text-[10px] text-gray-400 font-medium ml-1">
                                                            <Clock className="h-3 w-3" />
                                                            {r.created_at
                                                                ? new Date(r.created_at).toLocaleString("en-IN", {
                                                                    day: "2-digit",
                                                                    month: "short",
                                                                    year: "numeric",
                                                                    hour: "2-digit",
                                                                    minute: "2-digit",
                                                                    hour12: true,
                                                                })
                                                                : ""}
                                                        </span>
                                                    </div>

                                                    {/* Quick Actions */}
                                                    <div className="flex items-center gap-1.5">
                                                        {isPending && (
                                                            <>
                                                                <Button variant="ghost"
                                                                    onClick={() => {
                                                                        setResolvingReport(r);
                                                                        setResolutionNote("");
                                                                    }}
                                                                    className="h-auto flex items-center gap-1 px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-bold shadow-2xs transition-all cursor-pointer"
                                                                >
                                                                    <MessageSquare className="h-3 w-3" />
                                                                    Resolve with Note
                                                                </Button>
                                                                <Button variant="ghost"
                                                                    disabled={feedbackStatusUpdating === r.id}
                                                                    onClick={() => handleFeedbackStatus(r.id, "resolved")}
                                                                    className="h-auto flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-[11px] font-bold shadow-2xs transition-all cursor-pointer"
                                                                    title="Mark as resolved without custom remarks"
                                                                >
                                                                    {feedbackStatusUpdating === r.id ? (
                                                                        <Loader2 className="h-3 w-3 animate-spin" />
                                                                    ) : (
                                                                        <CheckCircle2 className="h-3 w-3" />
                                                                    )}
                                                                    Quick Resolve
                                                                </Button>
                                                                <Button variant="ghost"
                                                                    disabled={feedbackStatusUpdating === r.id}
                                                                    onClick={() => handleFeedbackStatus(r.id, "closed")}
                                                                    className="h-auto px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 disabled:opacity-50 text-slate-700 border border-slate-200 text-[11px] font-bold transition-all cursor-pointer"
                                                                >
                                                                    Close
                                                                </Button>
                                                            </>
                                                        )}
                                                        {(isResolved || isClosed) && (
                                                            <Button variant="ghost"
                                                                disabled={feedbackStatusUpdating === r.id}
                                                                onClick={() => handleFeedbackStatus(r.id, "pending")}
                                                                className="h-auto flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white hover:bg-gray-50 disabled:opacity-50 text-gray-700 border border-gray-300 text-[11px] font-bold transition-all cursor-pointer shadow-2xs"
                                                            >
                                                                <RefreshCw className="h-3 w-3" />
                                                                Reopen Ticket
                                                            </Button>
                                                        )}
                                                    </div>
                                                </div>

                                                {/* Reporter Identity Banner (Compact single-line) */}
                                                <div className="rounded-lg bg-slate-50/90 border border-slate-200/80 px-2.5 py-1.5">
                                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                                        {/* Left: Avatar + Name + Role + Reg Number + College */}
                                                        <div className="flex items-center gap-2 min-w-0">
                                                            <div className="h-6 w-6 rounded-full bg-gradient-to-tr from-indigo-600 to-purple-600 flex items-center justify-center text-white font-extrabold text-[9px] shadow-2xs shrink-0">
                                                                {(() => {
                                                                    const dName = r.user_name || (r.user_id && typeof r.user_id === 'string' && r.user_id.includes("@") ? r.user_id.split("@")[0] : "User");
                                                                    return (dName && typeof dName === 'string') ? dName.slice(0, 2).toUpperCase() : "U";
                                                                })()}
                                                            </div>
                                                            <div className="min-w-0 flex items-center gap-1.5 flex-wrap">
                                                                <span className="text-xs font-black text-gray-900 truncate">
                                                                    {r.user_name || (r.user_id && typeof r.user_id === 'string' && r.user_id.includes("@")
                                                                        ? r.user_id.split("@")[0].replace(/[._0-9-]/g, " ").trim().split(/\s+/).map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ")
                                                                        : (r.user_id || "Anonymous User"))}
                                                                </span>
                                                                <span
                                                                    className={`px-1.5 py-0.2 rounded text-[9px] font-black uppercase tracking-wider border ${(r.user_role || "").toLowerCase() === "student"
                                                                        ? "bg-indigo-100 text-indigo-800 border-indigo-200"
                                                                        : (r.user_role || "").toLowerCase() === "mentor"
                                                                            ? "bg-teal-100 text-teal-800 border-teal-200"
                                                                            : normalizeRoleValue(r.user_role || "") === "cm"
                                                                                ? "bg-violet-100 text-violet-800 border-violet-200"
                                                                                : normalizeRoleValue(r.user_role || "") === "L and D"
                                                                                    ? "bg-fuchsia-100 text-fuchsia-800 border-fuchsia-200"
                                                                                    : "bg-gray-100 text-gray-800 border-gray-200"
                                                                        }`}
                                                                >
                                                                    {formatRoleLabel(r.user_role) || "User"}
                                                                </span>
                                                                {r.register_number && r.register_number !== "—" && (
                                                                    <span className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded bg-white border border-gray-200 text-[9px] font-mono font-bold text-gray-600">
                                                                        <Tag className="h-2 w-2 text-gray-400" />
                                                                        {r.register_number}
                                                                    </span>
                                                                )}
                                                                {(r.college_name || r.department) && (
                                                                    <span className="text-[11px] text-gray-500 font-medium inline-flex items-center gap-1 ml-0.5">
                                                                        <span className="text-gray-300">•</span>
                                                                        {r.college_name && (
                                                                            <span className="inline-flex items-center gap-0.5 text-gray-700 font-semibold">
                                                                                <Building2 className="h-3 w-3 text-indigo-500 shrink-0" />
                                                                                {r.college_name}
                                                                            </span>
                                                                        )}
                                                                        {r.department && (
                                                                            <span className="inline-flex items-center gap-0.5 text-gray-600">
                                                                                <GraduationCap className="h-3 w-3 text-indigo-400 shrink-0" />
                                                                                {r.department}
                                                                            </span>
                                                                        )}
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </div>

                                                        {/* Right: Contact details */}
                                                        <div className="flex items-center gap-1.5 text-xs text-gray-600">
                                                            {r.user_id && (
                                                                <a
                                                                    href={`mailto:${r.user_id}`}
                                                                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white border border-gray-200 hover:border-indigo-300 text-gray-700 hover:text-indigo-600 transition-colors font-medium text-[10px]"
                                                                    title="Send Email"
                                                                >
                                                                    <Mail className="h-3 w-3 text-indigo-500" />
                                                                    <span>{r.user_id}</span>
                                                                </a>
                                                            )}
                                                            {r.contact_info && (
                                                                <a
                                                                    href={`tel:${r.contact_info}`}
                                                                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white border border-gray-200 hover:border-emerald-300 text-gray-700 hover:text-emerald-600 transition-colors font-medium text-[10px]"
                                                                    title="Call reporter"
                                                                >
                                                                    <Phone className="h-3 w-3 text-emerald-500" />
                                                                    <span>{r.contact_info}</span>
                                                                </a>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* Issue Title & Description */}
                                                <div className="space-y-1">
                                                    <h3 className="text-xs font-bold text-gray-900 leading-snug">
                                                        {r.title}
                                                    </h3>
                                                    <div className="p-2.5 rounded-lg bg-slate-50/70 border-l-2 border-indigo-400 text-xs text-gray-700 leading-relaxed whitespace-pre-wrap font-normal">
                                                        {r.description}
                                                    </div>
                                                </div>

                                                {/* Admin Resolution Callout */}
                                                {(r.admin_notes || r.resolved_by) && (
                                                    <div className="rounded-lg bg-emerald-50/80 border border-emerald-200/90 p-2 space-y-0.5">
                                                        <div className="flex items-center justify-between text-xs font-bold text-emerald-800">
                                                            <span className="inline-flex items-center gap-1">
                                                                <CheckCircle className="h-3.5 w-3.5 text-emerald-600" />
                                                                Admin Resolution Remarks
                                                            </span>
                                                            {r.resolved_at && (
                                                                <span className="text-[9px] font-mono text-emerald-600 font-semibold">
                                                                    {new Date(r.resolved_at).toLocaleString("en-IN", {
                                                                        day: "2-digit",
                                                                        month: "short",
                                                                        year: "numeric",
                                                                        hour: "2-digit",
                                                                        minute: "2-digit",
                                                                        hour12: true,
                                                                    })}
                                                                </span>
                                                            )}
                                                        </div>
                                                        <p className="text-xs text-emerald-950 font-medium pl-4.5 whitespace-pre-wrap">
                                                            {r.admin_notes || "Ticket has been reviewed and resolved."}
                                                        </p>
                                                        {r.resolved_by && (
                                                            <p className="text-[10px] text-emerald-700 font-bold pl-4.5 pt-0.5">
                                                                Handled by: <span className="underline">{r.resolved_by}</span>
                                                            </p>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                    <Pagination
                                        currentPage={feedbackPagination.page}
                                        totalItems={filteredFeedbackReports.length}
                                        pageSize={feedbackPagination.pageSize}
                                        onPageChange={feedbackPagination.setPage}
                                        onPageSizeChange={feedbackPagination.setPageSize}
                                        pageSizeOptions={feedbackPagination.pageSizeOptions}
                                        className="rounded-xl border border-gray-200"
                                        ariaLabel="Feedback reports pagination"
                                    />
                                </div>
                            )}

                            {/* ── Resolve Ticket with Note Modal ── */}
                            {resolvingReport && (
                                <Dialog
                                    open={true}
                                    onOpenChange={(next) => {
                                        if (!next) {
                                            setResolvingReport(null);
                                            setResolutionNote("");
                                        }
                                    }}
                                    ariaLabel="Resolve Ticket"
                                    overlayClassName="p-4 bg-slate-950/60 backdrop-blur-sm animate-fadeIn"
                                    panelClassName="max-w-lg bg-white rounded-2xl p-6 overflow-hidden space-y-4 max-h-[90vh]"
                                >
                                    <div className="flex items-center justify-between border-b border-gray-100 pb-3">
                                        <div className="flex items-center gap-2.5">
                                            <div className="h-9 w-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
                                                <CheckCircle2 className="h-5 w-5" />
                                            </div>
                                            <div>
                                                <h3 className="text-sm font-bold text-gray-900">Resolve Ticket & Respond</h3>
                                                <p className="text-[11px] text-gray-400">Reporter will receive your note and in-app notification</p>
                                            </div>
                                        </div>
                                        <Button variant="ghost" size="icon"
                                            aria-label="Close resolve ticket dialog"
                                            onClick={() => {
                                                setResolvingReport(null);
                                                setResolutionNote("");
                                            }}
                                            className="h-auto w-auto p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors cursor-pointer"
                                        >
                                            <X className="h-4 w-4" />
                                        </Button>
                                    </div>

                                    <div className="p-3 bg-gray-50 rounded-xl border border-gray-200 text-xs space-y-1">
                                        <p className="font-bold text-gray-800 line-clamp-1">{resolvingReport.title}</p>
                                        <p className="text-gray-500 text-[11px]">
                                            Raised by <span className="font-semibold text-gray-700">{resolvingReport.user_name || resolvingReport.user_id}</span> ({formatRoleLabel(resolvingReport.user_role) || "User"})
                                            {resolvingReport.college_name ? ` • ${resolvingReport.college_name}` : ""}
                                        </p>
                                    </div>

                                    <div className="space-y-1.5">
                                        <label className="block text-[11px] font-bold text-gray-600 uppercase tracking-wider">
                                            Resolution Note / Action Taken
                                        </label>
                                        <Textarea
                                            aria-label="Resolution Note / Action Taken"
                                            rows={4}
                                            value={resolutionNote}
                                            onChange={(e) => setResolutionNote(e.target.value)}
                                            placeholder="e.g. Corrected date of birth in database. Please verify your profile."
                                            className="w-full p-3 rounded-xl border border-gray-200 text-xs font-medium text-gray-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                                        />
                                        {/* Quick preset chips */}
                                        <div className="flex flex-wrap gap-1.5 pt-1">
                                            <span className="text-[10px] text-gray-400 font-bold self-center">Quick insert:</span>
                                            {[
                                                "Issue verified and corrected.",
                                                "Record updated in database.",
                                                "Feature planned for next release.",
                                                "Contacted user with clarification."
                                            ].map((preset) => (
                                                <Button variant="ghost"
                                                    key={preset}
                                                    type="button"
                                                    onClick={() => setResolutionNote(preset)}
                                                    className="h-auto text-[10px] px-2 py-0.5 rounded-md bg-gray-100 hover:bg-indigo-50 hover:text-indigo-700 text-gray-600 font-medium transition-colors border border-gray-200 cursor-pointer"
                                                >
                                                    {preset}
                                                </Button>
                                            ))}
                                        </div>
                                    </div>

                                    <div className="flex gap-2 pt-2 border-t border-gray-100">
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setResolvingReport(null);
                                                setResolutionNote("");
                                            }}
                                            className="flex-1 py-2.5 rounded-xl border border-gray-200 text-xs font-bold text-gray-600 hover:bg-gray-50 transition-colors cursor-pointer"
                                        >
                                            Cancel
                                        </button>
                                        <Button variant="ghost"
                                            type="button"
                                            disabled={feedbackStatusUpdating === resolvingReport.id}
                                            onClick={() => handleFeedbackStatus(resolvingReport.id, "resolved", resolutionNote.trim() || "Resolved by Admin")}
                                            className="h-auto flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-colors shadow-sm flex items-center justify-center gap-1.5 disabled:opacity-50 cursor-pointer"
                                        >
                                            {feedbackStatusUpdating === resolvingReport.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                                            Confirm & Resolve
                                        </Button>
                                    </div>
                                </Dialog>
                            )}
                        </div>
                    )}

                    {/* ── Tab: Global Audit Logs ── */}
                    {activeTab === "logs" && (
                        <div className="space-y-6 animate-fadeIn">
                            <PageHeader
                                icon={History}
                                title="Global System Audit Logs"
                                subtitle="Every privileged action recorded across the platform."
                                actions={
                                    <div className="relative">
                                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                                        <Input
                                            type="text"
                                            placeholder="Filter logs by actor, action, role..."
                                            value={logsSearchQuery}
                                            onChange={(e) => setLogsSearchQuery(e.target.value)}
                                            className="bg-white border border-gray-200 rounded-xl pl-9 pr-4 py-2 text-xs text-gray-800 focus:outline-none focus:ring-1 focus:ring-indigo-600 w-64"
                                        />
                                    </div>
                                }
                            />

                            {filteredLogs.length === 0 ? (
                                <div className="text-center py-16 border border-gray-200 rounded-xl bg-gray-50/50">
                                    <ShieldAlert className="h-10 w-10 text-gray-300 mx-auto mb-2" />
                                    <p className="text-sm text-gray-500 font-semibold">No audit logs found matching your query.</p>
                                </div>
                            ) : (
                                <TableSurface
                                    className="border-gray-200"
                                    footer={
                                        <Pagination
                                            currentPage={logsPagination.page}
                                            totalItems={filteredLogs.length}
                                            pageSize={logsPagination.pageSize}
                                            onPageChange={logsPagination.setPage}
                                            onPageSizeChange={logsPagination.setPageSize}
                                            pageSizeOptions={logsPagination.pageSizeOptions}
                                        />
                                    }
                                >
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead className="w-1/4">Actor</TableHead>
                                            <TableHead className="w-7/12">Action Detail</TableHead>
                                            <TableHead className="w-1/6 text-right">Timestamp</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {logsPagination.pageItems.map((log) => {
                                            const isHandover = log.type.includes("handover");
                                            const isCsv = log.type.includes("csv");
                                            return (
                                                <TableRow key={log.id}>
                                                    <TableCell>
                                                        <div className="font-bold text-gray-900">{log.actorName}</div>
                                                        <Badge variant="secondary" className="mt-0.5">{formatRoleLabel(log.actorRole)}</Badge>
                                                    </TableCell>
                                                    <TableCell>
                                                        <div className="text-gray-700 leading-snug">{log.description}</div>
                                                        <div className="mt-1">
                                                            <Badge variant={isHandover ? "warning" : isCsv ? "success" : "secondary"} className="text-[7.5px]">
                                                                {log.type.replace("_", " ")}
                                                            </Badge>
                                                        </div>
                                                    </TableCell>
                                                    <TableCell className="text-right text-gray-400 whitespace-nowrap">
                                                        {formatDate(log.timestamp)}
                                                    </TableCell>
                                                </TableRow>
                                            );
                                        })}
                                    </TableBody>
                                </TableSurface>
                            )}
                        </div>
                    )}

                    {/* ── Tab: Announcements ── */}
                    {activeTab === "announcements" && (
                        <div className="space-y-6 animate-fadeIn font-sans text-xs">
                            <PageHeader
                                icon={Megaphone}
                                title="Campus Announcements"
                                subtitle="Broadcast notices to every campus, a single role, or one campus."
                                actions={
                                    <Button variant="ghost"
                                        onClick={() => {
                                            setModalError(null);
                                            setAnnForm({ title: "", description: "", target_role: "All", college_id: "" });
                                            setShowAnnModal(true);
                                        }}
                                        className="h-auto btn-gradient shadow-sm text-white px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
                                    >
                                        <Plus className="h-4 w-4" />
                                        Compose Announcement
                                    </Button>
                                }
                            />

                            {isAnnouncementsLoading && announcements.length === 0 ? (
                                <div className="flex flex-col items-center gap-2 py-16 text-gray-400">
                                    <Loader2 className="h-7 w-7 animate-spin text-indigo-500" />
                                    <p className="text-sm font-semibold">Loading announcements…</p>
                                </div>
                            ) : announcements.length === 0 ? (
                                <div className="text-center py-16 border border-gray-200 rounded-xl bg-gray-50/50">
                                    <Megaphone className="h-10 w-10 text-gray-300 mx-auto mb-2" />
                                    <p className="text-sm text-gray-500 font-semibold">No announcements published yet.</p>
                                </div>
                            ) : (
                                <>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        {announcementPagination.pageItems.map((ann) => {
                                            const targetCampus = colleges.find(c => c.id === ann.college_id)?.name || "All Campuses";
                                            return (
                                                <div key={ann.id} className="p-6 bg-white border border-gray-200 rounded-xl shadow-sm hover:shadow-md transition-all relative flex flex-col justify-between">
                                                    <div className="space-y-3">
                                                        <div className="flex justify-between items-start gap-4">
                                                            <h3 className="text-sm font-bold text-gray-900 leading-snug">{ann.title}</h3>
                                                            <Button
                                                                variant="ghost"
                                                                size="icon"
                                                                onClick={() => handleDeleteAnnouncement(ann.id)}
                                                                isLoading={loadingActions[`announcement_${ann.id}`]}
                                                                loadingText=" "
                                                                className="h-7 w-7 text-gray-400 hover:bg-rose-50 hover:text-rose-600"
                                                                title="Delete Announcement"
                                                            >
                                                                <Trash2 className="h-3.5 w-3.5" />
                                                            </Button>
                                                        </div>
                                                        <p className="text-xs text-gray-600 font-semibold leading-relaxed whitespace-pre-line">{ann.description}</p>
                                                    </div>

                                                    <div className="mt-5 pt-4 border-t border-gray-100 flex flex-wrap justify-between items-center text-[10px] text-gray-500 gap-2">
                                                        <div className="flex flex-wrap gap-1.5">
                                                            <span className="px-2 py-0.5 rounded bg-pink-50 border border-pink-100 text-pink-700 font-bold">
                                                                Role: {ann.target_role}
                                                            </span>
                                                            <span className="px-2 py-0.5 rounded bg-indigo-50 border border-indigo-100 text-indigo-700 font-bold">
                                                                Campus: {targetCampus}
                                                            </span>
                                                        </div>
                                                        <span className="font-semibold">{formatDate(ann.created_at)}</span>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                    <Pagination
                                        className="rounded-xl border border-gray-200"
                                        ariaLabel="Announcements pagination"
                                        currentPage={announcementPagination.page}
                                        totalItems={announcements.length}
                                        pageSize={announcementPagination.pageSize}
                                        onPageChange={announcementPagination.setPage}
                                        onPageSizeChange={announcementPagination.setPageSize}
                                        pageSizeOptions={announcementPagination.pageSizeOptions}
                                    />
                                </>
                            )}
                        </div>
                    )}

                    {/* ── Tab: Holidays ── */}
                    {activeTab === "holidays" && (
                        <div className="space-y-6 animate-fadeIn font-sans text-xs">
                            <PageHeader
                                icon={Calendar}
                                title="Campus Holidays"
                                subtitle="National, regional and campus-specific holiday calendar."
                                actions={
                                    <Button variant="ghost"
                                        onClick={() => {
                                            setModalError(null);
                                            setHolForm({ title: "", date: "", type: "National Holiday", college_id: "" });
                                            setShowHolModal(true);
                                        }}
                                        className="h-auto btn-gradient shadow-sm text-white px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 composition-btn cursor-pointer"
                                    >
                                        <Plus className="h-4 w-4" />
                                        Schedule Holiday
                                    </Button>
                                }
                            />

                            {holidays.length === 0 ? (
                                <div className="text-center py-16 border border-gray-200 rounded-xl bg-gray-50/50">
                                    <Calendar className="h-10 w-10 text-gray-300 mx-auto mb-2" />
                                    <p className="text-sm text-gray-500 font-semibold">No holidays scheduled.</p>
                                </div>
                            ) : (
                                <TableSurface
                                    className="border-gray-200"
                                    footer={
                                        <Pagination
                                            currentPage={holidayPagination.page}
                                            totalItems={holidays.length}
                                            pageSize={holidayPagination.pageSize}
                                            onPageChange={holidayPagination.setPage}
                                            onPageSizeChange={holidayPagination.setPageSize}
                                            pageSizeOptions={holidayPagination.pageSizeOptions}
                                        />
                                    }
                                >
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Holiday Title</TableHead>
                                            <TableHead>Date</TableHead>
                                            <TableHead>Type</TableHead>
                                            <TableHead>Applicable Campus</TableHead>
                                            <TableHead className="text-right">Actions</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {holidayPagination.pageItems.map((hol) => {
                                            const targetCampus = colleges.find(c => c.id === hol.college_id)?.name || "All Campuses";
                                            return (
                                                <TableRow key={hol.id}>
                                                    <TableCell className="font-bold text-gray-900">{hol.title}</TableCell>
                                                    <TableCell className="font-semibold text-indigo-600">{hol.date}</TableCell>
                                                    <TableCell>
                                                        <Badge variant="secondary">{hol.type}</Badge>
                                                    </TableCell>
                                                    <TableCell className="font-bold">{targetCampus}</TableCell>
                                                    <TableCell className="text-right">
                                                        <Button
                                                            variant="destructive"
                                                            size="icon"
                                                            onClick={() => handleDeleteHoliday(hol.id)}
                                                            isLoading={loadingActions[`holiday_${hol.id}`]}
                                                            title="Delete Holiday"
                                                        >
                                                            <Trash2 className="h-4 w-4" />
                                                        </Button>
                                                    </TableCell>
                                                </TableRow>
                                            );
                                        })}
                                    </TableBody>
                                </TableSurface>
                            )}
                        </div>
                    )}

                    {/* ── Tab: Centralized Users ── */}
                    {activeTab === "users" && (() => {
                        const pendingSignupsCount = signupRequests.filter(r => r.status === 'pending').length;
                        return (
                            <div className="space-y-6 animate-fadeIn font-sans text-xs">
                                <PageHeader
                                    icon={UserCheck}
                                    title="User Credentials Directory"
                                    subtitle="Every sign-in account across all roles, with pending registration requests."
                                    actions={
                                        <div className="flex gap-2">
                                            <button
                                                onClick={() => setUserSubTab("directory")}
                                                aria-pressed={userSubTab === "directory"}
                                                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${userSubTab === "directory"
                                                    ? "bg-indigo-600 text-white shadow-sm"
                                                    : "bg-gray-100 hover:bg-gray-200 text-gray-700"
                                                    }`}
                                            >
                                                Active Users
                                            </button>
                                            <button
                                                onClick={() => setUserSubTab("signups")}
                                                aria-pressed={userSubTab === "signups"}
                                                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-2 ${userSubTab === "signups"
                                                    ? "bg-indigo-600 text-white shadow-sm"
                                                    : "bg-gray-100 hover:bg-gray-200 text-gray-700"
                                                    }`}
                                            >
                                                Pending Signups
                                                {pendingSignupsCount > 0 && (
                                                    <span className="px-1.5 py-0.5 rounded-full bg-rose-600 text-[10px] font-black text-white leading-none">
                                                        {pendingSignupsCount}
                                                    </span>
                                                )}
                                            </button>
                                        </div>
                                    }
                                />

                                {userSubTab === "directory" ? (
                                    <div className="space-y-4">
                                        {/* Role Filter & Control Bar */}
                                        <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-4 border border-slate-100 rounded-2xl shadow-card">
                                            <div className="flex items-center gap-1.5 flex-wrap">
                                                {[
                                                    { id: "all", label: "All Roles" },
                                                    { id: "admin", label: "Admin" },
                                                    { id: "cm", label: "CM" },
                                                    { id: "kam", label: "KAM" },
                                                    { id: "mentor", label: "Mentor" },
                                                    { id: "sme", label: "SME" },
                                                    { id: "student", label: "Student" },
                                                    { id: "fee_manager", label: "Fee Mgr" },
                                                    { id: "L and D", label: "L&D" },
                                                    { id: "hr", label: "HR" }
                                                ].map(r => (
                                                    <button
                                                        key={r.id}
                                                        onClick={() => setUsersRoleFilter(r.id)}
                                                        className={`px-3 py-1 rounded-xl text-xs font-bold transition-all cursor-pointer ${usersRoleFilter === r.id
                                                            ? "bg-indigo-600 text-white shadow-xs"
                                                            : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                                                            }`}
                                                    >
                                                        {r.label}
                                                    </button>
                                                ))}
                                            </div>

                                            <div className="flex items-center gap-2">
                                                <div className="relative">
                                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
                                                    <Input
                                                        type="text"
                                                        placeholder="Search email, ID, or reference..."
                                                        value={usersSearchQuery}
                                                        onChange={(e) => setUsersSearchQuery(e.target.value)}
                                                        className="bg-gray-50 border border-gray-200 rounded-xl pl-8 pr-3 py-1.5 text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-indigo-600 text-gray-800 w-56"
                                                    />
                                                </div>

                                                <Button variant="ghost"
                                                    onClick={() => {
                                                        setEditingUser(null);
                                                        setUserForm({ id: "", email: "", role: "mentor", password: "", reference_id: "", status: "Active" });
                                                        setUserModalError(null);
                                                        setShowUserModal(true);
                                                    }}
                                                    className="h-auto btn-gradient shadow-sm text-white px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1 cursor-pointer border-none shrink-0"
                                                >
                                                    <Plus className="h-4 w-4" />
                                                    Add User Credential
                                                </Button>
                                            </div>
                                        </div>

                                        {/* Directory Table */}
                                        {(() => {
                                            if (isUsersError) {
                                                return (
                                                    <div className="text-center py-16 border border-rose-200 rounded-xl bg-rose-50/40">
                                                        <AlertTriangle className="h-10 w-10 text-rose-400 mx-auto mb-2" />
                                                        <p className="text-sm text-rose-600 font-semibold">Could not load user credentials.</p>
                                                        <Button variant="outline" size="sm" className="mt-3" onClick={() => usersQuery.refetch()} isLoading={isUsersLoading}>
                                                            Retry
                                                        </Button>
                                                    </div>
                                                );
                                            }

                                            if (isUsersLoading && (usersList || []).length === 0) {
                                                return (
                                                    <div className="flex flex-col items-center gap-2 py-16 text-gray-400">
                                                        <Loader2 className="h-7 w-7 animate-spin text-indigo-500" />
                                                        <p className="text-sm font-semibold">Loading user credentials…</p>
                                                    </div>
                                                );
                                            }

                                            if (filteredUsers.length === 0) {
                                                return (
                                                    <div className="text-center py-16 border border-gray-200 rounded-xl bg-gray-50/50">
                                                        <Users className="h-10 w-10 text-gray-300 mx-auto mb-2" />
                                                        <p className="text-sm text-gray-500 font-semibold">No user credentials found matching your filter query.</p>
                                                    </div>
                                                );
                                            }

                                            return (
                                                <TableSurface
                                                    className="border-gray-200 bg-white shadow-sm"
                                                    footer={
                                                        <Pagination
                                                            currentPage={usersPagination.page}
                                                            totalItems={filteredUsers.length}
                                                            pageSize={usersPagination.pageSize}
                                                            onPageChange={usersPagination.setPage}
                                                            onPageSizeChange={usersPagination.setPageSize}
                                                            pageSizeOptions={usersPagination.pageSizeOptions}
                                                        />
                                                    }
                                                >
                                                    <TableHeader>
                                                        <TableRow>
                                                            <TableHead className="w-[24%]">User Email &amp; Credential ID</TableHead>
                                                            <TableHead className="w-[12%]">System Role</TableHead>
                                                            <TableHead className="w-[14%]">Reference ID</TableHead>
                                                            <TableHead className="w-[18%]">Current Password</TableHead>
                                                            <TableHead className="w-[10%] text-center">Status</TableHead>
                                                            <TableHead className="w-[10%]">Last Login</TableHead>
                                                            <TableHead className="w-[12%] text-right">Actions</TableHead>
                                                        </TableRow>
                                                    </TableHeader>
                                                    <TableBody>
                                                        {usersPagination.pageItems.map((user) => {
                                                            const userRole = normalizeRoleValue(user.role);
                                                            const roleVariant: "default" | "warning" | "destructive" | "success" | "secondary" | "outline" =
                                                                userRole === "admin" ? "default" :
                                                                    userRole === "cm" ? "warning" :
                                                                        userRole === "kam" ? "warning" :
                                                                            userRole === "mentor" ? "secondary" :
                                                                                userRole === "sme" ? "success" :
                                                                                    userRole === "student" ? "outline" :
                                                                                        "secondary";

                                                            const userPass = user.plain_password || "Not stored (hash only)";
                                                            const isCustomPass = user.plain_password && user.plain_password !== "password123";
                                                            const isRevealed = !!revealedPasswords[user.id];

                                                            return (
                                                                <TableRow key={user.id}>
                                                                    <TableCell>
                                                                        <div className="font-bold text-gray-900 text-xs">{user.email}</div>
                                                                        <div className="text-[9px] font-mono text-gray-400 mt-0.5">{user.id}</div>
                                                                    </TableCell>
                                                                    <TableCell>
                                                                        <Badge variant={roleVariant}>{formatRoleLabel(userRole)}</Badge>
                                                                    </TableCell>
                                                                    <TableCell className="font-mono text-[10.5px] text-gray-600">
                                                                        {user.reference_id || user.id}
                                                                    </TableCell>
                                                                    <TableCell>
                                                                        <div className="flex items-center gap-1.5">
                                                                            <span className={`font-mono text-[11px] font-bold px-2 py-0.5 rounded-md border ${isRevealed
                                                                                ? "bg-indigo-50/70 border-indigo-200 text-indigo-900"
                                                                                : "bg-gray-50 border-gray-200 text-gray-600 tracking-widest"
                                                                                }`}>
                                                                                {isRevealed ? userPass : "••••••••"}
                                                                            </span>
                                                                            <Button variant="ghost" size="icon"
                                                                                type="button"
                                                                                onClick={() => togglePasswordVisibility(user.id)}
                                                                                className="h-auto w-auto p-1 hover:bg-gray-100 rounded text-gray-500 hover:text-indigo-600 transition-colors cursor-pointer"
                                                                                title={isRevealed ? "Hide Password" : "Show Password"}
                                                                            >
                                                                                {isRevealed ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                                                                            </Button>
                                                                            <Button variant="ghost" size="icon"
                                                                                type="button"
                                                                                onClick={() => handleCopyPassword(user.id, userPass)}
                                                                                className="h-auto w-auto p-1 hover:bg-gray-100 rounded text-gray-500 hover:text-emerald-600 transition-colors cursor-pointer"
                                                                                title="Copy Password"
                                                                            >
                                                                                {copiedPassId === user.id ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                                                                            </Button>
                                                                        </div>
                                                                        <Badge variant={isCustomPass ? "default" : "secondary"} className="mt-1">
                                                                            {isCustomPass ? "Custom" : "Default"}
                                                                        </Badge>
                                                                    </TableCell>
                                                                    <TableCell className="text-center">
                                                                        <button
                                                                            onClick={() => handleToggleUserStatus(user.id)}
                                                                            className="cursor-pointer"
                                                                            title="Click to toggle Active / Inactive status"
                                                                        >
                                                                            <Badge variant={user.status === "Active" ? "success" : "destructive"}>
                                                                                {user.status || "Active"}
                                                                            </Badge>
                                                                        </button>
                                                                    </TableCell>
                                                                    <TableCell className="text-[10px]">
                                                                        {user.last_login ? formatDate(user.last_login) : "Never logged in"}
                                                                    </TableCell>
                                                                    <TableCell className="text-right">
                                                                        <div className="flex justify-end gap-1.5">
                                                                            <Button variant="warning" size="sm" onClick={() => handleResetUserPassword(user.id, user.email)} title="Reset password to the institution default">
                                                                                Reset Pass
                                                                            </Button>
                                                                            <Button
                                                                                variant="outline"
                                                                                size="icon"
                                                                                onClick={() => {
                                                                                    setEditingUser(user);
                                                                                    setUserForm({
                                                                                        id: user.id,
                                                                                        email: user.email,
                                                                                        role: normalizeRoleValue(user.role),
                                                                                        password: "",
                                                                                        reference_id: user.reference_id || "",
                                                                                        status: user.status || "Active"
                                                                                    });
                                                                                    setUserModalError(null);
                                                                                    setShowUserModal(true);
                                                                                }}
                                                                                title="Edit User Credential"
                                                                            >
                                                                                <Edit className="h-3.5 w-3.5" />
                                                                            </Button>
                                                                            <Button variant="destructive" size="icon" onClick={() => handleDeleteUser(user.id, user.email)} title="Delete User">
                                                                                <Trash2 className="h-3.5 w-3.5" />
                                                                            </Button>
                                                                        </div>
                                                                    </TableCell>
                                                                </TableRow>
                                                            );
                                                        })}
                                                    </TableBody>
                                                </TableSurface>
                                            );
                                        })()}
                                    </div>
                                ) : (
                                    <TableSurface
                                        className="border-gray-200"
                                        footer={
                                            <Pagination
                                                currentPage={signupPagination.page}
                                                totalItems={signupRequests.length}
                                                pageSize={signupPagination.pageSize}
                                                onPageChange={signupPagination.setPage}
                                                onPageSizeChange={signupPagination.setPageSize}
                                                pageSizeOptions={signupPagination.pageSizeOptions}
                                                ariaLabel="Signup requests pagination"
                                            />
                                        }
                                    >
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead>Name</TableHead>
                                                <TableHead>Email</TableHead>
                                                <TableHead>Requested Role</TableHead>
                                                <TableHead>Campus / College</TableHead>
                                                <TableHead>Status</TableHead>
                                                <TableHead className="text-right">Actions</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {signupRequests.length === 0 ? (
                                                <TableRow>
                                                    <TableCell colSpan={6} className="h-32 text-center">
                                                        <div className="flex flex-col items-center gap-2 text-gray-400">
                                                            <UserCheck className="h-8 w-8" />
                                                            <p className="text-sm font-semibold">No signup requests submitted yet.</p>
                                                        </div>
                                                    </TableCell>
                                                </TableRow>
                                            ) : (
                                                signupPagination.pageItems.map((req) => {
                                                    const targetCol = colleges.find(c => c.id === req.college_id);
                                                    return (
                                                        <TableRow key={req.id}>
                                                            <TableCell className="font-bold text-gray-900">{req.name}</TableCell>
                                                            <TableCell className="font-mono text-gray-600">{req.email}</TableCell>
                                                            <TableCell>
                                                                <Badge variant="secondary">
                                                                    {req.requested_role === "pending" ? "Pending Assignment" : formatRoleLabel(req.requested_role)}
                                                                </Badge>
                                                            </TableCell>
                                                            <TableCell className="font-bold">{targetCol ? targetCol.name : "Unassigned"}</TableCell>
                                                            <TableCell>
                                                                <Badge variant={
                                                                    req.status === "pending" ? "warning" :
                                                                        req.status === "approved" ? "success" :
                                                                            "destructive"
                                                                }>
                                                                    {req.status}
                                                                </Badge>
                                                            </TableCell>
                                                            <TableCell className="text-right">
                                                                <div className="flex justify-end gap-1.5 items-center">
                                                                    {req.status === "pending" && (
                                                                        <>
                                                                            <Button
                                                                                size="sm"
                                                                                onClick={() => {
                                                                                    setApprovingSignup(req);
                                                                                    setApprovingRole(normalizeRoleValue(req.requested_role || "student"));
                                                                                    setMappingCollegeId(req.college_id || "");
                                                                                    setMappingType("create_new");
                                                                                    setShowApprovalModal(true);
                                                                                }}
                                                                            >
                                                                                Approve &amp; Map
                                                                            </Button>
                                                                            <Button
                                                                                variant="destructive"
                                                                                size="sm"
                                                                                onClick={() => handleRejectSignup(req.id)}
                                                                                isLoading={loadingActions[`reject_signup_${req.id}`]}
                                                                            >
                                                                                Reject
                                                                            </Button>
                                                                        </>
                                                                    )}
                                                                    <Button
                                                                        variant="ghost"
                                                                        size="icon"
                                                                        onClick={() => handleDeleteSignupRequest(req.id)}
                                                                        isLoading={loadingActions[`delete_signup_${req.id}`]}
                                                                        title="Delete Log"
                                                                    >
                                                                        <Trash2 className="h-4 w-4" />
                                                                    </Button>
                                                                </div>
                                                            </TableCell>
                                                        </TableRow>
                                                    );
                                                })
                                            )}
                                        </TableBody>
                                    </TableSurface>
                                )}

                                {/* Approval Mapping Modal */}
                                {showApprovalModal && approvingSignup && (
                                    <Dialog
                                        open={true}
                                        onOpenChange={(next) => {
                                            if (!next) {
                                                setShowApprovalModal(false);
                                                setApprovingSignup(null);
                                            }
                                        }}
                                        ariaLabel="Approve User Request"
                                        overlayClassName="bg-slate-900/60 backdrop-blur-sm p-4"
                                        panelClassName="max-w-md overflow-hidden animate-scaleIn font-sans p-0 space-y-0 max-h-[90vh]"
                                    >
                                        <div className="p-6 border-b border-gray-200 flex justify-between items-center bg-gray-50">
                                            <div>
                                                <h3 className="text-base font-black text-gray-900">Approve & Map User Request</h3>
                                                <p className="text-[10px] text-gray-500 font-semibold mt-0.5">Map credentials for {approvingSignup.email}</p>
                                            </div>
                                            <button
                                                aria-label="Close approve user dialog"
                                                onClick={() => {
                                                    setShowApprovalModal(false);
                                                    setApprovingSignup(null);
                                                }}
                                                className="text-gray-400 hover:text-gray-600 font-bold text-lg cursor-pointer"
                                            >
                                                ✕
                                            </button>
                                        </div>

                                        <form onSubmit={handleApproveSignupSubmit} className="p-6 space-y-4 text-xs font-semibold">
                                            {/* User Details */}
                                            <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 space-y-1">
                                                <div className="flex justify-between">
                                                    <span className="text-gray-500">Name:</span>
                                                    <span className="text-gray-900 font-bold">{approvingSignup.name}</span>
                                                </div>
                                                <div className="flex justify-between">
                                                    <span className="text-gray-500">Access Requested:</span>
                                                    <span className="text-indigo-600 font-bold uppercase">Pending Decision</span>
                                                </div>
                                            </div>

                                            {/* Role selection - Admin Decides! */}
                                            <div className="space-y-1">
                                                <label className="text-[10px] text-gray-400 uppercase tracking-wider block font-bold">Assign Target Role</label>
                                                <Select
                                                    aria-label="Assign Target Role"
                                                    required
                                                    value={approvingRole}
                                                    onChange={(e) => {
                                                        setApprovingRole(e.target.value);
                                                        setSelectedReferenceId("");
                                                        setMappingCollegeId("");
                                                        setMappingDept("");
                                                        setMappingClassGroup("");
                                                    }}
                                                    className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2 font-bold focus:outline-none focus:ring-1 focus:ring-indigo-600 cursor-pointer"
                                                >
                                                    <option value="student">Student</option>
                                                    <option value="mentor">Mentor / Faculty</option>
                                                    <option value="cm">Campus Manager (HOD)</option>
                                                    <option value="sme">Subject Matter Expert (SME)</option>
                                                </Select>
                                            </div>

                                            {/* Mapping Type Selection */}
                                            <div className="space-y-1">
                                                <label className="text-[10px] text-gray-400 uppercase tracking-wider block font-bold">Mapping Action</label>
                                                <div className="grid grid-cols-2 gap-2">
                                                    <button
                                                        type="button"
                                                        onClick={() => setMappingType("create_new")}
                                                        className={`py-2 px-3 rounded-xl border font-bold text-center cursor-pointer transition-all ${mappingType === "create_new"
                                                            ? "bg-indigo-50 border-indigo-600 text-indigo-600 animate-fadeIn"
                                                            : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50"
                                                            }`}
                                                    >
                                                        Create New Profile
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => setMappingType("link_existing")}
                                                        className={`py-2 px-3 rounded-xl border font-bold text-center cursor-pointer transition-all ${mappingType === "link_existing"
                                                            ? "bg-indigo-50 border-indigo-600 text-indigo-600 animate-fadeIn"
                                                            : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50"
                                                            }`}
                                                    >
                                                        Link to Existing
                                                    </button>
                                                </div>
                                            </div>

                                            {/* Conditional Fields based on selection */}
                                            {mappingType === "link_existing" ? (
                                                // Link Existing Dropdown
                                                <div className="space-y-1">
                                                    <label className="text-[10px] text-gray-400 uppercase tracking-wider block font-bold">Select Profile to Link</label>
                                                    <Select
                                                        aria-label="Select Profile to Link"
                                                        required
                                                        value={selectedReferenceId}
                                                        onChange={(e) => setSelectedReferenceId(e.target.value)}
                                                        className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2 font-bold focus:outline-none focus:ring-1 focus:ring-indigo-600 cursor-pointer"
                                                    >
                                                        <option value="">-- Choose Profile --</option>
                                                        {approvingRole === "mentor" &&
                                                            mentors
                                                                .filter((m: any) => !usersList.some((u: any) => u.reference_id === m.id))
                                                                .map((m: any) => (
                                                                    <option key={m.id} value={m.id}>
                                                                        {m.name} ({m.email}) - {m.id}
                                                                    </option>
                                                                ))}
                                                        {approvingRole === "student" &&
                                                            students
                                                                .filter((s: any) => !usersList.some((u: any) => u.reference_id === s.id))
                                                                .map((s: any) => (
                                                                    <option key={s.id} value={s.id}>
                                                                        {s.name} ({s.email}) - {s.id}
                                                                    </option>
                                                                ))}
                                                        {approvingRole === "cm" &&
                                                            camList
                                                                .filter((c: any) => !usersList.some((u: any) => u.reference_id === c.id))
                                                                .map((c: any) => (
                                                                    <option key={c.id} value={c.id}>
                                                                        {c.name} ({c.email}) - {c.id}
                                                                    </option>
                                                                ))}
                                                        {approvingRole === "sme" &&
                                                            smes
                                                                .filter((s: any) => !usersList.some((u: any) => u.reference_id === s.id))
                                                                .map((s: any) => (
                                                                    <option key={s.id} value={s.id}>
                                                                        {s.name} ({s.email}) - {s.id}
                                                                    </option>
                                                                ))}
                                                    </Select>
                                                </div>
                                            ) : (
                                                // Create New Profile Fields
                                                <div className="space-y-3">
                                                    {/* College selection (except for SME) */}
                                                    {approvingRole !== "sme" && (
                                                        <div className="space-y-1">
                                                            <label className="text-[10px] text-gray-400 uppercase tracking-wider block font-bold">Assign College / Campus</label>
                                                            <Select
                                                                aria-label="Assign College / Campus"
                                                                required
                                                                value={mappingCollegeId}
                                                                onChange={(e) => setMappingCollegeId(e.target.value)}
                                                                className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2 font-bold focus:outline-none focus:ring-1 focus:ring-indigo-600 cursor-pointer"
                                                            >
                                                                <option value="">-- Choose Campus --</option>
                                                                {colleges.map((col) => (
                                                                    <option key={col.id} value={col.id}>
                                                                        {col.name}
                                                                    </option>
                                                                ))}
                                                            </Select>
                                                        </div>
                                                    )}

                                                    {/* Group selection (for mentor/student) */}
                                                    {(approvingRole === "mentor" || approvingRole === "student") && (
                                                        <div className="space-y-1">
                                                            <label className="text-[10px] text-gray-400 uppercase tracking-wider block font-bold">Group</label>
                                                            <Select
                                                                aria-label="Group"
                                                                required
                                                                value={mappingDept}
                                                                onChange={(e) => setMappingDept(e.target.value)}
                                                                className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2 font-bold focus:outline-none focus:ring-1 focus:ring-indigo-600 cursor-pointer"
                                                            >
                                                                <option value="">-- Choose Group --</option>
                                                                {subjectGroups.map((sg) => (
                                                                    <option key={sg.id} value={sg.name}>
                                                                        {sg.name}
                                                                    </option>
                                                                ))}
                                                            </Select>
                                                        </div>
                                                    )}

                                                    {/* Class Group selection (for student) */}
                                                    {approvingRole === "student" && (
                                                        <div className="space-y-1">
                                                            <label className="text-[10px] text-gray-400 uppercase tracking-wider block font-bold">Class Cohort / Group</label>
                                                            <Input
                                                                aria-label="Class Cohort / Group"
                                                                type="text"
                                                                required
                                                                placeholder="e.g. CS-A, BCOM-B"
                                                                value={mappingClassGroup}
                                                                onChange={(e) => setMappingClassGroup(e.target.value)}
                                                                className="w-full bg-white border border-gray-200 rounded-xl px-3.5 py-2 font-bold focus:outline-none focus:ring-1 focus:ring-indigo-600"
                                                            />
                                                        </div>
                                                    )}
                                                </div>
                                            )}

                                            {/* Footer Buttons */}
                                            <div className="flex gap-3 pt-3 border-t border-gray-200">
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        setShowApprovalModal(false);
                                                        setApprovingSignup(null);
                                                    }}
                                                    className="flex-1 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-xl text-center cursor-pointer transition-colors"
                                                >
                                                    Cancel
                                                </button>
                                                <LoadingButton
                                                    type="submit"
                                                    isLoading={loadingActions['approve_signup']}
                                                    loadingText="Approving..."
                                                    variant="primary"
                                                    className="flex-1 py-2 text-center"
                                                >
                                                    Approve & Save
                                                </LoadingButton>
                                            </div>
                                        </form>
                                    </Dialog>
                                )}
                            </div>
                        );
                    })()}

                    {/* ── Tab: Subject Matter Experts (SMEs) ── */}
                    {activeTab === "smes" && (
                        <div className="space-y-6 animate-fadeIn font-sans text-xs">
                            <PageHeader
                                icon={BookOpen}
                                title="Subject Matter Experts"
                                subtitle="Specialists who review curriculum and mentor subject groups."
                                actions={
                                    <Button variant="ghost"
                                        onClick={() => handleOpenSmeModal()}
                                        className="h-auto btn-gradient px-4 py-2 rounded-xl font-bold flex items-center gap-1.5 transition-all shadow-sm cursor-pointer text-white"
                                    >
                                        <Plus className="h-4 w-4" />
                                        Add SME
                                    </Button>
                                }
                            />

                            <TableSurface
                                className="border-gray-200"
                                footer={
                                    <Pagination
                                        currentPage={smePagination.page}
                                        totalItems={(smes || []).length}
                                        pageSize={smePagination.pageSize}
                                        onPageChange={smePagination.setPage}
                                        onPageSizeChange={smePagination.setPageSize}
                                        pageSizeOptions={smePagination.pageSizeOptions}
                                    />
                                }
                            >
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>ID</TableHead>
                                        <TableHead>Name</TableHead>
                                        <TableHead>Email</TableHead>
                                        <TableHead>Subject Specialization / Group</TableHead>
                                        <TableHead className="text-right">Actions</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {smePagination.pageItems.length > 0 ? (
                                        smePagination.pageItems.map((sme) => (
                                            <TableRow key={sme.id}>
                                                <TableCell className="font-mono text-gray-500">{sme.id}</TableCell>
                                                <TableCell className="font-bold text-gray-900">{sme.name}</TableCell>
                                                <TableCell className="font-mono text-gray-600">{sme.email}</TableCell>
                                                <TableCell>
                                                    <Badge variant="secondary">{sme.subject || "Unassigned"}</Badge>
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    <div className="flex justify-end gap-1.5">
                                                        <Button variant="outline" size="icon" onClick={() => handleOpenSmeModal(sme)} title="Edit SME">
                                                            <Edit className="h-4 w-4" />
                                                        </Button>
                                                        <Button variant="destructive" size="icon" onClick={() => handleDeleteSme(sme.id)} isLoading={loadingActions[`sme_${sme.id}`]} title="Delete SME">
                                                            <Trash2 className="h-4 w-4" />
                                                        </Button>
                                                    </div>
                                                </TableCell>
                                            </TableRow>
                                        ))
                                    ) : (
                                        <TableRow>
                                            <TableCell colSpan={5} className="h-32 text-center">
                                                <div className="flex flex-col items-center gap-2 text-gray-400">
                                                    <BookOpen className="h-8 w-8" />
                                                    <p className="text-sm font-semibold">No Subject Matter Experts registered in the database yet. Click "Add SME" to get started.</p>
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </TableSurface>
                        </div>
                    )}

                    {/* ── Tab: Sessions History ── */}
                    {activeTab === "sessions" && (
                        <div className="space-y-6 animate-fadeIn font-sans text-xs">
                            <PageHeader
                                icon={History}
                                title="User Login Sessions"
                                subtitle="Centralized audit of every sign-in, device and IP address."
                            />

                            {isSessionsLoading && loginHistory.length === 0 ? (
                                <div className="flex flex-col items-center gap-2 py-16 text-gray-400">
                                    <Loader2 className="h-7 w-7 animate-spin text-indigo-500" />
                                    <p className="text-sm font-semibold">Loading login sessions…</p>
                                </div>
                            ) : loginHistory.length === 0 ? (
                                <div className="text-center py-16 border border-gray-200 rounded-xl bg-gray-50/50">
                                    <History className="h-10 w-10 text-gray-300 mx-auto mb-2" />
                                    <p className="text-sm text-gray-500 font-semibold">No login sessions recorded.</p>
                                </div>
                            ) : (
                                <TableSurface
                                    className="border-gray-200"
                                    footer={
                                        <Pagination
                                            currentPage={sessionPagination.page}
                                            totalItems={loginHistory.length}
                                            pageSize={sessionPagination.pageSize}
                                            onPageChange={sessionPagination.setPage}
                                            onPageSizeChange={sessionPagination.setPageSize}
                                            pageSizeOptions={sessionPagination.pageSizeOptions}
                                            ariaLabel="Login sessions pagination"
                                        />
                                    }
                                >
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>User ID / Email</TableHead>
                                            <TableHead>Login Time</TableHead>
                                            <TableHead>IP Address</TableHead>
                                            <TableHead>Device / Client</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {sessionPagination.pageItems.map((hist) => {
                                            const matchedUser = usersList.find(u => u.id === hist.user_id);
                                            return (
                                                <TableRow key={hist.id}>
                                                    <TableCell>
                                                        <div className="font-bold text-gray-900 font-mono">{matchedUser ? matchedUser.email : hist.user_id}</div>
                                                        {matchedUser && (
                                                            <Badge variant="secondary" className="mt-0.5">
                                                                {formatRoleLabel(matchedUser.role)}
                                                            </Badge>
                                                        )}
                                                    </TableCell>
                                                    <TableCell className="font-semibold text-indigo-600">{formatDate(hist.login_time)}</TableCell>
                                                    <TableCell className="font-mono text-gray-500">{hist.ip || "127.0.0.1"}</TableCell>
                                                    <TableCell className="text-gray-500">{hist.device || "Browser"}</TableCell>
                                                </TableRow>
                                            );
                                        })}
                                    </TableBody>
                                </TableSurface>
                            )}
                        </div>
                    )}

                    {/* ── Tab: System Settings & Mail Controls ── */}
                    {activeTab === "settings" && (
                        <div className="space-y-6 animate-fadeIn font-sans text-xs">
                            <PageHeader
                                icon={Sliders}
                                title="System Settings & Global Switches"
                                subtitle="Manage global system switches, transactional mail dispatch, and infrastructure controls."
                            />

                            {/* Grid Layout for Settings Cards */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

                                {/* Master Email Control Card */}
                                <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-card flex flex-col justify-between space-y-5">
                                    <div>
                                        <div className="flex items-start justify-between gap-4 mb-3">
                                            <div className="flex items-center gap-3">
                                                <div className={`h-11 w-11 rounded-2xl flex items-center justify-center shrink-0 ${systemSettings.mailing_enabled ? "bg-emerald-50 text-emerald-600 border border-emerald-200" : "bg-rose-50 text-rose-600 border border-rose-200"}`}>
                                                    <Mail className="h-6 w-6" />
                                                </div>
                                                <div>
                                                    <h3 className="text-sm font-extrabold text-gray-900">Global Email &amp; Mailing System</h3>
                                                    <span className="text-[10px] text-gray-400 font-medium block">Controls Brevo REST API, SMTP Relay &amp; GAS Webhooks</span>
                                                </div>
                                            </div>

                                            {/* Live Status Badge */}
                                            <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black border ${systemSettings.mailing_enabled ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-rose-50 text-rose-700 border-rose-200"}`}>
                                                <span className={`h-2 w-2 rounded-full ${systemSettings.mailing_enabled ? "bg-emerald-500 animate-pulse" : "bg-rose-500"}`} />
                                                {systemSettings.mailing_enabled ? "MAILING ACTIVE" : "MAILING OFF"}
                                            </span>
                                        </div>

                                        <p className="text-xs text-gray-600 font-medium leading-relaxed mt-2 bg-gray-50/80 p-3.5 rounded-xl border border-gray-200">
                                            When turned <strong className="text-gray-900 font-bold">OFF</strong>, all outgoing transactional emails (leave alerts, handover requests, demo swap proposals, interview notifications) are gracefully bypassed. <span className="text-indigo-600 font-semibold">Web application workflows will continue functioning normally without errors.</span>
                                        </p>
                                    </div>

                                    {/* Action Row */}
                                    <div className="pt-4 border-t border-gray-200 flex flex-wrap items-center justify-between gap-3">
                                        <div className="flex items-center gap-3">
                                            <button
                                                type="button"
                                                onClick={() => handleToggleMailing(!systemSettings.mailing_enabled)}
                                                disabled={isUpdatingSettings}
                                                className={`px-5 py-2.5 rounded-xl text-xs font-black transition-all flex items-center gap-2 cursor-pointer shadow-sm border ${systemSettings.mailing_enabled
                                                    ? "bg-rose-600 hover:bg-rose-700 text-white border-rose-700"
                                                    : "bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-700"
                                                    } disabled:opacity-50`}
                                            >
                                                {isUpdatingSettings ? (
                                                    <Loader2 className="h-4 w-4 animate-spin" />
                                                ) : (
                                                    <Power className="h-4 w-4" />
                                                )}
                                                {systemSettings.mailing_enabled ? "Turn Mailing OFF" : "Turn Mailing ON"}
                                            </button>
                                        </div>

                                        <span className="text-[10px] text-gray-400 font-semibold">
                                            Status: {systemSettings.mailing_enabled ? "Enabled" : "Paused"}
                                        </span>
                                    </div>
                                </div>

                                {/* Email Service Diagnostic Card */}
                                <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-card flex flex-col justify-between space-y-4">
                                    <div>
                                        <div className="flex items-center gap-3 mb-3">
                                            <div className="h-10 w-10 rounded-xl bg-indigo-50 border border-indigo-100 text-indigo-600 flex items-center justify-center shrink-0">
                                                <CheckCircle2 className="h-5 w-5" />
                                            </div>
                                            <div>
                                                <h3 className="text-sm font-extrabold text-gray-900">Email Infrastructure Status</h3>
                                                <span className="text-[10px] text-gray-400 font-medium block">Configured Relay &amp; Webhook Providers</span>
                                            </div>
                                        </div>

                                        <div className="space-y-2.5 mt-4">
                                            <div className="flex items-center justify-between p-2.5 bg-gray-50 rounded-xl border border-gray-200">
                                                <div className="flex items-center gap-2">
                                                    <span className="h-2 w-2 rounded-full bg-emerald-500" />
                                                    <span className="text-xs font-bold text-gray-800">Primary Provider</span>
                                                </div>
                                                <span className="text-[11px] font-mono font-extrabold text-indigo-600">Brevo REST API v3</span>
                                            </div>

                                            <div className="flex items-center justify-between p-2.5 bg-gray-50 rounded-xl border border-gray-200">
                                                <div className="flex items-center gap-2">
                                                    <span className="h-2 w-2 rounded-full bg-emerald-500" />
                                                    <span className="text-xs font-bold text-gray-800">Secondary Relay</span>
                                                </div>
                                                <span className="text-[11px] font-mono font-extrabold text-indigo-600">Brevo SMTP (Port 587)</span>
                                            </div>

                                            <div className="flex items-center justify-between p-2.5 bg-gray-50 rounded-xl border border-gray-200">
                                                <div className="flex items-center gap-2">
                                                    <span className="h-2 w-2 rounded-full bg-amber-500" />
                                                    <span className="text-xs font-bold text-gray-800">Webhook Fallback</span>
                                                </div>
                                                <span className="text-[11px] font-mono font-extrabold text-slate-600">Google Apps Script</span>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="p-3 bg-amber-50/70 border border-amber-200/80 rounded-xl flex items-center gap-2 text-amber-800 text-[10px] font-medium">
                                        <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
                                        <span>Audit logs automatically record whenever mailing preferences are toggled by an administrator.</span>
                                    </div>
                                </div>

                                {/* Attendance Marking Lock Policy Card */}
                                <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-card flex flex-col justify-between space-y-5">
                                    <div>
                                        <div className="flex items-start justify-between gap-4 mb-3">
                                            <div className="flex items-center gap-3">
                                                <div className={`h-11 w-11 rounded-2xl flex items-center justify-center shrink-0 ${systemSettings.attendance_lock_enabled !== false ? "bg-amber-50 text-amber-600 border border-amber-200" : "bg-emerald-50 text-emerald-600 border border-emerald-200"}`}>
                                                    {systemSettings.attendance_lock_enabled !== false ? (
                                                        <Lock className="h-6 w-6" />
                                                    ) : (
                                                        <Unlock className="h-6 w-6" />
                                                    )}
                                                </div>
                                                <div>
                                                    <h3 className="text-sm font-extrabold text-gray-900">Attendance Marking Lock Policy</h3>
                                                    <span className="text-[10px] text-gray-400 font-medium block">Controls strict period expiration &amp; retroactive marking lockout</span>
                                                </div>
                                            </div>

                                            {/* Live Status Badge */}
                                            <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black border ${systemSettings.attendance_lock_enabled !== false ? "bg-amber-50 text-amber-700 border-amber-200" : "bg-emerald-50 text-emerald-700 border-emerald-200"}`}>
                                                <span className={`h-2 w-2 rounded-full ${systemSettings.attendance_lock_enabled !== false ? "bg-amber-500 animate-pulse" : "bg-emerald-500"}`} />
                                                {systemSettings.attendance_lock_enabled !== false ? "LOCK ACTIVE (STRICT)" : "LOCK DISABLED (FLEXIBLE)"}
                                            </span>
                                        </div>

                                        <p className="text-xs text-gray-600 font-medium leading-relaxed mt-2 bg-gray-50/80 p-3.5 rounded-xl border border-gray-200">
                                            {systemSettings.attendance_lock_enabled !== false ? (
                                                <>
                                                    When <strong className="text-amber-700 font-bold">ENABLED (Strict Mode)</strong>, direct attendance marking is locked as soon as a period&apos;s scheduled end time passes or for prior calendar dates. Faculty must request <span className="text-indigo-600 font-semibold">Campus Manager (CM) approval</span> with a reason to unlock the session.
                                                </>
                                            ) : (
                                                <>
                                                    When <strong className="text-emerald-700 font-bold">DISABLED (Flexible Mode)</strong>, the period time window and past-date lockouts are completely bypassed. <span className="text-emerald-700 font-semibold">Faculty / Mentors can directly mark, edit, and record attendance for past periods and dates without CM approval.</span>
                                                </>
                                            )}
                                        </p>
                                    </div>

                                    {/* Action Row */}
                                    <div className="pt-4 border-t border-gray-200 flex flex-wrap items-center justify-between gap-3">
                                        <div className="flex items-center gap-3">
                                            <button
                                                type="button"
                                                onClick={() => handleToggleAttendanceLock(systemSettings.attendance_lock_enabled === false)}
                                                disabled={isUpdatingSettings}
                                                className={`px-5 py-2.5 rounded-xl text-xs font-black transition-all flex items-center gap-2 cursor-pointer shadow-sm border ${systemSettings.attendance_lock_enabled !== false
                                                    ? "bg-rose-600 hover:bg-rose-700 text-white border-rose-700"
                                                    : "bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-700"
                                                    } disabled:opacity-50`}
                                            >
                                                {isUpdatingSettings ? (
                                                    <Loader2 className="h-4 w-4 animate-spin" />
                                                ) : systemSettings.attendance_lock_enabled !== false ? (
                                                    <Unlock className="h-4 w-4" />
                                                ) : (
                                                    <Lock className="h-4 w-4" />
                                                )}
                                                {systemSettings.attendance_lock_enabled !== false ? "Disable Attendance Lock" : "Enable Attendance Lock"}
                                            </button>
                                        </div>

                                        <span className="text-[10px] text-gray-400 font-semibold">
                                            Enforcement: {systemSettings.attendance_lock_enabled !== false ? "Strict Window Lock" : "Flexible / Unlocked"}
                                        </span>
                                    </div>
                                </div>

                            </div>

                            {/* ── Clear Attendance by Date Range ── */}
                            <div className="bg-white border border-rose-200 rounded-2xl p-6 shadow-card space-y-5">
                                <div className="flex items-start gap-3 pb-4 border-b border-rose-100">
                                    <div className="h-10 w-10 rounded-xl bg-rose-50 border border-rose-200 text-rose-600 flex items-center justify-center shrink-0">
                                        <ShieldAlert className="h-5 w-5" />
                                    </div>
                                    <div>
                                        <h3 className="text-sm font-extrabold text-gray-900">Clear Attendance by Date Range</h3>
                                        <p className="text-[11px] text-gray-500 font-medium mt-0.5">Permanently delete all student attendance records within a chosen date range. Optionally scope to a specific campus, department, or batch.</p>
                                    </div>
                                </div>

                                {/* Filters Row */}
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                                    <div className="space-y-1">
                                        <label className="text-[10px] font-extrabold uppercase tracking-wider text-gray-500 block">From Date</label>
                                        <Input
                                            aria-label="From Date"
                                            type="date"
                                            value={clearAttStartDate}
                                            onChange={e => { setClearAttStartDate(e.target.value); setClearAttPreviewCount(null); }}
                                            className="w-full px-3 py-2 border border-gray-200 rounded-xl bg-white text-xs font-semibold text-gray-800 focus:outline-none focus:border-rose-400 focus:ring-1 focus:ring-rose-200"
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-[10px] font-extrabold uppercase tracking-wider text-gray-500 block">To Date</label>
                                        <Input
                                            aria-label="To Date"
                                            type="date"
                                            value={clearAttEndDate}
                                            min={clearAttStartDate}
                                            onChange={e => { setClearAttEndDate(e.target.value); setClearAttPreviewCount(null); }}
                                            className="w-full px-3 py-2 border border-gray-200 rounded-xl bg-white text-xs font-semibold text-gray-800 focus:outline-none focus:border-rose-400 focus:ring-1 focus:ring-rose-200"
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-[10px] font-extrabold uppercase tracking-wider text-gray-500 block">Campus</label>
                                        <Select
                                            aria-label="Campus"
                                            value={clearAttCollegeId}
                                            onChange={e => { setClearAttCollegeId(e.target.value); setClearAttDept("all"); setClearAttClassGroup("all"); setClearAttPreviewCount(null); }}
                                            className="w-full px-3 py-2 border border-gray-200 rounded-xl bg-white text-xs font-semibold text-gray-800 focus:outline-none focus:border-rose-400 cursor-pointer"
                                        >
                                            <option value="all">All Campuses</option>
                                            {colleges.map(c => (
                                                <option key={c.id} value={c.id}>{c.name}</option>
                                            ))}
                                        </Select>
                                    </div>
                                    {clearAttCollegeId !== "all" && (() => {
                                        const campusStudents = students.filter((s: any) => s.college_id === clearAttCollegeId);
                                        const depts = Array.from(new Set(campusStudents.map((s: any) => s.department).filter(Boolean))) as string[];
                                        const batches = (clearAttDept !== "all"
                                            ? Array.from(new Set(campusStudents.filter((s: any) => s.department === clearAttDept).map((s: any) => s.classGroup).filter(Boolean)))
                                            : Array.from(new Set(campusStudents.map((s: any) => s.classGroup).filter(Boolean)))) as string[];
                                        return (
                                            <>
                                                <div className="space-y-1">
                                                    <label className="text-[10px] font-extrabold uppercase tracking-wider text-gray-500 block">Department</label>
                                                    <Select
                                                        aria-label="Department"
                                                        value={clearAttDept}
                                                        onChange={e => { setClearAttDept(e.target.value); setClearAttClassGroup("all"); setClearAttPreviewCount(null); }}
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
                                                        value={clearAttClassGroup}
                                                        onChange={e => { setClearAttClassGroup(e.target.value); setClearAttPreviewCount(null); }}
                                                        className="w-full px-3 py-2 border border-gray-200 rounded-xl bg-white text-xs font-semibold text-gray-800 focus:outline-none focus:border-rose-400 cursor-pointer"
                                                    >
                                                        <option value="all">All Batches</option>
                                                        {batches.map(b => <option key={b} value={b}>{b}</option>)}
                                                    </Select>
                                                </div>
                                            </>
                                        );
                                    })()}
                                </div>

                                {/* Preview + Delete Row */}
                                <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-rose-100">
                                    <div className="flex items-center gap-3 flex-wrap">
                                        <Button variant="ghost"
                                            type="button"
                                            onClick={fetchClearAttPreview}
                                            disabled={!clearAttStartDate || !clearAttEndDate || isFetchingPreview || isClearingAtt}
                                            className="h-auto px-4 py-2 rounded-xl text-xs font-bold bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 transition-colors flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
                                        >
                                            {isFetchingPreview ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CalendarDays className="h-3.5 w-3.5" />}
                                            Preview Count
                                        </Button>
                                        {clearAttPreviewCount !== null && (
                                            <span className="text-xs font-bold text-rose-700 bg-rose-50 border border-rose-200 px-3 py-1.5 rounded-xl">
                                                {clearAttPreviewCount} record{clearAttPreviewCount !== 1 ? "s" : ""} will be deleted
                                            </span>
                                        )}
                                    </div>
                                    <Button variant="ghost"
                                        type="button"
                                        onClick={handleClearAttendanceByRange}
                                        disabled={!clearAttStartDate || !clearAttEndDate || isClearingAtt}
                                        className="h-auto px-5 py-2.5 rounded-xl text-xs font-black bg-rose-600 hover:bg-rose-700 text-white shadow-sm transition-colors flex items-center gap-2 disabled:opacity-50 cursor-pointer"
                                    >
                                        {isClearingAtt ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                                        Clear Attendance
                                    </Button>
                                </div>

                                <div className="p-3 bg-amber-50/70 border border-amber-200/80 rounded-xl flex items-start gap-2 text-amber-800 text-[10px] font-medium">
                                    <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 mt-0.5" />
                                    <span>This permanently removes attendance records and cannot be undone. Use <strong>Preview Count</strong> first to see how many records will be affected before confirming the deletion.</span>
                                </div>
                            </div>

                        </div>
                    )}
                </div>
                {/* ── Campus Modal ── */}
                {showCampusModal && (
                    <Dialog
                        open={true}
                        onOpenChange={(next) => { if (!next) { setShowCampusModal(false); setCampusSuccessCreatedId(null); } }}
                        ariaLabel="Campus"
                        overlayClassName="bg-gray-900/50 backdrop-blur-sm p-4 overflow-y-auto"
                        panelClassName={`overflow-hidden animate-slideUp flex flex-col my-auto max-h-[90vh] transition-all duration-300 ${campusWizardStep === 3 ? "max-w-5xl" : "max-w-2xl"} p-0 space-y-0`}
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
                                        <span className="h-1.5 w-1.5 rounded-full bg-pink-500 animate-pulse" />
                                        Draft Auto-Saved ({draftLastSaved})
                                    </span>
                                )}
                            </div>
                            <div className="flex items-center gap-2">
                                {hasRestoredDraft && !editingCampus && !campusSuccessCreatedId && (
                                    <Button variant="ghost"
                                        type="button"
                                        onClick={() => {
                                            if (typeof window !== "undefined") localStorage.removeItem("campus_wizard_draft");
                                            setDraftLastSaved(null);
                                            setHasRestoredDraft(false);
                                            setIsCampusCodeCustomized(false);
                                            setCampusWizardStep(1);
                                            setWizardCourses([]);
                                            setCampusForm({
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
                                        }}
                                        className="h-auto text-[9.5px] font-extrabold text-slate-500 hover:text-rose-600 bg-slate-100 hover:bg-rose-50 px-2.5 py-1 rounded-xl border border-slate-200 cursor-pointer transition-colors"
                                    >
                                        Clear Draft
                                    </Button>
                                )}
                                <Button variant="ghost" size="icon"
                                    type="button"
                                    aria-label="Close campus dialog"
                                    onClick={() => { setShowCampusModal(false); setCampusSuccessCreatedId(null); }}
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
                                    <div className="h-16 w-16 rounded-full bg-emerald-100 flex items-center justify-center mx-auto">
                                        <span className="text-3xl"></span>
                                    </div>
                                    <h4 className="font-black text-gray-900 text-base">Campus Created Successfully!</h4>
                                    <p className="text-xs text-gray-500 font-semibold">What would you like to do next?</p>
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setShowCampusModal(false);
                                            setCampusSuccessCreatedId(null);
                                            setActiveTab("campuses");
                                        }}
                                        className="flex flex-col items-center gap-1.5 p-4 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-xl transition-all cursor-pointer group"
                                    >
                                        <Building2 className="h-5 w-5 text-indigo-600 group-hover:scale-110 transition-transform" />
                                        <span className="text-xs font-extrabold text-indigo-700">Open Campus</span>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setShowCampusModal(false);
                                            setCampusSuccessCreatedId(null);
                                            setShowCamModal(true);
                                            setCamForm({ id: "", name: "", email: "", college_id: campusSuccessCreatedId, kam_id: "" });
                                            setEditingCam(false);
                                        }}
                                        className="flex flex-col items-center gap-1.5 p-4 bg-violet-50 hover:bg-violet-100 border border-violet-200 rounded-xl transition-all cursor-pointer group"
                                    >
                                        <Users className="h-5 w-5 text-violet-600 group-hover:scale-110 transition-transform" />
                                        <span className="text-xs font-extrabold text-violet-700">Add Campus Manager</span>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setShowCampusModal(false);
                                            setCampusSuccessCreatedId(null);
                                            setShowSubjectModal(true);
                                        }}
                                        className="flex flex-col items-center gap-1.5 p-4 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-xl transition-all cursor-pointer group"
                                    >
                                        <BookOpen className="h-5 w-5 text-amber-600 group-hover:scale-110 transition-transform" />
                                        <span className="text-xs font-extrabold text-amber-700">Add Subjects</span>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setShowCampusModal(false);
                                            setCampusSuccessCreatedId(null);
                                            setActiveTab("schedules");
                                        }}
                                        className="flex flex-col items-center gap-1.5 p-4 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-xl transition-all cursor-pointer group"
                                    >
                                        <CalendarDays className="h-5 w-5 text-emerald-600 group-hover:scale-110 transition-transform" />
                                        <span className="text-xs font-extrabold text-emerald-700">Generate Timetable</span>
                                    </button>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => { setShowCampusModal(false); setCampusSuccessCreatedId(null); }}
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
                                                        className={`h-7 w-7 rounded-full flex items-center justify-center text-[11px] font-black transition-all ${isDone ? 'text-white' : isActive ? 'text-white' : 'text-gray-400'}`}
                                                        style={{
                                                            background: isDone ? '#10b981' : isActive ? 'linear-gradient(135deg,#6366f1,#4f46e5)' : '#e5e7eb',
                                                            boxShadow: isActive ? '0 0 0 4px rgba(99,102,241,0.18), 0 2px 8px rgba(99,102,241,0.35)' : 'none'
                                                        }}
                                                    >
                                                        {isDone ? "Yes" : s.step}
                                                    </div>
                                                    <span
                                                        className={`text-[9.5px] uppercase tracking-wider font-extrabold whitespace-nowrap transition-colors ${isActive ? '' : isDone ? 'text-emerald-600' : 'text-gray-400'}`}
                                                        style={isActive ? { color: '#4f46e5' } : {}}
                                                    >
                                                        {s.label}
                                                    </span>
                                                </div>
                                                {idx < 3 && (
                                                    <div
                                                        className="flex-1 h-[3px] mx-2 rounded-full transition-all"
                                                        style={{
                                                            background: isDone
                                                                ? 'linear-gradient(to right,#10b981,#34d399)'
                                                                : isActive
                                                                    ? 'linear-gradient(to right,#6366f1 30%,#e5e7eb)'
                                                                    : '#e5e7eb'
                                                        }}
                                                    />
                                                )}
                                            </React.Fragment>
                                        )
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
                                                <h4 className="text-xs font-black text-gray-800 uppercase tracking-wider">Campus Information</h4>
                                                <p className="text-[9.5px] text-gray-400 font-semibold mt-0.5">Only campus-level details here. Courses and timings come next.</p>
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
                                                        onChange={(e) => {
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
                                                            <Button variant="link" size="sm"
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
                                                        onChange={(e) => {
                                                            setIsCampusCodeCustomized(true);
                                                            setCampusForm(prev => ({ ...prev, code: e.target.value.toUpperCase() }));
                                                        }}
                                                        className={`w-full border border-gray-200 rounded-xl px-3.5 py-2.5 font-bold tracking-wider uppercase focus:outline-none focus:ring-1 focus:ring-indigo-600 ${editingCampus ? "bg-gray-100 text-gray-400 cursor-not-allowed" : "bg-gray-50 text-gray-900"
                                                            }`}
                                                    />
                                                </div>

                                                <div className="space-y-1">
                                                    <label className="text-[10px] text-gray-400 uppercase tracking-wider block font-bold">Academic Year *</label>
                                                    <Select
                                                        aria-label="Academic Year"
                                                        required
                                                        value={campusForm.academic_year}
                                                        onChange={(e) => setCampusForm({ ...campusForm, academic_year: e.target.value })}
                                                        className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 font-bold focus:outline-none focus:ring-1 focus:ring-indigo-600 cursor-pointer"
                                                    >
                                                        {getAcademicYearOptions().map(yr => (
                                                            <option key={yr} value={yr}>{yr}</option>
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
                                                        onChange={(e) => setCampusForm({ ...campusForm, address: e.target.value })}
                                                        className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3.5 py-2.5 font-bold focus:outline-none focus:ring-1 focus:ring-indigo-600"
                                                    />
                                                </div>

                                                <div className="space-y-1">
                                                    <label className="text-[10px] text-gray-400 uppercase tracking-wider block font-bold">KAM (Key Account Manager) *</label>
                                                    <Select
                                                        aria-label="KAM (Key Account Manager)"
                                                        required
                                                        value={campusForm.kam_id}
                                                        onChange={(e) => setCampusForm({ ...campusForm, kam_id: e.target.value })}
                                                        className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 font-bold focus:outline-none focus:ring-1 focus:ring-indigo-600 cursor-pointer"
                                                    >
                                                        <option value="">Select KAM</option>
                                                        {kamList.map(kam => (
                                                            <option key={kam.id} value={kam.id}>{kam.name}</option>
                                                        ))}
                                                    </Select>
                                                </div>

                                                <div className="space-y-1">
                                                    <label className="text-[10px] text-gray-400 uppercase tracking-wider block font-bold">Campus Manager <span className="text-gray-400 font-semibold normal-case">(Optional)</span></label>
                                                    <Select
                                                        aria-label="Campus Manager (Optional)"
                                                        value={campusForm.manager}
                                                        onChange={(e) => setCampusForm({ ...campusForm, manager: e.target.value })}
                                                        className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 font-bold focus:outline-none focus:ring-1 focus:ring-indigo-600 cursor-pointer"
                                                    >
                                                        <option value="">Select CM (Optional)</option>
                                                        {camList.map(cam => (
                                                            <option key={cam.id} value={cam.id}>{cam.name}</option>
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
                                                        className={`flex-1 flex items-center gap-2 p-3 rounded-xl border-2 transition-all cursor-pointer ${campusForm.has_shifts === 0
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
                                                        className={`flex-1 flex items-center gap-2 p-3 rounded-xl border-2 transition-all cursor-pointer ${campusForm.has_shifts === 1
                                                            ? "border-indigo-500 bg-indigo-50 text-indigo-800"
                                                            : "border-gray-200 bg-white text-gray-500 hover:border-gray-300"
                                                            }`}
                                                    >
                                                        <div className={`h-4 w-4 rounded-full border-2 flex items-center justify-center ${campusForm.has_shifts === 1 ? "border-indigo-500" : "border-gray-300"}`}>
                                                            {campusForm.has_shifts === 1 && <div className="h-2 w-2 rounded-full bg-indigo-500" />}
                                                        </div>
                                                        <div className="text-left">
                                                            <div className="font-extrabold text-[11px]">Multiple Shifts</div>
                                                            <div className="text-[9px] font-semibold opacity-70">Shift 1 &amp; Shift 2 separately</div>
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
                                                        className={`flex-1 flex items-center gap-2 p-3 rounded-xl border-2 transition-all cursor-pointer ${(campusForm.working_days ?? 5) === 5
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
                                                        className={`flex-1 flex items-center gap-2 p-3 rounded-xl border-2 transition-all cursor-pointer ${(campusForm.working_days ?? 5) === 6
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

                                    {/* ────────────────── STEP 2: COURSES ────────────────── */}
                                    {campusWizardStep === 2 && (
                                        <div className="space-y-4 animate-fadeIn">
                                            <div className="pb-1 border-b border-gray-100 flex items-center justify-between">
                                                <div>
                                                    <h4 className="text-xs font-black text-gray-800 uppercase tracking-wider">Courses</h4>
                                                    <p className="text-[9.5px] text-gray-400 font-semibold mt-0.5">Add courses and assign rooms for each year &amp; section.</p>
                                                </div>
                                                <span className="text-[10px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded-full">
                                                    {wizardCourses.length} Course{wizardCourses.length !== 1 ? "s" : ""}
                                                </span>
                                            </div>

                                            {/* Existing / Added Courses List */}
                                            {wizardCourses.length > 0 && (
                                                <div className="space-y-2 max-h-[240px] overflow-y-auto pr-1">
                                                    {wizardCourses.map((c, idx) => (
                                                        <div key={idx} className="bg-indigo-50/40 border border-indigo-100 p-3 rounded-xl space-y-2">
                                                            <div className="flex items-start justify-between gap-2">
                                                                <div className="space-y-1 flex-1 min-w-0">
                                                                    <div className="flex items-center gap-1.5 flex-wrap">
                                                                        <span className="font-extrabold text-xs text-gray-800">{c.name}</span>
                                                                        <span className="px-1.5 rounded bg-indigo-50 border border-indigo-200 text-indigo-700 text-[8px] font-extrabold uppercase shrink-0">
                                                                            {c.years} Yrs · {c.years * 2} Sem
                                                                        </span>
                                                                        {c.isExisting && (
                                                                            <span className="px-1.5 rounded bg-emerald-50 border border-emerald-200 text-emerald-700 text-[8px] font-extrabold uppercase shrink-0">Saved</span>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                                <div className="flex items-center gap-1.5 shrink-0">
                                                                    <Button variant="ghost"
                                                                        type="button"
                                                                        onClick={() => handleStartEditRooms(c, idx)}
                                                                        className="h-auto text-[10px] text-indigo-600 font-extrabold hover:text-indigo-800 bg-white border border-indigo-200 hover:bg-indigo-50 px-2 py-1 rounded-xl transition-colors cursor-pointer flex items-center gap-1 shadow-2xs"
                                                                    >
                                                                        <Edit className="h-3 w-3" /> Edit Rooms
                                                                    </Button>
                                                                    {!c.isExisting && (
                                                                        <Button variant="ghost"
                                                                            type="button"
                                                                            onClick={() => setWizardCourses(prev => prev.filter((_, i) => i !== idx))}
                                                                            className="h-auto text-[10px] text-red-500 font-extrabold hover:text-red-700 bg-red-50 hover:bg-red-100 px-2 py-1 rounded-xl transition-colors cursor-pointer"
                                                                        >
                                                                            Remove
                                                                        </Button>
                                                                    )}
                                                                </div>
                                                            </div>

                                                            {/* Room Display or Inline Room Editor */}
                                                            {editingWizardCourseIndex === idx ? (
                                                                <div className="mt-2.5 pt-2.5 border-t border-indigo-200 space-y-2 bg-white p-3 rounded-xl shadow-2xs animate-fadeIn">
                                                                    <span className="text-[10px] font-black text-indigo-700 uppercase tracking-wider block">Edit Classroom Allocations</span>
                                                                    <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                                                                        {Object.keys(editingRooms).length === 0 ? (
                                                                            <div className="text-[10px] text-slate-400 italic">No room entries found.</div>
                                                                        ) : (
                                                                            Object.keys(editingRooms).map((roomKey) => (
                                                                                <div key={roomKey} className="flex items-center gap-2">
                                                                                    <span className="text-[9.5px] font-bold text-slate-600 w-32 shrink-0">{roomKey}:</span>
                                                                                    <Input
                                                                                        type="text"
                                                                                        value={editingRooms[roomKey] || ""}
                                                                                        onChange={(e) => setEditingRooms({ ...editingRooms, [roomKey]: e.target.value })}
                                                                                        placeholder="Room Name"
                                                                                        className="flex-1 p-1.5 border border-slate-200 rounded-lg text-xs font-bold focus:ring-1 focus:ring-indigo-500 outline-none"
                                                                                    />
                                                                                </div>
                                                                            ))
                                                                        )}
                                                                    </div>
                                                                    <div className="flex justify-end gap-2 pt-1">
                                                                        <Button variant="ghost"
                                                                            type="button"
                                                                            onClick={() => setEditingWizardCourseIndex(null)}
                                                                            className="h-auto px-3 py-1 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg text-[10px] font-bold cursor-pointer"
                                                                        >
                                                                            Cancel
                                                                        </Button>
                                                                        <Button variant="ghost"
                                                                            type="button"
                                                                            onClick={() => handleSaveEditedRooms(idx)}
                                                                            className="h-auto px-3 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-[10px] font-bold cursor-pointer shadow-2xs"
                                                                        >
                                                                            Save Rooms
                                                                        </Button>
                                                                    </div>
                                                                </div>
                                                            ) : (
                                                                c.sectionRooms && Object.keys(c.sectionRooms).length > 0 && (
                                                                    <div className="text-[9px] text-gray-500 font-bold flex flex-wrap gap-1.5 pt-0.5">
                                                                        {Object.entries(c.sectionRooms as Record<string, string>).map(([key, room]) => (
                                                                            <span key={key} className="bg-white border border-gray-200 px-1.5 py-0.5 rounded-lg flex items-center gap-1">
                                                                                {key}: <span className="text-gray-800 font-extrabold">{room}</span>
                                                                            </span>
                                                                        ))}
                                                                    </div>
                                                                )
                                                            )}
                                                        </div>
                                                    ))}
                                                </div>
                                            )}

                                            {/* Add Course Sub-Form */}
                                            <div className="bg-slate-50/60 p-4 rounded-xl border border-slate-100 space-y-3.5">
                                                <div className="text-[10px] font-black text-gray-500 uppercase tracking-wider">+ Add Course</div>

                                                {/* Course Name */}
                                                <div className="space-y-1">
                                                    <label className={`text-[9.5px] uppercase font-bold block transition-colors ${courseFieldErrors.name ? 'text-red-500' : 'text-gray-400'}`}>Course Name *</label>
                                                    <Input
                                                        aria-label="Course Name"
                                                        aria-invalid={Boolean(courseFieldErrors.name)}
                                                        type="text"
                                                        value={wizardCourseForm.name}
                                                        onChange={(e) => {
                                                            setWizardCourseForm({ ...wizardCourseForm, name: e.target.value });
                                                            if (e.target.value.trim()) setCourseFieldErrors(prev => ({ ...prev, name: false }));
                                                        }}
                                                        placeholder="e.g. B. Sc Computer Science"
                                                        className={`w-full rounded-xl px-3 py-2 font-bold text-xs focus:outline-none focus:ring-2 transition-all ${courseFieldErrors.name
                                                            ? 'border-2 border-red-400 bg-red-50 focus:ring-red-200'
                                                            : 'bg-white border border-gray-200 focus:ring-indigo-100 focus:border-indigo-400'
                                                            }`}
                                                    />
                                                    {courseFieldErrors.name && <p role="alert" className="text-[9px] text-red-500 font-bold mt-0.5"> Course name is required</p>}
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
                                                                onClick={() => {
                                                                    const newSections: Record<number, number> = {};
                                                                    for (let i = 1; i <= y; i++) {
                                                                        newSections[i] = wizardCourseForm.sections[i] || 1;
                                                                    }
                                                                    setWizardCourseForm(prev => ({ ...prev, years: y, sections: newSections, sectionRooms: {} }));
                                                                }}
                                                                className={`flex-1 py-2 rounded-xl font-extrabold text-xs transition-all cursor-pointer border-2 ${wizardCourseForm.years === y
                                                                    ? "bg-indigo-600 border-indigo-600 text-white shadow-sm"
                                                                    : "bg-white border-gray-200 text-gray-600 hover:border-indigo-300"
                                                                    }`}
                                                            >
                                                                {y} Yrs
                                                            </button>
                                                        ))}
                                                    </div>
                                                </div>

                                                {/* Number of Sections per Year */}
                                                <div className="space-y-2">
                                                    <label className="text-[9.5px] text-gray-400 uppercase font-bold block">Sections per Year *</label>
                                                    <div className="grid grid-cols-2 gap-2">
                                                        {Array.from({ length: wizardCourseForm.years }, (_, i) => i + 1).map(yr => (
                                                            <div key={yr} className="flex items-center gap-2 bg-white border border-gray-200 rounded-xl px-3 py-2">
                                                                <span className="text-[9.5px] font-extrabold text-gray-700 w-12 shrink-0">Year {yr}</span>
                                                                <div className="flex items-center gap-1 ml-auto">
                                                                    <Button variant="ghost" size="icon"
                                                                        type="button"
                                                                        aria-label={`Decrease sections for Year ${yr}`}
                                                                        onClick={() => {
                                                                            const cur = wizardCourseForm.sections[yr] || 1;
                                                                            if (cur > 1) {
                                                                                setWizardCourseForm(prev => ({
                                                                                    ...prev,
                                                                                    sections: { ...prev.sections, [yr]: cur - 1 },
                                                                                    sectionRooms: {}
                                                                                }));
                                                                            }
                                                                        }}
                                                                        className="h-auto w-auto h-5 w-5 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-600 font-black flex items-center justify-center cursor-pointer transition-colors text-sm"
                                                                    >−</Button>
                                                                    <span className="w-5 text-center font-extrabold text-xs text-gray-800">
                                                                        {wizardCourseForm.sections[yr] || 1}
                                                                    </span>
                                                                    <Button variant="ghost" size="icon"
                                                                        type="button"
                                                                        aria-label={`Increase sections for Year ${yr}`}
                                                                        onClick={() => {
                                                                            const cur = wizardCourseForm.sections[yr] || 1;
                                                                            setWizardCourseForm(prev => ({
                                                                                ...prev,
                                                                                sections: { ...prev.sections, [yr]: cur + 1 },
                                                                                sectionRooms: {}
                                                                            }));
                                                                        }}
                                                                        className="h-auto w-auto h-5 w-5 rounded-lg bg-indigo-100 hover:bg-indigo-200 text-indigo-700 font-black flex items-center justify-center cursor-pointer transition-colors text-sm"
                                                                    >+</Button>
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>

                                                {/* Section-wise Room Allocation */}
                                                <div className="space-y-2">
                                                    <label className={`text-[9.5px] uppercase font-bold block transition-colors ${Object.keys(courseFieldErrors).some(k => k.startsWith("Year")) ? 'text-red-500' : 'text-gray-400'
                                                        }`}>Room Allocation (per Section) *</label>
                                                    <div className="space-y-1.5">
                                                        {Array.from({ length: wizardCourseForm.years }, (_, yi) => yi + 1).map(yr => {
                                                            const secCount = wizardCourseForm.sections[yr] || 1;
                                                            return Array.from({ length: secCount }, (_, si) => {
                                                                const sectionLetter = String.fromCharCode(65 + si);
                                                                const key = `Year ${yr} Section ${sectionLetter}`;
                                                                const isErr = !!courseFieldErrors[key];
                                                                return (
                                                                    <div key={key} className="flex items-center gap-2">
                                                                        <span className={`text-[9.5px] font-extrabold w-32 shrink-0 border rounded-lg px-2 py-1.5 transition-colors ${isErr
                                                                            ? 'text-red-700 bg-red-50 border-red-200'
                                                                            : 'text-gray-600 bg-gray-50 border-gray-200'
                                                                            }`}>
                                                                            Yr {yr} – Sec {sectionLetter}
                                                                        </span>
                                                                        <Input
                                                                            aria-label={`Room for Year ${yr} Section ${sectionLetter}`}
                                                                            aria-invalid={isErr}
                                                                            type="text"
                                                                            required
                                                                            placeholder={`Room for Year ${yr} Section ${sectionLetter}`}
                                                                            value={wizardCourseForm.sectionRooms[key] || ""}
                                                                            onChange={(e) => {
                                                                                const val = e.target.value;
                                                                                setWizardCourseForm(prev => ({
                                                                                    ...prev,
                                                                                    sectionRooms: { ...prev.sectionRooms, [key]: val }
                                                                                }));
                                                                                if (val.trim()) setCourseFieldErrors(prev => ({ ...prev, [key]: false }));
                                                                            }}
                                                                            className={`flex-1 rounded-xl px-3 py-1.5 font-bold text-xs focus:outline-none focus:ring-2 transition-all ${isErr
                                                                                ? 'border-2 border-red-400 bg-red-50 focus:ring-red-200'
                                                                                : 'bg-white border border-gray-200 focus:ring-indigo-100 focus:border-indigo-400'
                                                                                }`}
                                                                        />
                                                                    </div>
                                                                );
                                                            });
                                                        })}
                                                    </div>
                                                </div>

                                                {/* Default Shift */}
                                                <div className="space-y-1">
                                                    <label className="text-[9.5px] text-gray-400 uppercase font-bold block">Default Shift</label>
                                                    <Select
                                                        aria-label="Default Shift"
                                                        value={wizardCourseForm.default_shift}
                                                        onChange={(e) => setWizardCourseForm({ ...wizardCourseForm, default_shift: e.target.value })}
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

                                                <Button variant="ghost"
                                                    type="button"
                                                    onClick={() => {
                                                        setModalError(null);
                                                        const errs: Record<string, boolean> = {};
                                                        if (!wizardCourseForm.name.trim()) {
                                                            errs.name = true;
                                                        }

                                                        const missingRooms: string[] = [];
                                                        for (let yr = 1; yr <= wizardCourseForm.years; yr++) {
                                                            const secCount = wizardCourseForm.sections[yr] || 1;
                                                            for (let si = 0; si < secCount; si++) {
                                                                const sectionLetter = String.fromCharCode(65 + si);
                                                                const key = `Year ${yr} Section ${sectionLetter}`;
                                                                if (!wizardCourseForm.sectionRooms[key]?.trim()) {
                                                                    missingRooms.push(key);
                                                                    errs[key] = true;
                                                                }
                                                            }
                                                        }

                                                        if (Object.keys(errs).length > 0) {
                                                            setCourseFieldErrors(errs);
                                                            if (errs.name && missingRooms.length > 0) {
                                                                setModalError("Please specify Course Name and assign rooms for all sections.");
                                                            } else if (errs.name) {
                                                                setModalError("Course name is required.");
                                                            } else {
                                                                setModalError(`Please assign rooms for: ${missingRooms.join(", ")}`);
                                                            }
                                                            return;
                                                        }

                                                        setCourseFieldErrors({});
                                                        setModalError(null);
                                                        const newC = {
                                                            ...wizardCourseForm,
                                                            default_room: JSON.stringify(wizardCourseForm.sectionRooms),
                                                            isExisting: false
                                                        };
                                                        setWizardCourses([...wizardCourses, newC]);
                                                        setWizardCourseForm({
                                                            name: "",
                                                            years: 3,
                                                            sections: { 1: 1, 2: 1, 3: 1, 4: 1, 5: 1 },
                                                            sectionRooms: {},
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
                                                <div>
                                                    <h4 className="text-xs font-black text-gray-800 uppercase tracking-wider">Shift Configuration</h4>
                                                    <p className="text-[9.5px] text-gray-400 font-semibold mt-0.5">Configure start time with clock widget, period durations, and breaks with live floating side-by-side preview.</p>
                                                </div>
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
                                                                className={`px-3 py-1 rounded-lg text-[10px] font-extrabold transition-all cursor-pointer ${activeConfigShift === sh
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
                                                        <Select aria-label="Semester"
                                                            value={activeConfigSemester}
                                                            onChange={(e) => handleSemesterChange(e.target.value)}
                                                            className="flex-1 bg-white border border-gray-200 rounded-lg px-2.5 py-1.5 font-bold text-xs focus:outline-none focus:ring-1 focus:ring-indigo-600 cursor-pointer"
                                                        >
                                                            <option value="All Semesters">All Semesters (Default Fallback)</option>
                                                            {ALL_SEMESTERS.map(sem => (
                                                                <option key={sem} value={sem}>{sem}</option>
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
                                                                    onChange={(e) => {
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
                                                                    <Button variant="link" size="sm"
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
                                                                        onChange={(e) => {
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
                                                                        <Input aria-label="Select time"
                                                                            type="time"
                                                                            onChange={(e) => {
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
                                                                        <div className="grid grid-cols-4 gap-1">
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
                                                                                    className={`py-1.5 rounded-lg text-[10px] font-extrabold transition-all border cursor-pointer ${shiftConfigsParams[activeConfigShift].startTime === timePreset
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
                                                                    onChange={(e) => {
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
                                                                    onChange={(e) => {
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
                                                                        onChange={(e) => {
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
                                                                        onChange={(e) => {
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
                                                                {shiftConfigsParams[activeConfigShift].breaks.map((brk) => (
                                                                    <div key={brk.id} className="flex items-center justify-between bg-slate-50/50 p-2.5 rounded-xl border border-gray-200">
                                                                        <div>
                                                                            <div className="font-extrabold text-xs text-gray-800">{brk.name}</div>
                                                                            <div className="text-[9.5px] font-bold text-gray-500 mt-0.5">
                                                                                {brk.duration} min • Occurs after Period {brk.afterPeriod}
                                                                            </div>
                                                                        </div>
                                                                        <div className="flex items-center gap-1.5">
                                                                            <Button variant="ghost" size="icon"
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
                                                                            >▲</Button>
                                                                            <Button variant="ghost" size="icon"
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
                                                                            >▼</Button>
                                                                            <Button variant="ghost" size="icon"
                                                                                type="button"
                                                                                onClick={() => {
                                                                                    const updatedBreaks = shiftConfigsParams[activeConfigShift].breaks.filter(b => b.id !== brk.id);
                                                                                    setShiftConfigsParams(prev => ({
                                                                                        ...prev,
                                                                                        [activeConfigShift]: { ...prev[activeConfigShift], breaks: updatedBreaks }
                                                                                    }));
                                                                                }}
                                                                                className="h-auto w-auto text-[10px] text-red-500 font-extrabold hover:text-red-700 bg-red-50 hover:bg-red-100 px-2 py-1 rounded-lg transition-colors cursor-pointer"
                                                                            >Remove</Button>
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
                                                                        onChange={(e) => setNewBreakName(e.target.value)}
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
                                                                        onChange={(e) => setNewBreakDuration(parseInt(e.target.value, 10) || 0)}
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
                                                                        onChange={(e) => setNewBreakAfterPeriod(parseInt(e.target.value, 10) || 1)}
                                                                        className="w-full bg-white border border-gray-200 rounded-lg px-2 py-1.5 font-bold text-xs"
                                                                    />
                                                                </div>
                                                            </div>
                                                            <Button variant="ghost"
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
                                                            <div className="bg-slate-900 text-white p-4.5 rounded-xl space-y-3.5 shadow-xl border border-slate-800 animate-fadeIn">
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
                                                                ) : (shiftConfigsParams[activeConfigShift].breaks.length === 0) ? (
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
                                                                                    onDragStart={(e) => {
                                                                                        if (matchedBreak) {
                                                                                            e.dataTransfer.setData("text/plain", matchedBreak.id);
                                                                                            setDraggedBreakId(matchedBreak.id);
                                                                                        }
                                                                                    }}
                                                                                    onDragOver={(e) => e.preventDefault()}
                                                                                    onDrop={() => {
                                                                                        if (draggedBreakId) {
                                                                                            let targetP = item.type === "period" ? (item.index || 1) : 1;
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
                                                                                    className={`relative flex flex-col gap-1.5 p-2.5 rounded-xl transition-all border ${isBreak
                                                                                        ? "bg-amber-950/40 border-amber-500/30 hover:bg-amber-900/50 cursor-grab active:cursor-grabbing"
                                                                                        : "bg-slate-800/70 border-slate-700/60 hover:bg-slate-800"
                                                                                        } ${draggedBreakId && matchedBreak?.id === draggedBreakId ? "opacity-40 scale-[0.98]" : ""}`}
                                                                                >
                                                                                    <div className={`absolute -left-[21px] top-3 w-2.5 h-2.5 rounded-full border-2 ${isBreak ? "bg-amber-400 border-amber-300 shadow-amber-500/50 shadow-sm" : "bg-indigo-400 border-indigo-300 shadow-indigo-500/50 shadow-sm"
                                                                                        }`} />

                                                                                    <div className="flex items-center justify-between gap-2">
                                                                                        <div className="flex items-center gap-2 min-w-0">
                                                                                            {isBreak && <GripVertical className="h-3.5 w-3.5 text-amber-400/80 shrink-0" />}
                                                                                            <span className={`font-black text-xs truncate ${isBreak ? "text-amber-300" : "text-slate-100"}`}>
                                                                                                {item.name}
                                                                                            </span>
                                                                                            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-md bg-slate-900/90 text-indigo-300 border border-slate-700/80 shrink-0">
                                                                                                {item.durationMinutes || 0}m
                                                                                            </span>
                                                                                            <Button variant="ghost" size="icon"
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
                                                                                                <span className="text-[8.5px] text-indigo-300/80 font-medium block">Only updates Period {item.index} & subsequent times</span>
                                                                                            </div>
                                                                                            <div className="flex items-center gap-1.5 shrink-0">
                                                                                                <Button variant="ghost" size="icon"
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
                                                                                                >−</Button>
                                                                                                <span className="font-mono font-extrabold text-indigo-300 w-8 text-center">
                                                                                                    {item.durationMinutes || shiftConfigsParams[activeConfigShift].periodDuration}m
                                                                                                </span>
                                                                                                <Button variant="ghost" size="icon"
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
                                                                                                >+</Button>
                                                                                                {shiftConfigsParams[activeConfigShift].customPeriodDurations?.[item.index] && (
                                                                                                    <Button variant="link" size="sm"
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
                                                                                                <span className="text-[8.5px] text-amber-300/80 font-medium block">Only updates break & subsequent times</span>
                                                                                            </div>
                                                                                            <div className="flex items-center gap-1.5 shrink-0">
                                                                                                <Button variant="ghost" size="icon"
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
                                                                                                >−</Button>
                                                                                                <span className="font-mono font-extrabold text-amber-300 w-8 text-center">
                                                                                                    {matchedBreak.duration}m
                                                                                                </span>
                                                                                                <Button variant="ghost" size="icon"
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
                                                                                                >+</Button>
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
                                                <p className="text-[9.5px] text-gray-400 font-semibold mt-0.5">Confirm all details before creating the campus.</p>
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
                                                    <div className="col-span-2">
                                                        <div className="text-[9px] text-gray-400 uppercase font-bold">Address</div>
                                                        <div className="text-xs font-extrabold text-gray-800">{campusForm.address || "—"}</div>
                                                    </div>
                                                    <div>
                                                        <div className="text-[9px] text-gray-400 uppercase font-bold">KAM</div>
                                                        <div className="text-xs font-extrabold text-gray-800">
                                                            {kamList.find(k => k.id === campusForm.kam_id)?.name || "—"}
                                                        </div>
                                                    </div>
                                                    <div>
                                                        <div className="text-[9px] text-gray-400 uppercase font-bold">Campus Manager</div>
                                                        <div className="text-xs font-extrabold text-gray-800">
                                                            {camList.find(c => c.id === campusForm.manager)?.name || "Not assigned"}
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
                                                            <div key={idx} className="bg-white border border-slate-100 rounded-2xl p-3 space-y-1 shadow-card">
                                                                <div className="flex items-center gap-2">
                                                                    <span className="font-extrabold text-xs text-gray-800">{c.name}</span>
                                                                    <span className="text-[8px] font-extrabold bg-indigo-50 border border-indigo-100 text-indigo-700 px-1.5 py-0.2 rounded uppercase">
                                                                        {c.years}Y · {c.years * 2} Sem
                                                                    </span>
                                                                </div>
                                                                {c.sectionRooms && Object.keys(c.sectionRooms).length > 0 && (
                                                                    <div className="flex flex-wrap gap-1.5">
                                                                        {Object.entries(c.sectionRooms as Record<string, string>).map(([key, room]) => (
                                                                            <span key={key} className="text-[8.5px] font-bold text-gray-600 bg-gray-50 border border-gray-200 px-1.5 py-0.5 rounded-lg">
                                                                                {key}: <span className="text-gray-800">{room}</span>
                                                                            </span>
                                                                        ))}
                                                                    </div>
                                                                )}
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
                                            <Button variant="ghost"
                                                type="button"
                                                onClick={() => { setCampusWizardStep(campusWizardStep - 1); setModalError(null); }}
                                                className="h-auto px-4 py-2 hover:bg-gray-100 text-gray-500 rounded-xl transition-all font-bold cursor-pointer"
                                            >
                                                ← Back
                                            </Button>
                                        )}
                                    </div>
                                    <div className="flex gap-2">
                                        <Button variant="ghost"
                                            type="button"
                                            onClick={() => { setShowCampusModal(false); setCampusSuccessCreatedId(null); }}
                                            className="h-auto px-4 py-2 hover:bg-gray-100 text-gray-500 rounded-xl transition-all font-bold cursor-pointer"
                                        >
                                            Cancel
                                        </Button>
                                        {campusWizardStep < 4 ? (
                                            <Button variant="ghost"
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
                                                isLoading={loadingActions['submit_campus']}
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
                )}

                {showKamModal && (
                    <Dialog
                        open={true}
                        onOpenChange={(next) => { if (!next) setShowKamModal(false); }}
                        ariaLabel="Key Account Manager"
                        overlayClassName="bg-gray-900/50 backdrop-blur-sm p-4"
                        panelClassName="max-w-md overflow-hidden animate-slideUp p-0 space-y-0 max-h-[90vh]"
                    >
                        <div className="flex justify-between items-center p-6 border-b border-gray-100 bg-gray-50">
                            <h3 className="font-extrabold text-gray-900 text-sm flex items-center gap-1.5">
                                <Briefcase className="h-5 w-5 text-indigo-600" />
                                {editingKam ? "Edit Key Account Manager" : "Add Key Account Manager"}
                            </h3>
                            <Button variant="ghost" size="icon" aria-label="Close KAM dialog" onClick={() => setShowKamModal(false)} className="h-auto w-auto p-1 hover:bg-gray-200 rounded-lg transition-colors cursor-pointer text-gray-500 hover:text-gray-800">
                                <X className="h-4 w-4" />
                            </Button>
                        </div>

                        <form onSubmit={handleKamSubmit} className="p-6 space-y-4 text-xs font-semibold">
                            {modalError && (
                                <div role="alert" className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 font-bold flex items-center gap-1.5">
                                    <ShieldAlert className="h-4 w-4 shrink-0" />
                                    {modalError}
                                </div>
                            )}

                            <div className="space-y-1">
                                <label className="text-[10px] text-gray-400 uppercase tracking-wider block">KAM ID</label>
                                <Input
                                    aria-label="KAM ID"
                                    type="text"
                                    required
                                    placeholder="e.g. kam_3"
                                    disabled={editingKam}
                                    value={kamForm.id}
                                    onChange={(e) => setKamForm({ ...kamForm, id: e.target.value })}
                                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3.5 py-2.5 font-bold focus:outline-none focus:ring-1 focus:ring-indigo-600 disabled:bg-gray-100 disabled:text-gray-400"
                                />
                            </div>

                            <div className="space-y-1">
                                <label className="text-[10px] text-gray-400 uppercase tracking-wider block">Full Name</label>
                                <Input
                                    aria-label="Full Name"
                                    type="text"
                                    required
                                    placeholder="e.g. Ramesh Dev"
                                    value={kamForm.name}
                                    onChange={(e) => setKamForm({ ...kamForm, name: e.target.value })}
                                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3.5 py-2.5 font-bold focus:outline-none focus:ring-1 focus:ring-indigo-600"
                                />
                            </div>

                            <div className="space-y-1">
                                <label className="text-[10px] text-gray-400 uppercase tracking-wider block">Email Address</label>
                                <Input
                                    aria-label="Email Address"
                                    type="email"
                                    required
                                    placeholder="e.g. ramesh.kam@faceprep.in"
                                    value={kamForm.email}
                                    onChange={(e) => setKamForm({ ...kamForm, email: e.target.value })}
                                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3.5 py-2.5 font-bold focus:outline-none focus:ring-1 focus:ring-indigo-600"
                                />
                            </div>

                            <div className="space-y-1">
                                <label className="text-[10px] text-gray-400 uppercase tracking-wider block">Title / Position</label>
                                <Input
                                    aria-label="Title / Position"
                                    type="text"
                                    placeholder="e.g. Key Account Manager"
                                    value={kamForm.title}
                                    onChange={(e) => setKamForm({ ...kamForm, title: e.target.value })}
                                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3.5 py-2.5 font-bold focus:outline-none focus:ring-1 focus:ring-indigo-600"
                                />
                            </div>

                            <div className="flex justify-end gap-2 pt-4 border-t border-gray-100">
                                <Button variant="ghost"
                                    type="button"
                                    onClick={() => setShowKamModal(false)}
                                    className="h-auto px-4 py-2 hover:bg-gray-100 text-gray-500 rounded-xl transition-all font-bold cursor-pointer"
                                >
                                    Cancel
                                </Button>
                                <LoadingButton
                                    type="submit"
                                    isLoading={loadingActions['submit_kam']}
                                    loadingText={editingKam ? "Saving..." : "Creating..."}
                                    variant="gradient"
                                    className="px-5 py-2 text-white rounded-xl shadow-sm transition-all font-bold cursor-pointer"
                                >
                                    {editingKam ? "Save Changes" : "Create KAM"}
                                </LoadingButton>
                            </div>
                        </form>
                    </Dialog>
                )}

                {/* ── CAM Modal ── */}
                {showCamModal && (
                    <Dialog
                        open={true}
                        onOpenChange={(next) => { if (!next) setShowCamModal(false); }}
                        ariaLabel="Campus Manager"
                        overlayClassName="bg-gray-900/50 backdrop-blur-sm p-4"
                        panelClassName="max-w-md overflow-hidden animate-slideUp p-0 space-y-0 max-h-[90vh]"
                    >
                        <div className="flex justify-between items-center p-6 border-b border-gray-100 bg-gray-50">
                            <h3 className="font-extrabold text-gray-900 text-sm flex items-center gap-1.5">
                                <Users className="h-5 w-5 text-indigo-600" />
                                {editingCam ? "Edit Campus Manager" : "Add Campus Manager"}
                            </h3>
                            <Button variant="ghost" size="icon" aria-label="Close CAM dialog" onClick={() => setShowCamModal(false)} className="h-auto w-auto p-1 hover:bg-gray-200 rounded-lg transition-colors cursor-pointer text-gray-500 hover:text-gray-800">
                                <X className="h-4 w-4" />
                            </Button>
                        </div>

                        <form onSubmit={handleCamSubmit} className="p-6 space-y-4 text-xs font-semibold">
                            {modalError && (
                                <div role="alert" className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 font-bold flex items-center gap-1.5">
                                    <ShieldAlert className="h-4 w-4 shrink-0" />
                                    {modalError}
                                </div>
                            )}

                            <div className="space-y-1">
                                <label className="text-[10px] text-gray-400 uppercase tracking-wider block">CM ID</label>
                                <Input
                                    aria-label="CM ID"
                                    type="text"
                                    required
                                    placeholder="e.g. cam_3"
                                    disabled={editingCam}
                                    value={camForm.id}
                                    onChange={(e) => setCamForm({ ...camForm, id: e.target.value })}
                                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3.5 py-2.5 font-bold focus:outline-none focus:ring-1 focus:ring-indigo-600 disabled:bg-gray-100 disabled:text-gray-400"
                                />
                            </div>

                            <div className="space-y-1">
                                <label className="text-[10px] text-gray-400 uppercase tracking-wider block">Full Name</label>
                                <Input
                                    aria-label="Full Name"
                                    type="text"
                                    required
                                    placeholder="e.g. Priya Venkatesh"
                                    value={camForm.name}
                                    onChange={(e) => setCamForm({ ...camForm, name: e.target.value })}
                                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3.5 py-2.5 font-bold focus:outline-none focus:ring-1 focus:ring-indigo-600"
                                />
                            </div>

                            <div className="space-y-1">
                                <label className="text-[10px] text-gray-400 uppercase tracking-wider block">Email Address</label>
                                <Input
                                    aria-label="Email Address"
                                    type="email"
                                    required
                                    placeholder="e.g. priya.cam@faceprep.in"
                                    value={camForm.email}
                                    onChange={(e) => setCamForm({ ...camForm, email: e.target.value })}
                                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3.5 py-2.5 font-bold focus:outline-none focus:ring-1 focus:ring-indigo-600"
                                />
                            </div>

                            <div className="space-y-1">
                                <label className="text-[10px] text-gray-400 uppercase tracking-wider block">Assigned Campus</label>
                                <Select
                                    aria-label="Assigned Campus"
                                    required
                                    value={camForm.college_id}
                                    onChange={(e) => setCamForm({ ...camForm, college_id: e.target.value })}
                                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 font-bold focus:outline-none focus:ring-1 focus:ring-indigo-600 cursor-pointer"
                                >
                                    <option value="">Select Campus</option>
                                    {colleges.map(c => (
                                        <option key={c.id} value={c.id}>{c.name}</option>
                                    ))}
                                </Select>
                            </div>

                            <div className="space-y-1">
                                <label className="text-[10px] text-gray-400 uppercase tracking-wider block">Reporting KAM Manager</label>
                                <Select
                                    aria-label="Reporting KAM Manager"
                                    required
                                    value={camForm.kam_id}
                                    onChange={(e) => setCamForm({ ...camForm, kam_id: e.target.value })}
                                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 font-bold focus:outline-none focus:ring-1 focus:ring-indigo-600 cursor-pointer"
                                >
                                    <option value="">Select Reporting KAM</option>
                                    {kamList.map(kam => (
                                        <option key={kam.id} value={kam.id}>{kam.name}</option>
                                    ))}
                                </Select>
                            </div>

                            <div className="flex justify-end gap-2 pt-4 border-t border-gray-100">
                                <Button variant="ghost"
                                    type="button"
                                    onClick={() => setShowCamModal(false)}
                                    className="h-auto px-4 py-2 hover:bg-gray-100 text-gray-500 rounded-xl transition-all font-bold cursor-pointer"
                                >
                                    Cancel
                                </Button>
                                <LoadingButton
                                    type="submit"
                                    isLoading={loadingActions['submit_cam']}
                                    loadingText={editingCam ? "Saving..." : "Creating..."}
                                    variant="gradient"
                                    className="px-5 py-2 text-white rounded-xl shadow-sm transition-all font-bold cursor-pointer"
                                >
                                    {editingCam ? "Save Changes" : "Create Campus Manager"}
                                </LoadingButton>
                            </div>
                        </form>
                    </Dialog>
                )}

                {/* ── SME Modal ── */}
                {showSmeModal && (
                    <Dialog
                        open={true}
                        onOpenChange={(next) => { if (!next) setShowSmeModal(false); }}
                        ariaLabel="Subject Matter Expert"
                        overlayClassName="bg-gray-900/50 backdrop-blur-sm p-4"
                        panelClassName="max-w-md overflow-hidden animate-slideUp p-0 space-y-0 max-h-[90vh]"
                    >
                        <div className="flex justify-between items-center p-6 border-b border-gray-100 bg-gray-50">
                            <h3 className="font-extrabold text-gray-900 text-sm flex items-center gap-1.5 font-sans">
                                <BookOpen className="h-5 w-5 text-indigo-600" />
                                {isEditingSme ? "Edit Subject Matter Expert" : "Add Subject Matter Expert"}
                            </h3>
                            <Button variant="ghost" size="icon" aria-label="Close SME dialog" onClick={() => setShowSmeModal(false)} className="h-auto w-auto p-1 hover:bg-gray-200 rounded-lg transition-colors cursor-pointer text-gray-500 hover:text-gray-800">
                                <X className="h-4 w-4" />
                            </Button>
                        </div>

                        <div className="p-6 space-y-4 text-xs font-semibold font-sans">
                            <div className="space-y-1">
                                <label className="text-[10px] text-gray-400 uppercase tracking-wider block">SME ID</label>
                                <Input
                                    aria-label="SME ID"
                                    type="text"
                                    disabled={isEditingSme}
                                    value={smeForm.id}
                                    onChange={(e) => setSmeForm({ ...smeForm, id: e.target.value })}
                                    placeholder="e.g. sme_4"
                                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-gray-700 bg-white outline-none focus:ring-1 focus:ring-indigo-600 disabled:bg-gray-100 disabled:text-gray-400 font-mono"
                                />
                            </div>

                            <div className="space-y-1">
                                <label className="text-[10px] text-gray-400 uppercase tracking-wider block">Full Name</label>
                                <Input
                                    aria-label="Full Name"
                                    type="text"
                                    value={smeForm.name}
                                    onChange={(e) => setSmeForm({ ...smeForm, name: e.target.value })}
                                    placeholder="e.g. Dr. Ramesh Kumar"
                                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-gray-700 bg-white outline-none focus:ring-1 focus:ring-indigo-600"
                                />
                            </div>

                            <div className="space-y-1">
                                <label className="text-[10px] text-gray-400 uppercase tracking-wider block">Email Address</label>
                                <Input
                                    aria-label="Email Address"
                                    type="email"
                                    value={smeForm.email}
                                    onChange={(e) => setSmeForm({ ...smeForm, email: e.target.value })}
                                    placeholder="e.g. ramesh.sme@faceprep.in"
                                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-gray-700 bg-white outline-none focus:ring-1 focus:ring-indigo-600"
                                />
                            </div>

                            <div className="space-y-1">
                                <label className="text-[10px] text-gray-400 uppercase tracking-wider block">Subject Group Specialization</label>
                                <Select
                                    aria-label="Subject Group Specialization"
                                    value={smeForm.subject}
                                    onChange={(e) => setSmeForm({ ...smeForm, subject: e.target.value })}
                                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-gray-700 bg-white outline-none focus:ring-1 focus:ring-indigo-600"
                                >
                                    <option value="">-- Unassigned --</option>
                                    {subjectGroups && subjectGroups.map(sg => (
                                        <option key={sg.id} value={sg.name}>{sg.name}</option>
                                    ))}
                                </Select>
                            </div>

                            <div className="flex justify-end gap-3 pt-3 border-t border-gray-100">
                                <Button variant="ghost"
                                    type="button"
                                    onClick={() => setShowSmeModal(false)}
                                    className="h-auto px-4 py-2 border border-gray-200 rounded-xl hover:bg-gray-50 text-gray-700 transition-colors cursor-pointer"
                                >
                                    Cancel
                                </Button>
                                <LoadingButton
                                    type="button"
                                    isLoading={loadingActions['submit_sme']}
                                    loadingText="Saving..."
                                    variant="secondary"
                                    onClick={handleSaveSme}
                                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold transition-all shadow-md cursor-pointer"
                                >
                                    Save SME
                                </LoadingButton>
                            </div>
                        </div>
                    </Dialog>
                )}

                {/* ── Mentor Modal ── */}
                {showMentorModal && (
                    <Dialog
                        open={true}
                        onOpenChange={(next) => { if (!next) setShowMentorModal(false); }}
                        ariaLabel="Faculty Mentor"
                        overlayClassName="bg-gray-900/50 backdrop-blur-sm p-4"
                        panelClassName="max-w-lg overflow-hidden animate-slideUp p-0 space-y-0 max-h-[90vh]"
                    >
                        <div className="flex justify-between items-center p-6 border-b border-gray-100 bg-gray-50">
                            <h3 className="font-extrabold text-gray-900 text-sm flex items-center gap-1.5">
                                <Users className="h-5 w-5 text-indigo-600" />
                                {editingMentor ? "Edit Faculty Mentor" : "Add Faculty Mentor"}
                            </h3>
                            <Button variant="ghost" size="icon" aria-label="Close mentor dialog" onClick={() => setShowMentorModal(false)} className="h-auto w-auto p-1 hover:bg-gray-200 rounded-lg transition-colors cursor-pointer text-gray-500 hover:text-gray-800">
                                <X className="h-4 w-4" />
                            </Button>
                        </div>

                        <form onSubmit={handleMentorSubmit} className="p-6 space-y-3.5 text-xs font-semibold max-h-[80vh] overflow-y-auto">
                            {modalError && (
                                <div role="alert" className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 font-bold flex items-center gap-1.5">
                                    <ShieldAlert className="h-4 w-4 shrink-0" />
                                    {modalError}
                                </div>
                            )}

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                                <div className="space-y-1">
                                    <label className="text-[10px] text-gray-400 uppercase tracking-wider block">Mentor ID</label>
                                    <Input
                                        aria-label="Mentor ID"
                                        type="text"
                                        required
                                        placeholder="e.g. m35"
                                        disabled={editingMentor}
                                        value={mentorForm.id}
                                        onChange={(e) => setMentorForm({ ...mentorForm, id: e.target.value })}
                                        className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3.5 py-2.5 font-bold focus:outline-none focus:ring-1 focus:ring-indigo-600 disabled:bg-gray-100 disabled:text-gray-400"
                                    />
                                </div>

                                <div className="space-y-1">
                                    <label className="text-[10px] text-gray-400 uppercase tracking-wider block">Initials / Avatar</label>
                                    <Input
                                        aria-label="Initials / Avatar"
                                        type="text"
                                        placeholder="e.g. MS (Leave blank to auto-generate)"
                                        value={mentorForm.avatar}
                                        onChange={(e) => setMentorForm({ ...mentorForm, avatar: e.target.value })}
                                        className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3.5 py-2.5 font-bold focus:outline-none focus:ring-1 focus:ring-indigo-600"
                                    />
                                </div>
                            </div>

                            <div className="space-y-1">
                                <label className="text-[10px] text-gray-400 uppercase tracking-wider block">Full Name</label>
                                <Input
                                    aria-label="Full Name"
                                    type="text"
                                    required
                                    placeholder="e.g. Dr. Alice Smith"
                                    value={mentorForm.name}
                                    onChange={(e) => setMentorForm({ ...mentorForm, name: e.target.value })}
                                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3.5 py-2.5 font-bold focus:outline-none focus:ring-1 focus:ring-indigo-600"
                                />
                            </div>

                            <div className="space-y-1">
                                <label className="text-[10px] text-gray-400 uppercase tracking-wider block">Email Address</label>
                                <Input
                                    aria-label="Email Address"
                                    type="email"
                                    required
                                    placeholder="e.g. alice.smith@faceprep.in"
                                    value={mentorForm.email}
                                    onChange={(e) => setMentorForm({ ...mentorForm, email: e.target.value })}
                                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3.5 py-2.5 font-bold focus:outline-none focus:ring-1 focus:ring-indigo-600"
                                />
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                                <div className="space-y-1">
                                    <label className="text-[10px] text-gray-400 uppercase tracking-wider block">Assigned Campus</label>
                                    <Select
                                        aria-label="Assigned Campus"
                                        required
                                        value={mentorForm.college_id}
                                        onChange={(e) => setMentorForm({ ...mentorForm, college_id: e.target.value })}
                                        className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 font-bold focus:outline-none focus:ring-1 focus:ring-indigo-600 cursor-pointer"
                                    >
                                        <option value="">Select Campus</option>
                                        {colleges.map(c => (
                                            <option key={c.id} value={c.id}>{c.name}</option>
                                        ))}
                                    </Select>
                                </div>

                                {isCampusShiftBased && (
                                    <div className="space-y-1">
                                        <label className="text-[10px] text-gray-400 uppercase tracking-wider block">Shift Assignment</label>
                                        <p className="text-[10px] text-slate-500 italic py-2">Shifts are assigned per slot, not per faculty member.</p>
                                    </div>
                                )}
                            </div>

                            <div className="space-y-1">
                                <label className="text-[10px] text-gray-400 uppercase tracking-wider block">Mentor Group</label>
                                <Select
                                    aria-label="Mentor Group"
                                    required
                                    value={mentorForm.mentor_group}
                                    onChange={(e) => setMentorForm({ ...mentorForm, mentor_group: e.target.value })}
                                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 font-bold focus:outline-none focus:ring-1 focus:ring-indigo-600 cursor-pointer text-gray-800"
                                >
                                    <option value="">— Select Mentor Group —</option>
                                    {subjectGroups.map(sg => (
                                        <option key={sg.id} value={sg.name}>{sg.name}</option>
                                    ))}
                                </Select>
                            </div>

                            {/* Subject Mapping Checklist */}
                            <div className="space-y-1">
                                <label className="text-[10px] text-gray-400 uppercase tracking-wider block">Map Subjects to Mentor</label>
                                <div className="relative mb-1.5">
                                    <Search className="absolute left-2.5 top-1.5 h-3.5 w-3.5 text-gray-400" />
                                    <Input
                                        type="text"
                                        aria-label="Search subjects"
                                        placeholder="Search subject catalog..."
                                        value={mentorSubjectSearch}
                                        onChange={(e) => setMentorSubjectSearch(e.target.value)}
                                        className="w-full bg-gray-50 border border-gray-200 rounded-lg pl-8 pr-3 py-1.5 text-[10px] focus:outline-none focus:ring-1 focus:ring-indigo-600 font-bold"
                                    />
                                </div>

                                <div className="border border-gray-200 rounded-xl bg-gray-50 p-3.5 max-h-36 overflow-y-auto space-y-1.5 text-[11px] font-bold">
                                    {(() => {
                                        const searched = (subjectsList || []).filter(s => {
                                            const matchesSearch = s.name.toLowerCase().includes(mentorSubjectSearch.toLowerCase()) ||
                                                (s.subject_group || s.department || "").toLowerCase().includes(mentorSubjectSearch.toLowerCase());
                                            if (!mentorSubjectSearch && mentorForm.mentor_group) {
                                                const mg = mentorForm.mentor_group.toLowerCase();
                                                const sg = (s.subject_group || s.department || "").toLowerCase();
                                                return sg === mg || sg.includes(mg) || mg.includes(sg);
                                            }
                                            return matchesSearch;
                                        });

                                        const currentCheckedList = (mentorForm.subjects && typeof mentorForm.subjects === 'string')
                                            ? mentorForm.subjects.split("\n").map(s => s.trim()).filter(Boolean)
                                            : [];

                                        return (
                                            <>
                                                {searched.map(s => {
                                                    const isChecked = currentCheckedList.includes(s.name);
                                                    return (
                                                        <label key={s.id} className="flex items-start gap-2 py-1 px-1.5 hover:bg-white rounded cursor-pointer transition-colors text-gray-700">
                                                            <input
                                                                type="checkbox"
                                                                checked={isChecked}
                                                                onChange={(e) => {
                                                                    let newList;
                                                                    if (e.target.checked) {
                                                                        newList = [...currentCheckedList, s.name];
                                                                    } else {
                                                                        newList = currentCheckedList.filter(item => item !== s.name);
                                                                    }
                                                                    setMentorForm({ ...mentorForm, subjects: newList.join("\n") });
                                                                }}
                                                                className="rounded text-indigo-600 focus:ring-indigo-500 h-3.5 w-3.5 cursor-pointer mt-0.5"
                                                            />
                                                            <div className="leading-tight">
                                                                <span className="font-bold text-gray-800">{s.name}</span>
                                                                <span className="text-[9px] text-gray-400 block font-semibold">{s.department} • {s.semester}</span>
                                                            </div>
                                                        </label>
                                                    );
                                                })}
                                                {searched.length === 0 && (
                                                    <div className="text-center text-gray-500 italic py-2">
                                                        No subjects found. Select/input a department to filter or search catalog.
                                                    </div>
                                                )}
                                            </>
                                        );
                                    })()}
                                </div>
                            </div>

                            <div className="flex justify-end gap-2 pt-4 border-t border-gray-100">
                                <Button variant="ghost"
                                    type="button"
                                    onClick={() => setShowMentorModal(false)}
                                    className="h-auto px-4 py-2 hover:bg-gray-100 text-gray-500 rounded-xl transition-all font-bold cursor-pointer"
                                >
                                    Cancel
                                </Button>
                                <LoadingButton
                                    type="submit"
                                    isLoading={loadingActions['submit_mentor']}
                                    loadingText={editingMentor ? "Saving..." : "Creating..."}
                                    variant="gradient"
                                    className="px-5 py-2 text-white rounded-xl shadow-sm transition-all font-bold cursor-pointer"
                                >
                                    {editingMentor ? "Save Changes" : "Create Mentor"}
                                </LoadingButton>
                            </div>
                        </form>
                    </Dialog>
                )}

                {/* ── Add / Edit Subject Modal Popup (Structured Input Table & Quick Paste) ── */}
                {showSubjectModal && (
                    <Dialog
                        open={true}
                        onOpenChange={(next) => { if (!next) setShowSubjectModal(false); }}
                        ariaLabel="Subject"
                        overlayClassName="bg-gray-900/50 backdrop-blur-sm p-4"
                        panelClassName={`overflow-hidden animate-slideUp transition-all rounded-2xl ${editingSubject ? "max-w-md" : "max-w-4xl"} p-0 space-y-0 max-h-[90vh]`}
                    >
                        {/* Modal Header */}
                        <div className="flex justify-between items-center px-6 py-4 border-b border-gray-100 bg-gray-50/80">
                            <div className="flex items-center gap-3">
                                <div className="p-2.5 rounded-xl bg-indigo-50 text-indigo-600 border border-indigo-100">
                                    <GraduationCap className="h-5 w-5" />
                                </div>
                                <div>
                                    <h3 className="font-extrabold text-gray-900 text-base">
                                        {editingSubject ? "Edit Subject Details" : "Add Subjects to Curriculum"}
                                    </h3>
                                    <p className="text-xs text-gray-500 font-medium mt-0.5">
                                        {editingSubject ? "Update subject configuration and details" : "Configure and create multiple subjects with structured inputs"}
                                    </p>
                                </div>
                            </div>

                            <div className="flex items-center gap-2">
                                {!editingSubject && (
                                    <div className="bg-gray-200/80 p-0.5 rounded-xl flex items-center gap-0.5 text-xs font-bold">
                                        <button
                                            type="button"
                                            onClick={() => setSubjectModalTab("bulk")}
                                            className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer flex items-center gap-1.5 ${subjectModalTab === "bulk"
                                                ? "bg-white text-indigo-600 shadow-xs font-black"
                                                : "text-gray-600 hover:text-gray-900"
                                                }`}
                                        >
                                            <Grid className="h-3.5 w-3.5" />
                                            <span>Structured / Bulk</span>
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setSubjectModalTab("single")}
                                            className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer flex items-center gap-1.5 ${subjectModalTab === "single"
                                                ? "bg-white text-indigo-600 shadow-xs font-black"
                                                : "text-gray-600 hover:text-gray-900"
                                                }`}
                                        >
                                            <Edit2 className="h-3.5 w-3.5" />
                                            <span>Single Subject</span>
                                        </button>
                                    </div>
                                )}
                                <Button variant="ghost" size="icon" aria-label="Close subject dialog" onClick={() => setShowSubjectModal(false)} className="h-auto w-auto p-2 hover:bg-gray-200 rounded-xl transition-colors cursor-pointer text-gray-400 hover:text-gray-700 ml-1">
                                    <X className="h-5 w-5" />
                                </Button>
                            </div>
                        </div>

                        <form onSubmit={handleSubjectSubmit} className="p-6 space-y-5 text-xs font-semibold max-h-[82vh] flex flex-col overflow-hidden">
                            {modalError && (
                                <div role="alert" className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 font-bold flex items-center gap-2 shrink-0">
                                    <ShieldAlert className="h-4 w-4 shrink-0" />
                                    {modalError}
                                </div>
                            )}

                            {/* ═════════ STRUCTURED BULK MODE ═════════ */}
                            {!editingSubject && subjectModalTab === "bulk" && (() => {
                                const validSubjectsCount = dynamicSubjects.filter(s => s.name && s.name.trim() !== "").length;

                                return (
                                    <div className="space-y-4 flex-1 overflow-y-auto pr-1">
                                        {/* Top Scope Card (Course, Campus, Year, Semester, Mentor Group) */}
                                        <div className="p-4 bg-gray-50/90 border border-gray-200 rounded-xl space-y-3 shrink-0">
                                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                                                <div className="space-y-1">
                                                    <label className="text-[10px] text-gray-500 uppercase tracking-wider block font-bold">Course / Department *</label>
                                                    <Select
                                                        aria-label="Course / Department"
                                                        required
                                                        disabled={lockDeptAndYear}
                                                        value={subjectForm.department}
                                                        onChange={(e) => setSubjectForm({ ...subjectForm, department: e.target.value })}
                                                        className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2 font-bold focus:outline-none focus:ring-1 focus:ring-indigo-600 cursor-pointer text-gray-800 disabled:opacity-60"
                                                    >
                                                        <option value="">— Select Course —</option>
                                                        {coursesList.map(dept => (
                                                            <option key={dept.id} value={dept.name}>{dept.name}</option>
                                                        ))}
                                                    </Select>
                                                </div>

                                                <div className="space-y-1">
                                                    <label className="text-[10px] text-gray-500 uppercase tracking-wider block font-bold">Target Campus *</label>
                                                    <Select
                                                        aria-label="Target Campus"
                                                        required
                                                        value={subjectForm.college_id}
                                                        onChange={(e) => setSubjectForm({ ...subjectForm, college_id: e.target.value })}
                                                        className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2 font-bold focus:outline-none focus:ring-1 focus:ring-indigo-600 cursor-pointer text-gray-800"
                                                    >
                                                        <option value="">— Select Campus —</option>
                                                        {colleges.map(c => (
                                                            <option key={c.id} value={c.id}>{c.name}</option>
                                                        ))}
                                                    </Select>
                                                </div>

                                                <div className="space-y-1">
                                                    <label className="text-[10px] text-gray-500 uppercase tracking-wider block font-bold">Academic Year *</label>
                                                    <Select
                                                        aria-label="Academic Year"
                                                        required
                                                        disabled={lockDeptAndYear}
                                                        value={subjectForm.year}
                                                        onChange={(e) => {
                                                            const newYear = e.target.value;
                                                            let newSem = "Semester 1";
                                                            if (newYear === "Year 2") newSem = "Semester 3";
                                                            else if (newYear === "Year 3") newSem = "Semester 5";
                                                            else if (newYear === "Year 4") newSem = "Semester 7";
                                                            setSubjectForm({ ...subjectForm, year: newYear, semester: newSem });
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
                                                        value={subjectForm.semester}
                                                        onChange={(e) => setSubjectForm({ ...subjectForm, semester: e.target.value })}
                                                        className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2 font-bold focus:outline-none focus:ring-1 focus:ring-indigo-600 cursor-pointer text-gray-800"
                                                    >
                                                        {subjectForm.year === "Year 1" && (
                                                            <>
                                                                <option value="Semester 1">Semester 1</option>
                                                                <option value="Semester 2">Semester 2</option>
                                                            </>
                                                        )}
                                                        {subjectForm.year === "Year 2" && (
                                                            <>
                                                                <option value="Semester 3">Semester 3</option>
                                                                <option value="Semester 4">Semester 4</option>
                                                            </>
                                                        )}
                                                        {subjectForm.year === "Year 3" && (
                                                            <>
                                                                <option value="Semester 5">Semester 5</option>
                                                                <option value="Semester 6">Semester 6</option>
                                                            </>
                                                        )}
                                                        {subjectForm.year === "Year 4" && (
                                                            <>
                                                                <option value="Semester 7">Semester 7</option>
                                                                <option value="Semester 8">Semester 8</option>
                                                            </>
                                                        )}
                                                    </Select>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Vercel-style Direct Multi-Line Paste Tip Banner */}
                                        <div className="p-3 bg-indigo-50/60 border border-indigo-200 rounded-xl flex items-center justify-between gap-3">
                                            <div className="flex items-center gap-2.5 min-w-0">
                                                <div className="p-1.5 rounded-lg bg-indigo-100/80 text-indigo-700 shrink-0">
                                                    <Sparkles className="h-4 w-4" />
                                                </div>
                                                <div className="text-xs text-indigo-950 font-semibold leading-tight">
                                                    <span className="font-bold text-indigo-900">Direct Smart Paste: </span>
                                                    Copy multiple subject rows from Excel or syllabus and paste directly (<kbd className="px-1.5 py-0.5 bg-white border border-indigo-200 rounded text-[10px] font-mono text-indigo-800 font-bold shadow-2xs">Ctrl+V</kbd>) into any Subject Name box below.
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2 shrink-0">
                                                <span className="text-[10px] text-gray-500 font-bold">Default Domain:</span>
                                                <Select aria-label="Default domain"
                                                    value={bulkDefaultType}
                                                    onChange={(e) => setBulkDefaultType(e.target.value)}
                                                    className="bg-white border border-indigo-200 rounded-lg px-2 py-1 font-bold text-[11px] text-indigo-900 focus:outline-none cursor-pointer"
                                                >
                                                    <option value="SKILL">SKILL</option>
                                                    <option value="ACADEMIC">ACADEMIC</option>
                                                    <option value="LAB">LAB</option>
                                                    <option value="GENERAL">GENERAL</option>
                                                </Select>
                                            </div>
                                        </div>

                                        {/* Structured Subject Rows Table (with Headers, Individual Input Boxes & Action Buttons on the Right) */}
                                        <div className="space-y-2">
                                            <div className="flex items-center justify-between px-1">
                                                <div className="flex items-center gap-2">
                                                    <h4 className="font-extrabold text-gray-900 text-xs uppercase tracking-wider">
                                                        Subject Entry Rows
                                                    </h4>
                                                    <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-indigo-50 text-indigo-700 border border-indigo-200">
                                                        {validSubjectsCount} {validSubjectsCount === 1 ? "Subject" : "Subjects"} Configured
                                                    </span>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <Button variant="link" size="sm"
                                                        type="button"
                                                        onClick={() => setDynamicSubjects([])}
                                                        className="h-auto px-0 text-[11px] font-bold text-gray-400 hover:text-rose-600 transition-colors cursor-pointer"
                                                    >
                                                        Clear All
                                                    </Button>
                                                    <Button variant="ghost"
                                                        type="button"
                                                        onClick={handleAddDynamicSubjectRow}
                                                        className="h-auto px-3 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg text-xs font-extrabold border border-indigo-200 transition-all flex items-center gap-1 cursor-pointer"
                                                    >
                                                        <Plus className="h-3.5 w-3.5" />
                                                        <span>Add Row</span>
                                                    </Button>
                                                </div>
                                            </div>

                                            {/* Column Header Bar */}
                                            <div className="grid grid-cols-12 gap-2.5 px-3 py-2 bg-gray-100/80 rounded-xl border border-gray-200 text-[10.5px] font-extrabold text-gray-600 uppercase tracking-wider items-center">
                                                <div className="col-span-1 text-center font-mono">#</div>
                                                <div className="col-span-5">Subject Name * (Paste Here)</div>
                                                <div className="col-span-3">Domain / Type</div>
                                                <div className="col-span-2 text-center">Weekly Hrs</div>
                                                <div className="col-span-1 text-center">Actions</div>
                                            </div>

                                            {/* Dynamic Input Rows */}
                                            <div className="space-y-2 max-h-[280px] overflow-y-auto pr-0.5">
                                                {dynamicSubjects.length === 0 ? (
                                                    <div className="p-8 text-center bg-gray-50 border border-dashed border-gray-200 rounded-xl space-y-2">
                                                        <p className="text-xs font-bold text-gray-500">No subject rows added yet.</p>
                                                        <Button variant="ghost"
                                                            type="button"
                                                            onClick={handleAddDynamicSubjectRow}
                                                            className="h-auto px-4 py-1.5 bg-indigo-600 text-white rounded-xl text-xs font-bold shadow-xs hover:bg-indigo-700 cursor-pointer"
                                                        >
                                                            + Add First Subject
                                                        </Button>
                                                    </div>
                                                ) : (
                                                    dynamicSubjects.map((row, idx) => (
                                                        <div
                                                            key={row.id}
                                                            className={`grid grid-cols-12 gap-2.5 p-2 rounded-xl border transition-all items-center ${row.name.trim()
                                                                ? "bg-white border-gray-200 hover:border-indigo-300 shadow-2xs"
                                                                : "bg-amber-50/30 border-amber-200/80"
                                                                }`}
                                                        >
                                                            {/* Row Index */}
                                                            <div className="col-span-1 flex items-center justify-center">
                                                                <span className="w-6 h-6 rounded-lg bg-gray-100 text-gray-600 font-mono text-[11px] font-extrabold flex items-center justify-center border border-gray-200">
                                                                    {idx + 1}
                                                                </span>
                                                            </div>

                                                            {/* Subject Name Input Box with Direct Vercel-style Paste */}
                                                            <div className="col-span-5">
                                                                <Input
                                                                    type="text"
                                                                    required
                                                                    placeholder="e.g. Data Structures (or paste Excel list)"
                                                                    value={row.name}
                                                                    onPaste={(e) => handlePasteIntoRow(e, row.id)}
                                                                    onChange={(e) => handleUpdateDynamicSubject(row.id, "name", e.target.value)}
                                                                    className="w-full bg-gray-50/60 focus:bg-white border border-gray-200 focus:border-indigo-500 rounded-lg px-3 py-1.5 text-xs font-bold text-gray-900 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                                                />
                                                            </div>

                                                            {/* Subject Domain / Type Dropdown */}
                                                            <div className="col-span-3">
                                                                <Select aria-label="Subject domain"
                                                                    value={normalizeSubjectType(row.type)}
                                                                    onChange={(e) => handleUpdateDynamicSubject(row.id, "type", e.target.value)}
                                                                    className="w-full bg-gray-50/60 focus:bg-white border border-gray-200 focus:border-indigo-500 rounded-lg px-2.5 py-1.5 text-xs font-bold text-gray-800 focus:outline-none cursor-pointer"
                                                                >
                                                                    <option value="SKILL">SKILL (Practical)</option>
                                                                    <option value="ACADEMIC">ACADEMIC (Theory)</option>
                                                                    <option value="LAB">LAB (Laboratory)</option>
                                                                    <option value="GENERAL">GENERAL (Elective)</option>
                                                                </Select>
                                                            </div>

                                                            {/* Weekly Hours Stepper Box */}
                                                            <div className="col-span-2">
                                                                <Input aria-label="Weekly hours"
                                                                    type="number"
                                                                    min={1}
                                                                    max={20}
                                                                    value={row.weekly_hours}
                                                                    onChange={(e) => handleUpdateDynamicSubject(row.id, "weekly_hours", parseInt(e.target.value) || 4)}
                                                                    className="w-full bg-gray-50/60 focus:bg-white border border-gray-200 focus:border-indigo-500 rounded-lg px-2 py-1.5 text-xs font-bold text-gray-900 text-center focus:outline-none"
                                                                />
                                                            </div>

                                                            {/* Actions on the Right (Edit & Delete) */}
                                                            <div className="col-span-1 flex items-center justify-center gap-1">
                                                                <Button variant="ghost" size="icon"
                                                                    type="button"
                                                                    title="Edit / Select Row"
                                                                    onClick={() => handleUpdateDynamicSubject(row.id, "isEditing", !row.isEditing)}
                                                                    className="h-auto w-auto p-1.5 rounded-lg text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors cursor-pointer"
                                                                >
                                                                    <Edit className="h-3.5 w-3.5" />
                                                                </Button>
                                                                <Button variant="ghost" size="icon"
                                                                    type="button"
                                                                    title="Delete this row"
                                                                    onClick={() => handleDeleteDynamicSubject(row.id)}
                                                                    className="h-auto w-auto p-1.5 rounded-lg text-gray-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                                                                >
                                                                    <Trash2 className="h-3.5 w-3.5" />
                                                                </Button>
                                                            </div>
                                                        </div>
                                                    ))
                                                )}
                                            </div>

                                            {/* Bottom Add Row Bar */}
                                            <button
                                                type="button"
                                                onClick={handleAddDynamicSubjectRow}
                                                className="w-full py-2 border-2 border-dashed border-gray-200 hover:border-indigo-400 hover:bg-indigo-50/30 rounded-xl text-gray-500 hover:text-indigo-700 text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer mt-2"
                                            >
                                                <Plus className="h-4 w-4" />
                                                <span>Add Another Subject Row</span>
                                            </button>
                                        </div>
                                    </div>
                                );
                            })()}

                            {/* ═════════ SINGLE SUBJECT MODE / EDIT MODE ═════════ */}
                            {(editingSubject || subjectModalTab === "single") && (
                                <div className={editingSubject ? "space-y-3" : "grid grid-cols-1 md:grid-cols-2 gap-6"}>
                                    <div className="space-y-3">
                                        <div className="space-y-1">
                                            <label className="text-[10px] text-gray-400 uppercase tracking-wider block font-bold">Subject Name *</label>
                                            <Input
                                                aria-label="Subject Name"
                                                type="text"
                                                required
                                                placeholder="e.g. Modern Natural Language Processing"
                                                value={subjectForm.name}
                                                onChange={(e) => setSubjectForm({ ...subjectForm, name: e.target.value })}
                                                className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 font-bold focus:outline-none focus:ring-1 focus:ring-indigo-600 text-gray-800"
                                            />
                                        </div>

                                        <div className="grid grid-cols-2 gap-3">
                                            <div className="space-y-1">
                                                <label className="text-[10px] text-gray-400 uppercase tracking-wider block font-bold">Course Name</label>
                                                <Select
                                                    aria-label="Course Name"
                                                    required
                                                    disabled={lockDeptAndYear}
                                                    value={subjectForm.department}
                                                    onChange={(e) => setSubjectForm({ ...subjectForm, department: e.target.value })}
                                                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 font-bold focus:outline-none focus:ring-1 focus:ring-indigo-600 cursor-pointer text-gray-800 disabled:opacity-60 disabled:cursor-not-allowed"
                                                >
                                                    <option value="">— Select Course —</option>
                                                    {coursesList.map(dept => (
                                                        <option key={dept.id} value={dept.name}>{dept.name}</option>
                                                    ))}
                                                </Select>
                                            </div>

                                            <div className="space-y-1">
                                                <label className="text-[10px] text-gray-400 uppercase tracking-wider block font-bold">Assigned Campus</label>
                                                <Select
                                                    aria-label="Assigned Campus"
                                                    required
                                                    value={subjectForm.college_id}
                                                    onChange={(e) => setSubjectForm({ ...subjectForm, college_id: e.target.value })}
                                                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 font-bold focus:outline-none focus:ring-1 focus:ring-indigo-600 cursor-pointer text-gray-800"
                                                >
                                                    <option value="">— Campus —</option>
                                                    {colleges.map(c => (
                                                        <option key={c.id} value={c.id}>{c.name}</option>
                                                    ))}
                                                </Select>
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-2 gap-3">
                                            <div className="space-y-1">
                                                <label className="text-[10px] text-gray-400 uppercase tracking-wider block font-bold">Academic Year</label>
                                                <Select
                                                    aria-label="Academic Year"
                                                    required
                                                    disabled={lockDeptAndYear}
                                                    value={subjectForm.year}
                                                    onChange={(e) => {
                                                        const newYear = e.target.value;
                                                        let newSem = "Semester 1";
                                                        if (newYear === "Year 2") newSem = "Semester 3";
                                                        else if (newYear === "Year 3") newSem = "Semester 5";
                                                        else if (newYear === "Year 4") newSem = "Semester 7";
                                                        setSubjectForm({ ...subjectForm, year: newYear, semester: newSem });
                                                    }}
                                                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 font-bold focus:outline-none focus:ring-1 focus:ring-indigo-600 cursor-pointer text-gray-800 disabled:opacity-60 disabled:cursor-not-allowed"
                                                >
                                                    <option value="Year 1">Year 1</option>
                                                    <option value="Year 2">Year 2</option>
                                                    <option value="Year 3">Year 3</option>
                                                    <option value="Year 4">Year 4</option>
                                                </Select>
                                            </div>

                                            <div className="space-y-1">
                                                <label className="text-[10px] text-gray-400 uppercase tracking-wider block font-bold">Semester</label>
                                                <Select
                                                    aria-label="Semester"
                                                    required
                                                    value={subjectForm.semester}
                                                    onChange={(e) => setSubjectForm({ ...subjectForm, semester: e.target.value })}
                                                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 font-bold focus:outline-none focus:ring-1 focus:ring-indigo-600 cursor-pointer text-gray-800"
                                                >
                                                    {subjectForm.year === "Year 1" && (
                                                        <>
                                                            <option value="Semester 1">Semester 1</option>
                                                            <option value="Semester 2">Semester 2</option>
                                                        </>
                                                    )}
                                                    {subjectForm.year === "Year 2" && (
                                                        <>
                                                            <option value="Semester 3">Semester 3</option>
                                                            <option value="Semester 4">Semester 4</option>
                                                        </>
                                                    )}
                                                    {subjectForm.year === "Year 3" && (
                                                        <>
                                                            <option value="Semester 5">Semester 5</option>
                                                            <option value="Semester 6">Semester 6</option>
                                                        </>
                                                    )}
                                                    {subjectForm.year === "Year 4" && (
                                                        <>
                                                            <option value="Semester 7">Semester 7</option>
                                                            <option value="Semester 8">Semester 8</option>
                                                        </>
                                                    )}
                                                </Select>
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-2 gap-3">
                                            <div className="space-y-1">
                                                <label className="text-[10px] text-gray-400 uppercase tracking-wider block font-bold">Subject Type / Domain</label>
                                                <Select
                                                    aria-label="Subject Type / Domain"
                                                    required
                                                    value={normalizeSubjectType(subjectForm.type)}
                                                    onChange={(e) => setSubjectForm({ ...subjectForm, type: e.target.value })}
                                                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 font-bold focus:outline-none focus:ring-1 focus:ring-indigo-600 cursor-pointer text-gray-800"
                                                >
                                                    <option value="SKILL">SKILL (Practical Training)</option>
                                                    <option value="ACADEMIC">ACADEMIC (Core Theory)</option>
                                                    <option value="LAB">LAB (Practical Laboratory)</option>
                                                    <option value="GENERAL">GENERAL (Elective / Foundational)</option>
                                                </Select>
                                            </div>

                                            <div className="space-y-1">
                                                <label className="text-[10px] text-gray-400 uppercase tracking-wider block font-bold">Weekly Hours</label>
                                                <Input
                                                    aria-label="Weekly Hours"
                                                    type="number"
                                                    required
                                                    min={1}
                                                    max={20}
                                                    placeholder="e.g. 4"
                                                    value={subjectForm.weekly_hours}
                                                    onChange={(e) => setSubjectForm({ ...subjectForm, weekly_hours: parseInt(e.target.value) || 4 })}
                                                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3.5 py-2 font-bold focus:outline-none focus:ring-1 focus:ring-[#D528A2] text-gray-800"
                                                />
                                            </div>
                                        </div>

                                        <div className="space-y-1">
                                            <label className="text-[10px] text-gray-400 uppercase tracking-wider block font-bold">Mentor Group</label>
                                            <Select
                                                aria-label="Mentor Group"
                                                required
                                                value={subjectForm.mentor_group}
                                                onChange={(e) => setSubjectForm({ ...subjectForm, mentor_group: e.target.value })}
                                                className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 font-bold focus:outline-none focus:ring-1 focus:ring-indigo-600 cursor-pointer text-gray-800"
                                            >
                                                {subjectGroups.map(sg => (
                                                    <option key={sg.id} value={sg.name}>{sg.name}</option>
                                                ))}
                                            </Select>
                                        </div>
                                    </div>

                                    {!editingSubject && (() => {
                                        const campusMentors = mentors.filter(m => m.college_id === subjectForm.college_id);
                                        if (campusMentors.length === 0) {
                                            return (
                                                <div className="flex flex-col items-center justify-center p-8 bg-gray-50 border border-dashed border-gray-200 rounded-xl h-full text-center">
                                                    <Users className="h-8 w-8 text-gray-300 mb-2" />
                                                    <span className="text-[11px] text-gray-400 font-bold">No Staff on Selected Campus</span>
                                                    <span className="text-[9px] text-gray-400 mt-0.5">You can link staff to this subject later.</span>
                                                </div>
                                            );
                                        }
                                        const filteredMentors = campusMentors.filter(m =>
                                            !subjectStaffSearch ||
                                            (m.name || "").toLowerCase().includes(subjectStaffSearch.toLowerCase()) ||
                                            (m.department || "").toLowerCase().includes(subjectStaffSearch.toLowerCase())
                                        );
                                        return (
                                            <div className="flex flex-col h-full space-y-2">
                                                <div className="flex justify-between items-center">
                                                    <label className="text-[10px] text-gray-400 uppercase tracking-wider block font-bold">
                                                        Assign Staff <span className="text-gray-300 font-normal normal-case">(optional)</span>
                                                    </label>
                                                    <span className="text-[9px] font-extrabold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full border border-indigo-100">
                                                        {subjectForm.mentorIds.length} Selected
                                                    </span>
                                                </div>

                                                {/* Staff Search Bar */}
                                                <div className="relative">
                                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
                                                    <Input
                                                        type="text"
                                                        placeholder="Search staff by name or dept..."
                                                        value={subjectStaffSearch}
                                                        onChange={(e) => setSubjectStaffSearch(e.target.value)}
                                                        className="w-full bg-gray-50 border border-gray-200 rounded-xl pl-8 pr-3 py-1.5 text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-indigo-600 text-gray-800"
                                                    />
                                                </div>

                                                <div className="flex-1 max-h-56 overflow-y-auto rounded-xl border border-gray-200 divide-y divide-gray-100 bg-gray-50">
                                                    {filteredMentors.length === 0 ? (
                                                        <div className="p-4 text-center text-gray-400 text-[11px] italic">
                                                            No staff match "{subjectStaffSearch}"
                                                        </div>
                                                    ) : (
                                                        filteredMentors.map(m => {
                                                            const checked = subjectForm.mentorIds.includes(m.id);
                                                            return (
                                                                <label
                                                                    key={m.id}
                                                                    className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-indigo-50/40 transition-colors"
                                                                >
                                                                    <input
                                                                        type="checkbox"
                                                                        checked={checked}
                                                                        onChange={() => {
                                                                            const next = checked
                                                                                ? subjectForm.mentorIds.filter(id => id !== m.id)
                                                                                : [...subjectForm.mentorIds, m.id];
                                                                            setSubjectForm({ ...subjectForm, mentorIds: next });
                                                                        }}
                                                                        className="h-3.5 w-3.5 rounded border-gray-300 text-indigo-600 cursor-pointer"
                                                                    />
                                                                    <div className="min-w-0 flex-1">
                                                                        <div className="font-bold text-gray-800 truncate text-xs">{m.name}</div>
                                                                        {(m.mentor_group) && <div className="text-[9px] text-gray-400 truncate">{m.mentor_group}</div>}
                                                                    </div>
                                                                    {checked && (
                                                                        <span className="text-[9px] font-extrabold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                                                                            Assigned
                                                                        </span>
                                                                    )}
                                                                </label>
                                                            );
                                                        })
                                                    )}
                                                </div>
                                                {subjectForm.mentorIds.length > 0 && (
                                                    <p className="text-[10px] text-indigo-600 font-semibold leading-none pt-1">
                                                        {subjectForm.mentorIds.length} mentor{subjectForm.mentorIds.length > 1 ? "s" : ""} will be linked.
                                                    </p>
                                                )}
                                            </div>
                                        );
                                    })()}
                                </div>
                            )}

                            {/* Footer Buttons */}
                            <div className="flex justify-between items-center pt-4 border-t border-gray-100 shrink-0">
                                {!editingSubject && subjectModalTab === "bulk" && (
                                    <div className="text-xs text-gray-500 font-medium">
                                        Creating into <strong className="text-gray-900">{subjectForm.department || "Selected Course"}</strong> → <strong className="text-indigo-600">{subjectForm.semester}</strong>
                                    </div>
                                )}
                                {(!(!editingSubject && subjectModalTab === "bulk")) && <div />}

                                <div className="flex items-center gap-2">
                                    <Button variant="ghost"
                                        type="button"
                                        onClick={() => setShowSubjectModal(false)}
                                        className="h-auto px-4 py-2 hover:bg-gray-100 text-gray-600 rounded-xl transition-all font-bold cursor-pointer"
                                    >
                                        Cancel
                                    </Button>
                                    <Button variant="ghost"
                                        type="submit"
                                        disabled={modalBusy}
                                        className="h-auto btn-gradient px-6 py-2 text-white rounded-xl shadow-sm transition-all font-extrabold cursor-pointer disabled:opacity-60"
                                    >
                                        {modalBusy
                                            ? "Saving..."
                                            : editingSubject
                                                ? "Save Changes"
                                                : subjectModalTab === "bulk"
                                                    ? `Create ${dynamicSubjects.filter(s => s.name && s.name.trim() !== "").length} Subjects`
                                                    : "Create Subject"}
                                    </Button>
                                </div>
                            </div>
                        </form>
                    </Dialog>
                )}

                {/* ── Course Modal ── */}
                {showDeptModal && (
                    <CourseModal
                        isOpen={showDeptModal}
                        onClose={() => setShowDeptModal(false)}
                        editingCourse={editingDept ? (deptForm as Department) : null}
                        defaultCollegeId={deptForm.college_id || colleges[0]?.id || ""}
                        allowCollegeSelect={true}
                        onToast={toast}
                        onSaved={() => {
                            setShowDeptModal(false);
                        }}
                    />
                )}

                {/* ── Mentor Group Modal ── */}
                {showGroupModal && (
                    <Dialog
                        open={true}
                        onOpenChange={(next) => { if (!next) setShowGroupModal(false); }}
                        ariaLabel="Mentor Group"
                        overlayClassName="bg-slate-900/60 backdrop-blur-xs p-4 animate-fadeIn"
                        panelClassName="dark:bg-slate-900 p-6 max-w-lg animate-scaleUp space-y-4 max-h-[85vh] flex flex-col"
                    >

                        <Button variant="ghost" size="icon"
                            aria-label="Close mentor group dialog"
                            onClick={() => setShowGroupModal(false)}
                            className="h-auto w-auto absolute right-4 top-4 p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl text-slate-400 hover:text-slate-800 dark:hover:text-white transition-colors cursor-pointer"
                        >
                            <X className="h-5 w-5" />
                        </Button>

                        {/* Modal Header */}
                        <div className="flex items-center gap-2 border-b border-slate-100 dark:border-slate-800 pb-3 shrink-0">
                            <Layers className="h-5 w-5 text-indigo-600" />
                            <div>
                                <h3 className="text-sm font-black uppercase text-slate-800 dark:text-white tracking-wider">
                                    {editingGroup ? "Edit Mentor Group / Domain" : "Create Mentor Group / Domain"}
                                </h3>
                                <p className="text-[10px] text-slate-400 font-bold uppercase mt-0.5">
                                    Configure group domain, assign lead sme, and map faculty mentors
                                </p>
                            </div>
                        </div>

                        {/* Scrollable Form Body */}
                        <form onSubmit={handleGroupSubmit} className="flex-1 flex flex-col overflow-hidden text-xs space-y-4">
                            <div className="flex-1 overflow-y-auto pr-1 space-y-4">
                                {modalError && (
                                    <div role="alert" className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 rounded-xl text-rose-700 dark:text-rose-300 font-bold flex items-center gap-1.5 text-xs">
                                        <ShieldAlert className="h-4 w-4 shrink-0" />
                                        {modalError}
                                    </div>
                                )}

                                <div className="space-y-1">
                                    <label className="text-[10px] font-black uppercase text-slate-500 block">Mentor Group Name *</label>
                                    <Input
                                        aria-label="Mentor Group Name"
                                        type="text"
                                        required
                                        placeholder="e.g. Computer Science, Management, Mathematics, English"
                                        value={groupForm.name}
                                        onChange={(e) => setGroupForm({ ...groupForm, name: e.target.value })}
                                        className="w-full text-xs font-bold p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                    />
                                </div>

                                <div className="space-y-1">
                                    <label className="text-[10px] font-black uppercase text-slate-500 block">Assigned Lead / Head SME</label>
                                    <Select
                                        aria-label="Assigned Lead / Head SME"
                                        value={groupForm.lead_sme_id}
                                        onChange={(e) => setGroupForm({ ...groupForm, lead_sme_id: e.target.value })}
                                        className="w-full text-xs font-bold p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                                    >
                                        <option value="">Select Lead SME (Optional)...</option>
                                        {smes.map(sme => (
                                            <option key={sme.id} value={sme.id}>
                                                {sme.name} ({sme.subject || "General"})
                                            </option>
                                        ))}
                                    </Select>
                                </div>

                                <div className="space-y-1">
                                    <label className="text-[10px] font-black uppercase text-slate-500 block">Description</label>
                                    <Textarea
                                        aria-label="Description"
                                        rows={2}
                                        placeholder="Provide a brief description for this mentor group domain..."
                                        value={groupForm.description}
                                        onChange={(e) => setGroupForm({ ...groupForm, description: e.target.value })}
                                        className="w-full text-xs font-medium p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                                    />
                                </div>

                                {/* Map Faculty Mentors checklist */}
                                <div className="space-y-2">
                                    <div className="flex justify-between items-center">
                                        <label className="text-[10px] font-black uppercase text-slate-500 block">Map Faculty Mentors to Group</label>
                                        <span className="text-[9px] font-extrabold text-indigo-600 bg-indigo-50 dark:bg-indigo-950/50 px-2 py-0.5 rounded-full border border-indigo-100 dark:border-indigo-800">
                                            {groupForm.mentorIds.length} Mentors Mapped
                                        </span>
                                    </div>

                                    <div className="relative">
                                        <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
                                        <Input
                                            type="text"
                                            aria-label="Search faculty mentors"
                                            placeholder="Search faculty mentors by name, email, or college..."
                                            value={groupMentorSearch}
                                            onChange={(e) => setGroupMentorSearch(e.target.value)}
                                            className="w-full text-xs font-bold pl-9 pr-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                        />
                                    </div>

                                    <div className="border border-slate-100 dark:border-slate-800 rounded-xl bg-slate-50 dark:bg-slate-900/50 p-3 max-h-48 overflow-y-auto space-y-2 text-xs font-semibold">
                                        {(() => {
                                            const searchedMentors = (mentors || []).filter(m => {
                                                const cName = (colleges.find(c => c.id === m.college_id)?.name || "").toLowerCase();
                                                const query = groupMentorSearch.toLowerCase();
                                                return (
                                                    (m.name || "").toLowerCase().includes(query) ||
                                                    (m.email || "").toLowerCase().includes(query) ||
                                                    (m.mentor_group || "").toLowerCase().includes(query) ||
                                                    cName.includes(query)
                                                );
                                            });

                                            return (
                                                <>
                                                    {searchedMentors.map(m => {
                                                        const isChecked = groupForm.mentorIds.includes(m.id);
                                                        const mentorCollegeName = colleges.find(c => c.id === m.college_id)?.name || "";
                                                        return (
                                                            <label key={m.id} className="flex items-start gap-2.5 p-2 bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 hover:border-indigo-300 cursor-pointer transition-all text-slate-700 dark:text-slate-200 shadow-card">
                                                                <input
                                                                    type="checkbox"
                                                                    checked={isChecked}
                                                                    onChange={(e) => {
                                                                        let next;
                                                                        if (e.target.checked) {
                                                                            next = [...groupForm.mentorIds, m.id];
                                                                        } else {
                                                                            next = groupForm.mentorIds.filter(id => id !== m.id);
                                                                        }
                                                                        setGroupForm({ ...groupForm, mentorIds: next });
                                                                    }}
                                                                    className="rounded text-indigo-600 focus:ring-indigo-500 h-4 w-4 cursor-pointer mt-0.5 shrink-0"
                                                                />
                                                                <div className="leading-tight flex-1 min-w-0">
                                                                    <div className="flex items-center justify-between gap-1 flex-wrap">
                                                                        <span className="font-black text-slate-800 dark:text-white truncate">{m.name}</span>
                                                                        {mentorCollegeName && (
                                                                            <span className="text-[8.5px] font-black px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300 border border-indigo-100 dark:border-indigo-800 shrink-0">
                                                                                {mentorCollegeName}
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                    <span className="text-[9.5px] text-slate-400 font-normal block truncate mt-0.5">{m.email}</span>
                                                                    <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                                                                        {m.mentor_group ? (
                                                                            <span className={`text-[8.5px] px-1.5 py-0.5 rounded font-black ${(m.mentor_group || "").trim().toLowerCase() === (editingGroup?.name || "").trim().toLowerCase()
                                                                                ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800"
                                                                                : "bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-200 dark:border-amber-800"
                                                                                }`}>
                                                                                Group: {m.mentor_group}
                                                                            </span>
                                                                        ) : (
                                                                            <span className="text-[8.5px] px-1.5 py-0.5 rounded font-semibold text-slate-400 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                                                                                Unassigned
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            </label>
                                                        );
                                                    })}
                                                    {searchedMentors.length === 0 && (
                                                        <div className="text-center text-slate-400 italic py-3 text-[10px]">
                                                            No mentors found matching "{groupMentorSearch}".
                                                        </div>
                                                    )}
                                                </>
                                            );
                                        })()}
                                    </div>
                                </div>
                            </div>

                            {/* Footer Action Buttons */}
                            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800 shrink-0">
                                <Button variant="ghost"
                                    type="button"
                                    onClick={() => setShowGroupModal(false)}
                                    className="h-auto px-4 py-2 border border-slate-200 text-slate-600 rounded-xl text-xs font-bold hover:bg-slate-50 cursor-pointer"
                                >
                                    Cancel
                                </Button>
                                <Button variant="ghost"
                                    type="submit"
                                    disabled={modalBusy}
                                    className="h-auto px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-sm transition-colors cursor-pointer disabled:opacity-60"
                                >
                                    {modalBusy ? "Saving..." : editingGroup ? "Save Mentor Group" : "Create Mentor Group"}
                                </Button>
                            </div>
                        </form>

                    </Dialog>
                )}

                {/* ── Compose Announcement Modal ── */}
                {showAnnModal && (
                    <Dialog
                        open={true}
                        onOpenChange={(next) => { if (!next) setShowAnnModal(false); }}
                        ariaLabel="Compose Campus Announcement"
                        overlayClassName="p-4 bg-gray-900/50 backdrop-blur-sm"
                        panelClassName="max-w-md overflow-hidden animate-slideUp p-0 space-y-0 max-h-[90vh]"
                    >
                        <div className="flex justify-between items-center p-6 border-b border-gray-100 bg-gray-50">
                            <h3 className="font-extrabold text-gray-900 text-sm flex items-center gap-1.5">
                                <Megaphone className="h-5 w-5 text-indigo-600" />
                                Compose Campus Announcement
                            </h3>
                            <Button variant="ghost" size="icon" aria-label="Close announcement dialog" onClick={() => setShowAnnModal(false)} className="h-auto w-auto p-1 hover:bg-gray-200 rounded-lg transition-colors cursor-pointer text-gray-500 hover:text-gray-800">
                                <X className="h-4 w-4" />
                            </Button>
                        </div>

                        <form onSubmit={handleComposeAnnouncement} className="p-6 space-y-4 text-xs font-semibold">
                            <div className="space-y-1">
                                <label className="text-[10px] text-gray-400 uppercase tracking-wider block">Title</label>
                                <Input
                                    aria-label="Title"
                                    type="text"
                                    required
                                    placeholder="e.g. End Semester Examinations Schedule"
                                    value={annForm.title}
                                    onChange={(e) => setAnnForm({ ...annForm, title: e.target.value })}
                                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3.5 py-2.5 font-bold focus:outline-none focus:ring-1 focus:ring-indigo-600"
                                />
                            </div>

                            <div className="space-y-1">
                                <label className="text-[10px] text-gray-400 uppercase tracking-wider block">Description</label>
                                <Textarea
                                    aria-label="Description"
                                    required
                                    placeholder="Compose notice content here..."
                                    value={annForm.description}
                                    onChange={(e) => setAnnForm({ ...annForm, description: e.target.value })}
                                    rows={4}
                                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3.5 py-2.5 font-semibold focus:outline-none focus:ring-1 focus:ring-indigo-600 text-gray-800 resize-none"
                                />
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                                <div className="space-y-1">
                                    <label className="text-[10px] text-gray-400 uppercase tracking-wider block">Target Role</label>
                                    <Select
                                        aria-label="Target Role"
                                        required
                                        value={annForm.target_role}
                                        onChange={(e) => setAnnForm({ ...annForm, target_role: e.target.value })}
                                        className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 font-bold focus:outline-none focus:ring-1 focus:ring-indigo-600 cursor-pointer"
                                    >
                                        <option value="All">All Roles</option>
                                        <option value="student">Students</option>
                                        <option value="mentor">Mentors</option>
                                        <option value="cm">Campus Managers</option>
                                    </Select>
                                </div>

                                <div className="space-y-1">
                                    <label className="text-[10px] text-gray-400 uppercase tracking-wider block">Target Campus</label>
                                    <Select
                                        aria-label="Target Campus"
                                        value={annForm.college_id}
                                        onChange={(e) => setAnnForm({ ...annForm, college_id: e.target.value })}
                                        className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 font-bold focus:outline-none focus:ring-1 focus:ring-indigo-600 cursor-pointer"
                                    >
                                        <option value="">All Campuses</option>
                                        {colleges.map(c => (
                                            <option key={c.id} value={c.id}>{c.name}</option>
                                        ))}
                                    </Select>
                                </div>
                            </div>

                            <div className="flex justify-end gap-2 pt-4 border-t border-gray-100">
                                <Button variant="ghost"
                                    type="button"
                                    onClick={() => setShowAnnModal(false)}
                                    className="h-auto px-4 py-2 hover:bg-gray-100 text-gray-500 rounded-xl transition-all font-bold cursor-pointer"
                                >
                                    Cancel
                                </Button>
                                <Button variant="ghost"
                                    type="submit"
                                    disabled={modalBusy}
                                    className="h-auto btn-gradient px-5 py-2 text-white rounded-xl shadow-sm transition-all font-bold cursor-pointer disabled:opacity-60"
                                >
                                    {modalBusy ? "Publishing..." : "Publish Notice"}
                                </Button>
                            </div>
                        </form>
                    </Dialog>
                )}

                {/* ── Schedule Holiday Modal ── */}
                {showHolModal && (
                    <Dialog
                        open={true}
                        onOpenChange={(next) => { if (!next) setShowHolModal(false); }}
                        ariaLabel="Schedule Campus Holiday"
                        overlayClassName="p-4 bg-gray-900/50 backdrop-blur-sm"
                        panelClassName="max-w-md overflow-hidden animate-slideUp p-0 space-y-0 max-h-[90vh]"
                    >
                        <div className="flex justify-between items-center p-6 border-b border-gray-100 bg-gray-50">
                            <h3 className="font-extrabold text-gray-900 text-sm flex items-center gap-1.5">
                                <Calendar className="h-5 w-5 text-indigo-600" />
                                Schedule Campus Holiday
                            </h3>
                            <Button variant="ghost" size="icon" aria-label="Close holiday dialog" onClick={() => setShowHolModal(false)} className="h-auto w-auto p-1 hover:bg-gray-200 rounded-lg transition-colors cursor-pointer text-gray-500 hover:text-gray-800">
                                <X className="h-4 w-4" />
                            </Button>
                        </div>

                        <form onSubmit={handleAddHoliday} className="p-6 space-y-4 text-xs font-semibold">
                            <div className="space-y-1">
                                <label className="text-[10px] text-gray-400 uppercase tracking-wider block">Holiday Title</label>
                                <Input
                                    aria-label="Holiday Title"
                                    type="text"
                                    required
                                    placeholder="e.g. Independence Day"
                                    value={holForm.title}
                                    onChange={(e) => setHolForm({ ...holForm, title: e.target.value })}
                                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3.5 py-2.5 font-bold focus:outline-none focus:ring-1 focus:ring-indigo-600"
                                />
                            </div>

                            <div className="space-y-1">
                                <label className="text-[10px] text-gray-400 uppercase tracking-wider block">Date</label>
                                <Input
                                    aria-label="Date"
                                    type="date"
                                    required
                                    value={holForm.date}
                                    onChange={(e) => setHolForm({ ...holForm, date: e.target.value })}
                                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3.5 py-2.5 font-bold focus:outline-none focus:ring-1 focus:ring-indigo-600 text-gray-800"
                                />
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                                <div className="space-y-1">
                                    <label className="text-[10px] text-gray-400 uppercase tracking-wider block">Holiday Type</label>
                                    <Select
                                        aria-label="Holiday Type"
                                        required
                                        value={holForm.type}
                                        onChange={(e) => setHolForm({ ...holForm, type: e.target.value })}
                                        className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 font-bold focus:outline-none focus:ring-1 focus:ring-indigo-600 cursor-pointer"
                                    >
                                        <option value="National Holiday">National Holiday</option>
                                        <option value="Regional Holiday">Regional Holiday</option>
                                        <option value="College Holiday">College Holiday</option>
                                        <option value="Declared Holiday">Declared Holiday</option>
                                    </Select>
                                </div>

                                <div className="space-y-1">
                                    <label className="text-[10px] text-gray-400 uppercase tracking-wider block">Campus scope</label>
                                    <Select
                                        aria-label="Campus scope"
                                        value={holForm.college_id}
                                        onChange={(e) => setHolForm({ ...holForm, college_id: e.target.value })}
                                        className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 font-bold focus:outline-none focus:ring-1 focus:ring-indigo-600 cursor-pointer"
                                    >
                                        <option value="">All Campuses</option>
                                        {colleges.map(c => (
                                            <option key={c.id} value={c.id}>{c.name}</option>
                                        ))}
                                    </Select>
                                </div>
                            </div>

                            <div className="flex justify-end gap-2 pt-4 border-t border-gray-100">
                                <Button variant="ghost"
                                    type="button"
                                    onClick={() => setShowHolModal(false)}
                                    className="h-auto px-4 py-2 hover:bg-gray-100 text-gray-500 rounded-xl transition-all font-bold cursor-pointer"
                                >
                                    Cancel
                                </Button>
                                <LoadingButton
                                    type="submit"
                                    isLoading={loadingActions['submit_holiday']}
                                    loadingText="Saving..."
                                    variant="gradient"
                                    className="px-5 py-2 text-white rounded-xl shadow-sm transition-all font-bold cursor-pointer"
                                >
                                    Save Holiday
                                </LoadingButton>
                            </div>
                        </form>
                    </Dialog>
                )}

            </main>

            {selectedProfileMentor && (
                <MentorProfileModal
                    mentor={selectedProfileMentor}
                    isOpen={isProfileOpen}
                    onClose={() => {
                        setIsProfileOpen(false);
                        setSelectedProfileMentor(null);
                    }}
                />
            )}
            {/* ── FACULTY BULK IMPORT PREVIEW MODAL ── */}
            {showFacultyImportModal && facultyImportPreview && (
                <Dialog
                    open={true}
                    onOpenChange={(next) => { if (!next) setShowFacultyImportModal(false); }}
                    ariaLabel="Faculty Bulk Import Preview"
                    overlayClassName="p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn"
                    panelClassName="max-w-4xl p-6 space-y-5 max-h-[90vh] flex flex-col"
                >
                    <div className="flex items-center justify-between border-b border-gray-100 pb-4">
                        <div className="flex items-center gap-3">
                            <div className="p-3 rounded-xl bg-indigo-50 text-indigo-600 border border-indigo-100">
                                <FileSpreadsheet className="h-6 w-6" />
                            </div>
                            <div>
                                <div className="flex items-center gap-2">
                                    <h3 className="text-base font-extrabold text-gray-900">Faculty Bulk Import Preview</h3>
                                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-indigo-50 text-indigo-700 border border-indigo-200">
                                        {colleges.find(c => c.id === templateCollegeId)?.name || "Target Campus"}
                                    </span>
                                </div>
                                <p className="text-xs text-gray-500 font-medium mt-0.5">
                                    Parsed {facultyImportPreview.parsed.length} faculty record(s) from spreadsheet
                                </p>
                            </div>
                        </div>
                        <Button variant="ghost" size="icon"
                            aria-label="Close faculty import dialog"
                            onClick={() => setShowFacultyImportModal(false)}
                            className="h-auto w-auto p-2 rounded-xl text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors cursor-pointer"
                        >
                            <X className="h-5 w-5" />
                        </Button>
                    </div>

                    {facultyImportPreview.warnings.length > 0 && (
                        <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs font-semibold space-y-1">
                            <div className="font-extrabold flex items-center gap-1.5">
                                <AlertTriangle className="h-4 w-4 text-amber-600" />
                                Validation Warnings ({facultyImportPreview.warnings.length}):
                            </div>
                            <ul className="list-disc list-inside text-[11px] space-y-0.5 max-h-24 overflow-y-auto">
                                {facultyImportPreview.warnings.map((w, idx) => (
                                    <li key={idx}>{w}</li>
                                ))}
                            </ul>
                        </div>
                    )}

                    <div className="flex-1 overflow-y-auto border border-gray-200 rounded-xl">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>#</TableHead>
                                    <TableHead>Faculty Name</TableHead>
                                    <TableHead>Email Address</TableHead>
                                    <TableHead>Department</TableHead>
                                    {isCampusShiftBased && <TableHead>Shift</TableHead>}
                                    <TableHead>Timetable Subjects</TableHead>
                                    <TableHead>Assigned Classes</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {facultyImportPreview.parsed.map((item, idx) => (
                                    <TableRow key={idx}>
                                        <TableCell className="text-gray-400 font-mono text-[10px]">{idx + 1}</TableCell>
                                        <TableCell className="font-bold text-gray-900">
                                            {item.name || <span className="text-rose-500 italic">Missing</span>}
                                        </TableCell>
                                        <TableCell className="font-mono text-[11px] text-gray-600">
                                            {item.email || <span className="text-rose-500 italic">Missing</span>}
                                        </TableCell>
                                        <TableCell>
                                            <Badge variant="secondary">{item.department}</Badge>
                                        </TableCell>
                                        {isCampusShiftBased && (
                                            <TableCell>
                                                <Badge variant="outline">—</Badge>
                                            </TableCell>
                                        )}
                                        <TableCell>
                                            {item.subjects && typeof item.subjects === 'string' ? (
                                                <div className="flex flex-wrap gap-1 max-w-[200px]">
                                                    {(item.subjects || "").split(",").map((sub: string, sIdx: number) => (
                                                        <Badge key={sIdx} variant="success" className="text-[9.5px]">{sub.trim()}</Badge>
                                                    ))}
                                                </div>
                                            ) : (
                                                <span className="text-gray-400 text-[10px] italic">No subjects</span>
                                            )}
                                        </TableCell>
                                        <TableCell>
                                            {item.classes && typeof item.classes === 'string' ? (
                                                <div className="flex flex-wrap gap-1 max-w-[180px]">
                                                    {(item.classes || "").split(",").map((cls: string, cIdx: number) => (
                                                        <Badge key={cIdx} variant="default" className="text-[9.5px]">{cls.trim()}</Badge>
                                                    ))}
                                                </div>
                                            ) : (
                                                <span className="text-gray-400 text-[10px] italic">No classes</span>
                                            )}
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>

                    <div className="flex items-center justify-between pt-3 border-t border-gray-100">
                        <p className="text-xs text-gray-500 font-medium">
                            Initial default password for all imported faculty will be set to <code className="bg-gray-100 px-1.5 py-0.5 rounded font-mono font-bold">the institution default</code>
                        </p>
                        <div className="flex items-center gap-3">
                            <Button variant="ghost"
                                type="button"
                                onClick={() => setShowFacultyImportModal(false)}
                                className="h-auto px-4 py-2 rounded-xl text-xs font-bold text-gray-600 bg-gray-100 hover:bg-gray-200 transition-all cursor-pointer"
                            >
                                Cancel
                            </Button>
                            <Button variant="ghost"
                                type="button"
                                disabled={isImportingFaculty}
                                onClick={handleConfirmFacultyImport}
                                className="h-auto px-5 py-2 rounded-xl text-xs font-extrabold btn-gradient text-white shadow-sm flex items-center gap-2 cursor-pointer disabled:opacity-50"
                            >
                                {isImportingFaculty ? "Importing..." : `Confirm & Import (${facultyImportPreview?.parsed?.length || 0}) →`}
                            </Button>
                        </div>
                    </div>
                </Dialog>
            )}
            {/* ── User Credentials CRUD Modal ── */}
            {showUserModal && (
                <Dialog
                    open={true}
                    onOpenChange={(next) => { if (!next) setShowUserModal(false); }}
                    ariaLabel="User Credential"
                    overlayClassName="p-4 bg-gray-900/50 backdrop-blur-sm"
                    panelClassName="max-w-md overflow-hidden animate-slideUp p-0 space-y-0 max-h-[90vh]"
                >
                    <div className="flex justify-between items-center p-6 border-b border-gray-100 bg-gray-50">
                        <h3 className="font-extrabold text-gray-900 text-sm flex items-center gap-1.5 font-sans">
                            <ShieldCheck className="h-5 w-5 text-indigo-600" />
                            {editingUser ? "Edit User Credential" : "Create User Credential"}
                        </h3>
                        <Button variant="ghost" size="icon" aria-label="Close user credential dialog" onClick={() => setShowUserModal(false)} className="h-auto w-auto p-1 hover:bg-gray-200 rounded-lg transition-colors cursor-pointer text-gray-500 hover:text-gray-800">
                            <X className="h-4 w-4" />
                        </Button>
                    </div>

                    <form onSubmit={handleUserSubmit} className="p-6 space-y-4 text-xs font-semibold">
                        {userModalError && (
                            <div role="alert" className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 font-bold flex items-center gap-1.5">
                                <ShieldAlert className="h-4 w-4 shrink-0" />
                                {userModalError}
                            </div>
                        )}

                        <div className="space-y-1">
                            <label className="text-[10px] text-gray-400 uppercase tracking-wider block font-bold">Email Address</label>
                            <Input
                                aria-label="Email Address"
                                type="email"
                                required
                                placeholder="e.g. user@faceprep.in"
                                value={userForm.email}
                                onChange={(e) => setUserForm({ ...userForm, email: e.target.value })}
                                className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3.5 py-2.5 font-bold focus:outline-none focus:ring-1 focus:ring-indigo-600"
                            />
                        </div>

                        <div className="space-y-1">
                            <label className="text-[10px] text-gray-400 uppercase tracking-wider block font-bold">System Role</label>
                            <Select
                                aria-label="System Role"
                                value={userForm.role}
                                onChange={(e) => setUserForm({ ...userForm, role: e.target.value })}
                                className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3.5 py-2.5 font-bold focus:outline-none focus:ring-1 focus:ring-indigo-600 cursor-pointer"
                            >
                                <option value="admin">Admin (System Administrator)</option>
                                <option value="cm">CM (Campus Manager)</option>
                                <option value="kam">KAM (Key Account Manager)</option>
                                <option value="mentor">Mentor (Faculty Staff)</option>
                                <option value="sme">SME (Subject Matter Expert)</option>
                                <option value="student">Student (Learner)</option>
                                <option value="fee_manager">Fee Manager (Fee Operations)</option>
                                <option value="L and D">L&D (Learning and Development)</option>
                                <option value="hr">HR (Human Resources)</option>
                            </Select>
                        </div>

                        {editingUser && (
                            <div className="p-3 bg-indigo-50/60 border border-indigo-200 rounded-xl space-y-1">
                                <div className="text-[10px] text-indigo-700 font-bold uppercase tracking-wider">Current / Active Password</div>
                                <div className="flex items-center justify-between gap-2">
                                    <span className="font-mono text-xs font-black text-indigo-950 bg-white px-2.5 py-1 rounded-md border border-indigo-200">
                                        {editingUser.plain_password || "Not stored (hash only)"}
                                    </span>
                                    <Button variant="ghost"
                                        type="button"
                                        onClick={() => editingUser.plain_password && handleCopyPassword(editingUser.id, editingUser.plain_password)}
                                        disabled={!editingUser.plain_password}
                                        className="h-auto flex items-center gap-1 text-[10px] font-extrabold text-indigo-700 bg-white hover:bg-indigo-100/70 border border-indigo-200 px-2 py-1 rounded-md transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                                    >
                                        {copiedPassId === editingUser.id ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
                                        Copy
                                    </Button>
                                </div>
                            </div>
                        )}

                        <div className="space-y-1">
                            <label className="text-[10px] text-gray-400 uppercase tracking-wider block font-bold">
                                {editingUser ? "Change Password (leave blank to keep current)" : "Initial Password"}
                            </label>
                            <Input
                                type="text"
                                placeholder={editingUser ? "Enter new password if changing" : "Leave blank to use the institution default"}
                                value={userForm.password}
                                onChange={(e) => setUserForm({ ...userForm, password: e.target.value })}
                                className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3.5 py-2.5 font-bold focus:outline-none focus:ring-1 focus:ring-indigo-600 font-mono text-xs"
                            />
                        </div>

                        <div className="space-y-1">
                            <label className="text-[10px] text-gray-400 uppercase tracking-wider block font-bold">Reference Entity ID (Optional)</label>
                            <Input
                                aria-label="Reference Entity ID (Optional)"
                                type="text"
                                placeholder="e.g. mentor_123 or student_456"
                                value={userForm.reference_id}
                                onChange={(e) => setUserForm({ ...userForm, reference_id: e.target.value })}
                                className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3.5 py-2.5 font-bold focus:outline-none focus:ring-1 focus:ring-indigo-600 font-mono text-[11px]"
                            />
                        </div>

                        <div className="space-y-1">
                            <label className="text-[10px] text-gray-400 uppercase tracking-wider block font-bold">Status</label>
                            <Select
                                aria-label="Status"
                                value={userForm.status}
                                onChange={(e) => setUserForm({ ...userForm, status: e.target.value })}
                                className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3.5 py-2.5 font-bold focus:outline-none focus:ring-1 focus:ring-indigo-600 cursor-pointer"
                            >
                                <option value="Active">Active</option>
                                <option value="Inactive">Inactive</option>
                            </Select>
                        </div>

                        <div className="flex justify-end gap-2 pt-4 border-t border-gray-100">
                            <Button variant="ghost"
                                type="button"
                                onClick={() => setShowUserModal(false)}
                                className="h-auto px-4 py-2 hover:bg-gray-100 text-gray-500 rounded-xl transition-all font-bold cursor-pointer"
                            >
                                Cancel
                            </Button>
                            <Button variant="ghost"
                                type="submit"
                                disabled={isSubmittingUser}
                                className="h-auto btn-gradient px-5 py-2 text-white rounded-xl shadow-sm transition-all font-bold cursor-pointer disabled:opacity-60"
                            >
                                {isSubmittingUser ? "Saving..." : editingUser ? "Save Credential" : "Create Credential"}
                            </Button>
                        </div>
                    </form>
                </Dialog>
            )}
        </div>
    );
};


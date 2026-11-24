"use client";

import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Building2, Loader2, Mail, Save } from "lucide-react";
import { useApp, type Role, type Student } from "@/context/AppContext";
import { useToast } from "@/context/ToastContext";
import { apiFetch } from "@/lib/apiFetch";
import { formatRoleLabel, getRoleHomePath, normalizeRoleValue } from "@/lib/utils";
import { DashboardLayout } from "@/components/DashboardLayout";

type ProfileResponse = {
  success: boolean;
  session?: { userId?: string; role?: string; email?: string | null; name?: string | null };
  profile?: Record<string, any> | null;
  campus?: Record<string, any> | null;
  portfolioCampuses?: Record<string, any>[];
  classInchargeAssignments?: Record<string, any>[];
};

type ProfileField = { label: string; key: string };

const ROLE_FIELDS: Record<string, ProfileField[]> = {
  student: [
    { label: "Register number", key: "register_number" }, { label: "Roll number", key: "roll_number" },
    { label: "Class", key: "classGroup" }, { label: "Section", key: "section" },
    { label: "Department", key: "department" }, { label: "Semester", key: "semester" },
    { label: "Academic group", key: "academic_group" }, { label: "Medium", key: "medium" },
    { label: "Batch start year", key: "batch_start_year" }, { label: "Batch end year", key: "batch_end_year" },
    { label: "Shift", key: "shift" },
    { label: "Date of birth", key: "dob" }, { label: "Phone", key: "phone" },
    { label: "Guardian", key: "guardian_name" }, { label: "Admission date", key: "admission_date" },
    { label: "LinkedIn", key: "linkedin_link" }, { label: "GitHub username", key: "github_id" },
    { label: "HackerRank", key: "hackerrank_link" }, { label: "LeetCode", key: "leetcode_link" },
    { label: "Figma", key: "figma_link" }, { label: "Project portfolio", key: "project_drive_link" },
  ],
  mentor: [
    { label: "Employee ID", key: "employee_id" }, { label: "Department", key: "department" },
    { label: "Designation", key: "designation" }, { label: "Qualification", key: "qualification" },
    { label: "Specialization", key: "specialization" }, { label: "Experience", key: "experience" },
    { label: "Joining date", key: "joining_date" }, { label: "Shift", key: "shift" },
    { label: "Teaching classes", key: "classes" }, { label: "Subjects", key: "subjects" },
  ],
  cm: [],
  kam: [{ label: "Title", key: "title" }],
  admin: [],
  sme: [
    { label: "Subject area", key: "subject" }, { label: "Department", key: "department" },
    { label: "Subject group", key: "mentor_group" }, { label: "Head subject group", key: "head_subject_group" },
    { label: "SME lead", key: "is_head_sme" },
  ],
  hr: [],
  fee_manager: [],
  "L and D": [],
  program_ops: [],
};

function cleanValue(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (Array.isArray(value)) {
    const clean = Array.from(new Set(value.map((item) => String(item).trim()).filter(Boolean)));
    return clean.length ? clean.join(", ") : null;
  }
  if (typeof value === "boolean" || value === 0 || value === 1) {
    if (value === true || value === 1) return "Yes";
    if (value === false || value === 0) return "No";
  }
  const raw = String(value).trim();
  if (!raw || ["null", "undefined", "nan"].includes(raw.toLowerCase())) return null;
  if ((raw.startsWith("[") && raw.endsWith("]")) || (raw.startsWith("{") && raw.endsWith("}"))) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return cleanValue(parsed);
      return Object.values(parsed).map((entry) => String(entry).trim()).filter(Boolean).join(", ") || null;
    } catch { /* Keep a malformed legacy value visible for correction. */ }
  }
  return raw.replace(/_/g, " ");
}

function initials(name: string) {
  return name.replace(/^\[[^\]]*\]\s*/, "").split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "U";
}

function RoleProfileContent() {
  const router = useRouter();
  const { currentRole, currentUser, currentStudent, updateStudent } = useApp();
  const { toast } = useToast();
  const [data, setData] = useState<ProfileResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editEnabled, setEditEnabled] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ name: "", email: "", phone: "", parent_phone: "", dob: "" });

  const role = normalizeRoleValue(data?.session?.role || currentRole || currentUser?.role) as string;
  const profile = data?.profile || {};
  const name = cleanValue(profile.name) || cleanValue(data?.session?.name) || cleanValue(currentUser?.name) || "Account holder";
  const email = cleanValue(profile.email) || cleanValue(data?.session?.email) || cleanValue(currentUser?.email);
  const roleTitle = ({
    student: "Student", mentor: "Faculty Mentor", cm: "Campus Manager", kam: "Key Account Manager",
    admin: "Administrator", sme: "Subject Matter Expert", hr: "Human Resources",
    fee_manager: "Fee Manager", "L and D": "Learning & Development", program_ops: "Program Operations",
  } as Record<string, string>)[role] || formatRoleLabel(role);
  const displayFields = ROLE_FIELDS[role] || [];
  const homePath = getRoleHomePath(role);
  const campusDisplay = [data?.campus?.name, data?.campus?.code].filter(Boolean).join(" · ");

  useEffect(() => {
    let active = true;
    setLoading(true);
    apiFetch<ProfileResponse>("/api/me")
      .then((result) => { if (active) setData(result); })
      .catch((error: any) => { if (active) toast(error?.message || "Could not load your profile.", "error"); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [toast]);

  useEffect(() => {
    if (!currentStudent) return;
    setDraft({
      name: currentStudent.name || "", email: currentStudent.email || "", phone: currentStudent.phone || "",
      parent_phone: currentStudent.parent_phone || "", dob: currentStudent.dob || "",
    });
  }, [currentStudent]);

  useEffect(() => {
    if (role !== "student") return;
    apiFetch<{ classes?: string[] }>("/api/profile-edit-policy")
      .then((result) => setEditEnabled((result.classes || []).includes(currentStudent?.classGroup || String(profile.classGroup || ""))))
      .catch(() => setEditEnabled(false));
  }, [role, currentStudent?.classGroup, profile.classGroup]);

  const details = useMemo(() => {
    const rows = displayFields
      .map((field) => ({ label: field.label, value: cleanValue(profile[field.key]) }))
      .filter((field): field is { label: string; value: string } => Boolean(field.value));
    if (role === "student") {
      const familyPhone = cleanValue(profile.guardian_phone) || cleanValue(profile.parent_phone);
      if (familyPhone) rows.push({ label: "Parent / guardian phone", value: familyPhone });
    }
    return rows;
  }, [displayFields, profile, role]);
  const hasRoleDetails = details.length > 0 || Boolean(campusDisplay) || Boolean(data?.campus?.kam_name) || Boolean(data?.portfolioCampuses?.length);

  const saveStudentDetails = async (event: FormEvent) => {
    event.preventDefault();
    if (!currentStudent || saving) return;
    setSaving(true);
    try {
      const result = await updateStudent({
        ...currentStudent,
        name: draft.name.trim(), email: draft.email.trim(), phone: draft.phone.trim(),
        parent_phone: draft.parent_phone.trim(), dob: draft.dob.trim(),
      } as Student);
      if (!result.success) throw new Error(result.message || "Profile could not be saved.");
      setData((previous) => previous ? {
        ...previous,
        session: { ...(previous.session || {}), name: draft.name, email: draft.email },
        profile: { ...(previous.profile || {}), name: draft.name, email: draft.email, phone: draft.phone, parent_phone: draft.parent_phone, dob: draft.dob },
      } : previous);
      setEditing(false);
      toast("Profile details saved.", "success");
    } catch (error: any) {
      toast(error?.message || "Profile could not be saved.", "error");
    } finally { setSaving(false); }
  };

  if (loading) return <div className="grid min-h-[50vh] place-items-center text-sm font-semibold text-slate-500"><span className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" />Loading profile…</span></div>;

  return (
    <section className="mx-auto w-full max-w-5xl space-y-5 p-4 pb-10 sm:p-6">
      <button type="button" onClick={() => router.push(homePath)} className="inline-flex items-center gap-2 text-sm font-semibold text-slate-500 transition hover:text-slate-900 dark:hover:text-white">
        <ArrowLeft className="h-4 w-4" /> Back to workspace
      </button>

      <header className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:flex-row sm:items-center">
        <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-indigo-50 text-lg font-bold text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-200">{initials(name)}</div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">My profile</p>
          <h1 className="mt-1 truncate text-xl font-bold text-slate-900 dark:text-white">{name}</h1>
          <p className="mt-1 text-sm text-slate-500">{roleTitle}</p>
        </div>
        {profile.status && <span className="w-fit rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold capitalize text-slate-700 dark:bg-slate-800 dark:text-slate-200">{cleanValue(profile.status)}</span>}
      </header>

      <div className="grid gap-5 md:grid-cols-2">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <h2 className="text-sm font-bold text-slate-900 dark:text-white">Account</h2>
          <dl className="mt-4 divide-y divide-slate-100 dark:divide-slate-800">
            {email && <ProfileRow label="Email" value={email} icon={<Mail className="h-3.5 w-3.5" />} />}
            {cleanValue(profile.id) && <ProfileRow label="Account ID" value={cleanValue(profile.id)!} />}
            {cleanValue(profile.last_login) && <ProfileRow label="Last sign-in" value={cleanValue(profile.last_login)!} />}
          </dl>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <h2 className="text-sm font-bold text-slate-900 dark:text-white">Role details</h2>
          {hasRoleDetails ? (
            <dl className="mt-4 divide-y divide-slate-100 dark:divide-slate-800">
              {details.map((field) => <ProfileRow key={field.label} label={field.label} value={field.value} />)}
              {campusDisplay && <ProfileRow label="Campus" value={campusDisplay} icon={<Building2 className="h-3.5 w-3.5" />} />}
              {data?.campus?.kam_name && <ProfileRow label="Assigned KAM" value={data.campus.kam_name} />}
            </dl>
          ) : (
            <p className="mt-3 text-sm text-slate-500">No additional role details are recorded.</p>
          )}
          {role === "student" && !editing && (
            <div className="mt-5 border-t border-slate-100 pt-4 dark:border-slate-800">
              {editEnabled && currentStudent ? <button type="button" onClick={() => setEditing(true)} className="rounded-lg bg-slate-900 px-3.5 py-2 text-sm font-semibold text-white hover:bg-slate-700 dark:bg-white dark:text-slate-900">Edit personal details</button> : <p className="text-xs text-slate-500">Personal edits are managed by your campus for this class.</p>}
            </div>
          )}
        </section>
      </div>

      {role === "student" && editing && (
        <form onSubmit={saveStudentDetails} className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <div className="mb-4 flex items-center justify-between gap-3"><h2 className="text-sm font-bold text-slate-900 dark:text-white">Edit personal details</h2><button type="button" onClick={() => setEditing(false)} className="text-xs font-semibold text-slate-500 hover:text-slate-900">Cancel</button></div>
          <div className="grid gap-4 sm:grid-cols-2">
            {(["name", "email", "phone", "parent_phone", "dob"] as const).map((key) => <label key={key} className="space-y-1.5"><span className="text-xs font-semibold capitalize text-slate-600 dark:text-slate-300">{key === "parent_phone" ? "Parent phone" : key.replace(/_/g, " ")}</span><input type={key === "dob" ? "date" : key === "email" ? "email" : "text"} value={draft[key]} onChange={(event) => setDraft((previous) => ({ ...previous, [key]: event.target.value }))} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-500 dark:border-slate-700 dark:bg-slate-950 dark:text-white" /></label>)}
          </div>
          <button type="submit" disabled={saving} className="mt-5 inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"><Save className="h-4 w-4" />{saving ? "Saving…" : "Save changes"}</button>
        </form>
      )}

      {role === "kam" && data?.portfolioCampuses?.length ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <h2 className="text-sm font-bold text-slate-900 dark:text-white">Assigned campus portfolio <span className="ml-1 text-slate-500">({data.portfolioCampuses.length})</span></h2>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {data.portfolioCampuses.map((campus) => <li key={campus.id} className="rounded-lg bg-slate-50 px-3 py-2.5 text-sm dark:bg-slate-800"><span className="block font-semibold text-slate-800 dark:text-slate-100">{campus.name}</span>{campus.code && <span className="mt-0.5 block text-xs text-slate-500">{campus.code}</span>}</li>)}
          </ul>
        </section>
      ) : null}

      {role === "mentor" && (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <h2 className="text-sm font-bold text-slate-900 dark:text-white">Class in-charge assignments</h2>
          {data?.classInchargeAssignments?.length ? (
            <ul className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {data.classInchargeAssignments.map((assignment) => (
                <li key={assignment.id} className="rounded-lg bg-slate-50 px-3 py-3 dark:bg-slate-800">
                  <span className="block text-sm font-semibold text-slate-800 dark:text-slate-100">{assignment.classGroup}</span>
                  <span className="mt-1 block text-xs text-slate-500">{[assignment.year, assignment.department].filter(Boolean).join(" · ")}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-slate-500">No class in-charge assignments are recorded for your mentor profile.</p>
          )}
        </section>
      )}
    </section>
  );
}

function ProfileRow({ label, value, icon }: { label: string; value: string; icon?: ReactNode }) {
  return <div className="flex items-start justify-between gap-4 py-3"><dt className="flex items-center gap-2 text-xs font-medium text-slate-500">{icon}{label}</dt><dd className="max-w-[65%] break-words text-right text-sm font-medium text-slate-800 dark:text-slate-100">{value}</dd></div>;
}

export function RoleProfilePage() {
  const { currentRole, isLoading } = useApp();
  if (isLoading) return <div className="grid min-h-screen place-items-center text-sm text-slate-500"><Loader2 className="mr-2 inline h-4 w-4 animate-spin" />Loading your workspace…</div>;
  return <DashboardLayout requiredRole={currentRole as Role}><RoleProfileContent /></DashboardLayout>;
}

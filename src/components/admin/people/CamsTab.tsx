"use client";

import React, { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { Users, Plus, Edit, Trash2, AlertTriangle, Loader2, ShieldAlert, X, ExternalLink, Building2 } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/button";
import { TableSurface } from "@/components/dashboard/TableSurface";
import { TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Pagination } from "@/components/ui/Pagination";
import { usePagination } from "@/hooks/usePagination";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
  ActionDropdownButton
} from "@/components/ui/dropdown-menu";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { LoadingButton } from "@/components/ui/LoadingButton";
import { College, Mentor, Slot, useApp } from "@/context/AppContext";
import { useToast } from "@/context/ToastContext";
import { CAMUserFromDB, KAMUserFromDB } from "@/components/admin/types";
import { useQuery } from "@tanstack/react-query";
import { qk } from "@/lib/queryKeys";
import { normalizeRoleValue } from "@/lib/utils";
import { apiFetch } from "@/lib/apiFetch";

export interface CamsTabProps {
  camList?: CAMUserFromDB[];
  kamList?: KAMUserFromDB[];
  colleges?: College[];
  mentors?: Mentor[];
  slots?: Slot[];
  isLoading?: boolean;
  isError?: boolean;
  onRefetch?: () => void;
  onCreateCam?: (id: string, name: string, email: string, collegeId: string, kamId: string) => Promise<any>;
  onUpdateCam?: (id: string, name: string, email: string, collegeId: string, kamId: string) => Promise<any>;
  onDeleteCam?: (id: string) => Promise<void>;
  loadingActions?: Record<string, boolean>;
  onDrillDownCampus?: (collegeId: string) => void;
}

export const CamsTab: React.FC<CamsTabProps> = ({
  camList: propCamList,
  kamList: propKamList,
  colleges: propColleges,
  mentors: propMentors,
  slots: propSlots,
  isLoading: propIsLoading,
  isError: propIsError,
  onRefetch: propOnRefetch,
  onCreateCam: propOnCreateCam,
  onUpdateCam: propOnUpdateCam,
  onDeleteCam: propOnDeleteCam,
  loadingActions: propLoadingActions,
  onDrillDownCampus
}) => {
  const app = useApp();
  const { toast, confirm: showConfirm } = useToast();
  const colleges = propColleges ?? app.colleges ?? [];
  const mentors = propMentors ?? app.mentors ?? [];
  const slots = propSlots ?? app.slots ?? [];

  const kamQuery = useQuery({
    queryKey: qk.adminKams(),
    queryFn: async () => {
      const data = await apiFetch("/api/kam?all=1");
      return (data?.kamUsers || []) as KAMUserFromDB[];
    },
    enabled: !propKamList
  });
  const kamList = propKamList ?? kamQuery.data ?? [];

  const usersQuery = useQuery({
    queryKey: qk.adminUsers("all"),
    queryFn: async () => {
      const data = await apiFetch("/api/users?limit=5000");
      return (data?.users || []) as any[];
    },
    enabled: !propCamList
  });
  const usersList = usersQuery.data || [];

  const derivedCamList: CAMUserFromDB[] = React.useMemo(() => {
    return usersList
      .filter((u: any) => normalizeRoleValue(u.role) === "cm")
      .map((u: any) => {
        // campus_managers.id === users.reference_id; match college by campus_managers.college_id
        const colProfile = (colleges as any[]).find(
          (c: any) => c.id === u.college_id || c.manager === u.name
        );
        return {
          id: u.reference_id || u.id,
          name: u.name || (u.email && typeof u.email === "string" ? u.email.split("@")[0] : u.reference_id) || "—",
          email: u.email || "",
          college_id: u.college_id || colProfile?.id || "",
          college_name: colProfile?.name || "",
          kam_id: colProfile?.kam_id || ""
        } as CAMUserFromDB;
      });
  }, [usersList, colleges]);

  const camList: CAMUserFromDB[] = propCamList ?? derivedCamList;
  const isLoading = propIsLoading ?? (kamQuery.isLoading || usersQuery.isLoading);
  const isError = propIsError ?? (kamQuery.isError || usersQuery.isError);
  const onRefetch = propOnRefetch ?? (() => { kamQuery.refetch(); usersQuery.refetch(); });

  const searchParams = useSearchParams();
  const campusParam = searchParams?.get("campus") || null;
  const actionParam = searchParams?.get("action") || null;

  const [localLoading, setLocalLoading] = useState<Record<string, boolean>>({});
  const loadingActions = propLoadingActions ?? localLoading;

  const handleDeleteCam = async (id: string) => {
    if (propOnDeleteCam) return propOnDeleteCam(id);
    const ok = await showConfirm({
      message: "Delete this Campus Manager? Their login and campus access are removed.",
      danger: true,
      confirmLabel: "Delete"
    });
    if (!ok) return;
    setLocalLoading((prev: Record<string, boolean>) => ({ ...prev, [`cam_${id}`]: true }));
    try {
      const result = await app.deleteCAM(id);
      if (!result.success) {
        toast(result.message || "Failed to delete Campus Manager.", "error");
        return;
      }
      toast("Campus Manager deleted.", "success");
    } finally {
      setLocalLoading((prev: Record<string, boolean>) => ({ ...prev, [`cam_${id}`]: false }));
    }
  };
  const [showModal, setShowModal] = useState(false);
  const [editingCam, setEditingCam] = useState<boolean>(false);
  const [modalError, setModalError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [form, setForm] = useState({
    id: "",
    name: "",
    email: "",
    college_id: "",
    kam_id: "",
    password: ""
  });

  useEffect(() => {
    if (campusParam && (actionParam === "new" || actionParam === "add")) {
      setEditingCam(false);
      setModalError(null);
      const targetCol = colleges.find(c => c.id === campusParam);
      setForm({
        id: `cam_${Date.now()}`,
        name: "",
        email: "",
        college_id: campusParam,
        kam_id: targetCol?.kam_id || kamList[0]?.id || "",
        password: ""
      });
      setShowModal(true);
    }
  }, [campusParam, actionParam, colleges, kamList]);

  const pagination = usePagination<CAMUserFromDB>(camList, {
    pageSize: 10,
    pageSizeOptions: [10, 25, 50]
  });

  const handleOpenAdd = () => {
    setEditingCam(false);
    setModalError(null);
    const maxNum = (camList || []).reduce((acc: number, curr: CAMUserFromDB) => {
      const num = parseInt(curr.id.replace("cam_", ""), 10);
      return isNaN(num) ? acc : Math.max(acc, num);
    }, 0);
    const targetColId = campusParam || colleges[0]?.id || "";
    const targetCol = colleges.find(c => c.id === targetColId);
    setForm({
      id: `cam_${maxNum + 1}`,
      name: "",
      email: "",
      college_id: targetColId,
      kam_id: targetCol?.kam_id || kamList[0]?.id || "",
      password: ""
    });
    setShowModal(true);
  };

  const handleOpenEdit = (cam: CAMUserFromDB) => {
    setEditingCam(true);
    setModalError(null);
    setForm({
      id: cam.id,
      name: cam.name,
      email: cam.email,
      college_id: cam.college_id,
      kam_id: cam.kam_id,
      password: ""
    });
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.id || !form.name || !form.email || !form.college_id) {
      setModalError("Please fill in all required fields.");
      return;
    }
    const initialPassword = form.password.trim();
    if (initialPassword && initialPassword.length < 6) {
      setModalError("Initial password must be at least 6 characters.");
      return;
    }
    setIsSaving(true);
    setModalError(null);
    try {
      if (editingCam) {
        if (propOnUpdateCam) {
          await propOnUpdateCam(form.id, form.name, form.email, form.college_id, form.kam_id);
        } else {
          const result = await app.updateCAM({ id: form.id, name: form.name, email: form.email, college_id: form.college_id, kam_id: form.kam_id });
          if (!result.success) {
            setModalError(result.message || "Failed to save Campus Manager.");
            return;
          }
        }
      } else {
        if (propOnCreateCam) {
          await propOnCreateCam(form.id, form.name, form.email, form.college_id, form.kam_id);
        } else {
          const result = await app.createCAM({
            id: form.id,
            name: form.name,
            email: form.email,
            college_id: form.college_id,
            kam_id: form.kam_id,
            password: initialPassword || undefined
          });
          if (!result.success) {
            setModalError(result.message || "Failed to save Campus Manager.");
            return;
          }
        }
      }
      setShowModal(false);
    } catch (err: any) {
      setModalError(err.message || "Failed to save Campus Manager.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-4 animate-fadeIn font-sans text-xs">
      <PageHeader
        icon={Users}
        title="Campus Managers"
        actions={
          <Button
            variant="ghost"
            onClick={handleOpenAdd}
            className="h-auto btn-gradient shadow-sm text-white px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
          >
            <Plus className="h-4 w-4" />
            Add Campus Manager
          </Button>
        }
      />

      <TableSurface
        footer={
          <Pagination
            currentPage={pagination.page}
            totalItems={camList.length}
            pageSize={pagination.pageSize}
            onPageChange={pagination.setPage}
            onPageSizeChange={pagination.setPageSize}
            pageSizeOptions={pagination.pageSizeOptions}
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
          {isError ? (
            <TableRow>
              <TableCell colSpan={8} className="h-32 text-center">
                <div className="flex flex-col items-center gap-3 text-rose-500">
                  <AlertTriangle className="h-8 w-8" />
                  <p className="text-sm font-semibold">
                    Could not load Campus Managers. The credential directory may be temporarily unavailable.
                  </p>
                  <Button variant="outline" size="sm" onClick={onRefetch} isLoading={isLoading}>
                    Retry
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ) : isLoading && camList.length === 0 ? (
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
            pagination.pageItems.map((cam: CAMUserFromDB) => {
              const colObj = colleges.find((c) => c.id === cam.college_id);
              const kamObj = kamList.find((k) => k.id === cam.kam_id);
              const camMentors = mentors.filter((m) => m.college_id === cam.college_id);
              const camSlots = slots.filter((s) => camMentors.some((m) => m.id === s.mentorId));
              const camDeptsCount = Array.from(new Set(camMentors.map((m) => m.mentor_group).filter(Boolean))).length;

              return (
                <TableRow key={cam.id}>
                  <TableCell className="font-bold text-gray-950">
                    <div className="flex items-center gap-2">
                      <div className="h-7 w-7 rounded-full bg-indigo-50 border border-indigo-200 text-indigo-600 flex items-center justify-center font-extrabold text-[10px]">
                        {(cam.name || "")
                          .split(" ")
                          .filter(Boolean)
                          .map((w: string) => w[0])
                          .join("") || "?"}
                      </div>
                      {cam.name || "—"}
                    </div>
                  </TableCell>
                  <TableCell className="hidden md:table-cell text-gray-500">{cam.email}</TableCell>
                  <TableCell className="font-bold">{cam.college_name || (colObj ? colObj.name : "Unassigned")}</TableCell>
                  <TableCell className="hidden lg:table-cell text-gray-600">{kamObj ? kamObj.name : "Unassigned"}</TableCell>
                  <TableCell className="hidden lg:table-cell text-center font-bold">{camDeptsCount}</TableCell>
                  <TableCell className="hidden xl:table-cell text-center font-bold">{camMentors.length}</TableCell>
                  <TableCell className="hidden xl:table-cell text-center font-black text-indigo-600">
                    {camSlots.length}
                  </TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <ActionDropdownButton size="sm" title="CM Options" />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuLabel>Manager Options</DropdownMenuLabel>
                        {cam.college_id && onDrillDownCampus && (
                          <DropdownMenuItem onClick={() => onDrillDownCampus(cam.college_id)}>
                            <Building2 className="h-3.5 w-3.5 mr-2 text-indigo-600" />
                            Manage Campus Console
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem onClick={() => handleOpenEdit(cam)}>
                          <Edit className="h-3.5 w-3.5 mr-2 text-slate-500" />
                          Edit Details
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-rose-600 focus:text-rose-700 focus:bg-rose-50"
                          onClick={() => handleDeleteCam(cam.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5 mr-2" />
                          Delete CM
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              );
            })
          )}
        </TableBody>
      </TableSurface>

      {/* CAM Modal */}
      {showModal && (
        <Dialog
          open={showModal}
          onOpenChange={(next) => {
            if (!next) setShowModal(false);
          }}
          ariaLabel="Campus Manager"
          overlayClassName="bg-slate-950/60 backdrop-blur-sm p-4"
          panelClassName="max-w-md overflow-hidden animate-slideUp p-0 space-y-0 max-h-[90vh]"
        >
          <div className="flex justify-between items-center p-6 border-b border-gray-100 bg-gray-50">
            <h3 className="font-extrabold text-gray-900 text-sm flex items-center gap-1.5">
              <Users className="h-5 w-5 text-indigo-600" />
              {editingCam ? "Edit Campus Manager" : "Add Campus Manager"}
            </h3>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Close CAM dialog"
              onClick={() => setShowModal(false)}
              className="h-auto w-auto p-1 hover:bg-gray-200 rounded-lg transition-colors cursor-pointer text-gray-500 hover:text-gray-800"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs font-semibold">
            {modalError && (
              <div
                role="alert"
                className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 font-bold flex items-center gap-1.5"
              >
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
                value={form.id}
                onChange={(e) => setForm({ ...form, id: e.target.value })}
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
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
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
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3.5 py-2.5 font-bold focus:outline-none focus:ring-1 focus:ring-indigo-600"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[10px] text-gray-400 uppercase tracking-wider block">Assigned Campus</label>
              <Select
                aria-label="Assigned Campus"
                required
                value={form.college_id}
                onChange={(e) => setForm({ ...form, college_id: e.target.value })}
                className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 font-bold focus:outline-none focus:ring-1 focus:ring-indigo-600 cursor-pointer"
              >
                <option value="">Select Campus</option>
                {colleges.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] text-gray-400 uppercase tracking-wider block">Reporting KAM Manager</label>
              <Select
                aria-label="Reporting KAM Manager"
                required
                value={form.kam_id}
                onChange={(e) => setForm({ ...form, kam_id: e.target.value })}
                className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 font-bold focus:outline-none focus:ring-1 focus:ring-indigo-600 cursor-pointer"
              >
                <option value="">Select Reporting KAM</option>
                {kamList.map((kam) => (
                  <option key={kam.id} value={kam.id}>
                    {kam.name}
                  </option>
                ))}
              </Select>
            </div>

            {!editingCam && (
              <div className="space-y-1">
                <label className="text-[10px] text-gray-400 uppercase tracking-wider block">Initial Login Password</label>
                <Input
                  aria-label="Initial Login Password"
                  type="text"
                  autoComplete="new-password"
                  placeholder="Leave blank to use the institution default"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3.5 py-2.5 font-bold focus:outline-none focus:ring-1 focus:ring-indigo-600"
                />
                <p className="text-[10px] text-gray-400 font-medium">
                  The login is created with the campus manager profile in one step. The manager must set their own password on first sign-in.
                </p>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-4 border-t border-gray-100">
              <Button
                variant="ghost"
                type="button"
                onClick={() => setShowModal(false)}
                className="h-auto px-4 py-2 hover:bg-gray-100 text-gray-500 rounded-xl transition-all font-bold cursor-pointer"
              >
                Cancel
              </Button>
              <LoadingButton
                type="submit"
                isLoading={isSaving}
                loadingText="Saving..."
                variant="gradient"
                className="px-5 py-2 text-white rounded-xl shadow-sm transition-all font-bold cursor-pointer"
              >
                {editingCam ? "Update CM" : "Create CM"}
              </LoadingButton>
            </div>
          </form>
        </Dialog>
      )}
    </div>
  );
};

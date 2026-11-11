"use client";

import React, { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useApp } from "@/context/AppContext";
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
import { apiFetch } from "@/lib/apiFetch";
import { qk } from "@/lib/queryKeys";
import { formatDate, normalizeRoleValue, formatRoleLabel } from "@/lib/utils";
import {
  UserCheck,
  Search,
  Plus,
  AlertTriangle,
  Loader2,
  Users,
  Eye,
  EyeOff,
  Copy,
  Check,
  Edit,
  Trash2,
  Key,
  X
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
  ActionDropdownButton
} from "@/components/ui/dropdown-menu";
import { UserCredentialDialog, type UserFormState } from "@/components/admin/dialogs/UserCredentialDialog";
import { SignupApprovalDialog } from "@/components/admin/dialogs/SignupApprovalDialog";

export const UsersTab: React.FC = () => {
  const {
    colleges,
    mentors,
    students,
    subjectGroups,
    smes,
    signupRequests,
    approveSignupRequest,
    rejectSignupRequest,
    deleteSignupRequest,
    refreshData
  } = useApp();
  const { toast, confirm: showConfirm } = useToast();
  const queryClient = useQueryClient();

  const [userSubTab, setUserSubTab] = useState<"directory" | "signups">("directory");
  const [usersRoleFilter, setUsersRoleFilter] = useState<string>("all");
  const [usersSearchQuery, setUsersSearchQuery] = useState("");
  const [revealedPasswords, setRevealedPasswords] = useState<Record<string, boolean>>({});
  const [copiedPassId, setCopiedPassId] = useState<string | null>(null);

  // User modal state
  const [showUserModal, setShowUserModal] = useState(false);
  const [editingUser, setEditingUser] = useState<any | null>(null);
  const [userForm, setUserForm] = useState<UserFormState>({
    email: "",
    role: "mentor",
    password: "",
    reference_id: "",
    status: "Active"
  });
  const [userModalError, setUserModalError] = useState<string | null>(null);
  const [isSubmittingUser, setIsSubmittingUser] = useState(false);

  // Signup Approval Modal state
  const [showApprovalModal, setShowApprovalModal] = useState(false);
  const [approvingSignup, setApprovingSignup] = useState<any | null>(null);
  const [approvingRole, setApprovingRole] = useState("student");
  const [mappingType, setMappingType] = useState<"create_new" | "link_existing">("create_new");
  const [selectedReferenceId, setSelectedReferenceId] = useState("");
  const [mappingCollegeId, setMappingCollegeId] = useState("");
  const [mappingDept, setMappingDept] = useState("");
  const [mappingClassGroup, setMappingClassGroup] = useState("");
  const [isSubmittingApproval, setIsSubmittingApproval] = useState(false);
  const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({});

  const setAction = (key: string, val: boolean) => {
    setActionLoading(prev => ({ ...prev, [key]: val }));
  };

  // User list query
  const usersQuery = useQuery({
    queryKey: qk.adminUsers("all"),
    queryFn: async () => {
      const data = await apiFetch("/api/users?limit=5000");
      if (!data?.success) throw new Error(data?.message || "Failed to load users.");
      return (data.users || []) as any[];
    }
  });

  const usersList = usersQuery.data || [];
  const isUsersLoading = usersQuery.isFetching;
  const isUsersError = usersQuery.isError;

  const camList = useMemo(() => {
    return usersList
      .filter((u: any) => normalizeRoleValue(u.role) === "cm")
      .map((u: any) => {
        const colProfile = (colleges as any[]).find(
          (c: any) => c.id === u.college_id || c.manager === u.name
        );
        return {
          ...u,
          name: u.name || (u.email && typeof u.email === "string" ? u.email.split("@")[0] : u.reference_id) || "—",
          college_id: u.college_id || colProfile?.id || "",
          college_name: colProfile?.name || "",
          kam_id: colProfile?.kam_id || ""
        };
      });
  }, [usersList, colleges]);

  const filteredUsers = useMemo(() => {
    return usersList.filter((u: any) => {
      const roleMatch = usersRoleFilter === "all" || normalizeRoleValue(u.role) === normalizeRoleValue(usersRoleFilter);
      const query = usersSearchQuery.toLowerCase().trim();
      const textMatch =
        !query ||
        (u.email || "").toLowerCase().includes(query) ||
        (u.id || "").toLowerCase().includes(query) ||
        (u.reference_id || "").toLowerCase().includes(query);
      return roleMatch && textMatch;
    });
  }, [usersList, usersRoleFilter, usersSearchQuery]);

  const usersPagination = usePagination(filteredUsers, {
    pageSize: 15,
    pageSizeOptions: [10, 15, 25, 50],
    resetKeys: [usersRoleFilter, usersSearchQuery]
  });

  const signupPagination = usePagination(signupRequests, {
    pageSize: 10,
    pageSizeOptions: [10, 20, 50],
    resetKeys: [signupRequests.length]
  });

  const togglePasswordVisibility = (userId: string) => {
    setRevealedPasswords(prev => ({ ...prev, [userId]: !prev[userId] }));
  };

  const handleCopyPassword = (userId: string, pass: string) => {
    if (!pass) return;
    navigator.clipboard.writeText(pass);
    setCopiedPassId(userId);
    setTimeout(() => setCopiedPassId(null), 2000);
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
    if (
      !(await showConfirm({
        title: "Delete User",
        message: `Delete user ${email}?`,
        confirmLabel: "Delete",
        danger: true
      }))
    ) {
      return;
    }
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

  const handleResetUserPassword = async (userId: string, email: string) => {
    if (
      !(await showConfirm({
        title: "Reset Password",
        message: `Reset password for ${email} to default (password123)?`,
        confirmLabel: "Reset",
        danger: true
      }))
    ) {
      return;
    }
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
            reference_id: (userForm.reference_id || "").trim(),
            status: userForm.status,
            newPassword: (userForm.password || "").trim() || undefined
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
            password: (userForm.password || "").trim(),
            reference_id: (userForm.reference_id || "").trim(),
            status: userForm.status
          })
        });
      }
      const data = await res.json();
      if (data.success) {
        toast(data.message || (editingUser ? "User credential updated." : "User credential created."), "success");
        setShowUserModal(false);
        queryClient.invalidateQueries({ queryKey: qk.adminUsers("all") });
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

  const handleApproveSignupSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!approvingSignup) return;

    setIsSubmittingApproval(true);
    try {
      const res = await approveSignupRequest(approvingSignup.id, {
        role: approvingRole,
        mappingType,
        selectedReferenceId: mappingType === "link_existing" ? selectedReferenceId : null,
        collegeId: mappingCollegeId || null,
        department: mappingDept || null,
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
        refreshData(true);
        queryClient.invalidateQueries({ queryKey: qk.adminUsers("all") });
      } else {
        toast(res.message || "Failed to approve signup request.", "error");
      }
    } catch (err: any) {
      toast(err.message || "An error occurred.", "error");
    } finally {
      setIsSubmittingApproval(false);
    }
  };

  const handleRejectSignup = async (id: string) => {
    if (
      !(await showConfirm({
        message: "Are you sure you want to reject this signup request?",
        danger: true,
        confirmLabel: "Reject"
      }))
    ) {
      return;
    }
    setAction(`reject_signup_${id}`, true);
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
      setAction(`reject_signup_${id}`, false);
    }
  };

  const handleDeleteSignupRequest = async (id: string) => {
    if (
      !(await showConfirm({
        message: "Are you sure you want to permanently delete this request log?",
        danger: true,
        confirmLabel: "Delete"
      }))
    ) {
      return;
    }
    setAction(`delete_signup_${id}`, true);
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
      setAction(`delete_signup_${id}`, false);
    }
  };

  const pendingSignupsCount = signupRequests.filter(r => r.status === "pending").length;

  return (
    <div className="space-y-4 animate-fadeIn font-sans text-xs">
      <PageHeader
        icon={UserCheck}
        title="User Credentials"
        actions={
          <div className="flex gap-2">
            <button
              onClick={() => setUserSubTab("directory")}
              aria-pressed={userSubTab === "directory"}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                userSubTab === "directory" ? "bg-indigo-600 text-white shadow-sm" : "bg-gray-100 hover:bg-gray-200 text-gray-700"
              }`}
            >
              Users
            </button>
            <button
              onClick={() => setUserSubTab("signups")}
              aria-pressed={userSubTab === "signups"}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                userSubTab === "signups" ? "bg-indigo-600 text-white shadow-sm" : "bg-gray-100 hover:bg-gray-200 text-gray-700"
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
          {/* Role Filter & Search */}
          <FilterBar
            aside={
              <>
                <div className="relative w-56">
                  <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                  <Input
                    type="text"
                    aria-label="Search users"
                    placeholder="Search users..."
                    value={usersSearchQuery}
                    onChange={e => setUsersSearchQuery(e.target.value)}
                    className="w-full pl-8 pr-8 rounded-2xl"
                  />
                  {usersSearchQuery && (
                    <button
                      type="button"
                      onClick={() => setUsersSearchQuery("")}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 rounded-full hover:bg-slate-100 cursor-pointer"
                      title="Clear search"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>

                <Button
                  variant="ghost"
                  onClick={() => {
                    setEditingUser(null);
                    setUserForm({ email: "", role: "mentor", password: "", reference_id: "", status: "Active" });
                    setUserModalError(null);
                    setShowUserModal(true);
                  }}
                  className="h-auto btn-gradient shadow-sm text-white px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1 cursor-pointer border-none shrink-0"
                >
                  <Plus className="h-4 w-4" />
                  Add User
                </Button>
              </>
            }
          >
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
                className={`px-3 py-1 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  usersRoleFilter === r.id ? "bg-indigo-600 text-white shadow-xs" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {r.label}
              </button>
            ))}
          </FilterBar>

          {/* Directory Table */}
          {isUsersError ? (
            <div className="text-center py-16 border border-rose-100 rounded-2xl bg-white shadow-card">
              <AlertTriangle className="h-10 w-10 text-rose-400 mx-auto mb-2" />
              <p className="text-sm text-rose-600 font-semibold">Could not load user credentials.</p>
              <Button variant="outline" size="sm" className="mt-3" onClick={() => usersQuery.refetch()} isLoading={isUsersLoading}>
                Retry
              </Button>
            </div>
          ) : isUsersLoading && usersList.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-16 text-slate-400">
              <Loader2 className="h-7 w-7 animate-spin text-indigo-500" />
              <p className="text-sm font-semibold">Loading user credentials…</p>
            </div>
          ) : filteredUsers.length === 0 ? (
            <div className="text-center py-16 border border-slate-100 rounded-2xl bg-white shadow-card">
              <Users className="h-10 w-10 text-slate-300 mx-auto mb-2" />
              <p className="text-sm text-slate-500 font-semibold">No users found.</p>
            </div>
          ) : (
            <TableSurface
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
                  <TableHead className="w-[26%]">User</TableHead>
                  <TableHead className="w-[12%]">Role</TableHead>
                  <TableHead className="w-[14%]">Ref ID</TableHead>
                  <TableHead className="w-[18%]">Password</TableHead>
                  <TableHead className="w-[10%] text-center">Status</TableHead>
                  <TableHead className="w-[10%]">Last Login</TableHead>
                  <TableHead className="w-[10%] text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {usersPagination.pageItems.map((user: any) => {
                  const userRole = normalizeRoleValue(user.role);
                  const roleVariant: "default" | "warning" | "destructive" | "success" | "secondary" | "outline" =
                    userRole === "admin"
                      ? "default"
                      : userRole === "cm" || userRole === "kam"
                      ? "warning"
                      : userRole === "mentor"
                      ? "secondary"
                      : userRole === "sme"
                      ? "success"
                      : userRole === "student"
                      ? "outline"
                      : "secondary";

                  const userPass = user.plain_password || (user.must_change_password ? "password123" : (!user.last_login ? "password123" : "password123"));
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
                          <span
                            className={`font-mono text-xs font-bold px-2.5 py-1 rounded-md border min-w-[90px] text-center select-all ${
                              isRevealed
                                ? "bg-indigo-50 border-indigo-200 text-indigo-950 font-semibold"
                                : "bg-gray-50 border-gray-200 text-gray-500 tracking-widest"
                            }`}
                          >
                            {isRevealed ? userPass : "••••••••"}
                          </span>
                          <Button
                            variant="ghost"
                            size="icon"
                            type="button"
                            onClick={() => togglePasswordVisibility(user.id)}
                            className="h-7 w-7 p-1 hover:bg-gray-100 rounded text-gray-500 hover:text-indigo-600 transition-colors cursor-pointer"
                            title={isRevealed ? "Hide Password" : "Show Password"}
                          >
                            {isRevealed ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            type="button"
                            onClick={() => handleCopyPassword(user.id, userPass)}
                            className="h-7 w-7 p-1 hover:bg-gray-100 rounded text-gray-500 hover:text-emerald-600 transition-colors cursor-pointer"
                            title="Copy Password"
                          >
                            {copiedPassId === user.id ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                          </Button>
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="inline-flex items-center justify-center gap-1.5">
                          <Switch
                            checked={user.status === "Active"}
                            onCheckedChange={() => handleToggleUserStatus(user.id)}
                            size="sm"
                            aria-label={`Toggle active status for ${user.email}`}
                          />
                          <span
                            className={`text-[10px] font-bold ${
                              user.status === "Active" ? "text-emerald-700" : "text-rose-600"
                            }`}
                          >
                            {user.status || "Active"}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-[10px]">
                        {user.last_login ? formatDate(user.last_login) : "Never logged in"}
                      </TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <ActionDropdownButton size="sm" title="User Options" />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuLabel>Options</DropdownMenuLabel>
                            <DropdownMenuItem
                              onClick={() => {
                                setEditingUser(user);
                                setUserForm({
                                  email: user.email,
                                  role: normalizeRoleValue(user.role),
                                  password: "",
                                  reference_id: user.reference_id || "",
                                  status: user.status || "Active"
                                });
                                setUserModalError(null);
                                setShowUserModal(true);
                              }}
                            >
                              <Edit className="h-3.5 w-3.5 text-indigo-600" />
                              <span>Edit User</span>
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => handleResetUserPassword(user.id, user.email)}
                            >
                              <Key className="h-3.5 w-3.5 text-amber-600" />
                              <span>Reset Password</span>
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => handleCopyPassword(user.id, userPass)}
                            >
                              <Copy className="h-3.5 w-3.5 text-slate-500" />
                              <span>Copy Password</span>
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              destructive
                              onClick={() => handleDeleteUser(user.id, user.email)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                              <span>Delete User</span>
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </TableSurface>
          )}
        </div>
      ) : (
        <TableSurface
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
              signupPagination.pageItems.map(req => {
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
                      <Badge
                        variant={
                          req.status === "pending"
                            ? "warning"
                            : req.status === "approved"
                            ? "success"
                            : "destructive"
                        }
                      >
                        {req.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2 items-center">
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
                              isLoading={actionLoading[`reject_signup_${req.id}`]}
                            >
                              Reject
                            </Button>
                          </>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDeleteSignupRequest(req.id)}
                          isLoading={actionLoading[`delete_signup_${req.id}`]}
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

      {/* User Credential Create / Edit Dialog */}
      <UserCredentialDialog
        open={showUserModal}
        onOpenChange={setShowUserModal}
        editingUser={editingUser}
        form={userForm}
        onFormChange={setUserForm}
        onSubmit={handleUserSubmit}
        error={userModalError}
        copiedPassId={copiedPassId}
        onCopyPassword={handleCopyPassword}
        isSubmitting={isSubmittingUser}
      />

      {/* Signup Approval & Mapping Dialog */}
      <SignupApprovalDialog
        open={showApprovalModal}
        onOpenChange={setShowApprovalModal}
        signup={approvingSignup}
        approvingRole={approvingRole}
        onApprovingRoleChange={setApprovingRole}
        mappingType={mappingType}
        onMappingTypeChange={setMappingType}
        selectedReferenceId={selectedReferenceId}
        onSelectedReferenceIdChange={setSelectedReferenceId}
        mappingCollegeId={mappingCollegeId}
        onMappingCollegeIdChange={setMappingCollegeId}
        mappingDept={mappingDept}
        onMappingDeptChange={setMappingDept}
        mappingClassGroup={mappingClassGroup}
        onMappingClassGroupChange={setMappingClassGroup}
        onSubmit={handleApproveSignupSubmit}
        colleges={colleges}
        subjectGroups={subjectGroups}
        mentors={mentors}
        students={students}
        camList={camList}
        smes={smes}
        usersList={usersList}
        isSubmitting={isSubmittingApproval}
      />
    </div>
  );
};

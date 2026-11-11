"use client";

import React from "react";
import { ShieldCheck, ShieldAlert, X, Copy, Check } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";

export interface UserFormState {
  email: string;
  role: string;
  password?: string;
  reference_id?: string;
  status: "Active" | "Inactive";
}

export interface UserCredentialDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingUser: any | null;
  form: UserFormState;
  onFormChange: (form: UserFormState) => void;
  onSubmit: (e: React.FormEvent) => void;
  error?: string | null;
  copiedPassId?: string | null;
  onCopyPassword?: (id: string, plain: string) => void;
  isSubmitting?: boolean;
}

export const UserCredentialDialog: React.FC<UserCredentialDialogProps> = ({
  open,
  onOpenChange,
  editingUser,
  form,
  onFormChange,
  onSubmit,
  error,
  copiedPassId,
  onCopyPassword,
  isSubmitting = false
}) => {
  if (!open) return null;

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      ariaLabel="User Credential"
      overlayClassName="p-4 bg-slate-950/60 backdrop-blur-sm"
      panelClassName="max-w-md overflow-hidden animate-slideUp p-0 space-y-0 max-h-[90vh]"
    >
      <div className="flex justify-between items-center p-6 border-b border-gray-100 bg-gray-50">
        <h3 className="font-extrabold text-gray-900 text-sm flex items-center gap-1.5 font-sans">
          <ShieldCheck className="h-5 w-5 text-indigo-600" />
          {editingUser ? "Edit User" : "Add User"}
        </h3>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Close dialog"
          onClick={() => onOpenChange(false)}
          className="h-auto w-auto p-1 hover:bg-gray-200 rounded-lg transition-colors cursor-pointer text-gray-500 hover:text-gray-800"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      <form onSubmit={onSubmit} className="p-6 space-y-4 text-xs font-semibold">
        {error && (
          <div role="alert" className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 font-bold flex items-center gap-1.5">
            <ShieldAlert className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        <div className="space-y-1">
          <label className="text-[10px] text-gray-400 uppercase tracking-wider block font-bold">Email</label>
          <Input
            aria-label="Email"
            type="email"
            required
            placeholder="user@faceprep.in"
            value={form.email}
            onChange={(e) => onFormChange({ ...form, email: e.target.value })}
            className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3.5 py-2.5 font-bold focus:outline-none focus:ring-1 focus:ring-indigo-600"
          />
        </div>

        <div className="space-y-1">
          <label className="text-[10px] text-gray-400 uppercase tracking-wider block font-bold">Role</label>
          <Select
            aria-label="Role"
            value={form.role}
            onChange={(e) => onFormChange({ ...form, role: e.target.value })}
            className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3.5 py-2.5 font-bold focus:outline-none focus:ring-1 focus:ring-indigo-600 cursor-pointer"
          >
            <option value="admin">Admin</option>
            <option value="cm">Campus Manager (CM)</option>
            <option value="kam">Key Account Manager (KAM)</option>
            <option value="mentor">Faculty Mentor</option>
            <option value="sme">Subject Matter Expert (SME)</option>
            <option value="student">Student</option>
            <option value="fee_manager">Fee Manager</option>
            <option value="L and D">L&D</option>
            <option value="hr">HR</option>
          </Select>
        </div>

        {editingUser && (
          <div className="p-3 bg-indigo-50/60 border border-indigo-100 rounded-xl flex items-center justify-between">
            <div>
              <div className="text-[10px] text-indigo-700 font-bold uppercase tracking-wider">Current Password</div>
              <div className="font-mono text-sm font-black text-indigo-950 mt-0.5">
                {editingUser.plain_password || "password123"}
              </div>
            </div>
            <Button
              variant="ghost"
              type="button"
              onClick={() => onCopyPassword && onCopyPassword(editingUser.id, editingUser.plain_password || "password123")}
              className="h-auto flex items-center gap-1 text-[11px] font-bold text-indigo-700 bg-white hover:bg-indigo-50 border border-indigo-200 px-2.5 py-1.5 rounded-lg transition-colors cursor-pointer"
            >
              {copiedPassId === editingUser.id ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
              Copy
            </Button>
          </div>
        )}

        <div className="space-y-1">
          <label className="text-[10px] text-gray-400 uppercase tracking-wider block font-bold">
            {editingUser ? "New Password (optional)" : "Password"}
          </label>
          <Input
            type="text"
            placeholder={editingUser ? "Leave blank to keep unchanged" : "Default: password123"}
            value={form.password || ""}
            onChange={(e) => onFormChange({ ...form, password: e.target.value })}
            className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3.5 py-2.5 font-bold focus:outline-none focus:ring-1 focus:ring-indigo-600 font-mono text-xs"
          />
        </div>

        <div className="space-y-1">
          <label className="text-[10px] text-gray-400 uppercase tracking-wider block font-bold">Reference ID (optional)</label>
          <Input
            aria-label="Reference ID (optional)"
            type="text"
            placeholder="e.g. mentor_101 or student_101"
            value={form.reference_id || ""}
            onChange={(e) => onFormChange({ ...form, reference_id: e.target.value })}
            className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3.5 py-2.5 font-bold focus:outline-none focus:ring-1 focus:ring-indigo-600 font-mono text-[11px]"
          />
        </div>

        <div className="space-y-1">
          <label className="text-[10px] text-gray-400 uppercase tracking-wider block font-bold">Status</label>
          <Select
            aria-label="Status"
            value={form.status}
            onChange={(e) => onFormChange({ ...form, status: e.target.value as "Active" | "Inactive" })}
            className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3.5 py-2.5 font-bold focus:outline-none focus:ring-1 focus:ring-indigo-600 cursor-pointer"
          >
            <option value="Active">Active</option>
            <option value="Inactive">Inactive</option>
          </Select>
        </div>

        <div className="flex justify-end gap-2 pt-4 border-t border-gray-100">
          <Button
            variant="ghost"
            type="button"
            onClick={() => onOpenChange(false)}
            className="h-auto px-4 py-2 hover:bg-gray-100 text-gray-500 rounded-xl transition-all font-bold cursor-pointer"
          >
            Cancel
          </Button>
          <Button
            variant="ghost"
            type="submit"
            disabled={isSubmitting}
            className="h-auto btn-gradient px-5 py-2 text-white rounded-xl shadow-sm transition-all font-bold cursor-pointer disabled:opacity-60"
          >
            {isSubmitting ? "Saving..." : editingUser ? "Save Changes" : "Create User"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
};

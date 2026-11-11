"use client";

import React, { useState } from "react";
import { BookOpen, Plus, Edit, Trash2, X } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/button";
import { TableSurface } from "@/components/dashboard/TableSurface";
import { TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
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
import { useToast } from "@/context/ToastContext";
import { useApp } from "@/context/AppContext";

export interface SmeUser {
  id: string;
  name: string;
  email: string;
  subject?: string;
}

export interface SmesTabProps {
  smes?: SmeUser[];
  subjectGroups?: Array<{ id: string; name: string }>;
  onCreateSme?: (id: string, name: string, email: string, subject?: string) => Promise<any>;
  onUpdateSme?: (id: string, name: string, email: string, subject?: string) => Promise<any>;
  onDeleteSme?: (id: string) => Promise<void>;
  loadingActions?: Record<string, boolean>;
}

export const SmesTab: React.FC<SmesTabProps> = ({
  smes: propSmes,
  subjectGroups: propSubjectGroups,
  onCreateSme: propOnCreateSme,
  onUpdateSme: propOnUpdateSme,
  onDeleteSme: propOnDeleteSme,
  loadingActions: propLoadingActions
}) => {
  const { toast, confirm: showConfirm } = useToast();
  const app = useApp();
  const smes = propSmes ?? app.smes ?? [];
  const subjectGroups = propSubjectGroups ?? app.subjectGroups ?? [];

  const [localLoading, setLocalLoading] = useState<Record<string, boolean>>({});
  const loadingActions = propLoadingActions ?? localLoading;

  const handleDeleteSme = async (id: string) => {
    if (propOnDeleteSme) return propOnDeleteSme(id);
    const ok = await showConfirm({
      message: "Delete this Subject Matter Expert? Their login and demo assignments are removed.",
      danger: true,
      confirmLabel: "Delete"
    });
    if (!ok) return;
    setLocalLoading(prev => ({ ...prev, [`sme_${id}`]: true }));
    try {
      const result = await app.deleteSmeUser(id);
      if (!result.success) {
        toast(result.message || "Failed to delete SME.", "error");
        return;
      }
      toast("SME deleted successfully.", "success");
    } finally {
      setLocalLoading(prev => ({ ...prev, [`sme_${id}`]: false }));
    }
  };
  const [showModal, setShowModal] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [form, setForm] = useState({
    id: "",
    name: "",
    email: "",
    subject: ""
  });

  const pagination = usePagination(smes || [], {
    pageSize: 10,
    pageSizeOptions: [10, 25, 50]
  });

  const handleOpenAdd = () => {
    setIsEditing(false);
    const maxNum = (smes || []).reduce((acc, curr) => {
      const num = parseInt(curr.id.replace("sme_", ""), 10);
      return isNaN(num) ? acc : Math.max(acc, num);
    }, 0);
    setForm({
      id: `sme_${maxNum + 1}`,
      name: "",
      email: "",
      subject: subjectGroups[0]?.name || ""
    });
    setShowModal(true);
  };

  const handleOpenEdit = (sme: SmeUser) => {
    setIsEditing(true);
    setForm({
      id: sme.id,
      name: sme.name,
      email: sme.email,
      subject: sme.subject || ""
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.id || !form.name || !form.email) {
      toast("Please fill in all required fields.", "error");
      return;
    }
    setIsSaving(true);
    try {
      if (isEditing) {
        if (propOnUpdateSme) {
          await propOnUpdateSme(form.id, form.name, form.email, form.subject);
        } else {
          const result = await app.updateSmeUser(form.id, form.name, form.email, form.subject);
          if (!result.success) {
            toast(result.message || "Failed to save SME.", "error");
            return;
          }
        }
        toast("SME updated successfully.", "success");
      } else {
        if (propOnCreateSme) {
          await propOnCreateSme(form.id, form.name, form.email, form.subject);
        } else {
          const result = await app.createSmeUser(form.id, form.name, form.email, form.subject);
          if (!result.success) {
            toast(result.message || "Failed to save SME.", "error");
            return;
          }
        }
        toast("SME created successfully.", "success");
      }
      setShowModal(false);
    } catch (err: any) {
      toast(err.message || "Failed to save SME.", "error");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-4 animate-fadeIn font-sans text-xs">
      <PageHeader
        icon={BookOpen}
        title="Subject Matter Experts"
        actions={
          <Button
            variant="ghost"
            onClick={handleOpenAdd}
            className="h-auto btn-gradient px-4 py-2 rounded-xl font-bold flex items-center gap-1.5 transition-all shadow-sm cursor-pointer text-white"
          >
            <Plus className="h-4 w-4" />
            Add SME
          </Button>
        }
      />

      <TableSurface
        footer={
          <Pagination
            currentPage={pagination.page}
            totalItems={(smes || []).length}
            pageSize={pagination.pageSize}
            onPageChange={pagination.setPage}
            onPageSizeChange={pagination.setPageSize}
            pageSizeOptions={pagination.pageSizeOptions}
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
          {pagination.pageItems.length > 0 ? (
            pagination.pageItems.map((sme) => (
              <TableRow key={sme.id}>
                <TableCell className="font-mono text-gray-500">{sme.id}</TableCell>
                <TableCell className="font-bold text-gray-900">{sme.name}</TableCell>
                <TableCell className="font-mono text-gray-600">{sme.email}</TableCell>
                <TableCell>
                  <Badge variant="secondary">{sme.subject || "Unassigned"}</Badge>
                </TableCell>
                <TableCell className="text-right">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <ActionDropdownButton size="sm" title="SME Options" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuLabel>SME Options</DropdownMenuLabel>
                      <DropdownMenuItem onClick={() => handleOpenEdit(sme)}>
                        <Edit className="h-3.5 w-3.5 mr-2 text-slate-500" />
                        Edit Profile
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        className="text-rose-600 focus:text-rose-700 focus:bg-rose-50"
                        onClick={() => handleDeleteSme(sme.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5 mr-2" />
                        Delete SME
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell colSpan={5} className="h-32 text-center">
                <div className="flex flex-col items-center gap-2 text-gray-400">
                  <BookOpen className="h-8 w-8" />
                  <p className="text-sm font-semibold">
                    No Subject Matter Experts assigned yet. Click "Add SME" to get started.
                  </p>
                </div>
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </TableSurface>

      {/* SME Modal */}
      {showModal && (
        <Dialog
          open={showModal}
          onOpenChange={(next) => {
            if (!next) setShowModal(false);
          }}
          ariaLabel="Subject Matter Expert"
          overlayClassName="bg-slate-950/60 backdrop-blur-sm p-4"
          panelClassName="max-w-md overflow-hidden animate-slideUp p-0 space-y-0 max-h-[90vh]"
        >
          <div className="flex justify-between items-center p-6 border-b border-gray-100 bg-gray-50">
            <h3 className="font-extrabold text-gray-900 text-sm flex items-center gap-1.5 font-sans">
              <BookOpen className="h-5 w-5 text-indigo-600" />
              {isEditing ? "Edit Subject Matter Expert" : "Add Subject Matter Expert"}
            </h3>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Close SME dialog"
              onClick={() => setShowModal(false)}
              className="h-auto w-auto p-1 hover:bg-gray-200 rounded-lg transition-colors cursor-pointer text-gray-500 hover:text-gray-800"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          <div className="p-6 space-y-4 text-xs font-semibold font-sans">
            <div className="space-y-1">
              <label className="text-[10px] text-gray-400 uppercase tracking-wider block">SME ID</label>
              <Input
                aria-label="SME ID"
                type="text"
                disabled={isEditing}
                value={form.id}
                onChange={(e) => setForm({ ...form, id: e.target.value })}
                placeholder="e.g. sme_4"
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-gray-700 bg-white outline-none focus:ring-1 focus:ring-indigo-600 disabled:bg-gray-100 disabled:text-gray-400 font-mono"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[10px] text-gray-400 uppercase tracking-wider block">Full Name</label>
              <Input
                aria-label="Full Name"
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. Dr. Ramesh Kumar"
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-gray-700 bg-white outline-none focus:ring-1 focus:ring-indigo-600"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[10px] text-gray-400 uppercase tracking-wider block">Email Address</label>
              <Input
                aria-label="Email Address"
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="e.g. ramesh.sme@faceprep.in"
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-gray-700 bg-white outline-none focus:ring-1 focus:ring-indigo-600"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[10px] text-gray-400 uppercase tracking-wider block">
                Subject Group Specialization
              </label>
              <Select
                aria-label="Subject Group Specialization"
                value={form.subject}
                onChange={(e) => setForm({ ...form, subject: e.target.value })}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-gray-700 bg-white outline-none focus:ring-1 focus:ring-indigo-600"
              >
                <option value="">-- Unassigned --</option>
                {subjectGroups &&
                  subjectGroups.map((sg) => (
                    <option key={sg.id} value={sg.name}>
                      {sg.name}
                    </option>
                  ))}
              </Select>
            </div>

            <div className="flex justify-end gap-3 pt-3 border-t border-gray-100">
              <Button
                variant="ghost"
                type="button"
                onClick={() => setShowModal(false)}
                className="h-auto px-4 py-2 border border-gray-200 rounded-xl hover:bg-gray-50 text-gray-700 transition-colors cursor-pointer"
              >
                Cancel
              </Button>
              <LoadingButton
                type="button"
                isLoading={isSaving}
                loadingText="Saving..."
                variant="secondary"
                onClick={handleSave}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold transition-all shadow-md cursor-pointer"
              >
                Save SME
              </LoadingButton>
            </div>
          </div>
        </Dialog>
      )}
    </div>
  );
};

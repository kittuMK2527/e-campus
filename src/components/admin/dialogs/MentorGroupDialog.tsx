"use client";

import React from "react";
import { BookOpen, X, ShieldAlert } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { LoadingButton } from "@/components/ui/LoadingButton";

export interface MentorGroupFormState {
  name: string;
  description: string;
  lead_sme_id: string;
  lead_sme_name: string;
  subjectIds: string[];
  mentorIds: string[];
}

export interface MentorGroupDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing: boolean;
  form: MentorGroupFormState;
  onFormChange: (form: MentorGroupFormState) => void;
  onSubmit: (e: React.FormEvent) => void;
  error?: string | null;
  isSubmitting?: boolean;
  smes: any[];
}

export const MentorGroupDialog: React.FC<MentorGroupDialogProps> = ({
  open,
  onOpenChange,
  editing,
  form,
  onFormChange,
  onSubmit,
  error,
  isSubmitting = false,
  smes
}) => {
  if (!open) return null;

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      ariaLabel="Mentor Group"
      overlayClassName="bg-slate-950/60 backdrop-blur-sm p-4"
      panelClassName="max-w-md overflow-hidden animate-slideUp p-0 space-y-0 max-h-[90vh]"
    >
      <div className="flex justify-between items-center p-6 border-b border-gray-100 bg-gray-50">
        <h3 className="font-extrabold text-gray-900 text-sm flex items-center gap-1.5">
          <BookOpen className="h-5 w-5 text-indigo-600" />
          {editing ? "Edit Mentor Group" : "Create Mentor Group"}
        </h3>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Close group dialog"
          onClick={() => onOpenChange(false)}
          className="h-auto w-auto p-1 hover:bg-gray-200 rounded-lg transition-colors cursor-pointer text-gray-500 hover:text-gray-800"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      <form onSubmit={onSubmit} className="p-6 space-y-3.5 text-xs font-semibold">
        {error && (
          <div role="alert" className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 font-bold flex items-center gap-1.5">
            <ShieldAlert className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        <div className="space-y-1">
          <label className="text-[10px] text-gray-400 uppercase tracking-wider block">Group Name *</label>
          <Input
            aria-label="Group Name"
            type="text"
            required
            placeholder="e.g. Technical Skills, Aptitude, Soft Skills"
            value={form.name}
            onChange={e => onFormChange({ ...form, name: e.target.value })}
            className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3.5 py-2.5 font-bold focus:outline-none focus:ring-1 focus:ring-indigo-600"
          />
        </div>

        <div className="space-y-1">
          <label className="text-[10px] text-gray-400 uppercase tracking-wider block">Lead / Head SME</label>
          <Select
            aria-label="Lead SME"
            value={form.lead_sme_id}
            onChange={e => {
              const selectedId = e.target.value;
              const selectedSme = smes.find(s => s.id === selectedId);
              onFormChange({
                ...form,
                lead_sme_id: selectedId,
                lead_sme_name: selectedSme ? selectedSme.name : ""
              });
            }}
            className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 font-bold focus:outline-none focus:ring-1 focus:ring-indigo-600 cursor-pointer text-gray-800"
          >
            <option value="">— Unassigned —</option>
            {smes.map((s: any) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.email})
              </option>
            ))}
          </Select>
        </div>

        <div className="space-y-1">
          <label className="text-[10px] text-gray-400 uppercase tracking-wider block">Description</label>
          <Textarea
            aria-label="Description"
            rows={3}
            placeholder="Describe the focus area or learning scope of this mentor group..."
            value={form.description}
            onChange={e => onFormChange({ ...form, description: e.target.value })}
            className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 font-medium focus:outline-none focus:ring-1 focus:ring-indigo-600 text-xs"
          />
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
          <LoadingButton
            type="submit"
            isLoading={isSubmitting}
            className="btn-gradient shadow-sm text-white px-5 py-2 rounded-xl text-xs font-bold cursor-pointer transition-all"
          >
            {editing ? "Save Changes" : "Create Group"}
          </LoadingButton>
        </div>
      </form>
    </Dialog>
  );
};

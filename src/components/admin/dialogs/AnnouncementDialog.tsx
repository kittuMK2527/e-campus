"use client";

import React from "react";
import { Megaphone, X } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { AnnouncementFormState } from "@/components/admin/types";

export interface AnnouncementDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  form: AnnouncementFormState;
  onFormChange: (form: AnnouncementFormState) => void;
  onSubmit: (e: React.FormEvent) => void;
  colleges: Array<{ id: string; name: string }>;
  isSubmitting?: boolean;
}

export const AnnouncementDialog: React.FC<AnnouncementDialogProps> = ({
  open,
  onOpenChange,
  form,
  onFormChange,
  onSubmit,
  colleges,
  isSubmitting = false
}) => {
  if (!open) return null;

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      ariaLabel="Compose Campus Announcement"
      overlayClassName="p-4 bg-slate-950/60 backdrop-blur-sm"
      panelClassName="max-w-md overflow-hidden animate-slideUp p-0 space-y-0 max-h-[90vh]"
    >
      <div className="flex justify-between items-center p-6 border-b border-gray-100 bg-gray-50">
        <h3 className="font-extrabold text-gray-900 text-sm flex items-center gap-1.5">
          <Megaphone className="h-5 w-5 text-indigo-600" />
          Compose Campus Announcement
        </h3>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Close announcement dialog"
          onClick={() => onOpenChange(false)}
          className="h-auto w-auto p-1 hover:bg-gray-200 rounded-lg transition-colors cursor-pointer text-gray-500 hover:text-gray-800"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      <form onSubmit={onSubmit} className="p-6 space-y-4 text-xs font-semibold">
        <div className="space-y-1">
          <label className="text-[10px] text-gray-400 uppercase tracking-wider block">Title</label>
          <Input
            aria-label="Title"
            type="text"
            required
            placeholder="e.g. End Semester Examinations Schedule"
            value={form.title}
            onChange={(e) => onFormChange({ ...form, title: e.target.value })}
            className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3.5 py-2.5 font-bold focus:outline-none focus:ring-1 focus:ring-indigo-600"
          />
        </div>

        <div className="space-y-1">
          <label className="text-[10px] text-gray-400 uppercase tracking-wider block">Description</label>
          <Textarea
            aria-label="Description"
            required
            placeholder="Compose notice content here..."
            value={form.description}
            onChange={(e) => onFormChange({ ...form, description: e.target.value })}
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
              value={form.target_role}
              onChange={(e) => onFormChange({ ...form, target_role: e.target.value })}
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
              value={form.college_id}
              onChange={(e) => onFormChange({ ...form, college_id: e.target.value })}
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
            {isSubmitting ? "Publishing..." : "Publish Notice"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
};

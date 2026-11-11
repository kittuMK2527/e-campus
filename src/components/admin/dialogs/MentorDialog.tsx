"use client";

import React, { useState } from "react";
import { Users, X, ShieldAlert, Search } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { LoadingButton } from "@/components/ui/LoadingButton";
import { College, Subject } from "@/context/AppContext";

export interface MentorFormState {
  id: string;
  name: string;
  email: string;
  mentor_group: string;
  avatar: string;
  subjects: string;
  classes: string;
  college_id: string;
}

export interface MentorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing: boolean;
  form: MentorFormState;
  onFormChange: (form: MentorFormState) => void;
  onSubmit: (e: React.FormEvent) => void;
  error?: string | null;
  isSubmitting?: boolean;
  colleges: College[];
  subjectGroups: Array<{ id: string; name: string }>;
  subjectsList: Subject[];
  isCampusShiftBased?: boolean;
}

export const MentorDialog: React.FC<MentorDialogProps> = ({
  open,
  onOpenChange,
  editing,
  form,
  onFormChange,
  onSubmit,
  error,
  isSubmitting = false,
  colleges,
  subjectGroups,
  subjectsList,
  isCampusShiftBased = false
}) => {
  const [subjectSearch, setSubjectSearch] = useState("");

  if (!open) return null;

  const currentCheckedList = (form.subjects && typeof form.subjects === "string")
    ? form.subjects.split("\n").map(s => s.trim()).filter(Boolean)
    : [];

  const filteredSubjects = (subjectsList || []).filter(s => {
    const matchesSearch =
      s.name.toLowerCase().includes(subjectSearch.toLowerCase()) ||
      (s.subject_group || s.department || "").toLowerCase().includes(subjectSearch.toLowerCase());
    if (!subjectSearch && form.mentor_group) {
      const mg = form.mentor_group.toLowerCase();
      const sg = (s.subject_group || s.department || "").toLowerCase();
      return sg === mg || sg.includes(mg) || mg.includes(sg);
    }
    return matchesSearch;
  });

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      ariaLabel="Faculty Mentor"
      overlayClassName="bg-slate-950/60 backdrop-blur-sm p-4"
      panelClassName="max-w-lg overflow-hidden animate-slideUp p-0 space-y-0 max-h-[90vh]"
    >
      <div className="flex justify-between items-center p-6 border-b border-gray-100 bg-gray-50">
        <h3 className="font-extrabold text-gray-900 text-sm flex items-center gap-1.5">
          <Users className="h-5 w-5 text-indigo-600" />
          {editing ? "Edit Faculty Mentor" : "Add Faculty Mentor"}
        </h3>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Close mentor dialog"
          onClick={() => onOpenChange(false)}
          className="h-auto w-auto p-1 hover:bg-gray-200 rounded-lg transition-colors cursor-pointer text-gray-500 hover:text-gray-800"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      <form onSubmit={onSubmit} className="p-6 space-y-3.5 text-xs font-semibold max-h-[80vh] overflow-y-auto">
        {error && (
          <div role="alert" className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 font-bold flex items-center gap-1.5">
            <ShieldAlert className="h-4 w-4 shrink-0" />
            {error}
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
              disabled={editing}
              value={form.id}
              onChange={e => onFormChange({ ...form, id: e.target.value })}
              className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3.5 py-2.5 font-bold focus:outline-none focus:ring-1 focus:ring-indigo-600 disabled:bg-gray-100 disabled:text-gray-400"
            />
          </div>

          <div className="space-y-1">
            <label className="text-[10px] text-gray-400 uppercase tracking-wider block">Initials / Avatar</label>
            <Input
              aria-label="Initials / Avatar"
              type="text"
              placeholder="e.g. MS (Leave blank to auto-generate)"
              value={form.avatar}
              onChange={e => onFormChange({ ...form, avatar: e.target.value })}
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
            value={form.name}
            onChange={e => onFormChange({ ...form, name: e.target.value })}
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
            value={form.email}
            onChange={e => onFormChange({ ...form, email: e.target.value })}
            className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3.5 py-2.5 font-bold focus:outline-none focus:ring-1 focus:ring-indigo-600"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          <div className="space-y-1">
            <label className="text-[10px] text-gray-400 uppercase tracking-wider block">Assigned Campus</label>
            <Select
              aria-label="Assigned Campus"
              required
              value={form.college_id}
              onChange={e => onFormChange({ ...form, college_id: e.target.value })}
              className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 font-bold focus:outline-none focus:ring-1 focus:ring-indigo-600 cursor-pointer"
            >
              <option value="">Select Campus</option>
              {colleges.map(c => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
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
            value={form.mentor_group}
            onChange={e => onFormChange({ ...form, mentor_group: e.target.value })}
            className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 font-bold focus:outline-none focus:ring-1 focus:ring-indigo-600 cursor-pointer text-gray-800"
          >
            <option value="">— Select Mentor Group —</option>
            {subjectGroups.map(sg => (
              <option key={sg.id} value={sg.name}>
                {sg.name}
              </option>
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
              value={subjectSearch}
              onChange={e => setSubjectSearch(e.target.value)}
              className="w-full bg-gray-50 border border-gray-200 rounded-lg pl-8 pr-3 py-1.5 text-[10px] focus:outline-none focus:ring-1 focus:ring-indigo-600 font-bold"
            />
          </div>

          <div className="border border-gray-200 rounded-xl bg-gray-50 p-3.5 max-h-36 overflow-y-auto space-y-1.5 text-[11px] font-bold">
            {filteredSubjects.map(s => {
              const isChecked = currentCheckedList.includes(s.name);
              return (
                <label key={s.id} className="flex items-start gap-2 py-1 px-1.5 hover:bg-white rounded cursor-pointer transition-colors text-gray-700">
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={e => {
                      let newList;
                      if (e.target.checked) {
                        newList = [...currentCheckedList, s.name];
                      } else {
                        newList = currentCheckedList.filter(item => item !== s.name);
                      }
                      onFormChange({ ...form, subjects: newList.join("\n") });
                    }}
                    className="rounded text-indigo-600 focus:ring-indigo-500 h-3.5 w-3.5 cursor-pointer mt-0.5"
                  />
                  <div className="leading-tight">
                    <span className="font-bold text-gray-800">{s.name}</span>
                    <span className="text-[9px] text-gray-400 block font-semibold">
                      {s.department} • {s.semester}
                    </span>
                  </div>
                </label>
              );
            })}
            {filteredSubjects.length === 0 && (
              <div className="text-center text-gray-500 italic py-2">
                No subjects found matching your criteria.
              </div>
            )}
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
          <LoadingButton
            type="submit"
            isLoading={isSubmitting}
            className="btn-gradient shadow-sm text-white px-5 py-2 rounded-xl text-xs font-bold cursor-pointer transition-all"
          >
            {editing ? "Save Changes" : "Create Mentor"}
          </LoadingButton>
        </div>
      </form>
    </Dialog>
  );
};

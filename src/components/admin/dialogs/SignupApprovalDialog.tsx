"use client";

import React from "react";
import { Dialog } from "@/components/ui/dialog";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { LoadingButton } from "@/components/ui/LoadingButton";
import { College } from "@/context/AppContext";

export interface SignupApprovalDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  signup: { id: string; name: string; email: string } | null;
  approvingRole: string;
  onApprovingRoleChange: (role: string) => void;
  mappingType: "create_new" | "link_existing";
  onMappingTypeChange: (type: "create_new" | "link_existing") => void;
  selectedReferenceId: string;
  onSelectedReferenceIdChange: (id: string) => void;
  mappingCollegeId: string;
  onMappingCollegeIdChange: (id: string) => void;
  mappingDept: string;
  onMappingDeptChange: (dept: string) => void;
  mappingClassGroup: string;
  onMappingClassGroupChange: (group: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  colleges: College[];
  subjectGroups: Array<{ id: string; name: string }>;
  mentors: any[];
  students: any[];
  camList: any[];
  smes: any[];
  usersList: any[];
  isSubmitting?: boolean;
}

export const SignupApprovalDialog: React.FC<SignupApprovalDialogProps> = ({
  open,
  onOpenChange,
  signup,
  approvingRole,
  onApprovingRoleChange,
  mappingType,
  onMappingTypeChange,
  selectedReferenceId,
  onSelectedReferenceIdChange,
  mappingCollegeId,
  onMappingCollegeIdChange,
  mappingDept,
  onMappingDeptChange,
  mappingClassGroup,
  onMappingClassGroupChange,
  onSubmit,
  colleges,
  subjectGroups,
  mentors,
  students,
  camList,
  smes,
  usersList,
  isSubmitting = false
}) => {
  if (!open || !signup) return null;

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      ariaLabel="Approve User Request"
      overlayClassName="bg-slate-950/60 backdrop-blur-sm p-4"
      panelClassName="max-w-md overflow-hidden animate-scaleIn font-sans p-0 space-y-0 max-h-[90vh]"
    >
      <div className="p-6 border-b border-gray-200 flex justify-between items-center bg-gray-50">
        <div>
          <h3 className="text-base font-black text-gray-900">Approve User</h3>
          <p className="text-[10px] text-gray-500 font-semibold mt-0.5">{signup.email}</p>
        </div>
        <button
          type="button"
          aria-label="Close dialog"
          onClick={() => onOpenChange(false)}
          className="text-gray-400 hover:text-gray-600 font-bold text-lg cursor-pointer"
        >
          ✕
        </button>
      </div>

      <form onSubmit={onSubmit} className="p-6 space-y-4 text-xs font-semibold">
        {/* User Details */}
        <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 space-y-1">
          <div className="flex justify-between">
            <span className="text-gray-500">Name:</span>
            <span className="text-gray-900 font-bold">{signup.name}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Status:</span>
            <span className="text-amber-600 font-bold uppercase">Pending</span>
          </div>
        </div>

        {/* Role selection */}
        <div className="space-y-1">
          <label className="text-[10px] text-gray-400 uppercase tracking-wider block font-bold">Role</label>
          <Select
            aria-label="Role"
            required
            value={approvingRole}
            onChange={(e) => onApprovingRoleChange(e.target.value)}
            className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2 font-bold focus:outline-none focus:ring-1 focus:ring-indigo-600 cursor-pointer"
          >
            <option value="student">Student</option>
            <option value="mentor">Mentor</option>
            <option value="cm">Campus Manager (CM)</option>
            <option value="sme">Subject Matter Expert (SME)</option>
          </Select>
        </div>

        {/* Mapping Type Selection */}
        <div className="space-y-1">
          <label className="text-[10px] text-gray-400 uppercase tracking-wider block font-bold">Account Type</label>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => onMappingTypeChange("create_new")}
              className={`py-2 px-3 rounded-xl border font-bold text-center cursor-pointer transition-all ${
                mappingType === "create_new"
                  ? "bg-indigo-50 border-indigo-600 text-indigo-600 animate-fadeIn"
                  : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50"
              }`}
            >
              New Profile
            </button>
            <button
              type="button"
              onClick={() => onMappingTypeChange("link_existing")}
              className={`py-2 px-3 rounded-xl border font-bold text-center cursor-pointer transition-all ${
                mappingType === "link_existing"
                  ? "bg-indigo-50 border-indigo-600 text-indigo-600 animate-fadeIn"
                  : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50"
              }`}
            >
              Link Existing
            </button>
          </div>
        </div>

        {/* Conditional Fields based on selection */}
        {mappingType === "link_existing" ? (
          <div className="space-y-1">
            <label className="text-[10px] text-gray-400 uppercase tracking-wider block font-bold">Select Profile</label>
            <Select
              aria-label="Select Profile"
              required
              value={selectedReferenceId}
              onChange={(e) => onSelectedReferenceIdChange(e.target.value)}
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
          <div className="space-y-3">
            {approvingRole !== "sme" && (
              <div className="space-y-1">
                <label className="text-[10px] text-gray-400 uppercase tracking-wider block font-bold">Campus</label>
                <Select
                  aria-label="Campus"
                  required
                  value={mappingCollegeId}
                  onChange={(e) => onMappingCollegeIdChange(e.target.value)}
                  className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2 font-bold focus:outline-none focus:ring-1 focus:ring-indigo-600 cursor-pointer"
                >
                  <option value="">-- Select Campus --</option>
                  {colleges.map((col) => (
                    <option key={col.id} value={col.id}>
                      {col.name}
                    </option>
                  ))}
                </Select>
              </div>
            )}

            {(approvingRole === "mentor" || approvingRole === "student") && (
              <div className="space-y-1">
                <label className="text-[10px] text-gray-400 uppercase tracking-wider block font-bold">Department / Group</label>
                <Select
                  aria-label="Department / Group"
                  required
                  value={mappingDept}
                  onChange={(e) => onMappingDeptChange(e.target.value)}
                  className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2 font-bold focus:outline-none focus:ring-1 focus:ring-indigo-600 cursor-pointer"
                >
                  <option value="">-- Select Group --</option>
                  {subjectGroups.map((sg) => (
                    <option key={sg.id} value={sg.name}>
                      {sg.name}
                    </option>
                  ))}
                </Select>
              </div>
            )}

            {approvingRole === "student" && (
              <div className="space-y-1">
                <label className="text-[10px] text-gray-400 uppercase tracking-wider block font-bold">Class Group</label>
                <Input
                  aria-label="Class Group"
                  type="text"
                  required
                  placeholder="e.g. CS-A"
                  value={mappingClassGroup}
                  onChange={(e) => onMappingClassGroupChange(e.target.value)}
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
            onClick={() => onOpenChange(false)}
            className="flex-1 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-xl text-center cursor-pointer transition-colors"
          >
            Cancel
          </button>
          <LoadingButton
            type="submit"
            isLoading={isSubmitting}
            loadingText="Approving..."
            variant="primary"
            className="flex-1 py-2 text-center"
          >
            Approve
          </LoadingButton>
        </div>
      </form>
    </Dialog>
  );
};

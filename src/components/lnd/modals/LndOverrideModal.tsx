"use client";

import React from "react";
import { Settings, Trash2, X } from "lucide-react";
import { Dialog } from "../../ui/dialog";
import { Select } from "../../Select";

/** Manual override / create for a single L&D session. */
export interface LndOverrideModalProps {
  bookDemoSession: (...args: any[]) => any;
  classGroups: any[];
  collegeTimeSlots: any[];
  deleteDemoSession: (...args: any[]) => any;
  editSession: any;
  handleSaveEdit: (...args: any[]) => any;
  setEditSession: (v: any) => void;
  showConfirm: (options: { title?: string; message: string; confirmLabel?: string; danger?: boolean }) => Promise<boolean>;
  smes: any[];
  toast: (m: string, k?: any) => void;
}

export default function LndOverrideModal({
  bookDemoSession,
  classGroups,
  collegeTimeSlots,
  deleteDemoSession,
  editSession,
  handleSaveEdit,
  setEditSession,
  showConfirm,
  smes,
  toast
}: LndOverrideModalProps) {
  return (
      <Dialog
        open={editSession !== null}
        onOpenChange={(next) => {
          if (!next) setEditSession(null);
        }}
        ariaLabel={editSession.id ? "Edit L&D session" : "Create L&D session"}
        overlayClassName="bg-slate-950/60 backdrop-blur-sm"
        panelClassName="max-w-md rounded-2xl p-6 bg-white dark:bg-slate-900 max-h-[90vh]"
      >
  
          <button
            onClick={setEditSession.bind(null, null)}
            aria-label="Close session editor"
            className="absolute right-4 top-4 p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl text-slate-400 hover:text-slate-800 dark:hover:text-white transition-colors cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
  
          <div className="flex items-center gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
            <div className="p-1.5 rounded-lg bg-[#4F46E5]/10 text-[#4F46E5]">
              <Settings className="h-4.5 w-4.5" />
            </div>
            <h3 className="text-sm font-black uppercase text-slate-900 dark:text-white tracking-wider">
              {editSession.id ? "Manual Override L&D Session Session" : "Schedule New L&D Session Session"}
            </h3>
          </div>
  
          <form onSubmit={editSession.id ? handleSaveEdit : async (e) => {
            e.preventDefault();
            try {
              const selectedSme = smes.find(s => s.id === editSession.smeId);
              const res = await bookDemoSession(
                editSession.mentorId,
                editSession.mentorName,
                editSession.smeId,
                selectedSme ? selectedSme.name : editSession.smeName,
                editSession.dateStr,
                editSession.timeSlot,
                editSession.subject,
                editSession.stream,
                editSession.week
              );
              if (res.success) {
                toast("L&D session scheduled successfully!", "success");
                setEditSession(null);
              } else {
                toast(res.message, "error");
              }
            } catch (err: any) {
              toast(err.message, "error");
            }
          }} className="space-y-4">
  
            {/* Mentor Info */}
            <div className="space-y-1">
              <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Faculty Mentor</label>
              <input
                type="text"
                aria-label="Faculty Mentor"
                value={editSession.mentorName}
                disabled
                className="w-full px-3 py-2 text-xs font-bold bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-500 dark:text-slate-400"
              />
            </div>
  
            {/* Cohort Stream */}
            <Select
              label="Class Group / Cohort"
              value={editSession.stream}
              onChange={(e) => setEditSession({ ...editSession, stream: e.target.value })}
              options={[
                ...classGroups.map(cg => ({ value: cg, label: cg })),
                { value: "General Stream", label: "General Stream" }
              ]}
            />
  
            {/* Mentor Group Area */}
            <div className="space-y-1">
              <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Mentor Group</label>
              <input
                type="text"
                aria-label="Mentor Group"
                value={editSession.subject}
                onChange={(e) => setEditSession({ ...editSession, subject: e.target.value })}
                className="w-full px-3 py-2 text-xs font-bold border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-900 text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#4F46E5]/30 focus:border-[#4F46E5]"
              />
            </div>
  
            {/* Assigned SME */}
            <Select
              label="Subject Matter Expert (SME)"
              value={editSession.smeId}
              onChange={(e) => setEditSession({ ...editSession, smeId: e.target.value })}
              options={smes.map(sme => ({ value: sme.id, label: `${sme.name} (${sme.subject || "General"})` }))}
            />
  
            <div className="grid grid-cols-2 gap-4">
              {/* Date */}
              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Date</label>
                <input
                  type="date"
                  aria-label="Date"
                  value={editSession.dateStr}
                  onChange={(e) => setEditSession({ ...editSession, dateStr: e.target.value })}
                  className="w-full px-3 py-1.5 text-xs font-bold border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-900 text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#4F46E5]/30 focus:border-[#4F46E5] cursor-pointer"
                />
              </div>
  
              {/* Timeslot */}
              <Select
                label="Time Period"
                value={editSession.timeSlot}
                onChange={(e) => setEditSession({ ...editSession, timeSlot: e.target.value })}
                options={collegeTimeSlots.map(t => ({ value: t, label: t }))}
              />
            </div>
  
            {editSession.id && (
              <div className="flex justify-end pt-1">
                <button
                  type="button"
                  onClick={async () => {
                    const ok = await showConfirm({
                      title: "Cancel L&D Session",
                      message: "Deleting this session frees the slot. This cannot be undone.",
                      danger: true,
                      confirmLabel: "Cancel Session"
                    });
                    if (!ok) return;
                    const res = await deleteDemoSession(editSession.id);
                    if (res?.success === false) {
                      toast(res.message || "Failed to cancel the session.", "error");
                      return;
                    }
                    setEditSession(null);
                  }}
                  className="text-xs font-black text-rose-500 hover:text-rose-600 flex items-center gap-1 cursor-pointer"
                >
                  <Trash2 className="h-3.5 w-3.5" /> Cancel L&D Session
                </button>
              </div>
            )}
  
            <div className="flex gap-2 pt-2">
              <button
                type="submit"
                className="btn-gradient flex-1 py-2.5 text-white font-bold rounded-xl text-xs shadow-sm cursor-pointer"
              >
                {editSession.id ? "Save Changes" : "Create Schedule"}
              </button>
              <button
                type="button"
                onClick={setEditSession.bind(null, null)}
                className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-bold cursor-pointer transition-colors"
              >
                Cancel
              </button>
            </div>
  
          </form>
  
      </Dialog>
  );
}

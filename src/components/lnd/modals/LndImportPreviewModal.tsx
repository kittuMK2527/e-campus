"use client";

import React from "react";
import { AlertTriangle, FileCheck, FileSpreadsheet, X } from "lucide-react";
import { Dialog } from "../../ui/dialog";
import { Badge } from "../../ui/badge";
import { Button } from "../../ui/button";

/** Excel import preview: parsed rows, validation warnings and the confirm step. */
export interface LndImportPreviewModalProps {
  demoImportPreview: { parsed: any[]; warnings: string[]; validCount: number; targetSubjectGroup: string } | null;
  handleConfirmDemoExcelImport: (...args: any[]) => any;
  isImportingDemoExcel: boolean;
  setShowDemoExcelImportModal: (v: any) => void;
  showDemoExcelImportModal: boolean;
}

export default function LndImportPreviewModal({
  demoImportPreview,
  handleConfirmDemoExcelImport,
  isImportingDemoExcel,
  setShowDemoExcelImportModal,
  showDemoExcelImportModal
}: LndImportPreviewModalProps) {
  return (
      <Dialog
        open={showDemoExcelImportModal && Boolean(demoImportPreview)}
        onOpenChange={(next) => {
          if (!next) setShowDemoExcelImportModal(false);
        }}
        ariaLabel="L&D schedule Excel import preview"
        overlayClassName="bg-slate-950/60 backdrop-blur-sm"
        panelClassName="max-w-4xl max-h-[85vh] p-0 space-y-0 overflow-hidden flex flex-col rounded-2xl bg-white dark:bg-[#131317]"
      >
  
          {/* Modal Header */}
          <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50/70 dark:bg-slate-900/60 backdrop-blur-xs">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 rounded-xl border border-emerald-500/20">
                <FileSpreadsheet className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
                  L&D Schedule Excel Import Preview
                </h3>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 font-semibold">
                  Target Subject Group: <strong className="text-[#4F46E5] dark:text-[#818CF8]">{demoImportPreview?.targetSubjectGroup}</strong>
                </p>
              </div>
            </div>
            <button
              onClick={() => setShowDemoExcelImportModal(false)}
              className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-lg transition-colors cursor-pointer"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
  
          {/* Modal Body */}
          <div className="p-5 overflow-y-auto space-y-4 flex-1">
  
            {/* Metric Summary Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="p-3.5 bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 rounded-xl">
                <span className="text-[10px] font-black uppercase text-slate-400 block">Total Rows Parsed</span>
                <span className="text-lg font-black text-slate-800 dark:text-white">{demoImportPreview?.parsed.length || 0}</span>
              </div>
  
              <div className="p-3.5 bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200/80 dark:border-emerald-900/60 rounded-xl">
                <span className="text-[10px] font-black uppercase text-emerald-600 dark:text-emerald-400 block">Ready to Import</span>
                <span className="text-lg font-black text-emerald-700 dark:text-emerald-300">{demoImportPreview?.validCount || 0}</span>
              </div>
  
              <div className="p-3.5 bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200/80 dark:border-amber-900/60 rounded-xl">
                <span className="text-[10px] font-black uppercase text-amber-600 dark:text-amber-400 block">Warnings / Clashes</span>
                <span className="text-lg font-black text-amber-700 dark:text-amber-300">{demoImportPreview?.warnings.length || 0}</span>
              </div>
            </div>
  
            {/* Warning Alerts List */}
            {demoImportPreview?.warnings && demoImportPreview.warnings.length > 0 && (
              <div className="p-3.5 bg-rose-50/80 dark:bg-rose-950/25 border border-rose-200 dark:border-rose-900/60 rounded-xl space-y-1.5">
                <span className="text-xs font-black text-rose-700 dark:text-rose-400 flex items-center gap-1.5 uppercase">
                  <AlertTriangle className="h-4 w-4" /> Validation Warnings ({demoImportPreview.warnings.length})
                </span>
                <div className="max-h-24 overflow-y-auto space-y-1 text-[11px] font-medium text-rose-600 dark:text-rose-300 pr-1">
                  {demoImportPreview.warnings.map((w, i) => (
                    <div key={i} className="flex items-start gap-1.5">
                      <span className="shrink-0 font-bold">•</span>
                      <span>{w}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
  
            {/* Parsed Sessions Table */}
            <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-xs">
              <div className="p-3 bg-slate-50 dark:bg-slate-800/60 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center">
                <span className="text-xs font-black text-slate-700 dark:text-slate-200 uppercase tracking-wider">
                  Parsed Schedule Matrix
                </span>
                <span className="text-[10px] font-bold text-slate-400">
                  Day-of-Week mapped to active calendar week
                </span>
              </div>
  
              <div className="overflow-x-auto max-h-60 overflow-y-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="sticky top-0 bg-slate-100 dark:bg-slate-800 text-[10px] font-black uppercase text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-700">
                    <tr>
                      <th className="p-2.5">Row</th>
                      <th className="p-2.5">Day / Date</th>
                      <th className="p-2.5">Time Slot</th>
                      <th className="p-2.5">Faculty Mentor</th>
                      <th className="p-2.5">Assigned SME</th>
                      <th className="p-2.5">Subject Group</th>
                      <th className="p-2.5">Cohort / Stream</th>
                      <th className="p-2.5 text-right">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-[11px]">
                    {demoImportPreview?.parsed.map((item, idx) => (
                      <tr key={idx} className={`hover:bg-slate-50/60 dark:hover:bg-slate-800/30 transition-colors ${!item.isValid ? "bg-rose-50/30 dark:bg-rose-950/10" : ""}`}>
                        <td className="p-2.5 font-bold text-slate-400">#{item.rowNum}</td>
                        <td className="p-2.5 font-bold text-slate-800 dark:text-slate-200">
                          {item.dayName}
                          <span className="block text-[9.5px] font-medium text-slate-400">{item.dateStr}</span>
                        </td>
                        <td className="p-2.5 font-bold text-[#4F46E5] dark:text-[#818CF8]">{item.timeSlot}</td>
                        <td className="p-2.5 font-semibold text-slate-800 dark:text-slate-200">{item.mentorName}</td>
                        <td className="p-2.5 font-semibold text-slate-800 dark:text-slate-200">{item.smeName}</td>
                        <td className="p-2.5 text-slate-600 dark:text-slate-300 font-medium">{item.subject}</td>
                        <td className="p-2.5 text-slate-500 font-medium">{item.stream}</td>
                        <td className="p-2.5 text-right">
                          {item.isValid ? (
                            <Badge variant="success">
                              <FileCheck className="h-3 w-3" /> Ready
                            </Badge>
                          ) : (
                            <Badge variant="destructive" title={item.conflictReason}>
                              <AlertTriangle className="h-3 w-3" /> Conflict
                            </Badge>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
  
          </div>
  
          {/* Modal Footer */}
          <div className="p-4 bg-slate-50 dark:bg-slate-950 border-t border-slate-100 dark:border-slate-800 flex justify-end gap-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setShowDemoExcelImportModal(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="success"
              size="sm"
              onClick={handleConfirmDemoExcelImport}
              disabled={isImportingDemoExcel || !demoImportPreview || demoImportPreview.validCount === 0}
              isLoading={isImportingDemoExcel}
              loadingText="Saving Allocations..."
              icon={<FileCheck className="h-3.5 w-3.5" />}
            >
              Confirm &amp; Import ({demoImportPreview?.validCount || 0} Sessions)
            </Button>
          </div>
  
      </Dialog>
  );
}

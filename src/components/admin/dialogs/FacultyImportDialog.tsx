"use client";

import React from "react";
import { FileSpreadsheet, AlertTriangle, X } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export interface FacultyImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  preview: { parsed: any[]; warnings: string[] } | null;
  targetCollegeName: string;
  isCampusShiftBased: boolean;
  isImporting: boolean;
  onConfirmImport: () => void;
}

export const FacultyImportDialog: React.FC<FacultyImportDialogProps> = ({
  open,
  onOpenChange,
  preview,
  targetCollegeName,
  isCampusShiftBased,
  isImporting,
  onConfirmImport
}) => {
  if (!open || !preview) return null;

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      ariaLabel="Faculty Bulk Import Preview"
      overlayClassName="p-4 bg-slate-950/60 backdrop-blur-sm animate-fadeIn"
      panelClassName="max-w-4xl p-6 space-y-5 max-h-[90vh] flex flex-col"
    >
      <div className="flex items-center justify-between border-b border-gray-100 pb-4">
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-xl bg-indigo-50 text-indigo-600 border border-indigo-100">
            <FileSpreadsheet className="h-6 w-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-extrabold text-gray-900">Faculty Bulk Import Preview</h3>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-indigo-50 text-indigo-700 border border-indigo-200">
                {targetCollegeName}
              </span>
            </div>
            <p className="text-xs text-gray-500 font-medium mt-0.5">
              Parsed {preview.parsed.length} faculty record(s) from spreadsheet
            </p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Close faculty import dialog"
          onClick={() => onOpenChange(false)}
          className="h-auto w-auto p-2 rounded-xl text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors cursor-pointer"
        >
          <X className="h-5 w-5" />
        </Button>
      </div>

      {preview.warnings.length > 0 && (
        <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs font-semibold space-y-1">
          <div className="font-extrabold flex items-center gap-1.5">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            Validation Warnings ({preview.warnings.length}):
          </div>
          <ul className="list-disc list-inside text-[11px] space-y-0.5 max-h-24 overflow-y-auto">
            {preview.warnings.map((w, idx) => (
              <li key={idx}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex-1 overflow-y-auto border border-gray-200 rounded-xl">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>#</TableHead>
              <TableHead>Faculty Name</TableHead>
              <TableHead>Email Address</TableHead>
              <TableHead>Department</TableHead>
              {isCampusShiftBased && <TableHead>Shift</TableHead>}
              <TableHead>Timetable Subjects</TableHead>
              <TableHead>Assigned Classes</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {preview.parsed.map((item, idx) => (
              <TableRow key={idx}>
                <TableCell className="text-gray-400 font-mono text-[10px]">{idx + 1}</TableCell>
                <TableCell className="font-bold text-gray-900">
                  {item.name || <span className="text-rose-500 italic">Missing</span>}
                </TableCell>
                <TableCell className="font-mono text-[11px] text-gray-600">
                  {item.email || <span className="text-rose-500 italic">Missing</span>}
                </TableCell>
                <TableCell>
                  <Badge variant="secondary">{item.department}</Badge>
                </TableCell>
                {isCampusShiftBased && (
                  <TableCell>
                    <Badge variant="outline">—</Badge>
                  </TableCell>
                )}
                <TableCell>
                  {item.subjects && typeof item.subjects === "string" ? (
                    <div className="flex flex-wrap gap-1 max-w-[200px]">
                      {(item.subjects || "").split(",").map((sub: string, sIdx: number) => (
                        <Badge key={sIdx} variant="success" className="text-[9.5px]">
                          {sub.trim()}
                        </Badge>
                      ))}
                    </div>
                  ) : (
                    <span className="text-gray-400 text-[10px] italic">No subjects</span>
                  )}
                </TableCell>
                <TableCell>
                  {item.classes && typeof item.classes === "string" ? (
                    <div className="flex flex-wrap gap-1 max-w-[180px]">
                      {(item.classes || "").split(",").map((cls: string, cIdx: number) => (
                        <Badge key={cIdx} variant="default" className="text-[9.5px]">
                          {cls.trim()}
                        </Badge>
                      ))}
                    </div>
                  ) : (
                    <span className="text-gray-400 text-[10px] italic">No classes</span>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between pt-3 border-t border-gray-100">
        <p className="text-xs text-gray-500 font-medium">
          Initial default password for all imported faculty will be set to{" "}
          <code className="bg-gray-100 px-1.5 py-0.5 rounded font-mono font-bold">the institution default</code>
        </p>
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            type="button"
            onClick={() => onOpenChange(false)}
            className="h-auto px-4 py-2 rounded-xl text-xs font-bold text-gray-600 bg-gray-100 hover:bg-gray-200 transition-all cursor-pointer"
          >
            Cancel
          </Button>
          <Button
            variant="ghost"
            type="button"
            disabled={isImporting}
            onClick={onConfirmImport}
            className="h-auto px-5 py-2 rounded-xl text-xs font-extrabold btn-gradient text-white shadow-sm flex items-center gap-2 cursor-pointer disabled:opacity-50"
          >
            {isImporting ? "Importing..." : `Confirm & Import (${preview.parsed.length}) →`}
          </Button>
        </div>
      </div>
    </Dialog>
  );
};

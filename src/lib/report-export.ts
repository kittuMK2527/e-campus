"use client";

/**
 * Shared report export helpers — extracted from CAMDashboard so any dashboard
 * (KAM Portfolio Analytics, Admin Oversight Hub, etc.) can reuse them.
 *
 * exportToExcel  — multi-sheet xlsx via the dynamic xlsx package
 * exportToPrintablePDF — opens a print-friendly window (browser Save-as-PDF)
 * with branded header, doc ID, KPI cards and color-coded status cells.
 */

export interface ExcelSummarySheet {
  name: string;
  headers: string[];
  rows: any[][];
}

export async function exportToExcel(
  fileName: string,
  sheetName: string,
  headers: string[],
  rows: any[][],
  summarySheet?: ExcelSummarySheet
) {
  const XLSX = await import("xlsx");
  const wb = XLSX.utils.book_new();

  const mainWs = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  XLSX.utils.book_append_sheet(wb, mainWs, sheetName.slice(0, 31));

  if (summarySheet) {
    const sumWs = XLSX.utils.aoa_to_sheet([summarySheet.headers, ...summarySheet.rows]);
    XLSX.utils.book_append_sheet(wb, sumWs, summarySheet.name.slice(0, 31));
  }

  XLSX.writeFile(wb, `${fileName}_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

export interface PDFKpi {
  label: string;
  value: string | number;
  color?: "rose" | "amber" | "emerald" | "blue" | "purple" | "slate";
  note?: string;
}

const KPI_COLOR_MAP: Record<string, string> = {
  rose: "#e11d48",
  amber: "#d97706",
  emerald: "#059669",
  blue: "#2563eb",
  purple: "#7c3aed",
  slate: "#475569",
};

const STATUS_POSITIVE = ["cleared", "yes", "distinction", "optimal", "on track", "completed", "approved", "approved & covered", "low risk", "healthy"];
const STATUS_NEGATIVE = ["detained", "no", "critical", "critical risk", "at-risk", "overload", "lagging", "congested", "declined", "open"];
const STATUS_WARNING = ["condonation eligible", "conditional", "warning", "moderate risk", "pending", "in progress", "escalated"];

function formatCellForPDF(cell: any): string {
  if (cell === null || cell === undefined || cell === "") return '<span style="color:#94a3b8;">—</span>';
  const str = String(cell).trim();
  const lower = str.toLowerCase();

  if (STATUS_POSITIVE.includes(lower)) {
    return `<span style="background:#dcfce7; color:#15803d; border:1px solid #bbf7d0; padding:2px 7px; border-radius:4px; font-weight:800; font-size:8px; display:inline-block;">● ${str}</span>`;
  }
  if (STATUS_NEGATIVE.includes(lower)) {
    return `<span style="background:#fee2e2; color:#b91c1c; border:1px solid #fecaca; padding:2px 7px; border-radius:4px; font-weight:800; font-size:8px; display:inline-block;">▲ ${str}</span>`;
  }
  if (STATUS_WARNING.includes(lower)) {
    return `<span style="background:#fef3c7; color:#b45309; border:1px solid #fde68a; padding:2px 7px; border-radius:4px; font-weight:800; font-size:8px; display:inline-block;">◐ ${str}</span>`;
  }
  return str;
}

/**
 * Stable document number for an exported report. Printing the same data twice must
 * produce the same reference, otherwise two audit trails can never be reconciled.
 */
export function stableDocRef(parts: unknown[]): string {
  const text = JSON.stringify(parts) ?? "";
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(36).toUpperCase().padStart(7, "0");
}

export function exportToPrintablePDF(
  title: string,
  subtitle: string,
  headers: string[],
  rows: any[][],
  options?: {
    kpis?: PDFKpi[];
    scopeNotice?: string;
    orgName?: string;
  }
) {
  const printWindow = window.open("", "_blank");
  if (!printWindow) {
    // WF-P05: Non-blocking toast notification instead of native window.alert()
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("fp_toast", {
          detail: {
            message: "Pop-up blocked. Please allow pop-ups in your browser to print the PDF report.",
            type: "warning"
          }
        })
      );
    }
    return;
  }

  const org = options?.orgName || "FACE Prep E-Campus";
  const docId = `RPT-${org.replace(/[^a-zA-Z0-9]/g, "").slice(0, 4).toUpperCase()}-${new Date().getFullYear()}-${stableDocRef([title, subtitle, headers, rows, options?.kpis || []])}`;

  const kpisHtml = (options?.kpis || [])
    .map(k => {
      const color = KPI_COLOR_MAP[k.color || "slate"];
      return `
      <div class="kpi-card" style="border-top:3px solid ${color};">
        <div class="kpi-value" style="color:${color};">${k.value}</div>
        <div class="kpi-label">${k.label}</div>
        ${k.note ? `<div class="kpi-note">${k.note}</div>` : ""}
      </div>`;
    })
    .join("");

  const tableHtml = `
    <table>
      <thead><tr>${headers.map(h => `<th>${h}</th>`).join("")}</tr></thead>
      <tbody>
        ${rows
          .map(
            r =>
              `<tr>${r
                .map(c => `<td>${formatCellForPDF(c)}</td>`)
                .join("")}</tr>`
          )
          .join("")}
      </tbody>
    </table>`;

  printWindow.document.write(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${title} — ${org}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Segoe UI', system-ui, sans-serif; padding: 28px 32px; color: #1e293b; }
    .doc-header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #4f46e5; padding-bottom: 14px; margin-bottom: 18px; }
    .doc-header h1 { font-size: 20px; font-weight: 800; color: #111827; }
    .doc-header .sub { font-size: 11px; color: #64748b; margin-top: 3px; font-weight: 600; }
    .doc-meta { text-align: right; font-size: 10px; color: #64748b; line-height: 1.7; }
    .doc-meta b { color: #334155; }
    .kpi-row { display: flex; gap: 12px; flex-wrap: wrap; margin-bottom: 18px; }
    .kpi-card { flex: 1; min-width: 140px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px 14px; }
    .kpi-value { font-size: 22px; font-weight: 900; }
    .kpi-label { font-size: 9px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.6px; color: #64748b; margin-top: 2px; }
    .kpi-note { font-size: 9px; color: #94a3b8; margin-top: 2px; }
    .scope-notice { background: #eef2ff; border: 1px solid #c7d2fe; color: #4338ca; font-size: 10px; font-weight: 700; padding: 8px 12px; border-radius: 6px; margin-bottom: 14px; }
    table { width: 100%; border-collapse: collapse; font-size: 10px; }
    thead th { background: #f1f5f9; color: #334155; text-transform: uppercase; font-size: 8.5px; letter-spacing: 0.5px; padding: 8px 6px; border: 1px solid #e2e8f0; text-align: left; }
    tbody td { padding: 6px; border: 1px solid #e2e8f0; }
    tbody tr:nth-child(even) { background: #f8fafc; }
    .print-footer { margin-top: 22px; padding-top: 10px; border-top: 1px solid #e2e8f0; font-size: 9px; color: #94a3b8; display: flex; justify-content: space-between; }
    @media print { body { padding: 12px; } }
  </style>
</head>
<body>
  <div class="doc-header">
    <div>
      <h1>${title}</h1>
      <div class="sub">${subtitle}</div>
    </div>
    <div class="doc-meta">
      <div><b>${org}</b></div>
      <div>Doc ID: <b>${docId}</b></div>
      <div>Generated: ${new Date().toLocaleString()}</div>
    </div>
  </div>
  ${options?.kpis?.length ? `<div class="kpi-row">${kpisHtml}</div>` : ""}
  ${options?.scopeNotice ? `<div class="scope-notice">${options.scopeNotice}</div>` : ""}
  ${tableHtml}
  <div class="print-footer">
    <span>Confidential — generated by ${org} reporting system</span>
    <span>${rows.length} record(s)</span>
  </div>
  <script>window.onload = () => setTimeout(() => window.print(), 400);</script>
</body>
</html>`);
  printWindow.document.close();
}

import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export type NormalizedRole =
  | "mentor" | "hr" | "cm" | "kam" | "admin" | "student" | "fee_manager" | "sme" | "L and D";

const ROLE_ALIASES: Record<string, NormalizedRole> = {
  cam: "cm",
  campus_manager: "cm",
  "l and d": "L and D",
  "learning and development": "L and D",
  "learning & development": "L and D",
  lnd: "L and D",
  "l&d": "L and D",
  ld: "L and D",
  "l-d": "L and D",
  allocator: "L and D",
  "demo allocator": "L and D"
};

const ROLE_HOME_PATHS: Record<string, string> = {
  admin: "/admin/overview",
  cm: "/cm/overview",
  mentor: "/mentor/home",
  student: "/student/dashboard",
  kam: "/kam/overview",
  sme: "/sme/overview",
  fee_manager: "/fee-manager/overview",
  hr: "/hr",
  "L and D": "/l-and-d"
};

/** Client-safe role normalization (mirrors authGuard.normalizeRole). */
export function normalizeRoleValue(role?: string | null): NormalizedRole {
  const raw = String(role || "").toLowerCase().trim();
  if (!raw) return "student";
  return (ROLE_ALIASES[raw] || raw) as NormalizedRole;
}

/** UI label for a role value — all legacy allocator spellings render as L&D. */
export function formatRoleLabel(role?: string | null): string {
  const raw = String(role || "").trim();
  return normalizeRoleValue(raw) === "L and D" ? "L&D" : raw;
}

/** Canonical dashboard URL for a role — the L&D workspace lives at /l-and-d. */
export function getRoleHomePath(role?: string | null): string {
  const normalized = normalizeRoleValue(role);
  return ROLE_HOME_PATHS[normalized] || `/${normalized}`;
}

const SME_TABS = ["overview", "demo_list", "weekly_plans", "skill_approvals", "availability", "reallocation", "history", "eval_criteria"] as const;
const FEE_MANAGER_TABS = ["overview", "colleges", "students", "transactions"] as const;

export function resolveSmeTab(value: unknown): typeof SME_TABS[number] {
  const tab = value === "calendar" ? "availability" : value === "reallocation_hub" ? "reallocation" : value;
  return SME_TABS.find((candidate) => candidate === tab) ?? "overview";
}

export function resolveFeeManagerTab(value: unknown): typeof FEE_MANAGER_TABS[number] {
  return FEE_MANAGER_TABS.find((candidate) => candidate === value) ?? "overview";
}

export function isTimeSlotMatch(t1?: string, t2?: string): boolean {
  if (!t1 || !t2) return false;
  if (t1 === t2) return true;

  const cleanSlot = (s: string) => {
    return s
      .toLowerCase()
      .replace(/period\s*\d+\s*[\(:]?/gi, "")
      .replace(/[\(\)]/g, "")
      .replace(/p\.m/g, "pm")
      .replace(/a\.m/g, "am")
      .replace(/to/g, "-")
      .replace(/\./g, ":")
      .replace(/\s+/g, "")
      .replace(/(\D)0(\d)/g, "$1$2")
      .replace(/^0(\d)/, "$1")
      .trim();
  };

  const c1 = cleanSlot(t1);
  const c2 = cleanSlot(t2);
  if (c1 === c2) return true;
  if (c1 && c2 && (c1.includes(c2) || c2.includes(c1))) return true;

  // Compare parsed start and end minutes
  const m1 = Array.from(t1.matchAll(/(\d{1,2})(?:[:.](\d{2}))?\s*(AM|PM)?/gi));
  const m2 = Array.from(t2.matchAll(/(\d{1,2})(?:[:.](\d{2}))?\s*(AM|PM)?/gi));
  if (m1.length >= 2 && m2.length >= 2) {
    const parseM = (m: RegExpMatchArray) => {
      let hr = parseInt(m[1], 10);
      const min = m[2] ? parseInt(m[2], 10) : 0;
      const ampm = m[3] ? m[3].toUpperCase() : null;
      if (ampm === "PM" && hr < 12) hr += 12;
      if (ampm === "AM" && hr === 12) hr = 0;
      return hr * 60 + min;
    };
    const s1 = parseM(m1[0]), e1 = parseM(m1[1]);
    const s2 = parseM(m2[0]), e2 = parseM(m2[1]);
    if (Math.abs(s1 - s2) <= 3 && Math.abs(e1 - e2) <= 3) return true;
  }

  return false;
}

/** Parses start and end minutes from a slot time range (e.g. "09:00 AM - 10:00 AM"). */
export function parseSlotTimeRange(timeStr: string): { start: number; end: number } | null {
  if (!timeStr) return null;
  const matches = Array.from(timeStr.matchAll(/(\d{1,2})(?:[:.](\d{2}))?\s*(AM|PM)?/gi));
  if (matches.length < 2) return null;

  const parseM = (m: RegExpMatchArray, defaultAmpm?: string | null) => {
    let hr = parseInt(m[1], 10);
    const min = m[2] ? parseInt(m[2], 10) : 0;
    let ampm = m[3] ? m[3].toUpperCase() : defaultAmpm;
    if (ampm === "PM" && hr < 12) hr += 12;
    if (ampm === "AM" && hr === 12) hr = 0;
    return hr * 60 + min;
  };

  const secondAmpm = matches[1][3] ? matches[1][3].toUpperCase() : null;
  const firstAmpm = matches[0][3] ? matches[0][3].toUpperCase() : (secondAmpm === "AM" ? "AM" : null);

  let start = parseM(matches[0], firstAmpm);
  let end = parseM(matches[1], secondAmpm);

  if (end < start && !matches[1][3] && start < 12 * 60) {
    end += 12 * 60;
  }

  return { start, end };
}

/** Checks whether two slot time ranges overlap (BUG-05). */
export function isTimeSlotOverlap(t1?: string, t2?: string): boolean {
  if (!t1 || !t2) return false;
  if (t1.trim().toLowerCase() === t2.trim().toLowerCase()) return true;

  const r1 = parseSlotTimeRange(t1);
  const r2 = parseSlotTimeRange(t2);

  if (!r1 || !r2) {
    return isTimeSlotMatch(t1, t2);
  }

  // Two intervals overlap if startA < endB and endA > startB
  return r1.start < r2.end && r1.end > r2.start;
}

export function normalizeClassGroup(cg?: string): string {
  if (!cg) return "";
  let clean = cg.trim();
  // Remove batch year in parens like (2026-2029) or (2026)
  clean = clean.replace(/\s*\(\s*\d{4}\s*[-–]\s*\d{4}\s*\)/g, "");
  clean = clean.replace(/\s*\(\s*\d{4}\s*\)/g, "");
  
  // Extract section if present (e.g. "- Sec A", "Section B", "- A")
  let sec = "";
  const secMatch = clean.match(/[-_\s]+(?:sec(?:tion)?|sec)\s*([a-zA-Z0-9]+)$/i);
  if (secMatch) {
    sec = secMatch[1].toUpperCase();
    clean = clean.replace(secMatch[0], "").trim();
  }
  
  // Extract shift if present (e.g. "Shift 1", "Shift 2")
  let shift = "";
  const shiftMatch = clean.match(/[-_\s]+(shift\s*[12])/i);
  if (shiftMatch) {
    shift = shiftMatch[1].replace(/\s+/g, " ").replace(/shift/i, "Shift");
    clean = clean.replace(shiftMatch[0], "").trim();
  }
  
  // Normalize Roman years like "III BCA" -> "BCA - Semester 5", "II BBA" -> "BBA - Semester 3", "I BBA DM" -> "BBA DM - Semester 1"
  const romanYearMatch = clean.match(/^(III|II|I|IV)\s+([a-zA-Z\s\.]+)/i);
  if (romanYearMatch && !clean.toLowerCase().includes("sem")) {
    const r = romanYearMatch[1].toUpperCase();
    const course = romanYearMatch[2].trim();
    const sem = r === "III" ? "Semester 5" : r === "II" ? "Semester 3" : r === "IV" ? "Semester 7" : "Semester 1";
    clean = `${course} - ${sem}`;
  }
  
  // Normalize "Sem 1", "Sem-1", "Semester-1" -> "Semester 1"
  const romanMap: Record<string, number> = { i: 1, ii: 2, iii: 3, iv: 4, v: 5, vi: 6, vii: 7, viii: 8 };
  clean = clean.replace(/[-_\s]+sem(?:ester)?[\s\-_]*(\d+|[ivx]+)/i, (_, n) => {
    const num = parseInt(n, 10) || romanMap[n.toLowerCase()] || 1;
    return ` - Semester ${num}`;
  });
  
  if (shift && !clean.includes(shift)) {
    const parts = clean.split(" - ");
    if (parts.length > 1) {
      clean = `${parts[0]} - ${shift} - ${parts.slice(1).join(" - ")}`;
    } else {
      clean = `${clean} - ${shift}`;
    }
  }
  
  if (sec) {
    clean = `${clean} - Sec ${sec}`;
  }
  
  return clean.replace(/\s+/g, " ").trim();
}

export function isCohortMatch(c1?: string, c2?: string): boolean {
  if (!c1 || !c2) return false;
  if (c1 === c2) return true;
  
  const normClean = (s: string) =>
    s.toLowerCase()
      .replace(/\s*\(\s*\d{4}\s*[-–]\s*\d{4}\s*\)/g, "") // strip (2026-2029)
      .replace(/\s*\(\s*\d{4}\s*\)/g, "")
      .replace(/[^a-z0-9]/g, "");

  const norm1 = normClean(c1);
  const norm2 = normClean(c2);
  if (norm1 === norm2) return true;

  // Normalized canonical strings comparison
  const n1 = normalizeClassGroup(c1).toLowerCase();
  const n2 = normalizeClassGroup(c2).toLowerCase();
  if (n1 === n2) return true;

  // Section conflict check: if both specify a section and they differ (e.g. Sec A vs Sec B), do not match
  const extractSec = (s: string) => {
    const m = s.match(/(?:sec(?:tion)?|sec)\s*([a-z0-9]+)/i);
    return m ? m[1].toUpperCase() : null;
  };
  const sec1 = extractSec(c1);
  const sec2 = extractSec(c2);
  if (sec1 && sec2 && sec1 !== sec2) return false;

  // Shift conflict check: if both specify a shift and they differ (e.g. Shift 1 vs Shift 2), do not match
  const extractShift = (s: string) => {
    const m = s.match(/shift\s*([12])/i);
    return m ? m[1] : null;
  };
  const shift1 = extractShift(c1);
  const shift2 = extractShift(c2);
  if (shift1 && shift2 && shift1 !== shift2) return false;

  // Extract base department/course names
  const extractBase = (s: string) => {
    let clean = s.toLowerCase()
      .replace(/\s*\(\s*\d{4}\s*[-–]\s*\d{4}\s*\)/g, "")
      .replace(/^([ivxlcdm]+)[\s\-_]+/i, "") // strip leading III, II, I
      .replace(/\s*-\s*(semester|sem|year|yr|shift|batch|sec|section)\s*([0-9]+|[ivxlcdm]+|[a-z])/gi, "")
      .replace(/\s*(semester|sem|year|yr|shift|batch|sec|section)\s*([0-9]+|[ivxlcdm]+|[a-z])/gi, "")
      .replace(/[^a-z0-9]/g, "")
      .trim();
    return clean;
  };

  const b1 = extractBase(c1);
  const b2 = extractBase(c2);

  // Check alias & department match (e.g. "BSC CS AI" vs "B.Sc. Computer Science with Artificial Intelligence")
  const isDeptMatch = (s1: string, s2: string) => {
    if (!s1 || !s2) return false;
    const d1 = getDeptFromClassGroup(s1).toLowerCase().replace(/[^a-z0-9]/g, "");
    const d2 = getDeptFromClassGroup(s2).toLowerCase().replace(/[^a-z0-9]/g, "");
    if (d1 && d2 && (d1 === d2 || d1.includes(d2) || d2.includes(d1))) return true;
    return false;
  };

  if (b1 && b2 && (b1 === b2 || b1.includes(b2) || b2.includes(b1) || isDeptMatch(c1, c2))) {
    // Check semester / year compatibility
    const extractYear = (s: string): number => {
      const lower = s.toLowerCase();
      if (lower.startsWith("iii ") || lower.includes("year 3") || lower.includes("3rd year") || lower.includes("sem 5") || lower.includes("sem 6") || lower.includes("semester 5") || lower.includes("semester 6") || lower.includes("sem v") || lower.includes("sem vi")) return 3;
      if (lower.startsWith("ii ") || lower.includes("year 2") || lower.includes("2nd year") || lower.includes("sem 3") || lower.includes("sem 4") || lower.includes("semester 3") || lower.includes("semester 4") || lower.includes("sem iii") || lower.includes("sem iv")) return 2;
      if (lower.startsWith("i ") || lower.includes("year 1") || lower.includes("1st year") || lower.includes("sem 1") || lower.includes("sem 2") || lower.includes("semester 1") || lower.includes("semester 2") || lower.includes("sem i") || lower.includes("sem ii")) return 1;
      if (lower.startsWith("iv ") || lower.includes("year 4") || lower.includes("4th year") || lower.includes("sem 7") || lower.includes("sem 8") || lower.includes("semester 7") || lower.includes("semester 8") || lower.includes("sem vii") || lower.includes("sem viii")) return 4;
      return 0;
    };

    const y1 = extractYear(c1);
    const y2 = extractYear(c2);

    if (y1 === 0 || y2 === 0 || y1 === y2) return true;
  }

  return false;
}

export function isDeptSubjectMatch(subDept?: string, dName?: string, dCode?: string): boolean {
  if (!subDept || !dName) return false;
  const norm = (str: string) => (str || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const nSub = norm(subDept);
  const nName = norm(dName);
  const nCode = dCode ? norm(dCode) : "";

  if (nSub === nName) return true;
  if (nCode && nSub === nCode) return true;
  if (nSub && nName && (nSub.includes(nName) || nName.includes(nSub))) return true;
  if (nCode && nSub && (nSub.includes(nCode) || nCode.includes(nSub))) return true;

  const baseSub = norm(subDept.replace(/\s*-\s*(Semester|Sem|Year|Yr|Shift|Batch)\s*\d+/gi, ""));
  const baseName = norm(dName.replace(/\s*-\s*(Semester|Sem|Year|Yr|Shift|Batch)\s*\d+/gi, ""));
  return baseSub === baseName || (baseSub.length > 0 && baseName.length > 0 && (baseSub.includes(baseName) || baseName.includes(baseSub)));
}

export function isSameYear(sYear?: string | number, targetYrStr?: string, sSem?: string): boolean {
  const targetYrNum = targetYrStr ? parseInt(String(targetYrStr).replace(/\D/g, ""), 10) : 0;

  if (sYear !== undefined && sYear !== null && sYear !== "") {
    const s = String(sYear).toLowerCase().trim();
    const t = (targetYrStr || "").toLowerCase().trim();
    if (s === t) return true;
    const sNum = parseInt(s.replace(/\D/g, ""), 10);
    if (sNum && targetYrNum && sNum === targetYrNum) return true;
    if (targetYrNum === 1 && (s === "year i" || s === "1" || s === "year 1" || s === "i")) return true;
    if (targetYrNum === 2 && (s === "year ii" || s === "2" || s === "year 2" || s === "ii")) return true;
    if (targetYrNum === 3 && (s === "year iii" || s === "3" || s === "year 3" || s === "iii")) return true;
    if (targetYrNum === 4 && (s === "year iv" || s === "4" || s === "year 4" || s === "iv")) return true;
  }

  // Fallback: Infer year from semester if sYear is missing or not matching
  if (sSem && targetYrNum) {
    const semNum = parseInt(String(sSem).replace(/\D/g, ""), 10);
    if (semNum) {
      const inferredYr = Math.ceil(semNum / 2);
      if (inferredYr === targetYrNum) return true;
    }
  }

  return false;
}

export function isSameSemester(sSem?: string, targetSemStr?: string): boolean {
  if (!sSem || !targetSemStr) return false;
  const s = String(sSem).toLowerCase().replace(/[^a-z0-9]/g, "");
  const t = String(targetSemStr).toLowerCase().replace(/[^a-z0-9]/g, "");
  if (s === t) return true;
  const sNum = s.match(/\d+/)?.[0];
  const tNum = t.match(/\d+/)?.[0];
  return !!(sNum && tNum && sNum === tNum);
}

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function parseRoomsList(roomsStr?: string | null): string[] {
  if (!roomsStr || !roomsStr.trim()) return [];
  const raw = roomsStr.trim();
  if (raw.startsWith("[")) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.map(r => String(r).replace(/[\[\]"]/g, "").trim()).filter(Boolean);
      }
    } catch (_) {}
  }
  if (raw.startsWith("{")) {
    try {
      const parsed = JSON.parse(raw);
      return Object.values(parsed).map(r => String(r).replace(/[\[\]"]/g, "").trim()).filter(Boolean);
    } catch (_) {}
  }
  return raw
    .split(",")
    .map(r => r.replace(/[\[\]"]/g, "").trim())
    .filter(Boolean);
}

export function formatDate(dateString: string): string {
  try {
    const d = parseDbDate(dateString);
    return d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit"
    });
  } catch (e) {
    return dateString;
  }
}

export function parseDateToYMD(val?: any): string {
  if (!val) return "";
  if (val instanceof Date) {
    if (!isNaN(val.getTime())) {
      const yr = val.getFullYear();
      const mo = String(val.getMonth() + 1).padStart(2, "0");
      const da = String(val.getDate()).padStart(2, "0");
      return `${yr}-${mo}-${da}`;
    }
    return "";
  }
  const str = String(val).trim();
  if (!str) return "";

  const monthNames: Record<string, string> = {
    jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
    jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
    january: "01", february: "02", march: "03", april: "04", june: "06",
    july: "07", august: "08", september: "09", october: "10", november: "11", december: "12"
  };

  // If it's a numeric Excel serial (e.g. 38456 or 39164 or 44560)
  if (/^\d{4,6}$/.test(str)) {
    const serial = Number(str);
    if (serial > 10000 && serial < 100000) {
      // Excel epoch starts at 1899-12-30 (25569 days to 1970-01-01)
      const date = new Date(Math.round((serial - 25569) * 86400 * 1000));
      if (!isNaN(date.getTime())) {
        const yr = date.getUTCFullYear();
        const mo = String(date.getUTCMonth() + 1).padStart(2, "0");
        const da = String(date.getUTCDate()).padStart(2, "0");
        return `${yr}-${mo}-${da}`;
      }
    }
  }

  // If it's an ISO string containing Excel serial (e.g., +039164-01-01...)
  const isoSerialMatch = str.match(/\+0*(\d{5})/);
  if (isoSerialMatch) {
    const serial = parseInt(isoSerialMatch[1], 10);
    if (serial > 10000 && serial < 100000) {
      const date = new Date(Math.round((serial - 25569) * 86400 * 1000));
      if (!isNaN(date.getTime())) {
        const yr = date.getUTCFullYear();
        const mo = String(date.getUTCMonth() + 1).padStart(2, "0");
        const da = String(date.getUTCDate()).padStart(2, "0");
        return `${yr}-${mo}-${da}`;
      }
    }
  }

  // Handle DD-MMM-YYYY or DD MMM YYYY (e.g. "07-Jul-2026", "7 Jul 2026", "07-July-26")
  const namedMonthMatch = str.match(/^(\d{1,2})[\s\-_/]+([a-zA-Z]{3,9})[\s\-_/]+(\d{2,4})/);
  if (namedMonthMatch) {
    const day = namedMonthMatch[1].padStart(2, "0");
    const mStr = namedMonthMatch[2].toLowerCase();
    const mo = monthNames[mStr];
    if (mo) {
      let yr = namedMonthMatch[3];
      if (yr.length === 2) yr = parseInt(yr, 10) > 40 ? `19${yr}` : `20${yr}`;
      return `${yr}-${mo}-${day}`;
    }
  }

  // Handle MMM-DD-YYYY (e.g. "Jul-07-2026", "July 7, 2026")
  const namedMonthFirstMatch = str.match(/^([a-zA-Z]{3,9})[\s\-_/]+(\d{1,2})[,\s\-_/]+(\d{2,4})/);
  if (namedMonthFirstMatch) {
    const mStr = namedMonthFirstMatch[1].toLowerCase();
    const mo = monthNames[mStr];
    if (mo) {
      const day = namedMonthFirstMatch[2].padStart(2, "0");
      let yr = namedMonthFirstMatch[3];
      if (yr.length === 2) yr = parseInt(yr, 10) > 40 ? `19${yr}` : `20${yr}`;
      return `${yr}-${mo}-${day}`;
    }
  }

  // Handle malformed Excel CSV dates like "2/726" or "3/726"
  const malformedMatch = str.match(/^(\d{1,2})\/(\d)(\d{2})$/);
  if (malformedMatch) {
    const day = malformedMatch[1].padStart(2, "0");
    const month = malformedMatch[2].padStart(2, "0");
    const yr = parseInt(malformedMatch[3], 10);
    const year = yr > 40 ? `19${malformedMatch[3]}` : `20${malformedMatch[3]}`;
    return `${year}-${month}-${day}`;
  }

  // Handle DD-MM-YYYY, DD/MM/YYYY, DD.MM.YYYY
  const dmyMatch = str.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/);
  if (dmyMatch) {
    const day = dmyMatch[1].padStart(2, "0");
    const month = dmyMatch[2].padStart(2, "0");
    let year = dmyMatch[3];
    if (year.length === 2) {
      year = parseInt(year, 10) > 40 ? `19${year}` : `20${year}`;
    }
    return `${year}-${month}-${day}`;
  }

  // Handle YYYY-MM-DD
  const ymdMatch = str.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (ymdMatch) {
    const year = ymdMatch[1];
    const month = ymdMatch[2].padStart(2, "0");
    const day = ymdMatch[3].padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  // Fallback to standard JS Date
  try {
    const d = new Date(str);
    if (!isNaN(d.getTime()) && d.getFullYear() > 1900 && d.getFullYear() < 2100) {
      const yr = d.getFullYear();
      const mo = String(d.getMonth() + 1).padStart(2, "0");
      const da = String(d.getDate()).padStart(2, "0");
      return `${yr}-${mo}-${da}`;
    }
  } catch (_) {}

  return str;
}

export function formatDisplayDob(val?: string): string {
  if (!val) return "—";
  const ymd = parseDateToYMD(val);
  if (/^\d{4}-\d{2}-\d{2}$/.test(ymd)) {
    const [y, m, d] = ymd.split("-");
    return `${d}/${m}/${y}`;
  }
  return ymd || "—";
}

export function parseDbDate(dStr?: string): Date {
  if (!dStr) return new Date();
  const trimmed = dStr.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const [y, m, d] = trimmed.split("-").map(Number);
    return new Date(y, m - 1, d);
  }
  // If raw SQLite timestamp with space (no 'Z', '+', or 'T')
  if (trimmed.includes(" ") && !trimmed.includes("Z") && !trimmed.includes("+") && !trimmed.includes("T")) {
    return new Date(trimmed.replace(" ", "T") + "Z");
  }
  return new Date(trimmed);
}

export function formatTimeLabel(timeStr: string): string {
  if (!timeStr) return "";
  const parts = timeStr.split(/\s*(?:-|to|TO)\s*/);
  if (parts.length > 0) {
    let start = parts[0].trim();
    // Normalize A.M / P.M to AM / PM
    start = start.replace(/A\.M\.?/i, "AM").replace(/P\.M\.?/i, "PM");
    return start;
  }
  return timeStr;
}

export function getSubjectsForDepartment(
  subjectsList: any[],
  mentors: any[],
  slots: any[],
  targetDept: string
): any[] {
  if (!subjectsList || !Array.isArray(subjectsList)) return [];
  const safeMentors = Array.isArray(mentors) ? mentors : [];
  const safeSlots = Array.isArray(slots) ? slots : [];
  const deptLower = (targetDept || "").toLowerCase().trim();

  if (!deptLower) return subjectsList;

  // 1. Find all mentors belonging to this department
  const deptMentors = safeMentors.filter(m => m && m.department && (m.department || "").toLowerCase().trim() === deptLower);
  const deptMentorIds = new Set(deptMentors.map(m => m.id));

  // 2. Gather all subjects mapped to these mentors in their profile
  const mappedSubjectNames = new Set<string>();
  deptMentors.forEach(m => {
    if (m && m.subjects) {
      String(m.subjects).split(/\n|\/|,|;/).forEach((s: string) => {
        const cleaned = (s || "").trim().replace(/[,;/]+$/, "").trim().toLowerCase();
        if (cleaned) mappedSubjectNames.add(cleaned);
      });
    }
  });

  // 3. Gather all courses (subjects) actually taught by these mentors in the timetable
  safeSlots.forEach(s => {
    if (s && deptMentorIds.has(s.mentorId) && s.course) {
      const cleaned = String(s.course).trim().replace(/[,;/]+$/, "").trim().toLowerCase();
      mappedSubjectNames.add(cleaned);
    }
  });

  // 4. Gather all class groups (programs) taught by these mentors
  const mappedClassGroups = new Set<string>();
  deptMentors.forEach(m => {
    if (m && m.classes) {
      String(m.classes).split("\n").forEach((c: string) => {
        const cleaned = (c || "").trim().toLowerCase();
        if (cleaned) mappedClassGroups.add(cleaned);
      });
    }
  });
  safeSlots.forEach(s => {
    if (s && deptMentorIds.has(s.mentorId) && s.classGroup) {
      mappedClassGroups.add(String(s.classGroup).toLowerCase());
    }
  });

  // Helper to extract program keywords
  const getProgramKeywords = (prog: string) => {
    const p = (prog || "").toLowerCase();
    if (p.includes("cs") || p.includes("computer science")) return ["cs", "computer"];
    if (p.includes("datascience") || p.includes("data science") || p.includes("ds")) return ["ds", "data"];
    if (p.includes("cloud") || p.includes("cc")) return ["cloud", "cc"];
    if (p.includes("fintech") || p.includes("finance")) return ["fintech", "finance"];
    if (p.includes("banking")) return ["banking"];
    if (p.includes("fashion") || p.includes("tech")) return ["fashion"];
    if (p.includes("aviation") || p.includes("airport") || p.includes("airline")) return ["aviation", "airport", "airline"];
    if (p.includes("commerce") || p.includes("bcom") || p.includes("b.com")) return ["commerce", "bcom", "b.com"];
    return [p];
  };

  const deptKeywords = getProgramKeywords(deptLower);

  // 5. Filter subjectsList
  return subjectsList.filter(s => {
    if (!s) return false;
    const sNameClean = (s.name || "").trim().replace(/[,;/]+$/, "").trim().toLowerCase();
    const sDeptClean = (s.department || "").toLowerCase();

    // Check A: Is this subject name explicitly mapped or taught by a mentor of this department?
    const hasExplicitMatch = Array.from(mappedSubjectNames).some(mappedName => 
      isSubjectNameMatch(s.name || "", mappedName)
    );
    if (hasExplicitMatch) return true;

    // Check B: Does the subject program name match the department keywords?
    const sDeptKeywords = getProgramKeywords(sDeptClean);
    const hasKeywordMatch = deptKeywords.some(dk => sDeptKeywords.includes(dk));
    if (hasKeywordMatch) return true;

    // Check C: Does the subject program name match any of the class groups mapped/taught by this department's mentors?
    for (const cg of mappedClassGroups) {
      if (sDeptClean.includes(cg) || cg.includes(sDeptClean)) return true;
    }

    return false;
  });
}

export function isMentorInProgram(
  mentor: any,
  programName: string,
  slots: any[],
  subjectsList: any[]
): boolean {
  if (!mentor || !programName) return false;
  const pName = (programName || "").toLowerCase().trim();
  const mDept = (mentor.department || "").toLowerCase().trim();

  // A. Exact department match
  if (mDept === pName) return true;

  // B. Check if this mentor teaches any slot in this program's department or classGroup
  const hasSlotInProgram = (slots || []).some(s => 
    s && s.mentorId === mentor.id && 
    ((s.department || "").toLowerCase().trim() === pName ||
     (s.classGroup || "").toLowerCase().includes(pName))
  );
  if (hasSlotInProgram) return true;

  return false;
}

export interface ParsedCohort {
  raw: string;
  courseName: string;
  semester: number;
  year: number;
  shift?: "shift_1" | "shift_2" | "general";
  canonicalName: string;
}

export function parseCohort(classGroup?: string): ParsedCohort {
  if (!classGroup) {
    return { raw: "", courseName: "", semester: 1, year: 1, canonicalName: "" };
  }
  const raw = classGroup.trim();
  const courseName = getDeptFromClassGroup(raw);

  let shift: "shift_1" | "shift_2" | "general" | undefined = undefined;
  if (/shift\s*1/i.test(raw)) shift = "shift_1";
  else if (/shift\s*2/i.test(raw)) shift = "shift_2";
  else if (/general/i.test(raw)) shift = "general";

  let semester = 1;
  const semMatch = raw.match(/sem(?:ester)?[\s\-_]*(\d+|[ivx]+)/i);
  if (semMatch) {
    const romanMap: Record<string, number> = { i: 1, ii: 2, iii: 3, iv: 4, v: 5, vi: 6, vii: 7, viii: 8 };
    semester = parseInt(semMatch[1], 10) || romanMap[semMatch[1].toLowerCase()] || 1;
  } else {
    const yrMatch = raw.match(/(?:year|yr)[\s\-_]*(\d+|[ivx]+)/i) || raw.match(/(\d+)(?:st|nd|rd|th)\s*year/i);
    if (yrMatch) {
      const romanMap: Record<string, number> = { i: 1, ii: 2, iii: 3, iv: 4 };
      const y = parseInt(yrMatch[1], 10) || romanMap[yrMatch[1].toLowerCase()] || 1;
      semester = y * 2 - 1;
    } else if (/^III\s+/i.test(raw)) {
      semester = 5;
    } else if (/^II\s+/i.test(raw)) {
      semester = 3;
    } else if (/^IV\s+/i.test(raw)) {
      semester = 7;
    }
  }

  const year = Math.max(1, Math.ceil(semester / 2));
  const shiftPart = shift === "shift_1" ? " - Shift 1" : shift === "shift_2" ? " - Shift 2" : "";
  const canonicalName = `${courseName}${shiftPart} - Semester ${semester}`;

  return { raw, courseName, semester, year, shift, canonicalName };
}

export function getDeptFromClassGroup(classGroup?: string): string {
  if (!classGroup) return "";
  const lower = classGroup.toLowerCase().trim();

  // Known special course name variations (backwards compatibility)
  if (lower.includes("b. com(fintech)") || lower.includes("b.com(fintech)") || lower.includes("b. com (fintech)")) {
    return "B. Com(Fintech)";
  }
  if (lower.includes("cs") && (lower.includes("ai") || lower.includes("artificial"))) {
    return "B.Sc. Computer Science with Artificial Intelligence";
  }
  if (lower.includes("ds") || lower.includes("data science")) {
    return "B.Sc. Data Science and Artificial Intelligence";
  }
  if (lower.includes("cc") || lower.includes("cloud")) {
    return "B.Sc. Computer Science with Cloud Computing";
  }
  if (lower.includes("dm") || lower.includes("digital marketing") || (lower.includes("bba") && lower.includes("dm"))) {
    return "BBA DM";
  }
  if (lower.includes("airline") || lower.includes("airport") || lower.includes("aa")) {
    return "BBA Airline and Airport Management";
  }
  if (lower.includes("fashion") || lower.includes("fm")) {
    return "BBA Fashion Management";
  }

  // General dynamic extraction:
  let clean = classGroup.trim();
  // 1. Remove batch year in parens e.g. (2026-2029) or (2026)
  clean = clean.replace(/\s*\(\s*\d{4}\s*[-–]\s*\d{4}\s*\)/g, "").replace(/\s*\(\s*\d{4}\s*\)/g, "");
  // 2. Remove leading Roman year prefixes e.g. "III BCA" -> "BCA"
  clean = clean.replace(/^(III|II|I|IV)\s+/i, "");
  // 3. Remove shift suffixes or middle sections e.g. "- Shift 1"
  clean = clean.replace(/\s*-\s*(shift\s*[12]|general)\s*/gi, " - ");
  // 4. Remove semester, year, and section suffixes
  clean = clean
    .replace(/\s*-\s*sem(?:ester)?[\s\-_]*(\d+|[ivx]+).*$/i, "")
    .replace(/\s*-\s*year[\s\-_]*(\d+|[ivx]+).*$/i, "")
    .replace(/\s*-\s*(?:1st|2nd|3rd|4th)\s*year.*$/i, "")
    .replace(/\s*-\s*sec(?:tion)?\s*[a-z0-9]+.*$/i, "")
    .replace(/(\s*-\s*)+$/, "")
    .trim();

  return clean || classGroup;
}

export function isSubjectNameMatch(name1: string, name2: string): boolean {
  if (!name1 || !name2) return false;
  
  const norm1 = name1.toLowerCase().trim().replace(/[^a-z0-9]/g, "");
  const norm2 = name2.toLowerCase().trim().replace(/[^a-z0-9]/g, "");
  
  if (norm1 === norm2) return true;

  // Lab vs Theory MUST NEVER match
  const isLab1 = norm1.includes("lab") || norm1.includes("practical") || norm1.includes("pract") || norm1.includes("simulation");
  const isLab2 = norm2.includes("lab") || norm2.includes("practical") || norm2.includes("pract") || norm2.includes("simulation");
  if (isLab1 !== isLab2) return false;

  // Specific canonical aliases
  // AI (Application vs Appliction vs Applications)
  const isAi = (n: string) => n.includes("ai") && (n.includes("applic") || n.includes("appliction"));
  if (isAi(norm1) && isAi(norm2)) return true;

  // SPM
  const isSpm = (n: string) => (n.includes("spm") || (n.includes("software") && n.includes("project")));
  if (isSpm(norm1) && isSpm(norm2)) return true;

  // Gen AI (Generative AI vs Advanced Gen AI)
  const isGenAi = (n: string) => (n.includes("genai") || (n.includes("generative") && n.includes("ai")));
  if (isGenAi(norm1) && isGenAi(norm2)) return true;

  // NLP Lab or NLP Theory
  const isNlp = (n: string) => (n.includes("nlp") || (n.includes("natural") && n.includes("language")));
  if (isNlp(norm1) && isNlp(norm2)) {
    if (isLab1 === isLab2) return true;
  }

  // Helper to extract Roman numeral or number from the end/middle of normalized string
  const getNum = (n: string) => {
    if (n.endsWith("iv") || n.includes("sem4") || n.includes("semiv") || n.endsWith("4") || n.includes("l4") || n.includes("lang4") || n.includes("language4") || n.includes("tamil4")) return 4;
    if (n.endsWith("iii") || n.includes("sem3") || n.includes("semiii") || n.endsWith("3") || n.includes("l3") || n.includes("lang3") || n.includes("language3") || n.includes("tamil3")) return 3;
    if (n.endsWith("ii") || n.includes("sem2") || n.includes("semii") || n.endsWith("2") || n.includes("l2") || n.includes("lang2") || n.includes("language2") || n.includes("tamil2")) return 2;
    if (n.endsWith("i") || n.includes("sem1") || n.includes("semi") || n.endsWith("1") || n.includes("l1") || n.includes("lang1") || n.includes("language1") || n.includes("tamil1")) return 1;
    return null;
  };
  
  const num1 = getNum(norm1);
  const num2 = getNum(norm2);
  
  if (num1 !== null && num2 !== null && num1 !== num2) {
    return false;
  }
  
  // Check if both are languages
  const isLang = (n: string) => 
    n.includes("tamil") || 
    n.includes("language") || 
    n.includes("french") || 
    n.includes("hindi") || 
    n.includes("sanskrit");
    
  if (isLang(norm1) && isLang(norm2)) {
    return true; // Languages with no conflicting semester numbers match
  }

  const isModern1 = norm1.includes("modern");
  const isModern2 = norm2.includes("modern");
  if (isModern1 !== isModern2 && !(isNlp(norm1) && isNlp(norm2))) return false;

  const isAdvanced1 = norm1.includes("advanced");
  const isAdvanced2 = norm2.includes("advanced");
  if (isAdvanced1 !== isAdvanced2 && !(isGenAi(norm1) && isGenAi(norm2))) return false;

  const isFoundations1 = norm1.includes("foundations") || norm1.includes("foundation");
  const isFoundations2 = norm2.includes("foundations") || norm2.includes("foundation");
  if (isFoundations1 !== isFoundations2) return false;

  const isPrinciples1 = norm1.includes("principles") || norm1.includes("principle");
  const isPrinciples2 = norm2.includes("principles") || norm2.includes("principle");
  if (isPrinciples1 !== isPrinciples2) return false;
  
  return norm1.includes(norm2) || norm2.includes(norm1);
}

export interface ScheduleItem {
  type: "period" | "break";
  index?: number;
  name: string;
  startTimeStr: string;
  endTimeStr: string;
  startMinutes: number;
  endMinutes: number;
  durationMinutes?: number;
}

export interface ShiftBreak {
  id: string;
  name: string;
  duration: number;
  afterPeriod: number;
}

export interface ShiftParams {
  label: string;
  startTime: string;
  periodDuration: number;
  periodsCount: number;
  mode: "duration" | "fixed";
  endTime?: string;
  breaks: ShiftBreak[];
  customPeriodDurations?: Record<number, number>;
}

export const parseTimeToMinutes = (timeStr: string): number => {
  if (!timeStr) return 0;
  // If timeStr is a range (e.g. "08:30 AM - 09:30 AM"), take the first segment
  const firstPart = timeStr.replace(/to/i, "-").split("-")[0].replace(/hrs|hr/i, "").trim();
  const cleanStr = firstPart.replace(/\./g, ":");
  // Accept: "14:00", "14:00:00", "08:30 AM", "8.30AM", "8:30am", "8am", "8", etc.
  const match = cleanStr.match(/^(\d{1,2})(?::(\d{1,2}))?(?::\d{1,2})?\s*(AM|PM)?$/i);
  if (!match) return 0;
  let hours = parseInt(match[1], 10);
  const minutes = match[2] ? parseInt(match[2], 10) : 0;
  const ampm = match[3];
  
  if (ampm) {
    const isPM = ampm.toUpperCase() === "PM";
    if (isPM && hours < 12) hours += 12;
    if (!isPM && hours === 12) hours = 0;
  }
  return (hours % 24) * 60 + minutes;
};

export const formatMinutesToTime = (totalMinutes: number): string => {
  let hours = Math.floor(totalMinutes / 60) % 24;
  const minutes = totalMinutes % 60;
  const ampm = hours >= 12 ? "PM" : "AM";
  
  let displayHours = hours % 12;
  if (displayHours === 0) displayHours = 12;
  
  const displayMinutes = minutes < 10 ? "0" + minutes : minutes;
  return `${displayHours}.${displayMinutes} ${ampm}`;
};

export const calculateShiftSchedule = (params: ShiftParams): {
  items: ScheduleItem[];
  overallEndTime: string;
  totalPeriods: number;
  error?: string;
} => {
  const { startTime, periodDuration, periodsCount, mode, endTime, breaks, customPeriodDurations } = params;
  let currentMinutes = parseTimeToMinutes(startTime);
  const items: ScheduleItem[] = [];
  
  const sortedBreaks = [...breaks].sort((a, b) => a.afterPeriod - b.afterPeriod);
  
  const hasDuplicateBreakPeriods = sortedBreaks.some((b, i) => i > 0 && b.afterPeriod === sortedBreaks[i-1].afterPeriod);
  if (hasDuplicateBreakPeriods) {
    return { items: [], overallEndTime: "", totalPeriods: 0, error: "Validation Warning: Multiple breaks are configured after the same period." };
  }

  if (mode === "duration") {
    for (let p = 1; p <= periodsCount; p++) {
      const thisPeriodDur = (customPeriodDurations && customPeriodDurations[p]) 
        ? customPeriodDurations[p] 
        : periodDuration;
      const pStart = currentMinutes;
      const pEnd = currentMinutes + thisPeriodDur;
      items.push({
        type: "period",
        index: p,
        name: `Period ${p}`,
        startTimeStr: formatMinutesToTime(pStart),
        endTimeStr: formatMinutesToTime(pEnd),
        startMinutes: pStart,
        endMinutes: pEnd,
        durationMinutes: thisPeriodDur
      });
      currentMinutes = pEnd;
      
      const pBreak = sortedBreaks.find(b => b.afterPeriod === p);
      if (pBreak) {
        const bStart = currentMinutes;
        const bEnd = currentMinutes + pBreak.duration;
        items.push({
          type: "break",
          name: pBreak.name,
          startTimeStr: formatMinutesToTime(bStart),
          endTimeStr: formatMinutesToTime(bEnd),
          startMinutes: bStart,
          endMinutes: bEnd,
          durationMinutes: pBreak.duration
        });
        currentMinutes = bEnd;
      }
    }
    return {
      items,
      overallEndTime: formatMinutesToTime(currentMinutes),
      totalPeriods: periodsCount
    };
  } else {
    const limitMinutes = parseTimeToMinutes(endTime || "");
    if (limitMinutes <= currentMinutes) {
      return { items: [], overallEndTime: "", totalPeriods: 0, error: "Validation Warning: Shift end time must be after start time." };
    }
    
    let periodIndex = 1;
    let iterations = 0;
    const maxIterations = 50;
    
    while (iterations < maxIterations) {
      const thisPeriodDur = (customPeriodDurations && customPeriodDurations[periodIndex]) 
        ? customPeriodDurations[periodIndex] 
        : periodDuration;
      if (currentMinutes + thisPeriodDur > limitMinutes) break;
      
      iterations++;
      const pStart = currentMinutes;
      const pEnd = currentMinutes + thisPeriodDur;
      items.push({
        type: "period",
        index: periodIndex,
        name: `Period ${periodIndex}`,
        startTimeStr: formatMinutesToTime(pStart),
        endTimeStr: formatMinutesToTime(pEnd),
        startMinutes: pStart,
        endMinutes: pEnd,
        durationMinutes: thisPeriodDur
      });
      currentMinutes = pEnd;
      
      const pBreak = sortedBreaks.find(b => b.afterPeriod === periodIndex);
      if (pBreak) {
        const bStart = currentMinutes;
        const bEnd = currentMinutes + pBreak.duration;
        if (bEnd > limitMinutes) {
          items.pop();
          break;
        }
        items.push({
          type: "break",
          name: pBreak.name,
          startTimeStr: formatMinutesToTime(bStart),
          endTimeStr: formatMinutesToTime(bEnd),
          startMinutes: bStart,
          endMinutes: bEnd,
          durationMinutes: pBreak.duration
        });
        currentMinutes = bEnd;
      }
      periodIndex++;
    }
    return {
      items,
      overallEndTime: formatMinutesToTime(currentMinutes),
      totalPeriods: items.filter(i => i.type === "period").length
    };
  }
};

export function resolveClassGroupDetailsFromState(
  classGroup: string,
  listA: any[] = [],
  listB: any[] = []
) {
  if (!classGroup) {
    return { department: "General", semester: "Semester 1", year: "Year 1" };
  }

  // Detect which list is coursesList (has .code or .established_year or .start_year) and which is subjectsList (has .weekly_hours or .type)
  const isCourses = (item: any) => item && ("code" in item || "start_year" in item || "hod_name" in item);
  const coursesList = (Array.isArray(listA) && listA.some(isCourses)) ? listA : (Array.isArray(listB) && listB.some(isCourses)) ? listB : (Array.isArray(listB) && listB.length > 0 ? listB : listA || []);
  const subjectsList = coursesList === listA ? (listB || []) : (listA || []);

  const cleanCG = classGroup.trim();
  const cgLower = cleanCG.toLowerCase();
  const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const cgNorm = normalize(cgLower);

  // 1. Resolve Department
  let resolvedDept = "";
  let bestDeptMatchScore = 0;

  // Unique course/dept names and codes from coursesList
  const allCourseNames = Array.from(new Set(coursesList.map(c => c.name).filter(Boolean)));
  for (const deptName of allCourseNames) {
    const deptNorm = normalize(deptName);
    if (cgNorm && deptNorm && cgNorm.includes(deptNorm)) {
      if (deptNorm.length > bestDeptMatchScore) {
        resolvedDept = deptName;
        bestDeptMatchScore = deptNorm.length;
      }
    }
  }

  if (!resolvedDept) {
    const codes = Array.from(new Set(coursesList.map((c: any) => c.code).filter(Boolean)));
    for (const code of codes) {
      const codeNorm = normalize(code);
      if (cgNorm && codeNorm && cgNorm.includes(codeNorm)) {
        const matched = coursesList.find((c: any) => c.code === code);
        if (matched) {
          resolvedDept = matched.name;
          break;
        }
      }
    }
  }

  if (!resolvedDept) {
    for (const deptName of allCourseNames) {
      const abbreviation = deptName
        .replace(/with|and|for/gi, "")
        .split(/\s+/)
        .map((w: string) => w.replace(/[^a-zA-Z]/g, "")[0])
        .filter(Boolean)
        .join("")
        .toLowerCase();

      if (abbreviation && cgNorm && cgNorm.includes(abbreviation)) {
        resolvedDept = deptName;
        break;
      }
    }
  }

  if (!resolvedDept) {
    resolvedDept = cleanCG.split("-")[0].split("(")[0].trim();
  }

  // 2. Resolve Semester
  let resolvedSemester = "";
  const uniqueSemesters = Array.from(new Set(subjectsList.map((s: any) => s.semester).filter(Boolean)));
  
  const romanMap: Record<string, number> = { i: 1, ii: 2, iii: 3, iv: 4, v: 5, vi: 6, vii: 7, viii: 8 };
  const semMatch = cgLower.match(/sem(?:ester)?[\s\-_]*([ivxldc\d]+)/i);
  if (semMatch) {
    const semVal = semMatch[1].toLowerCase();
    const semNum = parseInt(semVal, 10) || romanMap[semVal];
    if (semNum) {
      const matchedSem = uniqueSemesters.find((s: any) => s.toLowerCase().includes(String(semNum)));
      if (matchedSem) {
        resolvedSemester = matchedSem;
      } else {
        resolvedSemester = `Semester ${semNum}`;
      }
    }
  }

  if (!resolvedSemester) {
    for (const sem of uniqueSemesters) {
      const semNorm = normalize(sem);
      if (cgNorm.includes(semNorm)) {
        resolvedSemester = sem;
        break;
      }
    }
  }

  // If no semester found in classGroup, check for a Year indicator (e.g. "Year II", "Year 2", "2nd Year", "III BCA", "III Year")
  let resolvedYear = "";
  if (!resolvedSemester) {
    const yearMatch =
      cgLower.match(/year[\s\-_]*([ivxldc\d]+)/i) ||
      cgLower.match(/([1234])(?:st|nd|rd|th)?[\s\-_]*year/i) ||
      cgLower.match(/^([ivx]+)[\s\-_]+[a-z0-9]/i) ||
      cgLower.match(/[\s\-_]+([ivx]+)[\s\-_]*(?:year|yr|bca|bsc|bcom|ba|be|btech)/i);

    if (yearMatch) {
      const yrVal = yearMatch[1].toLowerCase();
      const yrNum = parseInt(yrVal, 10) || romanMap[yrVal];
      if (yrNum) {
        resolvedYear = `Year ${yrNum}`;
        const defaultSemNum = yrNum * 2 - 1; // Year 1 -> Sem 1, Year 2 -> Sem 3, Year 3 -> Sem 5, Year 4 -> Sem 7
        const matchedSem = uniqueSemesters.find((s: any) => {
          const sNum = parseInt(String(s).replace(/\D/g, ""), 10);
          return sNum === defaultSemNum;
        });
        if (matchedSem) {
          resolvedSemester = matchedSem;
        } else {
          resolvedSemester = `Semester ${defaultSemNum}`;
        }
      }
    }
  }

  if (!resolvedSemester) {
    resolvedSemester = "Semester 1";
  }

  // 3. Resolve Year
  if (!resolvedYear) {
    const matchedSubject = subjectsList.find((s: any) => s.semester && s.semester.toLowerCase() === resolvedSemester.toLowerCase());
    if (matchedSubject && matchedSubject.year) {
      resolvedYear = matchedSubject.year;
    } else {
      const numMatch = resolvedSemester.match(/\d+/);
      if (numMatch) {
        const semNum = parseInt(numMatch[0], 10);
        const yrNum = Math.ceil(semNum / 2);
        resolvedYear = `Year ${yrNum}`;
      } else {
        resolvedYear = "Year 1";
      }
    }
  }

  // 4. Resolve Section & Shift
  let resolvedSection = "";
  const secMatch = cleanCG.match(/(?:sec(?:tion)?|sec)\s*([a-zA-Z0-9]+)/i);
  if (secMatch) {
    resolvedSection = secMatch[1].toUpperCase();
  }

  let resolvedShift = "";
  const shiftMatch = cleanCG.match(/(shift\s*[12])/i);
  if (shiftMatch) {
    resolvedShift = shiftMatch[1].replace(/\s+/g, " ").replace(/shift/i, "Shift");
  }

  const canonicalName = normalizeClassGroup(cleanCG);

  return {
    department: resolvedDept,
    semester: resolvedSemester,
    year: resolvedYear,
    section: resolvedSection || null,
    shift: resolvedShift || null,
    canonicalName
  };
}

export function getWeekDates(offset: number = 0, baseDateStr?: string, workingDaysCount: number = 5): { day: string; dateStr: string; formatted: string }[] {
  const dayOrder = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const dates: { day: string; dateStr: string; formatted: string }[] = [];
  
  const baseDate = baseDateStr ? new Date(baseDateStr + "T00:00:00") : new Date();
  baseDate.setDate(baseDate.getDate() + offset * 7);
  
  const dow = baseDate.getDay();
  const monday = new Date(baseDate);
  // If Sunday (0), go back 6 days. Otherwise, go back (dow - 1) days to get to Monday
  monday.setDate(baseDate.getDate() - (dow === 0 ? 6 : dow - 1));
  
  const count = workingDaysCount === 6 ? 6 : 5;
  for (let i = 0; i < count; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    
    // Format YYYY-MM-DD
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    
    dates.push({
      day: dayOrder[i],
      dateStr: `${yyyy}-${mm}-${dd}`,
      formatted: d.toLocaleDateString("en-IN", { day: "numeric", month: "short" })
    });
  }
  
  return dates;
}

export function isCohortMatching(cg1?: string, cg2?: string, coursesList: any[] = [], subjectsList: any[] = []): boolean {
  if (!cg1 || !cg2) return false;
  const clean1 = cg1.trim().toLowerCase();
  const clean2 = cg2.trim().toLowerCase();
  if (!clean1 || !clean2) return false;
  if (clean1 === clean2) return true;

  const norm1 = clean1.replace(/[^a-z0-9]/g, "");
  const norm2 = clean2.replace(/[^a-z0-9]/g, "");
  if (!norm1 || !norm2) return false;
  if (norm1 === norm2) return true;

  const p1 = parseCohort(cg1);
  const p2 = parseCohort(cg2);
  if (p1.canonicalName && p2.canonicalName && p1.canonicalName.toLowerCase() === p2.canonicalName.toLowerCase()) {
    return true;
  }

  const dept1 = getDeptFromClassGroup(cg1).toLowerCase().trim();
  const dept2 = getDeptFromClassGroup(cg2).toLowerCase().trim();
  if (dept1 && dept2 && dept1.length >= 2 && dept2.length >= 2 && (dept1 === dept2 || dept1.includes(dept2) || dept2.includes(dept1))) {
    if (p1.semester && p2.semester && p1.semester === p2.semester) {
      return true;
    }
  }

  const d1 = resolveClassGroupDetailsFromState(cg1, subjectsList, coursesList);
  const d2 = resolveClassGroupDetailsFromState(cg2, subjectsList, coursesList);

  if (d1.canonicalName && d2.canonicalName && d1.canonicalName.toLowerCase().trim() === d2.canonicalName.toLowerCase().trim()) {
    return true;
  }

  const depClean1 = (d1.department || "").replace(/^(iii|ii|i|iv)\s+/i, "").toLowerCase().trim();
  const depClean2 = (d2.department || "").replace(/^(iii|ii|i|iv)\s+/i, "").toLowerCase().trim();

  if (depClean1 && depClean2 && depClean1.length >= 2 && depClean2.length >= 2 && (depClean1 === depClean2 || depClean1.includes(depClean2) || depClean2.includes(depClean1))) {
    if (d1.semester && d2.semester && d1.semester.toLowerCase().trim() === d2.semester.toLowerCase().trim()) {
      return true;
    }
  }
  return false;
}

/**
 * Canonical course matcher that resolves raw course/department strings (e.g. "CSE", "B.Tech CSE",
 * "B.Tech - Computer Science and Engineering", "IT", "Information Technology", "AI&DS", "ECE")
 * to the matching registered course object in the campus courses list.
 */
export function matchCanonicalCourse(deptOrCode?: string, courses: any[] = []): any | null {
  if (!deptOrCode || !courses || courses.length === 0) return null;
  const raw = String(deptOrCode).trim();
  if (!raw) return null;

  const norm = (s: string) => (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const cleanNorm = norm(raw);
  if (!cleanNorm) return null;

  // 1. Exact normalized match by name
  for (const c of courses) {
    if (c.name && norm(c.name) === cleanNorm) return c;
  }

  // 2. Exact normalized match by code (e.g. "CSE", "IT", "ECE")
  for (const c of courses) {
    if (c.code && norm(c.code) === cleanNorm) return c;
  }

  // Common aliases mapping
  const aliasMap: Record<string, string[]> = {
    cse: ["computer science", "cs", "comp sci", "cse", "computer science and engineering"],
    it: ["information technology", "infotech", "it"],
    ece: ["electronics and communication", "ece", "electronics & communication", "electronics and communication engineering"],
    eee: ["electrical and electronics", "eee", "electrical & electronics", "electrical and electronics engineering"],
    mech: ["mechanical", "mech", "mechanical engineering"],
    civil: ["civil", "ce", "civil engineering"],
    aids: ["artificial intelligence and data science", "ai & ds", "ai and data science", "aids", "ai ds", "artificial intelligence"],
    ai: ["artificial intelligence"],
    csbs: ["computer science and business systems", "csbs", "computer science and business"],
    cyber: ["cyber security", "cyber"],
    bca: ["bachelor of computer applications", "bca", "computer applications"],
    mca: ["master of computer applications", "mca"],
    bba: ["bachelor of business administration", "bba", "business administration"],
    mba: ["master of business administration", "mba"],
    biotech: ["biotechnology", "biotech"],
    biomed: ["biomedical", "bme", "biomedical engineering"]
  };

  // Helper to strip degree prefix
  const stripDegree = (s: string) => {
    return (s || "")
      .toLowerCase()
      .replace(/^(b\.?\s*tech|b\.?\s*e|b\.?\s*sc|bachelor\s+of\s+(?:technology|engineering|science|arts|commerce|computer\s+applications|business\s+administration)|m\.?\s*tech|m\.?\s*e|m\.?\s*sc|master\s+of\s+(?:technology|engineering|science|arts|commerce|computer\s+applications|business\s+administration)|bba|mba|bca|mca)\s*[-–:]?\s*/i, "")
      .replace(/[^a-z0-9]/g, "");
  };

  const strippedRaw = stripDegree(raw);
  if (strippedRaw && strippedRaw.length >= 2) {
    for (const c of courses) {
      const strippedC = stripDegree(c.name || "");
      if (strippedC && (strippedC === strippedRaw || strippedC.includes(strippedRaw) || strippedRaw.includes(strippedC))) {
        return c;
      }
    }
  }

  // 3. Match code or initialism
  for (const c of courses) {
    const cCode = c.code ? norm(c.code) : "";
    if (cCode && (cleanNorm === cCode || cleanNorm.includes(cCode) || cCode.includes(cleanNorm))) {
      return c;
    }

    const words = (c.name || "").replace(/with|and|for|of|in|the/gi, " ").split(/[\s\-–&/]+/).filter(Boolean);
    const initialism = words.map((w: string) => w[0]?.toLowerCase()).join("");
    if (initialism && initialism.length >= 2) {
      if (cleanNorm === initialism || cleanNorm.endsWith(initialism) || initialism.endsWith(cleanNorm)) {
        return c;
      }
    }
  }

  // 4. Check alias map
  for (const [key, aliases] of Object.entries(aliasMap)) {
    const rawMatches = cleanNorm === key || aliases.some(a => cleanNorm === norm(a) || cleanNorm.includes(norm(a)));
    if (rawMatches) {
      for (const c of courses) {
        const cNorm = norm(c.name || "");
        const codeNorm = norm(c.code || "");
        if (codeNorm === key || cNorm.includes(key) || aliases.some(a => cNorm.includes(norm(a)))) {
          return c;
        }
      }
    }
  }

  // 5. Substring containment if sufficiently specific
  for (const c of courses) {
    const cNorm = norm(c.name || "");
    if (cNorm.length >= 4 && cleanNorm.length >= 4) {
      if (cNorm.includes(cleanNorm) || cleanNorm.includes(cNorm)) {
        return c;
      }
    }
  }

  return null;
}

/**
 * Dynamically resolves all timetable period time slot ranges for a specific college
 * from its actual database timetable slots and configured shift parameters.
 */
export function getCollegePeriodTimeSlots(
  collegeId?: string,
  colleges: any[] = [],
  slots: any[] = [],
  shiftFilter?: string
): string[] {
  const resultSlots = new Set<string>();

  // 1. Fetch from actual timetable slots recorded for this college
  if (collegeId && slots && slots.length > 0) {
    const matchingCollegeSlots = slots.filter(s => {
      const matchCol = s.college_id === collegeId || (s as any).collegeId === collegeId;
      if (!matchCol) return false;
      if (shiftFilter) {
        const sShift = ((s.shift || "") as string).toLowerCase().replace(/[\s_-]/g, "");
        const targetShift = shiftFilter.toLowerCase().replace(/[\s_-]/g, "");
        if (sShift && sShift !== targetShift) return false;
      }
      return Boolean(s.time);
    });

    matchingCollegeSlots.forEach(s => {
      const t = (s.time || "").trim();
      if (t) resultSlots.add(t);
    });

    // If this college already has active timetable slots, those are its authoritative period times
    if (resultSlots.size > 0) {
      return Array.from(resultSlots).sort((a, b) => {
        const sA = parseTimeToMinutes((a.split("-")[0] || a).trim());
        const sB = parseTimeToMinutes((b.split("-")[0] || b).trim());
        return sA - sB;
      });
    }
  }

  // 2. Parse shift_configs if configured for this college (only when no actual timetable slots exist)
  if (collegeId && colleges && colleges.length > 0) {
    const college = colleges.find(c => c.id === collegeId);
    if (college?.shift_configs) {
      try {
        const parsed = typeof college.shift_configs === "string"
          ? JSON.parse(college.shift_configs)
          : college.shift_configs;

        const hasShifts = Boolean(college.has_shifts);
        const desiredShift = shiftFilter
          ? shiftFilter.toLowerCase().replace(/[\s_-]/g, "")
          : (hasShifts ? "shift1" : "general");

        // First check direct period arrays (e.g. parsed.general, parsed.shift_1)
        const shiftKeys = Object.keys(parsed).filter(k => k !== "custom_shift_params" && k !== "semester_configs" && k !== "semesters");
        const matchingKey = shiftKeys.find(k => k.toLowerCase().replace(/[\s_-]/g, "") === desiredShift);
        if (matchingKey && Array.isArray(parsed[matchingKey]) && parsed[matchingKey].length > 0) {
          parsed[matchingKey].forEach((t: string) => {
            if (t && typeof t === "string") resultSlots.add(t.trim());
          });
        }

        // If not found in direct arrays, check custom_shift_params
        if (resultSlots.size === 0 && parsed.custom_shift_params) {
          const paramKey = Object.keys(parsed.custom_shift_params).find(
            k => k.toLowerCase().replace(/[\s_-]/g, "") === desiredShift
          );
          const param = paramKey
            ? parsed.custom_shift_params[paramKey]
            : (parsed.custom_shift_params.general || parsed.custom_shift_params.shift_1 || Object.values(parsed.custom_shift_params)[0]);
          if (param) {
            const res = calculateShiftSchedule(param);
            if (res && res.items) {
              res.items
                .filter(item => item.type === "period")
                .forEach(item => {
                  resultSlots.add(`${item.startTimeStr} - ${item.endTimeStr}`);
                });
            }
          }
        }
      } catch (_) {}
    }
  }

  // 3. Fallback: gather from any other college slots in workspace
  if (resultSlots.size === 0 && slots && slots.length > 0) {
    slots.forEach(s => {
      const t = (s.time || "").trim();
      if (t) resultSlots.add(t);
    });
  }

  // 4. Default standard fallback if completely unconfigured
  if (resultSlots.size === 0) {
    return [
      "9.00 AM - 9.50 AM",
      "9.50 AM - 10.40 AM",
      "10.55 AM - 11.45 AM",
      "12.20 PM - 1.10 PM",
      "1.10 PM - 2.00 PM",
      "2.00 PM - 2.50 PM"
    ];
  }

  return Array.from(resultSlots).sort((a, b) => {
    const sA = parseTimeToMinutes((a.split("-")[0] || a).trim());
    const sB = parseTimeToMinutes((b.split("-")[0] || b).trim());
    return sA - sB;
  });
}

/**
 * Returns the operational working time boundary [minTimeMinutes, maxTimeMinutes]
 * for a college from its configured slots and shift parameters.
 */
export function getCollegeOperatingHours(
  collegeId?: string,
  colleges: any[] = [],
  slots: any[] = []
): { startMinutes: number; endMinutes: number; startTimeStr: string; endTimeStr: string } {
  const periodSlots = getCollegePeriodTimeSlots(collegeId, colleges, slots);
  let minMinutes = 24 * 60;
  let maxMinutes = 0;

  periodSlots.forEach(slotStr => {
    const parts = slotStr.replace(/to/i, "-").split("-").map(p => p.trim());
    if (parts.length >= 2) {
      const s = parseTimeToMinutes(parts[0]);
      const e = parseTimeToMinutes(parts[1]);
      if (s > 0 && s < minMinutes) minMinutes = s;
      if (e > 0 && e > maxMinutes) maxMinutes = e;
    }
  });

  // Default fallbacks if no slots are available (8:20 AM to 5:00 PM)
  if (minMinutes === 24 * 60) minMinutes = 8 * 60 + 20; // 8:20 AM
  if (maxMinutes === 0) maxMinutes = 17 * 60;           // 5:00 PM

  return {
    startMinutes: minMinutes,
    endMinutes: maxMinutes,
    startTimeStr: formatMinutesToTime(minMinutes),
    endTimeStr: formatMinutesToTime(maxMinutes)
  };
}

/**
 * Checks if a timetable slot time range (e.g. "8.20 AM - 9.10 AM", "10:00 AM - 11:00 AM")
 * overlaps with an exam's specified start and end time window (e.g. "10:00 AM", "01:00 PM").
 */
export function isSlotOverlappingExamWindow(
  slotTimeRange?: string,
  examStartTime?: string,
  examEndTime?: string
): boolean {
  if (!slotTimeRange || !examStartTime || !examEndTime) return false;

  const slotParts = slotTimeRange.replace(/to/i, "-").split("-").map(p => p.trim());
  if (slotParts.length < 2) return false;

  const slotStart = parseTimeToMinutes(slotParts[0]);
  const slotEnd = parseTimeToMinutes(slotParts[1]);
  const examStart = parseTimeToMinutes(examStartTime);
  const examEnd = parseTimeToMinutes(examEndTime);

  if (slotStart === 0 && slotEnd === 0) return false;
  if (examStart === 0 && examEnd === 0) return false;

  const effectiveSlotEnd = slotEnd <= slotStart ? slotStart + 50 : slotEnd;
  const effectiveExamEnd = examEnd <= examStart ? examStart + 180 : examEnd;

  return slotStart < effectiveExamEnd && effectiveSlotEnd > examStart;
}

/**
 * Evaluates the rolled-up daily attendance status for a student on a specific date.
 *
 * Rules:
 * 1. Strict Absence Rule: If a student is marked Absent ('absent') in ANY one period, the whole day status is Absent ('A')
 *    (presentDays = 0, absentDays = 1).
 * 2. Exam Day Rule: If the day order/type is Exam (isExamDay = true), attendance marked by ANY ONE mentor is sufficient
 *    for the whole day (pCount > 0 with 0 absent gives full day Present 'P' / presentDays = 1).
 * 3. On Duty (OD): If marked OD and no absent periods, counts as 'OD' (presentDays = 1).
 * 4. Regular Day: If marked present in all recorded periods (and aCount === 0), counts as 'P' (presentDays = 1).
 */
export interface DailyAttendanceEvaluation {
  status: "P" | "A" | "OD" | "H" | "—";
  presentDays: number;
  absentDays: number;
  totalMarked: number;
  pCount: number;
  aCount: number;
  odCount: number;
  isExamDay: boolean;
  isHoliday?: boolean;
  tooltipInfo: string;
}

export function mapDayOrderToDayName(dayOrder?: string | null, defaultDay: string = "Monday"): string {
  if (!dayOrder || dayOrder === "None" || dayOrder === "none") {
    return defaultDay;
  }
  const clean = String(dayOrder).trim();
  const dayNames = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  
  // Direct weekday check
  const directMatch = dayNames.find(d => d.toLowerCase() === clean.toLowerCase() || d.toLowerCase().startsWith(clean.toLowerCase().slice(0, 3)));
  if (directMatch) return directMatch;

  const match = clean.match(/Day[\s_-]*(\d+)/i);
  if (match) {
    const orderNum = parseInt(match[1], 10);
    if (orderNum >= 1 && orderNum <= dayNames.length) {
      return dayNames[orderNum - 1];
    }
  }
  return defaultDay;
}

export function isExamDate(
  dateStr: string,
  dailyConfigs: any[] = [],
  studentAttendance: any[] = [],
  examSchedules: any[] = []
): boolean {
  if (!dateStr) return false;

  // 1. Check scheduled exams
  if (examSchedules && examSchedules.some((ex: any) => ex.exam_date === dateStr)) {
    return true;
  }

  // 2. Check daily configs
  const cfg = dailyConfigs.find((c: any) => c.dateStr === dateStr);
  if (cfg) {
    const dType = (cfg.day_type || "").toLowerCase();
    const dOrder = (cfg.day_order || "").toLowerCase();
    const dNotes = (cfg.notes || "").toLowerCase();
    if (dType === "exam_day" || dType === "exam" || dOrder.includes("exam") || dNotes.includes("exam")) {
      return true;
    }
  }

  // 3. Check attendance records for this date
  const hasExamRecord = (studentAttendance || []).some(
    (a: any) => a.dateStr === dateStr && (
      (a.attendanceTypeSub && a.attendanceTypeSub.toLowerCase().includes("exam")) ||
      (a.type && a.type.toLowerCase().includes("exam"))
    )
  );

  return hasExamRecord;
}

export function evaluateDailyStudentAttendance(
  records: Array<{ status: string; [key: string]: any }>,
  stSlotsCount: number = 0,
  isExamDay: boolean = false,
  isHoliday: boolean = false,
  holidayRemarks: string = ""
): DailyAttendanceEvaluation {
  if (isHoliday) {
    return {
      status: "H",
      presentDays: 0,
      absentDays: 0,
      totalMarked: 0,
      pCount: 0,
      aCount: 0,
      odCount: 0,
      isExamDay: false,
      isHoliday: true,
      tooltipInfo: `Holiday${holidayRemarks ? ` — ${holidayRemarks}` : " (No classes scheduled)"}`
    };
  }

  if (!records || records.length === 0) {
    return {
      status: "—",
      presentDays: 0,
      absentDays: 0,
      totalMarked: 0,
      pCount: 0,
      aCount: 0,
      odCount: 0,
      isExamDay,
      isHoliday: false,
      tooltipInfo: "No attendance recorded"
    };
  }

  const pCount = records.filter(r => r.status === "present").length;
  const aCount = records.filter(r => r.status === "absent").length;
  const odCount = records.filter(r => r.status === "od").length;
  const totalMarked = records.length;
  const totalEff = Math.max(stSlotsCount, totalMarked);

  // RULE 0: Master Tracker Sheet compliance resolution (when hourly records carry daily compliance tag)
  // Bug 9 Fix: Support both camelCase attendanceTypeSub and lowercase attendancetypesub
  const masterDailyRec = records.find(r => {
    const sub = String(r.attendanceTypeSub || (r as any).attendancetypesub || "").toLowerCase().trim();
    return sub === "daily_present" || sub === "daily_absent";
  });
  if (masterDailyRec) {
    const sub = String(masterDailyRec.attendanceTypeSub || (masterDailyRec as any).attendancetypesub || "").toLowerCase().trim();
    const isDailyP = sub === "daily_present";
    return {
      status: isDailyP ? "P" : "A",
      presentDays: isDailyP ? 1 : 0,
      absentDays: isDailyP ? 0 : 1,
      totalMarked,
      pCount,
      aCount,
      odCount,
      isExamDay,
      tooltipInfo: isDailyP
        ? `Present (Master: Present | Hourly: ${pCount}P / ${aCount}A)`
        : `Absent (Master: Absent | Hourly: ${pCount}P / ${aCount}A)`
    };
  }

  // RULE 1: If absent in ANY period -> Whole day is Absent (A)
  if (aCount > 0) {
    return {
      status: "A",
      presentDays: 0,
      absentDays: 1,
      totalMarked,
      pCount,
      aCount,
      odCount,
      isExamDay,
      tooltipInfo: `Absent in ${aCount} period(s) → Whole Day Absent`
    };
  }

  // RULE 2: If Exam Day -> ANY 1 mentor attendance marking is enough!
  if (isExamDay) {
    if (odCount > 0 && pCount === 0) {
      return {
        status: "OD",
        presentDays: 1,
        absentDays: 0,
        totalMarked,
        pCount,
        aCount,
        odCount,
        isExamDay,
        tooltipInfo: `Exam Day: On Duty (OD)`
      };
    }
    if (pCount > 0 || odCount > 0) {
      return {
        status: "P",
        presentDays: 1,
        absentDays: 0,
        totalMarked,
        pCount,
        aCount,
        odCount,
        isExamDay,
        tooltipInfo: `Exam Day: Present (${pCount + odCount} period(s) marked)`
      };
    }
  }

  // Regular Day (no absent periods)
  if (odCount > 0 && (odCount + pCount >= totalEff || pCount === 0)) {
    return {
      status: "OD",
      presentDays: 1,
      absentDays: 0,
      totalMarked,
      pCount,
      aCount,
      odCount,
      isExamDay,
      tooltipInfo: `On Duty: ${odCount}/${totalEff} periods`
    };
  }

  if (pCount > 0) {
    return {
      status: "P",
      presentDays: 1,
      absentDays: 0,
      totalMarked,
      pCount,
      aCount,
      odCount,
      isExamDay,
      tooltipInfo: `Present: ${pCount}/${totalEff} periods`
    };
  }

  return {
    status: "—",
    presentDays: 0,
    absentDays: 0,
    totalMarked,
    pCount,
    aCount,
    odCount,
    isExamDay,
    tooltipInfo: "No valid status"
  };
}

/**
 * Standard Attendance Presence Check.
 * Treats 'present', 'p', 'od', and 'on_duty' as present across all dashboards (KAM, Admin, CM).
 */
export function isAttendancePresent(status: string | undefined | null | boolean | number): boolean {
  if (status === true || status === 1) return true;
  if (!status) return false;
  const s = String(status).toLowerCase().trim();
  return s === "present" || s === "p" || s === "od" || s === "on_duty" || s === "on duty";
}

export function isSkillSubject(subject: { name?: string; type?: string } | string | null | undefined): boolean {
  if (!subject) return false;
  const name = typeof subject === "string" ? subject : subject.name || "";
  const type = typeof subject === "string" ? "" : (subject.type || "");
  const n = name.toLowerCase().trim();
  const t = type.toLowerCase().trim();

  // 1. Explicit Batch Creation type check - ONLY type 'SKILL' is a skill course
  if (t === "skill") return true;
  if (t === "academic" || t === "theory" || t === "lab" || t === "practical") return false;

  // 2. Keyword checks on subject name - strictly skill keywords (NO lab/general practical)
  if (
    n.includes("soft skills") ||
    n.includes("communication skills") ||
    n.includes("communication") ||
    n.includes("aptitude") ||
    n.includes("portfolio") ||
    n.includes("nan mudhalvan") ||
    n.includes("nmc") ||
    n.includes("viva") ||
    n.includes("fop") ||
    n.includes("dsa") ||
    n.includes("leetcode") ||
    n.includes("placement") ||
    n.includes("full stack") ||
    n.includes("reinforcement learning")
  ) {
    return true;
  }

  // If the word "skill" is in the name and it is not a lab course
  if (n.includes("skill") && !n.includes("lab")) {
    return true;
  }

  return false;
}

export function isAcademicSubject(subject: { name?: string; type?: string } | string | null | undefined): boolean {
  if (!subject) return false;
  const type = typeof subject === "string" ? "" : (subject.type || "");
  const t = type.toLowerCase().trim();
  if (t === "academic" || t === "theory" || t === "lab" || t === "practical") return true;
  if (t === "skill") return false;
  return !isSkillSubject(subject);
}

/**
 * Calculates the weekOffset integer relative to current week (Monday-based) for a given target YYYY-MM-DD date.
 * Allows jump-to-week for class schedule notifications.
 */
export function calculateWeekOffsetForDate(targetDateStr: string, baseDateStr?: string): number {
  try {
    const target = new Date(targetDateStr + "T00:00:00");
    if (isNaN(target.getTime())) return 0;
    
    // Find Monday of target week
    const targetMon = new Date(target);
    const tDay = targetMon.getDay();
    const tDiff = (tDay === 0 ? -6 : 1) - tDay;
    targetMon.setDate(targetMon.getDate() + tDiff);
    targetMon.setHours(0, 0, 0, 0);

    // Find Monday of base week
    const base = baseDateStr ? new Date(baseDateStr + "T00:00:00") : new Date();
    const baseMon = new Date(base);
    const bDay = baseMon.getDay();
    const bDiff = (bDay === 0 ? -6 : 1) - bDay;
    baseMon.setDate(baseMon.getDate() + bDiff);
    baseMon.setHours(0, 0, 0, 0);

    const diffDays = Math.round((targetMon.getTime() - baseMon.getTime()) / (1000 * 60 * 60 * 24));
    return Math.round(diffDays / 7);
  } catch {
    return 0;
  }
}

/**
 * Extracts and formats the operating day start and end time for a given college
 * by evaluating shift_configs, custom_shift_params, or direct timings.
 */
export function getCollegeStartAndEndTime(college: any): { start: string; end: string } {
  if (!college) return { start: "08:30 AM", end: "04:30 PM" };
  if (college.start_time && college.end_time) {
    return { start: college.start_time, end: college.end_time };
  }
  if (!college.shift_configs) return { start: "08:30 AM", end: "04:30 PM" };
  try {
    const parsed = typeof college.shift_configs === "string" ? JSON.parse(college.shift_configs) : college.shift_configs;
    let minStart = Infinity;
    let maxEnd = -Infinity;

    // 1. Check custom_shift_params
    if (parsed.custom_shift_params && typeof parsed.custom_shift_params === "object") {
      Object.values(parsed.custom_shift_params).forEach((param: any) => {
        if (!param) return;
        if (param.startTime) {
          const sMin = parseTimeToMinutes(param.startTime);
          if (sMin && sMin < minStart) minStart = sMin;
        }
        if (param.mode === "fixed" && param.endTime) {
          const eMin = parseTimeToMinutes(param.endTime);
          if (eMin && eMin > maxEnd) maxEnd = eMin;
        } else if (param.startTime && param.periodDuration && param.periodsCount) {
          let curr = parseTimeToMinutes(param.startTime);
          const breaks = Array.isArray(param.breaks) ? [...param.breaks].sort((a: any, b: any) => (a.afterPeriod || 0) - (b.afterPeriod || 0)) : [];
          for (let p = 1; p <= param.periodsCount; p++) {
            const dur = (param.customPeriodDurations && param.customPeriodDurations[p]) ? param.customPeriodDurations[p] : param.periodDuration;
            curr += dur;
            const brk = breaks.find((b: any) => b.afterPeriod === p);
            if (brk && brk.duration) curr += brk.duration;
          }
          if (curr > maxEnd) maxEnd = curr;
        }
      });
    }

    // 2. Check slot arrays (general, shift_1, shift_2, etc.)
    ["shift_1", "shift_2", "general"].forEach(key => {
      const arr = parsed[key];
      if (Array.isArray(arr) && arr.length > 0) {
        const first = arr[0];
        const last = arr[arr.length - 1];
        if (typeof first === "string" && first.includes("-")) {
          const sStr = first.split("-")[0].trim();
          const sMin = parseTimeToMinutes(sStr);
          if (sMin && sMin < minStart) minStart = sMin;
        }
        if (typeof last === "string" && last.includes("-")) {
          const eStr = last.split("-")[1].trim();
          const eMin = parseTimeToMinutes(eStr);
          if (eMin && eMin > maxEnd) maxEnd = eMin;
        }
      }
    });

    if (minStart !== Infinity && maxEnd !== -Infinity) {
      const formatTime = (totalMinutes: number): string => {
        let hours = Math.floor(totalMinutes / 60) % 24;
        const minutes = totalMinutes % 60;
        const ampm = hours >= 12 ? "PM" : "AM";
        let displayHours = hours % 12;
        if (displayHours === 0) displayHours = 12;
        const displayHoursStr = displayHours < 10 ? "0" + displayHours : String(displayHours);
        const displayMinutesStr = minutes < 10 ? "0" + minutes : String(minutes);
        return `${displayHoursStr}:${displayMinutesStr} ${ampm}`;
      };

      return {
        start: formatTime(minStart),
        end: formatTime(maxEnd)
      };
    }
  } catch (_) {}
  return { start: "08:30 AM", end: "04:30 PM" };
}

/**
 * Generates an uppercase campus code acronym or short identifier from campus name.
 */
export const generateCampusCode = (name: string): string => {
  if (!name || !name.trim()) return "";
  const stopwords = new Set(["of", "and", "the", "for", "in", "at", "&", "to", "a", "an"]);
  const rawWords = name.trim().replace(/[^a-zA-Z0-9\s-]/g, " ").split(/[\s-]+/).filter(Boolean);
  const words = rawWords.filter(w => !stopwords.has(w.toLowerCase()));
  const list = words.length > 0 ? words : rawWords;

  if (list.length === 1) {
    return list[0].substring(0, 6).toUpperCase();
  }

  // Preserve words that are already uppercase acronyms (e.g. "FP", "IIT", "SRM")
  const parts = list.map(w => {
    if (w.length <= 4 && w === w.toUpperCase() && /^[A-Z0-9]+$/.test(w)) {
      return w;
    }
    return w[0].toUpperCase();
  });

  const combined = parts.join("");
  if (combined.length >= 2 && combined.length <= 8) {
    return combined;
  }

  return combined.substring(0, 8);
};

/**
 * Generates a standard degree or course code from a course name.
 */
export const generateCodeFromName = (name: string): string => {
  if (!name || typeof name !== "string") return "";
  const words = name.replace(/with|and|for/gi, "").split(/\s+/).filter(Boolean);
  const code = words.map(w => {
    const cleanWord = w.replace(/[^a-zA-Z0-9]/g, "");
    if (!cleanWord) return "";
    if (/^\d+$/.test(cleanWord)) return cleanWord;
    const lower = cleanWord.toLowerCase();
    if (lower === "bsc") return "BSC";
    if (lower === "bba") return "BBA";
    if (lower === "bcom") return "BCOM";
    if (lower === "bca") return "BCA";
    const match = cleanWord.match(/^([a-zA-Z]+)(\d+)$/);
    if (match) return match[1][0].toUpperCase() + match[2];
    return cleanWord[0].toUpperCase();
  }).filter(Boolean).join("-");
  return code || "";
};

/**
 * Formats a defaultRoom JSON string or raw string into human-readable year-wise rooms.
 */
export const formatYearWiseRooms = (defaultRoomStr?: string): string => {
  if (!defaultRoomStr) return "None";
  if (!defaultRoomStr.startsWith("{")) return defaultRoomStr;
  try {
    const parsed = JSON.parse(defaultRoomStr);
    return Object.keys(parsed)
      .map(year => `Year ${year}: ${parsed[year]}`)
      .join(", ");
  } catch (_) {
    return defaultRoomStr;
  }
};


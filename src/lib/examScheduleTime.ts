import { getInstitutionDateStr } from "@/lib/localDate";

export type ExamTimelineStatus = "upcoming" | "in_progress" | "completed" | "cancelled";

export interface ExamTimeFields {
  exam_date?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  session_time?: string | null;
  status?: string | null;
}

function parseTimeMinutes(value?: string | null): number | null {
  if (!value) return null;
  const match = value.trim().match(/^(\d{1,2})(?::|\.)(\d{2})(?:\s*(AM|PM))?$/i);
  if (!match) return null;

  let hours = Number(match[1]);
  const minutes = Number(match[2]);
  const meridiem = match[3]?.toUpperCase();
  if (minutes > 59 || hours > (meridiem ? 12 : 23) || (meridiem && hours === 0)) return null;

  if (meridiem === "PM" && hours !== 12) hours += 12;
  if (meridiem === "AM" && hours === 12) hours = 0;
  return hours * 60 + minutes;
}

function getSessionParts(sessionTime?: string | null) {
  if (!sessionTime) return { start: null, end: null };
  const parts = sessionTime.trim().split(/\s*(?:\bto\b|[-–—])\s*/i);
  return parts.length === 2 ? { start: parts[0], end: parts[1] } : { start: null, end: null };
}

export function getExamTimeRange(exam: ExamTimeFields): string {
  const session = getSessionParts(exam.session_time);
  const start = exam.start_time || session.start;
  const end = exam.end_time || session.end;
  if (start && end) return `${start} - ${end}`;
  if (exam.session_time?.trim()) return exam.session_time.trim();
  if (start) return `${start} - End time not set`;
  return "Time not set";
}

export function getExamTimelineStatus(
  exam: ExamTimeFields,
  now: Date
): ExamTimelineStatus {
  if (exam.status?.toLowerCase() === "cancelled") return "cancelled";
  if (!exam.exam_date) return "upcoming";

  const today = getInstitutionDateStr(now);
  if (exam.exam_date < today) return "completed";
  if (exam.exam_date > today) return "upcoming";

  const parts = getSessionParts(exam.session_time);
  const start = parseTimeMinutes(exam.start_time || parts.start);
  const end = parseTimeMinutes(exam.end_time || parts.end) ?? 17 * 60;
  const timeParts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).formatToParts(now);
  const currentMinutes = Number(timeParts.find((part) => part.type === "hour")?.value || 0) * 60
    + Number(timeParts.find((part) => part.type === "minute")?.value || 0);

  if (currentMinutes >= end) return "completed";
  if (start !== null && currentMinutes < start) return "upcoming";
  return "in_progress";
}

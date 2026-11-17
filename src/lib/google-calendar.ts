/**
 * Google Calendar & Google Meet Integration Service
 * 
 * Provides:
 * 1. Real Google Calendar Event creation via Google Apps Script Webhook
 * 2. 1-Click "Add to Google Calendar" URL generator (pre-populated with title, timings, Google Meet link & attendee emails)
 * 3. RFC-5545 compliant iCalendar (.ics) event string generator
 */

import { getInstitutionDateStr } from "@/lib/localDate";
import { fetchWithTimeout } from "@/lib/net";

export interface GoogleCalendarEventOptions {
  title: string;
  description?: string;
  targetDate: string; // YYYY-MM-DD
  startTime?: string; // e.g. "08:20 AM" or "8.20 AM"
  endTime?: string;   // e.g. "09:10 AM" or "9.10 AM"
  attendees?: string[]; // email addresses
  existingMeetLink?: string | null;
  interviewId?: string;
}

export interface GoogleCalendarResult {
  gmeet_link: string | null;
  gcal_link: string;
  meet_id: string | null;
  ics_content: string;
  event_created?: boolean;
  error?: string;
}

/** Accept only a specific HTTPS Meet room, never the generic /new launcher or a fake code. */
export function normalizeGoogleMeetLink(value?: string | null): string | null {
  if (!value?.trim()) return null;
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "https:" || url.hostname.toLowerCase() !== "meet.google.com" || url.username || url.password) return null;
    const path = url.pathname.replace(/\/+$/, "").toLowerCase();
    if (!/^\/[a-z]{3}-[a-z]{4}-[a-z]{3}$/.test(path)) return null;
    return `https://meet.google.com${path}${url.search}`;
  } catch {
    return null;
  }
}

export function getCalendarAppsScriptUrl(): string | null {
  const candidate = (
    process.env.GOOGLE_CALENDAR_GAS_URL ||
    process.env.NEXT_PUBLIC_GAS_MAIL_URL ||
    process.env.GOOGLE_APPS_SCRIPT_URL ||
    process.env.GAS_URL ||
    ""
  ).trim();
  if (!candidate) return null;
  try {
    const url = new URL(candidate);
    const validPath = /^(?:\/macros\/s\/[^/]+\/exec\/?|\/a\/macros\/[^/]+\/s\/[^/]+\/exec\/?$)/.test(url.pathname);
    if (url.protocol === "https:" && url.hostname === "script.google.com" && validPath) return url.toString();
  } catch {
    // Invalid deployment URLs are treated as unconfigured; interview assignment can still proceed.
  }
  console.error("Google Calendar Apps Script URL is invalid; expected an HTTPS script.google.com/macros/.../exec deployment URL.");
  return null;
}

/**
 * Parse human time (e.g. "08:20 AM" or "8.20 AM") on targetDate (YYYY-MM-DD) into ISO string for Google Calendar
 */
export function formatGCalDateTime(dateStr: string, timeStr?: string): { startISO: string; endISO: string } {
  const cleanDate = dateStr && dateStr.includes("-") ? dateStr : getInstitutionDateStr();
  
  const parseHourMin = (t?: string, defaultHour = 9, defaultMin = 0) => {
    if (!t) return { hour: defaultHour, minute: defaultMin };
    const cleaned = t.trim().toLowerCase().replace(".", ":");
    const isPM = cleaned.includes("pm");
    const isAM = cleaned.includes("am");
    const timePart = cleaned.replace(/am|pm/g, "").trim();
    const parts = timePart.split(":");
    let h = parseInt(parts[0], 10) || defaultHour;
    const m = parseInt(parts[1], 10) || defaultMin;
    if (isPM && h < 12) h += 12;
    if (isAM && h === 12) h = 0;
    return { hour: h, minute: m };
  };

  const start = parseHourMin(timeStr, 8, 20);
  const end = { hour: start.hour, minute: start.minute + 50 };
  if (end.minute >= 60) {
    end.hour += Math.floor(end.minute / 60);
    end.minute = end.minute % 60;
  }

  const pad = (n: number) => String(n).padStart(2, "0");
  const ymd = cleanDate.replace(/-/g, "");

  const startISO = `${ymd}T${pad(start.hour)}${pad(start.minute)}00`;
  const endISO = `${ymd}T${pad(end.hour)}${pad(end.minute)}00`;

  return { startISO, endISO };
}

/**
 * Creates Google Calendar Event with Google Meet conference & 1-click URL
 */
export async function createGoogleCalendarEvent(options: GoogleCalendarEventOptions): Promise<GoogleCalendarResult> {
  const {
    title,
    description = "Structured Interview Assessment Session",
    targetDate,
    startTime = "08:20 AM",
    endTime = "09:10 AM",
    attendees = [],
    existingMeetLink,
    interviewId = ""
  } = options;

  // 1. Only carry forward a link somebody actually created. A made-up 3-4-3 code opens
  //    Google's "meeting link is not valid" page, so it must never be minted or persisted.
  let gmeetLink = normalizeGoogleMeetLink(existingMeetLink);

  const { startISO, endISO } = formatGCalDateTime(targetDate, startTime);

  // 2. Try to call Google Apps Script Webhook to create real Google Calendar Event if configured
  let eventCreated = false;
  let effectiveGcalLink: string | null = null;
  const gasUrl = getCalendarAppsScriptUrl();
  if (gasUrl) {
    try {
      // Deadlined: this call sits on the accept/final-confirm write path, so a stalled
      // Apps Script used to freeze the interview confirmation instead of degrading.
      const response = await fetchWithTimeout(gasUrl, {
        method: "POST",
        redirect: "follow",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({
          action: "create_calendar_event",
          summary: title,
          description: buildEventDescription(description, gmeetLink),
          start_date: targetDate,
          start_time: startTime,
          end_time: endTime,
          timeZone: "Asia/Kolkata",
          attendees: attendees.filter(Boolean),
          conference: true
        })
      });
      if (response.ok) {
        const text = await response.text();
        try {
          const data = JSON.parse(text);
          if (data.success !== false) {
            const returnedMeetLink = normalizeGoogleMeetLink(data.meet_url);
            if (returnedMeetLink) gmeetLink = returnedMeetLink;
            if (typeof data.html_link === "string" && data.html_link.startsWith("https://calendar.google.com/")) {
              effectiveGcalLink = data.html_link;
            }
          }
          eventCreated = Boolean(gmeetLink || effectiveGcalLink);
        } catch (_) {}
      }
    } catch (gasErr) {
      console.warn("GAS Calendar event trigger error (fallback used):", gasErr);
    }
  }

  // 3. Generate 1-Click "Add to Google Calendar" Template Link
  const gcalDetails = buildEventDescription(description, gmeetLink);
  const locationParam = gmeetLink ? `&location=${encodeURIComponent(gmeetLink)}` : "";
  const gcalLink = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(title)}&dates=${startISO}/${endISO}&details=${encodeURIComponent(gcalDetails)}${locationParam}&add=${encodeURIComponent(attendees.filter(Boolean).join(","))}`;

  // 4. Generate RFC-5545 iCalendar content
  const conferenceLines = gmeetLink
    ? [`LOCATION:${gmeetLink}`, `URL:${gmeetLink}`, `X-GOOGLE-CONFERENCE:${gmeetLink}`]
    : [];
  const icsContent = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//FACE Prep//E-Campus Interview System//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:REQUEST",
    "BEGIN:VEVENT",
    `UID:interview_${interviewId || Date.now()}@faceprep.in`,
    `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, "").split(".")[0]}Z`,
    `DTSTART:${startISO}`,
    `DTEND:${endISO}`,
    `SUMMARY:${title}`,
    `DESCRIPTION:${gcalDetails.replace(/\n/g, "\\n")}`,
    ...conferenceLines,
    "STATUS:CONFIRMED",
    "END:VEVENT",
    "END:VCALENDAR"
  ].join("\r\n");

  const meetId = gmeetLink ? gmeetLink.replace("https://meet.google.com/", "") : null;

  return {
    gmeet_link: gmeetLink,
    gcal_link: effectiveGcalLink || gcalLink,
    meet_id: meetId,
    ics_content: icsContent,
    event_created: eventCreated
  };
}

function buildEventDescription(description: string, gmeetLink: string | null): string {
  return gmeetLink
    ? `${description}\n\nJoin Google Meet: ${gmeetLink}`
    : `${description}\n\nGoogle Meet link will be shared by your evaluator once the session is scheduled.`;
}

/**
 * Generate a personalized 1-Click "Add to Google Calendar" link for an individual student
 * with their exact 15-minute slot time and Google Meet link.
 */
export function generateStudentGCalUrl(options: {
  studentName: string;
  studentEmail?: string;
  subject: string;
  targetDate: string;
  slotStartTime: string;
  slotEndTime: string;
  gmeetLink?: string | null;
  mentorName?: string;
}): string {
  const { studentName, studentEmail, subject, targetDate, slotStartTime, slotEndTime, gmeetLink, mentorName } = options;
  const { startISO, endISO } = formatGCalDateTime(targetDate, slotStartTime);
  const title = `Technical Interview: ${subject} - ${studentName}`;
  const description = `1-on-1 Structured Evaluation Session\nSubject: ${subject}\nCandidate: ${studentName}\nEvaluator: ${mentorName || 'Faculty Panel'}\nSlot Time: ${slotStartTime} - ${slotEndTime}\n\n${buildEventDescription("", gmeetLink ?? null).trim()}`;
  const attendeesList = [studentEmail].filter(Boolean).join(",");
  const locationParam = gmeetLink ? `&location=${encodeURIComponent(gmeetLink)}` : "";

  return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(title)}&dates=${startISO}/${endISO}&details=${encodeURIComponent(description)}${locationParam}${attendeesList ? `&add=${encodeURIComponent(attendeesList)}` : ""}`;
}

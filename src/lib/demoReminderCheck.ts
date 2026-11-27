import { getDb } from "@/lib/db";
import { getLocalDateStr, INSTITUTION_TIME_ZONE } from "@/lib/localDate";
import { dispatchSystemNotification } from "@/lib/notifications";

export function parseClockMinutes(t: string): number {
  if (!t) return -1;
  const m = String(t).trim().match(/^(\d{1,2})(?:[:.](\d{2}))?\s*(AM|PM)?/i);
  if (!m) return -1;
  let hr = parseInt(m[1], 10);
  const min = m[2] ? parseInt(m[2], 10) : 0;
  const ampm = m[3] ? m[3].toUpperCase() : null;
  if (ampm === "PM" && hr < 12) hr += 12;
  if (ampm === "AM" && hr === 12) hr = 0;
  return hr * 60 + min;
}

export function parseSlotWindow(slot: string): { startMin: number; endMin: number } {
  if (!slot) return { startMin: 540, endMin: 600 };
  const range = slot.match(/(\d{1,2}:\d{2}\s*(?:AM|PM))\s*-\s*(\d{1,2}:\d{2}\s*(?:AM|PM))/i);
  if (!range) return { startMin: 540, endMin: 600 };
  const s = parseClockMinutes(range[1]);
  const e = parseClockMinutes(range[2]);
  return { startMin: s >= 0 ? s : 540, endMin: e >= 0 ? e : 600 };
}

export function getInstitutionClockMinutes(at: Date = new Date()): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: INSTITUTION_TIME_ZONE,
    hour: "numeric",
    minute: "numeric",
    hour12: false
  }).formatToParts(at);
  const hour = parseInt(parts.find(p => p.type === "hour")?.value || "0", 10);
  const minute = parseInt(parts.find(p => p.type === "minute")?.value || "0", 10);
  return hour * 60 + minute;
}

/**
 * Scans today's scheduled/confirmed demo sessions and fires a 5-minute pre-demo
 * reminder alert to both Mentor and SME if they haven't been reminded yet.
 */
export async function processUpcomingDemoReminders(customDb?: any) {
  const db = customDb || (await getDb());
  const todayStr = getLocalDateStr();
  const currentMin = getInstitutionClockMinutes();

  // Find all active scheduled / confirmed sessions for today where 5-min reminder hasn't been sent
  const candidateSessions = await db.all(
    `SELECT * FROM demo_sessions
     WHERE status IN ('scheduled', 'confirmed')
       AND dateStr = ?
       AND (reminder_5m_sent_at IS NULL OR reminder_5m_sent_at = '')
     ORDER BY dateStr ASC`,
    [todayStr]
  ).catch(() => []);

  if (!candidateSessions || candidateSessions.length === 0) {
    return { count: 0, remindedSessions: [] };
  }

  const sessionsToRemind: any[] = [];
  for (const session of candidateSessions) {
    const { startMin } = parseSlotWindow(session.timeSlot);
    const diff = startMin - currentMin;

    // Trigger reminder when between 5 minutes before start and up to 2 minutes past start
    if (diff <= 5 && diff >= -2) {
      sessionsToRemind.push(session);
    }
  }

  if (sessionsToRemind.length === 0) {
    return { count: 0, remindedSessions: [] };
  }

  const nowIso = new Date().toISOString();
  const dispatchedIds: string[] = [];

  for (const s of sessionsToRemind) {
    try {
      await db.run(
        `UPDATE demo_sessions
         SET reminder_5m_sent_at = ?
         WHERE id = ? AND (reminder_5m_sent_at IS NULL OR reminder_5m_sent_at = '')`,
        [nowIso, s.id]
      );

      const meetLink = s.meet_link || null;

      // 1. Send Reminder to Mentor
      if (s.mentorId) {
        await dispatchSystemNotification(db, {
          userIds: [s.mentorId],
          title: "Demo Starting in 5 Minutes!",
          message: `Your demo session for ${s.subject} with SME ${s.smeName || "Evaluator"} starts in 5 minutes (${s.timeSlot}).`,
          link: meetLink || "/mentor/demo_evaluations",
          type: "reminder",
          domain: "demo_reminder",
          action: "demo_reminder",
          push: true,
          dedupeKey: `demo:${s.id}:5m_reminder:mentor`,
          payload: {
            sessionId: s.id,
            meetLink,
            subject: s.subject,
            timeSlot: s.timeSlot,
            smeName: s.smeName
          }
        }).catch((err: any) => console.warn(`[demoReminderCheck] failed to notify mentor ${s.mentorId}:`, err?.message));
      }

      // 2. Send Reminder to SME
      if (s.smeId) {
        await dispatchSystemNotification(db, {
          userIds: [s.smeId],
          title: "Demo Starting in 5 Minutes!",
          message: `Upcoming demo session with Mentor ${s.mentorName || "Faculty"} for ${s.subject} starts in 5 minutes (${s.timeSlot}).`,
          link: meetLink || "/sme/overview",
          type: "reminder",
          domain: "demo_reminder",
          action: "demo_reminder",
          push: true,
          dedupeKey: `demo:${s.id}:5m_reminder:sme`,
          payload: {
            sessionId: s.id,
            meetLink,
            subject: s.subject,
            timeSlot: s.timeSlot,
            mentorName: s.mentorName
          }
        }).catch((err: any) => console.warn(`[demoReminderCheck] failed to notify sme ${s.smeId}:`, err?.message));
      }

      dispatchedIds.push(s.id);
    } catch (err: any) {
      console.warn(`[demoReminderCheck] Error processing reminder for session ${s.id}:`, err?.message);
    }
  }

  return { count: dispatchedIds.length, remindedSessions: dispatchedIds };
}

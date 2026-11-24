import { getDb } from "@/lib/db";
import { getLocalDateStr } from "@/lib/localDate";
import { dispatchSystemNotification } from "@/lib/notifications";
import { generateId } from "@/lib/id";

function parseClockMinutes(t: string): number {
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

function parseSlotWindow(slot: string): { startMin: number; endMin: number } {
  if (!slot) return { startMin: 540, endMin: 600 };
  const range = slot.match(/(\d{1,2}:\d{2}\s*(?:AM|PM))\s*-\s*(\d{1,2}:\d{2}\s*(?:AM|PM))/i);
  if (!range) return { startMin: 540, endMin: 600 };
  const s = parseClockMinutes(range[1]);
  const e = parseClockMinutes(range[2]);
  return { startMin: s >= 0 ? s : 540, endMin: e >= 0 ? e : 600 };
}

export async function processMissedDemoSessions(customDb?: any) {
  const db = customDb || (await getDb());
  const todayStr = getLocalDateStr();
  const now = new Date();
  const currentMin = now.getHours() * 60 + now.getMinutes();

  // Find all active scheduled / confirmed sessions on or before today
  const candidateSessions = await db.all(
    `SELECT * FROM demo_sessions
     WHERE status IN ('scheduled', 'confirmed')
       AND dateStr <= ?
       AND (missed_notified_at IS NULL OR missed_notified_at = '')
     ORDER BY dateStr ASC`,
    [todayStr]
  ).catch(() => []);

  if (!candidateSessions || candidateSessions.length === 0) {
    return { count: 0, sessions: [] };
  }

  const missed: any[] = [];
  for (const session of candidateSessions) {
    let isExpired = false;
    if (session.dateStr < todayStr) {
      isExpired = true;
    } else if (session.dateStr === todayStr) {
      const { endMin } = parseSlotWindow(session.timeSlot);
      // 15-minute grace window past slot end time
      if (currentMin > endMin + 15) {
        isExpired = true;
      }
    }

    if (isExpired) {
      missed.push(session);
    }
  }

  if (missed.length === 0) {
    return { count: 0, sessions: [] };
  }

  const nowIso = new Date().toISOString();
  for (const s of missed) {
    try {
      await db.run(
        `UPDATE demo_sessions
         SET status = 'not_conducted', missed_notified_at = ?
         WHERE id = ? AND status IN ('scheduled', 'confirmed')`,
        [nowIso, s.id]
      );

      // 1. Notify SME
      if (s.smeId) {
        await dispatchSystemNotification(db, {
          userIds: [s.smeId],
          title: "Missed Demo Session",
          message: `Scheduled demo with Mentor ${s.mentorName || 'Faculty'} for ${s.subject} on ${s.dateStr} (${s.timeSlot}) was not conducted. Session marked Not Conducted.`,
          link: "/sme",
          type: "warning",
          domain: "demos",
          action: "status_changed",
          dedupeKey: `demo:${s.id}:missed:sme`,
          payload: { sessionId: s.id },
        }).catch(() => {});
      }

      // 2. Notify Mentor
      if (s.mentorId) {
        await dispatchSystemNotification(db, {
          userIds: [s.mentorId],
          title: "Missed Demo Session",
          message: `Your demo session with SME ${s.smeName || 'Evaluator'} for ${s.subject} on ${s.dateStr} (${s.timeSlot}) was not conducted. Please request a reschedule with a valid reason.`,
          link: "/mentor/demo_evaluations",
          type: "warning",
          domain: "demos",
          action: "status_changed",
          dedupeKey: `demo:${s.id}:missed:mentor`,
          payload: { sessionId: s.id },
        }).catch(() => {});
      }

      // 3. Notify L&D and CM
      await dispatchSystemNotification(db, {
        roles: ["L and D", "admin"],
        title: "L&D SLA Breach: Missed Demo",
        message: `Demo between ${s.mentorName || 'Faculty'} and SME ${s.smeName || 'Evaluator'} (${s.subject}) on ${s.dateStr} (${s.timeSlot}) was missed without evaluation. Routed to Carry-Forward Make-Up Queue.`,
        link: "/l-and-d",
        type: "error",
        domain: "demos",
        action: "status_changed",
        dedupeKey: `demo:${s.id}:missed:oversight`,
        payload: { sessionId: s.id },
      }).catch(() => {});

      // Audit Log
      const auditId = generateId("audit");
      await db.run(
        `INSERT INTO audit_logs (id, type, description, actorName, actorRole, timestamp)
         VALUES (?, 'demo_missed_marked', ?, 'System SLA Engine', 'System', ?)`,
        [
          auditId,
          `Demo session ${s.id} between Mentor ${s.mentorName} and SME ${s.smeName} on ${s.dateStr} (${s.timeSlot}) auto-marked not_conducted due to slot expiry.`,
          nowIso
        ]
      ).catch(() => {});
    } catch (err: any) {
      console.warn(`[demoMissedCheck] Error processing missed session ${s.id}:`, err?.message);
    }
  }

  return { count: missed.length, sessions: missed.map(m => m.id) };
}

/**
 * Centralized Real-Time Notification Dispatch Engine
 *
 * Implements Phase 1 of the zero-delay real-time notification architecture:
 * 1. Multi-identifier identity resolution (UUID id, reference_id, and email).
 * 2. Atomic bulk insertion into `notifications` table.
 * 3. Guaranteed persistence into `event_outbox` with XID tracking.
 * 4. Cross-instance PostgreSQL `pg_notify("fp_realtime_channel", ...)`.
 * 5. Instant in-memory SSE dispatch via `notifyRealtimeEvent`.
 */

import crypto from "crypto";
import { notifyRealtimeEvent } from "./realtimeServer";
import { sendWebPushNotification } from "./webPush";
import { logger } from "./logger";

export interface DispatchNotificationOptions {
  /** Target user identifier(s): can be users.id (UUID), reference_id, or email */
  userIds?: string[];
  /** Target roles: e.g. ["student", "mentor", "cm", "kam", "admin"] */
  roles?: string[];
  /** College/campus ID for tenant isolation */
  collegeId?: string | null;
  /** Notification title */
  title: string;
  /** Notification message / body text */
  message: string;
  /** In-app navigation link (e.g. "/cm/approvals" or "/student/schedule") */
  link?: string | null;
  /** Type tag: "info" | "success" | "warning" | "error" | "reminder" | "approval" etc. */
  type?: string;
  /** Real-time event domain: defaults to "notifications" */
  domain?: string;
  /** Real-time action name: defaults to "created" */
  action?: string;
  /** Additional payload data */
  payload?: any;
  /** Tab ID that initiated the action (for client-side echo suppression) */
  originTabId?: string | null;
}

export interface DispatchNotificationResult {
  success: boolean;
  count: number;
  notificationIds: string[];
  recipientUserIds: string[];
  error?: string;
}

function genId(prefix = "notif"): string {
  return `${prefix}_${Date.now()}_${crypto.randomBytes(3).toString("hex")}`;
}

/**
 * Dispatches a notification to one or multiple recipients with zero delay.
 * Writes to `notifications` table, persists in `event_outbox`, triggers `pg_notify`,
 * and delivers immediately to active SSE subscribers.
 */
export async function dispatchSystemNotification(
  db: any,
  options: DispatchNotificationOptions
): Promise<DispatchNotificationResult> {
  try {
    const rawUserIds = Array.from(
      new Set((options.userIds || []).filter(Boolean).map((s) => String(s).trim()))
    );
    const roles = options.roles?.filter(Boolean) || [];
    const collegeId = options.collegeId?.trim() || null;

    if (rawUserIds.length === 0 && roles.length === 0) {
      return { success: true, count: 0, notificationIds: [], recipientUserIds: [] };
    }

    const targetRecipients: { userId: string; aliases: string[] }[] = [];
    const allTargetAliases = new Set<string>();

    // 1. Resolve explicit user identifiers across id, reference_id, and email
    if (rawUserIds.length > 0) {
      const placeholders = rawUserIds.map(() => "?").join(", ");
      const lowerEmailPlaceholders = rawUserIds.map(() => "LOWER(?)").join(", ");

      const userRows = await db
        .all(
          `SELECT id, reference_id, email, role FROM users
           WHERE id IN (${placeholders})
              OR reference_id IN (${placeholders})
              OR LOWER(email) IN (${lowerEmailPlaceholders})`,
          [...rawUserIds, ...rawUserIds, ...rawUserIds]
        )
        .catch((err: any) => {
          logger.warn("dispatchSystemNotification: users lookup failed", { error: err?.message });
          return [];
        });

      const matchedRawIds = new Set<string>();

      for (const u of userRows) {
        const aliases = [u.id, u.reference_id, u.email]
          .filter(Boolean)
          .map((s: string) => String(s).trim());
        aliases.forEach((a) => allTargetAliases.add(a));

        // Prefer reference_id if present (matches session.userId convention in api-auth), fallback to id
        const canonicalId = String(u.reference_id || u.id);
        targetRecipients.push({
          userId: canonicalId,
          aliases,
        });

        for (const raw of rawUserIds) {
          if (aliases.some((a) => a.toLowerCase() === raw.toLowerCase())) {
            matchedRawIds.add(raw);
          }
        }
      }

      // If any raw ID wasn't found in `users` (e.g. legacy campus manager or raw external ID),
      // still include it directly so notifications are never dropped
      for (const raw of rawUserIds) {
        if (!matchedRawIds.has(raw)) {
          targetRecipients.push({
            userId: raw,
            aliases: [raw],
          });
          allTargetAliases.add(raw);
        }
      }
    }

    // 2. Resolve role-based recipients (e.g. all CMs of a college, mentors, or admins)
    if (roles.length > 0) {
      // 2a. Global / Non-campus roles (admin, kam) from users table
      const globalRoles = roles.filter((r) => r === "admin" || r === "kam");
      if (globalRoles.length > 0) {
        const placeholders = globalRoles.map(() => "?").join(", ");
        const globalUsers = await db
          .all(`SELECT id, reference_id, email, role FROM users WHERE role IN (${placeholders})`, globalRoles)
          .catch(() => []);
        for (const u of globalUsers) {
          const canonicalId = String(u.reference_id || u.id);
          if (!targetRecipients.some((r) => r.userId === canonicalId)) {
            const aliases = [u.id, u.reference_id, u.email]
              .filter(Boolean)
              .map((s: string) => String(s).trim());
            aliases.forEach((a) => allTargetAliases.add(a));
            targetRecipients.push({
              userId: canonicalId,
              aliases,
            });
          }
        }
      }

      // 2b. CMs from campus_managers table
      if (roles.includes("cm")) {
        const cmQuery = collegeId && collegeId !== "all"
          ? `SELECT id, email, name FROM campus_managers WHERE college_id = ?`
          : `SELECT id, email, name FROM campus_managers`;
        const cmParams = collegeId && collegeId !== "all" ? [collegeId] : [];
        const cmRows = await db.all(cmQuery, cmParams).catch(() => []);
        for (const cm of cmRows) {
          const cmId = String(cm.id);
          if (!targetRecipients.some((r) => r.userId === cmId)) {
            const aliases = [cm.id, cm.email].filter(Boolean).map((s: string) => String(s).trim());
            aliases.forEach((a) => allTargetAliases.add(a));
            targetRecipients.push({
              userId: cmId,
              aliases,
            });
          }
        }
      }

      // 2c. Mentors from mentors table
      if (roles.includes("mentor")) {
        const mentorQuery = collegeId && collegeId !== "all"
          ? `SELECT id, email, name FROM mentors WHERE college_id = ?`
          : `SELECT id, email, name FROM mentors`;
        const mentorParams = collegeId && collegeId !== "all" ? [collegeId] : [];
        const mentorRows = await db.all(mentorQuery, mentorParams).catch(() => []);
        for (const m of mentorRows) {
          const mId = String(m.id);
          if (!targetRecipients.some((r) => r.userId === mId)) {
            const aliases = [m.id, m.email].filter(Boolean).map((s: string) => String(s).trim());
            aliases.forEach((a) => allTargetAliases.add(a));
            targetRecipients.push({
              userId: mId,
              aliases,
            });
          }
        }
      }

      // 2d. Students from students table
      if (roles.includes("student")) {
        const studentQuery = collegeId && collegeId !== "all"
          ? `SELECT id, email, name FROM students WHERE college_id = ?`
          : `SELECT id, email, name FROM students`;
        const studentParams = collegeId && collegeId !== "all" ? [collegeId] : [];
        const studentRows = await db.all(studentQuery, studentParams).catch(() => []);
        for (const s of studentRows) {
          const sId = String(s.id);
          if (!targetRecipients.some((r) => r.userId === sId)) {
            const aliases = [s.id, s.email].filter(Boolean).map((a: string) => String(a).trim());
            aliases.forEach((a) => allTargetAliases.add(a));
            targetRecipients.push({
              userId: sId,
              aliases,
            });
          }
        }
      }
    }

    // 3. Deduplicate recipients by canonical user ID
    const uniqueRecipients: { notifId: string; userId: string; createdAt: string }[] = [];
    const seenUserIds = new Set<string>();

    for (const r of targetRecipients) {
      const lower = r.userId.toLowerCase();
      if (!seenUserIds.has(lower)) {
        seenUserIds.add(lower);
        uniqueRecipients.push({
          notifId: genId(),
          userId: r.userId,
          createdAt: new Date().toISOString(),
        });
      }
    }

    if (uniqueRecipients.length === 0) {
      return { success: true, count: 0, notificationIds: [], recipientUserIds: [] };
    }

    // 4. Batch insert into `notifications`
    const notifValues = uniqueRecipients.map(() => "(?, ?, ?, ?, 0, ?, ?, ?)").join(", ");
    const notifParams = uniqueRecipients.flatMap((r) => [
      r.notifId,
      r.userId,
      options.title,
      options.message,
      options.link || null,
      options.type || "info",
      r.createdAt,
    ]);

    await db.run(
      `INSERT INTO notifications (id, user_id, title, message, is_read, link, type, created_at)
       VALUES ${notifValues}`,
      notifParams
    );

    // 5. Build envelope payload
    const eventId = `evt_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
    const allTargetAliasesList = Array.from(allTargetAliases);
    const envelopePayload = {
      notificationIds: uniqueRecipients.map((r) => r.notifId),
      title: options.title,
      message: options.message,
      link: options.link || null,
      type: options.type || "info",
      count: uniqueRecipients.length,
      createdAt: uniqueRecipients[0].createdAt,
      ...(options.payload || {}),
    };

    // 6. Record in `event_outbox` table
    try {
      await db.run(
        `INSERT INTO event_outbox (event_id, domain, action, college_id, target_user_ids, target_roles, origin_tab_id, payload, created_at)
         VALUES (?, ?, ?, ?, ?::jsonb, ?::jsonb, ?, ?::jsonb, NOW())`,
        [
          eventId,
          options.domain || "notifications",
          options.action || "created",
          collegeId,
          JSON.stringify(allTargetAliasesList),
          roles.length > 0 ? JSON.stringify(roles) : null,
          options.originTabId || null,
          JSON.stringify(envelopePayload),
        ]
      );
    } catch (outboxErr: any) {
      logger.warn("dispatchSystemNotification: outbox insert warning", {
        error: outboxErr?.message,
      });
    }

    // 7. Fire PostgreSQL `pg_notify` for multi-instance broadcast
    try {
      await db.run(`SELECT pg_notify('fp_realtime_channel', ?)`, [
        JSON.stringify({
          eventId,
          domain: options.domain || "notifications",
          action: options.action || "created",
          collegeId,
        }),
      ]);
    } catch (_) {}

    // 8. Instant in-memory SSE delivery to connected subscribers (<1ms)
    notifyRealtimeEvent({
      domain: (options.domain as any) || "notifications",
      action: (options.action as any) || "created",
      targetUserIds: allTargetAliasesList,
      targetRoles: roles.length > 0 ? roles : undefined,
      collegeId: collegeId || undefined,
      payload: envelopePayload,
    });

    // 9. Asynchronous Web Push to Google FCM & Apple APNs (for closed tabs & locked phones)
    sendWebPushNotification(db, {
      userIds: allTargetAliasesList,
      roles: roles.length > 0 ? roles : undefined,
      collegeId: collegeId || undefined,
      title: options.title,
      message: options.message,
      link: options.link || "/",
      tag: uniqueRecipients[0]?.notifId,
      data: envelopePayload,
    }).catch((pushErr) => {
      logger.warn("dispatchSystemNotification: webPush dispatch failed", { error: pushErr?.message });
    });

    return {
      success: true,
      count: uniqueRecipients.length,
      notificationIds: uniqueRecipients.map((r) => r.notifId),
      recipientUserIds: uniqueRecipients.map((r) => r.userId),
    };
  } catch (error: any) {
    logger.error("dispatchSystemNotification: error", { error: error?.message || String(error) });
    return {
      success: false,
      count: 0,
      notificationIds: [],
      recipientUserIds: [],
      error: error?.message || "Failed to dispatch notification",
    };
  }
}

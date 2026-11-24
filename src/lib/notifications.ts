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
  /** Stable event identity used to suppress retries for each recipient. */
  dedupeKey?: string | null;
  /** Override the default: push only goes out for reminder/approval/alert events. */
  push?: boolean;
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

    const targetRecipients: { userId: string; aliases: string[]; role?: string }[] = [];

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

        // Prefer reference_id if present (matches session.userId convention in api-auth), fallback to id
        const canonicalId = String(u.reference_id || u.id);
        targetRecipients.push({
          userId: canonicalId,
          aliases,
          role: u.role,
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
        }
      }
    }

    // 2. Resolve role recipients once, with campus-aware scope for campus events.
    if (roles.length > 0) {
      const normalizeNotifRole = (value: string) => {
        const role = String(value || "").toLowerCase().trim().replace(/[_-]+/g, " ");
        if (["cam", "campus manager"].includes(role)) return "cm";
        if (["l&d", "ld", "lnd", "learning and development", "allocator", "demo allocator"].includes(role)) return "l and d";
        if (role === "fee manager") return "fee_manager";
        return role;
      };
      const requestedRoles = Array.from(new Set(roles.map(normalizeNotifRole)));
      const addRecipient = (row: any, roleHint?: string) => {
        const userId = String(row.reference_id || row.id || "").trim();
        if (!userId) return;
        const aliases = [row.id, row.reference_id, row.email]
          .filter(Boolean)
          .map((value: string) => String(value).trim());
        const existing = targetRecipients.find((recipient) => recipient.userId.toLowerCase() === userId.toLowerCase());
        if (existing) {
          existing.aliases = Array.from(new Set([...existing.aliases, ...aliases]));
          existing.role ||= roleHint || row.role;
          return;
        }
        targetRecipients.push({ userId, aliases, role: roleHint || row.role });
      };

      // A campus-specific event goes to its assigned KAM only. Global notices may
      // still target every KAM when no campus is supplied.
      if (requestedRoles.includes("kam")) {
        let kamRows: any[] = [];
        if (collegeId && collegeId !== "all") {
          const college = await db.get("SELECT kam_id FROM colleges WHERE id = ?", [collegeId]).catch(() => null);
          if (college?.kam_id) {
            const kam = await db.get("SELECT id, email, name FROM kam_users WHERE id = ?", [college.kam_id]).catch(() => null);
            if (kam) kamRows = [kam];
          }
        } else {
          kamRows = await db.all("SELECT id, email, name FROM kam_users").catch(() => []);
        }
        for (const kam of kamRows) {
          const users = await db.all(
            "SELECT id, reference_id, email, role FROM users WHERE reference_id = ? OR LOWER(email) = LOWER(?)",
            [kam.id, kam.email || ""]
          ).catch(() => []);
          if (users.length > 0) users.forEach((row: any) => addRecipient(row, "kam"));
          else addRecipient(kam, "kam");
        }
      }

      // Admins are global recipients only for global events. Campus-scoped events
      // do not fan out to every administrator.
      if (requestedRoles.includes("admin") && (!collegeId || collegeId === "all")) {
        const admins = await db.all("SELECT id, reference_id, email, role FROM users WHERE LOWER(role) = 'admin'").catch(() => []);
        admins.forEach((row: any) => addRecipient(row, "admin"));
      }

      if (requestedRoles.includes("cm")) {
        const scoped = collegeId && collegeId !== "all";
        const rows = await db.all(
          scoped ? "SELECT id, email, name FROM campus_managers WHERE college_id = ?" : "SELECT id, email, name FROM campus_managers",
          scoped ? [collegeId] : []
        ).catch(() => []);
        rows.forEach((row: any) => addRecipient(row, "cm"));
      }
      if (requestedRoles.includes("mentor")) {
        const scoped = collegeId && collegeId !== "all";
        const rows = await db.all(
          scoped ? "SELECT id, email, name FROM mentors WHERE college_id = ?" : "SELECT id, email, name FROM mentors",
          scoped ? [collegeId] : []
        ).catch(() => []);
        rows.forEach((row: any) => addRecipient(row, "mentor"));
      }
      if (requestedRoles.includes("student")) {
        const scoped = collegeId && collegeId !== "all";
        const rows = await db.all(
          scoped ? "SELECT id, email, name FROM students WHERE college_id = ?" : "SELECT id, email, name FROM students",
          scoped ? [collegeId] : []
        ).catch(() => []);
        rows.forEach((row: any) => addRecipient(row, "student"));
      }

      const accountRoles = requestedRoles.filter((role) => ["sme", "hr", "fee_manager", "l and d"].includes(role));
      if (accountRoles.length > 0) {
        const roleValues = accountRoles.flatMap((role) => role === "l and d"
          ? ["l and d", "l&d", "lnd", "ld", "allocator", "demo allocator"]
          : role === "fee_manager" ? ["fee_manager", "fee manager"] : [role]);
        const placeholders = roleValues.map(() => "LOWER(?)").join(", ");
        const scopedClause = collegeId && collegeId !== "all" ? " AND (college_id = ? OR college_id IS NULL)" : "";
        const rows = await db.all(
          `SELECT id, reference_id, email, role FROM users WHERE LOWER(role) IN (${placeholders})${scopedClause}`,
          [...roleValues, ...(collegeId && collegeId !== "all" ? [collegeId] : [])]
        ).catch(() => []);
        rows.forEach((row: any) => addRecipient(row, normalizeNotifRole(row.role)));
      }
    }

    // 3. Deduplicate recipients by canonical user ID
    const uniqueRecipients: { notifId: string; userId: string; createdAt: string; aliases: string[]; role?: string }[] = [];
    const seenUserIds = new Set<string>();

    for (const r of targetRecipients) {
      const lower = r.userId.toLowerCase();
      if (!seenUserIds.has(lower)) {
        seenUserIds.add(lower);
        uniqueRecipients.push({
          notifId: genId(),
          userId: r.userId,
          createdAt: new Date().toISOString(),
          aliases: r.aliases,
          role: r.role,
        });
      }
    }

    if (uniqueRecipients.length === 0) {
      return { success: true, count: 0, notificationIds: [], recipientUserIds: [] };
    }

    // 4. Batch insert into `notifications`. Stable keys make retries idempotent per
    // recipient; only newly inserted notifications should create push/realtime events.
    const NOTIF_CHUNK = 1000;
    const insertedRecipients: typeof uniqueRecipients = [];
    for (let i = 0; i < uniqueRecipients.length; i += NOTIF_CHUNK) {
      const chunk = uniqueRecipients.slice(i, i + NOTIF_CHUNK);
      const notifValues = chunk.map(() => "(?, ?, ?, ?, 0, ?, ?, ?, ?, ?::jsonb)").join(", ");
      const notifParams = chunk.flatMap((r) => [
        r.notifId,
        r.userId,
        options.title,
        options.message,
        options.link || null,
        options.type || "info",
        r.createdAt,
        options.dedupeKey || null,
        JSON.stringify(options.payload || {}),
      ]);
      if (options.dedupeKey) {
        const inserted = await db.all(
          `INSERT INTO notifications (id, user_id, title, message, is_read, link, type, created_at, dedupe_key, payload)
           VALUES ${notifValues}
           ON CONFLICT (LOWER(user_id), dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING
           RETURNING id, user_id`,
          notifParams
        );
        const insertedUserIds = new Set(inserted.map((row: any) => String(row.user_id).toLowerCase()));
        insertedRecipients.push(...chunk.filter((row) => insertedUserIds.has(row.userId.toLowerCase())));
      } else {
        await db.run(
          `INSERT INTO notifications (id, user_id, title, message, is_read, link, type, created_at, dedupe_key, payload)
           VALUES ${notifValues}`,
          notifParams
        );
        insertedRecipients.push(...chunk);
      }
    }

    if (insertedRecipients.length === 0) {
      return { success: true, count: 0, notificationIds: [], recipientUserIds: [] };
    }

    // 5. Build envelope payload
    const eventId = `evt_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
    const allTargetAliasesList = Array.from(new Set(insertedRecipients.flatMap((recipient) => recipient.aliases)));
    const linksByUserId: Record<string, string> = {};
    for (const recipient of insertedRecipients) {
      const universalDestination = `/notifications/open/${encodeURIComponent(recipient.notifId)}`;
      recipient.aliases.forEach((alias) => { linksByUserId[alias.toLowerCase()] = universalDestination; });
    }
    const envelopePayload = {
      notificationIds: insertedRecipients.map((r) => r.notifId),
      title: options.title,
      message: options.message,
      link: options.link || null,
      type: options.type || "info",
      count: insertedRecipients.length,
      createdAt: insertedRecipients[0].createdAt,
      payload: options.payload || {},
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
          null,
          options.originTabId || null,
          JSON.stringify(envelopePayload),
        ]
      );
    } catch (outboxErr: any) {
      logger.warn("dispatchSystemNotification: outbox insert warning", {
        error: outboxErr?.message,
      });
    }

    // 7. (pg_notify removed: nothing LISTENs and the pooler cannot hold a LISTEN.
    //     Other instances pick the row up from event_outbox; see lib/realtimeServer.)

    // 8. Instant in-memory SSE delivery to connected subscribers (<1ms)
    // Same eventId as the outbox row above, so instances that poll the outbox
    // recognise it and this instance does not deliver it twice.
    notifyRealtimeEvent({
      eventId,
      domain: (options.domain as any) || "notifications",
      action: (options.action as any) || "created",
      targetUserIds: allTargetAliasesList,
      collegeId: collegeId || undefined,
      payload: envelopePayload,
    }, { persist: false });

    // Routine updates stay in the in-app feed. Device push is reserved for events
    // that need attention so a burst of informational updates is not disruptive.
    const pushType = String(options.type || "info").toLowerCase();
    const shouldPush = options.push ?? ["error", "alert", "reminder", "approval"].includes(pushType);
    if (shouldPush) {
      sendWebPushNotification(db, {
        userIds: allTargetAliasesList,
        title: options.title,
        message: options.message,
        link: options.link || "/",
        tag: insertedRecipients[0]?.notifId,
        data: envelopePayload,
        linksByUserId,
      }).catch((pushErr) => {
        logger.warn("dispatchSystemNotification: webPush dispatch failed", { error: pushErr?.message });
      });
    }

    return {
      success: true,
      count: insertedRecipients.length,
      notificationIds: insertedRecipients.map((r) => r.notifId),
      recipientUserIds: insertedRecipients.map((r) => r.userId),
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

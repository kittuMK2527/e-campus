/**
 * Web Push Server Engine (RFC 8291 / 8292 standard)
 *
 * Dispatches background push notifications directly to Google FCM (Android/Chrome)
 * and Apple APNs (iOS Safari / macOS) via the `web-push` package.
 * Automatically cleans up expired/unregistered endpoints (410 Gone / 404 Not Found).
 */

import * as webpushModule from "web-push";
const webpush = (webpushModule as any).default || webpushModule;
import { logger } from "./logger";

const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "";
const privateKey = process.env.VAPID_PRIVATE_KEY || "";
const subject = process.env.VAPID_SUBJECT || "mailto:support@faceprep.in";

if (publicKey && privateKey) {
  try {
    webpush.setVapidDetails(subject, publicKey, privateKey);
  } catch (err: any) {
    logger.warn("webPush: setVapidDetails failed", { error: err?.message });
  }
}

export function getVapidPublicKey(): string {
  return process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "";
}

export interface WebPushPayload {
  title: string;
  message: string;
  link?: string | null;
  tag?: string;
  icon?: string;
  badge?: string;
  data?: any;
}

export interface SendWebPushOptions extends WebPushPayload {
  userIds?: string[];
  roles?: string[];
  collegeId?: string | null;
}

export interface SendWebPushResult {
  success: boolean;
  sentCount: number;
  failedCount: number;
}

/**
 * Dispatches Web Push notifications to all subscribed devices matching the recipient criteria.
 */
export async function sendWebPushNotification(
  db: any,
  options: SendWebPushOptions
): Promise<SendWebPushResult> {
  if (!publicKey || !privateKey) {
    return { success: false, sentCount: 0, failedCount: 0 };
  }

  try {
    const rawUserIds = (options.userIds || []).map((u) => String(u).trim().toLowerCase()).filter(Boolean);
    const roles = (options.roles || []).map((r) => String(r).trim().toLowerCase()).filter(Boolean);
    const collegeId = options.collegeId?.trim() || null;

    if (rawUserIds.length === 0 && roles.length === 0) {
      return { success: true, sentCount: 0, failedCount: 0 };
    }

    // 1. Resolve target subscriptions from push_subscriptions table
    let query = "SELECT id, user_id, endpoint, p256dh, auth, role, college_id FROM push_subscriptions WHERE 1=1";
    const conditions: string[] = [];
    const params: any[] = [];

    if (rawUserIds.length > 0) {
      const placeholders = rawUserIds.map(() => "LOWER(?)").join(", ");
      conditions.push(`(LOWER(user_id) IN (${placeholders}))`);
      params.push(...rawUserIds);
    }

    if (roles.length > 0) {
      const rolePlaceholders = roles.map(() => "LOWER(?)").join(", ");
      let roleCondition = `LOWER(role) IN (${rolePlaceholders})`;
      if (collegeId && collegeId !== "all") {
        roleCondition += " AND (college_id IS NULL OR LOWER(college_id) = LOWER(?))";
        params.push(...roles, collegeId);
      } else {
        params.push(...roles);
      }
      conditions.push(`(${roleCondition})`);
    }

    query += " AND (" + conditions.join(" OR ") + ")";

    const subscriptions = await db.all(query, params).catch((err: any) => {
      logger.warn("sendWebPushNotification: query error", { error: err?.message });
      return [];
    });

    if (!subscriptions || subscriptions.length === 0) {
      return { success: true, sentCount: 0, failedCount: 0 };
    }

    // 2. Prepare payload
    const pushPayloadString = JSON.stringify({
      title: options.title,
      message: options.message,
      body: options.message,
      link: options.link || "/",
      url: options.link || "/",
      tag: options.tag || `tag_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      icon: options.icon || "/faceprep-fav.png",
      badge: options.badge || "/faceprep-fav.png",
      data: options.data || { url: options.link || "/" },
    });

    // 3. Dispatch to all subscribed endpoints in parallel
    let sentCount = 0;
    let failedCount = 0;
    const expiredEndpoints: string[] = [];

    await Promise.allSettled(
      subscriptions.map(async (sub: any) => {
        const pushSubscription = {
          endpoint: sub.endpoint,
          keys: {
            p256dh: sub.p256dh,
            auth: sub.auth,
          },
        };

        try {
          await webpush.sendNotification(pushSubscription, pushPayloadString, {
            TTL: 86400, // 24 hours retention on push gateways
            urgency: "high",
          });
          sentCount++;
        } catch (pushErr: any) {
          failedCount++;
          const statusCode = pushErr?.statusCode;
          // HTTP 404 Not Found or 410 Gone means the subscription is permanently expired/revoked
          if (statusCode === 404 || statusCode === 410) {
            expiredEndpoints.push(sub.endpoint);
          } else {
            logger.warn("webPush: individual delivery error", {
              endpoint: sub.endpoint.substring(0, 40),
              status: statusCode,
              error: pushErr?.message,
            });
          }
        }
      })
    );

    // 4. Prune expired endpoints from DB
    if (expiredEndpoints.length > 0) {
      const placeholders = expiredEndpoints.map(() => "?").join(", ");
      await db
        .run(`DELETE FROM push_subscriptions WHERE endpoint IN (${placeholders})`, expiredEndpoints)
        .catch(() => {});
    }

    return {
      success: true,
      sentCount,
      failedCount,
    };
  } catch (error: any) {
    logger.error("sendWebPushNotification: fatal error", { error: error?.message || String(error) });
    return {
      success: false,
      sentCount: 0,
      failedCount: 0,
    };
  }
}

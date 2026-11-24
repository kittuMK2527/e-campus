import { after } from "next/server";
import { getDb, readInChunks, chunkList, type QueryFailure } from "@/lib/db";
import { generateId } from "@/lib/id";
import { dispatchSystemNotification } from "@/lib/notifications";

interface ExternalInterviewNotificationOptions {
  interviewId: string;
  subject: string;
  classGroup?: string;
  targetDate: string;
  type: string;
  topics?: string;
  studentCount?: number;
  mentorName?: string;
  originCollegeId: string;
  targetCollegeId?: string;
  notes?: string;
  actionType?: "created" | "broadcast" | "accepted" | "declined" | "assigned" | "pending_confirmation";
  gmeetLink?: string;
  gcalLink?: string;
  actorName?: string;
}

/**
 * Sends in-app and web-push notifications for external interviews.
 * Notifies:
 * 1. The origin college KAM.
 * 2. All other colleges & CAMs managed by the SAME KAM (Regional College Cluster).
 * 3. The target/partner college CAM & KAM (if specified).
 */
export async function dispatchExternalInterviewNotifications(
  options: ExternalInterviewNotificationOptions
) {
  try {
    const db = await getDb();
    const {
      interviewId,
      subject,
      classGroup = "All Classes",
      targetDate,
      type = "external",
      topics = "General Review",
      studentCount = 0,
      mentorName = "Mentor",
      originCollegeId,
      targetCollegeId,
      actionType = "created",
      actorName = "Campus Team"
    } = options;

    if (!originCollegeId) return;

    // 1+3+5. The origin college, the target college and the target CAMs all key off
    // the options, so they leave as one round trip. Recipient rendering only: a
    // failed slice degrades to a missing recipient instead of failing the caller.
    const wantsTarget = Boolean(targetCollegeId && targetCollegeId !== originCollegeId);
    const recipientFailures: QueryFailure[] = [];
    const [originCollegeRows, targetCollegeRows, targetCamRows, originCamRows] = await db.multiQuery([
      { sql: "SELECT * FROM colleges WHERE id = ?", params: [originCollegeId] },
      wantsTarget
        ? { sql: "SELECT * FROM colleges WHERE id = ?", params: [targetCollegeId] }
        : { sql: "SELECT 1 WHERE 1=0" },
      wantsTarget
        ? { sql: "SELECT * FROM campus_managers WHERE college_id = ?", params: [targetCollegeId] }
        : { sql: "SELECT 1 WHERE 1=0" },
      { sql: "SELECT * FROM campus_managers WHERE college_id = ?", params: [originCollegeId] },
    ], recipientFailures);
    if (recipientFailures.length > 0) {
      console.warn("[interview-notifications] origin/target lookup incomplete:", recipientFailures.map(f => f.error).join("; "));
    }
    const originCollege = originCollegeRows[0];
    const kamId = originCollege?.kam_id;

    // 2+3. The regional cluster and the KAM user both key off kamId.
    let regionalColleges: any[] = [];
    let kamUser: any = null;
    if (kamId) {
      const clusterFailures: QueryFailure[] = [];
      const [regionalRows, kamRows] = await db.multiQuery([
        { sql: "SELECT * FROM colleges WHERE kam_id = ? AND id != ?", params: [kamId, originCollegeId] },
        { sql: "SELECT * FROM kam_users WHERE id = ?", params: [kamId] },
      ], clusterFailures);
      if (clusterFailures.length > 0) {
        console.warn("[interview-notifications] cluster lookup incomplete:", clusterFailures.map(f => f.error).join("; "));
      }
      regionalColleges = regionalRows;
      kamUser = kamRows[0] || null;
    }

    const regionalCollegeIds = regionalColleges.map((c: any) => c.id).filter(Boolean);

    // 4. Fetch all CAMs across ALL regional colleges under this KAM
    let regionalCAMs: any[] = [];
    if (regionalCollegeIds.length > 0) {
      const placeholders = regionalCollegeIds.map(() => "?").join(",");
      regionalCAMs = await db.all(
        `SELECT * FROM campus_managers WHERE college_id IN (${placeholders}) OR kam_id = ?`,
        [...regionalCollegeIds, kamId || ""]
      );
    }

    // 5. Target college CAMs (read above with the origin/target batch)
    const targetCAMs: any[] = targetCamRows;
    const targetCollege: any = targetCollegeRows[0];
    const originCAMs: any[] = originCamRows;

    // 6. Gather target User IDs for In-App Notifications
    const notificationUserIds = new Set<string>();

    // Add KAM
    if (kamId) {
      notificationUserIds.add(kamId);
      if (kamUser?.email) notificationUserIds.add(kamUser.email);
    }

    // A request raised by a mentor goes only to its origin campus. Regional
    // partners are notified once the origin CM actually broadcasts capacity.
    if (["created", "accepted", "declined", "assigned", "pending_confirmation"].includes(actionType)) {
      originCAMs.forEach((cam: any) => {
        if (cam.id) notificationUserIds.add(cam.id);
        if (cam.email) notificationUserIds.add(cam.email);
      });
    } else if (actionType === "broadcast") {
      regionalCAMs.forEach((cam: any) => {
        if (cam.id) notificationUserIds.add(cam.id);
        if (cam.email) notificationUserIds.add(cam.email);
      });
    }

    // A target campus is only a valid recipient when it is in the origin KAM zone.
    if (targetCollege && kamId && targetCollege.kam_id === kamId) {
      targetCAMs.forEach((cam: any) => {
        if (cam.id) notificationUserIds.add(cam.id);
        if (cam.email) notificationUserIds.add(cam.email);
      });
    }

    // Also match centralized `users` table records for these reference IDs / emails
    if (notificationUserIds.size > 0) {
      const idsArr = Array.from(notificationUserIds);
      const matchedUsers = await readInChunks(db, idsArr, (chunk, ph) => ({
        sql: `SELECT id FROM users WHERE reference_id IN (${ph}) OR email IN (${ph})`,
        params: [...chunk, ...chunk]
      }));
      matchedUsers.forEach((u: any) => notificationUserIds.add(u.id));
    }

    // 7. Determine notification titles & text based on actionType
    let notifTitle = `Interview update: ${subject}`;
    let notifMsg = `${subject} interview update for ${classGroup} on ${targetDate}. Open Interviews for details.`;

    if (actionType === "created") {
      notifTitle = `Interview request: ${subject}`;
      notifMsg = `${mentorName} requested an external interview for ${classGroup} on ${targetDate}. Please review it for ${originCollege?.name || "your campus"}.`;
    } else if (actionType === "broadcast") {
      notifTitle = `Interview capacity requested: ${subject}`;
      notifMsg = `${originCollege?.name || "A partner campus"} is requesting capacity for ${studentCount || 0} ${classGroup} student(s) on ${targetDate}. Open Interviews to respond.`;
    } else if (actionType === "accepted") {
      notifTitle = `Interview confirmed: ${subject}`;
      notifMsg = `${subject} is confirmed for ${targetDate}. Open Interviews to view the schedule and meeting details.`;
    } else if (actionType === "declined") {
      notifTitle = `Interview capacity declined: ${subject}`;
      notifMsg = `${actorName} declined capacity for ${subject} on ${targetDate}. Open Interviews to review remaining capacity.`;
    } else if (actionType === "assigned") {
      notifTitle = `Interview mentors assigned: ${subject}`;
      notifMsg = `${studentCount || 0} ${classGroup} student(s) have been assigned interview mentors for ${targetDate}. Open Interviews to view the schedule.`;
    } else if (actionType === "pending_confirmation") {
      notifTitle = `Interview allocation needs confirmation: ${subject}`;
      notifMsg = `The proposed allocation for ${subject} on ${targetDate} is ready. Open Interviews to review your campus allocation.`;
    }

    // 8. Dispatch the event once per recipient; the shared engine handles storage,
    // idempotency, realtime delivery, and push policy.
    const candidates = Array.from(notificationUserIds);
    // 8. Dispatch Real-Time In-App Notifications
    if (candidates.length > 0) {
      try {
        await dispatchSystemNotification(db, {
          userIds: candidates,
          title: notifTitle,
          message: notifMsg,
          link: "/cm/interviews",
          type: "info",
          domain: "interviews",
          action: "capacity_requested",
          // This event can reach origin and partner campuses; a single collegeId
          // would make the other campus discard an otherwise user-targeted update.
          dedupeKey: `interview:${interviewId}:${actionType || "created"}:${targetCollege?.id || "all"}`,
          payload: { interviewId, actionType: actionType || "created", targetDate, targetCollegeId: targetCollege?.id || null },
        });
      } catch (errNotif) {
        console.warn("Error inserting in-app notifications:", errNotif);
      }
    }

    console.log(`[External Notification] Successfully notified ${notificationUserIds.size} users`);
  } catch (error) {
    console.error("Failed to dispatch external interview notifications:", error);
  }
}

/**
 * Schedule the broadcast for after the response and return immediately.
 * A regional notification costs eight lookups, a chunked notification insert and
 * a relay leg that can burn 12s — none of which is what the caller clicked for.
 * Every interview route uses this; `dispatchExternalInterviewNotifications` stays
 * exported for callers that genuinely need to wait for the work.
 */
export function notifyExternalInterviewsAfterResponse(options: ExternalInterviewNotificationOptions): void {
  after(() => { void dispatchExternalInterviewNotifications(options); });
}

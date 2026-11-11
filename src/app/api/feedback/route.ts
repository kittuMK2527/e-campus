export const maxDuration = 60;

import { NextResponse } from "next/server";
import { getDb, type QueryFailure } from "@/lib/db";
import { getSessionFromRequest, normalizeRole, apiAuthErrorResponse } from "@/lib/api-auth";
import { requireAuth } from "@/lib/authGuard";
import { ensureMigration } from "@/lib/migrations";
import { generateId } from "@/lib/id";
import { dispatchSystemNotification } from "@/lib/notifications";

const FEEDBACK_READ_ALL_ROLES = ["admin", "kam", "superadmin"];

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const filterUserId = searchParams.get("userId");

    const session = await getSessionFromRequest(request);
    if (!session) {
      return NextResponse.json({ success: false, message: "Unauthorized: missing or invalid session." }, { status: 401 });
    }
    const canReadAll = FEEDBACK_READ_ALL_ROLES.includes(normalizeRole(session.role));
    if (!canReadAll) {
      // A supplied userId used to bypass the ownership check entirely, so any
      // visitor could read another person's reports by guessing an id.
      if (!filterUserId) {
        return NextResponse.json({ success: false, message: "Forbidden: admin or kam role required" }, { status: 403 });
      }
      const ownKeys = new Set(
        [String(session.userId || "").toLowerCase().trim(), String(session.email || "").toLowerCase().trim()].filter(Boolean)
      );
      if (!ownKeys.has(filterUserId.toLowerCase().trim())) {
        return NextResponse.json({ success: false, message: "Forbidden: you can only view your own reports." }, { status: 403 });
      }
    }

    await ensureMigration("feedback_reports_table");
    const db = await getDb();

    let reportsQuery = "SELECT * FROM feedback_reports";
    const reportsParams: any[] = [];
    if (filterUserId) {
      reportsQuery += " WHERE user_id = ? OR LOWER(TRIM(user_id)) = LOWER(TRIM(?))";
      reportsParams.push(filterUserId, filterUserId);
    }
    reportsQuery += ` ORDER BY created_at DESC LIMIT ${filterUserId ? 100 : 300}`;

    // The report rows and the college lookup are independent of each other, so the
    // enrichment header costs one round trip instead of two.
    const feedbackFailures: QueryFailure[] = [];
    const [reportRows, colleges] = await db.multiQuery(
      [
        { sql: reportsQuery, params: reportsParams },
        { sql: "SELECT id, name FROM colleges" },
      ],
      feedbackFailures
    );
    if (feedbackFailures.length > 0) {
      console.warn("[/api/feedback] partial read:", feedbackFailures.map(f => f.sql.slice(0, 60)));
    }
    const reports = reportRows;
    const collegeMap = new Map(colleges.map((c: any) => [c.id, c.name]));

    // Enrich reports with user and college details using batched lookups
    // instead of up to eight sequential queries per report.

    const userKeys = Array.from(new Set(
      reports.map((r: any) => String(r.user_id || "").trim()).filter(Boolean)
    ));
    const loweredKeys = userKeys.map((k) => k.toLowerCase());

    let studentRows: any[] = [];
    let mentorRows: any[] = [];
    let camRows: any[] = [];
    let userRows: any[] = [];
    if (userKeys.length > 0) {
      [studentRows, mentorRows, camRows, userRows] = await Promise.all([
        db.all(
          `SELECT id, name, register_number, roll_number, college_id, department, classGroup, phone, email
           FROM students
           WHERE LOWER(TRIM(email)) = ANY(?::text[]) OR id = ANY(?::text[]) OR LOWER(TRIM(id)) = ANY(?::text[])`,
          loweredKeys, userKeys, loweredKeys
        ).catch(() => []),
        db.all(
          `SELECT id, name, college_id, department, phone, email, employee_id
           FROM mentors
           WHERE LOWER(TRIM(email)) = ANY(?::text[]) OR id = ANY(?::text[]) OR LOWER(TRIM(id)) = ANY(?::text[])`,
          loweredKeys, userKeys, loweredKeys
        ).catch(() => []),
        db.all(
          `SELECT id, name, college_id, phone, email
           FROM campus_managers
           WHERE LOWER(TRIM(email)) = ANY(?::text[]) OR id = ANY(?::text[])`,
          loweredKeys, userKeys
        ).catch(() => []),
        db.all(
          `SELECT id, reference_id, role, LOWER(TRIM(email)) AS email_key
           FROM users
           WHERE LOWER(TRIM(email)) = ANY(?::text[]) OR id = ANY(?::text[])`,
          loweredKeys, userKeys
        ).catch(() => [])
      ]);
    }

    const byId = (rows: any[]) => {
      const map = new Map<string, any>();
      for (const row of rows) {
        if (row.id) {
          map.set(String(row.id), row);
          map.set(String(row.id).toLowerCase(), row);
        }
      }
      return map;
    };
    const byEmail = (rows: any[]) => {
      const map = new Map<string, any>();
      for (const row of rows) {
        const email = String(row.email || "").toLowerCase().trim();
        if (email) map.set(email, row);
      }
      return map;
    };
    const studentById = byId(studentRows);
    const studentByEmail = byEmail(studentRows);
    const mentorById = byId(mentorRows);
    const mentorByEmail = byEmail(mentorRows);
    const camById = byId(camRows);
    const camByEmail = byEmail(camRows);
    const userRefByKey = new Map<string, string>();
    for (const u of userRows) {
      if (!u.reference_id) continue;
      if (u.email_key) userRefByKey.set(String(u.email_key), u.reference_id);
      if (u.id) {
        userRefByKey.set(String(u.id), u.reference_id);
        userRefByKey.set(String(u.id).toLowerCase(), u.reference_id);
      }
    }
    const lookupPerson = (byKey: Map<string, any>, byIdMap: Map<string, any>, key: string) => {
      const lower = key.toLowerCase();
      const direct = byKey.get(lower) || byIdMap.get(key) || byIdMap.get(lower);
      if (direct) return direct;
      const ref = userRefByKey.get(key) || userRefByKey.get(lower);
      return ref ? (byIdMap.get(ref) || byIdMap.get(ref.toLowerCase())) : undefined;
    };

    const enriched = reports.map((r: any) => {
      let name = (r.user_name || "").trim();
      let collegeName = (r.college_name || "").trim();
      let department = (r.department || "").trim();
      let registerNumber = (r.register_number || "").trim();
      let contactInfo = (r.contact_info || "").trim();
      const userKey = (r.user_id || "").trim();

      if (userKey) {
        if (!name || !collegeName || !registerNumber) {
          const student = lookupPerson(studentByEmail, studentById, userKey);
          if (student) {
            name = name || student.name || "";
            department = department || student.department || student.classGroup || "";
            registerNumber = registerNumber || student.register_number || student.roll_number || "";
            contactInfo = contactInfo || student.phone || "";
            if (student.college_id && (!collegeName || collegeName === "—")) {
              collegeName = collegeMap.get(student.college_id) || student.college_id;
            }
          }
        }

        if (!name || !collegeName) {
          const mentor = lookupPerson(mentorByEmail, mentorById, userKey);
          if (mentor) {
            name = name || mentor.name || "";
            department = department || mentor.department || "";
            registerNumber = registerNumber || mentor.employee_id || "";
            contactInfo = contactInfo || mentor.phone || "";
            if (mentor.college_id && (!collegeName || collegeName === "—")) {
              collegeName = collegeMap.get(mentor.college_id) || mentor.college_id;
            }
          }
        }

        if (!name || !collegeName) {
          const cam = lookupPerson(camByEmail, camById, userKey);
          if (cam) {
            name = name || cam.name || "";
            contactInfo = contactInfo || cam.phone || "";
            if (cam.college_id && (!collegeName || collegeName === "—")) {
              collegeName = collegeMap.get(cam.college_id) || cam.college_id;
            }
          }
        }

        if (!name && userKey.includes("@")) {
          const clean = userKey.split("@")[0].replace(/[._0-9-]/g, " ").trim();
          if (clean) {
            name = clean.split(/\s+/).map((w: string) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ");
          }
        }
      }

      return {
        ...r,
        user_name: name || r.user_id || "User",
        college_name: collegeName || (r.college_id ? (collegeMap.get(r.college_id) || r.college_id) : ""),
        department: department || "",
        register_number: registerNumber || "",
        contact_info: contactInfo || ""
      };
    });

    return NextResponse.json({ success: true, reports: enriched });
  } catch (error: any) {
    const authRes = apiAuthErrorResponse(error);
    if (authRes) return authRes;
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { auth, errorResponse } = await requireAuth(request);
    if (errorResponse) return errorResponse;
    await ensureMigration("feedback_reports_table");
    const db = await getDb();
    const body = await request.json();
    const {
      userName,
      collegeId,
      collegeName,
      department,
      registerNumber,
      contactInfo,
      type,
      title,
      description
    } = body;

    if (!type || !title || !description) {
      return NextResponse.json({ success: false, message: "Type, title, and description are required." }, { status: 400 });
    }

    const reportId = generateId("fb");
    const nowStr = new Date().toISOString();

    await db.run(
      `INSERT INTO feedback_reports (
        id, user_id, user_name, user_role, college_id, college_name,
        department, register_number, contact_info, type, title, description, status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)`,
      [
        reportId,
        // The report history is filtered by the reporter's email, so keep that key
        // while taking it from the session instead of the request body.
        auth!.user.email || auth!.user.reference_id || auth!.user.id,
        userName || auth!.user.name || "",
        auth!.user.role,
        collegeId || auth!.user.college_id || "",
        collegeName || "",
        department || "",
        registerNumber || "",
        contactInfo || "",
        type,
        title,
        description,
        nowStr
      ]
    );

    return NextResponse.json({ success: true, message: "Feedback submitted successfully!", reportId });
  } catch (error: any) {
    const authRes = apiAuthErrorResponse(error);
    if (authRes) return authRes;
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const { auth, errorResponse } = await requireAuth(request, { allowedRoles: ["admin", "kam"] });
    if (errorResponse) return errorResponse;
    await ensureMigration("feedback_reports_table");
    const db = await getDb();
    const body = await request.json();
    const { id, status, adminNotes } = body;
    const resolvedBy = auth!.user.name || auth!.user.email || "Admin";

    if (!id || !status) {
      return NextResponse.json({ success: false, message: "Report id and status required" }, { status: 400 });
    }

    const existing: any = await db.get("SELECT * FROM feedback_reports WHERE id = ?", [id]).catch(() => null);
    if (!existing) {
      return NextResponse.json({ success: false, message: "Feedback report not found" }, { status: 404 });
    }

    const nowStr = new Date().toISOString();
    await db.run(
      `UPDATE feedback_reports SET
        status = ?,
        admin_notes = COALESCE(?, admin_notes),
        resolved_by = COALESCE(?, resolved_by),
        resolved_at = CASE WHEN ? IN ('resolved', 'closed') THEN ? ELSE resolved_at END
       WHERE id = ?`,
      [status, adminNotes || null, resolvedBy || null, status, nowStr, id]
    );

    // Notify the user who raised the issue via zero-delay notification engine
    if (existing.user_id && (status === "resolved" || status === "closed")) {
      const notifTitle = status === "resolved" ? "Issue / Feedback Resolved" : "Feedback Report Closed";
      const notifMsg = adminNotes
        ? `Your report "${existing.title}" was marked ${status} by ${resolvedBy || "Admin"}: "${adminNotes}"`
        : `Your report "${existing.title}" was marked ${status} by ${resolvedBy || "Admin"}.`;

      await dispatchSystemNotification(db, {
        userIds: [existing.user_id],
        title: notifTitle,
        message: notifMsg,
        type: status === "resolved" ? "success" : "info",
        domain: "feedback",
        action: "app_feedback_saved",
      }).catch(() => {});
    }

    return NextResponse.json({ success: true, message: "Feedback status updated successfully" });
  } catch (error: any) {
    const authRes = apiAuthErrorResponse(error);
    if (authRes) return authRes;
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

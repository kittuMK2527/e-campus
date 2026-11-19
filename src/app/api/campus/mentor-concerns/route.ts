export const maxDuration = 30;
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireAuth } from "@/lib/authGuard";
import { ensureMigration } from "@/lib/migrations";
import { generateId } from "@/lib/id";

// GET /api/campus/mentor-concerns?collegeId=...&mentorId=...&status=...
export async function GET(request: Request) {
  try {
    const { errorResponse } = await requireAuth(request);
    if (errorResponse) return errorResponse;

    await ensureMigration("mentor_concerns_log_table");
    const db = await getDb();

    const { searchParams } = new URL(request.url);
    const collegeId = (searchParams.get("collegeId") || "").trim();
    const mentorId = (searchParams.get("mentorId") || "").trim();
    const status = (searchParams.get("status") || "").trim();
    const category = (searchParams.get("category") || "").trim();

    let sql = `
      SELECT id, college_id, mentor_id, mentor_name, logged_by_id, logged_by_name,
             logged_by_role, category, severity, title, details, action_required,
             resolution_notes, status, target_date, resolved_at, created_at, updated_at
      FROM mentor_concerns_log
      WHERE 1=1
    `;
    const params: any[] = [];

    if (collegeId && collegeId !== "all") {
      sql += ` AND college_id = ?`;
      params.push(collegeId);
    }
    if (mentorId) {
      sql += ` AND mentor_id = ?`;
      params.push(mentorId);
    }
    if (status && status !== "all") {
      sql += ` AND status = ?`;
      params.push(status);
    }
    if (category && category !== "all") {
      sql += ` AND category = ?`;
      params.push(category);
    }

    sql += ` ORDER BY created_at DESC LIMIT 300`;

    const concerns = await db.all(sql, params);
    return NextResponse.json({ success: true, concerns: concerns || [] });
  } catch (error: any) {
    console.error("GET /api/campus/mentor-concerns error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

// POST /api/campus/mentor-concerns
export async function POST(request: Request) {
  try {
    const { auth, errorResponse } = await requireAuth(request, {
      checkCsrf: false,
      allowedRoles: ["cm", "kam", "admin"]
    });
    if (errorResponse) return errorResponse;

    await ensureMigration("mentor_concerns_log_table");
    const db = await getDb();

    const body = await request.json();
    const {
      college_id,
      mentor_id,
      mentor_name,
      category,
      severity,
      title,
      details,
      action_required,
      target_date
    } = body;

    if (!mentor_id || !title || !category) {
      return NextResponse.json(
        { success: false, message: "mentor_id, category, and title are required" },
        { status: 400 }
      );
    }

    const id = generateId("mcl");
    const loggedById = auth?.user?.id || auth?.user?.reference_id || "cm";
    const loggedByName = auth?.user?.name || "Campus Manager";
    const loggedByRole = auth?.user?.role || "cm";

    await db.run(
      `INSERT INTO mentor_concerns_log (
        id, college_id, mentor_id, mentor_name, logged_by_id, logged_by_name,
        logged_by_role, category, severity, title, details, action_required,
        resolution_notes, status, target_date, created_at, updated_at
      ) VALUES (
        ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?,
        '', 'open', ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      )`,
      [
        id,
        college_id || auth?.user?.college_id || "",
        mentor_id,
        mentor_name || "Faculty Mentor",
        loggedById,
        loggedByName,
        loggedByRole,
        category,
        severity || "medium",
        title.trim(),
        details ? details.trim() : "",
        action_required ? action_required.trim() : "",
        target_date || ""
      ]
    );

    return NextResponse.json({
      success: true,
      message: "Mentor concern logged successfully",
      id
    });
  } catch (error: any) {
    console.error("POST /api/campus/mentor-concerns error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

// PUT /api/campus/mentor-concerns
export async function PUT(request: Request) {
  try {
    const { auth, errorResponse } = await requireAuth(request, {
      checkCsrf: false,
      allowedRoles: ["cm", "kam", "admin"]
    });
    if (errorResponse) return errorResponse;

    await ensureMigration("mentor_concerns_log_table");
    const db = await getDb();

    const body = await request.json();
    const {
      id,
      title,
      details,
      action_required,
      resolution_notes,
      status,
      severity,
      category,
      target_date
    } = body;

    if (!id) {
      return NextResponse.json({ success: false, message: "id is required" }, { status: 400 });
    }

    const existing = await db.get("SELECT * FROM mentor_concerns_log WHERE id = ?", [id]);
    if (!existing) {
      return NextResponse.json({ success: false, message: "Mentor concern record not found" }, { status: 404 });
    }

    const updatedTitle = title !== undefined ? title.trim() : existing.title;
    const updatedDetails = details !== undefined ? details.trim() : existing.details;
    const updatedAction = action_required !== undefined ? action_required.trim() : existing.action_required;
    const updatedResolution = resolution_notes !== undefined ? resolution_notes.trim() : existing.resolution_notes;
    const updatedStatus = status || existing.status;
    const updatedSeverity = severity || existing.severity;
    const updatedCategory = category || existing.category;
    const updatedTargetDate = target_date !== undefined ? target_date : existing.target_date;
    const resolvedAt = updatedStatus === "resolved" ? "CURRENT_TIMESTAMP" : null;

    if (resolvedAt) {
      await db.run(
        `UPDATE mentor_concerns_log
         SET title = ?, details = ?, action_required = ?, resolution_notes = ?,
             status = ?, severity = ?, category = ?, target_date = ?,
             resolved_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [updatedTitle, updatedDetails, updatedAction, updatedResolution, updatedStatus, updatedSeverity, updatedCategory, updatedTargetDate, id]
      );
    } else {
      await db.run(
        `UPDATE mentor_concerns_log
         SET title = ?, details = ?, action_required = ?, resolution_notes = ?,
             status = ?, severity = ?, category = ?, target_date = ?,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [updatedTitle, updatedDetails, updatedAction, updatedResolution, updatedStatus, updatedSeverity, updatedCategory, updatedTargetDate, id]
      );
    }

    return NextResponse.json({
      success: true,
      message: "Mentor concern updated successfully"
    });
  } catch (error: any) {
    console.error("PUT /api/campus/mentor-concerns error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

// DELETE /api/campus/mentor-concerns?id=...
export async function DELETE(request: Request) {
  try {
    const { errorResponse } = await requireAuth(request, {
      checkCsrf: false,
      allowedRoles: ["cm", "kam", "admin"]
    });
    if (errorResponse) return errorResponse;

    const db = await getDb();
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ success: false, message: "id is required" }, { status: 400 });
    }

    await db.run("DELETE FROM mentor_concerns_log WHERE id = ?", [id]);
    return NextResponse.json({ success: true, message: "Mentor concern removed successfully" });
  } catch (error: any) {
    console.error("DELETE /api/campus/mentor-concerns error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

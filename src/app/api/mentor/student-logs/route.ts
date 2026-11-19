export const maxDuration = 30;
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireAuth } from "@/lib/authGuard";
import { ensureMigration } from "@/lib/migrations";
import { generateId } from "@/lib/id";
import { getInstitutionDateStr } from "@/lib/localDate";

// GET /api/mentor/student-logs?mentorId=...&studentId=...&collegeId=...&category=...
export async function GET(request: Request) {
  try {
    const { errorResponse } = await requireAuth(request);
    if (errorResponse) return errorResponse;

    await ensureMigration("student_concerns_log_table");
    const db = await getDb();

    const { searchParams } = new URL(request.url);
    const mentorId = (searchParams.get("mentorId") || "").trim();
    const studentId = (searchParams.get("studentId") || "").trim();
    const collegeId = (searchParams.get("collegeId") || "").trim();
    const classGroup = (searchParams.get("classGroup") || "").trim();
    const category = (searchParams.get("category") || "").trim();

    let sql = `
      SELECT id, college_id, mentor_id, mentor_name, student_id, student_name,
             student_reg_no, department, class_group, subject, category, title,
             details, metrics_json, status, created_at, updated_at
      FROM student_concerns_log
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
    if (studentId) {
      sql += ` AND student_id = ?`;
      params.push(studentId);
    }
    if (classGroup) {
      sql += ` AND LOWER(class_group) = LOWER(?)`;
      params.push(classGroup);
    }
    if (category && category !== "all") {
      sql += ` AND category = ?`;
      params.push(category);
    }

    sql += ` ORDER BY created_at DESC LIMIT 300`;

    const logs = await db.all(sql, params);
    return NextResponse.json({ success: true, logs: logs || [] });
  } catch (error: any) {
    console.error("GET /api/mentor/student-logs error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

// POST /api/mentor/student-logs
export async function POST(request: Request) {
  try {
    const { auth, errorResponse } = await requireAuth(request, { checkCsrf: false, allowedRoles: ["mentor", "cm", "kam", "admin"] });
    if (errorResponse) return errorResponse;

    await ensureMigration("student_concerns_log_table");
    const db = await getDb();

    const body = await request.json();
    const {
      college_id,
      mentor_id,
      mentor_name,
      student_id,
      student_name,
      student_reg_no,
      department,
      class_group,
      subject,
      category,
      title,
      details,
      metrics
    } = body;

    if (!student_id || !title || !category) {
      return NextResponse.json(
        { success: false, message: "student_id, category, and title are required" },
        { status: 400 }
      );
    }

    const resolvedMentorId = mentor_id || auth?.user?.id || auth?.user?.reference_id || "mentor";
    const resolvedMentorName = mentor_name || auth?.user?.name || "Course Mentor";
    const id = generateId("scl");
    const metricsJson = metrics ? JSON.stringify(metrics) : null;

    // 1. Insert into student_concerns_log
    await db.run(
      `INSERT INTO student_concerns_log (
        id, college_id, mentor_id, mentor_name, student_id, student_name,
        student_reg_no, department, class_group, subject, category, title,
        details, metrics_json, status, created_at, updated_at
      ) VALUES (
        ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?,
        ?, ?, 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      )`,
      [
        id,
        college_id || auth?.user?.college_id || "",
        resolvedMentorId,
        resolvedMentorName,
        student_id,
        student_name || "Student",
        student_reg_no || "",
        department || "",
        class_group || "",
        subject || "",
        category,
        title,
        details || "",
        metricsJson
      ]
    );

    // 2. Backward compatibility: if category is 'achievement', optionally record in student_achievements
    if (category === "achievement" && college_id) {
      try {
        await ensureMigration("student_achievements_table");
        const achId = generateId("ach");
        const dateStr = getInstitutionDateStr(new Date());
        await db.run(
          `INSERT INTO student_achievements (
            id, college_id, title, description, achievement_type, date_str, student_ids, proof_url, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
          [
            achId,
            college_id,
            title,
            details || "",
            metrics?.achievementType || "Academic/Coding",
            metrics?.achievementDate || dateStr,
            JSON.stringify([student_id]),
            metrics?.certUrl || metrics?.proofUrl || ""
          ]
        );
      } catch (err: any) {
        console.warn("Auto-sync to student_achievements note:", err?.message);
      }
    }

    return NextResponse.json({
      success: true,
      message: "Student log recorded successfully",
      id
    });
  } catch (error: any) {
    console.error("POST /api/mentor/student-logs error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

// DELETE /api/mentor/student-logs?id=...
export async function DELETE(request: Request) {
  try {
    const { errorResponse } = await requireAuth(request, { checkCsrf: false, allowedRoles: ["mentor", "cm", "kam", "admin"] });
    if (errorResponse) return errorResponse;

    const db = await getDb();
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ success: false, message: "id is required" }, { status: 400 });
    }

    await db.run("DELETE FROM student_concerns_log WHERE id = ?", [id]);
    return NextResponse.json({ success: true, message: "Log removed successfully" });
  } catch (error: any) {
    console.error("DELETE /api/mentor/student-logs error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export const maxDuration = 60;
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/authGuard";
import { getDb } from "@/lib/db";
import { ensureMigration } from "@/lib/migrations";
import { generateId } from "@/lib/id";
import { notifyRealtimeEvent } from "@/lib/realtimeServer";
import {
  MAX_TEXT_LENGTH,
  bandOfScore,
  clampScore,
  coverageOf,
  isMonthKey,
  monthsPresent,
  monthKeyOf,
  summarize,
  trendByMonth,
  verbatimsOf,
  type StudentNpsRow
} from "@/lib/studentNps";

// ── Student NPS — monthly class-feedback survey ─────────────────────────────
// POST { score, likes?, improve? }  → the caller's own answer for the current month
// GET  ?college_id=…&month=YYYY-MM|all → summary / trend / coverage / verbatims

const noCacheHeaders = {
  "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0",
  Pragma: "no-cache",
  Expires: "0"
};

/** Answers kept in one read; a campus answers far fewer than this per month. */
const MAX_ROWS = 5000;

function cleanText(value: unknown): string | null {
  const text = String(value ?? "").trim();
  if (!text) return null;
  return text.slice(0, MAX_TEXT_LENGTH);
}

export async function POST(request: Request) {
  const { auth, errorResponse } = await requireAuth(request, {
    allowedRoles: ["student"],
    checkCsrf: true
  });
  if (errorResponse || !auth) {
    return errorResponse ?? NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
  }

  try {
    await ensureMigration("student_nps_responses_table");
    await ensureMigration("student_nps_mentor_score_column");
    const body = await request.json().catch(() => null);
    const score = clampScore(body?.score);
    const mentorScore = clampScore(body?.mentor_score);
    const mentorName = cleanText(body?.mentor_name);
    if (score === null) {
      return NextResponse.json(
        { success: false, message: "score must be a whole number from 1 to 5." },
        { status: 400, headers: noCacheHeaders }
      );
    }

    const db = await getDb();
    // Scope comes from the signed-in profile, never the body, so a student cannot
    // file their answer against another campus or another student.
    const student = await db.get(
      "SELECT id, name, register_number, college_id, department, classGroup FROM students WHERE id = ? OR id = ? LIMIT 1",
      [auth.user.reference_id || "", auth.user.id]
    );
    if (!student) {
      return NextResponse.json(
        { success: false, message: "Your student profile is not linked to a campus yet." },
        { status: 409, headers: noCacheHeaders }
      );
    }

    const collegeName = student.college_id
      ? (await db.get("SELECT name FROM colleges WHERE id = ?", [student.college_id]))?.name || null
      : null;

    const monthKey = monthKeyOf();
    const likes = cleanText(body?.likes);
    const improve = cleanText(body?.improve);

    await db.run(
      `INSERT INTO student_nps_responses
         (id, month_key, student_id, student_name, college_id, college_name, department, class_group, score, likes, improve, mentor_score, mentor_name, submitted_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       ON CONFLICT (month_key, student_id) DO UPDATE SET
         score = EXCLUDED.score,
         likes = EXCLUDED.likes,
         improve = EXCLUDED.improve,
         mentor_score = EXCLUDED.mentor_score,
         mentor_name = EXCLUDED.mentor_name,
         student_name = EXCLUDED.student_name,
         college_id = EXCLUDED.college_id,
         college_name = EXCLUDED.college_name,
         department = EXCLUDED.department,
         class_group = EXCLUDED.class_group,
         updated_at = CURRENT_TIMESTAMP`,
      [
        generateId("snps"),
        monthKey,
        student.id,
        student.name || auth.user.name || null,
        student.college_id || null,
        collegeName,
        student.department || null,
        student.classGroup || null,
        score,
        likes,
        improve,
        mentorScore,
        mentorName
      ]
    );

    notifyRealtimeEvent({
      domain: "feedback",
      action: "student_nps_submitted",
      collegeId: student.college_id || undefined,
      targetRoles: ["cm", "kam", "admin"],
      payload: { monthKey, studentId: student.id, score, mentorScore }
    });

    return NextResponse.json({
      success: true,
      month_key: monthKey,
      score,
      mentor_score: mentorScore,
      band: bandOfScore(score),
      message: "Thanks — your feedback for this month is saved."
    }, { headers: noCacheHeaders });
  } catch (err: any) {
    console.error("[student-nps POST]", err);
    return NextResponse.json(
      { success: false, message: err?.message || "Could not save your feedback." },
      { status: 500, headers: noCacheHeaders }
    );
  }
}

export async function GET(request: Request) {
  const { auth, errorResponse } = await requireAuth(request, {
    allowedRoles: ["admin", "cm", "kam", "mentor", "student"]
  });
  if (errorResponse || !auth) {
    return errorResponse ?? NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
  }

  try {
    await ensureMigration("student_nps_responses_table");
    const db = await getDb();

    // A student may read exactly one answer: their own for this month. That is what the
    // portal collector needs to show "already rated" without exposing anyone else's.
    if (auth.user.role === "student") {
      const mine = await db.get(
        `SELECT month_key, score, likes, improve, mentor_score, mentor_name, submitted_at, updated_at
         FROM student_nps_responses
         WHERE student_id IN (?, ?) AND month_key = ?
         LIMIT 1`,
        [auth.user.reference_id || "", auth.user.id, monthKeyOf()]
      );
      return NextResponse.json({
        success: true,
        month_key: monthKeyOf(),
        mine: mine
          ? {
              month_key: mine.month_key,
              score: clampScore(mine.score),
              mentor_score: clampScore(mine.mentor_score),
              mentor_name: mine.mentor_name || null,
              likes: mine.likes || null,
              improve: mine.improve || null,
              submitted_at: mine.submitted_at || null
            }
          : null
      }, { headers: noCacheHeaders });
    }

    const { searchParams } = new URL(request.url);
    let collegeId = (searchParams.get("college_id") || "").trim();
    const collegeName = (searchParams.get("college") || "").trim();
    const month = (searchParams.get("month") || "all").trim();

    // CMs and mentors read their own campus only; the scope they were given at login
    // overrides anything typed into the query string.
    if (auth.user.role === "cm" || auth.user.role === "mentor") collegeId = auth.user.college_id || "";

    const where: string[] = [];
    const params: any[] = [];
    if (collegeId) {
      where.push("college_id = ?");
      params.push(collegeId);
    } else if (collegeName) {
      where.push("LOWER(TRIM(college_name)) LIKE LOWER(TRIM(?))");
      params.push(`%${collegeName}%`);
    }
    if (month !== "all") {
      if (!isMonthKey(month)) {
        return NextResponse.json(
          { success: false, message: "month must be YYYY-MM (or 'all')." },
          { status: 400, headers: noCacheHeaders }
        );
      }
      where.push("month_key = ?");
      params.push(month);
    }

    const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";
    const rows: StudentNpsRow[] = await db.all(
      `SELECT month_key, score, mentor_score, mentor_name, student_id, student_name, college_name, department, class_group, likes, improve, submitted_at
       FROM student_nps_responses ${clause}
       ORDER BY month_key DESC, submitted_at DESC
       LIMIT ${MAX_ROWS}`,
      params
    );

    // "all" keeps every month so the trend line has something to plot; a single-month
    // request reports the numbers for that month only.
    const scored = rows.map(r => r.score);
    const summary = summarize(scored);

    const byCollege = collegeId || collegeName;
    let enrolled = 0;
    if (byCollege) {
      const roster = collegeId
        ? await db.get("SELECT COUNT(*) AS n FROM students WHERE college_id = ?", [collegeId])
        : await db.get(
            "SELECT COUNT(*) AS n FROM students WHERE college_id IN (SELECT id FROM colleges WHERE LOWER(TRIM(name)) LIKE LOWER(TRIM(?)))",
            [`%${collegeName}%`]
          );
      enrolled = Number(roster?.n ?? 0);
    }
    const uniqueRespondents = new Set(rows.map(r => String(r.student_id || "")).filter(Boolean)).size;

    const resolvedName = collegeId
      ? (await db.get("SELECT name FROM colleges WHERE id = ?", [collegeId]))?.name || collegeName
      : collegeName;

    return NextResponse.json({
      success: true,
      scope: {
        college_id: collegeId || null,
        college: resolvedName || null,
        // Without a campus filter the roster is unknown, so coverage stays null rather
        // than reporting a percentage of an uncounted population.
        scoped: !!byCollege
      },
      summary,
      trend: trendByMonth(rows),
      months: monthsPresent(rows),
      coverage: coverageOf(uniqueRespondents, enrolled),
      verbatims: verbatimsOf(rows, 20),
      responses: rows.slice(0, 200).map(r => ({
        month_key: r.month_key,
        score: clampScore(r.score),
        mentor_score: clampScore(r.mentor_score),
        mentor_name: r.mentor_name || null,
        student_name: r.student_name || "Anonymous",
        department: r.department || null,
        class_group: r.class_group || null,
        likes: r.likes || null,
        improve: r.improve || null,
        submitted_at: r.submitted_at || null
      })),
      truncated: rows.length >= MAX_ROWS
    }, { headers: noCacheHeaders });
  } catch (err: any) {
    console.error("[student-nps GET]", err);
    return NextResponse.json(
      { success: false, message: err?.message || "Student NPS fetch failed." },
      { status: 500, headers: noCacheHeaders }
    );
  }
}

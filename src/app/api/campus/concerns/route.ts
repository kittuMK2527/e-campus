export const maxDuration = 30;
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireAuth } from "@/lib/authGuard";
import { ensureMigration } from "@/lib/migrations";

// GET /api/campus/concerns?collegeId=...&kamId=...
export async function GET(request: Request) {
  try {
    const { errorResponse } = await requireAuth(request);
    if (errorResponse) return errorResponse;

    await ensureMigration("student_concerns_log_table");
    await ensureMigration("mentor_concerns_log_table");
    const db = await getDb();

    const { searchParams } = new URL(request.url);
    const collegeId = (searchParams.get("collegeId") || "").trim();
    const kamId = (searchParams.get("kamId") || "").trim();

    // 1. Resolve College IDs
    let targetCollegeIds: string[] = [];
    if (collegeId && collegeId !== "all") {
      targetCollegeIds = [collegeId];
    } else if (kamId) {
      const colleges = await db.all("SELECT id FROM colleges WHERE kam_id = ?", [kamId]);
      targetCollegeIds = colleges.map((c: any) => c.id);
    } else {
      const colleges = await db.all("SELECT id FROM colleges LIMIT 50");
      targetCollegeIds = colleges.map((c: any) => c.id);
    }

    if (targetCollegeIds.length === 0) {
      return NextResponse.json({
        success: true,
        data: { studentConcerns: [], mentorConcerns: [], clusterRollup: {} }
      });
    }

    const placeholders = targetCollegeIds.map(() => "?").join(",");

    // 2. Fetch Recent Student Concerns Log Entries
    let studentLogs: any[] = [];
    try {
      studentLogs = await db.all(
        `SELECT id, college_id, mentor_id, mentor_name, student_id, student_name,
                student_reg_no, department, class_group, subject, category, title,
                details, metrics_json, status, created_at
         FROM student_concerns_log
         WHERE college_id IN (${placeholders})
         ORDER BY created_at DESC LIMIT 200`,
        targetCollegeIds
      );
    } catch (e: any) {
      console.warn("Concerns log read fallback:", e?.message);
    }

    // 3. Fetch Students & Fee Overdue Records
    let studentsSummary: any[] = [];
    try {
      studentsSummary = await db.all(
        `SELECT s.id, s.name, s.email, s.register_number, s.roll_number,
                s.classgroup as "classGroup", s.department, s.college_id,
                s.hire_score, s.efset_score, s.github_id, s.project_drive_link,
                s.hackerrank_link, s.leetcode_link,
                COALESCE(f.amount, 0) as fee_total,
                COALESCE(f.paid_amount, 0) as fee_paid,
                COALESCE(f.fpc_pending, (COALESCE(f.amount, 0) - COALESCE(f.paid_amount, 0))) as fee_pending,
                COALESCE(f.status, 'unpaid') as fee_status
         FROM students s
         LEFT JOIN student_fees f ON f.student_id = s.id
         WHERE s.college_id IN (${placeholders})
         ORDER BY s.name ASC`,
        targetCollegeIds
      );
    } catch (e: any) {
      console.warn("Students summary read fallback:", e?.message);
    }

    // 4. Fetch Students with Attendance < 75%
    let lowAttMap = new Map<string, number>();
    try {
      const lowAttRows = await db.all(
        `SELECT sa.studentid,
                ROUND(COUNT(CASE WHEN LOWER(sa.status) = 'present' OR LOWER(sa.status) = 'od' THEN 1 END) * 100.0 / NULLIF(COUNT(*), 0)) as att_pct
         FROM student_attendance sa
         JOIN students s ON sa.studentid = s.id
         WHERE s.college_id IN (${placeholders})
         GROUP BY sa.studentid`,
        targetCollegeIds
      );
      for (const r of lowAttRows) {
        lowAttMap.set(r.studentid, Number(r.att_pct));
      }
    } catch (e: any) {
      console.warn("Attendance rate read fallback:", e?.message);
    }

    // 5. Fetch Mentor Information & E-Audit Quality
    let mentorsSummary: any[] = [];
    try {
      mentorsSummary = await db.all(
        `SELECT m.id, m.name, m.email, m.department, m.college_id, m.status,
                COALESCE(c.name, '') as college_name
         FROM mentors m
         LEFT JOIN colleges c ON m.college_id = c.id
         WHERE m.college_id IN (${placeholders})
         ORDER BY m.name ASC`,
        targetCollegeIds
      );
    } catch (e: any) {
      console.warn("Mentors read fallback:", e?.message);
    }

    // 6. Fetch Latest Audits for Mentors
    let auditsMap = new Map<string, any>();
    try {
      const audits = await db.all(
        `SELECT id, mentor_id, mentor_name, college_id, audit_date,
                skill_score, coursework_score, attendance_score, overall_status, peer_status
         FROM campus_audits
         WHERE college_id IN (${placeholders})
         ORDER BY audit_date DESC, id DESC`,
        targetCollegeIds
      );
      for (const a of audits) {
        if (a.mentor_id && !auditsMap.has(a.mentor_id)) {
          auditsMap.set(a.mentor_id, a);
        }
      }
    } catch (e: any) {
      console.warn("Audits map read fallback:", e?.message);
    }

    // 7. Fetch Mentor Punch-In Telemetry
    let punchesMap = new Map<string, any>();
    try {
      const punches = await db.all(
        `SELECT mentor_id, status, punch_in_time, date_str
         FROM mentor_attendance
         WHERE college_id IN (${placeholders})
         ORDER BY date_str DESC, id DESC`,
        targetCollegeIds
      );
      for (const p of punches) {
        if (p.mentor_id && !punchesMap.has(p.mentor_id)) {
          punchesMap.set(p.mentor_id, p);
        }
      }
    } catch (e: any) {
      console.warn("Punches read fallback:", e?.message);
    }

    // 8. Fetch Campus Issues related to faculty/students
    let tickets: any[] = [];
    try {
      tickets = await db.all(
        `SELECT id, collegeid as college_id, type as category, priority, status, title, desc_text as description, created_at
         FROM campus_issues
         WHERE collegeid IN (${placeholders})
         ORDER BY created_at DESC LIMIT 100`,
        targetCollegeIds
      );
    } catch (e: any) {
      console.warn("Campus issues read fallback:", e?.message);
    }

    // Also fetch direct student_achievements to merge into dossiers
    let directAchievements: any[] = [];
    try {
      directAchievements = await db.all(
        `SELECT id, college_id, title, description, achievement_type, date_str, student_ids, proof_url, created_at
         FROM student_achievements
         WHERE college_id IN (${placeholders})
         ORDER BY created_at DESC LIMIT 100`,
        targetCollegeIds
      );
    } catch (e: any) {
      console.warn("Direct achievements read fallback:", e?.message);
    }

    // Fetch CM-logged Mentor Concerns
    let mentorConcernsLogs: any[] = [];
    try {
      mentorConcernsLogs = await db.all(
        `SELECT id, college_id, mentor_id, mentor_name, logged_by_id, logged_by_name,
                logged_by_role, category, severity, title, details, action_required,
                resolution_notes, status, target_date, resolved_at, created_at, updated_at
         FROM mentor_concerns_log
         WHERE college_id IN (${placeholders})
         ORDER BY created_at DESC LIMIT 200`,
        targetCollegeIds
      );
    } catch (e: any) {
      console.warn("Mentor concerns logs read fallback:", e?.message);
    }

    // Fetch Academic Exam & CIA Marks entered by faculty mentors
    let studentExamMarksList: any[] = [];
    try {
      studentExamMarksList = await db.all(
        `SELECT sem.student_id, sem.marks_obtained, sem.max_marks, sem.grade,
                sem.remarks, sem.is_absent, sem.evaluated_by, sem.updated_at,
                es.exam_type, es.subject_name, es.subject_code, es.semester, es.exam_date
         FROM student_exam_marks sem
         JOIN exam_schedules es ON sem.exam_id = es.id
         WHERE es.college_id IN (${placeholders})
         ORDER BY es.exam_date DESC, sem.updated_at DESC LIMIT 500`,
        targetCollegeIds
      );
    } catch (e: any) {
      console.warn("Student exam marks read fallback:", e?.message);
    }

    // 9. Synthesize Student Concerns Dossiers
    const studentConcerns = studentsSummary.map((s: any) => {
      const sLogs = studentLogs.filter((l: any) => l.student_id === s.id);
      // Merge any direct achievements where student is included in student_ids JSON array
      const sDirectAchs = directAchievements.filter((a: any) => {
        try {
          const ids = JSON.parse(a.student_ids || "[]");
          return Array.isArray(ids) && ids.includes(s.id);
        } catch {
          return false;
        }
      }).map((a: any) => ({
        id: a.id,
        college_id: a.college_id,
        mentor_name: "Faculty Assigned",
        student_id: s.id,
        student_name: s.name,
        category: "achievement",
        title: a.title,
        details: a.description || "",
        created_at: a.created_at,
        metrics_json: JSON.stringify({ achievementType: a.achievement_type, proofUrl: a.proof_url, achievementDate: a.date_str })
      }));

      const allCombinedLogs = [...sLogs, ...sDirectAchs];
      const sExamMarks = studentExamMarksList.filter((m: any) => m.student_id === s.id);
      const attPct = lowAttMap.has(s.id) ? lowAttMap.get(s.id)! : 92;
      const isFeeDefaulter = Number(s.fee_pending) > 0;
      const isLowAtt = attPct < 75;
      const hasComplaints = allCombinedLogs.some((l: any) => l.category === "complaint");

      return {
        ...s,
        attendance_pct: attPct,
        is_low_attendance: isLowAtt,
        is_fee_defaulter: isFeeDefaulter,
        has_complaints: hasComplaints,
        logs: allCombinedLogs,
        exam_marks: sExamMarks,
        exam_marks_count: sExamMarks.length,
        achievements_count: allCombinedLogs.filter((l: any) => l.category === "achievement").length,
        complaints_count: allCombinedLogs.filter((l: any) => l.category === "complaint").length,
        marks_logs_count: allCombinedLogs.filter((l: any) => l.category === "marks").length,
      };
    });

    // 10. Synthesize Mentor Concerns Dossiers
    const mentorConcerns = mentorsSummary.map((m: any) => {
      const audit = auditsMap.get(m.id) || null;
      const punch = punchesMap.get(m.id) || null;
      const mTickets = tickets.filter(
        (t: any) =>
          String(t.assigned_to_name || "").toLowerCase() === m.name.toLowerCase() ||
          String(t.description || "").toLowerCase().includes(m.name.toLowerCase())
      );
      const cmConcerns = mentorConcernsLogs.filter((l: any) => l.mentor_id === m.id);
      const openCmConcerns = cmConcerns.filter((l: any) => l.status !== "resolved");

      const skillScore = audit ? Number(audit.skill_score || 0) : 85;
      const cwScore = audit ? Number(audit.coursework_score || 0) : 85;
      const attScore = audit ? Number(audit.attendance_score || 0) : 90;
      const composite = Math.round(skillScore * 0.35 + cwScore * 0.35 + attScore * 0.3);

      return {
        id: m.id,
        name: m.name,
        email: m.email,
        department: m.department || "General",
        college_id: m.college_id,
        college_name: m.college_name,
        composite_score: composite,
        skill_score: skillScore,
        coursework_score: cwScore,
        attendance_score: attScore,
        audit_status: audit?.overall_status || "Good",
        is_low_audit: composite < 70,
        tickets_count: mTickets.length,
        tickets: mTickets,
        cm_concerns: cmConcerns,
        cm_concerns_count: cmConcerns.length,
        cm_open_concerns_count: openCmConcerns.length,
        last_punch: punch
          ? {
              status: punch.status,
              time: punch.punch_in_time,
              date: punch.date_str,
              isLate: punch.punch_in_time ? punch.punch_in_time > "09:30" : false
            }
          : null
      };
    });

    // 11. Cluster Roll-Up Summary (for KAM view)
    const clusterRollup = {
      totalCampuses: targetCollegeIds.length,
      totalStudents: studentsSummary.length,
      totalMentors: mentorsSummary.length,
      totalConcernsLogged: studentLogs.length,
      totalMentorConcernsLogged: mentorConcernsLogs.length,
      openComplaintsCount: studentLogs.filter((l: any) => l.category === "complaint").length,
      openMentorConcernsCount: mentorConcernsLogs.filter((l: any) => l.status !== "resolved").length,
      lowAttendanceStudentsCount: studentConcerns.filter((s: any) => s.is_low_attendance).length,
      feeDefaultersCount: studentConcerns.filter((s: any) => s.is_fee_defaulter).length,
      lowAuditMentorsCount: mentorConcerns.filter((m: any) => m.is_low_audit).length
    };

    return NextResponse.json({
      success: true,
      data: {
        studentConcerns,
        mentorConcerns,
        clusterRollup,
        recentLogs: studentLogs.slice(0, 30),
        recentMentorConcerns: mentorConcernsLogs.slice(0, 30)
      }
    });
  } catch (error: any) {
    console.error("GET /api/campus/concerns error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

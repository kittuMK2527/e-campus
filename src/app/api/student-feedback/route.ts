export const maxDuration = 60;

import { NextResponse } from "next/server";
import { getDb, type QueryFailure } from "@/lib/db";
import { ensureMigration } from "@/lib/migrations";
import { generateId } from "@/lib/id";
import { requireAuth } from "@/lib/authGuard";

export async function POST(request: Request) {
  try {
    await ensureMigration("student_mentor_feedback_table");
    const db = await getDb();

    let rawData: any = null;
    const contentType = request.headers.get("content-type") || "";

    if (contentType.includes("application/json")) {
      rawData = await request.json();
    } else if (contentType.includes("application/x-www-form-urlencoded") || contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      const payloadStr = formData.get("payload");
      if (typeof payloadStr === "string") {
        try {
          rawData = JSON.parse(payloadStr);
        } catch {
          rawData = Object.fromEntries(formData.entries());
        }
      } else {
        rawData = Object.fromEntries(formData.entries());
      }
    } else {
      try {
        rawData = await request.json();
      } catch {
        const text = await request.text();
        rawData = JSON.parse(text);
      }
    }

    if (!rawData) {
      return NextResponse.json({ success: false, message: "Invalid payload." }, { status: 400 });
    }

    const regNo = String(rawData.registerNumber || rawData.regNumber || rawData.register_number || "").trim().toUpperCase();
    if (!regNo) {
      return NextResponse.json({ success: false, message: "Register number is required." }, { status: 400 });
    }

    // The deduplication probe and the E-Campus student lookup both key off the register
    // number, so they travel as one round trip. Dedup feeds a write, so a failed slice
    // aborts rather than letting a second submission through.
    const submitFailures: QueryFailure[] = [];
    const [existingRows, studentRecordRows] = await db.multiQuery(
      [
        {
          sql: "SELECT id, register_number, submitted_at FROM student_mentor_feedback WHERE LOWER(TRIM(register_number)) = LOWER(TRIM(?)) LIMIT 1",
          params: [regNo],
        },
        {
          sql: "SELECT id, college_id, classGroup, department FROM students WHERE LOWER(TRIM(id)) = LOWER(TRIM(?)) OR LOWER(TRIM(register_number)) = LOWER(TRIM(?)) OR LOWER(TRIM(roll_number)) = LOWER(TRIM(?)) LIMIT 1",
          params: [regNo, regNo, regNo],
        },
      ],
      submitFailures
    );
    if (submitFailures.length > 0) {
      return NextResponse.json({ success: false, message: "Could not verify this submission. Please try again." }, { status: 500 });
    }

    const existing = existingRows[0] || null;
    if (existing) {
      return NextResponse.json({
        success: false,
        duplicate: true,
        message: `Student with register number ${regNo} has already submitted feedback on ${existing.submitted_at || "earlier"}.`,
        id: existing.id
      }, { status: 409 });
    }

    const studentName = String(rawData.studentName || rawData.name || "").trim();
    const email = String(rawData.studentEmail || rawData.email || "").trim();
    const collegeName = String(rawData.collegeName || rawData.college || "").trim();
    const department = String(rawData.department || "").trim();

    // Look up matching student in E-Campus database to retrieve college_id & classGroup
    let matchedCollegeId: string | null = null;
    let matchedClassGroup: string | null = null;
    const studentDbRecord = studentRecordRows[0] || null;
    if (studentDbRecord) {
      matchedCollegeId = studentDbRecord.college_id || null;
      matchedClassGroup = studentDbRecord.classGroup || null;
    }

    // Extract mentor ratings from keys like subject1_Name, subject1_Rating, etc.
    const mentorRatings: any[] = [];
    for (let i = 1; i <= 25; i++) {
      const subName = rawData[`subject${i}_Name`];
      const mentorName = rawData[`subject${i}_Mentor`];
      const rating = rawData[`subject${i}_Rating`];
      if (subName || mentorName || rating) {
        const questions: Record<string, string> = {};
        for (let q = 1; q <= 10; q++) {
          const ans = rawData[`subject${i}_Q${q}`];
          if (ans !== undefined) questions[`Q${q}`] = ans;
        }
        mentorRatings.push({
          index: i,
          subject: subName || "",
          mentor: mentorName || "",
          rating: rating ? Number(rating) : null,
          questions
        });
      }
    }

    const feedbackId = generateId("MFB");
    const submittedAt = rawData.timestamp || new Date().toISOString();
    const nowIso = new Date().toISOString();

    await db.run(
      `INSERT INTO student_mentor_feedback (
        id,
        register_number,
        student_name,
        email,
        college_id,
        college_name,
        department,
        class_group,
        ape_q1_assessments,
        ape_q2_study_materials,
        ape_q2_missing_papers,
        ape_q3_hands_on_rating,
        ape_q4_confidence_rating,
        challenges_selected,
        challenges_detail,
        challenges_suggestions,
        nps_score,
        nps_fu1_campus_satisfied,
        nps_fu2_classroom_satisfied,
        nps_fu3_skill_dev,
        nps_fu4_placement,
        nps_likes,
        nps_improve,
        mentor_ratings,
        full_payload,
        submitted_at,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        feedbackId,
        regNo,
        studentName || null,
        email || null,
        matchedCollegeId,
        collegeName || null,
        department || null,
        matchedClassGroup,
        rawData.ape_q1_assessments || rawData.ape_q1 || null,
        rawData.ape_q2_studyMaterials || rawData.ape_q2 || null,
        rawData.ape_q2_missingPapers || rawData.ape_q2_detail || null,
        rawData.ape_q3_handsOnRating ? Number(rawData.ape_q3_handsOnRating) : (rawData.ape_q3_rating ? Number(rawData.ape_q3_rating) : null),
        rawData.ape_q4_confidenceRating ? Number(rawData.ape_q4_confidenceRating) : (rawData.ape_q4_rating ? Number(rawData.ape_q4_rating) : null),
        rawData.challenges_selected || null,
        rawData.challenges_detail || rawData.challengeDetail || null,
        rawData.challenges_suggestions || rawData.challengeSuggestions || null,
        rawData.nps_score !== undefined && rawData.nps_score !== "" ? Number(rawData.nps_score) : null,
        rawData.nps_fu1_campusSatisfied || rawData.nps_fu1 || null,
        rawData.nps_fu2_classroomSatisfied || rawData.nps_fu2 || null,
        rawData.nps_fu3_skillDev || rawData.nps_fu3 || null,
        rawData.nps_fu4_placement || rawData.nps_fu4 || null,
        rawData.nps_likes || rawData.npsLike || null,
        rawData.nps_improve || rawData.npsImprove || null,
        JSON.stringify(mentorRatings),
        JSON.stringify(rawData),
        submittedAt,
        nowIso
      ]
    );

    return NextResponse.json({
      success: true,
      id: feedbackId,
      message: "Feedback successfully saved to E-Campus database."
    });
  } catch (error: any) {
    console.error("[api/student-feedback POST error]", error);
    return NextResponse.json({ success: false, message: error.message || "Failed to save feedback." }, { status: 500 });
  }
}

export async function GET(request: Request) {
  try {
    await ensureMigration("student_mentor_feedback_table");
    const db = await getDb();
    const { searchParams } = new URL(request.url);

    const collegeId = searchParams.get("college_id") || searchParams.get("collegeId") || "";
    const collegeName = searchParams.get("college_name") || searchParams.get("college") || "";
    const department = searchParams.get("department") || "";
    const classGroup = searchParams.get("class_group") || searchParams.get("classGroup") || "";
    const regNo = searchParams.get("register_number") || searchParams.get("regNo") || "";

    // If specific student check
    if (regNo) {
      const { auth } = await requireAuth(request).catch(() => ({ auth: null }));
      if (auth && auth.user.role === "student") {
        const studentReg = (auth.user as any).register_number || (auth.user as any).registerNumber || auth.user.reference_id || "";
        if (studentReg && studentReg.toLowerCase() !== regNo.trim().toLowerCase()) {
          return NextResponse.json({ success: false, message: "Forbidden" }, { status: 403 });
        }
      }
      const feedback = await db.get(
        "SELECT * FROM student_mentor_feedback WHERE LOWER(TRIM(register_number)) = LOWER(TRIM(?)) LIMIT 1",
        [regNo.trim()]
      );
      return NextResponse.json({
        success: true,
        hasSubmitted: !!feedback,
        submission: feedback || null
      });
    }

    const { errorResponse } = await requireAuth(request, {
      allowedRoles: ["admin", "cm", "kam", "hr", "mentor"]
    });
    if (errorResponse) return errorResponse;

    // Build query for feedback submissions
    let feedbackQuery = "SELECT * FROM student_mentor_feedback WHERE 1=1";
    const feedbackParams: any[] = [];

    if (collegeId) {
      feedbackQuery += " AND (college_id = ? OR college_name IN (SELECT name FROM colleges WHERE id = ?))";
      feedbackParams.push(collegeId, collegeId);
    } else if (collegeName) {
      feedbackQuery += " AND LOWER(TRIM(college_name)) LIKE LOWER(TRIM(?))";
      feedbackParams.push(`%${collegeName}%`);
    }

    if (department) {
      feedbackQuery += " AND LOWER(TRIM(department)) LIKE LOWER(TRIM(?))";
      feedbackParams.push(`%${department}%`);
    }

    if (classGroup) {
      feedbackQuery += " AND LOWER(TRIM(class_group)) LIKE LOWER(TRIM(?))";
      feedbackParams.push(`%${classGroup}%`);
    }

    feedbackQuery += " ORDER BY submitted_at DESC LIMIT 500";

    // Track against enrolled students in students table to determine filled vs pending
    let studentsQuery = "SELECT id, name, email, register_number, roll_number, college_id, department, classGroup, shift, semester FROM students WHERE 1=1";
    const studentsParams: any[] = [];

    if (collegeId) {
      studentsQuery += " AND college_id = ?";
      studentsParams.push(collegeId);
    } else if (collegeName) {
      studentsQuery += " AND college_id IN (SELECT id FROM colleges WHERE LOWER(TRIM(name)) LIKE LOWER(TRIM(?)))";
      studentsParams.push(`%${collegeName}%`);
    }

    if (department) {
      studentsQuery += " AND LOWER(TRIM(department)) LIKE LOWER(TRIM(?))";
      studentsParams.push(`%${department}%`);
    }

    if (classGroup) {
      studentsQuery += " AND LOWER(TRIM(classGroup)) LIKE LOWER(TRIM(?))";
      studentsParams.push(`%${classGroup}%`);
    }

    // Submissions and the enrolled roster are independent, so they share one round
    // trip. Either read arriving empty would silently flip the filled/pending split,
    // so a failed slice fails the request instead of reporting the list.
    const coverageFailures: QueryFailure[] = [];
    const [submissions, enrolledStudents] = await db.multiQuery(
      [
        { sql: feedbackQuery, params: feedbackParams },
        { sql: studentsQuery, params: studentsParams },
      ],
      coverageFailures
    );
    if (coverageFailures.length > 0) {
      return NextResponse.json({ success: false, error: "Could not load feedback coverage. Please try again." }, { status: 500 });
    }

    const submittedRegMap = new Map<string, any>();
    submissions.forEach((sub: any) => {
      if (sub.register_number) {
        submittedRegMap.set(sub.register_number.trim().toUpperCase(), sub);
      }
    });

    const filledList: any[] = [];
    const pendingList: any[] = [];

    enrolledStudents.forEach((st: any) => {
      const reg = (st.register_number || st.id || st.roll_number || "").trim().toUpperCase();
      const sub = submittedRegMap.get(reg);
      if (sub) {
        filledList.push({
          student_id: st.id,
          name: st.name,
          email: st.email,
          register_number: st.register_number || st.id,
          department: st.department,
          classGroup: st.classGroup,
          has_submitted: true,
          submitted_at: sub.submitted_at,
          nps_score: sub.nps_score,
          feedback_id: sub.id
        });
      } else {
        pendingList.push({
          student_id: st.id,
          name: st.name,
          email: st.email,
          register_number: st.register_number || st.id,
          department: st.department,
          classGroup: st.classGroup,
          has_submitted: false
        });
      }
    });

    const totalStudents = enrolledStudents.length;
    const totalFilled = filledList.length;
    const totalPending = pendingList.length;
    const completionRate = totalStudents > 0 ? Math.round((totalFilled / totalStudents) * 100) : 0;

    return NextResponse.json({
      success: true,
      stats: {
        totalStudents,
        totalFilled,
        totalPending,
        completionRate: `${completionRate}%`,
        totalSubmissionsReceived: submissions.length
      },
      filledStudents: filledList,
      pendingStudents: pendingList,
      submissions: submissions.map((s: any) => ({
        ...s,
        mentor_ratings: typeof s.mentor_ratings === "string" ? JSON.parse(s.mentor_ratings || "[]") : s.mentor_ratings
      }))
    });
  } catch (error: any) {
    console.error("[api/student-feedback GET error]", error);
    return NextResponse.json({ success: false, message: error.message || "Failed to fetch student feedback tracking." }, { status: 500 });
  }
}

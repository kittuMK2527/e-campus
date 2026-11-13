export const maxDuration = 60;

import { NextResponse } from "next/server";
import { getDb, type QueryFailure } from "@/lib/db";
import { hashPassword } from "@/lib/auth";
import { DEFAULT_PASSWORD } from "@/lib/authConfig";
import { requireAuth } from "@/lib/authGuard";
import { generateId } from "@/lib/id";

export async function PUT(request: Request) {
  try {
    const { auth, errorResponse } = await requireAuth(request, {
      allowedRoles: ["student", "cm", "admin", "mentor"],
      checkCsrf: true
    });
    if (errorResponse) return errorResponse;

    const db = await getDb();
    const body = await request.json();
    const {
      id,
      name,
      email,
      department,
      classGroup,
      section,
      college_id,
      register_number,
      roll_number,
      hire_score,
      efset_score,
      mother_name,
      father_name,
      pan_number,
      tenth_mark,
      eleventh_mark,
      twelfth_mark,
      academic_group,
      medium,
      blood_group,
      dob,
      phone,
      parent_phone,
      aadhar_number,
      linkedin_link,
      github_id,
      project_drive_link,
      hackerrank_link,
      leetcode_link,
      figma_link
    } = body;

    if (!id || !name || !name.trim()) {
      return NextResponse.json({ success: false, message: "Student ID and Name are required." }, { status: 400 });
    }

    // A student self-edit gates on the class-group policy, so fetch the record and the
    // policy together — they used to be two sequential round trips on every profile save.
    const isStudentEdit = auth?.user.role === "student";
    const gateFailures: QueryFailure[] = [];
    const [studentRows, policyRows] = await db.multiQuery(
      isStudentEdit
        ? [
            { sql: "SELECT * FROM students WHERE id = ?", params: [id] },
            { sql: "SELECT value FROM system_settings WHERE key = ?", params: ["profile_edit_allowed_classes"] }
          ]
        : [{ sql: "SELECT * FROM students WHERE id = ?", params: [id] }],
      gateFailures
    );
    if (gateFailures.length > 0) {
      console.error("PUT /api/students profile gate read failed:", gateFailures[0].error);
      throw new Error("Could not load the profile. Please retry.");
    }

    const currentStudent = studentRows?.[0] || null;
    if (!currentStudent) {
      return NextResponse.json({ success: false, message: "Student not found." }, { status: 404 });
    }

    if (isStudentEdit) {
      const isOwnRecord =
        currentStudent.id === auth.user.reference_id ||
        (!!auth.user.email && String(currentStudent.email || "").toLowerCase() === auth.user.email.toLowerCase());
      if (!isOwnRecord) {
        return NextResponse.json({ success: false, message: "You can only edit your own profile." }, { status: 403 });
      }

      let allowedClasses: string[] = [];
      try {
        const parsed = JSON.parse(policyRows?.[0]?.value || "[]");
        allowedClasses = Array.isArray(parsed) ? parsed : [];
      } catch {
        allowedClasses = [];
      }
      if (!allowedClasses.includes(currentStudent.classGroup || "")) {
        return NextResponse.json(
          { success: false, message: "Profile editing is locked for your class group by your Campus Manager." },
          { status: 403 }
        );
      }
    }

    const currentShift = body.shift || currentStudent.shift || (classGroup?.includes("Shift 2") ? "Shift 2" : classGroup?.includes("Shift 1") ? "Shift 1" : "General");
    const currentSem = body.semester || currentStudent.semester || "Semester 1";

    // WF-P22: Security lockdown on student self-edits. Institutional and sensitive
    // identity fields (department, class group, section, college, register number,
    // semester, shift, hire/efset scores, and government IDs Aadhaar/PAN) can ONLY
    // be modified by CAM or Admin, never by the student during self-edit.
    const effectiveDepartment = isStudentEdit ? currentStudent.department : (department ? department.trim() : "");
    const effectiveClassGroup = isStudentEdit ? currentStudent.classGroup : (classGroup ? classGroup.trim() : (currentStudent.classGroup || ""));
    const effectiveSection = isStudentEdit ? currentStudent.section : (section ? section.trim() : null);
    const effectiveCollegeId = isStudentEdit ? currentStudent.college_id : (college_id || currentStudent.college_id || null);
    const effectiveRegisterNumber = isStudentEdit ? currentStudent.register_number : (register_number || null);
    const effectiveSem = isStudentEdit ? currentStudent.semester : currentSem;
    const effectiveShift = isStudentEdit ? currentStudent.shift : currentShift;
    const effectiveHireScore = isStudentEdit ? currentStudent.hire_score : (hire_score ?? null);
    const effectiveEfsetScore = isStudentEdit ? currentStudent.efset_score : (efset_score ?? null);
    const effectivePan = isStudentEdit
      ? (currentStudent.pan_number || null)
      : ((pan_number !== undefined && pan_number !== null && pan_number !== "") ? pan_number : (currentStudent.pan_number || null));
    const effectiveAadhar = isStudentEdit
      ? (currentStudent.aadhar_number || null)
      : ((aadhar_number !== undefined && aadhar_number !== null && aadhar_number !== "") ? aadhar_number : (currentStudent.aadhar_number || null));

    // Update students table
    await db.run(
      `UPDATE students SET 
        name = ?, 
        email = ?, 
        department = ?, 
        classGroup = ?, 
        section = ?,
        college_id = ?, 
        register_number = ?, 
        roll_number = ?, 
        semester = ?,
        shift = ?,
        hire_score = ?,
        efset_score = ?,
        mother_name = ?,
        father_name = ?,
        pan_number = ?,
        tenth_mark = ?, 
        eleventh_mark = ?, 
        twelfth_mark = ?, 
        academic_group = ?, 
        medium = ?, 
        blood_group = ?, 
        dob = ?, 
        phone = ?, 
        parent_phone = ?, 
        aadhar_number = ?, 
        linkedin_link = ?, 
        github_id = ?, 
        project_drive_link = ?, 
        hackerrank_link = ?, 
        leetcode_link = ?, 
        figma_link = ?,
        updated_at = ?
      WHERE id = ?`,
      name.trim(),
      email ? email.trim() : "",
      effectiveDepartment,
      effectiveClassGroup,
      effectiveSection,
      effectiveCollegeId,
      effectiveRegisterNumber,
      roll_number || null,
      effectiveSem,
      effectiveShift,
      effectiveHireScore,
      effectiveEfsetScore,
      mother_name || null,
      father_name || null,
      effectivePan,
      tenth_mark ?? null,
      eleventh_mark ?? null,
      twelfth_mark ?? null,
      academic_group || null,
      medium || null,
      blood_group || null,
      dob || null,
      phone || null,
      parent_phone || null,
      effectiveAadhar,
      linkedin_link || null,
      github_id || null,
      project_drive_link || null,
      hackerrank_link || null,
      leetcode_link || null,
      figma_link || null,
      new Date().toISOString(),
      id
    );

    return NextResponse.json({ success: true, message: "Student updated successfully." });
  } catch (error: any) {
    console.error("API PUT Students error:", error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { errorResponse } = await requireAuth(request, { allowedRoles: ["admin", "cm"] });
    if (errorResponse) return errorResponse;
    const db = await getDb();
    const body = await request.json();

    const students = Array.isArray(body) ? body : [body];
    const nowStr = new Date().toISOString();

    // Normalize all student records first (BUG-22: strictly validate Class Group)
    const invalidRows: { index: number; name: string; reason: string }[] = [];
    students.forEach((s: any, idx: number) => {
      const name = (s.name || "").toString().trim();
      if (!name) return; // ignore completely blank rows
      const cg = (s.classGroup || s.class_group || "").toString().trim();
      if (!cg) {
        invalidRows.push({
          index: idx + 1,
          name: name || `Student #${idx + 1}`,
          reason: "Class Group is required"
        });
      }
    });

    if (invalidRows.length > 0) {
      const preview = invalidRows
        .slice(0, 5)
        .map(r => `Row ${r.index} ("${r.name}")`)
        .join(", ");
      const more = invalidRows.length > 5 ? ` and ${invalidRows.length - 5} more` : "";
      return NextResponse.json(
        {
          success: false,
          message: `Import rejected (BUG-22 Guard): ${invalidRows.length} student row(s) are missing a Class Group (${preview}${more}). Every student must have a valid Class Group to prevent timetable scheduling corruption.`
        },
        { status: 400 }
      );
    }

    const normalizedStudents: any[] = [];
    for (const student of students) {
      const {
        id: rawId, name, email, classGroup, section, department, college_id,
        register_number, roll_number, hire_score, efset_score,
        mother_name, father_name, pan_number, tenth_mark, eleventh_mark, twelfth_mark,
        academic_group, medium, blood_group, dob, phone, parent_phone, aadhar_number,
        linkedin_link, github_id, project_drive_link, hackerrank_link, leetcode_link,
        figma_link, semester, shift
      } = student;

      const stName = (name || "").toString().trim();
      if (!stName) continue;

      const rawClassGroup = (classGroup || student.class_group || "").toString().trim();
      if (!rawClassGroup) continue;

      let stId = (rawId || roll_number || register_number || (email ? email.split("@")[0] : "")).toString().trim();
      if (!stId) stId = generateId("STU");

      const stEmail = email ? email.toString().trim() : null;
      const emailPrefix = stEmail ? stEmail.split("@")[0].toLowerCase() : "";
      let stRoll = roll_number ? String(roll_number).trim() : "";
      if (stRoll.toLowerCase() === emailPrefix) stRoll = "";
      let stReg = register_number ? String(register_number).trim() : "";
      if (stReg.toLowerCase() === emailPrefix) stReg = "";
      if (!stReg && stRoll) stReg = stRoll;
      if (!stRoll && stReg) stRoll = stReg;

      normalizedStudents.push({
        stId, stName, stEmail, stReg, stRoll,
        classGroup: rawClassGroup,
        section: section || null,
        department: department || "General",
        college_id: college_id || null,
        semester: semester || "Semester 1",
        shift: shift || "General",
        hire_score: (hire_score ?? null) !== null ? hire_score.toString() : null,
        efset_score: (efset_score ?? null) !== null ? efset_score.toString() : null,
        mother_name: mother_name ? mother_name.toString() : null,
        father_name: father_name ? father_name.toString() : null,
        pan_number: pan_number ? pan_number.toString() : null,
        tenth_mark: (tenth_mark ?? null) !== null ? tenth_mark.toString() : null,
        eleventh_mark: (eleventh_mark ?? null) !== null ? eleventh_mark.toString() : null,
        twelfth_mark: (twelfth_mark ?? null) !== null ? twelfth_mark.toString() : null,
        academic_group: academic_group ? academic_group.toString() : null,
        medium: medium ? medium.toString() : null,
        blood_group: blood_group ? blood_group.toString() : null,
        dob: dob ? dob.toString() : null,
        phone: phone ? phone.toString() : null,
        parent_phone: parent_phone ? parent_phone.toString() : null,
        aadhar_number: aadhar_number ? aadhar_number.toString() : null,
        linkedin_link: linkedin_link ? linkedin_link.toString() : null,
        github_id: github_id ? github_id.toString() : null,
        project_drive_link: project_drive_link ? project_drive_link.toString() : null,
        hackerrank_link: hackerrank_link ? hackerrank_link.toString() : null,
        leetcode_link: leetcode_link ? leetcode_link.toString() : null,
        figma_link: figma_link ? figma_link.toString() : null,
      });
    }

    if (normalizedStudents.length === 0) {
      return NextResponse.json({ success: true, message: "No valid students to create." });
    }

    // ── Batched write: chunk at 30 students to stay under SQLite param limits ──
    // 30 students × 36 params = 1080 per chunk (safe under 32766 limit)
    const CHUNK = 30;
    const batchStatements: { sql: string; args: any[] }[] = [];
    // Hash the default password once per batch (not per student, for performance)
    const defaultPasswordHash = hashPassword(DEFAULT_PASSWORD);

    for (let i = 0; i < normalizedStudents.length; i += CHUNK) {
      const chunk = normalizedStudents.slice(i, i + CHUNK);

      // Students INSERT — 36 params per row (hashed password)
      const stPlaceholders = chunk.map(() =>
        "(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Active', ?, ?, ?)"
      ).join(", ");
      const stArgs: any[] = [];
      chunk.forEach(s => {
        stArgs.push(
          s.stId, s.stName, s.stEmail, s.classGroup, s.section, s.department, s.college_id,
          s.stReg, s.stRoll, s.semester, s.shift,
          s.hire_score, s.efset_score, s.mother_name, s.father_name, s.pan_number,
          s.tenth_mark, s.eleventh_mark, s.twelfth_mark, s.academic_group,
          s.medium, s.blood_group, s.dob, s.phone, s.parent_phone, s.aadhar_number,
          s.linkedin_link, s.github_id, s.project_drive_link, s.hackerrank_link,
          s.leetcode_link, s.figma_link,
          defaultPasswordHash, nowStr, nowStr
        );
      });
      batchStatements.push({
        sql: `INSERT INTO students (
          id, name, email, classGroup, section, department, college_id,
          register_number, roll_number, semester, shift,
          hire_score, efset_score, mother_name, father_name, pan_number,
          tenth_mark, eleventh_mark, twelfth_mark, academic_group,
          medium, blood_group, dob, phone, parent_phone, aadhar_number,
          linkedin_link, github_id, project_drive_link, hackerrank_link,
          leetcode_link, figma_link,
          status, password_hash, created_at, updated_at
        ) VALUES ${stPlaceholders}
        ON CONFLICT (id) DO UPDATE SET
          name = EXCLUDED.name,
          email = EXCLUDED.email,
          classGroup = EXCLUDED.classGroup,
          section = EXCLUDED.section,
          department = EXCLUDED.department,
          college_id = EXCLUDED.college_id,
          register_number = EXCLUDED.register_number,
          roll_number = EXCLUDED.roll_number,
          semester = EXCLUDED.semester,
          shift = EXCLUDED.shift,
          updated_at = EXCLUDED.updated_at`,
        args: stArgs
      });

      // Users INSERT — 5 params per row (hashed password)
      const uPlaceholders = chunk.map(() => "(?, ?, ?, 'student', ?, 1, ?, ?)").join(", ");
      const uArgs: any[] = [];
      chunk.forEach(s => { uArgs.push(s.stId, s.stEmail, defaultPasswordHash, s.stId, nowStr, nowStr); });
      batchStatements.push({
        sql: `INSERT INTO users (id, email, password_hash, role, reference_id, must_change_password, created_at, updated_at)
              VALUES ${uPlaceholders}
              ON CONFLICT (id) DO UPDATE SET
                email = EXCLUDED.email,
                role = EXCLUDED.role,
                reference_id = EXCLUDED.reference_id,
                updated_at = EXCLUDED.updated_at`,
        args: uArgs
      });
    }

    // Execute all inserts as a single atomic batch
    await db.client.batch(batchStatements);

    return NextResponse.json({ success: true, message: `${normalizedStudents.length} students created successfully.` });
  } catch (error: any) {
    console.error("API POST Students error:", error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { errorResponse } = await requireAuth(request, { allowedRoles: ["admin", "cm"] });
    if (errorResponse) return errorResponse;
    const db = await getDb();
    const { searchParams } = new URL(request.url);
    let ids: string[] = [];

    const singleId = searchParams.get("id");
    if (singleId) {
      ids = [singleId];
    } else {
      try {
        const body = await request.json();
        if (body.ids && Array.isArray(body.ids)) {
          ids = body.ids;
        } else if (body.id) {
          ids = [body.id];
        }
      } catch (e) {
        // No json body
      }
    }

    if (!ids || ids.length === 0) {
      return NextResponse.json({ success: false, message: "No student ID(s) provided for deletion." }, { status: 400 });
    }

    const cleanIds = Array.from(new Set(ids.map(id => String(id).trim()).filter(Boolean)));
    if (cleanIds.length === 0) {
      return NextResponse.json({ success: false, message: "Invalid student ID(s)." }, { status: 400 });
    }
    // The cascade below binds this list twelve times (twice for users, which matches on
    // both id and reference_id), so an unbounded body would hit the parameter ceiling
    // mid-transaction. No caller deletes more than one at a time today.
    if (cleanIds.length > 500) {
      return NextResponse.json(
        { success: false, message: `Delete at most 500 students per request (${cleanIds.length} requested).` },
        { status: 400 }
      );
    }

    const placeholders = cleanIds.map(() => "?").join(",");

    // Atomic batch delete — child tables deleted first to satisfy foreign keys, then users and students
    const statements = [
      {
        sql: `DELETE FROM student_attendance WHERE studentId IN (${placeholders})`,
        args: cleanIds
      },
      {
        sql: `DELETE FROM student_exam_marks WHERE student_id IN (${placeholders})`,
        args: cleanIds
      },
      {
        sql: `DELETE FROM interview_evaluations WHERE student_id IN (${placeholders})`,
        args: cleanIds
      },
      {
        sql: `DELETE FROM fee_payments WHERE student_id IN (${placeholders})`,
        args: cleanIds
      },
      {
        sql: `DELETE FROM student_fees WHERE student_id IN (${placeholders})`,
        args: cleanIds
      },
      {
        sql: `DELETE FROM leave_requests WHERE studentId IN (${placeholders})`,
        args: cleanIds
      },
      {
        sql: `DELETE FROM student_tracker WHERE student_id IN (${placeholders})`,
        args: cleanIds
      },
      {
        sql: `DELETE FROM student_academic_tracker WHERE student_id IN (${placeholders})`,
        args: cleanIds
      },
      {
        sql: `DELETE FROM student_interviews WHERE student_id IN (${placeholders})`,
        args: cleanIds
      },
      {
        sql: `DELETE FROM student_interview_slots WHERE student_id IN (${placeholders})`,
        args: cleanIds
      },
      {
        sql: `DELETE FROM users WHERE role = 'student' AND (id IN (${placeholders}) OR reference_id IN (${placeholders}))`,
        args: [...cleanIds, ...cleanIds]
      },
      {
        sql: `DELETE FROM students WHERE id IN (${placeholders})`,
        args: cleanIds
      }
    ];
    const count = await db.transaction(async tx => {
      let changes = 0;
      for (const stmt of statements) changes = (await tx.run(stmt.sql, ...stmt.args)).changes;
      // The last statement deletes student rows, not their linked records.
      return changes;
    });

    return NextResponse.json({
      success: true,
      message: `${count} student record(s) deleted. ${cleanIds.length - count} already absent.`,
      count
    });
  } catch (error: any) {
    console.error("API DELETE Students error:", error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}


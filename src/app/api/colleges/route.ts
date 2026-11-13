export const maxDuration = 60;

import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireAuth } from "@/lib/authGuard";

export async function GET(request: Request) {
  try {
    const { errorResponse } = await requireAuth(request);
    if (errorResponse) return errorResponse;
    const db = await getDb();

    // Three parameterless reads, so multiQuery folds them into a single statement batch
    // (one round trip instead of three) and any slice failure throws instead of quietly
    // returning an empty campus list.
    const [colleges, campusManagers, kamUsers] = await db.multiQuery([
      {
        // Aggregate counts via GROUP BY instead of 4×N correlated subqueries.
        // The LEFT JOIN + GROUP BY produces the same four counts in a single scan
        // of each table rather than one subquery per college row.
        sql: `
      SELECT
        c.id, c.name, c.address, c.kam_id, c.has_shifts, c.shift_configs, c.rooms,
        c.code, c.academic_year, c.manager, c.working_days,
        k.name  AS kam_name,
        j.email AS kam_email,
        COALESCE(cmc.cam_count,    0) AS cam_count,
        COALESCE(dc.dept_count,    0) AS dept_count,
        COALESCE(mc.mentor_count,  0) AS mentor_count,
        COALESCE(sc.slot_count,    0) AS slot_count
      FROM colleges c
      LEFT JOIN kam_users j ON c.kam_id = j.id
      LEFT JOIN kam_users k ON c.kam_id = k.id
      LEFT JOIN (
        SELECT college_id, COUNT(*) AS cam_count
        FROM campus_managers GROUP BY college_id
      ) cmc ON cmc.college_id = c.id
      LEFT JOIN (
        SELECT college_id, COUNT(*) AS dept_count
        FROM departments GROUP BY college_id
      ) dc  ON dc.college_id  = c.id
      LEFT JOIN (
        SELECT college_id, COUNT(*) AS mentor_count
        FROM mentors GROUP BY college_id
      ) mc  ON mc.college_id  = c.id
      LEFT JOIN (
        SELECT m.college_id, COUNT(*) AS slot_count
        FROM slots s
        JOIN mentors m ON s.mentorId = m.id
        GROUP BY m.college_id
      ) sc  ON sc.college_id  = c.id
      ORDER BY c.name
    `
      },
      {
        // Only the columns the admin UI actually needs; avoids shipping any
        // sensitive credential columns that might end up in campus_managers.
        sql: `
      SELECT cm.id, cm.name, cm.email, cm.college_id, cm.kam_id,
             c.name AS college_name
      FROM campus_managers cm
      LEFT JOIN colleges c ON cm.college_id = c.id
      ORDER BY cm.name
    `
      },
      { sql: "SELECT id, name, email, title FROM kam_users ORDER BY name" }
    ]);

    return NextResponse.json(
      { success: true, colleges, campusManagers, kamUsers },
      { headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=120" } }
    );
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { errorResponse } = await requireAuth(request, { allowedRoles: ["admin"] });
    if (errorResponse) return errorResponse;
    const db = await getDb();
    const body = await request.json();
    const { id: providedId, name, address, kam_id, has_shifts, shift_configs, rooms, code, academic_year, manager, working_days } = body;
    if (!name || !kam_id) {
      return NextResponse.json({ success: false, message: "Missing required fields (name, kam_id)" }, { status: 400 });
    }
    const cleanName = name.trim();

    // Auto-generate ID if not provided (Bug #25 fix)
    const generatedId = providedId
      ? providedId.trim()
      : "college_" + cleanName.toLowerCase().replace(/[^a-z0-9]/g, "_").replace(/_+/g, "_").replace(/(^_|_$)/g, "") + "_" + Date.now().toString(36);

    // Duplicate ID and duplicate name are independent lookups, so both go out together.
    const [idMatches, nameMatches] = await db.multiQuery([
      { sql: "SELECT id FROM colleges WHERE id = ?", params: [generatedId] },
      { sql: "SELECT id FROM colleges WHERE LOWER(name) = LOWER(?)", params: [cleanName] }
    ]);
    if (idMatches.length > 0) {
      return NextResponse.json({ success: false, message: `A campus with ID "${generatedId}" already exists.` }, { status: 400 });
    }
    if (nameMatches.length > 0) {
      return NextResponse.json({ success: false, message: `A campus named "${cleanName}" already exists.` }, { status: 400 });
    }

    await db.run(
      "INSERT INTO colleges (id, name, address, kam_id, has_shifts, shift_configs, rooms, code, academic_year, manager, working_days) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      generatedId, cleanName, address ? address.trim() : "", kam_id.trim(), has_shifts === undefined ? 1 : Number(has_shifts), shift_configs || null, rooms || null, code || null, academic_year || null, manager || null, working_days === undefined ? 5 : Number(working_days)
    );
    return NextResponse.json({ success: true, message: "Campus created successfully", id: generatedId });
  } catch (error: any) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const { errorResponse } = await requireAuth(request, { allowedRoles: ["admin"] });
    if (errorResponse) return errorResponse;
    const db = await getDb();
    const body = await request.json();
    const { id, name, address, kam_id, has_shifts, shift_configs, rooms, code, academic_year, manager, working_days } = body;
    if (!id || !name || !kam_id) {
      return NextResponse.json({ success: false, message: "Missing required fields" }, { status: 400 });
    }
    await db.run(
      "UPDATE colleges SET name = ?, address = ?, kam_id = ?, has_shifts = ?, shift_configs = ?, rooms = ?, code = ?, academic_year = ?, manager = ?, working_days = ? WHERE id = ?",
      name.trim(), address ? address.trim() : "", kam_id.trim(), has_shifts === undefined ? 1 : Number(has_shifts), shift_configs || null, rooms || null, code || null, academic_year || null, manager || null, working_days === undefined ? 5 : Number(working_days), id
    );
    return NextResponse.json({ success: true, message: "Campus updated successfully" });
  } catch (error: any) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { errorResponse } = await requireAuth(request, { allowedRoles: ["admin"] });
    if (errorResponse) return errorResponse;
    const db = await getDb();
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) {
      return NextResponse.json({ success: false, message: "Campus id required" }, { status: 400 });
    }

    // --- Bug #20+#21 fix: full cascade delete ---
    //
    // One transaction, with every sweep keyed by college_id through a subquery.
    // Autocommitted, a failure part-way through left the college row still present
    // with its mentors, slots and students already gone (unrecoverable by retrying
    // the delete), and building an IN (...) list per campus hit the 65,535-bind cap.
    const deletedCounts = await db.transaction(async (tx) => {
      const countOf = async (sql: string, ...args: any[]) => Number((await tx.get(sql, ...args))?.n || 0);

      const mentors = await countOf("SELECT COUNT(*)::int AS n FROM mentors WHERE college_id = ?", id);
      const students = await countOf("SELECT COUNT(*)::int AS n FROM students WHERE college_id = ?", id);
      const cams = await countOf("SELECT COUNT(*)::int AS n FROM campus_managers WHERE college_id = ?", id);

      const collegeMentorSlots =
        "SELECT s.id FROM slots s JOIN mentors m ON m.id = s.mentorId WHERE m.college_id = ?";

      // 1. Detach attendance, then remove the mentor slots and everything hanging off them
      await tx.run(`UPDATE student_attendance SET slotId = NULL WHERE slotId IN (${collegeMentorSlots})`, id);
      await tx.run(`DELETE FROM handover_requests WHERE slotId IN (${collegeMentorSlots})`, id);
      await tx.run(`DELETE FROM approved_handovers WHERE slotId IN (${collegeMentorSlots})`, id);
      await tx.run(`DELETE FROM slots WHERE mentorId IN (SELECT id FROM mentors WHERE college_id = ?)`, id);

      // 2. Mentors and their logins
      await tx.run(`DELETE FROM users WHERE role = 'mentor' AND reference_id IN (SELECT id FROM mentors WHERE college_id = ?)`, id);
      await tx.run(`DELETE FROM mentors WHERE college_id = ?`, id);

      // 3. Students and their logins
      await tx.run(`DELETE FROM student_attendance WHERE studentId IN (SELECT id FROM students WHERE college_id = ?)`, id);
      await tx.run(`DELETE FROM leave_requests WHERE studentId IN (SELECT id FROM students WHERE college_id = ?)`, id);
      await tx.run(`DELETE FROM users WHERE role = 'student' AND reference_id IN (SELECT id FROM students WHERE college_id = ?)`, id);
      await tx.run(`DELETE FROM students WHERE college_id = ?`, id);

      // 4. Campus managers and their logins
      await tx.run(`DELETE FROM users WHERE role IN ('cm', 'cam') AND reference_id IN (SELECT id FROM campus_managers WHERE college_id = ?)`, id);
      await tx.run(`DELETE FROM campus_managers WHERE college_id = ?`, id);

      // 5. Subjects keep their rows but lose the campus assignment
      await tx.run("UPDATE subjects SET college_id = NULL WHERE college_id = ?", id);

      // 6. Courses, departments, then the college itself
      await tx.run("DELETE FROM courses WHERE college_id = ?", id);
      await tx.run("DELETE FROM departments WHERE college_id = ?", id);
      await tx.run("DELETE FROM colleges WHERE id = ?", id);

      return { mentors, students, cams };
    });

    return NextResponse.json({
      success: true,
      message: `Campus deleted successfully. Removed ${deletedCounts.mentors} mentor(s), ${deletedCounts.students} student(s), ${deletedCounts.cams} CAM(s) and all associated data.`,
      deletedCounts
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

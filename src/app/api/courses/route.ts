export const maxDuration = 60;

import { NextResponse } from "next/server";
import { getDb, type QueryFailure } from "@/lib/db";
import { requireAuth, Role } from "@/lib/authGuard";
import { generateId } from "@/lib/id";

// Courses are campus configuration, and DELETE cascades into slots, mentors,
// students and their user accounts — so this route is staff-only. Other roles
// get course lists from the role-scoped /api/data payload.
const COURSE_CONFIG_ROLES: Role[] = ["admin", "cm", "kam"];

async function requireCourseConfigAccess(request: Request) {
  return requireAuth(request, { allowedRoles: COURSE_CONFIG_ROLES });
}

// Helper to generate slugs for IDs
function getSlug(text: string, collegeId?: string): string {
  const clean = text.toLowerCase().replace(/[^a-z0-9]/g, "_").replace(/_+/g, "_").replace(/(^_+|_+$)/g, "");
  return collegeId ? `dept_${collegeId.replace(/[^a-z0-9]/gi, "_")}_${clean}` : `dept_${clean}`;
}

export async function GET(request: Request) {
  try {
    const { errorResponse } = await requireCourseConfigAccess(request);
    if (errorResponse) return errorResponse;

    const db = await getDb();
    const { searchParams } = new URL(request.url);
    const collegeId = searchParams.get("college_id");

    let courses;
    if (collegeId && collegeId !== "all") {
      courses = await db.all("SELECT * FROM courses WHERE college_id = ? OR college_id IS NULL ORDER BY name LIMIT 2000", collegeId);
    } else {
      courses = await db.all("SELECT * FROM courses ORDER BY name LIMIT 2000");
    }

    return NextResponse.json({ success: true, courses });
  } catch (error: any) {
    console.error("API GET Courses error:", error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  let cleanName = "";
  try {
    const { errorResponse } = await requireCourseConfigAccess(request);
    if (errorResponse) return errorResponse;

    const db = await getDb();
    const body = await request.json();
    const { name, college_id, code, description, established_year, status, years, start_date, end_date, start_year, end_year, default_room, default_shift, shift_based, sections, incharge_mentor_id, incharge_mentor_name } = body;

    let resolvedInchargeId = incharge_mentor_id !== undefined ? (incharge_mentor_id || null) : null;
    let resolvedInchargeName = incharge_mentor_name !== undefined ? (incharge_mentor_name || null) : null;
    if (resolvedInchargeId && !resolvedInchargeName) {
      const mRow = await db.get("SELECT name FROM mentors WHERE id = ?", [resolvedInchargeId]).catch(() => null);
      resolvedInchargeName = mRow?.name || null;
    }

    if (!name || !name.trim()) {
      return NextResponse.json({ success: false, message: "Course name is required" }, { status: 400 });
    }

    cleanName = name.trim();
    let targetCollegeId = college_id || null;
    if (!targetCollegeId) {
      // Ambiguous campus would silently fall through to the "college_id IS NULL"
      // uniqueness branch and allow duplicate courses per campus.
      const colleges = await db.all("SELECT id FROM colleges ORDER BY id ASC LIMIT 2");
      if (colleges.length === 1) {
        targetCollegeId = colleges[0].id;
      } else {
        return NextResponse.json({
          success: false,
          message: "college_id is required — the course cannot be assigned to an ambiguous campus."
        }, { status: 400 });
      }
    }

    // Both probes key off the request body, so they leave as one round trip: the
    // name check decides 409-vs-update, the slug check only decides whether the
    // generated id needs a suffix. A failed probe must not read as "no duplicate".
    let id = getSlug(cleanName, targetCollegeId || undefined);
    const courseProbeFailures: QueryFailure[] = [];
    const [existingRows, slugRows] = await db.multiQuery([
      {
        sql: "SELECT * FROM courses WHERE LOWER(TRIM(name)) = LOWER(TRIM(?)) AND (college_id = ? OR college_id IS NULL)",
        params: [cleanName, targetCollegeId],
      },
      { sql: "SELECT id FROM courses WHERE id = ?", params: [id] },
    ], courseProbeFailures);
    if (courseProbeFailures.length > 0) {
      return NextResponse.json({
        success: false,
        message: "Could not check this course against existing ones. Please try again."
      }, { status: 500 });
    }
    const existing = existingRows[0];

    // If creating a new course and a course with this name already exists in the campus, reject with an error
    if (existing && !body.id) {
      return NextResponse.json({
        success: false,
        message: `A course named "${cleanName}" already exists in this campus. Duplicate courses are not allowed.`
      }, { status: 409 });
    }

    if (existing) {
      // Gracefully ensure it is assigned to this college and update all batch configurations
      await db.run(
        `UPDATE courses SET 
          college_id = ?, 
          code = COALESCE(NULLIF(?, ''), code), 
          description = COALESCE(NULLIF(?, ''), description), 
          status = COALESCE(NULLIF(?, ''), status, 'Active'),
          years = COALESCE(?, years, 4),
          start_date = COALESCE(NULLIF(?, ''), start_date, ''),
          end_date = COALESCE(NULLIF(?, ''), end_date, ''),
          start_year = COALESCE(NULLIF(?, ''), start_year, ''),
          end_year = COALESCE(NULLIF(?, ''), end_year, ''),
          default_room = COALESCE(NULLIF(?, ''), default_room),
          default_shift = COALESCE(NULLIF(?, ''), default_shift), 
          shift_based = ?,
          sections = COALESCE(NULLIF(?, ''), sections),
          incharge_mentor_id = ?,
          incharge_mentor_name = ?
        WHERE id = ?`,
        targetCollegeId || existing.college_id,
        code || "",
        description || "",
        status || existing.status || "Active",
        years !== undefined ? Number(years) : (existing.years || 4),
        start_date || existing.start_date || "",
        end_date || existing.end_date || "",
        start_year || existing.start_year || "",
        end_year || existing.end_year || "",
        default_room || existing.default_room || null,
        default_shift || existing.default_shift || null,
        shift_based === undefined ? (existing.shift_based || 0) : Number(shift_based),
        sections || existing.sections || null,
        resolvedInchargeId !== undefined ? resolvedInchargeId : (existing.incharge_mentor_id || null),
        resolvedInchargeName !== undefined ? resolvedInchargeName : (existing.incharge_mentor_name || null),
        existing.id
      );

      try {
        const existingDept = await db.get(
          "SELECT id FROM departments WHERE id = ? OR (LOWER(name) = LOWER(?) AND (college_id = ? OR college_id IS NULL))",
          existing.id,
          cleanName,
          targetCollegeId || existing.college_id
        );
        if (existingDept) {
          await db.run(
            "UPDATE departments SET name = ?, college_id = ?, code = ?, description = ?, incharge_mentor_id = ?, incharge_mentor_name = ? WHERE id = ?",
            cleanName, targetCollegeId || existing.college_id, code || existing.code || "", description || existing.description || "",
            resolvedInchargeId !== undefined ? resolvedInchargeId : (existing.incharge_mentor_id || null),
            resolvedInchargeName !== undefined ? resolvedInchargeName : (existing.incharge_mentor_name || null),
            existingDept.id
          );
        } else {
          await db.run(
            "INSERT INTO departments (id, name, college_id, code, description, incharge_mentor_id, incharge_mentor_name) VALUES (?, ?, ?, ?, ?, ?, ?)",
            existing.id, cleanName, targetCollegeId || existing.college_id, code || existing.code || "", description || existing.description || "",
            resolvedInchargeId !== undefined ? resolvedInchargeId : (existing.incharge_mentor_id || null),
            resolvedInchargeName !== undefined ? resolvedInchargeName : (existing.incharge_mentor_name || null)
          );
        }
      } catch (_) {}

      return NextResponse.json({
        success: true,
        message: "Department registered and batch configuration updated successfully.",
        course: {
          ...existing,
          name: cleanName,
          college_id: targetCollegeId || existing.college_id,
          code: code || existing.code || "",
          description: description || existing.description || "",
          status: status || existing.status || "Active",
          years: years !== undefined ? Number(years) : (existing.years || 4),
          start_date: start_date || existing.start_date || "",
          end_date: end_date || existing.end_date || "",
          start_year: start_year || existing.start_year || "",
          end_year: end_year || existing.end_year || "",
          default_room: default_room || existing.default_room || null,
          default_shift: default_shift || existing.default_shift || null,
          shift_based: shift_based === undefined ? (existing.shift_based || 0) : Number(shift_based),
          sections: sections || existing.sections || null,
          incharge_mentor_id: resolvedInchargeId !== undefined ? resolvedInchargeId : (existing.incharge_mentor_id || null),
          incharge_mentor_name: resolvedInchargeName !== undefined ? resolvedInchargeName : (existing.incharge_mentor_name || null)
        }
      });
    }

    // Keep the id unique just in case. The base36 millisecond used to be the only
    // suffix, so two requests in the same millisecond both survived the check and
    // then collided on INSERT.
    if (slugRows.length > 0) {
      id = generateId(id);
    }

    try {
      await db.run(
        "INSERT INTO courses (id, name, college_id, code, description, hod_name, established_year, status, years, start_date, end_date, start_year, end_year, default_room, default_shift, shift_based, sections, incharge_mentor_id, incharge_mentor_name) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        id,
        cleanName,
        targetCollegeId,
        code || "",
        description || "",
        "",
        established_year || "",
        status || "Active",
        years !== undefined ? Number(years) : 4,
        start_date || "",
        end_date || "",
        start_year || "",
        end_year || "",
        default_room || null,
        default_shift || null,
        shift_based === undefined ? 0 : Number(shift_based),
        sections || null,
        resolvedInchargeId || null,
        resolvedInchargeName || null
      );
    } catch (insertErr: any) {
      if (insertErr.message && (insertErr.message.includes("UNIQUE constraint failed") || insertErr.message.includes("duplicate key"))) {
        // Only a course in this campus (or a shared college_id IS NULL row) may be
        // adopted here. The old global fallback picked whichever row held the name,
        // which moved another campus's course onto this one.
        const conflictFailures: QueryFailure[] = [];
        const [scopedConflicts] = await db.multiQuery([
          {
            sql: "SELECT * FROM courses WHERE LOWER(TRIM(name)) = LOWER(TRIM(?)) AND (college_id = ? OR college_id IS NULL)",
            params: [cleanName, targetCollegeId],
          },
        ], conflictFailures);
        if (conflictFailures.length > 0) throw insertErr;
        const conflictCourse = scopedConflicts[0];
        if (!conflictCourse) {
          return NextResponse.json({
            success: false,
            message: `A course named "${cleanName}" already exists in another campus.`
          }, { status: 409 });
        }

        if (conflictCourse) {
          await db.run(
            `UPDATE courses SET 
              college_id = COALESCE(?, college_id),
              code = COALESCE(NULLIF(?, ''), code),
              description = COALESCE(NULLIF(?, ''), description),
              status = COALESCE(NULLIF(?, ''), status, 'Active'),
              years = COALESCE(?, years, 4),
              start_date = COALESCE(NULLIF(?, ''), start_date, ''),
              end_date = COALESCE(NULLIF(?, ''), end_date, ''),
              start_year = COALESCE(NULLIF(?, ''), start_year, ''),
              end_year = COALESCE(NULLIF(?, ''), end_year, ''),
              default_room = COALESCE(NULLIF(?, ''), default_room),
              default_shift = COALESCE(NULLIF(?, ''), default_shift),
              shift_based = ?,
              sections = COALESCE(NULLIF(?, ''), sections),
              incharge_mentor_id = ?,
              incharge_mentor_name = ?
            WHERE id = ?`,
            targetCollegeId || conflictCourse.college_id,
            code || "",
            description || "",
            status || conflictCourse.status || "Active",
            years !== undefined ? Number(years) : (conflictCourse.years || 4),
            start_date || conflictCourse.start_date || "",
            end_date || conflictCourse.end_date || "",
            start_year || conflictCourse.start_year || "",
            end_year || conflictCourse.end_year || "",
            default_room || conflictCourse.default_room || null,
            default_shift || conflictCourse.default_shift || null,
            shift_based === undefined ? (conflictCourse.shift_based || 0) : Number(shift_based),
            sections || conflictCourse.sections || null,
            resolvedInchargeId !== undefined ? resolvedInchargeId : (conflictCourse.incharge_mentor_id || null),
            resolvedInchargeName !== undefined ? resolvedInchargeName : (conflictCourse.incharge_mentor_name || null),
            conflictCourse.id
          );
          try {
            const existingDept = await db.get(
              "SELECT id FROM departments WHERE id = ? OR (LOWER(name) = LOWER(?) AND (college_id = ? OR college_id IS NULL))",
              conflictCourse.id,
              cleanName,
              targetCollegeId || conflictCourse.college_id
            );
            if (existingDept) {
              await db.run(
                "UPDATE departments SET name = ?, college_id = ?, code = ?, description = ?, incharge_mentor_id = ?, incharge_mentor_name = ? WHERE id = ?",
                cleanName, targetCollegeId || conflictCourse.college_id, code || conflictCourse.code || "", description || conflictCourse.description || "",
                resolvedInchargeId !== undefined ? resolvedInchargeId : (conflictCourse.incharge_mentor_id || null),
                resolvedInchargeName !== undefined ? resolvedInchargeName : (conflictCourse.incharge_mentor_name || null),
                existingDept.id
              );
            } else {
              await db.run(
                "INSERT INTO departments (id, name, college_id, code, description, incharge_mentor_id, incharge_mentor_name) VALUES (?, ?, ?, ?, ?, ?, ?)",
                conflictCourse.id, cleanName, targetCollegeId || conflictCourse.college_id, code || conflictCourse.code || "", description || conflictCourse.description || "",
                resolvedInchargeId !== undefined ? resolvedInchargeId : (conflictCourse.incharge_mentor_id || null),
                resolvedInchargeName !== undefined ? resolvedInchargeName : (conflictCourse.incharge_mentor_name || null)
              );
            }
          } catch (_) {}

          return NextResponse.json({
            success: true,
            message: "Course configuration updated successfully.",
            course: {
              ...conflictCourse,
              college_id: targetCollegeId || conflictCourse.college_id,
              code: code || conflictCourse.code || "",
              description: description || conflictCourse.description || "",
              incharge_mentor_id: resolvedInchargeId !== undefined ? resolvedInchargeId : (conflictCourse.incharge_mentor_id || null),
              incharge_mentor_name: resolvedInchargeName !== undefined ? resolvedInchargeName : (conflictCourse.incharge_mentor_name || null)
            }
          });
        }
      }
      throw insertErr;
    }

    try {
      const existingDept = await db.get(
        "SELECT id FROM departments WHERE id = ? OR (LOWER(name) = LOWER(?) AND (college_id = ? OR college_id IS NULL))",
        id,
        cleanName,
        targetCollegeId
      );
      if (existingDept) {
        await db.run(
          "UPDATE departments SET name = ?, college_id = ?, code = ?, description = ?, incharge_mentor_id = ?, incharge_mentor_name = ? WHERE id = ?",
          cleanName, targetCollegeId, code || "", description || "", resolvedInchargeId || null, resolvedInchargeName || null, existingDept.id
        );
      } else {
        await db.run(
          "INSERT INTO departments (id, name, college_id, code, description, incharge_mentor_id, incharge_mentor_name) VALUES (?, ?, ?, ?, ?, ?, ?)",
          id, cleanName, targetCollegeId, code || "", description || "", resolvedInchargeId || null, resolvedInchargeName || null
        );
      }
    } catch (_) {}

    return NextResponse.json({
      success: true,
      message: "Course created successfully.",
      course: {
        id,
        name: cleanName,
        college_id: targetCollegeId,
        code: code || "",
        description: description || "",
        established_year: established_year || "",
        status: status || "Active",
        years: years !== undefined ? Number(years) : 4,
        start_date: start_date || "",
        end_date: end_date || "",
        start_year: start_year || "",
        end_year: end_year || "",
        default_room: default_room || null,
        default_shift: default_shift || null,
        shift_based: shift_based === undefined ? 0 : Number(shift_based),
        sections: sections || null,
        incharge_mentor_id: resolvedInchargeId || null,
        incharge_mentor_name: resolvedInchargeName || null
      }
    });
  } catch (error: any) {
    console.error("API POST Courses error:", error);
    const isUniqueConstraint = error?.message?.includes("UNIQUE constraint failed") || error?.message?.includes("duplicate key");
    return NextResponse.json({ 
      success: false, 
      message: isUniqueConstraint ? `A course with name "${cleanName}" already exists for this campus.` : (error.message || "Failed to process course request") 
    }, { status: isUniqueConstraint ? 409 : 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const { errorResponse } = await requireCourseConfigAccess(request);
    if (errorResponse) return errorResponse;

    const db = await getDb();
    const body = await request.json();
    const { id, name, college_id, code, description, established_year, status, years, start_date, end_date, start_year, end_year, default_room, default_shift, shift_based, sections, incharge_mentor_id, incharge_mentor_name } = body;

    if (!id || !name || !name.trim()) {
      return NextResponse.json({ success: false, message: "ID and name are required." }, { status: 400 });
    }

    const cleanName = name.trim();

    // Find the current course details
    let currentCourse = await db.get("SELECT * FROM courses WHERE id = ?", id);
    if (!currentCourse) {
      currentCourse = await db.get("SELECT * FROM courses WHERE LOWER(TRIM(name)) = LOWER(TRIM(?)) AND (college_id = ? OR college_id IS NULL)", cleanName, college_id || null);
    }
    if (!currentCourse) {
      return NextResponse.json({ success: false, message: "Course not found." }, { status: 404 });
    }

    let resolvedInchargeId = incharge_mentor_id !== undefined ? (incharge_mentor_id || null) : (currentCourse.incharge_mentor_id || null);
    let resolvedInchargeName = incharge_mentor_name !== undefined ? (incharge_mentor_name || null) : (currentCourse.incharge_mentor_name || null);
    if (resolvedInchargeId && (!resolvedInchargeName || incharge_mentor_id !== currentCourse.incharge_mentor_id)) {
      const mRow = await db.get("SELECT name FROM mentors WHERE id = ?", [resolvedInchargeId]).catch(() => null);
      if (mRow?.name) resolvedInchargeName = mRow.name;
    }
    if (!resolvedInchargeId) {
      resolvedInchargeName = null;
    }

    let targetCollegeId = college_id || currentCourse.college_id;
    if (!targetCollegeId) {
      const firstCol = await db.get("SELECT id FROM colleges ORDER BY id ASC LIMIT 1");
      targetCollegeId = firstCol?.id || null;
    }

    // Check name uniqueness among other courses in the same college
    let duplicate;
    if (targetCollegeId) {
      duplicate = await db.get("SELECT * FROM courses WHERE LOWER(name) = LOWER(?) AND id != ? AND college_id = ?", cleanName, currentCourse.id, targetCollegeId);
    } else {
      duplicate = await db.get("SELECT * FROM courses WHERE LOWER(name) = LOWER(?) AND id != ? AND college_id IS NULL", cleanName, currentCourse.id);
    }
    if (duplicate) {
      return NextResponse.json({ success: false, message: `Another course named "${cleanName}" already exists for this campus.` }, { status: 400 });
    }

    const oldName = currentCourse.name;

    // Run cascade updates for course rename inside a PostgreSQL transaction
    await db.transaction(async (tx) => {
      // 1. Rename course in master list
      await tx.run(
        `UPDATE courses SET 
          name = ?, 
          college_id = ?, 
          code = ?, 
          description = ?, 
          hod_name = ?, 
          established_year = ?, 
          status = ?, 
          years = ?, 
          start_date = ?, 
          end_date = ?, 
          start_year = ?, 
          end_year = ?, 
          default_room = ?, 
          default_shift = ?, 
          shift_based = ?, 
          sections = ?,
          incharge_mentor_id = ?,
          incharge_mentor_name = ?
        WHERE id = ?`,
        cleanName,
        targetCollegeId,
        code !== undefined ? code : (currentCourse.code || ""),
        description !== undefined ? description : (currentCourse.description || ""),
        "",
        established_year !== undefined ? established_year : (currentCourse.established_year || ""),
        status || currentCourse.status || "Active",
        years !== undefined ? Number(years) : (currentCourse.years || 4),
        start_date !== undefined ? start_date : (currentCourse.start_date || ""),
        end_date !== undefined ? end_date : (currentCourse.end_date || ""),
        start_year !== undefined ? start_year : (currentCourse.start_year || ""),
        end_year !== undefined ? end_year : (currentCourse.end_year || ""),
        default_room !== undefined ? default_room : (currentCourse.default_room || null),
        default_shift !== undefined ? default_shift : (currentCourse.default_shift || null),
        shift_based !== undefined ? Number(shift_based) : (currentCourse.shift_based || 0),
        sections !== undefined ? sections : (currentCourse.sections || null),
        resolvedInchargeId,
        resolvedInchargeName,
        currentCourse.id
      );

      // Update or insert into departments gracefully without crashing transaction
      const existingDept = await tx.get(
        "SELECT id FROM departments WHERE id = ? OR (LOWER(name) = LOWER(?) AND (college_id = ? OR college_id IS NULL)) OR (LOWER(name) = LOWER(?) AND (college_id = ? OR college_id IS NULL))",
        currentCourse.id,
        cleanName,
        targetCollegeId,
        oldName,
        targetCollegeId
      );

      if (existingDept) {
        await tx.run(
          `UPDATE departments SET 
            name = ?, 
            college_id = ?, 
            code = ?, 
            description = ?, 
            status = ?, 
            years = ?, 
            start_year = ?, 
            end_year = ?, 
            shift_based = ?,
            incharge_mentor_id = ?,
            incharge_mentor_name = ?
          WHERE id = ?`,
          cleanName,
          targetCollegeId,
          code !== undefined ? code : (currentCourse.code || ""),
          description !== undefined ? description : (currentCourse.description || ""),
          status || currentCourse.status || "Active",
          years !== undefined ? Number(years) : (currentCourse.years || 4),
          start_year !== undefined ? start_year : (currentCourse.start_year || ""),
          end_year !== undefined ? end_year : (currentCourse.end_year || ""),
          shift_based !== undefined ? Number(shift_based) : (currentCourse.shift_based || 0),
          resolvedInchargeId,
          resolvedInchargeName,
          existingDept.id
        );
      } else {
        await tx.run(
          `INSERT INTO departments 
            (id, name, college_id, code, description, status, years, start_year, end_year, shift_based, incharge_mentor_id, incharge_mentor_name) 
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          currentCourse.id,
          cleanName,
          targetCollegeId,
          code !== undefined ? code : (currentCourse.code || ""),
          description !== undefined ? description : (currentCourse.description || ""),
          status || currentCourse.status || "Active",
          years !== undefined ? Number(years) : (currentCourse.years || 4),
          start_year !== undefined ? start_year : (currentCourse.start_year || ""),
          end_year !== undefined ? end_year : (currentCourse.end_year || ""),
          shift_based !== undefined ? Number(shift_based) : (currentCourse.shift_based || 0),
          resolvedInchargeId,
          resolvedInchargeName
        );
      }

      // 2. Cascade rename to mentors table
      await tx.run("UPDATE mentors SET department = ? WHERE department = ?", cleanName, oldName);

      // 3. Cascade rename to subjects table
      await tx.run("UPDATE subjects SET department = ? WHERE department = ?", cleanName, oldName);

      // 4. Cascade rename to slots table
      await tx.run("UPDATE slots SET department = ? WHERE department = ?", cleanName, oldName);
      await tx.run("UPDATE slots SET classgroup = ? WHERE classgroup = ?", cleanName, oldName);

      // 5. Cascade rename to handover_requests.classGroup where it contains the old department
      await tx.run(
        "UPDATE handover_requests SET classgroup = REPLACE(classgroup, ?, ?) WHERE classgroup LIKE ?",
        oldName, cleanName, `${oldName}%`
      );

      // 6. Cascade rename in students table department & classgroup fields
      await tx.run("UPDATE students SET department = ? WHERE department = ?", cleanName, oldName);
      await tx.run("UPDATE students SET classgroup = ? WHERE classgroup = ?", cleanName, oldName);
    });

    return NextResponse.json({
      success: true,
      message: "Course updated and cascaded successfully.",
      course: {
        id: currentCourse.id,
        name: cleanName,
        college_id: targetCollegeId,
        code: code !== undefined ? code : (currentCourse.code || ""),
        description: description !== undefined ? description : (currentCourse.description || ""),
        status: status || currentCourse.status || "Active",
        years: years !== undefined ? Number(years) : (currentCourse.years || 4),
        start_date: start_date !== undefined ? start_date : (currentCourse.start_date || ""),
        end_date: end_date !== undefined ? end_date : (currentCourse.end_date || ""),
        start_year: start_year !== undefined ? start_year : (currentCourse.start_year || ""),
        end_year: end_year !== undefined ? end_year : (currentCourse.end_year || ""),
        default_room: default_room !== undefined ? default_room : (currentCourse.default_room || null),
        default_shift: default_shift !== undefined ? default_shift : (currentCourse.default_shift || null),
        shift_based: shift_based !== undefined ? Number(shift_based) : (currentCourse.shift_based || 0),
        sections: sections !== undefined ? sections : (currentCourse.sections || null),
        incharge_mentor_id: resolvedInchargeId || null,
        incharge_mentor_name: resolvedInchargeName || null
      }
    });
  } catch (error: any) {
    console.error("API PUT Courses error:", error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

function getBaseDeptName(name: string): string {
  if (!name) return "";
  let cleaned = name.replace(/\s*-\s*(Semester|Sem|Year|Yr|Shift|Batch)\s*\d+/gi, "");
  cleaned = cleaned.replace(/\s*(Semester|Sem|Year|Yr|Shift|Batch)\s*\d+/gi, "");
  return cleaned.trim();
}

function isDeptMatch(name: string, targetName: string, targetId: string): boolean {
  if (!name || !targetName) return false;
  const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  
  const baseDept = normalize(getBaseDeptName(name));
  const nTargetName = normalize(targetName);
  const nTargetId = normalize(targetId.replace(/^dept_/, ""));

  return baseDept === nTargetName || baseDept === nTargetId;
}

export async function DELETE(request: Request) {
  try {
    const { errorResponse } = await requireCourseConfigAccess(request);
    if (errorResponse) return errorResponse;

    const db = await getDb();
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ success: false, message: "Missing course id." }, { status: 400 });
    }

    let course = await db.get("SELECT * FROM courses WHERE id = ? OR name = ?", id, id);
    if (!course) {
      course = await db.get("SELECT * FROM departments WHERE id = ? OR name = ?", id, id);
    }
    const courseName = course ? course.name : id;
    const courseId = course ? course.id : id;
    const isMatch = (deptOrGroup: string) => {
      return isDeptMatch(deptOrGroup || "", courseName, id);
    };

    // Course names are matched fuzzily by string, so without a campus filter a
    // department that exists at two colleges wipes the other campus's slots,
    // students, mentors and subjects. Untagged (NULL) rows keep matching.
    const courseCollegeId: string | null = course?.college_id || null;
    const campusWhere = courseCollegeId ? " WHERE (college_id = ? OR college_id IS NULL)" : "";
    const campusArgs = courseCollegeId ? [courseCollegeId] : [];

    // The whole cascade runs as one transaction: these sweeps are matched fuzzily
    // by department name, so a failure half-way used to leave a course row gone
    // while its students, mentors and subjects (and their logins) stayed behind —
    // unrecoverable by retrying because the course that scoped the match is gone.
    // ID lists are chunked so a large department cannot exceed Postgres' 65,535
    // bind-parameter cap.
    const deletedCounts = await db.transaction(async (tx) => {
      const IN_CHUNK = 500;
      const runInChunks = async (ids: any[], sqlFor: (placeholders: string) => string) => {
        for (let i = 0; i < ids.length; i += IN_CHUNK) {
          const chunk = ids.slice(i, i + IN_CHUNK);
          await tx.run(sqlFor(chunk.map(() => "?").join(",")), ...chunk);
        }
      };

      // 1. Delete slots for this department/classGroup and cascade to student_attendance, handover records
      const allSlots = await tx.all(`SELECT id, department, classGroup FROM slots${campusWhere}`, ...campusArgs);
      const slotsToDelete = allSlots.filter((s: any) => isMatch(s.department) || isMatch(s.classGroup));
      const slotIds = slotsToDelete.map((s: any) => s.id);

      if (slotIds.length > 0) {
        await runInChunks(slotIds, (ph) => `UPDATE student_attendance SET slotId = NULL WHERE slotId IN (${ph})`);
        await runInChunks(slotIds, (ph) => `DELETE FROM handover_requests WHERE slotId IN (${ph})`);
        await runInChunks(slotIds, (ph) => `DELETE FROM approved_handovers WHERE slotId IN (${ph})`);
        await runInChunks(slotIds, (ph) => `DELETE FROM slots WHERE id IN (${ph})`);
      }

      // Also delete handover_requests where classGroup matches this course (Bug #26 fix)
      // classGroup format: "<CourseName> - SEM X"
      const allHandovers = await tx.all("SELECT id, classGroup FROM handover_requests");
      const handoverIdsToDelete = allHandovers
        .filter((h: any) => h.classGroup && isMatch(h.classGroup))
        .map((h: any) => h.id);
      if (handoverIdsToDelete.length > 0) {
        await runInChunks(handoverIdsToDelete, (ph) => `DELETE FROM handover_requests WHERE id IN (${ph})`);
      }

      // 2. Find student IDs in this department to clean up their records
      const allStudents = await tx.all(`SELECT id, department, classGroup FROM students${campusWhere}`, ...campusArgs);
      const studentsToDelete = allStudents.filter((s: any) =>
        isMatch(s.department) ||
        isMatch(s.classGroup) ||
        // Additional check: classGroup starts with course name (e.g. "B.Sc. CS AI - SEM I" matches "B.Sc. CS AI")
        (s.classGroup && s.classGroup.toLowerCase().startsWith(courseName.toLowerCase()))
      );
      const studentIds = studentsToDelete.map((s: any) => s.id);

      if (studentIds.length > 0) {
        await runInChunks(studentIds, (ph) => `DELETE FROM student_attendance WHERE studentId IN (${ph})`);
        // Bug #27 fix: clean up leave_requests for deleted students
        await runInChunks(studentIds, (ph) => `DELETE FROM leave_requests WHERE studentId IN (${ph})`);
        await runInChunks(studentIds, (ph) => `DELETE FROM users WHERE role = 'student' AND reference_id IN (${ph})`);
        await runInChunks(studentIds, (ph) => `DELETE FROM students WHERE id IN (${ph})`);
      }

      // 3. Delete mentors in this department and their user accounts
      const allMentors = await tx.all(`SELECT id, department FROM mentors${campusWhere}`, ...campusArgs);
      const mentorsToDelete = allMentors.filter((m: any) => m.department && isMatch(m.department));
      const mentorIds = mentorsToDelete.map((m: any) => m.id);
      if (mentorIds.length > 0) {
        await runInChunks(mentorIds, (ph) => `DELETE FROM users WHERE role = 'mentor' AND reference_id IN (${ph})`);
        await runInChunks(mentorIds, (ph) => `DELETE FROM mentors WHERE id IN (${ph})`);
      }

      // 4. Delete subjects associated with this department
      const allSubjects = await tx.all(`SELECT id, department FROM subjects${campusWhere}`, ...campusArgs);
      const subjectsToDelete = allSubjects.filter((s: any) => s.department && isMatch(s.department));
      const subjectIds = subjectsToDelete.map((s: any) => s.id);
      if (subjectIds.length > 0) {
        await runInChunks(subjectIds, (ph) => `DELETE FROM subjects WHERE id IN (${ph})`);
      }

      // 5. Finally delete the course and matching departments table rows
      await tx.run("DELETE FROM courses WHERE id = ?", id);
      await tx.run("DELETE FROM departments WHERE id = ? OR name = ?", id, courseName);

      return {
        slots: slotsToDelete.length,
        students: studentsToDelete.length,
        mentors: mentorsToDelete.length,
        subjects: subjectsToDelete.length,
      };
    });

      const deletedSummary = `Deleted: ${deletedCounts.slots} slots, ${deletedCounts.students} students, ${deletedCounts.mentors} mentors, ${deletedCounts.subjects} subjects.`;
      return NextResponse.json({ success: true, message: `Course and all associated data deleted successfully. ${deletedSummary}`, deletedCounts });
  } catch (error: any) {
    console.error("API DELETE Courses error:", error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

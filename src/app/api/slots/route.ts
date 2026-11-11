export const maxDuration = 60;

import { NextResponse } from "next/server";
import { getDb, resolveClassGroupDetails, syncMentorSubjectsAndClasses, type QueryFailure } from "@/lib/db";
import { isCohortMatch, isTimeSlotOverlap } from "@/lib/utils";
import { requireAuth } from "@/lib/authGuard";
import { generateId } from "@/lib/id";

export async function GET(request: Request) {
  try {
    const { errorResponse } = await requireAuth(request);
    if (errorResponse) return errorResponse;
    const db = await getDb();
    const { searchParams } = new URL(request.url);
    const collegeId = searchParams.get("college_id") || searchParams.get("collegeId");
    const mentorId = searchParams.get("mentorId");
    const classGroup = searchParams.get("classGroup");
    const day = searchParams.get("day");

    let sql = "SELECT * FROM slots WHERE 1=1";
    const params: any[] = [];

    if (collegeId) {
      sql += " AND college_id = ?";
      params.push(collegeId);
    }
    if (mentorId) {
      sql += " AND mentorId = ?";
      params.push(mentorId);
    }
    if (classGroup) {
      sql += " AND classGroup = ?";
      params.push(classGroup);
    }
    if (day) {
      sql += " AND day = ?";
      params.push(day);
    }

    sql += " ORDER BY day, time ASC";

    const slots = await db.all(sql, ...params);
    return NextResponse.json({ success: true, slots: slots || [] });
  } catch (error: any) {
    console.error("API GET Slots error:", error);
    return NextResponse.json({ success: false, error: error.message, slots: [] }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { auth, errorResponse } = await requireAuth(request, {
      allowedRoles: ["admin", "cm", "kam", "mentor"],
      checkCsrf: true
    });
    if (errorResponse) return errorResponse;

    const db = await getDb();
    const body = await request.json();
    const { mentorId, day, time, course, location, shift, classGroup, college_id } = body;
    const actorName = auth?.user?.name || body.actorName || "System";
    const actorRole = auth?.user?.role || body.actorRole || "User";
    const userRole = (auth?.user?.role || "").toLowerCase();
    const isRealAdmin = userRole === "admin" || userRole === "super admin";

    // Enforce campus and mentor ownership boundaries (BUG-04)
    if (userRole === "mentor") {
      const isSelf = mentorId === auth?.user?.reference_id || mentorId === auth?.user?.id;
      if (!isSelf) {
        return NextResponse.json({ success: false, message: "Unauthorized: Mentors can only create slots for themselves." }, { status: 403 });
      }
    } else if (userRole === "cm" && auth?.user?.college_id) {
      if (college_id && college_id.toLowerCase() !== auth.user.college_id.toLowerCase()) {
        return NextResponse.json({ success: false, message: "Unauthorized: You can only create slots for your assigned campus." }, { status: 403 });
      }
    }

    if (!mentorId || !day || !time || !course || !location) {
      return NextResponse.json({ success: false, message: "Missing required fields" }, { status: 400 });
    }

    const cleanLocation = location.trim();
    const activeShift = shift || "general";
    const cleanClassGroup = classGroup ? classGroup.trim() : "";

    // The three collision probes and the mentor read all key off body fields only, so
    // they ride one round trip instead of four. The mentor row serves double duty: its
    // name for the audit line and its college_id for the campus fallback below.
    const preflightFailures: QueryFailure[] = [];
    const [mentorCollisions, classCollisions, roomCollisions, mentorRows] = await db.multiQuery(
      [
        { sql: "SELECT * FROM slots WHERE mentorId = ? AND day = ?", params: [mentorId, day] },
        classGroup
          ? {
              sql: "SELECT s.*, m.name as mentorName FROM slots s JOIN mentors m ON s.mentorId = m.id WHERE LOWER(s.classGroup) = ? AND s.day = ? AND s.shift = ?" + (college_id ? " AND s.college_id = ?" : ""),
              params: college_id ? [cleanClassGroup.toLowerCase(), day, activeShift, college_id] : [cleanClassGroup.toLowerCase(), day, activeShift]
            }
          : { sql: "SELECT 1 WHERE 1=0", params: [] },
        {
          sql: "SELECT s.*, m.name as mentorName FROM slots s LEFT JOIN mentors m ON s.mentorId = m.id WHERE LOWER(s.location) = LOWER(?) AND s.day = ? AND s.shift = ?" + (college_id ? " AND s.college_id = ?" : ""),
          params: college_id ? [cleanLocation, day, activeShift, college_id] : [cleanLocation, day, activeShift]
        },
        { sql: "SELECT name, college_id FROM mentors WHERE id = ?", params: [mentorId] }
      ],
      preflightFailures
    );

    // A failed probe yields an empty slice, which reads as "nothing collides" and
    // would book a double-booking. Nothing is written unless the preflight landed.
    if (preflightFailures.length > 0) {
      return NextResponse.json(
        { success: false, message: "Could not verify that this slot is free. Please try again." },
        { status: 500 }
      );
    }

    // BUG-05: Check overlapping time ranges, not just exact string match
    const mentorCollision = mentorCollisions.find(s => isTimeSlotOverlap(s.time, time));
    const classCollision = classCollisions.find(s => isTimeSlotOverlap(s.time, time));
    const roomCollision = roomCollisions.find(s => isTimeSlotOverlap(s.time, time));
    const mentorName = mentorRows[0]?.name;

    // 1. Check Collision: Is this mentor already booked at this day and overlapping time across any shift?
    if (mentorCollision) {
      return NextResponse.json({
        success: false,
        message: `Conflict: Mentor already has class "${mentorCollision.course}" scheduled at [${day}, ${mentorCollision.time}] overlapping with requested time [${time}].`
      });
    }

    // 2. Check Collision: Is this class group already scheduled for another class at overlapping time?
    if (classCollision) {
      return NextResponse.json({
        success: false,
        message: `Conflict: Class group "${cleanClassGroup}" is already scheduled for "${classCollision.course}" with ${classCollision.mentorName} at [${day}, ${classCollision.time}] overlapping with requested time [${time}].`
      });
    }

    // 3. Check Collision: Is this room already in use by anyone at overlapping time?
    if (roomCollision) {
      return NextResponse.json({
        success: false,
        message: `Conflict: Room "${cleanLocation}" is already booked by ${roomCollision.mentorName || "another mentor"} for "${roomCollision.course}" at [${day}, ${roomCollision.time}] overlapping with requested time [${time}].`
      });
    }

    // 4. Create Slot in database
    // Resolve college_id from mentor or database if not passed
    let resolvedCollegeId = college_id;
    if (!resolvedCollegeId) {
      if (mentorRows[0]?.college_id) {
        resolvedCollegeId = mentorRows[0].college_id;
      } else {
        const firstCol = await db.get("SELECT id FROM colleges ORDER BY id ASC LIMIT 1");
        resolvedCollegeId = firstCol?.id || null;
      }
    }

    const newId = generateId("s");

    const { department, semester, year } = await resolveClassGroupDetails(db, cleanClassGroup);

    await db.run(
      "INSERT INTO slots (id, mentorId, day, time, course, location, shift, classGroup, semester, year, department, college_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      newId,
      mentorId,
      day,
      time,
      course,
      cleanLocation,
      activeShift,
      cleanClassGroup,
      semester,
      year,
      department,
      resolvedCollegeId
    );
    await syncMentorSubjectsAndClasses(db, mentorId, course, cleanClassGroup);

    // 4. Log Audit Event
    const logDesc = actorRole === "Mentor Header"
      ? `Assigned new slot [${day}, ${time}] for ${course} to ${mentorName || "Instructor"}`
      : `${mentorName || "Instructor"} self-booked empty slot [${day}, ${time}] for ${course} at ${cleanLocation}`;

    const logId = generateId("l");
    await db.run(
      "INSERT INTO audit_logs (id, type, description, actorName, actorRole, timestamp) VALUES (?, ?, ?, ?, ?, ?)",
      logId,
      actorRole === "Mentor Header" ? "assignment" : "booking",
      logDesc,
      actorName || "System",
      actorRole || "User",
      new Date().toISOString()
    );

    return NextResponse.json({
      success: true,
      slot: { id: newId, mentorId, day, time, course, location: cleanLocation }
    });
  } catch (error: any) {
    if (error?.message?.includes("idx_slots_") || error?.code === "23505" || error?.message?.includes("UNIQUE constraint")) {
      return NextResponse.json({
        success: false,
        message: "Conflict: A slot with this mentor/room at this day and time already exists."
      }, { status: 409 });
    }
    console.error("API POST Slot error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { auth, errorResponse } = await requireAuth(request, {
      allowedRoles: ["admin", "cm", "kam", "mentor"],
      checkCsrf: true
    });
    if (errorResponse) return errorResponse;

    const db = await getDb();
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    const classGroup = searchParams.get("classGroup");
    const collegeId = searchParams.get("college_id") || searchParams.get("collegeId") || auth?.user?.college_id;
    const actorName = auth?.user?.name || searchParams.get("actorName") || "System";
    const actorRole = auth?.user?.role || searchParams.get("actorRole") || "User";
    const userRole = (auth?.user?.role || "").toLowerCase();
    const isRealAdmin = userRole === "admin" || userRole === "super admin";

    if (!id && !classGroup) {
      return NextResponse.json({ success: false, message: "Missing slot id or classGroup parameter" }, { status: 400 });
    }

    if (classGroup) {
      // Mentors must not be allowed to batch-delete class timetable groups (BUG-04)
      if (userRole === "mentor") {
        return NextResponse.json({ success: false, message: "Unauthorized: Mentors cannot clear entire class timetables." }, { status: 403 });
      }

      // Campus Managers can only clear timetables for their assigned campus
      if (userRole === "cm" && auth?.user?.college_id) {
        if (collegeId && collegeId.toLowerCase() !== auth.user.college_id.toLowerCase()) {
          return NextResponse.json({ success: false, message: "Unauthorized: You can only clear timetables for your assigned campus." }, { status: 403 });
        }
      }

      if (!collegeId && !isRealAdmin) {
        return NextResponse.json({ success: false, message: "Campus (collegeId) is required to clear class timetable." }, { status: 400 });
      }

      const cleanCG = classGroup.toLowerCase().trim();
      const normCG = cleanCG.replace(/[^a-z0-9]/g, "");
      const baseCG = cleanCG.replace(/\s*\([^)]*\)/g, "").trim();
      const normBaseCG = baseCG.replace(/[^a-z0-9]/g, "");

      const allSlots = collegeId
        ? await db.all("SELECT id, classGroup, course, college_id FROM slots WHERE college_id = ?", collegeId)
        : await db.all("SELECT id, classGroup, course, college_id FROM slots");

      const matchedSlotIds = allSlots.filter(s => {
        const cg = s.classGroup || (s as any).classgroup;
        if (!cg) return false;
        const sCG = cg.toLowerCase().trim();
        const sNorm = sCG.replace(/[^a-z0-9]/g, "");
        const sBase = sCG.replace(/\s*\([^)]*\)/g, "").trim();
        const sNormBase = sBase.replace(/[^a-z0-9]/g, "");

        // Match exact, normalized base, or semantic cohort match (e.g. III BCA <-> BCA - Semester 5)
        return (
          sCG === cleanCG ||
          sNorm === normCG ||
          sBase === baseCG ||
          sNormBase === normBaseCG ||
          isCohortMatch(cg, classGroup)
        );
      }).map(s => s.id);

      if (matchedSlotIds.length === 0) {
        return NextResponse.json({
          success: true,
          count: 0,
          message: `No timetable slots found matching class group "${classGroup}".`
        });
      }

      // Detach attendance references and delete in one transaction. The detach was
      // swallowed with .catch(() => {}), so when it failed the DELETE then died on
      // the foreign key — and the error surfaced as an unexplained "delete failed"
      // with attendance rows still pointing at slots that were about to vanish.
      // Chunked inside the transaction so a college-wide clear cannot exceed
      // Postgres' 65,535 bind parameters while still committing as one unit.
      await db.transaction(async (tx) => {
        for (let i = 0; i < matchedSlotIds.length; i += 500) {
          const chunk = matchedSlotIds.slice(i, i + 500);
          const placeholders = chunk.map(() => "?").join(",");
          await tx.run(`UPDATE student_attendance SET slotId = NULL WHERE slotId IN (${placeholders})`, chunk);
          await tx.run(`DELETE FROM slots WHERE id IN (${placeholders})`, chunk);
        }
      });

      const logDesc = `Cleared timetable for class group "${classGroup}" (${matchedSlotIds.length} slots)`;
      const logId = generateId("l");
      await db.run(
        "INSERT INTO audit_logs (id, type, description, actorName, actorRole, timestamp) VALUES (?, 'release', ?, ?, ?, ?)",
        logId,
        logDesc,
        actorName,
        actorRole,
        new Date().toISOString()
      );

      return NextResponse.json({ success: true, count: matchedSlotIds.length, message: `Successfully cleared ${matchedSlotIds.length} slots for ${classGroup}.` });
    }

    const slotToDelete = await db.get("SELECT * FROM slots WHERE id = ?", id);
    if (!slotToDelete) {
      return NextResponse.json({ success: false, message: "Slot not found" }, { status: 404 });
    }

    // Enforce slot ownership & campus boundaries (BUG-04)
    if (userRole === "mentor") {
      const isOwner = slotToDelete.mentorId === auth?.user?.reference_id || slotToDelete.mentorId === auth?.user?.id;
      if (!isOwner) {
        return NextResponse.json({ success: false, message: "Unauthorized: You can only delete your own slots." }, { status: 403 });
      }
    } else if (userRole === "cm" && auth?.user?.college_id) {
      if (slotToDelete.college_id && slotToDelete.college_id.toLowerCase() !== auth.user.college_id.toLowerCase()) {
        return NextResponse.json({ success: false, message: "Unauthorized: You can only delete slots for your assigned campus." }, { status: 403 });
      }
    }

    const mentor = await db.get("SELECT name FROM mentors WHERE id = ?", slotToDelete.mentorId);

    // Detach attendance, then delete — one transaction, no swallowed failure.
    await db.transaction(async (tx) => {
      await tx.run("UPDATE student_attendance SET slotId = NULL WHERE slotId = ?", id);
      await tx.run("DELETE FROM slots WHERE id = ?", id);
    });

    // Log release
    const logDesc = `Removed assignment [${slotToDelete.day}, ${slotToDelete.time}] for ${slotToDelete.course} previously assigned to ${mentor?.name || "Instructor"}`;
    const logId = generateId("l");
    await db.run(
      "INSERT INTO audit_logs (id, type, description, actorName, actorRole, timestamp) VALUES (?, 'release', ?, ?, ?, ?)",
      logId,
      logDesc,
      actorName,
      actorRole,
      new Date().toISOString()
    );

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("API DELETE Slot error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const { auth, errorResponse } = await requireAuth(request, {
      allowedRoles: ["admin", "cm", "kam", "mentor"],
      checkCsrf: true
    });
    if (errorResponse) return errorResponse;

    const db = await getDb();
    const body = await request.json();
    const { id, mentorId, day, time, course, location, shift, classGroup, college_id } = body;
    const actorName = auth?.user?.name || body.actorName || "System";
    const actorRole = auth?.user?.role || body.actorRole || "Mentor Header";
    const userRole = (auth?.user?.role || "").toLowerCase();
    const isRealAdmin = userRole === "admin" || userRole === "super admin";

    if (!id || !mentorId || !day || !time || !course || !location) {
      return NextResponse.json({ success: false, message: "Missing required fields" }, { status: 400 });
    }

    const cleanLocation = location.trim();
    const activeShift = shift || "general";
    const cleanClassGroup = classGroup ? classGroup.trim() : "General";

    // The existence check, the three collision probes and the incoming mentor name are
    // all keyed off body fields, so they share one round trip. The slot row carries
    // its own mentor name for the audit diff, which removes a dependent follow-up read.
    const preflightFailures: QueryFailure[] = [];
    const [slotRows, mentorCollisions, classCollisions, roomCollisions, newMentorRows] = await db.multiQuery(
      [
        { sql: "SELECT s.*, m.name as mentorName FROM slots s LEFT JOIN mentors m ON s.mentorId = m.id WHERE s.id = ?", params: [id] },
        { sql: "SELECT * FROM slots WHERE mentorId = ? AND day = ? AND id != ?", params: [mentorId, day, id] },
        classGroup
          ? {
              sql: "SELECT s.*, m.name as mentorName FROM slots s JOIN mentors m ON s.mentorId = m.id WHERE LOWER(s.classGroup) = ? AND s.day = ? AND s.shift = ? AND s.id != ?" + (college_id ? " AND s.college_id = ?" : ""),
              params: college_id ? [cleanClassGroup.toLowerCase(), day, activeShift, id, college_id] : [cleanClassGroup.toLowerCase(), day, activeShift, id]
            }
          : { sql: "SELECT 1 WHERE 1=0", params: [] },
        {
          sql: "SELECT s.*, m.name as mentorName FROM slots s LEFT JOIN mentors m ON s.mentorId = m.id WHERE LOWER(s.location) = LOWER(?) AND s.day = ? AND s.shift = ? AND s.id != ?" + (college_id ? " AND s.college_id = ?" : ""),
          params: college_id ? [cleanLocation, day, activeShift, id, college_id] : [cleanLocation, day, activeShift, id]
        },
        { sql: "SELECT name, college_id FROM mentors WHERE id = ?", params: [mentorId] }
      ],
      preflightFailures
    );

    // A failed collision probe reads as "nothing collides" and would save a
    // double-booking; nothing is written unless the whole preflight landed.
    if (preflightFailures.length > 0) {
      return NextResponse.json(
        { success: false, message: "Could not verify that this slot is free. Please try again." },
        { status: 500 }
      );
    }

    // BUG-05: Check overlapping time ranges, not just exact string match
    const mentorCollision = mentorCollisions.find(s => isTimeSlotOverlap(s.time, time));
    const classCollision = classCollisions.find(s => isTimeSlotOverlap(s.time, time));
    const roomCollision = roomCollisions.find(s => isTimeSlotOverlap(s.time, time));

    // Check if slot exists
    const slotToUpdate = slotRows[0];
    if (!slotToUpdate) {
      return NextResponse.json({ success: false, message: "Slot not found" }, { status: 404 });
    }

    // Enforce slot ownership & campus boundaries (BUG-04)
    if (userRole === "mentor") {
      const isOwner = slotToUpdate.mentorId === auth?.user?.reference_id || slotToUpdate.mentorId === auth?.user?.id;
      if (!isOwner) {
        return NextResponse.json({ success: false, message: "Unauthorized: You can only edit your own slots." }, { status: 403 });
      }
      if (mentorId !== slotToUpdate.mentorId) {
        return NextResponse.json({ success: false, message: "Unauthorized: Mentors cannot reassign slots to another instructor." }, { status: 403 });
      }
    } else if (userRole === "cm" && auth?.user?.college_id) {
      if (slotToUpdate.college_id && slotToUpdate.college_id.toLowerCase() !== auth.user.college_id.toLowerCase()) {
        return NextResponse.json({ success: false, message: "Unauthorized: You can only edit slots for your assigned campus." }, { status: 403 });
      }
    }

    if (mentorCollision) {
      return NextResponse.json({
        success: false,
        message: `Conflict: Mentor already has class "${mentorCollision.course}" scheduled at [${day}, ${mentorCollision.time}] overlapping with requested time [${time}].`
      });
    }

    if (classCollision) {
      return NextResponse.json({
        success: false,
        message: `Conflict: Class group "${cleanClassGroup}" is already scheduled for "${classCollision.course}" with ${classCollision.mentorName} at [${day}, ${classCollision.time}] overlapping with requested time [${time}].`
      });
    }

    if (roomCollision) {
      return NextResponse.json({
        success: false,
        message: `Conflict: Room "${cleanLocation}" is already booked by ${roomCollision.mentorName || "another mentor"} for "${roomCollision.course}" at [${day}, ${roomCollision.time}] overlapping with requested time [${time}].`
      });
    }

    // 4. Update Slot in database
    // Resolve college_id from the mentor row already in the preflight batch, falling
    // back to the first campus only when that mentor has none.
    let resolvedCollegeId = college_id;
    if (!resolvedCollegeId) {
      if (newMentorRows[0]?.college_id) {
        resolvedCollegeId = newMentorRows[0].college_id;
      } else {
        const firstCol = await db.get("SELECT id FROM colleges ORDER BY id ASC LIMIT 1");
        resolvedCollegeId = firstCol?.id || null;
      }
    }

    const { department, semester, year } = await resolveClassGroupDetails(db, cleanClassGroup);

    await db.run(
      "UPDATE slots SET mentorId = ?, day = ?, time = ?, course = ?, location = ?, shift = ?, classGroup = ?, semester = ?, year = ?, department = ?, college_id = ? WHERE id = ?",
      mentorId,
      day,
      time,
      course,
      cleanLocation,
      activeShift,
      cleanClassGroup,
      semester,
      year,
      department,
      resolvedCollegeId,
      id
    );
    await syncMentorSubjectsAndClasses(db, mentorId, course, cleanClassGroup);

    // 4. Log Audit Event
    const oldMentorName = slotToUpdate.mentorName;
    const newMentorName = newMentorRows[0]?.name;

    let changeDesc = `Updated slot [${day}, ${time}]: `;
    const changes: string[] = [];
    if (slotToUpdate.course !== course) changes.push(`course from "${slotToUpdate.course}" to "${course}"`);
    if (slotToUpdate.location !== cleanLocation) changes.push(`room from "${slotToUpdate.location}" to "${cleanLocation}"`);
    if (slotToUpdate.mentorId !== mentorId) changes.push(`mentor from "${oldMentorName || "Unknown"}" to "${newMentorName || "Unknown"}"`);
    if (slotToUpdate.day !== day) changes.push(`day from "${slotToUpdate.day}" to "${day}"`);
    if (slotToUpdate.time !== time) changes.push(`time from "${slotToUpdate.time}" to "${time}"`);
    if (slotToUpdate.shift !== activeShift) changes.push(`shift from "${slotToUpdate.shift}" to "${activeShift}"`);

    if (changes.length > 0) {
      changeDesc += changes.join(", ");
    } else {
      changeDesc += "no changes made.";
    }

    const logId = generateId("l");
    await db.run(
      "INSERT INTO audit_logs (id, type, description, actorName, actorRole, timestamp) VALUES (?, 'assignment', ?, ?, ?, ?)",
      logId,
      changeDesc,
      actorName || "System",
      actorRole || "Mentor Header",
      new Date().toISOString()
    );

    // DATA_FLOW_AUDIT D2: return the authoritative updated row (with mentor name)
    // so the client patches state with server-normalized values (shift, classGroup,
    // resolved college) instead of its own form values.
    const updatedSlot = await db.get(
      "SELECT s.*, m.name as mentorName FROM slots s LEFT JOIN mentors m ON s.mentorId = m.id WHERE s.id = ?",
      id
    );

    return NextResponse.json({ success: true, slot: updatedSlot || null });
  } catch (error: any) {
    console.error("API PUT Slot error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}


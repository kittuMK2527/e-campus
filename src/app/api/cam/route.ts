export const maxDuration = 60;

import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireAuth } from "@/lib/authGuard";
import { hashPassword } from "@/lib/auth";
import { DEFAULT_PASSWORD } from "@/lib/authConfig";

// GET /api/cam?id=cam_1  — returns CAM profile + their college's data
export async function GET(request: Request) {
  try {
    const { errorResponse } = await requireAuth(request);
    if (errorResponse) return errorResponse;
    const db = await getDb();
    const { searchParams } = new URL(request.url);
    const camId = searchParams.get("id");

    if (!camId) {
      return NextResponse.json({ success: false, message: "CM id required" }, { status: 400 });
    }

    const cam = await db.get(`
      SELECT cm.*, c.name as college_name, c.address as college_address, k.name as kam_name
      FROM campus_managers cm
      LEFT JOIN colleges c ON cm.college_id = c.id
      LEFT JOIN kam_users k ON cm.kam_id = k.id
      WHERE cm.id = ? OR LOWER(cm.email) = ? OR cm.email = ?
    `, [camId, camId.toLowerCase(), camId]);
    if (!cam) {
      return NextResponse.json({ success: false, message: "Campus Manager not found" }, { status: 404 });
    }

    const collegeId = cam.college_id;

    // Fetch all college data concurrently (Promise.all = ~120ms vs ~450ms sequential)
    const [departments, mentors, slots, subjects] = await Promise.all([
      db.all("SELECT * FROM departments WHERE college_id = ? ORDER BY name", [collegeId]),
      db.all(
        "SELECT m.*, ? as headerName FROM mentors m WHERE m.college_id = ? ORDER BY m.department, m.name",
        [cam.name, collegeId]
      ),
      db.all("SELECT * FROM slots WHERE college_id = ?", [collegeId]),
      db.all("SELECT sub.* FROM subjects sub WHERE sub.college_id = ?", [collegeId])
    ]);

    // Stats
    const stats = {
      totalDepts: departments.length,
      totalMentors: mentors.length,
      totalSlots: slots.length,
      totalSubjects: subjects.length
    };

    return NextResponse.json({
      success: true,
      cam: { ...cam, role: "cam" },
      college: {
        id: collegeId,
        name: cam.college_name,
        address: cam.college_address
      },
      departments,
      mentors: mentors.map((m: any) => ({ ...m, role: "mentor" })),
      slots,
      subjects,
      stats
    });
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
    const { id, name, email, college_id, kam_id } = body;
    if (!id || !name || !email || !college_id || !kam_id) {
      return NextResponse.json({ success: false, message: "Missing required fields" }, { status: 400 });
    }
    const cleanId = id.trim();
    const cleanEmail = email.trim().toLowerCase();
    
    // Profile row, stale-credential sweep and the new login must land together.
    // Autocommitted, a failure between them leaves a Campus Manager with no users
    // row at all — i.e. an account that cannot sign in and shows up in the list.
    await db.transaction(async (tx) => {
      await tx.run(
        "INSERT INTO campus_managers (id, name, email, college_id, kam_id) VALUES (?, ?, ?, ?, ?)",
        cleanId, name.trim(), cleanEmail, college_id.trim(), kam_id.trim()
      );

      // Clean old credentials associated with this email
      await tx.run("DELETE FROM users WHERE LOWER(email) = ?", cleanEmail);

      // Create corresponding entry in centralized users table with hashed default password
      const now = new Date().toISOString();
      const defaultHashed = hashPassword(DEFAULT_PASSWORD);
      await tx.run(
        `INSERT INTO users (id, email, password_hash, role, reference_id, status, must_change_password, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [cleanId, cleanEmail, defaultHashed, "cam", cleanId, "Active", 1, now, now]
      );
    });

    return NextResponse.json({ success: true, message: "Campus Manager created successfully" });
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
    const { id, name, email, college_id, kam_id } = body;
    if (!id || !name || !email || !college_id || !kam_id) {
      return NextResponse.json({ success: false, message: "Missing required fields" }, { status: 400 });
    }
    const cleanEmail = email.trim().toLowerCase();

    await db.transaction(async (tx) => {
      await tx.run(
        "UPDATE campus_managers SET name = ?, email = ?, college_id = ?, kam_id = ? WHERE id = ?",
        name.trim(), cleanEmail, college_id.trim(), kam_id.trim(), id
      );

      // Clean old credentials associated with this email (excluding the current CAM ID)
      await tx.run("DELETE FROM users WHERE LOWER(email) = ? AND reference_id != ?", [cleanEmail, id]);

      // Check existing user to preserve password_hash
      const existingUser = await tx.get("SELECT password_hash FROM users WHERE role = 'cam' AND reference_id = ?", id);
      const passHashToKeep = existingUser?.password_hash || hashPassword(DEFAULT_PASSWORD);
      const mustChange = existingUser?.password_hash ? 0 : 1;

      const now = new Date().toISOString();
      await tx.run(
        `INSERT INTO users (id, email, password_hash, role, reference_id, status, must_change_password, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (id) DO UPDATE SET
           email = EXCLUDED.email,
           password_hash = EXCLUDED.password_hash,
           role = EXCLUDED.role,
           reference_id = EXCLUDED.reference_id,
           status = EXCLUDED.status,
           must_change_password = EXCLUDED.must_change_password,
           updated_at = EXCLUDED.updated_at`,
        [id, cleanEmail, passHashToKeep, "cam", id, "Active", mustChange, now, now]
      );
    });

    return NextResponse.json({ success: true, message: "Campus Manager updated successfully" });
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
      return NextResponse.json({ success: false, message: "Campus Manager id required" }, { status: 400 });
    }
    
    // Delete from both users and campus_managers — together, or the second half
    // stranding an orphan login that still authenticates against a deleted manager.
    await db.transaction(async (tx) => {
      await tx.run("DELETE FROM users WHERE role = 'cam' AND reference_id = ?", id);
      await tx.run("DELETE FROM campus_managers WHERE id = ?", id);
    });
    
    return NextResponse.json({ success: true, message: "Campus Manager deleted successfully" });
  } catch (error: any) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

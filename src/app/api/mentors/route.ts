export const maxDuration = 60;

import { NextResponse } from "next/server";
import { getDb, allCapped, syncMentorSubjectGroups } from "@/lib/db";
import { requireAuth } from "@/lib/authGuard";
import { hashPassword } from "@/lib/auth";
import { DEFAULT_PASSWORD } from "@/lib/authConfig";

export async function GET(request: Request) {
  try {
    const { errorResponse } = await requireAuth(request);
    if (errorResponse) return errorResponse;
    const db = await getDb();
    const { searchParams } = new URL(request.url);
    const group = searchParams.get("group");
    const collegeId = searchParams.get("collegeId");

    if (group) {
      const cleanGroup = group.toLowerCase().trim();
      const countRes = await db.get(
        `SELECT COUNT(*) as count FROM mentors 
         WHERE LOWER(COALESCE(mentor_group, subject_group, department, '')) LIKE ?`,
        [`%${cleanGroup}%`]
      );
      const mentorsInGroup = await allCapped(
        db,
        `SELECT * FROM mentors
         WHERE LOWER(COALESCE(mentor_group, subject_group, department, '')) LIKE ?`,
        [`%${cleanGroup}%`]
      );
      return NextResponse.json({ success: true, group, count: countRes?.count || 0, mentors: mentorsInGroup });
    }

    const mentorSql = collegeId ? "SELECT * FROM mentors WHERE college_id = ?" : "SELECT * FROM mentors";
    const mentors = await allCapped(db, mentorSql, collegeId ? [collegeId] : []);

    return NextResponse.json({ success: true, mentors });
  } catch (error: any) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { errorResponse } = await requireAuth(request, { allowedRoles: ["admin", "cm"] });
    if (errorResponse) return errorResponse;
    const db = await getDb();
    const body = await request.json();
    const { id, name, email, department, avatar, subjects, classes, college_id, subject_group, mentor_group } = body;
    const unifiedGroup = (mentor_group || subject_group || department || "").trim() || null;

    if (!id || !name || !email || !avatar) {
      return NextResponse.json({ success: false, message: "Missing required fields" }, { status: 400 });
    }

    const cleanEmail = email.toLowerCase().trim();

    // Profile row, stale-credential sweep and the login must commit together.
    // Autocommitted, a failure between them leaves a mentor listed in the UI with
    // no users row, i.e. an account that can never sign in.
    await db.transaction(async (tx) => {
      await tx.run(
        `INSERT INTO mentors (id, name, email, department, avatar, subjects, classes, college_id, subject_group, mentor_group) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        id, name, cleanEmail, unifiedGroup, avatar, subjects || "", classes || "", college_id || null, unifiedGroup, unifiedGroup
      );

      // Clean old credentials associated with this email
      await tx.run("DELETE FROM users WHERE LOWER(email) = ?", cleanEmail);

      // Create corresponding entry in centralized users table with hashed default password
      const now = new Date().toISOString();
      const defaultHashed = hashPassword(DEFAULT_PASSWORD);
      await tx.run(
        `INSERT INTO users (id, email, password_hash, role, reference_id, status, must_change_password, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, cleanEmail, defaultHashed, "mentor", id, "Active", 1, now, now]
      );
    });

    await syncMentorSubjectGroups(db);

    return NextResponse.json({ success: true, message: "Mentor created successfully." });
  } catch (error: any) {
    console.error("API POST Mentors error:", error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const { errorResponse } = await requireAuth(request, { allowedRoles: ["admin", "cm"] });
    if (errorResponse) return errorResponse;
    const db = await getDb();
    const body = await request.json();
    const { id, name, email, department, avatar, subjects, classes, college_id, subject_group, mentor_group } = body;
    const unifiedGroup = (mentor_group || subject_group || department || "").trim() || null;

    if (!id || !name || !email || !avatar) {
      return NextResponse.json({ success: false, message: "Missing required fields" }, { status: 400 });
    }

    const cleanEmail = email.toLowerCase().trim();

    await db.transaction(async (tx) => {
      await tx.run(
        `UPDATE mentors SET name = ?, email = ?, department = ?, avatar = ?, subjects = ?, classes = ?, college_id = ?, subject_group = ?, mentor_group = ? WHERE id = ?`,
        name, cleanEmail, unifiedGroup, avatar, subjects || "", classes || "", college_id || null, unifiedGroup, unifiedGroup, id
      );

      // Clean old credentials associated with this email (excluding current Mentor ID)
      await tx.run("DELETE FROM users WHERE LOWER(email) = ? AND reference_id != ?", [cleanEmail, id]);

      // Check existing user to preserve password_hash
      const existingUser = await tx.get("SELECT password_hash FROM users WHERE role = 'mentor' AND reference_id = ?", id);
      const passHashToKeep = existingUser?.password_hash || hashPassword(DEFAULT_PASSWORD);
      const mustChange = existingUser?.password_hash ? 0 : 1;

      // Create or update centralized users table entry
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
        [id, cleanEmail, passHashToKeep, "mentor", id, "Active", mustChange, now, now]
      );
    });

    await syncMentorSubjectGroups(db);

    return NextResponse.json({ success: true, message: "Mentor updated successfully." });
  } catch (error: any) {
    console.error("API PUT Mentors error:", error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { errorResponse } = await requireAuth(request, { allowedRoles: ["admin", "cm"] });
    if (errorResponse) return errorResponse;
    const db = await getDb();
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ success: false, message: "Missing id" }, { status: 400 });
    }

    // Delete from both users and mentors — as one unit, so a half-delete cannot
    // leave a login that authenticates to a profile that no longer exists.
    await db.transaction(async (tx) => {
      await tx.run(`DELETE FROM users WHERE role = 'mentor' AND reference_id = ?`, id);
      await tx.run(`DELETE FROM mentors WHERE id = ?`, id);
    });

    return NextResponse.json({ success: true, message: "Mentor deleted successfully." });
  } catch (error: any) {
    console.error("API DELETE Mentors error:", error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

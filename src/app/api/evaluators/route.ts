export const maxDuration = 60;
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireAuth } from "@/lib/authGuard";
import { ensureMigration } from "@/lib/migrations";
import { generateId } from "@/lib/id";
import { hashPassword } from "@/lib/auth";
import { DEFAULT_PASSWORD } from "@/lib/authConfig";

export async function GET(request: Request) {
  try {
    const { auth, errorResponse } = await requireAuth(request, {
      allowedRoles: ["admin", "sme", "cm", "kam"]
    });
    if (errorResponse) return errorResponse;
    const session = auth?.user;

    await ensureMigration("sme_evaluators_table");
    const db = await getDb();
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const search = searchParams.get("search");

    // Seed defaults if empty
    const countRes = await db.get("SELECT COUNT(*) as count FROM sme_evaluators");
    if (!countRes || Number(countRes.count) === 0) {
      const now = new Date().toISOString();
      await db.run(
        `INSERT INTO sme_evaluators (id, name, email, phone, subject, department, experience_years, status, sme_approved_by, sme_approved_at, admin_approved_by, admin_approved_at, created_by, created_at, updated_at)
         VALUES 
         (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?),
         (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?),
         (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          "eval_1", "Dr. Anita Sengupta", "anita.eval@example.com", "9876543210", "Full Stack Development", "CSE", 8, "approved", "sme_1", now, "admin", now, "sme_1", now, now,
          "eval_2", "Prof. Rajesh Varma", "rajesh.eval@example.com", "9876543211", "Data Structures & Algorithms", "IT", 6, "approved_sme", "sme_1", now, null, null, "sme_1", now, now,
          "eval_3", "Ms. Divya Krishnan", "divya.eval@example.com", "9876543212", "Soft Skills & Communication", "English", 5, "pending_sme", null, null, null, null, "sme_2", now, now
        ]
      ).catch(() => {});
    }

    let sql = "SELECT * FROM sme_evaluators WHERE 1=1";
    const params: any[] = [];

    if (status && status !== "all") {
      sql += " AND status = ?";
      params.push(status);
    }
    if (search) {
      sql += " AND (LOWER(name) LIKE ? OR LOWER(email) LIKE ? OR LOWER(subject) LIKE ?)";
      const term = `%${search.toLowerCase().trim()}%`;
      params.push(term, term, term);
    }

    sql += " ORDER BY created_at DESC";

    const rows = await db.all(sql, params);

    return NextResponse.json({
      success: true,
      records: rows || [],
      userRole: session?.role || "sme"
    });
  } catch (error: any) {
    console.error("GET /api/evaluators error:", error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { auth, errorResponse } = await requireAuth(request, {
      allowedRoles: ["admin", "sme"]
    });
    if (errorResponse) return errorResponse;
    const session = auth?.user ? { role: auth.user.role, userId: auth.user.id, email: auth.user.email } : null;

    await ensureMigration("sme_evaluators_table");
    const db = await getDb();
    const body = await request.json();
    const { name, email, phone, subject, department, experience_years } = body;

    if (!name || !email) {
      return NextResponse.json({ success: false, message: "Name and email are required." }, { status: 400 });
    }

    const cleanEmail = email.toLowerCase().trim();
    const existing = await db.get("SELECT id FROM sme_evaluators WHERE LOWER(email) = ?", cleanEmail);
    if (existing) {
      return NextResponse.json({ success: false, message: "An evaluator with this email already exists." }, { status: 400 });
    }

    const id = generateId("eval");
    const now = new Date().toISOString();
    const isSme = session?.role === "sme";
    const isAdmin = session?.role === "admin";

    // 2-Tier Approval Flow:
    // If SME creates: 1st tier SME approved -> status: 'approved_sme' (waiting for 2nd tier Admin approval)
    // If Admin creates: directly fully approved -> status: 'approved'
    const status = isAdmin ? "approved" : "approved_sme";
    const smeApprovedBy = isSme ? (session?.userId || session?.email || "SME") : (isAdmin ? "admin" : null);
    const smeApprovedAt = (isSme || isAdmin) ? now : null;
    const adminApprovedBy = isAdmin ? "admin" : null;
    const adminApprovedAt = isAdmin ? now : null;

    await db.run(
      `INSERT INTO sme_evaluators (
        id, name, email, phone, subject, department, experience_years, status,
        sme_approved_by, sme_approved_at, admin_approved_by, admin_approved_at,
        created_by, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id, name.trim(), cleanEmail, phone || null, subject || null, department || null,
        Number(experience_years) || 0, status,
        smeApprovedBy, smeApprovedAt, adminApprovedBy, adminApprovedAt,
        session?.userId || "user", now, now
      ]
    );

    // If fully approved, sync to sme_users and users credentials
    if (status === "approved") {
      await syncEvaluatorToUsers(db, { id, name: name.trim(), email: cleanEmail, subject: subject || null });
    }

    return NextResponse.json({
      success: true,
      message: isAdmin
        ? "Evaluator added and fully approved."
        : "Evaluator nominated and approved at Tier 1 (SME). Forwarded to Admin for final Tier 2 approval.",
      evaluator: { id, name, email: cleanEmail, status }
    });
  } catch (error: any) {
    console.error("POST /api/evaluators error:", error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const { auth, errorResponse } = await requireAuth(request, {
      allowedRoles: ["admin", "sme"]
    });
    if (errorResponse) return errorResponse;
    const session = auth?.user ? { role: auth.user.role, userId: auth.user.id, email: auth.user.email } : null;

    await ensureMigration("sme_evaluators_table");
    const db = await getDb();
    const body = await request.json();
    const { id, action, reason } = body;

    if (!id || !action) {
      return NextResponse.json({ success: false, message: "Missing id or action." }, { status: 400 });
    }

    const evaluator = await db.get("SELECT * FROM sme_evaluators WHERE id = ?", id);
    if (!evaluator) {
      return NextResponse.json({ success: false, message: "Evaluator not found." }, { status: 404 });
    }

    const now = new Date().toISOString();
    const isSme = session?.role === "sme";
    const isAdmin = session?.role === "admin";

    if (action === "approve") {
      if (isSme && evaluator.status === "pending_sme") {
        // Tier 1 approval by SME
        await db.run(
          `UPDATE sme_evaluators SET 
             status = 'approved_sme',
             sme_approved_by = ?,
             sme_approved_at = ?,
             updated_at = ?
           WHERE id = ?`,
          [session?.userId || "sme", now, now, id]
        );
        return NextResponse.json({
          success: true,
          message: "Tier 1 (SME) approval recorded. Evaluator is now awaiting Tier 2 Admin approval.",
          status: "approved_sme"
        });
      } else if (isAdmin) {
        // Tier 2 (Final) approval by Admin
        await db.run(
          `UPDATE sme_evaluators SET 
             status = 'approved',
             admin_approved_by = ?,
             admin_approved_at = ?,
             updated_at = ?
           WHERE id = ?`,
          ["admin", now, now, id]
        );

        // Sync to users and sme_users
        await syncEvaluatorToUsers(db, evaluator);

        return NextResponse.json({
          success: true,
          message: "Evaluator successfully approved by Admin (Tier 2 Complete) and activated.",
          status: "approved"
        });
      } else {
        return NextResponse.json({
          success: false,
          message: isSme 
            ? "This evaluator is already approved at Tier 1 (SME) and is waiting for Tier 2 Admin approval."
            : "Unauthorized action."
        }, { status: 400 });
      }
    } else if (action === "reject") {
      await db.run(
        `UPDATE sme_evaluators SET 
           status = 'rejected',
           rejection_reason = ?,
           updated_at = ?
         WHERE id = ?`,
        [reason || "Rejected during review", now, id]
      );
      return NextResponse.json({
        success: true,
        message: "Evaluator nomination rejected.",
        status: "rejected"
      });
    }

    return NextResponse.json({ success: false, message: "Invalid action." }, { status: 400 });
  } catch (error: any) {
    console.error("PATCH /api/evaluators error:", error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

async function syncEvaluatorToUsers(db: any, evalData: { id: string; name: string; email: string; subject?: string }) {
  try {
    const cleanEmail = evalData.email.toLowerCase().trim();
    // Add to sme_users if not present
    await db.run(
      `INSERT INTO sme_users (id, name, email, subject)
       VALUES (?, ?, ?, ?)
       ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, subject = EXCLUDED.subject`,
      [evalData.id, evalData.name, cleanEmail, evalData.subject || "All Subjects"]
    );

    // Create login account in users table if not exists
    const existing = await db.get("SELECT id FROM users WHERE LOWER(email) = ?", cleanEmail);
    if (!existing) {
      const now = new Date().toISOString();
      await db.run(
        `INSERT INTO users (id, email, password_hash, role, reference_id, status, must_change_password, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [evalData.id, cleanEmail, hashPassword(DEFAULT_PASSWORD), "sme", evalData.id, "Active", 1, now, now]
      );
    }
  } catch (err) {
    console.error("Error syncing evaluator to users:", err);
  }
}


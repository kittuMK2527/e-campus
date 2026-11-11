export const maxDuration = 60;

import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireAuth } from "@/lib/authGuard";
import { generateId } from "@/lib/id";
import { ensureMigration } from "@/lib/migrations";
export async function GET(request: Request) {
  try {
    const { errorResponse } = await requireAuth(request);
    if (errorResponse) return errorResponse;
    const db = await getDb();
    await ensureMigration("schema_alignment_2026_10");
    const rows = await db.all("SELECT * FROM campus_issues ORDER BY escalatedAt DESC");
    const issues = rows.map((row: any) => ({ ...row, desc: row.desc_text ?? row.desc ?? "" }));
    return NextResponse.json({ success: true, issues });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { errorResponse } = await requireAuth(request, { allowedRoles: ["cm", "kam", "admin"] });
    if (errorResponse) return errorResponse;
    const db = await getDb();
    await ensureMigration("schema_alignment_2026_10");
    const body = await request.json();
    const { id, title, type, priority, desc, status, collegeId, collegeName, escalated, escalatedAt, notes } = body;

    if (!title || !type || !priority || !collegeId) {
      return NextResponse.json({ success: false, message: "Missing required fields" }, { status: 400 });
    }

    const issueId = id || generateId("i");
    await db.run(
      `INSERT INTO campus_issues 
       (id, title, type, priority, desc_text, status, collegeId, collegeName, escalated, escalatedAt, resolvedAt, notes) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (id) DO UPDATE SET
         title = EXCLUDED.title,
         type = EXCLUDED.type,
         priority = EXCLUDED.priority,
         desc_text = EXCLUDED.desc_text,
         status = EXCLUDED.status,
         collegeId = EXCLUDED.collegeId,
         collegeName = EXCLUDED.collegeName,
         escalated = EXCLUDED.escalated,
         escalatedAt = EXCLUDED.escalatedAt,
         resolvedAt = EXCLUDED.resolvedAt,
         notes = EXCLUDED.notes`,
      [
        issueId,
        title,
        type,
        priority,
        desc || null,
        status || "pending",
        collegeId,
        collegeName || null,
        escalated === undefined ? 0 : (escalated ? 1 : 0),
        escalatedAt || null,
        body.resolvedAt || null,
        notes || null
      ]
    );

    return NextResponse.json({ success: true, issue: { id: issueId, ...body, status: status || "pending" } });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const { errorResponse } = await requireAuth(request, { allowedRoles: ["cm", "kam", "admin"] });
    if (errorResponse) return errorResponse;
    const db = await getDb();
    await ensureMigration("schema_alignment_2026_10");
    const body = await request.json();
    const { id, status, resolvedAt, escalated, escalatedAt, notes } = body;

    if (!id) {
      return NextResponse.json({ success: false, message: "Missing id" }, { status: 400 });
    }

    if (status !== undefined) {
      await db.run(
        "UPDATE campus_issues SET status = ?, resolvedAt = ? WHERE id = ?",
        [status, resolvedAt || null, id]
      );
    }

    if (escalated !== undefined) {
      await db.run(
        "UPDATE campus_issues SET escalated = ?, escalatedAt = ? WHERE id = ?",
        [escalated ? 1 : 0, escalatedAt || null, id]
      );
    }

    if (notes !== undefined) {
      await db.run(
        "UPDATE campus_issues SET notes = ? WHERE id = ?",
        [notes, id]
      );
    }

    return NextResponse.json({ success: true, message: "Issue updated successfully" });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { errorResponse } = await requireAuth(request, { allowedRoles: ["cm", "kam", "admin"] });
    if (errorResponse) return errorResponse;
    const db = await getDb();
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ success: false, message: "ID parameter is required" }, { status: 400 });
    }

    await db.run("DELETE FROM campus_issues WHERE id = ?", [id]);
    return NextResponse.json({ success: true, message: "Issue deleted successfully" });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

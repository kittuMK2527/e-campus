export const maxDuration = 60;

import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { ensureMigration } from "@/lib/migrations";
import { generateId } from "@/lib/id";
import { requireAuth } from "@/lib/authGuard";

/**
 * Phase C (Demo Workflow Redesign): per-department CRUD for demo evaluation
 * compliance criteria. Each evaluation stores a JSON snapshot of these at
 * eval time (demo_sessions.checklist), so later edits never rewrite history.
 *
 * Types:
 *  - checkbox   → SME manually ticks/leaves unticked at evaluation time
 *  - score_rule → auto-evaluated against the final marks (threshold on `scale`)
 *
 * Default seed (all departments): tracker sheet updated, weekly plan submitted,
 * demo taken per the weekly plan, final mark >= 3.5 (scale 5), mentor certification program.
 */

const DEFAULT_LABELS = [
  { label: "Tracker sheet updated", type: "checkbox" },
  { label: "Weekly plan submitted", type: "checkbox" },
  { label: "Demo taken as per the weekly plan", type: "checkbox" },
  { label: "Final evaluation mark at or above threshold", type: "score_rule", threshold: 3.5, scale: 5 },
  { label: "Mentor certification program", type: "checkbox" },
];

async function seedDefaults(db: any, department: string) {
  // Self-heal: rows seeded before the is_system flag existed are marked fixed
  await db.run(
    "UPDATE demo_evaluation_criteria SET is_system = 1 WHERE department = ? AND created_by = 'system-seed' AND is_system = 0",
    [department]
  ).catch(() => {});

  const existing = await db.get(
    "SELECT COUNT(*) AS n FROM demo_evaluation_criteria WHERE department = ?",
    [department]
  );
  if (existing && Number(existing.n) > 0) return;
  // is_system = 1 → the four mandatory compliance checks are FIXED: they cannot
  // be edited or deleted by the evaluator. CRUD applies only to criteria the
  // SME creates on top of these. One statement, so a department never holds half a set.
  const seedRows = DEFAULT_LABELS.map((d, i) => [
    generateId("dec"), department, d.label, d.type,
    (d as any).threshold ?? null, (d as any).scale ?? null, 1, 1, i, "system-seed"
  ]);
  await db.run(
    `INSERT INTO demo_evaluation_criteria (
      id, department, label, type, threshold, scale, is_system, is_active, sort_order, created_by
    ) VALUES ${seedRows.map(() => "(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").join(", ")}`,
    seedRows.flat()
  );
}

export async function GET(request: Request) {
  try {
    const { errorResponse } = await requireAuth(request);
    if (errorResponse) return errorResponse;

    const db = await getDb();
    await ensureMigration("demo_evaluation_criteria");
    await ensureMigration("demo_eval_criteria_mentor_cert_v1").catch(() => {});

    const { searchParams } = new URL(request.url);
    const department = searchParams.get("department");

    // No .catch(() => []): an empty checklist would let an SME evaluate a demo without a
    // single compliance check, so a failed read has to surface as an error.
    let rows: any[];
    if (department && department !== "All") {
      rows = await db.all(
        "SELECT * FROM demo_evaluation_criteria WHERE department = ? AND is_active = 1 ORDER BY sort_order ASC, created_at ASC",
        [department]
      );
      if (!rows || rows.length === 0) {
        await seedDefaults(db, department);
        rows = await db.all(
          "SELECT * FROM demo_evaluation_criteria WHERE department = ? AND is_active = 1 ORDER BY sort_order ASC, created_at ASC",
          [department]
        );
      }
    } else {
      rows = await db.all(
        "SELECT * FROM demo_evaluation_criteria WHERE is_active = 1 ORDER BY department ASC, sort_order ASC, created_at ASC"
      );
    }

    return NextResponse.json({ success: true, criteria: rows });
  } catch (err: any) {
    console.error("GET /api/demo-eval-criteria error:", err);
    return NextResponse.json({ success: false, message: err?.message || "Failed to fetch criteria" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { auth, errorResponse } = await requireAuth(request, { allowedRoles: ["sme", "L and D", "admin"] });
    if (errorResponse) return errorResponse;

    // The panel used to post its own display name, and every audit row claimed an
    // "SME" had changed the criteria even when L&D or an admin did it.
    const actorName = auth!.user.name || auth!.user.email;
    const actorRole = auth!.user.role;

    const db = await getDb();
    await ensureMigration("demo_evaluation_criteria");
    await ensureMigration("demo_eval_criteria_mentor_cert_v1").catch(() => {});

    const body = await request.json();
    const { action } = body;

    // ── Seed defaults for a department (idempotent) ──────────────────────
    if (action === "seed") {
      const { department } = body;
      if (!department) {
        return NextResponse.json({ success: false, message: "Missing department" }, { status: 400 });
      }
      await seedDefaults(db, department);
      return NextResponse.json({ success: true, message: `Default criteria ensured for ${department}.` });
    }

    // ── Create ───────────────────────────────────────────────────────────
    if (action === "create") {
      const { department, label, type, threshold, scale } = body;
      if (!department || !label || !type) {
        return NextResponse.json({ success: false, message: "Missing department, label or type" }, { status: 400 });
      }
      if (!["checkbox", "score_rule"].includes(type)) {
        return NextResponse.json({ success: false, message: "Invalid criteria type" }, { status: 400 });
      }
      if (type === "score_rule" && (threshold === undefined || threshold === null)) {
        return NextResponse.json({ success: false, message: "score_rule criteria require a threshold" }, { status: 400 });
      }

      // Quoted alias — Postgres folds a bare `AS maxOrder` to `maxorder`, which would
      // leave nextOrder at 0 and flatten every department's criteria ordering.
      const maxRow = await db.get(
        'SELECT COALESCE(MAX(sort_order), -1) AS "maxOrder" FROM demo_evaluation_criteria WHERE department = ?',
        [department]
      );
      const nextOrder = Number(maxRow?.maxOrder ?? -1) + 1;

      const id = generateId("dec");
      await db.run(
        `INSERT INTO demo_evaluation_criteria (id, department, label, type, threshold, scale, is_active, sort_order, created_by, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`,
        [id, department, label, type, threshold ?? null, scale ?? null, nextOrder, actorName, new Date().toISOString()]
      );

      const auditId = generateId("audit");
      await db.run(
        `INSERT INTO audit_logs (id, type, description, actorName, actorRole, timestamp)
         VALUES (?, 'demo_criteria_changed', ?, ?, ?, ?)`,
        [auditId, `Added evaluation criterion "${label}" (${type}) for department ${department}.`, actorName, actorRole, new Date().toISOString()]
      ).catch(() => {});

      const created = await db.get("SELECT * FROM demo_evaluation_criteria WHERE id = ?", [id]);
      return NextResponse.json({ success: true, criterion: created, message: "Criterion added." });
    }

    // ── Update ───────────────────────────────────────────────────────────
    if (action === "update") {
      const { id, label, type, threshold, scale, isActive, sortOrder } = body;
      if (!id) {
        return NextResponse.json({ success: false, message: "Missing criterion id" }, { status: 400 });
      }
      const existing = await db.get("SELECT * FROM demo_evaluation_criteria WHERE id = ?", [id]);
      if (!existing) {
        return NextResponse.json({ success: false, message: "Criterion not found" }, { status: 404 });
      }
      if (existing.is_system === 1) {
        return NextResponse.json({ success: false, message: "This is a fixed system criterion and cannot be modified." }, { status: 403 });
      }

      await db.run(
        `UPDATE demo_evaluation_criteria
         SET label = COALESCE(?, label), type = COALESCE(?, type), threshold = ?, scale = ?,
             is_active = COALESCE(?, is_active), sort_order = COALESCE(?, sort_order), updated_at = ?
         WHERE id = ?`,
        [
          label ?? null,
          type ?? null,
          threshold !== undefined ? threshold : existing.threshold,
          scale !== undefined ? scale : existing.scale,
          isActive !== undefined ? (isActive ? 1 : 0) : null,
          sortOrder ?? null,
          new Date().toISOString(),
          id
        ]
      );

      const auditId = generateId("audit");
      await db.run(
        `INSERT INTO audit_logs (id, type, description, actorName, actorRole, timestamp)
         VALUES (?, 'demo_criteria_changed', ?, ?, ?, ?)`,
        [auditId, `Updated evaluation criterion "${label || existing.label}" for department ${existing.department}.`, actorName, actorRole, new Date().toISOString()]
      ).catch(() => {});

      const updated = await db.get("SELECT * FROM demo_evaluation_criteria WHERE id = ?", [id]);
      return NextResponse.json({ success: true, criterion: updated, message: "Criterion updated." });
    }

    // ── Delete (soft) ────────────────────────────────────────────────────
    if (action === "delete") {
      const { id } = body;
      if (!id) {
        return NextResponse.json({ success: false, message: "Missing criterion id" }, { status: 400 });
      }
      const existing = await db.get("SELECT * FROM demo_evaluation_criteria WHERE id = ?", [id]);
      if (!existing) {
        return NextResponse.json({ success: false, message: "Criterion not found" }, { status: 404 });
      }
      if (existing.is_system === 1) {
        return NextResponse.json({ success: false, message: "This is a fixed system criterion and cannot be deleted." }, { status: 403 });
      }
      await db.run(
        "UPDATE demo_evaluation_criteria SET is_active = 0, updated_at = ? WHERE id = ?",
        [new Date().toISOString(), id]
      );

      const auditId = generateId("audit");
      await db.run(
        `INSERT INTO audit_logs (id, type, description, actorName, actorRole, timestamp)
         VALUES (?, 'demo_criteria_changed', ?, ?, ?, ?)`,
        [auditId, `Deleted evaluation criterion "${existing.label}" for department ${existing.department}.`, actorName, actorRole, new Date().toISOString()]
      ).catch(() => {});

      return NextResponse.json({ success: true, message: "Criterion deleted." });
    }

    return NextResponse.json({ success: false, message: "Invalid action" }, { status: 400 });
  } catch (err: any) {
    console.error("POST /api/demo-eval-criteria error:", err);
    return NextResponse.json({ success: false, message: err?.message || "Failed to manage criteria" }, { status: 500 });
  }
}

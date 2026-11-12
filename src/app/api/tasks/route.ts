export const maxDuration = 60;

import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireAuth } from "@/lib/authGuard";
import { generateId } from "@/lib/id";
import { ensureMigration } from "@/lib/migrations";
import { dispatchSystemNotification } from "@/lib/notifications";

export async function GET(request: Request) {
  try {
    const { errorResponse } = await requireAuth(request);
    if (errorResponse) return errorResponse;
    const db = await getDb();
    const tasks = await db.all("SELECT * FROM kam_tasks ORDER BY created_at DESC");
    return NextResponse.json({ success: true, tasks });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { errorResponse } = await requireAuth(request, { allowedRoles: ["kam", "admin"] });
    if (errorResponse) return errorResponse;
    const db = await getDb();
    await ensureMigration("schema_alignment_2026_10");
    const body = await request.json();
    const { id, title, collegeId, assigned_cam_id, description, priority, status, dueDate } = body;

    if (!title || !dueDate) {
      return NextResponse.json({ success: false, message: "Missing required fields" }, { status: 400 });
    }

    const taskId = id || generateId("t");
    await db.run(
      `INSERT INTO kam_tasks (id, title, collegeId, assigned_cam_id, description, priority, status, dueDate) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (id) DO UPDATE SET
         title = EXCLUDED.title,
         collegeId = EXCLUDED.collegeId,
         assigned_cam_id = EXCLUDED.assigned_cam_id,
         description = EXCLUDED.description,
         priority = EXCLUDED.priority,
         status = EXCLUDED.status,
         dueDate = EXCLUDED.dueDate`,
      [taskId, title, collegeId || null, assigned_cam_id || null, description || null, priority || "medium", status || "pending", dueDate]
    );

    if (assigned_cam_id || collegeId) {
      try {
        await dispatchSystemNotification(db, {
          userIds: assigned_cam_id ? [assigned_cam_id] : undefined,
          roles: !assigned_cam_id ? ["cm"] : undefined,
          collegeId: collegeId || null,
          title: `New Task Assigned: ${title}`,
          message: `Task "${title}" (Priority: ${priority || "medium"}) has been assigned. Due date: ${dueDate}.`,
          link: "/cm/tasks",
          type: priority === "high" || priority === "urgent" ? "warning" : "info",
          domain: "tasks",
          action: "assigned",
          payload: { taskId, title, priority, dueDate, collegeId }
        });
      } catch (taskNotifErr) {
        console.error("[tasks] dispatch notification error:", taskNotifErr);
      }
    }

    return NextResponse.json({ success: true, task: { id: taskId, title, collegeId, assigned_cam_id, description, priority, status, dueDate } });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const { errorResponse } = await requireAuth(request, { allowedRoles: ["kam", "admin"] });
    if (errorResponse) return errorResponse;
    const db = await getDb();
    await ensureMigration("schema_alignment_2026_10");
    const body = await request.json();
    const { id, status, title, priority, dueDate, assigned_cam_id, description } = body;

    if (!id) {
      return NextResponse.json({ success: false, message: "Task ID is required" }, { status: 400 });
    }

    if (status) {
      await db.run("UPDATE kam_tasks SET status = ? WHERE id = ?", [status, id]);
    }
    if (assigned_cam_id !== undefined) {
      await db.run("UPDATE kam_tasks SET assigned_cam_id = ? WHERE id = ?", [assigned_cam_id, id]);
    }
    if (description !== undefined) {
      await db.run("UPDATE kam_tasks SET description = ? WHERE id = ?", [description, id]);
    }
    if (title) {
      await db.run("UPDATE kam_tasks SET title = ? WHERE id = ?", [title, id]);
    }
    if (priority) {
      await db.run("UPDATE kam_tasks SET priority = ? WHERE id = ?", [priority, id]);
    }
    if (dueDate) {
      await db.run("UPDATE kam_tasks SET dueDate = ? WHERE id = ?", [dueDate, id]);
    }

    const updated = await db.get("SELECT * FROM kam_tasks WHERE id = ?", [id]);

    if (updated?.assigned_cam_id) {
      try {
        await dispatchSystemNotification(db, {
          userIds: [updated.assigned_cam_id],
          title: `Task Updated: ${updated.title}`,
          message: status ? `Task status updated to: ${status}.` : `Task details updated.`,
          link: "/cm/tasks",
          type: "info",
          domain: "tasks",
          action: "updated",
          payload: { taskId: id, status, title: updated.title }
        });
      } catch (_) {}
    }

    return NextResponse.json({ success: true, task: updated });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { errorResponse } = await requireAuth(request, { allowedRoles: ["kam", "admin"] });
    if (errorResponse) return errorResponse;
    const db = await getDb();
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ success: false, message: "Task ID is required" }, { status: 400 });
    }

    await db.run("DELETE FROM kam_tasks WHERE id = ?", [id]);
    return NextResponse.json({ success: true, message: "Task deleted successfully" });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

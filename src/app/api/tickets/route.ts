export const maxDuration = 30;

import { NextResponse } from "next/server";
import { getDb, PostgresDbAdapter } from "@/lib/db";
import { requireAuth } from "@/lib/authGuard";
import { requireKamScope } from "@/lib/kamScope";
import { fetchWithTimeout, DEFAULT_FETCH_TIMEOUT_MS } from "@/lib/net";
import { dispatchSystemNotification } from "@/lib/notifications";

const SUPABASE_REST_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://scuvqabxqqtvibjutoyj.supabase.co";
const SUPABASE_REST_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "sb_publishable_wptvdh6rVvEy2uSppa4Ckw_ozPuC6L4";

const TICKET_STATUSES = new Set(["open", "progress", "in_progress", "resolved", "closed"]);

async function resolveCmCollege(db: PostgresDbAdapter, referenceId: string, email: string, collegeId: string | null) {
  const cam = await db.get(
    `SELECT cm.college_id, c.name AS college_name
     FROM campus_managers cm
     LEFT JOIN colleges c ON cm.college_id = c.id
     WHERE cm.id = ? OR LOWER(cm.email) = ?
     LIMIT 1`,
    [referenceId, email]
  );
  if (cam?.college_id) return cam;
  if (collegeId) {
    const college = await db.get("SELECT id AS college_id, name AS college_name FROM colleges WHERE id = ?", [collegeId]);
    if (college) return college;
  }
  return null;
}

// GET /api/tickets?collegeId=all|<id> — campus help-desk tickets, scoped to the caller.
export async function GET(request: Request) {
  try {
    const { auth, errorResponse } = await requireAuth(request, { allowedRoles: ["cm", "kam", "admin"] });
    if (errorResponse) return errorResponse;

    const db = await getDb();
    const user = auth!.user;
    const { searchParams } = new URL(request.url);
    const requestedCollegeId = searchParams.get("collegeId");

    let collegeIds: string[] | null = null;

    if (user.role === "cm") {
      const cam = await resolveCmCollege(db, user.reference_id, String(user.email || "").toLowerCase(), user.college_id || null);
      if (!cam?.college_id) {
        return NextResponse.json({ success: false, message: "No campus is linked to this account." }, { status: 403 });
      }
      collegeIds = [cam.college_id];
    } else if (user.role === "kam") {
      const { scope, errorResponse: kamError } = await requireKamScope(request, db);
      if (kamError) return kamError;
      const allowed = scope!.allowedCollegeIds || [];
      if (requestedCollegeId && requestedCollegeId !== "all") {
        if (!allowed.includes(requestedCollegeId)) {
          return NextResponse.json({ success: false, message: "This campus is outside your assigned portfolio." }, { status: 403 });
        }
        collegeIds = [requestedCollegeId];
      } else {
        collegeIds = allowed;
      }
    } else if (requestedCollegeId && requestedCollegeId !== "all") {
      collegeIds = [requestedCollegeId];
    }

    let collegeNames: string[] = [];
    if (collegeIds) {
      if (collegeIds.length === 0) {
        return NextResponse.json({ success: true, tickets: [] });
      }
      const placeholders = collegeIds.map(() => "?").join(",");
      const rows = await db.all(`SELECT name FROM colleges WHERE id IN (${placeholders})`, ...collegeIds);
      collegeNames = rows.map((r: any) => String(r.name || "").trim()).filter(Boolean);
      if (collegeNames.length === 0) {
        return NextResponse.json({ success: true, tickets: [] });
      }
    }

    // Build PostgREST filters with %20-encoded names so campuses with spaces match.
    let query = "select=*&order=created_at.desc&limit=2500";
    if (collegeNames.length === 1) {
      query += `&college=ilike.*${encodeURIComponent(collegeNames[0])}*`;
    } else if (collegeNames.length > 1) {
      const orClause = collegeNames
        .map((name) => `college.ilike.*${encodeURIComponent(name)}*`)
        .join(",");
      query += `&or=(${orClause})`;
    }

    const res = await fetchWithTimeout(`${SUPABASE_REST_URL}/rest/v1/tickets?${query}`, {
      headers: {
        apikey: SUPABASE_REST_KEY,
        Authorization: `Bearer ${SUPABASE_REST_KEY}`
      },
      cache: "no-store"
    }).catch(() => null);
    if (!res) {
      return NextResponse.json({ success: false, message: `Ticket service did not respond within ${DEFAULT_FETCH_TIMEOUT_MS}ms.` }, { status: 502 });
    }
    if (!res.ok) {
      return NextResponse.json({ success: false, message: `Ticket service returned HTTP ${res.status}.` }, { status: 502 });
    }

    const tickets = await res.json();
    return NextResponse.json({ success: true, tickets: Array.isArray(tickets) ? tickets : [] });
  } catch (error: any) {
    console.error("GET /api/tickets error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

// PATCH /api/tickets — CM/admin update of a ticket's status and resolution note.
export async function PATCH(request: Request) {
  try {
    const { auth, errorResponse } = await requireAuth(request, { allowedRoles: ["cm", "admin"] });
    if (errorResponse) return errorResponse;

    const body = await request.json();
    const ticketId = String(body.id || "").trim();
    const status = String(body.status || "").trim().toLowerCase();
    const notes = typeof body.adminNote === "string" ? body.adminNote.trim() : "";

    if (!ticketId) {
      return NextResponse.json({ success: false, message: "Missing ticket id." }, { status: 400 });
    }
    if (!TICKET_STATUSES.has(status)) {
      return NextResponse.json({ success: false, message: "Unsupported ticket status." }, { status: 400 });
    }

    const user = auth!.user;
    const db = await getDb();

    if (user.role === "cm") {
      const cam = await resolveCmCollege(db, user.reference_id, String(user.email || "").toLowerCase(), user.college_id || null);
      if (!cam?.college_name) {
        return NextResponse.json({ success: false, message: "No campus is linked to this account." }, { status: 403 });
      }
      const checkRes = await fetchWithTimeout(
        `${SUPABASE_REST_URL}/rest/v1/tickets?id=eq.${encodeURIComponent(ticketId)}&select=id,college&limit=1`,
        {
          headers: { apikey: SUPABASE_REST_KEY, Authorization: `Bearer ${SUPABASE_REST_KEY}` },
          cache: "no-store"
        }
      );
      if (!checkRes.ok) {
        return NextResponse.json({ success: false, message: `Ticket service returned HTTP ${checkRes.status}.` }, { status: 502 });
      }
      const existing = await checkRes.json();
      const ticketCollege = String(existing?.[0]?.college || "").toLowerCase().trim();
      const ownCollege = String(cam.college_name || "").toLowerCase().trim();
      if (!existing?.length) {
        return NextResponse.json({ success: false, message: "Ticket not found." }, { status: 404 });
      }
      if (!ticketCollege.includes(ownCollege) && !ownCollege.includes(ticketCollege)) {
        return NextResponse.json({ success: false, message: "This ticket belongs to another campus." }, { status: 403 });
      }
    }

    const nowIso = new Date().toISOString();
    const payload: Record<string, any> = { status, updated_at: nowIso };
    if (notes) payload.admin_note = notes;
    if (status === "resolved" || status === "closed") {
      payload.closed_by = user.name || "Campus Manager";
      payload.closed_at = nowIso;
    }

    const res = await fetchWithTimeout(`${SUPABASE_REST_URL}/rest/v1/tickets?id=eq.${encodeURIComponent(ticketId)}`, {
      method: "PATCH",
      headers: {
        apikey: SUPABASE_REST_KEY,
        Authorization: `Bearer ${SUPABASE_REST_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=representation"
      },
      body: JSON.stringify(payload),
      cache: "no-store"
    });
    if (!res.ok) {
      return NextResponse.json({ success: false, message: `Ticket service returned HTTP ${res.status}.` }, { status: 502 });
    }

    const updated = await res.json();
    const updatedTicket = Array.isArray(updated) ? updated[0] : null;
    if (updatedTicket) {
      const creatorId = updatedTicket.user_id || updatedTicket.created_by || updatedTicket.email || updatedTicket.user_email;
      if (creatorId) {
        try {
          await dispatchSystemNotification(db, {
            userIds: [String(creatorId)],
            title: `Ticket ${status === "resolved" ? "Resolved" : "Updated"}: ${updatedTicket.title || updatedTicket.subject || ticketId}`,
            message: `Your ticket has been marked as ${status}${notes ? `: ${notes}` : "."}`,
            link: "/cm/tickets",
            type: status === "resolved" ? "success" : "info",
            domain: "tickets",
            action: "status_changed",
            payload: { ticketId, status, notes }
          });
        } catch (ticketNotifErr) {
          console.error("[tickets] dispatch notification error:", ticketNotifErr);
        }
      }
    }

    return NextResponse.json({ success: true, tickets: Array.isArray(updated) ? updated : [] });
  } catch (error: any) {
    console.error("PATCH /api/tickets error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

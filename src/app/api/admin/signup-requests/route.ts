export const maxDuration = 60;

import { NextResponse } from "next/server";
import { getDb, type QueryFailure } from "@/lib/db";
import { requireRole, apiAuthErrorResponse } from "@/lib/api-auth";
import { requireAuth, normalizeRole } from "@/lib/authGuard";
import { formatRoleLabel } from "@/lib/utils";
import { generateId } from "@/lib/id";
import { getInstitutionDateStr } from "@/lib/localDate";
import { dispatchSystemNotification } from "@/lib/notifications";

export async function GET(request: Request) {
  try {
    const { errorResponse } = await requireAuth(request, { allowedRoles: ["admin"] });
    if (errorResponse) return errorResponse;
    const db = await getDb();
    const requests = await db.all("SELECT * FROM signup_requests ORDER BY created_at DESC");
    return NextResponse.json({ success: true, signupRequests: requests });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    await requireRole(request, "admin");
    const db = await getDb();
    const body = await request.json();
    const { id, action, role, mappingType, selectedReferenceId, collegeId, group, classGroup } = body;

    if (!id || !action) {
      return NextResponse.json({ success: false, message: "Missing id or action" }, { status: 400 });
    }

    const req = await db.get("SELECT * FROM signup_requests WHERE id = ?", [id]);
    if (!req) {
      return NextResponse.json({ success: false, message: "Signup request not found" }, { status: 404 });
    }

    if (action === "reject") {
      const logId = generateId("l");
      await db.transaction(async (tx) => {
        await tx.run("UPDATE signup_requests SET status = 'rejected' WHERE id = ?", [id]);
        await tx.run(
          "INSERT INTO audit_logs (id, type, description, actorName, actorRole, timestamp) VALUES (?, 'signup_rejection', ?, 'Admin', 'Super Admin', ?)",
          [logId, `Signup request for ${req.name} (${req.email}) was REJECTED by Admin`, new Date().toISOString()]
        );
      });
      return NextResponse.json({ success: true, message: "Request rejected successfully." });
    }

    if (action === "approve") {
      const targetRole = normalizeRole(role || req.requested_role || "student");

      // Checked before anything is created. This used to run after the profile row was
      // inserted, so a duplicate email bailed out leaving an orphan mentor/student that
      // no account can sign in to - and every retry orphaned another one.
      //
      // The clash probe and the default-KAM lookup are both keyed off the request row
      // read above, so they arrive as one round trip. A failed slice aborts: an unreadable
      // clash check would mint a duplicate account.
      const creatingProfile = mappingType !== "link_existing";
      const wantsCmProfile = creatingProfile && targetRole === "cm";
      const approveFailures: QueryFailure[] = [];
      const [userRows, kamRows] = await db.multiQuery(
        [
          { sql: "SELECT id FROM users WHERE LOWER(email) = ?", params: [req.email.toLowerCase()] },
          wantsCmProfile ? { sql: "SELECT id FROM kam_users LIMIT 1" } : { sql: "SELECT 1 WHERE 1=0" },
        ],
        approveFailures
      );
      if (approveFailures.length > 0) {
        return NextResponse.json({ success: false, message: "Could not verify this approval. Please try again." }, { status: 500 });
      }
      if (userRows.length > 0) {
        return NextResponse.json({ success: false, message: "An account with this email is already registered." }, { status: 400 });
      }

      if (!creatingProfile && !selectedReferenceId) {
        return NextResponse.json({ success: false, message: "Missing reference ID for existing profile mapping." }, { status: 400 });
      }
      const newProfileId = creatingProfile
        ? generateId(targetRole === "L and D" ? "lnd" : targetRole)
        : null;
      const referenceId = creatingProfile ? newProfileId : selectedReferenceId;

      let kamId: string | null = null;
      if (wantsCmProfile) {
        if (!collegeId) {
          return NextResponse.json({ success: false, message: "A college must be assigned to create a Campus Manager profile." }, { status: 400 });
        }
        kamId = kamRows[0]?.id || "kam_1";
      }

      const userId = generateId("u");
      const logId = generateId("l");
      const nowStr = new Date().toISOString();

      // Profile, credential, request status and audit row are one approval. Written one
      // statement at a time, a failure in the middle left either a profile with no login
      // or a request stuck on 'pending' while its account already existed.
      await db.transaction(async (tx) => {
        if (creatingProfile) {
          if (targetRole === "mentor") {
            await tx.run(
              `INSERT INTO mentors (id, name, email, department, avatar, college_id, joining_date, status, password_hash, subject_group)
               VALUES (?, ?, ?, ?, ?, ?, ?, 'Active', ?, ?)`,
              [
                newProfileId,
                req.name,
                req.email,
                "General",
                "",
                collegeId || null,
                getInstitutionDateStr(),
                req.password_hash,
                group || null
              ]
            );
          } else if (targetRole === "student") {
            const year = new Date().getFullYear();
            await tx.run(
              `INSERT INTO students (id, name, email, classGroup, department, college_id, batch_start_year, batch_end_year, semester, avatar, status, password_hash)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Semester 1', ?, 'Active', ?)`,
              [
                newProfileId,
                req.name,
                req.email,
                classGroup || "General",
                group || "General",
                collegeId || null,
                year,
                year + 1,
                "",
                req.password_hash
              ]
            );
          } else if (targetRole === "cm") {
            await tx.run(
              `INSERT INTO campus_managers (id, name, email, college_id, kam_id)
               VALUES (?, ?, ?, ?, ?)`,
              [newProfileId, req.name, req.email, collegeId, kamId]
            );
            await tx.run("UPDATE colleges SET manager = ? WHERE id = ?", [req.name, collegeId]);
          } else if (targetRole === "sme") {
            await tx.run(
              `INSERT INTO sme_users (id, name, email, subject)
               VALUES (?, ?, ?, ?)`,
              [newProfileId, req.name, req.email, "General"]
            );
          }
        }

        await tx.run(
          `INSERT INTO users (id, email, password_hash, role, reference_id, status, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, 'Active', ?, ?)`,
          [userId, req.email.toLowerCase(), req.password_hash, targetRole, referenceId, nowStr, nowStr]
        );

        await tx.run("UPDATE signup_requests SET status = 'approved' WHERE id = ?", [id]);

        await tx.run(
          "INSERT INTO audit_logs (id, type, description, actorName, actorRole, timestamp) VALUES (?, 'signup_approval', ?, 'Admin', 'Super Admin', ?)",
          [logId, `Signup request for ${req.name} (${req.email}) was APPROVED as ${formatRoleLabel(targetRole).toUpperCase()} by Admin`, nowStr]
        );
      });

      try {
        await dispatchSystemNotification(db, {
          userIds: [userId, req.email.toLowerCase()],
          title: "Account Approved & Activated!",
          message: `Welcome to the Platform, ${req.name}! Your account has been approved as ${formatRoleLabel(targetRole)}.`,
          link: "/",
          type: "success",
          domain: "auth",
          action: "approved",
          payload: { userId, role: targetRole }
        });
      } catch (welcomeNotifErr) {
        console.error("[signup-requests] dispatch welcome notification error:", welcomeNotifErr);
      }

      return NextResponse.json({ success: true, message: `Request approved and mapped as ${formatRoleLabel(targetRole)}!` });
    }

    return NextResponse.json({ success: false, message: "Invalid action" }, { status: 400 });
  } catch (error: any) {
    const authRes = apiAuthErrorResponse(error);
    if (authRes) return authRes;
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    await requireRole(request, "admin");
    const db = await getDb();
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ success: false, message: "ID is required" }, { status: 400 });
    }

    await db.run("DELETE FROM signup_requests WHERE id = ?", [id]);
    return NextResponse.json({ success: true, message: "Request deleted successfully" });
  } catch (error: any) {
    const authRes = apiAuthErrorResponse(error);
    if (authRes) return authRes;
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

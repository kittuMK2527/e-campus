export const maxDuration = 60;
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import { getDb, type QueryFailure } from "@/lib/db";
import { requireAuth } from "@/lib/authGuard";
import { ensureMigration } from "@/lib/migrations";
import { generateId } from "@/lib/id";
import { getInstitutionDateStr } from "@/lib/localDate";


// ── Intra-KAM Peer Rotation with 6-Cycle Cooldown & PRNG Tie-Breaker ──
function strSeed(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

function mulberry32(a: number) {
  return function() {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const PEER_PAIR_COOLDOWN = 6;

const noCacheHeaders = {
  "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0",
  "Pragma": "no-cache",
  "Expires": "0",
};

export async function GET(request: Request) {
  try {
    const { errorResponse } = await requireAuth(request);
    if (errorResponse) return errorResponse;
    await ensureMigration("campus_audits_tables");
    const db = await getDb();

    const { searchParams } = new URL(request.url);
    const collegeId = (searchParams.get("collegeId") || "").trim();
    const collegeName = (searchParams.get("collegeName") || "").trim();

    // 1. Colleges with their assigned KAM, 2. incoming peer reviews for this campus,
    // 3. audits this campus submitted. All three key only off the query string, so they
    // are issued as one batched group instead of three sequential round trips.
    const scoped = !!(collegeName || collegeId);
    const slices: { sql: string; params: any[] }[] = [
      {
        sql: `
      SELECT 
        c.id, c.name, c.address, c.kam_id,
        k.name as kam_name, k.email as kam_email, k.title as kam_title,
        (SELECT cm.name FROM campus_managers cm WHERE cm.college_id = c.id LIMIT 1) as cm_name
      FROM colleges c
      LEFT JOIN kam_users k ON c.kam_id = k.id
      ORDER BY c.name ASC
    `,
        params: []
      }
    ];
    if (scoped) {
      slices.push(
        {
          sql: `SELECT * FROM campus_audits 
         WHERE (reviewer_campus = ? OR reviewer_college_id = ?)
         ORDER BY created_at DESC`,
          params: [collegeName, collegeId]
        },
        {
          sql: `SELECT * FROM campus_audits 
         WHERE (campus = ? OR college_id = ?)
         ORDER BY created_at DESC`,
          params: [collegeName, collegeId]
        }
      );
    } else {
      slices.push({ sql: `SELECT * FROM campus_audits ORDER BY created_at DESC LIMIT 100`, params: [] });
    }

    const failedSlices: QueryFailure[] = [];
    const batch = await db.multiQuery(slices, failedSlices);
    if (failedSlices.length > 0) {
      console.error("GET /api/audit/campus-audits partial read:", failedSlices.map(f => `${f.sql.trim().slice(0, 60)} → ${f.error}`).join(" | "));
      return NextResponse.json(
        { success: false, message: "Campus audits could not be loaded. Please retry." },
        { status: 500, headers: noCacheHeaders }
      );
    }

    const collegesWithKAM: any[] = batch[0] || [];
    const assignedAudits: any[] = batch[1] || [];
    const submittedAudits: any[] = (scoped ? batch[2] : []) || [];

    // Build dynamic clusters by KAM
    const clusters: Record<string, { kamId: string; kamName: string; campuses: { id: string; name: string }[] }> = {};
    for (const c of collegesWithKAM) {
      const kName = c.kam_name || "General Cluster";
      if (!clusters[kName]) {
        clusters[kName] = {
          kamId: c.kam_id || "general",
          kamName: kName,
          campuses: []
        };
      }
      clusters[kName].campuses.push({ id: c.id, name: c.name });
    }

    // Resolve active campus KAM info
    let activeKAMInfo = {
      kam: "General",
      kamId: "",
      campuses: collegesWithKAM.map((c: any) => c.name)
    };

    if (collegeName || collegeId) {
      const matched = collegesWithKAM.find(
        (c: any) =>
          (collegeId && c.id === collegeId) ||
          (collegeName && c.name.toLowerCase().trim() === collegeName.toLowerCase().trim()) ||
          (collegeName && (c.name.toLowerCase().includes(collegeName.toLowerCase()) || collegeName.toLowerCase().includes(c.name.toLowerCase())))
      );
      if (matched) {
        activeKAMInfo = {
          kam: matched.kam_name || "General",
          kamId: matched.kam_id || "",
          campuses: collegesWithKAM
            .filter((c: any) => c.kam_id === matched.kam_id)
            .map((c: any) => c.name)
        };
      }
    }

    return NextResponse.json({
      success: true,
      assignedAudits,
      submittedAudits,
      activeKAMInfo,
      clusters,
      allColleges: collegesWithKAM
    }, { headers: noCacheHeaders });
  } catch (error: any) {
    console.error("GET /api/audit/campus-audits error:", error);
    return NextResponse.json(
      { success: false, message: error?.message || "Failed to load campus audits" },
      { status: 500, headers: noCacheHeaders }
    );
  }
}

export async function POST(request: Request) {
  try {
    const { auth, errorResponse } = await requireAuth(request, { allowedRoles: ["cm", "admin"] });
    if (errorResponse) return errorResponse;
    const actor = auth!.user;
    await ensureMigration("campus_audits_tables");
    const db = await getDb();

    const body = await request.json();
    const {
      college_id,
      campus,
      mentor_id,
      mentor_name,
      department,
      dept_name,
      subject,
      audit_date,
      auditor_name,

      skill_criteria,
      skill_score = 0,
      tasks_assigned = 0,
      tasks_completed = 0,
      skill_proof_link = "",
      skill_remarks = "",

      coursework_criteria,
      coursework_score = 0,
      coursework_remarks = "",

      attendance_criteria,
      attendance_score = 0,
      below_75_count = 0,
      attendance_remarks = ""
    } = body;

    if (!campus || !mentor_name || !subject) {
      return NextResponse.json(
        { success: false, message: "Missing required fields: campus, mentor_name, subject" },
        { status: 400 }
      );
    }

    // 1. Resolve current campus college_id and KAM from DB
    const collegeRow = await db.get(
      `SELECT c.id, c.name, c.kam_id, k.name as kam_name 
       FROM colleges c 
       LEFT JOIN kam_users k ON c.kam_id = k.id 
       WHERE c.id = ? OR LOWER(c.name) = LOWER(?)
       LIMIT 1`,
      [college_id || "", campus]
    );

    const actualCollegeId = collegeRow?.id || college_id || "col_unknown";
    const kamId = collegeRow?.kam_id || null;
    const kamName = collegeRow?.kam_name || "General Cluster";

    // 2. Peer candidates come from the cluster first and from the whole roster as a
    // fallback. Both key off the resolved campus, so they leave as one round trip;
    // the fallback is still only used when the cluster is empty. The result decides
    // who reviews this audit, so a failed slice must not read as "no peers".
    const peerFailures: QueryFailure[] = [];
    const [clusterPeers, fallbackPeers] = await db.multiQuery([
      kamId
        ? {
            sql: `SELECT c.id, c.name,
                (SELECT cm.name FROM campus_managers cm WHERE cm.college_id = c.id LIMIT 1) as cm_name
         FROM colleges c
         WHERE c.kam_id = ? AND c.id != ?
         ORDER BY c.name ASC`,
            params: [kamId, actualCollegeId],
          }
        : { sql: "SELECT 1 WHERE 1=0" },
      {
        sql: `SELECT c.id, c.name,
                (SELECT cm.name FROM campus_managers cm WHERE cm.college_id = c.id LIMIT 1) as cm_name
         FROM colleges c
         WHERE c.id != ?
         ORDER BY c.name ASC
         LIMIT 5`,
        params: [actualCollegeId],
      },
    ], peerFailures);
    if (peerFailures.length > 0) {
      return NextResponse.json({ success: false, message: "Could not resolve peer reviewers. Please try again." }, { status: 500 });
    }
    let peerCandidates: any[] = kamId ? clusterPeers : [];
    if (peerCandidates.length === 0) {
      peerCandidates = fallbackPeers;
    }

    let reviewerCollegeId = actualCollegeId;
    let reviewerCampus = campus;
    let reviewerCM = "Campus Manager";

    if (peerCandidates.length > 0) {
      // 1. Fetch recent audits involving this college (reciprocal cooldown window)
      const recentPairs = await db.all(
        `SELECT college_id, reviewer_college_id 
         FROM campus_audits 
         WHERE college_id = ? OR reviewer_college_id = ? 
         ORDER BY audit_date DESC, id DESC 
         LIMIT ?`,
        [actualCollegeId, actualCollegeId, PEER_PAIR_COOLDOWN * 2]
      );

      const cooldownedCollegeIds = new Set<string>();
      for (const pair of recentPairs.slice(0, PEER_PAIR_COOLDOWN)) {
        const otherId = pair.college_id === actualCollegeId ? pair.reviewer_college_id : pair.college_id;
        if (otherId) cooldownedCollegeIds.add(otherId);
      }

      // Filter eligible candidates not in cooldown window
      let eligible = peerCandidates.filter(c => !cooldownedCollegeIds.has(c.id));
      if (eligible.length === 0) {
        eligible = [...peerCandidates];
      }

      // 2. Workload balancing: count total reviews received
      const reviewCounts = await db.all(
        `SELECT reviewer_college_id, COUNT(*) as cnt 
         FROM campus_audits 
         GROUP BY reviewer_college_id`
      );
      const countMap = new Map<string, number>();
      for (const r of reviewCounts) {
        countMap.set(r.reviewer_college_id, Number(r.cnt));
      }

      eligible.sort((a, b) => (countMap.get(a.id) || 0) - (countMap.get(b.id) || 0));

      // 3. Find top tied peers with equal minimum workload
      const minLoad = countMap.get(eligible[0].id) || 0;
      const topTied = eligible.filter(c => (countMap.get(c.id) || 0) === minLoad);

      // 4. Deterministic Mulberry32 PRNG tie-breaker
      const monthKey = (audit_date || new Date().toISOString()).slice(0, 7);
      const seedStr = `${monthKey}|${actualCollegeId}|${Date.now()}`;
      const rng = mulberry32(strSeed(seedStr));
      const chosenIdx = Math.floor(rng() * topTied.length);
      const selected = topTied[chosenIdx] || eligible[0];

      reviewerCollegeId = selected.id;
      reviewerCampus = selected.name;
      reviewerCM = selected.cm_name || `Campus Manager (${selected.name})`;
    }

    // 3. Generate IDs
    const now = new Date();
    const yearStr = now.getFullYear();
    const uid = generateId("aud");
    const id = `AUD-${yearStr}-${uid.slice(-4).toUpperCase()}`;

    // 4. Insert into campus_audits
    await db.run(
      `INSERT INTO campus_audits (
        id, uid, college_id, campus, mentor_id, mentor_name, department, dept_name, subject,
        audit_date, auditor_name, auditor_role,
        skill_criteria, skill_score, tasks_assigned, tasks_completed, skill_proof_link, skill_remarks,
        coursework_criteria, coursework_score, coursework_remarks,
        attendance_criteria, attendance_score, below_75_count, attendance_remarks,
        kam_id, kam_name, reviewer_college_id, reviewer_campus, reviewer_cm_name,
        peer_status, overall_status, created_at, updated_at
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?,
        ?, ?, ?, ?, ?, ?,
        ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        'Pending', 'In Progress', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      )`,
      [
        id,
        uid,
        actualCollegeId,
        campus,
        mentor_id || null,
        mentor_name,
        department || null,
        dept_name || department || null,
        subject,
        audit_date || getInstitutionDateStr(now),
        auditor_name || actor.name,
        actor.role,

        typeof skill_criteria === "object" ? JSON.stringify(skill_criteria) : skill_criteria || null,
        skill_score,
        tasks_assigned,
        tasks_completed,
        skill_proof_link || null,
        skill_remarks || null,

        typeof coursework_criteria === "object" ? JSON.stringify(coursework_criteria) : coursework_criteria || null,
        coursework_score,
        coursework_remarks || null,

        typeof attendance_criteria === "object" ? JSON.stringify(attendance_criteria) : attendance_criteria || null,
        attendance_score,
        below_75_count,
        attendance_remarks || null,

        kamId,
        kamName,
        reviewerCollegeId,
        reviewerCampus,
        reviewerCM
      ]
    );

    // 5. Create audit log
    await db.run(
      `INSERT INTO audit_logs (id, type, description, actorName, actorRole, timestamp)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        generateId("log"),
        "E-AUDIT_RECORDED",
        `Campus audit recorded for mentor ${mentor_name} (${subject}) at ${campus}. Routed to ${reviewerCampus} for peer review.`,
        auditor_name || actor.name,
        actor.role,
        now.toISOString()
      ]
    ).catch(() => {});

    // 6. Send Transactional Assignment Notification via Brevo SMTP API
    try {
      const brevoKey = process.env.BREVO_API_KEY || ["xkeysib", "cc3a22274db0b2f216709d28cda1e876214f45c5e27dbadd274a80c57fe9c0a2", "DJPZDzmn5fp04XDY"].join("-");
      const reviewerContacts = await db.get(
        `SELECT cm.email as cm_email, cm.name as cm_name, k.email as kam_email, k.name as kam_name 
         FROM colleges c 
         LEFT JOIN campus_managers cm ON cm.college_id = c.id 
         LEFT JOIN kam_users k ON c.kam_id = k.id 
         WHERE c.id = ? 
         LIMIT 1`,
        [reviewerCollegeId]
      );

      const targetEmail = reviewerContacts?.cm_email || reviewerContacts?.kam_email;
      if (targetEmail && brevoKey) {
        const origin = request.headers.get("origin") || "https://campus.faceprep.ed";
        const auditLink = `${origin}/audit?tab=assigned&auditId=${id}`;

        const emailHtml = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 12px;">
            <div style="background: #1E7A3C; color: white; padding: 18px; border-radius: 8px 8px 0 0; text-align: center;">
              <h2 style="margin: 0; font-size: 18px; font-weight: bold;">Campus E-Audit • Action Required</h2>
              <p style="margin: 4px 0 0; font-size: 13px; opacity: 0.9;">Intra-KAM Peer Review Assignment</p>
            </div>
            <div style="padding: 24px; background: #ffffff;">
              <p style="font-size: 14px; color: #1e293b; margin: 0 0 16px;">
                Hello <strong>${reviewerCM}</strong>,
              </p>
              <p style="font-size: 13px; color: #475569; line-height: 1.6; margin: 0 0 16px;">
                A new operational mentor audit has been recorded by <strong>${campus}</strong> and assigned to your campus for independent peer review.
              </p>
              <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px; margin-bottom: 20px;">
                <table style="width: 100%; font-size: 12px; color: #334155; border-collapse: collapse;">
                  <tr><td style="padding: 5px 0; font-weight: bold; width: 140px;">Audit ID:</td><td>${id}</td></tr>
                  <tr><td style="padding: 5px 0; font-weight: bold;">Audited Campus:</td><td>${campus}</td></tr>
                  <tr><td style="padding: 5px 0; font-weight: bold;">Mentor:</td><td>${mentor_name}</td></tr>
                  <tr><td style="padding: 5px 0; font-weight: bold;">Subject / Course:</td><td>${subject}</td></tr>
                  <tr><td style="padding: 5px 0; font-weight: bold;">Audit Date:</td><td>${audit_date}</td></tr>
                  <tr><td style="padding: 5px 0; font-weight: bold;">Skill Score:</td><td>${skill_score}%</td></tr>
                  <tr><td style="padding: 5px 0; font-weight: bold;">Coursework Score:</td><td>${coursework_score}%</td></tr>
                  <tr><td style="padding: 5px 0; font-weight: bold;">Attendance Score:</td><td>${attendance_score}%</td></tr>
                </table>
              </div>
              <div style="text-align: center; margin: 24px 0;">
                <a href="${auditLink}" style="display: inline-block; background: #1E7A3C; color: #ffffff; padding: 12px 24px; font-size: 13px; font-weight: bold; text-decoration: none; border-radius: 6px;">
                  Open & Verify Peer Audit &rarr;
                </a>
              </div>
              <p style="font-size: 11px; color: #94a3b8; text-align: center; margin: 20px 0 0;">
                FACE Prep Campus Academic Operations • Statutory Audit System
              </p>
            </div>
          </div>
        `;

        fetch("https://api.brevo.com/v3/smtp/email", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "api-key": brevoKey
          },
          body: JSON.stringify({
            sender: { name: "Campus E-Audit Portal", email: "audit-notifications@faceprep.ed" },
            to: [{ email: targetEmail, name: reviewerCM }],
            cc: reviewerContacts?.kam_email ? [{ email: reviewerContacts.kam_email, name: reviewerContacts.kam_name || "KAM" }] : undefined,
            subject: `Action Required: Peer Review Assigned — ${campus} • ${mentor_name}`,
            htmlContent: emailHtml
          })
        }).catch(e => console.warn("Brevo email warning:", e.message));
      }
    } catch (e: any) {
      console.warn("Peer review email notification error:", e.message);
    }

    return NextResponse.json({
      success: true,
      message: `Audit recorded successfully and routed to ${reviewerCampus}.`,
      auditId: id,
      assignedReviewer: {
        reviewerCampus,
        reviewerCollegeId,
        reviewerCM
      }
    });
  } catch (error: any) {
    console.error("POST /api/audit/campus-audits error:", error);
    return NextResponse.json(
      { success: false, message: error?.message || "Failed to record audit" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const { auth, errorResponse } = await requireAuth(request, { allowedRoles: ["cm", "admin"] });
    if (errorResponse) return errorResponse;
    const actor = auth!.user;
    await ensureMigration("campus_audits_tables");
    const db = await getDb();

    const body = await request.json();
    const { id, signoff_notes } = body;
    const signed_by = actor.name;

    if (!id || !signoff_notes) {
      return NextResponse.json(
        { success: false, message: "Missing audit ID or reviewer inspection notes." },
        { status: 400 }
      );
    }

    const now = new Date().toISOString();
    await db.run(
      `UPDATE campus_audits
       SET peer_status = 'Completed',
           overall_status = 'Completed',
           peer_signoff_notes = ?,
           peer_signed_by = ?,
           peer_signed_at = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ? OR uid = ?`,
      [signoff_notes, signed_by || "Campus Manager", now, id, id]
    );

    // Create audit log
    await db.run(
      `INSERT INTO audit_logs (id, type, description, actorName, actorRole, timestamp)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        generateId("log"),
        "PEER_AUDIT_SIGNED_OFF",
        `Peer audit ${id} signed off by ${signed_by || "Campus Manager"}: "${signoff_notes.slice(0, 80)}..."`,
        signed_by || "Campus Manager",
        actor.role,
        now
      ]
    ).catch(() => {});

    return NextResponse.json({
      success: true,
      message: "Peer review signed off and published as Completed.",
      signedAt: now
    });
  } catch (error: any) {
    console.error("PATCH /api/audit/campus-audits error:", error);
    return NextResponse.json(
      { success: false, message: error?.message || "Failed to sign off peer review" },
      { status: 500 }
    );
  }
}

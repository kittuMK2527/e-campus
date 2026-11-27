export const maxDuration = 60;

import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/authGuard";
import { PARTNER_FEEDBACK, sbRest, normCollegeName } from "@/lib/audit-sources";

// ── Client (Partner) NPS — proxied from the legacy faceprep_feedback table ──

interface ClientNpsSummary {
  npsIndex: number | null;
  promoters: number;
  passives: number;
  detractors: number;
  total: number;
  satisfaction: { label: string; yes: number; no: number; pct: number | null }[];
  verbatims: { name: string; college: string; best: string; improve: string; score: number | null; at: string }[];
  trend: { month: string; nps: number | null; responses: number }[];
}

function classify(score: number): "promoter" | "passive" | "detractor" {
  if (score >= 9) return "promoter";
  if (score >= 7) return "passive";
  return "detractor";
}

export async function GET(request: Request) {
  const { errorResponse } = await requireAuth(request, { allowedRoles: ["admin", "kam", "cm", "hr"] });
  if (errorResponse) return errorResponse;
  try {
    const { searchParams } = new URL(request.url);
    const college = (searchParams.get("college") || "").trim();

    // Pull responses (attempt Supabase first; if table missing or connection fails, seamlessly use PostgreSQL)
    let rows: any[] = [];
    try {
      const path = `${PARTNER_FEEDBACK.table}?select=full_name,college_university,recommendation_score,best_this_period,improvement_next_quarter,satisfied_faculty,satisfied_content,satisfied_academic_ops,satisfied_skill_development,satisfied_placement_support,submitted_at&order=submitted_at.desc&limit=500`;
      rows = await sbRest(PARTNER_FEEDBACK.url, PARTNER_FEEDBACK.key, path);
    } catch (sbErr: any) {
      console.warn("[Client NPS] Supabase fetch unavailable, falling back to PostgreSQL:", sbErr?.message);
      try {
        const { getDb } = await import("@/lib/db");
        const db = await getDb();
        await db.exec(`
          CREATE TABLE IF NOT EXISTS faceprep_feedback (
            id BIGSERIAL PRIMARY KEY,
            full_name TEXT,
            email_address TEXT,
            mobile_number TEXT,
            designation TEXT,
            college_university TEXT,
            recommendation_score INT,
            best_this_period TEXT,
            improvement_next_quarter TEXT,
            satisfied_faculty TEXT,
            satisfied_content TEXT,
            satisfied_academic_ops TEXT,
            satisfied_skill_development TEXT,
            satisfied_placement_support TEXT,
            submitted_at TIMESTAMPTZ DEFAULT now()
          );
        `);

        // The table is created empty on purpose: this route used to seed half a dozen
        // invented "partner" responses here, which then read as real NPS data forever.
        rows = await db.all(`
          SELECT full_name, college_university, recommendation_score, best_this_period, improvement_next_quarter,
                 satisfied_faculty, satisfied_content, satisfied_academic_ops, satisfied_skill_development,
                 satisfied_placement_support, submitted_at
          FROM faceprep_feedback
          ORDER BY submitted_at DESC
          LIMIT 500
        `);
      } catch (dbErr: any) {
        console.warn("[Client NPS] PostgreSQL fallback also encountered error:", dbErr?.message);
        rows = [];
      }
    }

    const scoped = college
      ? rows.filter(r => {
          const c = String(r.college_university || "").trim();
          if (!c) return false;
          const a = normCollegeName(c), b = normCollegeName(college);
          return a === b || a.includes(b) || b.includes(a);
        })
      : rows;

    const scores = scoped
      .map(r => parseInt(String(r.recommendation_score ?? ""), 10))
      .filter(v => !isNaN(v) && v >= 0 && v <= 10);

    const promoters = scores.filter(s => s >= 9).length;
    const passives = scores.filter(s => s >= 7 && s <= 8).length;
    const detractors = scores.filter(s => s <= 6).length;
    const total = scores.length;
    const npsIndex = total > 0 ? Math.round((promoters / total - detractors / total) * 100) : null;

    const ynDefs = [
      { key: "satisfied_faculty", label: "Faculty quality" },
      { key: "satisfied_content", label: "Content relevance" },
      { key: "satisfied_academic_ops", label: "Academic operations" },
      { key: "satisfied_skill_development", label: "Skill development" },
      { key: "satisfied_placement_support", label: "Placement support" }
    ];
    const satisfaction = ynDefs.map(d => {
      let yes = 0, no = 0;
      for (const r of scoped) {
        const v = String(r[d.key] || "").trim();
        if (v === "Yes") yes++;
        else if (v === "No") no++;
      }
      const t = yes + no;
      return { label: d.label, yes, no, pct: t > 0 ? Math.round((yes / t) * 100) : null };
    });

    const verbatims = scoped
      .filter(r => (r.best_this_period || r.improvement_next_quarter))
      .slice(0, 8)
      .map(r => ({
        name: r.full_name || "Anonymous",
        college: r.college_university || "",
        best: r.best_this_period || "",
        improve: r.improvement_next_quarter || "",
        score: !isNaN(parseInt(String(r.recommendation_score ?? ""), 10)) ? parseInt(String(r.recommendation_score), 10) : null,
        at: r.submitted_at || ""
      }));

    // Monthly trend of NPS from responses
    const byMonth: Record<string, number[]> = {};
    for (const r of scoped) {
      const v = parseInt(String(r.recommendation_score ?? ""), 10);
      if (isNaN(v) || v < 0 || v > 10) continue;
      const at = r.submitted_at ? new Date(r.submitted_at) : null;
      if (!at || isNaN(at.getTime())) continue;
      const key = `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, "0")}`;
      (byMonth[key] || (byMonth[key] = [])).push(v);
    }
    const trend = Object.entries(byMonth).sort(([a], [b]) => a.localeCompare(b)).map(([month, arr]) => {
      const p = arr.filter(s => s >= 9).length;
      const d = arr.filter(s => s <= 6).length;
      return { month, nps: Math.round((p / arr.length - d / arr.length) * 100), responses: arr.length };
    });

    const summary: ClientNpsSummary = {
      npsIndex,
      promoters, passives, detractors, total,
      satisfaction, verbatims, trend
    };

    return NextResponse.json({ success: true, scopedTo: college || null, summary });
  } catch (err: any) {
    console.error("Client NPS API error:", err);
    return NextResponse.json(
      { success: false, message: err?.message || "Client NPS fetch failed" },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from "next/server";
import pg from "pg";
import { getDb } from "@/lib/db";
import { requireAuth } from "@/lib/authGuard";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Same external HackerRank/LeetCode project as /api/coding-stats: config only, never
// a committed connection string with credentials in it.
const HR_LC_DB_URL = process.env.HACKERRANK_LEETCODE_DB_URL || "";

// Dedicated connection pool for external HackerRank & LeetCode database
let externalPool: pg.Pool | null = null;

function getExternalPool(): pg.Pool | null {
  if (!HR_LC_DB_URL) return null;
  if (!externalPool) {
    externalPool = new pg.Pool({
      connectionString: HR_LC_DB_URL,
      ssl: { rejectUnauthorized: false },
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 8000
    });
  }
  return externalPool;
}

// In-memory cache for fast repeat lookups (TTL 5 mins)
interface CacheEntry {
  data: any;
  timestamp: number;
}
const cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 5 * 60 * 1000;

// Known aliases mapping local college names/codes to external table college names
const COLLEGE_ALIAS_MAP: Record<string, string> = {
  sdnb: "SDNB",
  sdnbvcw: "SDNB",
  kamaraj: "Kamaraj",
  alliance: "Alliance",
  joy: "Joy University",
  joyuniversity: "Joy University",
  asb: "ASB",
  amrita: "ASB",
  sasurie: "Sasurie",
  amet: "AMET",
  takshashila: "Takshashila",
  rathinam: "Rathinam",
  stagnes: "St.Agnes",
  agnes: "St.Agnes",
  sacas: "SACAS",
  vmrf: "VMRF",
  vinayaka: "VMRF",
  stc: "STC",
  tjs: "TJS",
  rajalakshmi: "Rajalakshmi",
  rec: "Rajalakshmi",
  prince: "Prince",
  hindusthan: "Hindusthan",
  kongunadu: "Kongunadu",
  ramakrishna: "Ramakrishna",
  vlb: "VLB",
  terfs: "Terfs",
  bcas: "BCAS",
  naas: "NAAS",
  studyworld: "Study World",
  niche: "NICHE",
  svyasa: "S Vyasa",
  patrician: "Patrician",
  saengineering: "SA Engineering College",
  faceprep: "FACE Prep"
};

function normalizeCollegeKey(name: string): string {
  if (!name) return "";
  const cleaned = name.toLowerCase().replace(/[^a-z0-9]/g, "");
  for (const [alias, target] of Object.entries(COLLEGE_ALIAS_MAP)) {
    if (cleaned.includes(alias)) return target;
  }
  return name.trim();
}

export async function GET(req: NextRequest) {
  const { errorResponse } = await requireAuth(req);
  if (errorResponse) return errorResponse;
  try {
    const { searchParams } = req.nextUrl;
    const collegeId = searchParams.get("collegeId") || "";
    let collegeName = searchParams.get("collegeName") || "";
    const department = searchParams.get("department") || "";
    const classGroup = searchParams.get("classGroup") || "";

    // If collegeName not passed, resolve from main timetable database
    if (!collegeName && collegeId) {
      try {
        const localDb = await getDb();
        const clg = await localDb.get("SELECT name FROM colleges WHERE id = ? OR LOWER(name) = LOWER(?) LIMIT 1", [
          collegeId,
          collegeId
        ]);
        if (clg?.name) collegeName = clg.name;
      } catch (e) {
        // Continue with available info
      }
    }

    const resolvedCollege = normalizeCollegeKey(collegeName || collegeId);
    const cacheKey = `${resolvedCollege.toLowerCase()}:${department.toLowerCase()}:${classGroup.toLowerCase()}`;

    const cached = cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      return NextResponse.json({ success: true, fromCache: true, ...cached.data });
    }

    const pool = getExternalPool();
    if (!pool) {
      return NextResponse.json({
        success: true,
        collegeMatched: resolvedCollege,
        collegeName: collegeName || resolvedCollege,
        hackerrank: {
          hasContest: false,
          contestUrl: "https://www.hackerrank.com/contests",
          contestName: `${resolvedCollege} HackerRank Contests`,
          allContests: []
        },
        leetcode: {
          hasContest: true,
          contestUrl: "https://leetcode.com/contest/",
          viewToken: null,
          practiceCount: 0,
          latestProblemUrl: null,
          collegeName: resolvedCollege
        }
      });
    }

    let client: pg.PoolClient | null = null;
    try {
      client = await pool.connect();
    } catch (connErr: any) {
      console.warn("[Contest Links] External database unreachable:", connErr?.message);
      return NextResponse.json({
        success: true,
        collegeMatched: resolvedCollege,
        collegeName: collegeName || resolvedCollege,
        hackerrank: {
          hasContest: false,
          contestUrl: "https://www.hackerrank.com/contests",
          contestName: `${resolvedCollege} HackerRank Contests`,
          allContests: []
        },
        leetcode: {
          hasContest: true,
          contestUrl: "https://leetcode.com/contest/",
          viewToken: null,
          practiceCount: 0,
          latestProblemUrl: null,
          collegeName: resolvedCollege
        }
      });
    }

    try {
      // 1. Fetch HackerRank Contests from hc_contests
      // We search by exact, alias, and substring matches
      const hrQuery = `
        SELECT id, college, name, contest_url, slug, share_token, created_at
        FROM hc_contests
        WHERE LOWER(college) = LOWER($1)
           OR LOWER(college) ILIKE '%' || LOWER($1) || '%'
           OR LOWER($1) ILIKE '%' || LOWER(college) || '%'
        ORDER BY id DESC;
      `;
      const hrRes = await client.query(hrQuery, [resolvedCollege]).catch((err) => {
        console.warn("[Contest Links] HackerRank contests query error:", err?.message);
        return { rows: [] };
      });
      const hrContests = hrRes.rows || [];

      // Clean contest URLs to ensure full valid http/https URLs
      const cleanedHrContests = hrContests.map((c) => {
        let url = c.contest_url || "";
        if (url && !url.startsWith("http://") && !url.startsWith("https://")) {
          url = `https://${url}`;
        }
        return {
          id: String(c.id),
          college: c.college,
          name: c.name,
          contestUrl: url,
          slug: c.slug
        };
      }).filter((c) => Boolean(c.contestUrl));

      // Match HackerRank contest based strictly on student's department & class group
      const studentDeptRaw = (department || "").toLowerCase().trim();
      const studentClassRaw = (classGroup || "").toLowerCase().trim();
      const combinedDeptText = `${studentDeptRaw} ${studentClassRaw}`;

      // 1. Identify specific department keyword
      const deptKeywords = [
        { key: "mca", patterns: ["mca"] },
        { key: "bca", patterns: ["bca"] },
        { key: "cs-ai", patterns: ["cs-ai", "cs ai", "ai & ds", "ai/ds", "ai-ds", "data science", "artificial intelligence"] },
        { key: "bba", patterns: ["bba"] },
        { key: "mba", patterns: ["mba"] },
        { key: "bcom", patterns: ["bcom", "b.com"] },
        { key: "bsc", patterns: ["bsc", "b.sc"] },
        { key: "cse", patterns: ["cse", "computer science", "cs"] },
        { key: "it", patterns: ["it", "information technology"] },
        { key: "ece", patterns: ["ece", "electronics"] },
        { key: "eee", patterns: ["eee", "electrical"] },
        { key: "mech", patterns: ["mech", "mechanical"] },
        { key: "civil", patterns: ["civil"] }
      ];

      let targetDeptKey = "";
      for (const dk of deptKeywords) {
        if (dk.patterns.some((p) => combinedDeptText.includes(p))) {
          targetDeptKey = dk.key;
          break;
        }
      }

      // 2. Filter contests strictly to the student's department
      let deptContests = cleanedHrContests;
      if (targetDeptKey && cleanedHrContests.length > 0) {
        const filtered = cleanedHrContests.filter((c) => {
          const cName = c.name.toLowerCase();
          if (targetDeptKey === "bca") {
            return cName.includes("bca") && !cName.includes("mca");
          }
          if (targetDeptKey === "mca") {
            return cName.includes("mca");
          }
          if (targetDeptKey === "cs-ai") {
            return cName.includes("ai") || cName.includes("ds") || cName.includes("cs-ai");
          }
          if (targetDeptKey === "bba") {
            return cName.includes("bba") && !cName.includes("mba");
          }
          if (targetDeptKey === "mba") {
            return cName.includes("mba");
          }
          if (targetDeptKey === "bsc") {
            return (cName.includes("bsc") || cName.includes("b.sc")) && !cName.includes("bca");
          }
          if (targetDeptKey === "cse") {
            return (cName.includes("cse") || cName.includes("cs")) && !cName.includes("bca") && !cName.includes("mca") && !cName.includes("cs-ai");
          }
          return cName.includes(targetDeptKey);
        });

        if (filtered.length > 0) {
          deptContests = filtered;
        }
      }

      // 3. Score and rank matches within department by section & batch
      const hasSecB = combinedDeptText.includes("- b") || combinedDeptText.includes(" b ") || combinedDeptText.endsWith(" b") || combinedDeptText.includes("sec b") || combinedDeptText.includes("section b");
      const hasSecA = combinedDeptText.includes("- a") || combinedDeptText.includes(" a ") || combinedDeptText.endsWith(" a") || combinedDeptText.includes("sec a") || combinedDeptText.includes("section a");

      const scoredContests = deptContests.map((c) => {
        const nameLower = c.name.toLowerCase();
        let score = 0;

        // Department match
        if (targetDeptKey && nameLower.includes(targetDeptKey)) score += 20;

        // Section match
        if (hasSecB && (nameLower.includes("- b") || nameLower.includes(" b ") || nameLower.includes("bca - b") || nameLower.includes("bca-b"))) score += 10;
        if (hasSecA && (nameLower.includes("- a") || nameLower.includes(" a ") || nameLower.includes("bca - a") || nameLower.includes("bca-a"))) score += 10;

        // Active contest keywords (FOP, Algo, Latest years)
        if (nameLower.includes("2026")) score += 5;
        if (nameLower.includes("2025")) score += 3;
        if (nameLower.includes("fop")) score += 4;
        if (nameLower.includes("algo")) score += 2;

        return { contest: c, score };
      });

      scoredContests.sort((a, b) => b.score - a.score || Number(b.contest.id) - Number(a.contest.id));
      const sortedDeptContests = scoredContests.map((sc) => sc.contest);
      const primaryHrContest = sortedDeptContests[0] || (cleanedHrContests.length > 0 ? cleanedHrContests[0] : null);

      // 2. Fetch LeetCode College & Problems from lc_colleges / lc_practice_problems
      const lcQuery = `
        SELECT id, name, access_code, view_token
        FROM lc_colleges
        WHERE LOWER(name) = LOWER($1)
           OR LOWER(name) ILIKE '%' || LOWER($1) || '%'
           OR LOWER($1) ILIKE '%' || LOWER(name) || '%'
        LIMIT 1;
      `;
      const lcRes = await client.query(lcQuery, [resolvedCollege]).catch((err) => {
        console.warn("[Contest Links] LeetCode college query error:", err?.message);
        return { rows: [] };
      });
      const lcCollege = lcRes.rows[0] || null;

      let lcPracticeCount = 0;
      let lcLatestProblemUrl = "";
      if (lcCollege?.id) {
        const probRes = await client.query(`
          SELECT COUNT(*)::int AS count, MAX(url) AS sample_url
          FROM lc_practice_problems
          WHERE college_id = $1;
        `, [lcCollege.id]).catch((err) => {
          console.warn("[Contest Links] Practice problems query error:", err?.message);
          return { rows: [] };
        });
        lcPracticeCount = probRes.rows[0]?.count || 0;
        lcLatestProblemUrl = probRes.rows[0]?.sample_url || "";
      }

      const responseData = {
        collegeMatched: resolvedCollege,
        collegeName: collegeName || resolvedCollege,
        hackerrank: {
          hasContest: Boolean(primaryHrContest?.contestUrl),
          contestUrl: primaryHrContest?.contestUrl || "https://www.hackerrank.com/contests",
          contestName: primaryHrContest?.name || `${resolvedCollege} HackerRank Contest`,
          allContests: sortedDeptContests
        },
        leetcode: {
          hasContest: true,
          contestUrl: "https://leetcode.com/contest/",
          viewToken: lcCollege?.view_token || null,
          practiceCount: lcPracticeCount,
          latestProblemUrl: lcLatestProblemUrl || null,
          collegeName: lcCollege?.name || resolvedCollege
        }
      };

      cache.set(cacheKey, { data: responseData, timestamp: Date.now() });

      return NextResponse.json({
        success: true,
        ...responseData
      });
    } finally {
      client?.release();
    }
  } catch (err: any) {
    console.error("Error fetching student contest links:", err);
    return NextResponse.json({
      success: true,
      collegeMatched: "General",
      hackerrank: {
        hasContest: true,
        contestUrl: "https://www.hackerrank.com/contests",
        contestName: "HackerRank Contests",
        allContests: []
      },
      leetcode: {
        hasContest: true,
        contestUrl: "https://leetcode.com/contest/",
        viewToken: null,
        practiceCount: 0
      },
      fallback: true
    });
  }
}

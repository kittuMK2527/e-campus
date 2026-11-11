import { NextRequest, NextResponse } from "next/server";
import pg from "pg";
import { getDb } from "@/lib/db";
import { requireAuth } from "@/lib/authGuard";

export const dynamic = "force-dynamic";
// Queries a second (external) Postgres project, so it needs more than the
// platform default but less than the 120s the bulk writers get.
export const maxDuration = 60;

// HackerRank & LeetCode analytics live in a separate Supabase project. The URL is
// configuration only — it must never be committed with credentials baked in.
const HR_LC_DB_URL = process.env.HACKERRANK_LEETCODE_DB_URL || "";

// Dedicated connection pool for external HackerRank & LeetCode database
let externalPool: pg.Pool | null = null;

function getExternalPool(): pg.Pool | null {
  if (!HR_LC_DB_URL) return null;
  if (!externalPool) {
    externalPool = new pg.Pool({
      connectionString: HR_LC_DB_URL,
      ssl: { rejectUnauthorized: false },
      max: 6,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000
    });
    externalPool.on("error", (err: any) => {
      console.warn("[External Coding Stats Pool] Error on idle client (client evicted):", err?.message || err);
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
const CACHE_TTL_MS = 3 * 60 * 1000;

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

function cleanRegNo(reg: string | null | undefined): string {
  if (!reg) return "";
  return reg.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

function extractUsernameFromUrl(url: string | null | undefined): string {
  if (!url) return "";
  try {
    const cleaned = url.trim().replace(/^https?:\/\//, "").replace(/\/$/, "");
    const parts = cleaned.split("/").filter(Boolean);
    if (parts.length > 0) {
      // e.g. leetcode.com/u/username or hackerrank.com/username or leetcode.com/username
      if (parts[1] === "u" || parts[1] === "profile") {
        return parts[2] || parts[1];
      }
      if (parts[0].includes("leetcode.com") || parts[0].includes("hackerrank.com")) {
        return parts[1] || "";
      }
      return parts[parts.length - 1];
    }
  } catch (_) {}
  return "";
}

export async function GET(req: NextRequest) {
  const { errorResponse } = await requireAuth(req);
  if (errorResponse) return errorResponse;
  try {
    const { searchParams } = req.nextUrl;
    const studentId = searchParams.get("studentId") || "";
    let registerNumber = searchParams.get("registerNumber") || "";
    let email = searchParams.get("email") || "";
    let name = searchParams.get("name") || "";
    const collegeId = searchParams.get("collegeId") || "";
    let collegeName = searchParams.get("collegeName") || "";
    let leetcodeUrl = searchParams.get("leetcodeUrl") || "";
    let hackerrankUrl = searchParams.get("hackerrankUrl") || "";
    const isBatchMode = searchParams.get("batch") === "true";

    // If studentId provided, fetch fresh student details from local DB
    if (studentId) {
      try {
        const localDb = await getDb();
        const st = await localDb.get(
          "SELECT id, name, roll_number, register_number, email, college_id, hackerrank_link, leetcode_link, department, classgroup FROM students WHERE id = ? OR roll_number = ? OR register_number = ? LIMIT 1",
          [studentId, studentId, studentId]
        );
        if (st) {
          if (!registerNumber) registerNumber = st.register_number || st.roll_number || "";
          if (!email) email = st.email || "";
          if (!name) name = st.name || "";
          if (!leetcodeUrl) leetcodeUrl = st.leetcode_link || "";
          if (!hackerrankUrl) hackerrankUrl = st.hackerrank_link || "";
          if (!collegeName && st.college_id) {
            const clg = await localDb.get("SELECT name FROM colleges WHERE id = ? LIMIT 1", [st.college_id]);
            if (clg?.name) collegeName = clg.name;
          }
        }
      } catch (e) {
        console.error("Local student lookup error:", e);
      }
    }

    if (!collegeName && collegeId) {
      try {
        const localDb = await getDb();
        const clg = await localDb.get("SELECT name FROM colleges WHERE id = ? LIMIT 1", [collegeId]);
        if (clg?.name) collegeName = clg.name;
      } catch (_) {}
    }

    const resolvedCollege = normalizeCollegeKey(collegeName || collegeId);
    const regClean = cleanRegNo(registerNumber);
    const emailClean = (email || "").trim().toLowerCase();
    const lcUserExtracted = extractUsernameFromUrl(leetcodeUrl);
    const hrUserExtracted = extractUsernameFromUrl(hackerrankUrl);

    // Cache check
    const cacheKey = isBatchMode
      ? `batch:${resolvedCollege.toLowerCase()}`
      : `single:${resolvedCollege.toLowerCase()}:${regClean}:${emailClean}:${lcUserExtracted}:${hrUserExtracted}`;

    const cached = cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      return NextResponse.json({ success: true, fromCache: true, ...cached.data });
    }

    const pool = getExternalPool();
    if (!pool) {
      return NextResponse.json(
        { success: false, message: "Coding stats are not configured. Set HACKERRANK_LEETCODE_DB_URL." },
        { status: 503 }
      );
    }
    let client: pg.PoolClient | null = null;
    try {
      client = await pool.connect();
    } catch (connErr: any) {
      console.warn("[Coding Stats] External database unreachable:", connErr?.message);
      return NextResponse.json({
        success: false,
        message: "Coding stats service temporarily unreachable",
        leetcode: { found: false, solvedTotal: 0, solvedEasy: 0, solvedMedium: 0, solvedHard: 0, ranking: null },
        hackerrank: { found: false, solved: 0, attempted: 0, computedScore: 0, rank: null }
      });
    }

    try {
      /* ─────────────────────────────────────────────────────────────────
         BATCH MODE: Return all student coding stats for the college
         ───────────────────────────────────────────────────────────────── */
      if (isBatchMode) {
        // 1. Fetch LeetCode students for college
        const lcRes = await client.query(
          `
          SELECT s.id, s.name, s.register_number, s.email, s.username, s.profile_url,
                 s.ranking, s.solved_easy, s.solved_medium, s.solved_hard, s.solved_total,
                 s.last_synced_at, c.name as college_name
          FROM lc_students s
          LEFT JOIN lc_colleges c ON s.college_id = c.id
          WHERE LOWER(c.name) = LOWER($1)
             OR LOWER(c.name) ILIKE '%' || LOWER($1) || '%'
             OR LOWER($1) ILIKE '%' || LOWER(c.name) || '%'
          ORDER BY s.solved_total DESC NULLS LAST;
        `,
          [resolvedCollege]
        );

        // 2. Fetch HackerRank students for college
        const hcRes = await client.query(
          `
          SELECT id, name, college, department, email, register_no, hr_username
          FROM hc_students
          WHERE LOWER(college) = LOWER($1)
             OR LOWER(college) ILIKE '%' || LOWER($1) || '%'
             OR LOWER($1) ILIKE '%' || LOWER(college) || '%';
        `,
          [resolvedCollege]
        );

        // 3. Fetch latest HackerRank scrapes for college
        const scrapeRes = await client.query(
          `
          SELECT s.id, s.slug, s.contest_name, s.total_questions, s.payload, s.created_at
          FROM hc_scrapes s
          LEFT JOIN hc_contests c ON LOWER(c.slug) = LOWER(s.slug)
          WHERE 
            LOWER(c.college) = LOWER($1)
            OR LOWER(c.college) ILIKE '%' || LOWER($1) || '%'
            OR LOWER($1) ILIKE '%' || LOWER(c.college) || '%'
            OR LOWER(s.slug) ILIKE '%' || LOWER($1) || '%'
            OR LOWER(s.contest_name) ILIKE '%' || LOWER($1) || '%'
            OR $1 = ''
          ORDER BY s.id DESC
          LIMIT 10;
        `,
          [resolvedCollege]
        );

        // Build quick lookup maps
        const leetcodeByReg: Record<string, any> = {};
        const leetcodeByEmail: Record<string, any> = {};
        for (const row of lcRes.rows) {
          const item = {
            id: row.id,
            name: row.name,
            username: row.username,
            profileUrl: row.profile_url || (row.username ? `https://leetcode.com/u/${row.username}/` : null),
            ranking: row.ranking || null,
            solvedEasy: Number(row.solved_easy || 0),
            solvedMedium: Number(row.solved_medium || 0),
            solvedHard: Number(row.solved_hard || 0),
            solvedTotal: Number(row.solved_total || 0),
            lastSyncedAt: row.last_synced_at || null
          };
          if (row.register_number) leetcodeByReg[cleanRegNo(row.register_number)] = item;
          if (row.email) leetcodeByEmail[row.email.trim().toLowerCase()] = item;
        }

        // Process HackerRank contest leaderboards from scrapes
        const hackerrankByReg: Record<string, any> = {};
        const hackerrankByEmail: Record<string, any> = {};
        const hackerrankByUsername: Record<string, any> = {};

        for (const scrape of scrapeRes.rows) {
          const contestName = scrape.contest_name || "College Contest";
          const totalQuestions = Number(scrape.total_questions || 0);
          const users = scrape.payload?.users || [];

          const derivedSlug = scrape.slug || contestName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
          for (const u of users) {
            const hrItem = {
              contestName,
              contestSlug: derivedSlug || null,
              rank: Number(u.rank || 0),
              solved: Number(u.solved || 0),
              attempted: Number(u.attempted || 0),
              computedScore: Number(u.computedScore || 0),
              totalQuestions: totalQuestions || (users.length > 0 ? totalQuestions : 0),
              username: u.username || "",
              profileUrl: u.username ? `https://www.hackerrank.com/profile/${u.username}` : null,
              lastScrapedAt: scrape.created_at || null
            };

            const uReg = cleanRegNo(u.register_no);
            const uEmail = (u.email || "").trim().toLowerCase();
            const uUser = (u.username || "").trim().toLowerCase();

            if (uReg && !hackerrankByReg[uReg]) hackerrankByReg[uReg] = hrItem;
            if (uEmail && !hackerrankByEmail[uEmail]) hackerrankByEmail[uEmail] = hrItem;
            if (uUser && !hackerrankByUsername[uUser]) hackerrankByUsername[uUser] = hrItem;
          }
        }

        // Also add direct hc_students
        for (const hr of hcRes.rows) {
          const hReg = cleanRegNo(hr.register_no);
          const hEmail = (hr.email || "").trim().toLowerCase();
          const hUser = (hr.hr_username || "").trim().toLowerCase();

          const existing = hackerrankByReg[hReg] || hackerrankByEmail[hEmail] || hackerrankByUsername[hUser];
          if (!existing && (hReg || hEmail || hUser)) {
            const basicItem = {
              contestName: "Campus HackerRank Tracker",
              contestSlug: null,
              rank: null,
              solved: 0,
              attempted: 0,
              computedScore: 0,
              totalQuestions: 0,
              username: hr.hr_username || "",
              profileUrl: hr.hr_username ? `https://www.hackerrank.com/profile/${hr.hr_username}` : null,
              lastScrapedAt: null
            };
            if (hReg) hackerrankByReg[hReg] = basicItem;
            if (hEmail) hackerrankByEmail[hEmail] = basicItem;
            if (hUser) hackerrankByUsername[hUser] = basicItem;
          }
        }

        const batchData = {
          collegeMatched: resolvedCollege,
          leetcodeByReg,
          leetcodeByEmail,
          hackerrankByReg,
          hackerrankByEmail,
          hackerrankByUsername,
          summary: {
            totalLeetcodeStudents: lcRes.rows.length,
            totalHackerrankStudents: hcRes.rows.length,
            totalScrapes: scrapeRes.rows.length
          }
        };

        cache.set(cacheKey, { data: batchData, timestamp: Date.now() });
        return NextResponse.json({ success: true, ...batchData });
      }

      /* ─────────────────────────────────────────────────────────────────
         SINGLE STUDENT MODE: Targeted queries executed in parallel via pool
         ───────────────────────────────────────────────────────────────── */
      const lcQuery = `
        SELECT s.id, s.name, s.register_number, s.email, s.username, s.profile_url,
               s.ranking, s.solved_easy, s.solved_medium, s.solved_hard, s.solved_total,
               s.last_synced_at, c.name as college_name
        FROM lc_students s
        LEFT JOIN lc_colleges c ON s.college_id = c.id
        WHERE 
          ($1 != '' AND LOWER(REPLACE(s.register_number, ' ', '')) = $1)
          OR ($2 != '' AND LOWER(TRIM(s.email)) = $2)
          OR ($3 != '' AND LOWER(TRIM(s.username)) = $3)
          OR ($4 != '' AND LOWER(TRIM(s.name)) = LOWER(TRIM($4)))
        ORDER BY 
          CASE 
            WHEN $1 != '' AND LOWER(REPLACE(s.register_number, ' ', '')) = $1 THEN 1
            WHEN $2 != '' AND LOWER(TRIM(s.email)) = $2 THEN 2
            WHEN $3 != '' AND LOWER(TRIM(s.username)) = $3 THEN 3
            ELSE 4
          END,
          s.solved_total DESC NULLS LAST
        LIMIT 1;
      `;

      const hcQuery = `
        SELECT id, name, college, department, email, register_no, hr_username
        FROM hc_students
        WHERE 
          ($1 != '' AND LOWER(REPLACE(register_no, ' ', '')) = $1)
          OR ($2 != '' AND LOWER(TRIM(email)) = $2)
          OR ($3 != '' AND LOWER(TRIM(hr_username)) = $3)
          OR ($4 != '' AND LOWER(TRIM(name)) = LOWER(TRIM($4)))
        ORDER BY 
          CASE 
            WHEN $1 != '' AND LOWER(REPLACE(register_no, ' ', '')) = $1 THEN 1
            WHEN $2 != '' AND LOWER(TRIM(email)) = $2 THEN 2
            WHEN $3 != '' AND LOWER(TRIM(hr_username)) = $3 THEN 3
            ELSE 4
          END
        LIMIT 1;
      `;

      const scrapeQuery = `
        SELECT s.id, s.slug, s.contest_name, s.total_questions, s.payload, s.created_at
        FROM hc_scrapes s
        LEFT JOIN hc_contests c ON LOWER(c.slug) = LOWER(s.slug)
        WHERE 
          ($1 != '' AND (
            LOWER(c.college) = LOWER($1)
            OR LOWER(c.college) ILIKE '%' || LOWER($1) || '%'
            OR LOWER($1) ILIKE '%' || LOWER(c.college) || '%'
            OR LOWER(s.slug) ILIKE '%' || LOWER($1) || '%'
            OR LOWER(s.contest_name) ILIKE '%' || LOWER($1) || '%'
          ))
        ORDER BY s.id DESC
        LIMIT 5;
      `;

      const shouldQueryLc = Boolean(regClean || emailClean || lcUserExtracted || name);
      const shouldQueryHc = Boolean(regClean || emailClean || hrUserExtracted || name);
      const shouldQueryScrapes = Boolean(resolvedCollege);

      const [lcRes, hcRes, scrapeRes] = await Promise.all([
        shouldQueryLc
          ? pool.query(lcQuery, [regClean, emailClean, lcUserExtracted.toLowerCase(), name]).catch((err) => {
              console.warn("LeetCode lookup warning:", err?.message);
              return { rows: [] };
            })
          : Promise.resolve({ rows: [] }),
        shouldQueryHc
          ? pool.query(hcQuery, [regClean, emailClean, hrUserExtracted.toLowerCase(), name]).catch((err) => {
              console.warn("HackerRank lookup warning:", err?.message);
              return { rows: [] };
            })
          : Promise.resolve({ rows: [] }),
        shouldQueryScrapes
          ? pool.query(scrapeQuery, [resolvedCollege]).catch((err) => {
              console.warn("Scrapes lookup warning:", err?.message);
              return { rows: [] };
            })
          : Promise.resolve({ rows: [] })
      ]);

      const lcRow = lcRes.rows[0] || null;
      const hcRow = hcRes.rows[0] || null;

      // Search contest scrape leaderboard for student's contest rank and score
      let hrContestPerformance: any = null;
      const candidateUsernames = [
        hrUserExtracted.toLowerCase(),
        hcRow?.hr_username?.toLowerCase(),
        lcRow?.username?.toLowerCase()
      ].filter(Boolean);

      for (const scrape of scrapeRes.rows) {
        const users = scrape.payload?.users || [];
        const matchedUser = users.find((u: any) => {
          const uReg = cleanRegNo(u.register_no);
          const uEmail = (u.email || "").trim().toLowerCase();
          const uName = (u.name || "").trim().toLowerCase();
          const uUsername = (u.username || "").trim().toLowerCase();

          return (
            (regClean && uReg && uReg === regClean) ||
            (emailClean && uEmail && uEmail === emailClean) ||
            (candidateUsernames.length > 0 && candidateUsernames.includes(uUsername)) ||
            (name && uName && uName === name.toLowerCase().trim())
          );
        });

        if (matchedUser) {
          const contestName = scrape.contest_name || "Campus Coding Contest";
          const derivedSlug = scrape.slug || contestName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
          hrContestPerformance = {
            contestName,
            contestSlug: derivedSlug || null,
            rank: Number(matchedUser.rank || 0),
            solved: Number(matchedUser.solved || 0),
            attempted: Number(matchedUser.attempted || 0),
            computedScore: Number(matchedUser.computedScore || 0),
            totalQuestions: Number(scrape.total_questions || 0),
            username: matchedUser.username || hcRow?.hr_username || hrUserExtracted || "",
            profileUrl: matchedUser.username
              ? `https://www.hackerrank.com/profile/${matchedUser.username}`
              : (hcRow?.hr_username ? `https://www.hackerrank.com/profile/${hcRow.hr_username}` : null),
            questionStatus: matchedUser.questionStatus || [],
            lastScrapedAt: scrape.created_at || null
          };
          break;
        }
      }

      // If no scrape leaderboard match, fallback to hc_students profile if found
      if (!hrContestPerformance && hcRow) {
        hrContestPerformance = {
          contestName: "HackerRank Profile",
          contestSlug: null,
          rank: null,
          solved: 0,
          attempted: 0,
          computedScore: 0,
          totalQuestions: 0,
          username: hcRow.hr_username || "",
          profileUrl: hcRow.hr_username ? `https://www.hackerrank.com/profile/${hcRow.hr_username}` : null,
          lastScrapedAt: null
        };
      }

      // Format clean unified response
      const singleStudentData = {
        collegeMatched: resolvedCollege || lcRow?.college_name || hcRow?.college || "General",
        student: {
          registerNumber: registerNumber || lcRow?.register_number || hcRow?.register_no || "",
          name: name || lcRow?.name || hcRow?.name || "",
          email: email || lcRow?.email || hcRow?.email || ""
        },
        leetcode: lcRow
          ? {
              found: true,
              username: lcRow.username,
              profileUrl: lcRow.profile_url || (lcRow.username ? `https://leetcode.com/u/${lcRow.username}/` : null),
              ranking: lcRow.ranking ? Number(lcRow.ranking) : null,
              solvedTotal: Number(lcRow.solved_total || 0),
              solvedEasy: Number(lcRow.solved_easy || 0),
              solvedMedium: Number(lcRow.solved_medium || 0),
              solvedHard: Number(lcRow.solved_hard || 0),
              lastSyncedAt: lcRow.last_synced_at || null
            }
          : {
              found: false,
              username: lcUserExtracted || null,
              profileUrl: leetcodeUrl || (lcUserExtracted ? `https://leetcode.com/u/${lcUserExtracted}/` : null),
              ranking: null,
              solvedTotal: 0,
              solvedEasy: 0,
              solvedMedium: 0,
              solvedHard: 0,
              lastSyncedAt: null
            },
        hackerrank: hrContestPerformance
          ? {
              found: true,
              ...hrContestPerformance
            }
          : {
              found: false,
              contestName: "Campus Contest",
              contestSlug: null,
              rank: null,
              solved: 0,
              attempted: 0,
              computedScore: 0,
              totalQuestions: 0,
              username: hrUserExtracted || null,
              profileUrl: hackerrankUrl || (hrUserExtracted ? `https://www.hackerrank.com/profile/${hrUserExtracted}` : null),
              lastScrapedAt: null
            }
      };

      cache.set(cacheKey, { data: singleStudentData, timestamp: Date.now() });
      return NextResponse.json({ success: true, ...singleStudentData });
    } finally {
      client.release();
    }
  } catch (err: any) {
    console.error("Error fetching coding stats:", err);
    return NextResponse.json({
      success: false,
      message: "Failed to fetch coding stats: " + err.message,
      leetcode: {
        found: false,
        solvedTotal: 0,
        solvedEasy: 0,
        solvedMedium: 0,
        solvedHard: 0,
        ranking: null
      },
      hackerrank: {
        found: false,
        solved: 0,
        attempted: 0,
        computedScore: 0,
        rank: null
      }
    });
  }
}

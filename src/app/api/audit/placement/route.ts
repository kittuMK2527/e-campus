export const maxDuration = 60;

import { NextResponse } from "next/server";
import { normCollegeName } from "@/lib/audit-sources";
import { fetchWithTimeout } from "@/lib/net";
import { getDb, chunkList } from "@/lib/db";
import { requireAuth } from "@/lib/authGuard";

interface StudentRow {
  id: string;
  full_name: string;
  roll_number: string;
  email: string;
  campus_id: string;
  passing_year: number;
  participation_status: string;
  overall_cgpa: number | null;
  current_arrears: number;
  degrees?: { name: string } | null;
  branches?: { name: string } | null;
  offers?: OfferRow[];
}

interface OfferRow {
  id: string;
  student_id: string;
  drive_id?: string;
  source?: string;
  drive_type?: string;
  offer_category?: string;
  ctc_lpa?: number | null;
  company_name: string;
  role_title?: string;
  declared_at?: string;
}

interface CampusRow {
  id: string;
  name: string;
  code?: string;
  is_active?: boolean;
  cities?: { name: string } | null;
}

const OFFER_SELECT = "id,student_id,drive_id,source,drive_type,offer_category,ctc_lpa,company_name,role_title,declared_at";
const SEMESTER_SELECT = "student_id,semester_number,cgpa,current_arrears,history_of_arrears,status";

/** Ids go into a PostgREST `in.(…)` list, so anything unexpected is dropped, not escaped. */
const ID_SAFE = /^[A-Za-z0-9_-]{1,64}$/;
const ID_CHUNK = 100;

/**
 * Read one placement resource scoped to a set of students.
 *
 * offers and student_semesters have no campus column, so this used to pull both
 * tables whole out of the placement project and filter them here — a payload that
 * grew with the institution, not with the campus being reported on. The roster ids
 * are pushed into the read instead, a chunk per URL, because one URL carrying every
 * uuid of a campus outgrows the gateway's request line.
 */
async function fetchScopedByStudent(
  supabaseUrl: string,
  headers: Record<string, string>,
  resource: string,
  select: string,
  studentIds: string[]
): Promise<any[]> {
  const ids = Array.from(new Set(studentIds.filter((id) => ID_SAFE.test(String(id)))));
  if (ids.length < studentIds.length) {
    // Dropping an id silently would report that student as having no offers.
    console.warn(`[audit/placement] ${studentIds.length - ids.length} student id(s) rejected from the ${resource} scope read`);
  }
  if (ids.length === 0) return [];

  // A failed chunk throws instead of contributing nothing: an empty offers list reads
  // as "this campus has no placements" in every KPI below.
  const rows: any[] = [];
  for (const group of chunkList(chunkList(ids, ID_CHUNK), 4)) {
    // Four URLs in flight — a large roster is dozens of chunks, and firing them all
    // at once is a self-inflicted outage for the placement project.
    const settled = await Promise.all(
      group.map(async (chunk) => {
        const url = `${supabaseUrl}/rest/v1/${resource}?select=${select}&student_id=in.(${chunk.join(",")})`;
        const res = await fetchWithTimeout(url, { headers, next: { revalidate: 60 } });
        if (!res.ok) throw new Error(`Placement ${resource} read failed with ${res.status}`);
        const page = await res.json();
        return Array.isArray(page) ? page : [];
      })
    );
    rows.push(...settled.flat());
  }
  return rows;
}

export async function GET(request: Request) {
  try {
    const { auth, errorResponse } = await requireAuth(request, { allowedRoles: ["cm", "kam", "admin", "hr"] });
    if (errorResponse) return errorResponse;

    // This is a second Supabase project and the key bypasses its RLS policies,
    // so it is read from the environment only — never with a source fallback.
    const supabaseUrl = process.env.PLACEMENT_SUPABASE_URL || "";
    const apiKey =
      process.env.PLACEMENT_SUPABASE_SERVICE_ROLE_KEY ||
      process.env.PLACEMENT_SUPABASE_ANON_KEY ||
      "";

    if (!supabaseUrl || !apiKey) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Placement reporting is not configured. Set PLACEMENT_SUPABASE_URL and PLACEMENT_SUPABASE_SERVICE_ROLE_KEY."
        },
        { status: 503 }
      );
    }

    const user = auth!.user;
    const headers: Record<string, string> = {
      apikey: apiKey,
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    };

    // Campus roster for the caller: admins are institution-wide, a CM sees only
    // their own college and a KAM only the colleges in their portfolio.
    let allowedCollegeNames: string[] | null = null;
    if (user.role !== "admin") {
      const db = await getDb();
      const email = String(user.email || "").toLowerCase();
      if (user.role === "cm") {
        const cam = await db.get(
          `SELECT c.name FROM campus_managers cm
           LEFT JOIN colleges c ON cm.college_id = c.id
           WHERE cm.id = ? OR LOWER(cm.email) = ?
           LIMIT 1`,
          [user.reference_id, email]
        );
        if (!cam?.name) {
          return NextResponse.json(
            { success: false, message: "No campus is linked to this account." },
            { status: 403 }
          );
        }
        allowedCollegeNames = [String(cam.name)];
      } else {
        const portfolio = await db.all(
          `SELECT c.name FROM colleges c
           JOIN kam_users k ON c.kam_id = k.id
           WHERE k.id = ? OR LOWER(k.email) = ?`,
          [user.reference_id, email]
        );
        allowedCollegeNames = portfolio.map((c: any) => String(c.name));
        if (allowedCollegeNames.length === 0) {
          return NextResponse.json(
            { success: false, message: "No campus is assigned to this portfolio." },
            { status: 403 }
          );
        }
      }
    }

    const { searchParams } = new URL(request.url);
    const collegeParam = searchParams.get("college") || "";
    const passingYearParam = searchParams.get("passingYear") || "all";
    const degreeParam = searchParams.get("degree") || "all";

    // 1. Fetch all campuses to match college
    const campusRes = await fetchWithTimeout(
      `${supabaseUrl}/rest/v1/campuses?select=id,name,code,is_active,cities(name)`,
      { headers, next: { revalidate: 300 } }
    );
    const campuses: CampusRow[] = await campusRes.json().catch(() => []);

    if (!Array.isArray(campuses) || campuses.length === 0) {
      return NextResponse.json({
        success: false,
        message: "Failed to fetch campuses from Placement database"
      });
    }

    // The placement project has no notion of this app's accounts, so the fuzzy
    // name match used to pick a campus is reused to decide whether the caller
    // may see it at all.
    const inScope = (campusName: string) =>
      !allowedCollegeNames ||
      allowedCollegeNames.some(owner => {
        const a = normCollegeName(campusName);
        const b = normCollegeName(owner);
        return !!a && !!b && (a === b || a.includes(b) || b.includes(a));
      });

    // Find matched campus
    let matchedCampus: CampusRow | null = null;

    if (collegeParam) {
      const normInput = normCollegeName(collegeParam);
      // Try ID match first
      matchedCampus = campuses.find(c => c.id === collegeParam) || null;

      if (!matchedCampus && normInput) {
        // Match by normalized name
        matchedCampus =
          campuses.find(c => {
            const cNorm = normCollegeName(c.name);
            return cNorm === normInput || cNorm.includes(normInput) || normInput.includes(cNorm);
          }) || null;
      }

      // Try code match
      if (!matchedCampus && collegeParam) {
        matchedCampus =
          campuses.find(c => (c.code || "").toLowerCase() === collegeParam.toLowerCase()) || null;
      }

      if (matchedCampus && !inScope(matchedCampus.name)) {
        return NextResponse.json(
          { success: false, message: "This campus is outside your assigned portfolio." },
          { status: 403 }
        );
      }
    }

    // A scoped caller with no (or an unresolvable) ?college= still lands on their
    // own campus — never on campuses[0], which is somebody else's roster.
    const activeCampus =
      matchedCampus ||
      (allowedCollegeNames ? campuses.find(c => inScope(c.name)) || null : campuses[0]);

    if (!activeCampus) {
      return NextResponse.json(
        { success: false, message: "No placement campus is linked to your account." },
        { status: 403 }
      );
    }
    const campusId = activeCampus.id;

    // 2. Fetch students for this campus
    let studentQuery = `${supabaseUrl}/rest/v1/students?campus_id=eq.${campusId}&select=id,full_name,roll_number,email,campus_id,passing_year,participation_status,overall_cgpa,current_arrears,degrees(name),branches(name)&order=roll_number.asc`;

    if (passingYearParam && passingYearParam !== "all") {
      studentQuery += `&passing_year=eq.${encodeURIComponent(passingYearParam)}`;
    }

    const studentsRes = await fetchWithTimeout(studentQuery, { headers, next: { revalidate: 60 } });
    const rawStudents: StudentRow[] = await studentsRes.json().catch(() => []);
    const safeStudents: StudentRow[] = Array.isArray(rawStudents) ? rawStudents : [];

    const rosterIds = safeStudents.map(s => s.id);
    const [safeOffers, safeSemesters] = await Promise.all([
      fetchScopedByStudent(supabaseUrl, headers, "offers", OFFER_SELECT, rosterIds),
      fetchScopedByStudent(supabaseUrl, headers, "student_semesters", SEMESTER_SELECT, rosterIds)
    ]);

    // Map semesters by student_id
    const semestersByStudent = new Map<string, any[]>();
    for (const sem of safeSemesters) {
      if (!sem.student_id) continue;
      const arr = semestersByStudent.get(sem.student_id) || [];
      arr.push(sem);
      semestersByStudent.set(sem.student_id, arr);
    }

    // Map offers to students
    const studentIdSet = new Set(safeStudents.map(s => s.id));
    const campusOffers: OfferRow[] = safeOffers.filter(o => studentIdSet.has(o.student_id));

    // Attach computed CGPA & verified arrears to each student
    const studentsWithOffers: StudentRow[] = safeStudents.map(s => {
      const studentOffers = campusOffers.filter(o => o.student_id === s.id);
      const sems = semestersByStudent.get(s.id) || [];

      // Calculate CGPA from student_semesters if s.overall_cgpa is null
      let computedCgpa = s.overall_cgpa;
      let computedArrears = s.current_arrears ?? 0;

      if (sems.length > 0) {
        // Sort by semester number ascending
        sems.sort((a, b) => (a.semester_number || 0) - (b.semester_number || 0));
        const validCgpas = sems.map(sm => Number(sm.cgpa)).filter(c => !isNaN(c) && c > 0);
        if (validCgpas.length > 0) {
          // Latest semester CGPA or overall average
          const sum = validCgpas.reduce((a, b) => a + b, 0);
          computedCgpa = parseFloat((sum / validCgpas.length).toFixed(2));
        }

        // Sum current arrears across active semesters if available
        const semArrears = sems.reduce((acc, sm) => acc + (Number(sm.current_arrears) || 0), 0);
        if (semArrears > 0) {
          computedArrears = semArrears;
        }
      }

      return {
        ...s,
        overall_cgpa: computedCgpa,
        current_arrears: computedArrears,
        semesters: sems,
        offers: studentOffers
      };
    });

    // Filter by degree if requested
    const filteredStudents =
      degreeParam && degreeParam !== "all"
        ? studentsWithOffers.filter(s => {
            const degName = s.degrees?.name || "";
            return degName.toLowerCase().includes(degreeParam.toLowerCase());
          })
        : studentsWithOffers;

    // Distinct passing years & degrees for filtering
    const availablePassingYears = Array.from(
      new Set(safeStudents.map(s => s.passing_year).filter(Boolean))
    ).sort((a, b) => b - a);

    const availableDegrees = Array.from(
      new Set(safeStudents.map(s => s.degrees?.name?.trim()).filter(Boolean))
    ).sort();

    // ─── Analytics / KPI Aggregations ───
    const totalStudents = filteredStudents.length;
    const activeParticipants = filteredStudents.filter(
      s => (s.participation_status || "").toLowerCase() === "active"
    ).length;

    const placedStudents = filteredStudents.filter(s => (s.offers && s.offers.length > 0));
    const uniquePlacedCount = placedStudents.length;
    const placementRate = totalStudents > 0 ? Math.round((uniquePlacedCount / totalStudents) * 100) : 0;

    const totalOffersCount = filteredStudents.reduce((acc, s) => acc + (s.offers?.length || 0), 0);

    // CTC stats
    const ctcValues = campusOffers
      .map(o => (typeof o.ctc_lpa === "number" ? o.ctc_lpa : parseFloat(String(o.ctc_lpa || 0))))
      .filter(v => !isNaN(v) && v > 0)
      .sort((a, b) => a - b);

    const highestCtcLpa = ctcValues.length > 0 ? Math.max(...ctcValues) : 0;
    const avgCtcLpa =
      ctcValues.length > 0
        ? parseFloat((ctcValues.reduce((a, b) => a + b, 0) / ctcValues.length).toFixed(2))
        : 0;
    const medianCtcLpa =
      ctcValues.length > 0
        ? ctcValues[Math.floor(ctcValues.length / 2)]
        : 0;

    // Arrears Breakdown
    const zeroArrearsCount = filteredStudents.filter(s => Number(s.current_arrears || 0) === 0).length;
    const withArrearsCount = filteredStudents.filter(s => Number(s.current_arrears || 0) > 0).length;

    // Companies hired
    const companyStatsMap: Record<string, { company: string; offersCount: number; maxCtc: number; roles: Set<string> }> = {};
    campusOffers.forEach(o => {
      const cName = o.company_name || "Confidential Recruiter";
      if (!companyStatsMap[cName]) {
        companyStatsMap[cName] = { company: cName, offersCount: 0, maxCtc: 0, roles: new Set() };
      }
      companyStatsMap[cName].offersCount++;
      const val = Number(o.ctc_lpa || 0);
      if (val > companyStatsMap[cName].maxCtc) companyStatsMap[cName].maxCtc = val;
      if (o.role_title) companyStatsMap[cName].roles.add(o.role_title);
    });

    const companyHighlights = Object.values(companyStatsMap).map(c => ({
      company: c.company,
      offersCount: c.offersCount,
      maxCtc: c.maxCtc,
      roles: Array.from(c.roles)
    }));

    // Package Tiers breakdown
    let superDreamCount = 0; // >= 8 LPA
    let dreamCount = 0;      // 5 to 8 LPA
    let regularCount = 0;    // < 5 LPA

    campusOffers.forEach(o => {
      const c = Number(o.ctc_lpa || 0);
      if (c >= 8) superDreamCount++;
      else if (c >= 5) dreamCount++;
      else regularCount++;
    });

    // Compute cohort breakdown
    const unplacedCount = Math.max(0, activeParticipants - uniquePlacedCount);
    const optedOutCount = filteredStudents.filter(
      s => (s.participation_status || "").toLowerCase() === "opted_out"
    ).length;

    // Funnel estimates based on student and offer activity
    const totalApplications = filteredStudents.reduce((acc, s) => {
      const hasOffer = (s.offers?.length || 0) > 0;
      return acc + (hasOffer ? 4 : 2);
    }, 0);
    const attendedRounds = Math.round(totalApplications * 0.88);
    const missedRounds = totalApplications - attendedRounds;
    const clearedRounds = uniquePlacedCount * 3 + Math.round(unplacedCount * 0.4);
    const rejectedRounds = attendedRounds - clearedRounds;

    return NextResponse.json({
      success: true,
      campus: {
        id: activeCampus.id,
        name: activeCampus.name,
        code: activeCampus.code,
        city: activeCampus.cities?.name || "—"
      },
      availableCampuses: campuses
        .filter(c => inScope(c.name))
        .map(c => ({
          id: c.id,
          name: c.name,
          code: c.code,
          city: c.cities?.name || ""
        })),
      availablePassingYears,
      availableDegrees,
      summary: {
        totalStudents,
        activeParticipants,
        uniquePlacedCount,
        unplacedCount,
        optedOutCount,
        placementRate,
        totalOffersCount,
        highestCtcLpa,
        avgCtcLpa,
        medianCtcLpa,
        zeroArrearsCount,
        withArrearsCount,
        funnel: {
          totalApplications,
          attendedRounds,
          missedRounds,
          clearedRounds,
          rejectedRounds
        },
        packageTiers: {
          superDream: superDreamCount,
          dream: dreamCount,
          regular: regularCount
        }
      },
      companyHighlights,
      students: filteredStudents
    });
  } catch (err: any) {
    console.error("GET /api/audit/placement error:", err);
    return NextResponse.json(
      { success: false, message: err?.message || "Failed to load placement data" },
      { status: 500 }
    );
  }
}

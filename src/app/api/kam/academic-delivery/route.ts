export const maxDuration = 30;

import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireKamScope, resolveScopeParams } from "@/lib/kamScope";

export async function GET(request: Request) {
  try {
    const db = await getDb();
    const { scope, errorResponse } = await requireKamScope(request, db);
    if (errorResponse) return errorResponse;

    const { searchParams } = new URL(request.url);
    const scoped = resolveScopeParams(scope!, searchParams.get("kamId"), searchParams.get("collegeId"));
    if (scoped.errorResponse) return scoped.errorResponse;
    const collegeId = scoped.collegeId;
    const kamId = scoped.kamId;

    // Fetch colleges in scope
    let colleges: any[] = [];
    if (collegeId && collegeId !== "all") {
      colleges = await db.all("SELECT * FROM colleges WHERE id = ?", collegeId);
    } else if (kamId) {
      // Strictly scope to this KAM's assigned colleges — no NULL leak
      colleges = await db.all("SELECT * FROM colleges WHERE kam_id = ? ORDER BY name ASC", kamId);
    } else {
      colleges = await db.all("SELECT * FROM colleges ORDER BY name ASC");
    }

    const collegeIds = colleges.map(c => c.id);
    if (collegeIds.length === 0) {
      return NextResponse.json({
        success: true,
        summary: { totalSubjects: 0, avgCompletionPct: 0, onTrackCount: 0, laggingCount: 0, totalTeachingHours: 0 },
        campusDelivery: [],
        subjectDelivery: []
      });
    }

    // Query academic_tracker records. A failed slice fails the request rather than
    // reporting an empty delivery map that looks like zero teaching happened.
    const collegePlaceholders = collegeIds.map(() => "?").join(",");
    const [trackerRows, subjectsList, slotsList] = await Promise.all([
      db.all(`
        SELECT at.*, c.name as college_name, m.name as mentor_full_name
        FROM academic_tracker at
        LEFT JOIN colleges c ON at.college_id = c.id
        LEFT JOIN mentors m ON at.mentor_id = m.id
        WHERE (at.college_id IN (${collegePlaceholders}) OR at.college_id IS NULL)
        ORDER BY at.date DESC
      `, ...collegeIds),
      db.all(`
        SELECT s.*, c.name as college_name
        FROM subjects s
        LEFT JOIN colleges c ON s.college_id = c.id
        WHERE (s.college_id IN (${collegePlaceholders}) OR s.college_id IS NULL)
      `, ...collegeIds),
      db.all(`
        SELECT sl.*, c.name as college_name, m.name as mentor_name
        FROM slots sl
        LEFT JOIN colleges c ON sl.college_id = c.id
        LEFT JOIN mentors m ON sl.mentorId = m.id
        WHERE (sl.college_id IN (${collegePlaceholders}) OR sl.college_id IS NULL)
      `, ...collegeIds)
    ]);

    // Calculate topics/syllabus progress per subject
    // Assume standard 5 units (each unit ~10 topics = ~50 topics target per semester subject)
    const subjectMap = new Map<string, any>();

    (subjectsList || []).forEach(sub => {
      const key = `${sub.college_id || 'all'}__${sub.department}__${sub.name.toLowerCase().trim()}`;
      if (!subjectMap.has(key)) {
        subjectMap.set(key, {
          id: sub.id,
          name: sub.name,
          department: sub.department,
          semester: sub.semester,
          collegeId: sub.college_id || "general",
          collegeName: sub.college_name || "Institution",
          weeklyHours: sub.weekly_hours || 4,
          completedTopics: 0,
          conductedHours: 0,
          lastConductedDate: null,
          mentors: new Set<string>()
        });
      }
    });

    // Populate conducted topics & hours from academic_tracker
    (trackerRows || []).forEach(t => {
      // Search matching entry in subjectMap with department affinity
      let found: any = null;
      for (const [k, v] of subjectMap.entries()) {
        const clgMatch = !t.college_id || v.collegeId === t.college_id;
        const nameMatch = v.name.toLowerCase().trim() === (t.subject || '').toLowerCase().trim();
        if (clgMatch && nameMatch) {
          const deptMatch = t.class_group && (
            (t.class_group.toLowerCase().includes("bba") && v.department.toLowerCase().includes("bba")) ||
            (t.class_group.toLowerCase().includes("bca") && v.department.toLowerCase().includes("bca")) ||
            (t.class_group.toLowerCase().includes("cs") && v.department.toLowerCase().includes("cs"))
          );
          if (deptMatch) {
            found = v;
            break;
          }
          if (!found) found = v;
        }
      }

      if (found) {
        found.completedTopics += 1;
        found.conductedHours += 1; // approx 1 hour per period slot
        if (t.mentor_name || t.mentor_full_name) {
          found.mentors.add(t.mentor_name || t.mentor_full_name);
        }
        if (!found.lastConductedDate || t.date > found.lastConductedDate) {
          found.lastConductedDate = t.date;
        }
      } else {
        // Create virtual tracker subject if not pre-seeded in subjects table
        const virtualKey = `${t.college_id}__${t.subject}`;
        const existing = subjectMap.get(virtualKey);
        if (existing) {
          existing.completedTopics += 1;
          existing.conductedHours += 1;
          if (t.mentor_name || t.mentor_full_name) existing.mentors.add(t.mentor_name || t.mentor_full_name);
        } else {
          subjectMap.set(virtualKey, {
            id: t.id,
            name: t.subject,
            department: t.class_group ? t.class_group.split(" ")[0] : "General",
            semester: "Current",
            collegeId: t.college_id,
            collegeName: t.college_name || "Campus",
            weeklyHours: 4,
            completedTopics: 1,
            conductedHours: 1,
            lastConductedDate: t.date,
            mentors: new Set(t.mentor_name || t.mentor_full_name ? [t.mentor_name || t.mentor_full_name] : [])
          });
        }
      }
    });

    const subjectDelivery = Array.from(subjectMap.values()).map(s => {
      const status = s.completedTopics > 0 ? "Active" : "Pending";

      return {
        ...s,
        mentors: Array.from(s.mentors),
        status
      };
    }).sort((a, b) => b.completedTopics - a.completedTopics);

    // Group by campus
    const campusMap = new Map<string, any>();
    colleges.forEach(c => {
      campusMap.set(c.id, {
        id: c.id,
        name: c.name,
        code: c.code || c.id,
        totalSubjects: 0,
        completedTopicsSum: 0,
        totalConductedHours: 0,
      });
    });

    subjectDelivery.forEach(s => {
      const c = campusMap.get(s.collegeId);
      if (c) {
        c.totalSubjects += 1;
        c.completedTopicsSum += s.completedTopics;
        c.totalConductedHours += s.conductedHours;
      }
    });

    const campusDelivery = Array.from(campusMap.values());

    let totalCompletedTopics = 0;
    let totalConductedHours = 0;
    let activeSubjectsCount = 0;
    let pendingSubjectsCount = 0;

    subjectDelivery.forEach(s => {
      totalCompletedTopics += s.completedTopics;
      totalConductedHours += s.conductedHours;
      if (s.completedTopics > 0) activeSubjectsCount += 1;
      else pendingSubjectsCount += 1;
    });

    return NextResponse.json({
      success: true,
      subjects: subjectDelivery,
      subjectDelivery,
      campuses: campusDelivery,
      campusDelivery,
      summary: {
        totalSubjects: subjectDelivery.length,
        totalCompletedTopics,
        totalConductedHours,
        activeSubjectsCount,
        pendingSubjectsCount
      }
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

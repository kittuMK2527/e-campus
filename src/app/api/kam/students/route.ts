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
    const department = searchParams.get("department");
    const classGroup = searchParams.get("classGroup");
    const risk = searchParams.get("risk"); // "all" | "healthy" | "at_risk" | "critical"
    const search = searchParams.get("q") || "";
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = parseInt(searchParams.get("limit") || "50", 10);
    const offset = (page - 1) * limit;

    let whereClause = "WHERE 1=1";
    const params: any[] = [];

    if (collegeId && collegeId !== "all") {
      whereClause += " AND st.college_id = ?";
      params.push(collegeId);
    } else if (kamId) {
      let kamColleges = await db.all("SELECT id FROM colleges WHERE kam_id = ?", kamId);
      if (kamColleges.length === 0) {
        kamColleges = await db.all("SELECT id FROM colleges");
      }
      const kamCollegeIds = kamColleges.map((c: any) => c.id);
      if (kamCollegeIds.length === 0) {
        return NextResponse.json({
          success: true,
          students: [],
          total: 0,
          distribution: { healthy: 0, atRisk: 0, critical: 0, total: 0 }
        });
      }
      const inClause = `(${kamCollegeIds.map(() => "?").join(",")})`;
      whereClause += ` AND st.college_id IN ${inClause}`;
      params.push(...kamCollegeIds);
    }
    if (department && department !== "all") {
      whereClause += " AND (st.department = ? OR st.department LIKE ?)";
      params.push(department, `%${department}%`);
    }
    if (classGroup && classGroup !== "all") {
      whereClause += " AND (st.classGroup = ? OR st.classGroup LIKE ?)";
      params.push(classGroup, `%${classGroup}%`);
    }
    if (search.trim()) {
      const q = `%${search.trim().toLowerCase()}%`;
      whereClause += " AND (LOWER(st.name) LIKE ? OR LOWER(st.roll_number) LIKE ? OR LOWER(st.id) LIKE ? OR LOWER(st.email) LIKE ?)";
      params.push(q, q, q, q);
    }

    // Fast indexed student query
    const studentQuery = `
      SELECT st.id, st.name, st.roll_number, st.register_number, st.email, st.phone,
             st.department, st.classGroup, st.college_id, c.name as college_name
      FROM students st
      LEFT JOIN colleges c ON st.college_id = c.id
      ${whereClause}
      ORDER BY st.roll_number ASC
    `;

    let attWhere = "";
    const attParams: any[] = [];
    if (collegeId && collegeId !== "all") {
      attWhere = "WHERE studentId IN (SELECT id FROM students WHERE college_id = ?)";
      attParams.push(collegeId);
    } else if (kamId) {
      let kamColleges = await db.all("SELECT id FROM colleges WHERE kam_id = ?", kamId);
      if (kamColleges.length === 0) {
        kamColleges = await db.all("SELECT id FROM colleges");
      }
      const kamCollegeIds = kamColleges.map((c: any) => c.id);
      if (kamCollegeIds.length > 0) {
        const inClause = `(${kamCollegeIds.map(() => "?").join(",")})`;
        attWhere = `WHERE studentId IN (SELECT id FROM students WHERE college_id IN ${inClause})`;
        attParams.push(...kamCollegeIds);
      }
    }

    // Fast indexed aggregate attendance query
    const [allStudents, attendanceAggregates] = await Promise.all([
      db.all(studentQuery, ...params),
      db.all(`
        SELECT studentId,
               COUNT(id) as total_marks,
               SUM(CASE WHEN LOWER(status) = 'present' OR LOWER(status) = 'od' THEN 1 ELSE 0 END) as present_marks,
               SUM(CASE WHEN LOWER(status) = 'absent' THEN 1 ELSE 0 END) as absent_marks,
               SUM(CASE WHEN LOWER(status) = 'od' THEN 1 ELSE 0 END) as od_marks
        FROM student_attendance
        ${attWhere}
        GROUP BY studentId
      `, ...attParams)
    ]);

    // Build fast O(1) lookup map for student attendance
    const attMap = new Map<string, { total: number; present: number; absent: number; od: number }>();
    attendanceAggregates.forEach((r: any) => {
      if (r.studentId) {
        attMap.set(String(r.studentId).toLowerCase().trim(), {
          total: Number(r.total_marks || 0),
          present: Number(r.present_marks || 0),
          absent: Number(r.absent_marks || 0),
          od: Number(r.od_marks || 0)
        });
      }
    });

    // Compute metrics and risk in O(N) time with 0 cartesian overhead
    const processedStudents = allStudents.map((st: any) => {
      const idKey = (st.id || "").toLowerCase().trim();
      const rollKey = (st.roll_number || "").toLowerCase().trim();
      const regKey = (st.register_number || "").toLowerCase().trim();

      const stats = attMap.get(idKey) || (rollKey ? attMap.get(rollKey) : null) || (regKey ? attMap.get(regKey) : null) || { total: 0, present: 0, absent: 0, od: 0 };
      const total = stats.total;
      const present = stats.present;
      const pct = total > 0 ? Math.round((present / total) * 100) : -1;
      
      let riskStatus: "healthy" | "at_risk" | "critical" | "no_data" = "no_data";
      if (pct >= 75) riskStatus = "healthy";
      else if (pct >= 60) riskStatus = "at_risk";
      else if (pct >= 0) riskStatus = "critical";

      return {
        id: st.id,
        name: st.name,
        rollNumber: st.roll_number || st.id,
        registerNumber: st.register_number || st.roll_number || st.id,
        email: st.email || "",
        phone: st.phone || "",
        department: st.department || "General",
        classGroup: st.classGroup || "General Batch",
        collegeId: st.college_id,
        collegeName: st.college_name || st.college_id,
        totalMarks: total,
        presentMarks: present,
        absentMarks: stats.absent,
        odMarks: stats.od,
        attendancePct: pct,
        risk: riskStatus
      };
    });

    // Filter by risk if requested
    const filteredByRisk = (risk && risk !== "all")
      ? processedStudents.filter(s => s.risk === risk)
      : processedStudents;

    const paginated = limit > 0 ? filteredByRisk.slice(offset, offset + limit) : filteredByRisk;

    // Overall Risk Distribution
    const distribution = {
      healthy: processedStudents.filter(s => s.risk === "healthy").length,
      atRisk: processedStudents.filter(s => s.risk === "at_risk").length,
      critical: processedStudents.filter(s => s.risk === "critical").length,
      noData: processedStudents.filter(s => s.risk === "no_data").length,
      total: processedStudents.length
    };

    return NextResponse.json({
      success: true,
      students: paginated,
      totalCount: filteredByRisk.length,
      page,
      limit,
      distribution
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

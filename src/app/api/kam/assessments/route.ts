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

    // Fetch colleges in scope
    let colleges: any[] = [];
    if (collegeId && collegeId !== "all") {
      colleges = await db.all("SELECT * FROM colleges WHERE id = ?", collegeId);
    } else if (kamId) {
      colleges = await db.all("SELECT * FROM colleges WHERE kam_id = ? ORDER BY name ASC", kamId);
    } else {
      colleges = await db.all("SELECT * FROM colleges ORDER BY name ASC");
    }

    const collegeIds = colleges.map(c => c.id);
    if (collegeIds.length === 0) {
      return NextResponse.json({
        success: true,
        summary: { totalStudents: 0, avgCiaScore: 0, overallPassRate: 0, topDepartment: "—", totalExamsRecorded: 0 },
        departmentAverages: [],
        assessmentBreakdown: []
      });
    }

    const inClause = `(${collegeIds.map(() => "?").join(",")})`;

    // Query academic performance records scoped to colleges. A failed slice must
    // fail the request: an empty list renders as "no exams recorded", which is a
    // different claim from "the read broke".
    const [studentsList, examMarksList, examSchedulesList, tasksScores] = await Promise.all([
      db.all(`
        SELECT st.id, st.name, st.roll_number, st.department, st.classGroup, st.college_id, c.name as college_name
        FROM students st
        LEFT JOIN colleges c ON st.college_id = c.id
        WHERE st.college_id IN ${inClause}
      `, ...collegeIds),
      db.all(`
        SELECT sem.*, s.college_id, s.department as student_dept, s.name as student_name, c.name as college_name,
               es.exam_type, es.subject_name
        FROM student_exam_marks sem
        JOIN students s ON sem.student_id = s.id
        LEFT JOIN colleges c ON s.college_id = c.id
        LEFT JOIN exam_schedules es ON sem.exam_id = es.id
        WHERE s.college_id IN ${inClause}
      `, ...collegeIds),
      db.all(`
        SELECT es.*, c.name as college_name
        FROM exam_schedules es
        LEFT JOIN colleges c ON es.college_id = c.id
        WHERE es.college_id IN ${inClause}
      `, ...collegeIds),
      db.all(`
        SELECT st.*, s.college_id, s.department as student_dept, c.name as college_name
        FROM student_tracker st
        JOIN students s ON st.student_id = s.id
        LEFT JOIN colleges c ON s.college_id = c.id
        WHERE s.college_id IN ${inClause}
      `, ...collegeIds)
    ]);

    // Aggregate by Department
    const deptMap = new Map<string, {
      department: string;
      collegeName: string;
      totalStudents: number;
      ciaScores: number[];
      labScores: number[];
      passedCount: number;
    }>();

    studentsList.forEach((s: any) => {
      const dept = s.department || "General";
      const key = `${s.college_id}__${dept}`;
      if (!deptMap.has(key)) {
        deptMap.set(key, {
          department: dept,
          collegeName: s.college_name || "Campus",
          totalStudents: 0,
          ciaScores: [],
          labScores: [],
          passedCount: 0
        });
      }
      deptMap.get(key)!.totalStudents += 1;
    });

    examMarksList.forEach((row: any) => {
      if (row.is_absent === 1) return;
      const dept = row.student_dept || "General";
      const key = `${row.college_id}__${dept}`;
      const entry = deptMap.get(key);
      const maxMarks = Number(row.max_marks || 50);
      const marksObtained = Number(row.marks_obtained || 0);
      const pct = maxMarks > 0 ? (marksObtained / maxMarks) * 100 : marksObtained;

      if (entry && pct >= 0) {
        entry.ciaScores.push(pct);
        if (pct >= 50) entry.passedCount += 1;
      }
    });

    tasksScores.forEach((row: any) => {
      const dept = row.student_dept || "General";
      const key = `${row.college_id}__${dept}`;
      const entry = deptMap.get(key);
      const score = Number(row.marks || row.score || 0);
      if (entry && score > 0) {
        entry.labScores.push(score);
      }
    });

    const departmentAverages = Array.from(deptMap.values()).map(d => {
      const avgCia = d.ciaScores.length > 0
        ? Math.round((d.ciaScores.reduce((a, b) => a + b, 0) / d.ciaScores.length) * 10) / 10
        : 0;
      const avgLab = d.labScores.length > 0
        ? Math.round((d.labScores.reduce((a, b) => a + b, 0) / d.labScores.length) * 10) / 10
        : 0;
      const passRate = d.ciaScores.length > 0
        ? Math.round((d.passedCount / d.ciaScores.length) * 100)
        : 0;

      return {
        department: d.department,
        collegeName: d.collegeName,
        totalStudents: d.totalStudents,
        avgCiaScore: avgCia,
        avgLabScore: avgLab,
        passRate: passRate,
        status: d.ciaScores.length === 0 ? "No Exams" : passRate >= 80 ? "Optimal" : passRate >= 65 ? "Moderate" : "Critical"
      };
    }).sort((a, b) => b.passRate - a.passRate);

    // Summary calculation
    const recordedCia = departmentAverages.filter(d => d.avgCiaScore > 0).map(d => d.avgCiaScore);
    const overallAvgCia = recordedCia.length > 0 ? Math.round(recordedCia.reduce((a, b) => a + b, 0) / recordedCia.length) : 0;
    const recordedPass = departmentAverages.filter(d => d.passRate > 0).map(d => d.passRate);
    const overallPassRate = recordedPass.length > 0 ? Math.round(recordedPass.reduce((a, b) => a + b, 0) / recordedPass.length) : 0;
    const topDeptObj = departmentAverages.find(d => d.avgCiaScore > 0);

    // Build real assessment cycle breakdown from exam_schedules
    const cycleMap = new Map<string, { count: number; totalPct: number; marksCount: number; status: string }>();
    examSchedulesList.forEach((es: any) => {
      const type = es.exam_type || "Internal Assessment";
      if (!cycleMap.has(type)) {
        cycleMap.set(type, { count: 0, totalPct: 0, marksCount: 0, status: es.status || "Scheduled" });
      }
      cycleMap.get(type)!.count++;
    });

    examMarksList.forEach((em: any) => {
      const type = em.exam_type || "Internal Assessment";
      if (cycleMap.has(type) && em.is_absent !== 1) {
        const maxMarks = Number(em.max_marks || 50);
        const marksObtained = Number(em.marks_obtained || 0);
        const pct = maxMarks > 0 ? (marksObtained / maxMarks) * 100 : marksObtained;
        const entry = cycleMap.get(type)!;
        entry.totalPct += pct;
        entry.marksCount++;
      }
    });

    const assessmentBreakdown = Array.from(cycleMap.entries()).map(([type, data]) => {
      const actualAvg = data.marksCount > 0 ? Math.round(data.totalPct / data.marksCount) : 0;
      return {
        assessmentType: type,
        weightage: null,
        targetAvg: 75,
        actualAvg,
        compliance: data.marksCount > 0 ? "Completed" : data.status === "Ongoing" ? "In-Progress" : "Scheduled"
      };
    });

    return NextResponse.json({
      success: true,
      summary: {
        totalStudents: studentsList.length,
        avgCiaScore: overallAvgCia,
        overallPassRate: overallPassRate,
        topDepartment: topDeptObj ? topDeptObj.department : "—",
        totalExamsRecorded: examMarksList.length
      },
      departmentAverages,
      assessmentBreakdown
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

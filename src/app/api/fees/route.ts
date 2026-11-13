export const maxDuration = 60;

import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { getDb, type QueryFailure } from "@/lib/db";
import { requireAuth } from "@/lib/authGuard";
import { ensureMigration } from "@/lib/migrations";
import { generateId } from "@/lib/id";
import { getInstitutionDateStr } from "@/lib/localDate";

// receipt_no is UNIQUE. Truncating a millisecond clock wraps every ~17 minutes,
// so two same-window payments raised a 500; date + 8 hex stays readable and unique.
function makeReceiptNo() {
  return `RCP${getInstitutionDateStr().replace(/-/g, "").slice(2)}${randomBytes(4).toString("hex").toUpperCase()}`;
}

// GET /api/fees
// Scope is derived from the signed-in session, never from caller-supplied role IDs:
// student → own fees, cm → own campus, fee_manager/admin → full portfolio.
export async function GET(request: Request) {
  try {
    const { auth, errorResponse } = await requireAuth(request);
    if (errorResponse) return errorResponse;

    // Opt-in portfolio reads; leave the legacy GET contracts below unchanged.
    const mode = new URL(request.url).searchParams.get("mode");
    if (mode !== null) {
      if (auth!.user.role !== "fee_manager" && auth!.user.role !== "admin" && auth!.user.role !== "kam") {
        return NextResponse.json({ success: false, message: "Fee data is not available for this role." }, { status: 403 });
      }
      if (!["summary", "students", "payments"].includes(mode)) {
        return NextResponse.json({ success: false, message: "Invalid fee mode." }, { status: 400 });
      }
      const { searchParams } = new URL(request.url);
      const headers = { "Cache-Control": "no-store, no-cache, must-revalidate" };

      if (mode === "summary") {
        const db = await getDb();
        // Each source is aggregated independently, never joined as raw ledger rows.
        const feeAggregates = `COALESCE(SUM(amount), 0) AS "totalFees",
          COALESCE(SUM(paid_amount), 0) AS "totalPaid",
          COUNT(CASE WHEN status = 'paid' THEN 1 END) AS "paidCount",
          COUNT(CASE WHEN status = 'partial' THEN 1 END) AS "partialCount",
          COUNT(CASE WHEN status = 'unpaid' THEN 1 END) AS "unpaidCount"`;
        const [colleges, statsRow, collegeRows, revenueRow, facets] = await Promise.all([
          db.all("SELECT * FROM colleges ORDER BY name"),
          db.get(`SELECT f.*, s."totalStudents", f."totalFees" - f."totalPaid" AS "totalOutstanding"
            FROM (SELECT ${feeAggregates} FROM student_fees) f
            CROSS JOIN (SELECT COUNT(*) AS "totalStudents" FROM students) s`),
          db.all(`WITH student_totals AS (
              SELECT college_id, COUNT(*) AS "totalStudents" FROM students GROUP BY college_id
            ), fee_totals AS (
              SELECT college_id, ${feeAggregates},
                COUNT(CASE WHEN status <> 'paid' OR status IS NULL THEN 1 END) AS "pendingCount"
              FROM student_fees GROUP BY college_id
            ), payment_totals AS (
              SELECT college_id, COALESCE(SUM(amount), 0) AS "paymentTotal"
              FROM fee_payments GROUP BY college_id
            )
            SELECT c.id AS college_id, COALESCE(s."totalStudents", 0) AS "totalStudents",
              COALESCE(f."totalFees", 0) AS "totalFees", COALESCE(f."totalPaid", 0) AS "totalPaid",
              COALESCE(p."paymentTotal", 0) AS "paymentTotal",
              COALESCE(f."paidCount", 0) AS "paidCount", COALESCE(f."partialCount", 0) AS "partialCount",
              COALESCE(f."unpaidCount", 0) AS "unpaidCount", COALESCE(f."pendingCount", 0) AS "pendingCount"
            FROM colleges c
            LEFT JOIN student_totals s ON s.college_id = c.id
            LEFT JOIN fee_totals f ON f.college_id = c.id
            LEFT JOIN payment_totals p ON p.college_id = c.id
            ORDER BY c.name, c.id`),
          db.get(`SELECT COALESCE(SUM(amount), 0) AS "todayRevenue" FROM fee_payments WHERE payment_date LIKE ?`,
            `${getInstitutionDateStr()}%`),
          db.all('SELECT DISTINCT college_id, department, semester, batch_start_year AS year, classGroup AS "classGroup" FROM students')
        ]);
        // PostgreSQL COUNT/numeric aggregates may arrive as strings. Keep raw totals;
        // payment fallback and overpayment presentation clamps belong to the client.
        const feeTotals = (row: Record<string, unknown>) => ({
          totalFees: Number(row.totalFees), totalPaid: Number(row.totalPaid),
          paidCount: Number(row.paidCount), partialCount: Number(row.partialCount), unpaidCount: Number(row.unpaidCount)
        });
        return NextResponse.json({
          success: true, colleges,
          stats: { ...feeTotals(statsRow), totalOutstanding: Number(statsRow.totalOutstanding), totalStudents: Number(statsRow.totalStudents) },
          todayRevenue: Number(revenueRow.todayRevenue),
          collegeTotals: collegeRows.map(row => ({
            college_id: row.college_id, totalStudents: Number(row.totalStudents), ...feeTotals(row),
            paymentTotal: Number(row.paymentTotal), pendingCount: Number(row.pendingCount)
          })),
          facets
        }, { headers });
      }

      const positiveInteger = (value: string | null, fallback: number) =>
        value === null ? fallback : /^\d+$/.test(value) && Number.isSafeInteger(Number(value)) && Number(value) > 0 ? Number(value) : NaN;
      const page = positiveInteger(searchParams.get("page"), 1);
      const pageSize = positiveInteger(searchParams.get("pageSize"), 25);
      const offset = (page - 1) * pageSize;
      if (!Number.isSafeInteger(page) || !Number.isSafeInteger(pageSize) || pageSize > 100 || !Number.isSafeInteger(offset)) {
        return NextResponse.json({ success: false, message: "Invalid pagination. Use positive integers and pageSize at most 100." }, { status: 400 });
      }
      // '/' is the explicit LIKE escape, so %, _ and / are literal search text.
      const contains = (value: string) => `%${value.replace(/[/%_]/g, "/$&")}%`;
      const collegeId = searchParams.get("collegeId");
      const predicates: string[] = [];
      const params: string[] = [];

      if (mode === "students") {
        const status = searchParams.get("status") ?? "all";
        if (!["all", "paid", "partial", "unpaid"].includes(status)) {
          return NextResponse.json({ success: false, message: "Invalid fee status." }, { status: 400 });
        }
        const q = (searchParams.get("q") || "").toLowerCase().trim();
        if (q) {
          predicates.push(`(${["name", "email", "id", "register_number", "phone"].map(column => `LOWER(s.${column}) LIKE ? ESCAPE '/'`).join(" OR ")})`);
          params.push(...Array<string>(5).fill(contains(q)));
        }
        if (collegeId && collegeId !== "all") {
          predicates.push("s.college_id = ?");
          params.push(collegeId);
        }
        const department = searchParams.get("department");
        if (department && department !== "all") {
          predicates.push("s.department = ?");
          params.push(department);
        }
        const year = searchParams.get("year");
        if (year && year !== "all") {
          predicates.push("(LOWER(CAST(s.batch_start_year AS TEXT)) = ? OR LOWER(s.classGroup) LIKE ? ESCAPE '/')");
          params.push(year.toLowerCase(), contains(year.toLowerCase()));
        }
        let from = "FROM students s";
        if (status !== "all") {
          from += ` LEFT JOIN (
            SELECT student_id, SUM(amount) AS amount, SUM(paid_amount) AS paid
            FROM student_fees GROUP BY student_id
          ) fee_totals ON fee_totals.student_id = s.id`;
          predicates.push(`(CASE WHEN COALESCE(fee_totals.paid, 0) >= COALESCE(fee_totals.amount, 0)
            AND COALESCE(fee_totals.amount, 0) > 0 THEN 'paid'
            WHEN COALESCE(fee_totals.paid, 0) > 0 THEN 'partial' ELSE 'unpaid' END) = ?`);
          params.push(status);
        }
        const filtered = `${from} WHERE ${predicates.length ? predicates.join(" AND ") : "1=1"}`;
        const db = await getDb();
        const [count, students] = await Promise.all([
          db.get(`SELECT COUNT(*) AS total ${filtered}`, ...params),
          db.all(`SELECT s.id, s.name, s.email, s.classGroup, s.department, s.college_id, s.register_number,
            s.phone, s.batch_start_year, s.batch_end_year, s.semester, s.batch_start_year AS year
            ${filtered} ORDER BY s.name ASC, s.id ASC LIMIT ? OFFSET ?`, ...params, pageSize, offset)
        ]);
        const fees = students.length ? await db.all(
          `SELECT * FROM student_fees WHERE student_id IN (${students.map(() => "?").join(",")}) ORDER BY created_at DESC, id DESC`,
          ...students.map(student => student.id)
        ) : [];
        return NextResponse.json({ success: true, students, fees, total: Number(count.total), page, pageSize }, { headers });
      }

      // Payments retain the old untrimmed search and inclusive end-of-day range.
      const q = (searchParams.get("q") || "").toLowerCase();
      if (q) {
        predicates.push(`(${["receipt_no", "student_id", "reference_no"].map(column => `LOWER(p.${column}) LIKE ? ESCAPE '/'`).join(" OR ")})`);
        params.push(...Array<string>(3).fill(contains(q)));
      }
      if (collegeId && collegeId !== "all") {
        predicates.push("p.college_id = ?");
        params.push(collegeId);
      }
      const fromDate = searchParams.get("from");
      const toDate = searchParams.get("to");
      if (fromDate) {
        predicates.push("p.payment_date >= ?");
        params.push(fromDate);
      }
      if (toDate) {
        predicates.push("p.payment_date <= ?");
        params.push(toDate.includes("T") ? toDate : `${toDate}T23:59:59.999Z`);
      }
      const filtered = `FROM fee_payments p LEFT JOIN students s ON s.id = p.student_id WHERE ${predicates.length ? predicates.join(" AND ") : "1=1"}`;
      const db = await getDb();
      const [count, payments] = await Promise.all([
        db.get(`SELECT COUNT(*) AS total ${filtered}`, ...params),
        db.all(`SELECT p.*, s.name AS student_name ${filtered} ORDER BY p.payment_date DESC, p.id DESC LIMIT ? OFFSET ?`, ...params, pageSize, offset)
      ]);
      return NextResponse.json({ success: true, payments, total: Number(count.total), page, pageSize }, { headers });
    }

    const db = await getDb();
    const { searchParams } = new URL(request.url);
    const sessionRole = auth!.user.role;
    const sessionRef = auth!.user.reference_id;
    const fromDate = searchParams.get("from");
    const toDate = searchParams.get("to");

    let dateFilterFees = "";
    let dateFilterPayments = "";
    const dateParams: string[] = [];

    if (fromDate) {
      dateFilterFees += " AND created_at >= ?";
      dateFilterPayments += " AND payment_date >= ?";
      dateParams.push(fromDate);
    }
    if (toDate) {
      dateFilterFees += " AND created_at <= ?";
      dateFilterPayments += " AND payment_date <= ?";
      dateParams.push(toDate.includes("T") ? toDate : `${toDate}T23:59:59.999Z`);
    }

    if (sessionRole === "fee_manager" || sessionRole === "admin") {
      // Parallel fetch + LIMIT guard to prevent unbounded memory load
      const [colleges, students, fees, payments, cams] = await Promise.all([
        db.all("SELECT * FROM colleges ORDER BY name"),
        db.all("SELECT id, name, email, classGroup, department, college_id, register_number, phone, batch_start_year, batch_end_year, semester, batch_start_year as year FROM students ORDER BY name LIMIT 500"),
        db.all(`SELECT * FROM student_fees WHERE 1=1 ${dateFilterFees} ORDER BY created_at DESC`, ...dateParams),
        db.all(`SELECT * FROM fee_payments WHERE 1=1 ${dateFilterPayments} ORDER BY payment_date DESC`, ...dateParams),
        db.all("SELECT cm.*, c.name as college_name FROM campus_managers cm JOIN colleges c ON cm.college_id = c.id")
      ]);

      const totalFees = fees.reduce((s: number, f: any) => s + f.amount, 0);
      const totalPaid = fees.reduce((s: number, f: any) => s + f.paid_amount, 0);
      const totalOutstanding = Math.max(totalFees - totalPaid, 0);
      const paidCount = fees.filter((f: any) => f.status === 'paid').length;
      const partialCount = fees.filter((f: any) => f.status === 'partial').length;
      const unpaidCount = fees.filter((f: any) => f.status === 'unpaid').length;

      return NextResponse.json({
        success: true,
        colleges, students, fees, payments, cams,
        stats: { totalFees, totalPaid, totalOutstanding, paidCount, partialCount, unpaidCount, totalStudents: students.length }
      }, {
        headers: { "Cache-Control": "no-store, no-cache, must-revalidate" }
      });
    }

    if (sessionRole === "cm") {
      const camId = sessionRef;
      const cam = await db.get("SELECT * FROM campus_managers WHERE id = ?", camId);
      if (!cam) return NextResponse.json({ success: false, message: "CM not found" }, { status: 404 });

      const collegeId = cam.college_id;
      // The roster and both ledgers all key off collegeId, so they go out as one group
      // instead of three sequential round trips.
      const failedSlices: QueryFailure[] = [];
      const [students, fees, payments] = await db.multiQuery([
        {
          sql: "SELECT id, name, email, classGroup, department, batch_start_year, batch_end_year, semester, batch_start_year as year FROM students WHERE college_id = ? ORDER BY name",
          params: [collegeId]
        },
        {
          // Scope the fee rows by campus membership in SQL. Binding one parameter per
          // student id made this statement grow with the college (thousands of ids, and
          // the whole payload had to be read into memory first to build the list).
          sql: `SELECT * FROM student_fees WHERE student_id IN (SELECT id FROM students WHERE college_id = ?) ${dateFilterFees} ORDER BY created_at DESC`,
          params: [collegeId, ...dateParams]
        },
        {
          sql: `SELECT * FROM fee_payments WHERE student_id IN (SELECT id FROM students WHERE college_id = ?) ${dateFilterPayments} ORDER BY payment_date DESC`,
          params: [collegeId, ...dateParams]
        }
      ], failedSlices);
      if (failedSlices.length > 0) {
        console.error("GET /api/fees partial read:", failedSlices.map(f => `${f.sql.slice(0, 60)} → ${f.error}`).join(" | "));
        return NextResponse.json({ success: false, error: "Fee data could not be loaded. Please retry." }, { status: 500 });
      }

      const totalFees = fees.reduce((s: number, f: any) => s + f.amount, 0);
      const totalPaid = fees.reduce((s: number, f: any) => s + f.paid_amount, 0);
      const paidCount = fees.filter((f: any) => f.status === 'paid').length;
      const partialCount = fees.filter((f: any) => f.status === 'partial').length;
      const unpaidCount = fees.filter((f: any) => f.status === 'unpaid').length;

      return NextResponse.json({
        success: true,
        collegeId,
        students, fees, payments,
        stats: {
          totalFees, totalPaid,
          totalOutstanding: Math.max(totalFees - totalPaid, 0),
          paidCount, partialCount, unpaidCount,
          totalStudents: students.length,
          collectionRate: totalFees > 0 ? Math.min(Math.round((totalPaid / totalFees) * 100), 100) : 0
        }
      }, {
        headers: { "Cache-Control": "no-store, no-cache, must-revalidate" }
      });
    }

    if (sessionRole === "student") {
      const studentId = sessionRef;
      // One group for the profile and both ledgers. A failed profile read must not be
      // reported as "Student not found" (404); that pushed students off their own fee page
      // on a transient database error.
      const failedStudentSlices: QueryFailure[] = [];
      const [studentRows, fees, payments] = await db.multiQuery([
        { sql: "SELECT * FROM students WHERE id = ?", params: [studentId] },
        { sql: `SELECT * FROM student_fees WHERE student_id = ? ${dateFilterFees} ORDER BY created_at DESC`, params: [studentId, ...dateParams] },
        { sql: `SELECT * FROM fee_payments WHERE student_id = ? ${dateFilterPayments} ORDER BY payment_date DESC`, params: [studentId, ...dateParams] }
      ], failedStudentSlices);
      if (failedStudentSlices.length > 0) {
        console.error("GET /api/fees partial read:", failedStudentSlices.map(f => `${f.sql.slice(0, 60)} → ${f.error}`).join(" | "));
        return NextResponse.json({ success: false, error: "Fee data could not be loaded. Please retry." }, { status: 500 });
      }
      const student = studentRows[0];
      if (!student) return NextResponse.json({ success: false, message: "Student not found" }, { status: 404 });

      const totalFees = fees.reduce((s: number, f: any) => s + f.amount, 0);
      const totalPaid = fees.reduce((s: number, f: any) => s + f.paid_amount, 0);

      return NextResponse.json({
        success: true,
        student: { id: student.id, name: student.name, email: student.email, classGroup: student.classGroup, department: student.department, batch_start_year: student.batch_start_year, batch_end_year: student.batch_end_year, semester: student.semester, year: student.year },
        fees, payments,
        stats: {
          totalFees, totalPaid,
          totalOutstanding: Math.max(totalFees - totalPaid, 0),
          paidCount: fees.filter((f: any) => f.status === 'paid').length,
          partialCount: fees.filter((f: any) => f.status === 'partial').length,
          unpaidCount: fees.filter((f: any) => f.status === 'unpaid').length
        }
      }, {
        headers: { "Cache-Control": "no-store, no-cache, must-revalidate" }
      });
    }

    if (sessionRole === "kam") {
      const kam = await db.get("SELECT id FROM kam_users WHERE id = ? OR LOWER(email) = ? LIMIT 1", sessionRef, String(auth!.user.email || "").toLowerCase());
      const colleges = kam ? await db.all("SELECT id, name FROM colleges WHERE kam_id = ?", kam.id) : [];
      const collegeIds = colleges.map((c: any) => c.id);

      const failedSlices: QueryFailure[] = [];
      const [students, fees, payments] = collegeIds.length ? await db.multiQuery([
        {
          sql: `SELECT id, name, email, classGroup, department, college_id, batch_start_year, batch_end_year, semester, batch_start_year as year FROM students WHERE college_id IN (${collegeIds.map(() => "?").join(",")}) ORDER BY name`,
          params: collegeIds
        },
        {
          sql: `SELECT * FROM student_fees WHERE student_id IN (SELECT id FROM students WHERE college_id IN (${collegeIds.map(() => "?").join(",")})) ${dateFilterFees} ORDER BY created_at DESC`,
          params: [...collegeIds, ...dateParams]
        },
        {
          sql: `SELECT * FROM fee_payments WHERE student_id IN (SELECT id FROM students WHERE college_id IN (${collegeIds.map(() => "?").join(",")})) ${dateFilterPayments} ORDER BY payment_date DESC`,
          params: [...collegeIds, ...dateParams]
        }
      ], failedSlices) : [[], [], []];

      const totalFees = fees.reduce((s: number, f: any) => s + (Number(f.amount) || 0), 0);
      const totalPaid = fees.reduce((s: number, f: any) => s + (Number(f.paid_amount) || 0), 0);
      const paidCount = fees.filter((f: any) => f.status === 'paid').length;
      const partialCount = fees.filter((f: any) => f.status === 'partial').length;
      const unpaidCount = fees.filter((f: any) => f.status === 'unpaid').length;

      return NextResponse.json({
        success: true,
        colleges,
        students, fees, payments,
        stats: {
          totalFees, totalPaid,
          totalOutstanding: Math.max(totalFees - totalPaid, 0),
          paidCount, partialCount, unpaidCount,
          totalStudents: students.length,
          collectionRate: totalFees > 0 ? Math.min(Math.round((totalPaid / totalFees) * 100), 100) : 0
        }
      }, {
        headers: { "Cache-Control": "no-store, no-cache, must-revalidate" }
      });
    }

    return NextResponse.json({ success: false, message: "Fee data is not available for this role." }, { status: 403 });
  } catch (error: any) {
    console.error("GET /api/fees error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

// POST /api/fees — CRUD endpoint for Semester Fees
export async function POST(request: Request) {
  try {
    const { auth, errorResponse } = await requireAuth(request);
    if (errorResponse) return errorResponse;

    const role = auth!.user.role;
    const isFeeAdmin = role === "fee_manager" || role === "admin";
    if (!isFeeAdmin && role !== "student") {
      return NextResponse.json({ success: false, message: "You are not authorized to modify fee records." }, { status: 403 });
    }

    const db = await getDb();
    await ensureMigration("schema_alignment_2026_10");
    const body = await request.json();
    const {
      feeId, studentId, amount, paymentMethod, referenceNo,
      isDirectUpdate, isCreateFee, isDeleteFee,
      paidAmount, status, termName, dueDate, payLink, paymentProof
    } = body;

    const now = new Date().toISOString();

    // 1. Create a new Semester Fee Record
    if (isCreateFee) {
      if (!isFeeAdmin) {
        return NextResponse.json({ success: false, message: "Only fee managers can create fee records." }, { status: 403 });
      }
      if (!studentId || !termName) {
        return NextResponse.json({ success: false, message: "Missing studentId or termName" }, { status: 400 });
      }

      const student = await db.get("SELECT college_id FROM students WHERE id = ?", studentId);
      if (!student) return NextResponse.json({ success: false, message: "Student not found" }, { status: 404 });

      const newFeeId = generateId("fee");
      const targetAmount = Number(amount) || 0;
      const targetPaid = Number(paidAmount) || 0;
      const targetStatus = status || (targetPaid >= targetAmount && targetAmount > 0 ? "paid" : targetPaid > 0 ? "partial" : "unpaid");

      await db.run(
        `INSERT INTO student_fees (id, student_id, college_id, term_name, amount, paid_amount, due_date, status, pay_link, payment_proof, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [newFeeId, studentId, student.college_id, termName, targetAmount, targetPaid, dueDate || "", targetStatus, payLink || "", paymentProof || "", now, now]
      );

      return NextResponse.json({
        success: true,
        message: "Semester fee record created successfully",
        feeId: newFeeId
      });
    }

    // 2. Delete a Fee Record
    if (isDeleteFee) {
      if (!isFeeAdmin) {
        return NextResponse.json({ success: false, message: "Only fee managers can delete fee records." }, { status: 403 });
      }
      if (!feeId) return NextResponse.json({ success: false, message: "Missing feeId" }, { status: 400 });
      await db.transaction(async (tx) => {
        await tx.run("DELETE FROM fee_payments WHERE fee_id = ?", feeId);
        await tx.run("DELETE FROM student_fees WHERE id = ?", feeId);
      });
      return NextResponse.json({ success: true, message: "Semester fee deleted successfully" });
    }

    // 3. Direct Update of an existing Fee Record
    if (!feeId) {
      return NextResponse.json({ success: false, message: "Missing feeId" }, { status: 400 });
    }

    const method = paymentMethod || "manual";
    const payAmount = Number(amount);

    // The fee row and the duplicate-payment probe both key off feeId alone, so they leave
    // as one group. The probe only matters on the payment pathway.
    const feeFailures: QueryFailure[] = [];
    const [feeRows, dupRows] = await db.multiQuery([
      { sql: "SELECT * FROM student_fees WHERE id = ?", params: [feeId] },
      !isDirectUpdate && payAmount > 0
        ? {
            sql: "SELECT id, receipt_no FROM fee_payments WHERE fee_id = ? AND amount = ? AND (reference_no = ? OR payment_date >= ?) LIMIT 1",
            params: [feeId, payAmount, referenceNo || "NOMATCH", new Date(Date.now() - 5000).toISOString()]
          }
        : { sql: "SELECT 1 WHERE 1=0" },
    ], feeFailures);
    if (feeFailures.length > 0) {
      return NextResponse.json({ success: false, message: "Could not verify this payment against the fee record. Please try again." }, { status: 500 });
    }

    const fee = feeRows[0];
    if (!fee) return NextResponse.json({ success: false, message: "Fee record not found" }, { status: 404 });

    if (role === "student" && fee.student_id !== auth!.user.reference_id) {
      return NextResponse.json({ success: false, message: "You can only pay your own fee records." }, { status: 403 });
    }

    if (isDirectUpdate) {
      if (!isFeeAdmin) {
        return NextResponse.json({ success: false, message: "Only fee managers can edit fee records." }, { status: 403 });
      }
      const targetPaid = paidAmount !== undefined ? Number(paidAmount) : fee.paid_amount;
      const targetAmount = amount !== undefined ? Number(amount) : fee.amount;
      const targetTerm = termName || fee.term_name;
      const targetDue = dueDate !== undefined ? dueDate : fee.due_date;
      const targetPayLink = payLink !== undefined ? payLink : (fee.pay_link || "");
      const targetProof = paymentProof !== undefined ? paymentProof : (fee.payment_proof || "");
      const targetStatus = status || (targetPaid >= targetAmount && targetAmount > 0 ? 'paid' : targetPaid > 0 ? 'partial' : 'unpaid');

      await db.transaction(async (tx) => {
        await tx.run(
          `UPDATE student_fees 
           SET amount = ?, paid_amount = ?, term_name = ?, due_date = ?, status = ?, pay_link = ?, payment_proof = ?, updated_at = ? 
           WHERE id = ?`,
          [targetAmount, targetPaid, targetTerm, targetDue, targetStatus, targetPayLink, targetProof, now, feeId]
        );

        const diff = targetPaid - fee.paid_amount;
        if (diff !== 0) {
          const payId = generateId("pay");
          const receiptNo = makeReceiptNo();
          const refNo = referenceNo || "MANUAL_ADJ";
          const method = "Manual Adjustment";

          await tx.run(
            `INSERT INTO fee_payments (id, fee_id, student_id, college_id, amount, payment_method, reference_no, receipt_no, payment_date)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [payId, feeId, fee.student_id, fee.college_id, diff, method, refNo, receiptNo, now]
          );
        }
      });

      return NextResponse.json({
        success: true,
        message: "Fee record updated successfully",
        newStatus: targetStatus,
        newPaidAmount: targetPaid
      });
    } else {
      // Standard transaction pathway
      if (payAmount <= 0) {
        return NextResponse.json({ success: false, message: "Payment amount must be greater than zero" }, { status: 400 });
      }

      // Backend Idempotency Check: Prevent duplicate payment submitted within last 5 seconds with same amount and fee_id
      const recentDup = dupRows[0] || null;
      if (recentDup && !referenceNo) {
        return NextResponse.json({
          success: true,
          message: "Payment already recorded (duplicate prevented)",
          receiptNo: recentDup.receipt_no
        });
      }

      const newPaid = Math.min(fee.paid_amount + payAmount, fee.amount);
      const newStatus = newPaid >= fee.amount ? 'paid' : newPaid > 0 ? 'partial' : 'unpaid';

      const payId = generateId("pay");
      const receiptNo = makeReceiptNo();
      const refNo = referenceNo || (`REF${getInstitutionDateStr().replace(/-/g, "").slice(2)}${randomBytes(3).toString("hex").toUpperCase()}`);

      await db.transaction(async (tx) => {
        await tx.run(
          "UPDATE student_fees SET paid_amount = ?, status = ?, updated_at = ? WHERE id = ?",
          [newPaid, newStatus, now, feeId]
        );

        await tx.run(
          `INSERT INTO fee_payments (id, fee_id, student_id, college_id, amount, payment_method, reference_no, receipt_no, payment_date)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [payId, feeId, fee.student_id, fee.college_id, payAmount, method, refNo, receiptNo, now]
        );
      });

      return NextResponse.json({
        success: true,
        message: "Payment recorded successfully",
        newStatus,
        newPaid,
        receiptNo
      });
    }
  } catch (error: any) {
    console.error("POST /api/fees error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

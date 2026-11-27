process.env.DATABASE_URL = "postgresql://postgres.wxpufmwwakkeftooeqmq:33Ot3mhG04N4MgSZ!@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres";
const { Client } = require('pg');
const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

c.connect().then(async () => {

  const q = async (sql) => (await c.query(sql)).rows;

  // Core counts
  const core = await q(`
    SELECT
      (SELECT COUNT(*) FROM students WHERE college_id='Clg_KAMRAJ') AS students,
      (SELECT COUNT(*) FROM mentors WHERE college_id='Clg_KAMRAJ') AS mentors,
      (SELECT COUNT(*) FROM subjects WHERE college_id='Clg_KAMRAJ') AS subjects,
      (SELECT COUNT(*) FROM slots WHERE college_id='Clg_KAMRAJ') AS slots,
      (SELECT COUNT(*) FROM courses WHERE college_id='Clg_KAMRAJ') AS courses,
      (SELECT COUNT(*) FROM departments WHERE college_id='Clg_KAMRAJ') AS departments,
      (SELECT COUNT(*) FROM class_mentor_assignments WHERE college_id='Clg_KAMRAJ') AS class_mentor_assignments,
      (SELECT COUNT(*) FROM subject_groups WHERE college_id='Clg_KAMRAJ') AS subject_groups
  `);
  console.log('=== CORE ENTITIES ===');
  console.log(JSON.stringify(core[0], null, 2));

  // Academic data
  const acad = await q(`
    SELECT
      (SELECT COUNT(*) FROM student_attendance WHERE college_id='Clg_KAMRAJ') AS student_attendance,
      (SELECT COUNT(*) FROM academic_tracker WHERE college_id='Clg_KAMRAJ') AS academic_tracker,
      (SELECT COUNT(*) FROM student_academic_tracker WHERE college_id='Clg_KAMRAJ') AS student_academic_tracker,
      (SELECT COUNT(*) FROM weekly_academic_tasks WHERE college_id='Clg_KAMRAJ') AS weekly_academic_tasks,
      (SELECT COUNT(*) FROM student_tracker WHERE college_id='Clg_KAMRAJ') AS student_tracker
  `);
  console.log('\n=== ACADEMIC TRACKER ===');
  console.log(JSON.stringify(acad[0], null, 2));

  // Exams & Fees
  const exam = await q(`
    SELECT
      (SELECT COUNT(*) FROM exam_schedules WHERE college_id='Clg_KAMRAJ') AS exam_schedules,
      (SELECT COUNT(*) FROM student_exam_marks WHERE college_id='Clg_KAMRAJ') AS student_exam_marks,
      (SELECT COUNT(*) FROM student_fees WHERE college_id='Clg_KAMRAJ') AS student_fees
  `);
  console.log('\n=== EXAMS & FEES ===');
  console.log(JSON.stringify(exam[0], null, 2));

  // Calendar
  const cal = await q(`
    SELECT
      (SELECT COUNT(*) FROM campus_daily_configs WHERE college_id='Clg_KAMRAJ') AS campus_daily_configs,
      (SELECT COUNT(*) FROM holidays WHERE college_id='Clg_KAMRAJ') AS holidays
  `);
  console.log('\n=== CALENDAR ===');
  console.log(JSON.stringify(cal[0], null, 2));

  // Check tables that might be missing/zero
  const tables = [
    'mentor_weekly_plans','faculty_configs','demo_sessions','lnd_sessions',
    'student_goals','student_career_tracker','mentor_feedback',
    'placement_data','mentor_availability','notifications'
  ];

  console.log('\n=== OPTIONAL / POSSIBLY MISSING TABLES ===');
  for (const t of tables) {
    try {
      const r = await c.query(`SELECT COUNT(*) as cnt FROM ${t} WHERE college_id='Clg_KAMRAJ'`);
      console.log(t.padEnd(30), r.rows[0].cnt);
    } catch(e) {
      // try without college_id filter
      try {
        const r2 = await c.query(`SELECT COUNT(*) as cnt FROM ${t}`);
        console.log(t.padEnd(30), r2.rows[0].cnt, '(no college_id col)');
      } catch(e2) {
        console.log(t.padEnd(30), 'TABLE DOES NOT EXIST');
      }
    }
  }

  // Check EFSET / communication scores
  const efset = await q(`SELECT COUNT(*) as cnt, COUNT(efset_score) as with_efset FROM students WHERE college_id='Clg_KAMRAJ'`);
  console.log('\n=== EFSET SCORES ===');
  console.log('Total students:', efset[0].cnt, '| With efset_score:', efset[0].with_efset);

  // Check roll/register numbers
  const ids = await q(`
    SELECT
      COUNT(*) as total,
      COUNT(CASE WHEN roll_number IS NULL OR roll_number='' THEN 1 END) as missing_roll,
      COUNT(CASE WHEN register_number IS NULL OR register_number='' THEN 1 END) as missing_reg,
      COUNT(CASE WHEN student_id LIKE 'KC_%_R%' THEN 1 END) as placeholder_ids
    FROM students WHERE college_id='Clg_KAMRAJ'
  `);
  console.log('\n=== STUDENT ID COMPLETENESS ===');
  console.log(JSON.stringify(ids[0], null, 2));

  // Check fees breakdown by classgroup
  const fees = await q(`
    SELECT s.classgroup, COUNT(sf.id) as fee_records
    FROM students s
    LEFT JOIN student_fees sf ON sf.student_id = s.student_id AND sf.college_id = s.college_id
    WHERE s.college_id='Clg_KAMRAJ'
    GROUP BY s.classgroup ORDER BY s.classgroup
  `);
  console.log('\n=== FEES by CLASSGROUP ===');
  fees.forEach(r => console.log(r.classgroup.padEnd(28), r.fee_records));

  // Check attendance coverage
  const att = await q(`
    SELECT s.classgroup, COUNT(sa.id) as att_records
    FROM students s
    LEFT JOIN student_attendance sa ON sa.student_id = s.student_id AND sa.college_id = s.college_id
    WHERE s.college_id='Clg_KAMRAJ'
    GROUP BY s.classgroup ORDER BY s.classgroup
  `);
  console.log('\n=== ATTENDANCE by CLASSGROUP ===');
  att.forEach(r => console.log(r.classgroup.padEnd(28), r.att_records));

  // Check academic tracker coverage
  const atk = await q(`
    SELECT s.classgroup, COUNT(sat.id) as tracker_records
    FROM students s
    LEFT JOIN student_academic_tracker sat ON sat.student_id = s.student_id AND sat.college_id = s.college_id
    WHERE s.college_id='Clg_KAMRAJ'
    GROUP BY s.classgroup ORDER BY s.classgroup
  `);
  console.log('\n=== STUDENT_ACADEMIC_TRACKER by CLASSGROUP ===');
  atk.forEach(r => console.log(r.classgroup.padEnd(28), r.tracker_records));

  // Check skill tracker coverage
  const stk = await q(`
    SELECT s.classgroup, COUNT(st.id) as tracker_records
    FROM students s
    LEFT JOIN student_tracker st ON st.student_id = s.student_id AND st.college_id = s.college_id
    WHERE s.college_id='Clg_KAMRAJ'
    GROUP BY s.classgroup ORDER BY s.classgroup
  `);
  console.log('\n=== STUDENT_TRACKER (SKILL/LAB) by CLASSGROUP ===');
  stk.forEach(r => console.log(r.classgroup.padEnd(28), r.tracker_records));

  // Check exam marks coverage
  const em = await q(`
    SELECT s.classgroup, COUNT(sem.id) as mark_records
    FROM students s
    LEFT JOIN student_exam_marks sem ON sem.student_id = s.student_id AND sem.college_id = s.college_id
    WHERE s.college_id='Clg_KAMRAJ'
    GROUP BY s.classgroup ORDER BY s.classgroup
  `);
  console.log('\n=== EXAM MARKS by CLASSGROUP ===');
  em.forEach(r => console.log(r.classgroup.padEnd(28), r.mark_records));

  await c.end();
}).catch(e => { console.error(e.message); process.exit(1); });

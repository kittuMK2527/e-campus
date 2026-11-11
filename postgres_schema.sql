-- ============================================================================
-- FP Timetable System — Full PostgreSQL Schema
-- Compatible with: Supabase, Neon PostgreSQL, Amazon RDS, Local PostgreSQL
-- ============================================================================

-- SQLite Compatibility Functions for PostgreSQL
CREATE OR REPLACE FUNCTION strftime(format text, date_val text) 
RETURNS text AS $$
BEGIN
  IF format = '%w' THEN
    BEGIN
      RETURN EXTRACT(DOW FROM date_val::date)::text;
    EXCEPTION WHEN OTHERS THEN
      RETURN '1';
    END;
  ELSE
    RETURN date_val;
  END IF;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

CREATE OR REPLACE FUNCTION date(base_val text, offset_val text)
RETURNS text AS $$
DECLARE
  clean_offset text;
BEGIN
  IF offset_val LIKE '-%' THEN
    RETURN (CURRENT_DATE - SUBSTRING(offset_val FROM 2)::interval)::date::text;
  ELSIF offset_val LIKE '+%' THEN
    RETURN (CURRENT_DATE + SUBSTRING(offset_val FROM 2)::interval)::date::text;
  ELSE
    RETURN (CURRENT_DATE + offset_val::interval)::date::text;
  END IF;
EXCEPTION WHEN OTHERS THEN
  RETURN CURRENT_DATE::text;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

CREATE OR REPLACE FUNCTION date(base_val text)
RETURNS text AS $$
BEGIN
  IF base_val = 'now' THEN
    RETURN CURRENT_DATE::text;
  ELSE
    RETURN base_val::date::text;
  END IF;
EXCEPTION WHEN OTHERS THEN
  RETURN CURRENT_DATE::text;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- 1. Core Users & Organization
CREATE TABLE IF NOT EXISTS admin_users (
    id VARCHAR(255) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL
);

CREATE TABLE IF NOT EXISTS kam_users (
    id VARCHAR(255) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    title VARCHAR(255) NOT NULL DEFAULT 'Key Account Manager'
);

CREATE TABLE IF NOT EXISTS colleges (
    id VARCHAR(255) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    address TEXT,
    kam_id VARCHAR(255) NOT NULL REFERENCES kam_users(id),
    has_shifts INTEGER NOT NULL DEFAULT 1,
    rooms TEXT,
    code VARCHAR(100),
    academic_year VARCHAR(100),
    manager VARCHAR(255),
    shift_configs TEXT,
    working_days TEXT
);

CREATE TABLE IF NOT EXISTS campus_managers (
    id VARCHAR(255) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    college_id VARCHAR(255) NOT NULL REFERENCES colleges(id),
    kam_id VARCHAR(255) NOT NULL REFERENCES kam_users(id)
);

CREATE TABLE IF NOT EXISTS mentors (
    id VARCHAR(255) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    department VARCHAR(255) NOT NULL,
    avatar TEXT NOT NULL DEFAULT '',
    subjects TEXT,
    classes TEXT,
    college_id VARCHAR(255) REFERENCES colleges(id),
    shift VARCHAR(50) DEFAULT 'shift_1',
    employee_id VARCHAR(100),
    phone VARCHAR(50),
    qualification VARCHAR(255),
    experience VARCHAR(100),
    specialization VARCHAR(255),
    designation VARCHAR(255),
    joining_date VARCHAR(50),
    status VARCHAR(50) DEFAULT 'Active',
    password_hash TEXT,
    last_login VARCHAR(100),
    created_at VARCHAR(100),
    updated_at VARCHAR(100),
    subject_group VARCHAR(255),
    mentor_group VARCHAR(255),
    is_active INTEGER DEFAULT 1,
    active INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS departments (
    id VARCHAR(255) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    college_id VARCHAR(255),
    code VARCHAR(100),
    description TEXT,
    hod_name VARCHAR(255),
    established_year VARCHAR(50),
    status VARCHAR(50) DEFAULT 'Active',
    years INTEGER DEFAULT 4,
    start_year VARCHAR(50),
    end_year VARCHAR(50),
    shift_based INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS courses (
    id VARCHAR(255) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    college_id VARCHAR(255),
    code VARCHAR(100),
    description TEXT,
    hod_name VARCHAR(255),
    established_year VARCHAR(50),
    status VARCHAR(50) DEFAULT 'Active',
    years INTEGER DEFAULT 4,
    start_date VARCHAR(50),
    end_date VARCHAR(50),
    start_year VARCHAR(50),
    end_year VARCHAR(50),
    default_room TEXT,
    default_shift VARCHAR(50),
    shift_based INTEGER DEFAULT 0,
    sections TEXT
);

-- Course names are unique per campus, not globally: two colleges commonly run the
-- same course ("BCA"). A global UNIQUE on courses.name would block the second
-- campus, so uniqueness is scoped. departments deliberately stays unindexed — one
-- campus can hold several rows for the same programme (legacy duplicates exist).
CREATE UNIQUE INDEX IF NOT EXISTS courses_college_name_uniq
    ON courses (COALESCE(college_id, ''), LOWER(TRIM(name)));

CREATE TABLE IF NOT EXISTS subjects (
    id VARCHAR(255) PRIMARY KEY,
    department VARCHAR(255) NOT NULL,
    semester VARCHAR(50) NOT NULL,
    name VARCHAR(255) NOT NULL,
    type VARCHAR(100) NOT NULL,
    college_id VARCHAR(255),
    year VARCHAR(50),
    weekly_hours INTEGER DEFAULT 4,
    shift VARCHAR(50) DEFAULT 'general',
    subject_group VARCHAR(255),
    mentor_group VARCHAR(255)
);

CREATE TABLE IF NOT EXISTS students (
    id VARCHAR(255) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    classGroup VARCHAR(255) NOT NULL,
    section VARCHAR(100),
    department VARCHAR(255),
    college_id VARCHAR(255) REFERENCES colleges(id),
    batch_start_year INTEGER,
    batch_end_year INTEGER,
    semester VARCHAR(50),
    shift VARCHAR(50),
    register_number VARCHAR(100),
    roll_number VARCHAR(100),
    avatar TEXT,
    phone VARCHAR(50),
    gender VARCHAR(50),
    dob VARCHAR(50),
    address TEXT,
    guardian_name VARCHAR(255),
    guardian_phone VARCHAR(50),
    admission_date VARCHAR(50),
    password_hash TEXT,
    status VARCHAR(50) DEFAULT 'Active',
    last_login VARCHAR(100),
    created_at VARCHAR(100),
    updated_at VARCHAR(100),
    tenth_mark VARCHAR(50),
    eleventh_mark VARCHAR(50),
    twelfth_mark VARCHAR(50),
    academic_group VARCHAR(100),
    medium VARCHAR(100),
    blood_group VARCHAR(50),
    parent_phone VARCHAR(50),
    aadhar_number VARCHAR(100),
    linkedin_link TEXT,
    github_id VARCHAR(255),
    project_drive_link TEXT,
    hackerrank_link TEXT,
    leetcode_link TEXT,
    figma_link TEXT,
    hire_score VARCHAR(50),
    efset_score VARCHAR(50),
    mother_name VARCHAR(255),
    father_name VARCHAR(255),
    pan_number VARCHAR(100),
    correction_count INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(255) PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    plain_password TEXT DEFAULT 'password123',
    role VARCHAR(100) NOT NULL,
    reference_id VARCHAR(255),
    status VARCHAR(50) DEFAULT 'Active',
    must_change_password INTEGER DEFAULT 0,
    last_login VARCHAR(100),
    created_at VARCHAR(100),
    updated_at VARCHAR(100)
);

-- 2. Timetable & Slots
CREATE TABLE IF NOT EXISTS slots (
    id VARCHAR(255) PRIMARY KEY,
    mentorId VARCHAR(255) NOT NULL REFERENCES mentors(id) ON DELETE CASCADE,
    day VARCHAR(50) NOT NULL,
    time VARCHAR(100) NOT NULL,
    course VARCHAR(255) NOT NULL,
    location VARCHAR(255) NOT NULL,
    shift VARCHAR(50) NOT NULL DEFAULT 'general',
    classGroup VARCHAR(255),
    semester VARCHAR(50),
    year VARCHAR(50),
    department VARCHAR(255),
    batch_start_year INTEGER,
    batch_end_year INTEGER,
    college_id VARCHAR(255)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_slots_mentor_day_time_shift ON slots (mentorId, day, time, shift);
CREATE UNIQUE INDEX IF NOT EXISTS idx_slots_room_day_time_shift ON slots (LOWER(location), day, time, shift);

CREATE TABLE IF NOT EXISTS handover_requests (
    id VARCHAR(255) PRIMARY KEY,
    requestorId VARCHAR(255) NOT NULL REFERENCES mentors(id) ON DELETE CASCADE,
    requestorName VARCHAR(255) NOT NULL,
    slotId VARCHAR(255) NOT NULL,
    course VARCHAR(255) NOT NULL,
    day VARCHAR(50) NOT NULL,
    time VARCHAR(100) NOT NULL,
    dateStr VARCHAR(50) NOT NULL,
    dateFormatted VARCHAR(100) NOT NULL,
    targetStaffId VARCHAR(255) NOT NULL,
    targetStaffName VARCHAR(255) NOT NULL,
    reason TEXT NOT NULL,
    status VARCHAR(50) NOT NULL,
    headerReason TEXT,
    approvedBy VARCHAR(255),
    timestamp VARCHAR(100) NOT NULL,
    classGroup VARCHAR(255),
    original_subject VARCHAR(255),
    original_month VARCHAR(50),
    request_type VARCHAR(100) DEFAULT 'handover',
    compensates_handover_id VARCHAR(255)
);

CREATE TABLE IF NOT EXISTS approved_handovers (
    id VARCHAR(255) PRIMARY KEY,
    requestId VARCHAR(255) UNIQUE NOT NULL,
    slotId VARCHAR(255) NOT NULL,
    dateStr VARCHAR(50) NOT NULL,
    originalMentorId VARCHAR(255) NOT NULL,
    coverStaffId VARCHAR(255) NOT NULL,
    coverStaffName VARCHAR(255) NOT NULL,
    course VARCHAR(255),
    ledger_month VARCHAR(50)
);

-- 3. Attendance Tracking
CREATE TABLE IF NOT EXISTS student_attendance (
    id VARCHAR(255) PRIMARY KEY,
    studentId VARCHAR(255) NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    slotId VARCHAR(255) REFERENCES slots(id) ON DELETE SET NULL,
    dateStr VARCHAR(50) NOT NULL,
    status VARCHAR(50) NOT NULL,
    markedBy VARCHAR(255),
    timestamp VARCHAR(100) NOT NULL,
    type VARCHAR(50) DEFAULT 'Regular',
    mode VARCHAR(50) DEFAULT 'Offline',
    attendanceTypeSub VARCHAR(100),
    coveredsubject TEXT,
    correction_count INTEGER DEFAULT 0,
    notes TEXT,
    UNIQUE(studentId, slotId, dateStr)
);

CREATE TABLE IF NOT EXISTS mentor_attendance (
    id VARCHAR(255) PRIMARY KEY,
    mentor_id VARCHAR(255) NOT NULL REFERENCES mentors(id) ON DELETE CASCADE,
    college_id VARCHAR(255) NOT NULL REFERENCES colleges(id) ON DELETE CASCADE,
    date_str VARCHAR(50) NOT NULL,
    status VARCHAR(50) NOT NULL,
    punch_in_time VARCHAR(100),
    punch_out_time VARCHAR(100),
    reason TEXT,
    marked_by VARCHAR(100) NOT NULL DEFAULT 'self',
    marked_by_id VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(mentor_id, date_str)
);

CREATE TABLE IF NOT EXISTS campus_daily_configs (
    id VARCHAR(255) PRIMARY KEY,
    college_id VARCHAR(255) NOT NULL,
    dateStr VARCHAR(50) NOT NULL,
    day_type VARCHAR(100) NOT NULL,
    day_order VARCHAR(100) NOT NULL,
    session_mode VARCHAR(50) DEFAULT 'Offline',
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(college_id, dateStr)
);

-- 4. Academic Delivery & Tracker
CREATE TABLE IF NOT EXISTS academic_tracker (
    id VARCHAR(255) PRIMARY KEY,
    date VARCHAR(50) NOT NULL,
    period_slot VARCHAR(100) NOT NULL,
    class_group VARCHAR(255) NOT NULL,
    subject VARCHAR(255) NOT NULL,
    unit VARCHAR(100) NOT NULL,
    topic TEXT NOT NULL,
    comments TEXT,
    status VARCHAR(50) DEFAULT 'Conducted',
    mentor_id VARCHAR(255) NOT NULL,
    mentor_name VARCHAR(255),
    college_id VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    weekly_plan_id TEXT,
    weekly_plan_week INTEGER,
    UNIQUE(mentor_id, date, period_slot, subject, class_group)
);

CREATE TABLE IF NOT EXISTS weekly_tasks (
    id VARCHAR(255) PRIMARY KEY,
    class_group VARCHAR(255) NOT NULL,
    subject VARCHAR(255) NOT NULL,
    week_number INTEGER NOT NULL,
    mentor_id VARCHAR(255) NOT NULL,
    task_name VARCHAR(255) NOT NULL,
    task_pdf_url TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(class_group, subject, week_number)
);

CREATE TABLE IF NOT EXISTS student_tracker (
    id VARCHAR(255) PRIMARY KEY,
    student_id VARCHAR(255) NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    class_group VARCHAR(255) NOT NULL,
    subject VARCHAR(255) NOT NULL,
    week_number INTEGER NOT NULL,
    submission_url TEXT,
    viva_assessment TEXT,
    marks NUMERIC,
    graded_by VARCHAR(255),
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(student_id, class_group, subject, week_number)
);

CREATE TABLE IF NOT EXISTS subject_materials (
    id VARCHAR(255) PRIMARY KEY,
    subject VARCHAR(255) NOT NULL,
    unit_number INTEGER NOT NULL DEFAULT 1,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    material_type VARCHAR(100) NOT NULL DEFAULT 'notes',
    file_url TEXT,
    external_url TEXT,
    file_size VARCHAR(100),
    uploaded_by VARCHAR(255),
    mentor_id VARCHAR(255),
    class_group VARCHAR(255),
    college_id VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS weekly_academic_tasks (
    id VARCHAR(255) PRIMARY KEY,
    class_group VARCHAR(255) NOT NULL,
    subject VARCHAR(255) NOT NULL,
    week_number INTEGER NOT NULL,
    task_name VARCHAR(255) NOT NULL,
    task_pdf_url TEXT,
    task_date VARCHAR(50),
    quiz_topic TEXT,
    assessment_topic TEXT,
    assignment_topic TEXT,
    mentor_id VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(class_group, subject, week_number)
);

CREATE TABLE IF NOT EXISTS student_academic_tracker (
    id VARCHAR(255) PRIMARY KEY,
    student_email VARCHAR(255) NOT NULL,
    student_id VARCHAR(255),
    class_group VARCHAR(255) NOT NULL,
    subject VARCHAR(255) NOT NULL,
    week_number INTEGER NOT NULL,
    attendance_status VARCHAR(50) DEFAULT 'Present',
    submission_url TEXT,
    quiz_marks NUMERIC,
    assessment_marks NUMERIC,
    assignment_marks NUMERIC,
    total_marks NUMERIC,
    feedback TEXT,
    graded_by VARCHAR(255),
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(student_email, class_group, subject, week_number)
);

-- 5. Student Interviews Module
CREATE TABLE IF NOT EXISTS student_interviews (
    id VARCHAR(255) PRIMARY KEY,
    student_id VARCHAR(255) NOT NULL DEFAULT 'batch_all',
    student_name VARCHAR(255) DEFAULT 'Assigned Students',
    class_group VARCHAR(255) DEFAULT '',
    subject VARCHAR(255) NOT NULL,
    type VARCHAR(100) NOT NULL DEFAULT 'internal',
    marks NUMERIC DEFAULT 0,
    total_marks NUMERIC DEFAULT 100,
    technical_marks NUMERIC DEFAULT 0,
    communication_marks NUMERIC DEFAULT 0,
    status VARCHAR(100) DEFAULT 'pending_cm',
    evaluator_name VARCHAR(255) DEFAULT '',
    evaluator_role VARCHAR(100) DEFAULT '',
    notes TEXT DEFAULT '',
    mentor_id VARCHAR(255),
    mentor_name VARCHAR(255),
    target_date VARCHAR(50),
    topics TEXT,
    student_count INTEGER DEFAULT 0,
    origin_college_id VARCHAR(255) DEFAULT '',
    target_college_id VARCHAR(255),
    priority_level INTEGER DEFAULT 1,
    assigned_mentor_ids TEXT,
    college_id VARCHAR(255),
    preferred_start_time VARCHAR(100) DEFAULT '09:00 AM',
    total_duration_minutes INTEGER DEFAULT 0,
    requested_students INTEGER DEFAULT 0,
    accepted_capacity INTEGER DEFAULT 0,
    allocated_students INTEGER DEFAULT 0,
    remaining_students INTEGER DEFAULT 0,
    unallocated_students INTEGER DEFAULT 0,
    gmeet_link TEXT,
    gcal_link TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS interview_allocations (
    id VARCHAR(255) PRIMARY KEY,
    interview_id VARCHAR(255) NOT NULL REFERENCES student_interviews(id) ON DELETE CASCADE,
    origin_college_id VARCHAR(255) NOT NULL,
    target_college_id VARCHAR(255) NOT NULL,
    mentor_id VARCHAR(255) NOT NULL,
    mentor_name VARCHAR(255) NOT NULL,
    allocated_student_count INTEGER NOT NULL,
    start_time VARCHAR(100) NOT NULL,
    end_time VARCHAR(100) NOT NULL,
    duration_minutes INTEGER NOT NULL,
    status VARCHAR(100) DEFAULT 'pending_acceptance',
    gmeet_link TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS cam_capacity_responses (
    id VARCHAR(255) PRIMARY KEY,
    interview_id VARCHAR(255) NOT NULL REFERENCES student_interviews(id) ON DELETE CASCADE,
    college_id VARCHAR(255) NOT NULL,
    college_name VARCHAR(255) NOT NULL,
    cam_id VARCHAR(255) NOT NULL,
    cam_name VARCHAR(255) NOT NULL,
    accepted_student_capacity INTEGER NOT NULL DEFAULT 0,
    actual_available_capacity INTEGER NOT NULL DEFAULT 0,
    unfulfilled_capacity INTEGER NOT NULL DEFAULT 0,
    status VARCHAR(100) DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS student_interview_slots (
    id VARCHAR(255) PRIMARY KEY,
    interview_id VARCHAR(255) NOT NULL REFERENCES student_interviews(id) ON DELETE CASCADE,
    allocation_id VARCHAR(255) NOT NULL,
    student_id VARCHAR(255),
    student_name VARCHAR(255),
    mentor_id VARCHAR(255) NOT NULL,
    mentor_name VARCHAR(255) NOT NULL,
    college_id VARCHAR(255) NOT NULL,
    slot_start_time VARCHAR(100) NOT NULL,
    slot_end_time VARCHAR(100) NOT NULL,
    status VARCHAR(100) DEFAULT 'scheduled',
    subject VARCHAR(255),
    target_date VARCHAR(50),
    gmeet_link TEXT,
    gcal_link TEXT,
    actual_start_time TEXT,
    actual_end_time TEXT,
    actual_duration_minutes INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS interview_evaluations (
    id VARCHAR(255) PRIMARY KEY,
    interview_id VARCHAR(255) NOT NULL,
    student_id VARCHAR(255) NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    student_name VARCHAR(255),
    class_group VARCHAR(255),
    mentor_id VARCHAR(255) NOT NULL,
    mentor_name VARCHAR(255),
    attendance VARCHAR(50) DEFAULT 'present',
    communication_score INTEGER DEFAULT 0,
    content_score INTEGER DEFAULT 0,
    technical_score INTEGER DEFAULT 0,
    confidence_score INTEGER DEFAULT 0,
    total_score INTEGER DEFAULT 0,
    questions_asked TEXT,
    remarks TEXT,
    status VARCHAR(100) DEFAULT 'Cleared',
    actual_start_time TEXT,
    actual_end_time TEXT,
    actual_duration_minutes INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 6. Fees & Payments
CREATE TABLE IF NOT EXISTS student_fees (
    id VARCHAR(255) PRIMARY KEY,
    student_id VARCHAR(255) NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    college_id VARCHAR(255) NOT NULL,
    term_name VARCHAR(255) NOT NULL,
    amount NUMERIC NOT NULL,
    paid_amount NUMERIC DEFAULT 0,
    fpc_amount NUMERIC DEFAULT 0,
    fpc_pending NUMERIC DEFAULT 0,
    academic_year VARCHAR(100),
    due_date VARCHAR(50),
    status VARCHAR(50) DEFAULT 'unpaid',
    pay_link TEXT,
    payment_proof TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS fee_payments (
    id VARCHAR(255) PRIMARY KEY,
    fee_id VARCHAR(255) NOT NULL REFERENCES student_fees(id),
    student_id VARCHAR(255) NOT NULL REFERENCES students(id),
    college_id VARCHAR(255) NOT NULL,
    amount NUMERIC NOT NULL,
    payment_method VARCHAR(100) NOT NULL,
    reference_no VARCHAR(255),
    receipt_no VARCHAR(255) UNIQUE NOT NULL,
    payment_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 7. Governance, Leaves, Audits & Notifications
CREATE TABLE IF NOT EXISTS audit_logs (
    id VARCHAR(255) PRIMARY KEY,
    type VARCHAR(100) NOT NULL,
    description TEXT NOT NULL,
    actorName VARCHAR(255) NOT NULL,
    actorRole VARCHAR(100) NOT NULL,
    timestamp VARCHAR(100) NOT NULL,
    old_status TEXT,
    new_status TEXT,
    reason TEXT,
    changed_by TEXT
);

CREATE TABLE IF NOT EXISTS notifications (
    id VARCHAR(255) PRIMARY KEY,
    user_id VARCHAR(255) NOT NULL,
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    is_read INTEGER DEFAULT 0,
    link TEXT,
    type VARCHAR(100) DEFAULT 'info',
    created_at VARCHAR(100) NOT NULL
);

CREATE TABLE IF NOT EXISTS leave_requests (
    id VARCHAR(255) PRIMARY KEY,
    studentId VARCHAR(255) NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    studentName VARCHAR(255) NOT NULL,
    classGroup VARCHAR(255) NOT NULL,
    type VARCHAR(100) NOT NULL,
    dateStr VARCHAR(50) NOT NULL,
    reason TEXT NOT NULL,
    status VARCHAR(50) NOT NULL,
    approvedBy VARCHAR(255),
    timestamp VARCHAR(100) NOT NULL
);

CREATE TABLE IF NOT EXISTS faculty_leave_requests (
    id VARCHAR(255) PRIMARY KEY,
    mentor_id VARCHAR(255) NOT NULL REFERENCES mentors(id) ON DELETE CASCADE,
    college_id VARCHAR(255) NOT NULL REFERENCES colleges(id) ON DELETE CASCADE,
    request_type VARCHAR(100) NOT NULL,
    leave_category VARCHAR(100) NOT NULL,
    start_date VARCHAR(50) NOT NULL,
    end_date VARCHAR(50) NOT NULL,
    reason TEXT NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    approved_by VARCHAR(255),
    rejection_reason TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS leave_balances (
    id VARCHAR(255) PRIMARY KEY,
    user_id VARCHAR(255) NOT NULL UNIQUE,
    role VARCHAR(100) NOT NULL,
    casual_leave INTEGER DEFAULT 12,
    sick_leave INTEGER DEFAULT 12,
    earned_leave INTEGER DEFAULT 10,
    od_allowance INTEGER DEFAULT 15,
    academic_year VARCHAR(100) DEFAULT '2025-2026',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS approvals (
    id VARCHAR(255) PRIMARY KEY,
    module_type VARCHAR(100) NOT NULL,
    request_id VARCHAR(255) NOT NULL,
    requester_id VARCHAR(255) NOT NULL,
    requester_name VARCHAR(255) NOT NULL,
    approver_id VARCHAR(255),
    approver_name VARCHAR(255),
    current_status VARCHAR(50) NOT NULL DEFAULT 'pending',
    remarks TEXT,
    rejection_reason TEXT,
    college_id VARCHAR(255),
    created_at VARCHAR(100) NOT NULL,
    updated_at VARCHAR(100) NOT NULL,
    approved_at VARCHAR(100)
);

CREATE TABLE IF NOT EXISTS announcements (
    id VARCHAR(255) PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    created_by VARCHAR(255) NOT NULL,
    target_role VARCHAR(100),
    college_id VARCHAR(255),
    created_at VARCHAR(100) NOT NULL
);

CREATE TABLE IF NOT EXISTS holidays (
    id VARCHAR(255) PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    date VARCHAR(50) NOT NULL,
    type VARCHAR(100) NOT NULL,
    college_id VARCHAR(255)
);

CREATE TABLE IF NOT EXISTS login_history (
    id VARCHAR(255) PRIMARY KEY,
    user_id VARCHAR(255) NOT NULL,
    login_time VARCHAR(100) NOT NULL,
    logout_time VARCHAR(100),
    ip VARCHAR(100),
    device TEXT
);

-- 8. SME & Demos
CREATE TABLE IF NOT EXISTS sme_users (
    id VARCHAR(255) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL DEFAULT 'password123',
    subject VARCHAR(255),
    department VARCHAR(255),
    is_head_sme INTEGER DEFAULT 0,
    head_subject_group VARCHAR(255),
    mentor_group VARCHAR(255)
);

CREATE TABLE IF NOT EXISTS sme_availability (
    id TEXT PRIMARY KEY,
    sme_id TEXT NOT NULL,
    day_of_week TEXT NOT NULL,
    start_time TEXT NOT NULL,
    end_time TEXT NOT NULL,
    is_active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    slot_type TEXT DEFAULT 'demo'
);

CREATE TABLE IF NOT EXISTS mentor_groups (
    id VARCHAR(255) PRIMARY KEY,
    name VARCHAR(255) NOT NULL UNIQUE,
    description TEXT,
    color VARCHAR(50) DEFAULT '#4f46e5',
    is_active INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS subject_groups (
    id VARCHAR(255) PRIMARY KEY,
    name VARCHAR(255) NOT NULL UNIQUE,
    description TEXT,
    lead_sme_id VARCHAR(255),
    lead_sme_name VARCHAR(255)
);

CREATE TABLE IF NOT EXISTS demo_sessions (
    id VARCHAR(255) PRIMARY KEY,
    mentorId VARCHAR(255) NOT NULL,
    mentorName VARCHAR(255) NOT NULL,
    smeId VARCHAR(255) NOT NULL,
    smeName VARCHAR(255) NOT NULL,
    dateStr VARCHAR(50) NOT NULL,
    timeSlot VARCHAR(100) NOT NULL,
    subject VARCHAR(255) NOT NULL,
    stream VARCHAR(100) NOT NULL,
    week INTEGER NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'scheduled',
    marks INTEGER,
    comments TEXT,
    checklist TEXT,
    created_at VARCHAR(100) NOT NULL
);

CREATE TABLE IF NOT EXISTS demo_rules (
    id VARCHAR(255) PRIMARY KEY,
    subject VARCHAR(255) NOT NULL,
    week INTEGER NOT NULL,
    target INTEGER NOT NULL,
    created_at VARCHAR(100) NOT NULL
);

CREATE TABLE IF NOT EXISTS demo_swap_requests (
    id VARCHAR(255) PRIMARY KEY,
    sessionId VARCHAR(255) NOT NULL,
    mentorId VARCHAR(255) NOT NULL,
    mentorName VARCHAR(255) NOT NULL,
    smeId VARCHAR(255) NOT NULL,
    smeName VARCHAR(255) NOT NULL,
    dateStr VARCHAR(50) NOT NULL,
    timeSlot VARCHAR(100) NOT NULL,
    subject VARCHAR(255) NOT NULL,
    stream VARCHAR(100) NOT NULL,
    reason TEXT NOT NULL,
    remarks TEXT,
    swapType VARCHAR(100) NOT NULL,
    proposedMentorId VARCHAR(255),
    proposedMentorName VARCHAR(255),
    proposedSmeId VARCHAR(255),
    proposedSmeName VARCHAR(255),
    proposedDateStr VARCHAR(50),
    proposedTimeSlot VARCHAR(100),
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    created_at VARCHAR(100) NOT NULL
);

-- 9. Exams, Settings & Miscellaneous
CREATE TABLE IF NOT EXISTS exam_schedules (
    id VARCHAR(255) PRIMARY KEY,
    college_id VARCHAR(255) NOT NULL,
    department VARCHAR(255) NOT NULL,
    semester VARCHAR(50) NOT NULL,
    exam_type VARCHAR(100) NOT NULL,
    subject_name VARCHAR(255) NOT NULL,
    subject_code VARCHAR(100),
    exam_date VARCHAR(50) NOT NULL,
    session_time VARCHAR(100) NOT NULL,
    start_time VARCHAR(50),
    end_time VARCHAR(50),
    day_order VARCHAR(100),
    hall_room VARCHAR(100),
    max_marks NUMERIC DEFAULT 50,
    passing_marks NUMERIC DEFAULT 20,
    created_by VARCHAR(255),
    status VARCHAR(50) DEFAULT 'Scheduled',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS student_exam_marks (
    id VARCHAR(255) PRIMARY KEY,
    exam_id VARCHAR(255) NOT NULL REFERENCES exam_schedules(id) ON DELETE CASCADE,
    student_id VARCHAR(255) NOT NULL REFERENCES students(id),
    college_id VARCHAR(255) NOT NULL,
    marks_obtained NUMERIC,
    max_marks NUMERIC DEFAULT 50,
    is_absent INTEGER DEFAULT 0,
    grade VARCHAR(50),
    remarks TEXT,
    evaluated_by VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(exam_id, student_id)
);

CREATE TABLE IF NOT EXISTS class_mentor_assignments (
    id VARCHAR(255) PRIMARY KEY,
    college_id VARCHAR(255) NOT NULL REFERENCES colleges(id),
    year VARCHAR(50) NOT NULL,
    department VARCHAR(255) NOT NULL,
    classGroup VARCHAR(255) NOT NULL,
    mentor_id VARCHAR(255) NOT NULL REFERENCES mentors(id),
    mentor_name VARCHAR(255),
    created_at VARCHAR(100),
    updated_at VARCHAR(100)
);

CREATE TABLE IF NOT EXISTS faculty_configs (
    mentor_id VARCHAR(255) PRIMARY KEY REFERENCES mentors(id) ON DELETE CASCADE,
    max_hours INTEGER NOT NULL DEFAULT 16,
    shift VARCHAR(50) NOT NULL DEFAULT 'general'
);

CREATE TABLE IF NOT EXISTS kam_tasks (
    id VARCHAR(255) PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    collegeId VARCHAR(255),
    assigned_cam_id VARCHAR(255),
    description TEXT,
    priority VARCHAR(50) NOT NULL DEFAULT 'medium',
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    dueDate VARCHAR(50) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS campus_issues (
    id VARCHAR(255) PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    type VARCHAR(100) NOT NULL,
    priority VARCHAR(50) NOT NULL,
    desc_text TEXT,
    notes TEXT,
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    collegeId VARCHAR(255) NOT NULL,
    collegeName VARCHAR(255),
    escalated INTEGER DEFAULT 0,
    escalatedAt VARCHAR(100),
    resolvedAt VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS signup_requests (
    id VARCHAR(255) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    requested_role VARCHAR(100) NOT NULL,
    status VARCHAR(50) DEFAULT 'pending',
    college_id VARCHAR(255),
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS feedback_reports (
    id VARCHAR(255) PRIMARY KEY,
    user_id VARCHAR(255),
    user_role VARCHAR(100),
    type VARCHAR(100) NOT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    status VARCHAR(50) DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    admin_notes TEXT,
    resolved_by VARCHAR(255),
    resolved_at TEXT,
    user_name VARCHAR(255),
    college_id VARCHAR(255),
    college_name VARCHAR(255),
    department VARCHAR(255),
    register_number VARCHAR(255),
    contact_info VARCHAR(255)
);

CREATE TABLE IF NOT EXISTS campus_drafts (
    id VARCHAR(255) PRIMARY KEY DEFAULT 'active_draft',
    data TEXT NOT NULL,
    saved_at VARCHAR(100) NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS system_settings (
    key VARCHAR(255) PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_by VARCHAR(255)
);

CREATE TABLE IF NOT EXISTS academic_years (
    year_name VARCHAR(100) PRIMARY KEY
);

CREATE TABLE IF NOT EXISTS academic_events (
    id VARCHAR(255) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    date VARCHAR(50) NOT NULL,
    end_date VARCHAR(50),
    "desc" TEXT,
    description TEXT,
    category VARCHAR(100) DEFAULT 'Coding Fest & Hackathon',
    department VARCHAR(255) DEFAULT 'All Departments',
    audience VARCHAR(100) DEFAULT 'All Campus',
    status VARCHAR(50) DEFAULT 'Upcoming',
    venue VARCHAR(255),
    college_id VARCHAR(255),
    photos TEXT,
    coordinator VARCHAR(255),
    chief_guest VARCHAR(255),
    registration_link TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY
);

-- Default Settings
INSERT INTO system_settings (key, value) VALUES ('mailing_enabled', 'true') ON CONFLICT (key) DO NOTHING;

-- Owner / super-admin accounts are intentionally NOT seeded here: no personal identity or
-- plaintext credential belongs in the schema. The generic seeder (src/lib/seed.ts) creates a
-- fallback admin profile, and the real owner account is provisioned on first login from the
-- SUPER_ADMIN_EMAIL / SUPER_ADMIN_PASSWORD environment variables (see src/app/api/login/route.ts).
-- An existing account can be promoted at any time with:
--   UPDATE users SET role = 'admin' WHERE LOWER(email) = LOWER('<owner email>');

-- ============================================================================
-- 10. Performance Indexes (25 High-Traffic Indexes)
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_sa_student          ON student_attendance (studentId);
CREATE INDEX IF NOT EXISTS idx_sa_slot_date        ON student_attendance (slotId, dateStr);
CREATE INDEX IF NOT EXISTS idx_sa_date             ON student_attendance (dateStr);
CREATE INDEX IF NOT EXISTS idx_sa_student_date     ON student_attendance (studentId, dateStr);

CREATE INDEX IF NOT EXISTS idx_slots_mentor        ON slots (mentorId, day, time);
CREATE INDEX IF NOT EXISTS idx_slots_college       ON slots (college_id);
CREATE INDEX IF NOT EXISTS idx_slots_class         ON slots (classGroup, day, time);
CREATE INDEX IF NOT EXISTS idx_slots_location      ON slots (location, day, time, shift);

CREATE INDEX IF NOT EXISTS idx_stu_college         ON students (college_id);
CREATE INDEX IF NOT EXISTS idx_stu_class           ON students (classGroup, college_id);
CREATE INDEX IF NOT EXISTS idx_stu_roll            ON students (roll_number);
CREATE INDEX IF NOT EXISTS idx_stu_reg             ON students (register_number);
CREATE INDEX IF NOT EXISTS idx_stu_email           ON students (email);

CREATE INDEX IF NOT EXISTS idx_users_email         ON users (email);
CREATE INDEX IF NOT EXISTS idx_users_ref           ON users (reference_id);
CREATE INDEX IF NOT EXISTS idx_users_role          ON users (role);

CREATE INDEX IF NOT EXISTS idx_notifs_user         ON notifications (user_id, is_read);
CREATE INDEX IF NOT EXISTS idx_audit_ts            ON audit_logs (timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_student_tracker_lookup ON student_academic_tracker (student_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_student_tracker_email  ON student_academic_tracker (student_email);
CREATE INDEX IF NOT EXISTS idx_student_tracker_week   ON student_academic_tracker (class_group, subject, week_number);

CREATE INDEX IF NOT EXISTS idx_at_mentor_date      ON academic_tracker (mentor_id, date);
CREATE INDEX IF NOT EXISTS idx_at_class            ON academic_tracker (class_group, subject);

CREATE INDEX IF NOT EXISTS idx_fees_student        ON student_fees (student_id, college_id);
CREATE INDEX IF NOT EXISTS idx_fees_college        ON student_fees (college_id, status);

CREATE INDEX IF NOT EXISTS idx_interviews_col      ON student_interviews (college_id, status);
CREATE INDEX IF NOT EXISTS idx_allocs              ON interview_allocations (interview_id);

CREATE INDEX IF NOT EXISTS idx_dconfig             ON campus_daily_configs (college_id, dateStr);
CREATE INDEX IF NOT EXISTS idx_handover_slot       ON approved_handovers (slotId, dateStr);
CREATE INDEX IF NOT EXISTS idx_handover_req        ON handover_requests (requestorId, status);
CREATE INDEX IF NOT EXISTS idx_mentor_att_clg_date ON mentor_attendance (college_id, date_str);

-- ─────────────────────────────────────────────────────────────────────────────
-- Applied-migration ledger. Written by src/lib/migrations.ts at server start so
-- a new instance does not replay every migration on each cold start.
-- (schema_migrations above is the legacy SQLite version table, left untouched.)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS applied_migrations (
    name VARCHAR(255) PRIMARY KEY,
    applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Tables declared here for a complete fresh build. They are also created by
-- runtime migrations (src/lib/migrations.ts), so existing databases converge
-- without re-running this file.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS user_sessions (
    session_id_hash VARCHAR(128) PRIMARY KEY,
    user_id VARCHAR(128) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_activity_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMPTZ NOT NULL,
    is_revoked BOOLEAN DEFAULT FALSE,
    revoked_at TIMESTAMPTZ,
    revoked_reason VARCHAR(255),
    csrf_secret VARCHAR(128) NOT NULL,
    ip_address VARCHAR(64) DEFAULT 'Unknown',
    user_agent TEXT
);

CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_revoked_active ON user_sessions(user_id, is_revoked);
CREATE INDEX IF NOT EXISTS idx_user_sessions_validity ON user_sessions(session_id_hash, is_revoked, expires_at);

CREATE TABLE IF NOT EXISTS login_attempts (
    id TEXT PRIMARY KEY,
    email_key TEXT NOT NULL,
    ip TEXT,
    success INTEGER NOT NULL DEFAULT 0,
    attempted_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_login_attempts_email ON login_attempts (email_key, attempted_at);
CREATE INDEX IF NOT EXISTS idx_login_attempts_ip ON login_attempts (ip, attempted_at);

CREATE TABLE IF NOT EXISTS campus_audits (
    id TEXT PRIMARY KEY,
    uid TEXT UNIQUE NOT NULL,
    college_id TEXT,
    campus TEXT NOT NULL,
    mentor_id TEXT,
    mentor_name TEXT NOT NULL,
    department TEXT,
    dept_name TEXT,
    subject TEXT NOT NULL,
    audit_date TEXT NOT NULL,
    auditor_name TEXT,
    auditor_role TEXT,
    skill_criteria TEXT,
    skill_score INTEGER DEFAULT 0,
    tasks_assigned INTEGER DEFAULT 0,
    tasks_completed INTEGER DEFAULT 0,
    skill_proof_link TEXT,
    skill_remarks TEXT,
    coursework_criteria TEXT,
    coursework_score INTEGER DEFAULT 0,
    coursework_remarks TEXT,
    attendance_criteria TEXT,
    attendance_score INTEGER DEFAULT 0,
    below_75_count INTEGER DEFAULT 0,
    attendance_remarks TEXT,
    kam_id TEXT,
    kam_name TEXT,
    reviewer_college_id TEXT,
    reviewer_campus TEXT NOT NULL,
    reviewer_cm_name TEXT,
    peer_status TEXT NOT NULL DEFAULT 'Pending',
    peer_signoff_notes TEXT,
    peer_signed_by TEXT,
    peer_signed_at TEXT,
    overall_status TEXT NOT NULL DEFAULT 'In Progress',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS cm_attendance (
    id VARCHAR(255) PRIMARY KEY,
    cam_id VARCHAR(255) NOT NULL,
    college_id VARCHAR(255) NOT NULL,
    date_str VARCHAR(32) NOT NULL,
    status VARCHAR(64) NOT NULL,
    punch_in_time VARCHAR(32),
    punch_out_time VARCHAR(32),
    reason TEXT,
    approved_by VARCHAR(255),
    approval_status VARCHAR(32) DEFAULT 'pending',
    approval_notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (cam_id, date_str)
);

CREATE TABLE IF NOT EXISTS cm_leave_requests (
    id VARCHAR(255) PRIMARY KEY,
    cam_id VARCHAR(255) NOT NULL,
    college_id VARCHAR(255) NOT NULL,
    kam_id VARCHAR(255),
    request_type VARCHAR(64) NOT NULL,
    start_date VARCHAR(32) NOT NULL,
    end_date VARCHAR(32) NOT NULL,
    start_time VARCHAR(32),
    end_time VARCHAR(32),
    reason TEXT NOT NULL,
    status VARCHAR(32) DEFAULT 'pending',
    approved_by VARCHAR(255),
    rejection_reason TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS demo_evaluation_criteria (
    id TEXT PRIMARY KEY,
    department TEXT NOT NULL,
    label TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'checkbox',
    threshold REAL,
    scale REAL,
    is_active INTEGER DEFAULT 1,
    is_system INTEGER DEFAULT 0,
    sort_order INTEGER DEFAULT 0,
    created_by TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT
);

CREATE TABLE IF NOT EXISTS demo_reallocation_requests (
    id TEXT PRIMARY KEY,
    demo_session_id TEXT NOT NULL,
    leave_request_id TEXT,
    mentor_id TEXT NOT NULL,
    mentor_name TEXT,
    sme_id TEXT,
    sme_name TEXT,
    subject TEXT,
    stream TEXT,
    week INTEGER,
    original_date_str TEXT NOT NULL,
    original_time_slot TEXT NOT NULL,
    proposed_date_str TEXT NOT NULL,
    proposed_time_slot TEXT NOT NULL,
    reason TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    request_kind TEXT DEFAULT 'leave',
    proposed_by TEXT,
    decided_by TEXT,
    decided_at TEXT,
    decision_notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS mentor_nps_monthly (
    id SERIAL PRIMARY KEY,
    college_name TEXT NOT NULL,
    month_key TEXT NOT NULL,
    nps_index INTEGER,
    promoters INTEGER DEFAULT 0,
    passives INTEGER DEFAULT 0,
    detractors INTEGER DEFAULT 0,
    total_responses INTEGER DEFAULT 0,
    avg_rating NUMERIC,
    mentor_count INTEGER DEFAULT 0,
    payload TEXT,
    synced_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (college_name, month_key)
);

CREATE TABLE IF NOT EXISTS mentor_skill_clearances (
    id TEXT PRIMARY KEY,
    college_id TEXT,
    mentor_id TEXT NOT NULL,
    mentor_name TEXT,
    subject TEXT NOT NULL,
    subject_type TEXT DEFAULT 'Skill',
    week_number INTEGER NOT NULL,
    scope TEXT NOT NULL DEFAULT 'week',
    topic TEXT,
    demo_session_id TEXT,
    weekly_plan_id TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    score INTEGER,
    remarks TEXT,
    verified_by TEXT,
    verified_at TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT
);

CREATE TABLE IF NOT EXISTS mentor_weekly_plans (
    id VARCHAR(255) PRIMARY KEY,
    college_id VARCHAR(255) NOT NULL,
    mentor_id VARCHAR(255) NOT NULL,
    mentor_name VARCHAR(255),
    department VARCHAR(255),
    subject VARCHAR(255) NOT NULL,
    class_group VARCHAR(255) NOT NULL,
    week_number INTEGER NOT NULL,
    start_date VARCHAR(50),
    end_date VARCHAR(50),
    unit VARCHAR(255),
    topics_planned TEXT,
    session_plan TEXT,
    learning_objectives TEXT,
    teaching_mode VARCHAR(50) DEFAULT 'Offline',
    material_url TEXT,
    status VARCHAR(50) DEFAULT 'Submitted',
    cam_feedback TEXT,
    sme_remarks TEXT,
    verified_by VARCHAR(255),
    verified_at VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS student_achievements (
    id VARCHAR(255) PRIMARY KEY,
    college_id VARCHAR(255) NOT NULL,
    title TEXT NOT NULL,
    topic TEXT,
    participation_type TEXT DEFAULT 'individual',
    team_name TEXT,
    achievement_level TEXT DEFAULT 'National Level',
    organizer TEXT,
    category VARCHAR(100) DEFAULT 'Hackathon & Competitions',
    description TEXT,
    date_str VARCHAR(50) NOT NULL,
    badge VARCHAR(100) DEFAULT 'Winner',
    reward_prize TEXT,
    event_name TEXT,
    proof_link TEXT,
    photos TEXT,
    student_ids TEXT,
    student_names TEXT,
    added_by VARCHAR(255) DEFAULT 'Campus Manager',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS student_mentor_feedback (
    id TEXT PRIMARY KEY,
    register_number TEXT NOT NULL,
    student_name TEXT,
    email TEXT,
    college_id TEXT,
    college_name TEXT,
    department TEXT,
    class_group TEXT,
    ape_q1_assessments TEXT,
    ape_q2_study_materials TEXT,
    ape_q2_missing_papers TEXT,
    ape_q3_hands_on_rating INTEGER,
    ape_q4_confidence_rating INTEGER,
    challenges_selected TEXT,
    challenges_detail TEXT,
    challenges_suggestions TEXT,
    nps_score INTEGER,
    nps_fu1_campus_satisfied TEXT,
    nps_fu2_classroom_satisfied TEXT,
    nps_fu3_skill_dev TEXT,
    nps_fu4_placement TEXT,
    nps_likes TEXT,
    nps_improve TEXT,
    mentor_ratings TEXT,
    full_payload TEXT,
    submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Monthly student sentiment survey (Reports & Insight → Student NPS). One row per
-- student per month; re-answering edits that month instead of adding a second vote.
CREATE TABLE IF NOT EXISTS student_nps_responses (
    id TEXT PRIMARY KEY,
    month_key TEXT NOT NULL,
    student_id TEXT NOT NULL,
    student_name TEXT,
    college_id TEXT,
    college_name TEXT,
    department TEXT,
    class_group TEXT,
    score INTEGER NOT NULL,
    likes TEXT,
    improve TEXT,
    submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_student_nps_month       ON student_nps_responses(month_key, student_id);
CREATE INDEX IF NOT EXISTS idx_student_nps_college_month     ON student_nps_responses(college_id, month_key);
CREATE INDEX IF NOT EXISTS idx_student_nps_month             ON student_nps_responses(month_key DESC);

-- Hot-path indexes (auth fallbacks, attendance windows, feeds).
CREATE INDEX IF NOT EXISTS idx_users_email_lower ON users(LOWER(email));
CREATE INDEX IF NOT EXISTS idx_mentors_email_lower ON mentors(LOWER(email));
CREATE INDEX IF NOT EXISTS idx_students_email_lower ON students(LOWER(email));
CREATE INDEX IF NOT EXISTS idx_campus_managers_email_lower ON campus_managers(LOWER(email));
CREATE INDEX IF NOT EXISTS idx_kam_users_email_lower ON kam_users(LOWER(email));

CREATE INDEX IF NOT EXISTS idx_student_attendance_studentid    ON student_attendance(studentid);
CREATE INDEX IF NOT EXISTS idx_student_attendance_slotid       ON student_attendance(slotid);
CREATE INDEX IF NOT EXISTS idx_student_attendance_student_date ON student_attendance(studentid, datestr);
CREATE INDEX IF NOT EXISTS idx_student_attendance_slot_date    ON student_attendance(slotid, datestr);
CREATE INDEX IF NOT EXISTS idx_student_attendance_date         ON student_attendance(datestr);
CREATE INDEX IF NOT EXISTS idx_students_college                ON students(college_id);
CREATE INDEX IF NOT EXISTS idx_mentors_college                 ON mentors(college_id);

CREATE INDEX IF NOT EXISTS idx_leave_requests_studentid        ON leave_requests(studentid);
CREATE INDEX IF NOT EXISTS idx_leave_requests_timestamp        ON leave_requests(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_login_history_user_id           ON login_history(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_created      ON notifications(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_faculty_leave_status            ON faculty_leave_requests(status);
CREATE INDEX IF NOT EXISTS idx_handover_requests_timestamp     ON handover_requests(timestamp DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- Partner / Client NPS feedback intake (Partner-Feedback-Form submissions).
-- Consumed by GET /api/audit/client-nps (Campus E-Audit → Client NPS view).
-- Source form: FACE-Prep-Campus-Cloud/Partner-Feedback-Form (GitHub Pages).
-- ─────────────────────────────────────────────────────────────────────────────
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

CREATE INDEX IF NOT EXISTS faceprep_feedback_college_idx ON faceprep_feedback (college_university);
CREATE INDEX IF NOT EXISTS faceprep_feedback_submitted_idx ON faceprep_feedback (submitted_at DESC);

-- The public feedback form posts with the anon key, and the CM panel reads with it too.
ALTER TABLE faceprep_feedback ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon insert" ON faceprep_feedback;
CREATE POLICY "anon insert" ON faceprep_feedback FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon read" ON faceprep_feedback;
CREATE POLICY "anon read" ON faceprep_feedback FOR SELECT TO anon, authenticated USING (true);

-- PostgREST hides tables the API roles cannot reach (PGRST205) — grants are required,
-- including USAGE on the BIGSERIAL sequence or inserts fail.
GRANT SELECT, INSERT ON faceprep_feedback TO anon, authenticated, service_role;
GRANT USAGE, SELECT ON SEQUENCE faceprep_feedback_id_seq TO anon, authenticated, service_role;

-- Force PostgREST to pick the table up immediately.
NOTIFY pgrst, 'reload schema';

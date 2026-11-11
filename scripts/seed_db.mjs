/**
 * Database Seed Execution Script
 *
 * Runs schema seeding against the PostgreSQL database.
 * Supports:
 *   1. SQL execution mode (runs data/seeds/seed.sql directly)
 *   2. Snapshot JSON mode (reads data/seeds/production_dump.json and inserts)
 *   3. Native bootstrap mode
 *
 * Usage:
 *   node scripts/seed_db.mjs [--sql | --snapshot]
 */

import fs from "fs";
import path from "path";
import pg from "pg";
import crypto from "crypto";
import { pathToFileURL } from "url";

const { Pool } = pg;

function hashPasswordV2(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const iterations = 210000;
  const hash = crypto.pbkdf2Sync(password, salt, iterations, 64, "sha512").toString("hex");
  return `pbkdf2$${iterations}$${salt}$${hash}`;
}

export async function seedAdminAccount(options = {}) {
  const log = options.logger || console.log;
  loadEnvFiles();

  const connectionString =
    options.connectionString ||
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL;

  if (!connectionString) {
    throw new Error("No DATABASE_URL or POSTGRES_URL found in environment.");
  }

  const isLocalHost = /localhost|127\.0\.0\.1/.test(connectionString);
  const client = new pg.Client({
    connectionString,
    ssl: isLocalHost ? undefined : { rejectUnauthorized: false },
    connectionTimeoutMillis: 30000
  });

  const adminEmail = (options.email || process.env.ADMIN_EMAIL || "admin@university.edu").trim().toLowerCase();
  const adminName = (options.name || process.env.ADMIN_NAME || "System Admin").trim();
  const adminPass = options.password || process.env.ADMIN_PASSWORD || "password123";
  const adminId = "admin_1";

  try {
    log("🔌 Connecting to PostgreSQL to seed admin account...");
    await client.connect();

    // 1. admin_users
    await client.query(`
      INSERT INTO admin_users (id, name, email)
      VALUES ($1, $2, $3)
      ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, email = EXCLUDED.email
    `, [adminId, adminName, adminEmail]);

    // 2. users
    const hashed = hashPasswordV2(adminPass);
    const now = new Date().toISOString();
    await client.query(`
      INSERT INTO users (id, email, password_hash, role, reference_id, created_at, updated_at)
      VALUES ($1, $2, $3, 'admin', $4, $5, $6)
      ON CONFLICT (id) DO UPDATE SET
        email = EXCLUDED.email,
        password_hash = CASE WHEN users.password_hash IS NULL OR users.password_hash = '' THEN EXCLUDED.password_hash ELSE users.password_hash END,
        role = 'admin',
        updated_at = EXCLUDED.updated_at
    `, [adminId, adminEmail, hashed, adminId, now, now]);

    log(`✅ Admin account successfully seeded: ${adminEmail} (Role: admin)`);
    return { success: true, email: adminEmail, id: adminId, role: "admin" };
  } finally {
    await client.end().catch(() => {});
  }
}

function loadEnvFiles() {
  for (const file of [".env.local", ".env", ".env.updated"]) {
    const fullPath = path.resolve(/*turbopackIgnore: true*/ process.cwd(), file);
    if (!fs.existsSync(fullPath)) continue;
    try {
      const content = fs.readFileSync(fullPath, "utf8");
      for (const line of content.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const eqIdx = trimmed.indexOf("=");
        if (eqIdx <= 0) continue;
        const key = trimmed.slice(0, eqIdx).trim();
        let val = trimmed.slice(eqIdx + 1).trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        if (!process.env[key]) {
          process.env[key] = val;
        }
      }
    } catch (_) {}
  }
}

export const DEPENDENCY_ORDER = [
  "admin_users",
  "kam_users",
  "sme_users",
  "colleges",
  "campus_managers",
  "departments",
  "courses",
  "subjects",
  "mentors",
  "students",
  "users",
  "slots",
  "class_mentor_assignments",
  "faculty_configs",
  "academic_years",
  "academic_events",
  "system_settings",
  "student_fees",
  "fee_payments",
  "approvals",
  "campus_issues",
  "announcements",
  "holidays",
  "mentor_groups",
  "subject_groups",
  "subject_materials",
  "academic_tracker",
  "weekly_tasks",
  "student_tracker",
  "weekly_academic_tasks",
  "student_academic_tracker",
  "student_interviews",
  "interview_allocations",
  "cam_capacity_responses",
  "student_interview_slots",
  "interview_evaluations",
  "student_attendance",
  "mentor_attendance",
  "cm_attendance",
  "leave_requests",
  "faculty_leave_requests",
  "leave_balances",
  "cm_leave_requests",
  "handover_requests",
  "approved_handovers",
  "demo_sessions",
  "demo_rules",
  "demo_swap_requests",
  "exam_schedules",
  "student_exam_marks",
  "feedback_reports",
  "student_mentor_feedback",
  "faceprep_feedback",
  "campus_drafts",
  "campus_audits",
  "mentor_nps_monthly",
  "mentor_weekly_plans",
  "student_achievements",
  "audit_logs"
];

export async function runSqlSeed(options = {}) {
  const log = options.logger || console.log;
  loadEnvFiles();

  const connectionString =
    options.connectionString ||
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL;

  if (!connectionString) {
    throw new Error("No DATABASE_URL or POSTGRES_URL found in environment.");
  }

  const sqlPath = options.sqlPath || path.resolve(process.cwd(), "data", "seeds", "seed.sql");
  if (!fs.existsSync(sqlPath)) {
    throw new Error(`SQL seed file not found at ${sqlPath}. Run dump_prod_data.mjs first.`);
  }

  const sql = fs.readFileSync(sqlPath, "utf8");
  const isLocalHost = /localhost|127\.0\.0\.1/.test(connectionString);
  const client = new pg.Client({
    connectionString,
    ssl: isLocalHost ? undefined : { rejectUnauthorized: false },
    connectionTimeoutMillis: 30000
  });

  try {
    log("🔌 Connecting to PostgreSQL to execute seed.sql...");
    await client.connect();
    log(` Executing ${sqlPath}...`);
    const startedAt = Date.now();
    await client.query(sql);
    const durationMs = Date.now() - startedAt;
    log(` Successfully applied seed.sql in ${durationMs}ms.`);
    return { success: true, durationMs };
  } finally {
    await client.end().catch(() => {});
  }
}

export async function runSnapshotSeed(options = {}) {
  const log = options.logger || console.log;
  loadEnvFiles();

  const connectionString =
    options.connectionString ||
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL;

  if (!connectionString) {
    throw new Error("No DATABASE_URL or POSTGRES_URL found in environment.");
  }

  const snapshotPath =
    options.snapshotPath || path.resolve(process.cwd(), "data", "seeds", "production_dump.json");
  if (!fs.existsSync(snapshotPath)) {
    throw new Error(`Snapshot file not found at ${snapshotPath}. Run dump_prod_data.mjs first.`);
  }

  const raw = fs.readFileSync(snapshotPath, "utf8");
  const dump = JSON.parse(raw);
  const tables = dump.tables || {};
  const isLocalHost = /localhost|127\.0\.0\.1/.test(connectionString);

  const client = new pg.Client({
    connectionString,
    ssl: isLocalHost ? undefined : { rejectUnauthorized: false },
    connectionTimeoutMillis: 30000
  });

  const tableNames = Object.keys(tables);
  const ordered = [
    ...DEPENDENCY_ORDER.filter((t) => tables[t]),
    ...tableNames.filter((t) => !DEPENDENCY_ORDER.includes(t))
  ];

  const results = {};

  try {
    log("🔌 Connecting to PostgreSQL...");
    await client.connect();
    log(` Seeding from snapshot (${snapshotPath}) across ${ordered.length} tables...`);

    for (const table of ordered) {
      const rows = tables[table];
      if (!Array.isArray(rows) || rows.length === 0) continue;

      log(`   Inserting ${rows.length} rows into ${table}...`);
      let successCount = 0;

      for (const row of rows) {
        const cols = Object.keys(row);
        if (cols.length === 0) continue;
        const quotedCols = cols.map((c) => `"${c}"`).join(", ");
        const placeholders = cols.map((_, i) => `$${i + 1}`).join(", ");
        const values = cols.map((c) => {
          const val = row[c];
          if (val !== null && typeof val === "object" && !(val instanceof Date)) {
            return JSON.stringify(val);
          }
          return val;
        });

        try {
          await client.query(
            `INSERT INTO "${table}" (${quotedCols}) VALUES (${placeholders}) ON CONFLICT DO NOTHING`,
            values
          );
          successCount++;
        } catch (_) {}
      }

      results[table] = successCount;
    }

    log(" Seeding completed successfully.");
    return { success: true, results };
  } finally {
    await client.end().catch(() => {});
  }
}

// Direct CLI execution. See dump_prod_data.mjs: endsWith() cannot match this
// project's spaced directory path, so the URL comparison is required.
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const useSql = process.argv.includes("--sql");
  const useSnapshot = process.argv.includes("--snapshot");
  const runner = useSql
    ? runSqlSeed()
    : useSnapshot
    ? runSnapshotSeed()
    : seedAdminAccount();
  runner
    .then((res) => {
      console.log("\n Seed execution finished successfully!", res);
      process.exit(0);
    })
    .catch((err) => {
      console.error("\n❌ Seed execution failed:", err.message);
      process.exit(1);
    });
}


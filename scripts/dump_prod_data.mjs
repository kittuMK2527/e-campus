/**
 * Automated Production Data Export & Snapshot Generator
 *
 * Connects to PostgreSQL, discovers all public tables, dumps the complete dataset
 * into:
 *   1. data/seeds/production_dump.json  (Single structured JSON snapshot)
 *   2. data/seeds/tables/<table_name>.json  (Individual modular table JSONs)
 *   3. data/seeds/seed.sql  (Executable idempotent SQL script with ON CONFLICT DO NOTHING)
 *
 * Usage:
 *   node scripts/dump_prod_data.mjs
 *   Can also be imported programmatically:
 *   import { dumpProductionData } from "./dump_prod_data.mjs";
 */

import fs from "fs";
import path from "path";
import pg from "pg";
import { pathToFileURL } from "url";

const { Pool } = pg;

export function loadEnvFiles() {
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

// Well-known dependency hierarchy so seeds insert parent rows before children
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

// Tables to omit from generic seed dumps (ephemeral sessions, raw migration tracking)
const IGNORED_TABLES = new Set([
  "applied_migrations",
  "schema_migrations",
  "user_sessions",
  "login_attempts",
  "login_history"
]);

function formatSqlValue(val) {
  if (val === null || val === undefined) return "NULL";
  if (typeof val === "boolean") return val ? "TRUE" : "FALSE";
  if (typeof val === "number") return Number.isFinite(val) ? String(val) : "NULL";
  if (val instanceof Date) return `'${val.toISOString()}'`;
  if (typeof val === "object") {
    const jsonStr = JSON.stringify(val).replace(/'/g, "''");
    return `'${jsonStr}'::jsonb`;
  }
  const str = String(val).replace(/'/g, "''");
  return `'${str}'`;
}

export async function dumpProductionData(options = {}) {
  const log = options.logger || console.log;
  loadEnvFiles();

  const connectionString =
    options.connectionString ||
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL;

  if (!connectionString) {
    throw new Error("No DATABASE_URL or POSTGRES_URL found in environment or options.");
  }

  const outputDir = options.outputDir || path.resolve(process.cwd(), "data", "seeds");
  const tablesDir = path.resolve(outputDir, "tables");
  fs.mkdirSync(tablesDir, { recursive: true });

  const isLocalHost = /localhost|127\.0\.0\.1/.test(connectionString);
  const pool = new Pool({
    connectionString,
    ssl: isLocalHost ? undefined : { rejectUnauthorized: false },
    connectionTimeoutMillis: 30000,
    statement_timeout: 90000
  });

  try {
    log("🔌 Connecting to PostgreSQL database...");
    await pool.query("SELECT 1");
    log(" Connected successfully.");

    // Query all public tables
    const tableRes = await pool.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_type = 'BASE TABLE'
      ORDER BY table_name;
    `);

    const existingTables = new Set(tableRes.rows.map((r) => r.table_name));
    log(` Discovered ${existingTables.size} tables in public schema.`);

    // Order tables by DEPENDENCY_ORDER first, then remaining alphabetically
    const orderedTables = [
      ...DEPENDENCY_ORDER.filter((t) => existingTables.has(t) && !IGNORED_TABLES.has(t)),
      ...Array.from(existingTables)
        .filter((t) => !DEPENDENCY_ORDER.includes(t) && !IGNORED_TABLES.has(t))
        .sort()
    ];

    const fullDump = {
      exportedAt: new Date().toISOString(),
      databaseUrlMasked: connectionString.replace(/:\/\/([^:]+):([^@]+)@/, "://$1:***@"),
      tableCounts: {},
      tables: {}
    };

    const sqlStatements = [
      `-- =========================================================================`,
      `-- Automated Database Seed / Dump Generated at ${fullDump.exportedAt}`,
      `-- Total Tables: ${orderedTables.length}`,
      `-- =========================================================================\n`,
      `BEGIN;\n`
    ];

    for (const table of orderedTables) {
      log(`📦 Exporting table: ${table}...`);
      try {
        const rowsRes = await pool.query(`SELECT * FROM "${table}"`);
        const rows = rowsRes.rows;
        fullDump.tableCounts[table] = rows.length;
        fullDump.tables[table] = rows;

        // Write modular table JSON
        const tableJsonPath = path.resolve(tablesDir, `${table}.json`);
        fs.writeFileSync(tableJsonPath, JSON.stringify(rows, null, 2), "utf8");

        if (rows.length === 0) {
          log(`   ↳ 0 rows.`);
          continue;
        }

        log(`   ↳ ${rows.length} rows exported.`);

        // Build SQL statements
        sqlStatements.push(`-- Table: ${table} (${rows.length} rows)`);
        const cols = Object.keys(rows[0]);
        const quotedCols = cols.map((c) => `"${c}"`).join(", ");

        // Chunk inserts by 50 rows to keep SQL statements manageable
        const chunkSize = 50;
        for (let i = 0; i < rows.length; i += chunkSize) {
          const chunk = rows.slice(i, i + chunkSize);
          const valueRows = chunk
            .map((row) => `  (${cols.map((col) => formatSqlValue(row[col])).join(", ")})`)
            .join(",\n");

          sqlStatements.push(
            `INSERT INTO "${table}" (${quotedCols})\nVALUES\n${valueRows}\nON CONFLICT DO NOTHING;\n`
          );
        }
      } catch (tableErr) {
        log(`   ⚠️ Failed to export ${table}: ${tableErr.message}`);
        fullDump.tableCounts[table] = -1;
      }
    }

    sqlStatements.push(`COMMIT;\n`);

    // Write consolidated files
    const fullDumpPath = path.resolve(outputDir, "production_dump.json");
    fs.writeFileSync(fullDumpPath, JSON.stringify(fullDump, null, 2), "utf8");
    log(` Snapshot saved: ${fullDumpPath}`);

    const sqlFilePath = path.resolve(outputDir, "seed.sql");
    fs.writeFileSync(sqlFilePath, sqlStatements.join("\n"), "utf8");
    log(` SQL seed script generated: ${sqlFilePath}`);

    return {
      success: true,
      exportedAt: fullDump.exportedAt,
      tableCounts: fullDump.tableCounts,
      dumpPath: fullDumpPath,
      sqlPath: sqlFilePath
    };
  } finally {
    await pool.end().catch(() => {});
  }
}

// Direct CLI execution. A pathToFileURL comparison is required: this project's
// directory contains spaces, which arrive URL-encoded in import.meta.url, so a
// plain endsWith() never matched and the script exited silently without dumping.
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  dumpProductionData()
    .then((res) => {
      console.log("\n Export complete!", res.tableCounts);
      process.exit(0);
    })
    .catch((err) => {
      console.error("\n❌ Export failed:", err.message);
      process.exit(1);
    });
}


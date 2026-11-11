import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { getDb } from "@/lib/db";
import { requireAuth } from "@/lib/authGuard";
import { generateId } from "@/lib/id";
import { runStartupMigrations } from "@/lib/migrations";
import { seedAdminOnly, seedDatabase } from "@/lib/seed";

export const dynamic = "force-dynamic";

interface JobState {
  jobId: string;
  action: string;
  status: "in_progress" | "completed" | "failed";
  progress: number; // 0 - 100
  currentStep: string;
  logs: string[];
  startedAt: string;
  completedAt?: string;
  durationMs?: number;
  error?: string | null;
  result?: any;
}

// In-memory job registry for asynchronous operations
const activeJobs = new Map<string, JobState>();
const MAX_SAVED_JOBS = 20;

function cleanupOldJobs() {
  if (activeJobs.size > MAX_SAVED_JOBS) {
    const sortedKeys = Array.from(activeJobs.keys()).sort();
    while (activeJobs.size > MAX_SAVED_JOBS && sortedKeys.length > 0) {
      const oldest = sortedKeys.shift();
      if (oldest) activeJobs.delete(oldest);
    }
  }
}

/** Checks whether the request has an admin session or valid x-admin-key header */
async function authenticateAdmin(request: NextRequest): Promise<boolean> {
  const secretKey = (process.env.ADMIN_SECRET_KEY || process.env.CRON_SECRET || "").trim();
  const reqKey = (request.headers.get("x-admin-key") || "").trim();

  if (secretKey && reqKey && reqKey === secretKey) {
    return true;
  }

  // Fallback to session check
  const { auth, errorResponse } = await requireAuth(request, {
    allowedRoles: ["admin"],
    checkCsrf: false
  });

  return !errorResponse && !!auth?.user && auth.user.role === "admin";
}

/**
 * GET /api/update-db
 * - If ?jobId=<id>: Returns real-time status and logs of an asynchronous migration/seed job.
 * - Otherwise: Runs a quick diagnostics probe (database latency, table count, applied migrations).
 */
export async function GET(request: NextRequest) {
  const isAuthed = await authenticateAdmin(request);
  if (!isAuthed) {
    return NextResponse.json(
      { success: false, message: "Unauthorized. Admin privileges or valid x-admin-key required." },
      { status: 401 }
    );
  }

  const { searchParams } = new URL(request.url);
  const jobId = searchParams.get("jobId");

  if (jobId) {
    const job = activeJobs.get(jobId);
    if (!job) {
      return NextResponse.json(
        { success: false, message: `Job ${jobId} not found.` },
        { status: 404 }
      );
    }
    return NextResponse.json({ success: true, job });
  }

  // Database Health & Diagnostics Probe
  try {
    const startedAt = Date.now();
    const db = await getDb();
    await db.get("SELECT 1");
    const latencyMs = Date.now() - startedAt;

    const tableRows = await db.all(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'"
    ).catch(() => []);

    const applied = await db.all("SELECT name, applied_at FROM applied_migrations").catch(() => []);

    return NextResponse.json({
      success: true,
      status: "connected",
      latencyMs,
      tableCount: tableRows.length,
      tables: tableRows.map((r: any) => r.table_name),
      appliedMigrationsCount: applied.length,
      recentJobs: Array.from(activeJobs.values()).slice(-5),
      timestamp: new Date().toISOString()
    });
  } catch (err: any) {
    return NextResponse.json(
      {
        success: false,
        status: "connection_error",
        error: err?.message || String(err),
        timestamp: new Date().toISOString()
      },
      { status: 503 }
    );
  }
}

/**
 * POST /api/update-db
 * Dispatches an asynchronous schema update, migration, seed, or dump job.
 * Returns immediately with jobId to prevent serverless function timeouts.
 *
 * Body:
 * {
 *   "action": "schema" | "seed" | "dump" | "full_sync",
 *   "options": {
 *     "useSqlSeed": true,
 *     "useSnapshot": true
 *   }
 * }
 */
export async function POST(request: NextRequest) {
  const isAuthed = await authenticateAdmin(request);
  if (!isAuthed) {
    return NextResponse.json(
      { success: false, message: "Unauthorized. Admin privileges or valid x-admin-key required." },
      { status: 401 }
    );
  }

  let body: any = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const action = (body.action || "schema").toLowerCase();
  const options = body.options || {};

  const validActions = new Set(["schema", "seed", "dump", "full_sync"]);
  if (!validActions.has(action)) {
    return NextResponse.json(
      { success: false, message: `Invalid action "${action}". Allowed: ${Array.from(validActions).join(", ")}` },
      { status: 400 }
    );
  }

  const jobId = generateId("job_update_db");
  const job: JobState = {
    jobId,
    action,
    status: "in_progress",
    progress: 5,
    currentStep: "Job initialized",
    logs: [`[${new Date().toISOString()}] Job ${jobId} (${action}) started`],
    startedAt: new Date().toISOString()
  };

  activeJobs.set(jobId, job);
  cleanupOldJobs();

  // Execute in background without blocking response
  (async () => {
    const jobStartTime = Date.now();
    const addLog = (msg: string) => {
      job.logs.push(`[${new Date().toISOString()}] ${msg}`);
      job.currentStep = msg;
    };

    try {
      const db = await getDb();

      // ACTION 1: SCHEMA (apply postgres_schema.sql + runStartupMigrations)
      if (action === "schema" || action === "full_sync") {
        addLog("Applying postgres_schema.sql DDL statements...");
        job.progress = 20;

        const schemaFile = path.resolve(process.cwd(), "postgres_schema.sql");
        if (fs.existsSync(schemaFile)) {
          const sql = fs.readFileSync(schemaFile, "utf8");
          await db.exec(sql);
          addLog("postgres_schema.sql successfully applied.");
        } else {
          addLog("Warning: postgres_schema.sql not found on disk.");
        }

        job.progress = 45;
        addLog("Running startup runtime migrations...");
        await runStartupMigrations();
        addLog("Runtime migrations verified and applied.");

        addLog("Ensuring root administrator account exists...");
        const adminRes = await seedAdminOnly(db, options.admin);
        addLog(`Admin account verified: ${adminRes.email} (Role: admin)`);
        job.result = { ...job.result, admin: adminRes };
      }

      // ACTION 2: DUMP (download production data to data/seeds)
      if (action === "dump") {
        addLog("Starting database snapshot export...");
        job.progress = 30;

        const { dumpProductionData } = await import("../../../../scripts/dump_prod_data.mjs");
        const dumpResult = await dumpProductionData({
          logger: (msg: string) => addLog(msg)
        });

        job.progress = 90;
        job.result = dumpResult;
        addLog("Database snapshot export completed successfully.");
      }

      // ACTION 3: SEED (Default: ONLY Admin user. Mock data is skipped unless seedAllData === true)
      if (action === "seed" || action === "full_sync") {
        job.progress = action === "full_sync" ? 75 : 30;

        if (options.seedAllData) {
          addLog("Full dataset seeding requested via seedAllData flag...");
          const sqlSeedPath = path.resolve(process.cwd(), "data", "seeds", "seed.sql");
          const snapshotPath = path.resolve(process.cwd(), "data", "seeds", "production_dump.json");

          const { runSqlSeed, runSnapshotSeed } = await import("../../../../scripts/seed_db.mjs");
          if (options.useSqlSeed && fs.existsSync(sqlSeedPath)) {
            addLog("Executing SQL seed script (seed.sql)...");
            await runSqlSeed({ logger: (msg: string) => addLog(msg) });
            addLog("SQL seed applied successfully.");
          } else if (options.useSnapshot && fs.existsSync(snapshotPath)) {
            addLog("Executing snapshot seed from production_dump.json...");
            const res = await runSnapshotSeed({ logger: (msg: string) => addLog(msg) });
            addLog("Snapshot seed applied successfully.");
            job.result = { ...job.result, snapshotSeed: res };
          } else {
            addLog("Running standard seedDatabase bootstrap...");
            await seedDatabase();
            addLog("Foundation data seeding completed.");
          }
        } else {
          addLog("Seeding ONLY administrator account (mock/dummy data skipped)...");
          const adminRes = await seedAdminOnly(db, options.admin);
          addLog(`Admin account successfully seeded: ${adminRes.email}`);
          job.result = { ...job.result, admin: adminRes };
        }
      }

      job.status = "completed";
      job.progress = 100;
      job.completedAt = new Date().toISOString();
      job.durationMs = Date.now() - jobStartTime;
      addLog(`Job completed successfully in ${job.durationMs}ms.`);
    } catch (err: any) {
      job.status = "failed";
      job.error = err?.message || String(err);
      job.completedAt = new Date().toISOString();
      job.durationMs = Date.now() - jobStartTime;
      addLog(`Job failed: ${job.error}`);
    }
  })().catch(() => {});

  // Return immediate response with jobId
  return NextResponse.json(
    {
      success: true,
      jobId,
      action,
      status: "in_progress",
      message: `Database operation "${action}" started in background. Monitor progress via GET /api/update-db?jobId=${jobId}`,
      startedAt: job.startedAt
    },
    { status: 202 }
  );
}


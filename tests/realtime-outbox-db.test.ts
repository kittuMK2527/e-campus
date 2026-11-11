import fs from "node:fs";
import path from "node:path";
import { describe, it, expect, beforeAll } from "vitest";

let getDb: any;

beforeAll(async () => {
  try {
    const envPath = path.resolve(process.cwd(), ".env.local");
    if (fs.existsSync(envPath)) {
      const lines = fs.readFileSync(envPath, "utf-8").split("\n");
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const idx = trimmed.indexOf("=");
        if (idx !== -1) {
          const key = trimmed.slice(0, idx).trim();
          let val = trimmed.slice(idx + 1).trim();
          if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
            val = val.slice(1, -1);
          }
          if (!process.env[key]) {
            process.env[key] = val;
          }
        }
      }
    }
  } catch (_) {}

  const dbModule = await import("@/lib/db");
  getDb = dbModule.getDb;
});

describe("Realtime Event Outbox & DB Concurrency Schema", () => {
  it("verifies event_outbox table exists with required columns", async () => {
    const db = await getDb();
    const cols = await db.all(
      "SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'event_outbox'"
    );
    const colNames = cols.map((c: any) => c.column_name);
    expect(colNames).toContain("id");
    expect(colNames).toContain("xid");
    expect(colNames).toContain("event_id");
    expect(colNames).toContain("domain");
    expect(colNames).toContain("action");
    expect(colNames).toContain("college_id");
    expect(colNames).toContain("target_user_ids");
    expect(colNames).toContain("target_roles");
    expect(colNames).toContain("origin_tab_id");
    expect(colNames).toContain("payload");
    expect(colNames).toContain("created_at");
  });

  it("verifies announcement_reads and idempotency_records tables exist", async () => {
    const db = await getDb();
    const tables = await db.all(
      "SELECT table_name FROM information_schema.tables WHERE table_name IN ('announcement_reads', 'idempotency_records')"
    );
    const tableNames = tables.map((t: any) => t.table_name);
    expect(tableNames).toContain("announcement_reads");
    expect(tableNames).toContain("idempotency_records");
  });

  it("verifies optimistic version column exists on daily_configs and slots", async () => {
    const db = await getDb();
    const dcCols = await db.all(
      "SELECT column_name FROM information_schema.columns WHERE table_name IN ('campus_daily_configs', 'daily_configs') AND column_name = 'version'"
    );
    expect(dcCols.length).toBeGreaterThanOrEqual(1);

    const slotCols = await db.all(
      "SELECT column_name FROM information_schema.columns WHERE table_name = 'slots' AND column_name = 'version'"
    );
    expect(slotCols.length).toBe(1);
  });

  it("verifies unique partial index exists on student_interview_slots", async () => {
    const db = await getDb();
    const indexes = await db.all(
      "SELECT indexname FROM pg_indexes WHERE tablename = 'student_interview_slots'"
    );
    const indexNames = indexes.map((i: any) => i.indexname);
    expect(indexNames).toContain("idx_uniq_mentor_interview_slot");
    expect(indexNames).toContain("idx_uniq_active_student_interview");
  });
});


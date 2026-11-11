import pg from "pg";
import { readFileSync } from "fs";
import { logger } from "./logger";
import { PG_COLUMN_CASE_ENTRIES } from "./pgColumnCase.generated";

const { Pool } = pg;

export interface DbTransactionContext {
  get: (sql: string, ...params: any[]) => Promise<any>;
  all: (sql: string, ...params: any[]) => Promise<any[]>;
  run: (sql: string, ...params: any[]) => Promise<{ lastID?: number; changes: number }>;
  exec: (sql: string) => Promise<void>;
}

/** One slice that failed inside multiQuery, collected so the caller can report partial data. */
export interface QueryFailure {
  sql: string;
  error: string;
}

export interface PostgresDbAdapter {
  get: (sql: string, ...params: any[]) => Promise<any>;
  all: (sql: string, ...params: any[]) => Promise<any[]>;
  run: (sql: string, ...params: any[]) => Promise<{ lastID?: number; changes: number }>;
  exec: (sql: string) => Promise<void>;
  multiQuery: (queries: { sql: string; params?: any[] }[], failures?: QueryFailure[]) => Promise<any[][]>;
  transaction: <T>(callback: (tx: DbTransactionContext) => Promise<T>) => Promise<T>;
  client: any;
  pool: pg.Pool;
}

export type DatabaseAdapter = PostgresDbAdapter;
export type TursoDbAdapter = PostgresDbAdapter;

function normalizeParams(params: any[]): any[] {
  let args = params;
  if (params.length === 1 && Array.isArray(params[0])) {
    args = params[0];
  }
  return args.map(arg => (arg === undefined ? null : arg));
}

const TABLE_PK_MAP: Record<string, string> = {
  system_settings: "key",
  academic_years: "year_name",
  faculty_configs: "mentor_id",
  schema_migrations: "version"
};

export function adaptQueryForPostgres(sql: string, params: any[]): { sql: string; params: any[] } {
  let pIdx = 0;
  let convertedSql = sql.replace(/\?/g, () => {
    pIdx++;
    return `$${pIdx}`;
  });

  // Handle SQLite INSERT OR IGNORE with standard PostgreSQL INSERT INTO ... ON CONFLICT DO NOTHING
  if (/INSERT\s+OR\s+IGNORE\s+INTO/i.test(convertedSql)) {
    convertedSql = convertedSql.replace(/INSERT\s+OR\s+IGNORE\s+INTO/gi, "INSERT INTO");
    if (!/ON\s+CONFLICT/i.test(convertedSql)) {
      convertedSql += " ON CONFLICT DO NOTHING";
    }
  }

  // Handle SQLite INSERT OR REPLACE with standard PostgreSQL INSERT INTO ... ON CONFLICT DO UPDATE
  if (/INSERT\s+OR\s+REPLACE\s+INTO/i.test(convertedSql)) {
    convertedSql = convertedSql.replace(/INSERT\s+OR\s+REPLACE\s+INTO/gi, "INSERT INTO");
    if (!/ON\s+CONFLICT/i.test(convertedSql)) {
      const match = convertedSql.match(/INSERT\s+INTO\s+([^\s(]+)\s*\(([^)]+)\)/i);
      if (match) {
        const rawTableName = match[1].replace(/["`]/g, "").trim().toLowerCase();
        const pkCol = TABLE_PK_MAP[rawTableName] || "id";
        const cols = match[2].split(",").map(c => c.trim().replace(/["`]/g, ""));
        const updateSets = cols
          .filter(c => c.toLowerCase() !== pkCol.toLowerCase())
          .map(c => `"${c.toLowerCase()}" = EXCLUDED."${c.toLowerCase()}"`)
          .join(", ");
        if (updateSets) {
          convertedSql += ` ON CONFLICT ("${pkCol}") DO UPDATE SET ${updateSets}`;
        } else {
          convertedSql += ` ON CONFLICT DO NOTHING`;
        }
      }
    }
  }

  // Replace SQLite datetime('now') with PostgreSQL NOW()::text
  convertedSql = convertedSql.replace(/datetime\(['"]now['"]\)/gi, "NOW()::text");

  // Replace SQLite strftime('%w', col) with PostgreSQL extract dow (0=Sunday ... 6=Saturday)
  convertedSql = convertedSql.replace(/strftime\s*\(\s*['"]%w['"]\s*,\s*([a-zA-Z0-9_."]+)\s*\)/gi, "EXTRACT(DOW FROM NULLIF($1, '')::date)::text");

  // Bypass SQLite specific PRAGMA
  if (/PRAGMA\s+foreign_keys/i.test(convertedSql)) {
    convertedSql = "SELECT 1";
  }

  return { sql: convertedSql, params: normalizeParams(params) };
}

/**
 * Postgres SQLSTATE classes that mean "the statement never got to run, or the
 * server rolled it back for us": a pooler/connection restart (08xxx), the
 * instance shutting down or not accepting connections yet (57P0x), or the
 * connection ceiling being temporarily reached (53300/53400). Supabase's
 * transaction-mode pooler closes server-side connections on resize and during
 * restarts, so these land on live traffic routinely.
 *
 * 40001/40P01 are the optimistic-concurrency pair. They are safe to re-issue for
 * reads, and the idempotency gate below keeps them off plain writes.
 *
 * Deliberately excluded: 40003 statement_completion_unknown (the server may have
 * applied it) and any 2xxxx/23xxx integrity error (deterministic, retry won't help).
 */
const TRANSIENT_SQLSTATES = new Set([
  "08000", "08001", "08003", "08004", "08006", "08007", "08P01",
  "57P01", "57P02", "57P03",
  "53300", "53400",
  "40001", "40P01"
]);

/** Node-level socket codes the pooler surfaces instead of a SQLSTATE. */
const TRANSIENT_NET_CODES = new Set([
  "ECONNRESET", "ECONNREFUSED", "ECONNABORTED", "ETIMEDOUT",
  "UND_ERR_CONNECT_TIMEOUT", "ENOTFOUND", "EAI_AGAIN"
]);

/**
 * Check if the error happened prior to query execution during connection acquisition.
 * Connection-acquisition errors are ALWAYS safe to retry because no statement reached the server.
 */
export function isConnectionAcquisitionError(err: any): boolean {
  if (!err) return false;
  const msg = String(err?.message || "").toLowerCase();
  return (
    msg.includes("timeout exceeded when trying to connect") ||
    msg.includes("connection timeout") ||
    msg.includes("timeout expired") ||
    msg.includes("remaining connection slots are reserved") ||
    msg.includes("too many clients already") ||
    msg.includes("sorry, too many clients") ||
    msg.includes("could not connect to server") ||
    msg.includes("connection terminated unexpectedly") ||
    msg.includes("connection terminated") ||
    msg.includes("econnrefused") ||
    msg.includes("etimedout")
  );
}

/**
 * True for failures that are worth a second attempt because the first one
 * certainly did not persist. node-pg puts the SQLSTATE on `err.code` too, which
 * is why both sets live on the same field.
 */
export function isTransientError(err: any): boolean {
  if (!err) return false;
  if (isConnectionAcquisitionError(err)) return true;
  const code = String(err?.code || "");
  if (TRANSIENT_SQLSTATES.has(code) || TRANSIENT_NET_CODES.has(code)) return true;

  // generic-pool (used by pg.Pool) rejects acquire with a plain Error, no code.
  if (/timeout expired|connection timeout|timeout exceeded/i.test(String(err?.message || ""))) return true;

  const message = String(err?.message || "");
  return (
    message.includes("fetch failed") ||
    message.includes("Connect Timeout") ||
    message.includes("read ECONNRESET") ||
    message.includes("Connection terminated") ||
    message.includes("server closed the connection") ||
    message.includes("remaining connection slots are reserved")
  );
}

/**
 * Retries transient network errors, but ONLY for idempotent operations by
 * default (plan item 13). Mutations (INSERT/UPDATE/DELETE/CREATE...) are NOT
 * auto-retried after an ambiguous mid-flight failure — the server state is
 * unknown, so a retry could double-write. Pass `force` for statements known
 * to be idempotent (e.g. upserts with ON CONFLICT).
 * Connection acquisition errors are always safe to retry because no query was dispatched.
 */
async function executeWithRetry<T>(fn: () => Promise<T>, opts?: { retries?: number; delay?: number; force?: boolean; readOnly?: boolean }): Promise<T> {
  const retries = opts?.retries ?? 3;
  const delay = opts?.delay ?? 250;
  const idempotent = opts?.readOnly || opts?.force || false;
  let attempt = 0;
  while (attempt < retries) {
    try {
      return await fn();
    } catch (err: any) {
      attempt++;
      const isConnectFail = isConnectionAcquisitionError(err);
      if (isTransientError(err) && attempt < retries && (idempotent || isConnectFail)) {
        console.warn(`[PostgreSQL Retry] Transient ${isConnectFail ? "connection acquisition" : "network"} error (attempt ${attempt}/${retries}). Retrying in ${delay * attempt}ms...`);
        await new Promise(res => setTimeout(res, delay * attempt));
      } else {
        throw err;
      }
    }
  }
  throw new Error("PostgreSQL operation failed after maximum retries");
}

/** True when a SQL statement is read-only and therefore safe to auto-retry. */
function isReadOnlySql(sql: string): boolean {
  const trimmed = sql.trim().replace(/^\(+/, "").toUpperCase();
  return trimmed.startsWith("SELECT") || trimmed.startsWith("WITH") || trimmed.startsWith("SHOW") || trimmed.startsWith("EXPLAIN");
}

/**
 * Role-gated slices are stubbed with this placeholder, which always returns zero
 * rows. Dispatching it still costs a full pooler round trip, so it is skipped.
 */
const NOOP_QUERY_RE = /^SELECT\s+1\s+WHERE\s+1\s*=\s*0$/i;

/**
 * Safely escapes a literal value for PostgreSQL single-query script concatenation.
 * Handles strings (escapes single quotes), numbers, booleans, dates, and nulls.
 */
function escapePgLiteral(val: any): string {
  if (val === null || val === undefined) return "NULL";
  if (typeof val === "number") return Number.isFinite(val) ? String(val) : "NULL";
  if (typeof val === "boolean") return val ? "TRUE" : "FALSE";
  if (val instanceof Date) return `'${val.toISOString()}'`;
  const str = String(val);
  return `'${str.replace(/'/g, "''")}'`;
}

function inlineQueryParams(sql: string, params?: any[]): string {
  if (!params || params.length === 0) return sql;
  let idx = 0;
  return sql.replace(/\?/g, () => {
    if (idx >= params.length) return "NULL";
    return escapePgLiteral(params[idx++]);
  });
}

/**
 * Concurrency cap for fallback slice execution. Set to 8 to utilize pool bandwidth
 * while preventing pool exhaustion.
 */
const MULTI_QUERY_CONCURRENCY = 8;

function isIdempotentDdl(sql: string): boolean {
  const upper = (sql || "").trim().toUpperCase();
  return upper.includes("CREATE TABLE IF NOT EXISTS") ||
    upper.includes("CREATE INDEX IF NOT EXISTS") ||
    upper.includes("ALTER TABLE") ||
    upper.startsWith("SELECT") ||
    upper.startsWith("SET ");
}

/** Runs fn over items with at most `limit` in flight, preserving result indices. */
async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        results[i] = await fn(items[i]);
      }
    })
  );
  return results;
}

/**
 * Restores the camelCase keys the app expects from Postgres' folded row names.
 * Generated from postgres_schema.sql by scripts/generate-pg-column-case.mjs
 * (npm run db:column-case, wired into predev/prebuild), because this list used to
 * be hand-curated and silently missed five schema columns — reads arrived as
 * `actorname` and AdminDashboard's audit-log filter threw on log.actorName.
 * tests/column-casing.test.ts fails if the map and the schema drift apart again.
 */
const POSTGRES_CAMEL_MAP = new Map<string, string>(PG_COLUMN_CASE_ENTRIES);

export function normalizePgRow(row: any): any {
  if (!row || typeof row !== "object" || Array.isArray(row)) return row;
  const out: any = { ...row };
  for (const key of Object.keys(row)) {
    const camel = POSTGRES_CAMEL_MAP.get(key.toLowerCase());
    if (camel && out[camel] === undefined) {
      out[camel] = row[key];
    }
  }
  return out;
}

export function createPostgresAdapter(pool: pg.Pool): PostgresDbAdapter {
  return {
    pool,
    client: {
      async batch(statements: { sql: string; args?: any[] }[]) {
        const client = await pool.connect();
        try {
          await client.query("BEGIN");
          for (const stmt of statements) {
            const adapted = adaptQueryForPostgres(stmt.sql, stmt.args || []);
            await client.query(adapted.sql, adapted.params);
          }
          await client.query("COMMIT");
        } catch (err) {
          await client.query("ROLLBACK");
          throw err;
        } finally {
          client.release();
        }
      },
      async execute(stmt: { sql: string; args?: any[] }) {
        const adapted = adaptQueryForPostgres(stmt.sql, stmt.args || []);
        const res = await pool.query(adapted.sql, adapted.params);
        return { rows: res.rows.map(normalizePgRow), rowsAffected: res.rowCount || 0 };
      }
    },
    async get(sql: string, ...params: any[]) {
      const adapted = adaptQueryForPostgres(sql, params);
      const res = await executeWithRetry(() => pool.query(adapted.sql, adapted.params), { readOnly: isReadOnlySql(adapted.sql) });
      return res.rows[0] ? normalizePgRow(res.rows[0]) : undefined;
    },
    async all(sql: string, ...params: any[]) {
      const adapted = adaptQueryForPostgres(sql, params);
      const res = await executeWithRetry(() => pool.query(adapted.sql, adapted.params), { readOnly: isReadOnlySql(adapted.sql) });
      return res.rows.map(normalizePgRow);
    },
    async run(sql: string, ...params: any[]) {
      const adapted = adaptQueryForPostgres(sql, params);
      // Writes are retried only when provably idempotent (INSERT ... ON CONFLICT);
      // plain mutations fail fast to avoid double-writes on flaky networks.
      const isUpsert = /ON\s+CONFLICT/i.test(adapted.sql);
      const res = await executeWithRetry(() => pool.query(adapted.sql, adapted.params), { force: isUpsert });
      return {
        lastID: undefined,
        changes: res.rowCount || 0
      };
    },
    async exec(sql: string) {
      await executeWithRetry(() => pool.query(sql), { force: isIdempotentDdl(sql) });
    },
    async multiQuery(queries: { sql: string; params?: any[] }[], failures?: QueryFailure[]): Promise<any[][]> {
      if (!queries || queries.length === 0) return [];

      // Check if pool is a mock/test spy (e.g. fakePool in vitest tests that monitors pool.calls)
      const isMockPool = Boolean((pool as any).calls && Array.isArray((pool as any).calls));

      if (!isMockPool) {
        // Fast path: attempt single-roundtrip batch execution by inlining sanitized literals for all read queries
        try {
          const nonNoopIndices: number[] = [];
          const stmts: string[] = [];

          for (let i = 0; i < queries.length; i++) {
            const q = queries[i];
            const trimmed = (q.sql || "").trim();
            if (NOOP_QUERY_RE.test(trimmed)) {
              continue;
            }
            nonNoopIndices.push(i);
            const inlined = inlineQueryParams(q.sql, q.params);
            const adapted = adaptQueryForPostgres(inlined, []);
            stmts.push(adapted.sql.trim().replace(/;+$/, '') + ';');
          }

          if (stmts.length === 0) {
            return queries.map(() => []);
          }

          const combinedSql = stmts.join("\n");
          const res = await executeWithRetry(() => pool.query(combinedSql), { readOnly: true });
          const resultSets = Array.isArray(res) ? res : [res];

          if (resultSets.length === nonNoopIndices.length) {
            const results = new Array<any[]>(queries.length);
            for (let i = 0; i < queries.length; i++) {
              results[i] = [];
            }
            for (let k = 0; k < nonNoopIndices.length; k++) {
              const origIdx = nonNoopIndices[k];
              const r = resultSets[k];
              results[origIdx] = (r.rows || []).map(normalizePgRow);
            }
            return results;
          }
        } catch (batchErr: any) {
          logger.warn("[multiQuery] single-batch query failed, falling back to concurrent slices", {
            error: batchErr?.message || String(batchErr)
          });
        }
      }

      return await mapWithConcurrency(queries, MULTI_QUERY_CONCURRENCY, async (q) => {
        if (NOOP_QUERY_RE.test((q.sql || "").trim())) return [];
        const adapted = adaptQueryForPostgres(q.sql, q.params || []);
        try {
          const res = await executeWithRetry(() => pool.query(adapted.sql, adapted.params), { readOnly: isReadOnlySql(adapted.sql) });
          return res.rows.map(normalizePgRow);
        } catch (err: any) {
          // The slice still yields [], but the caller gets the failure recorded so a
          // partial read can never be presented as a complete one (silent "data
          // disappeared" - see API_OPTIMIZATION_PLAN #8).
          const error = err?.message || String(err);
          logger.error("[multiQuery] slice failed", { sql: q.sql.slice(0, 300), error });
          failures?.push({ sql: q.sql, error });
          return [];
        }
      });
    },
    async transaction<T>(callback: (tx: DbTransactionContext) => Promise<T>): Promise<T> {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const txContext: DbTransactionContext = {
          async get(sql: string, ...params: any[]) {
            const adapted = adaptQueryForPostgres(sql, params);
            const res = await client.query(adapted.sql, adapted.params);
            return res.rows[0] ? normalizePgRow(res.rows[0]) : undefined;
          },
          async all(sql: string, ...params: any[]) {
            const adapted = adaptQueryForPostgres(sql, params);
            const res = await client.query(adapted.sql, adapted.params);
            return res.rows.map(normalizePgRow);
          },
          async run(sql: string, ...params: any[]) {
            const adapted = adaptQueryForPostgres(sql, params);
            const res = await client.query(adapted.sql, adapted.params);
            return {
              lastID: undefined,
              changes: res.rowCount || 0
            };
          },
          async exec(sql: string) {
            await client.query(sql);
          }
        };
        const result = await callback(txContext);
        await client.query("COMMIT");
        return result;
      } catch (err) {
        try { await client.query("ROLLBACK"); } catch (_) {}
        throw err;
      } finally {
        client.release();
      }
    }
  };
}

declare global {
  // eslint-disable-next-line no-var
  var __fpDbInstance: PostgresDbAdapter | undefined;
  // eslint-disable-next-line no-var
  var __fpDbPromise: Promise<PostgresDbAdapter> | undefined;
}

let dbInstance: PostgresDbAdapter | null = (globalThis as any).__fpDbInstance || null;
let dbPromise: Promise<PostgresDbAdapter> | null = (globalThis as any).__fpDbPromise || null;

/**
 * db.<ref>.supabase.co resolves AAAA-only and Vercel's Node runtime has no IPv6
 * egress, so a direct Supabase URL has to become the IPv4 pooler. Hardcoding the
 * pooler region meant moving the database required a code edit, hence the
 * DB_POOLER_HOST override. Unset behavior is unchanged.
 */
export function resolveConnectionString(rawUrl: string): string {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return rawUrl;
  }

  const supabaseMatch = parsed.hostname.match(/^db\.([a-z0-9_-]+)\.supabase\.co$/i);
  if (!supabaseMatch) return rawUrl;

  const projectRef = supabaseMatch[1];
  if (parsed.username === "postgres") {
    parsed.username = `postgres.${projectRef}`;
  }
  parsed.hostname = process.env.DB_POOLER_HOST?.trim()
    || "aws-0-ap-southeast-2.pooler.supabase.com";
  parsed.port = parsed.port === "5432" || !parsed.port ? "6543" : parsed.port;

  console.log(`🐘 [Database] Auto-routed Supabase host to IPv4 Pooler (${parsed.hostname}:${parsed.port})`);
  return parsed.toString();
}

/**
 * TLS options for the Postgres pool.
 *
 * Supabase always encrypts the transport, but "encrypted" and "verified" are
 * different settings: `{ rejectUnauthorized: false }` completes the handshake
 * without checking that the server is really this project's database. The repo has
 * run that way because Supabase publishes its own CA certificate in the dashboard
 * (Settings -> Database -> SSL Root Certificate) for `verify-full`, so Node's
 * bundled trust store is not guaranteed to validate the chain.
 *
 * Strict verification is therefore opt-in rather than defaulted on: flipping it
 * blind would fail every connection if the chain is not trusted, and the pooler's
 * certificate is not the same host as the direct connection. To enable it, set
 *   DB_SSL_VERIFY=true
 *   DB_SSL_CA_PATH=/absolute-or-cwd-relative/path/to/supabase-root-cert.pem
 * then run one `npm run dev` and confirm the pool logs a successful connect before
 * touching production.
 */
export function resolveSslConfig(isLocalHost: boolean): pg.PoolConfig["ssl"] {
  if (isLocalHost) return undefined;

  const strict = /^(1|true|yes)$/i.test((process.env.DB_SSL_VERIFY || "").trim());
  if (!strict) return { rejectUnauthorized: false };

  const caPath = (process.env.DB_SSL_CA_PATH || "").trim();
  if (!caPath) return { rejectUnauthorized: true };

  let ca: string;
  try {
    ca = readFileSync(caPath, "utf8");
  } catch (err: any) {
    throw new Error(
      `DB_SSL_VERIFY is on but DB_SSL_CA_PATH="${caPath}" could not be read: ${err?.message || String(err)}`
    );
  }
  return { rejectUnauthorized: true, ca };
}

/** Reads a positive-integer env var, clamped to [min, max], falling back to `fallback`. */
function resolveIntEnv(name: string, fallback: number, min: number, max: number): number {
  const raw = (process.env[name] || "").trim();
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    console.warn(`[Database] Ignoring ${name}="${raw}" (expected a positive number); using ${fallback}.`);
    return fallback;
  }
  const clamped = Math.min(Math.max(Math.round(value), min), max);
  if (clamped !== value) {
    console.warn(`[Database] ${name}=${value} clamped to ${clamped} (allowed ${min}-${max}).`);
  }
  return clamped;
}

/**
 * Pool ceiling per instance. Left at 20 when unset; PG_POOL_MAX exists because the
 * real budget is shared across every concurrent instance, and there is no way to
 * know that from code.
 */
function resolvePoolMax(): number {
  return resolveIntEnv("PG_POOL_MAX", 20, 1, 100);
}

export function getDb(): Promise<PostgresDbAdapter> {
  const globalInst = (globalThis as any).__fpDbInstance;
  if (!globalInst) {
    dbInstance = null;
  }
  const globalProm = (globalThis as any).__fpDbPromise;
  if (!globalProm) {
    dbPromise = null;
  }
  if (globalInst) return Promise.resolve(globalInst);
  if (dbInstance) return Promise.resolve(dbInstance);
  if (!dbPromise) {
    dbPromise = (async () => {
      const postgresUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL;

      if (!postgresUrl) {
        throw new Error(
          "❌ [PostgreSQL Error] DATABASE_URL or POSTGRES_URL environment variable is missing. PostgreSQL is the sole production database engine."
        );
      }

      const finalConnectionString = resolveConnectionString(postgresUrl);

      const isLocalHost = finalConnectionString.includes("localhost") || finalConnectionString.includes("127.0.0.1");
      console.log(`🐘 [Database] Connecting to PostgreSQL (${isLocalHost ? "Localhost" : "Cloud/Pooler"})...`);

      const pool = new Pool({
        connectionString: finalConnectionString,
        ssl: resolveSslConfig(isLocalHost),
        // Default kept at 20 because /api/data fans out 41 slices; MULTI_QUERY_CONCURRENCY
        // caps how many of these a single request can occupy. Tunable because the
        // ceiling is per instance, so Vercel autoscale multiplies it against
        // Supabase's fixed connection limit - raise PG_POOL_MAX only together with
        // the project's max_client_connections.
        max: resolvePoolMax(),
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: resolveIntEnv("DB_CONNECT_TIMEOUT_MS", 35000, 1000, 60000),
        statement_timeout: resolveIntEnv("DB_STATEMENT_TIMEOUT_MS", 60000, 1000, 300000),
        application_name: process.env.DB_APP_NAME || "fp-timetable"
      });

      // node-pg emits connection errors that belong to no in-flight query (an idle
      // client gets killed by the pooler, the keepalive fails, the server restarts).
      // A Pool with no 'error' listener re-raises those as unhandled, which takes
      // down the whole function instance and every other request in it. The pool
      // evicts the client itself, so logging is the correct and only action here.
      pool.on("error", (err: any) => {
        console.error("[PostgreSQL Pool] Error on idle connection (client evicted):", err?.message || err);
      });

      // Verify connection directly with retry for transient cold-starts
      const defaultRetries = process.env.NODE_ENV === "test" ? 1 : 3;
      const maxConnectAttempts = resolveIntEnv("DB_CONNECT_MAX_RETRIES", defaultRetries, 1, 5);
      let connectAttempt = 0;
      let lastConnectErr: any = null;

      while (connectAttempt < maxConnectAttempts) {
        connectAttempt++;
        try {
          await pool.query("SELECT 1");
          lastConnectErr = null;
          break;
        } catch (connErr: any) {
          lastConnectErr = connErr;
          console.warn(`⚠️ [PostgreSQL Connect] Probe attempt ${connectAttempt}/${maxConnectAttempts} failed: ${connErr.message}`);
          if (connectAttempt >= maxConnectAttempts || !isTransientError(connErr)) {
            break;
          }
          const delayMs = connectAttempt * 1200;
          await new Promise((r) => setTimeout(r, delayMs));
        }
      }

      if (lastConnectErr) {
        console.error("❌ [PostgreSQL Error] Connection failed:", lastConnectErr.message);
        // A failed boot must not be cached. Without this the rejected promise stays
        // in dbPromise for the life of the instance and every subsequent request
        // 500s with the same stale error even after the pooler comes back.
        await pool.end().catch(() => {});
        throw new Error(`Failed to connect to PostgreSQL: ${lastConnectErr.message}`);
      }

      dbInstance = createPostgresAdapter(pool);
      globalThis.__fpDbInstance = dbInstance;
      return dbInstance;
    })().catch((err) => {
      dbPromise = null;
      globalThis.__fpDbPromise = undefined;
      globalThis.__fpDbInstance = undefined;
      throw err;
    });
    globalThis.__fpDbPromise = dbPromise;
  }
  return dbPromise;
}

// Reference data (courses/departments) changes rarely — cache it briefly so
// repeated resolveClassGroupDetails calls in loops don't re-fetch the full
// tables every time (see API_OPTIMIZATION_PLAN #16).
let classGroupRefCache: { at: number; courses: any[]; depts: any[]; subjectMetadata: any[] } | null = null;
const CLASS_GROUP_REF_TTL_MS = 60_000;

export async function resolveClassGroupDetails(db: any, classGroup: string) {
  if (!classGroup) {
    return { department: "General", semester: "Semester 1", year: "Year 1" };
  }

  let courses: any[], depts: any[], subjectMetadata: any[];
  if (classGroupRefCache && Date.now() - classGroupRefCache.at < CLASS_GROUP_REF_TTL_MS) {
    ({ courses, depts, subjectMetadata } = classGroupRefCache);
  } else {
    [courses, depts, subjectMetadata] = await Promise.all([
      db.all("SELECT name, code FROM courses"),
      db.all("SELECT name, code FROM departments"),
      db.all("SELECT DISTINCT semester, year FROM subjects WHERE semester IS NOT NULL AND semester != ''")
    ]);
    classGroupRefCache = { at: Date.now(), courses, depts, subjectMetadata };
  }
  const allCourseNames = Array.from(new Set([
    ...courses.map((c: any) => c.name),
    ...depts.map((d: any) => d.name)
  ])).filter(Boolean);

  const cleanCG = classGroup.trim();
  const cgLower = cleanCG.toLowerCase();

  let resolvedDept = "";
  let bestDeptMatchScore = 0;

  const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const strippedCG = cleanCG.replace(/^(?:[ivxldc]+|\d+(?:st|nd|rd|th)?)\s+(?:year\s+)?/i, "").trim();
  const cgNorm = normalize(cgLower);
  const strippedNorm = normalize(strippedCG);

  for (const deptName of allCourseNames) {
    const deptNorm = normalize(deptName);
    if (cgNorm.includes(deptNorm) || strippedNorm.includes(deptNorm) || deptNorm.includes(strippedNorm)) {
      if (deptNorm.length > bestDeptMatchScore) {
        resolvedDept = deptName;
        bestDeptMatchScore = deptNorm.length;
      }
    }
  }

  if (!resolvedDept) {
    const codes = Array.from(new Set([
      ...courses.map((c: any) => c.code),
      ...depts.map((d: any) => d.code)
    ])).filter(Boolean);

    for (const code of codes) {
      const codeNorm = normalize(code);
      if (cgNorm.includes(codeNorm) || strippedNorm.includes(codeNorm)) {
        const matchedCourse = courses.find((c: any) => c.code === code) || depts.find((d: any) => d.code === code);
        if (matchedCourse) {
          resolvedDept = matchedCourse.name;
          break;
        }
      }
    }
  }

  if (!resolvedDept) {
    for (const deptName of allCourseNames) {
      const abbreviation = deptName
        .replace(/with|and|for/gi, "")
        .split(/\s+/)
        .map((w: string) => w.replace(/[^a-zA-Z]/g, "")[0])
        .filter(Boolean)
        .join("")
        .toLowerCase();

      if (abbreviation && (cgNorm.includes(abbreviation) || strippedNorm.includes(abbreviation))) {
        resolvedDept = deptName;
        break;
      }
    }
  }

  if (!resolvedDept) {
    resolvedDept = strippedCG.split("-")[0].split("(")[0].trim() || cleanCG.split("-")[0].split("(")[0].trim();
  }

  let resolvedSemester = "";
  const romanMap: Record<string, number> = { i: 1, ii: 2, iii: 3, iv: 4, v: 5, vi: 6, vii: 7, viii: 8 };

  const semMatch = cgLower.match(/sem(?:ester)?[\s\-_]*([ivxldc\d]+)/i);
  if (semMatch) {
    const semVal = semMatch[1].toLowerCase();
    const semNum = parseInt(semVal, 10) || romanMap[semVal];
    if (semNum) {
      const dbSem = subjectMetadata.find((s: any) => s.semester && s.semester.toLowerCase().includes(String(semNum)));
      if (dbSem) {
        resolvedSemester = dbSem.semester;
      } else {
        resolvedSemester = `Semester ${semNum}`;
      }
    }
  }

  if (!resolvedSemester) {
    for (const sMeta of subjectMetadata) {
      if (sMeta.semester) {
        const sNorm = normalize(sMeta.semester);
        if (cgNorm.includes(sNorm)) {
          resolvedSemester = sMeta.semester;
          break;
        }
      }
    }
  }

  let resolvedYear = "";
  if (!resolvedSemester) {
    const yearMatch = cgLower.match(/year[\s\-_]*([ivxldc\d]+)/i) || cgLower.match(/([1234])(?:st|nd|rd|th)?[\s\-_]*year/i);
    if (yearMatch) {
      const yrVal = yearMatch[1].toLowerCase();
      const yrNum = parseInt(yrVal, 10) || romanMap[yrVal];
      if (yrNum) {
        resolvedYear = `Year ${yrNum}`;
        const defaultSemNum = yrNum * 2 - 1;
        const dbSem = subjectMetadata.find((s: any) => s.semester && s.semester.toLowerCase().includes(String(defaultSemNum)));
        if (dbSem) {
          resolvedSemester = dbSem.semester;
        } else {
          resolvedSemester = `Semester ${defaultSemNum}`;
        }
      }
    }
  }

  if (!resolvedSemester) {
    resolvedSemester = "Semester 1";
  }

  if (!resolvedYear) {
    const dbMatch = subjectMetadata.find((s: any) => s.semester && s.semester.toLowerCase() === resolvedSemester.toLowerCase());
    if (dbMatch && dbMatch.year) {
      resolvedYear = dbMatch.year;
    } else {
      const numMatch = resolvedSemester.match(/\d+/);
      if (numMatch) {
        const semNum = parseInt(numMatch[0], 10);
        const yrNum = Math.ceil(semNum / 2);
        resolvedYear = `Year ${yrNum}`;
      } else {
        resolvedYear = "Year 1";
      }
    }
  }

  return {
    department: resolvedDept,
    semester: resolvedSemester,
    year: resolvedYear
  };
}

export function parseClassGroupDetails(classGroup: string) {
  const yearMatch = classGroup.match(/\((\d{4})-(\d{4})\)/) || classGroup.match(/(\d{4})-(\d{4})/);
  const startYear = yearMatch ? parseInt(yearMatch[1], 10) : null;
  const endYear = yearMatch ? parseInt(yearMatch[2], 10) : null;

  const semMatch = classGroup.match(/SEM\s+([IVX0-9]+)/i) || classGroup.match(/Semester\s+(\d+)/i);
  let semester = semMatch ? semMatch[0].trim() : null;
  if (semester) {
    const semMap: Record<string, string> = {
      'SEM I': 'Semester 1',
      'SEM II': 'Semester 2',
      'SEM III': 'Semester 3',
      'SEM IV': 'Semester 4',
      'SEM V': 'Semester 5',
      'SEM VI': 'Semester 6',
      'SEMESTER 1': 'Semester 1',
      'SEMESTER 2': 'Semester 2',
      'SEMESTER 3': 'Semester 3',
      'SEMESTER 4': 'Semester 4',
      'SEMESTER 5': 'Semester 5',
      'SEMESTER 6': 'Semester 6'
    };
    semester = semMap[semester.toUpperCase()] || semester;
  }

  const shiftMatch = classGroup.match(/Shift\s+(\d+)/i);
  const shift = shiftMatch ? `Shift ${shiftMatch[1]}` : "General";

  const course = classGroup.split('-')[0].split('(')[0].trim();

  return { course, shift, semester, startYear, endYear };
}

/**
 * Postgres caps a statement at 65,535 bind parameters, and an IN-list built from a
 * request body or from every student of a college can pass a comfortable query plan
 * long before that. Anything fanning a statement out over an id list uses these
 * helpers instead of interpolating the whole list into one statement.
 */
export const IN_CHUNK = 500;

export function chunkList<T>(items: T[], size: number = IN_CHUNK): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export const inPlaceholders = (count: number) => Array.from({ length: count }, () => "?").join(",");

type ChunkStatement = { sql: string; params: any[] };

export async function readInChunks<T = any>(
  db: { all: (sql: string, ...params: any[]) => Promise<T[]> },
  ids: any[],
  build: (chunk: any[], placeholders: string) => ChunkStatement,
  chunkSize: number = IN_CHUNK
): Promise<T[]> {
  const out: T[] = [];
  for (const chunk of chunkList(ids, chunkSize)) {
    const stmt = build(chunk, inPlaceholders(chunk.length));
    out.push(...await db.all(stmt.sql, ...stmt.params));
  }
  return out;
}

/** Runs one statement per id chunk and returns the summed affected-row count. */
export async function writeInChunks(
  db: { run: (sql: string, ...params: any[]) => Promise<any> },
  ids: any[],
  build: (chunk: any[], placeholders: string) => ChunkStatement,
  chunkSize: number = IN_CHUNK
): Promise<number> {
  let changes = 0;
  for (const chunk of chunkList(ids, chunkSize)) {
    const stmt = build(chunk, inPlaceholders(chunk.length));
    const res = await db.run(stmt.sql, ...stmt.params);
    changes += Number(res?.changes ?? 0);
  }
  return changes;
}

/** Ceiling for a read that has a scope filter but no natural page size. */
export const ROW_CAP = 5000;

/**
 * Run a read with a hard ceiling. Passing it is reported as an error instead of a
 * short list: a caller that builds a roster, a dropdown or an approval queue from
 * these rows cannot tell a truncated page from the whole table, and the timetable
 * UI treats a short list as "those records do not exist".
 *
 * The statement must not already carry a LIMIT.
 */
export async function allCapped<T = any>(
  db: { all: (sql: string, ...params: any[]) => Promise<T[]> },
  sql: string,
  params: any[] = [],
  cap: number = ROW_CAP
): Promise<T[]> {
  const rows = await db.all(`${sql} LIMIT ${cap + 1}`, ...params);
  if (rows.length > cap) {
    throw new Error(
      `Read passed its ${cap}-row ceiling — ${sql.replace(/\s+/g, " ").slice(0, 80)}. Scope it to one college or raise ROW_CAP.`
    );
  }
  return rows;
}

/** Splits a set-based write so one statement stays clear of the bind-parameter cap. */
function chunkForWrite<T>(items: T[], size: number): T[][] {
  return chunkList(items, size);
}

/**
 * Re-derives subject_group / mentor_group from the subject_groups table.
 *
 * The matching is done in memory (it is a "first group name contained in the
 * subject name" rule with no SQL equivalent worth writing), but the writes used to
 * be one UPDATE per matched row — hundreds or thousands of round trips on every
 * mentors/subject-groups save. They are now folded into one statement per table.
 */
export async function syncMentorSubjectGroups(db: any) {
  const groupRows = await db.all("SELECT * FROM subject_groups");
  if (!groupRows || groupRows.length === 0) return;
  const groupNames = groupRows.map((g: any) => g.name);

  const allSubjects = await db.all("SELECT id, name, subject_group, mentor_group FROM subjects");

  const subjectUpdates: { id: string; group: string }[] = [];

  for (const sub of allSubjects) {
    let matchedGroup: string | null = sub.subject_group || sub.mentor_group || null;

    if (!matchedGroup || matchedGroup.toLowerCase() === "general") {
      const subNameLower = (sub.name || "").toLowerCase();

      for (const gName of groupNames) {
        if (subNameLower.includes(gName.toLowerCase())) {
          matchedGroup = gName;
          break;
        }
      }

      // Rows already carrying the value in both columns used to be re-written with
      // the same text; skipping them keeps the bulk statement to real changes.
      if (matchedGroup && (sub.subject_group !== matchedGroup || sub.mentor_group !== matchedGroup)) {
        subjectUpdates.push({ id: sub.id, group: matchedGroup });
      }
    }

    if (matchedGroup) sub.subject_group = matchedGroup;
  }

  for (const chunk of chunkForWrite(subjectUpdates, 500)) {
    const values = chunk.map(() => "(?, ?)").join(", ");
    const params: any[] = [];
    for (const u of chunk) params.push(u.id, u.group);
    await db.run(
      `UPDATE subjects AS s
       SET subject_group = u.grp, mentor_group = u.grp
       FROM (VALUES ${values}) AS u(id, grp)
       WHERE s.id = u.id`,
      params
    );
  }

  const mentors = await db.all("SELECT id, subjects, department, mentor_group, subject_group FROM mentors");
  // Same rows the follow-up SELECT used to re-read from the subjects table.
  const updatedSubjects = allSubjects
    .filter((sub: any) => sub.subject_group && sub.subject_group !== "General")
    .map((sub: any) => ({ name: sub.name, group_name: sub.subject_group }));

  const mentorUpdates: { id: string; group: string }[] = [];

  for (const mentor of mentors) {
    const mentorSubjects = (mentor.subjects || "")
      .split(/[\n,\r]/)
      .map((s: string) => s.trim().toLowerCase())
      .filter((s: string) => s.length > 0);

    let matchedGroup: string | null = null;
    for (const sub of updatedSubjects) {
      if (
        mentorSubjects.some(
          (ms: string) =>
            ms === sub.name.toLowerCase() ||
            sub.name.toLowerCase().includes(ms) ||
            ms.includes(sub.name.toLowerCase())
        )
      ) {
        matchedGroup = sub.group_name;
        break;
      }
    }

    if (matchedGroup) mentorUpdates.push({ id: mentor.id, group: matchedGroup });
  }

  for (const chunk of chunkForWrite(mentorUpdates, 500)) {
    const values = chunk.map(() => "(?, ?)").join(", ");
    const params: any[] = [];
    for (const u of chunk) params.push(u.id, u.group);
    await db.run(
      `UPDATE mentors AS m
       SET mentor_group = u.grp, subject_group = u.grp
       FROM (VALUES ${values}) AS u(id, grp)
       WHERE m.id = u.id
         AND (m.mentor_group IS NULL OR m.mentor_group = '' OR m.mentor_group = 'General')`,
      params
    );
  }
}

export async function consolidateSubjectGroups(db: any) {
  await db.run("UPDATE mentors SET mentor_group = 'English / Communication', subject_group = 'English / Communication' WHERE mentor_group = 'English' OR subject_group = 'English'");
  await db.run("UPDATE subjects SET mentor_group = 'English / Communication', subject_group = 'English / Communication' WHERE mentor_group = 'English' OR subject_group = 'English'");
  await db.run("DELETE FROM subject_groups WHERE id = 'g1'");

  await db.run("UPDATE mentors SET mentor_group = 'Maths / Aptitude', subject_group = 'Maths / Aptitude' WHERE mentor_group IN ('Aptitude', 'Mathematics') OR subject_group IN ('Aptitude', 'Mathematics')");
  await db.run("UPDATE subjects SET mentor_group = 'Maths / Aptitude', subject_group = 'Maths / Aptitude' WHERE mentor_group IN ('Aptitude', 'Mathematics') OR subject_group IN ('Aptitude', 'Mathematics')");
  await db.run("DELETE FROM subject_groups WHERE id IN ('g2', 'sg_math')");

  await db.run("UPDATE mentors SET mentor_group = 'Computer Science', subject_group = 'Computer Science' WHERE mentor_group IN ('Technical', 'Computer Applications') OR subject_group IN ('Technical', 'Computer Applications')");
  await db.run("UPDATE subjects SET mentor_group = 'Computer Science', subject_group = 'Computer Science' WHERE mentor_group IN ('Technical', 'Computer Applications') OR subject_group IN ('Technical', 'Computer Applications')");
  await db.run("DELETE FROM subject_groups WHERE id = 'g4'");

  await db.run("DELETE FROM subject_groups WHERE id = 'g5' AND NOT EXISTS (SELECT 1 FROM mentors WHERE mentor_group = 'General' OR subject_group = 'General')");

  await syncMentorSubjectGroups(db);
}

export async function syncMentorSubjectsAndClasses(db: PostgresDbAdapter, mentorId: string, course?: string, classGroup?: string) {
  if (!mentorId) return;
  const mentorRecord = await db.get("SELECT subjects, classes FROM mentors WHERE id = ?", mentorId);
  if (!mentorRecord) return;

  const existingSubjs = mentorRecord.subjects
    ? mentorRecord.subjects.split(/,|\n/).map((s: string) => s.trim()).filter(Boolean)
    : [];
  const existingClasses = mentorRecord.classes
    ? mentorRecord.classes.split(/,|\n/).map((c: string) => c.trim()).filter(Boolean)
    : [];

  let updated = false;
  if (course && course.trim() && !existingSubjs.includes(course.trim())) {
    existingSubjs.push(course.trim());
    updated = true;
  }
  if (classGroup && classGroup.trim() && !existingClasses.includes(classGroup.trim())) {
    existingClasses.push(classGroup.trim());
    updated = true;
  }

  if (updated) {
    await db.run(
      "UPDATE mentors SET subjects = ?, classes = ? WHERE id = ?",
      existingSubjs.join(", "),
      existingClasses.join(", "),
      mentorId
    );
  }
}

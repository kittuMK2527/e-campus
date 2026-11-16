import { readFileSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";

const source = readFileSync(join(process.cwd(), "src/app/api/daily-configs/route.ts"), "utf8");
const notifSource = readFileSync(join(process.cwd(), "src/lib/notifications.ts"), "utf8");

describe("daily-config writes are batched", () => {
  it("sends campus notifications through the shared batched dispatcher, not one per member", () => {
    expect(source).toContain("dispatchSystemNotification(db, {");
    // The fan-out this replaces: an INSERT issued from inside the per-user loop.
    expect(source).not.toMatch(/for \(const u of users\)[\s\S]{0,600}?await db\.run\(/);
    expect(notifSource).toMatch(/NOTIF_CHUNK = 1000/);
  });

  it("upserts the whole configured range in chunks", () => {
    expect(source).toContain("async function bulkUpsertDailyConfigs");
    expect((source.match(/await bulkUpsertDailyConfigs\(db, configRows\)/g) || []).length).toBe(2);
    expect(source).not.toMatch(/for \(const [a-z]+ of (users|nextDates|datesToProcess)\)[\s\S]{0,400}?INSERT INTO campus_daily_configs/);
  });

  it("sends one notification per request instead of one per configured date", () => {
    // Single-day and multi-day branches each dispatch once.
    expect((source.match(/await dispatchSystemNotification\(db, \{/g) || []).length).toBeLessThanOrEqual(3);
    expect(source).not.toMatch(/for \(const [a-z]+ of dayPlans\)[\s\S]{0,400}?dispatchSystemNotification/);
  });

  it("bounds the date range so one request cannot queue tens of thousands of rows", () => {
    expect(source).toContain("MAX_CONFIG_DATES");
    expect(source).toMatch(/while \(cur <= end && datesToProcess\.length <= MAX_CONFIG_DATES\)/);
    expect(source).toContain("Date range too large");
  });

  it("stamps notifications with an ISO timestamp instead of NOW()::text", () => {
    expect(source).not.toContain("NOW()::text");
    expect(notifSource).toContain("createdAt: new Date().toISOString()");
  });
});

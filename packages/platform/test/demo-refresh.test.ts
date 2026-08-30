/**
 * demo-refresh.test.ts — the job end to end.
 *
 * The load-bearing assertion is the LAST one: schema drift must abort BEFORE
 * the wipe, so the demo degrades to "yesterday's data" rather than "empty".
 * A preflight that ran after the wipe would be worse than none, because it
 * would look safe while leaving the demo blank every time anyone migrated.
 */
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { Pool } from "pg";
import { startTestcontainer } from "@budget/db/test/testcontainer";
import { runDemoRefresh } from "../src/demo/refresh";
import { readDemoConfig } from "../src/demo/config";

let pool: Pool;
/** Separate migrator connection: app_role cannot run DDL. */
let ddl: Pool;

const SRC_A = "11111111-aaaa-1111-1111-111111111111";
const SRC_B = "11111111-bbbb-1111-1111-111111111111";
const DST_A = "22222222-aaaa-2222-2222-222222222222";
const DST_B = "22222222-bbbb-2222-2222-222222222222";
const OWNER = "33333333-3333-3333-3333-333333333333";
const DEMO = "44444444-4444-4444-4444-444444444444";

const ENV = {
  DEMO_SOURCE_TENANT_IDS: `${SRC_A},${SRC_B}`,
  DEMO_TENANT_IDS: `${DST_A},${DST_B}`,
  DEMO_USER_ID: DEMO,
  DEMO_CURRENCIES: "USD,PLN",
  DEMO_BUDGET_NAMES: "Personal,Family",
  DEMO_LABELS: "personal,family",
  DEMO_HOME_CURRENCY: "PLN",
};

beforeAll(async () => {
  const { urlApp, urlMigrator } = await startTestcontainer();
  pool = new Pool({ connectionString: urlApp });
  ddl = new Pool({ connectionString: urlMigrator });
  const c = await pool.connect();
  try {
    await c.query(`SELECT set_config('app.tenant_ids', $1, false)`, [
      `{${SRC_A},${SRC_B},${DST_A},${DST_B}}`,
    ]);
    await c.query(`SELECT set_config('app.current_user_id', $1, false)`, [
      OWNER,
    ]);
    let i = 0;
    for (const id of [SRC_A, SRC_B, DST_A, DST_B]) {
      await c.query(
        `INSERT INTO tenancy.budgets (id, slug, name, default_currency, owner_user_id, created_at)
         VALUES ($1, $2, 'seeded', 'PLN', $3, now()) ON CONFLICT (id) DO NOTHING`,
        [id, `slug-${i++}`, OWNER],
      );
    }
    for (const [tid, cat] of [
      [SRC_A, "aaaaaaaa-0000-0000-0000-00000000000a"],
      [SRC_B, "aaaaaaaa-0000-0000-0000-00000000000b"],
    ] as const) {
      await c.query(
        `INSERT INTO budgeting.categories (id, tenant_id, name, created_at, actor_user_id, sort_index)
         VALUES ($2, $1, 'Owner private category', now(), $3, 0)`,
        [tid, cat, OWNER],
      );
      await c.query(
        `INSERT INTO budgeting.wallets (id, tenant_id, name, currency, current_balance, created_at, actor_user_id)
         VALUES (gen_random_uuid(), $1, 'Owner wallet', 'PLN', 1000.0000, now(), $2)`,
        [tid, OWNER],
      );
    }
  } finally {
    c.release();
  }
}, 180_000);

afterAll(async () => {
  await pool?.end();
  await ddl?.end();
});

async function countIn(tenant: string): Promise<number> {
  const { rows } = await pool.query(
    `SELECT count(*)::int n FROM budgeting.wallets WHERE tenant_id = $1`,
    [tenant],
  );
  return rows[0].n;
}

describe("runDemoRefresh", () => {
  test("does nothing when unconfigured", async () => {
    const r = await runDemoRefresh(pool, "2026-08-29", readDemoConfig({}));
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/not configured/);
    expect(await countIn(DST_A)).toBe(0);
  });

  test("rebuilds both demo budgets in one run", async () => {
    const r = await runDemoRefresh(pool, "2026-08-29", readDemoConfig(ENV));
    expect(r.ok).toBe(true);
    expect(await countIn(DST_A)).toBe(1);
    expect(await countIn(DST_B)).toBe(1);
  });

  test("each pair gets its own factor, both inside the range", async () => {
    const r = await runDemoRefresh(pool, "2026-08-29", readDemoConfig(ENV));
    // Labels carry their locale, because there is one budget pair per language.
    expect(r.scales["personal-en"]).not.toBe(r.scales["family-en"]);
    for (const s of Object.values(r.scales)) {
      expect(s).toBeGreaterThanOrEqual(0.5);
      expect(s).toBeLessThanOrEqual(2);
    }
  });

  test("a different day produces different amounts", async () => {
    await runDemoRefresh(pool, "2026-08-29", readDemoConfig(ENV));
    const day1 = await pool.query(
      `SELECT current_balance FROM budgeting.wallets WHERE tenant_id = $1`,
      [DST_A],
    );
    await runDemoRefresh(pool, "2026-09-15", readDemoConfig(ENV));
    const day2 = await pool.query(
      `SELECT current_balance FROM budgeting.wallets WHERE tenant_id = $1`,
      [DST_A],
    );
    expect(day2.rows[0].current_balance).not.toBe(day1.rows[0].current_balance);
  });

  test("the personal budget is USD and the family budget stays PLN", async () => {
    await runDemoRefresh(pool, "2026-08-29", readDemoConfig(ENV));
    const { rows } = await pool.query(
      `SELECT id, name, default_currency FROM tenancy.budgets WHERE id = ANY($1::uuid[]) ORDER BY name`,
      [[DST_A, DST_B]],
    );
    expect(rows.map((r) => [r.name, r.default_currency])).toEqual([
      ["Family", "PLN"],
      ["Personal", "USD"],
    ]);
  });

  test("the owner's tenants are never written to", async () => {
    const before = await pool.query(
      `SELECT count(*)::int n, min(name) name FROM budgeting.categories WHERE tenant_id = ANY($1::uuid[])`,
      [[SRC_A, SRC_B]],
    );
    await runDemoRefresh(pool, "2026-08-29", readDemoConfig(ENV));
    const after = await pool.query(
      `SELECT count(*)::int n, min(name) name FROM budgeting.categories WHERE tenant_id = ANY($1::uuid[])`,
      [[SRC_A, SRC_B]],
    );
    expect(after.rows[0]).toEqual(before.rows[0]);
  });

  test("schema drift aborts BEFORE the wipe, leaving the demo intact", async () => {
    // The whole safety argument for re-pulling live data unattended. If this
    // ever regresses to "wipe, then discover the problem", every migration
    // would blank the demo — and the failure would look like a copy bug rather
    // than the refusal it is.
    await runDemoRefresh(pool, "2026-08-29", readDemoConfig(ENV));
    const before = await countIn(DST_A);
    expect(before).toBeGreaterThan(0);

    await ddl.query(
      `ALTER TABLE budgeting.categories ADD COLUMN unclassified_secret text`,
    );
    try {
      const r = await runDemoRefresh(pool, "2026-08-30", readDemoConfig(ENV));
      expect(r.ok).toBe(false);
      expect(r.reason).toMatch(/manifest out of date/);
      expect(r.reason).toMatch(/unclassified_secret/);
      // Still there. Stale, not blank.
      expect(await countIn(DST_A)).toBe(before);
    } finally {
      await ddl.query(
        `ALTER TABLE budgeting.categories DROP COLUMN unclassified_secret`,
      );
    }
  });
});

/**
 * fx-pairs-query.test.ts — the FX job's pair query must actually run.
 *
 * It didn't. It named `currency_orig` and `currency_default`, neither of which
 * exists on expense_ledger; the error was swallowed at the call site, `pairs`
 * stayed empty, and the job reported success having fetched no rates at all.
 * Nothing failed, nothing logged — the only symptom was currency conversions
 * quietly falling back to 1:1 for pairs nobody had happened to seed by hand.
 *
 * A wrong column name is invisible until something executes the SQL, so this
 * executes it against a real schema.
 */
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { Pool } from "pg";
import { startTestcontainer } from "@budget/db/test/testcontainer";
// Imported from its own module, NOT via the handler: the handler pulls in
// the @budget/platform barrel, which several worker tests already fail to
// resolve — and a test that cannot load catches nothing.
import { FX_PAIRS_SQL } from "../src/handlers/fx-pairs-sql";

/** migrator: schema introspection only. */
let pool: Pool;
/** app_role: RLS policies on these tables target it, not migrator. */
let appPool: Pool;
/** worker_role: the role the JOB actually runs as — so the query is executed
 *  by the same principal in the test as in production. If worker_role could
 *  not see these rows, the job would collect nothing even with correct SQL. */
let workerPool: Pool;

const OWNER = "aaaa1111-0000-4000-8000-000000000001";
const BUDGET = "aaaa1111-0000-4000-8000-000000000002";

/** Render the drizzle sql template as plain text for a raw pg query. */
function sqlText(): string {
  const q = FX_PAIRS_SQL as unknown as {
    queryChunks?: unknown[];
    strings?: string[];
  };
  // The query takes no parameters, so the static chunks ARE the whole query.
  const chunks = (q.queryChunks ?? []) as Array<{ value?: string[] }>;
  const text = chunks
    .map((c) => (Array.isArray(c?.value) ? c.value.join("") : ""))
    .join("");
  return text || (q.strings ?? []).join("");
}

beforeAll(async () => {
  const { urlMigrator, urlApp, urlWorker } = await startTestcontainer();
  pool = new Pool({ connectionString: urlMigrator });
  appPool = new Pool({ connectionString: urlApp });
  workerPool = new Pool({ connectionString: urlWorker });
}, 180_000);

afterAll(async () => {
  await pool?.end();
  await appPool?.end();
  await workerPool?.end();
});

describe("FX pair collection", () => {
  test("the query executes against the real schema", async () => {
    // The whole point. If a column is renamed out from under this, it fails
    // HERE rather than silently zeroing the job's work.
    const text = sqlText();
    expect(text.length).toBeGreaterThan(0);
    const res = await workerPool.query(text);
    expect(Array.isArray(res.rows)).toBe(true);
  });

  test("it names only columns that exist", async () => {
    // Belt and braces on the exact failure that happened: assert the columns
    // the query relies on are really there.
    const { rows } = await pool.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'budgeting' AND table_name = 'expense_ledger'`,
    );
    const cols = new Set(rows.map((r) => r.column_name));
    expect(cols.has("currency_original")).toBe(true);
    expect(cols.has("deleted_at")).toBe(true);
    // The names the broken version used, kept as a tripwire.
    expect(cols.has("currency_orig")).toBe(false);
    expect(cols.has("currency_default")).toBe(false);
  });

  test("a wallet in a currency with NO transactions still yields a pair", async () => {
    // The second half of the fix. A dormant foreign account has no ledger rows,
    // but its balance still counts toward capitalization — without a rate it
    // was being added at 1:1.
    const c = await appPool.connect();
    try {
      await c.query(`SELECT set_config('app.tenant_ids', $1, false)`, [
        `{${BUDGET}}`,
      ]);
      await c.query(`SELECT set_config('app.current_user_id', $1, false)`, [
        OWNER,
      ]);
      await c.query(
        `INSERT INTO tenancy.budgets (id, slug, name, default_currency, owner_user_id, created_at)
         VALUES ($1, 'fx-pairs-test', 'b', 'PLN', $2, now())
         ON CONFLICT (id) DO NOTHING`,
        [BUDGET, OWNER],
      );
      await c.query(
        `INSERT INTO budgeting.wallets
           (id, tenant_id, name, currency, current_balance, created_at, actor_user_id)
         VALUES (gen_random_uuid(), $1, 'dormant', 'JPY', 1000.0000, now(), $2)`,
        [BUDGET, OWNER],
      );
    } finally {
      c.release();
    }

    const { rows } = await workerPool.query<{ base: string; quote: string }>(
      sqlText(),
    );
    expect(rows).toContainEqual({ base: "JPY", quote: "PLN" });
  });
});

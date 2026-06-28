/**
 * budget-wealth-snapshot-3h.test.ts — Integration test for the 3h wealth snapshot
 * handler (Phase 11 Plan 11-07, D-04/SC8/T-11-02). Real Postgres.
 *
 * Seeds 2 budgets with different default_currency + a wallet each, runs
 * runBudgetWealthSnapshot3h directly (not via pg-boss), and asserts: exactly one
 * row per budget in its default_currency with capitalization = Σ wallets (holdings
 * stubbed to 0); a second run produces NO duplicate (ON CONFLICT on the UTC-hour
 * bucket); and budget B's snapshot is invisible under budget A's tenant GUC (RLS).
 *
 * holdingsValuation/fxProvider are stubbed so the snapshot value is deterministic
 * and the all-budgets scan stays cheap (no pricing pipeline, no FX network). The
 * real DB write path (withTenantTx + app_role INSERT under RLS) is exercised.
 * NO DB mocking of the snapshot write/read.
 */
import { describe, test, expect } from "bun:test";
import { Pool } from "pg";

const DB_URL = (process.env.DATABASE_URL_APP ?? "").replace(
  "@db:",
  "@localhost:",
);
process.env.DATABASE_URL_APP = DB_URL;
if (process.env.DATABASE_URL_WORKER) {
  process.env.DATABASE_URL_WORKER = process.env.DATABASE_URL_WORKER.replace(
    "@db:",
    "@localhost:",
  );
}
const { resetPools } = await import("@budget/platform");
resetPools();

const { runBudgetWealthSnapshot3h } =
  await import("../../src/handlers/budget-wealth-snapshot-3h");
const { createOverviewCardsRepo } =
  await import("@budget/budgeting/src/adapters/persistence/overview-cards-repo");

interface Fx {
  userId: string;
  budgetId: string;
  currency: string;
}

async function seed(currency: string, walletBalance: number): Promise<Fx> {
  const pool = new Pool({ connectionString: DB_URL });
  const client = await pool.connect();
  const userId = crypto.randomUUID();
  const budgetId = crypto.randomUUID();
  try {
    await client.query("BEGIN");
    await client.query(
      `SELECT set_config('app.current_user_id', '${userId}', true)`,
    );
    await client.query(
      `INSERT INTO identity.users (id, email, name, email_verified, created_at, updated_at)
       VALUES ($1, $2, 'Snap Test', true, now(), now())`,
      [userId, `snap-${userId.slice(0, 8)}@test.local`],
    );
    await client.query(
      `INSERT INTO tenancy.budgets (id, slug, name, kind, default_currency, owner_user_id, member_count, created_at)
       VALUES ($1, $2, 'Snap Budget', 'PRIVATE', $3, $4, 1, now())`,
      [budgetId, `snp-${budgetId.slice(0, 8)}`, currency, userId],
    );
    await client.query(
      `SELECT set_config('app.tenant_ids', '{"${budgetId}"}', true)`,
    );
    await client.query(
      `INSERT INTO budgeting.wallets (id, tenant_id, name, wallet_type, currency, current_balance, created_at, actor_user_id)
       VALUES ($1, $2, 'Main', 'SPENDINGS', $3, $4::numeric, now(), $5)`,
      [crypto.randomUUID(), budgetId, currency, walletBalance, userId],
    );
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
    await pool.end();
  }
  return { userId, budgetId, currency };
}

/** Read a budget's snapshot rows under its own tenant GUC (app_role + RLS). */
async function snapshotsFor(
  budgetId: string,
  underTenant = budgetId,
): Promise<
  {
    capitalization_cents: string;
    investment_value_cents: string;
    currency: string;
  }[]
> {
  const pool = new Pool({ connectionString: DB_URL });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `SELECT set_config('app.tenant_ids', '{"${underTenant}"}', true)`,
    );
    const r = await client.query(
      `SELECT capitalization_cents::text, investment_value_cents::text, currency
         FROM budgeting.budget_wealth_snapshots WHERE budget_id = $1::uuid`,
      [budgetId],
    );
    await client.query("COMMIT");
    return r.rows;
  } finally {
    client.release();
    await pool.end();
  }
}

const deps = {
  walletRepo: createOverviewCardsRepo(),
  holdingsValuation: { investmentValueCents: async () => 0n },
  fxProvider: {
    rateAsOf: async () => ({ rate: "1", provider: "stub", isStale: false }),
  },
} as unknown as Parameters<typeof runBudgetWealthSnapshot3h>[0];

describe("budget-wealth-snapshot-3h", () => {
  // The handler snapshots EVERY budget in the DB (prod runs every 3h); in a shared
  // test DB that's hundreds of budgets × 2 runs, so allow a generous timeout.
  test("one row per budget in default_ccy; idempotent on re-run; tenant-scoped (D-04/SC8/T-11-02)", async () => {
    const a = await seed("USD", 1000);
    const b = await seed("EUR", 500);

    await runBudgetWealthSnapshot3h(deps);

    const aRows = await snapshotsFor(a.budgetId);
    const bRows = await snapshotsFor(b.budgetId);
    expect(aRows).toHaveLength(1);
    expect(aRows[0]).toEqual({
      capitalization_cents: "100000",
      investment_value_cents: "0",
      currency: "USD",
    });
    expect(bRows).toHaveLength(1);
    expect(bRows[0]).toEqual({
      capitalization_cents: "50000",
      investment_value_cents: "0",
      currency: "EUR",
    });

    // Re-run within the same UTC hour → ON CONFLICT DO NOTHING → still one row.
    await runBudgetWealthSnapshot3h(deps);
    expect(await snapshotsFor(a.budgetId)).toHaveLength(1);

    // RLS: budget B's row is invisible under budget A's tenant context.
    expect(await snapshotsFor(b.budgetId, a.budgetId)).toHaveLength(0);
  }, 180_000);
});

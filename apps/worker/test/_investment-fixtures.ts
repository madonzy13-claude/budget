/**
 * _investment-fixtures.ts — shared seed/cleanup helpers for the Phase-9 worker job
 * integration tests (real Postgres). NOT a test file (underscore prefix).
 *
 * Rewrites the @db: compose host to @localhost: at module load (BEFORE any test
 * imports @budget/platform) so the platform worker/app pools connect from the host.
 * Seeds users/budgets/holdings via app_role (worker_role has no INSERT on tenancy/
 * identity) and instruments/price-cache via worker_role.
 */
import { Pool } from "pg";

const toLocal = (u: string | undefined): string =>
  (u ?? "").replace("@db:", "@localhost:");

process.env.DATABASE_URL_APP = toLocal(process.env.DATABASE_URL_APP);
process.env.DATABASE_URL_WORKER = toLocal(process.env.DATABASE_URL_WORKER);

if (!process.env.DATABASE_URL_APP || !process.env.DATABASE_URL_WORKER) {
  throw new Error(
    "DATABASE_URL_APP and DATABASE_URL_WORKER required for worker job integration tests",
  );
}

export const appPool = new Pool({
  connectionString: process.env.DATABASE_URL_APP,
});
export const workerSeedPool = new Pool({
  connectionString: process.env.DATABASE_URL_WORKER,
});

export interface SeededBudget {
  userId: string;
  budgetId: string;
}

export async function seedBudget(currency = "EUR"): Promise<SeededBudget> {
  const userId = crypto.randomUUID();
  const budgetId = crypto.randomUUID();
  const c = await appPool.connect();
  try {
    await c.query("BEGIN");
    await c.query(
      `INSERT INTO identity.users (id, email, name, email_verified, created_at, updated_at)
       VALUES ($1, $2, 'Inv Job', true, now(), now())`,
      [userId, `inv-job-${userId.slice(0, 8)}@example.com`],
    );
    await c.query(
      `INSERT INTO tenancy.budgets
         (id, slug, name, kind, default_currency, owner_user_id, member_count, created_at, investments_enabled)
       VALUES ($1, $2, 'Inv Job Budget', 'PRIVATE', $3, $4, 1, now(), true)`,
      [budgetId, `ws-invjob-${budgetId.slice(0, 8)}`, currency, userId],
    );
    await c.query(
      `INSERT INTO tenancy.budget_members (id, budget_id, user_id, role, created_at)
       VALUES ($1, $2, $3, 'owner', now())`,
      [crypto.randomUUID(), budgetId, userId],
    );
    await c.query("COMMIT");
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
  return { userId, budgetId };
}

export async function seedInstrument(opts: {
  symbol: string;
  displayName?: string;
  provider: string;
  assetClass?: string;
  refreshCadence?: "hourly" | "daily";
  active?: boolean;
  quoteCurrency?: string;
}): Promise<string> {
  const r = await workerSeedPool.query<{ id: string }>(
    `INSERT INTO budgeting.instruments
       (symbol, display_name, provider, asset_class, quote_currency, refresh_cadence, active, fetched_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, now())
     ON CONFLICT (symbol, provider) DO UPDATE SET active = EXCLUDED.active,
       refresh_cadence = EXCLUDED.refresh_cadence
     RETURNING id::text AS id`,
    [
      opts.symbol,
      opts.displayName ?? opts.symbol,
      opts.provider,
      opts.assetClass ?? "equities",
      opts.quoteCurrency ?? "USD",
      opts.refreshCadence ?? "hourly",
      opts.active ?? true,
    ],
  );
  return r.rows[0].id;
}

export async function seedHolding(
  budgetId: string,
  opts: {
    name: string;
    instrumentId: string | null;
    holdingType?: string;
    quantity?: string;
    buyCurrency?: string;
    currentPriceCents?: number | null;
    currentPriceCurrency?: string | null;
  },
): Promise<string> {
  const id = crypto.randomUUID();
  const c = await appPool.connect();
  try {
    await c.query("BEGIN");
    await c.query(`SELECT set_config('app.tenant_ids', $1, true)`, [
      `{${budgetId}}`,
    ]);
    await c.query(
      `INSERT INTO budgeting.investments
         (id, tenant_id, budget_id, instrument_id, name, holding_type, quantity,
          buy_price_cents, buy_currency, current_price_cents, current_price_currency, sort_order, created_at)
       VALUES ($1, $2::uuid, $2::uuid, $3, $4, $5, $6, 10000, $7, $8, $9, 0, now())`,
      [
        id,
        budgetId,
        opts.instrumentId,
        opts.name,
        opts.holdingType ?? "equities",
        opts.quantity ?? "1",
        opts.buyCurrency ?? "USD",
        opts.currentPriceCents ?? null,
        opts.currentPriceCurrency ?? null,
      ],
    );
    await c.query("COMMIT");
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
  return id;
}

export async function seedPriceCache(
  instrumentId: string,
  price: string,
  currency = "USD",
): Promise<void> {
  await workerSeedPool.query(
    `INSERT INTO budgeting.instrument_price_cache (instrument_id, price, currency, fetched_at)
     VALUES ($1::uuid, $2::numeric, $3, now())
     ON CONFLICT (instrument_id) DO UPDATE SET price = EXCLUDED.price, fetched_at = now()`,
    [instrumentId, price, currency],
  );
}

export async function countPendingDelisted(holdingId: string): Promise<number> {
  const r = await workerSeedPool.query<{ n: string }>(
    `SELECT count(*)::text AS n FROM budgeting.tasks
      WHERE kind = 'INVESTMENT_INSTRUMENT_DELISTED'
        AND status = 'PENDING'
        AND payload_json->>'holding_id' = $1`,
    [holdingId],
  );
  return Number(r.rows[0].n);
}

export async function cacheRowExists(instrumentId: string): Promise<boolean> {
  const r = await workerSeedPool.query(
    `SELECT 1 FROM budgeting.instrument_price_cache WHERE instrument_id = $1::uuid`,
    [instrumentId],
  );
  return r.rows.length > 0;
}

/** Delete a budget's holdings (investments has FORCE RLS — set the GUC first). */
export async function deleteBudgetInvestments(budgetId: string): Promise<void> {
  const c = await appPool.connect();
  try {
    await c.query("BEGIN");
    await c.query(`SELECT set_config('app.tenant_ids', $1, true)`, [
      `{${budgetId}}`,
    ]);
    await c.query(
      `DELETE FROM budgeting.investments WHERE budget_id = $1::uuid`,
      [budgetId],
    );
    await c.query("COMMIT");
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
}

/** Reference-data cleanup (test instruments / cache / snapshots / delisted tasks). */
export async function cleanupReferenceData(provider = "test_"): Promise<void> {
  await workerSeedPool.query(
    `DELETE FROM budgeting.tasks WHERE kind = 'INVESTMENT_INSTRUMENT_DELISTED'`,
  );
  await workerSeedPool.query(
    `DELETE FROM budgeting.instrument_price_snapshots
      WHERE instrument_id IN (SELECT id FROM budgeting.instruments WHERE provider LIKE $1 || '%')`,
    [provider],
  );
  await workerSeedPool.query(
    `DELETE FROM budgeting.instrument_price_cache
      WHERE instrument_id IN (SELECT id FROM budgeting.instruments WHERE provider LIKE $1 || '%')`,
    [provider],
  );
  await workerSeedPool.query(
    `DELETE FROM budgeting.instruments WHERE provider LIKE $1 || '%'`,
    [provider],
  );
}

export async function endPools(): Promise<void> {
  await appPool.end();
  await workerSeedPool.end();
}

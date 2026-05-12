/**
 * budgeting-reconciliation.test.ts — Integration test for hourly reconciliation handler.
 * Verifies per-tenant scan, drift auto-repair vs alert, multi-tenant aggregation.
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

const { runBudgetingReconciliation } =
  await import("../../src/handlers/budgeting-reconciliation");

interface ReconFx {
  userId: string;
  tenantId: string;
  accountId: string;
  categoryId: string;
}

async function seed(label: string): Promise<ReconFx> {
  const pool = new Pool({ connectionString: DB_URL });
  const client = await pool.connect();
  const userId = crypto.randomUUID();
  const tenantId = crypto.randomUUID();
  const accountId = crypto.randomUUID();
  const categoryId = crypto.randomUUID();
  try {
    await client.query("BEGIN");
    await client.query(
      `SELECT set_config('app.current_user_id', '${userId}', true)`,
    );
    await client.query(
      `INSERT INTO identity.users (id, email, name, email_verified, created_at, updated_at)
       VALUES ($1, $2, $3, true, now(), now())`,
      [userId, `recon-h-${label}-${userId.slice(0, 8)}@test.local`, label],
    );
    // v1.1: tenancy.workspaces → tenancy.budgets (0012)
    await client.query(
      `INSERT INTO tenancy.budgets (id, slug, name, kind, default_currency, owner_user_id, member_count, created_at)
       VALUES ($1, $2, $3, 'PRIVATE', 'EUR', $4, 1, now())`,
      [tenantId, `rcn-h-${tenantId.slice(0, 8)}`, label, userId],
    );
    await client.query(
      `SELECT set_config('app.tenant_ids', '{"${tenantId}"}', true)`,
    );
    // v1.1: budgeting.accounts → budgeting.wallets; kind/scope dropped; wallet_type added
    await client.query(
      `INSERT INTO budgeting.wallets (id, tenant_id, name, wallet_type, currency, current_balance, created_at, actor_user_id)
       VALUES ($1, $2, 'Checking', 'SPENDINGS', 'EUR', 100000.0000, now(), $3)`,
      [accountId, tenantId, userId],
    );
    // v1.1: budgeting.categories.scope dropped
    await client.query(
      `INSERT INTO budgeting.categories (id, tenant_id, name, created_at, actor_user_id)
       VALUES ($1, $2, 'Food', now(), $3)`,
      [categoryId, tenantId, userId],
    );
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
    await pool.end();
  }
  return { userId, tenantId, accountId, categoryId };
}

async function buildUseCases() {
  const { createBudgetingModule } =
    await import("@budget/budgeting/src/contracts/factory");
  const { DrizzleFxRateCacheRepo } =
    await import("@budget/budgeting/src/adapters/persistence/fx-rate-cache-repo");
  const { workerPool } = await import("@budget/platform");
  const fxCache = new DrizzleFxRateCacheRepo(workerPool());
  return createBudgetingModule({ fxCache });
}

async function corruptProjection(
  tenantId: string,
  categoryId: string,
  monthStart: string,
  value: string,
) {
  const pool = new Pool({ connectionString: DB_URL });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `SELECT set_config('app.tenant_ids', '{"${tenantId}"}', true)`,
    );
    await client.query(
      `UPDATE budgeting.spending_by_category_month
          SET normal_amount = $1::numeric
        WHERE tenant_id = $2 AND category_id = $3 AND month_start_date = $4::date`,
      [value, tenantId, categoryId, monthStart],
    );
    await client.query("COMMIT");
  } finally {
    client.release();
    await pool.end();
  }
}

describe("budgeting-reconciliation handler", () => {
  test(
    "aggregates repaired+alerted across multiple tenants",
    { timeout: 30000 },
    async () => {
      const fxA = await seed("HandlerA");
      const fxB = await seed("HandlerB");
      const useCases = await buildUseCases();

      const today = new Date();
      const txDate = today.toISOString().slice(0, 10);
      const monthStart = txDate.slice(0, 8) + "01";

      // Tenant A: small drift (auto-repair)
      await useCases.createTransaction({
        kind: "EXPENSE",
        amountOrig: "100.00",
        currencyOrig: "EUR",
        transactionDate: txDate,
        accountId: fxA.accountId,
        categoryId: fxA.categoryId,
        tenantId: fxA.tenantId,
        actorUserId: fxA.userId,
      });
      await corruptProjection(fxA.tenantId, fxA.categoryId, monthStart, "99.7");

      // Tenant B: large drift (alert)
      await useCases.createTransaction({
        kind: "EXPENSE",
        amountOrig: "200.00",
        currencyOrig: "EUR",
        transactionDate: txDate,
        accountId: fxB.accountId,
        categoryId: fxB.categoryId,
        tenantId: fxB.tenantId,
        actorUserId: fxB.userId,
      });
      await corruptProjection(fxB.tenantId, fxB.categoryId, monthStart, "150");

      const r = await runBudgetingReconciliation(txDate);
      expect(r.isOk()).toBe(true);
      const out = r.value!;
      // Both tenants scanned (along with all other test tenants in this DB; assert >= our 2)
      expect(out.tenantsScanned).toBeGreaterThanOrEqual(2);
      // At least 1 repaired (fxA) and 1 alerted (fxB)
      expect(out.totalRepaired).toBeGreaterThanOrEqual(1);
      expect(out.totalAlerted).toBeGreaterThanOrEqual(1);
    },
  );
});

/**
 * budgeting-reconciliation.test.ts — Integration test for the hourly reconciliation
 * handler. Verifies the per-tenant scan runs cleanly (the ENGR-14 projection
 * drift-check was removed — see the handler header — so there are no repair/alert
 * counters any more; the sweeps run only when sweepDeps are wired in prod).
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

describe("budgeting-reconciliation handler", () => {
  test(
    "scans all tenants without error (projection drift-check removed)",
    { timeout: 30000 },
    async () => {
      // Two seeded tenants (each seed() inserts a wallet → appears in the scan).
      await seed("HandlerA");
      await seed("HandlerB");

      // No sweepDeps → the run just scans tenants. The point of this test post-
      // ENGR-14-removal: it no longer errors on the dead spending_by_category_month
      // projection (which referenced the pre-migration column set).
      const r = await runBudgetingReconciliation();
      expect(r.isOk()).toBe(true);
      const out = r.value!;
      // Both seeded tenants (plus any others in the shared DB) appear in the scan.
      expect(out.tenantsScanned).toBeGreaterThanOrEqual(2);
      // Sweeps only run when sweepDeps are wired (prod); not in this scan-only test.
      expect(out.reserveTopupsSwept).toBe(0);
      expect(out.cushionTasksSwept).toBe(0);
    },
  );
});

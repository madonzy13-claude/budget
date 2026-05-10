/**
 * projections-reconcile.test.ts — Integration tests for reconcile-projections + replay-projections.
 * Auto-repair threshold = 1.00; alert threshold = >= 1.00 (writes outbox event).
 */
import { describe, test, expect, beforeAll } from "bun:test";
import { Pool } from "pg";

const DB_URL = process.env.DATABASE_URL_APP;
if (!DB_URL) throw new Error("DATABASE_URL_APP required");

if (process.env.DATABASE_URL_WORKER) {
  process.env.DATABASE_URL_WORKER = process.env.DATABASE_URL_WORKER.replace("@db:", "@localhost:");
}
process.env.DATABASE_URL_APP = DB_URL.replace("@db:", "@localhost:");
const { resetPools } = await import("@budget/platform");
resetPools();

interface Fixture {
  userId: string;
  tenantId: string;
  accountId: string;
  categoryId: string;
}

async function createFixture(label: string): Promise<Fixture> {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL_APP });
  const client = await pool.connect();
  const userId = crypto.randomUUID();
  const tenantId = crypto.randomUUID();
  const accountId = crypto.randomUUID();
  const categoryId = crypto.randomUUID();

  try {
    await client.query("BEGIN");
    await client.query(`SELECT set_config('app.current_user_id', '${userId}', true)`);
    await client.query(
      `INSERT INTO identity.users (id, email, name, email_verified, created_at, updated_at)
       VALUES ($1, $2, 'Recon Test', true, now(), now())`,
      [userId, `recon-${label}-${userId.slice(0, 8)}@example.com`],
    );
    await client.query(
      `INSERT INTO tenancy.workspaces (id, slug, name, kind, default_currency, owner_user_id, member_count, created_at)
       VALUES ($1, $2, 'Recon WS', 'PRIVATE', 'EUR', $3, 1, now())`,
      [tenantId, `ws-rcn-${tenantId.slice(0, 8)}`, userId],
    );
    await client.query(`SELECT set_config('app.tenant_ids', '{"${tenantId}"}', true)`);
    await client.query(`SELECT set_config('app.current_user_id', '${userId}', true)`);
    await client.query(
      `INSERT INTO budgeting.accounts (id, tenant_id, name, kind, scope, currency, current_balance, created_at, actor_user_id)
       VALUES ($1, $2, 'Checking', 'CHECKING', 'PERSONAL', 'EUR', 100000.0000, now(), $3)`,
      [accountId, tenantId, userId],
    );
    await client.query(
      `INSERT INTO budgeting.categories (id, tenant_id, name, scope, created_at, actor_user_id)
       VALUES ($1, $2, 'Food', 'PERSONAL', now(), $3)`,
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
  const { createBudgetingModule } = await import("@budget/budgeting/src/contracts/factory");
  const { DrizzleFxRateCacheRepo } = await import(
    "@budget/budgeting/src/adapters/persistence/fx-rate-cache-repo"
  );
  const { workerPool } = await import("@budget/platform");
  const fxCache = new DrizzleFxRateCacheRepo(workerPool());
  return createBudgetingModule({ fxCache });
}

async function getProjection(tenantId: string, categoryId: string, monthStart: string): Promise<number | null> {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL_APP });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`SELECT set_config('app.tenant_ids', '{"${tenantId}"}', true)`);
    const r = await client.query(
      `SELECT normal_amount::float AS n FROM budgeting.spending_by_category_month
        WHERE tenant_id = $1 AND category_id = $2 AND month_start_date = $3::date`,
      [tenantId, categoryId, monthStart],
    );
    await client.query("COMMIT");
    return r.rows[0]?.n ?? null;
  } finally {
    client.release();
    await pool.end();
  }
}

async function setProjection(tenantId: string, categoryId: string, monthStart: string, value: string) {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL_APP });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`SELECT set_config('app.tenant_ids', '{"${tenantId}"}', true)`);
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

async function countOutbox(tenantId: string, eventType: string): Promise<number> {
  // outbox: app_role has INSERT only; worker_role has SELECT (Pitfall 10).
  const pool = new Pool({ connectionString: process.env.DATABASE_URL_WORKER });
  const client = await pool.connect();
  try {
    const r = await client.query(
      `SELECT count(*)::int AS cnt FROM shared_kernel.outbox
        WHERE event_type = $1 AND tenant_id = $2`,
      [eventType, tenantId],
    );
    return r.rows[0]?.cnt ?? 0;
  } finally {
    client.release();
    await pool.end();
  }
}

describe("reconcile-projections + replay-projections", () => {
  test("auto-repair: small drift (< 1.00) → projection updated, no alert", async () => {
    const fx = await createFixture("repair");
    const useCases = await buildUseCases();

    // Seed 100 EUR EXPENSE in May 2026 → projection becomes 100.00
    const r = await useCases.createTransaction({
      kind: "EXPENSE",
      amountOrig: "100.00",
      currencyOrig: "EUR",
      transactionDate: "2026-05-15",
      accountId: fx.accountId,
      categoryId: fx.categoryId,
      tenantId: fx.tenantId,
      actorUserId: fx.userId,
    });
    expect(r.isOk()).toBe(true);

    // Corrupt projection slightly (delta=0.5 → < 1.00 auto-repair threshold)
    await setProjection(fx.tenantId, fx.categoryId, "2026-05-01", "99.5");
    expect(await getProjection(fx.tenantId, fx.categoryId, "2026-05-01")).toBeCloseTo(99.5, 1);

    const alertsBefore = await countOutbox(fx.tenantId, "budgeting.projection.drift.detected");

    const recon = await useCases.reconcileProjections({
      tenantId: fx.tenantId,
      monthStart: "2026-05-01",
      monthEnd: "2026-05-31",
    });
    expect(recon.isOk()).toBe(true);
    expect(recon.value!.repaired).toBe(1);
    expect(recon.value!.alerted).toBe(0);

    expect(await getProjection(fx.tenantId, fx.categoryId, "2026-05-01")).toBeCloseTo(100, 1);
    const alertsAfter = await countOutbox(fx.tenantId, "budgeting.projection.drift.detected");
    expect(alertsAfter).toBe(alertsBefore);
  });

  test("alert: large drift (>= 1.00) → outbox event emitted, projection NOT updated", async () => {
    const fx = await createFixture("alert");
    const useCases = await buildUseCases();

    // Seed 100 EUR
    await useCases.createTransaction({
      kind: "EXPENSE",
      amountOrig: "100.00",
      currencyOrig: "EUR",
      transactionDate: "2026-05-10",
      accountId: fx.accountId,
      categoryId: fx.categoryId,
      tenantId: fx.tenantId,
      actorUserId: fx.userId,
    });

    // Big drift: set projection to 90 (delta=10 > 1.00)
    await setProjection(fx.tenantId, fx.categoryId, "2026-05-01", "90");

    const alertsBefore = await countOutbox(fx.tenantId, "budgeting.projection.drift.detected");

    const recon = await useCases.reconcileProjections({
      tenantId: fx.tenantId,
      monthStart: "2026-05-01",
      monthEnd: "2026-05-31",
    });
    expect(recon.isOk()).toBe(true);
    expect(recon.value!.repaired).toBe(0);
    expect(recon.value!.alerted).toBe(1);

    // Projection NOT updated (large drift requires human review)
    expect(await getProjection(fx.tenantId, fx.categoryId, "2026-05-01")).toBeCloseTo(90, 1);

    const alertsAfter = await countOutbox(fx.tenantId, "budgeting.projection.drift.detected");
    expect(alertsAfter).toBe(alertsBefore + 1);
  });

  test("replay-projections: rebuilds projection cleanly from ledger", async () => {
    const fx = await createFixture("replay");
    const useCases = await buildUseCases();

    // 50 + 25 = 75 EUR in May 2026
    await useCases.createTransaction({
      kind: "EXPENSE",
      amountOrig: "50.00",
      currencyOrig: "EUR",
      transactionDate: "2026-05-05",
      accountId: fx.accountId,
      categoryId: fx.categoryId,
      tenantId: fx.tenantId,
      actorUserId: fx.userId,
    });
    await useCases.createTransaction({
      kind: "EXPENSE",
      amountOrig: "25.00",
      currencyOrig: "EUR",
      transactionDate: "2026-05-20",
      accountId: fx.accountId,
      categoryId: fx.categoryId,
      tenantId: fx.tenantId,
      actorUserId: fx.userId,
    });

    // Corrupt projection
    await setProjection(fx.tenantId, fx.categoryId, "2026-05-01", "1234.56");

    const replay = await useCases.replayProjections({
      tenantId: fx.tenantId,
      dateFrom: "2026-05-01",
      dateTo: "2026-05-31",
    });
    expect(replay.isOk()).toBe(true);

    // Projection rebuilt → 75
    expect(await getProjection(fx.tenantId, fx.categoryId, "2026-05-01")).toBeCloseTo(75, 1);
  });
});

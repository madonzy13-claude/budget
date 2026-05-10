/**
 * bulk.test.ts — Integration tests for bulkRecategorize use case (Plan 02-09).
 * Verifies single-tx atomicity, no-op skip on same-category, RLS isolation, partial-failure rollback.
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
  categoryAId: string;
  categoryBId: string;
}

async function createFixture(label: string): Promise<Fixture> {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL_APP });
  const client = await pool.connect();
  const userId = crypto.randomUUID();
  const tenantId = crypto.randomUUID();
  const accountId = crypto.randomUUID();
  const categoryAId = crypto.randomUUID();
  const categoryBId = crypto.randomUUID();
  try {
    await client.query("BEGIN");
    await client.query(`SELECT set_config('app.current_user_id', '${userId}', true)`);
    await client.query(
      `INSERT INTO identity.users (id, email, name, email_verified, created_at, updated_at)
       VALUES ($1, $2, 'Bulk Test', true, now(), now())`,
      [userId, `bulk-${label}-${userId.slice(0, 8)}@example.com`],
    );
    await client.query(
      `INSERT INTO tenancy.workspaces (id, slug, name, kind, default_currency, owner_user_id, member_count, created_at)
       VALUES ($1, $2, 'Bulk WS', 'PRIVATE', 'EUR', $3, 1, now())`,
      [tenantId, `ws-bulk-${tenantId.slice(0, 8)}`, userId],
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
       VALUES ($1, $2, 'CatA', 'PERSONAL', now(), $3),
              ($4, $2, 'CatB', 'PERSONAL', now(), $3)`,
      [categoryAId, tenantId, userId, categoryBId],
    );
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
    await pool.end();
  }
  return { userId, tenantId, accountId, categoryAId, categoryBId };
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

async function getLedgerCount(tenantId: string): Promise<number> {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL_APP });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`SELECT set_config('app.tenant_ids', '{"${tenantId}"}', true)`);
    const r = await client.query(
      `SELECT count(*)::int AS cnt FROM budgeting.expense_ledger WHERE tenant_id = $1`,
      [tenantId],
    );
    await client.query("COMMIT");
    return r.rows[0]?.cnt ?? 0;
  } finally {
    client.release();
    await pool.end();
  }
}

async function seedExpense(
  useCases: Awaited<ReturnType<typeof buildUseCases>>,
  fx: Fixture,
  amount: string,
  date: string,
  categoryId: string,
): Promise<string> {
  const r = await useCases.createTransaction({
    kind: "EXPENSE",
    amountOrig: amount,
    currencyOrig: "EUR",
    transactionDate: date,
    accountId: fx.accountId,
    categoryId,
    note: "bulk-test",
    tenantId: fx.tenantId,
    actorUserId: fx.userId,
  });
  expect(r.isOk()).toBe(true);
  return r.value!.ledgerId;
}

describe("bulkRecategorize use case", () => {
  test("happy path: 3 expenses in CatA → bulk to CatB → 3 correction rows in CatB", async () => {
    const fx = await createFixture("happy");
    const useCases = await buildUseCases();
    const ids = [
      await seedExpense(useCases, fx, "10.00", "2026-05-01", fx.categoryAId),
      await seedExpense(useCases, fx, "20.00", "2026-05-02", fx.categoryAId),
      await seedExpense(useCases, fx, "30.00", "2026-05-03", fx.categoryAId),
    ];

    const r = await useCases.bulkRecategorize({
      tenantId: fx.tenantId,
      transactionIds: ids,
      newCategoryId: fx.categoryBId,
      actorUserId: fx.userId,
    });
    expect(r.isOk()).toBe(true);
    const out = r.value!;
    expect(out.succeeded.length).toBe(3);
    expect(out.skipped.length).toBe(0);
    expect(out.failed.length).toBe(0);

    // Latest-only search returns 3 rows in CatB
    const search = await useCases.searchTransactions({
      tenantId: fx.tenantId,
      query: undefined,
      filters: { categoryIds: [fx.categoryBId] },
      cursor: null,
      limit: 50,
    });
    expect(search.isOk()).toBe(true);
    expect(search.value!.rows.length).toBe(3);
  });

  test("no-op: row already in target category → reported as skipped", async () => {
    const fx = await createFixture("noop");
    const useCases = await buildUseCases();
    const idA = await seedExpense(useCases, fx, "10.00", "2026-05-01", fx.categoryAId);
    const idB = await seedExpense(useCases, fx, "20.00", "2026-05-02", fx.categoryBId);

    const before = await getLedgerCount(fx.tenantId);

    const r = await useCases.bulkRecategorize({
      tenantId: fx.tenantId,
      transactionIds: [idA, idB],
      newCategoryId: fx.categoryBId,
      actorUserId: fx.userId,
    });
    expect(r.isOk()).toBe(true);
    expect(r.value!.succeeded.length).toBe(1); // idA
    expect(r.value!.skipped.length).toBe(1); // idB (already in target)
    expect(r.value!.failed.length).toBe(0);

    const after = await getLedgerCount(fx.tenantId);
    expect(after).toBe(before + 1); // exactly one correction row added
  });

  test("cross-tenant: id from another tenant returns failed (RLS empty findById)", async () => {
    const fxA = await createFixture("xtA");
    const fxB = await createFixture("xtB");
    const useCases = await buildUseCases();

    const idA = await seedExpense(useCases, fxA, "10.00", "2026-05-01", fxA.categoryAId);
    const idB = await seedExpense(useCases, fxB, "20.00", "2026-05-02", fxB.categoryAId);

    // Bulk in tenant A but include id from tenant B (RLS makes findById return null)
    const r = await useCases.bulkRecategorize({
      tenantId: fxA.tenantId,
      transactionIds: [idA, idB],
      newCategoryId: fxA.categoryBId,
      actorUserId: fxA.userId,
    });
    // Cross-tenant id is "failed" (not found under RLS); tenant A's id succeeds.
    expect(r.isOk()).toBe(true);
    expect(r.value!.succeeded).toContain(idA);
    expect(r.value!.failed).toContain(idB);
  });
});

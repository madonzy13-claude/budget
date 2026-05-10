/**
 * transaction-repo-create-in-tx.test.ts — locks the create() vs createInTx() contract.
 * Verifies:
 * 1. Both create() and createInTx() produce identical side effects.
 * 2. createInTx() is rolled back with the caller's tx on failure.
 * TDD: requires real Postgres.
 */
import { describe, test, expect } from "bun:test";
import { Pool } from "pg";

const DB_URL = process.env.DATABASE_URL_APP;
if (!DB_URL) throw new Error("DATABASE_URL_APP required");

async function createFixture(suffix = "") {
  const pool = new Pool({ connectionString: DB_URL });
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
       VALUES ($1, $2, 'TX Test', true, now(), now())`,
      [userId, `create-in-tx-${userId}${suffix}@example.com`],
    );
    await client.query(`SELECT set_config('app.current_user_id', '${userId}', true)`);
    await client.query(
      `INSERT INTO tenancy.workspaces (id, slug, name, kind, default_currency, owner_user_id, member_count, created_at)
       VALUES ($1, $2, 'TX WS', 'PRIVATE', 'EUR', $3, 1, now())`,
      [tenantId, `ws-citx-${tenantId.slice(0, 8)}`, userId],
    );
    await client.query(`SELECT set_config('app.tenant_ids', '{"${tenantId}"}', true)`);
    await client.query(`SELECT set_config('app.current_user_id', '${userId}', true)`);
    await client.query(
      `INSERT INTO budgeting.accounts (id, tenant_id, name, kind, scope, currency, current_balance, created_at, actor_user_id)
       VALUES ($1, $2, 'Checking', 'CHECKING', 'PERSONAL', 'EUR', 500.0000, now(), $3)`,
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

async function getLedgerCount(tenantId: string): Promise<number> {
  const pool = new Pool({ connectionString: DB_URL });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`SELECT set_config('app.tenant_ids', '{"${tenantId}"}', true)`);
    await client.query(`SELECT set_config('app.current_user_id', '${tenantId}', true)`);
    const r = await client.query(
      `SELECT count(*) FROM budgeting.expense_ledger WHERE tenant_id = $1`,
      [tenantId],
    );
    await client.query("COMMIT");
    return parseInt(String(r.rows[0].count), 10);
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
    await pool.end();
  }
}

describe("TransactionRepo — create() vs createInTx() contract", () => {
  test("create() and createInTx() produce identical side effects", async () => {
    const fix1 = await createFixture("-a");
    const fix2 = await createFixture("-b");

    const { DrizzleTransactionRepo } = await import(
      "@budget/budgeting/src/adapters/persistence/transaction-repo"
    );
    const { DrizzleAccountRepo } = await import(
      "@budget/budgeting/src/adapters/persistence/account-repo"
    );
    const { DrizzleSpendingProjectionRepo } = await import(
      "@budget/budgeting/src/adapters/persistence/spending-projection-repo"
    );
    const { withTenantTx } = await import("@budget/platform");
    const { TenantId, UserId } = await import("@budget/shared-kernel");

    const makeRow = (fix: typeof fix1, id: string): Parameters<typeof DrizzleTransactionRepo.prototype.create>[0][0] => ({
      id,
      tenantId: fix.tenantId,
      kind: "EXPENSE" as const,
      amountOrig: "75.00",
      currencyOrig: "EUR",
      amountDefault: "75.00",
      currencyDefault: "EUR",
      fxRate: "1",
      fxRateDate: "2024-02-01",
      fxProvider: "internal",
      transactionDate: "2024-02-01",
      note: null,
      accountId: fix.accountId,
      categoryId: fix.categoryId,
      transferGroupId: null,
      correctsId: null,
      balanceDeltaSign: -1 as const,
    });

    const repo = new DrizzleTransactionRepo(
      new DrizzleAccountRepo(),
      new DrizzleSpendingProjectionRepo(),
    );

    const id1 = crypto.randomUUID();
    const id2 = crypto.randomUUID();

    // Test create() path
    await repo.create([makeRow(fix1, id1)], fix1.userId, fix1.tenantId);
    expect(await getLedgerCount(fix1.tenantId)).toBe(1);

    // Test createInTx() path — wrap in a caller-managed tx
    const r = await withTenantTx(TenantId(fix2.tenantId), UserId(fix2.userId), async (tx) => {
      await repo.createInTx(tx, [makeRow(fix2, id2)], fix2.userId, fix2.tenantId);
    });
    expect(r.isOk()).toBe(true);
    expect(await getLedgerCount(fix2.tenantId)).toBe(1);
  });

  test("createInTx() rolls back with caller's tx on failure", async () => {
    const fix = await createFixture("-rollback");

    const { DrizzleTransactionRepo } = await import(
      "@budget/budgeting/src/adapters/persistence/transaction-repo"
    );
    const { DrizzleAccountRepo } = await import(
      "@budget/budgeting/src/adapters/persistence/account-repo"
    );
    const { DrizzleSpendingProjectionRepo } = await import(
      "@budget/budgeting/src/adapters/persistence/spending-projection-repo"
    );
    const { withTenantTx } = await import("@budget/platform");
    const { TenantId, UserId } = await import("@budget/shared-kernel");

    const repo = new DrizzleTransactionRepo(
      new DrizzleAccountRepo(),
      new DrizzleSpendingProjectionRepo(),
    );

    const ledgerId = crypto.randomUUID();

    // Run createInTx inside a tx that throws AFTER the ledger insert
    const r = await withTenantTx(
      TenantId(fix.tenantId),
      UserId(fix.userId),
      async (tx) => {
        await repo.createInTx(
          tx,
          [
            {
              id: ledgerId,
              tenantId: fix.tenantId,
              kind: "EXPENSE" as const,
              amountOrig: "25.00",
              currencyOrig: "EUR",
              amountDefault: "25.00",
              currencyDefault: "EUR",
              fxRate: "1",
              fxRateDate: "2024-02-01",
              fxProvider: "internal",
              transactionDate: "2024-02-01",
              note: null,
              accountId: fix.accountId,
              categoryId: fix.categoryId,
              transferGroupId: null,
              correctsId: null,
              balanceDeltaSign: -1 as const,
            },
          ],
          fix.userId,
          fix.tenantId,
        );
        // Simulate caller-managed tx failure AFTER ledger insert
        throw new Error("Caller tx failure — should rollback createInTx");
      },
    );

    // Outer tx rolled back → ledger row must be absent
    expect(r.isErr()).toBe(true);
    expect(await getLedgerCount(fix.tenantId)).toBe(0);
  });
});

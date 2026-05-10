/**
 * transaction-ledger-insert.test.ts — Integration tests for DrizzleTransactionRepo.
 * Requires real Postgres at DATABASE_URL_APP.
 * TDD: all 4 side effects (ledger + balance + projection + outbox) verified per row.
 */
import { describe, test, expect, beforeAll } from "bun:test";
import { Pool } from "pg";

const DB_URL = process.env.DATABASE_URL_APP;
if (!DB_URL) throw new Error("DATABASE_URL_APP required");

// Test fixture: create a fresh user + workspace + account + category
async function createFixture(currency = "EUR") {
  const pool = new Pool({ connectionString: DB_URL });
  const client = await pool.connect();
  const userId = crypto.randomUUID();
  const tenantId = crypto.randomUUID();
  const email = `tx-test-${userId}@example.com`;
  const accountId = crypto.randomUUID();
  const categoryId = crypto.randomUUID();

  try {
    await client.query("BEGIN");
    await client.query(`SELECT set_config('app.current_user_id', '${userId}', true)`);
    await client.query(
      `INSERT INTO identity.users (id, email, name, email_verified, created_at, updated_at)
       VALUES ($1, $2, 'TX Test', true, now(), now())`,
      [userId, email],
    );
    await client.query(`SELECT set_config('app.current_user_id', '${userId}', true)`);
    await client.query(
      `INSERT INTO tenancy.workspaces (id, slug, name, kind, default_currency, owner_user_id, member_count, created_at)
       VALUES ($1, $2, 'TX WS', 'PRIVATE', $3, $4, 1, now())`,
      [tenantId, `ws-tx-${tenantId.slice(0, 8)}`, currency, userId],
    );
    // Set tenant context for account insert
    await client.query(`SELECT set_config('app.tenant_ids', '{"${tenantId}"}', true)`);
    await client.query(`SELECT set_config('app.current_user_id', '${userId}', true)`);
    await client.query(
      `INSERT INTO budgeting.accounts (id, tenant_id, name, kind, scope, currency, current_balance, created_at, actor_user_id)
       VALUES ($1, $2, 'Checking', 'CHECKING', 'PERSONAL', $3, 1000.0000, now(), $4)`,
      [accountId, tenantId, currency, userId],
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

  return { userId, tenantId, accountId, categoryId, currency };
}

async function getBalance(tenantId: string, accountId: string): Promise<number> {
  const pool = new Pool({ connectionString: DB_URL });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`SELECT set_config('app.tenant_ids', '{"${tenantId}"}', true)`);
    await client.query(`SELECT set_config('app.current_user_id', '${tenantId}', true)`);
    const r = await client.query(
      `SELECT current_balance::float FROM budgeting.accounts WHERE id = $1`,
      [accountId],
    );
    await client.query("COMMIT");
    return r.rows[0]?.current_balance ?? 0;
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
    await pool.end();
  }
}

async function getLedgerRows(tenantId: string): Promise<Array<Record<string, unknown>>> {
  const pool = new Pool({ connectionString: DB_URL });
  const client = await pool.connect();
  try {
    // All in one tx so transaction-local GUCs are visible to the SELECT
    await client.query("BEGIN");
    await client.query(`SELECT set_config('app.tenant_ids', '{"${tenantId}"}', true)`);
    await client.query(`SELECT set_config('app.current_user_id', '${tenantId}', true)`);
    const r = await client.query(
      `SELECT * FROM budgeting.expense_ledger WHERE tenant_id = $1 ORDER BY created_at`,
      [tenantId],
    );
    await client.query("COMMIT");
    return r.rows;
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
    await pool.end();
  }
}

async function getOutboxRows(tenantId: string): Promise<Array<Record<string, unknown>>> {
  // outbox: worker_role has SELECT, app_role only has INSERT
  // Use DATABASE_URL_WORKER to query outbox
  const workerUrl = process.env.DATABASE_URL_WORKER;
  if (!workerUrl) throw new Error("DATABASE_URL_WORKER required");
  const pool = new Pool({ connectionString: workerUrl });
  const client = await pool.connect();
  try {
    const r = await client.query(
      `SELECT * FROM shared_kernel.outbox WHERE tenant_id = $1`,
      [tenantId],
    );
    return r.rows;
  } finally {
    client.release();
    await pool.end();
  }
}

async function getProjectionRows(tenantId: string): Promise<Array<Record<string, unknown>>> {
  const pool = new Pool({ connectionString: DB_URL });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`SELECT set_config('app.tenant_ids', '{"${tenantId}"}', true)`);
    await client.query(`SELECT set_config('app.current_user_id', '${tenantId}', true)`);
    const r = await client.query(
      `SELECT * FROM budgeting.spending_by_category_month WHERE tenant_id = $1`,
      [tenantId],
    );
    await client.query("COMMIT");
    return r.rows;
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
    await pool.end();
  }
}

describe("DrizzleTransactionRepo.create()", () => {
  test("EXPENSE: all 4 side effects committed atomically", async () => {
    const { userId, tenantId, accountId, categoryId, currency } = await createFixture("EUR");

    const { DrizzleTransactionRepo } = await import(
      "@budget/budgeting/src/adapters/persistence/transaction-repo"
    );
    const { DrizzleAccountRepo } = await import(
      "@budget/budgeting/src/adapters/persistence/account-repo"
    );
    const { DrizzleSpendingProjectionRepo } = await import(
      "@budget/budgeting/src/adapters/persistence/spending-projection-repo"
    );

    const repo = new DrizzleTransactionRepo(
      new DrizzleAccountRepo(),
      new DrizzleSpendingProjectionRepo(),
    );

    const ledgerId = crypto.randomUUID();
    await repo.create(
      [
        {
          id: ledgerId,
          tenantId,
          kind: "EXPENSE",
          amountOrig: "100.00",
          currencyOrig: "EUR",
          amountDefault: "100.00",
          currencyDefault: "EUR",
          fxRate: "1",
          fxRateDate: "2024-01-15",
          fxProvider: "internal",
          transactionDate: "2024-01-15",
          note: "Test expense",
          accountId,
          categoryId,
          transferGroupId: null,
          correctsId: null,
          balanceDeltaSign: -1,
        },
      ],
      userId,
      tenantId,
    );

    // Side effect 1: ledger row exists
    const ledgerRows = await getLedgerRows(tenantId);
    expect(ledgerRows.length).toBe(1);
    expect(ledgerRows[0].id).toBe(ledgerId);
    expect(ledgerRows[0].kind).toBe("EXPENSE");

    // Side effect 2: balance decremented
    const balance = await getBalance(tenantId, accountId);
    expect(balance).toBeCloseTo(900, 1); // 1000 - 100 = 900

    // Side effect 3: projection upserted
    const projectionRows = await getProjectionRows(tenantId);
    expect(projectionRows.length).toBe(1);
    expect(projectionRows[0].category_id).toBe(categoryId);
    expect(parseFloat(String(projectionRows[0].normal_amount))).toBeCloseTo(100, 1);

    // Side effect 4: outbox row exists
    const outboxRows = await getOutboxRows(tenantId);
    expect(outboxRows.length).toBeGreaterThanOrEqual(1);
  });

  test("TRANSFER: two rows with same transfer_group_id, no projection", async () => {
    const { userId, tenantId, accountId } = await createFixture("EUR");

    // Create second account for transfer destination
    const pool = new Pool({ connectionString: DB_URL });
    const client = await pool.connect();
    const toAccountId = crypto.randomUUID();
    try {
      await client.query("BEGIN");
      await client.query(`SELECT set_config('app.tenant_ids', '{"${tenantId}"}', true)`);
      await client.query(`SELECT set_config('app.current_user_id', '${userId}', true)`);
      await client.query(
        `INSERT INTO budgeting.accounts (id, tenant_id, name, kind, scope, currency, current_balance, created_at, actor_user_id)
         VALUES ($1, $2, 'Savings', 'SAVINGS', 'PERSONAL', 'EUR', 0.0000, now(), $3)`,
        [toAccountId, tenantId, userId],
      );
      await client.query("COMMIT");
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
      await pool.end();
    }

    const { DrizzleTransactionRepo } = await import(
      "@budget/budgeting/src/adapters/persistence/transaction-repo"
    );
    const { DrizzleAccountRepo } = await import(
      "@budget/budgeting/src/adapters/persistence/account-repo"
    );
    const { DrizzleSpendingProjectionRepo } = await import(
      "@budget/budgeting/src/adapters/persistence/spending-projection-repo"
    );

    const repo = new DrizzleTransactionRepo(
      new DrizzleAccountRepo(),
      new DrizzleSpendingProjectionRepo(),
    );

    const transferGroupId = crypto.randomUUID();
    const fromLegId = crypto.randomUUID();
    const toLegId = crypto.randomUUID();

    await repo.create(
      [
        {
          id: fromLegId,
          tenantId,
          kind: "TRANSFER",
          amountOrig: "200.00",
          currencyOrig: "EUR",
          amountDefault: "200.00",
          currencyDefault: "EUR",
          fxRate: "1",
          fxRateDate: "2024-01-15",
          fxProvider: "internal",
          transactionDate: "2024-01-15",
          note: null,
          accountId,
          categoryId: null,
          transferGroupId,
          correctsId: null,
          balanceDeltaSign: -1,
        },
        {
          id: toLegId,
          tenantId,
          kind: "TRANSFER",
          amountOrig: "200.00",
          currencyOrig: "EUR",
          amountDefault: "200.00",
          currencyDefault: "EUR",
          fxRate: "1",
          fxRateDate: "2024-01-15",
          fxProvider: "internal",
          transactionDate: "2024-01-15",
          note: null,
          accountId: toAccountId,
          categoryId: null,
          transferGroupId,
          correctsId: null,
          balanceDeltaSign: 1,
        },
      ],
      userId,
      tenantId,
    );

    const ledgerRows = await getLedgerRows(tenantId);
    expect(ledgerRows.length).toBe(2);
    expect(ledgerRows[0].transfer_group_id).toBe(transferGroupId);
    expect(ledgerRows[1].transfer_group_id).toBe(transferGroupId);

    // No projection for TRANSFER
    const projectionRows = await getProjectionRows(tenantId);
    expect(projectionRows.length).toBe(0);

    // From-account debited, to-account credited
    const fromBalance = await getBalance(tenantId, accountId);
    const toBalance = await getBalance(tenantId, toAccountId);
    expect(fromBalance).toBeCloseTo(800, 1); // 1000 - 200
    expect(toBalance).toBeCloseTo(200, 1); // 0 + 200
  });

  test("atomicity: if projection fails mid-tx, ledger row absent", async () => {
    const { userId, tenantId, accountId, categoryId } = await createFixture("EUR");

    const { DrizzleTransactionRepo } = await import(
      "@budget/budgeting/src/adapters/persistence/transaction-repo"
    );
    const { DrizzleAccountRepo } = await import(
      "@budget/budgeting/src/adapters/persistence/account-repo"
    );

    // Mock projection repo that throws
    const failingProjectionRepo = {
      upsert: async () => {
        throw new Error("Simulated projection failure");
      },
    };

    const repo = new DrizzleTransactionRepo(
      new DrizzleAccountRepo(),
      failingProjectionRepo as any,
    );

    const ledgerId = crypto.randomUUID();
    await expect(
      repo.create(
        [
          {
            id: ledgerId,
            tenantId,
            kind: "EXPENSE",
            amountOrig: "50.00",
            currencyOrig: "EUR",
            amountDefault: "50.00",
            currencyDefault: "EUR",
            fxRate: "1",
            fxRateDate: "2024-01-15",
            fxProvider: "internal",
            transactionDate: "2024-01-15",
            note: null,
            accountId,
            categoryId,
            transferGroupId: null,
            correctsId: null,
            balanceDeltaSign: -1,
          },
        ],
        userId,
        tenantId,
      ),
    ).rejects.toThrow("Simulated projection failure");

    // Ledger row must be absent (rolled back)
    const ledgerRows = await getLedgerRows(tenantId);
    expect(ledgerRows.length).toBe(0);
  });
});

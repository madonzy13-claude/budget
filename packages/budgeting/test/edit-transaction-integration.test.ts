/**
 * edit-transaction-integration.test.ts — Integration tests for editTransaction use case.
 * Requires real Postgres at DATABASE_URL_APP.
 * TDD RED: fails until editTransaction use case + insertCorrection adapter are implemented.
 */
import { describe, test, expect, beforeAll } from "bun:test";
import { Pool } from "pg";

const DB_URL = process.env.DATABASE_URL_APP;
if (!DB_URL) throw new Error("DATABASE_URL_APP required");

// Substitute Docker hostname → localhost
if (process.env.DATABASE_URL_WORKER) {
  process.env.DATABASE_URL_WORKER = process.env.DATABASE_URL_WORKER.replace("@db:", "@localhost:");
}
process.env.DATABASE_URL_APP = DB_URL.replace("@db:", "@localhost:");
const { resetPools } = await import("@budget/platform");
resetPools();

async function createFixture(currency = "EUR") {
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
       VALUES ($1, $2, 'EditTx Test', true, now(), now())`,
      [userId, `edit-uc-${userId}@example.com`],
    );
    await client.query(
      `INSERT INTO tenancy.workspaces (id, slug, name, kind, default_currency, owner_user_id, member_count, created_at)
       VALUES ($1, $2, 'EditUC WS', 'PRIVATE', $3, $4, 1, now())`,
      [tenantId, `ws-uc-${tenantId.slice(0, 8)}`, currency, userId],
    );
    await client.query(`SELECT set_config('app.tenant_ids', '{"${tenantId}"}', true)`);
    await client.query(`SELECT set_config('app.current_user_id', '${userId}', true)`);
    await client.query(
      `INSERT INTO budgeting.accounts (id, tenant_id, name, kind, scope, currency, current_balance, created_at, actor_user_id)
       VALUES ($1, $2, 'Checking', 'CHECKING', 'PERSONAL', $3, 10000.0000, now(), $4)`,
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

  return { userId, tenantId, accountId, categoryId };
}

async function getBalance(tenantId: string, accountId: string): Promise<number> {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL_APP });
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
  } finally {
    client.release();
    await pool.end();
  }
}

async function getLedgerRows(tenantId: string): Promise<Array<Record<string, unknown>>> {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL_APP });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`SELECT set_config('app.tenant_ids', '{"${tenantId}"}', true)`);
    await client.query(`SELECT set_config('app.current_user_id', '${tenantId}', true)`);
    const r = await client.query(
      `SELECT * FROM budgeting.expense_ledger WHERE tenant_id = $1 ORDER BY created_at`,
      [tenantId],
    );
    await client.query("COMMIT");
    return r.rows;
  } finally {
    client.release();
    await pool.end();
  }
}

async function buildUseCases(tenantId: string) {
  const { createBudgetingModule } = await import("@budget/budgeting/src/contracts/factory");
  const { DrizzleFxRateCacheRepo } = await import(
    "@budget/budgeting/src/adapters/persistence/fx-rate-cache-repo"
  );
  const { workerPool } = await import("@budget/platform");

  const fxCache = new DrizzleFxRateCacheRepo(workerPool());
  return createBudgetingModule({ fxCache });
}

describe("editTransaction use case", () => {
  let userId: string;
  let tenantId: string;
  let accountId: string;
  let categoryId: string;
  let useCases: Awaited<ReturnType<typeof buildUseCases>>;

  beforeAll(async () => {
    const f = await createFixture("EUR");
    userId = f.userId;
    tenantId = f.tenantId;
    accountId = f.accountId;
    categoryId = f.categoryId;
    useCases = await buildUseCases(tenantId);
  });

  test("happy path: create EXPENSE → edit amount → 2 rows, latest has new amount", async () => {
    // Create original
    const createResult = await useCases.createTransaction({
      kind: "EXPENSE",
      amountOrig: "100.00",
      currencyOrig: "EUR",
      transactionDate: "2026-05-01",
      accountId,
      categoryId,
      note: "Original",
      tenantId,
      actorUserId: userId,
    });
    expect(createResult.isOk()).toBe(true);
    const { ledgerId: originalId } = createResult.value!;

    const balanceBefore = await getBalance(tenantId, accountId);

    // Edit amount
    const editResult = await useCases.editTransaction({
      transactionId: originalId,
      edits: { amountOrig: "150.00", amountDefault: "150.00" },
      actorUserId: userId,
      tenantId,
    });
    expect(editResult.isOk()).toBe(true);
    const { correctionId } = editResult.value!;
    expect(correctionId).toBeDefined();

    // 2 ledger rows
    const rows = await getLedgerRows(tenantId);
    const relevantRows = rows.filter(r => r.id === originalId || r.corrects_id === originalId);
    expect(relevantRows.length).toBe(2);

    // Original row unchanged
    const origRow = relevantRows.find(r => r.id === originalId)!;
    expect(parseFloat(String(origRow.amount_orig))).toBeCloseTo(100, 1);
    expect(origRow.corrects_id).toBeNull();

    // Correction row
    const corrRow = relevantRows.find(r => r.id === correctionId)!;
    expect(corrRow.corrects_id).toBe(originalId);
    expect(parseFloat(String(corrRow.amount_orig))).toBeCloseTo(150, 1);

    // Balance delta: -100 original → -150 correction = net -50
    const balanceAfter = await getBalance(tenantId, accountId);
    expect(balanceAfter).toBeCloseTo(balanceBefore - 50, 1);
  });

  test("edit twice → chain length 3", async () => {
    const createResult = await useCases.createTransaction({
      kind: "EXPENSE",
      amountOrig: "50.00",
      currencyOrig: "EUR",
      transactionDate: "2026-05-02",
      accountId,
      categoryId,
      note: "Chain test",
      tenantId,
      actorUserId: userId,
    });
    expect(createResult.isOk()).toBe(true);
    const { ledgerId: originalId } = createResult.value!;

    // First edit
    const e1 = await useCases.editTransaction({
      transactionId: originalId,
      edits: { note: "First edit" },
      actorUserId: userId,
      tenantId,
    });
    expect(e1.isOk()).toBe(true);
    const { correctionId: c1Id } = e1.value!;

    // Second edit (on first correction)
    const e2 = await useCases.editTransaction({
      transactionId: c1Id,
      edits: { note: "Second edit" },
      actorUserId: userId,
      tenantId,
    });
    expect(e2.isOk()).toBe(true);

    // Get history
    const histResult = await useCases.getTransactionHistory({
      tenantId,
      transactionId: originalId,
    });
    expect(histResult.isOk()).toBe(true);
    expect(histResult.value!.length).toBe(3);
    // Ordered oldest first
    expect(histResult.value![0].correctsId).toBeNull();
    expect(histResult.value![1].correctsId).toBe(originalId);
  });

  test("AlreadyCorrected: correcting same original twice → error", async () => {
    const createResult = await useCases.createTransaction({
      kind: "EXPENSE",
      amountOrig: "75.00",
      currencyOrig: "EUR",
      transactionDate: "2026-05-03",
      accountId,
      categoryId,
      tenantId,
      actorUserId: userId,
    });
    expect(createResult.isOk()).toBe(true);
    const { ledgerId: originalId } = createResult.value!;

    // First correction succeeds
    const e1 = await useCases.editTransaction({
      transactionId: originalId,
      edits: { note: "First correction" },
      actorUserId: userId,
      tenantId,
    });
    expect(e1.isOk()).toBe(true);

    // Second correction on same original → AlreadyCorrected error
    const e2 = await useCases.editTransaction({
      transactionId: originalId,
      edits: { note: "Second attempt on original" },
      actorUserId: userId,
      tenantId,
    });
    expect(e2.isErr()).toBe(true);
    expect((e2.error as { kind: string }).kind).toBe("AlreadyCorrected");
  });

  test("edit non-existent → TransactionNotFound error", async () => {
    const result = await useCases.editTransaction({
      transactionId: crypto.randomUUID(),
      edits: { note: "Ghost" },
      actorUserId: userId,
      tenantId,
    });
    expect(result.isErr()).toBe(true);
    expect((result.error as { kind: string }).kind).toBe("TransactionNotFound");
  });

  test("getTransactionHistory for uncorrected row → chain length 1", async () => {
    const createResult = await useCases.createTransaction({
      kind: "EXPENSE",
      amountOrig: "25.00",
      currencyOrig: "EUR",
      transactionDate: "2026-05-04",
      accountId,
      tenantId,
      actorUserId: userId,
    });
    expect(createResult.isOk()).toBe(true);
    const { ledgerId } = createResult.value!;

    const histResult = await useCases.getTransactionHistory({ tenantId, transactionId: ledgerId });
    expect(histResult.isOk()).toBe(true);
    expect(histResult.value!.length).toBe(1);
  });

  test("original row fields unchanged after edit (deep equality check)", async () => {
    const createResult = await useCases.createTransaction({
      kind: "EXPENSE",
      amountOrig: "60.00",
      currencyOrig: "EUR",
      transactionDate: "2026-05-05",
      accountId,
      categoryId,
      note: "Immutable original",
      tenantId,
      actorUserId: userId,
    });
    expect(createResult.isOk()).toBe(true);
    const { ledgerId: originalId } = createResult.value!;

    // Capture original row state
    const rowsBefore = await getLedgerRows(tenantId);
    const originalRow = rowsBefore.find(r => r.id === originalId)!;
    const snapshotedOrig = { ...originalRow };

    // Edit
    await useCases.editTransaction({
      transactionId: originalId,
      edits: { amountOrig: "80.00", amountDefault: "80.00" },
      actorUserId: userId,
      tenantId,
    });

    // Re-fetch original and compare key fields
    const rowsAfter = await getLedgerRows(tenantId);
    const originalRowAfter = rowsAfter.find(r => r.id === originalId)!;
    expect(String(originalRowAfter.amount_orig)).toBe(String(snapshotedOrig.amount_orig));
    expect(originalRowAfter.note).toBe(snapshotedOrig.note);
    expect(originalRowAfter.corrects_id).toBeNull();
    // Created_at must not change
    expect(String(originalRowAfter.created_at)).toBe(String(snapshotedOrig.created_at));
  });
});

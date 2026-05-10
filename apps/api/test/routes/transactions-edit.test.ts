/**
 * transactions-edit.test.ts — Integration tests for /transactions/:id/correct and :id/history.
 * Requires real Postgres at DATABASE_URL_APP.
 * TDD RED: fails until editTransaction use case + routes are implemented.
 */
import { describe, it, expect, beforeAll } from "bun:test";
import { Hono } from "hono";
import { Pool } from "pg";

const DB_URL = process.env.DATABASE_URL_APP;
if (!DB_URL) throw new Error("DATABASE_URL_APP required");

// Substitute Docker hostname → localhost
const DB_URL_WORKER_RAW = process.env.DATABASE_URL_WORKER;
if (DB_URL_WORKER_RAW) {
  process.env.DATABASE_URL_WORKER = DB_URL_WORKER_RAW.replace("@db:", "@localhost:");
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
       VALUES ($1, $2, 'Edit Test', true, now(), now())`,
      [userId, `edit-test-${userId}@example.com`],
    );
    await client.query(
      `INSERT INTO tenancy.workspaces (id, slug, name, kind, default_currency, owner_user_id, member_count, created_at)
       VALUES ($1, $2, 'Edit WS', 'PRIVATE', $3, $4, 1, now())`,
      [tenantId, `ws-edit-${tenantId.slice(0, 8)}`, currency, userId],
    );
    await client.query(`SELECT set_config('app.tenant_ids', '{"${tenantId}"}', true)`);
    await client.query(`SELECT set_config('app.current_user_id', '${userId}', true)`);
    await client.query(
      `INSERT INTO budgeting.accounts (id, tenant_id, name, kind, scope, currency, current_balance, created_at, actor_user_id)
       VALUES ($1, $2, 'Checking', 'CHECKING', 'PERSONAL', $3, 5000.0000, now(), $4)`,
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

async function buildApp(userId: string, tenantId: string) {
  const { createTransactionsRoute } = await import("../../src/routes/transactions");
  const { createBudgetingModule } = await import("@budget/budgeting/src/contracts/factory");
  const { DrizzleFxRateCacheRepo } = await import(
    "@budget/budgeting/src/adapters/persistence/fx-rate-cache-repo"
  );
  const { workerPool, createIdempotencyMiddleware } = await import("@budget/platform");

  const fxCache = new DrizzleFxRateCacheRepo(workerPool());
  const budgeting = createBudgetingModule({ fxCache });
  const deps = { budgeting } as any;

  const app = new Hono();
  app.use(async (c, next) => {
    c.set("session", { user: { id: userId } });
    c.set("tenantId", tenantId);
    c.set("tenantIds", [tenantId]);
    c.set("userId", userId);
    await next();
  });
  app.use(createIdempotencyMiddleware());
  app.route("/transactions", createTransactionsRoute(deps));
  return app;
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

async function createExpense(app: Awaited<ReturnType<typeof buildApp>>, accountId: string, categoryId: string, amount = "100.00") {
  const res = await app.request("/transactions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": crypto.randomUUID(),
    },
    body: JSON.stringify({
      kind: "EXPENSE",
      amountOrig: amount,
      currencyOrig: "EUR",
      transactionDate: "2026-05-01",
      accountId,
      categoryId,
      note: "Coffee",
    }),
  });
  expect(res.status).toBe(201);
  return (await res.json()) as { ledgerId: string; fxRateUsed: unknown };
}

describe("POST /transactions/:id/correct", () => {
  let userId: string;
  let tenantId: string;
  let accountId: string;
  let categoryId: string;
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeAll(async () => {
    const f = await createFixture("EUR");
    userId = f.userId;
    tenantId = f.tenantId;
    accountId = f.accountId;
    categoryId = f.categoryId;
    app = await buildApp(userId, tenantId);
  });

  it("happy path: edit amount → 201 correctionId + 2 ledger rows + original unchanged", async () => {
    const { ledgerId: originalId } = await createExpense(app, accountId, categoryId, "100.00");
    const balanceBefore = await getBalance(tenantId, accountId);

    // Fetch the original row to verify it's unchanged later
    const rowsBefore = await getLedgerRows(tenantId);
    const originalRow = rowsBefore.find(r => r.id === originalId)!;

    const res = await app.request(`/transactions/${originalId}/correct`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": crypto.randomUUID(),
      },
      body: JSON.stringify({
        edits: {
          amountOrig: "150.00",
          amountDefault: "150.00",
        },
      }),
    });

    expect(res.status).toBe(201);
    const body = await res.json() as { correctionId: string; fxRateUsed?: unknown };
    expect(body.correctionId).toBeDefined();
    expect(body.correctionId).not.toBe(originalId);

    // 2 ledger rows: original + correction
    const allRows = await getLedgerRows(tenantId);
    // Filter for this tenant's correction rows
    const rows = allRows.filter(r => r.id === originalId || r.corrects_id === originalId);
    expect(rows.length).toBe(2);

    // Original row UNCHANGED (T-2-07-01 — UPDATE is REVOKE'd)
    const originalRowAfter = allRows.find(r => r.id === originalId)!;
    expect(String(originalRowAfter.amount_orig)).toBe(String(originalRow.amount_orig));
    expect(originalRowAfter.corrects_id).toBeNull();

    // Correction row points to original
    const correctionRow = allRows.find(r => r.id === body.correctionId)!;
    expect(correctionRow.corrects_id).toBe(originalId);
    expect(parseFloat(String(correctionRow.amount_orig))).toBeCloseTo(150, 1);

    // Balance delta: was -100, now -150 → net -50 more
    const balanceAfter = await getBalance(tenantId, accountId);
    expect(balanceAfter).toBeCloseTo(balanceBefore - 50, 1);
  });

  it("edit note only → 201 correctionId, amount unchanged, balance unchanged", async () => {
    const { ledgerId: originalId } = await createExpense(app, accountId, categoryId, "200.00");
    const balanceBefore = await getBalance(tenantId, accountId);

    const res = await app.request(`/transactions/${originalId}/correct`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": crypto.randomUUID(),
      },
      body: JSON.stringify({
        edits: { note: "Edited note" },
      }),
    });

    expect(res.status).toBe(201);
    const body = await res.json() as { correctionId: string };
    expect(body.correctionId).toBeDefined();

    // Balance unchanged (note edit, no amount change)
    const balanceAfter = await getBalance(tenantId, accountId);
    expect(balanceAfter).toBeCloseTo(balanceBefore, 1);

    // Correction row has new note
    const rows = await getLedgerRows(tenantId);
    const corrRow = rows.find(r => r.id === body.correctionId)!;
    expect(corrRow.note).toBe("Edited note");
    expect(parseFloat(String(corrRow.amount_orig))).toBeCloseTo(200, 1);
  });

  it("edit twice → chain length 3", async () => {
    const { ledgerId: originalId } = await createExpense(app, accountId, categoryId, "50.00");

    // First correction
    const res1 = await app.request(`/transactions/${originalId}/correct`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": crypto.randomUUID(),
      },
      body: JSON.stringify({ edits: { note: "First edit" } }),
    });
    expect(res1.status).toBe(201);
    const { correctionId: corrId1 } = await res1.json() as { correctionId: string };

    // Second correction on the FIRST correction (chain tip)
    const res2 = await app.request(`/transactions/${corrId1}/correct`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": crypto.randomUUID(),
      },
      body: JSON.stringify({ edits: { note: "Second edit" } }),
    });
    expect(res2.status).toBe(201);

    // History for original shows 3 rows
    const histRes = await app.request(`/transactions/${originalId}/history`);
    expect(histRes.status).toBe(200);
    const { chain } = await histRes.json() as { chain: unknown[] };
    expect(chain.length).toBe(3);
  });

  it("correct already-corrected row → 409 AlreadyCorrected", async () => {
    const { ledgerId: originalId } = await createExpense(app, accountId, categoryId, "75.00");

    // First correction succeeds
    await app.request(`/transactions/${originalId}/correct`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": crypto.randomUUID(),
      },
      body: JSON.stringify({ edits: { note: "Correction 1" } }),
    });

    // Second correction on same original → 409
    const res2 = await app.request(`/transactions/${originalId}/correct`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": crypto.randomUUID(),
      },
      body: JSON.stringify({ edits: { note: "Correction 2" } }),
    });
    expect(res2.status).toBe(409);
    const body = await res2.json() as { error: string };
    expect(body.error).toMatch(/already_corrected/i);
  });

  it("correct non-existent id → 404", async () => {
    const res = await app.request(`/transactions/${crypto.randomUUID()}/correct`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": crypto.randomUUID(),
      },
      body: JSON.stringify({ edits: { note: "Ghost edit" } }),
    });
    expect(res.status).toBe(404);
  });
});

describe("GET /transactions/:id/history", () => {
  let userId: string;
  let tenantId: string;
  let accountId: string;
  let categoryId: string;
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeAll(async () => {
    const f = await createFixture("EUR");
    userId = f.userId;
    tenantId = f.tenantId;
    accountId = f.accountId;
    categoryId = f.categoryId;
    app = await buildApp(userId, tenantId);
  });

  it("returns single-row chain for uncorrected transaction", async () => {
    const { ledgerId } = await createExpense(app, accountId, categoryId, "88.00");
    const res = await app.request(`/transactions/${ledgerId}/history`);
    expect(res.status).toBe(200);
    const { chain } = await res.json() as { chain: unknown[] };
    expect(chain.length).toBe(1);
  });

  it("returns ordered chain (original first, latest last)", async () => {
    const { ledgerId: originalId } = await createExpense(app, accountId, categoryId, "33.00");

    await app.request(`/transactions/${originalId}/correct`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": crypto.randomUUID(),
      },
      body: JSON.stringify({ edits: { note: "Chain test" } }),
    });

    const res = await app.request(`/transactions/${originalId}/history`);
    expect(res.status).toBe(200);
    const { chain } = await res.json() as { chain: Array<{ correctsId: string | null; amountOrig: string }> };

    expect(chain.length).toBe(2);
    // Original first
    expect(chain[0].correctsId).toBeNull();
    // Correction last
    expect(chain[1].correctsId).toBe(originalId);
  });

  it("returns 404 for non-existent transaction", async () => {
    const res = await app.request(`/transactions/${crypto.randomUUID()}/history`);
    expect(res.status).toBe(404);
  });
});

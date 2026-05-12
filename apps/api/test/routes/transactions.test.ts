/**
 * transactions.test.ts — Integration tests for /budgets/{id}/transactions v1.1 routes.
 * RED: written before implementation. Tests will fail until Task 2b + Task 3 land.
 *
 * TXN-01..08: categorical-only, FX-on-PATCH, confirmed_at, kind SPENDING|INCOME.
 * D-PH2-08: unified drafts + confirmed under one transactions resource.
 * D-PH2-09: negative amount → INCOME kind.
 */
import { describe, it, expect, beforeAll } from "bun:test";
import { Hono } from "hono";
import { Pool } from "pg";

const DB_URL = process.env.DATABASE_URL_APP;
if (!DB_URL) throw new Error("DATABASE_URL_APP required");

const DB_URL_WORKER_RAW = process.env.DATABASE_URL_WORKER;
if (DB_URL_WORKER_RAW) {
  process.env.DATABASE_URL_WORKER = DB_URL_WORKER_RAW.replace("@db:", "@localhost:");
}
process.env.DATABASE_URL_APP = DB_URL.replace("@db:", "@localhost:");
const { resetPools } = await import("@budget/platform");
resetPools();

// ──────────────────────────────────────────────────────────────────────
// Fixture helpers
// ──────────────────────────────────────────────────────────────────────

async function createTestFixture(currency = "EUR") {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL_APP });
  const client = await pool.connect();
  const userId = crypto.randomUUID();
  const budgetId = crypto.randomUUID();
  const categoryId = crypto.randomUUID();

  try {
    await client.query("BEGIN");
    await client.query(
      `INSERT INTO identity.users (id, email, name, email_verified, created_at, updated_at)
       VALUES ($1, $2, 'TX v1.1 Test', true, now(), now())`,
      [userId, `tx-v11-${userId}@example.com`],
    );
    await client.query(
      `INSERT INTO tenancy.budgets (id, slug, name, kind, default_currency, owner_user_id, member_count, created_at)
       VALUES ($1, $2, 'TX v1.1 Budget', 'PRIVATE', $3, $4, 1, now())`,
      [budgetId, `ws-txv11-${budgetId.slice(0, 8)}`, currency, userId],
    );
    await client.query(`SELECT set_config('app.tenant_ids', '{"${budgetId}"}', true)`);
    await client.query(`SELECT set_config('app.current_user_id', '${userId}', true)`);
    await client.query(
      `INSERT INTO budgeting.categories (id, tenant_id, name, created_at, actor_user_id)
       VALUES ($1, $2, 'Food', now(), $3)`,
      [categoryId, budgetId, userId],
    );
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
    await pool.end();
  }

  return { userId, budgetId, categoryId };
}

async function buildApp(userId: string, budgetId: string) {
  const { createTransactionsRoute } = await import("../../src/routes/transactions");
  const { StubFxProvider } = await import("../fixtures/fx-provider");

  // Build a minimal deps object wiring the new v1.1 transaction route
  // The route factory (Task 3) will accept { fxProvider, budgetRepo, transactionRepo, ... }
  // For now, this structure intentionally causes a compile/runtime failure (RED).
  const fxProvider = new StubFxProvider();

  const deps = {
    fxProvider,
  } as any;

  const app = new Hono();
  app.use(async (c, next) => {
    c.set("session", { user: { id: userId } });
    c.set("tenantId", budgetId);
    c.set("tenantIds", [budgetId]);
    c.set("userId", userId);
    await next();
  });
  app.route("/budgets/:budgetId/transactions", createTransactionsRoute(deps));
  return app;
}

// ──────────────────────────────────────────────────────────────────────
// Test suite
// ──────────────────────────────────────────────────────────────────────

let testUserId: string;
let testBudgetId: string;
let testCategoryId: string;

describe("POST /budgets/:budgetId/transactions", () => {
  beforeAll(async () => {
    const f = await createTestFixture("EUR");
    testUserId = f.userId;
    testBudgetId = f.budgetId;
    testCategoryId = f.categoryId;
  });

  it("creates SPENDING transaction → 201 with FX fields", async () => {
    const app = await buildApp(testUserId, testBudgetId);
    const res = await app.request(`/budgets/${testBudgetId}/transactions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        date: "2026-05-11",
        category_id: testCategoryId,
        amount_original_cents: 596,
        currency_original: "USD",
      }),
    });
    expect(res.status).toBe(201);
    const body = await res.json() as { transaction: Record<string, unknown> };
    const tx = body.transaction;
    expect(tx.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(tx.date).toBe("2026-05-11");
    expect(tx.category_id).toBe(testCategoryId);
    expect(tx.amount_original_cents).toBe("596");
    expect(tx.currency_original).toBe("USD");
    // FX fields must be present
    expect(tx.amount_converted_cents).toBeDefined();
    expect(tx.fx_rate).toBeDefined();
    expect(tx.fx_as_of).toBe("2026-05-11");
    expect(tx.kind).toBe("SPENDING");
    // confirmed_at must be set (quick-entry is auto-confirmed)
    expect(tx.confirmed_at).toBeTruthy();
    expect(tx.recurring_rule_id).toBeNull();
  });

  it("omitting currency_original defaults to budget currency with fx_rate='1'", async () => {
    const app = await buildApp(testUserId, testBudgetId);
    const res = await app.request(`/budgets/${testBudgetId}/transactions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        date: "2026-05-11",
        category_id: testCategoryId,
        amount_original_cents: 1000,
        // currency_original omitted → defaults to budget.currency
      }),
    });
    expect(res.status).toBe(201);
    const body = await res.json() as { transaction: Record<string, unknown> };
    const tx = body.transaction;
    expect(tx.fx_rate).toBe("1");
    expect(tx.amount_converted_cents).toBe(tx.amount_original_cents);
  });

  it("negative amount_original_cents flips kind to INCOME and stores positive", async () => {
    const app = await buildApp(testUserId, testBudgetId);
    const res = await app.request(`/budgets/${testBudgetId}/transactions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        date: "2026-05-11",
        category_id: testCategoryId,
        amount_original_cents: -596,
        currency_original: "USD",
      }),
    });
    expect(res.status).toBe(201);
    const body = await res.json() as { transaction: Record<string, unknown> };
    const tx = body.transaction;
    expect(tx.kind).toBe("INCOME");
    // stored as positive in DB
    expect(Number(tx.amount_original_cents)).toBeGreaterThan(0);
    expect(Number(tx.amount_original_cents)).toBe(596);
  });
});

describe("PATCH /budgets/:budgetId/transactions/:txId", () => {
  let createdTxId: string;
  let oldFxRate: string;
  let patchUserId: string;
  let patchBudgetId: string;
  let patchCategoryId: string;

  beforeAll(async () => {
    const f = await createTestFixture("EUR");
    patchUserId = f.userId;
    patchBudgetId = f.budgetId;
    patchCategoryId = f.categoryId;

    // Create a transaction to patch
    const app = await buildApp(patchUserId, patchBudgetId);
    const res = await app.request(`/budgets/${patchBudgetId}/transactions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        date: "2026-05-11",
        category_id: patchCategoryId,
        amount_original_cents: 1000,
        currency_original: "USD",
      }),
    });
    const body = await res.json() as { transaction: Record<string, unknown> };
    createdTxId = body.transaction.id as string;
    oldFxRate = body.transaction.fx_rate as string;
  });

  it("PATCH with currency_original change triggers FX re-compute", async () => {
    const app = await buildApp(patchUserId, patchBudgetId);
    const res = await app.request(
      `/budgets/${patchBudgetId}/transactions/${createdTxId}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currency_original: "GBP" }),
      },
    );
    expect(res.status).toBe(200);
    const body = await res.json() as { transaction: Record<string, unknown> };
    const tx = body.transaction;
    // GBP→EUR rate (1.10) must differ from USD→EUR rate (0.84)
    expect(tx.fx_rate).not.toBe(oldFxRate);
    expect(tx.currency_original).toBe("GBP");
    // amount_converted_cents recomputed
    expect(tx.amount_converted_cents).toBeDefined();
    expect(tx.fx_as_of).toBe("2026-05-11");
  });

  it("PATCH with date change updates fx_as_of and recomputes", async () => {
    const app = await buildApp(patchUserId, patchBudgetId);
    const res = await app.request(
      `/budgets/${patchBudgetId}/transactions/${createdTxId}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: "2026-04-01" }),
      },
    );
    expect(res.status).toBe(200);
    const body = await res.json() as { transaction: Record<string, unknown> };
    const tx = body.transaction;
    // fx_as_of must equal the new date
    expect(tx.fx_as_of).toBe("2026-04-01");
    // USD→EUR rate on 2026-04-01 is 0.80, different from 0.84 on 2026-05-11
    expect(tx.fx_rate).not.toBe("0.84");
  });

  it("PATCH note-only does not trigger FX re-compute", async () => {
    const app = await buildApp(patchUserId, patchBudgetId);
    // Get current state
    const getRes = await app.request(
      `/budgets/${patchBudgetId}/transactions/${createdTxId}`,
    );
    const beforeBody = await getRes.json() as { transaction: Record<string, unknown> };
    const beforeFxRate = beforeBody.transaction.fx_rate;
    const beforeFxAsOf = beforeBody.transaction.fx_as_of;

    const res = await app.request(
      `/budgets/${patchBudgetId}/transactions/${createdTxId}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note: "updated note" }),
      },
    );
    expect(res.status).toBe(200);
    const body = await res.json() as { transaction: Record<string, unknown> };
    const tx = body.transaction;
    // FX fields unchanged
    expect(tx.fx_rate).toBe(beforeFxRate);
    expect(tx.fx_as_of).toBe(beforeFxAsOf);
    expect(tx.note).toBe("updated note");
  });
});

describe("GET /budgets/:budgetId/transactions", () => {
  let listUserId: string;
  let listBudgetId: string;
  let listCategoryId: string;

  beforeAll(async () => {
    const f = await createTestFixture("EUR");
    listUserId = f.userId;
    listBudgetId = f.budgetId;
    listCategoryId = f.categoryId;

    // Create a confirmed and a draft transaction
    const app = await buildApp(listUserId, listBudgetId);
    // Quick-entry = auto-confirmed
    await app.request(`/budgets/${listBudgetId}/transactions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        date: "2026-05-10",
        category_id: listCategoryId,
        amount_original_cents: 200,
      }),
    });
  });

  it("GET ?month=2026-05 returns confirmed transactions", async () => {
    const app = await buildApp(listUserId, listBudgetId);
    const res = await app.request(
      `/budgets/${listBudgetId}/transactions?month=2026-05`,
    );
    expect(res.status).toBe(200);
    const body = await res.json() as { transactions: unknown[] };
    expect(Array.isArray(body.transactions)).toBe(true);
    // Each confirmed txn has confirmed_at set
    for (const tx of body.transactions as Array<Record<string, unknown>>) {
      expect(tx.confirmed_at).toBeTruthy();
    }
  });

  it("GET ?month=2026-05&confirmed=false returns only drafts", async () => {
    const app = await buildApp(listUserId, listBudgetId);
    const res = await app.request(
      `/budgets/${listBudgetId}/transactions?month=2026-05&confirmed=false`,
    );
    expect(res.status).toBe(200);
    const body = await res.json() as { transactions: unknown[] };
    expect(Array.isArray(body.transactions)).toBe(true);
    // All returned transactions are drafts (confirmed_at = null)
    for (const tx of body.transactions as Array<Record<string, unknown>>) {
      expect(tx.confirmed_at).toBeNull();
    }
  });
});

describe("POST /budgets/:budgetId/transactions/:txId/confirm", () => {
  it("flips confirmed_at from NULL to NOT NULL", async () => {
    const f = await createTestFixture("EUR");
    const app = await buildApp(f.userId, f.budgetId);

    // Create a draft manually via DB (confirmed_at = null)
    const pool = new Pool({ connectionString: process.env.DATABASE_URL_APP });
    const client = await pool.connect();
    const txId = crypto.randomUUID();
    try {
      await client.query("BEGIN");
      await client.query(`SELECT set_config('app.tenant_ids', '{"${f.budgetId}"}', true)`);
      await client.query(`SELECT set_config('app.current_user_id', '${f.userId}', true)`);
      await client.query(
        `INSERT INTO budgeting.expense_ledger
           (id, tenant_id, budget_id, category_id, date, amount_original_cents, currency_original,
            amount_converted_cents, fx_rate, fx_as_of, kind, confirmed_at, created_at, updated_at)
         VALUES ($1, $2, $2, $3, '2026-05-11', 500, 'EUR', 500, '1', '2026-05-11', 'SPENDING', NULL, now(), now())`,
        [txId, f.budgetId, f.categoryId],
      );
      await client.query("COMMIT");
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
      await pool.end();
    }

    const res = await app.request(
      `/budgets/${f.budgetId}/transactions/${txId}/confirm`,
      { method: "POST" },
    );
    expect(res.status).toBe(200);
    const body = await res.json() as { transaction: Record<string, unknown> };
    expect(body.transaction.confirmed_at).toBeTruthy();
  });
});

describe("DELETE /budgets/:budgetId/transactions/:txId", () => {
  it("soft-deletes transaction; subsequent GET returns 404", async () => {
    const f = await createTestFixture("EUR");
    const app = await buildApp(f.userId, f.budgetId);

    // Create a transaction
    const createRes = await app.request(`/budgets/${f.budgetId}/transactions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        date: "2026-05-11",
        category_id: f.categoryId,
        amount_original_cents: 300,
      }),
    });
    const createBody = await createRes.json() as { transaction: Record<string, unknown> };
    const txId = createBody.transaction.id as string;

    // Delete
    const delRes = await app.request(
      `/budgets/${f.budgetId}/transactions/${txId}`,
      { method: "DELETE" },
    );
    expect(delRes.status).toBe(204);

    // Subsequent GET returns 404
    const getRes = await app.request(
      `/budgets/${f.budgetId}/transactions/${txId}`,
    );
    expect(getRes.status).toBe(404);
  });
});

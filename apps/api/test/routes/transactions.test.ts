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
  process.env.DATABASE_URL_WORKER = DB_URL_WORKER_RAW.replace(
    "@db:",
    "@localhost:",
  );
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
    await client.query(
      `SELECT set_config('app.tenant_ids', '{"${budgetId}"}', true)`,
    );
    await client.query(
      `SELECT set_config('app.current_user_id', '${userId}', true)`,
    );
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
  const { createTransactionsRoute } =
    await import("../../src/routes/transactions");
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
    const body = (await res.json()) as { transaction: Record<string, unknown> };
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
    expect(tx.scheduled_payment_id).toBeNull();
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
    const body = (await res.json()) as { transaction: Record<string, unknown> };
    const tx = body.transaction;
    expect(tx.fx_rate).toBe("1");
    expect(tx.amount_converted_cents).toBe(tx.amount_original_cents);
  });

  // R6 (user): a negative amount is a REFUND — money back into the category.
  // It stays a spending with a negative amount, so every spent total that sums
  // spendings takes it off automatically.
  it("a negative amount is a refund: a spending with a negative amount", async () => {
    const app = await buildApp(testUserId, testBudgetId);
    const res = await app.request(`/budgets/${testBudgetId}/transactions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        date: "2026-05-11",
        category_id: testCategoryId,
        amount_original_cents: -596,
      }),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { transaction: Record<string, unknown> };
    const tx = body.transaction;
    expect(tx.kind).toBe("SPENDING");
    expect(Number(tx.amount_original_cents)).toBe(-596);
    expect(Number(tx.amount_converted_cents)).toBe(-596);
  });

  it("a refund in another currency converts with its sign", async () => {
    const app = await buildApp(testUserId, testBudgetId);
    const res = await app.request(`/budgets/${testBudgetId}/transactions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        date: "2026-05-11",
        category_id: testCategoryId,
        amount_original_cents: -1000,
        currency_original: "USD",
      }),
    });
    expect(res.status).toBe(201);
    const tx = ((await res.json()) as { transaction: Record<string, unknown> })
      .transaction;
    expect(Number(tx.amount_original_cents)).toBe(-1000);
    expect(Number(tx.amount_converted_cents)).toBeLessThan(0);
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
    const body = (await res.json()) as { transaction: Record<string, unknown> };
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
    const body = (await res.json()) as { transaction: Record<string, unknown> };
    const tx = body.transaction;
    // GBP→EUR rate (1.10) must differ from USD→EUR rate (0.84)
    expect(tx.fx_rate).not.toBe(oldFxRate);
    // R6 (user): the row keeps the currency it was paid in (it used to lock
    // to the budget currency); the converted figure follows the rate.
    expect(tx.currency_original).toBe("GBP");
    // amount_converted_cents recomputed
    expect(tx.amount_converted_cents).toBeDefined();
    expect(tx.fx_as_of).toBe("2026-05-11");
  });

  // R6 (user): Edit can turn a spending into a refund — the sign is kept.
  it("PATCH with a negative amount makes it a refund", async () => {
    const app = await buildApp(patchUserId, patchBudgetId);
    const res = await app.request(
      `/budgets/${patchBudgetId}/transactions/${createdTxId}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount_original_cents: -700 }),
      },
    );
    expect(res.status).toBe(200);
    const tx = ((await res.json()) as { transaction: Record<string, unknown> })
      .transaction;
    expect(Number(tx.amount_original_cents)).toBe(-700);
    expect(Number(tx.amount_converted_cents)).toBeLessThan(0);
    expect(tx.kind).toBe("SPENDING");
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
    const body = (await res.json()) as { transaction: Record<string, unknown> };
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
    const beforeBody = (await getRes.json()) as {
      transaction: Record<string, unknown>;
    };
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
    const body = (await res.json()) as { transaction: Record<string, unknown> };
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
    const body = (await res.json()) as { transactions: unknown[] };
    expect(Array.isArray(body.transactions)).toBe(true);
    // Each confirmed txn has confirmed_at set
    for (const tx of body.transactions as Array<Record<string, unknown>>) {
      expect(tx.confirmed_at).toBeTruthy();
      // R6 (user): the converted figure names its currency (the budget's),
      // so a foreign row can show both.
      expect(tx.currency_converted).toBe("EUR");
    }
  });

  it("GET ?month=2026-05&confirmed=false returns only drafts", async () => {
    const app = await buildApp(listUserId, listBudgetId);
    const res = await app.request(
      `/budgets/${listBudgetId}/transactions?month=2026-05&confirmed=false`,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { transactions: unknown[] };
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
      await client.query(
        `SELECT set_config('app.tenant_ids', '{"${f.budgetId}"}', true)`,
      );
      await client.query(
        `SELECT set_config('app.current_user_id', '${f.userId}', true)`,
      );
      await client.query(
        `INSERT INTO budgeting.expense_ledger
           (id, tenant_id, budget_id, category_id, transaction_date, amount_original_cents, currency_original,
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
    const body = (await res.json()) as { transaction: Record<string, unknown> };
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
    const createBody = (await createRes.json()) as {
      transaction: Record<string, unknown>;
    };
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

// User (R6): changing an unconfirmed scheduled payment's date — today or
// earlier just moves it (even to another month); a future date sets it aside
// (out of the unconfirmed list, task resolved) until that date.
describe("PATCH an unconfirmed scheduled payment's date", () => {
  async function seedDraft(budgetId: string, userId: string, date: string) {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL_APP });
    const c = await pool.connect();
    try {
      await c.query("BEGIN");
      await c.query(
        `SELECT set_config('app.tenant_ids', '{"${budgetId}"}', true)`,
      );
      await c.query(
        `SELECT set_config('app.current_user_id', '${userId}', true)`,
      );
      const rule = (
        await c.query(
          `INSERT INTO budgeting.scheduled_payments
             (id, tenant_id, amount, currency, cadence, cadence_anchor, active, next_due_date, note, actor_user_id)
           VALUES (gen_random_uuid(), $1, '50', 'EUR', 'MONTHLY', 15, true, '2099-01-15', 'Rent', $2)
           RETURNING id`,
          [budgetId, userId],
        )
      ).rows[0].id as string;
      const draft = (
        await c.query(
          `INSERT INTO budgeting.expense_ledger
             (id, tenant_id, budget_id, transaction_date, amount_original_cents, currency_original,
              amount_converted_cents, fx_rate, fx_as_of, scheduled_payment_id, confirmed_at, kind,
              created_at, updated_at)
           VALUES (gen_random_uuid(), $1, $1, $2::date, 5000, 'EUR', 5000, 1, $2::date, $3, NULL,
                   'SPENDING', now(), now())
           RETURNING id`,
          [budgetId, date, rule],
        )
      ).rows[0].id as string;
      await c.query(
        `INSERT INTO budgeting.tasks (id, tenant_id, budget_id, kind, status, payload_json, created_at)
         VALUES (gen_random_uuid(), $1, $1, 'CONFIRM_DRAFT', 'PENDING', $2::jsonb, now())`,
        [
          budgetId,
          JSON.stringify({
            draft_id: draft,
            rule_name: "Rent",
            amount_cents: "5000",
            currency: "EUR",
            transaction_date: date,
            category_id: "",
          }),
        ],
      );
      await c.query("COMMIT");
      return draft;
    } finally {
      c.release();
      await pool.end();
    }
  }
  async function state(budgetId: string, draftId: string) {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL_APP });
    const c = await pool.connect();
    try {
      await c.query("BEGIN");
      await c.query(
        `SELECT set_config('app.tenant_ids', '{"${budgetId}"}', true)`,
      );
      const row = (
        await c.query(
          `SELECT transaction_date::text AS date, deferred_at IS NOT NULL AS deferred
             FROM budgeting.expense_ledger WHERE id = $1`,
          [draftId],
        )
      ).rows[0];
      const task = (
        await c.query(
          `SELECT status, payload_json->>'transaction_date' AS date FROM budgeting.tasks
            WHERE payload_json->>'draft_id' = $1`,
          [draftId],
        )
      ).rows[0];
      await c.query("COMMIT");
      return { ...row, task };
    } finally {
      c.release();
      await pool.end();
    }
  }
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const today = new Date();
  const thisMonth = iso(today).slice(0, 7);
  const future = iso(new Date(Date.now() + 40 * 86_400_000));
  const lastMonth = iso(
    new Date(today.getFullYear(), today.getMonth() - 1, 10, 12),
  );

  it("a future date sets it aside: gone from the unconfirmed list, task resolved", async () => {
    const f = await createTestFixture("EUR");
    const draft = await seedDraft(f.budgetId, f.userId, iso(today));
    const app = await buildApp(f.userId, f.budgetId);
    const res = await app.request(
      `/budgets/${f.budgetId}/transactions/${draft}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: future }),
      },
    );
    expect(res.status).toBe(200);
    expect(await state(f.budgetId, draft)).toMatchObject({
      date: future,
      deferred: true,
      task: { status: "RESOLVED" },
    });
    const list = (await (
      await app.request(
        `/budgets/${f.budgetId}/transactions?month=${future.slice(0, 7)}&confirmed=false`,
      )
    ).json()) as { transactions: { id: string }[] };
    expect(list.transactions.map((t) => t.id)).not.toContain(draft);
  });

  it("an earlier date just moves it — to another month too — and the task follows", async () => {
    const f = await createTestFixture("EUR");
    const draft = await seedDraft(f.budgetId, f.userId, iso(today));
    const app = await buildApp(f.userId, f.budgetId);
    const res = await app.request(
      `/budgets/${f.budgetId}/transactions/${draft}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: lastMonth }),
      },
    );
    expect(res.status).toBe(200);
    expect(await state(f.budgetId, draft)).toMatchObject({
      date: lastMonth,
      deferred: false,
      task: { status: "PENDING", date: lastMonth },
    });
    const list = (await (
      await app.request(
        `/budgets/${f.budgetId}/transactions?month=${lastMonth.slice(0, 7)}&confirmed=false`,
      )
    ).json()) as { transactions: { id: string }[] };
    expect(list.transactions.map((t) => t.id)).toContain(draft);
    expect(thisMonth).not.toBe(lastMonth.slice(0, 7));
  });
});

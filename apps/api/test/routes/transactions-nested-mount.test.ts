/**
 * transactions-nested-mount.test.ts — Verifies the transactions route factory
 * is correctly mounted under /budgets/:budgetId/transactions (UAT Defect 1 regression).
 *
 * TDD RED: These tests exercise the createTransactionsRoute factory mounted under
 * the nested path, mirroring exactly how app.ts must wire it. If the mount is missing
 * from app.ts, real-world POST/GET return 404.
 *
 * We test the route factory directly (same pattern as transactions.test.ts) to confirm
 * the factory works at the nested path, then verify the app.ts mount exists via a
 * smoke import check.
 */
import { describe, it, expect, beforeAll } from "bun:test";
import { Hono } from "hono";
import { Pool } from "pg";

const DB_URL = process.env.DATABASE_URL_APP;
if (!DB_URL) throw new Error("DATABASE_URL_APP required");

process.env.DATABASE_URL_APP = DB_URL.replace("@db:", "@localhost:");
const DB_URL_WORKER_RAW = process.env.DATABASE_URL_WORKER;
if (DB_URL_WORKER_RAW) {
  process.env.DATABASE_URL_WORKER = DB_URL_WORKER_RAW.replace(
    "@db:",
    "@localhost:",
  );
}
const { resetPools } = await import("@budget/platform");
resetPools();

async function createFixture() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL_APP });
  const client = await pool.connect();
  const userId = crypto.randomUUID();
  const budgetId = crypto.randomUUID();
  const categoryId = crypto.randomUUID();
  try {
    await client.query("BEGIN");
    await client.query(
      `INSERT INTO identity.users (id, email, name, email_verified, created_at, updated_at)
       VALUES ($1, $2, 'TxNestedMount Test', true, now(), now())`,
      [userId, `tx-nested-${userId}@example.com`],
    );
    await client.query(
      `INSERT INTO tenancy.budgets (id, slug, name, kind, default_currency, owner_user_id, member_count, created_at)
       VALUES ($1, $2, 'TxNested Budget', 'PRIVATE', 'EUR', $3, 1, now())`,
      [budgetId, `ws-txnm-${budgetId.slice(0, 8)}`, userId],
    );
    await client.query(
      `SELECT set_config('app.tenant_ids', '{"${budgetId}"}', true)`,
    );
    await client.query(
      `SELECT set_config('app.current_user_id', '${userId}', true)`,
    );
    await client.query(
      `INSERT INTO budgeting.categories (id, tenant_id, name, created_at, actor_user_id)
       VALUES ($1, $2, 'Nested Food', now(), $3)`,
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

async function buildNestedApp(userId: string, budgetId: string) {
  const { createTransactionsRoute } =
    await import("../../src/routes/transactions");
  const { StubFxProvider } = await import("../fixtures/fx-provider");

  const fxProvider = new StubFxProvider();
  const deps = { fxProvider } as any;

  const app = new Hono();
  // Simulate session/tenant middleware
  app.use(async (c, next) => {
    c.set("session", { user: { id: userId } });
    c.set("tenantId", budgetId);
    c.set("tenantIds", [budgetId]);
    c.set("userId", userId);
    await next();
  });
  // Mount at the nested path — this is what app.ts MUST do
  app.route("/budgets/:budgetId/transactions", createTransactionsRoute(deps));
  return app;
}

let testUserId: string;
let testBudgetId: string;
let testCategoryId: string;

describe("nested mount — /budgets/:budgetId/transactions", () => {
  beforeAll(async () => {
    const f = await createFixture();
    testUserId = f.userId;
    testBudgetId = f.budgetId;
    testCategoryId = f.categoryId;
  });

  it("POST /budgets/:budgetId/transactions returns 201 (not 404)", async () => {
    const app = await buildNestedApp(testUserId, testBudgetId);
    const res = await app.request(`/budgets/${testBudgetId}/transactions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        date: "2026-05-13",
        category_id: testCategoryId,
        amount_original_cents: 1250,
      }),
    });
    expect(res.status).not.toBe(404);
    expect(res.status).toBe(201);
    const body = (await res.json()) as any;
    expect(body.transaction).toBeDefined();
    expect(body.transaction.id).toBeTruthy();
    expect(body.transaction.budget_id).toBe(testBudgetId);
  });

  it("GET /budgets/:budgetId/transactions?month=2026-05 returns 200 (not 404)", async () => {
    const app = await buildNestedApp(testUserId, testBudgetId);
    const res = await app.request(
      `/budgets/${testBudgetId}/transactions?month=2026-05`,
      { method: "GET" },
    );
    expect(res.status).not.toBe(404);
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(Array.isArray(body.transactions)).toBe(true);
  });

  it("app.ts source contains the /budgets/:budgetId/transactions mount", async () => {
    // Static verification: grep the app.ts source for the nested mount
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const appSrc = readFileSync(
      resolve(import.meta.dir, "../../src/app.ts"),
      "utf-8",
    );
    // Must have a route() call wiring transactions under the budgetId path
    expect(appSrc).toMatch(/\/budgets\/:budgetId\/transactions/);
    expect(appSrc).toMatch(/createTransactionsRoute/);
  });
});

/**
 * transactions-bulk.test.ts — Integration tests for POST /transactions/bulk-recategorize.
 * v1.1: uses tenancy.budgets + budgeting.wallets + v1.1 transaction shape.
 */
import { describe, it, expect } from "bun:test";
import { Hono } from "hono";
import { Pool } from "pg";

const DB_URL = process.env.DATABASE_URL_APP;
if (!DB_URL) throw new Error("DATABASE_URL_APP required");

if (process.env.DATABASE_URL_WORKER) {
  process.env.DATABASE_URL_WORKER = process.env.DATABASE_URL_WORKER.replace(
    "@db:",
    "@localhost:",
  );
}
process.env.DATABASE_URL_APP = DB_URL.replace("@db:", "@localhost:");
const { resetPools } = await import("@budget/platform");
resetPools();

async function createFixture(label: string) {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL_APP });
  const client = await pool.connect();
  const userId = crypto.randomUUID();
  const tenantId = crypto.randomUUID();
  const categoryAId = crypto.randomUUID();
  const categoryBId = crypto.randomUUID();

  try {
    await client.query("BEGIN");
    await client.query(
      `SELECT set_config('app.current_user_id', '${userId}', true)`,
    );
    await client.query(
      `INSERT INTO identity.users (id, email, name, email_verified, created_at, updated_at)
       VALUES ($1, $2, 'Bulk Route Test', true, now(), now())`,
      [userId, `bulk-route-${label}-${userId.slice(0, 8)}@example.com`],
    );
    await client.query(
      `INSERT INTO tenancy.budgets (id, slug, name, kind, default_currency, owner_user_id, member_count, created_at)
       VALUES ($1, $2, 'Bulk WS', 'PRIVATE', 'EUR', $3, 1, now())`,
      [tenantId, `ws-bulk-${tenantId.slice(0, 8)}`, userId],
    );
    await client.query(
      `SELECT set_config('app.tenant_ids', '{"${tenantId}"}', true)`,
    );
    await client.query(
      `SELECT set_config('app.current_user_id', '${userId}', true)`,
    );
    await client.query(
      `INSERT INTO budgeting.categories (id, tenant_id, name, created_at, actor_user_id)
       VALUES ($1, $2, 'CatA', now(), $3),
              ($4, $2, 'CatB', now(), $3)`,
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

  return { userId, tenantId, categoryAId, categoryBId };
}

async function buildApp(userId: string, tenantId: string) {
  const { createTransactionsRoute } =
    await import("../../src/routes/transactions");
  const { createBudgetingModule } =
    await import("@budget/budgeting/src/contracts/factory");
  const { DrizzleFxRateCacheRepo } =
    await import("@budget/budgeting/src/adapters/persistence/fx-rate-cache-repo");
  const { workerPool, createIdempotencyMiddleware } =
    await import("@budget/platform");

  const fxCache = new DrizzleFxRateCacheRepo(workerPool());
  const budgeting = createBudgetingModule({ fxCache });
  const deps = { budgeting };

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
  app.route("/budgets/:budgetId/transactions", createTransactionsRoute(deps));
  return { app, budgetId: tenantId };
}

async function createTransaction(
  app: Awaited<ReturnType<typeof buildApp>>["app"],
  budgetId: string,
  categoryId: string,
  amount: number,
  date: string,
) {
  const res = await app.request(`/budgets/${budgetId}/transactions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": crypto.randomUUID(),
    },
    body: JSON.stringify({
      date,
      category_id: categoryId,
      amount_original_cents: amount,
    }),
  });
  if (res.status !== 201) {
    throw new Error(
      `createTransaction failed: ${res.status} ${await res.text()}`,
    );
  }
  const body = (await res.json()) as { transaction: { id: string } };
  return body.transaction.id;
}

describe("POST /transactions/bulk-recategorize", () => {
  it("happy path: 3 ids in CatA → bulk to CatB → 200 with 3 succeeded", async () => {
    const f = await createFixture("happy");
    const { app, budgetId } = await buildApp(f.userId, f.tenantId);
    const a = await createTransaction(
      app,
      budgetId,
      f.categoryAId,
      1000,
      "2026-05-01",
    );
    const b = await createTransaction(
      app,
      budgetId,
      f.categoryAId,
      2000,
      "2026-05-02",
    );
    const c = await createTransaction(
      app,
      budgetId,
      f.categoryAId,
      3000,
      "2026-05-03",
    );

    const res = await app.request("/transactions/bulk-recategorize", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": crypto.randomUUID(),
      },
      body: JSON.stringify({
        transactionIds: [a, b, c],
        newCategoryId: f.categoryBId,
      }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      succeeded: string[];
      skipped: string[];
      failed: string[];
    };
    expect(body.succeeded.length).toBe(3);
    expect(body.skipped.length).toBe(0);
    expect(body.failed.length).toBe(0);
  });

  it("validation error on empty ids array → 422", async () => {
    const f = await createFixture("validation");
    const { app } = await buildApp(f.userId, f.tenantId);

    const res = await app.request("/transactions/bulk-recategorize", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": crypto.randomUUID(),
      },
      body: JSON.stringify({
        transactionIds: [],
        newCategoryId: f.categoryBId,
      }),
    });
    expect(res.status).toBe(422);
  });

  it("idempotent replay: second POST with same Idempotency-Key returns cached body", async () => {
    const f = await createFixture("idempotent");
    const { app, budgetId } = await buildApp(f.userId, f.tenantId);
    const a = await createTransaction(
      app,
      budgetId,
      f.categoryAId,
      1000,
      "2026-05-01",
    );

    const idemKey = crypto.randomUUID();
    const r1 = await app.request("/transactions/bulk-recategorize", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": idemKey,
      },
      body: JSON.stringify({
        transactionIds: [a],
        newCategoryId: f.categoryBId,
      }),
    });
    expect(r1.status).toBe(200);
    const b1 = (await r1.json()) as {
      succeeded: string[];
      skipped: string[];
      failed: string[];
    };

    const r2 = await app.request("/transactions/bulk-recategorize", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": idemKey,
      },
      body: JSON.stringify({
        transactionIds: [a],
        newCategoryId: f.categoryBId,
      }),
    });
    expect(r2.status).toBe(200);
    const b2 = (await r2.json()) as {
      succeeded: string[];
      skipped: string[];
      failed: string[];
    };
    expect(b2.succeeded.sort()).toEqual(b1.succeeded.sort());
    expect(b2.skipped.sort()).toEqual(b1.skipped.sort());
    expect(b2.failed.sort()).toEqual(b1.failed.sort());
  });
});

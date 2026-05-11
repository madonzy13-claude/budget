/**
 * transactions-bulk.test.ts — Integration tests for POST /transactions/bulk-recategorize.
 */
import { describe, it, expect, beforeAll } from "bun:test";
import { Hono } from "hono";
import { Pool } from "pg";

const DB_URL = process.env.DATABASE_URL_APP;
if (!DB_URL) throw new Error("DATABASE_URL_APP required");

if (process.env.DATABASE_URL_WORKER) {
  process.env.DATABASE_URL_WORKER = process.env.DATABASE_URL_WORKER.replace("@db:", "@localhost:");
}
process.env.DATABASE_URL_APP = DB_URL.replace("@db:", "@localhost:");
const { resetPools } = await import("@budget/platform");
resetPools();

async function createFixture(label: string) {
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
       VALUES ($1, $2, 'Bulk Route Test', true, now(), now())`,
      [userId, `bulk-route-${label}-${userId.slice(0, 8)}@example.com`],
    );
    await client.query(
      `INSERT INTO tenancy.budgets (id, slug, name, kind, default_currency, owner_user_id, member_count, created_at)
       VALUES ($1, $2, 'Bulk WS', 'PRIVATE', 'EUR', $3, 1, now())`,
      [tenantId, `ws-bulk-${tenantId.slice(0, 8)}`, userId],
    );
    await client.query(`SELECT set_config('app.tenant_ids', '{"${tenantId}"}', true)`);
    await client.query(`SELECT set_config('app.current_user_id', '${userId}', true)`);
    await client.query(
      `INSERT INTO budgeting.wallets (id, tenant_id, name, wallet_type, currency, current_balance, created_at, actor_user_id)
       VALUES ($1, $2, 'Checking', 'SPENDINGS', 'EUR', 100000.0000, now(), $3)`,
      [accountId, tenantId, userId],
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

  return { userId, tenantId, accountId, categoryAId, categoryBId };
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

async function createExpense(
  app: Awaited<ReturnType<typeof buildApp>>,
  accountId: string,
  categoryId: string,
  amount: string,
  date: string,
) {
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
      transactionDate: date,
      accountId,
      categoryId,
      note: "bulk-test",
    }),
  });
  expect(res.status).toBe(201);
  return (await res.json()) as { ledgerId: string };
}

describe("POST /transactions/bulk-recategorize", () => {
  it("happy path: 3 ids in CatA → bulk to CatB → 200 with 3 succeeded", async () => {
    const f = await createFixture("happy");
    const app = await buildApp(f.userId, f.tenantId);
    const a = (await createExpense(app, f.accountId, f.categoryAId, "10.00", "2026-05-01")).ledgerId;
    const b = (await createExpense(app, f.accountId, f.categoryAId, "20.00", "2026-05-02")).ledgerId;
    const c = (await createExpense(app, f.accountId, f.categoryAId, "30.00", "2026-05-03")).ledgerId;

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
    const app = await buildApp(f.userId, f.tenantId);

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
    const app = await buildApp(f.userId, f.tenantId);
    const a = (await createExpense(app, f.accountId, f.categoryAId, "10.00", "2026-05-01")).ledgerId;

    const idemKey = crypto.randomUUID();
    const r1 = await app.request("/transactions/bulk-recategorize", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Idempotency-Key": idemKey },
      body: JSON.stringify({ transactionIds: [a], newCategoryId: f.categoryBId }),
    });
    expect(r1.status).toBe(200);
    const b1 = (await r1.json()) as { succeeded: string[]; skipped: string[]; failed: string[] };

    const r2 = await app.request("/transactions/bulk-recategorize", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Idempotency-Key": idemKey },
      body: JSON.stringify({ transactionIds: [a], newCategoryId: f.categoryBId }),
    });
    expect(r2.status).toBe(200);
    const b2 = (await r2.json()) as { succeeded: string[]; skipped: string[]; failed: string[] };
    expect(b2.succeeded.sort()).toEqual(b1.succeeded.sort());
    expect(b2.skipped.sort()).toEqual(b1.skipped.sort());
    expect(b2.failed.sort()).toEqual(b1.failed.sort());
  });
});

/**
 * transactions-search.test.ts — Integration tests for GET /transactions search/filter (Plan 02-09).
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
  const categoryFoodId = crypto.randomUUID();
  const categoryTravelId = crypto.randomUUID();

  try {
    await client.query("BEGIN");
    await client.query(`SELECT set_config('app.current_user_id', '${userId}', true)`);
    await client.query(
      `INSERT INTO identity.users (id, email, name, email_verified, created_at, updated_at)
       VALUES ($1, $2, 'Search Route Test', true, now(), now())`,
      [userId, `srch-route-${label}-${userId.slice(0, 8)}@example.com`],
    );
    await client.query(
      `INSERT INTO tenancy.budgets (id, slug, name, kind, default_currency, owner_user_id, member_count, created_at)
       VALUES ($1, $2, 'Search WS', 'PRIVATE', 'EUR', $3, 1, now())`,
      [tenantId, `ws-srch-${tenantId.slice(0, 8)}`, userId],
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
       VALUES ($1, $2, 'Food', now(), $3),
              ($4, $2, 'Travel', now(), $3)`,
      [categoryFoodId, tenantId, userId, categoryTravelId],
    );
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
    await pool.end();
  }

  return { userId, tenantId, accountId, categoryFoodId, categoryTravelId };
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
  note: string,
) {
  const res = await app.request("/transactions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": crypto.randomUUID(),
    },
    body: JSON.stringify({
      date,
      category_id: categoryId,
      amount_original_cents: Math.round(parseFloat(amount) * 100),
      currency_original: "EUR",
      note,
    }),
  });
  expect(res.status).toBe(201);
  return (await res.json()) as { ledgerId: string };
}

describe("GET /transactions (search + filter)", () => {
  let userId: string;
  let tenantId: string;
  let accountId: string;
  let categoryFoodId: string;
  let categoryTravelId: string;
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeAll(async () => {
    const f = await createFixture("baseline");
    userId = f.userId;
    tenantId = f.tenantId;
    accountId = f.accountId;
    categoryFoodId = f.categoryFoodId;
    categoryTravelId = f.categoryTravelId;
    app = await buildApp(userId, tenantId);

    await createExpense(app, accountId, categoryFoodId, "10.00", "2026-05-01", "Latte coffee");
    await createExpense(app, accountId, categoryTravelId, "25.00", "2026-05-03", "Train ticket Paris");
    await createExpense(app, accountId, categoryFoodId, "5.50", "2026-05-04", "Espresso coffee");
    await createExpense(app, accountId, categoryTravelId, "120.00", "2026-04-10", "Hotel Lyon");
    await createExpense(app, accountId, categoryFoodId, "8.00", "2026-04-15", "Sandwich");
  });

  it("no params → returns all 5 latest rows (legacy path)", async () => {
    const res = await app.request("/transactions", { method: "GET" });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { transactions: Array<{ id: string }> };
    expect(body.transactions.length).toBeGreaterThanOrEqual(5);
  });

  it("q=coffee returns 2 matching rows", async () => {
    const res = await app.request("/transactions?q=coffee", { method: "GET" });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      transactions: Array<{ id: string; note: string }>;
      nextCursor: { transactionDate: string; id: string } | null;
    };
    expect(body.transactions.length).toBe(2);
    for (const t of body.transactions) {
      expect((t.note ?? "").toLowerCase()).toContain("coffee");
    }
  });

  it("dateFrom + dateTo filter narrows to May rows", async () => {
    const res = await app.request(
      "/transactions?dateFrom=2026-05-01&dateTo=2026-05-31",
      { method: "GET" },
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { transactions: Array<{ transactionDate: string }> };
    expect(body.transactions.length).toBe(3);
    for (const t of body.transactions) {
      expect(t.transactionDate >= "2026-05-01").toBe(true);
      expect(t.transactionDate <= "2026-05-31").toBe(true);
    }
  });

  it(`categoryIds filter narrows to Food only`, async () => {
    const res = await app.request(
      `/transactions?categoryIds=${categoryFoodId}`,
      { method: "GET" },
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { transactions: Array<{ categoryId: string }> };
    expect(body.transactions.length).toBe(3);
    for (const t of body.transactions) {
      expect(t.categoryId).toBe(categoryFoodId);
    }
  });

  it("limit=2 + cursor pagination returns no overlapping rows", async () => {
    // Force search path with limit=2 + a benign filter (kind=EXPENSE) so the route uses
    // the search use case (which returns nextCursor). Without any filter the route
    // hits the legacy getLatestTransactions path which doesn't return a cursor.
    const r1 = await app.request("/transactions?limit=2&kind=EXPENSE", { method: "GET" });
    expect(r1.status).toBe(200);
    const b1 = (await r1.json()) as {
      transactions: Array<{ id: string }>;
      nextCursor: { transactionDate: string; id: string } | null;
    };
    expect(b1.transactions.length).toBe(2);
    expect(b1.nextCursor).not.toBeNull();
    const cursor = b1.nextCursor!;
    expect(typeof cursor.transactionDate).toBe("string");
    expect(typeof cursor.id).toBe("string");

    const r2 = await app.request(
      `/transactions?limit=2&kind=EXPENSE&cursorDate=${cursor.transactionDate}&cursorId=${cursor.id}`,
      { method: "GET" },
    );
    expect(r2.status).toBe(200);
    const b2 = (await r2.json()) as { transactions: Array<{ id: string }> };
    expect(b2.transactions.length).toBe(2);
    const ids1 = new Set(b1.transactions.map((t) => t.id));
    for (const t of b2.transactions) expect(ids1.has(t.id)).toBe(false);
  });
});

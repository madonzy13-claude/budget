/**
 * transactions-search.test.ts — GET /budgets/:budgetId/transactions/search (15-03).
 *
 * Full-history, keyset-paged search the MCP `search_transactions` tool
 * dispatches to (D-22). Newest first, 200/page max, filters by date range,
 * category, kind and note text. Real Postgres.
 */
import { describe, it, expect, beforeAll } from "bun:test";
import { Hono } from "hono";
import { Pool } from "pg";
import { trace } from "@opentelemetry/api";

const DB_URL = process.env.DATABASE_URL_APP;
if (!DB_URL) throw new Error("DATABASE_URL_APP required");
process.env.DATABASE_URL_APP = DB_URL.replace("@db:", "@localhost:");
const { resetPools } = await import("@budget/platform");
resetPools();

const { createTransactionsRoute } = await import(
  "../../src/routes/transactions"
);
const { tenantGuard } = await import("../../src/middleware/tenant-guard");
const { requireWorkspace } = await import(
  "../../src/middleware/require-workspace"
);

interface Fixture {
  userId: string;
  budgetId: string;
  foodId: string;
  fuelId: string;
}

async function withClient<T>(
  fn: (c: import("pg").PoolClient) => Promise<T>,
): Promise<T> {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL_APP });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const out = await fn(client);
    await client.query("COMMIT");
    return out;
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
    await pool.end();
  }
}

async function createFixture(): Promise<Fixture> {
  const userId = crypto.randomUUID();
  const budgetId = crypto.randomUUID();
  const foodId = crypto.randomUUID();
  const fuelId = crypto.randomUUID();
  await withClient(async (c) => {
    await c.query(
      `INSERT INTO identity.users (id, email, name, email_verified, created_at, updated_at)
       VALUES ($1, $2, 'Search Test', true, now(), now())`,
      [userId, `tx-search-${userId}@example.com`],
    );
    await c.query(
      `INSERT INTO tenancy.budgets (id, slug, name, kind, default_currency, owner_user_id, member_count, created_at)
       VALUES ($1, $2, 'Search Budget', 'PRIVATE', 'EUR', $3, 1, now())`,
      [budgetId, `ws-search-${budgetId.slice(0, 8)}`, userId],
    );
    await c.query(
      `INSERT INTO tenancy.budget_members (id, budget_id, user_id, role, created_at)
       VALUES ($1, $2, $3, 'owner', now())`,
      [crypto.randomUUID(), budgetId, userId],
    );
    await c.query(`SELECT set_config('app.tenant_ids', $1, true)`, [
      `{${budgetId}}`,
    ]);
    await c.query(`SELECT set_config('app.current_user_id', $1, true)`, [
      userId,
    ]);
    for (const [id, name] of [
      [foodId, "Food"],
      [fuelId, "Fuel"],
    ]) {
      await c.query(
        `INSERT INTO budgeting.categories (id, tenant_id, name, created_at, actor_user_id)
         VALUES ($1, $2, $3, now(), $4)`,
        [id, budgetId, name, userId],
      );
    }
  });
  return { userId, budgetId, foodId, fuelId };
}

/** 450 spendings over 30 months (2024-01..2026-06, 15 per month, day collisions
 *  so the id tiebreak matters) + 5 incomes + 1 deleted + 1 unconfirmed. */
async function seed(f: Fixture): Promise<void> {
  await withClient(async (c) => {
    await c.query(`SELECT set_config('app.tenant_ids', $1, true)`, [
      `{${f.budgetId}}`,
    ]);
    await c.query(`SELECT set_config('app.current_user_id', $1, true)`, [
      f.userId,
    ]);
    const insert = (where: string) =>
      `INSERT INTO budgeting.expense_ledger
         (id, tenant_id, budget_id, category_id, transaction_date,
          amount_original_cents, currency_original, amount_converted_cents,
          fx_rate, fx_as_of, note, kind, confirmed_at, created_at, updated_at, deleted_at)
       ${where}`;
    await c.query(
      insert(`SELECT gen_random_uuid(), $1, $1,
                CASE WHEN i % 3 = 0 THEN $3::uuid ELSE $2::uuid END,
                (DATE '2024-01-01' + ((i % 30) || ' months')::interval + ((i % 5) || ' days')::interval)::date,
                100 + i, 'EUR', 100 + i, 1, DATE '2024-01-01',
                CASE WHEN i % 50 = 0 THEN 'Coffee BEANS ' || i ELSE 'spend ' || i END,
                'SPENDING', now(), now(), now(), NULL
           FROM generate_series(0, 449) AS i`),
      [f.budgetId, f.foodId, f.fuelId],
    );
    await c.query(
      insert(`SELECT gen_random_uuid(), $1, $1, $2::uuid,
                (DATE '2025-02-10' + (i || ' days')::interval)::date,
                -5000, 'EUR', -5000, 1, DATE '2025-02-10', 'salary', 'INCOME',
                now(), now(), now(), NULL
           FROM generate_series(0, 4) AS i`),
      [f.budgetId, f.foodId],
    );
    await c.query(
      insert(`VALUES (gen_random_uuid(), $1, $1, $2, DATE '2025-03-01', 999, 'EUR', 999, 1,
                DATE '2025-03-01', 'deleted row', 'SPENDING', now(), now(), now(), now())`),
      [f.budgetId, f.foodId],
    );
  });
}

function buildApp(f: Fixture, asUser = f.userId) {
  const app = new Hono();
  app.use(async (c, next) => {
    c.set("session", {
      user: { id: asUser, email: "x@example.com", locale: "en" },
    });
    await next();
  });
  app.use(tenantGuard);
  app.use("/budgets/:budgetId/transactions/*", requireWorkspace);
  app.route(
    "/budgets/:budgetId/transactions",
    createTransactionsRoute({ fxProvider: {} } as any),
  );
  return app;
}

interface Page {
  transactions: Array<Record<string, unknown>>;
  next_cursor: string | null;
}

async function search(
  app: Hono,
  f: Fixture,
  qs: string,
  budgetHeader = f.budgetId,
): Promise<Response> {
  return app.request(`/budgets/${f.budgetId}/transactions/search${qs}`, {
    headers: { "x-budget-id": budgetHeader },
  });
}

let f: Fixture;
let app: Hono;

beforeAll(async () => {
  trace.disable();
  f = await createFixture();
  await seed(f);
  app = buildApp(f);
});

describe("Transactions search", () => {
  it("pages the full history newest first, every row exactly once", async () => {
    const seen: Array<Record<string, unknown>> = [];
    let cursor: string | null = null;
    let pages = 0;
    do {
      const res = await search(
        app,
        f,
        cursor ? `?cursor=${encodeURIComponent(cursor)}` : "",
      );
      expect(res.status).toBe(200);
      const page = (await res.json()) as Page;
      if (pages === 0) {
        expect(page.transactions.length).toBe(200);
        expect(page.next_cursor).not.toBeNull();
      }
      seen.push(...page.transactions);
      cursor = page.next_cursor;
      pages++;
    } while (cursor && pages < 10);

    expect(pages).toBe(3);
    expect(seen.length).toBe(455);
    expect(new Set(seen.map((t) => t.id)).size).toBe(455);
    for (let i = 1; i < seen.length; i++) {
      const a = seen[i - 1]!;
      const b = seen[i]!;
      const ordered =
        (a.date as string) > (b.date as string) ||
        (a.date === b.date && (a.id as string) > (b.id as string));
      expect(ordered).toBe(true);
    }
    expect(seen.some((t) => t.note === "deleted row")).toBe(false);
    expect(seen[0]).toHaveProperty("amount_original_cents");
    expect(seen[0]).toHaveProperty("confirmed_at");
  });

  it("honours limit and caps it at 200", async () => {
    const res = await search(app, f, "?limit=50");
    expect(((await res.json()) as Page).transactions.length).toBe(50);
    expect((await search(app, f, "?limit=500")).status).toBe(422);
  });

  it("filters by date range, category, kind and note text", async () => {
    const range = (await (
      await search(app, f, "?from=2025-01-01&to=2025-03-31")
    ).json()) as Page;
    expect(range.transactions.length).toBeGreaterThan(0);
    for (const t of range.transactions) {
      expect(t.date as string >= "2025-01-01").toBe(true);
      expect(t.date as string <= "2025-03-31").toBe(true);
    }

    const fuel = (await (
      await search(app, f, `?category_id=${f.fuelId}`)
    ).json()) as Page;
    expect(fuel.transactions.length).toBe(150);
    expect(fuel.transactions.every((t) => t.category_id === f.fuelId)).toBe(
      true,
    );

    const incomes = (await (
      await search(app, f, "?kind=INCOME")
    ).json()) as Page;
    expect(incomes.transactions.length).toBe(5);
    expect(incomes.transactions.every((t) => t.kind === "INCOME")).toBe(true);

    const coffee = (await (
      await search(app, f, "?q=coffee%20beans")
    ).json()) as Page;
    expect(coffee.transactions.length).toBe(9);
  });

  it("treats the note query as data, not SQL", async () => {
    const res = await search(app, f, `?q=${encodeURIComponent("%' OR 1=1 --")}`);
    expect(res.status).toBe(200);
    expect(((await res.json()) as Page).transactions.length).toBe(0);
  });

  it("rejects a malformed cursor", async () => {
    expect((await search(app, f, "?cursor=not-a-cursor")).status).toBe(422);
  });

  it("includes unconfirmed rows flagged as such", async () => {
    await withClient(async (c) => {
      await c.query(`SELECT set_config('app.tenant_ids', $1, true)`, [
        `{${f.budgetId}}`,
      ]);
      await c.query(`SELECT set_config('app.current_user_id', $1, true)`, [
        f.userId,
      ]);
      await c.query(
        `INSERT INTO budgeting.expense_ledger
           (id, tenant_id, budget_id, category_id, transaction_date,
            amount_original_cents, currency_original, amount_converted_cents,
            fx_rate, fx_as_of, note, kind, confirmed_at, created_at, updated_at)
         VALUES (gen_random_uuid(), $1, $1, $2, DATE '2026-10-01', 777, 'EUR', 777, 1,
                 DATE '2026-10-01', 'pending bill', 'SPENDING', NULL, now(), now())`,
        [f.budgetId, f.foodId],
      );
    });
    const page = (await (await search(app, f, "?q=pending")).json()) as Page;
    expect(page.transactions.length).toBe(1);
    expect(page.transactions[0]!.confirmed_at).toBeNull();
  });

  it("refuses another user's budget", async () => {
    const other = await createFixture();
    const res = await search(buildApp(f, other.userId), f, "", f.budgetId);
    expect(res.status).not.toBe(200);
  });
});

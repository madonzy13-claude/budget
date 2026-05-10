/**
 * search-transactions.test.ts — Integration tests for searchTransactions use case (Plan 02-09).
 * Verifies FTS via plainto_tsquery + cursor pagination + filter combinations + RLS scoping.
 * Requires real Postgres at DATABASE_URL_APP.
 */
import { describe, test, expect, beforeAll } from "bun:test";
import { Pool } from "pg";

const DB_URL = process.env.DATABASE_URL_APP;
if (!DB_URL) throw new Error("DATABASE_URL_APP required");

if (process.env.DATABASE_URL_WORKER) {
  process.env.DATABASE_URL_WORKER = process.env.DATABASE_URL_WORKER.replace("@db:", "@localhost:");
}
process.env.DATABASE_URL_APP = DB_URL.replace("@db:", "@localhost:");
const { resetPools } = await import("@budget/platform");
resetPools();

interface Fixture {
  userId: string;
  tenantId: string;
  accountId: string;
  categoryFoodId: string;
  categoryTravelId: string;
}

async function createFixture(label = "search"): Promise<Fixture> {
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
       VALUES ($1, $2, 'Search Test', true, now(), now())`,
      [userId, `search-${label}-${userId.slice(0, 8)}@example.com`],
    );
    await client.query(
      `INSERT INTO tenancy.workspaces (id, slug, name, kind, default_currency, owner_user_id, member_count, created_at)
       VALUES ($1, $2, 'Search WS', 'PRIVATE', 'EUR', $3, 1, now())`,
      [tenantId, `ws-srch-${tenantId.slice(0, 8)}`, userId],
    );
    await client.query(`SELECT set_config('app.tenant_ids', '{"${tenantId}"}', true)`);
    await client.query(`SELECT set_config('app.current_user_id', '${userId}', true)`);
    await client.query(
      `INSERT INTO budgeting.accounts (id, tenant_id, name, kind, scope, currency, current_balance, created_at, actor_user_id)
       VALUES ($1, $2, 'Checking', 'CHECKING', 'PERSONAL', 'EUR', 100000.0000, now(), $3)`,
      [accountId, tenantId, userId],
    );
    await client.query(
      `INSERT INTO budgeting.categories (id, tenant_id, name, scope, created_at, actor_user_id)
       VALUES ($1, $2, 'Food', 'PERSONAL', now(), $3),
              ($4, $2, 'Travel', 'PERSONAL', now(), $3)`,
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

async function buildUseCases() {
  const { createBudgetingModule } = await import("@budget/budgeting/src/contracts/factory");
  const { DrizzleFxRateCacheRepo } = await import(
    "@budget/budgeting/src/adapters/persistence/fx-rate-cache-repo"
  );
  const { workerPool } = await import("@budget/platform");

  const fxCache = new DrizzleFxRateCacheRepo(workerPool());
  return createBudgetingModule({ fxCache });
}

async function seedExpense(
  useCases: Awaited<ReturnType<typeof buildUseCases>>,
  fx: Fixture,
  amount: string,
  date: string,
  note: string,
  categoryId: string | null,
) {
  const r = await useCases.createTransaction({
    kind: "EXPENSE",
    amountOrig: amount,
    currencyOrig: "EUR",
    transactionDate: date,
    accountId: fx.accountId,
    categoryId: categoryId ?? undefined,
    note,
    tenantId: fx.tenantId,
    actorUserId: fx.userId,
  });
  expect(r.isOk()).toBe(true);
  return r.value!.ledgerId;
}

describe("searchTransactions use case", () => {
  let fx: Fixture;
  let useCases: Awaited<ReturnType<typeof buildUseCases>>;

  beforeAll(async () => {
    fx = await createFixture("base");
    useCases = await buildUseCases();

    // Seed 5 EXPENSE transactions with varied notes/dates/categories
    await seedExpense(useCases, fx, "10.00", "2026-05-01", "Latte coffee", fx.categoryFoodId);
    await seedExpense(useCases, fx, "25.00", "2026-05-03", "Train ticket Paris", fx.categoryTravelId);
    await seedExpense(useCases, fx, "5.50", "2026-05-04", "Espresso coffee shop", fx.categoryFoodId);
    await seedExpense(useCases, fx, "120.00", "2026-04-10", "Hotel Lyon", fx.categoryTravelId);
    await seedExpense(useCases, fx, "8.00", "2026-04-15", "Sandwich lunch", fx.categoryFoodId);
  });

  test("no filters returns all 5 latest rows ordered by date DESC", async () => {
    const r = await useCases.searchTransactions({
      tenantId: fx.tenantId,
      query: undefined,
      filters: {},
      cursor: null,
      limit: 50,
    });
    expect(r.isOk()).toBe(true);
    const out = r.value!;
    expect(out.rows.length).toBe(5);
    // ORDER BY transaction_date DESC, id DESC
    expect(out.rows[0].transactionDate >= out.rows[1].transactionDate).toBe(true);
    expect(out.rows[1].transactionDate >= out.rows[2].transactionDate).toBe(true);
  });

  test("dateFrom + dateTo filter narrows to May rows only (3)", async () => {
    const r = await useCases.searchTransactions({
      tenantId: fx.tenantId,
      query: undefined,
      filters: { dateFrom: "2026-05-01", dateTo: "2026-05-31" },
      cursor: null,
      limit: 50,
    });
    expect(r.isOk()).toBe(true);
    expect(r.value!.rows.length).toBe(3);
    for (const row of r.value!.rows) {
      expect(row.transactionDate >= "2026-05-01").toBe(true);
      expect(row.transactionDate <= "2026-05-31").toBe(true);
    }
  });

  test("categoryIds filter narrows to Food category (3 rows)", async () => {
    const r = await useCases.searchTransactions({
      tenantId: fx.tenantId,
      query: undefined,
      filters: { categoryIds: [fx.categoryFoodId] },
      cursor: null,
      limit: 50,
    });
    expect(r.isOk()).toBe(true);
    expect(r.value!.rows.length).toBe(3);
    for (const row of r.value!.rows) {
      expect(row.categoryId).toBe(fx.categoryFoodId);
    }
  });

  test("FTS query 'coffee' matches notes containing 'coffee' word (2 rows)", async () => {
    const r = await useCases.searchTransactions({
      tenantId: fx.tenantId,
      query: "coffee",
      filters: {},
      cursor: null,
      limit: 50,
    });
    expect(r.isOk()).toBe(true);
    expect(r.value!.rows.length).toBe(2);
    for (const row of r.value!.rows) {
      expect((row.note ?? "").toLowerCase()).toContain("coffee");
    }
  });

  test("FTS query with adversarial input (SQL-injection-ish) does not throw", async () => {
    // plainto_tsquery handles arbitrary user input safely
    const r = await useCases.searchTransactions({
      tenantId: fx.tenantId,
      query: "'; DROP TABLE expense_ledger; --",
      filters: {},
      cursor: null,
      limit: 50,
    });
    expect(r.isOk()).toBe(true);
  });

  test("cursor pagination: limit=2 returns first page; nextCursor + page 2 = full set, no overlap", async () => {
    const page1 = await useCases.searchTransactions({
      tenantId: fx.tenantId,
      query: undefined,
      filters: {},
      cursor: null,
      limit: 2,
    });
    expect(page1.isOk()).toBe(true);
    expect(page1.value!.rows.length).toBe(2);
    expect(page1.value!.nextCursor).not.toBeNull();

    const page2 = await useCases.searchTransactions({
      tenantId: fx.tenantId,
      query: undefined,
      filters: {},
      cursor: page1.value!.nextCursor,
      limit: 2,
    });
    expect(page2.isOk()).toBe(true);
    expect(page2.value!.rows.length).toBe(2);

    // No overlap between pages
    const ids1 = new Set(page1.value!.rows.map((r) => r.id));
    const ids2 = new Set(page2.value!.rows.map((r) => r.id));
    for (const id of ids2) expect(ids1.has(id)).toBe(false);
  });

  test("latest-only: edit a row → search returns the correction not the original", async () => {
    // Create + edit one expense in this fixture
    const ledgerId = await seedExpense(useCases, fx, "33.00", "2026-05-20", "Original-note-zztop", fx.categoryFoodId);

    const editR = await useCases.editTransaction({
      transactionId: ledgerId,
      edits: { note: "Edited-note-zztop" },
      actorUserId: fx.userId,
      tenantId: fx.tenantId,
    });
    expect(editR.isOk()).toBe(true);
    const correctionId = editR.value!.correctionId;

    const r = await useCases.searchTransactions({
      tenantId: fx.tenantId,
      query: "zztop",
      filters: {},
      cursor: null,
      limit: 50,
    });
    expect(r.isOk()).toBe(true);
    // Should find the correction row (latest-only) — not the original
    const found = r.value!.rows.find((row) => row.id === correctionId);
    expect(found).toBeDefined();
    expect(found!.note).toBe("Edited-note-zztop");
    expect(r.value!.rows.find((row) => row.id === ledgerId)).toBeUndefined();
  });

  test("cross-tenant: search in tenant A excludes tenant B rows (RLS)", async () => {
    // Seed second tenant with one row
    const fxB = await createFixture("xtenant");
    await seedExpense(useCases, fxB, "999.00", "2026-05-05", "tenantBmarker99", fx.categoryFoodId === fxB.categoryFoodId ? fxB.categoryFoodId : fxB.categoryFoodId);

    const r = await useCases.searchTransactions({
      tenantId: fx.tenantId,
      query: "tenantBmarker99",
      filters: {},
      cursor: null,
      limit: 50,
    });
    expect(r.isOk()).toBe(true);
    expect(r.value!.rows.length).toBe(0);
  });
});

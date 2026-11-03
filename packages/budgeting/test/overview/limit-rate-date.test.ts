/**
 * limit-rate-date.test.ts — D-08: a limit in a currency other than the
 * budget's counts at the CURRENT month's latest rate, and at a PAST month's
 * last rate within that month — frozen, a later rate never moves it.
 *
 * PLN budget; Rent is a EUR category with a 500.00 EUR limit from 1998-01.
 * Rates live in 1998, before the real FX history, so nothing real collides.
 * Real Postgres — run under `infisical run --env=dev`.
 */
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { Pool } from "pg";
import { ok } from "@budget/shared-kernel";
import { getSpendingsSummary } from "../../src/application/get-spendings-summary";
import { DrizzleCategoryRepo } from "../../src/adapters/persistence/category-repo";
import { DrizzleCategoryLimitRepo } from "../../src/adapters/persistence/category-limit-repo";
import { DrizzleTransactionRepo } from "../../src/adapters/persistence/transaction-repo";
import { createSpendingsSummaryRepo } from "../../src/adapters/persistence/spendings-summary-repo";
import { DrizzleFxRateCacheRepo } from "../../src/adapters/persistence/fx-rate-cache-repo";
import { CacheOnlyFxProvider } from "../../src/adapters/fx/cache-only";
import { convertCents } from "../../src/domain/fx-round";
import { seedFxRates, deleteFxRates } from "../fx-seed";

for (const k of ["DATABASE_URL_APP", "DATABASE_URL_WORKER", "DATABASE_URL_MIGRATOR"] as const) {
  if (process.env[k]) process.env[k] = process.env[k]!.replace("@db:", "@localhost:");
}

const TENANT = crypto.randomUUID();
const USER = crypto.randomUUID();
const RENT = crypto.randomUUID();
const ODD = crypto.randomUUID();
const PROVIDER = `test-14-07-${crypto.randomUUID()}`;

async function asApp<T>(fn: (p: Pool) => Promise<T>): Promise<T> {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL_APP! });
  const c = await pool.connect();
  try {
    await c.query(
      `SELECT set_config('app.current_user_id', $1, false), set_config('app.tenant_ids', $2, false)`,
      [USER, `{${TENANT}}`],
    );
    return await fn(c as unknown as Pool);
  } finally {
    c.release();
    await pool.end();
  }
}

let workerPool: Pool;

/** A fresh FX cache per read, so a rate seeded mid-test is seen. */
const summary = (month: string) =>
  getSpendingsSummary({
    categoryRepo: new DrizzleCategoryRepo(),
    categoryLimitRepo: new DrizzleCategoryLimitRepo(),
    transactionRepo: new DrizzleTransactionRepo(),
    summaryRepo: createSpendingsSummaryRepo(),
    reservePositions: async () =>
      ok({ positions: new Map(), cushionByMonth: new Map() } as never),
    fxProvider: new CacheOnlyFxProvider(new DrizzleFxRateCacheRepo(workerPool as never)),
    now: () => new Date("1998-02-05T12:00:00Z"),
  })({ tenantId: TENANT, budgetId: TENANT, month });

const rowOf = async (month: string, cat: string) => {
  const r = await summary(month);
  if (r.isErr()) throw r.error;
  return r.value.categories.find((c) => c.categoryId === cat)!;
};

describe.skipIf(!process.env.DATABASE_URL_APP)("Limits in another currency", () => {
  beforeAll(async () => {
    workerPool = new Pool({ connectionString: process.env.DATABASE_URL_WORKER! });
    await seedFxRates(
      [
        { base: "EUR", quote: "PLN", date: "1998-01-10", rate: "4.30" },
        { base: "EUR", quote: "PLN", date: "1998-01-28", rate: "4.40" },
        { base: "EUR", quote: "PLN", date: "1998-02-03", rate: "4.50" },
      ],
      PROVIDER,
    );
    await asApp(async (db) => {
      await db.query(
        `INSERT INTO identity.users (id, email, name, email_verified, created_at, updated_at)
         VALUES ($1, $2, 'Limit Rate', true, now(), now())`,
        [USER, `limit-rate-${USER.slice(0, 8)}@example.com`],
      );
      await db.query(
        `INSERT INTO tenancy.budgets (id, slug, name, kind, default_currency, owner_user_id, member_count, created_at)
         VALUES ($1, $2, 'Limit Rate', 'PRIVATE', 'PLN', $3, 1, now())`,
        [TENANT, `limit-rate-${TENANT.slice(0, 8)}`, USER],
      );
      for (const [id, name, ccy] of [
        [RENT, "Rent", "EUR"],
        [ODD, "Odd", "ZZQ"],
      ] as const) {
        await db.query(
          `INSERT INTO budgeting.categories (id, tenant_id, name, currency, created_at, actor_user_id)
           VALUES ($1, $2, $3, $4, '1998-01-01', $5)`,
          [id, TENANT, name, ccy, USER],
        );
        await db.query(
          `INSERT INTO budgeting.category_limits
             (id, tenant_id, category_id, normal_amount, normal_currency, cushion_amount,
              cushion_currency, effective_from, actor_user_id, created_at)
           VALUES (gen_random_uuid(), $1, $2, 50000, $3, 50000, $3, '1998-01-01', $4, now())`,
          [TENANT, id, ccy, USER],
        );
      }
    });
  });

  afterAll(async () => {
    await asApp(async (db) => {
      await db.query(`DELETE FROM budgeting.category_limits WHERE tenant_id = $1`, [TENANT]);
      await db.query(`DELETE FROM budgeting.categories WHERE tenant_id = $1`, [TENANT]);
      await db.query(`DELETE FROM tenancy.budgets WHERE id = $1`, [TENANT]);
    });
    await workerPool.end();
    await deleteFxRates(PROVIDER);
  });

  test("the limit repo reports each limit's own currency", async () => {
    const m = await new DrizzleCategoryLimitRepo().effectiveForMonths(TENANT, TENANT, ["1998-01-01"]);
    expect(m.get("1998-01-01")?.get(RENT)?.normalCurrency).toBe("EUR");
  });

  test("a past month counts at the last rate within it", async () => {
    const row = await rowOf("1998-01", RENT);
    expect(row.plannedCents).toBe(convertCents(50000n, "4.40").toString());
    expect(row.limitOriginalCents).toBe("50000");
    expect(row.limitCurrency).toBe("EUR");
  });

  test("the current month counts at the latest rate", async () => {
    const row = await rowOf("1998-02", RENT);
    expect(row.plannedCents).toBe(convertCents(50000n, "4.50").toString());
  });

  test("a later rate moves the current month but never a past one", async () => {
    await seedFxRates([{ base: "EUR", quote: "PLN", date: "1998-02-04", rate: "5.00" }], PROVIDER);
    expect((await rowOf("1998-01", RENT)).plannedCents).toBe(
      convertCents(50000n, "4.40").toString(),
    );
    expect((await rowOf("1998-02", RENT)).plannedCents).toBe(
      convertCents(50000n, "5.00").toString(),
    );
  });

  test("a limit with no FX pair counts as 0 and is flagged, the summary still answers", async () => {
    const row = await rowOf("1998-02", ODD);
    expect(row.plannedCents).toBe("0");
    expect(row.fxUnavailable).toBe(true);
  });
});

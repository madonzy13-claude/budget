/**
 * reserve-dtos-by-currency.test.ts — the read DTOs expose the per-currency
 * reserve model (D-10..D-16) and never total across currencies (D-02):
 * reserves summary rows in their own currency + per-currency totals + lines;
 * spendings-summary reserve cells in the budget currency.
 */
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { Pool } from "pg";
import { NOW, ReserveBudget } from "./currency-fixture";
import { getReservesSummary } from "../../src/application/get-reserves-summary";
import { getSpendingsSummary } from "../../src/application/get-spendings-summary";
import { DrizzleCategoriesRepo } from "../../src/adapters/persistence/categories-repo";
import { DrizzleCategoryRepo } from "../../src/adapters/persistence/category-repo";
import { DrizzleCategoryLimitRepo } from "../../src/adapters/persistence/category-limit-repo";
import { DrizzleTransactionRepo } from "../../src/adapters/persistence/transaction-repo";
import { createSpendingsSummaryRepo } from "../../src/adapters/persistence/spendings-summary-repo";
import { DrizzleFxRateCacheRepo } from "../../src/adapters/persistence/fx-rate-cache-repo";
import { CacheOnlyFxProvider } from "../../src/adapters/fx/cache-only";
import { convertCents } from "../../src/domain/fx-round";

const b = new ReserveBudget();
let P: string;
let E: string;
let workerPool: Pool;

describe.skipIf(!process.env.DATABASE_URL_APP)("Reserve DTOs per currency", () => {
  beforeAll(async () => {
    await b.create("PLN");
    workerPool = new Pool({ connectionString: process.env.DATABASE_URL_WORKER! });
    await b.rates([
      { base: "EUR", quote: "PLN", date: "1998-04-30", rate: "4.20" },
      { base: "EUR", quote: "PLN", date: "1998-05-01", rate: "4.30" },
      { base: "PLN", quote: "EUR", date: "1998-05-01", rate: "0.2326" },
    ]);
    P = await b.category("PLN");
    E = await b.category("EUR");
    // E: April limit 100 EUR, spent 110 EUR → 10 EUR overspend drawn from a
    // 50 EUR reserve adjusted in April. Then 28.50 EUR more in May → R = 68.50.
    await b.limit(E, 10000, "EUR", "1998-04-01");
    await b.adjust(E, 5000, "EUR", "1998-04-02T12:00:00Z");
    await b.tx(E, "1998-04-10", 11000, "EUR");
    await b.adjust(E, 2850, "EUR", "1998-05-02T12:00:00Z");
    await b.adjust(P, 20000, "PLN", "1998-05-02T12:00:00Z");
    await b.wallet("PLN", "200.00");
  });
  afterAll(async () => {
    await workerPool.end();
    await b.drop();
  });

  test("reserves summary: rows in their own currency, totals and lines per currency", async () => {
    const r = await getReservesSummary({
      reservePositions: (i) => b.positionsResult(i.tenantId),
      categoriesRepo: new DrizzleCategoriesRepo(),
      budgetCurrencyOf: async () => "PLN",
      isReservesEnabled: async () => true,
    })({ tenantId: b.tenant, budgetId: b.tenant });
    const dto = r._unsafeUnwrap();
    const eRow = dto.rows.find((x) => x.categoryId === E)!;
    expect(eRow).toMatchObject({ currency: "EUR", reserveCents: "6850" });
    expect(dto.rows.find((x) => x.categoryId === P)).toMatchObject({ currency: "PLN", reserveCents: "20000" });
    expect(dto.totals.needByCurrency).toEqual([
      { currency: "EUR", cents: "6850" },
      { currency: "PLN", cents: "20000" },
    ]);
    expect(dto.totals.walletsByCurrency).toEqual([{ currency: "PLN", cents: "20000" }]);
    const eq = convertCents(6850n, "4.30").toString();
    expect(dto.totals.lines).toEqual([
      { currency: "EUR", cents: "6850", direction: "TOPUP", equiv: { currency: "PLN", cents: eq } },
    ]);
    // Budget-currency figures, converted at today's rate — never a raw mix.
    expect(dto.totals.internalCents).toBe((20000n + BigInt(eq)).toString());
    expect(dto.totals.usedCents).toBe(convertCents(1000n, "4.30").toString());
  });

  test("spendings summary: a closed month's reserve draw reads in the budget currency", async () => {
    const r = await getSpendingsSummary({
      categoryRepo: new DrizzleCategoryRepo(),
      categoryLimitRepo: new DrizzleCategoryLimitRepo(),
      transactionRepo: new DrizzleTransactionRepo(),
      summaryRepo: createSpendingsSummaryRepo(),
      reservePositions: (i) => b.positionsResult(i.tenantId),
      fxProvider: new CacheOnlyFxProvider(new DrizzleFxRateCacheRepo(workerPool as never)),
      now: () => NOW,
    })({ tenantId: b.tenant, budgetId: b.tenant, month: "1998-04" });
    const row = r._unsafeUnwrap().categories.find((c) => c.categoryId === E)!;
    // 10 EUR at the last rate within April (4.20).
    expect(row.reserveUsedCents).toBe("4200");
    expect(row.spentCents).toBe(convertCents(11000n, "4.20").toString());
  });
});

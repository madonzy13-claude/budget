/**
 * past-month-reserve-currency.test.ts — owner, 261104: a past month in another
 * currency than the category's latest one reads its reserve used and overspent
 * in THAT month's currency — the cap (available) too, so the whole column
 * reads in the currency the month had (owner, 261104).
 *
 * M is EUR today, but April ran in PLN: limit 100 PLN, spent 150 PLN, the
 * 50 PLN overspend fully covered by a 50 EUR reserve put in before it.
 */
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { Pool } from "pg";
import { NOW, ReserveBudget } from "./currency-fixture";
import { getSpendingsSummary } from "../../src/application/get-spendings-summary";
import { DrizzleCategoryRepo } from "../../src/adapters/persistence/category-repo";
import { DrizzleCategoryLimitRepo } from "../../src/adapters/persistence/category-limit-repo";
import { DrizzleTransactionRepo } from "../../src/adapters/persistence/transaction-repo";
import { createSpendingsSummaryRepo } from "../../src/adapters/persistence/spendings-summary-repo";
import { DrizzleFxRateCacheRepo } from "../../src/adapters/persistence/fx-rate-cache-repo";
import { CacheOnlyFxProvider } from "../../src/adapters/fx/cache-only";

const b = new ReserveBudget();
let M: string;
let workerPool: Pool;

describe.skipIf(!process.env.DATABASE_URL_APP)("A past month's reserve in its own currency", () => {
  beforeAll(async () => {
    await b.create("PLN");
    workerPool = new Pool({ connectionString: process.env.DATABASE_URL_WORKER! });
    await b.rates([
      { base: "EUR", quote: "PLN", date: "1998-04-30", rate: "4.20" },
      { base: "PLN", quote: "EUR", date: "1998-04-30", rate: "0.2326" },
    ]);
    M = await b.category("EUR");
    await b.limit(M, 10000, "PLN", "1998-04-01", "1998-04-30");
    await b.limit(M, 10000, "EUR", "1998-05-01");
    await b.adjust(M, 5000, "EUR", "1998-04-02T12:00:00Z");
    await b.tx(M, "1998-04-10", 15000, "PLN");
  });
  afterAll(async () => {
    await workerPool.end();
    await b.drop();
  });

  test("reserve used and overspent read in the month's currency", async () => {
    const r = await getSpendingsSummary({
      categoryRepo: new DrizzleCategoryRepo(),
      categoryLimitRepo: new DrizzleCategoryLimitRepo(),
      transactionRepo: new DrizzleTransactionRepo(),
      summaryRepo: createSpendingsSummaryRepo(),
      reservePositions: (i) => b.positionsResult(i.tenantId),
      fxProvider: new CacheOnlyFxProvider(new DrizzleFxRateCacheRepo(workerPool as never)),
      now: () => NOW,
    })({ tenantId: b.tenant, budgetId: b.tenant, month: "1998-04" });
    const own = r._unsafeUnwrap().categories.find((c) => c.categoryId === M)!.own!;
    expect(own.currency).toBe("PLN");
    expect(own.spentCents).toBe("15000");
    expect(own.reserveUsedCents).toBe("5000");
    expect(own.overspentCents).toBe("0");
    // Available = used + what was left at the month's end. The engine drew
    // 50 PLN × 0.2326 = 11.63 EUR of the 50 EUR, leaving 38.37 EUR, which at
    // April's last rate (4.20) is 161.15 PLN → 50.00 + 161.15 = 211.15 PLN.
    expect(own.reserveAvailableCents).toBe("21115");
  });
});

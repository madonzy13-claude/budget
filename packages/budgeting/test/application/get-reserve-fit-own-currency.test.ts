/**
 * get-reserve-fit-own-currency.test.ts — 14-23 (user, 261104): "Is each reserve
 * the right size?" and its rebalance read a category in another currency in
 * THAT currency. The row's figures stay in the budget currency (they size the
 * chart); `own` carries the same walk in the category's currency.
 *
 * PLN budget; Trips is a EUR category, 100 EUR limit, 150 EUR spent in March —
 * a 50 EUR overage. EUR→PLN 4.30. Real Postgres (`infisical run --env=dev`).
 */
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { ReserveBudget } from "../reserves/currency-fixture";
import { getReserveFit } from "../../src/application/get-reserve-fit";
import { createOverviewRepo } from "../../src/adapters/persistence/overview-repo";
import { createReserveFitRepo } from "../../src/adapters/persistence/reserve-fit-repo";
import { DrizzleFxRateCacheRepo } from "../../src/adapters/persistence/fx-rate-cache-repo";
import { CacheOnlyFxProvider } from "../../src/adapters/fx/cache-only";
import { Pool } from "pg";

const b = new ReserveBudget();
let trips: string;
let workerPool: Pool;

describe.skipIf(!process.env.DATABASE_URL_APP)("Reserve fit in a category's own currency", () => {
  beforeAll(async () => {
    workerPool = new Pool({ connectionString: process.env.DATABASE_URL_WORKER! });
    await b.create("PLN");
    await b.rates([{ base: "EUR", quote: "PLN", date: "1998-01-01", rate: "4.30" }]);
    trips = await b.category("EUR");
    await b.limit(trips, 10000, "EUR", "1998-02-01");
    await b.tx(trips, "1998-03-10", 15000, "EUR");
  });
  afterAll(async () => {
    await b.drop();
    await workerPool.end();
  });

  test("a foreign category's row carries its walk in its own currency", async () => {
    const r = await getReserveFit({
      overviewRepo: createOverviewRepo(),
      exclusionsRepo: createReserveFitRepo(),
      inCategoryCurrency: {
        overviewRepo: createOverviewRepo({ inCategoryCurrency: true }),
        exclusionsRepo: createReserveFitRepo({ inCategoryCurrency: true }),
      },
      activeScheduledPayments: async () => [],
      reservePositions: () => b.positionsResult(),
      metaReader: { getBudgetMeta: async () => ({ default_currency: "PLN" }) },
      fxProvider: new CacheOnlyFxProvider(new DrizzleFxRateCacheRepo(workerPool as never)),
      now: () => new Date("1998-05-15T12:00:00Z"),
    })({ tenantId: b.tenant, budgetId: b.tenant, from: "1998-02-01", to: "1998-04-30" });
    const dto = r._unsafeUnwrap();
    const row = dto.rows.find((x) => x.category_id === trips)!;
    expect(row.currency).toBe("EUR");
    // Sized in złoty, labelled in euro.
    expect(row.worst_overage_cents).toBe("21500");
    expect(row.own?.worst_overage_cents).toBe("5000");
    const proj = dto.projected_by_category.find((x) => x.category_id === trips)!;
    expect(proj.currency).toBe("EUR");
    expect(proj.own_projected_monthly_cents).toBeDefined();
  });
});

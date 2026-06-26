import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { InMemoryPriceProvider } from "@budget/investments/src/ports/price-provider";
import {
  seedBudget,
  seedInstrument,
  seedHolding,
  cacheRowExists,
  deleteBudgetInvestments,
  cleanupReferenceData,
  workerSeedPool,
  type SeededBudget,
} from "./_investment-fixtures";
import { runInstrumentPriceHourly } from "../src/handlers/instrument-price-hourly";

const PROVIDER = "test_hourly";
let budget: SeededBudget;
let eq1: string;
let eq2: string;
let metal: string;
let manualInst: string;

beforeAll(async () => {
  await cleanupReferenceData(PROVIDER);
  budget = await seedBudget();
  eq1 = await seedInstrument({
    symbol: "AAPL",
    provider: PROVIDER,
    refreshCadence: "hourly",
  });
  eq2 = await seedInstrument({
    symbol: "MSFT",
    provider: PROVIDER,
    refreshCadence: "hourly",
  });
  metal = await seedInstrument({
    symbol: "XAU",
    provider: PROVIDER,
    refreshCadence: "daily",
    assetClass: "commodity",
  });
  // Manual-priced (non-US): held, hourly cadence, but provider='manual' → the cron
  // MUST skip it (the user maintains its price; no free server-side source).
  manualInst = await seedInstrument({
    symbol: "CDR_TEST",
    provider: "manual",
    refreshCadence: "hourly",
    quoteCurrency: "PLN",
  });
  await seedHolding(budget.budgetId, { name: "Apple", instrumentId: eq1 });
  await seedHolding(budget.budgetId, { name: "Microsoft", instrumentId: eq2 });
  await seedHolding(budget.budgetId, {
    name: "Gold",
    instrumentId: metal,
    holdingType: "commodity",
  });
  await seedHolding(budget.budgetId, {
    name: "CD Projekt",
    instrumentId: manualInst,
    holdingType: "equities",
  });
  await seedHolding(budget.budgetId, {
    name: "My Watch",
    instrumentId: null,
    holdingType: "other",
  });
});

afterAll(async () => {
  await deleteBudgetInvestments(budget.budgetId);
  await cleanupReferenceData(PROVIDER);
  // The 'manual' provider row is outside the test_hourly cleanup prefix.
  await workerSeedPool.query(
    `DELETE FROM budgeting.instruments WHERE provider = 'manual' AND symbol = 'CDR_TEST'`,
  );
});

describe("instrument-price-hourly job (INV-13)", () => {
  it("fetches held tracked hourly instruments; excludes custom holdings + daily metals", async () => {
    const provider = new InMemoryPriceProvider({
      AAPL: { price: "189.50", currency: "USD" },
      MSFT: { price: "420.00", currency: "USD" },
      XAU: { price: "2350", currency: "USD" }, // seeded but must NOT be fetched (daily cadence)
      CDR_TEST: { price: "100", currency: "PLN" }, // priceable in the stub, but provider='manual' → must NOT be scanned
    });
    const result = await runInstrumentPriceHourly(provider);

    // The cron is cross-tenant/global by design, so on a shared dev DB other
    // budgets' real holdings may also be scanned (and fail against this in-memory
    // stub). Assert on THIS test's instruments specifically, not global counters.
    expect(result.fetched).toBeGreaterThanOrEqual(2);
    expect(await cacheRowExists(eq1)).toBe(true);
    expect(await cacheRowExists(eq2)).toBe(true);
    // metal is refresh_cadence='daily' → excluded from hourly cron (Pitfall 3 / T-9-10)
    expect(await cacheRowExists(metal)).toBe(false);
    // CDR_TEST is provider='manual' → user-priced, never auto-fetched (9.2).
    expect(await cacheRowExists(manualInst)).toBe(false);
  });

  it("a provider error on one instrument increments failed without aborting the loop", async () => {
    const provider = new InMemoryPriceProvider({
      AAPL: { price: "190.00", currency: "USD" },
      // MSFT intentionally missing → currentPrice throws NoPriceAvailable
    });
    const result = await runInstrumentPriceHourly(provider);
    expect(result.failed).toBeGreaterThanOrEqual(1);
    expect(result.fetched).toBeGreaterThanOrEqual(1);
  });
});

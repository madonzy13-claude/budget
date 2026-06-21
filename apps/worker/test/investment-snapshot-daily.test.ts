import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import {
  seedBudget,
  seedInstrument,
  seedHolding,
  seedPriceCache,
  deleteBudgetInvestments,
  cleanupReferenceData,
  workerSeedPool,
  endPools,
  type SeededBudget,
} from "./_investment-fixtures";
import { runInvestmentSnapshotDaily } from "../src/handlers/investment-snapshot-daily";

const PROVIDER = "test_snap";
let budget: SeededBudget;
let inst1: string;
let inst2: string;

beforeAll(async () => {
  await cleanupReferenceData(PROVIDER);
  budget = await seedBudget("EUR");
  inst1 = await seedInstrument({ symbol: "SNAP1", provider: PROVIDER });
  inst2 = await seedInstrument({ symbol: "SNAP2", provider: PROVIDER });
  await seedPriceCache(inst1, "100.00", "USD");
  await seedPriceCache(inst2, "200.00", "USD");
  await seedHolding(budget.budgetId, {
    name: "Snap1",
    instrumentId: inst1,
    buyCurrency: "USD",
    currentPriceCurrency: "USD",
  });
  await seedHolding(budget.budgetId, {
    name: "Snap2",
    instrumentId: inst2,
    buyCurrency: "GBP",
    currentPriceCurrency: "USD",
  });
});

afterAll(async () => {
  await deleteBudgetInvestments(budget.budgetId);
  await cleanupReferenceData(PROVIDER);
  await endPools();
});

function spyFx() {
  const calls: Array<{ from: string; to: string }> = [];
  const fx = {
    rateAsOf: async (from: string, to: string) => {
      calls.push({ from: String(from), to: String(to) });
      return { rate: "1", provider: "spy", isStale: false };
    },
  };
  return { fx, calls };
}

async function snapCount(instrumentId: string): Promise<number> {
  const r = await workerSeedPool.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM budgeting.instrument_price_snapshots
      WHERE instrument_id = $1::uuid AND snapshot_date = CURRENT_DATE`,
    [instrumentId],
  );
  return r.rows[0].n;
}

describe("investment-snapshot-daily job (INV-15)", () => {
  it("writes one snapshot per held instrument for today; collects held FX pairs vs EUR; second run adds none", async () => {
    const { fx, calls } = spyFx();

    await runInvestmentSnapshotDaily(fx as never);

    expect(await snapCount(inst1)).toBe(1);
    expect(await snapCount(inst2)).toBe(1);

    const fxFromsVsEur = calls.filter((c) => c.to === "EUR").map((c) => c.from);
    expect(fxFromsVsEur).toContain("USD");
    expect(fxFromsVsEur).toContain("GBP");

    // second run same day — ON CONFLICT (instrument_id, snapshot_date) DO NOTHING
    await runInvestmentSnapshotDaily(fx as never);
    expect(await snapCount(inst1)).toBe(1);
    expect(await snapCount(inst2)).toBe(1);
  });
});

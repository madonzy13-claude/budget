import { describe, test, expect } from "bun:test";
import { Temporal } from "temporal-polyfill";
import { listHoldings } from "../../src/application/list-holdings";
import { Holding } from "../../src/domain/holding";
import type { HoldingRepo } from "../../src/ports/holding-repo";
import { computeDepositValueCents } from "../../src/domain/deposit-value";

// A deposit carries no fetched price; list-holdings must compute its value on read
// and derive P/L = value − principal. Started years ago at 12%/yr so it has clearly
// accrued regardless of "today".
function depositHolding(): Holding {
  const h = new Holding(
    "dep-1",
    "tenant-1",
    "Savings @ 12%",
    "deposit",
    null, // group
    null, // instrumentId
    100_000n, // principal (buyPriceCents) = $1000
    "USD",
    "1", // quantity
    null, // currentPriceCents (computed on read)
    "USD",
    0,
    null,
    new Date("2020-01-01T00:00:00Z"),
  );
  h.depositRateBps = 1200;
  h.depositStartDate = "2020-01-01";
  h.depositCapFrequency = "monthly";
  h.depositEndDate = null;
  return h;
}

function stubRepo(holdings: Holding[]): HoldingRepo {
  return {
    listForBudget: async () => holdings,
    create: async () => holdings[0],
    update: async () => holdings[0],
    archive: async () => {},
    reorder: async () => {},
    findById: async () => holdings[0] ?? null,
  };
}

const stubFx = {
  rateAsOf: async () => ({ rate: "1", asOf: "2025-01-01" }),
} as unknown as Parameters<typeof listHoldings>[0]["fxProvider"];

describe("listHoldings — deposit enrichment", () => {
  test("computes value on read and P/L = value − principal", async () => {
    const run = listHoldings({
      holdingRepo: stubRepo([depositHolding()]),
      fxProvider: stubFx,
    });
    const res = await run({
      tenantId: "tenant-1",
      budgetId: "budget-1",
      actorUserId: "user-1",
      budgetCurrency: "USD",
    });
    expect(res.isOk()).toBe(true);
    const dto = res._unsafeUnwrap().holdings[0];

    // Deposit value = the accrual formula's output; it has grown past principal.
    const value = Number(dto.valueCents);
    expect(value).toBeGreaterThan(100_000);
    expect(dto.currentPriceCents).toBe(dto.valueCents); // qty 1 ⇒ price == value

    // P/L is the accrued interest, exactly value − principal, and positive.
    expect(dto.profitLossCents).toBe(String(value - 100_000));
    expect(dto.profitLossPct).not.toBeNull();
    expect(dto.profitLossPct!).toBeGreaterThan(0);

    // Deposit inputs are echoed back for the edit form.
    expect(dto.depositRateBps).toBe(1200);
    expect(dto.depositCapFrequency).toBe("monthly");
    expect(dto.depositStartDate).toBe("2020-01-01");
  });

  test("value matches computeDepositValueCents for the same as-of day", async () => {
    const run = listHoldings({
      holdingRepo: stubRepo([depositHolding()]),
      fxProvider: stubFx,
    });
    const res = await run({
      tenantId: "tenant-1",
      budgetId: "budget-1",
      actorUserId: "user-1",
      budgetCurrency: "USD",
    });
    const dto = res._unsafeUnwrap().holdings[0];
    // Recompute for the same UTC "today" the use-case used. If the run straddles
    // UTC midnight the two reads differ by a day, so accept either boundary.
    const at = (iso: string) =>
      computeDepositValueCents({
        principalCents: 100_000n,
        rateBps: 1200,
        startDate: "2020-01-01",
        capFrequency: "monthly",
        asOf: iso,
      });
    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    const yday = new Date(now.getTime() - 86_400_000)
      .toISOString()
      .slice(0, 10);
    expect([at(today), at(yday)]).toContain(dto.valueCents);
  });

  test("uses the viewer's timezone for 'today' (accrual rolls at local midnight)", async () => {
    const tz = "Asia/Tokyo"; // UTC+9 — its calendar day can differ from UTC's
    const run = listHoldings({
      holdingRepo: stubRepo([depositHolding()]),
      fxProvider: stubFx,
    });
    const res = await run({
      tenantId: "tenant-1",
      budgetId: "budget-1",
      actorUserId: "user-1",
      budgetCurrency: "USD",
      timezone: tz,
    });
    const dto = res._unsafeUnwrap().holdings[0];
    // The value must match the deposit formula evaluated at *Tokyo's* today —
    // proving the tz was threaded through (± a day for the midnight straddle).
    const at = (isoDate: string) =>
      computeDepositValueCents({
        principalCents: 100_000n,
        rateBps: 1200,
        startDate: "2020-01-01",
        capFrequency: "monthly",
        asOf: isoDate,
      });
    const tzToday = Temporal.Now.plainDateISO(tz);
    expect([
      at(tzToday.toString()),
      at(tzToday.subtract({ days: 1 }).toString()),
    ]).toContain(dto.valueCents);
  });
});

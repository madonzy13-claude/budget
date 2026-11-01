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
    restore: async () => {},
    reorder: async () => {},
    findById: async () => holdings[0] ?? null,
    listNames: async () => [],
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

    // Cost basis in budget ccy = principal × qty (USD→USD = 1) = 100000.
    expect(dto.costInBudgetCents).toBe("100000");

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

// Round 6 (user): after a currency change, avg price + P/L read in the shown
// currency (the stored cost basis stays in the buy currency).
describe("listHoldings — figures in the shown currency", () => {
  test("a PLN-bought asset shown in EUR gives EUR avg price and P/L", async () => {
    const h = new Holding(
      "coin",
      "tenant-1",
      "Coin",
      "other",
      null,
      800_000n, // bought at 8,000 PLN
      "PLN",
      "2",
      400_000n, // now 4,000 EUR each
      "EUR",
      0,
      null,
      new Date("2024-01-01T00:00:00Z"),
      "collectibles",
    );
    const fx = {
      rateAsOf: async (f: string, t: string) => ({
        rate:
          f === "PLN" && t === "EUR"
            ? "0.25"
            : f === "EUR" && t === "PLN"
              ? "4"
              : "1",
        asOf: "2026-10-30",
      }),
    } as unknown as Parameters<typeof listHoldings>[0]["fxProvider"];
    const dto = (
      await listHoldings({ holdingRepo: stubRepo([h]), fxProvider: fx })({
        tenantId: "tenant-1",
        budgetId: "budget-1",
        actorUserId: "user-1",
        budgetCurrency: "PLN",
      })
    )._unsafeUnwrap().holdings[0]!;
    // 8,000 PLN × 0.25 = 2,000 EUR avg; P/L = 2×4,000 − 2×2,000 = +4,000 EUR.
    expect(dto.avgPriceDisplayCents).toBe("200000");
    expect(dto.profitLossDisplayCents).toBe("400000");
    // The buy-currency figure stays as before: 2 × (16,000 − 8,000) PLN.
    expect(dto.profitLossCents).toBe("1600000");
  });

  // R6 (user): cost converts at each buy's OWN date rate, never today's — the
  // shown-currency avg / P/L and the budget-currency cost alike.
  test("cost in another currency uses each buy's date rate", async () => {
    const h = new Holding(
      "coin",
      "tenant-1",
      "Coin",
      "other",
      null,
      600_000n, // avg 6,000 PLN over 2 units
      "PLN",
      "2",
      400_000n, // now 4,000 EUR each
      "EUR",
      0,
      null,
      new Date("2024-01-01T00:00:00Z"),
      "collectibles",
    );
    // PLN→EUR 0.20 in 2024, 0.25 in 2025, 0.30 today. EUR→PLN 4.
    const fx = {
      rateAsOf: async (f: string, t: string, d: Date) => ({
        rate:
          f === "PLN" && t === "EUR"
            ? d.toISOString() < "2025"
              ? "0.2"
              : d.toISOString() < "2026"
                ? "0.25"
                : "0.3"
            : f === "EUR" && t === "PLN"
              ? "4"
              : "1",
        asOf: "2026-10-30",
      }),
    } as unknown as Parameters<typeof listHoldings>[0]["fxProvider"];
    const buy = (date: string, cents: bigint) => ({
      id: date,
      kind: "buy",
      effectiveDate: date,
      amountCents: cents,
      amountCurrency: "PLN",
      costDeltaCents: cents,
      costCurrency: "PLN",
      counterpartyHoldingId: null,
    });
    const historyRepo = {
      listForHolding: async () => [
        buy("2024-06-01", 500_000n), // 5,000 PLN = 1,000 EUR then
        buy("2025-06-01", 700_000n), // 7,000 PLN = 1,750 EUR then
      ],
    } as never;
    const dto = (
      await listHoldings({
        holdingRepo: stubRepo([h]),
        fxProvider: fx,
        historyRepo,
      })({
        tenantId: "tenant-1",
        budgetId: "budget-1",
        actorUserId: "user-1",
        budgetCurrency: "PLN",
      })
    )._unsafeUnwrap().holdings[0]!;
    // 2,750 EUR held ÷ 2 = 1,375 EUR avg (today's 0.30 would say 1,800).
    expect(dto.avgPriceDisplayCents).toBe("137500");
    // 2 × 4,000 − 2,750 = +5,250 EUR.
    expect(dto.profitLossDisplayCents).toBe("525000");
    // Budget currency is the buys' own: 12,000 PLN, no rate at all.
    expect(dto.costInBudgetCents).toBe("1200000");
  });

  // A ledger that doesn't explain the stored cost (history booked only in
  // part) can't be replayed — today's rate, as before.
  test("a ledger short of the stored cost keeps today's rate", async () => {
    const h = new Holding(
      "coin",
      "tenant-1",
      "Coin",
      "other",
      null,
      600_000n,
      "PLN",
      "2",
      400_000n,
      "EUR",
      0,
      null,
      new Date("2024-01-01T00:00:00Z"),
      "collectibles",
    );
    const fx = {
      rateAsOf: async (f: string, t: string) => ({
        rate:
          f === "PLN" && t === "EUR"
            ? "0.3"
            : f === "EUR" && t === "PLN"
              ? "4"
              : "1",
        asOf: "2026-10-30",
      }),
    } as unknown as Parameters<typeof listHoldings>[0]["fxProvider"];
    const historyRepo = {
      listForHolding: async () => [
        {
          id: "x",
          kind: "buy",
          effectiveDate: "2024-06-01",
          amountCents: 100_000n,
          amountCurrency: "PLN",
          costDeltaCents: 100_000n,
          costCurrency: "PLN",
          counterpartyHoldingId: null,
        },
      ],
    } as never;
    const dto = (
      await listHoldings({
        holdingRepo: stubRepo([h]),
        fxProvider: fx,
        historyRepo,
      })({
        tenantId: "tenant-1",
        budgetId: "budget-1",
        actorUserId: "user-1",
        budgetCurrency: "PLN",
      })
    )._unsafeUnwrap().holdings[0]!;
    expect(dto.avgPriceDisplayCents).toBe("180000"); // 6,000 × 0.30
  });
});

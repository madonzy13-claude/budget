/**
 * currency-pl.test.ts — R6 (user): an asset's or group's P/L in a chosen
 * currency replays its ledger at each entry's OWN date rate, never today's.
 */
import { describe, test, expect } from "bun:test";
import {
  replayInCurrency,
  type ReplayEntry,
} from "../../src/domain/currency-pl";

const e = (over: Partial<ReplayEntry>): ReplayEntry => ({
  kind: "buy",
  effectiveDate: "2024-01-01",
  amountCents: null,
  amountCurrency: null,
  costDeltaCents: 0n,
  costCurrency: "EUR",
  counterpartyHoldingId: null,
  ...over,
});

// 1 EUR in USD: 1.10 on the buy, 1.20 on the sale.
const rates: Record<string, number> = {
  "EUR@2024-01-01": 1.1,
  "EUR@2025-01-01": 1.2,
  "USD@2024-01-01": 1,
  "USD@2025-01-01": 1,
};
const rateAt = (ccy: string, date: string) => rates[`${ccy}@${date}`]!;

describe("replayInCurrency", () => {
  test("cost and realized use each entry's own date rate", () => {
    const r = replayInCurrency(
      [
        // bought for 1,000 EUR = 1,100 USD then
        e({
          amountCents: 100_000n,
          amountCurrency: "EUR",
          costDeltaCents: 100_000n,
        }),
        // sold half for 600 EUR = 720 USD a year later
        e({
          kind: "withdraw",
          effectiveDate: "2025-01-01",
          amountCents: 60_000n,
          amountCurrency: "EUR",
          costDeltaCents: -50_000n,
        }),
      ],
      rateAt,
    );
    expect(r.costCents).toBe(55_000n); // half of 1,100 USD stays as cost
    expect(r.realizedCents).toBe(17_000n); // 720 − 550
    expect(r.contributedCents).toBe(110_000n);
  });

  test("a swap inside the group is not money put in", () => {
    const r = replayInCurrency(
      [
        e({
          kind: "convert_in",
          amountCents: 50_000n,
          amountCurrency: "USD",
          costDeltaCents: 50_000n,
          counterpartyHoldingId: "sibling",
        }),
      ],
      rateAt,
      (x) => x.counterpartyHoldingId === "sibling",
    );
    expect(r.costCents).toBe(50_000n);
    expect(r.contributedCents).toBe(0n);
  });

  test("market moves change nothing in the replay", () => {
    const r = replayInCurrency(
      [
        e({
          amountCents: 10_000n,
          amountCurrency: "USD",
          costDeltaCents: 10_000n,
        }),
        e({ kind: "value_change", costDeltaCents: 0n }),
      ],
      rateAt,
    );
    expect(r).toEqual({
      costCents: 10_000n,
      realizedCents: 0n,
      contributedCents: 10_000n,
    });
  });
});

/**
 * recurring-engine-fx-bounds.test.ts — T-02-WORKER-FX mitigation unit test.
 *
 * `computeRecurringFx` is the FX-computation helper used by the recurring
 * draft engine. It must:
 *   - Skip the FX call entirely when rule.currency === budget.currency
 *   - Otherwise call FxProvider.rateAsOf and enforce 0 < rate < 1e6
 *   - Compute amount_converted_cents = round(amount_original_cents * rate)
 */
import { describe, test, expect } from "bun:test";
import {
  computeRecurringFx,
  type RecurringFxInput,
} from "@budget/budgeting/src/application/recurring-engine-fx";

class StubFxProvider {
  constructor(private readonly rate: string) {}
  async rateAsOf(): Promise<{
    rate: string;
    provider: string;
    isStale: boolean;
  }> {
    return { rate: this.rate, provider: "stub", isStale: false };
  }
}

function input(overrides: Partial<RecurringFxInput> = {}): RecurringFxInput {
  return {
    ruleCurrency: "USD",
    budgetCurrency: "USD",
    amountOriginalCents: "10000",
    dueDateStr: "2026-05-12",
    fxProvider: new StubFxProvider("1"),
    ...overrides,
  };
}

describe("computeRecurringFx (T-02-WORKER-FX)", () => {
  test("same currency: rate=1, converted=original, no FX call (path identity)", async () => {
    let called = false;
    const fxProvider = {
      rateAsOf: async () => {
        called = true;
        return { rate: "999", provider: "stub", isStale: false };
      },
    };

    const out = await computeRecurringFx(input({ fxProvider }));

    expect(out.fxRate).toBe("1");
    expect(out.amountConvertedCents).toBe("10000");
    expect(out.fxAsOf).toBe("2026-05-12");
    expect(called).toBe(false);
  });

  test("cross-currency: FX provider invoked, converted reflects rate", async () => {
    const out = await computeRecurringFx(
      input({
        ruleCurrency: "EUR",
        budgetCurrency: "USD",
        amountOriginalCents: "10000",
        fxProvider: new StubFxProvider("1.10"),
      }),
    );

    expect(out.fxRate).toBe("1.10");
    expect(out.amountConvertedCents).toBe("11000"); // 10000 * 1.10
    expect(out.fxAsOf).toBe("2026-05-12");
  });

  test("cross-currency rejects rate = 0", async () => {
    await expect(
      computeRecurringFx(
        input({
          ruleCurrency: "EUR",
          budgetCurrency: "USD",
          fxProvider: new StubFxProvider("0"),
        }),
      ),
    ).rejects.toThrow(/out of bounds/i);
  });

  test("cross-currency rejects negative rate", async () => {
    await expect(
      computeRecurringFx(
        input({
          ruleCurrency: "EUR",
          budgetCurrency: "USD",
          fxProvider: new StubFxProvider("-0.5"),
        }),
      ),
    ).rejects.toThrow(/out of bounds/i);
  });

  test("cross-currency rejects rate >= 1e6", async () => {
    await expect(
      computeRecurringFx(
        input({
          ruleCurrency: "EUR",
          budgetCurrency: "USD",
          fxProvider: new StubFxProvider("1000000"),
        }),
      ),
    ).rejects.toThrow(/out of bounds/i);
  });

  test("cross-currency rejects NaN rate", async () => {
    await expect(
      computeRecurringFx(
        input({
          ruleCurrency: "EUR",
          budgetCurrency: "USD",
          fxProvider: new StubFxProvider("not-a-number"),
        }),
      ),
    ).rejects.toThrow(/out of bounds/i);
  });
});

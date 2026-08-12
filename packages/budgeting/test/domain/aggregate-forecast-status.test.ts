// aggregate-forecast-status — one verdict across every included budget.
//
// The reader owns all of these budgets, so a hole in one is only a real problem
// if the others cannot cover it. Yellow is the "move money" state: nothing is
// missing, it is just in the wrong account (user, 260811).
import { describe, test, expect } from "bun:test";
import { aggregateForecastStatus } from "@budget/budgeting/src/domain/aggregate-forecast-status";

const ok = (spare: bigint) => ({ shortfallCents: 0n, spareCents: spare });
const short = (need: bigint) => ({ shortfallCents: need, spareCents: 0n });

describe("aggregateForecastStatus", () => {
  test("every budget above water → green", () => {
    expect(aggregateForecastStatus([ok(10_000n), ok(0n)])).toBe("green");
  });

  test("no budgets at all → green (nothing to worry about)", () => {
    expect(aggregateForecastStatus([])).toBe("green");
  });

  test("a hole the others can cover → yellow, not red", () => {
    // 300 short in one budget, 500 spare elsewhere: the money exists.
    expect(aggregateForecastStatus([short(30_000n), ok(50_000n)])).toBe(
      "yellow",
    );
  });

  test("a hole nothing can cover → red", () => {
    expect(aggregateForecastStatus([short(50_000n), ok(30_000n)])).toBe("red");
  });

  test("covered to the exact cent is still yellow", () => {
    expect(aggregateForecastStatus([short(30_000n), ok(30_000n)])).toBe(
      "yellow",
    );
  });

  test("one cent short of covering is red", () => {
    expect(aggregateForecastStatus([short(30_001n), ok(30_000n)])).toBe("red");
  });

  test("several holes are summed against several spares", () => {
    expect(
      aggregateForecastStatus([
        short(10_000n),
        short(15_000n),
        ok(12_000n),
        ok(14_000n),
      ]),
    ).toBe("yellow");
    expect(
      aggregateForecastStatus([
        short(10_000n),
        short(15_000n),
        ok(12_000n),
        ok(2_000n),
      ]),
    ).toBe("red");
  });

  test("a budget in the red lends nothing, whatever its spare says", () => {
    // Defensive: a caller that fills in both fields must not have the shortfall
    // budget's own cash counted as available to itself.
    expect(
      aggregateForecastStatus([
        { shortfallCents: 40_000n, spareCents: 90_000n },
        ok(10_000n),
      ]),
    ).toBe("red");
  });
});

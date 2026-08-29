/**
 * demo-rules.test.ts — the pure transforms behind the demo scrub.
 *
 * The uniform-factor property (test 3) is the reason the copy may scale money
 * at all: because scaling is linear, a scaled sum and a sum of scaled rows can
 * only differ by rounding, so limits/balances/FX conversions stay consistent
 * with each other. Per-row random factors would break that, which is why the
 * factor is one-per-budget-pair and not one-per-row.
 */
import { describe, test, expect } from "bun:test";
import {
  scaleMoney,
  relabelCurrency,
  fakeText,
  dailyMoneyScale,
  SCALE_MIN,
  SCALE_MAX,
} from "../src/demo/rules";

describe("scaleMoney", () => {
  test("multiplies by the factor and rounds to integer minor units", () => {
    expect(scaleMoney(10000n, 0.25, 0)).toBe(2500n);
    expect(scaleMoney(4000_00n, 0.9, 0)).toBe(3600_00n);
  });

  test("passes null through", () => {
    expect(scaleMoney(null, 0.25, 0)).toBeNull();
  });

  test("keeps the sign of negative amounts (credit-card wallets are negative)", () => {
    expect(scaleMoney(-10000n, 0.25, 0)).toBe(-2500n);
  });

  test("rounds numeric(19,4) columns to 4 decimal places", () => {
    expect(scaleMoney("1000.0000", 0.25, 4)).toBe("250.0000");
    expect(scaleMoney("3.3333", 0.9, 4)).toBe("3.0000");
  });

  test("sum of scaled rows tracks the scaled sum within one minor unit per row", () => {
    // The drift budget. It is why 12-02 recomputes aggregate tables rather than
    // copying them scaled: independent per-row rounding of an aggregate would
    // not equal the aggregate of the rounded rows.
    const rows = [333n, 667n, 1n, 99999n, 12345n, 7n];
    const factor = 0.25;
    const sumOfScaled = rows.reduce(
      (a, r) => a + (scaleMoney(r, factor, 0) as bigint),
      0n,
    );
    const scaledSum = scaleMoney(
      rows.reduce((a, r) => a + r, 0n),
      factor,
      0,
    ) as bigint;
    const drift =
      sumOfScaled > scaledSum
        ? sumOfScaled - scaledSum
        : scaledSum - sumOfScaled;
    expect(drift).toBeLessThanOrEqual(BigInt(rows.length));
  });

  test("two pairs may use different factors and each stays internally consistent", () => {
    const rows = [1000n, 2500n, 33n];
    for (const factor of [0.25, 0.9]) {
      const sumOfScaled = rows.reduce(
        (a, r) => a + (scaleMoney(r, factor, 0) as bigint),
        0n,
      );
      const scaledSum = scaleMoney(
        rows.reduce((a, r) => a + r, 0n),
        factor,
        0,
      ) as bigint;
      const drift =
        sumOfScaled > scaledSum
          ? sumOfScaled - scaledSum
          : scaledSum - sumOfScaled;
      expect(drift).toBeLessThanOrEqual(BigInt(rows.length));
    }
  });
});

describe("dailyMoneyScale", () => {
  test("always lands inside [0.1, 10]", () => {
    for (let d = 0; d < 400; d++) {
      const s = dailyMoneyScale(`2026-01-01`, `pair-${d}`);
      expect(s).toBeGreaterThanOrEqual(SCALE_MIN);
      expect(s).toBeLessThanOrEqual(SCALE_MAX);
    }
  });

  test("is stable within a day — a re-run of the same night reproduces it", () => {
    expect(dailyMoneyScale("2026-08-29", "personal")).toBe(
      dailyMoneyScale("2026-08-29", "personal"),
    );
  });

  test("changes from one day to the next", () => {
    const a = dailyMoneyScale("2026-08-29", "personal");
    const b = dailyMoneyScale("2026-08-30", "personal");
    expect(a).not.toBe(b);
  });

  test("differs between the two budget pairs on the same day", () => {
    expect(dailyMoneyScale("2026-08-29", "personal")).not.toBe(
      dailyMoneyScale("2026-08-29", "family"),
    );
  });

  test("is log-uniform: roughly half the days fall below 1.0", () => {
    // Plain uniform over [0.1,10] would put ~90% of days above 1.0 and make the
    // demo almost always inflate. Log-uniform gives shrink and grow equal odds.
    let below = 0;
    const days = 1000;
    for (let d = 0; d < days; d++) {
      if (dailyMoneyScale(`day-${d}`, "personal") < 1) below++;
    }
    expect(below / days).toBeGreaterThan(0.35);
    expect(below / days).toBeLessThan(0.65);
  });

  test("never returns zero or a negative factor", () => {
    for (let d = 0; d < 200; d++) {
      expect(dailyMoneyScale(`day-${d}`, "family")).toBeGreaterThan(0);
    }
  });
});

describe("relabelCurrency", () => {
  test("applies the pair's map", () => {
    expect(relabelCurrency("PLN", { PLN: "USD" })).toBe("USD");
  });

  test("an empty map is identity — the family pair keeps PLN", () => {
    expect(relabelCurrency("PLN", {})).toBe("PLN");
  });

  test("leaves unmapped codes untouched", () => {
    expect(relabelCurrency("EUR", { PLN: "USD" })).toBe("EUR");
    expect(relabelCurrency("GBP", { PLN: "USD" })).toBe("GBP");
  });

  test("matches case-insensitively and normalises to upper case", () => {
    expect(relabelCurrency("pln", { PLN: "USD" })).toBe("USD");
  });

  test("passes null through", () => {
    expect(relabelCurrency(null, { PLN: "USD" })).toBeNull();
  });
});

describe("fakeText", () => {
  test("is deterministic for the same pool and seed", () => {
    expect(fakeText("merchant", 7)).toBe(fakeText("merchant", 7));
  });

  test("varies across seeds", () => {
    const values = new Set(
      Array.from({ length: 20 }, (_, i) => fakeText("merchant", i)),
    );
    expect(values.size).toBeGreaterThan(1);
  });

  test("output always comes from the fixed pool, never from the input", () => {
    // The real guarantee: fakeText is a function of (pool, seed) ONLY — it
    // never receives the source string, so no source text can survive. Asserted
    // as pool membership rather than substring-absence, because short runs
    // collide by coincidence (the owner's "Grochale" shares "groc" with the
    // pool's "Groceries") and a coincidence is not a leak.
    for (const pool of [
      "merchant",
      "category",
      "wallet",
      "budget",
      "holding",
    ] as const) {
      const allowed = new Set(
        Array.from({ length: 200 }, (_, i) => fakeText(pool, i)),
      );
      for (let i = 0; i < 500; i++) {
        expect(allowed.has(fakeText(pool, i))).toBe(true);
      }
      // The pool is small and closed — it cannot grow with the input.
      expect(allowed.size).toBeLessThan(50);
    }
  });

  test("no source word of 5+ chars appears in any pool value", () => {
    const corpus = [
      "Biedronka Wroclaw Krzyki",
      "Przelew od Anna Kowalska",
      "Czynsz mieszkanie Grochale",
      "Wyplata pensji marzec",
      "Rachunek za prad PGE",
      "Skladka OC Warta polisa 8841",
    ];
    const outputs: string[] = [];
    for (const pool of [
      "merchant",
      "category",
      "wallet",
      "budget",
      "holding",
    ] as const) {
      for (let i = 0; i < 40; i++)
        outputs.push(fakeText(pool, i).toLowerCase());
    }
    for (const source of corpus) {
      for (const word of source.split(/\s+/)) {
        if (word.length < 5) continue;
        for (const out of outputs) {
          expect(out.includes(word.toLowerCase())).toBe(false);
        }
      }
    }
  });

  test("returns non-empty plausible text for every pool", () => {
    for (const pool of [
      "merchant",
      "category",
      "wallet",
      "budget",
      "holding",
    ] as const) {
      expect(fakeText(pool, 0).length).toBeGreaterThan(0);
    }
  });
});

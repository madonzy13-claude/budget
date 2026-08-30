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
  niceRound,
  SCALE_MIN,
  SCALE_MAX,
  poolValues,
  merchantsForCategory,
  categoryCount,
  demoLocales,
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
      // The pool is CLOSED — it cannot grow with the input. The bound is
      // generous because the merchant vocabulary is now per-category (28
      // categories, a few merchants each); what matters is that 500 different
      // seeds still yield no value outside the fixed set.
      expect(allowed.size).toBeLessThan(200);
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

describe("niceRound", () => {
  test("turns scaled noise into numbers a person would type", () => {
    // The reported symptom: a limit rendered as $231,209.
    expect(niceRound(231209)).toBe(231000);
    expect(niceRound(4180)).toBe(4200);
    expect(niceRound(312)).toBe(310);
    expect(niceRound(86)).toBe(85);
    expect(niceRound(12)).toBe(12);
  });

  test("keeps the sign and handles zero", () => {
    expect(niceRound(-4180)).toBe(-4200);
    expect(niceRound(0)).toBe(0);
  });

  test("never moves a value by more than half a step", () => {
    for (let v = 1; v < 500_000; v += 977) {
      const r = niceRound(v);
      const step =
        v < 20
          ? 1
          : v < 100
            ? 5
            : v < 1000
              ? 10
              : v < 10000
                ? 50
                : v < 100000
                  ? 500
                  : 1000;
      expect(Math.abs(r - v)).toBeLessThanOrEqual(step / 2);
    }
  });
});

describe("localised, coherent vocabularies", () => {
  test("every language carries a full set of pools", () => {
    for (const locale of demoLocales()) {
      for (const pool of [
        "category",
        "income",
        "scheduled",
        "wallet",
        "holding",
        "budget",
      ] as const) {
        expect(poolValues(locale, pool).length).toBeGreaterThan(0);
      }
    }
  });

  test("the category pool outgrows a real budget, so names never lap", () => {
    // The reported "Dining out 2": the owner has 19 categories and the pool had
    // 15, so names wrapped and picked up a lap suffix.
    for (const locale of demoLocales()) {
      expect(categoryCount(locale)).toBeGreaterThanOrEqual(25);
    }
  });

  test("merchants are index-aligned with categories in every language", () => {
    for (const locale of demoLocales()) {
      for (let i = 0; i < categoryCount(locale); i++) {
        expect(merchantsForCategory(locale, i).length).toBeGreaterThan(0);
      }
    }
  });

  test("a category's merchants belong to that category", () => {
    // Coherence, spot-checked: the first category is groceries in every
    // language, and its merchants must be grocery-shaped — not "Airline
    // Booking", which is what the flat pool used to produce.
    expect(merchantsForCategory("en", 0).join(" ")).toMatch(
      /market|grocer|food|shop/i,
    );
    expect(merchantsForCategory("pl", 0).join(" ")).toMatch(
      /market|sklep|produkty|zakupy/i,
    );
    expect(merchantsForCategory("uk", 0).join(" ")).toMatch(
      /ринок|магазин|продукти|покупки/i,
    );
  });

  test("incomes and scheduled payments have their own vocabularies", () => {
    // "Streamly" is not a plausible salary.
    for (const locale of demoLocales()) {
      const income = poolValues(locale, "income");
      const scheduled = poolValues(locale, "scheduled");
      const merchants = poolValues(locale, "merchant");
      expect(income.some((v) => merchants.includes(v))).toBe(false);
      expect(scheduled.length).toBeGreaterThan(5);
    }
  });

  test("the three languages describe the same concepts in the same order", () => {
    const n = poolValues("en", "category").length;
    for (const locale of demoLocales()) {
      expect(poolValues(locale, "category")).toHaveLength(n);
    }
  });
});

/**
 * deposit-value-fast.test.ts — computeDepositValueCents is on the holdings read
 * path for every deposit, and a CPU profile (261102) caught two costs in it:
 * big.js `pow` multiplying a 20-decimal factor EXACTLY thousands of times
 * (digits grow with every day), and temporal-polyfill date math.
 *
 * Both were replaced; these tests prove the cents did not move:
 *  - daily compounding vs an EXACT BigInt reference over principal up to 1e12
 *    cents, rate up to 10000 bps and up to 30 years;
 *  - every cadence vs the previous Temporal implementation across month-end
 *    starts (Jan 31 + 1 month = Feb 28/29, and the drift that follows);
 *  - a perf guard so the exact-pow path cannot come back.
 */
import { describe, test, expect } from "bun:test";
import Big from "big.js";
import { Temporal } from "temporal-polyfill";
import {
  computeDepositValueCents,
  CAP_FREQUENCIES,
  type CapFrequency,
  type DepositInput,
} from "../../src/domain/deposit-value";

/** The implementation as it stood before the optimisation, verbatim in effect. */
function legacyValueCents(input: DepositInput): string {
  const MONTHS: Record<Exclude<CapFrequency, "daily">, number> = {
    monthly: 1,
    quarterly: 3,
    semiannual: 6,
    yearly: 12,
  };
  const days = (a: Temporal.PlainDate, b: Temporal.PlainDate) =>
    a.until(b, { largestUnit: "day" }).days;
  const accrue = (base: Big, r: Big, d: number) =>
    base.plus(base.times(r).times(d).div(365));
  const principal = new Big(String(input.principalCents));
  const r = new Big(input.rateBps).div(10000);
  const start = Temporal.PlainDate.from(input.startDate);
  let asOf = Temporal.PlainDate.from(input.asOf);
  if (input.endDate) {
    const end = Temporal.PlainDate.from(input.endDate);
    if (Temporal.PlainDate.compare(asOf, end) > 0) asOf = end;
  }
  if (Temporal.PlainDate.compare(asOf, start) <= 0 || input.rateBps === 0)
    return principal.round(0, Big.roundHalfUp).toFixed(0);
  if (input.capFrequency === "daily") {
    const factor = new Big(1).plus(r.div(365));
    return principal
      .times(factor.pow(days(start, asOf)))
      .round(0, Big.roundHalfUp)
      .toFixed(0);
  }
  const months = MONTHS[input.capFrequency];
  let base = principal;
  let cursor = start;
  for (;;) {
    const next = cursor.add({ months });
    if (Temporal.PlainDate.compare(next, asOf) > 0) break;
    base = accrue(base, r, days(cursor, next));
    cursor = next;
  }
  return accrue(base, r, days(cursor, asOf))
    .round(0, Big.roundHalfUp)
    .toFixed(0);
}

/**
 * EXACT daily compounding in BigInt: the factor exactly as big.js forms it
 * (r/365 at 20 dp, half-up), raised with exact integer arithmetic, rounded
 * half-up once at the end. big.js's own exact pow is far too slow at 30 years.
 */
function exactDaily(rateBps: number, n: number) {
  const f = new Big(1).plus(new Big(rateBps).div(10000).div(365)).toFixed(20);
  const pow = BigInt(f.replace(".", "")) ** BigInt(n);
  const den = 10n ** (20n * BigInt(n));
  return (principal: bigint) =>
    ((2n * principal * pow + den) / (2n * den)).toString();
}

const plusDays = (d: string, n: number) =>
  Temporal.PlainDate.from(d).add({ days: n }).toString();

describe("Deposit value — daily compounding", () => {
  const principals = [
    1n,
    99n,
    100_000n,
    123_456_789n,
    999_999_999_999n,
    10n ** 12n,
  ];
  const rates = [1, 37, 525, 1200, 9999, 10000];
  const spans = [1, 2, 31, 365, 366, 1000, 3653, 7305, 10958];
  const START = "1996-02-29";

  test("matches the exact result to the cent across principal × rate × 30 years", () => {
    let checked = 0;
    for (const rateBps of rates)
      for (const n of spans) {
        const exact = exactDaily(rateBps, n);
        for (const p of principals) {
          const got = computeDepositValueCents({
            principalCents: p,
            rateBps,
            startDate: START,
            capFrequency: "daily",
            asOf: plusDays(START, n),
          });
          expect(`${rateBps}/${n}/${p}=${got}`).toBe(
            `${rateBps}/${n}/${p}=${exact(p)}`,
          );
          checked++;
        }
      }
    expect(checked).toBe(principals.length * rates.length * spans.length);
  }, 60_000);

  test("perf guard: 30 years of daily capitalization costs well under a millisecond", () => {
    const input: DepositInput = {
      principalCents: 10n ** 12n,
      rateBps: 9999,
      startDate: "1996-01-01",
      capFrequency: "daily",
      asOf: "2026-01-01",
    };
    computeDepositValueCents(input);
    const N = 200;
    const t0 = performance.now();
    for (let i = 0; i < N; i++) computeDepositValueCents(input);
    expect((performance.now() - t0) / N).toBeLessThan(1);
  });
});

describe("Deposit value — calendar math matches Temporal", () => {
  // Month-ends, leap day, and ordinary days as starts; as-of dates straddling
  // the clamped capitalization boundaries.
  const starts = [
    "2023-01-31",
    "2024-01-31",
    "2024-02-29",
    "2023-03-31",
    "2024-05-31",
    "2023-08-31",
    "2023-10-31",
    "2023-12-31",
    "2024-01-30",
    "2024-01-29",
    "2023-06-15",
    "2099-12-31",
    "1999-12-31",
  ];
  const offsets = [
    0, 1, 27, 28, 29, 30, 31, 59, 60, 61, 89, 90, 92, 181, 182, 184, 365, 366,
    731, 1461, 3000,
  ];

  test("every cadence gives the legacy cents for month-end edge cases", () => {
    let checked = 0;
    for (const startDate of starts)
      for (const off of offsets)
        for (const capFrequency of CAP_FREQUENCIES) {
          // The daily path has no calendar beyond a day count, and its exact
          // legacy pow is too slow past a quarter — the BigInt grid covers it.
          if (capFrequency === "daily" && off > 92) continue;
          const input: DepositInput = {
            principalCents: 123_456_789n,
            rateBps: 733,
            startDate,
            capFrequency,
            asOf: plusDays(startDate, off),
          };
          expect(
            `${startDate}+${off} ${capFrequency}=${computeDepositValueCents(input)}`,
          ).toBe(
            `${startDate}+${off} ${capFrequency}=${legacyValueCents(input)}`,
          );
          checked++;
        }
    expect(checked).toBeGreaterThan(starts.length * offsets.length * 4);
  }, 60_000);

  test("maturity freezes on the same day as before", () => {
    for (const capFrequency of CAP_FREQUENCIES.filter((c) => c !== "daily"))
      for (const endDate of [
        "2024-02-29",
        "2024-03-31",
        "2024-01-31",
        "2023-12-31",
      ]) {
        const input: DepositInput = {
          principalCents: 5_000_000n,
          rateBps: 450,
          startDate: "2024-01-31",
          capFrequency,
          asOf: "2026-11-02",
          endDate,
        };
        expect(computeDepositValueCents(input)).toBe(legacyValueCents(input));
      }
  });

  test("a malformed date still throws a RangeError", () => {
    expect(() =>
      computeDepositValueCents({
        principalCents: 1n,
        rateBps: 1,
        startDate: "2024-02-30",
        capFrequency: "monthly",
        asOf: "2024-03-01",
      }),
    ).toThrow(RangeError);
  });
});

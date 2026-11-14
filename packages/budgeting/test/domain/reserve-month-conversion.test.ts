// D-17: a closed month computed in the currency the category had THEN; only
// its result converts to the category's current currency — a leftover at the
// month's closing rate, an overspend at the date(s) of the transaction(s) that
// pushed spending past the limit (a straddling transaction: only its excess).
import { describe, test, expect } from "bun:test";
import {
  convertClosedMonthResult,
  toEngineMonthEvents,
} from "../../src/domain/reserve-month-conversion";
import { reserveEngine } from "../../src/domain/reserve-engine";

const rates = (r: Record<string, string>) => (d: string) => {
  const v = r[d];
  if (!v) throw new Error(`no rate for ${d}`);
  return v;
};

describe("Reserve replay across a category currency change", () => {
  test("a leftover converts at the month's closing rate", () => {
    const r = convertClosedMonthResult({
      effLimitCents: 100000n,
      noLimit: false,
      txs: [{ date: "2026-01-05", cents: 40000n }],
      closeRate: "0.25",
      rateOn: rates({ "2026-01-05": "0.2" }),
    });
    expect(r).toEqual({ limitCents: 25000n, leftCents: 15000n, overageCents: 0n });
  });

  test("a straddling transaction converts only its excess, at its date", () => {
    const r = convertClosedMonthResult({
      effLimitCents: 10000n,
      noLimit: false,
      txs: [
        { date: "d1", cents: 8000n },
        { date: "d2", cents: 5000n },
      ],
      closeRate: "0.25",
      rateOn: rates({ d1: "0.2", d2: "0.3" }),
    });
    expect(r.overageCents).toBe(900n);
    expect(r.leftCents).toBe(0n);
  });

  test("each transaction past the limit converts at its own date", () => {
    const r = convertClosedMonthResult({
      effLimitCents: 10000n,
      noLimit: false,
      txs: [
        { date: "d1", cents: 12000n },
        { date: "d2", cents: 1000n },
      ],
      closeRate: "0.25",
      rateOn: rates({ d1: "0.2", d2: "0.3" }),
    });
    expect(r.overageCents).toBe(700n);
  });

  test("a refund takes back the most recent overspend first", () => {
    const r = convertClosedMonthResult({
      effLimitCents: 10000n,
      noLimit: false,
      txs: [
        { date: "d1", cents: 12000n },
        { date: "d2", cents: 1000n },
        { date: "d3", cents: -1500n },
      ],
      closeRate: "0.25",
      rateOn: rates({ d1: "0.2", d2: "0.3", d3: "0.4" }),
    });
    // Stack d1:2000, d2:1000 → refund 1500 pops d2 (1000) then 500 of d1 → d1:1500.
    expect(r.overageCents).toBe(300n);
  });

  test("a refund back under the limit leaves a leftover at the closing rate", () => {
    const r = convertClosedMonthResult({
      effLimitCents: 10000n,
      noLimit: false,
      txs: [
        { date: "d1", cents: 12000n },
        { date: "d2", cents: -5000n },
      ],
      closeRate: "0.25",
      rateOn: rates({ d1: "0.2", d2: "0.3" }),
    });
    expect(r.overageCents).toBe(0n);
    expect(r.leftCents).toBe(750n);
  });

  test("a no-limit month neither leaves nor overspends", () => {
    const r = convertClosedMonthResult({
      effLimitCents: 0n,
      noLimit: true,
      txs: [{ date: "d1", cents: 99999n }],
      closeRate: "0.25",
      rateOn: rates({ d1: "0.2" }),
    });
    expect(r).toEqual({ limitCents: 0n, leftCents: 0n, overageCents: 0n });
    expect(toEngineMonthEvents(r, true)).toEqual({
      normalCents: 0n,
      cushionCents: 0n,
      spendCents: 0n,
      noLimit: true,
    });
  });

  test("each overspent portion rounds on its own, half away from zero", () => {
    const r = convertClosedMonthResult({
      effLimitCents: 10n,
      noLimit: false,
      txs: [
        { date: "d1", cents: 10n },
        { date: "d2", cents: 1n },
        { date: "d3", cents: 1n },
      ],
      closeRate: "0.5",
      rateOn: rates({ d1: "0.5", d2: "0.5", d3: "0.5" }),
    });
    // 1×0.5 → 1 twice (2), not (1+1)×0.5 → 1.
    expect(r.overageCents).toBe(2n);
  });

  test("engine events reproduce the converted leftover and overspend exactly", () => {
    for (let i = 0; i < 30; i++) {
      const limitCents = BigInt(Math.floor(Math.random() * 100000));
      const over = i % 2 === 0;
      const amt = BigInt(Math.floor(Math.random() * 50000) + 1);
      const r = {
        limitCents,
        leftCents: over ? 0n : amt > limitCents ? limitCents : amt,
        overageCents: over ? amt : 0n,
      };
      const e = toEngineMonthEvents(r, false);
      const max0 = (v: bigint) => (v > 0n ? v : 0n);
      expect(max0(e.spendCents - e.normalCents)).toBe(r.overageCents);
      expect(max0(e.normalCents - e.spendCents)).toBe(r.leftCents);
    }
  });

  test("the real reserve engine reads the same leftover and overspend", () => {
    for (const r of [
      { limitCents: 25000n, leftCents: 15000n, overageCents: 0n },
      { limitCents: 2500n, leftCents: 0n, overageCents: 900n },
    ]) {
      const e = toEngineMonthEvents(r, false);
      const res = reserveEngine({
        openMonth: "2026-02",
        events: [
          {
            type: "setLimit",
            categoryId: "C",
            month: "2026-01",
            normalCents: e.normalCents,
            cushionCents: e.cushionCents,
          },
          { type: "spendDelta", categoryId: "C", month: "2026-01", deltaCents: e.spendCents },
          { type: "accrual", categoryId: "C", month: "2026-01" },
        ],
      });
      const cell = res.cells.find((c) => c.categoryId === "C" && c.month === "2026-01");
      expect(cell?.overageCents).toBe(r.overageCents);
      expect(cell?.leftCents).toBe(r.leftCents);
    }
  });
});

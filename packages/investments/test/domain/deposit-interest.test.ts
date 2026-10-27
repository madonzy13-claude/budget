import { describe, test, expect } from "bun:test";
import { depositInterestRows } from "../../src/domain/deposit-interest";
import {
  computeDepositValueCents,
  type CapFrequency,
} from "../../src/domain/deposit-value";
import { Temporal } from "temporal-polyfill";

const base = {
  principalCents: 1_000_000n,
  rateBps: 525,
  startDate: "2026-01-15",
  endDate: null,
};

const valueAt = (
  asOf: string,
  capFrequency: CapFrequency,
  endDate: string | null = null,
) => BigInt(computeDepositValueCents({ ...base, capFrequency, asOf, endDate }));

describe("Deposit interest rows", () => {
  test("monthly over 3 months gives 3 rows that sum to the accrued value", () => {
    const rows = depositInterestRows({
      ...base,
      capFrequency: "monthly",
      asOf: "2026-04-20",
    });
    expect(rows.map((r) => r.date)).toEqual([
      "2026-02-15",
      "2026-03-15",
      "2026-04-15",
    ]);
    const sum = rows.reduce((s, r) => s + r.interestCents, 0n);
    expect(sum).toBe(valueAt("2026-04-15", "monthly") - base.principalCents);
  });

  test("before the first capitalization date there are no rows", () => {
    expect(
      depositInterestRows({
        ...base,
        capFrequency: "monthly",
        asOf: "2026-02-14",
      }),
    ).toEqual([]);
  });

  test("a deposit maturing before its first capitalization has exactly one row, at the end date", () => {
    const rows = depositInterestRows({
      ...base,
      capFrequency: "yearly",
      endDate: "2026-07-15",
      asOf: "2026-10-27",
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.date).toBe("2026-07-15");
    expect(rows[0]!.interestCents).toBe(
      valueAt("2026-07-15", "yearly", "2026-07-15") - base.principalCents,
    );
  });

  test("no rows after maturity beyond the end date", () => {
    const rows = depositInterestRows({
      ...base,
      capFrequency: "monthly",
      endDate: "2026-03-15",
      asOf: "2027-01-01",
    });
    expect(rows.map((r) => r.date)).toEqual(["2026-02-15", "2026-03-15"]);
  });

  for (const cap of ["monthly", "quarterly", "yearly"] as const) {
    test(`${cap}: rows always sum to value at the last row date minus principal (1..24 months)`, () => {
      const start = Temporal.PlainDate.from(base.startDate);
      for (let m = 1; m <= 24; m++) {
        const asOf = start.add({ months: m }).toString();
        const rows = depositInterestRows({ ...base, capFrequency: cap, asOf });
        const sum = rows.reduce((s, r) => s + r.interestCents, 0n);
        const last = rows.at(-1)?.date;
        expect(sum).toBe(last ? valueAt(last, cap) - base.principalCents : 0n);
        for (const r of rows) expect(r.interestCents > 0n).toBe(true);
      }
    });
  }
});

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
  test("monthly over 3 months gives 3 capitalization rows plus the accrued row, summing to the value today", () => {
    const rows = depositInterestRows({
      ...base,
      capFrequency: "monthly",
      asOf: "2026-04-20",
    });
    expect(rows.map((r) => r.date)).toEqual([
      "2026-02-15",
      "2026-03-15",
      "2026-04-15",
      "2026-04-20",
    ]);
    const sum = rows.reduce((s, r) => s + r.interestCents, 0n);
    expect(sum).toBe(valueAt("2026-04-20", "monthly") - base.principalCents);
  });

  test("before the first capitalization date there is one accrued row", () => {
    const rows = depositInterestRows({
      ...base,
      capFrequency: "monthly",
      asOf: "2026-02-14",
    });
    expect(rows.map((r) => r.date)).toEqual(["2026-02-14"]);
    expect(rows[0]!.interestCents).toBe(
      valueAt("2026-02-14", "monthly") - base.principalCents,
    );
  });

  test("a yearly deposit younger than a year has one accrued row dated today", () => {
    const rows = depositInterestRows({
      ...base,
      capFrequency: "yearly",
      asOf: "2026-10-27",
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.date).toBe("2026-10-27");
    expect(rows[0]!.interestCents).toBe(
      valueAt("2026-10-27", "yearly") - base.principalCents,
    );
    expect(rows[0]!.interestCents > 0n).toBe(true);
  });

  test("today exactly on a capitalization date adds no extra row", () => {
    const rows = depositInterestRows({
      ...base,
      capFrequency: "monthly",
      asOf: "2026-04-15",
    });
    expect(rows.map((r) => r.date)).toEqual([
      "2026-02-15",
      "2026-03-15",
      "2026-04-15",
    ]);
  });

  test("a zero-rate deposit has no accrued row; a deposit started today has no rows", () => {
    expect(
      depositInterestRows({
        ...base,
        rateBps: 0,
        capFrequency: "yearly",
        asOf: "2026-10-27",
      }),
    ).toEqual([]);
    expect(
      depositInterestRows({
        ...base,
        capFrequency: "monthly",
        asOf: base.startDate,
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
    test(`${cap}: rows always sum to value today minus principal (1..24 months, on and between capitalizations)`, () => {
      const start = Temporal.PlainDate.from(base.startDate);
      for (let m = 1; m <= 24; m++)
        for (const asOf of [
          start.add({ months: m }).toString(),
          start.add({ months: m, days: 10 }).toString(),
        ]) {
          const rows = depositInterestRows({ ...base, capFrequency: cap, asOf });
          const sum = rows.reduce((s, r) => s + r.interestCents, 0n);
          expect(rows.at(-1)?.date).toBe(asOf);
          expect(sum).toBe(valueAt(asOf, cap) - base.principalCents);
          for (const r of rows) expect(r.interestCents > 0n).toBe(true);
        }
    });
  }
});

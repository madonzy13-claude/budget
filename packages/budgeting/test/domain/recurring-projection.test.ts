/**
 * recurring-projection.test.ts — what each category is COMMITTED to spend next.
 *
 * Reserve sizing cannot look only backwards. A category whose insurance falls due
 * next September needs the money by September, and a range that never covered a
 * September would size its buffer at zero. So the walk gets a forward leg built
 * from the active recurring rules.
 *
 * Note this must NOT reuse recurringMonthlyNormalize: that spreads a yearly
 * charge evenly across twelve months, which is exactly the shape a reserve
 * exists to absorb. 5,000 in one month and nothing in the other eleven is the
 * whole point.
 *
 * Each month comes back split two ways (260804). A MONTHLY rule is what the
 * limit was set for — it is ROUTINE, inside the plan. A rule that fires once a
 * year is ON TOP: September still has its ordinary fuel and parking, so a 2,500
 * insurance renewal is 2,500 more than that month's budget, not 2,500 of it.
 */
import { describe, test, expect } from "bun:test";
import { projectRecurring } from "../../src/domain/recurring-projection";

const yearly = (cents: number, month: number) => ({
  category_id: "car",
  amount_cents: BigInt(cents),
  cadence: "YEARLY" as const,
  yearly_month: month,
});

describe("projectRecurring", () => {
  test("puts a yearly charge in its own month, not spread over the year", () => {
    const byCat = projectRecurring([yearly(500000, 9)], "2026-04", 12);
    const car = byCat.get("car")!;
    expect(car.get("2026-09")).toEqual({ routine: 0n, onTop: 500000n });
    expect(car.get("2026-08")).toBeUndefined();
  });

  test("marks a yearly charge as ON TOP of the month's plan", () => {
    const car = projectRecurring([yearly(500000, 9)], "2026-04", 12).get(
      "car",
    )!;
    expect(car.get("2026-09")?.onTop).toBe(500000n);
    expect(car.get("2026-09")?.routine).toBe(0n);
  });

  test("marks a monthly rule as routine — the limit was set for it", () => {
    const phone = projectRecurring(
      [
        {
          category_id: "phone",
          amount_cents: 5000n,
          cadence: "MONTHLY" as const,
          yearly_month: null,
        },
      ],
      "2026-04",
      2,
    ).get("phone")!;
    expect(phone.get("2026-04")).toEqual({ routine: 5000n, onTop: 0n });
  });

  test("catches a yearly charge that falls in the NEXT calendar year", () => {
    const car = projectRecurring([yearly(500000, 2)], "2026-09", 12).get(
      "car",
    )!;
    expect(car.get("2027-02")?.onTop).toBe(500000n);
  });

  test("a monthly rule lands in every projected month", () => {
    const rules = [
      {
        category_id: "phone",
        amount_cents: 5000n,
        cadence: "MONTHLY" as const,
        yearly_month: null,
      },
    ];
    const phone = projectRecurring(rules, "2026-04", 3).get("phone")!;
    expect([...phone.keys()]).toEqual(["2026-04", "2026-05", "2026-06"]);
    expect(phone.get("2026-05")?.routine).toBe(5000n);
  });

  test("weekly and daily rules become a month's worth", () => {
    const byCat = projectRecurring(
      [
        {
          category_id: "bus",
          amount_cents: 1000n,
          cadence: "WEEKLY" as const,
          yearly_month: null,
        },
        {
          category_id: "coffee",
          amount_cents: 100n,
          cadence: "DAILY" as const,
          yearly_month: null,
        },
      ],
      "2026-04",
      1,
    );
    // ~4.345 weeks and ~30.44 days in an average month.
    // Weekly and daily are routine too — a limit is set knowing about them.
    expect(byCat.get("bus")!.get("2026-04")?.routine).toBe(4345n);
    expect(byCat.get("coffee")!.get("2026-04")?.routine).toBe(3044n);
  });

  test("several rules on one category add up in the same month", () => {
    const byCat = projectRecurring(
      [yearly(500000, 9), yearly(120000, 9)],
      "2026-04",
      12,
    );
    expect(byCat.get("car")!.get("2026-09")?.onTop).toBe(620000n);
  });

  test("a rule with no category is nobody's commitment", () => {
    const byCat = projectRecurring(
      [
        {
          category_id: null,
          amount_cents: 9999n,
          cadence: "MONTHLY" as const,
          yearly_month: null,
        },
      ],
      "2026-04",
      3,
    );
    expect(byCat.size).toBe(0);
  });

  test("a yearly rule with no month named is ignored rather than guessed", () => {
    const byCat = projectRecurring([yearly(500000, 0)], "2026-04", 12);
    expect(byCat.size).toBe(0);
  });

  test("projecting zero months projects nothing", () => {
    expect(projectRecurring([yearly(500000, 9)], "2026-04", 0).size).toBe(0);
  });
});

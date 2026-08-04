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
    expect(car.get("2026-09")).toBe(500000n);
    expect(car.get("2026-08")).toBeUndefined();
    expect([...car.values()].reduce((a, b) => a + b, 0n)).toBe(500000n);
  });

  test("catches a yearly charge that falls in the NEXT calendar year", () => {
    const car = projectRecurring([yearly(500000, 2)], "2026-09", 12).get(
      "car",
    )!;
    expect(car.get("2027-02")).toBe(500000n);
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
    expect(phone.get("2026-05")).toBe(5000n);
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
    expect(byCat.get("bus")!.get("2026-04")).toBe(4345n);
    expect(byCat.get("coffee")!.get("2026-04")).toBe(3044n);
  });

  test("several rules on one category add up in the same month", () => {
    const byCat = projectRecurring(
      [yearly(500000, 9), yearly(120000, 9)],
      "2026-04",
      12,
    );
    expect(byCat.get("car")!.get("2026-09")).toBe(620000n);
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

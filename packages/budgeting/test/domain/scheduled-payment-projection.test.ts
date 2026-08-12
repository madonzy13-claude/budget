/**
 * scheduled-payment-projection.test.ts — what each category is COMMITTED to spend next.
 *
 * Reserve sizing cannot look only backwards. A category whose insurance falls due
 * next September needs the money by September, and a range that never covered a
 * September would size its buffer at zero. So the walk gets a forward leg built
 * from the active scheduled rules.
 *
 * Note this must NOT reuse scheduledMonthlyNormalize: that spreads a yearly
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
import { projectScheduledPayments } from "../../src/domain/scheduled-payment-projection";

const yearly = (cents: number, month: number) => ({
  category_id: "car",
  amount_cents: BigInt(cents),
  cadence: "YEARLY" as const,
  yearly_month: month,
});

describe("projectScheduledPayments", () => {
  test("puts a yearly charge in its own month, not spread over the year", () => {
    const byCat = projectScheduledPayments([yearly(500000, 9)], "2026-04", 12);
    const car = byCat.get("car")!;
    expect(car.get("2026-09")).toEqual({
      routine: 0n,
      onTop: 500000n,
      oneTime: 0n,
    });
    expect(car.get("2026-08")).toBeUndefined();
  });

  test("marks a yearly charge as ON TOP of the month's plan", () => {
    const car = projectScheduledPayments([yearly(500000, 9)], "2026-04", 12).get(
      "car",
    )!;
    expect(car.get("2026-09")?.onTop).toBe(500000n);
    expect(car.get("2026-09")?.routine).toBe(0n);
  });

  test("marks a monthly rule as routine — the limit was set for it", () => {
    const phone = projectScheduledPayments(
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
    expect(phone.get("2026-04")).toEqual({
      routine: 5000n,
      onTop: 0n,
      oneTime: 0n,
    });
  });

  test("catches a yearly charge that falls in the NEXT calendar year", () => {
    const car = projectScheduledPayments([yearly(500000, 2)], "2026-09", 12).get(
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
    const phone = projectScheduledPayments(rules, "2026-04", 3).get("phone")!;
    expect([...phone.keys()]).toEqual(["2026-04", "2026-05", "2026-06"]);
    expect(phone.get("2026-05")?.routine).toBe(5000n);
  });

  test("weekly and daily rules become a month's worth", () => {
    const byCat = projectScheduledPayments(
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
    const byCat = projectScheduledPayments(
      [yearly(500000, 9), yearly(120000, 9)],
      "2026-04",
      12,
    );
    expect(byCat.get("car")!.get("2026-09")?.onTop).toBe(620000n);
  });

  test("a rule with no category is nobody's commitment", () => {
    const byCat = projectScheduledPayments(
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
    const byCat = projectScheduledPayments([yearly(500000, 0)], "2026-04", 12);
    expect(byCat.size).toBe(0);
  });

  test("projecting zero months projects nothing", () => {
    expect(projectScheduledPayments([yearly(500000, 9)], "2026-04", 0).size).toBe(0);
  });
});

describe("a one-time payment", () => {
  const sofa = {
    category_id: "cat-home",
    amount_cents: 250_00n,
    cadence: "ONCE" as const,
    yearly_month: null,
    next_due_date: "2026-11-04",
  };

  test("lands in its own month, on top of the plan", () => {
    // Rare AND known, like a yearly renewal: November still has its ordinary
    // groceries under the sofa, so the whole charge is on top of the plan. It
    // sits in its own bucket because, unlike a renewal, it has never fired.
    const out = projectScheduledPayments([sofa], "2026-09", 6);
    const byMonth = out.get("cat-home")!;
    expect(byMonth.get("2026-11")).toEqual({
      routine: 0n,
      onTop: 0n,
      oneTime: 250_00n,
    });
  });

  test("touches no other month", () => {
    const out = projectScheduledPayments([sofa], "2026-09", 6);
    const byMonth = out.get("cat-home")!;
    expect([...byMonth.keys()]).toEqual(["2026-11"]);
  });

  test("falls outside a window that does not reach it", () => {
    const out = projectScheduledPayments([sofa], "2026-09", 2); // Sep, Oct
    expect(out.has("cat-home")).toBe(false);
  });

  test("is ignored when it has no date to place it in", () => {
    const out = projectScheduledPayments(
      [{ ...sofa, next_due_date: null }],
      "2026-09",
      6,
    );
    expect(out.has("cat-home")).toBe(false);
  });
});

describe("one-time payments are counted apart from the rhythms", () => {
  // A rhythm has fired before, so its amount is already inside a category's
  // historical mean and can be netted out of "ordinary spending". A ONE-TIME
  // payment has by definition never happened — netting it out would subtract
  // spending that never occurred, which is how Travel's ordinary spend came out
  // at 149 a month instead of ~1,400 (260807).
  const sofa = {
    category_id: "cat-home",
    amount_cents: 250_00n,
    cadence: "ONCE" as const,
    yearly_month: null,
    next_due_date: "2026-11-04",
  };
  const insurance = {
    category_id: "cat-home",
    amount_cents: 900_00n,
    cadence: "YEARLY" as const,
    yearly_month: 11,
    next_due_date: "2026-11-12",
  };

  test("a one-time payment lands in its own bucket", () => {
    const m = projectScheduledPayments([sofa], "2026-09", 6)
      .get("cat-home")!
      .get("2026-11")!;
    expect(m.oneTime).toBe(250_00n);
    expect(m.onTop).toBe(0n);
  });

  test("a yearly renewal stays on top, where it was", () => {
    const m = projectScheduledPayments([insurance], "2026-09", 6)
      .get("cat-home")!
      .get("2026-11")!;
    expect(m.onTop).toBe(900_00n);
    expect(m.oneTime).toBe(0n);
  });

  test("both land in the same month without erasing each other", () => {
    const m = projectScheduledPayments([sofa, insurance], "2026-09", 6)
      .get("cat-home")!
      .get("2026-11")!;
    expect(m.onTop).toBe(900_00n);
    expect(m.oneTime).toBe(250_00n);
    expect(m.routine).toBe(0n);
  });
});

/**
 * upcoming-schedule.test.ts — what is actually coming, month by month.
 *
 * The old chart drew a calendar year of RATES: a yearly charge divided by
 * twelve, every month identical, the lump erased. The household asked for the
 * opposite (260807) — today forward to the last thing scheduled, with each
 * payment in the month it really falls in.
 */
import { describe, test, expect } from "bun:test";
import {
  upcomingByMonth,
  upcomingHorizon,
} from "../../src/domain/upcoming-schedule";

const rent = {
  name: "Rent",
  amount_cents: 200000n,
  cadence: "MONTHLY" as const,
  yearly_month: null,
  next_due_date: "2026-09-01",
  end_date: null,
};
const insurance = {
  name: "Insurance",
  amount_cents: 250000n,
  cadence: "YEARLY" as const,
  yearly_month: 9,
  next_due_date: "2027-09-12",
  end_date: null,
};
const sofa = {
  name: "Sofa",
  amount_cents: 300000n,
  cadence: "ONCE" as const,
  yearly_month: null,
  next_due_date: "2026-11-04",
  end_date: "2026-11-04",
};

describe("upcomingHorizon", () => {
  test("is the furthest next-due across everything scheduled", () => {
    // The household's rule, in their words: the latest next-due across all
    // payments, one-time ones included, because their date IS their next due.
    expect(upcomingHorizon([rent, insurance, sofa], "2026-08-07")).toBe(
      "2027-09",
    );
  });

  test("a one-time payment can be the furthest thing out", () => {
    expect(
      upcomingHorizon(
        [rent, { ...sofa, next_due_date: "2029-01-02" }],
        "2026-08-07",
      ),
    ).toBe("2029-01");
  });

  // SUPERSEDED (user, 261016): the floor used to be THIS month, so a set of
  // overdue payments drew a single bar. The floor is now the full window —
  // a monthly rule keeps being owed every month of it, and stopping at the
  // current one hid all of them.
  test("never ends before the window, however stale the payments", () => {
    expect(
      upcomingHorizon([{ ...rent, next_due_date: "2020-01-01" }], "2026-08-07"),
    ).toBe("2027-07");
  });

  test("is null when there is nothing scheduled at all", () => {
    expect(upcomingHorizon([], "2026-08-07")).toBeNull();
  });
});

describe("upcomingByMonth", () => {
  // SUPERSEDED (user, 261016): this ran to the furthest next-due — four
  // months — and every monthly payment after that was missing from a chart
  // that claims to show what is coming. It runs the whole window now.
  test("runs from this month across the whole window with no gaps", () => {
    const months = upcomingByMonth([rent, sofa], "2026-08-07").map(
      (m) => m.month,
    );
    expect(months).toHaveLength(12);
    expect(months[0]).toBe("2026-08");
    expect(months[11]).toBe("2027-07");
  });

  test("a rhythm repeats, from its own next date onwards", () => {
    const out = upcomingByMonth([rent], "2026-08-07");
    // Rent is next due in September: August is already paid and must not be
    // charged twice.
    expect(out.find((m) => m.month === "2026-08")!.cents).toBe(0n);
    expect(out.find((m) => m.month === "2026-09")!.cents).toBe(200000n);
  });

  test("a yearly charge lands whole, in its own month", () => {
    const out = upcomingByMonth([insurance], "2026-08-07");
    // The lump is the point: not 250000/12 smeared across the year.
    expect(out.find((m) => m.month === "2027-09")!.cents).toBe(250000n);
    expect(out.find((m) => m.month === "2027-08")!.cents).toBe(0n);
  });

  test("a one-time payment appears once and never again", () => {
    const out = upcomingByMonth([sofa, rent], "2026-08-07");
    const hits = out.filter((m) => m.items.some((i) => i.name === "Sofa"));
    expect(hits).toHaveLength(1);
    expect(hits[0]!.month).toBe("2026-11");
  });

  test("stops at a payment's last date", () => {
    const out = upcomingByMonth(
      [{ ...rent, end_date: "2026-10-31" }, sofa],
      "2026-08-07",
    );
    expect(out.find((m) => m.month === "2026-10")!.cents).toBe(200000n);
    // November holds the sofa alone — the rent's deadline has passed.
    expect(out.find((m) => m.month === "2026-11")!.cents).toBe(300000n);
  });

  test("names each payment behind a month, for the tooltip", () => {
    const out = upcomingByMonth([rent, sofa], "2026-08-07");
    expect(out.find((m) => m.month === "2026-11")!.items).toEqual([
      { name: "Rent", amount_cents: "200000" },
      { name: "Sofa", amount_cents: "300000" },
    ]);
  });

  test("a weekly payment reads as its monthly total", () => {
    // Drawing four separate hits on a MONTHLY axis says nothing a total does
    // not, so weekly and daily payments contribute their per-month figure.
    const out = upcomingByMonth(
      [
        {
          name: "Cleaner",
          amount_cents: 10000n,
          cadence: "WEEKLY" as const,
          yearly_month: null,
          next_due_date: "2026-08-10",
          end_date: null,
        },
      ],
      "2026-08-07",
    );
    expect(out).toHaveLength(12);
    expect(out[0]!.cents).toBeGreaterThan(10000n);
  });

  test("nothing scheduled is an empty series, not a year of zeroes", () => {
    expect(upcomingByMonth([], "2026-08-07")).toEqual([]);
  });
});

/**
 * The horizon has to be a WINDOW, not the furthest next-due (user, 261016:
 * "the scheduled payments chart shows only till April 2027").
 *
 * `next_due_date` is the NEXT occurrence, never the last. A monthly rule's is
 * always within a month or two, so the chart's right edge was decided by
 * whichever yearly rule happened to sit furthest out — and every monthly
 * payment after that date simply vanished from the series, though it keeps
 * being owed. From October that put the edge at April: a half-drawn year.
 *
 * A full twelve months, extended when something is scheduled beyond them —
 * the same rule the reserve runway already uses (FORWARD_MONTHS in
 * get-reserve-fit).
 */
describe("the upcoming horizon is a window", () => {
  const monthly = {
    name: "Internet",
    amount_cents: 7500n,
    cadence: "MONTHLY" as const,
    yearly_month: null,
    next_due_date: "2026-11-01",
    end_date: null,
  };
  const yearlyNear = {
    name: "Insurance",
    amount_cents: 102400n,
    cadence: "YEARLY" as const,
    yearly_month: 4,
    next_due_date: "2027-04-01",
    end_date: null,
  };
  const onceFar = {
    name: "Japan",
    amount_cents: 1700000n,
    cadence: "ONCE" as const,
    yearly_month: null,
    next_due_date: "2027-08-01",
    end_date: null,
  };

  test("reaches a full twelve months even when every rule is due sooner", () => {
    // Oct 2026 + 11 = Sep 2027, not Apr 2027.
    expect(upcomingHorizon([monthly, yearlyNear], "2026-10-16")).toBe("2027-09");
  });

  test("still stretches past the window for something scheduled further out", () => {
    expect(
      upcomingHorizon([monthly, yearlyNear, onceFar], "2026-10-16"),
    ).toBe("2027-09");
  });

  test("stretches when a rule falls beyond the window", () => {
    const farOff = { ...onceFar, next_due_date: "2028-03-01" };
    expect(upcomingHorizon([monthly, farOff], "2026-10-16")).toBe("2028-03");
  });

  test("a monthly rule is still drawn in every month of the window", () => {
    const months = upcomingByMonth([monthly], "2026-10-16");
    expect(months.length).toBe(12);
    // It starts next month, so the first month is empty and the rest are not.
    expect(months[months.length - 1]!.cents).toBe(7500n);
  });

  test("no payments at all still means no chart", () => {
    expect(upcomingHorizon([], "2026-10-16")).toBeNull();
  });
});

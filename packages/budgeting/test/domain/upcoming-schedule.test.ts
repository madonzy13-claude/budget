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

  test("never ends before this month, however stale the payments", () => {
    // Everything overdue still has to draw a bar for the month we are in.
    expect(upcomingHorizon([{ ...rent, next_due_date: "2020-01-01" }], "2026-08-07")).toBe(
      "2026-08",
    );
  });

  test("is null when there is nothing scheduled at all", () => {
    expect(upcomingHorizon([], "2026-08-07")).toBeNull();
  });
});

describe("upcomingByMonth", () => {
  test("runs from this month to the horizon with no gaps", () => {
    const months = upcomingByMonth([rent, sofa], "2026-08-07").map(
      (m) => m.month,
    );
    expect(months).toEqual(["2026-08", "2026-09", "2026-10", "2026-11"]);
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
    expect(out).toHaveLength(1);
    expect(out[0]!.cents).toBeGreaterThan(10000n);
  });

  test("nothing scheduled is an empty series, not a year of zeroes", () => {
    expect(upcomingByMonth([], "2026-08-07")).toEqual([]);
  });
});

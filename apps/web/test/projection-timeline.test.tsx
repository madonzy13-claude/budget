// apps/web/test/projection-timeline.test.tsx
import { describe, test, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { ProjectionTimeline } from "@/components/budgeting/overview/projection-timeline";
import type { ProjectionDTO } from "@/hooks/use-projection";

const messages = {
  bdp: {
    tab: {
      overview: {
        projection: {
          title: "How your money holds up ahead",
          allFine: "Everything looks fine",
          mightRunShort: "Might run short around {date}",
          shortBy: "short {amount}",
          empty: "Add income or scheduled rules to forecast",
          available: "Available",
          reserveShrinking: "Reserve shrinking",
          reserveCovering: "Reserve covering",
          reserveUsed: "Reserve used",
          cantCover: "Can't cover",
          income: "Income",
          bill: "Bill",
          opening: "Start of day",
          plannedSpend: "Planned spend",
          left: "Left",
          pending: "Not confirmed yet",
          pendingHint: "Still counted until you confirm or reject it",
        },
      },
    },
  },
};

const dto: ProjectionDTO = {
  currency: "USD",
  days: [
    {
      date: "2026-07-15",
      color: "green",
      available_cents: "100000",
      opening_cents: "137800",
      planned_burn_cents: "37800",
      reserve_covered_cents: "0",
      income_cents: "0",
      bill_cents: "0",
      drew_reserve: [],
      shortfall: [],
    },
    {
      date: "2026-07-16",
      color: "yellow",
      available_cents: "-2000",
      opening_cents: "100000",
      planned_burn_cents: "2000",
      reserve_covered_cents: "2000",
      income_cents: "0",
      bill_cents: "102000",
      drew_reserve: [
        { category_id: "r", name: "Transport", amount_cents: "2000" },
      ],
      shortfall: [],
    },
    {
      date: "2026-07-17",
      color: "red",
      available_cents: "-9000",
      opening_cents: "-2000",
      planned_burn_cents: "0",
      reserve_covered_cents: "0",
      income_cents: "50000",
      bill_cents: "57000",
      drew_reserve: [],
      shortfall: [{ category_id: "c", name: "Food", amount_cents: "9000" }],
    },
  ],
  income_points: [
    { date: "2026-07-16", name: "Salary", amount_cents: "100000" },
  ],
  bill_points: [
    {
      date: "2026-07-17",
      name: "Rent",
      category_id: "c",
      amount_cents: "50000",
    },
  ],
  pending_points: [
    {
      date: "2026-07-05",
      name: "T-Mobile",
      category_id: "c",
      amount_cents: "3000",
    },
  ],
  summary: {
    first_yellow_date: "2026-07-16",
    first_red_date: "2026-07-17",
    worst_shortfall_cents: "9000",
  },
};

// Swappable so a test can hand in a window that spans a month boundary.
let projectionData: ProjectionDTO = dto;
vi.mock("@/hooks/use-projection", () => ({
  useProjection: () => ({
    data: projectionData,
    isLoading: false,
    isError: false,
  }),
}));

const renderIt = (amountPrivacyEnabled = true) =>
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <ProjectionTimeline
        budgetId="b1"
        amountPrivacyEnabled={amountPrivacyEnabled}
      />
    </NextIntlClientProvider>,
  );

/** A flat green run of `n` days from `start`, for shape-only assertions. */
function runOfDays(start: string, n: number): ProjectionDTO["days"] {
  const out: ProjectionDTO["days"] = [];
  let d = new Date(`${start}T00:00:00Z`);
  for (let i = 0; i < n; i++) {
    out.push({
      date: d.toISOString().slice(0, 10),
      color: "green",
      available_cents: "100000",
      opening_cents: "100000",
      planned_burn_cents: "0",
      reserve_covered_cents: "0",
      income_cents: "0",
      bill_cents: "0",
      drew_reserve: [],
      shortfall: [],
    });
    d = new Date(d.getTime() + 86_400_000);
  }
  return out;
}

describe("ProjectionTimeline", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    projectionData = dto;
  });

  test("renders one band cell per day with the right color class", () => {
    renderIt();
    const cells = screen.getAllByTestId("projection-day");
    expect(cells).toHaveLength(3);
    expect(cells[0].getAttribute("data-color")).toBe("green");
    expect(cells[2].getAttribute("data-color")).toBe("red");
  });

  // 100 days of colour with nothing to read it against: the line needed to say
  // WHEN. Months are the natural ruler — one label where each begins, and the
  // month the window opens in on the left (user, 260812).
  test("labels the opening month and each month that begins in the window", () => {
    projectionData = {
      ...dto,
      days: runOfDays("2026-07-28", 40), // Jul 28 → Sep 5
    };
    renderIt();
    expect(
      screen.getAllByTestId("projection-month").map((el) => el.textContent),
    ).toEqual(["Jul", "Aug", "Sep"]);
  });

  test("the months live INSIDE the line, not under it", () => {
    projectionData = { ...dto, days: runOfDays("2026-07-28", 40) };
    renderIt();
    const bar = screen.getByTestId("projection-line");
    for (const m of screen.getAllByTestId("projection-month")) {
      expect(bar.contains(m)).toBe(true);
    }
  });

  // Hardcoding the on-colour black here is what made the strip shout on the
  // pale card: one ink for two very different surroundings. The theme tokens
  // carry the difference, so the component must not name a colour itself
  // (user, 260812).
  test("the strip's ink comes from theme tokens, not hardcoded", () => {
    projectionData = { ...dto, days: runOfDays("2026-07-28", 40) };
    const { unmount } = renderIt();
    expect(screen.getAllByTestId("projection-month")[1]!.style.color).toContain(
      "--forecast-ink",
    );
    expect(
      screen.getAllByTestId("projection-month-rule")[0]!.style.background,
    ).toContain("--forecast-rule");
    unmount();

    // …and the payment notches, which are the other ink riding on the band.
    projectionData = dto;
    renderIt();
    expect(
      screen.getAllByTestId("projection-bill-marker")[0]!.style.background,
    ).toContain("--forecast-notch");
  });

  test("a month label sits where that month starts", () => {
    projectionData = { ...dto, days: runOfDays("2026-07-28", 40) };
    renderIt();
    const [jul, aug] = screen.getAllByTestId("projection-month");
    // The opening month is pinned to the left edge; August begins on day 4 of
    // 40, so its label sits at that fraction of the width.
    expect(jul!.style.left).toBe("0%");
    expect(parseFloat(aug!.style.left)).toBeCloseTo((4 / 39) * 100, 1);
  });

  test("drops a label with no room left to earn it", () => {
    // A month opening in the last few days of the window would print its name
    // half outside the card for the sake of three days.
    projectionData = { ...dto, days: runOfDays("2026-07-01", 33) }; // Aug 1 is last
    renderIt();
    expect(
      screen.getAllByTestId("projection-month").map((el) => el.textContent),
    ).toEqual(["Jul"]);
  });

  test("headline names the first RED date (yellow doesn't count)", () => {
    renderIt();
    // first_red_date is 2026-07-17 (the yellow 07-16 must NOT drive it)
    const text = screen.getByTestId("projection-headline").textContent!;
    expect(text).toContain("17");
    expect(text).not.toContain("16");
  });

  test("scrubbing shows a tooltip with that day's available and shortfall", async () => {
    const { default: userEventDefault } =
      await import("@testing-library/user-event");
    const user = userEventDefault.setup();
    renderIt();
    // happy-dom has no layout, so the wrapper's elementFromPoint hit-test is a
    // no-op here; per-cell onPointerEnter (hover/tap) drives selection in the test.
    const cells = screen.getAllByTestId("projection-day");
    await user.hover(cells[2]);
    const tip = screen.getByTestId("projection-tooltip");
    expect(tip.textContent).toContain("Food");
    // the day's scheduled bill is itemised by name, not just a total
    expect(tip.textContent).toContain("Rent");
  });

  // Scheduled payments were ▼ wedges floating above the band. Over 100 days
  // they collide — a household with bills on consecutive days got a row of
  // overlapping arrows — so each is now a notch cut into the strip's lower
  // edge: neighbours merge into texture instead of piling up (user, 260812).
  test("a scheduled payment is a notch inside the strip", () => {
    renderIt();
    const notches = screen.getAllByTestId("projection-bill-marker");
    expect(notches).toHaveLength(1);
    const bar = screen.getByTestId("projection-line");
    expect(bar.contains(notches[0]!)).toBe(true);
    expect(notches[0]!.style.background).toContain("--forecast-notch");
    // income keeps its own mark below the band
    expect(screen.getAllByTestId("projection-income-marker")).toHaveLength(1);
  });

  // The line's first cell sits one day's burn BELOW the "available to spend"
  // card, which reads as a mismatch until the tooltip spells the day out as
  // one subtraction (user, 260812).
  test("tooltip reads the day out as start − spend = left", async () => {
    const { default: userEventDefault } =
      await import("@testing-library/user-event");
    const user = userEventDefault.setup();
    // Amounts unmasked, so the arithmetic itself is under test.
    renderIt(false);
    await user.hover(screen.getAllByTestId("projection-day")[0]);
    const tip = screen.getByTestId("projection-tooltip");
    expect(tip.textContent).toContain("Start of day");
    expect(tip.textContent).toContain("Planned spend");
    expect(tip.textContent).toContain("Left");
    // 1,378 start − 378 planned = 1,000 left (cents → units, narrow symbol)
    expect(screen.getByTestId("projection-opening").textContent).toContain(
      "1,378",
    );
    expect(screen.getByTestId("projection-planned-burn").textContent).toContain(
      "378",
    );
    expect(screen.getByTestId("projection-left").textContent).toContain(
      "1,000",
    );
  });

  // The sign carries the direction, not the amount: every figure in the block
  // is one ink so the column scans as a column (user, 260812).
  test("the sign is coloured, the amounts are not", async () => {
    const { default: userEventDefault } =
      await import("@testing-library/user-event");
    const user = userEventDefault.setup();
    renderIt(false);
    // day 3 has both an income (+) and bills (−)
    await user.hover(screen.getAllByTestId("projection-day")[2]);
    const plus = screen.getByTestId("projection-income-term");
    const minus = screen.getByTestId("projection-bill-total");
    const signOf = (row: HTMLElement) =>
      row.querySelector("span > span[aria-hidden]") as HTMLElement;
    expect(signOf(plus).textContent).toBe("+");
    expect(signOf(plus).style.color).toContain("--trading-up");
    expect(signOf(minus).textContent).toBe("−");
    expect(signOf(minus).style.color).toContain("--trading-down");
    // amounts stay the neutral body ink
    const amountOf = (row: HTMLElement) => row.lastElementChild as HTMLElement;
    expect(amountOf(plus).className).toContain("text-[var(--body-on-dark)]");
    expect(amountOf(plus).style.color).toBe("");
  });

  test("a day with no planned burn omits the row", async () => {
    const { default: userEventDefault } =
      await import("@testing-library/user-event");
    const user = userEventDefault.setup();
    renderIt();
    await user.hover(screen.getAllByTestId("projection-day")[2]);
    expect(screen.queryByTestId("projection-planned-burn")).toBeNull();
  });

  // An occurrence whose date passed unconfirmed leaves both sides of the maths
  // (no longer a dated bill, not yet confirmed spend) — its money rides inside
  // the daily burn, so the tooltip has to say it is still counted.
  test("today's tooltip lists pending unconfirmed payments", async () => {
    const { default: userEventDefault } =
      await import("@testing-library/user-event");
    const user = userEventDefault.setup();
    renderIt();
    await user.hover(screen.getAllByTestId("projection-day")[0]);
    const tip = screen.getByTestId("projection-tooltip");
    expect(tip.textContent).toContain("Not confirmed yet");
    expect(tip.textContent).toContain("T-Mobile");
  });

  test("later days do not repeat the pending list", async () => {
    const { default: userEventDefault } =
      await import("@testing-library/user-event");
    const user = userEventDefault.setup();
    renderIt();
    await user.hover(screen.getAllByTestId("projection-day")[1]);
    expect(screen.getByTestId("projection-tooltip").textContent).not.toContain(
      "Not confirmed yet",
    );
  });

  test("scrubbing a reserve-using day shows which category used reserve", async () => {
    const { default: userEventDefault } =
      await import("@testing-library/user-event");
    const user = userEventDefault.setup();
    renderIt();
    const cells = screen.getAllByTestId("projection-day");
    await user.hover(cells[1]);
    const tip = screen.getByTestId("projection-tooltip");
    expect(tip.textContent).toContain("Reserve used");
    expect(tip.textContent).toContain("Transport");
    // the day's income is itemised by name
    expect(tip.textContent).toContain("Salary");
  });
});

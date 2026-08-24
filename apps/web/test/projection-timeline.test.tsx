// apps/web/test/projection-timeline.test.tsx
import { describe, test, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import {
  ProjectionTimeline,
  minLabelPct,
} from "@/components/budgeting/overview/projection-timeline";
import type { ProjectionDTO } from "@/hooks/use-projection";

const messages = {
  bdp: {
    tab: {
      overview: {
        projection: {
          title: "How your money holds up ahead",
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
// The spendings tab's own order — what the tooltip's category lists follow.
let categoryData: { id: string; name: string; sortIndex: number }[] = [];
vi.mock("@/hooks/use-budget-data", () => ({
  useCategories: () => ({ data: categoryData }),
}));
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
    categoryData = [];
  });

  /**
   * The categories in a day's card are the ones the household arranged on the
   * spendings tab, so they read in that order here too — not alphabetically,
   * and not in whatever order the walk happened to reach them (user, 260813).
   */
  test("lists what it can't cover in the spendings tab's order", () => {
    categoryData = [
      { id: "c-food", name: "Food", sortIndex: 0 },
      { id: "c-car", name: "Car", sortIndex: 1 },
      { id: "c-travel", name: "Travel", sortIndex: 2 },
    ];
    projectionData = {
      ...dto,
      days: [
        {
          ...dto.days[2]!,
          // Handed over in the opposite order.
          shortfall: [
            { category_id: "c-travel", name: "Travel", amount_cents: "300" },
            { category_id: "c-car", name: "Car", amount_cents: "200" },
            { category_id: "c-food", name: "Food", amount_cents: "100" },
          ],
        },
      ],
    };
    renderIt();
    fireEvent.pointerEnter(screen.getAllByTestId("projection-day")[0]!);
    expect(
      screen
        .getAllByTestId("projection-row-shortfall")
        .map((el) => el.textContent?.replace(/[^A-Za-z ].*$/, "").trim()),
    ).toEqual(["Food", "Car", "Travel"]);
  });

  test("orders the reserve it drew on the same way", () => {
    categoryData = [
      { id: "c-food", name: "Food", sortIndex: 0 },
      { id: "c-car", name: "Car", sortIndex: 1 },
    ];
    projectionData = {
      ...dto,
      days: [
        {
          ...dto.days[1]!,
          drew_reserve: [
            { category_id: "c-car", name: "Car", amount_cents: "200" },
            { category_id: "c-food", name: "Food", amount_cents: "100" },
          ],
        },
      ],
    };
    renderIt();
    fireEvent.pointerEnter(screen.getAllByTestId("projection-day")[0]!);
    expect(
      screen
        .getAllByTestId("projection-row-reserve")
        .map((el) => el.textContent?.replace(/[^A-Za-z ].*$/, "").trim()),
    ).toEqual(["Food", "Car"]);
  });

  /**
   * Reserve money is not income. Its "+" was drawn in the same green as money
   * coming IN, which reads as a windfall rather than as a buffer being spent
   * down — the colour the reserve carries everywhere else is the yellow accent
   * (user, 260813).
   */
  test("marks the reserve term with the reserve's own colour", () => {
    renderIt();
    fireEvent.pointerEnter(screen.getAllByTestId("projection-day")[1]!);
    const sign = screen
      .getByTestId("projection-reserve-term")
      .querySelector("span[aria-hidden]") as HTMLElement;
    expect(sign.textContent).toBe("+");
    expect(sign.style.color).toBe("var(--primary)");
  });

  test("leaves income's plus green", () => {
    renderIt();
    fireEvent.pointerEnter(screen.getAllByTestId("projection-day")[2]!);
    const sign = screen
      .getByTestId("projection-income-term")
      .querySelector("span[aria-hidden]") as HTMLElement;
    expect(sign.style.color).toBe("var(--trading-up)");
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
      days: runOfDays("2026-07-15", 100), // Jul 15 → Oct 22
    };
    renderIt();
    expect(
      screen.getAllByTestId("projection-month").map((el) => el.textContent),
    ).toEqual(["Jul", "Aug", "Sep", "Oct"]);
  });

  // A month boundary and a payment are both "a vertical mark on a 20px band",
  // so they must not be the same KIND of mark. The boundary is dashed and runs
  // the full height; a payment is a short solid notch off the bottom edge
  // (user picked the dashed treatment, 260812).
  test("a month boundary is dashed and spans the strip", () => {
    projectionData = { ...dto, days: runOfDays("2026-07-15", 100) };
    renderIt();
    const rule = screen.getAllByTestId("projection-month-rule")[0]!;
    expect(rule.tagName.toLowerCase()).toBe("line");
    expect(rule.getAttribute("y1")).toBe("0");
    expect(rule.getAttribute("y2")).toBe("100%");
    expect(rule.getAttribute("stroke-dasharray")).toBeTruthy();
  });

  // The band was 44px so the ▼ markers had room ABOVE the line. They are
  // notches inside the strip now, and the empty half read as a gap under the
  // title (user, 260812) — so the strip is flush with the top of the band and
  // the band only keeps what the income row below it needs.
  test("no dead space above the line", () => {
    renderIt();
    const strip = screen.getByTestId("projection-line");
    expect(strip.className).toContain("top-0");
    expect(strip.className).not.toContain("-translate-y-1/2");
    const band = screen.getByTestId("projection-band");
    expect(band.className).not.toContain("h-11");
  });

  test("a payment stays a short solid notch on the bottom edge", () => {
    renderIt();
    const notch = screen.getAllByTestId("projection-bill-marker")[0]!;
    expect(notch.tagName.toLowerCase()).toBe("rect");
    expect(notch.getAttribute("stroke-dasharray")).toBeNull();
    // Whatever height it is tuned to, it hangs off the BOTTOM of the 20px strip.
    const y = Number(notch.getAttribute("y"));
    const h = Number(notch.getAttribute("height"));
    expect(y + h).toBe(20);
    expect(h).toBeLessThan(20);
  });

  // A 1.5px line at a fractional x is spread over two device pixels by the
  // antialiaser — so identical notches rendered as "two wide ones and a narrow
  // one" (user, 260812). Drawn as SVG with crispEdges the browser snaps every
  // mark to the pixel grid instead, and they come out the same.
  test("the marks are drawn crisp, not antialiased", () => {
    renderIt();
    const layer = screen.getByTestId("projection-marks");
    expect(layer.tagName.toLowerCase()).toBe("svg");
    expect(layer.getAttribute("shape-rendering")).toBe("crispEdges");
    const notch = screen.getAllByTestId("projection-bill-marker")[0]!;
    expect(notch.tagName.toLowerCase()).toBe("rect");
    expect(layer.contains(notch)).toBe(true);
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
    projectionData = { ...dto, days: runOfDays("2026-07-15", 100) };
    const { unmount } = renderIt();
    expect(screen.getAllByTestId("projection-month")[1]!.style.color).toContain(
      "--forecast-ink",
    );
    expect(
      screen.getAllByTestId("projection-month-rule")[0]!.getAttribute("stroke"),
    ).toContain("--forecast-rule");
    unmount();

    // …and the payment notches, which are the other ink riding on the band.
    projectionData = dto;
    renderIt();
    expect(
      screen.getAllByTestId("projection-bill-marker")[0]!.getAttribute("fill"),
    ).toContain("--forecast-notch");
  });

  test("a month label sits where that month starts", () => {
    projectionData = { ...dto, days: runOfDays("2026-07-15", 100) };
    renderIt();
    const [jul, aug] = screen.getAllByTestId("projection-month");
    // The opening month is pinned to the left edge; August begins on day 18 of
    // 100, so its label sits at that fraction of the width.
    expect(jul!.style.left).toBe("0%");
    expect(parseFloat(aug!.style.left)).toBeCloseTo((17 / 99) * 100, 1);
  });

  // The mirror case, and the one the tail guard missed: the window OPENS three
  // days before a month turns. "Aug" sits at 0% and "Sep" at ~3%, which is ~10px
  // on a phone — Sep lands on top of Aug. The sliver is the one not worth
  // naming, exactly as at the tail (user, 260823; live on 29 August).
  test("drops the opening label when the next month turns immediately", () => {
    projectionData = { ...dto, days: runOfDays("2026-08-29", 100) };
    renderIt();
    expect(
      screen.getAllByTestId("projection-month").map((el) => el.textContent),
    ).toEqual(["Sep", "Oct", "Nov"]);
  });

  // Dropping a NAME must not drop the divider: Sep still turns three days in,
  // and the strip has to show where. Rules come from every month open; only the
  // labels are filtered.
  test("keeps the divider for a month whose name was dropped", () => {
    projectionData = { ...dto, days: runOfDays("2026-08-29", 100) };
    renderIt();
    // 100 days from Aug 29 runs to Dec 6, so four months turn inside the
    // window: Sep, Oct, Nov, Dec. All four get a divider. Only three get a
    // name — Aug loses its at the head (3 days), Dec at the tail (6 days), and
    // this single case exercises both ends of the rule.
    expect(screen.getAllByTestId("projection-month-rule")).toHaveLength(4);
    expect(
      screen.getAllByTestId("projection-month").map((el) => el.textContent),
    ).toEqual(["Sep", "Oct", "Nov"]);
  });

  // The threshold is a PIXEL budget wearing a percentage: it has to pay for the
  // label's 8px lead-in and a gap before the divider, not just the glyphs. At 8%
  // this window cleared the guard by 0.08 and printed "Aug" hard against the Sep
  // rule (user, 260824 — iPhone, 24 Aug, Sep turns on day 8 of 100 = 8.08%).
  test("drops the opening label when its segment has no room to spare", () => {
    projectionData = { ...dto, days: runOfDays("2026-08-24", 100) };
    renderIt();
    expect(
      screen.getAllByTestId("projection-month").map((el) => el.textContent),
    ).toEqual(["Sep", "Oct", "Nov"]);
  });

  // …but a first month with room keeps its name.
  test("keeps the opening label when its segment is wide enough", () => {
    projectionData = { ...dto, days: runOfDays("2026-08-01", 100) };
    renderIt();
    expect(
      screen.getAllByTestId("projection-month")[0]!.textContent,
    ).toBe("Aug");
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

  // The caption under the line ("Money may run short as early as …") repeated
  // what the colour already says, and cost the card a whole line (user,
  // 260812). The date is still in the tooltip of the day it names.
  test("no caption under the line", () => {
    renderIt();
    expect(screen.queryByTestId("projection-headline")).toBeNull();
  });

  // …and with no income there is nothing to put under the band, so the band
  // stops at the strip rather than holding a row of empty space.
  test("the band keeps a row for income dots only when there are any", () => {
    const { unmount } = renderIt();
    const withIncome = screen.getByTestId("projection-band").className;
    expect(screen.getAllByTestId("projection-income-marker").length).toBe(1);
    unmount();

    projectionData = { ...dto, income_points: [] };
    renderIt();
    expect(screen.queryByTestId("projection-income-marker")).toBeNull();
    expect(screen.getByTestId("projection-band").className).not.toBe(
      withIncome,
    );
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
    expect(notches[0]!.getAttribute("fill")).toContain("--forecast-notch");
    // income keeps its own mark below the band
    expect(screen.getAllByTestId("projection-income-marker")).toHaveLength(1);
  });

  // The mark was a literal "$" — printed on a złoty budget too. A dot says
  // "money lands here" in every currency, and the tooltip carries the amount
  // (user picked the dot from the mockups, 260812).
  test("income is a green dot, not a currency glyph", () => {
    renderIt();
    const dot = screen.getAllByTestId("projection-income-marker")[0]!;
    expect(dot.textContent).toBe("");
    expect(dot.className).toContain("rounded-full");
    expect(dot.style.background).toContain("--trading-up");
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

// A month name is drawn in PIXELS on a strip measured in PERCENT, so the rule
// that decides whether it fits has to convert between the two. A fixed
// percentage cannot: 12% is the right answer on a 326px phone and four times
// more room than the glyphs need on a 1280px desktop, where it silently drops
// names that had space (the trade-off taken on 260824 and reversed here at the
// user's ask — measure the strip, scale the threshold).
describe("minLabelPct", () => {
  test("spends the same pixels whatever the strip is wide", () => {
    // The budget is a constant number of pixels; only its share of the strip
    // moves. Twice the strip, half the percentage.
    expect(minLabelPct(652)).toBeCloseTo(minLabelPct(326) / 2, 5);
  });

  test("a phone pays about an eighth of its strip for a name", () => {
    // 326px is the strip at a 390px viewport — the narrowest that ships.
    // ~40px of it (lead-in + the widest short month a locale prints + a gap)
    // is the ~12% that was hard-coded before this.
    expect(minLabelPct(326)).toBeGreaterThan(11);
    expect(minLabelPct(326)).toBeLessThan(14);
  });

  test("a desktop strip asks far less, so a sliver keeps its name", () => {
    // ~978px inside a 1280px window: the same 40px is now ~4%, so a month
    // opening six days into a 100-day window is named instead of dropped.
    expect(minLabelPct(978)).toBeLessThan(5);
  });

  test("an unmeasured strip assumes a phone rather than no limit", () => {
    // First commit, SSR, or a browser with no ResizeObserver: width reads 0.
    // Dividing by it would yield Infinity (drop everything) or, if guarded the
    // lazy way, 0 (print everything on top of each other). Assume the narrow
    // case — the one that collides — until measurement says otherwise.
    expect(minLabelPct(0)).toBe(minLabelPct(326));
    expect(Number.isFinite(minLabelPct(0))).toBe(true);
  });
});

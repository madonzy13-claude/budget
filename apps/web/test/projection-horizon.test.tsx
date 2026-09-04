// apps/web/test/projection-horizon.test.tsx
/**
 * The forecast horizon is the member's own (260904 request). Three things have
 * to hold, and none of them are visible from the strip alone:
 *
 *  1. The card SAYS how far it is looking, and the number in that sentence is
 *     the control — tap it, drag a slider.
 *  2. Dragging is not fetching. A drag from 100 to 546 crosses four hundred
 *     values; the window only changes when the drag ENDS (the platform's own
 *     `change` event), so the projection is requested once, not four hundred
 *     times.
 *  3. The pick is the PERSON's, not the device's — it rides the same member
 *     ui-prefs row the range pills use, so the phone and the desktop agree
 *     while another member of the same budget keeps their own.
 *
 * Plus the window's two ends now read as dates under the strip, which is the
 * only place the horizon is legible without opening anything.
 */
import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { act, render, screen, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import enMessages from "../messages/en.json";
import type { ProjectionDTO } from "@/hooks/use-projection";

// ── Seams ────────────────────────────────────────────────────────────────────
// The projection itself is stubbed; what this file cares about is the ARGUMENT
// it is asked for, so the mock records every call.
const projectionCalls: (number | null | undefined)[] = [];
let projectionData: ProjectionDTO | undefined;

let maxEnabled = false;
let maxData: ProjectionDTO | undefined;
const maxCalls: boolean[] = [];
vi.mock("@/hooks/use-projection", () => ({
  useMaxProjection: (_budgetId: string, enabled: boolean) => {
    maxCalls.push(enabled);
    maxEnabled = enabled;
    return { data: enabled ? maxData : undefined };
  },
  useProjection: (_budgetId: string, days?: number | null) => {
    projectionCalls.push(days);
    // Faithful to the real hook: `days === null` disables the query, and a
    // DISABLED query in TanStack v5 is pending-but-not-fetching — so it reports
    // isLoading FALSE while holding no data.
    return {
      data: days === null ? undefined : projectionData,
      isLoading: false,
      isError: false,
    };
  },
}));

vi.mock("@/hooks/use-budget-data", () => ({
  useCategories: () => ({ data: [] }),
}));

const save = vi.fn(async () => undefined);
let storedPrefs: Record<string, string[]> = {};
let prefsLoaded = true;
vi.mock("@/hooks/use-member-ui-prefs", () => ({
  useMemberUiPrefs: () => ({ prefs: storedPrefs, isLoaded: prefsLoaded, save }),
}));

let degraded = false;
vi.mock("@/components/common/connectivity-provider", () => ({
  useConnectivity: () => ({ degraded }),
}));

// ── Fixture ──────────────────────────────────────────────────────────────────
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

/** Monthly pay-days across the window — the marks that have to keep up with a
 *  drag, not appear once it is over. */
function monthlyPoints(start: string, n: number) {
  const out: { date: string; name: string; amount_cents: string }[] = [];
  let d = new Date(`${start}T00:00:00Z`);
  for (let i = 0; i < n; i++) {
    if (d.getUTCDate() === 10) {
      out.push({
        date: d.toISOString().slice(0, 10),
        name: "Salary",
        amount_cents: "980000",
      });
    }
    d = new Date(d.getTime() + 86_400_000);
  }
  return out;
}

const dtoOf = (start: string, n: number): ProjectionDTO => ({
  currency: "PLN",
  days: runOfDays(start, n),
  income_points: monthlyPoints(start, n),
  bill_points: monthlyPoints(start, n).map((p) => ({
    ...p,
    date: p.date.replace(/-10$/, "-05"),
    name: "Rent",
    category_id: null,
  })),
  pending_points: [],
  summary: {
    first_yellow_date: null,
    first_red_date: null,
    worst_shortfall_cents: "0",
  },
  spend_health: { good: true, surplus_deficit_cents: null },
});

async function renderTimeline() {
  const { ProjectionTimeline } =
    await import("@/components/budgeting/overview/projection-timeline");
  return render(
    <NextIntlClientProvider locale="en" messages={enMessages}>
      <ProjectionTimeline budgetId="b1" />
    </NextIntlClientProvider>,
  );
}

const chip = () => screen.getByTestId("projection-horizon");
const slider = () => screen.getByTestId("projection-horizon-slider");

beforeEach(() => {
  projectionCalls.length = 0;
  maxCalls.length = 0;
  maxEnabled = false;
  maxData = undefined;
  projectionData = dtoOf("2026-09-04", 100);
  storedPrefs = {};
  prefsLoaded = true;
  degraded = false;
  save.mockClear();
});

describe("Forecast horizon", () => {
  test("the card says how far it is looking, and that number is the control", async () => {
    await renderTimeline();
    expect(chip()).toHaveTextContent("100 days");
    expect(chip().tagName).toBe("BUTTON");
  });

  test("opens a slider on tap, closed until then", async () => {
    await renderTimeline();
    expect(screen.queryByTestId("projection-horizon-slider")).toBeNull();
    fireEvent.click(chip());
    expect(slider()).toBeVisible();
    expect(chip()).toHaveAttribute("aria-expanded", "true");
    // The bounds are the server's, not a wider promise the API would clamp.
    expect(slider()).toHaveAttribute("min", "30");
    expect(slider()).toHaveAttribute("max", "730");
  });

  test("dragging moves the label but does not move the window", async () => {
    await renderTimeline();
    fireEvent.click(chip());
    const before = projectionCalls.length;
    fireEvent.input(slider(), { target: { value: "546" } });
    expect(chip()).toHaveTextContent("546 days");
    // Every re-render still asks for the COMMITTED window, never the draft.
    expect(projectionCalls.slice(before).every((d) => d === 100)).toBe(true);
    expect(save).not.toHaveBeenCalled();
  });

  test("letting go commits the window and remembers it for this member", async () => {
    await renderTimeline();
    fireEvent.click(chip());
    fireEvent.input(slider(), { target: { value: "546" } });
    fireEvent.change(slider(), { target: { value: "546" } });
    expect(projectionCalls[projectionCalls.length - 1]).toBe(546);
    expect(save).toHaveBeenCalledWith("projectionDays", ["546"]);
  });

  test("a snap point is one tap to a whole window", async () => {
    await renderTimeline();
    fireEvent.click(chip());
    fireEvent.click(screen.getByTestId("projection-horizon-snap-365"));
    expect(projectionCalls[projectionCalls.length - 1]).toBe(365);
    expect(save).toHaveBeenCalledWith("projectionDays", ["365"]);
  });

  test("a stored pick is what the card opens on", async () => {
    storedPrefs = { projectionDays: ["365"] };
    await renderTimeline();
    expect(chip()).toHaveTextContent("365 days");
    expect(projectionCalls[projectionCalls.length - 1]).toBe(365);
  });

  test("a pref written by an older build, or by nothing at all, reads as 100", async () => {
    storedPrefs = { projectionDays: ["not-a-number"] };
    await renderTimeline();
    expect(projectionCalls[projectionCalls.length - 1]).toBe(100);
  });

  test("nothing is fetched until the stored pick has landed", async () => {
    prefsLoaded = false;
    await renderTimeline();
    // null, not 100: asking for the default first would fetch a window nobody
    // chose and then swap it for theirs — a wasted request and a visible jump.
    expect(projectionCalls.every((d) => d === null)).toBe(true);
  });

  test("waiting on the pick looks like loading, not like an empty forecast", async () => {
    prefsLoaded = false;
    await renderTimeline();
    // The query is disabled, so it reports isLoading FALSE with no data — which
    // the card would otherwise read as "this budget has nothing to forecast" and
    // say so, a sentence that is both wrong and gone a moment later.
    expect(screen.queryByText(/Add income or scheduled payments/i)).toBeNull();
    expect(screen.queryByTestId("projection-timeline")).toBeNull();
  });

  test("offline, the stored pick still opens the card", async () => {
    prefsLoaded = false;
    degraded = true;
    storedPrefs = {};
    await renderTimeline();
    // A paused prefs query never resolves offline. Waiting for it would leave
    // the whole card blank over data already in the cache (the same trap the
    // range pills hit on 260806).
    expect(projectionCalls[projectionCalls.length - 1]).toBe(100);
  });

  test("offline, the control is inert — one cached window cannot answer another", async () => {
    degraded = true;
    await renderTimeline();
    expect(chip()).toBeDisabled();
  });
});

/**
 * Dragging is a LIVE resize, not a preview of the number alone (user, 260904b:
 * "I want date and banner scale change at the same time with slider scroll").
 *
 * Three separate mechanisms, because they have different costs:
 *  - the DATES are arithmetic, so they move with the thumb at zero cost;
 *  - SHRINKING is a slice of days already in hand, so it is exact and instant;
 *  - GROWING needs days nobody has yet, so the band draws what it holds across
 *    the proportional share of the strip and fills forward as they land. It
 *    never stretches 100 days across a window labelled 546 — that would be a
 *    picture of money that does not exist.
 */
describe("Dragging the horizon", () => {
  beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));
  afterEach(() => vi.useRealTimers());

  test("the end date follows the thumb before any data moves", async () => {
    projectionData = dtoOf("2026-09-04", 100);
    await renderTimeline();
    fireEvent.click(chip());
    fireEvent.input(slider(), { target: { value: "30" } });
    // 30 days from 4 Sep is 3 Oct — arithmetic, not the last loaded day.
    expect(screen.getByTestId("projection-axis-to")).toHaveTextContent(
      "3 Oct 2026",
    );
  });

  test("shrinking redraws the band from days already in hand", async () => {
    projectionData = dtoOf("2026-09-04", 100);
    await renderTimeline();
    fireEvent.click(chip());
    fireEvent.input(slider(), { target: { value: "30" } });
    expect(screen.getByTestId("projection-line")).toHaveAttribute(
      "data-fill-pct",
      "100",
    );
    expect(screen.getAllByTestId("projection-day")).toHaveLength(30);
  });

  test("growing draws what it holds, not a stretched lie", async () => {
    projectionData = dtoOf("2026-09-04", 100);
    await renderTimeline();
    fireEvent.click(chip());
    fireEvent.input(slider(), { target: { value: "200" } });
    // 100 of 200 days known → the drawn band covers half the strip.
    expect(screen.getByTestId("projection-line")).toHaveAttribute(
      "data-fill-pct",
      "50",
    );
    expect(screen.getByTestId("projection-axis-to")).toHaveTextContent(
      "22 Mar 2027",
    );
  });

  test("the thumb asks for nothing; release asks once", async () => {
    await renderTimeline();
    fireEvent.click(chip());
    const before = projectionCalls.length;
    fireEvent.input(slider(), { target: { value: "365" } });
    await act(async () => {
      vi.advanceTimersByTime(600);
    });
    // Held down, the drag is drawn from the wide window — the committed one is
    // the only thing still being asked for, and nothing is persisted yet.
    expect(projectionCalls.slice(before).every((d) => d === 100)).toBe(true);
    expect(save).not.toHaveBeenCalled();

    // Letting go asks for the EXACT window, which is what the cards' trough is
    // computed over.
    fireEvent.change(slider(), { target: { value: "365" } });
    expect(projectionCalls[projectionCalls.length - 1]).toBe(365);
    expect(save).toHaveBeenCalledWith("projectionDays", ["365"]);
  });

  /**
   * The drag stopped fetching (user, 260904d: "why is there still a request for
   * dates we already know from past scroll?"). Opening the panel pulls the
   * WIDEST window once; every draft inside it is a prefix of that one payload,
   * because the simulation runs forward — day 40 of a 730-day run is day 40 of a
   * 100-day run. So the whole slider is answered locally: no requests, no empty
   * tail to dress up, and dragging right, left and right again costs nothing.
   */
  test("opening the panel pulls the widest window, once", async () => {
    await renderTimeline();
    expect(maxCalls.every((enabled) => enabled === false)).toBe(true);
    fireEvent.click(chip());
    expect(maxEnabled).toBe(true);
  });

  test("with that window in hand, the whole slider is free", async () => {
    maxData = dtoOf("2026-09-04", 730);
    await renderTimeline();
    fireEvent.click(chip());
    const before = projectionCalls.length;
    for (const v of [200, 546, 730, 300, 90, 730, 420]) {
      fireEvent.input(slider(), { target: { value: String(v) } });
      await act(async () => {
        vi.advanceTimersByTime(200);
      });
      // Every window drawn in full, every time — there is nothing to wait for.
      expect(screen.getByTestId("projection-line")).toHaveAttribute(
        "data-fill-pct",
        "100",
      );
    }
    // Not one request for a window we already hold the days for.
    expect(
      projectionCalls.slice(before).every((d) => d === 100 || d === null),
    ).toBe(true);
    expect(save).not.toHaveBeenCalled();
  });

  test("until it lands the band draws what it has, with no tail dressing", async () => {
    // Brief and one-step now, so it is the plain track rather than a pulsing
    // slab or a fade — both of which read as "your money ends here" (260904c).
    projectionData = dtoOf("2026-09-04", 100);
    await renderTimeline();
    fireEvent.click(chip());
    fireEvent.input(slider(), { target: { value: "400" } });
    const line = screen.getByTestId("projection-line");
    expect(line).toHaveAttribute("data-fill-pct", "25");
    expect(line).not.toHaveAttribute("data-tail-from");
    expect(screen.queryByTestId("projection-unloaded-tail")).toBeNull();
  });

  /**
   * The dots and notches under the line are the pay-days and the bills. They
   * were still being read off the COMMITTED payload while the band had moved to
   * the wide one, so a drag stretched the colour and left the marks where they
   * were — they only caught up once the drag was over (user, 260904e: "the dots
   * below the line should appear simultaneously with scroll, not after I done
   * with scroll").
   */
  test("the marks under the line keep up with the thumb", async () => {
    maxData = dtoOf("2026-09-04", 730);
    projectionData = dtoOf("2026-09-04", 100); // Sep/Oct/Nov/Dec pay-days
    await renderTimeline();
    expect(screen.getAllByTestId("projection-income-marker")).toHaveLength(4);

    fireEvent.click(chip());
    fireEvent.input(slider(), { target: { value: "365" } });
    // A year of pay-days, drawn while the thumb is still down.
    expect(
      screen.getAllByTestId("projection-income-marker").length,
    ).toBeGreaterThanOrEqual(11);
    expect(
      screen.getAllByTestId("projection-bill-marker").length,
    ).toBeGreaterThanOrEqual(11);

    // …and back down again, on the same gesture.
    fireEvent.input(slider(), { target: { value: "60" } });
    expect(screen.getAllByTestId("projection-income-marker")).toHaveLength(2);
  });

  test("the per-day hit cells stay out of the drag path", async () => {
    projectionData = dtoOf("2026-09-04", 100);
    await renderTimeline();
    expect(screen.getAllByTestId("projection-day")).toHaveLength(100);
    fireEvent.click(chip());
    fireEvent.pointerDown(slider());
    // 730 spans reconciled on every input event is the drag's whole frame
    // budget, and a finger on the slider cannot hover a day cell anyway.
    expect(screen.queryAllByTestId("projection-day")).toHaveLength(0);
    fireEvent.pointerUp(slider());
    expect(screen.getAllByTestId("projection-day")).toHaveLength(100);
  });
});

describe("The window's two ends", () => {
  test("reads as a from-date and a to-date under the strip", async () => {
    projectionData = dtoOf("2026-09-04", 100);
    await renderTimeline();
    expect(screen.getByTestId("projection-axis-from")).toHaveTextContent(
      "4 Sep 2026",
    );
    expect(screen.getByTestId("projection-axis-to")).toHaveTextContent(
      "12 Dec 2026",
    );
  });

  test("follows the chosen horizon, not the length of the payload", async () => {
    storedPrefs = { projectionDays: ["365"] };
    projectionData = dtoOf("2026-09-04", 365);
    await renderTimeline();
    expect(screen.getByTestId("projection-axis-to")).toHaveTextContent(
      "3 Sep 2027",
    );
  });

  test("a payload longer than the window is trimmed to it", async () => {
    // The window is the member's 100; a cached 365-day payload does not get to
    // redraw the strip a year long behind their back.
    projectionData = dtoOf("2026-09-04", 365);
    await renderTimeline();
    expect(screen.getByTestId("projection-axis-to")).toHaveTextContent(
      "12 Dec 2026",
    );
    expect(screen.getAllByTestId("projection-day")).toHaveLength(100);
  });
});

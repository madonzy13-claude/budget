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
import { describe, test, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import enMessages from "../messages/en.json";
import type { ProjectionDTO } from "@/hooks/use-projection";

// ── Seams ────────────────────────────────────────────────────────────────────
// The projection itself is stubbed; what this file cares about is the ARGUMENT
// it is asked for, so the mock records every call.
const projectionCalls: (number | null | undefined)[] = [];
let projectionData: ProjectionDTO | undefined;

vi.mock("@/hooks/use-projection", () => ({
  useProjection: (_budgetId: string, days?: number | null) => {
    projectionCalls.push(days);
    return { data: projectionData, isLoading: false, isError: false };
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

const dtoOf = (start: string, n: number): ProjectionDTO => ({
  currency: "PLN",
  days: runOfDays(start, n),
  income_points: [],
  bill_points: [],
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

  test("follows the horizon it is given", async () => {
    projectionData = dtoOf("2026-09-04", 365);
    await renderTimeline();
    expect(screen.getByTestId("projection-axis-to")).toHaveTextContent(
      "3 Sep 2027",
    );
  });
});

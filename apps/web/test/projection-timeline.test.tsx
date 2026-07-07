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
          title: "Cash-flow forecast",
          onTrackThrough: "On track through {date}",
          tightAround: "Tightest around {date}",
          shortBy: "short {amount}",
          empty: "Add income or recurring rules to forecast",
          available: "Available",
          reserveShrinking: "Reserve shrinking",
          cantCover: "Can't cover",
          income: "Income",
          bill: "Bill",
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
      income_cents: "0",
      bill_cents: "0",
      drew_reserve: [],
      shortfall: [],
    },
    {
      date: "2026-07-16",
      color: "yellow",
      available_cents: "-2000",
      income_cents: "0",
      bill_cents: "0",
      drew_reserve: [{ category_id: "r", name: "Transport", amount_cents: "2000" }],
      shortfall: [],
    },
    {
      date: "2026-07-17",
      color: "red",
      available_cents: "-9000",
      income_cents: "0",
      bill_cents: "0",
      drew_reserve: [],
      shortfall: [{ category_id: "c", name: "Food", amount_cents: "9000" }],
    },
  ],
  income_points: [],
  bill_points: [],
  summary: {
    first_yellow_date: "2026-07-16",
    first_red_date: "2026-07-17",
    worst_shortfall_cents: "9000",
  },
};

vi.mock("@/hooks/use-projection", () => ({
  useProjection: () => ({ data: dto, isLoading: false, isError: false }),
}));

const renderIt = () =>
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <ProjectionTimeline budgetId="b1" />
    </NextIntlClientProvider>,
  );

describe("ProjectionTimeline", () => {
  beforeEach(() => vi.clearAllMocks());

  test("renders one band cell per day with the right color class", () => {
    renderIt();
    const cells = screen.getAllByTestId("projection-day");
    expect(cells).toHaveLength(3);
    expect(cells[0].getAttribute("data-color")).toBe("green");
    expect(cells[2].getAttribute("data-color")).toBe("red");
  });

  test("headline names the first trouble date", () => {
    renderIt();
    expect(screen.getByTestId("projection-headline").textContent).toContain(
      "16",
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
  });

  test("scrubbing a reserve-shrink day shows the reserve-shrinking detail", async () => {
    const { default: userEventDefault } =
      await import("@testing-library/user-event");
    const user = userEventDefault.setup();
    renderIt();
    const cells = screen.getAllByTestId("projection-day");
    await user.hover(cells[1]);
    const tip = screen.getByTestId("projection-tooltip");
    expect(tip.textContent).toContain("Reserve shrinking");
    expect(tip.textContent).toContain("Transport");
  });
});

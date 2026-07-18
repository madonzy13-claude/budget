/**
 * home-budgets-client.test.tsx — the authenticated home landing.
 *
 * The landing AUTO-OPENS a budget (1 budget always; >1 reopens the last-visited).
 * The waiting layout on that path must be the BDP Overview skeleton — NOT the
 * budget LIST skeleton — so opening the app doesn't flash "Мої бюджети" cards and
 * then jump into the budget. The listing only shows on an explicit ?list=1 or a
 * resolved multi-budget landing with no last-visited memory.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { LAST_BUDGET_KEY } from "@/lib/last-budget";

// next-intl: identity translator (returns the key) for BOTH the "home" and
// "bdp.tab" namespaces the tree touches.
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

const replace = vi.fn();
let listParam: string | null = null;
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
  useSearchParams: () => ({
    get: (k: string) => (k === "list" ? listParam : null),
  }),
}));

// The active-budgets query is the input we vary per scenario.
let activeBudgets: { data?: { id: string }[]; isSuccess: boolean };
vi.mock("@/hooks/use-active-budgets", () => ({
  useActiveBudgets: () => activeBudgets,
}));

// AggregateOverview (Task 16) fetches its own aggregate summary (RQ); stub it
// so the resolved ≥2-budget listing renders without a QueryClient.
vi.mock("@/components/budgeting/aggregate/aggregate-overview", () => ({
  AggregateOverview: () => <div data-testid="aggregate-overview" />,
}));

import { HomeBudgetsClient } from "@/components/budgeting/home-budgets-client";

const overviewBand = (c: HTMLElement) => c.querySelector(".sticky.top-0.z-40");

describe("HomeBudgetsClient — auto-open shows the BDP Overview skeleton", () => {
  beforeEach(() => {
    replace.mockClear();
    listParam = null;
    activeBudgets = { data: undefined, isSuccess: false };
    window.localStorage.clear();
  });

  it("plain landing, still loading → renders the Overview skeleton (not the list)", () => {
    const { container } = render(<HomeBudgetsClient locale="en" />);
    // Overview skeleton band present; the list heading is NOT rendered.
    expect(overviewBand(container)).not.toBeNull();
    expect(screen.getByText("overview.label")).toBeTruthy();
    expect(screen.queryByText("heading")).toBeNull();
  });

  it("resolved to exactly 1 budget → Overview skeleton + soft-redirect to its overview", () => {
    activeBudgets = { data: [{ id: "b1" }], isSuccess: true };
    const { container } = render(<HomeBudgetsClient locale="en" />);
    expect(overviewBand(container)).not.toBeNull();
    expect(replace).toHaveBeenCalledWith("/en/budgets/b1/overview");
  });

  it(">1 budgets with a last-visited → Overview skeleton + redirect to last", () => {
    window.localStorage.setItem(LAST_BUDGET_KEY, "b2");
    activeBudgets = { data: [{ id: "b1" }, { id: "b2" }], isSuccess: true };
    const { container } = render(<HomeBudgetsClient locale="en" />);
    expect(overviewBand(container)).not.toBeNull();
    expect(replace).toHaveBeenCalledWith("/en/budgets/b2/overview");
  });

  it("?list=1 → shows the budget LISTING (heading), not the Overview skeleton", () => {
    listParam = "1";
    activeBudgets = { data: [{ id: "b1" }, { id: "b2" }], isSuccess: true };
    const { container } = render(<HomeBudgetsClient locale="en" />);
    expect(overviewBand(container)).toBeNull();
    expect(screen.getByTestId("aggregate-overview")).toBeTruthy();
    expect(replace).not.toHaveBeenCalled();
  });

  it("resolved >1 budgets with NO last-visited (plain) → shows the LISTING", () => {
    activeBudgets = { data: [{ id: "b1" }, { id: "b2" }], isSuccess: true };
    const { container } = render(<HomeBudgetsClient locale="en" />);
    expect(overviewBand(container)).toBeNull();
    expect(screen.getByTestId("aggregate-overview")).toBeTruthy();
    expect(replace).not.toHaveBeenCalled();
  });
});

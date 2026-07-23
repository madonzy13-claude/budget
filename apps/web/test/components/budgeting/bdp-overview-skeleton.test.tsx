/**
 * bdp-overview-skeleton.test.tsx — the waiting pane is tab-aware (260723-2), so a
 * budget→budget switch onto a non-overview tab reserves that tab's geometry
 * instead of flashing the Overview hero+cards.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

import { BdpOverviewSkeleton } from "@/components/budgeting/bdp-overview-skeleton";

describe("BdpOverviewSkeleton pane shape", () => {
  it("defaults to the Overview pane", () => {
    render(<BdpOverviewSkeleton />);
    expect(screen.getByTestId("bdp-skeleton-pane-overview")).toBeTruthy();
  });

  it("renders the columns pane for Spendings", () => {
    render(<BdpOverviewSkeleton activeTab="spendings" />);
    expect(screen.getByTestId("bdp-skeleton-pane-columns")).toBeTruthy();
    expect(
      document.querySelector('[data-testid="bdp-skeleton-pane-overview"]'),
    ).toBeNull();
  });

  it("renders the list pane for Wallets / Reserves / Settings", () => {
    for (const tab of ["wallets", "reserves", "settings"] as const) {
      const { unmount } = render(<BdpOverviewSkeleton activeTab={tab} />);
      expect(screen.getByTestId("bdp-skeleton-pane-list")).toBeTruthy();
      unmount();
    }
  });
});

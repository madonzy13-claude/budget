/**
 * bdp-loading.test.tsx — the BDP catch-all route's loading.tsx skeleton.
 *
 * Why this file exists: a manual <Suspense> in the BDP *layout* does NOT make a
 * client soft-navigation commit instantly — App Router only commits the nav
 * immediately (streaming the page behind a fallback) when a `loading.tsx` exists
 * for the segment. Without it, home→BDP held the listing page for the ~330ms
 * membership gate. loading.tsx is the fix.
 *
 * The contract this locks: loading.tsx renders the SAME waiting layout the cold
 * <BudgetDetail> shows — a real-styled pills band (Wallets active) reserving the
 * exact sticky-band footprint, plus the shared <WalletsSkeleton> for the pane —
 * so there is no flicker between two different skeletons before the data lands.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

// loading.tsx is an async server component; mock next-intl/server so it resolves
// labels without the request-locale context.
vi.mock("next-intl/server", () => ({
  getTranslations: async () => (key: string) => {
    const map: Record<string, string> = {
      aria: "Budget detail tabs",
      "wallets.label": "Wallets",
      "spendings.label": "Spendings",
      "reserves.label": "Reserves",
      "settings.label": "Settings",
      "wallets.section.spendings": "Spendings wallets",
    };
    return map[key] ?? key;
  },
}));

import BdpLoading from "@/app/[locale]/(app)/budgets/[id]/loading";

async function renderLoading() {
  const ui = await BdpLoading();
  return render(ui);
}

describe("BDP loading.tsx", () => {
  it("reserves the sticky band footprint (zero-shift vs the live BdpTabs band)", async () => {
    const { container } = await renderLoading();
    const band = container.querySelector(".sticky.top-0.z-40");
    expect(band).not.toBeNull();
    expect(band!.className).toMatch(/border-b/);
    expect(band!.className).toMatch(/bg-\[var\(--canvas-dark\)\]/);
    // the nav row reserves h-12 (the BdpTabs nav height).
    expect(band!.querySelector(".h-12")).not.toBeNull();
    // it is NOT the real band — no data-testid (geometry proofs / the nav
    // measurement key off the real band only).
    expect(band!.getAttribute("data-testid")).toBeNull();
  });

  it("renders the 4 real tab labels with Wallets active (yellow indicator)", async () => {
    const { container } = await renderLoading();
    for (const label of ["Wallets", "Spendings", "Reserves", "Settings"]) {
      expect(screen.getByText(label)).toBeTruthy();
    }
    // active Wallets pill carries the primary (yellow) fill, like the live band.
    const band = container.querySelector(".sticky.top-0.z-40")!;
    expect(band.querySelector(".bg-\\[var\\(--primary\\)\\]")).not.toBeNull();
  });

  it("reuses the Wallets tab skeleton for the pane (one continuous waiting layout)", async () => {
    const { container } = await renderLoading();
    // WalletsSkeleton markers: the section header + carded rows + dashed add row.
    expect(screen.getByText("Spendings wallets")).toBeTruthy();
    expect(
      container.querySelector(".bg-\\[var\\(--surface-card-dark\\)\\]"),
    ).not.toBeNull();
    expect(container.querySelector(".border-dashed")).not.toBeNull();
    // delayed-pulse placeholders (invisible 200ms) so a fast gate never flashes.
    expect(
      container.querySelectorAll(".skeleton-delayed").length,
    ).toBeGreaterThan(4);
  });
});

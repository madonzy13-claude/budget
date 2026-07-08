/**
 * bdp-loading.test.tsx — the BDP catch-all route's loading.tsx skeleton.
 *
 * Why this file exists: a manual <Suspense> in the BDP *layout* does NOT make a
 * client soft-navigation commit instantly — App Router only commits the nav
 * immediately (streaming the page behind a fallback) when a `loading.tsx` exists
 * for the segment. Without it, home→BDP held the listing page for the ~330ms
 * membership gate. loading.tsx is the fix.
 *
 * The contract this locks (post Phase-11 Overview redesign): loading.tsx renders
 * the SAME waiting layout the cold <BudgetDetail> shows — a real-styled pills band
 * with FIVE pills and OVERVIEW active (the landing tab), plus the Overview cards
 * skeleton for the pane — so there is no jump from a stale Wallets-first skeleton
 * to the Overview layout once the data lands.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

// loading.tsx is an async server component; mock next-intl/server so it resolves
// labels without the request-locale context.
vi.mock("next-intl/server", () => ({
  getTranslations: async () => (key: string) => {
    const map: Record<string, string> = {
      aria: "Budget detail tabs",
      "overview.label": "Overview",
      "wallets.label": "Assets",
      "spendings.label": "Spendings",
      "reserves.label": "Reserves",
      "settings.label": "Settings",
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

  it("renders the 5 real tab labels in TAB_ORDER with Overview active (yellow indicator)", async () => {
    const { container } = await renderLoading();
    for (const label of [
      "Overview",
      "Assets",
      "Spendings",
      "Reserves",
      "Settings",
    ]) {
      expect(screen.getByText(label)).toBeTruthy();
    }
    const band = container.querySelector(".sticky.top-0.z-40")!;
    // exactly five pills, in order.
    const pills = band.querySelectorAll("nav > span");
    expect(pills.length).toBe(5);
    // the Overview pill (first) carries the primary (yellow) fill; it is active.
    const overviewPill = Array.from(pills).find((p) =>
      p.textContent?.includes("Overview"),
    )!;
    expect(
      overviewPill.querySelector(".bg-\\[var\\(--primary\\)\\]"),
    ).not.toBeNull();
    // ...and no other pill is active (single yellow indicator).
    expect(band.querySelectorAll(".bg-\\[var\\(--primary\\)\\]").length).toBe(1);
  });

  it("renders the Overview cards skeleton for the pane, not the Wallets skeleton", async () => {
    const { container } = await renderLoading();
    // Overview isPending shape: one h-28 hero card + a 2-col grid of four h-24
    // stat cards + the projection bar (h-[104px]) — all animate-pulse.
    expect(container.querySelector(".h-28.animate-pulse")).not.toBeNull();
    expect(container.querySelector(".grid.grid-cols-2")).not.toBeNull();
    expect(container.querySelectorAll(".h-24.animate-pulse").length).toBe(4);
    expect(container.querySelector(".h-\\[104px\\].animate-pulse")).not.toBeNull();
    // NOT the Wallets skeleton: no dashed add-row, no wallets section header.
    expect(container.querySelector(".border-dashed")).toBeNull();
    expect(screen.queryByText("Spendings wallets")).toBeNull();
  });

  it("shows the pane skeleton IMMEDIATELY (no reveal/skeleton delay window)", async () => {
    const { container } = await renderLoading();
    // the gate is always ~330ms, so nothing may hide for the first 200ms.
    expect(container.querySelector(".reveal-delayed")).toBeNull();
    expect(container.querySelector(".skeleton-delayed")).toBeNull();
    // the pulsing cards are present and visible from frame 0.
    expect(
      container.querySelectorAll(".animate-pulse").length,
    ).toBeGreaterThanOrEqual(6);
  });
});

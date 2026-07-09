/**
 * bdp-loading.test.tsx — the BDP catch-all route's loading.tsx skeleton.
 *
 * loading.tsx makes a client soft-nav commit instantly (App Router only streams a
 * segment behind a fallback when a loading.tsx exists) and now delegates to the
 * shared <BdpOverviewSkeleton>. The contract this locks (post Phase-11 Overview
 * redesign): a real-styled pills band with FIVE pills, OVERVIEW active (the landing
 * tab), plus the Overview cards skeleton — so there is no jump from a stale
 * Wallets-first skeleton to the Overview layout once data lands.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

// The skeleton is a client component using next-intl's useTranslations.
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => {
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

function renderLoading() {
  return render(BdpLoading());
}

describe("BDP loading.tsx", () => {
  it("reserves the sticky band footprint (zero-shift vs the live BdpTabs band)", () => {
    const { container } = renderLoading();
    const band = container.querySelector(".sticky.top-0.z-40");
    expect(band).not.toBeNull();
    expect(band!.className).toMatch(/border-b/);
    expect(band!.className).toMatch(/bg-\[var\(--canvas-dark\)\]/);
    expect(band!.querySelector(".h-12")).not.toBeNull();
    // it is NOT the real band — no data-testid (geometry proofs key off it only).
    expect(band!.getAttribute("data-testid")).toBeNull();
  });

  it("renders the 5 real tab labels in TAB_ORDER with Overview active (yellow indicator)", () => {
    const { container } = renderLoading();
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
    const pills = band.querySelectorAll("nav > span");
    expect(pills.length).toBe(5);
    const overviewPill = Array.from(pills).find((p) =>
      p.textContent?.includes("Overview"),
    )!;
    expect(
      overviewPill.querySelector(".bg-\\[var\\(--primary\\)\\]"),
    ).not.toBeNull();
    // single yellow indicator (only Overview active).
    expect(band.querySelectorAll(".bg-\\[var\\(--primary\\)\\]").length).toBe(1);
  });

  it("renders the Overview cards skeleton for the pane, not the Wallets skeleton", () => {
    const { container } = renderLoading();
    expect(container.querySelector(".h-28.animate-pulse")).not.toBeNull();
    expect(container.querySelector(".grid.grid-cols-2")).not.toBeNull();
    expect(container.querySelectorAll(".h-24.animate-pulse").length).toBe(4);
    expect(
      container.querySelector(".h-\\[104px\\].animate-pulse"),
    ).not.toBeNull();
    // NOT the Wallets skeleton: no dashed add-row, no wallets section header.
    expect(container.querySelector(".border-dashed")).toBeNull();
    expect(screen.queryByText("Spendings wallets")).toBeNull();
  });

  it("shows the pane skeleton IMMEDIATELY (no reveal/skeleton delay window)", () => {
    const { container } = renderLoading();
    expect(container.querySelector(".reveal-delayed")).toBeNull();
    expect(container.querySelector(".skeleton-delayed")).toBeNull();
    expect(
      container.querySelectorAll(".animate-pulse").length,
    ).toBeGreaterThanOrEqual(6);
  });
});

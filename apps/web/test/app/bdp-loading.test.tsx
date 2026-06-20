/**
 * bdp-loading.test.tsx — the BDP catch-all route's loading.tsx skeleton.
 *
 * Why this file exists: a manual <Suspense> in the BDP *layout* does NOT make a
 * client soft-navigation commit instantly — App Router only commits the nav
 * immediately (and streams the page behind a fallback) when a `loading.tsx`
 * exists for the segment. Without it, home→BDP held the listing page visible for
 * the ~343ms of the server membership gate. loading.tsx is the fix.
 *
 * The contract this locks: the loading fallback reserves the EXACT sticky-band
 * footprint (same sticky wrapper classes + an h-12 nav row) as the live BdpTabs
 * band, so the real band fades into reserved space with ZERO layout shift, and it
 * shows a waiting skeleton (delayed-pulse) for the pane below.
 */
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import BdpLoading from "@/app/[locale]/(app)/budgets/[id]/loading";

describe("BDP loading.tsx", () => {
  it("reserves the sticky band footprint (zero-shift vs the live BdpTabs band)", () => {
    const { container } = render(<BdpLoading />);
    const band = container.querySelector(".sticky.top-0.z-40");
    expect(band).not.toBeNull();
    // border + canvas bg = same wrapper the real band uses.
    expect(band!.className).toMatch(/border-b/);
    expect(band!.className).toMatch(/bg-\[var\(--canvas-dark\)\]/);
    // the nav row reserves h-12 (the BdpTabs nav height).
    expect(band!.querySelector(".h-12")).not.toBeNull();
  });

  it("renders pill-shaped placeholders in the band", () => {
    const { container } = render(<BdpLoading />);
    const band = container.querySelector(".sticky.top-0.z-40")!;
    // rounded-full pill skeletons (the four tab pills).
    const pills = band.querySelectorAll(".rounded-full");
    expect(pills.length).toBeGreaterThanOrEqual(3);
  });

  it("renders a delayed-pulse waiting skeleton for the pane below the band", () => {
    const { container } = render(<BdpLoading />);
    // every placeholder uses the project's delayed skeleton (invisible 200ms),
    // so a fast gate never flashes the skeleton.
    const skeletons = container.querySelectorAll(".skeleton-delayed");
    expect(skeletons.length).toBeGreaterThan(4);
  });
});

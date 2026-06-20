/**
 * scroll-reset-on-mount.test.ts
 *
 * Vitest unit proof that ScrollResetOnMount zeroes ALL scroll roots:
 *   - window (the REAL browser-mode scroller — the guard round 6 lacked)
 *   - document.scrollingElement (html/body belt-and-suspenders)
 *   - main[data-shell-scroll] (standalone scroller)
 *
 * Keyed on pathname so it re-fires on every BDP tab arrival, not only initial
 * mount. happy-dom is the jsdom-equivalent in Vitest; it supports scrollTop
 * assignment and window.scrollTo spying.
 */

import { ScrollResetOnMount } from "@/components/common/scroll-reset-on-mount";
import { cleanup, render } from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Flush all pending requestAnimationFrame callbacks queued during a render.
async function flushRaf() {
  await vi.runAllTimersAsync();
}

// ── Mocks ──────────────────────────────────────────────────────────────────

// next/navigation is not available in happy-dom; mock usePathname.
vi.mock("next/navigation", () => ({
  usePathname: () => "/budgets/test-id/spendings",
}));

// ── Tests ──────────────────────────────────────────────────────────────────

describe("ScrollResetOnMount", () => {
  let scrollToSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();

    // Spy on window.scrollTo — this is THE guard round 6 lacked.
    scrollToSpy = vi.fn();
    Object.defineProperty(window, "scrollTo", {
      value: scrollToSpy,
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
    // Remove any stray main elements.
    document
      .querySelectorAll("main[data-shell-scroll]")
      .forEach((el) => el.remove());
  });

  it("Test 1 (round-6 guard): calls window.scrollTo(0, 0) after rAF", async () => {
    render(React.createElement(ScrollResetOnMount));

    await flushRaf();

    expect(scrollToSpy).toHaveBeenCalledWith(0, 0);
  });

  it("Test 2: zeroes main[data-shell-scroll].scrollTop (standalone belt-and-suspenders)", async () => {
    // Create a stub main element with scrollTop > 0.
    const main = document.createElement("main");
    main.setAttribute("data-shell-scroll", "");
    main.scrollTop = 150; // happy-dom allows direct assignment
    document.body.appendChild(main);

    render(React.createElement(ScrollResetOnMount));

    await flushRaf();

    expect(main.scrollTop).toBe(0);
  });

  it("Test 3: zeroes document.scrollingElement.scrollTop (html/body fallback)", async () => {
    const se = document.scrollingElement as HTMLElement | null;
    if (!se) {
      // happy-dom always has scrollingElement; if not, skip gracefully.
      return;
    }
    se.scrollTop = 250;

    render(React.createElement(ScrollResetOnMount));

    await flushRaf();

    expect(se.scrollTop).toBe(0);
  });

  it("Test 4 (idempotent / standalone case): no throw when no main present and window already at 0", async () => {
    // No main element in DOM. window.scrollTo is a spy (records but does not move window.scrollY).
    // The hook should still call scrollTo(0,0) without throwing.
    expect(() => render(React.createElement(ScrollResetOnMount))).not.toThrow();

    await flushRaf();

    expect(scrollToSpy).toHaveBeenCalledWith(0, 0);
  });
});

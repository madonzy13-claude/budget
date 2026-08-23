/**
 * viewport-debug.test.tsx — UAT-08 device-diagnostics overlay.
 * Hidden unless ?vpdbg=1 is in the URL; renders live viewport/safe-area
 * numbers + a build marker so stale-cache vs layout bugs are distinguishable
 * from a user screenshot.
 */
import { describe, test, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { ViewportDebug } from "@/components/common/viewport-debug";

beforeEach(() => {
  window.history.replaceState({}, "", "/");
});

describe("ViewportDebug", () => {
  test("renders nothing without the vpdbg flag", () => {
    render(<ViewportDebug />);
    expect(screen.queryByTestId("viewport-debug")).not.toBeInTheDocument();
  });

  test("renders overlay with build marker when ?vpdbg=1", () => {
    window.history.replaceState({}, "", "/?vpdbg=1");
    render(<ViewportDebug />);
    const overlay = screen.getByTestId("viewport-debug");
    // The marker is bumped EVERY shell round on purpose — it is how a device
    // screenshot proves it is not a cached bundle. Pinning the current string
    // makes this test fail on every bump for no signal, so assert the SHAPE:
    // a NAME-Rn marker is present (and `shell-safe-area.test.ts` separately
    // holds it past the retired SHELL-R1x chain).
    expect(overlay.textContent).toMatch(/[A-Z]+-R\d+/);
    expect(overlay.textContent).toContain("innerH");
  });
});

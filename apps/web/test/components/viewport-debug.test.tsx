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
    expect(overlay.textContent).toContain("SHELL-R");
    expect(overlay.textContent).toContain("innerH");
  });
});

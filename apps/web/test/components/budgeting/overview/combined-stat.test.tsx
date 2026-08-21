/**
 * CombinedStat is the shared "% + amount beneath" readout (wealth metrics, the
 * Planned range figures). It coloured by `pct >= 0`, so a metric that did not
 * move at all rendered as a GAIN: green, up-arrow, "+0.0%".
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { CombinedStat } from "@/components/budgeting/overview/combined-stat";

describe("CombinedStat", () => {
  it("renders an unchanged metric as flat — muted, no arrow, no + sign", () => {
    render(
      <CombinedStat label="P/L" pct={0} amount="$0" testId="stat" />,
    );
    const pct = screen.getByTestId("stat-pct");
    expect(pct.textContent).toBe("0.0%"); // not "+0.0%"
    expect(pct.getAttribute("style")).toContain("--muted-foreground");
    expect(pct.querySelector("svg")).toBeNull();
  });

  it("still colours and signs real movement", () => {
    const { rerender } = render(
      <CombinedStat label="P/L" pct={2.5} amount="$50" testId="stat" />,
    );
    let pct = screen.getByTestId("stat-pct");
    expect(pct.textContent).toBe("+2.5%");
    expect(pct.getAttribute("style")).toContain("--trading-up");
    expect(pct.querySelector("svg")).toBeTruthy();

    rerender(<CombinedStat label="P/L" pct={-2.5} amount="-$50" testId="stat" />);
    pct = screen.getByTestId("stat-pct");
    expect(pct.textContent).toBe("−2.5%");
    expect(pct.getAttribute("style")).toContain("--trading-down");
  });

  it("shows a tiny move to its first significant digit, still coloured", () => {
    // +0.0071% is a real gain — it just needs enough decimals to be visible at
    // all. Printing "+0.0%" in green was the contradiction (user, 260819).
    render(
      <CombinedStat label="P/L" pct={0.0071} amount="0.17 zł" testId="stat" />,
    );
    const pct = screen.getByTestId("stat-pct");
    expect(pct.textContent).toBe("+0.007%");
    expect(pct.getAttribute("style")).toContain("--trading-up");
    expect(pct.querySelector("svg")).toBeTruthy();
  });

  it("keeps the no-data dash muted with no arrow", () => {
    render(<CombinedStat label="P/L" pct={null} amount="—" testId="stat" />);
    const pct = screen.getByTestId("stat-pct");
    expect(pct.textContent).toBe("—");
    expect(pct.querySelector("svg")).toBeNull();
  });
});

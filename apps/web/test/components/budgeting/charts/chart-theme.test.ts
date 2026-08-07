/**
 * chart-theme.test.ts — which of the two vertical lines reads louder (260802).
 *
 * The planned timeline draws two verticals: the month RESET (structure — the
 * spend cycle starting over) and the hover CURSOR (the reading the user asked
 * for). They were the wrong way round: the reset was the bold one and the
 * cursor barely showed. The reading has to win.
 */
import { describe, it, expect } from "vitest";
import {
  CHART_THEME,
  chartTooltip,
} from "@/components/budgeting/charts/chart-theme";
import { RESET_STROKE } from "@/components/budgeting/overview/plan-zone-line";

describe("vertical line weights", () => {
  it("gives the hover cursor the louder stroke", () => {
    expect(chartTooltip.cursor.stroke).toBe(CHART_THEME.axis);
  });

  it("draws the month reset in a held-back version of that same grey", () => {
    // Not the hairline: it is near-white under the LIGHT theme, where the reset
    // read as a white gap, and too faint to follow on dark (user report).
    expect(RESET_STROKE).not.toBe(CHART_THEME.grid);
    expect(RESET_STROKE).toContain(CHART_THEME.axis);
    expect(RESET_STROKE).toMatch(/color-mix/);
  });

  it("keeps the two apart — the reset must not read as a cursor", () => {
    expect(RESET_STROKE).not.toBe(chartTooltip.cursor.stroke);
  });
});

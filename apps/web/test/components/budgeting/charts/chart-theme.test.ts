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

  it("leaves the month reset on the quiet hairline", () => {
    expect(RESET_STROKE).toBe(CHART_THEME.grid);
  });

  it("keeps the two apart — the reset must not read as a cursor", () => {
    expect(RESET_STROKE).not.toBe(chartTooltip.cursor.stroke);
  });
});

/**
 * chart-theme.ts — DESIGN-token chart palette + shared recharts styles (11-02).
 *
 * Colors are CSS-var references (var(--token)) — NO hard-coded chart-series hex.
 * The only fixed palette is Phase-9 UI_TYPE_COLOR, which the caller passes into the
 * Pie via `colorFor`. Follows the shadcn/recharts pattern: var() strings resolve in
 * fill/stroke at render against global.css tokens.
 *
 * DESIGN.md: single yellow accent (--primary #fcd535), trading green/red for
 * up/down, hairline grid, dark card tooltip, BinanceNova (labels) / BinancePlex
 * (numbers) type stack.
 */
export const CHART_THEME = {
  accent: "var(--primary)", // the single yellow accent — default series (real)
  up: "var(--trading-up)", // grow / gain
  down: "var(--trading-down)", // loss
  neutral: "var(--muted-foreground)", // planned baseline (rendered dashed)
  grid: "var(--hairline-dark)",
  axis: "var(--muted-foreground)",
  text: "var(--foreground)",
  tooltipBg: "var(--surface-card-dark)",
  tooltipBorder: "var(--hairline-dark)",
  fontBody: "BinanceNova, sans-serif",
  fontNumber: "BinancePlex, BinanceNova, sans-serif",
} as const;

/** Shared XAxis/YAxis styling — spread onto every axis. */
export const chartAxis = {
  tick: {
    fill: CHART_THEME.axis,
    fontSize: 11,
    fontFamily: CHART_THEME.fontNumber,
  },
  tickLine: false,
  axisLine: { stroke: CHART_THEME.grid },
} as const;

/** Shared Tooltip styling — dark card surface, hairline border, themed type. */
export const chartTooltip = {
  contentStyle: {
    background: CHART_THEME.tooltipBg,
    border: `1px solid ${CHART_THEME.tooltipBorder}`,
    borderRadius: 8,
    fontFamily: CHART_THEME.fontBody,
    color: CHART_THEME.text,
    fontSize: 12,
  },
  labelStyle: { color: CHART_THEME.axis },
  itemStyle: { color: CHART_THEME.text },
  cursor: { stroke: CHART_THEME.grid, strokeWidth: 1 },
} as const;

export interface ChartSeries {
  key: string;
  label: string;
  /** override the default accent (e.g. up/down or a category colorKey) */
  color?: string;
  /** render as a dashed series (the planned baseline) */
  dashed?: boolean;
}

"use client";
/**
 * category-tick.tsx — wrapping Y-axis tick for the vertical (category) bar charts.
 *
 * The default single-line tick let long category names ("Entertainment",
 * "Subscriptions", "Health & Beauty") overflow the fixed 72px axis. This splits a
 * too-long label across TWO rows — at a space when there is one, else hyphenating
 * mid-word — so every label renders inside the axis.
 */
import { CHART_THEME } from "./chart-theme";

/** Split a label into ≤2 lines that fit `maxChars`; hyphenate a mid-word break. */
function wrap(label: string, maxChars: number): string[] {
  if (label.length <= maxChars) return [label];
  const mid = Math.ceil(label.length / 2);
  const space = label.lastIndexOf(" ", mid);
  if (space > 0) return [label.slice(0, space), label.slice(space + 1)];
  return [label.slice(0, mid) + "-", label.slice(mid)];
}

/** recharts passes {x,y,payload}. Left-aligned to the axis edge like leftAlignedYTick. */
export function CategoryTick(props: {
  x?: number;
  y?: number;
  width: number;
  payload?: { value?: string | number };
}) {
  const { x = 0, y = 0, width, payload } = props;
  const label = String(payload?.value ?? "");
  // ~6.4px/char at fontSize 11 over the (width−14)px label gutter. Wrap sooner so
  // wide labels ("Food & Home") don't spill past the axis into the bars (UAT).
  const maxChars = Math.max(7, Math.floor((width - 14) / 6.4));
  const lines = wrap(label, maxChars);
  const dx = -(width - 14);
  return (
    <text
      x={x}
      y={y}
      textAnchor="start"
      fill={CHART_THEME.axis}
      fontFamily={CHART_THEME.fontBody}
      fontSize={11}
    >
      {lines.map((ln, i) => (
        <tspan
          key={i}
          x={x}
          dx={dx}
          dy={lines.length > 1 ? (i === 0 ? -2 : 12) : 4}
        >
          {ln}
        </tspan>
      ))}
    </text>
  );
}

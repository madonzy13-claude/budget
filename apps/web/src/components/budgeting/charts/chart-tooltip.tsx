"use client";
/**
 * chart-tooltip.tsx — shared recharts Tooltip content with a LINE/SWATCH marker per
 * row in the series' own colour AND line style (solid vs dashed), so it's obvious
 * which value maps to which chart line (UAT round 13/14: the default tooltip rendered
 * every row in one text colour with no marker). `formatY` formats the value.
 */
import { CHART_THEME, type ChartSeries } from "./chart-theme";

interface TooltipEntry {
  name?: string | number;
  value?: number | string;
  color?: string;
  dataKey?: string | number;
  /** the original data row for this point (recharts passes it through) */
  payload?: Record<string, unknown>;
}

export function ChartTooltipContent({
  active,
  payload,
  label,
  formatY,
  series,
  labelFormat,
  colorForRow,
  suppressedLabel,
  onDismiss,
}: {
  active?: boolean;
  payload?: TooltipEntry[];
  label?: string | number;
  formatY?: (n: number) => string;
  series?: ChartSeries[];
  labelFormat?: (label: string | number) => string;
  /** Per-POINT color (e.g. up/down or a category colorKey) so the marker matches
   *  the actual bar, not the series base fill (r25 item 3). */
  colorForRow?: (row: Record<string, unknown>) => string;
  /** The x-label the user tapped to DISMISS — this tooltip hides for it (r28 item 3). */
  suppressedLabel?: string | null;
  /** Tapping the tooltip calls this with its x-label to dismiss it. */
  onDismiss?: (label: string | number | undefined) => void;
}) {
  if (!active || !payload || payload.length === 0) return null;
  // Tapped-to-dismiss: hide this tooltip while the same point stays active.
  if (
    suppressedLabel != null &&
    label != null &&
    String(label) === suppressedLabel
  )
    return null;
  const shownLabel = label != null && labelFormat ? labelFormat(label) : label;
  return (
    <div
      onClick={onDismiss ? () => onDismiss(label) : undefined}
      style={{
        background: CHART_THEME.tooltipBg,
        border: `1px solid ${CHART_THEME.tooltipBorder}`,
        borderRadius: 8,
        fontFamily: CHART_THEME.fontBody,
        fontSize: 12,
        padding: "6px 8px",
        minWidth: 140,
        cursor: onDismiss ? "pointer" : undefined,
      }}
    >
      {shownLabel != null && (
        <div style={{ color: CHART_THEME.axis, marginBottom: 4 }}>
          {shownLabel}
        </div>
      )}
      {payload.map((p, i) => {
        const s = series?.find((x) => x.key === p.dataKey);
        // Per-point color wins (up/down or category colorKey) so the marker matches
        // the rendered bar; else the series color, else the recharts payload color.
        const color =
          (colorForRow && p.payload ? colorForRow(p.payload) : undefined) ??
          s?.color ??
          p.color ??
          CHART_THEME.accent;
        const dashed = s?.dashed ?? false;
        return (
          <div
            key={i}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              color: CHART_THEME.text,
              padding: "1px 0",
            }}
          >
            {/* line marker: solid or dashed, in the series colour */}
            <span
              aria-hidden
              style={{
                width: 18,
                flexShrink: 0,
                borderTop: `3px ${dashed ? "dashed" : "solid"} ${color}`,
              }}
            />
            {p.name != null && (
              <span style={{ color: CHART_THEME.axis }}>{p.name}</span>
            )}
            <span style={{ marginLeft: "auto", fontWeight: 600 }}>
              {formatY ? formatY(Number(p.value)) : String(p.value)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

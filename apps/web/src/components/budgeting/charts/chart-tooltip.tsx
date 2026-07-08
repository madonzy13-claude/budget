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
  extra,
  suppressedLabel,
  onDismiss,
}: {
  active?: boolean;
  payload?: TooltipEntry[];
  label?: string | number;
  formatY?: (n: number) => string;
  series?: ChartSeries[];
  labelFormat?: (label: string | number) => string;
  /** Per-POINT color (e.g. up/down, a category colorKey, or a heat map) so the
   *  marker matches the actual bar, not the series base fill (r25 item 3). The
   *  dataKey lets it colour only a specific series (return undefined for the rest,
   *  which then falls back to the series colour). */
  colorForRow?: (
    row: Record<string, unknown>,
    dataKey?: string | number,
  ) => string | undefined;
  /** Extra summary rows (e.g. the difference amount + percent) rendered below the
   *  series, computed from the hovered data row. */
  extra?: (
    row: Record<string, unknown>,
  ) => Array<{ label: string; value: string; color?: string }>;
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
          (colorForRow && p.payload
            ? colorForRow(p.payload, p.dataKey)
            : undefined) ??
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
      {/* Extra summary rows (e.g. difference amount + percent), separated by a
          hairline from the series rows above. */}
      {extra && payload[0]?.payload
        ? extra(payload[0].payload).map((row, i) => (
            <div
              key={`extra-${i}`}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                color: CHART_THEME.text,
                padding: "1px 0",
                marginTop: i === 0 ? 4 : 0,
                borderTop:
                  i === 0 ? `1px solid ${CHART_THEME.tooltipBorder}` : undefined,
                paddingTop: i === 0 ? 5 : 1,
              }}
            >
              {row.color && (
                <span
                  aria-hidden
                  style={{
                    width: 18,
                    flexShrink: 0,
                    borderTop: `3px solid ${row.color}`,
                  }}
                />
              )}
              <span style={{ color: CHART_THEME.axis }}>{row.label}</span>
              <span style={{ marginLeft: "auto", fontWeight: 600 }}>
                {row.value}
              </span>
            </div>
          ))
        : null}
    </div>
  );
}

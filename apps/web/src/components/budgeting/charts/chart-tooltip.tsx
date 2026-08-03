"use client";
/**
 * chart-tooltip.tsx — shared recharts Tooltip content with a LINE/SWATCH marker per
 * row in the series' own colour AND line style (solid vs dashed), so it's obvious
 * which value maps to which chart line (UAT round 13/14: the default tooltip rendered
 * every row in one text colour with no marker). `formatY` formats the value.
 */
import { Fragment } from "react";
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
  rowSuffix,
  summary,
  suppressedLabel,
  onDismiss,
  hideSeriesRows = false,
  omitKeys,
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
  /** Extra summary rows (flex, below a hairline) — for callers not using the grid
   *  `summary` below. */
  extra?: (row: Record<string, unknown>) => Array<{
    label: string;
    value: string;
    color?: string;
    /** A SECOND right-aligned column — "How far off plan, by category" shows the
     *  range average and the range total side by side (260803 user request). */
    value2?: string;
    /** Render quietly, as the heading that names those two columns. */
    head?: boolean;
  }>;
  /** Per-series-row SUFFIX cell(s) after the value (e.g. a % change, or a
   *  [%, amount] pair). Return a string for ONE extra column, or an array for
   *  several — each element is its own right-aligned, column-aligned cell. */
  rowSuffix?: (
    row: Record<string, unknown>,
    dataKey?: string | number,
  ) => string | string[] | undefined;
  /** A grid-aligned summary row (e.g. Total) below a hairline — its value +
   *  suffix cells line up with the series columns above. Only rendered in grid
   *  mode (i.e. alongside rowSuffix). `plain` drops the hairline, so the row
   *  closes the series list instead of opening a section of its own. */
  summary?: (row: Record<string, unknown>) => {
    label: string;
    value: string;
    suffix?: string[];
    plain?: boolean;
  } | null;
  /** The x-label the user tapped to DISMISS — this tooltip hides for it (r28 item 3). */
  suppressedLabel?: string | null;
  /** Tapping the tooltip calls this with its x-label to dismiss it. */
  onDismiss?: (label: string | number | undefined) => void;
  /** Skip the automatic per-payload series rows and render ONLY `extra` — for
   *  charts whose bar dataKey is an internal (e.g. the diverging chart's clamped
   *  percent), where that row would show a meaningless name + value. */
  hideSeriesRows?: boolean;
  /** dataKeys to leave out of the series rows — for overlay series that merely
   *  re-colour a stretch of a line the tooltip already lists once. */
  omitKeys?: string[];
}) {
  if (!active || !payload || payload.length === 0) return null;
  // Silence is decided by CONTENT, not by a flag: a point stays quiet only when
  // there is genuinely nothing to read (every series null there — the tail that
  // carries a plan past the last reading). Keying it off the geometry flags left
  // steps the pointer could land on that answered nothing, which reads as a
  // broken chart (user reports, 260801 and 260802).
  if (payload.every((p) => p.value === null || p.value === undefined)) {
    return null;
  }
  // Tapped-to-dismiss: hide this tooltip while the same point stays active.
  if (
    suppressedLabel != null &&
    label != null &&
    String(label) === suppressedLabel
  )
    return null;
  const shownLabel = label != null && labelFormat ? labelFormat(label) : label;
  const toCells = (r: string | string[] | undefined): string[] =>
    r == null ? [] : Array.isArray(r) ? r : [r];
  const marker = (color: string, dashed: boolean) => (
    <span
      aria-hidden
      style={{
        width: 18,
        flexShrink: 0,
        borderTop: `3px ${dashed ? "dashed" : "solid"} ${color}`,
      }}
    />
  );
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
      {(() => {
        const rows = hideSeriesRows
          ? []
          : payload
              // A split series (e.g. the actual-spend line cut into its in-plan
              // and over-plan halves) is null wherever the other half owns the
              // line — those points are not a "0", they are simply absent.
              .filter((p) => p.value !== null && p.value !== undefined)
              .filter((p) => !omitKeys?.includes(String(p.dataKey)))
              // A band that is 0 has nothing to say: a plan with no wants only
              // needs its needs row (260802 user request).
              .filter(
                (p) =>
                  !series?.find((x) => x.key === p.dataKey)?.hideWhenZero ||
                  Number(p.value) !== 0,
              )
              .map((p) => {
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
                return {
                  color,
                  dashed: s?.dashed ?? false,
                  name: p.name,
                  value: formatY ? formatY(Number(p.value)) : String(p.value),
                  cells: p.payload
                    ? toCells(rowSuffix?.(p.payload, p.dataKey))
                    : [],
                };
              });
        const summaryRow =
          summary && payload[0]?.payload ? summary(payload[0].payload) : null;

        // Non-grid (simple) tooltips: value floats right on its own flex row.
        if (!rowSuffix && !summary) {
          return rows.map((r, i) => (
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
              {marker(r.color, r.dashed)}
              {r.name != null && (
                <span style={{ color: CHART_THEME.axis }}>{r.name}</span>
              )}
              <span style={{ marginLeft: "auto", fontWeight: 600 }}>
                {r.value}
              </span>
            </div>
          ));
        }

        // Grid: marker · name · value · N suffix cells — every column right-aligns
        // across the series rows AND the summary row.
        const nCells = Math.max(
          0,
          ...rows.map((r) => r.cells.length),
          summaryRow ? toCells(summaryRow.suffix).length : 0,
        );
        const cellStyle = {
          fontWeight: 400 as const,
          color: CHART_THEME.axis,
          textAlign: "right" as const,
          whiteSpace: "nowrap" as const,
        };
        const cols = Array.from({ length: nCells });
        return (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: `auto minmax(0,1fr) max-content${" max-content".repeat(
                nCells,
              )}`,
              columnGap: 10,
              rowGap: 2,
              alignItems: "center",
              color: CHART_THEME.text,
            }}
          >
            {rows.map((r, i) => (
              <Fragment key={i}>
                {marker(r.color, r.dashed)}
                <span style={{ color: CHART_THEME.axis, whiteSpace: "nowrap" }}>
                  {r.name ?? ""}
                </span>
                <span
                  style={{
                    fontWeight: 600,
                    textAlign: "right",
                    whiteSpace: "nowrap",
                  }}
                >
                  {r.value}
                </span>
                {cols.map((_, c) => (
                  <span key={c} style={cellStyle}>
                    {r.cells[c] ?? ""}
                  </span>
                ))}
              </Fragment>
            ))}
            {summaryRow && (
              <Fragment>
                <span
                  aria-hidden
                  style={{
                    gridColumn: "1 / -1",
                    height: 0,
                    borderTop: summaryRow.plain
                      ? undefined
                      : `1px solid ${CHART_THEME.tooltipBorder}`,
                    marginTop: summaryRow.plain ? 0 : 3,
                    marginBottom: summaryRow.plain ? 0 : 2,
                  }}
                />
                <span aria-hidden />
                <span style={{ color: CHART_THEME.axis, whiteSpace: "nowrap" }}>
                  {summaryRow.label}
                </span>
                <span
                  style={{
                    fontWeight: 600,
                    textAlign: "right",
                    whiteSpace: "nowrap",
                  }}
                >
                  {summaryRow.value}
                </span>
                {(() => {
                  const sc = toCells(summaryRow.suffix);
                  return cols.map((_, c) => (
                    <span key={c} style={cellStyle}>
                      {sc[c] ?? ""}
                    </span>
                  ));
                })()}
              </Fragment>
            )}
          </div>
        );
      })()}
      {/* Extra summary rows (flex) — for callers still using `extra` (not the grid
          `summary`), separated by a hairline from the series rows above. */}
      {extra && payload[0]?.payload
        ? ((rows) =>
            rows.map((row, i) => (
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
                    i === 0
                      ? `1px solid ${CHART_THEME.tooltipBorder}`
                      : undefined,
                  paddingTop: i === 0 ? 5 : 1,
                }}
              >
                {/* A colourless row (e.g. Total) still holds the marker column,
                  so its label lines up with the parts above it. */}
                {(row.color || rows.some((r) => r.color)) && (
                  <span
                    aria-hidden
                    style={{
                      width: 18,
                      flexShrink: 0,
                      borderTop: row.color
                        ? `3px solid ${row.color}`
                        : undefined,
                    }}
                  />
                )}
                <span style={{ color: CHART_THEME.axis }}>{row.label}</span>
                {/* One column stays flush right, as it always was. Two columns
                    line up in fixed widths so avg and total read down the
                    tooltip (260803). A `head` row names them, quietly. */}
                <span
                  style={{
                    marginLeft: "auto",
                    fontWeight: row.head ? 400 : 600,
                    color: row.head ? CHART_THEME.axis : undefined,
                    minWidth: row.value2 != null ? 62 : undefined,
                    textAlign: "right",
                  }}
                >
                  {row.value}
                </span>
                {row.value2 != null && (
                  <span
                    style={{
                      fontWeight: row.head ? 400 : 600,
                      color: row.head ? CHART_THEME.axis : undefined,
                      minWidth: 62,
                      textAlign: "right",
                    }}
                  >
                    {row.value2}
                  </span>
                )}
              </div>
            )))(extra(payload[0].payload))
        : null}
    </div>
  );
}

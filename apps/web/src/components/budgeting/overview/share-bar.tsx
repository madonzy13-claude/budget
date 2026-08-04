"use client";
/**
 * share-bar.tsx — a stacked bar that gives up its numbers on hover (260804).
 *
 * Replaced a row of figures on the Overview. "Planned spent 48,483 · Used
 * reserves 16,116 · Overspent 0" is a shape you read without counting, and
 * pointing at a piece floats its type and amount over it — the same tooltip the
 * money forecast uses, without the scrubber line. Nothing pointed at, nothing
 * said: a caption parked underneath was noise the rest of the time.
 *
 * Pointer events, not mouse: the same handler serves a tap, and focus does the
 * job for a keyboard.
 */
import * as React from "react";
import { shareBarWidths } from "@/lib/share-bar";

export interface ShareBarSegment {
  key: string;
  label: string;
  /** Cents (or any consistent unit — `format` decides how it reads). */
  value: number;
  color: string;
}

export function ShareBar({
  segments,
  format,
  testId,
  insetLeft = 0,
  insetRight = 0,
}: {
  segments: ShareBarSegment[];
  format: (n: number) => string;
  testId: string;
  /** Match the chart below: its axis width and right margin, in px. The bar ran
   *  the full width of the section and read as wider than the chart it belongs
   *  to (user, 260804). */
  insetLeft?: number;
  insetRight?: number;
}) {
  const [active, setActive] = React.useState<string | null>(null);
  const widths = shareBarWidths(segments.map((s) => s.value));
  // Each piece's midpoint along the bar — where its tooltip is anchored.
  let running = 0;
  const drawn = segments
    .map((s, i) => {
      const width = widths[i] ?? 0;
      const centre = running + width / 2;
      running += width;
      return { ...s, width, centre };
    })
    .filter((s) => s.width > 0);

  // Nothing spent, nothing held — a bar of nothing says less than no bar.
  if (drawn.length === 0) return null;

  const shown = drawn.find((s) => s.key === active);

  return (
    <div
      className="relative"
      data-testid={testId}
      style={{ marginLeft: insetLeft, marginRight: insetRight }}
    >
      <div className="flex h-3 w-full overflow-hidden rounded-full">
        {drawn.map((s) => (
          <div
            key={s.key}
            data-testid={`${testId}-piece-${s.key}`}
            role="button"
            tabIndex={0}
            aria-label={`${s.label}: ${format(s.value)}`}
            onPointerEnter={() => setActive(s.key)}
            onPointerLeave={() => setActive(null)}
            onFocus={() => setActive(s.key)}
            onBlur={() => setActive(null)}
            style={{
              width: `${s.width}%`,
              background: s.color,
              opacity: active && active !== s.key ? 0.45 : 1,
            }}
            className="h-full cursor-pointer transition-opacity"
          />
        ))}
      </div>

      {shown && (
        <div
          data-testid={`${testId}-tooltip`}
          // Above the bar so a finger never covers it, edge-anchored so it never
          // clips out of the card — the forecast tooltip's rules.
          style={{
            left: `${shown.centre}%`,
            transform: `translateX(${shown.centre < 22 ? 0 : shown.centre > 78 ? -100 : -50}%)`,
          }}
          className="pointer-events-none absolute bottom-full z-10 mb-2 w-max rounded-[var(--radius-md)] border border-[var(--hairline-dark)] bg-[var(--surface-card-dark)] px-3 py-2 text-xs shadow-lg"
        >
          <span className="flex items-center gap-2">
            <span
              aria-hidden
              className="size-2 shrink-0 rounded-full"
              style={{ background: shown.color }}
            />
            <span className="text-[var(--muted-foreground)]">
              {shown.label}
            </span>
            <span className="num font-semibold text-[var(--body-on-dark)]">
              {format(shown.value)}
            </span>
          </span>
        </div>
      )}
    </div>
  );
}

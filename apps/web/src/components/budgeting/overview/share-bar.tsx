"use client";
/**
 * share-bar.tsx — a part-to-whole strip you scrub (260804).
 *
 * Replaced a row of figures on the Overview: "Planned spent 48,483 · Used
 * reserves 16,116 · Overspent 0" is a shape you read without counting.
 *
 * Interaction is the money forecast's, deliberately — the two strips sit on the
 * same page and a member should not have to learn each one separately. The WHOLE
 * strip is the scrub surface, so moving or dragging across it slides the tooltip
 * from piece to piece; per-piece enter/leave made the middle of a drag feel dead.
 * No scrubber line here though: a part-to-whole bar has no x to point AT, only
 * regions to be inside (user, 260804).
 *
 * Values never live in the tooltip alone — each piece carries its label and
 * amount as its accessible name, which is also what a keyboard reaches.
 */
import * as React from "react";
import { shareBarWidths, shareLabel } from "@/lib/share-bar";

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
  // The money forecast is a card with 16px of padding and a section body has 8,
  // so 8px more each side puts this on exactly the forecast band's width.
  insetLeft = 8,
  insetRight = 8,
  months = 1,
  perMonthLabel,
}: {
  segments: ShareBarSegment[];
  format: (n: number) => string;
  testId: string;
  insetLeft?: number;
  insetRight?: number;
  /** Calendar months the range covers. Above 1, each piece also says what it
   *  comes to in a month — the figures under the bar all do (260805). */
  months?: number;
  perMonthLabel?: string;
}) {
  const trackRef = React.useRef<HTMLDivElement | null>(null);
  const [at, setAt] = React.useState<{ key: string; pct: number } | null>(null);

  const widths = shareBarWidths(segments.map((s) => s.value));
  const total = segments.reduce(
    (acc, s) => acc + (Number.isFinite(s.value) && s.value > 0 ? s.value : 0),
    0,
  );
  let running = 0;
  const drawn = segments
    .map((s, i) => {
      const width = widths[i] ?? 0;
      const start = running;
      running += width;
      return { ...s, width, start, end: running };
    })
    .filter((s) => s.width > 0);

  /** Which piece is under this clientX, and where along the strip it landed. */
  const scrub = (clientX: number) => {
    const el = trackRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (!rect.width) return;
    const pct = Math.min(
      100,
      Math.max(0, ((clientX - rect.left) / rect.width) * 100),
    );
    const hit =
      drawn.find((s) => pct >= s.start && pct <= s.end) ?? drawn.at(-1);
    if (hit) setAt({ key: hit.key, pct });
  };

  // Nothing spent, nothing held — a bar of nothing says less than no bar.
  if (drawn.length === 0) return null;

  const shown = drawn.find((s) => s.key === at?.key);
  const anchor = at?.pct ?? 50;

  return (
    <div
      className="relative"
      data-testid={testId}
      style={{ marginLeft: insetLeft, marginRight: insetRight }}
    >
      <div
        ref={trackRef}
        data-testid={`${testId}-track`}
        className="flex h-3 w-full touch-none select-none overflow-hidden rounded-full"
        onPointerMove={(e) => scrub(e.clientX)}
        onPointerDown={(e) => scrub(e.clientX)}
        onPointerLeave={() => setAt(null)}
      >
        {drawn.map((s) => (
          <div
            key={s.key}
            data-testid={`${testId}-piece-${s.key}`}
            role="button"
            tabIndex={0}
            aria-label={`${s.label}: ${format(s.value)}`}
            onFocus={() => setAt({ key: s.key, pct: s.start + s.width / 2 })}
            onBlur={() => setAt(null)}
            style={{
              width: `${s.width}%`,
              background: s.color,
              opacity: shown && shown.key !== s.key ? 0.45 : 1,
            }}
            className="h-full cursor-pointer transition-opacity"
          />
        ))}
      </div>

      {shown && (
        <div
          data-testid={`${testId}-tooltip`}
          // Above the strip so a finger never covers it, edge-anchored so it can
          // never clip out of the card — the forecast tooltip's rules.
          style={{
            left: `${anchor}%`,
            transform: `translateX(${anchor < 22 ? 0 : anchor > 78 ? -100 : -50}%)`,
          }}
          className="pointer-events-none absolute bottom-full z-10 mb-2 w-max rounded-[var(--radius-md)] border border-[var(--hairline-dark)] bg-[var(--surface-card-dark)] px-3 py-2 text-xs shadow-lg"
        >
          {/* Two rows: what this piece is and how much of it there is, then the
              same piece read per month. One row had four figures fighting for a
              phone's width (user, 260805). */}
          <span className="flex flex-col gap-1">
            <span className="flex items-center gap-2">
              <span
                aria-hidden
                className="size-2 shrink-0 rounded-full"
                style={{ background: shown.color }}
              />
              <span className="text-[var(--muted-foreground)]">
                {shown.label}
              </span>
              <span className="num ml-auto font-semibold text-[var(--body-on-dark)]">
                {format(shown.value)}
              </span>
            </span>
            <span className="flex items-center gap-3 text-[var(--muted-foreground)]">
              {/* An amount alone says nothing about how big a slice it is, which
                  is the only thing a part-to-whole bar exists to say. */}
              <span className="num">{shareLabel(shown.value, total)}</span>
              {months > 1 && (
                <span
                  data-testid={`${testId}-tooltip-per-month`}
                  aria-label={
                    perMonthLabel
                      ? `${perMonthLabel}: ${format(shown.value / months)}`
                      : undefined
                  }
                  className="num ml-auto"
                >
                  <span aria-hidden>⌀ </span>
                  {format(shown.value / months)}
                </span>
              )}
            </span>
          </span>
        </div>
      )}
    </div>
  );
}

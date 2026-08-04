"use client";
/**
 * share-bar.tsx — a stacked bar that gives up its numbers on hover (260804).
 *
 * Replaced two rows of figures on the Overview. A row said "Planned spent
 * 48,483 · Used reserves 16,116 · Overspent 0"; the bar says the same in one
 * shape you read without counting, and the caption underneath carries the
 * number for whichever piece you are pointing at — the whole when you point at
 * none.
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
  total,
  format,
  testId,
}: {
  segments: ShareBarSegment[];
  /** Shown when nothing is pointed at. */
  total: { label: string; value: number };
  format: (n: number) => string;
  testId: string;
}) {
  const [active, setActive] = React.useState<string | null>(null);
  const widths = shareBarWidths(segments.map((s) => s.value));
  const drawn = segments
    .map((s, i) => ({ ...s, width: widths[i] ?? 0 }))
    .filter((s) => s.width > 0);

  // Nothing spent, nothing held — a bar of nothing says less than no bar.
  if (drawn.length === 0) return null;

  const shown = drawn.find((s) => s.key === active);

  return (
    <div className="flex flex-col gap-1.5" data-testid={testId}>
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
      <p
        data-testid={`${testId}-caption`}
        className="text-caption text-center text-[var(--muted-foreground)]"
      >
        {shown ? (
          <>
            <span style={{ color: shown.color }}>●</span> {shown.label}{" "}
            <span className="num text-[var(--body-on-dark)]">
              {format(shown.value)}
            </span>
          </>
        ) : (
          <>
            {total.label}{" "}
            <span className="num text-[var(--body-on-dark)]">
              {format(total.value)}
            </span>
          </>
        )}
      </p>
    </div>
  );
}

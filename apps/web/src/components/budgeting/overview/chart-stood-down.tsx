"use client";
/**
 * chart-stood-down.tsx — the shell a chart leaves behind when it has nothing
 * honest to draw.
 *
 * Extracted from chart-needs-completed-month.tsx (260804) when a second chart
 * needed the same treatment: "Upcoming scheduled payments, by month" with
 * nothing upcoming drew an empty set of axes, which reads as broken rather
 * than as empty (user, 261014).
 */
import type { ReactNode } from "react";

export function ChartStoodDown({
  title,
  testId,
  icon,
  headline,
  body,
}: {
  /** The chart's own label, kept so the section still reads in order. */
  title: string;
  testId: string;
  icon: ReactNode;
  headline: string;
  body: string;
}) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-center text-caption text-[var(--muted-foreground)]">
        {title}
      </p>
      <div
        data-testid={testId}
        className="flex flex-col items-center gap-2 rounded-[var(--radius-lg)] border border-dashed border-[var(--hairline-dark)] px-4 py-6 text-center"
      >
        {icon}
        <p className="text-num-sm">{headline}</p>
        <p className="text-caption text-[var(--muted-foreground)]">{body}</p>
      </div>
    </div>
  );
}

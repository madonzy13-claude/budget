"use client";
/**
 * combined-stat.tsx — a percent with its money underneath.
 *
 * The Financial-Wealth section's P/L / contributions / total figures, lifted out
 * of wealth-section so the Planned range figures can read the same way (260803
 * user request): the percent leads with its arrow, the amount sits beneath it,
 * quieter. One shape for "how much did this move", wherever it is asked.
 *
 * `tone="plain"` drops the up/down colour. Used where the comparison is not a
 * verdict — a part-month plan is a forecast to today, so being "under" it says
 * nothing yet.
 */
import { ArrowDown, ArrowUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { SlotAmount } from "@/components/budgeting/overview/slot-amount";

export function CombinedStat({
  label,
  pct,
  amount,
  mask = false,
  tone = "auto",
  testId,
}: {
  label: string;
  pct: number | null;
  amount: string;
  mask?: boolean;
  /** "auto" colours by direction; "plain" stays neutral. */
  tone?: "auto" | "plain";
  testId?: string;
}) {
  const up = pct !== null && pct >= 0;
  const down = pct !== null && pct < 0;
  const color =
    tone === "plain"
      ? "text-[var(--body-on-dark)]"
      : up
        ? "text-[var(--trading-up)]"
        : down
          ? "text-[var(--trading-down)]"
          : "text-[var(--muted-foreground)]";
  const Arrow = up ? ArrowUp : ArrowDown;
  const pctStr =
    pct === null ? "—" : `${pct >= 0 ? "+" : "−"}${Math.abs(pct).toFixed(1)}%`;
  return (
    <div
      className="flex flex-col items-center gap-0.5 text-center"
      data-testid={testId}
    >
      <p className="text-caption text-[var(--muted-foreground)]">{label}</p>
      <span
        className={cn(
          "num inline-flex items-center gap-1 whitespace-nowrap text-num-md",
          color,
        )}
        data-testid={testId ? `${testId}-pct` : undefined}
      >
        {pct !== null && <Arrow className="size-3.5" aria-hidden="true" />}
        {mask ? <SlotAmount value={pctStr} /> : pctStr}
      </span>
      <span className="num text-caption whitespace-nowrap text-[var(--muted-foreground)]">
        {mask ? <SlotAmount value={amount} /> : amount}
      </span>
    </div>
  );
}

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
import { plPctDecimals, plSign, plTone } from "@/lib/pl-tone";
import { SlotAmount } from "@/components/budgeting/overview/slot-amount";

export function CombinedStat({
  label,
  pct,
  amount,
  mask = false,
  tone = "auto",
  color,
  testId,
  size = "md",
  labelRef,
}: {
  label: string;
  pct: number | null;
  amount: string;
  mask?: boolean;
  /** "auto" colours by direction; "plain" stays neutral. */
  tone?: "auto" | "plain";
  /** An explicit colour, for callers that band by DISTANCE rather than
   *  direction — "how far off plan" is green either side of it. Ignored when
   *  `tone` is "plain". */
  color?: string;
  testId?: string;
  /** "sm" where the stat shares a row with plain figures: leading a size up
   *  stood the column taller than its neighbours (user, 260805). */
  size?: "md" | "sm";
  /** Measures the LABEL's own width, for a caller lining something up with it. */
  labelRef?: React.Ref<HTMLSpanElement>;
}) {
  // Three-state. A metric that did not move is 0, and 0 is neither a gain nor a
  // loss — it took the green up-arrow "+0.0%" until 260819.
  const dir = plTone(pct);
  // Enough decimals for the figure to show what its colour claims.
  const pctDecimals = plPctDecimals(pct);
  // Inline, never a class. cn() is tailwind-merge, which reads an arbitrary
  // text-[…] as a FONT SIZE and therefore dropped the size class sitting beside
  // it — the ongoing month, the one range that takes this neutral colour, kept
  // rendering its percent a size up long after the size was set (user, 260805).
  const toneColor =
    tone === "plain"
      ? "var(--body-on-dark)"
      : dir === "up"
        ? "var(--trading-up)"
        : dir === "down"
          ? "var(--trading-down)"
          : "var(--muted-foreground)";
  const resolved = tone !== "plain" && color !== undefined ? color : toneColor;
  const Arrow = dir === "up" ? ArrowUp : dir === "down" ? ArrowDown : null;
  const pctStr =
    pct === null
      ? "—"
      : `${plSign(dir, "−")}${Math.abs(pct).toFixed(pctDecimals)}%`;
  return (
    <div
      className="flex flex-col items-center gap-0.5 text-center"
      data-testid={testId}
    >
      <p className="text-caption text-[var(--muted-foreground)]">
        <span ref={labelRef}>{label}</span>
      </p>
      <span
        className={cn(
          "num inline-flex items-center gap-1 whitespace-nowrap",
          size === "sm" ? "text-num-sm" : "text-num-md",
        )}
        style={{ color: resolved }}
        data-testid={testId ? `${testId}-pct` : undefined}
      >
        {Arrow && <Arrow className="size-3.5" aria-hidden="true" />}
        {mask ? <SlotAmount value={pctStr} /> : pctStr}
      </span>
      <span className="num text-caption whitespace-nowrap text-[var(--muted-foreground)]">
        {mask ? <SlotAmount value={amount} /> : amount}
      </span>
    </div>
  );
}

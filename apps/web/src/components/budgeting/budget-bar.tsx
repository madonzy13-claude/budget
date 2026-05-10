"use client";

/**
 * budget-bar.tsx — Three-state spending progress bar.
 * States: green (0-80%), yellow (81-100%), red (>100%).
 * Per UI-SPEC §BudgetBar.
 */
import { cn } from "@/lib/utils";

interface BudgetBarProps {
  /** Spent amount in cents. */
  spent: number;
  /** Budget limit in cents. */
  limit: number;
  /** Optional label shown below bar. */
  label?: string;
  className?: string;
}

export function BudgetBar({ spent, limit, label, className }: BudgetBarProps) {
  if (limit <= 0) return null;

  const ratio = spent / limit;
  const pct = Math.min(ratio * 100, 100);

  const state: "green" | "yellow" | "red" =
    ratio > 1 ? "red" : ratio > 0.8 ? "yellow" : "green";

  return (
    <div className={cn("space-y-1", className)}>
      <div
        className="relative h-2 w-full rounded-full overflow-hidden bg-muted"
        role="progressbar"
        aria-valuenow={Math.round(pct)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label}
      >
        <div
          className={cn(
            "absolute inset-y-0 left-0 rounded-full transition-all duration-300",
            state === "green" && "bg-green-500",
            state === "yellow" && "bg-yellow-400",
            state === "red" && "bg-destructive"
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
      {label && (
        <p className="text-xs text-muted-foreground">{label}</p>
      )}
    </div>
  );
}

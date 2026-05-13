"use client";
/**
 * month-navigator.tsx — Month navigation bar with URL state.
 *
 * D-PH4-Q3: Cmd/Ctrl+Arrow navigates; plain arrows do NOT.
 * D-PH4-Q4: URL ?month=YYYY-MM is source of truth.
 * T-04-03-07: handler calls e.preventDefault() to prevent browser history hijack.
 */
import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { ChevronLeft, ChevronRight, RotateCcw } from "lucide-react";
import { useMonthParam } from "@/hooks/use-month-param";
import { cn } from "@/lib/utils";

export interface MonthNavigatorProps {
  month: string; // YYYY-MM (from RSC page)
  budgetTz?: string;
  className?: string;
}

export function MonthNavigator({ budgetTz, className }: MonthNavigatorProps) {
  const t = useTranslations("grid.monthNav");
  const { monthStr, prev, next, today, isCurrentMonth } = useMonthParam(budgetTz);

  // Format month label
  const [year, monthNum] = monthStr.split("-").map(Number);
  const monthLabel = new Intl.DateTimeFormat("en", {
    month: "long",
    year: "numeric",
  }).format(new Date(year, monthNum - 1, 1));

  // Cmd/Ctrl+Arrow keyboard shortcut (D-PH4-Q3)
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!(e.metaKey || e.ctrlKey)) return;
      const el = document.activeElement as HTMLElement | null;
      const tag = el?.tagName?.toUpperCase();
      if (
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        el?.isContentEditable
      )
        return;
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        prev();
      }
      if (e.key === "ArrowRight") {
        e.preventDefault();
        next();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [prev, next]);

  return (
    <div
      className={cn(
        "flex h-12 items-center gap-2 px-4",
        "sticky top-[112px] z-10 bg-[var(--canvas-dark)]",
        "border-b border-[var(--hairline-dark)]",
        className,
      )}
    >
      <button
        type="button"
        data-testid="month-navigator-prev"
        aria-label={t("prev")}
        onClick={prev}
        className="flex h-8 w-8 items-center justify-center rounded hover:bg-[var(--surface-elevated-dark)] focus-visible:outline-2 focus-visible:outline-[var(--info)]"
      >
        <ChevronLeft className="h-4 w-4" aria-hidden="true" />
      </button>

      {/* Live region for a11y month change announcement */}
      <span
        data-testid="month-navigator-label"
        aria-live="polite"
        className="min-w-[160px] text-center text-sm font-medium text-[var(--body-on-dark)]"
      >
        {monthLabel}
      </span>

      <button
        type="button"
        data-testid="month-navigator-next"
        aria-label={t("next")}
        onClick={next}
        className="flex h-8 w-8 items-center justify-center rounded hover:bg-[var(--surface-elevated-dark)] focus-visible:outline-2 focus-visible:outline-[var(--info)]"
      >
        <ChevronRight className="h-4 w-4" aria-hidden="true" />
      </button>

      {!isCurrentMonth && (
        <button
          type="button"
          data-testid="month-navigator-today"
          onClick={today}
          className="ml-auto flex h-8 items-center gap-1 rounded px-3 text-xs text-[var(--muted-foreground)] hover:bg-[var(--surface-elevated-dark)]"
        >
          <RotateCcw className="h-3 w-3" aria-hidden="true" />
          Today
        </button>
      )}
    </div>
  );
}

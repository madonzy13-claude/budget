"use client";
/**
 * month-navigator.tsx — Month navigation bar with URL state.
 *
 * D-PH4-Q3: Cmd/Ctrl+Arrow navigates; plain arrows do NOT.
 * D-PH4-Q4: URL ?month=YYYY-MM is source of truth.
 * T-04-03-07: handler calls e.preventDefault() to prevent browser history hijack.
 */
import { useEffect } from "react";
import { useTranslations, useLocale } from "next-intl";
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
  const locale = useLocale();
  const { monthStr, prev, next, today, isCurrentMonth } =
    useMonthParam(budgetTz);

  // Format month label. Use the active next-intl locale so the month
  // name follows the user's UI language (was hardcoded "en"). For pl/uk
  // the genitive-style standalone form is lowercase by default
  // ("травень 2026 р."); upper-case the first character so the header
  // reads as a proper noun — `capitalize` CSS can't be used because it
  // would also upper-case the "р." year-suffix marker.
  const parts = monthStr.split("-");
  const year = parseInt(parts[0] ?? "2000", 10);
  const monthNum = parseInt(parts[1] ?? "1", 10);
  const formatted = new Intl.DateTimeFormat(locale, {
    month: "long",
    year: "numeric",
  }).format(new Date(year, monthNum - 1, 1));
  const monthLabel =
    formatted.length > 0
      ? formatted.charAt(0).toLocaleUpperCase(locale) + formatted.slice(1)
      : formatted;

  // Cmd/Ctrl+Arrow keyboard shortcut (D-PH4-Q3)
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!(e.metaKey || e.ctrlKey)) return;
      const el = document.activeElement as HTMLElement | null;
      const tag = el?.tagName?.toUpperCase();
      if (tag === "INPUT" || tag === "TEXTAREA" || el?.isContentEditable)
        return;
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        prev();
      }
      if (e.key === "ArrowRight" && !isCurrentMonth) {
        e.preventDefault();
        next();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [prev, next, isCurrentMonth]);

  return (
    <div
      className={cn(
        // 3-column grid: equal 1fr side lanes keep the centre controls truly
        // centred, while the right lane holds the optional "Today" button in
        // its OWN space. The button used to be `absolute right-4`, which on a
        // narrow (mobile) viewport overlapped the centred "next" chevron and
        // swallowed its clicks (Playwright: "today intercepts pointer events").
        // A dedicated lane removes the overlap at every width / locale.
        "relative grid h-12 grid-cols-[1fr_auto_1fr] items-center gap-2 px-4",
        // Sticks just under the BDP tabs (48px tall, sticky top-0 in the
        // (app) scroll container). The earlier 112px constant assumed the
        // (app) header was sticky too — it isn't, after the mobile-scroll
        // refactor — leaving a 64px blank band above the slider.
        // z-30 so the bar always paints over the spendings grid's
        // column-sticky band (`z-10`) — without this bump, fast scrolls
        // on iPhone briefly render the column cards on top of the month
        // label, looking like the navigator is "behind" the grid.
        "sticky top-12 z-30 bg-[var(--canvas-dark)]",
        "border-b border-[var(--hairline-dark)]",
        className,
      )}
    >
      {/* Left lane (empty) balances the right lane so the controls stay centred. */}
      <span aria-hidden="true" />

      <div className="flex items-center justify-center gap-2">
        <button
          type="button"
          data-testid="month-navigator-prev"
          aria-label={t("prev")}
          onClick={prev}
          className="flex h-8 w-8 items-center justify-center rounded hover:bg-[var(--surface-elevated-dark)] focus-visible:outline-2 focus-visible:outline-[var(--primary)]"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        </button>

        {/* Live region for a11y month change announcement */}
        <span
          data-testid="month-navigator-label"
          aria-live="polite"
          className="min-w-[120px] sm:min-w-[160px] text-center text-sm font-medium text-[var(--body-on-dark)]"
        >
          {monthLabel}
        </span>

        <button
          type="button"
          data-testid="month-navigator-next"
          aria-label={t("next")}
          onClick={next}
          disabled={isCurrentMonth}
          aria-disabled={isCurrentMonth}
          className={cn(
            "flex h-8 w-8 items-center justify-center rounded focus-visible:outline-2 focus-visible:outline-[var(--primary)]",
            isCurrentMonth
              ? "cursor-not-allowed opacity-30"
              : "hover:bg-[var(--surface-elevated-dark)]",
          )}
        >
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      {/* Right lane: optional "Today" reset — its own column, never overlaps. */}
      <div className="flex justify-end">
        {!isCurrentMonth && (
          <button
            type="button"
            data-testid="month-navigator-today"
            onClick={today}
            className="flex h-8 items-center gap-1 rounded px-3 text-xs text-[var(--muted-foreground)] hover:bg-[var(--surface-elevated-dark)]"
          >
            <RotateCcw className="h-3 w-3" aria-hidden="true" />
            {t("today")}
          </button>
        )}
      </div>
    </div>
  );
}

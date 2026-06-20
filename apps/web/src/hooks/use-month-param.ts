"use client";
/**
 * use-month-param.ts — URL ?month=YYYY-MM state hook.
 *
 * Source of truth for the viewed month; bookmarkable.
 * Default = current month in budgetTz (Temporal API).
 * D-PH4-Q4: month state in URL search param.
 */
import { useSearchParams, usePathname } from "next/navigation";
import { Temporal } from "temporal-polyfill";

export function useMonthParam(budgetTz: string = "UTC") {
  const params = useSearchParams();
  const pathname = usePathname();
  const raw = params.get("month");
  const month =
    raw && /^\d{4}-\d{2}$/.test(raw)
      ? Temporal.PlainYearMonth.from(raw)
      : Temporal.Now.plainDateISO(budgetTz).toPlainYearMonth();

  const monthStr = month.toString();

  const currentMonth = Temporal.Now.plainDateISO(budgetTz).toPlainYearMonth();
  const isCurrentMonth =
    Temporal.PlainYearMonth.compare(month, currentMonth) === 0;

  function setMonth(next: Temporal.PlainYearMonth) {
    const nextStr = next.toString();
    const sp = new URLSearchParams(params.toString());
    sp.set("month", nextStr);
    // Shallow URL update — NOT router.push (260616). The spendings page is a
    // static shell and the month is pure client state, so a router.push would
    // do a needless RSC navigation that HANGS offline (the month-nav-offline
    // bug). Native history.pushState integrates with Next's useSearchParams
    // (14.1+), re-rendering useMonthParam without any RSC fetch — works offline
    // and is instant online. Bookmarkable + back-button still work (real history
    // entry).
    window.history.pushState(null, "", `${pathname}?${sp.toString()}`);
  }

  function prev() {
    setMonth(month.subtract({ months: 1 }));
  }

  function next() {
    // Never navigate into a future month — the current month is the max.
    if (isCurrentMonth) return;
    setMonth(month.add({ months: 1 }));
  }

  function today() {
    setMonth(Temporal.Now.plainDateISO(budgetTz).toPlainYearMonth());
  }

  return { month, monthStr, setMonth, prev, next, today, isCurrentMonth };
}

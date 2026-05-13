"use client";
/**
 * use-month-param.ts — URL ?month=YYYY-MM state hook.
 *
 * Source of truth for the viewed month; bookmarkable.
 * Default = current month in budgetTz (Temporal API).
 * D-PH4-Q4: month state in URL search param.
 */
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { Temporal } from "temporal-polyfill";

export function useMonthParam(budgetTz: string = "UTC") {
  const params = useSearchParams();
  const router = useRouter();
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
    router.push(`${pathname}?${sp.toString()}`);
  }

  function prev() {
    setMonth(month.subtract({ months: 1 }));
  }

  function next() {
    setMonth(month.add({ months: 1 }));
  }

  function today() {
    setMonth(Temporal.Now.plainDateISO(budgetTz).toPlainYearMonth());
  }

  return { month, monthStr, setMonth, prev, next, today, isCurrentMonth };
}

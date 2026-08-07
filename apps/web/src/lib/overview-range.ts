/**
 * overview-range.ts — Overview range presets → {from,to} (YYYY-MM-DD), today-relative.
 *
 * Drives the range-scoped sections (Planned timeline/avg, Overspent, Wealth series).
 * "all" is capped at ~5 years back to stay inside the route's span guard
 * (MAX_SPAN_DAYS = 5*366); budgets older than that simply start the window 5y ago.
 */
import { Temporal } from "temporal-polyfill";

export type RangePreset =
  | "thisMonth"
  | "last3Months"
  | "last6Months"
  | "last12Months"
  | "all"
  | "custom";

export interface OverviewRange {
  preset: RangePreset;
  from: string; // YYYY-MM-DD
  to: string; // YYYY-MM-DD
}

/** Today's calendar date in the user's IANA timezone (r31 item 1). `now` is
 *  injectable for tests; production uses the real clock. A bad zone → UTC. */
export function todayInTz(
  tz: string,
  now?: Temporal.Instant,
): Temporal.PlainDate {
  const instant = now ?? Temporal.Now.instant();
  try {
    return instant.toZonedDateTimeISO(tz).toPlainDate();
  } catch {
    return instant.toZonedDateTimeISO("UTC").toPlainDate();
  }
}

export function resolveRange(
  preset: RangePreset,
  tz: string = "UTC",
  custom?: { from: string; to: string },
  now?: Temporal.Instant,
): { from: string; to: string } {
  const today = todayInTz(tz, now);
  const to = today.toString();
  switch (preset) {
    case "thisMonth":
      return { from: today.with({ day: 1 }).toString(), to };
    case "last3Months":
      return {
        from: today.subtract({ months: 2 }).with({ day: 1 }).toString(),
        to,
      };
    case "last6Months":
      return {
        from: today.subtract({ months: 5 }).with({ day: 1 }).toString(),
        to,
      };
    case "last12Months":
      // Trailing 12 months (a real year), NOT year-to-date: 11 months back to the
      // 1st + the current partial month = 12 month-buckets.
      return {
        from: today.subtract({ months: 11 }).with({ day: 1 }).toString(),
        to,
      };
    case "all":
      // Cap at 5 years to respect the API span guard.
      return { from: today.subtract({ years: 5 }).toString(), to };
    case "custom":
      return { from: custom?.from ?? to, to: custom?.to ?? to };
  }
}

export const DEFAULT_RANGE_PRESET: RangePreset = "thisMonth";

export function makeRange(
  preset: RangePreset,
  tz: string = "UTC",
  custom?: { from: string; to: string },
): OverviewRange {
  return { preset, ...resolveRange(preset, tz, custom) };
}

/**
 * Step the window back (-1) or forward (+1) by its own length (260802 request).
 *
 * The pills pick a SIZE; the arrows walk windows of that size. A window that
 * starts on the 1st steps by whole months and ends on a real month end, so
 * February keeps its 28 days. Anything else is a plain day window and steps by
 * its own day count. Forward never runs past today, and "all" has nothing to
 * walk — it already reaches back as far as the data goes.
 */
export function shiftRange(
  range: OverviewRange,
  direction: -1 | 1,
  tz: string = "UTC",
  now?: Temporal.Instant,
): OverviewRange {
  if (!canShiftRange(range, direction, tz, now)) return range;
  const today = todayInTz(tz, now);
  const from = Temporal.PlainDate.from(range.from);
  const to = Temporal.PlainDate.from(range.to);

  if (from.day === 1) {
    const months = (to.year - from.year) * 12 + (to.month - from.month) + 1;
    const step = { months: months * Math.abs(direction) };
    const nextFrom = direction < 0 ? from.subtract(step) : from.add(step);
    const lastMonth = nextFrom.add({ months: months - 1 });
    const monthEnd = lastMonth.with({ day: lastMonth.daysInMonth });
    return {
      ...range,
      from: nextFrom.toString(),
      to: (Temporal.PlainDate.compare(monthEnd, today) > 0
        ? today
        : monthEnd
      ).toString(),
    };
  }

  const days = from.until(to).days + 1;
  const step = { days };
  const nextFrom = direction < 0 ? from.subtract(step) : from.add(step);
  const nextTo = direction < 0 ? to.subtract(step) : to.add(step);
  return {
    ...range,
    from: nextFrom.toString(),
    to: (Temporal.PlainDate.compare(nextTo, today) > 0
      ? today
      : nextTo
    ).toString(),
  };
}

/** Is there anywhere to step? Forward stops at today; "all" never steps. */
export function canShiftRange(
  range: OverviewRange,
  direction: -1 | 1,
  tz: string = "UTC",
  now?: Temporal.Instant,
): boolean {
  if (range.preset === "all") return false;
  if (direction < 0) return true;
  const today = todayInTz(tz, now);
  return (
    Temporal.PlainDate.compare(Temporal.PlainDate.from(range.to), today) < 0
  );
}

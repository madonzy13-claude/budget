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
  | "thisYear"
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
    case "thisYear":
      return { from: today.with({ month: 1, day: 1 }).toString(), to };
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

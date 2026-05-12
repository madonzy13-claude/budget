import { Temporal } from "temporal-polyfill";

export type Cadence = "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";

export interface CadenceSpec {
  cadence: Cadence;
  /** MONTHLY: day-of-month 1-31 (clamped to month length).
   *  YEARLY: day-of-month within yearlyMonth (clamped to that month's length). */
  anchorDay?: number;
  /** WEEKLY only: 0=Sun, 1=Mon, ..., 6=Sat */
  weeklyDow?: number;
  /** YEARLY only: 1=Jan, ..., 12=Dec */
  yearlyMonth?: number;
}

export function nextOccurrence(
  spec: CadenceSpec,
  prev: Temporal.PlainDate,
): Temporal.PlainDate {
  if (spec.cadence === "DAILY") {
    return prev.add({ days: 1 });
  }
  if (spec.cadence === "MONTHLY") {
    if (typeof spec.anchorDay !== "number")
      throw new Error("anchorDay required for MONTHLY");
    const candidate = prev.add({ months: 1 });
    // Preserve anchor day, clamp to last-of-month if shorter (per D-05-i + Pitfall 6)
    const dim = candidate.daysInMonth;
    return candidate.with({ day: Math.min(spec.anchorDay, dim) });
  }
  if (spec.cadence === "WEEKLY") {
    if (typeof spec.weeklyDow !== "number")
      throw new Error("weeklyDow required for WEEKLY");
    // Temporal dayOfWeek: Mon=1..Sun=7; D-05-i uses 0..6 Sun=0; convert Sun=0 → 7
    const targetTemporal = spec.weeklyDow === 0 ? 7 : spec.weeklyDow;
    let cursor = prev.add({ days: 1 });
    while (cursor.dayOfWeek !== targetTemporal)
      cursor = cursor.add({ days: 1 });
    return cursor;
  }
  if (spec.cadence === "YEARLY") {
    if (typeof spec.yearlyMonth !== "number")
      throw new Error("yearlyMonth required for YEARLY");
    if (typeof spec.anchorDay !== "number")
      throw new Error("anchorDay required for YEARLY");
    const targetYear = prev.year + 1;
    const targetMonth = spec.yearlyMonth;
    const daysInTarget = Temporal.PlainDate.from({
      year: targetYear,
      month: targetMonth,
      day: 1,
    }).daysInMonth;
    const targetDay = Math.min(spec.anchorDay, daysInTarget);
    return Temporal.PlainDate.from({
      year: targetYear,
      month: targetMonth,
      day: targetDay,
    });
  }
  throw new Error(`Unsupported cadence: ${spec.cadence as string}`);
}

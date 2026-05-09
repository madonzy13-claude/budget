import { Temporal } from "temporal-polyfill";

export type Cadence = "MONTHLY" | "WEEKLY";

export interface CadenceSpec {
  cadence: Cadence;
  anchorDay?: number;
  weeklyDow?: number;
}

export function nextOccurrence(
  spec: CadenceSpec,
  prev: Temporal.PlainDate,
): Temporal.PlainDate {
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
  throw new Error(`Unsupported cadence: ${spec.cadence as string}`);
}

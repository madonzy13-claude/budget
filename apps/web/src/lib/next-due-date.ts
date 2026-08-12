/**
 * next-due-date.ts — nearest UPCOMING date (today or later) matching a scheduled
 * rule's cadence + day configuration. Used to auto-fill the scheduled form's
 * "first due date" so it follows the picked cadence/day instead of defaulting to
 * today. Pure + UTC-based (dates are YYYY-MM-DD, no time / tz drift).
 */
export type RuleCadence = "WEEKLY" | "MONTHLY" | "YEARLY";

const pad = (n: number) => String(n).padStart(2, "0");
/** Days in a 1-based month (day 0 of the next month = last day of this one). */
function daysInMonth(year: number, month1: number): number {
  return new Date(Date.UTC(year, month1, 0)).getUTCDate();
}

export function nextDueDate(
  cadence: RuleCadence,
  cfg: { weeklyDow?: number; dayOfMonth?: number; yearlyMonth?: number },
  todayIso: string,
): string {
  const [y, m, d] = todayIso.split("-").map(Number) as [number, number, number];

  if (cadence === "WEEKLY") {
    // ISO weekday: 1=Mon..7=Sun. Today counts (delta 0).
    const dow = Math.max(1, Math.min(7, cfg.weeklyDow ?? 1));
    const base = new Date(Date.UTC(y, m - 1, d));
    const curDow = ((base.getUTCDay() + 6) % 7) + 1; // JS Sun=0 → ISO
    base.setUTCDate(base.getUTCDate() + ((dow - curDow + 7) % 7));
    return `${base.getUTCFullYear()}-${pad(base.getUTCMonth() + 1)}-${pad(base.getUTCDate())}`;
  }

  const dom = Math.max(1, Math.min(31, cfg.dayOfMonth ?? 1));

  if (cadence === "MONTHLY") {
    let year = y;
    let mon = m; // 1-based
    if (dom < d) {
      mon += 1;
      if (mon > 12) {
        mon = 1;
        year += 1;
      }
    }
    return `${year}-${pad(mon)}-${pad(Math.min(dom, daysInMonth(year, mon)))}`;
  }

  // YEARLY: the given month + day, this year if still upcoming, else next year.
  const mon = Math.max(1, Math.min(12, cfg.yearlyMonth ?? 1));
  let year = y;
  const thisYear = new Date(
    Date.UTC(year, mon - 1, Math.min(dom, daysInMonth(year, mon))),
  );
  if (thisYear.getTime() < Date.UTC(y, m - 1, d)) year += 1;
  return `${year}-${pad(mon)}-${pad(Math.min(dom, daysInMonth(year, mon)))}`;
}

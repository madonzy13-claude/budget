import { Temporal } from "temporal-polyfill";

export function firstDayOfMonth(at: Date, ianaTz: string): Temporal.PlainDate {
  const z = Temporal.Instant.fromEpochMilliseconds(
    at.getTime(),
  ).toZonedDateTimeISO(ianaTz);
  return z.toPlainDate().with({ day: 1 });
}

export function lastDayOfMonth(at: Date, ianaTz: string): Temporal.PlainDate {
  const f = firstDayOfMonth(at, ianaTz);
  return f.add({ months: 1 }).subtract({ days: 1 });
}

export function plainDateToDateUTC(pd: Temporal.PlainDate): Date {
  return new Date(`${pd.toString()}T00:00:00.000Z`);
}

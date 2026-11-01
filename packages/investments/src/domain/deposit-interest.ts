import { Temporal } from "temporal-polyfill";
import { computeDepositValueCents, type CapFrequency } from "./deposit-value";

const MONTHS: Record<CapFrequency, number> = {
  // ponytail: daily capitalization rolls up into one row per month — a row per
  // day would bury the ledger; the sum is identical (telescoping).
  daily: 1,
  monthly: 1,
  quarterly: 3,
  semiannual: 6,
  yearly: 12,
};

/**
 * D-19 Interest rows: one per passed capitalization date plus one accrued-to-date
 * row at asOf (or the end date when matured), computed from rate + dates and
 * never stored. Each row = value(d_i) − value(d_{i−1}), so the rows telescope
 * to exactly value(last row) − principal. `startDate` is the CURRENT
 * deposit_start_date: after a part-sale (Phase 13 D-20) earlier interest is
 * already inside the Sold row's realized.
 */
export function depositInterestRows(i: {
  principalCents: bigint;
  rateBps: number;
  startDate: string;
  capFrequency: CapFrequency;
  endDate: string | null;
  asOf: string;
}): Array<{ date: string; interestCents: bigint }> {
  const start = Temporal.PlainDate.from(i.startDate);
  let limit = Temporal.PlainDate.from(i.asOf);
  if (i.endDate && Temporal.PlainDate.compare(i.endDate, limit) < 0)
    limit = Temporal.PlainDate.from(i.endDate);
  const value = (d: string) =>
    BigInt(
      computeDepositValueCents({
        principalCents: i.principalCents,
        rateBps: i.rateBps,
        startDate: i.startDate,
        capFrequency: i.capFrequency,
        endDate: i.endDate,
        asOf: d,
      }),
    );

  const dates: string[] = [];
  for (let n = 1; ; n++) {
    const d = start.add({ months: MONTHS[i.capFrequency] * n });
    if (Temporal.PlainDate.compare(d, limit) > 0) break;
    dates.push(d.toString());
  }
  // Between two capitalizations (today, or the end date when matured): one
  // accrued-to-date tail row so the ledger agrees with the shown value.
  const tail = limit.toString();
  const accrued =
    Temporal.PlainDate.compare(limit, start) > 0 && dates.at(-1) !== tail;
  if (accrued) dates.push(tail);

  const rows: Array<{ date: string; interestCents: bigint }> = [];
  let prev = i.principalCents;
  for (const date of dates) {
    const v = value(date);
    if (accrued && date === tail && v === prev) continue;
    rows.push({ date, interestCents: v - prev });
    prev = v;
  }
  return rows;
}

import { Temporal } from "temporal-polyfill";

/**
 * P/L "since yesterday's close", anchored on the VIEWER's local midnight.
 *
 * The Capitalization hero card used the wealth endpoint's `grow`, which anchors on
 * the first in-range bucket — with a from=yesterday range that's ~29h (yesterday
 * 00:00 → now), so it folded in all of yesterday's movement. The honest "today so
 * far" figure compares now against the last value at the user's local midnight
 * (= the close of yesterday in their timezone).
 *
 * `series` is the overview/wealth hourly series (UTC-hour labels "YYYY-MM-DDTHH",
 * ascending, carry-forward filled). Picks the last bucket at/before the viewer's
 * midnight as the base and the last bucket as "now". Pure — `nowMs` is injected.
 */
export function dayCloseDelta(
  series: { label: string; value_cents: string }[],
  tz: string,
  nowMs: number,
): { delta_cents: string; delta_pct: number | null } | null {
  if (!series.length) return null;

  let midnightLabel: string;
  try {
    // Start of the viewer's current local day, expressed as a UTC-hour label so it
    // compares directly against the series labels.
    const utcMidnight = Temporal.Instant.fromEpochMilliseconds(nowMs)
      .toZonedDateTimeISO(tz)
      .startOfDay()
      .withTimeZone("UTC");
    midnightLabel = `${utcMidnight.toPlainDate().toString()}T${String(
      utcMidnight.hour,
    ).padStart(2, "0")}`;
  } catch {
    return null; // invalid IANA timezone
  }

  // Labels are fixed-width ISO, so lexical compare == chronological.
  let base = series[0];
  for (const p of series) {
    if (p.label <= midnightLabel) base = p;
    else break;
  }
  const cur = series[series.length - 1];
  const b = BigInt(base.value_cents);
  const c = BigInt(cur.value_cents);
  return {
    delta_cents: (c - b).toString(),
    delta_pct: b === 0n ? null : (Number(c - b) * 100) / Number(b),
  };
}

/**
 * range-pref.ts — the range someone last looked at, as something storable.
 *
 * The pick belongs to the PERSON, not the device (260805 request): pick 3M on
 * the phone and the desktop opens on 3M, while someone else in the same budget
 * still opens on their own. That means it rides the member's stored prefs,
 * which are `Record<string, string[]>` — so a range has to survive a round trip
 * through an array of strings.
 *
 * A PRESET stores only its name and is re-resolved against today, because
 * "this month" has to keep meaning the month it is now. A CUSTOM range is not
 * reproducible from its name, so it carries its two dates.
 *
 * Decoding is deliberately unforgiving: it is fed whatever is in the database,
 * including prefs written by an older build, and a page that was only trying to
 * remember a preference must not throw or draw a range nobody can read. Anything
 * it does not recognise comes back null and the caller uses its default.
 */
import {
  makeRange,
  type OverviewRange,
  type RangePreset,
} from "./overview-range";

/** The ui-prefs key both range selectors store under. */
export const RANGE_PREF_KEY = "overviewRange";

const PRESETS: readonly RangePreset[] = [
  "thisMonth",
  "last3Months",
  "last6Months",
  "last12Months",
  "all",
  "custom",
];

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function encodeRangePref(range: OverviewRange): string[] {
  return range.preset === "custom"
    ? ["custom", range.from, range.to]
    : [range.preset];
}

export function decodeRangePref(
  stored: string[] | undefined,
  tz: string,
): OverviewRange | null {
  if (!Array.isArray(stored) || stored.length === 0) return null;
  const [preset, from, to] = stored;
  if (typeof preset !== "string") return null;
  if (!PRESETS.includes(preset as RangePreset)) return null;
  if (preset !== "custom") return makeRange(preset as RangePreset, tz);
  // A custom range IS its dates — without a readable pair there is nothing to
  // restore, and a reversed one would ask the API for a negative span.
  if (typeof from !== "string" || typeof to !== "string") return null;
  if (!ISO_DATE.test(from) || !ISO_DATE.test(to)) return null;
  if (from > to) return null;
  return makeRange("custom", tz, { from, to });
}

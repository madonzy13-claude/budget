/**
 * projection-horizon.ts — how far ahead the Overview forecast looks, as
 * something storable.
 *
 * The pick belongs to the PERSON and to the BUDGET, not to the device (260904
 * request, same rule as the range pills): choose a year on the phone and the
 * desktop opens on a year, while another member of the same budget still opens
 * on their own. That means it rides `budget_members.ui_prefs`, which is
 * `Record<string, string[]>` — so a number has to survive a round trip through
 * an array of strings.
 *
 * Decoding is deliberately unforgiving: it is fed whatever is in the database,
 * including prefs written by an older build. Anything it does not recognise
 * comes back null and the caller uses the default — a card that was only trying
 * to remember a preference must never ask the API for a NaN-day window.
 *
 * The bounds are the SERVER's bounds (clampProjectionWindowDays in
 * compute-cashflow-projection.ts). Keeping them equal means the slider can only
 * ask for windows the API will actually honour — a wider slider would silently
 * hand back a clamped strip that doesn't match the number beside it.
 */

/** The ui-prefs key the horizon stores under. */
export const HORIZON_PREF_KEY = "projectionDays";

/** The rolling window everyone had before the pick existed (user, 260812). */
export const DEFAULT_HORIZON_DAYS = 100;
export const MIN_HORIZON_DAYS = 30;
export const MAX_HORIZON_DAYS = 730;

/** Whole windows, one tap each, under the slider: a month, a quarter, half a
 *  year, a year, eighteen months, two years. */
export const HORIZON_SNAP_DAYS = [30, 90, 180, 365, 546, 730] as const;

export function clampHorizonDays(days: number): number {
  if (!Number.isFinite(days)) return DEFAULT_HORIZON_DAYS;
  return Math.min(
    MAX_HORIZON_DAYS,
    Math.max(MIN_HORIZON_DAYS, Math.round(days)),
  );
}

export function encodeHorizonPref(days: number): string[] {
  return [String(clampHorizonDays(days))];
}

export function decodeHorizonPref(stored: string[] | undefined): number | null {
  if (!Array.isArray(stored) || stored.length === 0) return null;
  const raw = stored[0];
  if (typeof raw !== "string" || raw.trim() === "") return null;
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  return clampHorizonDays(n);
}

/**
 * `iso` moved on by whole days, in UTC.
 *
 * The forecast's end date has to keep up with a dragging thumb, and asking the
 * server where a window ends is a round trip per pixel. It is a calendar
 * question with an exact answer, so it is answered here: the strip's first day
 * is known, and the last is that day plus the span. Returns the input unchanged
 * if it is not a parseable YYYY-MM-DD, so a malformed payload cannot render a
 * date of "NaN".
 */
export function isoPlusDays(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map((s) => parseInt(s, 10));
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) {
    return iso;
  }
  const t = Date.UTC(y!, m! - 1, d!) + days * 86_400_000;
  return new Date(t).toISOString().slice(0, 10);
}

/**
 * The smallest snap window that CONTAINS `days`.
 *
 * Used only while the thumb is moving. Asking for the exact draft would fetch a
 * dozen one-off windows across a full sweep, none of them reusable — drag back
 * down and every one is a fresh request. Asking for the bucket instead means a
 * sweep touches at most six windows, each answering every draft inside it from
 * cache, and the days beyond the draft are simply not drawn. The window that
 * gets COMMITTED is still the exact one.
 */
export function horizonBucket(days: number): number {
  const d = clampHorizonDays(days);
  return HORIZON_SNAP_DAYS.find((s) => s >= d) ?? MAX_HORIZON_DAYS;
}

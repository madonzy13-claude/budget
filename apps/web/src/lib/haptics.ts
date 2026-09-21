/**
 * haptics.ts — a touch of feedback when a gesture passes something that matters.
 *
 * Used by the forecast strip: scrubbing across ~100 days of colour, the days
 * that actually move money are the ones worth feeling (user, 260921).
 *
 * PLATFORM REALITY, so nobody re-discovers it from a bug report: the Vibration
 * API is Android/Chromium. **iOS Safari does not implement
 * `navigator.vibrate`** — on an iPhone every call here is a silent no-op, in a
 * browser tab and in the installed PWA alike. The only web haptic Apple exposes
 * is the system tick attached to toggling `<input type="checkbox" switch>`, an
 * unrelated side effect that needs a real switch in the DOM and gives one fixed
 * feel; it is deliberately NOT used here, because a hidden control toggled on
 * every scrubbed day is a piece of machinery the strip should not carry.
 *
 * So: this is a progressive enhancement. Where the platform has it, the strip
 * gains a little texture; where it does not, nothing changes and nothing breaks.
 */

/** Whether this platform can vibrate at all. False on every iPhone. */
export function canVibrate(): boolean {
  return (
    typeof navigator !== "undefined" && typeof navigator.vibrate === "function"
  );
}

/**
 * Patterns, in milliseconds. Short on purpose — this fires while a finger is
 * moving, so anything longer than a tick reads as a stutter rather than a cue.
 * Money IN and money OUT are told apart by feel: one pulse against two.
 */
const INCOME: number = 12;
const BILL: readonly number[] = [8, 26, 8];
const BOTH: readonly number[] = [12, 22, 8, 22, 8];

/**
 * Buzz for a scrubbed day, according to what lands on it. A day with neither
 * income nor a scheduled payment is silent — most of the window is, which is
 * what makes the ones that are not worth feeling.
 *
 * Never throws: some browsers reject `vibrate()` under a permissions policy or
 * without a prior user gesture, and a failed nicety must not break a scrub.
 */
export function hapticForDay(day: {
  hasIncome: boolean;
  hasBill: boolean;
}): void {
  if (!day.hasIncome && !day.hasBill) return;
  if (!canVibrate()) return;

  const pattern =
    day.hasIncome && day.hasBill ? BOTH : day.hasIncome ? INCOME : BILL;
  try {
    navigator.vibrate(pattern as number | number[]);
  } catch {
    // A nicety that cannot fire is simply absent.
  }
}

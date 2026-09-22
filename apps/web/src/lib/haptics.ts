/**
 * haptics.ts — a touch of feedback when a gesture passes something that matters.
 *
 * Used by the forecast strip: scrubbing across ~100 days of colour, the days
 * that actually move money are the ones worth feeling (user, 260921).
 *
 * TWO PLATFORMS, TWO MECHANISMS, because the web has no single one:
 *
 *  - **Vibration API** (`navigator.vibrate`) — Android/Chromium. Takes a
 *    pattern, so income and a scheduled payment can feel different.
 *
 *  - **iOS: the switch tick.** Safari implements no Vibration API at all. The
 *    one haptic Apple exposes to the web is the system tick it plays when an
 *    `<input type="checkbox" switch>` is toggled (Safari 17.4+), so where
 *    vibrate() is missing we click a hidden switch of our own.
 *
 *    This is a TRICK, not an API, and it is honest about its limits: it gives
 *    ONE fixed feel, so on iOS income and a payment are indistinguishable;
 *    Safari may require the toggle to happen inside a real user gesture, which
 *    is why it is only ever called from a pointer handler; and Apple can stop
 *    honouring it in any release. It is wrapped so that if it does nothing, or
 *    throws, the scrub is unaffected.
 *
 * Either way this is a progressive enhancement: where a platform has feedback
 * the strip gains texture, where it does not nothing changes and nothing breaks.
 */

/** Whether this platform has the Vibration API. False on every iPhone. */
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

/** The hidden switch, made once and reused — see the iOS note above. */
let switchEl: HTMLInputElement | null = null;

function iosSwitch(): HTMLInputElement | null {
  if (typeof document === "undefined") return null;
  if (switchEl?.isConnected) return switchEl;

  const el = document.createElement("input");
  el.type = "checkbox";
  // Safari 17.4+ renders this as a switch; toggling one is what ticks.
  el.setAttribute("switch", "");
  // It exists only to be clicked by us: out of the tab order, hidden from
  // assistive tech, and unable to intercept a finger.
  el.setAttribute("aria-hidden", "true");
  el.tabIndex = -1;
  el.style.position = "fixed";
  el.style.top = "-9999px";
  el.style.left = "-9999px";
  el.style.width = "1px";
  el.style.height = "1px";
  el.style.opacity = "0";
  el.style.pointerEvents = "none";
  document.body.appendChild(el);
  switchEl = el;
  return el;
}

/**
 * Buzz for a scrubbed day, according to what lands on it. A day with neither
 * income nor a scheduled payment is silent — most of the window is, which is
 * what makes the ones that are not worth feeling.
 *
 * Never throws: a browser may reject `vibrate()` under a permissions policy or
 * without a prior user gesture, and a failed nicety must not break a scrub.
 */
export function hapticForDay(day: {
  hasIncome: boolean;
  hasBill: boolean;
}): void {
  if (!day.hasIncome && !day.hasBill) return;

  try {
    if (canVibrate()) {
      const pattern =
        day.hasIncome && day.hasBill ? BOTH : day.hasIncome ? INCOME : BILL;
      navigator.vibrate(pattern as number | number[]);
      return;
    }
    // No Vibration API — iOS. One fixed tick for any money day.
    iosSwitch()?.click();
  } catch {
    // A nicety that cannot fire is simply absent.
  }
}

/** Test seam: drop the cached switch between cases. */
export function __resetHaptics(): void {
  switchEl?.remove();
  switchEl = null;
}

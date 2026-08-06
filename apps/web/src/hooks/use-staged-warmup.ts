"use client";
/**
 * use-staged-warmup.ts — bringing a page's data up in waves (260806 request).
 *
 * The Overview's sections used to fetch only when opened. That cost a wait every
 * first time, and offline a section nobody had opened had nothing to show at
 * all. They fetch on mount now, collapsed or not, so the data is already there
 * — including on a bad connection, where the persisted cache is all there is.
 *
 * Firing them all together is the wrong fix, and one this codebase has already
 * paid for: ~16 concurrent prefetches inflated every request about fourfold and
 * made the first pill tap janky (260804). So each section takes a WAVE and
 * waits its turn.
 *
 * Time, not completion, advances the queue. Chaining on the previous wave's
 * promises would need a coordinator that knows which queries belong to which
 * wave — more machinery, and it stalls the whole train behind one slow endpoint,
 * which on a bad connection is exactly when warming matters most.
 */
import { useEffect, useState } from "react";

/** Gap between waves. Long enough for a wave's requests to clear the wire on a
 *  normal connection, short enough that everything is warm within a couple of
 *  seconds of opening a budget. */
export const WARMUP_WAVE_MS = 700;

/**
 * Whether the caller's wave has come up yet.
 *
 * @param wave  0 starts immediately; each step waits one more gap.
 * @param opts.now  Skip the queue — the member opened this section, and an
 *   explicit ask must not sit behind a politeness delay.
 */
export function useStagedWarmup(
  wave: number,
  opts?: { now?: boolean },
): boolean {
  const now = opts?.now ?? false;
  // Once a wave is up it stays up: closing a section again must not throw away
  // a request already in flight, or the data it just brought back. Nothing ever
  // sets this back to false, which is what makes that true.
  const [due, setDue] = useState(() => now || wave <= 0);

  useEffect(() => {
    if (due) return;
    if (now) {
      setDue(true);
      return;
    }
    const id = setTimeout(() => setDue(true), Math.max(0, wave) * WARMUP_WAVE_MS);
    return () => clearTimeout(id);
  }, [wave, now, due]);

  return due;
}

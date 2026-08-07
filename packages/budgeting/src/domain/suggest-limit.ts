/**
 * suggest-limit.ts — the limit that funds a buffer month by month (260807).
 *
 * The reserve chart's only advice was "top up X now", and for a category whose
 * mean spend already exceeds its limit that advice is wrong: the money drains
 * straight back out. The household asked for the alternative — a LIMIT. Raise it
 * and the buffer fills from the plan, no lump sum required, because the reserve
 * accrues `left = limit − spent` at every month close.
 *
 * WHY THIS IS A SEARCH AND NOT A FORMULA. Raising a limit does two things at
 * once: it speeds up accrual, and it SHRINKS THE TARGET, because fewer months go
 * over and the trough gets shallower. The obvious `mean + gap/N` ignores the
 * second and overshoots — on the live Clothes category it says 269 where the
 * model says 230. So the search calls the real walk at candidate limits.
 *
 * ONE SEARCH, BOTH DIRECTIONS. What it looks for is the SMALLEST limit whose
 * buffer the household can actually reach inside the horizon. Above today's
 * limit that reads "raise it and you are covered by <month>"; below it reads
 * "you could lower it and free the difference"; equal means there is nothing to
 * say. Both are the same question asked once.
 *
 * Pure: integer cents, an injected `neededAt`, no clock and no IO.
 */

export interface LimitSuggestionInput {
  /**
   * What the buffer would have to be if the limit were `limitCents` — the same
   * dual walk the chart already runs, injected so this stays pure. MUST be
   * non-increasing in its argument (a bigger limit never needs a bigger buffer),
   * which is what makes the search below a binary one.
   */
  neededAt: (limitCents: bigint) => bigint;
  /** What the category holds today. Raising a limit does not change it. */
  heldCents: bigint;
  /** Mean monthly spend over the same history, net of excluded one-offs. */
  meanSpendCents: bigint;
  currentLimitCents: bigint;
  /**
   * How long the buffer has to get there — months until the category's next
   * known lump, because that is when the money is actually wanted. Zero means
   * the buffer has to be sufficient outright.
   */
  horizonMonths: number;
}

export interface LimitSuggestion {
  limitCents: bigint;
  /** Signed, against today's limit: positive raises, negative frees. */
  deltaCents: bigint;
  /** Whole months until the gap closes at the suggested limit. 0 = already. */
  fillMonths: number;
  direction: "raise" | "lower";
}

/** Ceiling division for positive bigints. */
const ceilDiv = (a: bigint, b: bigint) => (a + b - 1n) / b;

/** How much the buffer grows each month at `limit` — never below zero. */
const accrual = (limit: bigint, meanSpend: bigint) =>
  limit > meanSpend ? limit - meanSpend : 0n;

export function smallestSufficientLimit(
  input: LimitSuggestionInput,
): LimitSuggestion | null {
  const { neededAt, heldCents, meanSpendCents, currentLimitCents } = input;
  const horizon = BigInt(Math.max(0, Math.trunc(input.horizonMonths)));

  /** Can a buffer at `limit` be reached inside the horizon? */
  const reachable = (limit: bigint): boolean =>
    neededAt(limit) - heldCents <= accrual(limit, meanSpendCents) * horizon;

  // Monotone: neededAt only falls as the limit rises and the accrual term only
  // rises, so once reachable it stays reachable — which is what lets a binary
  // search find the smallest one.
  let hi = currentLimitCents > 0n ? currentLimitCents : 100_00n;
  let guard = 0;
  while (!reachable(hi)) {
    hi *= 2n;
    // A category can be unaffordable — the household asked to see the number
    // anyway (260807) — but it cannot be infinite. Doubling ~60 times passes
    // any real budget by an enormous margin; the cap only stops a broken
    // `neededAt` from spinning here forever.
    if (++guard > 60) return null;
  }

  let lo = 0n;
  while (lo < hi) {
    const mid = (lo + hi) / 2n;
    if (reachable(mid)) hi = mid;
    else lo = mid + 1n;
  }

  const limitCents = lo;
  if (limitCents === currentLimitCents) return null;

  const shortfall = neededAt(limitCents) - heldCents;
  const step = accrual(limitCents, meanSpendCents);
  return {
    limitCents,
    deltaCents: limitCents - currentLimitCents,
    fillMonths:
      shortfall <= 0n || step === 0n ? 0 : Number(ceilDiv(shortfall, step)),
    direction: limitCents > currentLimitCents ? "raise" : "lower",
  };
}

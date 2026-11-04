/**
 * reserve-cover-in-month-currency.ts — owner, 261104: a past month whose
 * currency differs from the category's latest one reads its reserve used and
 * overspent in ITS currency too. Reserves are calculated in the latest
 * currency, so the engine knows the overspend there and how much of it the
 * reserve covered; the month's own overspend is exact (spent − limit). The
 * covered SHARE carries over: full and no cover come out exact, a partial one
 * rounds half-up, and used + overspent always equals the month's overspend.
 * Pure: bigint cents in and out.
 */
export function reserveCoverInMonthCurrency(input: {
  /** The month's overspend in its own currency (≥ 0). */
  overMonth: bigint;
  /** The same overspend as the engine holds it, in the latest currency. */
  overLatest: bigint;
  /** What the reserve covered of it, in the latest currency. */
  usedLatest: bigint;
}): { usedCents: bigint; overspentCents: bigint } {
  const { overMonth, overLatest, usedLatest } = input;
  if (overMonth <= 0n || overLatest <= 0n || usedLatest <= 0n) {
    return { usedCents: 0n, overspentCents: overMonth > 0n ? overMonth : 0n };
  }
  const used =
    usedLatest >= overLatest ? overMonth : (overMonth * usedLatest * 2n + overLatest) / (2n * overLatest);
  return { usedCents: used, overspentCents: overMonth - used };
}

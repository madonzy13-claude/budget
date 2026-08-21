/**
 * retirement-burn.ts — what a No-limit category costs a month, forever (0083).
 *
 * The runway divides the pot by a monthly cost and projects it for decades, so
 * that cost has to be something the category will keep doing. An unbounded
 * category has no plan to burn, so the household's rule (user, 260820) is:
 *
 *   max( average of the last 12 months of spend (or fewer, if that is all the
 *        history there is),
 *        the standing payments that run FOREVER, at their monthly rate )
 *
 * The floor matters because history and commitment disagree in both directions.
 * A category can sit quiet for a year and still owe a perpetual bill; averaging
 * the quiet alone would quote a runway that ends the moment it lands.
 *
 * "Forever" is meant literally: a rule with an end_date stops, and a ONCE
 * payment happens on one date, so neither costs anything at infinity. Both are
 * excluded by the caller — this function only takes the perpetual total.
 */

/** Round-half-up integer division — truncating a burn RATE understates it,
 *  and understating the burn lengthens the runway, which is the one direction
 *  a retirement figure must not err in. */
const divRound = (total: bigint, by: bigint): bigint =>
  by === 0n ? 0n : (total * 2n + by) / (by * 2n);

export function retirementBurn(input: {
  /** One entry per month that actually has history; order is irrelevant, only
   *  the count and the sum are used. */
  trailingMonthlySpend: bigint[];
  /** Σ monthly rate of the rules that never end. */
  perpetualMonthlyCents: bigint;
}): bigint {
  const months = input.trailingMonthlySpend.length;
  const spentAvg = months
    ? divRound(
        input.trailingMonthlySpend.reduce((a, b) => a + b, 0n),
        BigInt(months),
      )
    : 0n;

  return spentAvg > input.perpetualMonthlyCents
    ? spentAvg
    : input.perpetualMonthlyCents;
}

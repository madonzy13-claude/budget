/**
 * reserve-ledger.ts — Cumulative reserve-ledger calculator (pure domain).
 *
 * A category's reserve is NOT a static allocation; it is a running balance
 * derived from its full history. Starting from a manual base (Σ of explicit
 * reserve adjustments), each month applies a net reserve move in chronological
 * order:
 *
 *   - underspend (surplus ≥ 0): the surplus flows INTO reserve (grows it).
 *   - overspend  (surplus < 0): the category DRAWS from reserve to cover the
 *     overspend, but only up to the real reserve money available that month
 *     (`maxUsableCents`) — you cannot use reserve cash you do not actually
 *     hold. The draw depletes the reserve; the uncovered remainder is real
 *     overspend and does NOT touch reserve.
 *
 * Pure and path-dependent: the result is a function of the inputs alone, so
 * editing any month (even an old one) re-derives the whole ledger. The real
 * money lives in a separate RESERVE wallet that the user reconciles manually;
 * the gap between this expected balance and that wallet is what the
 * RESERVE_TOPUP task surfaces.
 */

export interface ReserveMonth {
  /**
   * activeBudget − spent for the month. Positive = underspend (grows reserve),
   * negative = overspend (draws from reserve).
   */
  surplusCents: bigint;
  /**
   * Real reserve money the category may draw this month (the cap). Only
   * consulted for overspend months. Zero for underspend months.
   */
  maxUsableCents: bigint;
}

export interface ReserveLedgerResult {
  /** Running expected reserve balance after the final month. */
  expectedReserveCents: bigint;
  /** Reserve actually drawn each month (0 for underspend months). */
  monthlyUsageCents: bigint[];
}

/**
 * Fold the monthly facts into a cumulative expected-reserve balance.
 *
 * @param manualBaseCents Σ of explicit reserve adjustments (the starting balance).
 * @param months          Chronological monthly facts (oldest first).
 */
export function computeReserveLedger(
  manualBaseCents: bigint,
  months: ReserveMonth[],
): ReserveLedgerResult {
  let balance = manualBaseCents;
  const monthlyUsageCents: bigint[] = [];

  for (const m of months) {
    if (m.surplusCents >= 0n) {
      // Underspend → grows the reserve.
      balance += m.surplusCents;
      monthlyUsageCents.push(0n);
    } else {
      // Overspend → draw from reserve, capped at real money available.
      const overspend = -m.surplusCents;
      const cap = m.maxUsableCents > 0n ? m.maxUsableCents : 0n;
      const used = overspend < cap ? overspend : cap;
      balance -= used;
      monthlyUsageCents.push(used);
    }
  }

  return { expectedReserveCents: balance, monthlyUsageCents };
}

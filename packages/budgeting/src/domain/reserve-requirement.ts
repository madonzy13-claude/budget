/**
 * reserve-requirement.ts — what a reserve must hold TODAY (260807, r3).
 *
 * The old answer assumed the household would never save another złoty: the
 * forward walk started at zero and charged every commitment, so "needed" came
 * out as the sum of the whole runway's lumps. Travel therefore read "short
 * 7,702" while its own limit was quietly putting 1,834 a month into that same
 * reserve — and the limit suggestion, which DOES count accrual, said the limit
 * could come down. Two numbers from two different worlds, side by side in one
 * tooltip (user, 260807). It also meant scheduling a payment three years out
 * raised what you needed TODAY by its full amount.
 *
 * So the requirement counts the accrual the current limit already produces:
 *
 *     accrual = max(0, limit − ordinary spend)
 *     due(m)  = commitments through month m  (+ history's own buffer at the end)
 *     needed  = max(0, max over m of ( due(m) − accrual × m ))
 *
 * The tightest month wins, exactly as it does for the suggestion — and that is
 * the point: this and `smallestSufficientLimit` are the same function read two
 * ways. The suggested limit is precisely the limit at which this requirement
 * equals what is already held, so "add the money" and "change the limit" are
 * two routes to one place rather than two contradictory verdicts.
 *
 * ORDINARY spend, not total: the scheduled payments inside a category's history
 * are projected forward as commitments, so counting them here as well charged
 * the same camping trip twice — an insurance category was told to hold 11,000
 * when the truth was nothing (audit, 260807).
 *
 * Pure: integer cents, no clock, no IO.
 */

export interface ReserveRequirementInput {
  /** ORDINARY monthly spending — the scheduled half belongs to the commitments. */
  baselineSpendCents: bigint;
  /** Known commitments per forward month; index 0 is the first month ahead. */
  commitmentsByMonth: readonly bigint[];
  /** What irregular ORDINARY spending has cost before — wanted by the end. */
  historicalNeedCents: bigint;
  /** The limit whose accrual is being counted. */
  limitCents: bigint;
}

export function reserveNeededToday(input: ReserveRequirementInput): bigint {
  const {
    baselineSpendCents,
    commitmentsByMonth,
    historicalNeedCents,
    limitCents,
  } = input;

  // With no runway there is nothing scheduled to fund, so history's own buffer
  // is the whole requirement.
  if (commitmentsByMonth.length === 0) {
    return historicalNeedCents > 0n ? historicalNeedCents : 0n;
  }

  // What the limit leaves behind each month. A limit at or below ordinary
  // spending accrues nothing — and then the whole bill does have to be sitting
  // there already, which is the only case where the old assumption held.
  const accrual =
    limitCents > baselineSpendCents ? limitCents - baselineSpendCents : 0n;

  const last = commitmentsByMonth.length - 1;
  let owed = 0n;
  let needed = 0n;
  for (let i = 0; i <= last; i++) {
    owed += commitmentsByMonth[i]!;
    const dueByThen = i === last ? owed + historicalNeedCents : owed;
    const shortfall = dueByThen - accrual * BigInt(i + 1);
    if (shortfall > needed) needed = shortfall;
  }
  return needed > 0n ? needed : 0n;
}

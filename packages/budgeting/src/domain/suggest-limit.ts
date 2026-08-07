/**
 * suggest-limit.ts — the limit that keeps a category solvent (260807, r2).
 *
 * The reserve chart's only advice was "top up X now", and for a category whose
 * spending already outruns its limit that money drains straight back out. The
 * alternative the household asked for is a LIMIT: raise it and the buffer funds
 * itself from the plan, because the reserve accrues `limit − spent` every month.
 *
 * WHAT THE FIRST CUT GOT WRONG. It asked "what limit reaches the buffer by the
 * next lump", and the next lump is often trivial and imminent — Travel's next
 * charge is a 129 zł internet bill this month, behind which sit 4,500 of camping
 * and a 15,000 trip to Japan. Treating that bill as the deadline for everything
 * demanded a limit of 9,936, payable at once. The household's correction: spread
 * it across the whole runway and stay solvent the WHOLE way (260807).
 *
 * So this is a cash-flow question, not a target-by-a-date one. Start from the
 * reserve actually held; each month the limit leaves `limit − ordinary spend`
 * behind and that month's known commitments come out; the balance may never go
 * below zero. The smallest limit for which that holds at EVERY month has a
 * closed form:
 *
 *     limit = ordinary spend + max over m of ⌈(commitments through m − held) / m⌉
 *
 * — the tightest month wins, and it is rarely the biggest bill. Camping's 4,500
 * with two months of runway is harder than Japan's 15,000 with twelve.
 *
 * ONE ANSWER, BOTH DIRECTIONS. Above today's limit it reads "raise it"; below,
 * "you could drop it and free the difference"; equal says nothing at all.
 *
 * Pure: integer cents, no clock, no IO.
 */

export interface LimitSuggestionInput {
  /** What the category holds today — the balance the walk starts from. */
  heldCents: bigint;
  /**
   * Ordinary monthly spending, NET of the scheduled payments charged below.
   * Netting matters: a category's mean already contains last year's camping
   * trip, and charging the coming one on top of it would provision twice.
   */
  baselineSpendCents: bigint;
  /** Known commitments per forward month; index 0 is the first month ahead. */
  commitmentsByMonth: readonly bigint[];
  /**
   * The buffer history asks for, on top of the commitments, by the END of the
   * runway — what irregular ORDINARY spending has cost before.
   */
  historicalNeedCents: bigint;
  currentLimitCents: bigint;
}

export interface LimitSuggestion {
  limitCents: bigint;
  /** Signed, against today's limit: positive raises, negative frees. */
  deltaCents: bigint;
  /** How many months the plan spreads across. */
  overMonths: number;
  direction: "raise" | "lower";
}

/** One whole currency unit in cents — the smallest move worth suggesting. */
const MINOR_UNIT = 100n;

/** Ceiling division that behaves for negative numerators too. */
function ceilDiv(a: bigint, b: bigint): bigint {
  const q = a / b;
  return a % b > 0n ? q + 1n : q;
}

export function smallestSufficientLimit(
  input: LimitSuggestionInput,
): LimitSuggestion | null {
  const {
    heldCents,
    baselineSpendCents,
    commitmentsByMonth,
    historicalNeedCents,
    currentLimitCents,
  } = input;

  const overMonths = commitmentsByMonth.length;
  // No runway is no plan: nothing to spread anything across, and a suggestion
  // built on zero months would divide by it.
  if (overMonths === 0) return null;

  // The tightest month, per month of runway. Everything owed by month m has to
  // be covered by what is held plus m months of accrual, so each m sets a floor
  // under the accrual and the largest floor wins.
  let owed = 0n;
  let accrualNeeded = 0n;
  for (let i = 0; i < overMonths; i++) {
    owed += commitmentsByMonth[i]!;
    // History's buffer is wanted by the END of the runway, not along the way.
    const dueByThen = i === overMonths - 1 ? owed + historicalNeedCents : owed;
    const perMonth = ceilDiv(dueByThen - heldCents, BigInt(i + 1));
    if (perMonth > accrualNeeded) accrualNeeded = perMonth;
  }

  // Never below what the category actually spends. A limit under ordinary
  // spending is not a plan, it is a standing overspend, and it drains the very
  // buffer it was asked to size.
  const limitCents =
    baselineSpendCents + (accrualNeeded > 0n ? accrualNeeded : 0n);

  // Nothing to say unless the move is worth making: a category whose spending
  // lands a few groszy from its limit produced "raise the limit to 110 zł
  // (+0 zł/mo)" — noise dressed as advice.
  const deltaCents = limitCents - currentLimitCents;
  if (deltaCents > -MINOR_UNIT && deltaCents < MINOR_UNIT) return null;

  return {
    limitCents,
    deltaCents,
    overMonths,
    direction: deltaCents > 0n ? "raise" : "lower",
  };
}

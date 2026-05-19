/**
 * reserve-allocator.ts — Pure-function domain helpers for reserve `actual` mutation.
 *
 * Architecture pivot (UAT-PH5-T3-54): actual is a stored value per category.
 * It mutates ONLY on three events; reads return the stored value directly.
 *
 *   - applyExpectedChange(): user sets a new target `expected` on one category.
 *       Raise above current actual: top up from free pool (bounded).
 *       Lower below current actual: clamp + spill to underfunded siblings.
 *   - applyExclude():        category becomes excluded; its actual is released
 *                            to fill underfunded siblings (top → bottom).
 *   - applyWalletDelta():    user edits the RESERVE wallet pool. Positive delta
 *                            refills underfunded; negative delta deducts from
 *                            the bottom row(s) when Σactual exceeds new pool.
 *
 * Walk order:
 *   - Refill = sortIndex ASC (display top → bottom).
 *   - Deduct = sortIndex DESC (bottom → top).
 *
 * Overflow (positive remainder after refill) stays in the wallet; consumers
 * render a banner "wallet has more". Underflow on deduct (Σactual already
 * < amount) returns `unsatisfiedCents` — shouldn't happen for wallet edits,
 * but kept for caller assertions.
 *
 * No DB / IO. Pure data → data.
 */

export interface ReserveRow {
  categoryId: string;
  sortIndex: number;
  reserveExcluded: boolean;
  expectedCents: bigint;
  actualCents: bigint;
}

export interface RefillResult {
  rows: ReserveRow[];
  overflowCents: bigint;
}

export interface DeductResult {
  rows: ReserveRow[];
  unsatisfiedCents: bigint;
}

function clone(r: ReserveRow): ReserveRow {
  return { ...r };
}

/**
 * Walk rows by sortIndex ASC, topping up underfunded actuals from `available`
 * until either everyone is funded or `available` runs out. Skips excluded.
 * Returns new rows (preserving input order) + remaining overflow.
 */
export function refillUnderfunded(
  inputRows: ReserveRow[],
  available: bigint,
): RefillResult {
  const out = inputRows.map(clone);
  let remaining = available;
  const walkOrder = [...out]
    .filter((r) => !r.reserveExcluded)
    .sort((a, b) => a.sortIndex - b.sortIndex);
  for (const r of walkOrder) {
    if (remaining <= 0n) break;
    const deficit = r.expectedCents - r.actualCents;
    if (deficit <= 0n) continue;
    const take = deficit < remaining ? deficit : remaining;
    r.actualCents += take;
    remaining -= take;
  }
  return { rows: out, overflowCents: remaining };
}

/**
 * Walk rows by sortIndex DESC, removing `amount` total from actuals.
 * Skips excluded (their actual is always 0 anyway).
 */
export function deductFromBottom(
  inputRows: ReserveRow[],
  amount: bigint,
): DeductResult {
  const out = inputRows.map(clone);
  let remaining = amount;
  const walkOrder = [...out]
    .filter((r) => !r.reserveExcluded)
    .sort((a, b) => b.sortIndex - a.sortIndex);
  for (const r of walkOrder) {
    if (remaining <= 0n) break;
    if (r.actualCents <= 0n) continue;
    const take = r.actualCents < remaining ? r.actualCents : remaining;
    r.actualCents -= take;
    remaining -= take;
  }
  return { rows: out, unsatisfiedCents: remaining };
}

/**
 * Apply a user "set expected" event to one category. Mutates that row's
 * expected; possibly mutates actual (raise) or cascades freed actual into
 * underfunded siblings (lower).
 *
 * Pool semantics: `walletPoolCents` = total reserve wallet balance now.
 * Free pool before change = walletPoolCents - Σ actualCents.
 *
 * Throws on unknown categoryId or excluded category (UI must block).
 */
export function applyExpectedChange(
  inputRows: ReserveRow[],
  walletPoolCents: bigint,
  categoryId: string,
  newExpectedCents: bigint,
): RefillResult {
  const out = inputRows.map(clone);
  const target = out.find((r) => r.categoryId === categoryId);
  if (!target) throw new Error(`category ${categoryId} not found`);
  if (target.reserveExcluded)
    throw new Error(`category ${categoryId} is excluded`);

  const oldExpected = target.expectedCents;
  const oldActual = target.actualCents;
  target.expectedCents = newExpectedCents;

  if (newExpectedCents === oldExpected) {
    return { rows: out, overflowCents: 0n };
  }

  if (newExpectedCents < oldActual) {
    // Clamp actual; spill freed cents into underfunded siblings.
    target.actualCents = newExpectedCents;
    const freed = oldActual - newExpectedCents;
    const others = out.filter((r) => r.categoryId !== categoryId);
    const refilled = refillUnderfunded(others, freed);
    // Merge updates back, preserving order.
    const updated = new Map(refilled.rows.map((r) => [r.categoryId, r]));
    return {
      rows: out.map((r) => updated.get(r.categoryId) ?? r),
      overflowCents: refilled.overflowCents,
    };
  }

  // Raise: deficit = newExpected - currentActual; top up from free pool.
  const sumActualOthers = out
    .filter((r) => r.categoryId !== categoryId)
    .reduce((s, r) => s + r.actualCents, 0n);
  const freePool = walletPoolCents - sumActualOthers - oldActual;
  const deficit = newExpectedCents - oldActual;
  if (deficit > 0n && freePool > 0n) {
    const take = deficit < freePool ? deficit : freePool;
    target.actualCents = oldActual + take;
  }
  return { rows: out, overflowCents: 0n };
}

/**
 * Apply exclude event: target category's actual goes to 0 and its
 * reserveExcluded flag flips true. Released amount fills underfunded
 * siblings (sortIndex ASC). Throws on unknown / already-excluded.
 */
export function applyExclude(
  inputRows: ReserveRow[],
  categoryId: string,
): RefillResult {
  const out = inputRows.map(clone);
  const target = out.find((r) => r.categoryId === categoryId);
  if (!target) throw new Error(`category ${categoryId} not found`);
  if (target.reserveExcluded)
    throw new Error(`category ${categoryId} already excluded`);

  const freed = target.actualCents;
  target.actualCents = 0n;
  target.reserveExcluded = true;

  if (freed === 0n) return { rows: out, overflowCents: 0n };

  const others = out.filter((r) => r.categoryId !== categoryId);
  const refilled = refillUnderfunded(others, freed);
  const updated = new Map(refilled.rows.map((r) => [r.categoryId, r]));
  return {
    rows: out.map((r) => updated.get(r.categoryId) ?? r),
    overflowCents: refilled.overflowCents,
  };
}

/**
 * Apply a wallet-pool change (user edited a RESERVE wallet's balance).
 * Positive delta = refill underfunded top→bottom; positive remainder is
 * overflow. Negative delta = remove from actual bottom→top, but only the
 * portion that would push Σactual above the new pool. If Σactual was
 * already ≤ new pool, no removal happens.
 */
export function applyWalletDelta(
  inputRows: ReserveRow[],
  oldPoolCents: bigint,
  newPoolCents: bigint,
): RefillResult {
  if (newPoolCents === oldPoolCents) {
    return { rows: inputRows.map(clone), overflowCents: 0n };
  }

  if (newPoolCents > oldPoolCents) {
    return refillUnderfunded(inputRows, newPoolCents - oldPoolCents);
  }

  // Negative delta: only remove enough to push Σactual ≤ newPool.
  const sumActual = inputRows.reduce((s, r) => s + r.actualCents, 0n);
  if (sumActual <= newPoolCents) {
    return { rows: inputRows.map(clone), overflowCents: 0n };
  }
  const removal = sumActual - newPoolCents;
  const ded = deductFromBottom(inputRows, removal);
  return { rows: ded.rows, overflowCents: 0n };
}

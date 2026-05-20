/**
 * reserve-allocator.ts — MIRROR of packages/budgeting/src/domain/reserve-allocator.ts.
 *
 * Kept in sync by hand for now (both pure, no external deps). Used by the web
 * client to compute optimistic UI updates instantly without waiting for the
 * server response (UAT-PH5-T3-54 perf option B).
 *
 * If this file diverges from the backend copy, update BOTH and run their
 * respective unit tests.
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
    target.actualCents = newExpectedCents;
    const freed = oldActual - newExpectedCents;
    const others = out.filter((r) => r.categoryId !== categoryId);
    const refilled = refillUnderfunded(others, freed);
    const updated = new Map(refilled.rows.map((r) => [r.categoryId, r]));
    return {
      rows: out.map((r) => updated.get(r.categoryId) ?? r),
      overflowCents: refilled.overflowCents,
    };
  }

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
  const sumActual = inputRows.reduce((s, r) => s + r.actualCents, 0n);
  if (sumActual <= newPoolCents) {
    return { rows: inputRows.map(clone), overflowCents: 0n };
  }
  const removal = sumActual - newPoolCents;
  const ded = deductFromBottom(inputRows, removal);
  return { rows: ded.rows, overflowCents: 0n };
}

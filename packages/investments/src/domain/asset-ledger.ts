/**
 * Phase 13.1 asset-ledger rules — pure, no I/O.
 *
 * An asset's entries are an append-only ledger (D-14/D-15): a new entry may
 * not be dated before the latest one, and only the newest entry can be
 * deleted. "Newest" is the last live row by (effective_date, created_at, id):
 * with the date guard that equals "most recently created" for new data, and it
 * still gives one defined answer for migrated rows whose creation order differs
 * from their date order. Linked legs (sale into another asset, transfer) need
 * to be newest in BOTH assets (D-16).
 */
import { Temporal } from "temporal-polyfill";
import { big, cents, qty } from "./sell-booking";

export interface LedgerKey {
  id: string;
  effectiveDate: string;
  createdAt: string;
  transferId: string | null;
  holdingId: string;
}

const after = (a: LedgerKey, b: LedgerKey): boolean =>
  a.effectiveDate !== b.effectiveDate
    ? a.effectiveDate > b.effectiveDate
    : a.createdAt !== b.createdAt
      ? a.createdAt > b.createdAt
      : a.id > b.id;

export function newestEntry(entries: LedgerKey[]): LedgerKey | null {
  let top: LedgerKey | null = null;
  for (const x of entries) if (top === null || after(x, top)) top = x;
  return top;
}

/** R6 (user): the dates an entry may move to without changing its place in
 *  the ledger — from the entry before it to the one after it (null = open).
 *  `others` may include the target itself; it is skipped. */
export function entryDateRange(
  others: LedgerKey[],
  target: LedgerKey,
): { min: string | null; max: string | null } {
  let min: string | null = null;
  let max: string | null = null;
  const shift = (d: string, days: number) =>
    Temporal.PlainDate.from(d).add({ days }).toString();
  for (const x of others) {
    if (x.id === target.id) continue;
    // Landing on x's date keeps the order only if the tie-break agrees.
    const tied = { ...target, effectiveDate: x.effectiveDate };
    if (after(target, x)) {
      const lo = after(tied, x) ? x.effectiveDate : shift(x.effectiveDate, 1);
      if (min === null || lo > min) min = lo;
    } else {
      const hi = after(tied, x) ? shift(x.effectiveDate, -1) : x.effectiveDate;
      if (max === null || hi < max) max = hi;
    }
  }
  return { min, max };
}

export function deletableEntry(
  target: LedgerKey,
  ownLive: LedgerKey[],
  partner: { entry: LedgerKey; partnerLive: LedgerKey[] } | null,
): { ok: true } | { ok: false; reason: "not_newest" | "linked_not_newest" } {
  if (newestEntry(ownLive)?.id !== target.id)
    return { ok: false, reason: "not_newest" };
  if (partner && newestEntry(partner.partnerLive)?.id !== partner.entry.id)
    return { ok: false, reason: "linked_not_newest" };
  return { ok: true };
}

/** D-15: entries only append in time. ISO dates compare lexicographically. */
export function assertNotBeforeLatest(
  date: string,
  latest: string | null,
): void {
  if (latest !== null && date < latest)
    throw new RangeError("before_latest_entry");
}

/** D-10: a transfer moves cost proportionally with quantity; a full move takes all of it. */
export function transferCost(i: {
  costCents: bigint;
  heldQty: string;
  moveQty: string;
}): { costMovedCents: bigint; qtyLeft: string } {
  const held = big(i.heldQty);
  const move = big(i.moveQty);
  if (move.lte(0) || move.gt(held))
    throw new RangeError("move_qty_out_of_range");
  const costMovedCents = move.eq(held)
    ? i.costCents
    : cents(big(i.costCents).times(move).div(held));
  return { costMovedCents, qtyLeft: qty(held.minus(move)) };
}

/**
 * D-08 broker add: one entry books the deposit (cost and contributions rise by
 * the amount) AND refreshes the account value, so the market move up to that
 * day lands in P/L and the deposit never does.
 */
export function brokerAdd(i: {
  amountCents: bigint;
  currentValueCents: bigint;
  valueAfterCents: bigint;
}): {
  costDeltaCents: bigint;
  flowCents: bigint;
  valueDeltaCents: bigint;
  marketMoveCents: bigint;
} {
  if (i.amountCents <= 0n) throw new RangeError("amount_positive");
  if (i.valueAfterCents < 0n) throw new RangeError("value_after_negative");
  const valueDeltaCents = i.valueAfterCents - i.currentValueCents;
  return {
    costDeltaCents: i.amountCents,
    flowCents: i.amountCents,
    valueDeltaCents,
    marketMoveCents: valueDeltaCents - i.amountCents,
  };
}

/** Hand-priced quantity asset: the prior price is kept on the entry for snapshot undo (D-18). */
export function priceChange(i: {
  priorPriceCents: string;
  newPriceCents: string;
}): { priorPriceCents: string; newPriceCents: string } {
  if (big(i.newPriceCents).lte(0)) throw new RangeError("price_positive");
  return { priorPriceCents: i.priorPriceCents, newPriceCents: i.newPriceCents };
}

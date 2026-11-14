/**
 * edit-entry.ts — R6 (user): Edit a transaction's note and date.
 *
 * Amounts stay as booked; only the label and the day move. The day stays
 * between the entry's neighbours in EVERY asset it touches (a linked pair
 * moves together), so the append-only order never changes. A deposit's dates
 * drive its interest, so they do not move. FX figures stay those of the
 * original booking.
 *
 * 261108 (user): the amount and currency of money put in (opening, buy, add)
 * can be fixed too — while nothing later took money or units out (see
 * amountEditBlock). The amount stays as said; the asset's cost (and, where
 * the value follows the money, its value) moves by the difference at the
 * entry date's rate. An asset's only entry takes the new currency outright —
 * nothing is converted. Later price snapshots shift with the value, so
 * deleting them still lands on the right figure.
 */
import { ok, err, type Result } from "neverthrow";
import type { FxProvider } from "@budget/shared-kernel";
import {
  after,
  amountEditBlock,
  entryDateRange,
  type LedgerKey,
} from "../domain/asset-ledger";
import { holdingShape, type Holding } from "../domain/holding";
import { big, cents, realizedInBudget } from "../domain/sell-booking";
import type { HoldingRepo } from "../ports/holding-repo";
import type {
  BookingPlan,
  EntryRewrite,
  HistoryRepo,
  HoldingPatch,
  StoredEntry,
} from "../ports/history-repo";
import { makeRate } from "./fx-memo";

const key = (e: StoredEntry): LedgerKey => ({
  id: e.id,
  effectiveDate: e.effectiveDate,
  createdAt: e.createdAt,
  transferId: e.transferId,
  holdingId: e.holdingId,
});

export class DateOutOfRange extends Error {
  constructor(
    readonly min: string | null,
    readonly max: string | null,
  ) {
    super("date_out_of_range");
  }
}

/** An entry that set the value outright: an update, or a broker deposit
 *  that stated the account value after it. */
const statedBy = (broker: boolean) => (x: StoredEntry) =>
  x.kind === "value_change" ||
  x.kind === "price_change" ||
  (broker && x.kind === "add" && x.valueDeltaCents !== x.costDeltaCents);

/** `e`'s value moved by `d` (in `ccy`): a later snapshot is the value before
 *  that entry — shift it (kept in another currency: at its own date's rate).
 *  One that set the value outright keeps that value (its delta absorbs the
 *  shift, so the running totals walked back from today move) and ends the
 *  ripple; with none, the current value moves. */
async function rippleLater(
  h: Holding,
  e: StoredEntry,
  all: StoredEntry[],
  d: bigint,
  ccy: string,
  rewrites: EntryRewrite[],
  patch: HoldingPatch,
  rate: (from: string, to: string) => Promise<string>,
  fx: FxProvider,
): Promise<void> {
  const stated = statedBy(h.uiType === "broker");
  let absolute = false;
  for (const x of all) {
    if (!after(x, e)) continue;
    if (absolute) break;
    absolute = stated(x);
    if (x.priorPriceCents === null) continue;
    const xCcy = x.priorPriceCurrency ?? ccy;
    const dx =
      xCcy === ccy ? d : cents(big(d).times(await makeRate(fx, x.effectiveDate)(ccy, xCcy)));
    rewrites.push({
      id: x.id,
      priorPriceCents: big(x.priorPriceCents).plus(big(dx)).toString(),
      ...(absolute ? { valueDeltaCents: x.valueDeltaCents - dx } : {}),
    });
  }
  if (absolute) return;
  const cur = h.currentPriceCurrency ?? ccy;
  const dCur = cur === ccy ? big(d) : big(d).times(await rate(ccy, cur));
  patch.currentPriceCents = cents(big(h.currentPriceCents!).plus(dCur)).toString();
}

/** 261109 (user): a value update re-stated as `amount` in `ccy` — kept as
 *  said, valued at that day's rate in the asset's value currency. */
async function planValue(
  h: Holding,
  e: StoredEntry,
  all: StoredEntry[],
  amount: bigint,
  ccy: string,
  ctx: { budgetId: string; fx: FxProvider },
): Promise<BookingPlan> {
  const block = amountEditBlock(e, all);
  if (block) throw new Error(block);
  if (amount <= 0n) throw new Error("invalid_cents");
  const valueCcy = e.priorPriceCurrency ?? h.currentPriceCurrency ?? ccy;
  const rate = makeRate(ctx.fx, e.effectiveDate);
  const v = cents(big(amount).times(await rate(ccy, valueCcy)));
  const old = cents(big(e.priorPriceCents ?? "0").plus(big(e.valueDeltaCents)));
  const d = v - old;
  const rewrites: EntryRewrite[] = [
    { id: e.id, amountCents: amount, amountCurrency: ccy, valueDeltaCents: e.valueDeltaCents + d },
  ];
  const patch: HoldingPatch = { id: h.id };
  await rippleLater(h, e, all, d, valueCcy, rewrites, patch, rate, ctx.fx);
  return {
    budgetId: ctx.budgetId,
    patches: [patch],
    entries: [],
    rewriteEntries: rewrites,
    lockHoldingIds: [h.id],
    expectedNewestEntryId: [{ holdingId: h.id, entryId: all.at(-1)!.id }],
  };
}

/** 261111 (user): a price update re-stated as `amount` per unit in `ccy`.
 *  Its value moves by the price change × the units held then; a later price
 *  update keeps its price (its delta absorbs it), else today's price moves. */
async function planPrice(
  h: Holding,
  e: StoredEntry,
  all: StoredEntry[],
  amount: bigint,
  ccy: string,
  ctx: { budgetId: string; fx: FxProvider },
): Promise<BookingPlan> {
  const block = amountEditBlock(e, all);
  if (block) throw new Error(block);
  if (amount <= 0n) throw new Error("invalid_cents");
  const priceCcy = e.priorPriceCurrency ?? h.currentPriceCurrency ?? ccy;
  const rate = makeRate(ctx.fx, e.effectiveDate);
  const inPrice = async (c: bigint, from: string) =>
    from === priceCcy ? c : cents(big(c).times(await rate(from, priceCcy)));
  const p = await inPrice(amount, ccy);
  const d = p - (await inPrice(e.amountCents ?? 0n, e.amountCurrency ?? priceCcy));
  const heldAt = (x: StoredEntry) =>
    all
      .filter((y) => after(y, x) && y.qtyDelta !== null)
      .reduce((q, y) => q.minus(big(y.qtyDelta!)), big(h.quantity));
  const rewrites: EntryRewrite[] = [
    {
      id: e.id,
      amountCents: amount,
      amountCurrency: ccy,
      valueDeltaCents: cents(big(p).minus(big(e.priorPriceCents ?? "0")).times(heldAt(e))),
    },
  ];
  const patch: HoldingPatch = { id: h.id };
  const later = all.find((x) => after(x, e) && x.kind === "price_change");
  if (later) {
    const xCcy = later.priorPriceCurrency ?? priceCcy;
    const dx =
      xCcy === priceCcy ? d : cents(big(d).times(await makeRate(ctx.fx, later.effectiveDate)(priceCcy, xCcy)));
    rewrites.push({
      id: later.id,
      priorPriceCents: big(later.priorPriceCents ?? "0").plus(big(dx)).toString(),
      valueDeltaCents: later.valueDeltaCents - cents(big(dx).times(heldAt(later))),
    });
  } else {
    const cur = h.currentPriceCurrency ?? priceCcy;
    const dCur = cur === priceCcy ? big(d) : big(d).times(await rate(priceCcy, cur));
    patch.currentPriceCents = cents(big(h.currentPriceCents ?? 0n).plus(dCur)).toString();
  }
  return {
    budgetId: ctx.budgetId,
    patches: [patch],
    entries: [],
    rewriteEntries: rewrites,
    lockHoldingIds: [h.id],
    expectedNewestEntryId: [{ holdingId: h.id, entryId: all.at(-1)!.id }],
  };
}

/** 261109 (user): a sale (or a swap's out leg) re-stated as having received
 *  `amount` in `ccy` — only its realized gain moves; nothing in the asset. */
async function planSale(
  h: Holding,
  e: StoredEntry,
  all: StoredEntry[],
  amount: bigint,
  ccy: string,
  ctx: { budgetId: string; fx: FxProvider },
): Promise<BookingPlan> {
  const block = amountEditBlock(e, all);
  if (block) throw new Error(block);
  const swap = e.kind === "convert_out";
  if (!swap && holdingShape(h) === "deposit") throw new Error("not_money_in");
  if (amount <= 0n) throw new Error("invalid_cents");
  const rate = makeRate(ctx.fx, e.effectiveDate);
  const buyCcy = e.costCurrency ?? h.buyCurrency ?? ccy;
  const fx = realizedInBudget({
    receivedCents: amount,
    sourceToReceivedRate: await rate(buyCcy, ccy),
    soldCostCents: -e.costDeltaCents,
    sourceToBudgetRate: await rate(buyCcy, e.budgetCurrency ?? buyCcy),
  });
  return {
    budgetId: ctx.budgetId,
    patches: [],
    entries: [],
    rewriteEntries: [
      {
        id: e.id,
        amountCents: amount,
        amountCurrency: ccy,
        // A swap moved no money out of investments.
        ...(swap ? {} : { flowCents: -amount, flowCurrency: ccy }),
        assetAmountCents: fx.proceedsCents,
        realizedBudgetCents: fx.realizedBudgetCents,
      },
    ],
    lockHoldingIds: [h.id],
    expectedNewestEntryId: [{ holdingId: h.id, entryId: all.at(-1)!.id }],
  };
}

/** The booking that re-states `e` as `amount` in `ccy` (see the header). */
async function planAmount(
  h: Holding,
  e: StoredEntry,
  all: StoredEntry[],
  amount: bigint,
  ccy: string,
  ctx: { budgetId: string; fx: FxProvider },
): Promise<BookingPlan> {
  const block = amountEditBlock(e, all);
  if (block) throw new Error(block);
  if (amount <= 0n) throw new Error("invalid_cents");
  const sole = all.length === 1;
  const shape = holdingShape(h);
  const oldCost = e.costCurrency ?? h.buyCurrency ?? ccy;
  const costCcy = sole ? ccy : oldCost;
  // The value as it stood then — the asset may be shown in another currency now.
  const oldValue = e.priorPriceCurrency ?? h.currentPriceCurrency ?? oldCost;
  const switchValue = sole && shape !== "quantity" && oldValue === oldCost;
  const valueCcy = switchValue ? ccy : oldValue;
  const rate = makeRate(ctx.fx, e.effectiveDate);
  const cost = cents(big(amount).times(await rate(ccy, costCcy)));
  // The value follows the money for amount assets; a quantity asset is valued
  // by its price. 261109 (user): a deposit that stated the value after it
  // too — that value moves by what the deposit changed by.
  const broker = h.uiType === "broker";
  const statedSelf = statedBy(broker)(e);
  // A migrated opening carries no value delta: what went in WAS its value.
  const legacy =
    e.kind === "start" && e.valueDeltaCents === 0n && e.priorPriceCents === null;
  const tracks =
    shape === "amount" &&
    h.currentPriceCents !== null &&
    (statedSelf ||
      e.priorPriceCents !== null ||
      e.valueDeltaCents === e.costDeltaCents ||
      // A broker's opening stated its value; only one still worth exactly
      // what went in follows the money.
      (legacy && !broker) ||
      (legacy && sole && oldValue === oldCost && big(h.currentPriceCents).eq(big(e.costDeltaCents))));
  const newValue = cents(big(amount).times(await rate(ccy, valueCcy)));
  // The legacy opening keeps its zero delta; it and a stated deposit shift by
  // the change from the cost put in.
  const was =
    legacy || statedSelf
      ? cents(big(e.costDeltaCents).times(await rate(oldCost, valueCcy)))
      : e.valueDeltaCents;
  const value = !tracks || legacy
    ? e.valueDeltaCents
    : statedSelf
      ? e.valueDeltaCents + newValue - was
      : newValue;
  const rewrites: EntryRewrite[] = [
    {
      id: e.id,
      amountCents: amount,
      amountCurrency: ccy,
      costDeltaCents: cost,
      costCurrency: costCcy,
      valueDeltaCents: value,
      // A swap's in leg brought no new money into investments.
      ...(e.transferId ? {} : { flowCents: amount, flowCurrency: ccy }),
      assetAmountCents: cost,
    },
  ];
  const patch: HoldingPatch = { id: h.id };
  if (sole) patch.buyCurrency = ccy;
  if (switchValue) patch.currentPriceCurrency = ccy;
  const dCost = cost - e.costDeltaCents;
  if (shape === "quantity") {
    const held = big(h.quantity);
    patch.buyPriceCents = cents(
      big(h.buyPriceCents ?? 0n).times(held).plus(big(dCost)).div(held),
    );
  } else patch.buyPriceCents = (h.buyPriceCents ?? 0n) + dCost;

  if (tracks) {
    const dValue = newValue - was;
    if (sole) patch.currentPriceCents = newValue;
    else await rippleLater(h, e, all, dValue, valueCcy, rewrites, patch, rate, ctx.fx);
  }
  return {
    budgetId: ctx.budgetId,
    patches: [patch],
    entries: [],
    rewriteEntries: rewrites,
    lockHoldingIds: [h.id],
    // Nothing may land after the check (same guard as delete-entry).
    expectedNewestEntryId: [{ holdingId: h.id, entryId: all.at(-1)!.id }],
  };
}

export function editEntry(deps: {
  historyRepo: HistoryRepo;
  holdingRepo: HoldingRepo;
  fxProvider: FxProvider;
}) {
  return async (input: {
    tenantId: string;
    actorUserId: string;
    entryId: string;
    budgetId?: string;
    note?: string;
    effectiveDate?: string;
    amountCents?: string;
    currency?: string;
  }): Promise<Result<{ ok: true }, Error>> => {
    try {
      const { tenantId: t, actorUserId: u } = input;
      const legs = await deps.historyRepo.findLegs(t, u, input.entryId);
      if (legs.length === 0) return err(new Error("not_found"));
      if (input.amountCents !== undefined || input.currency !== undefined) {
        const ctx = { budgetId: input.budgetId ?? t, fx: deps.fxProvider };
        const planFor = async (e: StoredEntry, amount?: string, ccy?: string | null) => {
          const h = await deps.holdingRepo.findById(t, u, e.holdingId);
          if (!h) throw new Error("not_found");
          const all = await deps.historyRepo.listForHolding(t, u, h.id);
          return (
            e.kind === "value_change"
              ? planValue
              : e.kind === "price_change"
                ? planPrice
                : e.kind === "withdraw" || e.kind === "convert_out"
                ? planSale
                : planAmount
          )(
            h,
            e,
            all,
            BigInt(amount ?? e.amountCents ?? e.costDeltaCents),
            ccy ?? e.amountCurrency ?? e.costCurrency ?? h.buyCurrency!,
            ctx,
          );
        };
        // 261109 (user): a swap is fixed on both sides at once.
        const out = legs.find((l) => l.kind === "convert_out");
        const into = legs.find((l) => l.kind === "convert_in");
        if (legs.length === 2 && out && into) {
          const amount = input.amountCents ?? out.amountCents?.toString();
          const ccy = input.currency ?? out.amountCurrency;
          const a = await planFor(out, amount, ccy);
          const b = await planFor(into, amount, ccy);
          await deps.historyRepo.commit(t, u, {
            ...a,
            patches: [...a.patches, ...b.patches],
            rewriteEntries: [...(a.rewriteEntries ?? []), ...(b.rewriteEntries ?? [])],
            lockHoldingIds: [...(a.lockHoldingIds ?? []), ...(b.lockHoldingIds ?? [])],
            expectedNewestEntryId: [...(a.expectedNewestEntryId ?? []), ...(b.expectedNewestEntryId ?? [])],
          });
        } else {
          const e = legs[0]!;
          if (legs.length !== 1) return err(new Error("not_money_in"));
          await deps.historyRepo.commit(t, u, await planFor(e, input.amountCents, input.currency));
        }
      }
      const date = input.effectiveDate;
      if (date !== undefined && date !== legs[0]!.effectiveDate) {
        let min: string | null = null;
        let max: string | null = null;
        for (const leg of legs) {
          const h = await deps.holdingRepo.findById(t, u, leg.holdingId);
          if (h?.holdingType === "deposit" || h?.uiType === "deposit")
            return err(new Error("date_locked"));
          const others = (
            await deps.historyRepo.listForHolding(t, u, leg.holdingId)
          ).filter((x) => !legs.some((l) => l.id === x.id));
          const r = entryDateRange(others.map(key), key(leg));
          if (r.min !== null && (min === null || r.min > min)) min = r.min;
          if (r.max !== null && (max === null || r.max < max)) max = r.max;
        }
        if ((min !== null && date < min) || (max !== null && date > max))
          return err(new DateOutOfRange(min, max));
      }
      await deps.historyRepo.editEntries(
        t,
        u,
        legs.map((l) => l.id),
        {
          ...(input.note !== undefined ? { note: input.note || null } : {}),
          ...(date !== undefined ? { effectiveDate: date } : {}),
        },
      );
      return ok({ ok: true });
    } catch (e) {
      return err(e as Error);
    }
  };
}

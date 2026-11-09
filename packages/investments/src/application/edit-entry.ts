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
import { big, cents } from "../domain/sell-booking";
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
  const oldValue = h.currentPriceCurrency ?? oldCost;
  const switchValue = sole && shape !== "quantity" && oldValue === oldCost;
  const valueCcy = switchValue ? ccy : oldValue;
  const rate = makeRate(ctx.fx, e.effectiveDate);
  const cost = cents(big(amount).times(await rate(ccy, costCcy)));
  // The value follows the money for amount assets — a broker's only when the
  // deposit stated no account value after it; a quantity asset is valued by
  // its price.
  const broker = h.uiType === "broker";
  const stated = (x: StoredEntry) =>
    x.kind === "value_change" ||
    x.kind === "price_change" ||
    (broker && x.kind === "add" && x.valueDeltaCents !== x.costDeltaCents);
  const tracks =
    shape === "amount" &&
    h.currentPriceCents !== null &&
    !stated(e) &&
    (e.priorPriceCents !== null ||
      e.valueDeltaCents === e.costDeltaCents ||
      // A migrated opening carries no value delta: the asset still being
      // worth exactly what went in says the value follows the money.
      (sole && oldValue === oldCost && big(h.currentPriceCents).eq(big(e.costDeltaCents))));
  const value = tracks
    ? cents(big(amount).times(await rate(ccy, valueCcy)))
    : e.valueDeltaCents;
  const rewrites: EntryRewrite[] = [
    {
      id: e.id,
      amountCents: amount,
      amountCurrency: ccy,
      costDeltaCents: cost,
      costCurrency: costCcy,
      valueDeltaCents: value,
      flowCents: amount,
      flowCurrency: ccy,
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
    const dValue = value - e.valueDeltaCents;
    if (sole) patch.currentPriceCents = value;
    else {
      // A later snapshot is the value before that entry: shift it. One that
      // set the value outright (an update, a broker deposit with its value
      // after) keeps that value — its delta absorbs the shift, so the running
      // totals walked back from today move — and ends the ripple.
      let absolute = false;
      for (const x of all) {
        if (!after(x, e)) continue;
        if (absolute) break;
        absolute = stated(x);
        if (x.priorPriceCents !== null && (x.priorPriceCurrency ?? valueCcy) === valueCcy)
          rewrites.push({
            id: x.id,
            priorPriceCents: big(x.priorPriceCents).plus(big(dValue)).toString(),
            ...(absolute ? { valueDeltaCents: x.valueDeltaCents - dValue } : {}),
          });
      }
      if (!absolute)
        patch.currentPriceCents = big(h.currentPriceCents!).plus(big(dValue)).toString();
    }
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
        const e = legs[0]!;
        if (legs.length !== 1) return err(new Error("not_money_in"));
        const h = await deps.holdingRepo.findById(t, u, e.holdingId);
        if (!h) return err(new Error("not_found"));
        const all = await deps.historyRepo.listForHolding(t, u, h.id);
        const plan = await planAmount(
          h,
          e,
          all,
          BigInt(input.amountCents ?? e.amountCents ?? e.costDeltaCents),
          input.currency ?? e.amountCurrency ?? e.costCurrency ?? h.buyCurrency!,
          { budgetId: input.budgetId ?? t, fx: deps.fxProvider },
        );
        await deps.historyRepo.commit(t, u, plan);
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

/**
 * delete-entry.ts — the ledger's only edit (13.1 D-14..D-18, D-21, D-24).
 *
 * Only the NEWEST live entry of an asset can be deleted; a linked pair (sale
 * into another asset, transfer) only when each leg is newest in its own asset,
 * and both go together (D-16). Deleting reverses exactly that entry:
 *   - qty / cost / value by its stored deltas (current price in exact Big
 *     arithmetic — sub-cent kept, IN-04);
 *   - a value / price update or broker add from its prior-price snapshot;
 *   - a deposit part-sale from its prior principal + start date (D-20);
 *   - a wallet credit by subtracting the same delta (D-21; a deleted wallet is
 *     skipped, a created wallet stays, D-24).
 * The last entry of an asset wipes it, history and realized included (D-17);
 * otherwise quantity 0 hides it and anything above 0 shows it again.
 * Strict LIFO makes snapshot undo safe; the commit re-checks the newest entry
 * under a row lock, so a concurrent append answers "stale" (409).
 */
import { ok, err, type Result } from "neverthrow";
import { holdingShape, type Holding } from "../domain/holding";
import { deletableEntry, type LedgerKey } from "../domain/asset-ledger";
import { big, cents, qty } from "../domain/sell-booking";
import type { HoldingRepo } from "../ports/holding-repo";
import type {
  BookingPlan,
  HistoryRepo,
  HoldingPatch,
  StoredEntry,
  WalletCredit,
} from "../ports/history-repo";

const fail = (code: string) => new Error(code);
const key = (e: StoredEntry): LedgerKey => ({
  id: e.id,
  effectiveDate: e.effectiveDate,
  createdAt: e.createdAt,
  transferId: e.transferId,
  holdingId: e.holdingId,
});

/** The holding state after undoing `leg`, or a wipe when it is the last entry. */
function undoLeg(
  h: Holding,
  leg: StoredEntry,
  liveCount: number,
):
  | { wipe: true }
  | {
      wipe: false;
      patch: HoldingPatch;
      restorePrice?: BookingPlan["restorePrice"];
    } {
  if (liveCount <= 1) return { wipe: true };
  const patch: HoldingPatch = { id: h.id };

  if (leg.priorPrincipalCents !== null) {
    patch.buyPriceCents = leg.priorPrincipalCents;
    if (leg.priorStartDate) patch.depositStartDate = leg.priorStartDate;
    if (h.archivedAt) patch.unarchive = true;
    return { wipe: false, patch };
  }

  const restorePrice =
    leg.priorPriceCents !== null
      ? {
          id: h.id,
          priceCents: leg.priorPriceCents,
          currency: leg.priorPriceCurrency,
        }
      : undefined;

  // ponytail: pre-R6 amount entries on a now-quantity type (collectibles were
  // hand-valued). At quantity 1 the amount reversal is still exact; with more
  // units it would guess, so refuse instead.
  const legacy =
    h.uiType === "collectibles" &&
    leg.qtyDelta === null &&
    !restorePrice &&
    (leg.costDeltaCents !== 0n || leg.valueDeltaCents !== 0n);
  if (legacy && !big(h.quantity).eq(1)) throw new RangeError("legacy_entry");

  if (holdingShape(h) === "quantity" && !legacy) {
    const held = big(h.quantity);
    const after = held.minus(big(leg.qtyDelta ?? "0"));
    if (after.lt(0)) throw new RangeError("would_go_negative");
    const total = big(h.buyPriceCents ?? 0n)
      .times(held)
      .minus(big(leg.costDeltaCents));
    if (total.lt(0)) throw new RangeError("would_go_negative");
    patch.quantity = qty(after);
    if (after.gt(0)) patch.buyPriceCents = cents(total.div(after));
    // Round 4 (user): back to 0 stays listed — archive is explicit now.
    if (after.gt(0) && h.archivedAt) patch.unarchive = true;
    return { wipe: false, patch, restorePrice };
  }

  const buy = (h.buyPriceCents ?? 0n) - leg.costDeltaCents;
  if (buy < 0n) throw new RangeError("would_go_negative");
  patch.buyPriceCents = buy;
  let value: string | null =
    h.currentPriceCents === null ? null : String(h.currentPriceCents);
  if (restorePrice) value = restorePrice.priceCents;
  else if (value !== null) {
    const v = big(value).minus(big(leg.valueDeltaCents));
    if (v.lt(0)) throw new RangeError("would_go_negative");
    value = v.toString();
    patch.currentPriceCents = value;
  }
  const empty =
    value !== null &&
    big(value).eq(0) &&
    buy === 0n &&
    h.holdingType !== "deposit";
  if (!empty && h.archivedAt) patch.unarchive = true;
  return { wipe: false, patch, restorePrice };
}

export function deleteEntry(deps: {
  holdingRepo: HoldingRepo;
  historyRepo: HistoryRepo;
}) {
  return async (input: {
    tenantId: string;
    budgetId: string;
    actorUserId: string;
    entryId: string;
  }): Promise<
    Result<
      {
        wipedHoldingId: string | null;
        walletId: string | null;
        walletType: string | null;
      },
      Error
    >
  > => {
    try {
      const legs = await deps.historyRepo.findLegs(
        input.tenantId,
        input.actorUserId,
        input.entryId,
      );
      const target = legs.find((l) => l.id === input.entryId);
      if (!target) return err(fail("not_found"));
      const partner = legs.find((l) => l.id !== target.id) ?? null;

      const liveOf = new Map<string, StoredEntry[]>();
      for (const l of legs)
        if (!liveOf.has(l.holdingId))
          liveOf.set(
            l.holdingId,
            await deps.historyRepo.listForHolding(
              input.tenantId,
              input.actorUserId,
              l.holdingId,
            ),
          );
      const verdict = deletableEntry(
        key(target),
        liveOf.get(target.holdingId)!.map(key),
        partner
          ? {
              entry: key(partner),
              partnerLive: liveOf.get(partner.holdingId)!.map(key),
            }
          : null,
      );
      if (!verdict.ok) return err(fail(verdict.reason));

      const plan: BookingPlan = {
        budgetId: input.budgetId,
        patches: [],
        entries: [],
        softDeleteEntryIds: legs.map((l) => l.id),
        deleteHoldingIds: [],
        lockHoldingIds: [...liveOf.keys()],
        expectedNewestEntryId: legs.map((l) => ({
          holdingId: l.holdingId,
          entryId: l.id,
        })),
      };
      for (const leg of legs) {
        const h = await deps.holdingRepo.findById(
          input.tenantId,
          input.actorUserId,
          leg.holdingId,
        );
        if (!h) return err(fail("not_found"));
        const u = undoLeg(h, leg, liveOf.get(leg.holdingId)!.length);
        if (u.wipe) plan.deleteHoldingIds!.push(h.id);
        else {
          if (Object.keys(u.patch).length > 1) plan.patches.push(u.patch);
          if (u.restorePrice) plan.restorePrice = u.restorePrice;
        }
      }
      // A wiped asset's own wallet credit still comes back out (D-21).
      const credited = legs.find((l) => l.walletId && l.walletDeltaNumeric);
      if (credited) {
        const reverse: WalletCredit = {
          target: { walletId: credited.walletId! },
          amountMajor: credited.walletDeltaNumeric!,
          currency: credited.amountCurrency ?? "",
          reverse: true,
        };
        plan.walletCredit = reverse;
      }
      // A wiped holding is deleted; neither patch nor snapshot applies to it.
      plan.patches = plan.patches.filter(
        (p) => !plan.deleteHoldingIds!.includes(p.id),
      );
      if (
        plan.restorePrice &&
        plan.deleteHoldingIds!.includes(plan.restorePrice.id)
      )
        delete plan.restorePrice;

      const r = await deps.historyRepo.commit(
        input.tenantId,
        input.actorUserId,
        plan,
      );
      return ok({
        wipedHoldingId: plan.deleteHoldingIds!.includes(target.holdingId)
          ? target.holdingId
          : null,
        walletId: r.walletId,
        walletType: r.walletType,
      });
    } catch (e) {
      if (e instanceof RangeError) return err(fail(e.message));
      return err(e as Error);
    }
  };
}

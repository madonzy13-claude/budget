/**
 * reverse-history-entry.ts — D-06: deleting a history entry is a FULL UNDO.
 *
 * REVERSAL RULE: an entry is undone by subtracting ITS OWN stored deltas
 * (qty, cost, value) from the holding's CURRENT state (reverseEntry, 13-01).
 * Later entries survive. Explicit exceptions:
 *  - deposit sale (prior principal stored): the restart is not a delta, so the
 *    prior principal + start date come back — only when it is the deposit's
 *    latest live entry, else undo_later_first;
 *  - a conversion's legs go together (transfer id); a convert_in whose holding
 *    has no other live entry created that holding → the holding is deleted;
 *  - undoing a sale of an archived (sold-out) holding un-archives it.
 * Every undone row is soft-deleted in the same commit, so realized (type
 * summary) and contributions (listFlows) reverse with it; re-entering creates
 * fresh rows — no double count.
 * ponytail: read-then-commit is not serializable; fine for one household, add
 * SELECT … FOR UPDATE if concurrent edits ever matter.
 */
import { ok, err, type Result } from "neverthrow";
import Big from "big.js";
import { holdingShape } from "../domain/holding";
import { reverseEntry } from "../domain/sell-booking";
import type { HoldingRepo } from "../ports/holding-repo";
import type {
  HistoryRepo,
  HoldingPatch,
  StoredEntry,
} from "../ports/history-repo";

type Ctx = { tenantId: string; actorUserId: string };

/** What undoing ONE leg does to its holding: a patch, or deleting it. */
export async function planLegUndo(
  deps: { holdingRepo: HoldingRepo; historyRepo: HistoryRepo },
  ctx: Ctx,
  leg: StoredEntry,
): Promise<{ patch?: HoldingPatch; deleteHolding?: string }> {
  const h = await deps.holdingRepo.findById(
    ctx.tenantId,
    ctx.actorUserId,
    leg.holdingId,
  );
  if (!h) throw new Error("not_found");
  const live = await deps.historyRepo.listForHolding(
    ctx.tenantId,
    ctx.actorUserId,
    h.id,
  );
  const unarchive =
    h.archivedAt !== null &&
    (leg.kind === "withdraw" || leg.kind === "convert_out");

  if (leg.priorPrincipalCents !== null) {
    if (live[live.length - 1]?.id !== leg.id)
      throw new RangeError("undo_later_first");
    return {
      patch: {
        id: h.id,
        buyPriceCents: leg.priorPrincipalCents,
        ...(leg.priorStartDate ? { depositStartDate: leg.priorStartDate } : {}),
        ...(unarchive ? { unarchive: true } : {}),
      },
    };
  }

  // A convert_in that brought everything the holding has (its only live
  // entry, and undoing it leaves nothing) created that holding → delete it.
  const createdByThis =
    leg.kind === "convert_in" &&
    live.every((e) => e.id === leg.id || e.transferId === leg.transferId);
  const quantity = holdingShape(h) === "quantity";
  const current =
    h.currentPriceCents === null
      ? null
      : BigInt(new Big(h.currentPriceCents.toString()).round(0, 2).toFixed(0));
  let r: ReturnType<typeof reverseEntry>;
  try {
    r = reverseEntry({
      shape: quantity ? "quantity" : "amount",
      quantity: h.quantity,
      buyPriceCents: h.buyPriceCents ?? 0n,
      currentPriceCents: quantity ? null : current,
      qtyDelta: leg.qtyDelta,
      costDeltaCents: leg.costDeltaCents,
      valueDeltaCents: leg.valueDeltaCents,
    });
  } catch (e) {
    if (createdByThis && e instanceof RangeError)
      return { deleteHolding: h.id };
    throw e;
  }
  if (
    createdByThis &&
    r.buyPriceCents === 0n &&
    (r.currentPriceCents ?? 0n) === 0n
  )
    return { deleteHolding: h.id };
  return {
    patch: {
      id: h.id,
      buyPriceCents: r.buyPriceCents,
      ...(quantity ? { quantity: r.quantity } : {}),
      ...(!quantity && r.currentPriceCents !== null
        ? { currentPriceCents: r.currentPriceCents }
        : {}),
      ...(unarchive ? { unarchive: true } : {}),
    },
  };
}

export function reverseHistoryEntry(deps: {
  holdingRepo: HoldingRepo;
  historyRepo: HistoryRepo;
}) {
  return async (input: {
    tenantId: string;
    budgetId: string;
    actorUserId: string;
    entryId: string;
  }): Promise<Result<{ ok: true; undone: number }, Error>> => {
    try {
      const legs = await deps.historyRepo.findLegs(
        input.tenantId,
        input.actorUserId,
        input.entryId,
      );
      if (legs.length === 0) return err(new Error("not_found"));
      const patches: HoldingPatch[] = [];
      const deleteHoldingIds: string[] = [];
      for (const leg of legs) {
        const u = await planLegUndo(deps, input, leg);
        if (u.patch) patches.push(u.patch);
        if (u.deleteHolding) deleteHoldingIds.push(u.deleteHolding);
      }
      await deps.historyRepo.commit(input.tenantId, input.actorUserId, {
        budgetId: input.budgetId,
        // A holding about to be deleted needs no patch.
        patches: patches.filter((p) => !deleteHoldingIds.includes(p.id)),
        entries: [],
        softDeleteEntryIds: legs.map((l) => l.id),
        deleteHoldingIds,
      });
      return ok({ ok: true, undone: legs.length });
    } catch (e) {
      if (e instanceof RangeError) return err(new Error(e.message));
      return err(e as Error);
    }
  };
}

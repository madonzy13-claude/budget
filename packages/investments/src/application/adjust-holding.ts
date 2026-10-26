/**
 * adjust-holding.ts — Phase 13 Edit → "What happened?" (D-03).
 *
 * value_change: the market moved — value only, no flow.
 * add:          "Added money" — cost and contributions rise by the difference.
 * withdraw:     "Withdrew money" — delegated to sellHolding with destination
 *               Out, so the booking is the SAME rule as Sell → Out (D-03).
 * buy:          "Bought more" on a quantity holding — qty + cost, flow = paid.
 * Every entry carries its own deltas, so deleting it later is a full undo.
 */
import { ok, err, type Result } from "neverthrow";
import { holdingShape } from "../domain/holding";
import { holdingValue } from "../domain/portfolio-metrics";
import { addMoney, buyMore } from "../domain/sell-booking";
import type { HoldingRepo } from "../ports/holding-repo";
import { entry, type HistoryRepo } from "../ports/history-repo";
import type { AdjustHoldingInput } from "../contracts/api";
import type { sellHolding as SellHolding } from "./sell-holding";

type Who = {
  tenantId: string;
  budgetId: string;
  actorUserId: string;
  budgetCurrency: string;
  holdingId: string;
};

export function adjustHolding(deps: {
  holdingRepo: HoldingRepo;
  historyRepo: HistoryRepo;
  sellHolding: ReturnType<typeof SellHolding>;
}) {
  return async (
    input: AdjustHoldingInput & Who,
  ): Promise<Result<{ ok: true }, Error>> => {
    try {
      if (input.kind === "withdraw") {
        const r = await deps.sellHolding({
          ...input,
          left: { valueCents: input.newValueCents },
          destination: { kind: "out" },
        });
        return r.isErr() ? err(r.error) : ok({ ok: true });
      }

      const h = await deps.holdingRepo.findById(
        input.tenantId,
        input.actorUserId,
        input.holdingId,
      );
      if (!h || h.archivedAt) return err(new Error("not_found"));
      const shape = holdingShape(h);
      const ccy = h.buyCurrency ?? h.currentPriceCurrency;
      const commit = (
        patch: Parameters<HistoryRepo["commit"]>[2]["patches"][number],
        e: Parameters<typeof entry>[0],
      ) =>
        deps.historyRepo.commit(input.tenantId, input.actorUserId, {
          budgetId: input.budgetId,
          patches: [patch],
          entries: [entry(e)],
        });

      if (input.kind === "buy") {
        if (shape !== "quantity") return err(new Error("wrong_shape"));
        const paid = BigInt(String(input.paidCents));
        const r = buyMore({
          quantity: h.quantity,
          buyPriceCents: h.buyPriceCents ?? 0n,
          addQuantity: input.addQuantity,
          paidCents: paid,
        });
        await commit(
          {
            id: h.id,
            quantity: r.newQuantity,
            buyPriceCents: r.newBuyPriceCents,
          },
          {
            holdingRef: h.id,
            kind: "buy",
            effectiveDate: input.effectiveDate,
            amountCents: paid,
            amountCurrency: ccy,
            qtyDelta: input.addQuantity,
            costDeltaCents: paid,
            costCurrency: ccy,
            flowCents: paid,
            flowCurrency: ccy,
          },
        );
        return ok({ ok: true });
      }

      if (shape !== "amount") return err(new Error("wrong_shape"));
      const newValue = BigInt(String(input.newValueCents));
      const value = BigInt(holdingValue(h).round(0, 2).toFixed(0));
      // Amount shape ⇒ qty 1, so the value IS the stored current price.

      if (input.kind === "value_change") {
        await commit(
          { id: h.id, currentPriceCents: newValue },
          {
            holdingRef: h.id,
            kind: "value_change",
            effectiveDate: input.effectiveDate,
            amountCents: newValue,
            amountCurrency: h.currentPriceCurrency,
            valueDeltaCents: newValue - value,
          },
        );
        return ok({ ok: true });
      }

      const added = newValue - value;
      if (added <= 0n) return err(new Error("nothing_added"));
      const { newBuyCents } = addMoney({
        buyCents: h.buyPriceCents ?? 0n,
        amountCents: added,
      });
      await commit(
        { id: h.id, buyPriceCents: newBuyCents, currentPriceCents: newValue },
        {
          holdingRef: h.id,
          kind: "add",
          effectiveDate: input.effectiveDate,
          amountCents: added,
          amountCurrency: ccy,
          costDeltaCents: added,
          costCurrency: ccy,
          valueDeltaCents: added,
          flowCents: added,
          flowCurrency: ccy,
        },
      );
      return ok({ ok: true });
    } catch (e) {
      if (e instanceof RangeError) return err(new Error(e.message));
      return err(e as Error);
    }
  };
}

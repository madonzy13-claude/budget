import Big from "big.js";
import { ok, err, type Result } from "neverthrow";
import type { Holding } from "../domain/holding";
import type { HoldingRepo, NewHolding } from "../ports/holding-repo";
import type { UpdateHoldingInput } from "../contracts/api";
import { toCents } from "./create-holding";
import { withdrawalLeg } from "./group-flow";

export function updateHolding(deps: { holdingRepo: HoldingRepo }) {
  return async (
    input: UpdateHoldingInput & {
      tenantId: string;
      holdingId: string;
      actorUserId: string;
      // Budget the holding lives in (== tenantId in this app); defaults to it.
      budgetId?: string;
    },
  ): Promise<Result<Holding, Error>> => {
    try {
      const current = await deps.holdingRepo.findById(
        input.tenantId,
        input.actorUserId,
        input.holdingId,
      );
      if (!current) return err(new Error("not_found"));

      // Merge: `undefined` = field absent from the patch; explicit null clears it.
      const merged: NewHolding = {
        name: input.name ?? current.name,
        holdingType: input.holdingType ?? current.holdingType,
        group:
          input.group !== undefined ? (input.group ?? null) : current.group,
        instrumentId:
          input.instrumentId !== undefined
            ? (input.instrumentId ?? null)
            : current.instrumentId,
        manualTicker:
          input.manualTicker !== undefined
            ? (input.manualTicker ?? null)
            : current.manualTicker,
        buyPriceCents:
          input.buyPriceCents !== undefined
            ? toCents(input.buyPriceCents)
            : current.buyPriceCents,
        buyCurrency:
          input.buyCurrency !== undefined
            ? (input.buyCurrency ?? null)
            : current.buyCurrency,
        quantity: input.quantity ?? current.quantity,
        currentPriceCents:
          input.currentPriceCents !== undefined
            ? toCents(input.currentPriceCents)
            : current.currentPriceCents,
        currentPriceCurrency:
          input.currentPriceCurrency !== undefined
            ? (input.currentPriceCurrency ?? null)
            : current.currentPriceCurrency,
        uiType:
          input.uiType !== undefined ? (input.uiType ?? null) : current.uiType,
        metal:
          input.metal !== undefined ? (input.metal ?? null) : current.metal,
        metalKind:
          input.metalKind !== undefined
            ? (input.metalKind ?? null)
            : current.metalKind,
        unitOfMeasure:
          input.unitOfMeasure !== undefined
            ? (input.unitOfMeasure ?? null)
            : current.unitOfMeasure,
        premiumPct:
          input.premiumPct !== undefined
            ? (input.premiumPct ?? null)
            : current.premiumPct,
      };

      const updated = await deps.holdingRepo.update(
        input.tenantId,
        input.actorUserId,
        input.holdingId,
        merged,
      );
      if (!updated) return err(new Error("not_found"));

      // Book a group withdrawal when quantity LEAVES a group: a partial sell
      // (quantity dropped within the same group) or the whole position moving
      // OUT of its group. Both realize the leaving quantity at the current
      // price, so the group's P/L stays put instead of shrinking with the sold
      // units. Loose holdings (no old group) book nothing.
      // ponytail: a single PATCH that both changes group AND drops quantity is
      // treated as a full move-out of the old position; the rare combo isn't
      // split into move + partial-sell.
      const oldGroup = current.group;
      if (oldGroup !== null) {
        let leavingQty: string | null = null;
        if (merged.group !== oldGroup) {
          leavingQty = current.quantity; // whole position leaves the old group
        } else {
          const drop = new Big(current.quantity).minus(new Big(merged.quantity));
          if (drop.gt(0)) leavingQty = drop.toString(); // partial sell
        }
        if (leavingQty !== null) {
          const leg = withdrawalLeg({
            leavingQty,
            buyPriceCents: current.buyPriceCents,
            buyCurrency: current.buyCurrency,
            sellPriceCents: current.currentPriceCents,
            sellCurrency: current.currentPriceCurrency,
          });
          if (leg) {
            await deps.holdingRepo.recordGroupFlow(
              input.tenantId,
              input.actorUserId,
              input.budgetId ?? input.tenantId,
              oldGroup,
              leg,
            );
          }
        }
      }
      return ok(updated);
    } catch (e) {
      return err(e as Error);
    }
  };
}

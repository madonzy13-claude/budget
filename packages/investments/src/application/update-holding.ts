import { ok, err, type Result } from "neverthrow";
import type { Holding } from "../domain/holding";
import type { HoldingRepo, NewHolding } from "../ports/holding-repo";
import type { UpdateHoldingInput } from "../contracts/api";
import { toCents } from "./create-holding";

export function updateHolding(deps: { holdingRepo: HoldingRepo }) {
  return async (
    input: UpdateHoldingInput & {
      tenantId: string;
      holdingId: string;
      actorUserId: string;
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
      };

      const updated = await deps.holdingRepo.update(
        input.tenantId,
        input.actorUserId,
        input.holdingId,
        merged,
      );
      if (!updated) return err(new Error("not_found"));
      return ok(updated);
    } catch (e) {
      return err(e as Error);
    }
  };
}

import { ok, err, type Result } from "neverthrow";
import type { Holding } from "../domain/holding";
import type { HoldingRepo, NewHolding } from "../ports/holding-repo";
import type { CreateHoldingInput } from "../contracts/api";

export const toCents = (
  v: string | number | null | undefined,
): bigint | null =>
  v === null || v === undefined || v === ""
    ? null
    : BigInt(
        Math.round(Number(String(v).replace(/,/g, ".").replace(/\s/g, ""))),
      );

export function createHolding(deps: { holdingRepo: HoldingRepo }) {
  return async (
    input: CreateHoldingInput & {
      tenantId: string;
      budgetId: string;
      actorUserId: string;
    },
  ): Promise<Result<Holding, Error>> => {
    const nh: NewHolding = {
      name: input.name,
      holdingType: input.holdingType,
      uiType: input.uiType ?? null,
      group: input.group ?? null,
      instrumentId: input.instrumentId ?? null,
      buyPriceCents: toCents(input.buyPriceCents),
      buyCurrency: input.buyCurrency ?? null,
      quantity: input.quantity ?? "1",
      currentPriceCents: toCents(input.currentPriceCents),
      currentPriceCurrency: input.currentPriceCurrency ?? null,
      metal: input.metal ?? null,
      metalKind: input.metalKind ?? null,
      unitOfMeasure: input.unitOfMeasure ?? null,
    };
    try {
      return ok(
        await deps.holdingRepo.create(
          input.tenantId,
          input.budgetId,
          input.actorUserId,
          nh,
        ),
      );
    } catch (e) {
      return err(e as Error);
    }
  };
}

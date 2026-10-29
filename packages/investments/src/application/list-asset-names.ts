/**
 * list-asset-names.ts — the type's assets for the name pickers, hidden ones
 * included. Names are not unique (round-5), so each row carries what tells
 * twins apart: amount + unit + currency.
 */
import { ok, err, type Result } from "neverthrow";
import { big, cents } from "../domain/sell-booking";
import type { HoldingRepo } from "../ports/holding-repo";
import type { AssetNameDto } from "../contracts/api";

export function listAssetNames(deps: { holdingRepo: HoldingRepo }) {
  return async (input: {
    tenantId: string;
    budgetId: string;
    uiType: string;
  }): Promise<Result<AssetNameDto[], Error>> => {
    try {
      const rows = await deps.holdingRepo.listNames(
        input.tenantId,
        input.budgetId,
        input.uiType,
      );
      return ok(
        rows.map((r) => ({
          id: r.id,
          name: r.name,
          archived: r.archived,
          instrumentId: r.instrumentId,
          quantity: big(r.quantity).toString(),
          valueCents:
            r.currentPriceCents === null
              ? null
              : cents(
                  big(r.currentPriceCents).times(big(r.quantity)),
                ).toString(),
          valueCurrency: r.currentPriceCurrency ?? r.buyCurrency,
          symbol: r.symbol,
          instrumentName: r.instrumentName,
          holdingType: r.holdingType,
          unitOfMeasure: r.unitOfMeasure,
        })),
      );
    } catch (e) {
      return err(e as Error);
    }
  };
}

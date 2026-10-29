/**
 * list-asset-names.ts — autocomplete over a type's assets, hidden (sold-out)
 * ones included so a buy under that name revives them (13.1 D-02, D-17).
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
          valueCurrency: r.currentPriceCurrency,
        })),
      );
    } catch (e) {
      return err(e as Error);
    }
  };
}

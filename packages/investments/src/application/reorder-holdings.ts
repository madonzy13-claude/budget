import { ok, err, type Result } from "neverthrow";
import type { HoldingRepo } from "../ports/holding-repo";

/**
 * reorderHoldings (T-9-15): validates every orderedId belongs to the requesting
 * tenant's active investments before persisting — returns holding_id_not_in_section
 * otherwise (mirrors wallet_id_not_in_section).
 */
export function reorderHoldings(deps: { holdingRepo: HoldingRepo }) {
  return async (input: {
    tenantId: string;
    budgetId: string;
    actorUserId: string;
    orderedIds: string[];
  }): Promise<Result<{ ok: true }, Error>> => {
    try {
      const holdings = await deps.holdingRepo.listForBudget(
        input.tenantId,
        input.budgetId,
        input.actorUserId,
      );
      const owned = new Set(holdings.map((h) => h.id));
      for (const id of input.orderedIds) {
        if (!owned.has(id)) return err(new Error("holding_id_not_in_section"));
      }
      await deps.holdingRepo.reorder(
        input.tenantId,
        input.actorUserId,
        input.orderedIds,
      );
      return ok({ ok: true });
    } catch (e) {
      return err(e as Error);
    }
  };
}

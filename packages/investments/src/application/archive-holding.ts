import { ok, err, type Result } from "neverthrow";
import type { HoldingRepo } from "../ports/holding-repo";
import { withdrawalLeg } from "./group-flow";

export function archiveHolding(deps: { holdingRepo: HoldingRepo }) {
  return async (input: {
    tenantId: string;
    holdingId: string;
    actorUserId: string;
    // Budget the holding lives in (== tenantId in this app); defaults to it.
    budgetId?: string;
  }): Promise<Result<{ ok: true }, Error>> => {
    try {
      // Removing a grouped holding is a full withdrawal: realize the whole
      // position at the current price so the group's P/L doesn't drop with it.
      const holding = await deps.holdingRepo.findById(
        input.tenantId,
        input.actorUserId,
        input.holdingId,
      );
      if (holding?.group) {
        const leg = withdrawalLeg({
          leavingQty: holding.quantity,
          buyPriceCents: holding.buyPriceCents,
          buyCurrency: holding.buyCurrency,
          sellPriceCents: holding.currentPriceCents,
          sellCurrency: holding.currentPriceCurrency,
        });
        if (leg) {
          await deps.holdingRepo.recordGroupFlow(
            input.tenantId,
            input.actorUserId,
            input.budgetId ?? input.tenantId,
            holding.group,
            leg,
          );
        }
      }

      await deps.holdingRepo.archive(
        input.tenantId,
        input.actorUserId,
        input.holdingId,
      );

      // If that was the LAST holding in its group, wipe the group's flow ledger
      // so its realized P/L doesn't linger (and a same-name group later starts
      // fresh). No-op while other holdings remain in the group.
      if (holding?.group) {
        await deps.holdingRepo.pruneGroupFlowsIfEmpty(
          input.tenantId,
          input.actorUserId,
          input.budgetId ?? input.tenantId,
          holding.group,
        );
      }
      return ok({ ok: true });
    } catch (e) {
      return err(e as Error);
    }
  };
}

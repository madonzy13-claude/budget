import { ok, err, type Result } from "neverthrow";
import type { HoldingRepo } from "../ports/holding-repo";

export function archiveHolding(deps: { holdingRepo: HoldingRepo }) {
  return async (input: {
    tenantId: string;
    holdingId: string;
    actorUserId: string;
  }): Promise<Result<{ ok: true }, Error>> => {
    try {
      await deps.holdingRepo.archive(
        input.tenantId,
        input.actorUserId,
        input.holdingId,
      );
      return ok({ ok: true });
    } catch (e) {
      return err(e as Error);
    }
  };
}

/** Round 5: picking an archived asset brings it back (by id). */
export function restoreHolding(deps: { holdingRepo: HoldingRepo }) {
  return async (input: {
    tenantId: string;
    holdingId: string;
    actorUserId: string;
  }): Promise<Result<{ ok: true }, Error>> => {
    try {
      await deps.holdingRepo.restore(
        input.tenantId,
        input.actorUserId,
        input.holdingId,
      );
      return ok({ ok: true });
    } catch (e) {
      return err(e as Error);
    }
  };
}

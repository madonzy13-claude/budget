/**
 * delete-scheduled-payment.ts — Soft-delete (deactivate) a scheduled rule.
 */
import { type Result } from "@budget/shared-kernel";
import type { ScheduledPaymentRepo } from "../ports/scheduled-payment-repo";

export interface DeleteScheduledPaymentInput {
  tenantId: string;
  ruleId: string;
  actorUserId: string;
}

export function deleteScheduledPayment(deps: { ruleRepo: ScheduledPaymentRepo }) {
  return async (input: DeleteScheduledPaymentInput): Promise<Result<void, Error>> => {
    const { ok } = await import("@budget/shared-kernel");
    await deps.ruleRepo.softDelete(input.tenantId, input.ruleId, input.actorUserId);
    return ok(undefined);
  };
}

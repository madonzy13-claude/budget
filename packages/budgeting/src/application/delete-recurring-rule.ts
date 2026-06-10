/**
 * delete-recurring-rule.ts — Soft-delete (deactivate) a recurring rule.
 */
import { type Result } from "@budget/shared-kernel";
import type { RecurringRuleRepo } from "../ports/recurring-rule-repo";

export interface DeleteRecurringRuleInput {
  tenantId: string;
  ruleId: string;
  actorUserId: string;
}

export function deleteRecurringRule(deps: { ruleRepo: RecurringRuleRepo }) {
  return async (input: DeleteRecurringRuleInput): Promise<Result<void, Error>> => {
    const { ok } = await import("@budget/shared-kernel");
    await deps.ruleRepo.deactivate(input.tenantId, input.ruleId, input.actorUserId);
    return ok(undefined);
  };
}

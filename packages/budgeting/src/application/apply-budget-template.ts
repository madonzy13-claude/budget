/**
 * apply-budget-template.ts — Application use case: apply template to target month
 * D-04-d: bulk-sets limits for all template items.
 */
import { ok, err, type Result } from "@budget/shared-kernel";
import type { BudgetTemplateRepo } from "../ports/budget-template-repo";
import type { ApplyTemplateInput } from "../contracts/api";

export interface ApplyBudgetTemplateDeps {
  templateRepo: BudgetTemplateRepo;
}

export interface ApplyBudgetTemplateFullInput extends ApplyTemplateInput {
  tenantId: string;
  actorUserId: string;
}

export function applyBudgetTemplate(deps: ApplyBudgetTemplateDeps) {
  return async (
    input: ApplyBudgetTemplateFullInput,
  ): Promise<Result<void, Error>> => {
    return deps.templateRepo.applyTemplate({
      tenantId: input.tenantId,
      templateId: input.templateId,
      targetMonth: input.targetMonth,
      actorUserId: input.actorUserId,
    });
  };
}

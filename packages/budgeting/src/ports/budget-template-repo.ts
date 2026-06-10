/**
 * budget-template-repo.ts — BudgetTemplateRepo port
 */
import type { Result } from "@budget/shared-kernel";

export interface TemplateItemInput {
  categoryId: string;
  normalAmount: string;
  normalCurrency: string;
  cushionAmount: string;
  cushionCurrency: string;
}

export interface CreateTemplateInput {
  tenantId: string;
  name: string;
  actorUserId: string;
  items: TemplateItemInput[];
}

export interface TemplateItemDto {
  categoryId: string;
  normalAmount: string;
  normalCurrency: string;
  cushionAmount: string;
  cushionCurrency: string;
}

export interface TemplateDto {
  id: string;
  tenantId: string;
  name: string;
  items: TemplateItemDto[];
  createdAt: string;
}

export interface ApplyTemplateInput {
  tenantId: string;
  templateId: string;
  targetMonth: string; // YYYY-MM
  actorUserId: string;
}

export interface BudgetTemplateRepo {
  createTemplate(input: CreateTemplateInput): Promise<Result<TemplateDto, Error>>;
  listTemplates(tenantId: string): Promise<Result<TemplateDto[], Error>>;
  findTemplate(tenantId: string, templateId: string): Promise<TemplateDto | null>;
  applyTemplate(input: ApplyTemplateInput): Promise<Result<void, Error>>;
}

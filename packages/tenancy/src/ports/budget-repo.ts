/**
 * budget-repo.ts — Port interface for Budget persistence (renamed from workspace-repo.ts)
 */
import type { BudgetDTO, MemberDTO } from "../contracts/api";

export interface BudgetRepo {
  findById(id: string): Promise<BudgetDTO | null>;
  listForUser(userId: string): Promise<BudgetDTO[]>;
  listMembers(budgetId: string): Promise<MemberDTO[]>;
  updateIdentity(
    budgetId: string,
    patch: { name?: string; defaultCurrency?: string },
    actorUserId: string,
  ): Promise<void>;
  hasTransactions(budgetId: string): Promise<boolean>;
}

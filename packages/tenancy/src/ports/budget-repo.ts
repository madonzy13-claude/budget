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
    patch: {
      name?: string;
      defaultCurrency?: string;
      reservesEnabled?: boolean;
      cushionEnabled?: boolean;
      investmentsEnabled?: boolean;
      overviewEnabled?: boolean;
    },
    actorUserId: string,
  ): Promise<void>;
  hasTransactions(budgetId: string): Promise<boolean>;
  /**
   * Add `userId` to `budgetId` as a member (default role: 'member').
   * Idempotent — re-running with the same pair is a no-op.
   * Used by share-link accept where the recipient cannot call Better
   * Auth's addMember (admin-gated) and we need to bypass that gate.
   */
  joinAsMember(
    budgetId: string,
    userId: string,
    role?: "owner" | "member",
  ): Promise<void>;
  /**
   * Remove `userId` from `budgetId` membership. Throws `Error("last_owner")`
   * if the user is the sole remaining owner — callers map that to 409.
   * Used by the Leave-budget flow where Better Auth's leaveOrganization
   * is unusable from the request context (requires session headers wiring
   * the route layer doesn't carry forward cleanly).
   */
  leaveAsMember(budgetId: string, userId: string): Promise<void>;
  /** Soft-delete: sets archived_at = now(). One-way in v1.1 — no unarchive. */
  archive(
    budgetId: string,
    actorUserId: string,
  ): Promise<{ archivedAt: string }>;
  /** Hard-delete: removes the row (and cascades to child tables). */
  hardDelete(budgetId: string, actorUserId: string): Promise<void>;
}

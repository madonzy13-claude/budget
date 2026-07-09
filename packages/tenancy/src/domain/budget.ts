/**
 * budget.ts — Budget aggregate root (renamed from workspace.ts in Plan 01-02)
 * Domain entity: no Drizzle imports (dep-cruiser enforced).
 */
import { ok, err, type Result } from "@budget/shared-kernel";
import type { BudgetKind } from "../contracts/api";

export class Budget {
  constructor(
    public readonly id: string,
    public readonly slug: string,
    public name: string,
    public readonly kind: BudgetKind,
    public readonly default_currency: string, // readonly enforces D-04
    public readonly ownerUserId: string,
    public memberCount: number,
    public readonly createdAt: Date,
    // D-03: dual-storage cushion mode (boolean for cheap reads; SCD-2 in budget_mode_history)
    public cushionModeEnabled: boolean = false,
  ) {}

  // kind-removal: any budget can accept members. Private-vs-shared is a
  // display derivation from member_count, not an invite gate. Kept as a method
  // (callers unchanged) but now unconditionally allows.
  canAcceptMember(): Result<void, Error> {
    return ok(undefined);
  }

  canBeLeftBy(userId: string, allOwnerIds: string[]): Result<void, Error> {
    const isOwner = userId === this.ownerUserId || allOwnerIds.includes(userId);
    if (isOwner && allOwnerIds.length === 1) {
      return err(
        new Error(
          "Cannot leave as last owner — transfer ownership first (TENT-05)",
        ),
      );
    }
    return ok(undefined);
  }
}

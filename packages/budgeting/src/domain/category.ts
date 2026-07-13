/**
 * category.ts — Category aggregate root
 * Domain entity: no Drizzle imports (dep-cruiser enforced).
 * One-level grouping enforced via canBeChild() (BDGT-02).
 * Note: CategoryScope dropped in v1.1 (D-13); budget-level visibility replaces per-category scope.
 */
import { ok, err, type Result } from "@budget/shared-kernel";

export class Category {
  constructor(
    public readonly id: string,
    public readonly tenantId: string,
    public name: string,
    public readonly parentId: string | null,
    public archivedAt: Date | null,
    public readonly createdAt: Date,
    public readonly actorUserId: string,
    // 260613-v1p: per-category color key (one of the 8 palette keys) or null.
    // Mutable so editCategory can recolor; drives the UI accent bar only.
    public colorKey: string | null = null,
    // r33: THE smart Investments category. isInvestment marks the single
    // non-deletable, reserve-excluded category; investmentLimitMode is
    // 'manual' | 'smart' (null for normal categories). Drives the grid's
    // green "overinvested" label + the smart-limit compute in the summary.
    public readonly isInvestment: boolean = false,
    public investmentLimitMode: string | null = null,
    // Persisted cushion configuration (mig 0059); null = inferred.
    public cushionMode: string | null = null,
  ) {}

  /** Set or clear the category color (260613-v1p). null clears it (→ no bar). */
  recolor(colorKey: string | null): void {
    this.colorKey = colorKey;
  }

  /** r33: switch the Investments limit between user-typed and computed. */
  setInvestmentLimitMode(mode: "manual" | "smart"): void {
    this.investmentLimitMode = mode;
  }

  /** mig 0059: persist the chosen cushion mode. null clears it (→ inferred). */
  setCushionMode(mode: string | null): void {
    this.cushionMode = mode;
  }

  isRoot(): boolean {
    return this.parentId === null;
  }

  isArchived(): boolean {
    return this.archivedAt !== null;
  }

  /**
   * Validates that this category CAN become a child of the given parent.
   * The parent must be a root (no parent itself) to enforce one-level grouping.
   */
  canBeChild(parent: Category): Result<void, Error> {
    if (!parent.isRoot()) {
      return err(
        new Error(
          `Categories support only one level of grouping. Parent "${parent.name}" is already a child category.`,
        ),
      );
    }
    return ok(undefined);
  }

  archive(): Result<void, Error> {
    if (this.isArchived()) {
      return err(new Error("Category already archived"));
    }
    this.archivedAt = new Date();
    return ok(undefined);
  }

  rename(newName: string): Result<void, Error> {
    if (this.isArchived()) {
      return err(new Error("Cannot rename an archived category"));
    }
    if (!newName.trim()) {
      return err(new Error("Category name cannot be blank"));
    }
    this.name = newName.trim();
    return ok(undefined);
  }
}

// Backward-compat type export — removed from domain, kept for Plan 01-03 route layer migration
/** @deprecated CategoryScope dropped in v1.1 */
export type CategoryScope = "PERSONAL" | "SHARED";

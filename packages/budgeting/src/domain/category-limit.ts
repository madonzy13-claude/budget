/**
 * category-limit.ts — CategoryLimit value object (SCD-2 effective-dated)
 * Domain entity: no Drizzle imports.
 * D-04-b: effective_from = first_day_of_current_month for mid-month edits.
 */
import type { Money } from "@budget/shared-kernel";

export class CategoryLimit {
  constructor(
    public readonly id: string,
    public readonly tenantId: string,
    public readonly categoryId: string,
    public readonly normal: Money,
    public readonly cushion: Money,
    public readonly effectiveFrom: string, // ISO date string YYYY-MM-DD
    public readonly effectiveTo: string | null, // null = open/current
    public readonly actorUserId: string,
    public readonly createdAt: Date,
  ) {}

  isOpen(): boolean {
    return this.effectiveTo === null;
  }

  /**
   * Returns true if this limit is valid at the given report date (ISO string YYYY-MM-DD).
   */
  isActiveAt(reportDate: string): boolean {
    if (this.effectiveFrom > reportDate) return false;
    if (this.effectiveTo !== null && this.effectiveTo < reportDate) return false;
    return true;
  }
}

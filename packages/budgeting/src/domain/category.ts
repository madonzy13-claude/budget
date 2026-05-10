/**
 * category.ts — Category aggregate root
 * Domain entity: no Drizzle imports (dep-cruiser enforced).
 * One-level grouping enforced via canBeChild() (BDGT-02).
 */
import { ok, err, type Result } from "@budget/shared-kernel";

export type CategoryScope = "PERSONAL" | "SHARED";

export class Category {
  constructor(
    public readonly id: string,
    public readonly tenantId: string,
    public name: string,
    public readonly parentId: string | null,
    public readonly scope: CategoryScope,
    public archivedAt: Date | null,
    public readonly createdAt: Date,
    public readonly actorUserId: string,
  ) {}

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

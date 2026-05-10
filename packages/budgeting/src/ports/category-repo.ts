/**
 * category-repo.ts — CategoryRepo port interface
 * Implemented by DrizzleCategoryRepo in adapters/persistence.
 */
import type { Category } from "../domain/category";

export interface CategoryRepo {
  create(category: Category): Promise<void>;
  findById(tenantId: string, id: string): Promise<Category | null>;
  list(tenantId: string, includeArchived: boolean): Promise<Category[]>;
  archive(
    tenantId: string,
    categoryId: string,
    actorUserId: string,
  ): Promise<void>;
  rename(
    tenantId: string,
    categoryId: string,
    newName: string,
    actorUserId: string,
  ): Promise<void>;
}

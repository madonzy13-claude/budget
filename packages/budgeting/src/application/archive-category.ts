/**
 * archive-category.ts — Application use case: archive a category.
 *
 * UAT-PH5-T3-54: when archiving a category that holds a non-zero
 * `reserve_actual_cents`, the released amount is redistributed to underfunded
 * siblings in sort_index ASC order (same behavior as exclude). Remainder is
 * left as wallet overflow for the user to act on manually.
 */
import { ok, err, type Result } from "@budget/shared-kernel";
import type { CategoryRepo } from "../ports/category-repo";
import type { CategoriesRepo } from "../ports/categories-repo";
import type { ReserveBalanceRepo } from "../ports/reserve-balance-repo";
import type { CategoryDto } from "../contracts/api";
import { applyExclude, type ReserveRow } from "../domain/reserve-allocator";

export interface ArchiveCategoryDeps {
  repo: CategoryRepo;
  /** UAT-PH5-T3-54: optional — when provided, archives release stored actual to siblings. */
  categoriesRepo?: CategoriesRepo;
  reserveBalanceRepo?: ReserveBalanceRepo;
}

export function archiveCategory(deps: ArchiveCategoryDeps) {
  return async (input: {
    tenantId: string;
    categoryId: string;
    actorUserId: string;
  }): Promise<Result<CategoryDto, Error>> => {
    const category = await deps.repo.findById(input.tenantId, input.categoryId);
    if (!category) {
      return err(new Error(`Category ${input.categoryId} not found`));
    }

    const result = category.archive();
    if (result.isErr()) return err(result.error);

    try {
      // UAT-PH5-T3-54: release stored actual before archiving, when the
      // category has a non-zero reserve and the new ports are wired in.
      if (deps.categoriesRepo && deps.reserveBalanceRepo) {
        const cat = await deps.categoriesRepo.findById(
          input.tenantId,
          input.categoryId,
        );
        if (
          cat &&
          (cat.reserveActualCents ?? 0n) > 0n &&
          !cat.reserveExcluded
        ) {
          const asOf = new Date();
          const [activeMap, excludedMap, allCats] = await Promise.all([
            deps.reserveBalanceRepo.getForBudget(
              input.tenantId,
              input.tenantId,
              asOf,
            ),
            deps.reserveBalanceRepo.getExcludedForBudget(
              input.tenantId,
              input.tenantId,
              asOf,
            ),
            deps.categoriesRepo.list(input.tenantId),
          ]);

          const rows: ReserveRow[] = allCats.map((c) => {
            const m = c.reserveExcluded
              ? excludedMap.get(c.id)
              : activeMap.get(c.id);
            const expectedCents = m
              ? BigInt(m.amount.times("100").toFixed(0))
              : 0n;
            return {
              categoryId: c.id,
              sortIndex: c.sortIndex ?? 0,
              reserveExcluded: c.reserveExcluded,
              expectedCents,
              actualCents: c.reserveActualCents ?? 0n,
            };
          });

          const alloc = applyExclude(rows, input.categoryId);
          const updates = new Map<string, bigint>();
          for (const after of alloc.rows) {
            const before = rows.find((r) => r.categoryId === after.categoryId)!;
            if (before.actualCents !== after.actualCents) {
              updates.set(after.categoryId, after.actualCents);
            }
          }
          if (updates.size > 0) {
            await deps.categoriesRepo.setReserveActualMany(
              input.tenantId,
              updates,
              input.actorUserId,
            );
          }
        }
      }

      await deps.repo.archive(
        input.tenantId,
        input.categoryId,
        input.actorUserId,
      );
    } catch (e) {
      return err(e as Error);
    }

    return ok({
      id: category.id,
      name: category.name,
      parentId: category.parentId,
      archivedAt: category.archivedAt!.toISOString(),
      createdAt: category.createdAt.toISOString(),
    });
  };
}

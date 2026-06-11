/**
 * unarchive-category.ts — Application use case: unarchive (revert) a category.
 *
 * Lifecycle:
 *   SAME-MONTH revert (archived_from month === current month):
 *     Just clears the archive flags. Limits unchanged.
 *
 *   MONTHS-LATER revert (archived_from is in a past month):
 *     1. Reads the limit the category had at archive time.
 *     2. Zeroes every month STRICTLY BETWEEN the archive month and current month.
 *     3. Sets the current month's limit to the archive-month limit
 *        (so reserves don't grow while the category was absent).
 *     4. Clears archive flags (unarchive).
 *
 * Archive columns stored in DB: archived_from (date, "keep history" mode) and
 * archived_at (timestamptz, "hide all" mode). The revert use case only handles
 * "keep history" columns (archived_from set, archived_at NULL) — the ones shown
 * as grey read-only columns in the UI grid.
 */
import { ok, err, type Result } from "@budget/shared-kernel";
import type { CategoryRepo } from "../ports/category-repo";
import type { CategoryLimitRepo } from "../ports/category-limit-repo";
import type { CategoryDto } from "../contracts/api";
import type { TaskRepo, TenantTx } from "../ports/task-repo";
import {
  recomputeReserveTopupTask,
  type RecomputeReserveTopupTaskDeps,
} from "./recompute-reserve-topup-task";
import { withTenantTx } from "@budget/platform";
import { TenantId, UserId } from "@budget/shared-kernel";

export interface UnarchiveCategoryDeps {
  repo: CategoryRepo;
  limitRepo: CategoryLimitRepo;
  /** Optional task deps (same pattern as archiveCategory). When wired, RESERVE_TOPUP
   *  is recomputed after unarchive so the revived category's R re-enters internal. */
  taskRepo?: TaskRepo;
  reservePositions?: RecomputeReserveTopupTaskDeps["reservePositions"];
  budgetCurrencyOf?: (tenantId: string) => Promise<string>;
  isReservesEnabled?: (tenantId: string) => Promise<boolean>;
}

/** Add one calendar month to a YYYY-MM-01 string (UTC). */
function addOneMonth(monthStart: string): string {
  const d = new Date(monthStart + "T00:00:00Z");
  const next = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1));
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

export function unarchiveCategory(deps: UnarchiveCategoryDeps) {
  return async (input: {
    tenantId: string;
    categoryId: string;
    actorUserId: string;
  }): Promise<Result<CategoryDto, Error>> => {
    const category = await deps.repo.findById(input.tenantId, input.categoryId);
    if (!category) {
      return err(new Error(`Category ${input.categoryId} not found`));
    }

    // Category must have archived_from set (keep-history column) or archived_at set.
    const archivedFrom = (category as any).archivedFrom as string | null;
    if (!archivedFrom && !category.archivedAt) {
      return err(new Error("Category not archived"));
    }

    // If archived_at is set (hide-all mode) treat as same-month for simplicity
    // (the grid doesn't show these as revertable, but handle gracefully).
    const archiveMonthStart = archivedFrom
      ? archivedFrom.substring(0, 7) + "-01"
      : null;

    const now = new Date();
    const currentMonthStart = `${now.getUTCFullYear()}-${String(
      now.getUTCMonth() + 1,
    ).padStart(2, "0")}-01`;

    try {
      const isSameMonth =
        !archiveMonthStart || archiveMonthStart === currentMonthStart;

      if (!isSameMonth && archiveMonthStart) {
        // Read limits at archive month
        const archiveLimit = await deps.limitRepo.getEffectiveLimit(
          input.tenantId,
          input.categoryId,
          archiveMonthStart,
        );

        // Fall back to zero if no limit was set
        const budgetCurrency = deps.budgetCurrencyOf
          ? await deps.budgetCurrencyOf(input.tenantId)
          : "EUR";
        const normalAmount = archiveLimit?.normalAmount ?? "0";
        const normalCurrency = archiveLimit?.normalCurrency ?? budgetCurrency;
        const cushionAmount = archiveLimit?.cushionAmount ?? "0";
        const cushionCurrency = archiveLimit?.cushionCurrency ?? budgetCurrency;

        // Zero every month strictly between archiveMonth and currentMonth
        let cursor = addOneMonth(archiveMonthStart);
        while (cursor < currentMonthStart) {
          await deps.limitRepo.setLimitForMonth({
            tenantId: input.tenantId,
            categoryId: input.categoryId,
            monthStart: cursor,
            normalAmount: "0",
            normalCurrency,
            cushionAmount: "0",
            cushionCurrency,
            actorUserId: input.actorUserId,
            carryForward: false,
          });
          cursor = addOneMonth(cursor);
        }

        // Set current month to archive-month limits
        await deps.limitRepo.setLimitForMonth({
          tenantId: input.tenantId,
          categoryId: input.categoryId,
          monthStart: currentMonthStart,
          normalAmount,
          normalCurrency,
          cushionAmount,
          cushionCurrency,
          actorUserId: input.actorUserId,
          carryForward: false,
        });
      }

      // Clear archive flags
      await deps.repo.unarchive(
        input.tenantId,
        input.categoryId,
        input.actorUserId,
      );

      // Recompute RESERVE_TOPUP: the revived category's R re-enters internal.
      if (
        deps.taskRepo &&
        deps.reservePositions &&
        deps.budgetCurrencyOf &&
        deps.isReservesEnabled
      ) {
        const taskRepo = deps.taskRepo;
        const reservePositions = deps.reservePositions;
        const budgetCurrencyOf = deps.budgetCurrencyOf;
        const isReservesEnabled = deps.isReservesEnabled;
        await withTenantTx(
          TenantId(input.tenantId),
          UserId(input.actorUserId),
          async (tx) => {
            await recomputeReserveTopupTask(
              tx as unknown as TenantTx,
              { tenantId: input.tenantId, budgetId: input.tenantId },
              {
                taskRepo,
                reservePositions,
                budgetCurrencyOf,
                isReservesEnabled,
              },
            );
          },
        );
      }
    } catch (e) {
      return err(e as Error);
    }

    return ok({
      id: category.id,
      name: category.name,
      parentId: category.parentId,
      archivedAt: null,
      createdAt: category.createdAt.toISOString(),
    });
  };
}

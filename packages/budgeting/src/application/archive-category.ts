/**
 * archive-category.ts — Application use case: archive a category.
 *
 * Phase 05 reserve rewrite (05-REWRITE-SPEC.md, 05-13 — decision J):
 *   Archiving a category drops its reserve from internal GOING FORWARD. The
 *   orchestrator (get-reserve-positions) already excludes archived categories
 *   from internal via categoryFlags — so this use case just archives per mode;
 *   there is NO release-to-siblings (the OLD greedy exclude-style spill is GONE,
 *   categories are independent).
 *
 *   mode "all"            → archived_at set + hideAll (hidden everywhere).
 *   mode "current_future" → archived_from = current month (visible in prior
 *                           closed months read-only, hidden current + future).
 *
 * Either way the category's R leaves internal → surplus recalcs → RESERVE_TOPUP
 * is recomputed when the task deps are wired (otherwise the hourly sweep catches
 * it). Plan 05-13 / RSRV-REWRITE-USECASES.
 */
import { ok, err, type Result } from "@budget/shared-kernel";
import { withTenantTx } from "@budget/platform";
import { TenantId, UserId } from "@budget/shared-kernel";
import type { CategoryRepo } from "../ports/category-repo";
import type { CategoryDto } from "../contracts/api";
import type { TaskRepo, TenantTx } from "../ports/task-repo";
import {
  recomputeReserveTopupTask,
  type RecomputeReserveTopupTaskDeps,
} from "./recompute-reserve-topup-task";

export interface ArchiveCategoryDeps {
  repo: CategoryRepo;
  /** Phase 7 / 05-13: when wired, recompute RESERVE_TOPUP after archive (the
   *  archived category's reserve leaves internal → surplus moves). Optional so
   *  legacy callers keep compiling; otherwise the hourly sweep catches it. */
  taskRepo?: TaskRepo;
  reservePositions?: RecomputeReserveTopupTaskDeps["reservePositions"];
  budgetCurrencyOf?: (tenantId: string) => Promise<string>;
  isReservesEnabled?: (tenantId: string) => Promise<boolean>;
}

export function archiveCategory(deps: ArchiveCategoryDeps) {
  return async (input: {
    tenantId: string;
    categoryId: string;
    actorUserId: string;
    /** "all" (default) hides the category in every month; "current_future"
     *  keeps history — visible in the months it had activity, hidden from the
     *  current month onward. */
    mode?: "all" | "current_future";
  }): Promise<Result<CategoryDto, Error>> => {
    const category = await deps.repo.findById(input.tenantId, input.categoryId);
    if (!category) {
      return err(new Error(`Category ${input.categoryId} not found`));
    }
    if (category.isArchived()) {
      return err(new Error("Category already archived"));
    }

    const keepHistory = input.mode === "current_future";
    const now = new Date();
    const currentMonthStart = `${now.getUTCFullYear()}-${String(
      now.getUTCMonth() + 1,
    ).padStart(2, "0")}-01`;

    try {
      // Decision J: just archive per mode. The orchestrator excludes archived
      // categories from internal automatically — NO sibling refill/spill.
      await deps.repo.archive(
        input.tenantId,
        input.categoryId,
        input.actorUserId,
        keepHistory
          ? { archivedFrom: currentMonthStart, hideAll: false }
          : { hideAll: true },
      );

      // RESERVE_TOPUP recompute: the archived category's R left internal, so the
      // surplus shifted. A2 fallback own-tx (archive owns its inner tx).
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
              { taskRepo, reservePositions, budgetCurrencyOf, isReservesEnabled },
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
      // "keep history" leaves archived_at NULL (still visible in past months).
      archivedAt: keepHistory ? null : now.toISOString(),
      createdAt: category.createdAt.toISOString(),
      colorKey: category.colorKey ?? null,
    });
  };
}

/**
 * adjust-category-reserve.ts — Application use case: set a category's reserve to
 * a target value (decision E — append a SIGNED delta).
 *
 * Phase 05 reserve rewrite (05-REWRITE-SPEC.md, 05-13). The OLD usage-inflated
 * base + greedy allocator + stored-actual bookkeeping is GONE. Reserve is
 * engine-derived (replay-on-read); the ONLY durable write is the append-only
 * adjustment delta:
 *
 *   currentR = positions.get(categoryId).reserveCents   (from the orchestrator)
 *   target   = input.expectedCents                       (X ≥ 0, integer cents)
 *   delta    = target − currentR                          (signed; 0 → no-op)
 *   append delta to category_reserve_adjustments  → replay resolves R to target
 *
 * The engine applies the delta against the running R via op 3 ("set reserve to
 * X"): a positive delta covers outstanding overspent first, then raises R; a
 * negative delta lowers R (decision E / I). The use case does not model that —
 * it just records the signed delta and re-reads the engine for the response.
 *
 * Guards (unchanged):
 *   1. reserves_disabled → "reserves_disabled"
 *   2. category not found (or cross-tenant via RLS) → "not_found"
 *   3. category.reserveExcluded = true → "category_excluded"
 *
 * Plan 05-13 / RSRV-REWRITE-USECASES. (No allocator, no VIEW, no actual.)
 */
import { ok, err, type Result } from "@budget/shared-kernel";
import { withTenantTx } from "@budget/platform";
import { TenantId, UserId } from "@budget/shared-kernel";
import type { CategoryReserveAdjustmentsRepo } from "../ports/category-reserve-adjustments-repo";
import type { CategoriesRepo } from "../ports/categories-repo";
import { buildReservesSummaryDto } from "./reserves-summary-builder";
import { type ReservesSummaryDto } from "./get-reserves-summary";
import type { TaskRepo, TenantTx } from "../ports/task-repo";
import {
  recomputeReserveTopupTask,
  type RecomputeReserveTopupTaskDeps,
} from "./recompute-reserve-topup-task";

export interface AdjustCategoryReserveDeps {
  adjustmentsRepo: CategoryReserveAdjustmentsRepo;
  categoriesRepo: CategoriesRepo;
  /** Replay orchestrator (05-12). Source of truth for currentR + the response
   *  summary (one reserve per category + internal/userDefined/surplus). */
  reservePositions: RecomputeReserveTopupTaskDeps["reservePositions"];
  isReservesEnabled: (tenantId: string) => Promise<boolean>;
  budgetCurrencyOf: (tenantId: string) => Promise<string>;
  /** Phase 7 (D-PH7-04): when provided, recompute the RESERVE_TOPUP task in a
   *  follow-up tx after the adjustment lands. Optional so legacy callers keep
   *  compiling; production boot wires it in factory.ts. */
  taskRepo?: TaskRepo;
}

export interface AdjustCategoryReserveInput {
  tenantId: string;
  budgetId: string;
  categoryId: string;
  /** Target reserve value, non-negative integer cents. */
  expectedCents: number;
  note?: string;
  actorUserId: string;
}

export interface AdjustCategoryReserveResult {
  categoryId: string;
  /** Engine-derived reserve after this adjustment. Equals the target UNLESS the
   *  raise covered this month's overspend, in which case it is `target − cover`
   *  (the client diffs this against `expectedCents` to drive the cover reveal). */
  reserveCents: string;
  /** Delta appended to the ledger (0 = no-op). */
  deltaCents: string;
  /** Perf: full new summary so the client skips a refetch. */
  summary: ReservesSummaryDto;
}

/** Build the engine-derived reserves summary for the response (post-write). */
async function buildSummary(
  deps: AdjustCategoryReserveDeps,
  tenantId: string,
  budgetId: string,
): Promise<Result<ReservesSummaryDto, Error>> {
  const [posR, categories, budgetCurrency] = await Promise.all([
    deps.reservePositions({ tenantId, budgetId }),
    deps.categoriesRepo.list(tenantId),
    deps.budgetCurrencyOf(tenantId),
  ]);
  if (posR.isErr()) return err(posR.error);
  return ok(
    buildReservesSummaryDto({
      positions: posR.value,
      categories: categories.map((c) => ({
        id: c.id,
        name: c.name,
        reserveExcluded: c.reserveExcluded ?? false,
      })),
      budgetCurrency,
      disabled: false,
    }),
  );
}

export function adjustCategoryReserve(deps: AdjustCategoryReserveDeps) {
  return async (
    input: AdjustCategoryReserveInput,
  ): Promise<Result<AdjustCategoryReserveResult, Error>> => {
    try {
      const enabled = await deps.isReservesEnabled(input.tenantId);
      if (!enabled) return err(new Error("reserves_disabled"));

      const targetCat = await deps.categoriesRepo.findById(
        input.tenantId,
        input.categoryId,
      );
      if (!targetCat) return err(new Error("not_found"));
      if (targetCat.reserveExcluded) return err(new Error("category_excluded"));

      // currentR — the category's CURRENT available reserve, derived by the
      // engine from its ordered event history. NOT a client-supplied base
      // (T-0513-01): the delta is computed server-side against this value.
      const preR = await deps.reservePositions({
        tenantId: input.tenantId,
        budgetId: input.budgetId,
      });
      if (preR.isErr()) return err(preR.error);
      const currentR =
        preR.value.positions.get(input.categoryId)?.reserveCents ?? 0n;

      const target = BigInt(input.expectedCents);
      const delta = target - currentR;

      // Append the SIGNED delta. delta === 0n → no-op (no ledger row).
      if (delta !== 0n) {
        await deps.adjustmentsRepo.create({
          tenantId: input.tenantId,
          categoryId: input.categoryId,
          deltaCents: delta,
          note: input.note ?? null,
          actorUserId: input.actorUserId,
        });
      }

      // Build the response summary by re-reading the engine AFTER the write so
      // the client sees R == target (+ recomputed internal/surplus).
      const summaryR = await buildSummary(deps, input.tenantId, input.budgetId);
      if (summaryR.isErr()) return err(summaryR.error);
      const summary = summaryR.value;

      // Phase 7 (D-PH7-04): RESERVE_TOPUP recompute hook. Adjusting any
      // category's reserve shifts internal (ΣR) by `delta`, so the surplus
      // banner must refresh. When delta === 0n the recompute is still correct
      // (surplus unchanged → re-emit-as-no-op or resolve-as-no-op).
      //
      // A2 fallback: adjustmentsRepo owns its inner tx; we open a separate
      // withTenantTx for the recompute. Idempotency keeps the system convergent
      // across the race window.
      if (deps.taskRepo) {
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
              { tenantId: input.tenantId, budgetId: input.budgetId },
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

      // The ACTUAL post-adjust reserve is the engine-derived value, NOT the
      // typed target: when the raise covered this month's overspend, the
      // settled reserve is `target − cover` (the summary row holds it). The
      // client diffs `expectedCents − reserveCents` to detect that cover and
      // show the count-down reveal, so return the real value here.
      const settledReserveCents =
        summary.rows.find((r) => r.categoryId === input.categoryId)
          ?.reserveCents ?? target.toString();

      return ok({
        categoryId: input.categoryId,
        reserveCents: settledReserveCents,
        deltaCents: delta.toString(),
        summary,
      });
    } catch (e) {
      return err(e as Error);
    }
  };
}

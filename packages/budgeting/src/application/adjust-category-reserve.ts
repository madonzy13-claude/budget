/**
 * adjust-category-reserve.ts — Application use case: set category's expected reserve.
 *
 * UAT-PH5-T3-54 (architecture pivot): input is the TARGET expected value
 * (cents, non-negative), not a signed delta. Server computes:
 *   delta = newExpectedCents - currentExpectedCents
 * and appends `delta` to the append-only `category_reserve_adjustments` ledger
 * so the existing `category_reserve_balance` VIEW resolves to the new target.
 *
 * Then mutates `categories.reserve_actual_cents` for ALL affected rows via the
 * pure-function allocator (applyExpectedChange):
 *   - Raise above current actual → top up from free pool (bounded).
 *   - Lower below current actual → clamp + spill freed cents to underfunded
 *     siblings in sort_index ASC order. Remainder = overflow (wallet banner).
 *
 * Guards:
 *   1. reserves_disabled → "reserves_disabled"
 *   2. category not found (or cross-tenant via RLS) → "not_found"
 *   3. category.reserveExcluded = true → "category_excluded"
 *
 * Plan 05-03 / RSRV-01, RSRV-02. Allocator: domain/reserve-allocator.ts.
 */
import { ok, err, type Result } from "@budget/shared-kernel";
import { withTenantTx } from "@budget/platform";
import { TenantId, UserId } from "@budget/shared-kernel";
import type { CategoryReserveAdjustmentsRepo } from "../ports/category-reserve-adjustments-repo";
import type { CategoriesRepo } from "../ports/categories-repo";
import type { ReserveBalanceRepo } from "../ports/reserve-balance-repo";
import type { ReservesSummaryRepo } from "../ports/reserves-summary-repo";
import {
  applyExpectedChange,
  type ReserveRow,
} from "../domain/reserve-allocator";
import {
  getReservesSummary,
  type ReservesSummaryDto,
} from "./get-reserves-summary";
import type { TaskRepo, TenantTx } from "../ports/task-repo";
import {
  recomputeReserveTopupTask,
  type RecomputeReserveTopupTaskDeps,
} from "./recompute-reserve-topup-task";

export interface AdjustCategoryReserveDeps {
  adjustmentsRepo: CategoryReserveAdjustmentsRepo;
  categoriesRepo: CategoriesRepo;
  reserveBalanceRepo: ReserveBalanceRepo;
  reservesSummaryRepo: ReservesSummaryRepo;
  isReservesEnabled: (tenantId: string) => Promise<boolean>;
  budgetCurrencyOf: (tenantId: string) => Promise<string>;
  /** Phase 7 (D-PH7-04): when provided, recompute the RESERVE_TOPUP task
   *  in a follow-up tx after the adjustment lands. Optional so legacy
   *  callers keep compiling; production boot wires it in factory.ts. */
  taskRepo?: TaskRepo;
  /** Replay orchestrator (05-12). Required: getReservesSummary + the
   *  RESERVE_TOPUP recompute both derive reserve from it. */
  reservePositions: RecomputeReserveTopupTaskDeps["reservePositions"];
}

export interface AdjustCategoryReserveInput {
  tenantId: string;
  budgetId: string;
  categoryId: string;
  /** Target expected value, non-negative integer cents. */
  expectedCents: number;
  note?: string;
  actorUserId: string;
}

export interface AdjustCategoryReserveResult {
  categoryId: string;
  /** Final expected value after this adjustment. */
  expectedCents: string;
  /** Final actual value after pool clamp. */
  actualCents: string;
  /** Delta written to ledger (0 = no-op). */
  deltaCents: string;
  /** UAT-PH5-T3-54 perf: full new summary so client skips refetch. */
  summary: ReservesSummaryDto;
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

      const asOf = new Date();
      const [activeMap, excludedMap, allCats, walletPool] = await Promise.all([
        deps.reserveBalanceRepo.getForBudget(
          input.budgetId,
          input.tenantId,
          asOf,
        ),
        deps.reserveBalanceRepo.getExcludedForBudget(
          input.budgetId,
          input.tenantId,
          asOf,
        ),
        deps.categoriesRepo.list(input.tenantId),
        deps.reservesSummaryRepo.sumReserveWalletAmounts(input.tenantId),
      ]);

      const rows: ReserveRow[] = allCats.map((c) => {
        const m = c.reserveExcluded
          ? excludedMap.get(c.id)
          : activeMap.get(c.id);
        const expectedCents = m ? BigInt(m.amount.times("100").toFixed(0)) : 0n;
        return {
          categoryId: c.id,
          sortIndex: c.sortIndex ?? 0,
          reserveExcluded: c.reserveExcluded,
          expectedCents,
          actualCents: c.reserveActualCents ?? 0n,
        };
      });

      const thisRow = rows.find((r) => r.categoryId === input.categoryId);
      if (!thisRow) return err(new Error("not_found"));

      // 05-12 NOTE: the sticky-display "base = target + usage" correction (which
      // read the OLD position fields overspendCents/fundedCents) is removed here;
      // the engine model derives R from the signed adjustment delta directly.
      // Recomputing the delta against the engine's running R is 05-13's rewrite
      // of this use case — for now append the delta against the legacy VIEW base
      // so the write keeps landing, and return the engine-derived summary below.
      const targetDisplayed = BigInt(input.expectedCents);
      const newBase = targetDisplayed;
      const delta = newBase - thisRow.expectedCents;

      // Append delta to the ledger so the VIEW base resolves to newBase, i.e.
      // displayed (newBase − usage) === targetDisplayed.
      if (delta !== 0n) {
        await deps.adjustmentsRepo.create({
          tenantId: input.tenantId,
          categoryId: input.categoryId,
          deltaCents: delta,
          note: input.note ?? null,
          actorUserId: input.actorUserId,
        });
      }

      // Fund the REAL reserve (actual) toward the DISPLAYED target the user
      // typed (targetDisplayed), NOT the usage-inflated base (newBase). The base
      // is inflated by past usage purely to keep the displayed value sticky;
      // feeding it to the allocator would over-fund real (e.g. set displayed €70
      // with €50 used → base €120 → allocator grabs the whole wallet). Real must
      // follow the amount the user set, capped at the wallet pool; the leftover
      // stays unallocated (surplus). Usage still depletes the DISPLAYED expected
      // on top of this (handled by the position calculator / expectedOverride).
      const allocResult = applyExpectedChange(
        rows,
        walletPool,
        input.categoryId,
        targetDisplayed,
      );
      const updates = new Map<string, bigint>();
      for (const after of allocResult.rows) {
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

      const finalRow = allocResult.rows.find(
        (r) => r.categoryId === input.categoryId,
      )!;

      // 05-12: the post-mutation summary is engine-derived now. After appending
      // the delta to the ledger above, read it back through the replay
      // orchestrator so the response matches a fresh GET /reserves (one reserve
      // per category + internal/userDefined/surplus). The legacy allocator
      // bookkeeping above (reserve_actual_cents writes) no longer feeds the DTO;
      // its full removal + delta-vs-engine-R re-derivation is 05-13.
      const summaryR = await getReservesSummary({
        categoriesRepo: deps.categoriesRepo,
        budgetCurrencyOf: deps.budgetCurrencyOf,
        isReservesEnabled: deps.isReservesEnabled,
        reservePositions: deps.reservePositions,
      })({ tenantId: input.tenantId, budgetId: input.budgetId });
      if (summaryR.isErr()) return err(summaryR.error);
      const summary = summaryR.value;

      // Phase 7 (D-PH7-04): RESERVE_TOPUP recompute hook.
      // Reserve adjustments always touch the reserve side of the equation
      // (no wallet-type gate needed — adjusting any category's expected
      // reserve shifts Σ(category reserves) by `delta`). When delta === 0n
      // the recompute is still correct: mismatch unchanged, helper either
      // re-emits-as-no-op or resolves-as-no-op.
      //
      // A2 fallback: adjustmentsRepo / categoriesRepo own their inner txs;
      // we open a separate withTenantTx for the recompute. Idempotency
      // contract keeps the system convergent across the race window.
      if (deps.taskRepo) {
        const taskRepo = deps.taskRepo;
        const categoriesRepo = deps.categoriesRepo;
        const budgetCurrencyOf = deps.budgetCurrencyOf;
        const isReservesEnabled = deps.isReservesEnabled;
        const reservePositions = deps.reservePositions;
        await withTenantTx(
          TenantId(input.tenantId),
          UserId(input.actorUserId),
          async (tx) => {
            await recomputeReserveTopupTask(
              tx as unknown as TenantTx,
              { tenantId: input.tenantId, budgetId: input.budgetId },
              {
                taskRepo,
                categoriesRepo,
                budgetCurrencyOf,
                isReservesEnabled,
                reservePositions,
              },
            );
          },
        );
      }

      return ok({
        categoryId: input.categoryId,
        // The DISPLAYED expected the user set (base − usage), not the raw base.
        expectedCents: targetDisplayed.toString(),
        actualCents: finalRow.actualCents.toString(),
        deltaCents: delta.toString(),
        summary,
      });
    } catch (e) {
      return err(e as Error);
    }
  };
}

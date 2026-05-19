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
import type { CategoryReserveAdjustmentsRepo } from "../ports/category-reserve-adjustments-repo";
import type { CategoriesRepo } from "../ports/categories-repo";
import type { ReserveBalanceRepo } from "../ports/reserve-balance-repo";
import type { ReservesSummaryRepo } from "../ports/reserves-summary-repo";
import {
  applyExpectedChange,
  type ReserveRow,
} from "../domain/reserve-allocator";

export interface AdjustCategoryReserveDeps {
  adjustmentsRepo: CategoryReserveAdjustmentsRepo;
  categoriesRepo: CategoriesRepo;
  reserveBalanceRepo: ReserveBalanceRepo;
  reservesSummaryRepo: ReservesSummaryRepo;
  isReservesEnabled: (tenantId: string) => Promise<boolean>;
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

      const newExpected = BigInt(input.expectedCents);
      const delta = newExpected - thisRow.expectedCents;

      // Append delta to the ledger so the VIEW resolves to newExpected.
      if (delta !== 0n) {
        await deps.adjustmentsRepo.create({
          tenantId: input.tenantId,
          categoryId: input.categoryId,
          deltaCents: delta,
          note: input.note ?? null,
          actorUserId: input.actorUserId,
        });
      }

      // Compute new actual snapshot and persist only changed rows.
      const allocResult = applyExpectedChange(
        rows,
        walletPool,
        input.categoryId,
        newExpected,
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
      return ok({
        categoryId: input.categoryId,
        expectedCents: finalRow.expectedCents.toString(),
        actualCents: finalRow.actualCents.toString(),
        deltaCents: delta.toString(),
      });
    } catch (e) {
      return err(e as Error);
    }
  };
}

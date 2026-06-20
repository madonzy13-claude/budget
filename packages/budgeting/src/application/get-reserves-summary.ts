/**
 * get-reserves-summary.ts — Read: per-category reserve summary (NEW shape).
 *
 * Phase 05 reserve rewrite (05-REWRITE-SPEC.md): the reserves tab reads ONE
 * engine-derived reserve per category (R) plus used (U) and overspent, with a
 * single budget-level surplus banner (userDefined − internal, +direction). This
 * use case is now a thin wrapper over the replay orchestrator
 * (get-reserve-positions) + the pure builder. The OLD stored-actual / wallet
 * share% / mismatch model is GONE.
 *
 *   reserves_enabled=false → disabled DTO (empty rows, internal/userDefined/
 *   surplus "0", direction NONE) — decision K display.
 *   else → reservePositions(tenant, budget) → buildReservesSummaryDto.
 *
 * Plan 05-12 (RSRV-REWRITE-REPLAY).
 */
import { ok, err, type Result } from "@budget/shared-kernel";
import type { CategoriesRepo } from "../ports/categories-repo";
import { buildReservesSummaryDto } from "./reserves-summary-builder";
import type { ReservePositionsResult } from "./get-reserve-positions";

export interface ReservesSummaryRow {
  categoryId: string;
  name: string;
  /** 260613-v1p: per-category color key (null = no color → no row accent bar). */
  colorKey: string | null;
  /** R — available reserve for this category (serialized cents). */
  reserveCents: string;
  /** U — reserve consumed by overspend (cumulative / ALL TIME, serialized cents). */
  usedCents: string;
  /** Reserve drawn in the open ('this') month only (serialized cents). */
  usedThisMonthCents: string;
  /** Σ per-month overspent for this category (serialized cents). */
  overspentCents: string;
}

export interface ReservesSummaryDto {
  rows: ReservesSummaryRow[];
  /** Excluded categories: name-only rows (reserve hidden). */
  excludedRows: ReservesSummaryRow[];
  totals: {
    /** Σ R over active categories (serialized cents). */
    internalCents: string;
    /** Σ RESERVE-wallet balances (serialized cents). */
    userDefinedCents: string;
    /** userDefined − internal (serialized cents). Replaces the old mismatch. */
    surplusCents: string;
    /** surplus<0 → TOPUP, surplus>0 → WITHDRAW, 0 → NONE. */
    direction: "TOPUP" | "WITHDRAW" | "NONE";
    /** Σ used reserve over ALL non-excluded categories incl. archived (ALL TIME). */
    usedCents: string;
    /** Same, but the open month only (THIS MONTH). */
    usedThisMonthCents: string;
    disabled: boolean;
    budgetCurrency: string;
  };
}

export interface GetReservesSummaryDeps {
  /** Replay orchestrator — owns wallet sum (userDefined) + engine-derived R/U. */
  reservePositions: (input: {
    tenantId: string;
    budgetId: string;
    month?: string;
  }) => Promise<Result<ReservePositionsResult, Error>>;
  categoriesRepo: CategoriesRepo;
  budgetCurrencyOf: (tenantId: string) => Promise<string>;
  isReservesEnabled: (tenantId: string) => Promise<boolean>;
}

/** Disabled DTO — reserves_enabled=false (decision K display). */
function disabledDto(budgetCurrency: string): ReservesSummaryDto {
  return {
    rows: [],
    excludedRows: [],
    totals: {
      internalCents: "0",
      userDefinedCents: "0",
      surplusCents: "0",
      direction: "NONE",
      usedCents: "0",
      usedThisMonthCents: "0",
      disabled: true,
      budgetCurrency,
    },
  };
}

export function getReservesSummary(deps: GetReservesSummaryDeps) {
  return async (input: {
    tenantId: string;
    budgetId: string;
  }): Promise<Result<ReservesSummaryDto, Error>> => {
    try {
      const [enabled, budgetCurrency] = await Promise.all([
        deps.isReservesEnabled(input.tenantId),
        deps.budgetCurrencyOf(input.tenantId),
      ]);

      if (!enabled) return ok(disabledDto(budgetCurrency));

      const [posResult, categories] = await Promise.all([
        deps.reservePositions({
          tenantId: input.tenantId,
          budgetId: input.budgetId,
        }),
        deps.categoriesRepo.list(input.tenantId),
      ]);
      if (posResult.isErr()) return err(posResult.error);

      return ok(
        buildReservesSummaryDto({
          positions: posResult.value,
          categories: categories.map((c) => ({
            id: c.id,
            name: c.name,
            reserveExcluded: c.reserveExcluded ?? false,
            colorKey: c.colorKey ?? null,
          })),
          budgetCurrency,
          disabled: false,
        }),
      );
    } catch (e) {
      return err(e as Error);
    }
  };
}

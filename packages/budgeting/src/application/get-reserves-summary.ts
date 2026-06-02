/**
 * get-reserves-summary.ts — Read: per-category reserve summary.
 *
 * UAT-PH5-T3-54 (architecture pivot):
 *   `actual` is a STORED value per category (`categories.reserve_actual_cents`).
 *   This use case never recomputes or redistributes actual on read — it returns
 *   the value persisted by previous mutation events (adjust / wallet edit /
 *   exclude). Walk-by-timestamp and sticky-allocation are GONE.
 *
 *   Share math is trivial:
 *     walletShareAmountCents = actualCents       (per category)
 *     walletSharePercent     = actual / Σ Active wallet share × 100
 *                              (null when Σ wallets = 0)
 *
 *   `mismatchCents` is the signed banner number:
 *     walletPool − Σ Active expected
 *     Positive  → "wallet has more than needed"
 *     Negative  → "wallet missing"
 *
 *   W-3: excludedRows show the FROZEN real expected; share always null;
 *   their stored actual is 0 (released on exclude).
 *
 *   D-PH5-R11 cascading hide: reserves_enabled=false → rows=[], excludedRows=[],
 *   disabled=true.
 *
 * Plan 05-03 / RSRV-01, RSRV-07.
 */
import { ok, err, type Result } from "@budget/shared-kernel";
import type { ReserveBalanceRepo } from "../ports/reserve-balance-repo";
import type { ReservesSummaryRepo } from "../ports/reserves-summary-repo";
import type { CategoriesRepo } from "../ports/categories-repo";
import { buildReservesSummaryDto } from "./reserves-summary-builder";
import type { ReservePosition } from "./get-reserve-positions";

export interface ReservesSummaryRow {
  categoryId: string;
  name: string;
  reserveBalanceCents: string;
  walletSharePercent: number | null;
  walletShareAmountCents: string | null;
}

export interface ReservesSummaryDto {
  rows: ReservesSummaryRow[];
  excludedRows: ReservesSummaryRow[];
  totals: {
    totalCategoryReservesCents: string;
    totalReserveWalletAmountCents: string;
    mismatchCents: string;
    disabled: boolean;
    budgetCurrency: string;
  };
}

export interface GetReservesSummaryDeps {
  reserveBalanceRepo: ReserveBalanceRepo;
  reservesSummaryRepo: ReservesSummaryRepo;
  categoriesRepo: CategoriesRepo;
  budgetCurrencyOf: (tenantId: string) => Promise<string>;
  isReservesEnabled: (tenantId: string) => Promise<boolean>;
  /**
   * Optional cumulative reserve-position calculator. When supplied, each row's
   * balance reflects the EXPECTED reserve after usage depletion (allocation −
   * cumulative usage) and the totals/mismatch follow suit — which is what
   * drives the RESERVE_TOPUP reconciliation. When absent (e.g. legacy callers /
   * unit tests), rows show the raw allocation, preserving prior behaviour.
   */
  reservePositions?: (input: {
    tenantId: string;
    budgetId: string;
    month: string;
  }) => Promise<Result<Map<string, ReservePosition>, Error>>;
  /** Clock for the current-month window; defaults to `new Date()`. */
  now?: () => Date;
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

      if (!enabled) {
        return ok({
          rows: [],
          excludedRows: [],
          totals: {
            totalCategoryReservesCents: "0",
            totalReserveWalletAmountCents: "0",
            mismatchCents: "0",
            disabled: true,
            budgetCurrency,
          },
        });
      }

      const [activeBalanceMap, excludedBalanceMap, categories, walletPool] =
        await Promise.all([
          deps.reserveBalanceRepo.getForBudget(
            input.budgetId,
            input.tenantId,
            new Date(),
          ),
          deps.reserveBalanceRepo.getExcludedForBudget(
            input.budgetId,
            input.tenantId,
            new Date(),
          ),
          deps.categoriesRepo.list(input.tenantId),
          deps.reservesSummaryRepo.sumReserveWalletAmounts(input.tenantId),
        ]);

      // Deplete the displayed reserve by cumulative usage when a position
      // calculator is wired. The mismatch (wallet − Σ expected) then reflects
      // real reserve usage, which is what the RESERVE_TOPUP task watches.
      let expectedOverride: Map<string, bigint> | undefined;
      if (deps.reservePositions) {
        const now = deps.now ? deps.now() : new Date();
        const month = now.toISOString().slice(0, 7); // YYYY-MM (UTC window)
        const posResult = await deps.reservePositions({
          tenantId: input.tenantId,
          budgetId: input.budgetId,
          month,
        });
        if (posResult.isErr()) return err(posResult.error);
        expectedOverride = new Map(
          [...posResult.value.values()].map((p) => [
            p.categoryId,
            p.expectedReserveCents,
          ]),
        );
      }

      return ok(
        buildReservesSummaryDto(
          activeBalanceMap,
          excludedBalanceMap,
          categories,
          walletPool,
          budgetCurrency,
          undefined,
          expectedOverride,
        ),
      );
    } catch (e) {
      return err(e as Error);
    }
  };
}

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

      const activeCats = categories.filter((c) => !c.reserveExcluded);
      const excludedCats = categories.filter((c) => c.reserveExcluded);

      let totalCategoryReserves = 0n;
      const rows: ReservesSummaryRow[] = activeCats.map((c) => {
        const m = activeBalanceMap.get(c.id);
        const expectedCents = m ? BigInt(m.amount.times("100").toFixed(0)) : 0n;
        totalCategoryReserves += expectedCents;
        const actualCents = c.reserveActualCents ?? 0n;

        const sharePct =
          walletPool === 0n
            ? null
            : Number((actualCents * 10000n) / walletPool) / 100;
        const shareAmt = walletPool === 0n ? null : actualCents.toString();

        return {
          categoryId: c.id,
          name: c.name,
          reserveBalanceCents: expectedCents.toString(),
          walletSharePercent: sharePct,
          walletShareAmountCents: shareAmt,
        };
      });

      const excludedRows: ReservesSummaryRow[] = excludedCats.map((c) => {
        const m = excludedBalanceMap.get(c.id);
        const expectedCents = m ? BigInt(m.amount.times("100").toFixed(0)) : 0n;
        return {
          categoryId: c.id,
          name: c.name,
          reserveBalanceCents: expectedCents.toString(),
          walletSharePercent: null,
          walletShareAmountCents: null,
        };
      });

      return ok({
        rows,
        excludedRows,
        totals: {
          totalCategoryReservesCents: totalCategoryReserves.toString(),
          totalReserveWalletAmountCents: walletPool.toString(),
          mismatchCents: (walletPool - totalCategoryReserves).toString(),
          disabled: false,
          budgetCurrency,
        },
      });
    } catch (e) {
      return err(e as Error);
    }
  };
}

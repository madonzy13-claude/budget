/**
 * get-reserves-summary.ts — Composed read: per-category reserve summary with share math.
 *
 * D-PH5-R1 shape: { rows, excludedRows, totals }
 *   rows:         Active (non-excluded) categories — share math + totals
 *   excludedRows: Excluded categories — FROZEN REAL balance (W-3), share always null
 *   totals:       Σ Active only (D-PH5-R10); mismatch signed; disabled cascading hide
 *
 * Share math (D-PH5-R2):
 *   walletSharePercent  = (categoryBalance / Σ Active balances) × 100
 *   walletShareAmountCents = (categoryBalance / Σ Active balances) × Σ RESERVE wallet amounts
 *   Both null when Σ Active = 0 OR Σ RESERVE wallets = 0 (D-PH5-R4).
 *
 * W-3 invariant: excludedRows NEVER synthesize "0" for frozen balance — they use
 * getExcludedForBudget (real math, same accumulation, opposite reserve_excluded filter).
 * "0" appears only when the category genuinely has no limit history AND no adjustments.
 *
 * D-PH5-R11 cascading hide: reserves_enabled=false → rows=[], excludedRows=[], disabled=true.
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
  /** Integer cents as string (bigint safety). */
  reserveBalanceCents: string;
  /** Null when Σ Active = 0 OR Σ wallets = 0 (rendered as em-dash by FE). */
  walletSharePercent: number | null;
  walletShareAmountCents: string | null;
}

export interface ReservesSummaryDto {
  /** Active (non-excluded) categories — drive share math + totals. */
  rows: ReservesSummaryRow[];
  /** Excluded categories — FROZEN REAL balance; share always null; NOT in totals. */
  excludedRows: ReservesSummaryRow[];
  totals: {
    totalCategoryReservesCents: string; // Σ Active only
    totalReserveWalletAmountCents: string;
    mismatchCents: string; // signed; positive = overfunded
    disabled: boolean;
    budgetCurrency: string;
  };
}

export interface GetReservesSummaryDeps {
  /** Must expose getForBudget (Active VIEW) AND getExcludedForBudget (Excluded, W-3). */
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

      // Parallel reads — no data dependency between them.
      const [
        activeBalanceMap,
        excludedBalanceMap,
        categories,
        reserveWalletSum,
      ] = await Promise.all([
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

      // Partition by reserveExcluded flag.
      const activeCats = categories.filter((c) => !c.reserveExcluded);
      const excludedCats = categories.filter((c) => c.reserveExcluded);

      // Compute Active row balances + total (drives share math).
      let totalCategoryReserves = 0n;
      const activeRowData: { id: string; name: string; cents: bigint }[] = [];
      for (const cat of activeCats) {
        const m = activeBalanceMap.get(cat.id);
        // Money.amount is a Big instance; .times("100").toFixed(0) rounds to cents.
        const centsStr = m ? m.amount.times("100").toFixed(0) : "0";
        const cents = BigInt(centsStr);
        activeRowData.push({ id: cat.id, name: cat.name, cents });
        totalCategoryReserves += cents;
      }

      const totalWallets: bigint = reserveWalletSum;

      // UAT-PH5-T3-51: NO automatic rebalancing of already-assigned
      // reserves. Walk categories in their canonical order and allocate
      // each row min(balance, remaining wallet pool); excess balance
      // flows into the global mismatch chip (under-funded). This means:
      //   - Categories created earlier keep their full requested amount
      //     when the pool is short.
      //   - Adding a new category never shrinks the share of a previous
      //     one (rebalancing was the wrong mental model).
      //   - Over-funded case (totalWallets > totalCategoryReserves):
      //     each row gets its full balance, the surplus surfaces in
      //     mismatchCents as the overfunded chip.
      let availableWallets: bigint = totalWallets;
      const rows: ReservesSummaryRow[] = activeRowData.map((r) => {
        const allocated =
          totalWallets === 0n
            ? 0n
            : r.cents <= availableWallets
              ? r.cents
              : availableWallets;
        availableWallets -= allocated;
        const sharePct =
          totalCategoryReserves === 0n || totalWallets === 0n
            ? null
            : Number((allocated * 10000n) / totalWallets) / 100;
        const shareAmt = sharePct === null ? null : allocated.toString();
        return {
          categoryId: r.id,
          name: r.name,
          reserveBalanceCents: r.cents.toString(),
          walletSharePercent: sharePct,
          walletShareAmountCents: shareAmt,
        };
      });

      // Build Excluded rows — REAL FROZEN balance from getExcludedForBudget (W-3).
      // Share is always null (Excluded categories don't participate in share math).
      // "0" is emitted ONLY when the map has no entry — meaning genuinely zero
      // (no limit history AND no adjustments), NOT as a placeholder.
      const excludedRows: ReservesSummaryRow[] = excludedCats.map((cat) => {
        const m = excludedBalanceMap.get(cat.id);
        const centsStr = m ? m.amount.times("100").toFixed(0) : "0";
        return {
          categoryId: cat.id,
          name: cat.name,
          reserveBalanceCents: centsStr,
          walletSharePercent: null,
          walletShareAmountCents: null,
        };
      });

      return ok({
        rows,
        excludedRows,
        totals: {
          totalCategoryReservesCents: totalCategoryReserves.toString(),
          totalReserveWalletAmountCents: totalWallets.toString(),
          mismatchCents: (totalWallets - totalCategoryReserves).toString(),
          disabled: false,
          budgetCurrency,
        },
      });
    } catch (e) {
      return err(e as Error);
    }
  };
}

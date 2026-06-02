/**
 * get-reserve-positions.ts — Shared cumulative reserve-position read.
 *
 * Single source of truth for "how much reserve does each category actually
 * have" once usage is accounted for. Consumed by the reserves tab, the
 * spendings grid, and the RESERVE_TOPUP reconciliation so all three agree.
 *
 *   expectedReserveCents = allocation − Σ months( min(overspend, realCap) )
 *
 * where:
 *   - allocation        = Σ of the category's manual reserve adjustments
 *   - overspend(m)      = max(0, spent(m) − activeBudget)
 *   - realCap           = the category's proportional share of the REAL reserve
 *                         wallet pool (you cannot draw reserve cash you do not
 *                         hold). Applied per month.
 *
 * Cumulative + runtime: usage is summed over the budget's whole history from
 * live transaction data, so editing any past month re-derives the reserve. The
 * per-month draw is capped at the real-money share (reuses computeReserveLedger).
 *
 * v1 simplifications (documented):
 *   - Underspend does NOT accrue reserve automatically; manual reserve
 *     adjustments remain the only inflow.
 *   - The current effective limit is used for every historical month (limits
 *     rarely change retroactively).
 *   - Fully computed on read (no materialised snapshot yet); months are
 *     independent, so a snapshot cache can be layered later without changing
 *     results.
 */
import { ok, err, type Result } from "@budget/shared-kernel";
import { Temporal } from "temporal-polyfill";
import type { ReserveBalanceRepo } from "../ports/reserve-balance-repo";
import type { CategoryLimitRepo } from "../ports/category-limit-repo";
import type { TransactionRepo } from "../ports/transaction-repo";
import type { ReservesSummaryRepo } from "../ports/reserves-summary-repo";
import type { SpendingsSummaryRepo } from "../ports/spendings-summary-repo";
import { computeReserveLedger } from "../domain/reserve-ledger";

export interface ReservePosition {
  categoryId: string;
  allocationCents: bigint;
  cumulativeUsageCents: bigint;
  expectedReserveCents: bigint;
}

export interface GetReservePositionsDeps {
  reserveBalanceRepo: ReserveBalanceRepo;
  categoryLimitRepo: CategoryLimitRepo;
  transactionRepo: TransactionRepo;
  reservesSummaryRepo: ReservesSummaryRepo;
  summaryRepo: SpendingsSummaryRepo;
}

export interface GetReservePositionsInput {
  tenantId: string;
  budgetId: string;
  month: string; // YYYY-MM (the current month)
}

function moneyToCents(money: import("@budget/shared-kernel").Money): bigint {
  return BigInt(money.amount.times("100").toFixed(0));
}

export function getReservePositions(deps: GetReservePositionsDeps) {
  return async (
    input: GetReservePositionsInput,
  ): Promise<Result<Map<string, ReservePosition>, Error>> => {
    try {
      if (!/^\d{4}-\d{2}$/.test(input.month)) {
        return err(new Error("invalid_month"));
      }
      let ym: Temporal.PlainYearMonth;
      try {
        ym = Temporal.PlainYearMonth.from(input.month);
      } catch {
        return err(new Error("invalid_month"));
      }
      const monthStart = ym.toPlainDate({ day: 1 }).toString();
      const beforeMonthEnd = ym
        .add({ months: 1 })
        .toPlainDate({ day: 1 })
        .toString();

      const meta = await deps.summaryRepo.getBudgetMeta(
        input.tenantId,
        input.budgetId,
      );
      if (!meta) return err(new Error("budget_not_found"));

      const [allocations, limits, spendByMonth, walletPoolCents] =
        await Promise.all([
          deps.reserveBalanceRepo.getForBudget(
            input.budgetId,
            input.tenantId,
            new Date(),
          ),
          deps.categoryLimitRepo.effectiveForMonth(
            input.tenantId,
            input.budgetId,
            monthStart,
          ),
          deps.transactionRepo.spendByCategoryByMonth(
            input.tenantId,
            input.budgetId,
            beforeMonthEnd,
          ),
          deps.reservesSummaryRepo.sumReserveWalletAmounts(input.tenantId),
        ]);

      const realPoolCents = walletPoolCents > 0n ? walletPoolCents : 0n;
      let totalAllocatedCents = 0n;
      const allocationByCat = new Map<string, bigint>();
      for (const [catId, m] of allocations) {
        const cents = moneyToCents(m);
        allocationByCat.set(catId, cents);
        totalAllocatedCents += cents;
      }

      // Every category that has an allocation OR any spend needs a position.
      const catIds = new Set<string>([
        ...allocationByCat.keys(),
        ...spendByMonth.keys(),
      ]);

      const positions = new Map<string, ReservePosition>();
      for (const categoryId of catIds) {
        const allocationCents = allocationByCat.get(categoryId) ?? 0n;
        const lim = limits.get(categoryId) ?? { planned: 0n, cushion: 0n };
        const activeBudget = meta.cushionModeEnabled
          ? lim.cushion
          : lim.planned;

        // Per-category share of the real reserve money — the per-month draw cap.
        const capCents =
          totalAllocatedCents > 0n
            ? (() => {
                const share =
                  (allocationCents * realPoolCents) / totalAllocatedCents;
                return allocationCents < share ? allocationCents : share;
              })()
            : 0n;

        const monthlySpend = spendByMonth.get(categoryId);
        const months = monthlySpend
          ? [...monthlySpend.values()].map((spent) => {
              const surplus = activeBudget - spent;
              // v1: underspend does not accrue reserve → clamp positives to 0.
              return {
                surplusCents: surplus < 0n ? surplus : 0n,
                maxUsableCents: capCents,
              };
            })
          : [];

        const ledger = computeReserveLedger(allocationCents, months);
        const expectedReserveCents = ledger.expectedReserveCents;
        positions.set(categoryId, {
          categoryId,
          allocationCents,
          cumulativeUsageCents: allocationCents - expectedReserveCents,
          expectedReserveCents,
        });
      }

      return ok(positions);
    } catch (e) {
      return err(e as Error);
    }
  };
}

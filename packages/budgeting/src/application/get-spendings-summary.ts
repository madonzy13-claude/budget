/**
 * get-spendings-summary.ts — Composed read service for the 5-row spendings grid header.
 *
 * DTO returns serialized bigint cents as strings (plannedCents: string, etc).
 * Money value object wrapping happens at the Hono route boundary, NOT here.
 * This follows the precedent established by get-budget-home-summary.ts —
 * cross-check via `grep -n 'plannedCents\|spentCents' packages/budgeting/src/application/get-budget-home-summary.ts`
 *
 * budgetTz is returned at top level to allow Plan 04-04's RSC to skip a second
 * /budgets/:id fetch (resolves D-PH4-Q5 timezone correctness gap).
 *
 * GRID-02, GRID-15, RSCM-03, RSCM-04
 */
import { ok, err, type Result } from "@budget/shared-kernel";
import { Temporal } from "temporal-polyfill";
import type { CategoryRepo } from "../ports/category-repo";
import type { CategoryLimitRepo } from "../ports/category-limit-repo";
import type { TransactionRepo } from "../ports/transaction-repo";
import type { ReserveBalanceRepo } from "../ports/reserve-balance-repo";
import type { SpendingsSummaryRepo } from "../ports/spendings-summary-repo";

export interface GetSpendingsSummaryDeps {
  categoryRepo: CategoryRepo;
  categoryLimitRepo: CategoryLimitRepo;
  transactionRepo: TransactionRepo;
  reserveBalanceRepo: ReserveBalanceRepo;
  summaryRepo: SpendingsSummaryRepo;
}

export interface GetSpendingsSummaryInput {
  tenantId: string;
  budgetId: string;
  month: string; // YYYY-MM
}

export interface SpendingsSummaryCategoryDTO {
  categoryId: string;
  name: string;
  iconKey: string | null;
  colorKey: string | null;
  sortIndex: number;
  plannedCents: string;
  cushionCents: string;
  activeBudgetCents: string;
  spentCents: string;
  reserveUsedCents: string;
  overspentCents: string;
  balanceCents: string;
}

export interface SpendingsSummaryDTO {
  month: string;
  budgetCurrency: string;
  budgetTz: string; // IANA timezone — resolves D-PH4-Q5 RSC timezone gap
  cushionModeEnabled: boolean;
  categories: SpendingsSummaryCategoryDTO[];
}

/** Convert Money to bigint cents (multiply decimal amount × 100, round to integer). */
function moneyToCents(money: import("@budget/shared-kernel").Money): bigint {
  // Money.amount is a Big instance; multiply by 100 and convert to bigint
  const centsStr = money.amount.times(100).toFixed(0);
  return BigInt(centsStr);
}

export function getSpendingsSummary(deps: GetSpendingsSummaryDeps) {
  return async (
    input: GetSpendingsSummaryInput,
  ): Promise<Result<SpendingsSummaryDTO, Error>> => {
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
      const monthStart = ym.toPlainDate({ day: 1 }).toString(); // YYYY-MM-01
      const monthEnd = ym.add({ months: 1 }).toPlainDate({ day: 1 }).toString();

      const meta = await deps.summaryRepo.getBudgetMeta(
        input.tenantId,
        input.budgetId,
      );
      if (!meta) return err(new Error("budget_not_found"));

      const [categories, perCatSpend, effectiveLimits, reserveBalances] =
        await Promise.all([
          deps.categoryRepo.listForBudget(
            input.tenantId,
            input.budgetId,
            false,
          ),
          deps.transactionRepo.spendByCategoryForMonth(
            input.tenantId,
            input.budgetId,
            monthStart,
            monthEnd,
          ),
          deps.categoryLimitRepo.effectiveForMonth(
            input.tenantId,
            input.budgetId,
            monthStart,
          ),
          deps.reserveBalanceRepo.getForBudget(
            input.budgetId,
            input.tenantId,
            new Date(),
          ),
        ]);

      const dtoCategories: SpendingsSummaryCategoryDTO[] = categories
        .sort((a, b) => (a as any).sortIndex - (b as any).sortIndex)
        .map((c) => {
          const limits = effectiveLimits.get(c.id) ?? {
            planned: 0n,
            cushion: 0n,
          };
          const planned = limits.planned;
          const cushion = limits.cushion;
          const active = meta.cushionModeEnabled ? cushion : planned;
          const spent = perCatSpend.get(c.id) ?? 0n;

          const reserveMoney = reserveBalances.get(c.id);
          const reserveAvail = reserveMoney ? moneyToCents(reserveMoney) : 0n;

          const overBy = spent > active ? spent - active : 0n;
          const reserveUsed = overBy < reserveAvail ? overBy : reserveAvail; // min(overBy, reserveAvail)
          const overspentRaw = spent - active - reserveUsed;
          const overspent = overspentRaw > 0n ? overspentRaw : 0n;
          const balance = active - spent + reserveUsed;

          return {
            categoryId: c.id,
            name: c.name,
            iconKey: (c as any).iconKey ?? null,
            colorKey: (c as any).colorKey ?? null,
            sortIndex: (c as any).sortIndex ?? 0,
            plannedCents: planned.toString(),
            cushionCents: cushion.toString(),
            activeBudgetCents: active.toString(),
            spentCents: spent.toString(),
            reserveUsedCents: reserveUsed.toString(),
            overspentCents: overspent.toString(),
            balanceCents: balance.toString(),
          };
        });

      return ok({
        month: input.month,
        budgetCurrency: meta.currency,
        budgetTz: meta.timezone,
        cushionModeEnabled: meta.cushionModeEnabled,
        categories: dtoCategories,
      });
    } catch (e) {
      return err(e as Error);
    }
  };
}

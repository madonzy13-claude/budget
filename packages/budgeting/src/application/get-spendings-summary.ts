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
// (Result re-exported from the import above; do not re-import it.)
import { Temporal } from "temporal-polyfill";
import type { CategoryRepo } from "../ports/category-repo";
import type { CategoryLimitRepo } from "../ports/category-limit-repo";
import type { TransactionRepo } from "../ports/transaction-repo";
import type { SpendingsSummaryRepo } from "../ports/spendings-summary-repo";
import type { ReservePositionsResult } from "./get-reserve-positions";

export interface GetSpendingsSummaryDeps {
  categoryRepo: CategoryRepo;
  categoryLimitRepo: CategoryLimitRepo;
  transactionRepo: TransactionRepo;
  summaryRepo: SpendingsSummaryRepo;
  /**
   * Canonical reserve calculator (05-12 replay orchestrator). The grid's
   * reserveUsed/overspent for a month come straight from the engine cells:
   * positions.get(catId).byMonth.get(month).{usedCents,overspentCents}. One
   * engine-derived reserve per category, shared with the reserves tab. Required
   * — the old reserve_actual_cents fallback is gone.
   */
  reservePositions: (input: {
    tenantId: string;
    budgetId: string;
    month?: string;
  }) => Promise<Result<ReservePositionsResult, Error>>;
  /** Clock for the current-month boundary; defaults to `new Date()`. */
  now?: () => Date;
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
  /** Reserve drawn for THIS month (clamped ≤ reserveAvailableCents). */
  reserveUsedCents: string;
  /** Reserve AVAILABLE to this month = used + free reserve at the month's end.
   *  The denominator of the "used / available" display. */
  reserveAvailableCents: string;
  /** reserve_excluded NOW — the grid renders "available" as a dash when true. */
  reserveExcluded: boolean;
  /** Archived "keep history" (archived_from set) — the grid renders this column
   *  greyed + read-only (no quick entry / edit). Hidden entirely in future months. */
  archived: boolean;
  /** Overspend NOT covered by reserve for THIS month (overage − reserveUsed). */
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

      const [categories, perCatSpend, effectiveLimits, posResult] =
        await Promise.all([
          deps.categoryRepo.listForBudget(
            input.tenantId,
            input.budgetId,
            false,
            monthStart, // month-removed categories stay visible in their active months
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
          // Reserve cells are sliced from the CURRENT-month pool computation, NOT
          // recomputed at the viewed month. A per-category reserve is a single
          // POOL whose coverage depends on the whole ledger (leftover reserve
          // sweeps onto any month's overspend). Passing the viewed month as the
          // open month would truncate LATER spend (loader date-bounds spend at the
          // open month) while still loading later reserve top-ups — so those
          // top-ups would sweep back onto the viewed past month, making its cell
          // differ from the same month seen "live". Omitting month → loader uses
          // serverNow()'s month, and byMonth.get(input.month) selects the slice.
          // This also keeps the grid numbers identical to the reserves tab.
          deps.reservePositions({
            tenantId: input.tenantId,
            budgetId: input.budgetId,
          }),
        ]);

      // 05-12: reserveUsed + overspent for the viewed month come STRAIGHT from
      // the engine cells (one reserve per category, shared with the reserves
      // tab). No reserve_actual fallback, no funded/available concept.
      if (posResult.isErr()) return err(posResult.error);
      const positions = posResult.value.positions;

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

          // Engine cell for THIS month → used + overspent + the free reserve at the
          // month's end. When the engine emitted no cell (no activity it tracked),
          // fall back to the raw over-budget figure with no reserve coverage.
          const pos = positions.get(c.id);
          const cell = pos?.byMonth.get(input.month);
          const reserveExcluded = pos?.reserveExcluded ?? false;
          const overage =
            cell?.overageCents ?? (spent > active ? spent - active : 0n);
          const rawUsed = cell?.usedCents ?? 0n;
          // "Reserve available to this month" = used + free reserve at month's end
          // (clamped ≥ 0). Used is then clamped ≤ available so we never display
          // spending more reserve than was available — e.g. if the reserve was later
          // reduced below what this month had used, the shown used drops to match.
          const endReserve = cell?.endReserveCents ?? 0n;
          const reserveAvailable =
            rawUsed + endReserve > 0n ? rawUsed + endReserve : 0n;
          const reserveUsed =
            rawUsed < reserveAvailable ? rawUsed : reserveAvailable;
          const overspent = overage - reserveUsed;
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
            reserveAvailableCents: reserveAvailable.toString(),
            reserveExcluded,
            archived: (c as any).archivedFrom != null,
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

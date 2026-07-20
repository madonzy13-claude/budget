/**
 * get-overview-overspent.ts — Overspent + Reserves section service (11-05).
 *
 * Range overspent (D-10): per category per month the after-reserves figure is
 *   over = max(0, spent − active_limit − reserve_used)
 * summed across the months in range. This matches the Spendings grid bit-for-bit
 * because every term comes from the grid's own sources:
 *   - spent + active_limit ← overview-repo (11-04): monthlySpendByCategory +
 *     monthlyPlannedByCategory (already mode-resolved cushion-vs-normal per month).
 *   - reserve_used ← the reserve ENGINE per (category, month) cell, the same
 *     reservePositions seam get-spendings-summary uses. Algebraically the floor
 *     equals the engine's cell.overspentCents (overage − used) in every case.
 *
 * D-06: an archived "keep history" category contributes overspent only for the
 * months it was active (created_month … archived_month) — categoryWindows gates it.
 *
 * Reserves-by-category mirrors get-reserves-summary rows[].reserveCents (already
 * default_ccy) — the raw reserve-balance DB view is NEVER queried directly.
 *
 * No FX: every term is already in the budget currency (ledger amount_converted,
 * limits in budget ccy, engine cents in budget ccy). Cents are bigint internally;
 * the DTO stringifies at the boundary (matches get-overview-planned).
 */
import { ok, err, type Result } from "@budget/shared-kernel";
import type { ReservePositionsResult } from "./get-reserve-positions";
import type { ReservesSummaryDto } from "./get-reserves-summary";
import type { OverviewPlannedRepo } from "./get-overview-planned";

/** Subset of the 11-04 overview-repo this section needs. */
export type OverviewOverspentRepo = Pick<
  OverviewPlannedRepo,
  "monthlySpendByCategory" | "monthlyPlannedByCategory" | "categoryWindows"
>;

export interface GetOverviewOverspentDeps {
  overviewRepo: OverviewOverspentRepo;
  /** Reserve engine seam (05-12) — reserve_used per (category, month). */
  reservePositions: (input: {
    tenantId: string;
    budgetId: string;
    month?: string;
  }) => Promise<Result<ReservePositionsResult, Error>>;
  /** get-reserves-summary — reserves-by-category bar source (default_ccy). */
  reservesSummary: (input: {
    tenantId: string;
    budgetId: string;
  }) => Promise<Result<ReservesSummaryDto, Error>>;
  metaReader: {
    getBudgetMeta(
      budgetId: string,
    ): Promise<{ default_currency: string } | null>;
  };
}

export interface GetOverviewOverspentInput {
  tenantId: string;
  budgetId: string;
  from: string; // YYYY-MM-DD
  to: string; // YYYY-MM-DD
  now?: () => Date;
}

export interface OverviewOverspentDTO {
  currency: string;
  overspent_total_cents: string;
  overspent_by_category: {
    category_id: string;
    name: string;
    overspent_cents: string;
  }[];
  reserves_by_category: {
    category_id: string;
    name: string;
    reserve_cents: string;
  }[];
}

/** Inclusive YYYY-MM list from `from` to `to`. */
function monthsInRange(from: string, to: string): string[] {
  const months: string[] = [];
  let [y, m] = from.slice(0, 7).split("-").map(Number) as [number, number];
  const [ty, tm] = to.slice(0, 7).split("-").map(Number) as [number, number];
  while (y < ty || (y === ty && m <= tm)) {
    months.push(`${y}-${String(m).padStart(2, "0")}`);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return months;
}

export function getOverviewOverspent(deps: GetOverviewOverspentDeps) {
  return async (
    input: GetOverviewOverspentInput,
  ): Promise<Result<OverviewOverspentDTO, Error>> => {
    try {
      const meta = await deps.metaReader.getBudgetMeta(input.budgetId);
      if (!meta) return err(new Error("budget_not_found"));
      const ccy = meta.default_currency;

      const [spend, planned, windows, posResult, reservesResult] =
        await Promise.all([
          deps.overviewRepo.monthlySpendByCategory(
            input.budgetId,
            input.from,
            input.to,
          ),
          deps.overviewRepo.monthlyPlannedByCategory(
            input.budgetId,
            input.from,
            input.to,
          ),
          deps.overviewRepo.categoryWindows(input.budgetId),
          deps.reservePositions({
            tenantId: input.tenantId,
            budgetId: input.budgetId,
          }),
          deps.reservesSummary({
            tenantId: input.tenantId,
            budgetId: input.budgetId,
          }),
        ]);
      if (posResult.isErr()) return err(posResult.error);
      if (reservesResult.isErr()) return err(reservesResult.error);

      const rangeMonths = monthsInRange(input.from, input.to);
      const positions = posResult.value.positions;

      // category|month → cents lookups.
      const spentKey = new Map<string, bigint>();
      for (const s of spend)
        spentKey.set(`${s.category_id}|${s.month}`, s.spent_cents);
      const plannedKey = new Map<string, bigint>();
      for (const p of planned)
        plannedKey.set(`${p.category_id}|${p.month}`, p.planned_cents);

      // reserve_used per (category, month) from the engine cells.
      const reserveUsed = (catId: string, month: string): bigint =>
        positions.get(catId)?.byMonth.get(month)?.usedCents ?? 0n;

      const byCategory = windows
        .map((w) => {
          // Investments excluded — over-investing isn't overspending (mirrors
          // get-overview-planned's `if (w.is_investment) return null`). Zeroing
          // `over` lets the `> 0n` filter below drop it, no null handling.
          if (w.is_investment)
            return { category_id: w.category_id, name: w.name, overspent: 0n };
          const activeMonths = rangeMonths.filter(
            (m) =>
              m >= w.created_month &&
              (w.archived_month === null || m <= w.archived_month),
          );
          let over = 0n;
          for (const m of activeMonths) {
            const spent = spentKey.get(`${w.category_id}|${m}`) ?? 0n;
            const activeLimit = plannedKey.get(`${w.category_id}|${m}`) ?? 0n;
            const used = reserveUsed(w.category_id, m);
            const diff = spent - activeLimit - used; // after-reserves overage
            if (diff > 0n) over += diff; // floor at 0 per month
          }
          return { category_id: w.category_id, name: w.name, overspent: over };
        })
        .filter((c) => c.overspent > 0n)
        .sort((a, b) =>
          a.overspent < b.overspent ? 1 : a.overspent > b.overspent ? -1 : 0,
        );

      const total = byCategory.reduce((acc, c) => acc + c.overspent, 0n);

      const reserves_by_category = reservesResult.value.rows.map((r) => ({
        category_id: r.categoryId,
        name: r.name,
        reserve_cents: r.reserveCents,
      }));

      return ok({
        currency: ccy,
        overspent_total_cents: total.toString(),
        overspent_by_category: byCategory.map((c) => ({
          category_id: c.category_id,
          name: c.name,
          overspent_cents: c.overspent.toString(),
        })),
        reserves_by_category,
      });
    } catch (e) {
      return err(e as Error);
    }
  };
}

/**
 * reserves-summary-builder.ts — Pure DTO shaper for the NEW ReservesSummaryDto.
 *
 * Phase 05 reserve rewrite (05-REWRITE-SPEC.md): the reserves tab shows ONE
 * engine-derived reserve per category plus used + overspent, and a single
 * budget-level surplus banner. The OLD walletShare% / actual / mismatch math is
 * GONE — `buildReservesSummaryDto` now just projects a `ReservePositionsResult`
 * (from get-reserve-positions) onto the row + totals shape. No allocation, no
 * greedy fill, no VIEW.
 *
 *   active rows   : non-excluded categories → { reserve, used, overspent }
 *   excluded rows : name-only (reserve hidden — released on exclude)
 *   totals        : internal / userDefined / surplus(+direction) / disabled / currency
 *
 * Pure data → data: takes the orchestrator result + the category list; emits the
 * serialized DTO (bigints stringified). Reused by adjust/wallet use-cases (05-13)
 * to return the summary inline without a refetch.
 */
import type {
  ReservesSummaryDto,
  ReservesSummaryRow,
} from "./get-reserves-summary";
import type { ReservePositionsResult } from "./get-reserve-positions";

export interface ReservesSummaryCategory {
  id: string;
  name: string;
  reserveExcluded: boolean;
}

export function buildReservesSummaryDto(args: {
  /** From get-reserve-positions: per-category R/U/overspent + internal + surplus. */
  positions: ReservePositionsResult;
  categories: ReservesSummaryCategory[];
  budgetCurrency: string;
  disabled: boolean;
}): ReservesSummaryDto {
  const { positions, categories, budgetCurrency, disabled } = args;

  const rowFor = (c: ReservesSummaryCategory): ReservesSummaryRow => {
    const p = positions.positions.get(c.id);
    return {
      categoryId: c.id,
      name: c.name,
      reserveCents: (p?.reserveCents ?? 0n).toString(),
      usedCents: (p?.usedCents ?? 0n).toString(),
      overspentCents: (p?.overspentCents ?? 0n).toString(),
    };
  };

  const rows: ReservesSummaryRow[] = categories
    .filter((c) => !c.reserveExcluded)
    .map(rowFor);

  // Excluded categories keep a name-only row so the tab's exclude section renders;
  // their reserve is hidden (released on exclude → not part of internal).
  const excludedRows: ReservesSummaryRow[] = categories
    .filter((c) => c.reserveExcluded)
    .map((c) => ({
      categoryId: c.id,
      name: c.name,
      reserveCents: "0",
      usedCents: "0",
      overspentCents: "0",
    }));

  return {
    rows,
    excludedRows,
    totals: {
      internalCents: positions.internalCents.toString(),
      userDefinedCents: positions.userDefinedCents.toString(),
      surplusCents: positions.surplusCents.toString(),
      direction: positions.direction,
      disabled,
      budgetCurrency,
    },
  };
}

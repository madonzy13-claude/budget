/**
 * reserves-summary-builder.ts — Pure shape function for ReservesSummaryDto.
 *
 * UAT-PH5-T3-54 perf option A: extracted so that adjust + wallet-balance
 * use cases can return the full new summary in their response (eliminating
 * a refetch round-trip + a second heavy view query on the client side).
 */
import type { Money } from "@budget/shared-kernel";
import type {
  ReservesSummaryDto,
  ReservesSummaryRow,
} from "./get-reserves-summary";
import type { CategoryRow } from "../ports/categories-repo";

export function buildReservesSummaryDto(
  activeBalanceMap: Map<string, Money>,
  excludedBalanceMap: Map<string, Money>,
  allCats: CategoryRow[],
  walletPoolCents: bigint,
  budgetCurrency: string,
  /** Overrides for `reserve_actual_cents` — used when the caller has the
   *  post-mutation values in memory and hasn't yet persisted them. */
  actualOverrides?: Map<string, bigint>,
): ReservesSummaryDto {
  const activeCats = allCats.filter((c) => !c.reserveExcluded);
  const excludedCats = allCats.filter((c) => c.reserveExcluded);

  const actualOf = (c: CategoryRow): bigint =>
    actualOverrides?.get(c.id) ?? c.reserveActualCents ?? 0n;

  const sumActiveActual = activeCats.reduce((s, c) => s + actualOf(c), 0n);

  let totalCategoryReserves = 0n;
  const rows: ReservesSummaryRow[] = activeCats.map((c) => {
    const m = activeBalanceMap.get(c.id);
    const expectedCents = m ? BigInt(m.amount.times("100").toFixed(0)) : 0n;
    totalCategoryReserves += expectedCents;
    const actualCents = actualOf(c);

    const sharePct =
      sumActiveActual === 0n
        ? null
        : Number((actualCents * 10000n) / sumActiveActual) / 100;
    const shareAmt = sumActiveActual === 0n ? null : actualCents.toString();

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

  return {
    rows,
    excludedRows,
    totals: {
      totalCategoryReservesCents: totalCategoryReserves.toString(),
      totalReserveWalletAmountCents: walletPoolCents.toString(),
      mismatchCents: (walletPoolCents - totalCategoryReserves).toString(),
      disabled: false,
      budgetCurrency,
    },
  };
}

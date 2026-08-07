/**
 * reserve-balance-slices.ts — the "Reserve balance, by category" pie (260804).
 *
 * Was a bar chart listing every category, zeros included. The question it
 * answers is how the reserve is SPLIT, which is a pie; and a category holding
 * nothing has no share to show, so it is dropped rather than drawn as a zero
 * that still costs a name in the legend.
 */
export interface ReserveBalanceSlice extends Record<string, unknown> {
  name: string;
  category_id: string;
  /** Cents. */
  reserve: number;
}

export function reserveBalanceSlices(
  rows: readonly { category_id: string; name: string; reserve_cents: string }[],
): ReserveBalanceSlice[] {
  return rows
    .map((r) => ({
      name: r.name,
      category_id: r.category_id,
      reserve: Number(r.reserve_cents),
    }))
    .filter((r) => Number.isFinite(r.reserve) && r.reserve > 0)
    .sort((a, b) => b.reserve - a.reserve);
}

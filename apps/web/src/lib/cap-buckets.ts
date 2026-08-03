/**
 * cap-buckets.ts — slices of the "where your money is" capitalization pie.
 *
 * Extracted from wealth-section.tsx so the set of pools is testable: every
 * wallet kind that counts toward capitalization needs a slice here, otherwise
 * its money shows up in the headline figure and nowhere in the chart (that is
 * exactly what happened to OTHER when it was added, 260803).
 */

/** One slice per pool of money. Colors must stay distinct — the pie has no
 *  other way to tell two pools apart. */
export const CAP_BUCKET_COLORS = {
  investments: "var(--chart-bar-1)", // blue
  spendings: "var(--primary)", // yellow
  reserves: "var(--chart-bar-2)", // teal
  cushion: "var(--chart-bar-3)", // purple
  possessions: "var(--chart-bar-4)", // rose
  other: "var(--chart-bar-5)", // amber
} as const;

interface CapCards {
  investment_value_cents: string;
  possessions_value_cents: string;
  /** Optional: a cached DTO from before OTHER existed has no such field. */
  other_value_cents?: string;
  spendings: { wallet_cents: string };
  reserves: { wallet_cents: string };
  cushion: { total_cents: string };
}

export interface CapBucket extends Record<string, unknown> {
  name: string;
  value: number;
  color: string;
}

export function capitalizationBuckets(
  cards: CapCards,
  t: (key: string) => string,
): CapBucket[] {
  return [
    {
      name: t("wealth.capInvestments"),
      value: Number(cards.investment_value_cents),
      color: CAP_BUCKET_COLORS.investments,
    },
    {
      name: t("wealth.capSpendings"),
      value: Number(cards.spendings.wallet_cents),
      color: CAP_BUCKET_COLORS.spendings,
    },
    {
      name: t("wealth.capReserves"),
      value: Number(cards.reserves.wallet_cents),
      color: CAP_BUCKET_COLORS.reserves,
    },
    {
      name: t("wealth.capCushion"),
      value: Number(cards.cushion.total_cents),
      color: CAP_BUCKET_COLORS.cushion,
    },
    {
      name: t("wealth.capPossessions"),
      value: Number(cards.possessions_value_cents),
      color: CAP_BUCKET_COLORS.possessions,
    },
    {
      name: t("wealth.capOther"),
      value: Number(cards.other_value_cents ?? 0),
      color: CAP_BUCKET_COLORS.other,
    },
  ].filter((b) => Number.isFinite(b.value) && b.value > 0);
}

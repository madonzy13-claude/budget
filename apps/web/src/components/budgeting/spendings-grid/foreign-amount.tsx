/**
 * foreign-amount.tsx — R6 (user): a spending paid in another currency reads
 * in THAT currency (its short sign: €, $, kr, ₴). Its budget-currency figure
 * (that day's rate) shows only in Edit. A budget-currency row keeps its bare
 * amount.
 */
import { centsToBare, centsToDisplayCompact } from "@/lib/cents-format";

export function FxAmount({
  row,
  locale,
}: {
  row: {
    amountConvertedCents: string;
    currencyConverted: string;
    amountOriginalCents?: string;
    currencyOriginal?: string;
  };
  locale: string;
}) {
  const foreign =
    !!row.amountOriginalCents &&
    !!row.currencyOriginal &&
    row.currencyOriginal !== row.currencyConverted;
  if (!foreign)
    return (
      <span className="shrink-0">
        {centsToBare(row.amountConvertedCents, locale)}
      </span>
    );
  // R6 (user): the row shows what was paid; the budget figure is in Edit.
  return (
    <span className="shrink-0">
      {centsToDisplayCompact(
        row.amountOriginalCents!,
        row.currencyOriginal!,
        locale,
        true,
      )}
    </span>
  );
}

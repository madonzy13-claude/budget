/**
 * foreign-amount.tsx — R6 (user): a spending paid in another currency reads
 * in THAT currency (its short sign: €, $, kr, ₴), with the budget-currency
 * figure at that day's rate underneath. A budget-currency row keeps its bare
 * amount and no second line.
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
  return (
    <span className="flex shrink-0 flex-col leading-tight">
      <span>
        {centsToDisplayCompact(
          row.amountOriginalCents!,
          row.currencyOriginal!,
          locale,
          true,
        )}
      </span>
      <span
        data-testid="txn-converted"
        className="text-[var(--muted-foreground)]"
        style={{ fontSize: "11px", opacity: 0.6 }}
      >
        {centsToDisplayCompact(
          row.amountConvertedCents,
          row.currencyConverted,
          locale,
          true,
        )}
      </span>
    </span>
  );
}

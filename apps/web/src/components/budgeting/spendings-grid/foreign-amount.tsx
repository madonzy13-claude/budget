/**
 * foreign-amount.tsx — R6 (user): a spending paid in another currency reads
 * in THAT currency (its short sign: €, $, kr, ₴). Its budget-currency figure
 * (that day's rate) shows only in Edit. A budget-currency row carries its
 * sign too (Phase 14). A refund (negative) reads with a refund mark and no minus.
 */
import { Undo2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { centsToDisplayCompact } from "@/lib/cents-format";

const abs = (cents: string) => cents.replace(/^-/, "");

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
  const t = useTranslations("grid.txn");
  const refund = row.amountConvertedCents.startsWith("-");
  const foreign =
    !!row.amountOriginalCents &&
    !!row.currencyOriginal &&
    row.currencyOriginal !== row.currencyConverted;
  return (
    // Plain inline text (not flex): the number keeps the text baseline, so a
    // note beside it lines up; the icon just sits on that line.
    <span className="shrink-0 whitespace-nowrap">
      {refund && (
        <Undo2
          data-testid="txn-refund-icon"
          role="img"
          aria-label={t("refund")}
          className="mr-1 inline h-3.5 w-3.5 align-[-0.15em] text-[var(--trading-up)]"
        />
      )}
      {foreign
        ? centsToDisplayCompact(
            abs(row.amountOriginalCents!),
            row.currencyOriginal!,
            locale,
            true,
          )
        : // Phase 14 (user, 261103): always the sign, so the currency of
          // every row is explicit — not only the foreign ones.
          centsToDisplayCompact(
            abs(row.amountConvertedCents),
            row.currencyConverted,
            locale,
            true,
          )}
    </span>
  );
}

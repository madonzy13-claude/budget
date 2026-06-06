"use client";
/**
 * reserves-totals-footer.tsx — reserve totals strip (05-19 reshape).
 *
 * Renders THREE stacked totals and nothing else (the SurplusBanner is gone —
 * the RESERVE_TOPUP task card is now the single reconcile nudge):
 *   TOTAL AVAILABLE          internalCents     (Σ active reserve / "available")
 *   TOTAL IN WALLETS         userDefinedCents  (Σ RESERVE-wallet balances)
 *   TOTAL USED (THIS MONTH)  usedCents         (Σ active rows' usedCents)
 *
 * `usedCents` is summed by the client island (it holds the rows) and passed in
 * pre-aggregated — this component stays a dumb presentational primitive. The
 * "(THIS MONTH)" label is the product copy; usedCents is the engine's running
 * used reserve and may span months (see 05-19 SUMMARY data caveat).
 *
 * UAT-PH5-T3-53: Single layout on every viewport. Renders inline at the top of
 * the reserves column so its width matches the category list naturally. No
 * sticky positioning, no horizontal margins (parent container handles padding).
 */
import * as React from "react";
import { useTranslations, useLocale } from "next-intl";
import { centsToBare } from "@/lib/cents-format";

export interface ReservesTotalsFooterProps {
  /** Σ active reserve (engine internal), serialized cents → TOTAL AVAILABLE. */
  internalCents: string;
  /** Σ RESERVE-wallet balances (userDefined), serialized cents → TOTAL IN WALLETS. */
  userDefinedCents: string;
  /** Σ active rows' usedCents, serialized cents → TOTAL USED (THIS MONTH). */
  usedCents: string;
  currency: string;
}

export function ReservesTotalsFooter({
  internalCents,
  userDefinedCents,
  usedCents,
  currency,
}: ReservesTotalsFooterProps) {
  const t = useTranslations("bdp.tab.reserves");
  const locale = useLocale();

  // Compact digits (centsToBare drops a whole-unit .00); pass locale so PL/UK
  // group separators are correct. The trailing currency code is intentional.
  const fmt = (cents: string) => centsToBare(cents, locale);

  const totals: ReadonlyArray<{
    key: string;
    label: string;
    value: string;
    testId?: string;
  }> = [
    {
      key: "available",
      label: t("totals.internalLabel"),
      value: fmt(internalCents),
    },
    {
      key: "wallets",
      label: t("totals.walletsLabel"),
      value: fmt(userDefinedCents),
    },
    {
      key: "used",
      label: t("totals.usedLabel"),
      value: fmt(usedCents),
      testId: "reserves-total-used",
    },
  ];

  return (
    <div
      data-testid="reserves-totals-footer"
      className={[
        "rounded-[var(--radius-md)] border border-[var(--hairline-dark)]",
        "bg-[var(--surface-card-dark)]",
        "flex flex-col gap-2 px-4 py-3",
      ].join(" ")}
    >
      {totals.map((row) => (
        <div
          key={row.key}
          className="flex items-baseline justify-between gap-4"
        >
          <span className="text-caption uppercase tracking-wider text-[var(--muted-foreground)]">
            {row.label}
          </span>
          <span
            data-testid={row.testId}
            className="text-num-md text-right tabular-nums text-[var(--foreground)]"
          >
            {row.value} {currency}
          </span>
        </div>
      ))}
    </div>
  );
}

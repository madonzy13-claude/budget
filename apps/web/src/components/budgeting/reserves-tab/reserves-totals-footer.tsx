"use client";
/**
 * reserves-totals-footer.tsx — reserve reconciliation banner (NEW engine model).
 *
 * Phase 05 reserve rewrite (05-REWRITE-SPEC.md): shows Σ internal (Σ active R)
 * vs Σ reserve wallets (userDefined) and the SurplusBanner that tells the
 * family whether to TOP UP or WITHDRAW (or that reserves are reconciled). The
 * old MismatchChip + walletShare math are GONE.
 *
 * UAT-PH5-T3-53: Single layout on every viewport. Renders inline at the top of
 * the reserves column so its width matches the category list naturally. No
 * sticky positioning, no horizontal margins (parent container handles padding).
 */
import * as React from "react";
import { useTranslations, useLocale } from "next-intl";
import { centsToBare } from "@/lib/cents-format";
import { SurplusBanner, type SurplusDirection } from "./surplus-banner";

export interface ReservesTotalsFooterProps {
  /** Σ active R (engine internal reserve), serialized cents. */
  internalCents: string;
  /** Σ RESERVE-wallet balances (userDefined), serialized cents. */
  userDefinedCents: string;
  /** userDefined − internal, serialized cents (may be negative). */
  surplusCents: string;
  direction: SurplusDirection;
  currency: string;
}

export function ReservesTotalsFooter({
  internalCents,
  userDefinedCents,
  surplusCents,
  direction,
  currency,
}: ReservesTotalsFooterProps) {
  const t = useTranslations("bdp.tab.reserves");
  const locale = useLocale();

  // Compact digits (centsToBare drops a whole-unit .00); pass locale so PL/UK
  // group separators are correct. The trailing currency code is intentional.
  const fmt = (cents: string) => centsToBare(cents, locale);

  // |surplus| for the banner — sign is conveyed by direction + accent colour.
  const absSurplus = (() => {
    const s = BigInt(surplusCents);
    return (s < 0n ? -s : s).toString();
  })();

  return (
    <div
      data-testid="reserves-totals-footer"
      className={[
        "rounded-[var(--radius-md)] border border-[var(--hairline-dark)]",
        "bg-[var(--surface-card-dark)]",
        "flex flex-col gap-3 px-4 py-3",
        "sm:flex-row sm:items-center sm:justify-between sm:gap-8",
      ].join(" ")}
    >
      <div className="grid grid-cols-[1fr_auto] items-baseline gap-x-3 gap-y-1 sm:flex sm:flex-row sm:items-baseline sm:gap-4">
        <span className="text-caption uppercase tracking-wider text-[var(--muted-foreground)]">
          {t("totals.internalLabel")}
        </span>
        <span className="text-num-md text-right text-[var(--foreground)]">
          {fmt(internalCents)} {currency}
        </span>
        <span className="text-caption uppercase tracking-wider text-[var(--muted-foreground)]">
          {t("totals.walletsLabel")}
        </span>
        <span className="text-num-md text-right text-[var(--foreground)]">
          {fmt(userDefinedCents)} {currency}
        </span>
      </div>

      <SurplusBanner
        direction={direction}
        amountFormatted={`${fmt(absSurplus)} ${currency}`}
      />
    </div>
  );
}

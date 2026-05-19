"use client";
/**
 * reserves-totals-footer.tsx — Sticky bottom row with totals + MismatchChip.
 *
 * D-PH5-R12: MismatchChip variant derived from mismatchCents sign.
 * Excluded balances are NOT included in totals (Plan 03 guarantees this server-side).
 * Mobile: min-h-[72px], desktop: min-h-[56px].
 */
import * as React from "react";
import { MismatchChip } from "./mismatch-chip";
import { useTranslations } from "next-intl";
import { centsToBare } from "@/lib/cents-format";

export interface ReservesTotalsFooterProps {
  totalCategoryCents: string;
  totalWalletCents: string;
  mismatchCents: string;
  currency: string;
}

export function ReservesTotalsFooter({
  totalCategoryCents,
  totalWalletCents,
  mismatchCents,
  currency,
}: ReservesTotalsFooterProps) {
  const t = useTranslations("bdp.tab.reserves");

  // UAT-PH5-T3-45: bare number formatting to match wallets.
  const fmt = (cents: string) => centsToBare(cents);

  const m = BigInt(mismatchCents);
  const variant: "overfunded" | "underfunded" | "reconciled" =
    m === 0n ? "reconciled" : m > 0n ? "overfunded" : "underfunded";

  const absAmtCents = (m < 0n ? -m : m).toString();
  const amountFormatted =
    variant !== "reconciled" ? fmt(absAmtCents) : undefined;
  const helperText =
    variant === "overfunded"
      ? t("mismatch.overfunded.helper")
      : variant === "underfunded"
        ? t("mismatch.underfunded.helper")
        : undefined;

  return (
    <div
      data-testid="reserves-totals-footer"
      className={[
        // UAT-PH5-T3-45: float as a card inset from the viewport
        // edges so it visually matches the centered table column.
        // Extra bottom padding on mobile keeps the red mismatch
        // chip clear of the iOS home-indicator area.
        "sticky bottom-4 z-30 mx-4 sm:bottom-6 sm:mx-6",
        "flex flex-col gap-2",
        "rounded-[var(--radius-md)] border border-[var(--hairline-dark)]",
        "bg-[var(--surface-card-dark)] px-4 py-3 pb-6 sm:pb-3",
        "min-h-[72px] sm:min-h-[56px]",
        "sm:flex-row sm:items-center sm:justify-between",
      ].join(" ")}
    >
      <div className="flex flex-col gap-1 sm:flex-row sm:gap-4">
        <span className="text-caption uppercase tracking-wider text-[var(--muted-foreground)]">
          {t("totals.categoriesLabel")}:{" "}
          {/* UAT-PH5-T3-48: amount first, currency second. */}
          <span className="text-num-md text-[var(--foreground)]">
            {fmt(totalCategoryCents)} {currency}
          </span>
        </span>
        <span className="text-caption uppercase tracking-wider text-[var(--muted-foreground)]">
          {t("totals.walletsLabel")}:{" "}
          <span className="text-num-md text-[var(--foreground)]">
            {fmt(totalWalletCents)} {currency}
          </span>
        </span>
      </div>

      <MismatchChip
        variant={variant}
        {...(amountFormatted !== undefined && {
          amountFormatted: `${amountFormatted} ${currency}`,
        })}
        {...(helperText !== undefined && { helperText })}
      />
    </div>
  );
}

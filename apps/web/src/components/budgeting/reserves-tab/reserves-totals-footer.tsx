"use client";
/**
 * reserves-totals-footer.tsx — Totals banner with MismatchChip.
 *
 * UAT-PH5-T3-53: Single layout on every viewport. Renders inline at the top
 * of the reserves column so its width matches the category list naturally.
 * No sticky positioning, no horizontal margins (parent container handles padding).
 *
 * D-PH5-R12: MismatchChip variant derived from mismatchCents sign.
 * Excluded balances are NOT included in totals (Plan 03 guarantees this server-side).
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
        "rounded-[var(--radius-md)] border border-[var(--hairline-dark)]",
        "bg-[var(--surface-card-dark)]",
        "flex flex-col gap-3 px-4 py-3",
        "sm:flex-row sm:items-center sm:justify-between",
      ].join(" ")}
    >
      <div className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 sm:flex sm:flex-row sm:gap-4">
        <span className="text-caption uppercase tracking-wider text-[var(--muted-foreground)]">
          {t("totals.categoriesLabel")}
        </span>
        <span className="text-num-md text-right text-[var(--foreground)]">
          {fmt(totalCategoryCents)} {currency}
        </span>
        <span className="text-caption uppercase tracking-wider text-[var(--muted-foreground)]">
          {t("totals.walletsLabel")}
        </span>
        <span className="text-num-md text-right text-[var(--foreground)]">
          {fmt(totalWalletCents)} {currency}
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

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
  /**
   * UAT-PH5-T3-52: "top" → mobile banner above the table; non-sticky,
   * compact stacked layout. "bottom" → desktop sticky card inset at
   * bottom-6.
   */
  position?: "top" | "bottom";
}

export function ReservesTotalsFooter({
  totalCategoryCents,
  totalWalletCents,
  mismatchCents,
  currency,
  position = "bottom",
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
        "rounded-[var(--radius-md)] border border-[var(--hairline-dark)]",
        "bg-[var(--surface-card-dark)]",
        position === "top"
          ? // UAT-PH5-T3-52: compact mobile banner. Stacked rows,
            // tight padding, no sticky positioning — sits inline at
            // the top of the content area.
            "mx-4 my-2 flex flex-col gap-2 px-4 py-3"
          : // Desktop sticky card. Floats inset from the viewport
            // edges, same look as the wallets-section column.
            "sticky bottom-6 z-30 mx-6 flex flex-row items-center justify-between gap-3 px-4 py-3 min-h-[56px]",
      ].join(" ")}
    >
      {/* UAT-PH5-T3-52: two-column key/value layout on mobile; inline
          row on desktop. Numbers right-align so the column reads as a
          mini-table. */}
      <div
        className={
          position === "top"
            ? "grid grid-cols-[1fr_auto] gap-x-3 gap-y-1"
            : "flex flex-row gap-4"
        }
      >
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

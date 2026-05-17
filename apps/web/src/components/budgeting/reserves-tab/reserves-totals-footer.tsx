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

  const fmt = (cents: string) =>
    new Intl.NumberFormat(undefined, { style: "currency", currency }).format(
      Number(cents) / 100,
    );

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
        "sticky bottom-0 z-30",
        "flex flex-col gap-2",
        "border-t border-[var(--hairline-dark)]",
        "bg-[var(--surface-card-dark)] px-4 py-3",
        "min-h-[72px] sm:min-h-[56px]",
        "sm:flex-row sm:items-center sm:justify-between",
      ].join(" ")}
    >
      <div className="flex flex-col gap-1 sm:flex-row sm:gap-4">
        <span className="text-caption uppercase tracking-wider text-[var(--muted-foreground)]">
          {t("totals.categoriesLabel")}:{" "}
          <span className="text-num-md text-[var(--foreground)]">
            {fmt(totalCategoryCents)}
          </span>
        </span>
        <span className="text-caption uppercase tracking-wider text-[var(--muted-foreground)]">
          {t("totals.walletsLabel")}:{" "}
          <span className="text-num-md text-[var(--foreground)]">
            {fmt(totalWalletCents)}
          </span>
        </span>
      </div>

      <MismatchChip
        variant={variant}
        amountFormatted={amountFormatted}
        helperText={helperText}
      />
    </div>
  );
}

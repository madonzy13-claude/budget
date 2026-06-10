"use client";
/**
 * reserves-totals-footer.tsx — reserve totals block.
 *
 *   TOTAL AVAILABLE   internalCents       (Σ active reserve)
 *   TOTAL IN WALLETS  userDefinedCents    (Σ RESERVE-wallet balances) + arrow
 *   TOTAL USED        usedThisMonthCents  (this month — prominent)
 *                     usedAllTimeCents    (all time — small + muted)
 *
 * Both used figures are summed by the client island (it holds the rows) and
 * passed in pre-aggregated — this stays a dumb presentational primitive.
 *
 * Compact block rendered BELOW the included (active) categories. Mobile:
 * full-width (matches the row cards). Desktop: a fixed, right-aligned block with
 * generous room for the amount; `sm:mr-2` aligns its right edge with the rows
 * (which carry the section's `sm:p-2` inset) so it never overflows the edge.
 * A small directional arrow sits left of TOTAL IN WALLETS: green up when the
 * wallet holds MORE than needed (userDefined > internal), red down when LESS.
 */
import * as React from "react";
import { useTranslations, useLocale } from "next-intl";
import { ArrowUp, ArrowDown } from "lucide-react";
import { centsToBare } from "@/lib/cents-format";

export interface ReservesTotalsFooterProps {
  /** Σ active reserve (engine internal), serialized cents → TOTAL AVAILABLE. */
  internalCents: string;
  /** Σ RESERVE-wallet balances (userDefined), serialized cents → TOTAL IN WALLETS. */
  userDefinedCents: string;
  /** Σ active rows' THIS-MONTH used reserve (serialized cents). */
  usedThisMonthCents: string;
  /** Σ active rows' ALL-TIME used reserve (cumulative, serialized cents). */
  usedAllTimeCents: string;
  currency: string;
}

export function ReservesTotalsFooter({
  internalCents,
  userDefinedCents,
  usedThisMonthCents,
  usedAllTimeCents,
  currency,
}: ReservesTotalsFooterProps) {
  const t = useTranslations("bdp.tab.reserves");
  const locale = useLocale();

  // Compact digits (centsToBare drops a whole-unit .00); pass locale so PL/UK
  // group separators are correct. The trailing currency code is intentional.
  const fmt = (cents: string) => centsToBare(cents, locale);

  // Wallet vs needed (TOTAL AVAILABLE = Σ reserve needed). More than needed → up
  // (green); less → down (red); equal → no arrow.
  const need = BigInt(internalCents);
  const wallet = BigInt(userDefinedCents);
  const walletDir: "up" | "down" | "none" =
    wallet > need ? "up" : wallet < need ? "down" : "none";

  const label =
    "text-caption uppercase tracking-wider text-[var(--muted-foreground)] whitespace-nowrap";
  const value =
    "flex items-center gap-1 whitespace-nowrap text-num-md tabular-nums text-[var(--foreground)]";

  return (
    <div
      data-testid="reserves-totals-footer"
      className={[
        "ml-auto sm:mr-2 w-full sm:w-[340px] max-w-full min-w-0",
        "rounded-[var(--radius-md)] border border-[var(--hairline-dark)]",
        "bg-[var(--surface-card-dark)]",
        "flex flex-col gap-2 px-4 py-3",
      ].join(" ")}
    >
      {/* TOTAL AVAILABLE */}
      <div className="flex items-center justify-between gap-4">
        <span className={label}>{t("totals.internalLabel")}</span>
        <span data-testid="reserves-total-available" className={value}>
          {fmt(internalCents)} {currency}
        </span>
      </div>

      {/* TOTAL IN WALLETS — directional arrow vs needed */}
      <div className="flex items-center justify-between gap-4">
        <span className={label}>{t("totals.walletsLabel")}</span>
        <span data-testid="reserves-total-wallets" className={value}>
          {walletDir === "up" && (
            <ArrowUp
              data-testid="reserves-wallets-arrow-up"
              className="h-3 w-3 shrink-0 text-[var(--trading-up,#26a69a)]"
              aria-hidden="true"
            />
          )}
          {walletDir === "down" && (
            <ArrowDown
              data-testid="reserves-wallets-arrow-down"
              className="h-3 w-3 shrink-0 text-[var(--destructive)]"
              aria-hidden="true"
            />
          )}
          {fmt(userDefinedCents)} {currency}
        </span>
      </div>

      {/* TOTAL USED — this month (prominent) over all time (small, muted). The
          differing size + colour separates the two periods visually. */}
      <div className="flex items-start justify-between gap-4">
        <span className={`${label} pt-0.5`}>{t("totals.usedLabel")}</span>
        {/* Period tag sits LEFT of the amount so the currency code stays the
            last token on every line → all "EUR" suffixes align flush-right. */}
        <span className="flex flex-col items-end gap-0.5">
          <span data-testid="reserves-total-used" className={value}>
            <span className="text-[9px] uppercase tracking-wider text-[var(--primary)]">
              {t("totals.thisMonth")}
            </span>
            {fmt(usedThisMonthCents)} {currency}
          </span>
          <span
            data-testid="reserves-total-used-alltime"
            className="flex items-center gap-1 whitespace-nowrap text-sm tabular-nums text-[var(--muted-foreground)]"
          >
            <span className="text-[9px] uppercase tracking-wider">
              {t("totals.allTime")}
            </span>
            {fmt(usedAllTimeCents)} {currency}
          </span>
        </span>
      </div>
    </div>
  );
}

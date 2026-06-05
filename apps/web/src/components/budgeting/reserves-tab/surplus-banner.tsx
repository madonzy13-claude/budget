"use client";
/**
 * surplus-banner.tsx — budget-level reserve reconciliation banner.
 *
 * Phase 05 reserve rewrite (05-REWRITE-SPEC.md): replaces the old MismatchChip.
 * Surplus = userDefined (Σ RESERVE-wallet balances) − internal (Σ active R).
 *   - direction TOPUP    (internal > userDefined): top up the reserve wallet.
 *   - direction WITHDRAW (internal < userDefined): withdraw from the wallet.
 *   - direction NONE     (parity): reconciled.
 *
 * The banner is read-only this phase (no onClick). role="status" so screen
 * readers re-announce when the direction changes. Visual language mirrors the
 * DESIGN.md dark canvas + single accent: destructive accent for TOPUP (action
 * required), warning accent for WITHDRAW (excess to remove), muted hairline for
 * reconciled. |surplus| is rendered pre-formatted by the caller.
 */
import * as React from "react";
import { ArrowDownToLine, ArrowUpFromLine, Check } from "lucide-react";
import { useTranslations } from "next-intl";

export type SurplusDirection = "TOPUP" | "WITHDRAW" | "NONE";

export interface SurplusBannerProps {
  direction: SurplusDirection;
  /** |surplus| pre-formatted with currency, e.g. "1 200 EUR". */
  amountFormatted?: string;
}

export function SurplusBanner({
  direction,
  amountFormatted,
}: SurplusBannerProps) {
  // Surplus copy lives under bdp.tab.reserves.surplus.{topup,withdraw,reconciled}.
  const t = useTranslations("bdp.tab.reserves.surplus");

  const isReconciled = direction === "NONE";
  const isTopup = direction === "TOPUP";

  // TOPUP → arrow drops onto the baseline (top up the wallet up to the line of
  // required reserves). WITHDRAW → arrow rises above the baseline (excess sits
  // in the wallet — remove it). Reconciled → check.
  const Icon = isReconciled
    ? Check
    : isTopup
      ? ArrowDownToLine
      : ArrowUpFromLine;

  const accent = isReconciled
    ? "var(--muted-strong)"
    : isTopup
      ? "var(--destructive)"
      : "var(--warning)";

  const borderClass = isReconciled
    ? "border-[var(--hairline-dark)]"
    : isTopup
      ? "border-[var(--destructive)]"
      : "border-[var(--warning)]";

  const label = isReconciled
    ? t("reconciled")
    : isTopup
      ? t("topup", { amount: amountFormatted ?? "" })
      : t("withdraw", { amount: amountFormatted ?? "" });

  return (
    <div
      data-testid="reserves-surplus-banner"
      data-direction={direction}
      role="status"
      className={[
        "inline-flex items-center gap-3 py-2 px-4",
        "rounded-[var(--radius-md)] border bg-transparent text-sm",
        borderClass,
      ].join(" ")}
    >
      <Icon
        className="h-4 w-4 shrink-0"
        style={{ color: accent }}
        aria-hidden={true}
      />
      <span
        className="whitespace-nowrap text-body-md font-medium"
        style={{ color: accent }}
      >
        {label}
      </span>
    </div>
  );
}

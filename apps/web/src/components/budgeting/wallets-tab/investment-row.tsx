"use client";
/**
 * investment-row.tsx — Read-only holding row presentation (Phase 9, INV-06/09).
 *
 * Pure presentational: NO inline inputs (editing is sheet-only). Desktop renders
 * all fields on one line with hover pen + trash; mobile collapses to
 * name + currency + value and taps to expand P/L% + weight% (09-UI-SPEC §Mobile
 * row). The drag handle + swipe live in the wrapping <InvestmentRowSheet> and are
 * injected via the `dragHandle` slot, so this component stays dnd-free and unit
 * testable in isolation.
 *
 * Color: P/L uses --trading-up / --trading-down as TEXT color only (semantic
 * exception); cash / no-basis renders "—" in --muted-strong; a delisted row is
 * dimmed (opacity-50, --muted-strong) which overrides any P/L color (D-09/25).
 */
import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { TrendingUp, TrendingDown, Pencil, Trash2 } from "lucide-react";
import { centsToBare } from "@/lib/cents-format";
import { desktopLabel, mobileLabel } from "@/lib/instrument-label";
import type { HoldingDto } from "@/hooks/use-investments";
import { AssetClassChip } from "./asset-class-chip";

interface InvestmentRowProps {
  holding: HoldingDto;
  /** Drag handle slot (injected by InvestmentRowSheet; omitted in unit tests). */
  dragHandle?: React.ReactNode;
  /** A grouped child — renders a touch darker to read as a nested level (D-#7). */
  nested?: boolean;
  /** Longest formatted amount in the section → dynamic amount-column width so
   *  the currency codes line up in a column (mirrors wallet-row). */
  maxAmountChars?: number;
  onEdit?: () => void;
  onDelete?: () => void;
}

/** Signed %, 1 decimal, with a real minus sign (U+2212). */
function formatPct(pct: number): string {
  const sign = pct > 0 ? "+" : pct < 0 ? "−" : "";
  return `${sign}${Math.abs(pct).toFixed(1)}%`;
}

export function InvestmentRow({
  holding,
  dragHandle,
  nested,
  maxAmountChars,
  onEdit,
  onDelete,
}: InvestmentRowProps) {
  const locale = useLocale();
  const t = useTranslations("budget.investments");
  const [expanded, setExpanded] = useState(false);

  const currency = holding.currentPriceCurrency ?? holding.buyCurrency ?? "";
  const value = centsToBare(holding.valueCents, locale);
  const weight = `${holding.weightPct.toFixed(1)}%`;
  const pct = holding.profitLossPct;
  const delisted = holding.isDelisted;

  // Name: cash shows just "Cash" (currency is its own column, D-#cash); tracked
  // instruments show TICKER / "TICKER (Name)"; everything else the stored name.
  const isCash = holding.holdingType === "cash_fx";
  const cashLabel = t("uitype.cash");
  const desktopName = isCash ? cashLabel : desktopLabel(holding);
  const mobileName = isCash ? cashLabel : mobileLabel(holding, expanded);

  // P/L cell — color/sign/icon unless delisted (dimming wins) or cash (—).
  const plColor =
    delisted || pct == null
      ? "text-[var(--muted-strong)]"
      : pct > 0
        ? "text-[var(--trading-up)]"
        : pct < 0
          ? "text-[var(--trading-down)]"
          : "text-[var(--muted-foreground)]";

  // P/L money amount (real gain/loss in the value currency, NO currency symbol)
  // derived from value + P/L%: cost = value / (1 + pl/100), amount = value − cost.
  // Shown beside the P/L% in the mobile expanded stack (D-#plmoney).
  const plMoney = (() => {
    if (pct == null) return null;
    const vc = Number(holding.valueCents || 0);
    const amt = vc - vc / (1 + pct / 100); // cents
    const sign = amt > 0 ? "+" : amt < 0 ? "−" : "";
    return `${sign}${centsToBare(String(Math.round(Math.abs(amt))), locale)}`;
  })();

  // No-basis holdings (cash) show nothing in the P/L slot — just the share% in
  // its own column (D-#cash). The "—" placeholder is dropped.
  const plNode =
    pct == null ? null : (
      <span
        className={`inline-flex items-center gap-0.5 text-num-sm ${plColor}`}
        aria-label={t("plAria", { value: formatPct(pct) })}
      >
        {!delisted && pct > 0 && (
          <TrendingUp className="h-3 w-3" aria-hidden="true" />
        )}
        {!delisted && pct < 0 && (
          <TrendingDown className="h-3 w-3" aria-hidden="true" />
        )}
        {formatPct(pct)}
      </span>
    );

  return (
    <div
      data-testid={`holding-row-${holding.name}`}
      data-delisted={delisted || undefined}
      className={[
        "group flex min-h-[56px] w-full items-center gap-2 rounded-[var(--radius-md)] px-3 transition-colors sm:min-h-[48px]",
        nested
          ? "bg-[color-mix(in_srgb,var(--surface-card-dark),#000_22%)] hover:bg-[var(--surface-card-dark)]"
          : "bg-[var(--surface-card-dark)] hover:bg-[var(--surface-elevated-dark)]",
        delisted ? "opacity-50" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {dragHandle}

      {/* Clickable cells — mobile tap lifts ONLY the name (currency + value stay
          centered) and reveals the P/L% + weight% line under the name (D-#6). */}
      <div
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        aria-label={t("rowExpandAria", { name: holding.name })}
        onClick={() => setExpanded((e) => !e)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setExpanded((x) => !x);
          }
        }}
        className="flex min-w-0 flex-1 items-center gap-2"
      >
        {/* Left column — full width on mobile-expanded (currency+amount hide).
            gap-0 + leading-tight so the 3-row card fits the row height (no grow). */}
        <div className="flex min-w-0 flex-1 flex-col justify-center gap-0 leading-tight">
          <div className="flex min-w-0 items-center gap-2">
            {/* Stock/crypto: mobile shows the TICKER (tap → full name); desktop
                shows "TICKER (Name)". Non-tracked holdings show their name. */}
            <span
              className={[
                "min-w-0 flex-1 truncate sm:hidden",
                expanded ? "text-num-sm" : "text-body-md",
                delisted
                  ? "text-[var(--muted-strong)]"
                  : "text-[var(--body-on-dark)]",
              ].join(" ")}
            >
              {mobileName}
            </span>
            <span
              className={[
                "hidden min-w-0 flex-1 truncate text-body-md sm:block",
                delisted
                  ? "text-[var(--muted-strong)]"
                  : "text-[var(--body-on-dark)]",
              ].join(" ")}
            >
              {desktopName}
            </span>
            {delisted && (
              <AssetClassChip
                label={t("row.delisted")}
                role="status"
                className="border border-[var(--hairline-dark)]"
              />
            )}
          </div>
          {/* Mobile expanded rows 2 + 3 — middle line: P/L% + P/L money (left) ·
              currency + amount (right, aligned); then "Share: X%". */}
          {expanded && (
            <div className="flex flex-col gap-0 sm:hidden">
              <div className="flex items-center justify-between gap-2 text-num-sm tabular-nums">
                <span className="flex min-w-0 items-center gap-2">
                  {plNode}
                  {plMoney && <span className={plColor}>{plMoney}</span>}
                </span>
                <span className="flex shrink-0 items-baseline gap-1">
                  <span className="text-[var(--muted-foreground)]">
                    {currency}
                  </span>
                  <span className="text-[var(--body-on-dark)]">{value}</span>
                </span>
              </div>
              <div className="text-caption text-[var(--muted-foreground)] tabular-nums">
                {t("row.share", { pct: weight })}
              </div>
            </div>
          )}
        </div>

        {/* Currency tight to the amount (gap-1, D-#3). Hidden on mobile-expanded
            (re-rendered inside the middle row so the name uses the full width);
            shown when collapsed and always on desktop. */}
        <div
          className={[
            "shrink-0 items-baseline gap-1",
            expanded ? "hidden sm:flex" : "flex",
          ].join(" ")}
        >
          <span className="text-num-sm text-[var(--muted-foreground)]">
            {currency}
          </span>
          <div
            className="text-right tabular-nums"
            style={{ minWidth: `${(maxAmountChars ?? 4) + 1}ch` }}
          >
            <span
              className={[
                "text-num-md",
                delisted
                  ? "text-[var(--muted-strong)]"
                  : "text-[var(--body-on-dark)]",
              ].join(" ")}
            >
              {value}
            </span>
          </div>
        </div>
        {/* Desktop: P/L% + weight% inline. */}
        <span className="hidden w-20 shrink-0 justify-end text-right tabular-nums sm:flex">
          {plNode}
        </span>
        <span className="hidden w-16 shrink-0 text-right text-num-sm text-[var(--muted-foreground)] tabular-nums sm:block">
          {weight}
        </span>
      </div>

      {/* Desktop hover actions — pen + trash (28×28). */}
      <div className="hidden shrink-0 items-center gap-1 sm:flex">
        <button
          type="button"
          aria-label={t("row.editAria", { name: holding.name })}
          onClick={(e) => {
            e.stopPropagation();
            onEdit?.();
          }}
          className="invisible flex h-7 w-7 items-center justify-center rounded text-[var(--muted-foreground)] hover:text-[var(--body-on-dark)] group-hover:visible"
        >
          <Pencil className="h-4 w-4" aria-hidden="true" />
        </button>
        <button
          type="button"
          aria-label={t("row.deleteAria", { name: holding.name })}
          onClick={(e) => {
            e.stopPropagation();
            onDelete?.();
          }}
          className="invisible flex h-7 w-7 items-center justify-center rounded text-[var(--destructive)] group-hover:visible"
        >
          <Trash2 className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

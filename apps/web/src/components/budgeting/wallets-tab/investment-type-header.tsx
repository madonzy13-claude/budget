"use client";
/**
 * investment-type-header.tsx — L1 type header (Phase 13 D-13..D-16, 13.1 D-26).
 *
 * Left: drag handle · chevron · type name, no indent (UAT test 2). Right: the
 * type value only. Tapping anywhere but the chevron / handle (13.1 UAT 3)
 * shows a sum-up that mirrors the asset
 * row: line 1 total P/L % then amount (P/L % = total ÷ lifetime cost, D-16),
 * line 2 a muted caption "unrealized · realized · share" with each figure
 * coloured by sign. Cash has no profit by design: no sum-up at all.
 *
 * Color: P/L via inline style tokens only (tailwind-merge drops var() text colors).
 * Testids keep the investment-group-* names so existing page objects still work.
 */
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { centsToBare } from "@/lib/cents-format";
import type { UiType } from "@/lib/investment-types";
import type { TypeGroupPL } from "@/lib/investment-type-groups";

interface InvestmentTypeHeaderProps {
  uiType: UiType;
  budgetCurrency: string;
  pl: TypeGroupPL;
  /** type value / total investments value × 100. */
  portfolioPct: number;
  /** Longest formatted amount in the section → amount-column width. */
  maxAmountChars?: number;
  expanded: boolean;
  onToggle: () => void;
  /** Block drag handle slot (the parent's useSortable listeners). */
  dragHandle?: React.ReactNode;
}

const SLOT = "\u0000";

const signColor = (n: number) =>
  n > 0
    ? "var(--trading-up)"
    : n < 0
      ? "var(--trading-down)"
      : "var(--muted-strong)";

export function InvestmentTypeHeader({
  uiType,
  budgetCurrency,
  pl,
  portfolioPct,
  maxAmountChars,
  expanded,
  onToggle,
  dragHandle,
}: InvestmentTypeHeaderProps) {
  const t = useTranslations("budget.investments");
  const locale = useLocale();
  const [showSplit, setShowSplit] = useState(false);

  const money = (cents: number) =>
    centsToBare(String(Math.round(Math.abs(cents))), locale);
  const signed = (cents: number) =>
    `${cents > 0 ? "+" : cents < 0 ? "−" : ""}${money(cents)}`;
  const pctText = (p: number) =>
    `${p > 0 ? "+" : p < 0 ? "−" : ""}${Math.abs(p).toFixed(1)}%`;

  const name = t(`uitype.${uiType}`);
  const state = expanded ? t("group.expanded") : t("group.collapsed");
  const aria = t("group.headerAria", {
    name,
    pct: `${portfolioPct.toFixed(1)}%`,
    state,
  });
  const toggleSplit = () => setShowSplit((s) => !s);
  const stop = (e: React.SyntheticEvent) => e.stopPropagation();

  return (
    <div
      data-testid={`investment-group-${uiType}`}
      data-nav-item
      data-nav-type="invest-group"
      data-nav-key={`invgroup-${uiType}`}
      onClick={toggleSplit}
      className="flex min-h-[56px] cursor-pointer items-start gap-2 rounded-[var(--radius-md)] bg-[var(--surface-card-dark)] px-3 py-2 data-[nav-highlighted=true]:bg-[var(--surface-elevated-dark)]"
    >
      {dragHandle && (
        <span
          onClick={stop}
          className="flex min-h-11 min-w-11 shrink-0 cursor-default items-center justify-center"
        >
          {dragHandle}
        </span>
      )}
      <button
        type="button"
        aria-label={aria}
        aria-expanded={expanded}
        data-testid={`investment-group-chevron-${uiType}`}
        data-nav-toggle
        onClick={(e) => {
          e.stopPropagation();
          onToggle();
        }}
        className="flex min-h-11 w-6 shrink-0 items-center justify-center"
        style={{ color: "var(--muted-foreground)" }}
      >
        {expanded ? (
          <ChevronDown className="h-4 w-4" />
        ) : (
          <ChevronRight className="h-4 w-4" />
        )}
      </button>

      <div className="flex min-h-11 min-w-0 flex-1 flex-col justify-center gap-1">
        <span
          className="min-w-0 break-words text-[16px] font-semibold leading-[1.4]"
          style={{ color: "var(--body-on-dark)" }}
        >
          {name}
        </span>
        {showSplit && uiType !== "cash" && (
          <div
            data-testid={`investment-type-split-${uiType}`}
            className="flex min-w-0 flex-col gap-0.5"
          >
            <span
              data-pl-line
              className="num flex items-baseline gap-2 text-[14px] leading-[1.5] tabular-nums"
            >
              {pl.pct == null ? (
                <span style={{ color: "var(--muted-strong)" }}>—</span>
              ) : (
                <span
                  aria-label={t("plAria", { value: pctText(pl.pct) })}
                  style={{ color: signColor(pl.pct) }}
                >
                  {pctText(pl.pct)}
                </span>
              )}
              <span style={{ color: signColor(pl.totalPLCents) }}>
                {signed(pl.totalPLCents)}
              </span>
            </span>
            <span
              data-pl-caption
              className="min-w-0 break-words text-[12px] leading-[1.4]"
              style={{ color: "var(--muted-foreground)" }}
            >
              {/* Words muted, figures coloured: split the message at each slot. */}
              {t("typeGroup.summaryCaption", { u: SLOT, r: SLOT, s: SLOT })
                .split(SLOT)
                .flatMap((part, i) => {
                  if (i === 0) return [part];
                  const [text, n] = (
                    [
                      [signed(pl.unrealizedCents), pl.unrealizedCents],
                      [signed(pl.realizedCents), pl.realizedCents],
                      [`${portfolioPct.toFixed(1)}%`, 0],
                    ] as const
                  )[i - 1]!;
                  return [
                    <span
                      key={i}
                      data-signed
                      className="num"
                      style={{
                        color: i === 3 ? "var(--body-on-dark)" : signColor(n),
                      }}
                    >
                      {text}
                    </span>,
                    part,
                  ];
                })}
            </span>
          </div>
        )}
      </div>

      <div
        role="button"
        tabIndex={0}
        aria-expanded={showSplit}
        aria-label={aria}
        data-testid={`investment-group-toggle-${uiType}`}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            toggleSplit();
          }
        }}
        className="flex min-h-11 shrink-0 cursor-pointer flex-col items-end justify-center gap-0.5 text-right tabular-nums"
      >
        <span className="flex items-baseline gap-1">
          <span
            className="text-[14px]"
            style={{ color: "var(--muted-foreground)" }}
          >
            {budgetCurrency}
          </span>
          <span
            className="num text-[16px] font-semibold leading-[1.4]"
            style={{
              color: "var(--body-on-dark)",
              minWidth: `${(maxAmountChars ?? 4) + 1}ch`,
            }}
          >
            {money(pl.valueBudgetCents)}
          </span>
        </span>
      </div>
    </div>
  );
}

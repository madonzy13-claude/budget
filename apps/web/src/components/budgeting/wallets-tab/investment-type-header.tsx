"use client";
/**
 * investment-type-header.tsx — Phase 13 type group header (D-13..D-16).
 *
 * Groups are the holding's TYPE. Left: drag handle · chevron · type name with a
 * muted "incl. realized +X" sub-line (only when realized ≠ 0). Right: value
 * over total P/L amount + % (P/L % = total ÷ lifetime cost, D-16). Tapping the
 * value area toggles the split: Unrealized / Realized / Total P/L / Lifetime
 * return.
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

  return (
    <div
      data-testid={`investment-group-${uiType}`}
      data-nav-item
      data-nav-type="invest-group"
      data-nav-key={`invgroup-${uiType}`}
      className="flex min-h-[56px] items-start gap-2 rounded-[var(--radius-md)] bg-[var(--surface-card-dark)] px-3 py-2 data-[nav-highlighted=true]:bg-[var(--surface-elevated-dark)]"
    >
      {dragHandle && (
        <span className="flex min-h-11 min-w-11 shrink-0 items-center justify-center">
          {dragHandle}
        </span>
      )}
      <button
        type="button"
        aria-label={aria}
        aria-expanded={expanded}
        data-testid={`investment-group-chevron-${uiType}`}
        data-nav-toggle
        onClick={onToggle}
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
        {pl.realizedCents !== 0 && (
          <span
            data-testid={`investment-type-realized-${uiType}`}
            className="text-[12px] leading-[1.4]"
            style={{ color: "var(--muted-foreground)" }}
          >
            {/* Words muted, amount colored: split the message at the amount. */}
            {t("typeGroup.inclRealized", { amount: SLOT })
              .split(SLOT)
              .flatMap((part, i) =>
                i === 0
                  ? [part]
                  : [
                      <span
                        key="amt"
                        data-signed
                        className="num"
                        style={{ color: signColor(pl.realizedCents) }}
                      >
                        {signed(pl.realizedCents)}
                      </span>,
                      part,
                    ],
              )}
          </span>
        )}
        {showSplit && (
          <dl
            data-testid={`investment-type-split-${uiType}`}
            className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 pt-1 text-[12px] leading-[1.4]"
          >
            {(
              [
                [
                  "typeGroup.unrealized",
                  signed(pl.unrealizedCents),
                  pl.unrealizedCents,
                ],
                [
                  "typeGroup.realized",
                  signed(pl.realizedCents),
                  pl.realizedCents,
                ],
                ["typeGroup.totalPl", signed(pl.totalPLCents), pl.totalPLCents],
                [
                  "typeGroup.lifetimeReturn",
                  pl.pct == null ? "—" : pctText(pl.pct),
                  pl.pct ?? 0,
                ],
              ] as const
            ).map(([k, v, n]) => (
              <div key={k} className="contents">
                <dt style={{ color: "var(--muted-foreground)" }}>{t(k)}</dt>
                <dd
                  className="num text-right tabular-nums"
                  style={{ color: signColor(n) }}
                >
                  {v}
                </dd>
              </div>
            ))}
          </dl>
        )}
      </div>

      <div
        role="button"
        tabIndex={0}
        aria-expanded={showSplit}
        aria-label={aria}
        data-testid={`investment-group-toggle-${uiType}`}
        onClick={toggleSplit}
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
        <span className="num flex items-baseline gap-2 text-[14px] leading-[1.5]">
          <span style={{ color: signColor(pl.totalPLCents) }}>
            {signed(pl.totalPLCents)}
          </span>
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
        </span>
      </div>
    </div>
  );
}

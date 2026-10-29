"use client";
/**
 * investment-type-header.tsx — L1 type header (Phase 13 D-13..D-16, 13.1 D-26).
 *
 * Round 2 (13.1-29): an asset-row card — same container, the handle has no
 * slot of its own, the chevron sits in the row's 16px icon slot — so handle
 * and name line up with the assets below (UAT test 3). Collapsed: name ·
 * value. Tapping anywhere but the chevron / handle mirrors the asset reveal:
 * the name shrinks, line 2 = total P/L % then amount (P/L % = total ÷
 * lifetime cost, D-16) · value, line 3 = unrealized + realized amounts (sign
 * coloured, no words) · share under the value. Cash has no profit by design:
 * no reveal at all.
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
  const split = showSplit && uiType !== "cash";
  const toggleSplit = () => setShowSplit((s) => !s);
  const stop = (e: React.SyntheticEvent) => e.stopPropagation();

  // Mirrors the asset row's right column: currency + amount; Enter toggles.
  const value = (
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
      className="flex shrink-0 cursor-pointer items-baseline gap-1 tabular-nums"
    >
      <span
        data-testid={`investment-type-value-${uiType}`}
        className="flex items-baseline gap-1"
      >
        <span
          className="text-num-sm"
          style={{ color: "var(--muted-foreground)" }}
        >
          {budgetCurrency}
        </span>
        <span
          className="num text-right text-num-md"
          style={{
            color: "var(--body-on-dark)",
            minWidth: `${(maxAmountChars ?? 4) + 1}ch`,
          }}
        >
          {money(pl.valueBudgetCents)}
        </span>
      </span>
    </div>
  );

  return (
    <div
      data-testid={`investment-group-${uiType}`}
      data-nav-item
      data-nav-type="invest-group"
      data-nav-key={`invgroup-${uiType}`}
      onClick={toggleSplit}
      className={[
        "flex min-h-[56px] w-full cursor-pointer items-center gap-2 rounded-[var(--radius-md)] bg-[var(--surface-card-dark)] px-3 sm:min-h-[48px] data-[nav-highlighted=true]:bg-[var(--surface-elevated-dark)]",
        split ? "py-1.5" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {dragHandle && (
        <span onClick={stop} className="contents">
          {dragHandle}
        </span>
      )}
      {/* The asset row's 16px icon slot: 24×44 hit area, -mx-1 nets 16px. */}
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
        className="-mx-1 flex h-11 w-6 shrink-0 items-center justify-center"
        style={{ color: "var(--muted-foreground)" }}
      >
        {expanded ? (
          <ChevronDown className="h-4 w-4" />
        ) : (
          <ChevronRight className="h-4 w-4" />
        )}
      </button>

      <div className="flex min-w-0 flex-1 flex-col justify-center gap-0 leading-tight">
        {split ? (
          <>
            <span
              className="min-w-0 break-words text-num-sm font-semibold"
              style={{ color: "var(--body-on-dark)" }}
            >
              {name}
            </span>
            <div
              data-testid={`investment-type-split-${uiType}`}
              className="flex min-w-0 flex-col gap-0"
            >
              <div className="flex items-center justify-between gap-2 text-num-sm tabular-nums">
                <span
                  data-pl-line
                  className="num flex min-w-0 items-baseline gap-2"
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
                {value}
              </div>
              {/* Inline size: tailwind-merge cannot drop it (same as the asset row). */}
              <div
                className="flex items-baseline justify-between gap-2 tabular-nums"
                style={{ fontSize: "11px", lineHeight: 1.4 }}
              >
                <span data-pl-caption className="num flex min-w-0 gap-2">
                  {(
                    [
                      ["typeGroup.unrealizedAria", pl.unrealizedCents],
                      ["typeGroup.realizedAria", pl.realizedCents],
                    ] as const
                  ).map(([key, n]) => (
                    <span
                      key={key}
                      data-signed
                      aria-label={t(key, { value: signed(n) })}
                      style={{ color: signColor(n) }}
                    >
                      {signed(n)}
                    </span>
                  ))}
                </span>
                <span
                  data-testid={`investment-type-share-${uiType}`}
                  className="shrink-0"
                  style={{ color: "var(--muted-foreground)" }}
                >
                  {t("row.share", { pct: `${portfolioPct.toFixed(1)}%` })}
                </span>
              </div>
            </div>
          </>
        ) : (
          <div className="flex min-w-0 items-center gap-2">
            <span
              className="min-w-0 flex-1 break-words text-body-md font-semibold"
              style={{ color: "var(--body-on-dark)" }}
            >
              {name}
            </span>
            {value}
          </div>
        )}
      </div>
    </div>
  );
}

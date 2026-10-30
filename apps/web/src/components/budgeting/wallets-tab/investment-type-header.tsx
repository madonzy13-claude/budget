"use client";
/**
 * investment-type-header.tsx — L1 type header (Phase 13 D-13..D-16, 13.1 D-26).
 *
 * Round 2 (13.1-29): an asset-row card — same container, the handle has no
 * slot of its own (R6-7: no chevron, no slot for one) — so handle
 * and name line up with the assets below (UAT test 3). Collapsed: name ·
 * value. Tapping anywhere but the chevron / handle mirrors the asset reveal:
 * the name shrinks, line 2 = total P/L % then amount (P/L % = total ÷
 * lifetime cost, D-16) · value, line 3 = "unrealized: X realized: Y" (words
 * muted, figures sign-coloured) · share under the value. Round 3: the reveal
 * fits the 56px card like the asset row (no grow), the name is normal weight,
 * zero reads "+0.0%" / "+0" with a grey rise, and cash (no profit by design)
 * reveals only its share.
 *
 * Color: P/L via inline style tokens only (tailwind-merge drops var() text colors).
 * Testids keep the investment-group-* names so existing page objects still work.
 */
import { FitLine } from "@/components/common/fit-line";
import { useLocale, useTranslations } from "next-intl";
import { useRef } from "react";
import { TrendingDown, TrendingUp } from "lucide-react";
import { centsToShort } from "@/lib/cents-format";
import type { UiType } from "@/lib/investment-types";
import { UI_TYPE_COLOR, UI_TYPE_ICON } from "@/lib/investment-icons";
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

const SLOT = "\u0000";

/** "unreal.: X  real.: Y" — words muted, figures by sign (round 6: zero reads
 *  "0"). Shared by the type header and, round 6, each asset row. */
export function PlCaption({
  unrealizedCents,
  realizedCents,
  until,
  style,
  ...rest
}: {
  unrealizedCents: number;
  realizedCents: number;
  until?: React.RefObject<HTMLElement | null>;
} & React.HTMLAttributes<HTMLSpanElement>) {
  const t = useTranslations("budget.investments");
  const locale = useLocale();
  // Round 6 (user): zero reads "0" — no sign.
  const signed = (cents: number) =>
    `${cents < 0 ? "−" : cents > 0 ? "+" : ""}${centsToShort(String(Math.round(Math.abs(cents))), locale)}`;
  return (
    <FitLine
      {...rest}
      until={until}
      // One line, never wraps (round-4 gaps 13 + 17): short labels; what
      // still does not fit scrolls to its end and back.
      className="num tabular-nums"
      style={{
        color: "var(--muted-foreground)",
        fontSize: "11px",
        lineHeight: 1.4,
        // Round 6 (user): lighter than the main figures, header and asset alike.
        opacity: 0.7,
        ...style,
      }}
    >
      {(
        [
          ["typeGroup.unrealizedLabel", unrealizedCents],
          ["typeGroup.realizedLabel", realizedCents],
        ] as const
      ).map(([key, n]) => {
        const [before, after = ""] = t(key, { value: SLOT }).split(SLOT);
        return (
          <span key={key}>
            {before}
            <span data-signed style={{ color: signColor(n) }}>
              {signed(n)}
            </span>
            {after}
          </span>
        );
      })}
    </FitLine>
  );
}

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
  // The caption may use the room up to the share before it scrolls.
  const shareRef = useRef<HTMLSpanElement>(null);

  const money = (cents: number) =>
    centsToShort(String(Math.round(Math.abs(cents))), locale);
  // Round 3: zero reads "+0" like a gain (grey, flat trend).
  const signed = (cents: number) => `${cents < 0 ? "−" : "+"}${money(cents)}`;
  const pctText = (p: number) =>
    `${p < 0 ? "−" : "+"}${Math.abs(p).toFixed(1)}%`;

  const name = t(`uitype.${uiType}`);
  const state = expanded ? t("group.expanded") : t("group.collapsed");
  const aria = t("group.headerAria", {
    name,
    pct: `${portfolioPct.toFixed(1)}%`,
    state,
  });
  // R6-7 (user): open = stats shown; closed = value only. No separate reveal.
  const showSplit = expanded;
  const split = expanded && uiType !== "cash";
  const Icon = UI_TYPE_ICON[uiType];
  const stop = (e: React.SyntheticEvent) => e.stopPropagation();

  // Mirrors the asset row's right column: currency + amount; Enter toggles.
  // Revealed, it shrinks to the asset row's small value so the three lines fit
  // the card (it grew 56 → 69.6px).
  const value = (
    <div className="flex shrink-0 items-baseline gap-1 tabular-nums">
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
          className={`num text-right ${showSplit ? "text-num-sm" : "text-num-md"}`}
          // Tapped (cash too): currency hugs the amount like the asset row (round-4
          // gap 12 — the column width pushed "PLN" under the P/L line).
          style={{
            color: "var(--body-on-dark)",
            minWidth: showSplit ? undefined : `${(maxAmountChars ?? 4) + 1}ch`,
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
      // R6-7: the whole header row is the one toggle (no chevron).
      role="button"
      tabIndex={0}
      aria-expanded={expanded}
      aria-label={aria}
      data-nav-toggle
      onClick={onToggle}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onToggle();
        }
      }}
      className="flex min-h-[56px] w-full cursor-pointer items-center gap-2 rounded-[var(--radius-md)] bg-[var(--surface-card-dark)] px-3 sm:min-h-[48px] data-[nav-highlighted=true]:bg-[var(--surface-elevated-dark)]"
    >
      {dragHandle && (
        <span onClick={stop} className="contents">
          {dragHandle}
        </span>
      )}

      {/* Round 4: the type icon lives here (not on each asset). */}
      <Icon
        data-type-icon
        className="h-4 w-4 shrink-0"
        style={{ color: UI_TYPE_COLOR[uiType] }}
        aria-hidden="true"
      />

      {/* Round 4: two columns, each centred on its own — the right stack
          never rides a line lower than the left. */}
      <div
        data-col="left"
        className="flex min-w-0 flex-1 flex-col justify-center gap-0 leading-tight"
      >
        <span
          className={`min-w-0 break-words ${split ? "text-num-sm" : "text-body-md"}`}
          style={{ color: "var(--body-on-dark)" }}
        >
          {name}
        </span>
        {split && (
          <div
            data-testid={`investment-type-split-${uiType}`}
            className="flex min-w-0 flex-col gap-0"
          >
            <span
              data-pl-line
              className="num flex min-w-0 items-baseline gap-2 text-num-sm tabular-nums"
            >
              {pl.pct == null ? (
                <span style={{ color: "var(--muted-strong)" }}>—</span>
              ) : (
                <span
                  aria-label={t("plAria", { value: pctText(pl.pct) })}
                  className="inline-flex items-center gap-0.5"
                  style={{ color: signColor(pl.pct) }}
                >
                  {pl.pct < 0 ? (
                    <TrendingDown
                      data-pl-trend="down"
                      className="h-3 w-3"
                      aria-hidden="true"
                    />
                  ) : (
                    <TrendingUp
                      data-pl-trend={pl.pct > 0 ? "up" : "flat"}
                      className="h-3 w-3"
                      aria-hidden="true"
                      style={{ color: signColor(pl.pct) }}
                    />
                  )}
                  {pctText(pl.pct)}
                </span>
              )}
              <span style={{ color: signColor(pl.totalPLCents) }}>
                {signed(pl.totalPLCents)}
              </span>
            </span>
            {/* Inline size: tailwind-merge cannot drop it (same as the asset row). */}
            <PlCaption
              data-pl-caption
              unrealizedCents={pl.unrealizedCents}
              realizedCents={pl.realizedCents}
              until={shareRef}
            />
          </div>
        )}
      </div>
      <div
        data-col="right"
        className="flex shrink-0 flex-col items-end justify-center gap-0 leading-tight"
      >
        {value}
        {showSplit && (
          <span
            ref={shareRef}
            data-testid={`investment-type-share-${uiType}`}
            className="tabular-nums"
            style={{
              color: "var(--muted-foreground)",
              fontSize: "11px",
              lineHeight: 1.4,
              opacity: 0.7, // round 6 (user): lighter, like the asset row
            }}
          >
            {t("row.share", { pct: `${Number(portfolioPct.toFixed(1))}%` })}
          </span>
        )}
      </div>
    </div>
  );
}

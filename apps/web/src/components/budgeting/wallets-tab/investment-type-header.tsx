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
import { useIsWide } from "@/hooks/use-is-wide";
import { CurrencyPicker } from "@/components/common/currency-picker";
import { UpdatedAgo } from "./updated-ago";
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
  /** R6 (user): show the group in another currency (the wallets' picker). */
  onCurrencyChange?: (currency: string) => void;
  /** Block drag handle slot (the parent's useSortable listeners). */
  dragHandle?: React.ReactNode;
  /** R6 (user): the newest change among the group's assets — "↻ 5m ago"
   *  (a group's total always updates by itself, so always ↻). */
  updatedAt?: string | null;
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
  /** null = cash-like: no realized part (R6, user). */
  realizedCents: number | null;
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
          ...(realizedCents === null
            ? []
            : [["typeGroup.realizedLabel", realizedCents] as const]),
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
  updatedAt,
  expanded,
  onToggle,
  onCurrencyChange,
  dragHandle,
}: InvestmentTypeHeaderProps) {
  const t = useTranslations("budget.investments");
  const locale = useLocale();
  const wide = useIsWide();
  // The caption may use the room up to the share before it scrolls.
  const shareRef = useRef<HTMLSpanElement>(null);

  const money = (cents: number) =>
    centsToShort(String(Math.round(Math.abs(cents))), locale);
  // Round 3: zero reads "+0" like a gain (grey, flat trend).
  const signed = (cents: number) => `${cents < 0 ? "−" : "+"}${money(cents)}`;
  const pctText = (p: number) =>
    `${p < 0 ? "−" : "+"}${Number(Math.abs(p).toFixed(1))}%`; // 6%, not 6.0%

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
        className={`relative flex items-baseline ${showSplit ? "gap-1" : "gap-2 sm:gap-1"}`}
      >
        {onCurrencyChange ? (
          // Picking a currency never toggles the group.
          <span
            data-testid={`investment-type-currency-${uiType}`}
            // R6 (user): the spending wallets' currency cell — full label on
            // a wide screen, the code alone on a narrow one.
            className={`w-[44px] shrink-0 self-center text-num-sm sm:block sm:w-[96px] md:w-[224px] max-sm:[&_select]:text-right max-sm:[&_select]:[text-align-last:right] ${showSplit ? "hidden" : "block"}`}
            style={{ color: "var(--muted-foreground)" }}
            onClick={stop}
            onKeyDown={stop}
            onPointerDown={stop}
          >
            <CurrencyPicker
              value={budgetCurrency}
              onSelect={onCurrencyChange}
              aria-label={t("group.currencyAria", { name })}
              richLabel={wide}
              desktopDropdown={wide}
            />
          </span>
        ) : (
          <span
            className="text-num-sm"
            style={{ color: "var(--muted-foreground)" }}
          >
            {budgetCurrency}
          </span>
        )}
        {/* R6 (user): desktop never shrinks (.text-num-* are plain classes
            with no sm: variant) — its own span at the asset row's size. */}
        <span
          data-testid={`investment-type-amount-desktop-${uiType}`}
          className="num hidden text-right text-num-md sm:inline"
          style={{
            color: "var(--body-on-dark)",
            minWidth: `${(maxAmountChars ?? 4) + 1}ch`,
          }}
        >
          {money(pl.valueBudgetCents)}
        </span>
        {onCurrencyChange && showSplit && (
          // R6 (user): open on a phone = the asset row's open value line —
          // plain currency hugging the amount, no picker.
          <span
            className="text-num-sm sm:hidden"
            style={{ color: "var(--muted-foreground)" }}
          >
            {budgetCurrency}
          </span>
        )}
        <span
          data-testid={`investment-type-amount-mobile-${uiType}`}
          className={`num text-right sm:hidden ${showSplit ? "text-num-sm" : "text-num-md min-w-[var(--amt)]"}`}
          // Tapped (cash too): currency hugs the amount like the asset row (round-4
          // gap 12 — the column width pushed "PLN" under the P/L line).
          style={
            {
              color: "var(--body-on-dark)",
              "--amt": `${maxAmountChars ?? 4}ch`,
            } as React.CSSProperties
          }
        >
          {money(pl.valueBudgetCents)}
        </span>
        {/* R6 (user): under the amount like the assets; an open group on a
            phone has its share there instead. */}
        <UpdatedAgo
          at={updatedAt}
          kind="price"
          className={showSplit ? "hidden sm:flex" : undefined}
        />
      </span>
    </div>
  );

  const pctNode =
    pl.pct == null ? (
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
    );
  const hasPL = uiType !== "cash";

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
          data-testid={`investment-type-name-mobile-${uiType}`}
          className={`min-w-0 break-words sm:hidden ${split ? "text-num-sm" : "text-body-md"}`}
          style={{ color: "var(--body-on-dark)" }}
        >
          {name}
        </span>
        <span
          data-testid={`investment-type-name-desktop-${uiType}`}
          className="hidden min-w-0 break-words text-body-md sm:block"
          style={{ color: "var(--body-on-dark)" }}
        >
          {name}
        </span>
        {/* R6 (user): desktop shows unrealized · realized, closed or open. */}
        {hasPL && (
          <div
            data-testid={`investment-type-caption-desktop-${uiType}`}
            className="hidden min-w-0 sm:block"
          >
            <PlCaption
              data-pl-caption
              unrealizedCents={pl.unrealizedCents}
              realizedCents={pl.realizedCents}
            />
          </div>
        )}
        {split && (
          <div
            data-testid={`investment-type-split-${uiType}`}
            className="flex min-w-0 flex-col gap-0 sm:hidden"
          >
            <span
              data-pl-line
              className="num flex min-w-0 items-baseline gap-2 text-num-sm tabular-nums"
            >
              {pctNode}
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
      {/* Desktop columns, as the asset row (R6, user): qty (blank) · P/L % ·
          P/L amount · value · share · the actions slot. */}
      <span className="hidden w-20 shrink-0 sm:block" aria-hidden="true" />
      <span
        {...(hasPL ? { "data-pl-line": true } : {})}
        className="hidden shrink-0 gap-2 sm:flex"
      >
        <span
          data-testid={`investment-type-pl-desktop-${uiType}`}
          className="flex w-20 shrink-0 justify-end text-right text-num-sm tabular-nums"
        >
          {hasPL ? pctNode : null}
        </span>
        <span
          data-testid={`investment-type-plamt-desktop-${uiType}`}
          className="flex w-24 shrink-0 justify-end text-right text-num-sm tabular-nums"
          style={{ color: signColor(pl.totalPLCents) }}
        >
          {hasPL ? signed(pl.totalPLCents) : ""}
        </span>
      </span>
      <div
        data-col="right"
        className="flex shrink-0 flex-col items-end justify-center gap-0 leading-tight"
      >
        {value}
        {showSplit && (
          <span
            ref={shareRef}
            data-testid={`investment-type-share-${uiType}`}
            className="tabular-nums sm:hidden"
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
      <span
        data-testid={`investment-type-share-desktop-${uiType}`}
        className="hidden w-16 shrink-0 text-right text-num-sm tabular-nums sm:block"
        style={{ color: "var(--muted-foreground)" }}
      >
        {`${Number(portfolioPct.toFixed(1))}%`}
      </span>
      <span
        data-desktop-actions-slot
        className="hidden w-7 shrink-0 sm:block"
        aria-hidden="true"
      />
    </div>
  );
}

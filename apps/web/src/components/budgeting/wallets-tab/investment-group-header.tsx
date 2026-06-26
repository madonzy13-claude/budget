"use client";
/**
 * investment-group-header.tsx — group header that behaves like an investment ROW
 * (Phase 9 group redesign).
 *
 * A group is now a first-class, draggable/sortable entry. The header mirrors the
 * row layout:
 *   - Desktop (sm:): name · budget-currency · amount · P/L% · portfolio% inline.
 *   - Mobile: name · budget-currency · amount; TAP the body toggles a second line
 *     with P/L% + portfolio% (same gesture as a row).
 * The chevron is the dedicated collapse toggle for the group's children. The
 * group drag handle is injected via `dragHandle` (the parent's useSortable). The
 * header is rendered inside the group's sortable node, so a holding dropped over
 * it registers as "join this group".
 *
 * Color: P/L uses --trading-up / --trading-down as TEXT only (semantic exception);
 * no-basis groups render "—" in --muted-strong.
 */
import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  ChevronDown,
  ChevronRight,
  TrendingUp,
  TrendingDown,
} from "lucide-react";
import { centsToBare } from "@/lib/cents-format";

interface InvestmentGroupHeaderProps {
  groupName: string;
  budgetCurrency: string;
  /** Σ value in budget cents across the group's children. */
  valueBudgetCents: number;
  /** Cost-basis blended P/L% (null when no child has a basis). */
  plPct: number | null;
  /** group value / total investments value × 100, 1 decimal. */
  portfolioPct: number;
  /** Longest formatted amount in the section → dynamic amount-column width. */
  maxAmountChars?: number;
  expanded: boolean;
  onToggle: () => void;
  /** Group drag handle slot (the parent's useSortable listeners). */
  dragHandle?: React.ReactNode;
  /** True when the group is over a droppable target (drop-to-join highlight). */
  isOver?: boolean;
}

function formatPct(pct: number): string {
  const sign = pct > 0 ? "+" : pct < 0 ? "−" : "";
  return `${sign}${Math.abs(pct).toFixed(1)}%`;
}

export function InvestmentGroupHeader({
  groupName,
  budgetCurrency,
  valueBudgetCents,
  plPct,
  portfolioPct,
  maxAmountChars,
  expanded,
  onToggle,
  dragHandle,
  isOver,
}: InvestmentGroupHeaderProps) {
  const t = useTranslations("budget.investments");
  const locale = useLocale();
  const [metricsOpen, setMetricsOpen] = useState(false);

  const amount = centsToBare(String(Math.round(valueBudgetCents)), locale);
  const portfolio = `${portfolioPct.toFixed(1)}%`;

  const plColor =
    plPct == null
      ? "text-[var(--muted-strong)]"
      : plPct > 0
        ? "text-[var(--trading-up)]"
        : plPct < 0
          ? "text-[var(--trading-down)]"
          : "text-[var(--muted-foreground)]";

  const plNode =
    plPct == null ? (
      <span className="text-num-sm text-[var(--muted-strong)]" aria-label="—">
        —
      </span>
    ) : (
      <span
        className={`inline-flex items-center gap-0.5 text-num-sm ${plColor}`}
        aria-label={t("plAria", { value: formatPct(plPct) })}
      >
        {plPct > 0 && <TrendingUp className="h-3 w-3" aria-hidden="true" />}
        {plPct < 0 && <TrendingDown className="h-3 w-3" aria-hidden="true" />}
        {formatPct(plPct)}
      </span>
    );

  // Group P/L money amount (budget ccy, no symbol) — same derivation as the row.
  const plMoney = (() => {
    if (plPct == null) return null;
    const amt = valueBudgetCents - valueBudgetCents / (1 + plPct / 100);
    const sign = amt > 0 ? "+" : amt < 0 ? "−" : "";
    return `${sign}${centsToBare(String(Math.round(Math.abs(amt))), locale)}`;
  })();

  return (
    <div
      data-testid={`investment-group-${groupName}`}
      className={[
        "group flex min-h-[56px] items-center gap-2 rounded-[var(--radius-md)] px-3",
        "bg-[var(--surface-card-dark)] sm:min-h-[48px]",
        isOver
          ? "ring-2 ring-dashed ring-[var(--info-ring)] bg-[var(--surface-elevated-dark)]/60"
          : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {dragHandle}

      {/* Collapse children toggle (dedicated affordance). */}
      <button
        type="button"
        aria-expanded={expanded}
        aria-label={t("group.headerAria", {
          name: groupName,
          pct: portfolio,
          state: expanded ? t("group.expanded") : t("group.collapsed"),
        })}
        data-testid={`investment-group-toggle-${groupName}`}
        onClick={onToggle}
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-[var(--muted-foreground)] hover:text-[var(--body-on-dark)]"
      >
        {expanded ? (
          <ChevronDown className="h-4 w-4" aria-hidden="true" />
        ) : (
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        )}
      </button>

      {/* Body — mobile tap lifts ONLY the name (currency + amount stay centered)
          and reveals P/L% + portfolio% under the name (D-#6). */}
      <div
        role="button"
        tabIndex={0}
        aria-expanded={metricsOpen}
        aria-label={t("group.metricsAria", { name: groupName })}
        onClick={() => setMetricsOpen((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setMetricsOpen((v) => !v);
          }
        }}
        className="flex min-w-0 flex-1 items-center gap-2"
      >
        {/* Left column — full width on mobile-expanded; gap-0 + leading-tight so
            the 3-row card fits the header height (no grow), like the row. */}
        <div className="flex min-w-0 flex-1 flex-col justify-center gap-0 leading-tight">
          <span
            className={[
              "min-w-0 truncate text-[var(--body-on-dark)]",
              metricsOpen ? "text-num-sm font-medium" : "text-title-sm",
            ].join(" ")}
          >
            {groupName}
          </span>
          {/* Mobile expanded: P/L% + P/L money (left) · currency + amount (right);
              then "Share: portfolio%". */}
          {metricsOpen && (
            <div className="flex flex-col gap-0 sm:hidden">
              <div className="flex items-center justify-between gap-2 text-num-sm tabular-nums">
                <span className="flex min-w-0 items-center gap-2">
                  {plNode}
                  {plMoney && <span className={plColor}>{plMoney}</span>}
                </span>
                <span className="flex shrink-0 items-baseline gap-1">
                  <span className="text-[var(--muted-foreground)]">
                    {budgetCurrency}
                  </span>
                  <span className="text-[var(--body-on-dark)]">{amount}</span>
                </span>
              </div>
              <div className="text-caption text-[var(--muted-foreground)] tabular-nums">
                {t("row.share", { pct: portfolio })}
              </div>
            </div>
          )}
        </div>

        {/* Currency tight to amount (gap-1). Hidden on mobile-expanded (moves into
            the middle row); shown collapsed + on desktop. */}
        <div
          className={[
            "shrink-0 items-baseline gap-1",
            metricsOpen ? "hidden sm:flex" : "flex",
          ].join(" ")}
        >
          <span className="text-num-sm text-[var(--muted-foreground)]">
            {budgetCurrency}
          </span>
          <div
            className="text-right tabular-nums"
            style={{ minWidth: `${(maxAmountChars ?? 4) + 1}ch` }}
          >
            <span className="text-num-md text-[var(--body-on-dark)]">
              {amount}
            </span>
          </div>
        </div>
        {/* Desktop: P/L% + portfolio% inline. */}
        <span className="hidden w-20 shrink-0 justify-end text-right tabular-nums sm:flex">
          {plNode}
        </span>
        <span className="hidden w-16 shrink-0 text-right text-num-sm text-[var(--muted-foreground)] tabular-nums sm:block">
          {portfolio}
        </span>
      </div>

      {/* Desktop trailing spacer — matches the row's hover-action area so the
          group's right edge aligns with the holding rows' (D-#5). */}
      <div className="hidden w-[60px] shrink-0 sm:block" aria-hidden="true" />
    </div>
  );
}

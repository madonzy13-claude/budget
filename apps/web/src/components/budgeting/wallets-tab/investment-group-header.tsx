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
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useState } from "react";
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
  /** Aggregate P/L money in BUDGET cents (Σvalue − Σcost over children with a
   *  basis); null when no child has a basis. Shown beside the P/L% (UAT #7). */
  plCents?: number | null;
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
  plCents,
  portfolioPct,
  maxAmountChars,
  expanded,
  onToggle,
  dragHandle,
  isOver,
}: InvestmentGroupHeaderProps) {
  const t = useTranslations("budget.investments");
  const locale = useLocale();

  // Desktop: a body click toggles the group's children (collapse/expand). Mobile:
  // the children-toggle is the chevron; a body TAP reveals the group's sum-up
  // (P/L% + portfolio%) as a second line — the same gesture a holding ROW uses —
  // since mobile has no room for the desktop columns. matchMedia picks the
  // behaviour; defaults to mobile until mounted (SSR-safe, test-safe).
  const [isDesktop, setIsDesktop] = useState(false);
  const [showSum, setShowSum] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 640px)");
    const sync = () => setIsDesktop(mq.matches);
    sync();
    mq.addEventListener?.("change", sync);
    return () => mq.removeEventListener?.("change", sync);
  }, []);

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

  // Group P/L money amount (budget ccy, no symbol) — the real aggregate from the
  // parent (Σvalue − Σcost), NOT back-derived from the rounded plPct (which ÷0's
  // at a −100% total-loss group). null → no money node.
  const plMoney = (() => {
    if (plCents == null) return null;
    const sign = plCents > 0 ? "+" : plCents < 0 ? "−" : "";
    return `${sign}${centsToBare(String(Math.round(Math.abs(plCents))), locale)}`;
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

      {/* Body click: DESKTOP toggles the children (collapse/expand); MOBILE reveals
          the sum-up second line (the chevron toggles children on mobile). */}
      <div
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        aria-label={t("group.headerAria", {
          name: groupName,
          pct: portfolio,
          state: expanded ? t("group.expanded") : t("group.collapsed"),
        })}
        data-testid={`investment-group-toggle-${groupName}`}
        onClick={() => (isDesktop ? onToggle() : setShowSum((s) => !s))}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            isDesktop ? onToggle() : setShowSum((s) => !s);
          }
        }}
        className="flex min-w-0 flex-1 items-center gap-2"
      >
        {/* Chevron = the children collapse/expand control (its own click so it works
            on mobile too, where the body tap shows the sum-up instead). w-4 matches
            the holding row's type-icon footprint so the name x-aligns (UAT). */}
        <button
          type="button"
          aria-label={t("group.headerAria", {
            name: groupName,
            pct: portfolio,
            state: expanded ? t("group.expanded") : t("group.collapsed"),
          })}
          data-testid={`investment-group-chevron-${groupName}`}
          onClick={(e) => {
            e.stopPropagation();
            onToggle();
          }}
          className="flex h-4 w-4 shrink-0 items-center justify-center text-[var(--muted-foreground)]"
        >
          {expanded ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
        </button>
        {/* Left column — gap-0 + leading-tight so the header keeps the row height.
            On mobile, a tap reveals the sum-up (P/L% + portfolio%) as a 2nd line. */}
        <div className="flex min-w-0 flex-1 flex-col justify-center gap-0 leading-tight">
          <span className="min-w-0 truncate text-body-md text-[var(--body-on-dark)]">
            {groupName}
          </span>
          {showSum && (
            <div
              data-testid={`investment-group-sum-${groupName}`}
              className="flex items-center gap-2 text-num-sm tabular-nums sm:hidden"
            >
              {plNode}
              {plMoney && <span className={plColor}>{plMoney}</span>}
              <span className="text-[var(--muted-foreground)]">
                {t("row.share", { pct: portfolio })}
              </span>
            </div>
          )}
        </div>

        {/* Desktop columns mirror the holding row (UAT #7): qty · P/L% · P/L amt ·
            value · weight. A group has no single quantity → the qty cell is an
            empty spacer purely to keep the columns aligned with the rows. */}
        <span className="hidden w-20 shrink-0 sm:block" aria-hidden="true" />
        <span className="hidden w-20 shrink-0 justify-end text-right tabular-nums sm:flex">
          {plNode}
        </span>
        <span
          className={`hidden w-24 shrink-0 justify-end text-right text-num-sm tabular-nums sm:flex ${plColor}`}
        >
          {plMoney ?? ""}
        </span>
        {/* Currency tight to amount (gap-1) — always shown (collapsed + desktop). */}
        <div className="flex shrink-0 items-baseline gap-1">
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
        {/* Desktop: portfolio weight% last. */}
        <span className="hidden w-16 shrink-0 text-right text-num-sm text-[var(--muted-foreground)] tabular-nums sm:block">
          {portfolio}
        </span>
      </div>

      {/* Desktop trailing spacer — matches the row's single-trash hover area (w-7)
          so the group's right edge aligns with the holding rows' (D-#5). */}
      <div className="hidden w-7 shrink-0 sm:block" aria-hidden="true" />
    </div>
  );
}

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
import type { HoldingDto } from "@/hooks/use-investments";
import { AssetClassChip } from "./asset-class-chip";

interface InvestmentRowProps {
  holding: HoldingDto;
  /** Drag handle slot (injected by InvestmentRowSheet; omitted in unit tests). */
  dragHandle?: React.ReactNode;
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

  // P/L cell — color/sign/icon unless delisted (dimming wins) or cash (—).
  const plColor =
    delisted || pct == null
      ? "text-[var(--muted-strong)]"
      : pct > 0
        ? "text-[var(--trading-up)]"
        : pct < 0
          ? "text-[var(--trading-down)]"
          : "text-[var(--muted-foreground)]";

  const plNode =
    pct == null ? (
      <span className="text-num-sm text-[var(--muted-strong)]" aria-label="—">
        —
      </span>
    ) : (
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
        "group flex min-h-[56px] w-full items-center gap-2 rounded-[var(--radius-md)]",
        "bg-[var(--surface-card-dark)] px-3 transition-colors hover:bg-[var(--surface-elevated-dark)] sm:min-h-[48px]",
        delisted ? "opacity-50" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {dragHandle}

      {/* Clickable cells — mobile tap toggles the expanded second line. */}
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
        className="flex min-w-0 flex-1 flex-col justify-center gap-0.5"
      >
        <div className="flex min-w-0 items-center gap-2">
          <span
            className={[
              "min-w-0 flex-1 truncate text-body-md",
              delisted ? "text-[var(--muted-strong)]" : "text-[var(--body-on-dark)]",
            ].join(" ")}
          >
            {holding.name}
          </span>
          {delisted && (
            <AssetClassChip
              label={t("row.delisted")}
              role="status"
              className="border border-[var(--hairline-dark)]"
            />
          )}
          <span className="w-12 shrink-0 text-num-sm text-[var(--muted-foreground)] sm:w-16">
            {currency}
          </span>
          <span
            className={[
              "shrink-0 text-right text-num-md tabular-nums",
              delisted ? "text-[var(--muted-strong)]" : "text-[var(--body-on-dark)]",
            ].join(" ")}
          >
            {value}
          </span>
          {/* Desktop: P/L% + weight% inline. */}
          <span className="hidden w-20 shrink-0 justify-end text-right tabular-nums sm:flex">
            {plNode}
          </span>
          <span className="hidden w-16 shrink-0 text-right text-num-sm text-[var(--muted-foreground)] tabular-nums sm:block">
            {weight}
          </span>
        </div>

        {/* Mobile: expanded second line. */}
        {expanded && (
          <div className="flex items-center gap-3 sm:hidden">
            {plNode}
            <span className="text-num-sm text-[var(--muted-foreground)] tabular-nums">
              {weight}
            </span>
          </div>
        )}
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

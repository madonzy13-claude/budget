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
import { useState, useEffect } from "react";
import { useLocale, useTranslations } from "next-intl";
import { TrendingUp, TrendingDown, Trash2 } from "lucide-react";
import { centsToBare } from "@/lib/cents-format";
import { desktopLabel, mobileLabel } from "@/lib/instrument-label";
import { holdingIcon } from "@/lib/investment-icons";
import { useBdpUiStore } from "@/components/budgeting/bdp-ui-state";
import type { HoldingDto } from "@/hooks/use-investments";
import { AssetClassChip } from "./asset-class-chip";

interface InvestmentRowProps {
  holding: HoldingDto;
  /** Drag handle slot (injected by InvestmentRowSheet; omitted in unit tests). */
  dragHandle?: React.ReactNode;
  /** A grouped child — distinct surface (darker in dark mode, lighter in light)
   *  so it reads as a nested level (D-#7). */
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
  // Tapped-open (mobile P/L expand) persists across pill navigation for the BDP's
  // lifetime (round 18 item 2) — seed from + write to the BDP store by holding id.
  const bdpStore = useBdpUiStore();
  const [expanded, setExpanded] = useState(
    () => bdpStore?.wallets.expandedRows[holding.id] ?? false,
  );

  // Desktop has no hover edit pen anymore (UAT #7) — a desktop row-click opens the
  // edit sheet instead. On mobile the same click toggles the inline P/L (the pen
  // lives in the swipe panel). matchMedia drives which behaviour the body click
  // uses; defaults to mobile until mounted (SSR-safe, test-safe).
  const [isDesktop, setIsDesktop] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 640px)");
    const sync = () => setIsDesktop(mq.matches);
    sync();
    mq.addEventListener?.("change", sync);
    return () => mq.removeEventListener?.("change", sync);
  }, []);
  const activate = () => {
    if (isDesktop) onEdit?.();
    else
      setExpanded((e) => {
        const next = !e;
        if (bdpStore) bdpStore.wallets.expandedRows[holding.id] = next;
        return next;
      });
  };

  const currency = holding.currentPriceCurrency ?? holding.buyCurrency ?? "";
  const value = centsToBare(holding.valueCents, locale);
  const weight = `${holding.weightPct.toFixed(1)}%`;
  const pct = holding.profitLossPct;
  const delisted = holding.isDelisted;

  // Name: cash shows just "Cash" (currency is its own column, D-#cash); tracked
  // instruments show TICKER / "TICKER (Name)"; everything else the stored name.
  const isCash = holding.holdingType === "cash_fx";
  const cashLabel = t("uitype.cash");

  // Quantity for the mobile-expanded row — only for holdings where it's meaningful
  // (tracked / metals). Cash + broker are single-unit (qty 1), so omit it. Trim
  // trailing zeros from the numeric(28,8) string so "10.00000000" → "10".
  const showQty = !isCash && holding.uiType !== "broker";
  const qtyDisplay = holding.quantity.includes(".")
    ? holding.quantity.replace(/0+$/, "").replace(/\.$/, "")
    : holding.quantity;
  const desktopName = isCash ? cashLabel : desktopLabel(holding);
  const mobileName = isCash ? cashLabel : mobileLabel(holding, expanded);

  // Type icon + fixed accent color so the list is scannable by asset type.
  const { Icon: TypeIcon, color: typeColor } = holdingIcon(holding);

  // P/L cell — color/sign/icon unless delisted (dimming wins) or cash (—).
  const plColor =
    delisted || pct == null
      ? "text-[var(--muted-strong)]"
      : pct > 0
        ? "text-[var(--trading-up)]"
        : pct < 0
          ? "text-[var(--trading-down)]"
          : "text-[var(--muted-foreground)]";

  // P/L money amount (real gain/loss, NO currency symbol). Read straight from the
  // SERVER's profitLossCents (computed from the real cost basis). It must NOT be
  // back-derived as value/(1 + pl/100): pl is rounded to 1 decimal, so a near-total
  // loss rounds to -100.0 → ÷0 → the amount collapsed to "-0" (260626 bug).
  // Shown beside the P/L% in the mobile expanded stack (D-#plmoney).
  const plMoney = (() => {
    if (pct == null || holding.profitLossCents == null) return null;
    const amt = Number(holding.profitLossCents); // cents
    if (!Number.isFinite(amt)) return null;
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
          ? "bg-[var(--surface-nested-dark)] hover:bg-[var(--surface-card-dark)]"
          : "bg-[var(--surface-card-dark)] hover:bg-[var(--surface-elevated-dark)]",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {/* Delisted dims the CONTENT only — the handle is a sibling and stays full
          opacity (a parent's opacity caps its children, 09-07-PLAN D-#delisted). */}
      {dragHandle}

      {/* Clickable cells — mobile tap lifts ONLY the name (currency + value stay
          centered) and reveals the P/L% + weight% line under the name (D-#6). */}
      <div
        role="button"
        tabIndex={0}
        aria-expanded={isDesktop ? undefined : expanded}
        aria-label={
          isDesktop
            ? t("row.editAria", { name: holding.name })
            : t("rowExpandAria", { name: holding.name })
        }
        onClick={activate}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            activate();
          }
        }}
        className={[
          "flex min-w-0 flex-1 items-center gap-2",
          delisted ? "opacity-50" : "",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        {/* Left column — full width on mobile-expanded (currency+amount hide).
            gap-0 + leading-tight so the 3-row card fits the row height (no grow). */}
        <div className="flex min-w-0 flex-1 flex-col justify-center gap-0 leading-tight">
          <div className="flex min-w-0 items-center gap-2">
            {/* Type icon (fixed accent color) so the row is identifiable at a glance. */}
            <TypeIcon
              className="h-4 w-4 shrink-0"
              style={{ color: typeColor }}
              aria-hidden="true"
            />
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
              currency + amount (right, aligned); then "Share: X%". For cash (no
              P/L) a dash takes the profit slot so the card is a uniform 3 rows,
              not 2 (D-#cash3). */}
          {expanded && (
            <div className="flex flex-col gap-0 sm:hidden">
              <div className="flex items-center justify-between gap-2 text-num-sm tabular-nums">
                <span className="flex min-w-0 items-center gap-2">
                  {pct != null ? (
                    <>
                      {plNode}
                      {plMoney && <span className={plColor}>{plMoney}</span>}
                    </>
                  ) : (
                    <span className="text-[var(--muted-strong)]">—</span>
                  )}
                </span>
                <span className="flex shrink-0 items-baseline gap-1">
                  <span className="text-[var(--muted-foreground)]">
                    {currency}
                  </span>
                  <span className="text-[var(--body-on-dark)]">{value}</span>
                </span>
              </div>
              <div className="text-caption text-[var(--muted-foreground)] tabular-nums">
                {showQty && (
                  <>
                    <span>{t("row.qty", { qty: qtyDisplay })}</span>
                    <span aria-hidden="true"> · </span>
                  </>
                )}
                <span>{t("row.share", { pct: weight })}</span>
              </div>
            </div>
          )}
        </div>

        {/* Desktop columns (UAT #7): qty · P/L% · P/L amt · value · weight. All
            `hidden sm:*` so mobile keeps its collapsed name+currency+value layout. */}
        {/* Quantity — blank for cash/broker (qty is meaningless) to keep the
            columns aligned with rows that do have one. */}
        <span
          data-testid={`holding-qty-${holding.name}`}
          className="hidden w-20 shrink-0 text-right text-num-sm text-[var(--muted-foreground)] tabular-nums sm:block"
        >
          {showQty ? qtyDisplay : ""}
        </span>
        {/* P/L% then the P/L money amount (no currency symbol). */}
        <span className="hidden w-20 shrink-0 justify-end text-right tabular-nums sm:flex">
          {plNode}
        </span>
        <span
          className={`hidden w-24 shrink-0 justify-end text-right text-num-sm tabular-nums sm:flex ${plColor}`}
        >
          {plMoney ?? ""}
        </span>
        {/* Currency tight to the amount (gap-1, D-#3). On mobile-expanded it's
            re-rendered inside the middle row (P/L or day), so hide it here;
            desktop (sm) + mobile-collapsed keep it on the right. */}
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
        {/* Desktop: weight% last. */}
        <span className="hidden w-16 shrink-0 text-right text-num-sm text-[var(--muted-foreground)] tabular-nums sm:block">
          {weight}
        </span>
      </div>

      {/* Desktop hover action — trash only (the edit pen was removed in UAT #7;
          a desktop row-click opens the edit sheet). Dimmed with the content when
          delisted; the handle (left) stays full opacity. The fixed w-7 matches the
          group header's trailing spacer so right edges line up. */}
      <div
        className={[
          "hidden w-7 shrink-0 items-center justify-end sm:flex",
          delisted ? "opacity-50" : "",
        ]
          .filter(Boolean)
          .join(" ")}
      >
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

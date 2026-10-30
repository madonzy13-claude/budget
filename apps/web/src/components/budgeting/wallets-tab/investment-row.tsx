"use client";
/**
 * investment-row.tsx — L2 asset row (Phase 9 holding row → 13.1 D-27/D-29).
 *
 * A tap toggles the row on every viewport: stats on the row's own background
 * (P/L, Avg price · Qty · Share) and, via onToggle, the L3 ledger strip the
 * section renders underneath. No chevron. Swap · Edit are explicit actions
 * (hover on desktop, swipe on mobile, D-05) — no asset delete.
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
import { useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  Archive,
  Pencil,
  Plus,
  Scale,
  Trash2,
  TrendingUp,
  TrendingDown,
} from "lucide-react";
import { InlineEditCell } from "@/components/common/inline-edit-cell";
import { Input } from "@/components/ui/input";
import { centsToBare } from "@/lib/cents-format";
import { typeGroupPL } from "@/lib/investment-type-groups";
import { PlCaption } from "./investment-type-header";
import { desktopLabel, mobileLabel } from "@/lib/instrument-label";
import { useBdpUiStore } from "@/components/budgeting/bdp-ui-state";
import type { HoldingDto } from "@/hooks/use-investments";
import { isAutoPriced } from "@/lib/investment-types";
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
  /** 13.1 D-05: open the transaction sheet (Buy / Sell / Transfer) — the
   *  "+" action, second after Edit (R6-4). */
  onSwap?: () => void;
  /** R6-6: this asset's realized + sold cost (type-summary `holdings`). */
  realized?: { realizedBudgetCents: string; soldCostBudgetCents: string };
  /** Round 4: archive (the section asks first). */
  onArchive?: () => void;
  /** Round 4: delete an asset that has nothing but its opening entry. */
  onDelete?: () => void;
  /** 13.1 D-27: the row opened/closed — the section shows/hides its ledger. */
  onToggle?: (id: string, open: boolean) => void;
  /** Open state owned by the section (persisted per device); seeds local state. */
  open?: boolean;
  /**
   * 260731: save an inline-edited VALUE (decimal string, row currency) for
   * manual-value holdings — cash / broker / savings, where quantity is 1 so the
   * typed number IS the stored value. Omitted (or absent for a tracked / deposit
   * holding) → the amount stays read-only and the row opens the sheet as before.
   */
  onValueChange?: (amount: string) => Promise<void> | void;
}

/** Signed %, 1 decimal, with a real minus sign (U+2212); zero reads "+0.0%"
 *  (round 3). */
function formatPct(pct: number): string {
  const sign = pct < 0 ? "−" : "+";
  return `${sign}${Math.abs(pct).toFixed(1)}%`;
}

export function InvestmentRow({
  holding,
  dragHandle,
  nested,
  maxAmountChars,
  onEdit,
  onSwap,
  onArchive,
  onDelete,
  onToggle,
  open,
  realized,
  onValueChange,
}: InvestmentRowProps) {
  const locale = useLocale();
  const t = useTranslations("budget.investments");
  // Tapped-open (mobile P/L expand) persists across pill navigation for the BDP's
  // lifetime (round 18 item 2) — seed from + write to the BDP store by holding id.
  const bdpStore = useBdpUiStore();
  const [expanded, setExpanded] = useState(
    () => open ?? bdpStore?.wallets.expandedRows[holding.id] ?? false,
  );
  const [shaking, setShaking] = useState(false);
  // The caption may use the room up to the share before it scrolls.
  const shareRef = useRef<HTMLSpanElement>(null);
  // Opened or closed from elsewhere (a linked entry's jump, round 4; its type
  // collapsing, R5-3): follow the section's open state.
  useEffect(() => {
    if (open !== undefined) setExpanded(open);
  }, [open]);
  const activate = () => {
    const next = !expanded;
    setExpanded(next);
    if (bdpStore) bdpStore.wallets.expandedRows[holding.id] = next;
    onToggle?.(holding.id, next);
  };

  const currency = holding.currentPriceCurrency ?? holding.buyCurrency ?? "";
  const value = centsToBare(holding.valueCents, locale);
  // Round 4: "40%", not "40.0%"; "12.5%" keeps its decimal.
  const weight = `${Number(holding.weightPct.toFixed(1))}%`;
  const pct = holding.profitLossPct;
  const delisted = holding.isDelisted;

  // Name: cash shows its user-given name when set, else falls back to "Cash"
  // (currency is its own column, D-#cash); tracked instruments show TICKER /
  // "TICKER (Name)"; everything else the stored name.
  const isCash = holding.holdingType === "cash_fx";
  const cashLabel = holding.name.trim() ? holding.name : t("uitype.cash");

  // Quantity for the mobile-expanded row — only for holdings where it's meaningful
  // (tracked / metals). Cash + broker + deposit + savings are single-unit (qty 1),
  // so omit it. Trim trailing zeros from the numeric(28,8) string so "10.00000000" → "10".
  const showQty =
    !isCash &&
    holding.uiType !== "broker" &&
    holding.uiType !== "deposit" &&
    holding.uiType !== "savings" &&
    holding.holdingType !== "deposit";
  const qtyDisplay = holding.quantity.includes(".")
    ? holding.quantity.replace(/0+$/, "").replace(/\.$/, "")
    : holding.quantity;
  // Savings: show the starting amount ("Started: $X") in the expanded caption
  // where qty would go — the %change already shows current-vs-starting.
  // 260731: a value the household keeps BY HAND can be typed straight into the
  // row. 261023: that includes a hand-priced instrument of any quantity — the
  // typed figure is the TOTAL and the section stores total ÷ quantity as the
  // price. What stays read-only is what something else prices: a feed
  // (auto-priced instrument), the spot price (metals) or the rate (deposits).
  const valueIsManual =
    !!onValueChange &&
    holding.holdingType !== "deposit" &&
    holding.uiType !== "deposit" &&
    holding.metal == null &&
    holding.uiType !== "precious_metals" &&
    (isCash ||
      holding.uiType === "broker" ||
      holding.uiType === "savings" ||
      holding.instrumentId == null ||
      (holding.instrumentProvider != null &&
        !isAutoPriced(holding.instrumentProvider)));
  const isSavings = holding.uiType === "savings";
  // D-29: average buy price per unit, quantity assets only (an amount asset's
  // "price" is its total cost).
  const avgPrice =
    showQty && holding.buyPriceCents != null
      ? centsToBare(holding.buyPriceCents, locale)
      : null;
  const startedDisplay =
    isSavings && holding.buyPriceCents != null
      ? centsToBare(holding.buyPriceCents, locale)
      : null;
  // A tracked (auto-fetch) holding whose `name` the user overrode — it differs
  // from the instrument's own display name. Show that custom name verbatim
  // instead of the auto "TICKER (name)" label.
  const customName =
    holding.instrumentName &&
    holding.name.trim() &&
    holding.name.trim() !== holding.instrumentName.trim()
      ? holding.name.trim()
      : null;
  const desktopName = isCash
    ? cashLabel
    : (customName ?? desktopLabel(holding));
  const mobileName = isCash
    ? cashLabel
    : (customName ?? mobileLabel(holding, expanded));

  // R6-6: the caption is this asset's unrealized · realized (the header's
  // own figures for a one-asset list); qty @ avg sits above the price.
  const assetPL = typeGroupPL([holding], realized);
  const qtyAvg = avgPrice != null ? `${qtyDisplay} @ ${avgPrice}` : null;

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
    const sign = amt < 0 ? "−" : "+";
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
        {/* Zero is a grey rise (round 3): same arrow as a gain. */}
        {!delisted && pct >= 0 && (
          <TrendingUp
            data-pl-trend={pct > 0 ? "up" : "flat"}
            className="h-3 w-3"
            aria-hidden="true"
            style={pct === 0 ? { color: "var(--muted-strong)" } : undefined}
          />
        )}
        {!delisted && pct < 0 && (
          <TrendingDown
            data-pl-trend="down"
            className="h-3 w-3"
            aria-hidden="true"
          />
        )}
        {formatPct(pct)}
      </span>
    );

  // The expanded value (mobile): currency + amount, one right edge with the
  // share below and the type header's value.
  const valueBlock = (extra = "") => (
    <span
      data-testid={`asset-value-${holding.id}`}
      className={`flex shrink-0 items-baseline gap-1 text-num-sm tabular-nums ${extra}`}
    >
      <span className="text-[var(--muted-foreground)]">{currency}</span>
      <span className="text-[var(--body-on-dark)]">{value}</span>
    </span>
  );

  return (
    <div
      data-testid={`holding-row-${holding.name}`}
      data-delisted={delisted || undefined}
      data-nav-item
      data-nav-type="invest-row"
      data-nav-key={`invrow-${holding.id}`}
      className={[
        "group flex min-h-[56px] w-full items-center gap-2 rounded-[var(--radius-md)] px-3 transition-colors sm:min-h-[48px]",
        // Open: the ledger strip underneath closes the card (UAT 13.1 test 4).
        expanded ? "rounded-b-none" : "",
        nested
          ? "bg-[var(--surface-nested-dark)] hover:bg-[var(--surface-card-dark)] data-[nav-highlighted=true]:bg-[var(--surface-card-dark)]"
          : "bg-[var(--surface-card-dark)] hover:bg-[var(--surface-elevated-dark)] data-[nav-highlighted=true]:bg-[var(--surface-elevated-dark)]",
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
        data-nav-open
        data-testid={`asset-row-${holding.id}`}
        aria-expanded={expanded}
        aria-label={t("rowExpandAria", { name: holding.name })}
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
        {/* Round 4: two columns, each centred on its own (left: name / P/L /
            caption; right: value / share). The type icon lives on the header. */}
        <div
          data-col="left"
          className="flex min-w-0 flex-1 flex-col justify-center gap-0 leading-tight"
        >
          <div className="flex min-w-0 items-center gap-2">
            {/* Stock/crypto: mobile shows the TICKER (tap → full name); desktop
                shows "TICKER (Name)". Non-tracked holdings show their name. */}
            <span
              className={[
                // Wraps rather than truncating — same reason as the wallet
                // rows: a clipped holding name is unidentifiable (user, 261016).
                "min-w-0 flex-1 break-words sm:hidden",
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
                "hidden min-w-0 flex-1 break-words text-body-md sm:block",
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
              {pct != null && (
                <span className="flex min-w-0 items-center gap-2 text-num-sm tabular-nums">
                  {plNode}
                  {plMoney && <span className={plColor}>{plMoney}</span>}
                </span>
              )}
              {/* One step under the P/L line (UAT 13.1 test 4); inline so
                  tailwind-merge cannot drop it. */}
              {/* Same font + size as the header's unreal./real. line (round 4). */}
              {!isCash && (
                <PlCaption
                  data-asset-caption
                  unrealizedCents={assetPL.unrealizedCents}
                  realizedCents={assetPL.realizedCents}
                  until={shareRef}
                />
              )}
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
          data-col="right"
          className="flex shrink-0 flex-col items-end justify-center gap-0 leading-tight sm:contents"
        >
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
              // The whole row body is a click target (expand / open sheet); a click
              // meant for the inline editor must not also fire that.
              onClick={valueIsManual ? (e) => e.stopPropagation() : undefined}
            >
              {valueIsManual ? (
                <InlineEditCell
                  value={centsToBare(holding.valueCents).replace(
                    /[^0-9.-]/g,
                    "",
                  )}
                  ariaLabel={t("row.amountAria", { name: holding.name })}
                  testId={`holding-amount-${holding.id}`}
                  render={() => <span className="text-num-md">{value}</span>}
                  renderEditor={(draft, onChange) => (
                    <Input
                      autoFocus
                      type="text"
                      inputMode="decimal"
                      defaultValue={draft}
                      onChange={(e) => onChange(e.target.value)}
                      className="ml-auto h-9 w-[10ch] max-w-full px-2 text-right"
                    />
                  )}
                  onSave={async (v) => {
                    await onValueChange?.(v);
                  }}
                />
              ) : (
                // A tap here can't edit (the price is fetched or derived), so
                // shake the amount to say so (user, 261023). It doesn't expand the
                // row either: on a phone that moves the amount, hiding the shake.
                <span
                  data-testid={`holding-amount-readonly-${holding.id}`}
                  data-shake={shaking || undefined}
                  onClick={(e) => {
                    e.stopPropagation();
                    setShaking(true);
                  }}
                  onAnimationEnd={() => setShaking(false)}
                  className={[
                    "inline-block text-num-md",
                    delisted
                      ? "text-[var(--muted-strong)]"
                      : "text-[var(--body-on-dark)]",
                  ].join(" ")}
                >
                  {value}
                </span>
              )}
            </div>
          </div>
          {expanded && (qtyAvg != null || startedDisplay != null) && (
            <span
              data-testid="investment-row-qtyavg"
              className="flex items-center gap-1 text-[var(--muted-foreground)] tabular-nums sm:hidden"
              style={{ fontSize: "11px", lineHeight: 1.4 }}
            >
              {qtyAvg != null ? (
                <>
                  <Scale data-avg-icon className="h-3 w-3" aria-hidden="true" />
                  {qtyAvg}
                </>
              ) : (
                t("row.started", { amount: startedDisplay! })
              )}
            </span>
          )}
          {expanded && valueBlock("sm:hidden")}
          {expanded && (
            <span
              ref={shareRef}
              data-testid={`asset-share-${holding.id}`}
              className="text-[var(--muted-foreground)] tabular-nums sm:hidden"
              style={{ fontSize: "11px", lineHeight: 1.4 }}
            >
              {t("row.share", { pct: weight })}
            </span>
          )}
        </div>
        {/* Desktop: weight% last. */}
        <span className="hidden w-16 shrink-0 text-right text-num-sm text-[var(--muted-foreground)] tabular-nums sm:block">
          {weight}
        </span>
      </div>

      {/* Desktop hover actions: Swap · Edit (D-05). Dimmed with the content
          when delisted; the handle (left) stays full opacity. */}
      <div
        className={[
          "hidden w-[92px] shrink-0 items-center justify-end gap-1 sm:flex",
          delisted ? "opacity-50" : "",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        {(
          [
            [onEdit, Pencil, "asset.swipe.edit", "edit"],
            [onSwap, Plus, "asset.swipe.newTxn", "swap"],
            [onArchive, Archive, "asset.archive.confirm", "archive"],
            [onDelete, Trash2, "ledger.confirm.last.confirm", "delete"],
          ] as const
        ).map(([fn, Icon, key, id]) =>
          fn ? (
            <button
              key={id}
              type="button"
              data-testid={`investment-${id}-desktop-${holding.id}`}
              aria-label={`${t(key)} ${holding.name}`}
              onClick={(e) => {
                e.stopPropagation();
                fn();
              }}
              className="invisible flex h-7 w-7 items-center justify-center rounded group-hover:visible group-focus-within:visible group-data-[nav-highlighted=true]:visible"
              style={{ color: "var(--body-on-dark)" }}
            >
              <Icon className="h-4 w-4" aria-hidden="true" />
            </button>
          ) : null,
        )}
      </div>
    </div>
  );
}

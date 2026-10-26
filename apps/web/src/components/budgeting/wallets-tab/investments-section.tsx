"use client";
/**
 * investments-section.tsx — Investments section client island (Phase 9, type
 * groups since Phase 13).
 *
 * Rendered LAST on the Wallets tab when investments_enabled. Holdings render
 * as one BLOCK per investment type that has holdings (D-13): an
 * InvestmentTypeHeader (value · total P/L incl. realized · lifetime %) and its
 * rows. Types with realized gain but no holdings are hidden; their realized
 * still shows as a muted line under the section total (D-14). Block order =
 * the budget's saved type order, then picker order (D-12).
 *
 * ⚠️ Before changing ANY drag logic, read ./INVESTMENTS-DND.md.
 */
import {
  DndContext,
  closestCenter,
  useSensors,
  useSensor,
  PointerSensor,
  TouchSensor,
  KeyboardSensor,
  MeasuringStrategy,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { DashedAddButton } from "@/components/common/dashed-add-button";
import { centsToBare, centsToRounded } from "@/lib/cents-format";
import { amountColumnChars } from "@/lib/amount-column";
import { useBudget } from "@/hooks/use-budget-data";
import { useInvestments, type HoldingDto } from "@/hooks/use-investments";
import { useTypeSummary } from "@/hooks/use-type-summary";
import { useUpdateHolding } from "@/hooks/use-update-holding";
import { parseDecimal } from "@/lib/decimal";
import { unitPriceCents, type UiType } from "@/lib/investment-types";
import { useArchiveHolding } from "@/hooks/use-archive-holding";
import {
  buildTypeBlocks,
  portfolioPL,
  typeGroupPL,
} from "@/lib/investment-type-groups";
import { InvestmentRowSheet } from "./investment-row-sheet";
import { sharePercentLabel } from "@/lib/share-bar";
import { InvestmentTypeHeader } from "./investment-type-header";
import { HoldingSheet } from "./holding-sheet";

interface InvestmentsSectionProps {
  budgetId: string;
  budgetCurrency?: string;
  /** Every asset on the tab, in budget currency — denominator for the header's
   *  share. Share BETWEEN sections, not within one (user, 260823). */
  assetsTotalBudgetCents?: number;
}

export function InvestmentsSection({
  budgetId,
  budgetCurrency: budgetCurrencyProp,
  assetsTotalBudgetCents,
}: InvestmentsSectionProps) {
  const t = useTranslations("budget.investments");
  const locale = useLocale();

  // Self-gate (the list also gates) + currency fallback.
  const budgetQuery = useBudget(budgetId);
  const budgetMeta = budgetQuery.data as
    | {
        investmentsEnabled?: boolean;
        defaultCurrency?: string;
        default_currency?: string;
      }
    | undefined;
  const investmentsEnabled = budgetMeta?.investmentsEnabled ?? false;
  const budgetCurrency =
    budgetCurrencyProp ??
    budgetMeta?.defaultCurrency ??
    budgetMeta?.default_currency ??
    "EUR";

  const investmentsQuery = useInvestments(budgetId);
  const summary = useTypeSummary(budgetId).data;
  const holdings = useMemo(
    // Possessions share the holdings endpoint but render in their own section.
    () =>
      (investmentsQuery.data ?? []).filter(
        (h) => h.holdingType !== "possession",
      ),
    [investmentsQuery.data],
  );
  const updateMut = useUpdateHolding(budgetId);
  const archiveMut = useArchiveHolding(budgetId);

  /**
   * 260731: inline value edit on a manual-value row (cash / broker / savings —
   * quantity is 1, so the typed number IS the current value). Only the CURRENT
   * price moves; the buy price stays the cost basis, so savings keeps its
   * "started at" figure and the %-change stays honest.
   */
  // The row edits the TOTAL; the price is per unit (user, 261023).
  async function saveInlineValue(holding: HoldingDto, amount: string) {
    const cents = parseDecimal(amount);
    if (cents === null) return;
    await updateMut.mutateAsync({
      holdingId: holding.id,
      currentPriceCents: unitPriceCents(cents, holding.quantity),
    });
  }

  // ── Sheet state (single shared instance for add + edit) ──
  const [sheet, setSheet] = useState<{
    open: boolean;
    mode: "create" | "edit";
    holding: HoldingDto | null;
  }>({ open: false, mode: "create", holding: null });

  // ── Type blocks (D-12..D-16) ──
  const blocks = useMemo(
    () => buildTypeBlocks(holdings, summary?.order ?? []),
    [holdings, summary?.order],
  );
  const blockPL = useMemo(
    () =>
      new Map(
        blocks.map((b) => [
          b.uiType,
          typeGroupPL(b.holdings, summary?.types[b.uiType]),
        ]),
      ),
    [blocks, summary],
  );
  const total = useMemo(
    () => portfolioPL(holdings, summary),
    [holdings, summary],
  );
  const totalBudgetCents = total.valueBudgetCents;
  const investmentsShare = sharePercentLabel(
    totalBudgetCents,
    assetsTotalBudgetCents,
  );

  // Longest formatted amount → dynamic amount-column width so the currency
  // codes line up in a column (mirrors wallet-row, D-#align). Headers share one
  // width; each block's rows get their own.
  const amountCols = useMemo(
    () =>
      amountColumnChars(
        blocks.map((b) =>
          centsToBare(
            String(Math.round(blockPL.get(b.uiType)?.valueBudgetCents ?? 0)),
            locale,
          ),
        ),
        Object.fromEntries(
          blocks.map((b) => [
            b.uiType,
            b.holdings.map((h) => centsToBare(h.valueCents, locale)),
          ]),
        ),
      ),
    [blocks, blockPL, locale],
  );

  // ── Collapse state per type (localStorage, default expanded) ──
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const typesKey = blocks.map((b) => b.uiType).join("|");
  useEffect(() => {
    setCollapsed((prev) => {
      const next = { ...prev };
      for (const b of blocks)
        if (!(b.uiType in next)) {
          let stored: string | null = null;
          try {
            stored = localStorage.getItem(`inv-type-${budgetId}-${b.uiType}`);
          } catch {
            stored = null;
          }
          next[b.uiType] = stored === "0";
        }
      return next;
    });
  }, [typesKey, budgetId]);
  const isExpanded = (ui: UiType) => !collapsed[ui];
  const toggleType = (ui: UiType) =>
    setCollapsed((prev) => {
      const nowCollapsed = !prev[ui];
      try {
        localStorage.setItem(
          `inv-type-${budgetId}-${ui}`,
          nowCollapsed ? "0" : "1",
        );
      } catch {
        /* ignore */
      }
      return { ...prev, [ui]: nowCollapsed };
    });

  // ── DnD (block + within-type reorder lands in 13-10) ──
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 300, tolerance: 5 },
    }),
    useSensor(KeyboardSensor),
  );

  function openEdit(holding: HoldingDto) {
    setSheet({ open: true, mode: "edit", holding });
  }
  function openAdd() {
    setSheet({ open: true, mode: "create", holding: null });
  }

  if (!investmentsEnabled) return null;

  const signed = (cents: number) =>
    `${cents > 0 ? "+" : cents < 0 ? "−" : ""}${centsToBare(String(Math.round(Math.abs(cents))), locale)}`;

  return (
    <section
      data-testid="investments-section"
      className="flex flex-col gap-2 rounded-[var(--radius-lg)] p-2"
    >
      {/* Like every wallet section, the header reports what this one holds in
          BUDGET currency (user, 260822). The columns it has to line up with are
          the INVESTMENT row's, which differ from a wallet row's: a P/L gutter,
          then currency tight to the amount on `gap-1`, then the trash. Matching
          the row's own `gap-2 px-3` is what puts the two numbers on one axis. */}
      {/* Same treatment as every wallet section: one formatted string with the
          short currency sign, so nothing has to align against the rows. */}
      <h3 className="flex items-center gap-2 px-3 text-caption uppercase tracking-wider text-[var(--muted-foreground)]">
        <span className="flex min-w-0 flex-1 items-baseline gap-1.5">
          <span className="min-w-0 truncate">{t("section.title")}</span>
          {/* Phone has no share column, so the share sits beside the name,
              as on every wallet section (user, 261024). */}
          {investmentsShare !== null && (
            <span
              data-testid="section-share-inline-INVESTMENTS"
              className="shrink-0 normal-case tabular-nums tracking-normal opacity-60 sm:hidden"
            >
              {investmentsShare}
            </span>
          )}
        </span>
        <span
          data-testid="section-total-INVESTMENTS"
          // normal-case: the h3 is uppercase for its LABEL, and that was
          // turning the currency sign into "ZŁ" (user, 260823).
          className="shrink-0 normal-case tabular-nums tracking-normal opacity-60"
        >
          {centsToRounded(
            String(Math.round(totalBudgetCents)),
            budgetCurrency,
            "en",
            true,
          )}
        </span>
        <span
          data-testid="section-share-INVESTMENTS"
          className="hidden w-16 shrink-0 text-right text-num-sm tabular-nums tracking-normal sm:block"
        >
          {investmentsShare ?? ""}
        </span>
        <span className="hidden w-7 shrink-0 sm:block" aria-hidden="true" />
      </h3>

      {/* D-14: realized of types with no holdings left still counts. */}
      {total.hiddenRealizedCents !== 0 && (
        <p
          data-testid="investments-total-realized"
          className="px-3 text-[12px] leading-[1.4]"
          style={{ color: "var(--muted-foreground)" }}
        >
          {t("typeGroup.inclRealized", {
            amount: signed(total.hiddenRealizedCents),
          })}
        </p>
      )}

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
      >
        <div className="flex flex-col gap-2">
          {blocks.map((block) => {
            const pl = blockPL.get(block.uiType)!;
            return (
              <div
                key={block.uiType}
                data-testid={`investment-type-block-${block.uiType}`}
                className="flex flex-col gap-2"
              >
                <InvestmentTypeHeader
                  uiType={block.uiType}
                  budgetCurrency={budgetCurrency}
                  pl={pl}
                  portfolioPct={
                    totalBudgetCents > 0
                      ? (pl.valueBudgetCents / totalBudgetCents) * 100
                      : 0
                  }
                  maxAmountChars={amountCols.top}
                  expanded={isExpanded(block.uiType)}
                  onToggle={() => toggleType(block.uiType)}
                />
                {isExpanded(block.uiType) && (
                  <SortableContext
                    items={block.holdings.map((h) => h.id)}
                    strategy={verticalListSortingStrategy}
                  >
                    {block.holdings.map((h) => (
                      <InvestmentRowSheet
                        key={h.id}
                        holding={h}
                        nested
                        maxAmountChars={amountCols.group[block.uiType]}
                        onEdit={openEdit}
                        onArchive={(id) => archiveMut.mutate(id)}
                        onValueChange={(amount) => saveInlineValue(h, amount)}
                      />
                    ))}
                  </SortableContext>
                )}
              </div>
            );
          })}
        </div>
      </DndContext>

      <DashedAddButton
        onClick={openAdd}
        label={t("add.cta")}
        testId="add-investment-button"
        navKey="add-invest"
      />

      <HoldingSheet
        key={`${sheet.mode}-${sheet.holding?.id ?? "new"}-${sheet.open}`}
        open={sheet.open}
        onOpenChange={(open) => setSheet((s) => ({ ...s, open }))}
        mode={sheet.mode}
        budgetId={budgetId}
        budgetCurrency={budgetCurrency}
        groups={[]}
        holding={sheet.holding}
      />
    </section>
  );
}

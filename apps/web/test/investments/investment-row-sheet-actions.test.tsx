/**
 * investment-row-sheet-actions.test.tsx — asset row actions (13.1 D-05):
 * swipe reveals Swap · Edit only. No asset delete — entries are deleted in
 * the ledger, and deleting the last one wipes the asset (D-17).
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { DndContext } from "@dnd-kit/core";
import { SortableContext } from "@dnd-kit/sortable";
import type { HoldingDto } from "../../src/hooks/use-investments";
import { touchSwipe } from "../_helpers/swipe";

vi.mock("next-intl", () => ({
  useTranslations:
    (ns: string) => (key: string, params?: Record<string, unknown>) => {
      const k = `${ns.split(".").pop()}.${key}`;
      return params ? `${k}:${Object.values(params).join(",")}` : k;
    },
  useLocale: () => "en",
}));

import { InvestmentRowSheet } from "../../src/components/budgeting/wallets-tab/investment-row-sheet";

const h: HoldingDto = {
  id: "h1",
  name: "BTC",
  holdingType: "crypto",
  uiType: "crypto",
  icon: null,
  color: null,
  instrumentId: null,
  metal: null,
  metalKind: null,
  unitOfMeasure: null,
  premiumPct: null,
  symbol: null,
  instrumentName: null,
  instrumentProvider: null,
  isCustom: true,
  isDelisted: false,
  quantity: "1",
  buyPriceCents: "100",
  buyCurrency: "PLN",
  currentPriceCents: "100",
  currentPriceCurrency: "PLN",
  priceFetchedAt: null,
  valueCents: "100",
  valueInBudgetCents: "100",
  costInBudgetCents: "100",
  profitLossPct: 0,
  profitLossCents: "0",
  weightPct: 100,
  sortOrder: 1,
  createdAt: "2026-01-01T00:00:00Z",
  depositRateBps: null,
  depositStartDate: null,
  depositEndDate: null,
  depositCapFrequency: null,
};

function renderRow(
  props: {
    onSwap?: (h: HoldingDto) => void;
    onSwipeOffset?: (id: string, px: number) => void;
  } = {},
) {
  return render(
    <DndContext>
      <SortableContext items={[h.id]}>
        <InvestmentRowSheet
          holding={h}
          onSwap={props.onSwap ?? vi.fn()}
          onDelete={vi.fn()}
          onSwipeOffset={props.onSwipeOffset}
        />
      </SortableContext>
    </DndContext>,
  );
}

describe("Row actions", () => {
  // 261106 (user): the swipe keeps only Delete — the amount opens the sheet.
  it("swipe panel offers only Delete", () => {
    renderRow();
    expect(screen.queryByTestId("holding-swipe-edit-h1")).toBeNull();
    expect(screen.queryByTestId("investment-swap-h1")).toBeNull();
    expect(screen.getByTestId("investment-delete-h1")).toBeInTheDocument();
  });

  // UAT 13.1 test 5: the open ledger slides with its asset; Swap is blue.
  it("a touch swipe reports the row offset so the ledger can follow", () => {
    const onSwipeOffset = vi.fn();
    const { container } = renderRow({ onSwipeOffset });
    const row = container.querySelector("[data-investment-row-wrapper]")!;
    touchSwipe(row, -200);
    expect(onSwipeOffset).toHaveBeenLastCalledWith("h1", -68, false);
    touchSwipe(row, 200);
    expect(onSwipeOffset).toHaveBeenLastCalledWith("h1", 0, false);
  });

});

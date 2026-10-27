/**
 * investment-row-sheet-actions.test.tsx — asset row actions (13.1 D-05):
 * swipe reveals Swap · Edit only. No asset delete — entries are deleted in
 * the ledger, and deleting the last one wipes the asset (D-17).
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { DndContext } from "@dnd-kit/core";
import { SortableContext } from "@dnd-kit/sortable";
import type { HoldingDto } from "../../src/hooks/use-investments";

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

function renderRow(props: { onSwap?: (h: HoldingDto) => void } = {}) {
  return render(
    <DndContext>
      <SortableContext items={[h.id]}>
        <InvestmentRowSheet
          holding={h}
          onEdit={vi.fn()}
          onSwap={props.onSwap ?? vi.fn()}
        />
      </SortableContext>
    </DndContext>,
  );
}

describe("Row actions", () => {
  it("swipe panel offers exactly Swap then Edit", () => {
    const onSwap = vi.fn();
    renderRow({ onSwap });
    const swap = screen.getByTestId("investment-swap-h1");
    const edit = screen.getByTestId("holding-swipe-edit-h1");
    expect(
      swap.compareDocumentPosition(edit) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(swap).toHaveAccessibleName("investments.asset.swipe.swap BTC");
    expect(screen.queryByTestId("holding-swipe-delete-h1")).toBeNull();
    expect(screen.queryByTestId("investment-sell-h1")).toBeNull();
    fireEvent.click(swap);
    expect(onSwap).toHaveBeenCalledWith(h);
  });
});

/**
 * investment-row-sheet-actions.test.tsx — Phase 13 row actions (D-01, UI-SPEC
 * §2/§6): swipe reveals Sell · Edit · Delete; Delete confirms with the
 * erase-history copy and hard-deletes via DELETE /investments/:id.
 */
import { describe, it, expect, vi } from "vitest";
import {
  render,
  screen,
  fireEvent,
  renderHook,
  act,
  waitFor,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DndContext } from "@dnd-kit/core";
import { SortableContext } from "@dnd-kit/sortable";
import type { ReactNode } from "react";
import type { HoldingDto } from "../../src/hooks/use-investments";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, params?: Record<string, unknown>) =>
    params ? `${key}:${Object.values(params).join(",")}` : key,
  useLocale: () => "en",
}));
const writeMock = vi.hoisted(() => vi.fn());
vi.mock("../../src/lib/offline-write", () => ({
  clientApiWrite: (...a: unknown[]) => writeMock(...a),
  isOfflineWriteError: () => false,
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("../../src/hooks/use-offline-write-toast", () => ({
  useOfflineWriteToast: () => vi.fn(),
}));

import { InvestmentRowSheet } from "../../src/components/budgeting/wallets-tab/investment-row-sheet";
import { useDeleteHolding } from "../../src/hooks/use-delete-holding";

const h = {
  id: "h1",
  name: "BTC",
  holdingType: "crypto",
  uiType: "crypto",
  quantity: "1",
  valueCents: "100",
  valueInBudgetCents: "100",
  currentPriceCurrency: "PLN",
  buyCurrency: "PLN",
  profitLossPct: null,
  profitLossCents: null,
  sortOrder: 1,
} as unknown as HoldingDto;

function renderRow(
  props: { onSell?: () => void; onArchive?: (id: string) => void } = {},
) {
  return render(
    <DndContext>
      <SortableContext items={[h.id]}>
        <InvestmentRowSheet
          holding={h}
          onEdit={vi.fn()}
          onArchive={props.onArchive ?? vi.fn()}
          onSell={props.onSell ?? vi.fn()}
        />
      </SortableContext>
    </DndContext>,
  );
}

describe("Row actions", () => {
  it("swipe panel offers Sell before Edit and Delete", () => {
    const onSell = vi.fn();
    renderRow({ onSell });
    const sell = screen.getByTestId("investment-sell-h1");
    const edit = screen.getByTestId("holding-swipe-edit-h1");
    expect(
      sell.compareDocumentPosition(edit) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    fireEvent.click(sell);
    expect(onSell).toHaveBeenCalledWith(h);
  });

  it("Delete asks with the erase-history copy before deleting", () => {
    const onArchive = vi.fn();
    renderRow({ onArchive });
    fireEvent.click(screen.getByTestId("holding-swipe-delete-h1"));
    expect(screen.getByText("deleteHolding.body")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("holding-delete-confirm-action"));
    expect(onArchive).toHaveBeenCalledWith("h1");
  });
});

describe("useDeleteHolding", () => {
  it("DELETEs the holding and removes it optimistically; rolls back on failure", async () => {
    const qc = new QueryClient();
    qc.setQueryData(["budget", "b1", "investments"], [h]);
    writeMock.mockResolvedValueOnce(new Response("{}", { status: 500 }));
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useDeleteHolding("b1"), { wrapper });
    act(() => result.current.mutate("h1"));
    await waitFor(() => expect(writeMock).toHaveBeenCalled());
    const [url, init] = writeMock.mock.calls[0]!;
    expect(url).toBe("/budgets/b1/investments/h1");
    expect((init as RequestInit).method).toBe("DELETE");
    await waitFor(() =>
      expect(
        qc.getQueryData<HoldingDto[]>(["budget", "b1", "investments"]),
      ).toEqual([h]),
    );
  });
});

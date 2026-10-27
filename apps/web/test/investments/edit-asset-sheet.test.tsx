/**
 * edit-asset-sheet.test.tsx — slim asset Edit (13.1 D-06, D-07, D-36):
 * label, display currency and — for hand-valued / hand-priced assets — the
 * current value or price. No history, type, quantity or delete.
 */
import "./_swap-fixtures";
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  btc,
  cash,
  H,
  writeMock,
  toastMock,
  lastBody,
  lastUrl,
} from "./_swap-fixtures";
import type { HoldingDto } from "../../src/hooks/use-investments";
import { EditAssetSheet } from "../../src/components/budgeting/wallets-tab/edit-asset-sheet";

const coin = H({
  id: "77777777-7777-7777-7777-777777777777",
  name: "Gold coin",
  uiType: "collectibles",
  holdingType: "other",
  instrumentId: null,
  quantity: "3",
  currentPriceCents: "200000",
});

function mount(holding: HoldingDto) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <EditAssetSheet
        open
        onOpenChange={() => {}}
        budgetId="b1"
        budgetCurrency="PLN"
        holding={holding}
      />
    </QueryClientProvider>,
  );
}
const type = (id: string, v: string) =>
  fireEvent.change(screen.getByTestId(id), { target: { value: v } });

beforeEach(() => {
  writeMock.mockReset();
  toastMock.success.mockReset();
  writeMock.mockResolvedValue(
    new Response(JSON.stringify({ id: "x" }), { status: 200 }),
  );
});

describe("Edit asset sheet", () => {
  it("hand-valued assets offer label, display currency and current value — nothing else", () => {
    mount(cash);
    expect(screen.getByTestId("edit-asset-name")).toHaveValue("Envelope");
    expect(screen.getByText("edit.displayCurrencyHelp")).toBeInTheDocument();
    expect(screen.getByTestId("edit-asset-value")).toHaveValue("1000");
    expect(screen.queryByTestId("edit-asset-price")).toBeNull();
    for (const gone of [
      "holding-sheet-type",
      "holding-sheet-quantity",
      "holding-sheet-buy-price",
    ])
      expect(screen.queryByTestId(gone)).toBeNull();
    expect(screen.queryByText(/whatHappened|history\./)).toBeNull();
  });

  it("a hand-priced quantity asset offers the current price per unit", () => {
    mount(coin);
    expect(screen.getByTestId("edit-asset-price")).toHaveValue("2000");
    expect(screen.queryByTestId("edit-asset-value")).toBeNull();
  });

  it("a market-priced asset offers neither value nor price", () => {
    mount(btc);
    expect(screen.queryByTestId("edit-asset-value")).toBeNull();
    expect(screen.queryByTestId("edit-asset-price")).toBeNull();
  });

  it("saving sends only what changed", async () => {
    mount(cash);
    type("edit-asset-name", "Pot");
    type("edit-asset-value", "1300");
    fireEvent.click(screen.getByTestId("edit-asset-save"));
    await waitFor(() => expect(writeMock).toHaveBeenCalled());
    expect(lastUrl()).toBe(`/budgets/b1/investments/${cash.id}`);
    expect(lastBody()).toEqual({ name: "Pot", currentValueCents: "130000" });
    await waitFor(() =>
      expect(toastMock.success).toHaveBeenCalledWith("edit.saved"),
    );
  });

  it("a display currency change is sent alone", async () => {
    mount(btc);
    type("currency-picker", "EUR");
    fireEvent.click(screen.getByTestId("edit-asset-save"));
    await waitFor(() => expect(writeMock).toHaveBeenCalled());
    expect(lastBody()).toEqual({ displayCurrency: "EUR" });
  });

  it("a taken label shows inline and blocks Save until the label changes", async () => {
    writeMock.mockResolvedValue(
      new Response(JSON.stringify({ error: "label_taken" }), { status: 422 }),
    );
    mount(cash);
    type("edit-asset-name", "BTC");
    fireEvent.click(screen.getByTestId("edit-asset-save"));
    expect(await screen.findByText("asset.name.taken")).toBeInTheDocument();
    expect(screen.getByTestId("edit-asset-save")).toBeDisabled();
    type("edit-asset-name", "BTC 2");
    expect(screen.getByTestId("edit-asset-save")).not.toBeDisabled();
  });

  it("Save is disabled when nothing changed", () => {
    mount(cash);
    expect(screen.getByTestId("edit-asset-save")).toBeDisabled();
  });
});

/**
 * new-transaction-sheet.test.tsx — "New transaction" (13.1 UAT 7): pick Buy /
 * Sell / Transfer first. Sell and Transfer pick an existing visible asset and
 * open its Swap sheet on that tab.
 *
 * Round-2 gap 6: opens on Buy, and the Add form renders INSIDE the sheet under
 * the switch (HoldingSheet embedded), so the switch never disappears.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import {
  H,
  btc,
  btcCold,
  deposit,
  holdingSheetStub as stub,
} from "./_swap-fixtures";
import { NewTransactionSheet } from "../../src/components/budgeting/wallets-tab/new-transaction-sheet";

vi.mock("../../src/hooks/use-asset-names", () => ({
  useAssetNames: (_b: string, type: string | null) => ({
    data:
      type === "crypto"
        ? [
            { id: btc.id, name: "BTC", archived: false, instrumentId: "i1" },
            {
              id: btcCold.id,
              name: "BTC Cold",
              archived: false,
              instrumentId: "i1",
            },
            {
              id: "gone",
              name: "Old coin",
              archived: true,
              instrumentId: null,
            },
          ]
        : [],
  }),
}));

function mount() {
  const onPick = vi.fn();
  const onOpenChange = vi.fn();
  render(
    <NewTransactionSheet
      open
      onOpenChange={onOpenChange}
      budgetId="b1"
      budgetCurrency="PLN"
      holdings={[
        btc,
        btcCold,
        deposit,
        H({ id: "c", name: "Pot", uiType: "cash", holdingType: "cash_fx" }),
      ]}
      onPick={onPick}
    />,
  );
  return { onPick, onOpenChange };
}

describe("New transaction", () => {
  it("opens on Buy with the Add form inside and every kind visible", () => {
    mount();
    expect(screen.getByTestId("new-tx-kind-buy")).toHaveAttribute(
      "aria-checked",
      "true",
    );
    const sheet = screen.getByTestId("new-tx-sheet");
    expect(within(sheet).getByTestId("holding-sheet")).toBeInTheDocument();
    for (const k of ["buy", "sell", "transfer"])
      expect(screen.getByTestId(`new-tx-kind-${k}`)).toBeInTheDocument();
    expect(stub.props).toMatchObject({
      embedded: true,
      budgetId: "b1",
      budgetCurrency: "PLN",
    });
  });

  it("Sell drops the Add form for the type picker; Buy brings it back", () => {
    mount();
    fireEvent.click(screen.getByTestId("new-tx-kind-sell"));
    expect(screen.queryByTestId("holding-sheet")).toBeNull();
    expect(screen.getByTestId("new-tx-type")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("new-tx-kind-buy"));
    expect(screen.getByTestId("holding-sheet")).toBeInTheDocument();
    expect(screen.queryByTestId("new-tx-type")).toBeNull();
  });

  it("a dirty Add form asks before switching kind", () => {
    mount();
    fireEvent.click(screen.getByTestId("stub-dirty"));
    fireEvent.click(screen.getByTestId("new-tx-kind-sell"));
    expect(screen.getByText("confirm.discard.title")).toBeInTheDocument();
    fireEvent.click(screen.getByText("confirm.discard.cancel"));
    expect(screen.getByTestId("new-tx-kind-buy")).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(screen.getByTestId("holding-sheet")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("new-tx-kind-sell"));
    fireEvent.click(screen.getByText("confirm.discard.cta"));
    expect(screen.getByTestId("new-tx-kind-sell")).toHaveAttribute(
      "aria-checked",
      "true",
    );
  });

  it("a dirty Add form asks before closing", () => {
    const { onOpenChange } = mount();
    fireEvent.click(screen.getByTestId("stub-dirty"));
    fireEvent.keyDown(screen.getByTestId("new-tx-sheet"), { key: "Escape" });
    expect(screen.getByText("confirm.discard.title")).toBeInTheDocument();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    fireEvent.click(screen.getByText("confirm.discard.cta"));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("a saved Add form closes the whole sheet", () => {
    const { onOpenChange } = mount();
    fireEvent.click(screen.getByTestId("stub-saved"));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("Sell picks a visible asset of a type and opens its Sell tab", () => {
    const { onPick } = mount();
    fireEvent.click(screen.getByTestId("new-tx-kind-sell"));
    fireEvent.change(screen.getByTestId("new-tx-type"), {
      target: { value: "crypto" },
    });
    const field = screen.getByTestId("new-tx-asset");
    fireEvent.focus(field);
    const names = within(screen.getByRole("listbox"))
      .getAllByRole("option")
      .map((o) => o.textContent);
    expect(names).toEqual(["BTC", "BTC Cold"]); // hidden "Old coin" left out
    fireEvent.change(field, { target: { value: "Brand new" } });
    expect(screen.queryByTestId("asset-name-create")).toBeNull();
    fireEvent.change(field, { target: { value: "" } });
    fireEvent.mouseDown(screen.getByText("BTC Cold"));
    expect(onPick).toHaveBeenCalledWith(btcCold, "sell");
  });

  it("Transfer leaves deposits out of the types", () => {
    mount();
    fireEvent.click(screen.getByTestId("new-tx-kind-transfer"));
    const types = [
      ...(screen.getByTestId("new-tx-type") as HTMLSelectElement).options,
    ]
      .map((o) => o.value)
      .filter(Boolean);
    expect(types).toContain("crypto");
    expect(types).not.toContain("deposit");
  });
});

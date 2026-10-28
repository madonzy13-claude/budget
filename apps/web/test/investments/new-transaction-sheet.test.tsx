/**
 * new-transaction-sheet.test.tsx — "New transaction" (13.1 UAT 7): pick Buy /
 * Sell / Transfer first. Buy hands off to the name-first Add form; Sell and
 * Transfer pick an existing visible asset and open its Swap sheet on that tab.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { H, btc, btcCold, deposit } from "./_swap-fixtures";
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
  const onBuy = vi.fn();
  const onPick = vi.fn();
  render(
    <NewTransactionSheet
      open
      onOpenChange={() => {}}
      budgetId="b1"
      holdings={[
        btc,
        btcCold,
        deposit,
        H({ id: "c", name: "Pot", uiType: "cash", holdingType: "cash_fx" }),
      ]}
      onBuy={onBuy}
      onPick={onPick}
    />,
  );
  return { onBuy, onPick };
}

describe("New transaction", () => {
  it("offers Buy, Sell and Transfer; Buy opens the Add form", () => {
    const { onBuy } = mount();
    for (const k of ["buy", "sell", "transfer"])
      expect(screen.getByTestId(`new-tx-kind-${k}`)).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("new-tx-kind-buy"));
    expect(onBuy).toHaveBeenCalled();
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

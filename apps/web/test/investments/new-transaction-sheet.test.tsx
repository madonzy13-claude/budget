/**
 * new-transaction-sheet.test.tsx — "New transaction" (13.1 UAT 7): pick Buy /
 * Sell / Transfer first. Sell and Transfer pick a type (in-DOM list, round 3)
 * and an existing visible asset; its Sell / Transfer form renders right under
 * them in the same sheet (round 3, user decision).
 *
 * Round-2 gap 6: opens on Buy, and the Add form renders INSIDE the sheet under
 * the switch (HoldingSheet embedded), so the switch never disappears.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  within,
  waitFor,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  H,
  btc,
  btcCold,
  deposit,
  routeFetch,
  okWrite,
  writeMock,
  lastUrl,
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
  const onOpenChange = vi.fn();
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
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
      />
    </QueryClientProvider>,
  );
  return { onOpenChange };
}
const type = (id: string, v: string) =>
  fireEvent.change(screen.getByTestId(id), { target: { value: v } });
/** Radix Select under happy-dom: open with the keyboard, pick by testid. */
async function pick(trigger: string, option: string) {
  fireEvent.keyDown(screen.getByTestId(trigger), { key: "Enter" });
  fireEvent.keyDown(await screen.findByTestId(option), { key: "Enter" });
}
async function pickAsset(kind: "sell" | "transfer", name: string) {
  fireEvent.click(screen.getByTestId(`new-tx-kind-${kind}`));
  await pick("new-tx-type", "new-tx-type-option-crypto");
  fireEvent.focus(screen.getByTestId("new-tx-asset"));
  fireEvent.mouseDown(screen.getByText(name));
}

beforeEach(() => {
  writeMock.mockReset();
  routeFetch({ rate: "0.25" });
  okWrite({ transferId: null, newHoldingId: null, walletId: null });
});

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

  it("Sell lists the type's visible assets only", async () => {
    mount();
    fireEvent.click(screen.getByTestId("new-tx-kind-sell"));
    expect(screen.getByTestId("new-tx-type")).toHaveAttribute(
      "role",
      "combobox",
    );
    await pick("new-tx-type", "new-tx-type-option-crypto");
    const field = screen.getByTestId("new-tx-asset");
    fireEvent.focus(field);
    const names = within(screen.getByRole("listbox"))
      .getAllByRole("option")
      .map((o) => o.textContent);
    expect(names).toEqual(["BTC", "BTC Cold"]); // hidden "Old coin" left out
    type("new-tx-asset", "Brand new");
    expect(screen.queryByTestId("asset-name-create")).toBeNull();
  });

  // Round-3 gap 3b: type + asset stay; the asset's Sell form is right below.
  it("picking an asset to sell keeps type and asset and books its Sell form", async () => {
    const { onOpenChange } = mount();
    await pickAsset("sell", "BTC Cold");
    const sheet = screen.getByTestId("new-tx-sheet");
    expect(within(sheet).getByTestId("new-tx-type")).toBeInTheDocument();
    expect(within(sheet).getByTestId("new-tx-asset")).toHaveValue("BTC Cold");
    expect(within(sheet).getByTestId("swap-sell-sold")).toBeInTheDocument();
    expect(screen.queryByTestId("swap-sheet")).toBeNull();
    type("swap-sell-sold", "0.5");
    fireEvent.click(screen.getByTestId("swap-dest-out"));
    fireEvent.click(screen.getByTestId("swap-submit"));
    await waitFor(() => expect(writeMock).toHaveBeenCalled());
    expect(lastUrl()).toBe(`/budgets/b1/investments/${btcCold.id}/sell`);
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it("picking an asset to transfer shows its Transfer form in place", async () => {
    mount();
    await pickAsset("transfer", "BTC");
    const sheet = screen.getByTestId("new-tx-sheet");
    expect(within(sheet).getByTestId("new-tx-type")).toBeInTheDocument();
    expect(within(sheet).getByTestId("swap-transfer-qty")).toBeInTheDocument();
  });

  // Same unpick() as a type change (happy-dom cannot reopen a Radix Select).
  it("retyping the asset drops its form", async () => {
    mount();
    await pickAsset("sell", "BTC Cold");
    expect(screen.getByTestId("swap-sell-sold")).toBeInTheDocument();
    type("new-tx-asset", "BTC Col");
    expect(screen.queryByTestId("swap-sell-sold")).toBeNull();
  });

  it("Transfer leaves deposits out of the types", async () => {
    mount();
    fireEvent.click(screen.getByTestId("new-tx-kind-transfer"));
    fireEvent.keyDown(screen.getByTestId("new-tx-type"), { key: "Enter" });
    await screen.findByTestId("new-tx-type-option-crypto");
    expect(screen.queryByTestId("new-tx-type-option-deposit")).toBeNull();
  });
});

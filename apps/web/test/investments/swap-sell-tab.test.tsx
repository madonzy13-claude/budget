/**
 * swap-sell-tab.test.tsx — Swap → Sell (13.1 D-09, D-20..D-23, D-31; Phase 13
 * UAT tests 4 and 5). "Sell everything" is an action, destinations show the
 * buy price, Out of investments can land in a wallet, amount + currency sit on
 * one line, and the sum-up says what will happen.
 *
 * Round 2 (13.1-32): the form asks how much was SOLD (the client converts to
 * the server's `left`), Sell everything only fills the field, and the two
 * pickers are in-DOM Radix lists (a native popup got a 2-row sliver on phones).
 */
import "./_swap-fixtures";
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  btc,
  btcCold,
  cash,
  H,
  routeFetch,
  okWrite,
  lastBody,
  lastUrl,
  writeMock,
} from "./_swap-fixtures";
import type { HoldingDto } from "../../src/hooks/use-investments";
import { SwapSheet } from "../../src/components/budgeting/wallets-tab/swap-sheet";

function mount(
  holding: HoldingDto = btc,
  holdings: HoldingDto[] = [btc, btcCold, cash],
  budgetCurrency = "PLN",
) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <SwapSheet
        open
        onOpenChange={() => {}}
        budgetId="b1"
        budgetCurrency={budgetCurrency}
        holding={holding}
        holdings={holdings}
        initialTab="sell"
      />
    </QueryClientProvider>,
  );
}
const type = (id: string, v: string) =>
  fireEvent.change(screen.getByTestId(id), { target: { value: v } });
/** Radix Select under happy-dom: open with the keyboard, pick by testid. */
const pickDest = (id: string) =>
  fireEvent.change(screen.getByTestId("dest-pick"), { target: { value: id } });

beforeEach(() => {
  writeMock.mockReset();
  routeFetch({ rate: "0.25" });
  okWrite({ transferId: null, newHoldingId: null, walletId: null });
});

describe("Sell tab", () => {
  // Round-6 gap 1: a collectible is sold by units.
  it("a collectible asks how many units were sold", () => {
    const vase = H({
      id: "v1",
      name: "Vase",
      holdingType: "other",
      uiType: "collectibles",
      instrumentId: null,
      symbol: null,
      quantity: "2",
      isCustom: true,
    } as Partial<HoldingDto>);
    mount(vase, [vase, cash]);
    expect(screen.getByText("sell.qtySold")).toBeInTheDocument();
  });

  it("a single collectible (quantity 1) still asks for units", () => {
    const vase = H({
      id: "v2",
      name: "Vase",
      holdingType: "other",
      uiType: "collectibles",
      instrumentId: null,
      symbol: null,
      quantity: "1",
      isCustom: true,
    } as Partial<HoldingDto>);
    mount(vase, [vase, cash]);
    expect(screen.getByText("sell.qtySold")).toBeInTheDocument();
  });

  // Round-5 gap 5: a metal's held amount carries its unit.
  it("a metal's held amount names its unit", () => {
    const gold = H({
      id: "g1",
      name: "Gold",
      holdingType: "commodity",
      uiType: "precious_metals",
      instrumentId: null,
      symbol: null,
      metal: "gold",
      unitOfMeasure: "oz",
      quantity: "3",
    } as Partial<HoldingDto>);
    mount(gold, [gold, cash]);
    expect(screen.getByTestId("swap-sell-held")).toHaveTextContent(
      "sell.qtyHelper(qty=heldUnit.oz(qty=3,n=3))",
    );
  });

  it("asks how much was sold", () => {
    mount();
    expect(screen.getByText("swap.sell.sold")).toBeInTheDocument();
    expect(screen.getByText("sell.qtySold")).toBeInTheDocument();
    expect(document.querySelector('[data-testid$="-left"]')).toBeNull();
  });

  // Round-3 gap 3c: no "everything" button — tap what you hold to fill.
  it("tapping what you hold fills the field, which stays editable", async () => {
    mount();
    expect(screen.queryByTestId("swap-sell-all")).toBeNull();
    const held = screen.getByTestId("swap-sell-held");
    expect(held.tagName).toBe("BUTTON");
    expect(held).toHaveTextContent("sell.qtyHelper(qty=2 BTC)");
    fireEvent.click(held);
    const sold = screen.getByTestId("swap-sell-sold");
    expect(sold).toHaveValue("2");
    expect(sold).not.toHaveAttribute("readonly");
    type("swap-sell-sold", "1.5");
    expect(sold).toHaveValue("1.5");
    type("swap-sell-sold", "2");
    fireEvent.click(screen.getByTestId("swap-dest-out"));
    fireEvent.click(screen.getByTestId("swap-submit"));
    await waitFor(() => expect(writeMock).toHaveBeenCalled());
    expect(lastBody().left).toEqual({ quantity: "0" });
  });

  it("selling nothing or more than you hold is refused", () => {
    mount();
    for (const v of ["2.1", "0"]) {
      type("swap-sell-sold", v);
      expect(screen.getByText("swap.err.soldRange")).toBeInTheDocument();
      expect(screen.getByTestId("swap-submit")).toBeDisabled();
    }
  });

  for (const [sold, left] of [
    ["1.5", "0.5"],
    ["2", "0"],
  ] as const)
    it(`sold ${sold} of 2 tells the server ${left} is left`, async () => {
      mount();
      type("swap-sell-sold", sold);
      fireEvent.click(screen.getByTestId("swap-dest-out"));
      fireEvent.click(screen.getByTestId("swap-submit"));
      await waitFor(() => expect(writeMock).toHaveBeenCalled());
      expect(lastBody().left).toEqual({ quantity: left });
    });

  it("what is left is exact: 0.3 held, 0.1 sold leaves 0.2", async () => {
    mount(H({ quantity: "0.30000000", valueCents: "1800000" }), [btc]);
    type("swap-sell-sold", "0.1");
    fireEvent.click(screen.getByTestId("swap-dest-out"));
    fireEvent.click(screen.getByTestId("swap-submit"));
    await waitFor(() => expect(writeMock).toHaveBeenCalled());
    expect(lastBody().left).toEqual({ quantity: "0.2" });
  });

  it("an amount asset sends the value it keeps", async () => {
    const ibkr = H({
      name: "IBKR",
      holdingType: "other",
      uiType: "broker",
      instrumentId: null,
      quantity: "1",
      buyPriceCents: "5500000",
      currentPriceCents: "9600000",
      valueCents: "9600000",
    });
    mount(ibkr, [ibkr]);
    expect(screen.getByText("sell.valueSold")).toBeInTheDocument();
    type("swap-sell-sold", "66000");
    fireEvent.click(screen.getByTestId("swap-dest-out"));
    fireEvent.click(screen.getByTestId("swap-submit"));
    await waitFor(() => expect(writeMock).toHaveBeenCalled());
    expect(lastBody().left).toEqual({ valueCents: "3000000" });
    writeMock.mockClear();
    fireEvent.click(screen.getByTestId("swap-sell-held"));
    expect(screen.getByTestId("swap-sell-sold")).toHaveValue("96000");
    fireEvent.click(screen.getByTestId("swap-submit"));
    await waitFor(() => expect(writeMock).toHaveBeenCalled());
    expect(lastBody().left).toEqual({ valueCents: "0" });
  });

  // UAT 13.1 test 10: a quantity destination is quantity × price; the price
  // never follows the quantity.
  it("a new tracked destination starts at its live price; typing a quantity never moves it", async () => {
    mount();
    type("swap-sell-sold", "1"); // sold value 60,000 PLN
    fireEvent.click(screen.getByTestId("swap-dest-invest"));
    fireEvent.click(screen.getByTestId("dest-form-usdt"));
    expect(screen.getAllByTestId("swap-dest-qty")).toHaveLength(1);
    expect(screen.queryByTestId("swap-sell-received")).toBeNull();
    expect(screen.getByTestId("swap-dest-price")).toHaveValue("1");
    expect(screen.getByTestId("swap-dest-qty")).toHaveValue("60000");
    type("swap-dest-qty", "1000");
    expect(screen.getByTestId("swap-dest-price")).toHaveValue("1");
    fireEvent.click(screen.getByTestId("swap-submit"));
    await waitFor(() => expect(writeMock).toHaveBeenCalled());
    const body = lastBody();
    expect(body.receivedCents).toBeUndefined();
    expect(body.destination).toMatchObject({
      kind: "new",
      priceCents: "100",
      holding: { name: "USDT", quantity: "1000", currentPriceCents: "100" },
    });
    expect(body.destination.holding.livePriceCents).toBeUndefined();
  });

  it("an untouched quantity follows the price; a typed one never moves", () => {
    mount();
    type("swap-sell-sold", "1");
    fireEvent.click(screen.getByTestId("swap-dest-invest"));
    fireEvent.click(screen.getByTestId("dest-form-qty"));
    type("swap-dest-price", "2");
    expect(screen.getByTestId("swap-dest-qty")).toHaveValue("30000");
    type("swap-dest-qty", "1000");
    expect(screen.getByTestId("swap-dest-price")).toHaveValue("2");
    type("swap-dest-price", "3");
    expect(screen.getByTestId("swap-dest-qty")).toHaveValue("1000");
    expect(screen.queryByText("swap.sell.linked")).toBeNull();
  });

  it("an existing quantity destination is priced at its own price, read-only", async () => {
    mount();
    type("swap-sell-sold", "1");
    fireEvent.click(screen.getByTestId("swap-dest-invest"));
    pickDest(btcCold.id);
    // Round 6: picked in place — no second dropdown.
    expect(screen.queryByTestId("swap-sell-existing")).toBeNull();
    expect(screen.getByTestId("dest-form-state")).toHaveAttribute(
      "data-selected",
      btcCold.id,
    );
    expect(screen.getByTestId("swap-dest-price")).toHaveAttribute("readonly");
    expect(screen.getByTestId("swap-dest-price")).toHaveValue("60000");
    expect(screen.getByTestId("swap-dest-qty")).toHaveValue("1");
    type("swap-dest-qty", "0.5");
    expect(screen.getByTestId("swap-dest-price")).toHaveValue("60000");
    fireEvent.click(screen.getByTestId("swap-submit"));
    await waitFor(() => expect(writeMock).toHaveBeenCalled());
    expect(lastBody().receivedCents).toBeUndefined();
    expect(lastBody().destination).toEqual({
      kind: "existing",
      holdingId: btcCold.id,
      quantityBought: "0.5",
    });
  });

  // Round-5 gap 6: an existing asset preselects its currency; any may be chosen.
  it("an existing asset preselects its currency, which can change; booked into it", async () => {
    const usdPot = H({
      ...cash,
      id: "77777777-7777-7777-7777-777777777777",
      name: "Dollar pot",
      buyCurrency: "USD",
      currentPriceCurrency: "USD",
    });
    mount(btc, [btc, btcCold, cash, usdPot]);
    type("swap-sell-sold", "1");
    fireEvent.click(screen.getByTestId("swap-dest-invest"));
    pickDest(usdPot.id);
    expect(screen.queryByTestId("swap-received-ccy")).toBeNull();
    const picker = screen.getByTestId("currency-picker");
    expect(picker).toHaveValue("USD");
    fireEvent.change(picker, { target: { value: "EUR" } });
    type("swap-sell-received", "400");
    fireEvent.click(screen.getByTestId("swap-submit"));
    await waitFor(() => expect(writeMock).toHaveBeenCalled());
    expect(lastBody()).toMatchObject({
      receivedCurrency: "EUR",
      receivedCents: "40000",
      destination: { kind: "existing", holdingId: usdPot.id },
    });
  });

  it("an existing quantity asset offers a currency too", async () => {
    mount();
    type("swap-sell-sold", "1");
    fireEvent.click(screen.getByTestId("swap-dest-invest"));
    pickDest(btcCold.id);
    expect(screen.getByTestId("currency-picker")).toHaveValue("PLN");
  });

  // Round-6 gap 3 (user): one Into investments destination, pick in place.
  it("offers exactly Into investments and Out", () => {
    mount();
    expect(screen.getByTestId("swap-dest-invest")).toBeInTheDocument();
    expect(screen.getByTestId("swap-dest-out")).toBeInTheDocument();
    expect(screen.queryByTestId("swap-dest-new")).toBeNull();
    expect(screen.queryByTestId("swap-dest-existing")).toBeNull();
  });

  it("a new name says a new asset will be created and books one", async () => {
    mount();
    type("swap-sell-sold", "1");
    fireEvent.click(screen.getByTestId("dest-form"));
    expect(screen.getByTestId("swap-dest-new-marker")).toHaveTextContent(
      "swap.sell.dest.willCreate(name=Erste)",
    );
    type("swap-sell-received", "100");
    fireEvent.click(screen.getByTestId("swap-submit"));
    await waitFor(() => expect(writeMock).toHaveBeenCalled());
    expect(lastBody().destination).toMatchObject({ kind: "new" });
  });

  it("typing after a pick drops it: back to a new asset", async () => {
    mount();
    type("swap-sell-sold", "1");
    pickDest(cash.id);
    expect(screen.queryByTestId("swap-dest-new-marker")).toBeNull();
    fireEvent.change(screen.getByTestId("dest-pick"), {
      target: { value: "" },
    });
    fireEvent.click(screen.getByTestId("dest-form"));
    expect(screen.getByTestId("swap-dest-new-marker")).toBeInTheDocument();
    type("swap-sell-received", "100");
    fireEvent.click(screen.getByTestId("swap-submit"));
    await waitFor(() => expect(writeMock).toHaveBeenCalled());
    expect(lastBody().destination).toMatchObject({ kind: "new" });
  });

  it("the asset being sold is not offered", () => {
    mount();
    expect(screen.getByTestId("dest-form-state")).toHaveAttribute(
      "data-exclude",
      btc.id,
    );
  });

  // UAT 13.1 test 14: one rate per deal, the same as the server.
  it("a fair cross-currency sale previews realized 0", () => {
    mount();
    type("swap-sell-sold", "1"); // sold cost 50,000 PLN
    fireEvent.click(screen.getByTestId("swap-dest-out"));
    fireEvent.change(screen.getByTestId("currency-picker"), {
      target: { value: "EUR" },
    });
    type("swap-sell-received", "12500"); // = 50,000 PLN × 0.25
    return waitFor(() =>
      expect(screen.getByTestId("swap-summary")).toHaveTextContent(
        "swap.sum.realized(amount=0 PLN)",
      ),
    );
  });

  it("Out defaults to Nowhere and books without a wallet", async () => {
    mount();
    type("swap-sell-sold", "1");
    fireEvent.click(screen.getByTestId("swap-dest-out"));
    expect(screen.getByTestId("wallet-target-nowhere")).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(screen.getByTestId("swap-submit")).toHaveTextContent(
      "swap.cta.sellOut",
    );
    expect(screen.getByTestId("swap-summary")).toHaveTextContent(
      "swap.sum.leaves",
    );
    fireEvent.click(screen.getByTestId("swap-submit"));
    await waitFor(() => expect(writeMock).toHaveBeenCalled());
    expect(lastUrl()).toBe(`/budgets/b1/investments/${btc.id}/sell`);
    expect(lastBody().destination).toEqual({
      kind: "out",
      wallet: { kind: "nowhere" },
    });
  });

  it("an existing wallet: active wallets incl. possessions, currency locked, amount at today's rate", async () => {
    mount();
    type("swap-sell-sold", "1");
    fireEvent.click(screen.getByTestId("swap-dest-out"));
    fireEvent.click(screen.getByTestId("wallet-target-existing"));
    const trigger = screen.getByTestId("swap-wallet-select");
    expect(trigger).toHaveAttribute("role", "combobox");
    await waitFor(() => expect(trigger).not.toHaveAttribute("data-disabled"));
    fireEvent.keyDown(trigger, { key: "Enter" });
    const list = await screen.findByRole("listbox");
    await waitFor(() =>
      expect(
        [...list.querySelectorAll("[role=option]")]
          .map((o) =>
            o.getAttribute("data-testid")!.replace("swap-wallet-option-", ""),
          )
          .sort(),
      ).toEqual(["w-car", "w-eur", "w-pln"]),
    );
    fireEvent.keyDown(screen.getByTestId("swap-wallet-option-w-eur"), {
      key: "Enter",
    });
    await waitFor(() =>
      expect(screen.getByTestId("swap-sell-received")).toHaveValue("15000"),
    );
    expect(screen.getByTestId("swap-received-ccy")).toHaveTextContent("EUR");
    expect(screen.getByTestId("swap-summary")).toHaveTextContent("Euro");
    fireEvent.click(screen.getByTestId("swap-submit"));
    await waitFor(() => expect(writeMock).toHaveBeenCalled());
    expect(lastBody()).toMatchObject({
      destination: {
        kind: "out",
        wallet: { kind: "existing", walletId: "w-eur" },
      },
      receivedCurrency: "EUR",
      receivedCents: "1500000",
    });
  });

  it("a new wallet needs a name and a type; it starts with the amount", async () => {
    mount();
    type("swap-sell-sold", "1");
    fireEvent.click(screen.getByTestId("swap-dest-out"));
    fireEvent.click(screen.getByTestId("wallet-target-new"));
    expect(screen.getByText("swap.err.nameRequired")).toBeInTheDocument();
    expect(screen.getByTestId("swap-submit")).toBeDisabled();
    expect(
      [
        ...(screen.getByTestId("swap-wallet-type") as HTMLSelectElement)
          .options,
      ].map((o) => o.value),
    ).toEqual(["SPENDINGS", "CUSHION", "RESERVE", "POSSESSION", "OTHER"]);
    type("swap-wallet-name", "From BTC");
    type("swap-wallet-type", "CUSHION");
    expect(screen.getByTestId("swap-summary")).toHaveTextContent(
      "swap.sum.walletNew",
    );
    fireEvent.click(screen.getByTestId("swap-submit"));
    await waitFor(() => expect(writeMock).toHaveBeenCalled());
    expect(lastBody().destination).toEqual({
      kind: "out",
      wallet: {
        kind: "new",
        name: "From BTC",
        walletType: "CUSHION",
        currency: "PLN",
      },
    });
  });

  it("amount received and its currency share one line", () => {
    mount();
    const row = screen.getByTestId("swap-received-row");
    expect(row.className).toContain("flex");
    expect(row.className).toContain("flex-nowrap");
    expect(row).toContainElement(screen.getByTestId("swap-sell-received"));
  });

  it("a holding with no currency falls back to the budget currency", () => {
    mount(H({ buyCurrency: null, currentPriceCurrency: null }), [btc], "EUR");
    type("swap-sell-sold", "1");
    fireEvent.click(screen.getByTestId("swap-dest-out"));
    expect(screen.getByTestId("currency-picker")).toHaveValue("EUR");
  });

  // UAT 13.1 test 9: wallet target layout + a new wallet's currency.
  it("wallet target cards centre their label", () => {
    mount();
    type("swap-sell-sold", "1");
    fireEvent.click(screen.getByTestId("swap-dest-out"));
    for (const k of ["existing", "new", "nowhere"])
      expect(screen.getByTestId(`wallet-target-${k}`).className).toContain(
        "items-center",
      );
  });

  it("a new wallet takes the amount's own currency; a typed amount stays on switch", async () => {
    mount();
    type("swap-sell-sold", "1");
    fireEvent.click(screen.getByTestId("swap-dest-out"));
    fireEvent.click(screen.getByTestId("wallet-target-new"));
    expect(screen.getAllByTestId("currency-picker")).toHaveLength(1);
    const picker = screen.getByTestId("currency-picker");
    expect(picker).not.toBeDisabled();
    type("swap-sell-received", "500");
    fireEvent.change(picker, { target: { value: "EUR" } });
    expect(screen.getByTestId("swap-sell-received")).toHaveValue("500");
    type("swap-wallet-name", "Euro pot");
    fireEvent.click(screen.getByTestId("swap-submit"));
    await waitFor(() => expect(writeMock).toHaveBeenCalled());
    expect(lastBody()).toMatchObject({
      receivedCurrency: "EUR",
      receivedCents: "50000",
      destination: { wallet: { kind: "new", currency: "EUR" } },
    });
  });
});

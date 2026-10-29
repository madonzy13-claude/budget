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
  routeFetch,
  fetchMock,
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
  routeFetch();
  writeMock.mockReset();
  toastMock.success.mockReset();
  writeMock.mockResolvedValue(
    new Response(JSON.stringify({ id: "x" }), { status: 200 }),
  );
});

// Round-2 gap 10: the configuration Edit cannot change, shown locked.
const locked = (f: string) => screen.getByTestId(`edit-asset-locked-${f}`);
const expectLocked = (f: string, text: string) => {
  const el = locked(f) as HTMLInputElement;
  expect(el.readOnly).toBe(true);
  expect(el).toHaveAttribute("aria-readonly", "true");
  expect(el).toHaveAttribute("tabindex", "-1");
  expect(el.value).toContain(text);
};

describe("Edit asset sheet — currencies (round-4 gap 23)", () => {
  it("a currency used by another asset of the same name in the type is greyed out", () => {
    const erstePln = H({
      id: "e-pln",
      name: "Erste",
      uiType: "cash",
      holdingType: "cash_fx",
      instrumentId: null,
      currentPriceCurrency: "PLN",
      buyCurrency: "PLN",
    });
    const ersteUsd = H({
      ...erstePln,
      id: "e-usd",
      currentPriceCurrency: "USD",
      buyCurrency: "USD",
    });
    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={qc}>
        <EditAssetSheet
          open
          onOpenChange={() => {}}
          budgetId="b1"
          budgetCurrency="PLN"
          holding={ersteUsd}
          siblings={[erstePln, ersteUsd]}
        />
      </QueryClientProvider>,
    );
    const opt = (c: string) =>
      screen
        .getByTestId("currency-picker")
        .querySelector<HTMLOptionElement>(`option[value="${c}"]`)!;
    expect(opt("PLN").disabled).toBe(true);
    expect(opt("USD").disabled).toBe(false);
    expect(opt("EUR").disabled).toBe(false);
  });
});

describe("Edit asset sheet — locked configuration", () => {
  it("a deposit shows its rate, capitalization and start date locked", () => {
    mount(
      H({
        name: "Term",
        holdingType: "deposit",
        uiType: "deposit",
        instrumentId: null,
        depositRateBps: 525,
        depositCapFrequency: "yearly",
        depositStartDate: "2026-07-01",
      }),
    );
    expectLocked("rate", "5.25%");
    expectLocked("capFrequency", "capFrequency.yearly");
    expectLocked("startDate", "2026");
  });

  it("a tracked asset shows its instrument and current price locked", () => {
    mount(btc);
    expectLocked("instrument", "Bitcoin");
    expectLocked("currentPrice", "60,000");
    expectLocked("currentPrice", "PLN");
  });

  it("a metal shows metal, kind, unit, current price and premium locked", () => {
    mount(
      H({
        name: "Coins",
        holdingType: "commodity",
        uiType: "precious_metals",
        metal: "silver",
        metalKind: "coin",
        unitOfMeasure: "g",
        premiumPct: "25.17",
        currentPriceCents: "5155",
      }),
    );
    expectLocked("metal", "metalOption.silver");
    expectLocked("kind", "kindOption.coin");
    expectLocked("uom", "uomOption.g");
    expectLocked("currentPrice", "51.55");
    expectLocked("premium", "25.17%");
  });

  it("a hand-priced asset keeps its editable price and no locked duplicate", () => {
    mount(coin);
    expect(screen.getByTestId("edit-asset-price")).toBeInTheDocument();
    expect(screen.queryByTestId("edit-asset-locked-currentPrice")).toBeNull();
  });

  it("saving never sends the locked configuration", async () => {
    mount(btc);
    type("edit-asset-name", "BTC main");
    fireEvent.click(screen.getByTestId("edit-asset-save"));
    await waitFor(() => expect(writeMock).toHaveBeenCalled());
    expect(lastBody()).toEqual({ name: "BTC main" });
  });
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

  // UAT 13.1 test 6: the form shows the converted value before save.
  describe("currency change on a hand-valued asset", () => {
    it("converts the value live and shows the FX line", async () => {
      mount(cash); // 1,000 PLN
      type("currency-picker", "EUR");
      await waitFor(() =>
        expect(screen.getByTestId("edit-asset-value")).toHaveValue("250"),
      );
      expect(screen.getByTestId("edit-asset-fx")).toHaveTextContent(
        /1000 PLN · ~250 EUR @ 0.25/,
      );
    });

    it("saving an untouched converted value sends the currency alone", async () => {
      mount(cash);
      type("currency-picker", "EUR");
      await waitFor(() =>
        expect(screen.getByTestId("edit-asset-value")).toHaveValue("250"),
      );
      fireEvent.click(screen.getByTestId("edit-asset-save"));
      await waitFor(() => expect(writeMock).toHaveBeenCalled());
      expect(lastBody()).toEqual({ displayCurrency: "EUR" });
    });

    it("a hand-edited value after the switch is sent too", async () => {
      mount(cash);
      type("currency-picker", "EUR");
      await waitFor(() =>
        expect(screen.getByTestId("edit-asset-value")).toHaveValue("250"),
      );
      type("edit-asset-value", "260");
      fireEvent.click(screen.getByTestId("edit-asset-save"));
      await waitFor(() => expect(writeMock).toHaveBeenCalled());
      expect(lastBody()).toEqual({
        displayCurrency: "EUR",
        currentValueCents: "26000",
      });
    });

    it("switching back restores the original value, no FX line", async () => {
      mount(cash);
      type("currency-picker", "EUR");
      await waitFor(() =>
        expect(screen.getByTestId("edit-asset-value")).toHaveValue("250"),
      );
      type("currency-picker", "PLN");
      expect(screen.getByTestId("edit-asset-value")).toHaveValue("1000");
      expect(screen.queryByTestId("edit-asset-fx")).toBeNull();
    });

    it("an FX failure keeps the value, says so, and still saves the currency", async () => {
      fetchMock.mockImplementation(
        async () => new Response("{}", { status: 503 }),
      );
      mount(cash);
      type("currency-picker", "EUR");
      await waitFor(() =>
        expect(screen.getByText("edit.fxUnavailable")).toBeInTheDocument(),
      );
      expect(screen.getByTestId("edit-asset-value")).toHaveValue("1000");
      fireEvent.click(screen.getByTestId("edit-asset-save"));
      await waitFor(() => expect(writeMock).toHaveBeenCalled());
      expect(lastBody()).toEqual({ displayCurrency: "EUR" });
    });
  });
});

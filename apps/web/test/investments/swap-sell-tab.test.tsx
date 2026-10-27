/**
 * swap-sell-tab.test.tsx — Swap → Sell (13.1 D-09, D-20..D-23, D-31; Phase 13
 * UAT tests 4 and 5). "Sell everything" is an action, destinations show the
 * buy price, Out of investments can land in a wallet, amount + currency sit on
 * one line, and the sum-up says what will happen.
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

beforeEach(() => {
  writeMock.mockReset();
  routeFetch({ rate: "0.25" });
  okWrite({ transferId: null, newHoldingId: null, walletId: null });
});

describe("Sell tab", () => {
  it("Sell everything is an outlined toggle that locks left at 0", () => {
    mount();
    const all = screen.getByTestId("swap-sell-all");
    expect(all.tagName).toBe("BUTTON");
    fireEvent.click(all);
    expect(all).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("swap-sell-left")).toHaveValue("0");
    expect(screen.getByTestId("swap-sell-left")).toHaveAttribute("readonly");
    fireEvent.click(all);
    expect(screen.getByTestId("swap-sell-left")).toHaveValue("");
  });

  it("left at or above holdings is refused", () => {
    mount();
    type("swap-sell-left", "2");
    expect(screen.getByText("swap.err.leftTooHigh")).toBeInTheDocument();
  });

  it("an existing quantity destination shows its price read-only and derives the quantity", () => {
    mount();
    type("swap-sell-left", "1");
    fireEvent.click(screen.getByTestId("swap-dest-existing"));
    type("swap-sell-existing", btcCold.id);
    type("swap-sell-received", "60000");
    expect(screen.getByTestId("swap-dest-price")).toHaveAttribute("readonly");
    expect(screen.getByTestId("swap-dest-price")).toHaveValue("60000");
    expect(screen.getByTestId("swap-dest-qty")).toHaveValue("1");
  });

  it("a new quantity destination links quantity and price to the amount", () => {
    mount();
    type("swap-sell-left", "1");
    fireEvent.click(screen.getByTestId("swap-dest-new"));
    fireEvent.click(screen.getByTestId("dest-form-qty"));
    type("swap-sell-received", "60000");
    type("swap-dest-qty", "20");
    expect(screen.getByTestId("swap-dest-price")).toHaveValue("3000");
    type("swap-dest-price", "6000");
    expect(screen.getByTestId("swap-dest-qty")).toHaveValue("10");
    expect(screen.getByText("swap.sell.linked")).toBeInTheDocument();
  });

  it("Out defaults to Nowhere and books without a wallet", async () => {
    mount();
    type("swap-sell-left", "1");
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
    type("swap-sell-left", "1");
    fireEvent.click(screen.getByTestId("swap-dest-out"));
    fireEvent.click(screen.getByTestId("wallet-target-existing"));
    const opts = () =>
      [
        ...(screen.getByTestId("swap-wallet-select") as HTMLSelectElement)
          .options,
      ]
        .map((o) => o.value)
        .filter(Boolean);
    await waitFor(() =>
      expect(opts().sort()).toEqual(["w-car", "w-eur", "w-pln"]),
    );
    type("swap-wallet-select", "w-eur");
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
    type("swap-sell-left", "1");
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
    type("swap-sell-left", "1");
    fireEvent.click(screen.getByTestId("swap-dest-out"));
    expect(screen.getByTestId("currency-picker")).toHaveValue("EUR");
  });
});

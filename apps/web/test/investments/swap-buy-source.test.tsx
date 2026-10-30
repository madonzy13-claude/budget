/**
 * swap-buy-source.test.tsx — Buy: where did the money come from? (13.1 round
 * 6, user). "Out of investments" is today's Buy; "From another asset" sells
 * part of a held asset into this one (booked by the Sell endpoint).
 */
import "./_swap-fixtures";
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  btc,
  btcCold,
  broker,
  cash,
  routeFetch,
  okWrite,
  lastBody,
  lastUrl,
  writeMock,
} from "./_swap-fixtures";
import type { HoldingDto } from "../../src/hooks/use-investments";
import { SwapSheet } from "../../src/components/budgeting/wallets-tab/swap-sheet";

function mount(holding: HoldingDto) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <SwapSheet
        open
        onOpenChange={() => {}}
        budgetId="b1"
        budgetCurrency="PLN"
        holding={holding}
        holdings={[btc, btcCold, broker, cash]}
      />
    </QueryClientProvider>,
  );
}
const type = (id: string, v: string) =>
  fireEvent.change(screen.getByTestId(id), { target: { value: v } });
/** Radix Select under happy-dom: open with the keyboard, pick by testid. */
async function pick(trigger: string, option: string) {
  fireEvent.keyDown(screen.getByTestId(trigger), { key: "Enter" });
  fireEvent.keyDown(await screen.findByTestId(option), { key: "Enter" });
}

beforeEach(() => {
  writeMock.mockReset();
  routeFetch();
  okWrite({
    entryId: "x",
    transferId: "t",
    newHoldingId: null,
    walletId: null,
  });
});

describe("Buy — where did the money come from?", () => {
  it("offers Out of investments (default) and From another asset", () => {
    mount(btc);
    expect(screen.getByTestId("swap-buy-from-out")).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(screen.getByTestId("swap-buy-from-asset")).toBeInTheDocument();
    expect(screen.queryByTestId("swap-buy-src")).toBeNull();
  });

  it("Out of investments books a plain Buy", async () => {
    mount(btc);
    type("swap-buy-qty", "0.5");
    type("swap-buy-price", "50000");
    fireEvent.click(screen.getByTestId("swap-submit"));
    await waitFor(() => expect(writeMock).toHaveBeenCalled());
    expect(lastUrl()).toMatch(new RegExp(`/investments/${btc.id}/buy$`));
  });

  it("the source list leaves this asset out", async () => {
    mount(btc);
    fireEvent.click(screen.getByTestId("swap-buy-from-asset"));
    fireEvent.keyDown(screen.getByTestId("swap-buy-src"), { key: "Enter" });
    await screen.findByTestId(`swap-buy-src-option-${cash.id}`);
    expect(screen.queryByTestId(`swap-buy-src-option-${btc.id}`)).toBeNull();
  });

  // R6 (user): a nicer list — one labelled group per type, with its icon;
  // each row: name, then value · currency (and quantity for counted assets).
  it("groups the sources by type with an icon header and rich rows", async () => {
    mount(btc);
    fireEvent.click(screen.getByTestId("swap-buy-from-asset"));
    fireEvent.keyDown(screen.getByTestId("swap-buy-src"), { key: "Enter" });
    const cryptoHead = await screen.findByTestId("swap-buy-src-group-crypto");
    expect(cryptoHead).toHaveTextContent("uitype.crypto");
    expect(cryptoHead.querySelector("[data-type-icon]")).not.toBeNull();
    expect(screen.getByTestId("swap-buy-src-group-cash")).toBeInTheDocument();
    expect(screen.getByTestId("swap-buy-src-group-broker")).toBeInTheDocument();
    const row = screen.getByTestId(`swap-buy-src-option-${btcCold.id}`);
    expect(row.querySelector("[data-src-name]")).toHaveTextContent("BTC Cold");
    expect(row.querySelector("[data-src-value]")).toHaveTextContent(
      "60,000 PLN",
    );
    expect(row.querySelector("[data-src-qty]")).toHaveTextContent("1 BTC");
    expect(
      screen
        .getByTestId(`swap-buy-src-option-${cash.id}`)
        .querySelector("[data-src-qty]"),
    ).toBeNull();
  });

  // R6 (user): the picked source shows in full in the field, one line.
  it("the picked source shows its name, value and quantity in the field", async () => {
    mount(cash);
    fireEvent.click(screen.getByTestId("swap-buy-from-asset"));
    await pick("swap-buy-src", `swap-buy-src-option-${btcCold.id}`);
    const field = screen.getByTestId("swap-buy-src");
    expect(field.querySelector("[data-src-name]")).toHaveTextContent(
      "BTC Cold",
    );
    expect(field.querySelector("[data-src-value]")).toHaveTextContent(
      "60,000 PLN",
    );
    expect(field.querySelector("[data-src-qty]")).toHaveTextContent("1 BTC");
    expect(field.className).toMatch(/\[&>span\]:!flex/);
  });

  it("list rows keep a compact height", async () => {
    mount(btc);
    fireEvent.click(screen.getByTestId("swap-buy-from-asset"));
    fireEvent.keyDown(screen.getByTestId("swap-buy-src"), { key: "Enter" });
    const row = await screen.findByTestId(`swap-buy-src-option-${cash.id}`);
    expect(row.className).not.toMatch(/min-h-11/);
  });

  it("from an amount asset into a quantity asset: sells the source into this one", async () => {
    mount(btc);
    fireEvent.click(screen.getByTestId("swap-buy-from-asset"));
    await pick("swap-buy-src", `swap-buy-src-option-${cash.id}`);
    type("swap-buy-taken", "500");
    type("swap-buy-qty", "0.01");
    type("swap-buy-price", "50000");
    fireEvent.click(screen.getByTestId("swap-submit"));
    await waitFor(() => expect(writeMock).toHaveBeenCalled());
    expect(lastUrl()).toMatch(new RegExp(`/investments/${cash.id}/sell$`));
    expect(lastBody()).toMatchObject({
      left: { valueCents: "50000" },
      destination: {
        kind: "existing",
        holdingId: btc.id,
        quantityBought: "0.01",
        priceCents: "5000000",
      },
      receivedCurrency: "PLN",
    });
    expect(lastBody().receivedCents).toBeUndefined();
  });

  it("from a quantity asset into an amount asset: the amount is what arrived", async () => {
    mount(cash);
    fireEvent.click(screen.getByTestId("swap-buy-from-asset"));
    await pick("swap-buy-src", `swap-buy-src-option-${btcCold.id}`);
    // "You hold" fills everything.
    fireEvent.click(screen.getByTestId("swap-buy-src-held"));
    expect(screen.getByTestId("swap-buy-taken")).toHaveValue("1");
    type("swap-buy-taken", "0.5");
    type("swap-buy-amount", "300");
    fireEvent.click(screen.getByTestId("swap-submit"));
    await waitFor(() => expect(writeMock).toHaveBeenCalled());
    expect(lastUrl()).toMatch(new RegExp(`/investments/${btcCold.id}/sell$`));
    expect(lastBody()).toMatchObject({
      left: { quantity: "0.5" },
      destination: { kind: "existing", holdingId: cash.id },
      receivedCents: "30000",
      receivedCurrency: "PLN",
    });
  });

  it("taking more than the source holds is refused", () => {
    mount(btc);
    fireEvent.click(screen.getByTestId("swap-buy-from-asset"));
    return pick("swap-buy-src", `swap-buy-src-option-${cash.id}`).then(() => {
      type("swap-buy-taken", "5000");
      type("swap-buy-qty", "1");
      type("swap-buy-price", "1");
      expect(screen.getByTestId("swap-submit")).toBeDisabled();
    });
  });
});

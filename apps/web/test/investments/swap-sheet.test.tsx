/**
 * swap-sheet.test.tsx — Swap sheet shell, Buy and Transfer tabs, sum-up card
 * (13.1 D-08, D-10, D-11, D-15, D-31; UI-SPEC §2, 2a, 2c, 2d).
 */
import "./_swap-fixtures";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  btc,
  btcCold,
  sol,
  broker,
  cash,
  deposit,
  routeFetch,
  okWrite,
  lastBody,
  lastUrl,
  writeMock,
  fetchMock,
} from "./_swap-fixtures";
import type { HoldingDto } from "../../src/hooks/use-investments";
import { SwapSheet } from "../../src/components/budgeting/wallets-tab/swap-sheet";

function mount(
  holding: HoldingDto,
  holdings: HoldingDto[] = [btc, btcCold, sol, broker, cash, deposit],
) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <SwapSheet
        open
        onOpenChange={() => {}}
        budgetId="b1"
        budgetCurrency="PLN"
        holding={holding}
        holdings={holdings}
      />
    </QueryClientProvider>,
  );
}
const type = (id: string, v: string) =>
  fireEvent.change(screen.getByTestId(id), { target: { value: v } });

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

describe("Swap sheet", () => {
  it("offers Buy / Sell / Transfer as a radio group, Buy first", () => {
    mount(btc);
    expect(screen.getByTestId("swap-sheet")).toBeInTheDocument();
    expect(screen.getByRole("radiogroup")).toBeInTheDocument();
    expect(screen.getByTestId("swap-tab-buy")).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(screen.getByText("swap.title(name=BTC)")).toBeInTheDocument();
  });

  it("a deposit only sells — no tabs, Sell title", () => {
    mount(deposit);
    expect(screen.queryByTestId("swap-tab-buy")).toBeNull();
    expect(
      screen.getByText("swap.sellTitle(name=Bank 5%)"),
    ).toBeInTheDocument();
    expect(screen.getByTestId("swap-sell-sold")).toBeInTheDocument();
  });

  it("switching tabs keeps the date and resets the rest", () => {
    mount(btc);
    type("swap-date", "2026-10-01");
    type("swap-buy-qty", "1");
    fireEvent.click(screen.getByTestId("swap-tab-transfer"));
    fireEvent.click(screen.getByTestId("swap-tab-buy"));
    expect(screen.getByTestId("swap-date")).toHaveValue("2026-10-01");
    expect(screen.getByTestId("swap-buy-qty")).toHaveValue("");
  });

  it("the date cannot go before the latest entry (D-15)", async () => {
    routeFetch({ latest: "2026-09-15" });
    mount(btc);
    await waitFor(() =>
      expect(screen.getByTestId("swap-date")).toHaveAttribute(
        "min",
        "2026-09-15",
      ),
    );
    expect(
      // Localized, not ISO (UAT 13.1 test 8).
      screen.getByText("swap.dateMin(date=15 Sep 2026)"),
    ).toBeInTheDocument();
  });
});

describe("Buy tab", () => {
  it("quantity: locked type/name/instrument, total helper, books {kind:quantity}", async () => {
    mount(btc);
    for (const id of [
      "swap-locked-type",
      "swap-locked-name",
      "swap-locked-instrument",
    ])
      expect(screen.getByTestId(id)).toHaveAttribute("aria-readonly", "true");
    type("swap-buy-qty", "0,5");
    type("swap-buy-price", "70000");
    expect(screen.getByTestId("swap-buy-total")).toHaveTextContent(
      "swap.buy.total",
    );
    type("swap-date", "2026-10-01");
    fireEvent.click(screen.getByTestId("swap-submit"));
    await waitFor(() => expect(writeMock).toHaveBeenCalled());
    expect(lastUrl()).toBe(`/budgets/b1/investments/${btc.id}/buy`);
    expect(lastBody()).toEqual({
      kind: "quantity",
      quantity: "0.5",
      priceCents: "7000000",
      currency: "PLN",
      effectiveDate: "2026-10-01",
    });
  });

  it("the sum-up shows only once something changes (UAT 13.1 test 8)", () => {
    mount(btc);
    expect(screen.queryByTestId("swap-summary")).toBeNull();
    type("swap-buy-qty", "0.5");
    type("swap-buy-price", "70000");
    expect(screen.getByTestId("swap-summary")).toBeInTheDocument();
    type("swap-buy-qty", "");
    expect(screen.queryByTestId("swap-summary")).toBeNull();
  });

  it("refuses a zero amount and keeps the sum-up hidden", () => {
    mount(btc);
    type("swap-buy-qty", "0");
    type("swap-buy-price", "100");
    expect(screen.getByText("swap.err.positive")).toBeInTheDocument();
    expect(screen.queryByTestId("swap-summary")).toBeNull();
    expect(screen.getByTestId("swap-submit")).toBeDisabled();
  });

  it("broker: value after follows the amount until edited, then stays", async () => {
    mount(broker);
    type("swap-buy-amount", "10000");
    expect(screen.getByTestId("swap-buy-value-after")).toHaveValue("130000");
    type("swap-buy-value-after", "133250");
    type("swap-buy-amount", "20000");
    expect(screen.getByTestId("swap-buy-value-after")).toHaveValue("133250");
    expect(screen.getByTestId("swap-buy-split")).toHaveTextContent(
      "swap.buy.split",
    );
    fireEvent.click(screen.getByTestId("swap-submit"));
    await waitFor(() => expect(writeMock).toHaveBeenCalled());
    expect(lastBody()).toMatchObject({
      kind: "broker",
      amountCents: "2000000",
      valueAfterCents: "13325000",
    });
  });

  it("cash: amount + currency with the P/L-unchanged helper", async () => {
    mount(cash);
    expect(screen.getByText("swap.buy.cashHelp")).toBeInTheDocument();
    type("swap-buy-amount", "50");
    fireEvent.click(screen.getByTestId("swap-submit"));
    await waitFor(() => expect(writeMock).toHaveBeenCalled());
    expect(lastBody()).toMatchObject({
      kind: "amount",
      amountCents: "5000",
      currency: "PLN",
    });
  });
});

describe("Transfer tab", () => {
  // UAT 13.1 test 11: one name field with autocomplete + add new; no cards.
  const transferTo = async (label: string | null) => {
    mount(btc);
    fireEvent.click(screen.getByTestId("swap-tab-transfer"));
    type("swap-transfer-qty", "1");
    expect(screen.queryByTestId("swap-transfer-to-existing")).toBeNull();
    expect(screen.queryByTestId("swap-transfer-to-new")).toBeNull();
    const field = screen.getByTestId("swap-transfer-name");
    fireEvent.focus(field);
    if (label === null) {
      const option = await screen.findByText("BTC Cold");
      fireEvent.mouseDown(option);
    } else type("swap-transfer-name", label);
  };

  it("picking an existing asset from the list transfers into it", async () => {
    await transferTo(null);
    fireEvent.click(screen.getByTestId("swap-submit"));
    await waitFor(() => expect(writeMock).toHaveBeenCalled());
    expect(lastBody().to).toEqual({ kind: "existing", holdingId: btcCold.id });
  });

  it("a typed name equal to an existing asset is that asset (D-07)", async () => {
    await transferTo("  btc cold ");
    // Round 4: no join note to wait on — wait for the type's names instead;
    // the existing asset is still the target.
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(([u]) => String(u).includes("/names")),
      ).toBe(true),
    );
    await new Promise((r) => setTimeout(r, 20));
    fireEvent.click(screen.getByTestId("swap-submit"));
    await waitFor(() => expect(writeMock).toHaveBeenCalled());
    expect(lastBody().to).toEqual({ kind: "existing", holdingId: btcCold.id });
  });

  it("an asset of another instrument cannot receive the crypto (D-10)", async () => {
    await transferTo("SOL");
    expect(
      await screen.findByText("swap.transfer.sameInstrument"),
    ).toBeInTheDocument();
    expect(screen.getByTestId("swap-submit")).toBeDisabled();
  });

  it("Move everything to a new label books the transfer", async () => {
    mount(btc);
    fireEvent.click(screen.getByTestId("swap-tab-transfer"));
    fireEvent.click(screen.getByTestId("swap-transfer-held"));
    expect(screen.getByTestId("swap-transfer-qty")).toHaveValue("2");
    expect(screen.getByTestId("swap-transfer-qty")).not.toHaveAttribute(
      "readonly",
    );
    type("swap-transfer-name", "Cold 2");
    expect(screen.getByTestId("swap-summary")).toHaveTextContent(
      "swap.sum.created",
    );
    fireEvent.click(screen.getByTestId("swap-submit"));
    await waitFor(() => expect(writeMock).toHaveBeenCalled());
    expect(lastUrl()).toBe(`/budgets/b1/investments/${btc.id}/transfer`);
    expect(lastBody()).toMatchObject({
      move: { quantity: "2" },
      to: { kind: "new", name: "Cold 2" },
    });
  });

  // Round-3 gap 3c: tap what you hold to fill; the field stays editable.
  it("tapping what you hold fills the amount and stays editable", () => {
    mount(btc);
    fireEvent.click(screen.getByTestId("swap-tab-transfer"));
    expect(screen.queryByTestId("swap-transfer-all")).toBeNull();
    fireEvent.click(screen.getByTestId("swap-transfer-held"));
    expect(screen.getByTestId("swap-transfer-qty")).toHaveValue("2");
    type("swap-transfer-qty", "1");
    expect(screen.getByTestId("swap-transfer-qty")).toHaveValue("1");
  });

  it("footer stacks full-width and nothing truncates", () => {
    mount(btc);
    const footer = screen.getByTestId("swap-footer");
    expect(footer.className).toContain("flex-col");
    // Scrolls with the form — sticky hid the fields on a phone (UAT 13.1 test 8).
    expect(footer.className).not.toMatch(/sticky|fixed/);
    expect(
      document.querySelector('[data-testid="swap-sheet"] .truncate'),
    ).toBeNull();
  });

  // E2E 13.1-16: Radix closes on Escape in the CAPTURE phase, so the
  // combobox's stopPropagation came too late and the whole sheet closed.
  it("Escape in an open name list closes the list, not the sheet", async () => {
    const onOpenChange = vi.fn();
    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={qc}>
        <SwapSheet
          open
          onOpenChange={onOpenChange}
          budgetId="b1"
          budgetCurrency="PLN"
          holding={btc}
          holdings={[btc, btcCold]}
        />
      </QueryClientProvider>,
    );
    fireEvent.click(screen.getByTestId("swap-tab-transfer"));
    const input = screen.getByTestId("swap-transfer-name");
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "Vault" } });
    expect(input).toHaveAttribute("aria-expanded", "true");
    fireEvent.keyDown(input, { key: "Escape" });
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    expect(screen.getByTestId("swap-sheet")).toBeInTheDocument();
  });
});

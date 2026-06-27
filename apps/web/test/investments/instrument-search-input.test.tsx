/**
 * instrument-search-input.test.tsx — the search loader (UAT: visible loading).
 *
 * Typing a valid query (>= 2 chars) must show an inline spinner immediately —
 * during the debounce window, before the request resolves — so the user can see
 * a search is happening.
 */
import { describe, it, expect, vi } from "vitest";
import { useState } from "react";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { InstrumentSearchInput } from "../../src/components/budgeting/wallets-tab/instrument-search-input";
import { clientApiFetch } from "../../src/lib/budget-fetch";

vi.mock("next-intl", () => ({
  useTranslations: (_ns: string) => (key: string) => key,
}));
// A never-resolving fetch keeps the search "in flight" so the spinner persists.
vi.mock("../../src/lib/budget-fetch", () => ({
  clientApiFetch: vi.fn(() => new Promise(() => {})),
}));

function Harness() {
  const [name, setName] = useState("");
  return (
    <InstrumentSearchInput
      budgetId="b1"
      name={name}
      onNameChange={setName}
      onSelectInstrument={() => {}}
      onSelectCustom={() => {}}
    />
  );
}

describe("InstrumentSearchInput — loading feedback", () => {
  it("shows a spinner as soon as a valid query is typed", async () => {
    render(<Harness />);
    expect(screen.queryByTestId("instrument-search-spinner")).toBeNull();
    fireEvent.change(screen.getByTestId("holding-sheet-name"), {
      target: { value: "AA" },
    });
    expect(
      await screen.findByTestId("instrument-search-spinner"),
    ).toBeInTheDocument();
  });

  // 260626 bug: opening the EDIT sheet pre-fills the asset name, which used to
  // fire the debounced search on mount → the dropdown opened + the field
  // "activated" though the user changed nothing. A pre-filled name is the
  // already-selected instrument: stay passive until the user actually edits it.
  it("edit mode: a pre-filled name does NOT auto-search or activate on mount", () => {
    vi.mocked(clientApiFetch).mockClear();
    vi.useFakeTimers();
    try {
      render(
        <InstrumentSearchInput
          budgetId="b1"
          name="Bitcoin (BTC)"
          onNameChange={() => {}}
          onSelectInstrument={() => {}}
          onSelectCustom={() => {}}
        />,
      );
      // No pending spinner the instant the editor opens.
      expect(screen.queryByTestId("instrument-search-spinner")).toBeNull();
      // …and no search fires even after the debounce window elapses.
      act(() => {
        vi.advanceTimersByTime(1000);
      });
      expect(clientApiFetch).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("shows no spinner below the minimum query length", () => {
    render(<Harness />);
    fireEvent.change(screen.getByTestId("holding-sheet-name"), {
      target: { value: "A" },
    });
    expect(screen.queryByTestId("instrument-search-spinner")).toBeNull();
  });

  it("offers 'enter manually' when nothing is found (allowManualEntry)", async () => {
    vi.mocked(clientApiFetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ results: [] }),
    } as unknown as Response);
    const onSelectCustom = vi.fn();
    function H() {
      const [name, setName] = useState("");
      return (
        <InstrumentSearchInput
          budgetId="b1"
          name={name}
          onNameChange={setName}
          onSelectInstrument={() => {}}
          onSelectCustom={onSelectCustom}
          hideCustom
          allowManualEntry
        />
      );
    }
    render(<H />);
    fireEvent.change(screen.getByTestId("holding-sheet-name"), {
      target: { value: "NOSUCHTICKER" },
    });
    const opt = await screen.findByTestId("instrument-manual-entry-option");
    fireEvent.mouseDown(opt);
    expect(onSelectCustom).toHaveBeenCalledTimes(1);
  });

  it("distinguishes cross-listings by exchange + currency, not the (redundant) type", async () => {
    vi.mocked(clientApiFetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        results: [
          {
            id: "1",
            symbol: "SPCX",
            displayName: "Space Exploration Technologies",
            assetClass: "equities",
            quoteCurrency: "CHF",
            provider: "manual:XSWX",
          },
          {
            id: "2",
            symbol: "SPCX",
            displayName: "Space Exploration Technologies",
            assetClass: "equities",
            quoteCurrency: "USD",
            provider: "finnhub",
          },
        ],
      }),
    } as unknown as Response);
    render(<Harness />);
    fireEvent.change(screen.getByTestId("holding-sheet-name"), {
      target: { value: "SPCX" },
    });
    expect(await screen.findByText("XSWX · CHF")).toBeInTheDocument();
    expect(screen.getByText("US · USD")).toBeInTheDocument();
    // The asset-class/type is no longer rendered (the Type field already set it).
    expect(screen.queryByText("equities")).toBeNull();
  });

  it("omits the currency on the right for crypto suggestions (UAT)", async () => {
    vi.mocked(clientApiFetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        results: [
          {
            id: "btc",
            symbol: "BTC",
            displayName: "Bitcoin",
            assetClass: "crypto",
            quoteCurrency: "USD",
            provider: "coingecko",
          },
        ],
      }),
    } as unknown as Response);
    render(<Harness />);
    fireEvent.change(screen.getByTestId("holding-sheet-name"), {
      target: { value: "BTC" },
    });
    // The suggestion still shows the symbol + name…
    expect(await screen.findByText("Bitcoin")).toBeInTheDocument();
    expect(screen.getByText("BTC")).toBeInTheDocument();
    // …but NOT the quote currency (crypto has one global quote — it's noise).
    expect(screen.queryByText("USD")).toBeNull();
  });
});

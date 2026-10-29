/**
 * asset-name-combobox.test.tsx — the Add/Transfer name field (13.1 D-02, D-07,
 * UI-SPEC §3). Filters the type's assets (hidden ones marked Closed), offers
 * "Create" on an exact miss, keyboard-selectable, Esc closes only the list.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { AssetNameDto } from "../../src/hooks/use-asset-names";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, p?: Record<string, unknown>) =>
    p ? `${key}(${Object.values(p).join(",")})` : key,
}));
const names: AssetNameDto[] = [
  {
    id: "a",
    name: "BTC Ledger",
    archived: false,
    instrumentId: "i1",
    quantity: "1.5",
    valueCents: "9020000",
    valueCurrency: "PLN",
  },
  {
    id: "b",
    name: "BTC Binance",
    archived: true,
    instrumentId: "i1",
    quantity: "0",
    valueCents: "0",
    valueCurrency: "PLN",
  },
  {
    id: "c",
    name: "ETH",
    archived: false,
    instrumentId: "i2",
    quantity: "1",
    valueCents: null,
    valueCurrency: null,
  },
];
vi.mock("../../src/hooks/use-asset-names", () => ({
  useAssetNames: (_b: string, type: string | null) => ({
    data: type === "crypto" ? names : [],
  }),
}));

import { AssetNameCombobox } from "../../src/components/budgeting/wallets-tab/asset-name-combobox";

function mount(value = "") {
  const onChange = vi.fn();
  const onPickExisting = vi.fn();
  const onKeyDownOuter = vi.fn();
  const utils = render(
    <div onKeyDown={onKeyDownOuter}>
      <AssetNameCombobox
        budgetId="b1"
        uiType="crypto"
        value={value}
        onChange={onChange}
        onPickExisting={onPickExisting}
      />
    </div>,
  );
  return { onChange, onPickExisting, onKeyDownOuter, ...utils };
}

describe("Asset name combobox", () => {
  it("is an ARIA list combobox filtered by the typed text, hidden assets marked Closed", () => {
    mount("btc");
    const input = screen.getByRole("combobox");
    expect(input).toHaveAttribute("aria-autocomplete", "list");
    fireEvent.focus(input);
    const opts = screen.getAllByRole("option");
    expect(opts.map((o) => o.textContent)).toEqual([
      expect.stringContaining("BTC Ledger"),
      expect.stringContaining("BTC Binance"),
      "asset.name.create(btc)",
    ]);
    expect(opts[1]).toHaveTextContent("asset.name.closed");
  });

  it("an exact (trimmed, case-insensitive) match offers no Create row", () => {
    mount(" eth ");
    fireEvent.focus(screen.getByRole("combobox"));
    expect(screen.getAllByRole("option").map((o) => o.textContent)).toEqual([
      expect.stringContaining("ETH"),
    ]);
  });

  it("ArrowDown + Enter picks an existing asset — no join note (round 4)", () => {
    const { onPickExisting, onChange, rerender } = mount("btc");
    const input = screen.getByRole("combobox");
    fireEvent.focus(input);
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onPickExisting).toHaveBeenCalledWith(names[0]);
    expect(onChange).toHaveBeenCalledWith("BTC Ledger");
    rerender(
      <AssetNameCombobox
        budgetId="b1"
        uiType="crypto"
        value="BTC Ledger"
        onChange={onChange}
        onPickExisting={onPickExisting}
      />,
    );
    expect(screen.queryByTestId("asset-name-note")).toBeNull();
  });

  // Round-4 gap 4: each suggestion says what it is.
  it("suggestions show quantity, value and currency", () => {
    mount("");
    fireEvent.focus(screen.getByRole("combobox"));
    const meta = (name: string) =>
      screen
        .getAllByRole("option")
        .find((o) => o.querySelector("span")?.textContent === name)!
        .querySelector("[data-asset-meta]")?.textContent;
    // Round 4 (user): value only, no quantity; no price → 0.
    expect(meta("BTC Ledger")).toBe("90,200 PLN");
    expect(meta("BTC Binance")).toBe("0 PLN");
  });

  it("a priceless asset shows 0 in its currency", () => {
    names.push({
      id: "d",
      name: "BTC Paper",
      archived: false,
      instrumentId: null,
      quantity: "3",
      valueCents: null,
      valueCurrency: "USD",
    });
    mount("paper");
    fireEvent.focus(screen.getByRole("combobox"));
    expect(
      screen
        .getByTestId("asset-name-option-0")
        .querySelector("[data-asset-meta]")?.textContent,
    ).toBe("0 USD");
    names.pop();
  });

  // Round-4 gap 11: a pick-or-create field says both work.
  it("a pick-or-create field shows the hint; a pick-only one does not", () => {
    const { unmount } = mount("");
    expect(screen.getByTestId("asset-name-hint")).toHaveTextContent(
      "asset.name.pickOrCreate",
    );
    unmount();
    render(
      <AssetNameCombobox
        budgetId="b1"
        uiType="crypto"
        value=""
        onChange={() => {}}
        allowCreate={false}
      />,
    );
    expect(screen.queryByTestId("asset-name-hint")).toBeNull();
  });

  it("a hidden asset says it reopens", () => {
    mount("BTC Binance");
    expect(screen.getByTestId("asset-name-note")).toHaveTextContent(
      "asset.name.reopens",
    );
  });

  it("Esc closes the list without reaching the sheet", () => {
    const { onKeyDownOuter } = mount("btc");
    const input = screen.getByRole("combobox");
    fireEvent.focus(input);
    fireEvent.keyDown(input, { key: "Escape" });
    expect(screen.queryAllByRole("option")).toHaveLength(0);
    expect(onKeyDownOuter).not.toHaveBeenCalled();
  });

  it("shows at most 6 options", () => {
    mount("");
    fireEvent.focus(screen.getByRole("combobox"));
    expect(screen.getAllByRole("option").length).toBeLessThanOrEqual(6);
  });

  // UAT 13.1 test 7: name-first — the list is there before typing.
  it("focus with an empty name lists the type's assets", () => {
    mount("");
    fireEvent.focus(screen.getByRole("combobox"));
    expect(
      screen
        .getAllByRole("option")
        .map((o) => o.querySelector("span")?.textContent),
    ).toEqual(expect.arrayContaining(["BTC Ledger", "ETH"]));
    expect(screen.queryByTestId("asset-name-create")).toBeNull();
  });

  it("a new name ends the list with Add as new asset, kept by Enter", () => {
    const { onChange, onPickExisting } = mount("Foo");
    const input = screen.getByRole("combobox");
    fireEvent.focus(input);
    const create = screen.getByTestId("asset-name-create");
    expect(create).toHaveTextContent("asset.name.create(Foo)");
    const opts = screen.getAllByRole("option");
    expect(opts.at(-1)).toBe(create);
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(screen.queryAllByRole("option")).toHaveLength(0);
    expect(onChange).not.toHaveBeenCalled();
    expect(onPickExisting).not.toHaveBeenCalled();
  });

  it("the create row survives a full list", () => {
    mount("t"); // matches several names
    fireEvent.focus(screen.getByRole("combobox"));
    expect(screen.getByTestId("asset-name-create")).toBeInTheDocument();
    expect(screen.getAllByRole("option").length).toBeLessThanOrEqual(7);
  });
});

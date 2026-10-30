/**
 * investment-row.test.tsx — Vitest+RTL tests for InvestmentRow (Phase 9, INV-06/09).
 *
 * Coverage:
 * - Renders the 5 read-only fields (name, currency, value, P/L%, weight%)
 * - Total value rendered from valueCents
 * - P/L sign + color class (trading-up / trading-down)
 * - Cash holding (profitLossPct null) → "—"
 * - Delisted row → opacity-50 + "Delisted" chip
 * - NO inline <input> on the row (sheet-only editing, INV-06)
 */
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { InvestmentRow } from "../../src/components/budgeting/wallets-tab/investment-row";
import type { HoldingDto } from "../../src/hooks/use-investments";

// next-intl mock — relative key lookup with param substitution.
import { vi } from "vitest";

// happy-dom's default viewport reports desktop (min-width:640px matches), which
// would flip the row into desktop-click-to-edit mode for every test. Pin matchMedia
// to MOBILE by default so the expand-on-tap tests model a phone; the one desktop
// test overrides window.matchMedia locally.
function mockMatchMedia(matches: boolean) {
  window.matchMedia = ((q: string) => ({
    matches,
    media: q,
    onchange: null,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
    dispatchEvent() {
      return false;
    },
  })) as unknown as typeof window.matchMedia;
}
beforeEach(() => mockMatchMedia(false));
vi.mock("next-intl", () => ({
  useTranslations:
    (_ns: string) => (key: string, params?: Record<string, unknown>) => {
      const map: Record<string, string> = {
        "row.delisted": "Delisted",
        "row.editAria": "Edit {name}",
        "row.deleteAria": "Archive {name}",
        "sell.action": "Sell",
        "uitype.cash": "Cash",
        "row.qty": "qty: {qty}",
        "row.started": "started: {amount}",
        "row.share": "Share: {pct}",
        "typeGroup.stats.avgPrice": "avg price: {price}",
        "asset.swipe.newTxn": "New transaction",
        "typeGroup.unrealizedLabel": "unreal.: {value}",
        "typeGroup.realizedLabel": "real.: {value}",
        "asset.swipe.edit": "Edit",
        rowExpandAria: "Expand {name}",
        plAria: "{value} profit/loss",
      };
      let s = map[key] ?? key;
      if (params) {
        for (const [k, v] of Object.entries(params)) {
          s = s.replace(`{${k}}`, String(v));
        }
      }
      return s;
    },
  useLocale: () => "en",
}));

/** The mobile-expanded caption line (round 6: unrealized · realized). */
const captionEl = () =>
  document.querySelector<HTMLElement>("[data-asset-caption]")!;
const captionText = () => captionEl()?.textContent ?? "";

function holding(over: Partial<HoldingDto> = {}): HoldingDto {
  return {
    id: "h1",
    name: "AAPL",
    holdingType: "equities",
    uiType: "equity",
    group: null,
    instrumentId: "i1",
    metal: null,
    metalKind: null,
    unitOfMeasure: null,
    premiumPct: null,
    symbol: null,
    instrumentName: null,
    instrumentProvider: null,
    isCustom: false,
    isDelisted: false,
    quantity: "10",
    buyPriceCents: "30000",
    buyCurrency: "USD",
    currentPriceCents: "42000",
    currentPriceCurrency: "USD",
    valueCents: "420000",
    valueInBudgetCents: "420000",
    profitLossPct: 12.4,
    profitLossCents: "120000",
    weightPct: 18,
    sortOrder: 1,
    createdAt: "2026-06-21T00:00:00Z",
    ...over,
  };
}

describe("InvestmentRow", () => {
  it("renders name, currency, value, P/L% and weight%", () => {
    render(<InvestmentRow holding={holding()} />);
    // Name renders in both the mobile + desktop spans (one shown per breakpoint).
    expect(screen.getAllByText("AAPL").length).toBeGreaterThan(0);
    expect(screen.getAllByText("USD").length).toBeGreaterThan(0);
    expect(screen.getByText("4,200")).toBeInTheDocument();
    expect(screen.getByText("+12.4%")).toBeInTheDocument();
    expect(screen.getByText("18%")).toBeInTheDocument();
  });

  it("savings row: no qty, shows Started + %change when expanded", () => {
    render(
      <InvestmentRow
        holding={holding({
          name: "Emergency fund",
          holdingType: "savings",
          uiType: "savings",
          instrumentId: null,
          quantity: "1",
          buyPriceCents: "1000000", // started 10,000
          currentPriceCents: "1250000", // now 12,500
          valueCents: "1250000",
          valueInBudgetCents: "1250000",
          profitLossPct: 25,
          profitLossCents: "250000",
        })}
      />,
    );
    fireEvent.click(screen.getByLabelText("Expand Emergency fund"));
    // R6-6: "started" sits above the price, where qty @ avg would.
    const above = screen.getByTestId("investment-row-qtyavg");
    expect(above).toHaveTextContent("started: 10,000");
    expect(above.querySelector("[data-avg-icon]")).toBeNull();
    // %change renders in both the desktop cluster and the mobile-expanded line.
    expect(screen.getAllByText("+25.0%").length).toBeGreaterThan(0);
  });

  it("tracked stock → desktop 'TICKER (Name)', mobile shows the ticker", () => {
    render(
      <InvestmentRow
        holding={holding({
          name: "Apple Inc.",
          symbol: "AAPL",
          holdingType: "equities",
        })}
      />,
    );
    expect(screen.getByText("AAPL (Apple Inc.)")).toBeInTheDocument(); // desktop
    expect(screen.getByText("AAPL")).toBeInTheDocument(); // mobile collapsed
  });

  it("crypto → ticker parsed from the parenthetical name", () => {
    render(
      <InvestmentRow
        holding={holding({
          name: "Bitcoin (BTC)",
          symbol: "bitcoin",
          holdingType: "crypto",
        })}
      />,
    );
    expect(screen.getByText("BTC (Bitcoin)")).toBeInTheDocument(); // desktop
    expect(screen.getByText("BTC")).toBeInTheDocument(); // mobile
  });

  it("auto-fetch asset with a custom name → renders the custom name, not TICKER (Name)", () => {
    render(
      <InvestmentRow
        holding={holding({
          name: "My retirement BTC",
          instrumentName: "Bitcoin (BTC)",
          symbol: "bitcoin",
          holdingType: "crypto",
        })}
      />,
    );
    // Custom name shown in both breakpoints; the auto label is NOT rendered.
    expect(screen.getAllByText("My retirement BTC").length).toBeGreaterThan(0);
    expect(screen.queryByText("BTC (Bitcoin)")).toBeNull();
  });

  it("auto-fetch asset whose name matches the instrument → auto label (no custom)", () => {
    render(
      <InvestmentRow
        holding={holding({
          name: "Bitcoin (BTC)",
          instrumentName: "Bitcoin (BTC)",
          symbol: "bitcoin",
          holdingType: "crypto",
        })}
      />,
    );
    expect(screen.getByText("BTC (Bitcoin)")).toBeInTheDocument();
    expect(screen.queryByText("Bitcoin (BTC)")).toBeNull();
  });

  it("auto-priced holding: amount is NOT inline-editable (the feed owns the price)", () => {
    render(
      <InvestmentRow
        holding={holding({ instrumentProvider: "finnhub" })}
        onValueChange={vi.fn()}
      />,
    );
    const row = screen.getByTestId("holding-row-AAPL");
    expect(row.querySelectorAll("input")).toHaveLength(0);
    expect(screen.queryByTestId("holding-amount-h1")).toBeNull();
  });

  // user, 261023: a tap on an amount that can't be quick-edited did nothing
  // visible — shake it so the "no" is felt.
  it("auto-priced holding: tapping the amount shakes it", () => {
    render(
      <InvestmentRow
        holding={holding({ instrumentProvider: "finnhub" })}
        onValueChange={vi.fn()}
      />,
    );
    const amount = screen.getByTestId("holding-amount-readonly-h1");
    expect(amount.hasAttribute("data-shake")).toBe(false);
    fireEvent.click(amount);
    expect(amount.hasAttribute("data-shake")).toBe(true);
    // The tap is the amount's, not the row's: no expand to move it away.
    expect(screen.queryByText(/Share:/)).toBeNull();
    fireEvent.animationEnd(amount);
    expect(amount.hasAttribute("data-shake")).toBe(false);
  });

  // 260731: manual-value rows (cash / broker / savings — quantity is 1) edit
  // their value inline like every other wallet row: click → input → Enter/blur.
  describe("inline value edit (manual-value holdings)", () => {
    const cash = () =>
      holding({
        name: "Wallet",
        holdingType: "cash_fx",
        uiType: "cash",
        instrumentId: null,
        quantity: "1",
        buyPriceCents: "50000",
        currentPriceCents: "50000",
        valueCents: "50000",
        valueInBudgetCents: "50000",
        profitLossPct: null,
        profitLossCents: null,
      });

    it("click on the amount opens an input seeded with the current value", () => {
      render(<InvestmentRow holding={cash()} onValueChange={vi.fn()} />);
      fireEvent.click(screen.getByTestId("holding-amount-h1"));
      const input = screen
        .getByTestId("holding-row-Wallet")
        .querySelector("input");
      expect(input).not.toBeNull();
      expect((input as HTMLInputElement).value).toBe("500");
    });

    it("Enter saves the typed value", async () => {
      const onValueChange = vi.fn().mockResolvedValue(undefined);
      render(<InvestmentRow holding={cash()} onValueChange={onValueChange} />);
      fireEvent.click(screen.getByTestId("holding-amount-h1"));
      const input = screen
        .getByTestId("holding-row-Wallet")
        .querySelector("input") as HTMLInputElement;
      fireEvent.change(input, { target: { value: "725.50" } });
      fireEvent.keyDown(input, { key: "Enter" });
      await waitFor(() => expect(onValueChange).toHaveBeenCalledWith("725.50"));
    });

    it("blur saves the typed value too", async () => {
      const onValueChange = vi.fn().mockResolvedValue(undefined);
      render(<InvestmentRow holding={cash()} onValueChange={onValueChange} />);
      fireEvent.click(screen.getByTestId("holding-amount-h1"));
      const input = screen
        .getByTestId("holding-row-Wallet")
        .querySelector("input") as HTMLInputElement;
      fireEvent.change(input, { target: { value: "610" } });
      // Real blur: focus actually leaves the editor (the cell defers its commit
      // a frame and re-checks document.activeElement, so a synthetic blur event
      // with focus still inside would legitimately not commit).
      input.blur();
      await waitFor(() => expect(onValueChange).toHaveBeenCalledWith("610"));
    });

    it("does not open the edit sheet when the amount is clicked", () => {
      const onEdit = vi.fn();
      render(
        <InvestmentRow
          holding={cash()}
          onEdit={onEdit}
          onValueChange={vi.fn()}
        />,
      );
      fireEvent.click(screen.getByTestId("holding-amount-h1"));
      expect(onEdit).not.toHaveBeenCalled();
    });

    it("savings + broker rows are inline-editable as well", () => {
      const { rerender } = render(
        <InvestmentRow
          holding={holding({
            name: "Fund",
            holdingType: "savings",
            uiType: "savings",
            quantity: "1",
          })}
          onValueChange={vi.fn()}
        />,
      );
      expect(screen.getByTestId("holding-amount-h1")).toBeInTheDocument();
      rerender(
        <InvestmentRow
          holding={holding({
            name: "IBKR",
            holdingType: "broker",
            uiType: "broker",
            quantity: "1",
          })}
          onValueChange={vi.fn()}
        />,
      );
      expect(screen.getByTestId("holding-amount-h1")).toBeInTheDocument();
    });

    // user, 261023: a holding priced BY HAND (manual-priced instrument, or no
    // instrument at all) is edited by its total like any other manual row; the
    // section turns that total into a per-unit price.
    it("a hand-priced holding with quantity 3 is editable, seeded with its total", () => {
      render(
        <InvestmentRow
          holding={holding({
            name: "PKN",
            instrumentProvider: "manual:XWAR",
            quantity: "3.00000000",
            currentPriceCents: "10000",
            valueCents: "30000",
          })}
          onValueChange={vi.fn()}
        />,
      );
      fireEvent.click(screen.getByTestId("holding-amount-h1"));
      const input = screen
        .getByTestId("holding-row-PKN")
        .querySelector("input") as HTMLInputElement;
      expect(input.value).toBe("300");
    });

    it("a holding with no instrument (typed by hand) is editable too", () => {
      render(
        <InvestmentRow
          holding={holding({ instrumentId: null, instrumentProvider: null })}
          onValueChange={vi.fn()}
        />,
      );
      expect(screen.getByTestId("holding-amount-h1")).toBeInTheDocument();
    });

    it("a precious-metal holding keeps its spot-derived value", () => {
      render(
        <InvestmentRow
          holding={holding({
            holdingType: "commodity",
            uiType: "precious_metals",
            instrumentId: null,
            metal: "XAU",
          })}
          onValueChange={vi.fn()}
        />,
      );
      expect(screen.queryByTestId("holding-amount-h1")).toBeNull();
    });

    it("a deposit keeps its computed value (no inline editor)", () => {
      render(
        <InvestmentRow
          holding={holding({
            name: "Term deposit",
            holdingType: "deposit",
            uiType: "deposit",
            quantity: "1",
          })}
          onValueChange={vi.fn()}
        />,
      );
      expect(screen.queryByTestId("holding-amount-h1")).toBeNull();
    });

    it("stays read-only when no onValueChange handler is wired", () => {
      render(<InvestmentRow holding={cash()} />);
      expect(screen.queryByTestId("holding-amount-h1")).toBeNull();
    });
  });

  it("colors a gain with --trading-up", () => {
    render(<InvestmentRow holding={holding({ profitLossPct: 12.4 })} />);
    const pl = screen.getByText("+12.4%");
    expect(pl.className).toContain("text-[var(--trading-up)]");
  });

  it("colors a loss with --trading-down and a minus sign", () => {
    render(<InvestmentRow holding={holding({ profitLossPct: -8.2 })} />);
    const pl = screen.getByText("−8.2%");
    expect(pl.className).toContain("text-[var(--trading-down)]");
  });

  it("cash → renders its custom name (S1748), no P/L dash, share still shows", () => {
    render(
      <InvestmentRow
        holding={holding({
          name: "EUR Cash",
          holdingType: "cash_fx",
          profitLossPct: null,
        })}
      />,
    );
    expect(screen.getAllByText("EUR Cash").length).toBeGreaterThan(0);
    expect(screen.queryByText("—")).not.toBeInTheDocument();
    expect(screen.getByText("18%")).toBeInTheDocument(); // share / weight
  });

  // Round-3 gap 1: no P/L = two lines (name · value / caption · share), no dash.
  it("cash expanded → 2 lines: name with its value, then the share; no dash", () => {
    render(
      <InvestmentRow
        holding={holding({
          name: "USD Cash",
          holdingType: "cash_fx",
          profitLossPct: null,
          weightPct: 5,
          valueCents: "1000000",
          currentPriceCurrency: "USD",
        })}
      />,
    );
    fireEvent.click(screen.getByLabelText("Expand USD Cash"));
    expect(screen.queryByText("—")).toBeNull();
    expect(screen.getByText("Share: 5%")).toBeInTheDocument();
    const value = screen.getByTestId("asset-value-h1");
    expect(value).toHaveTextContent("USD10,000");
    // Round 4: value + share stack in the right column, centred on its own.
    const right = document.querySelector<HTMLElement>('[data-col="right"]')!;
    expect(right.contains(value)).toBe(true);
    expect(right.contains(screen.getByTestId("asset-share-h1"))).toBe(true);
  });

  it("a P/L asset's expanded value carries the same value testid", () => {
    render(<InvestmentRow holding={holding()} />);
    fireEvent.click(screen.getByLabelText("Expand AAPL"));
    expect(screen.getByTestId("asset-value-h1")).toBeInTheDocument();
  });

  // Round-3 gap 4: zero is a grey rise with plus signs; signs pick the icon.
  // Round-4 gaps 1 + 2: two centred columns; the type icon lives on the header.
  for (const [label, over] of [
    ["P/L", {}],
    ["cash", { name: "Pot", holdingType: "cash_fx", profitLossPct: null }],
  ] as const)
    it(`${label}: left and right are separate centred columns, collapsed and expanded`, () => {
      render(<InvestmentRow holding={holding(over as Partial<HoldingDto>)} />);
      const check = () => {
        const left =
          document.querySelectorAll<HTMLElement>('[data-col="left"]');
        const right =
          document.querySelectorAll<HTMLElement>('[data-col="right"]');
        expect(left).toHaveLength(1);
        expect(right).toHaveLength(1);
        for (const c of [left[0]!, right[0]!])
          expect(c.className).toMatch(
            /flex-col.*justify-center|justify-center.*flex-col/,
          );
      };
      check();
      fireEvent.click(screen.getByTestId("asset-row-h1"));
      check();
    });

  // Round-4 gap 14: a whole-number share drops the ".0".
  it("a share of 40% reads 40%, 12.5% keeps its decimal", () => {
    const { unmount } = render(
      <InvestmentRow holding={holding({ weightPct: 40 })} />,
    );
    fireEvent.click(screen.getByTestId("asset-row-h1"));
    expect(screen.getByTestId("asset-share-h1")).toHaveTextContent(
      "Share: 40%",
    );
    unmount();
    render(<InvestmentRow holding={holding({ weightPct: 12.5 })} />);
    fireEvent.click(screen.getByTestId("asset-row-h1"));
    expect(screen.getByTestId("asset-share-h1")).toHaveTextContent(
      "Share: 12.5%",
    );
  });

  // Round-6 gap 6 (user): the caption is the header's unrealized · realized.
  it("caption shows unrealized and realized like its type header", () => {
    render(
      <InvestmentRow
        holding={holding()}
        realized={{ realizedBudgetCents: "-4000", soldCostBudgetCents: "0" }}
      />,
    );
    fireEvent.click(screen.getByLabelText("Expand AAPL"));
    expect(captionText()).toMatch(/^unreal\.: .+real\.: −40$/);
    expect(captionText()).not.toMatch(/avg price|qty:/);
  });

  it("realized reads +0 when the asset has none", () => {
    render(<InvestmentRow holding={holding()} />);
    fireEvent.click(screen.getByLabelText("Expand AAPL"));
    expect(captionText()).toMatch(/real\.: \+0$/);
  });

  it("the asset row carries no type icon", () => {
    render(<InvestmentRow holding={holding()} />);
    expect(document.querySelector("[data-type-icon]")).toBeNull();
  });

  it("a zero P/L shows a grey up-arrow, +0.0% and +0", () => {
    render(
      <InvestmentRow
        holding={holding({ profitLossPct: 0, profitLossCents: "0" })}
      />,
    );
    expect(screen.getAllByText("+0.0%").length).toBeGreaterThan(0);
    expect(screen.getAllByText("+0").length).toBeGreaterThan(0);
    const icon = document.querySelector<SVGElement>('[data-pl-trend="flat"]')!;
    expect(icon.getAttribute("style")).toContain("var(--muted-strong)");
  });

  it("gains and losses carry an up / down trend", () => {
    const { unmount } = render(<InvestmentRow holding={holding()} />);
    expect(document.querySelector('[data-pl-trend="up"]')).not.toBeNull();
    unmount();
    render(
      <InvestmentRow
        holding={holding({ profitLossPct: -5, profitLossCents: "-100" })}
      />,
    );
    expect(document.querySelector('[data-pl-trend="down"]')).not.toBeNull();
  });

  it("mobile expand → 3 rows: name, P/L + money, and localized Share", () => {
    render(
      <InvestmentRow
        holding={holding({
          name: "Vintage car",
          symbol: null,
          profitLossPct: 50,
          profitLossCents: "1500000",
          weightPct: 13,
          valueCents: "4500000",
          currentPriceCurrency: "USD",
        })}
      />,
    );
    fireEvent.click(screen.getByLabelText("Expand Vintage car"));
    expect(screen.getByText("Share: 13%")).toBeInTheDocument();
    // P/L money amount comes straight from the server (+15,000.00), no currency.
    // Renders in both the desktop cluster and the mobile-expanded line (UAT #7).
    expect(screen.getAllByText("+15,000").length).toBeGreaterThan(0);
    expect(screen.getAllByText("+50.0%").length).toBeGreaterThan(0); // P/L%
  });

  // 260626 regression: the old plMoney back-derived cost as value/(1+pct/100);
  // at a near-total loss pct rounds to -100.0 → ÷0 → the amount collapsed to "-0".
  // The row now renders the server's profitLossCents, a real number.
  it("expanded P/L money uses server profitLossCents — a near-total loss is real, not '−0'", () => {
    render(
      <InvestmentRow
        holding={holding({
          name: "Silver coin",
          symbol: null,
          profitLossPct: -100,
          profitLossCents: "-3449500", // −34,495.00
          valueCents: "161",
          currentPriceCurrency: "EUR",
        })}
      />,
    );
    fireEvent.click(screen.getByLabelText("Expand Silver coin"));
    expect(screen.getAllByText("−34,495").length).toBeGreaterThan(0);
    // The P/L money line, not the unrealized · realized caption.
    expect(
      screen
        .queryAllByText("−0")
        .filter((el) => !el.closest("[data-asset-caption]")),
    ).toHaveLength(0);
  });

  // 260626: mobile-expanded third row shows Qty before Share for holdings with a
  // real quantity (tracked/metals); cash/broker (qty 1) omit it.
  it("mobile expand shows '<qty> @ <avg>' above the price for a metals holding", () => {
    render(
      <InvestmentRow
        holding={holding({
          name: "Bullion",
          symbol: null,
          uiType: "precious_metals",
          holdingType: "commodity",
          quantity: "0.98563280",
          weightPct: 100,
          valueCents: "161",
          profitLossPct: -100,
          profitLossCents: "-3449500",
        })}
      />,
    );
    fireEvent.click(screen.getByLabelText("Expand Bullion"));
    // trailing zeros trimmed for display.
    expect(screen.getByTestId("investment-row-qtyavg")).toHaveTextContent(
      /^0\.9856328 @ /,
    );
    expect(screen.getByText("Share: 100%")).toBeInTheDocument();
  });

  it("mobile expand omits Qty for a cash holding (qty is meaningless)", () => {
    render(
      <InvestmentRow
        holding={holding({
          name: "USD Cash",
          holdingType: "cash_fx",
          profitLossPct: null,
          weightPct: 5,
          valueCents: "1000000",
        })}
      />,
    );
    fireEvent.click(screen.getByLabelText("Expand USD Cash"));
    expect(captionText()).not.toMatch(/qty:/);
    expect(screen.getByText("Share: 5%")).toBeInTheDocument();
  });

  // UAT #7: desktop listing gains a quantity column + the P/L money amount, in
  // the order qty · P/L% · P/L amt · value · weight. (Desktop cells render with a
  // `hidden sm:*` class — present in the DOM under happy-dom regardless of CSS.)
  it("desktop: renders a quantity cell and the P/L money amount inline", () => {
    render(<InvestmentRow holding={holding()} />);
    // qty cell shows the holding quantity (testid keeps it unambiguous).
    expect(screen.getByTestId("holding-qty-AAPL")).toHaveTextContent("10");
    // P/L money from the server's profitLossCents (120000 → +1,200), no currency.
    expect(screen.getByText("+1,200")).toBeInTheDocument();
    expect(screen.getByText("+12.4%")).toBeInTheDocument();
  });

  it("desktop: the quantity cell is blank for a cash holding (qty meaningless)", () => {
    render(
      <InvestmentRow
        holding={holding({ name: "USD Cash", holdingType: "cash_fx" })}
      />,
    );
    expect(screen.getByTestId("holding-qty-USD Cash")).toHaveTextContent("");
  });

  // 13.1 D-27: the row toggles on every viewport; Edit is an explicit action.
  // Round-6 gap 4: Edit first, then + (new transaction).
  it("desktop: hover offers Edit then + (new transaction), no delete or sell", () => {
    const onSwap = vi.fn();
    const onEdit = vi.fn();
    render(
      <InvestmentRow holding={holding()} onSwap={onSwap} onEdit={onEdit} />,
    );
    const edit = screen.getByRole("button", { name: "Edit AAPL" });
    const plus = screen.getByRole("button", { name: "New transaction AAPL" });
    expect(
      edit.compareDocumentPosition(plus) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(plus.querySelector("svg.lucide-plus")).not.toBeNull();
    fireEvent.click(plus);
    fireEvent.click(edit);
    expect(onSwap).toHaveBeenCalledTimes(1);
    expect(onEdit).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("button", { name: "Archive AAPL" })).toBeNull();
  });

  it("desktop: clicking the row toggles it open and reports the toggle", () => {
    mockMatchMedia(true);
    const onToggle = vi.fn();
    const onEdit = vi.fn();
    render(
      <InvestmentRow holding={holding()} onToggle={onToggle} onEdit={onEdit} />,
    );
    const body = screen.getByTestId("asset-row-h1");
    expect(body).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(body);
    expect(body).toHaveAttribute("aria-expanded", "true");
    expect(onToggle).toHaveBeenCalledWith("h1", true);
    expect(onEdit).not.toHaveBeenCalled();
  });

  // UAT 13.1 test 4: stats one step smaller than the P/L line.
  it("expanded stats caption is smaller than the P/L line", () => {
    render(<InvestmentRow holding={holding()} />);
    fireEvent.click(screen.getByLabelText("Expand AAPL"));
    // The caption span carries the size and the header caption's font (round 4).
    expect(captionEl().className).toMatch(/(^|\s)num(\s|$)/);
    const stats = captionEl();
    expect(stats.style.fontSize).toBe("11px");
  });

  // UAT 13.1 test 4: open → square bottom, the ledger strip closes the card.
  it("an open asset has square bottom corners; a closed one is fully rounded", () => {
    const { unmount } = render(<InvestmentRow holding={holding()} open />);
    const card = screen.getByTestId("holding-row-AAPL");
    expect(card.className).toMatch(/rounded-b-none/);
    unmount();
    render(<InvestmentRow holding={holding()} open={false} />);
    expect(screen.getByTestId("holding-row-AAPL").className).not.toMatch(
      /rounded-b-none/,
    );
  });

  // Round-5 gap 3: closed from outside (its type collapsed) → the row closes too.
  it("a row closed from outside stops showing open", () => {
    const { rerender } = render(<InvestmentRow holding={holding()} open />);
    expect(screen.getByLabelText("Expand AAPL")).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    rerender(<InvestmentRow holding={holding()} open={false} />);
    expect(screen.getByLabelText("Expand AAPL")).toHaveAttribute(
      "aria-expanded",
      "false",
    );
  });

  // Round-2 gap 3: the share sits under the amount, not in the caption.
  it("tapped row shows its share under the amount, not in the caption", () => {
    render(<InvestmentRow holding={holding()} />);
    fireEvent.click(screen.getByLabelText("Expand AAPL"));
    const share = screen.getByTestId("asset-share-h1");
    expect(share).toHaveTextContent(/^Share: /);
    const caption = captionEl();
    expect(caption.contains(share)).toBe(false);
    expect(caption.textContent).not.toMatch(/Share/);
    // Same bottom line, pushed to the right column.
    // Round 4: share sits in the right column under the value.
    const right = document.querySelector<HTMLElement>('[data-col="right"]')!;
    expect(right.contains(share)).toBe(true);
    expect(right.contains(screen.getByTestId("asset-value-h1"))).toBe(true);
  });

  // Round-6 gap 6: "qty @ avg" with the avg icon, above the price.
  it("expanded row shows qty @ avg price above the price (D-29)", () => {
    render(<InvestmentRow holding={holding()} />);
    fireEvent.click(screen.getByLabelText("Expand AAPL"));
    const line = screen.getByTestId("investment-row-qtyavg");
    expect(line).toHaveTextContent(/^10 @ 300$/);
    expect(line.querySelector("[data-avg-icon]")).not.toBeNull();
    const price = screen.getByTestId("asset-value-h1");
    expect(
      line.compareDocumentPosition(price) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("expanded caption has no average price for an amount asset", () => {
    render(
      <InvestmentRow
        holding={holding({
          name: "Pot",
          holdingType: "cash_fx",
          uiType: "cash",
          quantity: "1",
          buyPriceCents: "100",
        })}
      />,
    );
    fireEvent.click(screen.getByLabelText("Expand Pot"));
    expect(screen.queryByTestId("investment-row-qtyavg")).toBeNull();
  });

  it("dims a delisted holding's content but keeps the drag handle full opacity", () => {
    render(
      <InvestmentRow
        holding={holding({ isDelisted: true })}
        dragHandle={<span data-testid="grip" />}
      />,
    );
    // The grip (handle slot) must NOT sit inside any opacity-50 element — a
    // parent's opacity caps its children, so the handle stays usable (09-07-PLAN).
    for (
      let el = screen.getByTestId("grip").parentElement;
      el;
      el = el.parentElement
    ) {
      expect(el.className ?? "").not.toContain("opacity-50");
    }
    // The row content (the tap-to-expand region) IS dimmed; chip still shows.
    expect(screen.getByLabelText("Expand AAPL").className).toContain(
      "opacity-50",
    );
    expect(screen.getByText("Delisted")).toBeInTheDocument();
  });
});

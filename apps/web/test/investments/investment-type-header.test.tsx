/**
 * investment-type-header.test.tsx — L1 type header (13.1 D-26, Phase 13 UAT
 * test 2): no indent before the name, value only by default, and the tap
 * sum-up mirrors the asset row — "% then amount", then a muted caption
 * "unrealized · realized · share" with sign-coloured figures.
 *
 * Round 2 (13.1-29): the header IS an asset-row card — same container, handle
 * without a slot of its own, chevron in the icon slot — and its tap reveal
 * mirrors the asset row: name shrinks, line 2 = P/L % + total, line 3 =
 * unrealized + realized amounts only, share under the value.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { InvestmentTypeHeader } from "../../src/components/budgeting/wallets-tab/investment-type-header";
import type { TypeGroupPL } from "../../src/lib/investment-type-groups";

vi.mock("next-intl", () => ({
  useTranslations:
    (_ns: string) => (key: string, params?: Record<string, unknown>) => {
      const map: Record<string, string> = {
        "uitype.stocks": "Stocks & ETFs",
        "uitype.crypto": "Crypto",
        "uitype.cash": "Cash",
        "typeGroup.summaryCaption": "unrealized {u} · realized {r} · share {s}",
        "group.headerAria": "{name}, {pct} of portfolio. {state}.",
        "group.expanded": "Expanded",
        "group.collapsed": "Collapsed",
        plAria: "{value} profit/loss",
        "row.share": "Share: {pct}",
      };
      let s = map[key] ?? key;
      if (params)
        for (const [k, v] of Object.entries(params))
          s = s.replace(`{${k}}`, String(v));
      return s;
    },
  useLocale: () => "en",
}));

const pl = (over: Partial<TypeGroupPL> = {}): TypeGroupPL => ({
  valueBudgetCents: 8_000_000,
  unrealizedCents: 2_280_000,
  realizedCents: 2_820_000,
  totalPLCents: 5_100_000,
  lifetimeCostCents: 9_500_000,
  pct: 53.68,
  ...over,
});

function renderHeader(
  over: Partial<Parameters<typeof InvestmentTypeHeader>[0]> = {},
) {
  const onToggle = vi.fn();
  render(
    <InvestmentTypeHeader
      uiType="stocks"
      budgetCurrency="PLN"
      pl={pl()}
      portfolioPct={60}
      expanded
      onToggle={onToggle}
      dragHandle={<span data-testid="type-handle" />}
      {...over}
    />,
  );
  return { onToggle };
}

describe("InvestmentTypeHeader", () => {
  it("shows the type name and value only by default", () => {
    renderHeader();
    expect(screen.getByText("Stocks & ETFs")).toBeInTheDocument();
    expect(screen.getByText("80,000")).toBeInTheDocument();
    expect(screen.queryByText("+51,000")).toBeNull();
    expect(screen.queryByText("+53.7%")).toBeNull();
    expect(screen.getByTestId("type-handle")).toBeInTheDocument();
  });

  it("has no realized sub-line and no indent before the name", () => {
    renderHeader();
    expect(screen.queryByTestId("investment-type-realized-stocks")).toBeNull();
    const name = screen.getByText("Stocks & ETFs");
    for (
      let el: HTMLElement | null = name;
      el && !el.dataset.testid;
      el = el.parentElement
    )
      expect(el.className).not.toMatch(/(^|\s)(pl|ml|ps|ms)-/);
  });

  it("collapsed header has the asset row's card geometry", () => {
    renderHeader();
    const root = screen.getByTestId("investment-group-stocks");
    for (const c of [
      "min-h-[56px]",
      "sm:min-h-[48px]",
      "items-center",
      "px-3",
      "gap-2",
    ])
      expect(root.classList.contains(c), c).toBe(true);
    expect(root.classList.contains("items-start")).toBe(false);
    expect(root.classList.contains("py-2")).toBe(false);
    expect(root.classList.contains("py-1.5")).toBe(false);
  });

  it("the drag handle has no slot of its own", () => {
    renderHeader();
    const slot = screen.getByTestId("type-handle").parentElement!;
    expect(slot.classList.contains("contents")).toBe(true);
    expect(
      screen.getByTestId("investment-group-stocks").innerHTML,
    ).not.toContain("min-w-11");
  });

  it("collapsed shows name and value, no sum-up and no share", () => {
    renderHeader();
    expect(
      screen.getByTestId("investment-type-value-stocks"),
    ).toHaveTextContent("PLN80,000");
    expect(screen.queryByTestId("investment-type-split-stocks")).toBeNull();
    expect(screen.queryByTestId("investment-type-share-stocks")).toBeNull();
  });

  it("tap mirrors the asset reveal: smaller name, P/L line, two bare amounts, share under the value", () => {
    renderHeader();
    fireEvent.click(screen.getByTestId("investment-group-toggle-stocks"));
    const root = screen.getByTestId("investment-group-stocks");
    expect(root.classList.contains("py-1.5")).toBe(true);
    expect(screen.getByText("Stocks & ETFs").className).toMatch(/text-num-sm/);
    const sum = screen.getByTestId("investment-type-split-stocks");
    const line = sum.querySelector("[data-pl-line]")!;
    expect(line.textContent).toMatch(/^\+53\.7%\s*\+51,000$/);
    const cap = sum.querySelector("[data-pl-caption]")!;
    const figs = cap.querySelectorAll("[data-signed]");
    expect(figs).toHaveLength(2);
    expect(figs[0]).toHaveTextContent("+22,800");
    expect(figs[0]).toHaveAttribute("aria-label", "typeGroup.unrealizedAria");
    expect(figs[1]).toHaveTextContent("+28,200");
    expect(figs[1]).toHaveAttribute("aria-label", "typeGroup.realizedAria");
    expect(figs[0]!.getAttribute("style")).toContain("var(--trading-up)");
    expect(cap.textContent).not.toMatch(/\p{L}/u);
    const share = screen.getByTestId("investment-type-share-stocks");
    expect(share).toHaveTextContent("Share: 60.0%");
    expect(cap.contains(share)).toBe(false);
    expect(
      screen.getByTestId("investment-type-value-stocks"),
    ).toHaveTextContent("80,000");
    fireEvent.click(screen.getByTestId("investment-group-toggle-stocks"));
    expect(screen.queryByTestId("investment-type-split-stocks")).toBeNull();
  });

  it("pct null renders a muted dash in the sum-up", () => {
    renderHeader({ pl: pl({ pct: null }) });
    fireEvent.click(screen.getByTestId("investment-group-toggle-stocks"));
    expect(screen.getByText("—").getAttribute("style")).toContain(
      "var(--muted-strong)",
    );
  });

  it("chevron calls onToggle and reflects expanded", () => {
    const { onToggle } = renderHeader({ expanded: false });
    const chev = screen.getByTestId("investment-group-chevron-stocks");
    expect(chev).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(chev);
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  // UAT 13.1 test 3: tap anywhere but the chevron / handle shows the sum-up.
  it("tapping the name or empty header space toggles the sum-up", () => {
    renderHeader();
    fireEvent.click(screen.getByText("Stocks & ETFs"));
    expect(screen.getByTestId("investment-type-split-stocks")).toBeTruthy();
    fireEvent.click(screen.getByTestId("investment-group-stocks"));
    expect(screen.queryByTestId("investment-type-split-stocks")).toBeNull();
  });

  it("the chevron and the drag handle never toggle the sum-up", () => {
    const { onToggle } = renderHeader();
    fireEvent.click(screen.getByTestId("investment-group-chevron-stocks"));
    fireEvent.click(screen.getByTestId("type-handle"));
    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId("investment-type-split-stocks")).toBeNull();
  });

  it("Enter on the header toggles the sum-up", () => {
    renderHeader();
    fireEvent.keyDown(screen.getByTestId("investment-group-toggle-stocks"), {
      key: "Enter",
    });
    expect(screen.getByTestId("investment-type-split-stocks")).toBeTruthy();
  });

  // UAT 13.1 test 3: cash has no profit by design.
  it("cash shows no P/L line and no caption when tapped", () => {
    renderHeader({
      uiType: "cash",
      pl: pl({
        pct: null,
        unrealizedCents: 0,
        realizedCents: 0,
        totalPLCents: 0,
      }),
    });
    fireEvent.click(screen.getByTestId("investment-group-toggle-cash"));
    expect(document.querySelector("[data-pl-line]")).toBeNull();
    expect(document.querySelector("[data-pl-caption]")).toBeNull();
    expect(screen.queryByTestId("investment-type-share-cash")).toBeNull();
  });
});

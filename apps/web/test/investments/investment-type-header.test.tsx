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
        "typeGroup.unrealizedLabel": "unrealized: {value}",
        "typeGroup.realizedLabel": "realized: {value}",
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
  // R6-7: closed shows the value only; open shows the stats.
  const el = (expanded: boolean) => (
    <InvestmentTypeHeader
      uiType="stocks"
      budgetCurrency="PLN"
      pl={pl()}
      portfolioPct={60}
      expanded={expanded}
      onToggle={onToggle}
      dragHandle={<span data-testid="type-handle" />}
      {...over}
    />
  );
  const { rerender } = render(el(over.expanded ?? false));
  return {
    onToggle,
    open: () => rerender(el(true)),
    close: () => rerender(el(false)),
  };
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

  // Round-4 gap 12 (cash too): tapped, the currency hugs the amount.
  it("a tapped cash header drops the amount's column width", () => {
    const h = renderHeader({
      uiType: "cash",
      maxAmountChars: 12,
      pl: pl({
        pct: null,
        unrealizedCents: 0,
        realizedCents: 0,
        totalPLCents: 0,
      }),
    });
    const amount = () =>
      screen.getByTestId("investment-type-value-cash")
        .lastElementChild as HTMLElement;
    expect(amount().style.minWidth).toBe("13ch");
    h.open();
    expect(amount().style.minWidth).toBe("");
  });

  // Round-4 gaps 1 + 2.
  it("left and right are separate centred columns, closed and tapped; the type icon sits on the header", () => {
    const h = renderHeader();
    expect(document.querySelector("[data-type-icon]")).not.toBeNull();
    const check = (tapped: boolean) => {
      const left = document.querySelector<HTMLElement>('[data-col="left"]')!;
      const right = document.querySelector<HTMLElement>('[data-col="right"]')!;
      for (const c of [left, right])
        expect(c.className).toMatch(
          /flex-col.*justify-center|justify-center.*flex-col/,
        );
      expect(
        right.contains(screen.getByTestId("investment-type-value-stocks")),
      ).toBe(true);
      if (tapped) {
        expect(
          right.contains(screen.getByTestId("investment-type-share-stocks")),
        ).toBe(true);
        expect(left.querySelector("[data-pl-line]")).not.toBeNull();
        expect(left.querySelector("[data-pl-caption]")).not.toBeNull();
      }
    };
    check(false);
    h.open();
    check(true);
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

  it("open mirrors the asset reveal: smaller name, P/L line, labelled amounts, share under the value", () => {
    const h = renderHeader();
    expect(screen.getByText("Stocks & ETFs").className).not.toMatch(
      /font-semibold|font-bold/,
    );
    h.open();
    const root = screen.getByTestId("investment-group-stocks");
    // Round 3: the reveal fits the card like the asset row (it grew 56 → 69.6).
    expect(root.className).not.toMatch(/(^|\s)py-/);
    const nameEl = screen.getByText("Stocks & ETFs");
    expect(nameEl.className).toMatch(/text-num-sm/);
    expect(nameEl.className).not.toMatch(/font-semibold|font-bold/);
    const sum = screen.getByTestId("investment-type-split-stocks");
    const line = sum.querySelector("[data-pl-line]")!;
    expect(line.textContent).toMatch(/^\+53\.7%\s*\+51,000$/);
    const cap = sum.querySelector("[data-pl-caption]")!;
    const figs = cap.querySelectorAll("[data-signed]");
    expect(figs).toHaveLength(2);
    expect(figs[0]).toHaveTextContent("+22,800");
    expect(figs[1]).toHaveTextContent("+28,200");
    expect(figs[0]!.getAttribute("style")).toContain("var(--trading-up)");
    expect(cap).toHaveTextContent(
      /^unrealized:\s*\+22,800\s*realized:\s*\+28,200$/,
    );
    expect(line.querySelector('[data-pl-trend="up"]')).not.toBeNull();
    // The revealed value is the asset row's small one, so the lines fit.
    expect(
      screen.getByTestId("investment-type-value-stocks").innerHTML,
    ).not.toContain("text-num-md");
    const share = screen.getByTestId("investment-type-share-stocks");
    expect(share).toHaveTextContent("Share: 60%");
    expect(cap.contains(share)).toBe(false);
    expect(
      screen.getByTestId("investment-type-value-stocks"),
    ).toHaveTextContent("80,000");
    h.close();
    expect(screen.queryByTestId("investment-type-split-stocks")).toBeNull();
  });

  it("pct null renders a muted dash in the sum-up", () => {
    renderHeader({ pl: pl({ pct: null }), expanded: true });
    expect(screen.getByText("—").getAttribute("style")).toContain(
      "var(--muted-strong)",
    );
  });

  // Round-6 gap 7 (user): no chevron — the whole header row is the toggle.
  it("has no chevron; the header row is the one toggle and reflects expanded", () => {
    const { onToggle } = renderHeader({ expanded: false });
    expect(
      document.querySelector('[data-testid^="investment-group-chevron-"]'),
    ).toBeNull();
    const header = screen.getByTestId("investment-group-stocks");
    expect(header).toHaveAttribute("role", "button");
    expect(header).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(screen.getByText("Stocks & ETFs"));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  // Round 6 (user): the chevron's space went with it.
  it("no empty slot is left where the chevron was", () => {
    renderHeader();
    const icon = document.querySelector("[data-type-icon]")!;
    const before = icon.previousElementSibling as HTMLElement | null;
    expect(before?.querySelector('[data-testid="type-handle"]')).not.toBeNull();
  });

  // Round 6 (user): the header's unrealized · realized are lighter too.
  it("the open header's P/L caption is dimmed like the asset row's", () => {
    renderHeader({ expanded: true });
    const cap = document.querySelector<HTMLElement>("[data-pl-caption]")!;
    expect(cap.style.opacity).toBe("0.7");
    // …and its share, like the asset row's.
    expect(
      screen.getByTestId("investment-type-share-stocks").style.opacity,
    ).toBe("0.7");
  });

  it("the drag handle never toggles", () => {
    const { onToggle } = renderHeader();
    fireEvent.click(screen.getByTestId("type-handle"));
    expect(onToggle).not.toHaveBeenCalled();
  });

  it("Enter and Space on the header toggle", () => {
    const { onToggle } = renderHeader();
    const header = screen.getByTestId("investment-group-stocks");
    fireEvent.keyDown(header, { key: "Enter" });
    fireEvent.keyDown(header, { key: " " });
    expect(onToggle).toHaveBeenCalledTimes(2);
  });

  it("stats follow open: none while closed, all while open", () => {
    const h = renderHeader();
    expect(document.querySelector("[data-pl-caption]")).toBeNull();
    h.open();
    expect(document.querySelector("[data-pl-caption]")).not.toBeNull();
    expect(document.querySelector("[data-pl-line]")).not.toBeNull();
  });

  // UAT 13.1 test 3: cash has no profit by design.
  it("cash shows its share but no P/L line and no caption when tapped", () => {
    renderHeader({
      uiType: "cash",
      expanded: true,
      pl: pl({
        pct: null,
        unrealizedCents: 0,
        realizedCents: 0,
        totalPLCents: 0,
      }),
    });
    expect(document.querySelector("[data-pl-line]")).toBeNull();
    expect(document.querySelector("[data-pl-caption]")).toBeNull();
    expect(screen.getByTestId("investment-type-share-cash")).toHaveTextContent(
      "Share: 60%",
    );
  });

  // Round-3 gap 4: zero is a grey rise with plus signs.
  it("a zero P/L shows a grey up-arrow, +0% and +0 (round 6: no .0)", () => {
    renderHeader({
      pl: pl({ pct: 0, totalPLCents: 0, unrealizedCents: 0, realizedCents: 0 }),
      expanded: true,
    });
    const line = document.querySelector("[data-pl-line]")!;
    expect(line.textContent).toMatch(/^\+0%\s*\+0$/);
    // Round 6 (user): the caption's zeros read "0", not "+0".
    expect(document.querySelector("[data-pl-caption]")!.textContent).toMatch(
      /^unrealized:\s*0\s*realized:\s*0$/,
    );
    const icon = line.querySelector<SVGElement>('[data-pl-trend="flat"]')!;
    expect(icon.getAttribute("style")).toContain("var(--muted-strong)");
  });
});

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

/** The phone copy of a text (desktop has its own copy, CSS-hidden here). */
const onPhone = (text: string) =>
  screen
    .getAllByText(text)
    .find((el) => !el.closest('[data-testid*="-desktop-"]'))!;

describe("InvestmentTypeHeader", () => {
  it("shows the type name and value only by default", () => {
    renderHeader();
    expect(onPhone("Stocks & ETFs")).toBeInTheDocument();
    expect(onPhone("80,000")).toBeInTheDocument();
    // Only the desktop columns (CSS-hidden on a phone) carry the P/L closed.
    const phone = (text: string) =>
      screen
        .queryAllByText(text)
        .filter((el) => !el.closest('[data-testid$="-desktop-stocks"]'));
    expect(phone("+51,000")).toEqual([]);
    expect(phone("+53.7%")).toEqual([]);
    expect(screen.getByTestId("type-handle")).toBeInTheDocument();
  });

  it("has no realized sub-line and no indent before the name", () => {
    renderHeader();
    expect(screen.queryByTestId("investment-type-realized-stocks")).toBeNull();
    const name = onPhone("Stocks & ETFs");
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
    // R6 (user): the phone column is the widest amount, no 1ch slack.
    expect(amount().style.getPropertyValue("--amt")).toBe("12ch");
    expect(amount().className).toContain("min-w-[var(--amt)]");
    h.open();
    expect(amount().className).not.toContain("min-w-");
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

  // R6 (user): desktop lays the header out like the asset row — its own
  // P/L %, P/L amount, value and share columns (share under the section's),
  // closed or open; the stacked compact block is the phone's.
  it("desktop: the asset row's columns, closed too, share in its own column", () => {
    renderHeader();
    const cls = (id: string) => screen.getByTestId(id).className;
    expect(cls("investment-type-pl-desktop-stocks")).toMatch(/w-20/);
    expect(
      screen.getByTestId("investment-type-pl-desktop-stocks").parentElement!
        .className,
    ).toMatch(/hidden .*sm:flex/);
    expect(
      screen.getByTestId("investment-type-pl-desktop-stocks"),
    ).toHaveTextContent("53.7%");
    expect(cls("investment-type-plamt-desktop-stocks")).toMatch(/w-24/);
    expect(cls("investment-type-share-desktop-stocks")).toMatch(
      /hidden .*w-16.*sm:block/,
    );
    expect(
      screen.getByTestId("investment-type-share-desktop-stocks"),
    ).toHaveTextContent("60%");
    // the wallets' 28px trailing slot keeps share under the section's share
    expect(
      document.querySelector("[data-desktop-actions-slot]")?.className,
    ).toMatch(/hidden w-7 .*sm:block/);
  });

  it("open: the phone's stacked P/L block and share are hidden on desktop", () => {
    const h = renderHeader();
    h.open();
    expect(
      screen.getByTestId("investment-type-split-stocks").className,
    ).toMatch(/sm:hidden/);
    expect(
      screen.getByTestId("investment-type-share-stocks").className,
    ).toMatch(/sm:hidden/);
  });

  // R6 (user): opening a group on desktop must not shrink it — the phone's
  // compact sizes (plain .text-num-sm, no sm: variant) stay off desktop.
  it("desktop keeps the name and amount size when the group opens", () => {
    const h = renderHeader();
    h.open();
    const desk = screen.getByTestId("investment-type-name-desktop-stocks");
    expect(desk.className).toMatch(/hidden .*sm:block/);
    expect(desk.className).toMatch(/text-body-md/);
    expect(desk.className).not.toMatch(/text-num-sm/);
    const amt = screen.getByTestId("investment-type-amount-desktop-stocks");
    expect(amt.className).toMatch(/hidden .*sm:inline/);
    expect(amt.className).toMatch(/text-num-md/);
  });

  // R6 (user): desktop shows unrealized · realized under the name.
  it("desktop shows the unrealized / realized caption, closed too", () => {
    renderHeader();
    const cap = screen.getByTestId("investment-type-caption-desktop-stocks");
    expect(cap.className).toMatch(/hidden .*sm:block/);
    expect(cap.textContent).toMatch(/unrealized: .*realized: /);
  });

  // R6 (user): the currency reads like the spending wallets' — its own cell.
  it("the currency picker sits in the wallets' currency cell", () => {
    renderHeader({ onCurrencyChange: () => {} });
    expect(
      screen.getByTestId("investment-type-currency-stocks").className,
    ).toMatch(/w-\[44px\].*sm:w-\[96px\].*md:w-\[224px\]/);
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
    expect(onPhone("Stocks & ETFs").className).not.toMatch(
      /font-semibold|font-bold/,
    );
    h.open();
    const root = screen.getByTestId("investment-group-stocks");
    // Round 3: the reveal fits the card like the asset row (it grew 56 → 69.6).
    expect(root.className).not.toMatch(/(^|\s)py-/);
    const nameEl = onPhone("Stocks & ETFs");
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
    const phoneAmount = [
      ...screen
        .getByTestId("investment-type-value-stocks")
        .querySelectorAll("span"),
    ].find(
      (el) =>
        /\bnum\b/.test(el.className) && el.className.includes("sm:hidden"),
    )!;
    expect(phoneAmount.className).toMatch(/text-num-sm/);
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
    expect(
      screen
        .getAllByText("—")
        .find((el) => !el.closest('[data-testid$="-desktop-stocks"]'))!
        .getAttribute("style"),
    ).toContain("var(--muted-strong)");
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
    fireEvent.click(onPhone("Stocks & ETFs"));
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
    // The phone's stats (desktop shows its own, open or closed).
    const h = renderHeader();
    expect(
      document.querySelector('[data-testid="investment-type-split-stocks"]'),
    ).toBeNull();
    h.open();
    const split = screen.getByTestId("investment-type-split-stocks");
    expect(split.querySelector("[data-pl-caption]")).not.toBeNull();
    expect(split.querySelector("[data-pl-line]")).not.toBeNull();
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

// R6 (user): a group says how long ago its newest asset changed, under its
// amount like the assets do.
describe("InvestmentTypeHeader — updated ago", () => {
  it("shows the newest change under the group's amount", () => {
    renderHeader({
      updated: {
        at: new Date(Date.now() - 5 * 60_000).toISOString(),
        kind: "value",
      },
    });
    const ago = screen.getByTestId("updated-ago");
    expect(
      ago.closest('[data-testid="investment-type-value-stocks"]'),
    ).not.toBeNull();
  });

  it("no time, no line", () => {
    renderHeader();
    expect(screen.queryByTestId("updated-ago")).toBeNull();
  });
});

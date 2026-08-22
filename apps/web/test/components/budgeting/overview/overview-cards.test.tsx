/**
 * overview-cards.test.tsx — Vitest + RTL coverage for the five Overview cards
 * (Phase 11, 11-08). Mocks the cards hook with a fixture DTO and asserts: the five
 * cards render, amounts are formatted in default_currency, the capitalization sub-
 * line shows investments, cushion real-months shows one decimal, and overspent
 * lists the top categories.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("next-intl", () => {
  const translate = (key: string, vars?: Record<string, unknown>) => {
    const dict: Record<string, string> = {
      "cards.availableToSpend": "Available to spend",
      "cards.spentThisMonth": "Spent",
      "cards.leftToSpend": "Upcoming",
      "cards.freeToMove": "Free to move",
      "cards.lowestPoint": "Lowest point: {date}",
      "cards.spendNeutral": "No upcoming income",
      "cards.retirementRunway": "If you retire now",
      "cards.retirementSub": "at your normal planned spending",
      "cards.flipToRetirement": "Capitalization",
      "cards.years": "{count} years",
      "cards.months": "{count} months",
      "cards.and": "and",
      "cards.retirementInflation": "incl. {pct}% annual inflation",
      "cards.unitY": "y",
      "cards.unitM": "m",
      "cards.unitD": "d",
      "cards.overspentMotivation": "Good job — keep it up!",
      "cards.reservesNeeded": "Needed",
      "cards.reservesOkNote": "All reserves are in place",
      "cards.reservesShortNote": "Not enough. {amount} is missing",
      "cards.reservesSurplusNote": "Too much. {amount} extra",
      "cards.cushionSaved": "Saved",
      "cards.cushionNeeded": "Needed",
      "cards.capitalization": "Capitalization",
      "cards.capitalizationSub": "incl. investments {amount}",
      "cards.overspent": "Overspent this month",
      "cards.overspentCount": "{count} categories",
      "cards.onBudget": "On budget",
      "cards.cushion": "Cushion",
      "cards.cushionMonths": "{months} mo",
      "cards.cushionOff": "Cushion off",
      "cards.availableReserves": "Available reserves",
      "cards.realMonths": "real months",
      "cards.sinceYesterday": "since yesterday",
      "empty.planned": "No activity in this range.",
    };
    const tpl = dict[key] ?? key;
    if (!vars) return tpl;
    // Skip function values (t.rich chunk callbacks) — the test templates use plain
    // {amount} tokens, so only the string vars interpolate.
    return Object.entries(vars).reduce(
      (s, [k, v]) =>
        typeof v === "function"
          ? s
          : s.replace(new RegExp(`{${k}}`, "g"), String(v)),
      tpl,
    );
  };
  // t is callable AND exposes t.rich (next-intl) — both interpolate the same way.
  const t = Object.assign(translate, { rich: translate });
  return {
    useLocale: () => "en",
    useTranslations: () => t,
  };
});

// These tests verify amount FORMATTING, so every render passes
// amountPrivacyEnabled={false} (amounts render as real values, not SlotAmounts).

const mockUse = vi.fn();
vi.mock("@/hooks/use-overview-cards", () => ({
  useOverviewCards: () => mockUse(),
}));

const mockWealth = vi.fn(() => ({ data: undefined }));
vi.mock("@/hooks/use-overview-wealth", () => ({
  useOverviewWealth: () => mockWealth(),
}));

// Projection drives the available-to-spend dot + surplus/deficit. Default: green,
// $400 surplus (matches the old "Upcoming $400" figure so amount assertions hold).
const mockProjection = vi.fn(() => ({
  data: {
    spend_health: { good: true, surplus_deficit_cents: "40000" },
    safe_to_withdraw: { cents: "40000", thinnest_date: "2026-08-15" },
  },
}));
vi.mock("@/hooks/use-projection", () => ({
  useProjection: () => mockProjection(),
}));

import { OverviewCards } from "@/components/budgeting/overview/overview-cards";

const DTO = {
  default_currency: "USD",
  available_to_spend_cents: "124000", // $1,240.00
  spendings: {
    spent_cents: "80000", // $800
    left_cents: "40000", // $400
    wallet_cents: "124000", // $1,240 — shown as the big number
    good: true,
  },
  capitalization_cents: "4218000", // $42,180.00
  investment_value_cents: "1240000", // $12,400.00
  retirement_months: 30 as number | null, // → "2 years and 6 months"
  retirement_inflation_pct: 4.5,
  available_reserves_cents: "350000", // $3,500.00
  reserves: {
    required_cents: "300000", // $3,000 needed
    wallet_cents: "350000",
    status: "ok" as "ok" | "short" | "surplus",
  },
  cushion: {
    enabled: true,
    real_months: 3.0,
    total_cents: "900000",
    required_cents: "1800000", // $18,000 needed
    covered: true,
  },
  overspent: {
    count: 2,
    currency: "USD",
    total_cents: "8000", // $80 total overspend
    top: [
      { category_id: "a", name: "Food", over_amount_cents: "5000" },
      { category_id: "b", name: "Transport", over_amount_cents: "3000" },
    ],
  },
};

describe("OverviewCards", () => {
  // Default: upcoming income exists, +$400 surplus, green dot. Tests that need a
  // different projection set a sticky mockReturnValue (deterministic across renders).
  beforeEach(() => {
    mockProjection.mockReturnValue({
      data: {
        spend_health: { good: true, surplus_deficit_cents: "40000" },
        safe_to_withdraw: { cents: "40000", thinnest_date: "2026-08-15" },
      },
    });
  });

  it("renders the five cards with default_currency amounts", () => {
    mockUse.mockReturnValue({ data: DTO, isError: false, isPending: false });
    render(<OverviewCards budgetId="b1" amountPrivacyEnabled={false} />);

    for (const id of [
      "overview-card-capitalization",
      "overview-card-available-to-spend",
      "overview-card-available-reserves",
      "overview-card-overspent",
      "overview-card-cushion",
    ]) {
      expect(screen.getByTestId(id)).toBeTruthy();
    }
    // Compact format — whole amounts drop the .00 (parity with spendings).
    expect(screen.getByText("$42,180")).toBeTruthy(); // capitalization hero
    expect(screen.getByText("$1,240")).toBeTruthy(); // wallet cash (have)
    expect(screen.getByText("$800")).toBeTruthy(); // spent this month
    expect(screen.getByText("$400")).toBeTruthy(); // projected surplus (was "Upcoming")
    expect(screen.getByText("$3,500")).toBeTruthy(); // available reserves
    // 260804: a card that is in order says so instead of restating the target.
    expect(screen.getByText("All reserves are in place")).toBeTruthy();
    expect(screen.getByText("incl. investments $12,400")).toBeTruthy();
  });

  it("shows the spend good/bad indicator from the projection (item 1)", () => {
    mockUse.mockReturnValue({ data: DTO, isError: false, isPending: false });
    // Default projection mock is good → green check.
    const { unmount } = render(
      <OverviewCards budgetId="b1" amountPrivacyEnabled={false} />,
    );
    expect(screen.getByTestId("spend-good")).toBeTruthy();
    unmount();

    // A projection shortfall (good:false) flips the dot to red.
    mockProjection.mockReturnValue({
      data: {
        spend_health: { good: false, surplus_deficit_cents: "-5000" },
        safe_to_withdraw: { cents: "-5000", thinnest_date: "2026-09-02" },
      },
    });
    render(<OverviewCards budgetId="b1" amountPrivacyEnabled={false} />);
    expect(screen.getByTestId("spend-bad")).toBeTruthy();
  });

  it("shows NO dot at all + the old 'upcoming' figure when there's no income", () => {
    mockUse.mockReturnValue({ data: DTO, isError: false, isPending: false });
    mockProjection.mockReturnValue({
      data: {
        spend_health: { good: null, surplus_deficit_cents: null },
        safe_to_withdraw: { cents: "40000", thinnest_date: "2026-08-15" },
      },
    });
    render(<OverviewCards budgetId="b1" amountPrivacyEnabled={false} />);
    // A grey circle said "there is a verdict here, and it is neutral" — there
    // is no verdict at all without income to forecast against, so the slot is
    // simply empty (user, 260811).
    expect(screen.queryByTestId("spend-neutral")).toBeNull();
    expect(screen.queryByTestId("spend-good")).toBeNull();
    expect(screen.queryByTestId("spend-bad")).toBeNull();
    // The withdrawable figure needs no income to mean something — it is the
    // lowest point of the forecast, so the row stays even with no pay-day in
    // sight (user, 260812). Only the verdict dot is withheld.
    expect(screen.getByTestId("spend-surplus-deficit")).toBeTruthy();
  });

  // "Surplus" is what you can take OUT of the budget today and still cover
  // every dip the forecast knows about — the lowest point of a worst-case run,
  // not the cash on the day before payday (user, 260812).
  it("takes the surplus from safe_to_withdraw, not from spend_health", () => {
    mockUse.mockReturnValue({ data: DTO, isError: false, isPending: false });
    mockProjection.mockReturnValue({
      data: {
        spend_health: { good: true, surplus_deficit_cents: "40000" },
        safe_to_withdraw: { cents: "1500", thinnest_date: "2026-08-15" },
      },
    });
    render(<OverviewCards budgetId="b1" amountPrivacyEnabled={false} />);
    const row = screen.getByTestId("spend-surplus-deficit").textContent!;
    expect(row).toContain("$15");
    expect(row).not.toContain("$400");
  });

  // The card stays a number; the day it is measured at lives in the row's
  // hover text, where it answers "why that size?" without spending a line of
  // a half-width card on it (user, 260812).
  it("keeps the thinnest day out of the card, in the hover text", () => {
    mockUse.mockReturnValue({ data: DTO, isError: false, isPending: false });
    render(<OverviewCards budgetId="b1" amountPrivacyEnabled={false} />);
    expect(screen.queryByTestId("spend-thinnest-date")).toBeNull();
    const row = screen.getByTestId("spend-surplus-row");
    expect(row.getAttribute("title")).toContain("15");
  });

  // ONE label, and it names what the figure is FOR: money that could leave the
  // budget today — to invest, to move elsewhere — with every dip in the forecast
  // still covered. "Surplus / Deficit" split one measurement into two things and
  // called a negative one a shortfall of MONEY, which it never was: the forecast
  // can be 100 green days and the figure still negative, because it answers
  // "what can I take out?", not "will I run out?" (user, 260822).
  it("names the row Free to move, whichever side of zero it falls", () => {
    mockUse.mockReturnValue({ data: DTO, isError: false, isPending: false });
    const { unmount } = render(
      <OverviewCards budgetId="b1" amountPrivacyEnabled={false} />,
    );
    expect(screen.getByText("Free to move")).toBeTruthy();
    expect(screen.getByTestId("spend-surplus-deficit").textContent).toContain(
      "$400",
    );
    unmount();

    mockProjection.mockReturnValue({
      data: {
        spend_health: { good: false, surplus_deficit_cents: "-25000" },
        safe_to_withdraw: { cents: "-25000", thinnest_date: "2026-09-02" },
      },
    });
    render(<OverviewCards budgetId="b1" amountPrivacyEnabled={false} />);
    expect(screen.getByText("Free to move")).toBeTruthy();
  });

  // You cannot move minus 250 dollars. Below zero the honest answer to "how much
  // is free" is nothing, so the row says nothing — the magnitude of the
  // shortfall is a different question and this row does not ask it.
  it("shows nothing free rather than a negative amount", () => {
    mockUse.mockReturnValue({ data: DTO, isError: false, isPending: false });
    mockProjection.mockReturnValue({
      data: {
        spend_health: { good: false, surplus_deficit_cents: "-25000" },
        safe_to_withdraw: { cents: "-25000", thinnest_date: "2026-09-02" },
      },
    });
    render(<OverviewCards budgetId="b1" amountPrivacyEnabled={false} />);
    const value = screen.getByTestId("spend-surplus-deficit").textContent!;
    expect(value).toContain("$0");
    expect(value).not.toContain("250");
  });

  it("colors the value: green when there IS something to move, white otherwise", () => {
    mockUse.mockReturnValue({ data: DTO, isError: false, isPending: false });
    const cases: [string, string][] = [
      ["40000", "var(--trading-up)"], // something to move → green
      ["0", "var(--body-on-dark)"], // nothing to move → white
      // …and a negative reads as nothing to move, so it is white too. Red said
      // money was missing; none is (user, 260822).
      ["-25000", "var(--body-on-dark)"],
    ];
    for (const [cents, color] of cases) {
      mockProjection.mockReturnValue({
        data: { spend_health: { good: true, surplus_deficit_cents: cents } },
      });
      const { unmount } = render(
        <OverviewCards budgetId="b1" amountPrivacyEnabled={false} />,
      );
      expect(screen.getByTestId("spend-surplus-deficit").style.color).toBe(
        color,
      );
      unmount();
    }
  });

  it("shows the reserves ok/short/surplus indicator (item 3)", () => {
    for (const [status, testid] of [
      ["ok", "reserves-ok"],
      ["short", "reserves-short"],
      ["surplus", "reserves-surplus"],
    ] as const) {
      mockUse.mockReturnValue({
        data: { ...DTO, reserves: { ...DTO.reserves, status } },
        isError: false,
        isPending: false,
      });
      const { unmount } = render(
        <OverviewCards budgetId="b1" amountPrivacyEnabled={false} />,
      );
      expect(screen.getByTestId(testid)).toBeTruthy();
      unmount();
    }
  });

  // Nothing to do = say so. Repeating the required amount under a green tick
  // read like a bill still to pay (user, 260804).
  it("reserves ok note reassures instead of restating the required amount", () => {
    mockUse.mockReturnValue({
      data: {
        ...DTO,
        available_reserves_cents: "2893364",
        reserves: {
          ...DTO.reserves,
          status: "ok",
          required_cents: "2893364",
        },
      },
      isError: false,
      isPending: false,
    });
    render(<OverviewCards budgetId="b1" amountPrivacyEnabled={false} />);
    const card = screen.getByTestId("overview-card-available-reserves");
    expect(card.textContent).toContain("All reserves are in place");
    expect(card.textContent).not.toContain("Needed");
  });

  it("reserves short note shows the MISSING amount with cents", () => {
    mockUse.mockReturnValue({
      data: {
        ...DTO,
        available_reserves_cents: "300000", // $3,000.00
        reserves: {
          ...DTO.reserves,
          status: "short",
          required_cents: "310050",
        }, // $3,100.50
      },
      isError: false,
      isPending: false,
    });
    render(<OverviewCards budgetId="b1" amountPrivacyEnabled={false} />);
    // missing = 310050 - 300000 = 10050 cents → $100.50
    expect(screen.getByText("Not enough. $100.50 is missing")).toBeTruthy();
  });

  it("reserves surplus note shows the EXTRA amount with cents", () => {
    mockUse.mockReturnValue({
      data: {
        ...DTO,
        available_reserves_cents: "310050", // $3,100.50
        reserves: {
          ...DTO.reserves,
          status: "surplus",
          required_cents: "300000",
        }, // $3,000.00
      },
      isError: false,
      isPending: false,
    });
    render(<OverviewCards budgetId="b1" amountPrivacyEnabled={false} />);
    // extra = 310050 - 300000 = 10050 cents → $100.50
    expect(screen.getByText("Too much. $100.50 extra")).toBeTruthy();
  });

  it("shows cushion runway dropping zero components (years/months/days)", () => {
    const cases: [number, string][] = [
      [3.0, "3m"], // whole months, no "0d"
      [6.0, "6m"],
      [5 + 3 / 30.44, "5m 3d"], // 5 months 3 days
      [15, "1y 3m"], // 1 year 3 months
      [0, "0d"], // never empty
    ];
    for (const [real_months, expected] of cases) {
      mockUse.mockReturnValue({
        data: { ...DTO, cushion: { ...DTO.cushion, real_months } },
        isError: false,
        isPending: false,
      });
      const { unmount } = render(
        <OverviewCards budgetId="b1" amountPrivacyEnabled={false} />,
      );
      expect(screen.getByText(expected)).toBeTruthy();
      unmount();
    }
  });

  it("shows ∞ runway when nothing is required but cushion is saved (item 7)", () => {
    // required 0 (no per-category cushion target) but money IS saved → the runway
    // is unbounded, NOT the misleading "0d".
    mockUse.mockReturnValue({
      data: {
        ...DTO,
        cushion: {
          enabled: true,
          real_months: 0,
          required_cents: "0",
          total_cents: "13048483",
          covered: true,
        },
      },
      isError: false,
      isPending: false,
    });
    render(<OverviewCards budgetId="b1" amountPrivacyEnabled={false} />);
    expect(screen.getByTestId("cushion-unlimited")).toBeTruthy();
    expect(screen.getByText("∞")).toBeTruthy();
    expect(screen.queryByText("0d")).toBeNull();
  });

  it("flags whether the cushion covers the required limit", () => {
    mockUse.mockReturnValue({ data: DTO, isError: false, isPending: false });
    const { unmount } = render(
      <OverviewCards budgetId="b1" amountPrivacyEnabled={false} />,
    );
    expect(screen.getByTestId("cushion-covered")).toBeTruthy();
    unmount();

    mockUse.mockReturnValue({
      data: { ...DTO, cushion: { ...DTO.cushion, covered: false } },
      isError: false,
      isPending: false,
    });
    render(<OverviewCards budgetId="b1" amountPrivacyEnabled={false} />);
    expect(screen.getByTestId("cushion-short")).toBeTruthy();
  });

  it("hides 'incl. investments' when the Investments feature is off", () => {
    mockUse.mockReturnValue({ data: DTO, isError: false, isPending: false });
    render(
      <OverviewCards
        budgetId="b1"
        amountPrivacyEnabled={false}
        investmentsEnabled={false}
      />,
    );
    expect(screen.queryByText(/incl\. investments/)).toBeNull();
  });

  it("hides the cushion card entirely when cushion is disabled", () => {
    mockUse.mockReturnValue({
      data: { ...DTO, cushion: { ...DTO.cushion, enabled: false } },
      isError: false,
      isPending: false,
    });
    render(<OverviewCards budgetId="b1" amountPrivacyEnabled={false} />);
    expect(screen.queryByTestId("overview-card-cushion")).toBeNull();
  });

  it("hides the available-reserves card when reserves are disabled", () => {
    mockUse.mockReturnValue({ data: DTO, isError: false, isPending: false });
    render(
      <OverviewCards
        budgetId="b1"
        amountPrivacyEnabled={false}
        reservesEnabled={false}
      />,
    );
    expect(screen.queryByTestId("overview-card-available-reserves")).toBeNull();
  });

  it("shows the total overspend + category list when over (item 5)", () => {
    mockUse.mockReturnValue({ data: DTO, isError: false, isPending: false });
    render(<OverviewCards budgetId="b1" amountPrivacyEnabled={false} />);
    expect(screen.getByText("$80")).toBeTruthy(); // total overspend
    expect(screen.getByText("Food · Transport")).toBeTruthy();
    expect(screen.getByTestId("overspent-bad")).toBeTruthy();
  });

  it("shows the capitalization P/L since yesterday's close (viewer-tz midnight)", () => {
    mockUse.mockReturnValue({ data: DTO, isError: false, isPending: false });
    // tz defaults to UTC (no provider) → base is the bucket at/before today 00:00Z.
    const today = new Date().toISOString().slice(0, 10);
    const yday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
    mockWealth.mockReturnValueOnce({
      data: {
        series: [
          { label: `${yday}T23`, value_cents: "7575000" }, // yesterday's close (base)
          { label: `${today}T05`, value_cents: "8325000" }, // now
        ],
      },
    });
    render(<OverviewCards budgetId="b1" amountPrivacyEnabled={false} />);
    // Δ = 8,325,000 − 7,575,000 = 750,000¢ (+9.9%). Stacks: percent + amount.
    expect(screen.getByText(/\+9\.9%/)).toBeTruthy();
    expect(screen.getByText("$7,500")).toBeTruthy();
    expect(screen.getByText("since yesterday")).toBeTruthy();
  });

  it("shows a zero day P/L as flat — no green, no arrow, no + sign", () => {
    mockUse.mockReturnValue({ data: DTO, isError: false, isPending: false });
    const today = new Date().toISOString().slice(0, 10);
    const yday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
    // Carry-forward filled series with no movement since midnight — the common
    // case when no wealth snapshot has landed yet today. Δ is exactly 0.
    mockWealth.mockReturnValueOnce({
      data: {
        series: [
          { label: `${yday}T23`, value_cents: "7575000" },
          { label: `${today}T05`, value_cents: "7575000" },
        ],
      },
    });
    render(<OverviewCards budgetId="b1" amountPrivacyEnabled={false} />);

    const pct = screen.getByText("0.0%"); // NOT "+0.0%" — zero is not a gain
    const stack = pct.closest("div")!;
    expect(stack.className).toContain("--muted-foreground");
    expect(stack.className).not.toContain("--trading-up");
    expect(stack.querySelector("svg")).toBeNull(); // no trend arrow either
  });

  it("shows a sub-unit day P/L precisely, and still as a gain", () => {
    mockUse.mockReturnValue({ data: DTO, isError: false, isPending: false });
    const today = new Date().toISOString().slice(0, 10);
    const yday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
    // Mój Budżet, 260819: +17 cents on 239,290 = +0.0071%. A real gain that one
    // decimal and whole-unit money both hid — the figures gain precision, the
    // colour stays.
    mockWealth.mockReturnValueOnce({
      data: {
        series: [
          { label: `${yday}T23`, value_cents: "239290" },
          { label: `${today}T05`, value_cents: "239307" },
        ],
      },
    });
    render(<OverviewCards budgetId="b1" amountPrivacyEnabled={false} />);

    const pct = screen.getByText("+0.007%");
    const stack = pct.closest("div")!;
    expect(stack.className).toContain("--trading-up");
    expect(stack.querySelector("svg")).toBeTruthy(); // up arrow
    expect(screen.getByText("$0.17")).toBeTruthy(); // cents kept under 100
  });

  it("hides the day P/L amount under privacy, like every other figure", () => {
    // The amount is money: with privacy ON it must scramble like the rest of the
    // card. It briefly rendered as plain text when the formatter changed (260819).
    mockUse.mockReturnValue({ data: DTO, isError: false, isPending: false });
    const today = new Date().toISOString().slice(0, 10);
    const yday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
    mockWealth.mockReturnValueOnce({
      data: {
        series: [
          { label: `${yday}T23`, value_cents: "239290" },
          { label: `${today}T05`, value_cents: "239307" },
        ],
      },
    });
    render(<OverviewCards budgetId="b1" amountPrivacyEnabled />);

    expect(screen.queryByText("$0.17")).toBeNull(); // not readable
    // Percent AND amount both go through the tap-to-reveal slot.
    const stack = screen.getByText("since yesterday").closest("div")!;
    expect(stack.querySelectorAll('[data-testid="slot-amount"]')).toHaveLength(
      2,
    );
  });

  it("keeps the capitalization hero row inline (nowrap) so the P/L never drops below", () => {
    mockUse.mockReturnValue({ data: DTO, isError: false, isPending: false });
    render(<OverviewCards budgetId="b1" amountPrivacyEnabled={false} />);
    const card = screen.getByTestId("overview-card-capitalization");
    // The hero row (number + since-yesterday P/L) must not wrap — in privacy mode a
    // wide redaction bar previously pushed the P/L onto its own line.
    expect(card.querySelector(".flex-nowrap")).toBeTruthy();
    expect(card.querySelector(".flex-wrap")).toBeNull();
  });

  it("shows $0 + a motivational line with a green check when nothing overspends", () => {
    mockUse.mockReturnValue({
      data: {
        ...DTO,
        overspent: { count: 0, currency: "USD", total_cents: "0", top: [] },
      },
      isError: false,
      isPending: false,
    });
    render(<OverviewCards budgetId="b1" amountPrivacyEnabled={false} />);
    expect(screen.getByText("$0")).toBeTruthy();
    expect(screen.getByText("Good job — keep it up!")).toBeTruthy();
    expect(screen.getByTestId("overspent-ok")).toBeTruthy();
  });

  it("shows the retirement runway banner, hidden when planned spend is 0 (item 5)", () => {
    mockUse.mockReturnValue({ data: DTO, isError: false, isPending: false });
    const { unmount } = render(
      <OverviewCards budgetId="b1" amountPrivacyEnabled={false} />,
    );
    expect(screen.getByTestId("overview-card-retirement")).toBeTruthy();
    // 30 months → full localized "2 years and 6 months" on the flip back.
    expect(screen.getByText("2 years and 6 months")).toBeTruthy();
    unmount();

    mockUse.mockReturnValue({
      data: { ...DTO, retirement_months: null },
      isError: false,
      isPending: false,
    });
    render(<OverviewCards budgetId="b1" amountPrivacyEnabled={false} />);
    expect(screen.queryByTestId("overview-card-retirement")).toBeNull();
  });

  it("rounds the capitalization + P/L (no cents) so large values fit (item 1)", () => {
    mockUse.mockReturnValue({
      data: { ...DTO, capitalization_cents: "707513656" }, // $7,075,136.56
      isError: false,
      isPending: false,
    });
    const today = new Date().toISOString().slice(0, 10);
    const yday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
    mockWealth.mockReturnValueOnce({
      data: {
        series: [
          { label: `${yday}T23`, value_cents: "760000" },
          { label: `${today}T05`, value_cents: "707513656" }, // Δ = 706,753,656¢
        ],
      },
    });
    render(<OverviewCards budgetId="b1" amountPrivacyEnabled={false} />);
    expect(screen.getByText("$7,075,137")).toBeTruthy(); // rounded, no cents
    expect(screen.getByText("$7,067,537")).toBeTruthy(); // P/L rounded
  });
});

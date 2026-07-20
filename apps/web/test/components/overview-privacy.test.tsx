import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act, fireEvent } from "@testing-library/react";
import { OverviewCards } from "@/components/budgeting/overview/overview-cards";
import { BdpUiStateProvider } from "@/components/budgeting/bdp-ui-state";
import { SlotRevealProvider } from "@/components/budgeting/overview/slot-amount";

// next-intl: passthrough t() returns the key; t.rich() invokes the amt-tag
// callback with the amount so the privacy path is exercised in tests.
vi.mock("next-intl", () => {
  const t = (k: string) => k;
  (t as unknown as { rich: unknown }).rich = (
    _k: string,
    values?: Record<string, (v: unknown) => unknown> & { amount?: unknown },
  ) => (values?.amt ? values.amt(values.amount) : _k);
  return { useTranslations: () => t, useLocale: () => "en" };
});

const DATA = {
  default_currency: "USD",
  available_to_spend_cents: "500000",
  spendings: {
    spent_cents: "100000",
    left_cents: "400000",
    wallet_cents: "500000",
    good: true,
  },
  capitalization_cents: "1234500",
  investment_value_cents: "0",
  retirement_months: null,
  retirement_inflation_pct: 3,
  available_reserves_cents: "200000",
  reserves: { required_cents: "150000", wallet_cents: "200000", status: "ok" },
  cushion: {
    enabled: true,
    real_months: 6,
    total_cents: "300000",
    required_cents: "300000",
    covered: true,
  },
  overspent: { count: 0, currency: "USD", total_cents: "0", top: [] },
};

vi.mock("@/hooks/use-overview-cards", () => ({
  useOverviewCards: () => ({ data: DATA, isError: false, isPending: false }),
}));
vi.mock("@/hooks/use-overview-wealth", () => ({
  useOverviewWealth: () => ({ data: undefined }),
}));
vi.mock("@/hooks/use-projection", () => ({
  useProjection: () => ({ data: undefined }),
}));
vi.mock("@/components/common/user-timezone-provider", () => ({
  useUserTimezone: () => "UTC",
}));

const renderCards = (amountPrivacyEnabled = true) =>
  render(
    <SlotRevealProvider>
      <BdpUiStateProvider>
        <OverviewCards
          budgetId="b1"
          amountPrivacyEnabled={amountPrivacyEnabled}
        />
      </BdpUiStateProvider>
    </SlotRevealProvider>,
  );

const heroSlot = () =>
  screen
    .getByTestId("overview-card-capitalization")
    .querySelector('[data-testid="slot-amount"]') as HTMLElement | null;

describe("Overview amount privacy (per-figure slot reveal, r41)", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.useRealTimers()); // no-op unless a test enabled fake timers

  it("starts hidden: figures are SlotAmounts with no real digits, and there is NO eye toggle", () => {
    renderCards();
    expect(screen.queryByTestId("privacy-toggle")).toBeNull(); // eye removed
    const slots = screen.getAllByTestId("slot-amount");
    expect(slots.length).toBeGreaterThan(0);
    slots.forEach((s) => expect(s.dataset.revealed).toBe("false"));
    // The hero figure shows an uppercase random mask, no real digits.
    const hero = heroSlot()!;
    expect(hero.textContent ?? "").not.toMatch(/\d/);
    expect(hero.textContent ?? "").toMatch(/[A-Z]/);
    expect(hero.textContent ?? "").not.toMatch(/[a-z]/); // uppercase only
  });

  it("tapping ONE figure reveals ALL of them; tapping again re-hides all", () => {
    vi.useFakeTimers();
    renderCards();
    const hero = heroSlot()!;
    act(() => fireEvent.click(hero)); // flush the click + its scramble effect
    act(() => vi.runAllTimers()); // settle the scramble
    // Every figure toggled together (shared reveal).
    const slots = screen.getAllByTestId("slot-amount");
    slots.forEach((s) => expect(s.dataset.revealed).toBe("true"));
    expect(hero.textContent ?? "").toMatch(/\d/); // real digits now shown
    act(() => fireEvent.click(hero));
    act(() => vi.runAllTimers());
    screen
      .getAllByTestId("slot-amount")
      .forEach((s) => expect(s.dataset.revealed).toBe("false"));
    expect(hero.textContent ?? "").not.toMatch(/\d/); // hidden again
  });

  it("the cushion runway (a duration) is NOT masked — shown verbatim while amounts hide", () => {
    renderCards();
    // real_months 6 → "6m" renders as plain text even though the SAVED/NEEDED
    // MONEY figures in the same card are masked SlotAmounts. A masked runway
    // would show random uppercase, not "6m".
    const cushion = screen.getByTestId("overview-card-cushion");
    // The runway's real digit "6" is shown; the masked MONEY figures in the card
    // carry no digits (uppercase mask), so any digit here IS the unmasked runway.
    expect(cushion.textContent ?? "").toMatch(/6/);
    expect(cushion.textContent ?? "").not.toContain("3,000"); // needed amount stays masked
  });

  it("privacy flag OFF → real amounts visible, no SlotAmount, no eye", () => {
    renderCards(false);
    expect(screen.queryByTestId("privacy-toggle")).toBeNull();
    expect(screen.queryAllByTestId("slot-amount")).toHaveLength(0);
    const heroNum = screen
      .getByTestId("overview-card-capitalization")
      .querySelector(".num")!;
    expect(heroNum.textContent ?? "").toMatch(/\d/);
  });
});

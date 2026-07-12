import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { OverviewCards } from "@/components/budgeting/overview/overview-cards";
import { BdpUiStateProvider } from "@/components/budgeting/bdp-ui-state";

// next-intl: passthrough t() returns the key; t.rich() invokes the amt-tag
// callback with the amount so the redaction path is exercised in tests.
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
    <BdpUiStateProvider>
      <OverviewCards budgetId="b1" amountPrivacyEnabled={amountPrivacyEnabled} />
    </BdpUiStateProvider>,
  );

const heroText = () =>
  screen
    .getByTestId("overview-card-capitalization")
    .querySelector(".num")!.textContent ?? "";

describe("Overview amount privacy", () => {
  beforeEach(() => vi.clearAllMocks());

  it("starts hidden: redaction bars cover the figures + Show-amounts eye", () => {
    renderCards();
    expect(screen.getByTestId("overview-cards").dataset.hidden).toBe("true");
    expect(screen.getByTestId("privacy-toggle").getAttribute("aria-label")).toBe(
      "cards.privacyShow",
    );
    // Figures are covered by redaction bars; no real digits leak into the DOM.
    expect(screen.getAllByTestId("redaction-bar").length).toBeGreaterThan(0);
    expect(heroText()).not.toMatch(/\d/);
  });

  it("reveals the real amount on click and re-covers on a second click", () => {
    renderCards();
    const btn = screen.getByTestId("privacy-toggle");
    act(() => btn.click());
    expect(screen.getByTestId("overview-cards").dataset.hidden).toBe("false");
    expect(btn.getAttribute("aria-label")).toBe("cards.privacyHide");
    expect(screen.queryAllByTestId("redaction-bar")).toHaveLength(0);
    expect(heroText()).toMatch(/\d/);
    act(() => btn.click());
    expect(screen.getByTestId("overview-cards").dataset.hidden).toBe("true");
    expect(btn.getAttribute("aria-label")).toBe("cards.privacyShow");
    expect(screen.getAllByTestId("redaction-bar").length).toBeGreaterThan(0);
  });

  it("privacy flag OFF → amounts always visible, no eye, no bars", () => {
    renderCards(false);
    expect(screen.queryByTestId("privacy-toggle")).toBeNull();
    expect(screen.queryAllByTestId("redaction-bar")).toHaveLength(0);
    expect(screen.getByTestId("overview-cards").dataset.hidden).toBe("false");
    expect(heroText()).toMatch(/\d/);
  });
});

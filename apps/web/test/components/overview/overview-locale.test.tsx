/**
 * overview-locale.test.tsx — Overview amounts follow the visitor's language
 * (261113, user: the Polish demo read "1,341,311 zł" on Overview but
 * "44 274,63" on Assets). They were pinned to "en".
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { OverviewCards } from "@/components/budgeting/overview/overview-cards";
import { BdpUiStateProvider } from "@/components/budgeting/bdp-ui-state";
import { SlotRevealProvider } from "@/components/budgeting/overview/slot-amount";

vi.mock("next-intl", () => {
  const t = (k: string) => k;
  (t as unknown as { rich: unknown }).rich = (
    _k: string,
    values?: Record<string, (v: unknown) => unknown> & { amount?: unknown },
  ) => (values?.amt ? values.amt(values.amount) : _k);
  return { useTranslations: () => t, useLocale: () => "pl" };
});

const DATA = {
  default_currency: "PLN",
  available_to_spend_cents: "500000",
  spendings: {
    spent_cents: "100000",
    left_cents: "400000",
    wallet_cents: "500000",
    good: true,
  },
  capitalization_cents: "134131100",
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
  overspent: { count: 0, currency: "PLN", total_cents: "0", top: [] },
};

vi.mock("@/hooks/use-overview-cards", () => ({
  useOverviewCards: () => ({ data: DATA, isError: false, isPending: false }),
}));
vi.mock("@/hooks/use-overview-wealth", () => ({
  useOverviewWealth: () => ({ data: undefined }),
}));
vi.mock("@/hooks/use-projection-horizon", () => ({
  useProjectionHorizon: () => ({ days: 100, setDays: () => {}, locked: false }),
}));
vi.mock("@/hooks/use-projection", () => ({
  useMaxProjection: () => ({ data: undefined }),
  useProjection: () => ({ data: undefined }),
}));
vi.mock("@/components/common/user-timezone-provider", () => ({
  useUserTimezone: () => "UTC",
}));

describe("Overview in Polish", () => {
  it("groups thousands the Polish way, like the rest of the app", () => {
    render(
      <SlotRevealProvider>
        <BdpUiStateProvider>
          <OverviewCards budgetId="b1" amountPrivacyEnabled={false} />
        </BdpUiStateProvider>
      </SlotRevealProvider>,
    );
    const hero = screen.getByTestId("capitalization-hero");
    expect(hero.textContent).not.toMatch(/1,341,311/);
    expect(hero.textContent).toMatch(/1\s341\s311\s?zł/u);
  });
});

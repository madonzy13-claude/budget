/**
 * budget-identity-rows.test.tsx — the General card's rows line up (260810).
 *
 * Three complaints from one screenshot: the Name and Currency values stopped
 * short of the right edge every switch on the card reaches, the privacy switch
 * floated between its two lines of text instead of sitting against its title
 * like every other toggle, and privacy itself was the owner's to set when it is
 * nobody's business but the reader's.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("next-intl", () => ({
  useTranslations: () => (k: string) => k,
  useLocale: () => "en",
}));
vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn(), setQueryData: vi.fn() }),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/api-client", () => ({
  api: {
    budgets: { ":id": { $patch: vi.fn().mockResolvedValue({ ok: true }) } },
  },
}));
vi.mock("@/lib/query-persist", () => ({ persistNow: vi.fn() }));

import { BudgetIdentitySection } from "@/components/settings/budget-identity-section";
import { PrivacySection } from "@/components/settings/privacy-section";

const renderIt = (hasTransactions = true) =>
  render(
    <BudgetIdentitySection
      budgetId="b1"
      name="Household"
      defaultCurrency="PLN"
      hasTransactions={hasTransactions}
    />,
  );

describe("General card rows", () => {
  it("ends the name at the row's right edge, like the switches", () => {
    renderIt();
    const cell = screen.getByTestId("budget-name-input");
    expect(cell.className).not.toMatch(/(^|\s)px-\d/);
    expect(cell.className).not.toMatch(/(^|\s)pr-\d/);
  });

  it("ends the locked currency at the row's right edge too", () => {
    renderIt(true);
    const cell = screen.getByText("PLN");
    expect(cell.className).not.toMatch(/(^|\s)px-\d/);
    expect(cell.className).not.toMatch(/(^|\s)pr-\d/);
  });
});

describe("Privacy mode row", () => {
  it("sits the switch against its title, like every other toggle", () => {
    const { container } = render(<PrivacySection budgetId="b1" />);
    const row = container.firstElementChild as HTMLElement;
    expect(row.className).toContain("items-start");
    expect(row.className).not.toContain("items-center");
  });

  it("is OFF when nothing was stored for this member", () => {
    render(<PrivacySection budgetId="b1" />);
    expect(
      screen.getByTestId("amount-privacy-switch").getAttribute("aria-checked"),
    ).toBe("false");
  });

  it("stays ON for a member who already had it", () => {
    render(<PrivacySection budgetId="b1" amountPrivacyEnabled />);
    expect(
      screen.getByTestId("amount-privacy-switch").getAttribute("aria-checked"),
    ).toBe("true");
  });
});

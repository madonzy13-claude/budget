/**
 * quick-entry-category-currency.test.tsx — D-05: quick entry in a EUR column
 * posts EUR, not the budget's currency.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mutate = vi.fn();
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => "en",
}));
vi.mock("@/hooks/use-create-transaction", () => ({
  useCreateTransaction: () => ({ mutate }),
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const { QuickEntryInput } = await import("@/components/budgeting/spendings-grid/quick-entry-input");

beforeEach(() => {
  mutate.mockClear();
  Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
});

describe("Quick entry — category currency", () => {
  it("posts the column category's currency", async () => {
    const user = userEvent.setup();
    render(
      <QuickEntryInput
        categoryId="c1"
        categoryName="Travel"
        budgetId="b1"
        month="2026-08"
        budgetCurrency="PLN"
        currency="EUR"
        resolvedDate="2026-08-06"
      />,
    );
    const input = screen.getByTestId("quick-entry-travel");
    await user.type(input, "20{Enter}");
    expect(mutate.mock.calls[0]![0].currency).toBe("EUR");
  });
});

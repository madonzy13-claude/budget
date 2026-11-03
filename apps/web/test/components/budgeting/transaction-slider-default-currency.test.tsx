/**
 * transaction-slider-default-currency.test.tsx — D-05: a new transaction
 * defaults to its CATEGORY's currency, not the budget's.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TestQueryProvider } from "../../setup/query-client";

const fetchMock = vi.fn();
vi.mock("@/lib/budget-fetch", () => ({
  clientApiFetch: (...args: unknown[]) => fetchMock(...args),
}));
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => "en",
  useFormatter: () => ({ relativeTime: () => "now" }),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@radix-ui/react-dialog", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@radix-ui/react-dialog")>();
  return { ...actual, Portal: ({ children }: { children: React.ReactNode }) => <>{children}</> };
});

import { TransactionSlider } from "@/components/budgeting/transaction-slider";

const categories = [
  { id: "cat-pln", name: "Groceries", sortIndex: 0, currency: "PLN" },
  { id: "cat-eur", name: "Travel", sortIndex: 1, currency: "EUR" },
];

async function saveWith(prefillCategoryId: string) {
  const user = userEvent.setup();
  render(
    <TestQueryProvider>
      <TransactionSlider
        open
        onOpenChange={vi.fn()}
        mode="create"
        budgetId="b1"
        month="2026-05"
        budgetCurrency="PLN"
        categories={categories}
        prefillCategoryId={prefillCategoryId}
      />
    </TestQueryProvider>,
  );
  await user.type(document.getElementById("txn-slider-amount") as HTMLInputElement, "20");
  await user.click(screen.getAllByRole("button").find((b) => b.textContent?.includes("txnSlider.cta.create"))!);
  await vi.waitFor(() => expect(fetchMock.mock.calls.some((c) => (c[1] as { method?: string })?.method === "POST")).toBe(true));
  const post = fetchMock.mock.calls.find((c) => (c[1] as { method?: string })?.method === "POST");
  return JSON.parse((post![1] as { body: string }).body);
}

describe("Transaction slider — category currency default", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ transaction: {} }) });
  });

  it("defaults to a EUR category's currency in a PLN budget", async () => {
    expect((await saveWith("cat-eur")).currency_original).toBe("EUR");
  });

  it("defaults to a PLN category's currency", async () => {
    expect((await saveWith("cat-pln")).currency_original).toBe("PLN");
  });
});

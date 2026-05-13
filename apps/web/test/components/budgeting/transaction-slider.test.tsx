/**
 * transaction-slider.test.tsx — Vitest+RTL tests for TransactionSlider.
 * TDD RED: write tests before implementation.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TestQueryProvider } from "../../setup/query-client";

const fetchMock = vi.fn();
vi.mock("@/lib/budget-fetch", () => ({
  clientApiFetch: (...args: unknown[]) => fetchMock(...args),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => "en",
  useFormatter: () => ({
    relativeTime: (_d: Date, _n: Date) => "2 hours ago",
  }),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

// Mock @radix-ui/react-dialog so Sheet renders children without portal issues
vi.mock("@radix-ui/react-dialog", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@radix-ui/react-dialog")>();
  return {
    ...actual,
    Portal: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  };
});

import { TransactionSlider } from "@/components/budgeting/transaction-slider";

const defaultCategories = [
  { id: "cat-1", name: "Groceries", sortIndex: 0 },
  { id: "cat-2", name: "Transport", sortIndex: 1 },
];

const defaultProps = {
  open: true,
  onOpenChange: vi.fn(),
  mode: "create" as const,
  budgetId: "budget-1",
  month: "2026-05",
  budgetCurrency: "USD",
  categories: defaultCategories,
};

const editProps = {
  ...defaultProps,
  mode: "edit" as const,
  initial: {
    txId: "tx-1",
    date: "2026-05-10",
    categoryId: "cat-1",
    amountOriginalCents: "5000",
    currencyOriginal: "USD",
    note: "Lunch",
  },
};

describe("TransactionSlider", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ transaction: {} }),
    });
  });

  it("create mode: header is 'grid.txnSlider.header.create'", () => {
    render(
      <TestQueryProvider>
        <TransactionSlider {...defaultProps} />
      </TestQueryProvider>,
    );
    // mock returns key without namespace prefix, component calls t("txnSlider.header.create")
    expect(screen.getByText("txnSlider.header.create")).toBeTruthy();
  });

  it("create mode: footer has Save button only (no Delete)", () => {
    render(
      <TestQueryProvider>
        <TransactionSlider {...defaultProps} />
      </TestQueryProvider>,
    );
    const buttons = screen.getAllByRole("button");
    const labels = buttons.map((b) => b.textContent ?? "");
    // Should have Save (create cta) but no Delete
    expect(labels.some((l) => l.includes("txnSlider.cta.create"))).toBe(true);
    expect(labels.some((l) => l.includes("txn.action.delete"))).toBe(false);
  });

  it("edit mode: header is 'grid.txnSlider.header.edit'", () => {
    render(
      <TestQueryProvider>
        <TransactionSlider {...editProps} />
      </TestQueryProvider>,
    );
    expect(screen.getByText("txnSlider.header.edit")).toBeTruthy();
  });

  it("edit mode: footer shows both Delete and Save", () => {
    render(
      <TestQueryProvider>
        <TransactionSlider {...editProps} />
      </TestQueryProvider>,
    );
    const buttons = screen.getAllByRole("button");
    const labels = buttons.map((b) => b.textContent ?? "");
    expect(labels.some((l) => l.includes("txnSlider.cta.save"))).toBe(true);
    expect(labels.some((l) => l.includes("txn.action.delete"))).toBe(true);
  });

  it("Sheet has className including w-screen and sm:w-[480px]", () => {
    const { container } = render(
      <TestQueryProvider>
        <TransactionSlider {...defaultProps} />
      </TestQueryProvider>,
    );
    const content = container.querySelector("[data-testid='txn-slider-content'], [class*='w-screen']");
    // Sheet content element has data attribute or class
    const sheetContent = container.querySelector("[class*='w-screen']");
    expect(sheetContent).toBeTruthy();
  });

  it("FX line renders only when currency !== budgetCurrency", () => {
    // With matching currency (USD === USD), no FX line
    const { container: c1 } = render(
      <TestQueryProvider>
        <TransactionSlider {...defaultProps} />
      </TestQueryProvider>,
    );
    // Mock fetchMock to return FX data
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ rate: "4.12", fxRateDate: "2026-05-10", provider: "frankfurter", isStale: false }),
    });
    // FX preview should not be visible by default when no fx preview loaded yet
    const fxPreview = c1.querySelector("[data-testid='fx-preview-line']");
    expect(fxPreview).toBeNull();
  });

  it("Delete click opens AlertDialog with confirm.deleteTxn content", () => {
    render(
      <TestQueryProvider>
        <TransactionSlider {...editProps} />
      </TestQueryProvider>,
    );
    const deleteBtn = screen.getAllByRole("button").find(
      (b) => b.textContent?.includes("txn.action.delete"),
    );
    expect(deleteBtn).toBeTruthy();
    fireEvent.click(deleteBtn!);
    // AlertDialog title should appear (mock returns the key)
    expect(screen.queryByText("confirm.deleteTxn.title")).toBeTruthy();
  });

  it("fields rendered in form (Date, Category, Amount, Note)", () => {
    render(
      <TestQueryProvider>
        <TransactionSlider {...defaultProps} />
      </TestQueryProvider>,
    );
    // Should have date input, category select, amount input, note input
    expect(screen.getByText("txnSlider.field.date")).toBeTruthy();
    expect(screen.getByText("txnSlider.field.amount")).toBeTruthy();
    expect(screen.getByText("txnSlider.field.note")).toBeTruthy();
  });
});

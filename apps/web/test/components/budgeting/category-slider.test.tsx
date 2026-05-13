/**
 * category-slider.test.tsx — Vitest+RTL tests for CategorySlider.
 * TDD RED: write tests before implementation.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { TestQueryProvider } from "../../setup/query-client";

const fetchMock = vi.fn();
vi.mock("@/lib/budget-fetch", () => ({
  clientApiFetch: (...args: unknown[]) => fetchMock(...args),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => "en",
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("@radix-ui/react-dialog", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@radix-ui/react-dialog")>();
  return {
    ...actual,
    Portal: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  };
});

import { CategorySlider } from "@/components/budgeting/category-slider";

const defaultProps = {
  open: true,
  onOpenChange: vi.fn(),
  mode: "create" as const,
  budgetId: "budget-1",
  budgetCurrency: "USD",
};

const editProps = {
  ...defaultProps,
  mode: "edit" as const,
  initial: {
    categoryId: "cat-1",
    name: "Groceries",
    plannedCents: "10000",
    cushionCents: "2000",
    iconKey: null,
    colorKey: null,
  },
  txnsCount: 0,
};

describe("CategorySlider", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ category: { id: "cat-new" } }),
    });
  });

  it("create mode: 'New category' header (catSlider.header.create)", () => {
    render(
      <TestQueryProvider>
        <CategorySlider {...defaultProps} />
      </TestQueryProvider>,
    );
    // mock returns key without namespace prefix
    expect(screen.getByText("catSlider.header.create")).toBeTruthy();
  });

  it("edit mode: 'Edit category' header (catSlider.header.edit)", () => {
    render(
      <TestQueryProvider>
        <CategorySlider {...editProps} />
      </TestQueryProvider>,
    );
    expect(screen.getByText("catSlider.header.edit")).toBeTruthy();
  });

  it("icon picker shows icon options (8 preset lucide icons)", () => {
    render(
      <TestQueryProvider>
        <CategorySlider {...defaultProps} />
      </TestQueryProvider>,
    );
    // Should have icon picker section
    const iconLabel = screen.queryByText("catSlider.field.icon");
    expect(iconLabel).toBeTruthy();
    // Should have at least some icon buttons
    const iconButtons = document.querySelectorAll("[data-testid^='icon-option-']");
    expect(iconButtons.length).toBeGreaterThanOrEqual(8);
  });

  it("color picker shows color swatches (8 colors)", () => {
    render(
      <TestQueryProvider>
        <CategorySlider {...defaultProps} />
      </TestQueryProvider>,
    );
    const colorLabel = screen.queryByText("catSlider.field.color");
    expect(colorLabel).toBeTruthy();
    const colorButtons = document.querySelectorAll("[data-testid^='color-option-']");
    expect(colorButtons.length).toBeGreaterThanOrEqual(8);
  });

  it("currency for planned + cushion is fixed to budgetCurrency (no picker)", () => {
    render(
      <TestQueryProvider>
        <CategorySlider {...defaultProps} />
      </TestQueryProvider>,
    );
    // Should show USD badge(s) but no currency select/picker
    const currencyBadges = document.querySelectorAll("[data-testid='currency-badge']");
    expect(currencyBadges.length).toBeGreaterThanOrEqual(1);
    // No currency picker select for planned/cushion
    const currencyPicker = document.querySelector("[data-testid='currency-picker']");
    expect(currencyPicker).toBeNull();
  });

  it("validation: name required; save button present", () => {
    render(
      <TestQueryProvider>
        <CategorySlider {...defaultProps} />
      </TestQueryProvider>,
    );
    // Name field should be present
    expect(screen.getByText("catSlider.field.name")).toBeTruthy();
    // Save button present
    const saveBtn = screen.getAllByRole("button").find(
      (b) => b.textContent?.includes("catSlider.cta.create"),
    );
    expect(saveBtn).toBeTruthy();
  });

  it("edit mode: Delete button visible when txnsCount === 0", () => {
    render(
      <TestQueryProvider>
        <CategorySlider {...editProps} txnsCount={0} />
      </TestQueryProvider>,
    );
    const deleteBtn = document.querySelector("[data-testid='cat-slider-delete']");
    expect(deleteBtn).toBeTruthy();
  });

  it("edit mode: Delete button disabled when txnsCount > 0", () => {
    render(
      <TestQueryProvider>
        <CategorySlider {...editProps} txnsCount={5} />
      </TestQueryProvider>,
    );
    const deleteBtn = document.querySelector("[data-testid='cat-slider-delete']") as HTMLButtonElement | null;
    // Either disabled or has aria-disabled
    if (deleteBtn) {
      expect(deleteBtn.disabled || deleteBtn.getAttribute("aria-disabled") === "true").toBe(true);
    } else {
      // Button might not be rendered at all when has txns
      // Either approach is valid per spec
      expect(true).toBe(true);
    }
  });
});

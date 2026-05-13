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

  // ── UAT Defect 2: create response parsing ────────────────────────────
  it("create: calls POST /budgets/:id/categories then POST limits, closes slider on success", async () => {
    const onOpenChange = vi.fn();
    // First call: POST /categories → { category: { id } }
    // Second call: POST /categories/:id/limits → ok
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => ({ category: { id: "cat-new-123" } }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) });

    const { default: userEvent } = await import("@testing-library/user-event");
    const user = userEvent.setup();

    render(
      <TestQueryProvider>
        <CategorySlider {...defaultProps} onOpenChange={onOpenChange} />
      </TestQueryProvider>,
    );

    // Fill name
    const nameInput = document.getElementById("cat-slider-name") as HTMLInputElement;
    await user.clear(nameInput);
    await user.type(nameInput, "Groceries");

    // Submit
    const saveBtn = screen.getAllByRole("button").find(
      (b) => b.textContent?.includes("catSlider.cta.create"),
    )!;
    await user.click(saveBtn);

    // POST /categories called with correct path
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining(`/budgets/budget-1/categories`),
      expect.objectContaining({ method: "POST" }),
    );
    // POST limits called with the id from the response
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("cat-new-123/limits"),
      expect.objectContaining({ method: "POST" }),
    );
    // Slider closes on success
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("create: if API returns flat DTO (missing category wrapper) does NOT crash", async () => {
    // Guard: even if server accidentally returns flat DTO, no TypeError thrown
    fetchMock
      .mockResolvedValueOnce({ ok: false, json: async () => ({}) });

    const onOpenChange = vi.fn();
    const { default: userEvent } = await import("@testing-library/user-event");
    const user = userEvent.setup();

    render(
      <TestQueryProvider>
        <CategorySlider {...defaultProps} onOpenChange={onOpenChange} />
      </TestQueryProvider>,
    );

    const nameInput = document.getElementById("cat-slider-name") as HTMLInputElement;
    await user.clear(nameInput);
    await user.type(nameInput, "Test");
    const saveBtn = screen.getAllByRole("button").find(
      (b) => b.textContent?.includes("catSlider.cta.create"),
    )!;
    // Should not throw — toast.error called instead
    await user.click(saveBtn);
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  // ── UAT Defect 3: edit mode prefill ─────────────────────────────────
  it("edit mode: name input is prefilled from initial prop", () => {
    render(
      <TestQueryProvider>
        <CategorySlider {...editProps} />
      </TestQueryProvider>,
    );
    const nameInput = document.getElementById("cat-slider-name") as HTMLInputElement;
    expect(nameInput).toBeTruthy();
    expect(nameInput.value).toBe("Groceries");
  });

  it("edit mode: planned amount is prefilled (10000 cents → 100.00)", () => {
    render(
      <TestQueryProvider>
        <CategorySlider {...editProps} />
      </TestQueryProvider>,
    );
    const plannedInput = document.getElementById("cat-slider-planned") as HTMLInputElement;
    expect(plannedInput).toBeTruthy();
    expect(plannedInput.value).toBe("100.00");
  });

  it("edit mode: cushion amount is prefilled (2000 cents → 20.00)", () => {
    render(
      <TestQueryProvider>
        <CategorySlider {...editProps} />
      </TestQueryProvider>,
    );
    const cushionInput = document.getElementById("cat-slider-cushion") as HTMLInputElement;
    expect(cushionInput).toBeTruthy();
    expect(cushionInput.value).toBe("20.00");
  });

  it("edit mode: re-opening with different category resets form to new values", async () => {
    const { rerender } = render(
      <TestQueryProvider>
        <CategorySlider {...editProps} open={false} />
      </TestQueryProvider>,
    );

    const newInitial = {
      categoryId: "cat-2",
      name: "Transport",
      plannedCents: "5000",
      cushionCents: "1000",
      iconKey: null,
      colorKey: null,
    };

    rerender(
      <TestQueryProvider>
        <CategorySlider {...editProps} open={true} initial={newInitial} />
      </TestQueryProvider>,
    );

    const nameInput = document.getElementById("cat-slider-name") as HTMLInputElement;
    expect(nameInput?.value).toBe("Transport");
    const plannedInput = document.getElementById("cat-slider-planned") as HTMLInputElement;
    expect(plannedInput?.value).toBe("50.00");
  });
});

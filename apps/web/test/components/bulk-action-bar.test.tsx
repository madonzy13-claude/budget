/**
 * bulk-action-bar.test.tsx — Vitest+RTL tests for BulkActionBar (Plan 02-09).
 * Covers: hidden when empty, visible when selected, POST body shape, success callback.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("next-intl", () => ({
  useTranslations: (_ns: string) => (key: string, vars?: Record<string, unknown>) => {
    if (key === "actionLabel") return `Re-categorize ${vars?.count ?? 0} transactions`;
    if (key === "applyButton") return "Apply re-categorization";
    if (key === "categoryPlaceholder") return "Select category";
    if (key === "categorySelectLabel") return "Category";
    if (key === "regionLabel") return "Bulk actions";
    if (key === "applySucceeded") return `Re-categorized ${vars?.count ?? 0}`;
    if (key === "applyFailed") return "Failed";
    return key;
  },
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

const { BulkActionBar } = await import(
  "../../src/components/budgeting/bulk-action-bar"
);

const categories = [
  { id: "cat-a", name: "Food" },
  { id: "cat-b", name: "Eating Out" },
];

describe("BulkActionBar", () => {
  it("renders nothing when no rows are selected", () => {
    const { container } = render(
      <BulkActionBar selectedIds={[]} categories={categories} />,
    );
    expect(container.querySelector('[data-testid="bulk-action-bar"]')).toBeNull();
  });

  it("appears with the selected count when >= 1 row selected", () => {
    render(
      <BulkActionBar
        selectedIds={["t1", "t2", "t3"]}
        categories={categories}
      />,
    );
    expect(screen.getByTestId("bulk-action-bar")).toBeTruthy();
    expect(screen.getByTestId("bulk-action-bar-count").textContent).toContain(
      "Re-categorize 3 transactions",
    );
  });

  it("Apply button is disabled until a category is picked", () => {
    render(
      <BulkActionBar
        selectedIds={["t1"]}
        categories={categories}
      />,
    );
    const apply = screen.getByTestId("bulk-action-bar-apply") as HTMLButtonElement;
    expect(apply.disabled).toBe(true);
  });

  it("POSTs the correct body to /api/transactions/bulk-recategorize and calls onApplied", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    const onApplied = vi.fn();
    render(
      <BulkActionBar
        selectedIds={["t1", "t2"]}
        categories={categories}
        onApplied={onApplied}
        fetchImpl={fetchMock as unknown as typeof fetch}
      />,
    );
    fireEvent.change(screen.getByTestId("bulk-action-bar-category-select"), {
      target: { value: "cat-b" },
    });
    fireEvent.click(screen.getByTestId("bulk-action-bar-apply"));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("/api/transactions/bulk-recategorize");
    expect((init as RequestInit).method).toBe("POST");
    const body = JSON.parse(String((init as RequestInit).body));
    expect(body).toEqual({
      transactionIds: ["t1", "t2"],
      newCategoryId: "cat-b",
    });
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers["Content-Type"]).toBe("application/json");
    expect(typeof headers["Idempotency-Key"]).toBe("string");
    await waitFor(() => expect(onApplied).toHaveBeenCalled());
  });
});

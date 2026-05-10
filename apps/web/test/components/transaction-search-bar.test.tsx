/**
 * transaction-search-bar.test.tsx — Vitest+RTL tests for TransactionSearchBar (Plan 02-09).
 * Covers: render, debounce, trim, result-count caption.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("next-intl", () => ({
  useTranslations: (_ns: string) => (key: string, vars?: Record<string, unknown>) => {
    if (key === "placeholder") return "Search transactions";
    if (key === "resultsCount") {
      const count = Number(vars?.count ?? 0);
      const query = String(vars?.query ?? "");
      if (count === 0) return `No results for ${query}`;
      if (count === 1) return `1 result for ${query}`;
      return `${count} results for ${query}`;
    }
    return key;
  },
}));

const { TransactionSearchBar } = await import(
  "../../src/components/budgeting/transaction-search-bar"
);

describe("TransactionSearchBar", () => {
  it("renders the search input with the placeholder", () => {
    render(<TransactionSearchBar onChange={() => {}} debounceMs={0} />);
    expect(screen.getByPlaceholderText("Search transactions")).toBeTruthy();
  });

  it("debounces onChange and trims the value", async () => {
    const onChange = vi.fn();
    render(<TransactionSearchBar onChange={onChange} debounceMs={0} />);
    const input = screen.getByTestId("transaction-search-input");
    fireEvent.change(input, { target: { value: "  coffee  " } });
    await waitFor(() => expect(onChange).toHaveBeenCalledWith("coffee"));
  });

  it("shows the result count caption only when query is non-empty", async () => {
    const { rerender } = render(
      <TransactionSearchBar
        onChange={() => {}}
        debounceMs={0}
        initialQuery=""
        resultCount={12}
      />,
    );
    expect(screen.queryByTestId("transaction-search-results-count")).toBeNull();

    rerender(
      <TransactionSearchBar
        onChange={() => {}}
        debounceMs={0}
        initialQuery="coffee"
        resultCount={12}
      />,
    );
    await waitFor(() => {
      const caption = screen.getByTestId("transaction-search-results-count");
      expect(caption.textContent).toContain("12 results for coffee");
    });
  });
});

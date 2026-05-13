import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useTransactions } from "../../src/hooks/use-transactions";
import { TestQueryProvider, makeTestQueryClient } from "../setup/query-client";

const mockFetch = vi.fn();
vi.mock("../../src/lib/budget-fetch", () => ({
  clientApiFetch: (...args: unknown[]) => mockFetch(...args),
}));

const BUDGET_ID = "budget-123";
const MONTH = "2026-05";

function wrapper({ children }: { children: React.ReactNode }) {
  return <TestQueryProvider>{children}</TestQueryProvider>;
}

describe("useTransactions", () => {
  beforeEach(() => {
    mockFetch.mockClear();
  });

  it("queryFn calls clientApiFetch with correct URL (confirmed=true)", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ transactions: [] }),
    });

    const { result } = renderHook(() => useTransactions(BUDGET_ID, MONTH), {
      wrapper,
    });

    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(mockFetch).toHaveBeenCalledWith(
      `/budgets/${BUDGET_ID}/transactions?month=${MONTH}&confirmed=true`,
    );
  });

  it("initialData hydrates immediately without fetch", () => {
    const initialData = [
      {
        id: "txn-1",
        categoryId: "cat-1",
        amountConvertedCents: "500",
        currencyConverted: "USD",
        transactionDate: "2026-05-01",
        confirmedAt: "2026-05-01T00:00:00Z",
      },
    ];

    const { result } = renderHook(
      () => useTransactions(BUDGET_ID, MONTH, { initialData }),
      { wrapper },
    );

    // Should have data immediately (no fetch needed)
    expect(result.current.data).toEqual(initialData);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("queryKey is exactly ['transactions', budgetId, month]", async () => {
    const client = makeTestQueryClient();
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ transactions: [{ id: "txn-1" }] }),
    });

    const { result } = renderHook(() => useTransactions(BUDGET_ID, MONTH), {
      wrapper: ({ children }) => (
        <TestQueryProvider client={client}>{children}</TestQueryProvider>
      ),
    });

    await waitFor(() => expect(result.current.data).toBeDefined());

    const cache = client.getQueryCache().findAll();
    const ourQuery = cache.find(
      (q) =>
        JSON.stringify(q.queryKey) ===
        JSON.stringify(["transactions", BUDGET_ID, MONTH]),
    );
    expect(ourQuery).toBeDefined();
  });

  it("isError is true when fetch returns !ok", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: async () => ({}),
    });

    const { result } = renderHook(() => useTransactions(BUDGET_ID, MONTH), {
      wrapper,
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });

  it("returns transactions array from body.transactions", async () => {
    const txns = [{ id: "t1", amountConvertedCents: "1000" }];
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ transactions: txns }),
    });

    const { result } = renderHook(() => useTransactions(BUDGET_ID, MONTH), {
      wrapper,
    });

    await waitFor(() => expect(result.current.data).toEqual(txns));
  });
});

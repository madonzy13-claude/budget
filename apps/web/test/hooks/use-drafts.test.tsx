import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useDrafts } from "../../src/hooks/use-drafts";
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

describe("useDrafts", () => {
  beforeEach(() => {
    mockFetch.mockClear();
  });

  it("queryFn calls clientApiFetch with confirmed=false", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ transactions: [] }),
    });

    const { result } = renderHook(() => useDrafts(BUDGET_ID, MONTH), {
      wrapper,
    });

    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(mockFetch).toHaveBeenCalledWith(
      `/budgets/${BUDGET_ID}/transactions?month=${MONTH}&confirmed=false`,
    );
  });

  it("initialData hydrates immediately, then SWR-refetches in the background", async () => {
    const initialData = [
      {
        id: "draft-1",
        categoryId: "cat-1",
        amountConvertedCents: "300",
        currencyConverted: "USD",
        transactionDate: "2026-05-01",
        confirmedAt: null,
        ruleName: "Rent",
      },
    ];
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ transactions: [] }),
    });

    const { result } = renderHook(
      () => useDrafts(BUDGET_ID, MONTH, { initialData }),
      { wrapper },
    );

    // initialData paints instantly (synchronous first render).
    expect(result.current.data).toEqual(initialData);
    // refetchOnMount:"always" (SPA/SWR 260616) fires a background revalidation —
    // the cached data still renders without waiting for it.
    await waitFor(() =>
      expect(mockFetch).toHaveBeenCalledWith(
        `/budgets/${BUDGET_ID}/transactions?month=${MONTH}&confirmed=false`,
      ),
    );
  });

  it("queryKey is exactly ['drafts', budgetId, month]", async () => {
    const client = makeTestQueryClient();
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ transactions: [] }),
    });

    const { result } = renderHook(() => useDrafts(BUDGET_ID, MONTH), {
      wrapper: ({ children }) => (
        <TestQueryProvider client={client}>{children}</TestQueryProvider>
      ),
    });

    await waitFor(() => expect(result.current.data).toBeDefined());

    const cache = client.getQueryCache().findAll();
    const draftsQuery = cache.find(
      (q) =>
        JSON.stringify(q.queryKey) ===
        JSON.stringify(["drafts", BUDGET_ID, MONTH]),
    );
    expect(draftsQuery).toBeDefined();
  });

  it("queryKey ['drafts', budgetId, month] does NOT collide with useTransactions ['transactions', budgetId, month]", async () => {
    const client = makeTestQueryClient();
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ transactions: [] }),
    });

    const { result: draftsResult } = renderHook(
      () => useDrafts(BUDGET_ID, MONTH),
      {
        wrapper: ({ children }) => (
          <TestQueryProvider client={client}>{children}</TestQueryProvider>
        ),
      },
    );
    const { result: txnResult } = renderHook(
      () => useTransactions(BUDGET_ID, MONTH),
      {
        wrapper: ({ children }) => (
          <TestQueryProvider client={client}>{children}</TestQueryProvider>
        ),
      },
    );

    await waitFor(() => expect(draftsResult.current.data).toBeDefined());
    await waitFor(() => expect(txnResult.current.data).toBeDefined());

    const cache = client.getQueryCache().findAll();
    const draftsQuery = cache.find(
      (q) =>
        JSON.stringify(q.queryKey) ===
        JSON.stringify(["drafts", BUDGET_ID, MONTH]),
    );
    const txnsQuery = cache.find(
      (q) =>
        JSON.stringify(q.queryKey) ===
        JSON.stringify(["transactions", BUDGET_ID, MONTH]),
    );
    expect(draftsQuery).toBeDefined();
    expect(txnsQuery).toBeDefined();
    expect(draftsQuery?.queryKey).not.toEqual(txnsQuery?.queryKey);
  });

  it("isError is true when fetch returns !ok", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: async () => ({}),
    });

    const { result } = renderHook(() => useDrafts(BUDGET_ID, MONTH), {
      wrapper,
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});

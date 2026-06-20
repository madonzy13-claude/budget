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
    // mockReset (not mockClear) — mockClear leaves any unconsumed
    // mockResolvedValueOnce in the queue, which then leaks into the next test
    // (e.g. the no-refetch initialData test below never consumes its response,
    // desyncing the isError / snake_case tests that follow).
    mockFetch.mockReset();
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
    // queryFn aborts a slow fetch (AbortSignal.timeout) so the call carries a signal.
    expect(mockFetch).toHaveBeenCalledWith(
      `/budgets/${BUDGET_ID}/transactions?month=${MONTH}&confirmed=true`,
      expect.objectContaining({ signal: expect.anything() }),
    );
  });

  it("initialData paints instantly and does NOT refetch while still fresh (staleTime)", async () => {
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
    // A response is queued in case a refetch fires — we assert it does NOT.
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ transactions: [] }),
    });

    const { result } = renderHook(
      () => useTransactions(BUDGET_ID, MONTH, { initialData }),
      { wrapper },
    );

    // Instant paint: initialData is available synchronously on the first render
    // (stale-while-revalidate — zero waiting where cache exists).
    expect(result.current.data).toEqual(initialData);
    // The hook sets staleTime: 30s and NO LONGER uses refetchOnMount:"always"
    // (removed for nav perf — a refetch on every tab switch was the cache-lag
    // cause; SPA/SWR revalidates only once the 30s window lapses). So fresh
    // initialData must NOT trigger a background network call on mount.
    await new Promise((r) => setTimeout(r, 50));
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

  it("maps snake_case API response to camelCase TxnDTO", async () => {
    // API returns snake_case; queryFn applies mapTxnRowToDTO
    const snakeRow = {
      id: "t1",
      category_id: "cat-abc",
      amount_converted_cents: 1000,
      currency_original: "EUR",
      confirmed_at: null,
      date: "2026-05-01",
    };
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ transactions: [snakeRow] }),
    });

    const { result } = renderHook(() => useTransactions(BUDGET_ID, MONTH), {
      wrapper,
    });

    await waitFor(() => expect(result.current.data).toBeDefined());
    const row = result.current.data![0]!;
    expect(row.id).toBe("t1");
    expect(row.categoryId).toBe("cat-abc");
    expect(row.amountConvertedCents).toBe("1000");
    expect(row.transactionDate).toBe("2026-05-01");
    // snake_case keys must NOT appear
    expect((row as Record<string, unknown>).category_id).toBeUndefined();
    expect(
      (row as Record<string, unknown>).amount_converted_cents,
    ).toBeUndefined();
  });
});

/**
 * offline-readback.test.tsx — verifies that per-entity hooks return cached IDB
 * rows when the network fetch throws (cold offline reload simulation).
 *
 * 260615-e8s Task 4: read-back fallback in queryFn catch branches.
 * Uses fake-indexeddb + QueryClientProvider; no real DOM required beyond what
 * RTL/renderHook sets up.
 */
import "fake-indexeddb/auto";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

// Seed IDB helpers
import {
  setCachedEntities,
  setSyncMeta,
  wipeBudgetCache,
} from "../src/lib/offline-cache";

// Mock clientApiFetch to throw (simulating offline)
vi.mock("../src/lib/budget-fetch", () => ({
  clientApiFetch: vi.fn(),
}));
import { clientApiFetch } from "../src/lib/budget-fetch";
const mockFetch = clientApiFetch as ReturnType<typeof vi.fn>;

// Mock next-intl (used transitively in some imports)
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => "en",
}));

function makeWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return {
    qc,
    wrapper: ({ children }: { children: React.ReactNode }) =>
      React.createElement(QueryClientProvider, { client: qc }, children),
  };
}

beforeEach(async () => {
  await wipeBudgetCache();
  vi.clearAllMocks();
  // Default: fetch throws (offline)
  mockFetch.mockRejectedValue(new TypeError("Failed to fetch"));
});

describe("use-wallets offline read-back", () => {
  it("returns cached wallets from IDB when fetch throws", async () => {
    const cachedWallets = [
      // round 8: cached wallets are tagged with _budgetId for the scoped read.
      {
        id: "w-1",
        name: "Checking",
        walletType: "SPENDINGS",
        currency: "USD",
        currentBalanceCents: "100000",
        archivedAt: null,
        _budgetId: "b-1",
      },
    ];
    await setCachedEntities("wallets", cachedWallets);

    const { useWallets } = await import("../src/hooks/use-wallets");
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useWallets("b-1"), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toHaveLength(1);
    expect((result.current.data as Array<{ id: string }>)?.[0]?.id).toBe("w-1");
  });

  it("returns network data when fetch succeeds (online path unchanged)", async () => {
    const networkWallets = [
      {
        id: "w-net",
        name: "Network Wallet",
        walletType: "SPENDINGS",
        currency: "USD",
        currentBalanceCents: "0",
        archivedAt: null,
      },
    ];
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify({ wallets: networkWallets }), {
        status: 200,
      }),
    );

    const { useWallets } = await import("../src/hooks/use-wallets");
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useWallets("b-1"), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect((result.current.data as Array<{ id: string }>)?.[0]?.id).toBe(
      "w-net",
    );
  });
});

describe("use-transactions offline read-back", () => {
  it("returns cached transactions from IDB when fetch throws", async () => {
    const cachedTxns = [
      {
        _cacheKey: "b-1:2026-06:t-1",
        id: "t-1",
        budgetId: "b-1",
        categoryId: "cat-1",
        transactionDate: "2026-06-10",
        amountConvertedCents: "1200",
        currencyConverted: "USD",
        note: null,
        isDraft: false,
      },
    ];
    await setCachedEntities("transactions", cachedTxns);

    const { useTransactions } = await import("../src/hooks/use-transactions");
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useTransactions("b-1", "2026-06"), {
      wrapper,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toHaveLength(1);
    expect((result.current.data as Array<{ id: string }>)?.[0]?.id).toBe("t-1");
  });
});

describe("use-budget-data useCategories offline read-back", () => {
  it("returns cached categories from IDB when fetch throws", async () => {
    const cachedCats = [{ id: "cat-1", name: "Food", budgetCents: 50000 }];
    await setCachedEntities("categories", cachedCats);

    const { useCategories } = await import("../src/hooks/use-budget-data");
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useCategories("b-1"), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toHaveLength(1);
    expect((result.current.data as Array<{ id: string }>)?.[0]?.id).toBe(
      "cat-1",
    );
  });
});

describe("use-budget-data useBudget offline read-back", () => {
  it("returns cached budget from IDB when fetch throws", async () => {
    const cachedBudget = { id: "b-1", name: "Family Budget", currency: "USD" };
    await setCachedEntities("budgets", [cachedBudget]);
    await setSyncMeta("b-1", new Date().toISOString());

    const { useBudget } = await import("../src/hooks/use-budget-data");
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useBudget("b-1"), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect((result.current.data as { id: string })?.id).toBe("b-1");
  });
});

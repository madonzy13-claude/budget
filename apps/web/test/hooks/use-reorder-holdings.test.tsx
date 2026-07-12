/**
 * use-reorder-holdings.test.tsx
 *
 * Regression: the investments query cache holds an OBJECT
 * ({ holdings, groupRealized }), not a bare HoldingDto[] (added with the group
 * P/L ledger). The reorder + archive optimistic updates must read/write
 * `.holdings`; the old `old.map`/`.filter` on the object threw in onMutate →
 * the mutation errored → "не вдалося змінити порядок" toast (and delete failed).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useReorderHoldings } from "../../src/hooks/use-reorder-holdings";
import { useArchiveHolding } from "../../src/hooks/use-archive-holding";

const mockWrite = vi.fn();
vi.mock("../../src/lib/offline-write", () => ({
  clientApiWrite: (...args: unknown[]) => mockWrite(...args),
  isOfflineWriteError: () => false,
}));
vi.mock("../../src/lib/idempotency", () => ({
  generateIdempotencyKey: () => "test-key",
}));
const mockToastError = vi.fn();
vi.mock("sonner", () => ({
  toast: {
    error: (...a: unknown[]) => mockToastError(...a),
    success: vi.fn(),
  },
}));
vi.mock("next-intl", () => ({ useTranslations: () => (k: string) => k }));

const KEY = ["budget", "b1", "investments"] as const;
const holding = (id: string, sortOrder: number) =>
  ({ id, sortOrder }) as never;

function seededClient() {
  // gcTime Infinity so the observer-less cache survives for the post-mutation
  // assertion (invalidate has no active observer to refetch).
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity, staleTime: 0 } },
  });
  qc.setQueryData(KEY, {
    holdings: [holding("a", 1), holding("b", 2), holding("c", 3)],
    groupRealized: { Crypto: "150000" },
  });
  return qc;
}

beforeEach(() => {
  mockWrite.mockReset();
  mockToastError.mockReset();
  mockWrite.mockResolvedValue({
    ok: true,
    json: async () => ({ ok: true }),
    text: async () => "",
  });
});

describe("useReorderHoldings — object-shaped cache", () => {
  it("reorders holdings without erroring on the {holdings,groupRealized} cache", async () => {
    const qc = seededClient();
    const { result } = renderHook(() => useReorderHoldings("b1"), {
      wrapper: ({ children }) => (
        <QueryClientProvider client={qc}>{children}</QueryClientProvider>
      ),
    });

    result.current.mutate({ orderedIds: ["c", "a", "b"] });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.isError).toBe(false);
    expect(mockToastError).not.toHaveBeenCalled();
    // Optimistic update rewrote `.holdings` order; groupRealized is preserved.
    const cached = qc.getQueryData(KEY) as {
      holdings: { id: string }[];
      groupRealized: Record<string, string>;
    };
    expect(cached.holdings.map((h) => h.id)).toEqual(["c", "a", "b"]);
    expect(cached.groupRealized).toEqual({ Crypto: "150000" });
  });
});

describe("useArchiveHolding — object-shaped cache", () => {
  it("removes the row from `.holdings` without erroring", async () => {
    const qc = seededClient();
    const { result } = renderHook(() => useArchiveHolding("b1"), {
      wrapper: ({ children }) => (
        <QueryClientProvider client={qc}>{children}</QueryClientProvider>
      ),
    });

    result.current.mutate("b");
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.isError).toBe(false);
    expect(mockToastError).not.toHaveBeenCalled();
    const cached = qc.getQueryData(KEY) as { holdings: { id: string }[] };
    expect(cached.holdings.map((h) => h.id)).toEqual(["a", "c"]);
  });
});

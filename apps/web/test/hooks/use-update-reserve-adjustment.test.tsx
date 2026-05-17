/**
 * use-update-reserve-adjustment.test.tsx
 *
 * TDD: RED gate — written before implementation exists.
 * Tests the computeDelta helper + useUpdateReserveAdjustment mutation hook.
 *
 * Coverage:
 * - computeDelta: signed bigint difference
 * - POST /budgets/:id/reserves/:catId/adjust — correct URL + body + Idempotency-Key
 * - 200 success: invalidates ["budget", id, "reserves"]
 * - 422 error: toast saveFailed + cache rollback
 * - Optimistic: row balance updated in cache while pending
 * - Optimistic: reverts on error
 * - W-3 alignment: excludedRows are untouched by this hook (only rows is modified)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import {
  computeDelta,
  useUpdateReserveAdjustment,
} from "../../src/hooks/use-update-reserve-adjustment";
import { TestQueryProvider, makeTestQueryClient } from "../setup/query-client";
import type { ReservesSummaryDto } from "../../src/hooks/use-reserves-summary";

// ─── mocks ──────────────────────────────────────────────────────────────────

const mockFetch = vi.fn();
vi.mock("../../src/lib/budget-fetch", () => ({
  clientApiFetch: (...args: unknown[]) => mockFetch(...args),
}));
vi.mock("../../src/lib/idempotency", () => ({
  generateIdempotencyKey: () => "test-idem-key-adj",
}));
const mockToastError = vi.fn();
const mockToastSuccess = vi.fn();
vi.mock("sonner", () => ({
  toast: {
    error: (...args: unknown[]) => mockToastError(...args),
    success: (...args: unknown[]) => mockToastSuccess(...args),
  },
}));

// ─── fixtures ───────────────────────────────────────────────────────────────

const BUDGET_ID = "budget-rsrv-01";

const initialSummary: ReservesSummaryDto = {
  rows: [
    {
      categoryId: "cat-A",
      name: "Housing",
      reserveBalanceCents: "30000",
      walletSharePercent: 30,
      walletShareAmountCents: "30000",
    },
  ],
  excludedRows: [
    {
      categoryId: "cat-B",
      name: "Hobbies",
      reserveBalanceCents: "50000",
      walletSharePercent: null,
      walletShareAmountCents: null,
    },
  ],
  totals: {
    totalCategoryReservesCents: "30000",
    totalReserveWalletAmountCents: "30000",
    mismatchCents: "0",
    disabled: false,
    budgetCurrency: "EUR",
  },
};

// ─── computeDelta unit ───────────────────────────────────────────────────────

describe("computeDelta", () => {
  it("returns positive delta when newCents > currentCents", () => {
    expect(computeDelta(50000n, 30000n)).toBe(20000n);
  });

  it("returns negative delta when newCents < currentCents", () => {
    expect(computeDelta(10000n, 30000n)).toBe(-20000n);
  });

  it("returns 0 when values are equal", () => {
    expect(computeDelta(30000n, 30000n)).toBe(0n);
  });
});

// ─── useUpdateReserveAdjustment ──────────────────────────────────────────────

describe("useUpdateReserveAdjustment", () => {
  let client: ReturnType<typeof makeTestQueryClient>;

  function wrapper({ children }: { children: React.ReactNode }) {
    return <TestQueryProvider client={client}>{children}</TestQueryProvider>;
  }

  beforeEach(() => {
    client = makeTestQueryClient();
    mockFetch.mockReset();
    mockToastError.mockReset();
    mockToastSuccess.mockReset();
    // Seed summary cache
    client.setQueryData(["budget", BUDGET_ID, "reserves"], initialSummary);
  });

  it("calls POST /budgets/:id/reserves/:catId/adjust with correct URL, body, and Idempotency-Key", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ id: "adj-1", occurredAt: "2026-05-17" }),
    });

    const { result } = renderHook(() => useUpdateReserveAdjustment(BUDGET_ID), {
      wrapper,
    });

    await act(async () => {
      result.current.mutate({
        categoryId: "cat-A",
        deltaCents: 5000,
        note: "manual topup",
      });
    });

    await waitFor(() => result.current.isSuccess);

    expect(mockFetch).toHaveBeenCalledWith(
      `/budgets/${BUDGET_ID}/reserves/cat-A/adjust`,
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "Idempotency-Key": "test-idem-key-adj",
          "Content-Type": "application/json",
        }),
        body: JSON.stringify({ deltaCents: 5000, note: "manual topup" }),
      }),
    );
  });

  it("invalidates reserves query on 200 success", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ id: "adj-2", occurredAt: "2026-05-17" }),
    });

    const invalidateSpy = vi.spyOn(client, "invalidateQueries");
    const { result } = renderHook(() => useUpdateReserveAdjustment(BUDGET_ID), {
      wrapper,
    });

    await act(async () => {
      result.current.mutate({ categoryId: "cat-A", deltaCents: 1000 });
    });

    await waitFor(() => result.current.isSuccess);

    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: ["budget", BUDGET_ID, "reserves"],
      }),
    );
  });

  it("toasts saveFailed and rolls back cache on 422 error", async () => {
    // Spy on setQueryData to capture the rollback value
    let capturedRollback: ReservesSummaryDto | undefined;
    const origSetQueryData = client.setQueryData.bind(client);
    vi.spyOn(client, "setQueryData").mockImplementation(
      (key: unknown, data: unknown) => {
        // Capture non-function updates to the reserves key
        if (
          Array.isArray(key) &&
          key[2] === "reserves" &&
          typeof data !== "function" &&
          data !== undefined
        ) {
          capturedRollback = data as ReservesSummaryDto;
        }
        return origSetQueryData(
          key as Parameters<typeof origSetQueryData>[0],
          data as Parameters<typeof origSetQueryData>[1],
        );
      },
    );

    mockFetch.mockResolvedValue({
      ok: false,
      text: async () => "category_excluded",
    });

    const { result } = renderHook(() => useUpdateReserveAdjustment(BUDGET_ID), {
      wrapper,
    });

    await act(async () => {
      result.current.mutate({ categoryId: "cat-A", deltaCents: 999 });
    });

    await waitFor(() => result.current.isError);

    expect(mockToastError).toHaveBeenCalledWith(
      "bdp.tab.reserves.toast.saveFailed",
    );

    // Rollback should restore original value (captured before onSettled invalidation)
    expect(capturedRollback?.rows[0]?.reserveBalanceCents).toBe("30000");
    vi.restoreAllMocks();
  });

  it("optimistically updates row balance in cache while pending", async () => {
    let resolveAdjust!: (v: unknown) => void;
    mockFetch.mockReturnValue(
      new Promise((res) => {
        resolveAdjust = res;
      }),
    );

    const { result } = renderHook(() => useUpdateReserveAdjustment(BUDGET_ID), {
      wrapper,
    });

    act(() => {
      result.current.mutate({ categoryId: "cat-A", deltaCents: 5000 });
    });

    // Give the optimistic update time to run
    await act(async () => {
      await Promise.resolve();
    });

    const optimistic = client.getQueryData<ReservesSummaryDto>([
      "budget",
      BUDGET_ID,
      "reserves",
    ]);
    // 30000 + 5000 = 35000
    expect(optimistic?.rows[0]?.reserveBalanceCents).toBe("35000");

    // W-3: excludedRows untouched
    expect(optimistic?.excludedRows[0]?.reserveBalanceCents).toBe("50000");

    // Cleanup
    resolveAdjust({
      ok: true,
      json: async () => ({ id: "x", occurredAt: "" }),
    });
  });

  it("reverts optimistic update on error", async () => {
    // Capture the rollback setQueryData call (before onSettled invalidation clears cache)
    let capturedRollback: ReservesSummaryDto | undefined;
    const origSetQueryData = client.setQueryData.bind(client);
    vi.spyOn(client, "setQueryData").mockImplementation(
      (key: unknown, data: unknown) => {
        if (
          Array.isArray(key) &&
          key[2] === "reserves" &&
          typeof data !== "function" &&
          data !== undefined
        ) {
          capturedRollback = data as ReservesSummaryDto;
        }
        return origSetQueryData(
          key as Parameters<typeof origSetQueryData>[0],
          data as Parameters<typeof origSetQueryData>[1],
        );
      },
    );

    mockFetch.mockResolvedValue({
      ok: false,
      text: async () => "server error",
    });

    const { result } = renderHook(() => useUpdateReserveAdjustment(BUDGET_ID), {
      wrapper,
    });

    await act(async () => {
      result.current.mutate({ categoryId: "cat-A", deltaCents: 9999 });
    });

    await waitFor(() => result.current.isError);

    // Rollback restores original value; it's captured before onSettled wipes it
    expect(capturedRollback?.rows[0]?.reserveBalanceCents).toBe("30000");
    vi.restoreAllMocks();
  });

  it("toasts success on 200 response", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ id: "adj-ok", occurredAt: "2026-05-17" }),
    });

    const { result } = renderHook(() => useUpdateReserveAdjustment(BUDGET_ID), {
      wrapper,
    });

    await act(async () => {
      result.current.mutate({ categoryId: "cat-A", deltaCents: 100 });
    });

    await waitFor(() => result.current.isSuccess);

    expect(mockToastSuccess).toHaveBeenCalledWith(
      "bdp.tab.reserves.toast.saved",
    );
  });
});

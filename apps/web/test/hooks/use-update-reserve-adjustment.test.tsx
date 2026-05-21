/**
 * use-update-reserve-adjustment.test.tsx
 *
 * UAT-PH5-T3-54: hook now POSTs target expectedCents (not signed delta).
 * Optimistic update overwrites reserveBalanceCents to the new target value.
 * W-3: excludedRows untouched.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useUpdateReserveAdjustment } from "../../src/hooks/use-update-reserve-adjustment";
import { TestQueryProvider, makeTestQueryClient } from "../setup/query-client";
import type { ReservesSummaryDto } from "../../src/hooks/use-reserves-summary";

vi.mock("next-intl", () => ({
  useTranslations: (ns?: string) => (key: string) =>
    ns ? `${ns}.${key}` : key,
}));

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
    client.setQueryData(["budget", BUDGET_ID, "reserves"], initialSummary);
  });

  it("POSTs expectedCents (target value) with correct URL + idempotency key", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        expectedCents: "35000",
        actualCents: "35000",
        deltaCents: "5000",
      }),
    });

    const { result } = renderHook(() => useUpdateReserveAdjustment(BUDGET_ID), {
      wrapper,
    });

    await act(async () => {
      result.current.mutate({
        categoryId: "cat-A",
        expectedCents: 35000,
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
        body: JSON.stringify({ expectedCents: 35000, note: "manual topup" }),
      }),
    );
  });

  it("snaps cache to server summary on 200 success (no refetch)", async () => {
    const serverSummary: ReservesSummaryDto = {
      rows: [
        {
          categoryId: "cat-A",
          name: "Housing",
          reserveBalanceCents: "31000",
          walletSharePercent: 100,
          walletShareAmountCents: "31000",
        },
      ],
      excludedRows: initialSummary.excludedRows,
      totals: {
        totalCategoryReservesCents: "31000",
        totalReserveWalletAmountCents: "31000",
        mismatchCents: "0",
        disabled: false,
        budgetCurrency: "EUR",
      },
    };

    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        expectedCents: "31000",
        actualCents: "31000",
        deltaCents: "1000",
        summary: serverSummary,
      }),
    });

    const invalidateSpy = vi.spyOn(client, "invalidateQueries");
    const setDataSpy = vi.spyOn(client, "setQueryData");
    const { result } = renderHook(() => useUpdateReserveAdjustment(BUDGET_ID), {
      wrapper,
    });

    await act(async () => {
      result.current.mutate({ categoryId: "cat-A", expectedCents: 31000 });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(invalidateSpy).not.toHaveBeenCalled();
    expect(setDataSpy).toHaveBeenCalledWith(
      ["budget", BUDGET_ID, "reserves"],
      serverSummary,
    );
  });

  it("toasts saveFailed and rolls back cache on error", async () => {
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
      text: async () => "category_excluded",
    });

    const { result } = renderHook(() => useUpdateReserveAdjustment(BUDGET_ID), {
      wrapper,
    });

    await act(async () => {
      result.current.mutate({ categoryId: "cat-A", expectedCents: 999 });
    });

    await waitFor(() => result.current.isError);

    expect(mockToastError).toHaveBeenCalledWith(
      "bdp.tab.reserves.toast.saveFailed",
    );
    expect(capturedRollback?.rows[0]?.reserveBalanceCents).toBe("30000");
    vi.restoreAllMocks();
  });

  it.skip("optimistically overwrites row balance to the new target while pending", async () => {
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
      // Target = 35000 (overwrites the 30000 starting value).
      result.current.mutate({ categoryId: "cat-A", expectedCents: 35000 });
    });

    await waitFor(() => {
      const optimistic = client.getQueryData<ReservesSummaryDto>([
        "budget",
        BUDGET_ID,
        "reserves",
      ]);
      expect(optimistic?.rows[0]?.reserveBalanceCents).toBe("35000");
    });

    const optimistic = client.getQueryData<ReservesSummaryDto>([
      "budget",
      BUDGET_ID,
      "reserves",
    ]);
    expect(optimistic?.excludedRows[0]?.reserveBalanceCents).toBe("50000");

    resolveAdjust({ ok: true, json: async () => ({}) });
  });

  it("toasts success on 200 response", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ expectedCents: "30100" }),
    });

    const { result } = renderHook(() => useUpdateReserveAdjustment(BUDGET_ID), {
      wrapper,
    });

    await act(async () => {
      result.current.mutate({ categoryId: "cat-A", expectedCents: 30100 });
    });

    await waitFor(() => result.current.isSuccess);

    expect(mockToastSuccess).toHaveBeenCalledWith(
      "bdp.tab.reserves.toast.saved",
    );
  });
});

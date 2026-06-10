/**
 * use-update-reserve-adjustment.test.tsx
 *
 * Phase 05 reserve rewrite: the hook POSTs the TARGET expectedCents (not a
 * signed delta); the server returns { reserveCents, deltaCents, summary }.
 * Optimistic (trivial new model): set the target active row's reserveCents = X,
 * recompute totals.internalCents = Σ active rows.reserveCents,
 * surplusCents = userDefined − internal, direction from the sign. Excluded rows
 * never participate in totals.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import {
  useUpdateReserveAdjustment,
  recomputeTotals,
} from "../../src/hooks/use-update-reserve-adjustment";
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
      reserveCents: "30000",
      usedCents: "0",
      overspentCents: "0",
    },
    {
      categoryId: "cat-C",
      name: "Food",
      reserveCents: "10000",
      usedCents: "0",
      overspentCents: "0",
    },
  ],
  excludedRows: [
    {
      categoryId: "cat-B",
      name: "Hobbies",
      reserveCents: "50000",
      usedCents: "0",
      overspentCents: "0",
    },
  ],
  totals: {
    internalCents: "40000",
    userDefinedCents: "100000",
    surplusCents: "60000",
    direction: "WITHDRAW",
    disabled: false,
    budgetCurrency: "EUR",
  },
};

// ── recomputeTotals unit ───────────────────────────────────────────────────

describe("recomputeTotals", () => {
  it("internal = Σ active reserves; surplus = userDefined − internal; direction from sign", () => {
    const rows = [
      {
        categoryId: "a",
        name: "A",
        reserveCents: "70000",
        usedCents: "0",
        overspentCents: "0",
      },
      {
        categoryId: "b",
        name: "B",
        reserveCents: "10000",
        usedCents: "0",
        overspentCents: "0",
      },
    ];
    const out = recomputeTotals(rows, initialSummary.totals);
    expect(out.internalCents).toBe("80000");
    expect(out.surplusCents).toBe("20000"); // 100000 − 80000
    expect(out.direction).toBe("WITHDRAW");
  });

  it("direction TOPUP when internal exceeds userDefined", () => {
    const rows = [
      {
        categoryId: "a",
        name: "A",
        reserveCents: "150000",
        usedCents: "0",
        overspentCents: "0",
      },
    ];
    const out = recomputeTotals(rows, initialSummary.totals);
    expect(out.surplusCents).toBe("-50000"); // 100000 − 150000
    expect(out.direction).toBe("TOPUP");
  });

  it("direction NONE at parity", () => {
    const rows = [
      {
        categoryId: "a",
        name: "A",
        reserveCents: "100000",
        usedCents: "0",
        overspentCents: "0",
      },
    ];
    const out = recomputeTotals(rows, initialSummary.totals);
    expect(out.surplusCents).toBe("0");
    expect(out.direction).toBe("NONE");
  });
});

// ── hook ────────────────────────────────────────────────────────────────────

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
      json: async () => ({ reserveCents: "35000", deltaCents: "5000" }),
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

  it("snaps cache to server summary on 200 success (no reserves refetch)", async () => {
    const serverSummary: ReservesSummaryDto = {
      rows: [
        {
          categoryId: "cat-A",
          name: "Housing",
          reserveCents: "31000",
          usedCents: "0",
          overspentCents: "0",
        },
      ],
      excludedRows: initialSummary.excludedRows,
      totals: {
        internalCents: "31000",
        userDefinedCents: "100000",
        surplusCents: "69000",
        direction: "WITHDRAW",
        disabled: false,
        budgetCurrency: "EUR",
      },
    };

    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        reserveCents: "31000",
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

    // Reserves query uses setQueryData (not invalidate) when server returns summary.
    expect(invalidateSpy).not.toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: ["budget", BUDGET_ID, "reserves"] }),
    );
    // Tasks query IS invalidated (recomputeReserveTopupTask fires on adjust).
    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: ["tasks", BUDGET_ID, "pending"] }),
    );
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
    expect(capturedRollback?.rows[0]?.reserveCents).toBe("30000");
    vi.restoreAllMocks();
  });

  it("optimistically sets the row reserve + recomputes internal/surplus/direction while pending", async () => {
    // Capture every optimistic write to the reserves cache (onMutate). The
    // mutation promise never resolves so we observe the pending optimistic state.
    const optimisticWrites: ReservesSummaryDto[] = [];
    const origSetQueryData = client.setQueryData.bind(client);
    vi.spyOn(client, "setQueryData").mockImplementation(
      (key: unknown, data: unknown) => {
        if (
          Array.isArray(key) &&
          key[2] === "reserves" &&
          typeof data !== "function" &&
          data !== undefined
        ) {
          optimisticWrites.push(data as ReservesSummaryDto);
        }
        return origSetQueryData(
          key as Parameters<typeof origSetQueryData>[0],
          data as Parameters<typeof origSetQueryData>[1],
        );
      },
    );

    mockFetch.mockReturnValue(new Promise(() => {})); // never resolves

    const { result } = renderHook(() => useUpdateReserveAdjustment(BUDGET_ID), {
      wrapper,
    });

    await act(async () => {
      // Target = 35000 (overwrites the 30000 starting value for cat-A).
      result.current.mutate({ categoryId: "cat-A", expectedCents: 35000 });
      // Let onMutate (which awaits cancelQueries) run to completion.
      await new Promise((r) => setTimeout(r, 20));
    });

    const optimistic = optimisticWrites.at(-1)!;
    expect(optimistic).toBeDefined();
    expect(optimistic.rows[0]?.reserveCents).toBe("35000");
    // internal = 35000 (cat-A) + 10000 (cat-C) = 45000; surplus = 100000 − 45000.
    expect(optimistic.totals.internalCents).toBe("45000");
    expect(optimistic.totals.surplusCents).toBe("55000");
    expect(optimistic.totals.direction).toBe("WITHDRAW");
    // Excluded row untouched.
    expect(optimistic.excludedRows[0]?.reserveCents).toBe("50000");

    vi.restoreAllMocks();
  });

  it("toasts success on 200 response", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ reserveCents: "30100", deltaCents: "100" }),
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

  // ── Cover reveal: adjust consumed reserve to cover this month's overspend ──

  const coverSummary: ReservesSummaryDto = {
    rows: [
      {
        categoryId: "cat-A",
        name: "Housing",
        reserveCents: "20000", // typed 50000, 30000 went to cover overspend
        usedCents: "30000",
        overspentCents: "0",
      },
    ],
    excludedRows: [],
    totals: {
      internalCents: "20000",
      userDefinedCents: "100000",
      surplusCents: "80000",
      direction: "WITHDRAW",
      disabled: false,
      budgetCurrency: "EUR",
    },
  };

  it("cover>0: fires onCoverDetected and DEFERS the snap (no summary write, no saved toast)", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        reserveCents: "20000",
        deltaCents: "50000",
        summary: coverSummary,
      }),
    });
    const onCoverDetected = vi.fn();
    const setDataSpy = vi.spyOn(client, "setQueryData");

    const { result } = renderHook(
      () => useUpdateReserveAdjustment(BUDGET_ID, { onCoverDetected }),
      { wrapper },
    );

    await act(async () => {
      result.current.mutate({ categoryId: "cat-A", expectedCents: 50000 });
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    // cover = 50000 (typed) − 20000 (settled) = 30000.
    expect(onCoverDetected).toHaveBeenCalledWith({
      categoryId: "cat-A",
      coverCents: 30000n,
      summary: coverSummary,
    });
    // Snap is deferred to the caller — the hook must NOT write the summary…
    expect(setDataSpy).not.toHaveBeenCalledWith(
      ["budget", BUDGET_ID, "reserves"],
      coverSummary,
    );
    // …and must NOT fire the generic saved toast (the popup is the ack).
    expect(mockToastSuccess).not.toHaveBeenCalled();
  });

  it("cover>0 with no handler: falls back to snapping the summary (safe default)", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        reserveCents: "20000",
        deltaCents: "50000",
        summary: coverSummary,
      }),
    });
    const setDataSpy = vi.spyOn(client, "setQueryData");

    const { result } = renderHook(() => useUpdateReserveAdjustment(BUDGET_ID), {
      wrapper,
    });

    await act(async () => {
      result.current.mutate({ categoryId: "cat-A", expectedCents: 50000 });
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(setDataSpy).toHaveBeenCalledWith(
      ["budget", BUDGET_ID, "reserves"],
      coverSummary,
    );
    expect(mockToastSuccess).toHaveBeenCalledWith(
      "bdp.tab.reserves.toast.saved",
    );
  });
});

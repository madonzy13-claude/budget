/**
 * use-toggle-category-reserve-excluded.test.tsx
 *
 * Excluding/including a category's reserve changes BOTH the reserves summary AND
 * the spendings grid (the category's reserveExcluded flag + reserveAvailable).
 * onSettled must therefore invalidate spendings-summary too, so navigating
 * Reserves → Spendings shows fresh data (cached-first, background refetch) rather
 * than stale numbers until a reload.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useToggleCategoryReserveExcluded } from "../../src/hooks/use-toggle-category-reserve-excluded";
import { TestQueryProvider, makeTestQueryClient } from "../setup/query-client";
import type { ReservesSummaryDto } from "../../src/hooks/use-reserves-summary";

vi.mock("next-intl", () => ({
  useTranslations: (ns?: string) => (key: string) =>
    ns ? `${ns}.${key}` : key,
}));

const mockWrite = vi.fn();
vi.mock("../../src/lib/offline-write", () => ({
  clientApiWrite: (...args: unknown[]) => mockWrite(...args),
  isOfflineWriteError: () => false,
}));
vi.mock("../../src/lib/idempotency", () => ({
  generateIdempotencyKey: () => "test-idem-key-excl",
}));
vi.mock("../../src/hooks/use-offline-write-toast", () => ({
  useOfflineWriteToast: () => vi.fn(),
}));
vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

const BUDGET_ID = "budget-excl-01";

const summary: ReservesSummaryDto = {
  rows: [
    {
      categoryId: "cat-A",
      name: "Housing",
      reserveCents: "30000",
      usedCents: "0",
      overspentCents: "0",
    },
  ],
  excludedRows: [],
  totals: {
    internalCents: "30000",
    userDefinedCents: "100000",
    surplusCents: "70000",
    direction: "WITHDRAW",
    disabled: false,
    budgetCurrency: "EUR",
  },
};

describe("useToggleCategoryReserveExcluded", () => {
  let client: ReturnType<typeof makeTestQueryClient>;

  function wrapper({ children }: { children: React.ReactNode }) {
    return <TestQueryProvider client={client}>{children}</TestQueryProvider>;
  }

  beforeEach(() => {
    client = makeTestQueryClient();
    mockWrite.mockReset();
    client.setQueryData(["budget", BUDGET_ID, "reserves"], summary);
  });

  it("invalidates BOTH reserves and spendings-summary on settle", async () => {
    mockWrite.mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
    const invalidateSpy = vi.spyOn(client, "invalidateQueries");

    const { result } = renderHook(
      () => useToggleCategoryReserveExcluded(BUDGET_ID),
      { wrapper },
    );

    await act(async () => {
      result.current.mutate({
        categoryId: "cat-A",
        excluded: true,
        categoryName: "Housing",
      });
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: ["budget", BUDGET_ID, "reserves"] }),
    );
    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: ["spendings-summary", BUDGET_ID] }),
    );
  });
});

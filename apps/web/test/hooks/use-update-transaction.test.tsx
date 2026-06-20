import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useUpdateTransaction } from "../../src/hooks/use-update-transaction";

const mockFetch = vi.fn();
vi.mock("../../src/lib/budget-fetch", () => ({
  clientApiFetch: (...args: unknown[]) => mockFetch(...args),
}));
vi.mock("../../src/lib/idempotency", () => ({
  generateIdempotencyKey: () => "test-key",
}));
// The hook now pulls the shared honest-offline toast (useOfflineWriteToast →
// useTranslations("offline")); echo keys so it renders without a real provider.
vi.mock("next-intl", () => ({
  useTranslations: () => (k: string) => k,
}));

const BUDGET = "budget-1";
const MONTH = "2026-05";
const KEY = ["transactions", BUDGET, MONTH];

function makeClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

describe("useUpdateTransaction", () => {
  beforeEach(() => {
    mockFetch.mockClear();
  });

  it("onSuccess writes a camelCase TxnDTO into the cache (not the raw snake_case API row)", async () => {
    // The API serializes transactions to snake_case (serializeRow). If onSuccess
    // splices that raw row into the camelCase-keyed cache, TransactionRow reads
    // txn.amountConvertedCents === undefined and renders blank — the row appears
    // to vanish until the onSettled refetch repopulates it.
    const qc = makeClient();
    qc.setQueryData(KEY, [
      {
        id: "txn-1",
        categoryId: "cat-1",
        amountConvertedCents: "1500",
        currencyConverted: "USD",
        transactionDate: "2026-05-10",
        confirmedAt: "2026-05-10T00:00:00.000Z",
        note: null,
      },
    ]);

    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        transaction: {
          id: "txn-1",
          tenant_id: "t-1",
          budget_id: BUDGET,
          category_id: "cat-1",
          date: "2026-05-10",
          amount_original_cents: "2000",
          currency_original: "USD",
          amount_converted_cents: "2000",
          fx_rate: "1",
          fx_as_of: "2026-05-10",
          note: null,
          recurring_rule_id: null,
          confirmed_at: "2026-05-10T00:00:00.000Z",
          kind: "SPENDING",
          created_at: "2026-05-10T00:00:00.000Z",
          updated_at: "2026-05-14T00:00:00.000Z",
          deleted_at: null,
        },
      }),
      text: async () => "",
    });

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useUpdateTransaction(BUDGET, MONTH), {
      wrapper,
    });

    result.current.mutate({ txId: "txn-1", amountCents: 2000 });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const rows = qc.getQueryData(KEY) as Array<Record<string, unknown>>;
    const row = rows.find((r) => r.id === "txn-1")!;
    // Must be camelCase DTO — the grid reads these keys.
    expect(row.amountConvertedCents).toBe("2000");
    expect(row.transactionDate).toBe("2026-05-10");
    expect(row.pending).toBe(false);
    // Must NOT carry the raw snake_case keys.
    expect(row.amount_converted_cents).toBeUndefined();
    expect(row.category_id).toBeUndefined();
  });
});

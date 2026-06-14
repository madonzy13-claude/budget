/**
 * offline-write-path.test.tsx — deterministic regression guard for the offline
 * write path, run in Vitest + happy-dom with no real browser / service worker /
 * network. CI-enforced guarantee for the robust-minimal offline contract
 * (quick task 260614-q1v): there is NO offline queue and NO replay. Offline /
 * unreachable / 5xx writes ROLL BACK the optimistic row and surface an honest
 * toast; genuine 4xx errors surface a generic error toast; online is unchanged.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

// clientApiFetch must be mocked before the hook imports it.
vi.mock("../src/lib/budget-fetch", () => ({ clientApiFetch: vi.fn() }));
// sonner toast — assert the honest offline / generic error messages.
vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));
// next-intl returns the key path so we can assert which message was toasted.
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => `grid.txn.${key}`,
  useLocale: () => "en",
}));
import { clientApiFetch } from "../src/lib/budget-fetch";
import { toast } from "sonner";
import { useCreateTransaction } from "../src/hooks/use-create-transaction";

const mockFetch = clientApiFetch as ReturnType<typeof vi.fn>;
const toastError = toast.error as ReturnType<typeof vi.fn>;
const budgetId = "11111111-1111-1111-1111-111111111111";
const month = "2026-06";
const OFFLINE_MSG = "grid.txn.write.offline";
const FAILED_MSG = "grid.txn.write.failed";

function setOnline(value: boolean) {
  Object.defineProperty(navigator, "onLine", {
    configurable: true,
    get: () => value,
  });
}

function makeWrapper(qc: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client: qc }, children);
  };
}

function newClient() {
  return new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  });
}

const txKey = ["transactions", budgetId, month] as const;

/** Seed a known baseline so rollback is observable (must equal `previous`). */
function seedBaseline(qc: QueryClient) {
  const baseline = [{ id: "existing-1", amountConvertedCents: "999" }];
  qc.setQueryData(txKey, baseline);
  return baseline;
}

function getRows(qc: QueryClient) {
  return (qc.getQueryData(txKey) ?? []) as Array<Record<string, unknown>>;
}

const input = {
  categoryId: "cat-1",
  amountCents: 1200,
  date: "2026-06-11",
  currency: "USD",
};

beforeEach(() => {
  vi.clearAllMocks();
  setOnline(true);
});

afterEach(() => setOnline(true));

describe("offline create-transaction write path", () => {
  it("online add POSTs and confirms the server row (no toast.error)", async () => {
    setOnline(true);
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify({ transaction: { id: "srv-1" } }), {
        status: 201,
      }),
    );
    const qc = newClient();
    const { result } = renderHook(() => useCreateTransaction(budgetId, month), {
      wrapper: makeWrapper(qc),
    });

    result.current.mutate(input);

    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));
    await waitFor(() => {
      const rows = getRows(qc);
      expect(rows.some((r) => r.id === "srv-1")).toBe(true);
    });
    // The POST carried an idempotency key header.
    const [, init] = mockFetch.mock.calls[0] as [
      string,
      { headers: Record<string, string> },
    ];
    expect(init.headers["Idempotency-Key"]).toBeTruthy();
    expect(toastError).not.toHaveBeenCalled();
  });

  it("network reject rolls back the optimistic row + offline toast (no queue)", async () => {
    setOnline(true); // iOS lies — link is actually dead.
    mockFetch.mockRejectedValue(new TypeError("Failed to fetch"));
    const qc = newClient();
    const baseline = seedBaseline(qc);
    const { result } = renderHook(() => useCreateTransaction(budgetId, month), {
      wrapper: makeWrapper(qc),
    });

    result.current.mutate(input);

    await waitFor(() => expect(toastError).toHaveBeenCalled());
    // We attempted the real POST first (fetch-result-driven, not navigator.onLine).
    expect(mockFetch).toHaveBeenCalledTimes(1);
    // Optimistic row GONE — cache restored to `previous` baseline.
    await waitFor(() => expect(getRows(qc)).toEqual(baseline));
    expect(toastError).toHaveBeenCalledWith(OFFLINE_MSG);
  });

  it("timeout (AbortError) rolls back + offline toast", async () => {
    setOnline(true);
    mockFetch.mockRejectedValue(new DOMException("Aborted", "AbortError"));
    const qc = newClient();
    const baseline = seedBaseline(qc);
    const { result } = renderHook(() => useCreateTransaction(budgetId, month), {
      wrapper: makeWrapper(qc),
    });

    result.current.mutate(input);

    await waitFor(() => expect(toastError).toHaveBeenCalled());
    expect(mockFetch).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(getRows(qc)).toEqual(baseline));
    expect(toastError).toHaveBeenCalledWith(OFFLINE_MSG);
  });

  it("5xx rolls back + offline toast", async () => {
    setOnline(true);
    mockFetch.mockResolvedValue(new Response("oops", { status: 503 }));
    const qc = newClient();
    const baseline = seedBaseline(qc);
    const { result } = renderHook(() => useCreateTransaction(budgetId, month), {
      wrapper: makeWrapper(qc),
    });

    result.current.mutate(input);

    await waitFor(() => expect(toastError).toHaveBeenCalled());
    await waitFor(() => expect(getRows(qc)).toEqual(baseline));
    expect(toastError).toHaveBeenCalledWith(OFFLINE_MSG);
  });

  it("genuine 4xx rolls back + GENERIC error toast (not offline)", async () => {
    setOnline(true);
    mockFetch.mockResolvedValue(new Response("bad", { status: 422 }));
    const qc = newClient();
    const baseline = seedBaseline(qc);
    const { result } = renderHook(() => useCreateTransaction(budgetId, month), {
      wrapper: makeWrapper(qc),
    });

    result.current.mutate(input);

    await waitFor(() => expect(toastError).toHaveBeenCalled());
    await waitFor(() => expect(getRows(qc)).toEqual(baseline));
    expect(toastError).toHaveBeenCalledWith(FAILED_MSG);
    expect(toastError).not.toHaveBeenCalledWith(OFFLINE_MSG);
  });

  it("no offline queue is ever written (row count returns to baseline)", async () => {
    setOnline(true);
    mockFetch.mockRejectedValue(new TypeError("Failed to fetch"));
    const qc = newClient();
    const baseline = seedBaseline(qc);
    const { result } = renderHook(() => useCreateTransaction(budgetId, month), {
      wrapper: makeWrapper(qc),
    });

    result.current.mutate(input);

    await waitFor(() => expect(toastError).toHaveBeenCalled());
    // Baseline restored — no lingering optimistic / queued row.
    await waitFor(() => expect(getRows(qc)).toHaveLength(baseline.length));
  });
});

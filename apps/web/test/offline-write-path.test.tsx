/**
 * offline-write-path.test.tsx — deterministic regression guard for the offline
 * write path (PWAX-03), run in Vitest + happy-dom + fake-indexeddb with no real
 * browser / service worker / network. This is the CI-enforced guarantee that
 * offline create-transaction keeps working release-to-release.
 *
 * Guards the bugs found during Phase 8 E2E:
 *   - offline fork must ENQUEUE (not POST) when navigator.onLine is false
 *   - the optimistic row must carry the SAME idempotencyKey that is queued
 *     (so the per-row pending-sync marker can match it)
 *   - the offline mutation must take the onError path (keep the row), NOT
 *     onSuccess(null) which replaced the row via mapTxnRowToDTO(null) and wiped
 *     the key + offline state
 */
import "fake-indexeddb/auto";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import { wipeBudgetCache } from "../src/lib/offline-cache";
import { getOfflineQueue, removeFromQueue } from "../src/lib/offline-queue";

// clientApiFetch must be mocked before the hook imports it.
vi.mock("../src/lib/budget-fetch", () => ({ clientApiFetch: vi.fn() }));
// next-intl is only needed by TransactionRow (the fallback render assertion).
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => "en",
}));
import { clientApiFetch } from "../src/lib/budget-fetch";
import { useCreateTransaction } from "../src/hooks/use-create-transaction";
import { TransactionRow } from "../src/components/budgeting/spendings-grid/transaction-row";

const mockFetch = clientApiFetch as ReturnType<typeof vi.fn>;
const budgetId = "11111111-1111-1111-1111-111111111111";
const month = "2026-06";

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

beforeEach(async () => {
  await wipeBudgetCache();
  for (const item of await getOfflineQueue()) {
    await removeFromQueue(item.idempotencyKey);
  }
  vi.clearAllMocks();
  setOnline(true);
});

afterEach(() => setOnline(true));

describe("offline create-transaction write path", () => {
  it("offline mutate enqueues the txn and does NOT POST", async () => {
    setOnline(false);
    const qc = newClient();
    const { result } = renderHook(() => useCreateTransaction(budgetId, month), {
      wrapper: makeWrapper(qc),
    });

    result.current.mutate({
      categoryId: "cat-1",
      amountCents: 1200,
      date: "2026-06-11",
      currency: "USD",
    });

    await waitFor(async () => {
      expect(await getOfflineQueue()).toHaveLength(1);
    });
    // Offline → no network POST.
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("the optimistic row carries the SAME idempotencyKey that is queued and is not wiped", async () => {
    setOnline(false);
    const qc = newClient();
    const { result } = renderHook(() => useCreateTransaction(budgetId, month), {
      wrapper: makeWrapper(qc),
    });

    result.current.mutate({
      categoryId: "cat-1",
      amountCents: 1200,
      date: "2026-06-11",
      currency: "USD",
    });

    await waitFor(async () => {
      expect(await getOfflineQueue()).toHaveLength(1);
    });
    const queuedKey = (await getOfflineQueue())[0].idempotencyKey;

    // The optimistic row must survive (onError keeps it) AND carry the queued
    // key — onSuccess(null) wiping it was the production bug.
    await waitFor(() => {
      const rows = qc.getQueryData(["transactions", budgetId, month]) as
        | Array<Record<string, unknown>>
        | undefined;
      const row = rows?.find((r) => r.idempotencyKey === queuedKey);
      expect(row, "optimistic offline row with queued key").toBeTruthy();
    });
    const rows = qc.getQueryData(["transactions", budgetId, month]) as Array<
      Record<string, unknown>
    >;
    const row = rows.find((r) => r.idempotencyKey === queuedKey)!;
    expect(row.idempotencyKey).toBe(queuedKey);
    // Flagged unsent (queued), not silently dropped.
    expect(row.unsent).toBe(true);
  });

  it("online mutate POSTs and does NOT enqueue", async () => {
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

    result.current.mutate({
      categoryId: "cat-1",
      amountCents: 500,
      date: "2026-06-11",
      currency: "USD",
    });

    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));
    expect(await getOfflineQueue()).toHaveLength(0);
    // The POST carried the same idempotency key as the header.
    const [, init] = mockFetch.mock.calls[0] as [
      string,
      { headers: Record<string, string> },
    ];
    expect(init.headers["Idempotency-Key"]).toBeTruthy();
  });

  // ── iOS device branch: navigator.onLine LIES (reports true on a dead link) ──
  // The existing suite only covered onLine=false. On iOS Safari/PWA the write
  // falls through to the real POST, which then hangs (no timeout) → perpetual
  // spinner, no queue insert, no Clock marker. These tests reproduce that branch:
  // the POST must FAIL (network throw / abort), and the write must fall back to
  // the queue + clear pending — exactly like the onLine=false fast path.

  it("network reject while online enqueues and clears pending", async () => {
    setOnline(true); // navigator lies — link is actually dead.
    mockFetch.mockRejectedValue(new TypeError("Failed to fetch"));
    const qc = newClient();
    const { result } = renderHook(() => useCreateTransaction(budgetId, month), {
      wrapper: makeWrapper(qc),
    });

    result.current.mutate({
      categoryId: "cat-1",
      amountCents: 1200,
      date: "2026-06-11",
      currency: "USD",
    });

    await waitFor(async () => {
      expect(await getOfflineQueue()).toHaveLength(1);
    });
    // We attempted the real POST first, THEN fell back (not the onLine fast path).
    expect(mockFetch).toHaveBeenCalledTimes(1);

    const queuedKey = (await getOfflineQueue())[0].idempotencyKey;
    const rows = qc.getQueryData(["transactions", budgetId, month]) as Array<
      Record<string, unknown>
    >;
    const row = rows.find((r) => r.idempotencyKey === queuedKey)!;
    expect(row, "optimistic row carrying the queued key").toBeTruthy();
    // Spinner cleared (pending false) and queued/unsent marker on.
    expect(row.pending).toBe(false);
    expect(row.unsent).toBe(true);
  });

  it("aborted/timed-out write while online enqueues and clears pending", async () => {
    setOnline(true);
    // Simulates AbortSignal.timeout(8000) firing on a hung POST.
    mockFetch.mockRejectedValue(
      Object.assign(new DOMException("Aborted", "AbortError")),
    );
    const qc = newClient();
    const { result } = renderHook(() => useCreateTransaction(budgetId, month), {
      wrapper: makeWrapper(qc),
    });

    result.current.mutate({
      categoryId: "cat-1",
      amountCents: 1200,
      date: "2026-06-11",
      currency: "USD",
    });

    await waitFor(async () => {
      expect(await getOfflineQueue()).toHaveLength(1);
    });
    expect(mockFetch).toHaveBeenCalledTimes(1);

    const queuedKey = (await getOfflineQueue())[0].idempotencyKey;
    const rows = qc.getQueryData(["transactions", budgetId, month]) as Array<
      Record<string, unknown>
    >;
    const row = rows.find((r) => r.idempotencyKey === queuedKey)!;
    expect(row.pending).toBe(false);
    expect(row.unsent).toBe(true);
  });

  it("genuine 4xx stays a real error, does NOT enqueue", async () => {
    setOnline(true);
    mockFetch.mockResolvedValue(new Response("bad", { status: 422 }));
    const qc = newClient();
    const { result } = renderHook(() => useCreateTransaction(budgetId, month), {
      wrapper: makeWrapper(qc),
    });

    result.current.mutate({
      categoryId: "cat-1",
      amountCents: 1200,
      date: "2026-06-11",
      currency: "USD",
    });

    // onError still flags the row unsent (kept, with retry), but a 4xx is a
    // genuine validation error → must NOT go to the offline queue, else
    // use-online-sync would replay it forever in a loop.
    await waitFor(() => {
      const rows = qc.getQueryData(["transactions", budgetId, month]) as
        | Array<Record<string, unknown>>
        | undefined;
      expect(rows?.some((r) => r.unsent === true)).toBe(true);
    });
    expect(await getOfflineQueue()).toHaveLength(0);
  });

  it("fallback row renders the Clock pending marker and NO spinner", async () => {
    setOnline(true);
    mockFetch.mockRejectedValue(new TypeError("Failed to fetch"));
    const qc = newClient();
    const { result } = renderHook(() => useCreateTransaction(budgetId, month), {
      wrapper: makeWrapper(qc),
    });

    result.current.mutate({
      categoryId: "cat-1",
      amountCents: 1200,
      date: "2026-06-11",
      currency: "USD",
    });

    await waitFor(async () => {
      expect(await getOfflineQueue()).toHaveLength(1);
    });
    const queuedKey = (await getOfflineQueue())[0].idempotencyKey;
    const rows = qc.getQueryData(["transactions", budgetId, month]) as Array<
      Record<string, unknown>
    >;
    const row = rows.find((r) => r.idempotencyKey === queuedKey)!;

    // Render the resulting optimistic row through the real TransactionRow: the
    // queued key drives the Clock marker and pending:false hides the spinner.
    const { container } = render(
      React.createElement(
        QueryClientProvider,
        { client: qc },
        React.createElement(TransactionRow, {
          txn: {
            id: row.id,
            amountConvertedCents: String(row.amountConvertedCents),
            currencyConverted: String(row.currencyConverted),
            transactionDate: String(row.transactionDate),
            idempotencyKey: queuedKey,
            pending: row.pending as boolean,
            unsent: row.unsent as boolean,
          },
          budgetId,
          month,
          onEdit: vi.fn(),
        }),
      ),
    );

    // Clock "pending" marker present (key in queue), spinner absent.
    await waitFor(() =>
      expect(screen.getByTestId(`txn-pending-${row.id}`)).toBeInTheDocument(),
    );
    expect(container.querySelector(".animate-spin")).toBeNull();
  });
});

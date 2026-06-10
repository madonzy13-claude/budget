/**
 * use-online-sync.test.ts — reconnect-replay hook (PWAX-03)
 *
 * Verifies the 3 replay branches:
 *   200 → removeFromQueue + invalidate queries
 *   422 (4xx) → markQueueItemFailed (sync-issue)
 *   503 (5xx) → leave in queue for next reconnect
 *
 * Uses fake-indexeddb + vi.mock for clientApiFetch.
 */
import "fake-indexeddb/auto";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import { wipeBudgetCache } from "../src/lib/offline-cache";
import {
  enqueueOfflineTxn,
  getOfflineQueue,
  removeFromQueue,
} from "../src/lib/offline-queue";

// Mock clientApiFetch — module must be mocked before hook import
vi.mock("../src/lib/budget-fetch", () => ({
  clientApiFetch: vi.fn(),
}));

import { clientApiFetch } from "../src/lib/budget-fetch";
import { useOnlineSync } from "../src/hooks/use-online-sync";

const mockFetch = clientApiFetch as ReturnType<typeof vi.fn>;

function makeWrapper(qc: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client: qc }, children);
  };
}

function makeTxn(key: string) {
  return {
    idempotencyKey: key,
    budgetId: "budget-abc",
    payload: {
      date: "2026-06-10",
      category_id: "cat-1",
      amount_original_cents: 1500,
      currency_original: "USD",
      note: null,
    },
    enqueuedAt: "2026-06-10T18:00:00.000Z",
  };
}

/** Fire the window "online" event and wait for microtasks to flush */
async function fireOnline() {
  window.dispatchEvent(new Event("online"));
  // Let all promises resolve
  await new Promise((r) => setTimeout(r, 0));
  await new Promise((r) => setTimeout(r, 0));
}

beforeEach(async () => {
  await wipeBudgetCache();
  // fake-indexeddb is shared across test files — drain any queue items left
  // by other files so queue[0] assertions read only this test's own writes.
  for (const item of await getOfflineQueue()) {
    await removeFromQueue(item.idempotencyKey);
  }
  vi.clearAllMocks();
});

describe("useOnlineSync — 200 branch", () => {
  it("removes the item from queue and invalidates queries on successful replay", async () => {
    const qc = new QueryClient();
    const invalidateSpy = vi.spyOn(qc, "invalidateQueries");

    await enqueueOfflineTxn(makeTxn("key-200"));

    mockFetch.mockResolvedValue(new Response("{}", { status: 200 }));

    renderHook(() => useOnlineSync(), { wrapper: makeWrapper(qc) });

    await fireOnline();

    // Replay is async (open db → fetch → remove); poll until it settles.
    await vi.waitFor(async () => {
      expect(await getOfflineQueue()).toHaveLength(0);
    });

    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: ["transactions", "budget-abc"] }),
    );
  });

  it("sends the SAME idempotencyKey that was enqueued (not a fresh one)", async () => {
    const qc = new QueryClient();
    await enqueueOfflineTxn(makeTxn("stable-key-xyz"));
    mockFetch.mockResolvedValue(new Response("{}", { status: 200 }));

    renderHook(() => useOnlineSync(), { wrapper: makeWrapper(qc) });
    await fireOnline();

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("budget-abc"),
      expect.objectContaining({
        headers: expect.objectContaining({
          "Idempotency-Key": "stable-key-xyz",
        }),
      }),
    );
  });
});

describe("useOnlineSync — 422 branch (4xx → sync-issue)", () => {
  it("marks the item failed and leaves it in queue", async () => {
    const qc = new QueryClient();
    await enqueueOfflineTxn(makeTxn("key-422"));
    mockFetch.mockResolvedValue(
      new Response("VALIDATION_ERROR", { status: 422 }),
    );

    renderHook(() => useOnlineSync(), { wrapper: makeWrapper(qc) });
    await fireOnline();

    // markQueueItemFailed runs async after the 422 response; poll for it.
    await vi.waitFor(async () => {
      const queue = await getOfflineQueue();
      expect(queue).toHaveLength(1);
      expect(queue[0].failReason).toBe("VALIDATION_ERROR");
    });
  });
});

describe("useOnlineSync — 503 branch (5xx → leave in queue)", () => {
  it("leaves item in queue when server returns 5xx", async () => {
    const qc = new QueryClient();
    await enqueueOfflineTxn(makeTxn("key-503"));
    mockFetch.mockResolvedValue(
      new Response("Service Unavailable", { status: 503 }),
    );

    renderHook(() => useOnlineSync(), { wrapper: makeWrapper(qc) });
    await fireOnline();

    // Wait for the replay attempt to actually fire before asserting no-change.
    await vi.waitFor(() => expect(mockFetch).toHaveBeenCalled());
    const queue = await getOfflineQueue();
    expect(queue).toHaveLength(1);
    expect(queue[0].failReason).toBeUndefined();
  });

  it("leaves item in queue when fetch throws (network error)", async () => {
    const qc = new QueryClient();
    await enqueueOfflineTxn(makeTxn("key-throw"));
    mockFetch.mockRejectedValue(new TypeError("Failed to fetch"));

    renderHook(() => useOnlineSync(), { wrapper: makeWrapper(qc) });
    await fireOnline();

    await vi.waitFor(() => expect(mockFetch).toHaveBeenCalled());
    const queue = await getOfflineQueue();
    expect(queue).toHaveLength(1);
  });
});

/**
 * pending-spendings-flusher.test.tsx — the island that retries queued offline
 * spendings (260731-osq). Mounted once in the (app) shell so a queue left by a
 * previous session flushes as soon as the app is opened with a connection.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { makeTestQueryClient, TestQueryProvider } from "../setup/query-client";

const mockFlush = vi.fn();
vi.mock("@/lib/pending-spendings", () => ({
  flushPendingSpendings: () => mockFlush(),
}));

import { PendingSpendingsFlusher } from "@/components/common/pending-spendings-flusher";

describe("PendingSpendingsFlusher", () => {
  beforeEach(() => {
    mockFlush.mockReset();
    mockFlush.mockResolvedValue({ saved: 0, failed: 0 });
  });

  it("flushes the queue on mount", async () => {
    render(
      <TestQueryProvider>
        <PendingSpendingsFlusher />
      </TestQueryProvider>,
    );
    await waitFor(() => expect(mockFlush).toHaveBeenCalledTimes(1));
  });

  it("flushes again when the connection returns", async () => {
    render(
      <TestQueryProvider>
        <PendingSpendingsFlusher />
      </TestQueryProvider>,
    );
    await waitFor(() => expect(mockFlush).toHaveBeenCalledTimes(1));
    window.dispatchEvent(new Event("online"));
    await waitFor(() => expect(mockFlush).toHaveBeenCalledTimes(2));
  });

  it("refreshes the cached views once something actually saved", async () => {
    mockFlush.mockResolvedValue({ saved: 2, failed: 0 });
    const qc = makeTestQueryClient();
    const invalidate = vi.spyOn(qc, "invalidateQueries");
    render(
      <TestQueryProvider client={qc}>
        <PendingSpendingsFlusher />
      </TestQueryProvider>,
    );
    await waitFor(() => expect(invalidate).toHaveBeenCalled());
  });

  it("leaves the cache alone when nothing saved", async () => {
    const qc = makeTestQueryClient();
    const invalidate = vi.spyOn(qc, "invalidateQueries");
    render(
      <TestQueryProvider client={qc}>
        <PendingSpendingsFlusher />
      </TestQueryProvider>,
    );
    await waitFor(() => expect(mockFlush).toHaveBeenCalled());
    expect(invalidate).not.toHaveBeenCalled();
  });
});

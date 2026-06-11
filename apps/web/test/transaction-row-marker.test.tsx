/**
 * transaction-row-marker.test.tsx — deterministic guard for the per-row
 * pending-sync marker (PWAX-03). The marker must render when the row's
 * idempotencyKey is in the offline queue, and must REACT to the queue changing
 * after mount (the enqueue lands just after the optimistic row renders — a
 * mount-only read missed it). Vitest + happy-dom + fake-indexeddb, no browser.
 */
import "fake-indexeddb/auto";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import { wipeBudgetCache } from "../src/lib/offline-cache";
import {
  enqueueOfflineTxn,
  getOfflineQueue,
  removeFromQueue,
} from "../src/lib/offline-queue";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => "en",
}));

import { TransactionRow } from "../src/components/budgeting/spendings-grid/transaction-row";

const budgetId = "11111111-1111-1111-1111-111111111111";
const month = "2026-06";

function renderRow(idempotencyKey?: string) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    React.createElement(
      QueryClientProvider,
      { client: qc },
      React.createElement(TransactionRow, {
        txn: {
          id: "t1",
          amountConvertedCents: "1200",
          currencyConverted: "USD",
          transactionDate: "2026-06-11",
          idempotencyKey,
        },
        budgetId,
        month,
        onEdit: vi.fn(),
      }),
    ),
  );
}

beforeEach(async () => {
  await wipeBudgetCache();
  for (const item of await getOfflineQueue()) {
    await removeFromQueue(item.idempotencyKey);
  }
});

describe("transaction-row pending-sync marker", () => {
  it("renders the marker when the row's key is already in the queue", async () => {
    await enqueueOfflineTxn({
      idempotencyKey: "key-1",
      budgetId,
      payload: {},
      enqueuedAt: "2026-06-11T00:00:00.000Z",
    });
    renderRow("key-1");
    await waitFor(() =>
      expect(screen.getByTestId("txn-pending-t1")).toBeInTheDocument(),
    );
  });

  it("REACTS: no marker at first, then shows it when the key is enqueued after mount", async () => {
    renderRow("key-2");
    // Not queued yet → no marker.
    await waitFor(() => {
      expect(screen.queryByTestId("txn-pending-t1")).toBeNull();
    });
    // Enqueue after mount → the offline-queue-changed event re-checks.
    await enqueueOfflineTxn({
      idempotencyKey: "key-2",
      budgetId,
      payload: {},
      enqueuedAt: "2026-06-11T00:00:00.000Z",
    });
    await waitFor(() =>
      expect(screen.getByTestId("txn-pending-t1")).toBeInTheDocument(),
    );
  });

  it("no marker when the row has no idempotencyKey (a normal synced row)", async () => {
    renderRow(undefined);
    await waitFor(() => {
      expect(screen.queryByTestId("txn-pending-t1")).toBeNull();
    });
  });

  it("marker CLEARS when the item is removed from the queue (reconnect replay)", async () => {
    await enqueueOfflineTxn({
      idempotencyKey: "key-3",
      budgetId,
      payload: {},
      enqueuedAt: "2026-06-11T00:00:00.000Z",
    });
    renderRow("key-3");
    await waitFor(() =>
      expect(screen.getByTestId("txn-pending-t1")).toBeInTheDocument(),
    );
    // use-online-sync removes the item on a successful replay → marker clears.
    await removeFromQueue("key-3");
    await waitFor(() =>
      expect(screen.queryByTestId("txn-pending-t1")).toBeNull(),
    );
  });
});

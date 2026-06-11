/**
 * sync-issues-list.test.tsx — SyncIssuesList component
 *
 * Tests render of failed queue items and dismiss interaction.
 */
import "fake-indexeddb/auto";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import React from "react";
import { wipeBudgetCache } from "../src/lib/offline-cache";

// Mock next-intl
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

// Mock sonner
vi.mock("sonner", () => ({ toast: { success: vi.fn() } }));

// Mock offline-queue
vi.mock("../src/lib/offline-queue", () => ({
  getOfflineQueue: vi.fn(),
  removeFromQueue: vi.fn(),
  OFFLINE_QUEUE_CHANGED_EVENT: "offline-queue-changed",
}));

import { getOfflineQueue, removeFromQueue } from "../src/lib/offline-queue";
const mockGetQueue = getOfflineQueue as ReturnType<typeof vi.fn>;
const mockRemove = removeFromQueue as ReturnType<typeof vi.fn>;

import { SyncIssuesList } from "../src/components/common/sync-issues-list";

beforeEach(async () => {
  await wipeBudgetCache();
  vi.clearAllMocks();
  mockGetQueue.mockResolvedValue([]);
  mockRemove.mockResolvedValue(undefined);
});

const failedItem = {
  idempotencyKey: "key-failed",
  budgetId: "budget-1",
  payload: {
    date: "2026-06-10",
    category_id: "cat-1",
    amount_original_cents: 1500,
    currency_original: "USD",
    note: null,
  },
  enqueuedAt: "2026-06-10T18:00:00.000Z",
  failReason: "VALIDATION_ERROR",
};

describe("SyncIssuesList", () => {
  it("renders with data-testid sync-issues-list", async () => {
    mockGetQueue.mockResolvedValue([failedItem]);
    render(React.createElement(SyncIssuesList));
    await waitFor(() => {
      expect(screen.getByTestId("sync-issues-list")).toBeInTheDocument();
    });
  });

  it("does not render visible content when there are no failures", async () => {
    mockGetQueue.mockResolvedValue([]);
    render(React.createElement(SyncIssuesList));
    await waitFor(() => {
      const list = screen.getByTestId("sync-issues-list");
      // aria-hidden or has no visible list items
      expect(list.querySelectorAll("li")).toHaveLength(0);
    });
  });

  it("renders one row per failed item", async () => {
    mockGetQueue.mockResolvedValue([
      failedItem,
      {
        ...failedItem,
        idempotencyKey: "key-failed-2",
        failReason: "MONTH_ROLLED",
      },
    ]);
    render(React.createElement(SyncIssuesList));
    await waitFor(() => {
      const list = screen.getByTestId("sync-issues-list");
      expect(list.querySelectorAll("li")).toHaveLength(2);
    });
  });

  it("does not render items without failReason (pending, not failed)", async () => {
    mockGetQueue.mockResolvedValue([
      { ...failedItem, idempotencyKey: "key-pending", failReason: undefined },
      failedItem,
    ]);
    render(React.createElement(SyncIssuesList));
    await waitFor(() => {
      const list = screen.getByTestId("sync-issues-list");
      expect(list.querySelectorAll("li")).toHaveLength(1);
    });
  });

  it("calls removeFromQueue when Dismiss is clicked", async () => {
    mockGetQueue.mockResolvedValue([failedItem]);
    render(React.createElement(SyncIssuesList));
    await waitFor(() => {
      expect(
        screen.getByTestId("sync-issues-list").querySelectorAll("li"),
      ).toHaveLength(1);
    });
    const dismissBtn = screen.getByTestId(
      `dismiss-${failedItem.idempotencyKey}`,
    );
    fireEvent.click(dismissBtn);
    await waitFor(() => {
      expect(mockRemove).toHaveBeenCalledWith("key-failed");
    });
  });
});

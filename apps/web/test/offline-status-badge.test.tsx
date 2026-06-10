/**
 * offline-status-badge.test.tsx — OfflineStatusBadge component
 *
 * Tests badge visibility/state transitions based on online/offline and queue count.
 */
import "fake-indexeddb/auto";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { wipeBudgetCache } from "../src/lib/offline-cache";

// Mock next-intl
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, params?: Record<string, unknown>) => {
    if (key === "badge.ariaLabel") {
      const count = params?.count ?? 0;
      return `${count} transaction${count !== 1 ? "s" : ""} pending sync`;
    }
    return key;
  },
}));

// Mock offline-queue
vi.mock("../src/lib/offline-queue", () => ({
  getOfflineQueue: vi.fn(),
}));

import { getOfflineQueue } from "../src/lib/offline-queue";
const mockGetQueue = getOfflineQueue as ReturnType<typeof vi.fn>;

import { OfflineStatusBadge } from "../src/components/common/offline-status-badge";

beforeEach(async () => {
  await wipeBudgetCache();
  vi.clearAllMocks();
  // Reset to online by default
  Object.defineProperty(navigator, "onLine", {
    value: true,
    writable: true,
    configurable: true,
  });
  mockGetQueue.mockResolvedValue([]);
});

describe("OfflineStatusBadge", () => {
  it("renders with data-testid offline-status-badge", async () => {
    render(React.createElement(OfflineStatusBadge));
    await waitFor(() => {
      expect(screen.getByTestId("offline-status-badge")).toBeInTheDocument();
    });
  });

  it("is not visible when online and queue is empty", async () => {
    Object.defineProperty(navigator, "onLine", {
      value: true,
      configurable: true,
    });
    mockGetQueue.mockResolvedValue([]);
    render(React.createElement(OfflineStatusBadge));
    await waitFor(() => {
      const badge = screen.getByTestId("offline-status-badge");
      // When hidden, aria-hidden or style contains hidden/invisible
      expect(badge).toHaveAttribute("aria-hidden", "true");
    });
  });

  it("shows yellow dot when online but queue > 0", async () => {
    Object.defineProperty(navigator, "onLine", {
      value: true,
      configurable: true,
    });
    mockGetQueue.mockResolvedValue([
      { idempotencyKey: "k1", budgetId: "b1", payload: {}, enqueuedAt: "" },
    ]);
    render(React.createElement(OfflineStatusBadge));
    await waitFor(() => {
      const badge = screen.getByTestId("offline-status-badge");
      expect(badge).not.toHaveAttribute("aria-hidden", "true");
    });
  });

  it("shows animate-pulse when offline", async () => {
    Object.defineProperty(navigator, "onLine", {
      value: false,
      configurable: true,
    });
    mockGetQueue.mockResolvedValue([]);
    render(React.createElement(OfflineStatusBadge));
    // Fire offline event to trigger state update
    window.dispatchEvent(new Event("offline"));
    await waitFor(() => {
      const badge = screen.getByTestId("offline-status-badge");
      expect(badge).not.toHaveAttribute("aria-hidden", "true");
      // The dot inside should have animate-pulse class
      const dot = badge.querySelector(".animate-pulse");
      expect(dot).toBeTruthy();
    });
  });
});

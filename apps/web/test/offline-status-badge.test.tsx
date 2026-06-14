/**
 * offline-status-badge.test.tsx — OfflineStatusBadge component
 *
 * Robust-minimal offline (260614-q1v): the badge is a plain connectivity pill —
 * hidden online, red animate-pulse dot offline. There is no offline write queue
 * anymore, so there are no queue-count states to test.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import React from "react";

// Mock next-intl — badge.ariaLabel is the only key used.
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

import { OfflineStatusBadge } from "../src/components/common/offline-status-badge";

beforeEach(() => {
  vi.clearAllMocks();
  Object.defineProperty(navigator, "onLine", {
    value: true,
    writable: true,
    configurable: true,
  });
});

describe("OfflineStatusBadge", () => {
  it("renders with data-testid offline-status-badge", async () => {
    render(React.createElement(OfflineStatusBadge));
    await waitFor(() => {
      expect(screen.getByTestId("offline-status-badge")).toBeInTheDocument();
    });
  });

  it("is hidden (aria-hidden) when online", async () => {
    Object.defineProperty(navigator, "onLine", {
      value: true,
      configurable: true,
    });
    render(React.createElement(OfflineStatusBadge));
    await waitFor(() => {
      const badge = screen.getByTestId("offline-status-badge");
      expect(badge).toHaveAttribute("aria-hidden", "true");
    });
  });

  it("shows a red animate-pulse dot when offline", async () => {
    render(React.createElement(OfflineStatusBadge));
    // Fire offline event to trigger the state update.
    Object.defineProperty(navigator, "onLine", {
      value: false,
      configurable: true,
    });
    window.dispatchEvent(new Event("offline"));
    await waitFor(() => {
      const badge = screen.getByTestId("offline-status-badge");
      expect(badge).not.toHaveAttribute("aria-hidden", "true");
      const dot = badge.querySelector(".animate-pulse");
      expect(dot).toBeTruthy();
    });
  });
});

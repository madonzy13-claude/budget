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

// Mock next-intl. The "offline" namespace returns readable strings so the
// visible pill label asserts against real copy (badge.label → "Offline").
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) =>
    key === "badge.label"
      ? "Offline"
      : key === "badge.ariaLabel"
        ? "Offline"
        : key,
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

  it("shows a small inline offline pill (dot + label) when offline", async () => {
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

  // RWT-3: the offline pill lives INSIDE the 64px header — it must be an INLINE
  // element with ZERO added vertical height (no full-width banner, no fixed h-*
  // row) so toggling online↔offline causes NO layout shift.
  it("offline render is a zero-height INLINE pill (no banner / no layout shift)", async () => {
    render(React.createElement(OfflineStatusBadge));
    Object.defineProperty(navigator, "onLine", {
      value: false,
      configurable: true,
    });
    window.dispatchEvent(new Event("offline"));
    await waitFor(() => {
      const badge = screen.getByTestId("offline-status-badge");
      const cls = badge.getAttribute("class") ?? "";
      // Inline, not a block banner.
      expect(cls).toContain("inline-flex");
      // No full-width banner and no fixed-height row that would add chrome height.
      expect(cls).not.toMatch(/\bw-full\b/);
      expect(cls).not.toMatch(/\bh-(?:8|10|12|14|16)\b/);
      // A visible "Offline" label OR a small dot — both present in the pill.
      expect(badge.textContent ?? "").toMatch(/offline/i);
      expect(badge.querySelector(".animate-pulse")).toBeTruthy();
    });
  });

  it("online render stays zero-footprint (sr-only) so there is no layout shift", async () => {
    render(React.createElement(OfflineStatusBadge));
    await waitFor(() => {
      const badge = screen.getByTestId("offline-status-badge");
      expect(badge).toHaveAttribute("aria-hidden", "true");
      expect(badge.getAttribute("class") ?? "").toContain("sr-only");
    });
  });
});

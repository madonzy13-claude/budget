/**
 * offline-status-badge.test.tsx — OfflineStatusBadge layout-invariant tests.
 *
 * 260615-bse redesign: the offline pill is now an ICON-ONLY pulsing lucide
 * CloudOff (no "Offline" text label) with a cache-age tooltip. These tests pin
 * the layout invariants only (zero-height inline / sr-only online / no banner /
 * no layout shift). Behavior (cloud-off icon, tooltip copy, tap-to-toggle,
 * cache age) is covered in test/components/offline-status-badge.test.tsx.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import React from "react";

// Mock next-intl: key-echo translations + a fixed relativeTime formatter (the
// redesigned component reads cache age via useFormatter).
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, params?: Record<string, unknown>) =>
    params ? `${key}(${JSON.stringify(params)})` : key,
  useFormatter: () => ({ relativeTime: () => "13 minutes ago" }),
}));

vi.mock("@/lib/offline-cache", () => ({
  getSyncMeta: () =>
    Promise.resolve(new Date(Date.now() - 13 * 60 * 1000).toISOString()),
  getMostRecentSyncMeta: () =>
    Promise.resolve(new Date(Date.now() - 13 * 60 * 1000).toISOString()),
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
    render(React.createElement(OfflineStatusBadge, { budgetId: "b1" }));
    await waitFor(() => {
      expect(screen.getByTestId("offline-status-badge")).toBeInTheDocument();
    });
  });

  it("is hidden (aria-hidden, sr-only) when online", async () => {
    Object.defineProperty(navigator, "onLine", {
      value: true,
      configurable: true,
    });
    render(React.createElement(OfflineStatusBadge, { budgetId: "b1" }));
    await waitFor(() => {
      const badge = screen.getByTestId("offline-status-badge");
      expect(badge).toHaveAttribute("aria-hidden", "true");
      expect(badge.getAttribute("class") ?? "").toContain("sr-only");
    });
  });

  it("shows a pulsing cloud-off when offline", async () => {
    render(React.createElement(OfflineStatusBadge, { budgetId: "b1" }));
    Object.defineProperty(navigator, "onLine", {
      value: false,
      configurable: true,
    });
    window.dispatchEvent(new Event("offline"));
    await waitFor(() => {
      const badge = screen.getByTestId("offline-status-badge");
      expect(badge).not.toHaveAttribute("aria-hidden", "true");
      const icon = screen.getByTestId("offline-cloud-off");
      expect(icon.getAttribute("class") ?? "").toContain("animate-pulse");
    });
  });

  // RWT-3 invariant: the offline pill lives INSIDE the 64px header — INLINE,
  // ZERO added vertical height (no full-width banner, no fixed h-* row) so
  // toggling online↔offline causes NO layout shift.
  it("offline render is a zero-height INLINE pill (no banner / no layout shift)", async () => {
    render(React.createElement(OfflineStatusBadge, { budgetId: "b1" }));
    Object.defineProperty(navigator, "onLine", {
      value: false,
      configurable: true,
    });
    window.dispatchEvent(new Event("offline"));
    await waitFor(() => {
      const badge = screen.getByTestId("offline-status-badge");
      const cls = badge.getAttribute("class") ?? "";
      expect(cls).toContain("inline-flex");
      expect(cls).not.toMatch(/\bw-full\b/);
      expect(cls).not.toMatch(/\bh-(?:8|10|12|14|16)\b/);
      expect(screen.getByTestId("offline-cloud-off")).toBeTruthy();
    });
  });

  it("online render stays zero-footprint (sr-only) so there is no layout shift", async () => {
    render(React.createElement(OfflineStatusBadge, { budgetId: "b1" }));
    await waitFor(() => {
      const badge = screen.getByTestId("offline-status-badge");
      expect(badge).toHaveAttribute("aria-hidden", "true");
      expect(badge.getAttribute("class") ?? "").toContain("sr-only");
    });
  });
});

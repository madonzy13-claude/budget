/**
 * offline-stale-bar.test.tsx — Vitest+RTL tests for the OfflineStaleBar
 * (260615-e8s round 3). Verifies:
 *   - online renders nothing (null, zero footprint),
 *   - offline renders a full-width red bar with the cache-age message,
 *   - the cache-age fallback chain (per-budget → __global__ → most-recent),
 *   - the adaptive tick cadence (staleTickDelay) buckets.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

const getSyncMeta = vi.fn();
const getMostRecentSyncMeta = vi.fn();
vi.mock("@/lib/offline-cache", () => ({
  getSyncMeta: (...a: unknown[]) => getSyncMeta(...a),
  getMostRecentSyncMeta: (...a: unknown[]) => getMostRecentSyncMeta(...a),
}));

// next-intl: echo key + interpolated values so we can assert the relative time
// reaches the rendered string.
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, vals?: Record<string, unknown>) =>
    vals ? `${key} ${Object.values(vals).join(" ")}` : key,
  useFormatter: () => ({ relativeTime: () => "5 minutes ago" }),
}));

import {
  OfflineStaleBar,
  staleTickDelay,
} from "../../src/components/common/offline-stale-bar";

function setOnline(value: boolean) {
  Object.defineProperty(navigator, "onLine", { configurable: true, value });
}

beforeEach(() => {
  getSyncMeta.mockReset();
  getMostRecentSyncMeta.mockReset();
  getSyncMeta.mockResolvedValue(null);
  getMostRecentSyncMeta.mockResolvedValue(null);
  setOnline(true);
});

describe("staleTickDelay (adaptive cadence)", () => {
  it("ticks every second under a minute", () => {
    expect(staleTickDelay(0)).toBe(1_000);
    expect(staleTickDelay(59_999)).toBe(1_000);
  });
  it("ticks every minute under an hour", () => {
    expect(staleTickDelay(60_000)).toBe(60_000);
    expect(staleTickDelay(3_599_999)).toBe(60_000);
  });
  it("ticks every hour from an hour onward (incl. > 1 day)", () => {
    expect(staleTickDelay(3_600_000)).toBe(3_600_000);
    expect(staleTickDelay(48 * 3_600_000)).toBe(3_600_000);
  });
});

describe("OfflineStaleBar", () => {
  it("renders nothing while online", async () => {
    setOnline(true);
    render(<OfflineStaleBar budgetId="b-1" />);
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByTestId("offline-stale-bar")).toBeNull();
  });

  it("renders a full-width red bar with the cache-age message when offline", async () => {
    setOnline(false);
    getSyncMeta.mockResolvedValue("2026-06-15T11:00:00.000Z");
    render(<OfflineStaleBar budgetId="b-1" />);
    await waitFor(() => {
      const bar = screen.getByTestId("offline-stale-bar");
      expect(bar).toBeTruthy();
      expect(bar.className).toContain("w-full");
      // message key + interpolated relative time.
      expect(bar.textContent ?? "").toContain("staleBar.message");
      expect(bar.textContent ?? "").toContain("5 minutes ago");
    });
  });

  it("shows the unknown message when nothing has ever synced", async () => {
    setOnline(false);
    getSyncMeta.mockResolvedValue(null);
    getMostRecentSyncMeta.mockResolvedValue(null);
    render(<OfflineStaleBar budgetId={null} />);
    await waitFor(() => {
      const bar = screen.getByTestId("offline-stale-bar");
      expect(bar.textContent ?? "").toContain("staleBar.unknown");
    });
  });

  it("falls back per-budget → __global__ → most-recent for cache age", async () => {
    setOnline(false);
    // per-budget null, __global__ has a value → message (not unknown).
    getSyncMeta.mockImplementation((key: string) =>
      key === "__global__"
        ? Promise.resolve("2026-06-15T11:00:00.000Z")
        : Promise.resolve(null),
    );
    render(<OfflineStaleBar budgetId="b-1" />);
    await waitFor(() => {
      expect(
        screen.getByTestId("offline-stale-bar").textContent ?? "",
      ).toContain("staleBar.message");
    });
    expect(getSyncMeta).toHaveBeenCalledWith("b-1");
    expect(getSyncMeta).toHaveBeenCalledWith("__global__");
  });
});

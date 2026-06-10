/**
 * staleness-marker.test.tsx
 *
 * Tests for StalenessMarker and OfflineFallback components.
 */

import { describe, test, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";

// Single unified next-intl mock for entire file
vi.mock("next-intl", () => ({
  useTranslations:
    (ns: string) => (key: string, params?: Record<string, unknown>) => {
      const fullKey = `${ns}.${key}`;
      const map: Record<string, string> = {
        // sync namespace
        "sync.staleness": "Last synced {relativeTime}",
        // offline namespace
        "offline.unavailable.heading": "Not available offline",
        "offline.unavailable.body":
          "This data hasn't been loaded yet. Connect to the internet and reload.",
        "offline.unavailable.retry": "Retry when online",
      };
      let str = map[fullKey] ?? key;
      if (params) {
        for (const [k, v] of Object.entries(params)) {
          str = str.replace(`{${k}}`, String(v));
        }
      }
      return str;
    },
  useFormatter: () => ({
    relativeTime: (date: Date, _base?: Date) => {
      const diff = Date.now() - date.getTime();
      const mins = Math.floor(diff / 60_000);
      if (mins < 1) return "just now";
      return `${mins} minutes ago`;
    },
  }),
}));

// offline-cache mock
vi.mock("../src/lib/offline-cache", () => ({
  getSyncMeta: vi.fn(),
}));

import { StalenessMarker } from "../src/components/common/staleness-marker";
import { OfflineFallback } from "../src/components/common/offline-fallback";
import { getSyncMeta } from "../src/lib/offline-cache";

const mockGetSyncMeta = getSyncMeta as ReturnType<typeof vi.fn>;

// ── StalenessMarker ──────────────────────────────────────────────────────────

describe("StalenessMarker", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("renders with correct testid", async () => {
    const fiveMinAgo = new Date(Date.now() - 5 * 60_000).toISOString();
    mockGetSyncMeta.mockResolvedValue(fiveMinAgo);
    render(<StalenessMarker budgetId="b1" isOffline={true} />);
    await vi.waitFor(() => {
      expect(screen.getByTestId("staleness-marker")).toBeDefined();
    });
  });

  test("has aria-live polite", async () => {
    const fiveMinAgo = new Date(Date.now() - 5 * 60_000).toISOString();
    mockGetSyncMeta.mockResolvedValue(fiveMinAgo);
    render(<StalenessMarker budgetId="b1" isOffline={true} />);
    await vi.waitFor(() => {
      const el = screen.getByTestId("staleness-marker");
      expect(el.getAttribute("aria-live")).toBe("polite");
    });
  });

  test("shows last-synced text when offline with sync data", async () => {
    const fiveMinAgo = new Date(Date.now() - 5 * 60_000).toISOString();
    mockGetSyncMeta.mockResolvedValue(fiveMinAgo);
    render(<StalenessMarker budgetId="b1" isOffline={true} />);
    await vi.waitFor(() => {
      expect(screen.getByTestId("staleness-marker").textContent).toContain(
        "Last synced",
      );
    });
  });

  test("shows sr-only when online and no recent reconnect", async () => {
    mockGetSyncMeta.mockResolvedValue(new Date().toISOString());
    render(
      <StalenessMarker budgetId="b1" isOffline={false} reconnectedAt={null} />,
    );
    await new Promise((r) => setTimeout(r, 50));
    const el = screen.queryByTestId("staleness-marker");
    // When not visible the component renders an sr-only span (empty text)
    if (el) {
      expect(el.classList.contains("sr-only") || el.textContent === "").toBe(
        true,
      );
    }
  });

  test("renders (even with no data) when offline — no sync data case", async () => {
    mockGetSyncMeta.mockResolvedValue(null);
    render(<StalenessMarker budgetId="b1" isOffline={true} />);
    await vi.waitFor(() => {
      expect(screen.getByTestId("staleness-marker")).toBeDefined();
    });
  });

  test("shows relative time string when offline", async () => {
    const tenMinAgo = new Date(Date.now() - 10 * 60_000).toISOString();
    mockGetSyncMeta.mockResolvedValue(tenMinAgo);
    render(<StalenessMarker budgetId="b1" isOffline={true} />);
    await vi.waitFor(() => {
      const text = screen.getByTestId("staleness-marker").textContent ?? "";
      expect(text).toContain("minutes ago");
    });
  });
});

// ── OfflineFallback ──────────────────────────────────────────────────────────

describe("OfflineFallback", () => {
  test("renders with data-testid offline-unavailable", () => {
    render(<OfflineFallback />);
    expect(screen.getByTestId("offline-unavailable")).toBeDefined();
  });

  test("shows unavailable heading", () => {
    render(<OfflineFallback />);
    expect(screen.getByText("Not available offline")).toBeDefined();
  });

  test("shows retry button", () => {
    render(<OfflineFallback />);
    const btn = screen.getByRole("button");
    expect(btn).toBeDefined();
    expect(btn.textContent).toContain("Retry when online");
  });

  test("retry button has type=button (no form submit)", () => {
    render(<OfflineFallback />);
    const btn = screen.getByRole("button");
    expect(btn.getAttribute("type")).toBe("button");
  });
});

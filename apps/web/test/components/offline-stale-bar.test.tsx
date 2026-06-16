/**
 * offline-stale-bar.test.tsx — Vitest+RTL tests for the OfflineStaleBar.
 *
 * SPA/SWR refactor (260616): the cache age now comes from useCacheAge() — the
 * freshest successful budget-scoped React Query query's dataUpdatedAt — instead
 * of the removed offline-cache sync-meta store. Tests seed the query cache to
 * control whether an age exists.
 *
 * Verifies:
 *   - online renders nothing (null, zero footprint),
 *   - offline + a cached budget query → full-width red bar with the age message,
 *   - offline + empty cache → the "unknown" message,
 *   - the adaptive tick cadence (staleTickDelay) buckets.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { TestQueryProvider, makeTestQueryClient } from "../setup/query-client";

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

/** Render the bar with offline state + an optionally-seeded budget query. */
function renderBar({
  offline,
  seedAge,
}: {
  offline: boolean;
  seedAge: boolean;
}) {
  setOnline(!offline);
  const qc = makeTestQueryClient();
  if (seedAge) {
    // A successful budget-scoped query → useCacheAge reports a non-null age.
    qc.setQueryData(["budget", "b-1", "detail"], { id: "b-1", name: "X" });
  }
  return render(
    <TestQueryProvider client={qc}>
      <OfflineStaleBar budgetId="b-1" />
    </TestQueryProvider>,
  );
}

beforeEach(() => {
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
    renderBar({ offline: false, seedAge: true });
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByTestId("offline-stale-bar")).toBeNull();
  });

  it("renders a full-width red bar with the cache-age message when offline", async () => {
    renderBar({ offline: true, seedAge: true });
    await waitFor(() => {
      const bar = screen.getByTestId("offline-stale-bar");
      expect(bar).toBeTruthy();
      expect(bar.className).toContain("w-full");
      // message key + interpolated relative time.
      expect(bar.textContent ?? "").toContain("staleBar.message");
      expect(bar.textContent ?? "").toContain("5 minutes ago");
    });
  });

  it("shows the unknown message when the cache is empty (nothing synced)", async () => {
    renderBar({ offline: true, seedAge: false });
    await waitFor(() => {
      const bar = screen.getByTestId("offline-stale-bar");
      expect(bar.textContent ?? "").toContain("staleBar.unknown");
    });
  });
});

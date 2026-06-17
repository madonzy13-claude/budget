/**
 * offline-stale-bar.test.tsx — OfflineStaleBar (SPA/SWR 260616/17).
 *
 * The bar derives the CURRENT route's PRIMARY query key (usePrimaryKeys) and asks
 * useCacheAge about just that data:
 *   - online                         → renders nothing,
 *   - offline + primary key cached   → "data updated {relativeTime}",
 *   - offline + primary key NOT cached (even if OTHER data is cached) → "never cached"
 *     (260617 bug: an uncached wallets list must not show a global "updated 2s ago"),
 *   - staleTickDelay cadence buckets.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient } from "@tanstack/react-query";
import { TestQueryProvider } from "../setup/query-client";

// gcTime: Infinity so a setQueryData-seeded query with NO observer isn't garbage
// collected before useCacheAge reads it (the bar reads the cache via qc.find, it
// doesn't observe the query — in the real app the page's hook observes it, so it
// persists; only this test needs the explicit gcTime).
const makeClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity, staleTime: 0 },
    },
  });

// Route mock — drives usePrimaryKeys. Default: the Wallets tab of budget b-1.
let mockPathname = "/en/budgets/11111111-2222-3333-4444-555555555555/wallets";
vi.mock("next/navigation", () => ({
  usePathname: () => mockPathname,
  useSearchParams: () => new URLSearchParams(""),
}));

// next-intl: echo key + interpolated values so we can assert the rendered copy.
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
  setOnline(true);
  mockPathname = "/en/budgets/11111111-2222-3333-4444-555555555555/wallets";
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
    const qc = makeClient();
    qc.setQueryData(
      ["budget", "11111111-2222-3333-4444-555555555555", "wallets"],
      [{ id: "w" }],
    );
    render(
      <TestQueryProvider client={qc}>
        <OfflineStaleBar budgetId="11111111-2222-3333-4444-555555555555" />
      </TestQueryProvider>,
    );
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByTestId("offline-stale-bar")).toBeNull();
  });

  it("offline + the page's primary data IS cached → 'data updated' message", async () => {
    setOnline(false);
    const qc = makeClient();
    qc.setQueryData(
      ["budget", "11111111-2222-3333-4444-555555555555", "wallets"],
      [{ id: "w" }],
    );
    render(
      <TestQueryProvider client={qc}>
        <OfflineStaleBar budgetId="11111111-2222-3333-4444-555555555555" />
      </TestQueryProvider>,
    );
    await waitFor(() => {
      const bar = screen.getByTestId("offline-stale-bar");
      expect(bar.className).toContain("w-full");
      expect(bar.textContent ?? "").toContain("staleBar.message");
      expect(bar.textContent ?? "").toContain("5 minutes ago");
    });
  });

  it("offline + page's primary data UNCACHED → 'never cached', NOT a global age (260617 bug)", async () => {
    setOnline(false);
    const qc = makeClient();
    // A DIFFERENT page's data is cached (home synced seconds ago) — must NOT leak
    // into the Wallets banner. The wallets key itself is absent.
    qc.setQueryData(["active-budgets"], [{ id: "x" }]);
    qc.setQueryData(
      ["budget", "11111111-2222-3333-4444-555555555555", "detail"],
      { id: "11111111-2222-3333-4444-555555555555" },
    ); // detail cached, wallets not
    render(
      <TestQueryProvider client={qc}>
        <OfflineStaleBar budgetId="11111111-2222-3333-4444-555555555555" />
      </TestQueryProvider>,
    );
    await waitFor(() => {
      const bar = screen.getByTestId("offline-stale-bar");
      expect(bar.textContent ?? "").toContain("staleBar.never");
      expect(bar.textContent ?? "").not.toContain("staleBar.message");
    });
  });

  it("offline + home route + budget list cached → 'data updated'", async () => {
    setOnline(false);
    mockPathname = "/en";
    const qc = makeClient();
    qc.setQueryData(["active-budgets"], [{ id: "x" }]);
    render(
      <TestQueryProvider client={qc}>
        <OfflineStaleBar budgetId={null} />
      </TestQueryProvider>,
    );
    await waitFor(() => {
      expect(
        screen.getByTestId("offline-stale-bar").textContent ?? "",
      ).toContain("staleBar.message");
    });
  });
});

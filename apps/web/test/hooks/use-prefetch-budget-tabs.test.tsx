/**
 * use-prefetch-budget-tabs.test.tsx
 *
 * First-open prefetch must NOT fire all 14 requests at once — that thundering
 * herd contends on the API (peak ~16 concurrent → each request ~4x slower) so the
 * primary tabs' data + the RSC prefetch don't land until ~2s, making the first
 * pill navigation cold + janky. The prefetch is TIERED:
 *   - PRIORITY (immediate): wallets / spendings / reserves drivers + budget detail
 *   - DEFERRED (after the priority NETWORK completes): settings-tab drivers
 * and the duplicate categories fetch is removed (categories-lite reuses the cached
 * categories). The deferral chains on the priority promises — NOT
 * requestIdleCallback, which fires at once because the fetches are network-bound.
 *
 * The priority endpoints are gated in the mock so the test can assert that the
 * Settings tier does not fire until the priority requests have resolved.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { QueryClient } from "@tanstack/react-query";
import { usePrefetchBudgetTabs } from "../../src/hooks/use-prefetch-budget-tabs";
import { TestQueryProvider } from "../setup/query-client";

// gcTime must be > 0 so a prefetched (observer-less) query is RETAINED across the
// priority → deferred tiers — the default test client uses gcTime:0 which would
// GC the priority categories before the deferred categories-lite reuse reads it
// (in production gcTime is 5min and tab components mount observers).
function makeClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 600_000, staleTime: 0 },
    },
  });
}

const BUDGET_ID = "budget-pf-01";
const calls: string[] = [];
let releasePriority: () => void = () => {};
let gate: Promise<void>;

// Settings/notification endpoints resolve instantly; priority endpoints pend on
// the gate so the test controls when the priority NETWORK "completes".
const isSettings = (p: string) =>
  /\/members|cushion-summary|recurring-rules|\/push\//.test(p);

const mockFetch = vi.fn(async (path: string) => {
  calls.push(path);
  if (!isSettings(path)) await gate;
  return {
    ok: true,
    json: async () => ({
      wallets: [],
      categories: [],
      transactions: [],
      rules: [],
      members: [],
      budget: { id: "b1" },
    }),
  };
});
vi.mock("../../src/lib/budget-fetch", () => ({
  clientApiFetch: (...args: unknown[]) => mockFetch(...(args as [string])),
}));

const flush = () => new Promise((r) => setTimeout(r, 0));

describe("usePrefetchBudgetTabs (tiered first-open prefetch)", () => {
  let client: QueryClient;

  function wrapper({ children }: { children: React.ReactNode }) {
    return <TestQueryProvider client={client}>{children}</TestQueryProvider>;
  }

  beforeEach(() => {
    client = makeClient();
    calls.length = 0;
    mockFetch.mockClear();
    gate = new Promise<void>((r) => {
      releasePriority = r;
    });
    Object.defineProperty(navigator, "onLine", {
      value: true,
      configurable: true,
    });
  });

  afterEach(() => {
    releasePriority(); // unblock any pending priority fetches
  });

  it("fires PRIORITY drivers immediately and DEFERS settings until priority resolves", async () => {
    renderHook(() => usePrefetchBudgetTabs(BUDGET_ID), { wrapper });
    await flush();

    const immediate = calls.join(" | ");
    // Priority: wallets / spendings / reserves drivers + detail — fired now.
    expect(immediate).toContain("/wallets");
    expect(immediate).toContain(`/budgets/${BUDGET_ID}/reserves`);
    expect(immediate).toContain(`/budgets/${BUDGET_ID}/categories`);
    expect(immediate).toContain("/spendings-summary");
    expect(immediate).toContain("confirmed=true");
    expect(immediate).toContain("confirmed=false");
    // Settings deferred — must NOT fire while the priority network is in flight.
    expect(immediate).not.toContain("/members");
    expect(immediate).not.toContain("/cushion-summary");
    expect(immediate).not.toContain("/recurring-rules");
    expect(immediate).not.toContain("/push/preferences");

    // Priority network completes → settings tier runs.
    releasePriority();
    await flush();
    await flush();

    const all = calls.join(" | ");
    expect(all).toContain("/members");
    expect(all).toContain("/cushion-summary");
    expect(all).toContain("/recurring-rules");
    expect(all).toContain("/push/preferences");
  });

  it("does NOT fetch /categories twice (categories-lite reuses the cached categories)", async () => {
    renderHook(() => usePrefetchBudgetTabs(BUDGET_ID), { wrapper });
    await flush();
    releasePriority();
    await flush();
    await flush();

    const categoriesCalls = calls.filter((c) =>
      c.endsWith(`/budgets/${BUDGET_ID}/categories`),
    );
    expect(categoriesCalls).toHaveLength(1);
    expect(client.getQueryData(["categories-lite", BUDGET_ID])).toBeDefined();
  });
});

/**
 * use-prefetch-budget-tabs.test.tsx
 *
 * First-open prefetch must not fire all 14 requests at once — that thundering
 * herd contends on the API (peak ~16 concurrent → each request ~4x slower).
 *
 * It used to avoid that with a SCHEDULE: Settings waited for every priority
 * promise to settle, with a 4s fallback if one hung. 260827 replaced the
 * schedule with a concurrency cap (request-pool), because a schedule idles on a
 * fast connection — measured, half of a 3,553ms warm-up was spent waiting rather
 * than fetching. Everything is now asked for at once and six travel at a time,
 * priority jobs taking slots first.
 *
 * The priority endpoints are gated in the mock so the test can hold slots open
 * and watch what does — and does not — get one.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { QueryClient } from "@tanstack/react-query";
import { usePrefetchBudgetTabs } from "../../src/hooks/use-prefetch-budget-tabs";
import { POOL_LIMIT } from "../../src/lib/request-pool";
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
  /\/members|cushion-summary|scheduled-payments|\/push\//.test(p);

let live = 0;
let peak = 0;

const mockFetch = vi.fn(async (path: string) => {
  calls.push(path);
  live += 1;
  peak = Math.max(peak, live);
  try {
    if (!isSettings(path)) await gate;
  } finally {
    live -= 1;
  }
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
  // The hook fetches through the pool; the pool is real here so the cap itself
  // is under test rather than mocked away.
  backgroundApiFetch: async (...args: unknown[]) => {
    const { runPooled } = await import("../../src/lib/request-pool");
    return runPooled(() => mockFetch(...(args as [string])));
  },
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
    live = 0;
    peak = 0;
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

  it("asks for every driver at once, but never more than the cap in flight", async () => {
    renderHook(() => usePrefetchBudgetTabs(BUDGET_ID), { wrapper });
    await flush();

    // Priority jobs were queued first, so they hold the slots.
    const immediate = calls.join(" | ");
    expect(immediate).toContain("/wallets");
    expect(immediate).toContain(`/budgets/${BUDGET_ID}/reserves`);
    expect(immediate).toContain(`/budgets/${BUDGET_ID}/categories`);
    // …and the cap is what holds the rest back — not a clock. Nothing here
    // advances a timer. Cumulative calls can exceed the cap (a settings endpoint
    // resolves instantly and hands its slot straight on); what must never exceed
    // it is how many are IN FLIGHT.
    expect(peak).toBeLessThanOrEqual(POOL_LIMIT);
    expect(peak).toBeGreaterThan(1);

    // A slot frees → the queue drains on its own, Settings included.
    releasePriority();
    await flush();
    await flush();
    await flush();

    const all = calls.join(" | ");
    expect(all).toContain("/spendings-summary");
    expect(all).toContain("confirmed=true");
    expect(all).toContain("confirmed=false");
    expect(all).toContain("/members");
    expect(all).toContain("/cushion-summary");
    expect(all).toContain("/scheduled-payments");
    expect(all).toContain("/push/preferences");
    // Held all the way through the drain.
    expect(peak).toBeLessThanOrEqual(POOL_LIMIT);
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

// 260806 (user): "are you also preloading the all-budgets page data even when
// the user didn't visit it?" — no. That page belongs to no single budget, so
// nothing warmed it: open a budget, lose the network, tap through to the
// switcher and the aggregate view had never been fetched. It rides the deferred
// tier now, behind the tab drivers that are actually on the critical path.
it("warms the all-budgets aggregate too, after the tab drivers", async () => {
  // `calls` is module-level and accumulates across the tests above.
  calls.length = 0;
  const qc = makeClient();
  renderHook(() => usePrefetchBudgetTabs(BUDGET_ID), {
    wrapper: ({ children }) => (
      <TestQueryProvider client={qc}>{children}</TestQueryProvider>
    ),
  });

  // Still on the critical path — the aggregate must NOT be in the first burst.
  expect(calls.some((p) => p.includes("/budgets/aggregate"))).toBe(false);

  releasePriority();
  await vi.waitFor(() =>
    expect(calls.some((p) => p.includes("/budgets/aggregate"))).toBe(true),
  );
  expect(qc.getQueryData(["budgets", "aggregate"])).toBeDefined();
});

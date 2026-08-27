/**
 * api-client-header.test.ts — Vitest unit tests for budget-fetch path extraction.
 *
 * Tests:
 * - extractBudgetIdFromPath extracts ID from /[locale]/budgets/[id]/... paths
 * - returns null for /[locale]/workspaces/... paths (old pattern)
 * - returns null for non-matching paths
 */
import { describe, test, expect, vi, afterEach } from "vitest";

// Dynamic import so the test works before AND after the rename.
// We try budget-fetch first; fall back to workspace-fetch so RED is clean.
let extractFn: ((p: string) => string | null) | null = null;

async function getExtractFn(): Promise<(p: string) => string | null> {
  if (extractFn) return extractFn;
  try {
    const mod = await import("@/lib/budget-fetch");
    extractFn = (
      mod as unknown as {
        extractBudgetIdFromPath: (p: string) => string | null;
      }
    ).extractBudgetIdFromPath;
    return extractFn!;
  } catch {
    // Fall back to old file during RED phase
    const mod = await import("@/lib/workspace-fetch");
    extractFn = (
      mod as unknown as {
        extractWorkspaceIdFromPath: (p: string) => string | null;
      }
    ).extractWorkspaceIdFromPath;
    return extractFn!;
  }
}

describe("budget-fetch path extraction", () => {
  test("extractBudgetIdFromPath — module exports the renamed function", async () => {
    // This test is the RED gate: budget-fetch.ts with extractBudgetIdFromPath must exist
    const mod = await import("@/lib/budget-fetch").catch(() => null);
    expect(
      mod,
      "budget-fetch module must exist (rename workspace-fetch → budget-fetch)",
    ).not.toBeNull();
    expect(
      (mod as unknown as Record<string, unknown>).extractBudgetIdFromPath,
      "extractBudgetIdFromPath must be exported from budget-fetch",
    ).toBeDefined();
  });

  test("extracts budget ID from /en/budgets/[uuid]/... path", async () => {
    const extract = await getExtractFn();
    const uuid = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";
    const result = extract(`/en/budgets/${uuid}/transactions`);
    expect(result).toBe(uuid);
  });

  test("extracts budget ID from /pl/budgets/[uuid] path (no trailing segment)", async () => {
    const extract = await getExtractFn();
    const uuid = "f0e1d2c3-b4a5-6789-0abc-def012345678";
    const result = extract(`/pl/budgets/${uuid}`);
    expect(result).toBe(uuid);
  });

  test("returns null for old /workspaces/ pattern", async () => {
    // After rename, /workspaces/ paths must NOT extract an ID
    const mod = await import("@/lib/budget-fetch").catch(() => null);
    if (!mod) return; // RED phase - skip if file doesn't exist yet
    const extract = (
      mod as unknown as {
        extractBudgetIdFromPath: (p: string) => string | null;
      }
    ).extractBudgetIdFromPath;
    const uuid = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";
    expect(extract(`/en/workspaces/${uuid}/budget`)).toBeNull();
  });

  test("returns null for non-matching paths", async () => {
    const extract = await getExtractFn();
    expect(extract("/en/sign-in")).toBeNull();
    expect(extract("/en/settings")).toBeNull();
    expect(extract("/")).toBeNull();
  });
});

/**
 * The header, not just the extraction.
 *
 * clientApiFetch used to read the budget id ONLY from window.location.pathname.
 * Every budget-scoped hook takes a budgetId and builds `/budgets/<id>/...`, so
 * on a page whose URL carries no budget — the all-budgets page at `/en` — the
 * header went missing and the API answered 403 no_active_workspace. The
 * all-budgets page renders a task banner per budget, each calling useTaskTitle →
 * useCategories, so it fired one doomed request per budget and retried each
 * (user screenshot, 260827).
 *
 * The id is right there in the PATH being requested. Prefer it.
 */
describe("clientApiFetch — which budget it claims", () => {
  const UUID = "a2372ac5-bcdd-4e70-a4ca-4ab26d1f3bf0";

  async function callWith(pathname: string, apiPath: string, init = {}) {
    vi.resetModules();
    const seen: { headers?: Headers } = {};
    vi.stubGlobal("fetch", (_u: string, i: RequestInit) => {
      seen.headers = new Headers(i.headers);
      return Promise.resolve(new Response("{}", { status: 200 }));
    });
    vi.stubGlobal("window", { location: { pathname } });
    const { clientApiFetch } = await import("@/lib/budget-fetch");
    await clientApiFetch(apiPath, init);
    return seen.headers!;
  }

  afterEach(() => vi.unstubAllGlobals());

  test("takes the budget from the REQUESTED path, not the browser URL", async () => {
    // The all-budgets page: no budget in the URL at all.
    const h = await callWith("/en", `/budgets/${UUID}/categories`);
    expect(h.get("X-Budget-ID")).toBe(UUID);
  });

  test("the requested path wins over a different budget in the URL", async () => {
    const other = "d30ee8ca-a44f-493b-af60-0f9cbd9199f8";
    const h = await callWith(
      `/en/budgets/${other}/spendings`,
      `/budgets/${UUID}/categories`,
    );
    expect(h.get("X-Budget-ID")).toBe(UUID);
  });

  test("falls back to the browser URL for a path with no budget in it", async () => {
    const h = await callWith(`/en/budgets/${UUID}/wallets`, "/wallets");
    expect(h.get("X-Budget-ID")).toBe(UUID);
  });

  test("the aggregate route is not mistaken for a budget id", async () => {
    const h = await callWith("/en", "/budgets/aggregate");
    expect(h.get("X-Budget-ID")).toBeNull();
  });

  test("an explicit header still wins — callers that know better keep control", async () => {
    const other = "d30ee8ca-a44f-493b-af60-0f9cbd9199f8";
    const h = await callWith("/en", `/budgets/${UUID}/categories`, {
      headers: { "X-Budget-ID": other },
    });
    expect(h.get("X-Budget-ID")).toBe(other);
  });
});

/**
 * backgroundApiFetch — the same call, through the concurrency cap.
 *
 * Warm-up traffic is bulk and nobody is watching it; a tap is neither. Keeping
 * them in separate lanes is what lets the cap be small without ever making a
 * person wait behind a prefetch.
 */
describe("backgroundApiFetch", () => {
  afterEach(() => vi.unstubAllGlobals());

  test("carries the same X-Budget-ID rules as a foreground call", async () => {
    vi.resetModules();
    const seen: { headers?: Headers } = {};
    vi.stubGlobal("fetch", (_u: string, i: RequestInit) => {
      seen.headers = new Headers(i.headers);
      return Promise.resolve(new Response("{}", { status: 200 }));
    });
    vi.stubGlobal("window", { location: { pathname: "/en" } });
    const { backgroundApiFetch } = await import("@/lib/budget-fetch");
    const uuid = "a2372ac5-bcdd-4e70-a4ca-4ab26d1f3bf0";
    await backgroundApiFetch(`/budgets/${uuid}/categories`);
    expect(seen.headers!.get("X-Budget-ID")).toBe(uuid);
  });

  test("never runs more than the pool limit at once", async () => {
    vi.resetModules();
    let live = 0;
    let peak = 0;
    const releases: (() => void)[] = [];
    vi.stubGlobal("fetch", () => {
      live += 1;
      peak = Math.max(peak, live);
      return new Promise<Response>((resolve) =>
        releases.push(() => {
          live -= 1;
          resolve(new Response("{}", { status: 200 }));
        }),
      );
    });
    vi.stubGlobal("window", { location: { pathname: "/en" } });
    const { backgroundApiFetch } = await import("@/lib/budget-fetch");
    const { BACKGROUND_LIMIT } = await import("@/lib/request-pool");

    const all = Array.from({ length: BACKGROUND_LIMIT + 4 }, () =>
      backgroundApiFetch("/wallets"),
    );
    // Let every call that CAN start, start.
    for (let i = 0; i < 20; i++) await Promise.resolve();
    expect(peak).toBe(BACKGROUND_LIMIT);
    // Drain in rounds — a freed slot starts a queued call, which enqueues its
    // own release, so a single pass would leave the tail hanging.
    for (let round = 0; round < 10 && releases.length; round++) {
      while (releases.length) releases.shift()!();
      for (let i = 0; i < 20; i++) await Promise.resolve();
    }
    await Promise.all(all);
    expect(peak).toBe(BACKGROUND_LIMIT);
  });

  // Background never takes the last slot, so the reserved one is waiting.
  test("a foreground call does NOT queue behind background work", async () => {
    vi.resetModules();
    const releases: (() => void)[] = [];
    let foregroundRan = false;
    vi.stubGlobal("fetch", (u: string) => {
      if (String(u).includes("urgent")) {
        foregroundRan = true;
        return Promise.resolve(new Response("{}", { status: 200 }));
      }
      return new Promise<Response>((resolve) =>
        releases.push(() => resolve(new Response("{}", { status: 200 }))),
      );
    });
    vi.stubGlobal("window", { location: { pathname: "/en" } });
    const { backgroundApiFetch, clientApiFetch } =
      await import("@/lib/budget-fetch");
    const { BACKGROUND_LIMIT } = await import("@/lib/request-pool");

    // Fill the background slots and queue more behind them.
    const bg = Array.from({ length: BACKGROUND_LIMIT + 3 }, () =>
      backgroundApiFetch("/wallets"),
    );
    for (let i = 0; i < 20; i++) await Promise.resolve();
    await clientApiFetch("/urgent");
    expect(foregroundRan).toBe(true);
    // Drain in rounds: freeing a slot lets a QUEUED call start, which enqueues
    // its own release. One pass only settles the calls already in flight.
    for (let round = 0; round < 10 && releases.length; round++) {
      while (releases.length) releases.shift()!();
      for (let i = 0; i < 20; i++) await Promise.resolve();
    }
    await Promise.all(bg);
  });
});

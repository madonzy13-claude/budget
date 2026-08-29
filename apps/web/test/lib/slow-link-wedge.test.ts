/**
 * slow-link-wedge.test.ts — the app must stay usable on a BAD link, not just a
 * dead one.
 *
 * Reported 260829: browsing normally, the connection degraded (not lost), the
 * user opened a budget that had never been visited, and from that moment the
 * app was stuck — including pages that had already loaded once.
 *
 * `navigator.onLine` stays TRUE on a slow link, so not one of the offline
 * affordances fires. Nothing is refused, nothing is reported; everything just
 * waits. Two unbounded waits turn that into a wedge:
 *
 *  1. READS have no timeout. `clientApiFetch` awaits `fetch` forever while
 *     holding one of the six pool slots. Opening an un-warmed budget fires the
 *     biggest burst in the app, so six of them hang, `inFlight` sticks at
 *     POOL_LIMIT, and every later read — foreground taps included — queues
 *     behind them for the life of the page. That is why pages that HAD loaded
 *     stopped working: their shells still paint from the SW cache, but no query
 *     underneath them can ever get a slot. Writes were already bounded
 *     (offline-write races at 6s); reads were not.
 *
 *  2. An UNCACHED navigation awaits the network with no bound and no fallback,
 *     so the one route the user was trying to reach hangs indefinitely.
 *
 * Both are asserted here rather than in E2E: Chromium cannot be made to hold a
 * request open under a live service worker on demand, and the property under
 * test is a timeout, which a fake clock proves exactly and a real network
 * proves only flakily.
 */
import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";

/** A fetch that never settles — a request on a link that has gone to treacle. */
function hangingFetch(): { calls: number; fn: typeof fetch } {
  const state = { calls: 0 };
  return {
    get calls() {
      return state.calls;
    },
    fn: (() => {
      state.calls += 1;
      return new Promise<Response>(() => {
        /* never settles, never rejects */
      });
    }) as unknown as typeof fetch,
  };
}

describe("a read on a slow link", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  test("gives its pool slot back instead of holding it for the life of the page", async () => {
    const hung = hangingFetch();
    vi.stubGlobal("fetch", hung.fn);
    vi.stubGlobal("navigator", { onLine: true });

    const { clientApiFetch } = await import("@/lib/budget-fetch");
    const { POOL_LIMIT } = await import("@/lib/request-pool");

    // Saturate every slot with requests that will never come back.
    const stuck = Array.from({ length: POOL_LIMIT }, (_, i) =>
      clientApiFetch(`/budgets/hung-${i}`).catch(() => "rejected"),
    );
    await vi.advanceTimersByTimeAsync(0);
    expect(hung.calls).toBe(POOL_LIMIT);

    // The tap the person is actually waiting on.
    let seventhStarted = false;
    const seventh = clientApiFetch("/budgets/the-one-the-user-tapped")
      .catch(() => "rejected")
      .finally(() => {
        seventhStarted = true;
      });

    // Well past any sane bound for a read.
    await vi.advanceTimersByTimeAsync(30_000);

    // Each stuck read must have aborted and released its slot, letting the
    // seventh through. Without a read timeout it never runs at all.
    expect(seventhStarted).toBe(true);
    await Promise.all([...stuck, seventh]);
  });

  test("rejects rather than leaving the caller's promise pending for ever", async () => {
    const hung = hangingFetch();
    vi.stubGlobal("fetch", hung.fn);
    vi.stubGlobal("navigator", { onLine: true });

    const { clientApiFetch } = await import("@/lib/budget-fetch");

    let settled: "resolved" | "rejected" | "pending" = "pending";
    const p = clientApiFetch("/budgets/never-answers").then(
      () => (settled = "resolved"),
      () => (settled = "rejected"),
    );

    await vi.advanceTimersByTimeAsync(30_000);
    expect(settled).toBe("rejected");
    await p;
  });
});

describe("an uncached navigation on a slow link", () => {
  test("falls back to the app shell instead of awaiting the network for ever", async () => {
    vi.useFakeTimers();
    try {
      const { handleNavigationRequest } = await import("@/../sw-offline");

      const shell = new Response("<html>shell</html>", {
        status: 200,
        headers: { "content-type": "text/html" },
      });

      const res = handleNavigationRequest(
        new Request("https://app.test/en/budgets/never-visited/overview"),
        () =>
          new Promise<Response>(() => {
            /* the slow link: never settles */
          }),
        async () => undefined, // nothing cached for this route
        () => {},
        async () => shell,
        false, // navigator.onLine === true — the whole point
      );

      let done = false;
      void res.then(() => (done = true));

      await vi.advanceTimersByTimeAsync(30_000);
      expect(done).toBe(true);
      expect(await (await res).text()).toContain("shell");
    } finally {
      vi.useRealTimers();
    }
  });
});

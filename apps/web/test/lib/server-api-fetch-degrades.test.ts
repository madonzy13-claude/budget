/**
 * server-api-fetch-degrades.test.ts — an unreachable API must not blow up the
 * page (260808).
 *
 * Every caller of serverApiFetch already has a graceful `!res.ok` branch: the
 * BDP's membership gate fails open, reservesEnabled defaults to true, the task
 * list comes back empty. None of that ran when the API was merely UNREACHABLE,
 * because a rejected fetch skips the ok-check entirely and throws out of the
 * server component — straight into (app)/error.tsx, which is the "Something
 * went wrong" page a user saw on switching budgets mid-deploy.
 *
 * So a network failure becomes a 503 Response: the same path a 5xx already
 * takes, and the shell keeps rendering while the client panes serve cache.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({
  cookies: async () => ({ getAll: () => [{ name: "s", value: "1" }] }),
}));

const { serverApiFetch } = await import("../../src/lib/budget-fetch.server");

beforeEach(() => vi.unstubAllGlobals());
afterEach(() => vi.unstubAllGlobals());

describe("serverApiFetch when the API cannot be reached", () => {
  it("degrades to 503 instead of throwing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new TypeError("fetch failed")),
    );
    const res = await serverApiFetch(null, "/budgets/active");
    expect(res.ok).toBe(false);
    expect(res.status).toBe(503);
  });

  it("degrades the same way when the call times out", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(
        Object.assign(new Error("The operation was aborted"), {
          name: "TimeoutError",
        }),
      ),
    );
    expect((await serverApiFetch("b1", "/budgets/b1")).status).toBe(503);
  });

  it("gives up rather than hanging a render forever", async () => {
    const spy = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", spy);
    await serverApiFetch(null, "/budgets/active");
    const init = spy.mock.calls[0]![1] as RequestInit;
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("passes a real response through untouched", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ budgets: [{ id: "b1" }] }), {
          status: 200,
        }),
      ),
    );
    const res = await serverApiFetch(null, "/budgets/active");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ budgets: [{ id: "b1" }] });
  });

  it("still reports a 401 as a 401 — that is an answer, not an outage", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("no", { status: 401 })),
    );
    expect((await serverApiFetch(null, "/budgets/active")).status).toBe(401);
  });
});

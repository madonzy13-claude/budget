import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { clientApiFetch } from "../../src/lib/budget-fetch";
import { subscribeApiReachability } from "../../src/lib/api-unreachable-bus";

let events: string[];
let unsub: () => void;
beforeEach(() => {
  events = [];
  unsub = subscribeApiReachability((e) => events.push(e));
});
afterEach(() => {
  unsub();
  vi.unstubAllGlobals();
});

describe("clientApiFetch reachability reporting", () => {
  it("reports 'ok' on a 2xx response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("{}", { status: 200 })),
    );
    await clientApiFetch("/budgets/x/transactions");
    expect(events).toContain("ok");
    expect(events).not.toContain("unreachable");
  });

  it("reports 'ok' on a 4xx (API is up, just rejecting)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("{}", { status: 403 })),
    );
    await clientApiFetch("/budgets/x/transactions");
    expect(events).toEqual(["ok"]);
  });

  it("reports 'unreachable' on a 5xx", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("err", { status: 503 })),
    );
    await clientApiFetch("/budgets/x/transactions");
    expect(events).toContain("unreachable");
  });

  it("reports 'unreachable' when fetch rejects (network down)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new TypeError("Failed to fetch")),
    );
    await expect(clientApiFetch("/budgets/x/transactions")).rejects.toThrow();
    expect(events).toContain("unreachable");
  });
});

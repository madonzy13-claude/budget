import { describe, test, expect } from "bun:test";
import { ok } from "@budget/shared-kernel";
import { cacheReservePositions } from "../src/application/reserve-positions-cache";

/**
 * 261102: one Overview page load replays the reserve engine ~6 times (cards,
 * planned, overspent, reserve-fit, projection, reserves), ~50ms each on a real
 * budget, and /budgets/aggregate once per budget. Reads inside a GET share one
 * result; anything that writes always replays fresh.
 */
function counting() {
  let calls = 0;
  const fn = async (i: { tenantId: string; budgetId: string; month?: string }) => {
    calls++;
    await Promise.resolve();
    return ok({ n: calls, budgetId: i.budgetId } as never);
  };
  return { fn, calls: () => calls };
}
const IN = { tenantId: "t1", budgetId: "b1" };

describe("reserve positions read cache", () => {
  test("concurrent reads inside a GET share one replay", async () => {
    const c = counting();
    const cache = cacheReservePositions(c.fn);
    await cache.readScope(() =>
      Promise.all([cache.get(IN), cache.get(IN), cache.get(IN)]),
    );
    expect(c.calls()).toBe(1);
  });

  test("a later GET within the TTL reuses the result", async () => {
    const c = counting();
    let now = 0;
    const cache = cacheReservePositions(c.fn, { ttlMs: 10_000, now: () => now });
    await cache.readScope(() => cache.get(IN));
    now = 9_000;
    await cache.readScope(() => cache.get(IN));
    now = 11_000;
    await cache.readScope(() => cache.get(IN));
    expect(c.calls()).toBe(2);
  });

  test("outside a GET (writes, worker) it always replays", async () => {
    const c = counting();
    const cache = cacheReservePositions(c.fn);
    await cache.readScope(() => cache.get(IN));
    await cache.get(IN);
    await cache.get(IN);
    expect(c.calls()).toBe(3);
  });

  test("a write invalidates — the next GET replays", async () => {
    const c = counting();
    const cache = cacheReservePositions(c.fn);
    await cache.readScope(() => cache.get(IN));
    cache.invalidate();
    await cache.readScope(() => cache.get(IN));
    expect(c.calls()).toBe(2);
  });

  test("a replay that was in flight across a write is not reused after it", async () => {
    const c = counting();
    const cache = cacheReservePositions(c.fn);
    const before = cache.readScope(() => cache.get(IN));
    cache.invalidate();
    await before;
    await cache.readScope(() => cache.get(IN));
    expect(c.calls()).toBe(2);
  });

  test("different budgets or months are separate", async () => {
    const c = counting();
    const cache = cacheReservePositions(c.fn);
    await cache.readScope(async () => {
      await cache.get(IN);
      await cache.get({ ...IN, budgetId: "b2", tenantId: "b2" });
      await cache.get({ ...IN, month: "2026-10" });
    });
    expect(c.calls()).toBe(3);
  });

  test("a failed replay is not cached", async () => {
    let calls = 0;
    const cache = cacheReservePositions(async () => {
      calls++;
      throw new Error("db down");
    });
    await cache.readScope(() => cache.get(IN).catch(() => null));
    await cache.readScope(() => cache.get(IN).catch(() => null));
    expect(calls).toBe(2);
  });
});

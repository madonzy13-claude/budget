import { describe, test, expect } from "bun:test";
import { Hono } from "hono";
import { cacheReservePositions } from "@budget/budgeting/src/application/reserve-positions-cache";
import { reserveReadCacheMiddleware } from "../../src/middleware/reserve-read-cache";

// 261102: GETs share one reserve replay; any write drops what was cached.
function world() {
  let replays = 0;
  const cache = cacheReservePositions(async () => ok(++replays));
  const app = new Hono();
  app.use(reserveReadCacheMiddleware(cache));
  app.get("/r", async (c) => c.json(await cache.get({ tenantId: "t", budgetId: "b" })));
  app.post("/w", async (c) => c.json(await cache.get({ tenantId: "t", budgetId: "b" })));
  return { app, replays: () => replays };
}
const ok = (n: number) => ({ n });

describe("reserve read cache middleware", () => {
  test("two GETs replay once", async () => {
    const w = world();
    await w.app.request("/r");
    await w.app.request("/r");
    expect(w.replays()).toBe(1);
  });

  test("a write replays fresh and the GET after it replays again", async () => {
    const w = world();
    await w.app.request("/r");
    await w.app.request("/w", { method: "POST" });
    await w.app.request("/r");
    expect(w.replays()).toBe(3);
  });
});

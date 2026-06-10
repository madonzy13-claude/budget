/**
 * test-clock.ts — gated, test-only endpoint to move the server clock.
 *
 * Mounted by app.ts ONLY when `testClockEnabled()` (NODE_ENV !== "production"
 * AND ALLOW_TEST_CLOCK === "1"). In production the mount branch is dead, so this
 * route does not exist (404). The setter itself re-checks the gate, so even a
 * mistaken mount cannot install an override in prod. Used by the E2E reserve
 * golden walk to drive a May→June timeline.
 *
 *   POST /test/clock { "now": "2026-05-15T12:00:00Z" }  → install override
 *   DELETE /test/clock                                   → clear (back to real)
 */
import { Hono } from "hono";
import {
  setServerTestNow,
  serverNow,
  testClockEnabled,
} from "@budget/shared-kernel";

export function createTestClockRoute() {
  const app = new Hono();

  app.post("/", async (c) => {
    if (!testClockEnabled())
      return c.json({ error: "test clock disabled" }, 403);
    const body = (await c.req.json().catch(() => ({}))) as { now?: unknown };
    const now =
      typeof body.now === "string" ? new Date(body.now) : new Date(NaN);
    if (Number.isNaN(now.getTime())) {
      return c.json({ error: "invalid 'now' (expected ISO string)" }, 400);
    }
    setServerTestNow(now);
    return c.json({ ok: true, now: serverNow().toISOString() });
  });

  app.delete("/", (c) => {
    setServerTestNow(null);
    return c.json({ ok: true, now: serverNow().toISOString() });
  });

  return app;
}

/**
 * server-clock.ts — gated, test-only override of the server "now".
 *
 * Default behaviour is ALWAYS the real wall clock. An override can be installed
 * ONLY when the explicit opt-in env var is present:
 *   - process.env.ALLOW_TEST_CLOCK === "1"
 *
 * This var is set ONLY in the dev docker-compose and is NEVER set in any
 * production deployment, so in prod `serverNow()` is exactly `new Date()` and the
 * setter is a hard no-op — the endpoint that would set it is not even mounted.
 * (We deliberately do NOT also gate on NODE_ENV: the dev Docker image runs with
 * NODE_ENV=production, identical to prod, so NODE_ENV cannot distinguish the two
 * — the named, default-off opt-in is the real and sole gate.) The override is
 * in-memory (vanishes on restart) and has no UI surface. It exists so the E2E
 * suite can drive a multi-month reserve timeline (May→June) the wall clock can't.
 */
let testNowOverride: Date | null = null;
let monotonicMs = 0;

/** True only in a process that has explicitly opted in via ALLOW_TEST_CLOCK=1. */
export function testClockEnabled(): boolean {
  return process.env.ALLOW_TEST_CLOCK === "1";
}

/**
 * The server's current time. Returns the installed test override when (and only
 * when) the gate is on; otherwise the real clock.
 *
 * In override mode each call advances by one MONOTONIC millisecond. Append-only
 * rows stamped with `occurred_at = serverNow()` (e.g. reserve adjustments) are
 * ordered by that timestamp on read; without the monotonic tick a fixed override
 * instant would stamp every write in a phase with the SAME time, making their
 * fold order non-deterministic. The +1ms/call keeps every write within the
 * overridden month while preserving strict insertion order. (Prod uses the real
 * clock, which advances on its own.)
 */
export function serverNow(): Date {
  if (testNowOverride !== null && testClockEnabled()) {
    return new Date(testNowOverride.getTime() + monotonicMs++);
  }
  return new Date();
}

/**
 * Install (or clear, with null) the test override. Returns false and does nothing
 * when the gate is off — so a production process can never set it, even if this
 * is somehow called. Resets the monotonic offset so each phase starts at the
 * month's anchor instant.
 */
export function setServerTestNow(value: Date | null): boolean {
  if (!testClockEnabled()) return false;
  testNowOverride = value === null ? null : new Date(value);
  monotonicMs = 0;
  return true;
}

/**
 * server-clock.test.ts — the gate, not the convenience.
 *
 * serverNow() can be overridden so the E2E reserves walk can drive a May→June
 * timeline. The thing worth asserting is that it CANNOT be overridden anywhere
 * else: the dev image runs with NODE_ENV=production, identical to prod, so
 * ALLOW_TEST_CLOCK is the sole gate standing between a test hook and a
 * production process stamping ledger rows at an attacker-chosen instant.
 */
import { test, expect, describe, afterEach } from "bun:test";
import {
  serverNow,
  setServerTestNow,
  testClockEnabled,
} from "../src/server-clock";

const ORIGINAL = process.env.ALLOW_TEST_CLOCK;

function withGate(on: boolean) {
  if (on) process.env.ALLOW_TEST_CLOCK = "1";
  else delete process.env.ALLOW_TEST_CLOCK;
}

afterEach(() => {
  // Clear any override while the gate is still open, then restore the env —
  // leaking either would hand the next test file a frozen clock.
  withGate(true);
  setServerTestNow(null);
  if (ORIGINAL === undefined) delete process.env.ALLOW_TEST_CLOCK;
  else process.env.ALLOW_TEST_CLOCK = ORIGINAL;
});

describe("gate off (production)", () => {
  test("testClockEnabled is false unless the opt-in is exactly '1'", () => {
    withGate(false);
    expect(testClockEnabled()).toBe(false);
    process.env.ALLOW_TEST_CLOCK = "true";
    expect(testClockEnabled()).toBe(false);
    process.env.ALLOW_TEST_CLOCK = "0";
    expect(testClockEnabled()).toBe(false);
  });

  test("setServerTestNow refuses and changes nothing", () => {
    withGate(false);
    expect(setServerTestNow(new Date("2001-01-01T00:00:00Z"))).toBe(false);
    expect(serverNow().getTime()).toBeCloseTo(Date.now(), -3);
  });

  test("an override installed while open is inert once the gate closes", () => {
    withGate(true);
    expect(setServerTestNow(new Date("2001-01-01T00:00:00Z"))).toBe(true);
    withGate(false);
    // The value is still in memory; the gate is what makes it unreachable.
    expect(serverNow().getFullYear()).toBeGreaterThan(2001);
  });
});

describe("gate on (dev / E2E)", () => {
  test("installs the override and advances one monotonic ms per call", () => {
    withGate(true);
    const anchor = new Date("2026-05-15T12:00:00Z");
    expect(setServerTestNow(anchor)).toBe(true);

    const first = serverNow().getTime();
    const second = serverNow().getTime();
    const third = serverNow().getTime();

    expect(first).toBe(anchor.getTime());
    // Strictly increasing: append-only rows stamped with serverNow() are folded
    // in timestamp order, so a fixed instant would make their order undefined.
    expect(second).toBe(first + 1);
    expect(third).toBe(second + 1);
  });

  test("re-installing resets the monotonic offset to the anchor", () => {
    withGate(true);
    const anchor = new Date("2026-06-01T00:00:00Z");
    setServerTestNow(anchor);
    serverNow();
    serverNow();
    setServerTestNow(anchor);
    expect(serverNow().getTime()).toBe(anchor.getTime());
  });

  test("null clears it and hands back the real clock", () => {
    withGate(true);
    setServerTestNow(new Date("2001-01-01T00:00:00Z"));
    expect(setServerTestNow(null)).toBe(true);
    expect(serverNow().getTime()).toBeCloseTo(Date.now(), -3);
  });

  test("the stored override is a copy — mutating the caller's Date cannot move it", () => {
    withGate(true);
    const anchor = new Date("2026-05-15T12:00:00Z");
    setServerTestNow(anchor);
    anchor.setFullYear(1999);
    expect(serverNow().getFullYear()).toBe(2026);
  });
});

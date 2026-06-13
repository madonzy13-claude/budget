/**
 * pool.test.ts — Structural assertions for appPool configuration.
 *
 * Does NOT require a live DB — asserts the Pool config object only.
 * Uses resetPools() so each test gets a fresh singleton.
 *
 * 260613-dn1 #2: appPool must have an explicit max:25 to prevent the default-10
 * contention that caused 6.7× serial collapse on the 12-budget home page.
 */
import { describe, it, expect, beforeEach } from "bun:test";
import { resetPools, appPool } from "../src/db/pool";

// appPool() reads DATABASE_URL_APP from env — provide a fake one so the
// Pool constructor doesn't throw. The Pool object is created lazily; we
// only inspect its options, never connect.
const FAKE_URL =
  process.env["DATABASE_URL_APP"] ??
  "postgresql://app:password@localhost:5432/budget_test";

beforeEach(() => {
  process.env["DATABASE_URL_APP"] = FAKE_URL;
  resetPools();
});

describe("appPool", () => {
  it("has max === 25 (PERF 260613-dn1 #2: prevent default-10 contention)", () => {
    const pool = appPool();
    // node-postgres Pool exposes its constructor options on `pool.options`.
    expect((pool as any).options.max).toBe(25);
  });

  it("returns the same singleton on repeated calls", () => {
    const a = appPool();
    const b = appPool();
    expect(a).toBe(b);
  });

  it("returns a fresh pool after resetPools()", () => {
    const a = appPool();
    resetPools();
    const b = appPool();
    expect(a).not.toBe(b);
  });
});

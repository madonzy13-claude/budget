import { describe, test, expect } from "bun:test";
import type { Pool } from "pg";
import { DrizzleFxRateCacheRepo } from "../src/adapters/persistence/fx-rate-cache-repo";

/**
 * A single request re-reads the SAME (base, quote, date) up to 15 times.
 * Measured 2026-08-17 against live traces: GET /budgets/aggregate issued 15
 * identical fx_rates lookups (201ms), GET .../overview/cards issued 13 (~651ms
 * of a 1173ms request). Postgres executes that query in 0.082ms — the cost is
 * entirely round-trips queueing on a 25-connection pool during the page-load
 * burst, so the fix is to stop asking, not to tune the query.
 */

function countingPool(rows: Array<Record<string, string>>) {
  const calls: string[] = [];
  const pool = {
    query: async (config: unknown) => {
      const text =
        typeof config === "string"
          ? config
          : ((config as { text?: string }).text ?? "");
      calls.push(text);
      return { rows, rowCount: rows.length, command: "SELECT", fields: [] };
    },
  } as unknown as Pool;
  return { pool, calls };
}

const RATE = [{ rate: "4.25", date: "2026-08-17" }];

describe("FX rate lookup memoisation", () => {
  test("repeats within the TTL hit the cache, not the database", async () => {
    const { pool, calls } = countingPool(RATE);
    const repo = new DrizzleFxRateCacheRepo(pool);

    for (let i = 0; i < 13; i++) {
      await repo.lookup("EUR", "PLN", "2026-08-17");
    }

    const selects = calls.filter((q) => q.includes("FROM budgeting.fx_rates"));
    expect(selects).toHaveLength(1);
  });

  test("returns the same value from cache as from the database", async () => {
    const { pool } = countingPool(RATE);
    const repo = new DrizzleFxRateCacheRepo(pool);

    const first = await repo.lookup("EUR", "PLN", "2026-08-17");
    const second = await repo.lookup("EUR", "PLN", "2026-08-17");

    expect(second).toEqual(first);
    expect(second).toEqual({ rate: "4.25", date: "2026-08-17" });
  });

  test("a different currency pair or date is a separate entry", async () => {
    const { pool, calls } = countingPool(RATE);
    const repo = new DrizzleFxRateCacheRepo(pool);

    await repo.lookup("EUR", "PLN", "2026-08-17");
    await repo.lookup("USD", "PLN", "2026-08-17");
    await repo.lookup("EUR", "PLN", "2026-08-16");

    expect(calls.filter((q) => q.includes("FROM budgeting.fx_rates"))).toHaveLength(3);
  });

  test("a MISS is cached too — an absent rate must not re-query every call", async () => {
    const { pool, calls } = countingPool([]);
    const repo = new DrizzleFxRateCacheRepo(pool);

    expect(await repo.lookup("EUR", "XAU", "2026-08-17")).toBeNull();
    expect(await repo.lookup("EUR", "XAU", "2026-08-17")).toBeNull();

    expect(calls.filter((q) => q.includes("FROM budgeting.fx_rates"))).toHaveLength(1);
  });

  test("the entry expires once the TTL passes", async () => {
    const { pool, calls } = countingPool(RATE);
    let now = 1_000_000;
    const repo = new DrizzleFxRateCacheRepo(pool, {
      cacheTtlMs: 60_000,
      now: () => now,
    });

    await repo.lookup("EUR", "PLN", "2026-08-17");
    now += 59_000;
    await repo.lookup("EUR", "PLN", "2026-08-17");
    now += 2_000; // now past the TTL
    await repo.lookup("EUR", "PLN", "2026-08-17");

    expect(calls.filter((q) => q.includes("FROM budgeting.fx_rates"))).toHaveLength(2);
  });

  test("upsert refreshes the cached rate — a write must never leave a stale rate readable", async () => {
    // The worker upserts today's rate daily. Without write-through, a cached
    // entry would keep serving yesterday's number for the rest of the TTL, and
    // this application converts money with it.
    const { pool } = countingPool(RATE);
    const repo = new DrizzleFxRateCacheRepo(pool);

    await repo.lookup("EUR", "PLN", "2026-08-17");
    await repo.upsert("EUR", "PLN", "2026-08-17", "4.99", "frankfurter");

    expect(await repo.lookup("EUR", "PLN", "2026-08-17")).toEqual({
      rate: "4.99",
      date: "2026-08-17",
    });
  });

  test("the cache is bounded so a long-lived process cannot grow without limit", async () => {
    const { pool, calls } = countingPool(RATE);
    const repo = new DrizzleFxRateCacheRepo(pool, { maxEntries: 3 });

    for (const d of ["01", "02", "03", "04"]) {
      await repo.lookup("EUR", "PLN", `2026-08-${d}`);
    }
    // The oldest entry was evicted, so re-reading it queries again.
    await repo.lookup("EUR", "PLN", "2026-08-01");

    expect(calls.filter((q) => q.includes("FROM budgeting.fx_rates"))).toHaveLength(5);
  });
});

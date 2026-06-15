/**
 * use-cache-on-fetch.test.ts — cacheBudgetSnapshot helper (B4 cache write-path)
 *
 * After cacheBudgetSnapshot:
 *   - getCachedBudget(id) is non-null
 *   - wallets/categories rows are readable from IndexedDB
 *   - getSyncMeta(id) returns the iso timestamp
 *
 * A no-data / partial call writes nothing and is a no-op (error path isolation).
 */
import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach } from "vitest";
import { wipeBudgetCache } from "../src/lib/offline-cache";
import {
  getCachedBudget,
  getSyncMeta,
  openBudgetDB,
} from "../src/lib/offline-cache";
import { cacheBudgetSnapshot } from "../src/hooks/use-cache-on-fetch";

beforeEach(async () => {
  await wipeBudgetCache();
});

const ISO = "2026-06-10T19:00:00.000Z";

const budget = { id: "b-001", name: "Family Budget", currency: "USD" };
const wallets = [{ id: "w-001", name: "Checking", balanceCents: 100000 }];
const categories = [{ id: "cat-001", name: "Food", plannedCents: 50000 }];
const transactions = [
  { _cacheKey: "b-001:2026-06:txn-001", id: "txn-001", amountCents: 1500 },
];

describe("cacheBudgetSnapshot — full payload", () => {
  it("makes getCachedBudget return non-null after snapshot", async () => {
    await cacheBudgetSnapshot({
      budgetId: "b-001",
      budget,
      wallets,
      categories,
      transactions,
      iso: ISO,
    });
    const result = await getCachedBudget("b-001");
    expect(result).not.toBeNull();
    expect((result as typeof budget).name).toBe("Family Budget");
  });

  it("makes wallet rows readable from IndexedDB", async () => {
    await cacheBudgetSnapshot({
      budgetId: "b-001",
      budget,
      wallets,
      categories,
      transactions,
      iso: ISO,
    });
    const db = await openBudgetDB();
    const w = await db.get("wallets", "w-001");
    expect(w).toEqual(wallets[0]);
    db.close();
  });

  it("makes category rows readable from IndexedDB", async () => {
    await cacheBudgetSnapshot({
      budgetId: "b-001",
      budget,
      wallets,
      categories,
      transactions,
      iso: ISO,
    });
    const db = await openBudgetDB();
    const c = await db.get("categories", "cat-001");
    expect(c).toEqual(categories[0]);
    db.close();
  });

  it("makes transactions readable via _cacheKey", async () => {
    await cacheBudgetSnapshot({
      budgetId: "b-001",
      budget,
      wallets,
      categories,
      transactions,
      iso: ISO,
    });
    const db = await openBudgetDB();
    const t = await db.get("transactions", "b-001:2026-06:txn-001");
    expect(t).toEqual(transactions[0]);
    db.close();
  });

  it("getSyncMeta returns the iso after snapshot", async () => {
    await cacheBudgetSnapshot({
      budgetId: "b-001",
      budget,
      wallets,
      categories,
      transactions,
      iso: ISO,
    });
    const meta = await getSyncMeta("b-001");
    expect(meta).toBe(ISO);
  });

  // 260615-d76: every cache write ALSO bumps a global "__global__" key so the
  // budget-list/home route (budgetId null) can show a real cache age.
  it("also writes the global __global__ sync-meta key", async () => {
    await cacheBudgetSnapshot({
      budgetId: "b-001",
      budget,
      wallets,
      categories,
      transactions,
      iso: ISO,
    });
    const global = await getSyncMeta("__global__");
    expect(global).toBe(ISO);
  });
});

describe("cacheBudgetSnapshot — no-data / partial payload", () => {
  it("is a no-op when budget is null (error path leaves cache intact)", async () => {
    // Pre-populate with a valid budget
    await cacheBudgetSnapshot({
      budgetId: "b-001",
      budget,
      wallets,
      categories,
      transactions,
      iso: ISO,
    });
    const before = await getCachedBudget("b-001");
    expect(before).not.toBeNull();

    // Calling with null budget should not overwrite
    await cacheBudgetSnapshot({
      budgetId: "b-001",
      budget: null,
      wallets: null,
      categories: null,
      transactions: null,
      iso: null,
    });

    // Cache should still be intact
    const after = await getCachedBudget("b-001");
    expect(after).not.toBeNull();
    expect((after as typeof budget).name).toBe("Family Budget");
  });

  it("writes nothing when the entire payload is empty", async () => {
    await cacheBudgetSnapshot({
      budgetId: "b-002",
      budget: null,
      wallets: null,
      categories: null,
      transactions: null,
      iso: null,
    });
    const result = await getCachedBudget("b-002");
    expect(result).toBeNull();
    const meta = await getSyncMeta("b-002");
    expect(meta).toBeNull();
  });
});

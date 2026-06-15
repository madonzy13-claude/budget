/**
 * offline-cache.test.ts — IndexedDB cache layer (PWAX-02)
 *
 * Uses fake-indexeddb to exercise the real idb calls in happy-dom.
 * Each test gets a fresh DB via beforeEach wipeBudgetCache().
 */
import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach } from "vitest";
import {
  openBudgetDB,
  getCachedBudget,
  setCachedEntities,
  setSyncMeta,
  getSyncMeta,
  getMostRecentSyncMeta,
  wipeBudgetCache,
} from "../src/lib/offline-cache";

beforeEach(async () => {
  await wipeBudgetCache();
});

describe("openBudgetDB", () => {
  it("creates all 5 object stores without error", async () => {
    const db = await openBudgetDB();
    expect(db.objectStoreNames).toContain("budgets");
    expect(db.objectStoreNames).toContain("wallets");
    expect(db.objectStoreNames).toContain("categories");
    expect(db.objectStoreNames).toContain("transactions");
    expect(db.objectStoreNames).toContain("sync-meta");
    // Robust-minimal offline (260614-q1v): offline-queue store dropped in v2.
    expect(db.objectStoreNames).not.toContain("offline-queue");
    db.close();
  });

  it("opening twice returns a usable DB without error", async () => {
    const db1 = await openBudgetDB();
    db1.close();
    const db2 = await openBudgetDB();
    expect(db2.objectStoreNames).toContain("budgets");
    db2.close();
  });
});

describe("getCachedBudget", () => {
  it("returns null for an unseeded budgetId (D-04 cold cache)", async () => {
    const result = await getCachedBudget("non-existent-id");
    expect(result).toBeNull();
  });

  it("returns the cached object after a put via setCachedEntities", async () => {
    const budget = { id: "budget-123", name: "My Budget", currency: "USD" };
    await setCachedEntities("budgets", [budget]);
    const result = await getCachedBudget("budget-123");
    expect(result).toEqual(budget);
  });
});

describe("setCachedEntities", () => {
  it("makes wallets rows readable by id after bulk put", async () => {
    const wallets = [
      { id: "wallet-1", name: "Checking", balanceCents: 100000 },
      { id: "wallet-2", name: "Savings", balanceCents: 500000 },
    ];
    await setCachedEntities("wallets", wallets);
    const db = await openBudgetDB();
    const w1 = await db.get("wallets", "wallet-1");
    expect(w1).toEqual(wallets[0]);
    const w2 = await db.get("wallets", "wallet-2");
    expect(w2).toEqual(wallets[1]);
    db.close();
  });

  it("makes categories rows readable after put", async () => {
    const cats = [{ id: "cat-1", name: "Food", budgetCents: 50000 }];
    await setCachedEntities("categories", cats);
    const db = await openBudgetDB();
    const c = await db.get("categories", "cat-1");
    expect(c).toEqual(cats[0]);
    db.close();
  });

  it("makes transactions readable via _cacheKey", async () => {
    const txns = [
      {
        _cacheKey: "budget-1:2026-06:txn-1",
        id: "txn-1",
        amountCents: 2500,
      },
    ];
    await setCachedEntities("transactions", txns);
    const db = await openBudgetDB();
    const t = await db.get("transactions", "budget-1:2026-06:txn-1");
    expect(t).toEqual(txns[0]);
    db.close();
  });
});

describe("setSyncMeta / getSyncMeta", () => {
  it("round-trips an ISO timestamp per budgetId", async () => {
    const iso = "2026-06-10T18:00:00.000Z";
    await setSyncMeta("budget-abc", iso);
    const result = await getSyncMeta("budget-abc");
    expect(result).toBe(iso);
  });

  it("returns null when sync-meta has not been set for a budgetId", async () => {
    const result = await getSyncMeta("budget-never-synced");
    expect(result).toBeNull();
  });

  it("overwrites previous sync-meta on repeated calls", async () => {
    await setSyncMeta("budget-abc", "2026-06-01T00:00:00.000Z");
    const newIso = "2026-06-10T18:00:00.000Z";
    await setSyncMeta("budget-abc", newIso);
    const result = await getSyncMeta("budget-abc");
    expect(result).toBe(newIso);
  });
});

describe("getMostRecentSyncMeta (260615-d76 global cache-age fallback)", () => {
  it("returns null when no sync-meta rows exist", async () => {
    const result = await getMostRecentSyncMeta();
    expect(result).toBeNull();
  });

  it("returns the newest lastSyncedAt across ALL budget rows", async () => {
    await setSyncMeta("budget-a", "2026-06-01T00:00:00.000Z");
    await setSyncMeta("budget-b", "2026-06-10T18:00:00.000Z"); // newest
    await setSyncMeta("budget-c", "2026-06-05T12:00:00.000Z");
    const result = await getMostRecentSyncMeta();
    expect(result).toBe("2026-06-10T18:00:00.000Z");
  });

  it("includes the __global__ key in the max scan", async () => {
    await setSyncMeta("budget-a", "2026-06-01T00:00:00.000Z");
    await setSyncMeta("__global__", "2026-06-12T09:00:00.000Z"); // newest
    const result = await getMostRecentSyncMeta();
    expect(result).toBe("2026-06-12T09:00:00.000Z");
  });
});

describe("wipeBudgetCache", () => {
  it("deletes the DB so a subsequent getCachedBudget returns null (tenant isolation)", async () => {
    const budget = { id: "budget-xyz", name: "Before Wipe" };
    await setCachedEntities("budgets", [budget]);
    // Confirm it's there
    expect(await getCachedBudget("budget-xyz")).toEqual(budget);
    // Wipe
    await wipeBudgetCache();
    // Now it's gone
    const result = await getCachedBudget("budget-xyz");
    expect(result).toBeNull();
  });
});

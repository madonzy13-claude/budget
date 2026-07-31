/**
 * pending-spendings.test.ts — the offline spendings queue (260731-osq).
 *
 * A spending typed while offline is kept LOCALLY (localStorage) as a pending
 * entry instead of being rolled back, so it survives a tab/app close and is
 * retried when the connection returns.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  PENDING_SPENDINGS_KEY,
  addPendingSpending,
  listPendingSpendings,
  removePendingSpending,
  subscribePendingSpendings,
} from "../../src/lib/pending-spendings";

const base = {
  budgetId: "budget-1",
  month: "2026-07",
  categoryId: "cat-1",
  amountCents: 1234,
  currency: "USD",
  date: "2026-07-31",
  note: null,
};

describe("Pending spendings queue", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("adds an entry and returns it with a client id + idempotency key", () => {
    const entry = addPendingSpending(base);
    expect(entry.id).toMatch(/^pending-/);
    expect(entry.idempotencyKey).toBeTruthy();
    expect(entry.createdAt).toBeTruthy();
    expect(listPendingSpendings()).toHaveLength(1);
  });

  it("persists to localStorage so it survives a tab close", () => {
    addPendingSpending(base);
    const raw = localStorage.getItem(PENDING_SPENDINGS_KEY);
    expect(raw).toBeTruthy();
    // Simulate a fresh page: the module reads storage on every list().
    expect(JSON.parse(raw!)).toHaveLength(1);
    expect(listPendingSpendings()[0]!.amountCents).toBe(1234);
  });

  it("filters by budget + month", () => {
    addPendingSpending(base);
    addPendingSpending({ ...base, month: "2026-06", amountCents: 999 });
    addPendingSpending({ ...base, budgetId: "budget-2", amountCents: 555 });
    const mine = listPendingSpendings("budget-1", "2026-07");
    expect(mine).toHaveLength(1);
    expect(mine[0]!.amountCents).toBe(1234);
  });

  it("removes an entry by id (offline-capable delete)", () => {
    const a = addPendingSpending(base);
    addPendingSpending({ ...base, amountCents: 500 });
    removePendingSpending(a.id);
    expect(listPendingSpendings().map((e) => e.amountCents)).toEqual([500]);
  });

  it("notifies subscribers on add and remove", () => {
    const cb = vi.fn();
    const unsubscribe = subscribePendingSpendings(cb);
    const entry = addPendingSpending(base);
    expect(cb).toHaveBeenCalledTimes(1);
    removePendingSpending(entry.id);
    expect(cb).toHaveBeenCalledTimes(2);
    unsubscribe();
    addPendingSpending(base);
    expect(cb).toHaveBeenCalledTimes(2);
  });

  it("survives corrupt storage (returns an empty list, never throws)", () => {
    localStorage.setItem(PENDING_SPENDINGS_KEY, "{not json");
    expect(listPendingSpendings()).toEqual([]);
  });
});

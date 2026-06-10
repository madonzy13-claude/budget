/**
 * offline-queue.test.ts — offline write queue (PWAX-03)
 *
 * Uses fake-indexeddb to exercise real idb calls.
 * Each test gets a fresh DB via wipeBudgetCache().
 */
import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach } from "vitest";
import {
  enqueueOfflineTxn,
  getOfflineQueue,
  removeFromQueue,
  markQueueItemFailed,
} from "../src/lib/offline-queue";
import { wipeBudgetCache } from "../src/lib/offline-cache";

const makeTxn = (id = "key-001") => ({
  idempotencyKey: id,
  budgetId: "budget-123",
  payload: {
    date: "2026-06-10",
    category_id: "cat-1",
    amount_original_cents: 1500,
    currency_original: "USD",
    note: null,
  },
  enqueuedAt: "2026-06-10T18:00:00.000Z",
});

beforeEach(async () => {
  await wipeBudgetCache();
});

describe("enqueueOfflineTxn + getOfflineQueue", () => {
  it("returns the enqueued item with its idempotencyKey", async () => {
    const txn = makeTxn("key-001");
    await enqueueOfflineTxn(txn);
    const queue = await getOfflineQueue();
    expect(queue).toHaveLength(1);
    expect(queue[0].idempotencyKey).toBe("key-001");
    expect(queue[0].payload).toEqual(txn.payload);
  });

  it("preserves enqueuedAt timestamp", async () => {
    await enqueueOfflineTxn(makeTxn("key-002"));
    const queue = await getOfflineQueue();
    expect(queue[0].enqueuedAt).toBe("2026-06-10T18:00:00.000Z");
  });

  it("queues multiple items independently", async () => {
    await enqueueOfflineTxn(makeTxn("key-001"));
    await enqueueOfflineTxn(makeTxn("key-002"));
    const queue = await getOfflineQueue();
    expect(queue).toHaveLength(2);
    const keys = queue.map((q) => q.idempotencyKey).sort();
    expect(keys).toEqual(["key-001", "key-002"]);
  });
});

describe("removeFromQueue", () => {
  it("removes only the specified item", async () => {
    await enqueueOfflineTxn(makeTxn("key-001"));
    await enqueueOfflineTxn(makeTxn("key-002"));
    await removeFromQueue("key-001");
    const queue = await getOfflineQueue();
    expect(queue).toHaveLength(1);
    expect(queue[0].idempotencyKey).toBe("key-002");
  });

  it("is a no-op for a key that does not exist", async () => {
    await enqueueOfflineTxn(makeTxn("key-001"));
    await removeFromQueue("no-such-key");
    const queue = await getOfflineQueue();
    expect(queue).toHaveLength(1);
  });
});

describe("markQueueItemFailed", () => {
  it("sets failReason without losing the payload", async () => {
    const txn = makeTxn("key-001");
    await enqueueOfflineTxn(txn);
    await markQueueItemFailed("key-001", "VALIDATION_ERROR");
    const queue = await getOfflineQueue();
    expect(queue[0].failReason).toBe("VALIDATION_ERROR");
    expect(queue[0].payload).toEqual(txn.payload);
    expect(queue[0].idempotencyKey).toBe("key-001");
  });

  it("is a no-op when item not found", async () => {
    await markQueueItemFailed("ghost-key", "UNKNOWN");
    const queue = await getOfflineQueue();
    expect(queue).toHaveLength(0);
  });
});

/**
 * pending-spendings-key.test.ts — a queued write keeps the key of the attempt
 * that queued it (260806).
 *
 * A Playwright trace showed the whole chain: the POST aborted client-side while
 * the server had already written it, the abort was read as a failed write, the
 * entry went into the offline queue, and the queue replayed it under a FRESH
 * idempotency key. The server had no way to see the two as one write, so 180
 * typed once was recorded twice.
 *
 * The replay already sends the stored key; it just minted its own. Inheriting
 * the original is what lets the server recognise the repeat.
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  addPendingSpending,
  PENDING_SPENDINGS_KEY,
} from "@/lib/pending-spendings";

const base = {
  budgetId: "b1",
  month: "2026-08",
  categoryId: "c1",
  amountCents: 18000,
  currency: "EUR",
  date: "2026-08-06",
  note: null,
};

beforeEach(() => localStorage.removeItem(PENDING_SPENDINGS_KEY));

describe("addPendingSpending", () => {
  it("keeps the key of the attempt that failed", () => {
    const entry = addPendingSpending({
      ...base,
      idempotencyKey: "the-original-key",
    });
    expect(entry.idempotencyKey).toBe("the-original-key");
  });

  // An entry queued because the device KNOWS it is offline never made a request,
  // so it has no key to inherit and must still get one.
  it("mints a key when there was no attempt to inherit from", () => {
    const entry = addPendingSpending(base);
    expect(entry.idempotencyKey).toMatch(/^[0-9a-f-]{36}$/);
  });
});

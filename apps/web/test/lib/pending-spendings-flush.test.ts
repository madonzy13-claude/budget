/**
 * pending-spendings-flush.test.ts — retry of queued offline spendings.
 *
 * Contract: POST each queued entry with its STORED Idempotency-Key (a lost
 * response must not double-post), drop it on success, KEEP it when the server is
 * still unreachable, and drop it on a genuine 4xx (it can never succeed).
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { OfflineWriteError } from "../../src/lib/offline-write";

const mockWrite = vi.fn();
vi.mock("../../src/lib/offline-write", async () => {
  const actual = await vi.importActual<
    typeof import("../../src/lib/offline-write")
  >("../../src/lib/offline-write");
  return {
    ...actual,
    clientApiWrite: (...args: unknown[]) => mockWrite(...args),
  };
});

import {
  addPendingSpending,
  addPendingDraftConfirm,
  listPendingSpendings,
  flushPendingSpendings,
} from "../../src/lib/pending-spendings";

const base = {
  budgetId: "budget-1",
  month: "2026-07",
  categoryId: "cat-1",
  amountCents: 1234,
  currency: "USD",
  date: "2026-07-31",
  note: "lunch",
};

describe("Flushing pending spendings", () => {
  beforeEach(() => {
    localStorage.clear();
    mockWrite.mockReset();
  });

  it("posts each entry with its stored Idempotency-Key and clears them", async () => {
    const entry = addPendingSpending(base);
    addPendingSpending({ ...base, amountCents: 500 });
    mockWrite.mockResolvedValue({ ok: true, status: 201 });

    const result = await flushPendingSpendings();

    expect(result).toEqual({ saved: 2, failed: 0 });
    expect(mockWrite).toHaveBeenCalledTimes(2);
    const [path, init] = mockWrite.mock.calls[0]!;
    expect(path).toBe("/budgets/budget-1/transactions");
    expect(init.method).toBe("POST");
    expect(init.headers["Idempotency-Key"]).toBe(entry.idempotencyKey);
    expect(init.headers["X-Budget-ID"]).toBe("budget-1");
    expect(JSON.parse(init.body)).toMatchObject({
      category_id: "cat-1",
      amount_original_cents: 1234,
      currency_original: "USD",
      date: "2026-07-31",
      note: "lunch",
    });
    expect(listPendingSpendings()).toHaveLength(0);
  });

  it("KEEPS entries when the server is still unreachable", async () => {
    addPendingSpending(base);
    addPendingSpending({ ...base, amountCents: 500 });
    mockWrite.mockRejectedValue(new OfflineWriteError());

    const result = await flushPendingSpendings();

    expect(result).toEqual({ saved: 0, failed: 0 });
    // Stops at the first unreachable write — no point hammering the rest.
    expect(mockWrite).toHaveBeenCalledTimes(1);
    expect(listPendingSpendings()).toHaveLength(2);
  });

  it("drops an entry the server permanently rejects (4xx)", async () => {
    addPendingSpending(base);
    mockWrite.mockResolvedValue({
      ok: false,
      status: 422,
      text: async () => "category_not_found",
    });

    const result = await flushPendingSpendings();

    expect(result).toEqual({ saved: 0, failed: 1 });
    expect(listPendingSpendings()).toHaveLength(0);
  });

  it("is a no-op with an empty queue", async () => {
    expect(await flushPendingSpendings()).toEqual({ saved: 0, failed: 0 });
    expect(mockWrite).not.toHaveBeenCalled();
  });

  // 260731-osq round 2: a draft confirmed offline replays against the confirm
  // endpoint — NOT as a brand-new transaction (that would double-count it).
  describe("queued draft confirms", () => {
    const draft = {
      budgetId: "budget-1",
      month: "2026-07",
      draftId: "draft-9",
      amountOverrideCents: 2500,
    };

    it("replays against the draft-confirm endpoint with the override", async () => {
      const entry = addPendingDraftConfirm(draft);
      mockWrite.mockResolvedValue({ ok: true, status: 204 });

      expect(await flushPendingSpendings()).toEqual({ saved: 1, failed: 0 });

      const [path, init] = mockWrite.mock.calls[0]!;
      expect(path).toBe(
        "/budgets/budget-1/scheduled-payments/drafts/draft-9/confirm",
      );
      expect(init.method).toBe("POST");
      expect(init.headers["Idempotency-Key"]).toBe(entry.idempotencyKey);
      expect(JSON.parse(init.body)).toEqual({ amount_override_cents: 2500 });
      expect(listPendingSpendings()).toHaveLength(0);
    });

    it("sends an empty body when the amount was not overridden", async () => {
      addPendingDraftConfirm({ ...draft, amountOverrideCents: null });
      mockWrite.mockResolvedValue({ ok: true, status: 204 });

      await flushPendingSpendings();

      expect(JSON.parse(mockWrite.mock.calls[0]![1].body)).toEqual({});
    });

    it("drops a confirm the server rejects (draft already gone)", async () => {
      addPendingDraftConfirm(draft);
      mockWrite.mockResolvedValue({
        ok: false,
        status: 409,
        text: async () => "already_confirmed",
      });

      expect(await flushPendingSpendings()).toEqual({ saved: 0, failed: 1 });
      expect(listPendingSpendings()).toHaveLength(0);
    });

    it("keeps it while still offline", async () => {
      addPendingDraftConfirm(draft);
      mockWrite.mockRejectedValue(new OfflineWriteError());

      expect(await flushPendingSpendings()).toEqual({ saved: 0, failed: 0 });
      expect(listPendingSpendings()).toHaveLength(1);
    });
  });
});

/**
 * idempotency-per-operation.test.ts — one logical write, one key (260806).
 *
 * A create used to mint a fresh Idempotency-Key inside its mutationFn, with a
 * comment claiming the server would dedupe "if a response is lost on a flaky
 * link but the write actually landed". A fresh key per attempt can do no such
 * thing: dedupe needs the SAME key on the retry.
 *
 * A Playwright trace caught exactly the case it was meant to cover — the first
 * POST aborted (status -1) while the server still wrote it, the client tried
 * again, and the second attempt carried a new key and wrote a second
 * transaction. 180 typed once, 360 recorded.
 *
 * The key now belongs to the OPERATION: the same input object always yields the
 * same key, so every attempt at one create is recognisably one write.
 */
import { describe, it, expect } from "vitest";
import { idempotencyKeyFor } from "@/lib/idempotency";

describe("idempotencyKeyFor", () => {
  it("gives one operation the same key however often it is retried", () => {
    const op = { amountCents: 18000, categoryId: "c1" };
    expect(idempotencyKeyFor(op)).toBe(idempotencyKeyFor(op));
  });

  it("gives two separate operations different keys", () => {
    // Two identical coffees bought minutes apart are two writes, not one — the
    // key follows the operation, never the values it carries.
    const first = { amountCents: 18000, categoryId: "c1" };
    const second = { amountCents: 18000, categoryId: "c1" };
    expect(idempotencyKeyFor(first)).not.toBe(idempotencyKeyFor(second));
  });

  it("returns something the server will accept as a key", () => {
    expect(idempotencyKeyFor({})).toMatch(/^[0-9a-f-]{36}$/);
  });
});

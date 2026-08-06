/**
 * idempotency.ts — Centralized idempotency key generator.
 *
 * Extracted from transaction-capture-form.tsx and transaction-edit-form.tsx
 * (Phase 4, Plan 04-01, D-PH4-S2). Both legacy forms import from here until
 * they are deleted in Plan 04-04.
 */

export function generateIdempotencyKey(): string {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }
  // Fallback for environments without crypto.randomUUID
  return "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (c) => {
    const n = parseInt(c, 10);
    return (n ^ ((Math.random() * 16) >> (n / 4))).toString(16);
  });
}

/**
 * The key for one logical WRITE, stable across every attempt at it.
 *
 * A fresh key per attempt cannot dedupe anything: the server only recognises a
 * repeat when the key repeats. A Playwright trace caught the cost of getting
 * that backwards — the first POST aborted while the server still wrote it, the
 * client tried again with a new key, and one 180 became two (260806).
 *
 * Keyed by the input OBJECT, not by its contents: a retry passes the very same
 * object, while two identical coffees bought minutes apart are two distinct
 * objects and stay two distinct writes. A WeakMap means a finished operation
 * costs nothing once its input is collected.
 */
const keysByOperation = new WeakMap<object, string>();

export function idempotencyKeyFor(operation: object): string {
  const existing = keysByOperation.get(operation);
  if (existing) return existing;
  const key = generateIdempotencyKey();
  keysByOperation.set(operation, key);
  return key;
}

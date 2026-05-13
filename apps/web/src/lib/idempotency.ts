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

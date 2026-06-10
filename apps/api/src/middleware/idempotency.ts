/**
 * idempotency.ts — API-layer shim re-exporting createIdempotencyMiddleware from @budget/platform.
 *
 * Registered in app.ts AFTER tenantGuard and BEFORE i18n/routes (Pitfall 2).
 */
export { createIdempotencyMiddleware } from "@budget/platform";

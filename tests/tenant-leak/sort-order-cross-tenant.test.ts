/**
 * sort-order-cross-tenant.test.ts — Tenant-leak gate stub (Phase 4, Plan 04-01).
 *
 * Guards PUT /budgets/:budgetId/categories/sort-order (Plan 04-02).
 *
 * This file is a gate-count placeholder — the full tenant-isolation test
 * (Layer 2: adapter called with wrong tenant GUC returns empty result)
 * ships in Plan 04-02 once the route + application service exist.
 *
 * Gate accounting (`make ci-gate` -> tests/tenant-leak/*.test.ts):
 *   Pre Phase 4: 7 files
 *   Phase 4 wave-0: +3 stubs (sort-order, spendings-summary, drafts-dismiss)
 *   Total: 10 files (D-PH4-E3)
 */
import { describe, it } from "bun:test";

describe("sort-order cross-tenant gate (stub — Plan 04-02 fills implementation)", () => {
  it("PUT /categories/sort-order tenant-isolation test placeholder", () => {
    // Stub: always passes. Plan 04-02 replaces with real RLS assertion.
    // When Plan 04-02 ships:
    //   1. Call DrizzleCategoryRepo.updateSortOrder() with tenantA's categories
    //      while GUC is scoped to tenantB.
    //   2. Assert result is empty / throws not-found (RLS filtered).
  });
});

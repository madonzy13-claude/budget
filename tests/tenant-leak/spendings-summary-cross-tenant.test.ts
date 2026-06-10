/**
 * spendings-summary-cross-tenant.test.ts — Tenant-leak gate stub (Phase 4, Plan 04-01).
 *
 * Guards GET /budgets/:budgetId/spendings-summary (Plan 04-02).
 *
 * Full tenant-isolation test ships in Plan 04-02 once the route +
 * SpendingsSummaryRepo adapter exist.
 *
 * Gate accounting: Phase 4 wave-0 stub (+1 of 3). Total: 10 files.
 */
import { describe, it } from "bun:test";

describe("spendings-summary cross-tenant gate (stub — Plan 04-02 fills implementation)", () => {
  it("GET /spendings-summary tenant-isolation test placeholder", () => {
    // Stub: always passes. Plan 04-02 replaces with real RLS assertion.
    // When Plan 04-02 ships:
    //   1. Call getSpendingsSummary(tenantA.budgetId) while GUC scoped to tenantB.
    //   2. Assert result returns null / throws budget_not_found.
    //   3. Confirm no category rows from tenantA bleed into response.
  });
});

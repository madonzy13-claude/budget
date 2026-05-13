/**
 * drafts-dismiss-cross-tenant.test.ts — Tenant-leak gate stub (Phase 4, Plan 04-01).
 *
 * Guards POST /budgets/:budgetId/recurring-rules/drafts/:draftId/dismiss (Plan 04-02).
 *
 * Full tenant-isolation test ships in Plan 04-02 once the route +
 * dismiss application service exist.
 *
 * Gate accounting: Phase 4 wave-0 stub (+1 of 3). Total: 10 files.
 */
import { describe, it } from "bun:test";

describe("drafts-dismiss cross-tenant gate (stub — Plan 04-02 fills implementation)", () => {
  it("POST /drafts/:id/dismiss tenant-isolation test placeholder", () => {
    // Stub: always passes. Plan 04-02 replaces with real RLS assertion.
    // When Plan 04-02 ships:
    //   1. Seed tenantA's draft row in expense_ledger.
    //   2. Call dismissDraft(tenantA.draftId) while GUC scoped to tenantB.
    //   3. Assert dismissed_at is NOT SET on tenantA's row (RLS blocked write).
    //   4. Assert no cross-tenant data disclosure in error payload.
  });
});

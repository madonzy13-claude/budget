# Phase 3 — Deferred Items

Tracked during execution; deferred because they are out-of-scope for the active plan.

---

## From Plan 03-04

### Pre-existing test failure: `apps/web/test/components/transaction-edit-form.test.tsx`

- **Discovered:** Plan 03-04 final test sweep (`bun run test`)
- **Test:** `bulkApply › calls api/budgets/.../transactions/correct with selected IDs and category` (uses `mockFetch.toHaveBeenCalledWith(stringContaining('/transactions/tx-001/correct'))`)
- **Status before Plan 03-04:** ALREADY FAILING (verified on `main` HEAD before any 03-04 edits; baseline `Tests 1 failed | 95 passed (96)`)
- **Root cause:** Last touched by commit 7e2eb5b (Phase 02-07 web edit form work). Live form likely no longer fires the bulk-correct endpoint with the expected payload shape — needs Phase 02 follow-up.
- **Scope:** Phase 02 (transactions); NOT Phase 03 nav/home.
- **Action:** Refer to Phase 02 retro / debug pass. No action in Phase 03 plans.

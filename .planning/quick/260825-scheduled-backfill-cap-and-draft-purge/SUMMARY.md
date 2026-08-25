---
id: 260825-spb
slug: scheduled-backfill-cap-and-draft-purge
date: 2026-08-25
mode: quick
status: complete
---

# Summary

Two scheduled-payment gaps the user reported, both fixed TDD.

## 1. Back-fill capped at 12 months

`create-scheduled-payment.ts` walked from `first_due_date` to today, one INSERT
per missed period, inline in the request. Measured red: a 3-year anchor produced
**37 drafts**; the user waits for all of them, and it grew by one every month.

Now fast-forwards through the cadence to `today − 12 months` before inserting.
Fast-forwarded rather than clamped so a MONTHLY rule anchored on the 1st keeps
landing on the 1st — clamping would have put the first draft on whatever day the
cutoff fell. Pure date maths, no DB, so skipping 24 periods costs nothing. The
rule still stores its true `first_due_date`; only drafts are bounded.

## 2. Deleting a rule purges its unconfirmed drafts

`softDelete` flagged the rule and left every draft in `expense_ledger`. Measured
red: **3 unconfirmed drafts survived** a delete, still showing in the grid and
still holding a CONFIRM_DRAFT task for a rule that no longer existed.

Now deletes them in the same transaction, mirroring category archive
(`category-repo.ts:297`) and relying on the same app_role DELETE grant (0033).
`confirmed_at IS NULL` is the whole guard — a confirmed draft is money the
household actually spent, and deleting the PLAN must not rewrite the HISTORY.
That asymmetry is the assertion the test was built around.

CONFIRM_DRAFT tasks need no cleanup: the read-time self-heal (260612-kxd T3)
hides any whose draft is no longer live.

## Evidence

| Step | Result |
|---|---|
| Tests written first | RED: 37 drafts vs ≤13; 3 unconfirmed survived vs 0 |
| After implementation | 30 pass, 0 fail in the file |
| Full backend suite | **1674 pass, 0 fail, `make test` exit 0** |
| eslint --max-warnings=0 / tsc | clean |
| api + worker rebuilt | healthy |
| Playwright live (`@scheduled\|@tasks\|scheduled-draft`) | **30 passed, 1 flaky, 0 failed** |

## Outstanding

**No E2E covers deleting a scheduled payment rule.** The settings UI has the
flow (`scheduled-payments-section.tsx`) and CLAUDE.md rule 4 wants E2E on every
user-facing flow, but `scheduled-draft.feature` only covers confirming. The new
behaviour is proven by integration tests against the real Postgres, not through
the UI. Worth a scenario: delete a rule with pending drafts → drafts vanish from
the grid, badge clears, a confirmed transaction stays.

**Also unchanged:** 12 months is now a constant (`BACKFILL_MAX_MONTHS`), not
configurable per budget. Nobody asked for that; say so if it should be.

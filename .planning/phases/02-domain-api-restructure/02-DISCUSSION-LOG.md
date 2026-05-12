# Phase 2: Domain & API Restructure - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-12
**Phase:** 2-domain-api-restructure
**Areas discussed:** Reserves auto-compute mechanism, Recurring cadence schema extension, Share-link backend strategy, Transaction API contract + stale-schema cleanup

---

## Reserves auto-compute mechanism

### Q1: SQL form for the reserve auto-compute (RSCM-01, Risk Register row 2)

| Option                                         | Description                                                                | Selected |
| ---------------------------------------------- | -------------------------------------------------------------------------- | -------- |
| Regular VIEW (re-evaluates per read)           | CREATE VIEW with recursive CTE; always fresh; simple maintenance           | ✓        |
| MATERIALIZED VIEW + REFRESH trigger            | Fast reads but refresh-on-write cost + RLS/REFRESH CONCURRENTLY complexity |          |
| SQL FUNCTION returning TABLE                   | Stored function callable with explicit args; harder for joins              |          |
| App-side TS computation in application service | Pure domain logic but N+1 read + RSCM-03 round-trip                        |          |

**User's choice:** Regular VIEW
**Notes:** Accepted the recommendation. Materialization deferred per Risk Register row 2 — only revisit if profiling shows pain.

### Q2: Read API exposure for the view

| Option                                    | Description                                            | Selected |
| ----------------------------------------- | ------------------------------------------------------ | -------- |
| ReserveBalanceRepo port + Drizzle adapter | Hex-clean, mirrors TransactionRepo/AccountRepo pattern | ✓        |
| Folded into CategoryRepo as enrichment    | Simpler call site but couples aggregates               |          |
| Read-model query service (no port)        | CQRS-flavored read side; outside hex                   |          |

**User's choice:** ReserveBalanceRepo port + Drizzle adapter
**Notes:** Matches existing repo pattern; keeps hexagonal boundary intact.

---

## Recurring cadence schema extension

### Q3: Schema shape for DAILY + YEARLY cadence (RECR-01)

| Option                                    | Description                                                                                    | Selected |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------- | -------- |
| Extend enum + add yearly_month column     | Reuse cadence_anchor for MONTHLY+YEARLY; add yearly_month for YEARLY-only; explicit, queryable | ✓        |
| Replace columns with cadence_config JSONB | Flexible single column; no DB enforcement; harder to index                                     |          |
| RRULE string (iCalendar RFC 5545)         | Industry standard; +25KB rrule lib dep; breaks current nextOccurrence()                        |          |

**User's choice:** Extend enum + add yearly_month column
**Notes:** Accepted explicit columns approach to match current MONTHLY/WEEKLY scheme. Existing cadence_anchor + weekly_dow integer columns reused.

### Q4: Worker-downtime catch-up behavior

| Option                                          | Description                                                                        | Selected |
| ----------------------------------------------- | ---------------------------------------------------------------------------------- | -------- |
| Generate one draft per missed date in a loop    | Idempotent on (rule_id, due_date); user sees each missed date as confirmable draft | ✓        |
| Generate one draft, jump next_due_date to today | Less noisy banner; loses interim occurrences                                       |          |
| Generate nothing, advance to today silently     | Silent data loss; only OK for idempotent semantics                                 |          |

**User's choice:** Catch-up loop, one draft per missed date
**Notes:** Aligns with "nothing silently swallowed" UX expectation; matches existing ON CONFLICT DO NOTHING idempotency pattern.

---

## Share-link backend strategy

### Q5: Token URL vs Better Auth email-based invite (SHRD-01, Risk Register row 6)

| Option                                                                     | Description                                                                  | Selected |
| -------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | -------- |
| App-side budget_share_links overlay + thin Better Auth addMember on accept | Clean separation; full control over TTL/revoke/single-use; no email coupling | ✓        |
| Better Auth invitation with synthetic email                                | Pollutes invitation table; brittle to BetterAuth version changes             |          |
| Patch Better Auth orgs plugin (custom plugin)                              | Heavy investment; binds us to a fork                                         |          |

**User's choice:** App-side overlay table
**Notes:** Keeps email-based invitation stubs dormant for future v1.2 email path; share-link path owned by our schema.

### Q6: TTL + reuse semantics (SHRD-03)

| Option                  | Description                                                | Selected |
| ----------------------- | ---------------------------------------------------------- | -------- |
| Single-use, TTL on link | accepted_by IS NOT NULL burns the token; per-link ttl      | ✓        |
| Multi-use until expiry  | Same link accepted by many users; risk of indefinite share |          |
| Hybrid: max_uses + ttl  | Most flexible; more UI surface in Phase 6                  |          |

**User's choice:** Single-use + per-link TTL (default 7d)
**Notes:** Cleanest revoke semantics; matches typical one-off household-member invite expectation.

---

## Transaction API contract + stale-schema cleanup

### Q7: PATCH currency-override re-FX behavior (TXN-04)

| Option                                               | Description                                                                         | Selected |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------- | -------- |
| Auto re-FX on currency change                        | Server calls FxProvider.rateAsOf on currency or date change; single source of truth | ✓        |
| Client provides explicit rate                        | Client must send fx_rate + fx_as_of; staleness drift risk                           |          |
| Reject currency change on PATCH; require DELETE+POST | Simpler but harsher UX — slider exposes currency dropdown                           |          |

**User's choice:** Auto re-FX on currency/date change
**Notes:** Server-authoritative FX; client-side recalc unnecessary.

### Q8: Drafts route shape (RECR-07)

| Option                                                | Description                                       | Selected |
| ----------------------------------------------------- | ------------------------------------------------- | -------- |
| Unified /transactions?confirmed=false                 | Single resource; one fetch per month per category | ✓        |
| Keep /recurring-drafts.ts separate                    | Cleaner aggregate boundary                        |          |
| Hybrid: drafts under /recurring-rules/[ruleId]/drafts | Drafts as sub-resource of rules                   |          |

**User's choice:** Unified transactions route
**Notes:** Old recurring-drafts.ts route file gets deleted. Phase 4 grid composes one request per category column.

### Q9: Stale-schema cleanup + INCOME refinement (TXN-07 relaxation)

| Option                                                      | Description                                  | Selected  |
| ----------------------------------------------------------- | -------------------------------------------- | --------- |
| Drop both in Phase 2 migration (kind + balance_adjustments) | Cleaner schema for Phase 3+ rebuild          | (partial) |
| Keep dormant, drop in later milestone                       | Less migration churn; dead-schema noise risk |           |
| Drop balance_adjustments only, keep kind                    | Conservative middle ground                   |           |

**User's choice:** Drop both + ADD kind back as new tighter enum
**Notes:** User explicitly added new direction beyond the proposed options: drop the existing old `kind` enum (`EXPENSE`|`INCOME`|`TRANSFER`) AND drop `balance_adjustments`, then ADD a fresh `kind ENUM('SPENDING','INCOME')` column with default SPENDING. INCOME models refunds. Visible only on side slider after pen-click, not on quick-entry main UI; highlighted visually in grid for distinction. Quick-entry shortcut: typing negative number auto-tags INCOME (server flips sign + sets kind). Stored positive; math treats INCOME as negative spend.

This relaxes the letter of REQUIREMENTS TXN-07 ("only EXPENSE-equivalent txns") but preserves the spirit: no separate income ledger, no wallet credit flow, no transfers — INCOME remains a categorical, single-row classifier on the same expense_ledger table.

---

## Claude's Discretion

- Exact SQL form of the recursive CTE in `category_reserve_balance`
- Whether `budget_share_links` lives in `budgeting` vs `tenancy` schema (recommend tenancy)
- Whether partial unique index on `budget_share_links(token)` is worth it
- Recurring engine cron schedule unchanged at `0 6 * * * UTC` unless research shows better
- Naming of draft-confirm endpoint (`POST /[txId]/confirm` recommended; planner can swap to PATCH)
- Whether INCOME in past months counts toward reserve buildup symmetrically (recommend yes; planner verifies vs SPEC §8)

## Deferred Ideas

- Materialized view fallback for reserves (revisit if profiling shows pain post-v1.1)
- Email-based share invites (REQUIREMENTS Future; stubs kept dormant)
- Wallet-link on transactions (out of scope per TXN-02, TXN-07)
- Refund as separate domain event (kind-tag-only chosen; revisit if tax reporting needs it)
- Tasks generators (Phase 7; outbox events from Phase 2 partial input)
- Recurring rule UI CRUD (Phase 6 SETT-04)
- INCOME visual highlighting in grid (Phase 4 DESIGN.md design call)

# Phase 2: Domain & API Restructure - Context

**Gathered:** 2026-05-12
**Status:** Ready for planning

<domain>
## Phase Boundary

With Phase 1's schema rename + cleanup landed, Phase 2 restructures the backend so the new IA's data flows work end-to-end at the API surface — even though the v1.0 UI still wraps it. Concretely Phase 2 ships:

1. **Transaction domain stripped to categorical-only** (TXN-01..08). `expense_ledger` becomes purely `(date, category_id, amount_original, currency_original, amount_converted, fx_rate, fx_as_of, note, recurring_rule_id, confirmed_at, kind)` — no wallet linkage, no transfer ledger, no income flow. INCOME kind exists as a refund-classifier only (see D-PH2-09).
2. **Recurring engine extended cadence** (RECR-01, RECR-02). MONTHLY|WEEKLY becomes DAILY|WEEKLY|MONTHLY|YEARLY with day-of-\* selectors. pg-boss draft materialization handles catch-up.
3. **Reserves auto-compute SQL view + read-model port** (RSCM-01, RSCM-02). `category_reserve_balance` regular VIEW (not materialized) + `ReserveBalanceRepo` port behind hex boundary. Cushion-mode-as-of-month respected via existing `budget_mode_history` SCD-2 table.
4. **Share-link backend** (SHRD-01, 02, 03, 05). App-side `budget_share_links` overlay table (token, ttl, revoked_at, accepted_by); thin Better Auth `addMember` call only on accept.
5. **Stale-schema cleanup**: DROP `expense_ledger.kind` old enum + DROP `account_balance_adjustments` table + DROP `recurring_rules.kind` then ADD `expense_ledger.kind ENUM('SPENDING','INCOME')` default SPENDING.
6. **Engineering guardrails** (ENGR-01..04): 80% domain coverage retained; dependency-cruiser blocks domain imports of drizzle/Hono/AI SDK/adapters; every new route gets at least one integration test in `apps/api/test/routes/`; tenant-leak CI gate stays 6/6 green.

**Out of phase (Phase 3 territory):** Web UI rebuild — top-nav switcher, home page cards, BDP tab frame. v1.0 web pages keep calling the renamed routes; new endpoints stay invisible until Phase 3 wires them.

**Out of phase (Phase 4+ territory):** Spendings grid UI, drag-reorder UI, real-time reserve-deduction render (Phase 4 consumes the read-model from this phase). Tasks generators + banner (Phase 7). Reserves tab + Wallets tab (Phase 5). Settings + Onboarding + Share-recipient UI (Phase 6).

**Phase 2 ↔ Phase 3 contract:** Every v1.1 endpoint Phase 3-7 will call exists in Phase 2 with at least one integration test. Phase 3+ frontend work depends on `/budgets/[id]/transactions`, `/budgets/[id]/transactions/[id]/confirm`, `/budgets/[id]/categories`, `/budgets/[id]/wallets`, `/budgets/[id]/recurring-rules`, `/budgets/[id]/reserves`, `/budgets/[id]/share`, `/budgets/join/[token]`.

</domain>

<decisions>
## Implementation Decisions

### Reserves auto-compute (RSCM-01, RSCM-02)

- **D-PH2-01:** Regular SQL VIEW `budgeting.category_reserve_balance` — not materialized. WITH RECURSIVE CTE walks past months, JOINs `budget_mode_history` SCD-2 for cushion-mode-as-of-month, applies SPEC §8 formula `reserve(c,m) = max(0, reserve(c,m-1) + remainder(c,m) - reserve_pulled(c,m))`. Fresh on every read. Acceptable at v1.1 scale (household data, ≪10K txns/budget). Materialize later if profiling shows pain — Risk Register row 2.
- **D-PH2-02:** New port `ReserveBalanceRepo` in `packages/budgeting/src/ports/reserve-balance-repo.ts`. Drizzle adapter SELECTs from the view. Two methods: `getForBudget(budgetId, asOf): Promise<Map<CategoryId, Money>>` and `getForCategory(budgetId, categoryId, asOf): Promise<Money>`. Application services depend on the port; matches existing TransactionRepo/AccountRepo hex pattern.

### Recurring cadence extension (RECR-01)

- **D-PH2-03:** Extend cadence enum + add explicit columns. Migration ALTERs check constraint to `cadence IN ('DAILY','WEEKLY','MONTHLY','YEARLY')`. Reuse `cadence_anchor INTEGER` for day-of-month (MONTHLY) AND day-of-year-anchor (YEARLY). Reuse `weekly_dow INTEGER` for WEEKLY. Add new column `yearly_month INTEGER` (1-12) for YEARLY only. DAILY needs no extras. New check constraints enforce shape per cadence.
- **D-PH2-04:** pg-boss recurring-engine catch-up: loop while `next_due_date <= today`, INSERT draft for each missed `(rule_id, due_date)` ON CONFLICT DO NOTHING, advance `next_due_date` via `nextOccurrence()` each iteration. Worker downtime produces N drafts for N missed dates; user confirms or dismisses each. Idempotency-key unchanged: `(rule_id, due_date)`.

### Share-link backend (SHRD-01..03, 05)

- **D-PH2-05:** App-side `budget_share_links` overlay table — NEW in Phase 2 migration `0013_phase02_*`:
  ```
  budget_share_links {
    id uuid pk,
    budget_id uuid not null fk budgets(id),
    tenant_id uuid not null,
    token text not null unique (random nanoid 32),
    created_by uuid not null,
    expires_at timestamptz not null,
    revoked_at timestamptz null,
    accepted_by uuid null,
    accepted_at timestamptz null,
    created_at timestamptz default now(),
    RLS: tenant_id ∈ app.tenant_ids
  }
  ```
  Routes:
  - `POST /budgets/[id]/share` body `{ttlDays?:number=7}` → `{url, expiresAt}`. Owner-only (Better Auth org role=owner).
  - `GET /budgets/join/[token]` → `{budgetName, isExpired, isRevoked, isUsed}` (public route — recipient may not yet have an account).
  - `POST /budgets/join/[token]/accept` → calls `auth.api.addMember(orgId, userId, 'member')` + sets `accepted_by` + `accepted_at`. Authenticated.
  - `DELETE /budgets/share/[id]` → sets `revoked_at`. Owner-only.
- **D-PH2-06:** Share-link is single-use + TTL. After `accepted_by IS NOT NULL` the token is dead. TTL is per-link, default 7d, owner can override at create time via `ttlDays` body field. Owner can also DELETE an unused link to revoke ahead of expiry.

### Transaction API contract (TXN-01..08)

- **D-PH2-07:** PATCH `/budgets/[id]/transactions/[txId]` with changed `currency_original` OR `date` triggers automatic server-side re-FX. Server calls `fxProvider.rateAsOf(currency_original, budget.currency, txn.date)` and updates `amount_converted_cents` + `fx_rate` + `fx_as_of` atomically. Response payload returns both original + converted amounts + rate + as_of date so the side slider renders "5.00 USD · ~4.20 EUR @ 0.84 (2026-05-11)" per TXN-06.
- **D-PH2-08:** Unified transactions resource. Drafts (`confirmed_at IS NULL`) and confirmed txns are the same aggregate behind one route family:
  - `GET /budgets/[id]/transactions?month=YYYY-MM&confirmed=false` — lists drafts for the grid.
  - `GET /budgets/[id]/transactions?month=YYYY-MM` — lists confirmed for the month.
  - `POST /budgets/[id]/transactions` — body `{date, category_id, amount_original_cents, currency_original?, note?}`. Quick-entry path; sets `confirmed_at = now()`.
  - `PATCH /budgets/[id]/transactions/[txId]` — full edit fields (side slider).
  - `POST /budgets/[id]/transactions/[txId]/confirm` — flips a draft to confirmed.
  - `DELETE /budgets/[id]/transactions/[txId]` — deletes draft OR soft-deletes confirmed txn.
  - Old `apps/api/src/routes/recurring-drafts.ts` removed in this phase. (Route file `recurring-rules.ts` stays for CRUD on rules themselves — Phase 6 Settings tab.)

### Stale-schema cleanup + INCOME refinement (TXN-07 relaxed)

- **D-PH2-09:** Schema changes in Phase 2 migration `0013_phase02_domain_restructure.sql`:
  1. `DROP TABLE budgeting.account_balance_adjustments` (D-12 retained, now obsolete — wallet balances are manual snapshots per WALT-07; balance-adjustments has no caller).
  2. `ALTER TABLE budgeting.expense_ledger DROP COLUMN kind` (drops old `EXPENSE|INCOME|TRANSFER` enum).
  3. `ALTER TABLE budgeting.expense_ledger ADD COLUMN kind TEXT NOT NULL DEFAULT 'SPENDING' CHECK (kind IN ('SPENDING','INCOME'))` — new tighter enum.
  4. `ALTER TABLE budgeting.recurring_rules DROP COLUMN kind` (categorical-only, all rules produce SPENDING drafts).
  5. Worker handler `apps/worker/src/handlers/recurring-engine.ts` stripped of `kind` references in SELECT + INSERT.
  6. Add new column `expense_ledger.recurring_rule_id uuid NULL` (FK to `recurring_rules.id`) per TXN-01 spec — replaces the v1.0 audit ledger flow.

  **INCOME semantics (relaxes REQUIREMENTS TXN-07 letter, preserves spirit):**
  - INCOME is a transaction-kind classifier only — NOT a separate income ledger, NOT a wallet credit flow, NOT a transfer.
  - `amount_original_cents` + `amount_converted_cents` stored as positive in DB.
  - Rendered positive on grid and slider.
  - Quick-entry shortcut: typing a negative number (e.g. `-5.96` + Enter) auto-flips kind to INCOME and stores positive 5.96.
  - Spend math (in `category_reserve_balance` view + grid header row 3 "overspent"):
    ```sql
    spent(c, m) = SUM(
      CASE WHEN kind = 'SPENDING' THEN amount_converted_cents
           WHEN kind = 'INCOME'   THEN -amount_converted_cents
      END
    ) WHERE category_id = c AND month = m AND confirmed_at IS NOT NULL
    ```
  - INCOME txns visually highlighted in grid (Phase 4 design — distinct background/sign indicator per DESIGN.md). Side slider exposes kind toggle for explicit reclass after creation.
  - Side slider in Phase 2 quietly accepts/returns `kind` field; Phase 4 surfaces it.

### Engineering Discipline (ENGR-01..04)

- **D-PH2-10:** Every new route in this phase gets at least one integration test under `apps/api/test/routes/`. Coverage of share-link routes includes both happy-path (create → join → accept) and security paths (expired, revoked, single-use exhausted, cross-tenant).
- **D-PH2-11:** New `ReserveBalanceRepo` adapter gets at least one integration test against real Postgres in `packages/budgeting/test/` covering: zero-history category, single-month remainder, multi-month accumulation, cushion-mode flip mid-history, overspend pulling reserve to zero (not below).
- **D-PH2-12:** dependency-cruiser rule already enforced from Phase 1: `packages/*/src/domain/` cannot import drizzle-orm, Hono, AI SDK, or `adapters/`. New `ReserveBalanceRepo` port lives in `packages/budgeting/src/ports/`; adapter lives in `packages/budgeting/src/adapters/persistence/`. Application services only reference the port.

### Claude's Discretion

- Exact SQL form of the recursive CTE in `category_reserve_balance` — planner + researcher decide structure (single-pass aggregate vs LATERAL JOIN vs window-function chain) optimizing for clarity + correctness over micro-perf.
- Whether `budget_share_links` lives in `budgeting` or `tenancy` schema — recommend `tenancy` since it concerns membership/access control, but planner can call this on dep-cruiser grounds.
- Whether to add a partial unique index on `budget_share_links(token) WHERE revoked_at IS NULL AND accepted_by IS NULL` — defer to plan-phase performance call.
- Recurring engine cron schedule unchanged (`0 6 * * * UTC`); planner can tune if research shows a better window.
- Naming of new POST endpoint for draft confirm (`/[txId]/confirm` chosen above as default; planner can swap to PATCH if REST consensus prefers).
- Whether INCOME txns in past months count toward reserve buildup or only reduce overspend — recommend they count symmetrically (an INCOME makes the period under-spent, which builds reserve), but planner verifies math against SPEC §8 formula and asks user if ambiguous.

</decisions>

<canonical_refs>

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Roadmap & requirements

- `.planning/ROADMAP.md` §Phase 2 — phase scope, success criteria 1-5, dependencies
- `.planning/REQUIREMENTS.md` §TXN, §RECR, §RSCM, §SHRD, §ENGR — 20 v1.1 REQ-IDs locked to Phase 2
- `.planning/v1.1-SPEC.md` §7 (Transactions schema), §8 (Reserves auto-compute algorithm), §9 (Tasks queue — Phase 7 dependency surface)
- `.planning/PROJECT.md` — milestone goal, carried-forward v1.0 capabilities

### Project conventions

- `CLAUDE.md` — TDD-first, hexagonal layering, Money value object boundary, test matrix, dependency-cruiser invariants
- `.planning/archive/v1.0/decisions/` — D-04-e SCD-2 pattern, D-05-g system user sentinel for pg-boss

### Phase 1 carry-forward

- `.planning/phases/01-schema-migration-rename-foundation/01-CONTEXT.md` — Phase 1 decisions D-01..D-13; especially D-04 (cushion-mode SCD-2 in `budget_mode_history`), D-11 (cushion_amount column name), D-12 (balance_adjustments retained, now revisited in D-PH2-09)
- `.planning/phases/01-schema-migration-rename-foundation/01-VERIFICATION.md` — Phase 1 PASS evidence; MIG-01..13 mapping
- `drizzle/0012_phase01_v11_rename.sql` — Phase 1 migration; new migration 0013 builds on this

### Existing schema (Phase 2 modifies)

- `packages/budgeting/src/adapters/persistence/recurring-rules-schema.ts` — cadence enum + cadence_anchor + weekly_dow columns; EXTEND in this phase
- `packages/budgeting/src/adapters/persistence/transaction-repo.ts` — current ledger writer; STRIP wallet/kind references, add re-FX logic
- `packages/budgeting/src/adapters/persistence/balance-adjustments-schema.ts` — DROP in this phase
- `packages/budgeting/src/adapters/persistence/budget-mode-history-schema.ts` — SCD-2 cushion-mode tracker; READ-ONLY consumer in Phase 2 (view JOINs here)
- `packages/tenancy/src/adapters/persistence/shares-schema.ts` — `shared_budget_member_shares` (per-member contribution shares); ORTHOGONAL to share-links, do not conflate

### Domain layer (Phase 2 modifies)

- `packages/budgeting/src/domain/recurring-rule.ts` — RecurringRule aggregate; EXTEND for DAILY/YEARLY
- `packages/budgeting/src/domain/cadence.ts` — `Cadence` type + `nextOccurrence()`; EXTEND
- `packages/budgeting/src/domain/transaction.ts` — Transaction aggregate; STRIP wallet, ADD kind/recurringRuleId/confirmedAt
- `packages/budgeting/src/domain/correction.ts` — correction chain; keep as-is for now
- `packages/budgeting/src/ports/transaction-repo.ts` — TransactionRepo port; update signature for new fields
- `packages/shared-kernel/src/ports/fx-provider.ts` — `FxProvider.rateAsOf(from, to, date)`; Phase 2 calls on PATCH

### Ports + new files (Phase 2 creates)

- `packages/budgeting/src/ports/reserve-balance-repo.ts` — NEW: ReserveBalanceRepo port
- `packages/budgeting/src/adapters/persistence/reserve-balance-repo.ts` — NEW: Drizzle adapter SELECTing from view
- `packages/tenancy/src/adapters/persistence/budget-share-links-schema.ts` — NEW: overlay table schema
- `packages/tenancy/src/application/create-share-link.ts` — NEW: token mint + TTL
- `packages/tenancy/src/application/resolve-share-link.ts` — NEW: public token resolve
- `packages/tenancy/src/application/accept-share-link.ts` — NEW: Better Auth addMember + mark accepted
- `packages/tenancy/src/application/revoke-share-link.ts` — NEW: owner revoke

### Routes (Phase 2 modifies + creates)

- `apps/api/src/routes/transactions.ts` — overhauled: drop wallet field, add re-FX, add `/confirm` sub-route, unified drafts query
- `apps/api/src/routes/recurring-rules.ts` — extend create/update for DAILY/YEARLY
- `apps/api/src/routes/recurring-drafts.ts` — DELETE (folded into transactions)
- `apps/api/src/routes/budgets.ts` — add `POST /budgets/[id]/share` + `DELETE /budgets/share/[id]`
- `apps/api/src/routes/share-join.ts` — NEW: `GET /budgets/join/[token]` + `POST /budgets/join/[token]/accept`. Public + authenticated halves split.
- `apps/api/src/app.ts` — register new share-join routes (no tenant-guard on GET public half)

### Worker

- `apps/worker/src/handlers/recurring-engine.ts` — extend SQL SELECT for new cadence cols; rewrite catch-up loop per D-PH2-04

### Migrations

- `drizzle/0013_phase02_domain_restructure.sql` — NEW: hand-authored migration covering all schema changes (D-PH2-09 cleanup + cadence extension + budget_share_links CREATE + view CREATE)
- `apps/migrator/post-migration.sql` — RLS policies + GRANTs for new `budget_share_links` table + new view; FORCE RLS on share-links table

### Better Auth integration

- `packages/identity/src/adapters/persistence/better-auth.ts` — Better Auth org config; READ-ONLY consumer for `addMember` call
- `packages/tenancy/src/application/invite-member.ts` — existing email-based invite stub; KEEP for future email path
- `packages/tenancy/src/application/accept-invitation.ts` — existing accept stub; KEEP for future email path

### CI gate + tests

- `make ci-gate` (6 tenant-leak tests) — must stay green; new `budget_share_links` table needs a tenant-leak test added to fixture
- `apps/api/test/routes/` — every new route gets ≥1 integration test
- `packages/budgeting/test/` — ReserveBalanceRepo adapter integration test; recurring-engine catch-up integration test
- `bunfig.toml` — domain coverage threshold 80% retained

### Design system

- `DESIGN.md` — referenced for Phase 4+ grid INCOME highlighting (not Phase 2 work but mentioned in D-PH2-09)

</canonical_refs>

<code_context>

## Existing Code Insights

### Reusable Assets

- **`FxProvider` port + `Frankfurter` adapter** (`packages/shared-kernel/src/ports/fx-provider.ts`, `packages/budgeting/src/adapters/fx/frankfurter.ts`): used as-is for D-PH2-07 auto re-FX. `rateAsOf(from, to, date)` already returns `{rate, provider, isStale}`. No change needed.
- **`budget_mode_history` SCD-2 table** (`budget-mode-history-schema.ts`): already tracks NORMAL|CUSHION mode with `effective_from` + `effective_to`. View JOINs here for cushion-mode-as-of-month per D-PH2-01. Zero new schema work for cushion history.
- **`nextOccurrence()`** (`packages/budgeting/src/domain/cadence.ts`): existing MONTHLY/WEEKLY math (with month-end clamp); extend with DAILY/YEARLY cases. Existing tests in `packages/budgeting/test/recurring-rule-domain.test.ts` cover the WEEKLY/MONTHLY paths.
- **`withTenantTx` + `withInfraTx` primitives** (`@budget/platform`): RLS-scoped vs infra-level transactions. Recurring engine uses `withInfraTx` for tenant scan + `withTenantTx` per-tenant. New share-link routes use `withTenantTx`; public `GET /join/[token]` resolves via `withInfraTx` because pre-auth recipient has no tenant context.
- **Idempotency on draft INSERT** (`ON CONFLICT (rule_id, due_date) DO NOTHING`): existing pattern reused for catch-up loop.

### Established Patterns

- **Hexagonal layering enforced by dependency-cruiser** (Phase 1 verified): Phase 2 must not introduce drizzle/Hono imports into `domain/`. New `ReserveBalanceRepo` port + adapter follow the existing TransactionRepo/AccountRepo split.
- **Drizzle types live ONLY in `adapters/persistence/`**: domain entities are plain classes. New `kind` field on Transaction aggregate is a TS literal type, not a Drizzle import.
- **Money value object at adapter boundary**: `amount_*_cents BIGINT + currency CHAR(3)` columns stay; ReserveBalanceRepo returns Money instances.
- **pg-boss queue lives in `pgboss` schema**: outside the budgeting schema. Recurring engine extension stays inside the existing handler — no new queue.
- **Outbox pattern** (`writeOutbox`): recurring-engine emits `budgeting.recurring.draft.generated`; new draft confirm endpoint emits `budgeting.transaction.confirmed`. Tasks generators in Phase 7 will consume these.
- **post-migration.sql lockstep** (Phase 1 D-01 + research): every schema change must mirror RLS/GRANT/FORCE RLS in `apps/migrator/post-migration.sql`. Container boot fails otherwise.
- **Hand-authored migrations** (Phase 1 research finding): `drizzle-kit generate` is interactive (TTY-only). Migration `0013_phase02_*` is hand-authored, same as `0011_*` and `0012_*`.

### Integration Points

- **`apps/migrator/post-migration.sql`** — runs after Drizzle migrations on container start. New migration 0013 needs: policies for `budget_share_links`, GRANT on the new view to app_role, FORCE RLS on share-links table, ALTER policies on `expense_ledger` if column-level dropped/added grants shift.
- **`docker-compose.yml`** — `make dev-build` rebuilds api+worker+migrator images after Phase 2 lands. Required because schema files are bundled.
- **Tenant-leak CI gate (6 tests)** — already targets renamed `budgets`/`wallets` tables. Phase 2 adds at least 1 cross-tenant probe against `budget_share_links` (e.g., token from tenant A → access budget B).
- **`apps/web/src/lib/api-client.ts`** — v1.0 web pages keep working through Phase 2. Endpoints renamed in Phase 1 still exist; Phase 2 changes their request/response shapes. Some v1.0 pages will visibly break (e.g., any UI reading `transaction.account_id` or income/transfer kinds). Phase 2 accepts that breakage; Phase 3+ rebuilds the UI anyway.
- **`apps/worker/src/handlers/recurring-engine.ts`** — extended for new cadence cols + catch-up loop; pg-boss cron unchanged at `0 6 * * * UTC`.

</code_context>

<specifics>
## Specific Ideas

- **Negative-number quick-entry shortcut as INCOME marker** (D-PH2-09): user expects `-5.96` + Enter on the grid quick-entry input to create an INCOME-kind txn with `amount = 5.96`. Server-side validation must accept negative input in POST body and flip sign+kind on store; client-side is optional convenience but server is source of truth.
- **Reserve view freshness pattern**: regular VIEW chosen over MATERIALIZED VIEW specifically because real-time deduction display (RSCM-03 in Phase 4) requires the value to be fresh on every read. No refresh trigger code, no staleness window. Profile in Phase 5 integration tests; only materialize if a real bottleneck shows.
- **Share-link as overlay, NOT as patched Better Auth**: avoid forking/extending the orgs plugin. Two reasons: (1) email-based invitation flow still has a use case in v1.2 (email-based invite from REQUIREMENTS Future); keeping Better Auth's invitation table clean preserves that path. (2) revoke/TTL/single-use semantics live in our table, fully under our control.
- **Transactions API is the one canonical resource for both drafts and confirmed**: `?confirmed=false` filter is the only divergence. Phase 4 grid composes one request per category column rather than two. Removes the old "drafts inbox" mental model entirely.

</specifics>

<deferred>
## Deferred Ideas

- **Materialized view fallback for reserves** — if `category_reserve_balance` regular view shows pain at v1.2 scale, materialize + add REFRESH trigger. Risk Register row 2.
- **Email-based share invites** — REQUIREMENTS Future. Stubs `invite-member.ts` + `accept-invitation.ts` already exist using Better Auth `createInvitation`/`acceptInvitation`; keep them dormant. Phase 2 only ships the token-link path.
- **Wallet-link on transaction** — explicitly out of scope per TXN-02, TXN-07, REQUIREMENTS Out of Scope. If reintroduced post-v1.1, would mean adding back `expense_ledger.wallet_id` + wallet balance auto-update + transfer ledger. Not on roadmap.
- **Refund as separate domain event** — D-PH2-09 chose kind-tag-only. If audit/insights need to distinguish refund flows for tax reporting later, this becomes a separate event-sourced concern. Out of v1.1.
- **Tasks generators wiring** — `tasks` table exists from Phase 1; generators for RESERVE_TOPUP / CONFIRM_DRAFT / STALE_WALLET / MONTH_END_REVIEW land in Phase 7 (RECR-02 outbox events Phase 2 ships are partial input for them).
- **Onboarding starter category template seeding** — onboarding wizard lands in Phase 6 (ONBD-01..09); seeding categories from a template list happens there, not Phase 2.
- **Recurring rule UI CRUD** — Phase 6 Settings tab (SETT-04). Phase 2 ships the API; UI is later.
- **INCOME visual highlighting in grid** — Phase 4 GRID design call referencing DESIGN.md. Phase 2 only exposes the `kind` field on response shapes.

</deferred>

---

_Phase: 2-domain-api-restructure_
_Context gathered: 2026-05-12_

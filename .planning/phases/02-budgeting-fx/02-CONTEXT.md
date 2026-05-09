# Phase 2: Budgeting & FX - Context

**Gathered:** 2026-05-09
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 2 ships the **Budgeting bounded context** end-to-end on top of the Phase 1 architectural rails. A user can model their household money: define accounts (cash, checking, savings, credit card, loan, investment), define categories with both a normal and a cushion limit, capture expenses / income / transfers in any currency through a form, edit transactions via append-only correction rows, run recurring transactions (with confirmation), search/filter, and bulk re-categorize — all backed by:

- The Phase 1 `expense_ledger` primitive (INSERT-only, RLS-enforced, REVOKE UPDATE/DELETE in DB)
- The Phase 1 `FxProvider` port (`rateAsOf(from,to,date) → {rate, provider, isStale}`) with a Frankfurter adapter shipped here + a daily pg-boss fetcher
- An `Idempotency-Key` HTTP middleware on every mutating endpoint (PWA offline-then-reconnect retry safety)
- Synchronous projections (e.g. `spending_by_category_month`) updated in the same transaction as the ledger insert, plus a reconciliation cron + replay-from-ledger CLI (ENGR-14)
- BDGT-08 per-category contribution-share override math (Alice 20% / Bob 80% globally, but groceries 50/50 locally) and EXPN-13 deposit FX-preview

**Ships in this phase:** Budgeting context (Accounts, Categories, Limits, Budget templates, Transactions, Recurring engine, Search/filter), Frankfurter adapter, daily FX fetcher, Idempotency-Key middleware, projections + reconciliation, BDGT-08 share math, EXPN-13 deposit flow.

**Explicitly NOT in this phase:**

- Voice STT capture (EXPN-04, -05) — Phase 5 (Onboarding & Comparison)
- LLM-driven category seeding — Phase 5
- Reserve / Cushion balance mechanics — Phase 3 (Reserve, Investments, Cushion)
- Investment price tracking — Phase 3
- Tasks queue / Insights / Notifications — Phase 4
- Comparison anonymizer — Phase 5
- Split transactions (EXPN-07) — **dropped from v1 per discussion** (see Decisions D-01-c)

</domain>

<decisions>
## Implementation Decisions

### Edits, Corrections, Recurring (D-01)

- **D-01-a — Edit UI surface (history visibility).** Transaction list shows the latest version of every row. A small "edited" badge appears on rows that have been corrected. Clicking the badge opens a side panel showing the full chain (original → each correction → latest) with `actor_user_id` and `occurred_at` per change. Implementation: badge derives from `corrects_id`/`corrected_by_id` columns already present on `expense_ledger` (D-23 in Phase 1) plus `audit_history` rows. No new columns required. [EXPN-06]

- **D-01-b — Edit semantics: append-only.** UI's "edit" button on a transaction always inserts a NEW ledger row marked with `corrects_id = <original.id>` and updates the original's `corrected_by_id`. Original row never mutates. Latest-only view is a query (`WHERE corrected_by_id IS NULL`). DB-level `REVOKE UPDATE, DELETE` already enforces this regardless of app-layer behavior. [ENGR-06, EXPN-06]

- **D-01-c — Split transactions DROPPED from v1.** User decision: one transaction = one category. A $200 receipt with food + household supplies is recorded by the user as TWO separate transactions. **Action item for `REQUIREMENTS.md`:** move EXPN-07 from Active → Out of Scope (or v1.x) at next phase transition. **Action item for `ROADMAP.md`:** strike "split" from Phase 2 Success Criteria #4 and remove EXPN-07 from Phase 2's requirement list. No `split_group_id`, no expandable list rows, no per-split FX-rate logic. [EXPN-07 — DROPPED]

- **D-01-d — Recurring rule edit semantics.** Editing a recurring rule (e.g. rent goes from $1500 to $1600) defaults to **applies to current period only**. A pre-checked checkbox "Also apply to future occurrences" extends to all future scheduled instances. Past occurrences (already generated) are NOT touched by rule edits — to fix a past month, user edits that specific transaction (which creates a correction row per D-01-a). Audit-tracked. [EXPN-08]

- **D-01-e — Recurring transactions are PENDING by default — user confirmation required.** **Modifies EXPN-08.** When a recurring rule's due-date arrives, the engine generates a _pending_ draft (NOT a finalized ledger row). The draft does not count toward category spending until the user confirms. UI surface: a "Pending recurring" inbox with badge count visible in primary nav. Storage: drafts live in a new `budgeting.recurring_drafts` table (NOT `expense_ledger`); on confirmation a real ledger row is INSERTed and the draft is deleted (or marked confirmed). This sidesteps the immutability constraint (drafts are mutable) and keeps the ledger pure-finalized.

- **D-01-f — Pending draft actions.** Three actions on a pending recurring draft:
  - **Confirm** — finalize as expense at the rule's stored amount/category/date. INSERT into `expense_ledger`, delete draft.
  - **Edit-and-confirm** — user changes amount, currency, category, date, account, or note. Finalize with the edited values. The rule itself is unchanged (this affects only this period's instance).
  - **Skip-this-period** — draft is dismissed; nothing hits the ledger; rule continues to generate next period. Audit-logged so user can see "April rent skipped on 2026-04-30 by Alice".

- **D-01-g — Stale pending drafts: stay pending forever.** No auto-confirm, no auto-skip. Badge in primary nav shows count of overdue pending drafts. Rationale: system never assumes a transaction happened; user always remains the source of truth.

### Contribution Shares (BDGT-08 + EXPN-13) (D-02)

- **D-02-a — Per-category share override surface: inline on category screen.** Editing a category in a SHARED workspace shows a "Contribution shares" section. Toggle "Override for this category" reveals per-member percentage inputs pre-filled from the workspace's TENT-13 global shares. Off → category uses global shares. Category list view shows a small "override" badge on categories that diverge from global. No separate Shares tab in v1. [BDGT-08]

- **D-02-b — Sum-to-100 enforced via blocking save.** Save button disabled with live counter ("Currently 95% — must equal 100%") until the per-member percentages sum to exactly 100% (decimal precision; tolerance 0.001%). Prevents downstream math errors in Phase 3 share-aware reserve and Phase 4 mismatch Tasks. [BDGT-08, TENT-13]

- **D-02-c — Member join/leave: workspace blocked for new transactions until owner re-distributes shares.** When a member is added or removed from a SHARED workspace (TENT-02 / TENT-06), all share-dependent UI shows a "Shares need to be updated" notice. **New transactions cannot be saved** in that workspace until the owner re-runs the global TENT-13 share form (which re-validates sum-to-100). Existing data remains read-only-visible. Per-category overrides also flagged stale and reset to global on next edit. Forces explicit owner decision; no silent shifting of math. [TENT-13, TENT-02, TENT-06]

- **D-02-d — Deposit FX-preview: live preview, rate locked at preview.** Deposit-to-shared-wallet form shows live conversion as user types ("1000 PLN ≈ 232.50 EUR @ 0.2325, Frankfurter, 2026-05-09"). On Save, the preview rate is what gets stored on the ledger row — even if the form sat open for minutes. Predictable: "what you saw is what you saved." Implementation: rate is fetched on the form-mount and on currency-change; the response object `{rate, fxRateDate, provider, isStale}` is held in form state and submitted with the save request. Server validates the rate is no older than 60 minutes (anti-stale-form guard); if older, server fetches fresh and surfaces a one-time confirm-or-cancel modal. [EXPN-13, MONY-04, MONY-06]

### FX Freshness Signaling (D-03)

- **D-03-a — Stale rate UX (weekend / holiday): silent save + freshness badge.** Frankfurter only publishes Mon–Fri ~16:00 CET. When a transaction date has no fresh rate, the system silently uses the most-recent-prior published rate, stores `fx_rate_date = <Friday's date>` and `fx_provider = 'frankfurter'` on the ledger, and the row is flagged stale (derived: `fx_rate_date < transaction_date`). UI shows an always-visible relative-time badge: "rate from Friday", "rate 2h 15m old", "rate 3 days old" — chosen automatically by humanize-duration. No interruption, no confirm step. [MONY-04, MONY-05]

- **D-03-b — Provider-down behavior: same as stale.** When Frankfurter is unreachable (network error, 5xx, timeout) the system uses the most-recent cached rate, stores it on the ledger with the actual cache `fx_rate_date`, and the freshness badge displays the relative age. No retry loops in the request path; the daily fetcher will recover the cache when the provider returns. [MONY-05, ENGR-13]

- **D-03-c — Fetch model: daily background + on-demand top-up.** A pg-boss job runs once per day at 17:00 CET (after Frankfurter publishes) and pulls rates for every (base, quote) currency-pair the system has ever observed in a ledger row plus all configured workspace `default_currency` values. Cache stored in `budgeting.fx_rates` table keyed by `(base, quote, date)`. On-demand: if a save references a (base, quote) pair we don't have, the request hits Frankfurter live, caches the result, and proceeds. If on-demand fetch fails, falls back to most-recent-prior per D-03-b. [ENGR-13]

- **D-03-d — No second live FX provider in v1.** The FxProvider port abstraction (Phase 1, D-19/ENGR-13) means a fallback provider is a future plug-in. v1 ships only the Frankfurter adapter. The cache is the only fallback. If demand emerges later, exchangerate-host or open.er-api.com can be wired in as a second adapter without touching domain code. [ENGR-13]

### Month Boundaries & Limits Model (D-04)

- **D-04-a — Workspace timezone defines all month boundaries.** Each workspace has a stored IANA timezone column (`workspaces.timezone`, e.g. `'Europe/Warsaw'`), set at creation. All "month" computations (period start/end, monthly limits, monthly aggregates) use the workspace's timezone. A user in NY at 23:00 Apr 30 logging an expense to a Warsaw workspace sees it land on May 1 (already May 1 in Warsaw). Consistent across all members. **Editability of timezone post-creation = Claude's discretion** — leaning editable-with-no-retroactive-recalc (changing timezone reshapes only future periods; historical aggregates remain pinned to whatever timezone they were computed in). Audit-logged.

- **D-04-b — Effective-dated category limits (NOT per-month snapshots).** Storage: `budgeting.category_limits (category_id, normal_amount, normal_currency, cushion_amount, cushion_currency, effective_from DATE, effective_to DATE NULL, created_at, actor_user_id)`. The latest row (where `effective_to IS NULL`) is the _current_ limit. Setting a new limit closes the previous row's `effective_to = new_row.effective_from - 1 day` and inserts a fresh row. **Reports for past closed months use whatever limit was effective at that month's last day** (i.e. the `category_limits` row whose `[effective_from, effective_to]` covers `last_day_of_month`). Reports for the **current month and any future month** use the latest (open-ended) row. [BDGT-03, BDGT-04, BDGT-05]

- **D-04-c — Mid-month limit edit: applies to current month entirely + all future.** Consequence of D-04-b. Raising Groceries from €400 → €500 on May 15 shifts May's budget bar to "€350 of €500 (70%)" the moment the change is saved, AND June+, July+, ... use €500 until next change. April (closed past month) stays at €400 in reports. The change creates a new `category_limits` row with `effective_from = today` (or first of current month — Claude's discretion; recommend `effective_from = first_day_of_current_month` so the whole current month aligns). Audit-tracked via the existing audit history. [BDGT-05]

- **D-04-d — Budget templates (BDGT-07) become bulk-set tools.** A template stores `(name, [category_id, normal_amount, normal_currency, cushion_amount, cushion_currency])`. Applying a template = bulk-create a new `category_limits` row for each listed category with `effective_from = first_day_of_target_month`. Past months are unaffected (effective-dating handles that automatically). Editing a template later does NOT propagate; user must re-apply. Templates are workspace-scoped. [BDGT-07]

- **D-04-e — Normal vs Cushion mode: workspace-level toggle.** A `workspaces.budget_mode` column (`NORMAL` | `CUSHION`) controls which limit column the budget bars/reports read from. Toggling it is forward-rolling exactly like limits: stored as an effective-dated history (`workspace_budget_mode_history` table or simply two columns `current_mode` + `mode_effective_from` updated on toggle, plus `audit_history` rows). Past closed months show whichever mode was active at the last day of that month. Current + future show the latest toggled mode. Audit-logged with actor. [BDGT-04]

### Claude's Discretion

The following gray areas were not surfaced in discussion and are deliberately left to the planner. Pick conservative defaults; flag any that turn out to be product-defining at plan-checker review:

- **Account model & balance display.** Manual balance reconciliation cadence (compute-from-ledger vs user-recorded), how credit-card / loan accounts are visualized (asset vs liability list grouping), what "archived account history" looks like in the list. Recommended default: account stores `current_balance Money` updated synchronously on each transaction; user can set/correct manual balance via an explicit "Adjust balance" action that records a `BALANCE_ADJUSTMENT` ledger row.
- **Transfer between accounts in different currencies.** Which rate? Recommended default: transfer creates two linked ledger rows (one debit, one credit), each carrying its own account-currency amount; FX rate stored on each row using the transfer date. UI shows both legs.
- **Idempotency-Key middleware semantics.** TTL = 24h fixed (per ROADMAP success criterion 5). Key scope = `(tenant_id, user_id, route, key_value)`. Storage: `platform.idempotency_keys` table with `(scope_hash, body_hash, response_status, response_body_jsonb, created_at, expires_at)`. Replay returns cached `(status, body)` verbatim if `body_hash` matches; mismatched body = 422 "key already used with different body". Already-decided per the roadmap text; planner should code to it.
- **Search & filter UX.** Server-side Postgres FTS on `note` + indexed equality filters on `(date_range, category, account, scope, kind)`. Cursor-based pagination. No saved-filter UI in v1.
- **Currency pick-list.** Closed allowlist of ISO-4217 codes that Frankfurter supports + crypto majors (BTC, ETH, USDT, USDC, BNB, SOL) routed through future crypto-price provider (placeholder for Phase 3 Investments). Workspace `default_currency` and account currencies must be on the allowlist.
- **Bulk re-categorize UX.** List multi-select + "Re-categorize to…" picker. Each row produces a correction-row per D-01-a (the audit history bloats but it's correct). No silent overwrite.
- **Projections shape.** At least `budgeting.spending_by_category_month (workspace_id, category_id, month_start_date, normal_amount, cushion_amount, currency, updated_at)` updated synchronously inside the same transaction as ledger writes (ENGR-14). Reconciliation cron (pg-boss, hourly) compares the projection to a fresh aggregate-from-ledger and logs/repairs drift. CLI `bun run replay:budgeting` rebuilds projections from `expense_ledger` for a date range.
- **EXPN-04, EXPN-05 (voice capture).** Phase 5 — do NOT ship in Phase 2. Even though listed in REQUIREMENTS.md under EXPN, the roadmap excludes them from Phase 2's requirement set (Phase 2 list is EXPN-01, -02, -03, -06, -07*, -08…-13; -04 and -05 are absent). *EXPN-07 dropped per D-01-c.

</decisions>

<canonical_refs>

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project & Phase Inputs

- `.planning/PROJECT.md` — Project vision, constraints, key decisions, evolution rules.
- `.planning/REQUIREMENTS.md` — Authoritative v1 requirement list. Note: EXPN-07 is being dropped per D-01-c — phase 2 plan must NOT include split-transaction work, and a `/gsd-transition` step must move EXPN-07 to Out of Scope.
- `.planning/ROADMAP.md` §"Phase 2: Budgeting & FX" — Goal, dependencies, requirement list, success criteria 1–5.
- `.planning/STATE.md` — Current position and accumulated decisions.

### Prior Phase Decisions (Phase 1 outcomes that constrain this phase)

- `.planning/phases/01-foundations/01-CONTEXT.md` — Phase 1 context. Especially:
  - **D-19 — `Money` value object** (Dinero v2 fiat / big.js crypto, NUMERIC(19,4) fiat / NUMERIC(38,18) crypto, no-float-money lint rule)
  - **D-20 — `Clock` port** (`SystemClock` adapter, `FakeClock` fixture)
  - **D-21 — `Result<T,E>` via neverthrow**
  - **D-23 — `expense_ledger` primitive** (table created in Phase 1, INSERT-only, RLS, REVOKE UPDATE/DELETE; Phase 2 fills it)
  - **D-24 — `audit_history` table** — typed-event log, generic, used for limit edits, share edits, recurring-rule edits, mode toggles
  - **D-25 — Outbox + dispatcher** (pg-boss every 5s, `SKIP LOCKED`, used for cross-context events from Budgeting → Reserve/Tasks downstream)
  - **D-01 / D-02 — Multi-workspace membership** (`PRIVATE` / `SHARED` workspaces, workspace `default_currency` immutable, `display_currency` on user)
  - **`withTenantTx`** primitive in `packages/platform/src/db/tx.ts` — every Budgeting persistence call must run inside it

### Phase 2 Action Items for Project-Level Docs

- **Update `.planning/REQUIREMENTS.md`:** move `EXPN-07` from Active → Out of Scope (reason: user explicitly decided one-transaction-one-category model; split feature deferred indefinitely). Note `EXPN-08` modification: recurring transactions are PENDING by default, requiring user confirmation. New requirement implied: "Pending recurring drafts inbox surface" — capture under EXPN family or a new EXPN-14.
- **Update `.planning/ROADMAP.md` §"Phase 2: Budgeting & FX":** strike "split" from Success Criteria #4. Remove EXPN-07 from the requirement list. Optionally add EXPN-14 (or an annotation on EXPN-08) for the pending-confirmation model.

### Existing Code (read before planning)

- `packages/shared-kernel/src/money.ts` — `Money` value object impl.
- `packages/shared-kernel/src/clock.ts` — `Clock` port + `SystemClock`.
- `packages/shared-kernel/src/result.ts` — `Result<T,E>`.
- `packages/shared-kernel/src/ports/fx-provider.ts` — `FxProvider` interface; **Phase 2 ships the Frankfurter adapter implementing this**. The interface signature is locked and Frankfurter must conform without changing it.
- `packages/shared-kernel/src/ports/outbox.ts` — `OutboxWriter` interface used by Budgeting to publish `TransactionCreated` / `TransactionCorrected` events to Phase 3+ contexts.
- `packages/platform/src/db/expense-ledger.ts` — Drizzle table for the `expense_ledger`. Phase 2 only INSERTs; column shape is locked (MONY-06).
- `packages/platform/src/db/schemas.ts` — Postgres schema namespaces. `budgeting` schema already exists; Phase 2 adds tables here.
- `packages/platform/src/db/roles.ts` + `apps/migrator/post-migration.sql` — `app_role` / `worker_role` REVOKE rules. Phase 2 must extend these for new tables (categories, accounts, etc.).
- `packages/platform/src/db/tx.ts` — `withTenantTx` primitive. ALL Budgeting persistence runs through this.
- `packages/platform/src/audit/writer.ts` — `audit_history` writer. Use for limit edits, share edits, mode toggles, recurring-rule edits, deposit FX-preview decisions.
- `packages/platform/src/outbox/` — outbox writer adapter; Budgeting domain events publish here.

### External Library Docs (resolve at planning-time, not now)

- Hono v4 + zod-openapi RPC patterns — for the API routes
- Drizzle `pgPolicy()` for RLS on new Budgeting tables
- pg-boss v10 — for the daily FX fetcher and hourly reconciliation cron
- Dinero.js v2 + big.js — already imported via `Money`; planner should use `Money` directly, never these libs
- `humanize-duration` (or equivalent) — for the FX freshness badge ("2h 15m old"); Claude's discretion on exact lib

</canonical_refs>

<code_context>

## Existing Code Insights

### Reusable Assets

- **`expense_ledger` table primitive** (`packages/platform/src/db/expense-ledger.ts`) — INSERT-only, RLS-enforced, MONY-06 column shape pre-built. Phase 2's Budgeting persistence adapter inserts here directly via Drizzle.
- **`Money` value object** (`packages/shared-kernel/src/money.ts`) — All domain math goes through this. Persistence adapter converts Money ↔ `(amount NUMERIC(19,4), currency CHAR(3))` columns at the boundary.
- **`FxProvider` port** (`packages/shared-kernel/src/ports/fx-provider.ts`) — Interface is locked. Frankfurter adapter ships in Phase 2 implementing `rateAsOf` exactly.
- **`OutboxWriter` port** (`packages/shared-kernel/src/ports/outbox.ts`) — Budgeting domain events go through here.
- **`Clock` port** (`packages/shared-kernel/src/clock.ts`) — All "current time" reads in domain code use this. Critical for the recurring engine's due-date computation and TZ-aware month boundaries (paired with `temporal-polyfill`).
- **`audit_history` writer** (`packages/platform/src/audit/writer.ts`) — Drop-in usage for every audit-tracked write (limit edits per BDGT-05, share edits per TENT-13/BDGT-08, mode toggles per BDGT-04, recurring-rule edits per D-01-d).
- **`withTenantTx`** (`packages/platform/src/db/tx.ts`) — Mandatory wrapper for every Budgeting persistence call. Sets `app.tenant_ids` Postgres GUC for RLS.
- **`budgeting` schema namespace** (`packages/platform/src/db/schemas.ts`) — All Phase 2 tables go here.

### Established Patterns

- **Schema-per-context Drizzle layout** — Every Phase 2 table lives in `budgeting` namespace, defined in a per-aggregate file under `packages/platform/src/db/`. Domain entities (`packages/budgeting/src/domain/`) MUST NOT import Drizzle (enforced by dependency-cruiser).
- **Append-only ledger + audit history split** — `expense_ledger` is the immutable financial record (INSERT-only, REVOKE UPDATE/DELETE). All other tables (`accounts`, `categories`, `category_limits`, `recurring_rules`, etc.) use `audit_history` for tracked edits. Don't conflate the two patterns.
- **Pg-boss for scheduled work** (D-25 outbox, plus future jobs) — Phase 2 adds: daily FX fetcher (17:00 CET), hourly reconciliation cron, recurring-draft generator.
- **`Result<T, E>` for expected failures** (D-21) — Domain returns `Result.err(InsufficientBalance)` style, never throws on a business rule.
- **RLS at DB layer + `withTenantTx`** — Every new table gets `pgPolicy()` matching the existing pattern (see `expense-ledger.ts`). Worker-role policies must mirror app-role policies because the recurring-draft generator runs in the worker.
- **Anti-corruption layer for external types** (ENGR-09) — Frankfurter response → `Money` conversion sits in the FxProvider adapter, never leaks raw provider types into domain.

### Integration Points

- **API routes (`apps/api/src/`)** — Phase 2 adds routes for accounts, categories, category-limits, transactions (CRUD + recurring + search/filter), budget-templates, FX (read cache + force-refresh admin), recurring-drafts (list + confirm/skip/edit-confirm), shares (set global + per-category override). All mutating routes wrapped by Idempotency-Key middleware.
- **Outbox events Phase 2 produces** (consumed by Phase 3+):
  - `TransactionCreated` (Reserve will subscribe in Phase 3)
  - `TransactionCorrected` (Insights will subscribe in Phase 4 to invalidate cached aggregates)
  - `RecurringInstanceConfirmed` / `RecurringInstanceSkipped` (Tasks will subscribe in Phase 4)
  - `SharesUpdated` (Reserve in Phase 3 + Tasks in Phase 4 — share-aware reserve, contribution-mismatch task generators)
  - `FxRateRefreshed` (operational telemetry)
- **Migrator (`apps/migrator/`)** — Phase 2 adds new migrations for `accounts`, `categories`, `category_limits`, `recurring_rules`, `recurring_drafts`, `budget_templates`, `member_shares`, `category_share_overrides`, `fx_rates`, `idempotency_keys`, `spending_by_category_month` (projection). Each new table needs RLS policy + REVOKE rules in `apps/migrator/post-migration.sql`.
- **Web (`apps/web/`)** — Phase 2 adds onboarded surfaces: Accounts CRUD, Categories CRUD with inline shares editor, Limits editor, Transactions list / search / filter / new / edit / delete (correction), Recurring rule CRUD, Pending recurring inbox, Budget templates CRUD + apply, Workspace settings (timezone, budget_mode toggle).
- **i18n** — All new UI strings must land in `apps/web/messages/en.json`, `pl.json`, `uk.json`. The freshness badge messages need ICU pluralization for "1 day / 2 days" cases.

</code_context>

<specifics>
## Specific Ideas

- **User-given constraint on transactions:** "one transaction = one category — that's customer's responsibility". Drives D-01-c (drop EXPN-07). Removes split logic, split_group_id, expandable rows, multi-FX-rate-per-split.
- **User-given recurring confirmation model:** "user must confirm that transaction really took place". Drives D-01-e/f/g — drafts surface, three actions, no auto-anything. Architectural change from EXPN-08 wording.
- **User-given limit model:** "If you increase this month, then this month and all forward months will use new limit. Past months should keep their historical limit value in reports." Drives D-04-b through D-04-d — effective-dated `category_limits` table; reports query by date.
- **User-given FX freshness UX:** "Always show a small info for example rate from 2h 15m". Drives D-03-a — relative-time freshness badge always visible when rate is not from today.
- **User-given share-mismatch behavior:** "Block save until shares sum to 100%" + "Block the workspace until owner re-distributes" on member change. Forces explicit owner action, no silent math.

</specifics>

<deferred>
## Deferred Ideas

- **EXPN-07 (split transactions)** — Dropped from v1 entirely per user. Possibly revisit in v1.x if real users request it. NOT a Phase 3+ item.
- **Second live FX provider (e.g. exchangerate-host)** — v1 ships only Frankfurter. The `FxProvider` port supports plug-in additions without domain changes; revisit if Frankfurter availability proves to be a real problem.
- **Saved search filters** — v1 ships search/filter without saved-filter UI; revisit in Phase 4 alongside Insights.
- **Per-month budget snapshot view** — User chose effective-dated model; if a "snapshot per month" is later desired (e.g. "what did April look like at end-of-April?"), it can be derived from `category_limits` history.
- **Workspace timezone change UX (with retroactive aggregate rebuild)** — v1 leaves timezone editable but does NOT retroactively recompute past aggregates. Revisit if support burden emerges.
- **Per-category contribution audit trail UI** — Audit data is logged to `audit_history` per D-01-a but no dedicated "share change history" UI surface in v1. Revisit alongside Insights.
- **Rate-drift confirmation modal (deposit FX-preview)** — D-02-d server-side guard: if form rate is older than 60 minutes, server fetches fresh and surfaces a confirm/cancel modal. The threshold (60 min) and modal UX are Claude's-discretion in Phase 2 plan; revisit if user reports edge cases.

</deferred>

---

_Phase: 2-Budgeting & FX_
_Context gathered: 2026-05-09_

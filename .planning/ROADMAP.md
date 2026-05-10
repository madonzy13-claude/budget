# Roadmap: Budget — Family Budgeting & Wealth Tracker

## Overview

Six phases take the project from empty repo to a multi-tenant SaaS family budgeter that tells a household exactly what to do this week to keep budget, reserve, and cushion healthy. Phase 1 is architecture-heavy: it locks in the multi-tenant + DDD discipline (RLS, `withTenantTx`, Money value object, Clock port, Result type, append-only ledger primitive, audit_history, transactional outbox skeleton, Better Auth + organization plugin, Drizzle schema-per-context, dependency-cruiser CI rule, crypto-shredding key store, i18n, Docker Compose) that every later phase depends on. Phase 2 builds the Budgeting context end-to-end with the FX adapter and idempotency-key middleware. Phase 3 fans out three parallel-eligible contexts (Reserve, Investments, Cushion) on top of Budgeting events. Phase 4 fans out three more parallel-eligible contexts (Tasks, Insights, Notifications) on top of B+C events. Phase 5 fans out the two LLM/privacy-sensitive contexts (Onboarding wizard with voice STT, Anonymous Comparison anonymizer with k-anonymity floor + DPIA gate). Phase 6 hardens for launch: PWA polish, GDPR export + crypto-shredding right-to-delete, CCPA opt-out, Docker multi-arch, observability, monthly digest, smoke + E2E.

The roadmap is dependency-driven — phase boundaries fall where bounded contexts genuinely depend on each other, not on arbitrary technical layers. The 11 bounded contexts (Identity, Tenancy, Budgeting, Reserves, Cushion, Investments, Tasks, Insights, Comparison, Notifications, Onboarding) plus shared kernel + platform map cleanly: Phase 1 ships Identity + Tenancy + shared kernel + platform; Phase 2 ships Budgeting; Phase 3 ships Reserves + Investments + Cushion in parallel; Phase 4 ships Tasks + Insights + Notifications in parallel; Phase 5 ships Onboarding + Comparison in parallel; Phase 6 is cross-cutting hardening.

## Phases

**Phase Numbering:**

- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Foundations** - Platform + Shared Kernel + Identity + Tenancy with RLS gate
- [ ] **Phase 2: Budgeting & FX** - Accounts, Categories, Budgets, Expense capture with append-only ledger and FX adapter
- [ ] **Phase 3: Reserve, Investments, Cushion** - Three parallel contexts on top of Budgeting events
- [ ] **Phase 4: Tasks, Insights, Notifications** - Three parallel contexts on top of B+C events
- [ ] **Phase 5: Onboarding & Comparison** - LLM-bounded wizard with voice + privacy-pipeline anonymizer
- [ ] **Phase 6: Launch Hardening** - PWA polish, GDPR/CCPA, observability, deploy, E2E

## Phase Details

### Phase 1: Foundations

**Goal**: Establish a multi-tenant TypeScript-on-Bun monorepo where any tenant-leak test fails closed, the shared kernel (Money, Clock, Result) is in place, RLS-enforced tenancy is end-to-end, Better Auth ships email/password + family workspaces, and the architectural rails (DDD bounded contexts, ports/adapters, append-only ledger primitive, audit_history, transactional outbox skeleton, Drizzle schema-per-context, dependency-cruiser CI rule, crypto-shredding key store, i18n, Docker Compose) make every subsequent phase trivial to plug into.
**Depends on**: Nothing (first phase)
**Requirements**: IDNT-01, IDNT-02, IDNT-03, IDNT-04, IDNT-05, IDNT-06, IDNT-07, IDNT-08, TENT-01, TENT-02, TENT-03, TENT-04, TENT-05, TENT-06, TENT-07, TENT-08, TENT-09, TENT-10, TENT-11, TENT-12, TENT-13, MONY-01, MONY-02, MONY-07, MONY-08, MONY-09, ENGR-01, ENGR-02, ENGR-03, ENGR-04, ENGR-05, ENGR-06, ENGR-07, ENGR-08, ENGR-10, ENGR-11, ENGR-12, ENGR-13, PLAT-02, PLAT-05, PLAT-06, PLAT-11, PLAT-12
**Success Criteria** (what must be TRUE):

1. New user can sign up with email/password, verify via email, reset password, and revoke their own session from a settings page rendered in EN, PL, or UK based on a setting they pick at signup
2. Authenticated user can create multiple workspaces — each explicitly `PRIVATE` (single-member, owner) or `SHARED` (multi-member, invitable by email) with an immutable default-currency picked at creation; user can join unlimited SHARED workspaces; UI offers a persisted multi-select "active workspaces" filter (default = empty, user picks first time, restored across sessions); SHARED workspace owner can configure per-member global contribution shares (decimal % per member, sum=100%) and they are audit-tracked; user has a personal `display_currency` setting independent of any workspace's default-currency; role separation (owner vs member) enforced
3. Tenant-leak CI test fails closed: a request without a tenant GUC returns zero rows from any user-data table; a worker job omitting `tenantId` errors before any DB read; app and worker DB roles have no `BYPASSRLS`; `FORCE ROW LEVEL SECURITY` is set on every user-data table
4. `docker compose up` brings up web + api + worker + db locally; migrations apply via a separate DB role with a migration-lock; the `domain/` layer is enforced by dependency-cruiser to import nothing from `drizzle-orm`, Hono, AI SDK, or any `adapters/`
5. Shared kernel exposes `Money(amount, currency)` (Dinero v2 + big.js for crypto, NUMERIC(19,4) columns, lint rule banning float arithmetic on money), `Clock` port, `Result<T, E>`, `TenantId`, `UserId`; `audit_history` table is queryable for any non-ledger entity; transactional outbox writes survive a worker restart without duplicate dispatch
   **Plans**: 00 (monorepo-scaffold) ✓, 01 (shared-kernel) ✓, 02 (platform-infra) ✓, 03 (audit-and-outbox) ✓, 04 (identity-context) ✓, 05 (identity-context pt2) ✓, 06 (tenancy-context) ✓, 07 (tenant-context-middleware) ✓, 08 (web-app-surfaces) ✓, 09 (docker-compose) pending, 10 (ci-smoke) pending

### Phase 2: Budgeting & FX

**Goal**: A user can model their household money: define accounts, define categories with both a normal and a cushion limit, capture expenses/income/transfers in any currency through a form, edit transactions via correction rows (original immutable), search/filter, and run recurring transactions — all on top of an append-only `expense_ledger` that stores original-and-default amounts plus the FX rate as of the transaction date, and behind an `Idempotency-Key` middleware so PWA offline-then-reconnect retries are safe.
**Depends on**: Phase 1
**Requirements**: MONY-03, MONY-04, MONY-05, MONY-06, ACCT-01, ACCT-02, ACCT-03, ACCT-04, BDGT-01, BDGT-02, BDGT-03, BDGT-04, BDGT-05, BDGT-06, BDGT-07, BDGT-08, EXPN-01, EXPN-02, EXPN-03, EXPN-06, EXPN-08, EXPN-09, EXPN-10, EXPN-11, EXPN-12, EXPN-13, ENGR-09, ENGR-14
**Success Criteria** (what must be TRUE):

1. User can create accounts of every supported kind (cash, checking, savings, credit card, loan, investment) per personal/shared scope, set/update manual balances, archive accounts (history preserved), and view balance in both account currency and family default currency
2. User can create categories per scope with a normal monthly limit and a separate cushion monthly limit, group them one level, edit limits with audit history visible in UI, archive categories, and apply a budget template to a new month
3. User can capture an expense, income, or transfer via form in any currency on any date; the resulting `expense_ledger` row stores `(amount_orig, currency_orig, amount_default, currency_default, fx_rate, fx_rate_date, fx_provider)` with `fx_rate_stale=true` flag falling back to most-recent-prior rate when Frankfurter is unavailable; user cannot UPDATE or DELETE a ledger row at the SQL level
4. User can edit a past transaction (creates a new correction row linking via `corrects_id`; original immutable; latest-only view derived from `WHERE id NOT IN (SELECT corrects_id FROM expense_ledger WHERE corrects_id IS NOT NULL)` per D-05-a), schedule recurring transactions (PENDING-by-default per D-01-e — engine generates drafts requiring user Confirm/Edit-confirm/Skip) that the engine generates at due date, search/filter by date/category/account/scope/text, and bulk re-categorize a set of transactions
5. Every mutating endpoint accepts an `Idempotency-Key` header; replaying the same key within 24h returns the cached response without producing a duplicate ledger row or duplicate outbox event; projections (e.g. spending-by-category-month) update in the same transaction as ledger writes and a reconciliation cron + replay-from-ledger command can rebuild them
   **Plans**: 9 plans
   **UI hint**: yes

Plans:

- [x] 02-01-PLAN.md — Money/Currency primitives, validateShares, Temporal helpers, supported_currencies bootstrap, test scaffolding
- [x] 02-02-PLAN.md — FrankfurterFxProvider adapter (ENGR-09 ACL), fx_rates cache, daily 17:00 CET pg-boss fetcher, GET /fx/rate route, schema push
- [x] 02-03-PLAN.md — Idempotency-Key middleware (shared_kernel.idempotency_keys per D-05-c), 24h TTL, hourly cleanup, cross-tenant + cross-user scope
- [x] 02-04-PLAN.md — Accounts CRUD + balance_adjustments + Hono routes + RHF form + Assets/Liabilities UI (ACCT-01..04)
- [x] 02-05-PLAN.md — Categories + effective-dated category_limits + budget_templates + share_overrides (sum-100 deferred trigger) + budget_mode_history (BDGT-01..08)
- [x] 02-06-PLAN.md — ALTER expense_ledger Phase-2 columns + DROP corrected_by_id + transaction-repo single-tx writer (ledger + balance + projection + outbox) + capture form (EXPN-01..03, -11, -13)
- [x] 02-07-PLAN.md — Edit-via-correction-row + getTransactionHistory + edit form + history panel (EXPN-06, -13)
- [x] 02-08-PLAN.md — Recurring rules + recurring_drafts (PENDING-by-default per D-01-e/f/g) + pg-boss engine + confirm/edit/skip use cases + drafts inbox UI (EXPN-08)
- [x] 02-09-PLAN.md — Search/filter (FTS plainto_tsquery + cursor) + bulk-recategorize + reconciliation cron + replay-budgeting CLI + UI (EXPN-09, -10, ENGR-14)

**Wave structure** (serial — same-wave file-overlap check forces serialization since post-migration.sql, app.ts, boot.ts, contracts/factory.ts, i18n JSONs, e2e steps glue are touched by most plans):

| Wave | Plan  | Notes                                                                                                  |
| ---- | ----- | ------------------------------------------------------------------------------------------------------ |
| 1    | 02-01 | Domain primitives, no deps                                                                             |
| 2    | 02-02 | FX adapter (pushes fx_rates schema first)                                                              |
| 3    | 02-03 | Idempotency middleware (writes app.ts middleware order — must follow 02-02's route mount)              |
| 4    | 02-04 | Accounts (writes app.ts/boot.ts/post-migration.sql)                                                    |
| 5    | 02-05 | Categories + limits + templates + shares + mode toggle                                                 |
| 6    | 02-06 | Transaction writer + ALTER expense_ledger + projection schema                                          |
| 7    | 02-07 | Edit-via-correction (extends 02-06 transaction-list)                                                   |
| 8    | 02-08 | Recurring engine (writes recurring page route + i18n + factory + e2e steps glue — overlaps with 02-07) |
| 9    | 02-09 | Search/filter/bulk + reconciliation cron + replay CLI                                                  |

Serialization tradeoff: parallel speedup is forfeited because post-migration.sql, contracts/factory.ts, en/pl/uk.json, and the e2e step-glue file are shared edit targets. Refactoring those into per-plan partial files would unlock parallel execution in v1.x — out of scope for this phase.

**Action items for `/gsd-transition`** (per CONTEXT.md D-01-c):

- Move `EXPN-07` from Active → Out of Scope in `REQUIREMENTS.md` (one-transaction-one-category model). Already removed from Phase 2 requirement line above.
- Add a new requirement (suggested ID `EXPN-14` or annotate EXPN-08) for "Pending recurring drafts inbox surface" per D-01-e.

### Phase 3: Reserve, Investments, Cushion

**Goal**: Three opt-in capabilities ship in parallel on top of Budgeting events — Reserve (logical balance per category with month-end sweep), Investments (multi-asset positions with pluggable price providers), and Cushion (target snapshot vs multi-asset holdings adequacy in default currency) — each a bounded context that depends only on Budgeting and never on the others. Parallel-eligible: `/gsd-execute-phase` can fan out.
**Depends on**: Phase 2
**Requirements**: RSRV-01, RSRV-02, RSRV-03, RSRV-04, RSRV-05, RSRV-06, RSRV-07, RSRV-08, INVT-01, INVT-02, INVT-03, INVT-04, INVT-05, INVT-06, INVT-07, CSHN-01, CSHN-02, CSHN-03, CSHN-04, CSHN-05, CSHN-06
**Success Criteria** (what must be TRUE):

1. Family can enable Reserve mode, configure the external account holding reserve funds, see UI labelled "Logical reserve · cash sits in your bank · we suggest moves", and on month-end run an idempotent sweep that emits a "Move X to Reserve" Task per under-spent category and a "Move X from Reserve" Task per over-spent category covered by reserve balance — replaying the sweep on the same period yields zero duplicate Tasks (period-scoped UNIQUE key)
2. User can confirm/decline each Reserve move; logical balance per category and total updates only on confirm; Reserve insights surface balance per category, suggested top-ups, and suggested withdrawals over time
3. User can record investment positions across stocks, ETFs, crypto, physical gold, real estate, bonds, and other; per asset choose manual snapshots or API price feed (v1 ships Twelve Data for stocks/ETFs, CoinGecko for crypto, metals.dev with GoldAPI fallback for gold; real estate and bonds remain manual); each price source sits behind a `PriceProvider` port; investment growth is computed in default currency per asset/class/total
4. User can configure cushion target as N months of cushion-budget totals with a snapshot captured at config time, declare cushion holdings across multiple accounts/asset kinds (cash any currency, bonds, gold, etc.), and see target-vs-current both in default currency — with the snapshot timestamp visible in UI so editing budget limits does not silently shift the target
5. Cushion-below-target and cushion-above-target-by-margin conditions become observable as future-Task-eligible signals (Tasks themselves emitted in Phase 4); investment-snapshot-stale condition is observable as a future-Task signal too
   **Plans**: TBD
   **UI hint**: yes

### Phase 4: Tasks, Insights, Notifications

**Goal**: Three parallel contexts give the product its differentiator and feedback loop — the Tasks queue (deterministic generators only, dismiss/snooze/done state machine, single inbox), the Insights/charts dashboard (investment growth, spending growth, overspent timeline, reserve stats, cushion adequacy, net worth, income vs expense), and Notifications (Resend email + web-push VAPID with per-user/per-event toggles). Parallel-eligible after Phase 3 because all three consume B+C events through the in-process bus.
**Depends on**: Phase 3
**Requirements**: TASK-01, TASK-02, TASK-03, TASK-04, TASK-05, TASK-06, TASK-07, TASK-08, INSI-01, INSI-02, INSI-03, INSI-04, INSI-05, INSI-06, INSI-07, NOTF-01, NOTF-02, NOTF-03, NOTF-04
**Success Criteria** (what must be TRUE):

1. User sees a single Tasks inbox with system-generated deterministic suggestions: move-to-reserve, move-from-reserve, category-overspent (`actual > limit + reserve coverage`), cushion-below-target, cushion-above-target-by-margin, missing-investment-snapshot — none of which are produced by an LLM
2. User can dismiss, snooze, or mark a Task done; a dismissed Task does not reappear unless the underlying state changes (e.g. another overspend after a fresh expense); state transitions are auditable
3. User sees charts in default currency: investment growth per asset/class/total over time, spending growth per scope and per category, overspent timeline per category, reserve balance/inflow/outflow per category over time, cushion adequacy over time, net worth + trend, income vs expense by month
4. User receives transactional and budget-alert email via Resend; user can install the PWA, accept push permission at a meaningful trigger (post-onboarding or post-first-expense — never at signup), and receive a web-push notification (VAPID + service worker) for a high-priority Task
5. Per-channel and per-event notification toggles are honored: turning off a category means no email and no push for that category; turning off web-push without revoking permission still suppresses delivery server-side
   **Plans**: TBD
   **UI hint**: yes

### Phase 5: Onboarding & Comparison

**Goal**: Two LLM/privacy-sensitive contexts ship in parallel — the conversational Onboarding wizard (text + voice in user's locale, structured Zod-validated output via Vercel AI SDK, ACL re-validates against domain invariants, daily token cap) which also unlocks voice expense capture (STT port shared); and Anonymous Family Comparison (dedicated anonymizer worker with separate role + ACL, k-anonymity floor k≥20, closed system-category taxonomy, quasi-identifier generalization, opt-in revocable consent, output to `comparison.*` schema with no per-row tenant_id, gated behind a DPIA before launch). Parallel-eligible. **DPIA gate must pass before Comparison goes live to users.**
**Depends on**: Phase 4
**Requirements**: ONBD-01, ONBD-02, ONBD-03, ONBD-04, ONBD-05, ONBD-06, ONBD-07, EXPN-04, EXPN-05, CMPR-01, CMPR-02, CMPR-03, CMPR-04, CMPR-05, CMPR-06, CMPR-07, CMPR-08
**Success Criteria** (what must be TRUE):

1. After signup, a new user runs a conversational Q&A wizard in their UI/voice locale (text + voice) that produces a starting set of categories with normal + cushion budgets, where the LLM uses only `generateObject` with Zod-validated structured output, the Onboarding ACL re-validates each field against domain invariants (LLM never directly creates rows), the wizard output is editable forever, and the user's daily LLM token cap degrades to manual entry on cap-hit without erroring
2. User can capture an expense via voice — Browser Web Speech or Groq STT, switchable per user; voice flow always shows a structured preview (parsed amount, currency, category) before save; LLM is bounded to onboarding only — voice→expense uses deterministic locale-aware amount extraction with LLM only for category/note
3. User can opt in to Anonymous Family Comparison via an explicit revocable consent flow; opt-out is honored within one anonymization run; user category is mapped through a closed system-category taxonomy; quasi-identifiers are generalized (region at country level, household size bucketed 1/2/3-4/5+, currency top-5 + other)
4. Anonymizer worker runs under a dedicated DB role with a separate ACL distinct from the app role; output lands in a `comparison.*` schema with no per-row `tenant_id`; cohorts smaller than k=20 (tenant-policy-configurable) are suppressed and the user sees a "not enough data yet" state; CI test asserts the app role cannot read `comparison.*`
5. DPIA + GDPR + CCPA review passes before Comparison is enabled in production: privacy notice, lawful basis documented, retention defined, opt-out flow verified, k-floor verified by red-team query attempt
   **Plans**: TBD
   **UI hint**: yes

### Phase 6: Launch Hardening

**Goal**: Take the system from feature-complete to launch-ready: Serwist PWA polish (offline read of last-loaded data, install prompt at the right moment), GDPR data export per user/family + crypto-shredding right-to-delete, CCPA opt-out for analytics/comparison, multi-arch Docker images for production, observability stack (pino structured logs + OpenTelemetry traces + Sentry errors), monthly digest available in-app and via optional email, deploy hardening (stateless app tier with documented horizontal-scale path), and a green smoke + Playwright E2E suite covering install/push/voice/comparison-suppression flows.
**Depends on**: Phase 5
**Requirements**: PLAT-01, PLAT-03, PLAT-04, PLAT-07, PLAT-08, PLAT-09, PLAT-10, INSI-08
**Success Criteria** (what must be TRUE):

1. User can install the PWA from a supported browser, see last-loaded data offline, and the service worker has a clean update strategy (no stale assets after deploy); the install prompt fires at the meaningful trigger defined in Phase 4 (post-onboarding or post-first-expense)
2. User can request a GDPR data export of their personal scope and a family owner can request the family's export — both produced as a machine-readable archive within the documented SLA
3. User can request right-to-delete; their per-user DEK is destroyed (crypto-shredded) so PII columns become unreadable while ledger amount/date rows survive immutably; CCPA opt-out for analytics and Comparison is honored end-to-end
4. Production deploys via multi-arch Docker images (buildx); the app tier is stateless (sticky session not required); pino + OpenTelemetry + Sentry are wired so a single request shows correlated logs/traces/errors; monthly digest is available in-app and as an opt-in email
5. Smoke + Playwright E2E suite is green covering: signup→onboarding wizard→first expense→install PWA→accept push→receive Task push; voice expense flow with structured preview; Comparison opt-in with k<20 suppression; right-to-delete crypto-shred verification; ledger UPDATE/DELETE blocked at SQL level
   **Plans**: TBD
   **UI hint**: yes

## Deferred (v1.x and v2+)

These appear in REQUIREMENTS.md but are explicitly NOT scheduled in v1. Listed here for visibility; do not plan against them.

**v1.x deferred:**

- IDNT-2FA — TOTP 2FA support
- IDNT-OAUTH — Social login (Google, Apple)
- EXPN-TAGS — Tags on transactions (separate from categories)
- EXPN-WHO — "Who paid" attribution per shared transaction
- EXPN-CSV — CSV import (in addition to GDPR export)
- BDGT-AUTORULES — Rule-based auto-categorization
- PLAT-REGION — Region-per-family hosting selection at signup
- INVT-BONDDEEP — Structured manual bond inputs with yield/coupon/accrual

**v2+ deferred:**

- EXPN-BANK — Bank API integration (Plaid / Open Banking)
- EXPN-OCR — Receipt photo OCR
- EXPN-EMAIL — Receipt forwarding via email
- PLAT-NATIVE — Native iOS/Android apps
- EXPN-ML — ML auto-categorization
- BDGT-CUSTOMPERIOD — Non-monthly budget periods
- TENT-KIDS — Kid accounts with limited permissions
- INSI-PROJ — Forward projections (cashflow forecast)
- PLAT-API — Public API + webhooks

## Bounded-Context Map

The 11 bounded contexts (per ENGR-03) ship across phases as follows:

| Context       | Phase | Notes                                                       |
| ------------- | ----- | ----------------------------------------------------------- |
| Identity      | 1     | Better Auth + email/password + sessions + locale            |
| Tenancy       | 1     | Family workspace, RLS, organization plugin                  |
| Budgeting     | 2     | Accounts, Categories, Budgets, Expense ledger, FX           |
| Reserves      | 3     | Logical balance, end-of-month sweep, parallel-eligible      |
| Cushion       | 3     | Target snapshot, multi-asset adequacy, parallel-eligible    |
| Investments   | 3     | Asset classes, pluggable price providers, parallel-eligible |
| Tasks         | 4     | Deterministic generators only, parallel-eligible            |
| Insights      | 4     | Charts + projections reconciliation, parallel-eligible      |
| Notifications | 4     | Resend email + web-push VAPID, parallel-eligible            |
| Onboarding    | 5     | LLM bounded here only; voice STT port, parallel-eligible    |
| Comparison    | 5     | Anonymizer worker + ACL + DPIA gate, parallel-eligible      |

Shared kernel (`Money`, `Currency`, `TenantId`, `UserId`, `Clock`, `Result`) and platform (RLS helpers, outbox, event bus, i18n, logging, tracing) ship in Phase 1 and are extended (not redesigned) in later phases.

## Cross-Phase Tensions

These are reconciled in the phases that own them:

| Tension                                                       | Owning Phase(s) | Resolution location                                                                               |
| ------------------------------------------------------------- | --------------- | ------------------------------------------------------------------------------------------------- |
| RLS + workers (no BYPASSRLS worker role; jobs carry tenantId) | 1               | Tenancy + platform; CI gate in Phase 1                                                            |
| Append-only ledger + GDPR Article 17 (crypto-shredding)       | 1, 6            | PII/ledger schema split day 1 (Phase 1); DEK destroy flow ships Phase 6                           |
| Comparison crosses tenant boundary                            | 1, 5            | Anonymizer DB role + `comparison.*` schema designed in Phase 1 RLS work; ACL + k-floor in Phase 5 |
| PWA offline + idempotency                                     | 2, 6            | `Idempotency-Key` middleware in Phase 2; PWA polish in Phase 6                                    |
| LLM scope (Onboarding only; Tasks deterministic)              | 4, 5            | Tasks generators deterministic in Phase 4; LLM adapter contained in Onboarding in Phase 5         |
| Cushion target snapshot to avoid silent shifts                | 3               | Snapshot at config time + UI shows snapshot date                                                  |
| FX historical rate + back-dated expenses + weekend gaps       | 2               | Local cache + stale-flag fallback inside Phase 2                                                  |
| ORM types leaking into domain                                 | 1               | dependency-cruiser CI rule in Phase 1                                                             |
| End-of-month sweep duplicate Tasks on retry                   | 3               | Period-scoped UNIQUE key in Phase 3                                                               |

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6

Within Phase 3, sub-contexts (Reserve, Investments, Cushion) are parallel-eligible.
Within Phase 4, sub-contexts (Tasks, Insights, Notifications) are parallel-eligible.
Within Phase 5, sub-contexts (Onboarding, Comparison) are parallel-eligible.

| Phase                             | Plans Complete | Status      | Completed |
| --------------------------------- | -------------- | ----------- | --------- |
| 1. Foundations                    | 0/TBD          | Not started | -         |
| 2. Budgeting & FX                 | 0/TBD          | Not started | -         |
| 3. Reserve, Investments, Cushion  | 0/TBD          | Not started | -         |
| 4. Tasks, Insights, Notifications | 0/TBD          | Not started | -         |
| 5. Onboarding & Comparison        | 0/TBD          | Not started | -         |
| 6. Launch Hardening               | 0/TBD          | Not started | -         |

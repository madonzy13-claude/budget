# Requirements: Budget — Family Budgeting & Wealth Tracker

**Defined:** 2026-05-05
**Core Value:** A family can replace a complex personal-budget spreadsheet with a multi-user, multi-currency tool that tells them — through a single Tasks queue — exactly what to do this week to keep budget, reserve, and cushion healthy.

## v1 Requirements

Requirements for initial release. Each maps to roadmap phases.

### Authentication & Identity (IDNT)

- [ ] **IDNT-01**: User can sign up with email and password
- [ ] **IDNT-02**: User receives email verification after signup
- [ ] **IDNT-03**: User can reset password via email link
- [ ] **IDNT-04**: User session persists across browser refresh and is revocable from settings
- [ ] **IDNT-05**: User picks UI language (EN/PL/UK) and voice language at signup
- [ ] **IDNT-06**: User can change UI language and voice language anytime in settings
- [ ] **IDNT-07**: User can choose preferred LLM provider (Claude Haiku / Groq) in settings
- [ ] **IDNT-08**: User can choose preferred STT provider (Browser Web Speech / Groq) in settings

### Tenancy & Family (TENT)

- [ ] **TENT-01**: User can create a family workspace
- [ ] **TENT-02**: Family owner can invite members by email
- [ ] **TENT-03**: Family member roles enforced: owner, member
- [ ] **TENT-04**: Each user has a personal budget visible only to them, plus shared family budget visible to all members
- [ ] **TENT-05**: Owner can transfer ownership; cannot leave as last owner
- [ ] **TENT-06**: Member can leave family; their personal data stays in their personal workspace
- [ ] **TENT-07**: Tenant isolation enforced at DB layer (Postgres RLS, app role has no BYPASSRLS, FORCE ROW LEVEL SECURITY on all user-data tables)
- [ ] **TENT-08**: Background jobs run with same RLS context as HTTP (worker role has no BYPASSRLS; jobs carry tenantId)

### Money & Currencies (MONY)

- [ ] **MONY-01**: All monetary fields use `Money(amount, currency)` value object — never bare numbers
- [ ] **MONY-02**: Family picks default analytics currency at workspace creation
- [ ] **MONY-03**: Any monetary input accepts any currency
- [ ] **MONY-04**: System auto-converts to default currency at FX rate as of transaction date (Frankfurter ECB)
- [ ] **MONY-05**: FX rates cached locally with stale fallback (use most-recent-prior with `fx_rate_stale=true` flag if provider unavailable)
- [ ] **MONY-06**: Ledger row stores `(amount_orig, currency_orig, amount_default, currency_default, fx_rate, fx_rate_date, fx_provider)`
- [ ] **MONY-07**: Money columns use `NUMERIC(19,4)` (or `NUMERIC(38,18)` for crypto); float types banned by lint rule
- [ ] **MONY-08**: FX provider abstraction (port) allows adding providers without touching domain

### Accounts (ACCT)

- [ ] **ACCT-01**: User can create accounts (cash, checking, savings, credit card, loan, investment) per scope (personal/shared)
- [ ] **ACCT-02**: User can record manual balance for any account
- [ ] **ACCT-03**: User can archive accounts (preserves history, hides from active lists)
- [ ] **ACCT-04**: Account currency is set at creation; balance shown in account currency and default currency

### Categories & Budgets (BDGT)

- [ ] **BDGT-01**: User defines spending categories per scope (personal/shared)
- [ ] **BDGT-02**: Categories support one-level grouping
- [ ] **BDGT-03**: Each category has monthly normal budget limit
- [ ] **BDGT-04**: Each category has separate monthly cushion budget limit (austerity mode)
- [ ] **BDGT-05**: User can edit limits any time; changes audit-tracked
- [ ] **BDGT-06**: User can archive categories (preserves history, hides from new-expense pickers)
- [ ] **BDGT-07**: User can create budget templates and apply to new months

### Expense Capture (EXPN)

- [ ] **EXPN-01**: User can add expense via form: amount, currency, date, category, account, note
- [ ] **EXPN-02**: User can add income (separate transaction kind)
- [ ] **EXPN-03**: User can record transfer between accounts (no category impact)
- [ ] **EXPN-04**: User can add expense via voice (Browser STT or Groq STT, per-user pluggable)
- [ ] **EXPN-05**: Voice flow always shows structured preview with parsed amount/currency/category before save
- [ ] **EXPN-06**: User can edit transactions; edits create new ledger correction row, original immutable
- [ ] **EXPN-07**: User can split a transaction across multiple categories
- [ ] **EXPN-08**: User can record recurring transactions (monthly, weekly); engine generates instances at due date
- [ ] **EXPN-09**: User can search and filter transactions by date range, category, account, scope, text
- [ ] **EXPN-10**: User can re-categorize transactions; bulk re-categorize supported
- [ ] **EXPN-11**: All capture surfaces accept any currency (multi-currency-native)
- [ ] **EXPN-12**: All mutating endpoints accept `Idempotency-Key` header (PWA offline → reconnect safety)

### Reserve System (RSRV) — opt-in

- [ ] **RSRV-01**: Family can enable Reserve mode and configure external account holding reserve funds
- [ ] **RSRV-02**: At month-end, system computes (limit − actual) per category. Positive → emit "Move X to Reserve" Task; negative → emit "Move X from Reserve" Task if reserve balance covers it
- [ ] **RSRV-03**: System tracks reserve logical balance per category and total
- [ ] **RSRV-04**: User confirms moves; reserve balance updates only after confirmation
- [ ] **RSRV-05**: End-of-month sweep is idempotent; period-scoped UNIQUE key prevents duplicate Tasks on retry
- [ ] **RSRV-06**: Reserve insights surface balance per category, suggested top-ups, suggested withdrawals
- [ ] **RSRV-07**: UI labels Reserve as "Logical reserve · cash sits in your bank · we suggest moves" (out of payments-regulation scope)

### Cushion (CSHN) — opt-in

- [ ] **CSHN-01**: User configures cushion target as N months of cushion-budget totals
- [ ] **CSHN-02**: Cushion-budget snapshot captured at config time; user explicitly re-baselines on change
- [ ] **CSHN-03**: User can declare cushion holdings across one or more accounts/assets (cash any currency, bonds, gold, etc.)
- [ ] **CSHN-04**: System computes cushion target value vs current cushion holdings, both in default currency
- [ ] **CSHN-05**: Task emitted when cushion < target (top-up suggested)
- [ ] **CSHN-06**: Task emitted when cushion > target by configured margin (excess can be redeployed)

### Investments (INVT)

- [ ] **INVT-01**: User can record investment positions across asset classes: stocks, ETFs, crypto, physical gold, real estate, bonds, other
- [ ] **INVT-02**: Per asset, user chooses valuation source: manual snapshots OR API price feed
- [ ] **INVT-03**: v1 ships price provider for stocks/ETFs (Twelve Data), crypto (CoinGecko), gold (metals.dev with GoldAPI fallback)
- [ ] **INVT-04**: Real-estate and bonds remain manual snapshots in v1
- [ ] **INVT-05**: System computes investment growth over time in default currency, per asset/class/total
- [ ] **INVT-06**: Price-provider abstraction (port) allows adding providers without touching domain
- [ ] **INVT-07**: System emits Task for missing investment snapshot when expected refresh interval elapsed

### Onboarding Wizard (ONBD)

- [ ] **ONBD-01**: After signup, conversational Q&A wizard runs in user's language (text + voice)
- [ ] **ONBD-02**: Wizard helps user define starting categories and per-category monthly budgets
- [ ] **ONBD-03**: LLM provider for wizard pluggable; v1 ships Claude Haiku and Groq
- [ ] **ONBD-04**: LLM uses structured output (Zod-validated) only; no free-form chat
- [ ] **ONBD-05**: Wizard ACL re-validates LLM output against domain invariants; LLM never directly creates rows
- [ ] **ONBD-06**: Wizard output is editable — never auto-locked; user can revisit anytime
- [ ] **ONBD-07**: Per-user daily LLM token cap enforced; behavior at cap defined (degrade to manual entry)

### Tasks Queue (TASK)

- [ ] **TASK-01**: System surfaces single Tasks inbox with system-generated suggestions
- [ ] **TASK-02**: Task generators (deterministic, never LLM): move money to/from reserve, category overspent, cushion below/above target, missing investment snapshot
- [ ] **TASK-03**: Overspent definition: actual > limit + reserve coverage
- [ ] **TASK-04**: User can dismiss, snooze, or mark a Task done
- [ ] **TASK-05**: Dismissed Tasks don't reappear unless underlying state changes
- [ ] **TASK-06**: High-priority Tasks trigger web-push notification (per user preferences)

### Insights & Charts (INSI)

- [ ] **INSI-01**: Investment growth chart per asset, per class, total — over time, default currency
- [ ] **INSI-02**: Spending growth (private/shared/total) — overall and per category
- [ ] **INSI-03**: Overspent timeline per category
- [ ] **INSI-04**: Reserve statistics per category (balance, inflows, outflows over time)
- [ ] **INSI-05**: Cushion adequacy over time (target vs actual)
- [ ] **INSI-06**: Net worth and trend (sum of accounts + investments, default currency)
- [ ] **INSI-07**: Income vs expense by month
- [ ] **INSI-08**: Monthly digest available (in-app + optional email)

### Anonymous Family Comparison (CMPR)

- [ ] **CMPR-01**: Comparison feature is opt-in with explicit, revocable consent flow
- [ ] **CMPR-02**: Anonymization pipeline strips PII before aggregation
- [ ] **CMPR-03**: Family compares own per-category spending vs anonymized percentile across opted-in families with similar profile (region, household size)
- [ ] **CMPR-04**: k-anonymity floor enforced (k≥20 default, tenant-policy-configurable); cohorts smaller than k return suppressed
- [ ] **CMPR-05**: Closed system-category taxonomy used for comparison (user category mapped to system bucket)
- [ ] **CMPR-06**: Quasi-identifier generalization applied (region at country level, household size bucketed 1 / 2 / 3-4 / 5+, currency top-5 + other)
- [ ] **CMPR-07**: Anonymizer is dedicated worker with separate role + ACL; output written to `comparison.*` schema with no per-row tenant_id
- [ ] **CMPR-08**: GDPR + CCPA compliance verified before launch (DPIA gate)

### Notifications (NOTF)

- [ ] **NOTF-01**: Email notifications via Resend (transactional + budget alerts)
- [ ] **NOTF-02**: Web-push notifications via VAPID + service worker for high-priority Tasks
- [ ] **NOTF-03**: Per-channel, per-event toggles in user preferences
- [ ] **NOTF-04**: Push permission requested at meaningful moment (post-onboarding, post-first-expense — not at signup)

### Platform & Ops (PLAT)

- [ ] **PLAT-01**: PWA installable: manifest + Serwist service worker, offline-friendly read of last-loaded data
- [ ] **PLAT-02**: Single Docker Compose stack runs whole system locally (web, api, worker, db)
- [ ] **PLAT-03**: Production deployment via Docker images (multi-arch buildx)
- [ ] **PLAT-04**: Stateless app tier; horizontal scale path documented (Postgres read replicas later)
- [ ] **PLAT-05**: i18n full from day one (next-intl); EN, PL, UK at launch
- [ ] **PLAT-06**: New languages added without code changes (JSON catalog only)
- [ ] **PLAT-07**: GDPR data export per user/family (machine-readable archive)
- [ ] **PLAT-08**: GDPR right-to-delete via crypto-shredding (per-user DEK destroyed; ledger amount/date rows preserved immutably)
- [ ] **PLAT-09**: CCPA opt-out for analytics/comparison
- [ ] **PLAT-10**: Observability: pino structured logs + OpenTelemetry traces + Sentry errors
- [ ] **PLAT-11**: Hosting region single-region v1 (region selection deferred to v1.x)
- [ ] **PLAT-12**: Migrations apply via separate DB role (not app role); container boot uses migration-lock to avoid race

### Engineering Discipline (ENGR)

- [ ] **ENGR-01**: TDD: every domain rule has a failing test before code
- [ ] **ENGR-02**: Coverage gate on domain layer (CI fails below threshold)
- [ ] **ENGR-03**: 11 bounded contexts: Identity, Tenancy, Budgeting, Reserves, Cushion, Investments, Tasks, Insights, Comparison, Notifications, Onboarding
- [ ] **ENGR-04**: Each context: `domain/`, `application/`, `ports/`, `adapters/`, `contracts/` — only `contracts/` cross-importable
- [ ] **ENGR-05**: Shared kernel (`Money`, `Currency`, `TenantId`, `UserId`, `Clock`, `Result`) — no business logic
- [ ] **ENGR-06**: Append-only ledger for transactions; DB role-level `REVOKE UPDATE, DELETE` on ledger from app role
- [ ] **ENGR-07**: Generic versioned audit_history table for non-ledger entities; visible in UI
- [ ] **ENGR-08**: Transactional outbox + in-process event bus; outbox dispatcher idempotent via `dispatched_at`
- [ ] **ENGR-09**: Three mandatory ACLs: Comparison anonymizer, Onboarding→Budgeting (LLM JSON → CategoryDraft), External price/FX → domain Money
- [ ] **ENGR-10**: CI rule (dependency-cruiser): `domain/` cannot import `drizzle-orm`, Hono, AI SDK, or any `adapters/`
- [ ] **ENGR-11**: `Clock` port injected into all domain code (deterministic time for tests)
- [ ] **ENGR-12**: `Result<T, E>` for expected domain failures; throw only for programmer errors
- [ ] **ENGR-13**: Pluggable provider interfaces with in-memory fakes: FX, STT, LLM, prices, email, push
- [ ] **ENGR-14**: Projections updated in same tx as ledger writes; reconciliation cron + replay-from-ledger command

## v1.x Requirements

Tracked but deferred past v1 launch.

### Security & Auth

- **IDNT-2FA**: TOTP 2FA support
- **IDNT-OAUTH**: Social login (Google, Apple)

### Productivity

- **EXPN-TAGS**: Tags on transactions (separate from categories)
- **EXPN-WHO**: "Who paid" attribution per shared transaction
- **EXPN-CSV**: CSV import (in addition to GDPR export)
- **BDGT-AUTORULES**: Rule-based auto-categorization (e.g. note matches "Tesco" → Groceries)

### Region & Compliance

- **PLAT-REGION**: Region-per-family hosting selection at signup (EU vs US)

### Investments

- **INVT-BONDDEEP**: Structured manual bond inputs with yield/coupon/accrual

## v2+ Requirements

Out of v1 roadmap. Acknowledged.

- **EXPN-BANK**: Bank API integration (Plaid / Open Banking) — pluggable provider
- **EXPN-OCR**: Receipt photo OCR
- **EXPN-EMAIL**: Receipt forwarding via email
- **PLAT-NATIVE**: Native iOS/Android apps
- **EXPN-ML**: ML auto-categorization
- **BDGT-CUSTOMPERIOD**: Non-monthly budget periods (weekly, biweekly, custom)
- **TENT-KIDS**: Kid accounts with limited permissions
- **INSI-PROJ**: Forward projections (cashflow forecast)
- **PLAT-API**: Public API + webhooks

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Tax filing / tax reports | Budgeting product, not accounting |
| Crypto custody / trading execution | Regulatory scope; valuation only |
| Generic chat-with-your-data LLM | LLM bounded to onboarding + structured Task inputs |
| Full event sourcing (CQRS) | Append-only ledger + audit_history is pragmatic equivalent |
| Real-time collaboration (live cursor / presence) | Eventual consistency + push is sufficient |
| Receipt OCR (v1) | Voice + form covers v1 |
| Direct bank API (v1) | Pipeline architected for v2+ provider plug-in |
| Native mobile (v1) | PWA covers v1 |
| Generic goals beyond cushion | Reserve mechanic covers irregular costs |

## Traceability

Mapped during roadmap creation. Each v1 requirement maps to exactly one phase.

| Requirement | Phase | Status |
|-------------|-------|--------|
| IDNT-01 | Phase 1 | Pending |
| IDNT-02 | Phase 1 | Pending |
| IDNT-03 | Phase 1 | Pending |
| IDNT-04 | Phase 1 | Pending |
| IDNT-05 | Phase 1 | Pending |
| IDNT-06 | Phase 1 | Pending |
| IDNT-07 | Phase 1 | Pending |
| IDNT-08 | Phase 1 | Pending |
| TENT-01 | Phase 1 | Pending |
| TENT-02 | Phase 1 | Pending |
| TENT-03 | Phase 1 | Pending |
| TENT-04 | Phase 1 | Pending |
| TENT-05 | Phase 1 | Pending |
| TENT-06 | Phase 1 | Pending |
| TENT-07 | Phase 1 | Pending |
| TENT-08 | Phase 1 | Pending |
| MONY-01 | Phase 1 | Pending |
| MONY-02 | Phase 1 | Pending |
| MONY-03 | Phase 2 | Pending |
| MONY-04 | Phase 2 | Pending |
| MONY-05 | Phase 2 | Pending |
| MONY-06 | Phase 2 | Pending |
| MONY-07 | Phase 1 | Pending |
| MONY-08 | Phase 1 | Pending |
| ACCT-01 | Phase 2 | Pending |
| ACCT-02 | Phase 2 | Pending |
| ACCT-03 | Phase 2 | Pending |
| ACCT-04 | Phase 2 | Pending |
| BDGT-01 | Phase 2 | Pending |
| BDGT-02 | Phase 2 | Pending |
| BDGT-03 | Phase 2 | Pending |
| BDGT-04 | Phase 2 | Pending |
| BDGT-05 | Phase 2 | Pending |
| BDGT-06 | Phase 2 | Pending |
| BDGT-07 | Phase 2 | Pending |
| EXPN-01 | Phase 2 | Pending |
| EXPN-02 | Phase 2 | Pending |
| EXPN-03 | Phase 2 | Pending |
| EXPN-04 | Phase 5 | Pending |
| EXPN-05 | Phase 5 | Pending |
| EXPN-06 | Phase 2 | Pending |
| EXPN-07 | Phase 2 | Pending |
| EXPN-08 | Phase 2 | Pending |
| EXPN-09 | Phase 2 | Pending |
| EXPN-10 | Phase 2 | Pending |
| EXPN-11 | Phase 2 | Pending |
| EXPN-12 | Phase 2 | Pending |
| RSRV-01 | Phase 3 | Pending |
| RSRV-02 | Phase 3 | Pending |
| RSRV-03 | Phase 3 | Pending |
| RSRV-04 | Phase 3 | Pending |
| RSRV-05 | Phase 3 | Pending |
| RSRV-06 | Phase 3 | Pending |
| RSRV-07 | Phase 3 | Pending |
| CSHN-01 | Phase 3 | Pending |
| CSHN-02 | Phase 3 | Pending |
| CSHN-03 | Phase 3 | Pending |
| CSHN-04 | Phase 3 | Pending |
| CSHN-05 | Phase 3 | Pending |
| CSHN-06 | Phase 3 | Pending |
| INVT-01 | Phase 3 | Pending |
| INVT-02 | Phase 3 | Pending |
| INVT-03 | Phase 3 | Pending |
| INVT-04 | Phase 3 | Pending |
| INVT-05 | Phase 3 | Pending |
| INVT-06 | Phase 3 | Pending |
| INVT-07 | Phase 3 | Pending |
| ONBD-01 | Phase 5 | Pending |
| ONBD-02 | Phase 5 | Pending |
| ONBD-03 | Phase 5 | Pending |
| ONBD-04 | Phase 5 | Pending |
| ONBD-05 | Phase 5 | Pending |
| ONBD-06 | Phase 5 | Pending |
| ONBD-07 | Phase 5 | Pending |
| TASK-01 | Phase 4 | Pending |
| TASK-02 | Phase 4 | Pending |
| TASK-03 | Phase 4 | Pending |
| TASK-04 | Phase 4 | Pending |
| TASK-05 | Phase 4 | Pending |
| TASK-06 | Phase 4 | Pending |
| INSI-01 | Phase 4 | Pending |
| INSI-02 | Phase 4 | Pending |
| INSI-03 | Phase 4 | Pending |
| INSI-04 | Phase 4 | Pending |
| INSI-05 | Phase 4 | Pending |
| INSI-06 | Phase 4 | Pending |
| INSI-07 | Phase 4 | Pending |
| INSI-08 | Phase 6 | Pending |
| CMPR-01 | Phase 5 | Pending |
| CMPR-02 | Phase 5 | Pending |
| CMPR-03 | Phase 5 | Pending |
| CMPR-04 | Phase 5 | Pending |
| CMPR-05 | Phase 5 | Pending |
| CMPR-06 | Phase 5 | Pending |
| CMPR-07 | Phase 5 | Pending |
| CMPR-08 | Phase 5 | Pending |
| NOTF-01 | Phase 4 | Pending |
| NOTF-02 | Phase 4 | Pending |
| NOTF-03 | Phase 4 | Pending |
| NOTF-04 | Phase 4 | Pending |
| PLAT-01 | Phase 6 | Pending |
| PLAT-02 | Phase 1 | Pending |
| PLAT-03 | Phase 6 | Pending |
| PLAT-04 | Phase 6 | Pending |
| PLAT-05 | Phase 1 | Pending |
| PLAT-06 | Phase 1 | Pending |
| PLAT-07 | Phase 6 | Pending |
| PLAT-08 | Phase 6 | Pending |
| PLAT-09 | Phase 6 | Pending |
| PLAT-10 | Phase 6 | Pending |
| PLAT-11 | Phase 1 | Pending |
| PLAT-12 | Phase 1 | Pending |
| ENGR-01 | Phase 1 | Pending |
| ENGR-02 | Phase 1 | Pending |
| ENGR-03 | Phase 1 | Pending |
| ENGR-04 | Phase 1 | Pending |
| ENGR-05 | Phase 1 | Pending |
| ENGR-06 | Phase 1 | Pending |
| ENGR-07 | Phase 1 | Pending |
| ENGR-08 | Phase 1 | Pending |
| ENGR-09 | Phase 2 | Pending |
| ENGR-10 | Phase 1 | Pending |
| ENGR-11 | Phase 1 | Pending |
| ENGR-12 | Phase 1 | Pending |
| ENGR-13 | Phase 1 | Pending |
| ENGR-14 | Phase 2 | Pending |

**Per-phase counts:**

| Phase | Requirements Mapped |
|-------|---------------------|
| Phase 1 — Foundations | 37 |
| Phase 2 — Budgeting & FX | 27 |
| Phase 3 — Reserve, Investments, Cushion | 20 |
| Phase 4 — Tasks, Insights, Notifications | 17 |
| Phase 5 — Onboarding & Comparison | 17 |
| Phase 6 — Launch Hardening | 8 |
| **Total** | **126** |

**Coverage:**
- v1 requirements: 126 total (re-counted from category subtotals — original "110" line was a tally error in initial draft)
- Mapped to phases: 126
- Unmapped: 0
- v1.x requirements: 8 (deferred — appear in roadmap as "Deferred", not scheduled)
- v2+ requirements: 9 (deferred — appear in roadmap as "Deferred", not scheduled)

---
*Requirements defined: 2026-05-05*
*Last updated: 2026-05-05 — traceability populated by /gsd-roadmap; coverage 126/126*

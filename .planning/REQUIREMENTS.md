# Requirements: Budget v1.1 — Budget Restructure

**Defined:** 2026-05-11
**Milestone:** v1.1 (Budget Restructure)
**Core Value:** A family can replace a complex personal-budget spreadsheet with a multi-user, multi-currency tool whose single Tasks queue tells them exactly what to do this week to keep budget, reserve, and cushion healthy.

**Reference spec:** `.planning/v1.1-SPEC.md` — full decision record from 2026-05-11 brainstorming.
**v1.0 archived requirements:** `.planning/archive/v1.0/REQUIREMENTS.md`.

---

## v1.1 Requirements

All scoped to current milestone. Each maps to exactly one roadmap phase via traceability table.

### Migration & Rename (MIG)

- [ ] **MIG-01**: Drizzle migration renames table `workspaces` → `budgets` and all FK columns `workspace_id` → `budget_id` across all schemas
- [ ] **MIG-02**: Drizzle migration renames table `accounts` → `wallets` and all FK columns `account_id` → `wallet_id` across all schemas
- [ ] **MIG-03**: Migration drops columns `transactions.kind`, `transactions.account_id`, `transactions.to_account_id`, `transactions.direction`, `accounts.scope`
- [ ] **MIG-04**: Migration adds `wallets.wallet_type` enum (SPENDINGS, CUSHION, RESERVE) replacing `accounts.account_kind`
- [ ] **MIG-05**: Migration adds `category_limits.cushion_amount_cents` (parallel SCD-2 column alongside existing `planned_amount_cents`)
- [ ] **MIG-06**: Migration adds `budgets.cushion_mode_enabled boolean default false`
- [ ] **MIG-07**: Migration adds `categories.sort_index INTEGER` per-budget for drag-reorder persistence
- [ ] **MIG-08**: Migration creates `tasks` table (id, tenant_id, budget_id, kind enum, payload_json, status enum, created_at, resolved_at)
- [ ] **MIG-09**: Dev DB nuked: existing data discarded; no data migration script required
- [ ] **MIG-10**: All i18n message keys renamed `workspaces.*` → `budgets.*` and `accounts.*` → `wallets.*` across EN/PL/UK
- [ ] **MIG-11**: All Hono routes renamed `/workspaces/*` → `/budgets/*` and `/accounts/*` → `/wallets/*`; old paths removed (no aliases)
- [x] **MIG-12**: Domain entities renamed `Workspace` → `Budget`, `Account` → `Wallet` across `packages/budgeting`, `packages/tenancy`
- [ ] **MIG-13**: Tenant-leak CI gate updated to target renamed tables; passes 6/6 tests on new schema

### Top Navigation & Budget Switcher (NAV)

- [ ] **NAV-01**: Top nav displays current budget name + private/shared icon + chevron as dropdown trigger
- [ ] **NAV-02**: Budget switcher dropdown lists user's budgets grouped by Personal / Shared sections
- [ ] **NAV-03**: Dropdown has aside `+` button (not list item) that opens new-budget wizard at `/budgets/new`
- [ ] **NAV-04**: Clicking a budget in dropdown navigates to `/budgets/[id]/spendings`
- [ ] **NAV-05**: Standalone `/workspaces` list page removed; switcher replaces it

### Home Page — Combined View (HOME)

- [x] **HOME-01**: `/` renders one card per budget the user has access to (Personal + Shared)
- [x] **HOME-02**: Each card shows: budget name, type badge, current-month total spent, total wallets value (converted to user's `display_currency`), top 1–2 overspent categories
- [ ] **HOME-03**: Card click navigates to `/budgets/[id]/spendings`
- [ ] **HOME-04**: Placeholder chart component below cards (scaffold only, no real data wiring in v1.1)

### Budget Detail Page (BDP) — Tab Frame (BDP)

- [ ] **BDP-01**: BDP route `/budgets/[id]` renders pill-style horizontal tabs sticky on scroll
- [ ] **BDP-02**: Tab order: Spendings · Reserves · Wallets · Settings; default tab = Spendings
- [ ] **BDP-03**: Task banner renders above tabs when tasks exist; shows count chip; click expands inline list with primary action per task
- [ ] **BDP-04**: Active tab pill highlighted with yellow accent per DESIGN.md
- [ ] **BDP-05**: Browser back/forward respects tab routes (`/budgets/[id]/spendings` ↔ `/budgets/[id]/reserves` etc.)

### Spendings Grid (GRID)

- [ ] **GRID-01**: Spendings tab renders Excel-like grid with columns = categories, current month scope only
- [ ] **GRID-02**: Each column header has 5 stacked rows: name · planned-or-cushion · overspent (computed) · reserves-used (computed) · balance (computed)
- [ ] **GRID-03**: Column header shows category name with pen icon on hover; pen click opens side slider in edit mode
- [ ] **GRID-04**: Side slider edits both planned and cushion values; saves as SCD-2 versions in `category_limits`
- [ ] **GRID-05**: Bottom of each column has quick-entry input; numeric input + Enter creates txn with `(date=today, category=this column, amount=value, currency=budget.currency, note=null)`
- [ ] **GRID-06**: Below header, column lists current-month txns for that category, newest first
- [ ] **GRID-07**: Each txn row shows on hover: pen icon → opens side slider for full edit (date, category, amount, currency, note); slider includes delete
- [ ] **GRID-08**: Rightmost column is dashed `+` placeholder; click opens side slider in create mode (name, planned, cushion, optional icon/color)
- [ ] **GRID-09**: Column headers support drag-to-reorder; new order persists to `categories.sort_index` per-budget
- [ ] **GRID-10**: Arrow keys ←/→ navigate to prev/next month without leaving Spendings tab; month label visible
- [ ] **GRID-11**: Past months render same grid in read-only quick-entry mode (txn pen-edit still works)
- [ ] **GRID-12**: No search bar, no filter chips (removed)
- [ ] **GRID-13**: Mobile: same grid with horizontal scroll
- [ ] **GRID-14**: Recurring drafts render as highlighted rows in their target column (distinct background per DESIGN.md); click "Confirm" affordance promotes to real txn
- [ ] **GRID-15**: Computed overspent value = `max(0, spent − active_budget − reserve_used)` where active_budget = planned (or cushion if budget.cushion_mode_enabled)

### Reserves Tab (RSRV)

- [ ] **RSRV-01**: Reserves tab renders table: Category | Reserve balance | Reserve wallet share | Actions
- [ ] **RSRV-02**: Reserve balance auto-computed per category: cumulative `max(0, active_budget(m) − spent(m))` over past months, minus reserves already pulled to cover overspends in subsequent months
- [ ] **RSRV-03**: Active_budget value used at each historical month uses the cushion-mode state as of that month (history tracked)
- [ ] **RSRV-04**: Reserve consumed real-time when category overspends in current month; consumed amount visible in GRID-02 row 4
- [ ] **RSRV-05**: Per-category reserve isolation: reserve from one category cannot fund overspend in another
- [ ] **RSRV-06**: Reserve wallet share column = (this category's reserve / Σ all reserves) × Σ(reserve-type wallet amounts) — for visual reconciliation
- [ ] **RSRV-07**: New category with no history shows reserve = 0

### Wallets Tab (WALT)

- [ ] **WALT-01**: Wallets tab renders one row per wallet with always-inline editable cells: Name · Currency · Amount · Type
- [ ] **WALT-02**: Type cell is single-select: Spendings | Cushion | Reserve (radio or segmented control)
- [ ] **WALT-03**: Tab key moves focus between cells; auto-save on blur with toast confirmation
- [ ] **WALT-04**: `+ Add wallet` row at bottom; click spawns blank row with focus on Name
- [ ] **WALT-05**: Delete via trash icon on row hover; confirmation required
- [ ] **WALT-06**: Wallet types are display labels only; no income/transfer ledger; no behavioral differences except home/reserves sums
- [ ] **WALT-07**: Wallet balances are manual snapshots; no auto-update from transactions

### Settings Tab (SETT)

- [ ] **SETT-01**: Settings tab renders sections vertically: Budget identity · Cushion mode · Recurring rules · Members (if SHARED) · Danger zone
- [ ] **SETT-02**: Budget identity: name (editable), currency (editable until first txn; locked thereafter with tooltip)
- [ ] **SETT-03**: Cushion mode toggle persists `budgets.cushion_mode_enabled`; when on, grid headers and reserve calc use cushion values
- [ ] **SETT-04**: Recurring rules CRUD list: name, amount, currency, category, cadence (daily/weekly/monthly/yearly with day-of-\* selectors), start date, optional end date, active toggle
- [ ] **SETT-05**: Members section only renders for `budget.kind = SHARED`; lists members + roles
- [ ] **SETT-06**: Members section has "Generate share link" button → token-based invite (Better Auth orgs plugin); link copyable
- [ ] **SETT-07**: Members section supports revoke member, leave budget (with last-owner protection)
- [ ] **SETT-08**: Danger zone: Archive budget (soft-delete, hideable) and Delete budget (hard-delete with typed-name confirmation)
- [ ] **SETT-09**: Categories not directly managed in Settings; pen-icon on grid is the only category-edit affordance

### Transactions (TXN)

- [ ] **TXN-01**: Transaction schema: `id, tenant_id, budget_id, category_id, date, amount_original_cents, currency_original, amount_converted_cents, fx_rate, fx_as_of, note, recurring_rule_id, confirmed_at, created_at, updated_at, deleted_at`
- [ ] **TXN-02**: Transactions have no wallet field; purely categorical
- [ ] **TXN-03**: Quick-entry on grid creates txn with `currency = budget.currency`, `confirmed_at = now()`, no note
- [ ] **TXN-04**: Side slider exposes currency override dropdown; FX converted at txn date using `FxProvider` port (Frankfurter adapter)
- [ ] **TXN-05**: Storage retains both original amount/currency AND converted amount in budget currency; grid always displays converted
- [ ] **TXN-06**: Side slider displays both amounts: "5.00 USD · ~4.20 EUR @ 0.84 (2026-05-11)"
- [ ] **TXN-07**: No income tracking, no transfer ledger; only EXPENSE-equivalent txns
- [ ] **TXN-08**: Edit-history panel removed; audit remains in DB but not surfaced to user

### Recurring Drafts (RECR)

- [ ] **RECR-01**: Recurring rule schema retains existing structure but adds extended cadence support: daily/weekly/monthly/yearly with day-of-\* selectors
- [ ] **RECR-02**: pg-boss job materializes due rules into pending-draft transactions (`confirmed_at IS NULL`)
- [ ] **RECR-03**: Drafts surface as highlighted rows in their target category column on Spendings grid
- [ ] **RECR-04**: User confirms draft via inline action → sets `confirmed_at = now()`; row transitions to normal styling
- [ ] **RECR-05**: User can edit a draft before confirming via pen icon (same side slider)
- [ ] **RECR-06**: User can dismiss/delete a draft without confirming
- [ ] **RECR-07**: Standalone `pending-drafts-inbox` UI removed; grid is the only surface

### Tasks Queue (TASK)

- [ ] **TASK-01**: Tasks table: `id, tenant_id, budget_id, kind enum, payload_json, status enum (PENDING/RESOLVED), created_at, resolved_at`
- [ ] **TASK-02**: Task kind `RESERVE_TOPUP` fires when `Σ(category reserve balances) ≠ Σ(reserve-type wallet amounts)`; payload includes diff amount and direction
- [ ] **TASK-03**: Task kind `CONFIRM_DRAFT` fires when a recurring rule materializes a pending-draft
- [ ] **TASK-04**: Task kind `STALE_WALLET` fires when a wallet `updated_at` exceeds N days (default 30, configurable per budget)
- [ ] **TASK-05**: Task kind `MONTH_END_REVIEW` fires on month rollover; auto-resolves after N days if not dismissed
- [ ] **TASK-06**: Tasks auto-resolve when underlying state corrects (reserve sums match · draft confirmed/dismissed · wallet edited · month-end dismissed/aged-out)
- [ ] **TASK-07**: Task banner above BDP tabs shows count chip; click expands inline list with kind-specific primary action button
- [ ] **TASK-08**: Task list items show i18n title (e.g. `"Top up reserve by {amount}"` or `"Update wallet X balance"`)

### Reserves Auto-Compute (RSCM)

- [ ] **RSCM-01**: Reserve balance per category computed via SQL view or materialized view that re-evaluates on changes to `transactions` or `category_limits`
- [ ] **RSCM-02**: Cushion-mode history tracked so historical months evaluate against the mode active at that time
- [ ] **RSCM-03**: New txn that pushes spending over active_budget triggers real-time reserve deduction display in GRID row 4 (no manual user action)
- [ ] **RSCM-04**: Reserve overflow (overspend exceeds available reserve) shows remainder as overspent in GRID row 3

### Onboarding Wizard (ONBD)

- [ ] **ONBD-01**: After signup, redirect to `/budgets/new` wizard
- [ ] **ONBD-02**: Step 1: Budget name input
- [ ] **ONBD-03**: Step 2: Currency picker (default = browser locale guess)
- [ ] **ONBD-04**: Step 3: Budget type radio (Private | Shared, default Private)
- [ ] **ONBD-05**: Step 4: Starter category multi-select template (Housing · Groceries · Transport · Eating Out · Entertainment · Health · Subscriptions · Other); each pre-populates `planned = 0`, `cushion = 0`
- [ ] **ONBD-06**: Step 5: Optional Skip → empty budget
- [ ] **ONBD-07**: Wizard state persisted in `onboarding_progress(user_id, step, completed_at)`; resumable
- [ ] **ONBD-08**: On finish: redirect to `/budgets/[new_id]/spendings`
- [ ] **ONBD-09**: `+` button in switcher dropdown also opens this wizard (without auth gate)

### PWA / Offline / Push (PWAX)

- [ ] **PWAX-01**: Serwist install retained; manifest + service worker register on every page
- [ ] **PWAX-02**: Offline shell: last-synced budgets, wallets, categories, current-month transactions readable offline (IndexedDB cache)
- [ ] **PWAX-03**: Quick-entry on Spendings grid queues offline-created txns; sync on reconnect with `Idempotency-Key`
- [ ] **PWAX-04**: VAPID web-push registered per user; user can enable/disable per-budget
- [ ] **PWAX-05**: Push fires on task create (RESERVE_TOPUP · CONFIRM_DRAFT · STALE_WALLET · MONTH_END_REVIEW) respecting user prefs
- [ ] **PWAX-06**: Push payload deep-links to `/budgets/[id]/[tab]` with task expanded

### Internationalization (I18N)

- [ ] **I18N-01**: All v1.1 message keys delivered in EN, PL, UK simultaneously
- [ ] **I18N-02**: New IA replaces `workspaces.*` and `accounts.*` namespaces with `budgets.*` and `wallets.*`
- [ ] **I18N-03**: Number/currency formatting uses `Intl.NumberFormat` with budget currency
- [ ] **I18N-04**: Date formatting uses Temporal API + `Intl.DateTimeFormat` per user locale
- [ ] **I18N-05**: Locale persisted on `users.locale`; switchable from settings menu

### Sharing (SHRD)

- [ ] **SHRD-01**: SHARED budget invitation via token-based share link only (no email send required)
- [ ] **SHRD-02**: Share link uses Better Auth organizations plugin invite-token flow
- [ ] **SHRD-03**: Share link single-use or time-bound (TTL configurable, default 7 days)
- [ ] **SHRD-04**: Recipient with link → land on confirmation page → click "Join {budget name}" → membership created → redirect to `/budgets/[id]/spendings`
- [ ] **SHRD-05**: Owner can revoke share links

### E2E (E2EX)

- [ ] **E2EX-01**: Existing playwright-bdd `.feature` files migrated to new IA (budgets/wallets, spendings grid, reserves, settings)
- [ ] **E2EX-02**: Page Objects refactored for renamed entities
- [ ] **E2EX-03**: New scenarios for: quick-entry txn, recurring draft confirm, reserve auto-deduct, cushion mode toggle, share link join, onboarding wizard
- [ ] **E2EX-04**: Fresh-user-per-scenario fixture retained
- [ ] **E2EX-05**: E2E green against `PLAYWRIGHT_BASE_URL` from `.env.local`

### Engineering Discipline (ENGR)

- [ ] **ENGR-01**: 80% domain coverage threshold retained in `bunfig.toml`
- [ ] **ENGR-02**: dependency-cruiser rule: `packages/*/src/domain/` cannot import drizzle-orm, Hono, AI SDK, or `adapters/`
- [ ] **ENGR-03**: All new API routes get at least one integration test in `apps/api/test/routes/`
- [ ] **ENGR-04**: Tenant-leak CI gate adapted to renamed tables (6 security tests green)

---

## Future Requirements (deferred to v1.2+)

- Investments domain (positions, valuations, price feeds for stocks/crypto/gold)
- Insights dashboard (charts beyond home placeholder)
- Voice STT capture (Web Speech + Groq Whisper)
- LLM smart-category suggestions in onboarding
- Comparison context with k-anonymity + DPIA
- Email digest notifications
- Email-based invite (in addition to share link)
- CSV import / bank API integration

## Out of Scope (explicit, with reason)

- **Native mobile apps** — PWA covers v1.1; native deferred (no change from v1.0)
- **Receipt photo OCR** — same
- **Direct bank API integration (Plaid/Open Banking)** — same
- **Receipt import via email forwarding** — same
- **Tax filing / tax reports** — same
- **Crypto custody / trading** — same
- **Generic chat-with-your-data LLM** — same
- **Full event sourcing** — same
- **Income tracking as a transaction kind** — v1.1 explicitly drops; wallet balances manually updated by user
- **Transfer-between-wallets ledger** — v1.1 explicitly drops; wallets are manual snapshots
- **Wallet↔transaction linkage** — v1.1 explicitly drops; transactions are purely categorical

## v1.0 Validated (Carried Forward)

Phase 02 shipped these capabilities; they remain in production behavior after restructure though their UI surfaces are reshaped:

- Hexagonal layering with domain/application/adapters boundary
- `Money` value object at adapter boundary (Dinero v2)
- Drizzle + RLS with `withTenantTx` primitive
- Frankfurter FX adapter behind FxProvider port
- pg-boss job runner with worker role (no BYPASSRLS)
- Append-only ledger primitive + audit history infra
- Better Auth + organizations plugin
- next-intl with EN/PL/UK message catalogs

## Traceability

Each v1.1 REQ-ID is mapped to exactly one roadmap phase. 126/126 mapped.

| REQ-ID  | Phase   |
| ------- | ------- |
| MIG-01  | Phase 1 |
| MIG-02  | Phase 1 |
| MIG-03  | Phase 1 |
| MIG-04  | Phase 1 |
| MIG-05  | Phase 1 |
| MIG-06  | Phase 1 |
| MIG-07  | Phase 1 |
| MIG-08  | Phase 1 |
| MIG-09  | Phase 1 |
| MIG-10  | Phase 1 |
| MIG-11  | Phase 1 |
| MIG-12  | Phase 1 |
| MIG-13  | Phase 1 |
| TXN-01  | Phase 2 |
| TXN-02  | Phase 2 |
| TXN-03  | Phase 2 |
| TXN-04  | Phase 2 |
| TXN-05  | Phase 2 |
| TXN-06  | Phase 2 |
| TXN-07  | Phase 2 |
| TXN-08  | Phase 2 |
| RECR-01 | Phase 2 |
| RECR-02 | Phase 2 |
| RSCM-01 | Phase 2 |
| RSCM-02 | Phase 2 |
| SHRD-01 | Phase 2 |
| SHRD-02 | Phase 2 |
| SHRD-03 | Phase 2 |
| SHRD-05 | Phase 2 |
| ENGR-01 | Phase 2 |
| ENGR-02 | Phase 2 |
| ENGR-03 | Phase 2 |
| ENGR-04 | Phase 2 |
| NAV-01  | Phase 3 |
| NAV-02  | Phase 3 |
| NAV-03  | Phase 3 |
| NAV-04  | Phase 3 |
| NAV-05  | Phase 3 |
| HOME-01 | Phase 3 |
| HOME-02 | Phase 3 |
| HOME-03 | Phase 3 |
| HOME-04 | Phase 3 |
| BDP-01  | Phase 3 |
| BDP-02  | Phase 3 |
| BDP-03  | Phase 3 |
| BDP-04  | Phase 3 |
| BDP-05  | Phase 3 |
| GRID-01 | Phase 4 |
| GRID-02 | Phase 4 |
| GRID-03 | Phase 4 |
| GRID-04 | Phase 4 |
| GRID-05 | Phase 4 |
| GRID-06 | Phase 4 |
| GRID-07 | Phase 4 |
| GRID-08 | Phase 4 |
| GRID-09 | Phase 4 |
| GRID-10 | Phase 4 |
| GRID-11 | Phase 4 |
| GRID-12 | Phase 4 |
| GRID-13 | Phase 4 |
| GRID-14 | Phase 4 |
| GRID-15 | Phase 4 |
| RECR-03 | Phase 4 |
| RECR-04 | Phase 4 |
| RECR-05 | Phase 4 |
| RECR-06 | Phase 4 |
| RECR-07 | Phase 4 |
| RSCM-03 | Phase 4 |
| RSCM-04 | Phase 4 |
| RSRV-01 | Phase 5 |
| RSRV-02 | Phase 5 |
| RSRV-03 | Phase 5 |
| RSRV-04 | Phase 5 |
| RSRV-05 | Phase 5 |
| RSRV-06 | Phase 5 |
| RSRV-07 | Phase 5 |
| WALT-01 | Phase 5 |
| WALT-02 | Phase 5 |
| WALT-03 | Phase 5 |
| WALT-04 | Phase 5 |
| WALT-05 | Phase 5 |
| WALT-06 | Phase 5 |
| WALT-07 | Phase 5 |
| SETT-01 | Phase 6 |
| SETT-02 | Phase 6 |
| SETT-03 | Phase 6 |
| SETT-04 | Phase 6 |
| SETT-05 | Phase 6 |
| SETT-06 | Phase 6 |
| SETT-07 | Phase 6 |
| SETT-08 | Phase 6 |
| SETT-09 | Phase 6 |
| ONBD-01 | Phase 6 |
| ONBD-02 | Phase 6 |
| ONBD-03 | Phase 6 |
| ONBD-04 | Phase 6 |
| ONBD-05 | Phase 6 |
| ONBD-06 | Phase 6 |
| ONBD-07 | Phase 6 |
| ONBD-08 | Phase 6 |
| ONBD-09 | Phase 6 |
| SHRD-04 | Phase 6 |
| TASK-01 | Phase 7 |
| TASK-02 | Phase 7 |
| TASK-03 | Phase 7 |
| TASK-04 | Phase 7 |
| TASK-05 | Phase 7 |
| TASK-06 | Phase 7 |
| TASK-07 | Phase 7 |
| TASK-08 | Phase 7 |
| PWAX-01 | Phase 8 |
| PWAX-02 | Phase 8 |
| PWAX-03 | Phase 8 |
| PWAX-04 | Phase 8 |
| PWAX-05 | Phase 8 |
| PWAX-06 | Phase 8 |
| I18N-01 | Phase 8 |
| I18N-02 | Phase 8 |
| I18N-03 | Phase 8 |
| I18N-04 | Phase 8 |
| I18N-05 | Phase 8 |
| E2EX-01 | Phase 8 |
| E2EX-02 | Phase 8 |
| E2EX-03 | Phase 8 |
| E2EX-04 | Phase 8 |
| E2EX-05 | Phase 8 |

**Coverage:** 126/126 v1.1 REQ-IDs mapped to exactly one phase. No orphans. No duplicates.

---

_Last updated: 2026-05-11 — Traceability filled by `/gsd-new-milestone` roadmapper_

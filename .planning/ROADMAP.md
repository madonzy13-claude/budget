# Roadmap: Budget v1.1 — Budget Restructure

## Overview

Eight phases take the v1.0 codebase (multi-page workspace UI, account-anchored transactions, planned reserve/cushion/investments contexts) to the v1.1 product: a single Excel-like Budget Detail Page, renamed domain (workspace→budget, account→wallet), categorical-only transactions, auto-computed reserves, cushion as a budget-wide toggle, and a Tasks-queue-driven UX delivered as an installable PWA.

The roadmap is dependency-driven, not category-driven. **Phase 1 lands the schema rename + new tables in a single migration** (workspaces→budgets, accounts→wallets, drop kind/account_id/scope, add wallet_type/cushion_mode/sort_index/tasks/SCD-2 cushion column) — every other phase blocks on it. **Phase 2 restructures the domain layer + API surface + recurring-engine + share-link backend** behind the renamed schema while the UI is still v1.0; this unblocks frontend work without forcing each UI phase to also touch the backend. **Phase 3 ships the new top-nav budget switcher, home page cards, and the BDP tab frame with a working task-banner shell** — the UI scaffold every subsequent tab plugs into. **Phase 4 is the core product surface: the Spendings grid** (column-per-category, quick-entry, pen-icon sliders, drag-reorder, arrow-key month nav, recurring drafts inline) and the real-time reserve-deduction wiring that drives row 4 of every column header. **Phase 5 ships the Reserves and Wallets tabs together** — they share a layout primitive (inline-editable table rows) and the same reserves-auto-compute view powers both. **Phase 6 ships Settings tab + Onboarding wizard + Share-link join UI** together — all three are settings-shaped form flows that depend on the BDP frame and the backend share-link routes from Phase 2. **Phase 7 surfaces the Tasks queue** (three deterministic generators — RESERVE_TOPUP, CONFIRM_DRAFT, CUSHION_BELOW_TARGET; banner expanded with kind-specific actions; push deep-link URL contract spec). **Phase 8 is cross-cutting hardening for launch:** PWA offline shell over the new IA, web-push wired to tasks, i18n EN/PL/UK rewrite for renamed namespaces, full E2E Gherkin rewrite, CI gates green.

The work is dependency-shaped: schema rename precedes domain rename precedes API rename precedes frontend rename precedes UX flows. Parallelism is limited (each phase mostly unblocks the next) but Phase 5's two tabs and Phase 8's cross-cutting concerns can fan out at the plan level.

## Phases

**Phase Numbering:**

- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (1.1, 2.1): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Schema Migration & Rename Foundation** — Single Drizzle migration: rename workspaces→budgets and accounts→wallets, drop dropped columns, add wallet_type / cushion / sort_index / tasks; nuke dev DB; tenant-leak CI green on new schema [Plan 01-01 ✓ | 01-02..04 pending]
- [ ] **Phase 2: Domain & API Restructure** — Rename domain entities, strip Transaction, update recurring-engine for extended cadence, wire reserves auto-compute SQL view, ship share-link backend routes; all `/budgets/*` and `/wallets/*` HTTP routes live
- [x] **Phase 3: Navigation, Home & BDP Frame** — Top-nav budget switcher dropdown, combined home page with per-budget cards + placeholder chart, BDP tab shell with sticky pills + task banner skeleton
- [x] **Phase 4: Spendings Grid** — The Excel-like core: column-per-category grid, quick-entry, pen-icon side sliders, drag-reorder, arrow-key month navigation, recurring drafts as highlighted rows, real-time reserve-deduction display _(UAT closed: 16/17 pass, 1 skipped — Test 4 retry blocked by shared-stack; security audited 35/35 closed — see 04-SECURITY.md)_
- [x] **Phase 5: Reserves & Wallets Tabs** — Reserves table with per-category isolated balances + wallet-share column, Wallets tab with always-inline editable rows (name/currency/amount/type) and add/delete (completed 2026-05-17)
- [x] **Phase 6: Settings, Onboarding & Share UI** — Settings tab (identity / cushion toggle / recurring CRUD / members / danger zone), onboarding wizard, share-link recipient join flow (completed 2026-05-22)
- [ ] **Phase 7: Tasks Queue** — Banner-with-expand UI, three deterministic generators (RESERVE_TOPUP, CONFIRM_DRAFT, CUSHION_BELOW_TARGET), kind-specific resolution actions, auto-resolve on state change. CUSHION_BELOW_TARGET surfaces actual cushion-vs-target shortfall (the two legacy 4-kind generators have been dropped from v1.1 scope and deferred to v1.2 Insights).
- [ ] **Phase 8: PWA, Offline, Push, i18n & E2E Hardening** — Serwist offline shell over new IA, IndexedDB cache + offline quick-entry replay, VAPID web-push wired to tasks, full EN/PL/UK rewrite, playwright-bdd Gherkin features rewritten, tenant-leak + domain-coverage CI gates green

## Phase Details

### Phase 1: Schema Migration & Rename Foundation

**Goal**: Land the entire v1.1 schema in one Drizzle migration — every renamed table, every dropped column, every new table — and prove the tenant-leak CI gate stays green on the new shape. Nothing else in v1.1 ships until this is in.
**Depends on**: Nothing (first phase of v1.1; v1.0 schema is the starting point)
**Requirements**: MIG-01, MIG-02, MIG-03, MIG-04, MIG-05, MIG-06, MIG-07, MIG-08, MIG-09, MIG-10, MIG-11, MIG-12, MIG-13
**Success Criteria** (what must be TRUE):

1. After running migrations from a fresh dev DB, `\dt` shows `budgets`, `wallets`, `tasks`, and `category_limits.cushion_amount_cents` exists alongside `planned_amount_cents`; tables `workspaces` and `accounts` no longer exist; columns `transactions.kind`, `transactions.account_id`, `transactions.to_account_id`, `transactions.direction` no longer exist
2. `budgets.cushion_mode_enabled boolean default false`, `wallets.wallet_type` enum (SPENDINGS, CUSHION, RESERVE), and `categories.sort_index INTEGER` are queryable on the renamed schema
3. `make ci-gate` passes 6/6 tenant-leak security tests targeting the renamed `budgets` and `wallets` tables — no test still references `workspaces` or `accounts`
4. All EN/PL/UK i18n message keys under `workspaces.*` and `accounts.*` have been renamed to `budgets.*` and `wallets.*` (no message lookups fail at app boot); domain entity classes `Workspace` and `Account` are renamed to `Budget` and `Wallet` in `packages/budgeting` and `packages/tenancy` with zero remaining references to the old names in `src/`
5. All HTTP route mounts under `/workspaces/*` and `/accounts/*` are removed and replaced with `/budgets/*` and `/wallets/*`; old paths return 404 (no aliases); a smoke request to `/budgets/health` returns 200

**Plans** (4 — sequential, dependency-strict):

- `01-01-PLAN.md` — Schema migration (`drizzle/0012_phase01_v11_rename.sql` hand-authored), `post-migration.sql` lockstep rename (23+ sites), `tasks` table CREATE, `wallet_type` enum, dev DB nuke, tenant-leak fixture retarget — owns MIG-01..09, MIG-13 (5 backend)
- `01-02-PLAN.md` — Domain entity rename `Workspace`→`Budget`, `Account`→`Wallet` across `packages/{budgeting,tenancy}` + Better Auth `organizationId` carve-out + `categories.scope` drop cascade through 8 application sites + worker handler — owns MIG-12; depends on 01-01
- `01-03-PLAN.md` — Hono route `git mv` (`workspaces.ts`→`budgets.ts`, `accounts.ts`→`wallets.ts`) + `app.ts` mount flip (no aliases per D-09) + `tenant-guard.ts` header `X-Workspace-ID`→`X-Budget-ID` (D-10) + `/budgets/health` smoke + minimum compile-fix on route bodies — owns MIG-11; depends on 01-02
- `01-04-PLAN.md` — i18n EN/PL/UK jq codemod + `api-client.ts`/`workspace-fetch.ts` header & path rewrite + scope filter chip drop + E2E Gherkin sweep + final `make ci-gate` Playwright green — owns MIG-10, MIG-13 (Playwright); depends on 01-03

### Phase 2: Domain & API Restructure

**Goal**: With the schema renamed (Phase 1), restructure the backend so the new IA's data flows work end-to-end at the API surface — even though the v1.0 UI still wraps it. Transaction domain stripped to categorical-only, recurring-engine extended for daily/weekly/yearly cadence, reserves-auto-compute SQL view shipped, share-link backend routes live behind Better Auth orgs plugin. By the end of this phase, every v1.1 API endpoint the frontend will eventually call exists and is integration-tested.
**Depends on**: Phase 1
**Requirements**: TXN-01, TXN-02, TXN-03, TXN-04, TXN-05, TXN-06, TXN-07, TXN-08, RECR-01, RECR-02, RSCM-01, RSCM-02, SHRD-01, SHRD-02, SHRD-03, SHRD-05, ENGR-01, ENGR-02, ENGR-03, ENGR-04
**Success Criteria** (what must be TRUE):

1. Posting to `/budgets/[id]/transactions` with `{date, category_id, amount_original_cents, currency_original, note?}` creates a row with both original and converted amounts (FX-converted at txn date via Frankfurter adapter) and `confirmed_at = now()` for quick-entry; `kind` / `account_id` / `to_account_id` / `direction` are gone from the request/response schema and storage
2. PATCH to a transaction allows currency-override; the response payload includes original-amount + converted-amount + fx_rate + fx_as_of so the side slider can display "5.00 USD · ~4.20 EUR @ 0.84 (2026-05-11)"; income/transfer endpoints removed; pending-drafts-inbox route removed
3. Recurring rules accept daily / weekly / monthly / yearly cadence with day-of-week and day-of-month selectors; pg-boss materializes due rules into transactions with `confirmed_at IS NULL`; an integration test confirms a weekly rule due today produces exactly one pending-draft per run
4. Per-category reserve balance is queryable via a SQL view that re-evaluates as transactions and category_limits change; cushion-mode history is tracked so each historical month evaluates against the mode active at that time; the view returns 0 for a new category with no history
5. Calling the share-link create endpoint on a SHARED budget returns a token-bound invite URL (Better Auth orgs plugin) with configurable TTL (default 7d); owner can revoke any active link; tenant-leak CI gate remains green; dependency-cruiser blocks domain imports of drizzle-orm / Hono / AI SDK / `adapters/`; every new route has at least one integration test in `apps/api/test/routes/`; domain coverage threshold (80%) in `bunfig.toml` is preserved

**Plans** (5):

- 02-01: Transaction Domain & Routes (TXN-01..08)
- 02-02: Recurring Engine Extension (RECR-01, RECR-02)
- 02-03: Reserves SQL View & Cushion History (RSCM-01, RSCM-02)
- 02-04: Share-Link Backend (SHRD-01, SHRD-02, SHRD-03, SHRD-05)
- 02-05: Engineering Gates (ENGR-01..ENGR-04)

### Phase 3: Navigation, Home & BDP Frame

**Goal**: Replace the v1.0 sidebar+pages chrome with the v1.1 top-nav budget switcher + combined home page + Budget Detail Page tab shell. This phase ships the structural UI scaffold — the routes, the dropdown, the cards, the sticky-pill tabs, the task-banner shell — that every subsequent tab phase plugs into.
**Depends on**: Phase 2
**Requirements**: NAV-01, NAV-02, NAV-03, NAV-04, NAV-05, HOME-01, HOME-02, HOME-03, HOME-04, BDP-01, BDP-02, BDP-03, BDP-04, BDP-05
**Success Criteria** (what must be TRUE):

1. Top nav shows the current budget name + private/shared icon + chevron; clicking opens a dropdown grouped Personal / Shared listing all budgets the user has access to, with an aside `+` button (not a list item) that navigates to `/budgets/new`; the standalone `/workspaces` list page no longer exists in the routing tree
2. `/` renders one card per budget the user can access; each card shows budget name, type badge, current-month total spent, total wallet value (converted to `display_currency`), and the top 1–2 overspent categories; clicking a card navigates to `/budgets/[id]/spendings`; a placeholder chart component renders below the cards
3. `/budgets/[id]` renders sticky pill-style horizontal tabs in order Spendings · Reserves · Wallets · Settings; default tab is Spendings; the active pill is highlighted with the yellow accent per DESIGN.md; clicking each tab navigates to the matching sub-route and browser back/forward respects those routes
4. When the tasks API returns ≥1 pending task for the current budget, a task banner renders above the tabs with a count chip; clicking the banner expands an inline list (kind-specific action wiring is filled in Phase 7; this phase ships the shell)
5. All four tab routes (`/budgets/[id]/spendings`, `/reserves`, `/wallets`, `/settings`) are reachable and render placeholder content where the real content will land in Phases 4–6

**Plans**: 7 plans

- [x] 03-01-PLAN.md — Wave 0 prep: React Query + playwright-bdd install, delete v1.0 /workspaces tree (NAV-05)
- [x] 03-02-PLAN.md — Backend: GET /budgets/:id/home-summary + FxProvider conversion (HOME-01, HOME-02)
- [x] 03-03-PLAN.md — Backend: GET /budgets/:id/tasks?status=pending read endpoint (BDP-03 shell)
- [x] 03-04-PLAN.md — BudgetSwitcher Popover + NewBudgetButton + TopNav + rewrite (app)/layout.tsx (NAV-01..04)
- [x] 03-05-PLAN.md — Home / route: BudgetCard async RSC + Suspense grid + placeholder chart + empty hero (HOME-01..04)
- [x] 03-06-PLAN.md — BDP frame: pill tabs + sticky shell + task banner + 4 placeholder tab pages + /budgets/new (BDP-01..05)
- [x] 03-07-PLAN.md — PL/UK i18n + playwright-bdd Gherkin features + Makefile test-e2e target (14 reqs)
      **UI hint**: yes

### Phase 4: Spendings Grid

**Goal**: Ship the core product surface — the Excel-like Spendings tab. Column-per-category grid with the 5-row header (name / planned-or-cushion / overspent / reserves-used / balance), bottom quick-entry input on every column, pen-icon side slider for category and transaction edit, drag-to-reorder column headers, dashed `+` column for new categories, arrow-key month navigation, and recurring drafts surfaced as highlighted rows in their target column with an inline Confirm action. Real-time reserve-deduction display from RSCM is wired so row 4 of every header updates when a new transaction pushes the category over its active budget.
**Depends on**: Phase 3
**Requirements**: GRID-01, GRID-02, GRID-03, GRID-04, GRID-05, GRID-06, GRID-07, GRID-08, GRID-09, GRID-10, GRID-11, GRID-12, GRID-13, GRID-14, GRID-15, RECR-03, RECR-04, RECR-05, RECR-06, RECR-07, RSCM-03, RSCM-04
**Success Criteria** (what must be TRUE):

1. User types `5.96` + Enter in any column's bottom quick-entry input and within ~200ms a new transaction appears in that column's list (newest first), the input clears, and the column header's overspent / reserves-used / balance rows update; hovering a transaction row reveals a pen icon that opens a side slider with date / category / amount / currency / note fields plus delete
2. Clicking the pen icon on a column header opens a side slider that edits both planned and cushion values (saved as SCD-2 versions of `category_limits`); the dashed `+` column at the right edge opens the same slider in create mode and a new category appears as a new column on save
3. Column headers can be drag-reordered; the new order persists to `categories.sort_index` per-budget; row 4 ("Reserves used") and row 3 ("Overspent") of the header recompute correctly using `max(0, spent − active_budget − reserve_used)` where `active_budget = cushion` when `budget.cushion_mode_enabled` else `planned`; the search bar and filter chips from v1.0 are gone
4. Arrow keys ←/→ shift the month without leaving the Spendings tab and the current month label updates; past months render the same grid in read-only quick-entry mode (transaction pen-edit still works); on mobile the grid horizontal-scrolls cleanly
5. When pg-boss materializes a recurring rule, the resulting pending-draft renders as a highlighted row (distinct background per DESIGN.md) in its target category column; user clicks "Confirm" → row transitions to normal styling and `confirmed_at = now()`; user can edit a draft before confirming via pen icon; user can dismiss a draft without confirming; the standalone pending-drafts-inbox page is gone

**Plans** (5):

- [x] 04-01-PLAN.md — Wave 0 prep: dnd-kit + temporal-polyfill install, schema spike, extracted Phase 2 field primitives, i18n grid.\* stubs, e2e scaffolding, tenant-leak ci-gate 6->9, v1.0 surface deletes (GRID-12, RECR-07)
- [x] 04-02-PLAN.md — Backend: PUT /categories/sort-order + GET /spendings-summary + POST /recurring-rules/drafts/:id/dismiss + SCD-2 race lock + 4 integration tests + [BLOCKING] schema push (GRID-04, GRID-09, GRID-15, RECR-04, RECR-06, RSCM-03, RSCM-04)
- [x] 04-03-PLAN.md — Client primitives: useRevealActions + MonthNavigator + QuickEntryInput + TransactionRow + DraftRow + ColumnHeader + AddCategoryColumn + 7 hooks + 2 lib utils + 9 Vitest tests (GRID-01..03, 05, 06, 08, 10, 11, 13, 14, RECR-03..06)
- [x] 04-04-PLAN.md — Grid composition: TransactionSlider + CategorySlider + CategoryColumn + SpendingsGridClient (dnd-kit) + RSC page shell + delete v1.0 forms (GRID-01, 02, 04, 07, 08, 09, 13, RECR-05, RSCM-03)
- [x] 04-05-PLAN.md — E2E: 15 playwright-bdd .feature files (incl. 2 regression-guards no-hover-reveal + category-cell-no-inline-edit) + impeccable sweep + make ci-gate + make test-e2e + user UAT (all GRID/RECR/RSCM)

**UI hint**: yes

### Phase 5: Reserves & Wallets Tabs

**Goal**: Ship the two tabs that share a layout primitive (data table with computed and inline-editable rows). Reserves tab surfaces the auto-computed per-category balances and reserve-wallet-share column for visual reconciliation; Wallets tab is the always-inline editable list (name / currency / amount / type) with `+ Add` and delete affordances.
**Depends on**: Phase 4
**Requirements**: RSRV-01, RSRV-02, RSRV-03, RSRV-04, RSRV-05, RSRV-06, RSRV-07, WALT-01, WALT-02, WALT-03, WALT-04, WALT-05, WALT-06, WALT-07
**Success Criteria** (what must be TRUE):

1. Reserves tab renders a table with columns Category / Reserve balance / Reserve wallet share / Actions; the per-category balance equals the cumulative `max(0, active_budget(m) − spent(m))` over past months minus reserves already pulled to cover subsequent-month overspends, with cushion-mode-as-of-month respected; a new category with zero history shows balance 0
2. When the current month's spending pushes a category over its active budget, the relevant category's reserve balance drops in real-time (visible both on this tab and on Spendings grid row 4); per-category isolation holds — Housing reserve cannot fund Groceries overspend; the wallet-share column equals `(this category's reserve / Σ all reserves) × Σ(reserve-type wallet amounts)`
3. Wallets tab renders one row per wallet with always-inline editable cells: Name (text), Currency (select), Amount (numeric), Type (single-select Spendings / Cushion / Reserve as radio or segmented control); Tab key moves focus between cells; on blur each cell auto-saves with a toast confirmation
4. Clicking `+ Add wallet` at the bottom spawns a blank row with focus on Name; hovering a row reveals a trash icon that triggers a confirmation, then deletes; wallet balances do not auto-update from transactions (manual snapshots only); the type label is display-only — no income or transfer ledger affects it
5. Reserves tab Actions column wires to the Phase 7 task model surface (top-up / withdraw) but stays inert in this phase; both tabs render correctly on mobile and respect the per-budget tenant context

**Plans** (8 — schema → backend → atoms+routes → tabs+cascade → e2e):

- [x] 05-01-PLAN.md — Wave 1: Migration 0020 (category_reserve_adjustments + RLS + indexes; categories.reserve_excluded; budgets.reserves_enabled; VIEW DROP+CREATE) + Drizzle TS mirror + tenant-leak fixture (+1 covered table) + [BLOCKING] `make migrate` (RSRV-01..03, 05..07)
- [x] 05-02-PLAN.md — Wave 2: Wallet domain mutators (rename/changeType/changeCurrency/setAmount) + WalletRepo.update + new CategoryReserveAdjustments + ReservesSummary + Categories.setReserveExcluded repos + Zod schemas (WALT-01..03, 06, 07; RSRV-01, 02, 06)
- [x] 05-03-PLAN.md — Wave 3: Application use cases (updateWallet w/ reserve-currency invariant, adjustCategoryReserve, toggleCategoryReserveExcluded, getReservesSummary) + 4 HTTP routes (PATCH /wallets/:id, POST /reserves/:catId/adjust, PATCH /categories/:id/reserve-excluded, REWRITE GET /reserves) + integration tests (all WALT-_ + all RSRV-_)
- [x] 05-04-PLAN.md — Wave 3 (parallel): Shared FE atoms `<InlineEditCell>` + `<DashedAddButton>` + `<RowDragHandle>` lift + `<MismatchChip>` + Phase 4 callsite refactor + EN i18n keys for both tabs (WALT-03, 04; RSRV-01, 06, 07)
- [x] 05-05-PLAN.md — Wave 4: Wallets tab end-to-end (RSC page + `<WalletsSectionedList>` + 3 sections + per-section drop zones + inline-edit + soft-archive + cross-tab invalidation hook) + delete v1.0 accounts-_ legacy (all WALT-_)
- [x] 05-06-PLAN.md — Wave 4 (parallel): Reserves tab end-to-end (RSC page + `<ReservesTableClient>` + Active/Excluded sections + inline-edit reserve balance via computed delta + sticky totals footer + `<MismatchChip>` variants) (all RSRV-\*)
- [x] 05-07-PLAN.md — Wave 4 (parallel): `reserves_enabled` cascading hide — BdpTabs filters Reserves pill + spendings grid row 4 conditional + `GET /budgets/:id` DTO carries the flag (RSRV-04, 06)
- [x] 05-08-PLAN.md — Wave 5 (final, autonomous=false): 6 playwright-bdd `@phase5` features + new ReservesPage + rewritten WalletsPage Page Objects + step bindings + full `make test && bun run test && make ci-gate && make test-e2e` green + impeccable DESIGN.md sweep (all WALT-_ + all RSRV-_)
      **UI hint**: yes

### Phase 6: Settings, Onboarding & Share UI

**Goal**: Ship the three settings-shaped form flows together: the Budget Settings tab (identity / cushion toggle / recurring CRUD / members for SHARED / danger zone), the post-signup Onboarding wizard, and the share-link recipient join flow. All three share form primitives, locale rendering, and the Better-Auth-orgs share-link backend from Phase 2.
**Depends on**: Phase 5
**Requirements**: SETT-01, SETT-02, SETT-03, SETT-04, SETT-05, SETT-06, SETT-07, SETT-08, SETT-09, ONBD-01, ONBD-02, ONBD-03, ONBD-04, ONBD-05, ONBD-06, ONBD-07, ONBD-08, ONBD-09, SHRD-04
**Success Criteria** (what must be TRUE):

1. Settings tab renders vertically-stacked sections Budget identity (name editable; currency editable until first transaction then locked with tooltip) · Cushion mode (toggle that persists `budgets.cushion_mode_enabled` and visibly switches grid headers and reserve calc to cushion values) · Recurring rules (CRUD list with name / amount / currency / category / cadence with day-of-\* selectors / start / optional end / active toggle) · Members (only for SHARED budgets) · Danger zone
2. SHARED budget Members section lists current members with roles, exposes a "Generate share link" button that copies the token URL to clipboard, supports revoke per member, and supports "Leave budget" with last-owner protection; Danger zone offers Archive (soft-delete) and Delete (typed-name confirmation hard-delete); categories are NOT directly managed in Settings (Phase 4's pen-icon is the only category-edit surface)
3. After a fresh signup, the user is redirected to `/budgets/new` and walks through Step 1 budget name → Step 2 currency picker (default = browser locale guess) → Step 3 budget type radio (Private / Shared, default Private) → Step 4 starter category multi-select (Housing, Groceries, Transport, Eating Out, Entertainment, Health, Subscriptions, Other; each pre-populates planned=0, cushion=0) → Step 5 optional skip → empty budget; the same wizard opens when the user clicks `+` in the top-nav switcher dropdown
4. Wizard state persists in `onboarding_progress(user_id, step, completed_at)` so the wizard is resumable after a refresh / sign-out / sign-in; on finish the user is redirected to `/budgets/[new_id]/spendings`
5. Recipient who clicks a valid share link lands on a confirmation page showing "Join {budget name}", clicking the action creates membership via Better Auth orgs plugin and redirects to `/budgets/[id]/spendings`; revoked or expired links show an error state

**Plans** (8 — schema/migration -> backend -> UI -> e2e):

- [x] 06-01-PLAN.md — Wave 1: onboarding_progress schema + budgets.archived_at + [BLOCKING] migration + ci-gate allowlist + shadcn accordion/switch + 4 Wave 0 test scaffolds (SETT-08, ONBD-07)
- [x] 06-02-PLAN.md — Wave 2: PATCH /budgets/:id (identity + unified cushion-flag write path) + hasTransactions on GET /:id (SETT-02, SETT-03)
- [x] 06-03-PLAN.md — Wave 2: GET members + owner-only revoke-member + share/leave regression tests (SETT-05, SETT-06, SETT-07)
- [x] 06-04-PLAN.md — Wave 2: POST /:id/archive + POST /:id/delete (typed-name) + onboarding_progress GET/PUT route (SETT-08, ONBD-07)
- [x] 06-05-PLAN.md — Wave 3: Settings tab 5-section accordion (identity/cushion/recurring/members/danger) + retire /recurring (SETT-01..09)
- [x] 06-06-PLAN.md — Wave 3: 5-step onboarding wizard at /budgets/new + force-redirect guard + retire /onboarding (ONBD-01..06, 08, 09)
- [x] 06-07-PLAN.md — Wave 3: public /budgets/join/[token] page + 6 states + middleware allowlist (SHRD-04)
- [x] 06-08-PLAN.md — Wave 4 (autonomous=false): PL/UK i18n + 3 @phase6 playwright-bdd features + full gate + DESIGN.md sweep + human UAT (all SETT/ONBD/SHRD)

**UI hint**: yes

### Phase 7: Tasks Queue

**Goal**: Surface the Tasks queue end-to-end. The `tasks` table from Phase 1 plus **three deterministic generators** — `RESERVE_TOPUP`, `CONFIRM_DRAFT`, `CUSHION_BELOW_TARGET` — plus the BDP task banner expansion plus the kind-specific resolution actions. Auto-resolve on underlying state change so the queue never grows stale. Push deep-link URL contract spec laid down for Phase 8 to wire.
**Depends on**: Phase 6
**Requirements**: TASK-01, TASK-02, TASK-03, TASK-04 (rescoped to CUSHION_BELOW_TARGET per CONTEXT.md), TASK-06, TASK-07, TASK-08 (TASK-05 dropped from v1.1 scope)
**Success Criteria** (what must be TRUE):

1. When `Σ(category reserve balances) ≠ Σ(reserve-type wallet amounts)`, a `RESERVE_TOPUP` task appears in the BDP banner with title (i18n) `"Top up reserve by {amount}"` and payload including diff and direction (TOPUP/WITHDRAW); when the user manually adjusts a reserve-wallet balance so sums match, the task auto-resolves and disappears from the banner
2. When pg-boss materializes a recurring rule into a pending-draft (Phase 2), a `CONFIRM_DRAFT` task appears; when the user confirms, dismisses, or skips the draft (Phase 4 inline action), the task auto-resolves; user can also resolve it from the banner via a primary "Confirm" action
3. When `cushion_enabled = true` and `Σ(category cushion × cushion_target_months) > Σ(cushion-type wallet amounts FX→budget currency)`, a `CUSHION_BELOW_TARGET` task appears with payload `{shortfall_cents, required_cents, actual_cents, currency, target_months}`; when the user adds/edits a cushion wallet so shortfall ≤ 0 (or toggles `cushion_enabled` off), the task auto-resolves
4. The BDP task banner shows a count chip (`N tasks pending`) and expands inline on click to a list of tasks with kind-specific primary action buttons; titles render correctly in EN / PL / UK; tasks list endpoint is RLS-scoped to the current budget; backend writes pass through the tenant guard

**Plans** (10 — schema → ports/services → generators+sweep → routes → frontend → E2E):

- [x] 07-01-PLAN.md — Wave 0: Migration 0026 (tasks_kind_chk 3-kind + cushion_target_months + 3 partial unique dedup indexes) + REQUIREMENTS/ROADMAP/v1.1-SPEC reconciliation + 5 test scaffolds + [BLOCKING] make migrate (TASK-01)
- [x] 07-02-PLAN.md — Wave 1: tasks-schema TS mirror + TaskRepo port write methods (resolve, 3 emit, 2 resolveByX) + TaskRepo adapter (ON CONFLICT + idempotent UPDATE) + resolve-task application service + resolve-idempotency.test.ts real assertions (TASK-01, TASK-06)
- [x] 07-03-PLAN.md — Wave 1: get-cushion-summary.ts + recompute-cushion-task.ts shared helpers (single source of cushion math; bigint cents; FX as-of TODAY) + cushion-math.test.ts 9-case Nyquist (TASK-04)
- [x] 07-04-PLAN.md — Wave 2: CONFIRM_DRAFT — recurring-engine.ts inline emit (gated by insertResult.rows.length > 0) + auto-resolve in confirm/dismiss/skip use cases + confirm-draft.test.ts 6-case Nyquist (TASK-03, TASK-06, TASK-08)
- [x] 07-05-PLAN.md — Wave 2: RESERVE_TOPUP — recompute-reserve-topup-task.ts helper (reuses reserves-summary-builder.ts mismatchCents) + inline hooks in set-wallet-balance/update-wallet/adjust-category-reserve + reserve-topup.test.ts 5/6 cases (sweep deferred to 07-06) (TASK-02, TASK-06, TASK-08)
- [x] 07-06-PLAN.md — Wave 2: CUSHION_BELOW_TARGET inline hooks in 5 mutation sites (set/update/create/archive-wallet + set-category-limit) + budgeting-reconciliation.ts hourly sweep extension for BOTH RESERVE_TOPUP and CUSHION (defensive — catches FX drift) + reserve-topup.test.ts complete + cushion-math integration tests (TASK-02, TASK-04, TASK-06, TASK-08)
- [x] 07-07-PLAN.md — Wave 3: API routes — POST /budgets/:id/tasks/:taskId/resolve + GET /budgets/:id/cushion-summary + PATCH /budgets/:id extended with cushion_target_months Zod 1..60 + recompute trigger + tenant-leak gate extension (8 files total) (TASK-06, TASK-07)
- [x] 07-08-PLAN.md — Wave 3: Frontend — TaskBannerRow enable action buttons per kind (router.push + clientApiFetch) + ReservesTableRow pending-task indicator (PencilLine icon) + EN/PL/UK i18n keys per UI-SPEC § Copywriting Contract + Vitest tests (TASK-07, TASK-08)
- [x] 07-09-PLAN.md — Wave 3: Frontend — Settings cushion-section months input + live preview line (cushion-summary fetch) + Onboarding wizard cushion step months input + CategorySlider silent cushion-mirror via linked useState + Vitest tests (TASK-04)
- [ ] 07-10-PLAN.md — Wave 4 (autonomous=false): E2E task-banner.feature rewrite for 3 kinds (@phase7) + Page Object extensions (BdpPage/ReservesPage/WalletsPage/SettingsPage) + final gate sweep (make test + ci-gate + Vitest + test-e2e) + human UAT (all TASK)

**UI hint**: yes

### Phase 8: PWA, Offline, Push, i18n & E2E Hardening

**Goal**: Take v1.1 from feature-complete to launch-ready. Serwist offline shell over the new IA; IndexedDB cache of last-synced budgets / wallets / categories / current-month transactions; offline quick-entry with sync-on-reconnect using Idempotency-Key; VAPID web-push wired to task creation respecting per-user/per-budget preferences with deep-links to `/budgets/[id]/[tab]` with the task expanded; full EN/PL/UK i18n rewrite for the new IA (numbers via Intl.NumberFormat, dates via Temporal + Intl.DateTimeFormat); playwright-bdd Gherkin features and Page Objects rewritten end-to-end against the new flows; tenant-leak + domain-coverage CI gates green.
**Depends on**: Phase 7
**Requirements**: PWAX-01, PWAX-02, PWAX-03, PWAX-04, PWAX-05, PWAX-06, I18N-01, I18N-02, I18N-03, I18N-04, I18N-05, E2EX-01, E2EX-02, E2EX-03, E2EX-04, E2EX-05
**Success Criteria** (what must be TRUE):

1. PWA is installable from a supported browser (manifest + service worker registered on every page); when the user goes offline they can still read their last-synced budgets, wallets, categories, and current-month transactions; airplane-mode quick-entry on the Spendings grid queues a transaction locally and syncs successfully on reconnect with no duplicates (Idempotency-Key respected)
2. User can enable web-push notifications per-budget; VAPID web-push fires on creation of `RESERVE_TOPUP` / `CONFIRM_DRAFT` / `CUSHION_BELOW_TARGET` tasks respecting per-user/per-budget preferences; clicking a push notification deep-links to `/budgets/[id]/[tab]` with the relevant task pre-expanded (uses Phase 7 D-PH7-30 URL contract)
3. Every v1.1 message key is delivered in EN, PL, and UK; the `workspaces.*` and `accounts.*` namespaces no longer exist in the message catalogs (replaced by `budgets.*` and `wallets.*`); monetary amounts display via `Intl.NumberFormat` with the budget's currency; dates display via Temporal + `Intl.DateTimeFormat` per user locale; locale is persisted on `users.locale` and switchable from the user menu
4. playwright-bdd `.feature` files cover quick-entry transaction, recurring draft confirm, real-time reserve auto-deduct, cushion-mode toggle, share-link recipient join, and the onboarding wizard end-to-end; Page Objects target renamed entities; fresh-user-per-scenario fixture is retained; E2E is green when run against `PLAYWRIGHT_BASE_URL` from `.env.local`
5. CI gates green: `make ci-gate` 8/8 on renamed tables (Phase 7 added cushion-summary tenant-leak file); `make test` passes with 80% domain coverage; `bun run test` (Vitest component) passes; `make test-e2e` (Playwright BDD) passes; dependency-cruiser still blocks domain imports of drizzle / Hono / AI SDK / adapters

**Plans**: pending
**UI hint**: yes

## Risk Register

| Risk                                                                       | Probability         | Impact | Owning Phase | Mitigation                                                                                                              |
| -------------------------------------------------------------------------- | ------------------- | ------ | ------------ | ----------------------------------------------------------------------------------------------------------------------- |
| Single mega-migration in Phase 1 fails partway, leaves dev DB inconsistent | Medium              | High   | 1            | Dev DB nuke is in-scope (MIG-09); migration is idempotent + atomic; rerun on fresh DB is the recovery path              |
| Reserves auto-compute SQL view performance degrades with txn volume        | Low (small data v1) | Medium | 2, 5         | Start as a regular view; materialized view is a fallback decided in plan-phase; benchmarks in Phase 5 integration tests |
| Cushion-mode history tracking adds schema complexity if user toggles often | Medium              | Medium | 1, 2         | Plan-phase decides between SCD-2 mini-table vs snapshot in audit log; both are pre-considered in v1.1-SPEC §8           |
| Drag-to-reorder collides with quick-entry input keyboard focus             | Low                 | Low    | 4            | Reorder is mouse-only on column header chip; quick-entry input is below the row that triggers drag                      |
| Recurring-engine pg-boss job runs before draft schema reaches new shape    | Low                 | High   | 2            | Phase 2 ships engine update AFTER Phase 1 migration; pg-boss queue is drained at deploy                                 |
| Better Auth orgs invite-token flow doesn't expose programmatic revoke      | Medium              | Medium | 2, 6         | Probe in Phase 2 spike; if missing, layer a thin app-side revocation table on top                                       |
| Offline IndexedDB cache schema drifts from server schema                   | Medium              | Medium | 8            | Cache writes go through a Zod schema shared with server contracts; bump cache version on schema change                  |
| i18n PL/UK translation quality lags EN                                     | Medium              | Low    | 8            | Use Phase 8 i18n rewrite as the natural review checkpoint; user can self-review PL/UK                                   |
| Playwright BDD rewrite blocks launch                                       | Medium              | High   | 8            | Phase 8 budgets explicit time for E2E rewrite; flows are already known from v1.0 features file                          |
| Tasks queue produces noise (false positives auto-firing)                   | Medium              | Medium | 7            | All generators deterministic with auto-resolve on state change; user can dismiss; threshold tuning lives in plan-phase  |
| CUSHION_BELOW_TARGET sweep cost grows with tenant count                    | Low (small N v1)    | Low    | 7            | Per-tenant withTenantTx in hourly cron; linear in tenant count; defer optimization until tenant count > 1000            |
| Cushion FX rate drift between hourly sweeps                                | Low                 | Low    | 7            | Hourly sweep recomputes from live FxProvider; bounds check 0 < rate < 1e6 prevents overflow; inline hooks instant-emit  |

## Dependency Graph

```
Phase 1 (Schema/Rename)
   ↓
Phase 2 (Domain/API + Recurring + Reserves view + Share-link backend)
   ↓
Phase 3 (Top-nav + Home + BDP shell)
   ↓
Phase 4 (Spendings grid + Recurring drafts inline + Real-time reserve deduct)
   ↓
Phase 5 (Reserves tab + Wallets tab)        ← can split into two parallel plan tracks
   ↓
Phase 6 (Settings + Onboarding + Share-join UI)
   ↓
Phase 7 (Tasks queue end-to-end)
   ↓
Phase 8 (PWA + Offline + Push + i18n + E2E)  ← cross-cutting; plans fan out
```

**Why no parallel phases:** Each phase's deliverable is a precondition for the next. Phase 5 can fan out at the plan level (Reserves and Wallets are independent tabs sharing only a primitive). Phase 8 is cross-cutting and its plans fan out (PWA vs i18n vs E2E are mostly independent file sets). Other phases are serial because each consumes the previous phase's surface as a hard dependency.

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8

Within Phase 5, the Reserves and Wallets tabs are parallel-eligible at the plan level.
Within Phase 7, the three generator plans (07-04 CONFIRM_DRAFT, 07-05 RESERVE_TOPUP, 07-06 CUSHION_BELOW_TARGET + sweep) are wave-2 parallel-eligible after the wave-1 ports/services land.
Within Phase 8, PWA / i18n / E2E concerns are parallel-eligible at the plan level.

| Phase                                       | Plans Complete | Status      | Completed  |
| ------------------------------------------- | -------------- | ----------- | ---------- |
| 1. Schema Migration & Rename Foundation     | 0/TBD          | Not started | -          |
| 2. Domain & API Restructure                 | 0/TBD          | Not started | -          |
| 3. Navigation, Home & BDP Frame             | 7/7            | Complete    | 2026-05-13 |
| 4. Spendings Grid                           | 0/TBD          | Not started | -          |
| 5. Reserves & Wallets Tabs                  | 8/8            | Complete    | 2026-05-17 |
| 6. Settings, Onboarding & Share UI          | 8/8            | Complete    | 2026-05-22 |
| 7. Tasks Queue                              | 0/10           | Planned     | -          |
| 8. PWA, Offline, Push, i18n & E2E Hardening | 0/TBD          | Not started | -          |

---

_Roadmap version: v1.1 milestone — generated 2026-05-11. Coverage: 126/126 v1.1 requirements mapped. Phase 7 rescoped 2026-05-30: 3-kind set (RESERVE_TOPUP, CONFIRM_DRAFT, CUSHION_BELOW_TARGET); TASK-05 dropped from v1.1; TASK-04 reassigned semantic to CUSHION_BELOW_TARGET._

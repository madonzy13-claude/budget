# Phase 7: Tasks Queue - Context

**Gathered:** 2026-05-30
**Status:** Shipped — superseded by Tasks Redesign closure (see below)

> **Tasks Redesign (2026-06-01 → 2026-06-02):** The unified top
> `TaskBanner` documented throughout this CONTEXT and the plans was
> replaced after UAT with a per-pill **badge + slider** model
> (`pill-badge.tsx`, `pill-task-slider.tsx`, `kind-pill-map.ts`).
> Backend kept the same `tasks` table + 3 generators + tenant-guarded
> routes; the redesign is purely a UI/UX swap on top of the same data
> contract, plus a new `BudgetDTO.pendingTasksCount` (LEFT JOIN
> aggregate) for home-card badges and migration 0027 promoting
> `cushion_target_months` to `numeric(4,1)` for fractional months.
> Full log: `07-VERIFICATION.md → Addendum: Tasks Redesign Closure`.
> Spec: `docs/superpowers/specs/2026-06-01-tasks-redesign-design.md`.
> Plan: `docs/superpowers/plans/2026-06-01-tasks-redesign.md`.

<domain>
## Phase Boundary

Ship the Tasks queue end-to-end on top of the read-only shell Phase 3 left
behind. Today: empty `budgeting.tasks` table, RLS-scoped `listPending`
adapter, `GET /budgets/:id/tasks?status=pending` route, `TaskBanner` UI that
polls every 60s and renders rows with the action button **disabled**. Nothing
writes to the table; banner never appears in prod.

Phase 7 turns the shell into a working queue:

- Three deterministic generators (re-scoped from the original four):
  `RESERVE_TOPUP`, `CONFIRM_DRAFT`, `CUSHION_BELOW_TARGET`.
- Write extensions to `TaskRepo` (resolve only — no dismiss/snooze).
- Auto-resolve hooks inline in `confirm-recurring-draft.ts`,
  `set-wallet-balance.ts`/`update-wallet.ts`, `adjust-category-reserve.ts`,
  plus cushion-touching mutations (category cushion edit, cushion wallet
  CRUD, `cushion_enabled` toggle, `cushion_target_months` change).
- New schema column `tenancy.budgets.cushion_target_months INT NOT NULL
DEFAULT 6 CHECK (1..60)`.
- Banner action buttons enabled with kind-specific deep-links / inline
  actions; Reserves Actions column wired.
- Settings Cushion section gains a months field below the master `cushion_enabled`
  toggle; onboarding wizard cushion step gains the same field (no new step).
- CategorySlider mirrors cushion = planned silently while they are equal or
  cushion is unset; no chain-icon UI affordance.
- New endpoint `GET /budgets/:id/cushion-summary` (FX-converting) as single
  source for math, consumed by generator and Settings preview.
- Push deep-link URL contract spec (Phase 8 consumes; Phase 7 does not wire
  VAPID).

**Re-scoped from the original ROADMAP §Phase 7:** dropped `STALE_WALLET` and
`MONTH_END_REVIEW` kinds (never built, no rows ever inserted), added
`CUSHION_BELOW_TARGET` driven by the existing master cushion feature flag.
ROADMAP and v1.1-SPEC §9 must be reconciled to this new 3-kind set in the
plan-phase deliverables.

**Out of scope for Phase 7:**

- VAPID web-push dispatcher, push subscription storage, notification
  preferences UI → Phase 8.
- PWA offline cache of tasks → Phase 8.
- Dismiss/snooze controls of any kind → only auto-resolve in v1.1.
- `STALE_WALLET` reminder generator → dropped (user reviews wallets via
  Wallets tab on demand).
- `MONTH_END_REVIEW` ritual nudge → dropped (user can navigate to prior
  months via Spendings grid arrow-key month nav).
- Insights dashboard / month-summary modal → v1.2.
- Investment-snapshot tasks → v1.2 (Investments domain deferred).
- Category-overspent, cushion-well-above-target tasks → deferred; PROJECT.md
  aspiration list, not v1.1 SPEC.

</domain>

<decisions>
## Implementation Decisions

### Kind set (re-scope)

- **D-PH7-01 (kinds):** Phase 7 ships exactly three generators —
  `RESERVE_TOPUP`, `CONFIRM_DRAFT`, `CUSHION_BELOW_TARGET`. `STALE_WALLET`
  and `MONTH_END_REVIEW` are dropped from `tasks_kind_chk` and from the v1.1
  scope. Migration safe: zero rows of those kinds exist in any environment
  (no code ever inserted them).
- **D-PH7-02 (CHECK constraint migration):** Drop `tasks_kind_chk`, recreate
  with `kind IN ('RESERVE_TOPUP','CONFIRM_DRAFT','CUSHION_BELOW_TARGET')`.
  Roadmap and v1.1-SPEC §9 wording updated in plan-phase docs to match.

### RESERVE_TOPUP

- **D-PH7-03 (single source of math):** Generator consumes the existing
  `GET /budgets/:id/reserves` endpoint (`totals.mismatch` per Phase 5
  D-PH5-R1). No SQL duplication; reuse `reserves-summary-builder.ts`
  internally.
- **D-PH7-04 (trigger model — hybrid):** Inline emit + resolve in
  `set-wallet-balance.ts` / `update-wallet.ts` / `adjust-category-reserve.ts`
  use-case post-write step (same `withTenantTx`). Defensive hourly sweep
  added to existing `budgeting-reconciliation.ts` handler — no new cron
  queue, no new schedule registration.
- **D-PH7-05 (dedup):** Partial unique index
  `(budget_id) WHERE kind='RESERVE_TOPUP' AND status='PENDING'`.
  `ON CONFLICT DO NOTHING` on inline insert. One pending RESERVE_TOPUP per
  budget at any time.
- **D-PH7-06 (payload):** `{shortfall_cents, direction: 'TOPUP' | 'WITHDRAW',
currency}` — direction derived from sign of mismatch (positive = wallets
  too low → top up; negative = wallets too high → withdraw).
- **D-PH7-07 (action button):** Deep-link to `/budgets/<id>/reserves`. No
  inline mini-form. Reserves tab Actions column (Phase 5 D-PH5-R6
  placeholder) becomes the actionable surface; inline reserve-balance edit
  per row resolves task via the existing `adjust-category-reserve.ts` use
  case.

### CONFIRM_DRAFT

- **D-PH7-08 (emission point):** Inline in `recurring-engine.ts` handler.
  When the loop INSERTs a new `expense_ledger` row with `confirmed_at IS
NULL` AND the row was created (`ON CONFLICT DO NOTHING` returned a row),
  emit a `CONFIRM_DRAFT` task in the same `withTenantTx`. No separate cron.
- **D-PH7-09 (resolve path — primary):** Auto-resolve in
  `confirm-recurring-draft.ts`. Same tx as the `SET confirmed_at = now()`
  UPDATE: `UPDATE budgeting.tasks SET status='RESOLVED', resolved_at=now()
WHERE kind='CONFIRM_DRAFT' AND payload_json->>'draft_id' = $draftId`.
- **D-PH7-10 (resolve path — secondary):** Auto-resolve in
  `dismiss-draft.ts` and `skip-recurring-draft.ts` use cases as well —
  dismissing the underlying draft also clears the task. Matches Phase 4
  D-PH4-R3 dismiss semantics.
- **D-PH7-11 (dedup):** Partial unique index
  `((payload_json->>'draft_id')) WHERE kind='CONFIRM_DRAFT' AND
status='PENDING'`. One pending CONFIRM_DRAFT per draft row.
- **D-PH7-12 (payload):** `{draft_id, rule_name, amount_cents, currency,
transaction_date, category_id}` — enough for the i18n title without
  another fetch.
- **D-PH7-13 (action button):** Inline `Confirm` button in the banner row
  calls the existing `POST /recurring-rules/.../confirm` endpoint (already
  wired in Phase 2). Banner row collapses on success; auto-resolve removes
  it from the list on next poll. No deep-link required.

### CUSHION_BELOW_TARGET (new kind)

- **D-PH7-14 (flag wiring — two flags exist, only master gates tasks):** The
  master `tenancy.budgets.cushion_enabled` flag gates task lifecycle; the
  display-mode `cushion_mode_enabled` flag is **decoupled** and has zero
  effect on tasks. Flipping the display mode never creates or resolves
  CUSHION_BELOW_TARGET.
- **D-PH7-15 (new column):**
  ```sql
  ALTER TABLE tenancy.budgets
    ADD COLUMN cushion_target_months INTEGER NOT NULL DEFAULT 6
    CHECK (cushion_target_months > 0 AND cushion_target_months <= 60);
  ```
  Always has a value (NOT NULL). Default 6 months. Range 1..60.
- **D-PH7-16 (math):**
  ```
  required_cents = Σ(category_limits.cushion_amount at PIT) × cushion_target_months
  actual_cents   = Σ(wallets.amount WHERE wallet_type='CUSHION') FX→budget currency
  shortfall      = required_cents − actual_cents
  ```
- **D-PH7-17 (lifecycle):**
  ```
  create when:  cushion_enabled = true AND shortfall > 0
  resolve when: cushion_enabled = false OR shortfall ≤ 0
  ```
  Note: cushion mode display toggle never enters this logic.
- **D-PH7-18 (FX):** Cushion wallets are free-currency per Phase 5
  D-PH5-W12. Generator FX-converts to budget currency via `FxProvider` port
  (reuse `recurring-engine-fx.ts` pattern with bounds check + cache).
- **D-PH7-19 (trigger model — hybrid, mirrors RESERVE_TOPUP):** Inline
  recompute in every mutation that can change the formula:
  - `set-wallet-balance.ts` / `update-wallet.ts` (cushion wallet edits)
  - `create-wallet.ts` (new cushion wallet)
  - `archive-wallet.ts` (cushion wallet removal)
  - `set-category-limit.ts` (category cushion amount change)
  - PATCH `/budgets/:id` body containing `cushion_enabled` or
    `cushion_target_months`

  Defensive hourly sweep in `budgeting-reconciliation.ts` catches FX rate
  drift and any missed inline emissions.

- **D-PH7-20 (single source of math):** New endpoint
  `GET /budgets/:id/cushion-summary` returning
  `{required_cents, actual_cents, shortfall_cents, currency,
enabled, target_months}`. Generator AND Settings live preview both
  consume — no SQL duplication.
- **D-PH7-21 (dedup):** Partial unique index
  `(budget_id) WHERE kind='CUSHION_BELOW_TARGET' AND status='PENDING'`.
  Same pattern as RESERVE_TOPUP.
- **D-PH7-22 (payload):** `{shortfall_cents, required_cents, actual_cents,
currency, target_months}`.
- **D-PH7-23 (action button):** Deep-link to `/budgets/<id>/wallets`
  scrolled/anchored to the Cushion section (Phase 5 Wallets tab three-
  section layout). User adds cushion wallet or edits amount → auto-resolve
  fires inline.
- **D-PH7-24 (single helper):** Extract `recompute-cushion-task.ts` in
  `packages/budgeting/src/application/`. Called by every mutation path
  listed in D-PH7-19. Encapsulates the create-or-resolve decision so call
  sites do not branch.

### Banner & UI

- **D-PH7-25 (TaskBannerRow — enable action button):** Drop `disabled`,
  `aria-disabled`, and `bdp.tasks.actionComingSoon` tooltip. Wire `onClick`
  per kind: `RESERVE_TOPUP` and `CUSHION_BELOW_TARGET` use
  `next/navigation` `router.push`; `CONFIRM_DRAFT` uses inline mutation via
  `clientApiFetch`.
- **D-PH7-26 (Reserves Actions column):** Phase 5 D-PH5-R6 placeholder is
  wired in Phase 7. On a row that corresponds to a category contributing to
  a PENDING `RESERVE_TOPUP`, show an actionable `MoreHorizontal` /
  appropriate lucide icon; clicking opens the same Reserves inline-edit
  path that already exists.
- **D-PH7-27 (no dismiss UI):** Banner rows have no `×` dismiss button in
  v1.1. Auto-resolve is the only path to remove a row. Simplifies UX and
  removes the need for snooze/banner-spam handling.
- **D-PH7-28 (banner order):** Keep Phase 3 ASC `created_at` ordering. No
  kind-priority sort.
- **D-PH7-29 (E2E feature rewrite):** Existing
  `apps/web/e2e/features/task-banner.feature` asserts the action button is
  disabled. Rewrite to cover the action-button-enabled flow per kind plus
  auto-resolve scenarios. Keep the existing seed-via-SQL helper for
  determinism.

### Push deep-link URL contract (consumed in Phase 8)

- **D-PH7-30 (URL shape):** `/budgets/<id>/<tab>?task=<task_id>` per kind:
  - `RESERVE_TOPUP` → `/budgets/<id>/reserves?task=<id>`
  - `CONFIRM_DRAFT` → `/budgets/<id>/spendings?task=<id>&month=YYYY-MM`
    where month comes from `payload.transaction_date`
  - `CUSHION_BELOW_TARGET` → `/budgets/<id>/wallets?task=<id>#cushion`
- **D-PH7-31 (anchor behavior — defer to Phase 8):** Tab page reads
  `?task=<id>` and either expands the banner row or scrolls to the related
  surface (Reserves row / draft row / Cushion section). Phase 7 lays the
  URL contract; Phase 8 wires the consumer.

### Settings + Onboarding additions

- **D-PH7-32 (Settings — Cushion section):** Existing
  `apps/web/src/components/settings/cushion-section.tsx` keeps both master
  toggle and display-mode toggle. New numeric field `cushion_target_months`
  placed **below the master toggle and above the display-mode toggle**.
  Hidden (CSS `display: none`) when master is off; alongside the same gating
  the mode toggle already follows. Live shortfall preview line under the
  input: `Current: <actual> / <required> (-<shortfall>)`. Preview source is
  `GET /budgets/:id/cushion-summary`.
- **D-PH7-33 (Settings — PATCH body):** `cushion_target_months` joins the
  existing PATCH `/budgets/:id` payload. Single round-trip when user changes
  the months value. Server returns updated summary so preview refreshes.
- **D-PH7-34 (Onboarding wizard):** Existing cushion step in
  `apps/web/src/components/onboarding/` gains the months field directly
  below the master toggle in the same step. Default 6. Hidden when master
  is off. No new step added to the wizard stepper.

### CategorySlider — silent cushion-mirror

- **D-PH7-35 (mirror behavior):** Slider local state:
  ```typescript
  const [planned, setPlanned] = useState(initialPlanned);
  const [cushion, setCushion] = useState(initialCushion);
  const [linked, setLinked] = useState(
    initialCushion == null || initialCushion === initialPlanned,
  );
  ```
  On planned input change: if `linked`, `setCushion(newPlanned)` in the same
  React batch. On cushion input change: `setLinked(false)` (silent break).
  Slider close (Cancel) discards state; Save submits both fields.
- **D-PH7-36 (no UI affordance):** No chain icon, no broken-chain icon, no
  "click to relink" affordance. Re-link happens automatically the next time
  the slider opens with equal/empty values.
- **D-PH7-37 (gating):** Cushion input is hidden when
  `cushion_enabled = false` (existing gating). Linked flag is initialized
  from whatever values land in the component; behavior is identical whether
  cushion-mode display toggle is on or off.

### Claude's Discretion

- Default value for `cushion_target_months` in the new schema column (locked
  at 6 — no further discretion).
- Whether to add a deep-link query param `?task=<id>` or a hash fragment
  `#task=<id>` for the push contract (D-PH7-30 chose query params; OK to
  switch to hash if planner finds that simpler).
- Exact i18n string copy for the three task kinds — designer-style strings
  are at planner's discretion as long as ICU placeholders match the payload
  fields documented above.
- Whether `recompute-cushion-task.ts` is one function or a small module of
  helpers — call-site shape is what matters.
- Whether the hourly defensive sweep lives in
  `budgeting-reconciliation.ts` or a new handler. Existing handler keeps
  cron count down — preferred unless dependency-cruiser objects.
- E2E `task-banner.feature` final scenario list (rewrite is required;
  specific scenarios are at planner's discretion).

</decisions>

<canonical_refs>

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Roadmap & requirements (re-scope required)

- `.planning/ROADMAP.md` §Phase 7 — original 4-kind scope; planner MUST
  update wording to the locked 3-kind set (`RESERVE_TOPUP`, `CONFIRM_DRAFT`,
  `CUSHION_BELOW_TARGET`). `STALE_WALLET` and `MONTH_END_REVIEW` rows
  removed from the success-criteria list.
- `.planning/REQUIREMENTS.md` §Tasks Queue (TASK) — TASK-01..08 to be
  updated to reflect the new kind set.
- `.planning/v1.1-SPEC.md` §9 (Tasks queue) — trigger/resolution table
  reconciled to 3-kind set.
- `.planning/PROJECT.md` §Tasks (action queue) — aspirational list (cushion,
  overspent, missing-snapshot) remains as v1.2 backlog; not a Phase 7
  promise.

### Locked prior-phase decisions (still in force)

- `.planning/phases/01-schema-migration-rename-foundation/01-CONTEXT.md` —
  `budgeting.tasks` schema, RLS, indexes, kind check constraint shape.
- `.planning/phases/02-domain-api-restructure/` — recurring engine
  (`recurring-engine.ts`), confirm-draft service
  (`confirm-recurring-draft.ts`), outbox pattern, `withTenantTx` discipline.
- `.planning/phases/03-navigation-home-bdp-frame/03-CONTEXT.md` — TaskBanner
  shell, TaskBannerRow disabled-action shape, i18n key namespace
  (`bdp.tasks.title.<KIND>` / `kind.<KIND>` / `action.<KIND>.label`),
  60-second poll + visibility invalidation, ARIA accordion contract.
- `.planning/phases/04-spendings-grid/04-CONTEXT.md` — recurring draft
  Confirm flow (D-PH4-R2/R3), pen-icon CategorySlider entry point
  (D-PH4-INT4, D-PH4-INT6).
- `.planning/phases/05-reserves-wallets-tabs/05-CONTEXT.md` — `GET
/budgets/:id/reserves` mismatch math (D-PH5-R1..R5), reserve-wallet
  budget-currency lock (D-PH5-R3), reserve adjustments ledger (D-PH5-R7..R8),
  Reserves Actions column placeholder (D-PH5-R6), Wallets inline-edit
  semantics (D-PH5-W4..W12), 3-section Wallets layout including Cushion
  section.
- `.planning/phases/06-settings-onboarding-share-ui/06-CONTEXT.md` —
  Settings tab layout, existing `cushion-section.tsx` two-toggle structure,
  onboarding wizard step structure.

### Existing code that Phase 7 extends or wires

- `packages/budgeting/src/adapters/persistence/tasks-schema.ts` — table
  definition; check constraint changes here.
- `packages/budgeting/src/ports/task-repo.ts` — add `resolve(taskId,
tenantId)` plus targeted lookups for inline auto-resolve.
- `packages/budgeting/src/adapters/persistence/task-repo.ts` — write
  methods, INSERT-with-ON-CONFLICT helpers, RLS-scoped UPDATE for resolve.
- `apps/api/src/routes/tasks.ts` — add POST resolve.
- `packages/budgeting/src/application/list-pending-tasks.ts` — already
  exists, keep.
- `packages/budgeting/src/application/confirm-recurring-draft.ts` — auto-
  resolve hook for CONFIRM_DRAFT.
- `packages/budgeting/src/application/{set-wallet-balance,update-wallet,
create-wallet,archive-wallet}.ts` — auto-resolve hooks for RESERVE_TOPUP
  and CUSHION_BELOW_TARGET (via the new helper).
- `packages/budgeting/src/application/adjust-category-reserve.ts` — auto-
  resolve hook for RESERVE_TOPUP.
- `packages/budgeting/src/application/set-category-limit.ts` — auto-
  recompute for CUSHION_BELOW_TARGET (cushion amount changes).
- `packages/budgeting/src/application/recompute-cushion-task.ts` — NEW
  helper (D-PH7-24).
- `apps/worker/src/handlers/recurring-engine.ts` — emit CONFIRM_DRAFT
  inline when a draft row is freshly INSERTed.
- `apps/worker/src/handlers/budgeting-reconciliation.ts` — defensive
  hourly sweep for both RESERVE_TOPUP and CUSHION_BELOW_TARGET.
- `apps/web/src/components/budgeting/task-banner-row.tsx` — enable action
  button per kind.
- `apps/web/src/components/budgeting/reserves-tab/reserves-table-row.tsx` —
  wire Actions column.
- `apps/web/src/components/settings/cushion-section.tsx` — add months field
  - live preview line.
- `apps/web/src/components/onboarding/` — add months field to cushion step.
- `apps/web/src/components/budgeting/category-slider.tsx` — silent mirror
  behavior.
- `apps/web/messages/{en,pl,uk}.json` — fill per-kind title/kind/action keys.
- `apps/web/e2e/features/task-banner.feature` — rewrite assertions.

### CI gates & tests

- `make test` — bun:test backend unit + integration. New tests for resolve
  endpoint, three generators, three auto-resolve hooks, cushion summary
  endpoint, `cushion_target_months` PATCH.
- `make test-e2e` — Playwright BDD. Rewrite `task-banner.feature`; add
  scenarios for each kind's create + auto-resolve flow; cushion settings
  edit; wizard cushion months field.
- `make ci-gate` — tenant-leak gate. Tasks table already covered by
  `tests/tenant-leak/tasks-cross-tenant.test.ts`; extend to cover the new
  resolve route plus the cushion-summary route.
- `cd apps/web && bun run test` — Vitest. New tests for TaskBannerRow per
  kind, CategorySlider mirror behavior, Cushion section months field,
  wizard cushion step months field.

### Project conventions

- Hexagonal boundary: `dependency-cruiser` blocks `packages/*/domain`
  importing `drizzle-orm`, Hono, AI SDK, or `adapters/`. New helper
  `recompute-cushion-task.ts` lives in `application/` and uses ports only.
- `Money` value object at adapter boundary only — cushion math uses
  `bigint` cents throughout the helper; FX-converted amounts also `bigint`.
- 80% domain coverage threshold in `bunfig.toml` — the new helper plus
  generator logic gets dedicated unit tests.
- DESIGN.md yellow-accent discipline — primary action buttons on banner
  rows = yellow; deep-link affordances neutral.
- i18n in EN + PL + UK for every new string at landing (project rule, not
  deferred to Phase 8).

</canonical_refs>

<code_context>

## Existing Code Insights

### Reusable Assets

- `TaskBanner` (`apps/web/src/components/budgeting/task-banner.tsx`) —
  fully working count + expand + 60s poll + ARIA accordion. Phase 7 leaves
  it alone.
- `TaskBannerRow` — DOM shape locked, only the action button changes
  (drop disabled, wire onClick).
- `task-repo.ts` adapter — RLS-scoped `withTenantTx` template. Phase 7
  copies the same SYSTEM_USER convention for cron-emitted writes.
- `tasks` route — defense-in-depth tenant check
  (`tenantIds.includes(budgetId)` → 404) reused on POST resolve.
- `recurring-engine.ts` — pattern for per-tenant `withTenantTx` cron, `FOR
UPDATE`, writeOutbox; Phase 7 mirrors for cushion sweep and reserve
  sweep.
- `budgeting-reconciliation.ts` — hourly cron host for the defensive
  sweeps; saves a cron registration.
- `reserves-summary-builder.ts` + `GET /budgets/:id/reserves` — single
  source for RESERVE_TOPUP math.
- `recurring-engine-fx.ts` — FX cache + bounds-check pattern for cushion
  wallet conversion.
- `confirm-recurring-draft.ts` — auto-resolve hook attaches here without
  reshaping the use case.
- `cushion-section.tsx` Settings component — already two-toggle, new field
  drops in between.
- `category-slider.tsx` — existing pen-icon entry; receives the silent
  mirror behavior.

### Established Patterns

- **Outbox-based event emission** — `writeOutbox(tx, event)` in same domain
  tx → background dispatcher publishes. Phase 7 emits
  `{type: 'task.created', kind, task_id, payload}` from every generator;
  Phase 8 will consume.
- **Inline-then-sweep hybrid for derived state** — Phase 2 budgeting-
  reconciliation already uses this for projection drift; Phase 7 reuses
  for RESERVE_TOPUP and CUSHION_BELOW_TARGET.
- **`ON CONFLICT DO NOTHING` + partial unique index for dedup** — pattern
  Phase 2 recurring-engine uses on `(recurring_rule_id, transaction_date)`.
- **`withTenantTx(tenantId, userId, fn)` for all RLS-scoped writes** —
  Phase 7 keeps using SYSTEM_USER UUID
  `00000000-0000-0000-0000-000000000001` for cron-emitted writes; user-
  driven writes use the authenticated user.
- **Two cushion flags decoupled** — Phase 6 settings already enforces
  master toggle gates the display-mode toggle; Phase 7 only depends on
  master for task lifecycle.
- **Defense-in-depth tenant check in routes** — `tenantIds.includes
(budgetId)` → 404 before invoking the application service; Phase 7
  reuses for resolve route.

### Integration Points

- `apps/web/src/components/settings/cushion-section.tsx` — add new numeric
  input + live preview, between the existing two toggles.
- `apps/web/src/components/onboarding/` cushion step — add numeric input
  in same step, no new step.
- `apps/web/src/components/budgeting/category-slider.tsx` — local state
  rewire; backend unchanged.
- `apps/web/src/components/budgeting/reserves-tab/reserves-table-row.tsx`
  — wire Actions column from placeholder to actionable.
- `apps/web/src/components/budgeting/task-banner-row.tsx` — enable action
  button per kind.
- `apps/api/src/routes/tasks.ts` — new POST resolve route.
- `apps/api/src/routes/budgets.ts` — already accepts PATCH; extend payload
  with `cushion_target_months`.
- New route: `GET /budgets/:id/cushion-summary` — placement in
  `apps/api/src/routes/budgets.ts` or its own
  `apps/api/src/routes/cushion.ts` is at planner's discretion.

</code_context>

<specifics>
## Specific Ideas

- **User explicitly rescoped Phase 7 during discussion** from the original
  ROADMAP 4-kind set to a 3-kind set. Roadmap rewording is required as part
  of plan-phase artifacts.
- **`STALE_WALLET` is dead** — user position: "wallet snapshot freshness
  reminders are not needed; user updates wallets when they want to."
- **`MONTH_END_REVIEW` is dead** — user position: "user can always check
  previous month via Spendings grid month-nav; no ritual nudge needed."
- **Cushion target is the new third generator** — user wanted a derived
  alert when actual cushion lags the configured target. Math is the user's
  exact formula:
  `expected_cushion = Σ category cushion × expected_cushion_months`.
- **Default cushion target = 6 months** — user-specified default. NOT 3.
- **Onboarding wizard adds the months field below the master cushion toggle
  in the existing step** — explicitly NOT a separate step.
- **Two cushion flags are kept decoupled** — user clarified: only the
  master `cushion_enabled` gates the task lifecycle. The display-mode
  `cushion_mode_enabled` toggle changes grid header text only and never
  resolves/creates tasks.
- **CategorySlider cushion-mirror is silent** — no chain icon, no broken-
  chain icon, no relink affordance. User wants invisible behavior: when
  cushion is unset or equal to planned, typing planned mirrors to cushion;
  typing cushion silently breaks the link.

</specifics>

<deferred>
## Deferred Ideas

- **`STALE_WALLET` reminder generator** — surfaced and dropped this phase
  by user direction. Possibly revisit in v1.2 if wallet snapshot freshness
  becomes a support issue.
- **`MONTH_END_REVIEW` ritual nudge** — dropped this phase. Revisit when
  the Insights dashboard ships in v1.2 with a real review surface; the
  current Spendings grid month-nav is the user's manual path.
- **Dismiss / snooze controls on banner rows** — not in v1.1. Auto-resolve
  is the only removal path. Reconsider if banner spam becomes a complaint.
- **Push notification dispatch (VAPID + per-user prefs)** — Phase 8.
  Phase 7 mints the URL contract and emits the `task.created` outbox
  event; the consumer wiring is Phase 8.
- **Snooze semantics (`payload.snoozed_until`)** — surfaced for
  `STALE_WALLET` originally; obsoleted once STALE_WALLET dropped. No other
  kind needs snooze.
- **Banner kind-priority sort** — surfaced and dropped; ASC `created_at`
  is sufficient for v1.1.
- **Inline mini-modal for RESERVE_TOPUP / CUSHION_BELOW_TARGET banner row**
  — surfaced and dropped in favor of deep-links. Reconsider if usage data
  shows deep-link friction.
- **`STALE_WALLET` configurable threshold UI in Settings** — moot, kind
  dropped.
- **Banner row dismiss control (× icon)** — out of scope per D-PH7-27.
- **Category-overspent task, cushion-well-above-target task, missing-
  investment-snapshot task** — PROJECT.md aspirational list; not v1.1.

</deferred>

---

_Phase: 7-tasks-queue_
_Context gathered: 2026-05-30_

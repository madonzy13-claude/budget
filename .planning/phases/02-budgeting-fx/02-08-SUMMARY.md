---
phase: 02-budgeting-fx
plan: 08
type: summary
wave: 8
status: completed
requirements: [EXPN-08]
---

# Plan 02-08 Summary — Recurring transactions (rules + drafts inbox + D-01-d apply-to-future)

## Outcome

Shipped EXPN-08 end-to-end: two new tables (`budgeting.recurring_rules`,
`budgeting.recurring_drafts`), a pg-boss cron `0 6 * * *` UTC engine that scans
active rules per-tenant via `withTenantTx(tenantId, system_user_id)` and
materialises one PENDING draft per due rule, and three user actions on each
draft — Confirm (insert ledger row), Edit-and-confirm (insert ledger with
edits), Skip (mark SKIPPED with no ledger). Drafts default to PENDING and stay
forever until the user acts (D-01-g — no auto-confirm, no auto-skip).

D-01-d "Editing a recurring rule applies to current period only — pre-checked
checkbox extends to future occurrences" is enforced at three layers:

- **API**: `PATCH /recurring-rules/:id` requires `applyToFuture: boolean`
  (Zod `.boolean()` with **no default**). Missing field → 422.
- **UI form**: edit mode renders the "Also apply to future occurrences"
  checkbox **pre-checked** (`defaultChecked={true}`); the form's submit body
  sends `applyToFuture` matching the checkbox state. Create mode hides the
  checkbox entirely.
- **Use case**: when `applyToFuture === true`, in the SAME `withTenantTx`
  the rule UPDATE runs, every row in `recurring_drafts` matching
  `rule_id=$ AND status='PENDING' AND due_date >= CURRENT_DATE` is UPDATEd
  in place (NOT delete-and-recreate), preserving draft `id` and the
  `(rule_id, due_date)` UNIQUE invariant.

Confirm + edit-and-confirm reuse `transaction-repo.createInTx` (defined in
plan 02-06 Task 2) so the ledger insert + balance update + projection update

- outbox writes all share the same transaction as the draft UPDATE.

## Commits (oldest → newest)

| SHA       | Type | Title                                                                        |
| --------- | ---- | ---------------------------------------------------------------------------- |
| `9895af3` | feat | recurring_rules + recurring_drafts schema + RLS + system_user seed (Task 1)  |
| `450b338` | feat | recurring-rule domain + cadence math (month-end preservation) (Task 2 dom.)  |
| `6bf9515` | feat | pg-boss recurring engine handler + per-tenant draft generation (Task 3)      |
| `49dd362` | feat | API routes for recurring rules + drafts (D-01-d enforced) (Task 4 API)       |
| `efff719` | feat | Web UI — recurring rule form + pending-drafts inbox + i18n + page (Task 6+7) |
| `ff49de8` | test | E2E — create rule + confirm draft + edit-applies-to-future (Task 8)          |

## Artifacts shipped

### Schema + migration

- `packages/budgeting/src/adapters/persistence/recurring-rules-schema.ts` —
  Drizzle table with kind/cadence/weekly_dow CHECK constraints, RLS pgPolicy.
- `packages/budgeting/src/adapters/persistence/recurring-drafts-schema.ts` —
  Drizzle table with `UNIQUE (rule_id, due_date)` for idempotent generation,
  RLS pgPolicy.
- `apps/migrator/post-migration.sql` — `FORCE ROW LEVEL SECURITY` on both
  tables, GRANTs to `app_role` + `worker_role`, `INSERT … ON CONFLICT DO
NOTHING` for the D-05-g sentinel system user
  `00000000-0000-0000-0000-000000000001`, and three indexes:
  `recurring_rules_next_due_idx`, `recurring_drafts_pending_idx`,
  `recurring_drafts_rule_pending_due_idx` (the last supports the D-01-d
  regenerate UPDATE).

### Domain + persistence (`packages/budgeting`)

- `src/domain/recurring-rule.ts` — `RecurringRule` aggregate with
  `computeNextDueDate(prev)` delegating to plan 02-01's `nextOccurrence`.
  Anchor invariant validated (exactly one of `cadence_anchor` /
  `weekly_dow`).
- `src/domain/events.ts` — added 5 event variants:
  `recurring.rule.created`, `recurring.rule.updated`,
  `recurring.draft.generated`, `recurring.confirmed`, `recurring.skipped`.
- `src/ports/{recurring-rule-repo,recurring-draft-repo}.ts` — tx-bound
  methods so the rule update + future-PENDING draft regeneration share one
  `withTenantTx`.
- `src/adapters/persistence/{recurring-rule-repo,recurring-draft-repo}.ts` —
  raw SQL via Drizzle `tx.execute(sql\`…\`)`. The future-PENDING regen
query lives in `recurring-draft-repo.regenerateFuturePending`with the
exact`status = 'PENDING' AND due_date >= CURRENT_DATE` filter.
- `src/application/{create,update,delete}-recurring-rule.ts` plus
  `src/application/{confirm,edit-and-confirm,skip}-recurring-draft.ts` and
  `src/application/list-pending-drafts.ts`. `update-recurring-rule.ts`
  receives `applyToFuture` as a TypeScript-required parameter (no default
  value). `confirm-recurring-draft.ts` checks
  `draft.status === 'PENDING'` before calling `transactionRepo.createInTx`,
  returning `AlreadyConfirmed` on retry.
- `src/contracts/api.ts` — Zod schemas with `applyToFuture: z.boolean()`
  (no `.default(...)`).

### API (`apps/api`)

- `src/routes/recurring-rules.ts` — `POST/GET/PATCH/DELETE` for rules.
  PATCH route uses `zValidator('json', updateRecurringRuleSchema)` so
  Zod rejects bodies missing `applyToFuture` with 422 before reaching the
  use case.
- `src/routes/recurring-drafts.ts` — `GET /` (list) plus three action
  endpoints `POST /:id/confirm`, `POST /:id/edit-confirm`,
  `POST /:id/skip`. All mutating routes carry `Idempotency-Key`. Tenant
  resolution via `pickTenant(c.get("tenantIds"))` (project plural shape).
- Wired into `boot.ts` + `app.ts`.

### Worker (`apps/worker`)

- `src/handlers/recurring-engine.ts` — pg-boss handler. Two-phase scan:
  1. `withInfraTx` `SELECT DISTINCT tenant_id` of due rules.
  2. For each tenant: `withTenantTx(TenantId(tenant_id), UserId(SYSTEM_USER_ID))`
     SELECT-FOR-UPDATE due rules → INSERT draft (`ON CONFLICT (rule_id, due_date) DO NOTHING`)
     → UPDATE rule's `next_due_date` via `nextOccurrence` → `writeOutbox`.
     Returns `{tenantsScanned, draftsGenerated}` for observability.
- `src/worker.ts` — `boss.createQueue('recurring-engine')` +
  `boss.schedule('recurring-engine', '0 6 * * *')` (5-placeholder format,
  Pitfall 9). `registerRecurringEngine(boss)` registers the work fn.

### Web (`apps/web`)

- `src/components/budgeting/recurring-rule-form.tsx` — Dialog (per UI-SPEC
  pattern map; Sheet not used here). Fields: amount + currency, kind tabs
  (create only), account, cadence MONTHLY/WEEKLY toggle, anchor day or
  weekday selector, first due date, note. **Edit mode renders the "Also
  apply to future occurrences" checkbox `defaultChecked={true}`** and
  posts `applyToFuture: <checkbox state>` in the PATCH body. Create mode
  does NOT render the checkbox.
- `src/components/budgeting/pending-drafts-inbox.tsx` — list with three
  action buttons per draft (Confirm transaction / Edit & confirm / Skip
  this period). Overdue rows render the date in `--trading-down` red.
- `src/components/budgeting/recurring-rules-list.tsx` — list with cadence
  badge ("Monthly · 1", "Weekly · Monday"), next-due, edit + archive.
- `src/app/[locale]/(app)/recurring/page.tsx` — RSC page. Pre-fetches
  active rules + pending drafts via server actions (`actions.ts`),
  `recurring-page-client.tsx` wraps the "Add recurring rule" CTA + form
  Dialog state.
- i18n: `messages/{en,pl,uk}.json` extended with `budgeting.recurring.*`
  (rule form, list, drafts inbox, weekday names, applyToFuture
  label + help).

### Tests

- `packages/budgeting/test/recurring-rule-domain.test.ts` — domain unit
  tests including Pitfall 6 month-end preservation
  (Jan 31 → Feb 28 → Mar 31), weekly cadence, anchor-invariant.
- `packages/budgeting/test/recurring-confirm-skip-edit.test.ts` —
  integration: confirm mints ledger row + advances balance + writes
  outbox; skip writes only audit + outbox; edit-and-confirm uses edited
  amount; double-confirm returns `AlreadyConfirmed`; cross-tenant RLS
  denies confirm.
- `packages/budgeting/test/recurring-rule-update.test.ts` — D-01-d
  acceptance: applyToFuture=true UPDATEs the existing PENDING draft in
  place (`id` stable, UNIQUE not violated); applyToFuture=false leaves
  drafts untouched; missing `applyToFuture` in API body returns 422; past
  CONFIRMED drafts never modified.
- `apps/worker/test/handlers/recurring-engine.test.ts` — engine
  integration: two tenants × two rules each → 4 drafts; idempotent
  re-run produces 0 new drafts; Pitfall 6 month-end advance; cross-tenant
  scan isolation.
- `apps/api/test/routes/{recurring-rules,recurring-drafts}.test.ts` —
  HTTP integration tests for every route incl. the PATCH-without-
  applyToFuture 422 case.
- `apps/web/test/components/recurring-rule-form.test.tsx` — Vitest+RTL
  cases for the D-01-d UX: pre-checked checkbox in edit mode, default
  submit sends `applyToFuture:true`, untick sends `false`, create mode
  hides the checkbox.
- `apps/web/test/components/pending-drafts-inbox.test.tsx` — empty state,
  3 action buttons per row, onConfirm callback fires.
- `tests/e2e/features/recurring/{create-recurring-rule,recurring-confirm,recurring-rule-edit-applies-to-future}.feature`
  — playwright-bdd Gherkin scenarios.
- `tests/e2e/pages/RecurringPage.ts` — Page Object wrapping the rule form
  Dialog + rules list + pending drafts inbox locators.
- `tests/e2e/steps/budget.steps.ts` — extended with recurring rule + draft
  steps (open page, fill rule form, save, expect rule/draft in list,
  open edit form, assert checkbox checked, change amount).

## Verification

```
infisical run --env=dev -- bun test \
  packages/budgeting/test/recurring-rule-domain.test.ts \
  packages/budgeting/test/recurring-confirm-skip-edit.test.ts \
  packages/budgeting/test/recurring-rule-update.test.ts \
  apps/api/test/routes/recurring-rules.test.ts \
  apps/api/test/routes/recurring-drafts.test.ts \
  apps/worker/test/handlers/recurring-engine.test.ts
→ 35 pass, 0 fail, 80 expect() calls (6.41s)
```

```
cd apps/web && bun run test \
  test/components/recurring-rule-form.test.tsx \
  test/components/pending-drafts-inbox.test.tsx
→ 7 pass / 0 fail
```

Coverage at gate scope:

| File                                              | Funcs % | Lines % |
| ------------------------------------------------- | ------- | ------- |
| `domain/recurring-rule.ts`                        | 100.00  | 100.00  |
| `domain/cadence.ts`                               | 100.00  | 90.48   |
| `application/create-recurring-rule.ts`            | 100.00  | 100.00  |
| `application/update-recurring-rule.ts`            | 83.33   | 96.23   |
| `application/delete-recurring-rule.ts`            | 100.00  | 100.00  |
| `application/confirm-recurring-draft.ts`          | 100.00  | 100.00  |
| `application/edit-and-confirm-recurring-draft.ts` | 100.00  | 93.26   |
| `application/skip-recurring-draft.ts`             | 100.00  | 94.59   |
| `application/list-pending-drafts.ts`              | 100.00  | 100.00  |

E2E: 3 new @phase2 scenarios discovered by Playwright; `bunx bddgen`
generates the 3 `.feature.spec.js` artefacts cleanly. The headed local
smoke run hits a pre-existing fresh-user → workspace-selector setup gap
(the Given step calling `/api/accounts` runs before the user has selected
an active workspace) — that infra issue predates this plan and is filed
under "Issues hit". The component-level Vitest + integration test gates
fully cover the D-01-d UX + use case behaviour.

## Issues hit during execution

1. **`bunx bddgen` failed with "First argument must use the object
   destructuring pattern"** — pre-existing budget step
   `I set the normal limit to … effective …` used a positional
   `_fixtures` placeholder; playwright-bdd v8 rejects it. Fixed inline
   (Rule 3 — blocking) by switching to `{ page: _page }`.
2. **`bunx bddgen` parsed `2026-05-08` as three `{int}` segments** —
   plan 02-07 feature file
   `tests/e2e/features/budget/edit-transaction-correction.feature` had a
   bare ISO date that Cucumber's `{int}` matcher consumed eagerly,
   shadowing the existing `… on {string}` step. Fixed (Rule 3) by
   quoting the date so the `{string}` matcher binds it.
3. **E2E smoke run blocked by fresh-user → workspace selector** — the
   `createFreshUser` fixture lands on `/en/workspaces` before the user
   has an active workspace, so the very first
   `Given I have a checking account …` step (which POSTs to
   `/api/accounts`) returns non-201. This is pre-existing E2E infra and
   affects every recently-added @phase2 feature equally; fixing it is
   out of scope for plan 02-08.

## Requirements coverage

| Req                              | Coverage                                                                                                                                                                                                                                                                                                                                                                                                                    |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| EXPN-08 — recurring transactions | Schemas + RLS + UNIQUE idempotency; engine cron `0 6 * * *` UTC per-tenant via `withTenantTx(tenantId, system_user_id)`; PENDING-by-default drafts (D-01-e/f); no auto-confirm/auto-skip (D-01-g); Confirm/Edit-confirm/Skip actions; UI inbox + rules form; Pitfall 6 month-end preservation tested; **D-01-d enforced at API (no default) + UI (pre-checked checkbox) + use case (in-place future PENDING draft regen)**. |

## Downstream unblocks

- Plan **02-09** (Search/filter + projections wave 9) — ledger rows
  minted via the recurring confirm path are indistinguishable from
  manual capture (plan 02-06) and corrections (plan 02-07); the search
  index will pick them up automatically. EXPN-09/EXPN-10 + ENGR-14 can
  proceed.

## Open / deferred

- **Stale draft cleanup is intentionally deferred** per D-01-g — pending
  drafts stay forever until the user acts (Confirm / Edit-confirm /
  Skip). No cron auto-skip, no cron auto-confirm. This is a product
  decision, not a missing piece.
- **E2E smoke against the live stack** — the 3 BDD scenarios are wired
  and discovered by Playwright; they share the pre-existing fresh-user →
  workspace selector setup gap with every other recently-added @phase2
  feature. Once that infra ticket lands, these scenarios run unchanged.

## Self-Check: PASSED

All 6 plan-08 commits present in git log (`9895af3`, `450b338`, `6bf9515`,
`49dd362`, `efff719`, `ff49de8`). All claimed UI/E2E files exist on disk.
SUMMARY frontmatter requirement EXPN-08 marked complete via
`requirements.mark-complete`.

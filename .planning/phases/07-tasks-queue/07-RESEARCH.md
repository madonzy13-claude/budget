# Phase 7: Tasks Queue - Research

**Researched:** 2026-05-30
**Domain:** Task generator architecture, pg-boss dedup, auto-resolve hooks, cushion math, banner UI wiring
**Confidence:** HIGH — all findings verified against actual codebase substrate from Phases 2–6

---

<user_constraints>

## User Constraints (from CONTEXT.md)

### Locked Decisions

**Kind set:** Phase 7 ships exactly three generators — `RESERVE_TOPUP`, `CONFIRM_DRAFT`,
`CUSHION_BELOW_TARGET`. `STALE_WALLET` and `MONTH_END_REVIEW` are dropped from v1.1 scope.

**RESERVE_TOPUP:** Generator consumes `GET /budgets/:id/reserves` endpoint mismatch math
(D-PH7-03). Hybrid trigger: inline in `set-wallet-balance.ts`, `update-wallet.ts`,
`adjust-category-reserve.ts` + defensive hourly sweep in `budgeting-reconciliation.ts` (D-PH7-04).
Dedup via partial unique index on `(budget_id) WHERE kind='RESERVE_TOPUP' AND status='PENDING'`
(D-PH7-05). Payload: `{shortfall_cents, direction: 'TOPUP'|'WITHDRAW', currency}` (D-PH7-06).
Action button: deep-link to `/budgets/<id>/reserves` (D-PH7-07).

**CONFIRM_DRAFT:** Emitted inline in `recurring-engine.ts` handler when a fresh draft row is
INSERTed (D-PH7-08). Resolved in `confirm-recurring-draft.ts`, `dismiss-draft.ts`, and
`skip-recurring-draft.ts` (D-PH7-09, D-PH7-10). Dedup via partial unique index on
`((payload_json->>'draft_id')) WHERE kind='CONFIRM_DRAFT' AND status='PENDING'` (D-PH7-11).
Payload: `{draft_id, rule_name, amount_cents, currency, transaction_date, category_id}` (D-PH7-12).
Action button: inline `Confirm` via existing `POST /recurring-rules/.../confirm` endpoint (D-PH7-13).

**CUSHION_BELOW_TARGET:** Master `cushion_enabled` flag gates task lifecycle; `cushion_mode_enabled`
does NOT gate it (D-PH7-14). New column `cushion_target_months INTEGER NOT NULL DEFAULT 6 CHECK
(cushion_target_months > 0 AND cushion_target_months <= 60)` (D-PH7-15). Math: `required_cents =
Σ(category_limits.cushion_amount × cushion_target_months)`; `actual_cents = Σ(wallets.amount WHERE
wallet_type='CUSHION') FX→budget currency`; `shortfall = required − actual` (D-PH7-16). Create
when `cushion_enabled = true AND shortfall > 0`; resolve when `cushion_enabled = false OR shortfall
≤ 0` (D-PH7-17). FX via `FxProvider` port reusing `recurring-engine-fx.ts` pattern (D-PH7-18).
Inline recompute hooks in `set-wallet-balance.ts`, `update-wallet.ts`, `create-wallet.ts`,
`archive-wallet.ts`, `set-category-limit.ts`, PATCH `/budgets/:id` for `cushion_enabled` or
`cushion_target_months` (D-PH7-19). Single endpoint `GET /budgets/:id/cushion-summary` returns
`{required_cents, actual_cents, shortfall_cents, currency, enabled, target_months}` consumed by
generator AND Settings live preview (D-PH7-20). Dedup: partial unique index on `(budget_id) WHERE
kind='CUSHION_BELOW_TARGET' AND status='PENDING'` (D-PH7-21). Payload:
`{shortfall_cents, required_cents, actual_cents, currency, target_months}` (D-PH7-22). Action:
deep-link to `/budgets/<id>/wallets#cushion` (D-PH7-23). Helper `recompute-cushion-task.ts` in
`packages/budgeting/src/application/` encapsulates create-or-resolve logic (D-PH7-24).

**Banner UI:** Drop `disabled`/`aria-disabled`/`actionComingSoon` tooltip from `TaskBannerRow`;
wire `onClick` per kind (D-PH7-25). Wire Reserves Actions column from Phase 5 placeholder
(D-PH7-26). No dismiss button in v1.1 (D-PH7-27). Keep ASC `created_at` sort (D-PH7-28).
Rewrite `task-banner.feature` (D-PH7-29).

**Push deep-link URL contract (consumed Phase 8):** `/budgets/<id>/reserves?task=<id>`,
`/budgets/<id>/spendings?task=<id>&month=YYYY-MM`, `/budgets/<id>/wallets?task=<id>#cushion`
(D-PH7-30). Phase 7 lays contract; Phase 8 wires consumer (D-PH7-31).

**Settings:** `cushion_target_months` numeric field below master toggle, above mode toggle, hidden
when master off, with live shortfall preview line from `GET /budgets/:id/cushion-summary`
(D-PH7-32). Joins existing PATCH `/budgets/:id` payload (D-PH7-33).

**Onboarding:** Months field added below master toggle in existing cushion step — NOT a new step
(D-PH7-34).

**CategorySlider mirror:** `linked` state initialised from `initialCushion == null || initialCushion
=== initialPlanned`; planned change mirrors to cushion when linked; cushion change silently breaks
link. No chain icon (D-PH7-35, D-PH7-36). Cushion input hidden when `cushion_enabled = false` —
existing gating unchanged (D-PH7-37).

**Schema migration:** Drop `tasks_kind_chk`, recreate with
`kind IN ('RESERVE_TOPUP','CONFIRM_DRAFT','CUSHION_BELOW_TARGET')` (D-PH7-02).

**CHECK constraint migration:** Drop old 4-kind constraint, add new 3-kind constraint. Safe:
zero rows of `STALE_WALLET` or `MONTH_END_REVIEW` exist (D-PH7-01).

### Claude's Discretion

- Default value for `cushion_target_months` locked at 6 — no further discretion.
- `?task=<id>` query param vs `#task=<id>` hash fragment for push contract (D-PH7-30 chose query
  params; OK to switch to hash if planner finds it simpler).
- Exact i18n string copy for three task kinds — ICU placeholders must match payload fields.
- `recompute-cushion-task.ts` shape: one function or small module — call-site shape matters.
- Hourly defensive sweep location: `budgeting-reconciliation.ts` vs new handler (existing handler
  preferred to keep cron count down).
- E2E `task-banner.feature` final scenario list — rewrite required, scenarios at planner's
  discretion.

### Deferred Ideas (OUT OF SCOPE)

- `STALE_WALLET` reminder generator
- `MONTH_END_REVIEW` ritual nudge
- Dismiss/snooze controls on banner rows
- Push notification dispatch (VAPID + per-user prefs) — Phase 8
- Snooze semantics (`payload.snoozed_until`)
- Banner kind-priority sort
- Inline mini-modal for RESERVE_TOPUP / CUSHION_BELOW_TARGET
- Category-overspent, cushion-well-above-target, missing-investment-snapshot tasks — v1.2
- Banner row dismiss (`×` icon)
  </user_constraints>

<phase_requirements>

## Phase Requirements

| ID      | Description                                                                                                                            | Research Support                                                                                                                                                                                                 |
| ------- | -------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TASK-01 | Tasks table with id, tenant_id, budget_id, kind enum, payload_json, status enum (PENDING/RESOLVED), created_at, resolved_at            | Table exists from Phase 3 (verified: `tasks-schema.ts`). Phase 7 adds migration 0026 for `cushion_target_months` column + kind constraint update.                                                                |
| TASK-02 | `RESERVE_TOPUP` fires when `Σ(category reserve balances) ≠ Σ(reserve-type wallet amounts)`; payload includes diff amount and direction | Honored under 3-kind rescope. Math sourced from existing `reserves-summary-builder.ts` `mismatchCents`. Generator wires into `set-wallet-balance.ts` etc.                                                        |
| TASK-03 | `CONFIRM_DRAFT` fires when recurring rule materializes a pending-draft                                                                 | Honored. Emission point: `recurring-engine.ts` worker handler. Payload fields specified in D-PH7-12.                                                                                                             |
| TASK-04 | `STALE_WALLET` fires when wallet `updated_at` exceeds N days                                                                           | **DROPPED by CONTEXT.md rescope** — no implementation in Phase 7. REQUIREMENTS.md text must be updated to remove TASK-04. Planner to mark as out-of-scope and update the REQUIREMENTS.md and ROADMAP.md wording. |
| TASK-05 | `MONTH_END_REVIEW` fires on month rollover                                                                                             | **DROPPED by CONTEXT.md rescope** — same as TASK-04. Planner to update docs.                                                                                                                                     |
| TASK-06 | Tasks auto-resolve when underlying state corrects                                                                                      | Honored. Auto-resolve hooks in `confirm-recurring-draft.ts`, wallet mutations, reserve adjustments. `CUSHION_BELOW_TARGET` resolves via `recompute-cushion-task.ts` helper.                                      |
| TASK-07 | Task banner shows count chip; click expands inline list with kind-specific primary action button                                       | Honored. Phase 3 shell works; Phase 7 enables action buttons per kind (D-PH7-25).                                                                                                                                |
| TASK-08 | Task list items show i18n title with ICU placeholders                                                                                  | Honored. `bdp.tasks.title.<KIND>` i18n keys; payload fields supply ICU placeholders. All three locales (EN/PL/UK) required at landing.                                                                           |

</phase_requirements>

---

## Summary

Phase 7 activates the Tasks queue that Phase 3 stubbed as a read-only shell. Three generators
write to `budgeting.tasks`, auto-resolve hooks clear rows when state corrects, and the `TaskBannerRow`
action buttons come alive per kind.

The substrate is solid. `budgeting-reconciliation.ts` (hourly cron host), `recurring-engine-fx.ts`
(FX cache + bounds check), `withTenantTx`/`writeOutbox` patterns, the `reserves-summary-builder.ts`
shape function, and the `tasks` table with RLS all exist and work. Phase 7 is an extension phase,
not a greenfield phase — the primary risk is wiring correctness (wrong mutation paths missed for
inline hooks) rather than unknown architecture.

Two REQUIREMENTS.md entries (TASK-04 `STALE_WALLET`, TASK-05 `MONTH_END_REVIEW`) are out of scope
per CONTEXT.md rescope. The plan must update REQUIREMENTS.md and ROADMAP.md wording to remove them
and add `CUSHION_BELOW_TARGET` as TASK-09 (or update TASK-04/05 in-place to the new kind).

**Primary recommendation:** Plan in three generator waves (CONFIRM_DRAFT first — simplest,
zero FX, existing mutation path; RESERVE_TOPUP second — math already exists; CUSHION_BELOW_TARGET
third — new column + FX conversion + new endpoint), then banner UI enablement, then Settings/
Onboarding/CategorySlider additions, then E2E rewrite.

---

## Architectural Responsibility Map

| Capability                                | Primary Tier                          | Secondary Tier        | Rationale                                                                         |
| ----------------------------------------- | ------------------------------------- | --------------------- | --------------------------------------------------------------------------------- |
| Generator emission (CONFIRM_DRAFT)        | API/Worker (recurring-engine handler) | —                     | Inline in the same `withTenantTx` that INSERTs the draft row                      |
| Generator emission (RESERVE_TOPUP)        | API (use-case post-write)             | Worker (hourly sweep) | Inline in every mutation that changes reserve wallet pool; sweep catches FX drift |
| Generator emission (CUSHION_BELOW_TARGET) | API (use-case post-write)             | Worker (hourly sweep) | Inline in every mutation that changes cushion math; sweep catches FX drift        |
| Auto-resolve (CONFIRM_DRAFT)              | API (use-case)                        | —                     | Same tx as `SET confirmed_at = now()` in `confirm-recurring-draft.ts`             |
| Auto-resolve (RESERVE_TOPUP)              | API (use-case)                        | Worker (sweep)        | Inline in reserve/wallet mutation use cases                                       |
| Auto-resolve (CUSHION_BELOW_TARGET)       | API (`recompute-cushion-task.ts`)     | Worker (sweep)        | Shared helper called by every relevant mutation                                   |
| Cushion math endpoint                     | API Backend                           | —                     | `GET /budgets/:id/cushion-summary` — server-side FX conversion                    |
| FX conversion for cushion wallets         | API (FxProvider port)                 | —                     | `recurring-engine-fx.ts` pattern; never in browser                                |
| Banner action routing                     | Browser/Client                        | —                     | `router.push` for deep-links; `clientApiFetch` for inline confirm                 |
| Task list polling                         | Browser/Client                        | —                     | Phase 3's 60s poll + visibility invalidation already works                        |
| i18n strings (3 locales)                  | Frontend Server (bundled)             | —                     | next-intl at build time                                                           |
| Task kind constraint migration            | Database                              | —                     | Drop + recreate `tasks_kind_chk`; add `cushion_target_months` column              |

---

## Standard Stack

### Core (all verified — exists in repo)

| Library             | Version | Purpose                                                                            | Why Standard                                                           |
| ------------------- | ------- | ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| pg-boss             | v10     | Job queue; hourly cron host                                                        | Already powers `budgeting-reconciliation.ts` and `recurring-engine.ts` |
| Drizzle ORM         | latest  | Schema definition, RLS policies, `withTenantTx`                                    | Project standard; hexagonal boundary enforced by dep-cruiser           |
| Hono v4             | v4.12+  | New route `GET /budgets/:id/cushion-summary`; extend tasks route with POST resolve | Project API standard                                                   |
| Zod v3              | v3      | Input validation on new routes/schemas                                             | Project standard                                                       |
| `temporal-polyfill` | current | Date arithmetic in defensive sweep                                                 | Already in `budgeting-reconciliation.ts`                               |
| `big.js`            | current | Decimal arithmetic for FX conversion in cushion math                               | Already used in `set-wallet-balance.ts`                                |
| next-intl           | current | i18n keys for new task titles/CTAs                                                 | Already provides `bdp.tasks.*` namespace                               |
| react-hook-form     | current | CategorySlider uses it; mirror behavior added via `watch`/`setValue`               | Already in `category-slider.tsx`                                       |

### Supporting

| Library                  | Version | Purpose                                           | When to Use                                  |
| ------------------------ | ------- | ------------------------------------------------- | -------------------------------------------- |
| `writeOutbox` (platform) | —       | Emit `task.created` outbox event for Phase 8 push | Every generator emit path                    |
| `writeAudit` (platform)  | —       | Audit trail on resolve writes                     | `task-repo.ts` resolve method                |
| `withInfraTx` (platform) | —       | Tenant-scan in hourly sweep (no RLS)              | `budgeting-reconciliation.ts` extended sweep |

### Alternatives Considered

| Instead of                 | Could Use                        | Tradeoff                                                             |
| -------------------------- | -------------------------------- | -------------------------------------------------------------------- |
| Inline emit + hourly sweep | Pure cron-only                   | Pure cron has 60-min lag; inline is instant; sweep catches drift     |
| Inline emit + hourly sweep | Event-bus-only (outbox consumer) | Phase 8 wires consumer; Phase 7 cannot depend on it                  |
| Partial unique index dedup | Application-layer lock           | DB-enforced dedup is simpler and race-free under concurrent requests |

---

## Architecture Patterns

### System Architecture Diagram

```
Mutation use-case (e.g. set-wallet-balance)
  └─ withTenantTx
       ├─ [domain write]
       ├─ recompute-cushion-task.ts  ──→ INSERT INTO tasks (ON CONFLICT DO NOTHING)
       │                             ──→ UPDATE tasks SET status='RESOLVED'
       └─ writeOutbox(task.created)

recurring-engine.ts (worker, pg-boss)
  └─ withTenantTx (per tenant, per rule)
       ├─ INSERT INTO expense_ledger (draft)  ─ ON CONFLICT DO NOTHING
       └─ (if row returned) INSERT INTO tasks (CONFIRM_DRAFT, ON CONFLICT DO NOTHING)

budgeting-reconciliation.ts (worker, hourly cron)
  └─ withInfraTx ──→ SELECT DISTINCT tenant_id FROM budgeting.wallets
       └─ per-tenant: withTenantTx(SYSTEM_USER)
            ├─ existing: reconcileProjections
            ├─ NEW: sweep RESERVE_TOPUP (compare mismatch → emit or resolve)
            └─ NEW: sweep CUSHION_BELOW_TARGET (compare shortfall → emit or resolve)

GET /budgets/:id/cushion-summary  (new Hono route)
  └─ application service
       ├─ SELECT Σ(category_limits.cushion_amount × cushion_target_months)  → required_cents
       ├─ SELECT Σ(wallets.amount WHERE wallet_type='CUSHION')  → raw amounts
       ├─ FxProvider.rateAsOf for non-budget-currency wallets  → actual_cents
       └─ return {required_cents, actual_cents, shortfall_cents, currency, enabled, target_months}

TaskBannerRow (client component)
  RESERVE_TOPUP    → router.push('/budgets/<id>/reserves?task=<id>')
  CONFIRM_DRAFT    → clientApiFetch POST /confirm  → banner row collapses
  CUSHION_BELOW_TARGET → router.push('/budgets/<id>/wallets?task=<id>#cushion')
```

### Recommended Project Structure

```
packages/budgeting/src/
├── application/
│   ├── recompute-cushion-task.ts        # NEW — shared helper for CUSHION_BELOW_TARGET
│   ├── get-cushion-summary.ts           # NEW — application service for /cushion-summary
│   ├── resolve-task.ts                  # NEW — application service wrapping TaskRepo.resolve
│   ├── confirm-recurring-draft.ts       # EXTEND — add CONFIRM_DRAFT resolve hook
│   ├── dismiss-draft.ts                 # EXTEND — add CONFIRM_DRAFT resolve hook
│   ├── skip-recurring-draft.ts          # EXTEND — add CONFIRM_DRAFT resolve hook
│   ├── set-wallet-balance.ts            # EXTEND — add RESERVE_TOPUP + CUSHION inline hooks
│   ├── update-wallet.ts                 # EXTEND — same
│   ├── create-wallet.ts                 # EXTEND — CUSHION hook only
│   ├── archive-wallet.ts                # EXTEND — CUSHION hook only
│   ├── adjust-category-reserve.ts       # EXTEND — RESERVE_TOPUP hook only
│   └── set-category-limit.ts            # EXTEND — CUSHION hook only
├── ports/
│   └── task-repo.ts                     # EXTEND — add resolve(), emitReserveTopup(),
│                                        #          emitConfirmDraft(), recomputeCushionTask()
└── adapters/persistence/
    ├── task-repo.ts                     # EXTEND — implement new port methods
    └── tasks-schema.ts                  # EXTEND — update kind CHECK constraint

apps/api/src/routes/
├── tasks.ts                             # EXTEND — add POST /resolve
└── budgets.ts / cushion.ts             # EXTEND or NEW — GET /budgets/:id/cushion-summary

apps/worker/src/handlers/
├── budgeting-reconciliation.ts          # EXTEND — add RESERVE_TOPUP + CUSHION sweeps
└── recurring-engine.ts                  # EXTEND — emit CONFIRM_DRAFT inline

apps/web/src/components/
├── budgeting/
│   ├── task-banner-row.tsx              # MODIFY — enable action buttons per kind
│   ├── category-slider.tsx              # MODIFY — linked-mirror state
│   └── reserves-tab/reserves-table-row.tsx  # MODIFY — wire Actions column
└── settings/
    └── cushion-section.tsx              # MODIFY — add months field + live preview

drizzle/
└── 0026_phase07_tasks_cushion_months.sql  # NEW — migration
```

### Pattern 1: Dedup-safe emit with ON CONFLICT DO NOTHING

```typescript
// Source: D-PH7-05 (verified pattern in recurring-engine.ts for drafts)
// Partial unique index in migration:
// CREATE UNIQUE INDEX tasks_reserve_topup_pending_idx
//   ON budgeting.tasks(budget_id)
//   WHERE kind='RESERVE_TOPUP' AND status='PENDING';

await drizzleTx.execute(sql`
  INSERT INTO budgeting.tasks
    (id, tenant_id, budget_id, kind, payload_json, status, created_at)
  VALUES
    (gen_random_uuid(), ${tenantId}::uuid, ${budgetId}::uuid,
     'RESERVE_TOPUP', ${JSON.stringify(payload)}::jsonb, 'PENDING', now())
  ON CONFLICT DO NOTHING
`);
```

### Pattern 2: Idempotent resolve

```typescript
// Source: D-PH7-09 (verified pattern — mirrors audit UPDATE in confirm-recurring-draft.ts)
await drizzleTx.execute(sql`
  UPDATE budgeting.tasks
     SET status = 'RESOLVED', resolved_at = now()
   WHERE budget_id = ${budgetId}::uuid
     AND tenant_id = ${tenantId}::uuid
     AND kind = 'CONFIRM_DRAFT'
     AND payload_json->>'draft_id' = ${draftId}
     AND status = 'PENDING'
`);
// No error if 0 rows updated — idempotent by design.
```

### Pattern 3: recompute-cushion-task.ts shape

```typescript
// Source: D-PH7-24
// Called by every mutation that can change cushion shortfall.
export async function recomputeCushionTask(
  tx: TenantTx,
  input: { tenantId: string; budgetId: string; fxProvider: FxProviderLike },
): Promise<void> {
  const summary = await computeCushionSummary(tx, input); // same math as /cushion-summary
  const shortfall = summary.required_cents - summary.actual_cents;
  if (!summary.enabled || shortfall <= 0n) {
    // resolve any open task
    await resolveCushionTask(tx, input.tenantId, input.budgetId);
  } else {
    // emit (ON CONFLICT DO NOTHING keeps dedup safe)
    await emitCushionTask(tx, input.tenantId, input.budgetId, summary);
  }
}
```

### Pattern 4: CONFIRM_DRAFT emission in recurring-engine.ts

```typescript
// Source: D-PH7-08 — mirrors existing ON CONFLICT DO NOTHING for draft INSERT
// After the draft INSERT (which uses ON CONFLICT DO NOTHING):
const inserted = draftResult.rows[0]; // returns the row only if it was freshly inserted
if (inserted) {
  await drizzleTx.execute(sql`
    INSERT INTO budgeting.tasks (...)
    VALUES (..., 'CONFIRM_DRAFT', ${JSON.stringify({
      draft_id: inserted.id,
      rule_name: rule.name,
      amount_cents: inserted.amount_original_cents,
      currency: inserted.currency_original,
      transaction_date: inserted.transaction_date,
      category_id: inserted.category_id,
    })}::jsonb, 'PENDING', now())
    ON CONFLICT DO NOTHING
  `);
}
```

### Pattern 5: TaskBannerRow per-kind action wiring

```typescript
// Source: D-PH7-25 — replaces disabled button
"use client";
import { useRouter } from "next/navigation";

export function TaskBannerRow({ task, budgetId }: TaskBannerRowProps) {
  const router = useRouter();

  function handleAction() {
    switch (task.kind) {
      case "RESERVE_TOPUP":
        router.push(`/budgets/${budgetId}/reserves?task=${task.id}`);
        break;
      case "CUSHION_BELOW_TARGET":
        router.push(`/budgets/${budgetId}/wallets?task=${task.id}#cushion`);
        break;
      case "CONFIRM_DRAFT":
        // inline mutation via clientApiFetch — collapses row on success
        handleConfirmDraft(task);
        break;
    }
  }

  return (
    // ... existing DOM shape unchanged ...
    <Button variant="primary" size="sm" onClick={handleAction}>
      {t(actionKey)}
    </Button>
  );
}
```

### Pattern 6: CategorySlider linked-mirror state

```typescript
// Source: D-PH7-35 — react-hook-form already in category-slider.tsx
// Add alongside existing useForm:
const [linked, setLinked] = useState(
  initialCushion == null || initialCushion === initialPlanned,
);

// In planned field onChange handler:
const handlePlannedChange = (val: string) => {
  form.setValue("plannedCents", val);
  if (linked) {
    form.setValue("cushionCents", val); // silent mirror in same React batch
  }
};

// In cushion field onChange handler:
const handleCushionChange = (val: string) => {
  form.setValue("cushionCents", val);
  setLinked(false); // silent break — no UI affordance
};

// On slider open: linked re-initialized from incoming prop values (auto-relink)
```

### Anti-Patterns to Avoid

- **Emitting tasks outside `withTenantTx`:** Every emit and resolve must be inside the same
  `withTenantTx` as the triggering domain write. Never emit from a separate async callback after
  the tx commits — race conditions and missed rows.
- **SQL duplication of cushion math:** The `/cushion-summary` endpoint is the single source.
  The generator and the Settings preview both call `computeCushionSummary()` from the same
  application-layer function. Never inline the Σ query in two places.
- **Conditional `ON CONFLICT` on TaskKind:** The partial unique indexes are per-kind. Do NOT use
  a single index across all kinds — a budget can have one pending RESERVE_TOPUP AND one pending
  CUSHION_BELOW_TARGET simultaneously.
- **Using `cushion_mode_enabled` to gate tasks:** Only `cushion_enabled` (master) gates task
  lifecycle. The mode flag changes grid header text only.
- **`TaskBannerRow` receiving raw payload in DOM:** Phase 3 established the rule: only
  `task.kind` (enum-bounded) and i18n keys flow to the DOM. Payload fields (e.g., `shortfall_cents`)
  must be formatted via i18n interpolation, not rendered as raw strings.
- **Float arithmetic for cushion math:** Use `bigint` cents throughout `recompute-cushion-task.ts`.
  FX conversion via `Math.round(Number(cents) * rate)` as in `recurring-engine-fx.ts`.

---

## Don't Hand-Roll

| Problem                              | Don't Build                    | Use Instead                                                                   | Why                                                                                    |
| ------------------------------------ | ------------------------------ | ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| FX conversion for cushion wallets    | Custom rate-fetch + cache      | `recurring-engine-fx.ts` `computeRecurringFx` pattern + `FxProvider` port     | Bounds check (`0 < rate < 1e6`), `isStale` guard, and 60-min freshness already tested  |
| Task dedup under concurrent requests | Application-level locking      | Partial unique index + `ON CONFLICT DO NOTHING`                               | DB-enforced; no lock contention; exact same pattern as recurring-engine.ts draft dedup |
| Reserves mismatch calculation        | Inline SQL                     | `reserves-summary-builder.ts` + `GET /budgets/:id/reserves` `totals.mismatch` | Phase 5 already tested and audited this math                                           |
| Hourly sweep scheduling              | New pg-boss `schedule()` entry | Extend existing `budgeting-reconciliation.ts`                                 | Saves a cron registration; sweep is already per-tenant `withTenantTx`                  |
| Tenant isolation on resolve route    | Manual tenant check            | `tenantIds.includes(budgetId)` guard (existing pattern in tasks.ts)           | Defense-in-depth already tested in tenant-leak gate                                    |
| i18n for task titles                 | Inline string concat           | `bdp.tasks.title.<KIND>` + `bdp.tasks.action.<KIND>.label` namespace          | Phase 3 locked the key shape; `useTranslations()` already wired in `TaskBannerRow`     |

---

## Common Pitfalls

### Pitfall 1: Missing mutation sites for inline hooks

**What goes wrong:** A wallet rename or type change (not just balance change) goes through
`update-wallet.ts`. If the CUSHION hook only patches `set-wallet-balance.ts` but not `update-wallet.ts`,
cushion wallet type changes (e.g., SPENDINGS → CUSHION) silently fail to emit/resolve the task.

**Why it happens:** `update-wallet.ts` is a separate use case from `set-wallet-balance.ts`.
D-PH7-19 lists both explicitly.

**How to avoid:** The plan must list every use case file from D-PH7-19 as a separate task action.
Do not collapse them.

**Warning signs:** Unit test passes for `set-wallet-balance` hook but task fails to appear after
changing a wallet's type from SPENDINGS to CUSHION via the Wallets tab.

### Pitfall 2: CONFIRM_DRAFT dedup index targets expression, not column

**What goes wrong:** The partial unique index for CONFIRM_DRAFT dedup is on
`((payload_json->>'draft_id'))` — a jsonb expression index, not a column index. Drizzle's
`index()` builder may not support expression indexes; a hand-authored migration is required
(same precedent as migrations 0012, 0024).

**Why it happens:** Drizzle-kit has known limitations with complex expression indexes (same class
of bug as BigInt serialization in migration 0024).

**How to avoid:** Hand-author migration SQL for both partial unique indexes. Do not attempt
`drizzle-kit generate` for these constraints.

**Warning signs:** `drizzle-kit generate` produces a migration without the expression index, or
errors on the jsonb operator.

### Pitfall 3: `recurring-engine.ts` ON CONFLICT return detection

**What goes wrong:** PostgreSQL `INSERT ... ON CONFLICT DO NOTHING` returns 0 rows in `rows`
when the row was NOT inserted (conflict). The recurring-engine draft insert uses this to detect
"freshly inserted" vs "already existed." If the CONFIRM_DRAFT emit checks the wrong signal (e.g.,
catches exceptions instead of checking `rows.length`), it either double-emits or never emits.

**Why it happens:** The current `recurring-engine.ts` uses the Drizzle raw `execute()` interface.
`rows` array is empty on conflict, non-empty on insert.

**How to avoid:** Check `draftResult.rows.length > 0` to gate the CONFIRM_DRAFT emission. Match
the exact pattern already in the worker's recurring-engine.ts.

**Warning signs:** Integration test shows CONFIRM_DRAFT task created even when recurring draft
already existed for that rule+date combination.

### Pitfall 4: cushion_target_months migration must precede dependent code

**What goes wrong:** `recompute-cushion-task.ts` SELECTs `cushion_target_months` from
`tenancy.budgets`. If migration 0026 isn't applied before the worker or API starts, the column
doesn't exist and all cushion math throws a Postgres error.

**Why it happens:** Wave ordering matters — schema-first is the project rule (matches Phase 1–6
precedent).

**How to avoid:** Migration must be Wave 0 (first plan in the phase). Application code that reads
`cushion_target_months` must be in a later wave.

**Warning signs:** API crashes with `column "cushion_target_months" does not exist` after deploying
code without running migration.

### Pitfall 5: FX rate as-of-date for cushion summary

**What goes wrong:** Cushion wallets can be in any currency (D-PH5-W12 free-currency). The
summary endpoint converts all amounts to `budget.currency`. Using `new Date()` (current time)
for the FX as-of date is correct for this endpoint (unlike transaction-date-pinned FX in
`recurring-engine-fx.ts`). Using the wrong as-of date produces incorrect shortfall.

**Why it happens:** `computeRecurringFx` takes `dueDateStr` as the as-of date. For cushion
summary, the correct as-of is today (not a transaction date).

**How to avoid:** Pass `Temporal.Now.plainDateISO().toString()` as the as-of date in the cushion
summary computation. Document the deviation from recurring-engine convention.

### Pitfall 6: category-slider uses react-hook-form, not raw useState

**What goes wrong:** D-PH7-35 specifies `useState` for `linked` but `plannedCents`/`cushionCents`
are `react-hook-form` fields. Calling `setCushion(newPlanned)` (raw state) won't update the form
submission value. Must use `form.setValue("cushionCents", newPlanned)`.

**Why it happens:** D-PH7-35 pseudocode mixes `useState` and form patterns. The actual slider
uses `react-hook-form` exclusively for field values.

**How to avoid:** `linked` is plain `useState` (not a form field). Field values are updated via
`form.setValue`. Watch planned field changes with `form.watch("plannedCents")` or `onChange` prop.

**Warning signs:** Cushion field visually mirrors but submit sends the old (un-mirrored) value.

---

## Code Examples

### Migration 0026 — hand-authored (precedent: 0024)

```sql
-- Phase 7: Tasks queue — kind constraint update + cushion_target_months

-- Step 1: Drop old kind constraint (safe — 0 rows of STALE_WALLET/MONTH_END_REVIEW exist)
ALTER TABLE budgeting.tasks DROP CONSTRAINT IF EXISTS tasks_kind_chk;

-- Step 2: Add new 3-kind constraint
ALTER TABLE budgeting.tasks
  ADD CONSTRAINT tasks_kind_chk
  CHECK (kind IN ('RESERVE_TOPUP','CONFIRM_DRAFT','CUSHION_BELOW_TARGET'));

-- Step 3: New column on tenancy.budgets
ALTER TABLE tenancy.budgets
  ADD COLUMN IF NOT EXISTS cushion_target_months INTEGER NOT NULL DEFAULT 6
  CHECK (cushion_target_months > 0 AND cushion_target_months <= 60);

-- Step 4: Partial unique indexes for dedup
CREATE UNIQUE INDEX IF NOT EXISTS tasks_reserve_topup_pending_uq
  ON budgeting.tasks(budget_id)
  WHERE kind = 'RESERVE_TOPUP' AND status = 'PENDING';

CREATE UNIQUE INDEX IF NOT EXISTS tasks_cushion_below_target_pending_uq
  ON budgeting.tasks(budget_id)
  WHERE kind = 'CUSHION_BELOW_TARGET' AND status = 'PENDING';

-- Expression index — must be hand-authored (Drizzle-kit limitation)
CREATE UNIQUE INDEX IF NOT EXISTS tasks_confirm_draft_pending_uq
  ON budgeting.tasks((payload_json->>'draft_id'))
  WHERE kind = 'CONFIRM_DRAFT' AND status = 'PENDING';
```

### TaskRepo port extension

```typescript
// Source: D-PH7-09, verified against existing port shape in task-repo.ts
export interface TaskRepo {
  listPending(budgetId: string, tenantId: string): Promise<TaskSummary[]>;

  // NEW in Phase 7:
  resolve(taskId: string, tenantId: string, tx?: TenantTx): Promise<void>;

  emitReserveTopup(
    tenantId: string,
    budgetId: string,
    payload: ReserveTopupPayload,
    tx: TenantTx,
  ): Promise<void>;

  emitConfirmDraft(
    tenantId: string,
    budgetId: string,
    payload: ConfirmDraftPayload,
    tx: TenantTx,
  ): Promise<void>;

  resolveByKindAndBudget(
    tenantId: string,
    budgetId: string,
    kind: TaskKind,
    tx: TenantTx,
  ): Promise<void>;

  resolveConfirmDraftByDraftId(
    tenantId: string,
    draftId: string,
    tx: TenantTx,
  ): Promise<void>;
}
```

### PATCHB budget schema extension (budget-identity.ts)

```typescript
// Source: Verified — existing patchBudgetSchema in budget-identity.ts
// Add cushion_target_months to existing z.object:
const patchBudgetSchema = z.object({
  name: z.string().min(1).max(80).optional(),
  default_currency: z
    .string()
    .length(3)
    .regex(/^[A-Z]{3}$/)
    .optional(),
  cushion_mode_enabled: z.boolean().optional(),
  reserves_enabled: z.boolean().optional(),
  cushion_enabled: z.boolean().optional(),
  // NEW Phase 7:
  cushion_target_months: z.number().int().min(1).max(60).optional(),
});
```

---

## State of the Art

| Old Approach                                            | Current Approach              | When Changed           | Impact                                                                           |
| ------------------------------------------------------- | ----------------------------- | ---------------------- | -------------------------------------------------------------------------------- |
| 4-kind set (ROADMAP)                                    | 3-kind set per CONTEXT.md     | 2026-05-30 rescope     | TASK-04/TASK-05 out of scope; planner must update REQUIREMENTS.md and ROADMAP.md |
| TaskBannerRow action buttons disabled                   | Enabled per kind              | Phase 7                | D-PH7-25; DOM shape unchanged, only `disabled` + tooltip removed                 |
| task-repo.ts read-only                                  | Read + write (resolve, emit)  | Phase 7                | Port and adapter both extend                                                     |
| `tasks_kind_chk` includes STALE_WALLET/MONTH_END_REVIEW | Drops to 3-kind               | Phase 7 migration 0026 | Safe: zero rows of dropped kinds exist                                           |
| `cushion_target_months` absent from schema              | Added with NOT NULL DEFAULT 6 | Phase 7 migration 0026 | Required before any generator or Settings UI work                                |

**Deprecated/outdated:**

- `STALE_WALLET` in `TaskKind` type union in `task-repo.ts` and `task-banner-row.tsx` — remove from TypeScript types in Phase 7.
- `MONTH_END_REVIEW` same — remove from TypeScript types.
- `bdp.tasks.actionComingSoon` i18n key — remove from `task-banner-row.tsx` and message catalogs.

---

## Assumptions Log

| #   | Claim                                                                                                                                                            | Section                | Risk if Wrong                                                                                                                                                                                                                        |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| A1  | `recurring-engine.ts` worker handler returns `rows` from the draft INSERT via `drizzleTx.execute()`, allowing `rows.length > 0` detection for "freshly inserted" | Generator patterns     | If the worker uses a different INSERT path (e.g., Drizzle ORM `insert().returning()`), CONFIRM_DRAFT emission logic needs different detection. Verify by reading `apps/worker/src/handlers/recurring-engine.ts` before implementing. |
| A2  | `dismiss-draft.ts` and `skip-recurring-draft.ts` use `withTenantTx` and accept a tx parameter that can carry the resolve UPDATE                                  | Auto-resolve hooks     | If these use-cases do not accept an injected tx, the resolve hook needs a new `withTenantTx` call (adds a separate transaction — acceptable but not optimal).                                                                        |
| A3  | The `budgeting-reconciliation.ts` hourly cron already iterates all tenants from `budgeting.wallets` — cushion sweep can reuse the same tenant list               | Hourly sweep extension | Safe assumption given current code reads `SELECT DISTINCT tenant_id FROM budgeting.wallets`. Cushion wallets are in `budgeting.wallets`, so the set is correct.                                                                      |

---

## Open Questions

1. **`recurring-engine.ts` worker INSERT return detection**
   - What we know: `recurring-engine.ts` (worker handler, 8.8K) uses raw SQL execute for drafts.
   - What's unclear: exact return shape of the ON CONFLICT DO NOTHING INSERT.
   - Recommendation: Planner should read `apps/worker/src/handlers/recurring-engine.ts` lines
     around the draft INSERT before writing the CONFIRM_DRAFT emission task action.

2. **`GET /budgets/:id/cushion-summary` route placement**
   - What we know: CONTEXT.md says "placement in `apps/api/src/routes/budgets.ts` or its own
     `apps/api/src/routes/cushion.ts` is at planner's discretion."
   - What's unclear: whether `budgets.ts` is already large enough to warrant extraction.
   - Recommendation: Add to `budgets.ts` via a sub-router factory (same pattern as
     `budgetIdentityRoutesFactory`) for consistency.

3. **Reserves Actions column wiring (D-PH7-26)**
   - What we know: `reserves-table-row.tsx` has a Phase 5 placeholder Actions column.
   - What's unclear: exact prop shape of the placeholder and what "actionable MoreHorizontal /
     lucide icon" means in the Phase 5 component.
   - Recommendation: Planner should read
     `apps/web/src/components/budgeting/reserves-tab/reserves-table-row.tsx` and the Phase 5
     context (`05-CONTEXT.md` D-PH5-R6) before writing the Actions column task.

---

## Environment Availability

Step 2.6: SKIPPED (no new external dependencies — all tools and services already in use by Phases
2–6; phase is purely code/schema extension).

---

## Validation Architecture

### Test Framework

| Property             | Value                                                                                                  |
| -------------------- | ------------------------------------------------------------------------------------------------------ |
| Framework (backend)  | bun:test                                                                                               |
| Framework (frontend) | Vitest 4 + happy-dom                                                                                   |
| Framework (E2E)      | Playwright + playwright-bdd (Gherkin)                                                                  |
| Config file          | `bunfig.toml` (backend), `apps/web/vitest.config.ts` (frontend), `apps/web/playwright.config.ts` (E2E) |
| Quick run (backend)  | `make test`                                                                                            |
| Quick run (frontend) | `cd apps/web && bun run test`                                                                          |
| Full suite           | `make test && cd apps/web && bun run test && make test-e2e`                                            |

### Phase Requirements → Test Map

| Req ID   | Behavior                                                                                               | Test Type                                      | Automated Command                                                    | File Exists?                              |
| -------- | ------------------------------------------------------------------------------------------------------ | ---------------------------------------------- | -------------------------------------------------------------------- | ----------------------------------------- |
| TASK-01  | tasks table + kind constraint + cushion_target_months column                                           | Integration (migration)                        | `make test`                                                          | ❌ Wave 0 — new migration test            |
| TASK-02  | RESERVE_TOPUP emits on mismatch; resolves on fix; dedup prevents double                                | Unit (generator math) + Integration (route+DB) | `bun test packages/budgeting/test/tasks/reserve-topup.test.ts`       | ❌ Wave 0                                 |
| TASK-03  | CONFIRM_DRAFT emits on draft INSERT; resolves on confirm/dismiss/skip                                  | Unit + Integration                             | `bun test packages/budgeting/test/tasks/confirm-draft.test.ts`       | ❌ Wave 0                                 |
| TASK-06  | Auto-resolve idempotent; resolve-when-already-resolved is no-op                                        | Unit                                           | `bun test packages/budgeting/test/tasks/resolve-idempotency.test.ts` | ❌ Wave 0                                 |
| TASK-07  | Banner action buttons enabled; kind-specific routing                                                   | Component (Vitest+RTL)                         | `cd apps/web && bun run test -- task-banner-row`                     | ❌ Wave 0                                 |
| TASK-08  | i18n title keys present in EN/PL/UK for all 3 kinds                                                    | Component (Vitest+RTL)                         | `cd apps/web && bun run test -- task-banner-row`                     | ❌ Wave 0                                 |
| D-PH7-16 | Cushion math: required = Σ(cushion × months), actual = FX-converted wallets                            | Unit (pure function)                           | `bun test packages/budgeting/test/tasks/cushion-math.test.ts`        | ❌ Wave 0                                 |
| D-PH7-35 | CategorySlider mirror: planned change mirrors cushion when linked; cushion change breaks link silently | Component (Vitest+RTL)                         | `cd apps/web && bun run test -- category-slider`                     | ✅ (file exists; new test cases needed)   |
| D-PH7-32 | Settings cushion_target_months field + live preview                                                    | Component (Vitest+RTL)                         | `cd apps/web && bun run test -- cushion-section`                     | ✅ (file exists; new test cases needed)   |
| E2E      | Task appears → user acts → task disappears per kind (golden path)                                      | E2E (playwright-bdd)                           | `make test-e2e`                                                      | ✅ task-banner.feature (rewrite required) |

### Minimum Test Cases per Kind (Nyquist)

**RESERVE_TOPUP:**

1. Emit when mismatch > 0 after wallet balance change
2. No emit when mismatch = 0
3. Dedup: second mismatch does not create second task (ON CONFLICT DO NOTHING)
4. Resolve when mismatch corrected by reserve adjustment
5. Hourly sweep emits when inline path was missed (FX drift simulation)
6. Direction field: TOPUP when wallets < reserves; WITHDRAW when wallets > reserves

**CONFIRM_DRAFT:**

1. Emit on fresh draft INSERT (recurring-engine handler)
2. No emit on conflict (draft already existed for that rule+date)
3. Resolve on `confirmRecurringDraft`
4. Resolve on `dismissDraft`
5. Resolve on `skipRecurringDraft`
6. Dedup: two rapid confirms do not throw (idempotent resolve)

**CUSHION_BELOW_TARGET:**

1. No emit when `cushion_enabled = false`
2. Emit when `cushion_enabled = true AND shortfall > 0`
3. No emit when shortfall = 0 (actual ≥ required)
4. Resolve when `cushion_enabled` toggled off
5. Resolve when shortfall eliminated by adding cushion wallet
6. FX rate variance: wallet in non-budget currency converts correctly
7. Empty cushion wallets: actual = 0, shortfall = full required amount
8. `cushion_target_months` change triggers recompute
9. Category cushion change triggers recompute

### Tenant-Leak Gate Extensions

New routes requiring tenant-leak tests:

- `POST /budgets/:id/tasks/:taskId/resolve` → extend `tasks-cross-tenant.test.ts`
- `GET /budgets/:id/cushion-summary` → add `cushion-summary-cross-tenant.test.ts`

Current gate count: 7 files (`tasks-cross-tenant.test.ts` etc.). Phase 7 adds 1–2 files → 8–9.

### Wave 0 Gaps

- [ ] `packages/budgeting/test/tasks/reserve-topup.test.ts` — REQ TASK-02
- [ ] `packages/budgeting/test/tasks/confirm-draft.test.ts` — REQ TASK-03
- [ ] `packages/budgeting/test/tasks/cushion-math.test.ts` — REQ D-PH7-16
- [ ] `packages/budgeting/test/tasks/resolve-idempotency.test.ts` — REQ TASK-06
- [ ] `tests/tenant-leak/cushion-summary-cross-tenant.test.ts` — new route tenant-leak
- [ ] Migration integration test for `cushion_target_months` column existence
- [ ] Rewrite `apps/web/e2e/features/task-banner.feature` — D-PH7-29 (existing file, rewrite)

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category         | Applies       | Standard Control                                                                                |
| --------------------- | ------------- | ----------------------------------------------------------------------------------------------- |
| V2 Authentication     | yes           | Better Auth session on all new routes — existing middleware                                     |
| V3 Session Management | no (existing) | —                                                                                               |
| V4 Access Control     | yes           | `tenantIds.includes(budgetId)` guard on resolve route + cushion-summary route; RLS second layer |
| V5 Input Validation   | yes           | `zValidator` on POST resolve body (taskId); Zod on PATCH `cushion_target_months` (int, 1–60)    |
| V6 Cryptography       | no            | No new crypto surfaces                                                                          |

### Known Threat Patterns for This Stack

| Pattern                                                                            | STRIDE                 | Standard Mitigation                                                                                                                                                                    |
| ---------------------------------------------------------------------------------- | ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cross-tenant task resolve (user resolves another tenant's task via crafted taskId) | Elevation of Privilege | Route: `tenantIds.includes(budgetId)` → 404; Adapter: `WHERE tenant_id = $tenantId` in UPDATE; RLS: `tasks_tenant_isolation` policy                                                    |
| Task payload XSS (malicious payload_json rendered to DOM)                          | Tampering              | `TaskBannerRow` renders only i18n keys with ICU interpolation — payload fields used as message params, never dangerously set as HTML. Phase 3 established this invariant (T-03-06-03). |
| FX rate manipulation (unbounded rate causes integer overflow in cushion math)      | Tampering              | `computeRecurringFx` bounds check `0 < rate < 1e6`; bigint arithmetic prevents float precision issues                                                                                  |
| Double-emit spam via concurrent requests                                           | Denial of Service      | Partial unique index + `ON CONFLICT DO NOTHING` prevents unbounded task growth                                                                                                         |
| `cushion_target_months` out-of-range (e.g., 999) causes denial via extreme math    | Tampering              | Zod: `z.number().int().min(1).max(60)` + DB CHECK constraint (double enforcement)                                                                                                      |

---

## Sources

### Primary (HIGH confidence — verified against actual codebase)

- `packages/budgeting/src/adapters/persistence/tasks-schema.ts` — existing table, kind enum, RLS policy
- `packages/budgeting/src/adapters/persistence/task-repo.ts` — SYSTEM_USER pattern, `withTenantTx` shape, `listPending` SQL
- `packages/budgeting/src/application/list-pending-tasks.ts` — service shape to mirror for `resolve-task.ts`
- `packages/budgeting/src/application/confirm-recurring-draft.ts` — `withTenantTx` + `writeAudit` + `writeOutbox` composition pattern
- `packages/budgeting/src/application/reserves-summary-builder.ts` — `mismatchCents` field confirmed
- `packages/budgeting/src/application/set-wallet-balance.ts` — existing deps injection pattern; entry point for inline hooks
- `packages/budgeting/src/application/recurring-engine-fx.ts` — FX cache + bounds check pattern
- `apps/worker/src/handlers/budgeting-reconciliation.ts` — hourly cron structure; `withInfraTx` → per-tenant `withTenantTx` loop
- `apps/api/src/routes/tasks.ts` — existing route shape, `tenantIds.includes(budgetId)` guard
- `apps/api/src/routes/budget-identity.ts` — `patchBudgetSchema` to extend
- `apps/web/src/components/budgeting/task-banner-row.tsx` — current DOM shape, disabled button to enable
- `apps/web/src/components/settings/cushion-section.tsx` — two-toggle structure; insertion point for months field
- `apps/web/src/components/onboarding/steps/step-features.tsx` — `StepFeatures` props shape; insertion point for months input
- `apps/web/src/components/budgeting/category-slider.tsx` — `useForm` (react-hook-form); `cushionEnabled` gating; field names
- `apps/web/e2e/features/task-banner.feature` — existing 4 scenarios; rewrite contract confirmed
- `tests/tenant-leak/tasks-cross-tenant.test.ts` — gate structure; layer-2 RLS test pattern
- `drizzle/0025_phase06_cushion_enabled_flag.sql` — migration precedent and hand-authored pattern
- `.planning/phases/07-tasks-queue/07-CONTEXT.md` — 37 locked decisions

### Secondary (MEDIUM confidence — CONTEXT.md canonical refs, not yet read)

- `apps/worker/src/handlers/recurring-engine.ts` — draft INSERT ON CONFLICT return detection (A1 assumption — planner should verify)
- `apps/web/src/components/budgeting/reserves-tab/reserves-table-row.tsx` — Actions column placeholder shape (A3 open question)
- `packages/budgeting/src/application/dismiss-draft.ts` — tx injection surface (A2 assumption)
- `packages/budgeting/src/application/skip-recurring-draft.ts` — same

---

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH — all libraries verified in existing files
- Architecture: HIGH — patterns verified against Phase 2–6 code; no new dependencies
- Pitfalls: HIGH — derived from actual code inspection (react-hook-form, ON CONFLICT semantics, migration hand-authoring)
- Generator math: HIGH — D-PH7-16 formula is exact; FX pattern verified in `recurring-engine-fx.ts`
- Assumed claims: 3 (A1–A3), all low-risk and easy for planner to verify before implementation

**Research date:** 2026-05-30
**Valid until:** 2026-06-30 (stable stack, no fast-moving dependencies)

# Phase 7: Tasks Queue — Pattern Map

**Mapped:** 2026-05-30
**Files analyzed:** 30 new/modified files
**Analogs found:** 28 / 30

> Phase 7 is an **extension phase**. Every new file has a near-exact analog
> already shipped in Phases 1–6. The planner should copy patterns from the
> analogs cited below verbatim, only adjusting kind names, payload shapes, and
> ICU message keys.

---

## File Classification

### Wave 0 — Schema + Test Scaffolds

| New/Modified File                                           | Role                    | Data Flow        | Closest Analog                                  | Match Quality |
| ----------------------------------------------------------- | ----------------------- | ---------------- | ----------------------------------------------- | ------------- |
| `drizzle/0026_phase07_tasks_cushion_months.sql`             | migration               | DDL              | `drizzle/0025_phase06_cushion_enabled_flag.sql` | role-match    |
| `packages/budgeting/test/tasks/reserve-topup.test.ts`       | test (unit+integration) | CRUD             | `tests/tenant-leak/tasks-cross-tenant.test.ts`  | partial       |
| `packages/budgeting/test/tasks/confirm-draft.test.ts`       | test (unit+integration) | CRUD             | `tests/tenant-leak/tasks-cross-tenant.test.ts`  | partial       |
| `packages/budgeting/test/tasks/cushion-math.test.ts`        | test (pure unit)        | transform        | (no analog — pure math)                         | none          |
| `packages/budgeting/test/tasks/resolve-idempotency.test.ts` | test (unit)             | CRUD             | `tests/tenant-leak/tasks-cross-tenant.test.ts`  | partial       |
| `tests/tenant-leak/cushion-summary-cross-tenant.test.ts`    | test (tenant-leak gate) | request-response | `tests/tenant-leak/tasks-cross-tenant.test.ts`  | exact         |

### Wave 1 — Domain + Ports + Adapter Extensions

| New/Modified File                                                      | Role                | Data Flow        | Closest Analog                                                                    | Match Quality                              |
| ---------------------------------------------------------------------- | ------------------- | ---------------- | --------------------------------------------------------------------------------- | ------------------------------------------ |
| `packages/budgeting/src/adapters/persistence/tasks-schema.ts` (MODIFY) | adapter (schema)    | DDL              | self (lines 22–50)                                                                | exact — only `tasks_kind_chk` enum changes |
| `packages/budgeting/src/ports/task-repo.ts` (MODIFY)                   | port                | CRUD             | self (lines 13–38)                                                                | exact — extend with write methods          |
| `packages/budgeting/src/adapters/persistence/task-repo.ts` (MODIFY)    | adapter (repo)      | CRUD             | self + `confirm-recurring-draft.ts` writeOutbox pattern                           | exact                                      |
| `packages/budgeting/src/application/recompute-cushion-task.ts` (NEW)   | application service | transform        | `recurring-engine-fx.ts` + `reserves-summary-builder.ts` shape function           | role-match                                 |
| `packages/budgeting/src/application/get-cushion-summary.ts` (NEW)      | application service | request-response | `reserves-summary-builder.ts` + `confirm-recurring-draft.ts` withTenantTx wrapper | role-match                                 |
| `packages/budgeting/src/application/resolve-task.ts` (NEW)             | application service | CRUD             | `list-pending-tasks.ts`                                                           | exact                                      |

### Wave 1 — Generator Emission Hooks (auto-resolve)

| New/Modified File                                                        | Role                | Data Flow    | Closest Analog                                                                                            | Match Quality                  |
| ------------------------------------------------------------------------ | ------------------- | ------------ | --------------------------------------------------------------------------------------------------------- | ------------------------------ |
| `packages/budgeting/src/application/confirm-recurring-draft.ts` (MODIFY) | application service | CRUD         | self (lines 71–98) — add resolve UPDATE alongside existing UPDATE                                         | exact                          |
| `packages/budgeting/src/application/dismiss-draft.ts` (MODIFY)           | application service | CRUD         | `confirm-recurring-draft.ts` writeOutbox pattern — currently delegates to repo, needs tx-injected resolve | role-match (refactor required) |
| `packages/budgeting/src/application/skip-recurring-draft.ts` (MODIFY)    | application service | CRUD         | self (lines 26–80) — has withTenantTx, drop in resolve UPDATE inline                                      | exact                          |
| `packages/budgeting/src/application/set-wallet-balance.ts` (MODIFY)      | application service | CRUD         | self (lines 51–161) — extend deps with TaskRepo and recompute helper                                      | exact                          |
| `packages/budgeting/src/application/update-wallet.ts` (MODIFY)           | application service | CRUD         | self (lines 60–229) — same pattern as set-wallet-balance                                                  | exact                          |
| `packages/budgeting/src/application/create-wallet.ts` (MODIFY)           | application service | CRUD         | self — add cushion recompute hook after create                                                            | exact                          |
| `packages/budgeting/src/application/archive-wallet.ts` (MODIFY)          | application service | CRUD         | (read create-wallet pattern; archive analog same shape)                                                   | role-match                     |
| `packages/budgeting/src/application/adjust-category-reserve.ts` (MODIFY) | application service | CRUD         | self (lines 66–199) — add RESERVE_TOPUP recompute hook                                                    | exact                          |
| `packages/budgeting/src/application/set-category-limit.ts` (MODIFY)      | application service | CRUD         | self (lines 33–79) — add cushion recompute on cushion-amount change                                       | exact                          |
| `apps/worker/src/handlers/recurring-engine.ts` (MODIFY)                  | worker handler      | event-driven | self (lines 167–203) — add CONFIRM_DRAFT emit after `if (insertResult.rows.length > 0)`                   | exact                          |
| `apps/worker/src/handlers/budgeting-reconciliation.ts` (MODIFY)          | worker handler      | event-driven | self (lines 50–103) — add per-tenant sweep loops                                                          | exact                          |

### Wave 2 — API Routes

| New/Modified File                                  | Role  | Data Flow        | Closest Analog                                                               | Match Quality |
| -------------------------------------------------- | ----- | ---------------- | ---------------------------------------------------------------------------- | ------------- |
| `apps/api/src/routes/tasks.ts` (MODIFY)            | route | request-response | self (lines 28–60) — add POST `/:taskId/resolve`                             | exact         |
| `apps/api/src/routes/budgets.ts` (MODIFY — extend) | route | request-response | `budgets.ts` lines 361–378 (GET /reserves handler)                           | exact         |
| `apps/api/src/routes/budget-identity.ts` (MODIFY)  | route | request-response | self (lines 16–31) — extend `patchBudgetSchema` with `cushion_target_months` | exact         |

### Wave 3 — Frontend Components

| New/Modified File                                                                | Role               | Data Flow        | Closest Analog                                                           | Match Quality |
| -------------------------------------------------------------------------------- | ------------------ | ---------------- | ------------------------------------------------------------------------ | ------------- |
| `apps/web/src/components/budgeting/task-banner-row.tsx` (MODIFY)                 | component (client) | event-driven     | self (lines 39–67) — drop disabled, wire onClick                         | exact         |
| `apps/web/src/components/budgeting/reserves-tab/reserves-table-row.tsx` (MODIFY) | component (client) | event-driven     | self (lines 174–344) — wire pending-task indicator + icon button         | role-match    |
| `apps/web/src/components/settings/cushion-section.tsx` (MODIFY)                  | component (client) | request-response | self (lines 92–139) — add input + preview between toggles                | exact         |
| `apps/web/src/components/onboarding/steps/step-features.tsx` (MODIFY)            | component (client) | request-response | self (lines 36–96) — add numeric input below cushion toggle              | exact         |
| `apps/web/src/components/onboarding/wizard-page.tsx` (MODIFY)                    | component (client) | request-response | self (lines 44–166) — extend `WizardForm` + `commitWizard` PATCH payload | exact         |
| `apps/web/src/components/budgeting/category-slider.tsx` (MODIFY)                 | component (client) | request-response | self (lines 159–278) — add `linked` useState + form.setValue mirror      | exact         |
| `apps/web/messages/{en,pl,uk}.json` (MODIFY)                                     | i18n               | static           | self — existing `bdp.tasks.*` namespace                                  | exact         |

### Wave 4 — E2E

| New/Modified File                                     | Role          | Data Flow    | Closest Analog                                     | Match Quality |
| ----------------------------------------------------- | ------------- | ------------ | -------------------------------------------------- | ------------- |
| `apps/web/e2e/features/task-banner.feature` (REWRITE) | E2E (Gherkin) | event-driven | self (existing 4 scenarios — rewrite per D-PH7-29) | exact         |

---

## Pattern Assignments

### Migration: `drizzle/0026_phase07_tasks_cushion_months.sql`

**Analog:** `drizzle/0025_phase06_cushion_enabled_flag.sql`

**Header comment + ALTER pattern** (lines 1–21):

```sql
-- Phase 6 onboarding wizard rewrite: surface a pure "Cushion" feature flag
-- ...
-- Default TRUE preserves existing UX: every pre-feature budget keeps the
-- cushion column visible until the owner opts out from Settings → Features.

--> statement-breakpoint

ALTER TABLE "tenancy"."budgets"
  ADD COLUMN IF NOT EXISTS "cushion_enabled" boolean NOT NULL DEFAULT true;
```

**Apply for Phase 7:** Same header style, same `--> statement-breakpoint` marker
between statements. Hand-author the partial unique indexes (precedent: 0024).
See RESEARCH.md "Code Examples → Migration 0026" for the exact SQL body.

---

### `packages/budgeting/src/adapters/persistence/tasks-schema.ts` (MODIFY)

**Analog:** self (only the `tasks_kind_chk` line changes)

**Check constraint pattern** (lines 36–41):

```typescript
(t) => [
    check(
      "tasks_kind_chk",
      sql`${t.kind} IN ('RESERVE_TOPUP','CONFIRM_DRAFT','STALE_WALLET','MONTH_END_REVIEW')`,
    ),
    check("tasks_status_chk", sql`${t.status} IN ('PENDING','RESOLVED')`),
```

**Apply for Phase 7:** Replace the kind enum to
`'RESERVE_TOPUP','CONFIRM_DRAFT','CUSHION_BELOW_TARGET'`. Migration 0026 does
the DROP/RECREATE in SQL; the schema file must stay in sync.

**RLS policy pattern** (lines 42–48) — leave untouched:

```typescript
pgPolicy("tasks_tenant_isolation", {
  as: "permissive",
  for: "all",
  to: [appRole, workerRole],
  using: sql`${t.tenantId} = ANY(coalesce(nullif(current_setting('app.tenant_ids', true), ''), '{}')::uuid[])`,
  withCheck: sql`${t.tenantId} = ANY(coalesce(nullif(current_setting('app.tenant_ids', true), ''), '{}')::uuid[])`,
}),
```

---

### `packages/budgeting/src/ports/task-repo.ts` (MODIFY)

**Analog:** self (existing `TaskRepo` interface in `task-repo.ts` lines 31–38)

**Existing port shape** (lines 13–38):

```typescript
export type TaskKind =
  | "RESERVE_TOPUP"
  | "CONFIRM_DRAFT"
  | "STALE_WALLET"
  | "MONTH_END_REVIEW";

export type TaskStatus = "PENDING" | "RESOLVED";

export interface TaskSummary {
  id: string;
  budget_id: string;
  kind: TaskKind;
  status: TaskStatus;
  payload: Record<string, unknown>;
  created_at: string;
}

export interface TaskRepo {
  listPending(budgetId: string, tenantId: string): Promise<TaskSummary[]>;
}
```

**Apply for Phase 7:**

- Update `TaskKind` union: drop `STALE_WALLET` + `MONTH_END_REVIEW`, add `CUSHION_BELOW_TARGET`.
- Add port methods (already documented in RESEARCH.md "Code Examples → TaskRepo port extension"):
  - `resolve(taskId, tenantId, tx?)`
  - `emitReserveTopup(tenantId, budgetId, payload, tx)`
  - `emitConfirmDraft(tenantId, budgetId, payload, tx)`
  - `emitCushionBelowTarget(tenantId, budgetId, payload, tx)`
  - `resolveByKindAndBudget(tenantId, budgetId, kind, tx)`
  - `resolveConfirmDraftByDraftId(tenantId, draftId, tx)`
- No drizzle imports. Hex boundary enforced.

---

### `packages/budgeting/src/adapters/persistence/task-repo.ts` (MODIFY)

**Analog:** self (lines 29–74) — `withTenantTx` template + SQL execute pattern

**Existing withTenantTx template** (lines 36–69):

```typescript
const r = await withTenantTx(
  TenantId(tenantId),
  UserId(SYSTEM_USER_ID),
  async (tx) => {
    const drizzleTx = tx as {
      execute: (q: unknown) => Promise<{ rows: Record<string, unknown>[] }>;
    };
    const res = await drizzleTx.execute(sql`
      SELECT id, budget_id, kind, status, payload_json, created_at
        FROM budgeting.tasks
       WHERE budget_id = ${budgetId}::uuid
         AND tenant_id = ${tenantId}::uuid
         AND status = 'PENDING'
       ORDER BY created_at ASC
    `);
    return res.rows.map((row): TaskSummary => {
      /* ... */
    });
  },
);
if (r.isErr()) throw r.error;
return r.value;
```

**System-user constant** (line 27):

```typescript
const SYSTEM_USER_ID = "00000000-0000-0000-0000-000000000001";
```

**Apply for Phase 7:** Add new methods that accept an OPTIONAL `tx` parameter.
When `tx` is provided, execute inline (same tx as caller). When absent, open
own `withTenantTx`. Patterns to reuse:

- **Idempotent UPDATE for resolve** — see RESEARCH.md "Pattern 2: Idempotent resolve":
  ```typescript
  await drizzleTx.execute(sql`
    UPDATE budgeting.tasks
       SET status = 'RESOLVED', resolved_at = now()
     WHERE budget_id = ${budgetId}::uuid
       AND tenant_id = ${tenantId}::uuid
       AND kind = ${kind}
       AND status = 'PENDING'
  `);
  ```
- **INSERT with ON CONFLICT DO NOTHING for emit** — see RESEARCH.md "Pattern 1: Dedup-safe emit":
  ```typescript
  await drizzleTx.execute(sql`
    INSERT INTO budgeting.tasks
      (id, tenant_id, budget_id, kind, payload_json, status, created_at)
    VALUES
      (gen_random_uuid(), ${tenantId}::uuid, ${budgetId}::uuid,
       ${kind}, ${JSON.stringify(payload)}::jsonb, 'PENDING', now())
    ON CONFLICT DO NOTHING
  `);
  ```

---

### `packages/budgeting/src/application/resolve-task.ts` (NEW)

**Analog:** `packages/budgeting/src/application/list-pending-tasks.ts`

**Full file pattern to mirror** (entire file, 39 lines):

```typescript
import { ok, err, type Result } from "@budget/shared-kernel";
import type { TaskRepo, TaskSummary } from "../ports/task-repo";

export interface ListPendingTasksInput {
  tenantId: string;
  budgetId: string;
}

export interface ListPendingTasksDeps {
  taskRepo: TaskRepo;
}

export function listPendingTasks(deps: ListPendingTasksDeps) {
  return async (
    input: ListPendingTasksInput,
  ): Promise<Result<TaskSummary[], Error>> => {
    try {
      const rows = await deps.taskRepo.listPending(
        input.budgetId,
        input.tenantId,
      );
      return ok(rows);
    } catch (e) {
      return err(e as Error);
    }
  };
}
```

**Apply for Phase 7:** Same closure-over-deps shape. `resolveTask(deps)`
returns `async (input) => Result<void, Error>`. Single port call to
`deps.taskRepo.resolve(taskId, tenantId)`. NO drizzle, NO hono.

---

### `packages/budgeting/src/application/recompute-cushion-task.ts` (NEW)

**Analog (shape):** `packages/budgeting/src/application/reserves-summary-builder.ts` (pure function shape)
**Analog (FX):** `packages/budgeting/src/application/recurring-engine-fx.ts` (entire file, lines 1–64)

**FX cache + bounds-check pattern** (recurring-engine-fx.ts lines 35–64):

```typescript
export async function computeRecurringFx(
  input: RecurringFxInput,
): Promise<RecurringFxResult> {
  if (input.ruleCurrency === input.budgetCurrency) {
    return {
      fxRate: "1",
      fxAsOf: input.dueDateStr,
      amountConvertedCents: input.amountOriginalCents,
    };
  }

  const fx = await input.fxProvider.rateAsOf(
    input.ruleCurrency,
    input.budgetCurrency,
    new Date(input.dueDateStr + "T00:00:00Z"),
  );

  const rateNum = Number(fx.rate);
  if (!Number.isFinite(rateNum) || rateNum <= 0 || rateNum >= 1e6) {
    throw new Error(`FX rate out of bounds: ${fx.rate}`);
  }

  return {
    fxRate: fx.rate,
    fxAsOf: input.dueDateStr,
    amountConvertedCents: String(
      Math.round(Number(input.amountOriginalCents) * rateNum),
    ),
  };
}
```

**Apply for Phase 7:** Reuse `computeRecurringFx` directly for each cushion
wallet conversion. Use `Temporal.Now.plainDateISO().toString()` as `dueDateStr`
(per Pitfall 5 in RESEARCH.md — cushion summary uses TODAY as as-of date,
not a transaction date).

**Shape pattern** (recompute-cushion-task entry shape from RESEARCH.md Pattern 3):

```typescript
export async function recomputeCushionTask(
  tx: TenantTx,
  input: { tenantId: string; budgetId: string; fxProvider: FxProviderLike },
): Promise<void> {
  const summary = await computeCushionSummary(tx, input);
  const shortfall = summary.required_cents - summary.actual_cents;
  if (!summary.enabled || shortfall <= 0n) {
    await resolveCushionTask(tx, input.tenantId, input.budgetId);
  } else {
    await emitCushionTask(tx, input.tenantId, input.budgetId, summary);
  }
}
```

---

### `packages/budgeting/src/application/get-cushion-summary.ts` (NEW)

**Analog:** `packages/budgeting/src/application/reserves-summary-builder.ts` (shape function pattern)

**Math composition pattern** (reserves-summary-builder.ts lines 15–78):

- Take pre-fetched aggregations (active map, excluded map, wallet pool).
- Return DTO with `totals` block containing `mismatchCents` as `bigint → string`.
- Use `bigint` arithmetic throughout; convert to `.toString()` only at DTO boundary.

**Apply for Phase 7:**

- Service signature: `getCushionSummary(deps)({tenantId, budgetId, asOfDate?})` → Result.
- Two SQLs inside `withTenantTx`:
  1. `SELECT cushion_enabled, cushion_target_months, default_currency FROM tenancy.budgets WHERE id = $tenant`
  2. `SELECT Σ(category_limits.cushion_amount at PIT)` AND `SELECT id, currency, amount FROM budgeting.wallets WHERE wallet_type='CUSHION'`
- Loop wallets, call `computeRecurringFx` (reuse), sum `actual_cents`.
- Return DTO `{required_cents, actual_cents, shortfall_cents, currency, enabled, target_months}`.

---

### `packages/budgeting/src/application/confirm-recurring-draft.ts` (MODIFY)

**Analog:** self (lines 71–98) — existing UPDATE + writeAudit + writeOutbox pattern

**Existing draft-confirm UPDATE pattern** (lines 71–87):

```typescript
// Confirm = set confirmed_at = now()
await drizzleTx.execute(sql`
UPDATE budgeting.expense_ledger
   SET confirmed_at = now(),
       updated_at = now()
 WHERE id = ${input.draftId}::uuid
`);

await writeAudit(tx, {
  tenantId: TenantId(input.tenantId),
  actorUserId: UserId(input.actorUserId),
  entityType: "expense_ledger",
  entityId: input.draftId,
  action: "update" as const,
  before: { confirmed_at: null },
  after: { confirmed_at: "now()" },
});
```

**Apply for Phase 7:** Insert directly between the UPDATE expense_ledger and
writeAudit — call `deps.taskRepo.resolveConfirmDraftByDraftId(input.tenantId,
input.draftId, tx)` so the resolve UPDATE lands in the SAME tx. Idempotent
(matches no rows = no-op).

---

### `packages/budgeting/src/application/dismiss-draft.ts` (MODIFY)

**Analog:** `skip-recurring-draft.ts` (which currently has `withTenantTx`)

**Current shape problem:** `dismiss-draft.ts` (lines 24–52) delegates to
`deps.repo.dismiss()` — there's no exposed tx surface to inject a resolve.

**Apply for Phase 7 (refactor required):**

- Either: refactor `dismiss-draft.ts` to use `withTenantTx` inline (mirror
  `skip-recurring-draft.ts` lines 26–80) so the resolve UPDATE can land in
  the same tx.
- Or: have `repo.dismiss()` return success and open a SEPARATE
  `withTenantTx` to fire the resolve (acceptable per RESEARCH.md A2 risk
  note — adds a second tx but is acceptable).

Preferred path: refactor to inline `withTenantTx` to keep tx-grouping
consistent with `skip-recurring-draft.ts` and `confirm-recurring-draft.ts`.

---

### `packages/budgeting/src/application/skip-recurring-draft.ts` (MODIFY)

**Analog:** self (lines 26–80) — already uses `withTenantTx` + writeAudit + writeOutbox

**Existing pattern** (lines 53–78):

```typescript
// Soft-delete (skip = deleted_at set)
await drizzleTx.execute(sql`
UPDATE budgeting.expense_ledger
   SET deleted_at = now(),
       updated_at = now()
 WHERE id = ${input.draftId}::uuid
`);

await writeAudit(tx, {
  /* ... */
});
await writeOutbox(tx, {
  /* ... */
});
```

**Apply for Phase 7:** After the UPDATE soft-delete, before writeAudit, call
`deps.taskRepo.resolveConfirmDraftByDraftId(input.tenantId, input.draftId, tx)`.

---

### `packages/budgeting/src/application/set-wallet-balance.ts` (MODIFY)

**Analog:** self (lines 51–161) — existing reserve recalculation pattern

**Existing deps injection pattern** (lines 28–35):

```typescript
export interface SetWalletBalanceDeps {
  repo: WalletRepo;
  /** UAT-PH5-T3-54 deps — only used when the wallet is RESERVE-type. */
  categoriesRepo?: CategoriesRepo;
  reserveBalanceRepo?: ReserveBalanceRepo;
  reservesSummaryRepo?: ReservesSummaryRepo;
  budgetCurrencyOf?: (tenantId: string) => Promise<string>;
}
```

**Existing branching by wallet type pattern** (lines 64–69):

```typescript
if (
  wallet.walletType === "RESERVE" &&
  deps.categoriesRepo &&
  /* ... */
) {
  // reserve-only logic
}
```

**Apply for Phase 7:**

- Add to deps: `taskRepo?: TaskRepo`, `fxProvider?: FxProviderLike`.
- After the existing wallet update (line 149):
  - If `wallet.walletType === 'RESERVE'`: call `recomputeReserveTopupTask(tx, ...)`.
  - If `wallet.walletType === 'CUSHION'`: call `recomputeCushionTask(tx, ...)`.
- All resolve/emit calls share the same `withTenantTx` that wraps the existing setBalance.

**Note:** Current code (line 144) uses `deps.repo.setBalance(...)` directly without
a tx — extend to wrap setBalance + recompute in a single `withTenantTx`. Mirror
`confirm-recurring-draft.ts` lines 39–102 for the wrapper shape.

---

### `packages/budgeting/src/application/update-wallet.ts` (MODIFY)

**Analog:** self (lines 60–229) — same reserve-recalc pattern as `set-wallet-balance.ts`

**Apply for Phase 7:** Same as set-wallet-balance — add cushion + reserve-topup
recompute hooks after wallet update. CRITICAL (per Pitfall 1 in RESEARCH.md):
DO NOT collapse with set-wallet-balance. Wallet TYPE changes (SPENDING → CUSHION)
go through `update-wallet.ts`, not `set-wallet-balance.ts`.

---

### `packages/budgeting/src/application/create-wallet.ts` (MODIFY)

**Analog:** self (lines 20–88) — existing `withTenantTx` import + use

**Existing withTenantTx pattern** (lines 24–38):

```typescript
const { withTenantTx } = await import("@budget/platform");
const { TenantId, UserId } = await import("@budget/shared-kernel");

const currencyCheck = await withTenantTx(
  TenantId(input.tenantId),
  UserId(input.actorUserId),
  async (tx) => {
    /* ... */
  },
);
```

**Apply for Phase 7:** After the `deps.repo.create(wallet)` line, if
`input.walletType === 'CUSHION'`, open a `withTenantTx` and call
`recomputeCushionTask(tx, {tenantId, budgetId, fxProvider})`. Or thread the
create + recompute into a SINGLE `withTenantTx` for consistency with other
mutation paths.

---

### `packages/budgeting/src/application/archive-wallet.ts` (MODIFY)

**Analog:** `create-wallet.ts` (file is similar shape — read it during execution)

**Apply for Phase 7:** Same pattern as create-wallet — after archive, if the
archived wallet's type was CUSHION, fire `recomputeCushionTask`.

---

### `packages/budgeting/src/application/adjust-category-reserve.ts` (MODIFY)

**Analog:** self (lines 66–199)

**Existing tx-driven mutation pattern** (lines 117–148):

```typescript
// Append delta to the ledger so the VIEW resolves to newExpected.
if (delta !== 0n) {
  await deps.adjustmentsRepo.create({
    tenantId: input.tenantId,
    categoryId: input.categoryId,
    deltaCents: delta,
    /* ... */
  });
}

// Compute new actual snapshot and persist only changed rows.
const allocResult = applyExpectedChange(/* ... */);
/* ... */
if (updates.size > 0) {
  await deps.categoriesRepo.setReserveActualMany(/* ... */);
}
```

**Apply for Phase 7:** After the existing reserve adjustment writes, call
`recomputeReserveTopupTask(tx, ...)`. The mismatch math is sourced from
`reserves-summary-builder.ts` `mismatchCents` (line 73). NEVER duplicate that
SQL in the recompute helper — call the existing builder.

---

### `packages/budgeting/src/application/set-category-limit.ts` (MODIFY)

**Analog:** self (lines 33–79)

**Existing pattern** (entire file, 80 lines):

- Simple SCD-2 upsert via `limitRepo.setLimit(repoInput)`.
- No tx wrapper currently (the repo opens its own).

**Apply for Phase 7:** Add an optional `taskRepo` dep + `fxProvider` dep, and
after the setLimit call (line 51), if `cushionAmount` changed, call
`recomputeCushionTask`. If the repo opens its own tx, you may need to thread
a separate tx for the cushion recompute (acceptable — see A2 risk note in
RESEARCH.md).

---

### `apps/worker/src/handlers/recurring-engine.ts` (MODIFY)

**Analog:** self (lines 167–203) — existing `ON CONFLICT DO NOTHING + check rows.length` pattern

**Existing pattern** (lines 167–203):

```typescript
// INSERT into expense_ledger (confirmed_at NULL = draft, per D-PH2-08)
const insertResult = await drizzleTx.execute(sql`
INSERT INTO budgeting.expense_ledger
  (id, tenant_id, budget_id, category_id, transaction_date, /* ... */)
VALUES
  (gen_random_uuid(), ${tenant_id}::uuid, ${tenant_id}::uuid, /* ... */)
ON CONFLICT (recurring_rule_id, transaction_date) WHERE recurring_rule_id IS NOT NULL AND deleted_at IS NULL DO NOTHING
RETURNING id
`);

// Step 4: writeOutbox only if draft was actually inserted (not a conflict skip)
if (insertResult.rows.length > 0) {
  const draftId = (insertResult.rows[0] as Record<string, unknown>)
    .id as string;
  await writeOutbox(tx, {
    /* ... */
  });
  draftsGenerated++;
}
```

**Apply for Phase 7:** Inside the `if (insertResult.rows.length > 0)` block,
AFTER the existing writeOutbox, add a CONFIRM_DRAFT task emit using the SAME
tx variable. Use the `RETURNING id` pattern combined with the rule's metadata
to compose the payload `{draft_id, rule_name, amount_cents, currency,
transaction_date, category_id}` (per D-PH7-12).

**Critical (per Pitfall 3 in RESEARCH.md):** ALWAYS gate the emit by
`insertResult.rows.length > 0` — `ON CONFLICT DO NOTHING` returns no rows
when the row pre-existed.

---

### `apps/worker/src/handlers/budgeting-reconciliation.ts` (MODIFY)

**Analog:** self (lines 50–103) — existing `withInfraTx → per-tenant withTenantTx` loop

**Existing per-tenant pattern** (lines 59–91):

```typescript
// Step 1: collect distinct tenants (worker_role, no RLS — wallets is GRANT-restricted)
const tenantsResult = await withInfraTx(async (tx) => {
  const drizzleTx = tx as {
    execute: (q: unknown) => Promise<{ rows: Record<string, unknown>[] }>;
  };
  const r = await drizzleTx.execute(sql`
    SELECT DISTINCT tenant_id FROM budgeting.wallets
  `);
  return r.rows as Array<{ tenant_id: string }>;
});

if (tenantsResult.isErr())
  return tenantsResult as unknown as Result<ReconciliationOutput, Error>;
const tenants = tenantsResult.value;

/* ... */
// Step 2: per-tenant reconcile (each call wraps its own withTenantTx(SYSTEM_USER))
const reconcile = reconcileProjections();
for (const { tenant_id } of tenants) {
  const r = await reconcile({ tenantId: tenant_id /* ... */ });
  /* ... */
}
```

**Apply for Phase 7:** Inside the existing per-tenant loop (line 79), AFTER
the existing `reconcile()` call, add two more per-tenant operations:

1. `sweepReserveTopupTask({tenantId})` — uses `reserves-summary-builder.ts`
   `mismatchCents`; emits or resolves.
2. `sweepCushionBelowTargetTask({tenantId, fxProvider})` — uses
   `recomputeCushionTask` helper directly.

Track new counters (`reserveTopupsEmitted`, `cushionTasksEmitted`,
`tasksResolved`) and include in the return shape. Per CONTEXT.md "Claude's
Discretion": existing handler is preferred over a new handler to keep cron
count down.

---

### `apps/api/src/routes/tasks.ts` (MODIFY — add POST resolve)

**Analog:** self (lines 28–60) — existing GET handler pattern

**Existing tenant-guard pattern** (lines 31–47):

```typescript
app.get("/", zValidator("query", querySchema), async (c) => {
  const session = c.get("session");
  if (!session) return c.json({ error: "unauthorized" }, 401);

  const budgetId = c.req.param("budgetId");
  if (!budgetId) return c.json({ error: "missing_budget_id" }, 400);

  // Defence in depth (Layer 1 of the tenant-leak gate):
  //   tenant-guard middleware put verified tenants into c.get("tenantIds").
  //   Reject if budgetId is NOT in the user's verified set. Returning 404
  //   (not 403) avoids leaking the existence of budgets the user does not
  //   own.
  const tenantIds = c.get("tenantIds") as string[] | undefined;
  if (!tenantIds || !tenantIds.includes(budgetId)) {
    return c.json({ error: "not_found" }, 404);
  }
  const tenantId = budgetId; // v1.1: budget_id === tenant_id

  const result = await deps.budgeting.listPendingTasks({
    tenantId,
    budgetId,
  });
  if (result.isErr()) {
    console.error("[list-pending-tasks] failed:", result.error);
    return c.json({ error: "list_tasks_failed" }, 500);
  }
  return c.json({ budgetId, tasks: result.value });
});
```

**Apply for Phase 7:** Add `app.post("/:taskId/resolve", ...)`:

- Same session check.
- Same `tenantIds.includes(budgetId)` guard → 404.
- Extract `taskId` from `c.req.param("taskId")`; zValidator for it (UUID).
- Call `deps.budgeting.resolveTask({tenantId, budgetId, taskId})`.
- Return `c.json({ ok: true })` or 404 if not found.

---

### `apps/api/src/routes/budgets.ts` (MODIFY — add GET /cushion-summary)

**Analog:** `budgets.ts` lines 361–378 (GET /reserves handler)

**Existing tenant-guard + composed-read pattern**:

```typescript
r.get("/:id/reserves", async (c) => {
  const session = c.get("session");
  if (!session) return c.json({ error: "unauthorized" }, 401);

  const budgetId = c.req.param("id");
  const tenantIds = c.get("tenantIds") as string[] | undefined;
  if (!tenantIds || !tenantIds.includes(budgetId)) {
    return c.json({ error: "not_found" }, 404);
  }

  const result = await deps.budgeting.getReservesSummary({
    tenantId: budgetId,
    budgetId,
  });
  if (result.isErr())
    return serverError(c, "reserves_summary_failed", result.error);
  return c.json(result.value, 200);
});
```

**Apply for Phase 7:** Add `r.get("/:id/cushion-summary", ...)` with the
identical guard + composed-read shape. Delegate to
`deps.budgeting.getCushionSummary({tenantId, budgetId})`. Return the DTO
from the application service directly.

---

### `apps/api/src/routes/budget-identity.ts` (MODIFY — extend PATCH schema)

**Analog:** self (lines 16–31) — existing `patchBudgetSchema`

**Existing schema** (lines 16–31):

```typescript
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
});
```

**Apply for Phase 7:** Add one line:

```typescript
cushion_target_months: z.number().int().min(1).max(60).optional(),
```

**Existing PATCH dispatch pattern** (lines 128–160):

```typescript
if (
  body.name !== undefined ||
  body.default_currency !== undefined ||
  body.reserves_enabled !== undefined ||
  body.cushion_enabled !== undefined
) {
  try {
    await deps.tenancy.workspaceRepo.updateIdentity(
      budgetId,
      {
        ...(body.name !== undefined ? { name: body.name } : {}),
        /* ... */
      },
      actorUserId,
    );
  } catch (e: unknown) {
    /* ... */
  }
}
```

**Apply for Phase 7:** Extend the condition AND the spread to include
`cushion_target_months`. After the identity update lands, fire a
`recomputeCushionTask` (since the change can flip shortfall sign).

---

### `apps/web/src/components/budgeting/task-banner-row.tsx` (MODIFY)

**Analog:** self (entire file, lines 1–67)

**Existing DOM structure** (lines 47–66):

```tsx
return (
  <div
    role="listitem"
    className="flex h-12 items-center gap-3 border-b border-[var(--hairline-dark)] bg-[var(--surface-card-dark)] px-4"
  >
    <span className="flex-1 truncate text-sm text-[var(--body-on-dark)]">
      {t(titleKey)}
    </span>
    <Badge variant="secondary">{t(kindKey)}</Badge>
    <Button
      variant="primary"
      size="sm"
      disabled
      aria-disabled="true"
      title={t("bdp.tasks.actionComingSoon")}
    >
      {t(actionKey)}
    </Button>
  </div>
);
```

**Apply for Phase 7 (per D-PH7-25, UI-SPEC §Modified in Phase 7 #1):**

- Update `TaskKind` union (line 18–22): drop `STALE_WALLET`+`MONTH_END_REVIEW`,
  add `CUSHION_BELOW_TARGET`.
- Drop `disabled`, `aria-disabled="true"`, `title={t("bdp.tasks.actionComingSoon")}`.
- Add `onClick={handleAction}` with switch-by-kind (see RESEARCH.md Pattern 5):
  ```typescript
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
        handleConfirmDraft(task);
        break;
    }
  }
  ```
- For CONFIRM_DRAFT inline mutation: use `clientApiFetch` (already imported by
  `task-banner.tsx` line 8) — mirror that import path.
- Loading state: Lucide `Loader2` from `category-slider.tsx` line 22 import +
  `animate-spin` className (see category-slider.tsx line 515).

---

### `apps/web/src/components/budgeting/reserves-tab/reserves-table-row.tsx` (MODIFY)

**Analog:** self (lines 174–344) — existing 3-cell row structure

**Existing row structure** (lines 174–209 + 233–344):

- Wrapper div with swipe behavior.
- `RowDragHandle` (line 227).
- Category name cell (lines 234–236).
- Reserve balance editable cell (lines 249–284) — already wired to update.
- Actual + share cells (lines 295–340).

**Note:** Per the file comment on line 5 ("UAT-PH5-T3-55: Actions column dropped"),
the explicit "Actions column" referenced in D-PH7-26 was already removed. The
existing inline-edit on the reserve balance cell is the surface the user
manipulates to fix RESERVE_TOPUP shortfall. The required Phase 7 work is to
add a VISUAL pending-task indicator (e.g., a small pulsing dot or icon next
to the category name) when the row's category contributes to a PENDING
RESERVE_TOPUP — per D-PH7-26 spirit.

**Apply for Phase 7:**

- Accept a new optional prop `pendingTaskId?: string`.
- When `pendingTaskId` is set, render a small `PencilLine` (lucide-react)
  icon at line 234 area, with `aria-label={t("reserves.actions.editBalance")}`.
- Existing InlineEditCell click behavior is what resolves the task — no new
  modal needed.

---

### `apps/web/src/components/settings/cushion-section.tsx` (MODIFY)

**Analog:** self (lines 92–139) — existing two-toggle structure

**Existing structure** (lines 92–138):

```tsx
return (
  <div className="space-y-5">
    {/* Master toggle */}
    <div className="flex items-start justify-between gap-4">
      {/* ... */}
      <Switch
        checked={enabled}
        onCheckedChange={handleEnabledChange} /* ... */
      />
    </div>

    {/* Per-month mode — hidden entirely when master is off */}
    {enabled && (
      <div className="border-t border-[var(--hairline-on-dark)] pt-5">
        {/* ... */}
        <Switch checked={mode} onCheckedChange={handleModeChange} /* ... */ />
      </div>
    )}
  </div>
);
```

**Existing PATCH pattern** (lines 50–55):

```typescript
const res = await api.budgets[":id"].$patch({
  param: { id: budgetId },
  json: { cushion_enabled: checked },
});
if (!res.ok) throw new Error("Failed to update cushion flag");
```

**Existing autosave + toast pattern** (lines 60–70):

```typescript
toast.success(
  checked
    ? t("cushion.feature_on_toast")
    : t("cushion.feature_off_toast"),
);
} catch {
  setEnabled(!checked);
  toast.error(t("error_save"));
}
```

**Apply for Phase 7 (per D-PH7-32, UI-SPEC §Modified #4):**

- BETWEEN the master toggle block (line 95–111) AND the `{enabled && (...)}` mode block (line 116):
  - Insert numeric `<Input type="number" min="1" max="60" step="1">` with label
    `settings.cushion.targetMonthsLabel`.
  - Insert live preview `<p>` element fed by `useQuery(["cushion-summary", budgetId])`
    against `GET /budgets/:id/cushion-summary`.
- Use react-query like `task-banner.tsx` lines 43–56 does:
  ```typescript
  const { data } = useQuery({
    queryKey: ["cushion-summary", budgetId],
    queryFn: async () => {
      const res = await clientApiFetch(`/budgets/${budgetId}/cushion-summary`);
      /* ... */
    },
  });
  ```
- Save on blur via `api.budgets[":id"].$patch({json: {cushion_target_months: n}})`.
- Validate 1–60 client-side; show inline error in `--trading-down` color.

---

### `apps/web/src/components/onboarding/steps/step-features.tsx` (MODIFY)

**Analog:** self (lines 36–96) — existing `FeatureRow` switch component

**Existing FeatureRow pattern** (lines 36–57):

```tsx
function FeatureRow({
  id,
  testId,
  label,
  help,
  checked,
  onChange,
}: FeatureRowProps) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-[var(--radius-md)] border border-[var(--hairline-on-dark)] bg-[var(--surface-elevated-dark)] px-4 py-4">
      <div className="min-w-0 space-y-1">
        <label
          htmlFor={id}
          className="block text-sm font-semibold text-[var(--body-on-dark)]"
        >
          {label}
        </label>
        <p className="text-xs text-[var(--muted-foreground)]">{help}</p>
      </div>
      <Switch
        id={id}
        data-testid={testId}
        checked={checked}
        onCheckedChange={onChange}
        aria-label={label}
        className="mt-0.5 shrink-0"
      />
    </div>
  );
}
```

**Apply for Phase 7 (per D-PH7-34, UI-SPEC §Modified #5):**

- Extend `StepFeaturesProps` (line 12–17) with:
  ```typescript
  cushionTargetMonths: number;
  onChangeCushionTargetMonths: (v: number) => void;
  ```
- Below the existing cushion `<FeatureRow>` (line 78–85), when `cushionEnabled`,
  render a small inline numeric input. No new step.
- Default value `6`. Hidden via CSS when `cushionEnabled === false`.
- Same input styling as Settings cushion-section months field.

---

### `apps/web/src/components/onboarding/wizard-page.tsx` (MODIFY)

**Analog:** self (lines 44–166)

**Existing WizardForm interface** (lines 44–50):

```typescript
interface WizardForm {
  name: string;
  currency: string;
  kind: "PRIVATE" | "SHARED";
  cushionEnabled: boolean;
  reservesEnabled: boolean;
}
```

**Existing PATCH payload composition** (lines 149–166):

```typescript
const patchPayload: {
  cushion_enabled?: boolean;
  reserves_enabled?: boolean;
} = {};
if (!form.cushionEnabled) patchPayload.cushion_enabled = false;
if (!form.reservesEnabled) patchPayload.reserves_enabled = false;
if (Object.keys(patchPayload).length > 0) {
  await api.budgets[":id"].$patch(
    {
      param: { id: budgetId },
      json: patchPayload,
    },
    { headers: { "X-Budget-ID": budgetId } },
  );
}
```

**Apply for Phase 7:**

- Add to `WizardForm` interface: `cushionTargetMonths: number`.
- Default in `useState` (line 101): `cushionTargetMonths: 6`.
- Extend `patchPayload` type and pass `cushion_target_months` when the user
  changed it from default OR when cushion is enabled (always send so server
  has truthy data).
- Pass `cushionTargetMonths` + `onChangeCushionTargetMonths` to `<StepFeatures>` at line 264–270.

---

### `apps/web/src/components/budgeting/category-slider.tsx` (MODIFY — linked-mirror)

**Analog:** self (lines 159–278) — existing react-hook-form + cushion field

**Existing form state pattern** (lines 159–172):

```typescript
const form = useForm<FormValues>({
  resolver: zodResolver(schema),
  defaultValues: {
    name: initial?.name ?? "",
    plannedCents: initial?.plannedCents
      ? centsToDecimal(initial.plannedCents)
      : "0",
    cushionCents: initial?.cushionCents
      ? centsToDecimal(initial.cushionCents)
      : "0",
    /* ... */
  },
});
```

**Existing cushion field render** (lines 388–418):

```tsx
{
  cushionEnabled && (
    <FormField
      control={form.control}
      name="cushionCents"
      render={({ field }) => (
        <FormItem>
          <FormLabel className="text-sm text-[var(--muted-foreground)]">
            {t("catSlider.field.cushion")}
          </FormLabel>
          <div className="flex gap-2 items-center">
            <FormControl>
              <AmountInput
                value={field.value}
                onChange={field.onChange}
                aria-invalid={!!form.formState.errors.cushionCents}
                id="cat-slider-cushion"
              />
            </FormControl>
            {/* ... */}
          </div>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}
```

**Apply for Phase 7 (per D-PH7-35, UI-SPEC §Modified #6, Pitfall 6 in RESEARCH.md):**

- Add `const [linked, setLinked] = useState(...)` after form (line 172):
  ```typescript
  const [linked, setLinked] = useState<boolean>(() => {
    const c = initial?.cushionCents;
    const p = initial?.plannedCents;
    return c == null || c === "" || c === p;
  });
  ```
- The slider uses react-hook-form (NOT raw useState for field values). The
  planned field render (lines 359–386) wraps `AmountInput` with `field.onChange`.
  Intercept that:

  ```typescript
  // In planned field's AmountInput onChange:
  onChange={(v) => {
    field.onChange(v);
    if (linked) form.setValue("cushionCents", v);
  }}

  // In cushion field's AmountInput onChange:
  onChange={(v) => {
    field.onChange(v);
    setLinked(false);
  }}
  ```

- NO visual chain icon. NO re-link affordance. CSS gating on cushion already
  exists (line 389 `{cushionEnabled && ...}`).
- On slider reopen (line 178–192 useEffect), reset `linked` from new
  `initial.cushionCents` vs `initial.plannedCents`:
  ```typescript
  setLinked(
    initial?.cushionCents == null ||
      initial?.cushionCents === initial?.plannedCents,
  );
  ```

---

### `apps/web/messages/{en,pl,uk}.json` (MODIFY)

**Analog:** existing `bdp.tasks.*` namespace already present in all three files.

**Apply for Phase 7 (per UI-SPEC §Copywriting + §i18n Key Additions Summary):**

- ADD keys per UI-SPEC tables:
  - `bdp.tasks.title.CUSHION_BELOW_TARGET`
  - `bdp.tasks.kind.CUSHION_BELOW_TARGET`
  - `bdp.tasks.action.{RESERVE_TOPUP,CONFIRM_DRAFT,CUSHION_BELOW_TARGET}.label`
  - `bdp.tasks.action.{RESERVE_TOPUP,CUSHION_BELOW_TARGET}.ariaLabel`
  - `bdp.tasks.confirmError`
  - `settings.cushion.targetMonthsLabel`, `targetMonthsError`, `preview`, `previewMet`, `previewError`, `saved`
  - `onboarding.cushion.targetMonthsLabel`, `targetMonthsError`
  - `reserves.actions.editBalance`
- REMOVE keys:
  - `bdp.tasks.actionComingSoon`
  - Any `STALE_WALLET` / `MONTH_END_REVIEW` keys
- ICU format used throughout (`{amount}`, `{shortfall}`, `{actual}`, `{required}`).

---

### `apps/web/e2e/features/task-banner.feature` (REWRITE)

**Analog:** self (existing 4 scenarios, lines 1–29) — rewrite required per D-PH7-29

**Existing seed-via-SQL helper pattern** (line 13): `Given a "RESERVE_TOPUP" task is seeded for "My E2E Budget"`.

**Apply for Phase 7:**

- Keep `Background:` "Given I am signed in as a fresh user" pattern.
- Keep seed step pattern but extend kind values to current 3-kind set.
- DROP the existing "action button is disabled" assertion (line 22).
- Add scenarios per kind: emit → user acts (deep-link OR inline confirm) →
  auto-resolve (banner row disappears on next poll).
- Sample scenarios per VALIDATION.md "Minimum Test Cases per Kind":
  - RESERVE_TOPUP: emit via wallet edit → tap action → land on /reserves → fix
    → banner row disappears.
  - CONFIRM_DRAFT: seed draft → emit → tap "Confirm draft" → row collapses.
  - CUSHION_BELOW_TARGET: enable cushion → emit → tap action → land on
    /wallets#cushion → top up → auto-resolve.

---

### `packages/budgeting/test/tasks/*.test.ts` (NEW Wave 0)

**Analog (shape):** `tests/tenant-leak/tasks-cross-tenant.test.ts` (entire file 1–188) — for seed/withTenantTx pattern only.

**Seeded task helper pattern** (lines 97–127):

```typescript
async function seedTaskInBudget(
  budgetId: string,
  kind: "RESERVE_TOPUP" | "CONFIRM_DRAFT" | /* ... */,
): Promise<string> {
  const pool = new Pool({ connectionString: DB_URL });
  const client = await pool.connect();
  const id = crypto.randomUUID();
  try {
    await client.query("BEGIN");
    await client.query(
      `SELECT set_config('app.tenant_ids', '{"${budgetId}"}', true)`,
    );
    /* ... INSERT INTO budgeting.tasks ... */
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
    await pool.end();
  }
  return id;
}
```

**Test framework + module-import pattern** (lines 42–56):

```typescript
import { describe, it, expect, beforeAll } from "bun:test";
import { Pool } from "pg";
import { sql } from "drizzle-orm";

const DB_URL_RAW = process.env.DATABASE_URL_APP;
if (!DB_URL_RAW)
  throw new Error("DATABASE_URL_APP required for tenant-leak gate tests");
process.env.DATABASE_URL_APP = DB_URL_RAW.replace("@db:", "@localhost:");
const DB_URL = process.env.DATABASE_URL_APP;

const { resetPools, withTenantTx } = await import("@budget/platform");
const { TenantId, UserId } = await import("@budget/shared-kernel");
const { createTaskRepo } =
  await import("@budget/budgeting/src/adapters/persistence/task-repo");
resetPools();
```

**Apply for Phase 7:** Use this exact bootstrapping for new task tests. For
pure math tests (`cushion-math.test.ts`), no DB needed — just import the
`recomputeCushionTask` helper and assert on pure function output.

---

### `tests/tenant-leak/cushion-summary-cross-tenant.test.ts` (NEW)

**Analog:** `tests/tenant-leak/tasks-cross-tenant.test.ts` (entire file 1–188)

**Apply for Phase 7:** Copy file 1:1, replacing the route SUT:

- Layer 2: Direct `SELECT FROM tenancy.budgets WHERE id = budgetA` with
  `withTenantTx(budgetB.budgetId, ...)` → expect 0 rows (or RLS-rejected).
- Layer 2 sanity: same call with budgetA tenant scope → returns the row.
- Increment gate count comment from 7 → 8 (or 8 → 9 if `tasks-cross-tenant`
  is also extended with the POST /resolve test in the same phase).

---

## Shared Patterns

### Pattern A: `withTenantTx` for all RLS-scoped writes

**Source:** `packages/budgeting/src/application/confirm-recurring-draft.ts` (lines 39–102)

```typescript
const r = await withTenantTx(
  TenantId(input.tenantId),
  UserId(input.actorUserId),
  async (tx) => {
    const drizzleTx = tx as {
      execute: (q: unknown) => Promise<{ rows: Record<string, unknown>[] }>;
    };
    const { sql } = await import("drizzle-orm");

    // ... domain write
    await drizzleTx.execute(sql`UPDATE ... WHERE id = ${id}::uuid`);

    // ... auxiliary writes in same tx
    await writeAudit(tx, {
      /* ... */
    });
    await writeOutbox(tx, {
      /* ... */
    });

    return result;
  },
);
return r;
```

**Apply to:** All new generator emit paths, all auto-resolve hooks, the new
`resolve-task.ts`, the new `recompute-cushion-task.ts`. NEVER emit a task
outside `withTenantTx`.

### Pattern B: `ON CONFLICT DO NOTHING + partial unique index` for dedup

**Source:** `apps/worker/src/handlers/recurring-engine.ts` (lines 167–203)

```typescript
const insertResult = await drizzleTx.execute(sql`
  INSERT INTO budgeting.expense_ledger (/* ... */) VALUES (/* ... */)
  ON CONFLICT (recurring_rule_id, transaction_date) WHERE recurring_rule_id IS NOT NULL AND deleted_at IS NULL DO NOTHING
  RETURNING id
`);

if (insertResult.rows.length > 0) {
  // Freshly inserted — emit follow-up writes
}
```

**Apply to:** All three task emit paths. Migration 0026 creates the three
partial unique indexes (RESERVE_TOPUP per budget_id; CUSHION_BELOW_TARGET per
budget_id; CONFIRM_DRAFT per `payload_json->>'draft_id'`). All emit calls use
`ON CONFLICT DO NOTHING`.

### Pattern C: Idempotent UPDATE for resolve

**Source:** RESEARCH.md "Pattern 2: Idempotent resolve" (derived from existing UPDATE pattern in `confirm-recurring-draft.ts` line 72–77)

```typescript
await drizzleTx.execute(sql`
  UPDATE budgeting.tasks
     SET status = 'RESOLVED', resolved_at = now()
   WHERE budget_id = ${budgetId}::uuid
     AND tenant_id = ${tenantId}::uuid
     AND kind = ${kind}
     AND status = 'PENDING'
`);
// No error if 0 rows updated — idempotent by design.
```

**Apply to:** Every auto-resolve hook (confirm-recurring-draft, dismiss-draft,
skip-recurring-draft, recompute-cushion-task resolve branch). The `AND
status = 'PENDING'` clause makes the call a no-op when already resolved.

### Pattern D: Defense-in-depth tenant guard on routes

**Source:** `apps/api/src/routes/tasks.ts` (lines 31–47) AND `apps/api/src/routes/budgets.ts` (lines 361–369)

```typescript
const session = c.get("session");
if (!session) return c.json({ error: "unauthorized" }, 401);

const budgetId = c.req.param("id"); // or "budgetId"
const tenantIds = c.get("tenantIds") as string[] | undefined;
if (!tenantIds || !tenantIds.includes(budgetId)) {
  return c.json({ error: "not_found" }, 404);
}
const tenantId = budgetId; // v1.1: budget_id === tenant_id
```

**Apply to:** New POST `/tasks/:taskId/resolve` route AND new
GET `/budgets/:id/cushion-summary` route. RLS is layer 2; this guard is layer 1.

### Pattern E: zValidator on every endpoint body/query

**Source:** `apps/api/src/routes/tasks.ts` (line 31) AND `apps/api/src/routes/budget-identity.ts` (line 93)

```typescript
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";

const schema = z.object({ taskId: z.string().uuid() });
app.post("/:taskId/resolve", zValidator("param", schema), async (c) => {
  /* ... */
});
```

**Apply to:** POST resolve route validates `:taskId` as UUID; PATCH budget
validates `cushion_target_months` as `z.number().int().min(1).max(60)`.

### Pattern F: SYSTEM_USER constant for cron-emitted writes

**Source:** `apps/worker/src/handlers/recurring-engine.ts` (line 44) AND `packages/budgeting/src/adapters/persistence/task-repo.ts` (line 27)

```typescript
const SYSTEM_USER_ID = "00000000-0000-0000-0000-000000000001";

await withTenantTx(TenantId(tenantId), UserId(SYSTEM_USER_ID), async (tx) => {
  /* ... */
});
```

**Apply to:** Hourly sweep in `budgeting-reconciliation.ts` extended sections
(both RESERVE_TOPUP sweep and CUSHION sweep). For inline-from-user mutations
(e.g., `set-wallet-balance`), use the request's `actorUserId`, not SYSTEM_USER.

### Pattern G: Autosave-per-field + toast on success/error

**Source:** `apps/web/src/components/settings/cushion-section.tsx` (lines 47–71)

```typescript
async function handleEnabledChange(checked: boolean) {
  setEnabled(checked);
  setSavingFlag(true);
  try {
    const res = await api.budgets[":id"].$patch({
      param: { id: budgetId },
      json: { cushion_enabled: checked },
    });
    if (!res.ok) throw new Error("Failed to update cushion flag");
    toast.success(/* ... */);
  } catch {
    setEnabled(!checked); // optimistic rollback
    toast.error(t("error_save"));
  } finally {
    setSavingFlag(false);
  }
}
```

**Apply to:** New `cushion_target_months` input in cushion-section.tsx — on
blur, fire PATCH with `{cushion_target_months: n}`; toast on success
(`t("settings.cushion.saved")`) and error.

### Pattern H: react-query for client-state, 60s poll, visibility invalidation

**Source:** `apps/web/src/components/budgeting/task-banner.tsx` (lines 43–69)

```typescript
const { data: tasks } = useQuery({
  queryKey: ["tasks", budgetId, "pending"],
  initialData: initialTasks,
  queryFn: async () => {
    const res = await clientApiFetch(
      `/budgets/${budgetId}/tasks?status=pending`,
    );
    if (!res.ok) return initialTasks;
    const body = (await res.json()) as { tasks: TaskSummary[] };
    return body.tasks;
  },
  refetchInterval: 60_000,
  refetchIntervalInBackground: false,
});

useEffect(() => {
  const onVisible = () => {
    if (document.visibilityState === "visible") {
      queryClient.invalidateQueries({
        queryKey: ["tasks", budgetId, "pending"],
      });
    }
  };
  document.addEventListener("visibilitychange", onVisible);
  return () => document.removeEventListener("visibilitychange", onVisible);
}, [queryClient, budgetId]);
```

**Apply to:** Settings cushion-section preview query — same react-query usage
under a new queryKey `["cushion-summary", budgetId]`. Settings doesn't need
60s polling; just re-fetch after save via `invalidateQueries`.

---

## No Analog Found

| File                                                 | Role             | Data Flow | Reason                                                                                                                                                                                                        |
| ---------------------------------------------------- | ---------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/budgeting/test/tasks/cushion-math.test.ts` | test (pure unit) | transform | No existing pure-math test file in `packages/budgeting/test/`. The shape mirrors any standard bun:test pure function test — `describe('cushion math') > it('returns shortfall when required > actual', ...)`. |

---

## Metadata

**Analog search scope:**

- `packages/budgeting/src/{adapters/persistence,application,ports,domain}/`
- `apps/api/src/routes/`
- `apps/worker/src/handlers/`
- `apps/web/src/components/{budgeting,settings,onboarding,onboarding/steps}/`
- `apps/web/e2e/features/`
- `tests/tenant-leak/`
- `drizzle/`

**Files scanned:** ~32 source files read end-to-end across the analog set.

**Pattern extraction date:** 2026-05-30

**Planner instructions:**

1. Wave 0 first: migration 0026 + new test scaffolds.
2. Wave 1: ports/adapters/application — generator emit + auto-resolve hooks.
3. Wave 2: Hono routes (POST resolve, GET cushion-summary, PATCH cushion_target_months).
4. Wave 3: Frontend components + i18n.
5. Wave 4: E2E rewrite.

Every Wave 1+ plan action MUST reference the analog file + the specific lines
listed in this document. Copy the pattern, change only the kind/payload/key.

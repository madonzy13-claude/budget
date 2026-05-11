# Phase 2: Budgeting & FX — Pattern Map

**Mapped:** 2026-05-09
**Files analyzed:** ~60 new/modified files across 9 plans
**Analogs found:** 58 / 60 (2 require RESEARCH.md fallback)

> Consumed by `gsd-planner`. Each Phase-2 file is anchored to a Phase-1 analog with concrete copy-paste excerpts. Where no analog exists (Idempotency middleware, FX adapter), the snippet from RESEARCH.md is the bootstrap.

---

## File Classification

### Drizzle schemas (`packages/platform/src/db/` or `packages/budgeting/src/adapters/persistence/`)

| New File                                                                              | Role                                    | Data Flow                       | Closest Analog                                                     | Match Quality                     |
| ------------------------------------------------------------------------------------- | --------------------------------------- | ------------------------------- | ------------------------------------------------------------------ | --------------------------------- |
| `packages/budgeting/src/adapters/persistence/accounts-schema.ts`                      | drizzle schema                          | tenant-scoped CRUD              | `packages/tenancy/src/adapters/persistence/schema.ts` (workspaces) | exact                             |
| `packages/budgeting/src/adapters/persistence/categories-schema.ts`                    | drizzle schema                          | tenant-scoped CRUD              | `packages/tenancy/src/adapters/persistence/schema.ts`              | exact                             |
| `packages/budgeting/src/adapters/persistence/category-limits-schema.ts`               | drizzle schema (effective-dated)        | tenant-scoped CRUD + SCD-2      | `packages/tenancy/src/adapters/persistence/shares-schema.ts`       | role-match (composite PK pattern) |
| `packages/budgeting/src/adapters/persistence/budget-templates-schema.ts`              | drizzle schema                          | tenant-scoped CRUD              | `packages/tenancy/src/adapters/persistence/schema.ts`              | exact                             |
| `packages/budgeting/src/adapters/persistence/recurring-rules-schema.ts`               | drizzle schema                          | tenant-scoped CRUD              | `packages/tenancy/src/adapters/persistence/schema.ts`              | exact                             |
| `packages/budgeting/src/adapters/persistence/recurring-drafts-schema.ts`              | drizzle schema (mutable)                | tenant-scoped CRUD              | `packages/tenancy/src/adapters/persistence/schema.ts`              | exact                             |
| `packages/budgeting/src/adapters/persistence/category-share-overrides-schema.ts`      | drizzle schema                          | tenant-scoped + sum-100 trigger | `packages/tenancy/src/adapters/persistence/shares-schema.ts`       | exact                             |
| `packages/budgeting/src/adapters/persistence/fx-rates-schema.ts`                      | drizzle schema (no RLS, reference data) | infra-scoped read-mostly        | `packages/platform/src/outbox/schema.ts`                           | role-match (no-RLS infra table)   |
| `packages/budgeting/src/adapters/persistence/spending-projection-schema.ts`           | drizzle schema (projection)             | tenant-scoped read-after-write  | `packages/platform/src/db/expense-ledger.ts`                       | role-match                        |
| `packages/budgeting/src/adapters/persistence/supported-currencies-schema.ts`          | drizzle schema (no RLS)                 | infra-scoped read-mostly        | `packages/platform/src/outbox/schema.ts`                           | role-match                        |
| `packages/budgeting/src/adapters/persistence/workspace-budget-mode-history-schema.ts` | drizzle schema (effective-dated)        | tenant-scoped CRUD              | `packages/tenancy/src/adapters/persistence/schema.ts`              | role-match                        |
| `packages/platform/src/idempotency/schema.ts`                                         | drizzle schema                          | tenant+user-scoped infra        | `packages/platform/src/audit/schema.ts`                            | exact                             |
| `packages/platform/src/db/expense-ledger.ts` (MODIFY)                                 | drizzle schema (ALTER)                  | append-only ledger              | self (existing)                                                    | self                              |

### Domain entities (`packages/budgeting/src/domain/`)

| New File                                            | Role                | Data Flow               | Closest Analog                             | Match Quality                  |
| --------------------------------------------------- | ------------------- | ----------------------- | ------------------------------------------ | ------------------------------ |
| `packages/budgeting/src/domain/account.ts`          | aggregate root      | pure logic              | `packages/tenancy/src/domain/workspace.ts` | exact                          |
| `packages/budgeting/src/domain/category.ts`         | aggregate root      | pure logic              | `packages/tenancy/src/domain/workspace.ts` | exact                          |
| `packages/budgeting/src/domain/category-limit.ts`   | value object        | pure logic              | `packages/tenancy/src/domain/share.ts`     | exact                          |
| `packages/budgeting/src/domain/transaction.ts`      | aggregate root      | pure logic + Money math | `packages/tenancy/src/domain/workspace.ts` | role-match                     |
| `packages/budgeting/src/domain/recurring-rule.ts`   | aggregate root      | cadence-math            | `packages/tenancy/src/domain/workspace.ts` | role-match                     |
| `packages/budgeting/src/domain/share-validation.ts` | validator (sum-100) | pure logic              | `packages/tenancy/src/domain/share.ts`     | exact (reuse `validateShares`) |
| `packages/budgeting/src/domain/events.ts`           | event types         | type defs               | `packages/tenancy/src/domain/events.ts`    | exact                          |

### Ports (`packages/budgeting/src/ports/`)

| New File                                                   | Role           | Data Flow             | Closest Analog                                 | Match Quality |
| ---------------------------------------------------------- | -------------- | --------------------- | ---------------------------------------------- | ------------- |
| `packages/budgeting/src/ports/account-repo.ts`             | port interface | abstract CRUD         | `packages/tenancy/src/ports/workspace-repo.ts` | exact         |
| `packages/budgeting/src/ports/category-repo.ts`            | port interface | abstract CRUD         | `packages/tenancy/src/ports/workspace-repo.ts` | exact         |
| `packages/budgeting/src/ports/category-limit-repo.ts`      | port interface | effective-dated SCD-2 | `packages/tenancy/src/ports/member-repo.ts`    | role-match    |
| `packages/budgeting/src/ports/transaction-repo.ts`         | port interface | append-only ledger    | `packages/tenancy/src/ports/member-repo.ts`    | role-match    |
| `packages/budgeting/src/ports/recurring-rule-repo.ts`      | port interface | CRUD + cadence        | `packages/tenancy/src/ports/workspace-repo.ts` | role-match    |
| `packages/budgeting/src/ports/recurring-draft-repo.ts`     | port interface | mutable CRUD          | `packages/tenancy/src/ports/member-repo.ts`    | role-match    |
| `packages/budgeting/src/ports/budget-template-repo.ts`     | port interface | CRUD                  | `packages/tenancy/src/ports/workspace-repo.ts` | exact         |
| `packages/budgeting/src/ports/fx-rate-cache-repo.ts`       | port interface | read-write cache      | `packages/tenancy/src/ports/member-repo.ts`    | role-match    |
| `packages/budgeting/src/ports/spending-projection-repo.ts` | port interface | upsert projection     | `packages/tenancy/src/ports/member-repo.ts`    | role-match    |
| `packages/platform/src/idempotency/repo.ts`                | port interface | tenant+user cache     | `packages/platform/src/audit/writer.ts`        | role-match    |

### Adapters (Drizzle persistence)

| New File                                                                  | Role                    | Data Flow                                                   | Closest Analog                                                                                  | Match Quality |
| ------------------------------------------------------------------------- | ----------------------- | ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ------------- |
| `packages/budgeting/src/adapters/persistence/account-repo.ts`             | drizzle adapter         | tenant-scoped CRUD                                          | `packages/tenancy/src/adapters/persistence/workspace-repo.ts` (`DrizzleMemberShareRepo.update`) | exact         |
| `packages/budgeting/src/adapters/persistence/category-repo.ts`            | drizzle adapter         | tenant-scoped CRUD                                          | same                                                                                            | exact         |
| `packages/budgeting/src/adapters/persistence/category-limit-repo.ts`      | drizzle adapter (SCD-2) | effective-dated                                             | same + RESEARCH.md SQL                                                                          | role-match    |
| `packages/budgeting/src/adapters/persistence/transaction-repo.ts`         | drizzle adapter         | ledger writer + projection upsert + outbox emit (single tx) | `DrizzleMemberShareRepo.update` (writeAudit + writeOutbox in one tx)                            | exact         |
| `packages/budgeting/src/adapters/persistence/recurring-rule-repo.ts`      | drizzle adapter         | CRUD + audit                                                | `DrizzleMemberShareRepo.update`                                                                 | exact         |
| `packages/budgeting/src/adapters/persistence/recurring-draft-repo.ts`     | drizzle adapter         | mutable CRUD                                                | `DrizzleWorkspaceRepo.findById/listMembers`                                                     | role-match    |
| `packages/budgeting/src/adapters/persistence/budget-template-repo.ts`     | drizzle adapter         | CRUD + bulk apply                                           | `DrizzleMemberShareRepo.update`                                                                 | role-match    |
| `packages/budgeting/src/adapters/persistence/fx-rate-cache-repo.ts`       | drizzle adapter         | upsert + most-recent-prior                                  | `DrizzleWorkspaceRepo.findById`                                                                 | role-match    |
| `packages/budgeting/src/adapters/persistence/spending-projection-repo.ts` | drizzle adapter         | upsert in same tx as ledger                                 | `DrizzleMemberShareRepo.update`                                                                 | role-match    |
| `packages/budgeting/src/adapters/fx/frankfurter.ts`                       | external HTTP adapter   | provider integration                                        | `packages/shared-kernel/src/ports/fx-provider.ts` (`InMemoryFxProvider`) + RESEARCH.md §3       | role-match    |
| `packages/platform/src/idempotency/repo.ts` (impl)                        | drizzle adapter         | infra cache                                                 | `packages/platform/src/audit/writer.ts`                                                         | exact         |

### Application services (`packages/budgeting/src/application/`)

| New File                                                        | Role     | Data Flow                           | Closest Analog                                               | Match Quality |
| --------------------------------------------------------------- | -------- | ----------------------------------- | ------------------------------------------------------------ | ------------- |
| `packages/budgeting/src/application/create-account.ts`          | use case | request-response                    | `packages/tenancy/src/application/create-workspace.ts`       | exact         |
| `packages/budgeting/src/application/create-category.ts`         | use case | request-response                    | same                                                         | exact         |
| `packages/budgeting/src/application/set-category-limit.ts`      | use case | SCD-2 update                        | `packages/tenancy/src/application/update-shares.ts`          | exact         |
| `packages/budgeting/src/application/create-transaction.ts`      | use case | ledger insert + projection + outbox | `packages/tenancy/src/application/update-shares.ts`          | exact         |
| `packages/budgeting/src/application/edit-transaction.ts`        | use case | append-only correction              | same                                                         | role-match    |
| `packages/budgeting/src/application/bulk-recategorize.ts`       | use case | batch correction rows               | same                                                         | role-match    |
| `packages/budgeting/src/application/search-transactions.ts`     | use case | FTS read                            | `packages/tenancy/src/application/list-active-workspaces.ts` | exact         |
| `packages/budgeting/src/application/create-recurring-rule.ts`   | use case | request-response                    | `packages/tenancy/src/application/create-workspace.ts`       | exact         |
| `packages/budgeting/src/application/confirm-recurring-draft.ts` | use case | ledger insert from draft            | `packages/tenancy/src/application/update-shares.ts`          | role-match    |
| `packages/budgeting/src/application/skip-recurring-draft.ts`    | use case | mutate draft + audit                | same                                                         | role-match    |
| `packages/budgeting/src/application/apply-budget-template.ts`   | use case | bulk SCD-2 inserts                  | same                                                         | role-match    |
| `packages/budgeting/src/application/set-share-overrides.ts`     | use case | shares CRUD with sum-100            | `packages/tenancy/src/application/update-shares.ts`          | exact         |
| `packages/budgeting/src/application/toggle-budget-mode.ts`      | use case | SCD-2 toggle                        | `packages/tenancy/src/application/update-shares.ts`          | role-match    |
| `packages/budgeting/src/application/adjust-account-balance.ts`  | use case | manual balance correction           | `packages/tenancy/src/application/update-shares.ts`          | role-match    |

### Contracts + factory + index

| New File                                      | Role           | Data Flow  | Closest Analog                              | Match Quality |
| --------------------------------------------- | -------------- | ---------- | ------------------------------------------- | ------------- |
| `packages/budgeting/src/contracts/api.ts`     | DTOs           | type defs  | `packages/tenancy/src/contracts/api.ts`     | exact         |
| `packages/budgeting/src/contracts/events.ts`  | event payloads | type defs  | `packages/tenancy/src/contracts/events.ts`  | exact         |
| `packages/budgeting/src/contracts/factory.ts` | DI module      | factory    | `packages/tenancy/src/contracts/factory.ts` | exact         |
| `packages/budgeting/src/index.ts`             | barrel         | re-exports | `packages/tenancy/src/index.ts`             | exact         |

### API routes (`apps/api/src/routes/`)

| New File                                  | Role               | Data Flow          | Closest Analog                                           | Match Quality |
| ----------------------------------------- | ------------------ | ------------------ | -------------------------------------------------------- | ------------- |
| `apps/api/src/routes/accounts.ts`         | hono route factory | CRUD HTTP          | `apps/api/src/routes/workspaces.ts`                      | exact         |
| `apps/api/src/routes/categories.ts`       | hono route factory | CRUD HTTP          | same                                                     | exact         |
| `apps/api/src/routes/category-limits.ts`  | hono route factory | SCD-2 HTTP         | same                                                     | exact         |
| `apps/api/src/routes/transactions.ts`     | hono route factory | CRUD + search HTTP | same                                                     | exact         |
| `apps/api/src/routes/recurring-rules.ts`  | hono route factory | CRUD HTTP          | same                                                     | exact         |
| `apps/api/src/routes/recurring-drafts.ts` | hono route factory | confirm/skip HTTP  | same                                                     | exact         |
| `apps/api/src/routes/budget-templates.ts` | hono route factory | CRUD + apply HTTP  | same                                                     | exact         |
| `apps/api/src/routes/fx.ts`               | hono route factory | read-cache HTTP    | `apps/api/src/routes/settings.ts`                        | exact         |
| `apps/api/src/routes/share-overrides.ts`  | hono route factory | shares HTTP        | `apps/api/src/routes/workspaces.ts` (PUT /shares)        | exact         |
| `apps/api/src/middleware/idempotency.ts`  | hono middleware    | header → cache     | `apps/api/src/middleware/rate-limit.ts` + RESEARCH.md §1 | role-match    |
| `apps/api/src/boot.ts` (MODIFY)           | DI bootstrap       | factory wire-up    | self (existing)                                          | self          |
| `apps/api/src/app.ts` (MODIFY)            | route registration | middleware chain   | self (existing)                                          | self          |

### Worker handlers (`apps/worker/src/handlers/`)

| New File                                               | Role               | Data Flow             | Closest Analog                                | Match Quality |
| ------------------------------------------------------ | ------------------ | --------------------- | --------------------------------------------- | ------------- |
| `apps/worker/src/handlers/fx-daily-fetch.ts`           | pg-boss handler    | scheduled cron        | `apps/worker/src/handlers/outbox-dispatch.ts` | exact         |
| `apps/worker/src/handlers/recurring-engine.ts`         | pg-boss handler    | per-tenant scan       | same                                          | exact         |
| `apps/worker/src/handlers/budgeting-reconciliation.ts` | pg-boss handler    | scheduled drift check | same                                          | exact         |
| `apps/worker/src/handlers/idempotency-cleanup.ts`      | pg-boss handler    | TTL sweep             | same                                          | exact         |
| `apps/worker/src/worker.ts` (MODIFY)                   | queue registration | startup               | self (existing)                               | self          |

### Migrator + post-migration SQL

| New File                                                    | Role                      | Data Flow          | Closest Analog                 | Match Quality |
| ----------------------------------------------------------- | ------------------------- | ------------------ | ------------------------------ | ------------- |
| `drizzle/00XX_phase2_budgeting.sql` (drizzle-kit generated) | migration                 | DDL                | existing `drizzle/0001_*.sql`  | exact         |
| `apps/migrator/post-migration.sql` (APPEND)                 | post-migration RLS/REVOKE | DDL                | self (existing)                | self          |
| `scripts/replay-budgeting.ts`                               | CLI                       | replay-from-ledger | `apps/migrator/src/migrate.ts` | role-match    |

### Web UI (`apps/web/src/components/budgeting/` and `apps/web/src/app/[locale]/(app)/`)

| New File                                                         | Role                    | Data Flow                         | Closest Analog                                                                                                    | Match Quality |
| ---------------------------------------------------------------- | ----------------------- | --------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ------------- |
| `apps/web/src/components/budgeting/account-form.tsx`             | RHF form                | client mutation                   | `apps/web/src/components/workspace/create-workspace-form.tsx`                                                     | exact         |
| `apps/web/src/components/budgeting/category-form.tsx`            | RHF form                | client mutation                   | same                                                                                                              | exact         |
| `apps/web/src/components/budgeting/transaction-capture-form.tsx` | RHF form (sheet drawer) | client mutation + FX live preview | same                                                                                                              | exact         |
| `apps/web/src/components/budgeting/recurring-rule-form.tsx`      | RHF form (dialog)       | client mutation                   | same                                                                                                              | exact         |
| `apps/web/src/components/budgeting/budget-template-form.tsx`     | RHF form (dialog)       | client mutation                   | same                                                                                                              | exact         |
| `apps/web/src/components/budgeting/share-override-editor.tsx`    | RHF form (inline)       | client mutation + sum-100         | `apps/web/src/components/settings/sessions-list.tsx` (UI) + `apps/web/src/components/workspace/shares-editor.tsx` | exact         |
| `apps/web/src/components/budgeting/transaction-list.tsx`         | list view               | RSC + client filter               | `apps/web/src/components/workspace/workspace-switcher.tsx`                                                        | role-match    |
| `apps/web/src/components/budgeting/fx-freshness-badge.tsx`       | display                 | pure render                       | `apps/web/src/components/common/currency-picker.tsx`                                                              | role-match    |
| `apps/web/src/components/budgeting/budget-bar.tsx`               | display                 | pure render                       | same                                                                                                              | role-match    |
| `apps/web/src/components/budgeting/pending-drafts-inbox.tsx`     | list + actions          | RSC + client mutation             | `apps/web/src/components/workspace/workspace-switcher.tsx`                                                        | role-match    |
| `apps/web/src/app/[locale]/(app)/transactions/page.tsx`          | RSC page                | server fetch                      | (existing workspace pages)                                                                                        | role-match    |
| `apps/web/src/app/[locale]/(app)/budget/page.tsx`                | RSC page                | server fetch                      | same                                                                                                              | role-match    |
| `apps/web/src/app/[locale]/(app)/accounts/page.tsx`              | RSC page                | server fetch                      | same                                                                                                              | role-match    |
| `apps/web/src/app/[locale]/(app)/recurring/page.tsx`             | RSC page                | server fetch                      | same                                                                                                              | role-match    |
| `apps/web/messages/{en,pl,uk}.json` (MODIFY)                     | i18n                    | static strings                    | self (existing)                                                                                                   | self          |

### Tests

| New File                                                         | Role                 | Data Flow                       | Closest Analog                                          | Match Quality |
| ---------------------------------------------------------------- | -------------------- | ------------------------------- | ------------------------------------------------------- | ------------- |
| `packages/budgeting/test/account-domain.test.ts`                 | bun:test unit        | pure                            | `packages/tenancy/test/domain-unit.test.ts`             | exact         |
| `packages/budgeting/test/category-limit-effective-dated.test.ts` | bun:test integration | testcontainer + SCD-2           | `packages/tenancy/test/shares-audit.test.ts`            | exact         |
| `packages/budgeting/test/transaction-ledger-insert.test.ts`      | bun:test integration | testcontainer + ledger + outbox | same                                                    | exact         |
| `packages/budgeting/test/recurring-engine.test.ts`               | bun:test integration | testcontainer + cron + Temporal | same                                                    | role-match    |
| `packages/budgeting/test/frankfurter-adapter.test.ts`            | bun:test unit        | mocked fetch + cache            | `packages/tenancy/test/domain-unit.test.ts`             | role-match    |
| `packages/budgeting/test/idempotency-middleware.test.ts`         | bun:test integration | testcontainer + dual POST       | same                                                    | role-match    |
| `packages/budgeting/test/share-overrides-sum-trigger.test.ts`    | bun:test integration | DB constraint trigger           | `packages/tenancy/test/shares-audit.test.ts`            | exact         |
| `packages/budgeting/test/helpers.ts`                             | test util            | shared sign-up + workspace      | `packages/tenancy/test/helpers.ts`                      | exact         |
| `apps/api/test/routes/transactions.test.ts`                      | bun:test mocked HTTP | hono.request                    | `apps/api/test/routes/workspaces.test.ts`               | exact         |
| `apps/api/test/routes/accounts.test.ts`                          | bun:test mocked HTTP | same                            | same                                                    | exact         |
| `apps/web/test/transaction-capture-form.test.tsx`                | vitest + RTL         | component                       | `apps/web/test/workspace-switcher.test.tsx`             | exact         |
| `apps/web/test/fx-freshness-badge.test.tsx`                      | vitest + RTL         | component                       | same                                                    | exact         |
| `apps/web/test/share-override-editor.test.tsx`                   | vitest + RTL         | component                       | same                                                    | exact         |
| `tests/e2e/features/budget/create-transaction.feature`           | gherkin              | golden path                     | `tests/e2e/features/workspace/create-workspace.feature` | exact         |
| `tests/e2e/features/budget/edit-transaction-correction.feature`  | gherkin              | golden path                     | same                                                    | exact         |
| `tests/e2e/features/budget/recurring-confirm.feature`            | gherkin              | golden path                     | same                                                    | exact         |
| `tests/e2e/features/budget/fx-stale-badge.feature`               | gherkin              | golden path                     | same                                                    | exact         |
| `tests/e2e/pages/TransactionsPage.ts`                            | page object          | playwright                      | `tests/e2e/pages/CreateWorkspacePage.ts`                | exact         |
| `tests/e2e/pages/BudgetPage.ts`                                  | page object          | playwright                      | same                                                    | exact         |
| `tests/e2e/steps/budget.steps.ts`                                | playwright-bdd steps | gherkin glue                    | `tests/e2e/steps/workspace.steps.ts`                    | exact         |

---

## Pattern Assignments

### `packages/budgeting/src/adapters/persistence/accounts-schema.ts` (drizzle schema, tenant-scoped CRUD)

**Analog:** `packages/tenancy/src/adapters/persistence/schema.ts` lines 17-44 (`workspaces` table + RLS policy)

**Imports pattern (lines 1-10):**

```typescript
import { sql } from "drizzle-orm";
import {
  pgPolicy,
  pgEnum,
  uuid,
  text,
  integer,
  timestamp,
} from "drizzle-orm/pg-core";
import { tenancy, appRole, workerRole } from "@budget/platform";
```

**Schema + RLS pattern (lines 17-44):**

```typescript
export const workspaceKind = tenancy.enum("workspace_kind", [
  "PRIVATE",
  "SHARED",
]);

export const workspaces = tenancy.table(
  "workspaces",
  {
    id: uuid("id").primaryKey(),
    /* ...columns... */
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    pgPolicy("workspaces_tenant_isolation", {
      as: "permissive",
      for: "all",
      to: [appRole, workerRole],
      using: sql`${t.id} = ANY(coalesce(nullif(current_setting('app.tenant_ids', true), ''), '{}')::uuid[])`,
      withCheck: sql`${t.id} = ANY(coalesce(nullif(current_setting('app.tenant_ids', true), ''), '{}')::uuid[])`,
    }),
  ],
);
```

**Phase-2 substitution:** swap `tenancy` for `budgeting` (already declared in `packages/platform/src/db/schemas.ts:9`); use `tenant_id` (UUID, not workspace_id) on the policy. Phase-2 budgeting tables ALL use `tenantId` matching `expense_ledger`.

---

### `packages/budgeting/src/adapters/persistence/category-share-overrides-schema.ts` (drizzle schema + sum-100 trigger)

**Analog:** `packages/tenancy/src/adapters/persistence/shares-schema.ts` lines 1-40 (composite PK + RLS) + `apps/migrator/post-migration.sql` lines 330-348 (deferred constraint trigger).

**Composite-PK schema pattern (shares-schema.ts:14-40):**

```typescript
export const sharedWorkspaceMemberShares = tenancy.table(
  "shared_workspace_member_shares",
  {
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id),
    userId: uuid("user_id").notNull(),
    percentage: numeric("percentage", { precision: 5, scale: 2 })
      .notNull()
      .default("0"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.workspaceId, t.userId] }),
    pgPolicy("shares_tenant_isolation", {
      /* same RLS as above */
    }),
  ],
);
```

**Sum-100 deferred trigger (post-migration.sql:331-346):**

```sql
CREATE OR REPLACE FUNCTION budgeting.category_share_overrides_sum_check() RETURNS trigger AS $$
DECLARE total numeric(7,4); cat_id uuid;
BEGIN
  cat_id := COALESCE(NEW.category_id, OLD.category_id);
  SELECT coalesce(sum(percentage), 0) INTO total
    FROM budgeting.category_share_overrides WHERE category_id = cat_id;
  IF abs(total - 100) > 0.005 AND total > 0 THEN
    RAISE EXCEPTION 'category_share_overrides for category % must sum to 100 (got %)', cat_id, total;
  END IF;
  RETURN NULL;
END $$ LANGUAGE plpgsql;
CREATE CONSTRAINT TRIGGER category_shares_sum_invariant
  AFTER INSERT OR UPDATE OR DELETE ON budgeting.category_share_overrides
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION budgeting.category_share_overrides_sum_check();
```

---

### `packages/budgeting/src/adapters/persistence/fx-rates-schema.ts` (no-RLS reference data)

**Analog:** `packages/platform/src/outbox/schema.ts` (entire file) — table without `pgPolicy()`, GRANT-restricted in post-migration.sql.

**Pattern (outbox/schema.ts:1-23):**

```typescript
import { uuid, text, jsonb, timestamp } from "drizzle-orm/pg-core";
import { sharedKernel } from "../db/schemas";

/**
 * Pitfall 10: NO pgPolicy — this is infrastructure, not domain.
 * Access control is GRANT-based (post-migration.sql).
 */
export const outbox = sharedKernel.table("outbox", {
  id: uuid("id").primaryKey().defaultRandom(),
  /* ...columns... */
});
```

**Phase-2 application:** `fx_rates` and `supported_currencies` are reference data. NO `pgPolicy()`. Use `budgeting.table(...)` without the third tuple argument. Add GRANTs in `post-migration.sql` (SELECT for app_role and worker_role; INSERT/UPDATE for worker_role only — daily fetcher writes).

---

### `packages/platform/src/db/expense-ledger.ts` (MODIFY — ALTER columns)

**Analog:** self (existing — `packages/platform/src/db/expense-ledger.ts:18-48`).

**Phase-2 ADD COLUMN list (per RESEARCH.md §9 + D-05-b):**

- `transaction_date date NOT NULL` (user-supplied date)
- `note text` (FTS source)
- `account_id uuid NOT NULL`
- `category_id uuid` (NULL for transfers)
- `kind text NOT NULL CHECK (kind IN ('EXPENSE','INCOME','TRANSFER'))`
- `transfer_group_id uuid` (NULL except transfer pairs)
- DROP `corrected_by_id` per D-05-a; index `corrects_id` instead
- ADD `note_tsv tsvector GENERATED ALWAYS AS (to_tsvector('simple', coalesce(note, ''))) STORED`
- ADD GIN index on `note_tsv`; B-tree on `(tenant_id, transaction_date DESC)`, `(tenant_id, category_id, transaction_date DESC)`, `(tenant_id, account_id, transaction_date DESC)`, `(corrects_id)`

Migration generated by `bunx drizzle-kit generate` after schema edit; lands in `drizzle/`.

---

### `packages/budgeting/src/adapters/persistence/transaction-repo.ts` (drizzle adapter — ledger writer in single tx)

**Analog:** `packages/tenancy/src/adapters/persistence/workspace-repo.ts` lines 141-191 (`DrizzleMemberShareRepo.update`) — canonical pattern of "tenant tx + writeAudit + writeOutbox".

**Imports pattern (workspace-repo.ts:1-19):**

```typescript
import { sql } from "drizzle-orm";
import {
  withTenantTx,
  withUserContext,
  withInfraTx,
  writeAudit,
  writeOutbox,
} from "@budget/platform";
import { TenantId, UserId } from "@budget/shared-kernel";
import type {} from /* contracts */ "../../contracts/api";
import type {} from /* port */ "../../ports/...";
```

**Single-tx ledger insert + projection upsert + outbox emit (workspace-repo.ts:148-189):**

```typescript
const tid = TenantId(workspaceId);
const aid = UserId(actorUserId);
const r = await withTenantTx(tid, aid, async (tx) => {
  // Validate sum=100 in domain first (defense in depth; trigger is the second wall)
  const v = validateShares(shares);
  if (v.isErr()) throw v.error;

  // Snapshot before
  const before = await tx.execute(
    sql`SELECT user_id, percentage FROM tenancy.shared_workspace_member_shares WHERE workspace_id = ${workspaceId}`,
  );

  // ... domain mutation via tx.execute(sql`...`) ...

  // Audit
  await writeAudit(tx, {
    tenantId: tid,
    entityType: "shared_workspace_member_shares",
    entityId: workspaceId,
    action: "update",
    actorUserId: aid,
    before: before.rows,
    after: shares,
  });

  // Outbox
  await writeOutbox(tx, {
    tenantId: tid,
    aggregateType: "workspace",
    aggregateId: workspaceId,
    eventType: "tenancy.shares.updated",
    payload: { shares, actorUserId },
  });
});
if (r.isErr()) throw r.error;
```

**Phase-2 ledger-insert flavour:** inside the same `withTenantTx` block —

1. `INSERT INTO budgeting.expense_ledger (...)` (drizzle insert);
2. `UPDATE budgeting.accounts SET current_balance = current_balance ± amount WHERE id = ${accountId}` (D-05-e synchronous balance);
3. UPSERT `budgeting.spending_by_category_month` (ENGR-14);
4. `writeAudit({ entityType: "transaction", action: "create", ... })` is OPTIONAL — ledger IS its own audit chain (D-01-b);
5. `writeOutbox({ eventType: "budgeting.transaction.created", ... })`.

**Critical:** all 5 steps in the SAME `withTenantTx` callback. Pitfall 7 (RESEARCH.md) — outbox MUST share tx with ledger insert.

---

### `packages/budgeting/src/adapters/persistence/category-limit-repo.ts` (effective-dated SCD-2)

**Analog:** `packages/tenancy/src/adapters/persistence/workspace-repo.ts:148-189` (writeAudit + writeOutbox pattern) plus RESEARCH.md §4 SQL.

**Set-new-limit SQL (RESEARCH.md:204-228):**

```typescript
// Inside withTenantTx(tid, aid, async (tx) => { ... })
// 1. Snapshot the previous open row
const before = await tx.execute<{
  id: string;
  normal_amount: string;
  cushion_amount: string;
}>(sql`
  SELECT id, normal_amount, cushion_amount FROM budgeting.category_limits
   WHERE category_id = ${categoryId} AND effective_to IS NULL
`);

// 2. Close it (ON CONFLICT idempotent for same-day re-edits — Pitfall 5)
await tx.execute(sql`
  UPDATE budgeting.category_limits
     SET effective_to = ${effectiveFrom}::date - INTERVAL '1 day'
   WHERE category_id = ${categoryId} AND effective_to IS NULL
`);

// 3. Insert new open-ended row
await tx.execute(sql`
  INSERT INTO budgeting.category_limits
    (tenant_id, category_id, normal_amount, normal_currency, cushion_amount, cushion_currency, effective_from, actor_user_id)
  VALUES (${tid}, ${categoryId}, ${normalAmount}, ${normalCurrency}, ${cushionAmount}, ${cushionCurrency}, ${effectiveFrom}, ${aid})
`);

// 4. Audit + outbox
await writeAudit(tx, {
  tenantId: tid,
  entityType: "category_limit",
  entityId: categoryId,
  action: "update",
  actorUserId: aid,
  before: before.rows[0],
  after: { normalAmount, cushionAmount },
});
await writeOutbox(tx, {
  tenantId: tid,
  aggregateType: "category_limit",
  aggregateId: categoryId,
  eventType: "budgeting.limit.changed",
  payload: {
    /* ... */
  },
});
```

**Point-in-time read (RESEARCH.md:642-650):**

```typescript
const limit = await tx.execute(sql`
  SELECT * FROM budgeting.category_limits
   WHERE category_id = ${categoryId}
     AND effective_from <= ${reportDate}
     AND (effective_to IS NULL OR effective_to >= ${reportDate})
   ORDER BY effective_from DESC LIMIT 1
`);
```

---

### `packages/budgeting/src/adapters/fx/frankfurter.ts` (FxProvider adapter)

**Analog:** `packages/shared-kernel/src/ports/fx-provider.ts:11-29` (`InMemoryFxProvider`) + RESEARCH.md §3 + research code example (lines 590-622).

**Port interface (fx-provider.ts:3-9):**

```typescript
export interface FxProvider {
  rateAsOf(
    from: Currency,
    to: Currency,
    date: Date,
  ): Promise<{ rate: string; provider: string; isStale: boolean }>;
}
```

**Frankfurter impl skeleton (RESEARCH.md:586-623):**

```typescript
import type { FxProvider } from "@budget/shared-kernel";
import type { FxRateCacheRepo } from "../../ports/fx-rate-cache-repo";

export class FrankfurterFxProvider implements FxProvider {
  constructor(private readonly cache: FxRateCacheRepo) {}

  async rateAsOf(from: Currency, to: Currency, date: Date) {
    if (from === to)
      return { rate: "1", provider: "frankfurter", isStale: false };
    const yyyymmdd = formatDateUTC(date);
    const cached = await this.cache.lookup(from, to, yyyymmdd);
    if (cached)
      return {
        rate: cached.rate,
        provider: "frankfurter",
        isStale: cached.date !== yyyymmdd,
      };
    try {
      const r = await fetch(
        `https://api.frankfurter.dev/v2/rate/${from}/${to}?date=${yyyymmdd}`,
      );
      if (!r.ok) throw new Error(`frankfurter ${r.status}`);
      const j = (await r.json()) as { date: string; rate: number };
      await this.cache.upsert(from, to, j.date, String(j.rate));
      return {
        rate: String(j.rate),
        provider: "frankfurter",
        isStale: j.date !== yyyymmdd,
      };
    } catch {
      const fallback = await this.cache.mostRecentPrior(from, to, yyyymmdd);
      if (!fallback) throw new Error("NoFxRateAvailable");
      return { rate: fallback.rate, provider: "frankfurter", isStale: true };
    }
  }
}
```

**Anti-corruption boundary (ENGR-09):** Frankfurter's `{rate: number}` is converted to `string` immediately. The raw provider type does NOT cross the adapter boundary. Domain consumers see only `Money`-compatible string.

---

### `packages/budgeting/src/domain/account.ts` (aggregate root)

**Analog:** `packages/tenancy/src/domain/workspace.ts:1-38` (full file).

**Pattern:**

```typescript
import { ok, err, type Result } from "@budget/shared-kernel";

export class Workspace {
  constructor(
    public readonly id: string,
    public readonly slug: string,
    public name: string,
    public readonly kind: WorkspaceKind,
    public readonly default_currency: string, // readonly enforces D-04
    public readonly ownerUserId: string,
    public memberCount: number,
    public readonly createdAt: Date,
  ) {}

  canAcceptMember(): Result<void, Error> {
    if (this.kind === "PRIVATE" && this.memberCount >= 1) {
      return err(
        new Error(
          "PRIVATE workspaces accept only the owner. Convert to SHARED first.",
        ),
      );
    }
    return ok(undefined);
  }
  /* ... domain methods that return Result<void, Error> ... */
}
```

**Phase-2 application:** `Account` exposes `canBeArchived(hasTransactions: boolean)`, `canChangeCurrency(): Result<void, Error>` (return err — currency immutable). NO `Money` math in fields — store `currency: Currency` and `currentBalance: Money` (Money composed at read-side from `(amount_str, currency)`).

---

### `packages/budgeting/src/domain/share-validation.ts` (sum-100 validator)

**Analog:** `packages/tenancy/src/domain/share.ts:1-29` (entire file — direct reuse).

**Pattern:**

```typescript
import Big from "big.js";
import { ok, err, type Result } from "@budget/shared-kernel";

export interface ShareEntry {
  userId: string;
  percentage: string;
}

export function validateShares(entries: ShareEntry[]): Result<void, Error> {
  if (entries.length === 0)
    return err(new Error("At least one share required"));
  let sum = new Big(0);
  for (const e of entries) {
    const p = new Big(e.percentage);
    if (p.lt(0) || p.gt(100))
      return err(
        new Error(
          `Share for ${e.userId} out of range [0,100]: ${e.percentage}`,
        ),
      );
    sum = sum.plus(p);
  }
  if (sum.minus(100).abs().gt("0.01")) {
    return err(new Error(`Shares must sum to 100; got ${sum.toString()}`));
  }
  return ok(undefined);
}
```

**Phase-2 application:** budgeting context REUSES the existing tenancy `validateShares` for category overrides — DO NOT re-implement. Import from `@budget/tenancy` (or, if dep-cruiser forbids cross-context, copy verbatim into `budgeting/src/domain/share-validation.ts`).

---

### `packages/budgeting/src/application/create-transaction.ts` (use case orchestration)

**Analog:** `packages/tenancy/src/application/update-shares.ts:1-43` (full file — Result<void, Error> return; deps via interface).

**Pattern:**

```typescript
import { ok, err, type Result } from "@budget/shared-kernel";
import type { TransactionRepo } from "../ports/transaction-repo";
import type { FxProvider } from "@budget/shared-kernel";
import type { AccountRepo } from "../ports/account-repo";

export interface CreateTransactionInput {
  workspaceId: string;
  actorUserId: string;
  accountId: string;
  categoryId: string | null;
  kind: "EXPENSE" | "INCOME" | "TRANSFER";
  amount: string;
  currency: string;
  transactionDate: string; // ISO YYYY-MM-DD
  note?: string;
  /* if currency != workspace.default_currency: */
  fxRate?: string;
  fxRateDate?: string;
}

export async function createTransaction(
  deps: {
    transactionRepo: TransactionRepo;
    accountRepo: AccountRepo;
    fxProvider: FxProvider;
  },
  input: CreateTransactionInput,
): Promise<Result<{ transactionId: string }, Error>> {
  try {
    // 1. Validate workspace + account + category exist (ownership check)
    // 2. If currency differs and no fxRate provided OR rate is >60min old: re-fetch (D-02-d server validation)
    // 3. Delegate to repo (which writes ledger + projection + outbox in one withTenantTx)
    const id = await deps.transactionRepo.insert(input);
    return ok({ transactionId: id });
  } catch (e) {
    return err(e as Error);
  }
}
```

**Critical:** application layer does NOT call `withTenantTx`. Repo encapsulates the tx. Application-layer is pure orchestration + Result wrapping.

---

### `apps/api/src/routes/transactions.ts` (hono route factory)

**Analog:** `apps/api/src/routes/workspaces.ts:1-263` (full file).

**Imports + factory shape (workspaces.ts:1-15):**

```typescript
import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { sql } from "drizzle-orm";
import type { BootedDeps } from "../boot";
import { UserId } from "@budget/shared-kernel";

export function workspacesRoutesFactory(deps: BootedDeps) {
  const r = new Hono();
  /* ... Zod schemas + handlers ... */
  return r;
}
```

**POST handler with Zod validation + session check (workspaces.ts:46-74):**

```typescript
const createSchema = z.object({
  name: z.string().min(1).max(100),
  kind: z.enum(["PRIVATE", "SHARED"]),
  default_currency: z.string().regex(/^[A-Z]{3}$/),
});

r.post("/", zValidator("json", createSchema), async (c) => {
  const session = c.get("session");
  if (!session) return c.json({ error: "unauthorized" }, 401);

  const body = c.req.valid("json");
  try {
    const result = await deps.budgeting.createTransaction(/* ... */);
    if (result.isErr()) {
      const msg = result.error.message;
      if (/some_business_error/.test(msg)) return c.json({ error: msg }, 409);
      throw result.error;
    }
    return c.json({ id: result.value.transactionId }, 201);
  } catch (e) {
    /* error middleware re-throws */
    throw e;
  }
});
```

**PUT update flavor (workspaces.ts:220-233):**

```typescript
r.put("/:id/shares", zValidator("json", sharesSchema), async (c) => {
  const session = c.get("session");
  if (!session) return c.json({ error: "unauthorized" }, 401);
  const { id: workspaceId } = c.req.param();
  const body = c.req.valid("json");
  await deps.tenancy.memberShareRepo.update(
    workspaceId,
    body.shares,
    session.user.id,
  );
  return c.json({ ok: true });
});
```

---

### `apps/api/src/middleware/idempotency.ts` (Idempotency-Key middleware)

**Analog:** `apps/api/src/middleware/rate-limit.ts:55-77` (factory returning `MiddlewareHandler`) + RESEARCH.md §1 / lines 654-690.

**Factory shape (rate-limit.ts:55-77):**

```typescript
import type { MiddlewareHandler } from "hono";
import { HTTPException } from "hono/http-exception";

export function rateLimitMiddleware(opts: {
  windowSec: number;
  max: number;
}): MiddlewareHandler {
  return async (c, next) => {
    const session = c.get("session");
    const userId = session?.user.id ?? "anonymous";
    const ip =
      c.req.header("x-forwarded-for") ??
      c.req.header("cf-connecting-ip") ??
      "unknown";
    const key = `${userId}:${ip}:${c.req.path}`;
    if (!checkAndRecord(key, opts.windowSec, opts.max)) {
      throw new HTTPException(429, { message: "Too many requests..." });
    }
    await next();
  };
}
```

**Idempotency body (RESEARCH.md:654-690):**

```typescript
import { createHash } from "node:crypto";

export function idempotencyMiddleware(deps: {
  repo: IdempotencyRepo;
}): MiddlewareHandler {
  return async (c, next) => {
    if (!["POST", "PUT", "PATCH", "DELETE"].includes(c.req.method))
      return next();
    const key = c.req.header("Idempotency-Key");
    if (!key) return next();
    const tenantIds = c.get("tenantIds");
    const session = c.get("session");
    const tenantId = tenantIds[0]; // Phase-2 routes are single-tenant writes
    const userId = session?.user.id;
    if (!tenantId || !userId) return next(); // safe fall-through

    const route = c.req.path;
    const bodyText = await c.req.raw.clone().text();
    const sha256Hex = (s: string) =>
      createHash("sha256").update(s).digest("hex");
    const bodyHash = sha256Hex(bodyText);
    const scopeHash = sha256Hex(`${tenantId}|${userId}|${route}|${key}`);

    const cached = await deps.repo.lookup(scopeHash);
    if (cached) {
      if (cached.bodyHash !== bodyHash) {
        return c.json(
          { error: "idempotency_key_reused_with_different_body" },
          422,
        );
      }
      return c.body(cached.responseBody, cached.responseStatus as 200);
    }
    await next();
    if (c.res.ok) {
      const respText = await c.res.clone().text();
      await deps.repo.insert({
        scopeHash,
        bodyHash,
        status: c.res.status,
        body: respText,
        ttlHours: 24,
      });
    }
  };
}
```

**Insertion in `app.ts`:** AFTER `tenantGuard`, BEFORE route registration (Pitfall 2).

---

### `apps/worker/src/handlers/fx-daily-fetch.ts` (pg-boss scheduled handler)

**Analog:** `apps/worker/src/handlers/outbox-dispatch.ts:1-7` (full file) + `apps/worker/src/worker.ts:5-15` (queue + schedule).

**Handler pattern:**

```typescript
// outbox-dispatch.ts (the entire file):
import { dispatchOutboxBatch } from "@budget/platform";
export async function handleOutboxTick() {
  const n = await dispatchOutboxBatch();
  if (n > 0) console.log(`[worker] dispatched ${n} outbox events`);
}
```

**Queue registration (worker.ts:5-15):**

```typescript
const boss = await getBoss();
await boss.createQueue("outbox-dispatch");
await boss.work(
  "outbox-dispatch",
  { pollingIntervalSeconds: 5, batchSize: 1 },
  async () => {
    await handleOutboxTick();
  },
);
await boss.schedule("outbox-dispatch", "*/1 * * * *");
```

**Phase-2 handlers:**

- `fx-daily-fetch` — schedule `"0 17 * * *"` with `tz: "Europe/Berlin"`. Iterate observed (base, quote) pairs in `expense_ledger` ∪ `workspaces.default_currency`. RESEARCH.md §3 step 1.
- `recurring-engine` — schedule `"0 6 * * *"` UTC. Per-tenant scan via `withTenantTx(tenantId, SYSTEM_USER_ID, ...)` (Pitfall 3). System user `00000000-0000-0000-0000-000000000001` seeded by Phase 2 migration (D-05-g).
- `budgeting-reconciliation` — `"0 * * * *"` (hourly). Compare projection to fresh aggregate-from-ledger; log/repair drift.
- `idempotency-cleanup` — `"30 * * * *"` (hourly). `DELETE FROM shared_kernel.idempotency_keys WHERE expires_at < now()`.

---

### `apps/web/src/components/budgeting/transaction-capture-form.tsx` (RHF form + sheet drawer)

**Analog:** `apps/web/src/components/workspace/create-workspace-form.tsx:1-241` (full file).

**Form scaffold pattern (create-workspace-form.tsx:1-72, 76-102):**

```typescript
"use client";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { CurrencyPicker } from "@/components/common/currency-picker";
import { api } from "@/lib/api-client";

export function CreateWorkspaceForm({ /* props */ }) {
  const t = useTranslations();
  const [serverError, setServerError] = useState<string | null>(null);
  const schema = useMemo(() => z.object({ /* fields */ }), [t]);
  const form = useForm({ resolver: zodResolver(schema), defaultValues: {/*...*/}, mode: "onBlur" });
  const { isSubmitting } = form.formState;

  async function onSubmit(values) {
    setServerError(null);
    try {
      const res = await api.workspaces.$post({ json: values });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { message?: string };
        setServerError(err.message ?? t("state.error.generic"));
        return;
      }
      const created = await res.json() as { id: string; name: string };
      toast.success(t("workspaces.create.success", { name: created.name }));
      onSuccess?.(created.id);
    } catch { setServerError(t("state.error.network")); }
  }

  return (<Form {...form}><form onSubmit={form.handleSubmit(onSubmit)}>{/* fields */}</form></Form>);
}
```

**Phase-2 additions specific to transaction form:**

- Wrap in `<Sheet>` (drawer) per UI-SPEC.md component inventory.
- Generate UUID v4 on form-mount; store in `useState`; submit via `Idempotency-Key` HTTP header on every retry of the same form (UI-SPEC §"Idempotency-Key Client Behavior").
- FX preview row appears when `currency !== workspace.default_currency` — fetch via `api.fx.rate.$get({ query: { from, to, date } })` debounced 400ms.
- Three-tab `Tabs` for Expense / Income / Transfer; transfer mode swaps category picker for second account picker.
- Pure render badge component `<FxFreshnessBadge fxRateDate={...} />` reuses next-intl `useFormatter().relativeTime()`.

---

### `apps/web/src/components/budgeting/share-override-editor.tsx` (sum-100 inline editor)

**Analog:** `apps/web/src/components/workspace/shares-editor.tsx` (existing — global TENT-13 share editor) PLUS pattern fragment from `create-workspace-form.tsx` (RHF + zodResolver).

**Phase-2 specific:** UI-SPEC §"Categories List > Category edit dialog" requires:

- Toggle checkbox "Override for this category"
- Per-member `<Input type="number">` percentage rows (pre-filled from global TENT-13)
- Live sum counter via `form.watch()` reduce — Save disabled when `Math.abs(sum - 100) > 0.005`
- Counter color: `text-[var(--trading-down)]` when ≠ 100; `text-[var(--trading-up)]` when = 100

---

### `packages/budgeting/test/transaction-ledger-insert.test.ts` (integration test)

**Analog:** `packages/tenancy/test/shares-audit.test.ts:1-179` (full file — best example of testcontainer + module factory + audit verification).

**Test scaffold (shares-audit.test.ts:1-44):**

```typescript
import { test, expect, beforeAll } from "bun:test";
import { startTestcontainer } from "@budget/db/test/testcontainer";
import { StdoutEmailSender } from "@budget/shared-kernel";
import { LibsodiumKeyStore, withInfraTx } from "@budget/platform";
import { sql } from "drizzle-orm";
import { createIdentityModule } from "@budget/identity";
import { createTenancyModule } from "@budget/tenancy";
import { signUpHelper as signUp } from "./helpers";

beforeAll(async () => {
  await startTestcontainer();
}, 120_000);

test("owner updates shares to sum=100 — audit_history row written (TENT-13, D-06)", async () => {
  const sender = new StdoutEmailSender();
  const tenancy = createTenancyModule({
    emailSender: sender,
    appUrl: "http://localhost:3000",
  });
  const identity = createIdentityModule({
    emailSender: sender,
    keyStore: new LibsodiumKeyStore(),
    additionalPlugins: [tenancy.organizationPlugin],
  });
  /* ... sign up users, create workspace, exercise application service ... */
});
```

**Audit verification via `withInfraTx` (shares-audit.test.ts:107-119):**

```typescript
const auditResult = await withInfraTx(async (tx) => {
  const r = await tx.execute<{ entity_id: string }>(
    sql`SELECT entity_id FROM shared_kernel.audit_history
        WHERE entity_type = 'shared_workspace_member_shares'
        AND entity_id = ${w.value.workspaceId}
        ORDER BY id DESC LIMIT 1`,
  );
  return r.rows[0] ?? null;
});
expect(auditResult.isOk()).toBe(true);
```

**Phase-2 application:** verify `expense_ledger` row inserted, `accounts.current_balance` updated, `spending_by_category_month` upserted, AND `outbox` row enqueued — all four asserted via `withInfraTx` SELECTs (tenancy GUC bypassed for diagnostics).

---

### `apps/api/test/routes/transactions.test.ts` (route smoke test)

**Analog:** `apps/api/test/routes/workspaces.test.ts:1-176` (full file).

**Mock pattern (workspaces.test.ts:5-44):**

```typescript
import { describe, it, expect, mock } from "bun:test";
import { Hono } from "hono";

mock.module("@budget/platform", () => ({
  withBootstrapUserContext: async (_userId, fn) => {
    const mockTx = { execute: async () => ({ rows: [{ ids: ["ws-001"] }] }) };
    const { ok } = await import("@budget/shared-kernel");
    return ok(await fn(mockTx));
  },
  withTenantTx: async (_id, _uid, fn) => {
    const { ok } = await import("@budget/shared-kernel");
    return ok(await fn({}));
  },
  // ... other mocked exports ...
}));

const { workspacesRoutesFactory } = await import("../../src/routes/workspaces");
```

**Test app builder (workspaces.test.ts:48-99):**

```typescript
function buildApp(session: unknown) {
  const app = new Hono();
  app.use(async (c, next) => {
    c.set("session", session as any);
    await next();
  });
  app.use(async (c, next) => {
    c.set("tenantIds", session ? ["ws-001"] : []);
    await next();
  });
  const fakeDeps = {
    /* stub repos with mock methods */
  } as any;
  app.route("/workspaces", workspacesRoutesFactory(fakeDeps));
  return app;
}

describe("POST /workspaces", () => {
  it("returns 201 with valid body and session", async () => {
    const app = buildApp({
      user: { id: "user-001", email: "test@test.com", locale: "en" },
    });
    const res = await app.request("/workspaces", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "My Workspace",
        kind: "PRIVATE",
        default_currency: "USD",
      }),
    });
    expect(res.status).toBe(201);
  });
  /* ... 401 / 400 / validation cases ... */
});
```

---

### `apps/web/test/transaction-capture-form.test.tsx` (vitest + RTL)

**Analog:** `apps/web/test/workspace-switcher.test.tsx:1-120` (full file).

**Mock + render pattern (workspace-switcher.test.tsx:7-32):**

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, opts?: { defaultValue?: string; count?: number }) =>
    opts?.defaultValue ?? key,
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const mockPut = vi.fn().mockResolvedValue({ ok: true });
vi.mock("../src/lib/api-client", () => ({
  api: { /* nested $post / $put / $get mocks */ },
}));

describe("WorkspaceSwitcher", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("fires PUT with updated payload when checkbox is toggled", async () => {
    render(<WorkspaceSwitcher /* props */ />);
    fireEvent.click(screen.getByLabelText("Toggle Family Budget"));
    await waitFor(() => {
      expect(mockPut).toHaveBeenCalledWith({ json: { /* expected */ } });
    });
  });
});
```

---

### `tests/e2e/features/budget/create-transaction.feature` (gherkin)

**Analog:** `tests/e2e/features/workspace/create-workspace.feature:1-27` (full file).

**Pattern:**

```gherkin
Feature: Create workspace

  Scenario: Empty workspaces page shows create CTA for verified user
    Given a fresh verified user in "en"
    When I navigate to "/en/workspaces"
    Then the create-workspace empty CTA is visible

  Scenario: Verified user creates a private workspace and lands on its detail page
    Given a fresh verified user in "en"
    When I navigate to "/en/workspaces"
    And I click the create-workspace empty CTA
    Then the create-workspace form fields are visible
    When I fill workspace name "My Family Budget"
    And I pick the "USD" currency
    And I submit the create-workspace form
    Then I land on a workspace detail page

  Scenario Outline: Locale flow shows localized create CTA
    Given a fresh verified user in "<locale>"
    When I navigate to "/<locale>/workspaces"
    Then the create-workspace empty CTA is visible

    Examples:
      | locale |
      | pl     |
      | uk     |
```

**Phase-2 scenarios to add:** create-transaction (golden path), edit-transaction-correction, recurring-confirm, fx-stale-badge, shares-mismatch-banner, idempotency-replay.

---

### `tests/e2e/pages/TransactionsPage.ts` (page object)

**Analog:** `tests/e2e/pages/CreateWorkspacePage.ts:1-57` (full file).

**Pattern:**

```typescript
import { expect, type Page, type Locator } from "@playwright/test";
import { LOCALE_LABELS, type Locale } from "./labels.js";

export class CreateWorkspacePage {
  private readonly labels: (typeof LOCALE_LABELS)[Locale];

  constructor(
    private readonly page: Page,
    private readonly locale: Locale,
  ) {
    this.labels = LOCALE_LABELS[locale];
  }

  async goto(): Promise<void> {
    await this.page.goto(`/${this.locale}/onboarding`);
  }

  nameInput(): Locator {
    return this.page.getByLabel(this.labels.workspaces.createNameLabel);
  }
  submit(): Locator {
    return this.page.getByRole("button", {
      name: this.labels.workspaces.createCta,
    });
  }

  async fillName(name: string): Promise<void> {
    await this.nameInput().fill(name);
  }
  async clickSubmit(): Promise<void> {
    await this.submit().click();
  }
  async expectFieldsVisible(): Promise<void> {
    await expect(this.nameInput()).toBeVisible();
    await expect(this.submit()).toBeVisible();
  }
}
```

---

### `tests/e2e/steps/budget.steps.ts` (playwright-bdd glue)

**Analog:** `tests/e2e/steps/workspace.steps.ts:1-65` (head of file).

**Pattern:**

```typescript
import { expect } from "@playwright/test";
import { createBdd } from "playwright-bdd";
import { test } from "../fixtures/index.js";
import { CreateWorkspacePage } from "../pages/CreateWorkspacePage.js";
import { LOCALE_LABELS, type Locale } from "../pages/labels.js";

const { When, Then } = createBdd(test);

function localeFromUrl(url: string): Locale {
  const m = url.match(/\/(en|pl|uk)\//);
  if (m && (m[1] === "en" || m[1] === "pl" || m[1] === "uk")) return m[1];
  return "en";
}

When("I fill workspace name {string}", async ({ page }, name: string) => {
  const locale = localeFromUrl(page.url());
  const cw = new CreateWorkspacePage(page, locale);
  await cw.fillName(name);
});
```

---

### `packages/budgeting/src/contracts/factory.ts` (DI module)

**Analog:** `packages/tenancy/src/contracts/factory.ts:1-44` (full file).

**Pattern:**

```typescript
import type { EmailSender } from "@budget/shared-kernel";
import type { WorkspaceRepo } from "../ports/workspace-repo";

export interface TenancyModule {
  organizationPlugin: unknown;
  betterAuthSchema: Record<string, unknown>;
  workspaceRepo: WorkspaceRepo;
  memberShareRepo: MemberShareRepo;
}

export function createTenancyModule(deps: {
  emailSender: EmailSender;
  appUrl: string;
}): TenancyModule {
  // Lazy require keeps contracts/ adapter-import-free at type-check time.
  const { DrizzleWorkspaceRepo, DrizzleMemberShareRepo } =
    require("../adapters/persistence/workspace-repo") as typeof import("../adapters/persistence/workspace-repo");
  return {
    /* ... */
    workspaceRepo: new DrizzleWorkspaceRepo(),
    memberShareRepo: new DrizzleMemberShareRepo(),
  };
}
```

**Phase-2 BudgetingModule shape:**

```typescript
export interface BudgetingModule {
  accountRepo: AccountRepo;
  categoryRepo: CategoryRepo;
  categoryLimitRepo: CategoryLimitRepo;
  transactionRepo: TransactionRepo;
  recurringRuleRepo: RecurringRuleRepo;
  recurringDraftRepo: RecurringDraftRepo;
  budgetTemplateRepo: BudgetTemplateRepo;
  fxProvider: FxProvider; // FrankfurterFxProvider impl
  fxRateCacheRepo: FxRateCacheRepo;
  spendingProjectionRepo: SpendingProjectionRepo;
}
```

`apps/api/src/boot.ts` is amended to call `createBudgetingModule({ /* deps */ })` and stash on `BootedDeps.budgeting`.

---

### `apps/migrator/post-migration.sql` (APPEND for Phase 2)

**Analog:** self — `apps/migrator/post-migration.sql:5-31` (GRANT, REVOKE, FORCE RLS pattern), :316-348 (deferred trigger pattern).

**Pattern (post-migration.sql:5-31):**

```sql
-- Schema USAGE grants (D-17).
GRANT USAGE ON SCHEMA identity, tenancy, shared_kernel, budgeting TO app_role, worker_role;

-- D-23 / ENGR-06: append-only ledger.
REVOKE UPDATE, DELETE ON budgeting.expense_ledger FROM app_role, worker_role;
GRANT SELECT, INSERT ON budgeting.expense_ledger TO app_role, worker_role;
ALTER TABLE budgeting.expense_ledger FORCE ROW LEVEL SECURITY;

-- Plan 03: audit_history
GRANT SELECT, INSERT ON shared_kernel.audit_history TO app_role, worker_role;
ALTER TABLE shared_kernel.audit_history FORCE ROW LEVEL SECURITY;

-- Plan 03: outbox (Pitfall 10 — NO RLS, GRANT-restricted access)
GRANT INSERT ON shared_kernel.outbox TO app_role;
GRANT SELECT, UPDATE ON shared_kernel.outbox TO worker_role;
```

**Phase-2 appends required:**

- `GRANT SELECT, INSERT, UPDATE, DELETE ON budgeting.{accounts, categories, category_limits, recurring_rules, recurring_drafts, budget_templates, budget_template_items, category_share_overrides, workspace_budget_mode_history, spending_by_category_month} TO app_role, worker_role;`
- `GRANT SELECT ON budgeting.{fx_rates, supported_currencies} TO app_role; GRANT SELECT, INSERT, UPDATE ON budgeting.{fx_rates, supported_currencies} TO worker_role;` (worker writes via daily fetcher)
- `GRANT SELECT, INSERT, UPDATE, DELETE ON shared_kernel.idempotency_keys TO app_role; GRANT SELECT, DELETE ON shared_kernel.idempotency_keys TO worker_role;` (worker handles TTL cleanup)
- `ALTER TABLE budgeting.{...all new tables...} FORCE ROW LEVEL SECURITY;` (except `fx_rates`, `supported_currencies` — reference data)
- Sum-100 deferred trigger on `budgeting.category_share_overrides` (mirror lines 331-346 verbatim).
- One-level-deep CHECK trigger on `budgeting.categories` (BEFORE INSERT/UPDATE: `parent_id IS NULL OR parent.parent_id IS NULL`).
- Workspace-share-dirty trigger on `tenancy.workspace_members` INSERT/DELETE that flips a `budgeting.workspace_share_dirty` row (D-02-c).
- Cascade DELETE: `ON DELETE FROM tenancy.workspace_members → DELETE FROM budgeting.category_share_overrides WHERE user_id = OLD.user_id` (Pitfall 8).
- Seed system user: `INSERT INTO identity.users (id, email, name, locale, display_currency) VALUES ('00000000-0000-0000-0000-000000000001', 'system@budget.local', 'System', 'en', 'USD') ON CONFLICT DO NOTHING;` (D-05-g).
- Seed crypto majors into `budgeting.supported_currencies`.

---

### `packages/budgeting/test/helpers.ts` (test util)

**Analog:** `packages/tenancy/test/helpers.ts:1-46` (full file — `signUpHelper`).

**Pattern:**

```typescript
import { ok, err, type Result } from "@budget/shared-kernel";

type AnyAuth = {
  api: {
    signUpEmail: (opts: {
      body: Record<string, unknown>;
    }) => Promise<{ user: { id: string } }>;
  };
};

export interface SignUpInput {
  email: string;
  password: string;
  name: string;
  locale: string;
  displayCurrency: string;
}

export async function signUpHelper(
  deps: { auth: AnyAuth },
  input: SignUpInput,
): Promise<Result<{ userId: string }, Error>> {
  try {
    const r = await deps.auth.api.signUpEmail({
      body: {
        email: input.email,
        password: input.password,
        name: input.name,
        locale: input.locale,
        display_currency: input.displayCurrency,
      },
    });
    return ok({ userId: r.user.id });
  } catch (e) {
    return err(e as Error);
  }
}
```

**Phase-2 additions:** `createWorkspaceHelper(...)` (returns workspaceId), `createAccountHelper(...)` (returns accountId), `createCategoryHelper(...)` (returns categoryId). Composed from existing tenancy + new budgeting application services.

---

## Shared Patterns

### Pattern A — Single `withTenantTx` block per write

**Source:** `packages/tenancy/src/adapters/persistence/workspace-repo.ts:148-189` (`DrizzleMemberShareRepo.update`).

**Apply to:** every Drizzle adapter that writes — accounts, categories, category-limits, transactions, recurring-rules, recurring-drafts, budget-templates, share-overrides, projection upserts.

**Excerpt:**

```typescript
const r = await withTenantTx(tid, aid, async (tx) => {
  // 1. Domain validation (defense in depth)
  // 2. Snapshot before (if audit needed)
  // 3. Mutation: tx.execute(sql`UPDATE / INSERT ...`)  OR  tx.insert(/* drizzle */)...
  // 4. Audit row (writeAudit) — for non-ledger entities
  // 5. Outbox emit (writeOutbox) — for cross-context events
  // ALL inside the same tx callback. Pitfall 7: never split.
});
if (r.isErr()) throw r.error;
```

**Pitfall 7 (RESEARCH.md:552-557):** outbox MUST share the tx with the domain write. Crash between tx and outbox writes corrupts cross-context consistency.

---

### Pattern B — RLS policy block

**Source:** `packages/platform/src/db/expense-ledger.ts:39-47` and `packages/tenancy/src/adapters/persistence/schema.ts:35-43`.

**Apply to:** every new tenant-scoped Phase-2 schema (accounts, categories, category-limits, recurring-rules, recurring-drafts, budget-templates, budget-template-items, category-share-overrides, workspace-budget-mode-history, spending-by-category-month, idempotency_keys).

**Excerpt:**

```typescript
(t) => [
  pgPolicy("<table>_tenant_isolation", {
    as: "permissive",
    for: "all",
    to: [appRole, workerRole],
    using: sql`${t.tenantId} = ANY(coalesce(nullif(current_setting('app.tenant_ids', true), ''), '{}')::uuid[])`,
    withCheck: sql`${t.tenantId} = ANY(coalesce(nullif(current_setting('app.tenant_ids', true), ''), '{}')::uuid[])`,
  }),
];
```

---

### Pattern C — Audit + Outbox writers

**Source:** `packages/platform/src/audit/writer.ts:14-24` and `packages/platform/src/outbox/writer.ts:12-20`.

**Apply to:** every audit-tracked write (limit edits, share edits, mode toggles, recurring-rule edits, deposit FX-preview decisions) and every cross-context event (TransactionCreated, TransactionCorrected, RecurringInstanceConfirmed, RecurringInstanceSkipped, SharesUpdated, FxRateRefreshed).

**Excerpt:**

```typescript
await writeAudit(tx, {
  tenantId: tid,
  entityType: "category_limit",
  entityId: categoryId,
  action: "update",
  actorUserId: aid,
  before: oldLimit,
  after: newLimit,
});

await writeOutbox(tx, {
  tenantId: tid,
  aggregateType: "transaction",
  aggregateId: transactionId,
  eventType: "budgeting.transaction.created",
  payload: {
    /* event payload */
  },
});
```

---

### Pattern D — Hexagonal module factory

**Source:** `packages/tenancy/src/contracts/factory.ts:17-43`, `packages/identity/src/contracts/factory.ts:17-31`.

**Apply to:** new `packages/budgeting/src/contracts/factory.ts` exposes `createBudgetingModule(deps)` returning `BudgetingModule`. `apps/api/src/boot.ts` calls this at boot, stashes on `BootedDeps.budgeting`.

**Excerpt:** factory.ts pattern — lazy `require()` of `../adapters/persistence/*` keeps `contracts/` adapter-import-free at type-check time. `domain/*` and `adapters/*` are NOT re-exported in `index.ts`.

---

### Pattern E — Hono route factory + Zod validation + session check

**Source:** `apps/api/src/routes/workspaces.ts:15-74` (factory + Zod schema + POST handler).

**Apply to:** every new Phase-2 route file (accounts, categories, category-limits, transactions, recurring-rules, recurring-drafts, budget-templates, fx, share-overrides).

**Excerpt:** see "API routes — Pattern Assignments" above.

---

### Pattern F — Append-only ledger correction-row write (D-01-b)

**Source:** RESEARCH.md §2 + locked column constraints in `packages/platform/src/db/expense-ledger.ts`.

**Apply to:** `editTransaction` use case + `bulkRecategorize` use case.

**Excerpt:**

```typescript
const r = await withTenantTx(tid, aid, async (tx) => {
  // Insert NEW correction row pointing at the original
  const [row] = await tx
    .insert(expenseLedger)
    .values({
      tenantId: tid,
      /* all columns of the new version */
      correctsId: originalId, // marks this as a correction
    })
    .returning();
  // Per D-05-a: do NOT update original.corrected_by_id (column dropped)
  // "Latest view" is derived: WHERE id NOT IN (SELECT corrects_id FROM expense_ledger WHERE corrects_id IS NOT NULL)
  await writeOutbox(tx, {
    tenantId: tid,
    aggregateType: "transaction",
    aggregateId: row.id,
    eventType: "budgeting.transaction.corrected",
    payload: { correctsId: originalId /* ... */ },
  });
  return row.id;
});
```

---

### Pattern G — pg-boss handler shape

**Source:** `apps/worker/src/handlers/outbox-dispatch.ts:1-7` + `apps/worker/src/worker.ts:5-15`.

**Apply to:** all 4 Phase-2 background jobs (fx-daily-fetch, recurring-engine, budgeting-reconciliation, idempotency-cleanup).

**Excerpts:** see "Worker handlers — Pattern Assignments" above. Pitfall 9: use 5-placeholder cron format. Pitfall 3: per-tenant `withTenantTx(tenantId, SYSTEM_USER_ID, fn)` for cross-tenant scans.

---

### Pattern H — Web component scaffold (RHF + Zod + next-intl + sonner + api client)

**Source:** `apps/web/src/components/workspace/create-workspace-form.tsx:1-241`.

**Apply to:** every new Phase-2 form (account-form, category-form, transaction-capture-form, recurring-rule-form, budget-template-form, share-override-editor).

**Imports + boilerplate:** see "Web UI — Pattern Assignments" above.

---

### Pattern I — Vitest + RTL component test

**Source:** `apps/web/test/workspace-switcher.test.tsx:1-120`.

**Apply to:** every new Phase-2 component test under `apps/web/test/`.

**Excerpt:** see "Tests — Pattern Assignments" above.

---

### Pattern J — Playwright BDD feature + page object + steps

**Sources:** `tests/e2e/features/workspace/create-workspace.feature` + `tests/e2e/pages/CreateWorkspacePage.ts` + `tests/e2e/steps/workspace.steps.ts`.

**Apply to:** every new Phase-2 user-flow E2E test. Use `createBdd(test)` + locale-aware page objects + `LOCALE_LABELS` lookup.

---

### Pattern K — Branded TenantId/UserId construction at adapter boundary

**Source:** `packages/shared-kernel/src/ids.ts:5-7` and `packages/tenancy/src/adapters/persistence/workspace-repo.ts:146-147`.

**Excerpt:**

```typescript
import { TenantId, UserId } from "@budget/shared-kernel";

// At adapter boundary, brand the raw string IDs:
const tid = TenantId(workspaceId);
const aid = UserId(actorUserId);
const r = await withTenantTx(tid, aid, async (tx) => {
  /* ... */
});
```

---

### Pattern L — Hono context augmentation (`apps/api/src/hono-types.ts`)

**Source:** `apps/api/src/hono-types.ts:1-13` (full file).

**Phase-2 extension:** if Phase-2 routes need new context vars (e.g., `idempotencyKey`), extend the `ContextVariableMap` interface block:

```typescript
declare module "hono" {
  interface ContextVariableMap {
    session: { user: { id: string; email: string; locale: Locale } } | null;
    tenantIds: string[];
    locale: Locale;
    idempotencyKey?: string; // Phase 2 addition
  }
}
```

---

## No Analog Found

| File                                                | Role                  | Data Flow            | Reason                                                                   | Fallback Source                                                                                                            |
| --------------------------------------------------- | --------------------- | -------------------- | ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| `packages/budgeting/src/adapters/fx/frankfurter.ts` | external HTTP adapter | provider integration | Phase 1 only ships `InMemoryFxProvider`; no real HTTP adapter exists yet | RESEARCH.md §3 lines 586-622 (full skeleton) + `packages/shared-kernel/src/ports/fx-provider.ts:11-29` (port + naive impl) |
| `apps/api/src/middleware/idempotency.ts`            | hono middleware       | header-keyed cache   | No existing middleware reads/writes a Postgres-backed idempotency cache  | RESEARCH.md §1 lines 654-690 (full impl) + `apps/api/src/middleware/rate-limit.ts:55-77` (factory shape)                   |

Both have detailed RESEARCH.md skeletons that can be lifted verbatim. Treat as net-new code, not refactors.

---

## Metadata

**Analog search scope:**

- `packages/{shared-kernel,platform,db,identity,tenancy,crypto}/src/**`
- `apps/{api,web,worker,migrator}/src/**`
- `apps/api/test/**`, `apps/web/test/**`, `packages/*/test/**`
- `tests/e2e/{features,pages,steps,fixtures}/**`
- `apps/migrator/post-migration.sql`, `drizzle/**`

**Files scanned:** ~40 representative analogs across all categories.
**Pattern extraction date:** 2026-05-09.
**Phase 1 coverage:** complete — every Phase-2 file role has a direct or close analog except the two listed above.

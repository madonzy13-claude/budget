# Phase 5: Reserves & Wallets Tabs — Pattern Map

**Mapped:** 2026-05-17
**Files analyzed:** 38 new / 8 modified
**Analogs found:** 38 / 38 (100% coverage — every new file maps to an existing analog)

---

## File Classification

| New / Modified File                                                                                                                    | Role             | Data Flow                  | Closest Analog                                                                                                                                               | Match                  |
| -------------------------------------------------------------------------------------------------------------------------------------- | ---------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------- |
| `drizzle/00XX_phase05_reserves_rebalance.sql`                                                                                          | migration        | DDL                        | `drizzle/0014_fix_reserve_view.sql` (VIEW DROP+CREATE) + `drizzle/0011_plan_02_08_recurring.sql` (CREATE TABLE+RLS)                                          | exact (composite)      |
| `apps/api/src/routes/reserves.ts` (NEW)                                                                                                | route            | read+write                 | `apps/api/src/routes/categories.ts` (mount under `/budgets/:budgetId`, PUT sort-order + tenant gate + PATCH)                                                 | exact                  |
| `apps/api/src/routes/budgets.ts` § `GET /:id/reserves` (REWRITE body)                                                                  | route handler    | read                       | self (lines 273–294) + `apps/api/src/routes/spendings-summary.ts` (composed read)                                                                            | role-match             |
| `apps/api/src/routes/wallets.ts` § `PATCH /:id` (EXTEND)                                                                               | route handler    | write                      | `apps/api/src/routes/categories.ts:163-183` (`PATCH /:id` rename) + same-file `PUT /:id/balance` (lines 114–141)                                             | exact                  |
| `packages/budgeting/src/adapters/persistence/category-reserve-adjustments-schema.ts` (NEW)                                             | drizzle schema   | DDL                        | `packages/budgeting/src/adapters/persistence/wallets-schema.ts` (RLS policy + CHECK + appRole/workerRole)                                                    | exact                  |
| `packages/budgeting/src/adapters/persistence/category-reserve-adjustments-repo.ts` (NEW)                                               | drizzle adapter  | write (append-only) + read | `packages/budgeting/src/adapters/persistence/wallet-repo.ts` (`withTenantTx` + `writeAudit` + `writeOutbox`)                                                 | exact                  |
| `packages/budgeting/src/adapters/persistence/reserves-summary-repo.ts` (NEW — small)                                                   | drizzle adapter  | read (aggregate)           | `packages/budgeting/src/adapters/persistence/reserve-balance-repo.ts` (SELECT from VIEW + `getBudgetCurrency` lookup)                                        | exact                  |
| `packages/budgeting/src/adapters/persistence/reserve-balance-repo.ts` (EXTEND — VIEW signature changed)                                | drizzle adapter  | read                       | self (current implementation)                                                                                                                                | exact                  |
| `packages/budgeting/src/adapters/persistence/wallet-repo.ts` § `update()` (EXTEND)                                                     | drizzle adapter  | write                      | self `setBalance` (lines 203–261) — before/after audit + outbox                                                                                              | exact                  |
| `packages/budgeting/src/adapters/persistence/categories-schema.ts` § `reserve_excluded` column (EXTEND)                                | drizzle schema   | DDL                        | adjacent column add in `wallets-schema.ts` `archivedAt`                                                                                                      | partial                |
| `packages/budgeting/src/domain/wallet.ts` § `rename` / `changeType` / `changeCurrency` / `setAmount` (EXTEND)                          | domain entity    | mutation                   | self `applyAdjustment` (lines 49–59) + `archive` (37–43) — Result-returning mutators                                                                         | exact                  |
| `packages/budgeting/src/ports/wallet-repo.ts` § `update()` port (EXTEND)                                                               | port interface   | n/a                        | self (current shape)                                                                                                                                         | exact                  |
| `packages/budgeting/src/application/update-wallet.ts` (NEW)                                                                            | use case         | write                      | `packages/budgeting/src/application/set-wallet-balance.ts` (Result + deps) + `archive-wallet.ts` (load → domain method → repo write)                         | exact                  |
| `packages/budgeting/src/application/adjust-category-reserve.ts` (NEW)                                                                  | use case         | write (append)             | `packages/budgeting/src/application/set-wallet-balance.ts` (deps + Result shape)                                                                             | role-match             |
| `packages/budgeting/src/application/toggle-category-reserve-excluded.ts` (NEW)                                                         | use case         | write                      | `packages/budgeting/src/application/rename-category.ts` (single-field patch)                                                                                 | role-match             |
| `packages/budgeting/src/application/get-reserves-summary.ts` (NEW — composed read)                                                     | use case         | read                       | `packages/budgeting/src/application/get-budget-home-summary.ts` (parallel reads + DTO)                                                                       | role-match             |
| `packages/budgeting/src/contracts/api.ts` § `updateWalletSchema` + `reserveAdjustmentSchema` + `categoryReserveExcludeSchema` (EXTEND) | zod schema       | validation                 | same file `createWalletSchema` (lines 10–14) + `setBalanceSchema` (42–45)                                                                                    | exact                  |
| `packages/budgeting/src/contracts/factory.ts` § new use case wiring (EXTEND)                                                           | DI factory       | n/a                        | self (lines 141–199) — `createBudgetingModule` returns                                                                                                       | exact                  |
| `apps/web/src/app/[locale]/(app)/budgets/[id]/reserves/page.tsx` (REPLACE placeholder)                                                 | RSC page         | read                       | `apps/web/src/app/[locale]/(app)/budgets/[id]/spendings/page.tsx` (parallel `serverApiFetch` → client island)                                                | exact                  |
| `apps/web/src/app/[locale]/(app)/budgets/[id]/wallets/page.tsx` (REPLACE placeholder)                                                  | RSC page         | read                       | same as above                                                                                                                                                | exact                  |
| `apps/web/src/components/common/inline-edit-cell.tsx` (NEW)                                                                            | shared atom      | UI state                   | `apps/web/src/components/budgeting/spendings-grid/reveal-actions.tsx` (`useRevealActions` click-to-edit) + RESEARCH §Pattern 4 (proposed `<InlineEditCell>`) | role-match             |
| `apps/web/src/components/common/dashed-add-button.tsx` (NEW)                                                                           | shared atom      | UI                         | `apps/web/src/components/budgeting/spendings-grid/add-category-column.tsx` (verbatim generalization)                                                         | exact                  |
| `apps/web/src/components/common/row-drag-handle.tsx` (NEW — extract from Phase 4)                                                      | shared atom      | UI                         | inlined inside `apps/web/src/components/budgeting/spendings-grid/column-header.tsx:77-85` (lift to atom)                                                     | exact                  |
| `apps/web/src/components/budgeting/reserves-tab/reserves-table-client.tsx` (NEW)                                                       | client island    | read+write                 | `apps/web/src/components/budgeting/spendings-grid/spendings-grid-client.tsx` (DndContext + sensors + query hooks + cross-invalidate)                         | exact                  |
| `apps/web/src/components/budgeting/reserves-tab/reserves-table-row.tsx` (NEW)                                                          | component        | UI                         | `apps/web/src/components/budgeting/spendings-grid/column-header.tsx` (cell composition + tabular-nums + cn)                                                  | role-match             |
| `apps/web/src/components/budgeting/reserves-tab/reserves-totals-footer.tsx` (NEW)                                                      | component        | UI                         | `apps/web/src/components/budgeting/spendings-grid/column-header.tsx` row5 (balance band + cn for variant tone)                                               | role-match             |
| `apps/web/src/components/budgeting/reserves-tab/mismatch-chip.tsx` (NEW)                                                               | component        | UI                         | `apps/web/src/components/ui/badge.tsx` (variant prop pattern) + DESIGN.md L603 chip treatment                                                                | partial                |
| `apps/web/src/components/budgeting/wallets-tab/wallets-sectioned-list.tsx` (NEW)                                                       | client island    | read+write                 | `apps/web/src/components/budgeting/spendings-grid/spendings-grid-client.tsx` (DndContext owner)                                                              | exact                  |
| `apps/web/src/components/budgeting/wallets-tab/wallet-section.tsx` (NEW)                                                               | component        | UI                         | section header pattern in same-grid `column-header.tsx` + `useDroppable` from @dnd-kit                                                                       | partial                |
| `apps/web/src/components/budgeting/wallets-tab/wallet-row.tsx` (NEW)                                                                   | component        | UI + drag                  | `apps/web/src/components/budgeting/spendings-grid/column-header.tsx:60-103` (drag handle + revealed actions)                                                 | exact                  |
| `apps/web/src/components/budgeting/wallets-tab/wallet-delete-confirm.tsx` (NEW)                                                        | component        | UI                         | `apps/web/src/components/ui/alert-dialog.tsx` (Radix wrapper exports)                                                                                        | exact (primitive only) |
| `apps/web/src/hooks/use-reserves-summary.ts` (NEW)                                                                                     | query hook       | read                       | `apps/web/src/hooks/use-spendings-summary.ts` (queryKey + clientApiFetch + initialData)                                                                      | exact                  |
| `apps/web/src/hooks/use-update-reserve-adjustment.ts` (NEW)                                                                            | mutation hook    | write                      | `apps/web/src/hooks/use-update-transaction.ts` (POST/PATCH + optimistic + onSettled invalidate)                                                              | exact                  |
| `apps/web/src/hooks/use-update-wallet.ts` (NEW)                                                                                        | mutation hook    | write                      | `apps/web/src/hooks/use-update-transaction.ts` (PATCH + idempotency + optimistic + rollback)                                                                 | exact                  |
| `apps/web/src/hooks/use-toggle-category-reserve-excluded.ts` (NEW)                                                                     | mutation hook    | write                      | `apps/web/src/hooks/use-reorder-categories.ts` (PATCH + onMutate snapshot + onError rollback + toast)                                                        | exact                  |
| `apps/web/src/hooks/use-wallets.ts` (NEW)                                                                                              | query hook       | read                       | `apps/web/src/hooks/use-spendings-summary.ts` (queryKey + initialData)                                                                                       | role-match             |
| `apps/web/src/hooks/use-create-wallet.ts` (NEW)                                                                                        | mutation hook    | write                      | `apps/web/src/hooks/use-update-transaction.ts` (POST + idempotency + optimistic)                                                                             | role-match             |
| `apps/web/src/hooks/use-archive-wallet.ts` (NEW)                                                                                       | mutation hook    | write                      | `apps/web/src/hooks/use-reorder-categories.ts` (PATCH + onError rollback + toast)                                                                            | role-match             |
| `apps/web/messages/{en,pl,uk}.json` (EXTEND)                                                                                           | i18n             | n/a                        | self lines 536–568 (`bdp.tab.{slug}.label` nested namespace)                                                                                                 | exact                  |
| `apps/api/test/routes/reserves.test.ts` (EXTEND)                                                                                       | integration test | n/a                        | self (full fixture pattern)                                                                                                                                  | exact                  |
| `apps/api/test/routes/reserves-adjust.test.ts` (NEW)                                                                                   | integration test | n/a                        | `apps/api/test/routes/wallets.test.ts` (real Postgres + `set_config('app.tenant_ids')`) + `apps/api/test/routes/reserves.test.ts` (createFixture)            | exact                  |
| `apps/api/test/routes/wallet-patch.test.ts` (NEW)                                                                                      | integration test | n/a                        | `apps/api/test/routes/wallets.test.ts` (same buildApp + tenant headers)                                                                                      | exact                  |
| `apps/api/test/routes/category-reserve-excluded.test.ts` (NEW)                                                                         | integration test | n/a                        | `apps/api/test/routes/categories-sort-order.test.ts` (PATCH + tenant gate)                                                                                   | role-match             |
| `apps/web/test/components/inline-edit-cell.test.tsx` (NEW)                                                                             | Vitest component | n/a                        | `apps/web/test/hooks/use-reorder-categories.test.tsx` + `apps/web/test/hooks/use-update-transaction.test.tsx` (RTL + happy-dom)                              | role-match             |
| `apps/web/test/components/dashed-add-button.test.tsx` (NEW)                                                                            | Vitest component | n/a                        | same as above                                                                                                                                                | role-match             |
| `apps/web/test/components/mismatch-chip.test.tsx` (NEW)                                                                                | Vitest component | n/a                        | same                                                                                                                                                         | role-match             |
| `tests/e2e/features/reserves-*.feature` + `wallets-*.feature` (NEW)                                                                    | Gherkin          | n/a                        | `tests/e2e/features/spendings/drag-reorder.feature` (`@phase4` tag + Given/When/Then)                                                                        | exact                  |
| `tests/e2e/pages/ReservesPage.ts` + `WalletsPage.ts` (REWRITE existing WalletsPage v1.0 stub)                                          | Page Object      | n/a                        | `tests/e2e/pages/SpendingsPage.ts` (6.7KB Phase 4 PO) + existing `WalletsPage.ts` (legacy v1.0 stub — DELETE & rewrite)                                      | exact                  |

---

## Pattern Assignments

### 1. Backend route — `apps/api/src/routes/reserves.ts` (NEW) AND `wallets.ts` PATCH (EXTEND)

**Analog (route mount + tenant gate + zValidator + PATCH + 403 mismatch):** `apps/api/src/routes/categories.ts:163-183` and same file lines 128–160.

**Imports pattern** (`apps/api/src/routes/categories.ts:12-16`):

```typescript
import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import type { BootedDeps } from "../boot";
import { serverError } from "../middleware/server-error";
```

**Tenant pick + cross-tenant 403 gate** (`apps/api/src/routes/categories.ts:21-24, 132-137`):

```typescript
function pickTenant(c: any): string {
  const ids = c.get("tenantIds") as string[] | undefined;
  return ids?.[0] ?? "";
}
// ...
const budgetId = c.req.param("budgetId");
if (budgetId && budgetId !== tenantId) {
  return c.json({ error: "tenant_mismatch" }, 403);
}
```

**PATCH single-resource pattern with lazy schema import** (`apps/api/src/routes/categories.ts:163-183`):

```typescript
app.patch("/:id", async (c) => {
  const session = c.get("session");
  const tenantId = pickTenant(c);
  const userId = (c.get("userId") as string) ?? session?.user?.id;
  const { id: categoryId } = c.req.param();

  const body = await c.req.json().catch(() => null);
  if (!body || typeof body.name !== "string") {
    return c.json({ error: "name is required" }, 422);
  }

  const r = await deps.budgeting.renameCategory({
    tenantId,
    categoryId,
    name: body.name,
    actorUserId: userId,
  });
  if (r.isErr()) return c.json({ error: r.error.message }, 422);
  return c.json(r.value);
});
```

**Body schema with `.refine(empty_body)` for partial PATCH** (NEW — proposed shape; mirrors `setBalanceSchema` regex style from `contracts/api.ts:42-45`):

```typescript
// updateWalletSchema — at least one field present
export const updateWalletSchema = z
  .object({
    name: z.string().min(1).max(120).optional(),
    amount: z
      .string()
      .regex(/^-?\d+(\.\d{1,4})?$/)
      .optional(),
    walletType: walletTypeSchema.optional(),
    currency: z
      .string()
      .regex(/^[A-Z0-9]{3,5}$/)
      .optional(),
  })
  .refine((d) => Object.keys(d).length > 0, { message: "empty_body" });
```

**404 vs 422 error mapping** (`apps/api/src/routes/wallets.ts:139`): `return c.json({ error: r.error.message }, 422)` — domain errors map to 422; tenant gate → 403; resource missing → 404.

---

### 2. Backend route — `GET /budgets/:id/reserves` REWRITE inside `apps/api/src/routes/budgets.ts`

**Analog (composed read + cross-tenant 403):** Current handler at `apps/api/src/routes/budgets.ts:247-271` (`/home-summary` — best in-file analog because reserves needs the same `tenantIds.includes(budgetId)` shape).

**Composed-read auth + tenant + DTO** (`apps/api/src/routes/budgets.ts:247-271`):

```typescript
r.get("/:id/home-summary", async (c) => {
  const session = c.get("session");
  if (!session) return c.json({ error: "unauthorized" }, 401);

  const budgetId = c.req.param("id");
  const tenantIds = c.get("tenantIds") as string[] | undefined;
  if (!tenantIds || !tenantIds.includes(budgetId)) {
    return c.json({ error: "not_found" }, 404);
  }
  const userId = (session as { user: { id: string } }).user.id;

  const result = await deps.budgeting.getBudgetHomeSummary({
    budgetId,
    userId,
    now: new Date(),
  });
  if (result.isErr()) {
    const msg = (result.error as Error).message;
    if (msg === "budget_not_found") return c.json({ error: "not_found" }, 404);
    return c.json({ error: "home_summary_failed" }, 500);
  }
  return c.json(result.value);
});
```

**Existing minimal `/reserves` body to REPLACE** (`apps/api/src/routes/budgets.ts:273-295`):

```typescript
// CURRENT — replace body, keep route signature
r.get("/:id/reserves", async (c) => {
  const session = c.get("session");
  if (!session) return c.json({ error: "unauthorized" }, 401);
  const budgetId = c.req.param("id");
  const tenantId = budgetId;
  const balances = await deps.budgeting.reserveBalanceRepo.getForBudget(...);
  // ... shape: { budgetId, reserves: [{categoryId, balanceCents}] }
});
// REPLACE WITH composed call into deps.budgeting.getReservesSummary({budgetId, tenantId})
// returning { rows: [...], totals: {...} } per D-PH5-R1.
```

---

### 3. Backend adapter — `wallet-repo.ts` `update()` (EXTEND)

**Analog (audit + outbox + before/after diff):** Same file `setBalance` (`packages/budgeting/src/adapters/persistence/wallet-repo.ts:203-261`).

**`withTenantTx` + SELECT before + UPDATE + writeAudit + writeOutbox pattern** (lines 212–259):

```typescript
const r = await withTenantTx(tid, uid, async (tx) => {
  const before = await tx.execute<{
    currency: string;
    current_balance: string;
  }>(
    sql`SELECT currency, current_balance::text
        FROM budgeting.wallets
        WHERE id = ${walletId}::uuid AND tenant_id = ${tenantId}::uuid`,
  );
  const beforeRow = (before as any).rows?.[0] ?? (before as any)[0];
  if (!beforeRow) throw new Error("Wallet not found");

  // ... domain invariant check ...

  await tx.execute(
    sql`UPDATE budgeting.wallets
        SET current_balance = ${amount.amount}::numeric
        WHERE id = ${walletId}::uuid AND tenant_id = ${tenantId}::uuid`,
  );

  await writeAudit(tx, {
    tenantId: tid,
    entityType: "wallet",
    entityId: walletId,
    action: "update",
    actorUserId: uid,
    before: { currentBalance: beforeRow.current_balance },
    after: { currentBalance: amount.amount, currency: amount.currency },
  });

  await writeOutbox(tx, {
    tenantId: tid,
    aggregateType: "wallet",
    aggregateId: walletId,
    eventType: "budgeting.wallet.balance_set",
    payload: {
      currentBalance: amount.amount,
      currency: amount.currency,
      actorUserId,
    },
  });
});
if (r.isErr()) throw r.error;
```

**Reuse notes for new `update(walletId, partial)` method:**

- Single SELECT-then-UPDATE inside one `withTenantTx`.
- `before` snapshot must be a full row so audit diff covers all 4 mutable fields.
- Conditional `SET` clauses (Drizzle `sql` template fragment composition or per-field branches).
- One audit row covers the whole patch; eventType `budgeting.wallet.updated` (NOT `_renamed`/`_repriced` — keep coarse).

---

### 4. Backend adapter — `category-reserve-adjustments-repo.ts` (NEW append-only)

**Analog (write-only audit-bearing repo):** `wallet-repo.ts:39-83` (`create` method writes INSERT + audit + outbox).

**Append-only INSERT pattern** (excerpt from `wallet-repo.ts:43-79`):

```typescript
const r = await withTenantTx(tid, uid, async (tx) => {
  await tx.execute(
    sql`INSERT INTO budgeting.wallets
          (id, tenant_id, name, wallet_type, currency, current_balance, archived_at, created_at, actor_user_id)
        VALUES
          (${wallet.id}::uuid, ${wallet.tenantId}::uuid, ${wallet.name},
           ${wallet.walletType}, ${wallet.currency},
           ${wallet.currentBalance.amount.toFixed(4)}::numeric,
           ${wallet.archivedAt?.toISOString() ?? null},
           ${wallet.createdAt.toISOString()}, ${wallet.actorUserId}::uuid)`,
  );
  await writeAudit(tx, { ... entityType: "wallet", action: "create", before: null, after: {...} });
  await writeOutbox(tx, { ... eventType: "budgeting.wallet.created", payload: {...} });
});
```

**Adapt to `category_reserve_adjustments`:**

- `entityType: "category_reserve_adjustment"`, `action: "create"`, `before: null`, `after: { deltaCents, categoryId, note }`.
- `eventType: "budgeting.reserve.adjusted"` for Phase 7 task generator subscription.
- No UPDATE / DELETE methods — append-only per D-PH5-R8.

---

### 5. Backend schema — `category-reserve-adjustments-schema.ts` (NEW Drizzle)

**Analog (full schema with CHECK + RLS):** `packages/budgeting/src/adapters/persistence/wallets-schema.ts:6-52`.

**Schema body** (lines 18–52):

```typescript
import { sql } from "drizzle-orm";
import {
  pgPolicy,
  uuid,
  text,
  char,
  numeric,
  timestamp,
  check,
} from "drizzle-orm/pg-core";
import { budgeting, appRole, workerRole } from "@budget/platform";

export const wallets = budgeting.table(
  "wallets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull(),
    // ... columns
  },
  (t) => [
    check(
      "wallets_wallet_type_chk",
      sql`${t.walletType} IN ('SPENDINGS','CUSHION','RESERVE')`,
    ),
    pgPolicy("wallets_tenant_isolation", {
      as: "permissive",
      for: "all",
      to: [appRole, workerRole],
      using: sql`${t.tenantId} = ANY(coalesce(nullif(current_setting('app.tenant_ids', true), ''), '{}')::uuid[])`,
      withCheck: sql`${t.tenantId} = ANY(coalesce(nullif(current_setting('app.tenant_ids', true), ''), '{}')::uuid[])`,
    }),
  ],
);
```

**Adapt for `category_reserve_adjustments`:**

- Columns per D-PH5-R8 (`id`, `tenantId`, `categoryId`, `deltaCents bigint`, `note`, `createdBy`, `occurredAt`).
- Same RLS policy template (verbatim — change only name + table reference).
- Composite index `(tenant_id, category_id, occurred_at)` declared as `index(...).on(...)` table arg.
- No CHECK constraint needed (delta can be any signed bigint).

---

### 6. Backend migration — `00XX_phase05_reserves_rebalance.sql` (NEW additive)

**Two analogs combined into one migration:**

**(a) VIEW DROP+CREATE pattern** — `drizzle/0014_fix_reserve_view.sql:23-173` (verbatim DROP + statement-breakpoint + CREATE + GRANT):

```sql
-- DROP first: CREATE OR REPLACE VIEW silently keeps old parse tree when the
-- final SELECT shape changes ...
DROP VIEW IF EXISTS budgeting.category_reserve_balance;

--> statement-breakpoint

CREATE VIEW budgeting.category_reserve_balance AS
WITH RECURSIVE months AS ( ... )
-- ... recursive CTE that now must (D-PH5-R9):
--   - LEFT JOIN budgeting.category_reserve_adjustments and sum delta_cents
--   - WHERE c.reserve_excluded = false (filter Excluded out)
SELECT DISTINCT ON (budget_id, category_id)
  budget_id, category_id, tenant_id,
  reserve_cents + COALESCE(adj_total, 0) AS balance_cents
FROM reserve_accum
LEFT JOIN (
  SELECT category_id, SUM(delta_cents) AS adj_total
  FROM budgeting.category_reserve_adjustments
  GROUP BY category_id
) adj USING (category_id)
JOIN budgeting.categories c ON c.id = reserve_accum.category_id
WHERE c.reserve_excluded = false
ORDER BY budget_id, category_id, month_start DESC;

--> statement-breakpoint
GRANT SELECT ON budgeting.category_reserve_balance TO app_role, worker_role;
```

**(b) CREATE TABLE + ENABLE RLS + CREATE POLICY pattern** — `drizzle/0011_plan_02_08_recurring.sql:4-53`:

```sql
CREATE TABLE IF NOT EXISTS "budgeting"."recurring_rules" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL,
  -- ... cols + CHECK constraints
);
--> statement-breakpoint
ALTER TABLE "budgeting"."recurring_rules" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "recurring_rules_tenant_isolation" ON "budgeting"."recurring_rules"
  AS PERMISSIVE FOR ALL TO "app_role","worker_role"
  USING (tenant_id = ANY(coalesce(nullif(current_setting('app.tenant_ids', true), ''), '{}')::uuid[]))
  WITH CHECK (tenant_id = ANY(coalesce(nullif(current_setting('app.tenant_ids', true), ''), '{}')::uuid[]));
```

**(c) ADD COLUMN idempotent pattern** — `drizzle/0018_phase04_expense_ledger_dismissed_at.sql:6-11`:

```sql
ALTER TABLE budgeting.expense_ledger
  ADD COLUMN IF NOT EXISTS dismissed_at TIMESTAMPTZ NULL;

CREATE INDEX IF NOT EXISTS expense_ledger_dismissed_at_null_idx
  ON budgeting.expense_ledger (tenant_id, confirmed_at)
  WHERE dismissed_at IS NULL AND confirmed_at IS NULL;
```

**Phase 5 migration assembly (single file, ordered):**

1. `CREATE TABLE budgeting.category_reserve_adjustments` + RLS policy (pattern b)
2. `ALTER TABLE budgeting.categories ADD COLUMN IF NOT EXISTS reserve_excluded boolean NOT NULL DEFAULT false` (pattern c)
3. `ALTER TABLE tenancy.budgets ADD COLUMN IF NOT EXISTS reserves_enabled boolean NOT NULL DEFAULT true` (pattern c)
4. `DROP VIEW IF EXISTS budgeting.category_reserve_balance; CREATE VIEW …; GRANT …;` (pattern a)
5. Composite index `(tenant_id, category_id, occurred_at)` on adjustments table.

Use `--> statement-breakpoint` between every DDL block (drizzle-kit convention verified in both analog files).

---

### 7. Domain — `wallet.ts` mutators (EXTEND)

**Analog (Result-returning mutator methods on aggregate):** Same file `archive()` (`packages/budgeting/src/domain/wallet.ts:37-43`) and `applyAdjustment()` (49–59).

**Mutator pattern** (lines 37–59):

```typescript
archive(): Result<void, Error> {
  if (this.isArchived()) {
    return err(new Error("Wallet already archived"));
  }
  this.archivedAt = new Date();
  return ok(undefined);
}

applyAdjustment(delta: Money): Result<void, Error> {
  if (delta.currency !== (this.currency as any)) {
    return err(new Error(`Adjustment currency ${delta.currency} != account currency ${this.currency}`));
  }
  this.currentBalance = this.currentBalance.add(delta);
  return ok(undefined);
}
```

**Required Phase 5 mutators to add (per RESEARCH Pitfall 2 + D-PH5-W12):**

- `rename(newName: string): Result<void, Error>` — validate `min 1 / max 120` mirroring Zod schema.
- `changeType(newType: WalletType): Result<void, Error>` — no domain invariant beyond `WalletType` enum (reserve-currency check belongs in use case so it can call `budgetCurrencyOf`).
- `changeCurrency(newCurrency: string): Result<void, Error>` — D-PH5-W12 **rescinds** the current `canChangeCurrency()` always-err pattern. Replace with `ok(undefined)` (use-case enforces RESERVE-type constraint).
- `setAmount(newAmount: Money): Result<void, Error>` — overwrites `currentBalance`; reject if `newAmount.currency !== this.currency` (amount edit must respect current currency; currency edit is a separate operation).

**CRITICAL: remove `readonly` modifier from `currency`** (currently line 17): make it mutable to allow `changeCurrency()` to write.

---

### 8. Application use case — `update-wallet.ts` (NEW)

**Analog (Result + deps + load → mutate → persist):** `packages/budgeting/src/application/archive-wallet.ts:11-40` and `set-wallet-balance.ts:29-50`.

**Full body** (`archive-wallet.ts:11-40` — verbatim shape):

```typescript
import { ok, err, type Result } from "@budget/shared-kernel";
import type { WalletRepo } from "../ports/wallet-repo";

export interface ArchiveWalletDeps {
  repo: WalletRepo;
}

export function archiveWallet(deps: ArchiveWalletDeps) {
  return async (input: {
    tenantId: string;
    walletId: string;
    actorUserId: string;
  }): Promise<Result<{ id: string; archivedAt: string }, Error>> => {
    try {
      const wallet = await deps.repo.findById(input.tenantId, input.walletId);
      if (!wallet) return err(new Error(`Wallet ${input.walletId} not found`));

      const result = wallet.archive();
      if (result.isErr()) return err(result.error);

      await deps.repo.archive(
        input.tenantId,
        input.walletId,
        input.actorUserId,
      );
      return ok({
        id: input.walletId,
        archivedAt: wallet.archivedAt!.toISOString(),
      });
    } catch (e) {
      return err(e as Error);
    }
  };
}
```

**Adapt for `updateWallet`:**

1. `findById` → 404 if missing.
2. Compute `effectiveType = body.walletType ?? wallet.walletType` and `effectiveCurrency = body.currency ?? wallet.currency`.
3. If `effectiveType === "RESERVE"`: lookup `deps.budgetCurrencyOf(tenantId)`; reject 422 if currency mismatch (per Pitfall 4 — validate on EVERY PATCH, not just type change).
4. Call domain mutators for each present field; collect Result errors.
5. `deps.repo.update(walletId, patch, actorUserId)`.
6. Return Result with `{ wallet: WalletDto }`.

**Reuse `budgetCurrencyOf` resolver from `factory.ts:113-126`** (`getWorkspaceDefaultCurrency`) — already wired; pass as new dep to `updateWallet`.

---

### 9. Application use case — `get-reserves-summary.ts` (NEW composed read)

**Analog:** `apps/api/src/routes/spendings-summary.ts` (cited in RESEARCH §Pattern 1 as the canonical composed-read endpoint). Also `packages/budgeting/src/application/get-budget-home-summary.ts` for the DI/Result shape.

**Composition (per D-PH5-R1):**

1. `reserveBalanceRepo.getForBudget(budgetId, tenantId, new Date())` → existing, returns `Map<categoryId, Money>` (VIEW now folds in adjustments + excludes Excluded per D-PH5-R9).
2. `categoryRepo.list(tenantId)` → attach name + `reserve_excluded` flag.
3. NEW `reservesSummaryRepo.sumReserveWalletAmounts(tenantId)` → single SQL aggregate `SELECT COALESCE(SUM(current_balance::numeric), 0) FROM budgeting.wallets WHERE tenant_id = $1 AND wallet_type = 'RESERVE' AND archived_at IS NULL`. **Copy `archived_at IS NULL` predicate from `wallet-repo.ts:150` verbatim** (Pitfall 7).
4. Compute share math in JS (per D-PH5-R2); emit em-dash sentinel (-1 or null) when `Σ === 0` (D-PH5-R4 — render decision in client).
5. Compute totals + mismatch (signed bigint cents, never `parseFloat`).

---

### 10. Frontend RSC page — `reserves/page.tsx` AND `wallets/page.tsx`

**Analog (parallel serverApiFetch + render client island with initialData):** `apps/web/src/app/[locale]/(app)/budgets/[id]/spendings/page.tsx:36-113`.

**Pattern** (lines 36–50, 88–113):

```typescript
import { Temporal } from "temporal-polyfill";
import { serverApiFetch } from "@/lib/budget-fetch.server";
import { SpendingsGridClient } from "@/components/budgeting/spendings-grid/spendings-grid-client";

export default async function SpendingsPage({ params, searchParams }: PageProps) {
  const { id: budgetId } = await params;

  const [categoriesRes, txnsRes, draftsRes, summaryRes] = await Promise.all([
    serverApiFetch(budgetId, `/budgets/${budgetId}/categories`),
    serverApiFetch(budgetId, `/budgets/${budgetId}/transactions?...`),
    // ...
  ]);

  const categories = categoriesRes.ok
    ? ((await categoriesRes.json()) as { categories: unknown[] }).categories
    : [];
  // ... extract + map ...

  return (
    <SpendingsGridClient
      budgetId={budgetId}
      budgetCurrency={...}
      initialCategories={categories as ...}
      // ...
    />
  );
}
```

**`reserves/page.tsx`** — single fetch: `serverApiFetch(budgetId, '/budgets/${budgetId}/reserves')` → pass to `<ReservesTableClient initial={...} budgetId={...} budgetCurrency={...} />`. Replace the placeholder body at `apps/web/src/app/[locale]/(app)/budgets/[id]/wallets/page.tsx:11-22` (currently just translated copy).

**`wallets/page.tsx`** — single fetch: `serverApiFetch(budgetId, '/wallets')` → pass to `<WalletsSectionedList initial={wallets} budgetId={...} budgetCurrency={...} />`.

---

### 11. Frontend shared atom — `dashed-add-button.tsx` (NEW)

**Analog (verbatim generalize):** `apps/web/src/components/budgeting/spendings-grid/add-category-column.tsx` (entire 46-line file).

**Imports + body** (full file — `add-category-column.tsx:9-45`):

```typescript
import { useTranslations } from "next-intl";
import { Plus } from "lucide-react";

export interface AddCategoryColumnProps {
  onClick: () => void;
}

export function AddCategoryColumn({ onClick }: AddCategoryColumnProps) {
  const t = useTranslations("grid.addCategory");

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onClick();
    }
  }

  return (
    <div
      data-testid="add-category-column"
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={handleKeyDown}
      aria-label={t("trigger")}
      className="flex min-h-[170px] w-[140px] sm:w-[160px] flex-shrink-0 flex-col items-center justify-center gap-2 rounded-[var(--radius-lg)] border border-dashed border-[var(--muted-foreground)] cursor-pointer select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[var(--info)]"
    >
      <Plus className="h-6 w-6 text-[var(--muted-foreground)]" aria-hidden="true" />
      <span className="text-xs text-[var(--muted-foreground)]">{t("trigger")}</span>
    </div>
  );
}
```

**Generalize (per RESEARCH Pattern: §"Dashed-add-button atom"):** Accept `label`, `onClick`, `ariaLabel?`, `testId?`, `className?` props. **DO NOT bake i18n key inside the atom** — caller passes already-translated `label` string (so Wallets section can pass `bdp.tab.wallets.add.reserve` and Phase 6 Settings can pass its own key). Atom default className is row-shaped (`w-full min-h-[44px] flex-row`) per UI-SPEC §Spacing; caller overrides to grid-column shape (current Phase 4 use case) via `className` prop.

---

### 12. Frontend shared atom — `row-drag-handle.tsx` (NEW, lifted)

**Analog (currently inlined):** `apps/web/src/components/budgeting/spendings-grid/column-header.tsx:77-85`.

**Inlined snippet to LIFT into shared atom** (lines 77–85):

```typescript
<span
  data-testid={`drag-grip-${category.name.toLowerCase()}`}
  style={{ touchAction: "none" }}
  className="touch-none cursor-grab text-[var(--muted-foreground)]"
  {...dragGripProps}
>
  <GripVertical className="h-4 w-4" aria-hidden="true" />
</span>
```

**Extract as `<RowDragHandle name="…" listeners={…} attributes={…} className?="…" />`.** Wallets row uses `name = wallet.name` for testid. Reserves row uses `name = category.name`. The `dragGripProps` shape (`...listeners + ...attributes`) is the @dnd-kit `useDraggable` return — pass through unchanged. Phase 4 column-header is then refactored to import the shared atom (single-line internal cleanup; no behavior change).

---

### 13. Frontend client island — `reserves-table-client.tsx` AND `wallets-sectioned-list.tsx`

**Analog (DndContext owner + sensors + TanStack hooks + cross-invalidation):** `apps/web/src/components/budgeting/spendings-grid/spendings-grid-client.tsx:82-157`.

**DndContext + sensors** (`spendings-grid-client.tsx:125-129`):

```typescript
const sensors = useSensors(
  useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  useSensor(TouchSensor, {
    activationConstraint: { delay: 200, tolerance: 8 },
  }),
  useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
);
```

**Phase 5 sensor tweak (per RESEARCH Claude's Discretion):** Use `TouchSensor { delay: 300, tolerance: 5 }` (stricter than Phase 4 grid's 200/8) — wallets/reserves rows are form-like and benefit from tap-vs-drag disambiguation. Document the difference inline.

**Drag-end handler shape (cross-section drop, NOT sortable reorder)** (RESEARCH §Pattern 3, lines 517–527 of RESEARCH.md):

```typescript
function handleDragEnd(e: DragEndEvent) {
  const { active, over } = e;
  if (!over) return;
  const droppedSectionId = String(over.id); // 'section-RESERVE'
  if (!droppedSectionId.startsWith("section-")) return;
  const newType = droppedSectionId.slice("section-".length) as WalletType;
  const wallet = walletsById.get(String(active.id));
  if (!wallet || wallet.walletType === newType) return;
  updateWalletMut.mutate({ walletId: wallet.id, walletType: newType });
}
```

**Query hydration from `initialData`** (`spendings-grid-client.tsx:90-112`):

```typescript
const summary = useSpendingsSummary(budgetId, month, props.initialSummary);
// ... and on RSC re-fetch:
useEffect(() => {
  qc.setQueryData(["spendings-summary", budgetId, month], props.initialSummary);
  // ...
}, [props.initialSummary, qc, budgetId, month]);
```

Apply same hydration pattern with `["budget", id, "reserves"]` and `["budget", id, "wallets"]` query keys (D-PH5-E1).

---

### 14. Frontend mutation hook — `use-update-wallet.ts` AND `use-update-reserve-adjustment.ts`

**Analog (PATCH + idempotency + optimistic + onSettled invalidate):** `apps/web/src/hooks/use-update-transaction.ts:21-101` (full file).

**Full body** (`use-update-transaction.ts:21-101`):

```typescript
"use client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { clientApiFetch } from "@/lib/budget-fetch";
import { generateIdempotencyKey } from "@/lib/idempotency";

export function useUpdateTransaction(budgetId: string, month: string) {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (input: UpdateTransactionInput) => {
      const body: Record<string, unknown> = {};
      if (input.amountCents !== undefined)
        body.amount_original_cents = input.amountCents;
      // ...
      const res = await clientApiFetch(
        `/budgets/${budgetId}/transactions/${input.txId}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": generateIdempotencyKey(),
          },
          body: JSON.stringify(body),
        },
      );
      if (!res.ok) throw new Error(await res.text());
      return (await res.json()).transaction;
    },
    onMutate: async (input) => {
      await qc.cancelQueries({ queryKey: ["transactions", budgetId, month] });
      const previous = qc.getQueryData(["transactions", budgetId, month]);
      qc.setQueryData(["transactions", budgetId, month], (old: unknown) => {
        // ... map and mark pending ...
      });
      return { previous };
    },
    onError: (_err, _input, ctx) => {
      if (ctx?.previous !== undefined) {
        qc.setQueryData(["transactions", budgetId, month], ctx.previous);
      }
    },
    onSuccess: (serverRow, input) => {
      /* ... replace with mapped server row ... */
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["transactions", budgetId, month] });
      qc.invalidateQueries({
        queryKey: ["spendings-summary", budgetId, month],
      });
    },
  });
}
```

**Adapt for `useUpdateWallet(budgetId)`:**

- Endpoint: `PATCH /wallets/:walletId` (NOT under `/budgets/:id/`; existing wallets routes mount root).
- queryKey `["budget", budgetId, "wallets"]`.
- **Cross-invalidate per D-PH5-E1:** if `(input.walletType === "RESERVE" || cachedWallet.walletType === "RESERVE")` OR `(input.currency !== undefined && cachedWallet.walletType === "RESERVE")` OR `(input.amount !== undefined && cachedWallet.walletType === "RESERVE")` → also `qc.invalidateQueries({ queryKey: ["budget", budgetId, "reserves"] })`.
- 422 reserve-currency-mismatch → throw error → `onError` rolls back + `toast.error("bdp.tab.wallets.toast.reserveCurrencyOnEdit")`.

---

### 15. Frontend mutation hook — `use-toggle-category-reserve-excluded.ts` AND `use-archive-wallet.ts`

**Analog (optimistic + toast on error):** `apps/web/src/hooks/use-reorder-categories.ts:19-70` (full file).

**Body** (lines 39–67):

```typescript
onMutate: async (input) => {
  await qc.cancelQueries({ queryKey: ["categories", budgetId] });
  const previous = qc.getQueryData(["categories", budgetId]);
  qc.setQueryData(["categories", budgetId], (old: unknown) => {
    if (!Array.isArray(old)) return old;
    const idxMap = new Map(input.orderedIds.map((id, i) => [id, i]));
    return [...old].sort((a, b) => (idxMap.get(a.id) ?? 999) - (idxMap.get(b.id) ?? 999));
  });
  return { previous };
},
onError: (_err, _input, ctx) => {
  if (ctx?.previous !== undefined) {
    qc.setQueryData(["categories", budgetId], ctx.previous);
  }
  toast.error("grid.error.reorderSave");
},
onSettled: () => {
  qc.invalidateQueries({ queryKey: ["categories", budgetId] });
},
```

**Pitfall confirmed (RESEARCH Pitfall 6):** Phase 4 calls `toast.error("grid.error.reorderSave")` with the raw i18n key string. Phase 5 mutations follow suit (`toast.error("bdp.tab.reserves.toast.toggleFailed")`) and the key-vs-translated-string question is deferred to Phase 8 i18n pass.

---

### 16. Frontend query hook — `use-wallets.ts` AND `use-reserves-summary.ts`

**Analog (TanStack `useQuery` with initialData):** `apps/web/src/hooks/use-spendings-summary.ts` (signature pattern referenced in `spendings-grid-client.tsx:90` — `useSpendingsSummary(budgetId, month, props.initialSummary)`).

**Shape:**

```typescript
export function useReservesSummary(
  budgetId: string,
  initialData?: ReservesSummaryDTO,
) {
  return useQuery({
    queryKey: ["budget", budgetId, "reserves"],
    queryFn: async () => {
      const res = await clientApiFetch(`/budgets/${budgetId}/reserves`);
      if (!res.ok) throw new Error(await res.text());
      return (await res.json()) as ReservesSummaryDTO;
    },
    initialData,
  });
}
```

---

### 17. Test — Backend integration tests for `/reserves` + `wallet PATCH` + `reserve-excluded` toggle

**Analog (real Postgres fixture + Hono test app + tenant context):** `apps/api/test/routes/reserves.test.ts:25-141` and `apps/api/test/routes/wallets.test.ts:21-94`.

**Fixture helper** (`reserves.test.ts:25-60`):

```typescript
async function createFixture(currency = "EUR"): Promise<Fixture> {
  const pool = new Pool({ connectionString: DB_URL });
  const client = await pool.connect();
  const userId = crypto.randomUUID();
  const budgetId = crypto.randomUUID();
  const categoryId = crypto.randomUUID();
  try {
    await client.query("BEGIN");
    await client.query(
      `INSERT INTO identity.users (id, email, name, email_verified, created_at, updated_at)
       VALUES ($1, $2, 'Reserves Test', true, now(), now())`,
      [userId, `reserves-${userId.slice(0, 8)}@example.com`],
    );
    await client.query(
      `INSERT INTO tenancy.budgets (id, slug, name, kind, default_currency, owner_user_id, member_count, created_at)
       VALUES ($1, $2, 'Reserves Budget', 'PRIVATE', $3, $4, 1, now())`,
      [budgetId, `ws-rsv-${budgetId.slice(0, 8)}`, currency, userId],
    );
    await client.query(
      `SELECT set_config('app.tenant_ids', '{"${budgetId}"}', true)`,
    );
    await client.query(
      `SELECT set_config('app.current_user_id', '${userId}', true)`,
    );
    await client.query(
      `INSERT INTO budgeting.categories (id, tenant_id, name, created_at, actor_user_id)
       VALUES ($1, $2, 'Reserves Cat', now(), $3)`,
      [categoryId, budgetId, userId],
    );
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
    await pool.end();
  }
  return { userId, budgetId, categoryId, currency };
}
```

**Test app builder** (`wallets.test.ts:58-94`):

```typescript
async function buildApp(userId: string, tenantId: string) {
  const { createWalletsRoute } = await import("../../src/routes/wallets");
  // ... lazy imports ...
  const repo = new DrizzleWalletRepo();
  const deps = {
    budgeting: {
      /* wired use cases */
    },
  } as any;
  const app = new Hono();
  app.use(async (c: any, next: any) => {
    c.set("session", { user: { id: userId } });
    c.set("tenantId", tenantId);
    c.set("tenantIds", [tenantId]);
    c.set("userId", userId);
    await next();
  });
  app.route("/wallets", createWalletsRoute(deps));
  return app;
}
```

**Phase 5 test coverage (RESEARCH Wave 0 Gaps):**

- `reserves.test.ts` EXTEND: totals shape, share math non-zero, `Σ=0` → null, archived wallet excluded, cross-tenant 403, reserve_excluded filter.
- `wallet-patch.test.ts` NEW: PATCH name, PATCH amount, PATCH walletType (cross-section), PATCH reserve-currency-mismatch 422 (T-05-03, T-05-04, T-05-05), cross-tenant PATCH → 404.
- `reserves-adjust.test.ts` NEW: POST adjust appends row, balance reflects sum, RLS isolation.
- `category-reserve-excluded.test.ts` NEW: PATCH toggle, VIEW excludes row from balance, drag-back resurrects, RLS.

---

### 18. Test — E2E Gherkin features + Page Objects

**Analog (`@phase{N}` tag + Given/When/Then):** `tests/e2e/features/spendings/drag-reorder.feature` (full 12-line file):

```gherkin
@phase4
Feature: Drag-reorder columns persists to sort_index (GRID-09)

  Scenario: Column order persists after drag and page reload
    Given I am signed in as a fresh user with workspace "Family"
    And the budget "Family" has a category "Alpha" with planned "100.00" "EUR"
    And the budget "Family" has a category "Beta" with planned "100.00" "EUR"
    When I open the Spendings tab on a budget "Family"
    And I drag column "Alpha" before column "Gamma"
    Then I see the column order is "Beta, Alpha, Gamma"
```

**Fresh-user-per-scenario fixture** (`tests/e2e/fixtures/freshUser.ts:32-43` — verified pattern matches memory hook `feedback_e2e_gherkin.md`):

```typescript
export const test = base.extend<CustomFixtures>({
  scenarioCtx: async ({}, use) => {
    await use({ freshUser: undefined, lastSignUpEmail: undefined });
  },
  freshUser: async ({ page, scenarioCtx }, use) => {
    const locale: Locale = "en";
    const user = await createFreshUser(page, locale);
    scenarioCtx.freshUser = user;
    await use(user);
  },
});
```

**Phase 5 features (tag `@phase5`):**

- `tests/e2e/features/wallets/add-edit-drag-delete.feature` — golden path
- `tests/e2e/features/wallets/reserve-currency-rejected.feature` — drag rejection
- `tests/e2e/features/wallets/cross-tab-invalidation.feature` — edit wallet amount → reserves share refetches
- `tests/e2e/features/reserves/share-math-and-zero-state.feature`
- `tests/e2e/features/reserves/exclude-category.feature`
- `tests/e2e/features/reserves/rebalance-via-inline-edit.feature`

**Page Objects** — REWRITE existing `tests/e2e/pages/WalletsPage.ts` (it currently targets the legacy `accounts-list.tsx` UI being deleted this phase per RESEARCH §State of the Art). New shape modeled on `tests/e2e/pages/SpendingsPage.ts` (6.7KB Phase 4 PO). Add NEW `tests/e2e/pages/ReservesPage.ts`.

---

### 19. Frontend Vitest component tests

**Analog (RTL + happy-dom + Vitest):** `apps/web/test/hooks/use-reorder-categories.test.tsx` and `apps/web/test/hooks/use-update-transaction.test.tsx` (cited in RESEARCH §Validation Architecture — both exist as Phase 4 carryovers).

**Phase 5 NEW Vitest tests** (per RESEARCH Wave 0 Gaps):

- `apps/web/test/components/inline-edit-cell.test.tsx` — click-edit, blur-save, error rollback, disabled prop.
- `apps/web/test/components/dashed-add-button.test.tsx` — onClick fires, aria-label, keyboard Enter/Space.
- `apps/web/test/components/mismatch-chip.test.tsx` — variant rendering (overfunded/underfunded/reconciled), `role="status"` per UI-SPEC §Accessibility.
- `apps/web/test/components/wallets-sectioned-list.test.tsx` — drag-end handler with mocked sensor.
- `apps/web/test/components/reserves-table-row.test.tsx` — em-dash logic per D-PH5-R4.
- `apps/web/test/hooks/use-update-wallet.test.tsx` — optimistic + rollback + cross-invalidation.

---

### 20. i18n keys — `apps/web/messages/{en,pl,uk}.json`

**Analog (nested namespace under `bdp.tab.{slug}`):** `apps/web/messages/en.json:536-558`:

```json
"bdp": {
  "tab": {
    "aria": "Budget detail tabs",
    "reserves": {
      "label": "Reserves",
      "title": "Reserves",
      "placeholder": "Per-category reserve balances land in Phase 5."
    },
    "wallets": {
      "label": "Wallets",
      "title": "Wallets",
      "placeholder": "Inline-editable wallet rows land in Phase 5."
    }
  }
}
```

**Phase 5 adds:** all ~45 keys defined in UI-SPEC §Copywriting Contract under `bdp.tab.reserves.*` and `bdp.tab.wallets.*` — sections, column headers, totals labels, mismatch variants, toasts (saved / saveFailed / created / createFailed / archived / archiveFailed / moved / reserveCurrencyRejected / moveFailed / reserveCurrencyOnEdit / excluded / included / toggleFailed), confirm dialog (title/body/cta/cancel), row aria-labels, section labels for toast interpolation, add-button labels per section.

**Replace existing `placeholder` strings** ("…land in Phase 5") with real content this phase — keep `label` and `title` unchanged (UI-SPEC §Carry-forward locked).

---

## Shared Patterns (Cross-Cutting Concerns)

### Authentication — every API route

**Source:** all routes (verified `wallets.ts:50-51`, `budgets.ts:275-277`).

```typescript
const session = c.get("session");
if (!session) return c.json({ error: "unauthorized" }, 401);
const tenantId = pickTenant(c); // or `c.get("tenantIds")` for budgets routes
const userId = (c.get("userId") as string) ?? session?.user?.id;
```

**Apply to:** every new route handler.

### Tenant gate — 403 on mismatch

**Source:** `apps/api/src/routes/categories.ts:132-137` (and Phase 4 T-04-02-08 audit closure).

```typescript
if (budgetId && budgetId !== tenantId) {
  return c.json({ error: "tenant_mismatch" }, 403);
}
```

**Apply to:** new `/reserves` reads, all PATCH /wallets/:id (mount under `/budgets/:budgetId/wallets/:id` OR pull `tenantIds.includes(walletTenant)` if root-mounted).

### Audit + outbox on writes

**Source:** `packages/budgeting/src/adapters/persistence/wallet-repo.ts:55-79`.

```typescript
await writeAudit(tx, {
  tenantId: tid, entityType: "wallet", entityId: wallet.id,
  action: "create", actorUserId: uid, before: null, after: {...},
});
await writeOutbox(tx, {
  tenantId: tid, aggregateType: "wallet", aggregateId: wallet.id,
  eventType: "budgeting.wallet.created", payload: {...},
});
```

**Apply to:** every new write — `wallet-repo.update()`, `category-reserve-adjustments-repo.create()`, category `reserve_excluded` toggle (UPDATE on `budgeting.categories`).

### RLS policy template

**Source:** `packages/budgeting/src/adapters/persistence/wallets-schema.ts:44-50`.

```typescript
pgPolicy("wallets_tenant_isolation", {
  as: "permissive", for: "all", to: [appRole, workerRole],
  using: sql`${t.tenantId} = ANY(coalesce(nullif(current_setting('app.tenant_ids', true), ''), '{}')::uuid[])`,
  withCheck: sql`${t.tenantId} = ANY(coalesce(nullif(current_setting('app.tenant_ids', true), ''), '{}')::uuid[])`,
}),
```

**Apply to:** new `category_reserve_adjustments` table (verbatim — only change name from `wallets_tenant_isolation` to `category_reserve_adjustments_tenant_isolation` + replace `${t.tenantId}` reference).

### Optimistic mutation + rollback

**Source:** `apps/web/src/hooks/use-reorder-categories.ts:39-67`.
**Apply to:** every Phase 5 mutation hook — `useUpdateWallet`, `useCreateWallet`, `useArchiveWallet`, `useUpdateReserveAdjustment`, `useToggleCategoryReserveExcluded`. Always include `await qc.cancelQueries(...)` before `setQueryData` to avoid race with in-flight refetch.

### Money at adapter boundary

**Source:** `packages/budgeting/src/adapters/persistence/wallet-repo.ts:13-36` (`rowToWallet` constructs `Money.fromDb(row.current_balance ?? "0", row.currency)`) and `packages/budgeting/src/adapters/persistence/reserve-balance-repo.ts:15-24` (`centsToMoney`).
**Apply to:** every read that returns cents to client — never `parseFloat`; always `Money.fromDb()` or `centsToMoney()`. Per RESEARCH Pitfall — Pitfall: "Date.now() for currentBalance parsing".

### Toast on mutation outcome

**Source:** `apps/web/src/hooks/use-reorder-categories.ts:13` (`import { toast } from "sonner"`) + line 63 call.
**Apply to:** every mutation hook. Use raw i18n key strings (`toast.error("bdp.tab.wallets.toast.saveFailed")`) — follow Phase 4 convention; defer translation pass to Phase 8 (Pitfall 6).

### Idempotency key on PATCH

**Source:** `apps/web/src/hooks/use-update-transaction.ts:36-38`.

```typescript
headers: { "Content-Type": "application/json", "Idempotency-Key": generateIdempotencyKey() },
```

**Apply to:** PATCH /wallets/:id, POST /budgets/:id/reserves/:catId/adjust, PATCH /budgets/:id/categories/:catId/reserve-excluded.

### serverApiFetch in RSC (X-Budget-ID header)

**Source:** `apps/web/src/app/[locale]/(app)/budgets/[id]/spendings/page.tsx:36-50`.
**Apply to:** every RSC fetch in `reserves/page.tsx` + `wallets/page.tsx` — never use raw `fetch()`. T-04-04-07 mitigation.

---

## No Analog Found

| File                                                      | Reason / Decision                                                                                                                                                                                                                                                            |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `<MismatchChip>` (`mismatch-chip.tsx`)                    | No status-chip component exists in the codebase. Use `apps/web/src/components/ui/badge.tsx` for `variant` prop shape; otherwise compose from DESIGN.md tokens per UI-SPEC §Color §Mismatch chip variants table. Build small new component (~40 lines, three variants).       |
| `<WalletSection>` droppable wrapper                       | No existing `useDroppable` consumer in repo (Phase 4 is sortable, not cross-section). Use `@dnd-kit/core` `useDroppable({ id: 'section-{TYPE}' })` per RESEARCH §Pattern 3 (lines 326–332).                                                                                  |
| `<InlineEditCell>` lifecycle (click → edit → blur → save) | `reveal-actions.tsx` provides only the click-to-reveal half, not the input-mount-and-blur-save half. New atom needed; mutation lifecycle copies `use-update-transaction.ts` lifecycle into the cell render. RESEARCH §Pattern 4 lays out the implementation (lines 359–409). |

---

## Metadata

**Analog search scope:**

- `apps/api/src/routes/` — full directory scan
- `packages/budgeting/src/{domain,ports,application,adapters/persistence,contracts}/` — full
- `apps/web/src/components/{ui,common,budgeting/spendings-grid,budgeting/fields}/` — relevant subset
- `apps/web/src/hooks/` — full directory
- `apps/web/src/app/[locale]/(app)/budgets/[id]/` — full
- `drizzle/` — sampled (3 representative migrations: 0011 CREATE TABLE+RLS, 0014 VIEW DROP+CREATE, 0018 ADD COLUMN IF NOT EXISTS)
- `apps/api/test/routes/` — sampled (reserves.test.ts, wallets.test.ts, categories.test.ts)
- `tests/e2e/{features,pages,fixtures,steps}/` — sampled (spendings/drag-reorder.feature, WalletsPage.ts, freshUser.ts)
- `apps/web/messages/en.json` — lines 536–568 (bdp namespace)

**Files scanned:** 35
**Pattern extraction date:** 2026-05-17

**Key insight (carries over from RESEARCH §Don't Hand-Roll):** Every primitive needed for Phase 5 already exists in the codebase. The phase is composition + 3 new shared atoms (`<InlineEditCell>`, `<DashedAddButton>`, `<RowDragHandle>` lifted), not infrastructure.

**Most consequential analog mismatch (planner must address explicitly):**
The Wallet domain entity (`packages/budgeting/src/domain/wallet.ts`) has `currency: readonly` + `canChangeCurrency()` returning hard `err()`. CONTEXT.md D-PH5-W12 RESCINDS WALT-04 for Phase 5. Plan must:

1. Remove `readonly` from `currency`
2. Replace `canChangeCurrency()` body with `ok(undefined)` (or delete and add `changeCurrency(newCurrency)` mutator)
3. Update `setBalance` adapter at `wallet-repo.ts:225-229` (currently rejects currency mismatch) — keep that rejection for `setBalance` (amount overwrite path) but allow currency change via new `update()` method.
4. Server-side enforcement of "RESERVE wallets MUST be in budget currency" moves to the application use case (`update-wallet.ts`), NOT the domain (per RESEARCH §Pattern 2 step 3).

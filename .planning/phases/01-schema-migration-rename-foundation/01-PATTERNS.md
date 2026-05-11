# Phase 1: Schema Migration & Rename Foundation - Pattern Map

**Mapped:** 2026-05-11
**Phase scope:** rename workspaces->budgets, accounts->wallets, drop legacy cols, add new cols (tasks, wallet_type enum, sort_index, cushion_mode_enabled). 4 sequential plans.

This map quotes existing code so the executor mirrors style exactly. Every excerpt below was extracted by reading the cited file directly.

---

## 1. Drizzle schema file with RLS `pgPolicy`

**Canonical analog:** `packages/budgeting/src/adapters/persistence/category-limits-schema.ts`

The shape every renamed/new table follows -- `budgeting.table(...)` factory + `pgPolicy(...)` row at end. Roles imported from `@budget/platform`; tenant_id column is `uuid("tenant_id").notNull()`; both `using` and `withCheck` use the same `coalesce(nullif(current_setting('app.tenant_ids', true), ''), '{}')::uuid[]` sql expression.

`packages/budgeting/src/adapters/persistence/category-limits-schema.ts:1-43`:

```typescript
/**
 * category-limits-schema.ts -- Drizzle schema for budgeting.category_limits (SCD-2)
 * RLS via pgPolicy. Partial unique index + PIT index in post-migration.sql.
 * Effective-dated per RESEARCH.md §4 / D-04-b.
 */
import { sql } from "drizzle-orm";
import {
  pgPolicy,
  uuid,
  bigint,
  char,
  date,
  timestamp,
} from "drizzle-orm/pg-core";
import { budgeting, appRole, workerRole } from "@budget/platform";

export const categoryLimits = budgeting.table(
  "category_limits",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull(),
    categoryId: uuid("category_id").notNull(),
    normalAmount: bigint("normal_amount", { mode: "bigint" }).notNull(),
    normalCurrency: char("normal_currency", { length: 3 }).notNull(),
    cushionAmount: bigint("cushion_amount", { mode: "bigint" }).notNull(),
    cushionCurrency: char("cushion_currency", { length: 3 }).notNull(),
    effectiveFrom: date("effective_from").notNull(),
    effectiveTo: date("effective_to"),
    actorUserId: uuid("actor_user_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    pgPolicy("category_limits_tenant_isolation", {
      as: "permissive",
      for: "all",
      to: [appRole, workerRole],
      using: sql`${t.tenantId} = ANY(coalesce(nullif(current_setting('app.tenant_ids', true), ''), '{}')::uuid[])`,
      withCheck: sql`${t.tenantId} = ANY(coalesce(nullif(current_setting('app.tenant_ids', true), ''), '{}')::uuid[])`,
    }),
  ],
);
```

**Apply to (new + renamed):** `wallets-schema.ts` (renamed from `accounts-schema.ts`), `budget-mode-history-schema.ts` (renamed), `tasks-schema.ts` (NEW -- `budgeting.tasks`).

**Variant with CHECK constraint** at `packages/budgeting/src/adapters/persistence/accounts-schema.ts:40-44` (use this shape for `tasks.kind`/`tasks.status`):

```typescript
(t) => [
    check(
      "accounts_kind_chk",
      sql`${t.kind} IN ('CASH','CHECKING','SAVINGS','CREDIT_CARD','LOAN','INVESTMENT')`,
    ),
    check("accounts_scope_chk", sql`${t.scope} IN ('PERSONAL','SHARED')`),
```

For the new `tasks` table, `wallets-schema.ts` (replacing `kind` text+CHECK with `wallet_type` enum) is the closest pattern -- keep the CHECK form for `kind`/`status` text+CHECK on tasks per D-05 discretion.

---

## 2. SCD-2 versioned table pattern (schema + close+insert write)

**Analog A -- schema:** `packages/budgeting/src/adapters/persistence/workspace-budget-mode-history-schema.ts:17-41`

Canonical SCD-2 columns (`effectiveFrom date NOT NULL`, `effectiveTo date NULL`, `actorUserId`, `createdAt`) + CHECK + tenant pgPolicy:

```typescript
export const workspaceBudgetModeHistory = budgeting.table(
  "workspace_budget_mode_history",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").notNull(),
    tenantId: uuid("tenant_id").notNull(),
    mode: text("mode").notNull(),
    effectiveFrom: date("effective_from").notNull(),
    effectiveTo: date("effective_to"),
    actorUserId: uuid("actor_user_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    check("workspace_budget_mode_chk", sql`${t.mode} IN ('NORMAL','CUSHION')`),
    pgPolicy("workspace_budget_mode_history_tenant_isolation", {
      as: "permissive",
      for: "all",
      to: [appRole, workerRole],
      using: sql`${t.tenantId} = ANY(coalesce(nullif(current_setting('app.tenant_ids', true), ''), '{}')::uuid[])`,
      withCheck: sql`${t.tenantId} = ANY(coalesce(nullif(current_setting('app.tenant_ids', true), ''), '{}')::uuid[])`,
    }),
  ],
);
```

After Phase 1 this becomes `budgetModeHistory` table `"budget_mode_history"` + column rename `workspaceId/workspace_id` -> `budgetId/budget_id` and policy name `budget_mode_history_tenant_isolation`.

**Analog B -- close-prev + insert-new repo:** `packages/budgeting/src/adapters/persistence/category-limit-repo.ts:50-110` (the exact pattern to reuse when toggling cushion mode and versioning a new row).

Three-branch pattern: (1) same-day -> UPDATE in place, (2) different day -> close old row with `effective_to = effective_from - 1 day` then INSERT new, (3) no prior row -> simple INSERT. Wrapped in `withTenantTx`:

```typescript
async setLimit(input: SetLimitInput): Promise<void> {
    const tid = TenantId(input.tenantId);
    const uid = UserId(input.actorUserId);

    const r = await withTenantTx(tid, uid, async (tx) => {
      // 1. Snapshot the previous open row
      const before = await tx.execute<{ id: string; ... }>(sql`
        SELECT id, normal_amount::text, cushion_amount::text, effective_from::text
        FROM budgeting.category_limits
        WHERE category_id = ${input.categoryId}::uuid AND effective_to IS NULL
      `);

      if (before.rows.length > 0) {
        const prevFrom = before.rows[0].effective_from.substring(0, 10);
        if (prevFrom === input.effectiveFrom) {
          // Same-day edit (Pitfall 5): UPDATE the existing row in place
          await tx.execute(sql`
            UPDATE budgeting.category_limits
            SET normal_amount = ${input.normalAmount}::bigint, ...
            WHERE category_id = ${input.categoryId}::uuid AND effective_to IS NULL
          `);
        } else {
          // 2. Close the previous open row
          await tx.execute(sql`
            UPDATE budgeting.category_limits
            SET effective_to = ${input.effectiveFrom}::date - INTERVAL '1 day'
            WHERE category_id = ${input.categoryId}::uuid AND effective_to IS NULL
          `);

          // 3. Insert new open-ended row
          await tx.execute(sql`
            INSERT INTO budgeting.category_limits
              (tenant_id, category_id, normal_amount, normal_currency,
               cushion_amount, cushion_currency, effective_from, actor_user_id)
            VALUES (${input.tenantId}::uuid, ...)
          `);
        }
      } else {
        // No previous row -- simple insert
        await tx.execute(sql`INSERT INTO budgeting.category_limits ...`);
      }

      await writeAudit(tx, { ... });
      await writeOutbox(tx, { ... });
    });

    if (r.isErr()) throw r.error;
  }
```

**Apply to:** any new `budget_mode_history` toggle write (Phase 1 Plan 01-01 sketch only -- full mode-toggle handler lands later, but the pattern is canonical and must be preserved through the rename).

**Companion supporting index in post-migration.sql:** `apps/migrator/post-migration.sql:447-452`:

```sql
CREATE UNIQUE INDEX IF NOT EXISTS category_limits_one_open_per_cat
  ON budgeting.category_limits (category_id) WHERE effective_to IS NULL;
CREATE INDEX IF NOT EXISTS category_limits_pit_idx
  ON budgeting.category_limits (category_id, effective_from DESC);
CREATE UNIQUE INDEX IF NOT EXISTS workspace_budget_mode_one_open
  ON budgeting.workspace_budget_mode_history (workspace_id) WHERE effective_to IS NULL;
```

The `workspace_budget_mode_one_open` line will need updating in lockstep with the table+column rename inside Plan 01-01.

---

## 3. Hand-written migration SQL (`0011_plan_02_08_recurring.sql` precedent)

**Analog:** `drizzle/0011_plan_02_08_recurring.sql:1-54` -- full file. This is the model for `drizzle/0012_phase01_v11_rename.sql`.

Key style points (quoted verbatim):

- **Header comment style** (lines 1-2): plan reference + "Generated manually (drizzle-kit requires TTY; created by plan executor)".
- **Sequence numbering:** four-digit prefix `0011_...` -> next is `0012_...`.
- **`--> statement-breakpoint` separator** required between every CREATE/ALTER (drizzle-kit splits on this marker at apply time).
- **Schema-qualified, double-quoted identifiers:** `"budgeting"."recurring_rules"`.
- **`ENABLE ROW LEVEL SECURITY` per table** issued explicitly after CREATE.
- **`CREATE POLICY` re-states `to "app_role","worker_role"` and the same coalesce-nullif-current_setting predicate.**

`drizzle/0011_plan_02_08_recurring.sql:1-24`:

```sql
-- Plan 02-08: recurring_rules + recurring_drafts tables
-- Generated manually (drizzle-kit requires TTY; created by plan executor)

CREATE TABLE IF NOT EXISTS "budgeting"."recurring_rules" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "account_id" uuid NOT NULL,
  "category_id" uuid,
  "amount" numeric(19,4) NOT NULL,
  "currency" char(3) NOT NULL,
  "kind" text NOT NULL,
  "cadence" text NOT NULL,
  "cadence_anchor" integer,
  "weekly_dow" integer,
  "note" text,
  "active" boolean NOT NULL DEFAULT true,
  "next_due_date" date NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  "actor_user_id" uuid NOT NULL,
  CONSTRAINT "recurring_rules_kind_chk" CHECK (kind IN ('EXPENSE','INCOME','TRANSFER')),
  CONSTRAINT "recurring_rules_cadence_chk" CHECK (cadence IN ('MONTHLY','WEEKLY')),
  CONSTRAINT "recurring_rules_weekly_dow_chk" CHECK (weekly_dow IS NULL OR (weekly_dow BETWEEN 0 AND 6))
);

--> statement-breakpoint
```

`drizzle/0011_plan_02_08_recurring.sql:47-53` -- RLS + policy block at file tail:

```sql
ALTER TABLE "budgeting"."recurring_rules" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "budgeting"."recurring_drafts" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "recurring_rules_tenant_isolation" ON "budgeting"."recurring_rules" AS PERMISSIVE FOR ALL TO "app_role","worker_role" USING (tenant_id = ANY(coalesce(nullif(current_setting('app.tenant_ids', true), ''), '{}')::uuid[])) WITH CHECK (tenant_id = ANY(coalesce(nullif(current_setting('app.tenant_ids', true), ''), '{}')::uuid[]));
--> statement-breakpoint
CREATE POLICY "recurring_drafts_tenant_isolation" ON "budgeting"."recurring_drafts" AS PERMISSIVE FOR ALL TO "app_role","worker_role" USING (tenant_id = ANY(coalesce(nullif(current_setting('app.tenant_ids', true), ''), '{}')::uuid[])) WITH CHECK (tenant_id = ANY(coalesce(nullif(current_setting('app.tenant_ids', true), ''), '{}')::uuid[]));
```

**Apply to:** `drizzle/0012_phase01_v11_rename.sql`. New parts to add over the 0011 shape: `ALTER TABLE ... RENAME TO`, `ALTER TABLE ... RENAME COLUMN`, `DROP COLUMN`, `CREATE TYPE budgeting.wallet_type AS ENUM (...)`, and CREATE TABLE `budgeting.tasks` + its RLS+POLICY block.

---

## 4. `apps/migrator/post-migration.sql` style -- RLS/trigger/grant patterns

`apps/migrator/post-migration.sql` runs after drizzle migrations on every container boot; every DDL is `CREATE OR REPLACE` / `DROP IF EXISTS` / `IF NOT EXISTS` so re-runs are safe.

**Schema-prefixed everywhere.** `tenancy.workspaces`, `budgeting.expense_ledger`, `budgeting.workspace_budget_mode_history` etc. All 23+ workspace refs need rename in lockstep with `0012_*.sql`.

### 4a. GRANT block -- copy this for `tasks` + renamed tables

`apps/migrator/post-migration.sql:184-192`:

```sql
-- Plan 06: tenancy schema
GRANT USAGE ON SCHEMA tenancy TO app_role, worker_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON tenancy.workspaces, tenancy.workspace_members, tenancy.workspace_invitations TO app_role;
GRANT SELECT ON tenancy.workspaces, tenancy.workspace_members TO worker_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON tenancy.shared_workspace_member_shares TO app_role;
GRANT SELECT ON tenancy.shared_workspace_member_shares TO worker_role;

ALTER TABLE tenancy.workspaces FORCE ROW LEVEL SECURITY;
ALTER TABLE tenancy.workspace_members FORCE ROW LEVEL SECURITY;
ALTER TABLE tenancy.shared_workspace_member_shares FORCE ROW LEVEL SECURITY;
```

Apply rename mechanically: every `tenancy.workspaces` -> `tenancy.budgets`, every `workspace_members` -> `budget_members`, every `shared_workspace_member_shares` -> `shared_budget_member_shares`.

### 4b. Split SELECT/INSERT/UPDATE/DELETE policy pattern

`apps/migrator/post-migration.sql:207-244` (the Better Auth org-plugin compatibility split). After Phase 1: `workspaces_*` -> `budgets_*`:

```sql
DROP POLICY IF EXISTS workspaces_insert_open ON tenancy.workspaces;
CREATE POLICY workspaces_insert_open ON tenancy.workspaces
  FOR INSERT TO app_role, worker_role
  WITH CHECK (true);

DROP POLICY IF EXISTS workspace_members_insert_open ON tenancy.workspace_members;
CREATE POLICY workspace_members_insert_open ON tenancy.workspace_members
  FOR INSERT TO app_role, worker_role
  WITH CHECK (true);
...
DROP POLICY IF EXISTS workspaces_select_open ON tenancy.workspaces;
CREATE POLICY workspaces_select_open ON tenancy.workspaces
  FOR SELECT TO app_role, worker_role
  USING (
    id = ANY(coalesce(nullif(current_setting('app.tenant_ids', true), ''), '{}')::uuid[])
    OR owner_user_id = nullif(current_setting('app.current_user_id', true), '')::uuid
  );
```

### 4c. BEFORE INSERT trigger pattern for user-context bootstrap

`apps/migrator/post-migration.sql:258-267`:

```sql
CREATE OR REPLACE FUNCTION tenancy.workspaces_set_user_context_on_insert()
RETURNS trigger AS $$
BEGIN
  PERFORM set_config('app.current_user_id', NEW.owner_user_id::text, true);
  RETURN NEW;
END $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS workspaces_insert_set_context ON tenancy.workspaces;
CREATE TRIGGER workspaces_insert_set_context
  BEFORE INSERT ON tenancy.workspaces
  FOR EACH ROW EXECUTE FUNCTION tenancy.workspaces_set_user_context_on_insert();
```

Rename pass: function name `workspaces_set_user_context_on_insert` -> `budgets_set_user_context_on_insert`, trigger name `workspaces_insert_set_context` -> `budgets_insert_set_context`. Same mechanical pass for `workspace_members_set_user_context_on_insert`.

### 4d. Multi-schema budgeting+tenancy reference pattern

`apps/migrator/post-migration.sql:486-508` -- function in `budgeting` schema reads `tenancy.workspaces`:

```sql
CREATE OR REPLACE FUNCTION budgeting.flag_workspace_share_dirty() RETURNS trigger AS $$
DECLARE
  ws_kind text;
BEGIN
  -- D-02-c only applies to SHARED workspaces. PRIVATE workspaces have a single
  -- member; share validation is irrelevant -- skip the dirty flag entirely.
  SELECT kind::text INTO ws_kind FROM tenancy.workspaces
   WHERE id = COALESCE(NEW.workspace_id, OLD.workspace_id);

  IF ws_kind <> 'PRIVATE' THEN
    INSERT INTO budgeting.workspace_share_dirty (workspace_id, dirty, updated_at)
    VALUES (COALESCE(NEW.workspace_id, OLD.workspace_id), true, now())
    ON CONFLICT (workspace_id) DO UPDATE SET dirty = true, updated_at = now();
  END IF;
  ...
```

After Phase 1: `flag_workspace_share_dirty` -> `flag_budget_share_dirty`, table refs `tenancy.workspaces` -> `tenancy.budgets`, `budgeting.workspace_share_dirty` -> `budgeting.budget_share_dirty`, column `workspace_id` -> `budget_id`.

### 4e. FORCE RLS + GRANT block for new bounded contexts (model for `tasks`)

`apps/migrator/post-migration.sql:410-424`:

```sql
ALTER TABLE budgeting.categories FORCE ROW LEVEL SECURITY;
ALTER TABLE budgeting.category_limits FORCE ROW LEVEL SECURITY;
ALTER TABLE budgeting.budget_templates FORCE ROW LEVEL SECURITY;
ALTER TABLE budgeting.budget_template_items FORCE ROW LEVEL SECURITY;
ALTER TABLE budgeting.category_share_overrides FORCE ROW LEVEL SECURITY;
ALTER TABLE budgeting.workspace_budget_mode_history FORCE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON
  budgeting.categories,
  budgeting.category_limits,
  budgeting.budget_templates,
  budgeting.budget_template_items,
  budgeting.category_share_overrides,
  budgeting.workspace_budget_mode_history
  TO app_role, worker_role;
```

For `budgeting.tasks` add a line each in both blocks.

---

## 5. Hono route file structure

**Analog A -- `apps/api/src/routes/accounts.ts` (-> `wallets.ts`)** -- 151 lines, factory pattern, `pickTenant` helper, lazy schema imports.

Top of file `apps/api/src/routes/accounts.ts:1-31`:

```typescript
/**
 * accounts.ts -- /accounts route factory
 *
 * PC-02: imports from package roots only.
 * T-2-04: zValidator on every state-changing endpoint.
 * T-2-04-01: RLS provides tenant isolation at DB layer.
 * T-2-04-02: Currency immutability enforced at domain level.
 */
import { Hono } from "hono";
import type { BootedDeps } from "../boot";
import { serverError } from "../middleware/server-error";

export function createAccountsRoute(deps: BootedDeps) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const app = new Hono<{ Variables: Record<string, any> }>();

  /** Pick the first active tenant (phase-2: single-workspace per request). */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function pickTenant(c: any): string {
    const ids = c.get("tenantIds") as string[] | undefined;
    return ids?.[0] ?? "";
  }

  // Lazy imports to avoid circular deps at module load
  async function getSchemas() {
    const { createAccountSchema, adjustBalanceSchema } = await import(
      "@budget/budgeting/src/contracts/api"
    );
    return { createAccountSchema, adjustBalanceSchema };
  }
```

POST handler with safeParse + service call + error shape (`apps/api/src/routes/accounts.ts:33-79`):

```typescript
  // POST /accounts -- create new account
  app.post("/", async (c) => {
    const { createAccountSchema } = await getSchemas();

    const body = await c.req.json().catch(() => null);
    if (!body) return c.json({ error: "Invalid JSON" }, 422);

    const parsed = createAccountSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: "Validation error", issues: parsed.error.issues }, 422);
    }

    const session = c.get("session");
    const tenantId = pickTenant(c);
    const userId = (c.get("userId") as string) ?? session?.user?.id;
    ...
    const r = await deps.budgeting.createAccount({
      ...parsed.data,
      scope,
      tenantId,
      actorUserId: userId,
    });

    if (r.isErr()) {
      const msg = r.error.message;
      if (msg.includes("not in the supported currencies")) {
        return c.json({ error: msg }, 422);
      }
      return c.json({ error: msg }, 422);
    }

    return c.json(r.value, 201);
  });
```

GET handler with `serverError` adapter (`apps/api/src/routes/accounts.ts:82-91`):

```typescript
// GET /accounts -- list accounts
app.get("/", async (c) => {
  const session = c.get("session");
  const tenantId = pickTenant(c);
  const includeArchived = c.req.query("includeArchived") === "true";

  const r = await deps.budgeting.listAccounts({ tenantId, includeArchived });
  if (r.isErr()) return serverError(c, "list_accounts_failed", r.error);

  return c.json({ accounts: r.value });
});
```

**Apply to:** `apps/api/src/routes/wallets.ts` (rename of `accounts.ts`) and any new wallet endpoint. Minimum compile-fix per D-07: strip `scope` from `createAccount` payload (it's gone -- derive from budget kind on the server side, or drop the inference block entirely depending on Plan 01-03 scope). Strip `parsed.data.scope` reference at line 50.

**Analog B -- `apps/api/src/routes/workspaces.ts` (-> `budgets.ts`)** -- uses `zValidator("json", schema)` middleware-style.

`apps/api/src/routes/workspaces.ts:1-22, 46-74`:

```typescript
/**
 * workspaces.ts -- /workspaces route factory
 *
 * PC-02: all application service imports come from package roots or internal imports.
 * T-01-07-06: zValidator on every state-changing endpoint.
 * T-01-07-05: roles enforced server-side in application services; RLS provides second layer.
 */
import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { sql } from "drizzle-orm";
import type { BootedDeps } from "../boot";
import { UserId } from "@budget/shared-kernel";

export function workspacesRoutesFactory(deps: BootedDeps) {
  const r = new Hono();

  const createSchema = z.object({
    name: z.string().min(1).max(100),
    kind: z.enum(["PRIVATE", "SHARED"]),
    default_currency: z.string().regex(/^[A-Z]{3}$/),
  });
  ...
  // POST /workspaces -- create new workspace
  r.post("/", zValidator("json", createSchema), async (c) => {
    const session = c.get("session");
    if (!session) return c.json({ error: "unauthorized" }, 401);

    const body = c.req.valid("json");

    const auth = deps.identity.auth as any;

    try {
      const slug = (await import("nanoid")).nanoid(12);
      const r2 = await auth.api.createOrganization({
        body: {
          name: body.name,
          slug,
          kind: body.kind,
          default_currency: body.default_currency,
          userId: session.user.id,
        },
        headers: c.req.raw.headers,
      });
      return c.json({ id: r2.id, name: body.name }, 201);
    } catch (e) {
      const msg = (e as Error).message ?? "unknown";
      if (/PRIVATE workspaces/.test(msg)) return c.json({ error: msg }, 409);
      console.error("[create-ws] failed:", msg, e);
      throw e;
    }
  });
```

**Apply to:** `apps/api/src/routes/budgets.ts` (rename of `workspaces.ts`). Factory rename `workspacesRoutesFactory` -> `budgetsRoutesFactory`. `auth.api.createOrganization` call is preserved (Better Auth org-plugin contract -- see RESEARCH.md pitfall 3).

---

## 6. Hono route registration in `app.ts`

**Analog:** `apps/api/src/app.ts:21-91` -- entire mount block. Critical: the per-path `requireWorkspace` (-> `requireBudget`) middleware loop at lines 70-81.

`apps/api/src/app.ts:21-36` (imports):

```typescript
import { authRoutes } from "./routes/auth";
import { workspacesRoutesFactory } from "./routes/workspaces";
import { settingsRoutesFactory } from "./routes/settings";
import { createFxRoute } from "./routes/fx";
import { createAccountsRoute } from "./routes/accounts";
import { createCategoriesRoute } from "./routes/categories";
import { createCategoryLimitsRoute } from "./routes/category-limits";
import { createBudgetTemplatesRoute } from "./routes/budget-templates";
import { createShareOverridesRoute } from "./routes/share-overrides";
import { createWorkspaceSettingsRoute } from "./routes/workspace-settings";
import { createTransactionsRoute } from "./routes/transactions";
import { createCurrenciesRoute } from "./routes/currencies";
import { createRecurringRulesRoute } from "./routes/recurring-rules";
import { createRecurringDraftsRoute } from "./routes/recurring-drafts";
```

Mount + middleware-loop pattern `apps/api/src/app.ts:56-91`:

```typescript
  // 6a. Auth-only routes (signed-in, but no active workspace required)
  //     /workspaces -- caller may be creating their first workspace
  //     /currencies -- supported-currency catalogue (signed-in users only)
  //     /settings   -- per-user settings independent of workspace
  app.use("/workspaces/*", requireAuth);
  app.use("/currencies/*", requireAuth);
  app.use("/settings/*", requireAuth);
  app.route("/workspaces", workspacesRoutesFactory(deps));
  app.route("/settings", settingsRoutesFactory(deps));
  app.route("/currencies", createCurrenciesRoute(deps));

  // 6b. Workspace-scoped routes -- every handler reads tenantIds; we MUST 403
  //     when no active workspace is bound, otherwise tenantId="" reaches Drizzle
  //     and bubbles a raw SQL error to the client (see UAT 02 finding T3).
  for (const path of [
    "/fx/*",
    "/accounts/*",
    "/categories/*",
    "/budget-templates/*",
    "/workspace-settings/*",
    "/transactions/*",
    "/recurring-rules/*",
    "/recurring-drafts/*",
  ]) {
    app.use(path, requireAuth, requireWorkspace);
  }
  app.route("/fx", createFxRoute(deps));
  app.route("/accounts", createAccountsRoute(deps));
  app.route("/categories", createCategoriesRoute(deps));
  ...
  app.route("/workspace-settings", createWorkspaceSettingsRoute(deps));
```

**Apply to:** Plan 01-03 swaps `"/workspaces/*"` -> `"/budgets/*"`, `"/accounts/*"` -> `"/wallets/*"`, factory imports `workspacesRoutesFactory` -> `budgetsRoutesFactory`, `createAccountsRoute` -> `createWalletsRoute`, `createWorkspaceSettingsRoute` -> `createBudgetSettingsRoute`. **No aliases** (D-09) -- old paths fall through to default Hono 404.

---

## 7. Domain entity class

**Analog:** `packages/budgeting/src/domain/account.ts:1-83` -- full file.

Pure class, no Drizzle imports (dep-cruiser enforced). Uses `Money` value object from `@budget/shared-kernel`. `Result<void, Error>` return type for invariants. Pattern: enum literal type + class with `public readonly` constructor params.

`packages/budgeting/src/domain/account.ts:1-44`:

```typescript
/**
 * account.ts -- Account aggregate root
 * Domain entity: no Drizzle imports (dep-cruiser enforced).
 * Currency immutable per ACCT-04.
 */
import { ok, err, type Result } from "@budget/shared-kernel";
import type { Money } from "@budget/shared-kernel";

export type AccountKind =
  | "CASH"
  | "CHECKING"
  | "SAVINGS"
  | "CREDIT_CARD"
  | "LOAN"
  | "INVESTMENT";

export type AccountScope = "PERSONAL" | "SHARED";

const LIABILITY_KINDS: ReadonlySet<AccountKind> = new Set([
  "CREDIT_CARD",
  "LOAN",
]);

export class Account {
  constructor(
    public readonly id: string,
    public readonly tenantId: string,
    public name: string,
    public readonly kind: AccountKind,
    public readonly scope: AccountScope,
    public readonly currency: string, // immutable per ACCT-04
    public currentBalance: Money,
    public archivedAt: Date | null,
    public readonly createdAt: Date,
    public readonly actorUserId: string,
  ) {}

  isLiability(): boolean {
    return LIABILITY_KINDS.has(this.kind);
  }
  ...
```

**Apply to:** `packages/budgeting/src/domain/wallet.ts` (renamed). Plan 01-02 changes:

- Class `Account` -> `Wallet`.
- Type `AccountKind` -> `WalletType` with literals `'SPENDINGS' | 'CUSHION' | 'RESERVE'` (MIG-04).
- **DROP** `AccountScope` type + `scope` constructor param (MIG-03).
- `LIABILITY_KINDS` set likely removed (the v1.0 liability split was tied to old kinds).
- `canChangeCurrency()` / `archive()` / `applyAdjustment()` methods preserved.

Same pattern for `packages/tenancy/src/domain/workspace.ts` -> `budget.ts` (`Workspace` class -> `Budget` class, add `cushionModeEnabled: boolean` field).

---

## 8. Domain repo (adapter) -- Drizzle import boundary + `withTenantTx`

**Analog:** `packages/budgeting/src/adapters/persistence/account-repo.ts:1-85` (`create`), then `:87-114` (`findById`), `:166-201` (`archive`).

`packages/budgeting/src/adapters/persistence/account-repo.ts:1-37` (imports + rowToAccount):

```typescript
/**
 * account-repo.ts -- Drizzle adapter for AccountRepo port
 * MUST NOT be imported by domain/application layers (dep-cruiser).
 * Each write: withTenantTx -> SQL -> writeAudit -> writeOutbox.
 */
import { sql } from "drizzle-orm";
import { withTenantTx, writeAudit, writeOutbox } from "@budget/platform";
import { TenantId, UserId, Money } from "@budget/shared-kernel";
import type { Account } from "../../domain/account";
import type { AccountRepo } from "../../ports/account-repo";

function rowToAccount(row: {
  id: string;
  tenant_id: string;
  name: string;
  kind: string;
  scope: string;
  ...
}): Account {
  const { Account: AccountClass } = require("../../domain/account");
  return new AccountClass(
    row.id,
    row.tenant_id,
    row.name,
    row.kind as any,
    row.scope as any,
    row.currency,
    Money.fromDb(row.current_balance ?? "0", row.currency as any),
    ...
  );
}
```

Canonical create-write block at lines 40-85 (every adapter write is this shape -- `withTenantTx` -> INSERT -> `writeAudit` -> `writeOutbox`):

```typescript
  async create(account: Account): Promise<void> {
    const tid = TenantId(account.tenantId);
    const uid = UserId(account.actorUserId);

    const r = await withTenantTx(tid, uid, async (tx) => {
      await tx.execute(
        sql`INSERT INTO budgeting.accounts
              (id, tenant_id, name, kind, scope, currency, current_balance, archived_at, created_at, actor_user_id)
            VALUES
              (${account.id}::uuid, ${account.tenantId}::uuid, ${account.name},
               ${account.kind}, ${account.scope}, ${account.currency},
               ${account.currentBalance.amount.toFixed(4)}::numeric,
               ${account.archivedAt?.toISOString() ?? null},
               ${account.createdAt.toISOString()}, ${account.actorUserId}::uuid)`,
      );

      await writeAudit(tx, {
        tenantId: tid,
        entityType: "account",
        entityId: account.id,
        action: "create",
        actorUserId: uid,
        before: null,
        after: { name: account.name, kind: account.kind, scope: account.scope, currency: account.currency },
      });

      await writeOutbox(tx, {
        tenantId: tid,
        aggregateType: "account",
        aggregateId: account.id,
        eventType: "budgeting.account.created",
        payload: { kind: account.kind, currency: account.currency, actorUserId: account.actorUserId },
      });
    });

    if (r.isErr()) throw r.error;
  }
```

Read pattern (no audit/outbox, same `withTenantTx` wrap so RLS GUC is set) `:87-114`:

```typescript
  async findById(tenantId: string, id: string): Promise<Account | null> {
    // withTenantTx sets app.tenant_ids GUC for RLS
    const tid = TenantId(tenantId);
    const uid = UserId(tenantId); // use tenantId as placeholder userId for reads
    const r = await withTenantTx(tid, uid, async (tx) => {
      const result = await tx.execute<{ id: string; ... }>(
        sql`SELECT id, tenant_id, name, kind, scope, currency, current_balance::text,
                   archived_at, created_at, actor_user_id
            FROM budgeting.accounts
            WHERE id = ${id}::uuid AND tenant_id = ${tenantId}::uuid`,
      );
      return result.rows[0] ?? null;
    });
    if (r.isErr()) throw r.error;
    if (!r.value) return null;
    return rowToAccount(r.value);
  }
```

**Apply to:** `packages/budgeting/src/adapters/persistence/wallet-repo.ts` (rename). Plan 01-02:

- File rename + class `DrizzleAccountRepo` -> `DrizzleWalletRepo`.
- All SQL `budgeting.accounts` -> `budgeting.wallets`.
- All event/audit `entityType: "account"`/`aggregateType: "account"`/`eventType: "budgeting.account.*"` -> `wallet`.
- DROP `scope` from row type, INSERT col list, VALUES, and audit `after`.
- `kind` column type changes (text+CHECK -> enum) but column name stays as `kind` in SQL only if you accept MIG-04 wording exactly OR rename to `wallet_type` (research recommends keep as `kind` in transitional Phase 1; Plan 01-01 final wording governs).

---

## 9. i18n message subtree shape

**Analog:** `apps/web/messages/en.json:133-183` (workspaces top-level + nested `workspace` singular) and `:272-285` (`budgeting.accounts` subtree). Three locales (en/pl/uk) keep identical key trees; only string values translate.

`apps/web/messages/en.json:133-162` -- `workspaces` subtree to rename to `budgets`:

```json
  "workspaces": {
    "empty": {
      "eyebrow": "Get started",
      "heading": "Create your first workspace",
      "body": "A workspace holds one budget. Make a private one for yourself, or a shared one to plan with family.",
      "cta": "Create workspace"
    },
    "create": {
      "heading": "New workspace",
      "name": {
        "label": "Workspace name",
        "placeholder": "e.g. Family budget"
      },
      "kind": {
        "label": "Workspace type",
        "private": "Private -- just me",
        "shared": "Shared -- invite family"
      },
      "currency": {
        "label": "Default currency",
        "helper": "This is permanent -- every entry in this workspace settles in this currency.",
        "placeholder": "Select currency"
      },
      "cta": "Create workspace",
      "success": "Workspace \"{name}\" created.",
      "validation": {
        "name_required": "Workspace name is required.",
        "currency_required": "Default currency is required."
      }
    },
```

`apps/web/messages/en.json:184-236` -- singular `workspace.*` subtree (shares/invite/leave/transfer/settings) -- also renamed to `budget.*`.

`apps/web/messages/en.json:249-258` -- `nav` subtree (contains both `workspaces` and `accounts`):

```json
  "nav": {
    "dashboard": "Dashboard",
    "workspaces": "Workspaces",
    "settings": "Settings",
    "onboarding": "Get started",
    "sign_out": "Sign out",
    "budget": "Budget",
    "accounts": "Accounts",
    "transactions": "Transactions",
    "recurring": "Recurring"
  },
```

`apps/web/messages/en.json:272-285` -- `budgeting.accounts` subtree (rename to `budgeting.wallets`):

```json
  "budgeting": {
    "accounts": {
      "title": "Accounts",
      "addButton": "Add account",
      "form": {
        "title": "New account",
        "nameLabel": "Account name",
        "namePlaceholder": "e.g. Cash Wallet",
        "kindLabel": "Account kind",
        "scopeLabel": "Scope",
        "currencyLabel": "Currency",
        "currencyPlaceholder": "Select currency",
        "saveButton": "Save account",
```

**Apply to:** Plan 01-04 -- rewrite three files (`en.json`, `pl.json`, `uk.json`):

- Top-level `workspaces` -> `budgets`.
- Top-level `workspace` (singular) -> `budget` (singular).
- `nav.workspaces` -> `nav.budgets`, `nav.accounts` -> `nav.wallets`.
- `budgeting.accounts` -> `budgeting.wallets` (note: `form.scopeLabel` also drops per D-13).
- All English copy strings ("Workspaces", "Workspace", "workspace") also rephrase to "Budget(s)"; PL/UK keep their semantic translations but switch the noun. Codemod via `jq` recommended (CONTEXT D-05 discretion).

---

## 10. `api-client.ts` pattern -- Hono RPC type wiring

**Analog:** `apps/web/src/lib/api-client.ts:1-36` (the entire file, 36 lines).

```typescript
import { hc } from "hono/client";
// PC-02 + PC-15: type-only import -- AppType is apps/api's public RPC contract.
// apps/web only imports this type for compile-time type safety.
// No runtime code from apps/api is bundled here.
// Do NOT import from @budget/*/src/{adapters,domain,application,ports} or /dist/ paths.
// Import via local shim type to prevent cascading api type errors (see src/types/api-type.d.ts).
import type { AppType } from "@/types/api-type";
import { extractWorkspaceIdFromPath } from "@/lib/workspace-fetch";

type AnyApi = any;

// Server-side: use internal Docker URL; browser: same-origin via Next.js rewrite /api/*
const _apiBase =
  typeof window !== "undefined"
    ? "/api"
    : (process.env["API_INTERNAL_URL"] ?? "http://api:4000");

export const api: AnyApi = hc<AppType>(_apiBase, {
  fetch: (input: RequestInfo | URL, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    if (typeof window !== "undefined") {
      const wsId = extractWorkspaceIdFromPath(window.location.pathname);
      if (wsId && !headers.has("X-Workspace-ID")) {
        headers.set("X-Workspace-ID", wsId);
      }
    }
    return fetch(input, {
      ...init,
      headers,
      credentials: "include",
    });
  },
});

export type { AppType };
```

**Apply to:** Plan 01-04 edit-in-place (D-08).

- `extractWorkspaceIdFromPath` -> `extractBudgetIdFromPath` (helper rename in companion file -- see item 11).
- Variable `wsId` -> `budgetId`.
- Header `"X-Workspace-ID"` -> `"X-Budget-ID"` on both `has` and `set` calls (D-10).
- `AppType` re-import stays -- apps/api's `createApp` is re-typed in Plan 01-03 to refer to renamed factories.

---

## 11. Tenant header injection -- `workspace-fetch.ts` + `tenant-guard.ts`

**Analog A -- Browser-side path-regex + header-set:** `apps/web/src/lib/workspace-fetch.ts:1-30` (entire file).

```typescript
/**
 * workspace-fetch.ts -- CLIENT-safe helpers shared with server code.
 * Anything requiring next/headers lives in workspace-fetch.server.ts.
 */

const WORKSPACE_PATH_RE = /^\/[a-z]{2}\/workspaces\/([0-9a-fA-F-]{8,})/;

export function extractWorkspaceIdFromPath(pathname: string): string | null {
  const m = WORKSPACE_PATH_RE.exec(pathname);
  return m?.[1] ?? null;
}

/**
 * Browser-side fetch wrapper. Reads the wsId from window.location.pathname
 * (`/[locale]/workspaces/[wsId]/...`) and attaches it to every API call as
 * the X-Workspace-ID header. Returns the raw Response.
 */
export async function clientApiFetch(
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const headers = new Headers(init.headers);
  if (typeof window !== "undefined") {
    const wsId = extractWorkspaceIdFromPath(window.location.pathname);
    if (wsId && !headers.has("X-Workspace-ID")) {
      headers.set("X-Workspace-ID", wsId);
    }
  }
  return fetch(`/api${path}`, { ...init, headers });
}
```

**Apply to:** rename file -> `apps/web/src/lib/budget-fetch.ts`. Regex `\/workspaces\/` -> `\/budgets\/`. Function `extractWorkspaceIdFromPath` -> `extractBudgetIdFromPath`. Local var `wsId` -> `budgetId`. Header `"X-Workspace-ID"` -> `"X-Budget-ID"`. Companion `workspace-fetch.server.ts` gets the same rename pass.

**Analog B -- Server-side header read:** `apps/api/src/middleware/tenant-guard.ts:32-52` (the header-read block).

```typescript
const userId = session.user.id as UserId;

// The web client picks a workspace from the URL (`/workspaces/[wsId]/...`)
// and sends it on every API call as `X-Workspace-ID`. We MUST verify the
// caller is a member of that workspace before trusting it.
//
// If no header is present we leave tenantIds empty; downstream
// requireWorkspace then returns 403 (or the route is auth-only and never
// reads tenantIds). The legacy `active_workspace_ids` user-preference
// path is intentionally NOT consulted any more -- workspace context is
// explicit-via-URL, never implicit-via-session.
const requestedWsId =
  c.req.header("x-workspace-id") ?? c.req.header("X-Workspace-ID") ?? null;

if (!requestedWsId) {
  c.set("tenantIds", []);
  await next();
  return;
}
```

The `bootstrapFn` block below it issues `SELECT wm.workspace_id::text AS id FROM tenancy.workspace_members wm WHERE wm.user_id = ... AND wm.workspace_id = ...` (lines 56-63) -- table + column renames flow into this raw SQL via Plan 01-03.

**Apply to:** Plan 01-03.

- Variable `requestedWsId` -> `requestedBudgetId`.
- Headers `"x-workspace-id"`, `"X-Workspace-ID"` -> `"x-budget-id"`, `"X-Budget-ID"`.
- Inline SQL: `tenancy.workspace_members` -> `tenancy.budget_members`, `workspace_id` -> `budget_id`.
- Comment block: rewrite `/workspaces/[wsId]/...` -> `/budgets/[id]/...`.

GUC `app.tenant_ids` is unchanged -- the rename is HTTP-only, not DB-level (RESEARCH pitfall 4).

---

## 12. Tenant-leak CI gate test file

**Test directory:** `tests/tenant-leak/` (5 backend tests, listed via `ls`):

- `force-rls-on-all-tables.test.ts` (T-1, pg_class probe)
- `no-guc-zero-rows.test.ts`
- `pg-roles-no-bypassrls.test.ts`
- `job-without-tenant-errors.test.ts`
- `in-process-bus-tenant-scope.test.ts`

Plus fixtures:

- `tests/tenant-leak/fixtures/seed-two-tenants.ts`
- `tests/tenant-leak/fixtures/raw-pg-client.ts`
- `tests/tenant-leak/USER-DATA-TABLES.txt` (authoritative table list -- must be updated to `tenancy.budgets`, `tenancy.budget_members`, `tenancy.shared_budget_member_shares`)

Plus Playwright test 6:

- `apps/web/e2e/cross-tenant-cache.spec.ts`

### 12a. USER-DATA-TABLES.txt -- authoritative table enumeration

`tests/tenant-leak/USER-DATA-TABLES.txt:23-35` (the INCLUDED block -- these names are read at runtime by tests 1 + 4):

```
# ============================================================
# INCLUDED -- must have FORCE ROW LEVEL SECURITY
# ============================================================

# identity.users / identity.accounts -- Phase 1 EXCLUDED (see EXCLUDED block).
identity.sessions                         USER-SCOPED   # sessions_owner_only policy (app.current_user_id)
identity.user_preferences                 USER-SCOPED   # user_preferences_owner_only policy (app.current_user_id)
tenancy.workspaces                        TENANT-SCOPED # workspaces_tenant_isolation policy (app.tenant_ids)
tenancy.workspace_members                 TENANT-SCOPED # workspace_members_tenant_isolation (+ workspace_members_self bootstrap, PC-01)
tenancy.shared_workspace_member_shares    TENANT-SCOPED # shares_tenant_isolation policy (app.tenant_ids)
shared_kernel.audit_history               TENANT-SCOPED # audit_history_tenant_isolation policy (app.tenant_ids)
shared_kernel.user_keys                   USER-SCOPED   # PC-12: user_keys_owner_only keyed by app.current_user_id (NOT app.tenant_ids)
budgeting.expense_ledger                  TENANT-SCOPED # expense_ledger_tenant_isolation policy (app.tenant_ids)
```

`:43`: `tenancy.workspace_invitations` (EXCLUDED -- token-keyed).

**Apply to:** Plan 01-01 (D-05). Rename in lockstep with migration:

- `tenancy.workspaces` -> `tenancy.budgets`
- `tenancy.workspace_members` -> `tenancy.budget_members`
- `tenancy.shared_workspace_member_shares` -> `tenancy.shared_budget_member_shares`
- `tenancy.workspace_invitations` -> `tenancy.budget_invitations`
- Policy-name comments updated correspondingly.

If Plan 01-01 also adds `budgeting.tasks` + the renamed `budgeting.budget_mode_history`, both must be appended as INCLUDED rows here.

### 12b. Test 4 shape -- how a backend test reads the file

`tests/tenant-leak/force-rls-on-all-tables.test.ts:22-47, 76-92` (parseTablesFile + the iteration that asserts pg_class state):

```typescript
function parseTablesFile(): { included: string[]; excluded: string[] } {
  const content = readFileSync(TABLES_FILE, "utf8");
  const included: string[] = [];
  const excluded: string[] = [];

  for (const rawLine of content.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const parts = line.split(/\s+/);
    const table = parts[0];
    const scope = parts[1];
    if (!table || !scope) continue;
    if (scope === "TENANT-SCOPED" || scope === "USER-SCOPED")
      included.push(table);
    if (scope === "EXCLUDED") excluded.push(table);
  }
  return { included, excluded };
}
...
      for (const table of included) {
        const row = byName.get(table);
        if (!row) {
          failures.push(`${table}: NOT FOUND in pg_class -- table does not exist`);
          continue;
        }
        if (!row.relrowsecurity) failures.push(`${table}: relrowsecurity=false -- RLS is disabled`);
        if (!row.relforcerowsecurity) failures.push(`${table}: relforcerowsecurity=false -- FORCE ROW LEVEL SECURITY is not set`);
      }
```

The test code itself is **table-name-agnostic** -- it reads `USER-DATA-TABLES.txt` at runtime. **Updating only the .txt file fixes test 4 mechanically.** Test 1 (`no-guc-zero-rows.test.ts`) and test 5 (`in-process-bus-tenant-scope.test.ts`) likely have similar parser-driven shapes (planner of 01-04 verifies); test 3 (`pg-roles-no-bypassrls.test.ts`) tests role attributes only -- table-name-independent.

### 12c. Seed fixture references to update

`tests/tenant-leak/fixtures/seed-two-tenants.ts:14-19`:

```typescript
import { createIdentityModule } from "@budget/identity";
import { createTenancyModule } from "@budget/tenancy";
import { signUp } from "@budget/identity/src/application/sign-up";
import { createWorkspace } from "@budget/tenancy/src/application/create-workspace";
import { withTenantTx } from "@budget/platform";
import { TenantId, UserId } from "@budget/shared-kernel";
```

And `:90-91, 153-184`:

```typescript
  const auth = identityModule.auth as Parameters<typeof signUp>[0]["auth"] &
    Parameters<typeof createWorkspace>[0]["auth"];
...
  // Create tenantA: PRIVATE workspace owned by alice
  const wsAResult = await createWorkspace(
    { auth },
    {
      name: "Tenant-A WS",
      kind: "PRIVATE",
      default_currency: "USD",
      ownerUserId: aliceId,
    },
  );
  ...
  const tenantA = TenantId(wsAResult.value.workspaceId);
  const tenantB = TenantId(wsBResult.value.workspaceId);
```

**Apply to:** Plan 01-04 verification (or 01-02 cascade depending on plan boundary):

- Import path `@budget/tenancy/src/application/create-workspace` -> `@budget/tenancy/src/application/create-budget`.
- Function `createWorkspace` -> `createBudget`.
- Field `wsAResult.value.workspaceId` -> `wsAResult.value.budgetId` (Plan 01-02 renames application return shape).
- Variable comments "tenantA: PRIVATE workspace" -> "tenantA: PRIVATE budget".

---

## 13. E2E Gherkin step pattern with `scope`

**Analog:** `tests/e2e/steps/budget.steps.ts:54-88, 160-181, 640-654`. Steps reference `scope` in three places.

`tests/e2e/steps/budget.steps.ts:54-88` -- account form fill (includes scope tab):

```typescript
When(
  "I fill the account form with name {string}, kind {string}, scope {string}, currency {string}",
  async (
    { page },
    name: string,
    kind: string,
    scope: string,
    currency: string,
  ) => {
    const accPage = new AccountsPage(page);
    await accPage.fillAccountName(name);

    // Kind: Radix Select -> click trigger then matching option.
    // Account form i18n labels each kind; option text matches the i18n value
    // (e.g. "Cash", "Checking", "Credit card", "Loan").
    if (kind && kind.toUpperCase() !== "CASH") {
      const kindLabel = page.getByLabel(/account kind|kind/i).first();
      await kindLabel.click();
      const optionMatchers: Record<string, RegExp> = {
        CHECKING: /checking/i,
        SAVINGS: /savings/i,
        CREDIT_CARD: /credit card/i,
        LOAN: /loan/i,
        INVESTMENT: /investment/i,
        CASH: /cash/i,
      };
      const m = optionMatchers[kind.toUpperCase()] ?? new RegExp(kind, "i");
      await page.getByRole("option", { name: m }).first().click();
    }

    // Scope tab (PERSONAL / SHARED).
    await page.getByRole("tab", { name: new RegExp(scope, "i") }).click();

    // Currency picker.
    await accPage.currencyTrigger().click();
    await page
      .getByRole("option", { name: new RegExp(currency, "i") })
      .first()
      .click();
  },
);
```

`tests/e2e/steps/budget.steps.ts:160-181` -- category create step posting `scope`:

```typescript
When(
  "I create a category {string} with scope {string}",
  async ({ page }, name: string, scope: string) => {
    const res = await page.request.post("/api/categories", {
      data: { name, scope },
    });
    if (!res.ok()) {
      const body = await res.text();
      throw new Error(`POST /api/categories failed: ${res.status()} ${body}`);
    }
    // Verify GET roundtrip before reloading the page (catches stale render).
    const list = await page.request.get("/api/categories");
    if (list.ok()) {
      const data = (await list.json()) as { categories?: Array<{ name: string }> };
      const found = (data.categories ?? []).some((c) => c.name === name);
      if (!found) {
        throw new Error(
          `Created category ${name} but GET /api/categories did not return it; got: ${JSON.stringify(data)}`,
        );
      }
```

`tests/e2e/steps/budget.steps.ts:640-654` -- given-step posting `scope`:

```typescript
Given(
  "I have a category {string} with scope {string}",
  async ({ page }, name: string, scope: string) => {
    const res = await page.request.post("/api/categories", {
      headers: { "Idempotency-Key": crypto.randomUUID() },
      data: { name, scope },
    });
    if (![201, 409].includes(res.status())) {
      const body = await res.text();
      throw new Error(
        `expected 201/409 from ${res.url()}, got ${res.status()}: ${body}`,
      );
    }
  },
);
```

**Apply to:** Plan 01-04 (per D-13 -- `categories.scope` drop cascades to E2E).

- Drop `scope` parameter from both `category` step definitions; reduce `{string}` placeholder count.
- Drop `scope` from POST body -- request becomes `data: { name }`.
- Companion `.feature` files (not enumerated here) must be edited to drop `with scope {string}` clauses. Planner of 01-04 greps `tests/e2e/features/**` for `with scope`.
- Page Object `tests/e2e/pages/TransactionsPage.ts:132` and the AccountsPage scope-tab call at `budget.steps.ts:79` also need a strip for the wallet form (Phase 2 reshapes wallet form, but Phase 1 minimum-compile means stripping the scope tab click since `accounts.scope`/`categories.scope` are gone). Phase 1 may keep PERSONAL/SHARED rendering as a transitional UI shell; depends on Plan 01-04 scope.

---

## Shared Patterns (cross-cutting)

### S1. Tenant scope at adapter boundary

**Source:** `@budget/platform` exports `withTenantTx`, `writeAudit`, `writeOutbox`, `appRole`, `workerRole`, `budgeting`, `tenancy` schema namespaces.
**Apply to:** every adapter file under `packages/{budgeting,tenancy}/src/adapters/persistence/`. Survives rename -- only table-name strings inside SQL templates change.

### S2. Result-style error handling

**Source:** `@budget/shared-kernel` exports `ok`, `err`, `Result<T,E>`.
**Apply to:** every domain method (see Account.archive at `account.ts:59-65`) and every application service returning `Result`. Adapters throw via `if (r.isErr()) throw r.error`.

### S3. Hono route -- pickTenant + safeParse + Result

**Source:** `apps/api/src/routes/accounts.ts`.
**Apply to:** every renamed route file. Pattern: `const tenantId = pickTenant(c)` -> `const r = await deps.budgeting.<service>(...)` -> `if (r.isErr()) return serverError(c, "...", r.error)` or `c.json({ error: r.error.message }, 422)`.

### S4. Drizzle pgPolicy with split SELECT/INSERT/UPDATE/DELETE

**Source:** `apps/migrator/post-migration.sql:280-305` -- the Better Auth org-plugin split pattern.
**Apply to:** new `tasks` table (single-policy is fine -- tasks are app-written; no Better Auth involvement). Apply to renamed `tenancy.budgets` + `tenancy.budget_members` (split required because Better Auth orgs plugin still issues INSERT...RETURNING).

### S5. `--> statement-breakpoint` marker

**Source:** all `drizzle/*.sql` files. Required between every CREATE/ALTER/INSERT in hand-authored 0012.

### S6. Schema-prefixed identifiers everywhere

**Source:** post-migration.sql uses `tenancy.budgets`, `budgeting.tasks` consistently. drizzle-orm `budgeting.table(...)` factory binds the schema; SQL template tags use raw `budgeting.<name>`.

---

## No Analog Found

| Plan-1 file                                 | Reason                                                                                                                           | Use instead                                                                                                                                      |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `budgeting.tasks` table -- RLS policy shape | First budgeting table with no FK to `tenancy.budgets` until Plan 7. Closest model is `workspace_budget_mode_history` (item 1+2). | Pattern from item 1 (category-limits-schema.ts). FK to `tenancy.budgets(id) ON DELETE CASCADE` per CONTEXT discretion.                           |
| `wallet_type` ENUM type                     | No existing enum-type DDL in `drizzle/*.sql` -- all v1.0 schema uses `text` + CHECK.                                             | `CREATE TYPE budgeting.wallet_type AS ENUM ('SPENDINGS','CUSHION','RESERVE');` per RESEARCH skeleton at lines 250-253. No closer analog in repo. |
| `0012_*.sql` RENAME chain                   | No prior migration in `drizzle/` does a bulk RENAME -- every prior migration is CREATE/INSERT only.                              | Pattern from Postgres docs (CITED in RESEARCH §Architecture Pattern 1); 0011's hand-author preamble (item 3) governs file-header style.          |

---

## Metadata

**Analog search scope:**

- `packages/budgeting/src/{adapters/persistence,domain,application,ports}/`
- `packages/tenancy/src/{adapters/persistence,domain,application,ports}/`
- `apps/api/src/{app.ts,routes,middleware}/`
- `apps/web/src/lib/{api-client,workspace-fetch}.ts`
- `apps/web/messages/{en,pl,uk}.json`
- `apps/migrator/post-migration.sql`
- `drizzle/0000_*.sql` ... `drizzle/0011_*.sql`
- `tests/tenant-leak/{,fixtures}/`, `tests/e2e/steps/`

**Files quoted from disk (line ranges read):**

- `packages/budgeting/src/adapters/persistence/category-limits-schema.ts:1-43`
- `packages/budgeting/src/adapters/persistence/workspace-budget-mode-history-schema.ts:1-41`
- `packages/budgeting/src/adapters/persistence/accounts-schema.ts:1-53`
- `packages/budgeting/src/adapters/persistence/category-limit-repo.ts:50-110` (full file read)
- `packages/budgeting/src/adapters/persistence/account-repo.ts:1-201`
- `packages/budgeting/src/domain/account.ts:1-83`
- `apps/api/src/routes/accounts.ts:1-150`
- `apps/api/src/routes/workspaces.ts:1-90`
- `apps/api/src/app.ts:1-96`
- `apps/api/src/middleware/tenant-guard.ts:1-78`
- `apps/web/src/lib/api-client.ts:1-36`
- `apps/web/src/lib/workspace-fetch.ts:1-30`
- `apps/web/messages/en.json:125-285`
- `apps/migrator/post-migration.sql:1-120, 180-410, 410-520`
- `drizzle/0011_plan_02_08_recurring.sql:1-54`
- `tests/tenant-leak/USER-DATA-TABLES.txt:1-48`
- `tests/tenant-leak/force-rls-on-all-tables.test.ts:1-135`
- `tests/tenant-leak/fixtures/seed-two-tenants.ts:1-228`
- `tests/e2e/steps/budget.steps.ts:50-179, 635-654`

**Pattern extraction date:** 2026-05-11

---
phase: quick-260613-nkb
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/migrator/post-migration.sql
  - drizzle/0035_drop_currency_immutable_trigger.sql
  - drizzle/meta/_journal.json
  - packages/tenancy/test/default-currency-immutable.test.ts
  - packages/tenancy/src/adapters/persistence/better-auth-org.ts
  - apps/api/test/routes/budget-identity.test.ts
autonomous: false
requirements: [SETT-02, TENT-11, D-04]
must_haves:
  truths:
    - "Zero-transaction budget can change default_currency (PATCH returns 200, DB row updated)"
    - "Budget WITH a non-deleted transaction is still blocked from changing default_currency (409 currency_locked)"
    - "Fresh DBs never recreate the budgets_currency_immutable trigger (removed from post-migration.sql)"
    - "Existing DBs drop the stale trigger + function on next migrate (idempotent DROP IF EXISTS via 0035)"
    - "better-auth-org beforeUpdateOrganization no longer unconditionally blocks default_currency (consistent with hasTransactions rule)"
  artifacts:
    - path: "drizzle/0035_drop_currency_immutable_trigger.sql"
      provides: "Idempotent DROP TRIGGER + DROP FUNCTION for budgets_currency_immutable"
      contains: "DROP TRIGGER IF EXISTS budgets_currency_immutable"
    - path: "drizzle/meta/_journal.json"
      provides: "Journal entry idx 35 / tag 0035 — without it the .sql is ignored"
      contains: "0035_drop_currency_immutable_trigger"
    - path: "packages/tenancy/test/default-currency-immutable.test.ts"
      provides: "Regression guard asserting NEW transaction-aware rule"
      contains: "default_currency"
  key_links:
    - from: "apps/migrator/src/migrate.ts"
      to: "apps/migrator/post-migration.sql"
      via: "runs migrations THEN post-migration.sql in same process"
      pattern: "post-migration"
    - from: "apps/api/src/routes/budget-identity.ts"
      to: "workspaceRepo.hasTransactions"
      via: "pre-UPDATE app guard (the rule's sole owner after this fix)"
      pattern: "hasTransactions"
---

<objective>
Changing a budget's default currency in Settings fails with HTTP 422 `update_failed` even when the budget has ZERO transactions. The app layer is already correct (transaction-aware guard); the failure comes from a stale DB trigger `budgets_currency_immutable` that blocks ANY `default_currency` change with no transaction awareness. It predates the Phase-6 (SETT-02 / D-04 / TENT-11) relaxation to "currency locked only after the first transaction".

Fix: make the application layer the SOLE owner of the currency-lock rule. Remove the redundant + wrong DB trigger so fresh DBs never recreate it, ship an idempotent migration to drop it from existing DBs, and bring the dormant Better Auth hook into line with the same rule so it's not a latent trap.

Purpose: Restore the intended SETT-02 behavior — currency editable until first transaction — while preserving the D-04 / TENT-11 data-integrity invariant (no currency change once money is recorded).
Output: post-migration.sql edit, migration 0035 + journal entry, rewritten regression test, relaxed Better Auth hook, integration test proving both directions.

## Preserved invariant (read before touching anything)

D-04 / TENT-11: a budget's `default_currency` MUST NOT change once any money has been recorded against it, because historical `amount_cents` are stored in that currency and would silently corrupt. This invariant is FULLY preserved after the fix:

- The route guard (`apps/api/src/routes/budget-identity.ts:133-138`) short-circuits with 409 `currency_locked` BEFORE the UPDATE whenever `workspaceRepo.hasTransactions(budgetId)` is true.
- `hasTransactions` = `EXISTS(SELECT 1 FROM budgeting.expense_ledger WHERE budget_id=? AND deleted_at IS NULL)` (`workspace-repo.ts:445-466`) — fires on ANY non-deleted ledger row, sets `app.tenant_ids` first so RLS does not hide rows.
  The trigger we are removing was strictly MORE restrictive (blocked even zero-tx) and is therefore not load-bearing for the invariant — the app guard subsumes it. We are not weakening the rule; we are deleting an over-broad duplicate.
  </objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
</execution_context>

<context>
@./CLAUDE.md
@.planning/STATE.md

<verified_root_cause>
All file:line references below were re-verified against current code on the tasks-redesign branch.

1. Stale trigger — apps/migrator/post-migration.sql:398-409:
   - `CREATE OR REPLACE FUNCTION tenancy.budgets_block_currency_change()` raises `EXCEPTION 'default_currency is immutable post-create (TENT-11, D-04)'` on ANY `NEW.default_currency IS DISTINCT FROM OLD.default_currency`. No transaction awareness.
   - `CREATE TRIGGER budgets_currency_immutable BEFORE UPDATE ON tenancy.budgets FOR EACH ROW EXECUTE FUNCTION ...`.

2. Migrator ordering — apps/migrator/src/migrate.ts:23-35:
   - Runs `migrate(...)` (all drizzle migrations) FIRST, THEN reads + executes post-migration.sql as ONE raw transaction in the SAME process.
   - CONSEQUENCE: a migration 0035 that DROPs the trigger runs, then post-migration.sql immediately RECREATES it. BOTH edits are mandatory — dropping in the migration alone is futile.

3. App guard (correct) — apps/api/src/routes/budget-identity.ts:133-139:
   - `if (body.default_currency !== undefined) { if (await hasTransactions(budgetId)) return 409 currency_locked }` — short-circuits BEFORE updateIdentity.
   - Catch (169-177): maps `/immutable|locked|constraint/i` → 409, else 422 `update_failed`. The live zero-tx case returns 422 because withTenantTx wraps the PG message so the regex misses it. After the trigger is dropped this catch path is DEAD for zero-tx (UPDATE succeeds); real-tx never reaches it (pre-UPDATE 409). Regex is moot for this bug — DO NOT touch it.

4. Repo raw UPDATE — workspace-repo.ts:255-258 (inside updateIdentity, withTenantTx):
   - `UPDATE tenancy.budgets SET default_currency = ${patch.defaultCurrency} WHERE id = ${budgetId}::uuid` — this is the statement the trigger throws on.

5. Dormant Better Auth hook — better-auth-org.ts:95-106:
   - `beforeUpdateOrganization` throws `default_currency is immutable post-create (TENT-11, D-04)` if `data.default_currency !== undefined` — UNCONDITIONAL. The PATCH route bypasses Better Auth (calls workspaceRepo.updateIdentity directly), so this is NOT the active bug, but it is the same stale rule and a latent trap.

6. Stale test — packages/tenancy/test/default-currency-immutable.test.ts:
   - Two tests assert OLD unconditional immutability. The second one even UPDATEs `tenancy.workspaces` (pre-0012 table name; current table is tenancy.budgets). Will FAIL / be meaningless after the fix.

7. Journal — drizzle/meta/\_journal.json: last entry idx 34, tag 0034_budget_nav_perf_indexes. NOTE idx 29 is skipped (0028 → 0030). Next NEW migration = idx 35, tag 0035 (when value: use a monotonically-increasing ms timestamp greater than 0034's 1749815000000 — e.g. 1781600000000).
   </verified_root_cause>

<interfaces>
From workspace-repo.ts (the rule's owner — reuse, do NOT duplicate the EXISTS query elsewhere by hand):
```typescript
async hasTransactions(budgetId: string): Promise<boolean>;  // EXISTS non-deleted expense_ledger row, sets app.tenant_ids first
async updateIdentity(budgetId: string, patch: { name?; defaultCurrency?; reservesEnabled?; cushionEnabled?; cushionTargetMonths? }, actorUserId: string): Promise<void>;
```

From better-auth-org.ts (sibling hooks already use these for tenant-scoped reads):

```typescript
import { withTenantTx } from "@budget/platform";
import { TenantId, UserId } from "@budget/shared-kernel";
// beforeAddMember pattern: withTenantTx(TenantId(org.id), UserId(actorUserId), async (tx) => tx.execute(sql`...`))
```

Migrator contract (apps/migrator/src/migrate.ts): migrations run first, then the WHOLE post-migration.sql in one tx. Any error aborts the migrate — keep post-migration.sql edit syntactically valid.
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Drop the stale currency-immutable trigger (post-migration.sql + migration 0035) and rewrite the regression test for the transaction-aware rule</name>
  <files>apps/migrator/post-migration.sql, drizzle/0035_drop_currency_immutable_trigger.sql, drizzle/meta/_journal.json, packages/tenancy/test/default-currency-immutable.test.ts, apps/api/test/routes/budget-identity.test.ts</files>
  <behavior>
    RED first — rewrite the regression test to assert the NEW rule, watch it fail against current (trigger-present) code, then make it green by removing the trigger:
    - packages/tenancy/test/default-currency-immutable.test.ts (rewrite both tests):
      - Test A "zero-transaction budget CAN change default_currency": create owner + PRIVATE budget (USD), NO ledger rows. Perform the same raw UPDATE the repo does — `withInfraTx` → `SET LOCAL app.tenant_ids = '{<budgetId>}'` then `UPDATE tenancy.budgets SET default_currency = 'EUR' WHERE id = <budgetId>`. Assert result is Ok AND a follow-up SELECT shows default_currency = 'EUR'. (This FAILS today: trigger throws.)
      - Test B "budget WITH a non-deleted transaction CANNOT change default_currency": create owner + budget, INSERT one budgeting.expense_ledger row (deleted_at NULL, minimal valid columns — mirror an existing ledger-insert test fixture; set app.tenant_ids in the same tx). Then assert workspaceRepo.hasTransactions(budgetId) === true. (The lock is now enforced at the app/route layer via hasTransactions, NOT the DB — so assert the guard signal, not a DB throw.)
      - Use tenancy.budgets everywhere (NOT the pre-0012 tenancy.workspaces). Keep BDD naming.
    - apps/api/test/routes/budget-identity.test.ts: add a case proving the ROUTE behavior end-to-end with the fake deps already in the file — hasTransactions:false + default_currency change → updateIdentity called with { defaultCurrency } AND response 200; hasTransactions:true + default_currency change → 409 currency_locked, updateIdentity NOT called. (The 409 case likely exists; add/repair the 200 zero-tx case which is the bug.)
  </behavior>
  <action>
    GREEN — remove the trigger so the rule lives only in the app layer:
    1. apps/migrator/post-migration.sql: DELETE the entire block at lines 398-409 (the `-- D-04 / TENT-11: default_currency immutable post-create.` comment, the `CREATE OR REPLACE FUNCTION tenancy.budgets_block_currency_change()` body, the `DROP TRIGGER IF EXISTS budgets_currency_immutable`, and the `CREATE TRIGGER budgets_currency_immutable ...`). Leave the surrounding blocks (wallets policies above, PC-11 budget_members_private_guard below) untouched. Add a one-line breadcrumb comment in its place: `-- D-04/TENT-11 currency lock is enforced in the app layer (budget-identity route + workspaceRepo.hasTransactions); the old DB trigger was over-broad (blocked zero-tx) and was removed in migration 0035.` This removal is MANDATORY: migrate.ts runs post-migration.sql AFTER migrations, so leaving it would recreate the trigger after 0035 drops it.
    2. Create drizzle/0035_drop_currency_immutable_trigger.sql — idempotent, applies to EXISTING DBs:
       ```sql
       -- 0035: drop the stale unconditional default_currency immutability trigger.
       -- The transaction-aware currency lock (D-04/TENT-11) is enforced in the app layer
       -- (budget-identity route guard via workspaceRepo.hasTransactions). The old trigger
       -- blocked ALL changes incl. zero-transaction budgets — see quick-260613-nkb.
       DROP TRIGGER IF EXISTS budgets_currency_immutable ON tenancy.budgets;
       DROP FUNCTION IF EXISTS tenancy.budgets_block_currency_change();
       ```
    3. drizzle/meta/_journal.json: append a NEW entry to the `entries` array after idx 34:
       ```json
       { "idx": 35, "version": "7", "when": 1781600000000, "tag": "0035_drop_currency_immutable_trigger", "breakpoints": true }
       ```
       Without this entry drizzle's migrator IGNORES the .sql file. Keep valid JSON (comma after the previous closing brace).
    4. Run the rewritten tenancy test + the budget-identity route test — both must now pass (zero-tx change succeeds; with-tx still locked at the guard).
  </action>
  <verify>
    <automated>cd /home/claude/budget && infisical run --env=dev -- bun test packages/tenancy/test/default-currency-immutable.test.ts && bun test apps/api/test/routes/budget-identity.test.ts</automated>
  </verify>
  <done>
    - post-migration.sql no longer contains `budgets_block_currency_change` or `CREATE TRIGGER budgets_currency_immutable` (grep -v '^[[:space:]]*--' | grep -c returns 0 for both).
    - drizzle/0035_drop_currency_immutable_trigger.sql exists with idempotent DROP TRIGGER + DROP FUNCTION.
    - _journal.json has a valid idx-35 / tag 0035 entry; `bun -e "JSON.parse(require('fs').readFileSync('drizzle/meta/_journal.json'))"` succeeds.
    - default-currency-immutable.test.ts asserts: zero-tx → currency change succeeds (DB shows new currency); with-tx → hasTransactions true / change blocked. Both green.
    - budget-identity route test: zero-tx default_currency change → 200 + updateIdentity called; with-tx → 409 + updateIdentity NOT called. Green.
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Bring the dormant Better Auth beforeUpdateOrganization hook in line with the transaction-aware rule (remove latent trap, no regression)</name>
  <files>packages/tenancy/src/adapters/persistence/better-auth-org.ts, packages/tenancy/test/default-currency-immutable.test.ts</files>
  <behavior>
    Add to default-currency-immutable.test.ts (or a sibling tenancy test) the hook-level expectations:
    - "Better Auth update of default_currency on a ZERO-transaction budget is allowed": call `identity.auth.api.updateOrganization({ body: { organizationId, default_currency: 'EUR', userId } })` on a budget with no ledger rows → resolves WITHOUT throwing (and, if the plugin persists, default_currency becomes EUR).
    - "Better Auth update of default_currency on a budget WITH a transaction throws": insert one non-deleted expense_ledger row, then the same updateOrganization call → throws with /currency|immutable|locked|transaction/i.
    These RED against the current unconditional-throw hook.
  </behavior>
  <action>
    DECISION (stated for the reviewer): the PATCH /budgets/:id route bypasses Better Auth and calls workspaceRepo.updateIdentity directly, so beforeUpdateOrganization is DORMANT for the active bug. We RELAX it to the SAME transaction-aware rule (rather than leaving it unconditional) so the rule is consistent across every write path and the latent trap is removed — without changing the route's behavior. The invariant is preserved: a with-tx budget still cannot change currency through this hook.

    In better-auth-org.ts beforeUpdateOrganization (lines 95-106), replace the unconditional throw with a transaction-aware check that mirrors hasTransactions:
    - Read `data = params.data ?? params`. If `data.default_currency === undefined` → return (nothing to check; same as today).
    - Resolve the budget id from the params (Better Auth passes `organizationId` / the org id; reuse the same id-extraction approach the sibling hooks use — inspect `params` for `organizationId`, `id`, or `params.organization?.id`). If no id can be resolved, KEEP the conservative throw (do not silently allow) and add a comment.
    - With the id, run the SAME existence check as workspaceRepo.hasTransactions, using the established sibling pattern:
      ```ts
      const r = await withTenantTx(TenantId(orgId), UserId(actorUserId), async (tx) => {
        await tx.execute(sql`SET LOCAL app.tenant_ids = '{${sql.raw(orgId.replace(/[^a-fA-F0-9-]/g, ""))}}'`); // RLS visibility, mirror hasTransactions
        const res = await tx.execute<{ exists: boolean }>(sql`SELECT EXISTS(SELECT 1 FROM budgeting.expense_ledger WHERE budget_id = ${orgId}::uuid AND deleted_at IS NULL) AS exists`);
        return res.rows[0]?.exists ?? false;
      });
      if (r.isErr()) throw r.error;
      if (r.value) throw new Error("default_currency is locked after the first transaction (TENT-11, D-04)");
      ```
      (withTenantTx already sets app.tenant_ids for the tenant; the explicit SET LOCAL is belt-and-suspenders to exactly match hasTransactions semantics — if the sibling beforeAddMember pattern proves it is redundant, drop the SET LOCAL line and rely on withTenantTx, but verify the EXISTS sees the row in the test.)
    - Keep the error message matching the route catch regex family (`locked`) for consistency. Do NOT change the route catch regex.
    - Update the `// D-04: default_currency immutable` comment to `// D-04/TENT-11: default_currency locked only AFTER the first transaction (matches app guard)`.

    Constraint: do NOT introduce a behavior regression — the route path is unchanged; only this previously-unreachable-for-PATCH hook becomes consistent. If resolving actorUserId for withTenantTx is not feasible from params, use the budget's owner_user_id (SELECT owner_user_id FROM tenancy.budgets WHERE id) or SYSTEM_USER as the tx actor — document the choice inline.

  </action>
  <verify>
    <automated>cd /home/claude/budget && infisical run --env=dev -- bun test packages/tenancy/test/default-currency-immutable.test.ts</automated>
  </verify>
  <done>
    - beforeUpdateOrganization no longer throws unconditionally on default_currency; it allows the change for zero-tx budgets and throws for with-tx budgets.
    - The transaction check reuses the hasTransactions semantics (non-deleted expense_ledger EXISTS, tenant-scoped).
    - Hook-level tests green: zero-tx allowed, with-tx throws.
    - No change to budget-identity route catch regex or route logic.
  </done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <what-built>Trigger removed from fresh + existing DBs (post-migration.sql edit + migration 0035), regression tests rewritten for the transaction-aware rule, Better Auth hook made consistent. Now deploy to the live stack and prove both directions on real budgets.</what-built>
  <how-to-verify>
    Claude runs these first (mechanical, before asking you to click):
    1. Rebuild + restart migrator/api/worker so the new migration applies on the live DB:
       `cd /home/claude/budget && docker compose build api worker && make restart-api && make restart-worker`
       (migrator runs on stack up; confirm logs show migration 0035 applied and post-migration.sql succeeded with no trigger recreation).
    2. Confirm the trigger is GONE on the live DB:
       `docker compose exec -T db psql "$DATABASE_URL_APP" -c "SELECT tgname FROM pg_trigger WHERE tgname = 'budgets_currency_immutable';"` → 0 rows.
    3. Full suite gate: `make test` (verify the rewritten tests pass — note make test infra debt: confirm via correct runners), `make ci-gate` (tenant-leak 6 tests still pass — RLS/isolation unchanged).
    4. Live PATCH proof against https://budget-dev.madonzy.com (creds uat-probe-1 / TestPass123!):
       - Zero-tx budget (e.g. "Scroll Test 0"): change default currency in Settings → expect 200, DB row updated (re-query default_currency).
       - With-tx budget (e.g. "Optimistic Tapo", 53 rows): change default currency → expect 409 currency_locked, DB unchanged.

    Then you confirm: open Settings on a zero-transaction budget, change the currency, save — it should succeed and persist after refresh. Open a budget that HAS transactions, try to change currency — it should be blocked (picker disabled or 409).

  </how-to-verify>
  <resume-signal>Type "approved" if zero-tx change succeeds AND with-tx change is blocked, or describe what you saw.</resume-signal>
</task>

</tasks>

<threat_model>

## Trust Boundaries

| Boundary                    | Description                                                                  |
| --------------------------- | ---------------------------------------------------------------------------- |
| client → PATCH /budgets/:id | Owner-authenticated currency change; untrusted body crosses here             |
| app → DB (tenancy.budgets)  | Currency UPDATE; data-integrity invariant enforced upstream of this boundary |

## STRIDE Threat Register

| Threat ID | Category               | Component                                                                        | Disposition | Mitigation Plan                                                                                                                                                                                                 |
| --------- | ---------------------- | -------------------------------------------------------------------------------- | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T-nkb-01  | Tampering              | currency change after transactions exist (would corrupt historical amount_cents) | mitigate    | Route guard returns 409 BEFORE UPDATE when hasTransactions (non-deleted expense_ledger EXISTS); Better Auth hook made consistent (Task 2). Invariant preserved — trigger removed was strictly more restrictive. |
| T-nkb-02  | Elevation of Privilege | non-owner mutating budget identity                                               | accept      | Unchanged — existing owner-only gate at budget-identity.ts:130-131 (callerEntry.role !== 'owner' → 403). Not touched by this fix.                                                                               |
| T-nkb-03  | Information Disclosure | hasTransactions EXISTS bypassing RLS / cross-tenant read                         | mitigate    | hasTransactions and the relaxed hook set app.tenant_ids before the EXISTS query so RLS scopes rows to the tenant; ci-gate (6 tenant-leak tests) re-run in the deploy checkpoint to confirm isolation unchanged. |
| T-nkb-04  | Denial of Service      | migration breaks live DB / aborts migrate                                        | mitigate    | DROP IF EXISTS is idempotent; post-migration.sql edit keeps the file syntactically valid (it runs as one tx — any syntax error aborts migrate, caught in deploy step 1).                                        |

</threat_model>

<verification>
- Trigger absent from post-migration.sql AND from the live DB (pg_trigger query 0 rows).
- Migration 0035 registered in _journal.json (valid JSON, idx 35) and present as .sql.
- Zero-tx budget: currency change → 200 + persisted (integration test + live UAT).
- With-tx budget: currency change → 409 currency_locked + DB unchanged (integration test + live UAT).
- D-04/TENT-11 invariant preserved (no currency change once any non-deleted ledger row exists) — owned solely by app guard, also enforced in the Better Auth hook.
- make ci-gate (tenant-leak) green — RLS/isolation unchanged.
- Existing budget-identity / budgets tests still green (no regression).
</verification>

<success_criteria>

- Changing a zero-transaction budget's default currency in Settings SUCCEEDS (200, DB updated, persists across refresh).
- Changing a with-transaction budget's default currency is still BLOCKED (409 currency_locked, DB unchanged).
- Fresh DBs never recreate the trigger; existing DBs drop it on next migrate.
- Better Auth beforeUpdateOrganization is consistent with the transaction-aware rule (no latent trap), with no route-behavior regression.
- Regression test asserts the NEW rule in both directions and stays as a guard.
- ci-gate + existing route tests pass.
  </success_criteria>

<output>
After completion, create `.planning/quick/260613-nkb-fix-currency-change-blocked-on-zero-tran/260613-nkb-SUMMARY.md`
</output>

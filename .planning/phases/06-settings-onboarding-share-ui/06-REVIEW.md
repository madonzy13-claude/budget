---
phase: 06-settings-onboarding-share-ui
reviewed: 2026-05-22T00:00:00Z
depth: standard
files_reviewed: 45
files_reviewed_list:
  - apps/api/src/app.ts
  - apps/api/src/routes/budget-archive.ts
  - apps/api/src/routes/budget-identity.ts
  - apps/api/src/routes/budget-members.ts
  - apps/api/src/routes/budgets.ts
  - apps/api/src/routes/onboarding.ts
  - apps/migrator/drizzle.config.ts
  - apps/migrator/post-migration.sql
  - drizzle/0024_phase06_onboarding_progress_archived_at.sql
  - apps/web/src/app/[locale]/(app)/budgets/[id]/settings/page.tsx
  - apps/web/src/app/[locale]/(app)/budgets/new/page.tsx
  - apps/web/src/app/[locale]/(app)/layout.tsx
  - apps/web/src/app/[locale]/(app)/onboarding/page.tsx
  - apps/web/src/app/[locale]/(app)/recurring/page.tsx
  - apps/web/src/app/[locale]/budgets/join/[token]/page.tsx
  - apps/web/src/components/onboarding/steps/step-categories.tsx
  - apps/web/src/components/onboarding/steps/step-currency.tsx
  - apps/web/src/components/onboarding/steps/step-name.tsx
  - apps/web/src/components/onboarding/steps/step-review.tsx
  - apps/web/src/components/onboarding/steps/step-type.tsx
  - apps/web/src/components/onboarding/wizard-layout.tsx
  - apps/web/src/components/onboarding/wizard-page.tsx
  - apps/web/src/components/onboarding/wizard-stepper.tsx
  - apps/web/src/components/settings/budget-identity-section.tsx
  - apps/web/src/components/settings/cushion-mode-section.tsx
  - apps/web/src/components/settings/danger-zone-section.tsx
  - apps/web/src/components/settings/members-section.tsx
  - apps/web/src/components/settings/recurring-section.tsx
  - apps/web/src/components/settings/settings-accordion.tsx
  - apps/web/src/components/settings/share-url-field.tsx
  - apps/web/src/components/share/join-page-card.tsx
  - apps/web/src/components/ui/accordion.tsx
  - apps/web/src/components/ui/switch.tsx
  - apps/web/src/middleware.ts
  - packages/budgeting/src/adapters/persistence/budget-mode-repo.ts
  - packages/identity/src/adapters/persistence/better-auth.ts
  - packages/tenancy/src/adapters/persistence/onboarding-progress-repo.ts
  - packages/tenancy/src/adapters/persistence/onboarding-progress-schema.ts
  - packages/tenancy/src/adapters/persistence/schema.ts
  - packages/tenancy/src/adapters/persistence/workspace-repo.ts
  - packages/tenancy/src/contracts/factory.ts
  - packages/tenancy/src/ports/budget-repo.ts
  - packages/tenancy/src/ports/onboarding-progress-repo.ts
  - apps/web/src/app/[locale]/(app)/budgets/new/page.tsx
  - packages/budgeting/src/adapters/persistence/budget-mode-repo.ts
findings:
  critical: 5
  warning: 7
  info: 3
  total: 15
status: issues_found
---

# Phase 6: Code Review Report

**Reviewed:** 2026-05-22T00:00:00Z
**Depth:** standard
**Files Reviewed:** 45
**Status:** issues_found

## Summary

Phase 6 implements Settings (budget identity, cushion mode, recurring rules, members, danger zone), the 5-step onboarding wizard, and the public share-link join flow. The architecture is fundamentally sound — RLS is applied, session-based ownership gates are present, and typed-name delete confirmation exists both client- and server-side.

However, five blocker-level issues were found, including a security bypass (PATCH /budgets/:id has no owner/member-role gate), a budget-orphaning path (wizard creates the budget on step 1 but hard-bails without cleanup if the user navigates away), a TOCTOU window in the onboarding redirect guard, an internal error message leak, and a missing `FORCE ROW LEVEL SECURITY` on `tenancy.onboarding_progress` in the migration file that adds the table. Seven warnings cover missing null guards, silent skips, and logic gaps.

---

## Critical Issues

### CR-01: PATCH /budgets/:id has no owner-only gate — any member can rename or toggle cushion mode

**File:** `apps/api/src/routes/budget-identity.ts:71-131`

**Issue:** The `PATCH /:id` handler in `budget-identity.ts` only checks that the caller's `tenantIds` includes `budgetId`. It does not verify the caller is an `owner`. Any `member`-role user can rename the budget (line 95), change the currency (line 99), or toggle cushion mode (line 119). By contrast, `budget-members.ts` and `budget-archive.ts` both load `listMembers()` and assert `callerEntry.role === "owner"`.

`POST /:id/archive`, `POST /:id/delete`, and `POST /:id/invitations` are all owner-gated. `PATCH /:id` is not.

**Fix:**
```typescript
// After the tenantIds gate (line 79), add:
const members = await deps.tenancy.workspaceRepo.listMembers(budgetId);
const callerEntry = members.find((m) => m.userId === actorUserId);
if (!callerEntry) return c.json({ error: "not_found" }, 404);
if (callerEntry.role !== "owner") return c.json({ error: "forbidden" }, 403);
```

---

### CR-02: Onboarding wizard creates budget on step 1 then orphans it if the user abandons

**File:** `apps/web/src/components/onboarding/wizard-page.tsx:120-135`

**Issue:** Step 1 calls `POST /budgets` and stores `budgetId` in React state (line 133). If the user closes the tab, navigates away, or refreshes before reaching step 5, a real budget row is left in the database with no `completed_at` and no categories. On next sign-in the layout guard (layout.tsx:51-68) redirects back to `/budgets/new?step=1` (because `completed_at` is null) but `budgetId` is null in fresh React state — so step 2 silently skips its PATCH (line 139-143: `if (budgetId)`), step 3 also skips silently, and step 4 also skips category creation (line 166: `if (budgetId)`). The user ends up with an empty budget they never explicitly created.

Furthermore, resuming at `?step=2` or higher starts with `budgetId = null`, so all PATCH calls and category POSTs are silently no-ops. The wizard reads `?step` from the URL (line 60-64) but does NOT restore `budgetId` from the server.

**Fix:** On mount, if `initialStep > 1`, fetch the in-progress budget from the server (e.g. `GET /budgets/active` filtered to incomplete/no-category budgets, or store the `budgetId` in the `onboarding_progress` row). Alternatively, block navigation away via `beforeunload` and clean up the orphan on hard-cancel. At minimum, the `if (budgetId)` guards in steps 2-4 must not silently succeed — they must surface an error.

---

### CR-03: Internal error message leaked to clients in PATCH /budgets/:id

**File:** `apps/api/src/routes/budget-identity.ts:112`

**Issue:** When `updateIdentity` throws an error that does not match `immutable|locked|constraint`, the handler returns the raw `(e as Error).message` directly in the JSON response body:

```typescript
return c.json({ error: msg }, 422);
```

This leaks internal Postgres error messages (table names, constraint names, internal state) to authenticated clients, which is a security anti-pattern and an information-disclosure risk.

**Fix:**
```typescript
// Replace lines 111-113 with:
console.error("[budget-identity] updateIdentity failed:", msg);
return c.json({ error: "update_failed" }, 422);
```

---

### CR-04: Onboarding layout redirect guard has TOCTOU window — unauthenticated users see redirect loop

**File:** `apps/web/src/app/[locale]/(app)/layout.tsx:51-69`

**Issue:** The guard fetches `GET /onboarding/progress` (line 53) and redirects to `/budgets/new?step=...` if `completedAt` is null. But `/budgets/new` itself is rendered inside the same `(app)` layout — meaning the layout runs again on the wizard page. Line 51 checks `!pathname.includes("/budgets/new")`, which prevents infinite redirect. However this check is fragile: it tests the raw Next.js pathname header injected by middleware. If the middleware header is absent (e.g. direct RSC invocation in CI, or any middleware bypass), `pathname` is null (line 43), the guard is skipped entirely (`if (pathname && ...)`), and a genuinely incomplete user reaches protected pages without completing onboarding.

Additionally, if `serverApiFetch` succeeds with a 200 but the progress object is malformed/empty (e.g. `{}`), `progress.completedAt` is `undefined`, which is falsy, triggering a redirect even for users with completed onboarding that returned an empty body.

**Fix:** Add a type guard for the progress response and treat `undefined` completedAt as "safe/no-redirect" rather than redirect-triggering:
```typescript
// Replace line 59 with:
if (progress.completedAt === null) {  // strict null check — undefined means absent/error, not incomplete
```

---

### CR-05: `tenancy.onboarding_progress` missing `FORCE ROW LEVEL SECURITY` in the migration SQL

**File:** `drizzle/0024_phase06_onboarding_progress_archived_at.sql:16-24`

**Issue:** The migration creates `tenancy.onboarding_progress` and calls `ALTER TABLE tenancy.onboarding_progress ENABLE ROW LEVEL SECURITY` (enabling RLS) but does NOT call `ALTER TABLE tenancy.onboarding_progress FORCE ROW LEVEL SECURITY`. Without `FORCE`, the table owner (the migrator role) bypasses all RLS policies. In a scenario where the migrator's connection is reused or a bug routes a query through the owner connection, all rows become visible/writable with no user-scoping.

The `post-migration.sql` file (line 198) does add `FORCE ROW LEVEL SECURITY` for this table, but that runs only as a post-step. If the migration file is applied without running `post-migration.sql` (e.g. CI drift, manual replay), the table is unprotected. The pattern for all other protected tables (e.g. `budgeting.expense_ledger`, `identity.users`) co-locates `FORCE RLS` in the same migration file.

**Fix:** Add to `drizzle/0024_phase06_onboarding_progress_archived_at.sql` after line 16:
```sql
ALTER TABLE tenancy.onboarding_progress FORCE ROW LEVEL SECURITY;
```

---

## Warnings

### WR-01: `PUT /budgets/active` does not validate against archived budgets

**File:** `apps/api/src/routes/budgets.ts:101-114`

**Issue:** `PUT /budgets/active` (line 108) calls `listForUser`, which correctly filters `archived_at IS NULL` (workspace-repo.ts line 77). However it then filters `workspaceIds` against `membershipIds` which are all non-archived budgets. An attacker who has the UUID of an archived budget they previously owned can still include it in `workspaceIds` — the filter at line 110 will reject it (because archived budgets don't appear in `listForUser`). This is actually safe. But if a budget is archived AFTER `listForUser` runs and before the `setActiveWorkspaceIds` write (TOCTOU), the archived budget sneaks into `active_workspace_ids`. Downstream `tenantGuard` will then grant tenant access to an archived budget, bypassing the archive soft-delete.

**Fix:** The archived-budget filter should be enforced server-side at the `tenantGuard` layer as well, not only at `listForUser`. Add `archived_at IS NULL` to the RLS predicate or the `tenantGuard` membership query.

---

### WR-02: `POST /:id/archive` does not unset the budget from `active_workspace_ids`

**File:** `apps/api/src/routes/budget-archive.ts:62-68`

**Issue:** After archiving a budget, the `archived_at` column is set but `tenantGuard` still reads `active_workspace_ids` from the user's preferences to build `tenantIds`. If the budget was active at archive time, subsequent requests from the same session will still see the budget in `tenantIds` (because `setActiveWorkspaceIds` is never called). Until the user's session refreshes, the `tenantIds` guard still allows access to the archived budget.

**Fix:** After a successful archive, call `setActiveWorkspaceIds` to remove `budgetId` from the caller's active set, or have `tenantGuard` cross-check against `archived_at IS NULL`.

---

### WR-03: `budget-mode-repo.ts` references a non-existent table name

**File:** `packages/budgeting/src/adapters/persistence/budget-mode-repo.ts:39,49,57,62`

**Issue:** All SQL queries reference `budgeting.workspace_budget_mode_history`, but the Drizzle schema file for this table was renamed to `budget_mode_history` in v1.1 (per the migrator comment in `drizzle.config.ts` line 11: "workspace-budget-mode-history-schema.ts → budget-mode-history-schema.ts"). If the table was actually renamed by a migration, all queries in `budget-mode-repo.ts` will fail at runtime with a "relation does not exist" error. This silently breaks the cushion mode toggle (SETT-03).

**Fix:** Verify whether the table was physically renamed in the database. If so, update all occurrences of `workspace_budget_mode_history` to the current table name throughout `budget-mode-repo.ts`.

---

### WR-04: `RecurringSection` ignores its `budgetId` prop — rules never load

**File:** `apps/web/src/components/settings/recurring-section.tsx:31,57-61`

**Issue:** `RecurringSection` accepts a `budgetId` prop and a `rules` prop (line 29-30). The implementation destructures only `rules` (line 31: `{ rules = [] }`) and never uses `budgetId`. The `rules` prop is passed from `SettingsAccordion` (settings-accordion.tsx line 81) without any value — it will always be `undefined`, defaulting to `[]`. Recurring rules are never fetched; the section always renders empty.

**Fix:** Add a `useQuery` hook inside `RecurringSection` that fetches rules using `budgetId`:
```typescript
export function RecurringSection({ budgetId, rules: initialRules = [] }: RecurringSectionProps) {
  const { data } = useQuery({
    queryKey: ["recurring-rules", budgetId],
    queryFn: async () => { /* fetch from api */ },
    enabled: !!budgetId,
  });
  const rules = data ?? initialRules;
```

---

### WR-05: `MembersSection` shows Revoke button for owners but owner revoke path is silently wrong

**File:** `apps/web/src/components/settings/members-section.tsx:60,99-149`

**Issue:** Line 60 filters `nonOwnerMembers = members.filter(m => m.role !== "owner")` — so the Revoke button is only shown for non-owner members, which is correct. However the `GET /:id/members` API response (`workspace-repo.ts:95-116`) does not include `name` or `email` fields on members — only `userId`, `role`, and `joinedAt`. The `Member` interface (members-section.tsx:32-37) declares optional `name` and `email`. In practice, `getInitials()` and `getDisplayName()` fall through to `member.userId` (a UUID) which produces unreadable 2-character initials ("cb") and a UUID as the display name. This is a data-completeness bug that renders the members section unusable.

**Fix:** `workspace-repo.ts:listMembers` needs a JOIN to `identity.users` to fetch `name` and `email`, or the API response must be extended to include display information.

---

### WR-06: `settings-accordion.tsx` hard-codes `isLastOwner` based only on budget kind — incorrect for SHARED single-owner

**File:** `apps/web/src/components/settings/settings-accordion.tsx:107`

**Issue:** Line 107:
```typescript
isLastOwner={isOwner && budget.kind === "PRIVATE"}
```
This computes `isLastOwner` as "owner of a PRIVATE budget". But a SHARED budget can also have exactly one owner — in that case the Leave button should also be disabled. Any SHARED budget where the owner is the only member (e.g. just created, never invited anyone) shows an active Leave button that will fail server-side with a `last_owner` 409.

**Fix:** Pass owner count from the settings page (requires `GET /budgets/:id/members` at page level) or add an `ownerCount` field to the `SettingsBudget` interface. Until then, the client should handle the 409 response from the leave endpoint and show the appropriate error message.

---

### WR-07: `onboarding.ts` PUT /progress silently succeeds when repo is missing

**File:** `apps/api/src/routes/onboarding.ts:57-70`

**Issue:** If `deps.tenancy.onboardingProgressRepo` is null/undefined (the `(deps.tenancy as any).onboardingProgressRepo` cast at line 57), `PUT /progress` returns `{ ok: true }` with a 200 without actually persisting the step. The wizard's `putProgress()` (wizard-page.tsx:97-103) already wraps this in a try/catch and treats it as best-effort, but the `GET /progress` fallback (onboarding.ts:34-36) returns `{ step: 1 }` — so a partially-completed wizard always restarts from step 1 for users on misconfigured deployments instead of resuming.

This also means the `isErr()` path that should propagate failures is never reached — the route always returns 200 even on a configuration error. Given this is `(deps.tenancy as any)`, it is also a type safety gap.

**Fix:** `onboardingProgressRepo` should be a first-class typed field in `OnboardingDeps`, not an `as any` cast. The route factory should fail at construction time if the repo is absent, not silently at runtime.

---

## Info

### IN-01: `hasTransactions` in workspace-repo.ts queries a non-existent table

**File:** `packages/tenancy/src/adapters/persistence/workspace-repo.ts:143-154`

**Issue:** `hasTransactions()` (line 143) queries `budgeting.transactions` but the actual table in this codebase is `budgeting.expense_ledger` (referenced throughout `post-migration.sql` and all other adapters). If `budgeting.transactions` does not exist, the currency-lock check in `budget-identity.ts` will always throw and be caught as a "locked" error (line 108: `/immutable|locked|constraint/i` match), returning a false `currency_locked` 409 for all currency-change attempts.

**Fix:** Verify the actual table name. If it is `expense_ledger`, update line 147:
```sql
SELECT 1 FROM budgeting.expense_ledger
  WHERE tenant_id = ${budgetId}::uuid AND deleted_at IS NULL
```
Note: the existing `hasTransactions` query uses `budget_id` column, while `expense_ledger` uses `tenant_id`. Both the column name and table name should be verified.

---

### IN-02: Wizard step 3 PATCHes `kind` but the PATCH schema does not accept `kind`

**File:** `apps/web/src/components/onboarding/wizard-page.tsx:148-154` and `apps/api/src/routes/budget-identity.ts:16-24`

**Issue:** Step 3 calls:
```typescript
await api.budgets[":id"].$patch({
  param: { id: budgetId },
  json: { kind: form.kind },
});
```
But `patchBudgetSchema` in `budget-identity.ts` only defines `name`, `default_currency`, and `cushion_mode_enabled` — no `kind` field. Zod's `zValidator` will strip unknown keys silently (Zod strips by default) and the PATCH will return `{ ok: true }` with no actual change. The budget `kind` set on step 3 is never persisted. The budget will always be created with the step-1 default (`form.kind` is "PRIVATE" at step 1 when `POST /budgets` is called) regardless of the user's step-3 choice.

**Fix:** Either (a) add `kind: z.enum(["PRIVATE", "SHARED"]).optional()` to `patchBudgetSchema` and implement the update in `updateIdentity`, or (b) change the wizard to include `kind` in the step-1 POST payload (which already accepts `kind`).

---

### IN-03: `join-page-card.tsx` does not handle network errors on accept — user sees no feedback

**File:** `apps/web/src/components/share/join-page-card.tsx:74-77`

**Issue:** The catch block at line 74 silently swallows network errors:
```typescript
} catch {
  // network error — leave accepting=false so user can retry
}
```
The user sees the button re-enabled but receives no error message. Per the component's own JSDoc comment, `toast.error` should be shown. The `copy()` function in `share-url-field.tsx` correctly shows `toast.error` for the same class of error.

**Fix:**
```typescript
} catch {
  toast.error(t("join_failed"));
}
```

---

_Reviewed: 2026-05-22T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_

# All-Budgets Aggregate Overview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the multi-budget listing view with a household-level aggregate overview — combined net worth in the user's display currency, per-member ownership shares, and a per-member "include in aggregation" flag.

**Architecture:** New columns on `tenancy.budget_members` hold each member's ownership share + include flag. A budgeting app service (`getAllBudgetsAggregate`) fans out over `getOverviewCards` per budget, FX-converts each to the user's `display_currency`, scales wealth figures by the member's share, and returns per-budget rows the client sums. Two write paths: owner-gated ownership-share editor, self-editable include flag. A new `AggregateOverview` client component reuses the overview primitives.

**Tech Stack:** Bun, Hono (Zod-OpenAPI + RPC), Drizzle + Postgres + RLS, Next.js App Router, React Query, next-intl, recharts, Dinero `Money`, `bun:test` / Vitest / Playwright-BDD.

## Global Constraints

- All money on the wire is **string** cents (bigint `.toString()` at the route boundary); domain keeps bigint.
- Every hand-authored `drizzle/*.sql` migration **must** be registered in `drizzle/meta/_journal.json` (idx + tag) or the migrator skips it → CI fresh-DB 500s.
- After editing `apps/web/**` or `messages/*.json`, rebuild: `docker compose build web && infisical run --env=dev -- make restart-web` (from repo root). Source runs from prebuilt images — no hot reload.
- Run web/Vitest tests from `apps/web`: `cd apps/web && bunx vitest run <path>` (root cwd loses happy-dom → "document is not defined").
- Backend tests: `make test` (bun:test, real Postgres). Never mock the DB in integration tests.
- All new user-facing strings in `apps/web/messages/{en,pl,uk}.json` (EN + PL + UK).
- DESIGN.md is authority: single yellow accent (`--num-hero` for hero total), BinancePlex (`.num`) on every number, trading up/down as **text** color only, flat surfaces + hairlines, no shadows/gradients, `max-w-[1280px]`.
- TDD: red → green → refactor. Commit per task. **No git push / PR until the user explicitly asks.**
- Ownership share scales **wealth figures only** (net worth, investments, cash, reserves, cushion). Spent/left this-month and all counts are unscaled.
- `tenantId === budgetId` in this codebase (tenant = budget).

---

## File Structure

**Backend (packages/tenancy):**

- `packages/tenancy/src/adapters/persistence/schema.ts` — add 2 columns to `budgetMembers`.
- `drizzle/0063_member_aggregation_shares.sql` — migration (+ `_journal.json` entry).
- `packages/tenancy/src/domain/ownership-shares.ts` — NEW: `validateShares()` Σ=100 domain rule.
- `packages/tenancy/src/ports/budget-repo.ts` — extend port with 4 methods.
- `packages/tenancy/src/adapters/persistence/workspace-repo.ts` — implement the 4 methods + churn edits.

**Backend (packages/budgeting):**

- `packages/budgeting/src/application/get-all-budgets-aggregate.ts` — NEW: fan-out aggregate service.
- `packages/budgeting/src/application/get-aggregate-wealth-trend.ts` — NEW: combined trend service.

**Backend (apps/api):**

- `apps/api/src/boot.ts` — compose both services.
- `apps/api/src/routes/budgets-aggregate.ts` — NEW: `GET /budgets/aggregate`, `GET /budgets/aggregate/wealth`.
- `apps/api/src/routes/budget-members.ts` — NEW: `PUT /budgets/:id/aggregation` (self), `PUT /budgets/:id/members/shares` (owner).
- `apps/api/src/app.ts` — mount the aggregate router **before** `/budgets/:id`.

**Frontend (apps/web):**

- `apps/web/src/components/settings/aggregation-section.tsx` — NEW: self include toggle.
- `apps/web/src/components/settings/ownership-shares-section.tsx` — NEW: owner Σ=100 editor.
- `apps/web/src/components/settings/settings-accordion.tsx` — render both, gated.
- `apps/web/src/hooks/use-budgets-aggregate.ts` — NEW: React Query hooks.
- `apps/web/src/components/budgeting/aggregate/aggregate-overview.tsx` — NEW: hero + breakdown + attention + flow.
- `apps/web/src/components/budgeting/aggregate/aggregate-composition.tsx` — NEW: pie block.
- `apps/web/src/components/budgeting/aggregate/aggregate-trend.tsx` — NEW: trend block.
- `apps/web/src/components/budgeting/home-budgets-client.tsx` — render `AggregateOverview` for ≥2 budgets in the list view.
- `apps/web/messages/{en,pl,uk}.json` — strings.

**E2E:**

- `apps/web/e2e/features/budgets-aggregate.feature` + `apps/web/e2e/steps/budgets-aggregate.steps.ts`.

---

## Task 1: Migration + schema columns

**Files:**

- Modify: `packages/tenancy/src/adapters/persistence/schema.ts:72-83` (budgetMembers)
- Create: `drizzle/0063_member_aggregation_shares.sql`
- Modify: `drizzle/meta/_journal.json`
- Test: `packages/tenancy/test/member-aggregation-columns.test.ts`

**Interfaces:**

- Produces: `budget_members.ownership_share_pct SMALLINT NOT NULL DEFAULT 0`, `budget_members.include_in_aggregation BOOLEAN NOT NULL DEFAULT true`; Drizzle fields `ownershipSharePct`, `includeInAggregation`.

- [ ] **Step 1: Write the failing test** (`packages/tenancy/test/member-aggregation-columns.test.ts`)

```ts
import { describe, it, expect } from "bun:test";
import { sql } from "drizzle-orm";
import { appDb } from "../src/adapters/persistence/db"; // match existing test db import

describe("budget_members aggregation columns", () => {
  it("has ownership_share_pct (default 0) and include_in_aggregation (default true)", async () => {
    const cols = await appDb().execute<{
      column_name: string;
      column_default: string;
      is_nullable: string;
    }>(sql`
      SELECT column_name, column_default, is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'tenancy' AND table_name = 'budget_members'
        AND column_name IN ('ownership_share_pct', 'include_in_aggregation')
      ORDER BY column_name`);
    const byName = Object.fromEntries(cols.rows.map((r) => [r.column_name, r]));
    expect(byName["include_in_aggregation"]?.is_nullable).toBe("NO");
    expect(byName["include_in_aggregation"]?.column_default).toContain("true");
    expect(byName["ownership_share_pct"]?.is_nullable).toBe("NO");
    expect(byName["ownership_share_pct"]?.column_default).toContain("0");
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `make test 2>&1 | grep -A3 "aggregation columns"`
Expected: FAIL (columns don't exist).

- [ ] **Step 3: Add the migration** (`drizzle/0063_member_aggregation_shares.sql`)

```sql
-- Per-member aggregation settings (all-budgets aggregate overview).
ALTER TABLE tenancy.budget_members
  ADD COLUMN IF NOT EXISTS ownership_share_pct SMALLINT NOT NULL DEFAULT 0;
ALTER TABLE tenancy.budget_members
  ADD COLUMN IF NOT EXISTS include_in_aggregation BOOLEAN NOT NULL DEFAULT true;

-- Backfill: the owner of each existing budget owns 100%, everyone else 0%.
UPDATE tenancy.budget_members SET ownership_share_pct = 100 WHERE role = 'owner';
UPDATE tenancy.budget_members SET ownership_share_pct = 0 WHERE role <> 'owner';
```

- [ ] **Step 4: Register in `drizzle/meta/_journal.json`**

Append a new entry to the `entries` array (bump `idx` to the next integer, set `tag` to `0063_member_aggregation_shares`, copy the `version`/`when` shape of the previous entry with a fixed `when` timestamp — do NOT use Date.now in the file; match the existing entries' integer format).

- [ ] **Step 5: Add the Drizzle columns** (`schema.ts`, inside `budgetMembers` after `role`)

```ts
  ownershipSharePct: smallint("ownership_share_pct").notNull().default(0),
  includeInAggregation: boolean("include_in_aggregation").notNull().default(true),
```

Ensure `smallint` is imported from `drizzle-orm/pg-core` at the top of the file.

- [ ] **Step 6: Rebuild the migrator image + migrate, then run the test**

Run: `docker compose build migrator && infisical run --env=dev -- make migrate && make test 2>&1 | grep -A3 "aggregation columns"`
Expected: PASS. (`make migrate` no-ops unless the migrator image is rebuilt — always rebuild it first.)

- [ ] **Step 7: Commit**

```bash
git add packages/tenancy/src/adapters/persistence/schema.ts drizzle/0063_member_aggregation_shares.sql drizzle/meta/_journal.json packages/tenancy/test/member-aggregation-columns.test.ts
git commit -m "feat(tenancy): per-member ownership_share_pct + include_in_aggregation columns"
```

---

## Task 2: Ownership-share domain validation

**Files:**

- Create: `packages/tenancy/src/domain/ownership-shares.ts`
- Test: `packages/tenancy/test/ownership-shares.test.ts`

**Interfaces:**

- Produces: `validateShares(shares: { userId: string; pct: number }[]): void` — throws `InvalidShareTotal` unless every pct is an integer in [0,100] and Σ === 100. `class InvalidShareTotal extends Error`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "bun:test";
import {
  validateShares,
  InvalidShareTotal,
} from "../src/domain/ownership-shares";

describe("validateShares", () => {
  it("accepts an even split that sums to 100 (34/33/33)", () => {
    expect(() =>
      validateShares([
        { userId: "a", pct: 34 },
        { userId: "b", pct: 33 },
        { userId: "c", pct: 33 },
      ]),
    ).not.toThrow();
  });
  it("accepts a single owner at 100", () => {
    expect(() => validateShares([{ userId: "a", pct: 100 }])).not.toThrow();
  });
  it("rejects a total of 99", () => {
    expect(() =>
      validateShares([
        { userId: "a", pct: 60 },
        { userId: "b", pct: 39 },
      ]),
    ).toThrow(InvalidShareTotal);
  });
  it("rejects a total of 101", () => {
    expect(() =>
      validateShares([
        { userId: "a", pct: 60 },
        { userId: "b", pct: 41 },
      ]),
    ).toThrow(InvalidShareTotal);
  });
  it("rejects a negative or non-integer pct", () => {
    expect(() =>
      validateShares([
        { userId: "a", pct: -1 },
        { userId: "b", pct: 101 },
      ]),
    ).toThrow(InvalidShareTotal);
    expect(() =>
      validateShares([
        { userId: "a", pct: 33.5 },
        { userId: "b", pct: 66.5 },
      ]),
    ).toThrow(InvalidShareTotal);
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `make test 2>&1 | grep -A3 "validateShares"`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement** (`ownership-shares.ts`)

```ts
export class InvalidShareTotal extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidShareTotal";
  }
}

/** Ownership shares must be integers in [0,100] and sum to exactly 100. */
export function validateShares(
  shares: { userId: string; pct: number }[],
): void {
  let total = 0;
  for (const s of shares) {
    if (!Number.isInteger(s.pct) || s.pct < 0 || s.pct > 100) {
      throw new InvalidShareTotal(`invalid share ${s.pct} for ${s.userId}`);
    }
    total += s.pct;
  }
  if (total !== 100) {
    throw new InvalidShareTotal(`shares total ${total}, must be 100`);
  }
}
```

- [ ] **Step 4: Run it, verify it passes**

Run: `make test 2>&1 | grep -A3 "validateShares"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/tenancy/src/domain/ownership-shares.ts packages/tenancy/test/ownership-shares.test.ts
git commit -m "feat(tenancy): validateShares domain rule (Σ=100, integer 0..100)"
```

---

## Task 3: Repo — read member agg prefs + list shares

**Files:**

- Modify: `packages/tenancy/src/ports/budget-repo.ts` (extend interface)
- Modify: `packages/tenancy/src/adapters/persistence/workspace-repo.ts` (implement)
- Test: `packages/tenancy/test/workspace-repo-agg-prefs.test.ts`

**Interfaces:**

- Consumes: existing `withUserContext`, `withTenantTx` helpers in workspace-repo.ts.
- Produces on `BudgetRepo`:
  - `getAggPrefsForUser(userId: string): Promise<Map<string, { ownership_share_pct: number; include_in_aggregation: boolean }>>` (keyed by budgetId; one user-scoped query).
  - `listMemberShares(budgetId: string): Promise<{ userId: string; pct: number }[]>` (all members of a budget).

- [ ] **Step 1: Write the failing integration test**

```ts
import { describe, it, expect } from "bun:test";
import { createTestBudgetWithOwner } from "./helpers"; // reuse existing test helper for a budget+owner
import { DrizzleBudgetRepo } from "../src/adapters/persistence/workspace-repo";

describe("workspace-repo agg prefs", () => {
  it("getAggPrefsForUser returns owner's default share 100 + included true", async () => {
    const { budgetId, ownerUserId } = await createTestBudgetWithOwner();
    const repo = new DrizzleBudgetRepo();
    const prefs = await repo.getAggPrefsForUser(ownerUserId);
    expect(prefs.get(budgetId)).toEqual({
      ownership_share_pct: 100,
      include_in_aggregation: true,
    });
  });

  it("listMemberShares returns the owner at 100", async () => {
    const { budgetId, ownerUserId } = await createTestBudgetWithOwner();
    const repo = new DrizzleBudgetRepo();
    const shares = await repo.listMemberShares(budgetId);
    expect(shares).toContainEqual({ userId: ownerUserId, pct: 100 });
  });
});
```

(Match the exact constructor + test helper names already used by sibling tests in `packages/tenancy/test/`. If `createTestBudgetWithOwner` doesn't exist, use the same seeding path the existing workspace-repo tests use.)

- [ ] **Step 2: Run it, verify it fails**

Run: `make test 2>&1 | grep -A3 "agg prefs"`
Expected: FAIL (methods undefined). Note: Task 1 sets the owner share to 100 via backfill; new budgets in Task 6 will set it explicitly — for this test, seed the owner row's share to 100 in the helper if the create path doesn't yet.

- [ ] **Step 3: Extend the port** (`budget-repo.ts`)

```ts
  getAggPrefsForUser(userId: string): Promise<Map<string, { ownership_share_pct: number; include_in_aggregation: boolean }>>;
  listMemberShares(budgetId: string): Promise<{ userId: string; pct: number }[]>;
```

- [ ] **Step 4: Implement in `workspace-repo.ts`** (mirror `listForUser`'s user-scoped query for the first, `withTenantTx` for the second)

```ts
  async getAggPrefsForUser(userId: string) {
    const rows = await withUserContext(UserId(userId), async (tx) =>
      tx.execute<{ budget_id: string; ownership_share_pct: number; include_in_aggregation: boolean }>(sql`
        SELECT budget_id, ownership_share_pct, include_in_aggregation
          FROM tenancy.budget_members
         WHERE user_id = ${userId}::uuid`),
    );
    const map = new Map<string, { ownership_share_pct: number; include_in_aggregation: boolean }>();
    for (const r of rows.rows) {
      map.set(r.budget_id, {
        ownership_share_pct: Number(r.ownership_share_pct),
        include_in_aggregation: r.include_in_aggregation,
      });
    }
    return map;
  }

  async listMemberShares(budgetId: string) {
    const rows = await withTenantTx(budgetId, async (tx) =>
      tx.execute<{ user_id: string; ownership_share_pct: number }>(sql`
        SELECT user_id, ownership_share_pct
          FROM tenancy.budget_members
         WHERE budget_id = ${budgetId}::uuid`),
    );
    return rows.rows.map((r) => ({ userId: r.user_id, pct: Number(r.ownership_share_pct) }));
  }
```

(Use whichever of `withUserContext`/`withTenantTx`/`withTenantTxRead` the neighboring methods use; match imports.)

- [ ] **Step 5: Run it, verify it passes**

Run: `make test 2>&1 | grep -A3 "agg prefs"`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/tenancy/src/ports/budget-repo.ts packages/tenancy/src/adapters/persistence/workspace-repo.ts packages/tenancy/test/workspace-repo-agg-prefs.test.ts
git commit -m "feat(tenancy): repo reads for member agg prefs + share list"
```

---

## Task 4: Repo — write share (owner batch) + include (self)

**Files:**

- Modify: `packages/tenancy/src/ports/budget-repo.ts`
- Modify: `packages/tenancy/src/adapters/persistence/workspace-repo.ts`
- Test: `packages/tenancy/test/workspace-repo-agg-writes.test.ts`

**Interfaces:**

- Produces:
  - `setMemberShares(budgetId: string, shares: { userId: string; pct: number }[]): Promise<void>` (batch UPDATE in one tx; caller pre-validates with `validateShares`).
  - `setMemberAggregation(budgetId: string, userId: string, included: boolean): Promise<void>` (single row).

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "bun:test";
import { createSharedBudgetWithTwoMembers } from "./helpers";
import { DrizzleBudgetRepo } from "../src/adapters/persistence/workspace-repo";

describe("workspace-repo agg writes", () => {
  it("setMemberShares persists a 60/40 split", async () => {
    const { budgetId, ownerUserId, memberUserId } =
      await createSharedBudgetWithTwoMembers();
    const repo = new DrizzleBudgetRepo();
    await repo.setMemberShares(budgetId, [
      { userId: ownerUserId, pct: 60 },
      { userId: memberUserId, pct: 40 },
    ]);
    const shares = await repo.listMemberShares(budgetId);
    expect(shares).toContainEqual({ userId: ownerUserId, pct: 60 });
    expect(shares).toContainEqual({ userId: memberUserId, pct: 40 });
  });

  it("setMemberAggregation flips only the caller's row", async () => {
    const { budgetId, ownerUserId, memberUserId } =
      await createSharedBudgetWithTwoMembers();
    const repo = new DrizzleBudgetRepo();
    await repo.setMemberAggregation(budgetId, memberUserId, false);
    const prefs = await repo.getAggPrefsForUser(memberUserId);
    expect(prefs.get(budgetId)?.include_in_aggregation).toBe(false);
    const ownerPrefs = await repo.getAggPrefsForUser(ownerUserId);
    expect(ownerPrefs.get(budgetId)?.include_in_aggregation).toBe(true);
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `make test 2>&1 | grep -A3 "agg writes"`
Expected: FAIL.

- [ ] **Step 3: Extend the port**

```ts
  setMemberShares(budgetId: string, shares: { userId: string; pct: number }[]): Promise<void>;
  setMemberAggregation(budgetId: string, userId: string, included: boolean): Promise<void>;
```

- [ ] **Step 4: Implement** (mirror `setMemberRole`'s `withTenantTx` write)

```ts
  async setMemberShares(budgetId: string, shares: { userId: string; pct: number }[]) {
    await withTenantTx(budgetId, async (tx) => {
      for (const s of shares) {
        await tx.execute(sql`
          UPDATE tenancy.budget_members SET ownership_share_pct = ${s.pct}
           WHERE budget_id = ${budgetId}::uuid AND user_id = ${s.userId}::uuid`);
      }
    });
  }

  async setMemberAggregation(budgetId: string, userId: string, included: boolean) {
    await withTenantTx(budgetId, async (tx) => {
      await tx.execute(sql`
        UPDATE tenancy.budget_members SET include_in_aggregation = ${included}
         WHERE budget_id = ${budgetId}::uuid AND user_id = ${userId}::uuid`);
    });
  }
```

- [ ] **Step 5: Run it, verify it passes**

Run: `make test 2>&1 | grep -A3 "agg writes"`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/tenancy/src/ports/budget-repo.ts packages/tenancy/src/adapters/persistence/workspace-repo.ts packages/tenancy/test/workspace-repo-agg-writes.test.ts
git commit -m "feat(tenancy): setMemberShares (owner batch) + setMemberAggregation (self)"
```

---

## Task 5: Churn — create sets owner 100, invite 0, removal folds to owner

**Files:**

- Modify: `packages/tenancy/src/adapters/persistence/workspace-repo.ts` (create, accept-invite, remove-member paths)
- Test: `packages/tenancy/test/workspace-repo-share-churn.test.ts`

**Interfaces:**

- Consumes: existing budget-create, invite-accept, and remove-member repo methods (locate by grepping for the current membership insert/delete SQL).

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "bun:test";
import { DrizzleBudgetRepo } from "../src/adapters/persistence/workspace-repo";
import {
  createTestBudgetWithOwner,
  addMemberViaAccept,
  removeMember,
} from "./helpers";

describe("ownership-share churn", () => {
  it("a newly created budget's owner has 100%", async () => {
    const { budgetId, ownerUserId } = await createTestBudgetWithOwner();
    const shares = await new DrizzleBudgetRepo().listMemberShares(budgetId);
    expect(shares).toEqual([{ userId: ownerUserId, pct: 100 }]);
  });

  it("an accepted invite joins at 0%; the owner stays 100%", async () => {
    const { budgetId, ownerUserId } = await createTestBudgetWithOwner();
    const memberUserId = await addMemberViaAccept(budgetId);
    const shares = await new DrizzleBudgetRepo().listMemberShares(budgetId);
    expect(shares).toContainEqual({ userId: ownerUserId, pct: 100 });
    expect(shares).toContainEqual({ userId: memberUserId, pct: 0 });
  });

  it("removing a member folds their share into the owner", async () => {
    const { budgetId, ownerUserId } = await createTestBudgetWithOwner();
    const memberUserId = await addMemberViaAccept(budgetId);
    const repo = new DrizzleBudgetRepo();
    await repo.setMemberShares(budgetId, [
      { userId: ownerUserId, pct: 70 },
      { userId: memberUserId, pct: 30 },
    ]);
    await removeMember(budgetId, memberUserId);
    const shares = await repo.listMemberShares(budgetId);
    expect(shares).toEqual([{ userId: ownerUserId, pct: 100 }]);
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `make test 2>&1 | grep -A3 "ownership-share churn"`
Expected: FAIL (owner-create defaults to 0 from the column; removal doesn't fold).

- [ ] **Step 3: Edit the create path** — when inserting the owner's `budget_members` row on budget creation, set `ownership_share_pct = 100` (add the column to that INSERT). Invited members already default to 0 (column default) — leave their INSERT unchanged.

- [ ] **Step 4: Edit the remove-member path** — before/within the DELETE transaction, add the removed member's share to the owner:

```ts
// inside withTenantTx, before deleting the member row:
await tx.execute(sql`
  UPDATE tenancy.budget_members o
     SET ownership_share_pct = o.ownership_share_pct +
         COALESCE((SELECT m.ownership_share_pct FROM tenancy.budget_members m
                    WHERE m.budget_id = ${budgetId}::uuid AND m.user_id = ${removedUserId}::uuid), 0)
   WHERE o.budget_id = ${budgetId}::uuid AND o.role = 'owner'`);
// then the existing DELETE of the removed member row runs.
```

- [ ] **Step 5: Run it, verify it passes**

Run: `make test 2>&1 | grep -A3 "ownership-share churn"`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/tenancy/src/adapters/persistence/workspace-repo.ts packages/tenancy/test/workspace-repo-share-churn.test.ts
git commit -m "feat(tenancy): share churn — owner 100 on create, invite 0, removal folds to owner"
```

---

## Task 6: Aggregate service `getAllBudgetsAggregate`

**Files:**

- Create: `packages/budgeting/src/application/get-all-budgets-aggregate.ts`
- Test: `packages/budgeting/test/get-all-budgets-aggregate.test.ts`

**Interfaces:**

- Consumes: a composed `getOverviewCardsForTenant: (input: { tenantId: string; budgetId: string }) => Promise<Result<OverviewCards, Error>>` (Task via boot); `FxProvider.rateAsOf`; `sumWalletsToCurrency` pattern in `compute-budget-wealth-now.ts:87` for the Money×rate hop.
- Produces:

```ts
export interface AggregateBudgetRow {
  id: string;
  name: string;
  default_currency: string;
  member_count: number;
  my_share_pct: number;
  net_worth_cents: string;
  investments_cents: string;
  cash_cents: string;
  reserves_cents: string;
  cushion_cents: string;
  spent_month_cents: string;
  left_month_cents: string;
  overspent_total_cents: string;
  overspent_count: number;
  cushion_breached: boolean;
  reserves_status: "ok" | "short" | "surplus";
  pending_tasks: number;
  health: "red" | "amber" | "green";
  included: boolean;
  fx_unavailable: boolean;
}
export interface AllBudgetsAggregate {
  display_currency: string;
  budgets: AggregateBudgetRow[];
}
export function getAllBudgetsAggregate(
  deps: GetAllBudgetsAggregateDeps,
): (userId: string) => Promise<AllBudgetsAggregate>;
```

- [ ] **Step 1: Write the failing test** (stub the deps; assert scaling, no-share-scaling on flow, FX-miss)

```ts
import { describe, it, expect } from "bun:test";
import { ok, err } from "@budget/shared-kernel/result"; // match the Result import used in budgeting
import { getAllBudgetsAggregate } from "../src/application/get-all-budgets-aggregate";

const cards = (over: Partial<any> = {}) => ({
  default_currency: "EUR",
  available_to_spend_cents: 100000n,
  capitalization_cents: 1000000n,
  investment_value_cents: 400000n,
  available_reserves_cents: 200000n,
  spendings: {
    spent_cents: 50000n,
    left_cents: 60000n,
    wallet_cents: 100000n,
    good: true,
  },
  reserves: {
    required_cents: 0n,
    wallet_cents: 200000n,
    status: "ok" as const,
  },
  cushion: {
    enabled: true,
    real_months: 6,
    total_cents: 300000n,
    required_cents: 300000n,
    covered: true,
  },
  overspent: { count: 0, currency: "EUR", total_cents: 0n, top: [] },
  retirement_months: null,
  retirement_inflation_pct: 4.5,
  ...over,
});

const deps = {
  listForUser: async () => [
    {
      id: "b1",
      name: "Home",
      default_currency: "EUR",
      member_count: 2,
      pendingTasksCount: 3,
    },
  ],
  getOverviewCardsForTenant: async () => ok(cards()),
  getAggPrefsForUser: async () =>
    new Map([
      ["b1", { ownership_share_pct: 60, include_in_aggregation: true }],
    ]),
  displayCurrencyReader: { getDisplayCurrency: async () => "USD" },
  fxProvider: {
    rateAsOf: async () => ({ rate: "1.10", provider: "test", isStale: false }),
  },
  now: () => new Date("2026-07-17T00:00:00Z"),
};

describe("getAllBudgetsAggregate", () => {
  it("FX-converts to display ccy and scales WEALTH by share, not flow", async () => {
    const out = await getAllBudgetsAggregate(deps as any)("u1");
    expect(out.display_currency).toBe("USD");
    const row = out.budgets[0]!;
    // net worth: 1_000_000 EUR × 1.10 × 0.60 = 660_000
    expect(row.net_worth_cents).toBe("660000");
    // spent: 50_000 × 1.10, NO share = 55_000
    expect(row.spent_month_cents).toBe("55000");
    expect(row.my_share_pct).toBe(60);
    expect(row.health).toBe("green");
  });

  it("flags fx_unavailable and does not throw when a rate is missing", async () => {
    const bad = {
      ...deps,
      fxProvider: {
        rateAsOf: async () => {
          throw new Error("NoFxRateAvailable");
        },
      },
    };
    const out = await getAllBudgetsAggregate(bad as any)("u1");
    expect(out.budgets[0]!.fx_unavailable).toBe(true);
  });

  it("derives red health when overspent", async () => {
    const red = {
      ...deps,
      getOverviewCardsForTenant: async () =>
        ok(
          cards({
            overspent: {
              count: 2,
              currency: "EUR",
              total_cents: 5000n,
              top: [],
            },
          }),
        ),
    };
    const out = await getAllBudgetsAggregate(red as any)("u1");
    expect(out.budgets[0]!.health).toBe("red");
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `make test 2>&1 | grep -A3 "getAllBudgetsAggregate"`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement** (`get-all-budgets-aggregate.ts`)

```ts
import { Money } from "@budget/shared-kernel/money"; // match the Money import used in compute-budget-wealth-now.ts
import type { FxProvider } from "@budget/shared-kernel/ports/fx-provider";
import type { OverviewCards } from "./get-overview-cards";
import type { Result } from "@budget/shared-kernel/result";

export interface AggregateBudgetRow {
  /* …as in Interfaces… */
}
export interface AllBudgetsAggregate {
  display_currency: string;
  budgets: AggregateBudgetRow[];
}

export interface GetAllBudgetsAggregateDeps {
  listForUser: (
    userId: string,
  ) => Promise<
    Array<{
      id: string;
      name: string;
      default_currency: string;
      member_count: number;
      pendingTasksCount: number;
    }>
  >;
  getOverviewCardsForTenant: (input: {
    tenantId: string;
    budgetId: string;
  }) => Promise<Result<OverviewCards, Error>>;
  getAggPrefsForUser: (
    userId: string,
  ) => Promise<
    Map<
      string,
      { ownership_share_pct: number; include_in_aggregation: boolean }
    >
  >;
  displayCurrencyReader: {
    getDisplayCurrency: (userId: string) => Promise<string | null>;
  };
  fxProvider: FxProvider;
  now?: () => Date;
}

const scale = (
  cents: bigint,
  rate: string,
  ccy: string,
  sharePct = 100,
): string => {
  // FX hop then share. Mirror the Money.mul(rate) pattern in compute-budget-wealth-now.ts.
  const converted = Money.fromCents(cents, ccy).mul(rate).toCents(); // banker's rounding
  return ((converted * BigInt(sharePct)) / 100n).toString();
};

export function getAllBudgetsAggregate(deps: GetAllBudgetsAggregateDeps) {
  return async (userId: string): Promise<AllBudgetsAggregate> => {
    const today = (deps.now ? deps.now() : new Date())
      .toISOString()
      .slice(0, 10);
    const [budgets, prefs, displayCcyRaw] = await Promise.all([
      deps.listForUser(userId),
      deps.getAggPrefsForUser(userId),
      deps.displayCurrencyReader.getDisplayCurrency(userId),
    ]);
    const displayCcy = displayCcyRaw ?? budgets[0]?.default_currency ?? "USD";

    const rows = await Promise.all(
      budgets.map(async (b): Promise<AggregateBudgetRow> => {
        const p = prefs.get(b.id) ?? {
          ownership_share_pct: 100,
          include_in_aggregation: true,
        };
        const base = {
          id: b.id,
          name: b.name,
          default_currency: b.default_currency,
          member_count: b.member_count,
          my_share_pct: p.ownership_share_pct,
          included: p.include_in_aggregation,
          pending_tasks: b.pendingTasksCount,
        };
        const cardsRes = await deps.getOverviewCardsForTenant({
          tenantId: b.id,
          budgetId: b.id,
        });
        if (cardsRes.isErr) return zeroRow(base, "green", true);
        const c = cardsRes.value;
        let rate: string;
        try {
          rate = (
            await deps.fxProvider.rateAsOf(
              c.default_currency,
              displayCcy,
              today,
            )
          ).rate;
        } catch {
          return zeroRow(base, deriveHealth(c), true);
        }
        const s = p.ownership_share_pct;
        return {
          ...base,
          net_worth_cents: scale(
            c.capitalization_cents,
            rate,
            c.default_currency,
            s,
          ),
          investments_cents: scale(
            c.investment_value_cents,
            rate,
            c.default_currency,
            s,
          ),
          cash_cents: scale(
            c.available_to_spend_cents,
            rate,
            c.default_currency,
            s,
          ),
          reserves_cents: scale(
            c.available_reserves_cents,
            rate,
            c.default_currency,
            s,
          ),
          cushion_cents: scale(
            c.cushion.total_cents,
            rate,
            c.default_currency,
            s,
          ),
          spent_month_cents: scale(
            c.spendings.spent_cents,
            rate,
            c.default_currency,
          ),
          left_month_cents: scale(
            c.spendings.left_cents,
            rate,
            c.default_currency,
          ),
          overspent_total_cents: scale(
            c.overspent.total_cents,
            rate,
            c.default_currency,
          ),
          overspent_count: c.overspent.count,
          cushion_breached: c.cushion.enabled && !c.cushion.covered,
          reserves_status: c.reserves.status,
          health: deriveHealth(c),
          fx_unavailable: false,
        };
      }),
    );
    return { display_currency: displayCcy, budgets: rows };
  };
}

function deriveHealth(c: OverviewCards): "red" | "amber" | "green" {
  if (c.overspent.count > 0 || (c.cushion.enabled && !c.cushion.covered))
    return "red";
  if (c.reserves.status === "short") return "amber";
  return "green";
}

function zeroRow(
  base: any,
  health: "red" | "amber" | "green",
  fxUnavailable: boolean,
): AggregateBudgetRow {
  return {
    ...base,
    net_worth_cents: "0",
    investments_cents: "0",
    cash_cents: "0",
    reserves_cents: "0",
    cushion_cents: "0",
    spent_month_cents: "0",
    left_month_cents: "0",
    overspent_total_cents: "0",
    overspent_count: 0,
    cushion_breached: false,
    reserves_status: "ok",
    health,
    fx_unavailable: fxUnavailable,
  };
}
```

(Match the actual `Money` API — if `fromCents`/`mul`/`toCents` differ, use the exact methods `compute-budget-wealth-now.ts` uses. Match the `Result` shape's `isErr`/`.value` accessors used elsewhere in budgeting.)

- [ ] **Step 4: Run it, verify it passes**

Run: `make test 2>&1 | grep -A3 "getAllBudgetsAggregate"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/budgeting/src/application/get-all-budgets-aggregate.ts packages/budgeting/test/get-all-budgets-aggregate.test.ts
git commit -m "feat(budgeting): getAllBudgetsAggregate — FX + share-scaled per-budget rows"
```

---

## Task 7: Compose services in boot + mount aggregate router

**Files:**

- Modify: `apps/api/src/boot.ts` (compose `getAllBudgetsAggregate`; expose `getOverviewCardsForTenant`)
- Create: `apps/api/src/routes/budgets-aggregate.ts` (`GET /budgets/aggregate`)
- Modify: `apps/api/src/app.ts` (mount BEFORE `/budgets/:id`)
- Test: `apps/api/test/routes/budgets-aggregate.test.ts`

**Interfaces:**

- Consumes: `getAllBudgetsAggregate` (Task 6); the composed `getOverviewCards` callable already in boot; `workspaceRepo.getAggPrefsForUser`, `workspaceRepo.listForUser`; `displayCurrencyReader`; `baseBudgeting.fxProvider`.
- Produces: `GET /budgets/aggregate` → `AllBudgetsAggregate` JSON. `deps.budgeting.getAllBudgetsAggregate`.

- [ ] **Step 1: Write the failing route test** (fresh user, two budgets; assert shape + display currency)

```ts
import { describe, it, expect } from "bun:test";
import { makeTestApp, signUpAndTwoBudgets } from "../helpers"; // reuse existing route-test harness

describe("GET /budgets/aggregate", () => {
  it("returns per-budget rows in the user's display currency", async () => {
    const { app, cookie } = await signUpAndTwoBudgets(); // creates 2 budgets for one user
    const res = await app.request("/budgets/aggregate", {
      headers: { cookie },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(typeof body.display_currency).toBe("string");
    expect(Array.isArray(body.budgets)).toBe(true);
    expect(body.budgets.length).toBe(2);
    expect(typeof body.budgets[0].net_worth_cents).toBe("string"); // string cents on the wire
    expect(body.budgets[0]).toHaveProperty("my_share_pct");
    expect(body.budgets[0]).toHaveProperty("included");
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `make test 2>&1 | grep -A3 "GET /budgets/aggregate"`
Expected: FAIL (404 — route missing).

- [ ] **Step 3: Compose in `boot.ts`** (near the `homeSummaryService` block ~line 215)

```ts
const getOverviewCardsForTenant = baseBudgeting.getOverviewCards; // the already-composed ({tenantId,budgetId})=>Result callable
const getAllBudgetsAggregateService = getAllBudgetsAggregate({
  listForUser: (userId) => tenancy.workspaceRepo.listForUser(userId),
  getOverviewCardsForTenant,
  getAggPrefsForUser: (userId) =>
    tenancy.workspaceRepo.getAggPrefsForUser(userId),
  displayCurrencyReader,
  fxProvider: baseBudgeting.fxProvider,
});
```

Add `getAllBudgetsAggregate: getAllBudgetsAggregateService` to the `budgeting` deps object handed to the routes (match how `homeSummaryService` is exposed on `deps.budgeting`).

- [ ] **Step 4: Create the route** (`budgets-aggregate.ts`)

```ts
import { Hono } from "hono";
import type { AppDeps } from "../deps"; // match existing route deps type

export function budgetsAggregateRoutes(deps: AppDeps) {
  const r = new Hono();
  r.get("/aggregate", async (c) => {
    const userId = c.get("userId"); // match existing auth-context accessor
    if (!userId) return c.json({ error: "unauthorized" }, 401);
    const out = await deps.budgeting.getAllBudgetsAggregate(userId);
    return c.json(out);
  });
  return r;
}
```

- [ ] **Step 5: Mount BEFORE `/budgets/:id`** (`app.ts`) — the aggregate router must be registered on `/budgets` ahead of the `:id` param route so `/budgets/aggregate` isn't captured as `:id`:

```ts
app.route("/budgets", budgetsAggregateRoutes(deps)); // BEFORE the main budgets router that owns /:id
app.route("/budgets", budgetsRoutes(deps));
```

- [ ] **Step 6: Run it, verify it passes**

Run: `make test 2>&1 | grep -A3 "GET /budgets/aggregate"`
Expected: PASS.

- [ ] **Step 7: Rebuild api + commit**

```bash
docker compose build api && infisical run --env=dev -- make restart-api
git add apps/api/src/boot.ts apps/api/src/routes/budgets-aggregate.ts apps/api/src/app.ts apps/api/test/routes/budgets-aggregate.test.ts
git commit -m "feat(api): GET /budgets/aggregate (mounted before /budgets/:id)"
```

---

## Task 8: `PUT /budgets/:id/aggregation` (self) + `PUT /budgets/:id/members/shares` (owner)

**Files:**

- Create: `apps/api/src/routes/budget-members.ts`
- Modify: `apps/api/src/app.ts` (mount on `/budgets`)
- Modify: `apps/api/src/boot.ts` (expose `workspaceRepo.setMemberAggregation`, `setMemberShares`, `listMembers`)
- Test: `apps/api/test/routes/budget-members-agg.test.ts`

**Interfaces:**

- Consumes: `workspaceRepo.setMemberAggregation`, `setMemberShares`, `listMembers` (owner gate), `validateShares` (Task 2).
- Produces: `PUT /budgets/:id/aggregation` `{ included: boolean }`; `PUT /budgets/:id/members/shares` `{ shares: [{ userId, pct }] }`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "bun:test";
import { signUpAndBudget, addSecondMember } from "../helpers";

describe("member aggregation writes", () => {
  it("PUT /budgets/:id/aggregation flips the caller's include flag (self, no owner gate)", async () => {
    const { app, cookie, budgetId } = await signUpAndBudget();
    const res = await app.request(`/budgets/${budgetId}/aggregation`, {
      method: "PUT",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ included: false }),
    });
    expect(res.status).toBe(200);
    const agg = await (
      await app.request("/budgets/aggregate", { headers: { cookie } })
    ).json();
    expect(agg.budgets.find((b: any) => b.id === budgetId).included).toBe(
      false,
    );
  });

  it("PUT /budgets/:id/members/shares rejects a non-owner and a Σ≠100", async () => {
    const {
      app,
      ownerCookie,
      memberCookie,
      budgetId,
      ownerUserId,
      memberUserId,
    } = await addSecondMember();
    // non-owner blocked
    const forbidden = await app.request(`/budgets/${budgetId}/members/shares`, {
      method: "PUT",
      headers: { cookie: memberCookie, "content-type": "application/json" },
      body: JSON.stringify({
        shares: [
          { userId: ownerUserId, pct: 50 },
          { userId: memberUserId, pct: 50 },
        ],
      }),
    });
    expect(forbidden.status).toBe(403);
    // owner, bad total
    const bad = await app.request(`/budgets/${budgetId}/members/shares`, {
      method: "PUT",
      headers: { cookie: ownerCookie, "content-type": "application/json" },
      body: JSON.stringify({
        shares: [
          { userId: ownerUserId, pct: 50 },
          { userId: memberUserId, pct: 60 },
        ],
      }),
    });
    expect(bad.status).toBe(422);
    // owner, good total
    const ok = await app.request(`/budgets/${budgetId}/members/shares`, {
      method: "PUT",
      headers: { cookie: ownerCookie, "content-type": "application/json" },
      body: JSON.stringify({
        shares: [
          { userId: ownerUserId, pct: 40 },
          { userId: memberUserId, pct: 60 },
        ],
      }),
    });
    expect(ok.status).toBe(200);
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `make test 2>&1 | grep -A3 "member aggregation writes"`
Expected: FAIL (routes missing).

- [ ] **Step 3: Implement the route** (`budget-members.ts`)

```ts
import { Hono } from "hono";
import { z } from "zod";
import {
  validateShares,
  InvalidShareTotal,
} from "@budget/tenancy/domain/ownership-shares";
import type { AppDeps } from "../deps";

export function budgetMembersRoutes(deps: AppDeps) {
  const r = new Hono();

  r.put("/:id/aggregation", async (c) => {
    const userId = c.get("userId");
    if (!userId) return c.json({ error: "unauthorized" }, 401);
    const budgetId = c.req.param("id");
    const body = z.object({ included: z.boolean() }).parse(await c.req.json());
    const members = await deps.tenancy.workspaceRepo.listMembers(budgetId);
    if (!members.some((m) => m.userId === userId))
      return c.json({ error: "forbidden" }, 403);
    await deps.tenancy.workspaceRepo.setMemberAggregation(
      budgetId,
      userId,
      body.included,
    );
    return c.json({ ok: true });
  });

  r.put("/:id/members/shares", async (c) => {
    const userId = c.get("userId");
    if (!userId) return c.json({ error: "unauthorized" }, 401);
    const budgetId = c.req.param("id");
    const body = z
      .object({
        shares: z.array(
          z.object({ userId: z.string(), pct: z.number().int() }),
        ),
      })
      .parse(await c.req.json());
    const members = await deps.tenancy.workspaceRepo.listMembers(budgetId);
    const caller = members.find((m) => m.userId === userId);
    if (caller?.role !== "owner") return c.json({ error: "forbidden" }, 403);
    // every member must be present exactly once
    const memberIds = new Set(members.map((m) => m.userId));
    const givenIds = new Set(body.shares.map((s) => s.userId));
    if (
      memberIds.size !== givenIds.size ||
      [...memberIds].some((id) => !givenIds.has(id))
    ) {
      return c.json(
        { error: "shares must cover every member exactly once" },
        422,
      );
    }
    try {
      validateShares(body.shares);
    } catch (e) {
      if (e instanceof InvalidShareTotal)
        return c.json({ error: e.message }, 422);
      throw e;
    }
    await deps.tenancy.workspaceRepo.setMemberShares(budgetId, body.shares);
    return c.json({ ok: true });
  });

  return r;
}
```

- [ ] **Step 4: Mount** (`app.ts`, on `/budgets`, before or after the main router is fine — these paths don't collide with `/:id` bare):

```ts
app.route("/budgets", budgetMembersRoutes(deps));
```

Expose `setMemberAggregation`, `setMemberShares`, `listMembers` on `deps.tenancy.workspaceRepo` if not already.

- [ ] **Step 5: Run it, verify it passes**

Run: `make test 2>&1 | grep -A3 "member aggregation writes"`
Expected: PASS.

- [ ] **Step 6: Rebuild api + commit**

```bash
docker compose build api && infisical run --env=dev -- make restart-api
git add apps/api/src/routes/budget-members.ts apps/api/src/app.ts apps/api/src/boot.ts apps/api/test/routes/budget-members-agg.test.ts
git commit -m "feat(api): self include-flag + owner-gated ownership-share endpoints"
```

---

## Task 9: Combined wealth trend service + endpoint

**Files:**

- Create: `packages/budgeting/src/application/get-aggregate-wealth-trend.ts`
- Test: `packages/budgeting/test/get-aggregate-wealth-trend.test.ts`
- Modify: `apps/api/src/routes/budgets-aggregate.ts` (add `GET /aggregate/wealth`)
- Modify: `apps/api/src/boot.ts` (compose)
- Test: `apps/api/test/routes/budgets-aggregate-wealth.test.ts`

**Interfaces:**

- Consumes: the per-budget `get-overview-wealth` service (returns `{ series: [{ label, value_cents }] }` in budget ccy); `fxProvider.rateAsOf` (today); `getAggPrefsForUser`.
- Produces: `getAggregateWealthTrend({ userId, range, includeIds }) => { display_currency, series: [{ label, value_cents }], grow: { delta_cents, delta_pct } }`.

- [ ] **Step 1: Write the failing test** — two budgets, aligned labels, today's-rate conversion × share, forward-fill:

```ts
import { describe, it, expect } from "bun:test";
import { getAggregateWealthTrend } from "../src/application/get-aggregate-wealth-trend";

const deps = {
  getAggPrefsForUser: async () =>
    new Map([
      ["b1", { ownership_share_pct: 100, include_in_aggregation: true }],
      ["b2", { ownership_share_pct: 50, include_in_aggregation: true }],
    ]),
  listForUser: async () => [
    { id: "b1", default_currency: "USD" },
    { id: "b2", default_currency: "EUR" },
  ],
  getWealthForBudget: async ({ budgetId }: { budgetId: string }) =>
    budgetId === "b1"
      ? {
          currency: "USD",
          series: [
            { label: "Jan", value_cents: 100000n },
            { label: "Feb", value_cents: 120000n },
          ],
        }
      : { currency: "EUR", series: [{ label: "Feb", value_cents: 200000n }] }, // b2 missing Jan → forward-fill 0
  displayCurrencyReader: { getDisplayCurrency: async () => "USD" },
  fxProvider: {
    rateAsOf: async (from: string) => ({
      rate: from === "EUR" ? "1.10" : "1.00",
      provider: "t",
      isStale: false,
    }),
  },
  now: () => new Date("2026-07-17T00:00:00Z"),
};

describe("getAggregateWealthTrend", () => {
  it("sums included budgets per label at today's rate × share, forward-filling gaps", async () => {
    const out = await getAggregateWealthTrend(deps as any)({
      userId: "u1",
      range: "6M",
      includeIds: ["b1", "b2"],
    });
    // Jan: b1 100000 (×1.0) + b2 missing→0 = 100000
    // Feb: b1 120000 + b2 200000×1.10×0.5 = 120000 + 110000 = 230000
    expect(out.series).toEqual([
      { label: "Jan", value_cents: "100000" },
      { label: "Feb", value_cents: "230000" },
    ]);
    expect(out.display_currency).toBe("USD");
  });

  it("excludes budgets not in includeIds", async () => {
    const out = await getAggregateWealthTrend(deps as any)({
      userId: "u1",
      range: "6M",
      includeIds: ["b1"],
    });
    expect(out.series).toEqual([
      { label: "Jan", value_cents: "100000" },
      { label: "Feb", value_cents: "120000" },
    ]);
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `make test 2>&1 | grep -A3 "getAggregateWealthTrend"`
Expected: FAIL.

- [ ] **Step 3: Implement** (`get-aggregate-wealth-trend.ts`) — build the union of labels in first-seen order, forward-fill each budget's last-known value (missing leading buckets = 0), convert at today's rate × share, sum per label. Compute `grow` from first vs last summed point.

```ts
import { Money } from "@budget/shared-kernel/money";
// deps types omitted for brevity — mirror Task 6's dep style.
export function getAggregateWealthTrend(deps: any) {
  return async ({
    userId,
    range,
    includeIds,
  }: {
    userId: string;
    range: string;
    includeIds: string[];
  }) => {
    const today = (deps.now ? deps.now() : new Date())
      .toISOString()
      .slice(0, 10);
    const [budgets, prefs, displayRaw] = await Promise.all([
      deps.listForUser(userId),
      deps.getAggPrefsForUser(userId),
      deps.displayCurrencyReader.getDisplayCurrency(userId),
    ]);
    const displayCcy = displayRaw ?? budgets[0]?.default_currency ?? "USD";
    const included = budgets.filter((b: any) => includeIds.includes(b.id));
    const perBudget = await Promise.all(
      included.map(async (b: any) => {
        const w = await deps.getWealthForBudget({
          tenantId: b.id,
          budgetId: b.id,
          range,
        });
        const rate = (
          await deps.fxProvider.rateAsOf(w.currency, displayCcy, today)
        ).rate;
        const share = BigInt(prefs.get(b.id)?.ownership_share_pct ?? 100);
        const byLabel = new Map<string, bigint>();
        for (const pt of w.series) {
          const conv =
            (Money.fromCents(pt.value_cents, w.currency).mul(rate).toCents() *
              share) /
            100n;
          byLabel.set(pt.label, conv);
        }
        return byLabel;
      }),
    );
    // union of labels, first-seen order
    const labels: string[] = [];
    for (const m of perBudget)
      for (const l of m.keys()) if (!labels.includes(l)) labels.push(l);
    const series = labels.map((label) => {
      let sum = 0n;
      for (const m of perBudget) {
        // forward-fill: last value at or before this label; 0 if none yet
        let v = 0n;
        for (const l of labels) {
          if (m.has(l)) v = m.get(l)!;
          if (l === label) break;
        }
        sum += v;
      }
      return { label, value_cents: sum.toString() };
    });
    const first = series.length ? BigInt(series[0]!.value_cents) : 0n;
    const last = series.length
      ? BigInt(series[series.length - 1]!.value_cents)
      : 0n;
    const delta = last - first;
    const grow = {
      delta_cents: delta.toString(),
      delta_pct: first === 0n ? 0 : Number((delta * 10000n) / first) / 100,
    };
    return { display_currency: displayCcy, series, grow };
  };
}
```

- [ ] **Step 4: Run it, verify it passes**

Run: `make test 2>&1 | grep -A3 "getAggregateWealthTrend"`
Expected: PASS.

- [ ] **Step 5: Add the endpoint** (`budgets-aggregate.ts`)

```ts
r.get("/aggregate/wealth", async (c) => {
  const userId = c.get("userId");
  if (!userId) return c.json({ error: "unauthorized" }, 401);
  const range = c.req.query("range") ?? "6M";
  const include = (c.req.query("include") ?? "").split(",").filter(Boolean);
  const out = await deps.budgeting.getAggregateWealthTrend({
    userId,
    range,
    includeIds: include,
  });
  return c.json(out);
});
```

Compose `getAggregateWealthTrend` in boot (feed `getWealthForBudget` from the existing overview-wealth service, `getAggPrefsForUser`, `listForUser`, `displayCurrencyReader`, `fxProvider`).

- [ ] **Step 6: Write the route test, run, verify** (`budgets-aggregate-wealth.test.ts`): two budgets → `GET /budgets/aggregate/wealth?range=6M&include=<id1>,<id2>` returns `{ display_currency, series, grow }`, series values are string cents. Run `make test 2>&1 | grep -A3 "aggregate/wealth"` → PASS.

- [ ] **Step 7: Rebuild api + commit**

```bash
docker compose build api && infisical run --env=dev -- make restart-api
git add packages/budgeting/src/application/get-aggregate-wealth-trend.ts packages/budgeting/test/get-aggregate-wealth-trend.test.ts apps/api/src/routes/budgets-aggregate.ts apps/api/src/boot.ts apps/api/test/routes/budgets-aggregate-wealth.test.ts
git commit -m "feat(api): combined net-worth trend (GET /budgets/aggregate/wealth)"
```

---

## Task 10: i18n strings

**Files:**

- Modify: `apps/web/messages/en.json`, `pl.json`, `uk.json`
- Test: `apps/web/test/i18n-aggregate-keys.test.ts`

**Interfaces:**

- Produces namespace `aggregate.*` (page) and `budget.aggregation.*` (settings toggle) + `budget.ownership.*` (shares editor), present in all three locales.

- [ ] **Step 1: Write the failing test** (parity across locales)

```ts
import { describe, it, expect } from "vitest";
import en from "../messages/en.json";
import pl from "../messages/pl.json";
import uk from "../messages/uk.json";

const KEYS = [
  "aggregate.title",
  "aggregate.hero_label",
  "aggregate.investments",
  "aggregate.cash",
  "aggregate.reserves",
  "aggregate.composition_title",
  "aggregate.trend_title",
  "aggregate.attention_title",
  "aggregate.flow_title",
  "aggregate.spent",
  "aggregate.left",
  "aggregate.my_share",
  "aggregate.rate_unavailable",
  "aggregate.empty",
  "budget.aggregation.feature_label",
  "budget.aggregation.feature_help_text",
  "budget.aggregation.feature_on_toast",
  "budget.aggregation.feature_off_toast",
  "budget.aggregation.error_save",
  "budget.ownership.title",
  "budget.ownership.help_text",
  "budget.ownership.total_label",
  "budget.ownership.must_be_100",
  "budget.ownership.save",
  "budget.ownership.saved_toast",
  "budget.ownership.error_save",
];
const get = (o: any, path: string) =>
  path.split(".").reduce((a, k) => a?.[k], o);

describe("aggregate i18n keys", () => {
  for (const k of KEYS) {
    it(`present in en/pl/uk: ${k}`, () => {
      expect(get(en, k), `en ${k}`).toBeTruthy();
      expect(get(pl, k), `pl ${k}`).toBeTruthy();
      expect(get(uk, k), `uk ${k}`).toBeTruthy();
    });
  }
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `cd apps/web && bunx vitest run test/i18n-aggregate-keys.test.ts`
Expected: FAIL.

- [ ] **Step 3: Add the keys** to all three files (EN below; translate for PL/UK). Numbers use `{amount}` placeholders where a figure is embedded.

```jsonc
// en.json — under "aggregate"
"aggregate": {
  "title": "All budgets", "hero_label": "Total net worth",
  "investments": "Investments", "cash": "Cash", "reserves": "Reserves",
  "composition_title": "Where your wealth is", "trend_title": "Net worth over time",
  "attention_title": "Needs attention", "flow_title": "This month",
  "spent": "Spent", "left": "Left", "my_share": "your {pct}%",
  "rate_unavailable": "Exchange rate unavailable — excluded from totals",
  "empty": "No budgets included. Enable one in its settings."
},
// under "budget"
"aggregation": {
  "feature_label": "Include in all-budgets total",
  "feature_help_text": "Count this budget toward your combined net worth.",
  "feature_on_toast": "Included in your total", "feature_off_toast": "Excluded from your total",
  "error_save": "Couldn't save. Try again."
},
"ownership": {
  "title": "Ownership split", "help_text": "Set each member's share of this budget's wealth. Must total 100%.",
  "total_label": "Total", "must_be_100": "Shares must total 100%.",
  "save": "Save shares", "saved_toast": "Ownership shares saved", "error_save": "Couldn't save shares."
}
```

- [ ] **Step 4: Run it, verify it passes**

Run: `cd apps/web && bunx vitest run test/i18n-aggregate-keys.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/messages/en.json apps/web/messages/pl.json apps/web/messages/uk.json apps/web/test/i18n-aggregate-keys.test.ts
git commit -m "i18n(aggregate): en/pl/uk keys for aggregate page + settings"
```

---

## Task 11: Settings — self include-in-aggregation toggle (hidden < 2 budgets)

**Files:**

- Create: `apps/web/src/components/settings/aggregation-section.tsx`
- Modify: `apps/web/src/components/settings/settings-accordion.tsx` (render gated by ≥2 budgets)
- Test: `apps/web/test/components/settings/aggregation-section.test.tsx`

**Interfaces:**

- Consumes: `useActiveBudgets()` (count), `api.budgets[":id"].aggregation.$put` (or `clientApiWrite` to `PUT /budgets/:id/aggregation`).
- Produces: `<AggregationSection budgetId includeInAggregation />`.

- [ ] **Step 1: Write the failing test** (renders switch reflecting the prop; hidden logic tested via the accordion in Step 6 — here just the section)

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { AggregationSection } from "@/components/settings/aggregation-section";

vi.mock("next-intl", () => ({ useTranslations: () => (k: string) => k }));
vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));
vi.mock("@/lib/api-client", () => ({
  api: {
    budgets: {
      ":id": { aggregation: { $put: vi.fn().mockResolvedValue({ ok: true }) } },
    },
  },
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

describe("AggregationSection", () => {
  it("renders the toggle reflecting includeInAggregation", () => {
    render(<AggregationSection budgetId="b1" includeInAggregation={true} />);
    const sw = screen.getByTestId("settings-aggregation-toggle");
    expect(sw.getAttribute("aria-checked")).toBe("true");
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `cd apps/web && bunx vitest run test/components/settings/aggregation-section.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement** (`aggregation-section.tsx` — clone `reserves-section.tsx`, self-write, invalidate the aggregate query)

```tsx
"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { Switch } from "@/components/ui/switch";
import { api } from "@/lib/api-client";

export function AggregationSection({
  budgetId,
  includeInAggregation,
}: {
  budgetId: string;
  includeInAggregation: boolean;
}) {
  const t = useTranslations("budget.aggregation");
  const qc = useQueryClient();
  const [enabled, setEnabled] = useState(includeInAggregation);
  const [saving, setSaving] = useState(false);

  async function onChange(checked: boolean) {
    setEnabled(checked);
    setSaving(true);
    try {
      const res = await api.budgets[":id"].aggregation.$put({
        param: { id: budgetId },
        json: { included: checked },
      });
      if (!res.ok) throw new Error();
      qc.invalidateQueries({ queryKey: ["budgets", "aggregate"] });
      qc.invalidateQueries({ queryKey: ["budget", budgetId, "detail"] });
      toast.success(checked ? t("feature_on_toast") : t("feature_off_toast"));
    } catch {
      setEnabled(!checked);
      toast.error(t("error_save"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0 space-y-1">
        <p className="text-sm font-semibold text-[var(--body)]">
          {t("feature_label")}
        </p>
        <p className="text-sm text-[var(--muted-foreground)]">
          {t("feature_help_text")}
        </p>
      </div>
      <Switch
        checked={enabled}
        onCheckedChange={onChange}
        disabled={saving}
        aria-label={t("feature_label")}
        data-testid="settings-aggregation-toggle"
        className="shrink-0"
      />
    </div>
  );
}
```

- [ ] **Step 4: Gate it in `settings-accordion.tsx`** — render inside the General section only when the user has ≥2 budgets:

```tsx
// near the top of the component:
const budgetCount = useActiveBudgets().data?.length ?? 0;
// inside the General AccordionItem body:
{
  budgetCount >= 2 && (
    <AggregationSection
      budgetId={budgetId}
      includeInAggregation={settings.includeInAggregation ?? true}
    />
  );
}
```

Extend the `SettingsBudget` type + `settings-tab-client.tsx` mapper to carry `includeInAggregation` from `GET /budgets/:id` (add `include_in_aggregation` to that response — read the caller's member row in the GET handler). Add `useActiveBudgets` import.

- [ ] **Step 5: Run the section test, verify it passes**

Run: `cd apps/web && bunx vitest run test/components/settings/aggregation-section.test.tsx`
Expected: PASS.

- [ ] **Step 6: Add a gating test** (`settings-accordion` hides the toggle with 1 budget, shows with 2) — mock `useActiveBudgets` to return length 1 then 2; assert `queryByTestId("settings-aggregation-toggle")` is null then present. Run vitest → PASS.

- [ ] **Step 7: Rebuild web + commit**

```bash
docker compose build web && infisical run --env=dev -- make restart-web
git add apps/web/src/components/settings/aggregation-section.tsx apps/web/src/components/settings/settings-accordion.tsx apps/web/src/components/settings/settings-tab-client.tsx apps/web/test/components/settings/aggregation-section.test.tsx
git commit -m "feat(web): Settings self include-in-aggregation toggle (hidden < 2 budgets)"
```

---

## Task 12: Settings — owner ownership-share editor (shared budgets)

**Files:**

- Create: `apps/web/src/components/settings/ownership-shares-section.tsx`
- Modify: `apps/web/src/components/settings/settings-accordion.tsx` (render in Members, owner-gated, shared only)
- Test: `apps/web/test/components/settings/ownership-shares-section.test.tsx`

**Interfaces:**

- Consumes: members list (`GET /budgets/:id` `members[]` with current `ownership_share_pct`); `PUT /budgets/:id/members/shares`.
- Produces: `<OwnershipSharesSection budgetId members />` where `members: { userId, name, pct }[]`.

- [ ] **Step 1: Write the failing test** (save disabled unless total 100; enabled at 100)

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { OwnershipSharesSection } from "@/components/settings/ownership-shares-section";

vi.mock("next-intl", () => ({ useTranslations: () => (k: string) => k }));
vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));
vi.mock("@/lib/api-client", () => ({
  api: {
    budgets: {
      ":id": {
        members: { shares: { $put: vi.fn().mockResolvedValue({ ok: true }) } },
      },
    },
  },
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const members = [
  { userId: "a", name: "Ann", pct: 60 },
  { userId: "b", name: "Bob", pct: 40 },
];

describe("OwnershipSharesSection", () => {
  it("save is enabled at total 100 and disabled otherwise", () => {
    render(<OwnershipSharesSection budgetId="b1" members={members} />);
    const save = screen.getByTestId("ownership-save") as HTMLButtonElement;
    expect(save.disabled).toBe(false);
    const bob = screen.getByTestId("ownership-input-b") as HTMLInputElement;
    fireEvent.change(bob, { target: { value: "50" } }); // total 110
    expect(
      (screen.getByTestId("ownership-save") as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(screen.getByTestId("ownership-total").textContent).toContain("110");
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `cd apps/web && bunx vitest run test/components/settings/ownership-shares-section.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement** (`ownership-shares-section.tsx`)

```tsx
"use client";
import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";

export function OwnershipSharesSection({
  budgetId,
  members,
}: {
  budgetId: string;
  members: { userId: string; name: string; pct: number }[];
}) {
  const t = useTranslations("budget.ownership");
  const qc = useQueryClient();
  const [pcts, setPcts] = useState<Record<string, number>>(
    Object.fromEntries(members.map((m) => [m.userId, m.pct])),
  );
  const [saving, setSaving] = useState(false);
  const total = useMemo(
    () => Object.values(pcts).reduce((a, b) => a + (b || 0), 0),
    [pcts],
  );
  const valid =
    total === 100 &&
    Object.values(pcts).every((p) => Number.isInteger(p) && p >= 0 && p <= 100);

  async function save() {
    setSaving(true);
    try {
      const res = await api.budgets[":id"].members.shares.$put({
        param: { id: budgetId },
        json: {
          shares: members.map((m) => ({
            userId: m.userId,
            pct: pcts[m.userId] ?? 0,
          })),
        },
      });
      if (!res.ok) throw new Error();
      qc.invalidateQueries({ queryKey: ["budgets", "aggregate"] });
      qc.invalidateQueries({ queryKey: ["budget", budgetId, "detail"] });
      toast.success(t("saved_toast"));
    } catch {
      toast.error(t("error_save"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <p className="text-sm font-semibold text-[var(--body)]">{t("title")}</p>
        <p className="text-sm text-[var(--muted-foreground)]">
          {t("help_text")}
        </p>
      </div>
      {members.map((m) => (
        <div key={m.userId} className="flex items-center justify-between gap-3">
          <span className="text-sm text-[var(--body)] truncate">{m.name}</span>
          <input
            type="number"
            min={0}
            max={100}
            inputMode="numeric"
            data-testid={`ownership-input-${m.userId}`}
            className="num w-20 rounded-[var(--radius-lg)] bg-[var(--surface-elevated-dark)] px-2 py-1 text-right"
            value={pcts[m.userId] ?? 0}
            onChange={(e) =>
              setPcts((p) => ({
                ...p,
                [m.userId]:
                  e.target.value === "" ? 0 : parseInt(e.target.value, 10),
              }))
            }
          />
        </div>
      ))}
      <div className="flex items-center justify-between border-t border-[var(--hairline-dark)] pt-2">
        <span className="text-sm text-[var(--muted-foreground)]">
          {t("total_label")}
        </span>
        <span
          data-testid="ownership-total"
          className={`num ${valid ? "" : "text-[var(--trading-down)]"}`}
        >
          {total}%
        </span>
      </div>
      {!valid && (
        <p className="text-caption text-[var(--trading-down)]">
          {t("must_be_100")}
        </p>
      )}
      <button
        type="button"
        data-testid="ownership-save"
        disabled={!valid || saving}
        onClick={save}
        className="rounded-[var(--radius-md)] bg-[var(--primary)] px-3 py-1.5 text-sm font-semibold text-[var(--on-primary)] disabled:opacity-50"
      >
        {t("save")}
      </button>
    </div>
  );
}
```

- [ ] **Step 4: Render in `settings-accordion.tsx` Members section**, owner-gated + shared-only:

```tsx
{
  memberCount > 1 && (
    <OwnerGate isOwner={isOwner}>
      <OwnershipSharesSection
        budgetId={budgetId}
        members={members.map((m) => ({
          userId: m.userId,
          name: m.name,
          pct: m.ownership_share_pct ?? 0,
        }))}
      />
    </OwnerGate>
  );
}
```

Ensure `GET /budgets/:id` `members[]` carries `ownership_share_pct` (add it to the member projection in the GET handler + `listMembers`).

- [ ] **Step 5: Run it, verify it passes**

Run: `cd apps/web && bunx vitest run test/components/settings/ownership-shares-section.test.tsx`
Expected: PASS.

- [ ] **Step 6: Rebuild web + commit**

```bash
docker compose build web && infisical run --env=dev -- make restart-web
git add apps/web/src/components/settings/ownership-shares-section.tsx apps/web/src/components/settings/settings-accordion.tsx apps/web/test/components/settings/ownership-shares-section.test.tsx
git commit -m "feat(web): owner ownership-share editor (Σ=100, shared budgets)"
```

---

## Task 13: `useBudgetsAggregate` hook + `AggregateOverview` (hero + breakdown + attention + flow)

**Files:**

- Create: `apps/web/src/hooks/use-budgets-aggregate.ts`
- Create: `apps/web/src/components/budgeting/aggregate/aggregate-overview.tsx`
- Test: `apps/web/test/components/budgeting/aggregate/aggregate-overview.test.tsx`

**Interfaces:**

- Consumes: `GET /budgets/aggregate` (via `clientApiFetch`); the `AllBudgetsAggregate` shape (Task 6); `SlotAmount`, `SlotRevealProvider`, `useAnimatedNumber`, `centsToDisplayCompact`.
- Produces: `useBudgetsAggregate()` React Query hook (key `["budgets","aggregate"]`); `<AggregateOverview />`. A client-side `included` toggle re-sums locally + calls `PUT /budgets/:id/aggregation`.

- [ ] **Step 1: Write the failing test** (hero sums included rows; excluding one drops the total)

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { AggregateOverview } from "@/components/budgeting/aggregate/aggregate-overview";

const DATA = {
  display_currency: "USD",
  budgets: [
    {
      id: "b1",
      name: "Home",
      default_currency: "USD",
      member_count: 2,
      my_share_pct: 60,
      net_worth_cents: "660000",
      investments_cents: "240000",
      cash_cents: "60000",
      reserves_cents: "120000",
      cushion_cents: "0",
      spent_month_cents: "30000",
      left_month_cents: "40000",
      overspent_total_cents: "0",
      overspent_count: 0,
      cushion_breached: false,
      reserves_status: "ok",
      pending_tasks: 1,
      health: "green",
      included: true,
      fx_unavailable: false,
    },
    {
      id: "b2",
      name: "Travel",
      default_currency: "EUR",
      member_count: 1,
      my_share_pct: 100,
      net_worth_cents: "340000",
      investments_cents: "0",
      cash_cents: "340000",
      reserves_cents: "0",
      cushion_cents: "0",
      spent_month_cents: "10000",
      left_month_cents: "5000",
      overspent_total_cents: "0",
      overspent_count: 0,
      cushion_breached: false,
      reserves_status: "ok",
      pending_tasks: 0,
      health: "green",
      included: true,
      fx_unavailable: false,
    },
  ],
};

vi.mock("next-intl", () => ({
  useTranslations: () => (k: string, v?: any) =>
    v?.pct ? `your ${v.pct}%` : k,
  useLocale: () => "en",
}));
vi.mock("@/hooks/use-budgets-aggregate", () => ({
  useBudgetsAggregate: () => ({ data: DATA, isPending: false, isError: false }),
  useSetAggregationFlag: () => ({ mutate: vi.fn() }),
}));

describe("AggregateOverview", () => {
  it("hero shows the summed net worth of included budgets; toggling exclude drops it", () => {
    render(<AggregateOverview />);
    // 660000 + 340000 = 1,000,000 cents = $10,000
    const hero = screen.getByTestId("aggregate-hero");
    expect(hero.textContent).toMatch(/10,?000/);
    // exclude Travel → hero = 660000 = $6,600
    act(() => fireEvent.click(screen.getByTestId("aggregate-exclude-b2")));
    expect(screen.getByTestId("aggregate-hero").textContent).toMatch(/6,?600/);
  });

  it("renders a my-share badge when share < 100", () => {
    render(<AggregateOverview />);
    expect(screen.getByTestId("aggregate-share-b1").textContent).toMatch(/60/);
    expect(screen.queryByTestId("aggregate-share-b2")).toBeNull(); // 100% → no badge
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `cd apps/web && bunx vitest run test/components/budgeting/aggregate/aggregate-overview.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement the hook** (`use-budgets-aggregate.ts`)

```ts
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { clientApiFetch } from "@/lib/budget-fetch";
import { clientApiWrite } from "@/lib/offline-write";
import type { AllBudgetsAggregate } from "@/types/aggregate"; // mirror the API shape (or inline the type)

export function useBudgetsAggregate() {
  return useQuery({
    queryKey: ["budgets", "aggregate"],
    queryFn: async (): Promise<AllBudgetsAggregate> => {
      const res = await clientApiFetch("/budgets/aggregate");
      if (!res.ok) throw new Error("aggregate fetch failed");
      return res.json();
    },
  });
}

export function useSetAggregationFlag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      budgetId,
      included,
    }: {
      budgetId: string;
      included: boolean;
    }) =>
      clientApiWrite(`/budgets/${budgetId}/aggregation`, {
        method: "PUT",
        body: JSON.stringify({ included }),
      }),
    onSettled: () =>
      qc.invalidateQueries({ queryKey: ["budgets", "aggregate"] }),
  });
}
```

- [ ] **Step 4: Implement `AggregateOverview`** (hero + breakdown + attention + flow; local `excluded` set for instant re-sum, persisted via the mutation). Reuse `SlotRevealProvider`/`SlotAmount`, the `CARD` token, `useAnimatedNumber`, `centsToDisplayCompact`.

```tsx
"use client";
import { useMemo, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import Link from "next/link";
import {
  useBudgetsAggregate,
  useSetAggregationFlag,
} from "@/hooks/use-budgets-aggregate";
import {
  SlotAmount,
  SlotRevealProvider,
} from "@/components/budgeting/overview/slot-amount";
import { centsToDisplay } from "@/lib/money"; // match the formatter used on the overview

const CARD =
  "rounded-[var(--radius-xl)] bg-[var(--surface-card-dark)] border border-[var(--hairline-dark)] p-4 min-w-0";
const DOT: Record<string, string> = {
  red: "var(--trading-down)",
  amber: "var(--primary)",
  green: "var(--trading-up)",
};

export function AggregateOverview() {
  const t = useTranslations("aggregate");
  const locale = useLocale();
  const { data, isPending, isError } = useBudgetsAggregate();
  const setFlag = useSetAggregationFlag();
  const [excluded, setExcluded] = useState<Set<string>>(new Set());

  const rows = data?.budgets ?? [];
  const serverExcluded = useMemo(
    () => new Set(rows.filter((b) => !b.included).map((b) => b.id)),
    [rows],
  );
  const isExcluded = (id: string) =>
    excluded.has(id) || (serverExcluded.has(id) && !excluded.has(id + ":on"));
  const included = rows.filter(
    (b) => b.included && !excluded.has(b.id) && !b.fx_unavailable,
  );

  const sum = (key: keyof (typeof rows)[number]) =>
    included.reduce((a, b) => a + BigInt(b[key] as string), 0n);
  const ccy = data?.display_currency ?? "USD";
  const fmt = (cents: bigint) => centsToDisplay(cents.toString(), ccy, locale);

  if (isPending)
    return (
      <div
        className="mx-auto max-w-[1280px] p-4"
        data-testid="aggregate-loading"
      />
    );
  if (isError || !data) return null;

  function toggle(b: (typeof rows)[number]) {
    setExcluded((prev) => {
      const n = new Set(prev);
      n.has(b.id) ? n.delete(b.id) : n.add(b.id);
      return n;
    });
    setFlag.mutate({ budgetId: b.id, included: excluded.has(b.id) });
  }

  const netWorth = sum("net_worth_cents");
  const attention = included.filter((b) => b.health !== "green");

  return (
    <SlotRevealProvider>
      <main className="mx-auto max-w-[1280px] space-y-4 p-4">
        {/* HERO */}
        <section className={CARD}>
          <p className="text-caption text-[var(--muted-foreground)]">
            {t("hero_label")}
          </p>
          <p
            data-testid="aggregate-hero"
            className="num text-[var(--num-hero)] text-[length:var(--number-display)] font-bold"
          >
            <SlotAmount value={fmt(netWorth)} />
          </p>
          <div className="mt-2 grid grid-cols-3 gap-2 text-caption">
            <div>
              <span className="text-[var(--muted-foreground)]">
                {t("investments")}
              </span>
              <br />
              <span className="num">
                <SlotAmount value={fmt(sum("investments_cents"))} />
              </span>
            </div>
            <div>
              <span className="text-[var(--muted-foreground)]">
                {t("cash")}
              </span>
              <br />
              <span className="num">
                <SlotAmount value={fmt(sum("cash_cents"))} />
              </span>
            </div>
            <div>
              <span className="text-[var(--muted-foreground)]">
                {t("reserves")}
              </span>
              <br />
              <span className="num">
                <SlotAmount value={fmt(sum("reserves_cents"))} />
              </span>
            </div>
          </div>
        </section>

        {/* PER-BUDGET BREAKDOWN */}
        <section className="space-y-2">
          {rows.map((b) => {
            const off = excluded.has(b.id) || !b.included;
            const shareOfTotal =
              netWorth > 0n
                ? Number((BigInt(b.net_worth_cents) * 10000n) / netWorth) / 100
                : 0;
            return (
              <div
                key={b.id}
                className={`${CARD} flex items-center gap-3 ${off ? "opacity-50" : ""}`}
              >
                <span
                  className="size-2 rounded-full shrink-0"
                  style={{ background: DOT[b.health] }}
                />
                <Link
                  href={`/${locale}/budgets/${b.id}/overview`}
                  className="min-w-0 flex-1"
                >
                  <p className="truncate text-sm font-semibold text-[var(--body)]">
                    {b.name}
                  </p>
                  {b.fx_unavailable && (
                    <p className="text-caption text-[var(--trading-down)]">
                      {t("rate_unavailable")}
                    </p>
                  )}
                </Link>
                {b.my_share_pct < 100 && (
                  <span
                    data-testid={`aggregate-share-${b.id}`}
                    className="text-caption text-[var(--muted-foreground)]"
                  >
                    {t("my_share", { pct: b.my_share_pct })}
                  </span>
                )}
                {!off && (
                  <span className="text-caption text-[var(--muted-foreground)]">
                    {shareOfTotal}%
                  </span>
                )}
                <span className="num text-sm">
                  <SlotAmount value={fmt(BigInt(b.net_worth_cents))} />
                </span>
                <button
                  type="button"
                  data-testid={`aggregate-exclude-${b.id}`}
                  onClick={() => toggle(b)}
                  aria-pressed={!off}
                  className="text-caption text-[var(--muted-foreground)] shrink-0"
                >
                  {off ? "＋" : "－"}
                </button>
              </div>
            );
          })}
        </section>

        {/* ATTENTION */}
        {attention.length > 0 && (
          <section className={CARD}>
            <p className="text-sm font-semibold text-[var(--body)]">
              {t("attention_title")}
            </p>
            <ul className="mt-2 space-y-1">
              {attention.map((b) => (
                <li key={b.id}>
                  <Link
                    href={`/${locale}/budgets/${b.id}/overview`}
                    className="flex justify-between text-caption"
                  >
                    <span className="truncate">{b.name}</span>
                    <span className="num text-[var(--trading-down)]">
                      {b.overspent_count > 0
                        ? fmt(BigInt(b.overspent_total_cents))
                        : "•"}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* THIS-MONTH FLOW */}
        <section className={`${CARD} flex justify-between`}>
          <div>
            <p className="text-caption text-[var(--muted-foreground)]">
              {t("spent")}
            </p>
            <p className="num">
              <SlotAmount value={fmt(sum("spent_month_cents"))} />
            </p>
          </div>
          <div className="text-right">
            <p className="text-caption text-[var(--muted-foreground)]">
              {t("left")}
            </p>
            <p className="num">
              <SlotAmount value={fmt(sum("left_month_cents"))} />
            </p>
          </div>
        </section>

        {included.length === 0 && (
          <p className="text-center text-caption text-[var(--muted-foreground)]">
            {t("empty")}
          </p>
        )}
      </main>
    </SlotRevealProvider>
  );
}
```

(Use the exact money formatter the overview uses — `centsToDisplay`/`centsToDisplayCompact` from `@/lib/money` or wherever `overview-cards.tsx` imports it. Match `SlotAmount`'s prop name `value`.)

- [ ] **Step 5: Run it, verify it passes**

Run: `cd apps/web && bunx vitest run test/components/budgeting/aggregate/aggregate-overview.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/hooks/use-budgets-aggregate.ts apps/web/src/components/budgeting/aggregate/aggregate-overview.tsx apps/web/test/components/budgeting/aggregate/aggregate-overview.test.tsx
git commit -m "feat(web): AggregateOverview — hero, breakdown, attention, flow + live exclude"
```

---

## Task 14: Composition pie block

**Files:**

- Create: `apps/web/src/components/budgeting/aggregate/aggregate-composition.tsx`
- Modify: `apps/web/src/components/budgeting/aggregate/aggregate-overview.tsx` (render it)
- Test: `apps/web/test/components/budgeting/aggregate/aggregate-composition.test.tsx`

**Interfaces:**

- Consumes: the included rows' `cash/investments/reserves+cushion` sums; `OverviewPieChart` (`charts/pie-chart.tsx`).
- Produces: `<AggregateComposition slices={{ cash, investments, reserves }} currency locale />`.

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { AggregateComposition } from "@/components/budgeting/aggregate/aggregate-composition";

vi.mock("next-intl", () => ({ useTranslations: () => (k: string) => k }));
vi.mock("@/components/budgeting/charts/pie-chart", () => ({
  OverviewPieChart: ({ data }: { data: any[] }) => (
    <div data-testid="pie">{data.map((d) => d.name).join(",")}</div>
  ),
}));

describe("AggregateComposition", () => {
  it("passes cash / investments / reserves slices to the pie", () => {
    render(
      <AggregateComposition
        cashCents="60000"
        investmentsCents="240000"
        reservesCents="120000"
        currency="USD"
        locale="en"
      />,
    );
    expect(screen.getByTestId("pie").textContent).toContain("cash");
    expect(screen.getByTestId("pie").textContent).toContain("investments");
    expect(screen.getByTestId("pie").textContent).toContain("reserves");
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `cd apps/web && bunx vitest run test/components/budgeting/aggregate/aggregate-composition.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement** (`aggregate-composition.tsx`)

```tsx
"use client";
import { useTranslations } from "next-intl";
import { OverviewPieChart } from "@/components/budgeting/charts/pie-chart";

const COLOR: Record<string, string> = {
  cash: "var(--trading-up)",
  investments: "var(--primary)",
  reserves: "var(--muted-foreground)",
};

export function AggregateComposition({
  cashCents,
  investmentsCents,
  reservesCents,
  currency,
  locale,
}: {
  cashCents: string;
  investmentsCents: string;
  reservesCents: string;
  currency: string;
  locale: string;
}) {
  const t = useTranslations("aggregate");
  const data = [
    { name: "cash", label: t("cash"), value: Number(cashCents) },
    {
      name: "investments",
      label: t("investments"),
      value: Number(investmentsCents),
    },
    { name: "reserves", label: t("reserves"), value: Number(reservesCents) },
  ].filter((d) => d.value > 0);
  if (data.length === 0) return null;
  return (
    <section className="rounded-[var(--radius-xl)] bg-[var(--surface-card-dark)] border border-[var(--hairline-dark)] p-4">
      <p className="text-sm font-semibold text-[var(--body)]">
        {t("composition_title")}
      </p>
      <OverviewPieChart
        data={data}
        nameKey="label"
        valueKey="value"
        colorFor={(d: any) => COLOR[d.name] ?? "var(--muted-foreground)"}
        formatValue={(v: number) =>
          new Intl.NumberFormat(locale, {
            style: "currency",
            currency,
            maximumFractionDigits: 0,
          }).format(v / 100)
        }
        formatName={(d: any) => d.label}
        height={220}
      />
    </section>
  );
}
```

(Match `OverviewPieChart`'s actual prop names — `nameKey`/`valueKey`/`colorFor`/`formatValue`/`formatName`/`height` per `charts/pie-chart.tsx`.)

- [ ] **Step 4: Render it** in `aggregate-overview.tsx` after the breakdown, passing `sum("cash_cents")`, `sum("investments_cents")`, `sum("reserves_cents")+sum("cushion_cents")`.

- [ ] **Step 5: Run it, verify it passes**

Run: `cd apps/web && bunx vitest run test/components/budgeting/aggregate/aggregate-composition.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/budgeting/aggregate/aggregate-composition.tsx apps/web/src/components/budgeting/aggregate/aggregate-overview.tsx apps/web/test/components/budgeting/aggregate/aggregate-composition.test.tsx
git commit -m "feat(web): aggregate wealth-composition pie"
```

---

## Task 15: Combined trend chart block

**Files:**

- Create: `apps/web/src/components/budgeting/aggregate/aggregate-trend.tsx`
- Modify: `apps/web/src/hooks/use-budgets-aggregate.ts` (add `useAggregateWealth`)
- Modify: `apps/web/src/components/budgeting/aggregate/aggregate-overview.tsx` (render, pass included ids)
- Test: `apps/web/test/components/budgeting/aggregate/aggregate-trend.test.tsx`

**Interfaces:**

- Consumes: `GET /budgets/aggregate/wealth?range&include`; `LineChart` (`charts/line-chart.tsx`).
- Produces: `useAggregateWealth(includeIds: string[], range: string)`; `<AggregateTrend includeIds />`.

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { AggregateTrend } from "@/components/budgeting/aggregate/aggregate-trend";

vi.mock("next-intl", () => ({
  useTranslations: () => (k: string) => k,
  useLocale: () => "en",
}));
vi.mock("@/hooks/use-budgets-aggregate", () => ({
  useAggregateWealth: () => ({
    data: {
      display_currency: "USD",
      series: [
        { label: "Jan", value_cents: "100000" },
        { label: "Feb", value_cents: "230000" },
      ],
      grow: { delta_cents: "130000", delta_pct: 130 },
    },
    isPending: false,
  }),
}));
vi.mock("@/components/budgeting/charts/line-chart", () => ({
  OverviewLineChart: ({ data }: { data: any[] }) => (
    <div data-testid="line">{data.length}</div>
  ),
}));

describe("AggregateTrend", () => {
  it("renders the combined series", () => {
    render(<AggregateTrend includeIds={["b1", "b2"]} />);
    expect(screen.getByTestId("line").textContent).toBe("2");
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `cd apps/web && bunx vitest run test/components/budgeting/aggregate/aggregate-trend.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Add the hook** (`use-budgets-aggregate.ts`)

```ts
export function useAggregateWealth(includeIds: string[], range: string) {
  return useQuery({
    queryKey: [
      "budgets",
      "aggregate",
      "wealth",
      range,
      [...includeIds].sort().join(","),
    ],
    enabled: includeIds.length > 0,
    queryFn: async () => {
      const res = await clientApiFetch(
        `/budgets/aggregate/wealth?range=${range}&include=${includeIds.join(",")}`,
      );
      if (!res.ok) throw new Error("aggregate wealth failed");
      return res.json() as Promise<{
        display_currency: string;
        series: { label: string; value_cents: string }[];
        grow: { delta_cents: string; delta_pct: number };
      }>;
    },
  });
}
```

- [ ] **Step 4: Implement `AggregateTrend`** (reuse `OverviewLineChart` from `charts/line-chart.tsx`; range selector optional, default "6M")

```tsx
"use client";
import { useTranslations, useLocale } from "next-intl";
import { useAggregateWealth } from "@/hooks/use-budgets-aggregate";
import { OverviewLineChart } from "@/components/budgeting/charts/line-chart";

export function AggregateTrend({ includeIds }: { includeIds: string[] }) {
  const t = useTranslations("aggregate");
  const locale = useLocale();
  const { data, isPending } = useAggregateWealth(includeIds, "6M");
  if (isPending || !data || data.series.length === 0) return null;
  const chartData = data.series.map((p) => ({
    label: p.label,
    value: Number(p.value_cents),
  }));
  return (
    <section className="rounded-[var(--radius-xl)] bg-[var(--surface-card-dark)] border border-[var(--hairline-dark)] p-4">
      <p className="text-sm font-semibold text-[var(--body)]">
        {t("trend_title")}
      </p>
      <OverviewLineChart
        data={chartData}
        xKey="label"
        yKey="value"
        formatValue={(v: number) =>
          new Intl.NumberFormat(locale, {
            style: "currency",
            currency: data.display_currency,
            maximumFractionDigits: 0,
          }).format(v / 100)
        }
        height={220}
      />
    </section>
  );
}
```

(Match `OverviewLineChart`'s real prop names/signature from `charts/line-chart.tsx`.)

- [ ] **Step 5: Render it** in `aggregate-overview.tsx` after composition, passing the currently-included budget ids (`included.map((b) => b.id)`).

- [ ] **Step 6: Run it, verify it passes**

Run: `cd apps/web && bunx vitest run test/components/budgeting/aggregate/aggregate-trend.test.tsx`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/hooks/use-budgets-aggregate.ts apps/web/src/components/budgeting/aggregate/aggregate-trend.tsx apps/web/src/components/budgeting/aggregate/aggregate-overview.tsx apps/web/test/components/budgeting/aggregate/aggregate-trend.test.tsx
git commit -m "feat(web): combined net-worth trend block"
```

---

## Task 16: Wire `AggregateOverview` into the home list view

**Files:**

- Modify: `apps/web/src/components/budgeting/home-budgets-client.tsx` (render `AggregateOverview` instead of the card grid when the list view is shown for ≥2 budgets)
- Test: `apps/web/test/components/budgeting/home-budgets-aggregate.test.tsx`

**Interfaces:**

- Consumes: existing `useActiveBudgets`, the r35 `?list=1` branch logic; `AggregateOverview`.

- [ ] **Step 1: Write the failing test** (≥2 budgets + list view → renders `AggregateOverview`, not the card grid)

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { HomeBudgetsClient } from "@/components/budgeting/home-budgets-client";

vi.mock("@/hooks/use-active-budgets", () => ({
  useActiveBudgets: () => ({
    data: [
      {
        id: "b1",
        name: "Home",
        default_currency: "USD",
        memberCount: 2,
        pendingTasksCount: 0,
      },
      {
        id: "b2",
        name: "Travel",
        default_currency: "EUR",
        memberCount: 1,
        pendingTasksCount: 0,
      },
    ],
    isPending: false,
  }),
}));
vi.mock("@/components/budgeting/aggregate/aggregate-overview", () => ({
  AggregateOverview: () => <div data-testid="aggregate-overview" />,
}));
// force the list view (r35): mock the search-param/router so ?list=1 branch is taken.

describe("HomeBudgetsClient list view", () => {
  it("renders the aggregate overview for ≥2 budgets in the list view", () => {
    render(<HomeBudgetsClient locale="en" forceList />); // add a `forceList` test prop OR mock useSearchParams to include list=1
    expect(screen.getByTestId("aggregate-overview")).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `cd apps/web && bunx vitest run test/components/budgeting/home-budgets-aggregate.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement** — in `home-budgets-client.tsx`, in the branch that currently renders the `BudgetCardClient` grid for the explicit list view, render `<AggregateOverview />` when `budgets.length >= 2`. Keep the r35 auto-open (1 budget → its overview) and empty-state paths unchanged. If the test needs it, thread the existing `?list=1` detection (don't invent a new prop unless the file already supports one).

- [ ] **Step 4: Run it, verify it passes**

Run: `cd apps/web && bunx vitest run test/components/budgeting/home-budgets-aggregate.test.tsx`
Expected: PASS.

- [ ] **Step 5: Rebuild web + commit**

```bash
docker compose build web && infisical run --env=dev -- make restart-web
git add apps/web/src/components/budgeting/home-budgets-client.tsx apps/web/test/components/budgeting/home-budgets-aggregate.test.tsx
git commit -m "feat(web): render AggregateOverview in the home list view (≥2 budgets)"
```

---

## Task 17: E2E — multi-budget aggregate flow

**Files:**

- Create: `apps/web/e2e/features/budgets-aggregate.feature`
- Create: `apps/web/e2e/steps/budgets-aggregate.steps.ts`

**Interfaces:**

- Consumes: the fresh-user fixture; HTTP seeding helpers (create budgets, add wallet balances, add a second member); Page Object patterns from existing steps.

- [ ] **Step 1: Write the feature** (`budgets-aggregate.feature`)

```gherkin
@phase12
Feature: All-budgets aggregate overview

  Background:
    Given I am signed in as a fresh user

  Scenario: Combined net worth sums budgets across currencies; excluding one drops the total
    Given I have a budget "Home" in "USD" with a wallet balance of 500000 cents
    And I have a budget "Travel" in "EUR" with a wallet balance of 300000 cents
    When I open the all-budgets view
    Then the aggregate hero shows a combined net worth greater than 500000 minor units
    When I exclude the "Travel" budget from the aggregate
    Then the aggregate hero decreases

  Scenario: The include-in-aggregation toggle is hidden with a single budget
    Given I have a budget "Solo" in "USD" with a wallet balance of 100000 cents
    When I open the general settings for "Solo"
    Then the include-in-aggregation toggle is not visible
```

- [ ] **Step 2: Write the steps** (`budgets-aggregate.steps.ts`) — reuse HTTP seeding; navigate to `/{locale}/?list=1`; assert `aggregate-hero` text and that it decreases after clicking `aggregate-exclude-<id>`; for the settings scenario assert `settings-aggregation-toggle` is absent. Use `expect.poll` for the hero recompute.

- [ ] **Step 3: Generate + run**

Run:

```bash
cd apps/web && bunx bddgen && PLAYWRIGHT_BASE_URL=https://budget-dev.madonzy.com infisical run --env=dev -- bunx playwright test --project=chromium --grep "@phase12" --reporter=line
```

Expected: PASS (rebuild web/api first if their tasks' images aren't yet deployed).

- [ ] **Step 4: Commit**

```bash
git add apps/web/e2e/features/budgets-aggregate.feature apps/web/e2e/steps/budgets-aggregate.steps.ts
git commit -m "test(e2e): all-budgets aggregate — cross-currency sum, exclude, single-budget gating"
```

---

## Self-Review

**Spec coverage:**

- §2 data model → Task 1 (columns/migration/backfill). ✓
- §2 churn → Task 5. ✓
- §3.1 compute + scaling + FX-miss + health → Task 6. ✓
- §3.2 `GET /budgets/aggregate` → Task 7; `GET /budgets/aggregate/wealth` → Task 9. ✓
- §4 self include flag (endpoint + settings, hidden <2) → Task 8 + Task 11. ✓
- §5 owner shares (validate + endpoint + editor) → Task 2 + Task 4 + Task 8 + Task 12. ✓
- §6 UI blocks 1/2/5/6 → Task 13; block 3 → Task 14; block 4 → Task 15; placement → Task 16. ✓
- §7 edge cases (fx_unavailable, excluded, all-excluded empty, 0% badge suppression) → Tasks 6/13. ✓
- §8 i18n → Task 10. ✓
- §9 tests → each task's TDD steps + Task 17 E2E. ✓

**Placeholder scan:** No "TBD"/"handle edge cases" — each step carries real code. Two deliberate "match the exact existing name" notes (Money API, test-harness helper names) point to specific reference files, not vague gaps.

**Type consistency:** `AggregateBudgetRow`/`AllBudgetsAggregate` defined in Task 6, consumed unchanged in Tasks 7/13. `getAggPrefsForUser` / `listMemberShares` / `setMemberShares` / `setMemberAggregation` names consistent across Tasks 3/4/6/7/8. `validateShares` signature consistent Task 2 ↔ Task 8. `useBudgetsAggregate` / `useSetAggregationFlag` / `useAggregateWealth` consistent Tasks 13/15.

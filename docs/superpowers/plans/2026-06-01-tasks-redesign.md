# Tasks Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single BDP top-banner with three task surfaces: red numeric badges on home-page budget cards, red numeric badges per BDP pill, and a per-pill slider below the pill bar that lists only that pill's tasks (hybrid expand: 1 task → expanded, ≥2 → collapsed).

**Architecture:** New `PillTaskSlider` + `PillBadge` components share one React-Query key (`["tasks", budgetId, "pending"]`) and a `kind ↔ pill` mapping module. Backend extension is additive: `GET /budgets/active` returns `pendingTasksCount` per budget via a tenant-scoped aggregate. The existing `TaskBannerRow` is reused unchanged — per-kind row UX (deep-link / inline POST / sonner toast) is bit-identical.

**Tech Stack:** Bun + Hono v4 (api) · Next.js 16 App Router + RSC (web) · Drizzle + Postgres + RLS · React Query · next-intl · playwright-bdd · Vitest 4 + RTL + happy-dom · bun:test

**Spec:** `docs/superpowers/specs/2026-06-01-tasks-redesign-design.md`

---

## File structure

### Created

```
apps/web/src/components/budgeting/tasks/
├── kind-pill-map.ts                       # const + 2 helpers, no React
├── pill-badge.tsx                         # numeric red badge
└── pill-task-slider.tsx                   # per-pill accordion + hybrid expand rule

apps/web/test/components/budgeting/tasks/
├── kind-pill-map.test.ts
├── pill-badge.test.tsx
└── pill-task-slider.test.tsx

apps/web/e2e/page-objects/
├── BdpTabsPo.ts                           # per-pill badge locators
└── PillTaskSliderPo.ts                    # replaces TaskBannerPo

apps/web/e2e/features/
└── tasks.feature                          # replaces task-banner.feature

tests/tenant-leak/
└── budgets-active-tasks-count-cross-tenant.test.ts   # ci-gate 8 → 9
```

### Modified

```
packages/tenancy/src/ports/budget-repo.ts                       # BudgetDTO + pendingTasksCount
packages/tenancy/src/adapters/persistence/workspace-repo.ts     # listForUser SQL aggregate
apps/api/src/routes/budgets.ts                                  # /budgets/active passthrough
apps/api/test/routes/budgets-active.test.ts                     # extended assertions

apps/web/src/components/budgeting/budget-switcher.tsx           # BudgetSummary + pendingTasksCount
apps/web/src/components/budgeting/budget-card.tsx               # corner badge
apps/web/src/components/budgeting/bdp-tabs.tsx                  # per-pill badge
apps/web/src/app/[locale]/(app)/budgets/[id]/layout.tsx         # drop TaskBanner mount, pass initialTasks to BdpTabs
apps/web/src/app/[locale]/(app)/budgets/[id]/wallets/page.tsx   # mount PillTaskSlider pill="wallets"
apps/web/src/app/[locale]/(app)/budgets/[id]/spendings/page.tsx # mount PillTaskSlider pill="spendings"
apps/web/src/app/[locale]/(app)/budgets/[id]/reserves/page.tsx  # mount PillTaskSlider pill="reserves"
apps/web/src/app/[locale]/(app)/budgets/[id]/settings/page.tsx  # mount PillTaskSlider pill="settings"

apps/web/messages/en.json
apps/web/messages/pl.json
apps/web/messages/uk.json

apps/web/test/components/budgeting/budget-card.test.tsx         # badge cases
apps/web/test/components/budgeting/bdp-tabs.test.tsx            # badge cases

apps/web/e2e/page-objects/HomePo.ts                             # getCardBadge
apps/web/e2e/steps/task-banner.steps.ts                         # rename → tasks.steps.ts, new step bindings

scripts/ci/run-tenant-leak.sh                                   # gate count comment 8 → 9
Makefile                                                        # ci-gate comment if any

.planning/phases/07-tasks-queue/07-UAT.md                       # forward-pointer note
```

### Deleted

```
apps/web/src/components/budgeting/task-banner.tsx
apps/web/test/components/budgeting/task-banner.test.tsx
apps/web/e2e/page-objects/TaskBannerPo.ts
apps/web/e2e/features/task-banner.feature
apps/web/e2e/steps/task-banner.steps.ts          # replaced by tasks.steps.ts
```

---

## Workflow conventions

- **TDD.** Every task is `red → green → refactor → commit`.
- **Docker rebuild.** Frontend edits = `make restart-web` after Docker image rebuild. Per `feedback_always_rebuild_web`.
- **Env injection.** All test runs go through `infisical run -- …`. Per `feedback_e2e_must_block`.
- **Playwright base URL.** `PLAYWRIGHT_BASE_URL=$(grep '^APP_URL=' .env.local | cut -d= -f2)`. Per `feedback_test_baseurl`.
- **No DB mocks in integration tests.** Real Postgres via Docker. Per `CLAUDE.md`.
- **Branch.** Plan executes on a fresh worktree branch off `phase-05/reserves-wallets-final` (or `main` if Phase 5 has merged by then).

---

## Task 1: Tenant-leak gate — `pendingTasksCount` cross-tenant test (RED)

**Files:**

- Create: `tests/tenant-leak/budgets-active-tasks-count-cross-tenant.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/tenant-leak/budgets-active-tasks-count-cross-tenant.test.ts`:

```ts
/**
 * budgets-active-tasks-count-cross-tenant.test.ts — Tenant-leak gate.
 *
 * Verifies that `pendingTasksCount` returned from GET /budgets/active is
 * scoped to the authenticated user. Even if budgetB has N pending tasks,
 * user A (who only owns budgetA) must see budgetA.pendingTasksCount === 0
 * — both because RLS blocks reading budgetB.tasks at all, AND because the
 * SQL aggregate joins on budgeting.tasks where tenant_id is GUC-scoped.
 *
 * Gate accounting (`make ci-gate` → tests/tenant-leak/*.test.ts):
 * Count goes from 8 → 9 with this file.
 */
import { describe, it, expect, beforeAll } from "bun:test";
import { Pool } from "pg";
import { sql } from "drizzle-orm";

const DB_URL_RAW = process.env.DATABASE_URL_APP;
if (!DB_URL_RAW)
  throw new Error("DATABASE_URL_APP required for tenant-leak gate tests");
process.env.DATABASE_URL_APP = DB_URL_RAW.replace("@db:", "@localhost:");
const DB_URL = process.env.DATABASE_URL_APP;

const { resetPools, withUserContext, withInfraTx } =
  await import("@budget/platform");
const { UserId } = await import("@budget/shared-kernel");
const { createTenancyModule } = await import("@budget/tenancy/contracts");

let userA: string;
let userB: string;
let budgetA: string;
let budgetB: string;

beforeAll(async () => {
  await resetPools();
  // Seed: 2 users, 2 budgets (1 owned by each), 3 PENDING tasks in budgetB
  const pool = new Pool({ connectionString: DB_URL });
  const client = await pool.connect();
  try {
    userA = crypto.randomUUID();
    userB = crypto.randomUUID();
    budgetA = crypto.randomUUID();
    budgetB = crypto.randomUUID();
    await client.query("SET ROLE budget_app");
    await client.query(
      `INSERT INTO identity.users (id, email, name) VALUES ($1, $2, $3), ($4, $5, $6)`,
      [userA, `a-${userA}@test`, "A", userB, `b-${userB}@test`, "B"],
    );
    await client.query(
      `INSERT INTO tenancy.budgets (id, name, kind, default_currency, owner_user_id)
       VALUES ($1, 'A', 'PRIVATE', 'EUR', $2), ($3, 'B', 'PRIVATE', 'EUR', $4)`,
      [budgetA, userA, budgetB, userB],
    );
    await client.query(
      `INSERT INTO tenancy.budget_members (budget_id, user_id, role)
       VALUES ($1, $2, 'OWNER'), ($3, $4, 'OWNER')`,
      [budgetA, userA, budgetB, userB],
    );
    // 3 PENDING tasks in budgetB
    for (let i = 0; i < 3; i++) {
      await client.query(
        `INSERT INTO budgeting.tasks
           (id, tenant_id, budget_id, kind, status, payload, created_at)
         VALUES ($1, $2, $2, 'RESERVE_TOPUP', 'PENDING', '{}'::jsonb, NOW())`,
        [crypto.randomUUID(), budgetB],
      );
    }
  } finally {
    client.release();
    await pool.end();
  }
});

describe("GET /budgets/active — pendingTasksCount tenant isolation", () => {
  it("user A sees pendingTasksCount=0 on budgetA even though budgetB has 3 pending tasks", async () => {
    const mod = createTenancyModule({});
    const budgets = await mod.workspaceRepo.listForUser(userA);
    const a = budgets.find((b) => b.id === budgetA);
    expect(a).toBeDefined();
    expect(a!.pendingTasksCount).toBe(0);
    // budgetB MUST NOT appear in user A's list at all
    expect(budgets.find((b) => b.id === budgetB)).toBeUndefined();
  });

  it("user B sees pendingTasksCount=3 on budgetB", async () => {
    const mod = createTenancyModule({});
    const budgets = await mod.workspaceRepo.listForUser(userB);
    const b = budgets.find((b) => b.id === budgetB);
    expect(b).toBeDefined();
    expect(b!.pendingTasksCount).toBe(3);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /home/claude/budget
infisical run -- bun test tests/tenant-leak/budgets-active-tasks-count-cross-tenant.test.ts 2>&1 | tail -30
```

Expected: FAIL with `pendingTasksCount` undefined on `BudgetDTO`.

- [ ] **Step 3: Commit (red baseline)**

```bash
git add tests/tenant-leak/budgets-active-tasks-count-cross-tenant.test.ts
git commit -m "test(tasks-redesign): RED — tenant-leak gate for pendingTasksCount"
```

---

## Task 2: Extend `BudgetDTO` and `workspaceRepo.listForUser` SQL (GREEN for Task 1)

**Files:**

- Modify: `packages/tenancy/src/ports/budget-repo.ts`
- Modify: `packages/tenancy/src/adapters/persistence/workspace-repo.ts`

- [ ] **Step 1: Extend the port type**

Open `packages/tenancy/src/ports/budget-repo.ts`. Find the `BudgetDTO` type and add `pendingTasksCount: number`:

```ts
// before
export interface BudgetDTO {
  id: string;
  slug: string;
  name: string;
  kind: string;
  default_currency: string;
  // ... existing fields
}

// after
export interface BudgetDTO {
  id: string;
  slug: string;
  name: string;
  kind: string;
  default_currency: string;
  // ... existing fields
  pendingTasksCount: number;
}
```

(Exact insertion point: after the last existing field, before closing brace.)

- [ ] **Step 2: Extend the SQL in `listForUser`**

Open `packages/tenancy/src/adapters/persistence/workspace-repo.ts`. Locate the `listForUser(userId)` method around line 62. Find the main SELECT query and add a LEFT JOIN aggregate:

```ts
// In listForUser, replace the existing SELECT with:
const result = await tx.execute<{
  id: string;
  slug: string;
  name: string;
  kind: string;
  default_currency: string;
  owner_user_id: string;
  member_count: number;
  created_at: Date;
  cushion_mode_enabled: boolean;
  reserves_enabled: boolean;
  cushion_enabled: boolean;
  pending_tasks_count: string; // BIGINT comes back as string from pg
}>(sql`
  SELECT b.id, b.slug, b.name, b.kind, b.default_currency,
         b.owner_user_id, b.member_count, b.created_at,
         b.cushion_mode_enabled, b.reserves_enabled, b.cushion_enabled,
         COALESCE(tk.pending, 0)::text AS pending_tasks_count
    FROM tenancy.budgets b
    LEFT JOIN (
      SELECT budget_id, COUNT(*)::bigint AS pending
        FROM budgeting.tasks
       WHERE status = 'PENDING'
       GROUP BY budget_id
    ) tk ON tk.budget_id = b.id
   WHERE b.id IN ( /* existing membership filter unchanged */ )
   ORDER BY b.created_at DESC
`);
```

(Read the existing query first — keep its `WHERE` clause for membership filtering unchanged; only the SELECT list and LEFT JOIN are new. Add `pendingTasksCount: Number(row.pending_tasks_count)` to the mapped output object.)

- [ ] **Step 3: Run the tenant-leak test (should now pass)**

```bash
cd /home/claude/budget
infisical run -- bun test tests/tenant-leak/budgets-active-tasks-count-cross-tenant.test.ts 2>&1 | tail -20
```

Expected: 2 passed.

- [ ] **Step 4: Run all tenant-leak tests to ensure no regression**

```bash
cd /home/claude/budget
infisical run -- bash scripts/ci/run-tenant-leak.sh 2>&1 | tail -30
```

Expected: all gates pass.

- [ ] **Step 5: Commit**

```bash
git add packages/tenancy/
git commit -m "feat(tenancy): add pendingTasksCount to BudgetDTO + listForUser

LEFT JOIN against budgeting.tasks aggregating COUNT(*) FILTER status='PENDING'
grouped by budget_id. RLS-scoped automatically via withUserContext —
cross-tenant tasks never enter the result set.

Refs: docs/superpowers/specs/2026-06-01-tasks-redesign-design.md §5.4"
```

---

## Task 3: Integration test for `GET /budgets/active` response shape

**Files:**

- Modify: `apps/api/test/routes/budgets-active.test.ts` (or create if absent — check via `ls apps/api/test/routes/ | grep budgets-active` first; if absent, the existing budget-tests file may already cover `/active` — locate it via `grep -rn '/budgets/active' apps/api/test/`)

- [ ] **Step 1: Read the existing budgets-active test (if any)**

```bash
find apps/api/test -name '*active*' 2>/dev/null
grep -rln '"/budgets/active"' apps/api/test/ 2>/dev/null
```

If a test file exists, open it and extend. If not, create `apps/api/test/routes/budgets-active.test.ts` following the pattern of `apps/api/test/routes/tasks.test.ts`.

- [ ] **Step 2: Write the failing tests**

Add (or create) the file with these cases:

```ts
import { describe, it, expect, beforeAll } from "bun:test";
import {
  buildTestApp,
  signUp,
  signIn,
  createBudget,
  seedTask,
} from "../helpers";

describe("GET /budgets/active — pendingTasksCount field", () => {
  let app: Awaited<ReturnType<typeof buildTestApp>>;
  let cookieA: string;
  let budgetA: { id: string };

  beforeAll(async () => {
    app = await buildTestApp();
    cookieA = await signUp(app, "active-a@test", "PassPass1!").then((u) =>
      signIn(app, "active-a@test", "PassPass1!"),
    );
    budgetA = await createBudget(app, cookieA, {
      name: "A",
      default_currency: "EUR",
    });
  });

  it("returns pendingTasksCount=0 when budget has no pending tasks", async () => {
    const res = await app.request("/budgets/active", {
      headers: { cookie: cookieA },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      budgets: Array<{ id: string; pendingTasksCount: number }>;
    };
    const b = body.budgets.find((x) => x.id === budgetA.id);
    expect(b!.pendingTasksCount).toBe(0);
  });

  it("returns pendingTasksCount=N after seeding N PENDING tasks", async () => {
    await seedTask(budgetA.id, "RESERVE_TOPUP");
    await seedTask(budgetA.id, "CONFIRM_DRAFT");
    const res = await app.request("/budgets/active", {
      headers: { cookie: cookieA },
    });
    const body = (await res.json()) as {
      budgets: Array<{ id: string; pendingTasksCount: number }>;
    };
    const b = body.budgets.find((x) => x.id === budgetA.id);
    expect(b!.pendingTasksCount).toBe(2);
  });

  it("does not count RESOLVED tasks", async () => {
    await seedTask(budgetA.id, "RESERVE_TOPUP", "RESOLVED");
    const res = await app.request("/budgets/active", {
      headers: { cookie: cookieA },
    });
    const body = (await res.json()) as {
      budgets: Array<{ id: string; pendingTasksCount: number }>;
    };
    const b = body.budgets.find((x) => x.id === budgetA.id);
    expect(b!.pendingTasksCount).toBe(2); // unchanged
  });
});
```

(If helper functions `signUp`, `signIn`, `createBudget`, `seedTask` do not exist, replicate the inline-Pool seeding pattern from `tests/tenant-leak/tasks-cross-tenant.test.ts`.)

- [ ] **Step 3: Run the tests**

```bash
cd /home/claude/budget
infisical run -- bun test apps/api/test/routes/budgets-active.test.ts 2>&1 | tail -20
```

Expected: 3 passed (the SQL change in Task 2 already returns `pendingTasksCount`).

- [ ] **Step 4: Commit**

```bash
git add apps/api/test/routes/budgets-active.test.ts
git commit -m "test(api): assert pendingTasksCount field shape on /budgets/active"
```

---

## Task 4: Extend `BudgetSummary` type on the web side

**Files:**

- Modify: `apps/web/src/components/budgeting/budget-switcher.tsx:16-21`

- [ ] **Step 1: Extend the type**

```ts
// before (apps/web/src/components/budgeting/budget-switcher.tsx)
export interface BudgetSummary {
  id: string;
  name: string;
  kind: "PRIVATE" | "SHARED";
  default_currency: string;
}

// after
export interface BudgetSummary {
  id: string;
  name: string;
  kind: "PRIVATE" | "SHARED";
  default_currency: string;
  /** Pending task count for this budget. Sourced from GET /budgets/active. */
  pendingTasksCount: number;
}
```

- [ ] **Step 2: TS compile check**

```bash
cd /home/claude/budget/apps/web
bunx tsc --noEmit 2>&1 | tail -30
```

Expected: no new errors (existing call sites do not reference the new field; type widening is backward-compatible).

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/budgeting/budget-switcher.tsx
git commit -m "feat(web): add pendingTasksCount to BudgetSummary type"
```

---

## Task 5: `kind-pill-map.ts` module + unit test

**Files:**

- Create: `apps/web/src/components/budgeting/tasks/kind-pill-map.ts`
- Create: `apps/web/test/components/budgeting/tasks/kind-pill-map.test.ts`

- [ ] **Step 1: Write the failing test**

`apps/web/test/components/budgeting/tasks/kind-pill-map.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  KIND_TO_PILL,
  pillFor,
  kindsFor,
  type Pill,
} from "@/components/budgeting/tasks/kind-pill-map";

describe("kind-pill-map", () => {
  it("maps RESERVE_TOPUP → reserves", () => {
    expect(pillFor("RESERVE_TOPUP")).toBe("reserves");
  });

  it("maps CUSHION_BELOW_TARGET → wallets", () => {
    expect(pillFor("CUSHION_BELOW_TARGET")).toBe("wallets");
  });

  it("maps CONFIRM_DRAFT → spendings", () => {
    expect(pillFor("CONFIRM_DRAFT")).toBe("spendings");
  });

  it("kindsFor('reserves') returns [RESERVE_TOPUP]", () => {
    expect(kindsFor("reserves")).toEqual(["RESERVE_TOPUP"]);
  });

  it("kindsFor('wallets') returns [CUSHION_BELOW_TARGET]", () => {
    expect(kindsFor("wallets")).toEqual(["CUSHION_BELOW_TARGET"]);
  });

  it("kindsFor('spendings') returns [CONFIRM_DRAFT]", () => {
    expect(kindsFor("spendings")).toEqual(["CONFIRM_DRAFT"]);
  });

  it("kindsFor('settings') returns [] (no kind maps to Settings today)", () => {
    expect(kindsFor("settings")).toEqual([]);
  });

  it("round-trip: kindsFor(pillFor(kind)).includes(kind)", () => {
    const kinds = [
      "RESERVE_TOPUP",
      "CUSHION_BELOW_TARGET",
      "CONFIRM_DRAFT",
    ] as const;
    for (const k of kinds) {
      expect(kindsFor(pillFor(k))).toContain(k);
    }
  });

  it("KIND_TO_PILL keys are exactly the 3 task kinds", () => {
    expect(Object.keys(KIND_TO_PILL).sort()).toEqual(
      ["CONFIRM_DRAFT", "CUSHION_BELOW_TARGET", "RESERVE_TOPUP"].sort(),
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /home/claude/budget/apps/web
bun run test src/components/budgeting/tasks/ 2>&1 | tail -15
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write the module**

`apps/web/src/components/budgeting/tasks/kind-pill-map.ts`:

```ts
/**
 * kind-pill-map.ts — single source of truth for the task-kind → BDP-pill
 * relation. Imported by PillBadge, PillTaskSlider, BdpTabs. No React deps.
 *
 * Tasks-Redesign §4 (Architecture): the three current task kinds map 1:1
 * to BDP pills. Settings has no kind today; the badge wiring is generic
 * so a future kind can be added without special-casing.
 */
import type { TaskKind } from "@/components/budgeting/task-banner-row";

export type Pill = "wallets" | "spendings" | "reserves" | "settings";

export const KIND_TO_PILL = {
  RESERVE_TOPUP: "reserves",
  CUSHION_BELOW_TARGET: "wallets",
  CONFIRM_DRAFT: "spendings",
} as const satisfies Record<TaskKind, Pill>;

export function pillFor(kind: TaskKind): Pill {
  return KIND_TO_PILL[kind];
}

export function kindsFor(pill: Pill): readonly TaskKind[] {
  return (Object.keys(KIND_TO_PILL) as TaskKind[]).filter(
    (k) => KIND_TO_PILL[k] === pill,
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd /home/claude/budget/apps/web
bun run test src/components/budgeting/tasks/ 2>&1 | tail -10
```

Expected: 8 passed.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/budgeting/tasks/kind-pill-map.ts \
        apps/web/test/components/budgeting/tasks/kind-pill-map.test.ts
git commit -m "feat(web): add kind-pill-map module + unit test"
```

---

## Task 6: `PillBadge` component + Vitest

**Files:**

- Create: `apps/web/src/components/budgeting/tasks/pill-badge.tsx`
- Create: `apps/web/test/components/budgeting/tasks/pill-badge.test.tsx`

- [ ] **Step 1: Write the failing test**

`apps/web/test/components/budgeting/tasks/pill-badge.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { PillBadge } from "@/components/budgeting/tasks/pill-badge";

describe("PillBadge", () => {
  it("renders the count when count > 0", () => {
    render(<PillBadge count={3} />);
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("returns null when count === 0", () => {
    const { container } = render(<PillBadge count={0} />);
    expect(container.firstChild).toBeNull();
  });

  it("returns null for negative counts (defensive)", () => {
    const { container } = render(<PillBadge count={-1} />);
    expect(container.firstChild).toBeNull();
  });

  it("applies the red --trading-down background class", () => {
    const { container } = render(<PillBadge count={1} />);
    const span = container.firstElementChild as HTMLElement;
    expect(span.className).toContain("bg-[var(--trading-down)]");
    expect(span.className).toContain("text-white");
  });

  it("renders inline-flex so it fits inside pill labels", () => {
    const { container } = render(<PillBadge count={1} />);
    const span = container.firstElementChild as HTMLElement;
    expect(span.className).toContain("inline-flex");
  });

  it("forwards aria-label for screen readers", () => {
    render(<PillBadge count={3} ariaLabel="3 tasks pending" />);
    expect(screen.getByLabelText("3 tasks pending")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /home/claude/budget/apps/web
bun run test pill-badge 2>&1 | tail -10
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write the component**

`apps/web/src/components/budgeting/tasks/pill-badge.tsx`:

```tsx
/**
 * PillBadge — small red numeric badge for BDP pills and home BudgetCard.
 *
 * Renders null when count <= 0 (no zero-badges anywhere — Tasks-Redesign D8).
 * Background: --trading-down (#f6465d). Foreground: white.
 *
 * Parent provides positioning (e.g. absolute top-right on BudgetCard,
 * inline next to label inside BdpTabs NavLink).
 */
interface PillBadgeProps {
  count: number;
  ariaLabel?: string;
}

export function PillBadge({ count, ariaLabel }: PillBadgeProps) {
  if (count <= 0) return null;
  return (
    <span
      data-testid="pill-badge"
      aria-label={ariaLabel}
      className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--trading-down)] px-1.5 text-[10px] font-bold leading-none text-white"
    >
      {count}
    </span>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd /home/claude/budget/apps/web
bun run test pill-badge 2>&1 | tail -10
```

Expected: 6 passed.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/budgeting/tasks/pill-badge.tsx \
        apps/web/test/components/budgeting/tasks/pill-badge.test.tsx
git commit -m "feat(web): add PillBadge component (red, --trading-down, null-on-zero)"
```

---

## Task 7: `PillTaskSlider` component + Vitest (filter + hybrid expand + escape + visibility)

**Files:**

- Create: `apps/web/src/components/budgeting/tasks/pill-task-slider.tsx`
- Create: `apps/web/test/components/budgeting/tasks/pill-task-slider.test.tsx`

- [ ] **Step 1: Write the failing test**

`apps/web/test/components/budgeting/tasks/pill-task-slider.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { TestQueryProvider } from "../../setup/query-client";
import type { TaskSummary } from "@/components/budgeting/task-banner-row";

const fetchMock = vi.fn();
vi.mock("@/lib/budget-fetch", () => ({
  clientApiFetch: (...args: unknown[]) => fetchMock(...args),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  }),
}));

import { PillTaskSlider } from "@/components/budgeting/tasks/pill-task-slider";

function makeTask(kind: TaskSummary["kind"], i = 0): TaskSummary {
  return {
    id: `task-${kind}-${i}`,
    budget_id: "b1",
    kind,
    status: "PENDING",
    payload:
      kind === "RESERVE_TOPUP"
        ? { shortfall_cents: 5000, currency: "EUR" }
        : kind === "CUSHION_BELOW_TARGET"
          ? { shortfall_cents: 3000, currency: "EUR" }
          : {
              draft_id: "d1",
              rule_name: "Rent",
              amount_cents: 100000,
              currency: "EUR",
            },
    created_at: new Date().toISOString(),
  };
}

beforeEach(() => {
  fetchMock.mockReset();
});

describe("PillTaskSlider", () => {
  it("returns null when filtered task list is empty", () => {
    const { container } = render(
      <TestQueryProvider>
        <PillTaskSlider
          budgetId="b1"
          locale="en"
          pill="reserves"
          initialTasks={[]}
        />
      </TestQueryProvider>,
    );
    expect(container.firstChild).toBeNull();
  });

  it("filters by pill: reserves slider only shows RESERVE_TOPUP rows", () => {
    const tasks = [
      makeTask("RESERVE_TOPUP"),
      makeTask("CONFIRM_DRAFT"),
      makeTask("CUSHION_BELOW_TARGET"),
    ];
    render(
      <TestQueryProvider>
        <PillTaskSlider
          budgetId="b1"
          locale="en"
          pill="reserves"
          initialTasks={tasks}
        />
      </TestQueryProvider>,
    );
    // Reserves slider auto-expands when filtered.length === 1
    const rows = screen.getAllByRole("listitem");
    expect(rows.length).toBe(1);
  });

  it("1 task → expanded on initial mount (auto-expand)", () => {
    render(
      <TestQueryProvider>
        <PillTaskSlider
          budgetId="b1"
          locale="en"
          pill="reserves"
          initialTasks={[makeTask("RESERVE_TOPUP")]}
        />
      </TestQueryProvider>,
    );
    expect(screen.getByRole("listitem")).toBeInTheDocument();
    const button = screen.getByRole("button", { name: /collapse|⌃|▲/i });
    expect(button.getAttribute("aria-expanded")).toBe("true");
  });

  it("≥2 tasks → collapsed on initial mount", () => {
    render(
      <TestQueryProvider>
        <PillTaskSlider
          budgetId="b1"
          locale="en"
          pill="reserves"
          initialTasks={[
            makeTask("RESERVE_TOPUP", 0),
            makeTask("RESERVE_TOPUP", 1),
          ]}
        />
      </TestQueryProvider>,
    );
    expect(screen.queryByRole("listitem")).not.toBeInTheDocument();
    const button = screen.getByRole("button");
    expect(button.getAttribute("aria-expanded")).toBe("false");
  });

  it("click collapsed header expands the slider", () => {
    render(
      <TestQueryProvider>
        <PillTaskSlider
          budgetId="b1"
          locale="en"
          pill="reserves"
          initialTasks={[
            makeTask("RESERVE_TOPUP", 0),
            makeTask("RESERVE_TOPUP", 1),
          ]}
        />
      </TestQueryProvider>,
    );
    fireEvent.click(screen.getByRole("button"));
    expect(screen.getAllByRole("listitem").length).toBe(2);
  });

  it("Escape collapses when expanded", () => {
    render(
      <TestQueryProvider>
        <PillTaskSlider
          budgetId="b1"
          locale="en"
          pill="reserves"
          initialTasks={[makeTask("RESERVE_TOPUP")]}
        />
      </TestQueryProvider>,
    );
    // 1 task → expanded by default
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("listitem")).not.toBeInTheDocument();
  });

  it("data-testid='pill-task-slider' + data-pill='<pill>' for E2E", () => {
    render(
      <TestQueryProvider>
        <PillTaskSlider
          budgetId="b1"
          locale="en"
          pill="wallets"
          initialTasks={[makeTask("CUSHION_BELOW_TARGET")]}
        />
      </TestQueryProvider>,
    );
    const root = screen.getByTestId("pill-task-slider");
    expect(root.getAttribute("data-pill")).toBe("wallets");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /home/claude/budget/apps/web
bun run test pill-task-slider 2>&1 | tail -15
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write the component**

`apps/web/src/components/budgeting/tasks/pill-task-slider.tsx`:

```tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { AlertCircle, ChevronDown, ChevronUp } from "lucide-react";
import { clientApiFetch } from "@/lib/budget-fetch";
import {
  TaskBannerRow,
  type TaskSummary,
} from "@/components/budgeting/task-banner-row";
import {
  kindsFor,
  type Pill,
} from "@/components/budgeting/tasks/kind-pill-map";

/**
 * PillTaskSlider — per-pill task strip below the BDP pill bar.
 *
 * Tasks-Redesign §4: filters the shared ["tasks", budgetId, "pending"] React
 * Query result by the current pill's kind set (kind-pill-map). Returns null
 * when filtered list is empty (D-PH3-14 DOM rule, applied per-pill).
 *
 * Hybrid expand rule (Tasks-Redesign D7):
 *   - filtered.length === 1 → expanded on initial mount
 *   - filtered.length >= 2  → collapsed on initial mount
 *   - mid-session count changes do NOT auto-toggle (user owns state after mount)
 *
 * Row UX (deep-link / inline POST / sonner toast) is bit-identical to the
 * old TaskBanner — TaskBannerRow is reused unchanged.
 */
interface PillTaskSliderProps {
  budgetId: string;
  locale: string;
  pill: Pill;
  initialTasks: TaskSummary[];
}

export function PillTaskSlider({
  budgetId,
  locale,
  pill,
  initialTasks,
}: PillTaskSliderProps) {
  const t = useTranslations();
  const queryClient = useQueryClient();

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

  const allowedKinds = useMemo(() => new Set(kindsFor(pill)), [pill]);
  const filtered = useMemo(
    () => (tasks ?? []).filter((t) => allowedKinds.has(t.kind)),
    [tasks, allowedKinds],
  );

  const initialExpanded = filtered.length === 1;
  const [expanded, setExpanded] = useState(initialExpanded);
  // Recompute initial-mount state only once: if the slider unmounts when
  // filtered becomes empty and remounts later, the count-at-mount rule fires.

  // Refresh on tab re-visible (parity with old TaskBanner behavior).
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

  // Escape collapses when expanded.
  useEffect(() => {
    if (!expanded) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setExpanded(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [expanded]);

  if (filtered.length === 0) return null;

  const onResolved = (taskId: string) => {
    queryClient.setQueryData<TaskSummary[]>(
      ["tasks", budgetId, "pending"],
      (prev) => (prev ?? []).filter((task) => task.id !== taskId),
    );
  };

  const headerLabel =
    filtered.length === 1
      ? t("bdp.pillSlider.collapsedHeaderOne")
      : t("bdp.pillSlider.collapsedHeaderMany", { count: filtered.length });

  return (
    <div
      data-testid="pill-task-slider"
      data-pill={pill}
      className="border-b border-[var(--hairline-dark)] bg-[var(--surface-card-dark)]"
    >
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        aria-expanded={expanded}
        aria-label={
          expanded
            ? t("bdp.pillSlider.collapseAria")
            : t("bdp.pillSlider.expandAria")
        }
        className="flex h-10 w-full items-center gap-2 px-4 text-sm text-[var(--body-on-dark)]"
      >
        <AlertCircle
          className="h-4 w-4 text-[var(--primary)]"
          aria-hidden="true"
        />
        <span className="flex-1 text-left">{headerLabel}</span>
        {expanded ? (
          <ChevronUp className="h-4 w-4" aria-hidden="true" />
        ) : (
          <ChevronDown className="h-4 w-4" aria-hidden="true" />
        )}
      </button>
      {expanded ? (
        <div role="list">
          {filtered.map((task) => (
            <TaskBannerRow
              key={task.id}
              task={task}
              budgetId={budgetId}
              locale={locale}
              onResolved={onResolved}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd /home/claude/budget/apps/web
bun run test pill-task-slider 2>&1 | tail -15
```

Expected: 7 passed. (Test for "1 task expanded" looks for `aria-expanded='true'` on the header button — the chevron icon's accessible name is `aria-hidden` so the test queries the button by its `aria-label` resolving to the collapseAria string.)

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/budgeting/tasks/pill-task-slider.tsx \
        apps/web/test/components/budgeting/tasks/pill-task-slider.test.tsx
git commit -m "feat(web): add PillTaskSlider with hybrid expand rule"
```

---

## Task 8: Extend `BdpTabs` with per-pill `PillBadge`

**Files:**

- Modify: `apps/web/src/components/budgeting/bdp-tabs.tsx`
- Create / extend: `apps/web/test/components/budgeting/bdp-tabs.test.tsx`

- [ ] **Step 1: Write the failing test**

`apps/web/test/components/budgeting/bdp-tabs.test.tsx` (extend if exists, else create):

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { TestQueryProvider } from "../setup/query-client";
import type { TaskSummary } from "@/components/budgeting/task-banner-row";

vi.mock("@/lib/budget-fetch", () => ({
  clientApiFetch: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/en/budgets/b1/reserves",
}));

import { BdpTabs } from "@/components/budgeting/bdp-tabs";

function task(kind: TaskSummary["kind"], i = 0): TaskSummary {
  return {
    id: `t-${kind}-${i}`,
    budget_id: "b1",
    kind,
    status: "PENDING",
    payload: {},
    created_at: new Date().toISOString(),
  };
}

describe("BdpTabs — per-pill badges", () => {
  it("shows badge with count 1 on Reserves pill when 1 RESERVE_TOPUP pending", () => {
    render(
      <TestQueryProvider>
        <BdpTabs
          locale="en"
          budgetId="b1"
          reservesEnabled={true}
          initialTasks={[task("RESERVE_TOPUP")]}
        />
      </TestQueryProvider>,
    );
    const reserves = screen.getByRole("link", { name: /reserves/i });
    const badge = reserves.querySelector('[data-testid="pill-badge"]');
    expect(badge?.textContent).toBe("1");
  });

  it("shows badge on Wallets when 1 CUSHION pending, no badge on others", () => {
    render(
      <TestQueryProvider>
        <BdpTabs
          locale="en"
          budgetId="b1"
          reservesEnabled={true}
          initialTasks={[task("CUSHION_BELOW_TARGET")]}
        />
      </TestQueryProvider>,
    );
    const wallets = screen.getByRole("link", { name: /wallets/i });
    expect(
      wallets.querySelector('[data-testid="pill-badge"]')?.textContent,
    ).toBe("1");

    const reserves = screen.getByRole("link", { name: /reserves/i });
    expect(reserves.querySelector('[data-testid="pill-badge"]')).toBeNull();

    const settings = screen.getByRole("link", { name: /settings/i });
    expect(settings.querySelector('[data-testid="pill-badge"]')).toBeNull();
  });

  it("Settings pill never shows badge in current 3-kind scope", () => {
    render(
      <TestQueryProvider>
        <BdpTabs
          locale="en"
          budgetId="b1"
          reservesEnabled={true}
          initialTasks={[
            task("RESERVE_TOPUP"),
            task("CUSHION_BELOW_TARGET"),
            task("CONFIRM_DRAFT"),
          ]}
        />
      </TestQueryProvider>,
    );
    const settings = screen.getByRole("link", { name: /settings/i });
    expect(settings.querySelector('[data-testid="pill-badge"]')).toBeNull();
  });

  it("zero tasks → no badge on any pill", () => {
    render(
      <TestQueryProvider>
        <BdpTabs
          locale="en"
          budgetId="b1"
          reservesEnabled={true}
          initialTasks={[]}
        />
      </TestQueryProvider>,
    );
    expect(screen.queryAllByTestId("pill-badge").length).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /home/claude/budget/apps/web
bun run test bdp-tabs 2>&1 | tail -10
```

Expected: FAIL — `initialTasks` not in `BdpTabsProps` / no badges rendered.

- [ ] **Step 3: Modify `bdp-tabs.tsx`**

Add `initialTasks?: TaskSummary[]` to `BdpTabsProps`. Inside the component, add a shared `useQuery` for the same key, then derive counts per pill via `pillFor`. Render `<PillBadge count={count} />` inside each `NavLink`.

```tsx
"use client";

import { usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { NavLink } from "@/components/common/nav-link";
import { useTranslations } from "next-intl";
import {
  LayoutGrid,
  Coins,
  Wallet,
  Settings,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { clientApiFetch } from "@/lib/budget-fetch";
import type { TaskSummary } from "@/components/budgeting/task-banner-row";
import { PillBadge } from "@/components/budgeting/tasks/pill-badge";
import { pillFor, type Pill } from "@/components/budgeting/tasks/kind-pill-map";

interface BdpTabsProps {
  locale: string;
  budgetId: string;
  reservesEnabled?: boolean;
  /** RSC-prefetched pending tasks for this budget. Drives per-pill badges. */
  initialTasks?: TaskSummary[];
}

const TABS: ReadonlyArray<{ slug: Pill; icon: LucideIcon }> = [
  { slug: "wallets", icon: Wallet },
  { slug: "spendings", icon: LayoutGrid },
  { slug: "reserves", icon: Coins },
  { slug: "settings", icon: Settings },
];

export function BdpTabs({
  locale,
  budgetId,
  reservesEnabled = true,
  initialTasks = [],
}: BdpTabsProps) {
  const pathname = usePathname() ?? "";
  const t = useTranslations("bdp.tab");

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

  // Derive per-pill counts.
  const countsByPill: Record<Pill, number> = {
    wallets: 0,
    spendings: 0,
    reserves: 0,
    settings: 0,
  };
  for (const task of tasks ?? []) {
    countsByPill[pillFor(task.kind)] += 1;
  }

  const visibleTabs = reservesEnabled
    ? TABS
    : TABS.filter((t) => t.slug !== "reserves");

  return (
    <nav
      aria-label={t("aria")}
      className="flex h-12 items-center justify-center gap-2 px-4 sm:px-6"
    >
      {visibleTabs.map(({ slug, icon: Icon }) => {
        const href = `/${locale}/budgets/${budgetId}/${slug}`;
        const active = pathname.startsWith(href);
        const label = t(`${slug}.label`);
        const count = countsByPill[slug];
        return (
          <NavLink
            key={slug}
            href={href}
            aria-current={active ? "page" : undefined}
            aria-label={label}
            className={cn(
              "inline-flex h-9 items-center gap-2 rounded-[var(--radius-pill)] px-4 transition-colors",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--info)]",
              "min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0",
              active
                ? "bg-[var(--primary)] text-[var(--on-primary)] text-sm font-medium"
                : "bg-[var(--surface-card-dark)] text-[var(--body-on-dark)] text-sm",
            )}
          >
            <Icon className="h-4 w-4" aria-hidden="true" />
            <span className={cn("inline", !active && "hidden sm:inline")}>
              {label}
            </span>
            <PillBadge count={count} />
          </NavLink>
        );
      })}
    </nav>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd /home/claude/budget/apps/web
bun run test bdp-tabs 2>&1 | tail -10
```

Expected: 4 passed.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/budgeting/bdp-tabs.tsx \
        apps/web/test/components/budgeting/bdp-tabs.test.tsx
git commit -m "feat(web): BdpTabs renders per-pill PillBadge from shared tasks query"
```

---

## Task 9: Extend `BudgetCard` with corner `PillBadge`

**Files:**

- Modify: `apps/web/src/components/budgeting/budget-card.tsx`
- Modify: `apps/web/test/components/budgeting/budget-card.test.tsx` (or create)

- [ ] **Step 1: Write the failing test**

```tsx
// apps/web/test/components/budgeting/budget-card.test.tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

// (mocks for next-intl, NavLink, serverApiFetch — match existing budget-card test
//  patterns; copy from sibling test files for boilerplate.)

import { BudgetCard } from "@/components/budgeting/budget-card";

describe("BudgetCard — pendingTasksCount badge", () => {
  it("renders red badge with count when pendingTasksCount > 0", async () => {
    const node = await BudgetCard({
      budget: {
        id: "b1",
        name: "Test",
        kind: "PRIVATE",
        default_currency: "EUR",
        pendingTasksCount: 3,
      },
      locale: "en",
    });
    render(node);
    const badge = screen.getByTestId("pill-badge");
    expect(badge.textContent).toBe("3");
    expect(badge.className).toContain("bg-[var(--trading-down)]");
  });

  it("no badge when pendingTasksCount === 0", async () => {
    const node = await BudgetCard({
      budget: {
        id: "b1",
        name: "Test",
        kind: "PRIVATE",
        default_currency: "EUR",
        pendingTasksCount: 0,
      },
      locale: "en",
    });
    render(node);
    expect(screen.queryByTestId("pill-badge")).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /home/claude/budget/apps/web
bun run test budget-card 2>&1 | tail -10
```

Expected: FAIL — badge not rendered.

- [ ] **Step 3: Modify `budget-card.tsx`**

In the `BudgetCard` return JSX, inside the `<NavLink>` wrapper (which already has `relative` via its `block` styles, add `relative` if missing), add:

```tsx
import { PillBadge } from "@/components/budgeting/tasks/pill-badge";

// inside <NavLink ... className="... relative ...">
//   …existing content…
<span className="absolute top-3 right-3">
  <PillBadge
    count={budget.pendingTasksCount}
    ariaLabel={t("card.pendingTasksAria", { count: budget.pendingTasksCount })}
  />
</span>;
```

(Confirm `NavLink` `className` already contains `relative`; if not, add it.)

- [ ] **Step 4: Run test to verify it passes**

```bash
cd /home/claude/budget/apps/web
bun run test budget-card 2>&1 | tail -10
```

Expected: 2 new tests pass; pre-existing budget-card tests still green.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/budgeting/budget-card.tsx \
        apps/web/test/components/budgeting/budget-card.test.tsx
git commit -m "feat(web): BudgetCard shows red PillBadge when pendingTasksCount > 0"
```

---

## Task 10: Drop `TaskBanner` from `BdpLayout`; pass `initialTasks` to `BdpTabs`

**Files:**

- Modify: `apps/web/src/app/[locale]/(app)/budgets/[id]/layout.tsx`

- [ ] **Step 1: Edit `BdpLayout`**

Replace the imports and the JSX that mounts `TaskBanner`:

```tsx
// REMOVE these imports:
//   import { TaskBanner } from "@/components/budgeting/task-banner";
//   import type { TaskSummary } from "@/components/budgeting/task-banner-row";
// REPLACE with:
import type { TaskSummary } from "@/components/budgeting/task-banner-row";
// (TaskSummary import stays — used to type fetchInitialTasks)

// Keep fetchInitialTasks() unchanged.

// REPLACE the JSX block that mounts TaskBanner:
//   {initialTasks.length > 0 ? (
//     <TaskBanner budgetId={id} locale={locale} initialTasks={initialTasks} />
//   ) : null}
//   <BdpTabs locale={locale} budgetId={id} reservesEnabled={reservesEnabled} />
// WITH:
<BdpTabs
  locale={locale}
  budgetId={id}
  reservesEnabled={reservesEnabled}
  initialTasks={initialTasks}
/>;
```

(The sticky wrapper `<div data-testid="bdp-sticky-wrapper">` stays. It now wraps `<BdpTabs>` only.)

- [ ] **Step 2: TS compile check**

```bash
cd /home/claude/budget/apps/web
bunx tsc --noEmit 2>&1 | tail -20
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/[locale]/\(app\)/budgets/\[id\]/layout.tsx
git commit -m "feat(web): drop TaskBanner from BdpLayout; pass initialTasks to BdpTabs"
```

---

## Task 11: Mount `PillTaskSlider` inside the 4 pill pages

**Files:**

- Modify: `apps/web/src/app/[locale]/(app)/budgets/[id]/wallets/page.tsx`
- Modify: `apps/web/src/app/[locale]/(app)/budgets/[id]/spendings/page.tsx`
- Modify: `apps/web/src/app/[locale]/(app)/budgets/[id]/reserves/page.tsx`
- Modify: `apps/web/src/app/[locale]/(app)/budgets/[id]/settings/page.tsx`

- [ ] **Step 1: Edit Wallets page**

Add at the top:

```tsx
import { serverApiFetch } from "@/lib/budget-fetch.server";
import { PillTaskSlider } from "@/components/budgeting/tasks/pill-task-slider";
import type { TaskSummary } from "@/components/budgeting/task-banner-row";

async function fetchInitialTasks(budgetId: string): Promise<TaskSummary[]> {
  const res = await serverApiFetch(
    budgetId,
    `/budgets/${budgetId}/tasks?status=pending`,
  );
  if (!res.ok) return [];
  const body = (await res.json()) as { tasks?: TaskSummary[] };
  return body.tasks ?? [];
}
```

In the page component, after `const { id: budgetId, locale } = await params` (or equivalent destructuring), add the fetch and mount the slider:

```tsx
const initialTasks = await fetchInitialTasks(budgetId);

return (
  <>
    <PillTaskSlider
      budgetId={budgetId}
      locale={locale}
      pill="wallets"
      initialTasks={initialTasks}
    />
    {/* existing page content unchanged */}
  </>
);
```

(If the page does not currently destructure `locale` from `params`, add it: `const { locale, id: budgetId } = await params`.)

- [ ] **Step 2: Repeat for Spendings page**

Same pattern, `pill="spendings"`.

- [ ] **Step 3: Repeat for Reserves page**

Same pattern, `pill="reserves"`.

- [ ] **Step 4: Repeat for Settings page**

Same pattern, `pill="settings"`. (No kind maps to settings today → slider always returns null. The mount is there for symmetry and forward compatibility.)

- [ ] **Step 5: TS compile check**

```bash
cd /home/claude/budget/apps/web
bunx tsc --noEmit 2>&1 | tail -20
```

Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/app/[locale]/\(app\)/budgets/\[id\]/wallets/page.tsx \
        apps/web/src/app/[locale]/\(app\)/budgets/\[id\]/spendings/page.tsx \
        apps/web/src/app/[locale]/\(app\)/budgets/\[id\]/reserves/page.tsx \
        apps/web/src/app/[locale]/\(app\)/budgets/\[id\]/settings/page.tsx
git commit -m "feat(web): mount PillTaskSlider on each BDP pill page"
```

---

## Task 12: i18n keys — 3 new keys × 3 locales

**Files:**

- Modify: `apps/web/messages/en.json`
- Modify: `apps/web/messages/pl.json`
- Modify: `apps/web/messages/uk.json`

- [ ] **Step 1: Add keys to en.json**

Inside the existing `"bdp"` object, add a new `"pillSlider"` sub-object:

```json
"pillSlider": {
  "collapsedHeaderOne": "1 task pending",
  "collapsedHeaderMany": "{count} tasks pending",
  "expandAria": "Expand task list",
  "collapseAria": "Collapse task list"
}
```

Inside the existing `"home"` object, add:

```json
"card": {
  "pendingTasksAria": "{count} pending tasks"
}
```

(If `home.card` already exists, merge — keep existing keys.)

- [ ] **Step 2: Add keys to pl.json**

```json
"pillSlider": {
  "collapsedHeaderOne": "1 zadanie oczekuje",
  "collapsedHeaderMany": "{count} zadań oczekuje",
  "expandAria": "Rozwiń listę zadań",
  "collapseAria": "Zwiń listę zadań"
}
```

```json
"card": {
  "pendingTasksAria": "{count} oczekujących zadań"
}
```

- [ ] **Step 3: Add keys to uk.json**

```json
"pillSlider": {
  "collapsedHeaderOne": "1 завдання очікує",
  "collapsedHeaderMany": "{count} завдань очікує",
  "expandAria": "Розгорнути список завдань",
  "collapseAria": "Згорнути список завдань"
}
```

```json
"card": {
  "pendingTasksAria": "{count} очікуючих завдань"
}
```

- [ ] **Step 4: Add a presence test**

`apps/web/test/i18n/pill-slider-keys.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import en from "@/messages/en.json";
import pl from "@/messages/pl.json";
import uk from "@/messages/uk.json";

const KEYS = [
  "bdp.pillSlider.collapsedHeaderOne",
  "bdp.pillSlider.collapsedHeaderMany",
  "bdp.pillSlider.expandAria",
  "bdp.pillSlider.collapseAria",
  "home.card.pendingTasksAria",
];

function get(obj: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, k) => {
    if (acc && typeof acc === "object" && k in acc) {
      return (acc as Record<string, unknown>)[k];
    }
    return undefined;
  }, obj);
}

describe("PillSlider i18n keys", () => {
  for (const locale of [
    ["en", en],
    ["pl", pl],
    ["uk", uk],
  ] as const) {
    for (const k of KEYS) {
      it(`${locale[0]} has ${k}`, () => {
        expect(typeof get(locale[1], k)).toBe("string");
      });
    }
  }
});
```

- [ ] **Step 5: Run i18n presence test**

```bash
cd /home/claude/budget/apps/web
bun run test pill-slider-keys 2>&1 | tail -10
```

Expected: 15 passed.

- [ ] **Step 6: Commit**

```bash
git add apps/web/messages/en.json apps/web/messages/pl.json apps/web/messages/uk.json \
        apps/web/test/i18n/pill-slider-keys.test.ts
git commit -m "i18n: add bdp.pillSlider + home.card.pendingTasksAria keys (en/pl/uk)"
```

---

## Task 13: Page Objects — `BdpTabsPo`, `PillTaskSliderPo`, extend `HomePo`; delete `TaskBannerPo`

**Files:**

- Create: `apps/web/e2e/page-objects/BdpTabsPo.ts`
- Create: `apps/web/e2e/page-objects/PillTaskSliderPo.ts`
- Modify: `apps/web/e2e/page-objects/HomePo.ts`
- Delete: `apps/web/e2e/page-objects/TaskBannerPo.ts`

- [ ] **Step 1: Create `BdpTabsPo.ts`**

```ts
import { expect, type Page, type Locator } from "@playwright/test";

type Pill = "wallets" | "spendings" | "reserves" | "settings";

export class BdpTabsPo {
  constructor(private page: Page) {}

  pill(pill: Pill): Locator {
    return this.page.getByRole("link", { name: new RegExp(`^${pill}$`, "i") });
  }

  badge(pill: Pill): Locator {
    return this.pill(pill).getByTestId("pill-badge");
  }

  async assertBadgeCount(pill: Pill, count: number): Promise<void> {
    if (count === 0) {
      await expect(this.badge(pill)).toHaveCount(0);
    } else {
      await expect(this.badge(pill)).toHaveText(String(count));
    }
  }
}
```

- [ ] **Step 2: Create `PillTaskSliderPo.ts`**

```ts
import { expect, type Page, type Locator } from "@playwright/test";

type Pill = "wallets" | "spendings" | "reserves" | "settings";

export class PillTaskSliderPo {
  constructor(
    private page: Page,
    private pill: Pill,
  ) {}

  root(): Locator {
    return this.page.locator(
      `[data-testid="pill-task-slider"][data-pill="${this.pill}"]`,
    );
  }

  header(): Locator {
    return this.root().getByRole("button").first();
  }

  rows(): Locator {
    return this.root().getByRole("listitem");
  }

  rowByTitle(title: string | RegExp): Locator {
    return this.rows().filter({ hasText: title });
  }

  actionButton(rowIdx = 0): Locator {
    return this.rows().nth(rowIdx).getByRole("button");
  }

  async expand(): Promise<void> {
    if ((await this.header().getAttribute("aria-expanded")) === "false") {
      await this.header().click();
    }
  }

  async assertExpanded(expanded: boolean): Promise<void> {
    await expect(this.header()).toHaveAttribute(
      "aria-expanded",
      String(expanded),
    );
  }

  async assertRowCount(n: number): Promise<void> {
    await this.expand();
    await expect(this.rows()).toHaveCount(n);
  }

  async assertActionLabel(label: string, rowIdx = 0): Promise<void> {
    await this.expand();
    await expect(this.actionButton(rowIdx)).toHaveText(label);
  }

  async waitForGone(timeoutMs: number): Promise<void> {
    await expect(this.root()).toHaveCount(0, { timeout: timeoutMs });
  }
}
```

- [ ] **Step 3: Extend `HomePo.ts`**

Find the existing `HomePo` class. Add:

```ts
budgetCard(budgetName: string): Locator {
  return this.page.getByRole("link", { name: new RegExp(budgetName) });
}

cardBadge(budgetName: string): Locator {
  return this.budgetCard(budgetName).getByTestId("pill-badge");
}

async assertCardBadge(budgetName: string, count: number): Promise<void> {
  if (count === 0) {
    await expect(this.cardBadge(budgetName)).toHaveCount(0);
  } else {
    await expect(this.cardBadge(budgetName)).toHaveText(String(count));
  }
}
```

- [ ] **Step 4: Delete `TaskBannerPo.ts`**

```bash
git rm apps/web/e2e/page-objects/TaskBannerPo.ts
```

- [ ] **Step 5: Commit**

```bash
git add apps/web/e2e/page-objects/
git commit -m "test(e2e): add BdpTabsPo + PillTaskSliderPo; extend HomePo; delete TaskBannerPo"
```

---

## Task 14: E2E feature rewrite — `tasks.feature` + step bindings

**Files:**

- Create: `apps/web/e2e/features/tasks.feature`
- Delete: `apps/web/e2e/features/task-banner.feature`
- Create: `apps/web/e2e/steps/tasks.steps.ts` (replaces `task-banner.steps.ts`)
- Delete: `apps/web/e2e/steps/task-banner.steps.ts`

- [ ] **Step 1: Read existing `task-banner.steps.ts`**

```bash
cat apps/web/e2e/steps/task-banner.steps.ts | head -200
```

Keep the SQL seed helpers (`withTenantClient`, `seedTask`, `setCushionEnabled`, `resolveSeededTask`) — copy them into `tasks.steps.ts` verbatim. They're the production-equivalent path.

- [ ] **Step 2: Write `tasks.feature`**

`apps/web/e2e/features/tasks.feature`:

```gherkin
@tasks-redesign
Feature: Tasks redesign — home badge + per-pill badge + per-pill slider

  Background:
    Given I am signed in as a fresh user

  # ───────────────────────────────────────────────────────────────────────
  # Home page badges
  # ───────────────────────────────────────────────────────────────────────
  Scenario: Home shows red badge "3" on a budget card with 3 pending tasks
    Given a "RESERVE_TOPUP" task is seeded for "My E2E Budget" with shortfall 5000 cents in "EUR"
    And a "CONFIRM_DRAFT" task is seeded for "My E2E Budget" with rule "Rent" amount 100000 cents in "EUR"
    And a "CUSHION_BELOW_TARGET" task is seeded for "My E2E Budget" with shortfall 3000 cents in "EUR"
    When I open the home page
    Then the budget card for "My E2E Budget" shows a pending tasks badge "3"

  Scenario: Home shows no badge on a budget with 0 pending tasks
    When I open the home page
    Then the budget card for "My E2E Budget" shows no pending tasks badge

  # ───────────────────────────────────────────────────────────────────────
  # BDP pill badges (red)
  # ───────────────────────────────────────────────────────────────────────
  Scenario: Reserves pill shows red "1" badge for one RESERVE_TOPUP
    Given a "RESERVE_TOPUP" task is seeded for "My E2E Budget" with shortfall 5000 cents in "EUR"
    When I open the BDP for "My E2E Budget"
    Then the Reserves pill shows a badge "1"
    And the Wallets pill shows no badge
    And the Spendings pill shows no badge
    And the Settings pill shows no badge

  Scenario: Wallets pill shows red "1" badge for one CUSHION_BELOW_TARGET
    Given a "CUSHION_BELOW_TARGET" task is seeded for "My E2E Budget" with shortfall 3000 cents in "EUR"
    When I open the BDP for "My E2E Budget"
    Then the Wallets pill shows a badge "1"
    And the Reserves pill shows no badge

  Scenario: Spendings pill shows red "1" badge for one CONFIRM_DRAFT
    Given a "CONFIRM_DRAFT" task is seeded for "My E2E Budget" with rule "Rent" amount 100000 cents in "EUR"
    When I open the BDP for "My E2E Budget"
    Then the Spendings pill shows a badge "1"

  Scenario: Settings pill never shows a badge in current scope
    Given a "RESERVE_TOPUP" task is seeded for "My E2E Budget" with shortfall 5000 cents in "EUR"
    And a "CUSHION_BELOW_TARGET" task is seeded for "My E2E Budget" with shortfall 3000 cents in "EUR"
    And a "CONFIRM_DRAFT" task is seeded for "My E2E Budget" with rule "Rent" amount 100000 cents in "EUR"
    When I open the BDP for "My E2E Budget"
    Then the Settings pill shows no badge

  # ───────────────────────────────────────────────────────────────────────
  # Per-pill slider — hybrid expand rule
  # ───────────────────────────────────────────────────────────────────────
  Scenario: Reserves slider with 1 task mounts expanded
    Given a "RESERVE_TOPUP" task is seeded for "My E2E Budget" with shortfall 5000 cents in "EUR"
    When I open the reserves tab for "My E2E Budget"
    Then the reserves pill slider is expanded
    And the reserves pill slider shows 1 row
    And the action button label is "Fix reserve"

  Scenario: Reserves slider with 2 tasks mounts collapsed; click expands
    Given 2 "RESERVE_TOPUP" tasks are seeded for "My E2E Budget" in "EUR"
    When I open the reserves tab for "My E2E Budget"
    Then the reserves pill slider is collapsed
    When I click the reserves pill slider header
    Then the reserves pill slider shows 2 rows

  # ───────────────────────────────────────────────────────────────────────
  # Per-kind action routing (unchanged contract from Phase 7)
  # ───────────────────────────────────────────────────────────────────────
  Scenario: RESERVE_TOPUP action navigates to /reserves?task=<id>
    Given a "RESERVE_TOPUP" task is seeded for "My E2E Budget" with shortfall 5000 cents in "EUR"
    When I open the reserves tab for "My E2E Budget"
    And I click the reserves pill slider action button
    Then I am navigated to the reserves tab
    And the URL contains "task="

  Scenario: CUSHION_BELOW_TARGET action navigates to /wallets with focus=cushion
    Given a "CUSHION_BELOW_TARGET" task is seeded for "My E2E Budget" with shortfall 3000 cents in "EUR"
    When I open the wallets tab for "My E2E Budget"
    And I click the wallets pill slider action button
    Then I am navigated to the wallets tab
    And the URL contains "focus=cushion"

  Scenario: CONFIRM_DRAFT inline POST collapses row + shows toast
    Given a "CONFIRM_DRAFT" task is seeded for "My E2E Budget" with rule "Rent" amount 100000 cents in "EUR"
    When I open the spendings tab for "My E2E Budget"
    And I click the spendings pill slider action button
    Then within 5 seconds the spendings pill slider is not present in the DOM

  # ───────────────────────────────────────────────────────────────────────
  # Auto-resolve
  # ───────────────────────────────────────────────────────────────────────
  Scenario: Server-side resolve removes the slider within 90s
    Given a "RESERVE_TOPUP" task is seeded for "My E2E Budget" with shortfall 5000 cents in "EUR"
    And the seeded task is resolved server-side
    When I open the reserves tab for "My E2E Budget"
    Then within 90 seconds the reserves pill slider is not present in the DOM

  # ───────────────────────────────────────────────────────────────────────
  # Mobile sanity
  # ───────────────────────────────────────────────────────────────────────
  Scenario: Phone-sized viewport — pill bar wraps and badges still visible
    Given I am on a phone-sized viewport
    And a "RESERVE_TOPUP" task is seeded for "My E2E Budget" with shortfall 5000 cents in "EUR"
    When I open the BDP for "My E2E Budget"
    Then the Reserves pill shows a badge "1"

  # ───────────────────────────────────────────────────────────────────────
  # Dedup (carried over from Phase 7 deferred-items.md — unchanged scenario)
  # ───────────────────────────────────────────────────────────────────────
  @skip-phase-07-debt
  Scenario: Two emit attempts for the same RESERVE_TOPUP shortfall produce one task
    Given a "RESERVE_TOPUP" task is seeded for "My E2E Budget" with shortfall 5000 cents in "EUR"
    And a second emit attempt is made for the same shortfall
    When I open the reserves tab for "My E2E Budget"
    Then the reserves pill slider shows 1 row
```

- [ ] **Step 3: Write `tasks.steps.ts`**

Copy `task-banner.steps.ts` verbatim, then add new step bindings:

```ts
import { Given, When, Then } from "playwright-bdd/decorators";
import { expect } from "@playwright/test";
import { HomePo } from "../page-objects/HomePo";
import { BdpTabsPo } from "../page-objects/BdpTabsPo";
import { PillTaskSliderPo } from "../page-objects/PillTaskSliderPo";

type Pill = "wallets" | "spendings" | "reserves" | "settings";

const pillFromText = (s: string): Pill => s.toLowerCase() as Pill;

// existing Given(...) seeders (withTenantClient + seedTask + setCushionEnabled + resolveSeededTask)
// stay verbatim — copy from task-banner.steps.ts.

When("I open the home page", async ({ page }) => {
  await page.goto("/en");
});

When(
  "I open the {string} tab for {string}",
  async ({ page, budgetByName }, tab: string, name: string) => {
    const budget = await budgetByName(name);
    await page.goto(`/en/budgets/${budget.id}/${tab}`);
  },
);

Then(
  "the budget card for {string} shows a pending tasks badge {string}",
  async ({ page }, name: string, count: string) => {
    const home = new HomePo(page);
    await home.assertCardBadge(name, Number(count));
  },
);

Then(
  "the budget card for {string} shows no pending tasks badge",
  async ({ page }, name: string) => {
    const home = new HomePo(page);
    await home.assertCardBadge(name, 0);
  },
);

Then(
  "the {word} pill shows a badge {string}",
  async ({ page }, pillWord: string, count: string) => {
    const tabs = new BdpTabsPo(page);
    await tabs.assertBadgeCount(pillFromText(pillWord), Number(count));
  },
);

Then("the {word} pill shows no badge", async ({ page }, pillWord: string) => {
  const tabs = new BdpTabsPo(page);
  await tabs.assertBadgeCount(pillFromText(pillWord), 0);
});

Then(
  "the {word} pill slider is expanded",
  async ({ page }, pillWord: string) => {
    const slider = new PillTaskSliderPo(page, pillFromText(pillWord));
    await slider.assertExpanded(true);
  },
);

Then(
  "the {word} pill slider is collapsed",
  async ({ page }, pillWord: string) => {
    const slider = new PillTaskSliderPo(page, pillFromText(pillWord));
    await slider.assertExpanded(false);
  },
);

Then(
  "the {word} pill slider shows {int} row(s)",
  async ({ page }, pillWord: string, n: number) => {
    const slider = new PillTaskSliderPo(page, pillFromText(pillWord));
    await slider.assertRowCount(n);
  },
);

When(
  "I click the {word} pill slider header",
  async ({ page }, pillWord: string) => {
    const slider = new PillTaskSliderPo(page, pillFromText(pillWord));
    await slider.header().click();
  },
);

When(
  "I click the {word} pill slider action button",
  async ({ page }, pillWord: string) => {
    const slider = new PillTaskSliderPo(page, pillFromText(pillWord));
    await slider.expand();
    await slider.actionButton(0).click();
  },
);

Then(
  "within {int} seconds the {word} pill slider is not present in the DOM",
  async ({ page }, seconds: number, pillWord: string) => {
    const slider = new PillTaskSliderPo(page, pillFromText(pillWord));
    await slider.waitForGone(seconds * 1000);
  },
);

Then("the action button label is {string}", async ({ page }, label: string) => {
  // Generic — finds first pill-task-slider, first action button.
  const button = page
    .locator('[data-testid="pill-task-slider"] [role="listitem"] button')
    .first();
  await expect(button).toHaveText(label);
});

// "2 RESERVE_TOPUP tasks are seeded" — reuse existing seedTask twice with distinct shortfalls
Given(
  "2 {string} tasks are seeded for {string} in {string}",
  async (ctx, kind: string, budgetName: string, currency: string) => {
    await ctx.seedTask(kind, budgetName, 5000, currency);
    await ctx.seedTask(kind, budgetName, 7000, currency);
  },
);
```

(Exact playwright-bdd step binding shape depends on the project's existing pattern — copy the `Given`/`When`/`Then` import style from `task-banner.steps.ts`.)

- [ ] **Step 4: Delete old files**

```bash
git rm apps/web/e2e/features/task-banner.feature \
       apps/web/e2e/steps/task-banner.steps.ts
```

- [ ] **Step 5: Commit**

```bash
git add apps/web/e2e/features/tasks.feature apps/web/e2e/steps/tasks.steps.ts
git commit -m "test(e2e): rewrite task-banner.feature → tasks.feature for redesign

13 scenarios cover:
  - Home red badge per budget
  - Per-pill red badges (Wallets/Spendings/Reserves; never Settings)
  - Per-pill slider hybrid expand rule (1 → expanded, >=2 → collapsed)
  - Per-kind action routing unchanged (deep-link / inline POST)
  - Auto-resolve removes slider
  - Mobile viewport
  - @skip-phase-07-debt dedup carries over"
```

---

## Task 15: Tenant-leak gate count comment 8 → 9

**Files:**

- Modify: `scripts/ci/run-tenant-leak.sh`
- Possibly: `Makefile`

- [ ] **Step 1: Read current script**

```bash
cat /home/claude/budget/scripts/ci/run-tenant-leak.sh | head -30
```

- [ ] **Step 2: Update comment / count assertion**

If the script greps a hard-coded "8 files" or runs a count assertion, bump to 9. If the script only iterates `tests/tenant-leak/*.test.ts` without a fixed count, no change is needed.

- [ ] **Step 3: Run the gate**

```bash
cd /home/claude/budget
infisical run -- bash scripts/ci/run-tenant-leak.sh 2>&1 | tail -10
```

Expected: 9 files pass.

- [ ] **Step 4: Commit (only if a change was made)**

```bash
git add scripts/ci/run-tenant-leak.sh Makefile
git commit -m "chore(ci): bump tenant-leak gate count comment to 9 files"
```

(Skip the commit if no file was modified — the test count is data-driven.)

---

## Task 16: Delete `TaskBanner` component + its Vitest test

**Files:**

- Delete: `apps/web/src/components/budgeting/task-banner.tsx`
- Delete: `apps/web/test/components/budgeting/task-banner.test.tsx`

- [ ] **Step 1: Verify no live references**

```bash
cd /home/claude/budget
grep -rn 'TaskBanner\b' apps/web/src apps/web/test apps/web/e2e --include='*.ts' --include='*.tsx' 2>/dev/null | grep -v 'TaskBannerRow' | head -20
```

Expected: no results outside the two files being deleted.

- [ ] **Step 2: Delete**

```bash
git rm apps/web/src/components/budgeting/task-banner.tsx \
       apps/web/test/components/budgeting/task-banner.test.tsx
```

- [ ] **Step 3: Run full Vitest suite**

```bash
cd /home/claude/budget/apps/web
bun run test 2>&1 | tail -10
```

Expected: all green.

- [ ] **Step 4: TS compile**

```bash
cd /home/claude/budget/apps/web
bunx tsc --noEmit 2>&1 | tail -10
```

Expected: clean.

- [ ] **Step 5: Commit**

```bash
git commit -m "chore(web): remove TaskBanner; PillTaskSlider replaces it"
```

---

## Task 17: Phase 7 UAT.md forward-pointer note

**Files:**

- Modify: `.planning/phases/07-tasks-queue/07-UAT.md`

- [ ] **Step 1: Append a note at the top of the file (under frontmatter, before `## Current Test`)**

```markdown
> **Superseded by Tasks Redesign** (spec: `docs/superpowers/specs/2026-06-01-tasks-redesign-design.md`).
> The top-banner contract verified in this UAT has been replaced by per-pill
> badges + per-pill sliders. Banner-based scenarios below remain historically
> accurate for Phase 7 but no longer reflect the live UI.
```

- [ ] **Step 2: Commit**

```bash
git add .planning/phases/07-tasks-queue/07-UAT.md
git commit -m "docs(phase-07): note Tasks Redesign supersedes top banner"
```

---

## Task 18: Docker rebuild + full local E2E smoke

**Files:** none (runtime verification only)

- [ ] **Step 1: Rebuild web (frontend bundled at build time per `feedback_always_rebuild_web`)**

```bash
cd /home/claude/budget
docker compose build web && make restart-web 2>&1 | tail -10
```

- [ ] **Step 2: Confirm web is healthy and recently restarted**

```bash
docker compose ps web 2>&1 | tail -5
```

Expected: `Up (healthy)` and recently restarted (matches the build time).

- [ ] **Step 3: Run the full @tasks-redesign E2E suite**

```bash
cd /home/claude/budget
infisical run --command 'cd /home/claude/budget/apps/web && PLAYWRIGHT_BASE_URL=$(grep "^APP_URL=" /home/claude/budget/.env.local | cut -d= -f2) bunx playwright test --grep "@tasks-redesign" --project=chromium --reporter=list' 2>&1 | tail -30
```

Expected: 12 passed / 1 skipped (`@skip-phase-07-debt`).

- [ ] **Step 4: Run full ci-gate**

```bash
cd /home/claude/budget
infisical run -- bash scripts/ci/run-tenant-leak.sh 2>&1 | tail -10
```

Expected: 9 files pass.

- [ ] **Step 5: No commit (verification-only task)**

---

## Self-review

**1. Spec coverage**

Mapping spec requirements → tasks:

| Spec                                                                        | Task(s)                                                |
| --------------------------------------------------------------------------- | ------------------------------------------------------ |
| §2 in-scope: 3 new components (kind-pill-map, pill-badge, pill-task-slider) | Tasks 5–7                                              |
| §2 in-scope: BDP layout drops TaskBanner                                    | Task 10                                                |
| §2 in-scope: 4 pill pages mount PillTaskSlider                              | Task 11                                                |
| §2 in-scope: BdpTabs adds per-pill badge                                    | Task 8                                                 |
| §2 in-scope: BudgetCard corner badge                                        | Task 9                                                 |
| §2 in-scope: API extends `/budgets/active` with `pendingTasksCount`         | Tasks 2, 3                                             |
| §2 in-scope: i18n 9 strings                                                 | Task 12                                                |
| §2 in-scope: unit + component + integration + tenant-leak + E2E tests       | Tasks 1, 3, 5, 6, 7, 8, 9, 12, 14                      |
| §2 in-scope: delete task-banner.tsx + test                                  | Task 16                                                |
| §4 Architecture: shared React-Query key drives all 4 BDP surfaces           | Tasks 7, 8 (both use `["tasks", budgetId, "pending"]`) |
| §5.4 backend: LEFT JOIN aggregate, COALESCE(\_, 0), RLS-scoped              | Task 2                                                 |
| §6.2 hydration via initialTasks prop                                        | Tasks 10, 11 (RSC fetches, passes as prop)             |
| §7 error handling: silent degrade, RSC fallback `[]`                        | Tasks 7, 11                                            |
| §9.4 tenant-leak gate 8→9                                                   | Tasks 1, 15                                            |
| §9.5 E2E rewrite                                                            | Task 14                                                |
| §9.6 Page Objects                                                           | Task 13                                                |
| §10 TDD order                                                               | Tasks 1–18 follow red→green                            |
| §11 Migration: single PR, no flag, web rebuild                              | Task 18                                                |
| §11 Migration: Phase 7 UAT forward-pointer                                  | Task 17                                                |

All 13 decisions (D1–D13) implemented: D1/D5 via kind-pill-map + page mounts; D2 via PillTaskSlider null-return; D3/D11 via PillBadge; D4/D9/D13 via API change + home pass-through; D6 via no page-routing change; D7 via PillTaskSlider initial-state logic; D8 via generic kindsFor("settings") === []; D10 via shared query key; D12 via new component files.

**2. Placeholder scan**

No "TBD", "TODO", "implement later", or vague handwaving. Every code step has the full code. Every test step has the full test body. Commands are exact.

One soft area worth flagging during execution: Task 3 step 1 instructs to locate the existing `budgets-active` test (or create one) — this is conditional on what's in the repo at execution time. The fallback (create following `tasks.test.ts` pattern) is explicit.

**3. Type consistency**

- `Pill` type defined in `kind-pill-map.ts` is used by all consumers (`PillBadge` — none required; `PillTaskSlider` — props; `BdpTabs` — TABS slug type; `BdpTabsPo` / `PillTaskSliderPo` — Po constructor).
- `TaskKind` continues to be exported from `task-banner-row.tsx` — unchanged.
- `TaskSummary` continues to be exported from `task-banner-row.tsx` — unchanged.
- `BudgetSummary.pendingTasksCount` added in Task 4 and consumed in Task 9. ✓
- `BudgetDTO.pendingTasksCount` added in Task 2 (backend port) — consumed by the route handler in `/budgets/active` (no change required to the handler; it `return c.json({ budgets: memberships })` and `memberships` is the BudgetDTO array). ✓

No inconsistencies found.

---

## Execution handoff

Plan complete and saved to `docs/superpowers/plans/2026-06-01-tasks-redesign.md`. Two execution options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?

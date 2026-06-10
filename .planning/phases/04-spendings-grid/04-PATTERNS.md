# Phase 4: Spendings Grid - Pattern Map

**Mapped:** 2026-05-13
**Files analyzed:** 27 (10 new client components + 6 hooks + 4 backend routes + 3 application services + 2 ports + 1 repo extension + 1 migration + 1+ BDD feature)
**Analogs found:** 27 / 27 (100% coverage — every new file has a clean in-repo analog from Phases 1–3)

## File Classification

### Client UI (Next.js App Router under `apps/web`)

| New/Modified File                                                            | Role                                                      | Data Flow                                    | Closest Analog                                                                                                   | Match                                  |
| ---------------------------------------------------------------------------- | --------------------------------------------------------- | -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| `apps/web/src/app/[locale]/(app)/budgets/[id]/spendings/page.tsx`            | RSC page shell                                            | request-response (SSR fetch → client island) | `apps/web/src/app/[locale]/(app)/budgets/[id]/layout.tsx`                                                        | exact                                  |
| `apps/web/src/components/budgeting/spendings-grid/spendings-grid-client.tsx` | client island, host of DndContext + QueryClient consumers | event-driven                                 | `apps/web/src/components/budgeting/task-banner.tsx`                                                              | role-match (RSC→client island handoff) |
| `apps/web/src/components/budgeting/spendings-grid/column-header.tsx`         | client component (sortable item interior)                 | event-driven                                 | `apps/web/src/components/budgeting/task-banner-row.tsx` + `bdp-tabs.tsx`                                         | role-match                             |
| `apps/web/src/components/budgeting/spendings-grid/category-column.tsx`       | client component (sortable wrapper)                       | event-driven                                 | `apps/web/src/components/budgeting/bdp-tabs.tsx`                                                                 | role-match                             |
| `apps/web/src/components/budgeting/spendings-grid/add-category-column.tsx`   | client component (Sheet trigger)                          | event-driven                                 | `apps/web/src/components/budgeting/budget-switcher.tsx` (sheet/popover trigger)                                  | role-match                             |
| `apps/web/src/components/budgeting/spendings-grid/transaction-row.tsx`       | client component (inline-edit + reveal-on-click)          | event-driven                                 | `apps/web/src/components/budgeting/transaction-row-client.tsx` (being deleted — extract idioms only)             | role-match                             |
| `apps/web/src/components/budgeting/spendings-grid/draft-row.tsx`             | client component (reveal options)                         | event-driven                                 | `apps/web/src/components/budgeting/pending-drafts-inbox.tsx` (being deleted — extract Confirm/Dismiss UX idioms) | role-match                             |
| `apps/web/src/components/budgeting/spendings-grid/quick-entry-input.tsx`     | client component (numeric input + mutate)                 | request-response                             | `apps/web/src/components/budgeting/transaction-capture-form.tsx` (BinancePlex 40px Input idioms)                 | role-match                             |
| `apps/web/src/components/budgeting/spendings-grid/month-navigator.tsx`       | client component (URL state + keyboard)                   | event-driven                                 | `apps/web/src/components/budgeting/bdp-tabs.tsx` (Next.js navigation pattern)                                    | role-match                             |
| `apps/web/src/components/budgeting/spendings-grid/reveal-actions.tsx`        | client helper hook + wrapper                              | event-driven                                 | `apps/web/src/components/budgeting/task-banner.tsx` (Escape + outside-click handler)                             | role-match                             |
| `apps/web/src/components/budgeting/transaction-slider.tsx`                   | client component (Sheet form)                             | request-response                             | `apps/web/src/components/budgeting/transaction-capture-sheet.tsx` (being deleted — extract Sheet wrapping idiom) | exact (Sheet pattern)                  |
| `apps/web/src/components/budgeting/category-slider.tsx`                      | client component (Sheet form)                             | request-response                             | `apps/web/src/components/budgeting/category-form-sheet.tsx`                                                      | exact                                  |
| `apps/web/src/components/budgeting/fields/amount-input.tsx`                  | extracted primitive                                       | none                                         | `apps/web/src/components/budgeting/transaction-capture-form.tsx` (lines around BinancePlex Amount)               | exact (extract-and-rehome)             |
| `apps/web/src/components/budgeting/fields/date-input.tsx`                    | extracted primitive                                       | none                                         | same source                                                                                                      | exact (extract-and-rehome)             |
| `apps/web/src/components/budgeting/fields/fx-preview-line.tsx`               | extracted primitive                                       | request-response                             | same source                                                                                                      | exact (extract-and-rehome)             |
| `apps/web/src/lib/idempotency.ts`                                            | utility                                                   | none                                         | duplicated `generateIdempotencyKey()` in both `transaction-capture-form.tsx` & `transaction-edit-form.tsx`       | exact (extract-and-rehome)             |

### Hooks (client cache + mutations)

| New File                                       | Role                                   | Data Flow        | Closest Analog                                                                                                                                                                               | Match      |
| ---------------------------------------------- | -------------------------------------- | ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| `apps/web/src/hooks/use-reorder-categories.ts` | TanStack mutation (optimistic)         | request-response | `apps/web/src/components/budgeting/task-banner.tsx` (useQuery + invalidate) — **closest mutation analog is none in repo**; use TanStack-Query docs pattern citationed in RESEARCH §Pattern 2 | role-match |
| `apps/web/src/hooks/use-create-transaction.ts` | TanStack mutation (optimistic + retry) | request-response | same as above                                                                                                                                                                                | role-match |
| `apps/web/src/hooks/use-confirm-draft.ts`      | TanStack mutation                      | request-response | same as above                                                                                                                                                                                | role-match |
| `apps/web/src/hooks/use-dismiss-draft.ts`      | TanStack mutation                      | request-response | same as above                                                                                                                                                                                | role-match |
| `apps/web/src/hooks/use-month-param.ts`        | URL state hook                         | none             | `apps/web/src/components/budgeting/bdp-tabs.tsx` (usePathname pattern, no equivalent useSearchParams hook in repo yet)                                                                       | partial    |
| `apps/web/src/hooks/use-spendings-summary.ts`  | TanStack query                         | request-response | `apps/web/src/components/budgeting/task-banner.tsx` (useQuery + initialData from RSC)                                                                                                        | exact      |

### Backend (Hono routes — `apps/api`)

| New/Modified File                                 | Role                                                                    | Data Flow                        | Closest Analog                                                                                          | Match |
| ------------------------------------------------- | ----------------------------------------------------------------------- | -------------------------------- | ------------------------------------------------------------------------------------------------------- | ----- |
| `apps/api/src/routes/categories.ts` (EXTEND)      | Hono route factory — add `PUT /:budgetId/sort-order`                    | request-response (DB write)      | self (`PATCH /:id` rename handler — same shape) + `apps/api/src/routes/budgets.ts` (`zValidator` usage) | exact |
| `apps/api/src/routes/recurring-rules.ts` (EXTEND) | Hono route factory — add `POST /drafts/:draftId/dismiss`                | request-response (DB write)      | self (existing `DELETE /:id` soft-delete handler)                                                       | exact |
| `apps/api/src/routes/spendings-summary.ts` (NEW)  | Hono route factory — `GET /budgets/:budgetId/spendings-summary?month=…` | request-response (composed read) | `apps/api/src/routes/categories.ts` + composition mirror of `get-budget-home-summary.ts`                | exact |
| `apps/api/src/app.ts` (EXTEND)                    | route mounting                                                          | none                             | self (existing `app.route("/budgets/:budgetId/tasks", …)` mount at line 77)                             | exact |

### Backend (application services + ports — `packages/budgeting`)

| New/Modified File                                                                          | Role                                              | Data Flow    | Closest Analog                                                                                               | Match                           |
| ------------------------------------------------------------------------------------------ | ------------------------------------------------- | ------------ | ------------------------------------------------------------------------------------------------------------ | ------------------------------- |
| `packages/budgeting/src/application/reorder-categories.ts`                                 | application service                               | CRUD (write) | `packages/budgeting/src/application/rename-category.ts` (single repo call wrapped in `Result`)               | exact                           |
| `packages/budgeting/src/application/dismiss-draft.ts`                                      | application service                               | CRUD (write) | `packages/budgeting/src/application/skip-recurring-draft.ts`                                                 | exact (same domain, same shape) |
| `packages/budgeting/src/application/get-spendings-summary.ts`                              | application service (composed read)               | CRUD (read)  | `packages/budgeting/src/application/get-budget-home-summary.ts`                                              | **exact**                       |
| `packages/budgeting/src/ports/category-repo.ts` (EXTEND)                                   | port interface — add `reorder()`                  | none         | self (existing `rename()` signature)                                                                         | exact                           |
| `packages/budgeting/src/ports/transaction-repo.ts` (EXTEND)                                | port interface — add `spendByCategoryForMonth()`  | none         | `packages/budgeting/src/ports/budget-home-summary-repo.ts` (`sumCurrentMonthSpend`)                          | exact                           |
| `packages/budgeting/src/adapters/persistence/category-repo.ts` (EXTEND)                    | Drizzle adapter — `reorder()` SQL                 | CRUD         | self (existing `rename()` method — same `withTenantTx → SQL → writeAudit → writeOutbox` pipeline)            | exact                           |
| `packages/budgeting/src/adapters/persistence/transaction-repo.ts` (EXTEND)                 | Drizzle adapter — `spendByCategoryForMonth()` SQL | CRUD (read)  | `packages/budgeting/src/adapters/persistence/budget-home-summary-repo.ts` (`topOverspentCategories` SQL CTE) | exact                           |
| `packages/budgeting/src/adapters/persistence/expense-ledger-draft-repo.ts` (VERIFY/EXTEND) | Drizzle adapter — `dismiss()`                     | CRUD         | self (existing methods in this file)                                                                         | exact                           |

### DB + Tests

| New/Modified File                                                                      | Role                       | Closest Analog                                                                    |
| -------------------------------------------------------------------------------------- | -------------------------- | --------------------------------------------------------------------------------- |
| `packages/platform/migrations/00NN_expense_ledger_dismissed_at.sql` (NEW, conditional) | migration                  | existing `categories.sort_index` migration (MIG-07, per `categories-schema.ts:9`) |
| `packages/budgeting/src/adapters/persistence/expense-ledger-draft-schema.ts` (EXTEND)  | schema add column          | `categories-schema.ts` (showing how MIG-07 added `sort_index`)                    |
| `apps/api/test/routes/spendings-summary.test.ts` (NEW)                                 | integration test           | `apps/api/test/routes/categories.test.ts`                                         |
| `apps/api/test/routes/categories-sort-order.test.ts` (NEW)                             | integration test           | same                                                                              |
| `apps/api/test/routes/recurring-drafts.test.ts` (EXTEND)                               | integration test (dismiss) | self                                                                              |
| `apps/web/test/components/spendings-grid/*.test.tsx` (NEW)                             | Vitest component           | `apps/web/test/components/fx-freshness-badge.test.tsx`                            |
| `tests/e2e/features/spendings/*.feature` (NEW)                                         | Gherkin scenarios          | `tests/e2e/features/budget/create-transaction.feature`                            |
| `tests/e2e/pages/SpendingsPage.ts` (NEW)                                               | Page Object                | `tests/e2e/pages/TransactionsPage.ts`                                             |
| `tests/e2e/steps/spendings.steps.ts` (NEW)                                             | step bindings              | `tests/e2e/steps/budget.steps.ts`                                                 |

---

## Pattern Assignments

### `spendings/page.tsx` (RSC page shell, request-response)

**Analog:** `apps/web/src/app/[locale]/(app)/budgets/[id]/layout.tsx` (the BDP layout — only existing in-repo example of an RSC that fetches via `serverApiFetch(budgetId, …)` then renders a client island)

**Imports + Props shape** (`layout.tsx:1-29`):

```typescript
import { redirect } from "next/navigation";
import { serverApiFetch } from "@/lib/budget-fetch.server";
import { BdpTabs } from "@/components/budgeting/bdp-tabs";
import { TaskBanner } from "@/components/budgeting/task-banner";

interface BdpLayoutProps {
  children: React.ReactNode;
  params: Promise<{ locale: string; id: string }>;
}
```

**Parallel server fetch pattern** (mirror this — RESEARCH §1010 specifies 4 parallel fetches: `/categories`, `/transactions?month=…`, `/spendings-summary?month=…`, `/transactions?month=…&confirmed=false` for drafts):

```typescript
// Pattern: pass `budgetId` as first arg so X-Budget-ID header gets set automatically
const activeRes = await serverApiFetch(null, "/budgets/active");
// ...later:
const initialTasks = await fetchInitialTasks(id);
// fetchInitialTasks does:
//   const res = await serverApiFetch(budgetId, `/budgets/${budgetId}/tasks?status=pending`);
//   if (!res.ok) return [];
//   return ((await res.json()) as { tasks?: TaskSummary[] }).tasks ?? [];
```

**Critical pitfall guard** (layout.tsx:22-23 comment): "every `/budgets/{id}/...` fetch passes `id` as the serverApiFetch first arg so X-Budget-ID is set (T-03-06-08)". Apply verbatim to spendings page.

**`searchParams` for `?month=YYYY-MM`** — Next.js App Router RSC signature: `params: Promise<{...}>; searchParams: Promise<{ month?: string }>;`. Mirror the `params: Promise<…>` shape verbatim (Next 15+ async params).

---

### `spendings-grid-client.tsx` (client island, event-driven)

**Analog:** `apps/web/src/components/budgeting/task-banner.tsx` — only existing example of RSC initial-data → client island with TanStack Query handoff.

**File header + imports** (`task-banner.tsx:1-12`):

```typescript
"use client";

import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { AlertCircle, ChevronDown, ChevronUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { clientApiFetch } from "@/lib/budget-fetch";
```

**RSC→client initial-data handoff** (`task-banner.tsx:43-56`):

```typescript
const { data: tasks } = useQuery({
  queryKey: ["tasks", budgetId, "pending"],
  initialData: initialTasks, // ← from RSC server fetch
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
```

Spendings grid uses identical shape with query keys `["spendings-summary", budgetId, month]`, `["transactions", budgetId, month]`, `["drafts", budgetId, month]` and `initialData` from the four RSC-fetched payloads.

**Tab-revisible invalidation** (`task-banner.tsx:59-69`) — same pattern applies after a quick-entry POST settles (RESEARCH §Pattern 2 onSettled invalidates `spendings-summary`).

**DndContext wrap** — RESEARCH §Pattern 1 (lines 513-581) gives the verbatim dnd-kit shape; bind it inside this client island.

---

### `transaction-slider.tsx` & `category-slider.tsx` (request-response)

**Analog:** `apps/web/src/components/ui/sheet.tsx` — Radix Dialog wrapper already imported by Phase 2 components.

**Sheet wrapping idiom** (`sheet.tsx:38-39`):

```typescript
right: "inset-y-0 right-0 h-full w-3/4 border-l data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right sm:max-w-sm",
```

Both sliders use `<Sheet><SheetContent side="right" className="w-full sm:max-w-[480px]">…` per D-PH4-S3 (480px desktop, full-screen mobile).

**Form composition** — extract field primitives from `transaction-capture-form.tsx` lines 184-216 (AmountInput, DateInput, FxPreviewLine) into `apps/web/src/components/budgeting/fields/`, then compose inside both sliders. CONTEXT D-PH4-S2 names the field components verbatim.

---

### `column-header.tsx` (event-driven, sortable item interior)

**Analog:** `apps/web/src/components/budgeting/bdp-tabs.tsx` — the pill-tab pattern (yellow active state, focus ring, hover surface) is the visual idiom to reuse.

**Active/hover styling** (`bdp-tabs.tsx:64-70`):

```typescript
"inline-flex h-9 items-center gap-2 rounded-[var(--radius-pill)] px-4 transition-colors",
"focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--info)]",
"min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0",
active
  ? "bg-[var(--primary)] text-[var(--on-primary)] text-sm font-semibold"
  : "text-[var(--muted-foreground)] hover:bg-[var(--surface-elevated-dark)] hover:text-[var(--body-on-dark)]",
```

**NB: bdp-tabs uses `hover:` for visual surface contrast — that is allowed.** The D-PH4-INT1 "no hover" rule applies only to **action reveals** (icons, dropdowns). Surface tint on hover stays.

**`useSortable` shape** — RESEARCH §Pattern 1 lines 550-580 gives the verbatim binding. Pen-icon reveal uses `useRevealActions` (see Shared Patterns below).

---

### `categories.ts` route EXTEND — `PUT /:budgetId/sort-order` (request-response, CRUD)

**Analog:** `apps/api/src/routes/categories.ts` lines 115-135 (existing `PATCH /:id` rename — same Hono Result-shape pattern) plus `apps/api/src/routes/budgets.ts` lines 21-43 for `zValidator` usage.

**Handler skeleton to copy** (categories.ts:115-135):

```typescript
// PATCH /categories/:id — rename
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

**Adapt for sort-order:**

```typescript
// PUT /budgets/:budgetId/categories/sort-order — reorder
const reorderSchema = z.object({
  orderedIds: z.array(z.string().uuid()).min(1),
});
app.put(
  "/:budgetId/sort-order",
  zValidator("json", reorderSchema),
  async (c) => {
    const tenantId = pickTenant(c);
    const userId = (c.get("userId") as string) ?? c.get("session")?.user?.id;
    const { budgetId } = c.req.param();
    if (budgetId !== tenantId) return c.json({ error: "tenant_mismatch" }, 403);
    const { orderedIds } = c.req.valid("json");
    const r = await deps.budgeting.reorderCategories({
      tenantId,
      budgetId,
      orderedIds,
      actorUserId: userId,
    });
    if (r.isErr()) return serverError(c, "reorder_categories_failed", r.error);
    return c.body(null, 204);
  },
);
```

**`pickTenant` helper** (categories.ts:13-16) — copy verbatim; do not re-invent tenant extraction.

**Mounting** — `app.ts:97` already mounts `createCategoriesRoute(deps)` at `/categories`. Per RESEARCH, sort-order mount path is `/budgets/:budgetId/categories/sort-order`, so it needs its own mount line — see Mount Pattern below.

---

### `spendings-summary.ts` route (NEW; composed read)

**Analog routing skeleton:** `apps/api/src/routes/categories.ts` (factory + Hono shape).

**Analog application service:** `packages/budgeting/src/application/get-budget-home-summary.ts` — same composition pattern (5 parallel `Promise.all` reads → DTO assembly).

**Skeleton copy from `get-budget-home-summary.ts` lines 93-134:**

```typescript
export function getSpendingsSummary(deps: GetSpendingsSummaryDeps) {
  return async (input: GetSpendingsSummaryInput): Promise<Result<SpendingsSummaryDTO, Error>> => {
    try {
      const meta = await deps.summaryRepo.getBudgetMeta(input.budgetId);
      if (!meta) return err(new Error("budget_not_found"));

      const monthStart = /* Temporal-derived UTC month start */;
      const monthEnd = /* +1 month */;

      const [categories, perCatSpend, effectiveLimits, reserveBalances] = await Promise.all([
        deps.categoryRepo.list(input.tenantId, /*includeArchived*/ false),
        deps.transactionRepo.spendByCategoryForMonth(input.tenantId, input.budgetId, monthStart, monthEnd),
        deps.categoryLimitRepo.effectiveForMonth(input.tenantId, input.budgetId, monthStart),
        deps.reserveBalanceRepo.getForBudget(input.budgetId, input.tenantId),
      ]);
      // … per-category aggregation per RESEARCH §3 line 417-435
      return ok({ /* DTO per RESEARCH §3 jsonc */ });
    } catch (e) { return err(e as Error); }
  };
}
```

**SCD-2 SQL pattern** — `budget-home-summary-repo.ts:153-189` (the `WITH spent AS …, limits AS …` CTE) is the verbatim SQL pattern for both `spendByCategoryForMonth` and `effectiveForMonth`. The `effective_from <= $monthStart AND (effective_to IS NULL OR effective_to > $monthStart)` predicate at lines 174-176 is mandatory; do not deviate.

**`withTenantTx` envelope** (`budget-home-summary-repo.ts:54-67`):

```typescript
const r = await withTenantTx(
  TenantId(budgetId),
  UserId(SYSTEM_USER_ID), // "00000000-0000-0000-0000-000000000001" for read-only
  async (tx) => {
    const drizzleTx = tx as DrizzleTx;
    const res = await drizzleTx.execute(
      sql`SELECT … FROM tenancy.budgets WHERE id = ${budgetId}::uuid LIMIT 1`,
    );
    return res.rows[0] ?? null;
  },
);
if (r.isErr()) throw r.error;
```

Wraps every SELECT so RLS GUC is set. Constant `SYSTEM_USER_ID` at line 38.

---

### `recurring-rules.ts` route EXTEND — `POST /drafts/:draftId/dismiss`

**Analog:** existing `DELETE /:id` handler in `recurring-rules.ts:176-191` (same Result pattern, same `pickTenant`).

```typescript
// POST /recurring-rules/drafts/:draftId/dismiss
app.post("/drafts/:draftId/dismiss", async (c) => {
  const draftId = c.req.param("draftId");
  const tenantId = pickTenant(c);
  const userId = (c.get("userId") as string) ?? c.get("session")?.user?.id;
  const r = await deps.budgeting.dismissDraft({
    tenantId,
    draftId,
    actorUserId: userId,
  });
  if (r.isErr()) {
    const e = r.error as { kind?: string; message: string };
    if (e.kind === "DraftNotFound")
      return c.json({ error: "not_found", message: e.message }, 404);
    if (e.kind === "AlreadyConfirmed")
      return c.json({ error: "already_confirmed", message: e.message }, 409);
    return c.json({ error: e.message }, 422);
  }
  return c.body(null, 204);
});
```

---

### `reorder-categories.ts` application service (NEW)

**Analog:** `packages/budgeting/src/application/rename-category.ts` — same single-repo-call + `Result` shape. Also `create-category.ts` for the imports surface.

**Imports + signature pattern** (`create-category.ts:1-21`):

```typescript
import { ok, err, type Result } from "@budget/shared-kernel";
import type { CategoryRepo } from "../ports/category-repo";

export interface ReorderCategoriesDeps {
  repo: CategoryRepo;
}
export interface ReorderCategoriesInput {
  tenantId: string;
  budgetId: string; // == tenantId per v1.1 invariant; verify equality
  orderedIds: string[];
  actorUserId: string;
}

export function reorderCategories(deps: ReorderCategoriesDeps) {
  return async (
    input: ReorderCategoriesInput,
  ): Promise<Result<void, Error>> => {
    // 1. validate all orderedIds belong to budget (single repo round-trip)
    // 2. delegate to repo.reorder() — one-tx UPDATE
    try {
      await deps.repo.reorder(
        input.tenantId,
        input.budgetId,
        input.orderedIds,
        input.actorUserId,
      );
      return ok(undefined);
    } catch (e) {
      return err(e as Error);
    }
  };
}
```

---

### `category-repo.ts` adapter EXTEND — `reorder()` method (Drizzle, CRUD write)

**Analog:** `packages/budgeting/src/adapters/persistence/category-repo.ts` existing `rename()` method (lines 168-204) — verbatim pattern of `withTenantTx → SQL → writeAudit → writeOutbox` (file header line 4: "Each write: withTenantTx → SQL → writeAudit → writeOutbox").

**Imports** (`category-repo.ts:7-11`):

```typescript
import { sql } from "drizzle-orm";
import { withTenantTx, writeAudit, writeOutbox } from "@budget/platform";
import { TenantId, UserId } from "@budget/shared-kernel";
import type { Category } from "../../domain/category";
import type { CategoryRepo } from "../../ports/category-repo";
```

**Method shape** (mirror of `rename()` at lines 168-204):

```typescript
async reorder(
  tenantId: string,
  budgetId: string,
  orderedIds: string[],
  actorUserId: string,
): Promise<void> {
  const tid = TenantId(tenantId);
  const uid = UserId(actorUserId);

  const r = await withTenantTx(tid, uid, async (tx) => {
    // RESEARCH §4 line 444 — VALUES-table single-pass UPDATE
    // Build a parameterized VALUES list — use drizzle sql.join for the rows
    const rows = orderedIds.map((id, idx) => sql`(${id}::uuid, ${idx})`);
    await tx.execute(
      sql`UPDATE budgeting.categories
            SET sort_index = data.idx
           FROM (VALUES ${sql.join(rows, sql`, `)}) AS data(id, idx)
          WHERE categories.id = data.id
            AND categories.tenant_id = ${tenantId}::uuid`,
    );

    await writeAudit(tx, {
      tenantId: tid, entityType: "category", entityId: budgetId,
      action: "update", actorUserId: uid,
      before: null, after: { orderedIds },
    });

    await writeOutbox(tx, {
      tenantId: tid, aggregateType: "category", aggregateId: budgetId,
      eventType: "budgeting.category.reordered",
      payload: { orderedIds, actorUserId },
    });
  });

  if (r.isErr()) throw r.error;
}
```

**Critical:** `audit` + `outbox` writes are mandatory per the file header rule. Do NOT skip them — phase 1 enforces append-only ledger semantics.

---

### `categories-schema.ts` extension (if `icon` + `color` columns missing)

**Analog:** `categories-schema.ts:9` showing how migration 0012 added `sort_index`:

```typescript
// v1.1 changes (migration 0012):
//   - DROP scope column (D-13: redundant with budget-level visibility)
//   - ADD sort_index INTEGER NOT NULL DEFAULT 0 (MIG-07; UI drag-reorder in Phase 4)
```

If Plan 04 needs to add `icon TEXT` + `color TEXT`, mirror this header comment + add to the Drizzle table def. The migration file follows the same template.

---

### `expense_ledger_dismissed_at` migration (NEW, conditional)

**Analog:** the `sort_index` migration pattern referenced by `categories-schema.ts:9`. Look up the actual SQL file in `packages/platform/migrations/` (file naming follows numeric prefix). Pattern: `ALTER TABLE budgeting.expense_ledger ADD COLUMN IF NOT EXISTS dismissed_at TIMESTAMPTZ DEFAULT NULL;` plus a partial index if `WHERE dismissed_at IS NULL` queries are hot.

---

### `app.ts` route mount EXTEND

**Analog:** `apps/api/src/app.ts:77` — mounting a sub-router with a parameterized prefix:

```typescript
app.route("/budgets/:budgetId/tasks", createTasksRoute(deps));
```

Lines 84-94 show the `requireAuth + requireWorkspace` middleware fence for budget-scoped paths. Add `/spendings-summary/*` to that array and mount:

```typescript
app.use("/spendings-summary/*", requireAuth, requireWorkspace);
app.route(
  "/budgets/:budgetId/spendings-summary",
  createSpendingsSummaryRoute(deps),
);
app.route("/budgets/:budgetId/categories", createCategoriesRoute(deps)); // for /sort-order subroute
app.route(
  "/budgets/:budgetId/recurring-rules",
  createRecurringRulesRoute(deps),
); // for /drafts/:id/dismiss
```

Caveat: existing mounts at lines 97, 103 mount without `/budgets/:budgetId/` prefix. Phase 4 may need EITHER:

- (a) re-mount under the budget-scoped prefix (cleaner; matches `/budgets/:budgetId/tasks` precedent), or
- (b) keep current root mount and route the new handlers at root (e.g., `PUT /categories/:budgetId/sort-order`).
  **Recommendation: (a)** to match Phase 3's `/budgets/:budgetId/tasks` precedent — planner decides.

---

### Tests

#### `apps/api/test/routes/spendings-summary.test.ts` (integration)

**Analog:** `apps/api/test/routes/categories.test.ts` — verbatim harness pattern.

**Imports + DB-URL hack** (`categories.test.ts:5-12`):

```typescript
import { describe, it, expect, beforeAll } from "bun:test";
import { Hono } from "hono";

const DB_URL_RAW = process.env.DATABASE_URL_APP;
if (!DB_URL_RAW)
  throw new Error("DATABASE_URL_APP required for integration tests");
process.env.DATABASE_URL_APP = DB_URL_RAW.replace("@db:", "@localhost:");
const DB_URL = process.env.DATABASE_URL_APP;
```

**Fixture user + tenant** (`categories.test.ts:17-37`) — copy `createTestUser()` verbatim.

**`buildApp()` factory** (`categories.test.ts:39-80`) — copy pattern (dynamic imports of all repos + application services, wire into `BootedDeps`, then `c.set("tenantIds", [tenantId])` middleware). Phase 4 wires `summaryRepo`, `categoryRepo`, `categoryLimitRepo`, `transactionRepo`, `reserveBalanceRepo`, plus `getSpendingsSummary(deps)`.

#### Vitest component tests under `apps/web/test/components/spendings-grid/`

**Analog:** `apps/web/test/components/fx-freshness-badge.test.tsx` — Vitest + RTL + happy-dom shape.

**Imports + mock pattern** (`fx-freshness-badge.test.tsx:1-23`):

```typescript
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { FxFreshnessBadge } from "../../src/components/budgeting/fx-freshness-badge";

vi.mock("next-intl", () => ({
  useFormatter: () => ({ relativeTime: (_d, _n) => "2 hours ago" }),
  useTranslations:
    (_ns: string) => (key: string, params?: Record<string, unknown>) => {
      if (key === "freshnessBadge" && params?.age) return `rate ${params.age}`;
      return key;
    },
}));
```

For `QuickEntryInput`, also mock `@tanstack/react-query` (`useMutation` returning `{ mutate, status: 'idle' }`) and `@/lib/budget-fetch` (`vi.mock("@/lib/budget-fetch", () => ({ clientApiFetch: vi.fn() }))`).

For dnd-kit-using components, mock `@dnd-kit/sortable` `useSortable` to return inert refs/listeners — see dnd-kit docs (citationed by RESEARCH §Pattern 1).

#### E2E feature `tests/e2e/features/spendings/`

**Analog:** `tests/e2e/features/budget/create-transaction.feature` — minimal Gherkin shape, `@phase2` tag.

**Verbatim format**:

```gherkin
@phase4
Feature: Quick-entry expense from spendings grid

  Scenario: User adds a PLN expense by typing into the Groceries column
    Given I am signed in as a fresh user with workspace "Family"
    And the budget "Family" has a category "Groceries" with planned 200.00 PLN
    When I open the Spendings tab
    And I type "12.50" into the Groceries quick-entry input
    And I press Enter
    Then I see a transaction row "12.50" in the Groceries column
    And the column header "balance" cell shows "187.50"
```

Use `@phase4` tag uniformly (matches `@phase2` precedent in `create-transaction.feature:1`).

#### `tests/e2e/pages/SpendingsPage.ts` (Page Object)

**Analog:** `tests/e2e/pages/TransactionsPage.ts` — verbatim class shape.

**Class skeleton** (`TransactionsPage.ts:1-25`):

```typescript
import { expect, type Page, type Locator } from "@playwright/test";

export class SpendingsPage {
  constructor(private readonly page: Page) {}
  async goto(locale = "en", budgetId: string): Promise<void> {
    await this.page.goto(`/${locale}/budgets/${budgetId}/spendings`);
  }
  quickEntryInput(categoryName: string): Locator {
    return this.page.getByTestId(`quick-entry-${categoryName.toLowerCase()}`);
  }
  // … one locator-getter per UI-SPEC primitive
}
```

`getByTestId` is the dominant locator strategy across `TransactionsPage` — Phase 4 follows suit (every primitive in UI-SPEC §Component contracts exposes a `data-testid`).

#### `tests/e2e/steps/spendings.steps.ts` (step bindings)

**Analog:** `tests/e2e/steps/budget.steps.ts` — `createBdd(test)` + Given/When/Then registration, fresh-user-per-scenario via `createFreshUser`.

**Header** (`budget.steps.ts:1-15`):

```typescript
import { expect } from "@playwright/test";
import { createBdd } from "playwright-bdd";
import { test } from "../fixtures/index.js";
import { TransactionsPage } from "../pages/TransactionsPage.js";
import { createFreshUser } from "../fixtures/freshUser.js";

const { Given, When, Then } = createBdd(test);
```

Per memory `E2E Tests Always Use Gherkin (playwright-bdd) + Page Objects` — no raw `.spec.ts` allowed.

---

## Shared Patterns

### Authentication / Tenant Resolution

**Source:** `apps/api/src/routes/categories.ts:13-16` (`pickTenant` helper) + `apps/api/src/app.ts:84-94` (`requireAuth + requireWorkspace` middleware fence).

**Apply to:** Every new backend route file (`spendings-summary.ts`, extensions in `categories.ts` and `recurring-rules.ts`).

```typescript
function pickTenant(c: any): string {
  const ids = c.get("tenantIds") as string[] | undefined;
  return ids?.[0] ?? "";
}
// …
const tenantId = pickTenant(c);
const userId = (c.get("userId") as string) ?? c.get("session")?.user?.id;
```

**Critical:** tenantGuard sets `tenantIds` PLURAL (memory entry 1855). Never read `c.get("tenantId")` (singular) — it returns undefined.

**Mount-level fence:** every new route prefix MUST appear in the `app.ts:84-94` middleware loop.

---

### Error Handling — `Result<T, Error>` + `serverError()`

**Source:** `@budget/shared-kernel` (`ok`, `err`, `Result` exports) + `apps/api/src/middleware/server-error.ts` (referenced at `categories.ts:8`).

**Apply to:** Every new application service + every new route handler.

**Application service shape** (`create-category.ts:18-67`):

```typescript
export function reorderCategories(deps: Deps) {
  return async (input: Input): Promise<Result<void, Error>> => {
    try {
      /* … */ return ok(undefined);
    } catch (e) {
      return err(e as Error);
    }
  };
}
```

**Route handler shape** (`categories.ts:30-67`):

```typescript
const r = await deps.budgeting.reorderCategories({ … });
if (r.isErr()) {
  const errAny = r.error as any;
  const code = errAny?.cause?.code ?? errAny?.code;
  // map known PG codes/constraints to 4xx
  return serverError(c, "reorder_categories_failed", r.error);  // sanitizes raw SQL
}
return c.json(r.value, 200);
```

Never leak raw drizzle/PG errors — `serverError()` exists for that (categories.ts:65 comment: "Sanitize any other internal failure — never leak raw SQL/Drizzle errors.").

---

### Drizzle Adapter — Write Pipeline (`withTenantTx → SQL → audit → outbox`)

**Source:** `packages/budgeting/src/adapters/persistence/category-repo.ts:1-5` (file header) + every method in that file.

**Apply to:** Every new write method on existing or new repo adapters (`reorder()`, `dismiss()`).

```typescript
const r = await withTenantTx(
  TenantId(tenantId),
  UserId(actorUserId),
  async (tx) => {
    await tx.execute(sql`UPDATE … WHERE tenant_id = ${tenantId}::uuid`);
    await writeAudit(tx, {
      tenantId,
      entityType,
      entityId,
      action,
      actorUserId,
      before,
      after,
    });
    await writeOutbox(tx, {
      tenantId,
      aggregateType,
      aggregateId,
      eventType,
      payload,
    });
  },
);
if (r.isErr()) throw r.error;
```

**Audit + outbox are NOT optional.** Append-only ledger semantics (CLAUDE.md "Append-only ledger; versioned audit table") + outbox pattern for cross-context events.

---

### Drizzle Adapter — Read Pipeline (`withTenantTx` + `SYSTEM_USER_ID`)

**Source:** `packages/budgeting/src/adapters/persistence/budget-home-summary-repo.ts:38, 54-67`.

**Apply to:** `transactionRepo.spendByCategoryForMonth()`, all read SQL in `spendings-summary` service.

```typescript
const SYSTEM_USER_ID = "00000000-0000-0000-0000-000000000001";
const r = await withTenantTx(
  TenantId(budgetId),
  UserId(SYSTEM_USER_ID),
  async (tx) => {
    const drizzleTx = tx as DrizzleTx;
    const res = await drizzleTx.execute(
      sql`SELECT … WHERE tenant_id = ${budgetId}::uuid`,
    );
    return res.rows;
  },
);
```

**`::date`, `::uuid`, `::text` casts** mandatory at the SQL boundary (every `${}` interpolation in budget-home-summary-repo.ts is cast).

---

### Client Fetch — `clientApiFetch` vs `serverApiFetch`

**Source:** `apps/web/src/lib/budget-fetch.ts` (browser) + `apps/web/src/lib/budget-fetch.server.ts` (RSC, server-only).

**Apply to:**

- RSC fetches in `spendings/page.tsx` → `serverApiFetch(budgetId, …)`.
- Client-side queries/mutations in hooks → `clientApiFetch(…)` (auto-attaches `X-Budget-ID` from `window.location.pathname`).

```typescript
// Browser:
const res = await clientApiFetch(`/budgets/${budgetId}/transactions`, { method: "POST", … });

// RSC:
const res = await serverApiFetch(budgetId, `/budgets/${budgetId}/spendings-summary?month=${month}`);
```

**Never** import `budget-fetch.server.ts` from a `"use client"` file — it imports `next/headers` and pulls `cookies()`. Build fails on client bundling.

---

### TanStack Query — `useQuery` with RSC `initialData`

**Source:** `apps/web/src/components/budgeting/task-banner.tsx:43-56`.

**Apply to:** `use-spendings-summary.ts`, the txn list query, the drafts query.

```typescript
const { data } = useQuery({
  queryKey: ["spendings-summary", budgetId, month],
  initialData: initialSummary, // ← from RSC page
  queryFn: async () => {
    const res = await clientApiFetch(
      `/budgets/${budgetId}/spendings-summary?month=${month}`,
    );
    if (!res.ok) return initialSummary;
    return await res.json();
  },
});
```

**For mutations:** RESEARCH §Pattern 2 (lines 587-686) gives the verbatim `useMutation` + `onMutate`/`onError`/`onSuccess`/`onSettled` shape. No in-repo mutation analog exists yet; the RESEARCH excerpt IS the analog.

---

### Reveal-on-click (universal interaction primitive, D-PH4-INT1)

**Source:** RESEARCH §Pattern 5 (lines 786-820) `useRevealActions` hook + `apps/web/src/components/budgeting/task-banner.tsx:72-79` (Escape handler shape).

**Apply to:** Every interactive row in the grid — `TransactionRow`, `DraftRow`, `QuickEntryInput`, `ColumnHeader` cells. Single helper hook `apps/web/src/components/budgeting/spendings-grid/reveal-actions.tsx`.

**Anti-pattern guard (regression test required):** NO `onMouseEnter`, NO `:hover` for action reveals. Hover is permitted only for visual surface tint (matches `bdp-tabs.tsx:69` precedent — hover changes background, not visibility of icons).

---

### Validation — `zod` + `@hono/zod-validator`

**Source:** `apps/api/src/routes/budgets.ts:21-43` + `apps/api/src/routes/recurring-rules.ts:20-61`.

**Apply to:** Every new POST/PUT/PATCH handler.

```typescript
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";

const reorderSchema = z.object({
  orderedIds: z.array(z.string().uuid()).min(1),
});
app.put(
  "/:budgetId/sort-order",
  zValidator("json", reorderSchema),
  async (c) => {
    const body = c.req.valid("json"); // ← already validated + typed
    // …
  },
);
```

**Validation error response shape** (categories.ts:32-35):

```typescript
return c.json({ error: "Validation error", issues: parsed.error.issues }, 422);
```

---

### BDD Page Object + Step Pattern

**Source:** `tests/e2e/pages/TransactionsPage.ts` + `tests/e2e/steps/budget.steps.ts:1-25`.

**Apply to:** New `SpendingsPage.ts` + `spendings.steps.ts` for every feature file under `tests/e2e/features/spendings/`.

**Rules** (per memory):

1. All E2E goes through `.feature` + page objects — no raw `.spec.ts`.
2. `@phase4` tag on every Feature header.
3. Fresh user per scenario via `createFreshUser` (already imported by `budget.steps.ts:13`).
4. `PLAYWRIGHT_BASE_URL` from `.env.local` `APP_URL` — never hardcode `localhost:3000`.

---

## No Analog Found

**None.** Every Phase 4 file has a clean in-repo analog. The closest gap is TanStack-Query mutations — no existing in-repo mutation exists (task-banner uses `useQuery` only). RESEARCH §Pattern 2 provides the canonical mutation shape and is treated as the analog of record for `use-reorder-categories`, `use-create-transaction`, `use-confirm-draft`, `use-dismiss-draft`.

---

## Metadata

**Analog search scope:**

- `apps/web/src/components/budgeting/` (all components)
- `apps/web/src/app/[locale]/(app)/budgets/[id]/` (RSC layout + spendings page)
- `apps/web/src/lib/budget-fetch{,server}.ts`
- `apps/web/src/components/ui/sheet.tsx`
- `apps/web/test/components/` (Vitest examples)
- `apps/api/src/routes/{categories,recurring-rules,budgets}.ts`
- `apps/api/src/app.ts` (mount + middleware patterns)
- `apps/api/test/routes/categories.test.ts` (integration harness)
- `packages/budgeting/src/{application,adapters/persistence,ports}/`
- `packages/budgeting/src/adapters/persistence/{category-repo,category-limit-repo,budget-home-summary-repo,categories-schema}.ts`
- `tests/e2e/{features,steps,pages,fixtures}/`

**Files scanned:** ~27 read + ~12 directory listings + ~3 grep sweeps. No re-reads; one Read per target with concrete excerpt extraction.

**Pattern extraction date:** 2026-05-13 14:55 UTC

## PATTERN MAPPING COMPLETE

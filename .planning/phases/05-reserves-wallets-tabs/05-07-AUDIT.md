# Phase 5 Plan 07 — Cascading-Hide Surface Audit (W-1)

Generated: 2026-05-17T00:00:00Z

## Surface 1 — BdpTabs Reserves pill

Status: HIDDEN-IN-PLAN (Task 3)
File: apps/web/src/components/budgeting/bdp-tabs.tsx
Notes: `reservesEnabled` prop added (default true). When false, TABS array filtered:
`TABS.filter((t) => t.slug !== "reserves")`. All 4 existing tests still pass (default=true).
New Vitest cases cover false/true/undefined states.

## Surface 2 — Spendings grid column-header row 4

Status: HIDDEN-IN-PLAN (Task 4)
File: apps/web/src/components/budgeting/spendings-grid/column-header.tsx
Row-4 JSX line range: lines 139–158 (block: `{/* Row 4: Reserves used */}` through closing `</div>`)
Notes: wrapped in `{reservesEnabled && (...)}`. When hidden, the 5-row visual height
contracts by one row. Phase 4 CSS uses flex-col, not a fixed grid template — collapsing
is clean with no placeholder needed. Prop threaded via SpendingsGridClient → CategoryColumn
→ ColumnHeader. SpendingsPage fetches /budgets/:id in parallel with other RSC fetches and
passes reservesEnabled down.

## Surface 3 — Top-of-shell reserve pill on BDP shell

Status: NOT-PRESENT (verified)

Audit commands (re-runnable from project root):

```bash
# Command 1 — targeted reserve grep on BDP shell files
grep -RIn -i "reserve" \
  apps/web/src/components/budgeting/bdp-tabs.tsx \
  apps/web/src/components/budgeting/budget-bar.tsx \
  apps/web/src/components/budgeting/top-nav.tsx \
  apps/web/src/components/budgeting/budget-switcher.tsx \
  "apps/web/src/app/[locale]/(app)/budgets/[id]/layout.tsx" 2>/dev/null

# Command 2 — broader reserve pill component name sweep
grep -RIn -E "ReservePill|reserve-pill|ReserveTotal|reserve-total|ReserveIndicator|reserve-indicator|ReserveChip|reserve-chip|ReserveTile|reserve-tile" \
  apps/web/src/components apps/web/src/app 2>/dev/null
```

Audit output (verbatim):

Command 1:

```
apps/web/src/components/budgeting/bdp-tabs.tsx:35:  slug: "spendings" | "reserves" | "wallets" | "settings";
apps/web/src/components/budgeting/bdp-tabs.tsx:39:  { slug: "reserves", icon: Coins },
```

Command 2:

```
(empty — exit code 1, no matches)
```

Interpretation: Only the slug literal `'reserves'` appears in BdpTabs (the TABS array type
and the tab entry). Both hits are already covered by the surface-1 cascading hide
(Task 3 filters the TABS array when reservesEnabled=false). No standalone reserve pill /
chip / tile / indicator component exists in any BDP shell file.

The BDP layout at `apps/web/src/app/[locale]/(app)/budgets/[id]/layout.tsx` mounts exactly:

1. `<TaskBanner>` — optional, only when `initialTasks.length > 0`
2. `<BdpTabs>` — always present

No reserve indicator between or around these two children. The cascading-hide clause for
surface 3 is satisfied trivially with this negative result.

## API serializer audit

File: apps/api/src/routes/budgets.ts
GET /:id handler: NOT PRESENT in original file — only `/active`, `/active` (PUT), and
sub-resource routes (`:id/invitations`, `:id/leave`, etc.) exist.

Decision: add `GET /:id` handler that queries the `tenancy.workspaceRepo.findById(id)`
adapter (DrizzleBudgetRepo.findById already exists in workspace-repo.ts) and serializes
`reservesEnabled: row.reservesEnabled ?? true`. The query includes the column (Plan 01
added it to Drizzle schema). The existing `findById` SELECT does NOT include
`reserves_enabled` — it must be added to the SQL query AND the serializer shape.

Existing serializer field naming convention: camelCase (`defaultCurrency`, `cushionModeEnabled`).
Plan extends serializer with `reservesEnabled: row.reserves_enabled ?? true`.

Note: DrizzleBudgetRepo.findById uses withInfraTx and a raw SQL SELECT that does NOT
currently include `reserves_enabled`. Both the SQL and the BudgetDTO interface must be
extended. This is in-scope as the plan requires the API to surface the field.

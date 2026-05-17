---
phase: 05-reserves-wallets-tabs
plan: 07
subsystem: cascading-hide, frontend, api-dto
tags:
  - reserves-enabled
  - cascading-hide
  - bdp-tabs
  - column-header
  - frontend
  - api-dto

requires:
  - phase: 05-reserves-wallets-tabs
    plan: 01
    provides: tenancy.budgets.reserves_enabled column (default true)
  - phase: 05-reserves-wallets-tabs
    plan: 03
    provides: GET /budgets/:id/reserves with disabled flag
  - phase: 05-reserves-wallets-tabs
    plan: 04
    provides: ColumnHeader 5-row component with row 4 Reserves used

provides:
  - GET /budgets/:id API endpoint returning reservesEnabled boolean
  - BdpTabs component filtered by reservesEnabled prop (surface 1)
  - ColumnHeader row 4 conditional on reservesEnabled prop (surface 2)
  - Surface 3 audit sidecar confirming NOT-PRESENT (05-07-AUDIT.md)
  - reservesEnabled threaded: layout → BdpTabs + page → grid client → CategoryColumn → ColumnHeader

affects:
  - apps/web/src/components/budgeting/bdp-tabs.tsx
  - apps/web/src/components/budgeting/spendings-grid/column-header.tsx
  - apps/web/src/components/budgeting/spendings-grid/category-column.tsx
  - apps/web/src/components/budgeting/spendings-grid/spendings-grid-client.tsx
  - apps/web/src/app/[locale]/(app)/budgets/[id]/layout.tsx
  - apps/web/src/app/[locale]/(app)/budgets/[id]/spendings/page.tsx
  - apps/api/src/routes/budgets.ts
  - packages/tenancy/src/contracts/api.ts
  - packages/tenancy/src/adapters/persistence/workspace-repo.ts

tech-stack:
  added: []
  patterns:
    - "prop drilling for reservesEnabled: layout → BdpTabs; page → grid-client → CategoryColumn → ColumnHeader"
    - "parallel serverApiFetch in layout and page; Next.js dedupes /budgets/:id within render pass"
    - "flex-col CSS collapse for row 4 hide: no placeholder needed (contrast to fixed grid-template-rows)"

key-files:
  created:
    - .planning/phases/05-reserves-wallets-tabs/05-07-AUDIT.md
  modified:
    - apps/api/src/routes/budgets.ts
    - packages/tenancy/src/contracts/api.ts
    - packages/tenancy/src/adapters/persistence/workspace-repo.ts
    - apps/api/test/routes/budgets.test.ts
    - apps/web/src/components/budgeting/bdp-tabs.tsx
    - apps/web/test/components/budgeting/bdp-tabs.test.tsx
    - apps/web/src/app/[locale]/(app)/budgets/[id]/layout.tsx
    - apps/web/src/components/budgeting/spendings-grid/column-header.tsx
    - apps/web/src/components/budgeting/spendings-grid/category-column.tsx
    - apps/web/src/components/budgeting/spendings-grid/spendings-grid-client.tsx
    - apps/web/src/app/[locale]/(app)/budgets/[id]/spendings/page.tsx

decisions:
  - "GET /budgets/:id added as new route (was absent); uses existing DrizzleBudgetRepo.findById adapter; SQL extended to SELECT reserves_enabled"
  - "BudgetDTO interface extended with reservesEnabled?: boolean (optional for backward compat)"
  - "Row 4 hide uses flex-col natural collapse; no CSS grid-template-rows override needed — Phase 4 already uses flex-col, so removing the row contracts height cleanly"
  - "Prop drilling chosen over React context for reservesEnabled: only 2 consumers (BdpTabs, SpendingsGridClient); context would be over-engineering for a boolean flag"
  - "SpendingsPage fetches /budgets/:id in parallel with other RSC fetches; Next.js deduplicates the URL within the render pass when layout.tsx fetches the same URL"
  - "Surface 3 (top reserve pill) confirmed NOT-PRESENT via grep audit; no code change needed"

metrics:
  duration: "~25 minutes"
  completed: "2026-05-17"
  tasks_completed: 4
  files_changed: 11
---

# Phase 05 Plan 07: Cascading-Hide (reserves_enabled) Summary

Wire `budgets.reserves_enabled = false` → hide Reserves tab pill in BdpTabs (surface 1), hide "Reserves used" column-header row 4 (surface 2); surface 3 (top reserve pill) confirmed absent by reproducible grep audit.

## Cascading-Hide Surface Dispositions

| Surface                       | Location                            | Status                 | Task         |
| ----------------------------- | ----------------------------------- | ---------------------- | ------------ |
| 1 — Reserves tab pill         | `bdp-tabs.tsx` TABS filter          | HIDDEN-IN-PLAN         | Task 3       |
| 2 — Column-header row 4       | `column-header.tsx` conditional JSX | HIDDEN-IN-PLAN         | Task 4       |
| 3 — Top-of-shell reserve pill | BDP layout                          | NOT-PRESENT (verified) | Task 1 audit |

Full grep evidence for surface 3: see `/home/claude/budget/.planning/phases/05-reserves-wallets-tabs/05-07-AUDIT.md`.

To re-run the audit:

```bash
grep -RIn -i "reserve" \
  apps/web/src/components/budgeting/bdp-tabs.tsx \
  apps/web/src/components/budgeting/budget-bar.tsx \
  apps/web/src/components/budgeting/top-nav.tsx \
  apps/web/src/components/budgeting/budget-switcher.tsx \
  "apps/web/src/app/[locale]/(app)/budgets/[id]/layout.tsx" 2>/dev/null
# Expected: 2 hits — both in bdp-tabs.tsx, both the 'reserves' slug literal (covered by surface 1)

grep -RIn -E "ReservePill|reserve-pill|ReserveTotal|reserve-total|ReserveIndicator|reserve-indicator|ReserveChip|reserve-chip|ReserveTile|reserve-tile" \
  apps/web/src/components apps/web/src/app 2>/dev/null
# Expected: empty (no hits)
```

## Row 4 Hide Approach

Phase 4's `ColumnHeader` uses `flex-col` (not CSS grid-template-rows), so wrapping row 4 in `{reservesEnabled && (...)}` collapses the row cleanly with no visual gap or placeholder required. The height contracts from 5 rows to 4 rows naturally.

## Prop-Threading Pattern

```
BDP layout (layout.tsx)
  → GET /budgets/:id (parallel with /budgets/active + tasks)
  → reservesEnabled → BdpTabs (surface 1)

Spendings RSC page (spendings/page.tsx)
  → GET /budgets/:id (parallel with categories, txns, drafts, summary)
  → reservesEnabled → SpendingsGridClient
  → reservesEnabled → CategoryColumn
  → reservesEnabled → ColumnHeader (surface 2)
```

Next.js deduplicates the `/budgets/:id` fetch within the same render pass when both layout and page request it.

## API Change

Added `GET /budgets/:id` route (was absent before this plan). Serializer:

- Membership gate: `tenantIds.includes(budgetId)` (same pattern as home-summary)
- `DrizzleBudgetRepo.findById` SQL extended to SELECT `reserves_enabled`
- `BudgetDTO` interface extended with `reservesEnabled?: boolean`
- Response: `{ ..., reservesEnabled: row.reservesEnabled ?? true }`

## Commits

| Hash    | Type | Description                                             |
| ------- | ---- | ------------------------------------------------------- |
| 009ecee | docs | Audit sidecar (W-1 NOT-PRESENT verdict)                 |
| bf97c99 | feat | GET /budgets/:id + BudgetDTO + DrizzleBudgetRepo        |
| 2d1e1e8 | test | Failing BdpTabs tests (RED phase)                       |
| f72c050 | feat | BdpTabs cascading-hide surface 1 (GREEN)                |
| 9ec686f | feat | Column-header cascading-hide surface 2 + prop threading |

## Test Coverage

- 6 backend tests pass: existing 4 + 2 new (reservesEnabled=true 200, tenant-gate 404)
- 20 Vitest tests pass: 11 bdp-tabs (7 existing + 4 new cascading-hide) + 9 column-header (all existing, no regression)
- TDD gate: test(05-07) RED commit → feat(05-07) GREEN commit verified

## Deviations from Plan

### Auto-discovered Issues

**1. [Rule 3 - Blocker] GET /budgets/:id did not exist**

- **Found during:** Task 2
- **Issue:** Plan assumed a `GET /:id` route existed in `budgets.ts`; the file only had `/active`, `/active` (PUT), and sub-resource routes. `DrizzleBudgetRepo.findById` existed but its SQL did not include `reserves_enabled`.
- **Fix:** Added the route, extended the SQL SELECT, updated `BudgetDTO` interface.
- **Files modified:** `apps/api/src/routes/budgets.ts`, `packages/tenancy/src/contracts/api.ts`, `packages/tenancy/src/adapters/persistence/workspace-repo.ts`
- **Commit:** bf97c99

**2. [Rule 3 - Blocker] CategoryColumn required reservesEnabled threading**

- **Found during:** Task 4
- **Issue:** `SpendingsGridClient` → `ColumnHeader` goes through `CategoryColumn`; the interface required updating.
- **Fix:** Added `reservesEnabled?: boolean` to `CategoryColumnProps` and destructuring; forwarded to `ColumnHeader`.
- **Files modified:** `category-column.tsx`
- **Commit:** 9ec686f

## Known Stubs

None — all surfaces wire real data from the database via the API endpoint.

## Threat Flags

The new `GET /budgets/:id` endpoint is gated by `tenantIds.includes(budgetId)` (same membership guard used by home-summary and reserves routes). No new unauthenticated surface exposed.

## Self-Check: PASSED

Files verified:

- apps/web/src/components/budgeting/bdp-tabs.tsx — FOUND
- apps/web/src/components/budgeting/spendings-grid/column-header.tsx — FOUND
- apps/api/src/routes/budgets.ts (contains reservesEnabled) — FOUND
- .planning/phases/05-reserves-wallets-tabs/05-07-AUDIT.md — FOUND

Commits verified:

- 009ecee — FOUND
- bf97c99 — FOUND
- 2d1e1e8 — FOUND
- f72c050 — FOUND
- 9ec686f — FOUND

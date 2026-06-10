# Phase 4: Spendings Grid — Research

**Researched:** 2026-05-13
**Domain:** Next.js 15 App Router client-island Excel-like grid + Hono routes + Drizzle persistence + dnd-kit drag-reorder + TanStack Query optimistic mutations + Temporal month navigation
**Confidence:** HIGH (decision space pre-locked by 24 D-PH4-XX decisions + UI-SPEC)

---

## Summary

Phase 4 ships the **core product surface** — the Excel-like Spendings tab — on top of the Phase 1+2 schema/API + Phase 3 BDP frame. The exceptional density of locked decisions (24 in CONTEXT.md, 10 components in UI-SPEC.md verified across 6 dimensions) means research's job is **not** to explore alternatives but to:

1. Verify each locked library/pattern is currently idiomatic and binds cleanly to the existing codebase
2. Document the file-by-file delete/create map (10 new components, 8 v1.0 components to delete + extract from)
3. Define the missing backend route surface (PUT sort-order, GET spendings-summary, POST drafts/:id/confirm, POST drafts/:id/dismiss)
4. Trace each REQ-ID to a test file
5. Flag the four high-risk landmines (dnd-kit horizontal-scroll conflict, optimistic mutation race, SCD-2 race on category-limits, Money rounding on overspent compute)

Key verified facts:

- `apps/web/package.json` ships **Next 15.3.2, React 19, TanStack Query 5 + Devtools (Phase 3 added), playwright-bdd 8, Vitest 4, happy-dom**. All Radix primitives needed are present (`Sheet`, `Button`, `Input`, `Popover`, `Tooltip`, `Alert-dialog`, `Tabs`). `[VERIFIED: apps/web/package.json]`
- **`@dnd-kit/core` and `@dnd-kit/sortable` are NOT installed** — Wave 0 must add them. Latest npm versions verified live: `@dnd-kit/core@6.3.1`, `@dnd-kit/sortable@10.0.0`, `@dnd-kit/utilities@3.2.2`. `[VERIFIED: npm view 2026-05-13]`
- **Backend route surface — what exists vs what Phase 4 adds:**
  - `POST /budgets/:budgetId/transactions` exists (apps/api/src/routes/transactions.ts:185) with body `{date, category_id, amount_original_cents, currency_original?, note?}` — quick-entry binds directly. `[VERIFIED]`
  - `PATCH /budgets/:budgetId/transactions/:txId` exists (line 215) — slider edit binds.
  - `DELETE /budgets/:budgetId/transactions/:txId` exists (line 265) — slider delete binds.
  - `GET /budgets/:budgetId/transactions?month=YYYY-MM&confirmed=any|true|false` exists (line 280) — column-list + draft-list bind.
  - `POST /budgets/:budgetId/transactions/:txId/confirm` exists (line 247) — draft confirm binds.
  - `POST /categories` + `PATCH /categories/:id` + `GET /categories` exist (apps/api/src/routes/categories.ts). `[VERIFIED]`
  - `POST /categories/:id/limits` (SCD-2) exists (apps/api/src/routes/category-limits.ts:20). `[VERIFIED]`
  - MISSING: `PUT /budgets/:budgetId/categories/sort-order` — NEW route Phase 4 ships.
  - MISSING: `GET /budgets/:budgetId/spendings-summary?month=YYYY-MM` — NEW route Phase 4 ships (or extend existing `BudgetHomeSummaryRepo`).
  - MISSING: `POST /recurring-rules/drafts/:id/dismiss` — NEW route Phase 4 ships (CONTEXT D-PH4-R3 dismiss = per-occurrence skip; not in existing recurring-rules.ts).
  - NOTE: Draft-row data model — drafts ARE transactions with `confirmed_at IS NULL` per Phase 2 (TXN-01, RECR-02). The list is fetched via `GET /transactions?month=YYYY-MM&confirmed=false`. **No separate draft table.** `[VERIFIED: transaction-repo.ts:292-342]`
- **RSCM-03/04 reserve auto-deduct surface** — `budgeting.category_reserve_balance` VIEW exists from Phase 2 (migration 0013/0014) and `ReserveBalanceRepo.getForBudget(budgetId, tenantId)` returns `Map<categoryId, Money>`. `[VERIFIED: reserve-balance-repo.ts:40]` The spendings-summary endpoint composes this with `categories + category_limits effective` + per-month spend aggregate.
- **`budget-home-summary-repo.ts` already has 4 of the 5 sub-queries** needed for spendings-summary: `sumCurrentMonthSpend`, `topOverspentCategories`, `getBudgetMeta` (for `cushion_mode_enabled`), `listWalletsForBudget`. Phase 4 extends with `perCategorySpendForMonth` (sibling of `sumCurrentMonthSpend` but grouped by category_id) and composes with `ReserveBalanceRepo.getForBudget`. `[VERIFIED]`
- **Sheet primitive** (`apps/web/src/components/ui/sheet.tsx`) — Radix-Dialog-backed right-anchored panel; default `w-3/4 sm:max-w-sm` will need a Phase-4 width tweak to **480px desktop / 100vw mobile** per UI-SPEC D-PH4-S3. `[VERIFIED]`
- **TanStack Query is already wired** at `apps/web/src/components/providers/query-provider.tsx` with `staleTime: 30_000` and `refetchOnWindowFocus: false`. `task-banner.tsx` is the existing optimistic-poll exemplar. `[VERIFIED]`
- **playwright-bdd is wired** at `apps/web/playwright.config.ts` with `defineBddConfig({ features: "e2e/features/**/*.feature" })`. Existing budget features live in `tests/e2e/features/budget/` — Phase 4 adds a new `tests/e2e/features/spendings/` directory. `[VERIFIED]`
- **`freshUser` fixture** at `tests/e2e/fixtures/freshUser.ts` ships sign-up + email verify; Phase 4 reuses without modification. `[VERIFIED]`
- **Existing `pending-drafts-inbox.tsx`** is deletable; calls `POST /api/recurring-drafts/:draftId/{confirm|edit-confirm|skip}` which routes through the web app. Phase 4's `DraftRow` calls the API directly via `clientApiFetch`. `[VERIFIED]`

**Primary recommendation:** Land Phase 4 as **5 sequential plans** (Wave 0 deps + Wave 1 backend + Wave 2 client primitives + Wave 3 grid composition + Wave 4 BDD + impeccable sweep). Treat dnd-kit install + new backend routes (sort-order, spendings-summary, drafts/:id/dismiss) as Wave 0/1 hard prereqs. Wave 2 ships the 7 client primitives in parallel (each is tested with Vitest + RTL); Wave 3 composes them. Wave 4 ships >= 10 Gherkin scenarios + the impeccable sweep + `make ci-gate` + `make test-e2e`.

---

<user_constraints>

## User Constraints (from CONTEXT.md)

### Locked Decisions (24 D-PH4-XX entries — copy verbatim)

**Interaction model (universal):**

- **D-PH4-INT1:** Single click reveals options on every interactive surface (txn rows, draft rows, bottom quick-entry slot, category header cells). Desktop AND mobile. NO hover behavior anywhere.
- **D-PH4-INT2:** Double-click (desktop) / double-tap (mobile) = inline quick-edit. Cell becomes input. Enter saves, Esc cancels. Click + double-click are the only interaction primitives.
- **D-PH4-INT3:** Inline-edit scope is narrow — only fields visible in the cell. Txn rows: amount only. Note/date/currency require slider via pen.
- **D-PH4-INT4:** Category cells are NEVER inline-editable. Name, planned, cushion all open Category slider via pen icon.
- **D-PH4-INT5:** Draft rows follow same model. Double-click amount triggers input then Enter saves edit AND promotes draft (single-keystroke shortcut). Confirm button promotes unchanged.
- **D-PH4-INT6:** Slider opens only via pen icon in revealed options — never on plain cell click.

**Side-slider architecture:**

- **D-PH4-S1:** Two separate sliders — `TransactionSlider` (create+edit; edit shows Delete) and `CategorySlider` (create+edit). Rejected unified-slider-with-mode-prop.
- **D-PH4-S2:** Cherry-pick existing field components from Phase 2 `transaction-capture-form.tsx` + `transaction-edit-form.tsx`: `CurrencyAllowlistPicker`, BinancePlex `AmountInput`, `DateInput`, `FxFreshnessBadge`. Drop EXPENSE/INCOME/TRANSFER kind switcher.
- **D-PH4-S3:** Slider sizing — desktop 480px right-slide (matches existing Phase 2 Sheet variant), mobile full-screen. Radix Dialog underneath.
- **D-PH4-S4:** Dashed `+` column triggers SAME CategorySlider in create mode.

**Drag-reorder:**

- **D-PH4-D1:** `@dnd-kit/sortable` — new dependency. First-class keyboard a11y, touch + pointer, RSC-friendly, ~20kb.
- **D-PH4-D2:** Persist via single PUT `/budgets/:id/categories/sort-order` with body `{orderedIds: [...]}` on drag-end. Server rewrites `categories.sort_index = 1..N` in one transaction.
- **D-PH4-D3:** Drag affordance — `GripVertical` lucide icon always visible. Drag initiates on pointerdown on the grip only.
- **D-PH4-D4:** Dashed `+` column NOT draggable, NOT a drop target. Constrained at far right. dnd-kit `disabled` flag on the SortableContext item.

**Quick-entry + month navigation:**

- **D-PH4-Q1:** Optimistic insert with manual-retry on server error. (1) clear input, (2) prepend optimistic row with `pending` flag, (3) POST `/transactions`, (4a) on success swap with server row, (4b) on error keep row but flag `unsent` and show retry icon.
- **D-PH4-Q2:** Accept both `.` and `,` as decimal separators; normalize to `.` on submit. `<input inputMode="decimal" />` for mobile keypad.
- **D-PH4-Q3:** Month nav — dedicated arrow buttons + `Cmd/Ctrl + Left/Right` keyboard shortcut. Plain arrow keys NOT bound (preserves native cursor/scroll).
- **D-PH4-Q4:** Month state in URL search param `?month=YYYY-MM`. Bookmarkable. Default = current month in budget TZ (Temporal API).
- **D-PH4-Q5:** Past months fully editable. Quick-entry default = last day of viewed month.
- **D-PH4-Q6:** Mobile grid uses horizontal scroll; no scroll-snap; no sticky leftmost column. Columns ~140–160px wide.

**Recurring drafts + reserve refresh:**

- **D-PH4-R1:** Draft row visual — `--surface-elevated-dark` bg + 3px dashed yellow left border (decorative only; Confirm button is the primary action).
- **D-PH4-R2:** Single click reveals [Confirm][Edit][Dismiss]. Double-click amount then inline edit then Enter = edit-and-promote shortcut.
- **D-PH4-R3:** Dismiss = `dismissed_at = now()` on this occurrence only. Recurring rule keeps running. Confirmation dialog "Skip [Rule name] for [Month]?".
- **D-PH4-R4:** Reserve-deduction refresh strategy — optimistic local recompute within ~50ms; background `GET /budgets/:id/spendings-summary` reconciles within 1–2s. No SSE.
- **D-PH4-R5:** Background revalidate triggers after Confirm/Dismiss/category-edit/drag-reorder.

**Engineering discipline:**

- **D-PH4-E1:** Every user-facing flow gets a `.feature` scenario in `tests/e2e/features/spendings/`. Minimum 13 scenarios (listed in CONTEXT).
- **D-PH4-E2:** Vitest component tests for every new client component (TransactionSlider, CategorySlider, SpendingsGrid, ColumnHeader, QuickEntryInput, DraftRow, drag-reorder hook); >= 80% domain coverage preserved.
- **D-PH4-E3:** Backend integration tests for new PUT sort-order route, draft confirm/dismiss endpoints, `spendings-summary` query — real Postgres, tenant-leak CI gate.
- **D-PH4-E4:** No DB mocking. Run `make test`, `make test-e2e`, `make ci-gate` before verified.
- **D-PH4-E5:** Run `impeccable` sweep on grid + sliders before final commit.

### Claude's Discretion

- Cache lib for optimistic mutations and retry queue. **Recommendation: TanStack Query (`@tanstack/react-query`)** — already installed; `onMutate`/`onError`/`onSettled` is the standard primitive.
- Internal RSC/client split — keep `spendings/page.tsx` RSC; client island `<SpendingsGridClient>` owns interaction state.
- Exact `surface-elevated-dark` token for draft-row bg.
- Optimistic-row "pending" vs "unsent" visual states.
- Touch-device long-press duration calibration (default 300ms).
- Reserves-summary endpoint exact shape — extend existing `home-summary` repo or new endpoint.
- Mobile column width (140–160px).

### Deferred Ideas (OUT OF SCOPE)

- SSE/WebSocket real-time updates — defer to Phase 8.
- Scroll-aware sticky shrink for month-header + pill tabs — rejected at Phase 3 (D-PH3-01).
- Per-category icon/color picker UX richness — Phase 8+.
- Fractional / lexorank sort_index — rejected for v1.1.
- Swipe-actions on mobile draft rows — rejected.
- EXPENSE/INCOME/TRANSFER kind from quick-entry — Phase 4 quick-entry is EXPENSE-only (INCOME via wallets later).
- "Edited" badge + edit-history panel.
- Bulk operations.

</user_constraints>

<phase_requirements>

## Phase Requirements

| ID      | Description                                                                                                              | Research Support                                                                                                                                              |
| ------- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GRID-01 | Excel-like grid with columns = categories, current-month scope                                                           | §Component Map §1 SpendingsGridClient (RSC `spendings/page.tsx` + client island); §Backend §1 `GET /transactions?month=…` and `GET /categories` already exist |
| GRID-02 | 5-row column header: name · planned-or-cushion · overspent · reserves-used · balance                                     | §Backend §3 `GET /spendings-summary` endpoint composes the 5 rows server-side; §Domain Math §1 documents exact formulas                                       |
| GRID-03 | Column header pen icon opens side slider in edit mode                                                                    | §Component Map §4 ColumnHeader + §Component Map §10 CategorySlider; D-PH4-E (no hover — pen revealed by single click per D-PH4-INT1)                          |
| GRID-04 | Slider edits both planned + cushion; saves as SCD-2 versions of `category_limits`                                        | §Backend §2 `POST /categories/:id/limits` exists; §Pitfalls §3 SCD-2 race conditions                                                                          |
| GRID-05 | Bottom quick-entry: numeric + Enter -> POST txn (current month -> today; past month -> last day)                         | §Component Map §7 QuickEntryInput; §Backend §1 POST /transactions; §Pattern §3 optimistic mutation                                                            |
| GRID-06 | Below header, column lists current-month txns newest first                                                               | §Backend §1 `GET /transactions?month=…&confirmed=true` returns ORDER BY transaction_date DESC, created_at DESC (verified line 335)                            |
| GRID-07 | Txn pen -> slider full-field edit incl. delete                                                                           | §Component Map §9 TransactionSlider; §Backend §1 PATCH + DELETE /transactions/:id                                                                             |
| GRID-08 | Dashed `+` column opens slider in create mode                                                                            | §Component Map §8 AddCategoryColumn + §Component Map §10 CategorySlider create mode                                                                           |
| GRID-09 | Drag-reorder persists `categories.sort_index`                                                                            | §Pattern §1 dnd-kit + §Backend §4 new PUT sort-order; §Schema §1 `categories.sort_index` already migrated MIG-07                                              |
| GRID-10 | Arrow keys navigate months (SOFTENED to Cmd/Ctrl + arrows per D-PH4-Q3)                                                  | §Component Map §2 MonthNavigator + §Pattern §4 URL-driven month state                                                                                         |
| GRID-11 | Past months render same grid (SOFTENED to fully editable per D-PH4-Q5)                                                   | §Component Map §7 QuickEntryInput past-month branch                                                                                                           |
| GRID-12 | No search bar / no filter chips                                                                                          | §File Map: DELETE list (transaction-search-bar.tsx, transaction-filter-chips.tsx, bulk-action-bar.tsx)                                                        |
| GRID-13 | Mobile horizontal scroll                                                                                                 | §Pattern §6 grid layout + UI-SPEC §Responsive                                                                                                                 |
| GRID-14 | Recurring drafts as highlighted rows; click Confirm -> real txn                                                          | §Component Map §6 DraftRow + §Backend §1 POST /:txId/confirm flips `confirmed_at`                                                                             |
| GRID-15 | overspent = max(0, spent - active_budget - reserve_used); active_budget = cushion if `cushion_mode_enabled` else planned | §Domain Math §1 formula + §Backend §3 spendings-summary computes server-side                                                                                  |
| RECR-03 | Drafts surface as highlighted rows in target column                                                                      | §Component Map §6 DraftRow                                                                                                                                    |
| RECR-04 | Confirm -> `confirmed_at = now()` + normal styling                                                                       | §Backend §1 confirm endpoint flips confirmed_at; §Pattern §3 optimistic update strips draft styling                                                           |
| RECR-05 | Edit draft via pen -> same slider                                                                                        | §Component Map §6 DraftRow opens TransactionSlider in edit mode                                                                                               |
| RECR-06 | Dismiss draft without confirming                                                                                         | §Backend §4 NEW route POST `/recurring-rules/drafts/:id/dismiss` sets `dismissed_at = now()`                                                                  |
| RECR-07 | Standalone pending-drafts-inbox UI removed                                                                               | §File Map: DELETE pending-drafts-inbox.tsx                                                                                                                    |
| RSCM-03 | New txn pushing over active_budget triggers real-time reserve deduction display in row 4                                 | §Pattern §3 optimistic recompute + §Backend §3 background revalidate                                                                                          |
| RSCM-04 | Reserve overflow -> remainder as overspent in row 3                                                                      | §Domain Math §1 `overspent = max(0, spent - active - reserve_used)` formula handles cascade                                                                   |

</phase_requirements>

---

## Architectural Responsibility Map

| Capability                                                    | Primary Tier                             | Secondary Tier                                             | Rationale                                                                                                 |
| ------------------------------------------------------------- | ---------------------------------------- | ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Grid layout, drag-reorder state                               | Browser (Client Component)               | —                                                          | dnd-kit needs `useSortable`; column reflow on drop is browser-side animation                              |
| Quick-entry input + optimistic queue                          | Browser (TanStack Query mutation)        | API                                                        | Optimistic UI lives in the cache; POST `/transactions` is the backend mutation                            |
| Side-sliders (TransactionSlider, CategorySlider)              | Browser (Radix Dialog state)             | API                                                        | Sliders are stateful client components wrapping form + Radix Dialog                                       |
| Initial month data fetch                                      | Frontend Server (RSC)                    | API                                                        | `spendings/page.tsx` is RSC; reads `?month` searchParam and fetches 4 endpoints in parallel               |
| 5-row header math (planned, overspent, reserve_used, balance) | API (Hono `spendings-summary` route)     | Database (SQL aggregation + VIEW)                          | Money math + SCD-2 effective-dated reads belong in adapter layer; client receives pre-computed cents      |
| Reserve-deduction real-time refresh                           | Browser (optimistic local recompute)     | API (revalidate via TanStack invalidateQueries)            | D-PH4-R4 — 50ms optimistic + 1-2s server reconcile; no SSE                                                |
| Recurring-draft materialization                               | API (pg-boss worker on Phase 2 timer)    | Database                                                   | Drafts ALREADY materialize as `confirmed_at IS NULL` rows; Phase 4 only renders them                      |
| Draft confirm/dismiss                                         | API (Hono route)                         | Database                                                   | Mutation; client invalidates query on success                                                             |
| Drag-reorder persistence                                      | API (Hono PUT)                           | Database (transaction; one UPDATE per row OR single batch) | Backend rewrites `categories.sort_index = 1..N` in one tx (D-PH4-D2)                                      |
| Month navigation                                              | Browser (URL param + `useRouter().push`) | Frontend Server (RSC re-render on `?month` change)         | `<MonthNavigator>` updates URL; Next.js soft-nav re-fetches RSC; client cache invalidates per-month query |
| Authorization                                                 | API (tenant guard + RLS)                 | Frontend Server (auth gate in `(app)/layout.tsx`)          | X-Budget-ID middleware then RLS on every SELECT                                                           |

**Tier discipline check:** No Drizzle in domain. No business math in browser (overspent compute returns cents from backend; client only renders + does optimistic delta). dnd-kit is browser-only (cannot ever be RSC). Money math wraps Dinero — never directly in `<TransactionRow>`.

---

## Standard Stack

### Core (already installed — VERIFIED via apps/web/package.json)

| Library                                                | Version   | Purpose                                                                                                                                       | Why Standard                                                                                                    |
| ------------------------------------------------------ | --------- | --------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `next`                                                 | `^15.3.2` | App Router, RSC `searchParams`, `redirect()`, nested layouts                                                                                  | `[VERIFIED: apps/web/package.json]` — supports all Phase 4 patterns including async params                      |
| `react` / `react-dom`                                  | `^19.0.0` | RSC + Suspense + `useOptimistic` (though Phase 4 uses TanStack Query optimistic)                                                              | `[VERIFIED]`                                                                                                    |
| `@tanstack/react-query`                                | `^5`      | Optimistic mutation lifecycle (`onMutate` / `onError` / `onSettled`), invalidation cascade, retry queue                                       | `[VERIFIED: apps/web/package.json line 30]` — Phase 3-01 installed; latest npm `5.100.10` `[VERIFIED npm view]` |
| `@tanstack/react-query-devtools`                       | `^5`      | Dev panel for inspecting cache state during execution                                                                                         | `[VERIFIED]`                                                                                                    |
| `@radix-ui/react-dialog`                               | latest    | Sheet primitive backing both sliders (via `@radix-ui/react-dialog` re-exported as `Sheet`)                                                    | `[VERIFIED: apps/web/src/components/ui/sheet.tsx:4]`                                                            |
| `@radix-ui/react-tooltip`                              | latest    | Tooltips for drag-grip, disabled Delete button, Cmd/Ctrl shortcut hint                                                                        | `[VERIFIED]`                                                                                                    |
| `@radix-ui/react-alert-dialog`                         | latest    | Destructive confirmation (Delete txn, Dismiss draft)                                                                                          | `[VERIFIED]`                                                                                                    |
| `react-hook-form` + `@hookform/resolvers` + `zod`      | latest    | Form state + Zod resolver in both sliders                                                                                                     | `[VERIFIED: existing transaction-capture-form.tsx pattern]`                                                     |
| `next-intl`                                            | `^4.4.3`  | `useTranslations()` for grid.\* namespace; `getTranslations()` server-side                                                                    | `[VERIFIED]` — Phase 4 adds new `messages/en/grid.json` namespace (UI-SPEC copywriting contract)                |
| `lucide-react`                                         | latest    | `Pen`, `Trash`, `Plus`, `GripVertical`, `Check`, `X`, `RotateCcw`, `ChevronLeft`, `ChevronRight`, `Loader2`, `RefreshCw` — all required icons | `[VERIFIED]`                                                                                                    |
| `class-variance-authority` + `clsx` + `tailwind-merge` | latest    | CVA-styled draft-row variant (resting / pending / unsent / expanded)                                                                          | `[VERIFIED]`                                                                                                    |
| `sonner`                                               | latest    | Toast for error states (already used in transaction-capture-form)                                                                             | `[VERIFIED]`                                                                                                    |

### NEW dependencies (Wave 0 install — `cd apps/web && bun add @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities`)

| Library              | Version (verified npm) | Purpose                                                                                     | Why Standard                                                                                                            |
| -------------------- | ---------------------- | ------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `@dnd-kit/core`      | `6.3.1`                | DnD context, sensors (`PointerSensor`, `KeyboardSensor`, `TouchSensor`), drag overlay       | `[VERIFIED: npm view @dnd-kit/core version 2026-05-13]` — MIT, ~20kb, framework-agnostic, idiomatic in shadcn ecosystem |
| `@dnd-kit/sortable`  | `10.0.0`               | `<SortableContext>`, `useSortable()` hook, `horizontalListSortingStrategy` for our use case | `[VERIFIED: npm view]` — companion package, horizontal list strategy is exactly what column-reorder needs               |
| `@dnd-kit/utilities` | `3.2.2`                | CSS helper (`CSS.Transform.toString(transform)`)                                            | `[VERIFIED: npm view]` — peer dep of sortable                                                                           |

### Already-present primitives (no install needed)

`apps/web/src/components/ui/`: `alert-dialog`, `alert`, `avatar`, `badge`, `button`, `card`, `checkbox`, `command`, `dialog`, `dropdown-menu`, `form`, `input`, `label`, `popover`, `select`, `separator`, `sheet`, `skeleton`, `sonner`, `table`, `tabs`, `tooltip`. **All required Phase 4 primitives present** per UI-SPEC §Registry Safety. `Sheet` will need a width tweak inline (480px desktop, 100vw mobile per D-PH4-S3 — apply via `className` override on `<SheetContent>`, NOT by editing the primitive).

### Phase 2 reusable field components

| Source file                                                      | Components to extract                                                                                                         | New location                                                                                        |
| ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `apps/web/src/components/budgeting/transaction-capture-form.tsx` | `CurrencyPicker` (CurrencyAllowlistPicker), BinancePlex `AmountInput` styling block, FX preview fetch, idempotency-key helper | `apps/web/src/components/budgeting/fields/{currency-picker,amount-input,date-input,fx-preview}.tsx` |
| `apps/web/src/components/budgeting/fx-freshness-badge.tsx`       | `FxFreshnessBadge` (verbatim reuse)                                                                                           | Stays in place; both sliders import                                                                 |
| `apps/web/src/components/budgeting/transaction-edit-form.tsx`    | Idempotency-key generator (`generateIdempotencyKey`); date input pattern                                                      | Move to `fields/`                                                                                   |

### Alternatives Considered

| Instead of                                    | Could Use                         | Tradeoff (why not)                                                                                                                                                                                                                                                                                                             |
| --------------------------------------------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `@dnd-kit/sortable`                           | `react-beautiful-dnd`             | rbd is deprecated and unmaintained since 2023. dnd-kit is the modern replacement, recommended by shadcn. D-PH4-D1 locks it.                                                                                                                                                                                                    |
| `@dnd-kit/sortable`                           | `react-dnd`                       | react-dnd lacks touch support out of the box and has heavier API. dnd-kit's sensors auto-handle touch.                                                                                                                                                                                                                         |
| TanStack Query optimistic                     | `useOptimistic` (React 19 native) | React 19's `useOptimistic` is great but lacks the retry queue, invalidation cascade, and onError -> unsent-flag flow Phase 4 needs. TanStack Query's `onMutate` returns a context that supports rollback + manual retry; `useOptimistic` requires manual queue state. Phase 4 chose TanStack Query per CONTEXT recommendation. |
| TanStack Query polling                        | SSE for reserve-deduction         | D-PH4-R4 explicitly defers SSE to Phase 8. Optimistic local recompute + manual invalidate is sufficient for v1.1.                                                                                                                                                                                                              |
| URL `?month=YYYY-MM`                          | Client-only state via `useState`  | URL-driven is bookmarkable, shareable, browser-back works (D-PH4-Q4). `useState` would force a `<SpendingsGridClient>` re-mount on every month change, losing optimistic queue.                                                                                                                                                |
| Native `<input type="date">` for month picker | Custom `<MonthNavigator>`         | Browser month-input UX is platform-inconsistent; locked decision is dedicated arrows + Cmd/Ctrl+arrow shortcut (D-PH4-Q3).                                                                                                                                                                                                     |
| Drizzle in route handler for sort-order       | Application service + repo        | Hexagonal discipline: route stays thin; logic lives in `packages/budgeting/src/application/reorder-categories.ts` calling `categoryRepo.reorder()`. Mirrors existing patterns (e.g., `createCategory`, `setCategoryLimit`).                                                                                                    |

**Installation (Wave 0 Plan 04-01):**

```bash
cd apps/web && bun add @dnd-kit/core@^6.3.1 @dnd-kit/sortable@^10.0.0 @dnd-kit/utilities@^3.2.2
make dev-build && make restart-web    # rebuild image so dnd-kit lands in container
```

**Version verification:**

- `@dnd-kit/core@6.3.1` — `[VERIFIED: npm view 2026-05-13]`
- `@dnd-kit/sortable@10.0.0` — `[VERIFIED: npm view 2026-05-13]`
- `@dnd-kit/utilities@3.2.2` — `[VERIFIED: npm view 2026-05-13]`
- `@tanstack/react-query@5.100.10` (already installed at `^5`) — `[VERIFIED: npm view 2026-05-13]`
- `next@15.3.2` — `[VERIFIED: apps/web/package.json]` (npm latest is `16.2.6`; codebase pinned to 15.3 is fine for App Router patterns)

---

## File Map: Delete · Rewrite · Extract · Create

### Delete (Phase 4 owns destruction — confirmed by CONTEXT canonical-refs and verified to exist)

| Path                                                              | Reason                                             | REQ                             |
| ----------------------------------------------------------------- | -------------------------------------------------- | ------------------------------- |
| `apps/web/src/components/budgeting/transaction-list.tsx`          | Replaced by per-column txn list inside grid        | GRID-06                         |
| `apps/web/src/components/budgeting/transaction-search-bar.tsx`    | No search bar in v1.1                              | GRID-12                         |
| `apps/web/src/components/budgeting/transaction-filter-chips.tsx`  | No filter chips                                    | GRID-12                         |
| `apps/web/src/components/budgeting/bulk-action-bar.tsx`           | No bulk operations                                 | GRID-12                         |
| `apps/web/src/components/budgeting/transaction-capture-form.tsx`  | After extracting field components                  | (replaced by TransactionSlider) |
| `apps/web/src/components/budgeting/transaction-capture-sheet.tsx` | Replaced by TransactionSlider                      | D-PH4-S1                        |
| `apps/web/src/components/budgeting/transaction-edit-form.tsx`     | After extracting field components                  | (replaced by TransactionSlider) |
| `apps/web/src/components/budgeting/transaction-row-edit.tsx`      | Replaced by inline-edit on TransactionRow + slider | D-PH4-INT2                      |
| `apps/web/src/components/budgeting/transaction-row-client.tsx`    | Same                                               | D-PH4-INT2                      |
| `apps/web/src/components/budgeting/pending-drafts-inbox.tsx`      | Drafts inline in grid only                         | RECR-07                         |
| `apps/web/src/components/budgeting/edit-history-panel.tsx`        | Defer decision — delete to speed rewrite           | TXN-08                          |

### Extract first, then delete

| Component                                                | From                                                                    | To                                                             |
| -------------------------------------------------------- | ----------------------------------------------------------------------- | -------------------------------------------------------------- |
| `AmountInput` (BinancePlex styled 40px Input)            | `transaction-capture-form.tsx` lines 184-192                            | `apps/web/src/components/budgeting/fields/amount-input.tsx`    |
| `CurrencyAllowlistPicker` (Currency Select w/ allowlist) | `transaction-capture-form.tsx` (uses `<CurrencyPicker>` from `common/`) | already in `common/currency-picker.tsx` — leave; just import   |
| `DateInput`                                              | `transaction-capture-form.tsx` lines 200-216                            | `apps/web/src/components/budgeting/fields/date-input.tsx`      |
| `FxPreviewLine`                                          | `transaction-capture-form.tsx` (FX line block)                          | `apps/web/src/components/budgeting/fields/fx-preview-line.tsx` |
| `generateIdempotencyKey()`                               | Both forms (duplicated)                                                 | `apps/web/src/lib/idempotency.ts`                              |

### Rewrite

| Path                                                              | Action                                                                                                                                                                                                                                                                       |
| ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web/src/app/[locale]/(app)/budgets/[id]/spendings/page.tsx` | Rewrite as RSC shell: parse `?month=YYYY-MM`, fetch 4 endpoints in parallel (`/budgets/:id/categories`, `/budgets/:id/transactions?month=…`, `/budgets/:id/spendings-summary?month=…`, drafts list = same endpoint with `?confirmed=false`), pass to `<SpendingsGridClient>` |

### Create (10 NEW client components + 4 NEW backend touchpoints + 1 NEW migration if needed)

**Client (per UI-SPEC §Design System table):**

| Path                                                                         | Role                                                                                     |
| ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `apps/web/src/components/budgeting/spendings-grid/spendings-grid-client.tsx` | Client island hosting drag context + sliders state + optimistic queue                    |
| `apps/web/src/components/budgeting/spendings-grid/column-header.tsx`         | 5-row category header with grip + pen-reveal-on-click                                    |
| `apps/web/src/components/budgeting/spendings-grid/category-column.tsx`       | Column wrapper; sortable item                                                            |
| `apps/web/src/components/budgeting/spendings-grid/add-category-column.tsx`   | Dashed `+` create-category trigger                                                       |
| `apps/web/src/components/budgeting/spendings-grid/transaction-row.tsx`       | Per-txn row; single-click reveals [Pen][Trash]; double-click amount triggers inline edit |
| `apps/web/src/components/budgeting/spendings-grid/draft-row.tsx`             | Highlighted draft row; single-click reveals [Confirm][Pen][Dismiss]                      |
| `apps/web/src/components/budgeting/spendings-grid/quick-entry-input.tsx`     | Bottom-of-column numeric input                                                           |
| `apps/web/src/components/budgeting/spendings-grid/month-navigator.tsx`       | Arrows + Cmd/Ctrl+arrow handler                                                          |
| `apps/web/src/components/budgeting/transaction-slider.tsx`                   | Right-side Sheet for txn create/edit/delete                                              |
| `apps/web/src/components/budgeting/category-slider.tsx`                      | Right-side Sheet for category create/edit                                                |

**Hooks:**

| Path                                           | Role                                                                               |
| ---------------------------------------------- | ---------------------------------------------------------------------------------- |
| `apps/web/src/hooks/use-reorder-categories.ts` | TanStack Query mutation wrapping PUT sort-order with optimistic reorder + rollback |
| `apps/web/src/hooks/use-create-transaction.ts` | Quick-entry mutation with pending/unsent state                                     |
| `apps/web/src/hooks/use-confirm-draft.ts`      | Draft confirm mutation                                                             |
| `apps/web/src/hooks/use-dismiss-draft.ts`      | Draft dismiss mutation                                                             |
| `apps/web/src/hooks/use-month-param.ts`        | URL `?month` reader + setter (Temporal-backed)                                     |
| `apps/web/src/hooks/use-spendings-summary.ts`  | Query hook for header math + invalidation triggers                                 |

**Backend (Hono routes):**

| Path                                       | Action                                                                                                                                                                                                                                     |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `apps/api/src/routes/categories.ts`        | EXTEND with `PUT /:budgetId/sort-order` handler (currently `categories.ts` has only `/` and `/:id` paths — sort-order route mounted under `/budgets/:budgetId/categories/sort-order`)                                                      |
| `apps/api/src/routes/recurring-rules.ts`   | EXTEND with `POST /drafts/:id/dismiss` (set `dismissed_at = now()` on `expense_ledger` row where `recurring_rule_id IS NOT NULL AND confirmed_at IS NULL`). Already has `/drafts/:id/confirm` flow via `POST /transactions/:txId/confirm`. |
| `apps/api/src/routes/spendings-summary.ts` | NEW route: `GET /budgets/:budgetId/spendings-summary?month=YYYY-MM` returning per-category `{categoryId, name, sortIndex, planned, cushion, spent, reserveUsed, overspent, balance, cushionModeEnabled}`                                   |
| `apps/api/src/app.ts`                      | Mount new spendings-summary sub-router under `/budgets/:budgetId/`                                                                                                                                                                         |

**Backend (application + ports):**

| Path                                                                         | Action                                                                                                                                                                                                                                  |
| ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/budgeting/src/application/reorder-categories.ts`                   | NEW: `reorderCategories({tenantId, budgetId, orderedIds, actorUserId})` — validates IDs all belong to budget, rewrites `sort_index` in one tx                                                                                           |
| `packages/budgeting/src/application/dismiss-draft.ts`                        | NEW: `dismissDraft({tenantId, draftId, actorUserId})` — sets `dismissed_at = now()` on expense_ledger row; verifies confirmed_at IS NULL                                                                                                |
| `packages/budgeting/src/application/get-spendings-summary.ts`                | NEW: composes `categoryRepo.listForBudget` + `categoryLimitRepo.effectiveForMonth` + `transactionRepo.spendByCategoryForMonth` + `reserveBalanceRepo.getForBudget` + `getBudgetMeta` (cushion_mode_enabled) into per-category aggregate |
| `packages/budgeting/src/ports/category-repo.ts`                              | EXTEND with `reorder(tenantId, budgetId, orderedIds, actorUserId)` method                                                                                                                                                               |
| `packages/budgeting/src/adapters/persistence/category-repo.ts`               | EXTEND with `reorder()` SQL (one UPDATE per row OR `UPDATE categories SET sort_index = data.sort_index FROM (VALUES …) AS data(id, sort_index) WHERE categories.id = data.id` pattern)                                                  |
| `packages/budgeting/src/ports/transaction-repo.ts`                           | EXTEND with `spendByCategoryForMonth(tenantId, budgetId, month) -> Map<categoryId, bigint>`                                                                                                                                             |
| `packages/budgeting/src/ports/expense-ledger-draft-repo.ts` (already exists) | Verify it exposes `dismiss(id, userId, tenantId)`; if not, add it                                                                                                                                                                       |

**Database (verify; do NOT migrate unless verified missing):**

| Column / object                           | Verify                        | Action if missing                                                                                                                                        |
| ----------------------------------------- | ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `categories.sort_index INTEGER`           | MIG-07 in Phase 1             | Already migrated — confirm via `\d budgeting.categories`                                                                                                 |
| `expense_ledger.dismissed_at TIMESTAMPTZ` | NOT in current Phase 2 schema | **NEW Phase 4 migration** if confirmed missing — add column with default NULL; backfill irrelevant. Plan 04-01 spike runs `\d budgeting.expense_ledger`. |
| `expense_ledger.recurring_rule_id UUID`   | Phase 2 RECR-02               | Already present per TXN-01 — confirm via `\d`                                                                                                            |
| `category_reserve_balance` VIEW           | Phase 2 RSCM-01               | Already present — verified by `reserve-balance-repo.ts:53` SELECT                                                                                        |

---

## Backend Surface Map (route-by-route)

### §1 Transactions (apps/api/src/routes/transactions.ts) — EXISTS, BIND AS-IS

| Verb + Path                                                      | Body / Query                                                                      | Use for                                                                 | Status          |
| ---------------------------------------------------------------- | --------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | --------------- | ------------------------------------------------------------------ | --------------- |
| `POST /budgets/:budgetId/transactions`                           | `{date, category_id, amount_original_cents, currency_original?, note?}`           | Quick-entry (sets currency to budget default if omitted), Slider create | EXISTS line 185 |
| `PATCH /budgets/:budgetId/transactions/:txId`                    | `{date?, category_id?, amount_original_cents?, currency_original?, note?, kind?}` | Slider edit, Inline-edit (amount only)                                  | EXISTS line 215 |
| `POST /budgets/:budgetId/transactions/:txId/confirm`             | —                                                                                 | Draft confirm                                                           | EXISTS line 247 |
| `DELETE /budgets/:budgetId/transactions/:txId`                   | —                                                                                 | Slider delete                                                           | EXISTS line 265 |
| `GET /budgets/:budgetId/transactions?month=YYYY-MM&confirmed=any | true                                                                              | false`                                                                  | —               | Column txn list (`confirmed=true`), draft list (`confirmed=false`) | EXISTS line 280 |

**Quick-entry binds verbatim.** Body `amount_original_cents` is computed client-side from the typed string (e.g., `5.96` becomes `596`). Server validates as `z.number().int()` (line 54). `currency_original` is **optional**; if absent, server resolves budget's default currency via `getBudgetCurrency(budgetId)` (line 145). Per D-PH4-Q1 the client never sends it; the server fills.

### §2 Categories (apps/api/src/routes/categories.ts) — EXISTS, EXTEND

| Verb + Path                                                                                                     | Use for                                                    | Status                                                                      |
| --------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- | --------------------------------------------------------------------------- |
| `POST /categories` `{name, color?, icon?}`                                                                      | Category slider create                                     | EXISTS line 25                                                              |
| `GET /categories?includeArchived`                                                                               | Column list source                                         | EXISTS line 71                                                              |
| `PATCH /categories/:id` `{name}`                                                                                | Slider edit (name)                                         | EXISTS line 115 (rename only — `icon`/`color` need EXTEND if not in schema) |
| `POST /categories/:id/archive`                                                                                  | (not used by Phase 4 directly; CategorySlider may surface) | EXISTS line 98                                                              |
| `POST /categories/:id/limits` `{normalAmount, normalCurrency?, cushionAmount, cushionCurrency?, effectiveFrom}` | SCD-2 planned/cushion update                               | EXISTS apps/api/src/routes/category-limits.ts:20                            |

**Schema check needed:** `categories` table must support `icon`, `color`, `sort_index`. `sort_index` is migrated MIG-07. **Verify `icon` + `color` columns** — if absent, the slider drops those fields for v1.1 (and the dashed `+` create surface omits them) OR Plan 04-02 ships a tiny additive migration. Spike: `\d budgeting.categories` in Wave 0.

### §3 Spendings Summary (NEW route — apps/api/src/routes/spendings-summary.ts)

**Endpoint:** `GET /budgets/:budgetId/spendings-summary?month=YYYY-MM`

**Response:**

```jsonc
{
  "month": "2026-05",
  "budgetCurrency": "PLN",
  "cushionModeEnabled": false,
  "categories": [
    {
      "categoryId": "...",
      "name": "Groceries",
      "iconKey": null,
      "colorKey": null,
      "sortIndex": 1,
      "plannedCents": 200000,
      "cushionCents": 250000,
      "activeBudgetCents": 200000,
      "spentCents": 134250,
      "reserveUsedCents": 0,
      "overspentCents": 0,
      "balanceCents": 65750,
    },
  ],
}
```

**Composition (server-side application service):**

```ts
// packages/budgeting/src/application/get-spendings-summary.ts (NEW)
// Pseudocode — actual implementation mirrors get-budget-home-summary.ts
async function getSpendingsSummary({
  budgetId,
  tenantId,
  month,
}): SpendingsSummary {
  const [meta, categories, perCatSpend, effectiveLimits, reserveBalances] =
    await Promise.all([
      budgetHomeSummaryRepo.getBudgetMeta(budgetId),
      categoryRepo.listForBudget(tenantId, budgetId),
      transactionRepo.spendByCategoryForMonth(tenantId, budgetId, month),
      categoryLimitRepo.effectiveForMonth(
        tenantId,
        budgetId,
        monthStart(month),
      ),
      reserveBalanceRepo.getForBudget(budgetId, tenantId),
    ]);
  return categories.map((c) => {
    const limits = effectiveLimits.get(c.id) ?? { planned: 0n, cushion: 0n };
    const active = meta.cushion_mode_enabled ? limits.cushion : limits.planned;
    const spent = perCatSpend.get(c.id) ?? 0n;
    const reserveUsed = reserveBalances.get(c.id)?.toCents() ?? 0n;
    const overspent = max(0n, spent - active - reserveUsed);
    const balance = active - spent;
    return {
      categoryId: c.id,
      plannedCents,
      cushionCents,
      activeBudgetCents,
      spentCents,
      reserveUsedCents,
      overspentCents,
      balanceCents,
    };
  });
}
```

**Reuse:** `budget-home-summary-repo.ts:getBudgetMeta` (line 51) + `topOverspentCategories` SQL pattern (line 153-189) shows the exact SCD-2 `effective_from <= monthStart < effective_to` predicate. Phase 4 adapter SQL mirrors the `WITH spent AS …, limits AS …` CTE pattern but groups by category_id and joins all categories (not only overspent).

### §4 NEW Routes Phase 4 ships

| Verb + Path                                                       | Body                     | Application service   | DB action                                                                                                                                                                        |
| ----------------------------------------------------------------- | ------------------------ | --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PUT /budgets/:budgetId/categories/sort-order`                    | `{orderedIds: string[]}` | `reorderCategories`   | `UPDATE budgeting.categories SET sort_index = data.idx FROM (VALUES …) AS data(id, idx) WHERE categories.id = data.id AND categories.tenant_id = $tenantId` (single transaction) |
| `POST /budgets/:budgetId/recurring-rules/drafts/:draftId/dismiss` | —                        | `dismissDraft`        | `UPDATE budgeting.expense_ledger SET dismissed_at = now() WHERE id = $draftId AND tenant_id = $tenantId AND confirmed_at IS NULL AND deleted_at IS NULL`                         |
| `GET /budgets/:budgetId/spendings-summary?month=YYYY-MM`          | —                        | `getSpendingsSummary` | composed read (see §3)                                                                                                                                                           |

**Tenant-leak CI gate:** Every new route registers a fixture file. CI gate currently runs 6 security tests — Phase 4 increments to **9 files** (one per new route). Plan 04-02 includes a Makefile/CI bump. Mirrors Phase 3 Plan 03-02 pattern (cited in STATE.md Phase 3 decisions).

---

## Domain Math (5-row header formula — locked by REQUIREMENTS + UI-SPEC)

**Active budget selection:**

```
active_budget = budget.cushion_mode_enabled ? category_limit.cushion_amount : category_limit.normal_amount
```

(`category_limit` resolved via SCD-2: row with `effective_from <= monthStart < effective_to` for the month being viewed; ROW-LEVEL pattern verified at budget-home-summary-repo.ts:175.)

**Spent:**

```sql
SUM(amount_converted_cents)
WHERE budget_id = $budgetId
  AND tenant_id = $budgetId
  AND category_id = $categoryId
  AND kind = 'SPENDING'
  AND transaction_date >= $monthStart AND < $monthEnd
  AND confirmed_at IS NOT NULL
  AND deleted_at IS NULL
```

(Pattern from budget-home-summary-repo.ts:153-166 — confirmed draft semantics: `confirmed_at IS NOT NULL` is what counts.)

**Reserve used:** Comes from `budgeting.category_reserve_balance` VIEW (Phase 2). Per RSCM-01 spec, this is "cumulative max(0, active_budget(m) - spent(m)) over past months minus reserves already pulled". The VIEW returns the **current available reserve balance** per category, not the "used this month" amount. Phase 4 needs to surface what's been **drawn this month** for header row 4.

**OPEN QUESTION:** The VIEW returns balance; row 4 wants "used in current month". This is either:

- (a) computed client-side as `max(0, spent_current - active_budget_current)` capped at previous-month reserve balance
- (b) a new SQL view `category_reserve_used_for_month(budget_id, month)`
- (c) included in the existing VIEW with an extra column

Recommendation: discuss-phase / plan-phase clarifies. Lowest-impact path: compute it server-side in `getSpendingsSummary` as `min(reserveAvailable, max(0n, spent - activeBudget))` — assumes RSCM-04 cascade is "first cover with active_budget, then with reserve, remainder = overspent". Verify against `category_reserve_balance` VIEW definition (Phase 2 ships it; read the migration SQL to confirm).

**Overspent (REQUIREMENTS GRID-15 verbatim):**

```
overspent = max(0, spent - active_budget - reserve_used)
```

**Balance (UI-SPEC §Color row 5):**

```
balance = active_budget - spent + reserve_used   (NOTE: sign convention — positive when under budget)
```

The UI-SPEC color rules render `balance > 0` as `--trading-up` (green) and `balance < 0` as `--destructive` (red); when `cushion_mode_enabled` AND `active_budget = cushion`, balance is computed against cushion automatically. **Confirm with planner: which sign convention exactly?** GRID requirements don't pin balance formula explicitly.

**Pitfall (Money rounding):** `amount_converted_cents` is `BIGINT` (integer cents) — no float math anywhere. Active_budget cents and reserve_used cents are also bigint. All comparisons and `max(0, …)` operate on bigint. **Never** divide cents for percentages here — header rows display absolute amounts.

---

## Architecture Patterns

### Pattern 1: dnd-kit horizontal sortable for column headers

**What:** Wrap `<CategoryColumn>` array in `<SortableContext>` with `horizontalListSortingStrategy`. Each `<CategoryColumn>` registers `useSortable({id: categoryId})`. The dashed `+` column is rendered OUTSIDE the SortableContext (D-PH4-D4 — not draggable, not droppable).

**Example (pattern is canonical; see dnd-kit horizontal-list demos):**

```tsx
// apps/web/src/components/budgeting/spendings-grid/spendings-grid-client.tsx
"use client";
import { DndContext, PointerSensor, KeyboardSensor, TouchSensor, useSensor, useSensors, closestCenter, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, horizontalListSortingStrategy } from "@dnd-kit/sortable";
import { useReorderCategories } from "@/hooks/use-reorder-categories";

export function SpendingsGridClient({ categories, ... }: Props) {
  const reorder = useReorderCategories(budgetId);
  const sensors = useSensors(
    // Activation constraint per D-PH4-D3 — drag fires only after 4px movement
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIndex = categories.findIndex(c => c.id === active.id);
    const newIndex = categories.findIndex(c => c.id === over.id);
    const newOrder = arrayMove(categories, oldIndex, newIndex);
    reorder.mutate({ orderedIds: newOrder.map(c => c.id) });
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={categories.map(c => c.id)} strategy={horizontalListSortingStrategy}>
        <div className="grid grid-cols-[repeat(var(--col-count),160px)] gap-1">
          {categories.map(c => <CategoryColumn key={c.id} category={c} ... />)}
        </div>
      </SortableContext>
      <AddCategoryColumn />
    </DndContext>
  );
}

// CategoryColumn internals — useSortable on the column wrapper
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

function CategoryColumn({ category }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: category.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };
  return (
    <div ref={setNodeRef} style={style} className="...">
      <ColumnHeader category={category} dragGripProps={{ ...attributes, ...listeners }} />
      <TransactionList categoryId={category.id} />
      <QuickEntryInput categoryId={category.id} />
    </div>
  );
}

function ColumnHeader({ category, dragGripProps }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <button {...dragGripProps} className="touch-none" aria-label={`Reorder ${category.name}`}>
          <GripVertical size={16} className="text-[var(--muted-foreground)]" />
        </button>
        <span className="text-title-sm">{category.name}</span>
        <CellWithRevealedActions onClick={...}>
          <Pen size={14} />
        </CellWithRevealedActions>
      </div>
    </div>
  );
}
```

**Critical:** `touch-none` Tailwind class on the grip handle prevents iOS Safari from claiming the touchstart for horizontal scroll. Without it, mobile drag conflicts with horizontal grid scroll (D-PH4-Q6 free-scroll).

**Source:** `[CITED: docs.dndkit.com/presets/sortable]` + verified pattern via [@dnd-kit GitHub demos](https://github.com/clauderic/dnd-kit/tree/master/stories/2%20-%20Presets/Sortable).

### Pattern 2: Optimistic POST with manual retry (TanStack Query)

**What:** Use `useMutation` with `onMutate` to snapshot + write optimistic row, `onError` to flag `unsent` (NOT rollback — keep row visible per D-PH4-Q1), `onSuccess` to replace optimistic id with server-authoritative row, `onSettled` to invalidate `spendings-summary` so header math reconciles.

**Example:**

```tsx
// apps/web/src/hooks/use-create-transaction.ts (NEW)
"use client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { clientApiFetch } from "@/lib/budget-fetch";

interface OptimisticTxn {
  id: string;
  pending: boolean;
  unsent: boolean;
  amountCents: number;
  date: string;
  categoryId: string;
  currency: string;
}

export function useCreateTransaction(budgetId: string, month: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (
      input: Omit<OptimisticTxn, "id" | "pending" | "unsent">,
    ) => {
      const res = await clientApiFetch(`/budgets/${budgetId}/transactions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": crypto.randomUUID(),
        },
        body: JSON.stringify({
          date: input.date,
          category_id: input.categoryId,
          amount_original_cents: input.amountCents,
          currency_original: input.currency,
          note: null,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      return (await res.json()).transaction;
    },
    onMutate: async (input) => {
      await qc.cancelQueries({ queryKey: ["transactions", budgetId, month] });
      const previous = qc.getQueryData(["transactions", budgetId, month]);
      const optimisticId = crypto.randomUUID();
      qc.setQueryData(["transactions", budgetId, month], (old: any) => ({
        ...old,
        transactions: [
          {
            id: optimisticId,
            pending: true,
            unsent: false,
            ...input,
            amountConvertedCents: input.amountCents.toString(),
          },
          ...(old?.transactions ?? []),
        ],
      }));
      qc.setQueryData(["spendings-summary", budgetId, month], (old: any) =>
        recomputeOptimistic(old, input),
      );
      return { previous, optimisticId };
    },
    onError: (_err, _input, ctx) => {
      if (!ctx) return;
      qc.setQueryData(["transactions", budgetId, month], (old: any) => ({
        ...old,
        transactions: old.transactions.map((t: any) =>
          t.id === ctx.optimisticId
            ? { ...t, pending: false, unsent: true }
            : t,
        ),
      }));
    },
    onSuccess: (serverRow, _input, ctx) => {
      qc.setQueryData(["transactions", budgetId, month], (old: any) => ({
        ...old,
        transactions: old.transactions.map((t: any) =>
          t.id === ctx?.optimisticId
            ? { ...serverRow, pending: false, unsent: false }
            : t,
        ),
      }));
    },
    onSettled: () => {
      qc.invalidateQueries({
        queryKey: ["spendings-summary", budgetId, month],
      });
    },
  });
}
```

**Retry path:** `TransactionRow` shows a retry icon when `unsent === true`; tapping it re-invokes `mutate(originalInput)` — TanStack Query handles concurrent invocation order via mutation key.

**Race condition (multiple Enters in <200ms):** Each Enter generates its own optimistic id + Idempotency-Key. Cache writes happen in `onMutate` (sync). Server-side idempotency middleware (Phase 1 ships it — see `apps/api/src/middleware/idempotency.ts`) dedupes if the same key arrives twice. Phase 4 generates a fresh key per Enter (NOT per row).

### Pattern 3: SCD-2 effective-dated read for header math

**Pattern (verified in budget-home-summary-repo.ts:174):**

```sql
SELECT ... FROM budgeting.category_limits cl
WHERE cl.tenant_id = $budgetId
  AND cl.effective_from <= $monthStart::date
  AND (cl.effective_to IS NULL OR cl.effective_to > $monthStart::date)
```

**Phase 4 use:** `categoryLimitRepo.effectiveForMonth(tenantId, budgetId, monthStart)` returns `Map<categoryId, {planned: bigint, cushion: bigint}>`. The CategorySlider edit PATCH calls `POST /categories/:id/limits` with `effectiveFrom = today` (or the user-picked date) — this writes a NEW SCD-2 row and the existing row's `effective_to` is set to the new row's `effective_from` (handled inside the existing `setCategoryLimit` application service — see category-limit-repo.ts).

**Race condition (concurrent SCD-2 writes):** Two users editing the same category's limit simultaneously could create two SCD-2 rows with the same `effective_from`. Phase 4 should rely on whatever locking the existing `setCategoryLimit` service uses; planner verifies via `apps/api/test/routes/category-limits.test.ts`. If absent, advisory lock per `(tenant_id, category_id)` for the duration of the SCD-2 transaction.

### Pattern 4: URL-driven month state (Temporal-backed)

**Hook:**

```ts
// apps/web/src/hooks/use-month-param.ts (NEW)
"use client";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { Temporal } from "temporal-polyfill";

export function useMonthParam(budgetTz: string = "UTC") {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const raw = params.get("month");
  const month =
    raw && /^\d{4}-\d{2}$/.test(raw)
      ? Temporal.PlainYearMonth.from(raw)
      : Temporal.Now.plainDateISO(budgetTz).toPlainYearMonth();

  function setMonth(next: Temporal.PlainYearMonth) {
    const nextStr = next.toString();
    const sp = new URLSearchParams(params);
    sp.set("month", nextStr);
    router.push(`${pathname}?${sp.toString()}`);
  }
  function prev() {
    setMonth(month.subtract({ months: 1 }));
  }
  function next() {
    setMonth(month.add({ months: 1 }));
  }
  function today() {
    setMonth(Temporal.Now.plainDateISO(budgetTz).toPlainYearMonth());
  }
  return { month, setMonth, prev, next, today };
}
```

**Cmd/Ctrl+Arrow handler (in `<MonthNavigator>`):**

```tsx
useEffect(() => {
  function onKey(e: KeyboardEvent) {
    if (!(e.metaKey || e.ctrlKey)) return;
    const tag = (document.activeElement as HTMLElement)?.tagName;
    if (
      tag === "INPUT" ||
      tag === "TEXTAREA" ||
      (document.activeElement as HTMLElement)?.isContentEditable
    )
      return;
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      prev();
    }
    if (e.key === "ArrowRight") {
      e.preventDefault();
      next();
    }
  }
  window.addEventListener("keydown", onKey);
  return () => window.removeEventListener("keydown", onKey);
}, [prev, next]);
```

**Past-month quick-entry date resolution (D-PH4-Q5):**

```ts
function resolveQuickEntryDate(
  month: Temporal.PlainYearMonth,
  today: Temporal.PlainDate,
): string {
  const currentMonth = today.toPlainYearMonth();
  if (Temporal.PlainYearMonth.compare(month, currentMonth) === 0) {
    return today.toString();
  }
  return month.toPlainDate({ day: month.daysInMonth }).toString();
}
```

`temporal-polyfill` is required for `Temporal.PlainYearMonth`. **Verify if installed:** `[ASSUMED MISSING from apps/web]` — Phase 4 Wave 0 confirms; if missing, adds `temporal-polyfill` to package.json. CLAUDE.md lists Temporal as a project standard ("Date/time: Temporal API via `temporal-polyfill`").

### Pattern 5: Single-click reveals options (universal, no hover)

**What:** A reusable wrapper hook + component that wraps any interactive surface:

```tsx
// apps/web/src/components/budgeting/spendings-grid/reveal-actions.tsx (NEW shared helper)
"use client";
import { useState, useRef, useEffect } from "react";

export function useRevealActions() {
  const [revealed, setRevealed] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!revealed) return;
    function onPointerDown(e: PointerEvent) {
      if (ref.current && !ref.current.contains(e.target as Node))
        setRevealed(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setRevealed(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [revealed]);
  return { revealed, setRevealed, ref };
}
```

**Critical anti-pattern guard (D-PH4-INT1 / UI-SPEC regression-guard):** NEVER use `onMouseEnter` / `:hover` to reveal anything. The regression test asserts that `pointermove` over a row WITHOUT click leaves DOM in resting state. Plan 04 BDD includes a `no-hover-reveal.feature` per CONTEXT D-PH4-E1.

**Double-click handler (D-PH4-INT2):** Use React's `onDoubleClick` (native browser event; debouncing built-in via `dblclick`). Mobile equivalent = double-tap, handled the same way because React maps both to `onDoubleClick`. **Inline-edit scope is amount only** on txn/draft rows; on category cells, `onDoubleClick` is a no-op (D-PH4-INT4).

### Pattern 6: Grid CSS layout + sticky month header

**Container CSS:**

```css
.spendings-grid {
  display: grid;
  grid-template-columns: repeat(var(--col-count, 1), minmax(0, 160px)) 160px;
  gap: var(--spacing-xxs);
  padding: var(--spacing-xl) var(--spacing-xl);
  overflow-x: auto;
}
@media (max-width: 768px) {
  .spendings-grid {
    grid-template-columns: repeat(var(--col-count, 1), minmax(0, 140px)) 140px;
    padding: var(--spacing-md) var(--spacing-md);
  }
}

.month-navigator {
  position: sticky;
  top: 112px;
  z-index: 30;
  background: var(--canvas-dark);
  height: 48px;
  border-bottom: 1px solid var(--hairline-dark);
}
```

**Per D-PH4-Q6:** No sticky leftmost column (mobile horizontal scrolls freely). No scroll-snap.

---

## Don't Hand-Roll

| Problem                                         | Don't Build                                                       | Use Instead                                                                       | Why                                                                                                                                                                    |
| ----------------------------------------------- | ----------------------------------------------------------------- | --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Drag-reorder column headers                     | Custom HTML5 drag-and-drop (`dragstart`/`dragover`/`drop` events) | `@dnd-kit/sortable` + `useSortable`                                               | Custom DnD has terrible touch support, accessibility (keyboard reorder via Tab+Space+arrows), and collision detection. dnd-kit handles all 3.                          |
| Optimistic mutation queue + retry               | Custom Promise-queue + state machine                              | TanStack Query `useMutation` with `onMutate`/`onError`/`onSuccess`                | Race conditions, cache invalidation, and rollback semantics are non-trivial. TanStack Query is the standard.                                                           |
| Month picker                                    | Custom date math + range calc                                     | `Temporal.PlainYearMonth` from `temporal-polyfill`                                | DST edge cases, `Date` mutability, locale-aware `daysInMonth` — Temporal API is the modern standard (CLAUDE.md mandates).                                              |
| Money math (cents to string display)            | Manual cents-to-decimal string concat                             | `Dinero.js v2` via the `Money` value object (already in `packages/shared-kernel`) | Rounding errors on conversion; locale-aware grouping; CLAUDE.md mandates Money at adapter boundary. Client receives cents + currency, formats via `Intl.NumberFormat`. |
| FX rate display                                 | Custom format string                                              | Existing `FxFreshnessBadge` + Phase 2 `transaction-capture-form` FX-line pattern  | Already battle-tested across Phase 2; cherry-pick verbatim.                                                                                                            |
| Sheet/drawer                                    | Build a custom modal + scrim                                      | `<Sheet>` primitive (`apps/web/src/components/ui/sheet.tsx`, Radix-Dialog-backed) | Focus trap, ESC handling, scroll lock, a11y — Radix does it; rolling your own breaks accessibility.                                                                    |
| Confirmation dialog (delete txn, dismiss draft) | Custom dialog                                                     | `<AlertDialog>` from `apps/web/src/components/ui/alert-dialog.tsx`                | Same as above; Radix AlertDialog enforces destructive flow conventions.                                                                                                |
| Inline-edit input                               | contentEditable div                                               | `<input>` element swapped into the cell, focused on mount                         | contentEditable has cross-browser inconsistencies + a11y issues; native input is reliable.                                                                             |
| Idempotency keys for POST                       | Manual counter                                                    | `crypto.randomUUID()` (already used in Phase 2 forms)                             | UUID v4 is the standard; idempotency middleware deduplicates server-side.                                                                                              |
| Toast notifications                             | Custom queue + portal                                             | `sonner` (`apps/web/src/components/ui/sonner.tsx`)                                | Already installed and used in Phase 2 forms.                                                                                                                           |

**Key insight:** Phase 4's complexity is in **integration** (10 components x universal interaction model x optimistic state x drag-reorder x SCD-2 effective-date reads), not in any single primitive. Every primitive has a battle-tested library; hand-rolling any of them increases risk without benefit.

---

## Common Pitfalls

### Pitfall 1: dnd-kit + horizontal-scroll gesture conflict on mobile

**What goes wrong:** TouchSensor fires on `touchstart`, but iOS Safari also wants to start horizontal page-scroll on the same gesture. Result: drag never fires, scroll never starts, user is stuck.

**Why it happens:** Touch sensor's default `activationConstraint` is missing or too lax.

**How to avoid:**

1. Restrict drag-start to the **grip handle only** (D-PH4-D3); the column body never initiates drag.
2. Apply `touch-action: none` (Tailwind `touch-none`) to the grip handle button.
3. Configure `TouchSensor` with `activationConstraint: { delay: 200, tolerance: 8 }` so a quick scroll never trips it.

**Warning signs:** Mobile user reports "drag doesn't work" OR "I can't scroll the grid horizontally on mobile". Plan 04 Vitest test asserts `touchAction: 'none'` on the grip element.

### Pitfall 2: Optimistic mutation + drag-reorder cache write race

**What goes wrong:** User drags column A to B (mutation in-flight, optimistic order is `[B, A, C, +]`). Server returns `200 OK`. Meanwhile user fires a quick-entry on column B. The quick-entry's `onSuccess` writes the cache, and the cache write contains the OLD column order (the version it captured at `onMutate`). Drag-reorder result is overwritten.

**Why it happens:** Two mutations writing the same query key with stale closures.

**How to avoid:**

1. Keep the column order and the per-column transactions in **separate query keys** — `["categories", budgetId]` vs `["transactions", budgetId, month, categoryId]`. Phase 4 should NOT bundle txns into the categories list.
2. Use `cancelQueries()` in every mutation's `onMutate` to abort in-flight refetches for the affected key.
3. After drag-reorder success, invalidate `["categories", budgetId]` so the next render re-fetches the authoritative order. Per-column txn caches are unaffected.

**Warning signs:** Drag-reorder snaps back after a quick-entry. Plan 04 BDD scenario "Reorder columns A to B, then quick-entry on B, verify order persists".

### Pitfall 3: SCD-2 versioning race on category-limit edit

**What goes wrong:** User A opens CategorySlider on category X (read `category_limits` row v1, effective_from = 2026-01-01, effective_to = NULL). User B does the same. A saves new limit with effective_from = today; v2 row created, v1 closed (effective_to = today). B saves another limit with effective_from = today; v3 row created, but v1 is already closed; SQL may either error or create an overlapping v1.5 row depending on isolation level.

**Why it happens:** SCD-2 close-then-insert is a 2-step transaction; without `SERIALIZABLE` isolation or an explicit advisory lock, two transactions can interleave.

**How to avoid:**

1. The existing `setCategoryLimit` service (apps/api/src/routes/category-limits.ts:60 then packages/budgeting/.../category-limit-repo.ts) — verify it uses an advisory lock or SERIALIZABLE.
2. If not: add `pg_advisory_xact_lock(hashtext($tenant || $categoryId || 'category_limits'))` at the top of the SCD-2 transaction.
3. Integration test in `apps/api/test/routes/category-limits.test.ts`: spawn two concurrent PATCHes with the same `effective_from`; assert exactly one row remains as the "open" version.

**Warning signs:** `effectiveForMonth(month)` returns more than one row for the same category on a single day. Phase 4 spendings-summary then double-counts. Plan 04-02 verifies via integration test.

### Pitfall 4: Money rounding on overspent compute (mixed-currency cushion)

**What goes wrong:** Category planned/cushion stored in budget currency (PLN); transaction stored in original (USD) + converted (PLN) cents; both as `bigint`. Pure-bigint math is safe. But if anyone ever divides cents for a percentage (e.g., "spent / planned = 80%"), float drift creeps in.

**Why it happens:** JavaScript Number cannot accurately represent integers > 2^53. Cents at scale fit fine; percentages do not.

**How to avoid:**

1. Phase 4 header math is **all subtraction/comparison/max**, never division. Stay in `bigint`.
2. Convert to string for display via `(cents / 100n).toString() + "." + (cents % 100n).toString().padStart(2, "0")` — pattern already in `reserve-balance-repo.ts:21`.
3. Use `Intl.NumberFormat(locale, { style: "currency", currency, minimumFractionDigits: 2 })` to format the resulting decimal string.

**Warning signs:** Header row 3 (overspent) shows `0.99 PLN` when manual math says `1.00 PLN`. Plan 04 Vitest unit-tests the `centsToDisplay` helper with edge cases (10n, 99n, 100n, 199n, 1000000n).

### Pitfall 5: TanStack Query SSR/RSC hydration mismatch on initial month

**What goes wrong:** RSC `spendings/page.tsx` fetches transactions for current month server-side. The client `<SpendingsGridClient>` mounts with `useQuery(["transactions", …])` and starts with empty cache, then refetches — flicker.

**How to avoid:**

1. Use TanStack Query's `initialData` pattern (already used in `task-banner.tsx`):
   ```tsx
   useQuery({ queryKey: ["transactions", ...], initialData: initialTxns, queryFn: fetchTxns, staleTime: 30_000 });
   ```
2. Pass the RSC-fetched data as `initialTxns` prop to the client island.
3. Set `staleTime: 30_000` (already the default in `query-provider.tsx`) so the client doesn't immediately refetch on mount.

**Warning signs:** Empty grid flashes on first paint, then fills in. Plan 04-04 Vitest asserts initial render shows server data.

### Pitfall 6: Tenant-leak risk on new routes (CI gate)

**What goes wrong:** New `PUT /budgets/:budgetId/categories/sort-order` reads `orderedIds` from body and writes them — but if it doesn't filter `WHERE tenant_id = $tenantId` in the UPDATE, a malicious user could rewrite sort order across budgets.

**How to avoid:**

1. Always operate inside `withTenantTx(TenantId(tenantId), ...)` — RLS GUCs are set, RLS policies on `categories` enforce tenant scoping at SELECT/UPDATE.
2. Defense in depth: explicit `AND tenant_id = $tenantId` in the UPDATE clause.
3. Add a tenant-leak CI gate test: create category in tenant A, send `PUT` with that category's id from tenant B's session; expect 404 or 403, NOT 200.

**Warning signs:** `make ci-gate` fails. Plan 04-02 increments tenant-leak gate from 6 to 9 files.

### Pitfall 7: dnd-kit + RSC compatibility (false alarm — but document)

**What it sounds like:** "dnd-kit requires `useId` and DOM — won't work in RSC."

**Reality:** dnd-kit is **client-only** (uses refs, DOM, event listeners). `<SpendingsGridClient>` is a client component (`"use client"` directive). All dnd-kit components live inside the client island. RSC `spendings/page.tsx` only fetches data and passes it as props. **No conflict.** The locked decision (D-PH4-S0 "RSC shell + client island") prevents this from being an issue.

**How to avoid the false alarm:** Plan 04 keeps every dnd-kit import inside `apps/web/src/components/budgeting/spendings-grid/` (all client components). RSC page does not import dnd-kit.

### Pitfall 8: Locale-aware decimal parsing in QuickEntryInput

**What goes wrong:** User types `5,96` (Polish/Ukrainian convention). Naive `parseFloat("5,96")` returns `5` (truncates at comma). Result: txn stored as 500 cents, not 596.

**How to avoid (D-PH4-Q2 locks the rule):**

```ts
function parseDecimal(input: string): number | null {
  const cleaned = input
    .replace(/[^\d.,-]/g, "")
    .replace(/,/g, ".")
    .replace(/(\..*)\./g, "$1");
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  return Math.round(parseFloat(cleaned) * 100);
}
```

**Warning signs:** Vitest unit tests fail on `parseDecimal("5,96") === 596`. Add property test: every decimal in `0.01..99999.99` round-trips through `parseDecimal(format(x))`.

### Pitfall 9: Cmd/Ctrl+Arrow hijacks browser history on macOS

**What goes wrong:** Cmd+Left/Right on macOS Chrome triggers browser back/forward. Our keyboard listener competes.

**How to avoid:** Always `e.preventDefault()` in the handler. Test in Playwright on chromium with `--mac-os` flag if available. **AND:** the handler is scoped to `keydown` on window — Safari handles this differently; if Playwright tests pass but manual Safari testing fails, add `document.addEventListener` AND a Phase 4 known-issue note.

**Warning signs:** "Cmd+Left navigates back instead of changing month". Plan 04 Gherkin scenario asserts URL stays on `/spendings` after Cmd+Left.

### Pitfall 10: `expense_ledger.dismissed_at` column may not exist

**What goes wrong:** D-PH4-R3 says dismiss sets `dismissed_at = now()`. Phase 1 schema migration MIG-08 added `tasks` table but I cannot verify `expense_ledger.dismissed_at` exists from the files I read (Phase 2 transaction-repo.ts uses `deleted_at` for soft-delete; `dismissed_at` is a different semantic).

**How to avoid:** Wave 0 spike: `\d budgeting.expense_ledger`. If missing, Plan 04-01 ships a tiny additive migration:

```sql
ALTER TABLE budgeting.expense_ledger ADD COLUMN dismissed_at TIMESTAMPTZ NULL;
```

**Warning signs:** Wave 0 fails. Plan 04-01 owns the migration if needed.

---

## Code Examples (verified or canonical)

### Example 1: RSC shell — `spendings/page.tsx` rewrite

```tsx
// apps/web/src/app/[locale]/(app)/budgets/[id]/spendings/page.tsx — REWRITE
import { getTranslations } from "next-intl/server";
import { serverApiFetch } from "@/lib/budget-fetch.server";
import { SpendingsGridClient } from "@/components/budgeting/spendings-grid/spendings-grid-client";
import { Temporal } from "temporal-polyfill";

interface PageProps {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<{ month?: string }>;
}

export default async function SpendingsPage({
  params,
  searchParams,
}: PageProps) {
  const { locale, id: budgetId } = await params;
  const { month: monthParam } = await searchParams;
  const t = await getTranslations({ locale, namespace: "grid" });

  const month =
    monthParam && /^\d{4}-\d{2}$/.test(monthParam)
      ? monthParam
      : Temporal.Now.plainDateISO().toPlainYearMonth().toString();

  const [categoriesRes, txnsRes, summaryRes, draftsRes] = await Promise.all([
    serverApiFetch(budgetId, `/budgets/${budgetId}/categories`),
    serverApiFetch(
      budgetId,
      `/budgets/${budgetId}/transactions?month=${month}&confirmed=true`,
    ),
    serverApiFetch(
      budgetId,
      `/budgets/${budgetId}/spendings-summary?month=${month}`,
    ),
    serverApiFetch(
      budgetId,
      `/budgets/${budgetId}/transactions?month=${month}&confirmed=false`,
    ),
  ]);

  const categories = categoriesRes.ok
    ? (await categoriesRes.json()).categories
    : [];
  const transactions = txnsRes.ok ? (await txnsRes.json()).transactions : [];
  const summary = summaryRes.ok
    ? await summaryRes.json()
    : { categories: [], cushionModeEnabled: false };
  const drafts = draftsRes.ok ? (await draftsRes.json()).transactions : [];

  return (
    <SpendingsGridClient
      budgetId={budgetId}
      month={month}
      categories={categories}
      initialTransactions={transactions}
      initialSummary={summary}
      initialDrafts={drafts}
      messages={{
        addExpense: t("quickEntry.placeholder"),
      }}
    />
  );
}
```

### Example 2: `useSortable` ColumnHeader (verified pattern via dnd-kit examples)

See Pattern 1 above. The key invariant: `{...attributes, ...listeners}` is spread **only onto the grip handle**, never onto the column body or header label.

### Example 3: TransactionSlider — wrapping Sheet with width override

```tsx
// apps/web/src/components/budgeting/transaction-slider.tsx
"use client";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
  SheetClose,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

const schema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  categoryId: z.string().uuid(),
  amountOrig: z.string().regex(/^\d+(\.\d{1,2})?$/),
  currencyOrig: z.string().length(3),
  note: z.string().max(500).nullable().optional(),
});

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  mode: "create" | "edit";
  initial?: Partial<z.infer<typeof schema>>;
  budgetId: string;
  categoryId?: string;
  txId?: string;
  onSuccess: () => void;
}

export function TransactionSlider({
  open,
  onOpenChange,
  mode,
  initial,
  budgetId,
  txId,
  onSuccess,
}: Props) {
  const form = useForm({
    resolver: zodResolver(schema),
    defaultValues: initial,
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-screen sm:w-[480px] sm:max-w-[480px] bg-[var(--surface-card-dark)] p-0"
      >
        <div className="flex flex-col h-full">
          <SheetHeader className="p-md border-b border-[var(--hairline-dark)]">
            <SheetTitle>
              {mode === "create" ? "New transaction" : "Edit transaction"}
            </SheetTitle>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto p-lg space-y-md">
            {/* fields */}
          </div>
          <SheetFooter className="p-md border-t border-[var(--hairline-dark)]">
            {mode === "edit" && <Button variant="destructive">Delete</Button>}
            <Button type="submit">
              {mode === "create" ? "Save transaction" : "Save changes"}
            </Button>
          </SheetFooter>
        </div>
      </SheetContent>
    </Sheet>
  );
}
```

The existing `<SheetContent>` ships with `bg-background p-6` baked in. Phase 4 width override and color override happen via Tailwind merge in `className`. **Verify visually** — DESIGN.md tokens take precedence over the default `bg-background`.

### Example 4: Inline-edit amount on TransactionRow

```tsx
"use client";
import { useState, useRef, useEffect } from "react";

interface Props {
  txnId: string;
  amountCents: number;
  onSave: (newCents: number) => void;
}

function AmountCell({ txnId, amountCents, onSave }: Props) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(centsToDisplay(amountCents));
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  function commit() {
    const cents = parseDecimal(val);
    if (cents !== null && cents !== amountCents) onSave(cents);
    setEditing(false);
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        type="text"
        inputMode="decimal"
        value={val}
        onChange={(e) => setVal(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") {
            setVal(centsToDisplay(amountCents));
            setEditing(false);
          }
        }}
        onBlur={commit}
        className="..."
      />
    );
  }
  return (
    <span onDoubleClick={() => setEditing(true)} className="text-num-md">
      {centsToDisplay(amountCents)}
    </span>
  );
}
```

---

## Runtime State Inventory

**Trigger:** Phase 4 is partially a rename / restructure of v1.0 surfaces (delete 8 v1.0 components, replace v1.0 page). The data plane itself is additive (no rename); the renames already happened in Phase 1.

| Category            | Items Found                                                                                                                                                                                                 | Action Required                                               |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| Stored data         | None new — `expense_ledger` rows persist; `categories.sort_index` already migrated MIG-07; possible `expense_ledger.dismissed_at` column add (verify Wave 0)                                                | Wave 0 schema spike; Plan 04-01 owns migration if needed      |
| Live service config | None — no n8n / Datadog / external service config keys reference Phase 4 surfaces                                                                                                                           | None                                                          |
| OS-registered state | None — no Task Scheduler / launchd / systemd registration tied to Phase 4                                                                                                                                   | None                                                          |
| Secrets/env vars    | None new — quick-entry uses existing `BETTER_AUTH_SECRET`, `DATABASE_URL_*`, `INFISICAL` env via `make restart-*`; no new env vars                                                                          | None                                                          |
| Build artifacts     | `apps/web` Docker image must rebuild after dnd-kit install (`make dev-build && make restart-web`); i18n catalog edits (`messages/en/grid.json`) require web rebuild per CLAUDE.md Local Development section | Plan 04-01 task: rebuild web image after `bun add @dnd-kit/*` |

**Phase 4-specific runtime concerns beyond rename:**

- **TanStack Query cache eviction across month change:** Switching months invalidates `["transactions", budgetId, oldMonth]`. Cache survives in memory (no eviction) but is no longer rendered. After 5 month switches, cache holds 5 months of data — fine for v1.1 (no eviction needed).
- **pg-boss worker:** Phase 2 owns the recurring-draft materialization job. Phase 4 reads its output (`expense_ledger` rows with `confirmed_at IS NULL`). No new pg-boss job in Phase 4. No action.

---

## Validation Architecture

> Per phase config, `workflow.nyquist_validation` is enabled (default). This section materializes `04-VALIDATION.md`.

### Test Framework

| Property                      | Value                                                                                                        |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Framework (component)         | Vitest 4 + RTL + happy-dom (`apps/web/test/`)                                                                |
| Framework (API integration)   | bun:test (`apps/api/test/`)                                                                                  |
| Framework (E2E)               | playwright-bdd 8 (Gherkin `.feature` + Page Objects in `tests/e2e/`)                                         |
| Config file (web)             | `apps/web/vitest.config.ts`                                                                                  |
| Config file (api)             | `bunfig.toml`                                                                                                |
| Quick run command (component) | `cd apps/web && bun run test --run -- spendings-grid`                                                        |
| Quick run command (api)       | `bun test apps/api/test/routes/spendings-summary.test.ts apps/api/test/routes/categories-sort-order.test.ts` |
| Full suite command            | `make test && make test-e2e && make ci-gate`                                                                 |
| Estimated runtime             | ~120s quick / ~10min full                                                                                    |

### Phase Requirements then Test Map

| Req ID             | Behavior                                                 | Test Type                                     | Automated Command                                                                                        | File Exists?                       |
| ------------------ | -------------------------------------------------------- | --------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| GRID-01            | Grid renders columns + month-scoped layout               | component + E2E                               | `bun run test spendings-grid-client && make test-e2e -- spendings/grid-layout`                           | Wave 0                             |
| GRID-02            | 5-row header per column                                  | component                                     | `bun run test column-header`                                                                             | Wave 0                             |
| GRID-03            | Pen on header opens CategorySlider                       | component + E2E                               | `bun run test column-header && make test-e2e -- spendings/category-edit`                                 | Wave 0                             |
| GRID-04            | Slider saves planned + cushion as SCD-2                  | API integration                               | `bun test apps/api/test/routes/category-limits.test.ts`                                                  | exists; verify SCD-2 race coverage |
| GRID-05            | Quick-entry then POST txn (optimistic)                   | component + E2E                               | `bun run test quick-entry-input && make test-e2e -- spendings/quick-entry`                               | Wave 0                             |
| GRID-06            | Below header, txns newest first                          | component (snapshot) + E2E                    | `bun run test category-column && make test-e2e -- spendings/txn-list`                                    | Wave 0                             |
| GRID-07            | Pen on txn row then TransactionSlider full edit + delete | component + E2E                               | `bun run test transaction-slider && make test-e2e -- spendings/txn-edit`                                 | Wave 0                             |
| GRID-08            | Dashed `+` opens CategorySlider create mode              | component + E2E                               | `bun run test add-category-column && make test-e2e -- spendings/category-create`                         | Wave 0                             |
| GRID-09            | Drag-reorder then persists sort_index                    | component (use-reorder-categories hook) + E2E | `bun run test use-reorder-categories && make test-e2e -- spendings/drag-reorder`                         | Wave 0                             |
| GRID-10            | Cmd/Ctrl+arrows navigate months (NOT plain arrows)       | component + E2E                               | `bun run test month-navigator && make test-e2e -- spendings/month-nav`                                   | Wave 0                             |
| GRID-11            | Past months fully editable, quick-entry date = last day  | component + E2E                               | `bun run test quick-entry-input.past-month && make test-e2e -- spendings/past-month-edit`                | Wave 0                             |
| GRID-12            | No search bar / filter chips                             | unit (file absence)                           | `! test -e apps/web/src/components/budgeting/transaction-search-bar.tsx`                                 | inline                             |
| GRID-13            | Mobile horizontal scroll                                 | E2E (viewport)                                | `make test-e2e -- spendings/mobile-scroll`                                                               | Wave 0                             |
| GRID-14            | Drafts as highlighted rows; Confirm then real txn        | component + E2E                               | `bun run test draft-row && make test-e2e -- spendings/draft-confirm`                                     | Wave 0                             |
| GRID-15            | overspent formula correct                                | API integration                               | `bun test apps/api/test/routes/spendings-summary.test.ts`                                                | Wave 0                             |
| RECR-03            | Drafts surface in target column                          | component + E2E                               | `bun run test category-column.drafts && make test-e2e -- spendings/draft-render`                         | Wave 0                             |
| RECR-04            | Confirm flips confirmed_at                               | API integration + E2E                         | `bun test apps/api/test/routes/transactions-confirm.test.ts && make test-e2e -- spendings/draft-confirm` | API exists; verify                 |
| RECR-05            | Edit draft via pen then same slider                      | component + E2E                               | `bun run test draft-row.edit && make test-e2e -- spendings/draft-edit`                                   | Wave 0                             |
| RECR-06            | Dismiss then dismissed_at set, rule continues            | API integration + E2E                         | `bun test apps/api/test/routes/drafts-dismiss.test.ts && make test-e2e -- spendings/draft-dismiss`       | Wave 0                             |
| RECR-07            | pending-drafts-inbox file deleted                        | unit (file absence)                           | `! test -e apps/web/src/components/budgeting/pending-drafts-inbox.tsx`                                   | inline                             |
| RSCM-03            | Quick-entry over budget then row 4 updates in <200ms     | E2E (timing)                                  | `make test-e2e -- spendings/reserve-deduct`                                                              | Wave 0                             |
| RSCM-04            | Reserve overflow then overspent row 3 shows remainder    | API integration + E2E                         | `bun test apps/api/test/routes/spendings-summary.cascade.test.ts && make test-e2e -- spendings/overflow` | Wave 0                             |
| (Regression-guard) | Hover does NOT reveal options on any row                 | E2E                                           | `make test-e2e -- spendings/no-hover-reveal`                                                             | Wave 0                             |
| (Regression-guard) | Double-click on category cell is NO-OP                   | E2E                                           | `make test-e2e -- spendings/category-cell-no-inline-edit`                                                | Wave 0                             |

### Sampling Rate

- **Per task commit:** `cd apps/web && bun run test --run -- <changed-component>` + `bun test apps/api/test/routes/<changed-route>.test.ts`
- **Per wave merge:** `make test` (full bun:test + Vitest)
- **Phase gate (before `/gsd-verify-work`):** `make test && make test-e2e && make ci-gate` all green

### Wave 0 Gaps

- [ ] **Install dnd-kit:** `cd apps/web && bun add @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities`
- [ ] **Verify temporal-polyfill installed:** `grep temporal-polyfill apps/web/package.json` — if missing, `bun add temporal-polyfill`
- [ ] **Schema spike — verify columns:**
  - `\d budgeting.categories` — confirm `sort_index`, `icon`, `color` columns
  - `\d budgeting.expense_ledger` — confirm `dismissed_at` column (or schedule migration)
  - `\d budgeting.category_reserve_balance` — confirm VIEW exists and check if it returns "balance" or "used-this-month"
- [ ] **Test stubs created** for each row above (red baseline)
- [ ] **`tests/e2e/features/spendings/` directory created** with placeholder feature file + `tests/e2e/pages/SpendingsPage.ts` page object
- [ ] **`tests/e2e/steps/spendings.steps.ts`** step definitions stub
- [ ] **Tenant-leak CI gate:** bump from 6 to 9 files (one per new route: sort-order, spendings-summary, drafts-dismiss)
- [ ] **i18n catalog:** `apps/web/messages/en/grid.json` namespace created with all keys from UI-SPEC Copywriting Contract (PL + UK can be empty for Phase 4; Phase 8 i18n hardening completes)
- [ ] **Vitest QueryClient wrapper:** `apps/web/test/setup/query-client.tsx` (Phase 3 may already ship — verify)
- [ ] **Field components extracted from Phase 2:** `apps/web/src/components/budgeting/fields/{amount-input,date-input,fx-preview-line}.tsx` (paves the slider builds)

---

## Security Domain

**Security enforcement:** enabled (CLAUDE.md mandates RLS + tenant isolation + 80% domain coverage).

### Applicable ASVS Categories

| ASVS Category         | Applies | Standard Control                                                                                           |
| --------------------- | ------- | ---------------------------------------------------------------------------------------------------------- |
| V2 Authentication     | yes     | Better Auth session via `authMiddleware` (existing)                                                        |
| V3 Session Management | yes     | Cookie forwarding via `serverApiFetch` (existing)                                                          |
| V4 Access Control     | yes     | `requireAuth` + `requireWorkspace` middleware + RLS GUCs (`withTenantTx`) + tenant-leak CI gate (existing) |
| V5 Input Validation   | yes     | Zod schemas on every route body + path param (existing pattern in transactions.ts:50)                      |
| V6 Cryptography       | no      | No new crypto in Phase 4; Idempotency-Key uses `crypto.randomUUID()` (Web Crypto, no hand-roll)            |

### Known Threat Patterns for Phase 4 stack

| Pattern                                                                          | STRIDE                  | Standard Mitigation                                                                                                                                               |
| -------------------------------------------------------------------------------- | ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cross-tenant category reorder                                                    | Tampering               | Use `withTenantTx`; explicit `AND tenant_id = $tenantId` in UPDATE; tenant-leak CI test (PUT sort-order with cross-tenant id then 404)                            |
| Cross-tenant draft dismiss                                                       | Tampering               | Same — `WHERE id = $draftId AND tenant_id = $tenantId AND confirmed_at IS NULL`                                                                                   |
| Cross-tenant spendings-summary leak                                              | Information Disclosure  | RLS on `budgeting.expense_ledger`, `category_reserve_balance` VIEW, `category_limits`, `categories` — all enforce `tenant_id = current_setting('app.tenant_ids')` |
| Optimistic-row id collision (client-generated UUID matches another tenant's row) | Spoofing                | Server ignores client-generated id; assigns its own UUID on insert. Client's optimistic id is local-only and replaced in `onSuccess`                              |
| SCD-2 race then duplicate "open" rows                                            | Tampering / Repudiation | Advisory lock per `(tenant_id, category_id)` for the duration of SCD-2 transaction (Pitfall 3)                                                                    |
| XSS via category name in tooltip / slider title                                  | Tampering               | React auto-escapes JSX text; never use raw HTML injection for user input. Zod validation on name field rejects HTML control chars                                 |
| Idempotency key replay across budgets                                            | Tampering               | Existing `createIdempotencyMiddleware` (apps/api/src/app.ts:54) scopes keys by tenant — verify it includes `X-Budget-ID` in the key hash                          |
| Open redirect via `?month` param                                                 | Tampering               | `month` param is regex-validated (`/^\d{4}-\d{2}$/`); never used in a redirect URL                                                                                |
| CSRF on quick-entry POST                                                         | Tampering               | Same-origin fetch + cookie auth (existing pattern via `clientApiFetch`); Better Auth session token is `SameSite=Lax`                                              |

**Specific check for Phase 4:** The new `spendings-summary` endpoint composes 4+ read paths. Each read MUST use `withTenantTx` (not `withInfraTx`). Verify the application service composition in `get-spendings-summary.ts`.

---

## Environment Availability

| Dependency                                     | Required By                                       | Available                                                   | Version | Fallback                                            |
| ---------------------------------------------- | ------------------------------------------------- | ----------------------------------------------------------- | ------- | --------------------------------------------------- |
| Bun 1.2.x                                      | All TS/JS execution                               | `[ASSUMED YES]` (CLAUDE.md mandates; Phase 1+2+3 ran on it) | —       | —                                                   |
| Docker + compose                               | Local dev + integration tests                     | `[ASSUMED YES]` (MEMORY: docker-always-on)                  | —       | —                                                   |
| PostgreSQL 15+                                 | API routes + integration tests                    | `[ASSUMED YES]` (Phase 1 ran migrations)                    | 15+     | —                                                   |
| Better Auth                                    | Session validation                                | `[ASSUMED YES]` (Phase 1+2 use)                             | latest  | —                                                   |
| Frankfurter                                    | FX rate fetch for cross-currency txn slider       | `[ASSUMED YES]` (Phase 2 ships `FrankfurterFxProvider`)     | —       | FX freshness gate degrades gracefully on outage     |
| pg-boss                                        | Recurring-draft materialization (READ in Phase 4) | `[ASSUMED YES]` (Phase 2 ships)                             | v10     | Drafts won't appear without it; verify Phase 2 test |
| Infisical (env injection for `make restart-*`) | Web/API rebuild post-dnd-kit                      | `[ASSUMED YES]` (CLAUDE.md Local Dev)                       | —       | —                                                   |

**Missing dependencies with no fallback:** None.

**Missing dependencies with fallback:**

- `@dnd-kit/{core,sortable,utilities}` — install in Wave 0 (`bun add`)
- `temporal-polyfill` — Wave 0 verification; install if absent

---

## Project Constraints (from CLAUDE.md)

Directives that constrain Phase 4 planning. The planner MUST honor each one or the plan-checker WILL flag it.

**Tech stack (locked):**

- TypeScript on **Bun 1.2.x**; **Next.js 16 (App Router)** on FE (codebase is on 15.3.2 — `[VERIFIED]`); **Hono v4.12+** on API
- **Drizzle ORM ONLY in `src/<context>/adapters/persistence/`** — domain entities are plain classes; no `drizzle-orm` import in `packages/budgeting/src/domain/` or `application/`
- **`Money` value object (Dinero v2 + big.js for crypto) at adapter boundary** — never inside domain. Client receives `{amountCents, currency}` and formats via Intl
- **Zod v3** for validation (already used in every existing route)
- **next-intl** for i18n; new namespace `grid.*` in `messages/en/grid.json`
- **TanStack Query 5** for client cache + optimistic mutations (`[VERIFIED INSTALLED]`)
- **bun:test** (backend); **Vitest 4 + happy-dom + RTL** (frontend); **playwright-bdd 8** (E2E)
- **pg-boss v10** (recurring-draft worker, Phase 2 owns)
- **Dinero v2** at the Money boundary; **never floats** for money
- **Temporal API via `temporal-polyfill`** for date/month math (CLAUDE.md mandates; verify install)

**Forbidden (CLAUDE.md "What NOT to use"):**

- Lucia (deprecated), next-pwa (unmaintained), Prisma (no native RLS), NestJS, Yup/Joi/io-ts (use Zod), moment/dayjs (use Temporal), Express (use Hono), node-cron in-process, NodeMailer raw SMTP, iron-session (use Better Auth), Auth0/Clerk (per-MAU pricing), Float for money, GraphQL for internal API

**Testing (TDD-first MANDATORY):**

- Failing test BEFORE implementation. No exceptions.
- Bug reports imply missing tests — failing reproducer first.
- Claude runs `make test` / `make test-e2e` BEFORE asking user to click anything.
- **No DB mocking in integration tests** — real Postgres (Docker).
- E2E covers golden path + main error cases for every user-facing flow.
- BDD naming convention.
- `PLAYWRIGHT_BASE_URL` from `.env.local` `APP_URL` (MEMORY).
- 80% domain coverage in `bunfig.toml` — preserve.
- Every API route then >= 1 integration test in `apps/api/test/routes/`.
- E2E uses **Gherkin (playwright-bdd) + Page Objects + fresh-user-per-scenario fixture** (MEMORY).

**Local Dev — rebuild discipline (MEMORY):**

- After editing `apps/web/**`, `apps/api/**`, `packages/**`: `make dev-build && make restart-web` (or `restart-api`)
- After installing dnd-kit: rebuild the web image
- i18n JSON edits then web rebuild (bundled at build time)
- Before reporting Phase 4 verified: **Docker on, `make test + make ci-gate` pass** (MEMORY: docker-always-on)

**DESIGN.md authority (MEMORY):**

- Binance dark canvas; single yellow accent; Inter + IBM Plex Sans; reuse primitives; impeccable sweep; e2e before done

**GSD workflow:**

- Phase 4 work routes through `/gsd-plan-phase` then `/gsd-execute-phase`
- No direct repo edits outside GSD workflow

**Authority hierarchy (top down):**

1. CLAUDE.md (this list) — locked tech and discipline directives
2. CONTEXT.md D-PH4-INT1..6, S1..4, D1..4, Q1..6, R1..5, E1..5 — phase decisions
3. UI-SPEC.md (approved 6/6 dimensions) — visual + interaction contract
4. DESIGN.md (in repo root) — token + style source of truth

---

## State of the Art

| Old Approach                        | Current Approach                                          | When Changed                  | Impact                                          |
| ----------------------------------- | --------------------------------------------------------- | ----------------------------- | ----------------------------------------------- |
| react-beautiful-dnd                 | `@dnd-kit/sortable`                                       | 2023 (rbd deprecated)         | Phase 4 uses dnd-kit                            |
| `useState` + manual optimistic      | TanStack Query `useMutation` `onMutate/onError/onSuccess` | v5 lifecycle stabilized 2023  | Phase 4 uses TanStack Query (already installed) |
| `moment.js` / `dayjs` for date math | `Temporal.PlainYearMonth` via `temporal-polyfill`         | TC39 Stage 3, polyfill stable | Phase 4 uses Temporal (CLAUDE.md mandate)       |
| `<form>` action + page reload       | RSC + client island + TanStack Query mutation             | App Router 2023               | Phase 4 follows this idiom                      |
| Hover-to-reveal actions             | Single-click reveals options                              | UX/a11y best practice         | D-PH4-INT1 codifies for Phase 4                 |
| Standalone drafts inbox page        | Inline highlighted rows in target column                  | UX consolidation              | RECR-07 + D-PH4-R1                              |

**Deprecated / outdated:**

- `react-beautiful-dnd` — unmaintained since 2023
- `moment.js` — bloat, immutability issues
- `pages` directory routing — replaced by App Router
- `getServerSideProps` — replaced by async RSC + `fetch`
- Radix `Tabs.Trigger` for deep-linkable tabs — use `<Link>` + `usePathname` (Phase 3 established)

---

## Assumptions Log

| #   | Claim                                                                                                                                                                                  | Section                      | Risk if Wrong                                                                                                                          |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| A1  | `@dnd-kit/sortable` is the project's chosen DnD lib (D-PH4-D1 locks it)                                                                                                                | Standard Stack               | LOW — npm install resolves; locked decision                                                                                            |
| A2  | `temporal-polyfill` is the date library (CLAUDE.md states it)                                                                                                                          | Pattern 4                    | LOW — install if missing in Wave 0                                                                                                     |
| A3  | `categories.icon` and `categories.color` columns exist in current schema (CategorySlider needs them)                                                                                   | Backend §2                   | MEDIUM — if absent, drop from v1.1 slider OR migrate. Spike: `\d budgeting.categories`                                                 |
| A4  | `expense_ledger.dismissed_at` column does NOT yet exist (D-PH4-R3 wants it)                                                                                                            | Pitfall 10                   | MEDIUM — Plan 04-01 adds migration if confirmed absent                                                                                 |
| A5  | `category_reserve_balance` VIEW returns balance (not used-this-month)                                                                                                                  | Domain Math §1               | MEDIUM — Phase 4 may need a new VIEW or server-side delta compute                                                                      |
| A6  | `setCategoryLimit` application service handles SCD-2 close-then-insert atomically                                                                                                      | Pitfall 3                    | MEDIUM — verify in Plan 04-02 spike                                                                                                    |
| A7  | The existing `createIdempotencyMiddleware` scopes keys by `X-Budget-ID` (no cross-tenant replay)                                                                                       | Security                     | LOW — verify in Plan 04-02                                                                                                             |
| A8  | `Sheet` primitive's default `bg-background` token resolves to the right dark surface (UI-SPEC says `--surface-card-dark`)                                                              | Example 3                    | LOW — visually verifiable; CSS override in className                                                                                   |
| A9  | Recurring-rule drafts in v1.1 don't have a separate row in a `recurring_drafts` table — they're rows in `expense_ledger` with `recurring_rule_id IS NOT NULL AND confirmed_at IS NULL` | Backend §1 + RECR data model | LOW — `[VERIFIED: transaction-repo.ts:292-342]` confirms via the `listForMonth` + `confirmed=false` query                              |
| A10 | The "Confirm" path for drafts uses `POST /transactions/:txId/confirm` (which sets `confirmed_at = now()`) rather than a separate `/recurring-rules/drafts/:id/confirm` endpoint        | Backend §1                   | LOW — `[VERIFIED]` from existing route. Original CONTEXT mentions both; the existing API is the former. Plan-phase should standardize. |
| A11 | The `task-banner.tsx` pattern (RSC initial + `useQuery({initialData})`) is the right hydration model for spendings-summary                                                             | Pitfall 5                    | LOW — proven in Phase 3                                                                                                                |
| A12 | Mobile long-press 300ms calibration (`activationConstraint.delay`) won't conflict with user reading                                                                                    | Pattern 1                    | LOW — adjustable post-launch via telemetry                                                                                             |

**Total assumed claims:** 12. All LOW–MEDIUM risk and resolvable in Wave 0 spikes or plan-phase clarification.

---

## Open Questions

1. **Does `category_reserve_balance` VIEW return the available balance or this-month's-used delta?**
   - What we know: VIEW exists (RSCM-01 ships Phase 2). `getForBudget()` returns `Map<categoryId, Money>` of balances.
   - What's unclear: UI-SPEC header row 4 ("reserves used") wants the used-this-month figure, not the available balance.
   - Recommendation: Plan 04-02 spike — read the migration that creates the VIEW. If it returns balance, compute used-this-month server-side as `min(prev_balance, max(0n, spent - active_budget))` inside `getSpendingsSummary`. If it returns used-this-month directly, bind verbatim.

2. **Schema: do `categories.icon`, `categories.color`, `expense_ledger.dismissed_at` exist?**
   - What we know: `categories.sort_index` migrated MIG-07. UI-SPEC mentions icon/color as Claude-discretion 8-preset palettes.
   - What's unclear: Phase 1 migration scope.
   - Recommendation: Wave 0 spike `\d budgeting.categories` + `\d budgeting.expense_ledger`. Plan 04-01 owns any tiny additive migration.

3. **`balance` formula sign convention for header row 5?**
   - What we know: GRID-15 locks overspent formula. UI-SPEC color rules render `balance > 0` as `--trading-up` (under budget) and `balance < 0` as `--destructive` (over).
   - What's unclear: Does `balance = active_budget - spent` or `balance = active_budget - spent + reserve_used`? When `cushion_mode_enabled` flips, what does balance show?
   - Recommendation: Plan-phase / discuss-phase confirms with user. Recommended: `balance = active_budget - spent + reserve_used` (matches UI-SPEC color rules where positive = good).

4. **Concurrent SCD-2 edit lock — present in existing `setCategoryLimit`?**
   - What we know: Phase 2 ships SCD-2 via `setCategoryLimit`.
   - What's unclear: locking strategy.
   - Recommendation: Plan 04-02 reads `category-limit-repo.ts`. If no lock, add `pg_advisory_xact_lock` keyed on `(tenant_id, category_id)`.

5. **`createIdempotencyMiddleware` tenant scoping?**
   - What we know: Middleware mounted at `app.use(createIdempotencyMiddleware())` post-tenant-guard.
   - What's unclear: Does the dedup key include the tenant?
   - Recommendation: Plan 04-02 reads `apps/api/src/middleware/idempotency.ts`. If not, ship a patch.

6. **Touch-device long-press calibration — 300ms vs 200ms vs 150ms?**
   - What we know: D-PH4-D3 says drag activates on pointerdown on grip (no long-press for drag-start). What about reveal-actions on row body?
   - What's unclear: UI-SPEC says "long press 300ms = single click equivalent on touch" — does this mean reveal-actions waits 300ms before firing on touch?
   - Recommendation: Default 300ms for touch reveal (matches `<button>` tap delay); calibrate post-launch.

7. **`spendings-summary` payload shape — extend `BudgetHomeSummaryRepo` or new repo/service?**
   - What we know: `BudgetHomeSummaryRepo` returns just the home-summary aggregate (spent + wallets + top-overspent).
   - What's unclear: Whether to extend it or ship a new repo.
   - Recommendation: New `SpendingsSummaryRepo` port + adapter. Cleaner; Phase 4 owns it; doesn't bloat home-summary.

---

## Sources

### Primary (HIGH confidence — verified by file read or registry)

- `/home/claude/budget/.planning/phases/04-spendings-grid/04-CONTEXT.md` — 24 D-PH4 decisions, locked
- `/home/claude/budget/.planning/phases/04-spendings-grid/04-UI-SPEC.md` — 824-line approved visual + interaction contract
- `/home/claude/budget/.planning/REQUIREMENTS.md` — 22 REQ-IDs (GRID-01..15, RECR-03..07, RSCM-03..04)
- `/home/claude/budget/.planning/ROADMAP.md` — Phase 4 success criteria + carry-forward
- `/home/claude/budget/CLAUDE.md` — tech stack, testing rules, forbidden libs
- `/home/claude/budget/apps/web/package.json` — Next 15.3.2, React 19, TanStack Query 5, playwright-bdd 8 verified
- `/home/claude/budget/apps/api/src/routes/transactions.ts` — verified all 6 endpoints (POST, PATCH, confirm, DELETE, list, get)
- `/home/claude/budget/apps/api/src/routes/categories.ts` — verified CRUD endpoints
- `/home/claude/budget/apps/api/src/routes/category-limits.ts` — verified SCD-2 POST endpoint
- `/home/claude/budget/apps/api/src/routes/recurring-rules.ts` — verified rule CRUD (no draft-dismiss endpoint yet)
- `/home/claude/budget/apps/api/src/app.ts` — verified middleware order + route mounting
- `/home/claude/budget/apps/api/src/boot.ts` — verified `BootedDeps` shape
- `/home/claude/budget/packages/budgeting/src/adapters/persistence/transaction-repo.ts` — verified `listForMonth` returns draft semantics; `confirm()`, `softDelete()` already exist
- `/home/claude/budget/packages/budgeting/src/adapters/persistence/reserve-balance-repo.ts` — verified `getForBudget(budgetId, tenantId)` reads the VIEW
- `/home/claude/budget/packages/budgeting/src/adapters/persistence/budget-home-summary-repo.ts` — verified the SCD-2 + per-category SQL pattern (line 153-189)
- `/home/claude/budget/apps/web/src/components/ui/sheet.tsx` — verified Radix Dialog backing, `side="right"` variant, default width
- `/home/claude/budget/apps/web/src/components/providers/query-provider.tsx` — verified `staleTime: 30_000`, `refetchOnWindowFocus: false`
- `/home/claude/budget/apps/web/src/components/budgeting/task-banner.tsx` — verified TanStack Query + `initialData` + `refetchInterval` pattern (the optimistic-polling exemplar)
- `/home/claude/budget/apps/web/src/components/budgeting/transaction-capture-form.tsx` — verified the field components Phase 4 cherry-picks
- `/home/claude/budget/apps/web/src/components/budgeting/pending-drafts-inbox.tsx` — verified file exists and is deletable per RECR-07
- `/home/claude/budget/apps/web/src/app/[locale]/(app)/budgets/[id]/layout.tsx` — verified Phase 3 sticky frame (`top:64`, `z-40`)
- `/home/claude/budget/apps/web/src/app/[locale]/(app)/budgets/[id]/spendings/page.tsx` — verified current placeholder is the rewrite target
- `/home/claude/budget/apps/web/playwright.config.ts` — verified playwright-bdd config + features dir
- `/home/claude/budget/tests/e2e/fixtures/freshUser.ts` — verified fresh-user-per-scenario fixture exists
- `/home/claude/budget/tests/e2e/features/budget/` — verified existing Gherkin feature directory
- `/home/claude/budget/.planning/phases/03-navigation-home-bdp-frame/03-RESEARCH.md` — Phase 3 patterns carry-forward
- `/home/claude/budget/.planning/STATE.md` — accumulated decisions; Phase 3 completion status
- npm registry: `@dnd-kit/core@6.3.1`, `@dnd-kit/sortable@10.0.0`, `@dnd-kit/utilities@3.2.2`, `@tanstack/react-query@5.100.10`, `next@16.2.6` (verified 2026-05-13 via `npm view`)

### Secondary (MEDIUM confidence — cited from docs/training; not freshly fetched in this session)

- [dnd-kit docs — Sortable preset, horizontal list strategy, sensors, accessibility](https://docs.dndkit.com/presets/sortable) — pattern source
- [TanStack Query v5 — Optimistic updates with onMutate/onError/onSuccess](https://tanstack.com/query/v5/docs/framework/react/guides/optimistic-updates)
- [Radix UI Dialog — focus trap, scroll lock, accessibility](https://www.radix-ui.com/primitives/docs/components/dialog)
- [Temporal proposal + temporal-polyfill](https://github.com/js-temporal/temporal-polyfill) — date math
- [Next.js 15 App Router — searchParams, async params, Server Components](https://nextjs.org/docs/app/api-reference/file-conventions/page#searchparams-optional)

### Tertiary (LOW confidence — needs verification in Wave 0)

- `categories.icon` / `categories.color` column existence — schema spike
- `expense_ledger.dismissed_at` column existence — schema spike
- `category_reserve_balance` VIEW columns — read migration SQL
- `setCategoryLimit` SCD-2 lock strategy — read repo code
- `createIdempotencyMiddleware` tenant scoping — read middleware code

---

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH — all primitives verified present in `package.json` and `components/ui/`; only dnd-kit + (maybe) temporal-polyfill are net-new installs
- Architecture: HIGH — RSC + client island pattern proven in Phase 3 (task-banner is the optimistic-poll exemplar); 24 D-PH4-XX decisions remove all major branch points
- Backend surface: HIGH — every existing route verified by file read; new routes (sort-order, dismiss, spendings-summary) have a clear template from existing routes
- Domain math: MEDIUM — overspent formula is locked, but `reserve_used` semantics from the VIEW need Wave 0 spike (Open Q1)
- Pitfalls: HIGH — 10 pitfalls drawn from real codebase patterns + dnd-kit known gotchas + TanStack Query race conditions
- Test strategy: HIGH — every REQ-ID mapped to a test file; framework already in place (Vitest, bun:test, playwright-bdd)
- File map: HIGH — every delete verified to exist (8/8); every create has a UI-SPEC component contract

**Research date:** 2026-05-13
**Valid until:** 2026-06-12 (30 days for stable Phase 2 schema + Phase 3 frame; Phase 4 should execute well within window)

---

## RESEARCH COMPLETE

# Phase 4: Spendings Grid - Context

**Gathered:** 2026-05-13
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 4 ships the **Excel-like Spendings tab** — the core product surface inside the BDP frame Phase 3 built. Scope:

- Column-per-category grid (current month by default, `?month=YYYY-MM` for others).
- 5-row column header: `name` · `planned-or-cushion` · `overspent` (computed) · `reserves-used` (computed) · `balance` (computed). Active budget = `cushion` when `budget.cushion_mode_enabled` else `planned`. Overspent = `max(0, spent − active_budget − reserve_used)`.
- Bottom **quick-entry input** per column — numeric + Enter → POST `EXPENSE` txn (date defaults: today for current month, last-day-of-month for past months; category = this column; currency = budget default; note = null). Single click on the bottom slot also reveals options (acts as quick-entry affordance).
- Below header, current-month txns for that category, newest first.
- **Universal interaction model** (applies to every row: txn, draft, bottom quick-entry slot, category header cells): **single click reveals action options as floating icons** (desktop AND mobile — no hover behavior anywhere). **Double-click (or double-tap on mobile) triggers inline quick-edit** (cell turns into input, Enter saves, Esc cancels). Pen icon in revealed options opens the corresponding slider for full-field editing. **No hover state is used to expose actions** — keeps desktop and mobile interaction identical, eliminates "hover-discoverable-only" a11y problems.
- Pen icon on column header → opens **Category slider** in edit mode (planned + cushion, saved as SCD-2 `category_limits` version). Category cells (name, planned, cushion) are NEVER inline-editable — they always route to the slider, because the slider also carries icon + color + cushion-mode controls.
- Dashed `+` column at far right → opens Category slider in create mode (name, planned, cushion, optional icon/color); locked position, not draggable, not droppable.
- Drag-to-reorder column headers (drag handle = GripVertical lucide icon); persists to `categories.sort_index` per-budget.
- Month navigation: dedicated `‹ ›` buttons + Cmd/Ctrl + ←/→ keyboard shortcut; plain arrow keys reserved for input/cursor (deliberate softening of GRID-10 to prevent accidental jumps while typing — see Specific Ideas).
- Past months fully editable (NOT read-only as success-criterion 4 wording suggests; see Specific Ideas for user override).
- **Recurring drafts** rendered inline in their target column as highlighted rows. Single click reveals options `[Confirm] [✏ Edit-via-slider] [× Dismiss]`. Double-click on the amount cell inline-edits the amount; Enter promotes the draft to a real txn with the edited amount. Confirm button (revealed in options) promotes unchanged. Edit (pen icon) opens Transaction slider pre-filled for full-field edit. Dismiss marks `dismissed_at = now()` on this occurrence only; rule keeps running.
- **Real-time reserve-deduction**: when a quick-entry txn pushes a category over its active budget, row 4 of header updates within ~200ms via optimistic local recompute; background refetch reconciles within 1–2s.
- Delete from v1.0 surface: `transaction-search-bar.tsx`, `transaction-filter-chips.tsx`, `bulk-action-bar.tsx`, `transaction-capture-form.tsx`, `transaction-capture-sheet.tsx`, the standalone pending-drafts-inbox page (GRID-12, RECR-07).

**Requirements locked:** GRID-01…15, RECR-03…07, RSCM-03/04. See `.planning/REQUIREMENTS.md` §Spendings Grid (GRID) and `.planning/ROADMAP.md` §Phase 4.

</domain>

<decisions>
## Implementation Decisions

### Interaction model (universal)

- **D-PH4-INT1:** **Single click reveals options** on every interactive surface — txn rows, draft rows, bottom quick-entry slot, category header cells. Desktop AND mobile: one click/tap → floating action icons appear (pen, delete, draft-specific Confirm/Dismiss). **No hover behavior anywhere in the grid.** Identical interaction model across breakpoints. Eliminates hover-only-discoverable a11y problems and matches the mobile-first PWA constraint from PROJECT.md.
- **D-PH4-INT2:** **Double-click (desktop) / double-tap (mobile) = inline quick-edit**. Cell becomes input in place. Enter saves; Esc cancels. Click and double-click are the only two interaction primitives — no hover, no long-press for action reveal (long-press is reserved for the drag-handle activation per D-PH4-D3).
- **D-PH4-INT3:** **Inline-edit scope is narrow** — only fields _visible in the cell_ are inline-editable. For txn rows, only **amount** is visible → only amount is inline-editable. Note, date, currency, category require slider via pen.
- **D-PH4-INT4:** **Category cells are NEVER inline-editable** — name, planned, cushion all open the Category slider via pen icon. Reason: slider carries the icon/color/cushion-mode controls; users editing a category should see and adjust all of these together.
- **D-PH4-INT5:** **Draft rows follow the same model**. Double-click amount → input mode → Enter = save edit AND promote draft (single keystroke shortcut). Confirm button (revealed in options) promotes unchanged. Pen icon → full slider edit. Dismiss icon → per-occurrence skip with confirmation dialog.
- **D-PH4-INT6:** **Slider opens only via pen icon in revealed options** — never on plain click of a cell. Keeps the inline-edit and slider-edit paths visually distinct.

### Side-slider architecture

- **D-PH4-S1:** **Two separate sliders** — `TransactionSlider` (handles create + edit; edit shows Delete) and `CategorySlider` (handles create + edit). Rejected unified-slider-with-mode-prop. Cleaner domain split; each form has its own field set.
- **D-PH4-S2:** **Cherry-pick existing field components** from Phase 2 `transaction-capture-form.tsx` + `transaction-edit-form.tsx`: `CurrencyAllowlistPicker`, BinancePlex `AmountInput`, `DateInput`, `FxFreshnessBadge`. Build fresh slider shells around them. Drop EXPENSE/INCOME/TRANSFER kind switcher — Phase 4 quick-entry is EXPENSE-only. Drop v1.0 filter chips.
- **D-PH4-S3:** **Slider sizing** — desktop 480px right-slide (matches existing Phase 2 Sheet variant `apps/web/src/components/ui/sheet.tsx`), mobile full-screen. Use Radix Dialog underneath (`<Sheet side="right">`).
- **D-PH4-S4:** Dashed `+` column triggers the SAME `CategorySlider` component in create mode — no separate "new category" component. On save, new column appears at far right (max `sort_index + 1`).

### Drag-reorder

- **D-PH4-D1:** **`@dnd-kit/sortable`** — new dependency. First-class keyboard a11y (Tab/Space/arrows), touch + pointer events, RSC-friendly, ~20kb. Already idiomatic in shadcn ecosystem.
- **D-PH4-D2:** **Persist via single PUT** `/budgets/:id/categories/sort-order` with body `{orderedIds: [...]}` on drag-end. Server rewrites `categories.sort_index = 1..N` in one transaction. Last-write-wins; no race-condition gymnastics. Optimistic local reorder before server confirms.
- **D-PH4-D3:** **Drag affordance** — `GripVertical` lucide icon in column header is **always visible** (no hover-to-reveal — consistent with D-PH4-INT1 no-hover rule). Drag initiates on pointerdown on the grip only; never from the header label. On mobile, pointerdown on the grip starts the drag immediately. Avoids conflicts with the grid's horizontal-scroll gesture by constraining the drag-start target to the small grip-icon hit area.
- **D-PH4-D4:** Dashed `+` column is **not draggable and not a drop target**. Constrained at far right. dnd-kit `disabled` flag on the SortableContext item.

### Quick-entry + month navigation

- **D-PH4-Q1:** **Optimistic insert with manual-retry on server error**. On Enter: (1) clear input, (2) prepend optimistic row in column list with a `pending` flag, (3) POST `/transactions`, (4a) on success, swap optimistic row with server-authoritative version (real id, fxRate, fxRateDate), (4b) on error, keep row but flag `unsent` and replace pending spinner with a **retry/reload icon** the user can tap to re-POST. No silent failures.
- **D-PH4-Q2:** **Accept both `.` and `,`** as decimal separators; normalize to `.` on submit. `<input inputMode="decimal" />` for mobile numeric keypad. Strip everything but digits + first separator. Matches Polish/Ukrainian/English locale habits without per-locale gating.
- **D-PH4-Q3:** **Month navigation** — dedicated `‹ ›` buttons in the sticky tab header + **`Cmd/Ctrl + ←/→`** keyboard shortcut. Plain arrow keys ARE NOT bound to month navigation — they keep their native cursor/scroll behavior. **Deliberate softening of GRID-10's "arrow keys" wording** to prevent accidental month-jumps when users are typing in quick-entry inputs or slider fields.
- **D-PH4-Q4:** **Month state in URL search param** `?month=YYYY-MM`. Bookmarkable, shareable, browser-back works. RSC re-renders grid for the new month. Page route stays `/budgets/[id]/spendings`; only the param changes. Default = current month (computed from server-time, Temporal API, budget's TZ).
- **D-PH4-Q5:** **Past months fully editable**, NOT read-only. Quick-entry input remains active on past months; new txn defaults to **last day of viewed month** (e.g., viewing March 2026 → txn dated 2026-03-31). Pen-edit unchanged. **Deliberate user override of success-criterion 4 wording** ("read-only quick-entry mode") — see Specific Ideas.
- **D-PH4-Q6:** Mobile grid uses **horizontal scroll** (GRID-13); no scroll-snap (free scroll); no sticky leftmost column. Each column ~140–160px wide; header rows stack vertically as designed.

### Recurring drafts + reserve refresh

- **D-PH4-R1:** **Draft row visual** — `surface-elevated-dark` background tint (one step lighter than canvas) + 3px **dashed yellow left border** as decoration. Yellow on the left edge is decoration-only; the solid yellow `Confirm` button keeps the "yellow = primary action" DESIGN.md rule.
- **D-PH4-R2:** **Single click reveals action options** on draft rows (universal pattern per D-PH4-INT1): `[Confirm]` (button-primary-pill yellow → promotes unchanged), `[✏ Edit]` (pen icon → opens Transaction slider pre-filled), `[× Dismiss]` (muted icon → per-occurrence skip). Plus per D-PH4-INT5: **double-click amount cell → inline edit → Enter promotes draft with the new amount in one shot** (power-user shortcut). Confirm-button-click is the no-edit path; double-click+Enter is the edit-and-promote path. **No hover state.**
- **D-PH4-R3:** **Dismiss semantics** — sets `dismissed_at = now()` on the pending draft (this occurrence only). The recurring rule **keeps running** and will materialize next month's draft on schedule. Lightweight confirmation dialog: "Skip [Rule name] for [Month]?". No accidental rule-killing.
- **D-PH4-R4:** **Reserve-deduction refresh strategy** — optimistic local recompute on quick-entry: client knows `spent_after = spent_before + amount_default`, recomputes `overspent / reserves_used / balance` using the locked formula (`max(0, spent − active_budget − reserve_used)`) and renders header within ~50ms. Background `GET /budgets/:id/spendings-summary?month=YYYY-MM` reconciles within 1–2s; on mismatch, swap silently with server values (no flicker). No SSE/WebSocket (deferred to Phase 8).
- **D-PH4-R5:** Background revalidate also triggers after Confirm/Dismiss/category-edit/drag-reorder for consistency.

### Engineering discipline

- **D-PH4-E1:** **Phase 4 is the BDD-rewrite frontier for the grid** — every user-facing flow ships with a `.feature` scenario in `tests/e2e/features/spendings/` per the project's CLAUDE.md TDD-First rule. Minimum scenarios: quick-entry happy path, optimistic-with-retry, drag-reorder persistence, dashed-+ create-category, month-nav (button + Cmd/Ctrl-arrow), draft confirm-unchanged, draft double-click-edit-and-promote, draft dismiss, past-month quick-entry → last-day-of-month, mobile horizontal-scroll, **single-click-reveals-options on every row type** (txn, draft, bottom slot, category header), **double-click-inline-edits amount on txn rows**, **double-click on category cells does NOT inline-edit** (always slider), **hover does NOT reveal options** (regression-guard scenario asserts no action icons appear on pointer-move-only).
- **D-PH4-E2:** **Vitest component tests** for every new client component (`TransactionSlider`, `CategorySlider`, `SpendingsGrid`, `ColumnHeader`, `QuickEntryInput`, `DraftRow`, drag-reorder hook); >= 80% domain coverage threshold preserved.
- **D-PH4-E3:** **Backend integration tests** for the new PUT sort-order route, draft confirm/dismiss endpoints (if not already in Phase 2), and the `spendings-summary` query — real Postgres, tenant-leak gate in CI.
- **D-PH4-E4:** No DB mocking. Run `make test`, `make test-e2e`, `make ci-gate` before marking phase verified — per memory `Always test with Docker turned on`.
- **D-PH4-E5:** Run `impeccable` sweep on the grid + sliders before final commit — DESIGN.md visual contract verification.

### Claude's Discretion

- Choice of client cache lib for optimistic mutations and retry queue. Recommendation: **TanStack Query** (`@tanstack/react-query`) — fits the optimistic-update + reconcile pattern natively (`onMutate` / `onError` / `onSettled` lifecycle), and queryClient invalidation on POST txn cascades to refresh `spendings-summary`. If the codebase already has another data-fetching primitive in client components, defer to it. Verify during research.
- Internal RSC/client split: keep the page shell (`spendings/page.tsx`) RSC for initial data fetch (categories + month txns + summary + drafts), use a client island `<SpendingsGridClient>` for the interactive surface (grid layout, drag, quick-entry, sliders, drafts). Phase 3 already proved this split for the BDP frame.
- Exact `surface-elevated-dark` token for draft-row bg — pick from DESIGN.md tokens during implementation; if the existing token reads too close to canvas, request a new token via PR comment, do not freelance hex.
- Optimistic-row "pending" vs "unsent" visual states — small spinner vs retry icon position. Standard skeleton.
- Touch-device long-press duration calibration (default 300ms; adjust if usability testing flags pain).
- Reserves-summary endpoint exact shape (extend existing `/budget-home-summary` or new `/spendings-summary`) — investigate Phase 2 RSCM surface and reuse if possible.
- Mobile column width (140–160px range); decide based on rendered density during sketch.

</decisions>

<canonical_refs>

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Roadmap & requirements

- `.planning/ROADMAP.md` §Phase 4: Spendings Grid — goal, dependencies, success criteria
- `.planning/REQUIREMENTS.md` §Spendings Grid (GRID) — GRID-01…15 line-item requirements
- `.planning/REQUIREMENTS.md` §Recurring Drafts (RECR) — RECR-03…07 (draft surfacing in grid)
- `.planning/REQUIREMENTS.md` §Reserves Auto-Compute (RSCM) — RSCM-03/04 (reserve-deduction wiring)

### Project conventions

- `.planning/PROJECT.md` §Key Decisions, §Constraints — Money value object, RLS, append-only ledger
- `CLAUDE.md` §Testing — TDD-first mandate, BDD naming, no DB mocking, 80% domain coverage
- `DESIGN.md` — Binance dark canvas, single yellow accent (primary action), Inter + IBM Plex Sans typography, surface-elevated-dark / trading-up / trading-down tokens
- `bunfig.toml` — coverage threshold

### Phase 3 carry-forward (locked decisions still in force)

- `.planning/phases/03-navigation-home-bdp-frame/03-CONTEXT.md` — BDP tab frame, sticky pill tabs (D-PH3-01: no scroll-aware shrink), Radix Sheet primitive in use, top-nav budget switcher
- `.planning/STATE.md` §Accumulated Context — multi-phase decisions index

### Existing UI assets to reuse

- `apps/web/src/components/ui/sheet.tsx` — Radix Dialog–backed Sheet primitive (right-side variant, 480px desktop)
- `apps/web/src/components/budgeting/transaction-capture-form.tsx` — extract currency/amount/date/FX field components
- `apps/web/src/components/budgeting/transaction-edit-form.tsx` — extract edit-mode logic
- `apps/web/src/components/budgeting/fx-freshness-badge.tsx` — stale FX visual indicator
- `apps/web/src/components/ui/{button,input,label,select,popover,dropdown-menu,tabs}.tsx` — primitives
- `apps/web/src/lib/budget-fetch.server.ts` (server) + corresponding client variant — API fetch helpers

### Existing routes & files to delete/replace

- `apps/web/src/app/[locale]/(app)/budgets/[id]/spendings/page.tsx` — Phase 3 placeholder; **rewrite** as RSC shell hosting `<SpendingsGridClient>`
- `apps/web/src/components/budgeting/transaction-list.tsx` — **delete** (replaced by per-column txn list inside grid)
- `apps/web/src/components/budgeting/transaction-search-bar.tsx` — **delete** (GRID-12)
- `apps/web/src/components/budgeting/transaction-filter-chips.tsx` — **delete** (GRID-12)
- `apps/web/src/components/budgeting/bulk-action-bar.tsx` — **delete** (GRID-12)
- `apps/web/src/components/budgeting/transaction-capture-form.tsx` — **delete after extracting field components**
- `apps/web/src/components/budgeting/transaction-capture-sheet.tsx` — **delete** (replaced by `TransactionSlider`)
- `apps/web/src/components/budgeting/transaction-row-edit.tsx` + `transaction-row-client.tsx` — **delete** (replaced by per-column row + pen-icon slider)
- `apps/web/src/components/budgeting/edit-history-panel.tsx` — **defer decision**; not required by GRID; keep if cheap, delete if it slows the rewrite
- Standalone pending-drafts-inbox page — **delete** (RECR-07; drafts now inline in grid)

### Backend touchpoints (Phase 2)

- `apps/api/src/routes/transactions.ts` — POST/PATCH/DELETE/list endpoints already in place; verify schema accepts `(date, categoryId, amount, currency, note)` for quick-entry POST
- `apps/api/src/routes/categories.ts` — list + create; **new route needed**: PUT `/budgets/:id/categories/sort-order`
- `apps/api/src/routes/category-limits.ts` — SCD-2 versioning on planned/cushion edits already supported
- `apps/api/src/routes/recurring-rules.ts` — pending-draft list + confirm + dismiss endpoints; verify dismiss = per-occurrence (not rule-stop)
- `packages/budgeting/src/adapters/persistence/category-limit-repo.ts` — effective-dated reads
- `packages/budgeting/src/adapters/persistence/reserve-balance-repo.ts` — RSCM view backing reserves-used computation
- New (or extension): `GET /budgets/:id/spendings-summary?month=YYYY-MM` returning per-category `{spent, plannedActive, reserveUsed, overspent, balance}` — confirm whether existing `/budget-home-summary` covers this or a new endpoint is needed

### CI gates & tests

- `make test` — bun:test backend unit + integration
- `make test-e2e` — Playwright BDD against running stack (PLAYWRIGHT_BASE_URL from `.env.local` APP_URL per memory)
- `make ci-gate` — tenant-leak CI gate; new files MUST be covered
- `cd apps/web && bun run test` — Vitest component tests
- `apps/web/playwright.config.ts` — BDD config, fresh-user-per-scenario fixture
- `tests/e2e/features/` — Gherkin scenarios (new: `spendings/*.feature`)

</canonical_refs>

<code_context>

## Existing Code Insights

### Reusable Assets

- **Sheet primitive** (`apps/web/src/components/ui/sheet.tsx`) — Radix Dialog–backed right-side panel; already used by Phase 2 transaction sheet. Phase 4 sliders wrap it directly.
- **Phase 2 field components** — currency picker, BinancePlex amount input, date input, FX freshness badge are tested and accessible. Extract to shared `apps/web/src/components/budgeting/fields/` directory.
- **BDP frame** — `(app)/budgets/[id]/layout.tsx` hosts the sticky pill tabs and task banner; Spendings tab is one of the tab routes.
- **Phase 2 API surface** — transactions, categories, category-limits, recurring-rules routes already exist. Phase 4 adds one new route (PUT sort-order) and confirms one existing route shape (spendings-summary or extension to home-summary).
- **lucide-react icons** in `apps/web/package.json` — `Pen`, `Plus`, `GripVertical`, `Check`, `X`, `RefreshCw`, `ChevronLeft`, `ChevronRight` all available.

### Established Patterns

- **RSC page shell + client island for interactivity** — Phase 3 used this for the BDP frame (RSC fetches budget data, client island handles tab navigation). Phase 4 repeats: RSC `spendings/page.tsx` fetches initial data; `<SpendingsGridClient>` owns drag/quick-entry/slider state.
- **Optimistic mutation + revalidate** — pattern to introduce in Phase 4 if not already present; TanStack Query lifecycle (`onMutate` / `onError` / `onSettled`) is the standard primitive.
- **URL-driven state for navigation** — Phase 3 home page and BDP tabs already use route segments; month picker follows the same model with a `?month=` search param (read in RSC via `searchParams`).
- **Money value object at adapter boundary** — domain stays UI-agnostic; client receives `{ amountDefault, currencyDefault, fxRate, fxRateDate }` and formats with `Intl.NumberFormat`.
- **SCD-2 effective-dated reads** for `category_limits` — Phase 2 repo handles this; the Category slider PATCHes a new version row, never updates in-place.

### Integration Points

- **Quick-entry POST** → `POST /transactions` with `{ kind: "EXPENSE", date, categoryId, amount, currency, note: null }`. Server already computes `amount_converted_cents` (`T-02-02`); client never sends it.
- **Drag reorder** → `PUT /budgets/:id/categories/sort-order` (NEW route); Phase 4 adds the route + integration test.
- **Category create/edit slider** → `POST /categories` (create) + `PATCH /category-limits` (planned/cushion SCD-2 version).
- **Draft confirm** → `POST /recurring-rules/drafts/:id/confirm`; **Draft dismiss** → `POST /recurring-rules/drafts/:id/dismiss`. Verify both endpoint shapes in Phase 2 code; if missing, add to this phase's plan.
- **Spendings summary** → `GET /budgets/:id/spendings-summary?month=YYYY-MM` (verify if it exists or extend `/budget-home-summary`); returns the RSCM-derived per-category aggregates that drive the 5-row header.
- **Task banner from Phase 3** stays mounted at top of BDP frame — Phase 4 must not break the 60s poll.

</code_context>

<specifics>
## Specific Ideas

- **User override of success-criterion 4 wording** — the ROADMAP says past months render "in read-only quick-entry mode". User explicitly overrode this during discussion: past months are **fully editable**, with quick-entry defaulting to last-day-of-month. This is a deliberate, conscious deviation from the literal success-criterion text; the _intent_ (let users edit past txns) is preserved and extended. Downstream verification gates and Gherkin scenarios should assert against the user's decision, not the literal ROADMAP wording.
- **User override of GRID-10 arrow-key wording** — GRID-10 says "Arrow keys ←/→ navigate to prev/next month". User chose `Cmd/Ctrl + ←/→` instead, plus dedicated `‹ ›` buttons. Reason: plain arrows hijack cursor in inputs and cause accidental month jumps. Same override pattern: intent preserved (keyboard month nav), implementation softened.
- **Yellow accent stays disciplined** — DESIGN.md "yellow reserved for primary actions" is honored: solid yellow only on the `Confirm` button on draft rows. The yellow on the dashed left-border of draft rows is decorative-only, same pattern as Phase 3's sticky pill underline.
- **Manual retry, no auto-retry** — user explicitly chose visible retry icon over silent auto-retry. Failed sends stay visible until user acts.
- **Drag handle, not whole-row drag** — explicit affordance per user pick; prevents conflicts with horizontal-scroll on mobile.
- **Two sliders, not one** — user rejected unified-slider abstraction; clean Transaction-vs-Category domain split.
- **Universal single-click-reveals-options + double-click-inline-edits interaction model** — user pivoted from initial draft-only inline-button pattern to a grid-wide rule: every interactive surface (txn row, draft row, bottom quick-entry slot, category header cell) reveals action options on **single click only** (NOT hover); double-click triggers inline quick-edit; pen icon in revealed options opens slider for full edit. **Hover is explicitly out of the model** — desktop and mobile use the identical primitives (click + double-click / tap + double-tap). Inline-edit is scoped to fields visible in the cell (txn rows: amount only; category cells: never — always slider). This is the most important UX rule of Phase 4 — every component design must respect it.
- **Draft double-click amount + Enter = edit-and-promote in one keystroke** — power-user shortcut layered on top of the Confirm button. Both paths land at the same end state (`confirmed_at = now()` + new txn).

</specifics>

<deferred>
## Deferred Ideas

- **SSE/WebSocket real-time updates** for reserve-deduction — Phase 4 uses optimistic local + background revalidate. SSE candidate for Phase 8 launch hardening or post-launch if polling pressure becomes visible. (Already noted in Phase 3 deferred ideas.)
- **Scroll-aware sticky shrink** for the month-header + pill tabs — rejected at Phase 3 (D-PH3-01); revisit only if mobile usability testing during Phase 4 flags vertical-space pressure on the grid.
- **Per-category icon/color picker UX** — Category slider supports optional icon + color (GRID-08), but the exact picker affordance (palette swatches vs hex input vs preset library) is open; default to a small preset palette + 8 lucide icon choices for v1.1; richer customization is Phase 8+.
- **Fractional / lexorank sort_index** — rejected for v1.1 in favor of full-array PUT. Revisit only if multi-user concurrent reorder becomes a real workflow (unlikely until v1.2+ shared budgets see heavy use).
- **Swipe-actions on mobile draft rows** — rejected for visual/breakpoint consistency. Could be added later as an enhancement once tap-to-expand has telemetry support.
- **EXPENSE/INCOME/TRANSFER kind from quick-entry** — Phase 4 quick-entry is EXPENSE-only. Income/transfer entry happens through the Wallets tab (Phase 5) and/or future dedicated affordances.
- **"Edited" badge + edit-history panel** — Phase 2's `edit-history-panel.tsx` is not required by GRID. Keep mounted on txn rows if cheap; if removal speeds up Phase 4, defer to a later polish phase.
- **Bulk operations** (multi-select rows, bulk delete/recategorize) — explicitly out of scope; GRID-12 removed bulk-action bar.

</deferred>

---

_Phase: 04-spendings-grid_
_Context gathered: 2026-05-13_

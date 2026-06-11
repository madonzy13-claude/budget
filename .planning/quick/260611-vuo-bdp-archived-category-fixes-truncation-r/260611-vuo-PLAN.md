---
phase: quick-260611-vuo
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/src/components/budgeting/spendings-grid/column-header.tsx
  - apps/web/src/components/budgeting/spendings-grid/category-column.tsx
  - apps/web/src/components/budgeting/spendings-grid/spendings-grid-client.tsx
  - apps/web/test/components/spendings-grid/column-header.test.tsx
  - packages/budgeting/src/application/unarchive-category.ts
  - packages/budgeting/src/ports/category-repo.ts
  - packages/budgeting/src/adapters/persistence/category-repo.ts
  - packages/budgeting/src/contracts/factory.ts
  - apps/api/src/routes/categories.ts
  - packages/budgeting/test/application/unarchive-category.test.ts
  - apps/api/test/routes/categories.test.ts
autonomous: true
requirements: [QUICK-VUO-01, QUICK-VUO-02, QUICK-VUO-03, QUICK-VUO-04]

must_haves:
  truths:
    - "Non-archived category names use the full column width (no reserved archived-label gap); 'Subscription' renders untruncated at baseline column width"
    - "Clicking the trash on an archived column header opens the permanent-delete confirm dialog and a confirmed delete removes the category"
    - "Hovering (desktop) / tapping (mobile) any of the planned, overspent, reserve-used, or left cells of a category column reveals the edit pen (normal) or trash+revert (archived) — same as hovering/tapping the name cell"
    - "An archived column header shows a revert (unarchive) icon next to the trash; clicking it (no confirm) clears the archived flag and the column becomes a normal, editable column again"
    - "Reverting in the SAME month as archiving leaves limits unchanged"
    - "Reverting MONTHS LATER sets category limit 0 + cushion limit 0 for every month strictly between the archive month and the current month, and sets the current month's limits to what the category had in its archive month"
  artifacts:
    - path: "packages/budgeting/src/application/unarchive-category.ts"
      provides: "unarchiveCategory use-case — clears archive flags + replays month-by-month limit zeroing"
      min_lines: 40
    - path: "apps/api/src/routes/categories.ts"
      provides: "POST /categories/:id/unarchive route"
      contains: "/:id/unarchive"
    - path: "apps/web/src/components/budgeting/spendings-grid/column-header.tsx"
      provides: "full-width name, column-wide reveal, revert icon"
  key_links:
    - from: "column-header.tsx revert button onClick"
      to: "spendings-grid-client.tsx unarchive handler -> POST /budgets/:id/categories/:cid/unarchive"
      via: "onUnarchive prop"
      pattern: "unarchive"
    - from: "spendings-grid-client.tsx confirmPermanentDelete"
      to: "DELETE /budgets/:id/categories/:cid"
      via: "clientApiFetch"
      pattern: "method:\\s*\"DELETE\""
    - from: "unarchive-category.ts"
      to: "categoryLimitRepo.setLimitForMonth (singleMonth per month) + repo.unarchive"
      via: "month iteration archive_month..current_month"
      pattern: "setLimitForMonth"
---

<objective>
BDP category column: fix 2 bugs + add 2 features.

1. BUG — non-archived category name truncated ("Subscription") because layout reserves
   width the name can't use. Non-archived columns must give the entire header width to the name.
2. BUG — trash button on an archived column header does nothing. Find root cause + fix.
3. FEATURE — the reveal affordance (edit pen / trash) must trigger from hover/tap of the
   planned, overspent, reserve-used, and left cells too — not just the name cell.
4. FEATURE — revert (unarchive) icon on archived columns. No confirm. Clears archived flag,
   restores the category. Same-month revert: limits unchanged. Months-later revert: every month
   strictly between archive month and current month gets category+cushion limit 0; the current
   month gets the limits the category had in its archive month (so reserves don't grow while archived).

Purpose: clean up the archive UX shipped on tasks-redesign and complete the archive/unarchive lifecycle.
Output: corrected column-header layout + column-wide reveal + revert icon, plus an unarchiveCategory
backend use-case, repo method, and route.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@CLAUDE.md

# TDD is MANDATORY (CLAUDE.md). Write the failing test FIRST for every bug and feature.

# Drizzle/SQL lives ONLY in adapters/persistence. Domain entities are plain classes.

# Docker images are prebuilt — `make restart-web` (web) / rebuild api before any MANUAL check.

# But the executor runs UNIT/COMPONENT tests directly (no Docker needed):

# - packages/budgeting: `cd packages/budgeting && bun test`

# - apps/api routes: `cd apps/api && bun test`

# - apps/web components:`cd apps/web && bun run test`

<interfaces>
<!-- Existing contracts the executor builds against. Use directly — no exploration needed. -->

# column-header.tsx (current state — apps/web/src/components/budgeting/spendings-grid/)

# Row 1 name cell:

# <div ref={ref} onClick={() => setRevealed(!revealed)} className="group flex w-0 min-w-full ...">

# <RowDragHandle ... />

# <span className="min-w-0 flex-1 truncate ...">{category.name}</span>

# {archived && <span className="shrink-0 ...">{t("archived")}</span>} # archived label

# {!archived && <button data-testid={`column-header-pen-${name}`} ...><Pencil/></button>}

# {archived && <button data-testid={`column-header-trash-${name}`} onClick={..onPermanentDelete?.(id)}><Trash2/></button>}

# </div>

# Reveal classes on pen/trash:

# revealed ? "opacity-100"

# : "opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto focus-visible:..."

# Props: { onEdit, archived, onPermanentDelete, reservesEnabled, ... }

# data-testids already present per row:

# column-header-name-cell, column-header-${name}-overspent, -reserves-used, -reserves-available, -balance

# useRevealActions() (reveal-actions.tsx) — single-click reveal hook:

# const { revealed, setRevealed, ref } = useRevealActions();

# ref goes on the element that should KEEP reveal when clicked inside; outside pointerdown closes it.

# @do-not-add onMouseEnter (D-PH4-INT1 forbids hover-reveal IN JS; CSS group-hover is the desktop path).

# category-column.tsx — renders <ColumnHeader .../>; forwards onPermanentDelete; passes summary rows.

# onPermanentDelete={() => setDeleteCat({ id: c.id, name: c.name })} (wired in spendings-grid-client)

# spendings-grid-client.tsx — owns the delete confirm:

# const [deleteCat, setDeleteCat] = useState<{id,name}|null>(null);

# async function confirmPermanentDelete() {

# const res = await clientApiFetch(`/budgets/${budgetId}/categories/${deleteCat.id}`, { method: "DELETE" });

# if (res.ok) { setDeleteCat(null); ... qc.invalidateQueries(...); router.refresh(); }

# }

# <AlertDialog open={!!deleteCat} ...> data-testid="category-delete-dialog" / -confirm

# <CategoryColumn ... onPermanentDelete={() => setDeleteCat({ id: c.id, name: c.name })} />

# BACKEND archive model:

# categories table cols: archived_at (timestamptz, NULL=active) + archived_from (date).

# "keep history" archive (the column the UI shows): archived_from = <archive month start>, archived_at = NULL.

# "all" archive: archived_at = now(), archived_from = '0001-01-01'.

# CategoryRepo.archive(tenantId, categoryId, actorUserId, { archivedFrom?, hideAll? }) -- ports/category-repo.ts

# adapter (adapters/persistence/category-repo.ts) does the UPDATE + audit + outbox in withTenantTx.

# CategoryLimitRepo (ports/category-limit-repo.ts):

# setLimitForMonth({ tenantId, categoryId, monthStart, normalAmount, normalCurrency, cushionAmount, cushionCurrency, actorUserId, carryForward })

# carryForward=false → change ONLY that month (SCD-2 split). carryForward=true → from this month onward.

# getEffectiveLimit(tenantId, categoryId, reportDate) → CategoryLimitRow|null

# { id, categoryId, normalAmount, normalCurrency, cushionAmount, cushionCurrency, effectiveFrom, effectiveTo, createdAt }

# setCategoryLimit use-case (application/set-category-limit.ts) wraps setLimitForMonth + recompute hooks.

# Factory (contracts/factory.ts) wires archiveCategory / permanentlyDeleteCategory / setCategoryLimit;

# exposes deps.budgeting.<name>. Add unarchiveCategory beside archiveCategory.

# Route file: apps/api/src/routes/categories.ts — POST /:id/archive, DELETE /:id, PATCH /:id (rename).

# pickTenant(c), userId from session; mounted under /budgets/:budgetId/categories.

</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Backend — unarchiveCategory use-case + repo.unarchive + POST /:id/unarchive route</name>
  <files>packages/budgeting/test/application/unarchive-category.test.ts, packages/budgeting/src/application/unarchive-category.ts, packages/budgeting/src/ports/category-repo.ts, packages/budgeting/src/adapters/persistence/category-repo.ts, packages/budgeting/src/contracts/factory.ts, apps/api/src/routes/categories.ts, apps/api/test/routes/categories.test.ts</files>
  <behavior>
    RED first. unarchive-category.test.ts (bun:test, fake repos):
    - returns err when category not found
    - returns err when category is NOT archived (archived_at NULL AND archived_from NULL)
    - SAME-MONTH revert (archived_from month === current month): calls repo.unarchive once;
      does NOT call setLimitForMonth at all (limits unchanged)
    - MONTHS-LATER revert (e.g. archived 2026-03, current 2026-06):
      * reads the archive-month limits via getEffectiveLimit(tenantId, catId, archivedFromMonthStart)
      * for EACH month strictly between archive month and current month (2026-04, 2026-05):
        setLimitForMonth with normalAmount "0" + cushionAmount "0", carryForward=false (singleMonth)
      * for the CURRENT month (2026-06): setLimitForMonth with the archive-month's normalAmount +
        cushionAmount + their currencies, carryForward=false
      * calls repo.unarchive once
      * asserts the exact set of monthStart values passed (no off-by-one — endpoints handling:
        months STRICTLY between are zeroed; current month gets archive-month value; archive month
        itself untouched)
    Backend route test (apps/api/test/routes/categories.test.ts, real Postgres per CLAUDE.md rule 3):
    - POST /budgets/:id/categories/:cid/unarchive on a kept-history archived category returns 200
      and the category is no longer archived (archived_from cleared)
    - tenant-mismatch budgetId → 403
  </behavior>
  <action>
    Build the unarchive lifecycle backend.

    1. Add `unarchive(tenantId, categoryId, actorUserId)` to the CategoryRepo port (ports/category-repo.ts)
       — JSDoc: clears archived_from (set NULL) and archived_at (NULL); restores the category to active.
    2. Implement it in adapters/persistence/category-repo.ts mirroring `archive()`: withTenantTx UPDATE
       `SET archived_from = NULL, archived_at = NULL WHERE id=…::uuid AND tenant_id=…::uuid`, then
       writeAudit (action "update", before {archivedAt:<prev>}, after {archivedAt:null}) + writeOutbox
       (eventType "budgeting.category.unarchived"). Do NOT resurrect deleted recurring_rules/drafts —
       archive deleted them intentionally; unarchive only flips the flags + replays limits.
    3. Create application/unarchive-category.ts. Deps: { repo: CategoryRepo, limitRepo: CategoryLimitRepo }.
       Optional task-recompute deps mirroring archive-category.ts (taskRepo/reservePositions/budgetCurrencyOf/
       isReservesEnabled) — gated + best-effort; call recomputeReserveTopupTask after unarchive so internal/surplus
       refresh (the category's R re-enters internal going forward). Logic:
         - findById; err if missing; err "Category not archived" if NOT archived
           (need archived_from — adapter attaches `(cat as any).archivedFrom`; or add a small repo read).
           Read archivedFrom: for the kept-history column the UI shows, archived_from is the archive month.
         - archiveMonthStart = first day of archived_from's month (UTC). currentMonthStart = first day of
           current month (use serverNow()).
         - If archiveMonthStart === currentMonthStart: call repo.unarchive and return (limits unchanged).
         - Else (months later):
             archiveLimit = limitRepo.getEffectiveLimit(tenantId, categoryId, archiveMonthStart)
             (fall back to "0"/budgetCurrency if null — a category may have had no explicit limit).
             Iterate month cursor = archiveMonthStart + 1 month; while cursor < currentMonthStart:
               setLimitForMonth({ …, monthStart: cursor, normalAmount: "0", cushionAmount: "0",
                 normalCurrency/cushionCurrency = archiveLimit's currencies, carryForward: false })
               cursor += 1 month.
             Then setLimitForMonth for currentMonthStart with archiveLimit.normalAmount/cushionAmount +
               currencies, carryForward: false.
             Then repo.unarchive.
         Use UTC date math only (no Temporal needed here; iterate by constructing first-of-month strings).
         Return ok with the CategoryDto shape (archivedAt: null).
    4. Wire into contracts/factory.ts beside archiveCategory: `unarchiveCategory: unarchiveCategory({ repo,
       limitRepo, …optional task deps already constructed for archiveCategory })`. Add to the factory type.
    5. Add route in apps/api/src/routes/categories.ts: `app.post("/:id/unarchive", …)` mirroring the
       archive route — pickTenant, userId from session, budgetId tenant-mismatch → 403, call
       deps.budgeting.unarchiveCategory, isErr → 422, else c.json(result). No request body needed.

  </action>
  <verify>
    <automated>cd packages/budgeting && bun test test/application/unarchive-category.test.ts -x && cd ../../apps/api && bun test test/routes/categories.test.ts -x</automated>
  </verify>
  <done>unarchive use-case + repo method + route implemented; same-month leaves limits untouched; months-later zeroes the strictly-between months and sets current month to archive-month limits; both new tests green.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Frontend — full-width name (bug 1), revert icon + handler (feature 4), column-wide reveal (feature 3), trash-dead fix (bug 2)</name>
  <files>apps/web/test/components/spendings-grid/column-header.test.tsx, apps/web/src/components/budgeting/spendings-grid/column-header.tsx, apps/web/src/components/budgeting/spendings-grid/category-column.tsx, apps/web/src/components/budgeting/spendings-grid/spendings-grid-client.tsx</files>
  <behavior>
    RED first. column-header.test.tsx (Vitest + RTL + happy-dom). Find/create the test file
    (check apps/web/test/components/spendings-grid/ for an existing column-header test to extend):
    - BUG1: a NON-archived header does NOT render the archived label element, and the name span is
      NOT constrained by a reserved label slot — assert the name span has flex-1/min-w-0 and no
      sibling occupies fixed inline width when collapsed (i.e. the pen, when hidden, is
      pointer-events-none AND does not push the name: it overlays/absolute OR uses opacity-only with
      the name allowed to truncate at the FULL header width). Concretely assert: rendering a long
      name on a NON-archived column, the archived `<span>{t("archived")}</span>` is absent.
    - FEATURE4: an ARCHIVED header renders BOTH a trash button (testid column-header-trash-<name>)
      AND a revert button (testid column-header-revert-<name>); a non-archived header renders neither.
    - FEATURE4 wiring: clicking revert calls onUnarchive(categoryId) (no confirm dialog).
    - BUG2/FEATURE3: clicking the trash calls onPermanentDelete(categoryId). Trash must be a real
      click target (not pointer-events-none) once revealed — simulate reveal then click and assert
      the handler fires.
    For the column-wide reveal (feature 3): a focused component test is brittle for CSS group-hover,
    so assert the JS contract instead — lifting reveal to the header root: after firing a click on a
    summary cell (e.g. column-header-<name>-overspent), the pen/trash becomes revealed (opacity-100,
    pointer-events enabled). Add data-testid="column-header-root" to the new wrapping group.
  </behavior>
  <action>
    Apply all four frontend changes in column-header.tsx (+ small wiring in category-column + grid-client).

    BUG 1 (full-width name): the name must use the entire header width on NON-archived columns. The
    h-7 w-7 pen currently sits in the inline flow and (even when opacity-0) the `gap-1` + button box
    can steal width. Make the action buttons NOT consume layout width when hidden: either (a) render
    the pen/trash/revert in an absolute-positioned cluster pinned to the right of the Row-1 cell
    (so the name span spans the full width and truncates only when genuinely too long), or (b) keep
    inline but ensure the hidden state collapses width (w-0 overflow-hidden when not revealed/hovered).
    Prefer (a): wrap actions in `<div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-0.5">`
    and make Row-1 `relative`. Keep the archived label ONLY for archived columns and ONLY rendered when
    archived (already conditional) — but since actions now overlay, the label for archived columns should
    sit inline left of the action cluster or also overlay; ensure for NON-archived the name truly gets
    100% width. Verify "Subscription" no longer truncates at baseline column width.

    FEATURE 3 (column-wide reveal): lift reveal state to the header root. Move `useRevealActions()`
    so its `ref` wraps the WHOLE column-header `<div>` (add data-testid="column-header-root" and the
    `group` class to it). Each summary row cell (planned/overspent/reserves-used/left) gets an
    `onClick={() => setRevealed(!revealed)}` so tapping any of them reveals the action cluster
    (matching the name cell). Desktop hover already works once `group` is on the root (group-hover
    on the action buttons now triggers from anywhere in the column header). Keep @do-not-add
    onMouseEnter (no JS hover). Keep the outside-pointerdown close behavior from the hook.

    FEATURE 4 (revert icon): import a revert icon from lucide-react (use `Undo2` or `RotateCcw`).
    In the archived branch, render it BEFORE the trash inside the action cluster:
      <button type="button" data-testid={`column-header-revert-${name}`} onClick={(e)=>{e.stopPropagation();
        onUnarchive?.(category.id);}} aria-label={`Restore ${category.name}`} className=<same reveal classes as trash>>
        <Undo2 className="h-4 w-4 text-[var(--body-on-dark)]" aria-hidden />
      </button>
    Add `onUnarchive?: (categoryId: string) => void;` to ColumnHeaderProps. NO confirm dialog.
    Thread `onUnarchive` through CategoryColumnProps (category-column.tsx) → ColumnHeader.
    In spendings-grid-client.tsx add `async function unarchiveCategory(catId)` calling
      clientApiFetch(`/budgets/${budgetId}/categories/${catId}/unarchive`, { method: "POST" });
      on res.ok: invalidate the same queryKeys confirmPermanentDelete uses
      (["spendings-summary",budgetId], ["transactions",budgetId], ["drafts",budgetId],
       ["budget",budgetId,"reserves"]) + router.refresh(). Pass onUnarchive={() => void unarchiveCategory(c.id)}
      to <CategoryColumn/>.

    BUG 2 (dead trash): root-cause while implementing. The trash IS wired (onPermanentDelete → setDeleteCat
    → AlertDialog), so the likely culprit is the reveal/pointer-events: the trash is
    `opacity-0 pointer-events-none` until revealed, and the outer name-cell `onClick` toggling reveal
    plus the inner button `stopPropagation` can leave it un-revealed on first tap, OR the trash sits
    under the grip/sticky band. After moving actions to the overlay cluster + lifting reveal to the
    column root, confirm the trash: (1) becomes pointer-events-auto when revealed/hovered, (2) its
    onClick reaches onPermanentDelete (no parent swallowing the event — keep e.stopPropagation()),
    (3) the AlertDialog opens. If reproduction shows the handler never fires, fix the specific cause
    (z-index under sticky band → bump action cluster z; or reveal never set on tap → ensure summary/name
    click sets revealed true before the button is clickable; on touch a single tap reveals, a second tap hits).
    Keep the existing confirmPermanentDelete + AlertDialog in grid-client unchanged unless the bug is there.

  </action>
  <verify>
    <automated>cd apps/web && bun run test -- column-header</automated>
  </verify>
  <done>Non-archived names use full width ("Subscription" untruncated); archived columns show revert + trash; revert calls unarchive (no confirm) and refreshes; trash opens the delete dialog and fires onPermanentDelete; reveal triggers from name AND planned/overspent/reserves-used/left cells; component tests green.</done>
</task>

</tasks>

<verification>
- `cd packages/budgeting && bun test test/application/unarchive-category.test.ts` green
- `cd apps/api && bun test test/routes/categories.test.ts` green (real Postgres)
- `cd apps/web && bun run test -- column-header` green
- Typecheck clean: `cd packages/budgeting && bun run typecheck` (or repo `make` equivalent) for the new use-case/port/adapter
- dependency-cruiser still passes (no drizzle import added to domain/application — SQL only in adapters/persistence)
- After backend+frontend land: `make restart-api && make restart-web`, then MANUAL spot-check on
  https://budget-dev.madonzy.com — archive a category, revert it same month (limits unchanged), and
  (if a months-later fixture is available) confirm intervening months show "left" = 0.
</verification>

<success_criteria>

- Bug 1: non-archived "Subscription" header is not truncated at baseline width; no archived-label space reserved for non-archived columns.
- Bug 2: archived column trash opens the confirm dialog and deletes on confirm.
- Feature 3: pen (normal) / trash+revert (archived) reveal on hover/tap of name, planned, overspent, reserve-used, and left cells.
- Feature 4: revert icon present on archived columns; click (no confirm) clears archived flag; same-month revert leaves limits unchanged; months-later revert zeroes strictly-between months and restores current month to the archive-month limits.
- TDD: a failing test preceded each change; all new + existing related suites green.
  </success_criteria>

<output>
After completion, create `.planning/quick/260611-vuo-bdp-archived-category-fixes-truncation-r/260611-vuo-SUMMARY.md`
</output>

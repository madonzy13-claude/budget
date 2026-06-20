---
quick: 260612-kxd
plan: 01
type: execute
wave: 1
subsystem: shell-safe-area + spendings-grid + tasks/drafts-atomicity
autonomous: false
tags:
  [
    ios,
    pwa,
    shell,
    clip-chain,
    dvh,
    grid,
    keyboard,
    remeasure,
    tasks,
    drafts,
    confirm-draft,
    orphan-task,
    tdd,
  ]
files_modified:
  - apps/web/src/app/global.css
  - apps/web/src/app/[locale]/(app)/layout.tsx
  - apps/web/src/components/budgeting/spendings-grid/spendings-grid-client.tsx
  - apps/web/src/components/common/viewport-debug.tsx
  - apps/web/test/shell-safe-area.test.ts
  - packages/budgeting/src/adapters/persistence/category-repo.ts
  - packages/budgeting/src/application/permanently-delete-category.ts
  - packages/budgeting/src/application/dismiss-draft.ts
  - packages/budgeting/src/adapters/persistence/task-repo.ts
  - packages/budgeting/src/contracts/factory.ts
  - apps/api/src/routes/categories.ts
  - packages/budgeting/test/application/permanently-delete-category.test.ts
  - packages/budgeting/test/application/dismiss-draft.test.ts
  - packages/budgeting/test/application/list-pending-tasks.test.ts
  - apps/api/test/routes/categories.test.ts

must_haves:
  truths:
    - "Safari browser mode: spendings grid canvas paints under the floating bar (no black block) immediately on page load"
    - "Inline-editing the bottom row of a long list never jump-backs after the keyboard opens (10/10 device taps)"
    - "Task banner shows ONLY tasks whose draft still exists; deleting a draft by any path closes its CONFIRM_DRAFT task in the SAME transaction"
    - "Existing Maczfit orphan task disappears on next banner read WITHOUT manual SQL"
  artifacts:
    - path: "apps/web/src/app/global.css"
      provides: "browser-mode [data-shell-root] sized to 100lvh (reverts round-2 min-height:100dvh)"
      contains: "data-shell-root"
    - path: "apps/web/src/components/budgeting/spendings-grid/spendings-grid-client.tsx"
      provides: "keyboard-aware remeasure freeze (focus-in-scroller guard + blur remeasure)"
    - path: "packages/budgeting/src/adapters/persistence/category-repo.ts"
      provides: "hardDelete resolves CONFIRM_DRAFT tasks for purged drafts in the same tx"
      contains: "tasks"
    - path: "packages/budgeting/src/adapters/persistence/task-repo.ts"
      provides: "listPending self-heals orphan CONFIRM_DRAFT (draft gone → excluded/resolved)"
  key_links:
    - from: "spendings-grid box h-[var(--grid-max-h)] (100lvh − top)"
      to: "[data-shell-root] height"
      via: "ancestor height must allow the lvh box to extend under the bar (not clip at dvh)"
      pattern: "data-shell-root[\\s\\S]{0,200}100lvh"
    - from: "updateMaxH (visualViewport resize/scroll listeners)"
      to: "keyboard-open state"
      via: "freeze guard skips remeasure while activeElement is inside the scroller"
      pattern: "activeElement|contains\\("
    - from: "permanentlyDeleteCategory / category-repo.hardDelete"
      to: "budgeting.tasks CONFIRM_DRAFT rows"
      via: "DELETE drafts + resolve tasks in one withTenantTx"
      pattern: "tasks[\\s\\S]{0,200}draft_id|resolveConfirmDraft"
---

<objective>
Close three device-pass defects after SHELL-R15, each root-caused to code (file:line below), each fixed TDD.

1. **Safari black block (clip chain).** R15 anchored the grid box to `100lvh − measuredTop`, but a browser-mode ancestor caps the canvas at the dynamic viewport, so the lvh extension is invisible — the black block is unchanged. Confirmed cause: `[data-shell-root] { min-height: 100dvh }` in `global.css:474-482` (set round 2, commit 0e07dd6, marker SHELL-R10 era). The dvh-bounded root + its `flex-1 min-h-0` ptr-blur child cap the painted canvas at the bar's top edge; the grid box's lvh height has no ancestor room to extend under the bar. Fix = revert the round-2 `min-height: 100dvh` back to `100lvh` at the shell level so the canvas extends under the translucent bar (matches standalone, where lvh==screen already). Safe now: round-2's dvh change was a misdiagnosis of the "black band" — the real black-band cause was the round-4 stacked clearances (since removed in R14). Reverting restores the native page-scroll-under-bar behavior the whole R15 box architecture assumes.

2. **Inline-edit jump-back (keyboard remeasure).** Double-tap bottom row → iOS pans viewport up to reveal editor (correct) → jumps back (wrong). Cause: the `updateMaxH` effect (`spendings-grid-client.tsx:298-361`) subscribes to `visualViewport` `resize` AND `scroll` (lines 348-350). Keyboard open fires BOTH (height shrinks + WebKit pans the layout viewport → `rect.top` changes) → recomputes a shorter `--grid-max-h` → the fixed-height box `h-[var(--grid-max-h)]` shrinks → reflow clamps scrollTop → snap-back. No `scrollIntoView` in the edit path (verified `transaction-row.tsx` / `draft-row.tsx` — autoFocus only), so the box reflow is the sole jump-back source. Fix = freeze remeasure while focus is inside the scroller; single remeasure on blur.

3. **Orphan CONFIRM_DRAFT task (Maczfit).** Banner shows a task whose draft is gone. Cause: `permanently-delete-category.ts` → `category-repo.hardDelete` (`category-repo.ts:337-355`) DELETEs `budgeting.expense_ledger` (drafts) but NEVER touches `budgeting.tasks` → orphan CONFIRM_DRAFT. Secondary: `dismiss-draft.ts:61-72` resolves the task in a SEPARATE `withTenantTx` ("A2 fallback" — admits the one-poll race), not atomic. Fix = (a) resolve CONFIRM_DRAFT tasks inside `hardDelete`'s tx; (b) make `dismiss-draft` atomic; (c) self-heal `listPending` so the existing Maczfit orphan vanishes on next read without manual SQL.

Purpose: ship a device-verifiable shell + atomic task consistency; close the R-saga.
Output: 4 code fixes, RED→GREEN tests for each, device checkpoint.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/quick/260612-g7v-spendings-dead-band-remove-stacked-botto/260612-g7v-SUMMARY.md
@CLAUDE.md

<clip_chain_audit>
Grid scroller box → up. Browser display-mode (Safari). file:line + verdict.

| #   | Ancestor                           | Source file:line                                                                                                                                 | height                                   | overflow              | Verdict (browser mode)                                                                                                                                                                                      |
| --- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------- | --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0   | grid scroller box                  | spendings-grid-client.tsx:526 (`h-[var(--grid-max-h,80vh)]`) + :334-340 (`max(160px, calc(100lvh − top))`)                                       | 100lvh − top (FIXED)                     | overflow-auto         | wants to extend UNDER the bar (correct intent)                                                                                                                                                              |
| 1   | `[data-no-page-clearance]` wrapper | spendings/page.tsx:108                                                                                                                           | auto                                     | visible               | pass-through                                                                                                                                                                                                |
| 2   | `NavPendingOverlay.flex-1`         | layout.tsx:248                                                                                                                                   | flex-1 of main                           | (default)             | pass-through                                                                                                                                                                                                |
| 3   | `main[data-shell-scroll]`          | layout.tsx:244-246 (`flex flex-1 min-h-0 overflow-y-auto`) → browser override global.css:484-487 (`flex:none; min-height:0; overflow-y:visible`) | content (flex:none)                      | **visible** (browser) | NOT the clip — overflow opened in browser mode                                                                                                                                                              |
| 4   | `[data-ptr-blur-target]`           | layout.tsx:194-196 (`flex flex-1 min-h-0 flex-col`)                                                                                              | flex-1 of root → resolves to root height | (default visible)     | inherits the root cap below                                                                                                                                                                                 |
| 5   | **`[data-shell-root]`**            | layout.tsx:172-174 (`h-lvh`) → **browser override global.css:474-482 (`height:auto; min-height:100dvh`)**                                        | **min-height:100dvh**                    | (default visible)     | **★ THE CAP — round-2 commit 0e07dd6. dvh = visible-viewport (bar-shown). Canvas never paints below the bar top; the box's lvh height has no room to extend → black under-bar zone. THIS IS THE FIX SITE.** |
| 6   | `html, body`                       | global.css base 185-209 (`height:100lvh; overflow:hidden`) → browser override 467-473 (`height:auto; overflow:visible; overscroll auto`)         | auto                                     | **visible** (browser) | NOT the clip — page scroll unlocked in browser; the dvh cap is one level down at the shell root                                                                                                             |

**Conclusion:** no `overflow:hidden`/`clip` ancestor in browser mode (all opened to `visible` in the R-rounds). The defect is a HEIGHT cap, not an overflow clip: `[data-shell-root] min-height:100dvh` (global.css:482) sizes the painted shell canvas to the dynamic (bar-shown) viewport, so the grid box's `100lvh` bottom anchor extends into a region the shell never paints → bare black page background. Fix = `100lvh` at the shell root in browser mode (revert round-2 #5).

**Standalone unaffected:** standalone keeps base `html,body height:100lvh` (line 209) + `[data-shell-root] h-lvh` (no browser override applies); lvh==screen → identical to user-approved R14/R15. Chromium: lvh==dvh==vvh → geometry e2e unchanged.
</clip_chain_audit>

<draft_deletion_audit>
Every path that removes a draft (`expense_ledger` row, `confirmed_at IS NULL`) and whether it closes the CONFIRM_DRAFT task in the SAME tx.

| Path                                    | file:line                                                                 | Mechanism                                                                                 | Closes task atomically?                            | Action                                                         |
| --------------------------------------- | ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | -------------------------------------------------- | -------------------------------------------------------------- |
| Skip recurring draft                    | skip-recurring-draft.ts:64-74                                             | soft-delete `deleted_at` + `taskRepo.resolveConfirmDraftByDraftId(tx)` in SAME tx         | **Y** (atomic)                                     | none — reference impl                                          |
| Dismiss draft                           | dismiss-draft.ts:35-73                                                    | `repo.dismiss` (own tx) + resolve in a **SEPARATE** `withTenantTx` (61-72, "A2 fallback") | **N** (one-poll race)                              | T3: fold resolve into the same tx                              |
| Permanent-delete category               | permanently-delete-category.ts:21-37 → category-repo.hardDelete:337-355   | DELETEs `expense_ledger` (drafts) in tx — **no `budgeting.tasks` touch**                  | **N** (ORPHAN — Maczfit)                           | T3: resolve CONFIRM_DRAFT for purged drafts in hardDelete's tx |
| Recurring-rule edit (applyToFuture)     | update-recurring-rule.ts:89-95 → draftRepo.regenerateFuturePending        | UPDATEs drafts IN PLACE (preserves draft.id — NOT delete)                                 | **N/A** (draft survives → task target still valid) | none — task stays valid                                        |
| Confirm draft / confirm-recurring-draft | confirm-draft.ts / confirm-recurring-draft.ts (emit CONFIRM_DRAFT region) | confirm flips `confirmed_at` + resolves task                                              | **Y** (existing)                                   | none                                                           |

**Generator dedupe note:** generators emit CONFIRM_DRAFT keyed on `payload_json->>'draft_id'`; `resolveConfirmDraftByDraftId` (task-repo.ts:280-290) is idempotent (status='PENDING' guard). No generator recreates a task for a deleted draft (it iterates live pending drafts), so the orphan is purely a missing-resolve-on-delete, not regeneration. Self-heal at read (T3) clears pre-existing orphans.
</draft_deletion_audit>

<interfaces>
From task-repo.ts (existing — reuse, do NOT redefine):
```typescript
// idempotent, status='PENDING' guarded, keyed on payload_json->>'draft_id'
resolveConfirmDraftByDraftId(tenantId: string, draftId: string, tx: TenantTx): Promise<void>
// task-repo.ts:280-290 — call this from hardDelete's tx and dismiss-draft's tx
```
From category-repo.ts hardDelete tx (category-repo.ts:337-355): the `withTenantTx` already deletes `expense_ledger` then `categories` + writeAudit/writeOutbox. The task-resolve must run BEFORE the `expense_ledger` DELETE (so `payload_json->>'draft_id'` still matches a row) OR resolve by category via a join — see T3 action.
From spendings-grid-client.tsx:299 `gridRef` is the scroller `<div>`; freeze logic uses `gridRef.current.contains(document.activeElement)`.
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Browser-mode shell root → 100lvh (fix Safari black block; revert round-2 dvh cap)</name>
  <files>apps/web/src/app/global.css, apps/web/src/app/[locale]/(app)/layout.tsx, apps/web/src/components/common/viewport-debug.tsx, apps/web/test/shell-safe-area.test.ts</files>
  <behavior>
    RED first — extend shell-safe-area.test.ts with a "Round 6 — shell canvas extends under the bar (SHELL-R16)" describe block:
    - R6-A: browser-mode `[data-shell-root]` block in global.css does NOT contain `min-height: 100dvh` and DOES size to `100lvh` (e.g. `min-height: 100lvh` or `height: 100lvh`). Extract the `@media (display-mode: browser)` substring containing `data-shell-root`. `expect(block).not.toMatch(/min-height:\s*100dvh/)` and `expect(block).toMatch(/100lvh/)`.
    - R6-B: standalone path untouched — base `html,body` still `height: 100lvh` (existing line 209) AND no browser override forces dvh. Re-assert `expect(globalCss).toMatch(/height:\s*100lvh/)` (existing R-127 invariant survives).
    - R6-C: overlay reports the clip-chain heights — viewport-debug exposes `shellRootClientH`, `shellRootMinH` (computed min-height), `ptrBlurClientH`, and `mainClientH` (mainClientH already at viewport-debug.tsx:228; add the shell-root + ptr-blur probes). `expect(viewportDebug).toMatch(/shellRootClientH/)` and `/shellRootMinH/`.
    - R6-D: BUILD_MARKER bumped to `SHELL-R16`. `expect(viewportDebug).toMatch(/BUILD_MARKER\s*=\s*["']SHELL-R16["']/)`. Update the prior exact-marker guard R5-D region tolerance: R5-D asserts `SHELL-R15` exactly — amend it to accept the chain marker `SHELL-R1[5-9]` OR move the exact assert into R6-D (keep one exact-marker test, the latest).
    - Run `cd apps/web && bun run test shell-safe-area` → MUST fail (RED) on R6-A/C/D.
  </behavior>
  <action>
    GREEN:
    1. global.css:474-482 — in `@media (display-mode: browser)`, change `[data-shell-root]` from `height: auto; min-height: 100dvh` to `min-height: 100lvh` (keep `height: auto` if needed for flex, but the painted floor must be lvh). Replace the round-2 comment (476-481) with a SHELL-R16 rationale: "Round 2 (0e07dd6) set 100dvh here to kill a 'black band' — that was a MISDIAGNOSIS; the real black-band cause was the round-4 stacked clearances (removed in R14). dvh caps the painted canvas at the bar's top edge, so the R15 grid box (100lvh − top) extends into an unpainted region → the Safari black block. lvh paints the canvas edge-to-edge under the translucent bar (matches base html,body:209 and standalone). Bar-collapse still works because html,body overflow is visible (467-473) — the PAGE scrolls."
    2. Verify NO other browser-mode ancestor reintroduces a dvh/svh cap on the chain (grep the browser @media block for `dvh`/`svh`). The `main[data-shell-scroll]` floor padding (494) is unrelated and stays.
    3. viewport-debug.tsx — add clip-chain probes near the existing main probe (~198-228): `shellRootClientH`, `shellRootMinH` (getComputedStyle(...).minHeight), `ptrBlurClientH` (query `[data-ptr-blur-target]`). Surface them in the overlay render block. Bump `BUILD_MARKER` (line 16) to `SHELL-R16`. Add `gridBoxBeyondVv` is already present — keep it (now expected >0 in Safari bar-shown AND the box should reach the painted floor).
    4. layout.tsx `[data-shell-root]` keeps `h-lvh` (line 174) — it's the standalone/base path; no change needed unless the Tailwind `h-lvh` fights the browser override (it won't — unlayered global.css wins per the existing cascade note 463-466). Leave as-is.
    5. Re-run `cd apps/web && bun run test shell-safe-area` → GREEN.
  </action>
  <verify>
    <automated>cd apps/web && bun run test shell-safe-area 2>&1 | tail -20</automated>
  </verify>
  <done>shell-safe-area suite GREEN; global.css browser `[data-shell-root]` is 100lvh (no 100dvh); overlay marker SHELL-R16 + clip-chain probes present; standalone invariants intact.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Freeze grid remeasure while keyboard open (fix inline-edit jump-back)</name>
  <files>apps/web/src/components/budgeting/spendings-grid/spendings-grid-client.tsx, apps/web/test/shell-safe-area.test.ts</files>
  <behavior>
    RED first — add to the "Round 6" describe (source-guard style, matching the existing ResizeObserver guards at test:265-282):
    - R6-E: `updateMaxH` is guarded against keyboard-open remeasure — the source contains a freeze check that references `activeElement` AND the scroller (`contains(`), e.g. a `shouldFreeze()` that returns true when `gridRef.current.contains(document.activeElement)`. `expect(spendingsGridCode).toMatch(/activeElement/)` and `/\.contains\(/`.
    - R6-F: a blur/focusout path triggers a single remeasure on resume — source contains a `focusout` (or blur) listener that calls the measure fn. `expect(spendingsGridCode).toMatch(/focusout|blur/)`.
    - R6-G: visualViewport `resize` and `scroll` listeners are STILL attached (orientation / bar-collapse must keep working) — `expect(spendingsGridCode).toMatch(/visualViewport[\s\S]{0,200}(resize|scroll)/)` (existing behavior preserved, just gated).
    Run `cd apps/web && bun run test shell-safe-area` → RED on R6-E/F.
    NOTE: device-only behavior (real iOS keyboard) is NOT E2E-testable reliably (see MEMORY: offline test architecture / standalone unemulatable). Source-guards + the device checkpoint are the proof, consistent with R3-R5.
  </behavior>
  <action>
    GREEN — edit the effect at spendings-grid-client.tsx:298-361:
    1. Inside the effect, add a freeze predicate:
       `const isKeyboardEditing = () => { const a = document.activeElement; return !!(el && a && el.contains(a) && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || (a as HTMLElement).isContentEditable)); };`
    2. Wrap `updateMaxH`'s body: `function updateMaxH() { if (isKeyboardEditing()) return; const rect = el!.getBoundingClientRect(); ... }`. This drops the visualViewport resize+scroll storm that fires when the keyboard opens (the snap-back source) while leaving orientation/bar-collapse remeasures intact (those fire with no focused input in the scroller).
    3. Add a single remeasure on blur: attach `el.addEventListener('focusout', onFocusOut)` where `onFocusOut` does a `requestAnimationFrame(() => { if (!isKeyboardEditing()) updateMaxH(); })` (rAF lets the keyboard finish collapsing + WebKit restore the layout viewport before the one clean measure). Remove the listener in cleanup.
    4. Keep ALL existing listeners (ResizeObserver, window resize, visualViewport resize+scroll) — they're now self-gating via the freeze check. Do NOT remove them (orientation change while editing is an edge case; the blur remeasure covers post-keyboard).
    5. Comment the SHELL-R16 rationale: "iOS keyboard open fires visualViewport resize+scroll → rect.top shifts → a recompute shrinks the fixed-height box → reflow clamps scrollTop → the edited bottom row snaps back out of view (1-in-3, races the keyboard anim). Freeze remeasure while a field inside the scroller has focus; one rAF remeasure on focusout restores the correct box for the collapsed keyboard."
    Re-run shell-safe-area → GREEN.
  </action>
  <verify>
    <automated>cd apps/web && bun run test shell-safe-area 2>&1 | tail -20</automated>
  </verify>
  <done>shell-safe-area GREEN incl R6-E/F/G; updateMaxH no-ops while a scroller input is focused; focusout triggers a single rAF remeasure; all viewport listeners retained.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Atomic CONFIRM_DRAFT close on every draft-removal path + self-healing banner read (fix Maczfit orphan)</name>
  <files>packages/budgeting/src/adapters/persistence/category-repo.ts, packages/budgeting/src/application/permanently-delete-category.ts, packages/budgeting/src/application/dismiss-draft.ts, packages/budgeting/src/adapters/persistence/task-repo.ts, packages/budgeting/src/contracts/factory.ts, apps/api/src/routes/categories.ts, packages/budgeting/test/application/permanently-delete-category.test.ts, packages/budgeting/test/application/dismiss-draft.test.ts, packages/budgeting/test/application/list-pending-tasks.test.ts, apps/api/test/routes/categories.test.ts</files>
  <behavior>
    RED first — real Postgres via infisical (NO DB mock; CLAUDE.md rule 3). bun:test.
    - T3-A (permanently-delete-category.test.ts): seed a category with an unconfirmed draft + a PENDING CONFIRM_DRAFT task whose `payload_json->>'draft_id'` = that draft. Call `permanentlyDeleteCategory`. Assert: draft row gone AND the CONFIRM_DRAFT task is RESOLVED (or absent), in ONE call (no second poll). Currently the task survives → RED.
    - T3-B (dismiss-draft.test.ts): seed draft + PENDING CONFIRM_DRAFT task. Call `dismissDraft`. Assert task RESOLVED. Then add an atomicity assertion: simulate the resolve happening in the SAME tx — if the dismiss inner-tx rolls back, the task is NOT resolved (no half-state). At minimum assert single-tx by removing the separate `withTenantTx` and proving one transaction boundary (e.g. resolve visible only after dismiss commits, never independently). Currently separate-tx → tighten.
    - T3-C (list-pending-tasks.test.ts): seed a PENDING CONFIRM_DRAFT task whose draft_id points to a NON-EXISTENT / soft-deleted draft (the Maczfit orphan). Call `listPendingTasks`. Assert the orphan is NOT returned. Currently returned → RED.
    - T3-D (apps/api/test/routes/categories.test.ts): integration — DELETE /categories/:id for an archived category with an open draft+task; GET the tasks/banner endpoint after → orphan task absent. Real HTTP + real Postgres.
    Run `make test` (or targeted `bun test packages/budgeting/test/application/permanently-delete-category.test.ts`) → RED.
  </behavior>
  <action>
    GREEN:
    1. task-repo.ts — add `resolveConfirmDraftByCategoryId(tenantId, categoryId, tx)`: idempotent UPDATE `budgeting.tasks SET status='RESOLVED', resolved_at=now() WHERE tenant_id=$ AND kind='CONFIRM_DRAFT' AND status='PENDING' AND payload_json->>'draft_id' IN (SELECT id::text FROM budgeting.expense_ledger WHERE category_id=$ AND tenant_id=$)`. (Resolve by the still-present drafts BEFORE they are deleted — see step 2 ordering.) Mirror the existing `resolveConfirmDraftByDraftId` style (task-repo.ts:280-290).
    2. category-repo.ts hardDelete (337-355) — INSIDE the existing `withTenantTx`, BEFORE the `expense_ledger` DELETE (line 346-350 loop), run the task resolve: `await drizzleTx.execute(sql\`UPDATE budgeting.tasks SET status='RESOLVED', resolved_at=now() WHERE tenant_id=${tenantId}::uuid AND kind='CONFIRM_DRAFT' AND status='PENDING' AND payload_json->>'draft_id' IN (SELECT id::text FROM budgeting.expense_ledger WHERE category_id=${categoryId}::uuid AND tenant_id=${tenantId}::uuid)\`)`. Ordering matters: resolve while drafts still exist so the subquery matches. (Self-contained in the repo tx — no DI change needed for hardDelete since it's raw SQL on the same schema.) Add `budgeting.tasks` to the purge loop too (defensive — any other task kind referencing the category), but resolve the CONFIRM_DRAFT first so audit reflects RESOLVED not DELETE.
    3. dismiss-draft.ts (61-72) — remove the separate `withTenantTx`. If `repo.dismiss` owns its tx and won't accept an outer tx, change the port to accept/return a tx or move the resolve into `repo.dismiss`'s tx. Preferred: make `ExpenseLedgerDraftPortRepo.dismiss` resolve the CONFIRM_DRAFT in its own internal tx (pass taskRepo down OR inline the same UPDATE in the dismiss SQL tx, like skip-recurring-draft.ts:69-74 does). Goal: dismiss + resolve commit together. Update the docstring (drop the "A2 fallback / one poll" caveat).
    4. task-repo.ts listPending (121-158) — self-heal: change the SELECT so CONFIRM_DRAFT rows whose draft no longer exists (or is soft-deleted) are excluded. Add to the WHERE: `AND (kind <> 'CONFIRM_DRAFT' OR EXISTS (SELECT 1 FROM budgeting.expense_ledger el WHERE el.id::text = tasks.payload_json->>'draft_id' AND el.tenant_id = tasks.tenant_id AND el.deleted_at IS NULL AND el.confirmed_at IS NULL))`. This makes Maczfit vanish on next banner read with zero manual SQL. (Optional cheap extra: also flip those to RESOLVED in the pg-boss generator sweep — only if trivial; the read-filter alone satisfies "disappears on next read".)
    5. factory.ts — wire the new `resolveConfirmDraftByCategoryId` into the TaskRepo contract if a port type lists methods explicitly; if hardDelete uses raw SQL (step 2), no factory change for delete. Ensure `permanentlyDeleteCategory` / dismiss DI passes taskRepo where now required.
    6. categories.ts route — no signature change expected (hardDelete is self-contained); verify the DELETE handler (156-179) still wires `deps.budgeting.permanentlyDeleteCategory`.
    Run targeted bun:test then `make test` → GREEN. Then `make ci-gate` (tenant-leak gate — the new tasks UPDATE is tenant-scoped; prove no leak).
  </action>
  <verify>
    <automated>infisical run -- bun test packages/budgeting/test/application/permanently-delete-category.test.ts packages/budgeting/test/application/dismiss-draft.test.ts packages/budgeting/test/application/list-pending-tasks.test.ts 2>&1 | tail -25</automated>
  </verify>
  <done>All T3 tests GREEN against real Postgres. hardDelete + dismiss close CONFIRM_DRAFT in the same tx; listPending excludes orphans; `make ci-gate` passes (tenant-scoped). Maczfit-shaped orphan absent on next read.</done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <what-built>
    - Issue 1: browser-mode `[data-shell-root]` now 100lvh (was 100dvh) — Safari canvas paints under the bar; marker SHELL-R16 + clip-chain probes in ?vpdbg=1 overlay.
    - Issue 2: grid remeasure freezes while a scroller field is focused; single remeasure on blur — bottom-row inline edit should not jump back.
    - Issue 3: deleting, dismissing, or ARCHIVING (addendum) closes the affected CONFIRM_DRAFT tasks atomically; banner read self-heals existing stale rows — including tasks whose category is archived (the actual Maczfit shape); home-card badge counts only actionable tasks (banner parity).
    All deployed to https://budget-dev.madonzy.com via `make dev-build` (rebuild web+api+worker — frontend bundled at build time, backend image carries the use-case changes). Served-marker check: overlay must read SHELL-R16.
  </what-built>
  <how-to-verify>
    BEFORE verifying, confirm fresh bundle: open https://budget-dev.madonzy.com/?vpdbg=1 on the iPhone in Safari and confirm the overlay reads `SHELL-R16` and shows `beyondVv` + the new `shellRootMinH`/`shellRootClientH` lines. If it still says SHELL-R15, the SW served a stale cache — pull-to-refresh / reinstall, do NOT report until SHELL-R16 shows. (This also rules out the "stale SW-cached R14" secondary hypothesis for Issue 1.)
    1. **Issue 1 (Safari black block):** In Safari browser tab (NOT installed PWA), open a budget → Spendings. Immediately on load: is the black block under the bottom bar GONE — does grid content paint under/behind the translucent bar like a native list? Scroll down: last row clears above the bar. Report: gone / unchanged / different.
    2. **Issue 2 (jump-back):** Spendings, a column with a LONG list (overflowing). Double-tap the BOTTOM transaction's amount 8-10 times (re-open editor each time). Does the view ever jump back and hide the edited row? Report the count (e.g. "0/10" = fixed).
    3. **Issue 3 (orphan task — addendum: NO permanent-delete needed):** Reload the budget home / banner. The "Maczfit 350 euro" task must ALREADY be GONE — its category is archived, the read self-heals it (live API probe confirmed: banner shows only the RESERVE_TOPUP task). Also check the home budget card: its badge count must equal the number of tasks in the banner (badge parity, live probe: 1=1). Optional extra: archive a category that has a pending recurring draft → its CONFIRM_DRAFT task disappears immediately, no new orphan appears.
    4. **Regressions (must NOT break):** installed PWA standalone still perfect (frozen) — open the PWA, Spendings, confirm bottom spacing unchanged; pinned header during browser page scroll; page-scrolling tabs (Wallets/Reserves) end-of-scroll clearance; pull-to-refresh.
  </how-to-verify>
  <resume-signal>Type "approved" or describe per-issue (1/2/3) + any regression with a screenshot.</resume-signal>
</task>

</tasks>

<threat_model>

## Trust Boundaries

| Boundary                            | Description                                                              |
| ----------------------------------- | ------------------------------------------------------------------------ |
| client→API (DELETE /categories/:id) | actor-supplied categoryId crosses into a hard-delete + task-resolve SQL  |
| generator/sweep→tasks table         | system-emitted CONFIRM_DRAFT rows; read path now joins to expense_ledger |

## STRIDE Threat Register

| Threat ID | Category                                | Component                                                        | Disposition | Mitigation Plan                                                                                                                                                                                                  |
| --------- | --------------------------------------- | ---------------------------------------------------------------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T-kxd-01  | Tampering/Info-disclosure               | new tasks UPDATE in hardDelete + resolveConfirmDraftByCategoryId | mitigate    | every UPDATE/subquery filtered by `tenant_id = $::uuid` (matches existing task-repo pattern); `make ci-gate` (6 tenant-leak tests) must pass — the subquery `IN (SELECT ... WHERE tenant_id=$)` is double-scoped |
| T-kxd-02  | Elevation (cross-tenant orphan resolve) | listPending self-heal EXISTS subquery                            | mitigate    | subquery joins `el.tenant_id = tasks.tenant_id` — a task cannot be hidden/healed by another tenant's draft state                                                                                                 |
| T-kxd-03  | Denial of service                       | listPending EXISTS subquery on every banner read                 | accept      | banner read is low-frequency, draft set per tenant is small, index on (tenant_id, category_id) exists; correlated subquery cost negligible at this scale                                                         |
| T-kxd-04  | Tampering (client JS)                   | Issue 1/2 are CSS + client measurement only                      | accept      | no trust boundary crossed; no server state from shell changes                                                                                                                                                    |

</threat_model>

<verification>
- `cd apps/web && bun run test shell-safe-area` GREEN (Rounds 1-6, marker SHELL-R16).
- `infisical run -- bun test` for the three T3 application tests GREEN (real Postgres).
- `make test` GREEN modulo the known ~292 pre-existing bun:test sweep failures (MEMORY: make test infra debt) — verify the NEW tests with the correct runner, not the red count.
- `make ci-gate` GREEN (tenant-leak).
- Served bundle marker SHELL-R16 confirmed on https://budget-dev.madonzy.com/?vpdbg=1 (rules out stale SW for Issue 1).
- Device checkpoint approved for Issues 1/2/3 + no regression (PWA standalone frozen, pinned header, page-scrolling tabs, PTR).
</verification>

<success_criteria>

- Safari browser: no black block under the bar on Spendings load; canvas paints under the translucent bar (Issue 1).
- Bottom-row inline edit: 0 jump-backs in 10 device taps (Issue 2).
- Maczfit orphan gone on next banner read with no manual SQL; deleting/dismissing a draft closes its CONFIRM_DRAFT task in the same tx (Issue 3).
- No regression to PWA standalone, pinned header, page-scrolling tabs, PTR, sheets, existing suites.
- Issue 1 explicitly reverts round-2 commit 0e07dd6's `[data-shell-root] min-height:100dvh` → 100lvh, documented as a misdiagnosis-revert (safe because the real black-band cause — round-4 stacked clearances — was removed in R14).
  </success_criteria>

<output>
After completion, create `.planning/quick/260612-kxd-shell-clip-chain-dvh-grid-keyboard-remea/260612-kxd-SUMMARY.md`
</output>

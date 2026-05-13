# Phase 4: Spendings Grid - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-13
**Phase:** 04-spendings-grid
**Areas discussed:** Side-slider architecture, Drag-reorder lib & persistence, Quick-entry + month-nav behavior, Recurring drafts row + reserve refresh

---

## Side-slider architecture

### Q1 — How many slider components?

| Option                              | Description                                       | Selected |
| ----------------------------------- | ------------------------------------------------- | -------- |
| One unified Sheet w/ mode prop      | Single component, 4 modes, shared chrome          |          |
| Two sliders: Transaction + Category | Domain split, each handles create+edit internally | ✓        |
| Four separate components            | One per action, maximally explicit                |          |

**User's choice:** Two sliders — TransactionSlider + CategorySlider.
**Notes:** User initially picked unified after first ask, then on the reuse follow-up asked "what do you mean by one unified slider?". Claude explained the unified concept with a triggers table and visual sketch. User then said "I don't want all-in-one slider" — rejected unified and confirmed separate. Two-slider split chosen as cleanest balance.

### Q2 — Reuse of Phase 2 form code

| Option                                    | Description                                                                                        | Selected |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------- | -------- |
| Cherry-pick field components, fresh shell | Pull currency picker, AmountInput, DateInput, FX badge; drop EXPENSE/INCOME/TRANSFER kind switcher | ✓        |
| Wrap existing forms unchanged             | Fastest; drags along v1.0 leftovers                                                                |          |
| Rewrite from scratch                      | Discards tested validation/FX/currency logic                                                       |          |

**User's choice:** Cherry-pick.
**Notes:** Keeps tested logic, drops v1.0 EXPENSE/INCOME/TRANSFER kind switcher and filter chips (GRID-12).

### Q3 — Slider sizing

| Option                             | Description                            | Selected |
| ---------------------------------- | -------------------------------------- | -------- |
| Desktop 480px, mobile full-screen  | Matches Phase 2 existing Sheet pattern | ✓        |
| Desktop 560px, mobile bottom-sheet | Wider desktop; iOS-style mobile motion |          |
| Desktop 400px, mobile full-screen  | Narrower, less visual disruption       |          |

**User's choice:** 480px desktop / full-screen mobile.

---

## Drag-reorder lib & persistence

### Q1 — Library

| Option                     | Description                             | Selected |
| -------------------------- | --------------------------------------- | -------- |
| @dnd-kit/sortable          | Modern, a11y-first, ~20kb, RSC-friendly | ✓        |
| @hello-pangea/dnd          | RBD fork; ~50kb; React 18 caveats       |          |
| Native HTML5 drag (no lib) | Broken touch support, no a11y           |          |

**User's choice:** @dnd-kit/sortable.

### Q2 — Persistence strategy

| Option                            | Description                                                | Selected |
| --------------------------------- | ---------------------------------------------------------- | -------- |
| Single PUT with full ordered list | Server rewrites sort_index 1..N in one tx; last-write-wins | ✓        |
| PATCH each moved category         | Chatty; concurrent drops can interleave                    |          |
| Fractional / lexorank index       | Robust under concurrency; overkill for v1.1                |          |

**User's choice:** Single PUT.

### Q3 — Mobile drag affordance

| Option                                           | Description                              | Selected |
| ------------------------------------------------ | ---------------------------------------- | -------- |
| Explicit grip icon (GripVertical) always visible | Clear affordance, no scroll conflicts    | ✓        |
| Long-press anywhere on header                    | Conflicts with horizontal-scroll gesture |          |
| Edit-mode toggle                                 | "Rearrange" button enters reorder mode   |          |

**User's choice:** Explicit grip icon.

### Q4 — Dashed `+` column draggability

| Option                                         | Description                  | Selected |
| ---------------------------------------------- | ---------------------------- | -------- |
| Locked far right, not draggable, not droppable | Preserves GRID-08 invariant  | ✓        |
| Draggable like any column                      | Breaks "rightmost" semantics |          |

**User's choice:** Locked.

---

## Quick-entry + month-nav behavior

### Q1 — Quick-entry submission strategy

| Option                                                                                                                            | Description                                                                         | Selected |
| --------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | -------- |
| Optimistic insert + rollback on server error                                                                                      | Fastest perceived; transparent retry                                                |          |
| Server-confirm before render                                                                                                      | Slower; misses ~200ms goal                                                          |          |
| Optimistic + revalidate (no rollback)                                                                                             | Stays visible; swap on server response                                              |          |
| User free-text: "Optimistic, but if server return error, mark it as unset and show retry/reload icon so user can manually retry." | Optimistic insert; on server error keep row + visible retry icon; user-driven retry | ✓        |

**User's choice:** Optimistic with manual-retry icon on error.
**Notes:** User rejected silent auto-retry. Failed sends stay visible with retry/reload icon until user acts.

### Q2 — Decimal separator

| Option                                              | Description                             | Selected |
| --------------------------------------------------- | --------------------------------------- | -------- |
| Accept both `.` and `,`, normalize to `.` on submit | Locale-agnostic; inputMode="decimal"    | ✓        |
| Strict by next-intl locale                          | Locale-aware but punishes muscle memory |          |
| Dot only                                            | Bad for PL/UK markets                   |          |

**User's choice:** Accept both, normalize on submit.

### Q3 — Arrow-key month navigation

| Option                                          | Description                            | Selected |
| ----------------------------------------------- | -------------------------------------- | -------- |
| Only when focus is outside any input            | Allows native arrow behavior in inputs |          |
| Global (always navigate)                        | Aggressive; surprises during typing    |          |
| Dedicated `‹ ›` buttons + Cmd/Ctrl+←/→ shortcut | Explicit; no accidental jumps          | ✓        |

**User's choice:** Buttons + Cmd/Ctrl modifier shortcut.
**Notes:** Deliberate softening of GRID-10's "arrow keys" wording. Reason: avoid hijacking cursor in quick-entry inputs and slider fields. Intent (keyboard month nav) preserved.

### Q4 — Month state persistence

| Option                            | Description                                 | Selected |
| --------------------------------- | ------------------------------------------- | -------- |
| URL search param `?month=YYYY-MM` | Bookmarkable, shareable, browser-back works | ✓        |
| Client-only state                 | No deep linking; no history                 |          |
| URL hash `#YYYY-MM`               | Hybrid; not idiomatic for Next App Router   |          |

**User's choice:** URL search param.

### Q5 — Past-month read-only semantics

| Option                                                                                               | Description                                          | Selected |
| ---------------------------------------------------------------------------------------------------- | ---------------------------------------------------- | -------- |
| Disable quick-entry; pen-edit still works                                                            | Matches success-criterion 4 wording                  |          |
| Allow quick-entry but date defaults to last-day-of-month                                             | Backfill UX; same date semantics user picked         |          |
| Allow quick-entry but jump to current month                                                          | Confusing                                            |          |
| User free-text: "it is not read-only at all, you can change it in same way you change current month" | Past months fully editable; same UX as current month | ✓        |

**User's choice:** Past months fully editable, NOT read-only.
**Notes:** Deliberate override of success-criterion 4 wording. Intent (let user fix past txns) preserved and extended.

### Q6 — Past-month default date for new quick-entry

| Option                                      | Description                             | Selected |
| ------------------------------------------- | --------------------------------------- | -------- |
| Last day of viewed month (e.g., 2026-03-31) | Matches "end-of-month catch-up" pattern | ✓        |
| First day of viewed month                   | Defensible alternative                  |          |
| Today's date                                | Confusing — txn pops in current month   |          |
| Prompt for date inline                      | Slower; breaks ~200ms feel              |          |

**User's choice:** Last day of viewed month.

---

## Recurring drafts row + reserve refresh

### Q1 — Draft row visual treatment

| Option                                     | Description                                | Selected |
| ------------------------------------------ | ------------------------------------------ | -------- |
| Subtle bg tint + dashed yellow left border | Clear "awaiting your action" without alarm | ✓        |
| Striped pattern background                 | Visually noisy                             |          |
| Italic muted text + leading icon           | Too subtle on dense grid                   |          |

**User's choice:** Subtle bg tint + dashed yellow left border (decorative).

### Q2 — Confirm/Edit/Dismiss UI

| Option                            | Description                      | Selected |
| --------------------------------- | -------------------------------- | -------- |
| Inline buttons on click/tap       | Discoverable; 1-click happy path | ✓        |
| Single-tap row opens slider       | Slower happy path                |          |
| Swipe-left mobile / hover desktop | Inconsistent across breakpoints  |          |

**User's choice:** Inline buttons (Confirm primary, Edit text, Dismiss icon).

### Q3 — Dismiss semantics

| Option                                           | Description                      | Selected |
| ------------------------------------------------ | -------------------------------- | -------- |
| Dismiss this occurrence only; rule keeps running | RECR-06 semantics; safe default  | ✓        |
| Dismiss + offer "stop rule" as secondary         | Two-click destructive option     |          |
| Dismiss = stop the rule                          | Too destructive for single click |          |

**User's choice:** Per-occurrence dismiss; rule keeps running.

### Q4 — Reserve-deduction refresh strategy

| Option                                             | Description                                         | Selected |
| -------------------------------------------------- | --------------------------------------------------- | -------- |
| Optimistic local recompute + background revalidate | Hits ~200ms goal; silent reconcile                  | ✓        |
| Refetch summary on every quick-entry               | Always accurate but slow                            |          |
| SSE push from server                               | Architecturally pure; heavy lift; Phase 8 candidate |          |

**User's choice:** Optimistic local + background revalidate.

---

---

## Universal interaction model (clarification round, post-initial discussion)

User flagged that the initial draft-row "inline action buttons on hover/tap" answer was meant as a **grid-wide pattern**, not just for drafts. Then refined further: **NO hover anywhere — click only reveals options; double-click inline-edits.** Applies to txn rows, draft rows, bottom quick-entry slot, and category headers identically across desktop and mobile.

### Q-IM1 — Click on a cell, what happens?

| Option                                     | Description                                              | Selected |
| ------------------------------------------ | -------------------------------------------------------- | -------- |
| Cell becomes inline-editable (Excel-style) | Click = input mode immediately                           |          |
| Click opens slider pre-filled              | Click = same as pen icon                                 |          |
| Click selects, double-click inline-edits   | Single click highlights; double-click enters inline edit | ✓        |

**User's choice:** Initially "Click selects, double-click inline-edits" — then user pivoted in the same answer notes: **"I changed my mind - click shows options, double click - quick edit. Same for recurring drafts"**. Then a **follow-up correction**: **"important, not hover!!! click and double click"** — confirming hover is NOT part of the model. Final rule: **single click reveals options; double-click inline-edits. Hover does nothing.**

### Q-IM2 — What does "empty cell" mean?

| Option                                 | Description                      | Selected |
| -------------------------------------- | -------------------------------- | -------- |
| Bottom quick-entry slot of each column | The blank input at column bottom | ✓        |
| Blank rows below last txn in column    | Empty vertical space             |          |
| Both                                   | Bottom input + blank rows        |          |

**User's choice:** Bottom quick-entry slot only.

### Q-IM3 — When does the slider actually open?

| Option                                        | Description                                              | Selected |
| --------------------------------------------- | -------------------------------------------------------- | -------- |
| Only via pen icon in click-revealed options   | Click cell = reveal options; pen icon = full slider edit | ✓        |
| Only for category edit + create (dashed +)    | Txns entirely inline                                     |          |
| Pen icon + click on certain cells (note/date) | Mixed — amount inline, note/date open slider             |          |

**User's choice:** Pen icon in revealed options is the only slider entry point.

### Q-IM4 — What does double-click on a txn row inline-edit?

| Option                                                                                           | Description                                                                                      | Selected |
| ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ | -------- |
| The cell you double-clicked                                                                      | Excel cell-by-cell; amount/note each own targets                                                 |          |
| Amount only (most common edit)                                                                   | Double-click anywhere → amount editable; others need slider                                      |          |
| Whole row becomes editable inline                                                                | All visible fields turn into inputs at once                                                      |          |
| User free-text: "in cell only amount is visible and not a note, etc. So only amount is editable" | Amount is the only visible field in a cell → amount-only inline edit; everything else via slider | ✓        |

**User's choice:** Amount only — because amount is the only field visible inside the cell. Other fields (note, date, currency, category) require slider via pen.

### Q-IM5 — Double-click on category header cells?

| Option                                                                                 | Description                                      | Selected |
| -------------------------------------------------------------------------------------- | ------------------------------------------------ | -------- |
| Yes — double-click planned cell edits planned; double-click cushion cell edits cushion | SCD-2 versioning applies; name cell same pattern |          |
| Category never inline — always slider                                                  | Click → pen icon → slider with all fields        | ✓        |

**User's choice:** Category cells are never inline-editable. Always slider via pen. Reason: slider also carries icon/color/cushion-mode controls users should see together.

### Q-IM6 — Draft row double-click behavior?

| Option                                                                                | Description                                 | Selected |
| ------------------------------------------------------------------------------------- | ------------------------------------------- | -------- |
| Yes — double-click amount cell edits amount, then Enter button promotes (Recommended) | Tweak draft amount inline before promoting  | ✓        |
| No — draft rows only editable via slider (pen icon)                                   | Drafts treated as read-only until confirmed |          |

**User's choice:** Yes — double-click amount → edit → Enter promotes the draft with the new amount in one shot. Confirm button (revealed in options) is the no-edit promote path.

---

## Claude's Discretion

- Client cache lib choice for optimistic mutations + retry queue (recommendation: TanStack Query).
- RSC shell vs client island split inside `spendings/page.tsx`.
- Exact `surface-elevated-dark` token for draft row bg (validate against DESIGN.md during build; request new token if needed).
- Pending vs unsent visual states for optimistic rows (spinner vs retry icon).
- Long-press duration calibration (default 300ms).
- Whether to extend `/budget-home-summary` or create new `/spendings-summary` endpoint.
- Mobile column width within 140–160px range.

## Deferred Ideas

- SSE/WebSocket real-time updates → Phase 8 or post-launch.
- Scroll-aware sticky shrink for month-header → rejected at Phase 3; revisit only on usability pressure.
- Per-category icon/color picker richness → preset palette for v1.1; richer customization later.
- Fractional/lexorank sort_index → revisit only if multi-user concurrent reorder becomes real.
- Swipe-actions on mobile draft rows → enhancement candidate post-Phase-4.
- INCOME/TRANSFER kind from quick-entry → Wallets tab / dedicated affordance.
- "Edited" badge + edit-history-panel from Phase 2 → defer decision to planning.
- Bulk operations → out of scope (GRID-12).

# Phase 5: Reserves & Wallets Tabs - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-17
**Phase:** 5-Reserves & Wallets Tabs
**Areas discussed:** Wallets cell-interaction model, Reserves tab data shape + share math, Layout-primitive sharing, Wallet defaults + delete semantics

---

## Wallets cell-interaction model

### Q1: At rest, how do cells render?

| Option                                                         | Description                                                                                                     | Selected |
| -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | -------- |
| Always-input (form-like row)                                   | Cells render as <input>/<select> at rest. Tab between, blur auto-saves. Matches WALT-03 literally.              |          |
| Read-at-rest, single-click reveals + double-click inline-edits | Plain text at rest. Single-click row reveals options; double-click cell edits. Matches Phase 4 universal model. |          |
| Hybrid: text cells always-input, Type as segmented control     | Name/Currency/Amount as inputs; Type as always-visible 3-pill segmented control.                                |          |

**User's choice (free-text):** "Analyze how spending are done and let's do the same. For desktop: it renders as normal text, but on hover let's highlight the row, on click on any col, that col becomes editable and make row editable + trash button appears. For mobile the same behavior, but when clicked is highlighted and double click (and single click highlighted, both are possible) when its possible to edit. In both cases on blur or edit saves"

**Notes:** Pivot from given options. User invented a 4th model: text at rest, hover-highlights-row (desktop), click-cell-becomes-editable, mobile uses tap-highlights + double-tap-edits, blur saves. This is a **deliberate softening of Phase 4's no-hover universal rule** because wallets are form-like rows (not data-grid rows). Captured as D-PH5-W4 through D-PH5-W6 in CONTEXT.md.

### Q2: Type cell — how should it render?

| Option                                      | Description                                                                                                   | Selected |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | -------- |
| Always-visible 3-pill toggle                | Type renders as inline `[Spend][Cush][Res]` segmented pills always visible in the row. Click toggles + saves. |          |
| Type as dropdown (consistent with Currency) | Type renders as plain label; click → dropdown of 3 options.                                                   |          |

**User's choice (free-text):** "I want 3 different sections in wallets, the type will not be visible in a row, rather wallets will be grouped in different sections"

**Notes:** **Major pivot.** Wallets tab restructured to 3 sections (Spendings / Cushion / Reserve) instead of a single table with a Type column. Type is now the grouping axis, not a row cell. Rows show only Name / Currency / Amount + delete. Captured as D-PH5-W1 in CONTEXT.md.

### Q3: How does user change a wallet's type (move between sections)?

| Option                                        | Description                                                                             | Selected |
| --------------------------------------------- | --------------------------------------------------------------------------------------- | -------- |
| Drag-and-drop row to another section          | Drag handle on row; long-press / mouse-drag to move. Reuses Phase 4 @dnd-kit primitive. | ✓        |
| 'Move to' menu (kebab/dropdown)               | Click → menu with "Move to {Cushion / Reserve}".                                        |          |
| Type only set at creation; no in-place change | Delete + recreate to change type.                                                       |          |

**Notes:** Drag-and-drop chosen. Reuses Phase 4's drag-reorder primitive (@dnd-kit + GripVertical). Captured as D-PH5-W7.

### Q4: Sections — add affordance, ordering, empty state?

| Option                                                                            | Description                                                                                                | Selected |
| --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | -------- |
| Per-section +Add at bottom; fixed order; empty section shows only +Add            | Each of 3 sections has its own +Add row at bottom. Fixed Spendings→Cushion→Reserve. Empty shows just +Add. |          |
| Per-section +Add; fixed order; empty section shows muted 'No X wallets yet' + Add | Adds helper copy for empty sections.                                                                       |          |
| Single global +Add wallet; empty section collapsed                                | One add button at top with type chooser.                                                                   |          |

**User's choice (free-text):** "Per section. Similar like you you did for adding category, let's add transparent button with dashed border as the bottom of the list in each section"

**Notes:** Per-section dashed button (visual rhyme with Phase 4 `+ Add category` dashed column). Fixed section order (Spendings → Cushion → Reserve). Empty sections still render the dashed +Add button without helper copy. Captured as D-PH5-W2 / D-PH5-W3.

---

## Reserves tab data shape + share math

### Q5: Data-fetching strategy?

| Option                                                         | Description                                                                                                     | Selected |
| -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | -------- |
| New GET /budgets/:id/reserves — server pre-computes everything | One endpoint returns rows + totals. Math server-side. Future Phase 7 task generator consumes the same endpoint. | ✓        |
| Extend existing /spendings-summary                             | Add share fields to existing endpoint. One endpoint, denser payload.                                            |          |
| Two endpoints, compose client-side                             | /spendings-summary + /wallets; client computes share.                                                           |          |

**Notes:** New dedicated endpoint chosen for single source of truth (Phase 7 reuse). Captured as D-PH5-R1 / D-PH5-R2.

### Q6: Share math edge cases?

| Option                                                                                                 | Description                                                                 | Selected |
| ------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------- | -------- |
| Zeros show '—'; banner on mismatch; FX-convert reserve wallets                                         | Em dash for zero sums; yellow banner placeholder; FX server-side.           |          |
| Zeros show 0.00; no banner this phase; FX-convert server-side                                          | Numeric zero; Phase 7 owns banner; FX server-side.                          |          |
| Zeros show '—'; mismatch silent (column math only); no FX (reserve wallets must be in budget currency) | Em dash; no banner; reject non-budget-currency reserve wallets server-side. | ✓        |

**Notes:** Reserve-type wallets MUST be in budget currency (server validates). Mismatch surfacing is silent this phase (Phase 7 owns task + banner). Zeros render '—'. Captured as D-PH5-R3 through D-PH5-R5.

---

## Layout-primitive sharing

### Q7: Shared component or separate?

| Option                                                | Description                                                      | Selected |
| ----------------------------------------------------- | ---------------------------------------------------------------- | -------- |
| Two separate components (ReservesTable + WalletsList) | No shared parent; reuse tokens + icons only.                     |          |
| Shared <DataTable> primitive with slots               | One component used by both.                                      |          |
| Shared row/cell primitives only (no full table)       | Atoms like `<DataRow>`, `<InlineEditCell>`, `<DashedAddButton>`. |          |

**User's choice (free-text):** "I don't understand question and options"

**Notes:** Question recognized as technical implementation detail — moved to Claude's discretion per philosophy ("Claude handles technical implementation details"). Decision documented in CONTEXT.md Claude's Discretion: separate components + shared atoms (`<RowDragHandle>`, `<InlineEditCell>` new, `<DashedAddButton>` new generalizing Phase 4 dashed +category).

---

## Wallet defaults + delete semantics

### Q8: New wallet defaults?

| Option                                                                         | Description                                                           | Selected |
| ------------------------------------------------------------------------------ | --------------------------------------------------------------------- | -------- |
| Type from section; Currency = budget default; Amount = 0; Name = empty (focus) | Currency defaults to budget currency. Reserve sections lock currency. | ✓        |
| Type from section; Currency = empty (must pick)                                | User must explicitly pick currency.                                   |          |
| Type from section; Currency = user display_currency                            | Defaults to user's profile currency.                                  |          |

**Notes:** Captured as D-PH5-W9. Reserve section enforces currency = budget currency (per D-PH5-R3).

### Q9: Delete semantics?

| Option                                          | Description                             | Selected |
| ----------------------------------------------- | --------------------------------------- | -------- |
| Soft-archive with 'Show archived' toggle        | Recoverable via UI toggle.              |          |
| Soft-archive, no toggle (hidden forever via UI) | Recovery only via admin/DB. Cleaner UI. | ✓        |
| Hard delete                                     | Permanent.                              |          |

**Notes:** Soft-archive with no in-UI restore. Confirmation dialog text must say "can't be undone here" — literally accurate since recovery is admin/DB only. Captured as D-PH5-W10 / D-PH5-W11.

---

## Claude's Discretion

- **Layout-primitive sharing** — user deferred. Decision: separate `<ReservesTable>` + `<WalletsSectionedList>` components with shared atoms (`<RowDragHandle>`, `<InlineEditCell>` new, `<DashedAddButton>` new).
- **In-section reorder** — not user-mandated; planning may defer to a separate ticket.
- **Drop-zone visuals** — standard @dnd-kit overlay + section tint on drag-over.
- **Mobile drag activation delay** — default `{ delay: 300, tolerance: 5 }`.
- **Reserves footer-row visual style** — sticky bottom totals row with `Σ` glyph (final placement during sketch).
- **Toast library / position** — reuse Phase 4's existing toast primitive.

## Deferred Ideas

- Restore-archived-wallets UI — defer; recovery is admin/DB-only this phase
- Multi-currency reserve-type wallets — explicitly rejected to simplify share math (no FX)
- Reserve-mismatch banner + RESERVE_TOPUP task — Phase 7
- In-section reorder (drag within section) — needs new `sort_index` column, defer if not cheap
- Wallet detail / transaction-history view — out of scope (WALT-07 manual snapshots only)
- Bulk wallet operations (multi-select delete, bulk currency change) — out of scope
- Insights / charts using reserve-share data — v1.1 ships dashboard placeholder only

# Investments drag-and-drop — model, invariants, gotchas

Notes for the Wallets → Investments sortable (`investments-section.tsx`). Since
Phase 13, groups ARE the investment type (fixed keys, D-10/D-12) — there are no
user-named groups and a holding never changes group by dragging. Read before
touching the drag code; verify changes live (recipe at the bottom) — unit tests
replace dnd-kit's sensors and do **not** catch interaction bugs.

## The model

- **One `DndContext`, two levels of `SortableContext`.**
  - Outer: one item per type BLOCK, id `type:<uiType>`. The block (header + rows)
    is one sortable node; its handle sits in `InvestmentTypeHeader`'s
    `dragHandle` slot. Order persists per budget via `PUT /type-order`
    (`useSetTypeOrder`), shared by all members.
  - Inner: each block's rows, ids = holding ids. Order persists via the existing
    `POST /reorder` with every block flattened in display order.
- **Rows never re-parent.** A row only moves inside its own type; changing type is
  an Edit (a correction, roadmap point 6). So there is no join-into-group logic,
  no geometry snapshot and no group inference on drop.
- **Custom `collisionDetection` filters droppables by drag kind.** Blocks and rows
  share one DndContext, so with plain `closestCenter` the big block droppables win
  a row drag. A block drag only sees blocks; a row drag only sees rows of its own
  type — a cross-type drop is impossible, and `onDragEnd` also refuses it.
- **Blocks collapse while a block is dragged** (stable target, UI-SPEC); the
  user's per-type collapse choice (`inv-type-<budget>-<type>`) is untouched.

## No snap-back on drop

`committed` (rows) and `committedOrder` (blocks) are set synchronously on drop so
the DOM is final on the pointer-up frame — the mutations' optimistic cache
updates land a tick later, after `await cancelQueries`. Each clears only once the
live data MATCHES it, so it never masks later updates.

Rows keep `animateLayoutChanges: () => false` (the post-drop transform reset must
not animate, D-#dnd-jump).

## Don'ts (each one is a fixed bug)

- **No `onDragOver` setState live-move.** With `MeasuringStrategy.Always` it
  re-fires and crashes with React #185. `verticalListSortingStrategy` animates.
- **Don't drop the collision filter** — row drags would resolve `over` to their
  own block and silently no-op.
- **Space guard:** a capture-phase keydown that swallows Space breaks dnd-kit's
  keyboard lift; it must check the active roledescription AND a body marker
  (`setDndDragging`). See memory `feedback_capture_keydown_vs_dndkit`.

## Live-verification recipe (Playwright, 390px)

`browser_drag` does NOT work — dispatch real `PointerEvent`s:

- PointerSensor needs `{ isPrimary: true, buttons: 1 }` or the drag never
  activates. `pointerdown` on the grip (`[data-testid="drag-grip-type <type>"]`
  for a block, `drag-grip-<lowercasename>` for a row), `pointermove`s on
  `document` with an rAF between moves, then `pointerup`.
- Use a FIXED pointer delta — converge-on-a-moving-target drags oscillate.
- **Verify persistence via DB / reload**, not DOM order:
  `SELECT investment_type_order FROM tenancy.budgets WHERE id = '<budget>'` and
  `SELECT name, sort_order FROM budgeting.investments WHERE budget_id = '<budget>'
AND archived_at IS NULL ORDER BY sort_order` (psql as `postgres`).
- dnd-kit discards synthetic drops that land outside a droppable — confirm the
  row/block actually landed, don't just wait longer (memory
  `project_dndkit_drop_discarded`).

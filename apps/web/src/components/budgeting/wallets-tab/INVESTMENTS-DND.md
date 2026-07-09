# Investments drag-and-drop — model, invariants, gotchas

Hard-won notes for the Wallets → Investments sortable (`investments-section.tsx` +
pure `lib/investment-grouping.ts`). Read before touching the drag code — every
rule here is a bug we already paid for. Verify changes live (see the recipe at
the bottom); unit tests alone do **not** catch the @dnd-kit interaction bugs.

## The model

- **One flat `SortableContext`.** Group headers AND holdings are sortable items in
  a single container — no nested per-group DOM subtree. A grouped child only
  _looks_ nested via a per-row `ml-3 pl-3 + ::before` rail. Why: a holding dragged
  across groups stays in the same parent → it never re-mounts → no mid-drag
  @dnd-kit crash (re-parenting the active node = React remount = dead ref = throw).
- **Group membership is a per-holding attribute (`group_name`), independent of
  position.** Loose rows interleave with groups, so you cannot derive group from
  flat position. Group comes from the DROP, not the slot.
- **Position and group are resolved separately on drop:**
  - **Position** = `computeInsertIndex(activeId, overId)` — `arrayMove` of the
    visible sortable ids (headers + visible holdings), then collapsed headers
    expanded back to their members. Using `over` makes the commit equal the
    previewed gap (no jump-back) and works against a collapsed group whose members
    aren't rendered.
  - **Group** = `computeTargetGroup(aMid)` — the join band (geometry, below) that
    contains the dragged centre. `resolveHoldingDrop(holdings, activeId,
insertIndex, targetGroup)` reclusters the two into the final order + group.

## The dragged centre: `aMid = activeStartMid + delta.y`

`activeStartMidRef` = the dragged row/header centre captured at drag-START;
`liveMid(delta.y) = activeStartMid + delta.y`. Both the live indent preview
(`onDragMove`) and the drop (`onDragEnd`) use the SAME basis so preview == commit.

**Do NOT use `active.rect.current.translated`** — it lags / never advances
on-device and under synthetic events, so the indent preview never fires. `delta.y`
is the raw pointer displacement and is reliable everywhere.

## The join band geometry (the part that keeps biting)

A group's **join band** = the vertical span where the dragged centre counts as a
CHILD of that group (→ indent + join on drop). Outside every band → loose. Bands
are snapshotted at drag-START (mid-drag rects include @dnd-kit's gap transforms).
The maths is the PURE, unit-tested `computeJoinBands(geoms, activeGroup)` — keep it
pure, extend the tests when you touch it.

Per group, `top`/`bottom`:

| case                                                        | top                 | bottom                     | why                                                                 |
| ----------------------------------------------------------- | ------------------- | -------------------------- | ------------------------------------------------------------------- |
| **expanded, joining from outside** (`name !== activeGroup`) | `headerTop − gap/2` | last visible member bottom | the swap point (below)                                              |
| **expanded, ejecting** (item's own group)                   | `headerBottom`      | last member bottom         | indent must clear the instant the item rises to cover the header    |
| **collapsed** (no visible members)                          | `headerBottom`      | `headerBottom + 64`        | no members → child means a real gap below the header; one-row reach |

**The single most important fact:** @dnd-kit's `verticalListSortingStrategy` swaps
the header UP over the dragged row the instant `over` flips to it. With
`closestCenter` + equal-height rows + `gap-2` (8px), that flip is at the **middle
of the gap above the header = `headerTop − gap/2`**, ~28px ABOVE the header centre.

- Pinning the joining band at the header **centre** (an earlier attempt) left a
  dead zone `[swap, centre]`: the row rendered visually below the header but
  `aMid < centre` → no indent → drop resolved loose → "jumps back above". Fixed by
  starting the band at the swap point. Indent now turns on the exact frame the row
  clears the header, and a drop there lands first-in-group.
- The band is **origin-aware**: the group the item already belongs to (ejecting)
  starts at `headerBottom`, not the swap point, so dragging a member up out of its
  own group clears the indent when it reaches the header — not while it covers it.
- Collapsed groups start at `headerBottom` for the same reason (no members to be a
  child of; a centre/header-overlap start made "above the group" still join).

## No flicker on drop — two independent causes

1. **`<DragOverlay dropAnimation={null}>`.** The overlay is always mounted (it
   renders the cohesive block for group drags, `null` for holding drags). With an
   overlay present, @dnd-kit runs its default **drop animation** that pins the
   SOURCE row at `opacity:0` for ~250ms while it flies the overlay home — even when
   the overlay child is null. We place the row instantly via `committed`, so the
   animation is pure downside. Disable it. (Diagnose by frame-capturing the dropped
   row's computed opacity over ~24 post-pointerup frames — it reads 0 on frames
   ~1–15 if this regresses.)
2. **`committed` optimistic order, cleared only on a full match.** On drop,
   `setCommitted(applyResult(...))` so the DOM is final on the pointer-up frame
   (the reorder mutation's optimistic cache update lands a tick later, after
   `await cancelQueries`). A **group-change** drop fires TWO optimistic mutations
   (reorder = sortOrder, update = group) on the same query key; clearing
   `committed` on the FIRST `holdings` change paints the half-applied state
   (reordered, OLD group) for a frame. Clear it only once live holdings MATCH
   committed (id order + group per id).
3. **Flat render (`flatMap`), never a per-group `<Fragment>`.** A `<Fragment>` is a
   reconciliation boundary: a holding changing group on drop would unmount in the
   old Fragment and remount elsewhere → blink. Flat + keyed-by-id → React MOVES the
   node. (Necessary but not sufficient on its own — #1 is the bigger blink.)

## Don'ts (each one is a fixed bug)

- **No `onDragOver` setState live-move.** With `MeasuringStrategy.Always` it
  re-fires and crashes with React #185. The flat list + native
  `verticalListSortingStrategy` already animates every reorder. Only `onDragMove`
  updates the indent preview, and only when the target group actually changes.
- **No drop zones / dashed "keep separate" targets.** Deleted — unintuitive, and
  the mid-drag list-shrink confused users.
- **No per-group `<Fragment>` wrapper** (see flicker #3).
- **Don't "simplify" group to be position-derived** — loose rows interleave; group
  is a per-holding attribute resolved from the drop target.

## Live-verification recipe (Playwright MCP, 390px)

`browser_drag` does NOT work — dispatch real `PointerEvent`s:

- PointerSensor needs `{ isPrimary: true, buttons: 1 }` on the events or the drag
  never activates (the dragged row never gets `z-50`). `pointerdown` on the grip
  (`[data-testid="drag-grip-<lowercasename>"]`, group grip = `drag-grip-group
<name>`), `pointermove`s on `document`, an rAF (or two) between moves.
- Use a FIXED pointer delta or capture the target's absolute Y before pointerdown —
  converge-on-a-moving-target drags oscillate (both the row and its neighbours
  carry transforms).
- **Verify group membership via DB**, not DOM order: `docker exec -i budget-db-1
psql -U postgres -d budget` → `SELECT name, group_name, sort_order FROM
budgeting.investments WHERE tenant_id='<budget>' AND archived_at IS NULL ORDER BY
sort_order`. (Role is `postgres`.)
- **Collapsed-group tests:** localStorage persists expand state
  (`inv-group-<budget>-<slug>`), so a fresh nav can render expanded. Force-collapse
  - assert `aria-expanded=false` before trusting a collapsed test.
- A synchronous DOM read right after a synthetic `pointerup` shows the PRE-commit
  order (synthetic events skip React's discrete-event sync flush) — sample painted
  frames via rAF, or trust `committed` + DB.

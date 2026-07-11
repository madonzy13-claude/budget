/**
 * investment-grouping.ts — pure helpers for the interleaved, sortable investments
 * group model (Phase 9 group redesign).
 *
 * The Wallets → Investments list is a SINGLE top-level list that interleaves
 * GROUP blocks and LOOSE holdings. A group occupies one contiguous block,
 * positioned at its first member (= min sortOrder). Dragging a group moves the
 * whole block; dragging a holding reorders it within its group, moves it across
 * groups, or drops it out to loose.
 *
 * These helpers are framework-free so the (fiddly) reorder maths is unit-tested
 * in isolation; the React section just renders `buildInvestmentEntries` and
 * dispatches the `resolveDragEnd` result to the reorder + group-update mutations.
 */
import type { HoldingDto } from "@/hooks/use-investments";

export type InvestmentEntry =
  | { kind: "group"; name: string; holdings: HoldingDto[] }
  | { kind: "loose"; holding: HoldingDto };

const order = (a: HoldingDto, b: HoldingDto) =>
  (a.sortOrder ?? 0) - (b.sortOrder ?? 0);

/**
 * Build the interleaved top-level entries. A group appears at the position of its
 * first member (sortOrder order) with ALL its members clustered; loose holdings
 * interleave by their own sortOrder. One block per group name.
 */
export function buildInvestmentEntries(
  holdings: HoldingDto[],
): InvestmentEntry[] {
  const sorted = [...holdings].sort(order);
  const byGroup = new Map<string, HoldingDto[]>();
  for (const h of sorted) {
    if (h.group) {
      const arr = byGroup.get(h.group) ?? [];
      arr.push(h);
      byGroup.set(h.group, arr);
    }
  }
  const emitted = new Set<string>();
  const entries: InvestmentEntry[] = [];
  for (const h of sorted) {
    if (h.group) {
      if (!emitted.has(h.group)) {
        emitted.add(h.group);
        entries.push({
          kind: "group",
          name: h.group,
          holdings: byGroup.get(h.group)!,
        });
      }
    } else {
      entries.push({ kind: "loose", holding: h });
    }
  }
  return entries;
}

/** Flatten entries back to a holding-id order (groups expanded as blocks). */
export function flattenEntries(entries: InvestmentEntry[]): string[] {
  const ids: string[] = [];
  for (const e of entries) {
    if (e.kind === "group") ids.push(...e.holdings.map((h) => h.id));
    else ids.push(e.holding.id);
  }
  return ids;
}

export interface GroupAggregate {
  /** Σ value in budget cents across ALL children. */
  valueBudgetCents: number;
  /** Cost-basis blended P/L% over children that HAVE a basis, else null. */
  plPct: number | null;
  /** Aggregate P/L money in budget cents (Σvalue − Σcost over children with a
   *  basis), else null. The real money figure (not back-derived from plPct). */
  plCents: number | null;
}

/**
 * Aggregate a group's children: total value (budget cents) + P/L against the
 * group's NET CONTRIBUTED capital.
 *
 * A group is treated as a mini-portfolio you deposit into (adding/growing a
 * holding books its cost) and withdraw from (selling/removing a holding books
 * its current value — the realized proceeds). `realizedCents` is Σ(proceeds −
 * cost) booked by past withdrawals (server-computed from the flow ledger; 0 for
 * groups that never had one, so the maths below is unchanged for them).
 *
 *   netContributed = Σ costCurrent − realized
 *   P/L (money)    = Σ value − netContributed = (Σ value − Σ cost) + realized
 *   P/L %          = P/L / netContributed
 *
 * costCurrent_i is derived from each child's own value and P/L% (value / (1 +
 * pl/100)). Children with no P/L (cash, no basis) contribute to value but are
 * excluded from the cost/realized maths. This keeps a sell-and-reinvest (e.g.
 * BTC → USDT within the group) showing the SAME P/L as before the sell, instead
 * of the gain vanishing with the sold quantity.
 */
export function groupAggregate(
  holdings: HoldingDto[],
  realizedCents = 0,
): GroupAggregate {
  let valueBudgetCents = 0;
  let sumV = 0;
  let sumC = 0;
  let anyBasis = false;
  for (const h of holdings) {
    const v = Number(h.valueInBudgetCents || 0);
    valueBudgetCents += v;
    if (h.profitLossPct != null) {
      const cost = v / (1 + h.profitLossPct / 100);
      sumV += v;
      sumC += cost;
      anyBasis = true;
    }
  }
  const netContributed = sumC - realizedCents;
  const plCents = anyBasis ? sumV - sumC + realizedCents : null;
  const plPct =
    anyBasis && netContributed > 0
      ? (plCents! / netContributed) * 100
      : null;
  return { valueBudgetCents, plPct, plCents };
}

export interface DragResult {
  orderedIds: string[];
  /** Present only when the drag changed a holding's group. */
  groupChange?: { holdingId: string; group: string | null };
}

/** A group's measured geometry at drag-start (the React island reads the rects;
 *  the band maths stays pure + unit-tested). `memberBottom` is the bottom of the
 *  group's last VISIBLE child, or null when the group is collapsed (no members
 *  rendered → no member band to fall into). */
export interface GroupGeom {
  name: string;
  headerTop: number;
  headerCenter: number;
  headerBottom: number;
  memberBottom: number | null;
}

/** The vertical band in which the dragged centre counts as a CHILD of `group`
 *  (→ indent preview + join on drop). Outside every band → loose. */
export interface JoinBand {
  group: string;
  top: number;
  bottom: number;
}

/**
 * Compute each group's JOIN band from drag-start geometry. The subtle part is the
 * TOP edge:
 *  - A group the dragged item is JOINING from outside (expanded, not its own) →
 *    top = `headerTop − swapGap`. @dnd-kit's verticalListSortingStrategy swaps the
 *    dragged row across the header the instant `over` flips to it, which (closest-
 *    centre, equal-height rows) happens at the MIDDLE OF THE GAP above the header,
 *    i.e. `headerTop − gap/2`. Pinning the band there makes the indent turn on the
 *    exact moment the row renders BELOW the header — no dead zone where the item
 *    sits visually inside the group yet drops back out above it (UAT: "if the item
 *    is below the header it must indent and drop inside"). Using `headerCenter`
 *    (the old value) left a ~28px dead zone above the centre.
 *  - A group the item is LEAVING (its own, ejecting) OR any COLLAPSED group →
 *    top = `headerBottom`. There the indent must clear the instant the item reaches
 *    the header (no member rows to be a child of), so the band starts BELOW it.
 * BOTTOM = last visible member (expanded) or a one-row reach below (collapsed).
 */
export function computeJoinBands(
  geoms: GroupGeom[],
  activeGroup: string | null,
  opts: { collapsedReach?: number; swapGap?: number } = {},
): JoinBand[] {
  const collapsedReach = opts.collapsedReach ?? 64;
  const swapGap = opts.swapGap ?? 4;
  return geoms.map((g) => {
    const joiningFromOutside = g.memberBottom != null && g.name !== activeGroup;
    return {
      group: g.name,
      top: joiningFromOutside ? g.headerTop - swapGap : g.headerBottom,
      bottom: g.memberBottom ?? g.headerBottom + collapsedReach,
    };
  });
}

const GROUP_PREFIX = "group:";
export const groupSortId = (name: string) => `${GROUP_PREFIX}${name}`;
export const isGroupSortId = (id: string) => id.startsWith(GROUP_PREFIX);
export const groupNameFromSortId = (id: string) =>
  id.slice(GROUP_PREFIX.length);

/**
 * Re-cluster a flat id order into contiguous group blocks (group positioned at
 * its first occurrence), so the persisted order always matches the rendered,
 * interleaved layout. `groupOf` returns each id's (possibly overridden) group.
 */
function recluster(
  flat: string[],
  groupOf: (id: string) => string | null,
): string[] {
  const emitted = new Set<string>();
  const out: string[] = [];
  for (const id of flat) {
    const g = groupOf(id);
    if (g == null) {
      out.push(id);
      continue;
    }
    if (emitted.has(g)) continue;
    emitted.add(g);
    for (const other of flat) if (groupOf(other) === g) out.push(other);
  }
  return out;
}

/**
 * Direction hints, set by the section from the dragged row's midpoint relative to
 * the target's midpoint (the pure module has no rects):
 *   - placeAfter: a group block dragged DOWNWARD lands AFTER the anchor, not
 *     before it (UAT #6 — otherwise a group can never become the last entry).
 *   - asLoose: a holding dragged ABOVE a group header stays LOOSE above the group
 *     instead of joining it (UAT #5 / #7 — a top group no longer swallows items).
 *   - asLooseEnd: a holding dropped clearly BELOW the last (trailing) group's last
 *     member lands LOOSE at the very end (replaces the old explicit ungroup zone).
 */
export interface DragOpts {
  placeAfter?: boolean;
  asLoose?: boolean;
  asLooseEnd?: boolean;
}

/**
 * Resolve a drag-end into a new flat order (+ optional group change). Returns
 * null for a no-op (drop on self, drop on own group header, or unresolvable
 * target). Cross-section rejection is handled by the caller before this runs.
 */
export function resolveDragEnd(
  holdings: HoldingDto[],
  activeId: string,
  overId: string,
  opts: DragOpts = {},
): DragResult | null {
  if (activeId === overId) return null;

  const baseOrder = flattenEntries(buildInvestmentEntries(holdings));
  const baseGroup = new Map<string, string | null>();
  for (const h of holdings) baseGroup.set(h.id, h.group ?? null);

  // ── Dragging a whole group block ──────────────────────────────────────────
  if (isGroupSortId(activeId)) {
    const groupName = groupNameFromSortId(activeId);
    const block = baseOrder.filter((id) => baseGroup.get(id) === groupName);
    if (block.length === 0) return null;
    const rest = baseOrder.filter((id) => baseGroup.get(id) !== groupName);

    // Anchor = the over target's slot in `rest`. For an over-group, the block
    // spans first..last member; placeAfter inserts after the last member (so a
    // group dragged down can land past the anchor → become last, UAT #6).
    let anchorFirst: string | undefined;
    let anchorLast: string | undefined;
    if (isGroupSortId(overId)) {
      const overName = groupNameFromSortId(overId);
      const members = rest.filter((id) => baseGroup.get(id) === overName);
      anchorFirst = members[0];
      anchorLast = members[members.length - 1];
    } else {
      anchorFirst = overId;
      anchorLast = overId;
    }
    if (!anchorFirst) return null;
    let at = opts.placeAfter
      ? rest.indexOf(anchorLast!) + 1
      : rest.indexOf(anchorFirst);
    if (at < 0) at = rest.length;
    const newOrder = [...rest.slice(0, at), ...block, ...rest.slice(at)];
    const finalOrder = recluster(newOrder, (id) => baseGroup.get(id) ?? null);
    if (finalOrder.join() === baseOrder.join()) return null;
    return { orderedIds: finalOrder };
  }

  // ── Dragging a holding ────────────────────────────────────────────────────
  // baseOrder is holding-ids only (group headers are NOT sortable items), so this
  // matches @dnd-kit's visual arrayMove exactly — no drop jump / move-back.
  const H = activeId;
  if (!baseGroup.has(H)) return null;
  const curGroup = baseGroup.get(H) ?? null;
  let overrideGroup: string | null = curGroup;
  const groupOf = (id: string): string | null =>
    id === H ? overrideGroup : (baseGroup.get(id) ?? null);
  let groupChange: DragResult["groupChange"] | undefined;
  let newOrder: string[];

  // ── Dropped clearly BELOW the trailing group → loose at the very end ─────────
  // (asLooseEnd; the section sets it when the over row is the last holding and the
  // dragged midpoint is past its bottom edge.) The symmetric "loose at the top /
  // between groups" is handled by asLoose on the group header below.
  if (opts.asLooseEnd) {
    const without = baseOrder.filter((id) => id !== H);
    const arranged = [...without, H];
    const reclustered = recluster(arranged, (id) =>
      id === H ? null : (baseGroup.get(id) ?? null),
    );
    const change = curGroup != null ? { holdingId: H, group: null } : undefined;
    if (reclustered.join() === baseOrder.join() && !change) return null;
    return change
      ? { orderedIds: reclustered, groupChange: change }
      : { orderedIds: reclustered };
  }

  if (isGroupSortId(overId)) {
    // Over a group header. Default → JOIN at the TOP of its block. But when the
    // dragged row's midpoint is ABOVE the header (asLoose), land it LOOSE just
    // above the group block instead of joining (UAT #5 / #7).
    const targetGroup = groupNameFromSortId(overId);
    const without = baseOrder.filter((id) => id !== H);
    const firstIdx = without.findIndex(
      (id) => baseGroup.get(id) === targetGroup,
    );
    const at = firstIdx === -1 ? without.length : firstIdx;
    newOrder = [...without.slice(0, at), H, ...without.slice(at)];
    if (opts.asLoose) {
      if (curGroup != null) {
        overrideGroup = null;
        groupChange = { holdingId: H, group: null };
      }
    } else if (targetGroup !== curGroup) {
      overrideGroup = targetGroup;
      groupChange = { holdingId: H, group: targetGroup };
    }
  } else {
    // Dropped onto a holding T → arrayMove H to T's slot (wallet-proven splice:
    // remove from its index, insert at T's ORIGINAL index → correct up AND down)
    // and inherit T's group (loose if T is loose).
    const T = overId;
    const tGroup = baseGroup.get(T) ?? null;
    const fromIdx = baseOrder.indexOf(H);
    const toIdx = baseOrder.indexOf(T);
    if (fromIdx === -1 || toIdx === -1 || fromIdx === toIdx) return null;
    const arr = [...baseOrder];
    arr.splice(fromIdx, 1);
    arr.splice(toIdx, 0, H);
    newOrder = arr;
    if (tGroup !== curGroup) {
      overrideGroup = tGroup;
      groupChange = { holdingId: H, group: tGroup };
    }
  }

  const finalOrder = recluster(newOrder, groupOf);
  if (finalOrder.join() === baseOrder.join() && !groupChange) return null;
  return groupChange
    ? { orderedIds: finalOrder, groupChange }
    : { orderedIds: finalOrder };
}

/**
 * Resolve a HOLDING drop from GEOMETRY (the section's drag model). The section
 * decides, from the dragged row's drop centre:
 *   - `insertIndex` — its rank among the OTHER holdings (rows whose centre is
 *     above it), i.e. where it lands in the flat order.
 *   - `targetGroup` — the group whose VISIBLE-CHILDREN span contains the centre
 *     (header excluded), or null when the centre is on a header / in a gap / among
 *     loose rows. "Inside the group's rows → grouped; on the header or below the
 *     last child → loose" — so a row can be placed loose above/below ANY group and
 *     a 2-item group's members still reorder (drop onto a child), without the old
 *     explicit zones.
 * Pure so the recluster maths is unit-tested; geometry stays in the React island.
 */
export function resolveHoldingDrop(
  holdings: HoldingDto[],
  activeId: string,
  insertIndex: number,
  targetGroup: string | null,
): DragResult | null {
  const baseOrder = flattenEntries(buildInvestmentEntries(holdings));
  const baseGroup = new Map<string, string | null>();
  for (const h of holdings) baseGroup.set(h.id, h.group ?? null);
  if (!baseGroup.has(activeId)) return null;
  const curGroup = baseGroup.get(activeId) ?? null;

  const without = baseOrder.filter((id) => id !== activeId);
  const idx = Math.max(0, Math.min(insertIndex, without.length));
  const arranged = [...without.slice(0, idx), activeId, ...without.slice(idx)];
  const groupOf = (id: string): string | null =>
    id === activeId ? targetGroup : (baseGroup.get(id) ?? null);
  const finalOrder = recluster(arranged, groupOf);
  const groupChange =
    targetGroup !== curGroup
      ? { holdingId: activeId, group: targetGroup }
      : undefined;
  if (finalOrder.join() === baseOrder.join() && !groupChange) return null;
  return groupChange
    ? { orderedIds: finalOrder, groupChange }
    : { orderedIds: finalOrder };
}

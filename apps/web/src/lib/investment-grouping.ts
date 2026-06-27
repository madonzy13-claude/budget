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

export const entryKeyOf = (e: InvestmentEntry): string =>
  e.kind === "group" ? `group:${e.name}` : `loose:${e.holding.id}`;

/**
 * Keep a group visible during a drag even after its last member is pulled out.
 * `snapshot` is the entry order captured at drag-start; any snapshot GROUP that's
 * no longer in `entries` is re-inserted as an EMPTY block right after its nearest
 * preceding snapshot entry that's still present (so it stays put and droppable).
 * Pure so the placement maths is unit-tested; the section calls it while dragging.
 */
export function withPersistentGroups(
  entries: InvestmentEntry[],
  snapshot: { key: string; group?: string }[],
): InvestmentEntry[] {
  const present = new Set(entries.map(entryKeyOf));
  const missing = snapshot.filter(
    (s) => s.group !== undefined && !present.has(s.key),
  );
  if (missing.length === 0) return entries;
  const result = [...entries];
  for (const snap of missing) {
    const snapIdx = snapshot.findIndex((s) => s.key === snap.key);
    let insertAt = 0;
    for (let i = snapIdx - 1; i >= 0; i--) {
      const idx = result.findIndex((e) => entryKeyOf(e) === snapshot[i].key);
      if (idx >= 0) {
        insertAt = idx + 1;
        break;
      }
    }
    result.splice(insertAt, 0, {
      kind: "group",
      name: snap.group!,
      holdings: [],
    });
  }
  return result;
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
 * Aggregate a group's children: total value (budget cents) + blended cost-basis
 * P/L% = (Σ value − Σ cost) / Σ cost, where cost_i is derived from each child's
 * own value and P/L% (value / (1 + pl/100)). Children with no P/L (cash, no
 * basis) contribute to value but are excluded from the P/L maths.
 */
export function groupAggregate(holdings: HoldingDto[]): GroupAggregate {
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
  const plPct = anyBasis && sumC > 0 ? ((sumV - sumC) / sumC) * 100 : null;
  const plCents = anyBasis && sumC > 0 ? sumV - sumC : null;
  return { valueBudgetCents, plPct, plCents };
}

export interface DragResult {
  orderedIds: string[];
  /** Present only when the drag changed a holding's group. */
  groupChange?: { holdingId: string; group: string | null };
}

const GROUP_PREFIX = "group:";
/**
 * Droppable id for the "remove from group" zone (UAT #8). Dropping a grouped
 * holding here makes it loose — the only way to ungroup when there are no loose
 * rows to drop onto (e.g. a single group holding every item).
 */
export const UNGROUPED_DROP_ID = "ungrouped-zone";
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
 * Resolve a drag-end into a new flat order (+ optional group change). Returns
 * null for a no-op (drop on self, drop on own group header, or unresolvable
 * target). Cross-section rejection is handled by the caller before this runs.
 */
export function resolveDragEnd(
  holdings: HoldingDto[],
  activeId: string,
  overId: string,
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

    let anchorId: string | undefined;
    if (isGroupSortId(overId)) {
      const overName = groupNameFromSortId(overId);
      anchorId = baseOrder.find((id) => baseGroup.get(id) === overName);
    } else {
      anchorId = overId;
    }
    if (!anchorId) return null;
    let at = rest.indexOf(anchorId);
    if (at === -1) at = rest.length;
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

  // ── Dropped on the ungroup zone → make the holding loose, at the end ────────
  if (overId === UNGROUPED_DROP_ID) {
    if (curGroup == null) return null; // already loose — nothing to do
    const without = baseOrder.filter((id) => id !== H);
    const reclustered = recluster([...without, H], (id) =>
      id === H ? null : (baseGroup.get(id) ?? null),
    );
    return {
      orderedIds: reclustered,
      groupChange: { holdingId: H, group: null },
    };
  }

  if (isGroupSortId(overId)) {
    // Dropped onto a group header → join that group at the TOP of its block.
    const targetGroup = groupNameFromSortId(overId);
    const without = baseOrder.filter((id) => id !== H);
    const firstIdx = without.findIndex(
      (id) => baseGroup.get(id) === targetGroup,
    );
    const at = firstIdx === -1 ? without.length : firstIdx;
    newOrder = [...without.slice(0, at), H, ...without.slice(at)];
    if (targetGroup !== curGroup) {
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

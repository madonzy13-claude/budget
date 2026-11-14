/**
 * plan-ring.ts — the outer ring of the planned-spend pie (260803 request).
 *
 * Two arcs summed across every category in view: what the plan calls needs
 * and what it calls wants.
 *
 * A category is usually PART needs and part wants — Food & Home might be 300
 * needs and 50 wants — so it feeds two arcs at once. That is why the ring is
 * budget-wide totals and deliberately does not line up with the slices beneath
 * it (user decision): making it line up would mean reordering the pie and
 * forcing every mixed category onto one side.
 */
export type PlanRingKey = "needs" | "wants";

export interface PlanRingArc {
  key: PlanRingKey;
  /** Cents. */
  value: number;
}

export interface PlanRingRow {
  category_id: string;
  name?: string;
  planned_avg_cents: string;
  /** Absent on a payload cached before the field existed → read as all wants. */
  needs_avg_cents?: string;
}

/** @param rows the categories in view. */
export function planRing(rows: readonly PlanRingRow[]): PlanRingArc[] {
  let needs = 0;
  let wants = 0;

  for (const r of rows) {
    const planned = Number(r.planned_avg_cents) || 0;
    if (planned <= 0) continue;
    // Clamped: a stale limit reporting needs above its plan would otherwise
    // drive wants negative and open a reversed arc.
    const n = Math.min(Number(r.needs_avg_cents) || 0, planned);
    needs += n;
    wants += planned - n;
  }

  return (
    [
      { key: "needs", value: needs },
      { key: "wants", value: wants },
    ] as PlanRingArc[]
  ).filter((a) => a.value > 0);
}

/**
 * The pie's own slices: every category with something planned, biggest first.
 */
export function planSlices<T extends PlanRingRow>(rows: readonly T[]): T[] {
  return rows
    .filter((r) => (Number(r.planned_avg_cents) || 0) > 0)
    .sort((a, b) => Number(b.planned_avg_cents) - Number(a.planned_avg_cents));
}

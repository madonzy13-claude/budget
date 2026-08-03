/**
 * plan-ring.ts — the outer ring of the planned-spend pie (260803 request).
 *
 * Three arcs summed across every category in view: what the plan calls needs,
 * what it calls wants, and what goes to investing.
 *
 * A category is usually PART needs and part wants — Food & Home might be 300
 * needs and 50 wants — so it feeds two arcs at once. That is why the ring is
 * budget-wide totals and deliberately does not line up with the slices beneath
 * it (user decision): making it line up would mean reordering the pie and
 * forcing every mixed category onto one side.
 *
 * Investing is neither. Its plan carries no cushion, so folding it into "wants"
 * would overstate discretionary spending by the whole investment budget.
 */
export type PlanRingKey = "needs" | "wants" | "investments";

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

/**
 * @param rows            the categories in view — they set needs and wants.
 * @param isInvestment    which category id is the investment one.
 * @param investmentRows  where the investing arc is summed from. The picker
 *   narrows the SLICES; the arc is budget-wide, so filtering investments out of
 *   the pie must not erase the plan's investing share (user, 260803). Defaults
 *   to `rows`, which is the same thing when nothing is filtered.
 */
export function planRing(
  rows: readonly PlanRingRow[],
  isInvestment: (categoryId: string) => boolean,
  investmentRows: readonly PlanRingRow[] = rows,
): PlanRingArc[] {
  let needs = 0;
  let wants = 0;
  let investments = 0;

  for (const r of rows) {
    const planned = Number(r.planned_avg_cents) || 0;
    if (planned <= 0) continue;
    // Counted from investmentRows below — skip here or a picked investment
    // category would land in the arc twice.
    if (isInvestment(r.category_id)) continue;
    // Clamped: a stale limit reporting needs above its plan would otherwise
    // drive wants negative and open a reversed arc.
    const n = Math.min(Number(r.needs_avg_cents) || 0, planned);
    needs += n;
    wants += planned - n;
  }

  for (const r of investmentRows) {
    if (!isInvestment(r.category_id)) continue;
    investments += Math.max(0, Number(r.planned_avg_cents) || 0);
  }

  return (
    [
      { key: "needs", value: needs },
      { key: "wants", value: wants },
      { key: "investments", value: investments },
    ] as PlanRingArc[]
  ).filter((a) => a.value > 0);
}

/**
 * The pie's own slices: every category with something planned, biggest first.
 * The investment category is one of them AND has its own arc outside — the
 * member reads the two together (user, 260803).
 */
export function planSlices<T extends PlanRingRow>(rows: readonly T[]): T[] {
  return rows
    .filter((r) => (Number(r.planned_avg_cents) || 0) > 0)
    .sort((a, b) => Number(b.planned_avg_cents) - Number(a.planned_avg_cents));
}

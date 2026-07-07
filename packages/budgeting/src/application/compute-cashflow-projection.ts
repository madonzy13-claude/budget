/**
 * compute-cashflow-projection.ts — impure loader for the Overview projection
 * timeline. Reads wallets / incomes / recurring rules / category budgets / month
 * spend via raw SQL over withTenantTx, pulls per-category reserve from the injected
 * reservePositions seam, FX-converts every amount to the budget currency, enumerates
 * dated income + bill events across the window, then hands a fully-materialised
 * CashflowSimInput to the pure simulateCashflow. Mirrors the raw-SQL style of
 * compute-upcoming-by-category.ts and recompute-income-under-planned-task.ts.
 */
import { Temporal } from "temporal-polyfill";
import { nextOccurrence, type CadenceSpec } from "../domain/cadence";

/** Backstop so a malformed cadence can never spin the projection loop forever. */
export const MAX_PROJECTION_STEPS = 400;

/**
 * Occurrence ISO dates strictly after `afterExclusive`, up to and including `end`,
 * following `spec` from `seed`. `seed` may be in the past (a recurring rule's
 * nextDueDate) — the loop advances until it clears `afterExclusive`.
 */
export function enumerateOccurrences(
  spec: CadenceSpec,
  opts: {
    seed: Temporal.PlainDate;
    afterExclusive: Temporal.PlainDate;
    end: Temporal.PlainDate;
  },
): string[] {
  const out: string[] = [];
  let cur = opts.seed;
  let steps = 0;
  while (
    Temporal.PlainDate.compare(cur, opts.end) <= 0 &&
    steps++ < MAX_PROJECTION_STEPS
  ) {
    if (Temporal.PlainDate.compare(cur, opts.afterExclusive) > 0) {
      out.push(cur.toString());
    }
    cur = nextOccurrence(spec, cur);
  }
  return out;
}

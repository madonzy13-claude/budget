/**
 * reserve-engine.ts — Pure-domain reserve engine (the keystone).
 *
 * Replaces the greedy `reserve-allocator.ts`. Folds a chronological event stream
 * into per-category running reserve `R` (available) and `U` (used), derives
 * per-(category, month) `{overage, used, overspent, left}`, and computes globals
 * `internal` (Σ R over active categories) and `surplus` (userDefined − internal).
 *
 * Pure data → data: no IO, no Drizzle, no Temporal. The orchestrator (05-12)
 * assembles validated events (it owns tenant/RLS) and replays this on read.
 *
 * Model (validated cell-by-cell against the 29-row golden fixture in
 * 05-REWRITE-SPEC.md):
 *
 *   per category: R = available reserve, U = used reserve, capacity = R + U
 *   effLimit  = cushionOn ? cushionLimit : normalLimit
 *   overage   = max(spent − effLimit, 0)
 *   left      = max(effLimit − spent, 0)
 *   overspent = overage − U                       // invariant: U + overspent = overage
 *
 *   op1 overage +Δ : draw = min(Δ, R); R -= draw; U += draw
 *   op2 overage −Δ : cut overspent first; remainder U → R
 *   op3 set R to X : d = X − R; if d≥0 cover overspent first (→U), rest → R; else R += d
 *   op4 accrual    : reserve += left   (= op3 with X = R + left)
 *
 *   internal = Σ R (active cats); surplus = userDefined − internal
 */

/** One ordered event in the budget's reserve history. Amounts are integer cents. */
export type ReserveEngineEvent =
  | {
      type: "setLimit";
      categoryId: string;
      month: string; // 'YYYY-MM' — SCD-2 effective limit for this month onward
      normalCents: bigint;
      cushionCents: bigint;
    }
  | {
      type: "spendDelta";
      categoryId: string;
      month: string;
      deltaCents: bigint; // +add txn / −remove txn / net edit
    }
  | { type: "adjust"; categoryId: string; deltaCents: bigint } // signed reserve adjustment (op3 via delta)
  | { type: "accrual"; categoryId: string; month: string } // month-close: reserve += left (op4)
  | { type: "cushion"; month: string; on: boolean } // budget-level cushion mode change
  | { type: "exclude"; categoryId: string; excluded: boolean } // reserve_excluded toggle
  | { type: "archive"; categoryId: string; mode: "all" | "current_future" } // category deletion (decision J)
  | { type: "setUserDefined"; cents: bigint }; // Σ RESERVE-wallet balances (surplus input only)

export interface CategoryReserveState {
  /** R — available reserve carried forward chronologically. */
  reserveCents: bigint;
  /** U — reserve already consumed by overspend. capacity = R + U is implicit. */
  usedCents: bigint;
}

/** Per-(category, month) display row. */
export interface CategoryMonthCell {
  categoryId: string;
  month: string; // 'YYYY-MM'
  overageCents: bigint; // max(spent − effLimit, 0)
  leftCents: bigint; // max(effLimit − spent, 0)
  usedCents: bigint; // reserve drawn for THIS month
  overspentCents: bigint; // overage − used (per-month)
}

export interface ReserveEngineResult {
  /** Final running R/U per category after replaying ALL events. */
  states: Map<string, CategoryReserveState>;
  /** Per-(category, month) cells for display. */
  cells: CategoryMonthCell[];
  /** Σ R over active (non-excluded, non-archived) categories. 0 when disabled. */
  internalCents: bigint;
  /** Last setUserDefined value (default 0n). */
  userDefinedCents: bigint;
  /** userDefined − internal. */
  surplusCents: bigint;
}

export interface ReserveEngineInput {
  events: ReserveEngineEvent[];
  /** 'YYYY-MM' of the open month. Accrual applies only to CLOSED months (< openMonth). */
  openMonth: string;
  /** Default true. false → decision-K transform (used→overspent, internal hidden). */
  reservesEnabled?: boolean;
}

// STUB (RED). Real implementation lands in the GREEN task.
export function reserveEngine(_input: ReserveEngineInput): ReserveEngineResult {
  return {
    states: new Map(),
    cells: [],
    internalCents: 0n,
    userDefinedCents: 0n,
    surplusCents: 0n,
  };
}

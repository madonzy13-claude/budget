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
 *
 * Categories are INDEPENDENT — no cross-category spill (the old greedy allocator's
 * refill/deduct/share logic is gone).
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

const max0 = (v: bigint): bigint => (v > 0n ? v : 0n);
const min = (a: bigint, b: bigint): bigint => (a < b ? a : b);

/** Mutable per-category accumulator used during the fold. */
interface Cat {
  R: bigint; // available reserve
  U: bigint; // used reserve
  excluded: boolean;
  archived: "all" | "current_future" | null;
  normal: Map<string, bigint>; // month → normal limit
  cushion: Map<string, bigint>; // month → cushion limit
  spent: Map<string, bigint>; // month → Σ txns
  overageApplied: Map<string, bigint>; // month → overage already folded into R/U
}

function newCat(): Cat {
  return {
    R: 0n,
    U: 0n,
    excluded: false,
    archived: null,
    normal: new Map(),
    cushion: new Map(),
    spent: new Map(),
    overageApplied: new Map(),
  };
}

export function reserveEngine(input: ReserveEngineInput): ReserveEngineResult {
  const { events } = input;
  const reservesEnabled = input.reservesEnabled ?? true;

  const cats = new Map<string, Cat>();
  const cushionOn = new Map<string, boolean>(); // month → cushion mode (global)
  let userDefined = 0n;

  const getCat = (id: string): Cat => {
    let c = cats.get(id);
    if (!c) {
      c = newCat();
      cats.set(id, c);
    }
    return c;
  };

  const effLimit = (c: Cat, month: string): bigint =>
    ((cushionOn.get(month) ?? false)
      ? c.cushion.get(month)
      : c.normal.get(month)) ?? 0n;

  const overageOf = (c: Cat, month: string): bigint =>
    max0((c.spent.get(month) ?? 0n) - effLimit(c, month));

  /** Σ of overage already folded across all of a category's months. */
  const totalOverageApplied = (c: Cat): bigint => {
    let s = 0n;
    for (const v of c.overageApplied.values()) s += v;
    return s;
  };

  /** Outstanding overspent for a category = Σ overage − U. */
  const outstandingOverspent = (c: Cat): bigint => totalOverageApplied(c) - c.U;

  // op3 — set reserve via a signed delta `d = X − R`.
  const applyAdjustDelta = (c: Cat, d: bigint): void => {
    if (d >= 0n) {
      const cover = min(d, outstandingOverspent(c)); // cover outstanding overspent first
      c.U += cover;
      c.R += d - cover;
    } else {
      c.R += d; // lowering just reduces available reserve
    }
  };

  // op1 / op2 — fold a month's overage CHANGE into running R/U.
  const reapplyMonth = (c: Cat, month: string): void => {
    const newOver = overageOf(c, month);
    const oldOver = c.overageApplied.get(month) ?? 0n;
    const delta = newOver - oldOver;
    if (delta > 0n) {
      // op1: draw available reserve to cover the increase.
      const draw = min(delta, c.R);
      c.R -= draw;
      c.U += draw;
    } else if (delta < 0n) {
      // op2: cut overspent first, return the remainder used → available.
      const dec = -delta;
      const fromOverspent = min(dec, outstandingOverspent(c));
      const remaining = dec - fromOverspent;
      c.U -= remaining;
      c.R += remaining;
    }
    c.overageApplied.set(month, newOver);
  };

  for (const ev of events) {
    switch (ev.type) {
      case "setLimit": {
        const c = getCat(ev.categoryId);
        c.normal.set(ev.month, ev.normalCents);
        c.cushion.set(ev.month, ev.cushionCents);
        reapplyMonth(c, ev.month);
        break;
      }
      case "spendDelta": {
        const c = getCat(ev.categoryId);
        c.spent.set(ev.month, (c.spent.get(ev.month) ?? 0n) + ev.deltaCents);
        reapplyMonth(c, ev.month);
        break;
      }
      case "adjust": {
        applyAdjustDelta(getCat(ev.categoryId), ev.deltaCents);
        break;
      }
      case "accrual": {
        // op4 = op3 with X = R + left → delta d = left.
        const c = getCat(ev.categoryId);
        const left = max0(
          effLimit(c, ev.month) - (c.spent.get(ev.month) ?? 0n),
        );
        applyAdjustDelta(c, left);
        break;
      }
      case "cushion": {
        cushionOn.set(ev.month, ev.on);
        // The threshold flipped for every category that has a limit this month.
        for (const c of cats.values()) {
          if (c.normal.has(ev.month) || c.cushion.has(ev.month)) {
            reapplyMonth(c, ev.month);
          }
        }
        break;
      }
      case "exclude": {
        getCat(ev.categoryId).excluded = ev.excluded;
        break;
      }
      case "archive": {
        getCat(ev.categoryId).archived = ev.mode;
        break;
      }
      case "setUserDefined": {
        userDefined = ev.cents;
        break;
      }
    }
  }

  // ── Build output ───────────────────────────────────────────────────────────
  const states = new Map<string, CategoryReserveState>();
  const cells: CategoryMonthCell[] = [];
  let internal = 0n;

  for (const [id, c] of cats) {
    const active = !c.excluded && c.archived === null;

    // Project the single running U across the category's months OLDEST-FIRST
    // (decision I — retroactive coverage). Σ used across months = U.
    const months = new Set<string>([
      ...c.overageApplied.keys(),
      ...c.spent.keys(),
      ...c.normal.keys(),
      ...c.cushion.keys(),
    ]);
    let remainingU = c.U;
    for (const month of [...months].sort()) {
      const overage = overageOf(c, month);
      const left = max0(effLimit(c, month) - (c.spent.get(month) ?? 0n));
      let used = min(overage, remainingU);
      remainingU -= used;
      let overspent = overage - used;
      if (!reservesEnabled) {
        // Decision K: reserve coverage hidden; everything reads as overspent.
        used = 0n;
        overspent = overage;
      }
      cells.push({
        categoryId: id,
        month,
        overageCents: overage,
        leftCents: left,
        usedCents: used,
        overspentCents: overspent,
      });
    }

    states.set(id, { reserveCents: c.R, usedCents: c.U });
    if (reservesEnabled && active) internal += c.R;
  }

  const internalOut = reservesEnabled ? internal : 0n;
  return {
    states,
    cells,
    internalCents: internalOut,
    userDefinedCents: userDefined,
    surplusCents: userDefined - internalOut,
  };
}

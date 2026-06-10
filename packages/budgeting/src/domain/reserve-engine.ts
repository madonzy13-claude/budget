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
 *   op1 overage +Δ : draw = min(Δ, R); R -= draw; U += draw            (transaction)
 *   op2 overage −Δ : cut overspent first; remainder U → R               (transaction)
 *   op3 set R to X : d = X − R, as-of the month the adjust was made; if d≥0 cover
 *                    ONLY that month's overspent (→U), rest → R; else R += d. A
 *                    closed month's overspent is never retro-covered by an adjust —
 *                    only transaction edits (op1/op2) change a past month's used.
 *   op4 accrual    : R += left  (month-close carry; left⇒no overage, never covers)
 *
 *   Events fold MONTH-ASCENDING (the orchestrator's order), so each month draws ONLY
 *   from the reserve available by its own end (carried-in R + reserve added IN that
 *   month). A month is CAPPED at that — a transaction can never pull in reserve added
 *   in a LATER month, and a reserve adjust only ever covers its own month. The free
 *   reserve at a month's close is snapshotted per cell as `endReserveCents` (the
 *   "available" side of the used/available display = usedCents + endReserveCents).
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
  | { type: "adjust"; categoryId: string; deltaCents: bigint; month: string } // signed reserve adjustment (op3 via delta); `month` = the open month WHEN made (asOf)
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
  /** Free reserve balance (R) at the END of this month — the reserve that was
   *  available but unused by month's end. "Reserve available to this month" =
   *  usedCents + endReserveCents (what it used + what it left free). For the open
   *  month this is the current free reserve. */
  endReserveCents: bigint;
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
  used: Map<string, bigint>; // month → used reserve (attributed where each draw/cover occurred)
  excluded: boolean;
  archived: "all" | "current_future" | null;
  normal: Map<string, bigint>; // month → normal limit
  cushion: Map<string, bigint>; // month → cushion limit
  spent: Map<string, bigint>; // month → Σ txns
  overageApplied: Map<string, bigint>; // month → overage already folded into R/used
  endR: Map<string, bigint>; // month → R balance at that month's END (snapshot during the fold)
  accrued: Map<string, bigint>; // month → reserve this month accrued at its OWN close (op4 left)
}

function newCat(): Cat {
  return {
    R: 0n,
    used: new Map(),
    excluded: false,
    archived: null,
    normal: new Map(),
    cushion: new Map(),
    spent: new Map(),
    overageApplied: new Map(),
    endR: new Map(),
    accrued: new Map(),
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

  const usedOf = (c: Cat, month: string): bigint => c.used.get(month) ?? 0n;

  /**
   * Outstanding overspent for ONE month = its overage minus the reserve already
   * attributed to it. Used reserve is tracked PER MONTH (by the month the draw or
   * cover happened), so each month's overspent is exact and independent. An adjust
   * (op3) covers ONLY its own month; a transaction (op1) draws the reserve available
   * by that month's end (month-order fold) and is capped at it. Coverage attributed
   * to one month never migrates to another.
   */
  const monthOverspent = (c: Cat, month: string): bigint =>
    max0(overageOf(c, month) - usedOf(c, month));

  // op3 — set reserve via a signed delta `d = X − R`, as-of `month` (the open
  // month WHEN the adjust was made). Raising covers ONLY that month's outstanding
  // overspent (added to THAT month's used); the rest becomes available R. A closed
  // month's overspent is never retro-covered. Lowering just reduces available R.
  const applyAdjustDelta = (c: Cat, d: bigint, month: string): void => {
    if (d >= 0n) {
      const cover = min(d, monthOverspent(c, month));
      c.used.set(month, usedOf(c, month) + cover);
      c.R += d - cover;
    } else {
      // Reserve can't go below zero — a reduction larger than the available
      // buffer floors at 0. Without this, op1's min(Δ, R) draws a NEGATIVE
      // amount on the next overspend and a month's used goes negative (the
      // reported "-30 / 0").
      c.R = max0(c.R + d);
    }
  };

  // op1 / op2 — fold a month's overage CHANGE into running R + THAT month's used.
  const reapplyMonth = (c: Cat, month: string): void => {
    const newOver = overageOf(c, month);
    const oldOver = c.overageApplied.get(month) ?? 0n;
    const delta = newOver - oldOver;
    if (delta > 0n) {
      // op1: draw available reserve to cover this month's increase. max0 guards
      // against a transiently-negative R ever yielding a negative draw.
      const draw = min(delta, max0(c.R));
      c.R -= draw;
      c.used.set(month, usedOf(c, month) + draw);
    } else if (delta < 0n) {
      // op2: this month's overage shrank — cut its OWN overspent first, then
      // return its now-surplus coverage (used → available).
      const dec = -delta;
      const usedHere = usedOf(c, month);
      const overspentHere = max0(oldOver - usedHere);
      const remaining = dec - min(dec, overspentHere);
      c.used.set(month, usedHere - remaining);
      c.R += remaining;
    }
    c.overageApplied.set(month, newOver);
  };

  // Track R at each month's END. Events are folded month-ASCENDING, so whenever the
  // month advances we record every category's current R as the balance at the close
  // of the month we are leaving (used for the "used / available" display, where
  // available = used + free reserve at that month's end).
  let foldMonth: string | null = null;
  const snapshotFoldMonth = (): void => {
    if (foldMonth === null) return;
    for (const c of cats.values()) c.endR.set(foldMonth, c.R);
  };

  for (const ev of events) {
    const evMonth =
      "month" in ev ? (ev as { month?: string }).month : undefined;
    if (evMonth !== undefined && evMonth > (foldMonth ?? "")) {
      snapshotFoldMonth(); // close out the previous month before this one's events
      foldMonth = evMonth;
    }
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
        applyAdjustDelta(getCat(ev.categoryId), ev.deltaCents, ev.month);
        break;
      }
      case "accrual": {
        // op4 — month-close: carry the month's leftover budget into available
        // reserve. `left` only exists when there is NO overage, so accrual never
        // covers overspent; it is a pure R += left.
        const c = getCat(ev.categoryId);
        const left = max0(
          effLimit(c, ev.month) - (c.spent.get(ev.month) ?? 0n),
        );
        // Track this month's OWN accrual so the "available" display can exclude it
        // (a closed month's leftover is available to the NEXT month, not itself).
        c.accrued.set(ev.month, (c.accrued.get(ev.month) ?? 0n) + left);
        c.R += left;
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
  snapshotFoldMonth(); // R at the end of the LAST (open) month = current free reserve

  // ── Build output ───────────────────────────────────────────────────────────
  const states = new Map<string, CategoryReserveState>();
  const cells: CategoryMonthCell[] = [];
  let internal = 0n;

  for (const [id, c] of cats) {
    const active = !c.excluded && c.archived === null;

    // Used reserve is tracked PER MONTH during the fold (by the month each draw or
    // cover happened), so each cell reads its own month's used DIRECTLY. A month
    // draws ONLY from the reserve available by its own end (month-order), so a
    // same-month adjust covers only its own month and a transaction is capped at the
    // reserve that existed that month — never reserve added in a LATER month.
    // endReserveCents (the R balance at this month's close, snapshotted during the
    // fold) is the free reserve that was available but unused by month-end.
    // states.usedCents is the Σ over months.
    const months = new Set<string>([
      ...c.overageApplied.keys(),
      ...c.used.keys(),
      ...c.spent.keys(),
      ...c.normal.keys(),
      ...c.cushion.keys(),
    ]);

    // Per-month derived values (forward).
    const derived = [...months].sort().map((month) => {
      const overage = overageOf(c, month);
      const left = max0(effLimit(c, month) - (c.spent.get(month) ?? 0n));
      const realUsed = min(usedOf(c, month), overage);
      const accruedHere = c.accrued.get(month) ?? 0n;
      // Forward free reserve at this month's close, excluding its own accrual
      // (that leftover belongs to the NEXT month).
      const forwardExcl = (c.endR.get(month) ?? c.R) - accruedHere;
      return { month, overage, left, realUsed, accruedHere, forwardExcl };
    });

    // Backward free reserve still claimable by month m, anchored at the FINAL
    // reserve: backwardExcl[m] = R_final + Σ_{k>m} used[k] − Σ_{k≥m} accrued[k].
    // A LATER reserve REMOVAL lowers R_final → backwardExcl binds → a past
    // month's "available" shrinks (you can't spend reserve that is gone). A
    // LATER reserve ADDITION can't leak back because forwardExcl (what was
    // really there at the close) binds instead. endReserve = max(0, min(both)).
    const endReserveByMonth = new Map<string, bigint>();
    let carry = 0n; // Σ over months strictly after the cursor of (used − accrued)
    for (let i = derived.length - 1; i >= 0; i--) {
      const d = derived[i];
      const backwardExcl = c.R + carry - d.accruedHere;
      endReserveByMonth.set(d.month, max0(min(d.forwardExcl, backwardExcl)));
      carry += d.realUsed - d.accruedHere;
    }

    let totalUsed = 0n;
    for (const d of derived) {
      // states.usedCents is the UNDERLYING used (preserved across a disable — the
      // disable only transforms the displayed cells, not the running R/U).
      totalUsed += d.realUsed;
      let used = d.realUsed;
      let overspent = d.overage - used;
      if (!reservesEnabled) {
        // Decision K: reserve coverage hidden; everything reads as overspent.
        used = 0n;
        overspent = d.overage;
      }
      cells.push({
        categoryId: id,
        month: d.month,
        overageCents: d.overage,
        leftCents: d.left,
        usedCents: used,
        overspentCents: overspent,
        endReserveCents: endReserveByMonth.get(d.month)!,
      });
    }

    states.set(id, { reserveCents: c.R, usedCents: totalUsed });
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

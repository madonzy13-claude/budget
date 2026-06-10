/**
 * get-reserve-positions.ts — Replay orchestrator (the reserve seam).
 *
 * Phase 05 reserve rewrite (decisions A–K, 05-REWRITE-SPEC.md). The OLD
 * accrued/funded/drawn-off-the-VIEW computation is GONE. This file now does
 * exactly one job: assemble the budget's ordered reserve events and fold them
 * through the pure `reserve-engine`.
 *
 *   loader.load(tenant, budget, openMonth)  → ReserveEventInputs (05-11)
 *        │  map (chronological)             → ReserveEngineEvent[]   (05-09)
 *        ▼
 *   reserveEngine({ events, openMonth, reservesEnabled })
 *        │  states (R/U) + per-(cat,month) cells + internal/userDefined/surplus
 *        ▼
 *   ReservePositionsResult { positions, internalCents, userDefinedCents, surplusCents, direction }
 *
 * Event ordering (deterministic — pinned by the golden reproduction test):
 *   1. Walk months ASCENDING. For each month, in order: setLimit, cushion, adjust,
 *      spendDelta, accrual. A month therefore draws ONLY from the reserve available
 *      by its own end (carried-in R + reserve added IN that month) and is CAPPED at
 *      it — a transaction can never pull in reserve added in a LATER month. The
 *      CURRENT (open) month sees all currently-available reserve; a closed month is
 *      bounded by its month-end balance. (Adjust is folded before spend so op1's
 *      capacity-bounded draw consumes new reserve first — avoids op3 over-cover with
 *      interleaved signed adjusts. Accrual is CLOSED months only, decision G.)
 *   2. exclude / archive — from categoryFlags (drop a category out of internal).
 *   3. setUserDefined — Σ RESERVE-wallet balances (surplus input only).
 *
 * Pure: no Drizzle, no Temporal here — the loader owns IO + the TZ-correct open
 * month. Money stays in cents (bigint); display wrapping is the route's job (05-14).
 */
import { ok, err, type Result } from "@budget/shared-kernel";
import type { ReserveEventLoaderRepo } from "../ports/reserve-event-loader-repo";
import type { ReserveEventInputs } from "../ports/reserve-event-loader-repo";
import {
  reserveEngine,
  type ReserveEngineEvent,
} from "../domain/reserve-engine";

/** Per-category projection of the engine's final running R/U + per-month cells. */
export interface ReservePosition {
  categoryId: string;
  /** R — available reserve shown to the user (carried forward chronologically). */
  reserveCents: bigint;
  /** U — reserve consumed by overspend (cumulative across all months). */
  usedCents: bigint;
  /** Σ over this category's months of per-month overspent (= Σ overage − U). */
  overspentCents: bigint;
  /** reserve_excluded flag NOW — the grid shows a dash for "available" when true. */
  reserveExcluded: boolean;
  /** Per-(category, month) cells for the spendings grid. 'YYYY-MM' → cell. */
  byMonth: Map<
    string,
    {
      usedCents: bigint;
      overspentCents: bigint;
      overageCents: bigint;
      leftCents: bigint;
      /** Free reserve at this month's end. "Available to this month" = used + this. */
      endReserveCents: bigint;
    }
  >;
}

export interface ReservePositionsResult {
  positions: Map<string, ReservePosition>;
  /** The open ('current') month 'YYYY-MM' the fold resolved to — lets callers
   *  pick each position's current-month cell (e.g. TOTAL USED this month). */
  openMonth: string;
  /** Σ R over active (non-excluded, non-archived) categories. 0 when disabled. */
  internalCents: bigint;
  /** Σ RESERVE-wallet balances. */
  userDefinedCents: bigint;
  /** userDefined − internal. */
  surplusCents: bigint;
  /** surplus<0 → TOPUP (internal>wallet), surplus>0 → WITHDRAW, 0 → NONE.
   *  Matches the recompute-reserve-topup-task sign convention. */
  direction: "TOPUP" | "WITHDRAW" | "NONE";
}

export interface GetReservePositionsDeps {
  /** 05-11 loader — owns spend/limit/cushion/adjustment/flag/wallet reads + RLS. */
  eventLoader: ReserveEventLoaderRepo;
  /** Open-month boundary fallback (only used to validate an explicit override). */
  now?: () => Date;
}

export interface GetReservePositionsInput {
  tenantId: string;
  budgetId: string;
  /** Override the open month 'YYYY-MM'. Defaults to now() in the budget tz
   *  (resolved by the loader). */
  month?: string;
}

/** '2026-06' → comparable for ascending sort (lexical works for 'YYYY-MM'). */
function monthsAscending(inputs: ReserveEventInputs): string[] {
  const set = new Set<string>();
  for (const byMonth of inputs.spendByCategoryByMonth.values()) {
    for (const m of byMonth.keys()) set.add(m);
  }
  for (const m of inputs.limitsByMonth.keys()) set.add(m);
  for (const seg of inputs.cushionHistory) set.add(seg.fromMonth);
  // Adjust months: a reserve set in month M must be replayed in M's slot so a
  // LATER month's overspend can draw it (op1). Without this, a reserve set in a
  // month with no spend/limit would be dropped from the timeline.
  for (const deltas of inputs.adjustmentsByCategory.values())
    for (const a of deltas) set.add(a.month);
  set.add(inputs.openMonth);
  return [...set].sort();
}

/**
 * Map the loader's raw inputs to a chronological ReserveEngineEvent[].
 * Exported for the golden reproduction test (assert the mapping, not just IO).
 */
export function mapInputsToEvents(
  inputs: ReserveEventInputs,
): ReserveEngineEvent[] {
  const events: ReserveEngineEvent[] = [];
  const months = monthsAscending(inputs);

  // Cushion segments → quick "does a segment start at month M?" lookup.
  const cushionAt = new Map<string, boolean>();
  for (const seg of inputs.cushionHistory) cushionAt.set(seg.fromMonth, seg.on);

  // Adjusts grouped by the month they were made in (asOf), preserving each
  // category's stored (occurred-asc) order.
  const adjustsByMonth = new Map<
    string,
    Array<{ categoryId: string; deltaCents: bigint }>
  >();
  for (const [categoryId, deltas] of inputs.adjustmentsByCategory) {
    for (const { deltaCents, month } of deltas) {
      const arr = adjustsByMonth.get(month);
      if (arr) arr.push({ categoryId, deltaCents });
      else adjustsByMonth.set(month, [{ categoryId, deltaCents }]);
    }
  }

  // Walk months ASCENDING. Each month draws ONLY from the reserve available by its
  // own end (the running R that carried in + what was added IN that month) — a
  // transaction is capped at the reserve that existed that month and can never pull
  // in reserve added in a LATER month. The CURRENT (open) month therefore sees all
  // currently-available reserve; a closed month is bounded by its month-end balance.
  // Within a month: setLimit → cushion → adjust → spend → accrual.
  for (const month of months) {
    const closed = month < inputs.openMonth;

    const limits = inputs.limitsByMonth.get(month);
    if (limits) {
      for (const [categoryId, lim] of limits) {
        events.push({
          type: "setLimit",
          categoryId,
          month,
          normalCents: lim.plannedCents,
          cushionCents: lim.cushionCents,
        });
      }
    }

    if (cushionAt.has(month)) {
      events.push({ type: "cushion", month, on: cushionAt.get(month)! });
    }

    // adjust BEFORE spend — op1's capacity-bounded draw consumes reserves built
    // this month first; folding spend first and leaning on op3 cover OVER-COVERS
    // when signed adjusts interleave (R can go negative).
    const monthAdjusts = adjustsByMonth.get(month);
    if (monthAdjusts) {
      for (const { categoryId, deltaCents } of monthAdjusts) {
        events.push({ type: "adjust", categoryId, deltaCents, month });
      }
    }

    for (const [categoryId, byMonth] of inputs.spendByCategoryByMonth) {
      const spent = byMonth.get(month);
      if (spent !== undefined && spent !== 0n) {
        events.push({
          type: "spendDelta",
          categoryId,
          month,
          deltaCents: spent,
        });
      }
    }

    // accrual — CLOSED months only (decision G); the open month never accrues.
    if (closed) {
      const accrualCats = new Set<string>();
      if (limits) for (const id of limits.keys()) accrualCats.add(id);
      for (const [id, byMonth] of inputs.spendByCategoryByMonth) {
        if (byMonth.has(month)) accrualCats.add(id);
      }
      for (const categoryId of accrualCats) {
        events.push({ type: "accrual", categoryId, month });
      }
    }
  }

  // ── 3. exclude / archive — drop categories out of `internal` (decision C / J).
  for (const [categoryId, flags] of inputs.categoryFlags) {
    if (flags.reserveExcluded) {
      events.push({ type: "exclude", categoryId, excluded: true });
    }
    // Archive reaches the engine when EITHER timestamp is set: "all" stamps
    // archived_at; "current_future" (keep history) stamps ONLY archived_from and
    // leaves archived_at NULL — gating on archivedAt alone missed it, so the
    // category's reserve stayed in `internal` (the TOTAL AVAILABLE 210-vs-110 bug).
    if (flags.archivedAt || flags.archivedFrom) {
      // `archivedFrom` set → current_future; absent → all (decision J).
      const mode = flags.archivedFrom ? "current_future" : "all";
      events.push({ type: "archive", categoryId, mode });
    }
  }

  // ── 4. setUserDefined — Σ RESERVE-wallet balances (surplus input only).
  events.push({ type: "setUserDefined", cents: inputs.userDefinedCents });

  return events;
}

export function getReservePositions(deps: GetReservePositionsDeps) {
  return async (
    input: GetReservePositionsInput,
  ): Promise<Result<ReservePositionsResult, Error>> => {
    try {
      if (input.month && !/^\d{4}-\d{2}$/.test(input.month)) {
        return err(new Error("invalid_month"));
      }

      const inputs = await deps.eventLoader.load(
        input.tenantId,
        input.budgetId,
        input.month,
      );

      const events = mapInputsToEvents(inputs);
      const engine = reserveEngine({
        events,
        openMonth: inputs.openMonth,
        reservesEnabled: inputs.reservesEnabled,
      });

      // Group engine cells per category → byMonth maps + Σ overspent.
      const byMonthByCat = new Map<
        string,
        Map<
          string,
          {
            usedCents: bigint;
            overspentCents: bigint;
            overageCents: bigint;
            leftCents: bigint;
            endReserveCents: bigint;
          }
        >
      >();
      const overspentByCat = new Map<string, bigint>();
      const usedByCat = new Map<string, bigint>();
      for (const c of engine.cells) {
        let byMonth = byMonthByCat.get(c.categoryId);
        if (!byMonth) {
          byMonth = new Map();
          byMonthByCat.set(c.categoryId, byMonth);
        }
        byMonth.set(c.month, {
          usedCents: c.usedCents,
          overspentCents: c.overspentCents,
          overageCents: c.overageCents,
          leftCents: c.leftCents,
          endReserveCents: c.endReserveCents,
        });
        overspentByCat.set(
          c.categoryId,
          (overspentByCat.get(c.categoryId) ?? 0n) + c.overspentCents,
        );
        usedByCat.set(
          c.categoryId,
          (usedByCat.get(c.categoryId) ?? 0n) + c.usedCents,
        );
      }

      // Build positions for every category the engine touched (states ∪ cells).
      const catIds = new Set<string>([
        ...engine.states.keys(),
        ...byMonthByCat.keys(),
      ]);
      const positions = new Map<string, ReservePosition>();
      for (const categoryId of catIds) {
        const state = engine.states.get(categoryId);
        positions.set(categoryId, {
          categoryId,
          reserveCents: state?.reserveCents ?? 0n,
          // U from the display cells (Σ cell.used == state.U when enabled; 0 when
          // disabled per decision K — the engine zeroes per-month used in cells).
          usedCents: usedByCat.get(categoryId) ?? 0n,
          overspentCents: overspentByCat.get(categoryId) ?? 0n,
          reserveExcluded:
            inputs.categoryFlags.get(categoryId)?.reserveExcluded ?? false,
          byMonth: byMonthByCat.get(categoryId) ?? new Map(),
        });
      }

      const surplusCents = engine.surplusCents;
      const direction: "TOPUP" | "WITHDRAW" | "NONE" =
        surplusCents < 0n ? "TOPUP" : surplusCents > 0n ? "WITHDRAW" : "NONE";

      return ok({
        positions,
        openMonth: inputs.openMonth,
        internalCents: engine.internalCents,
        userDefinedCents: engine.userDefinedCents,
        surplusCents,
        direction,
      });
    } catch (e) {
      return err(e as Error);
    }
  };
}

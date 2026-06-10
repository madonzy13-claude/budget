/**
 * reserve-engine-multimonth.test.ts — locks the parts the single-open-month golden
 * fixture cannot exercise:
 *   - Decision G: closed-month underspend accrues into the running reserve; later
 *     months draw it. Current/open month does NOT accrue.
 *   - Adjust is month-scoped (op3, asOf): raising a reserve covers ONLY the
 *     overspent of the month the adjust was made in. A CLOSED month's overspent is
 *     never retroactively covered by an adjust — reserve set "now" is not spent on
 *     past months. A past month changes ONLY when its own transaction is added or
 *     edited (and a transaction entered now folds last, drawing the current pool).
 */
import { describe, test, expect } from "bun:test";
import {
  reserveEngine,
  type ReserveEngineEvent,
} from "../../src/domain/reserve-engine";

const G = "Grocery";
const limit300 = (month: string): ReserveEngineEvent => ({
  type: "setLimit",
  categoryId: G,
  month,
  normalCents: 30000n,
  cushionCents: 30000n,
});
const spend = (month: string, cents: bigint): ReserveEngineEvent => ({
  type: "spendDelta",
  categoryId: G,
  month,
  deltaCents: cents,
});
const close = (month: string): ReserveEngineEvent => ({
  type: "accrual",
  categoryId: G,
  month,
});
const cell = (res: ReturnType<typeof reserveEngine>, month: string) =>
  res.cells.find((c) => c.categoryId === G && c.month === month)!;

describe("reserveEngine — multi-month accrual (decision G)", () => {
  test("closed-month underspend accrues, then a later month draws it", () => {
    // 2026-01: spend 100 of a 300 limit → left 200 → accrual makes R 200.
    // 2026-02: spend 500 → overage 200 → draws the 200 reserve → used 200, R 0.
    const events: ReserveEngineEvent[] = [
      limit300("2026-01"),
      spend("2026-01", 10000n),
      close("2026-01"),
      limit300("2026-02"),
      spend("2026-02", 50000n),
    ];
    const r = reserveEngine({ events, openMonth: "2026-02" });

    expect(cell(r, "2026-01").leftCents).toBe(20000n);
    expect(cell(r, "2026-01").overspentCents).toBe(0n);
    expect(cell(r, "2026-01").usedCents).toBe(0n);

    expect(cell(r, "2026-02").overageCents).toBe(20000n);
    expect(cell(r, "2026-02").usedCents).toBe(20000n);
    expect(cell(r, "2026-02").overspentCents).toBe(0n);

    expect(r.states.get(G)!.reserveCents).toBe(0n);
    expect(r.states.get(G)!.usedCents).toBe(20000n);
  });

  test("accrual accumulates across two closed months", () => {
    // left 200 (Jan) + left 100 (Feb) = 300 reserve carried into the open month.
    const events: ReserveEngineEvent[] = [
      limit300("2026-01"),
      spend("2026-01", 10000n),
      close("2026-01"),
      limit300("2026-02"),
      spend("2026-02", 20000n),
      close("2026-02"),
    ];
    const r = reserveEngine({ events, openMonth: "2026-03" });
    expect(r.states.get(G)!.reserveCents).toBe(30000n);
    expect(r.states.get(G)!.usedCents).toBe(0n);
  });
});

describe("reserveEngine — adjust is month-scoped, closed months locked", () => {
  test("an adjust in the open month does NOT retroactively cover closed overspent", () => {
    // Two closed months each overspend 100 with no reserve → overspent 100 + 100, U 0.
    const base: ReserveEngineEvent[] = [
      limit300("2026-01"),
      spend("2026-01", 40000n), // overage 100
      close("2026-01"), // left 0 → no accrual change
      limit300("2026-02"),
      spend("2026-02", 40000n), // overage 100
      close("2026-02"),
    ];
    const pre = reserveEngine({ events: base, openMonth: "2026-03" });
    expect(pre.cells.find((c) => c.month === "2026-01")!.overspentCents).toBe(
      10000n,
    );
    expect(pre.cells.find((c) => c.month === "2026-02")!.overspentCents).toBe(
      10000n,
    );
    expect(pre.states.get(G)!.usedCents).toBe(0n);
    expect(pre.states.get(G)!.reserveCents).toBe(0n);

    // Raise reserve to 150 in the OPEN month (2026-03). 2026-03 has no overage, so
    // the adjust covers NOTHING — the 150 lands entirely in available reserve and
    // the two closed months keep their locked overspent. An adjust never spends
    // reserve on a past month (only a past-month transaction edit does).
    const events: ReserveEngineEvent[] = [
      ...base,
      { type: "adjust", categoryId: G, deltaCents: 15000n, month: "2026-03" },
    ];
    const r = reserveEngine({ events, openMonth: "2026-03" });

    expect(r.states.get(G)!.usedCents).toBe(0n); // nothing used
    expect(r.states.get(G)!.reserveCents).toBe(15000n); // all 150 stays available
    expect(cell(r, "2026-01").usedCents).toBe(0n);
    expect(cell(r, "2026-01").overspentCents).toBe(10000n); // locked
    expect(cell(r, "2026-02").usedCents).toBe(0n);
    expect(cell(r, "2026-02").overspentCents).toBe(10000n); // locked
    expect(r.internalCents).toBe(15000n);
  });

  test("each month's reserve covers its OWN overspend (per-month attribution)", () => {
    // category Fk: €28 reserve set in May (overspends €25) and €30 in June
    // (overspends €50, limit 0), folded in created order. Used reserve is attributed
    // to the month each cover/draw happened — a same-month adjust covers only its
    // own month. May's €28 covers May's €25 (May used 25, €3 carries forward to R);
    // June draws that €3 then its own €30 → June used €33, €17 overspent.
    const events: ReserveEngineEvent[] = [
      {
        type: "setLimit",
        categoryId: G,
        month: "2026-05",
        normalCents: 0n,
        cushionCents: 0n,
      },
      spend("2026-05", 2500n),
      { type: "adjust", categoryId: G, deltaCents: 2800n, month: "2026-05" },
      close("2026-05"),
      {
        type: "setLimit",
        categoryId: G,
        month: "2026-06",
        normalCents: 0n,
        cushionCents: 0n,
      },
      spend("2026-06", 5000n),
      { type: "adjust", categoryId: G, deltaCents: 3000n, month: "2026-06" },
    ];
    const r = reserveEngine({ events, openMonth: "2026-06" });

    // All €58 reserve consumed.
    expect(r.states.get(G)!.reserveCents).toBe(0n);
    expect(r.states.get(G)!.usedCents).toBe(5800n);
    // May fully covered by its OWN reserve (no migration to/from June).
    expect(cell(r, "2026-05").overageCents).toBe(2500n);
    expect(cell(r, "2026-05").usedCents).toBe(2500n);
    expect(cell(r, "2026-05").overspentCents).toBe(0n);
    // June: €3 carry-forward + its own €30 = €33 covered; €17 overspent.
    expect(cell(r, "2026-06").overageCents).toBe(5000n);
    expect(cell(r, "2026-06").usedCents).toBe(3300n);
    expect(cell(r, "2026-06").overspentCents).toBe(1700n);
  });

  test("an adjust made IN the overspent month still covers that month", () => {
    // A single open month that overspends 100, then the user raises its reserve in
    // the SAME (open) month — same-month coverage is unchanged (golden rows 16/20/24).
    const events: ReserveEngineEvent[] = [
      limit300("2026-03"),
      spend("2026-03", 40000n), // overage 100, no reserve → overspent 100
      { type: "adjust", categoryId: G, deltaCents: 15000n, month: "2026-03" },
    ];
    const r = reserveEngine({ events, openMonth: "2026-03" });
    expect(cell(r, "2026-03").usedCents).toBe(10000n); // covered the 100 overspent
    expect(cell(r, "2026-03").overspentCents).toBe(0n);
    expect(r.states.get(G)!.reserveCents).toBe(5000n); // remaining 50 available
    expect(r.states.get(G)!.usedCents).toBe(10000n);
  });
});

/**
 * reserve-engine-multimonth.test.ts — locks the parts the single-open-month golden
 * fixture cannot exercise:
 *   - Decision G: closed-month underspend accrues into the running reserve; later
 *     months draw it. Current/open month does NOT accrue.
 *   - Decision I: raising reserve (adjust or accrual) covers OUTSTANDING overspent
 *     across ALL months oldest-first; the per-month `used` split is oldest-first.
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

describe("reserveEngine — retroactive coverage oldest-first (decision I)", () => {
  test("raising reserve covers outstanding overspent oldest-first", () => {
    // Two closed months each overspend 100 with no reserve → overspent 100 + 100, U 0.
    // Then set reserve to 150 (d=150) → cover 150 of the 200 outstanding overspent,
    // split OLDEST-FIRST: Jan fully covered (100), Feb half (50), Feb overspent 50.
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

    const events: ReserveEngineEvent[] = [
      ...base,
      { type: "adjust", categoryId: G, deltaCents: 15000n }, // set reserve to 150 (R was 0)
    ];
    const r = reserveEngine({ events, openMonth: "2026-03" });

    expect(r.states.get(G)!.usedCents).toBe(15000n);
    expect(r.states.get(G)!.reserveCents).toBe(0n);
    expect(cell(r, "2026-01").usedCents).toBe(10000n);
    expect(cell(r, "2026-01").overspentCents).toBe(0n);
    expect(cell(r, "2026-02").usedCents).toBe(5000n);
    expect(cell(r, "2026-02").overspentCents).toBe(5000n);
    expect(r.internalCents).toBe(0n);
  });
});

/**
 * reserve-engine.test.ts — golden-fixture + per-operation tests for the keystone engine.
 *
 * The golden test parses `reserve-engine.golden.csv` (the 29-row validated fixture from
 * 05-REWRITE-SPEC.md) and, replaying one action per row, asserts EVERY numeric cell
 * (Grocery + Housing overspent/used/left/reserve, plus internal + surplus) in integer cents.
 * If a single cell is wrong the engine is wrong — this is the model's source of truth.
 */
import { describe, test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  reserveEngine,
  type ReserveEngineEvent,
  type ReserveEngineResult,
} from "../../src/domain/reserve-engine";

const OPEN = "2026-06";
const NAME: Record<"G" | "H", string> = { G: "Grocery", H: "Housing" };

interface Row {
  [k: string]: string;
}

function parseGolden(): Row[] {
  const raw = readFileSync(
    join(import.meta.dir, "reserve-engine.golden.csv"),
    "utf8",
  );
  const lines = raw
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  const header = lines[0].split(",");
  return lines.slice(1).map((line) => {
    const vals = line.split(",");
    const rec: Row = {};
    header.forEach((h, i) => (rec[h] = vals[i]));
    return rec;
  });
}

const cents = (major: string | number): bigint =>
  BigInt(Math.round(Number(major) * 100));

function cushionFor(name: string): bigint {
  return name === "Grocery" ? 30000n : 25000n; // cushion limits per spec (300 / 250)
}

/** Read a category's available reserve (R) from a prior engine result. */
function reserveOf(res: ReserveEngineResult | null, name: string): bigint {
  return res?.states.get(name)?.reserveCents ?? 0n;
}

/** Translate a fixture action string into the event(s) to append. */
function actionToEvents(
  action: string,
  row: Row,
  prev: ReserveEngineResult | null,
): ReserveEngineEvent[] {
  // starting point → seed both categories' open-month limits.
  if (action === "starting point") {
    return [
      {
        type: "setLimit",
        categoryId: NAME.G,
        month: OPEN,
        normalCents: cents(row.G_limit),
        cushionCents: cents(row.G_cushion),
      },
      {
        type: "setLimit",
        categoryId: NAME.H,
        month: OPEN,
        normalCents: cents(row.H_limit),
        cushionCents: cents(row.H_cushion),
      },
    ];
  }

  let m: RegExpMatchArray | null;

  if ((m = action.match(/^set userDefined (-?\d+)$/))) {
    return [{ type: "setUserDefined", cents: cents(m[1]) }];
  }

  if ((m = action.match(/^adjust (Grocery|Housing) reserve to (-?\d+)$/))) {
    const cat = m[1];
    const target = cents(m[2]);
    const currentR = reserveOf(prev, cat);
    return [{ type: "adjust", categoryId: cat, deltaCents: target - currentR }];
  }

  if ((m = action.match(/^add (Grocery|Housing) txn (-?\d+)$/))) {
    return [
      {
        type: "spendDelta",
        categoryId: m[1],
        month: OPEN,
        deltaCents: cents(m[2]),
      },
    ];
  }

  if ((m = action.match(/^remove (Grocery|Housing) txn (-?\d+)$/))) {
    return [
      {
        type: "spendDelta",
        categoryId: m[1],
        month: OPEN,
        deltaCents: -cents(m[2]),
      },
    ];
  }

  if ((m = action.match(/^edit (Grocery|Housing) txn (-?\d+) to (-?\d+)$/))) {
    return [
      {
        type: "spendDelta",
        categoryId: m[1],
        month: OPEN,
        deltaCents: cents(m[3]) - cents(m[2]),
      },
    ];
  }

  if (action === "cushion off to on")
    return [{ type: "cushion", month: OPEN, on: true }];
  if (action === "cushion on to off")
    return [{ type: "cushion", month: OPEN, on: false }];

  if ((m = action.match(/^(Grocery|Housing) limit (-?\d+) to (-?\d+)$/))) {
    const cat = m[1];
    return [
      {
        type: "setLimit",
        categoryId: cat,
        month: OPEN,
        normalCents: cents(m[3]),
        cushionCents: cushionFor(cat),
      },
    ];
  }

  throw new Error(`unmapped fixture action: "${action}"`);
}

describe("reserveEngine — golden fixture (29 rows, every cell)", () => {
  test("reproduces every numeric cell of the validated golden table", () => {
    const rows = parseGolden();
    const events: ReserveEngineEvent[] = [];
    let prev: ReserveEngineResult | null = null;

    for (const row of rows) {
      const action = row.action;
      events.push(...actionToEvents(action, row, prev));
      const res = reserveEngine({
        events,
        openMonth: OPEN,
        reservesEnabled: true,
      });

      const gCell = res.cells.find(
        (c) => c.categoryId === NAME.G && c.month === OPEN,
      );
      const hCell = res.cells.find(
        (c) => c.categoryId === NAME.H && c.month === OPEN,
      );
      const gR = reserveOf(res, NAME.G);
      const hR = reserveOf(res, NAME.H);

      const at = (col: string) => `[${action}] ${col}`;

      expect(gCell?.overspentCents ?? 0n, at("G_overspent")).toBe(
        cents(row.G_overspent),
      );
      expect(gCell?.usedCents ?? 0n, at("G_used")).toBe(cents(row.G_used));
      expect(gCell?.leftCents ?? 0n, at("G_left")).toBe(cents(row.G_left));
      expect(gR, at("G_reserve")).toBe(cents(row.G_reserve));

      expect(hCell?.overspentCents ?? 0n, at("H_overspent")).toBe(
        cents(row.H_overspent),
      );
      expect(hCell?.usedCents ?? 0n, at("H_used")).toBe(cents(row.H_used));
      expect(hCell?.leftCents ?? 0n, at("H_left")).toBe(cents(row.H_left));
      expect(hR, at("H_reserve")).toBe(cents(row.H_reserve));

      expect(res.internalCents, at("internal")).toBe(cents(row.internal));
      expect(res.userDefinedCents, at("userDefined")).toBe(
        cents(row.userDefined),
      );
      expect(res.surplusCents, at("surplus")).toBe(cents(row.surplus));

      prev = res;
    }
  });
});

// ---------------------------------------------------------------------------
// Per-operation unit tests — independent of the CSV (lock each formula).
// ---------------------------------------------------------------------------
describe("reserveEngine — operations", () => {
  const seedLimit = (
    categoryId: string,
    normal: bigint,
    cushion: bigint,
  ): ReserveEngineEvent => ({
    type: "setLimit",
    categoryId,
    month: OPEN,
    normalCents: normal,
    cushionCents: cushion,
  });
  const run = (events: ReserveEngineEvent[]) =>
    reserveEngine({ events, openMonth: OPEN, reservesEnabled: true });
  const cell = (r: ReserveEngineResult, id: string) =>
    r.cells.find((c) => c.categoryId === id && c.month === OPEN)!;

  test("op1 — partial draw when Δ exceeds R (overspend remainder)", () => {
    // R=100, U=0; spend 250 over limit 100 → overage 150 → draw 100, R 0, U 100, overspent 50.
    const r = run([
      seedLimit("c", 10000n, 10000n),
      { type: "adjust", categoryId: "c", deltaCents: 10000n }, // R = 100
      { type: "spendDelta", categoryId: "c", month: OPEN, deltaCents: 25000n },
    ]);
    expect(r.states.get("c")!.reserveCents).toBe(0n);
    expect(r.states.get("c")!.usedCents).toBe(10000n);
    expect(cell(r, "c").usedCents).toBe(10000n);
    expect(cell(r, "c").overspentCents).toBe(5000n);
  });

  test("op2 — decrease returns used → reserve after clearing overspent", () => {
    // R=0, U=100 (overage 100); reduce overage 100→40 → fromOverspent 0, remaining 60, U 40, R 60.
    const r = run([
      seedLimit("c", 0n, 0n),
      { type: "spendDelta", categoryId: "c", month: OPEN, deltaCents: 10000n }, // overage 100, no reserve
      { type: "adjust", categoryId: "c", deltaCents: 10000n }, // cover overspent → U 100, R 0
      { type: "spendDelta", categoryId: "c", month: OPEN, deltaCents: -6000n }, // overage 100→40
    ]);
    expect(r.states.get("c")!.usedCents).toBe(4000n);
    expect(r.states.get("c")!.reserveCents).toBe(6000n);
    expect(cell(r, "c").overspentCents).toBe(0n);
  });

  test("op3 — raise covers outstanding overspent first, rest to available", () => {
    // overage 50 (limit 0, spend 50), no reserve → overspent 50. set reserve to 80:
    // d=80, cover min(80,50)=50 → U 50, R 30.
    const r = run([
      seedLimit("c", 0n, 0n),
      { type: "spendDelta", categoryId: "c", month: OPEN, deltaCents: 5000n },
      { type: "adjust", categoryId: "c", deltaCents: 8000n }, // R was 0 → delta = 80
    ]);
    expect(r.states.get("c")!.usedCents).toBe(5000n);
    expect(r.states.get("c")!.reserveCents).toBe(3000n);
    expect(cell(r, "c").overspentCents).toBe(0n);
  });

  test("op3 — lower just reduces available reserve", () => {
    const r = run([
      seedLimit("c", 10000n, 10000n),
      { type: "adjust", categoryId: "c", deltaCents: 10000n }, // R = 100
      { type: "adjust", categoryId: "c", deltaCents: -6000n }, // R = 40
    ]);
    expect(r.states.get("c")!.reserveCents).toBe(4000n);
    expect(r.states.get("c")!.usedCents).toBe(0n);
  });

  test("op4 — month-close accrual grows reserve by left", () => {
    // open month so the engine accepts an accrual event for it in this unit test:
    // limit 300, spend 100 → left 200 → accrual raises R by 200.
    const r = run([
      seedLimit("c", 30000n, 30000n),
      { type: "spendDelta", categoryId: "c", month: OPEN, deltaCents: 10000n },
      { type: "accrual", categoryId: "c", month: OPEN },
    ]);
    expect(r.states.get("c")!.reserveCents).toBe(20000n);
  });

  test("invariant — used + overspent == overage on every cell", () => {
    const r = run([
      seedLimit("c", 30000n, 30000n),
      { type: "adjust", categoryId: "c", deltaCents: 50000n },
      { type: "spendDelta", categoryId: "c", month: OPEN, deltaCents: 120000n },
      { type: "spendDelta", categoryId: "c", month: OPEN, deltaCents: -20000n },
      { type: "adjust", categoryId: "c", deltaCents: 30000n },
    ]);
    for (const c of r.cells) {
      expect(c.usedCents + c.overspentCents).toBe(c.overageCents);
    }
  });
});

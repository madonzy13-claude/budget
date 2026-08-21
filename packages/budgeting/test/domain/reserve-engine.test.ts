/**
 * reserve-engine.test.ts — golden-fixture + per-operation tests for the keystone engine.
 *
 * The golden test parses `reserve-engine.golden.csv` (the validated table from the
 * user) and, replaying one action per row, asserts EVERY numeric cell (Grocery +
 * Housing overspent/used/left for the VIEWED month, plus per-category reserve,
 * internal, userDefined, surplus). If a single cell is wrong the engine is wrong.
 *
 * The table has two month columns:
 *   - `when`  = the month the action was performed (the adjust asOf; also which
 *               month txns added "now" land in via `view`).
 *   - `view`  = the month currently displayed → which (category, month) cell to read.
 * A "viewing July spendings" row performs no mutation; it only switches the viewed
 * month to assert the July cells. Limits carry forward to later months (SCD-2).
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
/** A month that has already closed — its leftover accrued before any late
 *  transaction arrived. */
const CLOSED = "2026-05";
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

describe("reserveEngine — golden fixture (2-category, June→July, every cell)", () => {
  test("reproduces every numeric cell of the validated golden table", () => {
    const rows = parseGolden();
    const events: ReserveEngineEvent[] = [];

    // Current limits per category + the months that already have a setLimit event
    // (limits carry forward to later months; re-emitting is idempotent).
    const curN: Record<string, bigint> = {};
    const curC: Record<string, bigint> = {};
    const limitMonths = new Set<string>();
    let prevR: Record<string, bigint> = { [NAME.G]: 0n, [NAME.H]: 0n };

    const ensureLimits = (month: string): void => {
      if (limitMonths.has(month)) return;
      limitMonths.add(month);
      for (const cat of [NAME.G, NAME.H]) {
        if (curN[cat] !== undefined) {
          events.push({
            type: "setLimit",
            categoryId: cat,
            month,
            normalCents: curN[cat],
            cushionCents: curC[cat],
          });
        }
      }
    };

    for (const row of rows) {
      const action = row.action;
      const when = row.when;
      const view = row.view;
      let m: RegExpMatchArray | null;

      if (action === "starting point") {
        curN[NAME.G] = cents(row.G_limit);
        curC[NAME.G] = cents(row.G_cushion);
        curN[NAME.H] = cents(row.H_limit);
        curC[NAME.H] = cents(row.H_cushion);
        ensureLimits(when);
      } else {
        // Make sure both the action's month and the viewed month have limits.
        ensureLimits(when);
        ensureLimits(view);

        if (action === "viewing July spendings") {
          // no mutation — just switch the viewed month
        } else if ((m = action.match(/^set userDefined (-?\d+)$/))) {
          events.push({ type: "setUserDefined", cents: cents(m[1]) });
        } else if (
          (m = action.match(/^adjust (Grocery|Housing) reserve to (-?\d+)$/))
        ) {
          const cat = m[1];
          // delta = target − current available reserve; asOf the month the adjust
          // was made (`when`) — covers only that month's outstanding overspent.
          events.push({
            type: "adjust",
            categoryId: cat,
            deltaCents: cents(m[2]) - (prevR[cat] ?? 0n),
            month: when,
          });
        } else if ((m = action.match(/^add (Grocery|Housing) txn (-?\d+)$/))) {
          events.push({
            type: "spendDelta",
            categoryId: m[1],
            month: view, // a txn added "now" lands in the viewed month
            deltaCents: cents(m[2]),
          });
        } else if (
          (m = action.match(/^remove (Grocery|Housing) txn (-?\d+)$/))
        ) {
          events.push({
            type: "spendDelta",
            categoryId: m[1],
            month: view,
            deltaCents: -cents(m[2]),
          });
        } else if (
          (m = action.match(/^edit (Grocery|Housing) txn (-?\d+) to (-?\d+)$/))
        ) {
          events.push({
            type: "spendDelta",
            categoryId: m[1],
            month: view,
            deltaCents: cents(m[3]) - cents(m[2]),
          });
        } else if (action === "cushion off to on") {
          events.push({ type: "cushion", month: when, on: true });
        } else if (action === "cushion on to off") {
          events.push({ type: "cushion", month: when, on: false });
        } else if (
          (m = action.match(/^(Grocery|Housing) limit (-?\d+) to (-?\d+)$/))
        ) {
          const cat = m[1];
          curN[cat] = cents(m[3]); // cushion limit unchanged
          // Re-emit the open month's limit with the new normal (op2 repay).
          limitMonths.delete(when);
          ensureLimits(when);
        } else {
          throw new Error(`unmapped fixture action: "${action}"`);
        }
      }

      // Auto-accrue CLOSED months (mirrors the orchestrator mapInputsToEvents):
      // a month strictly before the open month rolls its leftover budget into
      // reserve (decision G). Emitted FRESH each read (not persisted) so it
      // reflects the CURRENT closed-month state — e.g. removing a transaction from
      // a closed month frees budget that then accrues into the reserve.
      const accruals: ReserveEngineEvent[] = [];
      for (const cm of ["2026-06", "2026-07"]) {
        if (cm < when) {
          for (const cat of [NAME.G, NAME.H]) {
            accruals.push({ type: "accrual", categoryId: cat, month: cm });
          }
        }
      }
      const res = reserveEngine({
        events: [...events, ...accruals],
        openMonth: when,
        reservesEnabled: true,
      });

      const gCell = res.cells.find(
        (c) => c.categoryId === NAME.G && c.month === view,
      );
      const hCell = res.cells.find(
        (c) => c.categoryId === NAME.H && c.month === view,
      );
      const gR = res.states.get(NAME.G)?.reserveCents ?? 0n;
      const hR = res.states.get(NAME.H)?.reserveCents ?? 0n;
      prevR = { [NAME.G]: gR, [NAME.H]: hR };

      const at = (col: string) => `[${action} | view ${view}] ${col}`;

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
  const cell = (r: ReserveEngineResult, id: string, month: string = OPEN) =>
    r.cells.find((c) => c.categoryId === id && c.month === month)!;

  test("op1 — partial draw when Δ exceeds R (overspend remainder)", () => {
    // R=100, U=0; spend 250 over limit 100 → overage 150 → draw 100, R 0, U 100, overspent 50.
    const r = run([
      seedLimit("c", 10000n, 10000n),
      { type: "adjust", categoryId: "c", deltaCents: 10000n, month: OPEN }, // R = 100
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
      { type: "adjust", categoryId: "c", deltaCents: 10000n, month: OPEN }, // cover overspent → U 100, R 0
      { type: "spendDelta", categoryId: "c", month: OPEN, deltaCents: -6000n }, // overage 100→40
    ]);
    expect(r.states.get("c")!.usedCents).toBe(4000n);
    expect(r.states.get("c")!.reserveCents).toBe(6000n);
    expect(cell(r, "c").overspentCents).toBe(0n);
  });

  // 260806: the E2E "Overspend draws the reserve down by the full overspend"
  // went red — a 200 reserve overspent by 80 came back 0 instead of 120. Same
  // shape as a device report where a category with a 500 limit and 450 of spend
  // showed 450 OVERSPENT rather than none. Both say the engine is treating the
  // whole spend as overage instead of netting it against the limit.
  test("a reserve only pays for the part of the spend OVER the limit", () => {
    // limit 100, reserve 200, spend 180 → overage 80, so R 200 → 120, U 80.
    const r = run([
      seedLimit("c", 10000n, 10000n),
      { type: "adjust", categoryId: "c", deltaCents: 20000n, month: OPEN },
      { type: "spendDelta", categoryId: "c", month: OPEN, deltaCents: 18000n },
    ]);
    expect(r.states.get("c")!.reserveCents).toBe(12000n);
    expect(r.states.get("c")!.usedCents).toBe(8000n);
    expect(cell(r, "c").overspentCents).toBe(0n);
  });

  // 260806 user report: a category showed "planned 500" while its spend of 450
  // came back fully OVERSPENT. Both were right about different things — July ran
  // in CUSHION mode with a cushion limit of 0, so the engine was correct, and
  // the column rendered the NORMAL limit because it read the budget's mode as it
  // stands TODAY rather than the mode that month actually ran under.
  //
  // The engine already resolves the right one per month; it just never said so.
  // Exposing it lets the display read the same answer instead of guessing.
  test("reports which limit each month was judged against", () => {
    const r = run([
      { type: "cushion", month: CLOSED, on: true },
      { type: "cushion", month: OPEN, on: false },
      {
        type: "setLimit",
        categoryId: "c",
        month: CLOSED,
        normalCents: 50000n,
        cushionCents: 0n,
      },
      seedLimit("c", 50000n, 0n),
    ]);
    expect(r.cushionByMonth.get(CLOSED)).toBe(true);
    expect(r.cushionByMonth.get(OPEN)).toBe(false);
  });

  // 260806 user report: a transaction added to a PAST month came back entirely
  // OVERSPENT — 450 against a 500 limit showed 450 over. A closed month must
  // spend exactly like an open one: drain that month's limit first, then the
  // reserve that was available to it, and only what is left over is overspent.
  //
  // What makes a closed month different is that its leftover was already
  // accrued into R on the assumption nothing more would arrive. A late spend
  // has to correct that accrual, not sit on top of it.
  test("a spend added to a CLOSED month drains that month's limit first", () => {
    // June closes with nothing spent → its whole 500 limit accrues. Then a 450
    // spend arrives late: it fits inside June's own limit, so nothing is over
    // and the accrual it consumed drops to the 50 that is genuinely left.
    const r = run([
      {
        type: "setLimit",
        categoryId: "c",
        month: CLOSED,
        normalCents: 50000n,
        cushionCents: 50000n,
      },
      { type: "accrual", categoryId: "c", month: CLOSED },
      { type: "spendDelta", categoryId: "c", month: CLOSED, deltaCents: 45000n },
    ]);
    expect(cell(r, "c", CLOSED).overspentCents).toBe(0n);
    expect(cell(r, "c", CLOSED).overageCents).toBe(0n);
    expect(r.states.get("c")!.reserveCents).toBe(5000n);
  });

  // …and a late spend that genuinely exceeds the closed month's limit draws the
  // reserve it had, before anything counts as overspent.
  test("a closed month's overspend draws its reserve before going over", () => {
    // The reserve it draws has to come from an EARLIER month. Seeding it from
    // this month's own accrual — as this test used to — banks a leftover and
    // then spends it from the very month that produced it, which is the double
    // count the whole model exists to prevent; a month's leftover is the NEXT
    // month's money. Event order is the loader's (spend, then accrual).
    const r = run([
      {
        type: "setLimit",
        categoryId: "c",
        month: "2026-04",
        normalCents: 50000n,
        cushionCents: 50000n,
      },
      { type: "accrual", categoryId: "c", month: "2026-04" }, // banks 500
      {
        type: "setLimit",
        categoryId: "c",
        month: CLOSED,
        normalCents: 50000n,
        cushionCents: 50000n,
      },
      { type: "spendDelta", categoryId: "c", month: CLOSED, deltaCents: 60000n },
      { type: "accrual", categoryId: "c", month: CLOSED },
    ]);
    // 600 against a 500 limit → 100 over, covered by April's 500.
    expect(cell(r, "c", CLOSED).overageCents).toBe(10000n);
    expect(cell(r, "c", CLOSED).usedCents).toBe(10000n);
    expect(cell(r, "c", CLOSED).overspentCents).toBe(0n);
    expect(r.states.get("c")!.reserveCents, "400 of April's 500 is left").toBe(
      40000n,
    );
  });

  // …and spending UNDER the limit must not touch the reserve at all.
  test("a spend inside the limit leaves the reserve alone", () => {
    // limit 500, spend 450 → no overage, so nothing is drawn and nothing is over.
    const r = run([
      seedLimit("c", 50000n, 50000n),
      { type: "spendDelta", categoryId: "c", month: OPEN, deltaCents: 45000n },
    ]);
    expect(cell(r, "c").overageCents).toBe(0n);
    expect(cell(r, "c").overspentCents).toBe(0n);
    expect(r.states.get("c")!.usedCents).toBe(0n);
  });

  test("op3 — raise covers outstanding overspent first, rest to available", () => {
    // overage 50 (limit 0, spend 50), no reserve → overspent 50. set reserve to 80:
    // d=80, cover min(80,50)=50 → U 50, R 30.
    const r = run([
      seedLimit("c", 0n, 0n),
      { type: "spendDelta", categoryId: "c", month: OPEN, deltaCents: 5000n },
      { type: "adjust", categoryId: "c", deltaCents: 8000n, month: OPEN }, // R was 0 → delta = 80
    ]);
    expect(r.states.get("c")!.usedCents).toBe(5000n);
    expect(r.states.get("c")!.reserveCents).toBe(3000n);
    expect(cell(r, "c").overspentCents).toBe(0n);
  });

  test("op3 — lower just reduces available reserve", () => {
    const r = run([
      seedLimit("c", 10000n, 10000n),
      { type: "adjust", categoryId: "c", deltaCents: 10000n, month: OPEN }, // R = 100
      { type: "adjust", categoryId: "c", deltaCents: -6000n, month: OPEN }, // R = 40
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
      { type: "adjust", categoryId: "c", deltaCents: 50000n, month: OPEN },
      { type: "spendDelta", categoryId: "c", month: OPEN, deltaCents: 120000n },
      { type: "spendDelta", categoryId: "c", month: OPEN, deltaCents: -20000n },
      { type: "adjust", categoryId: "c", deltaCents: 30000n, month: OPEN },
    ]);
    for (const c of r.cells) {
      expect(c.usedCents + c.overspentCents).toBe(c.overageCents);
    }
  });

  test("per-month — a later month's overspend does not migrate an earlier month's coverage", () => {
    // June: limit 0, spend 1000, adjust +1000 (covers June) → June used 1000.
    // July: limit 0, spend 400, adjust +100 (covers 100 of July) → July used 100, overspent 300.
    // June must STAY fully covered; July keeps only its own 100.
    const JUL = "2026-07";
    const r = reserveEngine({
      events: [
        {
          type: "setLimit",
          categoryId: "c",
          month: OPEN,
          normalCents: 0n,
          cushionCents: 0n,
        },
        {
          type: "spendDelta",
          categoryId: "c",
          month: OPEN,
          deltaCents: 100000n,
        },
        { type: "adjust", categoryId: "c", deltaCents: 100000n, month: OPEN }, // cover June
        {
          type: "setLimit",
          categoryId: "c",
          month: JUL,
          normalCents: 0n,
          cushionCents: 0n,
        },
        { type: "spendDelta", categoryId: "c", month: JUL, deltaCents: 40000n },
        { type: "adjust", categoryId: "c", deltaCents: 10000n, month: JUL }, // cover 100 of July
      ],
      openMonth: JUL,
      reservesEnabled: true,
    });
    const jun = r.cells.find((c) => c.month === OPEN)!;
    const jul = r.cells.find((c) => c.month === JUL)!;
    expect(jun.usedCents).toBe(100000n); // June fully covered, unchanged
    expect(jun.overspentCents).toBe(0n);
    expect(jul.usedCents).toBe(10000n); // July keeps only its own cover
    expect(jul.overspentCents).toBe(30000n);
    expect(r.states.get("c")!.reserveCents).toBe(0n);
  });
});

// ---------------------------------------------------------------------------
// Month-end reserve snapshot — each cell carries endReserveCents, the FREE reserve
// (R) at that month's close. "Reserve available to a month" = usedCents +
// endReserveCents (what it used + what it left free); a month draws ONLY from the
// reserve available by its own end (month-order), so a back-dated transaction is
// CAPPED at its month's reserve and can't pull in reserve added in a later month.
// ---------------------------------------------------------------------------
describe("reserveEngine — month-end reserve snapshot (used / available)", () => {
  const JUL = "2026-07";

  test("endReserveCents EXCLUDES the month's OWN accrual (leftover belongs to next month)", () => {
    // June (closed): limit 300, spend 100 → left 200 accrues. That 200 is for JULY,
    // NOT available to June itself → June endReserve 0 ("0 / 0").
    // July (open): spend 500 → overage 200, draws the accrued 200 → used 200, end 0.
    const r = reserveEngine({
      events: [
        {
          type: "setLimit",
          categoryId: "c",
          month: OPEN,
          normalCents: 30000n,
          cushionCents: 30000n,
        },
        {
          type: "spendDelta",
          categoryId: "c",
          month: OPEN,
          deltaCents: 10000n,
        },
        { type: "accrual", categoryId: "c", month: OPEN },
        {
          type: "setLimit",
          categoryId: "c",
          month: JUL,
          normalCents: 30000n,
          cushionCents: 30000n,
        },
        { type: "spendDelta", categoryId: "c", month: JUL, deltaCents: 50000n },
      ],
      openMonth: JUL,
      reservesEnabled: true,
    });
    const jun = r.cells.find((c) => c.month === OPEN)!;
    const jul = r.cells.find((c) => c.month === JUL)!;
    expect(jun.endReserveCents, "June's own accrual is excluded").toBe(0n);
    expect(jul.endReserveCents, "July drew it all").toBe(0n);
    expect(jun.usedCents + jun.endReserveCents, "June available 0/0").toBe(0n);
    expect(jul.usedCents + jul.endReserveCents, "July available 200").toBe(
      20000n,
    );
  });

  test("a back-dated transaction is CAPPED at its month's end reserve (Fk May → 28/22)", () => {
    // Month-order (the orchestrator's order): adjust +28 May; +30, +50 June; spend
    // 50 May, 61 June. May draws only the 28 that existed by end of May → 28/22; the
    // June reserve never flows back. available: May 28/28 (0 free), June 61/80 (19 free).
    const FK = "Fk";
    const r = reserveEngine({
      events: [
        {
          type: "setLimit",
          categoryId: FK,
          month: "2026-05",
          normalCents: 0n,
          cushionCents: 0n,
        },
        { type: "adjust", categoryId: FK, deltaCents: 2800n, month: "2026-05" },
        {
          type: "spendDelta",
          categoryId: FK,
          month: "2026-05",
          deltaCents: 5000n,
        },
        { type: "accrual", categoryId: FK, month: "2026-05" },
        {
          type: "setLimit",
          categoryId: FK,
          month: OPEN,
          normalCents: 0n,
          cushionCents: 0n,
        },
        { type: "adjust", categoryId: FK, deltaCents: 3000n, month: OPEN },
        { type: "adjust", categoryId: FK, deltaCents: 5000n, month: OPEN },
        { type: "spendDelta", categoryId: FK, month: OPEN, deltaCents: 6100n },
      ],
      openMonth: OPEN,
      reservesEnabled: true,
    });
    const may = r.cells.find((c) => c.month === "2026-05")!;
    const jun = r.cells.find((c) => c.month === OPEN)!;
    expect(may.usedCents, "May capped at end-of-May reserve").toBe(2800n);
    expect(may.overspentCents).toBe(2200n);
    expect(may.endReserveCents, "May ends with 0 free").toBe(0n);
    expect(may.usedCents + may.endReserveCents, "available May = 28").toBe(
      2800n,
    );
    expect(jun.usedCents).toBe(6100n);
    expect(jun.endReserveCents, "June ends with 19 free").toBe(1900n);
    expect(jun.usedCents + jun.endReserveCents, "available June = 80").toBe(
      8000n,
    );
  });

  // A reserve REDUCTION made now must propagate BACK: a closed month can no
  // longer count free reserve that has since been removed. But reserve a LATER
  // month actually USED is still "available to" the earlier month (it flowed
  // through it). endReserveCents = max(0, min(forward-at-close, backward-from-R)).
  test("a LATER reserve reduction caps a PAST month's available (Djjd: May 220/270, June 50/50)", () => {
    // May (closed): set reserve 300, spend 220 over → used 220, R 80 at close.
    // June (open):  reduce reserve by 30 (free 80→50), spend 50 over → used 50, R 0.
    // June's −30 propagates back: May free 80→50; but June's used 50 still counts.
    const r = reserveEngine({
      events: [
        {
          type: "setLimit",
          categoryId: "d",
          month: "2026-05",
          normalCents: 0n,
          cushionCents: 0n,
        },
        {
          type: "adjust",
          categoryId: "d",
          deltaCents: 30000n,
          month: "2026-05",
        }, // R = 300
        {
          type: "spendDelta",
          categoryId: "d",
          month: "2026-05",
          deltaCents: 22000n,
        }, // over 220 → used 220, R 80
        { type: "accrual", categoryId: "d", month: "2026-05" }, // overspent → left 0, no-op
        {
          type: "setLimit",
          categoryId: "d",
          month: OPEN,
          normalCents: 0n,
          cushionCents: 0n,
        },
        { type: "adjust", categoryId: "d", deltaCents: -3000n, month: OPEN }, // free 80 → 50
        { type: "spendDelta", categoryId: "d", month: OPEN, deltaCents: 5000n }, // over 50 → used 50, R 0
      ],
      openMonth: OPEN,
      reservesEnabled: true,
    });
    const may = r.cells.find((c) => c.month === "2026-05")!;
    const jun = r.cells.find((c) => c.month === OPEN)!;
    expect(may.usedCents, "May used unchanged").toBe(22000n);
    expect(may.endReserveCents, "May free reduced 80→50 by June's −30").toBe(
      5000n,
    );
    expect(may.usedCents + may.endReserveCents, "available May = 270").toBe(
      27000n,
    );
    expect(jun.usedCents).toBe(5000n);
    expect(jun.endReserveCents, "June free 0").toBe(0n);
    expect(jun.usedCents + jun.endReserveCents, "available June = 50").toBe(
      5000n,
    );
    expect(r.states.get("d")!.reserveCents, "R final 0").toBe(0n);
  });

  test("reducing reserve to zero with no later draw drops the past month to used-only (May 220/220)", () => {
    // May (used 220, R 80). June (open): no spend, reduce reserve to 0 (−80).
    // Nothing downstream consumed it → May's free collapses to 0 → 220/220.
    const r = reserveEngine({
      events: [
        {
          type: "setLimit",
          categoryId: "d",
          month: "2026-05",
          normalCents: 0n,
          cushionCents: 0n,
        },
        {
          type: "adjust",
          categoryId: "d",
          deltaCents: 30000n,
          month: "2026-05",
        },
        {
          type: "spendDelta",
          categoryId: "d",
          month: "2026-05",
          deltaCents: 22000n,
        },
        { type: "accrual", categoryId: "d", month: "2026-05" },
        {
          type: "setLimit",
          categoryId: "d",
          month: OPEN,
          normalCents: 0n,
          cushionCents: 0n,
        },
        { type: "adjust", categoryId: "d", deltaCents: -8000n, month: OPEN }, // free 80 → 0
      ],
      openMonth: OPEN,
      reservesEnabled: true,
    });
    const may = r.cells.find((c) => c.month === "2026-05")!;
    expect(may.usedCents).toBe(22000n);
    expect(may.endReserveCents, "free collapses to 0").toBe(0n);
    expect(may.usedCents + may.endReserveCents, "available May = 220").toBe(
      22000n,
    );
    expect(r.states.get("d")!.reserveCents).toBe(0n);
  });

  test("an over-large back-add never drives reserve or used negative (no -30 / 0)", () => {
    // May drains the whole buffer (spend 300 over, R 300 → 0). The June −30 then
    // lands on an empty buffer → must clamp at 0, and June's capped draw must
    // never go negative (the reported "-30 / 0" bug).
    const r = reserveEngine({
      events: [
        {
          type: "setLimit",
          categoryId: "d",
          month: "2026-05",
          normalCents: 0n,
          cushionCents: 0n,
        },
        {
          type: "adjust",
          categoryId: "d",
          deltaCents: 30000n,
          month: "2026-05",
        },
        {
          type: "spendDelta",
          categoryId: "d",
          month: "2026-05",
          deltaCents: 30000n,
        }, // over 300 → draws all 300
        { type: "accrual", categoryId: "d", month: "2026-05" },
        {
          type: "setLimit",
          categoryId: "d",
          month: OPEN,
          normalCents: 0n,
          cushionCents: 0n,
        },
        { type: "adjust", categoryId: "d", deltaCents: -3000n, month: OPEN }, // empty buffer → clamp 0
        { type: "spendDelta", categoryId: "d", month: OPEN, deltaCents: 5000n },
      ],
      openMonth: OPEN,
      reservesEnabled: true,
    });
    const jun = r.cells.find((c) => c.month === OPEN)!;
    expect(jun.usedCents, "June used never negative").toBe(0n);
    expect(jun.endReserveCents, "June free never negative").toBe(0n);
    expect(r.states.get("d")!.reserveCents, "buffer floored at 0").toBe(0n);
    for (const c of r.cells) {
      expect(c.usedCents >= 0n, `used ${c.month} >= 0`).toBe(true);
      expect(c.endReserveCents >= 0n, `endReserve ${c.month} >= 0`).toBe(true);
    }
  });
});

// A "No limit" category (category_limits.no_limit) is unbounded on purpose: it
// cannot be overspent, and it never accrues leftover into the reserve. Both fall
// out of one rule — its effective limit IS its spend — so overage and left are
// structurally 0 rather than clamped after the fact.
describe("reserveEngine — a No-limit category", () => {
  const run = (events: ReserveEngineEvent[]) =>
    reserveEngine({ events, openMonth: OPEN, reservesEnabled: true });
  const cell = (r: ReserveEngineResult, id: string, month: string = OPEN) =>
    r.cells.find((c) => c.categoryId === id && c.month === month)!;
  const noLimit = (
    categoryId: string,
    month: string = OPEN,
  ): ReserveEngineEvent => ({
    type: "setLimit",
    categoryId,
    month,
    normalCents: 0n,
    cushionCents: 0n,
    noLimit: true,
  });

  test("cannot be overspent, however much lands in it", () => {
    const r = run([
      noLimit("c"),
      { type: "spendDelta", categoryId: "c", month: OPEN, deltaCents: 50000n },
    ]);
    const k = cell(r, "c");
    expect(k.overageCents).toBe(0n);
    expect(k.leftCents).toBe(0n);
    expect(k.usedCents).toBe(0n);
    expect(k.overspentCents).toBe(0n);
    expect(r.states.get("c")!.reserveCents).toBe(0n);
  });

  test("stays unbounded in a CUSHION month — the flag beats the cushion limit", () => {
    // Ordering guard. effLimit resolves cushion-vs-normal FIRST, and a no-limit
    // row stores cushion 0 — so a check placed after that branch would read a
    // threshold of 0 and turn the whole spend into overage, draining the reserve.
    const r = run([
      { type: "cushion", month: OPEN, on: true },
      noLimit("c"),
      { type: "spendDelta", categoryId: "c", month: OPEN, deltaCents: 50000n },
    ]);
    expect(cell(r, "c").overageCents).toBe(0n);
    expect(cell(r, "c").overspentCents).toBe(0n);
  });

  test("accrues nothing at month close, however little was spent", () => {
    const r = run([
      noLimit("c", CLOSED),
      { type: "spendDelta", categoryId: "c", month: CLOSED, deltaCents: 1000n },
      { type: "accrual", categoryId: "c", month: CLOSED },
    ]);
    expect(r.states.get("c")!.reserveCents).toBe(0n);
    expect(cell(r, "c", CLOSED).leftCents).toBe(0n);
  });

  test("a limited category is untouched by the flag's existence", () => {
    const r = run([
      {
        type: "setLimit",
        categoryId: "c",
        month: OPEN,
        normalCents: 10000n,
        cushionCents: 10000n,
      },
      { type: "spendDelta", categoryId: "c", month: OPEN, deltaCents: 15000n },
    ]);
    expect(cell(r, "c").overageCents).toBe(5000n);
    expect(cell(r, "c").overspentCents).toBe(5000n);
  });
});

// A category with reserve_excluded set does not take part in the reserve AT ALL
// (user, 260820). Until now the flag only hid the category from the pooled
// `internal` total, so an excluded category still banked its own leftovers and
// still spent them on its own overspend — which is how Insurance came to report
// "reserves used 19" for a category that was never meant to hold any.
//
// Both halves matter and they are separate code paths: nothing goes IN (op4
// accrual, op3 adjust) and nothing comes OUT (op1 draw).
describe("reserveEngine — a reserve-EXCLUDED category", () => {
  const X = "Excluded";
  const limit = (month: string): ReserveEngineEvent => ({
    type: "setLimit",
    categoryId: X,
    month,
    normalCents: 100000n,
    cushionCents: 100000n,
  });
  const spend = (month: string, cents: bigint): ReserveEngineEvent => ({
    type: "spendDelta",
    categoryId: X,
    month,
    deltaCents: cents,
  });
  const close = (month: string): ReserveEngineEvent => ({
    type: "accrual",
    categoryId: X,
    month,
  });
  // The loader appends exclude/archive AFTER every month's events, so the flag
  // arriving last is the REAL shape — the engine must not depend on its position.
  const excluded: ReserveEngineEvent = {
    type: "exclude",
    categoryId: X,
    excluded: true,
  };
  const at = (r: ReserveEngineResult, month: string) =>
    r.cells.find((c) => c.categoryId === X && c.month === month)!;

  // May is 400 under its limit; June is 200 over it.
  const history: ReserveEngineEvent[] = [
    limit("2026-05"),
    spend("2026-05", 60000n),
    close("2026-05"),
    limit(OPEN),
    spend(OPEN, 120000n),
  ];

  test("banks nothing: a closed month's leftover never reaches the reserve", () => {
    const r = reserveEngine({
      events: [...history, excluded],
      openMonth: OPEN,
    });
    expect(at(r, "2026-05").leftCents, "May still shows its 400 left").toBe(
      40000n,
    );
    expect(r.states.get(X)!.reserveCents, "but none of it was banked").toBe(0n);
  });

  test("draws nothing: an overspent month stays fully overspent", () => {
    const r = reserveEngine({
      events: [...history, excluded],
      openMonth: OPEN,
    });
    expect(at(r, OPEN).overageCents).toBe(20000n);
    expect(at(r, OPEN).usedCents, "no reserve to use").toBe(0n);
    expect(at(r, OPEN).overspentCents, "the whole overage is overspent").toBe(
      20000n,
    );
    expect(at(r, OPEN).endReserveCents).toBe(0n);
  });

  test("a manual reserve adjustment cannot give it one either", () => {
    // Insurance's "+19 CSVIMPORT-JULY" pin, on a category excluded from reserves.
    const r = reserveEngine({
      events: [
        ...history,
        { type: "adjust", categoryId: X, deltaCents: 1900n, month: OPEN },
        excluded,
      ],
      openMonth: OPEN,
    });
    expect(at(r, OPEN).usedCents, "the pin covers nothing").toBe(0n);
    expect(at(r, OPEN).overspentCents).toBe(20000n);
    expect(r.states.get(X)!.reserveCents).toBe(0n);
  });

  test("gates the whole history no matter where the flag arrives", () => {
    const first = reserveEngine({
      events: [excluded, ...history],
      openMonth: OPEN,
    });
    const last = reserveEngine({
      events: [...history, excluded],
      openMonth: OPEN,
    });
    expect(at(first, OPEN).overspentCents).toBe(at(last, OPEN).overspentCents);
    expect(first.states.get(X)!.reserveCents).toBe(
      last.states.get(X)!.reserveCents,
    );
  });

  test("an INCLUDED category with the same history still accrues and draws", () => {
    // The control: without the flag these numbers are 400 banked, 200 drawn.
    const r = reserveEngine({ events: history, openMonth: OPEN });
    expect(at(r, OPEN).usedCents).toBe(20000n);
    expect(at(r, OPEN).overspentCents).toBe(0n);
    expect(r.states.get(X)!.reserveCents).toBe(20000n);
  });
});

// A month may use the SMALLER of two amounts (user, 260820):
//   A — what the pot actually held at that month's close, and
//   B — how much of it still exists: today's balance plus whatever the months
//       AFTER it took (later months are last in line and give theirs back).
// B was already honoured by the displayed figure. It was NOT honoured by the
// draw, so a withdrawal made after the fact left a month still spending money
// that had since been taken out — the same 400 both used and withdrawn.
describe("reserveEngine — a month cannot use reserve that has been withdrawn", () => {
  const C = "Food";
  const limit = (month: string): ReserveEngineEvent => ({
    type: "setLimit",
    categoryId: C,
    month,
    normalCents: 100000n,
    cushionCents: 100000n,
  });
  const spend = (month: string, cents: bigint): ReserveEngineEvent => ({
    type: "spendDelta",
    categoryId: C,
    month,
    deltaCents: cents,
  });
  const close = (month: string): ReserveEngineEvent => ({
    type: "accrual",
    categoryId: C,
    month,
  });
  const at = (r: ReserveEngineResult, month: string) =>
    r.cells.find((c) => c.categoryId === C && c.month === month)!;

  // May banks 400. June closes level. In July the whole 400 is withdrawn.
  // Then a 400 receipt is back-dated into June.
  const events: ReserveEngineEvent[] = [
    limit("2026-05"),
    spend("2026-05", 60000n),
    close("2026-05"),
    limit("2026-06"),
    spend("2026-06", 140000n),
    close("2026-06"),
    limit("2026-07"),
    { type: "adjust", categoryId: C, deltaCents: -40000n, month: "2026-07" },
  ];

  test("the withdrawn 400 cannot also be spent by June", () => {
    const r = reserveEngine({ events, openMonth: "2026-07" });
    expect(at(r, "2026-06").overageCents).toBe(40000n);
    expect(at(r, "2026-06").usedCents, "withdrawn — nothing to use").toBe(0n);
    expect(at(r, "2026-06").overspentCents).toBe(40000n);
  });

  test("Σ used never exceeds what was banked minus what was withdrawn", () => {
    const r = reserveEngine({ events, openMonth: "2026-07" });
    const totalUsed = r.cells
      .filter((c) => c.categoryId === C)
      .reduce((a, c) => a + c.usedCents, 0n);
    expect(totalUsed, "banked 400 − withdrawn 400 = 0 spendable").toBe(0n);
    expect(r.states.get(C)!.reserveCents, "never displays negative").toBe(0n);
  });

  test("without the withdrawal June draws its full 400 (the control)", () => {
    const r = reserveEngine({
      events: events.filter((e) => e.type !== "adjust"),
      openMonth: "2026-07",
    });
    expect(at(r, "2026-06").usedCents).toBe(40000n);
    expect(at(r, "2026-06").overspentCents).toBe(0n);
  });

  test("a PARTIAL withdrawal leaves the rest usable", () => {
    // Withdraw only 150 of the 400 → June may still use 250.
    const r = reserveEngine({
      events: events.map((e) =>
        e.type === "adjust" ? { ...e, deltaCents: -15000n } : e,
      ),
      openMonth: "2026-07",
    });
    expect(at(r, "2026-06").usedCents).toBe(25000n);
    expect(at(r, "2026-06").overspentCents).toBe(15000n);
  });
});

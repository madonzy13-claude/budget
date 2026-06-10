/**
 * get-reserve-positions.test.ts — the replay orchestrator (event-loader → engine).
 *
 * The OLD accrued/funded/expected/real model is GONE. These tests pin that the
 * orchestrator:
 *   1. maps the loader's ReserveEventInputs to a chronological ReserveEngineEvent[],
 *   2. folds them through reserve-engine, and
 *   3. returns per-category {reserveCents, usedCents, overspentCents} + internal +
 *      userDefined + surplus + direction.
 *
 * The golden reproduction encodes the FINAL-STATE loader inputs that the 29-row
 * golden table (05-REWRITE-SPEC.md) collapses to in its single open month —
 * single open month 2026-06, final spend/limits, the ordered signed adjustment
 * deltas (decision E), Σ RESERVE-wallet userDefined. The last golden row is:
 *   Grocery R 1300, Housing R 800, internal 2100, userDefined 3000, surplus 900.
 * Cents: 130000 / 80000 / 210000 / 300000 / 90000 → direction WITHDRAW (surplus>0).
 */
import { describe, it, expect } from "bun:test";
import {
  getReservePositions,
  mapInputsToEvents,
} from "../../src/application/get-reserve-positions";
import type {
  ReserveEventInputs,
  ReserveEventLoaderRepo,
} from "../../src/ports/reserve-event-loader-repo";

const TENANT = "t1";
const BUDGET = "b1";
const G = "Grocery";
const H = "Housing";
const OPEN = "2026-06";

/** A fake loader returning hand-built ReserveEventInputs (no DB). */
function fakeLoader(inputs: ReserveEventInputs): ReserveEventLoaderRepo {
  return {
    async load(_tenant, _budget, override) {
      // Honour the open-month override when given (mirrors the real adapter).
      if (override) return { ...inputs, openMonth: override };
      return inputs;
    },
  };
}

/**
 * Final-state loader inputs the golden table collapses to (derived by replaying
 * the 29 golden actions through the engine; see 05-12-SUMMARY for the table).
 * Grocery: spent 1800, normal limit 400 (cushion 300), adjust deltas
 * [100, 1100, 1500] cents-as-major → [10000,110000,150000].
 * Housing: spent 1600, normal limit 1000 (cushion 250), adjust deltas
 * [300,-50,-250,400,1000] major → [30000,-5000,-25000,40000,100000].
 * userDefined 3000 (300000c), cushion off.
 */
function goldenInputs(
  over: Partial<ReserveEventInputs> = {},
): ReserveEventInputs {
  return {
    spendByCategoryByMonth: new Map([
      [G, new Map([[OPEN, 180000n]])],
      [H, new Map([[OPEN, 160000n]])],
    ]),
    limitsByMonth: new Map([
      [
        OPEN,
        new Map([
          [G, { plannedCents: 40000n, cushionCents: 30000n }],
          [H, { plannedCents: 100000n, cushionCents: 25000n }],
        ]),
      ],
    ]),
    cushionHistory: [],
    adjustmentsByCategory: new Map([
      [
        G,
        [10000n, 110000n, 150000n].map((deltaCents) => ({
          deltaCents,
          month: OPEN,
        })),
      ],
      [
        H,
        [30000n, -5000n, -25000n, 40000n, 100000n].map((deltaCents) => ({
          deltaCents,
          month: OPEN,
        })),
      ],
    ]),
    categoryFlags: new Map([
      [
        G,
        {
          reserveExcluded: false,
          archivedAt: null,
          archivedFrom: null,
          sortIndex: 0,
          name: "Grocery",
        },
      ],
      [
        H,
        {
          reserveExcluded: false,
          archivedAt: null,
          archivedFrom: null,
          sortIndex: 1,
          name: "Housing",
        },
      ],
    ]),
    userDefinedCents: 300000n,
    reservesEnabled: true,
    openMonth: OPEN,
    budgetCurrency: "EUR",
    ...over,
  };
}

const run = (inputs: ReserveEventInputs, month?: string) =>
  getReservePositions({ eventLoader: fakeLoader(inputs) })({
    tenantId: TENANT,
    budgetId: BUDGET,
    month,
  });

describe("getReservePositions — replay orchestrator", () => {
  it("reproduces the golden final row through loader → engine", async () => {
    const r = await run(goldenInputs());
    expect(r.isOk()).toBe(true);
    if (!r.isOk()) return;
    const v = r.value;
    expect(v.positions.get(G)!.reserveCents).toBe(130000n);
    expect(v.positions.get(H)!.reserveCents).toBe(80000n);
    expect(v.internalCents).toBe(210000n);
    expect(v.userDefinedCents).toBe(300000n);
    expect(v.surplusCents).toBe(90000n);
    expect(v.direction).toBe("WITHDRAW");
    // last golden row: both categories fully covered → overspent 0.
    expect(v.positions.get(G)!.overspentCents).toBe(0n);
    expect(v.positions.get(H)!.overspentCents).toBe(0n);
    // per-month cell for the open month is exposed for the spendings grid.
    const gCell = v.positions.get(G)!.byMonth.get(OPEN);
    expect(gCell?.usedCents).toBe(140000n); // Grocery used the reserve to cover overage
    expect(gCell?.overspentCents).toBe(0n);
  });

  it("direction = TOPUP when internal exceeds userDefined (surplus<0)", async () => {
    const r = await run(goldenInputs({ userDefinedCents: 0n }));
    expect(r.isOk()).toBe(true);
    if (!r.isOk()) return;
    expect(r.value.userDefinedCents).toBe(0n);
    expect(r.value.internalCents).toBe(210000n);
    expect(r.value.surplusCents).toBe(-210000n);
    expect(r.value.direction).toBe("TOPUP");
  });

  it("direction = NONE when userDefined exactly matches internal (surplus 0)", async () => {
    const r = await run(goldenInputs({ userDefinedCents: 210000n }));
    expect(r.isOk()).toBe(true);
    if (!r.isOk()) return;
    expect(r.value.surplusCents).toBe(0n);
    expect(r.value.direction).toBe("NONE");
  });

  it("archive 'current_future' (archivedFrom set, archivedAt null) drops the category's reserve from internal", async () => {
    // Bug: the orchestrator only emitted the archive event when archivedAt was
    // set, so a "keep history" archive (archivedFrom only) left the category's
    // reserve in internal → TOTAL AVAILABLE stayed too high (the 210-vs-110 bug).
    const r = await run(
      goldenInputs({
        categoryFlags: new Map([
          [
            G,
            {
              reserveExcluded: false,
              archivedAt: null,
              archivedFrom: "2026-06-01",
              sortIndex: 0,
              name: "Grocery",
            },
          ],
          [
            H,
            {
              reserveExcluded: false,
              archivedAt: null,
              archivedFrom: null,
              sortIndex: 1,
              name: "Housing",
            },
          ],
        ]),
      }),
    );
    expect(r.isOk()).toBe(true);
    if (!r.isOk()) return;
    // G archived "keep history" → its 130000 leaves internal; only H's 80000 stays.
    expect(r.value.internalCents).toBe(80000n);
    // History kept: G's used reserve cell is still computed.
    expect(r.value.positions.get(G)!.byMonth.get(OPEN)?.usedCents).toBe(
      140000n,
    );
  });

  it("reservesEnabled=false (decision K): used→overspent, internal hidden", async () => {
    const r = await run(goldenInputs({ reservesEnabled: false }));
    expect(r.isOk()).toBe(true);
    if (!r.isOk()) return;
    expect(r.value.internalCents).toBe(0n);
    expect(r.value.surplusCents).toBe(300000n); // userDefined − 0
    // Every position reads used=0; overspent = full overage for its months.
    for (const pos of r.value.positions.values()) {
      expect(pos.usedCents).toBe(0n);
      for (const cell of pos.byMonth.values()) {
        expect(cell.usedCents).toBe(0n);
        expect(cell.overspentCents).toBe(cell.overageCents);
      }
    }
  });

  it("excluded category drops out of internal", async () => {
    // Exclude Housing → internal = Grocery R only (130000).
    const inputs = goldenInputs();
    inputs.categoryFlags.set(H, {
      reserveExcluded: true,
      archivedAt: null,
      archivedFrom: null,
      sortIndex: 1,
      name: "Housing",
    });
    const r = await run(inputs);
    expect(r.isOk()).toBe(true);
    if (!r.isOk()) return;
    expect(r.value.internalCents).toBe(130000n);
  });

  it("returns err('invalid_month') for a malformed month override", async () => {
    const r = await run(goldenInputs(), "2026-6");
    expect(r.isErr()).toBe(true);
    expect(r.isErr() && r.error.message).toBe("invalid_month");
  });

  it("a reserve set in a PRIOR month is drawn by a later month's overspend (forward draw)", async () => {
    // Fk: reserve 2800 set in May (adjust month 2026-05), then a 10000 overspend
    // in June (limit 0, open month). The May reserve must cover 2800 of June's
    // overage via op1 — NOT sit unused with June fully overspent. Repro of the
    // "added txn, all overspent, but 28 in reserve" report: the orchestrator must
    // fold the May adjust BEFORE June's spend.
    const inputs: ReserveEventInputs = {
      spendByCategoryByMonth: new Map([["Fk", new Map([["2026-06", 10000n]])]]),
      limitsByMonth: new Map([
        ["2026-05", new Map([["Fk", { plannedCents: 0n, cushionCents: 0n }]])],
        ["2026-06", new Map([["Fk", { plannedCents: 0n, cushionCents: 0n }]])],
      ]),
      cushionHistory: [],
      adjustmentsByCategory: new Map([
        ["Fk", [{ deltaCents: 2800n, month: "2026-05" }]],
      ]),
      categoryFlags: new Map([
        [
          "Fk",
          {
            reserveExcluded: false,
            archivedAt: null,
            archivedFrom: null,
            sortIndex: 0,
            name: "Fk",
          },
        ],
      ]),
      userDefinedCents: 0n,
      reservesEnabled: true,
      openMonth: "2026-06",
      budgetCurrency: "EUR",
    };
    const r = await run(inputs);
    expect(r.isOk()).toBe(true);
    if (!r.isOk()) return;
    const fk = r.value.positions.get("Fk")!;
    expect(fk.usedCents).toBe(2800n); // reserve drawn by the later overspend
    expect(fk.reserveCents).toBe(0n); // fully drawn
    const june = fk.byMonth.get("2026-06")!;
    expect(june.usedCents).toBe(2800n);
    expect(june.overspentCents).toBe(7200n); // 10000 − 2800
  });

  it("two overspent months: each month covered by its OWN reserve (per-month attribution)", async () => {
    // Fk: €28 reserve set in May + €30 in June (= €58); May overspends €25, June
    // overspends €50 (limit 0). Used reserve is attributed to the month each
    // draw/cover happened (adjusts fold before that month's spend): May's €28 fully
    // covers its €25 (€3 carries to June); June draws that €3 + its own €30 = €33,
    // leaving €17 overspent. Coverage never migrates between months.
    const inputs: ReserveEventInputs = {
      spendByCategoryByMonth: new Map([
        [
          "Fk",
          new Map([
            ["2026-05", 2500n],
            ["2026-06", 5000n],
          ]),
        ],
      ]),
      limitsByMonth: new Map([
        ["2026-05", new Map([["Fk", { plannedCents: 0n, cushionCents: 0n }]])],
        ["2026-06", new Map([["Fk", { plannedCents: 0n, cushionCents: 0n }]])],
      ]),
      cushionHistory: [],
      adjustmentsByCategory: new Map([
        [
          "Fk",
          [
            { deltaCents: 2800n, month: "2026-05" },
            { deltaCents: 3000n, month: "2026-06" },
          ],
        ],
      ]),
      categoryFlags: new Map([
        [
          "Fk",
          {
            reserveExcluded: false,
            archivedAt: null,
            archivedFrom: null,
            sortIndex: 0,
            name: "Fk",
          },
        ],
      ]),
      userDefinedCents: 0n,
      reservesEnabled: true,
      openMonth: "2026-06",
      budgetCurrency: "EUR",
    };
    const r = await run(inputs);
    expect(r.isOk()).toBe(true);
    if (!r.isOk()) return;
    const fk = r.value.positions.get("Fk")!;
    expect(fk.reserveCents).toBe(0n); // all €58 consumed
    expect(fk.usedCents).toBe(5800n);
    const may = fk.byMonth.get("2026-05")!;
    expect(may.usedCents).toBe(2500n); // May fully covered by its own €28
    expect(may.overspentCents).toBe(0n);
    const june = fk.byMonth.get("2026-06")!;
    expect(june.usedCents).toBe(3300n); // €3 carry + own €30
    expect(june.overspentCents).toBe(1700n);
  });

  it("closed-month adjust covers only its OWN month (golden final rows, openMonth=2026-07)", async () => {
    // FINAL state the full golden table collapses to, read with the open month
    // advanced to JULY (June closed). Month-scoped adjust + per-month attribution:
    //   • Grocery's July adjust (+100) finds NO July overspend (no July Grocery
    //     spend) → lands entirely in available reserve (R 100); June stays 2700/200
    //     (an adjust never spends reserve on a past month).
    //   • Housing's July adjust (+100) DOES cover July's own overspend (July spend
    //     1500 over the 1000 limit = 500 overage) → July used 100 / overspent 400,
    //     R 0; June stays locked at 1400/200 (NOT retro-covered).
    //   internal = 100 (G) + 0 (H) = 100, userDefined 3000, surplus 2900.
    const julyLimits = new Map([
      [G, { plannedCents: 40000n, cushionCents: 30000n }],
      [H, { plannedCents: 100000n, cushionCents: 25000n }],
    ]);
    const inputs: ReserveEventInputs = {
      spendByCategoryByMonth: new Map([
        [G, new Map([["2026-06", 330000n]])], // June 300 + 3000
        [
          H,
          new Map([
            ["2026-06", 260000n],
            ["2026-07", 150000n],
          ]),
        ], // June 2600 + July 1500
      ]),
      limitsByMonth: new Map([
        [
          "2026-06",
          new Map([
            [G, { plannedCents: 40000n, cushionCents: 30000n }],
            [H, { plannedCents: 100000n, cushionCents: 25000n }],
          ]),
        ],
        ["2026-07", julyLimits],
      ]),
      cushionHistory: [], // ends OFF
      adjustmentsByCategory: new Map([
        [
          G,
          [
            { deltaCents: 10000n, month: "2026-06" }, // to 100
            { deltaCents: 110000n, month: "2026-06" }, // to 1200
            { deltaCents: 150000n, month: "2026-06" }, // to 1500
            { deltaCents: 10000n, month: "2026-07" }, // to 100 (closed-month)
          ],
        ],
        [
          H,
          [
            { deltaCents: 30000n, month: "2026-06" }, // to 300
            { deltaCents: -5000n, month: "2026-06" }, // to 250
            { deltaCents: -25000n, month: "2026-06" }, // to 0
            { deltaCents: 40000n, month: "2026-06" }, // to 400
            { deltaCents: 100000n, month: "2026-06" }, // to 1000
            { deltaCents: 10000n, month: "2026-07" }, // to 100 (closed-month)
          ],
        ],
      ]),
      categoryFlags: new Map([
        [
          G,
          {
            reserveExcluded: false,
            archivedAt: null,
            archivedFrom: null,
            sortIndex: 0,
            name: "Grocery",
          },
        ],
        [
          H,
          {
            reserveExcluded: false,
            archivedAt: null,
            archivedFrom: null,
            sortIndex: 1,
            name: "Housing",
          },
        ],
      ]),
      userDefinedCents: 300000n,
      reservesEnabled: true,
      openMonth: "2026-07",
      budgetCurrency: "EUR",
    };
    const r = await run(inputs);
    expect(r.isOk()).toBe(true);
    if (!r.isOk()) return;
    const v = r.value;
    // Grocery July adjust → available (no July overspend); Housing July adjust →
    // covers July's own overspend (R 0).
    expect(v.positions.get(G)!.reserveCents).toBe(10000n); // 100
    expect(v.positions.get(H)!.reserveCents).toBe(0n); // covered July
    expect(v.internalCents).toBe(10000n); // 100 (G) + 0 (H)
    expect(v.userDefinedCents).toBe(300000n);
    expect(v.surplusCents).toBe(290000n); // 3000 − 100
    // June (closed) used + overspent UNCHANGED — never retro-covered by an adjust.
    const gJune = v.positions.get(G)!.byMonth.get("2026-06")!;
    expect(gJune.usedCents).toBe(270000n); // 2700
    expect(gJune.overspentCents).toBe(20000n); // 200
    const hJune = v.positions.get(H)!.byMonth.get("2026-06")!;
    expect(hJune.usedCents).toBe(140000n); // 1400
    expect(hJune.overspentCents).toBe(20000n); // 200
    // July (open) Housing: its own adjust covered 100 of the 500 overage.
    const hJuly = v.positions.get(H)!.byMonth.get("2026-07")!;
    expect(hJuly.usedCents).toBe(10000n); // 100
    expect(hJuly.overspentCents).toBe(40000n); // 400
  });

  it("a month is capped at the reserve available by its end (Fk: back-dated May txn → 28/22)", async () => {
    // Real Fk timeline (cents), openMonth June. limit 0; cushion off. adjust +28
    // (May); +30, +50 (June); spend 50 May, 61 June. Month-order: a month draws ONLY
    // from the reserve available by its own end, so the back-dated May txn is capped
    // at the €28 that existed by end of May → May 28 used / 22 overspent. The June
    // reserve (+30, +50) never flows back to May; June (current) draws from all it
    // has available. R = 28+30+50 − 28(May) − 61(June) = 19.
    const inputs: ReserveEventInputs = {
      spendByCategoryByMonth: new Map([
        [
          G,
          new Map([
            ["2026-05", 5000n],
            ["2026-06", 6100n],
          ]),
        ],
      ]),
      limitsByMonth: new Map([
        ["2026-05", new Map([[G, { plannedCents: 0n, cushionCents: 0n }]])],
        ["2026-06", new Map([[G, { plannedCents: 0n, cushionCents: 0n }]])],
      ]),
      cushionHistory: [],
      adjustmentsByCategory: new Map([
        [
          G,
          [
            { deltaCents: 2800n, month: "2026-05" },
            { deltaCents: 3000n, month: "2026-06" },
            { deltaCents: 5000n, month: "2026-06" },
          ],
        ],
      ]),
      categoryFlags: new Map([
        [
          G,
          {
            reserveExcluded: false,
            archivedAt: null,
            archivedFrom: null,
            sortIndex: 0,
            name: "Fk",
          },
        ],
      ]),
      userDefinedCents: 0n,
      reservesEnabled: true,
      openMonth: "2026-06",
      budgetCurrency: "EUR",
    };
    const r = await run(inputs);
    expect(r.isOk()).toBe(true);
    if (!r.isOk()) return;
    const v = r.value;
    const may = v.positions.get(G)!.byMonth.get("2026-05")!;
    const jun = v.positions.get(G)!.byMonth.get("2026-06")!;
    expect(may.usedCents, "May capped at end-of-May reserve (28)").toBe(2800n);
    expect(may.overspentCents, "May overspent").toBe(2200n);
    expect(jun.usedCents).toBe(6100n);
    expect(jun.overspentCents).toBe(0n);
    expect(
      v.positions.get(G)!.reserveCents,
      "June reserve never flowed to May",
    ).toBe(1900n);
    expect(v.internalCents).toBe(1900n);
  });

  it("surfaces a loader failure as err()", async () => {
    const loader: ReserveEventLoaderRepo = {
      async load() {
        throw new Error("budget_not_found");
      },
    };
    const r = await getReservePositions({ eventLoader: loader })({
      tenantId: TENANT,
      budgetId: BUDGET,
    });
    expect(r.isErr()).toBe(true);
    expect(r.isErr() && r.error.message).toBe("budget_not_found");
  });
});

describe("mapInputsToEvents — chronological mapping", () => {
  it("emits accrual ONLY for closed months, after that month's spend/limit", () => {
    const inputs = goldenInputs({
      spendByCategoryByMonth: new Map([
        [
          G,
          new Map([
            ["2026-05", 5000n],
            [OPEN, 180000n],
          ]),
        ],
      ]),
      limitsByMonth: new Map([
        [
          "2026-05",
          new Map([[G, { plannedCents: 20000n, cushionCents: 20000n }]]),
        ],
        [OPEN, new Map([[G, { plannedCents: 40000n, cushionCents: 30000n }]])],
      ]),
      adjustmentsByCategory: new Map(),
    });
    const events = mapInputsToEvents(inputs);
    // accrual exists for the closed month, never for the open month.
    const accrualMonths = events
      .filter((e) => e.type === "accrual")
      .map((e) => (e as { month: string }).month);
    expect(accrualMonths).toContain("2026-05");
    expect(accrualMonths).not.toContain(OPEN);
    // ordering: the 2026-05 accrual comes after its setLimit + spendDelta.
    const idxLimit = events.findIndex(
      (e) => e.type === "setLimit" && (e as any).month === "2026-05",
    );
    const idxSpend = events.findIndex(
      (e) => e.type === "spendDelta" && (e as any).month === "2026-05",
    );
    const idxAccrual = events.findIndex(
      (e) => e.type === "accrual" && (e as any).month === "2026-05",
    );
    expect(idxAccrual).toBeGreaterThan(idxLimit);
    expect(idxAccrual).toBeGreaterThan(idxSpend);
  });

  it("appends adjust deltas in stored order, BEFORE open-month spend, then setUserDefined last", () => {
    const events = mapInputsToEvents(goldenInputs());
    const adjustG = events.filter(
      (e) => e.type === "adjust" && (e as any).categoryId === G,
    ) as Array<{ deltaCents: bigint }>;
    expect(adjustG.map((e) => e.deltaCents)).toEqual([
      10000n,
      110000n,
      150000n,
    ]);
    // setUserDefined is the final event.
    expect(events[events.length - 1].type).toBe("setUserDefined");
    // adjusts are folded BEFORE the open-month spend so op1's capacity-bounded
    // draw consumes them (signed adjusts after spend over-cover → negative R).
    const idxSpend = events.findIndex(
      (e) => e.type === "spendDelta" && (e as any).month === OPEN,
    );
    const idxFirstAdjust = events.findIndex((e) => e.type === "adjust");
    expect(idxFirstAdjust).toBeLessThan(idxSpend);
  });
});
